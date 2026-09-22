#!/usr/bin/env node
'use strict';
/**
 * cli.js — 小红书笔记评论内容采集 CLI (能力: xhs_comments, 自包含)。
 *
 * 输出规约 (对齐 xhs-dpt / xhs-convert-url-pro): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
 *
 * 命令: version / register --link / login --link / submit / query / export / quota /
 *       logout / config
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ApiClient, BizError, allowInsecureTls } = require('./src/client');
const { loadConfig, saveConfig, resolveConfig, maskToken, configPaths, DEFAULT_BASE_URL } = require('./src/config');
const {
  UsageError, printOk, printFail, exitWithError, pollTask, parsePositiveNumber,
} = require('./src/output');

const CAPABILITY = 'xhs_comments';
const MIN_BATCH = 1;
const MAX_BATCH = 50;
const VERSION = '1.1.0';
const DOWNLOAD_TIMEOUT_MS = 60000; // 导出文件下载超时 (放宽于 API 15s, 防半开连接永久挂起)
const CONVERT_TIMEOUT_MS = 180000; // 自动转链子进程总超时 (转链 CLI 内部轮询默认 120s, 放宽兜底)
// 兄弟 skill: 小红书转链 CLI (链接不合规时自动调用)
const CONVERT_CLI = path.join(__dirname, '..', 'xhs-convert-url-pro', 'cli.js');

// ---------------------------------------------------------------- 参数解析

const VALUE_FLAGS = new Set(['file', 'interval', 'timeout', 'token', 'base-url', 'access-token', 'comment-max', 'max', 'out']);
const MULTI_FLAGS = new Set(['url']);
const BOOL_FLAGS = new Set(['wait', 'help', 'link', 'check', 'force', 'no-convert', 'version']);

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
      (opts[camel(name)] = opts[camel(name)] || []).push(value);
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

const USAGE = `小红书笔记评论内容采集 CLI (昵称/内容/点赞数/IP属地/子评论数)

用法: node cli.js <命令> [参数]

命令:
  register --link                   生成注册二维码/链接（推荐；注册即送 10 点数）
  register --check --access-token <串>  用户完成注册后确认并保存 token
  login --link                      生成登录二维码/链接（推荐）
  login --check --access-token <串> 用户完成授权后确认并保存 token
  submit --url <笔记链接> [--url ...] [--file <路径>] [--max N] [--wait] [--interval 秒] [--timeout 秒] [--force] [--no-convert]
                                    提交评论采集任务（1~50 条；--file 按行读取, 忽略空行与 # 注释；
                                    --max N 单篇评论采集上限, 0=不限制(封顶500), 不填默认 100；
                                    --force 跳过 24h 内容去重强制重提）
                                    链接须带 xsec_token 参数；缺 token / xhslink 短链的链接
                                    默认自动调用转链 skill xhs-convert-url-pro 转换后再提交
                                    （转链消耗转链服务点数）；--no-convert 关闭自动转链, 直接报错
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>] [--timeout 秒]
                                    导出任务结果 CSV（保留 7 天；--wait 等待生成, 默认超时 300s）
  quota                             查询点数与个人信息
  logout                            登出当前账号
  config set base-url <url>         设置后端服务地址
  config set insecure true|false    忽略 HTTPS 证书校验（自签证书时开）
  config show                       查看当前配置（token 脱敏）
  version                           显示版本

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`;

// ---------------------------------------------------------------- 各命令

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

function collectUrls(opts) {
  const urls = [...(opts.url || [])];
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
      urls.push(s);
    }
  }
  if (urls.length < MIN_BATCH) throw new UsageError('请通过 --url 或 --file 提供至少 1 条笔记链接');
  if (urls.length > MAX_BATCH) throw new UsageError(`超出单次批量上限（${MAX_BATCH} 条），当前 ${urls.length} 条`);
  return urls;
}

// ---------------------------------------------------------------- 链接校验 + 自动转链

/**
 * 提交前本地分类链接（不发请求、不扣费）:
 *  - fatal:       无法自动修复 —— 链接格式不合法 / 非小红书域名 → 直接报错
 *  - convertible: 可自动转链修复 —— 缺 xsec_token 参数 / xhslink 短链
 *                 → 默认自动调用转链 skill (xhs-convert-url-pro) 转换后继续提交
 */
function classifyNoteUrls(urls) {
  const fatal = [];
  const convertible = [];
  urls.forEach((raw, i) => {
    const no = i + 1;
    let u;
    try {
      u = new URL(raw);
    } catch {
      fatal.push(`第 ${no} 条链接格式不合法（需 http(s):// 开头的完整 URL）: ${raw}`);
      return;
    }
    const host = u.hostname.toLowerCase();
    if (host === 'xhslink.com' || host.endsWith('.xhslink.com')) {
      convertible.push({ url: raw, reason: 'xhslink 短链' });
      return;
    }
    if (/(^|\.)xiaohongshu\.com$/.test(host)) {
      if (!u.searchParams.get('xsec_token')) {
        convertible.push({ url: raw, reason: '缺少 xsec_token 参数' });
      }
      return;
    }
    fatal.push(`第 ${no} 条不是小红书笔记链接（域名 ${host}）: ${raw}`);
  });
  return { fatal, convertible };
}

function buildUrlError(problems, suffix) {
  return '链接校验未通过，本次未提交、未扣费。共 ' + problems.length + ' 条问题:\n' +
    problems.map((p) => `  - ${p}`).join('\n') + (suffix ? '\n' + suffix : '');
}

/**
 * 调用兄弟 skill 的转链 CLI (node ../xhs-convert-url-pro/cli.js submit --wait) 转换链接。
 * 返回 { converted: Map<原url, 新url>, failures: [描述] }。
 * execFile + 参数数组, 不经过 shell, 无命令注入面。
 */
function runConvertCli(targetUrls) {
  return new Promise((resolve) => {
    if (!fs.existsSync(CONVERT_CLI)) {
      resolve({ converted: new Map(), failures: [`未找到转链程序: ${CONVERT_CLI}（请确认 xhs-convert-url-pro skill 与本 skill 同级安装）`] });
      return;
    }
    const args = [CONVERT_CLI, 'submit'];
    for (const u of targetUrls) args.push('--url', u);
    args.push('--wait', '--timeout', '150');
    execFile(process.execPath, args, {
      timeout: CONVERT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const out = String(stdout || '');
      // 转链 CLI stdout 规约: 单行 JSON; 退出码非 0 时也尝试解析 (错误也是 JSON)
      let payload = null;
      for (const line of out.trim().split(/\r?\n/).reverse()) {
        const s = line.trim();
        if (!s) continue;
        try { payload = JSON.parse(s); } catch { continue; }
        break;
      }
      if (payload && payload.ok === true && payload.data && Array.isArray(payload.data.items)) {
        const converted = new Map();
        const failures = [];
        for (const it of payload.data.items) {
          if (it.status === 'success' && it.new_url) converted.set(it.url, it.new_url);
          else failures.push(`${it.url}: ${it.fail_reason || it.status || '转链失败'}`);
        }
        resolve({ converted, failures });
        return;
      }
      const msg = payload && payload.message ? `code=${payload.code} ${payload.message}` : (err ? err.message : out.slice(0, 200));
      resolve({ converted: new Map(), failures: [`转链程序调用失败: ${msg}`] });
    });
  });
}

async function autoConvertAndReplace(urls, convertible) {
  const targets = [...new Set(convertible.map((c) => c.url))];
  process.stderr.write(
    `检测到 ${targets.length} 条链接不合规（缺 xsec_token / xhslink 短链），` +
    '自动调用转链程序 xhs-convert-url-pro（会产生转链服务点数消耗）...\n');
  const { converted, failures } = await runConvertCli(targets);
  for (const f of failures) process.stderr.write(`[warn] 转链未成功: ${f}\n`);
  const fixed = targets.filter((u) => converted.has(u)).length;
  if (fixed) {
    process.stderr.write(`已自动转换 ${fixed}/${targets.length} 条链接，继续提交...\n`);
  }
  return urls.map((u) => converted.get(u) || u);
}

async function cmdSubmit(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const urls = collectUrls(opts);
  // 链接校验: 缺 xsec_token / 短链默认自动调用转链 skill 修复后继续; --no-convert 关闭; fatal 直接报错
  const NO_CONVERT_TIP = '说明: 小红书笔记链接必须带 xsec_token 参数；缺 token 的链接请先用「xhs-convert-url-pro」转链 skill 转换；' +
    'xhslink 短链请先在浏览器打开跳转，取得带 xsec_token 的最终链接后再提交。（去掉 --no-convert 可自动转链）';
  const first = classifyNoteUrls(urls);
  if (first.fatal.length) {
    throw new UsageError(buildUrlError(first.fatal));
  }
  let finalUrls = urls;
  if (first.convertible.length) {
    if (opts.noConvert) {
      const problems = first.convertible.map((c) => `${c.reason}: ${c.url}`);
      throw new UsageError(buildUrlError(problems, NO_CONVERT_TIP));
    }
    finalUrls = await autoConvertAndReplace(urls, first.convertible);
    const second = classifyNoteUrls(finalUrls);
    if (second.fatal.length || second.convertible.length) {
      const problems = [
        ...second.fatal,
        ...second.convertible.map((c) => `自动转链后仍不合规（${c.reason}）: ${c.url}`),
      ];
      throw new UsageError(buildUrlError(problems,
        '说明: 以上链接经自动转链仍不合规（转链失败明细见 stderr 提示）；可检查链接有效性后重试，或拨打客服电话 18722121663。'));
    }
  }
  // --max 为 --comment-max 的简写; 0=不限制(服务端封顶500), 不传默认 100
  const cmRaw = opts.commentMax !== undefined ? opts.commentMax : opts.max;
  // 严格校验 (审计 P2-2): 拒绝 "200abc" 这类 parseInt 会静默截断的输入
  if (cmRaw !== undefined && !/^\d+$/.test(String(cmRaw))) {
    throw new UsageError('--max/--comment-max 需为非负整数（0=不限制，封顶 500）');
  }
  const commentMax = cmRaw !== undefined ? parseInt(cmRaw, 10) : undefined;
  const items = finalUrls.map((note_url, i) => {
    const payload = { note_url };
    if (commentMax !== undefined) payload.comment_max = commentMax;
    return { id: i + 1, payload };
  });
  // 幂等键按内容派生: 同批内容重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = finalUrls.join('\n') + (opts.force ? `\n#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);
  process.stderr.write(`提交 ${items.length} 条评论采集任务（幂等键 ${idempotencyKey}${opts.force ? ', force' : ''}）...\n`);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(CAPABILITY, items, idempotencyKey, !!opts.force);
  if (!opts.wait) {
    printOk(data);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待结果...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 2),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 300),
  });
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
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 2),
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
  const created = await client.createExport(taskId);
  if (!opts.wait) {
    printOk(created);
    return;
  }
  process.stderr.write(`导出任务已创建 export_id=${created.export_id}，等待生成...\n`);
  // 复用 --timeout (默认 300s), 超时报 TIMEOUT 退出码 5 (对齐 pollTask 风格)
  const timeoutSec = parsePositiveNumber(opts.timeout, 'timeout', 300);
  const deadline = Date.now() + timeoutSec * 1000;
  let info;
  for (;;) {
    info = await client.getExport(created.export_id);
    // 终态完备 (审计 P3-3): 只对 pending/running 继续等待, 其余任何状态
    // (done/failed/expired 及服务端未来新增的 cancelled 等) 都立即跳出, 不空转到超时
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
  // 下载 CSV (复用 token; 带 AbortController 超时, 审计 P2-1: 原裸 fetch 可永久挂起)
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/platform/exports/${encodeURIComponent(info.export_id)}/file`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, signal: dlCtrl.signal });
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
  const out = opts.out || `${taskId}_result.csv`;
  // --out 路径兜底 (审计 P3-2): 目录不存在自动创建; 覆盖已有文件时在 stderr 提示
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
    printOk({ name: 'xhs-comments', version: VERSION, capability: CAPABILITY });
    return;
  }
  if (opts.help || !cmd) throw new UsageError('缺少命令');
  if (resolveConfig(opts).insecure) allowInsecureTls();
  switch (cmd) {
    case 'version': return printOk({ name: 'xhs-comments', version: VERSION, capability: CAPABILITY });
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
    case 'logout': return cmdLogout(opts);
    case 'config': return cmdConfig(args, opts);
    default: throw new UsageError(`未知命令: ${cmd}`);
  }
}

// 接线 USAGE (审计 G1): 参数错误时在 stderr 输出帮助文案, 否则 USAGE 是死代码且用户看不到帮助
main().catch((e) => exitWithError(e, { usage: USAGE }));
