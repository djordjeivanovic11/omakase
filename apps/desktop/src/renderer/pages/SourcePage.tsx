import type { Source, SourceBlock } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { ProgressBanner } from '../components/ProgressBanner.js';

export function SourcePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const location = useLocation();
  const [source, setSource] = useState<Source | null>(null);
  const [blocks, setBlocks] = useState<SourceBlock[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) return;
    setError(null);
    void getApi()
      .getSource(sourceId)
      .then(setSource)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load source');
      });
    void getApi().listSourceBlocks(sourceId).then(setBlocks);
  }, [sourceId]);

  useEffect(() => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash || blocks.length === 0) return;
    const el = document.getElementById(hash);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('source-block-highlight');
    const timer = setTimeout(() => el.classList.remove('source-block-highlight'), 2400);
    return () => clearTimeout(timer);
  }, [location.hash, blocks]);

  if (!sourceId) return null;
  if (error) return <p className="error-text">{error}</p>;
  if (!source) return <p className="muted">Loading source…</p>;

  return (
    <div>
      <p className="muted">
        <Link to="/inbox">Inbox</Link>
      </p>
      <h1 className="page-title">{source.title}</h1>
      {source.author ? <p className="muted">{source.author}</p> : null}
      {source.canonicalUrl ? (
        <p>
          <button
            type="button"
            className="linkish"
            onClick={() => void getApi().openExternal(source.canonicalUrl!)}
          >
            Open original
          </button>
        </p>
      ) : null}

      <ProgressBanner
        status={source.processingStatus}
        error={source.processingError}
        onRetry={() =>
          void getApi()
            .retrySource(source.id)
            .then(() => getApi().getSource(source.id).then(setSource))
        }
      />

      <div className="row" style={{ marginBottom: 'var(--space-lg)' }}>
        <Link to={`/sources/${sourceId}/learn`}>
          <Button variant="primary">Learn</Button>
        </Link>
        <Link to={`/sources/${sourceId}/learn?mode=ask`}>
          <Button>Ask</Button>
        </Link>
        <Link to={`/sources/${sourceId}/probe`} state={{ objective: source.title }}>
          <Button variant="ghost">Probe</Button>
        </Link>
      </div>

      <section className="card">
        <h2>Content</h2>
        {blocks.length === 0 ? (
          <p className="muted">
            {source.processingStatus === 'ready'
              ? 'No readable text was extracted from this source.'
              : 'Content is still being prepared.'}
          </p>
        ) : (
          blocks.map((block) => (
            <article key={block.id} id={`block-${block.id}`} className="source-block">
              {block.headingPathText ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {block.headingPathText}
                  {block.pageStart != null ? ` · p.${block.pageStart}` : ''}
                  {block.timeStartMs != null
                    ? ` · ${formatMs(block.timeStartMs)}`
                    : ''}
                </p>
              ) : null}
              <pre>{block.text}</pre>
            </article>
          ))
        )}
      </section>
      <style>{`
        .linkish {
          background: none;
          border: none;
          color: var(--color-accent);
          cursor: pointer;
          font: inherit;
          padding: 0;
          text-decoration: underline;
        }
        .source-block-highlight {
          outline: 2px solid var(--color-accent);
          background: var(--color-accent-soft);
          border-radius: 6px;
          transition: background 0.4s ease;
        }
      `}</style>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
