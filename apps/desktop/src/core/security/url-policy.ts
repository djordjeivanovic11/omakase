import { isIP } from 'node:net';
import { URL } from 'node:url';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'metadata.aws.internal',
]);

export interface UrlPolicyResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function validateHttpUrl(raw: string): UrlPolicyResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme_not_allowed' };
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'embedded_credentials' };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'blocked_hostname' };
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { ok: false, reason: 'blocked_hostname' };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion && isBlockedIp(hostname)) {
    return { ok: false, reason: 'blocked_ip' };
  }

  // Hostname that looks like a decimal/hex IP encoding
  if (/^\d+$/.test(hostname) || hostname.includes('0x')) {
    return { ok: false, reason: 'blocked_ip_encoding' };
  }

  return { ok: true, url };
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    if (normalized.startsWith('fe80')) return true; // link-local
    if (normalized.startsWith('ff')) return true; // multicast
    // IPv4-mapped
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (isIP(mapped) === 4) return isBlockedIp(mapped);
    }
    return false;
  }
  return true;
}

export const FETCH_LIMITS = {
  maxRedirects: 5,
  timeoutMs: 30_000,
  maxBytes: 50 * 1024 * 1024,
} as const;
