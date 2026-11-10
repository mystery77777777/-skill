---
name: wx-article-read
slug: wx-article-read
displayName: 公众号文章互动数采集
version: 1.0.0
description: 公众号文章互动数采集工具。当用户给出公众号文章链接（`mp.weixin.qq.com/s/...` 长链或短链），需要采集阅读数 / 点赞数 / 在看数 / 转发数 / 收藏数 / 评论数（`comment_count=-1` 表示该文章未开通评论），或提到"公众号阅读数/点赞数/在看数/文章数据"时使用本 skill。数据由服务端代理到上游取回，不需要浏览器、不需要登录微信。**1 点数/条**
---

# 公众号文章互动数 Skill（wx-article-read）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name wx-article-read` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name wx-article-read --ai-entry claude-code`。

封装「社媒采集平台」（FastAPI，`/api/v1`）的 CLI：提交公众号文章链接 → 服务端经上游代理取实时互动数据，不需要浏览器/插件。

- **能采什么**：阅读数、点赞数、在看数、转发数、收藏数、评论数（`comment_count=-1` 表示该文章未开通评论）。
- **省心机制**：服务端代理上游（不用开浏览器/插件），任务式提交 + 退差结算 + Agent 友好（stdout 纯 JSON + 统一退出码）。
- **不支持**：非微信域名链接；已删除/违规文章（会报业务失败且不返还）

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name wx-article-read --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **1 点数/条**
- 注册即送 **10 免费点数**。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。
- 点数与人民币的兑换比例以平台充值页显示为准（默认 1 元 = 10 点）；`capability_prices` 调价只影响新任务。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 公众号文章链接（`mp.weixin.qq.com/s/...` 长链或短链） | — |
| `--file` | 名单文件路径，每行一个（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--timeout` | 等待秒数 | 300 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一条内容重复出现在名单里会**自动合并**，只扣一次。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
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
node cli.js register --link --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js login --link --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js submit --url <输入> --wait --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js export <task_id> --wait --out 结果.csv --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js quota --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js logout --skill-name wx-article-read --ai-entry <ai-entry>
node cli.js config show
```

支持的链接:
  https://mp.weixin.qq.com/s?__biz=...&mid=...&idx=1&sn=...   （长链）
  https://mp.weixin.qq.com/s/AbCdEf123456                       （短链）
  其它链接（非微信域名 / 微博 / 知乎等）一律拒绝，不扣费。

### submit

```bash
node cli.js submit --url <输入> --wait --skill-name wx-article-read --ai-entry <ai-entry>
```

`result` 里字段含义：

| 字段 | 含义 |
|---|---|
| `sn` | 文章 sn（短链无 sn 时是 URL 摘要键） |
| `read_count` | 阅读数 |
| `zan_count` | 点赞数 |
| `collected_count` | 实采条数（成功恒为 1） |
| `settle_charged` | 实收点数 |
| `refunded_diff` | 差值返还点数 |
| `notes` | 本条明细（含全部互动字段） |

### export

```bash
node cli.js export <task_id> --wait --out 结果.csv --skill-name wx-article-read --ai-entry <ai-entry>
```

CSV 结构：前段是任务汇总（每条的状态/实采/实收/退差/失败原因），空一行后是明细宽表（`sn,url,read_count,zan_count,looking_count,share_count,collect_count,comment_count,raw_json,fetched_at`）。BOM 头，Excel 直开不乱码。

## 典型工作流（agent 照此执行）

1. 判断用户给的是不是公众号文章链接（`mp.weixin.qq.com/s/...` 长链或短链）；不是就说明不支持，别提交。
2. `node cli.js submit --url <输入> --wait --skill-name wx-article-read --ai-entry <ai-entry>`（多条就重复 `--url` 或写 `--file`）。
3. 读 `result`：`collected_count` / `settle_charged` / `refunded_diff` 如实报给用户。
4. 要文件时 `node cli.js export <task_id> --wait --out <文件名>.csv --skill-name wx-article-read --ai-entry <ai-entry>`。

## 错误处理指引

| code / 现象 | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 输入不合法 | 按提示修输入（退出码 1，未扣费） |
| 1002 / 1003 | 未登录 / token 失效 | 走 `register --link` 或 `login --link`（退出码 2） |
| 2003 | 需要图形验证码 | 统一走 `--link` |
| 3001 | 点数不足 | 提示充值（退出码 3） |
| 3005 | 能力未启用 | 联系客服 |
| `fail_kind=unavailable` | 业务失败：内容删除 / 链接有误 / 查不到账号 / **零结果**（无评论、无作品、搜不到） | **不返还**（上游已按次收费），如实告知并建议换目标重试 |
| `fail_kind=service` 或执行异常 | 服务侧失败（上游 key 失效 / 上游余额不足 / 网络） | **全额返还**，建议稍后重试 |
| NETWORK_ERROR | 网络/服务不可达 | 检查 base_url（退出码 4） |

## 计费规则提示

- 1 条链接 = 1 点数（≈0.10 元，按 1 元 = 10 点，以充值页兑换比例为准）
- 实采恒 1 条无差值可退
- 文章被删除/链接有误不返还，服务侧异常全额返还。

## 补充说明

- 评论数返回 `-1` 表示该文章没有开通评论（不是 0，不要当 0 报给用户）。
- 阅读数 10 万以上上游会给 `100001` 这类封顶值，如实说明「10 万+」。

## 红线

- 只采公开文章，不绕过付费墙/登录墙；不要承诺 100% 成功。
- 不要向用户承诺 100% 成功；上游失败如实透出，不要编造数据。
- 不要泄露服务端 token、上游 key 或平台内部配置。
