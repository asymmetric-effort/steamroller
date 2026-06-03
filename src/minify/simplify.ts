/**
 * @module minify/simplify
 * @description Expression Simplification pass.
 *
 * - `!!x` in boolean context -> `x`
 * - `x === true` -> `x`, `x === false` -> `!x`
 * - `undefined` -> `void 0`
 * - `true` -> `!0`, `false` -> `!1`
 * - Merge consecutive var declarations of the same kind
 */

import type {
  Program,
  Expression,
  Statement,
  Declaration,
  Literal,
  UnaryExpression,
  BinaryExpression,
  Identifier,
  VariableDeclaration,
  ModuleDeclaration,
  BlockStatement,
} from "../ast/types.js";

/** Create a `!0` expression (shorter `true`). */
const makeNotZero = (): UnaryExpression => ({
  type: "UnaryExpression",
  operator: "!",
  prefix: true,
  argument: { type: "Literal", value: 0, raw: "0", start: 0, end: 0 },
  start: 0,
  end: 0,
});

/** Create a `!1` expression (shorter `false`). */
const makeNotOne = (): UnaryExpression => ({
  type: "UnaryExpression",
  operator: "!",
  prefix: true,
  argument: { type: "Literal", value: 1, raw: "1", start: 0, end: 0 },
  start: 0,
  end: 0,
});

/** Create a `void 0` expression (shorter `undefined`). */
const makeVoid0 = (): UnaryExpression => ({
  type: "UnaryExpression",
  operator: "void",
  prefix: true,
  argument: { type: "Literal", value: 0, raw: "0", start: 0, end: 0 },
  start: 0,
  end: 0,
});

/** Check if an expression is `!!x` (double negation). */
const isDoubleNegation = (
  expr: Expression,
): expr is UnaryExpression & { argument: UnaryExpression } =>
  expr.type === "UnaryExpression" &&
  expr.operator === "!" &&
  expr.prefix &&
  expr.argument.type === "UnaryExpression" &&
  expr.argument.operator === "!" &&
  expr.argument.prefix;

/**
 * Simplify an expression, with optional `inBooleanContext` flag
 * for double-negation elimination.
 */
const simplifyExpr = (
  expr: Expression,
  inBooleanContext = false,
): Expression => {
  switch (expr.type) {
    case "Literal": {
      // true -> !0, false -> !1
      if (expr.value === true) return makeNotZero();
      if (expr.value === false) return makeNotOne();
      return expr;
    }

    case "Identifier": {
      // undefined -> void 0
      if (expr.name === "undefined") return makeVoid0();
      return expr;
    }

    case "UnaryExpression": {
      const arg = simplifyExpr(
        expr.argument,
        expr.operator === "!" ? true : false,
      );

      // !!x in boolean context -> x
      if (inBooleanContext && isDoubleNegation(expr)) {
        return simplifyExpr((expr.argument as UnaryExpression).argument, true);
      }

      if (arg !== expr.argument) {
        return { ...expr, argument: arg };
      }
      return expr;
    }

    case "BinaryExpression": {
      const left = simplifyExpr(expr.left);
      const right = simplifyExpr(expr.right);

      // x === true -> x, x === false -> !x
      if (expr.operator === "===" || expr.operator === "==") {
        if (
          right.type === "UnaryExpression" &&
          right.operator === "!" &&
          right.argument.type === "Literal"
        ) {
          if (right.argument.value === 0) {
            // x === !0 (i.e. x === true) -> x
            return left;
          }
          if (right.argument.value === 1) {
            // x === !1 (i.e. x === false) -> !x
            return {
              type: "UnaryExpression",
              operator: "!",
              prefix: true,
              argument: left,
              start: 0,
              end: 0,
            };
          }
        }
        if (
          left.type === "UnaryExpression" &&
          left.operator === "!" &&
          left.argument.type === "Literal"
        ) {
          if (left.argument.value === 0) {
            // !0 === x (i.e. true === x) -> x
            return right;
          }
          if (left.argument.value === 1) {
            // !1 === x (i.e. false === x) -> !x
            return {
              type: "UnaryExpression",
              operator: "!",
              prefix: true,
              argument: right,
              start: 0,
              end: 0,
            };
          }
        }
      }

      if (left !== expr.left || right !== expr.right) {
        return { ...expr, left, right };
      }
      return expr;
    }

    case "LogicalExpression": {
      const left = simplifyExpr(expr.left, true);
      const right = simplifyExpr(expr.right, true);
      if (left !== expr.left || right !== expr.right) {
        return { ...expr, left, right };
      }
      return expr;
    }

    case "ConditionalExpression": {
      const test = simplifyExpr(expr.test, true);
      const consequent = simplifyExpr(expr.consequent);
      const alternate = simplifyExpr(expr.alternate);
      if (
        test !== expr.test ||
        consequent !== expr.consequent ||
        alternate !== expr.alternate
      ) {
        return { ...expr, test, consequent, alternate };
      }
      return expr;
    }

    case "CallExpression": {
      const callee =
        expr.callee.type === "Super" ? expr.callee : simplifyExpr(expr.callee);
      const args = expr.arguments.map((a) =>
        a.type === "SpreadElement"
          ? { ...a, argument: simplifyExpr(a.argument) }
          : simplifyExpr(a),
      );
      return { ...expr, callee, arguments: args };
    }

    case "AssignmentExpression": {
      const right = simplifyExpr(expr.right);
      if (right !== expr.right) return { ...expr, right };
      return expr;
    }

    case "ArrayExpression": {
      const elements = expr.elements.map((e) => {
        if (e === null) return null;
        if (e.type === "SpreadElement")
          return { ...e, argument: simplifyExpr(e.argument) };
        return simplifyExpr(e);
      });
      return { ...expr, elements };
    }

    case "ObjectExpression": {
      const properties = expr.properties.map((p) => {
        if (p.type === "SpreadElement")
          return { ...p, argument: simplifyExpr(p.argument) };
        return {
          ...p,
          value: simplifyExpr(p.value as Expression),
        };
      });
      return { ...expr, properties };
    }

    case "SequenceExpression": {
      const expressions = expr.expressions.map((e) => simplifyExpr(e));
      return { ...expr, expressions };
    }

    case "ArrowFunctionExpression": {
      if (expr.expression && expr.body.type !== "BlockStatement") {
        const body = simplifyExpr(expr.body as Expression);
        return { ...expr, body };
      }
      if (expr.body.type === "BlockStatement") {
        const body = simplifyBlock(expr.body);
        return { ...expr, body };
      }
      return expr;
    }

    case "FunctionExpression": {
      const body = simplifyBlock(expr.body);
      return { ...expr, body };
    }

    case "MemberExpression": {
      const object =
        expr.object.type === "Super" ? expr.object : simplifyExpr(expr.object);
      const property = expr.computed
        ? simplifyExpr(expr.property)
        : expr.property;
      return { ...expr, object, property };
    }

    case "NewExpression": {
      const callee = simplifyExpr(expr.callee);
      const args = expr.arguments.map((a) =>
        a.type === "SpreadElement"
          ? { ...a, argument: simplifyExpr(a.argument) }
          : simplifyExpr(a),
      );
      return { ...expr, callee, arguments: args };
    }

    default:
      return expr;
  }
};

/**
 * Simplify a single statement.
 */
const simplifyStmt = (stmt: Statement): Statement => {
  switch (stmt.type) {
    case "ExpressionStatement":
      return { ...stmt, expression: simplifyExpr(stmt.expression) };
    case "ReturnStatement":
      return {
        ...stmt,
        argument: stmt.argument ? simplifyExpr(stmt.argument) : null,
      };
    case "ThrowStatement":
      return { ...stmt, argument: simplifyExpr(stmt.argument) };
    case "VariableDeclaration": {
      const declarations = stmt.declarations.map((d) => ({
        ...d,
        init: d.init ? simplifyExpr(d.init) : null,
      }));
      return { ...stmt, declarations };
    }
    case "IfStatement": {
      const test = simplifyExpr(stmt.test, true);
      const consequent = simplifyStmt(stmt.consequent);
      const alternate = stmt.alternate ? simplifyStmt(stmt.alternate) : null;
      return { ...stmt, test, consequent, alternate };
    }
    case "WhileStatement": {
      const test = simplifyExpr(stmt.test, true);
      const body = simplifyStmt(stmt.body);
      return { ...stmt, test, body };
    }
    case "ForStatement": {
      const test = stmt.test ? simplifyExpr(stmt.test) : null;
      const update = stmt.update ? simplifyExpr(stmt.update) : null;
      const body = simplifyStmt(stmt.body);
      return { ...stmt, test, update, body };
    }
    case "BlockStatement":
      return simplifyBlock(stmt);
    case "FunctionDeclaration": {
      const body = simplifyBlock(stmt.body);
      return { ...stmt, body };
    }
    case "SwitchStatement": {
      const discriminant = simplifyExpr(stmt.discriminant);
      const cases = stmt.cases.map((c) => ({
        ...c,
        test: c.test ? simplifyExpr(c.test) : null,
        consequent: c.consequent.map(simplifyStmt),
      }));
      return { ...stmt, discriminant, cases };
    }
    case "TryStatement": {
      const block = simplifyBlock(stmt.block);
      const handler = stmt.handler
        ? { ...stmt.handler, body: simplifyBlock(stmt.handler.body) }
        : null;
      const finalizer = stmt.finalizer ? simplifyBlock(stmt.finalizer) : null;
      return { ...stmt, block, handler, finalizer };
    }
    default:
      return stmt;
  }
};

/**
 * Simplify a block statement body, also merging consecutive
 * var declarations of the same kind.
 */
const simplifyBlock = (block: BlockStatement): BlockStatement => {
  const simplified = block.body.map(simplifyStmt);
  const merged = mergeVarDeclarations(simplified);
  return { ...block, body: merged };
};

/**
 * Merge consecutive VariableDeclarations of the same kind.
 * `var a=1; var b=2;` -> `var a=1,b=2;`
 */
const mergeVarDeclarations = (stmts: Statement[]): Statement[] => {
  const result: Statement[] = [];

  for (const stmt of stmts) {
    if (stmt.type === "VariableDeclaration" && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.type === "VariableDeclaration" && prev.kind === stmt.kind) {
        // Merge declarations
        result[result.length - 1] = {
          ...prev,
          declarations: [...prev.declarations, ...stmt.declarations],
        };
        continue;
      }
    }
    result.push(stmt);
  }

  return result;
};

/**
 * Simplify expressions throughout an AST.
 *
 * @param ast - The parsed Program AST
 * @returns A new Program with simplified expressions
 */
export const simplifyExpressions = (ast: Program): Program => {
  const body = ast.body.map((stmt): Statement | ModuleDeclaration => {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const decl = simplifyStmt(stmt.declaration as Statement) as Declaration;
        return { ...stmt, declaration: decl };
      }
      return stmt;
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      if (
        stmt.declaration.type === "FunctionDeclaration" ||
        stmt.declaration.type === "ClassDeclaration"
      ) {
        const decl = simplifyStmt(stmt.declaration as Statement) as Declaration;
        return { ...stmt, declaration: decl };
      }
      const decl = simplifyExpr(stmt.declaration as Expression);
      return { ...stmt, declaration: decl };
    }
    if (
      stmt.type === "ImportDeclaration" ||
      stmt.type === "ExportAllDeclaration"
    ) {
      return stmt;
    }
    return simplifyStmt(stmt as Statement);
  });

  // Merge consecutive var declarations at top level
  const merged = mergeVarDeclarations(body as Statement[]);

  return { ...ast, body: merged };
};
