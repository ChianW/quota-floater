'use strict';

// Print snapshot.json as a quota table. No secrets.
// Used by quota.cmd. Does not probe; call collect.js first.

const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_PATH = path.join(__dirname, 'snapshot.json');

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

function pad(s, n) {
  const t = String(s ?? '');
  if (t.length >= n) return t.slice(0, n);
  return t + ' '.repeat(n - t.length);
}

function pct(n) {
  return typeof n === 'number' && Number.isFinite(n) ? `${n}%` : '-';
}

function fmtReset(iso) {
  if (!iso || typeof iso !== 'string') return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function poolName(provider, window) {
  const id = provider.id || '';
  const label = String((window && window.label) || '');
  if (id === 'antigravity') {
    if (label.includes('Claude') || label.includes('GPT')) return 'Claude/GPT';
    if (label.includes('Gemini')) return 'Gemini';
    return 'Antigravity';
  }
  if (id === 'zai') return 'GLM';
  return provider.plan || provider.name || id || '?';
}

function pickWindow(windows, kind) {
  return (windows || []).find((w) => w && w.kind === kind) || null;
}

function rowsFromProvider(p) {
  const windows = Array.isArray(p.windows) ? p.windows : [];
  if (p.id === 'antigravity') {
    const groups = new Map();
    for (const w of windows) {
      const model = poolName(p, w);
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(w);
    }
    if (groups.size) {
      return [...groups.entries()].map(([model, ws]) => ({
        platform: p.name || p.id,
        model,
        session: pickWindow(ws, 'session'),
        weekly: pickWindow(ws, 'weekly'),
        monthly: pickWindow(ws, 'billing') || pickWindow(ws, 'monthly'),
        usage: p.usage || '-',
        status: p.status || ''
      }));
    }
  }
  return [{
    platform: p.name || p.id,
    model: p.plan || poolName(p, windows[0]),
    session: pickWindow(windows, 'session'),
    weekly: pickWindow(windows, 'weekly'),
    monthly: pickWindow(windows, 'billing') || pickWindow(windows, 'monthly'),
    usage: p.usage || (p.note ? String(p.note) : '-'),
    status: p.status || ''
  }];
}

function main() {
  const snap = readJson(SNAPSHOT_PATH);
  if (!snap || !Array.isArray(snap.providers)) {
    process.stderr.write('no snapshot.json — run collect.js first\n');
    process.exit(1);
  }
  const rows = [];
  for (const p of snap.providers) {
    if (!p) continue;
    rows.push(...rowsFromProvider(p));
  }
  const header = [
    pad('PLATFORM', 12),
    pad('MODEL', 16),
    pad('5H', 8),
    pad('WEEK', 8),
    pad('MONTH', 8),
    pad('RESET', 14),
    'USAGE'
  ].join(' ');
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${'-'.repeat(80)}\n`);
  for (const r of rows) {
    const resets = [r.session, r.weekly, r.monthly]
      .map((w) => w && w.resetsAt)
      .filter(Boolean);
    const reset = resets.length ? fmtReset(resets[0]) : '-';
    const line = [
      pad(r.platform, 12),
      pad(r.model, 16),
      pad(pct(r.session && r.session.remainPct), 8),
      pad(pct(r.weekly && r.weekly.remainPct), 8),
      pad(pct(r.monthly && r.monthly.remainPct), 8),
      pad(reset, 14),
      r.usage || '-'
    ].join(' ');
    process.stdout.write(`${line}\n`);
  }
  const age = snap.updatedAt ? ` updated ${snap.updatedAt}` : '';
  const elapsed = snap.elapsedMs != null ? ` probe ${snap.elapsedMs}ms` : '';
  process.stdout.write(`${'-'.repeat(80)}\n`);
  process.stdout.write(`${rows.length} rows${elapsed}${age}\n`);
}

main();
