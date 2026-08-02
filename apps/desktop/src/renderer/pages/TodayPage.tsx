import type { NextAction, TodayView } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

function PrimaryAction({ action }: { action: NextAction }) {
  const navigate = useNavigate();
  const continueLearning = () => {
    if (action.sourceId) {
      navigate(`/sources/${action.sourceId}/learn`, {
        state: { studioId: action.studioId ?? undefined },
      });
      return;
    }
    if (action.studioId) navigate(`/studios/${action.studioId}`);
  };

  return (
    <section className="hero-action">
      {action.studioName ? <p className="muted">{action.studioName}</p> : null}
      <h2>{action.title}</h2>
      <p>{action.rationale}</p>
      <div className="row">
        <Button variant="primary" onClick={continueLearning}>
          Continue learning
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void getApi()
              .dismissTodayAction(action.id)
              .then(() => window.location.reload())
          }
        >
          Not now
        </Button>
      </div>
    </section>
  );
}

export function TodayPage() {
  const [view, setView] = useState<TodayView | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([getApi().listToday(), getApi().listInboxSources()])
      .then(([today, inbox]) => {
        setView(today);
        setInboxCount(inbox.length);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading your day…</p>;

  return (
    <div>
      <h1 className="page-title">Today</h1>
      <p className="page-lead">The next useful step — nothing more.</p>

      {!view?.primary && view?.secondary.length === 0 ? (
        <section className="hero-action">
          <h2>Begin</h2>
          <p>Create a studio and add a source to get your first recommendation.</p>
          <Link to="/studios">
            <Button variant="primary">Go to Studios</Button>
          </Link>
        </section>
      ) : null}

      {view?.primary ? <PrimaryAction action={view.primary} /> : null}

      {inboxCount > 0 ? (
        <p className="muted">
          <Link to="/inbox">
            {inboxCount} item{inboxCount === 1 ? '' : 's'} waiting in Inbox
          </Link>
        </p>
      ) : null}

      {view?.secondary && view.secondary.length > 0 ? (
        <section style={{ marginTop: 'var(--space-lg)' }}>
          <h3 className="pane-label">Also</h3>
          {view.secondary.map((action) => (
            <div key={action.id} className="list-row">
              <strong>{action.title}</strong>
              <p className="muted">{action.rationale}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
