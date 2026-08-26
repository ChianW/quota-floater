# Quota Floater — Agent Setup & Debug Guide

Audience: any coding agent (Claude Code, Codex CLI, Cursor, Kimi Code, ZCode, pi, …)
installing or operating Quota Floater for a human.

The product is **agent-driven by design**: there is no settings panel. Agents run
commands, read the no-secret snapshot, and escalate only the steps that genuinely
require a human (browser log-ins, cookie pastes). If you find yourself describing
clicks in a UI, stop — you are off the intended path.

## 1. Requirements

- Node.js >= 20. (On Node >= 22 a `node:sqlite` ExperimentalWarning on stderr is
  harmless noise from a vendored module. It is not an error.)
- Python 3 with tkinter — only for the optional floater UI. CLI needs no Python.
- No installer: unzip `dist/quota-floater.zip` anywhere. The tool writes nothing
  outside its own folder plus the local credential files it reads.

Platform matrix:

| Capability | Windows | macOS | Linux |
| --- | --- | --- | --- |
| `node collect.js` probes | yes | yes | yes |
| Floater UI | `start.cmd` | `python3 ui.py` | `python3 ui.py` |
| `quota.cmd` table | yes | use `node collect.js && node print-table.js` | same |
| Antigravity card | yes (WMI) | no (probe is Windows-only) | no |

## 2. First probe (30 seconds)

```
cd <install-dir>
node collect.js --json
```

Interpretation rules:

- `id` present, `status: "ok"` → live credential found, probe succeeded.
- `id` **missing** → no local credential. By design; nothing is broken.
- `status: "unavailable"` + `note: "last good"` → probe failing right now
  (network / expired cookie / upstream change); previous windows retained.
- `elapsedMs` of a few seconds is normal (parallel HTTP).

The snapshot contains no secrets (keys, cookies, JWTs, emails are stripped by
`sanitize()`), so it is safe to print into chat or logs.

## 3. Turn-on matrix

Three tiers. Always try the cheaper tier first.

**Tier A — automatic (zero action).** Credential already on disk from a prior
login: `kimi` (kimi-code OAuth file), `zai`, `opencode`, `cursor` (tokscale
file), `antigravity` (running IDE), `copilot`/`openrouter` (env), `kiro`. The
agent only verifies and reports.

**Tier B — agent-actionable (set an env var the human already holds).**
`deepseek`, `minimax`, `grok`, `zaiteam`, `volcengine`, `qoder`, `commandcode`,
`ollama`, `workbuddy`, `thirdparty`. Variable names: [PROVIDERS.md](PROVIDERS.md).

- Windows (User scope, persists):
  `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY','<value>','User')"`
  then **open a new terminal** — running shells do not see User env changes.
- macOS/Linux: `export NAME=value` for now, plus the shell rc for persistence.

**Tier C — human-only first step (log in once; agent verifies after).**

| Provider | Human step | What appears |
| --- | --- | --- |
| `claude` | Log in with the Claude Code CLI (OAuth in browser) | `~/.claude/.credentials.json` (respects `CLAUDE_CONFIG_DIR`) |
| `claude` (alt.) | Paste the claude.ai session cookie value | User env `CLAUDE_WEB_COOKIE` |
| `codex` | Run `codex login` (opens a browser) | `~/.codex/auth.json` |
| `kimi` month pool | Human paste wizard: [WIZARD.md](WIZARD.md) — agents must not run it interactively | `secrets.json` entry / browser cookie |
| `cursor` | Log into Cursor desktop once | tokscale credentials file |

Agents never type, paste, or echo credentials — hand the human the exact command,
then re-run `node collect.js --json` to confirm the id appears.

## 4. Debug playbook

| Symptom | Likely cause | Agent action |
| --- | --- | --- |
| Provider id missing | No credential | §3 turn-on matrix |
| `unavailable` + `last good` | Probe failing now (network/proxy/expired cookie) | Tail `floater.log`; retry once; cookie-based providers → human re-login |
| Kimi month 401 | Website `kimi-auth` cookie expired (OAuth unaffected) | [WIZARD.md](WIZARD.md); pre-check: `node kimi-auth-wizard-io.js status` |
| Hand-written JSON "silently empty" | UTF-8 BOM | Rewrite as UTF-8 **no BOM** (Notepad's "UTF-8" adds one) |
| Expiry math off by ±8h | Local-clock-as-UTC bug in a custom script | Node: `Date.now()/1000`; PowerShell: `[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()`. Never `Get-Date -UFormat %s` |
| Antigravity missing (Windows) | `language_server.exe` not running | Start the Antigravity IDE once; WMI queries must filter `Name='language_server.exe'` |
| Collect takes > 30s | Unfiltered WMI scan or proxy timeouts | Ensure the Name filter; check proxy env vars |
| `node:sqlite` warning | Node >= 22 | Ignore |

## 5. Optional scheduling (headless use)

The floater UI re-probes on its own 60 s tick, so scheduling matters only for
headless CLI use (a shell prompt, an agent session, cron).

- Windows Task Scheduler, hidden window: point the action at
  `wscript.exe //B //Nologo <dir>\run-hidden.vbs` where the `.vbs` runs
  `node <dir>\collect.js` with window style 0 (proven pattern on the author
  machine). Avoid `powershell -WindowStyle Hidden` for `.cmd` wrappers — it
  still flashes a console.
- macOS: launchd agent; Linux: systemd timer — both just run
  `node <install-dir>/collect.js` every 5 minutes.

## 6. Hard rules

1. Never print secrets — keys, cookies, JWTs — into chat, logs, or commit messages.
2. Every JSON you write is UTF-8 **without BOM**; strip a BOM when reading.
3. Never edit Token Monitor `app.asar`. Probe fixes go in `vendor/tm-shared/` only.
4. Never invent provider protocols. Use the vendored upstream probe.
5. WMI always with a `Name=` filter; never enumerate all `Win32_Process`.
6. Do not run interactive wizards on the human's behalf; give them the command.
7. No `git init` / commit / push without the owner's explicit instruction.

## 7. Adding or updating a provider

1. Copy the upstream Token Monitor module **verbatim** into `vendor/tm-shared/`
   (MIT; keep the license files). Bring its `require('./…')` closure along.
2. Wire a `collectXxx()` in `collect.js`: credential pre-check → probe call →
   `rowFromTm(...)`; catch `status === 'notConfigured'` and return `null` so
   machines without the credential stay clean.
3. Add the row in [PROVIDERS.md](PROVIDERS.md); note the credential tier in §3.
4. Verify: `node collect.js --json` twice (fresh run + last-good path), then
   `node scripts/pack-release.js` (secret scan refuses the zip on any leak).
