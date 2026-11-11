---
name: zh-article-detail
slug: zh-article-detail
displayName: 知乎专栏文章详情
version: 1.0.0
description: 知乎专栏文章详情采集工具。当用户给出具体知乎文章链接，需要采集标题、摘要、作者、发布时间、IP 属地、正文全文、正文配图、所属专栏、话题标签、赞同/评论数，导出 CSV（Excel 直开），或提到"知乎文章正文/这篇专栏讲了什么/采集知乎文章详情/知乎文章全文"时使用本 skill。走浏览器插件端采集（详情只存在于文章页内联数据，接口 403）。**1 条链接 = 1 点数；内容不存在/已删除不返还，抓取异常全额返还（注册送 10 点）。**
---

# 知乎专栏文章详情 Skill（zh-article-detail）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name zh-detail` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name zh-detail --ai-entry claude-code`。

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI：提交知乎文章链接（可批量，单次最多 20 条）→ 派发给已登录知乎的采集节点 → 读文章页内联 JSON → 导出 CSV（Excel 直开）。

- **能采什么**：标题、摘要、作者名/作者 ID/头像/一句话介绍、发布时间、更新时间、**IP 属地**、**正文 HTML 与纯文本**、正文配图真址数组、所属专栏名、话题标签、赞同数、评论数。
- **省心机制**：1 条链接 = 1 点、零结果按实采退差、抓取异常全额返还、Agent 友好（stdout 纯 JSON + 统一退出码）。
- **★ 依赖采集节点已登录知乎**：知乎对游客全拦（`40352 unhuman` 人机墙），服务端直连拿不到数据。必须由浏览器插件在**已登录知乎**的节点上、于知乎页面上下文里发起请求（免 `x-zse-96` 签名）。没有在线节点时任务排队，超时后全额返还。
- **不支持**：文章列表（用 `zh-zhuanlan`）、评论（用 `zh-pinglun`）、回答正文（本 skill 只收专栏文章）、用户主页、搜索结果；提交前就报错、不扣费。

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name zh-detail --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

注册或使用过程中遇到任何问题，请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **点数换算：0.1 元 = 1 点数。**
- **1 条链接 0.1 元**（1 条 = 1 点数）。
- 注册即送 **10 免费点数**，充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## 参数（提交前必读）

| 参数 | 取值 | 默认 |
|---|---|---|
| `--url` | 文章链接，**可重复传多次**（单次最多 20 条） | — |
| `--file` | 名单文件路径，每行一个链接（`#` 开头视为注释），可与 `--url` 混用 | — |
| `--wait` | 等待任务跑完再返回（默认超时 300s） | 关 |
| `--force` | 跳过 24h 内容去重强制重提 | 关 |

- 单次上限 **20 条**，超了直接报错（不扣费），请拆批。
- 同一篇文章重复出现在名单里会**自动合并**，只扣一次；`www.zhihu.com/p/<id>` 与 `zhuanlan.zhihu.com/p/<id>` 归一化成同一条。
- 19 位长 ID（如 `2085666660850087824`）与 9 位老 ID 都支持，全链路按字符串处理。
- **★ 正文只从页面内联数据取**：知乎详情 API（`/api/v4/articles/<id>`）恒 403，所以本能力必须由节点打开文章页；节点没打开成功会报错并全额返还。

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
node cli.js register --link --skill-name zh-detail --ai-entry <ai-entry>
node cli.js login --link --skill-name zh-detail --ai-entry <ai-entry>
node cli.js submit --url <文章链接> [--url <链接> ...] [--file 名单.txt] [--wait] --skill-name zh-detail --ai-entry <ai-entry>
node cli.js query <task_id> [--wait] --skill-name zh-detail --ai-entry <ai-entry>
node cli.js export <task_id> [--wait] [--out zh_detail.csv] --skill-name zh-detail --ai-entry <ai-entry>
node cli.js quota --skill-name zh-detail --ai-entry <ai-entry>
node cli.js version
```

### submit

```bash
# 单篇
node cli.js submit --url https://zhuanlan.zhihu.com/p/632713061 --skill-name zh-detail --ai-entry <ai-entry>

# 批量（单次最多 20 条），并等待完成
node cli.js submit --url https://zhuanlan.zhihu.com/p/632713061 --skill-name zh-detail --ai-entry <ai-entry> \
                   --url https://zhuanlan.zhihu.com/p/2085666660850087824 --wait

# 从名单文件读（每行一个，可混用 --url）
node cli.js submit --file 文章名单.txt --wait --skill-name zh-detail --ai-entry <ai-entry>
```

### export

```bash
node cli.js export <task_id> --wait --out 文章详情.csv --skill-name zh-detail --ai-entry <ai-entry>
```

CSV 两段：`# 任务汇总` + `# 知乎专栏文章详情明细`（`article_id/source_type/url/title/excerpt/author_name/author_id/author_avatar/author_headline/publish_time/update_time/content/content_text/images_json/comment_count/voteup_count/ip_location/column_name/topic_tags/fetched_at`）。

## 支持的链接

```
专栏文章  https://zhuanlan.zhihu.com/p/632713061
          https://www.zhihu.com/p/632713061          （同一条，归一化到 zhuanlan）
          https://zhuanlan.zhihu.com/p/2085666660850087824   （19 位长 ID）
```

其它链接（专栏主页 / 用户主页 / 问题页 / 回答 / 搜索结果 / 想法 / 其它站点）一律拒绝，**提交前就报错、不扣费**。

## 典型工作流（agent 照此执行）

1. **确认登录**：`node cli.js quota --skill-name zh-detail --ai-entry <ai-entry>`，报 `1002` 就先 `login --link`。
2. **先单篇试水**：`submit --url <一篇文章> --wait`，检查 `title` / `content_text` 是否正常。
3. **确认后批量**：把同一批（≤20 条）用多个 `--url` 或 `--file` 提交。
4. **导出**：`export <task_id> --wait --out 文章详情.csv`。
5. **汇报**：说清成功几条、失败几条（哪条内容不存在）、扣了多少点。

## 错误处理指引

| 现象 / code | 含义 | 该怎么做 |
|---|---|---|
| `1001` / `PARAM_ERROR` | 链接不是文章、超过 20 条 | 按提示换链接或拆批；不会扣费 |
| 任务 `failed` + `未登录` | 采集节点浏览器没登录知乎 | 让用户登录知乎后 `--force` 重提 |
| 任务 `failed` + `不可用` | 文章不存在 / 已删 / 无权限 | 如实告知用户，**不返还** |
| `content_text` 为空 | 文章是纯图/视频壳，正文 HTML 为空 | 正常现象，按 `images_json` 汇报 |
| `NETWORK_ERROR` | 服务不可达 / 超时 | 检查网络与 `config show` 里的 base_url；必要时 `config set base-url` |
| `1002` | 未登录 / token 失效 | 执行 `login --link` 重新登录 |
| `3001` | 点数不足 | 告知用户余额与本次所需点数，引导充值或联系客服 |

## 计费规则提示

- **1 条链接 = 1 点数**（0.1 元），实采恒 1 条，无差值可退。
- 文章不存在 / 已删除 / 无权限 → **不返还**（业务侧结果）。
- 采集节点未登录、触发风控、文章页加载失败 → **全额返还**。
- 正文 HTML 可能几十 KB（长回答级长文），落库有 200000 字符上限，超出截断但不丢标题/作者/计数。

## 红线

- **不要替用户改链接**：贴错类型（专栏主页/用户/问题/回答链接）直接报错更安全，不要猜。
- **不要承诺「一定能采到」**：内容可能已删除/被删/评论区关闭，这类不返还点数。
- - **不要用本 skill 采列表或评论**：列表用 `zh-zhuanlan`、评论用 `zh-pinglun`。
- **不要把 `content` 整段塞进聊天**：正文可能是几十 KB，按用户要求摘录或给文件。
- **不要把 token 写进日志或聊天记录**。
