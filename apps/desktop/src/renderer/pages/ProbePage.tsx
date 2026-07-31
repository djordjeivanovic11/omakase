import type { LearningMap, ProbeTurnResult } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { LearningMapView } from '../components/LearningMapView.js';

export function ProbePage() {
  const { studioId, sourceId } = useParams<{ studioId?: string; sourceId?: string }>();
  const location = useLocation() as { state?: { sourceId?: string; objective?: string } };
  const [probeId, setProbeId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [turn, setTurn] = useState(1);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [learningMap, setLearningMap] = useState<LearningMap | null>(null);
  const [busy, setBusy] = useState(false);
  const resolvedStudioId = studioId ?? null;
  const resolvedSourceId = sourceId ?? location.state?.sourceId;
  const objective = location.state?.objective ?? 'This topic';

  useEffect(() => {
    const start = async () => {
      let sid = resolvedStudioId;
      if (!sid) {
        const studios = await getApi().listStudios();
        sid = studios[0]?.id ?? null;
      }
      if (!sid) return;
      const result = (await getApi().startProbe({
        studioId: sid,
        sourceId: resolvedSourceId,
        objective,
        desiredDepth: 'explain',
      })) as { probeId: string; currentQuestion: string | null };
      setProbeId(result.probeId);
      setQuestion(result.currentQuestion);
      setTurn(1);
    };
    void start();
  }, [resolvedStudioId, resolvedSourceId, objective]);

  const submit = async () => {
    if (!probeId || !answer.trim()) return;
    setBusy(true);
    try {
      const result = (await getApi().answerProbe({
        probeId,
        answer: answer.trim(),
      })) as { result: ProbeTurnResult; completed: boolean };
      setFeedback(result.result.feedback);
      setAnswer('');
      if (result.completed) {
        setCompleted(true);
        const map = await getApi().getProbeLearningMap(probeId);
        setLearningMap(map as LearningMap);
      } else if (result.result.nextQuestion) {
        setQuestion(result.result.nextQuestion.prompt);
        setTurn((t) => t + 1);
        // Keep brief feedback visible until they start typing next answer
      }
    } finally {
      setBusy(false);
    }
  };

  if (completed && learningMap) {
    return (
      <div>
        <LearningMapView map={learningMap} />
        <div className="row" style={{ marginTop: 'var(--space-lg)' }}>
          {resolvedStudioId ? (
            <Link to={`/studios/${resolvedStudioId}`}>
              <Button variant="primary">Continue learning</Button>
            </Link>
          ) : (
            <Link to="/">
              <Button variant="primary">Continue learning</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="muted">
        {resolvedStudioId ? <Link to={`/studios/${resolvedStudioId}`}>Studio</Link> : null}
        {' · '}
        Question {turn} of about 4
      </p>
      <h1 className="page-title">Probe</h1>

      {question ? (
        <section className="stack">
          <p style={{ fontSize: '1.15rem', lineHeight: 1.5 }}>{question}</p>
          {feedback ? <p className="muted">{feedback}</p> : null}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your answer…"
          />
          <div className="row">
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={busy || !answer.trim()}
            >
              Submit answer
            </Button>
            {resolvedStudioId ? (
              <Link to={`/studios/${resolvedStudioId}`}>
                <Button variant="ghost">Stop Probe</Button>
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="muted">Preparing your first question…</p>
      )}
    </div>
  );
}
