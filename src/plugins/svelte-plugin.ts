/**
 * @module plugins/svelte-plugin
 * @description Built-in Svelte Single File Component (.svelte) plugin for steamroller.
 * Handles .svelte file imports by extracting script and style blocks,
 * passing script content through the JS/TS pipeline, style content through
 * the CSS pipeline, and emitting a JS module with script exports, CSS asset,
 * and markup string for the Svelte compiler.
 */

import type { Plugin, TransformResult, LoadResult } from "../types.js";
import { parseSfc } from "../html/sfc-parser.js";
import type { SfcBlock } from "../html/sfc-parser.js";

/** Options for the Svelte plugin. */
export interface SveltePluginOptions {
  /** File extensions to treat as Svelte components. Default: [".svelte"]. */
  readonly extensions?: ReadonlyArray<string>;
}

/**
 * Check whether a file path is a Svelte component file.
 *
 * @param id - The module ID / file path.
 * @param extensions - The file extensions to check.
 * @returns True if the file has a Svelte extension.
 */
export const isSvelteFile = (
  id: string,
  extensions: ReadonlyArray<string> = [".svelte"],
): boolean => {
  return extensions.some((ext) => id.endsWith(ext));
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
 * Extract the markup from a Svelte source by removing script and style blocks.
 * The remaining content is the template markup for the Svelte compiler.
 *
 * @param source - The full Svelte component source.
 * @param descriptor - The parsed SFC descriptor (for block locations).
 * @returns The markup string with script/style blocks removed.
 */
const extractMarkup = (
  source: string,
  blocks: ReadonlyArray<{
    readonly loc: {
      readonly start: { readonly offset: number };
      readonly end: { readonly offset: number };
    };
  }>,
): string => {
  if (blocks.length === 0) {
    return source.trim();
  }

  // Sort blocks by offset to remove from end to start
  const sorted = [...blocks].sort(
    (a, b) => b.loc.start.offset - a.loc.start.offset,
  );

  let result = source;
  for (const block of sorted) {
    const start = block.loc.start.offset;
    const end = block.loc.end.offset;
    result = result.slice(0, start) + result.slice(end);
  }

  return result.trim();
};

/**
 * Create the built-in Svelte plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles .svelte file imports.
 */
export const sveltePlugin = (options?: SveltePluginOptions): Plugin => {
  const extensions = options?.extensions ?? [".svelte"];

  return {
    name: "steamroller:svelte",

    resolveId(source: string, _importer: string | undefined) {
      if (!isSvelteFile(source, extensions)) {
        return null;
      }
      // Let the default resolver handle path resolution
      return null;
    },

    load(id: string): LoadResult {
      if (!isSvelteFile(id, extensions)) {
        return null;
      }
      // Let the default loader read the file; we transform in transform hook
      return null;
    },

    transform(code: string, id: string): TransformResult {
      if (!isSvelteFile(id, extensions)) {
        return null;
      }

      const descriptor = parseSfc(code);
      const parts: string[] = [];
      const cssOutputs: string[] = [];
      const warnings: string[] = [];

      // Collect all blocks to extract markup
      const allBlocks: Array<{
        readonly loc: {
          readonly start: { readonly offset: number };
          readonly end: { readonly offset: number };
        };
      }> = [];

      // ---- Script handling ----
      // Svelte uses <script> and <script context="module">
      const scriptBlock = descriptor.script;
      const scriptSetupBlock = descriptor.scriptSetup;
      let instanceScript = "";
      let moduleScript = "";

      // In Svelte, "script setup" maps to the instance script
      // and the regular "script" could be context="module"
      if (scriptBlock) {
        const lang = getBlockAttr(scriptBlock, "lang");
        let content = scriptBlock.content;

        if (lang === "ts" || lang === "typescript") {
          content = `/* @svelte-script lang=ts */\n${content}`;
        }

        // Check if this is a module-level script
        const context = getBlockAttr(scriptBlock, "context");
        if (context === "module") {
          moduleScript = content;
        } else {
          instanceScript = content;
        }

        allBlocks.push(scriptBlock);
      }

      if (scriptSetupBlock) {
        const lang = getBlockAttr(scriptSetupBlock, "lang");
        let content = scriptSetupBlock.content;

        if (lang === "ts" || lang === "typescript") {
          content = `/* @svelte-script-setup lang=ts */\n${content}`;
        }

        // Script setup in Svelte context = instance script
        if (!instanceScript) {
          instanceScript = content;
        } else {
          moduleScript = content;
        }

        allBlocks.push(scriptSetupBlock);
      }

      // ---- Style handling ----
      for (const style of descriptor.styles) {
        const lang = getBlockAttr(style, "lang");
        let cssContent = style.content;

        if (lang === "scss" || lang === "sass") {
          warnings.push(
            `[svelte-plugin] Style block in "${id}" uses lang="${lang}". ` +
              `SCSS/Sass preprocessing is not built-in; CSS will be passed through as-is.`,
          );
        } else if (lang === "less") {
          warnings.push(
            `[svelte-plugin] Style block in "${id}" uses lang="${lang}". ` +
              `Less preprocessing is not built-in; CSS will be passed through as-is.`,
          );
        }

        cssOutputs.push(cssContent.trim());
        allBlocks.push(style);
      }

      // ---- Markup extraction ----
      const markup = extractMarkup(code, allBlocks);

      // ---- Combine into JS module ----

      // Module-level script (hoisted)
      if (moduleScript.trim()) {
        parts.push(`/* module script */\n${moduleScript.trim()}`);
      }

      // Instance script
      if (instanceScript.trim()) {
        parts.push(instanceScript.trim());
      }

      // Markup as string export
      parts.push(`const __markup__ = ${JSON.stringify(markup)};`);

      // CSS as string export
      if (cssOutputs.length > 0) {
        const combinedCSS = cssOutputs.join("\n");
        parts.push(`const __css__ = ${JSON.stringify(combinedCSS)};`);
      }

      // Default export combining everything
      const exportFields = [`markup: __markup__`];
      if (cssOutputs.length > 0) {
        exportFields.push(`css: __css__`);
      }

      parts.push(
        `export const __component__ = { ${exportFields.join(", ")} };`,
      );
      parts.push(`export default __component__;`);

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
          svelte: true,
          css: cssOutputs.length > 0 ? cssOutputs.join("\n") : undefined,
          markup,
          warnings,
        },
      };
    },
  };
};

/**
 * Check whether any input files have Svelte extensions, and if so,
 * check whether a Svelte plugin is already registered.
 * Returns the built-in plugin if needed, or null if not.
 *
 * @param inputFiles - Array of input file paths.
 * @param existingPlugins - Currently registered plugins.
 * @returns The Svelte plugin if needed, or null.
 */
export const maybeCreateSveltePlugin = (
  inputFiles: ReadonlyArray<string>,
  existingPlugins: ReadonlyArray<Plugin>,
): Plugin | null => {
  const hasSvelteInputs = inputFiles.some((file) => isSvelteFile(file));

  if (!hasSvelteInputs) {
    return null;
  }

  const sveltePluginNames = [
    "svelte",
    "steamroller:svelte",
    "rollup-plugin-svelte",
    "vite-plugin-svelte",
    "@sveltejs/vite-plugin-svelte",
  ];

  const hasExistingSveltePlugin = existingPlugins.some((plugin) =>
    sveltePluginNames.some(
      (name) =>
        plugin.name === name || plugin.name.toLowerCase().includes("svelte"),
    ),
  );

  if (hasExistingSveltePlugin) {
    return null;
  }

  return sveltePlugin();
};
