import type { AgentStreamEvent, Source, SourceBlock } from '@omakase/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { MarkdownText } from '../components/MarkdownText.js';
import { formatCitationLabel, referenceLabel } from '../lib/citations-display.js';

interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
  citations?: Array<{
    handle: string;
    claimSummary: string;
    sourceBlockId?: number;
    label?: string;
  }>;
}

const OPENING_LEARN = 'Teach me from the top.';

export function LearnPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation() as { state?: { studioId?: string } };
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<string | null>(location.state?.studioId ?? null);
  const [source, setSource] = useState<Source | null>(null);
  const [blocks, setBlocks] = useState<SourceBlock[]>([]);
  const [message, setMessage] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [activeReferenceHandle, setActiveReferenceHandle] = useState<string | null>(null);
  const [narrowTab, setNarrowTab] = useState<'source' | 'teacher'>('teacher');
  const [diag, setDiag] = useState<{
    modelId?: string;
    provider?: string;
    mock?: boolean;
  } | null>(null);
  const assistantBuffer = useRef('');
  const citationsRef = useRef<
    Array<{ handle: string; claimSummary: string; sourceBlockId?: number; label?: string }>
  >([]);
  const openedRef = useRef(false);

  const mode = searchParams.get('mode') === 'ask' ? 'research' : 'learn';
  const title = mode === 'research' ? 'Ask' : 'Learn';
  const [showDiag, setShowDiag] = useState(false);
  const visibleCitations = useMemo(
    () =>
      lines.flatMap((line) => (line.role === 'assistant' ? (line.citations ?? []) : [])),
    [lines],
  );
  const citedHandlesByBlock = useMemo(() => {
    const grouped = new Map<number, string[]>();
    for (const citation of visibleCitations) {
      if (!citation.sourceBlockId) continue;
      const handles = grouped.get(citation.sourceBlockId) ?? [];
      handles.push(citation.handle);
      grouped.set(citation.sourceBlockId, handles);
    }
    return grouped;
  }, [visibleCitations]);

  useEffect(() => {
    void getApi()
      .getAppInfo()
      .then((info: { mockProviderEnabled?: boolean; packaged?: boolean; devDiag?: boolean }) => {
        setShowDiag(
          Boolean(info.devDiag) ||
            Boolean(info.mockProviderEnabled) ||
            info.packaged === false ||
            window.location.search.includes('diag=1'),
        );
      })
      .catch(() => setShowDiag(window.location.search.includes('diag=1')));
  }, []);

  useEffect(() => {
    if (!sourceId) return;
    void getApi().getSource(sourceId).then(setSource);
    void getApi().listSourceBlocks(sourceId).then(setBlocks);
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId || openedRef.current) return;
    const resolveStudio = async () => {
      if (studioId) return studioId;
      const studios = await getApi().listStudios();
      if (studios[0]) {
        setStudioId(studios[0].id);
        return studios[0].id;
      }
      return null;
    };

    void resolveStudio().then(async (sid) => {
      if (!sid) {
        setStatus('Create a Studio before learning.');
        return;
      }
      try {
        const result = (await getApi().startAgentSession({
          studioId: sid,
          sourceId,
          mode,
          objective:
            mode === 'research' ? 'Answer from sources' : 'Teach from the top of this source',
        })) as { sessionId: string; runtimeContext?: { modelId?: string } };
        setSessionId(result.sessionId);
        setDiag({ modelId: result.runtimeContext?.modelId });
        if (mode === 'learn' && !openedRef.current) {
          openedRef.current = true;
          setBusy(true);
          setStatus('Reviewing your goal and sources…');
          setLines([{ role: 'user', text: OPENING_LEARN }]);
          await getApi().sendAgentMessage({
            sessionId: result.sessionId,
            message: OPENING_LEARN,
          });
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Could not start a learning session');
      }
    });
  }, [sourceId, studioId, mode]);

  useEffect(() => {
    const unsubscribe = getApi().subscribeToAgentStream((event: AgentStreamEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;

      if (event.type === 'text-delta') {
        setStatus(null);
        assistantBuffer.current += event.delta;
        setStreaming(assistantBuffer.current);
      }
      if (event.type === 'citation') {
        const block = blocks.find((b) => b.id === event.sourceBlockId);
        citationsRef.current.push({
          handle: event.handle,
          claimSummary: event.claimSummary,
          sourceBlockId: event.sourceBlockId,
          label: formatCitationLabel({
            handle: event.handle,
            sourceTitle: source?.title,
            headingPathText: block?.headingPathText,
            pageStart: block?.pageStart,
            timeStartMs: block?.timeStartMs,
            timeEndMs: block?.timeEndMs,
          }),
        });
        if (event.sourceBlockId) {
          setActiveBlockId(event.sourceBlockId);
          setActiveReferenceHandle(event.handle);
        }
      }
      if (event.type === 'final') {
        setLines((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: event.result.answerMarkdown,
            citations: [...citationsRef.current],
          },
        ]);
        assistantBuffer.current = '';
        citationsRef.current = [];
        setStreaming('');
        setBusy(false);
        setStatus(null);
      }
      if (event.type === 'error') {
        setLines((prev) => [...prev, { role: 'assistant', text: event.message }]);
        setBusy(false);
        setStatus(null);
      }
      if (event.type === 'cancelled') {
        setBusy(false);
        setStatus(null);
      }
    });
    return unsubscribe;
  }, [sessionId, blocks, source?.title]);

  useEffect(() => {
    if (activeBlockId == null) return;
    const el = document.getElementById(`learn-block-${activeBlockId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeBlockId]);

  const send = async (override?: string) => {
    if (!sessionId) return;
    const text = (override ?? message).trim();
    if (!text) return;
    setLines((prev) => [...prev, { role: 'user', text }]);
    setMessage('');
    setBusy(true);
    setStatus('Reading your sources…');
    assistantBuffer.current = '';
    citationsRef.current = [];
    await getApi().sendAgentMessage({ sessionId, message: text });
  };

  const jumpToCitation = (citation: {
    handle: string;
    sourceBlockId?: number;
  }) => {
    if (!citation.sourceBlockId) return;
    setActiveBlockId(citation.sourceBlockId);
    setActiveReferenceHandle(citation.handle);
    setNarrowTab('source');
  };

  const renderReferences = (
    citations: NonNullable<ChatLine['citations']> | undefined,
  ) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="reference-list" aria-label={`${citations.length} references`}>
        <div className="reference-list-title">References ({citations.length})</div>
        <div className="reference-list-items">
          {citations.map((citation) => (
            <button
              key={citation.handle}
              type="button"
              className={
                activeReferenceHandle === citation.handle
                  ? 'reference-item active'
                  : 'reference-item'
              }
              onClick={() => jumpToCitation(citation)}
              disabled={!citation.sourceBlockId}
              title={citation.claimSummary}
            >
              <span className="reference-number">{referenceLabel(citation.handle)}</span>
              <span>{citation.label ?? citation.claimSummary}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="learn-workspace">
      <div className="learn-toolbar row" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link to={`/sources/${sourceId}`}>Source</Link>
            {studioId ? (
              <>
                {' · '}
                <Link to={`/studios/${studioId}`}>Studio</Link>
              </>
            ) : null}
          </p>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {source?.title ?? title}
          </h1>
        </div>
        <div className="learn-tabs row">
          <button
            type="button"
            className={narrowTab === 'source' ? 'tab active' : 'tab'}
            onClick={() => setNarrowTab('source')}
          >
            Source
          </button>
          <button
            type="button"
            className={narrowTab === 'teacher' ? 'tab active' : 'tab'}
            onClick={() => setNarrowTab('teacher')}
          >
            Teacher
          </button>
        </div>
      </div>

      {showDiag && diag?.modelId ? (
        <p className="muted diag-line">
          Dev · model {diag.modelId}
          {busy ? ' · working…' : ''}
        </p>
      ) : null}

      <div className="learn-split">
        <section
          className={`learn-pane source-pane${narrowTab === 'source' ? ' show-mobile' : ''}`}
        >
          <h2 className="pane-label">Source</h2>
          {blocks.length === 0 ? (
            <p className="muted">Content is still being prepared.</p>
          ) : (
            blocks.map((block) => {
              const blockHandles = citedHandlesByBlock.get(block.id) ?? [];
              const cited = blockHandles.length > 0;
              const active = activeBlockId === block.id;
              return (
                <article
                  key={block.id}
                  id={`learn-block-${block.id}`}
                  className={`source-block${cited ? ' source-block-cited' : ''}${
                    active ? ' source-block-highlight' : ''
                  }`}
                >
                  {block.headingPathText || block.pageStart != null || cited ? (
                    <p className="source-block-meta">
                      <span>
                        {block.headingPathText}
                        {block.pageStart != null ? ` · p. ${block.pageStart}` : ''}
                      </span>
                      {cited ? (
                        <span className="source-ref-badges">
                          {blockHandles.map((handle) => (
                            <button
                              key={handle}
                              type="button"
                              className={
                                activeReferenceHandle === handle
                                  ? 'source-ref-badge active'
                                  : 'source-ref-badge'
                              }
                              onClick={() => {
                                setActiveBlockId(block.id);
                                setActiveReferenceHandle(handle);
                              }}
                            >
                              {referenceLabel(handle)}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <pre>{block.text}</pre>
                </article>
              );
            })
          )}
        </section>

        <section
          className={`learn-pane teacher-pane${narrowTab === 'teacher' ? ' show-mobile' : ''}`}
        >
          <h2 className="pane-label">Teacher</h2>
          {status ? <p className="muted status-line">{status}</p> : null}
          <div className="chat-log">
            {lines.length === 0 && !streaming && !busy ? (
              <p className="muted">Starting your lesson…</p>
            ) : null}
            {lines.map((line, index) => (
              <div key={`${line.role}-${index}`} className={`chat-bubble ${line.role}`}>
                {line.role === 'assistant' ? (
                  <>
                    <MarkdownText
                      markdown={line.text}
                      citations={line.citations}
                      onReferenceClick={jumpToCitation}
                    />
                    {renderReferences(line.citations)}
                  </>
                ) : (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{line.text}</p>
                )}
              </div>
            ))}
            {streaming ? (
              <div className="chat-bubble assistant">
                <MarkdownText markdown={streaming} citations={citationsRef.current} />
              </div>
            ) : null}
          </div>

          <div className="composer stack">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                mode === 'research' ? 'Ask a question…' : 'Ask a follow-up, or say “What?”'
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            <div className="row">
              <Button
                variant="primary"
                onClick={() => void send()}
                disabled={busy || !sessionId || !message.trim()}
              >
                Send
              </Button>
              {sessionId ? (
                <Button
                  variant="ghost"
                  onClick={() => void getApi().cancelAgent(sessionId)}
                  disabled={!busy}
                >
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
