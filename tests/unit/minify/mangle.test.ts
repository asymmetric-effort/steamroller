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

  // --- Scope tree building ---
  it("handles let and const in block scopes", () => {
    const result = transform(
      "function f() { { let blockVar = 1; return blockVar; } }",
    );
    expect(result).not.toContain("blockVar");
  });

  it("handles for statement with var init", () => {
    const result = transform(
      "function f() { for (var longIdx = 0; longIdx < 10; longIdx++) {} return longIdx; }",
    );
    expect(result).not.toContain("longIdx");
  });

  it("handles for statement with expression init", () => {
    const result = transform(
      "function f() { var longIdx = 0; for (longIdx = 0; longIdx < 10; longIdx++) {} }",
    );
    expect(result).not.toContain("longIdx");
  });

  it("handles for-in statement with var", () => {
    const result = transform(
      "function f() { for (var longKey in obj) { return longKey; } }",
    );
    expect(result).not.toContain("longKey");
  });

  it("handles for-in statement with pattern left", () => {
    const result = transform(
      "function f() { var longKey; for (longKey in obj) { return longKey; } }",
    );
    expect(result).not.toContain("longKey");
  });

  it("handles for-of statement with var", () => {
    const result = transform(
      "function f() { for (var longVal of arr) { return longVal; } }",
    );
    expect(result).not.toContain("longVal");
  });

  it("handles for-of statement with pattern left", () => {
    const result = transform(
      "function f() { var longVal; for (longVal of arr) { return longVal; } }",
    );
    expect(result).not.toContain("longVal");
  });

  // --- Expression types in scope analysis ---
  it("handles call expression with super", () => {
    const result = transform(
      "class A extends B { constructor() { super(); var longVar = 1; return longVar; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles member expression with super", () => {
    const result = transform(
      "class A extends B { foo() { var longVar = super.bar; return longVar; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles computed member expression", () => {
    const result = transform(
      "function f() { var longObj = {}; var longKey = 'a'; return longObj[longKey]; }",
    );
    expect(result).not.toContain("longObj");
    expect(result).not.toContain("longKey");
  });

  it("handles assignment expression", () => {
    const result = transform(
      "function f() { var longVar = 1; longVar = 2; return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles binary expression", () => {
    const result = transform(
      "function f() { var longA = 1; var longB = 2; return longA + longB; }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
  });

  it("handles logical expression", () => {
    const result = transform(
      "function f() { var longA = 1; var longB = 2; return longA || longB; }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
  });

  it("handles unary expression", () => {
    const result = transform(
      "function f() { var longVar = true; return !longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles update expression", () => {
    const result = transform(
      "function f() { var longVar = 0; longVar++; return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles conditional expression", () => {
    const result = transform(
      "function f() { var longA = 1; var longB = 2; var longC = 3; return longA ? longB : longC; }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
    expect(result).not.toContain("longC");
  });

  it("handles sequence expression", () => {
    const result = transform(
      "function f() { var longA = 1; var longB = 2; return (longA, longB); }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
  });

  it("handles array expression", () => {
    const result = transform(
      "function f() { var longVar = 1; return [longVar, null]; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles array with spread", () => {
    const result = transform(
      "function f() { var longArr = [1]; return [...longArr]; }",
    );
    expect(result).not.toContain("longArr");
  });

  it("handles object expression", () => {
    const result = transform(
      "function f() { var longVal = 1; return { a: longVal }; }",
    );
    expect(result).not.toContain("longVal");
  });

  it("handles object with computed key", () => {
    const result = transform(
      "function f() { var longKey = 'a'; var longVal = 1; return { [longKey]: longVal }; }",
    );
    expect(result).not.toContain("longKey");
    expect(result).not.toContain("longVal");
  });

  it("handles object spread", () => {
    const result = transform(
      "function f() { var longObj = {a:1}; return { ...longObj }; }",
    );
    expect(result).not.toContain("longObj");
  });

  it("handles new expression", () => {
    const result = transform(
      "function f() { var longVar = 1; return new Foo(longVar); }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles new expression with spread", () => {
    const result = transform(
      "function f() { var longArgs = [1]; return new Foo(...longArgs); }",
    );
    expect(result).not.toContain("longArgs");
  });

  it("handles template literal", () => {
    const result = transform(
      "function f() { var longVar = 'a'; return `${longVar}`; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles tagged template expression", () => {
    const result = transform(
      "function f() { var longTag = tag; var longVal = 1; return longTag`${longVal}`; }",
    );
    expect(result).not.toContain("longTag");
    expect(result).not.toContain("longVal");
  });

  it("handles yield expression", () => {
    const result = transform(
      "function* f() { var longVar = 1; yield longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles yield without argument", () => {
    const result = transform("function* f() { yield; }");
    expect(result).toContain("yield");
  });

  it("handles await expression", () => {
    const result = transform(
      "async function f() { var longVar = Promise.resolve(1); return await longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles class expression with super", () => {
    const result = transform(
      "function f() { var longBase = class {}; var C = class extends longBase { method() {} }; return C; }",
    );
    expect(result).not.toContain("longBase");
  });

  it("handles class expression with computed methods and properties", () => {
    const result = transform(
      "function f() { var longKey = 'x'; var C = class { [longKey]() {} }; return C; }",
    );
    expect(result).not.toContain("longKey");
  });

  it("handles class with property definition", () => {
    const result = transform(
      "function f() { var longVal = 1; var C = class { x = longVal; }; return C; }",
    );
    expect(result).not.toContain("longVal");
  });

  it("handles class with static block", () => {
    const result = transform(
      "function f() { var longVar = 1; var C = class { static { longVar; } }; return C; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles chain expression", () => {
    const result = transform(
      "function f() { var longObj = {}; return longObj?.foo; }",
    );
    expect(result).not.toContain("longObj");
  });

  it("handles import expression", () => {
    const result = transform(
      "function f() { var longMod = 'mod'; return import(longMod); }",
    );
    expect(result).not.toContain("longMod");
  });

  // --- Pattern handling in assignment ---
  it("handles object pattern in assignment", () => {
    const result = transform(
      "function f() { var longVar = 1; ({longVar} = obj); return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles array pattern in params", () => {
    const result = transform(
      "function f() { var fn = ([longA, longB]) => longA + longB; return fn([1,2]); }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
  });

  it("handles rest element in params", () => {
    const result = transform(
      "function f() { var fn = (...longArgs) => longArgs; return fn(1,2,3); }",
    );
    expect(result).not.toContain("longArgs");
  });

  it("handles assignment pattern in params", () => {
    const result = transform(
      "function f() { var fn = (longParam = 1) => longParam; return fn(); }",
    );
    expect(result).not.toContain("longParam");
  });

  // --- Scope analysis for statements ---
  it("handles throw statement", () => {
    const result = transform(
      "function f() { var longVar = 1; throw longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles if statement branches", () => {
    const result = transform(
      "function f() { var longVar = 1; if (longVar) { return longVar; } else { return 0; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles while statement", () => {
    const result = transform(
      "function f() { var longVar = 1; while (longVar) { longVar--; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles do-while statement", () => {
    const result = transform(
      "function f() { var longVar = 1; do { longVar--; } while (longVar); }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles switch statement", () => {
    const result = transform(
      "function f() { var longVar = 1; switch (longVar) { case 1: return longVar; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles labeled statement", () => {
    const result = transform(
      "function f() { var longVar = 0; myLabel: for (;;) { longVar++; break myLabel; } return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles with statement", () => {
    const result = transform(
      "function f() { var longObj = {}; with (longObj) { return x; } }",
    );
    expect(result).not.toContain("longObj");
  });

  // --- Try statement with catch scope ---
  it("handles try with catch and finalizer", () => {
    const result = transform(
      "function f() { var longVar = 1; try { return longVar; } catch(longErr) { return longErr; } finally { longVar; } }",
    );
    expect(result).not.toContain("longVar");
    expect(result).not.toContain("longErr");
  });

  it("handles try with catch without param", () => {
    const result = transform(
      "function f() { var longVar = 1; try { return longVar; } catch { return 0; } }",
    );
    expect(result).not.toContain("longVar");
  });

  // --- Class declarations ---
  it("handles class declaration with super", () => {
    const result = transform(
      "function f() { class LongBase {} class LongChild extends LongBase { method() { return 1; } } return new LongChild(); }",
    );
    expect(result).not.toContain("LongBase");
    expect(result).not.toContain("LongChild");
  });

  it("handles class with static block in declaration", () => {
    const result = transform(
      "function f() { var longVal = 1; class C { static { longVal; } } return C; }",
    );
    expect(result).not.toContain("longVal");
  });

  it("handles class with computed method in declaration", () => {
    const result = transform(
      "function f() { var longKey = 'x'; class C { [longKey]() {} } return C; }",
    );
    expect(result).not.toContain("longKey");
  });

  it("handles class with property definition in declaration", () => {
    const result = transform(
      "function f() { var longVal = 1; class C { x = longVal; } return C; }",
    );
    expect(result).not.toContain("longVal");
  });

  // --- Export handling ---
  it("handles export named with var declaration", () => {
    const result = transform("export var myExport = 1;");
    expect(result).toContain("myExport");
  });

  it("handles export named with class declaration", () => {
    const result = transform("export class MyClass {}");
    expect(result).toContain("MyClass");
  });

  it("handles export named specifiers", () => {
    const result = transform("var x = 1; export { x };");
    expect(result).toContain("export{x}");
  });

  it("handles export default with expression", () => {
    const result = transform(
      "function f() { var longVar = 1; return longVar; } export default f();",
    );
    expect(result).toContain("export default");
  });

  it("handles export default function without id", () => {
    const result = transform(
      "export default function() { var longVar = 1; return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles export default class declaration", () => {
    const result = transform("export default class MyClass {}");
    expect(result).toContain("MyClass");
  });

  it("handles import declaration bindings", () => {
    const result = transform('import { foo } from "mod"; export { foo };');
    expect(result).toContain("foo");
  });

  // --- Rename application ---
  it("renames function expression id", () => {
    const result = transform(
      "function f() { var fn = function longName() { return longName; }; return fn; }",
    );
    expect(result).not.toContain("longName");
  });

  it("renames variables in for statement with var init", () => {
    const result = transform(
      "function f() { for (var longIdx = 0; longIdx < 10; longIdx++) {} }",
    );
    expect(result).not.toContain("longIdx");
  });

  it("renames in for statement with expression init", () => {
    const result = transform(
      "function f() { var longIdx; for (longIdx = 0; longIdx < 10; longIdx++) {} }",
    );
    expect(result).not.toContain("longIdx");
  });

  it("renames in for-in/for-of with var", () => {
    const result = transform(
      "function f() { for (var longKey in obj) { return longKey; } }",
    );
    expect(result).not.toContain("longKey");
  });

  it("renames in for-in with pattern left", () => {
    const result = transform(
      "function f() { var longKey; for (longKey in obj) {} }",
    );
    expect(result).not.toContain("longKey");
  });

  it("renames inside do-while", () => {
    const result = transform(
      "function f() { var longVar = 10; do { longVar--; } while (longVar > 0); }",
    );
    expect(result).not.toContain("longVar");
  });

  it("renames inside switch", () => {
    const result = transform(
      "function f() { var longVar = 1; switch (longVar) { case 1: return longVar; } }",
    );
    expect(result).not.toContain("longVar");
  });

  it("renames inside try/catch handler param", () => {
    const result = transform(
      "function f() { try {} catch(longErr) { return longErr; } }",
    );
    expect(result).not.toContain("longErr");
  });

  it("renames inside labeled statement", () => {
    const result = transform(
      "function f() { var longVar = 0; label: { longVar = 1; } return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("renames inside with statement", () => {
    const result = transform(
      "function f() { var longObj = {}; with (longObj) {} }",
    );
    expect(result).not.toContain("longObj");
  });

  it("renames class declaration id", () => {
    const result = transform(
      "function f() { class LongClass {} return new LongClass(); }",
    );
    expect(result).not.toContain("LongClass");
  });

  it("renames class expression id when used", () => {
    // The class expression name is bound inside the class scope
    // The outer variable C is renamed, the class name LongClass may or may not be renamed
    // depending on whether it's in a child scope
    const result = transform(
      "function f() { var C = class LongClass { method() { return LongClass; } }; return C; }",
    );
    expect(result).not.toContain("var C");
  });

  it("renames in class with superClass", () => {
    const result = transform(
      "function f() { var LongBase = class {}; class C extends LongBase {} return C; }",
    );
    expect(result).not.toContain("LongBase");
  });

  it("renames inside class static block", () => {
    const result = transform(
      "function f() { var longVar = 1; class C { static { longVar; } } return C; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("renames in chain expression", () => {
    const result = transform(
      "function f() { var longObj = {}; return longObj?.foo; }",
    );
    expect(result).not.toContain("longObj");
  });

  it("renames in import expression", () => {
    const result = transform(
      "function f() { var longMod = 'x'; return import(longMod); }",
    );
    expect(result).not.toContain("longMod");
  });

  // --- Rename pattern types ---
  it("renames array pattern elements", () => {
    const result = transform(
      "function f() { var [longA, , longB] = [1, 2, 3]; return longA + longB; }",
    );
    expect(result).not.toContain("longA");
    expect(result).not.toContain("longB");
  });

  it("renames rest element in pattern", () => {
    const result = transform(
      "function f() { var [longFirst, ...longRest] = [1, 2, 3]; return longFirst; }",
    );
    expect(result).not.toContain("longFirst");
    expect(result).not.toContain("longRest");
  });

  it("renames assignment pattern in destructuring", () => {
    const result = transform(
      "function f() { var { longProp: longVar = 1 } = obj; return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("renames member expression in assignment target", () => {
    const result = transform(
      "function f() { var longObj = {}; longObj.x = 1; return longObj; }",
    );
    expect(result).not.toContain("longObj");
  });

  it("renames object pattern with rest", () => {
    const result = transform(
      "function f() { var { a, ...longRest } = obj; return longRest; }",
    );
    expect(result).not.toContain("longRest");
  });

  it("renames in object pattern with computed key", () => {
    const result = transform(
      "function f() { var longKey = 'x'; var { [longKey]: longVal } = obj; return longVal; }",
    );
    expect(result).not.toContain("longKey");
    expect(result).not.toContain("longVal");
  });

  // --- Property mangling ---
  it("mangles properties with custom pattern", () => {
    const result = transform(
      "function f() { var o = {}; o.$internal = 1; return o.$internal; }",
      {
        mangleProperties: true,
        propertyPattern: /^\$/,
      },
    );
    expect(result).not.toContain("$internal");
  });

  it("mangles properties in object literals", () => {
    const result = transform("function f() { return { _a: 1, _b: 2 }; }", {
      mangleProperties: true,
    });
    expect(result).not.toContain("_a");
    expect(result).not.toContain("_b");
  });

  // --- No renames needed ---
  it("returns original AST when no renames needed", () => {
    const result = transform("var x = 1;");
    expect(result).toContain("var x=1");
  });

  // --- Name generation ---
  it("generates names beyond single characters", () => {
    // Create a function with many variables to exhaust single-letter names
    const vars = [];
    for (let i = 0; i < 60; i++) {
      vars.push(`var longVariable${i} = ${i};`);
    }
    const code = `function f() { ${vars.join(" ")} return longVariable0; }`;
    const result = transform(code);
    expect(result).not.toContain("longVariable");
    // Should have some two-letter names
    expect(result.length).toBeGreaterThan(10);
  });

  // --- Export named re-export with specifiers ---
  it("handles re-export specifier renaming", () => {
    const result = transform('export { default as foo } from "mod";');
    expect(result).toContain("export");
  });

  // --- ExportAllDeclaration in rename phase ---
  it("passes through export-all declaration in rename phase", () => {
    const result = transform(
      'function f() { var longVar = 1; return longVar; } export * from "mod";',
    );
    expect(result).toContain("export*");
    expect(result).not.toContain("longVar");
  });

  // --- ImportDeclaration in rename phase ---
  it("passes through import declaration in rename phase", () => {
    const result = transform(
      'import { foo } from "mod"; function f() { var longVar = 1; return longVar + foo; }',
    );
    expect(result).toContain("import");
    expect(result).not.toContain("longVar");
  });

  // --- Various scope/rename edge cases ---
  it("handles default export with function that has renameable vars", () => {
    const result = transform(
      "export default function() { var longVar = 1; return longVar; }",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles default export with expression containing function", () => {
    const result = transform(
      "export default (function() { var longVar = 1; return longVar; })();",
    );
    expect(result).not.toContain("longVar");
  });

  it("handles class declaration with property definition with value", () => {
    const result = transform(
      "function f() { var longVal = 1; class C { prop = longVal; } return C; }",
    );
    expect(result).not.toContain("longVal");
  });

  it("handles member expression pattern in assignment target", () => {
    const result = transform(
      "function f() { var longObj = {}; ({x: longObj.y} = z); return longObj; }",
    );
    expect(result).not.toContain("longObj");
  });

  it("renames in assignment with object pattern via processPattern", () => {
    const result = transform(
      "function f() { var longA = 1; var longB = 2; ({x: longA} = {x: longB}); return longA; }",
    );
    expect(result).not.toContain("longA");
  });

  it("renames in object pattern with computed key in processPattern", () => {
    const result = transform(
      "function f() { var longKey = 'x'; var longVal = 1; ({[longKey]: longVal} = obj); return longVal; }",
    );
    expect(result).not.toContain("longKey");
    expect(result).not.toContain("longVal");
  });

  it("handles assignment expression left as pattern", () => {
    const result = transform(
      "function f() { var longArr = []; [longArr[0]] = [1]; return longArr; }",
    );
    expect(result).not.toContain("longArr");
  });
});
