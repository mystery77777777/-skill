---
name: pgy-blogger-detail
slug: pgy-kol-detail
displayName: 蒲公英博主详情采集
version: 1.0.1
description: 蒲公英（小红书官方合作平台 pgy.xiaohongshu.com）博主详情采集工具。当用户提交蒲公英博主详情页链接 / 小红书博主主页链接 / 24 位博主 ID，需要采集这位博主的完整档案——基础信息与报价、数据总览（近 7 天活跃、邀约回复率、累计曝光、阅读与互动中位数）、粉丝分析（粉丝增长、活跃粉丝、互动/阅读/付费粉丝率）、粉丝画像（性别、年龄、TOP 地域与城市、设备、兴趣）、数据表现（曝光/阅读/互动中位数与互动率、赞藏评享中位数、千赞率）、合作单价（CPM/CPV/CPE/CPUV），导出 CSV（Excel 直开），或提到"博主详情/达人档案/达人报价/粉丝画像/蒲公英达人分析/选号尽调"时使用本 skill。适合投放前选号尽调、报价谈判、达人画像比对。**一位博主 = 4 点数（注册送 10 点）。**
---

# 蒲公英博主详情采集 Skill（pgy-blogger-detail）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name pgy-blogger-detail` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name pgy-blogger-detail --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交博主链接或 ID → 平台调度内网浏览器节点按**六组接口**采集（基础信息 `baseinfo` / 数据总览 `data_summary` / 粉丝分析 `fans_summary` / 粉丝画像 `fans_profile` / 数据表现 `notes_rate` / 合作单价 `core_data`）→ 服务侧拍平成一张宽表（60 列）。

- **能采什么**：博主 ID、昵称、小红书号、头像、地域、性别、粉丝数、图文价 / 视频价 / 最低价、健康等级、MCN；近 7 天活跃天数、48h 邀约回复率、邀约数、博主优势、笔记数、图文/视频案例、累计曝光、阅读中位数、互动中位数；粉丝增长数/增长率/超越率、28 天活跃粉丝数、活跃粉丝率、互动粉丝率、阅读粉丝率、30 天付费粉丝率；粉丝女性占比、年龄 TOP、省份 TOP5、城市 TOP5、设备 TOP、兴趣 TOP5；曝光/阅读/互动中位数与互动率、赞藏评享中位数、千赞率；CPM / CPV / CPE / CPUV。
- **两种档位**：**标准档**（默认，1 组数据表现，约 6 次接口）与 **深度档**（`--deep`，12 组全跑，约 28 次接口，耗时 3-5 倍，**价格不变**，全量原文落 `deep_json`）。
- **省心机制**：博主不存在/不可见按口径返还、登录或签名失效全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name pgy-blogger-detail --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **一位博主 4 点数（0.4 元）**，标准档/深度档同价。
- 注册即送 **10 免费点数**（约可采 2 位博主）；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 提交什么（提交前必读）

| 受理形态 | 示例 | 说明 |
|---|---|---|
| 24 位博主 ID | `5f8c1a2b3c4d5e6f7a8b9c0d` | 直接受理（最稳） |
| 蒲公英博主详情页 | `https://pgy.xiaohongshu.com/solar/pre-trade/live-blogger-detail/<24位ID>` | 新版页面；旧版 `blogger-detail/<24位ID>` 同样受理 |
| 小红书博主主页 | `https://www.xiaohongshu.com/user/profile/<24位ID>` | 从链接里抽 24 位 ID |

- **必须是 24 位字母数字 ID**（是路径参数，不是查询串）：`?userId=` / `?kolId=` 这类查询串写法在蒲公英一律 404。
- 纯字母数字但长度不是 24 → **直接拒单，不扣费**（防止从长串里误截 24 位）。
- 单次最多 **20 位**（每位 4 点，一次最多 80 点）。

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 博主链接或 24 位 ID，可重复传多次 | 二选一 |
| `--file` | 文本文件，每行一个链接/ID（`#` 开头为注释） | 二选一 |
| `--deep` | 深度档：12 组数据表现全跑 | 关（标准档） |

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
{"ok":true,"data":{"name":"pgy-blogger-detail","version":"1.0.0","capability":"pgy_blogger_detail"}}
```

### register / login / quota / logout / config

与其它平台 skill 完全一致（同一账号体系、同一配置文件）：

```bash
node cli.js register --link --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js login --link --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js quota --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js logout --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

### submit — 提交博主详情采集

```bash
node cli.js submit --url "https://pgy.xiaohongshu.com/solar/pre-trade/live-blogger-detail/5f8c..." --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js submit --url "<24位ID>" --wait --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js submit --url "<ID1>" --url "<ID2>" --url "<ID3>" --wait --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js submit --file 博主名单.txt --wait --skill-name pgy-blogger-detail --ai-entry <ai-entry>
node cli.js submit --url "<24位ID>" --deep --wait --skill-name pgy-blogger-detail --ai-entry <ai-entry>      # 深度档 12 组
```

- 链接不合法时**一次性汇总所有问题项**并拒单，**不扣费**。
- 幂等键按内容派生，同批重试不重复扣费；`--force` 混入时间戳生成新键。

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261030_4e5f6a7b","total":1,"valid_count":1,"invalid_count":0,
 "charged":3,"quota_balance":7,"status":"pending","estimated_points":3,"price_per_unit":3}}
```

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] --skill-name pgy-blogger-detail --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261030_4e5f6a7b","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"blogger_user_id":"5f8c...","collected_count":1,
             "settle_charged":3,"refunded_diff":0,
             "notes":[{"name":"某某","fans_num":125000,
                       "active_day_7d":7,"response_rate":85.2,
                       "read_median":3200,"interaction_rate":5.6,
                       "cpm":218.45,"cpv":0.02}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 正常应为 1；为 0 且 `status=failed` 说明博主不存在/不可见/登录失效。
- **合作单价在 `core.sumData` 下**（`cpm`/`cpv`/`cpe`/`cpuv`），不在 `core` 顶层 —— 服务侧已拍平到列，直接用列值即可。
- 粉丝画像的省份/城市/兴趣 TOP5 是逗号拼接字符串，设备 TOP 是 `品牌:占比` 形式。
- `total_note_count`（笔记总数）在蒲公英接口里常为空，**属正常语义**，不要当作采集失败。
- MCN 名称、视频直链、深度档 `deep_json` 等列允许为空。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 博主详情.csv --skill-name pgy-blogger-detail --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 详情宽表（60 列，Excel 直开）。

## 典型工作流（agent 照此执行）

1. 与用户确认博主链接/ID 清单（≤20 位），确认是否需要深度档。
2. `node cli.js quota --skill-name pgy-blogger-detail --ai-entry <ai-entry>` — 确认点数够（`位数 × 4`）。
3. `node cli.js submit --url "<链接或ID>" [...] [--deep] --wait --skill-name pgy-blogger-detail --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把六组指标整理成表格返回；**按 `collected_count` / `settle_charged` 如实汇报计费**。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name pgy-blogger-detail --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（ID 长度不对、链接里没有 24 位 ID、超过 20 位） | 按提示修正后重提（退出码 1，不扣费） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link`；仍无法解决拨打 18722121663 |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id 是否属于当前账号 |
| `status=failed` + 博主不可见 | 博主已注销、无权限查看、ID 不存在 | **不返还**；换博主或核对 ID |
| `status=failed` + 登录/签名失效 | 蒲公英 cookie 过期或签名失败 | 全额返还；客服更新 DB system_config.pgy_cookie 后自动恢复（无需在采集节点登录） |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = `位数 × 4`；实采恒 1 位 → 正常情况下 `refunded_diff = 0`。
- **登录态/签名失效全额返还**；**博主不存在或不可见不返还**（业务侧，已在提交前做过格式校验，正常不会踩）。
- 同一用户同一博主 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**蒲公英数据；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功；博主隐私设置、账号权限导致的失败如实透出。
- 粉丝画像等字段属平台侧估算，**不得向用户表述为精确事实**，需说明口径来源。
