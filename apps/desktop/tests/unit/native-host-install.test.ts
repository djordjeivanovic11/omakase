import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAllowedExtensionId,
  readAllowedExtensionIds,
  saveAllowedExtensionIds,
} from '../../src/core/extension/native-host-install.js';

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('native host extension allowlist', () => {
  it('persists and reloads allowed extension ids', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-native-'));
    temps.push(root);
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    const saved = addAllowedExtensionId(root, id);
    expect(saved).toEqual([id]);
    expect(readAllowedExtensionIds(root)).toEqual([id]);
  });

  it('rejects non-chrome extension id shapes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-native-'));
    temps.push(root);
    expect(() => addAllowedExtensionId(root, 'not-an-id')).toThrow(/32-character/i);
    expect(() => addAllowedExtensionId(root, 'zzzabcdefghijklmnopqrstuvwxyzabc')).toThrow(
      /32-character/i,
    );
    expect(readAllowedExtensionIds(root)).toEqual([]);
  });

  it('deduplicates ids', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-native-'));
    temps.push(root);
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    saveAllowedExtensionIds(root, [id, id]);
    expect(readAllowedExtensionIds(root)).toEqual([id]);
  });
});
