import { describe, expect, it } from 'vitest';
import { Sha256HexSchema, UuidV7Schema } from './ids.js';

describe('UuidV7Schema', () => {
  it('accepts a valid UUIDv7', () => {
    expect(UuidV7Schema.parse('018f3c8a-7b2e-7c3d-8e9f-0123456789ab')).toBeTruthy();
  });

  it('rejects UUIDv4', () => {
    expect(() => UuidV7Schema.parse('550e8400-e29b-41d4-a716-446655440000')).toThrow();
  });
});

describe('Sha256HexSchema', () => {
  it('accepts 64 hex chars', () => {
    expect(Sha256HexSchema.parse('a'.repeat(64))).toHaveLength(64);
  });

  it('rejects short digests', () => {
    expect(() => Sha256HexSchema.parse('abc')).toThrow();
  });
});
