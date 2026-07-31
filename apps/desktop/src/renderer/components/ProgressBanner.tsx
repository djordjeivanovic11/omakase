import type { ProcessingStatus } from '@omakase/contracts';

const LABELS: Partial<Record<ProcessingStatus, string>> = {
  queued: 'Waiting to start',
  acquiring: 'Saving your file',
  extracting: 'Reading content',
  quality_check: 'Checking quality',
  normalizing: 'Preparing text',
  structuring: 'Organizing sections',
  blocking: 'Building sections',
  indexing_lexical: 'Making searchable',
  embedding: 'Finishing up',
  ready: 'Ready',
  needs_attention: 'Needs your review',
  failed: 'Something went wrong',
  cancelled: 'Cancelled',
};

interface ProgressBannerProps {
  status: ProcessingStatus;
  error?: string | null;
  onRetry?: () => void;
}

export function ProgressBanner({ status, error, onRetry }: ProgressBannerProps) {
  if (status === 'ready') return null;

  return (
    <output className="progress-banner">
      <strong>{LABELS[status] ?? 'Working…'}</strong>
      {error ? <p className="muted">{error}</p> : null}
      {status === 'failed' && onRetry ? (
        <button type="button" className="linkish" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      <style>{`
        .progress-banner {
          display: block;
          padding: var(--space-md);
          border-radius: var(--radius);
          background: var(--color-accent-soft);
          margin-bottom: var(--space-md);
        }
        .linkish {
          background: none;
          border: none;
          color: var(--color-accent);
          cursor: pointer;
          font: inherit;
          padding: 0;
          text-decoration: underline;
        }
      `}</style>
    </output>
  );
}
