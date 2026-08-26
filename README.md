# Quota Floater

<p align="center">
  <img src="docs/assets/floater.gif" width="360" alt="Quota Floater — always-on-top quota strip">
</p>

An always-on-top strip (Windows) and CLI (any OS) showing the **official
remaining quota** of your AI coding plans — the numbers the providers themselves
report, not log-based estimates.

- **Official windows**: Claude 5h + week, Codex rate limits, Kimi 5h/week, Cursor
  month, Copilot chat, OpenRouter credits, Antigravity, Z.ai, DeepSeek — 21 providers.
- **No secrets rendered**: probes read local credential files; the snapshot the
  UI consumes is sanitized at write time (no keys, cookies, or emails).
- **Agent-first**: there is no settings panel. Your coding agent installs,
  configures, and debugs it; log-ins stay human steps.
- **MIT, free, no paywall**. Probes are reused verbatim from the MIT
  [Token Monitor](https://github.com/Javis603/token-monitor) project (see NOTICE).

## Quick start

Requirements: Node.js >= 20. Python 3 only for the floater UI. No installer.

```
unzip quota-floater.zip    # or git clone https://github.com/ChianW/quota-floater
cd quota-floater
node collect.js --json     # first probe: prints which providers are live
start.cmd                  # Windows floater  |  macOS/Linux: python3 ui.py
```

A provider id missing from the output simply means no local credential for it —
see the next section to turn it on. `quota.cmd` prints a CLI table instead.

## Drive it with your agent

This tool is designed to be operated **by your coding agent, in chat** — not
through a settings UI. Three ways to connect:

1. **Just point your agent at the repo** (works with any agent):

   > Set up https://github.com/ChianW/quota-floater for me. Read
   > `docs/AGENT.md` and `docs/SETUP.md`, run a first probe, and tell me which
   > of my plans are showing.

2. **Install the bundled skill** (zero-shot, if your agent supports skills —
   e.g. Claude Code's `~/.claude/skills/`): copy `skill/quota-floater/` into
   your agent's skills directory. The skill encodes the full workflow: probe →
   interpret → turn on missing providers → debug.

3. **Read the docs yourself**: [docs/SETUP.md](docs/SETUP.md) (agent-oriented
   setup & debug guide), [docs/AGENT.md](docs/AGENT.md) (3-step hookup).

### Adding a monitoring channel (provider)

Say you want a card that isn't showing yet. Tell the agent in plain language:

| You say | The agent does |
| --- | --- |
| "Add DeepSeek monitoring — I'll give you the key." | Sets User env `DEEPSEEK_API_KEY` (hand the key over the way you normally give your agent credentials; it never echoes it back), opens a new shell, re-probes — the card appears. |
| "Why is my Claude card missing?" | Checks `~/.claude/.credentials.json`; if absent, tells you the one human step: log in once with the Claude Code CLI (or set `CLAUDE_WEB_COOKIE`), then verifies the card appears. |
| "Show my Codex quota." | Checks `~/.codex/auth.json`; if absent, the human step is `codex login` (opens a browser). |
| "My Kimi monthly quota isn't showing." | Runs `node kimi-auth-wizard-io.js status`; the monthly pool needs a www.kimi.com cookie paste — the agent walks you to [docs/WIZARD.md](docs/WIZARD.md) but never touches the cookie itself. |
| "Keep it refreshed every 5 minutes, silently." | Schedules a hidden task per `docs/SETUP.md` §5 (Task Scheduler / launchd / systemd timer). |
| "Add provider X." (not among the 19) | Only if upstream Token Monitor has a probe: vendor it verbatim per `docs/SETUP.md` §7 and wire one `collect.js` row. Protocols are never invented here. |

Every provider follows the same three-tier pattern (details in
[docs/PROVIDERS.md](docs/PROVIDERS.md)):

- **Tier A — automatic**: credential already on disk from a prior login
  (kimi, zai, cursor, antigravity, opencode...). Nothing to do.
- **Tier B — env var**: you hand the agent a key it already exists as
  (deepseek, minimax, grok, openrouter, zaiteam, volcengine, ...).
- **Tier C — human log-in**: first login opens a browser, so it stays yours
  (claude, codex, kimi month pool). The agent verifies and takes over after.

## Providers (19)

Claude · Codex · Kimi · Z.ai · Z.ai Team · Cursor · Antigravity · OpenCode Go ·
OpenRouter · GitHub Copilot · DeepSeek · MiniMax · Grok · Kiro · Qoder ·
Volcengine · Ollama · WorkBuddy · Command Code / MiMo / Third Party profiles —
full credential matrix in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Privacy & safety

- Credentials are read from local files and User env only. Nothing uploads,
  no telemetry, no accounts.
- `snapshot.json` (the only thing UI/CLI/your agent reads) contains ids,
  percentages, and reset times — sanitized at write time.
- Never print keys into chat/logs; JSON files must stay UTF-8 without BOM.
  Both rules are baked into the agent skill and docs.

## Docs

| File | For |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Agent setup & debug guide (turn-on matrix, playbooks, platform matrix) |
| [docs/AGENT.md](docs/AGENT.md) | The 3-step agent hookup |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | All 21 providers, credential sources |
| [docs/WIZARD.md](docs/WIZARD.md) | Human-only Kimi month-pool cookie paste |
| [skill/quota-floater/SKILL.md](skill/quota-floater/SKILL.md) | Drop-in agent skill |

## License

Project code: [MIT](LICENSE) (Copyright (c) 2026 Quota Floater authors).
`vendor/tm-shared/` probes come from
[Javis603/token-monitor](https://github.com/Javis603/token-monitor) (MIT,
Copyright (c) 2026 Javis) — full text in [NOTICE](NOTICE) and
`vendor/tm-shared/LICENSE`. This product is **Quota Floater**; it is not the
upstream desktop app, does not log in, and does not open that app's Settings.

Free, MIT, no paywall. Zip releases on **GitHub Releases**. GitHub Sponsors
optional.
