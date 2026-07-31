interface CitationChipProps {
  handle: string;
  summary: string;
  sourceId?: string;
  blockId?: number;
  onNavigate?: (sourceId: string, blockId?: number) => void;
}

export function CitationChip({
  handle,
  summary,
  sourceId,
  blockId,
  onNavigate,
}: CitationChipProps) {
  return (
    <button
      type="button"
      className="citation-chip"
      title={summary}
      onClick={() => {
        if (sourceId && onNavigate) onNavigate(sourceId, blockId);
      }}
      disabled={!sourceId}
    >
      <span className="citation-handle">{handle}</span>
      <span className="citation-summary">{summary}</span>
      <style>{`
        .citation-chip {
          display: inline-flex;
          gap: 0.35rem;
          align-items: baseline;
          border: 1px solid var(--color-border);
          background: #fff;
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          font: inherit;
          cursor: pointer;
          margin: 0.15rem;
        }
        .citation-handle {
          font-size: 0.75rem;
          color: var(--color-accent);
          font-weight: 600;
        }
        .citation-summary {
          font-size: 0.8125rem;
          color: var(--color-text-muted);
        }
      `}</style>
    </button>
  );
}
