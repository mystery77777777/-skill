---
name: pgy-note-search
slug: pgy-note-search
displayName: 蒲公英热门笔记搜索采集
version: 1.0.1
description: 蒲公英（小红书官方合作平台 pgy.xiaohongshu.com）热门商业笔记搜索采集工具。当用户需要按关键词搜蒲公英热门商业笔记——采笔记标题、笔记类型、作者昵称与作者粉丝数、阅读·点赞·收藏·评论数、是否报备广告、发布时间、封面图、九图原图、视频直链与时长，导出 CSV（Excel 直开），或提到"蒲公英热门笔记/爆文搜索/商业笔记/报备笔记搜索/笔记选题/竞品爆文/蒲公英搜笔记"时使用本 skill。适合选题调研、爆文拆解、竞品内容盘点、报备笔记比例分析。**一页（34 条）= 4 点数；预扣按页数、结算按实采量退差；零结果或失败全额返还（注册送 10 点）。**
---

# 蒲公英热门笔记搜索采集 Skill（pgy-note-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name pgy-note-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name pgy-note-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交关键词 + 页数 → 平台调度内网浏览器节点打蒲公英「热门商业笔记」接口（`edith.xiaohongshu.com/api/pgy/content_square/search_note_v2`，pageSize=34）→ 拿到笔记列表。结果可直接导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：关键词、页码、笔记 ID 与链接、标题、笔记类型（图文/视频）、作者 ID 与昵称、作者粉丝数、阅读数、点赞数、收藏数、评论数、是否报备广告（`is_ad_note`）、发布时间、视频时长（秒）、封面图、九图原图数组、视频直链。
- **筛选维度**：关键词（`--keyword`，必填）、采集页数（`--pages`，1~10）、业务类型（`--biz-type`，默认 `4`，一般不用改）。
- **省心机制**：预扣按页数、结算按实采量自动退差、零结果/失败全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- 客户端是零依赖 CLI（Node ≥ 18，无需 `npm install`），全部采集逻辑在后端完成。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name pgy-note-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **一页（34 条）4 点数（0.4 元）**（预扣按页数、结算按实采量退差）。
- 注册即送 **10 免费点数**（约可采 2 页）；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 筛选参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--keyword` | 搜索关键词（≤64 字符；**必填，不是链接**，传链接会被拒） | 必填 |
| `--pages` | 1~10，一页 34 条 | 1 |
| `--biz-type` | 笔记业务类型，蒲公英接口参数，默认 `4` | `4` |

- 采某个博主的笔记请用 `pgy-note-collect`；采单篇笔记的互动数请用小红书 `xhs-dpt`。
- 关键词里混了 `http://` / `xiaohongshu.com` / `xhslink.com` 会**直接拒单，不扣费**。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：所有接口都需要 token，10 免费点数在注册成功后发放到账号。
- 首次使用需先 `register --link`（注册即送 10 点数）或 `login --link`（已有账号）。
- **配置文件（含 token）存放于用户级目录 `~/.xhs-platform/config.json`**（与其它平台 skill 共用同一账号体系）。可用环境变量 `XHS_CONFIG_PATH` 覆盖。
- **安全策略：登录和注册（发短信）每次都强制图形验证码**，终端无法展示，一律走 `--link` 微信扫码/链接方式。
- 后端服务地址默认 `http://st.aidata366.com`，可用 `node cli.js config set base-url <url>` 修改，或单次加 `--base-url <url>` 覆盖。
- **⚠️ 安全提示**：默认服务地址是**明文 http**，token 会在公网明文传输；如环境允许建议切 https。
- `~/.xhs-platform/config.json` 含 token，**不要泄露、不要提交 git**。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<业务码>,"message":"..."}`。
- 交互提示、轮询进度一律走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

### version

```bash
node cli.js version
```

```json
{"ok":true,"data":{"name":"pgy-note-search","version":"1.0.0","capability":"pgy_note_search"}}
```

### register / login / quota / logout / config

与其它平台 skill 完全一致（同一账号体系、同一配置文件）：

```bash
node cli.js register --link --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js login --link --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js quota --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js logout --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

### submit — 提交热门笔记搜索任务

```bash
node cli.js submit --keyword "口红" --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js submit --keyword "口红" --pages 3 --wait --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js submit --keyword "防晒" --pages 1 --wait --skill-name pgy-note-search --ai-entry <ai-entry>
node cli.js submit --keyword "口红" --force --skill-name pgy-note-search --ai-entry <ai-entry>      # 跳过 24h 内容去重强制重提
```

- 每任务 1 个关键词。
- 幂等键按参数派生，同参数重试不重复扣费；`--force` 混入时间戳生成新键（服务端同时跳过 24h 去重）。
- 提交前会读一次价格并在 stderr 透出预估点数。

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261030_1a2b3c4d","total":1,"valid_count":1,"invalid_count":0,
 "charged":1,"quota_balance":9,"status":"pending","estimated_points":1,"price_per_unit":1}}
```

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] --skill-name pgy-note-search --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261030_1a2b3c4d","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"keyword":"口红","requested_pages":1,"collected_count":34,
             "settle_charged":1,"refunded_diff":0,
             "notes":[{"note_id":"6712...","title":"秋天必入的 5 支口红",
                       "note_type":1,"author_nickname":"某某",
                       "author_fans_num":86000,"read_num":42000,
                       "like_num":3100,"fav_num":980,"cmt_num":126,
                       "is_ad_note":1,"note_publish_time":"2026-10-12 20:31:00",
                       "video_duration":null}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 是实采条数，`settle_charged` 是实收点数，`refunded_diff` 是退差点数 —— **按这三个字段如实向用户汇报**，不要按提交时的预扣数说。
- 计数是**接口整数**，页面上的「2w / 8k」只是前端格式化，**不需要折算**。
- `is_ad_note = 1` 表示报备广告笔记（蒲公英商业笔记池里绝大多数都是报备笔记）。
- `video_duration` 单位是**秒**；图文笔记为 `null`。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 蒲公英热门笔记.csv --skill-name pgy-note-search --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 笔记明细（标题/作者/计数/素材链接，Excel 直开）。

## 典型工作流（agent 照此执行）

1. 与用户确认关键词；如用户还要更多，确认页数（一页 34 条）。
2. `node cli.js quota --skill-name pgy-note-search --ai-entry <ai-entry>` — 确认点数够（`页数 × 4`）。
3. `node cli.js submit --keyword "<关键词>" [--pages N] --wait --skill-name pgy-note-search --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把笔记列表整理成表格返回；**按 `collected_count` / `settle_charged` 如实汇报计费**。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name pgy-note-search --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（关键词为空/超长、关键词里混了链接、pages 非法） | 修正参数后重提（退出码 1，不扣费） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link`；仍无法解决拨打 18722121663 |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id 是否属于当前账号 |
| `status=failed` + 零结果 | 关键词无结果或页面异常 | 点数已全额返还，换个关键词重试 |
| `status=failed` + 登录/签名失效 | 蒲公英 cookie 过期或签名失败（406） | 全额返还；联系客服刷新节点登录态 |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = `页数 × 单价`；结算按**实采量** `ceil(实采条/34)` 退差。
- **零结果或失败全额返还**（关键词无结果、登录态失效、签名失效、无在线节点、超时）。
- 同一用户同一关键词 + 参数 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**蒲公英数据；不用于任何违法违规用途。
- 笔记正文与图片版权归原作者，**不得用于二次发布或商用转载**。
- 不要向用户承诺 100% 成功；账号权限与风控导致的失败如实透出。
