export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export type TranscriptFormat = 'vtt' | 'srt' | 'json' | 'plain';

function parseTimestampToMs(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    const [h, m, rest] = parts as [string, string, string];
    const [s, msPart = '0'] = rest.split('.');
    const hours = Number(h);
    const minutes = Number(m);
    const seconds = Number(s);
    const millis = Number(msPart.padEnd(3, '0').slice(0, 3));
    return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + millis;
  }
  if (parts.length === 2) {
    const [m, rest] = parts as [string, string];
    const [s, msPart = '0'] = rest.split('.');
    const minutes = Number(m);
    const seconds = Number(s);
    const millis = Number(msPart.padEnd(3, '0').slice(0, 3));
    return minutes * 60_000 + seconds * 1_000 + millis;
  }
  const asNumber = Number(normalized);
  if (!Number.isNaN(asNumber)) {
    return asNumber < 10_000 ? Math.round(asNumber * 1000) : Math.round(asNumber);
  }
  return 0;
}

function stripVttTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTranscriptFormat(content: string): TranscriptFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  if (/^WEBVTT/m.test(trimmed)) {
    return 'vtt';
  }
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}/m.test(trimmed)) {
    return 'srt';
  }
  if (/\d{2}:\d{2}:\d{2}[,.]?\d{0,3}\s*-->\s*\d{2}:\d{2}:\d{2}/m.test(trimmed)) {
    return 'vtt';
  }
  return 'plain';
}

export function parseVtt(content: string): TranscriptSegment[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const segments: TranscriptSegment[] = [];
  let i = 0;

  while (i < lines.length && !/^\d{2}:\d{2}:\d{2}/.test(lines[i] ?? '')) {
    i += 1;
  }

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const timingMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?|\d{2}:\d{2}(?:\.\d{1,3})?)\s*-->\s*(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?|\d{2}:\d{2}(?:\.\d{1,3})?)/,
    );
    if (!timingMatch) {
      i += 1;
      continue;
    }

    const startMs = parseTimestampToMs(timingMatch[1] ?? '0');
    const endMs = parseTimestampToMs(timingMatch[2] ?? '0');
    i += 1;

    const textLines: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      textLines.push(stripVttTags(lines[i] ?? ''));
      i += 1;
    }

    const text = textLines.join(' ').trim();
    if (text) {
      segments.push({ startMs, endMs: Math.max(endMs, startMs), text });
    }
    i += 1;
  }

  return segments;
}

export function parseSrt(content: string): TranscriptSegment[] {
  const blocks = content
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const timingLine = lines.find((l) => l.includes('-->'));
    if (!timingLine) continue;
    const timingMatch = timingLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/,
    );
    if (!timingMatch) continue;
    const startMs = parseTimestampToMs(timingMatch[1] ?? '0');
    const endMs = parseTimestampToMs(timingMatch[2] ?? '0');
    const textStart = lines.indexOf(timingLine) + 1;
    const text = lines
      .slice(textStart)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (text) {
      segments.push({ startMs, endMs: Math.max(endMs, startMs), text });
    }
  }

  return segments;
}

export function parseJsonTranscript(content: string): TranscriptSegment[] {
  const parsed = JSON.parse(content) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { segments?: unknown }).segments)
      ? (parsed as { segments: unknown[] }).segments
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { cues?: unknown }).cues)
        ? (parsed as { cues: unknown[] }).cues
        : [];

  const segments: TranscriptSegment[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const text = String(record.text ?? record.content ?? record.body ?? '').trim();
    if (!text) continue;

    const startRaw = record.startMs ?? record.start_ms ?? record.start ?? record.begin;
    const endRaw = record.endMs ?? record.end_ms ?? record.end ?? record.finish;
    const startMs =
      typeof startRaw === 'number'
        ? startRaw < 10_000
          ? Math.round(startRaw * 1000)
          : Math.round(startRaw)
        : parseTimestampToMs(String(startRaw ?? '0'));
    const endMs =
      typeof endRaw === 'number'
        ? endRaw < 10_000
          ? Math.round(endRaw * 1000)
          : Math.round(endRaw)
        : parseTimestampToMs(String(endRaw ?? startMs));

    segments.push({ startMs, endMs: Math.max(endMs, startMs), text });
  }

  return segments;
}

export function parsePlainTranscript(content: string): TranscriptSegment[] {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const segments: TranscriptSegment[] = [];
  let cursorMs = 0;
  const defaultDurationMs = 4_000;

  for (const line of lines) {
    const inlineMatch = line.match(/^(\d{2}:\d{2}:\d{2}(?:[,.]\d{1,3})?)\s+(.+)$/);
    if (inlineMatch) {
      const startMs = parseTimestampToMs(inlineMatch[1] ?? '0');
      const text = (inlineMatch[2] ?? '').trim();
      if (text) {
        segments.push({ startMs, endMs: startMs + defaultDurationMs, text });
        cursorMs = startMs + defaultDurationMs;
      }
      continue;
    }

    segments.push({ startMs: cursorMs, endMs: cursorMs + defaultDurationMs, text: line });
    cursorMs += defaultDurationMs;
  }

  return segments;
}

export function parseTranscript(content: string, format?: TranscriptFormat): TranscriptSegment[] {
  const resolved = format ?? detectTranscriptFormat(content);
  switch (resolved) {
    case 'vtt':
      return parseVtt(content);
    case 'srt':
      return parseSrt(content);
    case 'json':
      return parseJsonTranscript(content);
    case 'plain':
      return parsePlainTranscript(content);
    default:
      return parsePlainTranscript(content);
  }
}
