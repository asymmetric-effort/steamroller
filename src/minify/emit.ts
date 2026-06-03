/**
 * @module minify/emit
 * @description AST-to-code emitter with minimal whitespace.
 *
 * Converts an ESTree AST back into JavaScript source code with
 * minimal whitespace. Preserves legal comments.
 */

import type {
  Program,
  Statement,
  Expression,
  Pattern,
  ModuleDeclaration,
  BlockStatement,
  Identifier,
  Literal,
  VariableDeclaration,
  FunctionDeclaration,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  ForInStatement,
  ForOfStatement,
  SwitchStatement,
  TryStatement,
  ThrowStatement,
  BreakStatement,
  ContinueStatement,
  LabeledStatement,
  ExpressionStatement,
  ClassDeclaration,
  WithStatement,
  DebuggerStatement,
  ArrowFunctionExpression,
  FunctionExpression,
  ClassExpression,
  ObjectExpression,
  ArrayExpression,
  Property,
  SpreadElement,
  BinaryExpression,
  LogicalExpression,
  UnaryExpression,
  UpdateExpression,
  ConditionalExpression,
  CallExpression,
  NewExpression,
  MemberExpression,
  SequenceExpression,
  AssignmentExpression,
  TemplateLiteral,
  TaggedTemplateExpression,
  YieldExpression,
  AwaitExpression,
  ImportExpression,
  ChainExpression,
  MetaProperty,
  ClassBody,
  MethodDefinition,
  PropertyDefinition,
  StaticBlock,
  Comment,
} from "../ast/types.js";

/** Operator precedence for minimal parenthesization. */
const PRECEDENCE: Record<string, number> = {
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
  ">": 9,
  "<=": 9,
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
 * Check if an expression needs parens when used as a callee or in binary context.
 */
const needsParens = (
  expr: Expression,
  parentPrec: number,
  isRight: boolean,
): boolean => {
  if (expr.type === "BinaryExpression" || expr.type === "LogicalExpression") {
    const prec = PRECEDENCE[expr.operator] ?? 0;
    if (prec < parentPrec) return true;
    if (prec === parentPrec && isRight) return true;
  }
  if (expr.type === "AssignmentExpression") return true;
  if (expr.type === "SequenceExpression") return true;
  if (expr.type === "ConditionalExpression" && parentPrec > 2) return true;
  return false;
};

/**
 * Emit an expression as a string.
 */
const emitExpr = (expr: Expression, prec = 0, isRight = false): string => {
  switch (expr.type) {
    case "Identifier":
      return expr.name;

    case "Literal":
      return emitLiteral(expr);

    case "TemplateLiteral":
      return emitTemplateLiteral(expr);

    case "TaggedTemplateExpression":
      return emitExpr(expr.tag) + emitTemplateLiteral(expr.quasi);

    case "ThisExpression":
      return "this";

    // Super is handled inline by call/member emitters

    case "ArrayExpression":
      return emitArray(expr);

    case "ObjectExpression":
      return emitObject(expr);

    case "FunctionExpression":
      return emitFunction(expr);

    case "ArrowFunctionExpression":
      return emitArrow(expr, prec);

    case "ClassExpression":
      return emitClass(expr);

    case "SequenceExpression": {
      const inner = expr.expressions.map((e) => emitExpr(e, 1)).join(",");
      return prec > 0 ? `(${inner})` : inner;
    }

    case "UnaryExpression":
      return emitUnary(expr);

    case "BinaryExpression":
    case "LogicalExpression":
      return emitBinary(expr, prec, isRight);

    case "AssignmentExpression": {
      const left = emitExpr(expr.left as Expression);
      const right = emitExpr(expr.right, 1);
      const result = `${left}${expr.operator}${right}`;
      return prec > 1 ? `(${result})` : result;
    }

    case "UpdateExpression": {
      const arg = emitExpr(expr.argument, 15);
      return expr.prefix ? `${expr.operator}${arg}` : `${arg}${expr.operator}`;
    }

    case "ConditionalExpression": {
      const test = emitExpr(expr.test, 2);
      const cons = emitExpr(expr.consequent, 1);
      const alt = emitExpr(expr.alternate, 1);
      const result = `${test}?${cons}:${alt}`;
      return prec > 2 ? `(${result})` : result;
    }

    case "CallExpression":
      return emitCall(expr);

    case "NewExpression":
      return emitNew(expr);

    case "MemberExpression":
      return emitMember(expr);

    case "ChainExpression":
      return emitExpr(expr.expression);

    case "YieldExpression": {
      if (expr.argument) {
        const arg = emitExpr(expr.argument, 1);
        const result = expr.delegate ? `yield*${arg}` : `yield ${arg}`;
        return prec > 1 ? `(${result})` : result;
      }
      return "yield";
    }

    case "AwaitExpression": {
      const arg = emitExpr(expr.argument, 14);
      return `await ${arg}`;
    }

    case "MetaProperty":
      return `${expr.meta.name}.${expr.property.name}`;

    case "ImportExpression":
      return `import(${emitExpr(expr.source)})`;

    // SpreadElement is handled inline by array/call/object emitters

    default:
      return "";
  }
};

/**
 * Emit a literal value.
 */
const emitLiteral = (lit: Literal): string => {
  if (lit.regex) {
    return `/${lit.regex.pattern}/${lit.regex.flags}`;
  }
  if (lit.bigint !== undefined) {
    return `${lit.bigint}n`;
  }
  if (typeof lit.value === "string") {
    return JSON.stringify(lit.value);
  }
  if (lit.value === null) {
    return "null";
  }
  if (typeof lit.value === "number") {
    // Use shortest representation
    if (Object.is(lit.value, -0)) return "-0";
    const s = String(lit.value);
    // Use exponential notation if shorter
    const exp = lit.value.toExponential();
    if (exp.length < s.length) return exp;
    return s;
  }
  return String(lit.value);
};

/**
 * Emit a template literal.
 */
const emitTemplateLiteral = (tl: TemplateLiteral): string => {
  const backtick = String.fromCharCode(96);
  const dollarBrace = "$" + "{";
  let result = backtick;
  for (let i = 0; i < tl.quasis.length; i++) {
    result += tl.quasis[i].value.raw;
    if (i < tl.expressions.length) {
      result += dollarBrace + emitExpr(tl.expressions[i]) + "}";
    }
  }
  result += backtick;
  return result;
};

/**
 * Emit an array expression.
 */
const emitArray = (expr: ArrayExpression): string => {
  const elems = expr.elements.map((e) => {
    if (e === null) return "";
    if (e.type === "SpreadElement") return `...${emitExpr(e.argument)}`;
    return emitExpr(e);
  });
  return `[${elems.join(",")}]`;
};

/**
 * Emit an object expression.
 */
const emitObject = (expr: ObjectExpression): string => {
  const props = expr.properties.map((p) => {
    if (p.type === "SpreadElement") return `...${emitExpr(p.argument)}`;
    return emitProperty(p);
  });
  return `{${props.join(",")}}`;
};

/**
 * Emit an object property.
 */
const emitProperty = (prop: Property): string => {
  if (prop.shorthand) {
    return emitExpr(prop.value as Expression);
  }

  if (prop.method) {
    const fn = prop.value as FunctionExpression;
    const prefix =
      prop.kind === "get"
        ? "get "
        : prop.kind === "set"
          ? "set "
          : fn.async
            ? fn.generator
              ? "async*"
              : "async "
            : fn.generator
              ? "*"
              : "";
    const key = prop.computed ? `[${emitExpr(prop.key)}]` : emitExpr(prop.key);
    const params = fn.params.map(emitPattern).join(",");
    const body = emitBlock(fn.body);
    return `${prefix}${key}(${params})${body}`;
  }

  const key = prop.computed ? `[${emitExpr(prop.key)}]` : emitExpr(prop.key);

  if (prop.kind === "get" || prop.kind === "set") {
    const fn = prop.value as FunctionExpression;
    const params = fn.params.map(emitPattern).join(",");
    const body = emitBlock(fn.body);
    return `${prop.kind} ${key}(${params})${body}`;
  }

  const value = emitExpr(prop.value as Expression);
  return `${key}:${value}`;
};

/**
 * Emit a function expression.
 */
const emitFunction = (expr: FunctionExpression): string => {
  let prefix = "";
  if (expr.async) prefix += "async ";
  prefix += "function";
  if (expr.generator) prefix += "*";
  if (expr.id) prefix += " " + expr.id.name;
  const params = expr.params.map(emitPattern).join(",");
  const body = emitBlock(expr.body);
  return `${prefix}(${params})${body}`;
};

/**
 * Emit an arrow function expression.
 */
const emitArrow = (
  expr: ArrowFunctionExpression,
  parentPrec: number,
): string => {
  let prefix = expr.async ? "async " : "";

  // Single non-destructuring parameter without default: omit parens
  if (
    expr.params.length === 1 &&
    expr.params[0].type === "Identifier" &&
    !expr.async
  ) {
    prefix += expr.params[0].name;
  } else {
    prefix += `(${expr.params.map(emitPattern).join(",")})`;
  }

  prefix += "=>";

  if (expr.expression && expr.body.type !== "BlockStatement") {
    const bodyStr = emitExpr(expr.body as Expression, 1);
    // Wrap in parens if body is an object literal
    const result =
      (expr.body as Expression).type === "ObjectExpression"
        ? `${prefix}(${bodyStr})`
        : `${prefix}${bodyStr}`;
    // Arrows in certain contexts need parens
    return parentPrec > 1 ? `(${result})` : result;
  }

  const body = emitBlock(expr.body as BlockStatement);
  const result = `${prefix}${body}`;
  return parentPrec > 1 ? `(${result})` : result;
};

/**
 * Emit a class expression/declaration.
 */
const emitClass = (cls: ClassExpression | ClassDeclaration): string => {
  let result = "class";
  if (cls.id) result += " " + cls.id.name;
  if (cls.superClass) result += " extends " + emitExpr(cls.superClass);
  result += emitClassBody(cls.body);
  return result;
};

/**
 * Emit a class body.
 */
const emitClassBody = (body: ClassBody): string => {
  const members = body.body.map((m) => {
    if (m.type === "MethodDefinition") return emitMethodDef(m);
    if (m.type === "PropertyDefinition") return emitPropDef(m);
    if (m.type === "StaticBlock") {
      return `static${emitBlock({ ...m, type: "BlockStatement" } as unknown as BlockStatement)}`;
    }
    return "";
  });
  return `{${members.join(";")}}`;
};

/**
 * Emit a method definition.
 */
const emitMethodDef = (m: MethodDefinition): string => {
  let prefix = m.static ? "static " : "";
  if (m.kind === "get") prefix += "get ";
  else if (m.kind === "set") prefix += "set ";
  else {
    if (m.value.async) prefix += "async ";
    if (m.value.generator) prefix += "*";
  }
  const key = m.computed ? `[${emitExpr(m.key)}]` : emitExpr(m.key);
  const params = m.value.params.map(emitPattern).join(",");
  const body = emitBlock(m.value.body);
  return `${prefix}${key}(${params})${body}`;
};

/**
 * Emit a property definition.
 */
const emitPropDef = (p: PropertyDefinition): string => {
  let prefix = p.static ? "static " : "";
  const key = p.computed ? `[${emitExpr(p.key)}]` : emitExpr(p.key);
  if (p.value) {
    return `${prefix}${key}=${emitExpr(p.value)}`;
  }
  return `${prefix}${key}`;
};

/**
 * Emit a unary expression.
 */
const emitUnary = (expr: UnaryExpression): string => {
  const arg = emitExpr(expr.argument, 14);
  // Word operators need a space
  if (
    expr.operator === "typeof" ||
    expr.operator === "void" ||
    expr.operator === "delete"
  ) {
    // Need space if argument starts with a letter or paren-free
    return `${expr.operator} ${arg}`;
  }
  // Handle --(-x) or ++(+x) ambiguity
  if (
    (expr.operator === "-" && arg.startsWith("-")) ||
    (expr.operator === "+" && arg.startsWith("+"))
  ) {
    return `${expr.operator} ${arg}`;
  }
  return `${expr.operator}${arg}`;
};

/**
 * Emit a binary or logical expression.
 */
const emitBinary = (
  expr: BinaryExpression | LogicalExpression,
  parentPrec: number,
  isRight: boolean,
): string => {
  const myPrec = PRECEDENCE[expr.operator] ?? 0;
  const left = emitExpr(expr.left, myPrec, false);
  const right = emitExpr(expr.right, myPrec, true);

  // Add spaces around word operators
  let op: string = expr.operator;
  if (op === "in" || op === "instanceof") {
    op = " " + op + " ";
  }

  const result = left + op + right;

  if (needsParens(expr, parentPrec, isRight)) {
    return `(${result})`;
  }
  return result;
};

/**
 * Emit a call expression.
 */
const emitCall = (expr: CallExpression): string => {
  const callee =
    expr.callee.type === "Super" ? "super" : emitExpr(expr.callee, 17);
  const args = expr.arguments
    .map((a) => {
      if (a.type === "SpreadElement") return `...${emitExpr(a.argument)}`;
      return emitExpr(a);
    })
    .join(",");
  const opt = expr.optional ? "?." : "";
  // Wrap callee in parens if it's an arrow or object that would be ambiguous
  let calleeStr = callee;
  if (
    expr.callee.type === "ArrowFunctionExpression" ||
    expr.callee.type === "FunctionExpression" ||
    expr.callee.type === "ClassExpression"
  ) {
    calleeStr = `(${callee})`;
  }
  return `${calleeStr}${opt}(${args})`;
};

/**
 * Emit a new expression.
 */
const emitNew = (expr: NewExpression): string => {
  const callee = emitExpr(expr.callee, 17);
  const args = expr.arguments
    .map((a) => {
      if (a.type === "SpreadElement") return `...${emitExpr(a.argument)}`;
      return emitExpr(a);
    })
    .join(",");
  return `new ${callee}(${args})`;
};

/**
 * Emit a member expression.
 */
const emitMember = (expr: MemberExpression): string => {
  let object =
    expr.object.type === "Super" ? "super" : emitExpr(expr.object, 17);

  // Wrap numeric literals in parens for member access: (1).toString()
  if (expr.object.type === "Literal" && typeof expr.object.value === "number") {
    object = `(${object})`;
  }

  // Wrap object expression for member access
  if (
    expr.object.type === "ObjectExpression" ||
    expr.object.type === "FunctionExpression" ||
    expr.object.type === "ClassExpression"
  ) {
    object = `(${object})`;
  }

  const opt = expr.optional ? "?." : "";

  if (expr.computed) {
    const prop = emitExpr(expr.property);
    return `${object}${opt}[${prop}]`;
  }

  const prop = emitExpr(expr.property);
  if (opt) {
    return `${object}?.${prop}`;
  }
  return `${object}.${prop}`;
};

/**
 * Emit a pattern.
 */
const emitPattern = (pat: Pattern): string => {
  switch (pat.type) {
    case "Identifier":
      return pat.name;
    case "AssignmentPattern":
      return `${emitPattern(pat.left)}=${emitExpr(pat.right)}`;
    case "RestElement":
      return `...${emitPattern(pat.argument)}`;
    case "ArrayPattern": {
      const elems = pat.elements.map((e) => (e ? emitPattern(e) : ""));
      return `[${elems.join(",")}]`;
    }
    case "ObjectPattern": {
      const props = pat.properties.map((p) => {
        if (p.type === "RestElement") return `...${emitPattern(p.argument)}`;
        if (p.shorthand) return emitPattern(p.value as Pattern);
        const key = p.computed ? `[${emitExpr(p.key)}]` : emitExpr(p.key);
        return `${key}:${emitPattern(p.value as Pattern)}`;
      });
      return `{${props.join(",")}}`;
    }
    case "MemberExpression":
      return emitMember(pat as MemberExpression);
    default:
      return "";
  }
};

/**
 * Emit a block statement.
 */
const emitBlock = (block: BlockStatement): string => {
  const stmts = block.body.map(emitStmt);
  return `{${stmts.join("")}}`;
};

/**
 * Emit a statement.
 */
const emitStmt = (stmt: Statement | ModuleDeclaration): string => {
  switch (stmt.type) {
    case "ExpressionStatement": {
      const expr = stmt.expression;
      let s = emitExpr(expr);
      // Wrap in parens if expression starts with { or is a function/class expression
      // that could be confused with a declaration
      if (
        expr.type === "ObjectExpression" ||
        expr.type === "FunctionExpression" ||
        expr.type === "ClassExpression"
      ) {
        s = `(${s})`;
      }
      return s + ";";
    }

    case "BlockStatement":
      return emitBlock(stmt);

    case "EmptyStatement":
      return ";";

    case "DebuggerStatement":
      return "debugger;";

    case "ReturnStatement":
      if (stmt.argument) {
        return `return ${emitExpr(stmt.argument)};`;
      }
      return "return;";

    case "ThrowStatement":
      return `throw ${emitExpr(stmt.argument)};`;

    case "BreakStatement":
      return stmt.label ? `break ${stmt.label.name};` : "break;";

    case "ContinueStatement":
      return stmt.label ? `continue ${stmt.label.name};` : "continue;";

    case "IfStatement":
      return emitIf(stmt);

    case "WhileStatement":
      return `while(${emitExpr(stmt.test)})${emitStmtBody(stmt.body)}`;

    case "DoWhileStatement":
      return `do${emitStmtBody(stmt.body)}while(${emitExpr(stmt.test)});`;

    case "ForStatement":
      return emitFor(stmt);

    case "ForInStatement":
      return emitForIn(stmt);

    case "ForOfStatement":
      return emitForOf(stmt);

    case "SwitchStatement":
      return emitSwitch(stmt);

    case "TryStatement":
      return emitTry(stmt);

    case "LabeledStatement":
      return `${stmt.label.name}:${emitStmt(stmt.body)}`;

    case "WithStatement":
      return `with(${emitExpr(stmt.object)})${emitStmtBody(stmt.body)}`;

    case "VariableDeclaration":
      return emitVarDecl(stmt) + ";";

    case "FunctionDeclaration":
      return emitFuncDecl(stmt);

    case "ClassDeclaration":
      return emitClass(stmt);

    case "ImportDeclaration":
      return emitImport(stmt);

    case "ExportNamedDeclaration":
      return emitExportNamed(stmt);

    case "ExportDefaultDeclaration":
      return emitExportDefault(stmt);

    case "ExportAllDeclaration":
      return emitExportAll(stmt);

    default:
      return "";
  }
};

/**
 * Emit a statement that could be a block or single statement.
 */
const emitStmtBody = (stmt: Statement): string => {
  if (stmt.type === "BlockStatement") return emitBlock(stmt);
  if (stmt.type === "EmptyStatement") return ";";
  return emitStmt(stmt);
};

/**
 * Emit an if statement.
 */
const emitIf = (stmt: IfStatement): string => {
  let result = `if(${emitExpr(stmt.test)})`;

  if (stmt.alternate) {
    // If consequent is a single if without else, wrap in block to avoid
    // dangling else ambiguity
    if (stmt.consequent.type === "IfStatement" && !stmt.consequent.alternate) {
      result += `{${emitStmt(stmt.consequent)}}`;
    } else {
      result += emitStmtBody(stmt.consequent);
    }
    result += "else ";
    if (stmt.alternate.type === "IfStatement") {
      result += emitIf(stmt.alternate);
    } else {
      result += emitStmtBody(stmt.alternate);
    }
  } else {
    result += emitStmtBody(stmt.consequent);
  }

  return result;
};

/**
 * Emit a for statement.
 */
const emitFor = (stmt: ForStatement): string => {
  let init = "";
  if (stmt.init) {
    if (stmt.init.type === "VariableDeclaration") {
      init = emitVarDecl(stmt.init);
    } else {
      init = emitExpr(stmt.init);
    }
  }
  const test = stmt.test ? emitExpr(stmt.test) : "";
  const update = stmt.update ? emitExpr(stmt.update) : "";
  return `for(${init};${test};${update})${emitStmtBody(stmt.body)}`;
};

/**
 * Emit a for-in statement.
 */
const emitForIn = (stmt: ForInStatement): string => {
  let left: string;
  if (stmt.left.type === "VariableDeclaration") {
    left = emitVarDecl(stmt.left);
  } else {
    left = emitPattern(stmt.left as Pattern);
  }
  return `for(${left} in ${emitExpr(stmt.right)})${emitStmtBody(stmt.body)}`;
};

/**
 * Emit a for-of statement.
 */
const emitForOf = (stmt: ForOfStatement): string => {
  let left: string;
  if (stmt.left.type === "VariableDeclaration") {
    left = emitVarDecl(stmt.left);
  } else {
    left = emitPattern(stmt.left as Pattern);
  }
  const aw = stmt.await ? "await " : "";
  return `for ${aw}(${left} of ${emitExpr(stmt.right)})${emitStmtBody(stmt.body)}`;
};

/**
 * Emit a switch statement.
 */
const emitSwitch = (stmt: SwitchStatement): string => {
  const cases = stmt.cases.map((c) => {
    const header = c.test ? `case ${emitExpr(c.test)}:` : "default:";
    const body = c.consequent.map(emitStmt).join("");
    return header + body;
  });
  return `switch(${emitExpr(stmt.discriminant)}){${cases.join("")}}`;
};

/**
 * Emit a try statement.
 */
const emitTry = (stmt: TryStatement): string => {
  let result = `try${emitBlock(stmt.block)}`;
  if (stmt.handler) {
    if (stmt.handler.param) {
      result += `catch(${emitPattern(stmt.handler.param)})${emitBlock(stmt.handler.body)}`;
    } else {
      result += `catch${emitBlock(stmt.handler.body)}`;
    }
  }
  if (stmt.finalizer) {
    result += `finally${emitBlock(stmt.finalizer)}`;
  }
  return result;
};

/**
 * Emit a variable declaration (without trailing semicolon).
 */
const emitVarDecl = (stmt: VariableDeclaration): string => {
  const decls = stmt.declarations.map((d) => {
    const id = emitPattern(d.id);
    if (d.init) {
      return `${id}=${emitExpr(d.init, 1)}`;
    }
    return id;
  });
  return `${stmt.kind} ${decls.join(",")}`;
};

/**
 * Emit a function declaration.
 */
const emitFuncDecl = (stmt: FunctionDeclaration): string => {
  let prefix = "";
  if (stmt.async) prefix += "async ";
  prefix += "function";
  if (stmt.generator) prefix += "*";
  if (stmt.id) prefix += " " + stmt.id.name;
  const params = stmt.params.map(emitPattern).join(",");
  const body = emitBlock(stmt.body);
  return `${prefix}(${params})${body}`;
};

/**
 * Emit an import declaration.
 */
const emitImport = (
  stmt: import("../ast/types.js").ImportDeclaration,
): string => {
  if (stmt.specifiers.length === 0) {
    return `import ${emitLiteral(stmt.source)};`;
  }

  const parts: string[] = [];
  const named: string[] = [];

  for (const spec of stmt.specifiers) {
    if (spec.type === "ImportDefaultSpecifier") {
      parts.push(spec.local.name);
    } else if (spec.type === "ImportNamespaceSpecifier") {
      parts.push(`* as ${spec.local.name}`);
    } else {
      const imported =
        spec.imported.type === "Identifier"
          ? spec.imported.name
          : emitLiteral(spec.imported);
      if (imported === spec.local.name) {
        named.push(spec.local.name);
      } else {
        named.push(`${imported} as ${spec.local.name}`);
      }
    }
  }

  if (named.length > 0) {
    parts.push(`{${named.join(",")}}`);
  }

  return `import ${parts.join(",")} from ${emitLiteral(stmt.source)};`;
};

/**
 * Emit a named export declaration.
 */
const emitExportNamed = (
  stmt: import("../ast/types.js").ExportNamedDeclaration,
): string => {
  if (stmt.declaration) {
    return `export ${emitStmt(stmt.declaration)}`;
  }

  const specs = stmt.specifiers.map((s) => {
    const local =
      s.local.type === "Identifier" ? s.local.name : emitLiteral(s.local);
    const exported =
      s.exported.type === "Identifier"
        ? s.exported.name
        : emitLiteral(s.exported);
    return local === exported ? local : `${local} as ${exported}`;
  });

  let result = `export{${specs.join(",")}}`;
  if (stmt.source) {
    result += ` from ${emitLiteral(stmt.source)}`;
  }
  return result + ";";
};

/**
 * Emit a default export declaration.
 */
const emitExportDefault = (
  stmt: import("../ast/types.js").ExportDefaultDeclaration,
): string => {
  if (
    stmt.declaration.type === "FunctionDeclaration" ||
    stmt.declaration.type === "ClassDeclaration"
  ) {
    return `export default ${emitStmt(stmt.declaration)}`;
  }
  return `export default ${emitExpr(stmt.declaration as Expression)};`;
};

/**
 * Emit an export-all declaration.
 */
const emitExportAll = (
  stmt: import("../ast/types.js").ExportAllDeclaration,
): string => {
  if (stmt.exported) {
    const name =
      stmt.exported.type === "Identifier"
        ? stmt.exported.name
        : emitLiteral(stmt.exported);
    return `export*as ${name} from ${emitLiteral(stmt.source)};`;
  }
  return `export*from ${emitLiteral(stmt.source)};`;
};

/**
 * Collect legal comments from an AST.
 */
const collectLegalComments = (ast: Program): string[] => {
  const comments: string[] = [];
  const collectFromNode = (node: Record<string, unknown>): void => {
    const leading = node.leadingComments as Comment[] | undefined;
    if (leading) {
      for (const c of leading) {
        if (c.type === "Block" && c.value.startsWith("!")) {
          comments.push(`/*${c.value}*/`);
        }
      }
    }
  };

  // Walk the AST to find legal comments
  const seen = new Set<string>();
  JSON.stringify(ast, (_key, val) => {
    if (val && typeof val === "object" && val.leadingComments) {
      const leading = val.leadingComments as Comment[];
      for (const c of leading) {
        if (c.type === "Block" && c.value.startsWith("!")) {
          const text = `/*${c.value}*/`;
          if (!seen.has(text)) {
            seen.add(text);
            comments.push(text);
          }
        }
      }
    }
    return val;
  });

  return comments;
};

/**
 * Emit minified code from an AST.
 *
 * @param ast - The Program AST to emit
 * @returns Minified JavaScript source code
 */
export const emitMinified = (ast: Program): string => {
  const legalComments = collectLegalComments(ast);
  const stmts = ast.body.map(emitStmt);
  const code = stmts.join("");

  if (legalComments.length > 0) {
    return legalComments.join("\n") + "\n" + code;
  }

  return code;
};
