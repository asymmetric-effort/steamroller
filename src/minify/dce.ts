/**
 * @module minify/dce
 * @description Dead Code Elimination pass.
 *
 * Removes unreachable code after return/throw/break/continue,
 * evaluates constant if/else branches, removes side-effect-free
 * expression statements, and collapses single-statement blocks.
 */

import type {
  Program,
  Statement,
  Expression,
  BlockStatement,
  IfStatement,
  Literal,
  UnaryExpression,
  ExpressionStatement,
  ModuleDeclaration,
} from "../ast/types.js";

/**
 * Returns true when a statement is a terminator (control never flows past it).
 */
const isTerminator = (s: Statement): boolean =>
  s.type === "ReturnStatement" ||
  s.type === "ThrowStatement" ||
  s.type === "BreakStatement" ||
  s.type === "ContinueStatement";

/**
 * Attempt to evaluate an expression to a constant boolean value.
 * Returns `undefined` when the expression is not statically evaluable.
 */
const toBooleanConstant = (expr: Expression): boolean | undefined => {
  if (expr.type === "Literal") {
    return Boolean(expr.value);
  }
  if (expr.type === "UnaryExpression" && expr.operator === "!" && expr.prefix) {
    const inner = toBooleanConstant(expr.argument);
    if (inner !== undefined) return !inner;
  }
  if (expr.type === "Identifier" && expr.name === "undefined") {
    return false;
  }
  return undefined;
};

/**
 * Returns true if an expression statement has no observable side effects and
 * can therefore be safely removed.
 */
const isSideEffectFree = (expr: Expression): boolean => {
  if (expr.type === "Literal") return true;
  if (expr.type === "Identifier") return true;
  if (expr.type === "ThisExpression") return true;
  // typeof <identifier> is side-effect-free
  if (
    expr.type === "UnaryExpression" &&
    expr.operator === "typeof" &&
    expr.argument.type === "Identifier"
  ) {
    return true;
  }
  // void <side-effect-free>
  if (expr.type === "UnaryExpression" && expr.operator === "void") {
    return isSideEffectFree(expr.argument);
  }
  return false;
};

/**
 * Process an array of statements: remove unreachable code after terminators,
 * and recursively process nested structures.
 */
const processStatements = (
  stmts: ReadonlyArray<Statement | ModuleDeclaration>,
): (Statement | ModuleDeclaration)[] => {
  const result: (Statement | ModuleDeclaration)[] = [];
  let terminated = false;

  for (const stmt of stmts) {
    if (terminated) {
      // Keep function/class declarations (they are hoisted)
      if (
        stmt.type === "FunctionDeclaration" ||
        stmt.type === "ClassDeclaration"
      ) {
        result.push(stmt);
        continue;
      }
      // Skip everything else after a terminator
      continue;
    }

    const processed = processStatement(stmt);
    if (processed === null) continue; // removed
    result.push(processed);

    if (
      processed.type !== "ExportNamedDeclaration" &&
      processed.type !== "ExportDefaultDeclaration" &&
      processed.type !== "ExportAllDeclaration" &&
      processed.type !== "ImportDeclaration" &&
      isTerminator(processed as Statement)
    ) {
      terminated = true;
    }
  }

  return result;
};

/**
 * Process a single statement, returning a possibly-transformed statement
 * or null to indicate removal.
 */
const processStatement = (
  stmt: Statement | ModuleDeclaration,
): Statement | ModuleDeclaration | null => {
  switch (stmt.type) {
    case "BlockStatement":
      return processBlock(stmt);

    case "IfStatement":
      return processIf(stmt);

    case "ExpressionStatement":
      return processExpressionStatement(stmt);

    case "WhileStatement": {
      const body = processStatement(stmt.body);
      if (body === null) {
        return {
          ...stmt,
          body: { type: "EmptyStatement", start: 0, end: 0 } as Statement,
        };
      }
      return body !== stmt.body ? { ...stmt, body: body as Statement } : stmt;
    }

    case "ForStatement": {
      const body = processStatement(stmt.body);
      if (body === null) {
        return {
          ...stmt,
          body: { type: "EmptyStatement", start: 0, end: 0 } as Statement,
        };
      }
      return body !== stmt.body ? { ...stmt, body: body as Statement } : stmt;
    }

    case "FunctionDeclaration": {
      const newBody = processBlock(stmt.body);
      return newBody !== stmt.body
        ? { ...stmt, body: newBody as BlockStatement }
        : stmt;
    }

    case "TryStatement": {
      const block = processBlock(stmt.block);
      const handler = stmt.handler
        ? {
            ...stmt.handler,
            body: processBlock(stmt.handler.body) as BlockStatement,
          }
        : null;
      const finalizer = stmt.finalizer
        ? (processBlock(stmt.finalizer) as BlockStatement)
        : null;
      return { ...stmt, block: block as BlockStatement, handler, finalizer };
    }

    default:
      return stmt;
  }
};

/**
 * Process a block statement: process its body and collapse single-statement blocks.
 */
const processBlock = (block: BlockStatement): BlockStatement | Statement => {
  const body = processStatements(block.body as Statement[]) as Statement[];

  // Collapse single-statement blocks (but not the top-level function body)
  if (body.length === 1) {
    const single = body[0];
    // Don't collapse declarations (var/let/const/function/class) as they need
    // block scope, but we can collapse simple statements
    if (
      single.type !== "VariableDeclaration" &&
      single.type !== "FunctionDeclaration" &&
      single.type !== "ClassDeclaration"
    ) {
      // We still return a BlockStatement here; the caller (if-statement processing)
      // will decide whether to unwrap it
    }
  }

  return { ...block, body };
};

/**
 * Process an if-statement: evaluate constant tests, remove empty branches.
 */
const processIf = (stmt: IfStatement): Statement | null => {
  const testValue = toBooleanConstant(stmt.test);

  if (testValue === true) {
    // Always-true: just use consequent
    const processed = processStatement(stmt.consequent) as Statement | null;
    return processed;
  }

  if (testValue === false) {
    // Always-false: use alternate or remove
    if (stmt.alternate) {
      return processStatement(stmt.alternate) as Statement | null;
    }
    return null;
  }

  // Non-constant test: process branches
  let consequent = processStatement(stmt.consequent);
  let alternate = stmt.alternate ? processStatement(stmt.alternate) : null;

  // Collapse single-statement block bodies for if/else
  if (consequent && consequent.type === "BlockStatement") {
    const bs = consequent as BlockStatement;
    if (bs.body.length === 1) {
      const single = bs.body[0];
      if (
        single.type !== "VariableDeclaration" &&
        single.type !== "FunctionDeclaration" &&
        single.type !== "ClassDeclaration"
      ) {
        consequent = single;
      }
    }
  }

  if (alternate && alternate.type === "BlockStatement") {
    const bs = alternate as BlockStatement;
    if (bs.body.length === 1) {
      const single = bs.body[0];
      if (
        single.type !== "VariableDeclaration" &&
        single.type !== "FunctionDeclaration" &&
        single.type !== "ClassDeclaration"
      ) {
        alternate = single;
      }
    }
  }

  if (consequent === null) {
    if (alternate === null) return null;
    // if(!test) alternate
    consequent = alternate;
    alternate = null;
    return {
      ...stmt,
      test: {
        type: "UnaryExpression",
        operator: "!",
        prefix: true,
        argument: stmt.test,
        start: 0,
        end: 0,
      } as UnaryExpression,
      consequent: consequent as Statement,
      alternate: null,
    };
  }

  return {
    ...stmt,
    consequent: consequent as Statement,
    alternate: alternate as Statement | null,
  };
};

/**
 * Process expression statements: remove side-effect-free ones.
 */
const processExpressionStatement = (
  stmt: ExpressionStatement,
): ExpressionStatement | null => {
  if (isSideEffectFree(stmt.expression)) {
    return null;
  }
  return stmt;
};

/**
 * Eliminate dead code from an AST.
 *
 * @param ast - The parsed Program AST
 * @returns A new Program AST with dead code removed
 */
export const eliminateDeadCode = (ast: Program): Program => {
  const body = processStatements(ast.body);
  return { ...ast, body };
};
