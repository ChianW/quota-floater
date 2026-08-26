# Quota Floater

[English](README.md) | 简体中文

<p align="center">
  <img src="docs/assets/floater.gif" width="360" alt="Quota Floater — 常驻置顶的额度浮窗">
</p>

常驻置顶的额度浮窗（Windows）+ 跨平台 CLI，显示你订阅的 AI 编程套餐的**官方剩余额度**——
直接来自服务商官方接口的数字，不是按本地日志估算的花费。

- **官方额度窗口**：Claude 5h/周、Codex 速率限制、Kimi 5h/周、Cursor 月额度、
  Copilot 会话、OpenRouter 余额、Antigravity、Z.ai、DeepSeek 等 **21 家**。
- **不渲染任何密钥**：探针只读本地凭据文件；UI 消费的快照在写入时即完成脱敏
  （不含 key、cookie、邮箱）。
- **Agent 优先**：没有设置面板。由你的编程 agent 负责安装、配置和排障；
  登录这类只有人能做的步骤留给人。
- **MIT、免费、无付费墙**。探针逐字复用 MIT 协议的
  [Token Monitor](https://github.com/Javis603/token-monitor) 项目（见 NOTICE）。

## 快速开始

环境要求：Node.js >= 20；Python 3 仅浮窗 UI 需要。免安装。

```
unzip quota-floater.zip    # 或 git clone https://github.com/ChianW/quota-floater
cd quota-floater
node collect.js --json     # 首次探测：打印当前哪些套餐已点亮
start.cmd                  # Windows 浮窗  |  macOS/Linux: python3 ui.py
```

输出里缺哪家 id，只说明本机没有那家的凭据——点亮方法见下一节。
要 CLI 表格用 `quota.cmd`。

## 用 Agent 驱动它

这个工具设计为**由你的编程 agent 在对话里操作**，不经过设置界面。三种接法：

1. **直接把仓库指给 agent**（任何 agent 都行）：

   > 帮我装好 https://github.com/ChianW/quota-floater。先读 `docs/AGENT.md`
   > 和 `docs/SETUP.md`，跑一次探测，告诉我哪些套餐已经显示。

2. **安装自带技能**（若你的 agent 支持技能，如 Claude Code 的
   `~/.claude/skills/`）：把 `skill/quota-floater/` 拷进技能目录。技能内编码了
   完整工作流：探测 → 解读 → 点亮缺失的渠道 → 排障。

3. **自己读文档**：[docs/SETUP.md](docs/SETUP.md)（面向 agent 的安装与排障指南）、
   [docs/AGENT.md](docs/AGENT.md)（三步接线）。

### 添加监测渠道（provider）

想点亮某张还没出现的卡片时，用自然语言告诉 agent：

| 你说 | Agent 会做 |
| --- | --- |
| "加上 DeepSeek 监测，key 我给你。" | 设置用户级环境变量 `DEEPSEEK_API_KEY`（按你平时给 agent 凭据的方式递交，agent 不会回显），开新终端，重新探测——卡片出现。 |
| "为什么没有我的 Claude 卡片？" | 检查 `~/.claude/.credentials.json`；没有就告诉你唯一的人工步骤：用 Claude Code CLI 登录一次（或设 `CLAUDE_WEB_COOKIE`），然后验证卡片出现。 |
| "看看我的 Codex 额度。" | 检查 `~/.codex/auth.json`；没有则人工步骤是 `codex login`（会开浏览器）。 |
| "Kimi 的月度额度没显示。" | 跑 `node kimi-auth-wizard-io.js status`；月度池需要 www.kimi.com 的 cookie 粘贴——agent 把你引到 [docs/WIZARD.md](docs/WIZARD.md)，但绝不代碰 cookie。 |
| "让它每 5 分钟静默刷新。" | 按 `docs/SETUP.md` §5 配置隐藏计划任务（Task Scheduler / launchd / systemd timer）。 |
| "接入 X 服务。"（不在 21 家之内） | 仅当上游 Token Monitor 有现成探针时：按 `docs/SETUP.md` §7 逐字 vendor 进来并接一行 `collect.js`。这里不发明协议。 |

每家 provider 都遵循同一个三层模式（明细见
[docs/PROVIDERS.md](docs/PROVIDERS.md)）：

- **A 层 — 自动**：凭据已在本地（此前登录过）：kimi、zai、cursor、antigravity、
  opencode 等，无需任何操作。
- **B 层 — 环境变量**：你把已有的 key 交给 agent 设置：deepseek、minimax、grok、
  openrouter、zaiteam、volcengine 等。
- **C 层 — 人工登录**：首次登录要开浏览器，所以留给你：claude、codex、
  kimi 月度池。登录完成后 agent 接管验证。

## 支持的 21 家

Claude · Codex · Kimi · Z.ai · Z.ai Team · Cursor · Antigravity · OpenCode Go ·
OpenRouter · GitHub Copilot · DeepSeek · MiniMax · Grok · Kiro · Qoder ·
火山引擎（Volcengine）· Ollama · WorkBuddy · Command Code / MiMo / 第三方自定义——
完整凭据矩阵见 [docs/PROVIDERS.md](docs/PROVIDERS.md)。

## 隐私与安全

- 凭据只从本地文件和用户环境变量读取。不上传、无遥测、无账号体系。
- `snapshot.json`（UI/CLI/你的 agent 唯一读取的东西）只含 id、百分比和重置时间，
  写入时即脱敏。
- 密钥不进聊天和日志；JSON 文件保持 UTF-8 无 BOM。这两条规则已写进 agent 技能与文档。

## 文档

| 文件 | 用途 |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | 面向 agent 的安装与排障指南（点亮矩阵、排障手册、平台矩阵） |
| [docs/AGENT.md](docs/AGENT.md) | Agent 三步接线 |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | 全部 21 家的凭据来源 |
| [docs/WIZARD.md](docs/WIZARD.md) | 仅限人工的 Kimi 月度池 cookie 粘贴向导 |
| [skill/quota-floater/SKILL.md](skill/quota-floater/SKILL.md) | 可直接投放的 agent 技能 |

## 许可证

项目代码：[MIT](LICENSE)（Copyright (c) 2026 Quota Floater authors）。
`vendor/tm-shared/` 探针来自
[Javis603/token-monitor](https://github.com/Javis603/token-monitor)（MIT，
Copyright (c) 2026 Javis），全文见 [NOTICE](NOTICE) 与 `vendor/tm-shared/LICENSE`。
本产品是 **Quota Floater**，不是上游桌面应用；不登录、也不打开上游应用的设置面板。

免费、MIT、无付费墙。Zip 发布在 **GitHub Releases**。可选 GitHub Sponsors。
