---
name: bd-news-search
slug: bd-news-feed
displayName: 百度新闻页采集
version: 1.0.1
description: 百度新闻页文章列表采集工具。当用户需要采集百度新闻首页（news.baidu.com）或国内/国际/财经/科技等频道页的文章列表——标题、文章链接、所属区块、来源域名，导出 CSV（Excel 直开），或提到"百度新闻/新闻首页/新闻频道/新闻列表/百度资讯采集"时使用本 skill。适合舆情监测、行业资讯盘点、媒体转载追踪等场景。**一次页面请求 = 1 页 = 1 点数；零结果或页面异常全额返还（注册送 10 点）。**
---

# 百度新闻页采集 Skill（bd-news-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name bd-news-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name bd-news-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交频道 + 页数 → 平台调度内网浏览器节点打开 `news.baidu.com`，在**渲染后的页面**上提取文章卡片（标题、链接、所属区块、来源域名），跨区块按「标题+链接」去重，结果可导出 CSV。

- **能采什么**：文章标题、文章链接（百家号 / 新华 / 央视 / 央广 / 其它媒体站外链）、所属区块（热点要闻 / 国内 / 新闻图片 / 图文资讯 / 热门点击…）、来源域名、页码。
- **采不到什么**：不点进详情页（控耗时与风控）。要正文/作者/点赞数请用 `bd-detail` skill 逐条采。
- **省心机制**：预扣按请求页数、结算按实采退差、零结果/失败全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name bd-news-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **一次页面请求 0.1 元**（1 页 = 1 点数；预扣按请求页数、结算按实采页数退差）。
- 注册即送 **10 免费点数**；点数不足时提示用户充值。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--channel` | `home`=首页 / `guonei`=国内 / `guoji`=国际 / `mil`=军事 / `finance`=财经 / `ent`=娱乐 / `sports`=体育 / `internet`=互联网 / `tech`=科技 / `game`=游戏 / `lady`=女人 / `auto`=汽车 / `house`=房产 | `home` |
| `--pages` | 1~10（**首页没有翻页，传 >1 会被按 1 处理并在 stderr 提示**） | 1 |
| `--wait` | 等待任务跑完再返回（默认超时 600s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 频道值传白名单外的**直接报错（不扣费）**，因为频道决定目标 URL，猜不出来。
- **频道页现状（重要）**：2026-11-02 实测 `/guonei`、`/guoji`、`/tech`、`/finance` 等频道页在百度侧返回 **HTTP 500**（`news.baidu.com 当前无法处理此请求`），不是本平台问题。此时任务按服务侧失败**全额返还**，可以建议用户稍后重试或改用首页。首页正常可用。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：10 免费点数在注册成功后发放。
- 首次使用先 `register --link`（注册即送 10 点）或 `login --link`（已有账号），成功后 token 自动保存。
- 配置文件（含 token）在 `~/.xhs-platform/config.json`（与小红书/抖音/快手/B站/微博系列 skill 共用同一账号体系），可用 `XHS_CONFIG_PATH` 覆盖。
- 后端地址默认 `http://st.aidata366.com`，可用 `config set base-url <url>` 或单次 `--base-url` 覆盖。
- **⚠️ 安全提示**：默认地址是明文 http，token 会明文传输；环境允许建议切 https。`config.json` 含 token，不要泄露、不要提交 git。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<码>,"message":"..."}`。
- 交互提示、轮询进度走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

```bash
node cli.js version
node cli.js register --link --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js login --link --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js quota --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js logout --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show
```

`register --link` 的 stderr 会给出可直接复制给用户的注册引导话术，**agent 必须原样发给用户**。

### submit — 提交新闻采集任务

```bash
node cli.js submit --skill-name bd-news-search --ai-entry <ai-entry>                                  # 首页 1 页
node cli.js submit --channel guonei --pages 3 --wait --skill-name bd-news-search --ai-entry <ai-entry>
node cli.js submit --channel home --wait --skill-name bd-news-search --ai-entry <ai-entry>            # 首页（忽略 --pages）
node cli.js submit --channel tech --force --skill-name bd-news-search --ai-entry <ai-entry>           # 跳过 24h 去重强制重提
```

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20261102_ab12cd34","total":1,"valid_count":1,"invalid_count":0,
 "charged":1,"quota_balance":9,"status":"pending","estimated_points":1,"price_per_unit":1}}
```

带 `--wait` 时输出同 `query` 的完整结果（默认超时 600s，单页约 10-30 秒）。

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id> [--wait] [--interval 秒] [--timeout 秒] --skill-name bd-news-search --ai-entry <ai-entry>
```

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20261102_ab12cd34","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"status":"success",
   "result":{"channel":"home","requested_pages":1,"collected_count":147,
             "settle_charged":1,"refunded_diff":0,
             "notes":[{"title":"时政微观察丨把加强党性修养作为终身课题",
                       "url":"http://baijiahao.baidu.com/s?id=1880654407815451401",
                       "section":"热点要闻","page_num":1}]}}]}}
```

**解读要点（agent 必读）**：
- `collected_count` 是实采条数，`settle_charged` 是实收点数，`refunded_diff` 是退差点数 —— **按这三个字段如实汇报**，不要拿预扣数说。
- 首页一次能拿 **140~180 条**（2026-11-03 实测 147/170 条；含少量百度推广位卡片，属正常）。
  条数随首页内容更新浮动，但**计费恒为 1 页 = 1 点**，与条数无关。
- `section` 为空的少数条目是没落在任何带标题区块里的卡片。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 百度新闻.csv --skill-name bd-news-search --ai-entry <ai-entry>
```

两段式 CSV（BOM 头）：任务汇总 + 文章明细（标题/链接/区块/来源域名/页码）。

## 典型工作流（agent 照此执行）

1. 与用户确认频道与页数（默认首页 1 页）；提醒频道页当前可能 500。
2. `node cli.js quota --skill-name bd-news-search --ai-entry <ai-entry>` — 确认点数够（1 页 1 点）。
3. `node cli.js submit --channel <C> --pages <N> --wait --skill-name bd-news-search --ai-entry <ai-entry>`。
4. 解析 stdout JSON，把 `items[0].result.notes` 整理成表格返回；按 `collected_count` / `settle_charged` 如实汇报。
5. 用户要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name bd-news-search --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误（频道不在白名单、pages 非正整数） | 修正后重提（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | `register --link` 或 `login --link`（退出码 2） |
| 3001 | 点数不足 | 提示充值，不要重试（退出码 3） |
| `status=failed` + 失败原因含 `HTTP 500` | 百度频道页服务端异常 | 点数已全额返还，改用首页或稍后重试 |
| `status=failed` + 零结果 | 页面结构变化或页面空白 | 点数已全额返还，稍后重试；连续出现请联系客服 |
| TIMEOUT | 轮询超时 | 稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 预扣 = 请求页数（首页强制 1 页）；结算按**实采页数**退差。
- **零结果或失败全额返还**（页面异常、频道 500、无在线节点、超时）。
- 同一用户同一频道 + 页数 24h 内默认去重；`--force` 强制重提会正常扣费（内容仍可能重复，需自行去重）。

## 红线

- 仅采集**公开**新闻页面数据；不用于任何违法违规用途。
- 不承诺 100% 成功；百度侧变更导致的失败如实透出。
