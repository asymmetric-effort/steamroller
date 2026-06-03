/**
 * @module minify/constant-fold
 * @description Constant Folding pass.
 *
 * Evaluates constant BinaryExpressions, UnaryExpressions,
 * LogicalExpressions, and ConditionalExpressions at compile time.
 */

import type {
  Program,
  Expression,
  Statement,
  Literal,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  ConditionalExpression,
  ModuleDeclaration,
  Declaration,
  BlockStatement,
} from "../ast/types.js";

/** Helper to create a Literal AST node from a primitive value. */
const makeLiteral = (value: string | number | boolean | null): Literal => ({
  type: "Literal",
  value,
  raw: typeof value === "string" ? JSON.stringify(value) : String(value),
  start: 0,
  end: 0,
});

/** Try to extract a constant JS value from a Literal node. */
const getConstantValue = (
  expr: Expression,
): { value: string | number | boolean | null } | undefined => {
  if (expr.type === "Literal" && typeof expr.value !== "object") {
    return { value: expr.value as string | number | boolean | null };
  }
  if (expr.type === "Identifier" && expr.name === "undefined") {
    return { value: undefined as unknown as null };
  }
  return undefined;
};

/**
 * Try to constant-fold a binary expression.
 */
const foldBinary = (node: BinaryExpression): Expression => {
  const left = foldExpression(node.left);
  const right = foldExpression(node.right);

  const lv = getConstantValue(left);
  const rv = getConstantValue(right);

  if (lv !== undefined && rv !== undefined) {
    const l = lv.value;
    const r = rv.value;
    let result: string | number | boolean | null | undefined;

    switch (node.operator) {
      case "+":
        result = (l as number) + (r as number);
        break;
      case "-":
        result = (l as number) - (r as number);
        break;
      case "*":
        result = (l as number) * (r as number);
        break;
      case "/":
        if (r !== 0) result = (l as number) / (r as number);
        break;
      case "%":
        if (r !== 0) result = (l as number) % (r as number);
        break;
      case "**":
        result = (l as number) ** (r as number);
        break;
      case "|":
        result = (l as number) | (r as number);
        break;
      case "&":
        result = (l as number) & (r as number);
        break;
      case "^":
        result = (l as number) ^ (r as number);
        break;
      case "<<":
        result = (l as number) << (r as number);
        break;
      case ">>":
        result = (l as number) >> (r as number);
        break;
      case ">>>":
        result = (l as number) >>> (r as number);
        break;
      case "==":
        result = l == r;
        break;
      case "!=":
        result = l != r;
        break;
      case "===":
        result = l === r;
        break;
      case "!==":
        result = l !== r;
        break;
      case "<":
        result = (l as number) < (r as number);
        break;
      case "<=":
        result = (l as number) <= (r as number);
        break;
      case ">":
        result = (l as number) > (r as number);
        break;
      case ">=":
        result = (l as number) >= (r as number);
        break;
      default:
        break;
    }

    if (result !== undefined && isFinite(result as number)) {
      return makeLiteral(result as string | number | boolean | null);
    }
    // For string concatenation, the result is always valid
    if (
      node.operator === "+" &&
      typeof l === "string" &&
      typeof r === "string"
    ) {
      return makeLiteral(l + r);
    }
    // Boolean results
    if (typeof result === "boolean") {
      return makeLiteral(result);
    }
  }

  if (left !== node.left || right !== node.right) {
    return { ...node, left, right };
  }
  return node;
};

/**
 * Try to constant-fold a unary expression.
 */
const foldUnary = (node: UnaryExpression): Expression => {
  const argument = foldExpression(node.argument);

  if (node.operator === "typeof" && argument.type === "Literal") {
    const val = argument.value;
    const result = typeof val;
    return makeLiteral(result);
  }

  if (node.operator === "typeof" && argument.type === "Identifier") {
    if (argument.name === "undefined") return makeLiteral("undefined");
  }

  const cv = getConstantValue(argument);
  if (cv !== undefined) {
    const v = cv.value;
    switch (node.operator) {
      case "!":
        return makeLiteral(!v);
      case "-":
        if (typeof v === "number") return makeLiteral(-v);
        break;
      case "+":
        if (typeof v === "number") return makeLiteral(+v);
        break;
      case "~":
        if (typeof v === "number") return makeLiteral(~v);
        break;
      case "void":
        return {
          type: "UnaryExpression",
          operator: "void",
          prefix: true,
          argument: makeLiteral(0),
          start: 0,
          end: 0,
        };
      default:
        break;
    }
  }

  if (argument !== node.argument) {
    return { ...node, argument };
  }
  return node;
};

/**
 * Try to constant-fold a logical expression.
 */
const foldLogical = (node: LogicalExpression): Expression => {
  const left = foldExpression(node.left);
  const right = foldExpression(node.right);

  const lv = getConstantValue(left);

  if (lv !== undefined) {
    if (node.operator === "&&") {
      return lv.value ? right : left;
    }
    if (node.operator === "||") {
      return lv.value ? left : right;
    }
    if (node.operator === "??") {
      return lv.value !== null && lv.value !== undefined ? left : right;
    }
  }

  if (left !== node.left || right !== node.right) {
    return { ...node, left, right };
  }
  return node;
};

/**
 * Try to constant-fold a conditional expression.
 */
const foldConditional = (node: ConditionalExpression): Expression => {
  const test = foldExpression(node.test);
  const consequent = foldExpression(node.consequent);
  const alternate = foldExpression(node.alternate);

  const tv = getConstantValue(test);
  if (tv !== undefined) {
    return tv.value ? consequent : alternate;
  }

  if (
    test !== node.test ||
    consequent !== node.consequent ||
    alternate !== node.alternate
  ) {
    return { ...node, test, consequent, alternate };
  }
  return node;
};

/**
 * Recursively fold constant expressions.
 */
const foldExpression = (expr: Expression): Expression => {
  switch (expr.type) {
    case "BinaryExpression":
      return foldBinary(expr);
    case "UnaryExpression":
      return foldUnary(expr);
    case "LogicalExpression":
      return foldLogical(expr);
    case "ConditionalExpression":
      return foldConditional(expr);
    case "CallExpression": {
      const args = expr.arguments.map((a) =>
        a.type === "SpreadElement"
          ? { ...a, argument: foldExpression(a.argument) }
          : foldExpression(a),
      );
      const callee =
        expr.callee.type === "Super"
          ? expr.callee
          : foldExpression(expr.callee);
      return { ...expr, callee, arguments: args };
    }
    case "ArrayExpression": {
      const elements = expr.elements.map((e) => {
        if (e === null) return null;
        if (e.type === "SpreadElement")
          return { ...e, argument: foldExpression(e.argument) };
        return foldExpression(e);
      });
      return { ...expr, elements };
    }
    case "ObjectExpression": {
      const properties = expr.properties.map((p) => {
        if (p.type === "SpreadElement")
          return { ...p, argument: foldExpression(p.argument) };
        return {
          ...p,
          value: foldExpression(p.value as Expression),
          key: foldExpression(p.key),
        };
      });
      return { ...expr, properties };
    }
    case "AssignmentExpression": {
      return { ...expr, right: foldExpression(expr.right) };
    }
    case "SequenceExpression": {
      const expressions = expr.expressions.map(foldExpression);
      return { ...expr, expressions };
    }
    case "MemberExpression": {
      const object =
        expr.object.type === "Super"
          ? expr.object
          : foldExpression(expr.object);
      const property = expr.computed
        ? foldExpression(expr.property)
        : expr.property;
      return { ...expr, object, property };
    }
    case "ArrowFunctionExpression": {
      if (expr.expression && expr.body.type !== "BlockStatement") {
        const body = foldExpression(expr.body as Expression);
        return { ...expr, body };
      }
      if (expr.body.type === "BlockStatement") {
        const body = foldBlock(expr.body);
        return { ...expr, body };
      }
      return expr;
    }
    case "FunctionExpression": {
      const body = foldBlock(expr.body);
      return { ...expr, body };
    }
    default:
      return expr;
  }
};

/**
 * Fold constants inside a block statement.
 */
const foldBlock = (block: BlockStatement): BlockStatement => {
  const body = block.body.map(foldStatement);
  return { ...block, body };
};

/**
 * Fold constants inside a statement.
 */
const foldStatement = (stmt: Statement): Statement => {
  switch (stmt.type) {
    case "ExpressionStatement":
      return { ...stmt, expression: foldExpression(stmt.expression) };
    case "ReturnStatement":
      return {
        ...stmt,
        argument: stmt.argument ? foldExpression(stmt.argument) : null,
      };
    case "ThrowStatement":
      return { ...stmt, argument: foldExpression(stmt.argument) };
    case "VariableDeclaration": {
      const declarations = stmt.declarations.map((d) => ({
        ...d,
        init: d.init ? foldExpression(d.init) : null,
      }));
      return { ...stmt, declarations };
    }
    case "IfStatement": {
      const test = foldExpression(stmt.test);
      const consequent = foldStatement(stmt.consequent);
      const alternate = stmt.alternate ? foldStatement(stmt.alternate) : null;
      return { ...stmt, test, consequent, alternate };
    }
    case "WhileStatement": {
      const test = foldExpression(stmt.test);
      const body = foldStatement(stmt.body);
      return { ...stmt, test, body };
    }
    case "ForStatement": {
      const test = stmt.test ? foldExpression(stmt.test) : null;
      const update = stmt.update ? foldExpression(stmt.update) : null;
      const body = foldStatement(stmt.body);
      return { ...stmt, test, update, body };
    }
    case "BlockStatement": {
      const body = stmt.body.map(foldStatement);
      return { ...stmt, body };
    }
    case "FunctionDeclaration": {
      const body = foldBlock(stmt.body);
      return { ...stmt, body };
    }
    case "SwitchStatement": {
      const discriminant = foldExpression(stmt.discriminant);
      const cases = stmt.cases.map((c) => ({
        ...c,
        test: c.test ? foldExpression(c.test) : null,
        consequent: c.consequent.map(foldStatement),
      }));
      return { ...stmt, discriminant, cases };
    }
    case "TryStatement": {
      const block = foldBlock(stmt.block);
      const handler = stmt.handler
        ? { ...stmt.handler, body: foldBlock(stmt.handler.body) }
        : null;
      const finalizer = stmt.finalizer ? foldBlock(stmt.finalizer) : null;
      return { ...stmt, block, handler, finalizer };
    }
    default:
      return stmt;
  }
};

/**
 * Fold constants throughout an AST.
 *
 * @param ast - The parsed Program AST
 * @returns A new Program with constants folded
 */
export const foldConstants = (ast: Program): Program => {
  const body = ast.body.map((stmt) => {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const decl = foldStatement(
          stmt.declaration as Statement,
        ) as Declaration;
        return { ...stmt, declaration: decl };
      }
      return stmt;
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      if (
        stmt.declaration.type === "FunctionDeclaration" ||
        stmt.declaration.type === "ClassDeclaration"
      ) {
        const decl = foldStatement(
          stmt.declaration as Statement,
        ) as Declaration;
        return { ...stmt, declaration: decl };
      }
      const decl = foldExpression(stmt.declaration as Expression);
      return { ...stmt, declaration: decl };
    }
    if (
      stmt.type === "ImportDeclaration" ||
      stmt.type === "ExportAllDeclaration"
    ) {
      return stmt;
    }
    return foldStatement(stmt as Statement);
  });
  return { ...ast, body };
};
