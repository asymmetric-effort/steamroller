import { defineConfig } from "vite";
import {
  specifyJsSeoPlugin,
  specifyJsNoscriptPlugin,
} from "@asymmetric-effort/specifyjs/build";

export default defineConfig({
  plugins: [
    specifyJsSeoPlugin({
      siteUrl: "https://steamroller.asymmetric-effort.com",
      title: "Steamroller",
      description:
        "A zero-dependency TypeScript reimplementation of rollup with 100% feature parity and API compatibility.",
      routes: ["/", "/features", "/cli", "/api"],
      npmPackage: "steamroller",
      author: "Asymmetric Effort, LLC",
      license: "MIT",
      repository: "https://github.com/asymmetric-effort/steamroller",
      robotsRules: ["User-agent: *", "Allow: /"],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "SoftwareSourceCode",
        name: "Steamroller",
        description:
          "A zero-dependency TypeScript reimplementation of rollup with 100% feature parity.",
        url: "https://steamroller.asymmetric-effort.com",
        codeRepository: "https://github.com/asymmetric-effort/steamroller",
        programmingLanguage: "TypeScript",
        license: "https://opensource.org/licenses/MIT",
        author: {
          "@type": "Organization",
          name: "Asymmetric Effort, LLC",
        },
      },
    }),
    specifyJsNoscriptPlugin({
      title: "Steamroller",
      description:
        "A zero-dependency TypeScript reimplementation of rollup with 100% feature parity.",
      sections: [
        {
          id: "home",
          title: "Home",
          html: "<h1>Steamroller</h1><p>A zero-dependency TypeScript reimplementation of rollup with 100% feature parity and 100% API compatibility.</p><h2>Installation</h2><pre><code>npm install steamroller</code></pre>",
        },
        {
          id: "features",
          title: "Features",
          html: "<h2>Features</h2><ul><li>Zero runtime dependencies</li><li>Pure TypeScript — no native code</li><li>Drop-in rollup replacement</li><li>6 output formats (ES, CJS, UMD, AMD, IIFE, SystemJS)</li><li>Statement-level tree-shaking</li><li>27-hook plugin system</li><li>Full source map support</li><li>Watch mode with incremental rebuilds</li></ul>",
        },
        {
          id: "cli",
          title: "CLI",
          html: "<h2>CLI Usage</h2><pre><code>npx steamroller src/main.js --file dist/bundle.js --format es</code></pre>",
        },
        {
          id: "api",
          title: "API",
          html: '<h2>JavaScript API</h2><pre><code>import { rollup } from "steamroller";</code></pre>',
        },
      ],
      copyright: "MIT License (c) 2026 Asymmetric Effort, LLC",
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
