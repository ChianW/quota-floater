'use strict';

// Thin orchestrator: reuse Token Monitor probe modules, write snapshot.json.
// Never print secrets. Never invent HTTP/cookie/RPC protocols.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { fetchKimiLimits, parseKimiMembershipStats, KIMI_MEMBERSHIP_STATS_URL } = require('./vendor/tm-shared/kimiLimits');
const { BROWSER_USER_AGENT } = require('./vendor/tm-shared/browserUserAgent');
const { resolveKimiWebAuth } = require('./kimi-web-auth');
const { fetchZaiLimits } = require('./vendor/tm-shared/zaiLimits');
const { probe: probeCursor } = require('./vendor/tm-shared/cursorProbe');
const {
  probe: probeAntigravity,
  detectProcessInfos,
  listeningPorts
} = require('./vendor/tm-shared/antigravityProbe');
const { collectGoApi } = require('./vendor/tm-shared/opencodeGoApi');
const { fetchOpenRouterLimits } = require('./vendor/tm-shared/openrouterLimits');
const { fetchCopilotLimits } = require('./vendor/tm-shared/copilotLimits');
const { fetchDeepSeekLimits } = require('./vendor/tm-shared/deepseekLimits');
const { fetchClaudeLimits, fetchCodexLimits } = require('./vendor/tm-shared/limitCollector');
const { fetchMinimaxLimits } = require('./vendor/tm-shared/minimaxLimits');
const { fetchGrokLimits } = require('./vendor/tm-shared/grokLimits');
const { fetchZaiTeamLimits } = require('./vendor/tm-shared/zaiTeamLimits');
const { fetchVolcengineLimits } = require('./vendor/tm-shared/volcengineLimits');
const { fetchQoderLimits } = require('./vendor/tm-shared/qoderLimits');
const { fetchCommandcodeLimits } = require('./vendor/tm-shared/commandcodeLimits');
const { fetchOllamaLimits } = require('./vendor/tm-shared/ollamaLimits');
const { fetchWorkbuddyLimits } = require('./vendor/tm-shared/workbuddyLimits');
const { fetchKiroLimits } = require('./vendor/tm-shared/kiroLimits');
const { fetchMimoLimits } = require('./vendor/tm-shared/mimoLimits');
const { fetchThirdPartyLimits } = require('./vendor/tm-shared/thirdPartyLimits');

const ROOT = __dirname;
const SNAPSHOT_PATH = path.join(ROOT, 'snapshot.json');
const LOG_PATH = path.join(ROOT, 'floater.log');
const AG_CACHE_PATH = path.join(ROOT, 'ag-endpoint.json');
const AG_NOT_RUNNING_MS = 45_000;

function log(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch (_) { /* ignore */ }
}
const KIMI_PATH = path.join(os.homedir(), '.kimi-code', 'credentials', 'kimi-code.json');
const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';
const TM_CRED_PATH = path.join(process.env.APPDATA || '', 'Token Monitor', 'credentials.json');
const TM_SETTINGS_PATH = path.join(process.env.APPDATA || '', 'Token Monitor', 'settings.json');
const WANT_JSON = process.argv.includes('--json');
const ZCODE_PATH = path.join(os.homedir(), '.zcode', 'auth.json');
const PI_AUTH_PATH = path.join(os.homedir(), '.pi', 'agent', 'auth.json');
const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
const CURSOR_CRED_PATH = path.join(os.homedir(), '.config', 'tokscale', 'cursor-credentials.json');
const CLAUDE_CREDS_PATH = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  '.credentials.json'
);
const CODEX_AUTH_PATH = path.join(os.homedir(), '.codex', 'auth.json');

function readJson(file) {
  try {
    const raw = fs.readFileSync(file);
    const text = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
      ? raw.subarray(3).toString('utf8')
      : raw.toString('utf8');
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function writeJsonNoBom(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8' });
}

function pickProviderKey(doc, provider) {
  const p = doc && doc[provider];
  if (!p || typeof p !== 'object') return '';
  for (const name of ['key', 'apiKey', 'token', 'access_token']) {
    const v = typeof p[name] === 'string' ? p[name].trim() : '';
    if (v) return v;
  }
  return '';
}

function userEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function readTmProvider(name, field) {
  const doc = readJson(TM_CRED_PATH);
  const p = doc && doc.credentials && doc.credentials.providers && doc.credentials.providers[name];
  if (!p) return '';
  const v = p[field];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function readTmProviderObj(name) {
  const doc = readJson(TM_CRED_PATH);
  const p = doc && doc.credentials && doc.credentials.providers && doc.credentials.providers[name];
  return p && typeof p === 'object' ? p : null;
}

function readTmSetting(field) {
  const doc = readJson(TM_SETTINGS_PATH);
  if (!doc || typeof doc !== 'object') return undefined;
  return doc[field];
}

function firstTmRaw(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((p) => p && p.status !== 'notConfigured') || null;
}

function rowFromTm(id, name, raw, extra) {
  extra = extra || {};
  const hit = firstTmRaw(raw);
  if (!hit) return null;
  const windows = flattenWindows(hit.windows);
  return {
    id,
    name,
    plan: hit.accountLabel || hit.planLabel || extra.plan || name,
    status: hit.status || 'unavailable',
    windows,
    usage: extra.usage !== undefined ? extra.usage : officialUsage(windows),
    lowestPct: minRemain(windows),
    note: extra.note || null
  };
}

async function refreshKimiAccess() {
  const cred = readJson(KIMI_PATH);
  if (!cred) return '';
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(cred.expires_at) || 0;
  const access = typeof cred.access_token === 'string' ? cred.access_token : '';
  const refresh = typeof cred.refresh_token === 'string' ? cred.refresh_token : '';
  const needRefresh = !access || (expiresAt > 0 && now >= expiresAt - 180);
  if (!needRefresh) return access;
  if (!refresh) return access;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: KIMI_CLIENT_ID
    });
    const res = await fetch('https://auth.kimi.com/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) return access;
    const tok = await res.json();
    if (!tok || !tok.access_token) return access;
    const expiresIn = Number(tok.expires_in) || 900;
    const next = {
      access_token: String(tok.access_token),
      refresh_token: tok.refresh_token ? String(tok.refresh_token) : refresh,
      expires_at: now + expiresIn,
      scope: tok.scope ? String(tok.scope) : String(cred.scope || ''),
      token_type: tok.token_type ? String(tok.token_type) : 'Bearer',
      expires_in: expiresIn
    };
    writeJsonNoBom(KIMI_PATH, next);
    return next.access_token;
  } catch (_) {
    return access;
  }
}

function readCursorSession() {
  const store = readJson(CURSOR_CRED_PATH);
  if (!store || !store.accounts || typeof store.accounts !== 'object') return '';
  const id = store.activeAccountId;
  const acct = (id && store.accounts[id]) || Object.values(store.accounts)[0];
  if (!acct || typeof acct.sessionToken !== 'string') return '';
  return acct.sessionToken.trim();
}

function remainPct(window) {
  if (!window) return null;
  if (typeof window.remainingPercent === 'number' && Number.isFinite(window.remainingPercent)) {
    return round1(window.remainingPercent);
  }
  if (typeof window.usedPercent === 'number' && Number.isFinite(window.usedPercent)) {
    return round1(Math.max(0, 100 - window.usedPercent));
  }
  if (typeof window.remainingFraction === 'number' && Number.isFinite(window.remainingFraction)) {
    return round1(window.remainingFraction * 100);
  }
  return null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function kindLabel(kind) {
  if (kind === 'session') return '5h';
  if (kind === 'weekly') return 'week';
  if (kind === 'billing' || kind === 'monthly') return 'month';
  return kind || '';
}

function displayLabel(window, kind) {
  const raw = String(window && window.label || '').trim().toLowerCase();
  if (kind === 'session' && /^(5-hour|5h|session)$/.test(raw)) return '5h';
  if (kind === 'weekly' && /^(weekly|week)$/.test(raw)) return 'week';
  if (kind === 'billing' && /^(monthly|month|mcp|billing)$/.test(raw)) return 'month';
  if (!raw) return kindLabel(kind);
  return window.label;
}

function flattenWindows(windows) {
  return (Array.isArray(windows) ? windows : [])
    .map((w) => {
      const kind = w.kind === 'monthly' ? 'billing' : w.kind;
      let pct = remainPct(w);
      if (pct === null && Number.isFinite(w.used) && Number.isFinite(w.limit) && w.limit > 0) {
        pct = round1(Math.max(0, 100 - (w.used / w.limit) * 100));
      }
      if (pct === null && Number.isFinite(w.remaining) && Number.isFinite(w.limit) && w.limit > 0) {
        pct = round1((w.remaining / w.limit) * 100);
      }
      const remaining = Number.isFinite(w.remaining) ? w.remaining : null;
      if (pct === null && w.used == null && w.limit == null && remaining == null && !w.resetsAt) return null;
      return {
        kind,
        label: displayLabel(w, kind),
        remainPct: pct,
        resetsAt: w.resetsAt || w.resetTime || null,
        used: Number.isFinite(w.used) ? w.used : null,
        limit: Number.isFinite(w.limit) ? w.limit : null,
        remaining
      };
    })
    .filter(Boolean);
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
  const parts = String(token || '').split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.device_id) headers['x-msh-device-id'] = String(payload.device_id);
      if (payload.ssid) headers['x-msh-session-id'] = String(payload.ssid);
      if (payload.sub) headers['x-traffic-id'] = String(payload.sub);
    } catch (_) { /* ignore */ }
  }
  return headers;
}

async function fetchKimiMonthWindow(token) {
  try {
    const res = await fetch(KIMI_MEMBERSHIP_STATS_URL, {
      method: 'POST',
      headers: kimiWebHeaders(token),
      body: '{}',
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) {
      let fields = 'non-json';
      try {
        const errBody = await res.json();
        fields = errBody && typeof errBody === 'object' ? Object.keys(errBody).join(',') : typeof errBody;
      } catch (_) { /* ignore */ }
      log(`kimi month http ${res.status} fields=${fields}`);
      return null;
    }
    const body = await res.json();
    const windows = parseKimiMembershipStats(body).windows || [];
    const month = windows.find((w) => w.kind === 'billing') || null;
    if (!month) {
      const root = body && typeof body === 'object' ? Object.keys(body).join(',') : '';
      const data = body && body.data && typeof body.data === 'object' ? Object.keys(body.data).join(',') : '';
      log(`kimi month parse-miss fields=${root} data=${data}`);
    } else {
      log(`kimi month ok remain=${month.remainingPercent}`);
    }
    return month;
  } catch (err) {
    log(`kimi month ${err && err.name ? err.name : 'error'}`);
    return null;
  }
}

function officialUsage(windows, extra) {
  const bits = [];
  for (const w of windows || []) {
    if (w.used != null && w.limit != null) {
      bits.push(`${fmtNum(w.used)}/${fmtNum(w.limit)}`);
    } else if (w.remaining != null) {
      bits.push(`${fmtNum(w.remaining)} left`);
    }
  }
  if (extra) bits.push(extra);
  return bits.length ? bits.join(' · ') : null;
}

function fmtNum(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if (Math.abs(n) >= 1000) return String(Math.round(n));
  return String(Number(n.toFixed(2)));
}

function minRemain(windows) {
  const nums = (windows || []).map((w) => w.remainPct).filter((n) => typeof n === 'number');
  if (!nums.length) return null;
  return Math.min(...nums);
}

async function collectKimi() {
  const key = await refreshKimiAccess() || userEnv('KIMI_CODE_API_KEY') || readTmProvider('kimi', 'apiKey');
  if (!key) return null;
  const web = resolveKimiWebAuth();
  if (web) log(`kimi web-auth source=${web.source}`);
  else log('kimi web-auth missing');
  const raw = await fetchKimiLimits({
    kimiApiKey: key,
    kimiWebAccessToken: ''
  });
  if (!raw || raw.status === 'notConfigured') return null;
  const windows = flattenWindows(raw.windows);
  if (web && !windows.some((w) => w.kind === 'billing')) {
    const month = await fetchKimiMonthWindow(web.token);
    if (month) windows.push(...flattenWindows([month]));
  }
  return {
    id: 'kimi',
    name: 'Kimi',
    plan: raw.accountLabel || raw.planLabel || 'Coding Plan',
    status: raw.status || 'unavailable',
    windows,
    usage: officialUsage(windows),
    lowestPct: minRemain(windows)
  };
}

async function collectZai() {
  const zcode = readJson(ZCODE_PATH);
  const pi = readJson(PI_AUTH_PATH);
  const key = pickProviderKey(zcode, 'zai')
    || pickProviderKey(pi, 'zai')
    || readTmProvider('zai', 'apiKey')
    || userEnv('ZAI_API_KEY');
  if (!key) return null;
  const raw = await fetchZaiLimits({ zaiApiKey: key, zaiApiRegion: 'global' });
  if (!raw || raw.status === 'notConfigured') return null;
  const windows = flattenWindows(raw.windows);
  return {
    id: 'zai',
    name: 'Z.ai',
    plan: raw.accountLabel || raw.planLabel || 'GLM',
    status: raw.status || 'unavailable',
    windows,
    usage: officialUsage(windows),
    lowestPct: minRemain(windows)
  };
}

function refreshCursorFromDesktop() {
  const script = path.join(process.env.APPDATA || '', 'Token Monitor', 'sync-cursor.py');
  if (!fs.existsSync(script)) return false;
  const r = spawnSync('python', [script], {
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true
  });
  return r.status === 0 && String(r.stdout || '').includes('cursor=synced');
}

async function collectCursor() {
  let token = readCursorSession();
  if (!token) {
    refreshCursorFromDesktop();
    token = readCursorSession();
  }
  if (!token) return null;
  let result = await probeCursor(token);
  if (!result || !result.ok) {
    const kind = result && result.error && result.error.kind;
    log(`cursor probe ${kind || 'error'}`);
    if (kind === 'unauthorized' && refreshCursorFromDesktop()) {
      token = readCursorSession();
      result = await probeCursor(token);
    } else {
      result = await probeCursor(token);
    }
  }
  if (!result || !result.ok) {
    const kind = result && result.error && result.error.kind;
    log(`cursor probe-final ${kind || 'error'}`);
    return {
      id: 'cursor',
      name: 'Cursor',
      plan: '',
      status: kind === 'unauthorized' ? 'unauthorized' : 'unavailable',
      windows: [],
      usage: null,
      lowestPct: null,
      note: kind || 'probe failed'
    };
  }
  const u = result.usage || {};
  const planPct = typeof u.planPercent === 'number' ? u.planPercent : null;
  const limit = Number.isFinite(u.planLimitUsd) && u.planLimitUsd > 0 ? u.planLimitUsd : null;
  // Cursor usage-summary often stamps plan.used/limit at the included cap
  // ($70/$70) while totalPercentUsed is the real consumption. Trust percent.
  let used = Number.isFinite(u.planUsedUsd) ? u.planUsedUsd : null;
  let remaining = Number.isFinite(u.planRemainingUsd) ? u.planRemainingUsd : null;
  if (limit != null && planPct != null) {
    const derivedUsed = Math.round(limit * planPct) / 100;
    const derivedRemain = Math.round(limit * (100 - planPct)) / 100;
    const stampedFull = used === limit && (remaining === 0 || remaining == null);
    const pctRemain = 100 - planPct;
    const apiRemainPct = limit > 0 && remaining != null ? (remaining / limit) * 100 : null;
    if (u.isUnlimited) {
      used = 0;
      remaining = limit;
    } else if (stampedFull || (apiRemainPct != null && Math.abs(apiRemainPct - pctRemain) > 15)) {
      used = derivedUsed;
      remaining = derivedRemain;
    }
  }
  const remainPct = u.isUnlimited ? 100 : planPct == null ? null : round1(Math.max(0, 100 - planPct));
  const windows = [];
  if (remainPct != null || used != null || limit != null) {
    windows.push({
      kind: 'billing',
      label: 'month',
      remainPct,
      resetsAt: u.billingCycleEnd || null,
      used,
      limit
    });
  }
  const usageBits = [];
  if (limit != null && used != null) {
    usageBits.push(`$${fmtNum(used)}/$${fmtNum(limit)}`);
  } else if (remaining != null) {
    usageBits.push(`$${fmtNum(remaining)} left`);
  }
  if (u.requestsUsed != null && (u.requestsLimit != null || u.requestsUsed > 0)) {
    usageBits.push(u.requestsLimit != null
      ? `${fmtNum(u.requestsUsed)}/${fmtNum(u.requestsLimit)} req`
      : `${fmtNum(u.requestsUsed)} req`);
  }
  return {
    id: 'cursor',
    name: 'Cursor',
    plan: u.membershipType || u.limitType || 'Cursor',
    status: windows.length ? 'ok' : 'unavailable',
    windows,
    usage: usageBits.join(' · ') || null,
    lowestPct: minRemain(windows)
  };
}

function lastProvider(id, snap) {
  const doc = snap || readJson(SNAPSHOT_PATH);
  const row = ((doc && doc.providers) || []).find((p) => p && p.id === id);
  return row || null;
}

function keepLastGood(next, prev) {
  if (!next) return next;
  const empty = !Array.isArray(next.windows) || next.windows.length === 0;
  if (!empty || !prev || !Array.isArray(prev.windows) || !prev.windows.length) return next;
  return {
    ...next,
    plan: next.plan || prev.plan,
    status: 'ok',
    windows: prev.windows,
    usage: next.usage || prev.usage,
    lowestPct: minRemain(prev.windows),
    note: next.note && next.note !== 'open Antigravity' ? next.note : 'last good'
  };
}

function agIdle() {
  return {
    id: 'antigravity',
    name: 'Antigravity',
    plan: '',
    status: 'idle',
    windows: [],
    usage: null,
    lowestPct: null,
    note: 'open Antigravity'
  };
}

function agPidAlive(pid) {
  if (!pid) return false;
  const r = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)} AND Name='language_server.exe'" | Select-Object -ExpandProperty ProcessId`
  ], { encoding: 'utf8', timeout: 4000, windowsHide: true });
  return String(r.stdout || '').trim() === String(pid);
}

function mapAgWindows(snap) {
  const windows = [];
  for (const w of snap.windows || []) {
    windows.push({
      kind: w.kind,
      label: w.name || kindLabel(w.kind),
      remainPct: remainPct(w),
      resetsAt: w.resetTime || null,
      used: null,
      limit: null
    });
  }
  if (!windows.length) {
    for (const p of snap.pools || []) {
      windows.push({
        kind: 'weekly',
        label: p.name || 'pool',
        remainPct: remainPct(p),
        resetsAt: p.resetTime || null,
        used: null,
        limit: null
      });
    }
  }
  return windows;
}

async function collectAntigravity() {
  const cached = readJson(AG_CACHE_PATH);
  const cacheAge = cached && cached.updatedAt ? Date.now() - Date.parse(cached.updatedAt) : Infinity;
  if (cached && cached.notRunning && cacheAge < AG_NOT_RUNNING_MS) {
    log(`ag skip-wmi notRunning ageMs=${cacheAge}`);
    return keepLastGood(agIdle(), lastProvider('antigravity')) || agIdle();
  }

  const alive = cached && cached.pid && cached.csrfToken && Array.isArray(cached.ports) && cached.ports.length
    && agPidAlive(cached.pid);
  const deps = { probeTimeoutMs: alive ? 4000 : 8000 };
  if (alive) {
    log(`ag cache-hit pid=${cached.pid}`);
    deps.detectProcessInfos = async () => [{
      pid: cached.pid,
      kind: cached.kind || 'ide',
      csrfToken: cached.csrfToken,
      extensionPort: cached.extensionPort || null,
      extensionCsrfToken: cached.extensionCsrfToken || ''
    }];
    deps.listeningPorts = async () => cached.ports;
  } else {
    log('ag cache-miss');
    deps.detectProcessInfos = async (d) => {
      const infos = await detectProcessInfos(d);
      if (!infos.length) {
        writeJsonNoBom(AG_CACHE_PATH, { updatedAt: new Date().toISOString(), notRunning: true });
        return infos;
      }
      const info = infos[0];
      writeJsonNoBom(AG_CACHE_PATH, {
        updatedAt: new Date().toISOString(),
        notRunning: false,
        pid: info.pid,
        kind: info.kind,
        csrfToken: info.csrfToken || '',
        extensionPort: info.extensionPort || null,
        extensionCsrfToken: info.extensionCsrfToken || '',
        ports: cached && cached.pid === info.pid ? (cached.ports || []) : []
      });
      return infos;
    };
    deps.listeningPorts = async (pid, d) => {
      const prev = readJson(AG_CACHE_PATH) || {};
      if (prev.pid === pid && Array.isArray(prev.ports) && prev.ports.length && agPidAlive(pid)) {
        return prev.ports;
      }
      const ports = await listeningPorts(pid, d);
      writeJsonNoBom(AG_CACHE_PATH, { ...prev, pid, ports, updatedAt: new Date().toISOString(), notRunning: false });
      return ports;
    };
  }

  try {
    const snap = await probeAntigravity(deps);
    const windows = mapAgWindows(snap);
    const row = {
      id: 'antigravity',
      name: 'Antigravity',
      plan: snap.accountPlan || 'Google AI Ultra',
      status: windows.length ? 'ok' : 'unavailable',
      windows,
      usage: null,
      lowestPct: minRemain(windows)
    };
    return keepLastGood(row, lastProvider('antigravity')) || row;
  } catch (err) {
    const status = err && err.status;
    if (status === 'notConfigured') {
      writeJsonNoBom(AG_CACHE_PATH, { updatedAt: new Date().toISOString(), notRunning: true });
    }
    log(`ag ${status || 'error'}`);
    return keepLastGood({
      id: 'antigravity',
      name: 'Antigravity',
      plan: '',
      status: 'unavailable',
      windows: [],
      usage: null,
      lowestPct: null,
      note: status || 'probe failed'
    }, lastProvider('antigravity')) || agIdle();
  }
}

async function collectOpenCode() {
  const oc = readJson(OPENCODE_AUTH_PATH);
  const zcode = readJson(ZCODE_PATH);
  const key = pickProviderKey(oc, 'opencode-go')
    || pickProviderKey(zcode, 'opencode-go')
    || userEnv('TOKEN_MONITOR_OPENCODE_API_KEY');
  if (!key) return null;
  const raw = await collectGoApi({ apiKey: key });
  if (!raw || raw.status === 'notConfigured') return null;
  const windows = flattenWindows(raw.windows);
  return {
    id: 'opencode',
    name: 'OpenCode Go',
    plan: 'Go',
    status: raw.status || 'unavailable',
    windows,
    usage: officialUsage(windows),
    lowestPct: minRemain(windows)
  };
}

async function collectOpenRouter() {
  const envKey = userEnv('OPENROUTER_API_KEY')
    || (userEnv('ANTHROPIC_AUTH_TOKEN').startsWith('sk-or-') ? userEnv('ANTHROPIC_AUTH_TOKEN') : '');
  const tm = readJson(TM_CRED_PATH);
  const profiles = tm
    && tm.credentials
    && tm.credentials.providers
    && tm.credentials.providers.openrouter
    && tm.credentials.providers.openrouter.profiles;
  const options = { openrouterProfiles: profiles || {} };
  const raw = await fetchOpenRouterLimits(options, {
    env: { ...process.env, OPENROUTER_API_KEY: envKey || process.env.OPENROUTER_API_KEY || '' }
  });
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const ok = list.find((p) => p && p.status !== 'notConfigured');
  if (!ok) return null;
  const rawWindows = Array.isArray(ok.windows) ? ok.windows : [];
  const keyLimit = rawWindows.find((w) => w && w.metric !== 'credits' && Number(w.limit) > 0);
  const credits = rawWindows.find((w) => w && w.metric === 'credits');
  // PAYG keys have no spend cap — credits window is the quota bar.
  const windows = flattenWindows((keyLimit || credits) ? [keyLimit, credits].filter(Boolean) : rawWindows);
  let usage = null;
  if (credits && credits.used != null) {
    usage = credits.remaining != null
      ? `$${fmtNum(credits.used)} used · $${fmtNum(credits.remaining)} credits`
      : `$${fmtNum(credits.used)} used`;
  } else if (ok.balance && ok.balance.allTimeSpend != null) {
    usage = `$${fmtNum(ok.balance.allTimeSpend)} used`;
  }
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    plan: ok.planLabel || 'PAYG',
    status: ok.status || 'unavailable',
    windows,
    usage,
    lowestPct: minRemain(windows)
  };
}

async function collectCopilot() {
  const token = readTmProvider('copilot', 'apiToken')
    || userEnv('COPILOT_API_TOKEN')
    || userEnv('GITHUB_COPILOT_TOKEN');
  if (!token) return null;
  const raw = await fetchCopilotLimits({ copilotApiToken: token });
  if (!raw || raw.status === 'notConfigured') return null;
  const windows = flattenWindows(raw.windows);
  return {
    id: 'copilot',
    name: 'Copilot',
    plan: raw.accountLabel || raw.planLabel || 'Copilot',
    status: raw.status || 'unavailable',
    windows,
    usage: officialUsage(windows),
    lowestPct: minRemain(windows)
  };
}

async function collectClaude() {
  // Two credential sources, tried in order by the probe itself: Claude Code
  // OAuth (~/.claude/.credentials.json, refreshed in place by the probe) and
  // a claude.ai web session cookie via CLAUDE_WEB_COOKIE. Absent both, skip.
  if (!userEnv('CLAUDE_WEB_COOKIE') && !fs.existsSync(CLAUDE_CREDS_PATH)) return null;
  let raw;
  try {
    raw = await fetchClaudeLimits();
  } catch (err) {
    if (err && err.status === 'notConfigured') return null;
    throw err;
  }
  return rowFromTm('claude', 'Claude', raw);
}

async function collectCodex() {
  // Codex CLI login state. The probe can also drive `codex login` (upstream
  // exports runCodexLogin) but login itself is a human browser step.
  if (!fs.existsSync(CODEX_AUTH_PATH)) return null;
  let raw;
  try {
    raw = await fetchCodexLimits();
  } catch (err) {
    if (err && err.status === 'notConfigured') return null;
    throw err;
  }
  return rowFromTm('codex', 'Codex', raw);
}

async function collectDeepSeek() {
  return rowFromTm('deepseek', 'DeepSeek', await fetchDeepSeekLimits({
    deepseekApiKey: readTmProvider('deepseek', 'apiKey')
  }), { plan: 'Pay-as-you-go' });
}

async function collectMinimax() {
  return rowFromTm('minimax', 'MiniMax', await fetchMinimaxLimits({
    minimaxApiKey: readTmProvider('minimax', 'apiKey')
  }));
}

async function collectGrok() {
  return rowFromTm('grok', 'Grok', await fetchGrokLimits({
    grokBearerToken: userEnv('GROK_BEARER_TOKEN')
  }));
}

async function collectZaiTeam() {
  const p = readTmProviderObj('zaiTeam') || {};
  return rowFromTm('zaiteam', 'Z.ai Team', await fetchZaiTeamLimits({
    zaiTeamApiKey: userEnv('ZAI_TEAM_API_KEY') || userEnv('BIGMODEL_TEAM_API_KEY') || p.apiKey || '',
    zaiTeamOrganizationId: userEnv('ZAI_TEAM_ORGANIZATION_ID') || p.organizationId || '',
    zaiTeamProjectId: userEnv('ZAI_TEAM_PROJECT_ID') || p.projectId || ''
  }));
}

async function collectVolcengine() {
  const p = readTmProviderObj('volcengine') || {};
  return rowFromTm('volcengine', 'Volcengine', await fetchVolcengineLimits({
    volcengineAccessKeyId: userEnv('VOLCENGINE_ACCESS_KEY_ID') || p.accessKeyId || '',
    volcengineSecretAccessKey: userEnv('VOLCENGINE_SECRET_ACCESS_KEY') || p.secretAccessKey || '',
    volcengineRegion: userEnv('VOLCENGINE_REGION') || p.region || ''
  }));
}

async function collectQoder() {
  return rowFromTm('qoder', 'Qoder', await fetchQoderLimits({
    qoderCookie: userEnv('QODER_COOKIE') || userEnv('TOKEN_MONITOR_QODER_COOKIE') || readTmProvider('qoder', 'cookie'),
    qoderSite: userEnv('QODER_SITE') || userEnv('TOKEN_MONITOR_QODER_SITE') || ''
  }));
}

async function collectCommandcode() {
  return rowFromTm('commandcode', 'Command Code', await fetchCommandcodeLimits({
    commandcodeCookie: userEnv('COMMANDCODE_COOKIE') || readTmProvider('commandcode', 'cookie')
  }));
}

async function collectOllama() {
  return rowFromTm('ollama', 'Ollama', await fetchOllamaLimits({
    ollamaCookie: userEnv('OLLAMA_COOKIE') || userEnv('TOKEN_MONITOR_OLLAMA_COOKIE') || readTmProvider('ollama', 'cookie')
  }));
}

async function collectWorkbuddy() {
  return rowFromTm('workbuddy', 'WorkBuddy', await fetchWorkbuddyLimits({
    workbuddyAccessToken: userEnv('TOKEN_MONITOR_WORKBUDDY_ACCESS_TOKEN')
      || userEnv('WORKBUDDY_ACCESS_TOKEN')
      || readTmSetting('workbuddyAccessToken')
      || '',
    workbuddyUserId: userEnv('WORKBUDDY_USER_ID') || readTmSetting('workbuddyUserId') || '',
    workbuddyEnterpriseId: userEnv('WORKBUDDY_ENTERPRISE_ID') || readTmSetting('workbuddyEnterpriseId') || '',
    workbuddyLocale: userEnv('WORKBUDDY_LOCALE') || readTmSetting('workbuddyLocale') || '',
    workbuddyDomain: userEnv('WORKBUDDY_DOMAIN') || readTmSetting('workbuddyDomain') || '',
    workbuddyDepartmentInfo: userEnv('WORKBUDDY_DEPARTMENT_INFO') || readTmSetting('workbuddyDepartmentInfo') || ''
  }));
}

async function collectKiro() {
  return rowFromTm('kiro', 'Kiro', await fetchKiroLimits());
}

async function collectMimo() {
  const accounts = readTmSetting('mimoManagedAccounts');
  return rowFromTm('mimo', 'MiMo', await fetchMimoLimits({
    mimoManagedAccounts: Array.isArray(accounts) ? accounts : []
  }));
}

async function collectThirdParty() {
  const p = readTmProviderObj('thirdparty') || {};
  const profiles = p.profiles || readTmSetting('thirdPartyProfiles') || {};
  return rowFromTm('thirdparty', 'Third Party', await fetchThirdPartyLimits({
    thirdPartyProfiles: profiles
  }));
}

function sanitize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    plan: row.plan || '',
    status: row.status,
    windows: row.windows || [],
    usage: row.usage || null,
    lowestPct: row.lowestPct,
    note: row.note || null
  };
}

async function main() {
  log('collect start');
  const started = Date.now();
  const prevSnap = readJson(SNAPSHOT_PATH);
  const jobs = [
    ['kimi', collectKimi],
    ['zai', collectZai],
    ['claude', collectClaude],
    ['codex', collectCodex],
    ['cursor', collectCursor],
    ['antigravity', collectAntigravity],
    ['opencode', collectOpenCode],
    ['openrouter', collectOpenRouter],
    ['copilot', collectCopilot],
    ['deepseek', collectDeepSeek],
    ['minimax', collectMinimax],
    ['grok', collectGrok],
    ['zaiteam', collectZaiTeam],
    ['volcengine', collectVolcengine],
    ['qoder', collectQoder],
    ['commandcode', collectCommandcode],
    ['ollama', collectOllama],
    ['workbuddy', collectWorkbuddy],
    ['kiro', collectKiro],
    ['mimo', collectMimo],
    ['thirdparty', collectThirdParty]
  ];
  const settled = await Promise.all(jobs.map(async ([id, fn]) => {
    try {
      return sanitize(await fn());
    } catch (err) {
      return {
        id,
        name: id,
        plan: '',
        status: 'unavailable',
        windows: [],
        usage: null,
        lowestPct: null,
        note: err && err.status ? String(err.status) : 'probe failed'
      };
    }
  }));
  const providers = settled
    .map((row) => {
      if (!row) return row;
      return keepLastGood(row, lastProvider(row.id, prevSnap)) || row;
    })
    .filter(Boolean);
  const snapshot = {
    updatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    providers
  };
  writeJsonNoBom(SNAPSHOT_PATH, snapshot);
  if (WANT_JSON) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  } else {
    for (const p of providers) {
      const parts = (p.windows || []).map((w) => {
        const pct = w.remainPct == null ? '--' : `${w.remainPct}%`;
        return `${w.label} ${pct}`;
      });
      const extra = p.usage ? ` usage=${p.usage}` : '';
      const note = p.note ? ` ${p.note}` : '';
      process.stdout.write(`${p.name} [${p.status}] ${parts.join(' | ') || '-'}${extra}${note}\n`);
    }
    process.stdout.write(`elapsed ${snapshot.elapsedMs}ms providers ${providers.length}\n`);
  }
  log(`collect done elapsedMs=${snapshot.elapsedMs}`);
}

main().catch((err) => {
  process.stderr.write(`collect failed: ${err && err.status ? err.status : 'error'}\n`);
  process.exit(1);
});
