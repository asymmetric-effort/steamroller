/**
 * @module minify/compress
 * @description Code Compression pass.
 *
 * - Arrow body compression: `()=>{return x}` -> `()=>x`
 * - Object shorthand: `{x:x}` -> `{x}`
 * - Computed to literal: `obj["prop"]` -> `obj.prop` (when valid identifier)
 * - Sequence compression: consecutive expression statements and return
 */

import type {
  Program,
  Expression,
  Statement,
  Declaration,
  BlockStatement,
  ArrowFunctionExpression,
  Property,
  MemberExpression,
  ObjectExpression,
  ReturnStatement,
  ExpressionStatement,
  ModuleDeclaration,
  Identifier,
} from "../ast/types.js";

/** Check if a string is a valid JavaScript identifier. */
const isValidIdentifier = (name: string): boolean =>
  /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);

/** JavaScript reserved words that cannot be used as unquoted property names. */
const RESERVED_PROP = new Set([
  "break",
  "case",
  "catch",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "class",
  "const",
  "export",
  "extends",
  "import",
  "super",
  "yield",
  "let",
  "static",
  "enum",
]);

/**
 * Compress an expression.
 */
const compressExpr = (expr: Expression): Expression => {
  switch (expr.type) {
    case "ArrowFunctionExpression":
      return compressArrow(expr);

    case "ObjectExpression":
      return compressObject(expr);

    case "MemberExpression":
      return compressMember(expr);

    case "CallExpression": {
      const callee =
        expr.callee.type === "Super" ? expr.callee : compressExpr(expr.callee);
      const args = expr.arguments.map((a) =>
        a.type === "SpreadElement"
          ? { ...a, argument: compressExpr(a.argument) }
          : compressExpr(a),
      );
      return { ...expr, callee, arguments: args };
    }

    case "AssignmentExpression": {
      const right = compressExpr(expr.right);
      return { ...expr, right };
    }

    case "BinaryExpression":
    case "LogicalExpression": {
      const left = compressExpr(expr.left);
      const right = compressExpr(expr.right);
      return { ...expr, left, right };
    }

    case "UnaryExpression": {
      const argument = compressExpr(expr.argument);
      return { ...expr, argument };
    }

    case "ConditionalExpression": {
      const test = compressExpr(expr.test);
      const consequent = compressExpr(expr.consequent);
      const alternate = compressExpr(expr.alternate);
      return { ...expr, test, consequent, alternate };
    }

    case "SequenceExpression": {
      const expressions = expr.expressions.map(compressExpr);
      return { ...expr, expressions };
    }

    case "ArrayExpression": {
      const elements = expr.elements.map((e) => {
        if (e === null) return null;
        if (e.type === "SpreadElement")
          return { ...e, argument: compressExpr(e.argument) };
        return compressExpr(e);
      });
      return { ...expr, elements };
    }

    case "FunctionExpression": {
      const body = compressBlock(expr.body);
      return { ...expr, body };
    }

    case "NewExpression": {
      const callee = compressExpr(expr.callee);
      const args = expr.arguments.map((a) =>
        a.type === "SpreadElement"
          ? { ...a, argument: compressExpr(a.argument) }
          : compressExpr(a),
      );
      return { ...expr, callee, arguments: args };
    }

    case "TemplateLiteral": {
      const expressions = expr.expressions.map(compressExpr);
      return { ...expr, expressions };
    }

    case "TaggedTemplateExpression": {
      const tag = compressExpr(expr.tag);
      const quasi = {
        ...expr.quasi,
        expressions: expr.quasi.expressions.map(compressExpr),
      };
      return { ...expr, tag, quasi };
    }

    case "UpdateExpression": {
      const argument = compressExpr(expr.argument);
      return { ...expr, argument };
    }

    case "YieldExpression": {
      const argument = expr.argument ? compressExpr(expr.argument) : null;
      return { ...expr, argument };
    }

    case "AwaitExpression": {
      const argument = compressExpr(expr.argument);
      return { ...expr, argument };
    }

    default:
      return expr;
  }
};

/**
 * Compress arrow function: `() => { return x }` -> `() => x`
 */
const compressArrow = (
  expr: ArrowFunctionExpression,
): ArrowFunctionExpression => {
  const params = expr.params;

  if (expr.body.type === "BlockStatement") {
    const body = compressBlock(expr.body);

    // If the block has a single return statement, convert to expression body
    if (
      body.body.length === 1 &&
      body.body[0].type === "ReturnStatement" &&
      (body.body[0] as ReturnStatement).argument !== null
    ) {
      const arg = compressExpr((body.body[0] as ReturnStatement).argument!);
      return {
        ...expr,
        params,
        body: arg,
        expression: true,
      };
    }

    return { ...expr, params, body };
  }

  // Expression body: just compress the expression
  const body = compressExpr(expr.body as Expression);
  return { ...expr, params, body };
};

/**
 * Compress object expression: `{x: x}` -> `{x}` (shorthand).
 */
const compressObject = (expr: ObjectExpression): ObjectExpression => {
  const properties = expr.properties.map((p) => {
    if (p.type === "SpreadElement") {
      return { ...p, argument: compressExpr(p.argument) };
    }

    const key = p.computed ? compressExpr(p.key) : p.key;
    const value = compressExpr(p.value as Expression);

    // Convert {x: x} to shorthand {x}
    if (
      !p.computed &&
      !p.shorthand &&
      p.kind === "init" &&
      !p.method &&
      key.type === "Identifier" &&
      value.type === "Identifier" &&
      key.name === value.name
    ) {
      return { ...p, key, value, shorthand: true };
    }

    return { ...p, key, value };
  });

  return { ...expr, properties };
};

/**
 * Compress member expression: `obj["prop"]` -> `obj.prop` when valid.
 */
const compressMember = (expr: MemberExpression): MemberExpression => {
  const object =
    expr.object.type === "Super" ? expr.object : compressExpr(expr.object);
  let property = expr.computed ? compressExpr(expr.property) : expr.property;
  let computed = expr.computed;

  // Convert computed string literal to dot notation
  if (
    computed &&
    property.type === "Literal" &&
    typeof property.value === "string" &&
    isValidIdentifier(property.value) &&
    !RESERVED_PROP.has(property.value)
  ) {
    property = {
      type: "Identifier",
      name: property.value,
      start: 0,
      end: 0,
    } as Identifier;
    computed = false;
  }

  return { ...expr, object, property, computed };
};

/**
 * Compress a block statement.
 * Merges consecutive expression statements followed by a return into
 * a sequence expression: `a=1;b=2;return c;` -> `return a=1,b=2,c;`
 */
const compressBlock = (block: BlockStatement): BlockStatement => {
  const body = block.body.map(compressStmt);
  const compressed = compressSequences(body);
  return { ...block, body: compressed };
};

/**
 * Compress consecutive expression statements + return into sequences.
 */
const compressSequences = (stmts: Statement[]): Statement[] => {
  const result: Statement[] = [];
  let i = 0;

  while (i < stmts.length) {
    // Look for a run of expression statements followed by a return
    if (stmts[i].type === "ExpressionStatement") {
      const exprStmts: Expression[] = [];
      let j = i;

      while (j < stmts.length && stmts[j].type === "ExpressionStatement") {
        exprStmts.push((stmts[j] as ExpressionStatement).expression);
        j++;
      }

      // If followed by a return with an argument, merge into return sequence
      if (
        j < stmts.length &&
        stmts[j].type === "ReturnStatement" &&
        (stmts[j] as ReturnStatement).argument !== null &&
        exprStmts.length > 0
      ) {
        const retStmt = stmts[j] as ReturnStatement;
        const allExprs = [...exprStmts, retStmt.argument!];
        const seq: Expression = {
          type: "SequenceExpression",
          expressions: allExprs,
          start: 0,
          end: 0,
        };
        result.push({
          ...retStmt,
          argument: seq,
        } as ReturnStatement);
        i = j + 1;
        continue;
      }

      // Otherwise keep them as-is
      for (let k = i; k < j; k++) {
        result.push(stmts[k]);
      }
      i = j;
      continue;
    }

    result.push(stmts[i]);
    i++;
  }

  return result;
};

/**
 * Compress a single statement.
 */
const compressStmt = (stmt: Statement): Statement => {
  switch (stmt.type) {
    case "ExpressionStatement":
      return { ...stmt, expression: compressExpr(stmt.expression) };
    case "ReturnStatement":
      return {
        ...stmt,
        argument: stmt.argument ? compressExpr(stmt.argument) : null,
      };
    case "ThrowStatement":
      return { ...stmt, argument: compressExpr(stmt.argument) };
    case "VariableDeclaration": {
      const declarations = stmt.declarations.map((d) => ({
        ...d,
        init: d.init ? compressExpr(d.init) : null,
      }));
      return { ...stmt, declarations };
    }
    case "IfStatement": {
      const test = compressExpr(stmt.test);
      const consequent = compressStmt(stmt.consequent);
      const alternate = stmt.alternate ? compressStmt(stmt.alternate) : null;
      return { ...stmt, test, consequent, alternate };
    }
    case "WhileStatement": {
      const test = compressExpr(stmt.test);
      const body = compressStmt(stmt.body);
      return { ...stmt, test, body };
    }
    case "ForStatement": {
      const test = stmt.test ? compressExpr(stmt.test) : null;
      const update = stmt.update ? compressExpr(stmt.update) : null;
      const body = compressStmt(stmt.body);
      return { ...stmt, test, update, body };
    }
    case "BlockStatement":
      return compressBlock(stmt);
    case "FunctionDeclaration": {
      const body = compressBlock(stmt.body);
      return { ...stmt, body };
    }
    case "SwitchStatement": {
      const discriminant = compressExpr(stmt.discriminant);
      const cases = stmt.cases.map((c) => ({
        ...c,
        test: c.test ? compressExpr(c.test) : null,
        consequent: c.consequent.map(compressStmt),
      }));
      return { ...stmt, discriminant, cases };
    }
    case "TryStatement": {
      const block = compressBlock(stmt.block);
      const handler = stmt.handler
        ? { ...stmt.handler, body: compressBlock(stmt.handler.body) }
        : null;
      const finalizer = stmt.finalizer ? compressBlock(stmt.finalizer) : null;
      return { ...stmt, block, handler, finalizer };
    }
    default:
      return stmt;
  }
};

/**
 * Compress code throughout an AST.
 *
 * @param ast - The parsed Program AST
 * @returns A new Program with compressed code
 */
export const compressCode = (ast: Program): Program => {
  const body = ast.body.map((stmt): Statement | ModuleDeclaration => {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const decl = compressStmt(stmt.declaration as Statement) as Declaration;
        return { ...stmt, declaration: decl };
      }
      return stmt;
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      if (
        stmt.declaration.type === "FunctionDeclaration" ||
        stmt.declaration.type === "ClassDeclaration"
      ) {
        const decl = compressStmt(stmt.declaration as Statement) as Declaration;
        return { ...stmt, declaration: decl };
      }
      const decl = compressExpr(stmt.declaration as Expression);
      return { ...stmt, declaration: decl };
    }
    if (
      stmt.type === "ImportDeclaration" ||
      stmt.type === "ExportAllDeclaration"
    ) {
      return stmt;
    }
    return compressStmt(stmt as Statement);
  });
  return { ...ast, body };
};
