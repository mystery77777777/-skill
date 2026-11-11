---
name: dcd-comments
slug: dcd-pinglun
displayName: 懂车帝评论采集（会话制）
version: 1.0.0
description: 懂车帝评论采集工具（分步会话）。当用户需要采集懂车帝资讯文章、视频或车友圈的评论——评论者昵称/ID、评论正文、所在地区、时间、点赞数、点踩数、该楼回复数、楼中楼回复、是否置顶，导出评论 CSV（Excel 直开），或提到"懂车帝评论/懂车帝车友圈评论/视频评论/评论区舆情/车主评价/这篇帖子大家在说什么"时使用本 skill。走浏览器插件端采集（内容页强制登录）。分步会话制：start 建会话（免费探测标题、作者与评论总数）后按页采集，每页 20 条主评论、楼中楼随页一并给全，扣 1 点数；某页 0 条自动返还；每步实时返回增量结果，由 AI 询问用户是否继续（注册送 10 点）。适合车主口碑调研、车型质量吐槽分析、竞品舆情监测。
---

# 懂车帝评论采集 Skill（dcd-pinglun，会话制）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name dcd-comments` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name dcd-comments --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：**分步会话制**采集懂车帝评论。先 `start`（免费探测内容标题、作者与评论总数），再按页采评论 —— 每一步返回增量结果，由 agent 决定是否继续。全部评论可导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：一级评论（主楼）+ 楼中楼（二级回复）。字段：评论 ID（`cid`）、所属内容 ID/类型、主楼 ID（`root_cid`）、父评论 ID（`parent_id`）、评论者 ID/昵称、**评论正文**（纯文本，表情已还原为文字）、**IP 属地**（`location`）、点赞数、点踩数、该楼回复数（`reply_count`）、是否置顶（`is_stick`）、发布时间。
- **★ 分页口径**：一页 **20 条主评论**，其楼中楼在同一页响应里一并给全（**不需要单独展开、不额外扣点**）。所以「20 条」指主楼，实际落库条数会更多。
- **★ 终止只看 `has_more`，不看评论总数**：懂车帝接口的 `total_number` 含回复数、且会随翻页变化（同一帖子两次请求可能不同），**不可信**。判断"采完没有"只认服务端返回的 `has_more_main`；翻页游标用服务端给的 `next_offset`，**不要自己算 offset**。
- **★ 依赖采集节点**：懂车帝内容页**强制登录**，服务端直连接口只能拿到空壳/JS 反爬页，必须由浏览器插件在**已登录懂车帝**的节点上打开页面采集。没有在线节点时会话建立就失败或卡住。
- **不支持**：用户主页、搜索结果页、车系页、口碑/问答、其它站点链接；`start` 时直接报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name dcd-comments --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **每页 1 点数**（1 页 = 20 条主评论 + 其全部楼中楼，0.1 元）。
- 用 `start` 探测、`status`、`comments`、`export`、`finish` **都不扣费**。
- 注册即送 **10 免费点数**，即 10 页（约 200 条主评论 + 楼中楼）。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 分步采集流程（核心）

```
start --url <内容链接>        免费：建会话，返回 session_id、title、author、评论总数、类型
  ↓  （把标题/作者/评论总数报给用户，问要不要采）
step --session <id> --page   扣 1 点：采下一页 20 条主评论 + 其楼中楼
  ↓  （报本页增量 + 累计量；看 has_more_main 决定是否继续，继续前先问用户）
repeat step ...
  ↓
comments --session <id>      免费：拉本会话已累计的评论明细（分页查看）
export --session <id>        免费：导出累计评论 CSV
finish --session <id>        主动结束（空闲 20 分钟也会自动过期，不额外扣费）
```

- 一个会话只对应**一篇内容**。要多篇请分别 `start`，不要在一个会话里换链接。
- 会话空闲 **20 分钟**自动过期，过期后不能再 `step`，已采到的评论仍在（可继续 `comments`/`export`）。
- 每步返回：`page_no`、本页 `comments` 数组（含 `sub_comments`）、`mains_collected`、`subs_collected`、`has_more_main`、`next_offset`、`refunded_this_step`。
- 某页一条主评论都没采到 → 本页 1 点**自动返还**（`refunded_this_step=true`），`no_more` 为真时也表示已到底。

## 参数（提交前必读）

| 命令 | 参数 | 说明 |
|---|---|---|
| `start` | `--url` | 内容链接（必填，一篇一个会话） |
| `step` | `--session` | 会话 ID（32 位 hex，`start` 返回） |
| | `--page` | 步进类型，目前只支持 `page`（表示"下一页主评论"） |
| `status` / `comments` / `export` / `finish` | `--session` | 会话 ID |
| `comments` | `--page` / `--page-size` | 查看已采明细的分页（默认 1 / 100，不扣费） |
| `sessions` | `--status` / `--page` | 列出自己的会话（`active` 只看进行中） |
| `export` | `--out` | 输出文件路径，默认 `<session前8位>_dcd_comments.csv` |

支持的链接示例：

```
资讯文章  https://www.dongchedi.com/article/7704153144573461016
视频      https://www.dongchedi.com/video/7704146197522678297
车友圈    https://www.dongchedi.com/ugc/article/7703440576271893017
          （/ugc/video/<id> 也收；m.dongchedi.com 与不带 www 的域名同口径）
```

- **★ 类型可能被服务端校正**：`/article/<id>` 有可能 302 跳到 `/ugc/article/<id>`（车友圈），会话的 `source_type` 以节点打开的最终地址为准。
- 链接可以不带协议头。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：10 免费点数在注册成功后发放。
- 首次使用先 `register --link` 或 `login --link`，成功后 token 自动保存。
- 配置文件在 `~/.xhs-platform/config.json`（与其它平台 skill 共用账号体系），可用 `XHS_CONFIG_PATH` 覆盖。
- 后端地址默认 `http://st.aidata366.com`，可用 `config set base-url <url>` 或单次 `--base-url` 覆盖。
- **⚠️ 安全提示**：默认地址是明文 http，token 会明文传输；`config.json` 含 token，不要泄露、不要提交 git。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<码>,"message":"..."}`。
- 交互提示、每页进度走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

```bash
node cli.js version
node cli.js register --link --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js login --link --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name dcd-comments --ai-entry <ai-entry>

node cli.js start --url "https://www.dongchedi.com/ugc/article/7703440576271893017" --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js step --session <session_id> --page --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js status --session <session_id> --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js comments --session <session_id> --page 1 --page-size 100 --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js export --session <session_id> --out 评论.csv --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js finish --session <session_id> --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js sessions --status active --skill-name dcd-comments --ai-entry <ai-entry>

node cli.js quota --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js logout --skill-name dcd-comments --ai-entry <ai-entry>
node cli.js config show
```

### start

```bash
node cli.js start --url "https://www.dongchedi.com/ugc/article/7703440576271893017" --skill-name dcd-comments --ai-entry <ai-entry>
```

返回字段：`session_id`、`content_id`、`source_type`、`title`、`author_nickname`、`metrics.comment_count`（评论总数，**仅供参考、不可作为翻页依据**）、`status`。**这一步免费**。

### step

```bash
node cli.js step --session <session_id> --page --skill-name dcd-comments --ai-entry <ai-entry>
```

返回本页增量：`page_no`、`comments`（含 `sub_comments`）、`mains_collected`、`subs_collected`、`has_more_main`、`next_offset`、`refunded_this_step`、`charged_steps`。**每步扣 1 点**。

### export

```bash
node cli.js export --session <session_id> --out 评论.csv --skill-name dcd-comments --ai-entry <ai-entry>
```

CSV 结构：

- 第 1 段「内容汇总」：`session_id,content_id,source_type,title,comment_total,author_name,pages_collected,mains_collected,subs_collected,charged_steps,status`
- 空一行
- 第 2 段「评论明细」：`content_id,source_type,cid,root_cid,parent_id,commenter_id,nickname,content,location,like_count,dislike_count,reply_count,is_stick,publish_time`

BOM 头，Excel 直开不乱码。**挂接关系**：主楼 `parent_id = '0'`；楼中楼 `parent_id` 指向它所回复的那条评论的 `cid`，`root_cid` 始终指向所在主楼 —— 需要树形结构时按 `root_cid` 分组、按 `parent_id` 建父子。

## 典型工作流（agent 照此执行）

1. 确认用户给的是**资讯文章 / 视频 / 车友圈**链接；不支持的链接直接说明，别硬试。
2. `node cli.js start --url <链接> --skill-name dcd-comments --ai-entry <ai-entry>` → 把 `title`、`author_nickname`、评论总数报给用户，**问一句"要采吗，每页 20 条主评论扣 1 点"**。
3. 用户同意后 `node cli.js step --session <id> --page --skill-name dcd-comments --ai-entry <ai-entry>`，把本页增量（主楼 N 条 + 楼中楼 M 条）和累计量报出来。
4. **每步之后看 `has_more_main`**：为真就问"还有下一页，继续吗（再扣 1 点）"；为假就说已采完。**不要自己按评论总数除 20 算页数**，那个数不可信。
5. 采完或用户喊停：`node cli.js export --session <id> --out <文件名>.csv --skill-name dcd-comments --ai-entry <ai-entry>`，再 `finish`。
6. 中途用户想先看看已采的：`node cli.js comments --session <id> --skill-name dcd-comments --ai-entry <ai-entry>`（免费）。

## 错误处理指引

| code / 状态 | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 / session_id 格式不对 | 检查链接或会话 ID（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 3006 | 会话不存在 / 已结束 / 已过期 | 会话空闲 20 分钟自动过期，重新 `start`（已采评论仍可 export） |
| 节点报 `login_required` | **采集节点浏览器未登录懂车帝** | 让用户登录懂车帝并重载插件，重新 `start`；本步点数已返还 |
| `fail_kind=unavailable` | 内容不存在/已删除/无权限 | **不返还**，如实告知用户 |
| `fail_kind=service` | 服务侧抓取异常（反爬拦截、页面结构变化） | **全额返还**，建议稍后重试 |
| `refunded_this_step=true` | 本页 0 条，点数已返还 | 如实告知，不要重复狂点 `step` |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- **只有 `step` 扣费**，每页 1 点；`start` / `status` / `comments` / `export` / `finish` / `sessions` 全免费。
- 一页 = 20 条主评论，其楼中楼随页给全，**不额外计费**。
- 某页 0 条 → 本页点数自动返还。
- 内容不存在/已删除（业务侧失败）→ **不返还**。
- 服务侧抓取异常/节点未登录（`login_required`）→ **全额返还**。
- 会话过期不额外扣费，只是不能再 `step`。

## 红线

- 仅采集**公开**内容；不用于任何违法违规用途，不要绕过付费墙/登录墙（节点上的登录态是用户自己的账号）。
- **不要向用户报"共 X 页"**：评论总数含回复且会变，页数无法预先算准；只能按 `has_more_main` 一步一步走。
- 不要向用户承诺 100% 成功；反爬拦截导致的失败如实透出，不要编造评论。
- 评论正文按页面原文落库，不要"润色"、不要补写、不要改写错别字。
- 不要把楼中楼重复算成主楼（`parent_id='0'` 才是主楼），报数时分开说"主楼 X 条 / 楼中楼 Y 条"。
