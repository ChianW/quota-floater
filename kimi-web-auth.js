'use strict';

// Resolve www.kimi.com kimi-auth without printing it.
// Order: env → secrets.json → local cookie stores → (ignored) kimi-code JWT.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;
const SECRETS_PATH = path.join(ROOT, 'secrets.json');
const PY_HELPER = path.join(ROOT, 'kimi-web-auth.py');
const SECRET_KEYS = ['kimi-auth', 'kimiAuth', 'KIMI_AUTH_TOKEN', 'kimiAuthToken'];
const ENV_NAMES = ['KIMI_AUTH_TOKEN', 'KIMI_MANUAL_COOKIE'];

function stripWrapQuotes(value) {
  let raw = typeof value === 'string' ? value : '';
  raw = raw.replace(/^\uFEFF/, '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  return raw;
}

function cleanSecret(value) {
  return stripWrapQuotes(value);
}

function normalizeKimiAuth(value) {
  let raw = stripWrapQuotes(value);
  if (!raw) return '';
  raw = raw.replace(/^authorization\s*:\s*/i, '').replace(/^bearer\s+/i, '').trim();
  raw = raw.replace(/\s+/g, '');
  if (/^kimi-auth=?$/i.test(raw)) return '';
  const cookieMatch = raw.match(/^(?:.*;)?kimi-auth[:=]([^;'"]+)/i);
  if (cookieMatch) raw = stripWrapQuotes(cookieMatch[1]);
  else if (/^(?:cookie:|curl)/i.test(raw) || raw.includes(';')) return '';
  if (/^kimi-auth=?$/i.test(raw)) return '';
  return raw;
}

function inspectKimiAuthPaste(value) {
  const original = typeof value === 'string' ? value : '';
  const trimmed = stripWrapQuotes(original);
  if (!trimmed) return { token: '', error: 'empty paste' };
  if (/^kimi-auth=?$/i.test(trimmed.replace(/['"]/g, '').trim())) {
    return { token: '', error: 'pasted cookie name, need Value' };
  }
  const token = normalizeKimiAuth(original);
  if (!token) return { token: '', error: 'token format invalid' };
  if (token.length < 16) return { token: '', error: 'token too short' };
  return { token, error: '' };
}

function decodeKimiJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    const mid = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - mid.length % 4) % 4);
    return JSON.parse(Buffer.from(mid + pad, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function decodeKimiJwtFlags(token) {
  const payload = decodeKimiJwtPayload(token);
  if (!payload) return { iss: false, app_id: false, exp: null, typ: null };
  return {
    iss: Boolean(payload.iss),
    app_id: payload.app_id !== undefined && payload.app_id !== '',
    exp: Number.isFinite(Number(payload.exp))
      ? new Date(Number(payload.exp) * 1000).toISOString().slice(0, 10)
      : null,
    typ: payload.typ ? String(payload.typ) : null
  };
}

function isKimiWebSession(token, opts = {}) {
  const raw = normalizeKimiAuth(token);
  if (!raw || raw.length < 16) return false;
  const parts = raw.split('.');
  if (parts.length !== 3) return true;
  const payload = decodeKimiJwtPayload(raw);
  if (!payload) return false;
  const scope = String(payload.scope || payload.scp || '').trim();
  if (scope === 'kimi-code' || /^kimi-code(\s|$)/.test(scope)) return false;
  if (!opts.allowExpired) {
    const exp = Number(payload.exp);
    if (Number.isFinite(exp) && exp > 0 && Date.now() / 1000 >= exp) return false;
  }
  return true;
}

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

function fromEnvProcess() {
  for (const name of ENV_NAMES) {
    const token = normalizeKimiAuth(process.env[name]);
    if (isKimiWebSession(token)) return { token, source: `env:${name}` };
  }
  return null;
}

function fromUserEnv() {
  if (process.platform !== 'win32') return null;
  for (const name of ENV_NAMES) {
    if (!/^[A-Z0-9_]+$/i.test(name)) continue;
    const r = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `[Environment]::GetEnvironmentVariable('${name}','User')`
    ], { encoding: 'utf8', timeout: 4000, windowsHide: true });
    const token = normalizeKimiAuth(r.stdout || '');
    if (isKimiWebSession(token)) return { token, source: `user-env:${name}` };
  }
  return null;
}

function fromSecretsFile() {
  const doc = readJson(SECRETS_PATH);
  if (!doc || typeof doc !== 'object') return null;
  for (const key of SECRET_KEYS) {
    const token = normalizeKimiAuth(doc[key]);
    if (isKimiWebSession(token, { allowExpired: true })) return { token, source: 'secrets.json' };
  }
  return null;
}

function fromCookieStores() {
  const r = spawnSync('python', [PY_HELPER], {
    encoding: 'utf8',
    timeout: 12_000,
    windowsHide: true,
    cwd: ROOT
  });
  if (r.status !== 0) return null;
  const line = String(r.stdout || '').trim().split(/\r?\n/).pop();
  if (!line) return null;
  let doc;
  try {
    doc = JSON.parse(line);
  } catch (_) {
    return null;
  }
  const token = normalizeKimiAuth(doc && doc.token);
  if (doc && doc.ok && isKimiWebSession(token)) {
    return { token, source: `store:${doc.source || 'cookie'}` };
  }
  return null;
}

function resolveKimiWebAuth() {
  // secrets.json first: User env KIMI_AUTH_TOKEN is often a stale kimi-code JWT.
  return fromSecretsFile() || fromEnvProcess() || fromCookieStores() || null;
}

module.exports = {
  SECRETS_PATH,
  normalizeKimiAuth,
  inspectKimiAuthPaste,
  decodeKimiJwtPayload,
  decodeKimiJwtFlags,
  isKimiWebSession,
  resolveKimiWebAuth
};
