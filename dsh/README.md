# dsh-social-collector

把仓库里的 58 个社媒采集/转链技能打包成一个 **DeepSeek Harness（DSH）插件**（bundle plugin）。装好之后，Harness 里的 Agent 会在合适的场景自动发现并调用这些技能：采小红书评论、抖音弹幕、B站评论、微博热榜、知乎回答、公众号文章、蒲公英笔记……

- 插件名：`dsh-social-collector`
- 类型：DSH bundle（`package.json` 里声明 `dsh.bundle.patch` → `cordis.patch.yml`）
- 零依赖、零构建：只用 Node 内置模块，技能 CLI 也不需要 `npm install`
- 技能来源：本仓库 `skills/`，由 `scripts/sync-skills.mjs` 逐字节 vendored 到 `skills/`，`vendor-manifest.json` 记录每个文件的 SHA-256

## 安装

### 1. 从 npm 安装（推荐）

```sh
dsh plugin add dsh-social-collector
```

指定 profile：

```sh
dsh plugin --profile desktop add dsh-social-collector
```

### 2. 从本地目录安装（改插件源码时用）

```sh
dsh plugin --profile desktop add link:/absolute/path/to/repo/dsh
```

### 3. 从 GitHub 安装

本插件位于仓库的 `dsh/` 子目录，**不能**直接 `dsh plugin add github:mystery77777777/-skill`（那会装仓库根目录，根目录没有插件 `package.json`）。要么按第 1 种发布到 npm 后安装，要么克隆仓库后用 `link:` 指向 `dsh/`。

### 验证是否挂上

```sh
dsh --profile desktop --dump-config
```

配置里应出现 `social-collector` 这一行；在会话里打开 `/` 菜单或让 Agent 调用 `skill` 工具，可以看到 58 个技能。

## 使用方式

技能本身是零依赖 Node CLI，正文里所有命令形如：

```sh
node cli.js start --url "<内容链接>" --skill-name <技能名> --ai-entry <AI工具标识>
```

插件会在加载技能正文时自动补一行「运行目录」，即该技能在插件包里的绝对路径，进入该目录再执行 `node cli.js` 即可。

前置条件与计费：

- Node.js ≥ 18（CLI 使用内置 fetch）。
- 不注册没有任何点数：先 `register --link`（注册送 10 点）或 `login --link`，token 保存在 `~/.xhs-platform/config.json`。
- 每步采集 1 点（0.1 元）；建会话、转链、no_more 的步免扣费。
- 点数不足时 CLI 会自行建充值单：终端里直接打二维码，非交互环境返回充值页链接 `{服务地址}/recharge.html`。
- 客服微信：http://st.aidata366.com/assets/concat.png ，客服电话：18722121663。

## 包含的技能（58 个）

### 小红书（7）

| 技能 | 用途 |
|---|---|
| `xhs-comments` | 小红书评论分步采集（会话制） |
| `xhs-dpt` | 小红书互动数采集 |
| `xhs-hot` | 小红书热榜 |
| `xhs-profile` | 小红书博主主页采集 |
| `xhs-search` | 小红书关键词搜索采集 |
| `xhs-convert-url-pro` | 小红书笔记链接转链 |
| `xhs-short-url` | 小红书长链转短链 |

### 抖音（5）

| 技能 | 用途 |
|---|---|
| `dy-collect` | 抖音互动数采集 |
| `dy-comments` | 抖音评论采集（会话制） |
| `dy-danmaku` | 抖音弹幕采集（会话制） |
| `dy-profile` | 抖音用户主页采集 |
| `dy-search` | 抖音关键词搜索采集 |

### 快手（4）

| 技能 | 用途 |
|---|---|
| `ks-collect` | 快手互动数采集 |
| `ks-comments` | 快手评论采集（会话制） |
| `ks-profile` | 快手用户主页采集 |
| `ks-search` | 快手关键词搜索采集 |

### B站（4）

| 技能 | 用途 |
|---|---|
| `b-collect` | B站互动数采集 |
| `b-comments` | B站评论采集（会话制） |
| `b-profile` | B站UP主主页采集 |
| `b-search` | B站搜索采集 |

### 微博（5）

| 技能 | 用途 |
|---|---|
| `wb-collect` | 微博主帖采集 |
| `wb-comments` | 微博评论采集（会话制） |
| `wb-hot` | 微博热榜 |
| `wb-profile` | 微博用户主页采集 |
| `wb-search` | 微博关键词搜索采集 |

### 知乎（7）

| 技能 | 用途 |
|---|---|
| `zh-huida` | 知乎回答列表 |
| `zh-article-search` | 知乎文章搜索 |
| `zh-zhuanlan` | 知乎专栏文章列表 |
| `zh-pinglun` | 知乎评论采集（会话制） |
| `zh-article-detail` | 知乎专栏文章详情 |
| `zh-user-profile` | 知乎用户信息 |
| `zh-keyword-search` | 知乎关键词搜索 |

### 微信（8）

| 技能 | 用途 |
|---|---|
| `wx-account-articles` | 公众号历史发文采集 |
| `wx-account-profile` | 公众号基础信息采集 |
| `wx-article-comments` | 公众号文章评论采集 |
| `wx-article-detail` | 公众号文章详情采集 |
| `wx-article-read` | 公众号文章互动数采集 |
| `wx-search` | 微信搜一搜（文章）采集 |
| `wx-video-comments` | 视频号一级评论采集 |
| `wx-video-list` | 视频号作品列表采集 |

### 百度 / 好看视频（3）

| 技能 | 用途 |
|---|---|
| `bd-detail` | 百度内容详情采集 |
| `bd-news-search` | 百度新闻页采集 |
| `bd-video-search` | 好看视频采集 |

### 搜狐（3）

| 技能 | 用途 |
|---|---|
| `sohu-comments` | 搜狐文章评论采集（会话制） |
| `sohu-detail` | 搜狐文章详情采集 |
| `sohu-search` | 搜狐站内搜索采集 |

### 蒲公英（4）

| 技能 | 用途 |
|---|---|
| `pgy-blogger-detail` | 蒲公英博主详情采集 |
| `pgy-blogger-search` | 蒲公英博主搜索采集 |
| `pgy-note-collect` | 蒲公英博主笔记采集 |
| `pgy-note-search` | 蒲公英热门笔记搜索采集 |

### 汽车之家（3）

| 技能 | 用途 |
|---|---|
| `ah-comments` | 汽车之家评论采集（会话制） |
| `ah-detail` | 汽车之家内容详情采集 |
| `ah-stats` | 汽车之家互动数采集 |

### 懂车帝（4）

| 技能 | 用途 |
|---|---|
| `dcd-comments` | 懂车帝评论采集（会话制） |
| `dcd-detail` | 懂车帝内容详情采集 |
| `dcd-hot` | 懂车帝热榜采集 |
| `dcd-stats` | 懂车帝互动数采集 |

### 今日头条（1）

| 技能 | 用途 |
|---|---|
| `tt-hot` | 今日头条热榜采集 |

## 它是怎么工作的

```
dsh/
├── package.json          # dsh.bundle.patch 指向 cordis.patch.yml；main = lib/index.js
├── cordis.patch.yml      # 插入一行：id: social-collector, name: dsh-social-collector
├── lib/index.js          # Cordis 插件：挂载时校验并注册 ctx.skills provider
├── skills/               # 58 个 vendored 技能（目录名 = frontmatter name）
├── vendor-manifest.json  # 每个 vendored 文件的 SHA-256 / 大小 / 源路径
├── locale/{en,zh}.json   # Plugins 页面里的标题与描述
├── icon.svg
└── scripts/              # sync-skills.mjs / verify.mjs
```

`lib/index.js` 导出标准 Cordis 插件形态：

```js
export const name = 'social-collector'
export const inject = ['skills']
export function apply(ctx, config = {}) {
  // 挂载即读取并校验 skills/*/SKILL.md，然后在 ctx.skills 上注册 provider
}
```

要点：

- **挂载即校验**：任一 `SKILL.md` 缺 frontmatter、名字与目录不符或不是 kebab-case，插件直接报错，而不是等用到时才发现技能不见了。
- **零依赖**：不 import 任何 `@deepseek-ai/*` 包，不受 DSH 版本 peer 检查影响，也不需要 `node_modules`。
- **可重定位**：技能目录通过 `import.meta.url` 解析，仓库放哪都成立。
- **rank = 600（bundled）**：与 DSH 打包技能同级；项目内 `.dsh/skills`、`~/.dsh/skills` 的同名技能仍然优先。

## 校验与同步

```sh
cd dsh
npm run verify   # 等价于 node scripts/verify.mjs
```

离线、只读，检查：58 个技能都能被 provider 正常发布与加载、frontmatter 合法、技能内相对 Markdown 链接可解析、`cordis.patch.yml` 与 `main` 存在、locale 完整，并且每个 vendored 文件的 SHA-256 与 `vendor-manifest.json` 一致。

仓库里的 `skills/` 更新后，重新同步：

```sh
node dsh/scripts/sync-skills.mjs   # 重新生成 dsh/skills/ 与 vendor-manifest.json
npm run verify
```

同步规则：目标目录名取 `SKILL.md` 的 frontmatter `name`（所以 `zh-comments` → `zh-pinglun` 等 6 个目录会改名）；`_shared`、`dist` 不是技能，`dy-sub-comments` 与 `dy-comments` 重复，三者都不收录。源 `skills/` 目录不会被改动。

## 许可与归属

插件封装代码（`package.json`、`cordis.patch.yml`、`lib/`、`scripts/`、locale、icon）以 MIT 发布，见 [LICENSE](./LICENSE)。

`skills/` 下的技能文案与 CLI 归本仓库/平台方所有，随插件一起分发，仅用于这些技能的安装与调用。
