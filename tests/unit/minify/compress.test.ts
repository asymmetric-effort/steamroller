import { describe, it, expect } from "vitest";
import { parseAst } from "../../../src/parse-ast.js";
import { compressCode } from "../../../src/minify/compress.js";
import { emitMinified } from "../../../src/minify/emit.js";

const transform = (code: string): string => {
  const ast = parseAst(code, { sourceType: "module" });
  const result = compressCode(ast);
  return emitMinified(result);
};

describe("compressCode", () => {
  it("compresses arrow function with return to expression body", () => {
    const result = transform("var f = () => { return 1; };");
    expect(result).toContain("()=>1");
    expect(result).not.toContain("return");
  });

  it("compresses arrow with expression return", () => {
    const result = transform("var f = (x) => { return x + 1; };");
    expect(result).toContain("=>x+1");
  });

  it("does not compress arrow with multiple statements", () => {
    const result = transform("var f = () => { var x = 1; return x; };");
    expect(result).toContain("return");
  });

  it("converts object property to shorthand", () => {
    const result = transform("var o = { x: x, y: y };");
    expect(result).toContain("{x,y}");
  });

  it("does not convert non-matching property to shorthand", () => {
    const result = transform("var o = { x: y };");
    expect(result).toContain("x:y");
  });

  it("converts computed string member to dot notation", () => {
    const result = transform('var x = obj["prop"];');
    expect(result).toContain("obj.prop");
    expect(result).not.toContain('["prop"]');
  });

  it("does not convert computed member when not valid identifier", () => {
    const result = transform('var x = obj["my-prop"];');
    expect(result).toContain('["my-prop"]');
  });

  it("does not convert computed member with numeric key", () => {
    const result = transform("var x = obj[0];");
    expect(result).toContain("[0]");
  });

  it("compresses expression statements followed by return into sequence", () => {
    const result = transform("function f() { a = 1; b = 2; return c; }");
    expect(result).toContain("return a=1,b=2,c");
  });

  it("does not compress sequences without final return", () => {
    const result = transform("function f() { a = 1; b = 2; }");
    // Should still have separate statements
    expect(result).toContain("a=1");
    expect(result).toContain("b=2");
  });

  it("handles nested arrow compression", () => {
    const result = transform(
      "var f = (x) => { return (y) => { return x + y; }; };",
    );
    expect(result).toContain("=>y=>x+y");
  });

  it("compresses arrow returning expression body", () => {
    const result = transform("var f = (x) => { return x * 2; };");
    expect(result).toContain("x=>x*2");
  });

  it("preserves arrow functions that already have expression body", () => {
    const result = transform("var f = (x) => x * 2;");
    expect(result).toContain("x=>x*2");
  });

  it("handles shorthand with computed properties", () => {
    const result = transform("var o = { [key]: value };");
    expect(result).toContain("[key]:value");
  });
});
