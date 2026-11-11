---
name: zh-huida
slug: zh-huida
displayName: 知乎回答列表
version: 1.0.0
description: 知乎回答列表采集工具。当用户给出知乎问题链接（www.zhihu.com/question/<id>），需要批量采集该问题下的回答（作者、正文全文、赞同数、评论数、发布时间），或提到"知乎问题下的回答/这个问题大家怎么答/采集知乎回答/知乎回答批量导出"时使用本 skill。走浏览器插件端采集（需节点已登录知乎）。**1 页 = 1 点数（20 条回答）；按实采条数退差，零结果全额返还（注册送 10 点）。**
---

# 知乎回答列表 Skill（zh-huida）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name zh-answers` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name zh-answers --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交知乎问题链接 + 页数 → 派发给已登录知乎的采集节点 → 逐页拉该问题下的回答 → 导出 CSV（Excel 直开）。

- **能采什么**：每篇回答的**回答 ID、作者名/作者 ID/头像/一句话介绍、正文全文（HTML + 纯文本）、赞同数、评论数、发布时间、更新时间、是否被折叠、回答类型、页码**，以及所属问题标题。
- **省心机制**：1 点/页（每页 20 条回答）、零结果按实采退差、抓取异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- **★ 依赖采集节点已登录知乎**：知乎对游客全拦（`40352 unhuman` 人机墙），服务端直连拿不到数据。必须由浏览器插件在**已登录知乎**的节点上、于知乎页面上下文里发起请求（免 `x-zse-96` 签名）。没有在线节点时任务排队，超时后全额返还。
- **不支持**：问题详情本身（标题会随每条回答一起给）、回答的评论（用 `zh-pinglun` + 回答链接）、问题下的「想法」、用户主页、其它站点；提交前就报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name zh-answers --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 页 0.1 元**（1 页 = 1 点数，20 条回答）。
- 注册即送 **10 免费点数**，充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 知乎问题链接（`www.zhihu.com/question/<id>`），每个任务 **1 个** | — |
| `--pages` | 采集页数，`1~10`（每页 20 条回答） | `1` |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 该能力**每个任务只采 1 个问题**，多个问题请分多次 `submit`。
- `--pages 3` 表示最多拉 3 页（预扣 3 点）；终止看接口 `paging.is_end`。
- ★ 接口 `limit` 上限是 **20**（传 50 会报 400「不合法的 limit」），所以每页恒 20 条。
- 回答 ID 有 9 位与 19 位两种，全链路按字符串处理，不会掉精度。
- **不要传回答链接**（`/question/x/answer/y`）：本能力要的是**问题**链接；单篇回答正文用 `zh-article-detail` 不适用，回答正文这里会随列表给。

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

```
node cli.js register --link --skill-name zh-answers --ai-entry <ai-entry>
node cli.js login --link --skill-name zh-answers --ai-entry <ai-entry>
node cli.js submit --url <问题链接> [--pages 2] [--wait] --skill-name zh-answers --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name zh-answers --ai-entry <ai-entry>
node cli.js export <task_id> [--wait] [--out zh_answers.csv] --skill-name zh-answers --ai-entry <ai-entry>
node cli.js quota --skill-name zh-answers --ai-entry <ai-entry>
node cli.js version
```

### submit

```bash
# 采第 1 页（20 条回答），不等待
node cli.js submit --url https://www.zhihu.com/question/508253617 --skill-name zh-answers --ai-entry <ai-entry>

# 采前 2 页并等待完成
node cli.js submit --url https://www.zhihu.com/question/508253617 --pages 2 --wait --skill-name zh-answers --ai-entry <ai-entry>
```

### export

```bash
node cli.js export <task_id> --wait --out 回答列表.csv --skill-name zh-answers --ai-entry <ai-entry>
```

CSV 两段：`# 任务汇总` + `# 知乎回答列表明细`（`question_id/question_title/answer_id/url/author_name/author_id/author_avatar/author_headline/content/content_text/publish_time/update_time/voteup_count/comment_count/is_collapsed/answer_type/page_no/fetched_at`）。

## 支持的链接

```
问题  https://www.zhihu.com/question/508253617
      （不带协议头 / 不带 www 的写法也收）
```

其它链接（回答页 / 专栏主页 / 文章页 / 用户主页 / 搜索结果 / 想法 / 其它站点）一律拒绝，**提交前就报错、不扣费**。

## 典型工作流（agent 照此执行）

1. **确认登录**：`node cli.js quota --skill-name zh-answers --ai-entry <ai-entry>`，报 `1002` 就先 `login --link`。
2. **先采 1 页试水**：`submit --url <问题链接> --pages 1 --wait`，看回答是否确实属于该问题、正文是否完整。
3. **确认后加页数**：`submit --url <问题链接> --pages 3 --wait`（预扣 3 点）。
4. **导出**：`export <task_id> --wait --out 回答列表.csv`。
5. **汇报**：说清实采多少条回答、扣了多少点、退了多少点。

## 错误处理指引

| 现象 / code | 含义 | 该怎么做 |
|---|---|---|
| `1001` / `PARAM_ERROR` | 链接是回答而不是问题、页数超范围 | 换成 `/question/<id>` 形式重提；不会扣费 |
| 任务 `failed` + `未登录` | 采集节点浏览器没登录知乎 | 让用户登录知乎后 `--force` 重提 |
| 任务 `failed` + `不可用` | 问题不存在 / 已删 / 无权限 | 如实告知用户，**不返还** |
| 某页 0 条 | 问题没有更多回答 | 正常，零结果全额返还 |
| `NETWORK_ERROR` | 服务不可达 / 超时 | 检查网络与 `config show` 里的 base_url；必要时 `config set base-url` |
| `1002` | 未登录 / token 失效 | 执行 `login --link` 重新登录 |
| `3001` | 点数不足 | 告知用户余额与本次所需点数，引导充值或联系客服 |

## 计费规则提示

- **1 页 = 1 点数**（0.1 元），每页 20 条回答。
- 预扣按 `--pages` 计算；实际按采到的页数/条数结算，差额自动返还（`refunded_diff`）。
- 零结果（问题无回答）→ 全额返还。
- 问题不存在、已删除、无权限 → **不返还**（业务侧结果）。
- 采集节点未登录、触发风控、页面异常 → **全额返还**。

## 红线

- **不要替用户改链接**：贴错类型（回答/文章/用户/专栏链接）直接报错更安全，不要猜。
- **不要承诺「一定能采到」**：内容可能已删除/被删/评论区关闭，这类不返还点数。
- - **不要把回答正文整段塞进聊天**：20 条长回答可能上百 KB，按用户要求摘录或给文件。
- **不要用回答链接当 --url**：本能力收问题链接，回答链接会被拒（不扣费）。
- **不要把 token 写进日志或聊天记录**。
