import type { NextAction, TodayView } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

function ActionCard({ action, primary = false }: { action: NextAction; primary?: boolean }) {
  const navigate = useNavigate();
  const api = getApi();

  const continueLearning = () => {
    if (action.sourceId) {
      navigate(`/sources/${action.sourceId}/learn`, {
        state: { studioId: action.studioId ?? undefined },
      });
      return;
    }
    if (action.studioId) {
      navigate(`/studios/${action.studioId}`);
    }
  };

  return (
    <article className={`card ${primary ? 'primary-action' : ''}`}>
      {action.studioName ? <p className="muted">{action.studioName}</p> : null}
      <h2>{action.title}</h2>
      <p>{action.rationale}</p>
      <div className="row">
        <Button variant={primary ? 'primary' : 'secondary'} onClick={continueLearning}>
          {primary ? 'Continue learning' : 'Open'}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void api.dismissTodayAction(action.id).then(() => window.location.reload())
          }
        >
          Not now
        </Button>
      </div>
      <style>{`
        .primary-action {
          border-color: var(--color-accent);
          background: linear-gradient(180deg, #fff, var(--color-accent-soft));
        }
        .primary-action h2 {
          font-size: 1.75rem;
        }
      `}</style>
    </article>
  );
}

export function TodayPage() {
  const [view, setView] = useState<TodayView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getApi()
      .listToday()
      .then(setView)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading your day…</p>;

  return (
    <div>
      <h1 className="page-title">Today</h1>
      <p className="page-lead">One clear next step — not an endless feed.</p>

      {!view?.primary && view?.secondary.length === 0 ? (
        <div className="card">
          <h2>Welcome</h2>
          <p>Create a studio and add a source to get your first recommendation.</p>
          <Link to="/studios">
            <Button variant="primary">Go to Studios</Button>
          </Link>
        </div>
      ) : null}

      {view?.primary ? <ActionCard action={view.primary} primary /> : null}

      {view?.secondary && view.secondary.length > 0 ? (
        <section className="stack" style={{ marginTop: 'var(--space-lg)' }}>
          <h3>Also on your list</h3>
          {view.secondary.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
