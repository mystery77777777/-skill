---
name: sohu-search
slug: sohu-keyword-search
displayName: 搜狐站内搜索采集
version: 1.0.0
description: 搜狐站内关键词搜索采集工具。当用户需要"搜搜狐""按关键词找搜狐文章"——拿到一批文章链接/标题/作者/发布时间/摘要/封面/评论数，导出 CSV（Excel 直开），或提到"搜狐搜索/搜狐关键词/搜一搜搜狐/搜狐内容采集/舆情搜索"时使用本 skill。服务端直连搜索接口，不需要浏览器。每页 20 条 = 1 点数，按实采量结算退差，零结果全额返还（注册送 10 点）。
---

# 搜狐站内搜索采集 Skill（sohu-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name sohu-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name sohu-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交关键词（可指定页数）→ 服务端直连搜狐搜索接口，按页采集全站内容（图文与视频混排），每页 20 条，并批量补齐每条的评论数。

- **能采什么**：文章 ID、链接、标题、作者（媒体号）、发布时间、摘要、封面图、内容类型（`content_type`：1/2 为搜狐内部类型码，1 多为图文、2 多为视频）、**评论数**。
- **典型用法**：先 `sohu-search` 按关键词捞出文章链接清单，再用 `sohu-detail` 采正文、用 `sohu-comments` 采评论 —— 三个 skill 的链接格式是打通的（搜索结果的 `url` 可直接喂给另外两个）。
- **计费**：1 页（20 条）= 1 点数，受理时按 `--pages` 预扣，**按实采量结算退差**；零结果或抓取异常**全额返还**。

## 点数不足怎么办（自动扫码充值）

跑命令时如果点数不够，CLI **不会直接报错退出**，而是自己建一张充值单、把二维码打在终端里：

```
点数不足，已自动创建充值单 RO2611051712281481f36de19
金额 10.00 元 → 100 点（支付宝）
<二维码色块>
[pay] 已支付
已到账：+100 点，继续执行原命令
```

- **在终端里跑**：手机支付宝/微信对着终端扫码 → 付完点数自动到账 → 原命令自动重跑，不用手动再来一遍。
- **AI agent / 非交互环境**（管道、重定向）：CLI 不阻塞等待，而是返回订单号和充值页地址 `{服务地址}/recharge.html`。把链接交给用户，他在网页扫码付款，付完重跑原命令即可（点数会自动到账）。
- **主动充值**：`node cli.js pay --yuan 50 --skill-name sohu-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **每页 0.1 元**（一页 20 条）。
- 注册即送 **10 免费点数**，即 10 页 = 200 条。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--keyword` | 搜索关键词（≤50 字） | 必填 |
| `--pages` | 采集页数，**1-10**（每页 20 条） | 1 |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

> 一个任务只对应一个关键词。多个关键词请分开提交（各自独立任务、独立结算）。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：10 免费点数在注册成功后发放。
- 首次使用先 `register --link` 或 `login --link`，成功后 token 自动保存。
- 配置文件在 `~/.xhs-platform/config.json`（与其它平台 skill 共用账号体系），可用 `XHS_CONFIG_PATH` 覆盖。
- 后端地址默认 `http://st.aidata366.com`，可用 `config set base-url <url>` 或单次 `--base-url` 覆盖。
- **⚠️ 安全提示**：默认地址是明文 http，token 会明文传输；`config.json` 含 token，不要泄露、不要提交 git。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<码>,"message":"..."}`。
- 交互提示、轮询进度走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

```bash
node cli.js version
node cli.js register --link --skill-name sohu-search --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name sohu-search --ai-entry <ai-entry>
node cli.js login --link --skill-name sohu-search --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name sohu-search --ai-entry <ai-entry>
node cli.js submit --keyword "美孚机油" --pages 2 --wait --skill-name sohu-search --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name sohu-search --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 美孚机油.csv --skill-name sohu-search --ai-entry <ai-entry>
node cli.js quota --skill-name sohu-search --ai-entry <ai-entry>
node cli.js logout --skill-name sohu-search --ai-entry <ai-entry>
node cli.js config show
```

### submit

```bash
node cli.js submit --keyword "美孚机油" --pages 2 --wait --skill-name sohu-search --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `keyword` | 关键词 |
| `requested_pages` | 请求页数 |
| `collected_count` | 实采条数（跨页合计，已按 `news_id` 去重） |
| `settle_charged` | 实收点数（按实采量算出来的页数） |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条明细（搜索结果数组） |

> 实采条数通常略少于 `页数 × 20`：搜索接口各页之间有重复项，已去重；也可能提前采到底。这些都是正常现象，退差会自动算。

### export

```bash
node cli.js export <task_id> --wait --out 美孚机油.csv --skill-name sohu-search --ai-entry <ai-entry>
```

CSV 结构：前段任务汇总（关键词/状态/请求页数/实采条数/实收/退差/失败原因），空一行后是明细宽表（`keyword,page_num,news_id,url,title,author,author_id,publish_time,summary,cover_url,content_type,comment_count,raw_json,fetched_at`）。BOM 头，Excel 直开不乱码。

## 典型工作流（agent 照此执行）

1. 跟用户确认关键词与页数（**先说清 1 页 20 条 = 1 点，别默认多采**）。
2. `node cli.js submit --keyword "<词>" --pages <N> --wait --skill-name sohu-search --ai-entry <ai-entry>`。
3. 读 `result`：`collected_count` / `settle_charged` / `refunded_diff` 如实报给用户。
4. 要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name sohu-search --ai-entry <ai-entry>`。
5. 用户想深挖某几篇 → 把明细里的 `url` 直接交给 `sohu-detail`（采正文）或 `sohu-comments`（采评论）。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 关键词为空或过长 / pages 超范围 | 检查参数（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 4290 | 触发限流 | 稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 按 `--pages` 预扣，成功采集后按 `ceil(实采条数 / 20)` 页结算，差值自动返还。
- 关键词**零结果**（或接口异常导致一条没采到）→ **全额返还**。
- 前几页成功、后几页接口失败 → 保留已采数据，按实采量结算。
- `query` / `export` / `quota` 不扣费。

## 红线

- 仅采集**公开**内容；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功；搜狐搜索接口异常导致的失败如实透出。
- `content_type` 是搜狐自己的类型码，不要臆测成"图文/视频"后写进交付物。
