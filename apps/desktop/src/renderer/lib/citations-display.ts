import type { SourceBlock } from '@omakase/contracts';

/** Human-readable citation label for UI (model still emits [S1] internally). */
export function formatCitationLabel(input: {
  handle: string;
  sourceTitle?: string | null;
  headingPathText?: string | null;
  pageStart?: number | null;
  timeStartMs?: number | null;
  timeEndMs?: number | null;
}): string {
  const title = (input.sourceTitle ?? '').trim() || null;
  const section = (input.headingPathText ?? '').trim() || null;
  const parts: string[] = [];
  if (title) parts.push(shortTitle(title));
  if (section) parts.push(`§${section}`);
  if (input.pageStart != null) parts.push(`p. ${input.pageStart}`);
  if (input.timeStartMs != null) {
    parts.push(formatMsRange(input.timeStartMs, input.timeEndMs));
  }
  if (parts.length === 0) return input.handle;
  return parts.join(', ');
}

export function formatCitationLabelFromBlock(
  handle: string,
  block: Pick<SourceBlock, 'headingPathText' | 'pageStart' | 'timeStartMs' | 'timeEndMs'>,
  sourceTitle?: string | null,
): string {
  return formatCitationLabel({
    handle,
    sourceTitle,
    headingPathText: block.headingPathText,
    pageStart: block.pageStart,
    timeStartMs: block.timeStartMs,
    timeEndMs: block.timeEndMs,
  });
}

/** Strip bare [S1]-style markers from displayed prose (chips carry the links). */
export function stripCitationHandles(markdown: string): string {
  return markdown
    .replace(/\s*\[S\d+\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function citationOrdinal(handle: string): number | null {
  const match = /^S(\d+)$/.exec(handle);
  if (!match) return null;
  return Number(match[1]);
}

export function referenceLabel(handle: string): string {
  const ordinal = citationOrdinal(handle);
  return ordinal == null ? handle : String(ordinal);
}

function shortTitle(title: string): string {
  if (title.length <= 48) return title;
  return `${title.slice(0, 45).trimEnd()}…`;
}

function formatMsRange(start: number, end?: number | null): string {
  const a = formatClock(start);
  if (end == null) return a;
  return `${a}–${formatClock(end)}`;
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
