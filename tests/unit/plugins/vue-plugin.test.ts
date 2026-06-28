/**
 * @module tests/unit/plugins/vue-plugin
 * @description Unit tests for the built-in Vue SFC plugin.
 */

import { describe, it, expect } from "bun:test";
import {
  isVueFile,
  vuePlugin,
  maybeCreateVuePlugin,
} from "../../../src/plugins/vue-plugin.js";
import type { Plugin, TransformResult } from "../../../src/types.js";

/** Helper to call the transform hook on a plugin. */
const callTransform = (
  plugin: Plugin,
  code: string,
  id: string,
): TransformResult => {
  const transform = plugin.transform;
  if (typeof transform === "function") {
    return transform.call({} as never, code, id) as TransformResult;
  }
  return null;
};

describe("isVueFile", () => {
  it("returns true for .vue files", () => {
    expect(isVueFile("App.vue")).toBe(true);
    expect(isVueFile("/src/components/Header.vue")).toBe(true);
  });

  it("returns false for non-.vue files", () => {
    expect(isVueFile("index.ts")).toBe(false);
    expect(isVueFile("styles.css")).toBe(false);
    expect(isVueFile("component.svelte")).toBe(false);
  });

  it("returns false for files with .vue in the middle", () => {
    expect(isVueFile("vue-plugin.ts")).toBe(false);
  });
});

describe("vuePlugin", () => {
  describe("plugin metadata", () => {
    it("has the correct name", () => {
      const plugin = vuePlugin();
      expect(plugin.name).toBe("steamroller:vue");
    });

    it("has resolveId, load, and transform hooks", () => {
      const plugin = vuePlugin();
      expect(plugin.resolveId).toBeDefined();
      expect(plugin.load).toBeDefined();
      expect(plugin.transform).toBeDefined();
    });
  });

  describe("resolveId", () => {
    it("returns null for .vue files (defers to default resolver)", () => {
      const plugin = vuePlugin();
      const resolveId = plugin.resolveId as (
        source: string,
        importer: string | undefined,
      ) => unknown;
      expect(resolveId("App.vue", undefined)).toBeNull();
    });

    it("returns null for non-.vue files", () => {
      const plugin = vuePlugin();
      const resolveId = plugin.resolveId as (
        source: string,
        importer: string | undefined,
      ) => unknown;
      expect(resolveId("index.ts", undefined)).toBeNull();
    });
  });

  describe("load", () => {
    it("returns null for .vue files (defers to default loader)", () => {
      const plugin = vuePlugin();
      const load = plugin.load as (id: string) => unknown;
      expect(load("App.vue")).toBeNull();
    });

    it("returns null for non-.vue files", () => {
      const plugin = vuePlugin();
      const load = plugin.load as (id: string) => unknown;
      expect(load("index.ts")).toBeNull();
    });
  });

  describe("transform", () => {
    it("returns null for non-.vue files", () => {
      const plugin = vuePlugin();
      const result = callTransform(plugin, "const x = 1;", "index.ts");
      expect(result).toBeNull();
    });

    it("extracts template content", () => {
      const vue = `
<template>
  <div>Hello</div>
</template>
<script>
export default { name: "App" }
</script>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "App.vue");
      expect(result).not.toBeNull();
      const code = (result as { code: string }).code;
      expect(code).toContain("__template__");
      expect(code).toContain("<div>Hello</div>");
    });

    it("extracts script content", () => {
      const vue = `
<template><div></div></template>
<script>
export default { name: "MyComponent" }
</script>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Comp.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain('name: "MyComponent"');
    });

    it("extracts script setup content", () => {
      const vue = `
<template><div>{{ msg }}</div></template>
<script setup>
const msg = "hello";
</script>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Comp.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain('const msg = "hello"');
    });

    it("handles lang=ts on script blocks", () => {
      const vue = `
<template><div></div></template>
<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({ name: "App" });
</script>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "App.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("@vue-script lang=ts");
      expect(code).toContain("defineComponent");
    });

    it("handles lang=ts on script setup blocks", () => {
      const vue = `
<template><div></div></template>
<script setup lang="ts">
const count: number = 0;
</script>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "App.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("@vue-script-setup lang=ts");
    });

    it("extracts style content", () => {
      const vue = `
<template><div class="red"></div></template>
<script>export default {}</script>
<style>
.red { color: red; }
</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Comp.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("__css__");
      expect(code).toContain("color: red");
    });

    it("applies scoped CSS when style has scoped attribute", () => {
      const vue = `
<template><div class="btn"></div></template>
<script>export default {}</script>
<style scoped>
.btn { color: blue; }
</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Scoped.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("__scopeId__");
      expect(code).toContain("data-v-");
      // The CSS should have the scope attribute
      const meta = (result as { meta: Record<string, unknown> }).meta;
      expect(meta.scopeId).toBeDefined();
    });

    it("does not apply scoped CSS when scoped option is disabled", () => {
      const vue = `
<template><div></div></template>
<style scoped>
.btn { color: blue; }
</style>`;
      const plugin = vuePlugin({ scoped: false });
      const result = callTransform(plugin, vue, "Comp.vue");
      const code = (result as { code: string }).code;
      expect(code).not.toContain("__scopeId__");
    });

    it("handles multiple style blocks", () => {
      const vue = `
<template><div></div></template>
<style>
.global { color: red; }
</style>
<style scoped>
.local { color: blue; }
</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Multi.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("color: red");
      expect(code).toContain("color: blue");
    });

    it("provides a default empty component when no script", () => {
      const vue = `
<template><div>Static</div></template>
<style>.x { color: red; }</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "NoScript.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("__default__");
    });

    it("generates warnings for scss/less style blocks", () => {
      const vue = `
<template><div></div></template>
<style lang="scss">
.btn { &:hover { color: red; } }
</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Scss.vue");
      const meta = (result as { meta: Record<string, unknown> }).meta;
      expect(meta.warnings).toBeDefined();
      const warnings = meta.warnings as string[];
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("scss");
    });

    it("exports default with template, css and scopeId", () => {
      const vue = `
<template><div>Hi</div></template>
<script>export default { name: "Test" }</script>
<style scoped>.x { color: red; }</style>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Full.vue");
      const code = (result as { code: string }).code;
      expect(code).toContain("export default");
      expect(code).toContain("template:");
      expect(code).toContain("css:");
      expect(code).toContain("__scopeId__");
    });

    it("returns source map stub and meta", () => {
      const vue = `<template><div></div></template>`;
      const plugin = vuePlugin();
      const result = callTransform(plugin, vue, "Map.vue");
      expect(result).not.toBeNull();
      const r = result as {
        map: { mappings: string };
        meta: Record<string, unknown>;
      };
      expect(r.map).toEqual({ mappings: "" });
      expect(r.meta.vue).toBe(true);
    });
  });
});

describe("maybeCreateVuePlugin", () => {
  it("returns a plugin when .vue inputs exist and no Vue plugin registered", () => {
    const result = maybeCreateVuePlugin(["App.vue"], []);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("steamroller:vue");
  });

  it("returns null when no .vue inputs exist", () => {
    const result = maybeCreateVuePlugin(["index.ts"], []);
    expect(result).toBeNull();
  });

  it("returns null when a Vue plugin is already registered", () => {
    const existing: Plugin = {
      name: "@vitejs/plugin-vue",
    };
    const result = maybeCreateVuePlugin(["App.vue"], [existing]);
    expect(result).toBeNull();
  });

  it("detects plugin names containing 'vue'", () => {
    const existing: Plugin = {
      name: "my-custom-vue-plugin",
    };
    const result = maybeCreateVuePlugin(["App.vue"], [existing]);
    expect(result).toBeNull();
  });
});
