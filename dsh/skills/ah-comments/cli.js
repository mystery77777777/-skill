#!/usr/bin/env node
'use strict';
/**
 * cli.js — 汽车之家评论 CLI (能力: autohome_comments, 分步会话制)。
 *
 * 支持两类内容（一次会话只采一篇）:
 * - 论坛帖子  club.autohome.com.cn/bbs/thread-c-<bbsid>-<帖子ID>-<页>.html
 *             老式 c/a/o 三套 + PC 新式 hash + m 站 hash 都收，统一归一化成
 *             https://club.m.autohome.com.cn/bbs/thread-c-0-<帖子ID>-1.html
 *             （type 与 bbsid 服务端完全忽略，实测 7 组同字节）
 * - 资讯文章  www.autohome.com.cn/<频道>/<年月>/<id>.html
 * - 车家号    chejiahao.autohome.com.cn/info/<id>
 *
 * 计费 (契约 §4): probe 免费 → 每页 1 点数。
 *   论坛一页 20 条、文章一页 10 条（接口 pagesize 上限）；楼中楼/二级回复随页给全，
 *   不需要额外的展开步骤。某页 0 条 → 本步点数返还。
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

const CAPABILITY = 'autohome_comments';
const VERSION = '1.0.0';
const DOWNLOAD_TIMEOUT_MS = 60000; // 导出 CSV 下载超时

// 链接识别口径（与服务端 app/capabilities/_autohome_engine.parse_ref 保持一致）
const FORUM_OLD_RE = /\/bbs\/thread-[cao]-\d+-(\d+)-(\d+)\.html/;
const FORUM_HASH_RE = /\/bbs\/thread(?:owner)?\/[0-9a-zA-Z]+\/(\d+)-(\d+)\.html/;
const CJH_RE = /\/(?:info|article)\/(\d{6,})/;
const NEWS_PATH_RE = /^\/(?:[a-z]{2,12}\/\d{6}|[a-z]{2,12})\/(\d{5,})\.html$/;
const THREAD_TPL = 'https://club.m.autohome.com.cn/bbs/thread-c-0-{tid}-1.html';

const SOURCE_TEXT = { forum: '论坛帖子', news: '资讯文章', chejiahao: '车家号' };

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

const USAGE = `汽车之家评论分步采集 CLI (会话制, 每页 1 点数)

用法: node cli.js <命令> [参数]

采集流程命令:
  start --url <内容链接>            建立采集会话（免费：服务端直连抓内容 + 评论总数）
                                    支持三类链接，见下方「支持的链接」
                                    返回 session_id、类型、标题、评论总数、总页数
  step --session <id> --page        采集下一页评论（论坛 20 条 / 文章 10 条，扣 1 点）
                                    ★ 楼中楼、二级回复随页一次性给全，无需再单独展开
  status --session <id>             查询会话状态/累计采集量/点数余额
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
  论坛帖子  https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html
            （PC 新式 /bbs/thread/<hash>/<帖子ID>-1.html 与 m 站 hash 形态也收，
              链接里的 c/a/o 类型与 bbsid 服务端会忽略，统一按帖子 ID 采集）
  资讯文章  https://www.autohome.com.cn/news/202611/1318147.html
  车家号    https://chejiahao.autohome.com.cn/info/12345678
  其它链接（口碑 / 问答 / 车型页 / 视频页 / 其它站点）一律拒绝，不扣费。

说明:
  会话按「一篇内容」建；一次只能采一篇，多篇请分别 start。
  每页固定扣 1 点：论坛一页 20 条、文章一页 10 条（之家接口 pagesize 上限就是 10）。
  某页一条都没采到会自动返还本页点数；会话空闲 20 分钟自动过期，不额外扣费。

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
 * 返回 { ok, url, source_type, content_id, key, page, reason }
 */
function parseRef(raw) {
  const v = String(raw || '').trim();
  if (!v) return { ok: false, reason: '链接不能为空' };
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: `链接格式无法解析: ${v.slice(0, 80)}` };
  }
  const host = (u.hostname || '').toLowerCase();
  if (!(host === 'autohome.com.cn' || host.endsWith('.autohome.com.cn'))) {
    return { ok: false, reason: `不是汽车之家链接（域名应为 autohome.com.cn）: ${v.slice(0, 80)}` };
  }
  const p = u.pathname || '';

  // ① 论坛帖子（club.*）
  if (host.startsWith('club.')) {
    let m = p.match(FORUM_OLD_RE);
    if (!m) m = p.match(FORUM_HASH_RE);
    if (!m) {
      return {
        ok: false,
        reason: '论坛链接缺少帖子 ID（应形如 club.autohome.com.cn/bbs/'
          + `thread-c-<bbsid>-<帖子ID>-1.html）: ${v.slice(0, 80)}`,
      };
    }
    const tid = m[1];
    const page = parseInt(m[2], 10) || 1;
    return {
      ok: true, source_type: 'forum', content_id: tid, page,
      url: THREAD_TPL.replace('{tid}', tid),
      key: `ah_forum_${tid}`,
    };
  }

  // ② 车家号（图文与视频同域）
  if (host.startsWith('chejiahao.')) {
    const m = p.match(CJH_RE);
    if (!m) {
      return {
        ok: false,
        reason: '车家号链接缺少内容 ID（应形如 '
          + `chejiahao.autohome.com.cn/info/<内容ID>）: ${v.slice(0, 80)}`,
      };
    }
    return {
      ok: true, source_type: 'chejiahao', content_id: m[1], page: 1,
      url: `https://chejiahao.autohome.com.cn/info/${m[1]}`,
      key: `ah_cjh_${m[1]}`,
    };
  }

  // ③ 资讯文章（www./m./其它子域）
  const m = p.match(NEWS_PATH_RE);
  if (m) {
    return {
      ok: true, source_type: 'news', content_id: m[1], page: 1,
      url: `https://www.autohome.com.cn${p}`,
      key: `ah_news_${m[1]}`,
    };
  }
  return {
    ok: false,
    reason: '暂只支持论坛帖子（club.autohome.com.cn/bbs/thread-…）、'
      + '资讯文章（www.autohome.com.cn/news/<年月>/<ID>.html）'
      + `与车家号内容（chejiahao.autohome.com.cn/info/<ID>）: ${v.slice(0, 80)}`,
  };
}

function validateContentUrl(raw) {
  if (!raw) {
    throw new UsageError('start 需要 --url <内容链接>（论坛帖子 / 资讯文章 / 车家号，形如 '
      + 'https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html）');
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
  if (ref.page > 1) {
    process.stderr.write(
      `[note] 链接里带的是第 ${ref.page} 页，但会话固定从第 1 页开始采`
      + '（分页由会话控制，链接页码不生效）。\n');
  }
  process.stderr.write(
    `建立采集会话（服务端直连探测内容与评论总数，免费）... 类型: ${SOURCE_TEXT[ref.source_type]}\n`);
  const data = await client.createAhCommentSession(ref.url);
  const total = data.metrics && data.metrics.comment_count;
  const pages = data.total_pages != null ? data.total_pages : data.estimated_pages;
  const perPage = data.source_type === 'forum'
    ? '论坛 20 条/页'
    : '文章 10 条/页';
  const extra = data.source_type === 'forum'
    ? `所属论坛: ${data.forum_name || '未知'}`
    : '';
  process.stderr.write(
    `会话已建立 session_id=${data.session_id}\n` +
    `${SOURCE_TEXT[data.source_type] || data.source_type}《${(data.title || '(无标题)').slice(0, 40)}》`
    + `作者: ${data.author_nickname || '未知'}${extra ? '，' + extra : ''}\n` +
    `评论总数: ${total || '未知'}，共 ${pages == null ? '?' : pages} 页（${perPage} = 1 点）。\n` +
    '请把评论总数和总页数告知用户, 确认后再执行 step 开始计费采集'
    + '（楼中楼/二级回复随页给全，不需要单独展开）。\n');
  printOk(data);
}

async function cmdStep(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  process.stderr.write(`采集下一页评论: session=${sessionId}（扣 1 点）...\n`);
  const data = await client.stepAhCommentSession(sessionId, 'page');
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
  printOk(await client.getAhCommentSession(sessionId));
}

async function cmdComments(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  // 无值形态 (--page 不带数字) 视为开关, 用默认页码 (parseArgs 对缺值 value-flag 置 true)
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  const pageSize = opts.pageSize === true ? 100 : parsePositiveNumber(opts.pageSize, 'page-size', 100);
  printOk(await client.listAhSessionComments(sessionId, page, pageSize));
}

async function cmdFinish(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.finishAhCommentSession(sessionId);
  process.stderr.write(`会话已结束 (status=${data.status})。\n`);
  printOk(data);
}

async function cmdListSessions(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  printOk(await client.listAhCommentSessions(page, 20, opts.status || ''));
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
      `${cfg.baseUrl}/api/v1/autohome/comments/sessions/${encodeURIComponent(sessionId)}/export`,
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
  const out = opts.out || `${sessionId}_ah_comments.csv`;
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
    printOk({ name: 'ah-comments', version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: 'ah-comments', version: VERSION, capability: CAPABILITY });
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
