/**
 * Unit tests for the public parseAst and parseAstAsync API.
 *
 * @module tests/unit/parse-ast
 */

import { describe, it, expect } from "bun:test";
import { parseAst, parseAstAsync } from "../../src/parse-ast.js";

describe("parseAst", () => {
  it("returns a Program node for empty input", () => {
    const result = parseAst("");
    expect(result.type).toBe("Program");
    expect(result.body).toEqual([]);
    expect(result.sourceType).toBe("module");
  });

  it("respects sourceType option", () => {
    const moduleResult = parseAst("const x = 1;", { sourceType: "module" });
    expect(moduleResult.sourceType).toBe("module");

    const scriptResult = parseAst("const x = 1;", { sourceType: "script" });
    expect(scriptResult.sourceType).toBe("script");
  });

  it("throws on syntax errors", () => {
    expect(() => parseAst("const = ;")).toThrow();
  });

  it("returns a frozen Program node", () => {
    const result = parseAst("const x = 1;");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns frozen body array", () => {
    const result = parseAst("const x = 1;");
    expect(Object.isFrozen(result.body)).toBe(true);
  });

  it("parses variable declarations correctly", () => {
    const result = parseAst("const x = 1; const y = 2;");
    expect(result.body.length).toBe(2);
  });

  it("handles hashbang lines", () => {
    const result = parseAst("#!/usr/bin/env node\nconst x = 1;");
    expect(result.type).toBe("Program");
    expect(result.body.length).toBe(1);
  });

  it("works with no options argument", () => {
    const result = parseAst("const x = 1;");
    expect(result.type).toBe("Program");
  });

  it("parses function declarations", () => {
    const result = parseAst("function foo() {}");
    expect(result.body.length).toBe(1);
    expect(result.body[0].type).toBe("FunctionDeclaration");
  });
});

describe("parseAstAsync", () => {
  it("resolves to a Program node for empty input", async () => {
    const result = await parseAstAsync("");
    expect(result.type).toBe("Program");
    expect(result.body).toEqual([]);
    expect(result.sourceType).toBe("module");
  });

  it("resolves with correct AST for valid code", async () => {
    const result = await parseAstAsync("const x = 1;");
    expect(result.type).toBe("Program");
    expect(result.body.length).toBe(1);
  });

  it("works with a non-aborted signal", async () => {
    const controller = new AbortController();
    const result = await parseAstAsync("const x = 1;", {
      signal: controller.signal,
    });
    expect(result.type).toBe("Program");
  });

  it("rejects when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseAstAsync("const x = 1;", { signal: controller.signal }),
    ).rejects.toThrow("Operation aborted");
  });

  it("rejects when signal is aborted during yield", async () => {
    const controller = new AbortController();
    // Abort after a microtask so it triggers after the first yield
    const promise = parseAstAsync("const x = 1;", {
      signal: controller.signal,
    });
    // Abort immediately — the setTimeout in yieldToEventLoop means
    // the second checkAborted will fire after the abort
    controller.abort();
    await expect(promise).rejects.toThrow("Operation aborted");
  });

  it("returns a frozen Program node", async () => {
    const result = await parseAstAsync("const x = 1;");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns frozen body array", async () => {
    const result = await parseAstAsync("const x = 1;");
    expect(Object.isFrozen(result.body)).toBe(true);
  });

  it("respects sourceType option", async () => {
    const result = await parseAstAsync("const x = 1;", {
      sourceType: "script",
    });
    expect(result.sourceType).toBe("script");
  });

  it("throws on syntax errors", async () => {
    await expect(parseAstAsync("const = ;")).rejects.toThrow();
  });

  it("works with undefined options", async () => {
    const result = await parseAstAsync("const x = 1;", undefined);
    expect(result.type).toBe("Program");
  });

  it("works with undefined signal in options", async () => {
    const result = await parseAstAsync("const x = 1;", { signal: undefined });
    expect(result.type).toBe("Program");
  });
});
