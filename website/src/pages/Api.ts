import { createElement, useHead } from "@asymmetric-effort/specifyjs";

export function Api(): ReturnType<typeof createElement> {
  useHead({
    title: "API Reference \u2014 Steamroller",
    description:
      "JavaScript API reference for Steamroller. rollup(), watch(), defineConfig(), parseAst(), and more.",
    canonical: "https://steamroller.asymmetric-effort.com/#/api",
  });

  return createElement(
    "div",
    null,
    createElement("h1", null, "API Reference"),
    createElement(
      "p",
      { className: "page-subtitle" },
      "Steamroller exports the same API as rollup for drop-in compatibility.",
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Entry Points"),
      createElement(
        "table",
        { className: "table" },
        createElement(
          "thead",
          null,
          createElement(
            "tr",
            null,
            createElement("th", null, "Import Path"),
            createElement("th", null, "Exports"),
          ),
        ),
        createElement(
          "tbody",
          null,
          createElement(
            "tr",
            null,
            createElement(
              "td",
              null,
              createElement("code", null, "steamroller"),
            ),
            createElement("td", null, "rollup, watch, defineConfig, VERSION"),
          ),
          createElement(
            "tr",
            null,
            createElement(
              "td",
              null,
              createElement("code", null, "steamroller/parseAst"),
            ),
            createElement("td", null, "parseAst, parseAstAsync"),
          ),
          createElement(
            "tr",
            null,
            createElement(
              "td",
              null,
              createElement("code", null, "steamroller/loadConfigFile"),
            ),
            createElement("td", null, "loadConfigFile"),
          ),
          createElement(
            "tr",
            null,
            createElement(
              "td",
              null,
              createElement("code", null, "steamroller/getLogFilter"),
            ),
            createElement("td", null, "getLogFilter"),
          ),
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "rollup()"),
      createElement(
        "p",
        null,
        "The main bundling function. Returns a RollupBuild object.",
      ),
      createElement(
        "pre",
        null,
        createElement(
          "code",
          null,
          "import { rollup } from 'steamroller';\n\n" +
            "const bundle = await rollup({\n" +
            "  input: 'src/main.js',\n" +
            "  plugins: [/* ... */],\n" +
            "  external: ['lodash'],\n" +
            "});\n\n" +
            "// Generate output in memory\n" +
            "const { output } = await bundle.generate({\n" +
            "  format: 'es',\n" +
            "  sourcemap: true,\n" +
            "});\n\n" +
            "// Or write to disk\n" +
            "await bundle.write({\n" +
            "  dir: 'dist',\n" +
            "  format: 'es',\n" +
            "  sourcemap: true,\n" +
            "});\n\n" +
            "// Always close when done\n" +
            "await bundle.close();",
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "watch()"),
      createElement("p", null, "Watch files and rebuild on changes."),
      createElement(
        "pre",
        null,
        createElement(
          "code",
          null,
          "import { watch } from 'steamroller';\n\n" +
            "const watcher = watch({\n" +
            "  input: 'src/main.js',\n" +
            "  output: {\n" +
            "    dir: 'dist',\n" +
            "    format: 'es',\n" +
            "  },\n" +
            "});\n\n" +
            "watcher.on('event', (event) => {\n" +
            "  if (event.code === 'BUNDLE_END') {\n" +
            "    console.log(`Built in ${event.duration}ms`);\n" +
            "    event.result.close();\n" +
            "  }\n" +
            "});\n\n" +
            "// Stop watching\n" +
            "await watcher.close();",
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "defineConfig()"),
      createElement("p", null, "Type helper for configuration files."),
      createElement(
        "pre",
        null,
        createElement(
          "code",
          null,
          "// steamroller.config.mjs\n" +
            "import { defineConfig } from 'steamroller';\n\n" +
            "export default defineConfig({\n" +
            "  input: 'src/main.js',\n" +
            "  output: {\n" +
            "    file: 'dist/bundle.js',\n" +
            "    format: 'es',\n" +
            "  },\n" +
            "});",
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "parseAst()"),
      createElement(
        "p",
        null,
        "Standalone JavaScript parser producing ESTree-compatible ASTs.",
      ),
      createElement(
        "pre",
        null,
        createElement(
          "code",
          null,
          "import { parseAst } from 'steamroller/parseAst';\n\n" +
            "const ast = parseAst('const x = 42;');\n" +
            "console.log(ast.body[0].type);\n" +
            '// => "VariableDeclaration"',
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Migration from Rollup"),
      createElement(
        "p",
        null,
        "Steamroller is a drop-in replacement. Migration requires minimal changes:",
      ),
      createElement(
        "pre",
        null,
        createElement(
          "code",
          null,
          "// Before\n" +
            "import { rollup } from 'rollup';\n\n" +
            "// After\n" +
            "import { rollup } from 'steamroller';",
        ),
      ),
      createElement(
        "p",
        null,
        "All @rollup/plugin-* packages work without modification.",
      ),
    ),
  );
}
