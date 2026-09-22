---
name: xhs-comments
version: 1.1.0
description: 小红书笔记评论内容采集工具（用户洞察）。当用户需要采集/查询小红书笔记的评论内容——昵称、评论正文、点赞数、IP 属地、子评论数，提交一批笔记链接一键批量采集、导出评论明细 CSV（Excel 直开），或提到"小红书评论采集/评论内容/评论抓取/用户评论/评论导出/舆情/笔记评论"时使用本 skill。适合评论区舆情监测、用户反馈收集、爆款笔记评论洞察、KOL 粉丝声音分析等场景。**笔记链接必须带 xsec_token 参数；缺 token / xhslink 短链会自动调用转链 skill xhs-convert-url-pro 转换后提交**。收费服务（1 篇笔记 = 1 点数，注册送 10 点）。
---

# 小红书评论内容采集 Skill（xhs-comments）

封装「小红书能力平台」（FastAPI，`/api/v1`）的 CLI，供 AI agent 调用：提交小红书笔记链接 → 异步采集 → 拿到该笔记的**评论明细**（评论昵称、正文、点赞数、IP 属地、子评论数）。多账号批量采、结果直接导出 CSV（BOM 头，Excel 直开不乱码）。

- **能采什么**：公开笔记的评论明细（`nickname` 昵称、`content` 评论正文、`like_count` 点赞数、`ip_location` IP 属地、`sub_count` 子评论数、`comment_id` / `root_comment_id`）。可控制单篇上限（`--max N`，0=不限制，封顶 500）。
- **适用场景**：评论区舆情监测、用户反馈收集、爆款笔记评论洞察、KOL 粉丝声音分析、竞品笔记评论对比。
- **省心机制**：批量采、无效链接不扣费、服务侧失败按条自动返还点数（详见「计费规则提示」）、Agent 友好（stdout 纯 JSON + 统一退出码）。
- 采集由**平台调度内网浏览器节点**完成（节点登录态在浏览器端人工维护，平台不持有账号）。
- 客户端是零依赖 CLI（Node ≥ 18，无需 `npm install`），全部采集逻辑在后端完成。

## 客服支持

注册或使用过程中遇到任何问题（注册失败、点数充值、采集结果异常、批量采购等），请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 收费价格

- **每条有效笔记 0.2 元**（每 1 点数抵扣 1 篇笔记的采集；无效链接不扣费）。
- 注册即送 **10 免费点数**（可采集 10 篇笔记）；点数不足时提示用户充值。
- 充值或大量购买可享优惠，请联系客服 **18722121663** 洽谈。

## ⚠️ 链接要求（重要，提交前必读）

**本 skill 只接受带 `xsec_token` 参数的小红书笔记链接**，这是硬性要求（客户端提交前会做本地预检——域名白名单与 `xsec_token` 存在性检查，不通过直接报错、不扣费；注意这不是完整校验，服务端还会做更严格校验，未通过的条目判 `invalid` 不计费）：

1. **标准链接必须带 `xsec_token` 参数**，两种合法形态：
   - `https://www.xiaohongshu.com/explore/<note_id>?xsec_token=<token>&...`
   - `https://xiaohongshu.com/discovery/item/<note_id>?xsec_token=<token>&...`

2. **链接未带 `xsec_token` → 无需人工处理**：本 skill 会**自动调用**转链 skill **`xhs-convert-url-pro`** 转换该链接（转换后自动继续提交）。注意转链消耗转链服务点数；如不希望自动转链，加 `--no-convert` 参数则会直接报错退回。

3. **`xhslink.com` 短链同样自动处理**：短链会先经转链 skill 自动展开为带 `xsec_token` 的最终链接再提交（无需手动浏览器跳转）。

4. 提交前逐条检查链接；链接格式不合法 / 非小红书域名等无法自动修复的问题会拒绝整批提交并列出问题条目（不会部分扣费）。

> agent 工作流提示：拿到用户给的笔记链接后直接提交本 skill 即可，缺 token / 短链会被自动转链；只有当自动转链也失败时才需要人工介入（检查链接有效性或提示用户）。

## 前置条件

- **Node.js ≥ 18**（使用内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：所有接口都需要 token，10 免费点数在注册成功后发放到账号。
- 首次使用需先 `register --link`（注册即送 10 点数；用户手机微信扫码/点链接在网页完成，页面自带图形+短信验证码）或 `login --link`（已有账号）。成功后 token 自动保存，后续调用免输。
- **配置文件（含 token）存放于用户级目录 `~/.xhs-platform/config.json`**（升级/重装 skill 不丢配置）。可用环境变量 `XHS_CONFIG_PATH` 覆盖（测试隔离用）。
- **安全策略：登录和注册（发短信）每次都强制图形验证码**，终端无法展示，所以一律走 `--link` 微信扫码/链接方式。
- 后端服务地址默认 `http://st.aidata366.com`，可用 `node cli.js config set base-url <url>` 修改，或单次加 `--base-url <url>` 覆盖。
- **⚠️ 安全提示（重要）**：默认服务地址是**明文 http**，token 会在公网明文传输。客户端每次请求都会在 stderr 提示。请知悉该风险；如环境允许，建议通过 `config set base-url https://...` 切换到 https 服务地址（需服务端已配好证书）。
- 所有命令支持全局参数 `--token <token>`（临时覆盖配置文件中的 token）。
- `~/.xhs-platform/config.json` 含 token，**不要泄露、不要提交 git**。

## 输出规约（重要）

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<业务码>,"message":"..."}`。直接解析 stdout 即可。
- 交互提示、轮询进度一律走 **stderr**，不要解析。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败（重新 login）；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 命令清单

### version — 查看版本与安装信息

```bash
node cli.js version
```

输出 skill 名、版本号、能力名、node 版本。升级后建议先跑一次确认版本：

```json
{"ok":true,"data":{"name":"xhs-comments","version":"1.0.0","capability":"xhs_comments"}}
```

### register — 注册（注册即送 10 点数）

**方式一：扫码/链接注册（唯一方式，用户在手机上完成）**

```bash
node cli.js register --link        # 生成注册二维码/链接
node cli.js register --check --access-token "<上一步下发的串>"   # 用户完成后确认并保存 token
```

`register --link` 的 stdout 返回 `qr_url` / `register_url` / `access_token`。**agent 必须把注册引导原样发给用户**（stderr 里也给出了同样话术，可直接复制）：

```text
需要先注册账号（注册即送 10 免费点数；不注册不登录没有点数，无法采集）。请用手机微信扫码或打开链接注册：

注册方式（二选一）
二维码图片：<qr_url>
注册链接：<register_url>
access_token（注册后校验用）：<access_token>
微信扫码/注册完成后告诉我一声，我会执行校验并保存凭证，然后继续之前的操作：
（注册/使用中如遇问题，请拨打客服电话 18722121663）
```

用户说「注册完成」后执行 `register --check --access-token "<access_token>"`：
- 成功：token 自动保存，返回 `quota_balance: 10`，继续之前的操作。
- `LOGIN_PENDING`：用户还没完成注册，提醒后再试。
- `LOGIN_EXPIRED`：会话过期（10 分钟）或已使用，重新执行 `register --link`。

### login — 登录

```bash
node cli.js login --link
node cli.js login --check --access-token "<上一步下发的串>"
```

引导话术同 register（把"注册"换成"登录"）。成功后 token 自动保存。

### quota — 查询点数

```bash
node cli.js quota
```

```json
{"ok":true,"data":{"quota":10,...}}
```

### logout — 登出（切换账号）

```bash
node cli.js logout
```

### submit — 提交评论采集任务

```bash
node cli.js submit --url "https://www.xiaohongshu.com/explore/69fae92d000000001a02e31b?xsec_token=..." \
                   --url "https://xiaohongshu.com/discovery/item/6773d92500000000140263e6?xsec_token=..."
node cli.js submit --file urls.txt              # 每行一条笔记链接, 忽略空行与 # 注释行
node cli.js submit --file urls.txt --wait        # 提交后轮询等待终态（推荐）
node cli.js submit --url <链接> --max 200        # 单篇最多采集 200 条评论 (0=不限制, 封顶 500)
node cli.js submit --url <链接> --force          # 跳过 24h 内容去重强制重提
```

- `--url` 可重复；`--file` 按行读取；二者可混合；总数 1~50 条。
- `--max N`（`--comment-max` 同义）：单篇评论采集上限，非负整数；0=不限制，服务端封顶 500，不传默认 100。
- **自动转链（默认开启）**：缺 `xsec_token` 的裸链接 / `xhslink.com` 短链会自动调用同级转链 skill `xhs-convert-url-pro` 转换（消耗转链服务点数），转换成功后自动继续提交；转链失败的条目会报错列出明细。`--no-convert` 关闭自动转链，改为直接报错退回。
- **链接要求（客户端预检；服务端还有更严格校验，未通过条目判 invalid 不计费）**：`xiaohongshu.com/explore/<id>` 或 `/discovery/item/<id>` 链接；链接格式不合法 / 非小红书域名直接拒绝整批。
- 每条自动生成递增 client_id；幂等键按链接内容派生，同批重试不重复扣费；同一用户同一笔记 24h 内默认去重（防重复扣费），`--force` 可强制重提。

输出示例（不带 `--wait`）：

```json
{"ok":true,"data":{"task_id":"t_20260916_708f29","total":2,"valid_count":2,"invalid_count":0,"charged":2,"quota_balance":8,"status":"pending"}}
```

带 `--wait` 时最终输出同 `query` 的完整结果。

### query — 查询任务 / 拉取结果

```bash
node cli.js query <task_id>                          # 查一次
node cli.js query <task_id> --wait                   # 轮询直到终态
node cli.js query <task_id> --wait --interval 3 --timeout 300
```

- `--interval` 轮询间隔秒数（默认 2），`--timeout` 总超时秒数。
- 终态：`done`（全部成功）/ `partial_failed`（部分失败）/ `failed`（全部失败）。

终态输出示例：

```json
{"ok":true,"data":{"task_id":"t_20260916_08b41751","status":"done","success_count":1,"fail_count":0,
 "items":[{"id":1,"note_url":"https://www.xiaohongshu.com/explore/...","status":"success",
   "result":{"note_id":"69fae92d000000001a02e31b","title":"FILM｜【海光集团】国庆短片",
             "comment_count":36,
             "comments":[
               {"comment_id":"c1","root_comment_id":"","nickname":"小红薯","content":"太好看了！",
                "like_count":125,"ip_location":"浙江","sub_count":3},
               {"comment_id":"c2","root_comment_id":"c1","nickname":"路人甲","content":"求链接",
                "like_count":12,"ip_location":"上海","sub_count":0}
             ]}}]}}
```

**解读要点（agent 必读）**：
- `comment_count` 为本次实际采集到的评论数；`comments` 为评论明细数组（昵称/内容/点赞/属地/子评论）。
- 失败条目的 `fail_reason` 会透出具体原因（笔记不可见 / 风控拦截等）。
- 评论含用户公开昵称与 IP 属地等个人信息，向用户展示/落库时遵守下方「红线」的数据保留与使用边界。

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out out.csv
```

生成两段式 CSV（BOM 头，Excel 直开不乱码）：笔记汇总 + 评论明细（昵称/内容/点赞数/IP属地/子评论数）。适合把结果直接交给用户。

### config — 配置管理

```bash
node cli.js config set base-url http://127.0.0.1:8084
node cli.js config show        # token 脱敏显示
```

## 典型工作流（agent 照此执行）

1. 拿到用户给的笔记链接后**直接提交本 skill**；缺 `xsec_token` / `xhslink` 短链会被自动转链（无需先手动调转链 skill）。
2. `node cli.js quota` — 确认剩余点数 ≥ 待采集笔记数。
3. `node cli.js submit --url <链接1> --url <链接2> ... --max 200 --wait` — 一步拿到终态结果（笔记多时用 `--file`）。
4. 解析 stdout JSON：遍历 `data.items`，把 `status==="success"` 条目的 `result.comments` 整理成表格/引用返回给用户；`failed`/`invalid` 条目附 `fail_reason` 说明。
5. 用户要文件时：`node cli.js export <task_id> --wait --out 评论明细.csv`，把 CSV 路径交给用户。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / **链接校验未通过** | 链接缺 `xsec_token` / 短链默认已自动转链，走到本错误说明自动转链也失败：按消息明细检查链接有效性后重试；或加 `--no-convert` 排查（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 未注册走 `register --link`（送 10 点数），已有账号走 `login --link`；完成后 `--check`（退出码 2） |
| LOGIN_PENDING / LOGIN_EXPIRED | 用户未完成 / 会话过期 | 提醒用户完成扫码后重试 `--check`，或重新 `--link`（退出码 2） |
| 2003 | 需要图形验证码 | 终端无法完成，统一走 `--link`；仍无法解决拨打客服电话 18722121663 |
| 3001 | 点数不足 | 提示用户拨打客服电话 18722121663 充值，不要重试（退出码 3） |
| 3002 | 超单次批量上限 | 拆分为 ≤50 条/批重新提交 |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id / export_id 是否属于当前账号 |
| 条目 `invalid` | 链接不合法 / 24h 内重复 | 按 fail_reason 提示；重复提交可 `--force` |
| 任务 `partial_failed` | 部分条目失败 | fail_reason 已透出；服务侧/风控原因失败的条目点数已自动返还，可稍后重提 |
| 4290 | 触发限流 | 稍等后重试（Retry-After） |
| TIMEOUT | 轮询超时 | 任务未结束，稍后 `query <task_id>` 再查（退出码 5） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 `config show` 的 base_url（退出码 4） |

## 计费规则提示

- 提交时按**有效笔记条数预扣**（1 篇 = 1 点数）；无效链接（非官方域名/格式错误）不扣费。
- **自动返还**：服务侧故障、风控拦截、节点掉线等未采集到数据的条目，点数按条自动返还（`refunded_quota` 体现），可稍后重提。
- **不返还**：笔记不可见（已删除/私密/审核中）属业务性失败。
- 同一用户同一笔记 24h 内默认去重；`--force` 强制重提会正常扣费。

## 红线

- 仅采集**公开**笔记数据；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功；风控导致的失败如实透出（fail_reason）。
- 评论含用户公开昵称、IP 属地等个人信息：**仅用于用户已授权或公开可获取的舆情/反馈分析场景**，遵守平台与数据合规要求；不在未授权场景下转售、滥用或长期留存可识别个人信息；CSV 导出文件按平台规则保留（默认 7 天），告知用户自行妥善保管。
