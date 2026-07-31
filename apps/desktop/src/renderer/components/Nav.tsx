import { NavLink } from 'react-router';

const primary = [
  { to: '/', label: 'Today', end: true },
  { to: '/inbox', label: 'Inbox' },
  { to: '/studios', label: 'Studios' },
  { to: '/you', label: 'You' },
] as const;

export function Nav() {
  return (
    <aside className="app-sidebar" aria-label="Primary">
      <div className="sidebar-brand">Omakase</div>
      <nav className="sidebar-nav">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <NavLink to="/you" className="sidebar-link muted-link">
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
