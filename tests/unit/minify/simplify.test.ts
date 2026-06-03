import { describe, it, expect } from "vitest";
import { parseAst } from "../../../src/parse-ast.js";
import { simplifyExpressions } from "../../../src/minify/simplify.js";
import { emitMinified } from "../../../src/minify/emit.js";

const transform = (code: string): string => {
  const ast = parseAst(code, { sourceType: "module" });
  const result = simplifyExpressions(ast);
  return emitMinified(result);
};

describe("simplifyExpressions", () => {
  it("replaces true with !0", () => {
    const result = transform("var x = true;");
    expect(result).toContain("!0");
    expect(result).not.toContain("true");
  });

  it("replaces false with !1", () => {
    const result = transform("var x = false;");
    expect(result).toContain("!1");
    expect(result).not.toContain("false");
  });

  it("replaces undefined with void 0", () => {
    const result = transform("var x = undefined;");
    expect(result).toContain("void 0");
    expect(result).not.toMatch(/\bundefined\b/);
  });

  it("simplifies double negation in boolean context (if test)", () => {
    const result = transform("if (!!x) { y(); }");
    // Should not have !!
    expect(result).not.toContain("!!");
  });

  it("simplifies double negation in while test", () => {
    const result = transform("while (!!x) { y(); }");
    expect(result).not.toContain("!!");
  });

  it("simplifies double negation in logical operand", () => {
    const result = transform("var z = !!x && y;");
    expect(result).not.toContain("!!");
  });

  it("merges consecutive var declarations", () => {
    const result = transform("function f() { var a = 1; var b = 2; }");
    expect(result).toContain("var a=1,b=2");
  });

  it("merges consecutive let declarations", () => {
    const result = transform("function f() { let a = 1; let b = 2; }");
    expect(result).toContain("let a=1,b=2");
  });

  it("merges consecutive const declarations", () => {
    const result = transform("function f() { const a = 1; const b = 2; }");
    expect(result).toContain("const a=1,b=2");
  });

  it("does not merge different declaration kinds", () => {
    const result = transform("function f() { var a = 1; let b = 2; }");
    expect(result).toContain("var a=1");
    expect(result).toContain("let b=2");
  });

  it("simplifies x === true to x after earlier passes produce !0", () => {
    // When true becomes !0, x === !0 should simplify to x
    const result = transform("var y = x === true;");
    // After simplification: true -> !0, then x === !0 -> x
    expect(result).toContain("var y=x");
  });

  it("simplifies x === false to !x after earlier passes produce !1", () => {
    const result = transform("var y = x === false;");
    // After simplification: false -> !1, then x === !1 -> !x
    expect(result).toContain("var y=!x");
  });

  it("simplifies nested expressions", () => {
    const result = transform("var x = [true, false, undefined];");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
    expect(result).toContain("void 0");
  });

  it("simplifies inside function expressions", () => {
    const result = transform("var f = function() { return true; };");
    expect(result).toContain("!0");
  });

  it("simplifies inside arrow functions", () => {
    const result = transform("var f = () => true;");
    expect(result).toContain("!0");
  });
});
