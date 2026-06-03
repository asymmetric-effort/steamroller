/**
 * @module transforms/downlevel
 * @description AST-based syntax downleveling for older JavaScript engines.
 * Parses the code into an ESTree-compatible AST and applies position-preserving
 * edits via MagicString.
 *
 * Supported targets:
 * - "es5": arrow functions, template literals, const/let, default parameters,
 *          rest parameters, shorthand properties, spread in arrays/calls
 * - "es2015": nullish coalescing (??), optional chaining (?.), logical assignment,
 *             numeric separators
 */

import type {
  BaseNode,
  ArrowFunctionExpression,
  AssignmentExpression,
  CallExpression,
  ChainExpression,
  LogicalExpression,
  MemberExpression,
  NewExpression,
  ObjectExpression,
  Property,
  SpreadElement,
  TemplateLiteral,
  VariableDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  Literal,
  ArrayExpression,
  RestElement,
  AssignmentPattern,
  Identifier,
} from "../ast/types.js";
import { parseAst } from "../parse-ast.js";
import { MagicString } from "../sourcemap/magic-string.js";

/** Valid downlevel target strings. */
export type DownlevelTarget = "es5" | "es2015" | "es2016" | "es2017" | "esnext";

/** Counter for generating unique temp variable names. */
let tempVarCounter = 0;

/** Generate a unique temp variable name. */
const genTemp = (): string => {
  return `_tmp${tempVarCounter++}`;
};

/**
 * Collect all nodes in the AST using an iterative stack-based walk.
 * Returns nodes in a flat array suitable for processing.
 */
const collectNodes = (
  ast: BaseNode,
): Array<{ node: BaseNode; parent: BaseNode | null }> => {
  const results: Array<{ node: BaseNode; parent: BaseNode | null }> = [];
  const stack: Array<{ node: BaseNode; parent: BaseNode | null }> = [
    { node: ast, parent: null },
  ];

  while (stack.length > 0) {
    const item = stack.pop()!;
    results.push(item);

    const node = item.node as unknown as Record<string, unknown>;
    // Push children in reverse order so they are processed left-to-right
    const children: Array<{ node: BaseNode; parent: BaseNode }> = [];
    for (const key of Object.keys(node)) {
      if (
        key === "type" ||
        key === "start" ||
        key === "end" ||
        key === "loc" ||
        key === "leadingComments" ||
        key === "trailingComments"
      ) {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child !== null && typeof child === "object" && "type" in child) {
            children.push({
              node: child as BaseNode,
              parent: item.node as BaseNode,
            });
          }
        }
      } else if (
        value !== null &&
        typeof value === "object" &&
        "type" in (value as Record<string, unknown>)
      ) {
        children.push({
          node: value as BaseNode,
          parent: item.node as BaseNode,
        });
      }
    }
    // Reverse so left-to-right children are popped first
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  return results;
};

/**
 * Check if a node or any of its descendants reference `this` or `arguments`.
 */
const referencesThisOrArguments = (node: BaseNode): boolean => {
  const stack: BaseNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === "ThisExpression") return true;
    if (
      current.type === "Identifier" &&
      (current as Identifier).name === "arguments"
    )
      return true;
    // Don't descend into nested non-arrow functions (they have their own this/arguments)
    if (
      current.type === "FunctionExpression" ||
      current.type === "FunctionDeclaration"
    ) {
      continue;
    }
    const rec = current as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") {
        continue;
      }
      const value = rec[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child !== null && typeof child === "object" && "type" in child) {
            stack.push(child as BaseNode);
          }
        }
      } else if (
        value !== null &&
        typeof value === "object" &&
        "type" in (value as Record<string, unknown>)
      ) {
        stack.push(value as BaseNode);
      }
    }
  }
  return false;
};

/**
 * Get the source text of a node from the original code.
 */
const src = (code: string, node: BaseNode): string => {
  return code.slice(node.start, node.end);
};

/**
 * A segment in a flattened optional chain.
 */
interface ChainSegment {
  /** Whether this link uses ?. */
  optional: boolean;
  /** "member", "computed", or "call" */
  kind: "member" | "computed" | "call";
  /** For member/computed: the property source text. For call: the args source text. */
  detail: string;
}

/**
 * Flatten a chain expression into its root object + list of segments.
 * For a?.b?.c(), we get root="a", segments=[{optional:true, member, "b"}, {optional:true, member, "c"}, {optional:false, call, ""}]
 */
const flattenChain = (
  code: string,
  node: MemberExpression | CallExpression,
): { root: string; segments: ChainSegment[] } => {
  const segments: ChainSegment[] = [];
  let current: BaseNode = node;

  while (
    current.type === "MemberExpression" ||
    current.type === "CallExpression"
  ) {
    if (current.type === "MemberExpression") {
      const mem = current as MemberExpression;
      const propText = mem.computed
        ? `[${src(code, mem.property)}]`
        : `.${src(code, mem.property)}`;
      segments.push({
        optional: mem.optional,
        kind: mem.computed ? "computed" : "member",
        detail: propText,
      });
      current = mem.object as BaseNode;
    } else {
      const call = current as CallExpression;
      const argsText = call.arguments
        .map((a) => src(code, a as BaseNode))
        .join(", ");
      segments.push({
        optional: call.optional,
        kind: "call",
        detail: `(${argsText})`,
      });
      current = call.callee as BaseNode;
    }
  }

  // segments are in reverse order (innermost first), reverse them
  segments.reverse();
  return { root: src(code, current), segments };
};

/**
 * Build the replacement for a chain expression.
 * For a?.b?.c: a === null || a === void 0 ? void 0 : a.b === null || a.b === void 0 ? void 0 : a.b.c
 */
const transformChainExpression = (
  code: string,
  node: ChainExpression,
): string => {
  const { root, segments } = flattenChain(code, node.expression);

  // Build progressively longer expressions, wrapping at each optional point
  let result = root;
  let builtSoFar = root;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.optional) {
      // Everything after this optional point (including this segment and further ones)
      // should be guarded by a null check on builtSoFar
      const guarded = builtSoFar;

      // Build the "success" continuation: the current access + everything after
      let continuation = builtSoFar + seg.detail;
      for (let j = i + 1; j < segments.length; j++) {
        const nextSeg = segments[j];
        if (nextSeg.optional) {
          // This will be handled by its own guard, stop here
          // Actually no - we need to build the full expression and nest the guards
          break;
        }
        continuation += nextSeg.detail;
      }

      // Find how many non-optional segments follow immediately
      let consecutiveEnd = i + 1;
      while (
        consecutiveEnd < segments.length &&
        !segments[consecutiveEnd].optional
      ) {
        consecutiveEnd++;
      }

      // The "success" path includes the current segment + all following non-optional ones
      let successPath = builtSoFar + seg.detail;
      for (let j = i + 1; j < consecutiveEnd; j++) {
        successPath += segments[j].detail;
      }

      if (consecutiveEnd >= segments.length) {
        // No more optional segments after this group
        result = `${guarded} === null || ${guarded} === void 0 ? void 0 : ${successPath}`;
        builtSoFar = successPath;
        // Skip the non-optional segments we already included
        i = consecutiveEnd - 1;
      } else {
        // More optional segments follow - we need nesting
        // For now, set up the guard and continue building
        result = `${guarded} === null || ${guarded} === void 0 ? void 0 : ${successPath}`;
        builtSoFar = successPath;
        i = consecutiveEnd - 1;
      }
    } else {
      builtSoFar += seg.detail;
      result = builtSoFar;
    }
  }

  return result;
};

// ---- ES2015-target transforms ----

/**
 * Transform nullish coalescing: a ?? b
 * Uses temp var to avoid double evaluation of left side.
 */
const transformNullishCoalescing = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  // Process innermost first (reverse order gives us depth-first, process bottom-up)
  const logicals = nodes
    .filter(
      ({ node }) =>
        node.type === "LogicalExpression" &&
        (node as LogicalExpression).operator === "??",
    )
    .reverse();

  for (const { node } of logicals) {
    const expr = node as LogicalExpression;
    const leftSrc = src(code, expr.left);
    const rightSrc = src(code, expr.right);
    const tmp = genTemp();
    const replacement = `(${tmp} = ${leftSrc}) !== null && ${tmp} !== void 0 ? ${tmp} : ${rightSrc}`;
    ms.overwrite(expr.start, expr.end, replacement);
  }
};

/**
 * Transform optional chaining: a?.b, a?.[b], a?.b()
 */
const transformOptionalChaining = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  // Process innermost first
  const chains = nodes
    .filter(({ node }) => node.type === "ChainExpression")
    .reverse();

  for (const { node } of chains) {
    const chainNode = node as ChainExpression;
    const replacement = transformChainExpression(code, chainNode);
    ms.overwrite(chainNode.start, chainNode.end, replacement);
  }
};

/**
 * Transform logical assignment: a ??= b, a &&= b, a ||= b
 */
const transformLogicalAssignment = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const assignments = nodes
    .filter(
      ({ node }) =>
        node.type === "AssignmentExpression" &&
        ["??=", "&&=", "||="].includes((node as AssignmentExpression).operator),
    )
    .reverse();

  for (const { node } of assignments) {
    const expr = node as AssignmentExpression;
    const leftSrc = src(code, expr.left);
    const rightSrc = src(code, expr.right);

    let replacement: string;
    if (expr.operator === "??=") {
      replacement = `${leftSrc} !== null && ${leftSrc} !== void 0 ? ${leftSrc} : (${leftSrc} = ${rightSrc})`;
    } else if (expr.operator === "||=") {
      replacement = `${leftSrc} || (${leftSrc} = ${rightSrc})`;
    } else {
      // &&=
      replacement = `${leftSrc} && (${leftSrc} = ${rightSrc})`;
    }
    ms.overwrite(expr.start, expr.end, replacement);
  }
};

/**
 * Transform numeric separators: 1_000_000 -> 1000000
 */
const transformNumericSeparators = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const literals = nodes.filter(
    ({ node }) =>
      node.type === "Literal" &&
      typeof (node as Literal).value === "number" &&
      (node as Literal).raw !== undefined &&
      (node as Literal).raw!.includes("_"),
  );

  for (const { node } of literals) {
    const lit = node as Literal;
    const cleaned = lit.raw!.replace(/_/g, "");
    ms.overwrite(lit.start, lit.end, cleaned);
  }
};

// ---- ES5-target transforms ----

/**
 * Transform arrow functions to regular function expressions.
 * Captures `this` with `var _this = this` when needed.
 */
const transformArrowFunctions = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  // Process deepest arrows first (reverse order)
  const arrows = nodes
    .filter(({ node }) => node.type === "ArrowFunctionExpression")
    .reverse();

  for (const { node } of arrows) {
    const arrow = node as ArrowFunctionExpression;
    const paramsSource = arrow.params.map((p) => src(code, p)).join(", ");
    const asyncPrefix = arrow.async ? "async " : "";

    const needsThisCapture = referencesThisOrArguments(arrow.body);

    let body: string;
    if (arrow.expression) {
      // Expression body: (x) => expr  ->  function(x) { return expr; }
      const bodySource = src(code, arrow.body);
      body = `{ return ${bodySource}; }`;
    } else {
      // Block body: use as-is
      body = src(code, arrow.body);
    }

    if (needsThisCapture) {
      // Wrap in IIFE that captures this
      const replacement = `(function() { var _this = this; return ${asyncPrefix}function(${paramsSource}) ${body.replace(/\bthis\b/g, "_this").replace(/\barguments\b/g, "_arguments")}; }).call(this)`;
      ms.overwrite(arrow.start, arrow.end, replacement);
    } else {
      const replacement = `${asyncPrefix}function(${paramsSource}) ${body}`;
      ms.overwrite(arrow.start, arrow.end, replacement);
    }
  }
};

/**
 * Transform template literals to string concatenation.
 */
const transformTemplateLiterals = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const templates = nodes
    .filter(
      ({ node }) =>
        node.type === "TemplateLiteral" &&
        // Skip tagged templates - those are handled differently
        true,
    )
    .reverse();

  for (const { node, parent } of templates) {
    // Skip if this is part of a TaggedTemplateExpression
    if (parent && parent.type === "TaggedTemplateExpression") {
      continue;
    }
    const tmpl = node as TemplateLiteral;
    const parts: string[] = [];

    for (let i = 0; i < tmpl.quasis.length; i++) {
      const quasi = tmpl.quasis[i];
      const cookedValue = quasi.value.cooked ?? quasi.value.raw;
      if (cookedValue.length > 0) {
        parts.push(JSON.stringify(cookedValue));
      }
      if (i < tmpl.expressions.length) {
        const exprSrc = src(code, tmpl.expressions[i]);
        parts.push(exprSrc);
      }
    }

    const replacement = parts.length === 0 ? '""' : parts.join(" + ");
    ms.overwrite(tmpl.start, tmpl.end, replacement);
  }
};

/**
 * Transform const/let to var.
 */
const transformConstLetToVar = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const declarations = nodes.filter(
    ({ node }) =>
      node.type === "VariableDeclaration" &&
      ((node as VariableDeclaration).kind === "const" ||
        (node as VariableDeclaration).kind === "let"),
  );

  for (const { node } of declarations) {
    const decl = node as VariableDeclaration;
    // Replace just the keyword. The keyword is at the start of the node.
    const keyword = decl.kind; // "const" or "let"
    const keywordEnd = decl.start + keyword.length;
    ms.overwrite(decl.start, keywordEnd, "var");
  }
};

/**
 * Transform default parameters.
 * function f(a, b = 1) -> function f(a, b) { if (b === void 0) b = 1; ... }
 */
const transformDefaultParameters = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const funcs = nodes.filter(
    ({ node }) =>
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression") &&
      (node as FunctionDeclaration | FunctionExpression).params.some(
        (p) => p.type === "AssignmentPattern",
      ),
  );

  for (const { node } of funcs) {
    const func = node as FunctionDeclaration | FunctionExpression;
    const defaults: Array<{ name: string; value: string }> = [];
    const cleanParams: string[] = [];

    for (const param of func.params) {
      if (param.type === "AssignmentPattern") {
        const ap = param as AssignmentPattern;
        const paramName = src(code, ap.left);
        const defaultValue = src(code, ap.right);
        cleanParams.push(paramName);
        defaults.push({ name: paramName, value: defaultValue });
      } else {
        cleanParams.push(src(code, param));
      }
    }

    // Find the opening paren and closing paren positions
    const funcSource = src(code, func);
    const parenOpen = code.indexOf("(", func.start);
    const bodyStart = func.body.start;

    // Replace params
    const lastParam = func.params[func.params.length - 1];
    ms.overwrite(parenOpen + 1, lastParam.end, cleanParams.join(", "));

    // Find the closing paren - it's between last param end and body start
    let closeParen = lastParam.end;
    while (closeParen < bodyStart && code[closeParen] !== ")") {
      closeParen++;
    }

    // Insert default checks after the opening brace of the body
    const fallbacks = defaults
      .map((d) => ` if (${d.name} === void 0) ${d.name} = ${d.value};`)
      .join("");
    ms.prependRight(bodyStart + 1, fallbacks);
  }
};

/**
 * Transform rest parameters.
 * function f(a, ...args) -> function f(a) { var args = [].slice.call(arguments, 1); }
 */
const transformRestParameters = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const funcs = nodes.filter(
    ({ node }) =>
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression") &&
      (node as FunctionDeclaration | FunctionExpression).params.length > 0 &&
      (node as FunctionDeclaration | FunctionExpression).params[
        (node as FunctionDeclaration | FunctionExpression).params.length - 1
      ].type === "RestElement",
  );

  for (const { node } of funcs) {
    const func = node as FunctionDeclaration | FunctionExpression;
    const params = func.params;
    const restParam = params[params.length - 1] as RestElement;
    const restName = src(code, restParam.argument);
    const otherParams = params.slice(0, -1);
    const restIndex = otherParams.length;

    // Replace the params section
    const parenOpen = code.indexOf("(", func.start);
    const cleanParams = otherParams.map((p) => src(code, p)).join(", ");

    // Overwrite from after '(' to end of last param
    const lastParam = params[params.length - 1];
    ms.overwrite(parenOpen + 1, lastParam.end, cleanParams);

    // Find closing paren
    let closeParen = lastParam.end;
    while (closeParen < func.body.start && code[closeParen] !== ")") {
      closeParen++;
    }

    // Insert rest variable after opening brace of body
    const sliceArg = restIndex > 0 ? `, ${restIndex}` : "";
    const restInit = ` var ${restName} = [].slice.call(arguments${sliceArg});`;
    ms.prependRight(func.body.start + 1, restInit);
  }
};

/**
 * Transform shorthand properties: {x} -> {x: x}
 */
const transformShorthandProperties = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const props = nodes.filter(
    ({ node }) =>
      node.type === "Property" &&
      (node as Property).shorthand &&
      !(node as Property).method,
  );

  for (const { node } of props) {
    const prop = node as Property;
    const keyName = src(code, prop.key);
    ms.overwrite(prop.start, prop.end, `${keyName}: ${keyName}`);
  }
};

/**
 * Transform spread in array literals: [...a, ...b] -> [].concat(a, b)
 */
const transformSpreadInArrays = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  const arrays = nodes
    .filter(
      ({ node }) =>
        node.type === "ArrayExpression" &&
        (node as ArrayExpression).elements.some(
          (el) => el !== null && el.type === "SpreadElement",
        ),
    )
    .reverse();

  for (const { node } of arrays) {
    const arr = node as ArrayExpression;
    const parts: string[] = [];
    let currentLiterals: string[] = [];

    const flushLiterals = (): void => {
      if (currentLiterals.length > 0) {
        parts.push(`[${currentLiterals.join(", ")}]`);
        currentLiterals = [];
      }
    };

    for (const el of arr.elements) {
      if (el === null) {
        currentLiterals.push("");
      } else if (el.type === "SpreadElement") {
        flushLiterals();
        parts.push(src(code, (el as SpreadElement).argument));
      } else {
        currentLiterals.push(src(code, el));
      }
    }
    flushLiterals();

    const replacement = `[].concat(${parts.join(", ")})`;
    ms.overwrite(arr.start, arr.end, replacement);
  }
};

/**
 * Transform spread in function calls: f(...args) -> f.apply(void 0, args)
 * For method calls: o.f(...args) -> o.f.apply(o, args)
 * For new expressions: new F(...args) -> new (Function.prototype.bind.apply(F, [null].concat(args)))()
 */
const transformSpreadInCalls = (
  ms: MagicString,
  code: string,
  nodes: Array<{ node: BaseNode; parent: BaseNode | null }>,
): void => {
  // Handle new expressions with spread
  const newExprs = nodes
    .filter(
      ({ node }) =>
        node.type === "NewExpression" &&
        (node as NewExpression).arguments.some(
          (a) => a.type === "SpreadElement",
        ),
    )
    .reverse();

  for (const { node } of newExprs) {
    const newExpr = node as NewExpression;
    const calleeSrc = src(code, newExpr.callee);
    const argParts = buildSpreadArgs(
      code,
      newExpr.arguments as Array<BaseNode | SpreadElement>,
    );
    const replacement = `new (Function.prototype.bind.apply(${calleeSrc}, [null].concat(${argParts})))()`;
    ms.overwrite(newExpr.start, newExpr.end, replacement);
  }

  // Handle regular calls with spread
  const calls = nodes
    .filter(
      ({ node }) =>
        node.type === "CallExpression" &&
        !(node as CallExpression).optional &&
        (node as CallExpression).arguments.some(
          (a) => a.type === "SpreadElement",
        ),
    )
    .reverse();

  for (const { node } of calls) {
    const call = node as CallExpression;
    const args = call.arguments;

    // Simple case: single spread argument
    if (args.length === 1 && args[0].type === "SpreadElement") {
      const spreadArg = src(code, (args[0] as SpreadElement).argument);
      if (call.callee.type === "MemberExpression") {
        const memExpr = call.callee as MemberExpression;
        const objSrc = src(code, memExpr.object as BaseNode);
        const calleeSrc = src(code, call.callee);
        ms.overwrite(
          call.start,
          call.end,
          `${calleeSrc}.apply(${objSrc}, ${spreadArg})`,
        );
      } else {
        const calleeSrc = src(code, call.callee as BaseNode);
        ms.overwrite(
          call.start,
          call.end,
          `${calleeSrc}.apply(void 0, ${spreadArg})`,
        );
      }
    } else {
      // Multiple args with spread mixed in
      const argParts = buildSpreadArgs(
        code,
        args as Array<BaseNode | SpreadElement>,
      );
      if (call.callee.type === "MemberExpression") {
        const memExpr = call.callee as MemberExpression;
        const objSrc = src(code, memExpr.object as BaseNode);
        const calleeSrc = src(code, call.callee);
        ms.overwrite(
          call.start,
          call.end,
          `${calleeSrc}.apply(${objSrc}, [].concat(${argParts}))`,
        );
      } else {
        const calleeSrc = src(code, call.callee as BaseNode);
        ms.overwrite(
          call.start,
          call.end,
          `${calleeSrc}.apply(void 0, [].concat(${argParts}))`,
        );
      }
    }
  }
};

/**
 * Build the argument list for spread transforms, grouping non-spread args into arrays.
 */
const buildSpreadArgs = (
  code: string,
  args: Array<BaseNode | SpreadElement>,
): string => {
  const parts: string[] = [];
  let currentLiterals: string[] = [];

  const flushLiterals = (): void => {
    if (currentLiterals.length > 0) {
      parts.push(`[${currentLiterals.join(", ")}]`);
      currentLiterals = [];
    }
  };

  for (const arg of args) {
    if (arg.type === "SpreadElement") {
      flushLiterals();
      parts.push(src(code, (arg as SpreadElement).argument));
    } else {
      currentLiterals.push(src(code, arg));
    }
  }
  flushLiterals();

  return parts.join(", ");
};

/**
 * Downlevel the given code string to the specified target.
 * Applies AST-based syntax transforms appropriate for the target level.
 *
 * @param code - The bundled output code string
 * @param target - The target ECMAScript version ("es5", "es2015", etc.)
 * @returns The downleveled code string
 */
export const downlevelCode = (code: string, target: string): string => {
  const normalizedTarget = target.toLowerCase();

  // "esnext" or unknown targets: no transforms needed
  if (
    normalizedTarget === "esnext" ||
    (normalizedTarget !== "es5" &&
      normalizedTarget !== "es2015" &&
      normalizedTarget !== "es2016" &&
      normalizedTarget !== "es2017")
  ) {
    return code;
  }

  // Reset temp var counter for deterministic output
  tempVarCounter = 0;

  let currentCode = code;

  // Parse and apply ES2015+ transforms (nullish coalescing, optional chaining, etc.)
  {
    const ast = parseAst(currentCode);
    const ms = new MagicString(currentCode);
    const nodes = collectNodes(ast);

    transformNullishCoalescing(ms, currentCode, nodes);
    transformOptionalChaining(ms, currentCode, nodes);
    transformLogicalAssignment(ms, currentCode, nodes);
    transformNumericSeparators(ms, currentCode, nodes);

    currentCode = ms.toString();
  }

  // ES5: additionally convert ES2015 syntax to ES5 equivalents
  if (normalizedTarget === "es5") {
    const ast = parseAst(currentCode);
    const ms = new MagicString(currentCode);
    const nodes = collectNodes(ast);

    transformArrowFunctions(ms, currentCode, nodes);
    transformTemplateLiterals(ms, currentCode, nodes);
    transformDefaultParameters(ms, currentCode, nodes);
    transformRestParameters(ms, currentCode, nodes);
    transformShorthandProperties(ms, currentCode, nodes);
    transformConstLetToVar(ms, currentCode, nodes);
    transformSpreadInArrays(ms, currentCode, nodes);
    transformSpreadInCalls(ms, currentCode, nodes);

    currentCode = ms.toString();
  }

  return currentCode;
};
