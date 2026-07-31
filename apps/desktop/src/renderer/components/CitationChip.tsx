interface CitationChipProps {
  handle: string;
  summary: string;
  /** Human label supersedes raw handle in the UI */
  label?: string;
  sourceId?: string;
  blockId?: number;
  onNavigate?: (sourceId: string, blockId?: number) => void;
}

export function CitationChip({
  handle,
  summary,
  label,
  sourceId,
  blockId,
  onNavigate,
}: CitationChipProps) {
  const display = label ?? summary ?? handle;
  return (
    <button
      type="button"
      className="citation-chip"
      title={summary || handle}
      aria-label={`Open citation ${display}`}
      onClick={() => {
        if (sourceId && onNavigate) onNavigate(sourceId, blockId);
      }}
      disabled={!sourceId}
    >
      <span className="citation-label">{display}</span>
      <style>{`
        .citation-chip {
          display: inline-flex;
          align-items: baseline;
          border: 1px solid var(--color-border);
          background: transparent;
          border-radius: 8px;
          padding: 0.15rem 0.55rem;
          font: inherit;
          cursor: pointer;
          margin: 0.2rem 0.25rem 0.2rem 0;
        }
        .citation-label {
          font-size: 0.8125rem;
          color: var(--color-accent);
          font-weight: 500;
        }
      `}</style>
    </button>
  );
}
