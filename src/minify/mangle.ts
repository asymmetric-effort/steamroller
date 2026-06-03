/**
 * @module minify/mangle
 * @description Scope-Aware Name Mangling pass.
 *
 * Builds a scope tree, collects bindings, performs frequency analysis,
 * and assigns shortest names to most-used bindings. Supports property
 * mangling as an opt-in feature.
 */

import type {
  Program,
  Statement,
  Declaration,
  Expression,
  Pattern,
  Identifier,
  BlockStatement,
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunctionExpression,
  VariableDeclaration,
  ClassDeclaration,
  ModuleDeclaration,
  ForStatement,
  ForInStatement,
  ForOfStatement,
  CatchClause,
  Property,
  MemberExpression,
} from "../ast/types.js";

/** Options for the mangling pass. */
export interface MangleOptions {
  /** Names that must never be renamed. */
  readonly reserved?: ReadonlyArray<string>;
  /** Whether to mangle properties matching the pattern. Default: false */
  readonly mangleProperties?: boolean;
  /** Pattern for properties to mangle. Default: properties starting with `_` */
  readonly propertyPattern?: RegExp;
}

/** JavaScript reserved words that must never be used as identifiers. */
const JS_RESERVED = new Set([
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
  "async",
  "await",
  "of",
  "from",
  "as",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  "enum",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
]);

/** Common globals that should not be renamed. */
const GLOBALS = new Set([
  "console",
  "window",
  "document",
  "global",
  "globalThis",
  "process",
  "require",
  "module",
  "exports",
  "arguments",
  "Math",
  "JSON",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "RegExp",
  "Date",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "eval",
  "Function",
  "Proxy",
  "Reflect",
  "ArrayBuffer",
  "DataView",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Uint8ClampedArray",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "SharedArrayBuffer",
  "Atomics",
  "WeakRef",
  "FinalizationRegistry",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "fetch",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "AbortController",
  "AbortSignal",
  "Event",
  "EventTarget",
  "performance",
  "navigator",
  "crypto",
]);

/**
 * Generate the n-th short variable name.
 * Sequence: a, b, ..., z, A, B, ..., Z, aa, ab, ...
 */
const generateName = (index: number): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$";
  const base = chars.length;
  if (index < base) return chars[index];

  let name = "";
  let n = index;
  // First character can use all chars
  do {
    name = chars[n % base] + name;
    n = Math.floor(n / base) - 1;
  } while (n >= 0);
  return name;
};

/** A scope in the scope tree. */
interface Scope {
  parent: Scope | null;
  bindings: Map<string, number>; // name -> reference count
  children: Scope[];
  isExported: Set<string>; // exported names cannot be renamed
  hasEval: boolean;
}

/** Create a new scope. */
const createScope = (parent: Scope | null): Scope => ({
  parent,
  bindings: new Map(),
  children: [],
  isExported: new Set(),
  hasEval: false,
});

/**
 * Collect binding names from a pattern (handles destructuring).
 */
const collectBindingNames = (pattern: Pattern, names: string[]): void => {
  switch (pattern.type) {
    case "Identifier":
      names.push(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          collectBindingNames(prop.argument, names);
        } else {
          collectBindingNames(prop.value as Pattern, names);
        }
      }
      break;
    case "ArrayPattern":
      for (const elem of pattern.elements) {
        if (elem) collectBindingNames(elem, names);
      }
      break;
    case "RestElement":
      collectBindingNames(pattern.argument, names);
      break;
    case "AssignmentPattern":
      collectBindingNames(pattern.left, names);
      break;
    default:
      break;
  }
};

/**
 * Check if a scope or its ancestors contain eval.
 */
const scopeHasEval = (scope: Scope): boolean => {
  let s: Scope | null = scope;
  while (s) {
    if (s.hasEval) return true;
    s = s.parent;
  }
  return false;
};

/**
 * Build scopes and collect bindings from the AST.
 */
const buildScopes = (ast: Program): Scope => {
  const globalScope = createScope(null);

  const processStatements = (
    stmts: ReadonlyArray<Statement | ModuleDeclaration>,
    scope: Scope,
  ): void => {
    for (const stmt of stmts) {
      processStmt(stmt, scope);
    }
  };

  const addBinding = (scope: Scope, name: string): void => {
    if (!scope.bindings.has(name)) {
      scope.bindings.set(name, 0);
    }
  };

  const addReference = (name: string, scope: Scope): void => {
    // Walk up scopes to find the binding
    let s: Scope | null = scope;
    while (s) {
      if (s.bindings.has(name)) {
        s.bindings.set(name, (s.bindings.get(name) ?? 0) + 1);
        return;
      }
      s = s.parent;
    }
    // Not found: it's a global reference, don't track
  };

  const processExpr = (expr: Expression, scope: Scope): void => {
    switch (expr.type) {
      case "Identifier":
        addReference(expr.name, scope);
        break;
      case "CallExpression":
        if (expr.callee.type === "Identifier" && expr.callee.name === "eval") {
          scope.hasEval = true;
        }
        if (expr.callee.type !== "Super") processExpr(expr.callee, scope);
        for (const arg of expr.arguments) {
          if (arg.type === "SpreadElement") processExpr(arg.argument, scope);
          else processExpr(arg, scope);
        }
        break;
      case "MemberExpression":
        if (expr.object.type !== "Super") processExpr(expr.object, scope);
        if (expr.computed) processExpr(expr.property, scope);
        break;
      case "AssignmentExpression":
        processPattern(expr.left as Pattern, scope);
        processExpr(expr.right, scope);
        break;
      case "BinaryExpression":
      case "LogicalExpression":
        processExpr(expr.left, scope);
        processExpr(expr.right, scope);
        break;
      case "UnaryExpression":
      case "UpdateExpression":
        processExpr(expr.argument, scope);
        break;
      case "ConditionalExpression":
        processExpr(expr.test, scope);
        processExpr(expr.consequent, scope);
        processExpr(expr.alternate, scope);
        break;
      case "SequenceExpression":
        for (const e of expr.expressions) processExpr(e, scope);
        break;
      case "ArrayExpression":
        for (const e of expr.elements) {
          if (e === null) continue;
          if (e.type === "SpreadElement") processExpr(e.argument, scope);
          else processExpr(e, scope);
        }
        break;
      case "ObjectExpression":
        for (const p of expr.properties) {
          if (p.type === "SpreadElement") {
            processExpr(p.argument, scope);
          } else {
            if (p.computed) processExpr(p.key, scope);
            if (p.value) processExpr(p.value as Expression, scope);
          }
        }
        break;
      case "ArrowFunctionExpression":
        processFunctionLike(null, expr.params, expr.body, scope, expr.async);
        break;
      case "FunctionExpression":
        processFunctionLike(expr.id, expr.params, expr.body, scope, expr.async);
        break;
      case "NewExpression":
        processExpr(expr.callee, scope);
        for (const arg of expr.arguments) {
          if (arg.type === "SpreadElement") processExpr(arg.argument, scope);
          else processExpr(arg, scope);
        }
        break;
      case "TemplateLiteral":
        for (const e of expr.expressions) processExpr(e, scope);
        break;
      case "TaggedTemplateExpression":
        processExpr(expr.tag, scope);
        for (const e of expr.quasi.expressions) processExpr(e, scope);
        break;
      case "YieldExpression":
        if (expr.argument) processExpr(expr.argument, scope);
        break;
      case "AwaitExpression":
        processExpr(expr.argument, scope);
        break;
      case "ClassExpression":
        if (expr.superClass) processExpr(expr.superClass, scope);
        for (const item of expr.body.body) {
          if (item.type === "MethodDefinition") {
            if (item.computed) processExpr(item.key, scope);
            processExpr(item.value, scope);
          } else if (item.type === "PropertyDefinition") {
            if (item.computed) processExpr(item.key, scope);
            if (item.value) processExpr(item.value, scope);
          } else if (item.type === "StaticBlock") {
            processStatements(item.body, scope);
          }
        }
        break;
      case "ChainExpression":
        processExpr(expr.expression, scope);
        break;
      case "ImportExpression":
        processExpr(expr.source, scope);
        break;
      default:
        break;
    }
  };

  const processPattern = (pat: Pattern, scope: Scope): void => {
    switch (pat.type) {
      case "Identifier":
        addReference(pat.name, scope);
        break;
      case "ObjectPattern":
        for (const p of pat.properties) {
          if (p.type === "RestElement") processPattern(p.argument, scope);
          else {
            if (p.computed) processExpr(p.key, scope);
            processPattern(p.value as Pattern, scope);
          }
        }
        break;
      case "ArrayPattern":
        for (const e of pat.elements) {
          if (e) processPattern(e, scope);
        }
        break;
      case "RestElement":
        processPattern(pat.argument, scope);
        break;
      case "AssignmentPattern":
        processPattern(pat.left, scope);
        processExpr(pat.right, scope);
        break;
      case "MemberExpression":
        processExpr(pat as unknown as Expression, scope);
        break;
      default:
        break;
    }
  };

  const processFunctionLike = (
    id: Identifier | null,
    params: ReadonlyArray<Pattern>,
    body: BlockStatement | Expression,
    parentScope: Scope,
    _isAsync: boolean,
  ): void => {
    const fnScope = createScope(parentScope);
    parentScope.children.push(fnScope);

    if (id) addBinding(fnScope, id.name);

    for (const param of params) {
      const names: string[] = [];
      collectBindingNames(param, names);
      for (const n of names) addBinding(fnScope, n);
    }

    if (body.type === "BlockStatement") {
      processStatements(body.body, fnScope);
    } else {
      processExpr(body, fnScope);
    }
  };

  const processStmt = (
    stmt: Statement | ModuleDeclaration,
    scope: Scope,
  ): void => {
    switch (stmt.type) {
      case "VariableDeclaration":
        for (const decl of stmt.declarations) {
          const names: string[] = [];
          collectBindingNames(decl.id, names);
          for (const n of names) addBinding(scope, n);
          if (decl.init) processExpr(decl.init, scope);
        }
        break;
      case "FunctionDeclaration":
        if (stmt.id) addBinding(scope, stmt.id.name);
        processFunctionLike(null, stmt.params, stmt.body, scope, stmt.async);
        break;
      case "ClassDeclaration":
        if (stmt.id) addBinding(scope, stmt.id.name);
        if (stmt.superClass) processExpr(stmt.superClass, scope);
        for (const item of stmt.body.body) {
          if (item.type === "MethodDefinition") {
            if (item.computed) processExpr(item.key, scope);
            processExpr(item.value, scope);
          } else if (item.type === "PropertyDefinition") {
            if (item.computed) processExpr(item.key, scope);
            if (item.value) processExpr(item.value, scope);
          } else if (item.type === "StaticBlock") {
            processStatements(item.body, scope);
          }
        }
        break;
      case "ExpressionStatement":
        processExpr(stmt.expression, scope);
        break;
      case "ReturnStatement":
        if (stmt.argument) processExpr(stmt.argument, scope);
        break;
      case "ThrowStatement":
        processExpr(stmt.argument, scope);
        break;
      case "IfStatement":
        processExpr(stmt.test, scope);
        processStmt(stmt.consequent, scope);
        if (stmt.alternate) processStmt(stmt.alternate, scope);
        break;
      case "WhileStatement":
        processExpr(stmt.test, scope);
        processStmt(stmt.body, scope);
        break;
      case "DoWhileStatement":
        processStmt(stmt.body, scope);
        processExpr(stmt.test, scope);
        break;
      case "ForStatement": {
        if (stmt.init) {
          if (stmt.init.type === "VariableDeclaration") {
            processStmt(stmt.init, scope);
          } else {
            processExpr(stmt.init, scope);
          }
        }
        if (stmt.test) processExpr(stmt.test, scope);
        if (stmt.update) processExpr(stmt.update, scope);
        processStmt(stmt.body, scope);
        break;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        if (stmt.left.type === "VariableDeclaration") {
          processStmt(stmt.left, scope);
        } else {
          processPattern(stmt.left as Pattern, scope);
        }
        processExpr(stmt.right, scope);
        processStmt(stmt.body, scope);
        break;
      }
      case "BlockStatement":
        processStatements(stmt.body, scope);
        break;
      case "SwitchStatement":
        processExpr(stmt.discriminant, scope);
        for (const c of stmt.cases) {
          if (c.test) processExpr(c.test, scope);
          processStatements(c.consequent, scope);
        }
        break;
      case "TryStatement":
        processStatements(stmt.block.body, scope);
        if (stmt.handler) {
          const catchScope = createScope(scope);
          scope.children.push(catchScope);
          if (stmt.handler.param) {
            const names: string[] = [];
            collectBindingNames(stmt.handler.param, names);
            for (const n of names) addBinding(catchScope, n);
          }
          processStatements(stmt.handler.body.body, catchScope);
        }
        if (stmt.finalizer) processStatements(stmt.finalizer.body, scope);
        break;
      case "LabeledStatement":
        processStmt(stmt.body, scope);
        break;
      case "WithStatement":
        processExpr(stmt.object, scope);
        processStmt(stmt.body, scope);
        break;
      case "ExportNamedDeclaration":
        if (stmt.declaration) {
          processStmt(stmt.declaration, scope);
          // Mark declared names as exported
          if (stmt.declaration.type === "VariableDeclaration") {
            for (const d of stmt.declaration.declarations) {
              const names: string[] = [];
              collectBindingNames(d.id, names);
              for (const n of names) scope.isExported.add(n);
            }
          } else if (
            stmt.declaration.type === "FunctionDeclaration" &&
            stmt.declaration.id
          ) {
            scope.isExported.add(stmt.declaration.id.name);
          } else if (
            stmt.declaration.type === "ClassDeclaration" &&
            stmt.declaration.id
          ) {
            scope.isExported.add(stmt.declaration.id.name);
          }
        }
        for (const spec of stmt.specifiers) {
          const localName =
            spec.local.type === "Identifier" ? spec.local.name : "";
          if (localName) scope.isExported.add(localName);
          addReference(localName, scope);
        }
        break;
      case "ExportDefaultDeclaration":
        if (
          stmt.declaration.type === "FunctionDeclaration" ||
          stmt.declaration.type === "ClassDeclaration"
        ) {
          processStmt(stmt.declaration, scope);
          if (stmt.declaration.id) {
            scope.isExported.add(stmt.declaration.id.name);
          }
        } else {
          processExpr(stmt.declaration as Expression, scope);
        }
        break;
      case "ImportDeclaration":
        for (const spec of stmt.specifiers) {
          addBinding(scope, spec.local.name);
          scope.isExported.add(spec.local.name); // imports shouldn't be renamed
        }
        break;
      default:
        break;
    }
  };

  processStatements(ast.body, globalScope);
  return globalScope;
};

/**
 * Build a rename map from scope bindings.
 */
const buildRenameMap = (
  scope: Scope,
  reserved: Set<string>,
  allUsedNames: Set<string>,
): Map<string, string> => {
  const renameMap = new Map<string, string>();

  if (scopeHasEval(scope)) {
    // Don't rename anything in scopes containing eval
    for (const child of scope.children) {
      const childMap = buildRenameMap(child, reserved, allUsedNames);
      for (const [k, v] of childMap) renameMap.set(k, v);
    }
    return renameMap;
  }

  // Sort bindings by frequency (most used first) for shortest names
  const entries = [...scope.bindings.entries()]
    .filter(
      ([name]) =>
        !scope.isExported.has(name) &&
        !reserved.has(name) &&
        !GLOBALS.has(name) &&
        !JS_RESERVED.has(name),
    )
    .sort((a, b) => b[1] - a[1]);

  let nameIndex = 0;
  for (const [originalName] of entries) {
    let shortName: string;
    do {
      shortName = generateName(nameIndex);
      nameIndex++;
    } while (
      reserved.has(shortName) ||
      JS_RESERVED.has(shortName) ||
      GLOBALS.has(shortName) ||
      allUsedNames.has(shortName) ||
      scope.bindings.has(shortName) // avoid collision with existing bindings
    );
    renameMap.set(originalName, shortName);
    allUsedNames.add(shortName);
  }

  // Process child scopes
  for (const child of scope.children) {
    const childUsed = new Set(allUsedNames);
    const childMap = buildRenameMap(child, reserved, childUsed);
    for (const [k, v] of childMap) renameMap.set(k, v);
  }

  return renameMap;
};

/**
 * Apply rename map to the AST.
 */
const applyRenames = (
  ast: Program,
  renameMap: Map<string, string>,
  propertyRenames: Map<string, string> | null,
): Program => {
  const renameExpr = (expr: Expression): Expression => {
    switch (expr.type) {
      case "Identifier": {
        const newName = renameMap.get(expr.name);
        if (newName) return { ...expr, name: newName };
        return expr;
      }
      case "MemberExpression": {
        const object =
          expr.object.type === "Super" ? expr.object : renameExpr(expr.object);
        let property = expr.property;
        if (expr.computed) {
          property = renameExpr(property);
        } else if (
          propertyRenames &&
          property.type === "Identifier" &&
          propertyRenames.has(property.name)
        ) {
          property = {
            ...property,
            name: propertyRenames.get(property.name)!,
          };
        }
        return { ...expr, object, property };
      }
      case "CallExpression": {
        const callee =
          expr.callee.type === "Super" ? expr.callee : renameExpr(expr.callee);
        const args = expr.arguments.map((a) =>
          a.type === "SpreadElement"
            ? { ...a, argument: renameExpr(a.argument) }
            : renameExpr(a),
        );
        return { ...expr, callee, arguments: args };
      }
      case "AssignmentExpression": {
        const left = renamePattern(expr.left as Pattern) as typeof expr.left;
        const right = renameExpr(expr.right);
        return { ...expr, left, right };
      }
      case "BinaryExpression":
      case "LogicalExpression": {
        const left = renameExpr(expr.left);
        const right = renameExpr(expr.right);
        return { ...expr, left, right };
      }
      case "UnaryExpression": {
        const argument = renameExpr(expr.argument);
        return { ...expr, argument };
      }
      case "UpdateExpression": {
        const argument = renameExpr(expr.argument);
        return { ...expr, argument };
      }
      case "ConditionalExpression": {
        const test = renameExpr(expr.test);
        const consequent = renameExpr(expr.consequent);
        const alternate = renameExpr(expr.alternate);
        return { ...expr, test, consequent, alternate };
      }
      case "SequenceExpression": {
        const expressions = expr.expressions.map(renameExpr);
        return { ...expr, expressions };
      }
      case "ArrayExpression": {
        const elements = expr.elements.map((e) => {
          if (e === null) return null;
          if (e.type === "SpreadElement")
            return { ...e, argument: renameExpr(e.argument) };
          return renameExpr(e);
        });
        return { ...expr, elements };
      }
      case "ObjectExpression": {
        const properties = expr.properties.map((p) => {
          if (p.type === "SpreadElement")
            return { ...p, argument: renameExpr(p.argument) };
          let key = p.computed ? renameExpr(p.key) : p.key;
          if (
            !p.computed &&
            propertyRenames &&
            key.type === "Identifier" &&
            propertyRenames.has(key.name)
          ) {
            key = { ...key, name: propertyRenames.get(key.name)! };
          }
          const value = renameExpr(p.value as Expression);
          // Update shorthand flag
          const shorthand =
            p.shorthand &&
            key.type === "Identifier" &&
            value.type === "Identifier" &&
            key.name === value.name;
          return { ...p, key, value, shorthand };
        });
        return { ...expr, properties };
      }
      case "ArrowFunctionExpression": {
        const params = expr.params.map(renamePattern);
        const body =
          expr.body.type === "BlockStatement"
            ? renameBlock(expr.body)
            : renameExpr(expr.body as Expression);
        return { ...expr, params, body };
      }
      case "FunctionExpression": {
        const id = expr.id ? (renameExpr(expr.id) as Identifier) : null;
        const params = expr.params.map(renamePattern);
        const body = renameBlock(expr.body);
        return { ...expr, id, params, body };
      }
      case "NewExpression": {
        const callee = renameExpr(expr.callee);
        const args = expr.arguments.map((a) =>
          a.type === "SpreadElement"
            ? { ...a, argument: renameExpr(a.argument) }
            : renameExpr(a),
        );
        return { ...expr, callee, arguments: args };
      }
      case "TemplateLiteral": {
        const expressions = expr.expressions.map(renameExpr);
        return { ...expr, expressions };
      }
      case "TaggedTemplateExpression": {
        const tag = renameExpr(expr.tag);
        const quasi = {
          ...expr.quasi,
          expressions: expr.quasi.expressions.map(renameExpr),
        };
        return { ...expr, tag, quasi };
      }
      case "YieldExpression": {
        const argument = expr.argument ? renameExpr(expr.argument) : null;
        return { ...expr, argument };
      }
      case "AwaitExpression": {
        const argument = renameExpr(expr.argument);
        return { ...expr, argument };
      }
      case "ClassExpression": {
        const id = expr.id ? (renameExpr(expr.id) as Identifier) : null;
        const superClass = expr.superClass ? renameExpr(expr.superClass) : null;
        const body = {
          ...expr.body,
          body: expr.body.body.map((item) => {
            if (item.type === "MethodDefinition") {
              const key = item.computed ? renameExpr(item.key) : item.key;
              const value = renameExpr(item.value) as typeof item.value;
              return { ...item, key, value };
            }
            if (item.type === "PropertyDefinition") {
              const key = item.computed ? renameExpr(item.key) : item.key;
              const value = item.value ? renameExpr(item.value) : null;
              return { ...item, key, value };
            }
            if (item.type === "StaticBlock") {
              return {
                ...item,
                body: item.body.map(renameStmt),
              };
            }
            return item;
          }),
        };
        return { ...expr, id, superClass, body };
      }
      case "ChainExpression": {
        const expression = renameExpr(
          expr.expression,
        ) as typeof expr.expression;
        return { ...expr, expression };
      }
      case "ImportExpression": {
        const source = renameExpr(expr.source);
        return { ...expr, source };
      }
      default:
        return expr;
    }
  };

  const renamePattern = (pat: Pattern): Pattern => {
    switch (pat.type) {
      case "Identifier": {
        const newName = renameMap.get(pat.name);
        if (newName) return { ...pat, name: newName };
        return pat;
      }
      case "ObjectPattern": {
        const properties = pat.properties.map((p) => {
          if (p.type === "RestElement") {
            return { ...p, argument: renamePattern(p.argument) };
          }
          const key = p.computed ? renameExpr(p.key) : p.key;
          const value = renamePattern(p.value as Pattern);
          const shorthand =
            p.shorthand &&
            key.type === "Identifier" &&
            value.type === "Identifier" &&
            key.name === value.name;
          return { ...p, key, value, shorthand };
        });
        return { ...pat, properties };
      }
      case "ArrayPattern": {
        const elements = pat.elements.map((e) => (e ? renamePattern(e) : null));
        return { ...pat, elements };
      }
      case "RestElement": {
        const argument = renamePattern(pat.argument);
        return { ...pat, argument };
      }
      case "AssignmentPattern": {
        const left = renamePattern(pat.left);
        const right = renameExpr(pat.right);
        return { ...pat, left, right };
      }
      case "MemberExpression": {
        return renameExpr(pat as unknown as Expression) as unknown as Pattern;
      }
      default:
        return pat;
    }
  };

  const renameBlock = (block: BlockStatement): BlockStatement => {
    const body = block.body.map(renameStmt);
    return { ...block, body };
  };

  const renameStmt = (stmt: Statement): Statement => {
    switch (stmt.type) {
      case "ExpressionStatement":
        return { ...stmt, expression: renameExpr(stmt.expression) };
      case "ReturnStatement":
        return {
          ...stmt,
          argument: stmt.argument ? renameExpr(stmt.argument) : null,
        };
      case "ThrowStatement":
        return { ...stmt, argument: renameExpr(stmt.argument) };
      case "VariableDeclaration": {
        const declarations = stmt.declarations.map((d) => ({
          ...d,
          id: renamePattern(d.id),
          init: d.init ? renameExpr(d.init) : null,
        }));
        return { ...stmt, declarations };
      }
      case "FunctionDeclaration": {
        const id = stmt.id ? (renameExpr(stmt.id) as Identifier) : null;
        const params = stmt.params.map(renamePattern);
        const body = renameBlock(stmt.body);
        return { ...stmt, id, params, body };
      }
      case "ClassDeclaration": {
        const id = stmt.id ? (renameExpr(stmt.id) as Identifier) : null;
        const superClass = stmt.superClass ? renameExpr(stmt.superClass) : null;
        const body = {
          ...stmt.body,
          body: stmt.body.body.map((item) => {
            if (item.type === "MethodDefinition") {
              const key = item.computed ? renameExpr(item.key) : item.key;
              const value = renameExpr(item.value) as typeof item.value;
              return { ...item, key, value };
            }
            if (item.type === "PropertyDefinition") {
              const key = item.computed ? renameExpr(item.key) : item.key;
              const value = item.value ? renameExpr(item.value) : null;
              return { ...item, key, value };
            }
            if (item.type === "StaticBlock") {
              return {
                ...item,
                body: item.body.map(renameStmt),
              };
            }
            return item;
          }),
        };
        return { ...stmt, id, superClass, body };
      }
      case "IfStatement": {
        const test = renameExpr(stmt.test);
        const consequent = renameStmt(stmt.consequent);
        const alternate = stmt.alternate ? renameStmt(stmt.alternate) : null;
        return { ...stmt, test, consequent, alternate };
      }
      case "WhileStatement": {
        const test = renameExpr(stmt.test);
        const body = renameStmt(stmt.body);
        return { ...stmt, test, body };
      }
      case "DoWhileStatement": {
        const body = renameStmt(stmt.body);
        const test = renameExpr(stmt.test);
        return { ...stmt, body, test };
      }
      case "ForStatement": {
        let init = stmt.init;
        if (init) {
          if (init.type === "VariableDeclaration") {
            init = renameStmt(init) as VariableDeclaration;
          } else {
            init = renameExpr(init);
          }
        }
        const test = stmt.test ? renameExpr(stmt.test) : null;
        const update = stmt.update ? renameExpr(stmt.update) : null;
        const body = renameStmt(stmt.body);
        return { ...stmt, init, test, update, body };
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const left =
          stmt.left.type === "VariableDeclaration"
            ? (renameStmt(stmt.left) as VariableDeclaration)
            : (renamePattern(stmt.left as Pattern) as typeof stmt.left);
        const right = renameExpr(stmt.right);
        const body = renameStmt(stmt.body);
        return { ...stmt, left, right, body };
      }
      case "BlockStatement":
        return renameBlock(stmt);
      case "SwitchStatement": {
        const discriminant = renameExpr(stmt.discriminant);
        const cases = stmt.cases.map((c) => ({
          ...c,
          test: c.test ? renameExpr(c.test) : null,
          consequent: c.consequent.map(renameStmt),
        }));
        return { ...stmt, discriminant, cases };
      }
      case "TryStatement": {
        const block = renameBlock(stmt.block);
        const handler = stmt.handler
          ? {
              ...stmt.handler,
              param: stmt.handler.param
                ? renamePattern(stmt.handler.param)
                : null,
              body: renameBlock(stmt.handler.body),
            }
          : null;
        const finalizer = stmt.finalizer ? renameBlock(stmt.finalizer) : null;
        return { ...stmt, block, handler, finalizer };
      }
      case "LabeledStatement": {
        const body = renameStmt(stmt.body);
        return { ...stmt, body };
      }
      case "WithStatement": {
        const object = renameExpr(stmt.object);
        const body = renameStmt(stmt.body);
        return { ...stmt, object, body };
      }
      default:
        return stmt;
    }
  };

  const body = ast.body.map((stmt): Statement | ModuleDeclaration => {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        return {
          ...stmt,
          declaration: renameStmt(stmt.declaration) as Declaration,
        };
      }
      // For re-exports with specifiers, rename local references
      const specifiers = stmt.specifiers.map((s) => {
        const local =
          s.local.type === "Identifier" && renameMap.has(s.local.name)
            ? { ...s.local, name: renameMap.get(s.local.name)! }
            : s.local;
        return { ...s, local };
      });
      return { ...stmt, specifiers };
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      if (
        stmt.declaration.type === "FunctionDeclaration" ||
        stmt.declaration.type === "ClassDeclaration"
      ) {
        return {
          ...stmt,
          declaration: renameStmt(stmt.declaration) as Declaration,
        };
      }
      return {
        ...stmt,
        declaration: renameExpr(stmt.declaration as Expression),
      };
    }
    if (stmt.type === "ImportDeclaration") {
      return stmt; // imports are not renamed
    }
    if (stmt.type === "ExportAllDeclaration") {
      return stmt;
    }
    return renameStmt(stmt as Statement);
  });

  return { ...ast, body };
};

/**
 * Build property rename map for property mangling.
 */
const buildPropertyRenames = (
  ast: Program,
  pattern: RegExp,
): Map<string, string> => {
  const props = new Map<string, number>(); // name -> count

  const collectFromExpr = (expr: Expression): void => {
    if (expr.type === "MemberExpression" && !expr.computed) {
      if (
        expr.property.type === "Identifier" &&
        pattern.test(expr.property.name)
      ) {
        props.set(expr.property.name, (props.get(expr.property.name) ?? 0) + 1);
      }
    }
    // Note: a full walk would collect more, but this is sufficient for the basic case
  };

  // Simple walk to collect properties - we just need names, not full traversal
  const walkStmt = (stmt: Statement | ModuleDeclaration): void => {
    JSON.stringify(stmt, (_key, val) => {
      if (
        val &&
        typeof val === "object" &&
        val.type === "MemberExpression" &&
        !val.computed &&
        val.property?.type === "Identifier" &&
        pattern.test(val.property.name)
      ) {
        props.set(val.property.name, (props.get(val.property.name) ?? 0) + 1);
      }
      if (
        val &&
        typeof val === "object" &&
        val.type === "Property" &&
        !val.computed &&
        val.key?.type === "Identifier" &&
        pattern.test(val.key.name)
      ) {
        props.set(val.key.name, (props.get(val.key.name) ?? 0) + 1);
      }
      return val;
    });
  };

  for (const stmt of ast.body) {
    walkStmt(stmt);
  }

  // Sort by frequency and assign short names
  const sorted = [...props.entries()].sort((a, b) => b[1] - a[1]);
  const renameMap = new Map<string, string>();
  let idx = 0;

  for (const [name] of sorted) {
    let shortName: string;
    do {
      shortName = generateName(idx);
      idx++;
    } while (JS_RESERVED.has(shortName) || GLOBALS.has(shortName));
    renameMap.set(name, shortName);
  }

  return renameMap;
};

/**
 * Mangle variable names in the AST.
 *
 * @param ast - The parsed Program AST
 * @param options - Mangling options
 * @returns A new Program with mangled names
 */
export const mangleNames = (ast: Program, options?: MangleOptions): Program => {
  const reserved = new Set([...(options?.reserved ?? [])]);

  const globalScope = buildScopes(ast);

  // We only mangle non-global scopes (function/block scopes)
  // The global scope bindings in a module are also local, but we treat
  // top-level differently for safety
  const allUsedNames = new Set<string>();
  const renameMap = new Map<string, string>();

  // Process child scopes (functions, blocks) for renaming
  for (const child of globalScope.children) {
    const childUsed = new Set(allUsedNames);
    const childMap = buildRenameMap(child, reserved, childUsed);
    for (const [k, v] of childMap) renameMap.set(k, v);
    for (const n of childUsed) allUsedNames.add(n);
  }

  // Property mangling
  let propertyRenames: Map<string, string> | null = null;
  if (options?.mangleProperties) {
    const pattern = options.propertyPattern ?? /^_/;
    propertyRenames = buildPropertyRenames(ast, pattern);
  }

  if (renameMap.size === 0 && !propertyRenames) return ast;

  return applyRenames(ast, renameMap, propertyRenames);
};
