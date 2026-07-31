#!/usr/bin/env node
/**
 * pnpm run doctor — contributor environment diagnostics.
 *
 * Distinguishes required failures, optional missing tools, and informational tips.
 * Never prints API-key values.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const REQUIRED = [];
const OPTIONAL = [];
const INFO = [];
let failed = false;

function redact(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, 'sk-[REDACTED]')
    .replace(/(api[_-]?key\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/(ghp_[A-Za-z0-9]{10,})/g, 'ghp_[REDACTED]')
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, 'xox-[REDACTED]');
}

function ok(msg) {
  REQUIRED.push(`✓ ${msg}`);
}
function reqFail(msg) {
  failed = true;
  REQUIRED.push(`✗ ${msg}`);
}
function optional(msg, present) {
  OPTIONAL.push(present ? `✓ ${msg}` : `○ ${msg}`);
}
function info(msg) {
  INFO.push(`· ${msg}`);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (_error) {
    return null;
  }
}

function section(title) {
  console.log(`\n## ${title}`);
}

// --- Node ---
const nvmrc = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
const majorRequired = Number.parseInt(nvmrc.split('.')[0] ?? '24', 10);
const majorActual = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (Number.isNaN(majorActual) || majorActual < majorRequired) {
  reqFail(
    `Node.js ${majorRequired}+ required (found ${process.version}). Hint: nvm use && corepack enable`,
  );
} else {
  ok(`Node.js ${process.version} (pin ${nvmrc}; AI SDK 7 needs ≥22, repo pins ≥${majorRequired})`);
}

// --- pnpm ---
const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const pmField = String(rootPkg.packageManager ?? '');
const [, pnpmWanted] = pmField.match(/^pnpm@(.+)$/) ?? [];
const pnpmVersion = run('pnpm --version');
if (!pnpmVersion) {
  reqFail(
    `pnpm missing. Run: corepack enable && corepack prepare ${pmField || 'pnpm@10.14.0'} --activate`,
  );
} else if (pnpmWanted && pnpmVersion !== pnpmWanted) {
  info(`pnpm ${pnpmVersion} (packageManager wants ${pnpmWanted}; Corepack recommended)`);
  ok(`pnpm ${pnpmVersion} available`);
} else {
  ok(`pnpm ${pnpmVersion}`);
}

// --- lockfile / workspace ---
if (existsSync(path.join(root, 'pnpm-lock.yaml'))) {
  ok('pnpm-lock.yaml present (single lockfile)');
} else {
  reqFail('pnpm-lock.yaml missing');
}
if (existsSync(path.join(root, 'pnpm-workspace.yaml'))) {
  ok('pnpm-workspace.yaml present');
} else {
  reqFail('pnpm-workspace.yaml missing');
}
if (existsSync(path.join(root, 'node_modules'))) {
  ok('workspace node_modules present');
} else {
  reqFail('node_modules missing — run: pnpm install');
}

// --- AI SDK duplicate major check ---
try {
  const aiPkg = require(path.join(root, 'node_modules/ai/package.json'));
  ok(`ai package ${aiPkg.version}`);
  const lock = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  const _majors = new Set(
    [...lock.matchAll(/ai@(\d+)\./g)].map((m) => m[1]).filter((m) => m !== '0'),
  );
  // Filter noise: provider packages also match poorly; check direct ai@ lines
  const aiMajors = new Set([...lock.matchAll(/(?:^|\s)ai@(\d+)\./gm)].map((m) => m[1]));
  if (aiMajors.size > 1) {
    reqFail(`Multiple AI SDK major versions in lockfile: ${[...aiMajors].join(', ')}`);
  } else if (aiPkg.version.startsWith('7.')) {
    ok('Single AI SDK 7 major in use');
  } else {
    info(`ai package major is ${aiPkg.version} (expected 7.x)`);
  }
} catch {
  info('ai package not resolvable yet (install may be incomplete)');
}

// --- Native Electron / SQLite ---
const betterSqlite = path.join(root, 'node_modules/better-sqlite3');
if (existsSync(betterSqlite)) {
  ok('better-sqlite3 installed');
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);');
    const row = db.prepare('SELECT id FROM t').get();
    db.close();
    if (row?.id === 1) ok('SQLite in-memory open/query works');
    else reqFail('SQLite query returned unexpected result');
  } catch (error) {
    reqFail(
      `SQLite/native module failed: ${redact(error instanceof Error ? error.message : String(error))}`,
    );
  }
} else {
  reqFail('better-sqlite3 missing — run pnpm install');
}

const electronPath = path.join(root, 'node_modules/electron');
if (existsSync(electronPath)) {
  ok('electron package present');
} else {
  reqFail('electron missing — run pnpm install');
}

// --- Bundled assets / embeddings ---
const modelManifest = path.join(root, 'apps/desktop/resources/models/manifest.json');
if (existsSync(modelManifest)) {
  ok(`embedding model manifest present (${path.relative(root, modelManifest)})`);
  try {
    const manifest = JSON.parse(readFileSync(modelManifest, 'utf8'));
    info(`model manifest id=${manifest.id ?? manifest.modelId ?? 'unknown'} (local ONNX required)`);
  } catch {
    info('model manifest unreadable');
  }
} else {
  info(
    'embedding model manifest not found — source embedding will fail until model files are fetched',
  );
}

// --- Production build prerequisites ---
const forgeConfig = path.join(root, 'apps/desktop/forge.config.ts');
const desktopPkg = path.join(root, 'apps/desktop/package.json');
if (existsSync(forgeConfig) && existsSync(desktopPkg)) {
  ok('desktop Forge config + package.json present');
} else {
  reqFail('desktop packaging config incomplete');
}

// --- Optional Graphify ---
const graphify = run('graphify --version') ?? run('uvx graphifyy --version');
optional(
  graphify
    ? `Graphify available (${redact(graphify.split('\n')[0])})`
    : 'Graphify not installed (optional). See docs/development/GRAPHIFY.md — uv tool install graphifyy',
  Boolean(graphify),
);

// --- Optional Context7 / Playwright MCP (config presence only) ---
const mcpExample = path.join(root, 'docs/development/mcp.example.json');
const cursorMcp = path.join(root, '.cursor/mcp.json');
optional(
  existsSync(cursorMcp)
    ? 'Cursor MCP config present (.cursor/mcp.json) — keep keys out of git'
    : 'Context7 / Playwright MCP not configured locally (optional). See docs/development/AI_ENGINEERING_QUICKSTART.md',
  existsSync(cursorMcp),
);
if (existsSync(mcpExample)) {
  info('MCP example config: docs/development/mcp.example.json');
}

// --- Git state ---
const gitDir = path.join(root, '.git');
if (existsSync(gitDir)) {
  ok('Git repository detected');
  const status = run('git status --porcelain');
  if (status === null) {
    info('git status unavailable');
  } else if (status.length === 0) {
    info('working tree clean');
  } else {
    info(`working tree has ${status.split('\n').filter(Boolean).length} changed paths`);
  }
} else {
  info('not a git checkout');
}

// --- Unsafe env / secret file scan (names only, never values) ---
const suspiciousNames = ['.env', '.env.local', '.env.production', 'credentials.json', '.secrets'];
const foundEnv = [];
for (const name of suspiciousNames) {
  const p = path.join(root, name);
  if (existsSync(p) && name !== '.env.example') {
    foundEnv.push(name);
  }
}
// scan shallow for committed-looking secret files tracked by git
const trackedSecrets = run(
  "git ls-files '*.pem' '*.key' '.env' '.env.*' '**/credentials.json' 2>/dev/null || true",
);
if (trackedSecrets) {
  const lines = trackedSecrets
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith('.example') && !l.includes('.env.example'));
  if (lines.length) {
    reqFail(`Tracked sensitive-looking paths: ${lines.join(', ')}`);
  } else {
    ok('No tracked .pem/.key/.env credential files');
  }
} else {
  ok('No tracked credential-like files detected');
}
if (foundEnv.length) {
  info(`Local env files present (ok if gitignored): ${foundEnv.join(', ')} — values never printed`);
}

// Check process env for keys without printing values
const envKeyNames = Object.keys(process.env).filter((k) =>
  /API_KEY|SECRET|TOKEN|PASSWORD|OPENAI|ANTHROPIC|OPENROUTER|LANGFUSE/i.test(k),
);
if (envKeyNames.length) {
  info(`Sensitive-looking env vars set (names only): ${envKeyNames.join(', ')}`);
} else {
  info('No provider API key env vars detected in this shell (mock provider OK)');
}

// --- Print report ---
section('Required');
for (const line of REQUIRED) console.log(line);
section('Optional');
for (const line of OPTIONAL) console.log(line);
section('Info');
for (const line of INFO) console.log(line);

console.log('');
if (failed) {
  console.error('Doctor result: REQUIRED checks failed. Fix the ✗ items above.\n');
  process.exit(1);
}
console.log('Doctor result: OK — required toolchain looks healthy.\n');
console.log('Next: pnpm install && pnpm dev');
console.log('Full gate: pnpm verify\n');
process.exit(0);
