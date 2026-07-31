import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeTextForHash, sha256File, sha256Hex } from '../../src/core/storage/hash.js';

describe('sha256 helpers', () => {
  it('hashes strings deterministically', () => {
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
  });

  it('hashes buffers and files consistently', () => {
    const bytes = Buffer.from('fixture');
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);

    const filePath = path.join(os.tmpdir(), `omakase-hash-${Date.now()}.txt`);
    fs.writeFileSync(filePath, bytes);
    try {
      expect(sha256File(filePath)).toBe(sha256Hex(bytes));
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('normalizes text before hashing', () => {
    const a = normalizeTextForHash('line one\r\nline two\r\n');
    const b = normalizeTextForHash('line one\nline two');
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });
});
