---
name: zh-keyword-search
slug: zh-keyword-search
displayName: 知乎关键词搜索
version: 1.0.0
description: 知乎全站关键词搜索工具。当用户给出关键词，需要在知乎上做综合搜索（回答、文章、视频、专栏、学者等混合结果），采集标题、链接、作者、发布时间、赞同/评论数、摘要，导出 CSV（Excel 直开），或提到"知乎搜索/知乎关键词搜索/搜一下知乎/知乎上大家都在说什么"时使用本 skill。要只搜专栏文章请用 zh-article-search。走浏览器插件端采集（需节点已登录知乎）。**1 页 = 1 点数（约 18~20 条）；按实采条数退差，零结果全额返还（注册送 10 点）。**
---

# 知乎关键词搜索 Skill（zh-keyword-search）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name zh-search` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name zh-search --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交搜索关键词 + 页数 → 派发给已登录知乎的采集节点 → 全站综合搜索（回答/文章/视频等混合）→ 导出 CSV（Excel 直开）。

- **能采什么**：每条结果的**对象 ID、对象类型（answer/article/video/scholar…）、标题、链接、作者名/作者 ID、发布时间、赞同数、评论数、摘要、页码**，以及命中的关键词。
- **省心机制**：1 点/页（每页约 18~20 条）、零结果按实采退差、抓取异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- **★ 依赖采集节点已登录知乎**：知乎对游客全拦（`40352 unhuman` 人机墙），服务端直连拿不到数据。必须由浏览器插件在**已登录知乎**的节点上、于知乎页面上下文里发起请求（免 `x-zse-96` 签名）。没有在线节点时任务排队，超时后全额返还。
- **不支持**：只搜专栏文章（用 `zh-article-search`）、按话题/话题页、用户主页、指定专栏、其它站点；提交前就报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name zh-search --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 页 0.1 元**（1 页 = 1 点数，约 18~20 条结果）。
- 注册即送 **10 免费点数**，充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--keyword` | 搜索关键词（最多 64 字，不要粘贴链接） | — |
| `--pages` | 采集页数，`1~10`（每页约 20 条） | `1` |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 该能力是**全站综合搜索**，结果会混着回答、文章、视频、专栏、学者等类型，用 `obj_type` 列区分。
- 每页 20 个位置里有一部分是「相关搜索」「热点」推荐位，会被自动过滤。
- 翻页由节点内部按接口游标完成，agent 不要自己拼翻页。
- 关键词不要写成 URL（含 `zhihu.com` 或 `http` 会被拒，不扣费）。

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
node cli.js register --link --skill-name zh-search --ai-entry <ai-entry>
node cli.js login --link --skill-name zh-search --ai-entry <ai-entry>
node cli.js submit --keyword <关键词> [--pages 2] [--wait] --skill-name zh-search --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name zh-search --ai-entry <ai-entry>
node cli.js export <task_id> [--wait] [--out zh_search.csv] --skill-name zh-search --ai-entry <ai-entry>
node cli.js quota --skill-name zh-search --ai-entry <ai-entry>
node cli.js version
```

### submit

```bash
# 搜第 1 页（约 20 条混合结果）
node cli.js submit --keyword 机油 --skill-name zh-search --ai-entry <ai-entry>

# 搜前 2 页并等待完成
node cli.js submit --keyword 机油 --pages 2 --wait --skill-name zh-search --ai-entry <ai-entry>
```

### export

```bash
node cli.js export <task_id> --wait --out 关键词搜索.csv --skill-name zh-search --ai-entry <ai-entry>
```

CSV 两段：`# 任务汇总` + `# 知乎关键词搜索结果明细`（`keyword/page_no/obj_type/obj_id/title/url/excerpt/author_name/publish_time/voteup_count/comment_count/fetched_at`）。

## 支持的链接

```
关键词  机油
      （直接写词，不要写 URL；64 字以内）
```

其它链接（链接形式的输入 / 空关键词 / 超过 64 字）一律拒绝，**提交前就报错、不扣费**。

## 典型工作流（agent 照此执行）

1. **确认登录**：`node cli.js quota --skill-name zh-search --ai-entry <ai-entry>`，报 `1002` 就先 `login --link`。
2. **先搜 1 页试水**：`submit --keyword <词> --pages 1 --wait`，看 `obj_type` 分布是否符合预期。
3. **确认后加页数**：`submit --keyword <词> --pages 3 --wait`（预扣 3 点）。
4. **导出**：`export <task_id> --wait --out 关键词搜索.csv`。
5. **汇报**：说清命中多少条、各类型占比（可用 `obj_type`）、扣了多少点、退了多少点。

## 错误处理指引

| 现象 / code | 含义 | 该怎么做 |
|---|---|---|
| `1001` / `PARAM_ERROR` | 关键词为空/超长/是链接 | 换成纯关键词重提；不会扣费 |
| 任务 `failed` + `未登录` | 采集节点浏览器没登录知乎 | 让用户登录知乎后 `--force` 重提 |
| 任务 `failed` + 零结果 | 关键词下没有结果 | 如实告知，**全额返还** |
| `obj_type` 混杂 | 全站搜索的正常形态 | 按用户需求筛 `obj_type` 再汇报 |
| `NETWORK_ERROR` | 服务不可达 / 超时 | 检查网络与 `config show` 里的 base_url；必要时 `config set base-url` |
| `1002` | 未登录 / token 失效 | 执行 `login --link` 重新登录 |
| `3001` | 点数不足 | 告知用户余额与本次所需点数，引导充值或联系客服 |

## 计费规则提示

- **1 页 = 1 点数**（0.1 元），每页约 18~20 条（推荐位会被过滤）。
- 预扣按 `--pages` 计算；实际按采到的条数结算，差额自动返还（`refunded_diff`）。
- 零结果 → 全额返还。
- 采集节点未登录、触发风控、接口异常 → **全额返还**。
- 结果类型混合（回答/文章/视频/学者），按 `obj_type` 分类汇报，不要混成「都是文章」。

## 红线

- **不要替用户改链接**：贴错类型（链接输入）直接报错更安全，不要猜。
- **不要承诺「一定能采到」**：内容可能已删除/被删/评论区关闭，这类不返还点数。
- - **不要用本 skill 只搜文章**：只看专栏文章用 `zh-article-search`（口径更准、无混合类型）。
- **不要自己拼翻页参数**：知乎搜索翻页要带 `search_hash_id` 与递增的 `vertical_info`，必须由节点按接口游标翻。
- **不要把 token 写进日志或聊天记录**。
