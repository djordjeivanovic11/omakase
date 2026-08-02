import type {
  AgentEvent,
  AgentStreamEvent,
  EvidenceReference,
  Source,
  SourceBlock,
} from '@omakase/contracts';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { MarkdownText } from '../components/MarkdownText.js';
import { PdfViewer } from '../components/PdfViewer.js';
import { formatCitationLabel, referenceLabel } from '../lib/citations-display.js';

interface ChatLine {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Array<{
    handle: string;
    claimSummary: string;
    sourceBlockId?: number;
    evidence?: EvidenceReference;
    label?: string;
  }>;
}

const OPENING_LEARN = 'Teach me from the top.';
const SOURCE_SHARE_STORAGE_KEY = 'omakase.learn.sourceShare';
const DEFAULT_SOURCE_SHARE = 54;
const MIN_SOURCE_SHARE = 28;
const MAX_SOURCE_SHARE = 72;

function clampSourceShare(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOURCE_SHARE;
  return Math.min(MAX_SOURCE_SHARE, Math.max(MIN_SOURCE_SHARE, Math.round(value)));
}

function activityIcon(event: AgentEvent): string {
  if (event.type.includes('TOOL')) return '⌘';
  if (event.type.includes('SOURCE')) return '⌕';
  if (event.type.includes('CITATION')) return '✓';
  if (event.type.includes('CONCEPT')) return '◌';
  if (event.status === 'failed' || event.status === 'warning') return '⚠';
  if (event.status === 'succeeded') return '✓';
  return '✦';
}

function readSavedSourceShare(): number {
  if (typeof window === 'undefined') return DEFAULT_SOURCE_SHARE;
  const saved = Number(window.localStorage.getItem(SOURCE_SHARE_STORAGE_KEY));
  return clampSourceShare(saved || DEFAULT_SOURCE_SHARE);
}

function createLine(
  counter: MutableRefObject<number>,
  role: ChatLine['role'],
  text: string,
  citations?: ChatLine['citations'],
): ChatLine {
  return {
    id: `${role}-${Date.now()}-${counter.current++}`,
    role,
    text,
    citations,
  };
}

export function LearnPage() {
  const { sourceId, studioId: studioRouteId } = useParams<{
    sourceId?: string;
    studioId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const location = useLocation() as {
    state?: { studioId?: string; sourceIds?: string[]; collectionId?: string };
  };
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<string | null>(
    location.state?.studioId ?? studioRouteId ?? null,
  );
  const [source, setSource] = useState<Source | null>(null);
  const [blocks, setBlocks] = useState<SourceBlock[]>([]);
  const [message, setMessage] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activities, setActivities] = useState<AgentEvent[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceReference | null>(null);
  const [activeReferenceHandle, setActiveReferenceHandle] = useState<string | null>(null);
  const [narrowTab, setNarrowTab] = useState<'source' | 'teacher'>('teacher');
  const [sourceShare, setSourceShare] = useState(readSavedSourceShare);
  const [diag, setDiag] = useState<{
    modelId?: string;
    provider?: string;
    mock?: boolean;
  } | null>(null);
  const assistantBuffer = useRef('');
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const nextLineId = useRef(0);
  const citationsRef = useRef<
    Array<{
      handle: string;
      claimSummary: string;
      sourceBlockId?: number;
      evidence?: EvidenceReference;
      label?: string;
    }>
  >([]);
  const openedRef = useRef(false);

  const mode = searchParams.get('mode') === 'ask' ? 'research' : 'learn';
  const title = mode === 'research' ? 'Ask' : 'Learn';
  const scopeLabel = location.state?.sourceIds?.length
    ? `${location.state.sourceIds.length} selected sources`
    : location.state?.collectionId
      ? 'Collection'
      : sourceId
        ? 'This source'
        : 'Entire Studio';
  const [showDiag, setShowDiag] = useState(false);
  const splitStyle = {
    '--source-pane-share': `${sourceShare}%`,
  } as CSSProperties;

  const visibleCitations = useMemo(
    () => lines.flatMap((line) => (line.role === 'assistant' ? (line.citations ?? []) : [])),
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
    window.localStorage.setItem(SOURCE_SHARE_STORAGE_KEY, String(sourceShare));
  }, [sourceShare]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    const minHeight = message.includes('\n') ? 128 : 104;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), 280);
    textarea.style.height = `${nextHeight}px`;
  }, [message]);

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
    if ((!sourceId && !studioId) || openedRef.current) return;
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
        const sessionInput: {
          studioId: string;
          sourceId?: string;
          scope?:
            | { kind: 'selection'; sourceIds: string[] }
            | { kind: 'collection'; collectionId: string }
            | { kind: 'studio'; studioId: string };
          mode: 'learn' | 'research';
          objective: string;
        } = {
          studioId: sid,
          mode,
          objective:
            mode === 'research' ? 'Answer from sources' : 'Teach from the selected sources',
        };
        if (location.state?.sourceIds?.length) {
          sessionInput.scope = { kind: 'selection', sourceIds: location.state.sourceIds };
        } else if (location.state?.collectionId) {
          sessionInput.scope = { kind: 'collection', collectionId: location.state.collectionId };
        } else if (sourceId) {
          sessionInput.sourceId = sourceId;
        } else {
          sessionInput.scope = { kind: 'studio', studioId: sid };
        }
        const result = (await getApi().startAgentSession(sessionInput)) as {
          sessionId: string;
          runtimeContext?: { modelId?: string };
        };
        setSessionId(result.sessionId);
        setDiag({ modelId: result.runtimeContext?.modelId });
        if (mode === 'learn' && !openedRef.current) {
          openedRef.current = true;
          setBusy(true);
          setStatus('Reviewing your goal and sources…');
          setLines([createLine(nextLineId, 'user', OPENING_LEARN)]);
          await getApi().sendAgentMessage({
            sessionId: result.sessionId,
            message: OPENING_LEARN,
          });
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Could not start a learning session');
      }
    });
  }, [sourceId, studioId, mode, location.state]);

  useEffect(() => {
    if (!sessionId) return;
    void getApi()
      .listAgentActivity(sessionId)
      .then((events: AgentEvent[]) => setActivities(events))
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    const unsubscribe = getApi().subscribeToAgentStream((event: AgentStreamEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;

      if (event.type === 'activity') {
        setActivities((previous) => {
          if (previous.some((item) => item.id === event.event.id)) return previous;
          return [...previous, event.event].sort(
            (a, b) => a.createdAt - b.createdAt || a.sequence - b.sequence,
          );
        });
        setStatus(event.event.summary);
      }

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
          evidence: event.evidence,
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
          const citedBlock = blocks.find((block) => block.id === event.sourceBlockId);
          if (citedBlock?.pageStart != null) setActivePage(citedBlock.pageStart);
          setActiveReferenceHandle(event.handle);
        }
        if (event.evidence) {
          setActiveEvidence(event.evidence);
          if (event.evidence.pageNumber != null) setActivePage(event.evidence.pageNumber);
        }
      }
      if (event.type === 'final') {
        setLines((prev) => [
          ...prev,
          createLine(nextLineId, 'assistant', event.result.answerMarkdown, [
            ...citationsRef.current,
          ]),
        ]);
        assistantBuffer.current = '';
        citationsRef.current = [];
        setStreaming('');
        setBusy(false);
        setStatus(null);
      }
      if (event.type === 'error') {
        setLines((prev) => [...prev, createLine(nextLineId, 'assistant', event.message)]);
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
    setLines((prev) => [...prev, createLine(nextLineId, 'user', text)]);
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
    evidence?: EvidenceReference;
  }) => {
    if (!citation.sourceBlockId) return;
    setActiveBlockId(citation.sourceBlockId);
    const block = blocks.find((candidate) => candidate.id === citation.sourceBlockId);
    if (block?.pageStart != null) setActivePage(block.pageStart);
    if (citation.evidence) {
      setActiveEvidence(citation.evidence);
      if (citation.evidence.pageNumber != null) setActivePage(citation.evidence.pageNumber);
    }
    setActiveReferenceHandle(citation.handle);
    setNarrowTab('source');
  };

  const jumpToActivity = (activity: AgentEvent) => {
    const rawIds = activity.details.sourceBlockIds;
    if (!Array.isArray(rawIds)) return;
    const blockId = rawIds.find((value): value is number => typeof value === 'number');
    if (blockId == null) return;
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block) return;
    setActiveBlockId(block.id);
    if (block.pageStart != null) setActivePage(block.pageStart);
    setNarrowTab('source');
  };

  const updateSourceShareFromPointer = (clientX: number) => {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setSourceShare(clampSourceShare(((clientX - rect.left) / rect.width) * 100));
  };

  const beginSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateSourceShareFromPointer(event.clientX);
    document.body.classList.add('learn-resizing');

    const move = (moveEvent: globalThis.PointerEvent) => {
      updateSourceShareFromPointer(moveEvent.clientX);
    };
    const stop = () => {
      document.body.classList.remove('learn-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const handleSplitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSourceShare((share) => clampSourceShare(share - 4));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSourceShare((share) => clampSourceShare(share + 4));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSourceShare(MIN_SOURCE_SHARE);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSourceShare(MAX_SOURCE_SHARE);
    }
  };

  const renderReferences = (citations: NonNullable<ChatLine['citations']> | undefined) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="reference-list">
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
            {sourceId ? <Link to={`/sources/${sourceId}`}>Source</Link> : <span>Scope</span>}
            {studioId ? (
              <>
                {' · '}
                <Link to={`/studios/${studioId}`}>Studio</Link>
              </>
            ) : null}
          </p>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {source?.title ?? (location.state?.collectionId ? 'Collection lesson' : title)}
          </h1>
        </div>
        <div className="learn-toolbar-actions">
          <fieldset className="learn-layout-controls">
            <legend className="visually-hidden">Pane size</legend>
            <button type="button" onClick={() => setSourceShare(64)}>
              Source
            </button>
            <button type="button" onClick={() => setSourceShare(50)}>
              Even
            </button>
            <button type="button" onClick={() => setSourceShare(38)}>
              Teacher
            </button>
          </fieldset>
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
      </div>

      <div className="learn-scope">
        <span className="learn-scope-label">Learning scope</span>
        <span className="learn-scope-chip">{scopeLabel}</span>
        {studioId ? (
          <Link className="learn-scope-change" to={`/studios/${studioId}`}>
            Change
          </Link>
        ) : null}
      </div>

      {showDiag && diag?.modelId ? (
        <p className="muted diag-line">
          Dev · model {diag.modelId}
          {busy ? ' · working…' : ''}
        </p>
      ) : null}

      <div ref={splitRef} className="learn-split" style={splitStyle}>
        <section
          className={`learn-pane source-pane${narrowTab === 'source' ? ' show-mobile' : ''}`}
        >
          <h2 className="pane-label">Source</h2>
          {source?.kind === 'pdf' && source.activeVersionId ? (
            <PdfViewer
              sourceVersionId={source.activeVersionId}
              initialPage={activePage}
              highlights={
                activeEvidence && activeEvidence.sourceVersionId === source.activeVersionId
                  ? [
                      {
                        id: activeEvidence.id,
                        pageNumber: activeEvidence.pageNumber ?? activePage ?? 1,
                        quads: activeEvidence.quads,
                        active: true,
                      },
                    ]
                  : []
              }
            />
          ) : blocks.length === 0 ? (
            <p className="muted">
              {sourceId
                ? 'Content is still being prepared.'
                : 'This lesson is scoped across the selected sources. Citations will open the supporting source.'}
            </p>
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
                  <p className="source-block-text">{block.text}</p>
                </article>
              );
            })
          )}
        </section>

        <hr
          className="learn-resizer"
          aria-label="Resize source and teacher panes"
          aria-orientation="vertical"
          aria-valuemin={MIN_SOURCE_SHARE}
          aria-valuemax={MAX_SOURCE_SHARE}
          aria-valuenow={sourceShare}
          tabIndex={0}
          title="Drag to resize"
          onPointerDown={beginSplitResize}
          onKeyDown={handleSplitKeyDown}
        />

        <section
          className={`learn-pane teacher-pane${narrowTab === 'teacher' ? ' show-mobile' : ''}`}
        >
          <h2 className="pane-label">Teacher</h2>
          {status ? <p className="muted status-line">{status}</p> : null}
          {activities.length > 0 ? (
            <div className="agent-activity" aria-live="polite">
              {(() => {
                const latest = activities[activities.length - 1];
                if (!latest) return null;
                return (
                  <>
                    <div className="agent-activity-current">
                      <span aria-hidden="true">{activityIcon(latest)}</span>
                      <span>{latest.summary}</span>
                      {busy ? <span className="agent-activity-pulse" title="Active" /> : null}
                    </div>
                    <details>
                      <summary>Show activity ({activities.length})</summary>
                      <ol className="agent-activity-list">
                        {activities.map((activity) => {
                          const hasSourceTargets = Array.isArray(activity.details.sourceBlockIds);
                          return (
                            <li key={activity.id}>
                              <button
                                type="button"
                                className="agent-activity-item"
                                disabled={!hasSourceTargets}
                                onClick={() => jumpToActivity(activity)}
                              >
                                <span aria-hidden="true">{activityIcon(activity)}</span>
                                <span>{activity.summary}</span>
                                {activity.durationMs != null ? (
                                  <small>{activity.durationMs} ms</small>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  </>
                );
              })()}
            </div>
          ) : null}
          <div className="chat-log">
            {lines.length === 0 && !streaming && !busy ? (
              <p className="muted">Starting your lesson…</p>
            ) : null}
            {lines.map((line) => (
              <div key={line.id} className={`chat-bubble ${line.role}`}>
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
                  <UserPrompt text={line.text} />
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
              ref={composerRef}
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

function UserPrompt({ text }: { text: string }) {
  return (
    <div className="user-prompt">
      <span className="user-prompt-label">You asked</span>
      <p>{text}</p>
    </div>
  );
}
