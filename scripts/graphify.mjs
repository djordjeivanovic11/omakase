#!/usr/bin/env node
/**
 * Optional Graphify wrapper (PyPI: graphifyy, CLI: graphify).
 * Never fails the build when Graphify is absent unless --strict is passed.
 *
 * Official flow uses `graphify update <path>` → graphify-out/
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'graphify-out');

const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const strict = args.includes('--strict');

function findGraphify() {
  const direct = spawnSync('graphify', ['--help'], { encoding: 'utf8' });
  if (!direct.error) return { cmd: 'graphify', prefix: [] };
  const uvx = spawnSync('uvx', ['--from', 'graphifyy', 'graphify', '--help'], { encoding: 'utf8' });
  if (!uvx.error) return { cmd: 'uvx', prefix: ['--from', 'graphifyy', 'graphify'] };
  return null;
}

function missing() {
  console.error(`Graphify is optional and not installed.

Install (isolated, recommended):
  uv tool install graphifyy

PyPI package: graphifyy
CLI command: graphify
Docs: docs/development/GRAPHIFY.md
`);
  process.exit(strict ? 1 : 0);
}

function runGraphify(graphifyArgs) {
  const bin = findGraphify();
  if (!bin) missing();
  const result = spawnSync(bin.cmd, [...bin.prefix, ...graphifyArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

switch (command) {
  case 'help':
    console.log(`Usage:
  pnpm graph:build   # graphify update .  → graphify-out/
  pnpm graph:report  # graphify query summary question
  pnpm graph:clean   # remove graphify-out/

Optional. Normal install/test/package succeed without it.
`);
    process.exit(0);
    break;
  case 'build':
    // Code-only extraction; no LLM required for update
    runGraphify(['update', root]);
    break;
  case 'report': {
    if (!existsSync(path.join(outDir, 'graph.json'))) {
      console.error('No graphify-out/graph.json. Run: pnpm graph:build');
      process.exit(strict ? 1 : 0);
    }
    runGraphify([
      'query',
      'Summarize architecture, Electron process boundaries, AI SDK entry points, Probe and ingestion coupling',
      '--graph',
      path.join(outDir, 'graph.json'),
    ]);
    break;
  }
  case 'clean':
    for (const dir of [outDir, path.join(root, '.graphify')]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        console.log(`Removed ${path.relative(root, dir)}/`);
      }
    }
    if (!existsSync(outDir) && !existsSync(path.join(root, '.graphify'))) {
      console.log('Nothing to clean');
    }
    process.exit(0);
    break;
  case 'install-skill':
    runGraphify(['install', '--project', '--platform', 'cursor']);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
