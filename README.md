# Social Media Skills | 社媒采集 Skills

A bilingual collection of AI-agent skills and zero-dependency Node.js CLIs for social-media data collection, link conversion, and CSV export.

一套面向 AI Agent 的社媒数据采集 Skill 与零依赖 Node.js CLI，支持多平台内容采集、链接转换和 CSV 导出。无需账号，采集端的困难全由后台解决。

## 中文说明

### 系统可以做什么

本仓库是「社媒采集平台」的客户端 Skill 集合。平台通过统一 API 提供任务提交、异步队列、结果查询、点数计费和 CSV 导出能力；Skill 让这些能力可以直接被 Claude Code 等 AI Agent 调用，也可以通过命令行独立使用。

主要用途：

- **内容数据采集**：批量采集笔记、视频或微博正文及点赞、收藏、评论、分享、播放等互动指标。
- **关键词搜索**：按关键词和页数采集搜索结果，用于选题调研、竞品监测和达人初筛。
- **作者主页采集**：采集博主、UP 主或账号主页的作品列表，用于内容盘点和 KOL 调研。
- **评论采集**：按页采集主评论，并按需展开回复或子评论，适用于舆情与用户反馈分析。
- **微博实时热榜**：直接通过 HTTP 获取公开热榜，无需微博 Cookie 或浏览器节点。
- **小红书链接工具**：将失效笔记链接转换为携带 `xsec_token` 的可访问链接，或将长链转换为 `xhslink.com` 短链。
- **结果导出**：将任务结果导出为带 BOM 的 CSV，方便直接使用 Excel 打开。

### Skill 能力总览

| 平台 | Skill | 能力 |
|---|---|---|
| 小红书 | `xhs-dpt` | 笔记互动数采集 |
| 小红书 | `xhs-search` | 关键词搜索笔记 |
| 小红书 | `xhs-profile` | 博主主页笔记列表 |
| 小红书 | `xhs-comments` | 主评论与子评论分步采集 |
| 小红书 | `xhs-convert-url-pro` | 失效链接转有效链接 |
| 小红书 | `xhs-short-url` | 长链转短链 |
| 抖音 | `dy-collect` / `dy-search` / `dy-profile` / `dy-comments` | 互动数、搜索、主页、评论 |
| 快手 | `ks-collect` / `ks-search` / `ks-profile` / `ks-comments` | 互动数、搜索、主页、评论 |
| B 站 | `b-collect` / `b-search` / `b-profile` / `b-comments` | 互动数、搜索、UP 主主页、评论 |
| 微博 | `wb-collect` / `wb-search` / `wb-profile` / `wb-comments` | 主帖、搜索、主页、评论 |
| 微博 | `wb-hot` | 实时热榜与热搜导出 |

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

- 点数换算：**0.1 元 = 1 点数**。
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
- **Comments and replies**: collect comments page by page and expand replies when needed for sentiment and audience research.
- **Weibo hot search**: fetch the public real-time hot-search list over HTTP without a Weibo cookie or browser worker.
- **Xiaohongshu link utilities**: convert expired note links into accessible URLs containing `xsec_token`, or create `xhslink.com` short links.
- **CSV export**: export task results as Excel-friendly CSV files with BOM.

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

- **0.1 CNY = 1 quota point.** Capabilities are billed per item, page, step, or collection run as documented in each `SKILL.md`.
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
