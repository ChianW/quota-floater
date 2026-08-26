# Wizards

c31-wizard is only for steps a human must do (browser login, copy a cookie). Agents must do everything they can themselves.

The only wizard in this repo is **Kimi website `kimi-auth`**.

## Why a wizard exists

Kimi's **month** pool is `POST GetSubscriptionStats` on www.kimi.com. It requires the website cookie `kimi-auth`.

kimi-code OAuth cannot read that pool. Token Monitor Settings is not a setup path.

Agent-first order (no wizard):

1. User env `KIMI_AUTH_TOKEN`
2. gitignored `secrets.json` → `{ "kimi-auth": "..." }` (no BOM)
3. Local Kimi desktop / Chrome / Edge cookies (`kimi-web-auth.js`)

If those miss, the human runs the wizard. Agents must **not** run the interactive wizard (it opens a browser and blocks on paste).

## Run (Windows)

Git Bash full path (bare `bash` may be WSL):

```
& "C:\Program Files\Git\bin\bash.exe" "C:\Users\wangq\Desktop\quota-floater\kimi-auth-wizard.sh"
```

## Stages (4)

1. Open https://www.kimi.com — human confirms a website login (not kimi-code).
2. F12 → Application → Cookies → `https://www.kimi.com` → cookie **kimi-auth** → copy **Value** only. Hidden paste. Writes `secrets.json`. If `kimi-auth-wizard-io.js status` already reports a live session, paste is skipped.
3. Machine verify: `GetSubscriptionStats` must be HTTP 200 and parse a billing window.
4. Restart the floater (WMI `Name='pythonw.exe'` + command-line match) and run `collect.js`. Month window must appear.

WMI always uses a `Name` filter. Do not enumerate every process.

## Files

| File | Role |
| --- | --- |
| `kimi-auth-wizard.sh` | c31-wizard stages (library above `STAGES` is untouched) |
| `kimi-auth-wizard-io.js` | `status` / `write` / `verify` / `restart` / `collect` — never prints the token |
| `kimi-web-auth.js` | Resolve `kimi-auth` from env / secrets / cookies |
| `secrets.json` | gitignored. `{ "kimi-auth": "..." }`. Never packed by `scripts/pack-release.js`. |

Do not paste `kimi-auth` into chat.
