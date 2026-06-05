/**
 * @module tests/unit/plugins/svelte-plugin
 * @description Unit tests for the built-in Svelte SFC plugin.
 */

import { describe, it, expect } from "vitest";
import {
  isSvelteFile,
  sveltePlugin,
  maybeCreateSveltePlugin,
} from "../../../src/plugins/svelte-plugin.js";
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

describe("isSvelteFile", () => {
  it("returns true for .svelte files", () => {
    expect(isSvelteFile("App.svelte")).toBe(true);
    expect(isSvelteFile("/src/components/Header.svelte")).toBe(true);
  });

  it("returns false for non-.svelte files", () => {
    expect(isSvelteFile("index.ts")).toBe(false);
    expect(isSvelteFile("App.vue")).toBe(false);
  });

  it("supports custom extensions", () => {
    expect(isSvelteFile("Component.svx", [".svx", ".svelte"])).toBe(true);
    expect(isSvelteFile("Component.svelte", [".svx"])).toBe(false);
  });
});

describe("sveltePlugin", () => {
  describe("plugin metadata", () => {
    it("has the correct name", () => {
      const plugin = sveltePlugin();
      expect(plugin.name).toBe("steamroller:svelte");
    });

    it("has resolveId, load, and transform hooks", () => {
      const plugin = sveltePlugin();
      expect(plugin.resolveId).toBeDefined();
      expect(plugin.load).toBeDefined();
      expect(plugin.transform).toBeDefined();
    });
  });

  describe("transform", () => {
    it("returns null for non-.svelte files", () => {
      const plugin = sveltePlugin();
      const result = callTransform(plugin, "const x = 1;", "index.ts");
      expect(result).toBeNull();
    });

    it("extracts script content", () => {
      const svelte = `
<script>
  let count = 0;
  function increment() { count += 1; }
</script>
<button on:click={increment}>{count}</button>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Counter.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("let count = 0");
      expect(code).toContain("increment");
    });

    it("extracts style content", () => {
      const svelte = `
<style>
  .red { color: red; }
</style>
<div class="red">Hello</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Styled.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("__css__");
      expect(code).toContain("color: red");
    });

    it("extracts markup (removes script and style blocks)", () => {
      const svelte = `
<script>
  let name = "world";
</script>
<style>
  p { color: blue; }
</style>
<p>Hello {name}</p>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Markup.svelte");
      const meta = (result as { meta: Record<string, unknown> }).meta;
      expect(meta.markup).toBeDefined();
      const markup = meta.markup as string;
      expect(markup).toContain("Hello {name}");
      expect(markup).not.toContain("<script>");
      expect(markup).not.toContain("<style>");
    });

    it("handles lang=ts on script blocks", () => {
      const svelte = `
<script lang="ts">
  const count: number = 0;
</script>
<div>{count}</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "TS.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("@svelte-script lang=ts");
    });

    it("generates warnings for scss/less style blocks", () => {
      const svelte = `
<style lang="less">
  .btn { color: red; }
</style>
<button class="btn">Click</button>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Less.svelte");
      const meta = (result as { meta: Record<string, unknown> }).meta;
      const warnings = meta.warnings as string[];
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("less");
    });

    it("exports __component__ as default", () => {
      const svelte = `
<script>let x = 1;</script>
<div>{x}</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Def.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("export const __component__");
      expect(code).toContain("export default __component__");
      expect(code).toContain("markup:");
    });

    it("includes css in component export when styles exist", () => {
      const svelte = `
<style>.x { color: red; }</style>
<div class="x">Hi</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "WithCSS.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("css:");
    });

    it("returns source map stub and meta", () => {
      const svelte = `<div>Hello</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Map.svelte");
      expect(result).not.toBeNull();
      const r = result as {
        map: { mappings: string };
        meta: Record<string, unknown>;
      };
      expect(r.map).toEqual({ mappings: "" });
      expect(r.meta.svelte).toBe(true);
    });

    it("handles component with no script or style", () => {
      const svelte = `<div>Static markup only</div>`;
      const plugin = sveltePlugin();
      const result = callTransform(plugin, svelte, "Static.svelte");
      const code = (result as { code: string }).code;
      expect(code).toContain("__markup__");
      expect(code).toContain("Static markup only");
      expect(code).not.toContain("__css__");
    });
  });
});

describe("maybeCreateSveltePlugin", () => {
  it("returns a plugin when .svelte inputs exist and no Svelte plugin registered", () => {
    const result = maybeCreateSveltePlugin(["App.svelte"], []);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("steamroller:svelte");
  });

  it("returns null when no .svelte inputs exist", () => {
    const result = maybeCreateSveltePlugin(["index.ts"], []);
    expect(result).toBeNull();
  });

  it("returns null when a Svelte plugin is already registered", () => {
    const existing: Plugin = {
      name: "@sveltejs/vite-plugin-svelte",
    };
    const result = maybeCreateSveltePlugin(["App.svelte"], [existing]);
    expect(result).toBeNull();
  });
});
