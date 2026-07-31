import type { Source, Studio } from '@omakase/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

export function StudioDetailPage() {
  const { studioId } = useParams<{ studioId: string }>();
  const navigate = useNavigate();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!studioId) return;
    void getApi()
      .getStudio(studioId)
      .then((result: { studio: Studio; sources: Source[] }) => {
        setStudio(result.studio);
        setSources(result.sources);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load studio');
      });
  }, [studioId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      if (failed === filePaths.length) {
        throw new Error('Could not import any PDFs.');
      }
      if (failed > 0) {
        setError(`${failed} of ${filePaths.length} PDFs failed to import.`);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF import failed');
    } finally {
      setBusy(false);
    }
  };

  const importTranscript = async () => {
    if (!studioId) return;
    const filePaths = await getApi().pickTranscriptFiles();
    if (filePaths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        filePaths.map((absolutePath: string) =>
          getApi().importTranscriptSource({
            absolutePath,
            studioId,
            role: 'reference',
            lifecycleStatus: 'active',
          }),
        ),
      );
      const failed = results.filter(
        (r: PromiseSettledResult<unknown>) => r.status === 'rejected',
      ).length;
      if (failed === filePaths.length) {
        throw new Error('Could not import any transcripts.');
      }
      if (failed > 0) {
        setError(`${failed} of ${filePaths.length} transcripts failed to import.`);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcript import failed');
    } finally {
      setBusy(false);
    }
  };

  const archiveStudio = async () => {
    if (!studioId || !studio) return;
    if (!window.confirm(`Archive “${studio.name}”? You can still find it later in backups.`)) {
      return;
    }
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
      <h1 className="page-title">{studio.name}</h1>
      {studio.primaryObjective ? <p className="page-lead">{studio.primaryObjective}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="card stack">
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p className="muted">
            No sources yet. Import a PDF or transcript here, or assign material from{' '}
            <Link to="/inbox">Inbox</Link>.
          </p>
        ) : (
          sources.map((source) => (
            <div key={source.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <Link to={`/sources/${source.id}`}>{source.title}</Link>
                <span className="status-pill" style={{ marginLeft: '0.5rem' }}>
                  {source.processingStatus === 'ready' ? 'Ready' : 'Processing'}
                </span>
              </div>
              <div className="row">
                <Link to={`/sources/${source.id}/learn`} state={{ studioId }}>
                  <Button>Learn</Button>
                </Link>
                <Link to={`/sources/${source.id}/learn?mode=ask`} state={{ studioId }}>
                  <Button variant="ghost">Ask</Button>
                </Link>
                <Link
                  to={`/studios/${studioId}/probe`}
                  state={{ sourceId: source.id, objective: source.title }}
                >
                  <Button variant="ghost">Probe</Button>
                </Link>
              </div>
            </div>
          ))
        )}
        <div className="row">
          <Button onClick={() => void importPdf()} disabled={busy}>
            Add PDFs
          </Button>
          <Button onClick={() => void importTranscript()} disabled={busy}>
            Add transcripts
          </Button>
          <Link to="/inbox">
            <Button variant="secondary">Add from inbox</Button>
          </Link>
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Studio actions</h2>
        <div className="row">
          <Link to={`/studios/${studioId}/probe`}>
            <Button variant="primary">Start Probe</Button>
          </Link>
          <Button variant="ghost" onClick={() => void archiveStudio()}>
            Archive studio
          </Button>
        </div>
      </section>
    </div>
  );
}
