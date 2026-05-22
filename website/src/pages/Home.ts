import { createElement, useHead } from '@asymmetric-effort/specifyjs';

export function Home(): ReturnType<typeof createElement> {
  useHead({
    title: 'Steamroller \u2014 Zero-Dependency JavaScript Module Bundler',
    description: 'A zero-dependency TypeScript reimplementation of rollup with 100% feature parity and 100% API compatibility.',
    keywords: 'steamroller, rollup, bundler, javascript, typescript, zero-dependency',
    canonical: 'https://steamroller.asymmetric-effort.com',
    og: {
      title: 'Steamroller \u2014 Zero-Dependency JavaScript Module Bundler',
      type: 'website',
      url: 'https://steamroller.asymmetric-effort.com',
    },
  });

  return createElement('div', null,
    createElement('section', { className: 'hero' },
      createElement('img', { src: '/logo.png', alt: 'Steamroller', className: 'hero-logo', width: 96, height: 96 }),
      createElement('h1', null, 'Steamroller'),
      createElement('p', { className: 'hero-subtitle' },
        'A zero-dependency TypeScript reimplementation of ',
        createElement('a', { href: 'https://rollupjs.org', target: '_blank', rel: 'noopener noreferrer' }, 'rollup'),
        ' with 100% feature parity.',
      ),
      createElement('div', { className: 'hero-badges' },
        createElement('span', { className: 'badge' }, 'TypeScript'),
        createElement('span', { className: 'badge badge-primary' }, 'Zero Dependencies'),
        createElement('span', { className: 'badge' }, 'MIT License'),
        createElement('span', { className: 'badge' }, 'Node \u2265 18'),
      ),
    ),

    createElement('section', { className: 'section' },
      createElement('h2', null, 'Installation'),
      createElement('pre', null,
        createElement('code', null, 'npm install steamroller'),
      ),
    ),

    createElement('section', { className: 'section' },
      createElement('h2', null, 'Quick Start'),
      createElement('pre', null,
        createElement('code', null,
          'import { rollup } from \'steamroller\';\n\n' +
          'const bundle = await rollup({\n' +
          '  input: \'src/main.js\',\n' +
          '});\n\n' +
          'await bundle.write({\n' +
          '  file: \'dist/bundle.js\',\n' +
          '  format: \'es\',\n' +
          '});\n\n' +
          'await bundle.close();',
        ),
      ),
    ),

    createElement('section', { className: 'section' },
      createElement('h2', null, 'Why Steamroller?'),
      createElement('div', { className: 'feature-grid' },
        featureCard('Zero Dependencies', 'No node_modules at runtime. Reduced supply chain risk and smaller install footprint.'),
        featureCard('Pure TypeScript', 'No native code, no WASM, no build-time code generation. Runs anywhere Node.js runs.'),
        featureCard('Drop-in Compatible', 'Same API, same types, same plugin system. Migrate from rollup with a one-line change.'),
        featureCard('MIT Licensed', 'All code is original. No license conflicts, no legal concerns.'),
      ),
    ),
  );
}

function featureCard(title: string, description: string): ReturnType<typeof createElement> {
  return createElement('div', { className: 'feature-card' },
    createElement('h3', null, title),
    createElement('p', null, description),
  );
}
