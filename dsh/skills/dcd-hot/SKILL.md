---
name: dcd-hot
slug: dcd-hot-list
displayName: 懂车帝热榜采集
version: 1.0.0
description: 懂车帝实时热榜采集工具。当用户需要获取当前懂车帝热榜/热搜、热榜排名、热度、话题或文章链接，或导出懂车帝热榜 CSV，或提到"懂车帝热榜/懂车帝热搜/汽车热榜/热榜采集/热榜导出"时使用本 skill。服务端直接通过 HTTP 请求采集公开热榜，不需要懂车帝登录态、Cookie 或内网浏览器节点；每次采集 1 点数，失败全额返还。
---

# 懂车帝热榜采集 Skill（dcd-hot）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name dcd-hot` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name dcd-hot --ai-entry claude-code`。

封装「社媒采集平台」（FastAPI，`/api/v1`）的零依赖 Node CLI。提交任务后，**服务端直接通过 HTTP** 请求懂车帝公开热榜接口，返回实时榜单；无需用户打开浏览器，也无需懂车帝登录。

- **能采什么**：排名（`rank`）、话题标题（`title`）、热度文本（`hot_text`，如"123.4万"）、链接（`url`，文章类指向 www.dongchedi.com 文章页，话题类为搜索链接）。
- **采集范围**：一次返回接口当前提供的完整实时热榜。
- **收费**：**每次采集 = 1 点数**，注册送 10 点；失败或零结果全额返还。
- **无需懂车帝登录态**：不读取、不保存任何平台 Cookie，不依赖内网采集节点。
- 客户端零 npm 依赖，Node.js ≥ 18；stdout 纯 JSON，进度走 stderr。

## 收费价格

- **点数换算：0.1 元 = 1 点数。**

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
- **主动充值**：`node cli.js pay --yuan 50 --skill-name dcd-hot --ai-entry <ai-entry>`（不传 `--yuan` 默认 10 元；可加 `--channel alipay` 或 `--channel wechat`）。
- **不想自动充值**：设环境变量 `XHS_NO_AUTO_PAY=1`，则恢复旧行为（只提示点数不足）。
- 换算：**1 元 = 10 点**，注册送 10 点。

## 客服支持

- 客服微信（扫码添加）：http://st.aidata366.com/assets/concat.png
- 客服电话：**18722121663**

## 前置条件

采集本身不需要懂车帝账号，但平台任务接口需要平台账号和点数：

1. 首次使用执行 `node cli.js register --link --skill-name dcd-hot --ai-entry <ai-entry>`（新用户）或 `node cli.js login --link --skill-name dcd-hot --ai-entry <ai-entry>`（已有账号）。
2. 把 stderr 中的注册/登录引导**原样发给用户**；用户完成后执行对应的 `--check --access-token "<串>"`。
3. token 保存于 `~/.xhs-platform/config.json`，与其他社媒 skill 共用账号体系；不要泄露或提交 git。
4. 默认后端为 `http://st.aidata366.com`，可执行 `node cli.js config set base-url <url>` 修改。默认地址为明文 HTTP，token 会明文传输；条件允许时切换 HTTPS。

## 命令

### version / quota / logout / config

```bash
node cli.js version
node cli.js quota --skill-name dcd-hot --ai-entry <ai-entry>
node cli.js logout --skill-name dcd-hot --ai-entry <ai-entry>
node cli.js config show
node cli.js config set base-url http://127.0.0.1:8084
```

`version` 输出：

```json
{"ok":true,"data":{"name":"dcd-hot","version":"1.0.0","capability":"dcd_hot"}}
```

### submit — 采集当前热榜

```bash
node cli.js submit --wait --skill-name dcd-hot --ai-entry <ai-entry>
node cli.js submit --wait --force --skill-name dcd-hot --ai-entry <ai-entry>   # 24h 内已采过，也要重新获取最新榜单
```

- 不需要关键词、链接或条数参数。
- 每次预扣 1 点；`--wait` 默认最多等待 120 秒。
- 同一空参数任务 24h 内默认去重；需要再次获取最新榜单时使用 `--force`。
- 可选 `--interval <秒>`、`--timeout <秒>` 调整轮询。

成功结果示例（数组仅示意一条，实际返回完整热榜）：

```json
{"ok":true,"data":{"task_id":"t_20261111_a1b2c3d4","status":"done","success_count":1,
 "items":[{"id":"1","status":"success","result":{"collected_count":30,
 "fetched_at":"2026-11-11 11:30:00","hot_list":[{"rank":1,"title":"示例热榜话题",
 "hot_text":"123.4万","url":"https://www.dongchedi.com/article/7000000000000000000"}]}}]}}
```

Agent 应读取 `data.items[0].result.hot_list` 整理结果，并按 `collected_count` 如实汇报条数。

### query — 查询任务 / 拉取热榜

```bash
node cli.js query <task_id> --skill-name dcd-hot --ai-entry <ai-entry>
node cli.js query <task_id> --wait --skill-name dcd-hot --ai-entry <ai-entry>
```

### export — 导出 CSV

```bash
node cli.js export <task_id> --wait --out 懂车帝热榜.csv --skill-name dcd-hot --ai-entry <ai-entry>
```

CSV 带 BOM，Excel 可直接打开；包含任务汇总与热榜明细（排名、标题、热度、链接）。

## 典型工作流

1. 用户要求当前懂车帝热榜/热搜时，直接执行 `node cli.js quota --skill-name dcd-hot --ai-entry <ai-entry>` 检查点数。
2. 执行 `node cli.js submit --wait --skill-name dcd-hot --ai-entry <ai-entry>`；24h 内重复采集最新榜单时加 `--force`。
3. 解析 stdout JSON，将 `result.hot_list` 按 `rank` 返回给用户。
4. 用户需要文件时执行 `export <task_id> --wait --out <文件名>.csv`。

## 输出与错误

- 成功：`{"ok":true,"data":{...}}`；失败：`{"ok":false,"code":"...","message":"..."}`。
- 退出码：`0` 成功；`1` 参数错误；`2` 平台认证失败；`3` 点数不足；`4` 网络不可达；`5` 其它错误。
- `1002/1003`：重新执行平台 `login --link`，**不是让用户登录懂车帝**。
- `3001`：点数不足，提示充值，不要盲目重试。
- `status=failed`：读取 `fail_reason`；服务侧失败会自动返还 1 点，可稍后重试。
- `TIMEOUT`：任务可能仍在执行，稍后 `query <task_id>`。
- `4290`：触发限流，稍后重试。

## 红线

- 仅采集公开热榜数据，不绕过登录、验证码或访问控制。
- 热榜实时变化，结果以 `fetched_at` 时点为准；不要承诺每次一定成功。
