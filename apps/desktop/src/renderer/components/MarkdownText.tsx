import type { ReactNode } from 'react';
import { referenceLabel } from '../lib/citations-display.js';

interface CitationTarget {
  handle: string;
  claimSummary: string;
  sourceBlockId?: number;
  label?: string;
}

interface MarkdownTextProps {
  markdown: string;
  citations?: CitationTarget[];
  onReferenceClick?: (citation: CitationTarget) => void;
}

export function MarkdownText({ markdown, citations = [], onReferenceClick }: MarkdownTextProps) {
  const citationByHandle = new Map(citations.map((citation) => [citation.handle, citation]));
  const blocks = parseBlocks(markdown);

  return (
    <div className="markdown-text">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        switch (block.kind) {
          case 'heading':
            return block.level === 3 ? (
              <h3 key={key}>{renderInline(block.text, citationByHandle, onReferenceClick)}</h3>
            ) : (
              <h2 key={key}>{renderInline(block.text, citationByHandle, onReferenceClick)}</h2>
            );
          case 'ol':
            return (
              <ol key={key}>
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, citationByHandle, onReferenceClick)}</li>
                ))}
              </ol>
            );
          case 'ul':
            return (
              <ul key={key}>
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, citationByHandle, onReferenceClick)}</li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote key={key}>
                {renderInline(block.text, citationByHandle, onReferenceClick)}
              </blockquote>
            );
          default:
            return <p key={key}>{renderInline(block.text, citationByHandle, onReferenceClick)}</p>;
        }
      })}
    </div>
  );
}

type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] };

function parseBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ol' | 'ul'; items: string[] } | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.items.length > 0) blocks.push(list);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length >= 3 ? 3 : 2,
        text: heading[2]!.trim(),
      });
      continue;
    }

    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (list?.kind !== 'ol') flushList();
      list ??= { kind: 'ol', items: [] };
      list.items.push(ordered[1]!.trim());
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (list?.kind !== 'ul') flushList();
      list ??= { kind: 'ul', items: [] };
      list.items.push(unordered[1]!.trim());
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'quote', text: quote[1]!.trim() });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', text: markdown.trim() }];
}

function renderInline(
  text: string,
  citationByHandle: Map<string, CitationTarget>,
  onReferenceClick?: (citation: CitationTarget) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[S\d+\]|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));

    const handle = /^\[(S\d+)\]$/.exec(token)?.[1];
    if (handle) {
      const citation = citationByHandle.get(handle);
      if (citation) {
        nodes.push(
          <button
            key={`ref-${handle}-${index}`}
            type="button"
            className="inline-reference"
            title={citation.claimSummary || citation.label || handle}
            onClick={() => onReferenceClick?.(citation)}
          >
            {referenceLabel(handle)}
          </button>,
        );
      } else {
        nodes.push(
          <span key={`ref-pending-${handle}-${index}`} className="inline-reference pending">
            {referenceLabel(handle)}
          </span>,
        );
      }
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`code-${index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`strong-${index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={`em-${index}`}>{token.slice(1, -1)}</em>);
    }

    cursor = start + token.length;
    index += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
