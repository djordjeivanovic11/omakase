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
      refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Studios</h1>
      <p className="page-lead">Focused spaces for what you are learning right now.</p>

      <form className="card stack" onSubmit={createStudio}>
        <h2>New studio</h2>
        <div className="form-field">
          <label htmlFor="studio-name">Name</label>
          <input id="studio-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="studio-objective">What do you want to understand?</label>
          <textarea
            id="studio-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </div>
        <Button variant="primary" type="submit" disabled={creating}>
          Create studio
        </Button>
      </form>

      <section className="stack" style={{ marginTop: 'var(--space-xl)' }}>
        {studios.length === 0 ? (
          <p className="muted">No studios yet.</p>
        ) : (
          studios.map((studio) => (
            <article key={studio.id} className="card">
              <h2>
                <Link to={`/studios/${studio.id}`}>{studio.name}</Link>
              </h2>
              {studio.primaryObjective ? <p>{studio.primaryObjective}</p> : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
