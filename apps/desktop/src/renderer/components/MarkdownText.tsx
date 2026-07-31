import { renderToString } from 'katex';
import { type ReactNode, useMemo, useState } from 'react';
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
                {block.items.map((item) => (
                  <li key={`${key}-${item}`}>
                    {renderInline(item, citationByHandle, onReferenceClick)}
                  </li>
                ))}
              </ol>
            );
          case 'ul':
            return (
              <ul key={key}>
                {block.items.map((item) => (
                  <li key={`${key}-${item}`}>
                    {renderInline(item, citationByHandle, onReferenceClick)}
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote key={key}>
                {renderInline(block.text, citationByHandle, onReferenceClick)}
              </blockquote>
            );
          case 'math':
            return <MathFormula key={key} expression={block.text} display />;
          case 'code':
            return <CodeBlock key={key} language={block.language} code={block.text} />;
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
  | { kind: 'math'; text: string }
  | { kind: 'code'; language: string | null; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] };

function parseBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ol' | 'ul'; items: string[] } | null = null;
  let math: string[] | null = null;
  let code: { language: string | null; lines: string[] } | null = null;

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
    if (code) {
      if (line.startsWith('```')) {
        pushCodeOrMathBlock(blocks, code.language, trimCodeBlock(code.lines));
        code = null;
      } else {
        code.lines.push(rawLine);
      }
      continue;
    }

    if (math) {
      const closingText = readMathClosing(line);
      if (closingText !== null) {
        if (closingText) math.push(closingText);
        blocks.push({ kind: 'math', text: math.join('\n').trim() });
        math = null;
      } else {
        math.push(rawLine.trim());
      }
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const displayMath = readMathOpening(line);
    if (displayMath) {
      flushParagraph();
      flushList();
      if (displayMath.closed) {
        blocks.push({ kind: 'math', text: displayMath.text });
      } else {
        math = displayMath.text ? [displayMath.text] : [];
      }
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      const language = line.slice(3).trim();
      code = { language: language || null, lines: [] };
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const headingMarker = heading[1] ?? '';
      const headingText = heading[2]?.trim() ?? '';
      if (!headingMarker || !headingText) continue;
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: headingMarker.length >= 3 ? 3 : 2,
        text: headingText,
      });
      continue;
    }

    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      const item = ordered[1]?.trim();
      if (!item) continue;
      flushParagraph();
      if (list?.kind !== 'ol') flushList();
      list ??= { kind: 'ol', items: [] };
      list.items.push(item);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      const item = unordered[1]?.trim();
      if (!item) continue;
      flushParagraph();
      if (list?.kind !== 'ul') flushList();
      list ??= { kind: 'ul', items: [] };
      list.items.push(item);
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      const quoteText = quote[1]?.trim();
      if (!quoteText) continue;
      flushParagraph();
      flushList();
      blocks.push({ kind: 'quote', text: quoteText });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  if (math && math.length > 0) blocks.push({ kind: 'math', text: math.join('\n').trim() });
  if (code) pushCodeOrMathBlock(blocks, code.language, trimCodeBlock(code.lines));
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', text: markdown.trim() }];
}

function readMathOpening(line: string): { text: string; closed: boolean } | null {
  if (line.startsWith('\\[')) {
    const rest = line.slice(2).trim();
    if (rest.endsWith('\\]')) {
      return { text: rest.slice(0, -2).trim(), closed: true };
    }
    return { text: rest, closed: false };
  }

  if (line.startsWith('$$')) {
    const rest = line.slice(2).trim();
    if (rest.endsWith('$$')) {
      return { text: rest.slice(0, -2).trim(), closed: true };
    }
    return { text: rest, closed: false };
  }

  return null;
}

function readMathClosing(line: string): string | null {
  if (line.endsWith('\\]')) return line.slice(0, -2).trim();
  if (line.endsWith('$$')) return line.slice(0, -2).trim();
  return null;
}

function pushCodeOrMathBlock(blocks: MarkdownBlock[], language: string | null, text: string) {
  if (isMathLanguage(language)) {
    blocks.push({ kind: 'math', text });
  } else {
    blocks.push({ kind: 'code', language, text });
  }
}

function isMathLanguage(language: string | null): boolean {
  if (!language) return false;
  return ['katex', 'latex', 'math', 'tex'].includes(language.toLowerCase());
}

function trimCodeBlock(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === '') start += 1;
  while (end > start && lines[end - 1]?.trim() === '') end -= 1;
  return lines.slice(start, end).join('\n');
}

function MathFormula({ expression, display }: { expression: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return renderToString(normalizeLatex(expression), {
        displayMode: display,
        output: 'htmlAndMathml',
        strict: 'ignore',
        throwOnError: false,
        trust: false,
      });
    } catch {
      return null;
    }
  }, [display, expression]);

  if (!html) {
    const Tag = display ? 'div' : 'span';
    return (
      <Tag className={display ? 'math-block math-error' : 'math-inline math-error'}>
        {expression}
      </Tag>
    );
  }

  const Tag = display ? 'div' : 'span';
  // KaTeX renders with trust=false, so source text cannot inject trusted HTML.
  const htmlProps = { dangerouslySetInnerHTML: { __html: html } };
  return <Tag className={display ? 'math-block' : 'math-inline'} {...htmlProps} />;
}

function normalizeLatex(expression: string): string {
  return expression
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(
      /\\\\(?=(alpha|bar|beta|cdot|cdots|Delta|epsilon|frac|gamma|left|log|longrightarrow|mathbb|mathbf|mathcal|mu|nabla|operatorname|partial|right|sigma|sim|sqrt|text|theta|varepsilon)\b)/g,
      '\\',
    );
}

function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const [copied, setCopied] = useState(false);
  const label = language ?? 'code';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{label}</span>
        <button type="button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(
  text: string,
  citationByHandle: Map<string, CitationTarget>,
  onReferenceClick?: (citation: CitationTarget) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  const pushText = (value: string) => {
    if (value) nodes.push(value);
  };

  while (cursor < text.length) {
    const token = nextInlineToken(text, cursor);
    if (!token) {
      pushText(text.slice(cursor));
      break;
    }

    if (token.start > cursor) pushText(text.slice(cursor, token.start));

    const { token: rawToken, kind } = token;
    const handle = /^\[(S\d+)\]$/.exec(rawToken)?.[1];
    if (kind === 'citation' && handle) {
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
    } else if (kind === 'numericCitation') {
      const citation = citationByHandle.get(`S${rawToken}`);
      if (citation) {
        nodes.push(
          <button
            key={`ref-S${rawToken}-${index}`}
            type="button"
            className="inline-reference"
            title={citation.claimSummary || citation.label || `S${rawToken}`}
            onClick={() => onReferenceClick?.(citation)}
          >
            {rawToken}
          </button>,
        );
      } else {
        nodes.push(<strong key={`strong-${index}`}>{rawToken}</strong>);
      }
    } else if (kind === 'math') {
      nodes.push(
        <MathFormula key={`math-inline-${index}`} expression={rawToken} display={false} />,
      );
    } else if (kind === 'code') {
      nodes.push(<code key={`code-${index}`}>{rawToken}</code>);
    } else if (kind === 'strong') {
      nodes.push(<strong key={`strong-${index}`}>{rawToken}</strong>);
    } else if (kind === 'em') {
      nodes.push(<em key={`em-${index}`}>{rawToken}</em>);
    }

    cursor = token.end;
    index += 1;
  }

  return nodes;
}

type InlineTokenKind = 'citation' | 'numericCitation' | 'math' | 'code' | 'strong' | 'em';

interface InlineToken {
  kind: InlineTokenKind;
  start: number;
  end: number;
  token: string;
}

function nextInlineToken(text: string, from: number): InlineToken | null {
  for (let index = from; index < text.length; index += 1) {
    const rest = text.slice(index);

    const citation = /^\[S\d+\]/.exec(rest)?.[0];
    if (citation)
      return { kind: 'citation', start: index, end: index + citation.length, token: citation };

    const numericCitation = /^\*\*\s*(\d+)\s*\*\*/.exec(rest);
    if (numericCitation?.[1]) {
      return {
        kind: 'numericCitation',
        start: index,
        end: index + numericCitation[0].length,
        token: numericCitation[1],
      };
    }

    if (rest.startsWith('\\(')) {
      const end = text.indexOf('\\)', index + 2);
      if (end !== -1)
        return {
          kind: 'math',
          start: index,
          end: end + 2,
          token: text.slice(index + 2, end).trim(),
        };
    }

    if (rest.startsWith('$') && !rest.startsWith('$$')) {
      const end = text.indexOf('$', index + 1);
      if (end !== -1)
        return {
          kind: 'math',
          start: index,
          end: end + 1,
          token: text.slice(index + 1, end).trim(),
        };
    }

    if (rest.startsWith('`')) {
      const end = text.indexOf('`', index + 1);
      if (end !== -1)
        return { kind: 'code', start: index, end: end + 1, token: text.slice(index + 1, end) };
    }

    if (rest.startsWith('**')) {
      const end = text.indexOf('**', index + 2);
      if (end !== -1)
        return { kind: 'strong', start: index, end: end + 2, token: text.slice(index + 2, end) };
    }

    if (rest.startsWith('*')) {
      const end = text.indexOf('*', index + 1);
      if (end !== -1)
        return { kind: 'em', start: index, end: end + 1, token: text.slice(index + 1, end) };
    }
  }

  return null;
}
