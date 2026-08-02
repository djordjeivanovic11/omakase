import type { Studio } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

export function StudiosPage() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void getApi().listStudios().then(setStudios);
  }, []);

  const refresh = () => {
    void getApi().listStudios().then(setStudios);
  };

  const createStudio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await getApi().createStudio({
        name: name.trim(),
        primaryObjective: objective.trim() || undefined,
      });
      setName('');
      setObjective('');
      setOpen(false);
      refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}
      >
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>
            Studios
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Focused spaces for what you are learning right now.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          + New Studio
        </Button>
      </div>

      {studios.length === 0 ? (
        <p className="muted">No studios yet. Create one to begin.</p>
      ) : (
        <section>
          {studios.map((studio) => (
            <article key={studio.id} className="list-row">
              <h2 style={{ marginBottom: '0.35rem', fontSize: '1.35rem' }}>
                <Link to={`/studios/${studio.id}`}>{studio.name}</Link>
              </h2>
              {studio.primaryObjective ? <p>{studio.primaryObjective}</p> : null}
            </article>
          ))}
        </section>
      )}

      {open ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-sheet stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-studio-title"
            onSubmit={createStudio}
          >
            <h2 id="new-studio-title">New studio</h2>
            <div className="form-field">
              <label htmlFor="studio-name">Name</label>
              <input
                id="studio-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="studio-objective">What do you want to understand?</label>
              <textarea
                id="studio-objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>
            <div className="row">
              <Button variant="primary" type="submit" disabled={creating}>
                Create
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
