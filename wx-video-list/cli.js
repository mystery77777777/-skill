#!/usr/bin/env node
'use strict';
/**
 * cli.js — 视频号作品列表 CLI (能力: wx_video_list, 自包含)。
 *
 * 提交视频号 ID 或昵称 → 服务端经上游代理分页取作品列表（每页 15 个）。
 *
 * 计费 (契约 §4): 1 页 = 3 点数（≈0.30 元/页，按 1 元 = 10 点）。含首次昵称解析成本：用户只给昵称时，服务端先花一次上游调用换视频号 ID（同昵称之后走缓存、零成本）；按实采页数退差；零作品不返还（上游已按次收费）。
 *
 * 输出规约 (对齐其它平台 skill): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
 *
 * 注: 数据由服务端代理到付费上游取回（不是本机抓取），所以不需要浏览器/插件，
 *     也不需要用户登录微信；失败口径见 SKILL.md「计费规则提示」。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ApiClient, BizError, allowInsecureTls, skillHeaders, warnSkillResponse } = require('./src/client');
const { loadConfig, saveConfig, resolveConfig, maskToken, configPaths, DEFAULT_BASE_URL } = require('./src/config');
const {
  UsageError, printOk, printFail, exitWithError, pollTask, parsePositiveNumber,
} = require('./src/output');
const { handleFatal } = require('./src/pay');

const NAME = 'wx-video-list';
const CAPABILITY = 'wx_video_list';
const VERSION = '1.0.0';
const DEFAULT_PRICE = 3;     // capability_prices 兜底价 (读不到时)
const DOWNLOAD_TIMEOUT_MS = 60000;

// batch = 多链接一次性提交, 无页数 / paged = 每条可带页数
const MODE = 'paged';
const MAX_PAGES = 10;     // 0 = 该能力不支持页数
const MAX_BATCH = 3;
const OUT_SUFFIX = 'wx_video_list';
const TITLE_TEXT = '视频号作品列表';
const INPUT_FLAG = 'ref';

// ---------------------------------------------------------------- 参数解析

const VALUE_FLAGS = new Set(['yuan', 'channel', 'file', 'interval', 'timeout', 'token', 'base-url',
  'access-token', 'out', INPUT_FLAG, 'skill-name', 'ai-entry']);
const BOOL_FLAGS = new Set(['wait', 'help', 'link', 'check', 'force', 'version']);
const MULTI_FLAGS = new Set(MODE === 'batch' && INPUT_FLAG !== 'keyword' ? [INPUT_FLAG] : []);

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    if (!arg.startsWith('--')) throw new UsageError(`未知参数: ${arg}`);
    let inline;
    const eq = arg.indexOf('=');
    if (eq > 2) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const name = arg.slice(2);
    if (MULTI_FLAGS.has(name)) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new UsageError(`缺少参数值: ${arg}`);
      const key = camel(name);
      if (!Array.isArray(opts[key])) opts[key] = [];
      opts[key].push(value);
    } else if (VALUE_FLAGS.has(name)) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new UsageError(`缺少参数值: ${arg}`);
      opts[camel(name)] = value;
    } else if (BOOL_FLAGS.has(name)) {
      if (inline !== undefined) throw new UsageError(`参数 ${arg} 不接受值`);
      opts[camel(name)] = true;
    } else {
      throw new UsageError(`未知参数: ${arg}`);
    }
  }
  const cmd = positional.shift() || '';
  return { cmd, args: positional, opts };
}

const USAGE = `视频号作品列表 CLI

用法: node cli.js <命令> [参数]

命令:
  register --link                   生成注册二维码/链接（推荐；注册即送 10 点数）
  register --check --access-token <串>  用户完成注册后确认并保存 token
  login --link                      生成登录二维码/链接（推荐）
  login --check --access-token <串> 用户完成授权后确认并保存 token
  submit --ref <输入> [--ref <输入> ...] [--file <名单>] [--pages N] [--wait] [--timeout 秒] [--force]
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>] [--timeout 秒]
                                    导出任务结果 CSV（保留 7 天）
  quota                             查询点数与个人信息
  pay                               扫码充值点数（终端出二维码，付完自动继续）
  logout                            登出当前账号
  config set base-url <url>         设置后端服务地址
  config set insecure true|false    忽略 HTTPS 证书校验（自签证书时开）
  config show                       查看当前配置（token 脱敏）
  version                           显示版本

支持的输入:
  v2_0600002310...@finder     （视频号 ID，最准、最省钱）
  美孚机油                      （昵称；重名会给默认匹配，且首次多花一次解析额度）
  ✗ 视频号主页链接：上游不认分享链接，请换成 ID 或昵称。

计费: 1 页 = 3 点数（≈0.30 元/页，按 1 元 = 10 点）。含首次昵称解析成本：用户只给昵称时，服务端先花一次上游调用换视频号 ID（同昵称之后走缓存、零成本）；按实采页数退差；零作品不返还（上游已按次收费）。

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）

AI 来源参数（所有 API 命令必填）: --skill-name <本Skill名> --ai-entry <AI工具标识>`;

// ---------------------------------------------------------------- 公共

function requireToken(cfg) {
  if (!cfg.token) throw new BizError(1002, '未登录：缺少 token');
}

async function cmdSessionLink(cfg, scene) {
  const client = new ApiClient({ baseUrl: cfg.baseUrl });
  const data = await client.createCliSession();
  const isRegister = scene === 'register';
  const pageUrl = cfg.baseUrl + (isRegister ? data.register_path : data.login_path);
  const qrUrl = cfg.baseUrl + (isRegister ? data.register_qr_path : data.qr_path);
  const action = isRegister ? '注册' : '登录';
  process.stderr.write(
    `请把下面这段${action}引导原样发给用户：\n` +
    '----\n' +
    (isRegister
      ? '需要先注册账号（注册即送 10 免费点数，不注册无法使用采集服务）。请用手机扫码或打开链接注册：\n\n'
      : '需要先登录。请用手机扫码或打开链接登录账号：\n\n') +
    `${action}方式（二选一）\n` +
    `二维码图片：${qrUrl}\n` +
    `${action}链接：${pageUrl}\n` +
    `access_token（${action}后校验用）：${data.access_token}\n` +
    `扫码/${action}完成后告诉我一声，我会执行校验并保存凭证：\n\n` +
    `node cli.js ${scene} --check --access-token "${data.access_token}"\n` +
    '----\n');
  printOk({
    qr_url: qrUrl,
    [isRegister ? 'register_url' : 'login_url']: pageUrl,
    access_token: data.access_token,
    expires_in: data.expires_in,
  });
}

async function cmdSessionCheck(cfg, opts, scene) {
  const action = scene === 'register' ? '注册' : '登录';
  const accessToken = opts.accessToken;
  if (!accessToken || !/^[0-9a-f]{16,64}$/.test(accessToken)) {
    throw new UsageError(`${scene} --check 需要 --access-token（${scene} --link 下发的十六进制串）`);
  }
  const client = new ApiClient({ baseUrl: cfg.baseUrl });
  const data = await client.checkCliSession(accessToken);
  if (data.status === 'pending') {
    printFail('LOGIN_PENDING', `用户尚未完成${action}，请提醒用户完成扫码/链接${action}后再执行本命令`);
    process.exit(2);
  }
  if (data.status !== 'ready' || !data.token) {
    printFail('LOGIN_EXPIRED', `${action}会话已过期或已使用，请重新执行 ${scene} --link 发起${action}`);
    process.exit(2);
  }
  saveConfig({ base_url: cfg.baseUrl, token: data.token });
  process.stderr.write(`${action}成功，token 已保存到配置文件\n`);
  printOk({ phone: data.phone, quota_balance: data.quota_balance });
}

// ---------------------------------------------------------------- 提交

/** 读能力价格 (免登录接口); 读不到按 DEFAULT_PRICE 兜底, 不阻塞提交。 */
async function fetchPrice(baseUrl) {
  try {
    const client = new ApiClient({ baseUrl });
    const data = await client.request('GET', '/platform/capabilities');
    const cap = ((data && data.items) || []).find((c) => c.name === CAPABILITY);
    if (cap && Number(cap.price) > 0) return { price: Number(cap.price), cap };
    return { price: DEFAULT_PRICE, cap: null };
  } catch {
    return { price: DEFAULT_PRICE, cap: null };
  }
}

function collectRefs(opts) {
  const key = camel(INPUT_FLAG);
  let refs = Array.isArray(opts[key]) ? opts[key].slice() : [];
  if (opts[key] && !Array.isArray(opts[key])) refs = [opts[key]];
  if (opts.file) {
    let text;
    try {
      text = fs.readFileSync(opts.file, 'utf8');
    } catch (e) {
      throw new UsageError(`读不到 --file 指定的文件: ${opts.file}（${e.message}）`);
    }
    refs.push(...text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
  }
  return refs;
}

const RE_V2 = /^v2_[0-9A-Za-z]+@finder$/;

/** 口径对齐服务端 parse_video_ref：v2_name 直用，其余当昵称（服务端负责换 ID）。 */
function parseRef(raw) {
  const v = String(raw || '').trim();
  if (!v) return { ok: false, reason: '请填写视频号 ID 或昵称' };
  if (RE_V2.test(v)) return { ok: true, key: v, payload: { ref: v } };
  if (v.length > 64) return { ok: false, reason: '视频号昵称过长（最多 64 字）' };
  return { ok: true, key: v, payload: { ref: v } };
}

function validateRefs(refs, opts) {
  const flag = `--${INPUT_FLAG}`;
  if (!refs.length) {
    throw new UsageError(`submit 需要 ${flag} <输入>${MODE === 'batch' ? '（可重复）' : ''}`
      + ' 或 --file <名单文件>');
  }
  const problems = [];
  const parsed = [];
  const seen = new Set();
  let dropped = 0;
  for (const r of refs) {
    const p = parseRef(r);
    if (!p.ok) { problems.push(`${r}：${p.reason}`); continue; }
    if (seen.has(p.key)) { dropped += 1; continue; }
    seen.add(p.key);
    parsed.push(p);
  }
  if (problems.length) {
    throw new UsageError(`以下输入不合法（未提交、未扣费）：\n  - ${problems.join('\n  - ')}`);
  }
  if (dropped > 0) {
    process.stderr.write(`[dedupe] 名单里有 ${dropped} 条重复输入，已合并，不重复扣费\n`);
  }
  if (parsed.length > MAX_BATCH) {
    throw new UsageError(`单次最多 ${MAX_BATCH} 条（本次 ${parsed.length} 条），请拆批提交`);
  }
  let pages = 1;
  if (MAX_PAGES > 0) {
    pages = parseInt(opts.pages === undefined ? '1' : String(opts.pages), 10);
    if (!Number.isFinite(pages) || pages < 1 || pages > MAX_PAGES) {
      throw new UsageError(`--pages 取值 1~${MAX_PAGES}（本次 ${opts.pages}）`);
    }
  }
  return { parsed, pages };
}

function buildPayload(p, pages) {
  return { ...p.payload, pages };
}

async function cmdSubmit(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const { parsed, pages } = validateRefs(collectRefs(opts), opts);
  const { price } = await fetchPrice(cfg.baseUrl);
  const unitsPerItem = MAX_PAGES > 0 ? pages : 1;
  const estimatedPoints = parsed.length * unitsPerItem * price;
  const items = parsed.map((p, i) => ({
    id: i + 1,
    payload: buildPayload(p, pages, opts),
  }));
  // 幂等键按参数派生: 同参数重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = parsed.map((p) => JSON.stringify(buildPayload(p, pages, opts))).join('\n')
    + `|${price}` + (opts.force ? `|#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);

  process.stderr.write(
    `提交 ${items.length} 条${TITLE_TEXT}任务`
    + (MAX_PAGES > 0 ? `（每条 ${pages} 页）` : '') + '\n' +
    `计费: 预扣 ${items.length}×${unitsPerItem}×${price}=${estimatedPoints} 点, ` +
    `按实采退差 (幂等键 ${idempotencyKey}${opts.force ? ', force' : ''})...\n`);

  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(CAPABILITY, items, idempotencyKey, !!opts.force);

  const enriched = { ...data, estimated_points: estimatedPoints, price_per_unit: price };
  if (!opts.wait) {
    printOk(enriched);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待服务端执行`
    + `（上游代理，通常几条到几十秒）...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 3),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 300),
  });
  process.stderr.write(
    '任务完成，请查看 result 里的 collected_count / settle_charged(实收点数) / '
    + 'refunded_diff(退差点数) 如实汇报给用户。\n');
  printOk(task);
}

async function cmdQuery(args, opts) {
  const taskId = args[0];
  if (!taskId) throw new UsageError('query 需要 task_id 参数');
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  if (!opts.wait) {
    printOk(await client.getTask(taskId));
    return;
  }
  const task = await pollTask(client, taskId, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 3),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 300),
  });
  printOk(task);
}

async function cmdExport(args, opts) {
  const taskId = args[0];
  if (!taskId) throw new UsageError('export 需要 task_id 参数');
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });

  if (opts.wait) {
    process.stderr.write(`等待任务 ${taskId} 完成...\n`);
    await pollTask(client, taskId, {
      intervalSec: parsePositiveNumber(opts.interval, 'interval', 3),
      timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 300),
    });
  }

  const created = await client.createExport(taskId);
  if (!opts.wait) {
    printOk(created);
    return;
  }
  process.stderr.write(`导出任务已创建 export_id=${created.export_id}，等待生成...\n`);
  const timeoutSec = 300;
  const deadline = Date.now() + timeoutSec * 1000;
  let info;
  for (;;) {
    info = await client.getExport(created.export_id);
    if (info.status !== 'pending' && info.status !== 'running') break;
    if (Date.now() + 1000 > deadline) {
      printFail('TIMEOUT', `等待导出超时（${timeoutSec}s），导出仍为 ${info.status} 状态，可稍后重试 export ${taskId}`);
      process.exit(5);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (info.status !== 'done') {
    printFail('EXPORT_FAILED', `导出未完成 (status=${info.status}), 请稍后重试`);
    process.exit(5);
  }
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/platform/exports/${encodeURIComponent(info.export_id)}/file`,
      { headers: { Authorization: `Bearer ${cfg.token}`, ...skillHeaders() }, signal: dlCtrl.signal });
    warnSkillResponse(res);
    if (!res.ok) {
      printFail('EXPORT_FAILED', `下载失败 HTTP ${res.status}`);
      process.exit(5);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    printFail('EXPORT_FAILED', err && err.name === 'AbortError'
      ? `下载超时（${DOWNLOAD_TIMEOUT_MS / 1000}s），请检查网络后重试 export ${taskId}`
      : `下载失败: ${err && err.message ? err.message : err}`);
    process.exit(5);
  } finally {
    clearTimeout(dlTimer);
  }
  const out = opts.out || `${taskId}_${OUT_SUFFIX}.csv`;
  try {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  } catch { /* 目录已存在 */ }
  if (fs.existsSync(out)) {
    process.stderr.write(`[warn] 目标文件已存在，将覆盖: ${out}\n`);
  }
  fs.writeFileSync(out, buf);
  process.stderr.write(`已下载: ${out}\n`);
  printOk({ export_id: info.export_id, file: out, size: buf.length });
}

async function cmdQuota(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  printOk(await client.profile());
}

async function cmdLogout(opts) {
  const cfg = resolveConfig(opts);
  if (!cfg.token) throw new BizError(1002, '未登录：本地没有已保存的 token');
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  try {
    await client.logout();
  } catch (err) {
    process.stderr.write(`服务端登出异常（已忽略，继续清除本地 token）: ${err.message}\n`);
  }
  saveConfig({ token: '' });
  process.stderr.write('已登出，本地 token 已清除；可执行 login --link 登录其他账号\n');
  printOk({ logged_out: true });
}

async function cmdConfig(args, opts) {
  const sub = args[0];
  if (sub === 'set' && args[1] === 'base-url') {
    const url = args[2];
    if (!url || !/^https?:\/\//.test(url)) throw new UsageError('config set base-url 需要 http(s):// 开头的地址');
    saveConfig({ base_url: url.replace(/\/+$/, '') });
    process.stderr.write(`base_url 已保存到 ${configPaths.configPath}\n`);
    printOk({ base_url: loadConfig().base_url });
    return;
  }
  if (sub === 'set' && args[1] === 'insecure') {
    const v = args[2];
    if (v !== 'true' && v !== 'false') throw new UsageError('config set insecure 需要 true 或 false');
    saveConfig({ insecure: v === 'true' });
    process.stderr.write(`insecure 已保存到 ${configPaths.configPath}\n`);
    printOk({ insecure: loadConfig().insecure === true });
    return;
  }
  if (sub === 'show') {
    const cfg = resolveConfig(opts);
    printOk({
      base_url: cfg.baseUrl,
      insecure: cfg.insecure,
      token: maskToken(cfg.token),
      config_path: configPaths.configPath,
    });
    return;
  }
  throw new UsageError('config 仅支持: config set base-url <url> / config set insecure true|false / config show');
}

// ---------------------------------------------------------------- 入口

async function main() {
  const { cmd, args, opts } = parseArgs(process.argv.slice(2));
  if (opts.version) {
    printOk({ name: NAME, version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: NAME, version: VERSION, capability: CAPABILITY });
    case 'register':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'register');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'register');
      throw new UsageError('register 仅支持 --link / --check (终端注册会被 2003 拒绝)');
    case 'login':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'login');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'login');
      throw new UsageError('login 仅支持 --link / --check (终端登录会被 2003 拒绝)');
    case 'submit': return cmdSubmit(opts);
    case 'query': return cmdQuery(args, opts);
    case 'export': return cmdExport(args, opts);
    case 'quota': return cmdQuota(opts);
    case 'pay': {
      // 主动充值: 建单 → 终端二维码 → (交互)等到账
      const { rechargeFlow } = require('./src/pay');
      const res = await rechargeFlow({ yuan: opts.yuan, channel: opts.channel });
      return printOk({
        order_no: res.order.order_no, points: res.order.points,
        status: res.order.status, paid: !res.pending, pay_url: res.payUrl,
      });
    }
    case 'logout': return cmdLogout(opts);
    case 'config': return cmdConfig(args, opts);
    default: throw new UsageError(`未知命令: ${cmd}`);
  }
}

main().catch((e) => handleFatal(e, main, { usage: USAGE }));
