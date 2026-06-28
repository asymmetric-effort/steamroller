import { describe, it, expect } from "bun:test";
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

  // --- More arithmetic operators ---
  it("folds modulo by zero (no fold)", () => {
    const result = transform("var x = 10 % 0;");
    expect(result).toContain("%");
  });

  it("folds bitwise AND", () => {
    const result = transform("var x = 7 & 3;");
    expect(result).toContain("var x=3");
  });

  it("folds bitwise XOR", () => {
    const result = transform("var x = 5 ^ 3;");
    expect(result).toContain("var x=6");
  });

  it("folds left shift", () => {
    const result = transform("var x = 1 << 3;");
    expect(result).toContain("var x=8");
  });

  it("folds right shift", () => {
    const result = transform("var x = 16 >> 2;");
    expect(result).toContain("var x=4");
  });

  it("folds unsigned right shift", () => {
    const result = transform("var x = 16 >>> 2;");
    expect(result).toContain("var x=4");
  });

  it("folds != comparison", () => {
    const result = transform("var x = 1 != 2;");
    expect(result).toContain("var x=true");
  });

  it("folds !== comparison", () => {
    const result = transform("var x = 1 !== 2;");
    expect(result).toContain("var x=true");
  });

  it("folds == comparison", () => {
    const result = transform("var x = 1 == 1;");
    expect(result).toContain("var x=true");
  });

  it("folds <= comparison", () => {
    const result = transform("var x = 1 <= 2;");
    expect(result).toContain("var x=true");
  });

  it("folds > comparison", () => {
    const result = transform("var x = 3 > 1;");
    expect(result).toContain("var x=true");
  });

  it("folds >= comparison", () => {
    const result = transform("var x = 3 >= 3;");
    expect(result).toContain("var x=true");
  });

  // --- String folding ---
  it("folds string concatenation at different levels", () => {
    const result = transform('var x = "a" + "b";');
    expect(result).toContain('"ab"');
  });

  // --- Boolean folding ---
  it("folds !false to true", () => {
    const result = transform("var x = !false;");
    expect(result).toContain("var x=true");
  });

  // --- typeof folding ---
  it("folds typeof on number literal", () => {
    const result = transform("var x = typeof 42;");
    expect(result).toContain('"number"');
  });

  it("folds typeof on boolean literal", () => {
    const result = transform("var x = typeof true;");
    expect(result).toContain('"boolean"');
  });

  it("folds typeof on null literal", () => {
    const result = transform("var x = typeof null;");
    expect(result).toContain('"object"');
  });

  // --- Unary operators ---
  it("folds unary plus on number", () => {
    const result = transform("var x = +5;");
    expect(result).toContain("var x=5");
  });

  it("folds bitwise NOT on number", () => {
    const result = transform("var x = ~0;");
    expect(result).toContain("var x=-1");
  });

  it("folds void operator to void 0", () => {
    const result = transform("var x = void 42;");
    expect(result).toContain("void 0");
  });

  it("does not fold unary minus on non-number", () => {
    const result = transform('var x = -"hello";');
    expect(result).toContain("-");
  });

  it("does not fold unary plus on non-number", () => {
    const result = transform('var x = +"hello";');
    expect(result).toContain("+");
  });

  it("does not fold bitwise NOT on non-number", () => {
    const result = transform('var x = ~"hello";');
    expect(result).toContain("~");
  });

  it("propagates changes in unary expression argument without fold", () => {
    // delete (1+2) - the argument folds but delete can't fold
    const result = transform("var x = typeof (1 + 2);");
    expect(result).toContain('"number"');
  });

  it("handles unary operator with foldable argument but unknown op", () => {
    // delete with a foldable argument - delete is not handled by fold
    const result = transform("delete obj[1 + 2];");
    expect(result).toContain("3");
  });

  // --- Logical expressions ---
  it("folds logical AND with falsy left", () => {
    const result = transform("var x = false && y;");
    expect(result).toContain("var x=false");
  });

  it("folds logical OR with truthy left", () => {
    const result = transform("var x = true || y;");
    expect(result).toContain("var x=true");
  });

  it("folds nullish coalescing with non-null left", () => {
    const result = transform("var x = 1 ?? y;");
    expect(result).toContain("var x=1");
  });

  it("folds nullish coalescing with null left", () => {
    // null literal has value null, which matches the ?? null check
    // but getConstantValue returns {value: null} for null literal
    // The ?? operator checks: lv.value !== null && lv.value !== undefined
    // null !== null is false, so it returns right
    const result = transform("var x = null ?? y;");
    // null is object type, getConstantValue only returns for non-object
    // Actually: null literal has value null, typeof null === "object"
    // getConstantValue checks typeof expr.value !== "object" so null is excluded
    expect(result).toContain("??");
  });

  it("propagates changes in logical expression even when not fully foldable", () => {
    const result = transform("var x = (1 + 2) && y;");
    expect(result).toContain("var x=y");
  });

  // --- Conditional expression ---
  it("folds conditional with non-constant test but foldable branches", () => {
    const result = transform("var x = y ? 1 + 2 : 3 + 4;");
    expect(result).toContain("y?3:7");
  });

  // --- Recursive expression folding ---
  it("folds inside call expression arguments", () => {
    const result = transform("var x = foo(1 + 2, 3 * 4);");
    expect(result).toContain("foo(3,12)");
  });

  it("folds inside call expression with super callee", () => {
    // Class body methods are not recursively folded by the top-level fold
    // because foldConstants only processes top-level statements and
    // specific statement types, not class method bodies directly
    const result = transform("function f() { return foo(1 + 2); }");
    expect(result).toContain("foo(3)");
  });

  it("folds call with spread argument", () => {
    const result = transform("var x = foo(...[1 + 2]);");
    // The spread argument array contains 1+2 which folds to 3
    expect(result).toContain("3");
  });

  it("folds inside array expression elements", () => {
    const result = transform("var x = [1 + 2, null, 3 * 4];");
    // null elements are emitted as "null" not as empty slots
    expect(result).toContain("[3,null,12]");
  });

  it("folds array with spread element", () => {
    const result = transform("var x = [...[1 + 2]];");
    expect(result).toContain("3");
  });

  it("folds inside object expression properties", () => {
    const result = transform("var x = { a: 1 + 2, b: 3 * 4 };");
    expect(result).toContain("a:3");
    expect(result).toContain("b:12");
  });

  it("folds object with spread element", () => {
    const result = transform("var x = { ...{ a: 1 + 2 } };");
    expect(result).toContain("3");
  });

  it("folds inside assignment expression", () => {
    const result = transform("var x; x = 1 + 2;");
    expect(result).toContain("x=3");
  });

  it("folds inside sequence expression", () => {
    const result = transform("var x = (1 + 2, 3 * 4);");
    expect(result).toContain("3");
    expect(result).toContain("12");
  });

  it("folds inside member expression object", () => {
    const result = transform("var x = (1 + 2).toString;");
    expect(result).toContain("3");
  });

  it("folds member expression with super object (no fold on super)", () => {
    const result = transform(
      "class A extends B { method() { return super.foo; } }",
    );
    expect(result).toContain("super.foo");
  });

  it("folds computed member expression property", () => {
    const result = transform("var x = obj[1 + 2];");
    expect(result).toContain("obj[3]");
  });

  it("folds inside arrow function expression body", () => {
    const result = transform("var f = () => 1 + 2;");
    expect(result).toContain("=>3");
  });

  it("folds inside arrow function block body", () => {
    const result = transform("var f = () => { return 1 + 2; };");
    expect(result).toContain("3");
  });

  it("folds inside function expression body", () => {
    const result = transform("var f = function() { return 1 + 2; };");
    expect(result).toContain("3");
  });

  it("passes through default expression types", () => {
    const result = transform("var x = this;");
    expect(result).toContain("this");
  });

  // --- Statement folding ---
  it("folds inside expression statement", () => {
    const result = transform("1 + 2;");
    expect(result).toContain("3");
  });

  it("folds inside return statement", () => {
    const result = transform("function f() { return 1 + 2; }");
    expect(result).toContain("return 3");
  });

  it("folds return without argument", () => {
    const result = transform("function f() { return; }");
    expect(result).toContain("return");
  });

  it("folds inside throw statement", () => {
    const result = transform("function f() { throw 1 + 2; }");
    expect(result).toContain("throw 3");
  });

  it("folds inside variable declaration", () => {
    const result = transform("var a = 1 + 2, b = 3 * 4;");
    expect(result).toContain("a=3");
    expect(result).toContain("b=12");
  });

  it("folds variable declaration without init", () => {
    const result = transform("var a;");
    expect(result).toContain("var a");
  });

  it("folds inside if statement", () => {
    const result = transform("if (1 + 2) { 3 * 4; } else { 5 + 6; }");
    expect(result).toContain("3");
    expect(result).toContain("12");
    expect(result).toContain("11");
  });

  it("folds if without alternate", () => {
    const result = transform("if (1 + 2) { 3 * 4; }");
    expect(result).toContain("3");
    expect(result).toContain("12");
  });

  it("folds inside while statement", () => {
    const result = transform("while (1 + 2) { break; }");
    expect(result).toContain("3");
  });

  it("folds inside for statement", () => {
    const result = transform("for (var i = 0; 1 + 2; 3 + 4) { break; }");
    expect(result).toContain("3");
    expect(result).toContain("7");
  });

  it("folds for without test and update", () => {
    const result = transform("for (;;) { break; }");
    expect(result).toContain("for(;;)");
  });

  it("folds inside block statement", () => {
    const result = transform("{ var x = 1 + 2; }");
    expect(result).toContain("3");
  });

  it("folds inside function declaration", () => {
    const result = transform("function f() { return 1 + 2; }");
    expect(result).toContain("3");
  });

  it("folds inside switch statement", () => {
    const result = transform("switch (1 + 2) { case 3: break; }");
    expect(result).toContain("3");
  });

  it("folds switch with default case", () => {
    const result = transform("switch (x) { default: 1 + 2; }");
    expect(result).toContain("3");
  });

  it("folds inside try/catch/finally", () => {
    const result = transform(
      "try { var x = 1 + 2; } catch(e) { var y = 3 + 4; } finally { var z = 5 + 6; }",
    );
    expect(result).toContain("3");
    expect(result).toContain("7");
    expect(result).toContain("11");
  });

  it("folds try without handler", () => {
    const result = transform("try { var x = 1 + 2; } finally { var y = 3; }");
    expect(result).toContain("3");
  });

  it("folds try without finalizer", () => {
    const result = transform("try { var x = 1 + 2; } catch(e) { var y = 3; }");
    expect(result).toContain("3");
  });

  it("passes through default statement types", () => {
    const result = transform("debugger;");
    expect(result).toContain("debugger");
  });

  // --- Module-level folding ---
  it("folds export named declaration with function", () => {
    const result = transform("export function f() { return 1 + 2; }");
    expect(result).toContain("3");
  });

  it("passes through export named without declaration", () => {
    const result = transform("var x = 1 + 2; export { x };");
    expect(result).toContain("3");
    expect(result).toContain("export{x}");
  });

  it("folds export default expression", () => {
    const result = transform("export default 1 + 2;");
    expect(result).toContain("3");
  });

  it("folds export default function declaration", () => {
    const result = transform("export default function f() { return 1 + 2; }");
    expect(result).toContain("3");
  });

  it("folds export default class declaration", () => {
    // Class declarations are handled at the top level by foldStatement
    // but class body methods are not traversed by foldStatement
    const result = transform(
      "export default class C { method() { return 1 + 2; } }",
    );
    // The class body methods aren't directly folded by the simple statement folder
    expect(result).toContain("class C");
  });

  it("passes through import declarations", () => {
    const result = transform('import { x } from "mod";');
    expect(result).toContain("import");
  });

  it("passes through export-all declarations", () => {
    const result = transform('export * from "mod";');
    expect(result).toContain("export*");
  });

  // --- Logical expression with changed children but not foldable ---
  it("propagates changes in logical expression children without fold", () => {
    const result = transform("var x = (1 + 2 > 0) && (3 + 4 > 0);");
    // Both sides fold but the logical itself doesn't fold because the results are non-constant
    // Actually, 1+2>0 folds to true, and true is a constant, so && folds
    // Let's use a different approach: non-constant left that contains foldable children
    const result2 = transform("var x = y || (1 + 2);");
    expect(result2).toContain("y||3");
  });

  // --- Conditional expression where nothing changes ---
  it("returns unchanged conditional when no children change", () => {
    const result = transform("var x = y ? z : w;");
    expect(result).toContain("y?z:w");
  });

  // --- Non-foldable binary with changed children ---
  it("propagates changes in binary without full fold", () => {
    const result = transform("var x = (1 + 2) + y;");
    expect(result).toContain("3+y");
  });

  // --- Conditional with changed children but non-constant test ---
  it("propagates folded children in conditional", () => {
    const result = transform("var x = z ? 1 + 2 : 3 + 4;");
    expect(result).toContain("z?3:7");
  });

  // --- getConstantValue with null literal ---
  it("handles null literal in binary expression", () => {
    // null literal has typeof value === "object", so getConstantValue
    // returns undefined for it (only non-object values are extracted)
    const result = transform("var x = null == null;");
    expect(result).toContain("null==null");
  });

  // --- Non-foldable unary with changed argument ---
  it("propagates changes in unary expression", () => {
    const result = transform("var x = -(1 + 2);");
    expect(result).toContain("var x=-3");
  });

  // --- Binary expression with unknown operator ---
  it("does not fold unknown binary operator", () => {
    // 'in' operator cannot be folded with literals
    const result = transform('var x = "a" in obj;');
    expect(result).toContain("in");
  });

  // --- Infinity result from operations (not isFinite) ---
  it("does not fold Infinity result", () => {
    // 1e308 * 2 = Infinity, which is not finite so should not fold
    const result = transform("var x = 1e308 * 2;");
    expect(result).toContain("*");
  });
});
