---
name: sohu-comments
slug: sohu-pinglun
displayName: 搜狐文章评论采集（会话制）
version: 1.0.0
description: 搜狐文章评论采集工具（分步会话）。当用户需要采集某篇搜狐文章（www.sohu.com/a/…）下面的评论——评论者昵称、IP 属地、评论内容、时间、点赞数、盖楼回复，导出评论 CSV（Excel 直开），或提到"搜狐评论/搜狐文章评论/评论采集/评论导出/评论区舆情"时使用本 skill。服务端直连抓取，不需要用户开浏览器或插件。分步会话制：start 建会话（免费探测评论总数与总页数）后按页采集评论，每页 10 条（含盖楼回复）扣 1 点数，每步实时返回增量结果，由 AI 询问用户是否继续（注册送 10 点）。适合评论舆情分析、用户口碑调研、选题参考等场景。
---

# 搜狐文章评论采集 Skill（sohu-comments，会话制）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name sohu-comments` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name sohu-comments --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：**分步会话制**采集搜狐文章评论。先 `start`（免费探测文章标题、作者、评论总数与总页数），再按页采评论 —— 每一步返回增量结果，由 agent 决定是否继续。全部评论可导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：主评论与盖楼回复的评论者昵称（`nickname`）、评论者 ID、评论正文（`content`）、**IP 属地**（`location`，如"广东""北京"）、点赞数（`like_count`）、回复数（`reply_count`）、发布时间（`publish_time`）、是否作者置顶（`author_top`）、评论 ID（`cid`）与根评论 ID（`root_cid`）。
- **服务端直连**：搜狐评论接口免登录、无签名，由服务端直接抓取，**不需要用户打开浏览器或装插件**，`start` 之后立刻就能采。
- **盖楼一次给全**：回复随主评论页一起返回（接口带完整父级链），**没有"再花 1 点展开回复"的动作**，这一点和微博/抖音/B站评论不同。
- **计费**：`start` 免费；之后**每采一页 1 点数**；**某页一条都没采到（已到底）不扣费**。
- 客户端是零依赖 CLI（Node ≥ 18，无需 `npm install`），采集逻辑全在后端。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name sohu-comments --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **每页 0.1 元**（每 1 点数采一页 10 条评论含盖楼；建会话免费，无新增的页不扣费）。
- 注册即送 **10 免费点数**；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## ⚠️ 链接要求（重要，提交前必读）

**本 skill 只接受搜狐文章链接**：

- `https://www.sohu.com/a/1096460185_162522`（`/a/<news_id>_<media_id>`，最常见）
- 带 `?scm=...&spm=...` 分享参数、带 `#comment_area` 锚点也可以，会自动归一化

**搜狐没有博主/媒体号主页**，所以只能按文章链接采；要采某个媒体的多篇文章，请先用 `sohu-search` 按关键词或媒体名搜出文章链接。搜狐首页、频道页（`/guonei` 等）、搜索结果页链接一律拒绝，**不扣费**。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：所有接口都需要 token，10 免费点数在注册成功后发放。
- 首次使用需先 `register --link`（注册即送 10 点数）或 `login --link`（已有账号），成功后 token 自动保存。
- **配置文件（含 token）存放于用户级目录 `~/.xhs-platform/config.json`**（与小红书/抖音/快手/B站/微博/百度系列 skill 共用同一账号体系）。可用环境变量 `XHS_CONFIG_PATH` 覆盖。
- **安全策略：登录和注册（发短信）每次都强制图形验证码**，终端无法展示，一律走 `--link` 微信扫码/链接方式。
- 后端服务地址默认 `http://st.aidata366.com`，可用 `node cli.js config set base-url <url>` 修改，或单次加 `--base-url <url>` 覆盖。
- **⚠️ 安全提示**：默认服务地址是**明文 http**，token 会在公网明文传输；如环境允许建议切 https。
- `~/.xhs-platform/config.json` 含 token，**不要泄露、不要提交 git**。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<业务码>,"message":"..."}`。
- 交互提示、进度一律走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

### version

```bash
node cli.js version
```

```json
{"ok":true,"data":{"name":"sohu-comments","version":"1.0.0","capability":"sohu_comments"}}
```

### register / login / quota / logout / config

与其它平台 skill 完全一致（同一账号体系、同一配置文件）：

```bash
node cli.js register --link --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js login --link --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js quota --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js logout --skill-name sohu-comments --ai-entry <ai-entry>
node cli.js config show
```

### start — 建立采集会话（免费）

```bash
node cli.js start --url "https://www.sohu.com/a/1096460185_162522" --skill-name sohu-comments --ai-entry <ai-entry>
```

服务端抓文章页与评论接口，探测标题/作者/评论总数/总页数，**不扣费**。stderr 会提示「请把评论总数和总页数告知用户，确认后再执行 step」——**agent 必须先向用户报数并征得同意再 step**。

```json
{"ok":true,"data":{"platform":"sohu","session_id":"1200555a45be45909cfb377f60ec63ea",
 "news_id":"1096460185","media_id":"162522",
 "note_url":"https://www.sohu.com/a/1096460185_162522",
 "title":"美媒：佛州坠机遇难者身份曝光，…","author_nickname":"环球网",
 "status":"active","metrics":{"comment_count":"23","participation_total":"177"},
 "total_pages":3,"estimated_pages":3,"has_more_main":true,
 "pages_collected":0,"mains_collected":0,"subs_collected":0,"charged_steps":0}}
```

> `metrics.comment_count` 是接口给的主楼总数，`metrics.participation_total` 是"参与人数"（含点赞等互动），别混用。`total_pages` 是真实的评论页数（口径含盖楼），直接按它决定采几页。

### step — 采集下一页（每页 1 点数）

```bash
node cli.js step --session <session_id> --page --skill-name sohu-comments --ai-entry <ai-entry>
```

- 返回本页评论（主楼含 `sub_comments` 盖楼回复）+ 累计数 + `has_more_main`。
- `no_more=true` 表示已采到底，**本次不扣费**。
- **没有 `--expand`**：搜狐的盖楼回复已经随页给全，不需要单独展开。

```json
{"ok":true,"data":{"type":"page","page_no":1,"has_more_main":true,
 "comments":[{"cid":"…","nickname":"狐狐网友","location":"北京","content":"…",
              "like_count":0,"reply_count":0,"sub_comments":[]}],
 "mains_collected":10,"subs_collected":0,"charged_steps":1,"quota_balance":9}}
```

### status — 查看会话状态（免费）

```bash
node cli.js status --session <session_id> --skill-name sohu-comments --ai-entry <ai-entry>
```

### comments — 拉取会话已累计的全部评论（免费）

```bash
node cli.js comments --session <session_id> [--page 1] [--page-size 100] --skill-name sohu-comments --ai-entry <ai-entry>
```

断点续看/全量拉取用，不额外扣费。

### finish — 结束会话

```bash
node cli.js finish --session <session_id> --skill-name sohu-comments --ai-entry <ai-entry>
```

采完请务必执行（会话长时间无操作也会自动过期，不额外扣费）。

### sessions — 列出自己的会话

```bash
node cli.js sessions [--page 1] [--status active] --skill-name sohu-comments --ai-entry <ai-entry>
```

### export — 导出评论 CSV

```bash
node cli.js export --session <session_id> --out 评论.csv --skill-name sohu-comments --ai-entry <ai-entry>
```

导出该会话累计的全部评论（含盖楼回复与 IP 属地），BOM 头，Excel 直开不乱码。

## 典型工作流（agent 照此执行）

1. `node cli.js start --url <搜狐文章链接> --skill-name sohu-comments --ai-entry <ai-entry>`（免费）。
2. **把评论总数与总页数报给用户，问要不要继续、采几页**——这一步必须做，不能自作主张一路采到底。
3. 用户同意后：`node cli.js step --session <sid> --page --skill-name sohu-comments --ai-entry <ai-entry>` 采一页（1 点）；把本页评论整理给用户看（重点：高赞、作者置顶、有盖楼的）。
4. 重复 3 直到 `no_more` 或用户喊停。**每页开始前先问**。
5. `node cli.js export --session <sid> --out <文件名>.csv --skill-name sohu-comments --ai-entry <ai-entry>` 交付文件。
6. 收尾 `node cli.js finish --session <sid> --skill-name sohu-comments --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接校验未通过 | 检查是否 `www.sohu.com/a/<id>_<id>` 形态（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link`；仍无法解决拨打 18722121663 |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| 3003 | 会话不存在或不属于当前账号 | 检查 session_id；可能已过期，重新 `start` |
| `no_more: true` | 已采到底 | 本次未扣费，不要再重复 step |
| 4290 | 触发限流 | 稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- `start` 建会话**免费**。
- 每 `step` 1 点数（一页 10 条含盖楼）；**本页一条都没采到不扣费**。
- 服务侧抓取异常（接口报错/超时）导致的步会全额返还。
- `status` / `comments` / `sessions` / `export` / `finish` 均不扣费。

## 红线

- 仅采集**公开**评论数据；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功；搜狐接口异常/风控导致的失败如实透出。
- **每一页扣费前必须先征得用户同意**，不要静默连续 step。
