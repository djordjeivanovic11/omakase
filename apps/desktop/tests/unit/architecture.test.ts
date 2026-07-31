import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(desktopRoot, 'src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(re)) out.push(match[1]!);
  return out;
}

describe('architecture boundaries', () => {
  it('renderer does not import Electron main internals or Node builtins', () => {
    const rendererFiles = walk(path.join(srcRoot, 'renderer'));
    const forbidden = [
      /electron/,
      /better-sqlite3/,
      /node:fs/,
      /node:child_process/,
      /node:net/,
      /\.\.\/main\//,
      /\.\.\/core\/storage\/database/,
      /\.\.\/core\/providers\//,
    ];
    for (const file of rendererFiles) {
      for (const imp of importsOf(file)) {
        for (const pattern of forbidden) {
          expect(imp, `${path.relative(desktopRoot, file)} imports ${imp}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('core learning code does not import UI components', () => {
    const learningFiles = walk(path.join(srcRoot, 'core/learning'));
    for (const file of learningFiles) {
      for (const imp of importsOf(file)) {
        expect(imp, `${file} -> ${imp}`).not.toMatch(/renderer|components|\.tsx$/);
      }
    }
  });

  it('provider adapters do not import database module directly', () => {
    const providerFiles = walk(path.join(srcRoot, 'core/providers'));
    for (const file of providerFiles) {
      for (const imp of importsOf(file)) {
        expect(imp, `${file} -> ${imp}`).not.toMatch(/storage\/database/);
      }
    }
  });
});
