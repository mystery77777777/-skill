---
name: ah-stats
slug: ah-hudongshu
displayName: 汽车之家互动数采集
version: 1.0.0
description: 汽车之家互动数采集工具，支持论坛帖子、资讯文章、车家号三类链接。当用户需要某一篇汽车之家内容的浏览量、回复数、点赞数、收藏数、分享数，或者要"看这篇帖子热不热/这条内容有多少人看/对比几个帖子的热度/隔几天再采一次看涨了多少"，或提到"汽车之家互动数/之家浏览量/帖子热度/点赞收藏数/播放量/舆情热度"时使用本 skill。服务端直连打接口，不需要浏览器。**每次采集留一条带时间戳的快照，同一链接反复跑可对比趋势；1 条链接 = 1 点数（注册送 10 点）**。
---

# 汽车之家互动数采集 Skill（ah-stats）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name ah-stats` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name ah-stats --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交汽车之家链接（可批量，单次最多 20 条，**三类链接可混填**）→ 服务端直接打之家互动数接口，落一条带 `snapshot_at` 的快照。

- **能采什么**：浏览量、主回复数、含楼中楼的总回复数、未删除回复数、点赞数、收藏数、分享数、评论数。
- **★ 为什么是"快照"**：浏览/回复/点赞会随时间变。每次采集都 `INSERT` 一条新行（按 `用户 + 类型 + 内容ID + 快照时间` 去重），**不做覆盖式更新** —— 所以同一个链接可以一天跑一次，直接看增长曲线。
- **★ 三类内容口径不同，平台没给的就是留空（NULL），不写 0**：

| 字段 | 论坛帖子 | 车家号 | 资讯文章 |
|---|---|---|---|
| `view_count` | views（浏览量） | vv（播放量） | ✗ |
| `reply_count` | replys（主回复数） | reply_count（含二级） | totalcount |
| `reply_count_all` | allreplys（含楼中楼） | ✗ | ✗ |
| `reply_count_alive` | allreplysnotdel（未删总数） | ✗ | ✗ |
| `like_count` | like_count | like_count | ✗ |
| `collect_count` | collect_count | collect_count | ✗ |
| `share_count` | share_count（之家恒返回 -1 → 落空） | 同左 | ✗ |
| `comment_count` | allreplys | totalcount | totalcount |

  > 资讯文章只能拿到评论数：之家没给 news 开 hotdata 口径（请求返回 `count: -1`）。若某条链接**所有口径都缺失**，整条按服务侧失败处理、点数全额返还，不会给你留一行全空的快照。
- **不支持**：口碑、问答、车型页、视频页链接；其它站点一律拒绝，**提交前就报错、不扣费**。
- **与 `ah-detail` 的分工**：详情管"内容写了什么"（标题/正文/图片），本 skill 只管"有多少人看/回复/点赞"。两者互不包含。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name ah-stats --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条链接 0.1 元**（1 条 = 1 点数，采一条快照）。
- 想做趋势就隔几天再跑一次，每次都是 1 点/条。
- 注册即送 **10 免费点数**，即 10 条快照。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 内容链接，**可重复传多次**（三类可混填） | — |
| `--file` | 名单文件路径，每行一个链接（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提（**做趋势时要用它**） | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一篇内容重复出现在名单里会**自动合并**，只扣一次。
- ★ **默认有 24 小时内容去重**：同一链接 24 小时内重复提交会被合并、不重复扣费，也**不会产生新快照**。要立刻再采一次做对比，必须加 `--force`。
- 链接可以不带协议头（`club.autohome.com.cn/bbs/…` 也能识别）。

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
node cli.js register --link --skill-name ah-stats --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name ah-stats --ai-entry <ai-entry>
node cli.js login --link --skill-name ah-stats --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name ah-stats --ai-entry <ai-entry>
node cli.js submit --url "https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html" --wait --skill-name ah-stats --ai-entry <ai-entry>
node cli.js submit --file 名单.txt --wait --force --skill-name ah-stats --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name ah-stats --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 互动数.csv --skill-name ah-stats --ai-entry <ai-entry>
node cli.js quota --skill-name ah-stats --ai-entry <ai-entry>
node cli.js logout --skill-name ah-stats --ai-entry <ai-entry>
node cli.js config show
```

支持的链接示例（三类可混填）：

```
论坛帖子  https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html
资讯文章  https://www.autohome.com.cn/news/202611/1318147.html
车家号    https://chejiahao.autohome.com.cn/info/12345678
```

### submit

```bash
node cli.js submit --url "https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html" --wait --skill-name ah-stats --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `content_id` | 帖子 ID（论坛）或文章 ID（资讯/车家号） |
| `source_type` | `forum` / `news` / `chejiahao` |
| `collected_count` | 实采条数（成功恒为 1） |
| `settle_charged` | 实收点数 |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条快照（含各计数与 `snapshot_at`） |

### export

```bash
node cli.js export <task_id> --wait --out 互动数.csv --skill-name ah-stats --ai-entry <ai-entry>
```

CSV 结构：前段是任务汇总（每条的状态/实收/退差/失败原因），空一行后是明细宽表（`content_id,source_type,url,snapshot_at,view_count,reply_count,reply_count_all,reply_count_alive,like_count,collect_count,share_count,comment_count,raw_json,fetched_at`）。BOM 头，Excel 直开不乱码。**空单元格 = 平台没给这个口径，不是 0。**

## 典型工作流（agent 照此执行）

1. 确认用户给的是**论坛帖子 / 资讯文章 / 车家号**链接；口碑、问答、车型页、视频页就说明不支持。
2. `node cli.js submit --url <链接> --wait --skill-name ah-stats --ai-entry <ai-entry>`（多条就重复 `--url` 或写 `--file`）。
3. 读 `result`，把各计数**按类型解释**：论坛说"浏览/主回复/总回复/赞/收藏"，车家号说"播放/回复/赞/收藏"，资讯只能说"评论数"。
4. **空着的字段要主动说明"平台没有这个口径"**，绝对不能说成 0、也不要自己估算。
5. 用户要做趋势 → 提醒"默认 24 小时去重，想立刻再采一次得加 `--force`"，并在导出后按 `snapshot_at` 排序展示。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 | 检查三类链接格式（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 5001 | 上游接口失败（服务暂不可用） | 告知稍后重试，本单不产生扣费 |
| `fail_kind=unavailable` | 内容不存在/已删除 | **不返还**，如实告知用户 |
| `fail_kind=service` | 互动数接口异常 / 全部口径缺失 / 风控拦截 | **全额返还**，建议稍后重试 |
| 4290 | 触发限流 | 稍后重试（车家号静默 20~60 秒恢复） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数，受理时预扣，采一条快照。
- 内容不存在/已删除（业务侧失败）**不返还**。
- 服务侧抓取异常、或所有口径都缺失（例如资讯页接口抽风）**全额返还**。
- `query` / `export` / `quota` 不扣费。

## 红线

- 仅采集**公开**数据；不用于任何违法违规用途。
- **绝不把缺失当 0**：`-1`、空串、字段缺失一律按"没有这个数据"报告，不要填 0，也不要用"大概""估算"糊过去。
- 快照是瞬时值，不要跨快照求和（把两天的浏览量加起来没有意义），要么看最新一条，要么看差值。
- 不要向用户承诺 100% 成功；之家风控导致的失败如实透出。
