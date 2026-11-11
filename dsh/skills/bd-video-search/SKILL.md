---
name: bd-video-search
slug: bd-haokan-feed
displayName: 好看视频采集
version: 1.0.0
description: 好看视频（百度旗下，haokan.baidu.com）首页推荐流采集工具。当用户需要采集好看视频推荐流的视频列表——视频标题、视频链接、作者、时长、播放量、发布时间、封面图、视频直链，导出 CSV（Excel 直开），或提到"好看视频/百度视频/视频推荐流/视频列表采集/短视频素材"时使用本 skill。适合短视频素材收集、内容选题、竞品账号观察等场景。**每页 12 条 = 1 点数；零结果或失败全额返还（注册送 10 点）。**
---

# 好看视频采集 Skill（bd-video-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name bd-video-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name bd-video-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交页数 → 平台调度内网浏览器节点打开 `haokan.baidu.com` 推荐流，滚动触发页面自身的 feed 请求并**拦截响应**（该接口带 `hk_sign` 签名，只能由页面自己发，不能拼请求），每 12 条算一页。

- **能采什么**：视频标题、视频链接（`https://haokan.baidu.com/v?vid=…`）、作者、时长（`02:08` 文本）、播放量（原始文案，如 `25万`）、发布时间、封面图、MP4 直链。
- **采不到什么**：不逐条点进详情（控耗时与风控）；要单条详情的简介/点赞/评论数用 `bd-detail` skill。
- **省心机制**：预扣按请求页数、结算按实采页数退差、零结果/失败全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name bd-video-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **一页（12 条）0.1 元**（1 点数抵一页；预扣按请求页数、结算按实采页数退差）。
- 注册即送 **10 免费点数**。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--pages` | 1~10（每页 12 条，滚动加载，页数越多耗时越长） | 1 |
| `--wait` | 等待任务跑完再返回（默认超时 600s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 只采**首页推荐流**（`https://haokan.baidu.com/?sfrom=baidu-top`），不支持按关键词搜索——好看没有免签名的搜索接口。
- 推荐流是**个性化**的：不同时间/不同浏览器环境拿到的列表不同，重复提交会出现相同视频，属正常。

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
node cli.js register --link --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js login --link --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js quota --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js logout --skill-name bd-video-search --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

`register --link` 的 stderr 会给出可直接复制给用户的注册引导话术，**agent 必须原样发给用户**。

### submit — 提交视频采集任务

```bash
node cli.js submit --skill-name bd-video-search --ai-entry <ai-entry>                       # 1 页（12 条）
node cli.js submit --pages 3 --wait --skill-name bd-video-search --ai-entry <ai-entry>      # 3 页（约 36 条）
node cli.js submit --pages 2 --force --skill-name bd-video-search --ai-entry <ai-entry>     # 跳过 24h 去重
```

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261102_cd56ef78","total":1,"valid_count":1,"invalid_count":0,
 "charged":1,"quota_balance":9,"status":"pending","estimated_points":1,"price_per_unit":1}}
```

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] --skill-name bd-video-search --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261102_cd56ef78","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"requested_pages":1,"collected_count":12,
             "settle_charged":1,"refunded_diff":0,
             "notes":[{"vid":"4407926899160380087",
                       "url":"https://haokan.baidu.com/v?vid=4407926899160380087",
                       "title":"咱们不惹事，但也绝不怕事","author":"国际直说",
                       "duration":"02:08","play_count":"25万",
                       "publish_time":"2026-10-15 03:16:57",
                       "poster_url":"https://f7.baidu.com/it/u=...",
                       "video_url":"https://vd3.bdstatic.com/mda-...mp4"}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 实采条数、`settle_charged` 实收点数、`refunded_diff` 退差点数 —— **按这三个字段汇报**。
- `play_count` 是页面原始文案（`25万`），不是纯数字；要算总量请自行折算并说明。
- `duration` 是 `mm:ss` 文本；`publish_time` 已格式化为 `YYYY-MM-DD HH:MM:SS`。
- 视频直链带时效签名，**过期后可能 403**，需要长期可播请自行转存。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 好看视频.csv --skill-name bd-video-search --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 视频明细。

## 典型工作流（agent 照此执行）

1. 与用户确认页数（默认 1 页 = 12 条）。
2. `node cli.js quota --skill-name bd-video-search --ai-entry <ai-entry>` — 确认点数够（1 页 1 点）。
3. `node cli.js submit --pages <N> --wait --skill-name bd-video-search --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把 `items[0].result.notes` 整理成表格；按 `collected_count` / `settle_charged` 汇报。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name bd-video-search --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（pages 非正整数） | 修正后重提（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | `register --link` 或 `login --link`（退出码 2） |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| `status=failed` + 零结果 | 推荐流无数据或页面结构变化 | 点数已全额返还，稍后重试 |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = 请求页数；结算按**实采页数**退差（不满 12 条也按一页计）。
- **零结果或失败全额返还**（推荐流空、页面异常、无在线节点、超时）。
- 同一用户同一页数 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**视频列表数据；不下载、不转存版权内容用于商业分发。
- 不承诺 100% 成功；风控/改版导致的失败如实透出。
