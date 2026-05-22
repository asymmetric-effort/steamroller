import { createElement } from '@asymmetric-effort/specifyjs';

export function Footer(): ReturnType<typeof createElement> {
  return createElement('footer', { className: 'footer', role: 'contentinfo' },
    createElement('div', { className: 'footer-inner' },
      createElement('span', null, 'v0.0.0'),
      createElement('span', null, 'MIT License (c) 2026 Asymmetric Effort, LLC'),
      createElement('span', null,
        createElement('a', { href: 'https://github.com/asymmetric-effort/steamroller', target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
        ' \u00b7 ',
        createElement('a', { href: 'https://github.com/asymmetric-effort/steamroller/blob/main/SECURITY.md', target: '_blank', rel: 'noopener noreferrer' }, 'Security'),
        ' \u00b7 ',
        createElement('a', { href: 'https://github.com/asymmetric-effort/steamroller/blob/main/CONTRIBUTING.md', target: '_blank', rel: 'noopener noreferrer' }, 'Contributing'),
      ),
    ),
  );
}
