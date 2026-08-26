'use strict';

// Extracted from Token Monitor limitCollector.js (MIT). Do not invent a new protocol.
// DeepSeek exposes a PAYG balance, not rate-limit windows.

const { normalizeLimitProvider } = require('./limits');

const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';
const DEEPSEEK_KEY_NAMES = ['DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'];

function cleanSecret(value) {
  let raw = value;
  if (typeof raw !== 'string') return '';
  raw = raw.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  return raw;
}

function deepseekToken(env = process.env, explicitKey = '') {
  const explicit = cleanSecret(explicitKey);
  if (explicit) return explicit;
  for (const name of DEEPSEEK_KEY_NAMES) {
    const raw = cleanSecret(env[name]);
    if (raw) return raw;
  }
  return '';
}

function errorWithStatus(status, message) {
  const error = new Error(message || status);
  error.status = status;
  return error;
}

function providerStatusFromError(error) {
  const status = error && error.status;
  if (status === 'unauthorized' || status === 'sourceRateLimited' || status === 'unavailable') return status;
  return 'unavailable';
}

function selectFundedRow(rows) {
  const parsed = [];
  for (const row of rows || []) {
    const amount = Number(row && row.total_balance);
    const paid = Number(row && row.topped_up_balance);
    const currency = String((row && row.currency) || '').trim().toUpperCase();
    if (!Number.isFinite(amount) || !Number.isFinite(paid) || !currency) continue;
    parsed.push({ currency, amount, paid });
  }
  if (parsed.length === 0) throw errorWithStatus('unavailable', 'no usable balance rows');
  const funded = parsed
    .filter((r) => r.amount > 0)
    .sort((a, b) => (b.amount - a.amount) || (a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : 0));
  if (funded.length) return funded[0];
  return parsed.find((r) => r.currency === 'USD') || parsed[0];
}

async function fetchJson(url, headers, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const timeoutMs = Number(deps.fetchTimeoutMs || 12000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchFn(url, {
      headers,
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403
        ? 'unauthorized'
        : response.status === 429 ? 'sourceRateLimited' : 'unavailable';
      throw errorWithStatus(status, `${url} returned ${response.status}`);
    }
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchDeepSeekLimits(options = {}, deps = {}) {
  const env = deps.env || process.env;
  const now = (deps.now || Date.now)();
  const key = deepseekToken(env, options.deepseekApiKey);
  if (!key) {
    return normalizeLimitProvider({
      provider: 'deepseek',
      source: 'api',
      status: 'notConfigured',
      updatedAt: new Date(now).toISOString(),
      windows: []
    });
  }
  try {
    const data = await fetchJson(DEEPSEEK_BALANCE_URL, {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }, deps);
    if (!data || !Array.isArray(data.balance_infos)) {
      throw errorWithStatus('unavailable', 'unexpected balance response shape');
    }
    const row = selectFundedRow(data.balance_infos);
    return normalizeLimitProvider({
      provider: 'deepseek',
      accountLabel: 'Pay-as-you-go',
      source: 'api',
      status: 'ok',
      updatedAt: new Date(now).toISOString(),
      windows: [{
        kind: 'billing',
        metric: 'credits',
        label: 'Balance',
        remaining: row.amount,
        currency: row.currency
      }],
      balance: {
        amount: row.amount,
        currency: row.currency
      }
    });
  } catch (error) {
    return normalizeLimitProvider({
      provider: 'deepseek',
      source: 'api',
      status: providerStatusFromError(error),
      updatedAt: new Date(now).toISOString(),
      windows: []
    });
  }
}

module.exports = {
  DEEPSEEK_BALANCE_URL,
  deepseekToken,
  fetchDeepSeekLimits,
  selectFundedRow
};
