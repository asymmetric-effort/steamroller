/**
 * @module tests/unit/html/sfc-parser
 * @description Unit tests for the SFC (Single File Component) parser:
 * Vue-style template/script/style extraction, script setup, scoped styles,
 * custom blocks, and lang attributes.
 */

import { describe, it, expect } from "vitest";
import { parseSfc } from "../../../src/html/sfc-parser.js";

describe("SFC Parser", () => {
  // ============================================================
  // Basic extraction
  // ============================================================

  it("extracts a template block", () => {
    const sfc = parseSfc("<template><div>hello</div></template>");
    expect(sfc.template).not.toBeNull();
    expect(sfc.template!.type).toBe("template");
    expect(sfc.template!.content).toContain("<div>hello</div>");
  });

  it("extracts a script block", () => {
    const sfc = parseSfc("<script>export default { name: 'App' }</script>");
    expect(sfc.script).not.toBeNull();
    expect(sfc.script!.type).toBe("script");
    expect(sfc.script!.content).toContain("export default");
  });

  it("extracts a style block", () => {
    const sfc = parseSfc("<style>.red { color: red; }</style>");
    expect(sfc.styles).toHaveLength(1);
    expect(sfc.styles[0].type).toBe("style");
    expect(sfc.styles[0].content).toContain(".red");
  });

  it("extracts all three blocks from a Vue SFC", () => {
    const source = `
<template>
  <div>{{ msg }}</div>
</template>

<script>
export default {
  data() {
    return { msg: 'hello' }
  }
}
</script>

<style>
div { color: blue; }
</style>
`;
    const sfc = parseSfc(source);
    expect(sfc.template).not.toBeNull();
    expect(sfc.script).not.toBeNull();
    expect(sfc.styles).toHaveLength(1);
  });

  // ============================================================
  // Script setup (Vue 3)
  // ============================================================

  it("extracts script setup block", () => {
    const sfc = parseSfc('<script setup>const msg = "hello";</script>');
    expect(sfc.scriptSetup).not.toBeNull();
    expect(sfc.scriptSetup!.content).toContain('const msg = "hello"');
    expect(sfc.script).toBeNull();
  });

  it("extracts both script and script setup blocks", () => {
    const source = `
<script>
export default { name: 'App' }
</script>
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>
`;
    const sfc = parseSfc(source);
    expect(sfc.script).not.toBeNull();
    expect(sfc.scriptSetup).not.toBeNull();
    expect(sfc.script!.content).toContain("export default");
    expect(sfc.scriptSetup!.content).toContain("ref");
  });

  // ============================================================
  // Scoped styles
  // ============================================================

  it("detects scoped style attribute", () => {
    const sfc = parseSfc("<style scoped>.red { color: red; }</style>");
    expect(sfc.styles).toHaveLength(1);
    const scopedAttr = sfc.styles[0].attrs.find((a) => a.name === "scoped");
    expect(scopedAttr).toBeDefined();
    expect(scopedAttr!.value).toBeNull();
  });

  it("handles multiple style blocks (scoped and global)", () => {
    const source = `
<style>
body { margin: 0; }
</style>
<style scoped>
.component { padding: 10px; }
</style>
`;
    const sfc = parseSfc(source);
    expect(sfc.styles).toHaveLength(2);
    const globalStyle = sfc.styles[0];
    const scopedStyle = sfc.styles[1];
    expect(globalStyle.attrs.some((a) => a.name === "scoped")).toBe(false);
    expect(scopedStyle.attrs.some((a) => a.name === "scoped")).toBe(true);
  });

  // ============================================================
  // Lang attributes
  // ============================================================

  it("detects lang attribute on script", () => {
    const sfc = parseSfc('<script lang="ts">const x: number = 1;</script>');
    expect(sfc.script).not.toBeNull();
    const langAttr = sfc.script!.attrs.find((a) => a.name === "lang");
    expect(langAttr).toBeDefined();
    expect(langAttr!.value).toBe("ts");
  });

  it("detects lang attribute on style", () => {
    const sfc = parseSfc(
      '<style lang="scss">.a { .b { color: red; } }</style>',
    );
    expect(sfc.styles).toHaveLength(1);
    const langAttr = sfc.styles[0].attrs.find((a) => a.name === "lang");
    expect(langAttr).toBeDefined();
    expect(langAttr!.value).toBe("scss");
  });

  // ============================================================
  // Custom blocks
  // ============================================================

  it("extracts custom blocks", () => {
    const source = `
<template><div></div></template>
<script>export default {}</script>
<docs>
# My Component
This is documentation.
</docs>
`;
    const sfc = parseSfc(source);
    expect(sfc.customBlocks).toHaveLength(1);
    expect(sfc.customBlocks[0].type).toBe("docs");
    expect(sfc.customBlocks[0].content).toContain("My Component");
  });

  it("extracts i18n custom block", () => {
    const source = `
<template><p>{{ t('hello') }}</p></template>
<i18n>
{
  "en": { "hello": "Hello" },
  "ja": { "hello": "Konnichiwa" }
}
</i18n>
`;
    const sfc = parseSfc(source);
    expect(sfc.customBlocks).toHaveLength(1);
    expect(sfc.customBlocks[0].type).toBe("i18n");
  });

  // ============================================================
  // Edge cases
  // ============================================================

  it("handles empty SFC", () => {
    const sfc = parseSfc("");
    expect(sfc.template).toBeNull();
    expect(sfc.script).toBeNull();
    expect(sfc.scriptSetup).toBeNull();
    expect(sfc.styles).toHaveLength(0);
    expect(sfc.customBlocks).toHaveLength(0);
  });

  it("handles SFC with only a template", () => {
    const sfc = parseSfc("<template><div>simple</div></template>");
    expect(sfc.template).not.toBeNull();
    expect(sfc.script).toBeNull();
    expect(sfc.styles).toHaveLength(0);
  });

  it("includes location information on blocks", () => {
    const sfc = parseSfc("<script>code</script>");
    expect(sfc.script).not.toBeNull();
    expect(sfc.script!.loc).toBeDefined();
    expect(sfc.script!.loc.start.offset).toBe(0);
    expect(sfc.script!.loc.start.line).toBe(1);
  });
});
