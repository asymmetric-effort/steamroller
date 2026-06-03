/**
 * @module transforms/typescript-transform
 * @description AST-based TypeScript-to-JavaScript transform.
 *
 * Walks the AST produced by the parser and uses MagicString for
 * position-preserving edits to:
 * - Strip type annotations, interfaces, type aliases, type-only imports/exports
 * - Transform enums to IIFE patterns
 * - Transform const enums to inlined constants
 * - Transform namespaces to IIFE-wrapped objects
 * - Transform parameter properties to constructor body assignments
 */

import { MagicString } from "../sourcemap/magic-string.js";
import type * as AST from "../ast/types.js";

/**
 * Collected information about const enum declarations for inlining.
 */
interface ConstEnumInfo {
  readonly members: ReadonlyMap<string, string | number>;
}

/**
 * Helper type for nodes that may include TypeScript-specific types.
 * We use this because TS nodes are not part of the main union types
 * to avoid breaking the rest of the codebase.
 */
interface AnyNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

/**
 * Transform TypeScript AST to JavaScript output string.
 *
 * @param source - The original TypeScript source code.
 * @param ast - The parsed AST Program node.
 * @returns The transformed JavaScript source code.
 */
export const transformTypeScript = (
  source: string,
  ast: AST.Program,
): string => {
  const ms = new MagicString(source);
  const constEnums = new Map<string, ConstEnumInfo>();

  // First pass: collect const enum info for inlining
  collectConstEnums(ast, constEnums);

  // Second pass: transform
  for (const stmt of ast.body) {
    transformNode(ms, stmt as unknown as AnyNode, source, constEnums);
  }

  return ms.toString();
};

/**
 * Collect const enum declarations and their member values.
 */
const collectConstEnums = (
  ast: AST.Program,
  constEnums: Map<string, ConstEnumInfo>,
): void => {
  for (const stmt of ast.body) {
    const node = unwrapExport(stmt as unknown as AnyNode);
    if (node !== null && node.type === "TSEnumDeclaration") {
      const enumNode = node as unknown as AST.TSEnumDeclaration;
      if (enumNode.const) {
        const members = new Map<string, string | number>();
        let autoValue = 0;
        for (const member of enumNode.members) {
          const name =
            member.id.type === "Identifier"
              ? member.id.name
              : String(member.id.value);
          if (member.initializer !== null) {
            if (member.initializer.type === "Literal") {
              const val = member.initializer.value;
              if (typeof val === "number") {
                members.set(name, val);
                autoValue = val + 1;
              } else if (typeof val === "string") {
                members.set(name, val);
              }
            }
          } else {
            members.set(name, autoValue);
            autoValue++;
          }
        }
        constEnums.set(enumNode.id.name, { members });
      }
    }
  }
};

/**
 * Unwrap an export declaration to get the inner declaration.
 */
const unwrapExport = (node: AnyNode): AnyNode | null => {
  if (node.type === "ExportNamedDeclaration") {
    const decl = node["declaration"] as AnyNode | null;
    return decl ?? node;
  }
  return node;
};

/**
 * Transform a single AST node.
 */
const transformNode = (
  ms: MagicString,
  node: AnyNode,
  source: string,
  constEnums: Map<string, ConstEnumInfo>,
): void => {
  switch (node.type) {
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
      // Strip entirely
      ms.overwrite(node.start, node.end, "");
      consumeTrailingSemicolon(ms, source, node.end);
      break;

    case "TSEnumDeclaration":
      transformEnum(
        ms,
        node as unknown as AST.TSEnumDeclaration,
        source,
        false,
      );
      break;

    case "TSModuleDeclaration":
      transformNamespace(
        ms,
        node as unknown as AST.TSModuleDeclaration,
        source,
        false,
        constEnums,
      );
      break;

    case "ExportNamedDeclaration":
      transformExport(ms, node as unknown as AnyNode, source, constEnums);
      break;

    case "ImportDeclaration":
      transformImport(ms, node as unknown as AST.ImportDeclaration, source);
      break;

    case "VariableDeclaration":
      transformVariableDeclaration(
        ms,
        node as unknown as AST.VariableDeclaration,
        source,
      );
      break;

    case "FunctionDeclaration":
      transformFunctionDeclaration(
        ms,
        node as unknown as AST.FunctionDeclaration,
        source,
      );
      break;

    case "ClassDeclaration":
      transformClassDeclaration(
        ms,
        node as unknown as AST.ClassDeclaration,
        source,
      );
      break;

    default:
      // Walk expressions for as/satisfies/non-null
      walkExpressions(ms, node, source, constEnums);
      break;
  }
};

/**
 * Consume a trailing semicolon after a removed node.
 */
const consumeTrailingSemicolon = (
  ms: MagicString,
  source: string,
  pos: number,
): void => {
  let i = pos;
  while (i < source.length && (source[i] === " " || source[i] === "\t")) {
    i++;
  }
  if (i < source.length && source[i] === ";") {
    ms.overwrite(pos, i + 1, "");
  }
};

/**
 * Transform an export declaration.
 */
const transformExport = (
  ms: MagicString,
  node: AnyNode,
  source: string,
  constEnums: Map<string, ConstEnumInfo>,
): void => {
  // Type-only exports: remove entirely
  if (node["exportKind"] === "type") {
    ms.overwrite(node.start, node.end, "");
    consumeTrailingSemicolon(ms, source, node.end);
    return;
  }

  const declaration = node["declaration"] as AnyNode | null;

  if (declaration !== null) {
    switch (declaration.type) {
      case "TSInterfaceDeclaration":
      case "TSTypeAliasDeclaration":
        // Strip entirely
        ms.overwrite(node.start, node.end, "");
        consumeTrailingSemicolon(ms, source, node.end);
        break;

      case "TSEnumDeclaration":
        transformEnum(
          ms,
          declaration as unknown as AST.TSEnumDeclaration,
          source,
          true,
        );
        break;

      case "TSModuleDeclaration":
        transformNamespace(
          ms,
          declaration as unknown as AST.TSModuleDeclaration,
          source,
          true,
          constEnums,
        );
        break;

      default:
        // For other exported declarations (function, class, variable),
        // transform the inner declaration
        transformNode(ms, declaration, source, constEnums);
        break;
    }
  }
};

/**
 * Transform a type-only or regular import.
 */
const transformImport = (
  ms: MagicString,
  node: AST.ImportDeclaration,
  source: string,
): void => {
  if (node.importKind === "type") {
    // Remove the entire import including trailing semicolon
    let end = node.end;
    while (
      end < source.length &&
      (source[end] === " " || source[end] === "\t")
    ) {
      end++;
    }
    if (end < source.length && source[end] === ";") {
      end++;
    }
    ms.overwrite(node.start, end, "");
  }
};

/**
 * Transform enum declaration to IIFE pattern.
 *
 * Input:  enum Color { Red, Green, Blue }
 * Output: var Color; (function(Color) { Color[Color["Red"] = 0] = "Red"; ... })(Color || (Color = {}));
 */
const transformEnum = (
  ms: MagicString,
  node: AST.TSEnumDeclaration,
  _source: string,
  exported: boolean,
): void => {
  // Const enums are stripped entirely (they're inlined at usage sites)
  if (node.const) {
    // Find the real start (might include 'export' keyword)
    const start = exported
      ? findExportKeywordStart(ms.toString(), node.start)
      : node.start;
    ms.overwrite(start, node.end, "");
    return;
  }

  const name = node.id.name;
  let autoValue = 0;
  const assignments: string[] = [];

  for (const member of node.members) {
    const memberName =
      member.id.type === "Identifier"
        ? member.id.name
        : String(member.id.value);

    if (member.initializer !== null) {
      if (
        member.initializer.type === "Literal" &&
        typeof member.initializer.value === "string"
      ) {
        // String enum member
        assignments.push(
          `${name}["${memberName}"] = ${member.initializer.raw};`,
        );
        continue;
      } else if (
        member.initializer.type === "Literal" &&
        typeof member.initializer.value === "number"
      ) {
        autoValue = (member.initializer.value as number) + 1;
        assignments.push(
          `${name}[${name}["${memberName}"] = ${member.initializer.value}] = "${memberName}";`,
        );
        continue;
      }
      // Complex initializer - just use the raw source
      const initText = ms
        .toString()
        .slice(member.initializer.start, member.initializer.end);
      assignments.push(
        `${name}[${name}["${memberName}"] = ${initText}] = "${memberName}";`,
      );
    } else {
      assignments.push(
        `${name}[${name}["${memberName}"] = ${autoValue}] = "${memberName}";`,
      );
      autoValue++;
    }
  }

  const varPrefix = exported ? "export var" : "var";
  const iife = `${varPrefix} ${name}; (function(${name}) { ${assignments.join(" ")} })(${name} || (${name} = {}));`;

  // Find the real start (might include 'export' keyword)
  const start = exported
    ? findExportKeywordStart(ms.toString(), node.start)
    : node.start;
  ms.overwrite(start, node.end, iife);
};

/**
 * Find the start of the 'export' keyword before a declaration.
 */
const findExportKeywordStart = (source: string, declStart: number): number => {
  // Look backwards from declStart for 'export'
  let i = declStart - 1;
  while (i >= 0 && (source[i] === " " || source[i] === "\t")) {
    i--;
  }
  // Check if preceding text is 'export'
  if (i >= 5 && source.slice(i - 5, i + 1) === "export") {
    return i - 5;
  }
  return declStart;
};

/**
 * Transform namespace declaration to IIFE-wrapped object.
 *
 * Input:  namespace Foo { export const x = 1; }
 * Output: var Foo; (function(Foo) { const x = 1; Foo.x = x; })(Foo || (Foo = {}));
 */
const transformNamespace = (
  ms: MagicString,
  node: AST.TSModuleDeclaration,
  _source: string,
  exported: boolean,
  constEnums: Map<string, ConstEnumInfo>,
): void => {
  if (node.declare) {
    const start = exported
      ? findExportKeywordStart(ms.toString(), node.start)
      : node.start;
    ms.overwrite(start, node.end, "");
    return;
  }

  const name =
    node.id.type === "Identifier" ? node.id.name : String(node.id.value);
  const body = node.body;

  if (body.type !== "TSModuleBlock") {
    // Nested namespace - not handled in simple form
    return;
  }

  const block = body as AST.TSModuleBlock;
  const stmts: string[] = [];
  const exportedNames: string[] = [];

  for (const stmt of block.body) {
    const stmtType = stmt.type as string;
    if (stmtType === "ExportNamedDeclaration") {
      const exp = stmt as AST.ExportNamedDeclaration;
      if (exp.declaration !== null) {
        const declType = exp.declaration.type as string;
        if (
          declType === "TSInterfaceDeclaration" ||
          declType === "TSTypeAliasDeclaration"
        ) {
          // Strip type-only declarations
          continue;
        }
        // Get the declaration text without 'export'
        const declText = ms
          .toString()
          .slice(exp.declaration.start, exp.declaration.end);
        stmts.push(declText);

        // Collect exported name
        if (declType === "VariableDeclaration") {
          for (const decl of (exp.declaration as AST.VariableDeclaration)
            .declarations) {
            if (decl.id.type === "Identifier") {
              exportedNames.push(decl.id.name);
            }
          }
        } else if (
          declType === "FunctionDeclaration" &&
          (exp.declaration as AST.FunctionDeclaration).id !== null
        ) {
          exportedNames.push(
            (exp.declaration as AST.FunctionDeclaration).id!.name,
          );
        } else if (
          declType === "ClassDeclaration" &&
          (exp.declaration as AST.ClassDeclaration).id !== null
        ) {
          exportedNames.push(
            (exp.declaration as AST.ClassDeclaration).id!.name,
          );
        }
      }
    } else if (
      stmtType === "TSInterfaceDeclaration" ||
      stmtType === "TSTypeAliasDeclaration"
    ) {
      // Strip
      continue;
    } else {
      const stmtText = ms.toString().slice(stmt.start, stmt.end);
      stmts.push(stmtText);
    }
  }

  const assigns = exportedNames.map((n) => `${name}.${n} = ${n};`).join(" ");
  const bodyCode = stmts.join(" ") + (assigns ? " " + assigns : "");

  const varPrefix = exported ? "export var" : "var";
  const result = `${varPrefix} ${name}; (function(${name}) { ${bodyCode} })(${name} || (${name} = {}));`;

  const start = exported
    ? findExportKeywordStart(ms.toString(), node.start)
    : node.start;
  ms.overwrite(start, node.end, result);
};

/**
 * Transform variable declarations - strip type annotations.
 */
const transformVariableDeclaration = (
  ms: MagicString,
  node: AST.VariableDeclaration,
  source: string,
): void => {
  // Walk for type annotations and expressions
  walkExpressions(ms, node, source, new Map());
};

/**
 * Transform function declarations - strip type annotations, type params, return types.
 */
const transformFunctionDeclaration = (
  ms: MagicString,
  node: AST.FunctionDeclaration,
  source: string,
): void => {
  walkExpressions(ms, node, source, new Map());
};

/**
 * Transform class declarations - strip type annotations, implements clauses, etc.
 */
const transformClassDeclaration = (
  ms: MagicString,
  node: AST.ClassDeclaration,
  source: string,
): void => {
  walkExpressions(ms, node, source, new Map());
};

/**
 * Walk AST nodes looking for TypeScript-specific expressions to transform.
 * This handles TSAsExpression, TSSatisfiesExpression, TSNonNullExpression,
 * and type annotations at any depth.
 */
const walkExpressions = (
  ms: MagicString,
  node: unknown,
  source: string,
  constEnums: Map<string, ConstEnumInfo>,
): void => {
  if (node === null || node === undefined || typeof node !== "object") {
    return;
  }

  const n = node as Record<string, unknown>;
  const nodeType = n["type"] as string | undefined;

  if (nodeType === undefined) {
    return;
  }

  switch (nodeType) {
    case "TSAsExpression": {
      const asNode = node as AST.TSAsExpression;
      // Remove 'as Type' part, keep expression
      const exprEnd = asNode.expression.end;
      ms.overwrite(exprEnd, asNode.end, "");
      walkExpressions(ms, asNode.expression, source, constEnums);
      return;
    }
    case "TSSatisfiesExpression": {
      const satNode = node as AST.TSSatisfiesExpression;
      const exprEnd = satNode.expression.end;
      ms.overwrite(exprEnd, satNode.end, "");
      walkExpressions(ms, satNode.expression, source, constEnums);
      return;
    }
    case "TSNonNullExpression": {
      const nnNode = node as AST.TSNonNullExpression;
      // Remove the '!' - it's at the end
      ms.overwrite(nnNode.expression.end, nnNode.end, "");
      walkExpressions(ms, nnNode.expression, source, constEnums);
      return;
    }
    case "TSTypeAnnotation":
    case "TSTypeParameterDeclaration":
    case "TSTypeParameterInstantiation": {
      const baseNode = node as AST.BaseNode;
      ms.overwrite(baseNode.start, baseNode.end, "");
      return;
    }
    case "TSParameterProperty": {
      const ppNode = node as AST.TSParameterProperty;
      // Replace the whole parameter property with just the parameter name
      const param = ppNode.parameter;
      const paramName =
        param.type === "Identifier"
          ? param.name
          : source.slice(param.start, param.end);
      ms.overwrite(ppNode.start, ppNode.end, paramName);
      return;
    }
    default:
      break;
  }

  // Walk all object properties recursively
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkExpressions(ms, item, source, constEnums);
      }
    } else if (value !== null && typeof value === "object") {
      walkExpressions(ms, value, source, constEnums);
    }
  }
};
