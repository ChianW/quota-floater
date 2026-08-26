Quota Floater
=============

English docs: README.md, docs/AGENT.md, docs/SETUP.md, docs/PROVIDERS.md, docs/WIZARD.md

Start (Windows):  start.cmd
Or:               pythonw ui.py        (python3 ui.py on macOS/Linux)

Refresh once (no window):
  node collect.js
  node collect.js --json

CLI table (runs collect.js, then prints):
  quota.cmd

Pi command (after /reload):
  /quota

This tool reuses official quota probes from
https://github.com/Javis603/token-monitor (MIT, Copyright (c) 2026 Javis).
See LICENSE, NOTICE, vendor/tm-shared/LICENSE.
This product is Quota Floater. It is not the upstream desktop app.
It does not log in, open that app's Settings panel, or copy secrets into git.

Claude (Claude Code OAuth / CLAUDE_WEB_COOKIE) and Codex (~/.codex/auth.json)
are wired via the vendored upstream limitCollector.js. Log-in is a human step.
Agent setup & debug: docs/SETUP.md. Drop-in agent skill: skill/quota-floater/SKILL.md.

Free MIT release. No paywall. Zip on GitHub Releases.
GitHub Sponsors optional. Pack: node scripts/pack-release.js
Zip excludes secrets.json, snapshot.json, settings.json, *.bak, .git.
Secret scan (unpacked zip, must print nothing):
  rg -n "eyJ[A-Za-z0-9_-]{20,}"
  rg -n "sk-[A-Za-z0-9]{16,}"
Pack script runs the same check. Bare prefix name sk-or- does not match.

DeepSeek / OpenCode Go peak line:
  {off-peak|peak}  rst {Xh Ym|Ym|<1m}
  Example: off-peak  rst 31m

Card gap: 9px (tk pady is int-only; 9.3 is not possible).

Kimi monthly quota (www.kimi.com):
  Needs website cookie kimi-auth. kimi-code OAuth cannot read it.
  Auto: env KIMI_AUTH_TOKEN, secrets.json, Kimi desktop / Chrome / Edge cookies.
  Manual: docs/WIZARD.md (do not paste the cookie into chat).
