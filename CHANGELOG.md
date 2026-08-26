# Changelog

All notable changes to Quota Floater are documented here. User-facing voice:
what you can now do that you could not before.

## [0.1.1] - 2026-08-26

### Added

- **Agent-driving guide in the README** — a table of exact prompts that turn on
  each monitoring channel ("Add DeepSeek monitoring", "Why is my Claude card
  missing?"), plus the three-tier model: automatic / env-var / human log-in.
- **Launch kit** (`docs/LAUNCH.md`): ready-to-paste copy for Show HN, four
  subreddits, an X thread, Product Hunt, and awesome-list PRs, on a day-by-day
  timeline.
- **Reddit distribution playbook** (`docs/REDDIT.md`): subreddit rules matrix,
  karma gates, and the ccusage-style feature-timed posting cadence.
- **Release process** (`docs/RELEASE.md`): the verification gates, version bump
  rules, changelog discipline, and publish steps every future release follows.
- Real floater screenshot and demo GIF (`docs/assets/`), regenerable with
  `python scripts/capture-floater.py`.

### Changed

- README demo image renders at a readable 360px instead of full width.
- Provider count corrected everywhere: **21 wired providers** (Claude and Codex
  included), previously understated as 19.

## [0.1.0] - 2026-08-26

### Added

- First public release: always-on-top quota strip (Windows) + cross-platform
  CLI showing official remaining-quota windows for 21 AI coding providers.
- Claude (Claude Code OAuth or claude.ai web cookie) and Codex probes, wired
  via the upstream `limitCollector.js` vendored whole with its dependency
  closure — every probe reused verbatim from Token Monitor (MIT).
- Agent-first operation: no settings panel; `docs/SETUP.md` +
  `skill/quota-floater/SKILL.md` let any coding agent install, configure, and
  debug the tool. Log-ins stay human steps.
- Sanitized, no-secret `snapshot.json` consumed by UI and CLI; failed probes
  keep last-good windows; secret scan built into the release pack.
