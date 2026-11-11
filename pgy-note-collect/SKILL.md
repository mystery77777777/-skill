---
name: pgy-note-collect
slug: pgy-note-collect
displayName: 蒲公英博主笔记采集
version: 1.0.1
description: 蒲公英（小红书官方合作平台 pgy.xiaohongshu.com）博主笔记采集工具。当用户提交蒲公英博主链接 / 小红书博主主页链接 / 24 位博主 ID，需要批量采集该博主的商业笔记——标题、正文全文、话题标签、发布时间与更新时间、曝光/阅读/点赞/收藏/评论/分享数、涨粉数、封面图、九图原图、视频直链与时长、是否报备、合作品牌，导出 CSV（Excel 直开），或提到"博主笔记/达人笔记/蒲公英笔记/笔记内容采集/带货笔记/报备笔记/笔记素材下载"时使用本 skill。适合投放前看内容质量、扒爆文选题、结案取素材。**1 条笔记 = 4 点数（注册送 10 点）。**
---

# 蒲公英博主笔记采集 Skill（pgy-note-collect）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name pgy-note-collect` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name pgy-note-collect --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交博主链接/ID + 条数 → 平台调度内网浏览器节点先按 `notes_detail` 翻页（pageSize=8）取该博主的商业笔记列表，再逐条打 `note/{noteId}/detail` 拿正文/素材/计数 → 落库并回传。

- **能采什么**：博主 ID、笔记 ID、笔记链接、笔记类型（图文/视频）、标题、**正文全文**（小红书长文不截断）、话题标签（`tag_list`）、发布时间与更新时间、曝光数、阅读数、点赞数、收藏数、评论数、分享数、涨粉数、封面图、九图原图数组、视频直链与时长（秒）、是否报备（`is_advertise`）、合作品牌（`brand_name`）。
- **筛选维度**：博主（`--url` / `--file`，可多个）、每位采集条数（`--count`，1~200，默认 50）。
- **省心机制**：4 点/条、按实采条数自动退差（**多采不加价**）、零结果/失败全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name pgy-note-collect --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条笔记 4 点数（0.4 元）**；预扣按请求条数，结算按实采条数退差，**多采不加价**。
- 注册即送 **10 免费点数**（约可采 2 条笔记）；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 提交什么（提交前必读）

| 受理形态 | 示例 | 说明 |
|---|---|---|
| 24 位博主 ID | `5f8c1a2b3c4d5e6f7a8b9c0d` | 直接受理（最稳） |
| 蒲公英博主链接 | `https://pgy.xiaohongshu.com/solar/pre-trade/live-blogger-detail/<24位ID>` | 新版页面 |
| 小红书博主主页 | `https://www.xiaohongshu.com/user/profile/<24位ID>` | 从链接里抽 24 位 ID |

- 这里提交的是**博主**，不是单篇笔记（采单篇笔记的互动数请用小红书 `xhs-dpt` skill）。
- 纯字母数字但长度不是 24 → **直接拒单，不扣费**。
- 单次最多 **200 个博主**；每位条数上限 **200**（4 点/条，量大请先小批试跑再放大）。

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 博主链接或 24 位 ID，可重复传多次 | 三选一 |
| `--file` | 文本文件，每行一个链接/ID（`#` 开头为注释） | 三选一 |
| `--count` | 每位博主采多少条，1~200 | 50 |

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
{"ok":true,"data":{"name":"pgy-note-collect","version":"1.0.0","capability":"pgy_note_collect"}}
```

### register / login / quota / logout / config

与其它平台 skill 完全一致（同一账号体系、同一配置文件）：

```bash
node cli.js register --link --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js login --link --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js quota --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js logout --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

### submit — 提交笔记采集任务

```bash
node cli.js submit --url "https://www.xiaohongshu.com/user/profile/5f8c..." --count 20 --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js submit --url "<24位ID>" --count 50 --wait --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js submit --url "<ID1>" --url "<ID2>" --count 10 --wait --skill-name pgy-note-collect --ai-entry <ai-entry>
node cli.js submit --file 博主名单.txt --count 30 --wait --skill-name pgy-note-collect --ai-entry <ai-entry>
```

- 链接不合法时**一次性汇总所有问题项**并拒单，**不扣费**。
- 幂等键按内容派生，同批重试不重复扣费；`--force` 混入时间戳生成新键。

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261030_7c8d9e0f","total":1,"valid_count":1,"invalid_count":0,
 "charged":20,"quota_balance":30,"status":"pending","estimated_points":20,"price_per_unit":1}}
```

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] --skill-name pgy-note-collect --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261030_7c8d9e0f","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"blogger_user_id":"5f8c...","requested_count":20,"collected_count":8,
             "settle_charged":8,"refunded_diff":12,
             "notes":[{"note_id":"6712...","note_type":1,"title":"秋天的第一支口红",
                       "tag_list":"口红,试色,秋日妆","read_num":12000,
                       "like_num":860,"fav_num":210,"cmt_num":43,"share_num":12,
                       "is_advertise":1,"brand_name":"某品牌",
                       "video_duration":null}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 是实采条数，`settle_charged` 是实收点数，`refunded_diff` 是退差点数 —— **按这三个字段如实向用户汇报**，不要按提交时的预扣数说。
- **该博主商业笔记不足请求条数时实采会少于请求量**，差额自动退回（示例里 20 → 实采 8，退 12 点）。
- 话题标签来自正文里的 `#话题[话题]#` 内联形式解析；正文没写话题则为空。
- `is_advertise = 1` 表示报备笔记；`brand_name` 取报备品牌名，非报备为空。
- `video_duration` 单位是**秒**；图文笔记为 `null`。
- `content` 是正文全文（MEDIUMTEXT），导出 CSV 可能较大，上报用户前建议摘要。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 博主笔记.csv --skill-name pgy-note-collect --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 笔记明细（含正文全文、九图链接、视频直链，Excel 直开）。

## 典型工作流（agent 照此执行）

1. 与用户确认博主链接/ID 清单与每位条数。
2. `node cli.js quota --skill-name pgy-note-collect --ai-entry <ai-entry>` — 确认点数够（`博主数 × 条数 × 4`，实采不足会自动退差）。
3. `node cli.js submit --url "<链接或ID>" --count N --wait --skill-name pgy-note-collect --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把笔记列表整理成表格返回；**按 `collected_count` / `settle_charged` 如实汇报计费与退差**。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name pgy-note-collect --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（ID 长度不对、链接里没有 24 位 ID、count 非法、超过 200 个博主） | 按提示修正后重提（退出码 1，不扣费） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link`；仍无法解决拨打 18722121663 |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id 是否属于当前账号 |
| `status=failed` + 零结果 | 该博主没有商业笔记，或页面异常 | 点数已全额返还 |
| `status=failed` + 博主不可见 | 博主已注销、无权限查看 | **不返还**；换博主 |
| `status=failed` + 登录/签名失效 | 蒲公英 cookie 过期或签名失败 | 全额返还；客服更新 DB system_config.pgy_cookie 后自动恢复（无需在采集节点登录） |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = `博主数 × 条数 × 4` 点；结算按**实采条数**退差，**多采不加价**。
- **零结果或失败全额返还**（无商业笔记、登录态失效、签名失效、超时）；博主不存在/不可见不返还。
- 同一用户同一博主 + 同参数 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**蒲公英数据；不用于任何违法违规用途。
- 正文与图片版权归原作者，**不得用于二次发布或商用转载**；仅限用户自身投放分析与选题参考。
- 不要向用户承诺 100% 成功；博主无商业笔记、隐私设置导致的空结果如实透出。
