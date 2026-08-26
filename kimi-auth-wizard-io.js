'use strict';

// Wizard helper: write / verify / restart. Never print secrets.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const {
  normalizeKimiAuth,
  inspectKimiAuthPaste,
  decodeKimiJwtFlags,
  decodeKimiJwtPayload,
  SECRETS_PATH
} = require('./kimi-web-auth');
const {
  KIMI_MEMBERSHIP_STATS_URL,
  parseKimiMembershipStats
} = require('./vendor/tm-shared/kimiLimits');
const { BROWSER_USER_AGENT } = require('./vendor/tm-shared/browserUserAgent');

const ROOT = __dirname;
const SNAPSHOT_PATH = path.join(ROOT, 'snapshot.json');

function readSecretsToken() {
  try {
    const raw = fs.readFileSync(SECRETS_PATH);
    const text = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
      ? raw.subarray(3).toString('utf8')
      : raw.toString('utf8');
    const doc = JSON.parse(text);
    return normalizeKimiAuth(doc && doc['kimi-auth']);
  } catch (_) {
    return '';
  }
}

function tokenMeta(token, live = null) {
  const raw = normalizeKimiAuth(token);
  const meta = { hasKey: Boolean(raw), ok: live === 200, bom: false };
  try {
    const buf = fs.readFileSync(SECRETS_PATH);
    meta.bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  } catch (_) { /* ignore */ }
  if (!raw) return meta;
  const flags = decodeKimiJwtFlags(raw);
  meta.iss = flags.iss;
  meta.app_id = flags.app_id;
  meta.exp = flags.exp || 'parse-fail';
  if (live != null) meta.live = live;
  return meta;
}

function kimiWebHeaders(token) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const headers = {
    Authorization: `Bearer ${token}`,
    Cookie: `kimi-auth=${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://www.kimi.com',
    Referer: 'https://www.kimi.com/code/console',
    'connect-protocol-version': '1',
    'x-language': 'en-US',
    'x-msh-platform': 'web',
    'User-Agent': BROWSER_USER_AGENT
  };
  if (timezone) headers['r-timezone'] = timezone;
  const payload = decodeKimiJwtPayload(token);
  if (payload) {
    if (payload.device_id) headers['x-msh-device-id'] = String(payload.device_id);
    if (payload.ssid) headers['x-msh-session-id'] = String(payload.ssid);
    if (payload.sub) headers['x-traffic-id'] = String(payload.sub);
  }
  return headers;
}

async function probeMembership(token) {
  const res = await fetch(KIMI_MEMBERSHIP_STATS_URL, {
    method: 'POST',
    headers: kimiWebHeaders(token),
    body: '{}',
    signal: AbortSignal.timeout(12_000)
  });
  let fields = '';
  let body = null;
  try {
    body = await res.json();
    fields = body && typeof body === 'object' ? Object.keys(body).join(',') : typeof body;
  } catch (err) {
    fields = err && err.message ? err.message : 'read-fail';
  }
  return { status: res.status, fields, body };
}

function persistSecrets(clean) {
  let prev = {};
  try {
    const raw = fs.readFileSync(SECRETS_PATH);
    const text = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
      ? raw.subarray(3).toString('utf8')
      : raw.toString('utf8');
    prev = JSON.parse(text);
    if (!prev || typeof prev !== 'object') prev = {};
  } catch (_) {
    prev = {};
  }
  prev['kimi-auth'] = clean;
  fs.writeFileSync(SECRETS_PATH, `${JSON.stringify(prev)}\n`, { encoding: 'utf8' });
}

async function writeSecrets(token) {
  const inspected = inspectKimiAuthPaste(token);
  if (!inspected.token) {
    process.stderr.write(`token rejected: ${inspected.error}\n`);
    process.exit(1);
  }
  const probe = await probeMembership(inspected.token);
  if (probe.status === 401 || probe.status === 403) {
    process.stderr.write(`token rejected: GetSubscriptionStats ${probe.status}\n`);
    process.exit(1);
  }
  if (probe.status !== 200) {
    process.stderr.write(`GetSubscriptionStats ${probe.status || 'error'} fields=${probe.fields || 'none'}\n`);
    process.exit(1);
  }
  persistSecrets(inspected.token);
  const meta = tokenMeta(inspected.token, 200);
  process.stdout.write(`wrote secrets.json exp=${meta.exp} iss=${meta.iss} app_id=${meta.app_id} live=200\n`);
}

async function verify() {
  const token = readSecretsToken();
  if (!token) {
    process.stderr.write('secrets empty\n');
    process.exit(1);
  }
  const probe = await probeMembership(token);
  if (probe.status === 401 || probe.status === 403) {
    process.stderr.write(`token rejected: GetSubscriptionStats ${probe.status}\n`);
    process.exit(1);
  }
  if (probe.status !== 200) {
    process.stderr.write(`GetSubscriptionStats ${probe.status || 'error'} fields=${probe.fields || 'none'}\n`);
    process.exit(1);
  }
  const windows = parseKimiMembershipStats(probe.body).windows || [];
  const month = windows.find((w) => w.kind === 'billing') || null;
  if (!month) {
    const root = probe.body && typeof probe.body === 'object' ? Object.keys(probe.body).join(',') : '';
    process.stderr.write(`parse-miss fields=${root}\n`);
    process.exit(1);
  }
  const remain = typeof month.remainingPercent === 'number'
    ? Math.round(month.remainingPercent * 10) / 10
    : null;
  const rst = month.resetsAt ? String(month.resetsAt).slice(0, 10) : 'unknown';
  process.stdout.write(`GetSubscriptionStats 200 month=${remain}% rst=${rst}\n`);
}

function restartFloater() {
  const ps = [
    'Get-CimInstance Win32_Process -Filter "Name = \'pythonw.exe\'" |',
    'Where-Object { $_.CommandLine -like \'*quota-floater*ui.py*\' } |',
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  ].join(' ');
  const kill = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true
  });
  if (kill.status !== 0 && kill.stderr) {
    process.stderr.write(String(kill.stderr).slice(0, 300) + '\n');
  }
  const child = spawn('cmd.exe', ['/c', 'start.cmd'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  process.stdout.write('floater restarted\n');
}

function collectOnce() {
  const r = spawnSync('node', [path.join(ROOT, 'collect.js')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 45_000,
    windowsHide: true
  });
  if (r.status !== 0) {
    process.stderr.write((r.stderr || r.stdout || 'collect failed').slice(0, 400) + '\n');
    process.exit(r.status || 1);
  }
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    const kimi = (snap.providers || []).find((p) => p.id === 'kimi');
    const month = ((kimi && kimi.windows) || []).find((w) => w.kind === 'billing' || w.label === 'month');
    if (!month) {
      process.stderr.write('snapshot missing kimi month\n');
      process.exit(1);
    }
    const remain = month.remainPct == null ? '--' : `${month.remainPct}%`;
    const rst = month.resetsAt ? String(month.resetsAt).slice(0, 10) : 'unknown';
    process.stdout.write(`snapshot month=${remain} rst=${rst}\n`);
  } catch (err) {
    process.stderr.write(`${err && err.message ? err.message : 'snapshot-read-fail'}\n`);
    process.exit(1);
  }
}

async function main() {
  const cmd = process.argv[2] || '';
  if (cmd === 'status') {
    const token = readSecretsToken();
    if (!token) {
      process.stdout.write(JSON.stringify(tokenMeta('')) + '\n');
      return;
    }
    let live = 0;
    try {
      live = (await probeMembership(token)).status;
    } catch (_) {
      live = 0;
    }
    process.stdout.write(JSON.stringify(tokenMeta(token, live)) + '\n');
    return;
  }
  if (cmd === 'write') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    await writeSecrets(Buffer.concat(chunks).toString('utf8'));
    return;
  }
  if (cmd === 'verify') {
    await verify();
    return;
  }
  if (cmd === 'restart') {
    restartFloater();
    return;
  }
  if (cmd === 'collect') {
    collectOnce();
    return;
  }
  process.stderr.write('usage: status|write|verify|restart|collect\n');
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`${err && err.name ? err.name : 'error'}\n`);
  process.exit(1);
});
