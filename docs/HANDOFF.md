# Quota Floater — 交接（自包含）

写给下一个 **没有聊天记录** 的 agent。先读本文件，再按需打开同目录英文文档。

- 产品根：`C:\Users\wangq\Desktop\quota-floater`
- 配套英文：`README.md`、`docs/AGENT.md`、`docs/PROVIDERS.md`、`docs/WIZARD.md`
- 本目录是本机工具，**没有 `.git`，没有 GitHub 仓库，未 commit**
- **禁止**把 cookie / JWT / API key 写进文档、聊天或 zip

---

## 1. 一句话产品

始终置顶的 **官方周期剩余额度** 浮窗（5h / week / month 等官方窗）。

复用 [Javis603/token-monitor](https://github.com/Javis603/token-monitor) 的 MIT probe（拷在 `vendor/tm-shared/`）。

**不是** ccusage / tokscale 的本地日志花费估算，也不登录、不打开 Token Monitor Settings、不把密钥拷进 git。

---

## 2. 目录地图

每个重要文件一行。`.bak*` / `__pycache__` / `tmp_*.png` 是调试残留，打包会排除。

| 路径 | 一行说明 |
| --- | --- |
| `start.cmd` | `pythonw ui.py`，开浮窗 |
| `quota.cmd` | 先 `collect.js` 再打表；`quota.cmd cache` 只读已有 snapshot |
| `collect.js` | 编排层：读本机凭据 → 调 `vendor/tm-shared` → 写 `snapshot.json` |
| `ui.py` | Tk 浮窗；**只读** snapshot（折叠/拖序不重新探测） |
| `print-table.js` | 把 snapshot 打成 CLI 表，不探测 |
| `settings.json` | 浮窗几何/顺序（gitignored）。字段名见 §3 |
| `snapshot.json` | 无密钥的额度快照（gitignored） |
| `secrets.json` | 仅 `{ "kimi-auth": "..." }`（gitignored，禁止打包/打印） |
| `ag-endpoint.json` | AG LS 端口/CSRF 缓存（gitignored，禁止打印） |
| `floater.log` | 采集/UI 日志（gitignored） |
| `kimi-web-auth.js` | 解析网站 `kimi-auth`：secrets → env → 本机 cookie 库 |
| `kimi-web-auth.py` | 读 Kimi 桌面 / Chrome / Edge 的 `kimi-auth` cookie |
| `kimi-auth-wizard.sh` | **人类**粘贴网站 cookie 的 4 阶段向导（agent 禁止跑交互向导） |
| `kimi-auth-wizard-io.js` | wizard 的 `status` / `write` / `verify` / `restart` / `collect`，永不打印 token |
| `README.md` / `README.txt` | 人类/英文入口 |
| `LICENSE` | 本项目 MIT（Copyright 2026 Quota Floater authors） |
| `NOTICE` | 上游 TM MIT 致谢（Copyright 2026 Javis） |
| `.gitignore` | 排除 secrets / snapshot / settings / dist / `*.bak` |
| `docs/AGENT.md` | Agent 三步接线 + snapshot 字段 |
| `docs/PROVIDERS.md` | 21 家 TM id；已接 / 未接；峰谷文案 |
| `docs/WIZARD.md` | 仅 Kimi 网站 `kimi-auth` |
| `docs/SETUP.md` | Agent 安装/调试指南（英文）：三层 turn-on 矩阵 + debug 手册 + 平台矩阵 |
| `skill/quota-floater/SKILL.md` | 可直接放进任意 agent skills 目录的接入技能（英文） |
| `docs/HANDOFF.md` | 本文件 |
| `scripts/pack-release.js` | 打 `dist/quota-floater.zip` + 密钥扫描 |
| `scripts/pack-release.cmd` | 调上面的 js |
| `vendor/tm-shared/` | 抽出的官方 probe（MIT，见 `LICENSE`） |
| `vendor/tm-shared/LICENSE` | 上游许可证全文 |
| `pi-extension/quota.ts` | Pi `/quota`：spawn `collect.js`，不重写 HTTP |
| `pi-extension/README.txt` | 拷到 `~\.pi\agent\extensions\quota-floater.ts` |
| `dist/quota-floater.zip` | 已打过的发布包（不含 secrets） |

`vendor/tm-shared` 关键模块：`kimiLimits.js`、`zaiLimits.js`、`cursorProbe.js`、`antigravityProbe.js`、`opencodeGoApi.js`、`openrouterLimits.js`、`copilotLimits.js`、`deepseekLimits.js`，以及其余 `*Limits.js`。2026-08-26 起 **`limitCollector.js` 已整文件 vendor**（连同依赖闭包共 37 个新文件，含 `codexAuth.js`、`claudePaths.js`、`limitsRuntime.js` 等），Claude/Codex 探针来自它；探针修复只改 vendor 副本，仍禁止改 asar、禁止生产 collect 引 `%TEMP%\tm-asar`。

---

## 3. 本机绝对路径表

只写磁盘上 **已存在** 的路径。不要打开这些文件把密钥打出来。

### 本项目

| 用途 | 路径 |
| --- | --- |
| 根 | `C:\Users\wangq\Desktop\quota-floater` |
| 浮窗 | `C:\Users\wangq\Desktop\quota-floater\ui.py` |
| 采集 | `C:\Users\wangq\Desktop\quota-floater\collect.js` |
| snapshot | `C:\Users\wangq\Desktop\quota-floater\snapshot.json` |
| settings | `C:\Users\wangq\Desktop\quota-floater\settings.json` |
| secrets | `C:\Users\wangq\Desktop\quota-floater\secrets.json` |
| 发布 zip | `C:\Users\wangq\Desktop\quota-floater\dist\quota-floater.zip` |

`settings.json` **只记字段名**：`alwaysOnTop`、`collapsed`、`x`、`y`、`width`、`height`、`collapsedWidth`、`collapsedHeight`、`providerOrder`、`headerProvider`、`fontPx`。

### Token Monitor（上游桌面应用）

| 用途 | 路径 | 状态 |
| --- | --- | --- |
| 用户数据 / 凭据 | `C:\Users\wangq\AppData\Roaming\Token Monitor` | 存在 |
| TM credentials | `C:\Users\wangq\AppData\Roaming\Token Monitor\credentials.json` | 存在 |
| TM settings | `C:\Users\wangq\AppData\Roaming\Token Monitor\settings.json` | 存在 |
| Cursor 同步脚本 | `C:\Users\wangq\AppData\Roaming\Token Monitor\sync-cursor.py` | 存在 |
| 登录刷新脚本 | `C:\Users\wangq\AppData\Roaming\Token Monitor\sync-logins.ps1` | 存在（已改用 UTC epoch） |
| Startup 包装 | `C:\Users\wangq\AppData\Local\tm-sync-logins.cmd` → `C:\Users\wangq\AppData\Local\tm-sync-logins.ps1` | 存在 |
| asar 抽出目录 | `C:\Users\wangq\AppData\Local\Temp\tm-asar` | 存在（v0.47.0，`src/` + `package.json`） |
| 安装包残留 | `C:\Users\wangq\AppData\Local\Temp\Token-Monitor-Setup-0.47.0.exe` | 存在 |

**未找到** 常见安装位的 `Token Monitor.exe`（`%LOCALAPPDATA%\Programs\Token Monitor` 等不存在）。不要为此去改 asar。数据目录里有 `patch-ag-asar.py`——**禁止再用**（改 asar 会触发完整性校验，应用起不来）。

生产采集 **只** 用 `vendor/tm-shared` 副本，**不要**从 `%TEMP%\tm-asar` require。

### 各家凭据 / IDE（存在才列）

| 用途 | 路径 |
| --- | --- |
| kimi-code OAuth | `C:\Users\wangq\.kimi-code\credentials\kimi-code.json` |
| Kimi 桌面 cookie 库 | `C:\Users\wangq\AppData\Roaming\kimi-desktop\Network\Cookies` |
| Chrome cookie 库 | `C:\Users\wangq\AppData\Local\Google\Chrome\User Data\Default\Network\Cookies` |
| Edge cookie 库 | `C:\Users\wangq\AppData\Local\Microsoft\Edge\User Data\Default\Network\Cookies` |
| tokscale Cursor | `C:\Users\wangq\.config\tokscale\cursor-credentials.json` |
| Cursor `state.vscdb` | `C:\Users\wangq\AppData\Roaming\Cursor\User\globalStorage\state.vscdb` |
| zcode auth | `C:\Users\wangq\.zcode\auth.json` |
| pi auth | `C:\Users\wangq\.pi\agent\auth.json` |
| Pi 扩展（已拷贝） | `C:\Users\wangq\.pi\agent\extensions\quota-floater.ts` |
| OpenCode Go | `C:\Users\wangq\.local\share\opencode\auth.json` |
| Antigravity IDE | `C:\Users\wangq\AppData\Local\Programs\Antigravity\Antigravity.exe` |
| Antigravity LS 二进制 | `C:\Users\wangq\AppData\Local\Programs\Antigravity\resources\bin\language_server.exe` |
| Antigravity 用户数据 | `C:\Users\wangq\AppData\Local\Antigravity` |

**不存在（不要假装已接）：**

- `C:\Users\wangq\.claude\.credentials.json`（Claude **已接线**但本机无此文件；登录是 Claude Code CLI 的人步骤，或 User env `CLAUDE_WEB_COOKIE`）
- `C:\Users\wangq\.codex\auth.json`（Codex **已接线**但本机无此文件；`codex login` 是人步骤）
- `C:\Users\wangq\.grok\auth.json`
- `C:\Users\wangq\Desktop\quota-floater\.git`

探测 AG 用 WMI `Name='language_server.exe'`，不要依赖「此刻进程是否在跑」。交接时本机 WMI 未看到该进程。

---

## 4. 怎么启动 / 探测 / 打包

工作目录一律：

```
cd /d C:\Users\wangq\Desktop\quota-floater
```

本机已有 `node`（v24.14.1）和 `python` / `pythonw`（3.14.3）。

| 做什么 | 命令 |
| --- | --- |
| 开浮窗 | `start.cmd` 或 `pythonw C:\Users\wangq\Desktop\quota-floater\ui.py` |
| 探测一次（人读） | `node collect.js` |
| 探测一次（agent） | `node collect.js --json` |
| 表（先探测） | `quota.cmd` |
| 表（只读缓存） | `quota.cmd cache` |
| 打包 | `scripts\pack-release.cmd` 或 `node scripts/pack-release.js` |
| Pi | `/reload` 后 `/quota` |

`--json` 把 **无密钥** 的 snapshot 打到 stdout，同时写 `snapshot.json`。

### Agent 三步（完整接线）

1. `cd` 到 `C:\Users\wangq\Desktop\quota-floater`
2. `node collect.js --json`
3. 读 `providers[]`。缺的 id = 本机无凭据，**跳过**。不要让人去点 Token Monitor Settings。不要打印 secrets。

浮窗是可选的。Agent 不需要开 UI。

打包产物：`dist/quota-floater.zip`。包含 `start.cmd`、`quota.cmd`、`collect.js`、`ui.py`、`vendor/`、`docs/`、`LICENSE`、`NOTICE`、`pi-extension/` 等。排除 `secrets.json`、`snapshot.json`、`settings.json`、`ag-endpoint.json`、`floater.log`、`*.bak`、`.git`。脚本会扫 `eyJ…` / `sk-…` 活 token，命中则拒打 zip。裸前缀名 `sk-or-` 和文档本身不匹配。

2026-08-26 起的 zip 已含 `docs/SETUP.md`、`skill/quota-floater/SKILL.md` 和本 HANDOFF。`pack-release.js` 的 tar 已固定为 System32 bsdtar（Git Bash 里 MSYS GNU tar 会把 `C:\` 路径当远程主机而失败）。

---

## 5. 架构

```
本机凭据 / env / TM credentials.json
        ↓
   collect.js          ← 只编排，不发明协议
        ↓
 vendor/tm-shared/*    ← Token Monitor MIT 抽出副本（NOTICE）
        ↓
  snapshot.json        ← sanitize 后的窗；无密钥
        ↓
  ui.py / print-table / Pi /quota
```

- **`ui.py` 只读 snapshot。** 60s tick 才可能再跑 `collect.js`。折叠/展开打 `collect=skip`，禁止为 UI 状态去探测。
- **无凭据 → skip。** 该 collect 函数 `return null`，snapshot 里不出现这一行。不要编一行空卡。
- **探测失败 → last-good。** `keepLastGood`：本跳 `windows` 为空，且上一份 snapshot 同 id 有非空窗 → 沿用旧窗，`note: last good`。对 **所有** 已返回的 provider 都做（不只 Cursor/AG/OpenRouter）。单家 throw 不让整次 collect 崩。
- **`sanitize()`** 只留：`id` `name` `plan` `status` `windows` `usage` `lowestPct` `note`。密钥 / cookie / JWT / CSRF / 邮箱不进 snapshot。
- **读 JSON 剥 BOM，写 UTF-8 无 BOM**（`ui.py` `read_json` / `collect.js` `readJson` + `writeJsonNoBom`）。
- Antigravity：需要本机 `language_server.exe` + CSRF。WMI **必须** `Name='language_server.exe'`。`ag-endpoint.json` 缓存 pid/ports，未运行时 45s 内跳过 WMI。
- Cursor：tokscale `cursor-credentials.json`；缺则跑 TM `sync-cursor.py`（从 `state.vscdb` 键 `cursorAuth/accessToken` 刷 tokscale）。探测是 `cursorProbe.js` → `https://cursor.com/api/usage-summary`。
- Kimi 5h/week：kimi-code OAuth（`kimi-code.json` / `KIMI_CODE_API_KEY` / TM `providers.kimi.apiKey`）。**月池**另走网站 `kimi-auth` + `GetSubscriptionStats`（见 §7）。OAuth 打月接口会 401。
- OpenRouter PAYG：`keyLimit` 与 `credits` 都是合法窗，文案 `$used used · $remaining credits`。

上游抽出说明：当初从 Token Monitor `app.asar` 解到 `%TEMP%\tm-asar`，再拷进 `vendor/tm-shared/`。修探测只改副本。

---

## 6. UI 已定行为（勿回退）

证据在 `ui.py`。改之前先对照代码，不要「看起来更整齐」就改。

| 点 | 已定 |
| --- | --- |
| 卡片缝 | **9px** = `CARD_PADY = (5, 4)`。tk `pady` 只能是整数，**不能**做 8.8 / 9.3。不要改成 10。 |
| 点名称 | 卡片名可点 → 写 `headerProvider`。header **优先 week**（`weekly` → `billing`/`monthly` → `session`）。 |
| 峰谷 | **仅** `opencode` / `deepseek`（`shows_deepseek_hint`）。文案 `{off-peak\|peak}  rst {Xh Ym\|Ym\|<1m}`，例 `off-peak  rst 31m`。这是 **距下一次峰/谷切换的剩余时间**，不是绝对钟点。官方峰：北京时间周一至周五 09:00–12:00、14:00–18:00；周末全天空闲。写死在 `ui.py`，运行时不要去刮官网。 |
| 额度 rst | 各额度窗仍用绝对本地时间：`rst MM-DD HH:MM`（`fmt_reset`）。不要把额度 rst 改成剩余分钟。 |
| 透明 | `attributes("-alpha", 0.77)` |
| 字体 | `Segoe UI`，**一律粗体**；默认 `fontPx=10`（title +1、pct +2；夹在 9–14）。 |
| 改字号 | **只有斜向拖角**（宽和高都超过 `DIAG_SLOP=4`）才改 `fontPx`。单边拖只改几何。 |
| 收起 | 顶栏 `min` / 空白处双击。`_qf_btn` / `_qf_name` 不切折叠；正在 resize 不切。折叠高单独存；`collapsedHeight >= 160` 当污染丢掉。 |
| 拖序 | 视觉序 = `body.pack_slaves()` 且带 `_qf_pid`。**不要**用 `winfo_children()`（那是创建序）。写入 `providerOrder`。 |
| 小窗重绘 | 折叠条必须 **重读 snapshot**（`_reload_header`）并 **`_force_layered_paint`**（Win32 layered 窗同尺寸子控件不合成）。不要以为改了 Label 人就看得到。 |
| 非整数 week | header 用 `fmt_pct`：靠近整数显示 `83%`，否则 **一位小数**（`83.2%`）。 |
| 语言 | 浮窗英文。不要往 UI 塞 CJK。 |
| 刷新 | 折叠/展开不 collect。点 `sync` 才 `force`。 |

---

## 7. 凭据从哪来（只路径 / 环境变量名）

不要打开 Settings 面板。不要把值贴进聊天。

### Kimi — 两套，互不替代

| 池 | 凭据 | 路径 / 变量名 |
| --- | --- | --- |
| 5h + week | kimi-code OAuth / API key | `~\.kimi-code\credentials\kimi-code.json`；`KIMI_CODE_API_KEY`；TM `credentials.providers.kimi.apiKey` |
| **month** | 网站 cookie **`kimi-auth`** | 解析顺序（代码）：`secrets.json` → 进程/User env `KIMI_AUTH_TOKEN` / `KIMI_MANUAL_COOKIE` → `kimi-web-auth.py`（kimi-desktop / Chrome / Edge）。字段名：`kimi-auth` / `kimiAuth` / `KIMI_AUTH_TOKEN` / `kimiAuthToken` |

kimi-code JWT（`scope=kimi-code`）**不是**网站会话。User 环境里的 `KIMI_AUTH_TOKEN` 经常是过期的 kimi-code JWT——所以代码 **先读 `secrets.json`**。

月池接口：`POST GetSubscriptionStats`（`kimiLimits.js` 的 `KIMI_MEMBERSHIP_STATS_URL`）。人类补 cookie：`docs/WIZARD.md`。Agent **不要**跑交互向导（会开浏览器、堵在粘贴上）。可先：

```
node kimi-auth-wizard-io.js status
```

只看 live/过期，不要打印 token。

本机最后一份 snapshot（`2026-08-26T08:44:26.150Z`）Kimi **只有 5h + week，没有 month**。月池仍未接通。

### Cursor

- 读：`~\.config\tokscale\cursor-credentials.json`（`accounts.*.sessionToken`）
- 刷新：`%APPDATA%\Token Monitor\sync-cursor.py` ← `state.vscdb` 键 `cursorAuth/accessToken`
- 格式（只记结构）：`{sub}%3A%3A{jwt}`，UTF-8 **无 BOM**
- 不要手贴 JWT

### Antigravity

- 本机进程 `language_server.exe` + CSRF（从命令行抽）
- WMI **必须**：`Get-CimInstance Win32_Process -Filter "Name='language_server.exe'"`
- 存活再收窄：`ProcessId=${pid} AND Name='language_server.exe'`
- **禁止**无 Filter 枚举全部 `Win32_Process`（本机曾因此超 8–10s，被误判未登录）
- RPC：`RetrieveUserQuotaSummary`，`forceRefresh: false`
- **不要改** Token Monitor `app.asar`

wizard 重启浮窗同样带 Name 过滤：`Name='pythonw.exe'` 再匹配命令行 `quota-floater*ui.py`。

### 其余已接线（名字即可）

完整表见 `docs/PROVIDERS.md`。常用：

- Z.ai：`~\.zcode\auth.json` / `~\.pi\agent\auth.json` 的 `zai`；`ZAI_API_KEY`；TM `providers.zai.apiKey`
- OpenCode Go：`~\.local\share\opencode\auth.json` / zcode `opencode-go`；`TOKEN_MONITOR_OPENCODE_API_KEY`
- OpenRouter：`OPENROUTER_API_KEY`；或 `ANTHROPIC_AUTH_TOKEN` 且以 `sk-or-` 开头；TM `providers.openrouter.profiles`
- Copilot：`COPILOT_API_TOKEN` / `GITHUB_COPILOT_TOKEN`；TM `providers.copilot.apiToken`
- DeepSeek：TM `providers.deepseek.apiKey`；vendor 还认 `DEEPSEEK_API_KEY` / `DEEPSEEK_KEY`（本机这两个 User env 目前没有）
- MiniMax / Grok / Z.ai Team / Volcengine / Qoder / Command Code / Ollama / WorkBuddy / Kiro / MiMo / Third Party：见 PROVIDERS.md 变量名

`collect.js` 已接线的 id：`kimi` `zai` `cursor` `antigravity` `opencode` `openrouter` `copilot` `deepseek` `minimax` `grok` `zaiteam` `volcengine` `qoder` `commandcode` `ollama` `workbuddy` `kiro` `mimo` `thirdparty`。

最近一次 snapshot 实际出现的 id：`kimi` `zai` `cursor` `antigravity` `opencode` `openrouter` `copilot`。数字会过期，不要当现状。

---

## 8. 铁律

1. **JSON 无 BOM。** 读要剥 `EF BB BF`；写用 UTF-8 无 BOM。记事本「UTF-8」会带 BOM，pi / 裸 `JSON.parse` 会静默空凭证。
2. **secrets 不进 git / zip。** `secrets.json` `snapshot.json` `settings.json` `ag-endpoint.json` `floater.log` 已在 `.gitignore` 和 pack 黑名单。
3. **不要打印密钥。** stdout / 日志 / 交接 / commit message 都不写 cookie、JWT、API key。
4. **不要 `browser_subagent`。** 本机验证用 headless Playwright 或根本不用浏览器。Kimi 向导是人类的事。
5. **Kimi / 任何 JWT 刷新：禁止 `Get-Date -UFormat %s`。** 在 UTC+8 上它把墙钟当 Unix epoch，**快 8 小时**，过期 token 不 refresh。正确：`[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()`。`collect.js` 用 `Date.now()/1000`（没问题）。`%APPDATA%\Token Monitor\sync-logins.ps1` 已按 UTC 改过；不要改回去。
6. **不要改 TM `app.asar`。** 修探测只改 `vendor/tm-shared`。
7. **不要发明 Claude / Codex 协议。** 没有独立 `*Limits.js`。
8. **不要打开 Token Monitor Settings。** 凭据只从本机文件 / User env 读。
9. **WMI 永远带 `Name=` Filter。** 禁止全表枚举。
10. **UI 已定行为见 §6，勿回退。**

---

## 9. 未完成 / 不要做

| 项 | 状态 | 不要做 |
| --- | --- | --- |
| Kimi **月池** | 未接通。需要 **未过期** 的 www.kimi.com `kimi-auth`。OAuth 不够。旧网站会话曾于 2026-08-15 过期。向导已写，方案未闭环。 | 不要把 kimi-code JWT 当月池；不要把 cookie 贴进聊天；不要编一个月接口 |
| Claude | **已接线**（2026-08-26，vendor `limitCollector.js` 整文件）。本机无凭据，只验证了 skip 路径；happy path 未在本机验证 | 首台真实 Claude 机器的验证结论记回 `docs/SETUP.md` |
| Codex | **已接线**（同上）。本机无 `~\.codex\auth.json` | 同上 |
| GitHub | **未开仓库** | 不要假装已发布 |
| git | **无 `.git`，未 commit** | 未经用户要求不要 `git init` / commit / push |
| 发布形态 | 已定：**免费 MIT + GitHub Releases**；Sponsors 可选 | **不要做付费墙** |
| DeepSeek 独立 key | 本机无 `DEEPSEEK_*` env；峰谷 UI 已为 OpenCode 工作 | 不要为了对齐峰谷去改卡片缝/rst 语义 |
| Claude/Codex 接线 | **已完成**（2026-08-26 vendor 整文件 + collect.js 接线 + 文档） | 仍然不要在生产 collect 里 require `%TEMP%\tm-asar` |

zip 可以打，但仓库还不存在。发布结论不要改。

---

## 10. 给下一个 agent 的最短下一步

1. **先验证，再改。** `cd` 到本目录 → `node collect.js --json` → 确认 `providers[]` 仍出、无密钥泄漏。不要先动 `ui.py` / 卡片缝 / 峰谷文案。
2. **Kimi 月池只等人，不编协议。** `node kimi-auth-wizard-io.js status`；若不是 live 网站会话，让人类走 `docs/WIZARD.md`。Agent 不跑交互向导，不把 `kimi-auth` 打进聊天。
3. **发布等用户开口。** 用户明确要公开时：`git init` + GitHub 仓库 → `scripts\pack-release.cmd` → Releases 上 zip（免费 MIT）。在此之前不要接 Claude/Codex，不要改 TM asar，不要做付费墙。

---

## 本文件明确没有写进去的

- 任何 cookie / JWT / API key / CSRF 的值
- 各家额度的瞬时数字（会过期）
- Token Monitor.exe 的安装路径（本机常见位置未找到，不编造）
