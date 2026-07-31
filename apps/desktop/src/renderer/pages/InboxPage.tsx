import type { Source, Studio } from '@omakase/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { ProgressBanner } from '../components/ProgressBanner.js';

type PasteKind = 'text' | 'note' | 'markdown';

export function InboxPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [pasteKind, setPasteKind] = useState<PasteKind>('text');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getApi().listInboxSources().then(setSources);
    void getApi().listStudios().then(setStudios);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (action: () => Promise<string | undefined>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setNotice(message ?? success);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const importPaste = () =>
    run(async () => {
      if (!textTitle.trim() || !textBody.trim()) {
        throw new Error('Add a title and some text first.');
      }
      await getApi().importTextSource({
        title: textTitle.trim(),
        text: textBody.trim(),
        kind: pasteKind,
        lifecycleStatus: 'inbox',
      });
      setTextTitle('');
      setTextBody('');
      return 'Saved to Inbox.';
    }, 'Saved to Inbox.');

  const importPdf = () =>
    run(async () => {
      const filePaths = await getApi().pickPdfFiles();
      if (filePaths.length === 0) return undefined;
      const results = await Promise.allSettled(
        filePaths.map((absolutePath: string) =>
          getApi().importPdfSource({
            absolutePath,
            lifecycleStatus: 'inbox',
          }),
        ),
      );
      const ok = results.filter(
        (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled',
      ).length;
      const failed = results.length - ok;
      if (ok === 0) throw new Error('Could not import any PDFs.');
      if (failed > 0) {
        return `${ok} PDFs imported (${failed} failed). Preparing text with 5 local workers…`;
      }
      return ok === 1
        ? 'PDF imported. Preparing text…'
        : `${ok} PDFs imported. Preparing text with 5 local workers…`;
    }, 'PDFs imported.');

  const importTranscript = () =>
    run(async () => {
      const filePaths = await getApi().pickTranscriptFiles();
      if (filePaths.length === 0) return undefined;
      const results = await Promise.allSettled(
        filePaths.map((absolutePath: string) =>
          getApi().importTranscriptSource({
            absolutePath,
            lifecycleStatus: 'inbox',
          }),
        ),
      );
      const ok = results.filter(
        (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled',
      ).length;
      const failed = results.length - ok;
      if (ok === 0) throw new Error('Could not import any transcripts.');
      if (failed > 0) return `${ok} transcripts imported (${failed} failed).`;
      return ok === 1 ? 'Transcript imported.' : `${ok} transcripts imported.`;
    }, 'Transcripts imported.');

  const importUrl = () =>
    run(async () => {
      if (!url.trim()) throw new Error('Paste a web page URL first.');
      await getApi().importUrlSource({ url: url.trim(), lifecycleStatus: 'inbox' });
      setUrl('');
      return 'Page imported.';
    }, 'Page imported.');

  const assign = async (sourceId: string, studioId: string) => {
    setError(null);
    try {
      await getApi().assignSourceToStudio({ sourceId, studioId, role: 'reference' });
      setNotice('Assigned to studio.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign source');
    }
  };

  const removeSource = async (sourceId: string, title: string) => {
    if (!window.confirm(`Remove “${title}” from your library? This cannot be undone.`)) return;
    setError(null);
    try {
      await getApi().deleteSource(sourceId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove source');
    }
  };

  return (
    <div>
      <h1 className="page-title">Inbox</h1>
      <p className="page-lead">
        New material lands here until you assign it to a studio. Captures from the browser extension
        appear automatically.
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <section className="card stack">
        <h2>Paste text or a note</h2>
        <div className="form-field">
          <label htmlFor="paste-kind">Type</label>
          <select
            id="paste-kind"
            value={pasteKind}
            onChange={(e) => setPasteKind(e.target.value as PasteKind)}
          >
            <option value="text">Pasted text</option>
            <option value="note">Personal note</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="paste-title">Title</label>
          <input
            id="paste-title"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="e.g. Chapter summary"
          />
        </div>
        <div className="form-field">
          <label htmlFor="paste-body">Content</label>
          <textarea
            id="paste-body"
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            placeholder="Paste what you want to learn from…"
          />
        </div>
        <Button variant="primary" onClick={() => void importPaste()} disabled={busy}>
          Save to Inbox
        </Button>
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Import a file or page</h2>
        <div className="row">
          <Button onClick={() => void importPdf()} disabled={busy}>
            Import PDFs
          </Button>
          <Button onClick={() => void importTranscript()} disabled={busy}>
            Import transcripts
          </Button>
        </div>
        <p className="muted">
          Select many files at once. Up to 5 sources prepare in parallel on this Mac. Transcripts:
          VTT, SRT, or plain timed text.
        </p>
        <div className="form-field">
          <label htmlFor="import-url">Web page URL</label>
          <input
            id="import-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <Button onClick={() => void importUrl()} disabled={busy}>
          Import URL
        </Button>
      </section>

      <section className="stack" style={{ marginTop: 'var(--space-xl)' }}>
        <h2>Waiting here</h2>
        {sources.length === 0 ? (
          <p className="muted">
            Inbox is empty. Paste text, import a PDF or transcript, add a URL, or capture a page
            with the browser extension.
          </p>
        ) : (
          sources.map((source) => (
            <article key={source.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>
                  <Link to={`/sources/${source.id}`}>{source.title}</Link>
                </h2>
                <span className="status-pill">{labelForKind(source.kind)}</span>
              </div>
              <ProgressBanner
                status={source.processingStatus}
                error={source.processingError}
                onRetry={() => void getApi().retrySource(source.id).then(refresh)}
              />
              {studios.length > 0 ? (
                <div className="form-field">
                  <label htmlFor={`assign-${source.id}`}>Assign to studio</label>
                  <select
                    id={`assign-${source.id}`}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) void assign(source.id, e.target.value);
                    }}
                  >
                    <option value="" disabled>
                      Choose studio…
                    </option>
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="muted">
                  <Link to="/studios">Create a studio</Link> to assign this source.
                </p>
              )}
              <div className="row">
                <Link to={`/sources/${source.id}`}>
                  <Button variant="ghost">Open</Button>
                </Link>
                <Button variant="ghost" onClick={() => void removeSource(source.id, source.title)}>
                  Remove
                </Button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function labelForKind(kind: Source['kind']): string {
  switch (kind) {
    case 'note':
      return 'Note';
    case 'markdown':
      return 'Markdown';
    case 'pdf':
      return 'PDF';
    case 'web':
      return 'Web';
    case 'transcript':
      return 'Transcript';
    case 'text':
      return 'Text';
    default:
      return kind;
  }
}
