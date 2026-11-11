#!/usr/bin/env node
'use strict';
/**
 * cli.js — 懂车帝评论 CLI (能力: dcd_comments, 分步会话制)。
 *
 * 支持三类内容（一次会话只采一篇）:
 * - 资讯文章  www.dongchedi.com/article/<id>
 * - 视频      www.dongchedi.com/video/<id>
 * - 车友圈    www.dongchedi.com/ugc/article/<id>（UGC 动态，也可能是视频帖）
 *
 * 计费 (契约 §4): probe 免费 → 每页 1 点数（一页 20 条主评论）。
 *   ★ 楼中楼随主评论一页给全（会话 has_expand=False），没有单独的展开步骤；
 *     某页一条都没采到 → 本步点数返还。
 *
 * ★ 采集走**插件端**：由已登录懂车帝的采集节点打开内容页取数。
 *   节点未登录会明确报错（fail_kind=login_required）并全额返还本步点数。
 * ★ 同一数字 ID 的 /article/<id> 可能 302 到 /ugc/article/<id>，
 *   真实类型以节点打开的**最终地址**为准（会话行会记录校正后的 source_type）。
 *
 * 输出规约 (对齐 sohu-comments): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
 *
 * 命令: version / register --link|--check / login --link|--check /
 *       start / step / status / comments / export / finish / sessions /
 *       quota / logout / config
 */
const fs = require('fs');
const path = require('path');
const { ApiClient, BizError, allowInsecureTls, skillHeaders, warnSkillResponse } = require('./src/client');
const { loadConfig, saveConfig, resolveConfig, maskToken, configPaths, DEFAULT_BASE_URL } = require('./src/config');
const { UsageError, printOk, printFail, exitWithError, parsePositiveNumber } = require('./src/output');
const { handleFatal } = require('./src/pay');

const CAPABILITY = 'dcd_comments';
const VERSION = '1.0.0';
const DOWNLOAD_TIMEOUT_MS = 60000; // 导出 CSV 下载超时
const PAGE_SIZE = 20;             // 接口稳定档位 (count=50 实测被截断)

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

const VALUE_FLAGS = new Set(['yuan', 'channel', 'session', 'url', 'page', 'page-size', 'status',
  'out', 'interval', 'timeout', 'token', 'base-url', 'access-token', 'skill-name', 'ai-entry']);
const BOOL_FLAGS = new Set(['help', 'link', 'check', 'version']);

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
      if (value === undefined) {
        // --page / --status 允许不取值 (视作开关/默认值)
        if (name === 'page') { opts.page = true; continue; }
        throw new UsageError(`缺少参数值: ${arg}`);
      }
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

const USAGE = `懂车帝评论分步采集 CLI (会话制, 每页 1 点数)

用法: node cli.js <命令> [参数]

采集流程命令:
  start --url <内容链接>            建立采集会话（免费：节点打开内容页探测内容与评论总数）
                                    支持三类链接，见下方「支持的链接」
                                    返回 session_id、类型、标题、评论总数
  step --session <id> --page        采集下一页主评论（20 条，扣 1 点）
                                    ★ 楼中楼随页一次性给全，不需要再单独展开
  status --session <id>             查询会话状态/累计采集量
  comments --session <id> [--page N] [--page-size N]
                                    分页拉取本会话已累计的评论明细（免费）
  export --session <id> [--out <文件路径>]
                                    下载会话累计结果 CSV（免费）
  finish --session <id>             主动结束会话（空闲 20 分钟也会自动过期）
  sessions [--status active] [--page N]
                                    列出自己的会话

账号命令:
  register --link                   生成注册二维码/链接（推荐；注册即送 10 点数）
  register --check --access-token <串>  用户完成注册后确认并保存 token
  login --link                      生成登录二维码/链接（推荐）
  login --check --access-token <串> 用户完成授权后确认并保存 token
  quota                             查询点数与个人信息
  pay                               扫码充值点数（终端出二维码，付完自动继续）
  logout                            登出当前账号
  config set base-url <url>         设置后端服务地址
  config set insecure true|false    忽略 HTTPS 证书校验（自签证书时开）
  config show                       查看当前配置（token 脱敏）
  version                           显示版本

支持的链接:
  资讯文章  https://www.dongchedi.com/article/7704153144573461016
  视频      https://www.dongchedi.com/video/7704146197522678297
  车友圈    https://www.dongchedi.com/ugc/article/7703440576271893017
            （/ugc/video/<id> 也收；m.dongchedi.com 与不带 www 的域名同口径）
  其它链接（用户主页 / 搜索结果 / 车系页 / 其它站点）一律拒绝，不扣费。

说明:
  会话按「一篇内容」建；一次只能采一篇，多篇请分别 start。
  每页固定扣 1 点 = 20 条主评论 + 其楼中楼（楼中楼随页补齐，不额外计费）。
  某页一条都没采到会自动返还本页点数；会话空闲 20 分钟自动过期，不额外扣费。
  ★ 终止只看接口的 has_more，不看评论总数 —— 懂车帝的 total 含回复且会变，不可信。
  ★ 采集依赖采集节点已登录懂车帝；未登录会报错并返还本步点数。

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）

AI 来源参数（所有 API 命令必填）: --skill-name <本Skill名> --ai-entry <AI工具标识>`;

// ---------------------------------------------------------------- 公共

function requireToken(cfg) {
  if (!cfg.token) throw new BizError(1002, '未登录：缺少 token');
}

function requireSessionId(opts) {
  const sid = opts.session;
  if (!sid || !/^[0-9a-f]{32}$/.test(sid)) {
    throw new UsageError('需要 --session <32位会话id>（由 start 命令返回）');
  }
  return sid;
}

/**
 * 链接归一化（与服务端 parse_ref 同口径）。
 * 返回 { ok, url, source_type, content_id, key, reason }
 */
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
      // 同 ID 的 /article/X 与 /ugc/article/X 是同一内容（302 关系），key 只带 id
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

function validateContentUrl(raw) {
  if (!raw) {
    throw new UsageError('start 需要 --url <内容链接>（资讯文章 / 视频 / 车友圈，形如 '
      + 'https://www.dongchedi.com/article/7704153144573461016）');
  }
  const ref = parseRef(raw);
  if (!ref.ok) throw new UsageError(ref.reason);
  return ref;
}

// ---------------------------------------------------------------- 账号命令

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

// ---------------------------------------------------------------- 会话命令

async function cmdStart(opts) {
  const ref = validateContentUrl(opts.url);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  process.stderr.write(
    `建立采集会话（节点打开内容页探测内容与评论总数，免费）... 类型: ${SOURCE_TEXT[ref.source_type]}\n`);
  const data = await client.createDcdCommentSession(ref.url);
  const total = (data.metrics && data.metrics.comment_count) || '';
  process.stderr.write(
    `会话已建立 session_id=${data.session_id}\n` +
    `${SOURCE_TEXT[data.source_type] || data.source_type}《${(data.title || '(无标题)').slice(0, 40)}》`
    + `作者: ${data.author_nickname || '未知'}\n` +
    `评论总数: ${total || '未知'}，每页 ${PAGE_SIZE} 条 = 1 点`
    + '（楼中楼随页给全，不需要单独展开）。\n' +
    '请把评论总数告知用户, 确认后再执行 step 开始计费采集。\n');
  printOk(data);
}

async function cmdStep(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  process.stderr.write(`采集下一页评论: session=${sessionId}（扣 1 点）...\n`);
  const data = await client.stepDcdCommentSession(sessionId, 'page');
  if (data.no_more) {
    process.stderr.write('评论已全部采完（本次未扣费）。\n');
  } else {
    const subs = (data.comments || []).reduce(
      (n, c) => n + ((c.sub_comments && c.sub_comments.length) || 0), 0);
    const refunded = data.refunded_this_step ? '（本页 0 条，已返还本页点数）' : '';
    process.stderr.write(
      `第 ${data.page_no} 页: ${(data.comments || []).length} 条` +
      `${subs ? `（其中楼中楼 ${subs} 条）` : ''}${refunded}，` +
      `累计 ${data.mains_collected} 主楼 + ${data.subs_collected} 楼中楼，` +
      `${data.has_more_main ? '还有下一页（继续采需再扣 1 点，请先询问用户）' : '已是最后一页'}。\n`);
  }
  printOk(data);
}

async function cmdStatus(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  printOk(await client.getDcdCommentSession(sessionId));
}

async function cmdComments(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  // 无值形态 (--page 不带数字) 视为开关, 用默认页码
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  const pageSize = opts.pageSize === true ? 100 : parsePositiveNumber(opts.pageSize, 'page-size', 100);
  printOk(await client.listDcdSessionComments(sessionId, page, pageSize));
}

async function cmdFinish(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.finishDcdCommentSession(sessionId);
  process.stderr.write(`会话已结束 (status=${data.status})。\n`);
  printOk(data);
}

async function cmdListSessions(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  printOk(await client.listDcdCommentSessions(page, 20, opts.status || ''));
}

async function cmdExport(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v1/dcd/comments/sessions/${encodeURIComponent(sessionId)}/export`,
      { headers: { Authorization: `Bearer ${cfg.token}`, ...skillHeaders() }, signal: dlCtrl.signal });
    warnSkillResponse(res);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch { /* 非信封 */ }
      printFail('EXPORT_FAILED', `导出失败: ${msg}`);
      process.exit(5);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    printFail('EXPORT_FAILED', err && err.name === 'AbortError'
      ? `下载超时（${DOWNLOAD_TIMEOUT_MS / 1000}s），请检查网络后重试`
      : `下载失败: ${err && err.message ? err.message : err}`);
    process.exit(5);
  } finally {
    clearTimeout(dlTimer);
  }
  const out = opts.out || `${sessionId}_dcd_comments.csv`;
  try {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  } catch { /* 目录已存在 */ }
  if (fs.existsSync(out)) {
    process.stderr.write(`[warn] 目标文件已存在，将覆盖: ${out}\n`);
  }
  fs.writeFileSync(out, buf);
  process.stderr.write(`已下载: ${out}\n`);
  printOk({ session_id: sessionId, file: out, size: buf.length });
}

// ---------------------------------------------------------------- 入口

async function main() {
  const { cmd, args, opts } = parseArgs(process.argv.slice(2));
  if (opts.version) {
    printOk({ name: 'dcd-pinglun', version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: 'dcd-pinglun', version: VERSION, capability: CAPABILITY });
    case 'register':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'register');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'register');
      throw new UsageError('register 仅支持 --link / --check (终端注册会被 2003 拒绝)');
    case 'login':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'login');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'login');
      throw new UsageError('login 仅支持 --link / --check (终端登录会被 2003 拒绝)');
    case 'start': return cmdStart(opts);
    case 'step': return cmdStep(opts);
    case 'status': return cmdStatus(opts);
    case 'comments': return cmdComments(opts);
    case 'finish': return cmdFinish(opts);
    case 'sessions': return cmdListSessions(opts);
    case 'export': return cmdExport(opts);
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
