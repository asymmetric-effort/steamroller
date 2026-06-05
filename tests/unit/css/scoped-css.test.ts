/**
 * @module tests/unit/css/scoped-css
 * @description Unit tests for the scoped CSS module.
 */

import { describe, it, expect } from "vitest";
import { scopeCSS, generateScopeId } from "../../../src/css/scoped-css.js";

describe("generateScopeId", () => {
  it("returns a hex string", () => {
    const id = generateScopeId("test-content");
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("returns a deterministic hash for the same input", () => {
    const a = generateScopeId("component.vue");
    const b = generateScopeId("component.vue");
    expect(a).toBe(b);
  });

  it("returns different hashes for different inputs", () => {
    const a = generateScopeId("foo.vue");
    const b = generateScopeId("bar.vue");
    expect(a).not.toBe(b);
  });

  it("returns at most 8 characters", () => {
    const id = generateScopeId(
      "some very long string that should still hash short",
    );
    expect(id.length).toBeLessThanOrEqual(8);
  });
});

describe("scopeCSS", () => {
  const scopeId = "data-v-abc123";
  const attr = `[${scopeId}]`;

  describe("simple selectors", () => {
    it("scopes a class selector", () => {
      const result = scopeCSS(".button { color: red; }", { scopeId });
      expect(result).toContain(`.button${attr}`);
      expect(result).toContain("color: red;");
    });

    it("scopes an element selector", () => {
      const result = scopeCSS("div { margin: 0; }", { scopeId });
      expect(result).toContain(`div${attr}`);
    });

    it("scopes an ID selector", () => {
      const result = scopeCSS("#main { padding: 10px; }", { scopeId });
      expect(result).toContain(`#main${attr}`);
    });

    it("scopes a universal selector", () => {
      const result = scopeCSS("* { box-sizing: border-box; }", { scopeId });
      expect(result).toContain(`*${attr}`);
    });
  });

  describe("compound selectors", () => {
    it("scopes all parts of a descendant selector", () => {
      const result = scopeCSS(".parent .child { color: blue; }", { scopeId });
      expect(result).toContain(`.parent${attr}`);
      expect(result).toContain(`.child${attr}`);
    });

    it("scopes all parts of a child combinator selector", () => {
      const result = scopeCSS(".parent > .child { color: blue; }", {
        scopeId,
      });
      expect(result).toContain(`.parent${attr}`);
      expect(result).toContain(`.child${attr}`);
    });

    it("scopes multiple selectors separated by commas", () => {
      const result = scopeCSS(".a, .b { color: red; }", { scopeId });
      expect(result).toContain(`.a${attr}`);
      expect(result).toContain(`.b${attr}`);
    });
  });

  describe(":deep() pseudo-selector", () => {
    it("scopes before :deep but not the argument", () => {
      const result = scopeCSS(".wrapper :deep(.inner) { color: red; }", {
        scopeId,
      });
      expect(result).toContain(`.wrapper${attr}`);
      expect(result).toContain(".inner");
      // The .inner should NOT have the scope attr
      expect(result).not.toContain(`.inner${attr}`);
    });

    it("handles :deep at the start of a selector", () => {
      const result = scopeCSS(":deep(.inner) { color: red; }", { scopeId });
      expect(result).toContain(attr);
      expect(result).toContain(".inner");
    });
  });

  describe(":global() pseudo-selector", () => {
    it("removes :global and does not scope", () => {
      const result = scopeCSS(":global(.app) { color: red; }", { scopeId });
      expect(result).toContain(".app");
      expect(result).not.toContain(":global");
      expect(result).not.toContain(attr);
    });

    it("handles :global in the middle of a selector", () => {
      const result = scopeCSS(".wrapper :global(.lib-class) { color: blue; }", {
        scopeId,
      });
      expect(result).toContain(".lib-class");
      expect(result).not.toContain(":global");
    });
  });

  describe(":slotted() pseudo-selector", () => {
    it("applies slot-specific attribute to :slotted content", () => {
      const result = scopeCSS(":slotted(.item) { color: red; }", { scopeId });
      expect(result).toContain(".item[data-v-abc123-s]");
      expect(result).not.toContain(":slotted");
    });
  });

  describe("at-rules", () => {
    it("scopes selectors inside @media", () => {
      const css = "@media (max-width: 600px) { .btn { color: red; } }";
      const result = scopeCSS(css, { scopeId });
      expect(result).toContain(`@media (max-width: 600px)`);
      expect(result).toContain(`.btn${attr}`);
    });

    it("does not scope @keyframes content", () => {
      const css = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";
      const result = scopeCSS(css, { scopeId });
      expect(result).toContain("@keyframes fade");
      expect(result).not.toContain(attr);
    });

    it("passes through @import rules unchanged", () => {
      const css = '@import url("styles.css");';
      const result = scopeCSS(css, { scopeId });
      expect(result).toContain('@import url("styles.css")');
    });
  });

  describe("pseudo-elements and pseudo-classes", () => {
    it("places attribute before pseudo-elements", () => {
      const result = scopeCSS(".btn::before { content: ''; }", { scopeId });
      expect(result).toContain(`.btn${attr}::before`);
    });

    it("places attribute before pseudo-classes", () => {
      const result = scopeCSS(".btn:hover { color: blue; }", { scopeId });
      expect(result).toContain(`.btn${attr}:hover`);
    });
  });

  describe("comments", () => {
    it("preserves CSS comments", () => {
      const css = "/* header styles */ .header { color: black; }";
      const result = scopeCSS(css, { scopeId });
      expect(result).toContain("/* header styles */");
      expect(result).toContain(`.header${attr}`);
    });
  });

  describe("multiple rules", () => {
    it("scopes multiple rules", () => {
      const css = ".a { color: red; } .b { color: blue; }";
      const result = scopeCSS(css, { scopeId });
      expect(result).toContain(`.a${attr}`);
      expect(result).toContain(`.b${attr}`);
    });
  });
});
