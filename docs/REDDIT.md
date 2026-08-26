# Reddit Distribution Playbook

Research date: 2026-08-26. Rules change — re-check each sidebar before posting.
Repo: https://github.com/ChianW/quota-floater · Release: v0.1.0.

## Positioning (say this, not "yet another usage tracker")

> "ccusage/tokscale estimate spend from local logs. Quota Floater shows the
> **official** remaining-quota windows straight from each provider (Claude 5h/week,
> Codex, Kimi, Cursor, Copilot, OpenRouter credits, ...) as an always-on-top strip.
> 19 providers, MIT, reuses Token Monitor's probes verbatim. No settings panel —
> your coding agent sets it up from docs/SETUP.md."

Differentiators to lead with: **official numbers** (not estimates), **always-on-top
strip** (not a dashboard you open), **19 providers incl. the CN ecosystem**
(Kimi / Z.ai / Qoder / Volcengine), **agent-first install**.

## Account prep (do this 1–2 weeks before any launch post)

- Reddit-wide norm is the **90/10 rule**: ~90% genuine participation, ≤10% self-promo.
- Several subs gate posts via AutoModerator on **karma and account age** (commonly
  50–500 karma, 7–30 days; often undisclosed). r/ClaudeAI requires **karma ≥ 50**
  for Project Showcase posts on the main feed.
- Post from an established personal account. A fresh account gets auto-filtered
  and looks like spam. If none exists: comment helpfully in target subs for 1–2
  weeks first.
- Always disclose "I built this". Founder-in-comments beats anonymous marketing.

## Target subreddits (in attack order)

| Sub | Fit | Rule status (2026-08) | How to post |
| --- | --- | --- | --- |
| r/ClaudeAI | ★★★ pain point (limit anxiety) | Showcase allowed, **karma ≥ 50**; megathread exists | Text post + GIF/video; pain-point timing |
| r/ClaudeCode | ★★★ exact audience | Self-promo allowed; no clickbait / no repeat spam | Feature-timed text post |
| r/ChatGPTCoding | ★★☆ Codex + multi-tool users | Own-tool posts → **weekly self-promo thread**, unless genuinely educational | Thread first; main feed only with a build-story angle |
| r/cursor | ★☆☆ Cursor users (1 of 19) | Restricted: flair / mod approval | Ask mods first, or skip |
| r/SideProject, r/devtools | ☆ low conversion | — | Only after main subs work |

Do NOT blast all subs the same day. Primary post first, 2–3 day gaps, adapt the
title per sub. Crosspost only after the original gains traction.

## The ccusage evidence (the model to copy)

ccusage (~14k stars) never had one viral launch. It grew through:

1. **Feature-timed posts** — each release became fresh Reddit content
   (v15 live dashboard; statusline integration posted the week Anthropic shipped
   statusline support).
2. **Pain-point timing** — posts landed when "Claude usage burned absurdly fast"
   complaints were trending; a free tracker was exactly what the thread wanted.
3. **Frictionless try** — the post's first line was the one-liner to run.
   Ours: unzip → `node collect.js --json` → `start.cmd`.
4. **Organic flywheel** — users then recommend it in unrelated quota threads;
   derivative projects (tmux integrations, extensions) compound visibility.

Every new provider wiring / feature = a future post. Do not burn everything on day one.

## Post recipe

- **Title formula**: pain + "I built" + concrete outcome.
  Example: *"I got tired of guessing when my Claude 5h window resets, so I built
  an always-on-top strip that shows the official remaining quota of every AI plan
  I pay for (19 providers, MIT)"*
- **Format**: text post with a native GIF/short video of the floater + repo link.
  Text posts with media outperform bare links. Host media natively (v.redd.it) —
  not a link to a video.
- **Body**: 30-second try steps; what it is NOT (no login, no log scraping,
  no settings panel — agent-driven); credit Token Monitor (MIT) explicitly;
  free, no paywall.
- **Timing**: Tue–Thu; engagement data clusters **6–9 AM ET weekdays**; the
  refined take is "post ~1h before your audience's spike" so it sits atop the
  feed when they log on.
- **First 2 hours**: reply to every comment. Author responsiveness materially
  affects ranking. Pin a short FAQ (Windows? mac? does it steal my keys? — no,
  snapshot is sanitized, see docs/AGENT.md).
- **If a mod removes it**: message mods politely, adapt, do not repost the same
  thing. Never use alts to evade.

## Measurement

- github.com/ChianW/quota-floater → Insights → Traffic: views/clones referrers
  per post; release asset downloads; stars delta.
- Keep a row per post (sub, date, title, upvotes, referrers, stars) and iterate
  the angle that converts.

## Launch-week cadence (suggested)

Day 1: r/ClaudeAI primary post (after Show HN, per launch sequence).
Day 2–3: support comments everywhere the tool is mentioned.
Day 4: r/ClaudeCode (angle: agent-driven setup, Claude OAuth probe).
Week 2: r/ChatGPTCoding self-promo thread (angle: Codex probe + multi-provider).
Ongoing: 90/10 participation; one feature post per meaningful release.
