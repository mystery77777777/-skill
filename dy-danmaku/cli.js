#!/usr/bin/env node
'use strict';
/** 抖音弹幕分步采集 CLI：start 免费，step 每个成功接口响应 1 点（含空页）。 */
const fs = require('fs');
const path = require('path');
const { ApiClient, BizError, allowInsecureTls, skillHeaders, warnSkillResponse } = require('./src/client');
const { loadConfig, saveConfig, resolveConfig, maskToken, configPaths, DEFAULT_BASE_URL } = require('./src/config');
const { UsageError, printOk, printFail, exitWithError, parsePositiveNumber } = require('./src/output');
const { handleFatal } = require('./src/pay');

const CAPABILITY = 'dy_danmaku';
const VERSION = '1.0.0';
const DOWNLOAD_TIMEOUT_MS = 60000;
const VALUE_FLAGS = new Set(['yuan', 'channel', 'session', 'url', 'page', 'page-size', 'status',
  'token', 'base-url', 'access-token', 'out', 'skill-name', 'ai-entry']);
const BOOL_FLAGS = new Set(['help', 'link', 'check', 'version']);

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function parseArgs(argv) {
  const opts = {}, positional = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('-')) { positional.push(arg); continue; }
    if (!arg.startsWith('--')) throw new UsageError(`未知参数: ${arg}`);
    let inline;
    const eq = arg.indexOf('=');
    if (eq > 2) { inline = arg.slice(eq + 1); arg = arg.slice(0, eq); }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = inline !== undefined ? inline : argv[i + 1];
      if (value === undefined || value.startsWith('--')) opts[camel(name)] = true;
      else { if (inline === undefined) i++; opts[camel(name)] = value; }
    } else if (BOOL_FLAGS.has(name)) {
      if (inline !== undefined) throw new UsageError(`参数 ${arg} 不接受值`);
      opts[camel(name)] = true;
    } else throw new UsageError(`未知参数: ${arg}`);
  }
  return { cmd: positional.shift() || '', args: positional, opts };
}

const USAGE = `抖音视频弹幕分步采集 CLI（每个成功请求 1 点，含空页）

用法: node cli.js <命令> [参数]
  start --url <视频链接>              免费建立会话，支持视频直链、精选 modal_id 链接和短链
  step --session <id> --page          采集下一时间段（1 点；成功空页也收费）
  status --session <id>               查询会话状态与余额（免费）
  danmakus --session <id> [--page N] [--page-size N]
                                      拉取已采弹幕（免费）
  export --session <id> [--out 文件]   导出 CSV（免费）
  finish --session <id>               结束会话并释放节点（免费）
  sessions [--status active] [--page N]
                                      列出自己的会话（免费）
  register --link / register --check --access-token <串>
  login --link / login --check --access-token <串>
  quota / pay / logout
  config set base-url <url> / config set insecure true|false / config show
  version

全局参数: --token <token> --base-url <url>（默认 ${DEFAULT_BASE_URL}）
AI 来源参数（所有 API 命令必填）: --skill-name <本Skill名> --ai-entry <AI工具标识>`;

function requireToken(cfg) { if (!cfg.token) throw new BizError(1002, '未登录：缺少 token'); }
function requireSessionId(opts) {
  const sid = opts.session;
  if (!sid || !/^[0-9a-f]{32}$/.test(sid)) throw new UsageError('需要 --session <32位会话id>');
  return sid;
}
function clientFor(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  return new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

async function cmdSessionLink(cfg, scene) {
  const client = new ApiClient({ baseUrl: cfg.baseUrl });
  const data = await client.createCliSession();
  const isRegister = scene === 'register';
  const pageUrl = cfg.baseUrl + (isRegister ? data.register_path : data.login_path);
  const qrUrl = cfg.baseUrl + (isRegister ? data.register_qr_path : data.qr_path);
  const action = isRegister ? '注册' : '登录';
  process.stderr.write(
    `请把下面这段${action}引导原样发给用户：\n----\n` +
    (isRegister ? '需要先注册账号（注册即送 10 免费点数）。请用手机扫码或打开链接注册：\n\n'
                : '需要先登录。请用手机扫码或打开链接登录账号：\n\n') +
    `${action}方式（二选一）\n二维码图片：${qrUrl}\n${action}链接：${pageUrl}\n` +
    `access_token（${action}后校验用）：${data.access_token}\n` +
    `扫码/${action}完成后告诉我一声，我会执行校验并保存凭证：\n\n` +
    `node cli.js ${scene} --check --access-token "${data.access_token}"\n----\n`);
  printOk({ qr_url: qrUrl, [isRegister ? 'register_url' : 'login_url']: pageUrl,
    access_token: data.access_token, expires_in: data.expires_in });
}

async function cmdSessionCheck(cfg, opts, scene) {
  const action = scene === 'register' ? '注册' : '登录';
  const accessToken = opts.accessToken;
  if (!accessToken || !/^[0-9a-f]{16,64}$/.test(accessToken)) {
    throw new UsageError(`${scene} --check 需要 --access-token`);
  }
  const data = await new ApiClient({ baseUrl: cfg.baseUrl }).checkCliSession(accessToken);
  if (data.status === 'pending') {
    printFail('LOGIN_PENDING', `用户尚未完成${action}，请完成后再执行本命令`); process.exit(2);
  }
  if (data.status !== 'ready' || !data.token) {
    printFail('LOGIN_EXPIRED', `${action}会话已过期或已使用，请重新执行 ${scene} --link`); process.exit(2);
  }
  saveConfig({ base_url: cfg.baseUrl, token: data.token });
  process.stderr.write(`${action}成功，token 已保存到配置文件\n`);
  printOk({ phone: data.phone, quota_balance: data.quota_balance });
}

async function cmdConfig(args, opts) {
  const sub = args[0];
  if (sub === 'set' && args[1] === 'base-url') {
    const url = args[2];
    if (!url || !/^https?:\/\//.test(url)) throw new UsageError('base-url 需要 http(s):// 开头的地址');
    saveConfig({ base_url: url.replace(/\/+$/, '') });
    printOk({ base_url: loadConfig().base_url }); return;
  }
  if (sub === 'set' && args[1] === 'insecure') {
    const v = args[2];
    if (v !== 'true' && v !== 'false') throw new UsageError('insecure 需要 true 或 false');
    saveConfig({ insecure: v === 'true' });
    printOk({ insecure: loadConfig().insecure === true }); return;
  }
  if (sub === 'show') {
    const cfg = resolveConfig(opts);
    printOk({ base_url: cfg.baseUrl, insecure: cfg.insecure,
      token: maskToken(cfg.token), config_path: configPaths.configPath }); return;
  }
  throw new UsageError('config 仅支持 set base-url / set insecure / show');
}

async function cmdStart(opts) {
  if (!opts.url) throw new UsageError('start 需要 --url <抖音视频链接>');
  const client = clientFor(opts);
  process.stderr.write('建立弹幕采集会话（免费探测）...\n');
  const data = await client.request('POST', '/dy/danmaku/sessions', {
    body: { url: opts.url }, timeoutMs: 90000 });
  const total = data.metrics && data.metrics.danmaku_count;
  process.stderr.write(
    `会话已建立 session_id=${data.session_id}\n视频《${data.title || '(无文案)'}》` +
    `弹幕总数: ${total === '' || total == null ? '未知' : total}，时长 ${data.metrics.duration_ms || 0}ms，` +
    `预估 ${data.estimated_pages == null ? '?' : data.estimated_pages} 页。\n` +
    '每个成功请求 1 点（含空页）。请向用户报价并确认后再执行 step。\n');
  printOk(data);
}

async function cmdStep(opts) {
  const sid = requireSessionId(opts);
  const client = clientFor(opts);
  process.stderr.write(`采集下一时间段: session=${sid}（成功即扣 1 点，含空页）...\n`);
  const data = await client.request('POST', `/dy/danmaku/sessions/${encodeURIComponent(sid)}/step`, {
    body: { type: 'page', root_cid: '' }, timeoutMs: 200000 });
  if (data.no_more) process.stderr.write('弹幕已全部采完（本次未扣费）。\n');
  else process.stderr.write(
    `第 ${data.page_no} 页 [${data.start_time || 0}-${data.end_time || 0}ms]: ` +
    `${(data.danmakus || []).length} 条（累计 ${data.danmakus_collected} 条），已扣 1 点，` +
    `${data.has_more_main ? '还有下一页，继续前请询问用户' : '已是最后一页'}。\n`);
  printOk(data);
}

async function cmdExport(opts) {
  const sid = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/dy/danmaku/sessions/${encodeURIComponent(sid)}/export`,
      { headers: { Authorization: `Bearer ${cfg.token}`, ...skillHeaders() }, signal: dlCtrl.signal });
    warnSkillResponse(res);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch { /* 非信封 */ }
      printFail('EXPORT_FAILED', `导出失败: ${msg}`); process.exit(5);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    printFail('EXPORT_FAILED', err && err.name === 'AbortError' ? '下载超时' : `下载失败: ${err.message}`);
    process.exit(5);
  } finally { clearTimeout(dlTimer); }
  const out = opts.out || `${sid}_dy_danmakus.csv`;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  if (fs.existsSync(out)) process.stderr.write(`[warn] 目标文件已存在，将覆盖: ${out}\n`);
  fs.writeFileSync(out, buf);
  process.stderr.write(`已下载: ${out}\n`);
  printOk({ session_id: sid, file: out, size: buf.length });
}

async function main() {
  const { cmd, args, opts } = parseArgs(process.argv.slice(2));
  if (opts.version || cmd === 'version') return printOk({ name: 'dy-danmaku', version: VERSION, capability: CAPABILITY });
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'register':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'register');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'register');
      throw new UsageError('register 仅支持 --link / --check');
    case 'login':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'login');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'login');
      throw new UsageError('login 仅支持 --link / --check');
    case 'start': return cmdStart(opts);
    case 'step': return cmdStep(opts);
    case 'status': {
      const sid = requireSessionId(opts);
      return printOk(await clientFor(opts).request('GET', `/dy/danmaku/sessions/${encodeURIComponent(sid)}`));
    }
    case 'danmakus': {
      const sid = requireSessionId(opts);
      const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
      const size = opts.pageSize === true ? 100 : parsePositiveNumber(opts.pageSize, 'page-size', 100);
      return printOk(await clientFor(opts).request('GET',
        `/dy/danmaku/sessions/${encodeURIComponent(sid)}/danmakus?page=${page}&page_size=${size}`));
    }
    case 'sessions': {
      const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
      const q = `?page=${page}&page_size=20` + (opts.status ? `&status=${encodeURIComponent(opts.status)}` : '');
      return printOk(await clientFor(opts).request('GET', '/dy/danmaku/sessions' + q));
    }
    case 'finish': {
      const sid = requireSessionId(opts);
      return printOk(await clientFor(opts).request('POST', `/dy/danmaku/sessions/${encodeURIComponent(sid)}/finish`));
    }
    case 'export': return cmdExport(opts);
    case 'quota': return printOk(await clientFor(opts).profile());
    case 'pay': {
      const { rechargeFlow } = require('./src/pay');
      const res = await rechargeFlow({ yuan: opts.yuan, channel: opts.channel });
      return printOk({ order_no: res.order.order_no, points: res.order.points,
        status: res.order.status, paid: !res.pending, pay_url: res.payUrl });
    }
    case 'logout': {
      const cfg = resolveConfig(opts); requireToken(cfg);
      try { await new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token }).logout(); } catch { /* 本地仍登出 */ }
      saveConfig({ token: '' });
      return printOk({ logged_out: true });
    }
    case 'config': return cmdConfig(args, opts);
    default: throw new UsageError(`未知命令: ${cmd}`);
  }
}

main().catch((e) => handleFatal(e, main, { usage: USAGE }));
