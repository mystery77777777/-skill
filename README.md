# Social Media Skills | 社媒采集 Skills

A bilingual collection of AI-agent skills and zero-dependency Node.js CLIs for social-media data collection, link conversion, hot-list tracking, and CSV export — covering 12 platforms and 60+ skills.

一套面向 AI Agent 的社媒数据采集 Skill 与零依赖 Node.js CLI，覆盖 12 个平台、60+ 个 Skill，支持多平台内容采集、互动数追踪、热榜监控、链接转换和 CSV 导出。无需账号，采集端的困难全由后台解决。

## 中文说明

### 系统可以做什么

本仓库是「社媒采集平台」的客户端 Skill 集合。平台通过统一 API 提供任务提交、异步队列、结果查询、点数计费和 CSV 导出能力；Skill 让这些能力可以直接被 Claude Code 等 AI Agent 调用，也可以通过命令行独立使用。

主要用途：

- **内容数据采集**：批量采集笔记、视频、文章或微博正文及点赞、收藏、评论、分享、播放等互动指标。
- **关键词搜索**：按关键词和页数采集搜索结果，用于选题调研、竞品监测和达人初筛。
- **作者主页采集**：采集博主、UP 主或账号主页的作品列表，用于内容盘点和 KOL 调研。
- **评论与弹幕采集**：按页采集主评论，并按需展开回复或子评论；抖音支持弹幕采集，适用于舆情与用户反馈分析。
- **热榜监控**：微博、小红书、今日头条、懂车帝实时热榜采集与导出。
- **公众号与视频号**：微信搜一搜文章搜索、公众号历史发文 / 基础信息 / 文章详情 / 评论 / 阅读数、视频号作品列表与评论。
- **小红书蒲公英**：官方合作平台热门商业笔记搜索、博主搜索、博主详情与笔记采集。
- **小红书链接工具**：将失效笔记链接转换为携带 `xsec_token` 的可访问链接，或将长链转换为 `xhslink.com` 短链。
- **结果导出**：将任务结果导出为带 BOM 的 CSV，方便直接使用 Excel 打开。

### Skill 能力总览

| 平台 | Skill | 能力 |
|---|---|---|
| 小红书 | `xhs-dpt` | 笔记互动数采集 |
| 小红书 | `xhs-search` | 关键词搜索笔记 |
| 小红书 | `xhs-profile` | 博主主页笔记列表 |
| 小红书 | `xhs-comments` | 主评论与子评论分步采集 |
| 小红书 | `xhs-hot` | 小红书热榜 |
| 小红书 | `xhs-convert-url-pro` | 失效链接转有效链接 |
| 小红书 | `xhs-short-url` | 长链转短链 |
| 蒲公英 | `pgy-note-search` / `pgy-note-collect` | 热门商业笔记搜索、博主笔记采集 |
| 蒲公英 | `pgy-blogger-search` / `pgy-blogger-detail` | 博主搜索、博主详情 |
| 抖音 | `dy-collect` / `dy-search` / `dy-profile` / `dy-comments` | 互动数、搜索、主页、评论 |
| 抖音 | `dy-danmaku` | 弹幕采集（会话制） |
| 快手 | `ks-collect` / `ks-search` / `ks-profile` / `ks-comments` | 互动数、搜索、主页、评论 |
| B 站 | `b-collect` / `b-search` / `b-profile` / `b-comments` | 互动数、搜索、UP 主主页、评论 |
| 微博 | `wb-collect` / `wb-search` / `wb-profile` / `wb-comments` | 主帖、搜索、主页、评论 |
| 微博 | `wb-hot` | 实时热榜与热搜导出 |
| 知乎 | `zh-search` / `zh-article-search` | 关键词搜索、文章搜索 |
| 知乎 | `zh-answers` / `zh-articles` / `zh-detail` | 回答列表、专栏文章列表、文章详情 |
| 知乎 | `zh-profile` / `zh-comments` | 用户信息、评论采集（会话制） |
| 微信公众号 | `wx-search` / `wx-account-articles` / `wx-account-profile` | 搜一搜文章、历史发文、账号信息 |
| 微信公众号 | `wx-article-detail` / `wx-article-read` / `wx-article-comments` | 文章详情、互动数、评论 |
| 微信视频号 | `wx-video-list` / `wx-video-comments` | 作品列表、一级评论 |
| 汽车之家 | `ah-detail` / `ah-stats` / `ah-comments` | 内容详情、互动数、评论（会话制） |
| 懂车帝 | `dcd-detail` / `dcd-stats` / `dcd-comments` | 内容详情、互动数、评论（会话制） |
| 懂车帝 | `dcd-hot` | 实时热榜 |
| 百度 | `bd-news-search` / `bd-detail` / `bd-video-search` | 新闻页列表、百家号 / 好看视频详情、好看视频搜索 |
| 搜狐 | `sohu-search` / `sohu-detail` / `sohu-comments` | 站内搜索、文章详情、评论（会话制） |
| 今日头条 | `tt-hot` | 实时热榜 |

每个目录中的 `SKILL.md` 提供该 Skill 的完整参数、命令、返回结构、计费规则和示例。

### 快速开始

环境要求：**Node.js 18 或更高版本**，CLI 无需安装额外 npm 依赖。

```bash
# 进入一个 Skill 目录
cd wb-hot

# 查看版本与账号点数
node cli.js version
node cli.js quota

# 示例：采集微博实时热榜并等待结果
node cli.js submit --wait

# 示例：导出任务结果
node cli.js export <task_id> --wait --out hot-list.csv
```

首次使用需要注册或登录平台账号。各 Skill 的登录命令略有差异，请以对应目录的 `SKILL.md` 为准。默认服务地址为 `http://st.aidata366.com`，也可通过 CLI 配置其他服务地址。

### 计费与凭证

- 点数换算：**0.1 元 = 1 点数**，注册赠送 10 点数。
- 不同能力按条、页、步骤或采集次数计费，准确价格以各 `SKILL.md` 和平台实时价格为准。
- 用户 Token 默认保存在 `~/.xhs-platform/config.json`，该文件含有凭证，**不要提交到 Git 仓库**。
- 请仅在获得授权并符合目标平台规则、适用法律法规的场景下使用这些工具。

## English Overview

### What the platform and skills do

This repository contains client skills for a unified social-media collection platform. The platform provides task submission, asynchronous processing, result polling, quota-based billing, and CSV export. The skills expose those capabilities to AI agents such as Claude Code and to users through standalone command-line tools.

Key capabilities:

- **Post and video metrics**: collect content metadata and engagement metrics such as likes, favorites, comments, shares, and views.
- **Keyword search**: gather search results for topic research, competitor monitoring, and creator discovery.
- **Creator profiles**: collect posts or videos from creator and account profile pages.
- **Comments, replies, and danmaku**: collect comments page by page, expand replies when needed, and capture Douyin danmaku for sentiment and audience research.
- **Hot lists**: real-time trending lists for Weibo, Xiaohongshu, Toutiao, and Dongchedi.
- **WeChat ecosystem**: WeChat article search, Official Account history/profile/article details/read metrics/comments, and Channels (视频号) video lists and comments.
- **Xiaohongshu Pugongying (蒲公英)**: search trending commercial notes, discover bloggers, and collect blogger profiles and notes from Xiaohongshu's official partnership platform.
- **Xiaohongshu link utilities**: convert expired note links into accessible URLs containing `xsec_token`, or create `xhslink.com` short links.
- **CSV export**: export task results as Excel-friendly CSV files with BOM.

### Platform coverage

| Platform | Skills |
|---|---|
| Xiaohongshu (小红书) | `xhs-dpt`, `xhs-search`, `xhs-profile`, `xhs-comments`, `xhs-hot`, `xhs-convert-url-pro`, `xhs-short-url` |
| Pugongying (蒲公英) | `pgy-note-search`, `pgy-note-collect`, `pgy-blogger-search`, `pgy-blogger-detail` |
| Douyin (抖音) | `dy-collect`, `dy-search`, `dy-profile`, `dy-comments`, `dy-danmaku` |
| Kuaishou (快手) | `ks-collect`, `ks-search`, `ks-profile`, `ks-comments` |
| Bilibili (B 站) | `b-collect`, `b-search`, `b-profile`, `b-comments` |
| Weibo (微博) | `wb-collect`, `wb-search`, `wb-profile`, `wb-comments`, `wb-hot` |
| Zhihu (知乎) | `zh-search`, `zh-article-search`, `zh-answers`, `zh-articles`, `zh-detail`, `zh-profile`, `zh-comments` |
| WeChat (微信) | `wx-search`, `wx-account-articles`, `wx-account-profile`, `wx-article-detail`, `wx-article-read`, `wx-article-comments`, `wx-video-list`, `wx-video-comments` |
| Autohome (汽车之家) | `ah-detail`, `ah-stats`, `ah-comments` |
| Dongchedi (懂车帝) | `dcd-detail`, `dcd-stats`, `dcd-comments`, `dcd-hot` |
| Baidu (百度) | `bd-news-search`, `bd-detail`, `bd-video-search` |
| Sohu (搜狐) | `sohu-search`, `sohu-detail`, `sohu-comments` |
| Toutiao (今日头条) | `tt-hot` |

### Usage

Requirements: **Node.js 18+**. The CLIs have no external npm dependencies.

```bash
cd wb-hot
node cli.js version
node cli.js quota
node cli.js submit --wait
node cli.js export <task_id> --wait --out hot-list.csv
```

See each skill directory's `SKILL.md` for authentication, arguments, response schemas, current pricing, and complete examples. The default API endpoint is `http://st.aidata366.com` and can be changed through the CLI configuration.

### Billing and credentials

- **0.1 CNY = 1 quota point**, with 10 free points on registration. Capabilities are billed per item, page, step, or collection run as documented in each `SKILL.md`.
- User credentials are stored in `~/.xhs-platform/config.json`. **Never commit this file or real tokens to Git.**
- Use these tools only with appropriate authorization and in compliance with platform rules and applicable laws.

## Repository Layout | 仓库结构

```text
<skill-name>/
  SKILL.md       # Agent instructions and complete usage documentation
  cli.js         # Zero-dependency Node.js CLI
  package.json   # Package metadata and Node.js requirement
  src/           # API client, configuration, and output helpers
_shared/         # Shared client utilities
dist/            # Packaged skill distributions
```
