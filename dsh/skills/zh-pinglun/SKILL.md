---
name: zh-pinglun
slug: zh-pinglun
displayName: 知乎评论采集（会话制）
version: 1.0.0
description: 知乎评论采集工具（分步会话）。当用户需要采集知乎专栏文章或回答下的评论——评论者昵称/ID、评论正文、点赞数、点踩数、该楼回复数、楼中楼回复、是否作者本人/作者置顶/热门/折叠、发布时间，导出评论 CSV（Excel 直开），或提到"知乎评论/知乎文章评论/知乎回答评论/评论区舆情/这个回答下面大家在说什么"时使用本 skill。走浏览器插件端采集（需节点已登录知乎，服务端直连会被 40352 人机墙拦）。分步会话制：start 建会话（免费探测标题、作者与评论总数）后按页采集，★每页 10 条主评论（知乎 v5 limit 写死 10，不是 20）、楼中楼随页一并给全不额外扣点，扣 1 点数；某页 0 条自动返还；每步实时返回增量结果，由 AI 询问用户是否继续（注册送 10 点）。★知乎 v5 评论没有 IP 属地，导出不含地区列。适合知乎内容舆情分析、评论区观点提炼、竞品口碑调研。
---

# 知乎评论采集 Skill（zh-pinglun，会话制）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name zh-comments` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name zh-comments --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：**分步会话制**采集知乎评论。先 `start`（免费探测标题、作者与评论总数），再按页采评论 —— 每一步返回增量结果，由 agent 决定是否继续。全部评论可导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：一级评论（主楼）+ 楼中楼（二级回复）。字段：评论 ID（`cid`）、所属内容 ID/类型、主楼 ID（`root_cid`）、父评论 ID（`parent_id`）、评论者 ID/昵称、**评论正文**（`content` 纯文本 / `rich_content` 原始富文本）、点赞数、点踩数、该楼回复数（`reply_count`）、是否作者本人（`is_author`）、是否作者置顶（`is_author_top`）、是否热门（`hot`）、是否被折叠（`collapsed`）、发布时间。
- **★ 一页 = 10 条主评论**：知乎 v5 接口的 `limit` 写死 10（传 20/30 也只给 10），所以本 skill 一页就是 10 条主楼 + 其楼中楼，扣 1 点数。
- **★ 楼中楼随页给全，不需要单独展开**：主评论响应里已内嵌 `child_comments`，节点只在不足时补拉，**不额外扣点、也没有 expand 步**（`type` 只支持 `page`）。
- **★ 终止只看 `has_more_main`，不看评论总数**：`counts.total_counts` 含楼中楼，**不能用来算页数**。翻页游标是**复合字符串**（形如 `5_11407600139_0`），由服务端落库并透传给采集节点，agent 不要自己拼 `offset`。
- **★ 依赖采集节点已登录知乎**：知乎对游客全拦（`40352 unhuman` 人机墙），必须由浏览器插件在**已登录知乎**的节点上、于知乎页面上下文里发起请求（免 `x-zse-96` 签名）。节点未登录会明确报错并**返还本步点数**。
- **不支持**：专栏主页、用户主页、问题页（不带 answer）、想法、搜索结果页、其它站点链接；`start` 时直接报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name zh-comments --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **每页 1 点数**（1 页 = 10 条主评论 + 其全部楼中楼，0.1 元）。
- 用 `start` 探测、`status`、`comments`、`export`、`finish` **都不扣费**。
- 注册即送 **10 免费点数**，即 10 页（约 100 条主评论 + 楼中楼）。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 分步采集流程（核心）

```
start --url <文章/回答链接>    免费：建会话，返回 session_id、类型、标题、作者、评论总数
  ↓  （把标题/作者/评论总数报给用户，问要不要采）
step --session <id> --page   扣 1 点：采下一页 10 条主评论 + 其楼中楼
  ↓  （报本页增量 + 累计量；看 has_more_main 决定是否继续，继续前先问用户）
repeat step ...
  ↓
comments --session <id>      免费：拉本会话已累计的评论明细（分页查看）
export --session <id>        免费：导出累计评论 CSV
finish --session <id>        主动结束（空闲 20 分钟也会自动过期，不额外扣费）
```

- 一个会话只对应**一篇内容**（一篇文章 或 一个回答）。要多篇请分别 `start`，不要在一个会话里换链接。
- 会话空闲 **20 分钟**自动过期，过期后不能再 `step`，已采到的评论仍在（可继续 `comments` / `export`）。
- 每步返回：`page_no`、本页 `comments` 数组（含 `sub_comments`）、`mains_collected`、`subs_collected`、`has_more_main`、`next_offset`、`refunded_this_step`、`charged_steps`。
- 某页一条主评论都没采到 → 本页 1 点**自动返还**（`refunded_this_step=true`）；`no_more` 为真表示已到底（本次不扣费）。
- **跨页重复已去重**：知乎分页边界会重发上一页尾部评论，节点侧按 `cid` 记账，服务端落库按 `uk(user_id, content_id, cid)` 去重，`mains_collected` 是**真正新增**的条数（回传里 `dup_skipped` 是本页被跳过的重复数）。

## 参数（提交前必读）

| 命令 | 参数 | 说明 |
|---|---|---|
| `start` | `--url` | 内容链接（必填，一篇一个会话） |
| `step` | `--session` | 会话 ID（32 位 hex，`start` 返回） |
| | `--page` | 步进类型，目前只支持 `page`（表示"下一页主评论"） |
| `status` / `comments` / `export` / `finish` | `--session` | 会话 ID |
| `comments` | `--page` / `--page-size` | 查看已采明细的分页（默认 1 / 100，不扣费） |
| `sessions` | `--status` / `--page` | 列出自己的会话（`active` 只看进行中） |
| `export` | `--out` | 输出文件路径，默认 `<session前8位>_zh_comments.csv` |

支持的链接示例：

```
专栏文章  https://zhuanlan.zhihu.com/p/632713061
          （https://www.zhihu.com/p/632713061 也收，归一化到 zhuanlan）
回答      https://www.zhihu.com/question/508253617/answer/3125310885
          （m.zhihu.com 同路径也收；不带协议头也行）
```

- **★ 评论归属**：专栏文章的评论挂在 `articles/<id>` 下，回答的评论挂在 `answers/<id>` 下，接口路径不同但**会话协议完全一致**，agent 不需要区分，`source_type` 由服务端判定后回传。
- 只有 `/p/<id>`（文章）和 `/question/<qid>/answer/<aid>`（回答）两种路径收；`/question/<qid>`（问题页）**不收** —— 问题页没有统一的评论区，评论分散在每个回答下。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：10 免费点数在注册成功后发放。
- 首次使用先 `register --link` 或 `login --link`，成功后 token 自动保存。
- 配置文件在 `~/.xhs-platform/config.json`（与其它平台 skill 共用账号体系），可用 `XHS_CONFIG_PATH` 覆盖。
- 后端地址默认 `http://st.aidata366.com`，可用 `config set base-url <url>` 或单次 `--base-url` 覆盖。
- **⚠️ 安全提示**：默认地址是明文 http，token 会明文传输；`config.json` 含 token，不要泄露、不要提交 git。
- **⚠️ 采集节点必须已登录知乎**：本 skill 不走服务端直连（会被 40352 拦），全部请求由插件在知乎页面上下文里发出。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<码>,"message":"..."}`。
- 交互提示、每页进度走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

```bash
node cli.js version
node cli.js register --link --skill-name zh-comments --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name zh-comments --ai-entry <ai-entry>
node cli.js login --link --skill-name zh-comments --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name zh-comments --ai-entry <ai-entry>

node cli.js start --url "https://zhuanlan.zhihu.com/p/632713061" --skill-name zh-comments --ai-entry <ai-entry>
node cli.js step --session <session_id> --page --skill-name zh-comments --ai-entry <ai-entry>
node cli.js status --session <session_id> --skill-name zh-comments --ai-entry <ai-entry>
node cli.js comments --session <session_id> --page 1 --page-size 100 --skill-name zh-comments --ai-entry <ai-entry>
node cli.js export --session <session_id> --out 评论.csv --skill-name zh-comments --ai-entry <ai-entry>
node cli.js finish --session <session_id> --skill-name zh-comments --ai-entry <ai-entry>
node cli.js sessions --status active --skill-name zh-comments --ai-entry <ai-entry>

node cli.js quota --skill-name zh-comments --ai-entry <ai-entry>
node cli.js logout --skill-name zh-comments --ai-entry <ai-entry>
node cli.js config show
```

### start

```bash
node cli.js start --url "https://zhuanlan.zhihu.com/p/632713061" --skill-name zh-comments --ai-entry <ai-entry>
```

返回字段：`session_id`、`content_id`、`source_type`（`article` / `answer`）、`content_url`、`final_url`、`title`、`author_nickname`、`metrics.comment_count`（评论总数，**含楼中楼、仅供参考、不可作为翻页依据**）、`has_more_main`、`status`。**这一步免费**。

### step

```bash
node cli.js step --session <session_id> --page --skill-name zh-comments --ai-entry <ai-entry>
```

返回本页增量：`page_no`、`comments`（含 `sub_comments`）、`mains_collected`、`subs_collected`、`has_more_main`、`next_offset`、`refunded_this_step`、`charged_steps`。**每步扣 1 点**。

### export

```bash
node cli.js export --session <session_id> --out 评论.csv --skill-name zh-comments --ai-entry <ai-entry>
```

CSV 结构：

- 第 1 段「知乎内容汇总」：`session_id,content_id,source_type,title,comment_total,author_name,pages_collected,mains_collected,subs_collected,charged_steps,status`
- 空一行
- 第 2 段「评论明细」：`content_id,source_type,cid,root_cid,parent_id,commenter_id,nickname,content,rich_content,like_count,dislike_count,reply_count,is_author,is_author_top,hot,collapsed,publish_time`

BOM 头，Excel 直开不乱码。**挂接关系**：主楼 `parent_id = '0'`；楼中楼 `parent_id` 指向它所回复的那条评论的 `cid`，`root_cid` 始终指向所在主楼 —— 需要树形结构时按 `root_cid` 分组、按 `parent_id` 建父子。

**★ 知乎没有 IP 属地**：v5 评论接口不返回所在地区，所以明细里**没有 `location` 列**（懂车帝/汽车之家有）。不要向用户承诺能给地区分布。

## 典型工作流（agent 照此执行）

1. 确认用户给的是**专栏文章（`/p/<id>`）或回答（`/question/<qid>/answer/<aid>`）**链接；专栏主页、用户主页、问题页直接说明不支持，别硬试。
2. `node cli.js start --url <链接> --skill-name zh-comments --ai-entry <ai-entry>` → 把 `title`、`author_nickname`、评论总数报给用户，**问一句"要采吗，每页 10 条主评论扣 1 点"**。
3. 用户同意后 `node cli.js step --session <id> --page --skill-name zh-comments --ai-entry <ai-entry>`，把本页增量（主楼 N 条 + 楼中楼 M 条）和累计量报出来。
4. **每步之后看 `has_more_main`**：为真就问"还有下一页，继续吗（再扣 1 点）"；为假就说已采完。**不要用评论总数除 10 算页数**，那个数含楼中楼、不可信。
5. 采完或用户喊停：`node cli.js export --session <id> --out <文件名>.csv --skill-name zh-comments --ai-entry <ai-entry>`，再 `finish`。
6. 中途用户想先看看已采的：`node cli.js comments --session <id> --skill-name zh-comments --ai-entry <ai-entry>`（免费）。

## 错误处理指引

| code / 状态 | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 / session_id 格式不对 | 检查链接或会话 ID（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 3006 | 会话不存在 / 已结束 / 已过期 | 会话空闲 20 分钟自动过期，重新 `start`（已采评论仍可 export） |
| 节点报 `login_required` | **采集节点浏览器未登录知乎**（401/403 或「未登录」） | 让用户登录知乎并重载插件，重新 `start`；本步点数已返还 |
| 节点报 `risk` | 知乎风控（`40352 unhuman` / 安全验证 / 请求太频繁） | **全额返还**；让用户先在浏览器里正常刷一下知乎再重试 |
| `fail_kind=unavailable` | 内容不存在/已删除/评论区关闭/无权限 | **不返还**，如实告知用户 |
| `refunded_this_step=true` | 本页 0 条，点数已返还 | 如实告知，不要重复狂点 `step` |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- **只有 `step` 扣费**，每页 1 点；`start` / `status` / `comments` / `export` / `finish` / `sessions` 全免费。
- 一页 = **10 条主评论**，其楼中楼随页给全，**不额外计费**（这是知乎与懂车帝的主要差别：懂车帝 20 条/页）。
- 某页 0 条 → 本页点数自动返还。
- 内容不存在/已删除/评论区关闭（业务侧失败）→ **不返还**。
- 节点未登录知乎 / 触发风控 / 接口异常 → **全额返还**。
- 会话过期不额外扣费，只是不能再 `step`。

## 红线

- 仅采集**公开**内容；不用于任何违法违规用途，不要绕过付费墙/登录墙（节点上的登录态是用户自己的账号）。
- **不要向用户报"共 X 页"**：评论总数含楼中楼且会变，页数无法预先算准；只能按 `has_more_main` 一步一步走。
- **不要自己拼翻页游标**：知乎 v5 的 `offset` 是复合字符串（如 `5_11407600139_0`），必须原样透传，自己算 `page*10` 会漏页或死循环。
- **不要把"10 条/页"说成"20 条/页"**：知乎 v5 的 `limit` 写死 10，传 20/30 也只返回 10。
- 不要向用户承诺 100% 成功；反爬拦截导致的失败如实透出，不要编造评论。
- 评论正文按页面原文落库，不要"润色"、不要补写、不要改写错别字；`content` 是纯文本，`rich_content` 是原始富文本，需要图片/链接时读 `rich_content`。
- 不要把楼中楼重复算成主楼（`parent_id='0'` 才是主楼），报数时分开说"主楼 X 条 / 楼中楼 Y 条"。
