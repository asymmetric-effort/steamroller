/**
 * Tests for async/await and generator (yield) expression parsing.
 *
 * Covers AwaitExpression and YieldExpression nodes with context tracking,
 * precedence behavior, and error cases when used outside valid contexts.
 *
 * @module tests/unit/parser/async-generators
 */

import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper to extract the first expression from a parsed program.
 */
const parseExpr = (source: string): AST.Expression => {
  const program = parse(source, { sourceType: "module" });
  const stmt = program.body[0] as AST.ExpressionStatement;
  return stmt.expression;
};

/**
 * Helper to extract the body statements from a function expression.
 */
const parseFnBody = (source: string): ReadonlyArray<AST.Statement> => {
  const program = parse(source, { sourceType: "module" });
  const stmt = program.body[0] as AST.ExpressionStatement;
  const fn = stmt.expression as AST.FunctionExpression;
  return fn.body.body;
};

/**
 * Helper to extract the first expression from inside a function body.
 */
const parseFnExpr = (source: string): AST.Expression => {
  const stmts = parseFnBody(source);
  const exprStmt = stmts[0] as AST.ExpressionStatement;
  return exprStmt.expression;
};

describe("AwaitExpression", () => {
  it("parses await in async function body", () => {
    const expr = parseFnExpr("(async function() { await fetch() })");
    expect(expr.type).toBe("AwaitExpression");
    const awaitExpr = expr as AST.AwaitExpression;
    expect(awaitExpr.argument.type).toBe("CallExpression");
    const call = awaitExpr.argument as AST.CallExpression;
    expect((call.callee as AST.Identifier).name).toBe("fetch");
  });

  it("parses await in async arrow function with block body", () => {
    const program = parse("const f = async () => { await x; }", {
      sourceType: "module",
    });
    const decl = program.body[0] as AST.VariableDeclaration;
    const arrow = decl.declarations[0].init as AST.ArrowFunctionExpression;
    const bodyStmt = (arrow.body as AST.BlockStatement)
      .body[0] as AST.ExpressionStatement;
    expect(bodyStmt.expression.type).toBe("AwaitExpression");
  });

  it("parses await in async arrow function with concise body", () => {
    const program = parse("const f = async () => await x", {
      sourceType: "module",
    });
    const decl = program.body[0] as AST.VariableDeclaration;
    const arrow = decl.declarations[0].init as AST.ArrowFunctionExpression;
    expect(arrow.expression).toBe(true);
    expect((arrow.body as AST.AwaitExpression).type).toBe("AwaitExpression");
  });

  it("parses await with member expression argument", () => {
    const expr = parseFnExpr("(async function() { await obj.method() })");
    expect(expr.type).toBe("AwaitExpression");
    const awaitExpr = expr as AST.AwaitExpression;
    expect(awaitExpr.argument.type).toBe("CallExpression");
  });

  it("parses await with correct precedence (unary level)", () => {
    // await a + b should parse as (await a) + b since await has unary precedence
    const stmts = parseFnBody("(async function() { await a + b })");
    const exprStmt = stmts[0] as AST.ExpressionStatement;
    // The top-level should be a BinaryExpression with left = AwaitExpression
    expect(exprStmt.expression.type).toBe("BinaryExpression");
    const binary = exprStmt.expression as AST.BinaryExpression;
    expect(binary.operator).toBe("+");
    expect(binary.left.type).toBe("AwaitExpression");
    expect(binary.right.type).toBe("Identifier");
    expect((binary.right as AST.Identifier).name).toBe("b");
  });

  it("parses nested await expressions", () => {
    const expr = parseFnExpr("(async function() { await (await inner()) })");
    expect(expr.type).toBe("AwaitExpression");
    const outer = expr as AST.AwaitExpression;
    expect(outer.argument.type).toBe("AwaitExpression");
    const inner = outer.argument as AST.AwaitExpression;
    expect(inner.argument.type).toBe("CallExpression");
  });

  it("parses await as identifier outside async context", () => {
    const expr = parseExpr("await");
    expect(expr.type).toBe("Identifier");
    expect((expr as AST.Identifier).name).toBe("await");
  });

  it("parses await as identifier in non-async function", () => {
    const expr = parseFnExpr("(function() { await })");
    expect(expr.type).toBe("Identifier");
    expect((expr as AST.Identifier).name).toBe("await");
  });

  it("preserves correct start and end positions", () => {
    const expr = parseFnExpr("(async function() { await x })");
    expect(expr.type).toBe("AwaitExpression");
    const awaitExpr = expr as AST.AwaitExpression;
    expect(awaitExpr.start).toBe(20);
    expect(awaitExpr.end).toBeGreaterThan(awaitExpr.start);
  });

  it("parses await in async function declaration", () => {
    const program = parse("async function foo() { await bar(); }", {
      sourceType: "module",
    });
    const fnDecl = program.body[0] as AST.FunctionDeclaration;
    const exprStmt = fnDecl.body.body[0] as AST.ExpressionStatement;
    expect(exprStmt.expression.type).toBe("AwaitExpression");
  });
});

describe("YieldExpression", () => {
  it("parses yield with argument in generator", () => {
    const expr = parseFnExpr("(function*() { yield 1 })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.delegate).toBe(false);
    expect(yieldExpr.argument).not.toBeNull();
    expect(yieldExpr.argument!.type).toBe("Literal");
    expect((yieldExpr.argument as AST.Literal).value).toBe(1);
  });

  it("parses yield without argument", () => {
    const expr = parseFnExpr("(function*() { yield; })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.delegate).toBe(false);
    expect(yieldExpr.argument).toBeNull();
  });

  it("parses yield* delegation", () => {
    const expr = parseFnExpr("(function*() { yield* iter })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.delegate).toBe(true);
    expect(yieldExpr.argument).not.toBeNull();
    expect(yieldExpr.argument!.type).toBe("Identifier");
    expect((yieldExpr.argument as AST.Identifier).name).toBe("iter");
  });

  it("parses yield* with call expression", () => {
    const expr = parseFnExpr("(function*() { yield* getIter() })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.delegate).toBe(true);
    expect(yieldExpr.argument!.type).toBe("CallExpression");
  });

  it("parses yield in generator function declaration", () => {
    const program = parse("function* gen() { yield 42; }", {
      sourceType: "module",
    });
    const fnDecl = program.body[0] as AST.FunctionDeclaration;
    const exprStmt = fnDecl.body.body[0] as AST.ExpressionStatement;
    expect(exprStmt.expression.type).toBe("YieldExpression");
    const yieldExpr = exprStmt.expression as AST.YieldExpression;
    expect((yieldExpr.argument as AST.Literal).value).toBe(42);
  });

  it("parses yield as identifier outside generator context", () => {
    const expr = parseExpr("yield");
    expect(expr.type).toBe("Identifier");
    expect((expr as AST.Identifier).name).toBe("yield");
  });

  it("parses yield as identifier in non-generator function", () => {
    const expr = parseFnExpr("(function() { yield })");
    expect(expr.type).toBe("Identifier");
    expect((expr as AST.Identifier).name).toBe("yield");
  });

  it("parses yield with low precedence (lower than assignment)", () => {
    // yield a = b should parse as yield (a = b)
    const expr = parseFnExpr("(function*() { yield a = b })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.argument!.type).toBe("AssignmentExpression");
  });

  it("parses yield followed by comma as yield without arg in sequence", () => {
    // Inside a function: yield, 2 should be (yield), 2 as a sequence
    const stmts = parseFnBody("(function*() { yield, 2 })");
    const exprStmt = stmts[0] as AST.ExpressionStatement;
    // The comma makes it a sequence expression
    expect(exprStmt.expression.type).toBe("SequenceExpression");
    const seq = exprStmt.expression as AST.SequenceExpression;
    expect(seq.expressions[0].type).toBe("YieldExpression");
    const yieldExpr = seq.expressions[0] as AST.YieldExpression;
    expect(yieldExpr.argument).toBeNull();
    expect(seq.expressions[1].type).toBe("Literal");
  });

  it("preserves correct start and end positions for yield with arg", () => {
    const expr = parseFnExpr("(function*() { yield 1 })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.start).toBe(15);
    expect(yieldExpr.end).toBeGreaterThan(yieldExpr.start);
  });
});

describe("Async Generator (combined)", () => {
  it("parses await inside async generator", () => {
    const expr = parseFnExpr("(async function*() { await fetch() })");
    expect(expr.type).toBe("AwaitExpression");
    const awaitExpr = expr as AST.AwaitExpression;
    expect(awaitExpr.argument.type).toBe("CallExpression");
  });

  it("parses yield inside async generator", () => {
    const stmts = parseFnBody("(async function*() { yield 1 })");
    const exprStmt = stmts[0] as AST.ExpressionStatement;
    expect(exprStmt.expression.type).toBe("YieldExpression");
  });

  it("parses nested await yield in async generator", () => {
    // await (yield 1) should parse await wrapping a yield
    const expr = parseFnExpr("(async function*() { await (yield 1) })");
    expect(expr.type).toBe("AwaitExpression");
    const awaitExpr = expr as AST.AwaitExpression;
    expect(awaitExpr.argument.type).toBe("YieldExpression");
    const yieldExpr = awaitExpr.argument as AST.YieldExpression;
    expect((yieldExpr.argument as AST.Literal).value).toBe(1);
  });

  it("parses yield* inside async generator", () => {
    const expr = parseFnExpr("(async function*() { yield* asyncIter })");
    expect(expr.type).toBe("YieldExpression");
    const yieldExpr = expr as AST.YieldExpression;
    expect(yieldExpr.delegate).toBe(true);
    expect((yieldExpr.argument as AST.Identifier).name).toBe("asyncIter");
  });

  it("context resets after exiting function body", () => {
    // After an async function, await should be an identifier at top level
    const program = parse("async function f() { await x; } await", {
      sourceType: "module",
    });
    const fnDecl = program.body[0] as AST.FunctionDeclaration;
    const bodyExpr = (fnDecl.body.body[0] as AST.ExpressionStatement)
      .expression;
    expect(bodyExpr.type).toBe("AwaitExpression");

    const topExpr = (program.body[1] as AST.ExpressionStatement).expression;
    expect(topExpr.type).toBe("Identifier");
    expect((topExpr as AST.Identifier).name).toBe("await");
  });

  it("context resets after exiting generator body", () => {
    // After a generator function, yield should be an identifier at top level
    const program = parse("function* g() { yield 1; } yield", {
      sourceType: "module",
    });
    const fnDecl = program.body[0] as AST.FunctionDeclaration;
    const bodyExpr = (fnDecl.body.body[0] as AST.ExpressionStatement)
      .expression;
    expect(bodyExpr.type).toBe("YieldExpression");

    const topExpr = (program.body[1] as AST.ExpressionStatement).expression;
    expect(topExpr.type).toBe("Identifier");
    expect((topExpr as AST.Identifier).name).toBe("yield");
  });

  it("nested functions do not inherit async context", () => {
    const program = parse(
      "async function outer() { function inner() { await } }",
      { sourceType: "module" },
    );
    const outerFn = program.body[0] as AST.FunctionDeclaration;
    // inner is a function declaration inside outer
    const innerFn = outerFn.body.body[0] as AST.FunctionDeclaration;
    const innerExpr = (innerFn.body.body[0] as AST.ExpressionStatement)
      .expression;
    // await inside non-async inner should be identifier
    expect(innerExpr.type).toBe("Identifier");
    expect((innerExpr as AST.Identifier).name).toBe("await");
  });

  it("nested functions do not inherit generator context", () => {
    const program = parse("function* outer() { function inner() { yield } }", {
      sourceType: "module",
    });
    const outerFn = program.body[0] as AST.FunctionDeclaration;
    const innerFn = outerFn.body.body[0] as AST.FunctionDeclaration;
    const innerExpr = (innerFn.body.body[0] as AST.ExpressionStatement)
      .expression;
    // yield inside non-generator inner should be identifier
    expect(innerExpr.type).toBe("Identifier");
    expect((innerExpr as AST.Identifier).name).toBe("yield");
  });
});
