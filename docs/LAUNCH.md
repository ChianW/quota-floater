# Launch Kit — steps, timing, and ready-to-paste copy

Owner-executed posts (HN / Reddit / X / PH are personal-account actions).
Everything below is prepared; asset regeneration: `python scripts/capture-floater.py`.
Reddit rule matrix and evidence: [REDDIT.md](REDDIT.md). Product docs: [SETUP.md](SETUP.md).

## Assets (ready)

| Asset | Path | Status |
| --- | --- | --- |
| Screenshot (631x1407, dark backdrop) | `docs/assets/floater.png` | done |
| State-demo GIF (expand -> collapse -> expand) | `docs/assets/floater.gif` | done, in README |
| Repo topics | 10 topics set (claude-code, codex, kimi, cursor, ...) | done |
| Release | v0.1.0 zip on GitHub Releases | done |
| **TODO owner**: 5–8s native video (drag-reorder + collapse + `sync` click) | record with ScreenToGif or Win+G | Reddit/X strongly prefer native video over GIF links |

## Account preconditions (check before Day 1)

- [ ] HN account (age > 1 month ideal). Do NOT ask friends to upvote — HN detects vote rings.
- [ ] Reddit account with **karma >= 50** (r/ClaudeAI hard gate for showcase posts);
      otherwise spend 1–2 weeks commenting helpfully in target subs first.
- [ ] X account with the video ready.
- [ ] Re-read each target sub's sidebar rules **on posting day** (rules drift; matrix in REDDIT.md).

## Timeline (T = launch Tuesday–Thursday, US Eastern)

| When | Channel | Action |
| --- | --- | --- |
| T 07:30 ET | Show HN | Post below; post the first comment within 5 minutes; answer everything for 2 h |
| T 12:00 ET | X | Thread below (quote the HN or repo stats if traction) |
| T+1 08:00 ET | r/ClaudeAI | Main post below (their peak window is 6–9 AM ET) |
| T+1..T+3 | Reddit comments | Reply to every mention; answer quota-anxiety threads where the tool genuinely helps (90/10) |
| T+3 10:00 ET | r/ClaudeCode | Feature-angle post below |
| T+7 | r/ChatGPTCoding | Weekly self-promotion thread comment below |
| T+7 | r/cursor | Mod mail first; post only with approval |
| T+14 | Product Hunt | Launch below (Tue–Wed best); maker comment live |
| T+7.. rolling | awesome lists | PRs below; add one per accepted list |

Golden rules: one channel per day; never repost the same title; author replies in the
first 2 hours decide reach; if mods remove a post, message them, adapt, never use alts.

---

## 1. Show HN

**Title**

```
Show HN: Quota Floater – Always-On-Top Strip of Your Official AI Plan Quotas
```

**Text**

```
Hi HN — I pay for several AI coding plans (Claude, Codex, Kimi, Cursor, Copilot,
OpenRouter...) and I never knew how much quota I actually had left. Log-based
estimators guess from your token spend; I wanted the numbers the providers
themselves report.

Quota Floater is a tiny always-on-top strip that shows the official remaining-quota
windows — Claude 5h/week, Codex rate limits, Kimi 5h/week, Cursor month, Copilot
chat, OpenRouter credits — for 19 providers, straight from each provider's own
quota endpoint.

Design choices you all will care about:
- No secrets leave the machine. Probes read local credential files; the snapshot
  the UI reads is sanitized (no keys, no cookies, no emails).
- Protocols are not invented here: the probes are reused verbatim from the MIT
  Token Monitor project (credit in NOTICE). Fix a probe, fix it upstream-style.
- Agent-first: there is no settings panel. Drop skill/quota-floater/SKILL.md into
  your coding agent and it installs, configures, and debugs the tool for you;
  log-ins stay human steps.

Windows floater (Tk) + cross-platform CLI (Node >= 20, no install: unzip and run
`node collect.js --json`). MIT, free, no paywall: https://github.com/ChianW/quota-floater
```

**First comment (post immediately after)**

```
Implementation notes:
- collect.js orchestrates 19 probes in parallel; each probe is the upstream
  Token Monitor module copied verbatim into vendor/tm-shared (MIT), including
  limitCollector.js for Claude (OAuth + web-cookie + CLI fallback paths) and
  Codex.
- Providers without local credentials are skipped silently; a failing probe
  keeps last-good windows with a "last good" note instead of blanking the card.
- The snapshot consumed by UI/CLI contains only id/name/plan/status/windows/
  usage/percent fields — sanitized at write time, so it's safe to paste anywhere.
- Claude quota: reads Claude Code OAuth credentials (refreshes in place) or
  CLAUDE_WEB_COOKIE. Codex: ~/.codex/auth.json.
- Roadmap: winget manifest, macOS menubar variant, more CN providers (Qoder,
  Volcengine already wired). PRs welcome — adding a provider is one vendored
  module + one collect.js row (docs/SETUP.md §7).
```

## 2. r/ClaudeAI (Day T+1, text post + native video/GIF)

**Title**

```
I got tired of guessing when my Claude 5h window resets, so I built an always-on-top strip that shows the official remaining quota of every AI plan I pay for
```

**Body**

```
Every Claude plan I've had, the same anxiety: how much of the 5-hour window is
left? Is the weekly cap close? Log-based estimators guess from token spend — I
wanted the official numbers.

So I built Quota Floater (MIT, free): a tiny always-on-top strip showing the
official remaining-quota windows reported by the providers themselves — Claude
5h + week, plus Codex, Kimi, Cursor, Copilot, OpenRouter credits, Antigravity,
Z.ai, DeepSeek... 19 providers total, one strip.

I built this [disclosure]. Details:
- Official numbers, not estimates — it calls each provider's own quota endpoint
  (Claude reads your local Claude Code OAuth credentials; nothing extra to sign)
- No settings panel — it's agent-driven: drop the included skill file into
  Claude Code / Cursor / any agent and it sets itself up; log-ins stay yours
- The snapshot the UI reads is sanitized — no keys/cookies ever render
- Windows floater + cross-platform CLI (`node collect.js --json`), Node >= 20,
  unzip and run. Probes reused verbatim from the MIT Token Monitor project
  (credit where due: github.com/Javis603/token-monitor)

Repo + one-zip release: https://github.com/ChianW/quota-floater

Happy to answer anything about the quota endpoints or the agent-driven setup.
```

## 3. r/ClaudeCode (Day T+3, feature angle)

**Title**

```
Quota Floater now reads your Claude Code OAuth directly — always-on-top official 5h/week quota, 19 providers, MIT
```

**Body**: reuse the r/ClaudeAI body, replace first paragraph with:

```
Quota Floater (MIT) now probes Claude quota straight from your local Claude Code
credentials (token refresh handled in place), alongside Codex, Kimi, Cursor,
Copilot, OpenRouter and 14 more — official windows only, no log estimation.
```

## 4. r/cursor (Day T+7, mod-gated)

Mod mail first:

```
Hi mods — I built a free MIT quota floater that includes Cursor's official
monthly usage window (reads the local tokscale credentials, nothing uploaded).
Would a show-and-tell post be welcome, and any flair/format you require?
Repo: https://github.com/ChianW/quota-floater
```

## 5. r/ChatGPTCoding (Day T+7, weekly self-promo thread)

```
Quota Floater — always-on-top strip of the official remaining quota for 19 AI
coding plans (Claude, Codex, Kimi, Cursor, Copilot, OpenRouter, ...). Official
endpoints, not log estimates; sanitized snapshot; agent-driven setup (no
settings panel). MIT + free: https://github.com/ChianW/quota-floater
```

## 6. X thread (Day T, 12:00 ET)

```
1/ I pay for 6 AI coding plans and never knew how much quota I had left on any
of them. So I built a tiny always-on-top strip that shows the OFFICIAL numbers
— straight from each provider's own quota endpoint. [attach video]

2/ Claude 5h + week, Codex rate limits, Kimi, Cursor month, Copilot, OpenRouter
credits, Antigravity, Z.ai, DeepSeek... 19 providers, one strip. Official
windows only — no token-spend guessing.

3/ Zero-secret design: probes read local credential files; the UI's snapshot is
sanitized at write time (no keys/cookies/emails ever render). The floater is
Tkinter; the CLI is plain Node, cross-platform.

4/ There is no settings panel. It ships an agent skill — drop it into Claude
Code/Cursor/your agent and it installs + configures + debugs itself. Log-ins
stay human steps. docs/SETUP.md has the full matrix.

5/ Protocols aren't invented: probes are reused verbatim from the MIT Token
Monitor project (Javis603) — credited in NOTICE. Fix a probe = fix it once,
upstream-style.

6/ MIT, free, no paywall. Windows floater + CLI everywhere:
https://github.com/ChianW/quota-floater
v0.1.0 zip on Releases. Star it if it saves you a tab.
```

## 7. Product Hunt (Day T+14)

- Name: **Quota Floater**
- Tagline: `Official AI plan quotas, always on top` (or `Every AI plan's remaining quota — officially`)
- Description: r/ClaudeAI body, trimmed to ~200 chars + link.
- Maker first comment: the Show HN first comment, adapted ("Ask me anything about the quota endpoints").

## 8. awesome lists (rolling from T+7)

Target list: `awesome-claude-code` (Tools/Utilities section). PR title/body:

```
Add Quota Floater – always-on-top official quota strip for AI coding plans
```

```
Quota Floater shows the official remaining-quota windows (5h/week/month) that
providers themselves report — Claude, Codex, Kimi, Cursor, Copilot, OpenRouter
and 14 more — as an always-on-top strip or CLI. Agent-driven setup, sanitized
snapshots, MIT. Probes reused from Token Monitor (MIT).
https://github.com/ChianW/quota-floater
```

Note: sindresorhus/awesome has strict inclusion criteria (established community,
sustained popularity) — submit only after ~100+ stars; awesome-claude-code is the
right first target. Re-check its CONTRIBUTING on PR day.

## Measurement (fill per post)

| Date | Channel | Title variant | Upvotes | Referrers (GH Traffic) | Stars delta | Release downloads |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |
