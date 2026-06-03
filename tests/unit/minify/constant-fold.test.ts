import { describe, it, expect } from "vitest";
import { parseAst } from "../../../src/parse-ast.js";
import { foldConstants } from "../../../src/minify/constant-fold.js";
import { emitMinified } from "../../../src/minify/emit.js";

const transform = (code: string): string => {
  const ast = parseAst(code, { sourceType: "module" });
  const result = foldConstants(ast);
  return emitMinified(result);
};

describe("foldConstants", () => {
  it("folds addition of numbers", () => {
    const result = transform("var x = 1 + 2;");
    expect(result).toContain("var x=3");
  });

  it("folds subtraction", () => {
    const result = transform("var x = 10 - 3;");
    expect(result).toContain("var x=7");
  });

  it("folds multiplication", () => {
    const result = transform("var x = 3 * 4;");
    expect(result).toContain("var x=12");
  });

  it("folds division", () => {
    const result = transform("var x = 10 / 2;");
    expect(result).toContain("var x=5");
  });

  it("folds modulo", () => {
    const result = transform("var x = 10 % 3;");
    expect(result).toContain("var x=1");
  });

  it("folds string concatenation", () => {
    const result = transform('var x = "hello" + " " + "world";');
    expect(result).toContain('"hello world"');
  });

  it("folds comparison operators", () => {
    const result = transform("var x = 1 < 2;");
    expect(result).toContain("var x=true");
  });

  it("folds strict equality", () => {
    const result = transform("var x = 1 === 1;");
    expect(result).toContain("var x=true");
  });

  it("folds unary negation on boolean", () => {
    const result = transform("var x = !true;");
    expect(result).toContain("var x=false");
  });

  it("folds typeof on literal", () => {
    const result = transform('var x = typeof "hello";');
    expect(result).toContain('"string"');
  });

  it("folds typeof undefined identifier", () => {
    const result = transform("var x = typeof undefined;");
    expect(result).toContain('"undefined"');
  });

  it("folds logical AND with constant left", () => {
    const result = transform("var x = true && y;");
    expect(result).toContain("var x=y");
  });

  it("folds logical OR with constant left", () => {
    const result = transform("var x = false || y;");
    expect(result).toContain("var x=y");
  });

  it("folds conditional with constant test true", () => {
    const result = transform("var x = true ? 1 : 2;");
    expect(result).toContain("var x=1");
    expect(result).not.toContain("2");
  });

  it("folds conditional with constant test false", () => {
    const result = transform("var x = false ? 1 : 2;");
    expect(result).toContain("var x=2");
  });

  it("folds bitwise operators", () => {
    const result = transform("var x = 5 | 3;");
    expect(result).toContain("var x=7");
  });

  it("folds nested constant expressions", () => {
    const result = transform("var x = (1 + 2) * (3 + 4);");
    expect(result).toContain("var x=21");
  });

  it("does not fold division by zero", () => {
    const result = transform("var x = 1 / 0;");
    expect(result).toContain("/");
  });

  it("folds exponentiation", () => {
    const result = transform("var x = 2 ** 3;");
    expect(result).toContain("var x=8");
  });

  it("folds numeric unary minus", () => {
    const result = transform("var x = -5;");
    expect(result).toContain("var x=-5");
  });
});
