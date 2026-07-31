import { describe, expect, it } from 'vitest';
import { redactLogLines, redactSecrets } from '../../src/core/security/redact.js';

describe('log redaction', () => {
  it('redacts common API key patterns', () => {
    const input = [
      'Authorization: Bearer sk-test-123456789012345678901234',
      'Using key sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
      'x-api-key: super-secret-value',
    ].join('\n');

    const redacted = redactSecrets(input);
    expect(redacted).not.toContain('sk-test-123456789012345678901234');
    expect(redacted).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('super-secret-value');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts line arrays for diagnostics previews', () => {
    const lines = redactLogLines(['api_key=sk-or-v1-abcdefghijklmnopqrstuvwxyz']);
    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[0]).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
  });
});
