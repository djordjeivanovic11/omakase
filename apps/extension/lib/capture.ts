import type { BrowserCapturePayload } from '@omakase/contracts';
import Defuddle from 'defuddle/full';
import { uuidv7 } from 'uuidv7';

export interface PageExtractInput {
  includeSelection: boolean;
  userNote?: string;
  destination: 'inbox' | 'studio';
  studioId?: string;
}

export interface PageExtractResult {
  payload: Omit<BrowserCapturePayload, 'externalRequestId'> & {
    externalRequestId?: string;
  };
  pageUrl: string;
  pageTitle: string;
}

function parsePublishedAt(published?: string): number | undefined {
  if (!published?.trim()) return undefined;
  const ms = Date.parse(published);
  return Number.isNaN(ms) ? undefined : ms;
}

function readSelection(): string | undefined {
  const text = window.getSelection()?.toString().trim();
  return text ? text : undefined;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeTextForHash(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').trim();
}

export async function extractPageCapture(input: PageExtractInput): Promise<PageExtractResult> {
  const pageUrl = window.location.href;
  const defuddle = new Defuddle(document, {
    url: pageUrl,
    markdown: true,
    useAsync: false,
  });
  const result = defuddle.parse();

  const markdown = (result.contentMarkdown ?? result.content ?? '').trim();
  if (!markdown) {
    throw new Error('No extractable page content found.');
  }

  const title = (result.title || document.title || pageUrl).trim();
  const selection = input.includeSelection ? readSelection() : undefined;
  const normalized = normalizeTextForHash(markdown);
  const contentHash = await sha256Hex(normalized);

  const payload: PageExtractResult['payload'] = {
    url: pageUrl,
    finalUrl: pageUrl,
    title,
    author: result.author?.trim() || undefined,
    publishedAt: parsePublishedAt(result.published),
    markdown,
    selection,
    userNote: input.userNote?.trim() || undefined,
    destination: input.destination,
    studioId: input.destination === 'studio' ? input.studioId : undefined,
    contentHash,
  };

  return {
    payload,
    pageUrl,
    pageTitle: title,
  };
}

export function finalizeCapturePayload(
  partial: PageExtractResult['payload'],
): BrowserCapturePayload {
  return {
    externalRequestId: partial.externalRequestId ?? uuidv7(),
    url: partial.url,
    finalUrl: partial.finalUrl,
    title: partial.title,
    author: partial.author,
    publishedAt: partial.publishedAt,
    markdown: partial.markdown,
    selection: partial.selection,
    userNote: partial.userNote,
    destination: partial.destination ?? 'inbox',
    studioId: partial.studioId,
    contentHash: partial.contentHash,
  };
}
