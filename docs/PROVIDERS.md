# Providers

Token Monitor `LIMIT_PROVIDER_IDS` (21):

`claude`, `codex`, `opencode`, `cursor`, `antigravity`, `kimi`, `grok`, `copilot`, `commandcode`, `mimo`, `zai`, `zaiteam`, `kiro`, `workbuddy`, `qoder`, `deepseek`, `openrouter`, `minimax`, `volcengine`, `ollama`, `thirdparty`

quota-floater reuses the upstream probe modules verbatim in `vendor/tm-shared/`. Most providers live in standalone `*Limits.js` / `*Probe.js`; Claude and Codex live in `limitCollector.js`, which is vendored **whole**, together with its dependency closure (TM v0.47.0 extract). Fix probes only in the vendored copy — never edit Token Monitor `app.asar`.

## Wired in `collect.js`

Skip = no local credential. Failed probe keeps last-good.

| id | Name | Probe module | Credential (names only) |
| --- | --- | --- | --- |
| `kimi` | Kimi | `kimiLimits.js` | `~/.kimi-code/credentials/kimi-code.json`, `KIMI_CODE_API_KEY`, TM `providers.kimi.apiKey`. **Month pool:** website `kimi-auth` via `KIMI_AUTH_TOKEN` / `secrets.json` / browser cookies. kimi-code OAuth cannot read the month pool. |
| `zai` | Z.ai | `zaiLimits.js` | `~/.zcode/auth.json` / `~/.pi/agent/auth.json` `zai`, TM `providers.zai.apiKey`, `ZAI_API_KEY` |
| `claude` | Claude | `limitCollector.js` (vendored whole) | `~/.claude/.credentials.json` (respects `CLAUDE_CONFIG_DIR`) or `CLAUDE_WEB_COOKIE` (claude.ai session). The probe refreshes the OAuth token in place. First login is a human step (Claude Code CLI OAuth). |
| `codex` | Codex | `limitCollector.js` (vendored whole) | `~/.codex/auth.json`, created by a human `codex login` (opens a browser). Managed extra accounts via TM settings `codexManagedAccounts`. |
| `cursor` | Cursor | `cursorProbe.js` | `~/.config/tokscale/cursor-credentials.json` (refreshed from Cursor desktop when present) |
| `antigravity` | Antigravity | `antigravityProbe.js` | Local `language_server.exe` + CSRF. WMI **must** `Name='language_server.exe'` |
| `opencode` | OpenCode Go | `opencodeGoApi.js` | `~/.local/share/opencode/auth.json` / zcode `opencode-go`, `TOKEN_MONITOR_OPENCODE_API_KEY` |
| `openrouter` | OpenRouter | `openrouterLimits.js` | `OPENROUTER_API_KEY` / `ANTHROPIC_AUTH_TOKEN` starting `sk-or-`, TM `providers.openrouter.profiles` |
| `copilot` | Copilot | `copilotLimits.js` | TM `providers.copilot.apiToken`, `COPILOT_API_TOKEN`, `GITHUB_COPILOT_TOKEN` |
| `deepseek` | DeepSeek | `deepseekLimits.js` (TM extract) | `DEEPSEEK_API_KEY` / `DEEPSEEK_KEY`, TM `providers.deepseek.apiKey` |
| `minimax` | MiniMax | `minimaxLimits.js` | `MINIMAX_CODING_API_KEY`, TM `providers.minimax.apiKey` |
| `grok` | Grok | `grokLimits.js` | `GROK_BEARER_TOKEN`, `~/.grok/auth.json` |
| `zaiteam` | Z.ai Team | `zaiTeamLimits.js` | `ZAI_TEAM_API_KEY`, TM `providers.zaiTeam.apiKey` + org/project |
| `volcengine` | Volcengine | `volcengineLimits.js` | `VOLCENGINE_ACCESS_KEY_ID` + secret, or `ARK_API_KEY`; TM `providers.volcengine` |
| `qoder` | Qoder | `qoderLimits.js` | `QODER_COOKIE` / `TOKEN_MONITOR_QODER_COOKIE`, TM `providers.qoder.cookie` |
| `commandcode` | Command Code | `commandcodeLimits.js` | `COMMANDCODE_COOKIE`, TM `providers.commandcode.cookie` |
| `ollama` | Ollama | `ollamaLimits.js` | `OLLAMA_COOKIE` / `TOKEN_MONITOR_OLLAMA_COOKIE`, TM `providers.ollama.cookie` |
| `workbuddy` | WorkBuddy | `workbuddyLimits.js` | `WORKBUDDY_ACCESS_TOKEN`, TM settings `workbuddyAccessToken` |
| `kiro` | Kiro | `kiroLimits.js` | `kiro-cli` on PATH / default install path (no API key) |
| `mimo` | MiMo | `mimoLimits.js` | TM settings `mimoManagedAccounts` (cookies) |
| `thirdparty` | Third Party | `thirdPartyLimits.js` | TM `providers.thirdparty.profiles` or NewAPI env (`TOKEN_MONITOR_NEWAPI_*`) |

## Claude / Codex notes

- The probes are upstream Token Monitor code, vendored verbatim — no protocol was invented here.
- The author's machine has no Claude/Codex credentials, so only the **skip path** (no credential → no card) is tested locally. The happy path is exercised by the upstream TM app itself. First real-machine validation belongs in `docs/SETUP.md` debugging.
- `collect.js` guards with a credential pre-check plus a `notConfigured` catch, so machines without Claude/Codex logins stay clean (no dead cards).
- Log-in is a human step: Claude Code CLI OAuth for `~/.claude/.credentials.json`, `codex login` for `~/.codex/auth.json`. Agents never type credentials.

They ship in the free MIT release zip. No paywall. GitHub Releases when a repo exists. GitHub Sponsors optional.

Pack: `node scripts/pack-release.js`. Zip excludes `secrets.json` and other machine-local files. Secret scan (unpacked zip, must print nothing):

```
rg -n "eyJ[A-Za-z0-9_-]{20,}"
rg -n "sk-[A-Za-z0-9]{16,}"
```

## Display rules

### DeepSeek / OpenCode peak line

Official DeepSeek peak hours (Beijing, Mon–Fri): 09:00–12:00 and 14:00–18:00. Sat–Sun all-day off-peak.

Floater line (English, short):

```
{off-peak|peak}  rst {Xh Ym|Ym|<1m}
```

Examples: `off-peak  rst 31m` · `peak  rst 1h 20m` · `off-peak  rst <1m`

Window reset timestamps stay as `rst MM-DD HH:MM`. Do not rewrite those into the peak remaining form.

### Card gap

tk `pady` is int-only. Adjacent cards use `CARD_PADY = (5, 4)` → **9px** gap. 9.3px is not possible; do not change to 10.

### Kimi month

`GetSubscriptionStats` needs the **www.kimi.com** session cookie named `kimi-auth`.

kimi-code OAuth (`~/.kimi-code/credentials/kimi-code.json`) covers 5h + week only.

Human paste path: [WIZARD.md](WIZARD.md). Agents should first try `KIMI_AUTH_TOKEN`, `secrets.json`, then local Chrome / Edge / Kimi desktop cookies (`kimi-web-auth.js`). Do not paste the cookie into chat.
