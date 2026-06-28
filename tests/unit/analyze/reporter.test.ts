/**
 * Tests for src/analyze/reporter.ts
 *
 * Covers text, JSON, and HTML output formats.
 */
import { describe, it, expect } from "bun:test";
import {
  formatText,
  formatJson,
  formatHtml,
} from "../../../src/analyze/reporter.js";
import type { AnalysisResult } from "../../../src/analyze/types.js";

/**
 * Helper to create a minimal AnalysisResult for testing.
 */
const makeResult = (
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult => ({
  chunks: overrides.chunks ?? [
    {
      fileName: "bundle.js",
      isEntry: true,
      totalSize: 1500,
      modules: [
        {
          id: "src/main.ts",
          originalSize: 1000,
          renderedSize: 800,
          percentOfChunk: 53.33,
          renderedExports: ["default"],
          removedExports: [],
        },
        {
          id: "src/utils.ts",
          originalSize: 700,
          renderedSize: 700,
          percentOfChunk: 46.67,
          renderedExports: ["helper"],
          removedExports: ["unused"],
        },
      ],
      moduleCount: 2,
      exports: ["default"],
    },
  ],
  duplicates: overrides.duplicates ?? [],
  largestModules: overrides.largestModules ?? [
    {
      id: "src/main.ts",
      originalSize: 1000,
      renderedSize: 800,
      percentOfChunk: 53.33,
      renderedExports: ["default"],
      removedExports: [],
    },
    {
      id: "src/utils.ts",
      originalSize: 700,
      renderedSize: 700,
      percentOfChunk: 46.67,
      renderedExports: ["helper"],
      removedExports: ["unused"],
    },
  ],
  treeShakeStats: overrides.treeShakeStats ?? {
    totalOriginalSize: 1700,
    totalRenderedSize: 1500,
    removedBytes: 200,
    removedPercent: 11.76,
    totalExports: 3,
    removedExports: 1,
  },
  totalSize: overrides.totalSize ?? 1500,
  totalModules: overrides.totalModules ?? 2,
});

describe("formatText", () => {
  it("includes bundle analysis header", () => {
    const text = formatText(makeResult());
    expect(text).toContain("Bundle Analysis");
  });

  it("includes total size", () => {
    const text = formatText(makeResult());
    expect(text).toContain("1.46 kB");
  });

  it("includes chunk count", () => {
    const text = formatText(makeResult());
    expect(text).toContain("Chunks:");
    expect(text).toContain("1");
  });

  it("includes module count", () => {
    const text = formatText(makeResult());
    expect(text).toContain("Modules:");
    expect(text).toContain("2");
  });

  it("includes tree-shaking stats", () => {
    const text = formatText(makeResult());
    expect(text).toContain("Tree-shaking");
    expect(text).toContain("11.8%");
  });

  it("includes chunk file name", () => {
    const text = formatText(makeResult());
    expect(text).toContain("bundle.js");
  });

  it("includes module names in chunk breakdown", () => {
    const text = formatText(makeResult());
    expect(text).toContain("src/main.ts");
    expect(text).toContain("src/utils.ts");
  });

  it("includes duplicate section when duplicates exist", () => {
    const result = makeResult({
      duplicates: [
        {
          id: "src/shared.ts",
          chunks: ["entry.js", "lazy.js"],
          renderedSize: 100,
          wastedBytes: 100,
        },
      ],
    });
    const text = formatText(result);
    expect(text).toContain("Duplicate Modules");
    expect(text).toContain("src/shared.ts");
  });

  it("includes largest modules section", () => {
    const text = formatText(makeResult());
    expect(text).toContain("Largest Modules");
    expect(text).toContain("src/main.ts");
  });
});

describe("formatJson", () => {
  it("returns valid JSON", () => {
    const json = formatJson(makeResult());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("contains expected top-level keys", () => {
    const json = formatJson(makeResult());
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("chunks");
    expect(parsed).toHaveProperty("duplicates");
    expect(parsed).toHaveProperty("largestModules");
    expect(parsed).toHaveProperty("treeShakeStats");
    expect(parsed).toHaveProperty("totalSize");
    expect(parsed).toHaveProperty("totalModules");
  });

  it("contains correct chunk data", () => {
    const json = formatJson(makeResult());
    const parsed = JSON.parse(json);
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0].fileName).toBe("bundle.js");
    expect(parsed.chunks[0].totalSize).toBe(1500);
  });

  it("contains correct tree-shake stats", () => {
    const json = formatJson(makeResult());
    const parsed = JSON.parse(json);
    expect(parsed.treeShakeStats.totalOriginalSize).toBe(1700);
    expect(parsed.treeShakeStats.removedBytes).toBe(200);
  });

  it("contains module data in chunks", () => {
    const json = formatJson(makeResult());
    const parsed = JSON.parse(json);
    expect(parsed.chunks[0].modules).toHaveLength(2);
    expect(parsed.chunks[0].modules[0].id).toBe("src/main.ts");
  });
});

describe("formatHtml", () => {
  it("produces self-contained HTML with html tag", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes style tag", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
  });

  it("includes script tag", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
  });

  it("includes the title", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain("Steamroller Bundle Analysis");
  });

  it("includes chunk count in summary", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain(">1</div>");
  });

  it("embeds treemap data as inline JSON", () => {
    const html = formatHtml(makeResult());
    // The inline script should contain the module data
    expect(html).toContain("src/main.ts");
    expect(html).toContain("src/utils.ts");
  });

  it("includes tree-shaking percentage", () => {
    const html = formatHtml(makeResult());
    expect(html).toContain("11.8%");
  });

  it("has no external resource references", () => {
    const html = formatHtml(makeResult());
    // Should not reference external CSS/JS files
    expect(html).not.toContain('rel="stylesheet"');
    expect(html).not.toContain('src="http');
    expect(html).not.toContain('href="http');
  });
});
