# 小红书转链服务 API 接口文档

> 面向「直接 HTTP 集成」的调用方。本文档从 `xhs-convert-url-pro` skill 的客户端实现（`src/client.js`）及其对后端的真实调用中整理而成，**所有已标注「实测」的字段均为实际请求验证过的返回值**。
>
> - 服务方：小红书转链服务（FastAPI）
> - 文档版本：v1.0（对应 skill v2.0.0）
> - 整理日期：2026-09-21

---

## 1. 基础信息

| 项目 | 值 |
|---|---|
| Base URL | `http://st.aidata366.com` |
| API 前缀 | `/api/v1`（所有接口路径自动拼接该前缀） |
| 完整示例 | `http://st.aidata366.com/api/v1/user/profile` |
| 协议 | HTTP / HTTPS 均可；生产建议 HTTPS |
| 请求编码 | `application/json; charset=utf-8` |
| 鉴权方式 | `Authorization: Bearer <token>` |
| 建议超时 | 15 秒（skill 客户端内置的默认超时） |
| 依赖 | 无 SDK 依赖，任意 HTTP 客户端可直接调用 |

### 1.1 统一响应信封

**所有接口（含鉴权/业务失败）的 HTTP 状态码均为 `200`**，业务结果看响应体里的 `code` 字段：

```json
{
  "code": 0,
  "message": "ok",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | int | `0` 表示成功；非 `0` 为业务错误码（见第 7 节） |
| `message` | string | 成功为 `"ok"`；失败为中文可读错误描述 |
| `data` | object \| null | 业务数据；失败时通常为 `null` |

成功判定：**`code === 0` 后取 `data`**。必须先判 `code`，不能只看 HTTP 状态码。

失败示例（未登录，实测）：

```json
{"code":1002,"message":"未登录或 Token 无效/过期","data":null}
```

参数校验错误（实测，后端为 pydantic 校验）：

```json
{"code":1001,"message":"access_token: String should have at least 16 characters","data":null}
```

> **例外：限流**。当 HTTP 状态码为 `429` 时，响应体可能不是标准信封，调用方应按 `4290`（触发限流）处理并读取 `Retry-After` 退避重试。

---

## 2. 鉴权与凭证获取

除「创建会话」「校验会话」「拉取二维码」三个接口外，其余接口都必须在请求头携带 token：

```
Authorization: Bearer <token>
```

**token 只能通过扫码/链接方式获取**——服务端对登录与注册强制图形验证码，服务端不存在可用的「账号密码直连登录」接口。集成方的标准做法是：

1. 调用 `POST /auth/cli-session` 拿到 `access_token` 与页面地址；
2. 把页面地址/二维码展示给终端用户，引导其在手机上完成注册或登录；
3. 轮询 `POST /auth/cli-session/check`，用户完成后返回 `token`；
4. 持久化该 token，后续所有业务接口直接复用。

token 长期有效，直到调用 `/auth/logout` 吊销。凭证可与同平台的「小红书互动数采集」服务（`xhs-dpt`）共用。

---

## 3. 接口清单

| # | 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|---|
| 1 | POST | `/auth/cli-session` | 否 | 创建扫码登录/注册会话 |
| 2 | POST | `/auth/cli-session/check` | 否 | 校验会话状态，换取 token |
| 3 | GET | `/auth/cli-session/{key}/qr.png` | 否 | 获取会话二维码图片 |
| 4 | POST | `/auth/logout` | 是 | 吊销当前 token |
| 5 | GET | `/user/profile` | 是 | 查询账号信息与剩余点数 |
| 6 | POST | `/tasks` | 是 | 提交转链任务 |
| 7 | GET | `/tasks/{task_id}` | 是 | 查询任务状态与转链结果 |

---

## 4. 鉴权类接口

### 4.1 创建扫码会话

```
POST /api/v1/auth/cli-session
```

无需鉴权，无请求体。会话有效期 10 分钟（实测 `expires_in=600`）。**注册与登录共用同一个会话**：同一个 `access_token` 既能打开登录页也能打开注册页，供用户自选。

**响应 `data`**（实测）：

```json
{
  "access_token": "f83e0c4bfa7918318843646568ecd43f",
  "expires_in": 600,
  "login_path": "/cli-login.html?key=f83e0c4bfa7918318843646568ecd43f",
  "qr_path": "/api/v1/auth/cli-session/f83e0c4bfa7918318843646568ecd43f/qr.png",
  "register_path": "/cli-register.html?key=f83e0c4bfa7918318843646568ecd43f",
  "register_qr_path": "/api/v1/auth/cli-session/f83e0c4bfa7918318843646568ecd43f/qr.png?page=cli-register"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `access_token` | string | 会话凭证，16~64 位十六进制小写串；后续校验用 |
| `expires_in` | int | 会话有效秒数（600） |
| `login_path` | string | 登录页相对路径，需拼接 Base URL |
| `qr_path` | string | 登录二维码相对路径 |
| `register_path` | string | 注册页相对路径（注册成功送 10 点数） |
| `register_qr_path` | string | 注册二维码相对路径 |

拼接规则：`页面/二维码完整地址 = Base URL + 对应 path 字段`（不加 `/api/v1` 前缀）。

```bash
curl -s -X POST http://st.aidata366.com/api/v1/auth/cli-session
```

### 4.2 校验会话并换取 token

```
POST /api/v1/auth/cli-session/check
Content-Type: application/json

{ "access_token": "<上一步下发的 access_token>" }
```

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `access_token` | string | 是 | 16~64 位十六进制字符串；格式非法直接返回 `1001` |

**响应 `data`**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | `pending` = 用户尚未完成操作；`ready` = 已完成，同返回 `token` |
| `token` | string | 仅在 `status=ready` 时出现，即后续使用的 Bearer token |
| `phone` | string | 用户手机号（脱敏与否由服务端决定） |
| `quota_balance` | int | 当前剩余点数 |

未完成时（实测）：

```json
{"code":0,"message":"ok","data":{"status":"pending"}}
```

完成时：

```json
{"code":0,"message":"ok","data":{"status":"ready","token":"eyJ...","phone":"138****0000","quota_balance":10}}
```

**调用方处理建议**：以 3~5 秒间隔轮询本接口，直到 `status` 变为 `ready` 或超过 `expires_in`；超时需重新走 4.1 建会话。客户端侧 `pending` 与「会话已过期/已使用」应分别映射为 `LOGIN_PENDING` / `LOGIN_EXPIRED` 两种提示。

```bash
curl -s -X POST http://st.aidata366.com/api/v1/auth/cli-session/check \
  -H "Content-Type: application/json" \
  -d '{"access_token":"f83e0c4bfa7918318843646568ecd43f"}'
```

### 4.3 获取二维码图片

```
GET /api/v1/auth/cli-session/{key}/qr.png
GET /api/v1/auth/cli-session/{key}/qr.png?page=cli-register
```

- `key` 即 `access_token`。
- 返回 `image/png` 二进制，非 JSON 信封。
- 加 `?page=cli-register` 得到注册页二维码，否则为登录页二维码。
- 可直接 `<img src="...">` 嵌入前端页面。

### 4.4 登出

```
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

服务端吊销 token。无请求体。响应 `data` 内容由服务端决定（调用方只需判 `code`）。登出后本地缓存的 token 必须一并清除。

---

## 5. 账号与点数

### 5.1 查询个人信息与点数

```
GET /api/v1/user/profile
Authorization: Bearer <token>
```

**响应 `data`**：

```json
{
  "id": 1,
  "phone": "13800000000",
  "nickname": "",
  "quota": 10,
  "role": "user",
  "last_login_at": "",
  "created_at": "2026-01-01T00:00:00"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int | 用户 ID |
| `phone` | string | 手机号 |
| `nickname` | string | 昵称（可能为空串） |
| `quota` | int | **剩余点数**，1 点数 = 1 条有效链接转换 |
| `role` | string | 角色（如 `user`） |
| `last_login_at` | string | 最近登录时间（可能为空串） |
| `created_at` | string | 注册时间（ISO 8601） |

**提交任务前应先调用本接口确认 `quota` ≥ 待提交的有效链接数**，否则会返回 `3001` 点数不足。

```bash
curl -s http://st.aidata366.com/api/v1/user/profile -H "Authorization: Bearer <token>"
```

---

## 6. 转链任务接口

### 6.1 提交转链任务

```
POST /api/v1/tasks
Authorization: Bearer <token>
Content-Type: application/json
X-Idempotency-Key: <32位幂等键>
```

**请求头**

| 头 | 必填 | 说明 |
|---|---|---|
| `Authorization` | 是 | `Bearer <token>` |
| `Content-Type` | 是 | `application/json` |
| `X-Idempotency-Key` | 是 | 幂等键，见下方规则 |

**请求体**

```json
{
  "items": [
    { "id": 1, "url": "https://www.xiaohongshu.com/explore/6970ac3c000000000a03d7d5" },
    { "id": 2, "url": "http://xhslink.com/o/pl4tP4IXRa" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `items` | array | 是 | 待转链链接数组，**1~50 条**，超过返回 `3002` |
| `items[].id` | int | 是 | 条目标号，从 1 递增；用于结果与入参顺序对齐 |
| `items[].url` | string | 是 | 小红书笔记链接 |

**支持的链接格式**（服务端自动识别与还原）：

- `https://www.xiaohongshu.com/explore/<note_id>`
- `https://www.xiaohongshu.com/discovery/item/<note_id>`
- `http://xhslink.com/...` 短链（服务端自动还原为真实笔记）

**幂等键规则**（重要，直接决定计费）：

```
X-Idempotency-Key = sha256( urls.join("\n") ).hexdigest().slice(0, 32)
```

即把所有 URL 按提交顺序用换行符拼接后取 SHA-256 前 32 位。

- 同一批 URL 重复提交 / 网络重试 → 幂等键相同 → 服务端返回原任务，**不重复扣费**；
- URL 内容或顺序变化 → 幂等键自动变化 → 作为新任务受理；
- 唯一例外：因服务端登录态失效导致整单失败且已全额返还的任务，重提同批链接会被服务端清理旧任务并**重新受理**，不会被幂等键挡住。

**响应 `data`**

```json
{
  "task_id": "t_20260917_a1b2c3",
  "total": 2,
  "valid_count": 2,
  "invalid_count": 0,
  "charged": 2,
  "quota_balance": 8,
  "status": "pending"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `task_id` | string | 任务 ID，后续查询结果用 |
| `total` | int | 提交总条数 |
| `valid_count` | int | 合法链接条数 |
| `invalid_count` | int | 非法链接条数（不扣费） |
| `charged` | int | 本次实际扣减点数 |
| `quota_balance` | int | 扣费后剩余点数 |
| `status` | string | 初始为 `pending` |

提交是**异步**的，需继续用 6.2 轮询直到终态。

```bash
curl -s -X POST http://st.aidata366.com/api/v1/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(printf '%s\n' "URL1" "URL2" | sha256sum | cut -c1-32)" \
  -d '{"items":[{"id":1,"url":"https://www.xiaohongshu.com/explore/6970ac3c000000000a03d7d5"}]}'
```

### 6.2 查询任务与结果

```
GET /api/v1/tasks/{task_id}
Authorization: Bearer <token>
```

`task_id` 需 URL 编码。任务不存在或不属于当前账号返回 `3003`。

**响应 `data`**

```json
{
  "task_id": "t_20260917_a1b2c3",
  "status": "done",
  "total": 2,
  "valid_count": 2,
  "invalid_count": 0,
  "success_count": 2,
  "fail_count": 0,
  "charged_quota": 2,
  "refunded_quota": 0,
  "items": [
    {
      "id": 1,
      "url": "https://www.xiaohongshu.com/explore/6970ac3c000000000a03d7d5",
      "note_id": "6970ac3c000000000a03d7d5",
      "new_url": "https://www.xiaohongshu.com/explore/6970ac3c000000000a03d7d5?xsec_token=AB...",
      "status": "success",
      "fail_reason": ""
    }
  ]
}
```

**任务级字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `task_id` | string | 任务 ID |
| `status` | string | 见下方状态机 |
| `total` / `valid_count` / `invalid_count` | int | 与提交时一致 |
| `success_count` | int | 转链成功条数 |
| `fail_count` | int | 失败条数 |
| `charged_quota` | int | 实际扣费点数 |
| `refunded_quota` | int | 已返还点数 |
| `items` | array | 逐条结果，顺序与提交顺序一致 |

**条目级字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | int | 与提交时的 `items[].id` 对应 |
| `url` | string | 原始提交链接 |
| `note_id` | string | 解析出的笔记 ID |
| `new_url` | string | **转换后的最终链接，已携带 `xsec_token`，浏览器可直接打开** |
| `status` | string | `success` 成功 / `failed` 失败 / `invalid` 链接非法（不扣费） |
| `fail_reason` | string | 失败原因；成功时为空串 |

**任务状态机**

| 状态 | 类别 | 说明 |
|---|---|---|
| `pending` | 中间态 | 已受理，排队中 |
| `processing` / `running` | 中间态（推测） | 转链进行中 |
| `done` | **终态** | 全部成功 |
| `partial_failed` | **终态** | 部分失败 |
| `failed` | **终态** | 全部失败 |

> 中间态的确切取值以服务端为准，调用方**建议用「不属于终态集合 `done`/`partial_failed`/`failed` 即继续轮询」**的判定方式，避免依赖具体中间态名称。

**轮询建议**：间隔 2 秒、总超时 120 秒；链接较多（如 50 条）时把超时放大到 300 秒。超时不代表失败，可保留 `task_id` 稍后继续查。

```bash
curl -s http://st.aidata366.com/api/v1/tasks/t_20260917_a1b2c3 -H "Authorization: Bearer <token>"
```

---

## 7. 错误码

| code | HTTP | 含义 | 调用方处理 |
|---|---|---|---|
| `0` | 200 | 成功 | 取 `data` |
| `1001` | 200 | 参数错误 / 参数校验失败 | 检查请求体与路径参数，不要重试 |
| `1002` | 200 | 未登录或 token 无效/过期 | 重新走扫码登录获取 token |
| `1003` | 200 | 未登录（变体） | 同上 |
| `2001` | 200 | 短信验证码错误或过期 | 引导用户在页面重新获取验证码 |
| `2003` | 200 | 需要图形验证码 | 服务端强制图形验证码，**程序化接口无法完成**，必须走扫码/链接方式 |
| `3001` | 200 | 点数不足 | 联系客服充值，**不要重试** |
| `3002` | 200 | 超单次批量上限（50 条） | 拆分为 ≤50 条/批重新提交 |
| `3003` | 200 | 任务不存在 | 检查 `task_id` 是否属于当前账号 |
| `4290` | 429 | 触发限流 | 按 `Retry-After` 退避后重试 |
| — | 非 200 / 非信封 | 服务异常或网关错误 | 按网络错误处理，检查 Base URL 与可达性 |

客户端侧（非服务端返回）的伪错误码：

| 伪码 | 含义 | 处理 |
|---|---|---|
| `LOGIN_PENDING` | 会话仍为 `pending`，用户未完成扫码 | 提醒用户完成操作后继续轮询 check |
| `LOGIN_EXPIRED` | 会话已过期（10 分钟）或已使用 | 重新创建扫码会话 |
| `TIMEOUT` | 轮询超时，任务未到终态 | 保留 `task_id`，稍后继续查询 |
| `NETWORK_ERROR` | 连接失败 / 超时 / 非信封响应 | 检查服务可达性与 Base URL |

---

## 8. 计费规则

- 每条**有效** URL 扣 **1 点数**（提交时预扣）；无效链接（非笔记链接/格式错误）**不扣费**。
- 短链（`xhslink`）还原失败 → 该条点数自动返还，体现在 `refunded_quota`。
- 服务端转链登录态失效（服务端临时故障）→ 按条自动返还，体现在 `refunded_quota`。
- 已进入转链流程后失败的条目（如笔记已删除）→ **不返还**。
- 幂等键相同的重复提交不重复扣费。
- 定价：**0.2 元/条**；注册送 10 点数；充值与大量采购联系客服 18722121663。

---

## 9. 集成示例

### 9.1 完整流程（Node.js，零依赖）

```js
const BASE = 'http://st.aidata366.com';
const API = BASE + '/api/v1';
const crypto = require('crypto');

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (typeof data.code === 'number' && data.code !== 0) {
    throw Object.assign(new Error(data.message), { code: data.code });
  }
  return data.data;
}

// 1) 查点数
const profile = await call('GET', '/user/profile', { token });
if (profile.quota < urls.length) throw new Error('点数不足');

// 2) 提交
const items = urls.map((url, i) => ({ id: i + 1, url }));
const key = crypto.createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 32);
const task = await call('POST', '/tasks', { token, body: { items }, headers: { 'X-Idempotency-Key': key } });

// 3) 轮询终态
const TERMINAL = new Set(['done', 'partial_failed', 'failed']);
let result = task;
const deadline = Date.now() + 120_000;
while (!TERMINAL.has(result.status)) {
  if (Date.now() > deadline) throw new Error('轮询超时，保留 task_id 稍后查询: ' + task.task_id);
  await new Promise((r) => setTimeout(r, 2000));
  result = await call('GET', `/tasks/${encodeURIComponent(task.task_id)}`, { token });
}

// 4) 取结果
const newUrls = result.items.filter((i) => i.status === 'success').map((i) => i.new_url);
```

### 9.2 Python（requests）

```python
import hashlib, time, requests

BASE = "http://st.aidata366.com/api/v1"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def call(method, path, **kw):
    r = requests.request(method, BASE + path, headers=HEADERS, timeout=15, **kw)
    d = r.json()
    if d.get("code") != 0:
        raise RuntimeError(f"[{d.get('code')}] {d.get('message')}")
    return d["data"]

# 提交
key = hashlib.sha256("\n".join(urls).encode()).hexdigest()[:32]
task = call("POST", "/tasks",
            json={"items": [{"id": i + 1, "url": u} for i, u in enumerate(urls)]},
            headers={**HEADERS, "X-Idempotency-Key": key})

# 轮询
TERMINAL = {"done", "partial_failed", "failed"}
res = task
end = time.time() + 120
while res["status"] not in TERMINAL:
    if time.time() > end:
        raise TimeoutError(task["task_id"])
    time.sleep(2)
    res = call("GET", f"/tasks/{task['task_id']}")

for it in res["items"]:
    print(it["url"], "->", it["new_url"], it["status"], it["fail_reason"])
```

### 9.3 扫码登录接入（前端/服务端）

```text
1. POST /auth/cli-session  ->  access_token, login_path, qr_path, register_path
2. 展示 BASE + qr_path（二维码）或 BASE + register_path（H5 页面）给用户
3. 每 3s POST /auth/cli-session/check {access_token} 直到 status == "ready"
4. 持久化 data.token，后续所有接口带 Authorization: Bearer <token>
```

---

## 10. 集成注意事项

1. **必须先判 `code` 再取 `data`**，HTTP 200 不代表业务成功。
2. **幂等键务必自己生成并持久化**：重试时复用同一个键，否则会重复扣费。
3. **单批 ≤ 50 条**，超出返回 `3002`，需自行分批；建议客户端做分批封装。
4. **轮询不要过于频繁**，建议 2~5 秒；触发 `429` 后按 `Retry-After` 退避。
5. **token 属于敏感凭证**，不要写进前端代码、不要提交 git。
6. **`new_url` 已携带 `xsec_token`**，可直接用于浏览器打开，也可作为「小红书互动数采集」服务（`xhs-dpt`，路径前缀 `/api/v1/platform/tasks`）的入参——两者凭证通用。
7. 转链为**异步**任务，提交成功（`code=0`）不等于转链成功，需轮询到终态后逐条读 `items[].status`。
8. 结果按 `items[].id` 与提交顺序一一对应，便于回填业务系统。

---

## 11. 待服务端确认项

以下内容来自 skill 文档与客户端实现，未通过实际请求验证，正式对接前建议与服务端确认：

- 任务中间态的确切取值（文档写作 `pending`，是否另有 `processing`/`running`）；
- `POST /auth/logout` 响应 `data` 的具体结构（客户端未使用）；
- `check` 接口在会话过期/已使用时返回的 `status` 值（是否为 `expired`）；
- 各接口的限流阈值（QPS / 并发任务数）；
- `note_id` 在非法链接条目下是否为空串。

## 12. 支持

- 客服微信（扫码）：http://st.aidata366.com/assets/concat.png
- 客服电话：**18722121663**
