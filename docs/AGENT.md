# Quota Floater — agent hookup

This folder is a cache-first quota strip. It reuses Token Monitor MIT probes.
It does **not** log in, open the Token Monitor Settings panel, or invent HTTP/cookie/RPC protocols.

Never print secrets. Never edit Token Monitor `app.asar`.

## Shortest hookup (3 steps)

1. `cd` to this folder (the quota-floater install / repo dir).
2. Run `node collect.js --json` (or `node collect.js` then read `snapshot.json`).
3. Use `providers[]`. Missing ids mean no local credential — skip them. Do not ask the human to click Settings.

That is the whole integration. The floater UI (`start.cmd` / `ui.py`) is optional.

## Commands

| Command | What it does |
| --- | --- |
| `node collect.js` | Probe configured providers. Human lines on stdout. Writes `snapshot.json`. |
| `node collect.js --json` | Same probe. Snapshot JSON on stdout (no secrets). |
| `quota.cmd` | Probe, then print a table (`print-table.js`). |
| `quota.cmd cache` | Table from existing `snapshot.json` (no probe). |
| `start.cmd` | Always-on-top strip (`pythonw ui.py`). |
| `node scripts/pack-release.js` | Build `dist/quota-floater.zip` (no secrets). |

## Snapshot (no secrets)

`snapshot.json` / `--json` shape:

```json
{
  "updatedAt": "2026-08-24T05:36:35.886Z",
  "elapsedMs": 6112,
  "providers": [
    {
      "id": "kimi",
      "name": "Kimi",
      "plan": "Coding Plan",
      "status": "ok",
      "windows": [
        { "kind": "session", "label": "5h", "remainPct": 100, "resetsAt": "...", "used": null, "limit": null }
      ],
      "usage": null,
      "lowestPct": 2,
      "note": null
    }
  ]
}
```

`sanitize()` keeps only those fields. Keys, cookies, JWTs, CSRF tokens, and account emails never land here.

## Probe rules

- **No credential → skip.** The collector returns nothing for that id. Do not invent a row.
- **Probe failed → keep last-good** windows from the previous `snapshot.json` (`note: last good`).
- **Antigravity** needs the IDE process. WMI must use a `Name` filter (`Name='language_server.exe'`). Never enumerate every `Win32_Process`.
- **Kimi month pool** needs website `kimi-auth`. kimi-code OAuth is not enough. See [WIZARD.md](WIZARD.md).
- **Claude** reads Claude Code OAuth (`~/.claude/.credentials.json`, respects `CLAUDE_CONFIG_DIR`) or `CLAUDE_WEB_COOKIE`. The probe refreshes the token in place; first login is a human step.
- **Codex** reads `~/.codex/auth.json`, created by a human `codex login`.
- Credentials are read from local files / User env / Token Monitor `credentials.json`. Do not open the Settings UI.

## UI facts (keep copy in sync)

- DeepSeek / OpenCode Go peak line: `{off-peak|peak}  rst {Xh Ym|Ym|<1m}`  
  Example: `off-peak  rst 31m` / `peak  rst 1h 20m`.
- Card gap is **9px** (`CARD_PADY = (5, 4)`). tk pady is int-only; 9.3 is not possible.
- English UI. No CJK in the floater.

## Release

Free MIT. No paywall. GitHub Releases when a repo exists. GitHub Sponsors optional.

Pack: `node scripts/pack-release.js` → `dist/quota-floater.zip`.

Excluded from the zip: `secrets.json`, `snapshot.json`, `settings.json`, `*.bak`, `.git`.

Secret scan (unpacked zip — must print nothing):

```
rg -n "eyJ[A-Za-z0-9_-]{20,}"
rg -n "sk-[A-Za-z0-9]{16,}"
```

The pack script runs the same check. Bare prefix names (`sk-or-`) and this documentation do not match.

Claude and Codex are wired through the vendored upstream `limitCollector.js` (no credential → skipped). Setup, log-in escalation, and debugging: [SETUP.md](SETUP.md).

## More

- Provider map: [PROVIDERS.md](PROVIDERS.md)
- Agent setup & debug guide: [SETUP.md](SETUP.md)
- Human-only Kimi cookie: [WIZARD.md](WIZARD.md)
- Product start: [../README.md](../README.md)
