/**
 * @module plugins/css-plugin
 * @description Built-in CSS plugin for steamroller.
 * Handles .css file imports: plain CSS is collected and emitted as an asset,
 * while .module.css files are transformed into JS modules exporting
 * scoped class name mappings alongside the emitted CSS asset.
 */

import type { Plugin, TransformResult, LoadResult } from "../types.js";
import { parseCSS } from "../css/css-parser.js";
import { printCSS } from "../css/css-printer.js";
import { processCSSModule, generateJSMapping } from "../css/css-modules.js";
import { minifyCSS } from "../css/css-minifier.js";

/** Options for the CSS plugin. */
export interface CSSPluginOptions {
  /** Whether to minify CSS output. Default: false. */
  readonly minify?: boolean;
  /** Whether to enable CSS Modules for .module.css files. Default: true. */
  readonly modules?: boolean;
}

/**
 * Check whether a file path is a CSS file.
 *
 * @param id - The module ID / file path.
 * @returns True if the file has a .css extension.
 */
export const isCSSFile = (id: string): boolean => {
  return /\.css$/.test(id);
};

/**
 * Check whether a file path is a CSS Module file.
 *
 * @param id - The module ID / file path.
 * @returns True if the file has a .module.css extension.
 */
export const isCSSModuleFile = (id: string): boolean => {
  return /\.module\.css$/.test(id);
};

/**
 * Create the built-in CSS plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles .css and .module.css imports.
 */
export const cssPlugin = (options?: CSSPluginOptions): Plugin => {
  const minify = options?.minify ?? false;
  const enableModules = options?.modules ?? true;
  const collectedCSS = new Map<string, string>();

  return {
    name: "steamroller:css",

    resolveId(source: string, importer: string | undefined) {
      if (!isCSSFile(source)) {
        return null;
      }
      // Let the default resolver handle path resolution
      return null;
    },

    load(id: string): LoadResult {
      if (!isCSSFile(id)) {
        return null;
      }
      // Let the default loader read the file; we transform in transform hook
      return null;
    },

    transform(code: string, id: string): TransformResult {
      if (!isCSSFile(id)) {
        return null;
      }

      const ast = parseCSS(code);

      // CSS Modules: .module.css files
      if (enableModules && isCSSModuleFile(id)) {
        const result = processCSSModule(ast, id);
        let finalAST = result.ast;

        if (minify) {
          finalAST = minifyCSS(finalAST);
        }

        const cssOutput = printCSS(finalAST, { minify });
        collectedCSS.set(id, cssOutput);

        // Emit the CSS as an asset
        const assetFileName = id
          .replace(/^.*\//, "")
          .replace(/\.module\.css$/, ".css");

        // Generate JS module with class name mapping
        const jsMapping = generateJSMapping(result.mapping, result.composes);

        // Return JS code that the bundler can process
        const jsCode = [
          jsMapping.trim(),
          `/* CSS Module: ${assetFileName} */`,
        ].join("\n");

        return {
          code: jsCode,
          map: { mappings: "" },
          meta: {
            css: cssOutput,
            cssModuleMapping: result.mapping,
          },
        };
      }

      // Plain CSS: side-effect import
      let finalAST = ast;
      if (minify) {
        finalAST = minifyCSS(finalAST);
      }

      const cssOutput = printCSS(finalAST, { minify });
      collectedCSS.set(id, cssOutput);

      // Return an empty JS module - CSS is collected as a side effect
      return {
        code: `/* CSS: ${id.replace(/^.*\//, "")} */\nexport default undefined;\n`,
        map: { mappings: "" },
        meta: {
          css: cssOutput,
        },
      };
    },

    generateBundle() {
      // Emit collected CSS as assets
      for (const [id, css] of collectedCSS) {
        const fileName = id
          .replace(/^.*\//, "")
          .replace(/\.module\.css$/, ".css");
        if (typeof this?.emitFile === "function") {
          this.emitFile({
            type: "asset",
            name: fileName,
            source: css,
          });
        }
      }
    },
  };
};

/**
 * Check whether any input files or their dependencies import CSS files,
 * and if so, check whether a CSS plugin is already registered.
 * Returns the built-in plugin if needed, or null if not.
 *
 * @param inputFiles - Array of input file paths.
 * @param existingPlugins - Currently registered plugins.
 * @returns The css plugin if needed, or null.
 */
export const maybeCreateCSSPlugin = (
  inputFiles: ReadonlyArray<string>,
  existingPlugins: ReadonlyArray<Plugin>,
): Plugin | null => {
  const hasCSSInputs = inputFiles.some((file) => isCSSFile(file));

  // Even if no direct CSS inputs, auto-register for CSS imports found during bundling
  // Check if a CSS plugin is already registered
  const cssPluginNames = [
    "css",
    "steamroller:css",
    "rollup-plugin-css-only",
    "rollup-plugin-postcss",
    "@rollup/plugin-css",
  ];

  const hasExistingCSSPlugin = existingPlugins.some((plugin) =>
    cssPluginNames.some(
      (name) =>
        plugin.name === name || plugin.name.toLowerCase().includes("css"),
    ),
  );

  if (hasExistingCSSPlugin) {
    return null;
  }

  // Auto-register the CSS plugin - it will only activate for .css imports
  return cssPlugin();
};
