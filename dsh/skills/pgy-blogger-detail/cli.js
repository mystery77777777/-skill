#!/usr/bin/env node
'use strict';
/**
 * cli.js — 蒲公英博主详情 CLI (能力: pgy_blogger_detail, 自包含)。
 *
 * 输入蒲公英博主详情链接 / 小红书博主主页链接 / 24 位博主 ID →
 * 平台调度内网浏览器节点按「基础信息 + 数据总览 + 粉丝分析 + 粉丝画像 +
 * 数据表现 + 合作单价」六组接口采集, 服务侧拍平成一张宽表。
 *
 * 计费 (契约 §4): 一位博主 = 4 点数; 预扣单位数 = 提交条数, 实采恒 1 → 无差值可退。
 * 博主不存在/不可见不返还 (业务侧); 登录态或签名失效全额返还。
 *
 * 档位:
 *   标准档 (默认)  只跑 noteType=3,dateType=1,business=0 一组数据表现 (约 6 次接口);
 *   深度档 --deep  12 组全跑 (约 28 次接口), 全量原文落 deep_json, 价格不变。
 *
 * 博主引用口径 (与服务端 parse_blogger_ref 一致, 全程离线不打接口):
 *   - 24 位字母数字 ID 直接受理;
 *   - 任意含 24 位字母数字段的链接 (蒲公英 detail / 小红书博主主页) 受理;
 *   - 纯字母数字但长度不是 24 → 直接拒 (防止从长串里误截)。
 *
 * 输出规约 (对齐 xhs-dpt): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
 *
 * 命令: version / register --link|--check / login --link|--check / submit /
 *       query / quota / export / logout / config
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

const CAPABILITY = 'pgy_blogger_detail';
const VERSION = '1.0.1';
const MIN_BATCH = 1;
const MAX_BATCH = 20;         // 单次批量上限 (服务端 pgy_blogger_detail.max_items)
const PRICE_PER_BLOGGER = 4;  // capability_prices 兜底价 (读不到时)
const DOWNLOAD_TIMEOUT_MS = 60000;

// 24 位字母数字 = 蒲公英/小红书 userId (路径参数, 不是查询串)
const ID_RE = /[0-9a-zA-Z]{24}/;

// ---------------------------------------------------------------- 参数解析

const VALUE_FLAGS = new Set(['yuan', 'channel', 'file', 'interval', 'timeout', 'token', 'base-url', 'access-token', 'out', 'skill-name', 'ai-entry']);
const MULTI_FLAGS = new Set(['url']);
const BOOL_FLAGS = new Set(['wait', 'help', 'link', 'check', 'force', 'version', 'deep']);

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
    if (VALUE_FLAGS.has(name)) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new UsageError(`缺少参数值: ${arg}`);
      opts[camel(name)] = value;
    } else if (MULTI_FLAGS.has(name)) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) throw new UsageError(`缺少参数值: ${arg}`);
      if (!opts[camel(name)]) opts[camel(name)] = [];
      opts[camel(name)].push(value);
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

const USAGE = `蒲公英博主详情 CLI (采博主基础信息/数据总览/粉丝分析/粉丝画像/数据表现/合作单价)

用法: node cli.js <命令> [参数]

命令:
  register --link                   生成注册二维码/链接（推荐；注册即送 10 点数）
  register --check --access-token <串>  用户完成注册后确认并保存 token
  login --link                      生成登录二维码/链接（推荐）
  login --check --access-token <串> 用户完成授权后确认并保存 token
  submit --url <链接> [--url ...] | --file <路径> [--deep] [--wait] [--timeout 秒] [--force]
                                    提交博主详情采集任务（单次最多 ${MAX_BATCH} 位；
                                    受理蒲公英博主详情链接 / 小红书博主主页链接 / 24 位博主 ID）
                                    --deep 深度档（12 组数据表现全跑, 价格不变, 耗时约 3-5 倍）
                                    --force 跳过 24h 内容去重强制重提；
                                    --wait 等待结果, 默认超时 600s）
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

计费: 一位博主 = ${PRICE_PER_BLOGGER} 点数；博主不存在/不可见不返还，登录或签名失效全额返还。

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

// ---------------------------------------------------------------- 博主引用

function collectRefs(opts) {
  const refs = [...(opts.url || [])];
  if (opts.file) {
    let content;
    try {
      content = fs.readFileSync(opts.file, 'utf8');
    } catch {
      throw new UsageError(`无法读取文件: ${opts.file}`);
    }
    for (const line of content.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      refs.push(s);
    }
  }
  if (refs.length < MIN_BATCH) {
    throw new UsageError('请通过 --url 或 --file 提供至少 1 个博主（蒲公英博主详情链接 / 小红书博主主页链接 / 24 位博主 ID）');
  }
  return refs;
}

/** 批量上限检查放在去重之后: 21 条里若含重复, 折叠成 20 位就不该拒单。 */
function checkBatchSize(n) {
  if (n > MAX_BATCH) {
    throw new UsageError(`超出单次批量上限（${MAX_BATCH} 位），当前 ${n} 位`);
  }
}

/**
 * 博主引用校验 (口径对齐服务端 app/capabilities/_pgy_engine.parse_blogger_ref):
 *  1) 纯 24 位字母数字 → 受理;
 *  2) 含 24 位字母数字段的链接 → 受理;
 *  3) 纯字母数字但长度≠24 → 拒 (ID 打错位, 不能从长串里误截);
 *  4) 空 / 超长 / 既非 ID 也非链接 → 拒。
 * 返回 {ok, problems}; 不合法项一次性汇总给用户, 不扣费。
 */
function validateRefs(refs) {
  const problems = [];
  refs.forEach((raw, i) => {
    const no = i + 1;
    if (typeof raw !== 'string' || raw.length === 0) {
      problems.push(`第 ${no} 条为空`);
      return;
    }
    if (raw.length > 1024) {
      problems.push(`第 ${no} 条过长（上限 1024 字符）: ${raw.slice(0, 80)}`);
      return;
    }
    const s = raw.trim();
    if (/^[0-9a-zA-Z]{24}$/.test(s)) return;      // 裸 ID
    if (!s.includes('/')) {
      if (/^[0-9a-zA-Z]+$/.test(s)) {
        problems.push(`第 ${no} 条博主 ID 长度不对（应为 24 位, 实际 ${s.length} 位）: ${s}`);
      } else {
        problems.push(`第 ${no} 条无法识别（需 24 位博主 ID 或博主详情页链接）: ${s.slice(0, 80)}`);
      }
      return;
    }
    if (!ID_RE.test(s)) {
      problems.push(`第 ${no} 条链接里找不到 24 位博主 ID（例: .../blogger-detail/<24位ID>）: ${s.slice(0, 80)}`);
    }
  });
  return problems;
}

/** 从博主引用里取 24 位 ID (服务端会再解一次, 这里只用于本地提示)。 */
function extractId(raw) {
  const s = String(raw || '').trim();
  if (/^[0-9a-zA-Z]{24}$/.test(s)) return s;
  const m = ID_RE.exec(s);
  return m ? m[0] : '';
}

/**
 * 按 24 位 ID 去重 (保序)。
 * 必要性: 服务侧按 blogger_user_id 落库去重 (同一博主只留一行), 但「条目」是逐条计费的
 * —— 名单里同一博主出现两次 (裸 ID + 主页链接) 会被扣两次 3 点却只落一行。
 * 这里在提交前按 ID 折叠, 直接省掉重复扣费。
 */
function dedupeRefs(refs) {
  const seen = new Map();
  let dropped = 0;
  for (const ref of refs) {
    const id = extractId(ref);
    if (id && seen.has(id)) {
      dropped += 1;
      continue;
    }
    if (id) seen.set(id, ref);
    else seen.set(`__raw_${seen.size}`, ref); // 无 ID 的异常项留给校验报错
  }
  return { refs: [...seen.values()], dropped };
}

// ---------------------------------------------------------------- 提交

/** 读能力价格 (免登录接口); 读不到按 3 兜底, 不阻塞提交。 */
async function fetchPrice(baseUrl) {
  try {
    const client = new ApiClient({ baseUrl });
    const data = await client.request('GET', '/platform/capabilities');
    const cap = ((data && data.items) || []).find((c) => c.name === CAPABILITY);
    if (cap && Number(cap.price) > 0) return { price: Number(cap.price), cap };
    return { price: PRICE_PER_BLOGGER, cap: null };
  } catch {
    return { price: PRICE_PER_BLOGGER, cap: null };
  }
}

async function cmdSubmit(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  let refs = collectRefs(opts);
  const problems = validateRefs(refs);
  if (problems.length) {
    throw new UsageError(`以下博主引用不合法（未提交、未扣费）：\n  - ${problems.join('\n  - ')}`);
  }
  const deduped = dedupeRefs(refs);
  refs = deduped.refs;
  if (deduped.dropped > 0) {
    process.stderr.write(`[dedupe] 名单里有 ${deduped.dropped} 条重复博主（同一 24 位 ID），已合并，不重复扣费\n`);
  }
  checkBatchSize(refs.length);

  const deep = opts.deep === true;
  const items = refs.map((ref, i) => ({
    id: i + 1,
    payload: { blogger_url: ref, deep: deep ? 1 : 0 },
  }));

  const { price } = await fetchPrice(cfg.baseUrl);
  const estimatedPoints = items.length * price;

  // 幂等键按内容派生: 同批内容重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = refs.join('\n') + `|deep=${deep ? 1 : 0}`
    + (opts.force ? `\n#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);

  const ids = refs.map((r) => extractId(r)).filter(Boolean);
  process.stderr.write(
    `提交 ${items.length} 位博主详情采集任务（档位=${deep ? '深度档 12 组' : '标准档 1 组'}，` +
    `博主 ID: ${ids.join(', ') || '(链接内解析)'}）\n` +
    `计费: 预扣 ${items.length}×${price}=${estimatedPoints} 点 (每位 ${price} 点), ` +
    `博主不存在/不可见不返还 (幂等键 ${idempotencyKey}${opts.force ? ', force' : ''})...\n`);

  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(CAPABILITY, items, idempotencyKey, !!opts.force);

  const enriched = { ...data, estimated_points: estimatedPoints, price_per_unit: price };
  if (!opts.wait) {
    printOk(enriched);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待节点采集（每位约 5-20s）...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
  });
  process.stderr.write(
    `任务完成: status=${task.status}，实采 ${(task.items && task.items[0] && task.items[0].result
      && task.items[0].result.collected_count) || 0} 位博主，` +
    `请查看 result 里的 settle_charged(实收点数)/refunded_diff(退差点数) 如实汇报给用户。\n`);
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
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
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
      intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
      timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
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
  const out = opts.out || `${taskId}_pgy_blogger_detail.csv`;
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
    printOk({ name: 'pgy-blogger-detail', version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: 'pgy-blogger-detail', version: VERSION, capability: CAPABILITY });
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
