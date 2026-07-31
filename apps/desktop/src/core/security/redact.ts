const API_KEY_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g,
  /\bsk-or-[A-Za-z0-9\-_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
  /\bAuthorization:\s*[^\s\n\r]+/gi,
  /\bapi[_-]?key["'\s:=]+["']?[A-Za-z0-9\-_]{16,}/gi,
  /\bx-api-key:\s*[^\s\n\r]+/gi,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of API_KEY_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (/^Bearer\s+/i.test(match)) return 'Bearer [REDACTED]';
      if (/^Authorization:/i.test(match)) return 'Authorization: [REDACTED]';
      if (/^x-api-key:/i.test(match)) return 'x-api-key: [REDACTED]';
      if (/api[_-]?key/i.test(match)) {
        const idx = match.search(/[:=]/);
        if (idx >= 0) {
          return `${match.slice(0, idx + 1)} [REDACTED]`;
        }
      }
      return '[REDACTED]';
    });
  }
  return result;
}

export function redactLogLines(lines: string[]): string[] {
  return lines.map(redactSecrets);
}
