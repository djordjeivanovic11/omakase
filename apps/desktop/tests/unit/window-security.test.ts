import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BrowserWindow security configuration', () => {
  it('keeps renderer sandboxed without Node integration', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/main/window.ts'), 'utf8');
    expect(source).toMatch(/nodeIntegration:\s*false/);
    expect(source).toMatch(/contextIsolation:\s*true/);
    expect(source).toMatch(/sandbox:\s*true/);
    expect(source).toMatch(/webSecurity:\s*true/);
  });

  it('defines a restrictive CSP', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/main/window.ts'), 'utf8');
    expect(source).toContain("default-src 'self'");
    expect(source).toContain("object-src 'none'");
    expect(source).toContain("frame-src 'none'");
  });
});
