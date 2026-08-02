import type { LearningMap } from '@omakase/contracts';

interface LearningMapViewProps {
  map: LearningMap;
}

export function LearningMapView({ map }: LearningMapViewProps) {
  return (
    <div className="learning-map">
      <h2 className="page-title" style={{ fontSize: '1.5rem' }}>
        Learning map
      </h2>

      <section>
        <h3>Solid</h3>
        {map.secure.length === 0 ? (
          <p className="muted">
            Nothing is solid yet — that takes clear evidence from your answers.
          </p>
        ) : (
          <ul>
            {map.secure.map((c) => (
              <li key={c.conceptId}>
                ✓ {c.conceptName}
                {c.confidence != null ? (
                  <span className="muted"> · confidence {(c.confidence * 100).toFixed(0)}%</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Developing</h3>
        {map.uncertain.length === 0 ? (
          <p className="muted">No developing concepts recorded for this probe.</p>
        ) : (
          <ul>
            {map.uncertain.map((c) => (
              <li key={c.conceptId}>◐ {c.conceptName}</li>
            ))}
          </ul>
        )}
      </section>

      {map.misconceptions.length > 0 ? (
        <section>
          <h3>Watch for</h3>
          <ul>
            {map.misconceptions.map((m) => (
              <li key={m.conceptId}>
                {m.conceptName}: {m.description}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {map.nextAction ? (
        <section>
          <h3>Next</h3>
          <p>{map.nextAction.title}</p>
          <p className="muted">{map.nextAction.rationale}</p>
        </section>
      ) : null}
    </div>
  );
}
