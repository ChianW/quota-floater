---
name: quota-floater
description: >-
  Quota strip — official remaining-quota windows for 21 AI coding plans
  (Claude, Codex, Kimi, Z.ai, Cursor, Antigravity, OpenRouter, Copilot,
  DeepSeek, ...). Use when the user asks how much quota or limit is left on
  an AI plan, or wants the always-on-top quota strip installed, configured,
  or debugged.
---

# Quota Floater — agent skill

Agent-driven quota visibility. You run commands and read the sanitized
snapshot; browser log-ins stay with the human. If you catch yourself
describing clicks in a settings UI, return to this workflow.

## Workflow

1. **Locate the install.** Unzip `dist/quota-floater.zip` or clone the repo
   when the user has no folder yet. Done when `node collect.js --version || node --check collect.js` passes in the folder (Node >= 20).
2. **Probe once.** `cd <dir> && node collect.js --json`
   - id present + `status ok` → live.
   - id missing → no local credential (by design).
   - `unavailable` + `note last good` → probe failing now; tail `floater.log`.
   - The snapshot is sanitized — safe to print in full. Credential files stay
     unprinted.
3. **Turn on missing providers the user wants** (full matrix:
   [docs/SETUP.md](../../docs/SETUP.md), provider map:
   [docs/PROVIDERS.md](../../docs/PROVIDERS.md)):
   - env-var providers (`DEEPSEEK_API_KEY`, `GROK_BEARER_TOKEN`, ...): set
     User env, open a new shell, re-probe.
   - `claude`: the user logs in once with the Claude Code CLI
     (`~/.claude/.credentials.json` appears) or sets `CLAUDE_WEB_COOKIE`.
   - `codex`: the user runs `codex login` (`~/.codex/auth.json` appears).
   - kimi month pool: the user runs the `docs/WIZARD.md` wizard;
     `node kimi-auth-wizard-io.js status` prints live/expired only.
   - Done when a re-probe lists the provider with `status ok`.
4. **Floater (optional).** Windows `start.cmd`; macOS/Linux `python3 ui.py`.
   Always-on-top, English UI, 60 s re-probe tick, `sync` button forces a
   probe. Geometry and order persist in `settings.json`. Closing the window
   stops it.
5. **Keep it fresh (optional).** Schedule a hidden run every 5 minutes per
   `docs/SETUP.md` §5 (Task Scheduler wscript wrapper / launchd / systemd).

## Quick debug

| Symptom | Action |
| --- | --- |
| id missing | credential absent — apply the turn-on matrix |
| `last good` note | tail `floater.log`, retry; cookie providers need the user to re-login |
| expiry off by ±8h | UTC-epoch bug — use `Date.now()/1000`; treat `Get-Date -UFormat %s` as broken |
| JSON credential ignored | rewrite the file as UTF-8 without BOM |
| Antigravity missing | IDE closed, or the WMI query lacks a `Name='language_server.exe'` filter |
| `node:sqlite` warning | ignore on Node >= 22 |

## Operating rules

- Print the sanitized snapshot; credential values stay in their files and env vars.
- Write JSON as UTF-8 without BOM.
- Fix probes in the vendored copy under `vendor/tm-shared/`; the upstream
  `app.asar` stays untouched.
- Reuse the vendored upstream probe for every provider; treat each protocol as
  upstream-owned.
- Scope every WMI query with a `Name=` filter.
- Hand the human the wizard/log-in command and wait; interactive wizards run
  with their hands on the keyboard.
- Commit and push after the owner asks; releases follow [docs/RELEASE.md](../../docs/RELEASE.md).
