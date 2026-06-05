/**
 * @module plugins/vue-plugin
 * @description Built-in Vue Single File Component (.vue) plugin for steamroller.
 * Handles .vue file imports by parsing SFC blocks via the sfc-parser,
 * extracting script/scriptSetup content through the JS/TS pipeline,
 * processing style blocks through the CSS pipeline, generating scoped
 * CSS when needed, and combining everything into a JS module export.
 */

import type { Plugin, TransformResult, LoadResult } from "../types.js";
import { parseSfc } from "../html/sfc-parser.js";
import type { SfcBlock } from "../html/sfc-parser.js";
import { scopeCSS, generateScopeId } from "../css/scoped-css.js";

/** Options for the Vue plugin. */
export interface VuePluginOptions {
  /** Whether to enable scoped CSS processing. Default: true. */
  readonly scoped?: boolean;
}

/**
 * Check whether a file path is a Vue SFC file.
 *
 * @param id - The module ID / file path.
 * @returns True if the file has a .vue extension.
 */
export const isVueFile = (id: string): boolean => {
  return /\.vue$/.test(id);
};

/**
 * Get the value of a named attribute from an SFC block.
 *
 * @param block - The SFC block.
 * @param name - The attribute name to look for.
 * @returns The attribute value, or null if not found.
 */
const getBlockAttr = (block: SfcBlock, name: string): string | null => {
  const attr = block.attrs.find((a) => a.name.toLowerCase() === name);
  return attr ? attr.value : null;
};

/**
 * Check whether an SFC block has a boolean attribute (no value).
 *
 * @param block - The SFC block.
 * @param name - The attribute name to look for.
 * @returns True if the attribute is present.
 */
const hasBlockAttr = (block: SfcBlock, name: string): boolean => {
  return block.attrs.some((a) => a.name.toLowerCase() === name);
};

/**
 * Create the built-in Vue SFC plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles .vue file imports.
 */
export const vuePlugin = (options?: VuePluginOptions): Plugin => {
  const enableScoped = options?.scoped ?? true;

  return {
    name: "steamroller:vue",

    resolveId(source: string, _importer: string | undefined) {
      if (!isVueFile(source)) {
        return null;
      }
      // Let the default resolver handle path resolution
      return null;
    },

    load(id: string): LoadResult {
      if (!isVueFile(id)) {
        return null;
      }
      // Let the default loader read the file; we transform in transform hook
      return null;
    },

    transform(code: string, id: string): TransformResult {
      if (!isVueFile(id)) {
        return null;
      }

      const descriptor = parseSfc(code);
      const parts: string[] = [];
      const cssOutputs: string[] = [];
      const warnings: string[] = [];

      // Generate scope ID from file path
      const scopeHash = generateScopeId(id);
      const scopeId = `data-v-${scopeHash}`;
      let hasScoped = false;

      // ---- Script handling ----
      const scriptBlock = descriptor.script;
      const scriptSetupBlock = descriptor.scriptSetup;
      let scriptContent = "";

      if (scriptSetupBlock) {
        const lang = getBlockAttr(scriptSetupBlock, "lang");
        let content = scriptSetupBlock.content;

        if (lang === "ts" || lang === "typescript") {
          // Mark as needing TS processing via meta
          content = `/* @vue-script-setup lang=ts */\n${content}`;
        }

        scriptContent = content;
      } else if (scriptBlock) {
        const lang = getBlockAttr(scriptBlock, "lang");
        let content = scriptBlock.content;

        if (lang === "ts" || lang === "typescript") {
          content = `/* @vue-script lang=ts */\n${content}`;
        }

        scriptContent = content;
      }

      // ---- Style handling ----
      for (const style of descriptor.styles) {
        const lang = getBlockAttr(style, "lang");
        const isScoped = hasBlockAttr(style, "scoped");
        let cssContent = style.content;

        // Warn about preprocessor languages
        if (lang === "scss" || lang === "sass") {
          warnings.push(
            `[vue-plugin] Style block in "${id}" uses lang="${lang}". ` +
              `SCSS/Sass preprocessing is not built-in; CSS will be passed through as-is.`,
          );
        } else if (lang === "less") {
          warnings.push(
            `[vue-plugin] Style block in "${id}" uses lang="${lang}". ` +
              `Less preprocessing is not built-in; CSS will be passed through as-is.`,
          );
        }

        // Apply scoped CSS transformation
        if (enableScoped && isScoped) {
          hasScoped = true;
          cssContent = scopeCSS(cssContent, { scopeId });
        }

        cssOutputs.push(cssContent.trim());
      }

      // ---- Template handling ----
      const templateContent = descriptor.template
        ? descriptor.template.content
        : "";

      // ---- Combine into JS module ----

      // Script exports
      if (scriptContent.trim()) {
        parts.push(scriptContent.trim());
      } else {
        parts.push("const __default__ = {};");
      }

      // Template as string
      parts.push(
        `const __template__ = ${JSON.stringify(templateContent.trim())};`,
      );

      // CSS as string
      if (cssOutputs.length > 0) {
        const combinedCSS = cssOutputs.join("\n");
        parts.push(`const __css__ = ${JSON.stringify(combinedCSS)};`);
      }

      // Scope ID export for runtime
      if (hasScoped) {
        parts.push(`const __scopeId__ = ${JSON.stringify(scopeId)};`);
      }

      // Component descriptor export
      const exportParts = ["__template__"];
      if (cssOutputs.length > 0) {
        exportParts.push("__css__");
      }
      if (hasScoped) {
        exportParts.push("__scopeId__");
      }

      parts.push(
        `export default Object.assign(typeof __default__ !== 'undefined' ? __default__ : {}, { template: __template__${cssOutputs.length > 0 ? ", css: __css__" : ""}${hasScoped ? ", __scopeId__: __scopeId__" : ""} });`,
      );

      // Emit warnings
      if (warnings.length > 0 && typeof this?.warn === "function") {
        for (const w of warnings) {
          this.warn(w);
        }
      }

      const jsCode = parts.join("\n\n");

      return {
        code: jsCode,
        map: { mappings: "" },
        meta: {
          vue: true,
          css: cssOutputs.length > 0 ? cssOutputs.join("\n") : undefined,
          scopeId: hasScoped ? scopeId : undefined,
          warnings,
        },
      };
    },
  };
};

/**
 * Check whether any input files have .vue extensions, and if so,
 * check whether a Vue plugin is already registered.
 * Returns the built-in plugin if needed, or null if not.
 *
 * @param inputFiles - Array of input file paths.
 * @param existingPlugins - Currently registered plugins.
 * @returns The Vue plugin if needed, or null.
 */
export const maybeCreateVuePlugin = (
  inputFiles: ReadonlyArray<string>,
  existingPlugins: ReadonlyArray<Plugin>,
): Plugin | null => {
  const hasVueInputs = inputFiles.some((file) => isVueFile(file));

  if (!hasVueInputs) {
    return null;
  }

  const vuePluginNames = [
    "vue",
    "steamroller:vue",
    "rollup-plugin-vue",
    "@vitejs/plugin-vue",
    "vite:vue",
  ];

  const hasExistingVuePlugin = existingPlugins.some((plugin) =>
    vuePluginNames.some(
      (name) =>
        plugin.name === name || plugin.name.toLowerCase().includes("vue"),
    ),
  );

  if (hasExistingVuePlugin) {
    return null;
  }

  return vuePlugin();
};
