---
name: dy-danmaku
slug: dy-danmu
displayName: 抖音弹幕采集（会话制）
version: 1.0.0
description: 抖音视频弹幕采集工具。输入视频直链、精选 modal_id 链接或 v.douyin.com 短链，由登录态浏览器插件从 0 秒开始按接口实际时间段顺序采集弹幕，导出 CSV。适用于用户提到“抖音弹幕/弹幕采集/弹幕导出/弹幕分析/视频飘过评论”时。每个成功的弹幕接口请求 1 点数（包括空页），失败返还，已采完不扣费。
---

# 抖音弹幕采集 Skill（dy-danmaku）

## AI 调用来源参数（必填）

所有会访问后端 API 的命令必须携带 `--skill-name dy-danmaku` 和 `--ai-entry <AI工具标识>`（例如 `claude-code`、`codex`、`workbuddy`）。IP 无需传递，由服务端自动获取。首次缺参会告警放行，第二次起拒绝。

示例：`node cli.js quota --skill-name dy-danmaku --ai-entry claude-code`。

## 产品与计费

- 采集链路：视频链接 → 登录态插件打开页面并暂停视频 → 拖动视频进度触发真实 `danmaku/get_v2` 请求 → 弹幕落库 → CSV 导出。
- 插件复用页面自己的登录态和签名，不构造 `a_bogus`，不额外请求用户资料。
- `start` 免费探测标题、作者、互动数、视频时长和可获得的弹幕总数。
- `step --page` 从 0 秒开始顺序交付一个接口时间段响应，**每个成功请求 1 点，成功空页也收费**。
- 请求失败、节点故障、风控或登录失效：本步返还；已经采完返回 `no_more=true`：不扣费。
- `status`、`danmakus`、`sessions`、`export`、`finish`、`quota` 免费。
- 点数换算：0.1 元 = 1 点；注册送 10 点。充值或批量采购可联系客服 **18722121663**。

## 采集边界与字段

- 支持 `/video/<id>`、`/note/<id>`、`/jingxuan?modal_id=<id>` 和 `v.douyin.com` 短链。
- 只支持全视频从 0 秒顺序采集，不支持自定义时间段。
- 弹幕接口**没有昵称、IP 属地、发布时间**，不要承诺这些字段，也不要把评论区数据混入弹幕。
- 输出字段：`aweme_id`、`danmaku_id`、`user_id`、`text`、`offset_time`（毫秒）、`offset_text`（mm:ss）、`digg_count`、`score`、`danmaku_type`、`from_copy`、`start_time`、`end_time`。
- `estimated_pages` 按视频时长和约 32 秒/请求估算，实际以接口返回的 `end_time` 为准。

## 严格交互协议

1. 查余额：`node cli.js quota --skill-name dy-danmaku --ai-entry <ai-entry>`。
2. 免费建会话：`node cli.js start --url "<视频链接>" --skill-name dy-danmaku --ai-entry <ai-entry>`。
3. 向用户说明视频时长、预估页数和“每个成功请求 1 点（含空页）”，**等用户确认后再 step**。
4. 执行一次：`node cli.js step --session <session_id> --page --skill-name dy-danmaku --ai-entry <ai-entry>`。
5. 展示本页增量弹幕及 `quota_balance`，**每一步都询问用户是否继续**，不要连续自动翻页。
6. 用户停止时执行 `finish`；`export` 随时可导出已采部分。
7. **不要把 `session_id` 泄露给终端用户**；它可用于读取该会话数据。

会话空闲 20 分钟自动过期；过期后已采数据仍可查询和导出，继续采集需重新建会话。

## 命令

### version

```bash
node cli.js version
```

### register / login

```bash
node cli.js register --link --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js register --check --access-token "<串>" --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js login --link --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js login --check --access-token "<串>" --skill-name dy-danmaku --ai-entry <ai-entry>
```

把返回的二维码图片、注册/登录链接和 `access_token` 原样交给用户。用户在网页完成后，再执行对应 `--check`，token 自动保存到 `~/.xhs-platform/config.json`。

### quota

```bash
node cli.js quota --skill-name dy-danmaku --ai-entry <ai-entry>
```

### start（免费）

```bash
node cli.js start --url "https://www.douyin.com/jingxuan?modal_id=7693533290163162843" --skill-name dy-danmaku --ai-entry <ai-entry>
```

返回示例：

```json
{"ok":true,"data":{"session_id":"<32位id>","aweme_id":"7693533290163162843","title":"视频文案","estimated_pages":6,"metrics":{"danmaku_count":"375","duration_ms":182020},"status":"active"}}
```

### step（每个成功请求 1 点）

```bash
node cli.js step --session <session_id> --page --skill-name dy-danmaku --ai-entry <ai-entry>
```

返回示例：

```json
{"ok":true,"data":{"page_no":1,"danmakus":[{"danmaku_id":"7694497818572849979","user_id":"52255145695","text":"弹幕内容","offset_time":639,"offset_text":"00:00","digg_count":107,"start_time":0,"end_time":32000}],"danmakus_collected":158,"has_more_main":true,"next_offset":"32000","charged_steps":1,"quota_balance":9}}
```

本步返回的是增量。空页时 `danmakus: []` 仍表示成功并扣 1 点；`no_more: true` 才是不扣费的终态。

### status / danmakus / sessions（免费）

```bash
node cli.js status --session <session_id> --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js danmakus --session <session_id> --page 1 --page-size 100 --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js sessions --status active --skill-name dy-danmaku --ai-entry <ai-entry>
```

### export / finish（免费）

```bash
node cli.js export --session <session_id> --out 弹幕导出.csv --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js finish --session <session_id> --skill-name dy-danmaku --ai-entry <ai-entry>
```

CSV 带 BOM，Excel 可直接打开。导出文件含公开用户 ID 和弹幕内容，请妥善保管。

### pay / logout / config

```bash
node cli.js pay --yuan 10 --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js logout --skill-name dy-danmaku --ai-entry <ai-entry>
node cli.js config show
```

点数不足时 CLI 会尝试创建充值单并展示二维码；非交互环境返回充值页地址。设置 `XHS_NO_AUTO_PAY=1` 可禁用自动充值。

## 错误处理

| code | 含义 | 处理 |
|---|---|---|
| 1001 | 参数或链接错误 | 检查 URL、session 和命令参数 |
| 1002 / 1003 | 未登录或 token 失效 | 重新 `login --link` |
| 3001 | 点数不足 | 充值后重试 |
| 1404 | 会话不存在、结束或过期 | 重新 start；旧数据仍可导出 |
| 4290 | 触发限流 | 稍后重试 |
| TIMEOUT | 客户端等待超时 | 先 status 查状态，不要连续盲目重试 |

不要承诺 100% 成功。仅采集公开视频公开弹幕，遵守平台规则和数据合规要求。
