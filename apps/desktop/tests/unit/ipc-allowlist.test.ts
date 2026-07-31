import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IpcChannels } from '@omakase/contracts';
import { describe, expect, it } from 'vitest';

const preloadPath = path.resolve(__dirname, '../../src/preload/preload.ts');
const ipcPath = path.resolve(__dirname, '../../src/main/ipc.ts');

describe('preload / IPC allowlist', () => {
  it('exposes only named API methods (no generic invoke bridge)', () => {
    const preload = readFileSync(preloadPath, 'utf8');
    expect(preload).toContain('contextBridge.exposeInMainWorld');
    expect(preload).not.toMatch(/exposeInMainWorld\([^,]+,\s*ipcRenderer\)/);
    expect(preload).not.toContain('invoke: ipcRenderer.invoke');
    expect(preload).not.toContain('send: ipcRenderer.send');
    // Every invoke goes through IpcChannels constants
    const invokeCalls = [...preload.matchAll(/invoke\((IpcChannels\.\w+)/g)].map((m) => m[1]);
    expect(invokeCalls.length).toBeGreaterThan(10);
    for (const call of invokeCalls) {
      expect(call?.startsWith('IpcChannels.')).toBe(true);
    }
  });

  it('registers handlers only for known IpcChannels values', () => {
    const ipc = readFileSync(ipcPath, 'utf8');
    const allowed = new Set(Object.values(IpcChannels));
    const handles = [...ipc.matchAll(/handle\(IpcChannels\.(\w+)/g)].map((m) => m[1]!);
    expect(handles.length).toBeGreaterThan(20);
    for (const name of handles) {
      const value = IpcChannels[name as keyof typeof IpcChannels];
      expect(allowed.has(value), `unknown channel key ${name}`).toBe(true);
    }
    // No stringly-typed shell/exec escape hatches
    expect(ipc).not.toMatch(/handle\(['"]shell:exec['"]/);
    expect(ipc).not.toMatch(/handle\(['"]sql:run['"]/);
  });
});
