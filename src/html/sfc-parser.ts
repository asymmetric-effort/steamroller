/**
 * @module html/sfc-parser
 * @description Single File Component (SFC) block extraction for Vue and Svelte-style files.
 * Parses an SFC source and extracts typed script, style, template, and custom blocks
 * using the HTML parser.
 */

import type { Element, HtmlLocation } from "./html-ast.js";
import { parseHtml } from "./html-parser.js";

// ============================================================
// SFC types
// ============================================================

/** A single block within an SFC. */
export interface SfcBlock {
  /** The block type (e.g., "script", "style", "template"). */
  readonly type: string;
  /** The raw content of the block. */
  readonly content: string;
  /** Attributes on the block's element (e.g., lang="ts", scoped). */
  readonly attrs: ReadonlyArray<SfcBlockAttr>;
  /** Source location of the block element. */
  readonly loc: HtmlLocation;
}

/** An attribute on an SFC block element. */
export interface SfcBlockAttr {
  readonly name: string;
  readonly value: string | null;
}

/** Descriptor returned from parsing an SFC. */
export interface SfcDescriptor {
  /** The template block, if present. */
  readonly template: SfcBlock | null;
  /** The main script block, if present. */
  readonly script: SfcBlock | null;
  /** The script setup block, if present (Vue 3 <script setup>). */
  readonly scriptSetup: SfcBlock | null;
  /** Style blocks (there can be multiple). */
  readonly styles: ReadonlyArray<SfcBlock>;
  /** Custom blocks (any top-level element not matching template/script/style). */
  readonly customBlocks: ReadonlyArray<SfcBlock>;
}

// ============================================================
// SFC Parser
// ============================================================

/**
 * Parse a Single File Component (Vue/Svelte-style) source into an SfcDescriptor.
 *
 * @param source - The SFC source code.
 * @returns An SfcDescriptor with extracted blocks.
 */
export const parseSfc = (source: string): SfcDescriptor => {
  // Parse with HTML mode in recovery mode so partial markup doesn't throw
  const doc = parseHtml(source, { mode: "html", recover: true });

  let template: SfcBlock | null = null;
  let script: SfcBlock | null = null;
  let scriptSetup: SfcBlock | null = null;
  const styles: Array<SfcBlock> = [];
  const customBlocks: Array<SfcBlock> = [];

  for (const child of doc.children) {
    if (child.type !== "Element") {
      continue;
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const block = elementToBlock(el, source);

    switch (tag) {
      case "template":
        if (template === null) {
          template = block;
        } else {
          customBlocks.push(block);
        }
        break;
      case "script": {
        const hasSetup = el.attributes.some(
          (a) => a.name.toLowerCase() === "setup",
        );
        if (hasSetup) {
          if (scriptSetup === null) {
            scriptSetup = block;
          } else {
            customBlocks.push(block);
          }
        } else {
          if (script === null) {
            script = block;
          } else {
            customBlocks.push(block);
          }
        }
        break;
      }
      case "style":
        styles.push(block);
        break;
      default:
        customBlocks.push(block);
        break;
    }
  }

  return { template, script, scriptSetup, styles, customBlocks };
};

/**
 * Convert an Element AST node to an SfcBlock.
 */
const elementToBlock = (el: Element, source: string): SfcBlock => {
  // Extract the inner text content
  let content = "";
  for (const child of el.children) {
    if (child.type === "Text") {
      content += child.value;
    } else if (child.type === "Element") {
      // For template blocks, serialize children back from source
      const childStart = child.loc.start.offset;
      const childEnd = child.loc.end.offset;
      content += source.slice(childStart, childEnd);
    }
  }

  const attrs: Array<SfcBlockAttr> = el.attributes.map((a) => ({
    name: a.name,
    value: a.value,
  }));

  return {
    type: el.tagName.toLowerCase(),
    content,
    attrs,
    loc: el.loc,
  };
};
