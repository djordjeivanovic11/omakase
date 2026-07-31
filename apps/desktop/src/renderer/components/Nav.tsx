import { NavLink } from 'react-router';

export function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <nav className="app-nav" aria-label="Main">
      <div className="app-nav-inner">
        <span className="app-brand">Omakase</span>
        <div className="app-nav-links">
          <NavLink to="/" end className={linkClass}>
            Today
          </NavLink>
          <NavLink to="/studios" className={linkClass}>
            Studios
          </NavLink>
          <NavLink to="/inbox" className={linkClass}>
            Inbox
          </NavLink>
          <NavLink to="/you" className={linkClass}>
            You
          </NavLink>
        </div>
      </div>
      <style>{`
        .app-nav {
          border-bottom: 1px solid var(--color-border);
          background: var(--color-surface);
        }
        .app-nav-inner {
          max-width: calc(var(--max-width) + var(--space-lg) * 2);
          margin: 0 auto;
          padding: var(--space-md) var(--space-lg);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-lg);
        }
        .app-brand {
          font-family: var(--font-serif);
          font-size: 1.25rem;
          font-weight: 600;
        }
        .app-nav-links {
          display: flex;
          gap: var(--space-lg);
        }
        .nav-link {
          text-decoration: none;
          color: var(--color-text-muted);
          padding-bottom: 2px;
          border-bottom: 2px solid transparent;
        }
        .nav-link.active {
          color: var(--color-text);
          border-bottom-color: var(--color-accent);
        }
      `}</style>
    </nav>
  );
}
