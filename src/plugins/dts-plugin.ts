/**
 * @module plugins/dts-plugin
 * @description Built-in plugin that generates .d.ts declaration files alongside
 * JS output. For each entry chunk, emits a basic ambient declaration file that
 * re-exports the chunk's public API shape using `export declare const` for named
 * exports and `export default any` for default exports.
 */

import type { OutputPlugin, OutputBundle, OutputChunk } from "../types.js";

/**
 * Build a .d.ts declaration string from a chunk's exports array.
 *
 * @param exports - The list of export names from the chunk.
 * @returns The declaration file content.
 */
export const buildDeclarationContent = (
  exports: ReadonlyArray<string>,
): string => {
  const lines: Array<string> = [];

  for (let i = 0; i < exports.length; i++) {
    const name = exports[i];
    if (name === "default") {
      lines.push("export default any;");
    } else {
      lines.push(`export declare const ${name}: any;`);
    }
  }

  return lines.join("\n") + "\n";
};

/**
 * Compute the .d.ts file name from a chunk's JS file name.
 *
 * @param fileName - The JS chunk file name (e.g. "index.js").
 * @returns The declaration file name (e.g. "index.d.ts").
 */
export const getDtsFileName = (fileName: string): string => {
  if (fileName.endsWith(".js")) {
    return fileName.slice(0, -3) + ".d.ts";
  }
  if (fileName.endsWith(".mjs")) {
    return fileName.slice(0, -4) + ".d.mts";
  }
  if (fileName.endsWith(".cjs")) {
    return fileName.slice(0, -4) + ".d.cts";
  }
  return fileName + ".d.ts";
};

/**
 * Creates the dts output plugin that generates .d.ts declaration files
 * for entry chunks during the generateBundle hook.
 *
 * @returns An OutputPlugin that emits .d.ts files.
 */
export const dtsPlugin = (): OutputPlugin => {
  return {
    name: "steamroller:dts",

    generateBundle(
      _options: unknown,
      bundle: OutputBundle,
      _isWrite: boolean,
    ): void {
      const fileNames = Object.keys(bundle);
      for (let i = 0; i < fileNames.length; i++) {
        const item = bundle[fileNames[i]];
        if (item.type !== "chunk") {
          continue;
        }
        const chunk = item as OutputChunk;
        if (!chunk.isEntry) {
          continue;
        }

        const dtsFileName = getDtsFileName(chunk.fileName);
        const content = buildDeclarationContent(chunk.exports);

        // Add the .d.ts file to the bundle as an asset
        (bundle as Record<string, unknown>)[dtsFileName] = {
          type: "asset",
          fileName: dtsFileName,
          name: dtsFileName,
          names: [dtsFileName],
          needsCodeReference: false,
          originalFileName: null,
          originalFileNames: [],
          source: content,
        };
      }
    },
  };
};
