import type { CitationProposal } from '@omakase/contracts';

export interface CitationContextBlock {
  handle: string;
  sourceBlockId: number;
  locatorJson: string;
}

export interface ValidatedCitation {
  handle: string;
  sourceBlockId: number;
  claimSummary: string;
  locatorSnapshotJson: string;
  verificationStatus: 'verified' | 'invalid_handle' | 'missing_block';
}

export interface CitationValidationResult {
  validated: ValidatedCitation[];
  rejected: Array<{ proposal: CitationProposal; reason: string }>;
}

/**
 * Maps opaque handles to block IDs supplied in context. Fail-closed:
 * unknown handles are rejected, never guessed.
 */
export function validateCitationProposals(
  proposals: CitationProposal[],
  contextBlocks: CitationContextBlock[],
): CitationValidationResult {
  const handleMap = new Map(contextBlocks.map((b) => [b.handle, b]));
  const validated: ValidatedCitation[] = [];
  const rejected: Array<{ proposal: CitationProposal; reason: string }> = [];

  for (const proposal of proposals) {
    const block = handleMap.get(proposal.handle);
    if (!block) {
      rejected.push({ proposal, reason: 'invalid_handle' });
      continue;
    }
    validated.push({
      handle: proposal.handle,
      sourceBlockId: block.sourceBlockId,
      claimSummary: proposal.claimSummary,
      locatorSnapshotJson: block.locatorJson,
      verificationStatus: 'verified',
    });
  }

  return { validated, rejected };
}

export function extractHandlesFromMarkdown(markdown: string): string[] {
  const handles = new Set<string>();
  const re = /\[S(\d+)\]/g;
  for (const match of markdown.matchAll(re)) {
    handles.add(`S${match[1]}`);
  }
  return [...handles];
}

export interface MarkdownCitations {
  /** The answer with unsupported handles removed so nothing looks cited that is not. */
  answerMarkdown: string;
  proposals: CitationProposal[];
  unsupportedHandles: string[];
}

/**
 * Providers other than the deterministic test model answer in prose rather than
 * JSON. Citations are therefore read out of the inline `[S1]` markers the
 * prompt asks for, and every marker is checked against the blocks that were
 * actually supplied. A marker the model invented is stripped from the answer
 * instead of silently rendering as an unusable citation.
 */
export function buildCitationsFromMarkdown(
  markdown: string,
  contextBlocks: CitationContextBlock[],
): MarkdownCitations {
  const known = new Set(contextBlocks.map((b) => b.handle));
  const used = extractHandlesFromMarkdown(markdown);

  const supported = used.filter((handle) => known.has(handle));
  const unsupportedHandles = used.filter((handle) => !known.has(handle));

  let answerMarkdown = markdown;
  for (const handle of unsupportedHandles) {
    answerMarkdown = answerMarkdown.split(`[${handle}]`).join('');
  }

  const proposals = supported.map((handle) => ({
    handle,
    claimSummary: claimSentenceFor(markdown, handle),
  }));

  return {
    answerMarkdown: answerMarkdown.replace(/[ \t]+\n/g, '\n').trim(),
    proposals,
    unsupportedHandles,
  };
}

/** The sentence a handle appears in is the claim it is being used to support. */
function claimSentenceFor(markdown: string, handle: string): string {
  const marker = `[${handle}]`;
  const index = markdown.indexOf(marker);
  if (index < 0) return '';

  const before = markdown.slice(0, index);
  const start = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('\n'),
    before.lastIndexOf('? '),
    before.lastIndexOf('! '),
  );
  const afterStart = index + marker.length;
  const rest = markdown.slice(afterStart);
  const endMatch = rest.search(/[.?!\n]/);
  const end = endMatch < 0 ? markdown.length : afterStart + endMatch + 1;

  return markdown
    .slice(start + 1, end)
    .replace(/\[S\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}
