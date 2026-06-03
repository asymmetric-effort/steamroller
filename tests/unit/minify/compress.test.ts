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

  // --- Arrow body compression edge cases ---
  it("does not compress arrow with return but no argument", () => {
    const result = transform("var f = () => { return; };");
    expect(result).toContain("return");
  });

  it("compresses arrow with block body returning an object", () => {
    const result = transform("var f = () => { return {a: 1}; };");
    // Should convert to expression body
    expect(result).not.toContain("return");
  });

  // --- Recursive expression compression ---
  it("compresses call expression arguments", () => {
    const result = transform('var x = foo(obj["bar"]);');
    expect(result).toContain("foo(obj.bar)");
  });

  it("compresses call with super callee (does not compress super)", () => {
    const result = transform(
      "class A extends B { constructor() { super(1); } }",
    );
    expect(result).toContain("super(1)");
  });

  it("compresses call expression with spread arguments", () => {
    const result = transform('var x = foo(...obj["bar"]);');
    expect(result).toContain("...obj.bar");
  });

  it("compresses assignment expression right side", () => {
    const result = transform('var x; x = obj["bar"];');
    expect(result).toContain("x=obj.bar");
  });

  it("compresses binary expression left and right", () => {
    const result = transform('var x = obj["a"] + obj["b"];');
    expect(result).toContain("obj.a+obj.b");
  });

  it("compresses logical expression left and right", () => {
    const result = transform('var x = obj["a"] || obj["b"];');
    expect(result).toContain("obj.a||obj.b");
  });

  it("compresses unary expression argument", () => {
    const result = transform('var x = !obj["valid"];');
    expect(result).toContain("!obj.valid");
  });

  it("compresses conditional expression branches", () => {
    const result = transform('var x = cond ? obj["a"] : obj["b"];');
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses sequence expression elements", () => {
    const result = transform('var x = (obj["a"], obj["b"]);');
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses array expression elements", () => {
    const result = transform('var x = [obj["a"], null, obj["b"]];');
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses array expression with spread", () => {
    const result = transform('var x = [...obj["items"]];');
    expect(result).toContain("...obj.items");
  });

  it("compresses function expression body", () => {
    const result = transform(
      'var f = function() { a = 1; b = 2; return obj["c"]; };',
    );
    expect(result).toContain("obj.c");
  });

  it("compresses new expression callee and arguments", () => {
    const result = transform('var x = new Foo(obj["bar"]);');
    expect(result).toContain("obj.bar");
  });

  it("compresses new expression with spread", () => {
    const result = transform('var x = new Foo(...obj["bar"]);');
    expect(result).toContain("...obj.bar");
  });

  it("compresses template literal expressions", () => {
    const result = transform('var x = `${obj["a"]}`;');
    expect(result).toContain("obj.a");
  });

  it("compresses tagged template expression", () => {
    const result = transform('var x = tag`${obj["a"]}`;');
    expect(result).toContain("obj.a");
  });

  it("compresses update expression argument", () => {
    const result = transform('obj["count"]++;');
    expect(result).toContain("obj.count++");
  });

  it("compresses yield expression argument", () => {
    const result = transform('function* gen() { yield obj["val"]; }');
    expect(result).toContain("obj.val");
  });

  it("compresses yield without argument", () => {
    const result = transform("function* gen() { yield; }");
    expect(result).toContain("yield");
  });

  it("compresses await expression argument", () => {
    const result = transform('async function f() { await obj["val"]; }');
    expect(result).toContain("obj.val");
  });

  it("passes through default expression types unchanged", () => {
    const result = transform("var x = this;");
    expect(result).toContain("this");
  });

  // --- Object shorthand edge cases ---
  it("does not convert method property to shorthand", () => {
    const result = transform("var o = { x() { return 1; } };");
    expect(result).toContain("x()");
  });

  it("does not convert getter/setter to shorthand", () => {
    const result = transform("var o = { get x() { return 1; } };");
    expect(result).toContain("get x()");
  });

  it("compresses object with spread element", () => {
    const result = transform('var o = { ...obj["a"] };');
    expect(result).toContain("...obj.a");
  });

  // --- Member expression with Super ---
  it("compresses member with super object (does not compress super)", () => {
    const result = transform(
      'class A extends B { method() { return super["foo"]; } }',
    );
    expect(result).toContain("super");
  });

  // --- Computed member that is a reserved word ---
  it("does not convert computed member with reserved word key", () => {
    const result = transform('var x = obj["class"];');
    expect(result).toContain('["class"]');
  });

  // --- Statement compression: various statement types ---
  it("compresses throw statement argument", () => {
    const result = transform('function f() { throw obj["err"]; }');
    expect(result).toContain("obj.err");
  });

  it("compresses variable declaration initializers", () => {
    const result = transform(
      'function f() { var x = obj["a"], y = obj["b"]; }',
    );
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses if statement test and branches", () => {
    const result = transform(
      'function f() { if (obj["a"]) { obj["b"]; } else { obj["c"]; } }',
    );
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
    expect(result).toContain("obj.c");
  });

  it("compresses while statement test and body", () => {
    const result = transform('function f() { while (obj["a"]) { obj["b"]; } }');
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses for statement parts", () => {
    const result = transform(
      'function f() { for (var i = 0; obj["test"]; obj["upd"]++) {} }',
    );
    expect(result).toContain("obj.test");
    expect(result).toContain("obj.upd");
  });

  it("compresses switch statement", () => {
    const result = transform(
      'function f() { switch (obj["a"]) { case obj["b"]: break; } }',
    );
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses try/catch/finally", () => {
    const result = transform(
      'function f() { try { obj["a"]; } catch(e) { obj["b"]; } finally { obj["c"]; } }',
    );
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
    expect(result).toContain("obj.c");
  });

  it("compresses function declaration body", () => {
    const result = transform(
      'function f() { function inner() { return obj["x"]; } }',
    );
    expect(result).toContain("obj.x");
  });

  it("compresses block statement", () => {
    const result = transform('function f() { { obj["x"]; } }');
    expect(result).toContain("obj.x");
  });

  it("passes through default statement types unchanged", () => {
    const result = transform(
      "function f() { break_label: for(;;) break break_label; }",
    );
    expect(result).toContain("break_label");
  });

  // --- Sequence compression edge cases ---
  it("keeps expression statements as-is when not followed by return", () => {
    const result = transform("function f() { a = 1; b = 2; c = 3; }");
    expect(result).toContain("a=1");
    expect(result).toContain("b=2");
    expect(result).toContain("c=3");
  });

  it("does not merge expression stmts with return that has no argument", () => {
    const result = transform("function f() { a = 1; return; }");
    expect(result).toContain("a=1");
    expect(result).toContain("return");
  });

  it("compresses non-expression stmt followed by expression stmts", () => {
    const result = transform(
      "function f() { var x = 1; a = 1; b = 2; return c; }",
    );
    expect(result).toContain("return a=1,b=2,c");
  });

  // --- Module-level declarations ---
  it("compresses export named declaration with function", () => {
    const result = transform('export function f() { return obj["x"]; }');
    expect(result).toContain("obj.x");
  });

  it("passes through export named declaration without declaration", () => {
    const result = transform("var x = 1; export { x };");
    expect(result).toContain("export{x}");
  });

  it("compresses export default expression", () => {
    const result = transform('export default obj["x"];');
    expect(result).toContain("obj.x");
  });

  it("compresses export default function declaration", () => {
    const result = transform(
      'export default function f() { return obj["x"]; }',
    );
    expect(result).toContain("obj.x");
  });

  it("passes through import and export-all declarations", () => {
    const result = transform('import { x } from "mod"; export * from "mod2";');
    expect(result).toContain("import");
    expect(result).toContain("export*");
  });

  it("compresses return statement without argument", () => {
    const result = transform("function f() { return; }");
    expect(result).toContain("return");
  });

  it("compresses for statement with no test and no update", () => {
    const result = transform("function f() { for (;;) { break; } }");
    expect(result).toContain("for(;;)");
  });

  it("compresses switch with default case", () => {
    const result = transform("function f() { switch (x) { default: break; } }");
    expect(result).toContain("switch");
  });

  it("compresses try with handler but no param", () => {
    const result = transform(
      'function f() { try { obj["a"]; } catch { obj["b"]; } }',
    );
    expect(result).toContain("obj.a");
    expect(result).toContain("obj.b");
  });

  it("compresses try without finalizer", () => {
    const result = transform(
      'function f() { try { obj["a"]; } catch(e) { obj["b"]; } }',
    );
    expect(result).toContain("obj.a");
  });
});
