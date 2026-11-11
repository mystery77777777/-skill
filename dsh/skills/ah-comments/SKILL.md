---
name: ah-comments
slug: ah-pinglun
displayName: 汽车之家评论采集（会话制）
version: 1.0.0
description: 汽车之家评论采集工具（分步会话）。当用户需要采集汽车之家论坛帖子或文章的评论——评论者昵称、楼层号（沙发/板凳）、IP 属地、评论正文、时间、点赞数、楼中楼回复，导出评论 CSV（Excel 直开），或提到"汽车之家评论/论坛评论/车家号评论/之家帖子回复/评论采集/评论区舆情/车主评价"时使用本 skill。服务端直连抓取，不需要用户开浏览器或装插件。分步会话制：start 建会话（免费探测评论总数与总页数）后按页采集，论坛一页 20 条、文章一页 10 条（均含楼中楼）扣 1 点数，某页 0 条自动返还，每步实时返回增量结果，由 AI 询问用户是否继续（注册送 10 点）。适合车主口碑调研、车型质量吐槽分析、竞品舆情监测。
---

# 汽车之家评论采集 Skill（ah-comments，会话制）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name ah-comments` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name ah-comments --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：**分步会话制**采集汽车之家评论。先 `start`（免费探测内容标题、作者、评论总数与总页数），再按页采评论 —— 每一步返回增量结果，由 agent 决定是否继续。全部评论可导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：主楼评论与楼中楼回复的评论者昵称（`nickname`）、评论者之家 ID（`commenter_id`）、评论正文（`content`）、**楼层号**（`floor` + `floor_label`，如 沙发/板凳，20 楼后文案为空）、**IP 属地**（`location`，如"福建"）、点赞数（`like_count`）、楼中楼条数（`reply_count`）、发布时间（`publish_time`）、审核状态（`delete_state`，`22` = 审核中）、来源端（`source_from`）、评论 ID（`cid`）与根评论 ID（`root_cid`）、被回复的评论 ID（`parent_id`，可还原盖楼树）。
- **服务端直连**：汽车之家 m 站与公开接口免登录、无签名、无验证码，由服务端直接抓取，**不需要用户打开浏览器或装插件**。
- **不支持**：口碑、问答、车型页、视频页的评论（本期不做）；其它站点一律拒绝，**提交前就报错、不扣费**。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name ah-comments --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **每页 0.1 元**（1 页 = 1 点数）。
  - 论坛帖子：**一页 20 条**（含楼中楼）。
  - 资讯文章 / 车家号：**一页 10 条**（含二级回复）。
  - 页大小由之家接口决定，不可调 —— 论坛比文章更划算。
- `start`（探测）**免费**；`status` / `comments` / `export` / `finish` **不扣费**。
- 注册即送 **10 免费点数**，即 10 页评论。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `start --url` | 一篇内容的链接（论坛帖子 / 资讯文章 / 车家号） | — |
| `step --session` | 32 位会话 id（`start` 返回） | — |
| `step --page` | 固定传 `page`（表示"采下一页"），不需要页码 | `page` |
| `comments --page` | 拉取已采明细的页码（免费） | 1 |
| `comments --page-size` | 每页条数（免费） | 100 |
| `export --out` | 导出文件路径 | `<session_id>_ah_comments.csv` |

- **一次会话只采一篇内容**；要采多篇请分别 `start`。
- 链接可以不带协议头（`club.autohome.com.cn/bbs/…` 也能识别）。
- 论坛链接里的 `c`/`a`/`o` 类型与 `bbsid` 会被服务端忽略（实测 7 组组合返回同帖同字节），统一按帖子 ID 采集，**不会采错帖**。
- 链接里的页码不生效：会话固定从第 1 页开始（`start` 会提示）。要跳过前几页只能靠 `step` 多跑几步。

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
node cli.js register --link --skill-name ah-comments --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name ah-comments --ai-entry <ai-entry>
node cli.js login --link --skill-name ah-comments --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name ah-comments --ai-entry <ai-entry>
node cli.js start --url "https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html" --skill-name ah-comments --ai-entry <ai-entry>
node cli.js step --session <session_id> --page --skill-name ah-comments --ai-entry <ai-entry>
node cli.js status --session <session_id> --skill-name ah-comments --ai-entry <ai-entry>
node cli.js comments --session <session_id> --page 1 --skill-name ah-comments --ai-entry <ai-entry>
node cli.js export --session <session_id> --out 评论.csv --skill-name ah-comments --ai-entry <ai-entry>
node cli.js finish --session <session_id> --skill-name ah-comments --ai-entry <ai-entry>
node cli.js sessions --status active --skill-name ah-comments --ai-entry <ai-entry>
node cli.js quota --skill-name ah-comments --ai-entry <ai-entry>
node cli.js logout --skill-name ah-comments --ai-entry <ai-entry>
node cli.js config show
```

支持的链接示例（三类，一次会话只填一条）：

```
论坛帖子  https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html
资讯文章  https://www.autohome.com.cn/news/202611/1318147.html
车家号    https://chejiahao.autohome.com.cn/info/12345678
```

### start

```bash
node cli.js start --url "https://club.autohome.com.cn/bbs/thread-c-68-81234567-1.html" --skill-name ah-comments --ai-entry <ai-entry>
```

`data` 里字段含义：

| 字段 | 含义 |
|---|---|
| `session_id` | 会话 id（32 位十六进制，后续命令都要带） |
| `source_type` | `forum` 论坛 / `news` 资讯 / `chejiahao` 车家号 |
| `content_id` | 帖子 ID（论坛）或文章 ID（资讯/车家号） |
| `title` / `author_nickname` | 内容标题、作者 |
| `forum_name` | 所属论坛（仅论坛，如"机油论坛"） |
| `metrics.comment_count` | 探测到的评论总数（空串=平台没给） |
| `total_pages` | 总页数（论坛来自 `data-pcount`；文章按总数/10 向上取整） |
| `has_more_main` | 是否还有下一页 |

> ★ 探测是**免费**的，但只探到"有没有评论、大概几页"，**不返回评论正文**。必须 `step` 才会真正落数据。

### step

```bash
node cli.js step --session <session_id> --page --skill-name ah-comments --ai-entry <ai-entry>
```

| 字段 | 含义 |
|---|---|
| `page_no` | 本次采的是第几页 |
| `comments` | 本页评论数组（含楼中楼，`sub_comments`） |
| `mains_collected` | 累计主楼条数 |
| `subs_collected` | 累计楼中楼条数 |
| `has_more_main` | 是否还有下一页（`false` = 采完） |
| `no_more` | `true` = 已无更多（本次不扣费） |
| `refunded_this_step` | `true` = 本页 0 条，本步点数已返还 |
| `quota_balance` | 剩余点数 |

### export

```bash
node cli.js export --session <session_id> --out 评论.csv --skill-name ah-comments --ai-entry <ai-entry>
```

CSV 结构：前段是会话汇总（session_id/内容 ID/类型/标题/论坛/评论总数/作者/页数/主楼数/楼中楼数/已扣步数/状态），空一行后是评论明细宽表（`content_id,source_type,cid,root_cid,parent_id,commenter_id,nickname,content,location,source_from,floor,floor_label,like_count,reply_count,delete_state,publish_time`）。BOM 头，Excel 直开不乱码。

## 典型工作流（agent 照此执行）

1. 确认用户给的是**论坛帖子 / 资讯文章 / 车家号**链接；口碑、问答、车型页、视频页就说明不支持。
2. `node cli.js start --url <链接> --skill-name ah-comments --ai-entry <ai-entry>`，把**评论总数、总页数、每页条数、预估总花费（页数 × 1 点）**报给用户。
3. **必须等用户确认**再 `step`。每 `step` 一次扣 1 点。
4. 每步之后报："第 N 页采了 X 条（含楼中楼 Y 条），累计 A 主楼 + B 楼中楼，还有/没有下一页"，然后询问是否继续。
5. 采完或用户喊停，`export` 出 CSV；不再采了就 `finish` 结束会话（不 finish 也会在空闲 20 分钟后自动过期，不额外扣费）。
6. 用户问"花了几点"就读 `status` 的 `charged_steps`，不要说成"页数"以外的东西。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 | 按报错文案里的三类链接格式核对（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 5001 | 内容探测失败：可能已删除、需要登录、或撞上之家风控 | **会话没建成、没扣点**，如实告知用户稍后重试 |
| 4290 | 触发限流 | 稍后重试（车家号有 WAF，会静默 20~60 秒后恢复） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- `start` 免费；每个 `step` 预扣 1 点。
- 某页**一条都没采到** → 本步 1 点自动返还（`refunded_this_step: true`）。
- 内容不存在/已删除 → 在 `start` 阶段就拒单，**不建会话、不扣点**。
- 服务侧抓取异常/超时 → 全额返还。
- `status` / `comments` / `export` / `finish` / `quota` 不扣费。

## 红线

- 仅采集**公开**可见的评论；不用于任何违法违规用途，不要绕过登录墙/权限墙。
- 不要向用户承诺 100% 成功；之家风控（车家号 405/567）导致的失败如实透出，不要编造数据。
- **楼中楼子回复接口只给 memberId，没有昵称和头像** —— `nickname` 为空是平台限制，不是采集失败，**绝对不要猜测或填充假的用户名**。
- 审核中（`delete_state=22`）与已屏蔽（`blocked=1`）的评论照常落库并标注，不要自行过滤掉，也不要当成正常评论统计。
