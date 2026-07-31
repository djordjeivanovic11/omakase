export type SniffedKind = 'pdf' | 'markdown' | 'text' | 'unknown';

export interface SniffResult {
  kind: SniffedKind;
  mediaType: string;
  confidence: number;
}

const PDF_MAGIC = Buffer.from('%PDF');

function isValidUtf8(bytes: Buffer): boolean {
  try {
    const decoded = bytes.toString('utf8');
    return !decoded.includes('\uFFFD');
  } catch {
    return false;
  }
}

function looksLikeMarkdown(content: string): boolean {
  const lines = content.split('\n').slice(0, 200);
  let signals = 0;

  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) signals += 2;
    if (/^[-*+]\s+\S/.test(line)) signals += 1;
    if (/^\d+[.)]\s+\S/.test(line)) signals += 1;
    if (/^(`{3,}|~{3,})/.test(line)) signals += 2;
    if (/\[[^\]]+\]\([^)]+\)/.test(line)) signals += 1;
    if (/^>\s+\S/.test(line)) signals += 1;
  }

  return signals >= 2;
}

export function sniffBytes(bytes: Buffer, filename?: string | null): SniffResult {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(PDF_MAGIC)) {
    return { kind: 'pdf', mediaType: 'application/pdf', confidence: 1 };
  }

  if (!isValidUtf8(bytes)) {
    return { kind: 'unknown', mediaType: 'application/octet-stream', confidence: 0 };
  }

  const text = bytes.toString('utf8');
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { kind: 'text', mediaType: 'text/plain', confidence: 0.5 };
  }

  if (looksLikeMarkdown(text)) {
    return { kind: 'markdown', mediaType: 'text/markdown', confidence: 0.9 };
  }

  const lowerName = filename?.toLowerCase() ?? '';
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return { kind: 'markdown', mediaType: 'text/markdown', confidence: 0.7 };
  }

  return { kind: 'text', mediaType: 'text/plain', confidence: 0.8 };
}

export function sniffFilePath(filePath: string, bytes: Buffer): SniffResult {
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  return sniffBytes(bytes, name);
}
