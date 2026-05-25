/**
 * @module codegen/renderer
 * @description Iterative AST-to-code renderer that produces formatted JavaScript
 * from ESTree-compatible AST nodes. Uses a stack-based approach instead of
 * recursive visitor pattern for traversal.
 */

import type {
  ArrayExpression,
  ArrayPattern,
  ArrowFunctionExpression,
  AssignmentExpression,
  AssignmentPattern,
  AwaitExpression,
  BaseNode,
  BinaryExpression,
  BinaryOperator,
  BlockStatement,
  BreakStatement,
  CallExpression,
  CatchClause,
  ChainExpression,
  ClassBody,
  ClassDeclaration,
  ClassExpression,
  ConditionalExpression,
  ContinueStatement,
  DebuggerStatement,
  DoWhileStatement,
  EmptyStatement,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  ExpressionStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  IfStatement,
  ImportDeclaration,
  ImportExpression,
  LabeledStatement,
  Literal,
  LogicalExpression,
  LogicalOperator,
  MemberExpression,
  MetaProperty,
  MethodDefinition,
  NewExpression,
  ObjectExpression,
  ObjectPattern,
  Program,
  Property,
  PropertyDefinition,
  RestElement,
  ReturnStatement,
  SequenceExpression,
  SpreadElement,
  StaticBlock,
  Super,
  SwitchCase,
  SwitchStatement,
  TaggedTemplateExpression,
  TemplateLiteral,
  ThisExpression,
  ThrowStatement,
  TryStatement,
  UnaryExpression,
  UpdateExpression,
  VariableDeclaration,
  VariableDeclarator,
  WhileStatement,
  WithStatement,
  YieldExpression,
} from "../ast/types.js";

/** Options for controlling code generation output. */
export interface RenderOptions {
  readonly compact?: boolean;
  readonly indent?: string;
}

/**
 * Work item types for the iterative rendering stack.
 * Each item represents a piece of work that produces output text.
 */
const enum WorkType {
  /** Render a full AST node */
  Node = 0,
  /** Emit a literal string */
  Text = 1,
  /** Increase indentation depth */
  Indent = 2,
  /** Decrease indentation depth */
  Dedent = 3,
}

interface NodeWork {
  readonly kind: WorkType.Node;
  readonly node: BaseNode;
  readonly parentPrecedence?: number;
}

interface TextWork {
  readonly kind: WorkType.Text;
  readonly text: string;
}

interface IndentWork {
  readonly kind: WorkType.Indent;
}

interface DedentWork {
  readonly kind: WorkType.Dedent;
}

type WorkItem = NodeWork | TextWork | IndentWork | DedentWork;

/** Operator precedence levels (higher = binds tighter). */
const PRECEDENCE: Readonly<Record<string, number>> = {
  "||": 3,
  "??": 3,
  "&&": 4,
  "|": 5,
  "^": 6,
  "&": 7,
  "==": 8,
  "!=": 8,
  "===": 8,
  "!==": 8,
  "<": 9,
  "<=": 9,
  ">": 9,
  ">=": 9,
  in: 9,
  instanceof: 9,
  "<<": 10,
  ">>": 10,
  ">>>": 10,
  "+": 11,
  "-": 11,
  "*": 12,
  "/": 12,
  "%": 12,
  "**": 13,
};

/**
 * Get the precedence of a binary or logical operator.
 */
const getPrecedence = (operator: BinaryOperator | LogicalOperator): number => {
  return PRECEDENCE[operator] ?? 0;
};

/**
 * Determine whether a child expression needs parentheses given the parent precedence.
 */
const needsParens = (
  child: BaseNode,
  parentPrec: number | undefined,
): boolean => {
  if (parentPrec === undefined) {
    return false;
  }
  if (child.type === "BinaryExpression" || child.type === "LogicalExpression") {
    const childNode = child as BinaryExpression | LogicalExpression;
    const childPrec = getPrecedence(childNode.operator);
    return childPrec < parentPrec;
  }
  return false;
};

/**
 * Render an AST node to a JavaScript code string.
 *
 * Uses an iterative stack-based approach to avoid recursion.
 * Processes nodes by pushing work items onto a stack, where each
 * compound node decomposes into child node items and text items.
 */
export const renderNode = (node: BaseNode, options?: RenderOptions): string => {
  const indentStr = options?.indent ?? "\t";
  const compact = options?.compact ?? false;
  const nl = compact ? "" : "\n";
  const sp = compact ? "" : " ";

  const output: Array<string> = [];
  const stack: Array<WorkItem> = [{ kind: WorkType.Node, node }];
  let depth = 0;

  const indentAt = (d: number): string => (compact ? "" : indentStr.repeat(d));

  while (stack.length > 0) {
    const item = stack.pop()!;

    if (item.kind === WorkType.Text) {
      output.push(item.text);
      continue;
    }

    if (item.kind === WorkType.Indent) {
      depth++;
      continue;
    }

    if (item.kind === WorkType.Dedent) {
      depth--;
      continue;
    }

    // WorkType.Node
    const current = item.node;
    const parentPrec = item.parentPrecedence;

    // Check if we need to wrap in parentheses
    const wrapParens = needsParens(current, parentPrec);
    if (wrapParens) {
      // Push closing paren first (stack is LIFO)
      stack.push({ kind: WorkType.Text, text: ")" });
    }

    switch (current.type) {
      case "Program": {
        const prog = current as Program;
        // Push body items in reverse order
        for (let i = prog.body.length - 1; i >= 0; i--) {
          if (i < prog.body.length - 1) {
            stack.push({ kind: WorkType.Text, text: nl });
          }
          stack.push({ kind: WorkType.Node, node: prog.body[i] });
        }
        break;
      }

      case "ExpressionStatement": {
        const expr = current as ExpressionStatement;
        stack.push({ kind: WorkType.Text, text: ";" });
        stack.push({ kind: WorkType.Node, node: expr.expression });
        break;
      }

      case "BlockStatement": {
        const block = current as BlockStatement;
        stack.push({ kind: WorkType.Text, text: indentAt(depth) + "}" });
        stack.push({ kind: WorkType.Dedent });
        for (let i = block.body.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Text, text: nl });
          stack.push({ kind: WorkType.Node, node: block.body[i] });
          stack.push({ kind: WorkType.Text, text: indentAt(depth + 1) });
        }
        stack.push({ kind: WorkType.Indent });
        stack.push({ kind: WorkType.Text, text: "{" + nl });
        break;
      }

      case "EmptyStatement": {
        stack.push({ kind: WorkType.Text, text: ";" });
        break;
      }

      case "DebuggerStatement": {
        stack.push({ kind: WorkType.Text, text: "debugger;" });
        break;
      }

      case "ReturnStatement": {
        const ret = current as ReturnStatement;
        if (ret.argument) {
          stack.push({ kind: WorkType.Text, text: ";" });
          stack.push({ kind: WorkType.Node, node: ret.argument });
          stack.push({ kind: WorkType.Text, text: "return " });
        } else {
          stack.push({ kind: WorkType.Text, text: "return;" });
        }
        break;
      }

      case "ThrowStatement": {
        const thrw = current as ThrowStatement;
        stack.push({ kind: WorkType.Text, text: ";" });
        stack.push({ kind: WorkType.Node, node: thrw.argument });
        stack.push({ kind: WorkType.Text, text: "throw " });
        break;
      }

      case "BreakStatement": {
        const brk = current as BreakStatement;
        if (brk.label) {
          stack.push({ kind: WorkType.Text, text: ";" });
          stack.push({ kind: WorkType.Node, node: brk.label });
          stack.push({ kind: WorkType.Text, text: "break " });
        } else {
          stack.push({ kind: WorkType.Text, text: "break;" });
        }
        break;
      }

      case "ContinueStatement": {
        const cont = current as ContinueStatement;
        if (cont.label) {
          stack.push({ kind: WorkType.Text, text: ";" });
          stack.push({ kind: WorkType.Node, node: cont.label });
          stack.push({ kind: WorkType.Text, text: "continue " });
        } else {
          stack.push({ kind: WorkType.Text, text: "continue;" });
        }
        break;
      }

      case "LabeledStatement": {
        const labeled = current as LabeledStatement;
        stack.push({ kind: WorkType.Node, node: labeled.body });
        stack.push({ kind: WorkType.Text, text: ":" + sp });
        stack.push({ kind: WorkType.Node, node: labeled.label });
        break;
      }

      case "IfStatement": {
        const ifStmt = current as IfStatement;
        if (ifStmt.alternate) {
          stack.push({ kind: WorkType.Node, node: ifStmt.alternate });
          stack.push({ kind: WorkType.Text, text: sp + "else" + sp });
        }
        stack.push({ kind: WorkType.Node, node: ifStmt.consequent });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        stack.push({ kind: WorkType.Node, node: ifStmt.test });
        stack.push({ kind: WorkType.Text, text: "if" + sp + "(" });
        break;
      }

      case "WhileStatement": {
        const whileStmt = current as WhileStatement;
        stack.push({ kind: WorkType.Node, node: whileStmt.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        stack.push({ kind: WorkType.Node, node: whileStmt.test });
        stack.push({ kind: WorkType.Text, text: "while" + sp + "(" });
        break;
      }

      case "DoWhileStatement": {
        const doWhile = current as DoWhileStatement;
        stack.push({ kind: WorkType.Text, text: ";" });
        stack.push({ kind: WorkType.Text, text: ")" });
        stack.push({ kind: WorkType.Node, node: doWhile.test });
        stack.push({ kind: WorkType.Text, text: sp + "while" + sp + "(" });
        stack.push({ kind: WorkType.Node, node: doWhile.body });
        stack.push({ kind: WorkType.Text, text: "do" + sp });
        break;
      }

      case "ForStatement": {
        const forStmt = current as ForStatement;
        stack.push({ kind: WorkType.Node, node: forStmt.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        if (forStmt.update) {
          stack.push({ kind: WorkType.Node, node: forStmt.update });
        }
        stack.push({ kind: WorkType.Text, text: ";" + sp });
        if (forStmt.test) {
          stack.push({ kind: WorkType.Node, node: forStmt.test });
        }
        stack.push({ kind: WorkType.Text, text: ";" + sp });
        if (forStmt.init) {
          // VariableDeclaration inside for-init should not emit trailing semicolon
          if (forStmt.init.type === "VariableDeclaration") {
            const varDecl = forStmt.init as VariableDeclaration;
            for (let i = varDecl.declarations.length - 1; i >= 0; i--) {
              stack.push({
                kind: WorkType.Node,
                node: varDecl.declarations[i],
              });
              if (i > 0) {
                stack.push({ kind: WorkType.Text, text: "," + sp });
              }
            }
            stack.push({ kind: WorkType.Text, text: varDecl.kind + " " });
          } else {
            stack.push({ kind: WorkType.Node, node: forStmt.init as BaseNode });
          }
        }
        stack.push({ kind: WorkType.Text, text: "for" + sp + "(" });
        break;
      }

      case "ForInStatement": {
        const forIn = current as ForInStatement;
        stack.push({ kind: WorkType.Node, node: forIn.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        stack.push({ kind: WorkType.Node, node: forIn.right });
        stack.push({ kind: WorkType.Text, text: " in " });
        if (forIn.left.type === "VariableDeclaration") {
          const varDecl = forIn.left as VariableDeclaration;
          for (let i = varDecl.declarations.length - 1; i >= 0; i--) {
            stack.push({ kind: WorkType.Node, node: varDecl.declarations[i] });
          }
          stack.push({ kind: WorkType.Text, text: varDecl.kind + " " });
        } else {
          stack.push({ kind: WorkType.Node, node: forIn.left as BaseNode });
        }
        stack.push({ kind: WorkType.Text, text: "for" + sp + "(" });
        break;
      }

      case "ForOfStatement": {
        const forOf = current as ForOfStatement;
        stack.push({ kind: WorkType.Node, node: forOf.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        stack.push({ kind: WorkType.Node, node: forOf.right });
        stack.push({ kind: WorkType.Text, text: " of " });
        if (forOf.left.type === "VariableDeclaration") {
          const varDecl = forOf.left as VariableDeclaration;
          for (let i = varDecl.declarations.length - 1; i >= 0; i--) {
            stack.push({ kind: WorkType.Node, node: varDecl.declarations[i] });
          }
          stack.push({ kind: WorkType.Text, text: varDecl.kind + " " });
        } else {
          stack.push({ kind: WorkType.Node, node: forOf.left as BaseNode });
        }
        const awaitStr = forOf.await ? " await" : "";
        stack.push({ kind: WorkType.Text, text: "for" + awaitStr + sp + "(" });
        break;
      }

      case "SwitchStatement": {
        const sw = current as SwitchStatement;
        stack.push({ kind: WorkType.Text, text: indentAt(depth) + "}" });
        stack.push({ kind: WorkType.Dedent });
        for (let i = sw.cases.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: sw.cases[i] });
          stack.push({ kind: WorkType.Text, text: nl + indentAt(depth + 1) });
        }
        stack.push({ kind: WorkType.Indent });
        stack.push({ kind: WorkType.Text, text: ")" + sp + "{" });
        stack.push({ kind: WorkType.Node, node: sw.discriminant });
        stack.push({ kind: WorkType.Text, text: "switch" + sp + "(" });
        break;
      }

      case "SwitchCase": {
        const sc = current as SwitchCase;
        for (let i = sc.consequent.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Text, text: nl });
          stack.push({ kind: WorkType.Node, node: sc.consequent[i] });
          stack.push({ kind: WorkType.Text, text: indentAt(depth + 1) });
        }
        if (sc.test) {
          stack.push({ kind: WorkType.Text, text: ":" });
          stack.push({ kind: WorkType.Node, node: sc.test });
          stack.push({ kind: WorkType.Text, text: "case " });
        } else {
          stack.push({ kind: WorkType.Text, text: "default:" });
        }
        break;
      }

      case "TryStatement": {
        const tryStmt = current as TryStatement;
        if (tryStmt.finalizer) {
          stack.push({ kind: WorkType.Node, node: tryStmt.finalizer });
          stack.push({ kind: WorkType.Text, text: sp + "finally" + sp });
        }
        if (tryStmt.handler) {
          stack.push({ kind: WorkType.Node, node: tryStmt.handler });
        }
        stack.push({ kind: WorkType.Node, node: tryStmt.block });
        stack.push({ kind: WorkType.Text, text: "try" + sp });
        break;
      }

      case "CatchClause": {
        const cc = current as CatchClause;
        stack.push({ kind: WorkType.Node, node: cc.body });
        if (cc.param) {
          stack.push({ kind: WorkType.Text, text: ")" + sp });
          stack.push({ kind: WorkType.Node, node: cc.param as BaseNode });
          stack.push({ kind: WorkType.Text, text: sp + "catch" + sp + "(" });
        } else {
          stack.push({ kind: WorkType.Text, text: sp + "catch" + sp });
        }
        break;
      }

      case "WithStatement": {
        const withStmt = current as WithStatement;
        stack.push({ kind: WorkType.Node, node: withStmt.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        stack.push({ kind: WorkType.Node, node: withStmt.object });
        stack.push({ kind: WorkType.Text, text: "with" + sp + "(" });
        break;
      }

      case "VariableDeclaration": {
        const varDecl = current as VariableDeclaration;
        stack.push({ kind: WorkType.Text, text: ";" });
        for (let i = varDecl.declarations.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: varDecl.declarations[i] });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: varDecl.kind + " " });
        break;
      }

      case "VariableDeclarator": {
        const decl = current as VariableDeclarator;
        if (decl.init) {
          stack.push({ kind: WorkType.Node, node: decl.init });
          stack.push({ kind: WorkType.Text, text: sp + "=" + sp });
        }
        stack.push({ kind: WorkType.Node, node: decl.id as BaseNode });
        break;
      }

      case "FunctionDeclaration": {
        const fn = current as FunctionDeclaration;
        stack.push({ kind: WorkType.Node, node: fn.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        for (let i = fn.params.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: fn.params[i] as BaseNode });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "(" });
        if (fn.id) {
          stack.push({ kind: WorkType.Node, node: fn.id });
          stack.push({ kind: WorkType.Text, text: " " });
        }
        const fnPrefix =
          (fn.async ? "async " : "") + "function" + (fn.generator ? "*" : "");
        stack.push({ kind: WorkType.Text, text: fnPrefix });
        break;
      }

      case "ClassDeclaration":
      case "ClassExpression": {
        const cls = current as ClassDeclaration | ClassExpression;
        stack.push({ kind: WorkType.Node, node: cls.body });
        if (cls.superClass) {
          stack.push({ kind: WorkType.Text, text: sp });
          stack.push({ kind: WorkType.Node, node: cls.superClass });
          stack.push({ kind: WorkType.Text, text: " extends " });
        } else {
          stack.push({ kind: WorkType.Text, text: sp });
        }
        if (cls.id) {
          stack.push({ kind: WorkType.Node, node: cls.id });
          stack.push({ kind: WorkType.Text, text: " " });
        }
        stack.push({ kind: WorkType.Text, text: "class" });
        break;
      }

      case "ClassBody": {
        const body = current as ClassBody;
        stack.push({ kind: WorkType.Text, text: indentAt(depth) + "}" });
        stack.push({ kind: WorkType.Dedent });
        for (let i = body.body.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Text, text: nl });
          stack.push({ kind: WorkType.Node, node: body.body[i] });
          stack.push({ kind: WorkType.Text, text: indentAt(depth + 1) });
        }
        stack.push({ kind: WorkType.Indent });
        stack.push({ kind: WorkType.Text, text: "{" + nl });
        break;
      }

      case "MethodDefinition": {
        const method = current as MethodDefinition;
        const fnVal = method.value;
        // Build method body inline
        stack.push({ kind: WorkType.Node, node: fnVal.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        for (let i = fnVal.params.length - 1; i >= 0; i--) {
          stack.push({
            kind: WorkType.Node,
            node: fnVal.params[i] as BaseNode,
          });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "(" });
        if (method.computed) {
          stack.push({ kind: WorkType.Text, text: "]" });
          stack.push({ kind: WorkType.Node, node: method.key });
          stack.push({ kind: WorkType.Text, text: "[" });
        } else {
          stack.push({ kind: WorkType.Node, node: method.key });
        }
        const methodPrefix: Array<string> = [];
        if (method.static) {
          methodPrefix.push("static ");
        }
        if (fnVal.async) {
          methodPrefix.push("async ");
        }
        if (fnVal.generator) {
          methodPrefix.push("*");
        }
        if (method.kind === "get") {
          methodPrefix.push("get ");
        } else if (method.kind === "set") {
          methodPrefix.push("set ");
        }
        if (methodPrefix.length > 0) {
          stack.push({ kind: WorkType.Text, text: methodPrefix.join("") });
        }
        break;
      }

      case "PropertyDefinition": {
        const prop = current as PropertyDefinition;
        stack.push({ kind: WorkType.Text, text: ";" });
        if (prop.value) {
          stack.push({ kind: WorkType.Node, node: prop.value });
          stack.push({ kind: WorkType.Text, text: sp + "=" + sp });
        }
        if (prop.computed) {
          stack.push({ kind: WorkType.Text, text: "]" });
          stack.push({ kind: WorkType.Node, node: prop.key });
          stack.push({ kind: WorkType.Text, text: "[" });
        } else {
          stack.push({ kind: WorkType.Node, node: prop.key });
        }
        if (prop.static) {
          stack.push({ kind: WorkType.Text, text: "static " });
        }
        break;
      }

      case "StaticBlock": {
        const sb = current as StaticBlock;
        stack.push({ kind: WorkType.Text, text: indentAt(depth) + "}" });
        stack.push({ kind: WorkType.Dedent });
        for (let i = sb.body.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Text, text: nl });
          stack.push({ kind: WorkType.Node, node: sb.body[i] });
          stack.push({ kind: WorkType.Text, text: indentAt(depth + 1) });
        }
        stack.push({ kind: WorkType.Indent });
        stack.push({ kind: WorkType.Text, text: "static" + sp + "{" + nl });
        break;
      }

      case "Identifier": {
        const id = current as Identifier;
        stack.push({ kind: WorkType.Text, text: id.name });
        break;
      }

      case "Literal": {
        const lit = current as Literal;
        if (lit.raw !== undefined) {
          stack.push({ kind: WorkType.Text, text: lit.raw });
        } else if (lit.regex) {
          stack.push({
            kind: WorkType.Text,
            text: `/${lit.regex.pattern}/${lit.regex.flags}`,
          });
        } else if (lit.bigint !== undefined) {
          stack.push({ kind: WorkType.Text, text: lit.bigint + "n" });
        } else if (typeof lit.value === "string") {
          stack.push({ kind: WorkType.Text, text: JSON.stringify(lit.value) });
        } else if (lit.value === null) {
          stack.push({ kind: WorkType.Text, text: "null" });
        } else {
          stack.push({ kind: WorkType.Text, text: String(lit.value) });
        }
        break;
      }

      case "TemplateLiteral": {
        const tmpl = current as TemplateLiteral;
        stack.push({ kind: WorkType.Text, text: "`" });
        for (let i = tmpl.quasis.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Text, text: tmpl.quasis[i].value.raw });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "}" });
            stack.push({ kind: WorkType.Node, node: tmpl.expressions[i - 1] });
            stack.push({ kind: WorkType.Text, text: "${" });
          }
        }
        stack.push({ kind: WorkType.Text, text: "`" });
        break;
      }

      case "TaggedTemplateExpression": {
        const tagged = current as TaggedTemplateExpression;
        stack.push({ kind: WorkType.Node, node: tagged.quasi });
        stack.push({ kind: WorkType.Node, node: tagged.tag });
        break;
      }

      case "ThisExpression": {
        stack.push({ kind: WorkType.Text, text: "this" });
        break;
      }

      case "Super": {
        stack.push({ kind: WorkType.Text, text: "super" });
        break;
      }

      case "ArrayExpression": {
        const arr = current as ArrayExpression;
        stack.push({ kind: WorkType.Text, text: "]" });
        for (let i = arr.elements.length - 1; i >= 0; i--) {
          const el = arr.elements[i];
          if (el) {
            stack.push({ kind: WorkType.Node, node: el });
          }
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "[" });
        break;
      }

      case "ObjectExpression": {
        const obj = current as ObjectExpression;
        if (obj.properties.length === 0) {
          stack.push({ kind: WorkType.Text, text: "{}" });
        } else {
          stack.push({ kind: WorkType.Text, text: sp + "}" });
          for (let i = obj.properties.length - 1; i >= 0; i--) {
            stack.push({ kind: WorkType.Node, node: obj.properties[i] });
            if (i > 0) {
              stack.push({ kind: WorkType.Text, text: "," + sp });
            }
          }
          stack.push({ kind: WorkType.Text, text: "{" + sp });
        }
        break;
      }

      case "Property": {
        const prop = current as Property;
        if (prop.kind === "get" || prop.kind === "set") {
          // getter/setter in object literal
          const fnVal = prop.value as FunctionExpression;
          stack.push({ kind: WorkType.Node, node: fnVal.body });
          stack.push({ kind: WorkType.Text, text: ")" + sp });
          for (let i = fnVal.params.length - 1; i >= 0; i--) {
            stack.push({
              kind: WorkType.Node,
              node: fnVal.params[i] as BaseNode,
            });
            if (i > 0) {
              stack.push({ kind: WorkType.Text, text: "," + sp });
            }
          }
          stack.push({ kind: WorkType.Text, text: "(" });
          if (prop.computed) {
            stack.push({ kind: WorkType.Text, text: "]" });
            stack.push({ kind: WorkType.Node, node: prop.key });
            stack.push({ kind: WorkType.Text, text: "[" });
          } else {
            stack.push({ kind: WorkType.Node, node: prop.key });
          }
          stack.push({ kind: WorkType.Text, text: prop.kind + " " });
        } else if (prop.method) {
          const fnVal = prop.value as FunctionExpression;
          stack.push({ kind: WorkType.Node, node: fnVal.body });
          stack.push({ kind: WorkType.Text, text: ")" + sp });
          for (let i = fnVal.params.length - 1; i >= 0; i--) {
            stack.push({
              kind: WorkType.Node,
              node: fnVal.params[i] as BaseNode,
            });
            if (i > 0) {
              stack.push({ kind: WorkType.Text, text: "," + sp });
            }
          }
          stack.push({ kind: WorkType.Text, text: "(" });
          if (prop.computed) {
            stack.push({ kind: WorkType.Text, text: "]" });
            stack.push({ kind: WorkType.Node, node: prop.key });
            stack.push({ kind: WorkType.Text, text: "[" });
          } else {
            stack.push({ kind: WorkType.Node, node: prop.key });
          }
        } else if (prop.shorthand) {
          stack.push({ kind: WorkType.Node, node: prop.key });
        } else {
          stack.push({ kind: WorkType.Node, node: prop.value as BaseNode });
          stack.push({ kind: WorkType.Text, text: ":" + sp });
          if (prop.computed) {
            stack.push({ kind: WorkType.Text, text: "]" });
            stack.push({ kind: WorkType.Node, node: prop.key });
            stack.push({ kind: WorkType.Text, text: "[" });
          } else {
            stack.push({ kind: WorkType.Node, node: prop.key });
          }
        }
        break;
      }

      case "SpreadElement": {
        const spread = current as SpreadElement;
        stack.push({ kind: WorkType.Node, node: spread.argument });
        stack.push({ kind: WorkType.Text, text: "..." });
        break;
      }

      case "FunctionExpression": {
        const fn = current as FunctionExpression;
        stack.push({ kind: WorkType.Node, node: fn.body });
        stack.push({ kind: WorkType.Text, text: ")" + sp });
        for (let i = fn.params.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: fn.params[i] as BaseNode });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "(" });
        if (fn.id) {
          stack.push({ kind: WorkType.Node, node: fn.id });
          stack.push({ kind: WorkType.Text, text: " " });
        }
        const fePrefix =
          (fn.async ? "async " : "") + "function" + (fn.generator ? "*" : "");
        stack.push({ kind: WorkType.Text, text: fePrefix });
        break;
      }

      case "ArrowFunctionExpression": {
        const arrow = current as ArrowFunctionExpression;
        if (arrow.expression) {
          stack.push({ kind: WorkType.Node, node: arrow.body });
        } else {
          stack.push({ kind: WorkType.Node, node: arrow.body });
        }
        stack.push({ kind: WorkType.Text, text: sp + "=>" + sp });
        // Params
        const needsParentheses =
          arrow.params.length !== 1 || arrow.params[0].type !== "Identifier";
        if (needsParentheses) {
          stack.push({ kind: WorkType.Text, text: ")" });
          for (let i = arrow.params.length - 1; i >= 0; i--) {
            stack.push({
              kind: WorkType.Node,
              node: arrow.params[i] as BaseNode,
            });
            if (i > 0) {
              stack.push({ kind: WorkType.Text, text: "," + sp });
            }
          }
          stack.push({ kind: WorkType.Text, text: "(" });
        } else {
          stack.push({
            kind: WorkType.Node,
            node: arrow.params[0] as BaseNode,
          });
        }
        if (arrow.async) {
          stack.push({ kind: WorkType.Text, text: "async " });
        }
        break;
      }

      case "SequenceExpression": {
        const seq = current as SequenceExpression;
        for (let i = seq.expressions.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: seq.expressions[i] });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        break;
      }

      case "UnaryExpression": {
        const unary = current as UnaryExpression;
        if (unary.prefix) {
          stack.push({ kind: WorkType.Node, node: unary.argument });
          // Word operators need a space
          const needsSpace =
            unary.operator === "typeof" ||
            unary.operator === "void" ||
            unary.operator === "delete";
          stack.push({
            kind: WorkType.Text,
            text: unary.operator + (needsSpace ? " " : ""),
          });
        } else {
          stack.push({ kind: WorkType.Text, text: unary.operator });
          stack.push({ kind: WorkType.Node, node: unary.argument });
        }
        break;
      }

      case "BinaryExpression": {
        const bin = current as BinaryExpression;
        const prec = getPrecedence(bin.operator);
        stack.push({
          kind: WorkType.Node,
          node: bin.right,
          parentPrecedence: prec,
        });
        stack.push({ kind: WorkType.Text, text: sp + bin.operator + sp });
        stack.push({
          kind: WorkType.Node,
          node: bin.left,
          parentPrecedence: prec,
        });
        break;
      }

      case "LogicalExpression": {
        const log = current as LogicalExpression;
        const logPrec = getPrecedence(log.operator);
        stack.push({
          kind: WorkType.Node,
          node: log.right,
          parentPrecedence: logPrec,
        });
        stack.push({ kind: WorkType.Text, text: sp + log.operator + sp });
        stack.push({
          kind: WorkType.Node,
          node: log.left,
          parentPrecedence: logPrec,
        });
        break;
      }

      case "AssignmentExpression": {
        const assign = current as AssignmentExpression;
        stack.push({ kind: WorkType.Node, node: assign.right });
        stack.push({ kind: WorkType.Text, text: sp + assign.operator + sp });
        stack.push({ kind: WorkType.Node, node: assign.left as BaseNode });
        break;
      }

      case "UpdateExpression": {
        const update = current as UpdateExpression;
        if (update.prefix) {
          stack.push({ kind: WorkType.Node, node: update.argument });
          stack.push({ kind: WorkType.Text, text: update.operator });
        } else {
          stack.push({ kind: WorkType.Text, text: update.operator });
          stack.push({ kind: WorkType.Node, node: update.argument });
        }
        break;
      }

      case "ConditionalExpression": {
        const cond = current as ConditionalExpression;
        stack.push({ kind: WorkType.Node, node: cond.alternate });
        stack.push({ kind: WorkType.Text, text: sp + ":" + sp });
        stack.push({ kind: WorkType.Node, node: cond.consequent });
        stack.push({ kind: WorkType.Text, text: sp + "?" + sp });
        stack.push({ kind: WorkType.Node, node: cond.test });
        break;
      }

      case "CallExpression": {
        const call = current as CallExpression;
        stack.push({ kind: WorkType.Text, text: ")" });
        for (let i = call.arguments.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: call.arguments[i] });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        const callOpen = call.optional ? "?.(" : "(";
        stack.push({ kind: WorkType.Text, text: callOpen });
        stack.push({ kind: WorkType.Node, node: call.callee as BaseNode });
        break;
      }

      case "NewExpression": {
        const newExpr = current as NewExpression;
        stack.push({ kind: WorkType.Text, text: ")" });
        for (let i = newExpr.arguments.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: newExpr.arguments[i] });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "(" });
        stack.push({ kind: WorkType.Node, node: newExpr.callee });
        stack.push({ kind: WorkType.Text, text: "new " });
        break;
      }

      case "MemberExpression": {
        const member = current as MemberExpression;
        if (member.computed) {
          stack.push({ kind: WorkType.Text, text: "]" });
          stack.push({ kind: WorkType.Node, node: member.property });
          const memberOpen = member.optional ? "?.[" : "[";
          stack.push({ kind: WorkType.Text, text: memberOpen });
        } else {
          stack.push({ kind: WorkType.Node, node: member.property });
          const dot = member.optional ? "?." : ".";
          stack.push({ kind: WorkType.Text, text: dot });
        }
        stack.push({ kind: WorkType.Node, node: member.object as BaseNode });
        break;
      }

      case "ChainExpression": {
        const chain = current as ChainExpression;
        stack.push({ kind: WorkType.Node, node: chain.expression });
        break;
      }

      case "YieldExpression": {
        const yieldExpr = current as YieldExpression;
        if (yieldExpr.argument) {
          stack.push({ kind: WorkType.Node, node: yieldExpr.argument });
          stack.push({
            kind: WorkType.Text,
            text: yieldExpr.delegate ? "yield* " : "yield ",
          });
        } else {
          stack.push({ kind: WorkType.Text, text: "yield" });
        }
        break;
      }

      case "AwaitExpression": {
        const awaitExpr = current as AwaitExpression;
        stack.push({ kind: WorkType.Node, node: awaitExpr.argument });
        stack.push({ kind: WorkType.Text, text: "await " });
        break;
      }

      case "MetaProperty": {
        const meta = current as MetaProperty;
        stack.push({
          kind: WorkType.Text,
          text: meta.meta.name + "." + meta.property.name,
        });
        break;
      }

      case "ImportExpression": {
        const impExpr = current as ImportExpression;
        stack.push({ kind: WorkType.Text, text: ")" });
        stack.push({ kind: WorkType.Node, node: impExpr.source });
        stack.push({ kind: WorkType.Text, text: "import(" });
        break;
      }

      case "ObjectPattern": {
        const objPat = current as ObjectPattern;
        stack.push({ kind: WorkType.Text, text: sp + "}" });
        for (let i = objPat.properties.length - 1; i >= 0; i--) {
          stack.push({ kind: WorkType.Node, node: objPat.properties[i] });
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "{" + sp });
        break;
      }

      case "ArrayPattern": {
        const arrPat = current as ArrayPattern;
        stack.push({ kind: WorkType.Text, text: "]" });
        for (let i = arrPat.elements.length - 1; i >= 0; i--) {
          const el = arrPat.elements[i];
          if (el) {
            stack.push({ kind: WorkType.Node, node: el as BaseNode });
          }
          if (i > 0) {
            stack.push({ kind: WorkType.Text, text: "," + sp });
          }
        }
        stack.push({ kind: WorkType.Text, text: "[" });
        break;
      }

      case "RestElement": {
        const rest = current as RestElement;
        stack.push({ kind: WorkType.Node, node: rest.argument as BaseNode });
        stack.push({ kind: WorkType.Text, text: "..." });
        break;
      }

      case "AssignmentPattern": {
        const assignPat = current as AssignmentPattern;
        stack.push({ kind: WorkType.Node, node: assignPat.right });
        stack.push({ kind: WorkType.Text, text: sp + "=" + sp });
        stack.push({ kind: WorkType.Node, node: assignPat.left as BaseNode });
        break;
      }

      case "ImportDeclaration": {
        const imp = current as ImportDeclaration;
        stack.push({ kind: WorkType.Text, text: ";" });
        stack.push({ kind: WorkType.Node, node: imp.source });
        if (imp.specifiers.length === 0) {
          stack.push({ kind: WorkType.Text, text: "import " });
        } else {
          stack.push({ kind: WorkType.Text, text: " from " });
          // Determine specifier layout
          const defaultSpec = imp.specifiers.find(
            (s) => s.type === "ImportDefaultSpecifier",
          );
          const namespaceSpec = imp.specifiers.find(
            (s) => s.type === "ImportNamespaceSpecifier",
          );
          const namedSpecs = imp.specifiers.filter(
            (s) => s.type === "ImportSpecifier",
          );

          const parts: Array<WorkItem> = [];
          if (defaultSpec) {
            parts.push({ kind: WorkType.Node, node: defaultSpec.local });
          }
          if (namespaceSpec) {
            parts.push({
              kind: WorkType.Text,
              text: "* as " + namespaceSpec.local.name,
            });
          }
          if (namedSpecs.length > 0) {
            // Build named imports string iteratively
            const namedParts: Array<string> = [];
            for (let i = 0; i < namedSpecs.length; i++) {
              const s = namedSpecs[i];
              const imported =
                s.imported.type === "Identifier"
                  ? (s.imported as Identifier).name
                  : ((s.imported as Literal).raw ??
                    String((s.imported as Literal).value));
              if (imported === s.local.name) {
                namedParts.push(s.local.name);
              } else {
                namedParts.push(imported + " as " + s.local.name);
              }
            }
            parts.push({
              kind: WorkType.Text,
              text: "{" + sp + namedParts.join("," + sp) + sp + "}",
            });
          }

          // Push parts in reverse
          for (let i = parts.length - 1; i >= 0; i--) {
            stack.push(parts[i]);
            if (i > 0) {
              stack.push({ kind: WorkType.Text, text: "," + sp });
            }
          }
          stack.push({ kind: WorkType.Text, text: "import " });
        }
        break;
      }

      case "ExportNamedDeclaration": {
        const exp = current as ExportNamedDeclaration;
        if (exp.declaration) {
          stack.push({ kind: WorkType.Node, node: exp.declaration });
          stack.push({ kind: WorkType.Text, text: "export " });
        } else {
          if (exp.source) {
            stack.push({ kind: WorkType.Text, text: ";" });
            stack.push({ kind: WorkType.Node, node: exp.source });
            stack.push({ kind: WorkType.Text, text: " from " });
          } else {
            stack.push({ kind: WorkType.Text, text: ";" });
          }
          const specParts: Array<string> = [];
          for (let i = 0; i < exp.specifiers.length; i++) {
            const s = exp.specifiers[i] as ExportSpecifier;
            const localName =
              s.local.type === "Identifier"
                ? (s.local as Identifier).name
                : ((s.local as Literal).raw ??
                  String((s.local as Literal).value));
            const exportedName =
              s.exported.type === "Identifier"
                ? (s.exported as Identifier).name
                : ((s.exported as Literal).raw ??
                  String((s.exported as Literal).value));
            if (localName === exportedName) {
              specParts.push(localName);
            } else {
              specParts.push(localName + " as " + exportedName);
            }
          }
          stack.push({
            kind: WorkType.Text,
            text: "{" + sp + specParts.join("," + sp) + sp + "}",
          });
          stack.push({ kind: WorkType.Text, text: "export " });
        }
        break;
      }

      case "ExportDefaultDeclaration": {
        const expDef = current as ExportDefaultDeclaration;
        // Only add semicolon for expressions, not declarations
        if (
          expDef.declaration.type !== "FunctionDeclaration" &&
          expDef.declaration.type !== "ClassDeclaration"
        ) {
          stack.push({ kind: WorkType.Text, text: ";" });
        }
        stack.push({ kind: WorkType.Node, node: expDef.declaration });
        stack.push({ kind: WorkType.Text, text: "export default " });
        break;
      }

      case "ExportAllDeclaration": {
        const expAll = current as ExportAllDeclaration;
        stack.push({ kind: WorkType.Text, text: ";" });
        stack.push({ kind: WorkType.Node, node: expAll.source });
        if (expAll.exported) {
          const exportedName =
            expAll.exported.type === "Identifier"
              ? (expAll.exported as Identifier).name
              : ((expAll.exported as Literal).raw ??
                String((expAll.exported as Literal).value));
          stack.push({
            kind: WorkType.Text,
            text: " as " + exportedName + " from ",
          });
          stack.push({ kind: WorkType.Text, text: "export *" });
        } else {
          stack.push({ kind: WorkType.Text, text: " from " });
          stack.push({ kind: WorkType.Text, text: "export *" });
        }
        break;
      }

      default: {
        // Unknown node type - output empty string
        stack.push({ kind: WorkType.Text, text: "" });
        break;
      }
    }

    if (wrapParens) {
      // Push opening paren (will be output first due to LIFO)
      stack.push({ kind: WorkType.Text, text: "(" });
    }
  }

  return output.join("");
};
