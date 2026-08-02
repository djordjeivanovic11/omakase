import type { Collection, Source, Studio } from '@omakase/contracts';
import { type MouseEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

function displaySourceTitle(source: Source): string {
  const title = source.title?.trim() || 'Untitled source';
  // Avoid presenting lowercased filenames as the primary identity when we can.
  if (title.includes('/') || title.endsWith('.pdf')) {
    return (
      title
        .split('/')
        .pop()
        ?.replace(/\.pdf$/i, '') ?? title
    );
  }
  return title;
}

export function StudioDetailPage() {
  const { studioId } = useParams<{ studioId: string }>();
  const navigate = useNavigate();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!studioId) return;
    void Promise.all([getApi().getStudio(studioId), getApi().listCollections(studioId)])
      .then(([result, nextCollections]: [{ studio: Studio; sources: Source[] }, Collection[]]) => {
        setStudio(result.studio);
        setSources(result.sources);
        setCollections(nextCollections);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load studio');
      });
  }, [studioId]);

  const toggleSource = (sourceId: string, event: MouseEvent<HTMLInputElement>) => {
    const index = sources.findIndex((source) => source.id === sourceId);
    if (event.shiftKey && selectedSourceIds.length > 0) {
      const anchor = sources.findIndex((source) => source.id === selectedSourceIds[0]);
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      setSelectedSourceIds(sources.slice(start, end + 1).map((source) => source.id));
      return;
    }
    if (event.metaKey || event.ctrlKey || selectedSourceIds.length > 0) {
      setSelectedSourceIds((current) =>
        current.includes(sourceId)
          ? current.filter((id) => id !== sourceId)
          : [...current, sourceId],
      );
      return;
    }
    setSelectedSourceIds([sourceId]);
  };

  const createCollection = async () => {
    if (!studioId) return;
    const name = window.prompt('Collection name');
    if (!name?.trim()) return;
    try {
      const collection = (await getApi().createCollection({
        studioId,
        name: name.trim(),
      })) as Collection;
      for (const sourceId of selectedSourceIds) {
        await getApi().addSourceToCollection({ collectionId: collection.id, sourceId });
      }
      setSelectedSourceIds([]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create collection');
    }
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  const readySources = sources.filter((s) => s.processingStatus === 'ready');
  const continueSource = readySources[0] ?? sources[0];

  const importPdf = async () => {
    if (!studioId) return;
    const filePaths = await getApi().pickPdfFiles();
    if (filePaths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        filePaths.map((absolutePath: string) =>
          getApi().importPdfSource({
            absolutePath,
            studioId,
            role: 'foundation',
            lifecycleStatus: 'active',
          }),
        ),
      );
      const failed = results.filter(
        (r: PromiseSettledResult<unknown>) => r.status === 'rejected',
      ).length;
      if (failed === filePaths.length) throw new Error('Could not import any PDFs.');
      if (failed > 0) setError(`${failed} of ${filePaths.length} PDFs failed to import.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF import failed');
    } finally {
      setBusy(false);
    }
  };

  const archiveStudio = async () => {
    if (!studioId || !studio) return;
    if (!window.confirm(`Archive “${studio.name}”?`)) return;
    await getApi().deleteStudio(studioId);
    navigate('/studios');
  };

  if (!studioId) return null;
  if (error && !studio) return <p className="error-text">{error}</p>;
  if (!studio) return <p className="muted">Loading studio…</p>;

  return (
    <div>
      <p className="muted">
        <Link to="/studios">Studios</Link>
      </p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">{studio.name}</h1>
        <div style={{ position: 'relative' }}>
          <Button variant="ghost" onClick={() => setMenuOpen((v) => !v)} aria-label="Studio menu">
            ···
          </Button>
          {menuOpen ? (
            <div
              className="card"
              style={{ position: 'absolute', right: 0, top: '2.2rem', zIndex: 5, minWidth: 160 }}
            >
              <Button variant="ghost" onClick={() => void archiveStudio()}>
                Archive studio
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      {studio.primaryObjective ? <p className="page-lead">{studio.primaryObjective}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="hero-action">
        <h2>Continue learning</h2>
        <p className="muted">
          {continueSource
            ? `Pick up with ${displaySourceTitle(continueSource)}`
            : 'Add a source to begin.'}
        </p>
        <div className="row">
          {continueSource ? (
            <Link to={`/sources/${continueSource.id}/learn`} state={{ studioId }}>
              <Button variant="primary">Continue →</Button>
            </Link>
          ) : null}
          <Link to={`/studios/${studioId}/probe`}>
            <Button variant="ghost">Start Probe</Button>
          </Link>
        </div>
      </section>

      <section>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Sources</h2>
          <div className="row">
            <Button onClick={() => void importPdf()} disabled={busy}>
              Add PDFs
            </Button>
            <Link to="/inbox">
              <Button variant="ghost">Inbox</Button>
            </Link>
          </div>
        </div>
        {sources.length === 0 ? (
          <p className="muted">No sources yet.</p>
        ) : (
          sources.map((source, index) => (
            <div
              key={source.id}
              className={`list-row row${selectedSourceIds.includes(source.id) ? ' selected' : ''}`}
              style={{ justifyContent: 'space-between' }}
            >
              <div className="row" style={{ minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={selectedSourceIds.includes(source.id)}
                  aria-label={`Select ${displaySourceTitle(source)}`}
                  onClick={(event) => toggleSource(source.id, event)}
                  onChange={() => undefined}
                />
                <div>
                  <Link to={`/sources/${source.id}`}>{displaySourceTitle(source)}</Link>
                  <div className="muted">
                    {source.kind}
                    {source.author ? ` · ${source.author}` : ''}
                    {source.publishedAt ? ` · ${new Date(source.publishedAt).getFullYear()}` : ''}
                    {index === 0 ? ' · recent' : ''}
                  </div>
                </div>
              </div>
              <div className="row">
                <span className="status-pill">
                  {source.processingStatus === 'ready' ? 'Ready' : 'Processing'}
                </span>
                <Link to={`/sources/${source.id}/learn`} state={{ studioId }}>
                  <Button variant="primary">Learn</Button>
                </Link>
              </div>
            </div>
          ))
        )}
        {selectedSourceIds.length > 0 ? (
          <div className="selection-action-bar">
            <span>
              {selectedSourceIds.length} source{selectedSourceIds.length === 1 ? '' : 's'} selected
            </span>
            <Link
              to={`/studios/${studioId}/learn`}
              state={{ studioId, sourceIds: selectedSourceIds }}
            >
              <Button variant="primary">Learn from selection</Button>
            </Link>
            <Button variant="ghost" onClick={() => setSelectedSourceIds([])}>
              Clear
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Collections</h2>
          <Button onClick={() => void createCollection()} disabled={selectedSourceIds.length === 0}>
            New from selection
          </Button>
        </div>
        {collections.length === 0 ? (
          <p className="muted">Select sources, then create a collection.</p>
        ) : (
          collections.map((collection) => (
            <div
              key={collection.id}
              className="list-row row"
              style={{ justifyContent: 'space-between' }}
            >
              <div>
                <strong>{collection.name}</strong>
                <div className="muted">
                  {collection.sourceCount} source{collection.sourceCount === 1 ? '' : 's'}
                </div>
              </div>
              <Link
                to={`/studios/${studioId}/learn`}
                state={{ studioId, collectionId: collection.id }}
              >
                <Button variant="ghost">Learn from collection</Button>
              </Link>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
