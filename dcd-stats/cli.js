#!/usr/bin/env node
'use strict';
/**
 * cli.js — 懂车帝互动数 CLI (能力: dcd_stats, 自包含)。
 *
 * 输入懂车帝链接 → 经网关派发给已登录懂车帝的采集节点（插件端），
 * 采集点赞数 / 评论数 / 观看(阅读)数 / 分享数，作为一次快照落库。
 *
 * 支持三类链接（可混填，单次最多 20 条）:
 * - 资讯文章  www.dongchedi.com/article/<id>
 * - 视频      www.dongchedi.com/video/<id>
 * - 车友圈    www.dongchedi.com/ugc/article/<id>（UGC 动态，也可能是视频帖）
 *
 * ★ 同一数字 ID 的 /article/<id> 可能被服务端 302 到 /ugc/article/<id>，
 *   真实类型以采集节点打开的**最终地址**为准（落库 source_type 由节点校正）。
 * ★ 互动数口径的三条硬规则（2026-11-04 真机实测）:
 *   1) 观看数取 `read_count` 与 `watch_count` 中**非空且较大**者 —— 车友圈页
 *      两个字段并存且 watch_count 常为 0，直接取 watch_count 会丢真实阅读量；
 *   2) `share_count` **只有车友圈有**，资讯/视频落库为空（不写 0，否则趋势失真）；
 *   3) 指标全缺失才算失败（全额返还）；出现 0 是有效数据，照常计费。
 * ★ 互动数不含正文/作者/图片：正文类字段请用「懂车帝内容详情」能力（dcd-detail）。
 *
 * 计费 (契约 §4): 1 条链接 = 1 点数; 实采恒 1 条 → 无差值可退。
 * 内容不存在/已删除不返还 (业务侧); 抓取异常/超时全额返还。
 *
 * 输出规约 (对齐 sohu-detail): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
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

const CAPABILITY = 'dcd_stats';
const VERSION = '1.0.0';
const DEFAULT_PRICE = 1;      // capability_prices 兜底价 (读不到时)
const DOWNLOAD_TIMEOUT_MS = 60000;

const MAX_BATCH = 20;         // 单次批量上限 (服务端 dcd_stats.MAX_ITEMS)

// 链接识别口径（必须与服务端 app/capabilities/_dcd_engine.parse_ref 逐字一致）
//   _HOSTS = ("www.dongchedi.com", "dongchedi.com", "m.dongchedi.com")
//   _RE_ARTICLE = r"^/(?:ugc/)?article/(\d{6,})$"
//   _RE_VIDEO   = r"^/(?:ugc/)?video/(\d{6,})$"
//   path 先 rstrip("/")；/ugc/ 前缀 → source_type=ugc；归一化保留原路径
const HOSTS = new Set(['www.dongchedi.com', 'dongchedi.com', 'm.dongchedi.com']);
const RE_ARTICLE = /^\/(?:ugc\/)?article\/(\d{6,})$/;
const RE_VIDEO = /^\/(?:ugc\/)?video\/(\d{6,})$/;

const SOURCE_TEXT = { article: '资讯文章', video: '视频', ugc: '车友圈' };

// ---------------------------------------------------------------- 参数解析

const VALUE_FLAGS = new Set(['yuan', 'channel', 'file', 'interval', 'timeout', 'token', 'base-url', 'access-token', 'out', 'skill-name', 'ai-entry']);
const BOOL_FLAGS = new Set(['wait', 'help', 'link', 'check', 'force', 'version']);
const MULTI_FLAGS = new Set(['url']);

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

const USAGE = `懂车帝互动数 CLI

用法: node cli.js <命令> [参数]

命令:
  register --link                   生成注册二维码/链接（推荐；注册即送 10 点数）
  register --check --access-token <串>  用户完成注册后确认并保存 token
  login --link                      生成登录二维码/链接（推荐）
  login --check --access-token <串> 用户完成授权后确认并保存 token
  submit --url <链接> [--url <链接> ...] [--file <名单文件>] [--wait] [--timeout 秒] [--force]
                                    提交互动数采集任务（单次最多 20 条；
                                    --url 可重复，--file 每行一个链接，可混用；
                                    三类链接可以混填；--wait 等待结果, 默认超时 300s）
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>] [--timeout 秒]
                                    导出任务结果 CSV（保留 7 天；--wait 等待生成, 默认超时 300s）
  quota                             查询点数与个人信息
  pay                               扫码充值点数（终端出二维码，付完自动继续）
  logout                            登出当前账号
  config set base-url <url>         设置后端服务地址
  config set insecure true|false    忽略 HTTPS 证书校验（自签证书时开）
  config show                       查看当前配置（token 脱敏）
  version                           显示版本

支持的链接（三类可混填）:
  资讯文章  https://www.dongchedi.com/article/7704153144573461016
  视频      https://www.dongchedi.com/video/7704146197522678297
  车友圈    https://www.dongchedi.com/ugc/article/7703440576271893017
            （/ugc/video/<id> 也收；m.dongchedi.com 与不带 www 的域名同口径）
  其它链接（用户主页 / 搜索结果 / 车系页 / 其它站点）一律拒绝，不扣费。

采什么: 点赞数 digg_count / 评论数 comment_count / 观看(阅读)数 watch_count /
        分享数 share_count（**仅车友圈有**，资讯与视频为空）。
        观看数取 read_count 与 watch_count 中非空较大者（车友圈两字段并存）。
计费: 1 条链接 = 1 点数；指标全缺失才全额返还；内容不存在/已删除不返还。
说明: 互动数是「采集当时」的快照；不含正文/作者/图片，那些请用「懂车帝内容详情」能力。
      采集需要采集节点已登录懂车帝；未登录会明确报错并全额返还。

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
  const refs = Array.isArray(opts.url) ? opts.url.slice() : [];
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

/** 按服务端口径归一化链接：返回 { ok, url, source_type, content_id, key, reason }。 */
function parseRef(raw) {
  const v = String(raw || '').trim();
  if (!v) return { ok: false, reason: '链接不能为空' };
  // 与服务端 startswith("http") 逐字一致（大小写敏感）：大写的 HTTP:// 两边都判不合法
  const url = /^http/.test(v) ? v : `https://${v}`;
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: `链接格式无法解析: ${v.slice(0, 80)}` };
  }
  const host = (u.hostname || '').toLowerCase();
  if (!HOSTS.has(host)) {
    return {
      ok: false,
      reason: `只支持懂车帝链接（www.dongchedi.com/article|video/<id>、`
        + `www.dongchedi.com/ugc/article/<id>）: ${v.slice(0, 80)}`,
    };
  }
  // 与服务端一致：path 先 rstrip("/")，/ugc/ 前缀判 ugc，归一化保留原路径
  const p = (u.pathname || '').replace(/\/+$/, '');
  const isUgc = p.startsWith('/ugc/');

  let m = p.match(RE_ARTICLE);
  if (m) {
    return {
      ok: true,
      source_type: isUgc ? 'ugc' : 'article',
      content_id: m[1],
      url: `https://www.dongchedi.com${p}`,
      // ★同 ID 的 /article/X 与 /ugc/article/X 是同一内容（前者会 302 到后者），
      //   key 只带 content_id，避免同一内容被当成两条、重复扣点
      key: `dcd_${m[1]}`,
    };
  }
  m = p.match(RE_VIDEO);
  if (m) {
    return {
      ok: true,
      source_type: isUgc ? 'ugc' : 'video',
      content_id: m[1],
      url: `https://www.dongchedi.com${p}`,
      key: `dcd_${m[1]}`,
    };
  }
  return {
    ok: false,
    reason: '链接里没有可识别的内容 ID（支持 /article/<id>、/video/<id>、'
      + `/ugc/article/<id>）: ${v.slice(0, 80)}`,
  };
}

function validateRefs(refs) {
  if (!refs.length) throw new UsageError('submit 需要 --url <链接>（可重复）或 --file <名单文件>');
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
    throw new UsageError(`以下链接不合法（未提交、未扣费）：\n  - ${problems.join('\n  - ')}`);
  }
  if (dropped > 0) {
    process.stderr.write(`[dedupe] 名单里有 ${dropped} 条重复内容（同一内容 ID），已合并，不重复扣费\n`);
  }
  if (parsed.length > MAX_BATCH) {
    throw new UsageError(`单次最多 ${MAX_BATCH} 条（本次 ${parsed.length} 条），请拆批提交`);
  }
  return parsed;
}

async function cmdSubmit(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const parsed = validateRefs(collectRefs(opts));
  const { price } = await fetchPrice(cfg.baseUrl);
  const estimatedPoints = parsed.length * price;
  const items = parsed.map((p, i) => ({
    id: i + 1,
    payload: { url: p.url },
  }));
  // 幂等键按参数派生: 同参数重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = parsed.map((p) => p.url).join('\n') + `|${price}`
    + (opts.force ? `|#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);

  const byType = parsed.reduce((acc, p) => {
    acc[p.source_type] = (acc[p.source_type] || 0) + 1;
    return acc;
  }, {});
  const mix = Object.entries(byType)
    .map(([k, n]) => `${SOURCE_TEXT[k] || k} ${n}`)
    .join(' + ');

  process.stderr.write(
    `提交 ${items.length} 条懂车帝互动数采集任务（${mix}）\n` +
    `计费: 预扣 ${items.length}×${price}=${estimatedPoints} 点 (每条 ${price} 点), ` +
    `内容不存在/已删除不返还 ` +
    `(幂等键 ${idempotencyKey}${opts.force ? ', force' : ''})...\n` +
    '提示: 采集由已登录懂车帝的节点执行，节点未登录会报错并全额返还。\n');

  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(CAPABILITY, items, idempotencyKey, !!opts.force);

  const enriched = { ...data, estimated_points: estimatedPoints, price_per_unit: price };
  if (!opts.wait) {
    printOk(enriched);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待节点回传（每条约 5-20 秒）...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 3),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 300),
  });
  process.stderr.write(
    `任务完成: status=${task.status}，实采 ${(task.items && task.items[0] && task.items[0].result
      && task.items[0].result.collected_count) || 0} 条，` +
    '请查看 result 里的 settle_charged(实收点数)/refunded_diff(退差点数) 如实汇报给用户。\n');
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
  const out = opts.out || `${taskId}_dcd_stats.csv`;
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
    printOk({ name: 'dcd-hudongshu', version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: 'dcd-hudongshu', version: VERSION, capability: CAPABILITY });
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
