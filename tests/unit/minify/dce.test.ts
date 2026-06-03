import { describe, it, expect } from "vitest";
import { parseAst } from "../../../src/parse-ast.js";
import { eliminateDeadCode } from "../../../src/minify/dce.js";
import { emitMinified } from "../../../src/minify/emit.js";

const transform = (code: string): string => {
  const ast = parseAst(code, { sourceType: "module" });
  const result = eliminateDeadCode(ast);
  return emitMinified(result);
};

describe("eliminateDeadCode", () => {
  it("removes code after return statement", () => {
    const result = transform("function f() { return 1; var x = 2; }");
    expect(result).toContain("return 1");
    expect(result).not.toContain("var x");
  });

  it("removes code after throw statement", () => {
    const result = transform(
      'function f() { throw new Error("x"); var x = 2; }',
    );
    expect(result).toContain("throw");
    expect(result).not.toContain("var x");
  });

  it("removes code after break in a block", () => {
    const result = transform("function f() { for(;;) { break; var y = 2; } }");
    expect(result).toContain("break");
    expect(result).not.toContain("var y");
  });

  it("removes code after continue statement", () => {
    const result = transform(
      "function f() { for(;;) { continue; var y = 2; } }",
    );
    expect(result).toContain("continue");
    expect(result).not.toContain("var y");
  });

  it("preserves function declarations after return (hoisted)", () => {
    const result = transform("function f() { return 1; function g() {} }");
    expect(result).toContain("return 1");
    expect(result).toContain("function g");
  });

  it("removes always-false if branches", () => {
    const result = transform("if (false) { var x = 1; }");
    expect(result).not.toContain("var x");
  });

  it("keeps always-true if branches", () => {
    const result = transform("if (true) { var x = 1; } else { var y = 2; }");
    expect(result).toContain("var x");
    expect(result).not.toContain("var y");
  });

  it("removes side-effect-free expression statements", () => {
    const result = transform('function f() { 42; "hello"; return 1; }');
    expect(result).not.toContain("42");
    expect(result).not.toContain("hello");
    expect(result).toContain("return 1");
  });

  it("keeps expression statements with side effects", () => {
    const result = transform("function f() { console.log(1); return 1; }");
    expect(result).toContain("console.log");
    expect(result).toContain("return 1");
  });

  it("collapses single-statement if blocks", () => {
    const result = transform("function f(x) { if (x) { return 1; } }");
    expect(result).toContain("if(x)return 1");
  });

  it("handles nested dead code", () => {
    const result = transform(
      "function f() { return 1; if (true) { var x = 2; } }",
    );
    expect(result).toContain("return 1");
    expect(result).not.toContain("var x");
  });

  it("removes typeof side-effect-free expressions", () => {
    const result = transform("function f() { typeof x; return 1; }");
    expect(result).not.toContain("typeof");
    expect(result).toContain("return 1");
  });

  it("handles constant negation in if test", () => {
    const result = transform("if (!false) { var x = 1; }");
    expect(result).toContain("var x");
  });

  it("processes try/catch blocks", () => {
    const result = transform(
      "function f() { try { return 1; var x = 2; } catch(e) { return 2; var y = 3; } }",
    );
    expect(result).not.toContain("var x");
    expect(result).not.toContain("var y");
  });
});
