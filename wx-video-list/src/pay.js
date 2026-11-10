'use strict';
/**
 * _shared/pay.js — 点数不足就地扫码充值 (2026-11-05)。
 *
 * 为什么要有这个模块
 * ------------------
 * 以前 3001「点数不足」只能提示"联系管理员充值"，用户得切到浏览器登录网页充值，
 * 再回来重跑命令。现在 CLI 自己把充值单建好、把二维码打到终端里，扫码付完自动
 * 重试原命令 —— 用户不用离开终端。
 *
 * 终端二维码怎么来的
 * ------------------
 * 终端没有图形能力，56 个 skill 又都是零 npm 依赖（不能引 qrcode-terminal）。
 * 所以由服务端 `_qr_matrix()` 算好 0/1 矩阵随建单一起下发，这里只用 ANSI 背景
 * 色块拼出来：模块黑底、静默区白底（正色，手机摄像头最稳）。每格两个空格宽，
 * 让字符的宽高比接近 1:1，扫得动。
 *
 * 两种运行环境
 * ------------
 * · 交互终端 (stderr 是 TTY): 直接打印二维码 → 轮询 → 到账后自动重跑原命令；
 * · 非交互 (AI agent / 管道 / 重定向): 不阻塞，把充值页地址和订单号交回去，
 *   用户扫码付完自己重跑。agent 里挂 5 分钟等付款是不可接受的。
 *
 * stdout 规约不变: 只有 JSON 走 stdout，二维码和进度全部走 stderr。
 */
const { ApiClient } = require('./client');
const { resolveConfig } = require('./config');
const { exitWithError, printFail } = require('./output');

const ESC = '\x1b[';
const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_YUAN = 10;

let _autoRetried = false; // 自动重试只做一次, 防止"充了还是不够"无限建单

class PayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayError';
    this.code = code;
  }
}

function note(msg) {
  process.stderr.write(msg + '\n');
}

/** 0/1 矩阵 → ANSI 色块。模块(cell=1)黑底, 底(cell=0)白底。 */
function renderQr(matrix) {
  const lines = [];
  for (const row of matrix) {
    let line = '';
    for (const cell of row) line += cell ? `${ESC}40m  ` : `${ESC}47m  `;
    lines.push(line + `${ESC}0m`);
  }
  return lines.join('\n');
}

/** 自己构造客户端: 各 cli 的 client 实例不传进来, 避免 54 个入口逐个改签名。 */
function makeClient() {
  const cfg = resolveConfig({});
  if (!cfg.token) {
    throw new PayError('NO_TOKEN', '还没有登录凭证，先执行 login --link 获取');
  }
  return { client: new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token }), cfg };
}

async function waitPaid(client, orderNo, { timeoutSec = DEFAULT_TIMEOUT_SEC } = {}) {
  const deadline = Date.now() + timeoutSec * 1000;
  let last = '';
  for (;;) {
    const order = await client.request('GET',
      `/user/recharge/orders/${encodeURIComponent(orderNo)}`);
    if (order.status !== last) {
      last = order.status;
      note(`[pay] ${order.status_text || order.status}`);
    }
    if (order.status === 'paid') return order;
    if (order.status === 'closed' || order.status === 'expired'
        || order.status === 'amount_mismatch') {
      throw new PayError(order.status,
        `${order.status_text || order.status}${order.fail_reason ? '：' + order.fail_reason : ''}`);
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new PayError('TIMEOUT',
        `等待付款超时（${timeoutSec}s）。订单 ${orderNo} 仍在有效期内，付完点数会自动到账，可直接重跑原命令`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/**
 * 建单 + 出码 (+ 交互环境下等待到账)。
 * @returns {{pending:boolean, order:object, payUrl:string}}
 */
async function rechargeFlow({ yuan, channel, timeoutSec } = {}) {
  const { client, cfg } = makeClient();

  const opt = await client.request('GET', '/user/recharge/options');
  if (!opt.enabled) throw new PayError('DISABLED', '自助充值暂未开放，请联系管理员');

  const available = (opt.channels || []).filter((c) => c.available);
  if (!available.length) {
    throw new PayError('NO_CHANNEL', '当前没有可用的支付渠道，请联系管理员');
  }
  const picked = channel ? available.find((c) => c.key === channel) : available[0];
  if (!picked) {
    throw new PayError('NO_CHANNEL',
      `支付渠道 ${channel} 不可用，可选：${available.map((c) => c.key).join('/')}`);
  }

  const minY = Number(opt.min_yuan) || 1;
  const maxY = Number(opt.max_yuan) || 5000;
  const amount = yuan === undefined
    ? Math.min(Math.max(DEFAULT_YUAN, minY), maxY)
    : Number(yuan);
  if (!Number.isFinite(amount) || amount < minY || amount > maxY) {
    throw new PayError('BAD_AMOUNT', `充值金额需在 ${minY} ~ ${maxY} 元之间`);
  }

  const order = await client.request('POST', '/user/recharge/orders', {
    body: { channel: picked.key, amount_fen: Math.round(amount * 100) },
  });

  const tty = Boolean(process.stderr.isTTY);
  const payUrl = `${cfg.baseUrl}/recharge.html`;

  note('');
  note(`点数不足，已自动创建充值单 ${order.order_no}`);
  note(`金额 ${(order.amount_fen / 100).toFixed(2)} 元 → ${order.points} 点（${picked.name}）`);
  if (tty && Array.isArray(order.qr_matrix) && order.qr_matrix.length) {
    note('');
    process.stderr.write(renderQr(order.qr_matrix) + '\n');
    note('');
  } else if (Array.isArray(order.qr_matrix) && order.qr_matrix.length) {
    // 非 TTY 也画, 但用窄字符: agent 把文本转给用户时仍能看个大概
    note('二维码（如显示为乱码，请用下面的链接）:');
    for (const row of order.qr_matrix) {
      note(row.map((c) => (c ? '██' : '  ')).join(''));
    }
    note('');
  }
  note(`二维码内容: ${order.qr_content}`);
  note(`或电脑打开 ${payUrl} 用手机扫码`);

  if (!tty) {
    return { pending: true, order, payUrl };
  }

  note('');
  note(`请扫码付款（${Math.round((timeoutSec || DEFAULT_TIMEOUT_SEC) / 60)} 分钟内有效，Ctrl+C 可中断）…`);
  const paid = await waitPaid(client, order.order_no, { timeoutSec });
  note(`已到账：+${paid.points} 点，继续执行原命令`);
  return { pending: false, order: paid, payUrl };
}

/**
 * cli.js 的统一兜底: 3001 就走扫码充值并重试原命令, 其它错误维持原有出口。
 * 用法: `main().catch((e) => handleFatal(e, main, { usage: USAGE }));`
 */
async function handleFatal(err, retryFn, { usage = '', skillTip = '' } = {}) {
  const isQuota = err && err.name === 'BizError' && err.code === 3001;
  if (!isQuota) return exitWithError(err, { usage, skillTip });

  if (_autoRetried) {
    printFail(3001, '点数仍不足（自动充值后余额不够本次消费），请充值更多后重试');
    process.exit(3);
  }
  if (process.env.XHS_NO_AUTO_PAY === '1') {
    printFail(3001, '点数不足（已设置 XHS_NO_AUTO_PAY=1，跳过自动充值）');
    process.exit(3);
  }

  try {
    const res = await rechargeFlow({});
    if (res.pending) {
      printFail(3001,
        `点数不足。已创建充值单 ${res.order.order_no}（${res.order.points} 点），`
        + `请打开 ${res.payUrl} 或扫上面的码付款，完成后重跑本命令`);
      process.exit(3);
    }
    _autoRetried = true;
    return retryFn();
  } catch (e) {
    printFail(3001, `点数不足，自动充值未完成：${e.message}`);
    process.exit(3);
  }
}

module.exports = { handleFatal, rechargeFlow, renderQr, PayError };
