import { createElement, Link } from '@asymmetric-effort/specifyjs';

export function Nav(): ReturnType<typeof createElement> {
  return createElement('nav', { className: 'nav', role: 'navigation', 'aria-label': 'Main navigation' },
    createElement(Link, { to: '/', className: 'nav-brand', exact: true }, 'steamroller'),
    createElement('div', { className: 'nav-links' },
      createElement(Link, { to: '/', activeClassName: 'active', exact: true }, 'Home'),
      createElement(Link, { to: '/features', activeClassName: 'active' }, 'Features'),
      createElement(Link, { to: '/cli', activeClassName: 'active' }, 'CLI'),
      createElement(Link, { to: '/api', activeClassName: 'active' }, 'API'),
    ),
  );
}
