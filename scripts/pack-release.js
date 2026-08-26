'use strict';

// Build dist/quota-floater.zip. English. Never print secrets.
// Excludes machine-local files. Fails if eyJ / unexpected sk- leak in.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ZIP_NAME = 'quota-floater.zip';
const ZIP_PATH = path.join(DIST, ZIP_NAME);

// GNU tar (MSYS, first on PATH inside Git Bash) treats `C:\...` as a remote
// host spec and fails with "Cannot connect to C:". Windows bsdtar handles it.
const WIN_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const TAR = process.platform === 'win32' && fs.existsSync(WIN_TAR) ? WIN_TAR : 'tar';

const ROOT_FILES = [
  'start.cmd',
  'quota.cmd',
  'collect.js',
  'ui.py',
  'print-table.js',
  'kimi-web-auth.js',
  'kimi-web-auth.py',
  'kimi-auth-wizard.sh',
  'kimi-auth-wizard-io.js',
  'README.md',
  'README.txt',
  'CHANGELOG.md',
  'VERSION',
  'LICENSE',
  'NOTICE',
  '.gitignore'
];

const ROOT_DIRS = ['vendor', 'docs', 'scripts', 'pi-extension', 'skill'];

const BLOCK_NAMES = new Set([
  'secrets.json',
  'snapshot.json',
  'settings.json',
  'ag-endpoint.json',
  'floater.log'
]);

const BLOCK_DIR_NAMES = new Set(['.git', 'node_modules', 'dist', '__pycache__']);

function posixRel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

function isBak(name) {
  return /\.bak($|-)/i.test(name);
}

function blockedPath(abs) {
  const rel = posixRel(ROOT, abs);
  const parts = rel.split('/');
  const base = parts[parts.length - 1];
  if (BLOCK_NAMES.has(base) || isBak(base)) return true;
  return parts.some((p) => BLOCK_DIR_NAMES.has(p));
}

function mustExist(abs, label) {
  if (!fs.existsSync(abs)) {
    process.stderr.write(`pack-release: missing ${label}\n`);
    process.exit(1);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function walkFiles(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (blockedPath(abs)) continue;
    if (ent.isDirectory()) walkFiles(abs, out);
    else if (ent.isFile()) out.push(abs);
  }
}

function stageTree(stage) {
  for (const name of ROOT_FILES) {
    const src = path.join(ROOT, name);
    mustExist(src, name);
    copyFile(src, path.join(stage, name));
  }
  for (const name of ROOT_DIRS) {
    const src = path.join(ROOT, name);
    mustExist(src, name + '/');
    const files = [];
    walkFiles(src, files);
    for (const abs of files) {
      copyFile(abs, path.join(stage, posixRel(ROOT, abs)));
    }
  }
}

// Live tokens only. Bare docs / prefix name sk-or- do not match.
const JWT_LIVE = /eyJ[A-Za-z0-9_-]{20,}\./;
const SK_LIVE = /sk-[A-Za-z0-9]{16,}/;

function scanSecrets(stage) {
  const files = [];
  walkFiles(stage, files);
  const hits = [];
  for (const abs of files) {
    const rel = posixRel(stage, abs);
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (_) {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const n = i + 1;
      if (JWT_LIVE.test(line)) hits.push({ rel, n, kind: 'eyJ-token' });
      if (SK_LIVE.test(line)) hits.push({ rel, n, kind: 'sk-token' });
    });
  }
  if (!hits.length) return;
  for (const h of hits) {
    process.stderr.write(`pack-release: secret-scan ${h.kind} ${h.rel}:${h.n}\n`);
  }
  process.stderr.write('pack-release: refuse zip (live eyJ / sk- token)\n');
  process.exit(1);
}

function zipStage(stage) {
  fs.mkdirSync(DIST, { recursive: true });
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  const tar = spawnSync(TAR, ['-a', '-c', '-f', ZIP_PATH, '-C', stage, '.'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (tar.status !== 0) {
    process.stderr.write(`pack-release: tar failed\n`);
    if (tar.stderr) process.stderr.write(String(tar.stderr).slice(0, 400) + '\n');
    process.exit(1);
  }
}

function listZip() {
  const r = spawnSync(TAR, ['-tf', ZIP_PATH], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (r.status !== 0) {
    process.stderr.write('pack-release: cannot list zip\n');
    process.exit(1);
  }
  return String(r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\.\//, '').replace(/\\/g, '/'));
}

function assertZipMembers(names) {
  const need = [
    'start.cmd',
    'quota.cmd',
    'collect.js',
    'ui.py',
    'LICENSE',
    'NOTICE',
    'docs/AGENT.md',
    'docs/PROVIDERS.md',
    'docs/SETUP.md',
    'docs/RELEASE.md',
    'docs/WIZARD.md',
    'skill/quota-floater/SKILL.md',
    'CHANGELOG.md',
    'VERSION',
    'vendor/tm-shared/LICENSE'
  ];
  for (const n of need) {
    if (!names.includes(n) && !names.includes('./' + n)) {
      process.stderr.write(`pack-release: zip missing ${n}\n`);
      process.exit(1);
    }
  }
  const forbid = /(?:^|\/)(secrets\.json|snapshot\.json|settings\.json|\.git)(?:\/|$)/i;
  const bak = /\.bak($|-|\/)/i;
  for (const n of names) {
    if (forbid.test(n) || bak.test(n)) {
      process.stderr.write(`pack-release: zip has blocked path ${n}\n`);
      process.exit(1);
    }
  }
}

function main() {
  mustExist(path.join(ROOT, 'LICENSE'), 'LICENSE');
  mustExist(path.join(ROOT, 'NOTICE'), 'NOTICE');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-pack-'));
  try {
    stageTree(stage);
    scanSecrets(stage);
    zipStage(stage);
    const names = listZip();
    assertZipMembers(names);
    process.stdout.write(`packed ${ZIP_PATH}\n`);
    process.stdout.write(`files ${names.length}\n`);
    process.stdout.write('secret-scan pass (no live eyJ / sk- tokens)\n');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
