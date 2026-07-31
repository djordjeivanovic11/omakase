import { describe, expect, it } from 'vitest';
import { isBlockedIp, validateHttpUrl } from '../../src/core/security/url-policy.js';

describe('url-policy', () => {
  it('accepts public https URLs', () => {
    const result = validateHttpUrl('https://example.com/article');
    expect(result.ok).toBe(true);
    expect(result.url?.hostname).toBe('example.com');
  });

  it('rejects non-http schemes', () => {
    expect(validateHttpUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateHttpUrl('ftp://example.com').reason).toBe('scheme_not_allowed');
  });

  it('rejects embedded credentials', () => {
    expect(validateHttpUrl('https://user:pass@example.com').reason).toBe('embedded_credentials');
  });

  it('blocks localhost and metadata hostnames', () => {
    expect(validateHttpUrl('http://localhost/admin').reason).toBe('blocked_hostname');
    expect(validateHttpUrl('https://metadata.google.internal').reason).toBe('blocked_hostname');
  });

  it('blocks private IPv4 ranges', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('192.168.1.10')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
  });

  it('blocks numeric and hex hostname encodings', () => {
    expect(validateHttpUrl('http://2130706433').ok).toBe(false);
    expect(validateHttpUrl('http://host0x7f000001.example').reason).toBe('blocked_ip_encoding');
  });
});
