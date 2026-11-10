---
name: bd-detail
slug: bd-post-detail
displayName: 百度内容详情采集
version: 1.0.0
description: 百度内容详情采集工具，支持百家号文章（baijiahao.baidu.com/s?id=…）与好看视频（haokan.baidu.com/v?vid=…）两类链接。当用户给出具体文章/视频链接，需要采集标题、作者、发布时间、正文、封面、视频直链、点赞数、评论数，导出 CSV（Excel 直开），或提到"百家号正文/文章详情/好看视频详情/这条链接的内容/采集详情页"时使用本 skill。**1 条链接 = 1 点数；内容不存在不返还，页面异常全额返还（注册送 10 点）。**
---

# 百度内容详情采集 Skill（bd-detail）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name bd-detail` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name bd-detail --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交链接（可批量，单次最多 20 条）→ 平台调度内网浏览器节点打开详情页，读页面自带的数据对象 + DOM 正文，服务侧拍平成一张宽表。

- **支持的两类链接**：
  - **百家号文章** `https://baijiahao.baidu.com/s?id=<数字id>`：标题、作者、发布时间、**正文全文**（按段落拼接）、首图、点赞数、评论数。
  - **好看视频** `https://haokan.baidu.com/v?vid=<vid>`：标题、作者、发布时间、简介、封面、**MP4 直链**、点赞数、评论数、时长、播放量。
- **其它链接一律拒绝**（百度新闻频道页、贴吧、知道、站外站）：提交前就是参数错误，**不扣费**。
- **省心机制**：1 条 1 点、实采恒 1 条无差值可退、页面异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name bd-detail --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条链接 0.1 元**（1 条 = 1 点数）。
- 注册即送 **10 免费点数**，即 10 条详情。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 详情页链接，**可重复传多次** | — |
| `--file` | 名单文件路径，每行一个链接（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 600s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一内容（同 `post_id`）重复出现在名单里会**自动合并**，只扣一次。
- 链接可以不带协议头（`baijiahao.baidu.com/s?id=…` 也能识别）。

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
node cli.js register --link --skill-name bd-detail --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name bd-detail --ai-entry <ai-entry>
node cli.js login --link --skill-name bd-detail --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name bd-detail --ai-entry <ai-entry>
node cli.js quota --skill-name bd-detail --ai-entry <ai-entry>
node cli.js logout --skill-name bd-detail --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

`register --link` 的 stderr 会给出可直接复制给用户的注册引导话术，**agent 必须原样发给用户**。

### submit — 提交详情采集任务

```bash
node cli.js submit --url "https://baijiahao.baidu.com/s?id=1880654407815451401" --wait --skill-name bd-detail --ai-entry <ai-entry>
node cli.js submit --url "https://haokan.baidu.com/v?vid=4407926899160380087" --wait --skill-name bd-detail --ai-entry <ai-entry>
node cli.js submit --url "<链接1>" --url "<链接2>" --wait --skill-name bd-detail --ai-entry <ai-entry>
node cli.js submit --file urls.txt --wait --skill-name bd-detail --ai-entry <ai-entry>          # 每行一个链接
```

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261102_9f8e7d6c","total":1,"valid_count":1,"invalid_count":0,
 "charged":1,"quota_balance":9,"status":"pending","estimated_points":1,"price_per_unit":1}}
```

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] --skill-name bd-detail --ai-entry <ai-entry>
```

终态输出示例（百家号）：

```json
{"ok":true,"data":{"task_id":"t_20261102_9f8e7d6c","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"post_id":"bh_1880654407815451401","collected_count":1,
             "settle_charged":1,"refunded_diff":0,
             "notes":[{"post_id":"bh_1880654407815451401","source_type":"baijiahao",
                       "url":"https://baijiahao.baidu.com/s?id=1880654407815451401",
                       "title":"时政微观察丨把加强党性修养作为终身课题",
                       "author":"央视新闻","publish_time":"2026-11-01 19:16:49",
                       "content":"党性是党员干部立身、立业、立言、立德的基石。\n党的二十届五中...",
                       "cover_url":"https://...","video_url":"",
                       "like_count":0,"comment_count":0}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 实采条数、`settle_charged` 实收点数、`refunded_diff` 退差点数 —— **按这三个字段汇报**；详情是 1 条 1 点，`refunded_diff` 一般为 0。
- **计数为 0 就是 0**（页面明确显示 0），`null` 才是「页面上没有这个数字」。
- `content` 是**段落以 `\n` 拼接的纯文本**，不含图片与排版；要看原文排版就用 `url` 打开原页。
- 部分文章（视频号/图集类）正文很短或为空，`title` 仍在，属正常。
- `like_count` / `comment_count` 是百家号页面自带数字，**不等于全站真实互动量**（百度只暴露部分）。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 百度详情.csv --skill-name bd-detail --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 详情明细（标题/作者/时间/正文/封面/直链/点赞/评论）。

## 典型工作流（agent 照此执行）

1. 收集用户给的链接，先自查：只支持 `baijiahao.baidu.com/s?id=` 与 `haokan.baidu.com/v?vid=`。
2. `node cli.js quota --skill-name bd-detail --ai-entry <ai-entry>` — 确认点数 ≥ 条数。
3. `node cli.js submit --url "<链接>" [--url "..."] --wait --skill-name bd-detail --ai-entry <ai-entry>`（≤20 条）。
4. 解析 stdout JSON，把 `items[*].result.notes` 整理成表格；正文长文只摘要，完整内容入文件。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name bd-detail --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（链接不合法、超过 20 条、未给链接） | 修正后重提（退出码 1，不扣费） |
| 1002 / 1003 | 未登录 / token 失效 | `register --link` 或 `login --link`（退出码 2） |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| `status=success` 但某条 `fail_reason` 含「不存在/已删除」 | 内容已删（业务侧失败，**不返还**） | 如实告知用户，不要重试同链接 |
| `status=failed` + 页面异常/超时 | 服务侧失败 | 点数已全额返还，可稍后重试 |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数，预扣 = 提交条数（去重后）。
- **内容不存在/已删除不返还**（这是业务判定，节点确实跑了）；**页面异常/超时/无节点全额返还**。
- 同一用户同一链接 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**页面内容；不用于任何违法违规用途，不批量抓取付费/私密内容。
- 正文版权归原作者，转述/引用需注明来源。
- 不承诺 100% 成功；页面改版导致的失败如实透出。
