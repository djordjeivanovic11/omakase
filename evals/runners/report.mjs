#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const latest = path.join(root, 'evals/reports/deterministic-latest.json');
if (!existsSync(latest)) {
  console.error('No report yet. Run: pnpm eval:deterministic');
  process.exit(1);
}
console.log(latest);
process.exit(0);
