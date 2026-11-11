---
name: sohu-detail
slug: sohu-post-detail
displayName: 搜狐文章详情采集
version: 1.0.0
description: 搜狐文章详情采集工具，支持 www.sohu.com/a/<id>_<id> 文章链接。当用户给出具体搜狐文章链接，需要采集标题、作者（媒体号）、发布时间、正文全文、摘要、关键词、封面图、评论数，导出 CSV（Excel 直开），或提到"搜狐文章正文/文章详情/这篇文章讲什么/采集搜狐详情"时使用本 skill。服务端直连抓取，不需要浏览器。**1 条链接 = 1 点数；文章不存在/已删除不返还，抓取异常全额返还（注册送 10 点）。**
---

# 搜狐文章详情采集 Skill（sohu-detail）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name sohu-detail` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name sohu-detail --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交搜狐文章链接（可批量，单次最多 20 条）→ 服务端直接抓文章页 SSR、解析 `og:` 元标签与 `cfgs` 配置对象、提取 `<article>` 正文，拍平成一张宽表。

- **能采什么**：标题、作者（媒体号名）、媒体号 ID、频道/分类 ID、**正文全文**（按段落换行）、摘要、关键词、封面图、发布时间、评论数、原文 ID / 转载状态。
- **省心机制**：服务端直连（不用开浏览器/插件），1 条 1 点、实采恒 1 条无差值可退、抓取异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- **不支持**：搜狐首页/频道页（`/guonei` 等）/搜索结果页/视频页（`tv.sohu.com`、`v.sohu.com`）链接；其它站点一律拒绝，**提交前就报错、不扣费**。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name sohu-detail --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条链接 0.1 元**（1 条 = 1 点数）。
- 注册即送 **10 免费点数**，即 10 篇详情。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 文章链接，**可重复传多次** | — |
| `--file` | 名单文件路径，每行一个链接（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一篇文章（同 `news_id`）重复出现在名单里会**自动合并**，只扣一次。
- 链接可以不带协议头（`www.sohu.com/a/…` 也能识别），带 `?scm=&spm=` 与 `#comment_area` 会自动归一化。

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
node cli.js register --link --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js login --link --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js submit --url "https://www.sohu.com/a/1096460185_162522" --wait --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js submit --file 名单.txt --wait --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 详情.csv --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js quota --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js logout --skill-name sohu-detail --ai-entry <ai-entry>
node cli.js config show
```

### submit

```bash
node cli.js submit --url "https://www.sohu.com/a/1096460185_162522" --wait --skill-name sohu-detail --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `news_id` | 文章 ID（`/a/<news_id>_<media_id>` 第一段） |
| `collected_count` | 实采条数（成功恒为 1） |
| `settle_charged` | 实收点数 |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条详情（含正文全文） |

### export

```bash
node cli.js export <task_id> --wait --out 详情.csv --skill-name sohu-detail --ai-entry <ai-entry>
```

CSV 结构：前段是任务汇总（每条的状态/实收/退差/失败原因），空一行后是明细宽表（`news_id,media_id,url,title,author,author_id,channel_id,category_id,keywords,excerpt,cover_url,publish_time,content,original_id,original_status,display_mode,comment_count,raw_json,fetched_at`）。BOM 头，Excel 直开不乱码。

## 典型工作流（agent 照此执行）

1. 确认用户给的是 `www.sohu.com/a/<id>_<id>` 文章链接；是频道页/首页就说明不支持。
2. `node cli.js submit --url <链接> --wait --skill-name sohu-detail --ai-entry <ai-entry>`（多条就重复 `--url` 或写 `--file`）。
3. 读 `result`：`collected_count` / `settle_charged` / `refunded_diff` 如实报给用户。
4. 要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name sohu-detail --ai-entry <ai-entry>`。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 链接不合法 | 检查是否 `www.sohu.com/a/<id>_<id>`（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| `fail_kind=unavailable` | 文章不存在/已删除 | **不返还**，如实告知用户 |
| 4290 | 触发限流 | 稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数，受理时预扣。
- 文章不存在/已删除（业务侧失败）**不返还**。
- 服务侧抓取异常/超时（异常）**全额返还**。
- `query` / `export` / `quota` 不扣费。

## 红线

- 仅采集**公开**文章内容；不用于任何违法违规用途，不要绕过付费墙/登录墙。
- 不要向用户承诺 100% 成功；搜狐反爬/接口异常导致的失败如实透出。
- 转载文章的正文以搜狐页面为准，不要臆造原文出处。
