#!/usr/bin/env node
/**
 * Lightweight environment validation for contributors.
 * Exits non-zero with a clear message when the toolchain is wrong.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

const nvmrc = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
const majorRequired = Number.parseInt(nvmrc.split('.')[0] ?? '24', 10);
const majorActual = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

if (Number.isNaN(majorActual) || majorActual < majorRequired) {
  fail(
    `Node.js ${majorRequired}+ is required (found ${process.version}).\n` +
      `  Hint: nvm use && corepack enable`,
  );
}
ok(`Node.js ${process.version}`);

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const pmField = String(rootPkg.packageManager ?? '');
const [, pnpmWanted] = pmField.match(/^pnpm@(.+)$/) ?? [];

let pnpmVersion = null;
try {
  pnpmVersion = require('node:child_process')
    .execSync('pnpm --version', { encoding: 'utf8' })
    .trim();
} catch {
  fail('pnpm is not available. Run: corepack enable && corepack prepare pnpm@10.14.0 --activate');
}

if (pnpmWanted && !pnpmVersion.startsWith(pnpmWanted.split('.')[0])) {
  console.warn(
    `! pnpm ${pnpmVersion} differs from packageManager ${pnpmWanted} — Corepack is recommended`,
  );
} else {
  ok(`pnpm ${pnpmVersion}`);
}

try {
  readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  ok('pnpm-lock.yaml present');
} catch {
  fail('pnpm-lock.yaml missing — clone may be incomplete');
}

console.log('\nEnvironment looks good. Next: pnpm install && pnpm dev\n');
