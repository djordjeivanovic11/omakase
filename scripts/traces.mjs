#!/usr/bin/env node
/**
 * Local developer AI trace inspector.
 * Traces live outside the repo by default (~/.omakase/dev-traces).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const command = process.argv[2] ?? 'inspect';
const tracesDir =
  process.env.OMAKASE_TRACES_DIR ?? path.join(os.homedir(), '.omakase', 'dev-traces');

function ensureDir() {
  mkdirSync(tracesDir, { recursive: true });
}

function listTraces() {
  if (!existsSync(tracesDir)) return [];
  return readdirSync(tracesDir)
    .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'))
    .map((f) => {
      const full = path.join(tracesDir, f);
      const st = statSync(full);
      return { name: f, path: full, mtime: st.mtimeMs, size: st.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function redactLine(line) {
  return line
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, 'sk-[REDACTED]')
    .replace(/(Bearer\s+)\S+/gi, 'Bearer [REDACTED]');
}

function inspect() {
  ensureDir();
  const traces = listTraces();
  console.log(`Trace directory: ${tracesDir}`);
  if (traces.length === 0) {
    console.log('No traces yet. Enable with OMAKASE_AI_TRACES=1 while running the app/tests.');
    return 0;
  }
  const latest = traces[0];
  console.log(`Latest: ${latest.name} (${latest.size} bytes)`);
  const content = readFileSync(latest.path, 'utf8');
  const lines = content.trim().split('\n').slice(-40);
  for (const line of lines) {
    console.log(redactLine(line));
  }
  console.log(`\n${traces.length} file(s) total.`);
  return 0;
}

function clear() {
  if (existsSync(tracesDir)) {
    rmSync(tracesDir, { recursive: true, force: true });
    console.log(`Cleared ${tracesDir}`);
  } else {
    console.log('Nothing to clear.');
  }
  return 0;
}

let code = 0;
if (command === 'inspect') code = inspect();
else if (command === 'clear') code = clear();
else if (command === 'path') {
  console.log(tracesDir);
  code = 0;
} else {
  console.error('Usage: pnpm traces:inspect | pnpm traces:clear');
  code = 1;
}
process.exit(code);
