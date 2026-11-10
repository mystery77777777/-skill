---
name: pgy-blogger-search
slug: pgy-kol-search
displayName: 蒲公英博主搜索采集
version: 1.0.1
description: 蒲公英（小红书官方合作平台 pgy.xiaohongshu.com）博主广场搜索采集工具。当用户需要按关键词在蒲公英找博主/达人——采博主昵称、小红书号、粉丝数、图文与视频一口价、阅读与互动中位数、粉丝 30 天增长率、粉丝活跃等级、48 小时邀约回复率、内容与人设标签、健康等级，导出 CSV（Excel 直开），或提到"蒲公英博主/蒲公英达人/博主广场/达人初筛/找达人/报价表/KOL 报价/蒲公英搜索"时使用本 skill。适合达人初筛、报价对比、投放选号、竞品达人盘点等场景。**一页（20 位博主）= 4 点数；预扣按页数、结算按实采量退差；零结果或失败全额返还（注册送 10 点）。**
---

# 蒲公英博主搜索采集 Skill（pgy-blogger-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name pgy-blogger-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name pgy-blogger-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交关键词 + 页数 → 平台调度内网浏览器节点在蒲公英「博主广场」取博主列表（先 `cooperator/blogger/track` 拿 `trackId`，再 `cooperator/blogger/v2` 取 `kols[]`）→ 拿到博主清单。结果可直接导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：博主 ID 与昵称、小红书号（`red_id`）、头像、地域、性别、粉丝数、图文一口价 / 视频一口价 / 最低价 / 展示价、阅读中位数、互动中位数、粉丝 30 天增长率、粉丝 28 天活跃等级、48h 邀约回复率、内容标签、人设标签、交易类型、健康等级、商业笔记数、蒲公英主页链接。
- **筛选维度**：关键词（`--keyword`，可留空 = 不筛词）、采集页数（`--pages`，1~10）、搜索口径（`--search-type`）。
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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name pgy-blogger-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **一页（20 位博主）4 点数（0.4 元）**（预扣按页数、结算按实采量退差）。
- 注册即送 **10 免费点数**（约可采 2 页）；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 筛选参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--keyword` | 搜索关键词（≤64 字符；**不是链接**，传链接会被拒） | 可留空（不筛词） |
| `--pages` | 1~10，一页 20 位博主 | 1 |
| `--search-type` | `note_keyword`=按笔记关键词（页面主搜索框，命中率最高）/ `nickname`=按博主昵称 / `post`=综合排序；也可直传 `1`/`2`/`3` | `note_keyword` |

- **口径很重要**：蒲公英接口的关键词字段是 `keyword`，**必须同时带 `searchType` 才生效**，只传关键词不传口径等于没搜（历史踩坑）。本 CLI 默认就带 `note_keyword`，一般不用改。
- `--search-type` 传了白名单外的值**不会报错，会回落到 `note_keyword`**（与服务端一致），所以提交前请确认取值拼写。
- 关键词留空 = 不筛词，按综合排序取博主（可用于泛指盘点，但结果随机性大）。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：所有接口都需要 token，10 免费点数在注册成功后发放到账号。
- 首次使用需先 `register --link`（注册即送 10 点数）或 `login --link`（已有账号），成功后 token 自动保存。
- **配置文件（含 token）存放于用户级目录 `~/.xhs-platform/config.json`**（与小红书/抖音/快手/B站/微博系列 skill 共用同一账号体系）。可用环境变量 `XHS_CONFIG_PATH` 覆盖。
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
{"ok":true,"data":{"name":"pgy-blogger-search","version":"1.0.0","capability":"pgy_blogger_search"}}
```

### register / login / quota / logout / config

与其它平台 skill 完全一致（同一账号体系、同一配置文件），此处不再赘述：

```bash
node cli.js register --link --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js login --link --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js quota --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js logout --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

`register --link` 的 stderr 会给出可直接复制给用户的注册引导话术，**agent 必须原样发给用户**。

### submit — 提交搜索采集任务

```bash
node cli.js submit --keyword "美妆" --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js submit --keyword "美妆" --pages 3 --wait --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js submit --keyword "护肤" --search-type nickname --wait --skill-name pgy-blogger-search --ai-entry <ai-entry>
node cli.js submit --pages 1 --wait --skill-name pgy-blogger-search --ai-entry <ai-entry>                        # 不筛词（综合排序）
node cli.js submit --keyword "美妆" --force --skill-name pgy-blogger-search --ai-entry <ai-entry>                # 跳过 24h 内容去重强制重提
```

- 每任务 1 个关键词。
- 幂等键按参数派生，同参数重试不重复扣费；`--force` 混入时间戳生成新键（服务端同时跳过 24h 去重）。
- 提交前会读一次价格并在 stderr 透出预估点数。

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261030_9a1b2c3d","total":1,"valid_count":1,"invalid_count":0,
 "charged":1,"quota_balance":9,"status":"pending","estimated_points":1,"price_per_unit":1}}
```

带 `--wait` 时最终输出同 `query` 的完整结果（默认超时 600s，节点约 1-3 分钟）。

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] [--interval 秒] [--timeout 秒] --skill-name pgy-blogger-search --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261030_9a1b2c3d","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"keyword":"美妆","requested_pages":1,"collected_count":20,
             "settle_charged":1,"refunded_diff":0,
             "notes":[{"blogger_user_id":"5f8c...","name":"某某",
                       "red_id":"123456789","fans_num":125000,
                       "picture_price":8000,"video_price":12000,
                       "click_mid_num":3200,"inter_mid_num":180,
                       "content_tags":"美妆>整体妆容,护肤>面膜"}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 是实采博主数，`settle_charged` 是实收点数，`refunded_diff` 是退差点数 —— **按这三个字段如实向用户汇报**，不要按提交时的预扣数说。
- 报价字段单位是**元**（不是分），可直接展示给用户。
- 粉丝数取 `fans_num`；若该列为空通常是接口本身没回，不是采集失败。
- `total_note_count` 在蒲公英博主广场接口里常为空（接口只给 `business_note_count`），属正常。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 蒲公英博主.csv --skill-name pgy-blogger-search --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 博主明细（昵称/小红书号/粉丝/报价/中位数/标签/主页链接）。

## 典型工作流（agent 照此执行）

1. 与用户确认关键词与要找的达人方向；如用户还要筛，确认页数。
2. `node cli.js quota --skill-name pgy-blogger-search --ai-entry <ai-entry>` — 确认点数够（一页 4 点，先估 `页数 × 4`）。
3. `node cli.js submit --keyword "<关键词>" [--pages N] [--search-type T] --wait --skill-name pgy-blogger-search --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把 `result.notes` 整理成表格返回；**按 `collected_count` / `settle_charged` 如实汇报计费**。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name pgy-blogger-search --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（关键词超长、关键词里混了链接、pages 非法） | 修正参数后重提（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link`；仍无法解决拨打 18722121663 |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id 是否属于当前账号 |
| `status=failed` + 零结果 | 关键词无结果或页面异常 | 点数已全额返还，换个关键词重试 |
| `status=failed` + 登录/签名失效 | 蒲公英 cookie 过期或签名失败 | 点数已全额返还；联系客服刷新节点登录态 |
| 4290 | 触发限流 | 稍后重试 |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = `页数 × 单价`；结算按**实采量** `ceil(实采位/20)` 退差。
- **零结果或失败全额返还**（关键词无结果、登录态失效、签名失效、无在线节点、超时）。
- 同一用户同一关键词 + 参数 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**蒲公英数据；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功；风控或账号权限导致的失败如实透出。
- 蒲公英是小红书官方合作平台，数据仅限合规商务用途，不得转售。
