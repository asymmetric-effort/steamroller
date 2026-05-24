import { createElement, useHead } from "@asymmetric-effort/specifyjs";

export function Features(): ReturnType<typeof createElement> {
  useHead({
    title: "Features \u2014 Steamroller",
    description:
      "Full feature list for Steamroller: tree-shaking, code splitting, 6 output formats, 27-hook plugin system, source maps, watch mode.",
    canonical: "https://steamroller.asymmetric-effort.com/#/features",
  });

  return createElement(
    "div",
    null,
    createElement("h1", null, "Features"),
    createElement(
      "p",
      { className: "page-subtitle" },
      "Everything rollup does, steamroller does \u2014 with zero dependencies.",
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Output Formats"),
      createElement(
        "table",
        { className: "table" },
        createElement(
          "thead",
          null,
          createElement(
            "tr",
            null,
            createElement("th", null, "Format"),
            createElement("th", null, "Aliases"),
            createElement("th", null, "Description"),
          ),
        ),
        createElement(
          "tbody",
          null,
          formatRow("es", "esm, module", "ES modules with import/export"),
          formatRow("cjs", "commonjs", "CommonJS with require/module.exports"),
          formatRow(
            "umd",
            "\u2014",
            "Universal Module Definition (CJS + AMD + global)",
          ),
          formatRow(
            "amd",
            "\u2014",
            "Asynchronous Module Definition (RequireJS)",
          ),
          formatRow(
            "iife",
            "\u2014",
            "Immediately Invoked Function Expression",
          ),
          formatRow("system", "systemjs", "SystemJS register format"),
        ),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Core Capabilities"),
      createElement(
        "ul",
        { className: "feature-list" },
        li(
          "Statement-level tree-shaking with multi-pass dead code elimination",
        ),
        li("Code splitting via dynamic imports and multiple entry points"),
        li("27-hook plugin system compatible with @rollup/plugin-* ecosystem"),
        li(
          "Full source map support (separate, inline, hidden) with composition",
        ),
        li("Watch mode with incremental rebuilds and file change detection"),
        li("Virtual filesystem abstraction for in-memory bundling"),
        li("JSX transform support (classic and automatic modes)"),
        li("Import attributes / assertions support"),
        li("Configurable interop modes for CJS/ESM compatibility"),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Tree-Shaking"),
      createElement(
        "p",
        null,
        "Steamroller performs statement-level tree-shaking with configurable side-effect detection:",
      ),
      createElement(
        "ul",
        { className: "feature-list" },
        li("Multi-pass iterative algorithm that converges to minimal output"),
        li("Three presets: recommended (default), smallest, safest"),
        li(
          "Pure annotations: /*@__PURE__*/, /*#__PURE__*/, /*@__NO_SIDE_EFFECTS__*/",
        ),
        li("Configurable property read side effects, try-catch deoptimization"),
        li("Manual pure function declarations"),
        li("eval() scope deoptimization"),
      ),
    ),

    createElement(
      "section",
      { className: "section" },
      createElement("h2", null, "Plugin System"),
      createElement(
        "p",
        null,
        "27 hooks across build, output, and watch phases:",
      ),
      createElement(
        "table",
        { className: "table" },
        createElement(
          "thead",
          null,
          createElement(
            "tr",
            null,
            createElement("th", null, "Phase"),
            createElement("th", null, "Hooks"),
          ),
        ),
        createElement(
          "tbody",
          null,
          createElement(
            "tr",
            null,
            createElement("td", null, "Build"),
            createElement(
              "td",
              null,
              "options, buildStart, resolveId, resolveDynamicImport, load, shouldTransformCachedModule, transform, moduleParsed, buildEnd",
            ),
          ),
          createElement(
            "tr",
            null,
            createElement("td", null, "Output"),
            createElement(
              "td",
              null,
              "outputOptions, renderStart, renderDynamicImport, resolveFileUrl, resolveImportMeta, banner, footer, intro, outro, renderChunk, augmentChunkHash, generateBundle, writeBundle, renderError, closeBundle",
            ),
          ),
          createElement(
            "tr",
            null,
            createElement("td", null, "Watch"),
            createElement("td", null, "watchChange, closeWatcher"),
          ),
          createElement(
            "tr",
            null,
            createElement("td", null, "Cross-cutting"),
            createElement("td", null, "onLog"),
          ),
        ),
      ),
    ),
  );
}

function formatRow(
  format: string,
  aliases: string,
  description: string,
): ReturnType<typeof createElement> {
  return createElement(
    "tr",
    null,
    createElement("td", null, createElement("code", null, format)),
    createElement("td", null, aliases),
    createElement("td", null, description),
  );
}

function li(text: string): ReturnType<typeof createElement> {
  return createElement("li", null, text);
}
