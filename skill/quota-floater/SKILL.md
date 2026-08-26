---
name: quota-floater
description: >-
  Official remaining-quota floater and CLI for AI coding plans (Claude, Codex,
  Kimi, Z.ai, Cursor, Antigravity, OpenRouter, Copilot, DeepSeek, …). Use when
  the user asks how much quota/limit is left on an AI plan, or wants the
  always-on-top quota strip installed, configured, or debugged.
---

# Quota Floater — agent skill

Agent-driven quota visibility. No settings panel: you run commands, read the
no-secret snapshot, and hand the human only true browser/log-in steps.

## Workflow

1. **Locate the install.** Ask the user for the folder if not found, or unzip
   `dist/quota-floater.zip`. No installer; needs Node.js >= 20 (Python 3 only
   for the optional UI).
2. **Probe once.** `cd <dir> && node collect.js --json`
   - id present + `status ok` → live.
   - id missing → no local credential (by design).
   - `unavailable` + `note last good` → probe failing now; check `floater.log`.
   - The snapshot is sanitized — safe to print. Never print credential files.
3. **Turn on missing providers the user wants** (full matrix:
   [docs/SETUP.md](../../docs/SETUP.md), provider map:
   [docs/PROVIDERS.md](../../docs/PROVIDERS.md)):
   - env-var providers (`DEEPSEEK_API_KEY`, `GROK_BEARER_TOKEN`, …): set User
     env, then **new shell**, re-probe.
   - `claude`: human logs in via Claude Code CLI once
     (`~/.claude/.credentials.json` appears) or sets `CLAUDE_WEB_COOKIE`.
   - `codex`: human runs `codex login` (`~/.codex/auth.json` appears).
   - kimi month pool: human wizard `docs/WIZARD.md`; you may run
     `node kimi-auth-wizard-io.js status` (prints live/expired only).
4. **Verify.** Re-run `node collect.js --json`; the id appears with `ok`.
5. **Floater (optional).** Windows `start.cmd`; macOS/Linux `python3 ui.py`.
   Always-on-top, English UI, 60 s re-probe tick, `sync` button forces a probe.
   Geometry/order persist in `settings.json`. Close the window to stop.

## Quick debug

| Symptom | Action |
| --- | --- |
| id missing | credential absent — turn-on matrix |
| `last good` note | tail `floater.log`, retry; cookie providers need human re-login |
| expiry off by ±8h | UTC-epoch bug — `Date.now()/1000`, never `Get-Date -UFormat %s` |
| JSON credential ignored | UTF-8 BOM — rewrite without BOM |
| Antigravity missing | IDE not running, or WMI without `Name='language_server.exe'` filter |
| `node:sqlite` warning | harmless on Node >= 22 |

## Hard rules

Never print secrets. UTF-8 no BOM. Never edit upstream `app.asar` (fixes go in
`vendor/tm-shared/` only). Never invent provider protocols. WMI always
`Name=`-filtered. Never run interactive wizards for the human — give them the
command. No git init/commit/push unless the owner says so.
