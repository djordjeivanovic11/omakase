import type { AgentStreamEvent } from '@omakase/contracts';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { CitationChip } from '../components/CitationChip.js';

interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
  citations?: Array<{ handle: string; claimSummary: string; sourceBlockId?: number }>;
}

export function LearnPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation() as { state?: { studioId?: string } };
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<string | null>(location.state?.studioId ?? null);
  const [message, setMessage] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const assistantBuffer = useRef('');
  const citationsRef = useRef<
    Array<{ handle: string; claimSummary: string; sourceBlockId?: number }>
  >([]);

  const mode = searchParams.get('mode') === 'ask' ? 'research' : 'learn';
  const title = mode === 'research' ? 'Ask' : 'Learn';

  useEffect(() => {
    if (!sourceId) return;
    const resolveStudio = async () => {
      if (studioId) return studioId;
      const studios = await getApi().listStudios();
      if (studios[0]) {
        setStudioId(studios[0].id);
        return studios[0].id;
      }
      return null;
    };

    void resolveStudio().then((sid) => {
      if (!sid) return;
      void getApi()
        .startAgentSession({
          studioId: sid,
          sourceId,
          mode,
          objective: mode === 'research' ? 'Answer from sources' : 'Learn from this source',
        })
        .then((result: { sessionId: string }) => setSessionId(result.sessionId));
    });
  }, [sourceId, studioId, mode]);

  useEffect(() => {
    const unsubscribe = getApi().subscribeToAgentStream((event: AgentStreamEvent) => {
      if (sessionId && event.sessionId !== sessionId) return;

      if (event.type === 'text-delta') {
        assistantBuffer.current += event.delta;
        setStreaming(assistantBuffer.current);
      }
      if (event.type === 'citation') {
        citationsRef.current.push({
          handle: event.handle,
          claimSummary: event.claimSummary,
          sourceBlockId: event.sourceBlockId,
        });
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
      }
      if (event.type === 'error') {
        setLines((prev) => [...prev, { role: 'assistant', text: event.message }]);
        setBusy(false);
      }
      if (event.type === 'cancelled') {
        setBusy(false);
      }
    });
    return unsubscribe;
  }, [sessionId]);

  const send = async () => {
    if (!sessionId || !message.trim()) return;
    const text = message.trim();
    setLines((prev) => [...prev, { role: 'user', text }]);
    setMessage('');
    setBusy(true);
    assistantBuffer.current = '';
    citationsRef.current = [];
    await getApi().sendAgentMessage({ sessionId, message: text });
  };

  return (
    <div>
      <p className="muted">
        <Link to={`/sources/${sourceId}`}>Source</Link>
      </p>
      <h1 className="page-title">{title}</h1>

      <div className="chat-log">
        {lines.map((line, index) => (
          <div key={`${line.role}-${index}`} className={`chat-bubble ${line.role}`}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{line.text}</p>
            {line.citations?.map((c) => (
              <CitationChip
                key={c.handle}
                handle={c.handle}
                summary={c.claimSummary}
                sourceId={sourceId}
                blockId={c.sourceBlockId}
                onNavigate={(sid, blockId) => {
                  navigate(`/sources/${sid}${blockId ? `#block-${blockId}` : ''}`);
                }}
              />
            ))}
          </div>
        ))}
        {streaming ? (
          <div className="chat-bubble assistant">
            <p style={{ whiteSpace: 'pre-wrap' }}>{streaming}</p>
          </div>
        ) : null}
      </div>

      <div className="card stack">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={mode === 'research' ? 'Ask a question…' : 'What would you like to explore?'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <div className="row">
          <Button variant="primary" onClick={() => void send()} disabled={busy || !sessionId}>
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
    </div>
  );
}
