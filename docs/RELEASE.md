# Release process

The ship checklist for every Quota Floater release. Synthesized from three
methodologies: gstack's ship pipeline (verification gate, version discipline,
changelog mapping), GSD's ship flow (acceptance, summary, state update), and
writing-for-agents (checkable completion criteria, positive phrasing).

Run top to bottom. Each step ends on a completion criterion; the release
proceeds only when the criterion holds.

## Step 0 — Preconditions

- The owner asked for the release (commit/push/release are owner-triggered).
- `git status` on `main` shows the intended changes only; `gh auth status` is
  logged in.
- **Done when:** branch is `main`, the working tree contains only intended
  changes, and gh is authenticated.

## Step 1 — Verification gate (fresh evidence only)

Run after the last code/doc edit. Stale evidence from an earlier session does
not count; "should work" is not evidence.

```
node --check collect.js && node --check print-table.js
node collect.js --json          # twice: once fresh, once to exercise last-good
node scripts/pack-release.js    # rebuilds zip, secret scan is blocking
```

- **Done when:** both syntax checks pass, both collects exit 0 with the same
  provider set (absent credentials skipped silently), and the pack prints
  `secret-scan pass`.

## Step 2 — Version bump

`VERSION` is the source of truth. Decide the level from the diff:

- Docs/copy/asset changes only → **PATCH**.
- New provider, new user-visible capability, new platform → **MINOR**, and the
  owner confirms.
- Breaking behavior (snapshot shape, CLI flags) → **MAJOR**, and the owner
  confirms.

Write the new version to `VERSION`. **Done when:** `VERSION` holds the chosen
version and the level decision is one sentence you could defend to the owner.

## Step 3 — Changelog entry

```
git log <last-tag>..HEAD --oneline
```

Group every commit by theme into `### Added / Changed / Fixed / Removed`,
dated today, as `## [X.Y.Z] - YYYY-MM-DD`. Lead with what the user can now do.
**Done when:** every commit since the last tag maps to at least one bullet.

## Step 4 — Commits (bisectable chunks)

Group the working tree into thematic commits a future `git bisect` can reason
about: docs vs process vs code. **Done when:** `git log -p --stat` per commit
shows one theme each and `git status` is clean.

## Step 5 — Publish

```
git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z
node scripts/pack-release.js        # zip rebuilt after the final doc edit
gh release create vX.Y.Z dist/quota-floater.zip --title "vX.Y.Z - <theme>" --notes "<changelog entry>"
```

**Done when:** `gh release view vX.Y.Z` lists the zip asset and the release
notes carry the changelog entry.

## Step 6 — Record state

- `docs/HANDOFF.md`: current version line.
- Decision log (`~/.C31/memory/decision-log.tsv`): one row — version, level,
  why, evidence.
- After any announcement post: fill one row of the measurement table in
  `docs/LAUNCH.md`.

**Done when:** HANDOFF, decision log, and (if announced) the metrics table all
reflect the release.
