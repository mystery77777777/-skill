---
name: dcd-stats
slug: dcd-hudongshu
displayName: 懂车帝互动数采集
version: 1.0.0
description: 懂车帝互动数采集工具，支持资讯文章、视频、车友圈三类链接。当用户需要某一篇懂车帝内容的点赞数、评论数、阅读量/播放量、分享数，或者要"看这条内容热不热/这篇车友圈有多少人看/对比几个帖子的热度/隔几天再采一次看涨了多少"，或提到"懂车帝互动数/懂车帝浏览量/播放量/点赞数/车友圈热度/舆情热度"时使用本 skill。走浏览器插件端采集（内容页强制登录）。**每次采集留一条带时间戳的快照，同一链接反复跑可对比趋势；1 条链接 = 1 点数（注册送 10 点）**。
---

# 懂车帝互动数采集 Skill（dcd-hudongshu）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name dcd-stats` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name dcd-stats --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交懂车帝链接（可批量，单次最多 20 条，**三类链接可混填**）→ 派发给已登录懂车帝的采集节点（浏览器插件）读页面内联数据 → 落一条带 `snapshot_at` 的快照。

## 采什么（三平台口径不一样，必须按类型说）

| 字段 | 资讯文章 | 视频 | 车友圈 |
|---|---|---|---|
| `digg_count` 点赞数 | ✓ | ✓ | ✓ |
| `comment_count` 评论数 | ✓ | ✓ | ✓ |
| `watch_count` 观看数 | ✓ 阅读量 | ✓ 播放量 | ✓ 阅读量 |
| `share_count` 分享数 | **✗ 空** | **✗ 空** | ✓ |

- **观看数取大值**：车友圈页面 `read_count` 和 `watch_count` 两个字段并存，其中一个常为 0（实测有 `watch_count=0` 而 `read_count=7149` 的页面）。服务端取**非空值中的较大者**，不是简单相加，也不是优先某个字段。
- **平台没有的口径留空（`NULL`），绝不写 0**：资讯/视频页面 props 里根本没有分享字段，`share_count` 是空值而不是"0 次分享"。报数时要说"这个平台没有分享数据"，不要说"分享 0 次"。
- **全字段都缺失才返还**：四个数一个都取不到视为采集失败（服务侧异常，全额返还）；只缺其中一两个（比如资讯没分享数）是正常结果，照常扣费。

- **★ 不含正文**：标题/作者/正文/图片走另一个 skill `dcd-detail`（懂车帝内容详情）。互动数只给数字快照。
- **★ 依赖采集节点**：懂车帝内容页**强制登录**，服务端直连拿不到这些字段，必须由插件在**已登录懂车帝**的节点上采集。
- **不支持**：用户主页、搜索结果页、车系页、口碑/问答、其它站点链接；提交前就报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name dcd-stats --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条链接 0.1 元**（1 条 = 1 点数）。
- 注册即送 **10 免费点数**，即 10 篇内容。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 内容链接，**可重复传多次**（三类可混填） | — |
| `--file` | 名单文件路径，每行一个链接（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一篇内容（同数字 ID）重复出现在名单里会**自动合并**，只扣一次。
- **★ 想看趋势就得跨天/隔时段重采**：24 小时内同一内容重复提交会被去重（不扣费、也不产生新快照）。要对比涨了多少，加 `--force` 或隔 24 小时以上再跑。
- 链接可以不带协议头；`m.dongchedi.com` 与不带 `www` 的域名同口径。

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
node cli.js register --link --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js login --link --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js submit --url "https://www.dongchedi.com/ugc/article/7703440576271893017" --wait --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js submit --file 名单.txt --wait --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 互动数.csv --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js quota --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js logout --skill-name dcd-stats --ai-entry <ai-entry>
node cli.js config show
```

支持的链接示例（三类可混填）：

```
资讯文章  https://www.dongchedi.com/article/7704153144573461016
视频      https://www.dongchedi.com/video/7704146197522678297
车友圈    https://www.dongchedi.com/ugc/article/7703440576271893017
          （/ugc/video/<id> 也收）
```

### submit

```bash
node cli.js submit --url "https://www.dongchedi.com/ugc/article/7703440576271893017" --wait --skill-name dcd-stats --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `content_id` | 内容 ID |
| `source_type` | `article` / `video` / `ugc`（以最终地址为准） |
| `collected_count` | 实采条数（成功恒为 1） |
| `settle_charged` | 实收点数 |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条快照（三个或四个计数） |

### export

```bash
node cli.js export <task_id> --wait --out 互动数.csv --skill-name dcd-stats --ai-entry <ai-entry>
```

CSV 结构：前段是任务汇总（`client_id,content_id,source_type,status,collected_count,settle_charged,refunded_diff,fail_reason`），空一行后是明细宽表：

```
content_id,source_type,url,snapshot_at,digg_count,comment_count,
watch_count,share_count,raw_json,fetched_at
```

BOM 头，Excel 直开不乱码。同一 `content_id` 会有多行（不同 `snapshot_at`），要算增量就按时间排序做差。

## 典型工作流（agent 照此执行）

1. 确认用户给的是**资讯文章 / 视频 / 车友圈**链接；用户主页、搜索页、车系页就说明不支持。
2. `node cli.js submit --url <链接> --wait --skill-name dcd-stats --ai-entry <ai-entry>`（多条就重复 `--url` 或写 `--file`）。
3. 读数时**按类型解释**：资讯/视频只报点赞、评论、阅读（或播放）；车友圈额外报分享。缺的字段说"平台没有这项数据"，别说 0。
4. 用户要比趋势 → 提醒去重窗口，需要就 `--force` 重采或隔天再跑，然后按 `snapshot_at` 做差。
5. 用户要正文/作者/图片 → 说明这个 skill 只给数字，改用 `dcd-detail`。

## 错误处理指引

| code / 状态 | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 | 检查三类链接格式（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 节点报 `login_required` | **采集节点浏览器未登录懂车帝** | 让用户登录懂车帝并重载插件后重提；本单**全额返还** |
| `fail_kind=unavailable` | 内容不存在/已删除/无权限 | **不返还**，如实告知用户 |
| `fail_kind=service` | 四个数一个都没取到（页面结构变化/反爬） | **全额返还**，建议稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数，受理时预扣。
- 内容不存在/已删除（业务侧失败）**不返还**。
- 四个计数**全部**缺失（服务侧异常）**全额返还**；只缺分享数等单项不返还。
- `query` / `export` / `quota` 不扣费。

## 红线

- 仅采集**公开**内容；不用于任何违法违规用途，不要绕过付费墙/登录墙。
- 互动数是「采集当时」的快照，不要跨时间点拼凑成一个数，也不要替平台补算缺失口径。
- 不要把缺失字段报成 0，不要用估算值冒充平台数据。
- 不要向用户承诺 100% 成功；反爬拦截导致的失败如实透出。
