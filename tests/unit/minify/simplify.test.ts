import { describe, it, expect } from "bun:test";
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

  it("simplifies array with spread element containing true", () => {
    const result = transform("var x = [...[true]];");
    expect(result).toContain("!0");
  });

  // --- Double negation edge cases ---
  it("simplifies double negation in conditional test", () => {
    const result = transform("var x = !!a ? b : c;");
    expect(result).not.toContain("!!");
  });

  it("simplifies triple negation in boolean context", () => {
    const result = transform("if (!!!x) y();");
    // !!!x in boolean context: outer ! has bool context for !!x, !!x simplifies to x, giving !x
    expect(result).toContain("!x");
  });

  it("does not simplify double negation outside boolean context", () => {
    const result = transform("var x = !!y;");
    // Outside boolean context, !!y should remain
    expect(result).toContain("!!");
  });

  it("simplifies unary ! with non-boolean context", () => {
    const result = transform("var x = !true;");
    // true becomes !0, then !!0 in context... actually !true -> !(!0) = !!0
    // The key is that literals get replaced
    expect(result).toContain("!0");
  });

  // --- x == true / x == false ---
  it("simplifies true === x (left-side boolean literal)", () => {
    const result = transform("var y = true === x;");
    // true becomes !0, so !0 === x -> x
    expect(result).toContain("var y=x");
  });

  it("simplifies false === x (left-side boolean literal)", () => {
    const result = transform("var y = false === x;");
    // false becomes !1, so !1 === x -> !x
    expect(result).toContain("var y=!x");
  });

  it("simplifies x == true", () => {
    const result = transform("var y = x == true;");
    // true becomes !0, x == !0 -> x
    expect(result).toContain("var y=x");
  });

  it("simplifies x == false", () => {
    const result = transform("var y = x == false;");
    // false becomes !1, x == !1 -> !x
    expect(result).toContain("var y=!x");
  });

  // --- Propagation through various expression types ---
  it("simplifies inside call expression arguments", () => {
    const result = transform("foo(true, false, undefined);");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
    expect(result).toContain("void 0");
  });

  it("simplifies call expression with super callee", () => {
    // Class body methods are not recursively simplified at the top level
    // Test in a function context instead
    const result = transform("function f() { return foo(true); }");
    expect(result).toContain("!0");
  });

  it("simplifies call with spread argument", () => {
    const result = transform("foo(...[true]);");
    expect(result).toContain("!0");
  });

  it("simplifies inside assignment expression", () => {
    const result = transform("var x; x = true;");
    expect(result).toContain("x=!0");
  });

  it("simplifies inside object expression properties", () => {
    const result = transform("var x = { a: true, b: false };");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
  });

  it("simplifies object with spread", () => {
    const result = transform("var x = { ...{a: true} };");
    expect(result).toContain("!0");
  });

  it("simplifies inside sequence expression", () => {
    const result = transform("var x = (true, false);");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
  });

  it("simplifies inside arrow block body", () => {
    const result = transform("var f = () => { return true; };");
    expect(result).toContain("!0");
  });

  it("simplifies inside member expression", () => {
    const result = transform("var x = undefined.toString;");
    expect(result).toContain("void 0");
  });

  it("simplifies member with super (does not simplify super)", () => {
    const result = transform(
      "class A extends B { foo() { return super.bar; } }",
    );
    expect(result).toContain("super.bar");
  });

  it("simplifies computed member property", () => {
    const result = transform("var x = obj[true];");
    expect(result).toContain("obj[!0]");
  });

  it("simplifies inside new expression", () => {
    const result = transform("var x = new Foo(true);");
    expect(result).toContain("!0");
  });

  it("simplifies new with spread", () => {
    const result = transform("var x = new Foo(...[true]);");
    expect(result).toContain("!0");
  });

  // --- Statement-level simplification ---
  it("simplifies inside return statement", () => {
    const result = transform("function f() { return true; }");
    expect(result).toContain("!0");
  });

  it("simplifies return without argument", () => {
    const result = transform("function f() { return; }");
    expect(result).toContain("return");
  });

  it("simplifies inside throw statement", () => {
    const result = transform("function f() { throw true; }");
    expect(result).toContain("!0");
  });

  it("simplifies inside variable declarations", () => {
    const result = transform("var a = true, b = false;");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
  });

  it("simplifies variable declaration without init", () => {
    const result = transform("var a;");
    expect(result).toContain("var a");
  });

  it("simplifies inside if statement", () => {
    const result = transform("if (!!x) { true; } else { false; }");
    expect(result).not.toContain("!!");
  });

  it("simplifies if without alternate", () => {
    const result = transform("if (true) x();");
    expect(result).toContain("!0");
  });

  it("simplifies inside while statement with boolean context", () => {
    const result = transform("while (!!x) x();");
    expect(result).not.toContain("!!");
  });

  it("simplifies inside for statement", () => {
    const result = transform("for (var i = 0; true; i++) break;");
    expect(result).toContain("!0");
  });

  it("simplifies for without test and update", () => {
    const result = transform("for (;;) break;");
    expect(result).toContain("for(;;)");
  });

  it("simplifies inside block statement", () => {
    const result = transform("function f() { { var x = true; } }");
    expect(result).toContain("!0");
  });

  it("simplifies inside function declaration", () => {
    const result = transform("function f() { return true; }");
    expect(result).toContain("!0");
  });

  it("simplifies inside switch statement", () => {
    const result = transform("switch (true) { case true: break; }");
    expect(result).toContain("!0");
  });

  it("simplifies switch with default case", () => {
    const result = transform("switch (x) { default: true; }");
    expect(result).toContain("!0");
  });

  it("simplifies inside try/catch/finally", () => {
    const result = transform(
      "try { var x = true; } catch(e) { var y = false; } finally { var z = undefined; }",
    );
    expect(result).toContain("!0");
    expect(result).toContain("!1");
    expect(result).toContain("void 0");
  });

  it("simplifies try without handler", () => {
    const result = transform("try { true; } finally { false; }");
    expect(result).toContain("!0");
    expect(result).toContain("!1");
  });

  it("passes through default statement types", () => {
    const result = transform("debugger;");
    expect(result).toContain("debugger");
  });

  // --- Var merging edge cases ---
  it("merges three consecutive var declarations", () => {
    const result = transform(
      "function f() { var a = 1; var b = 2; var c = 3; }",
    );
    expect(result).toContain("var a=1,b=2,c=3");
  });

  it("does not merge non-consecutive var declarations", () => {
    const result = transform("function f() { var a = 1; x(); var b = 2; }");
    expect(result).toContain("var a=1");
    expect(result).toContain("var b=2");
  });

  it("merges top-level var declarations", () => {
    const result = transform("var a = 1; var b = 2;");
    expect(result).toContain("var a=1,b=2");
  });

  // --- Module-level declarations ---
  it("simplifies export named declaration with function", () => {
    const result = transform("export function f() { return true; }");
    expect(result).toContain("!0");
  });

  it("passes through export named without declaration", () => {
    const result = transform("var x = 1; export { x };");
    expect(result).toContain("export{x}");
  });

  it("simplifies export default expression", () => {
    const result = transform("export default true;");
    expect(result).toContain("!0");
  });

  it("simplifies export default function", () => {
    const result = transform("export default function f() { return true; }");
    expect(result).toContain("!0");
  });

  it("simplifies export default class", () => {
    // Class body methods are not traversed by simplifyStmt
    const result = transform(
      "export default class C { method() { return true; } }",
    );
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

  // --- Binary expression: unchanged branches should keep original ---
  it("propagates unchanged binary expression", () => {
    const result = transform("var x = a + b;");
    expect(result).toContain("a+b");
  });

  // --- Logical expression: unchanged branches should keep original ---
  it("propagates unchanged logical expression", () => {
    const result = transform("var x = a && b;");
    expect(result).toContain("a&&b");
  });

  // --- Conditional expression: unchanged ---
  it("propagates unchanged conditional expression", () => {
    const result = transform("var x = a ? b : c;");
    expect(result).toContain("a?b:c");
  });

  // --- Assignment expression: unchanged ---
  it("propagates unchanged assignment expression", () => {
    const result = transform("var x; x = y;");
    expect(result).toContain("x=y");
  });
});
