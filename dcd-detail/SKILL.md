---
name: dcd-detail
slug: dcd-detail
displayName: 懂车帝内容详情采集
version: 1.0.0
description: 懂车帝内容详情采集工具，支持资讯文章、视频、车友圈三类链接。当用户给出具体懂车帝链接，需要采集标题、摘要、作者、发布时间、正文全文、正文图片、所属栏目、话题标签，导出 CSV（Excel 直开），或提到"懂车帝文章正文/视频简介/车友圈内容/这篇帖子讲什么/采集懂车帝详情"时使用本 skill。走浏览器插件端采集（懂车帝内容页强制登录，服务端抓不到）。**1 条链接 = 1 点数；内容不存在/已删除不返还，抓取异常全额返还（注册送 10 点）。**
---

# 懂车帝内容详情采集 Skill（dcd-detail）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name dcd-detail` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name dcd-detail --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交懂车帝链接（可批量，单次最多 20 条，**三类链接可混填**）→ 派发给已登录懂车帝的采集节点（浏览器插件）→ 解析 `<script id="__NEXT_DATA__">` 内联数据 → 拍平成一张宽表。

- **能采什么**：标题、摘要、作者名/作者 ID/头像、发布时间、**正文**（资讯与视频是 HTML 富文本，车友圈常为空壳）、正文图片真址数组（`images_json`）、所属栏目（`column_name`）、话题标签（`topic_tags`）、视频 ID（`video_id`，仅留痕无直链）、时长（`duration`）、内容形态（`article_type`）、**最终地址**（`final_url`，跳转后）。
- **省心机制**：1 条 1 点、实采恒 1 条无差值可退、抓取异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- **★ 不含互动数**：点赞/评论/观看数走另一个 skill `dcd-hudongshu`（懂车帝互动数）。详情与互动数分两次采集，互不影响。
- **★ 依赖采集节点**：懂车帝内容页**强制登录**（未登录 302 到 `/login-required` 且返回 JS 反爬壳），服务端直连接口拿不到正文，必须由浏览器插件在**已登录懂车帝**的节点上打开页面采集。没有在线节点时任务会卡在排队，超时后全额返还。
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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name dcd-detail --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
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
- 同一篇内容（同数字 ID）重复出现在名单里会**自动合并**，只扣一次。**注意 `/article/<id>` 与 `/ugc/article/<id>` 共用同一个数字 ID，也按同一条合并。**
- 链接可以不带协议头（`www.dongchedi.com/article/…` 也能识别）；`m.dongchedi.com` 与不带 `www` 的域名同口径。
- **★ 类型可能被服务端校正**：`/article/<id>` 有可能 302 跳到 `/ugc/article/<id>`（车友圈）。入参判定的 `source_type` 只是参考，**落库的 `source_type` 以节点打开的最终地址为准**，`final_url` 记录跳转后地址。报给用户时按落库类型说。

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
node cli.js register --link --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js login --link --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js submit --url "https://www.dongchedi.com/article/7704153144573461016" --wait --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js submit --file 名单.txt --wait --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 详情.csv --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js quota --skill-name dcd-detail --ai-entry <ai-entry>
node cli.js logout --skill-name dcd-detail --ai-entry <ai-entry>
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
node cli.js submit --url "https://www.dongchedi.com/article/7704153144573461016" --wait --skill-name dcd-detail --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `content_id` | 内容 ID（文章 / 视频 / 车友圈动态都用同一个数字 ID） |
| `source_type` | `article` / `video` / `ugc`（**以最终地址为准**） |
| `collected_count` | 实采条数（成功恒为 1） |
| `settle_charged` | 实收点数 |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条详情（含正文） |
| `worker_id` / `node_worker_id` | 接单节点，排障用 |

### export

```bash
node cli.js export <task_id> --wait --out 详情.csv --skill-name dcd-detail --ai-entry <ai-entry>
```

CSV 结构：前段是任务汇总（`client_id,content_id,source_type,status,collected_count,settle_charged,refunded_diff,fail_reason`），空一行后是明细宽表：

```
content_id,source_type,url,final_url,title,abstract,author_name,author_id,
author_avatar,publish_time,content,images_json,column_name,topic_tags,
video_id,duration,article_type,raw_json,fetched_at
```

BOM 头，Excel 直开不乱码。`raw_json` 是页面内联原始数据（已剔除正文字段，不重复占空间）。

## 典型工作流（agent 照此执行）

1. 确认用户给的是**资讯文章 / 视频 / 车友圈**链接；用户主页、搜索页、车系页、口碑问答就说明不支持。
2. `node cli.js submit --url <链接> --wait --skill-name dcd-detail --ai-entry <ai-entry>`（多条就重复 `--url` 或写 `--file`，三类可混填）。
3. 读 `result`：`collected_count` / `settle_charged` / `refunded_diff` 如实报给用户；`source_type` 若与用户预期不同（比如他给的是 `/article/` 却落成 `ugc`），要主动说明是页面跳转导致。
4. 要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name dcd-detail --ai-entry <ai-entry>`。
5. 用户问点赞/评论/观看数 → 说明这个 skill 不含互动数，改用 `dcd-hudongshu`。

## 错误处理指引

| code / 状态 | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 | 检查三类链接格式（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| 5001 | 上游抓取前置失败（服务暂不可用） | 告知稍后重试，本单不产生扣费 |
| 节点报 `login_required`（**最常见**） | **采集节点浏览器未登录懂车帝** | 让用户在那个浏览器登录懂车帝并重载插件后重提；本单**全额返还**（`fail_reason` 里能看到 "login_required" 字样） |
| `fail_kind=unavailable` | 内容不存在/已删除/无权限 | **不返还**，如实告知用户 |
| `fail_kind=service` | 服务侧抓取异常（含反爬拦截、页面结构变化） | **全额返还**，建议稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数，受理时预扣。
- 内容不存在/已删除（业务侧失败）**不返还**。
- 服务侧抓取异常/超时/节点未登录（`login_required`）**全额返还**。
- `query` / `export` / `quota` 不扣费。
- 24 小时内同一内容重复提交会被去重（不扣费），确需重采加 `--force`。

## 红线

- 仅采集**公开**内容；不用于任何违法违规用途，不要绕过付费墙/登录墙（采集节点上的登录态是用户自己的账号，不是破解）。
- 不要向用户承诺 100% 成功；反爬拦截导致的失败如实透出，不要编造正文。
- 正文按页面原文落库，不要"润色"或补写缺失段落。**车友圈动态的正文常常是空的**（内容在图片或视频里），要如实说"这条没有文字正文"，不要硬凑。
- 视频只能拿到标题/摘要/作者/时长，**不要承诺能下载视频**（`video_id` 仅留痕）。
