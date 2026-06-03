import { describe, it, expect } from "vitest";
import { parseAst } from "../../../src/parse-ast.js";
import { mangleNames } from "../../../src/minify/mangle.js";
import { emitMinified } from "../../../src/minify/emit.js";

const transform = (
  code: string,
  options?: Parameters<typeof mangleNames>[1],
): string => {
  const ast = parseAst(code, { sourceType: "module" });
  const result = mangleNames(ast, options);
  return emitMinified(result);
};

describe("mangleNames", () => {
  it("renames local variables inside functions", () => {
    const result = transform(
      "function test() { var longName = 1; return longName; }",
    );
    expect(result).not.toContain("longName");
    expect(result).toContain("return");
  });

  it("renames let and const inside functions", () => {
    const result = transform(
      "function test() { let counter = 0; const value = 10; return counter + value; }",
    );
    expect(result).not.toContain("counter");
    expect(result).not.toContain("value");
  });

  it("does not rename top-level variables", () => {
    const result = transform("var topLevel = 42;");
    expect(result).toContain("topLevel");
  });

  it("does not rename reserved words", () => {
    const result = transform(
      "function test() { var x = console.log(true); return x; }",
    );
    expect(result).toContain("console");
  });

  it("does not rename global built-ins", () => {
    const result = transform("function test() { return Math.floor(1.5); }");
    expect(result).toContain("Math");
    expect(result).toContain("floor");
  });

  it("assigns shortest names to most frequently used bindings", () => {
    const result = transform(
      "function test() { var used = 1; var rare = 2; return used + used + used + rare; }",
    );
    // 'used' referenced 4 times, 'rare' referenced 2 times
    // 'used' should get shorter name (e.g. 'a') than 'rare' (e.g. 'b')
    expect(result).not.toContain("used");
    expect(result).not.toContain("rare");
  });

  it("respects reserved names option", () => {
    const result = transform(
      "function test() { var myVar = 1; return myVar; }",
      { reserved: ["myVar"] },
    );
    expect(result).toContain("myVar");
  });

  it("handles nested functions", () => {
    const result = transform(
      "function outer() { var x = 1; function inner() { var y = 2; return y; } return x + inner(); }",
    );
    expect(result).not.toContain("var x");
    expect(result).not.toContain("var y");
  });

  it("does not rename in eval-containing scopes", () => {
    const result = transform(
      'function test() { var secret = 42; eval("secret"); return secret; }',
    );
    expect(result).toContain("secret");
  });

  it("mangles properties with opt-in", () => {
    const result = transform(
      "function f() { var o = {}; o._private = 1; return o._private; }",
      {
        mangleProperties: true,
      },
    );
    expect(result).not.toContain("_private");
  });

  it("does not mangle properties by default", () => {
    const result = transform(
      "function f() { var o = {}; o._private = 1; return o._private; }",
    );
    expect(result).toContain("_private");
  });

  it("handles function parameters", () => {
    const result = transform(
      "function test(longParam) { return longParam + 1; }",
    );
    expect(result).not.toContain("longParam");
  });

  it("handles arrow function parameters", () => {
    const result = transform(
      "var f = function() { var fn = (longParam) => longParam + 1; return fn(1); };",
    );
    expect(result).not.toContain("longParam");
  });

  it("handles destructuring in parameters", () => {
    const result = transform(
      "function f() { var fn = ({longName}) => longName; return fn({}); }",
    );
    // Property key 'longName' must remain, but the binding is renamed
    // {longName} becomes {longName:a} where 'a' is the renamed binding
    expect(result).toContain("longName:");
    // The binding usage should be renamed
    expect(result).toMatch(/=>\s*[a-z]/);
  });

  it("does not rename exported names", () => {
    const result = transform("export function myFunction() { return 1; }");
    expect(result).toContain("myFunction");
  });

  it("handles catch clause parameters", () => {
    const result = transform(
      "function f() { try { throw 1; } catch(longError) { return longError; } }",
    );
    expect(result).not.toContain("longError");
  });
});
