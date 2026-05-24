/**
 * Parser module for declaration statements.
 *
 * Handles parsing of function declarations, class declarations,
 * import declarations, and export declarations into ESTree-compatible
 * AST nodes.
 *
 * @module parser/declarations
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";

/**
 * Extended ImportDeclaration that supports import attributes.
 * ESTree hasn't standardized this yet, so we extend the base type.
 */
export interface ImportAttribute {
  readonly type: "ImportAttribute";
  readonly key: AST.Identifier | AST.Literal;
  readonly value: AST.Literal;
  readonly start: number;
  readonly end: number;
}

/**
 * ImportDeclaration with optional attributes for `import ... with { ... }`.
 */
export interface ImportDeclarationWithAttributes extends AST.ImportDeclaration {
  readonly attributes: ReadonlyArray<ImportAttribute>;
}

/**
 * Parser context providing access to the lexer and sub-parsers.
 *
 * This interface decouples the declarations parser from the full Parser class,
 * enabling testability and avoiding circular dependencies.
 */
export interface ParserContext {
  readonly lexer: Lexer;
  readonly sourceType: "module" | "script";
  parseExpression(): AST.Expression;
  parseAssignmentExpression(): AST.Expression;
  parseStatement(): AST.Statement | AST.ModuleDeclaration;
  parseBlockStatement(): AST.BlockStatement;
}

/**
 * Parse a function declaration.
 *
 * Handles: function name(params) { body }
 *          function* name(params) { body }
 *          async function name(params) { body }
 *          async function* name(params) { body }
 *
 * @param ctx - The parser context.
 * @param isAsync - Whether the function is async.
 * @returns The FunctionDeclaration AST node.
 */
export const parseFunctionDeclaration = (
  ctx: ParserContext,
  isAsync: boolean = false,
): AST.FunctionDeclaration => {
  const start = isAsync
    ? ctx.lexer.token.start - 6 // 'async ' length approximation; we use saved start
    : ctx.lexer.token.start;

  // Consume 'function' keyword
  ctx.lexer.expect(TokenType.Function);

  // Check for generator
  let generator = false;
  if (ctx.lexer.is(TokenType.Star)) {
    generator = true;
    ctx.lexer.next();
  }

  // Parse function name (required for declarations, optional for export default)
  let id: AST.Identifier | null = null;
  if (ctx.lexer.is(TokenType.Identifier)) {
    const nameToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Identifier" as const,
      name: nameToken.value as string,
      start: nameToken.start,
      end: nameToken.end,
    });
  }

  // Parse parameters
  const params = parseParameters(ctx);

  // Save previous context and set async/generator flags for body parsing
  const prevAsync = ctx.lexer.inAsync;
  const prevGenerator = ctx.lexer.inGenerator;
  ctx.lexer.inAsync = isAsync;
  ctx.lexer.inGenerator = generator;

  // Parse body
  const body = ctx.parseBlockStatement();

  // Restore previous context
  ctx.lexer.inAsync = prevAsync;
  ctx.lexer.inGenerator = prevGenerator;

  return Object.freeze({
    type: "FunctionDeclaration" as const,
    id,
    params: Object.freeze(params),
    body,
    generator,
    async: isAsync,
    start,
    end: body.end,
  });
};

/**
 * Parse function parameters.
 *
 * Handles simple identifiers, rest elements (...args), and default values.
 *
 * @param ctx - The parser context.
 * @returns Array of Pattern nodes.
 */
const parseParameters = (ctx: ParserContext): Array<AST.Pattern> => {
  ctx.lexer.expect(TokenType.LeftParen);

  const params: Array<AST.Pattern> = [];

  while (!ctx.lexer.is(TokenType.RightParen) && !ctx.lexer.is(TokenType.EOF)) {
    if (params.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    // Check for rest element
    if (ctx.lexer.is(TokenType.Ellipsis)) {
      const restStart = ctx.lexer.token.start;
      ctx.lexer.next();
      const argToken = ctx.lexer.expect(TokenType.Identifier);
      const argument: AST.Identifier = Object.freeze({
        type: "Identifier" as const,
        name: argToken.value as string,
        start: argToken.start,
        end: argToken.end,
      });
      params.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: restStart,
          end: argument.end,
        }),
      );
      // Rest must be last parameter
      break;
    }

    // Simple identifier
    const paramToken = ctx.lexer.expect(TokenType.Identifier);
    const paramId: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: paramToken.value as string,
      start: paramToken.start,
      end: paramToken.end,
    });

    // Check for default value (use assignment expression to avoid consuming comma)
    if (ctx.lexer.is(TokenType.Equals)) {
      const assignStart = paramId.start;
      ctx.lexer.next();
      const right = ctx.parseAssignmentExpression();
      params.push(
        Object.freeze({
          type: "AssignmentPattern" as const,
          left: paramId,
          right,
          start: assignStart,
          end: right.end,
        }),
      );
    } else {
      params.push(paramId);
    }
  }

  ctx.lexer.expect(TokenType.RightParen);
  return params;
};

/**
 * Parse a class declaration.
 *
 * Handles: class Name { ... }
 *          class Name extends SuperClass { ... }
 *
 * @param ctx - The parser context.
 * @returns The ClassDeclaration AST node.
 */
export const parseClassDeclaration = (
  ctx: ParserContext,
): AST.ClassDeclaration => {
  const start = ctx.lexer.token.start;

  // Consume 'class' keyword
  ctx.lexer.expect(TokenType.Class);

  // Parse class name (optional for export default)
  let id: AST.Identifier | null = null;
  if (ctx.lexer.is(TokenType.Identifier)) {
    const nameToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Identifier" as const,
      name: nameToken.value as string,
      start: nameToken.start,
      end: nameToken.end,
    });
  }

  // Parse extends clause
  let superClass: AST.Expression | null = null;
  if (ctx.lexer.is(TokenType.Extends)) {
    ctx.lexer.next();
    const superToken = ctx.lexer.expect(TokenType.Identifier);
    superClass = Object.freeze({
      type: "Identifier" as const,
      name: superToken.value as string,
      start: superToken.start,
      end: superToken.end,
    });
  }

  // Parse class body
  const body = parseClassBody(ctx);

  return Object.freeze({
    type: "ClassDeclaration" as const,
    id,
    superClass,
    body,
    start,
    end: body.end,
  });
};

/**
 * Parse a class body enclosed in braces.
 *
 * Handles methods, properties, static members, private fields, and static blocks.
 *
 * @param ctx - The parser context.
 * @returns The ClassBody AST node.
 */
const parseClassBody = (ctx: ParserContext): AST.ClassBody => {
  const start = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.LeftBrace);

  const members: Array<
    AST.MethodDefinition | AST.PropertyDefinition | AST.StaticBlock
  > = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    // Skip semicolons in class body
    if (ctx.lexer.is(TokenType.Semicolon)) {
      ctx.lexer.next();
      continue;
    }

    const member = parseClassMember(ctx);
    members.push(member);
  }

  const endToken = ctx.lexer.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "ClassBody" as const,
    body: Object.freeze(members),
    start,
    end: endToken.end,
  });
};

/**
 * Parse a single class member (method, property, or static block).
 *
 * @param ctx - The parser context.
 * @returns A MethodDefinition, PropertyDefinition, or StaticBlock node.
 */
const parseClassMember = (
  ctx: ParserContext,
): AST.MethodDefinition | AST.PropertyDefinition | AST.StaticBlock => {
  const memberStart = ctx.lexer.token.start;
  let isStatic = false;
  let kind: "constructor" | "method" | "get" | "set" = "method";

  // Check for static keyword
  if (ctx.lexer.is(TokenType.Static)) {
    const staticToken = ctx.lexer.next();

    // Static block: static { ... }
    if (ctx.lexer.is(TokenType.LeftBrace)) {
      return parseStaticBlock(ctx, staticToken.start);
    }

    isStatic = true;
  }

  // Check for get/set
  if (ctx.lexer.is(TokenType.Get)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    // If next token is ( then 'get' is the method name, not a getter prefix
    if (
      !ctx.lexer.is(TokenType.LeftParen) &&
      !ctx.lexer.is(TokenType.Equals) &&
      !ctx.lexer.is(TokenType.Semicolon)
    ) {
      kind = "get";
    } else {
      ctx.lexer.restoreState(saved);
    }
  } else if (ctx.lexer.is(TokenType.Set)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    if (
      !ctx.lexer.is(TokenType.LeftParen) &&
      !ctx.lexer.is(TokenType.Equals) &&
      !ctx.lexer.is(TokenType.Semicolon)
    ) {
      kind = "set";
    } else {
      ctx.lexer.restoreState(saved);
    }
  }

  // Parse the key (identifier or private name)
  let key: AST.Expression;
  let computed = false;

  if (ctx.lexer.is(TokenType.Hash)) {
    // Private field/method: #name
    const hashStart = ctx.lexer.token.start;
    ctx.lexer.next();
    const nameToken = ctx.lexer.expect(TokenType.Identifier);
    key = Object.freeze({
      type: "Identifier" as const,
      name: `#${nameToken.value as string}`,
      start: hashStart,
      end: nameToken.end,
    });
  } else if (ctx.lexer.is(TokenType.LeftBracket)) {
    // Computed key: [expr]
    computed = true;
    ctx.lexer.next();
    key = ctx.parseExpression();
    ctx.lexer.expect(TokenType.RightBracket);
  } else if (
    ctx.lexer.is(TokenType.Identifier) ||
    isKeywordToken(ctx.lexer.token.type)
  ) {
    const keyToken = ctx.lexer.next();
    const keyName = keyToken.value as string;
    // Check if this is the constructor
    if (keyName === "constructor" && !isStatic) {
      kind = "constructor";
    }
    key = Object.freeze({
      type: "Identifier" as const,
      name: keyName,
      start: keyToken.start,
      end: keyToken.end,
    });
  } else if (
    ctx.lexer.is(TokenType.NumericLiteral) ||
    ctx.lexer.is(TokenType.StringLiteral)
  ) {
    const litToken = ctx.lexer.next();
    key = Object.freeze({
      type: "Literal" as const,
      value: litToken.value as string | number,
      raw: litToken.raw,
      start: litToken.start,
      end: litToken.end,
    });
  } else {
    throw new SyntaxError(
      `Unexpected token in class member at position ${ctx.lexer.token.start}`,
    );
  }

  // Determine if this is a method or property
  if (ctx.lexer.is(TokenType.LeftParen)) {
    // Method definition
    const params = parseParameters(ctx);
    const body = ctx.parseBlockStatement();

    const value: AST.FunctionExpression = Object.freeze({
      type: "FunctionExpression" as const,
      id: null,
      params: Object.freeze(params),
      body,
      generator: false,
      async: false,
      start: params.length > 0 ? (params[0] as AST.BaseNode).start : body.start,
      end: body.end,
    });

    return Object.freeze({
      type: "MethodDefinition" as const,
      key,
      value,
      kind,
      computed,
      static: isStatic,
      start: memberStart,
      end: body.end,
    });
  }

  // Property definition
  let propValue: AST.Expression | null = null;
  if (ctx.lexer.is(TokenType.Equals)) {
    ctx.lexer.next();
    propValue = ctx.parseExpression();
  }

  const propEnd = propValue ? propValue.end : key.end;

  // Consume optional semicolon
  if (ctx.lexer.is(TokenType.Semicolon)) {
    ctx.lexer.next();
  }

  return Object.freeze({
    type: "PropertyDefinition" as const,
    key,
    value: propValue,
    computed,
    static: isStatic,
    start: memberStart,
    end: propEnd,
  });
};

/**
 * Parse a static initialization block.
 *
 * @param ctx - The parser context.
 * @param start - The start position of the 'static' keyword.
 * @returns The StaticBlock AST node.
 */
const parseStaticBlock = (
  ctx: ParserContext,
  start: number,
): AST.StaticBlock => {
  const block = ctx.parseBlockStatement();
  return Object.freeze({
    type: "StaticBlock" as const,
    body: block.body as unknown as ReadonlyArray<AST.Statement>,
    start,
    end: block.end,
  });
};

/**
 * Parse an import declaration.
 *
 * Handles: import name from 'module'
 *          import { a, b as c } from 'module'
 *          import * as ns from 'module'
 *          import 'module'
 *          import name, { a } from 'module'
 *          import x from 'y' with { type: 'json' }
 *
 * @param ctx - The parser context.
 * @returns The ImportDeclaration AST node.
 */
export const parseImportDeclaration = (
  ctx: ParserContext,
): ImportDeclarationWithAttributes => {
  const start = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.Import);

  const specifiers: Array<
    | AST.ImportSpecifier
    | AST.ImportDefaultSpecifier
    | AST.ImportNamespaceSpecifier
  > = [];

  // Side-effect import: import 'module'
  if (ctx.lexer.is(TokenType.StringLiteral)) {
    const sourceToken = ctx.lexer.next();
    const source = createLiteralFromToken(sourceToken);
    const attributes = parseImportAttributes(ctx);
    consumeSemicolon(ctx);
    return Object.freeze({
      type: "ImportDeclaration" as const,
      specifiers: Object.freeze(specifiers),
      source,
      attributes: Object.freeze(attributes),
      start,
      end: sourceToken.end,
    });
  }

  // Check for namespace import: import * as ns from 'module'
  if (ctx.lexer.is(TokenType.Star)) {
    ctx.lexer.next();
    ctx.lexer.expect(TokenType.As);
    const localToken = ctx.lexer.expect(TokenType.Identifier);
    const local: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: localToken.value as string,
      start: localToken.start,
      end: localToken.end,
    });
    specifiers.push(
      Object.freeze({
        type: "ImportNamespaceSpecifier" as const,
        local,
        start: local.start,
        end: local.end,
      }),
    );
  } else if (ctx.lexer.is(TokenType.LeftBrace)) {
    // Named imports: import { a, b as c } from 'module'
    parseNamedImports(ctx, specifiers);
  } else if (ctx.lexer.is(TokenType.Identifier)) {
    // Default import: import name from 'module'
    const defaultToken = ctx.lexer.next();
    const local: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: defaultToken.value as string,
      start: defaultToken.start,
      end: defaultToken.end,
    });
    specifiers.push(
      Object.freeze({
        type: "ImportDefaultSpecifier" as const,
        local,
        start: local.start,
        end: local.end,
      }),
    );

    // Combined: import name, { a } from 'module' OR import name, * as ns from 'module'
    if (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
      if (ctx.lexer.is(TokenType.LeftBrace)) {
        parseNamedImports(ctx, specifiers);
      } else if (ctx.lexer.is(TokenType.Star)) {
        ctx.lexer.next();
        ctx.lexer.expect(TokenType.As);
        const nsToken = ctx.lexer.expect(TokenType.Identifier);
        const nsLocal: AST.Identifier = Object.freeze({
          type: "Identifier" as const,
          name: nsToken.value as string,
          start: nsToken.start,
          end: nsToken.end,
        });
        specifiers.push(
          Object.freeze({
            type: "ImportNamespaceSpecifier" as const,
            local: nsLocal,
            start: nsLocal.start,
            end: nsLocal.end,
          }),
        );
      }
    }
  }

  // Expect 'from' keyword
  ctx.lexer.expect(TokenType.From);

  // Parse module source
  if (!ctx.lexer.is(TokenType.StringLiteral)) {
    throw new SyntaxError(
      `Expected module source string at position ${ctx.lexer.token.start}`,
    );
  }
  const sourceToken = ctx.lexer.next();
  const source = createLiteralFromToken(sourceToken);

  // Parse import attributes
  const attributes = parseImportAttributes(ctx);

  consumeSemicolon(ctx);

  return Object.freeze({
    type: "ImportDeclaration" as const,
    specifiers: Object.freeze(specifiers),
    source,
    attributes: Object.freeze(attributes),
    start,
    end: sourceToken.end,
  });
};

/**
 * Parse named import specifiers: { a, b as c }
 *
 * @param ctx - The parser context.
 * @param specifiers - Array to push specifiers into.
 */
const parseNamedImports = (
  ctx: ParserContext,
  specifiers: Array<
    | AST.ImportSpecifier
    | AST.ImportDefaultSpecifier
    | AST.ImportNamespaceSpecifier
  >,
): void => {
  ctx.lexer.expect(TokenType.LeftBrace);

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    if (
      specifiers.length > 0 &&
      specifiers[specifiers.length - 1].type === "ImportSpecifier"
    ) {
      // Only expect comma between named specifiers
    }

    const importedToken = ctx.lexer.token;
    if (
      !ctx.lexer.is(TokenType.Identifier) &&
      !isKeywordToken(importedToken.type)
    ) {
      break;
    }
    ctx.lexer.next();

    const imported: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: importedToken.value as string,
      start: importedToken.start,
      end: importedToken.end,
    });

    let local: AST.Identifier = imported;

    // Check for 'as' alias
    if (ctx.lexer.is(TokenType.As)) {
      ctx.lexer.next();
      const localToken = ctx.lexer.expect(TokenType.Identifier);
      local = Object.freeze({
        type: "Identifier" as const,
        name: localToken.value as string,
        start: localToken.start,
        end: localToken.end,
      });
    }

    specifiers.push(
      Object.freeze({
        type: "ImportSpecifier" as const,
        imported,
        local,
        start: imported.start,
        end: local.end,
      }),
    );

    if (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }
  }

  ctx.lexer.expect(TokenType.RightBrace);
};

/**
 * Parse import attributes: with { type: 'json' }
 *
 * @param ctx - The parser context.
 * @returns Array of ImportAttribute nodes.
 */
const parseImportAttributes = (ctx: ParserContext): Array<ImportAttribute> => {
  const attributes: Array<ImportAttribute> = [];

  // Check for 'with' keyword (TokenType.With)
  if (!ctx.lexer.is(TokenType.With)) {
    return attributes;
  }

  ctx.lexer.next(); // consume 'with'
  ctx.lexer.expect(TokenType.LeftBrace);

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    const attrStart = ctx.lexer.token.start;

    // Key can be identifier or string
    let key: AST.Identifier | AST.Literal;
    if (ctx.lexer.is(TokenType.Identifier)) {
      const keyToken = ctx.lexer.next();
      key = Object.freeze({
        type: "Identifier" as const,
        name: keyToken.value as string,
        start: keyToken.start,
        end: keyToken.end,
      });
    } else if (ctx.lexer.is(TokenType.StringLiteral)) {
      const keyToken = ctx.lexer.next();
      key = createLiteralFromToken(keyToken);
    } else {
      throw new SyntaxError(
        `Expected attribute key at position ${ctx.lexer.token.start}`,
      );
    }

    ctx.lexer.expect(TokenType.Colon);

    // Value must be a string literal
    if (!ctx.lexer.is(TokenType.StringLiteral)) {
      throw new SyntaxError(
        `Expected string literal for import attribute value at position ${ctx.lexer.token.start}`,
      );
    }
    const valueToken = ctx.lexer.next();
    const value = createLiteralFromToken(valueToken);

    attributes.push(
      Object.freeze({
        type: "ImportAttribute" as const,
        key,
        value,
        start: attrStart,
        end: value.end,
      }),
    );

    if (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }
  }

  ctx.lexer.expect(TokenType.RightBrace);
  return attributes;
};

/**
 * Parse an export declaration.
 *
 * Handles: export { a, b as c }
 *          export { a } from 'module'
 *          export * from 'module'
 *          export * as ns from 'module'
 *          export default expression
 *          export default function/class
 *          export const/let/var x = ...
 *          export function name() {}
 *          export class Name {}
 *
 * @param ctx - The parser context.
 * @returns The export declaration AST node.
 */
export const parseExportDeclaration = (
  ctx: ParserContext,
):
  | AST.ExportNamedDeclaration
  | AST.ExportDefaultDeclaration
  | AST.ExportAllDeclaration => {
  const start = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.Export);

  // export default ...
  if (ctx.lexer.is(TokenType.Default)) {
    ctx.lexer.next();
    return parseExportDefault(ctx, start);
  }

  // export * from 'module' or export * as ns from 'module'
  if (ctx.lexer.is(TokenType.Star)) {
    ctx.lexer.next();

    let exported: AST.Identifier | null = null;
    if (ctx.lexer.is(TokenType.As)) {
      ctx.lexer.next();
      const nsToken = ctx.lexer.expect(TokenType.Identifier);
      exported = Object.freeze({
        type: "Identifier" as const,
        name: nsToken.value as string,
        start: nsToken.start,
        end: nsToken.end,
      });
    }

    ctx.lexer.expect(TokenType.From);
    if (!ctx.lexer.is(TokenType.StringLiteral)) {
      throw new SyntaxError(
        `Expected module source string at position ${ctx.lexer.token.start}`,
      );
    }
    const sourceToken = ctx.lexer.next();
    const source = createLiteralFromToken(sourceToken);
    consumeSemicolon(ctx);

    return Object.freeze({
      type: "ExportAllDeclaration" as const,
      source,
      exported,
      start,
      end: sourceToken.end,
    });
  }

  // export { a, b as c } or export { a } from 'module'
  if (ctx.lexer.is(TokenType.LeftBrace)) {
    const specifiers = parseExportSpecifiers(ctx);

    // Check for re-export: from 'module'
    let source: AST.Literal | null = null;
    if (ctx.lexer.is(TokenType.From)) {
      ctx.lexer.next();
      if (!ctx.lexer.is(TokenType.StringLiteral)) {
        throw new SyntaxError(
          `Expected module source string at position ${ctx.lexer.token.start}`,
        );
      }
      const sourceToken = ctx.lexer.next();
      source = createLiteralFromToken(sourceToken);
    }

    consumeSemicolon(ctx);

    const end = source
      ? source.end
      : specifiers.length > 0
        ? specifiers[specifiers.length - 1].end
        : start;

    return Object.freeze({
      type: "ExportNamedDeclaration" as const,
      declaration: null,
      specifiers: Object.freeze(specifiers),
      source,
      start,
      end,
    });
  }

  // export function name() {}
  if (ctx.lexer.is(TokenType.Function)) {
    const declaration = parseFunctionDeclaration(ctx, false);
    return Object.freeze({
      type: "ExportNamedDeclaration" as const,
      declaration,
      specifiers: Object.freeze([]),
      source: null,
      start,
      end: declaration.end,
    });
  }

  // export async function name() {}
  if (ctx.lexer.is(TokenType.Async)) {
    ctx.lexer.next();
    const declaration = parseFunctionDeclaration(ctx, true);
    return Object.freeze({
      type: "ExportNamedDeclaration" as const,
      declaration,
      specifiers: Object.freeze([]),
      source: null,
      start,
      end: declaration.end,
    });
  }

  // export class Name {}
  if (ctx.lexer.is(TokenType.Class)) {
    const declaration = parseClassDeclaration(ctx);
    return Object.freeze({
      type: "ExportNamedDeclaration" as const,
      declaration,
      specifiers: Object.freeze([]),
      source: null,
      start,
      end: declaration.end,
    });
  }

  // export const/let/var x = ...
  if (
    ctx.lexer.is(TokenType.Const) ||
    ctx.lexer.is(TokenType.Let) ||
    ctx.lexer.is(TokenType.Var)
  ) {
    const declaration = parseVariableDeclaration(ctx);
    return Object.freeze({
      type: "ExportNamedDeclaration" as const,
      declaration,
      specifiers: Object.freeze([]),
      source: null,
      start,
      end: declaration.end,
    });
  }

  throw new SyntaxError(
    `Unexpected token after export at position ${ctx.lexer.token.start}`,
  );
};

/**
 * Parse export default declaration.
 *
 * @param ctx - The parser context.
 * @param start - The start position of the 'export' keyword.
 * @returns The ExportDefaultDeclaration AST node.
 */
const parseExportDefault = (
  ctx: ParserContext,
  start: number,
): AST.ExportDefaultDeclaration => {
  // export default function ...
  if (ctx.lexer.is(TokenType.Function)) {
    const declaration = parseFunctionDeclaration(ctx, false);
    return Object.freeze({
      type: "ExportDefaultDeclaration" as const,
      declaration,
      start,
      end: declaration.end,
    });
  }

  // export default async function ...
  if (ctx.lexer.is(TokenType.Async)) {
    ctx.lexer.next();
    const declaration = parseFunctionDeclaration(ctx, true);
    return Object.freeze({
      type: "ExportDefaultDeclaration" as const,
      declaration,
      start,
      end: declaration.end,
    });
  }

  // export default class ...
  if (ctx.lexer.is(TokenType.Class)) {
    const declaration = parseClassDeclaration(ctx);
    return Object.freeze({
      type: "ExportDefaultDeclaration" as const,
      declaration,
      start,
      end: declaration.end,
    });
  }

  // export default expression
  const expression = ctx.parseExpression();
  consumeSemicolon(ctx);
  return Object.freeze({
    type: "ExportDefaultDeclaration" as const,
    declaration: expression,
    start,
    end: expression.end,
  });
};

/**
 * Parse export specifiers: { a, b as c }
 *
 * @param ctx - The parser context.
 * @returns Array of ExportSpecifier nodes.
 */
const parseExportSpecifiers = (
  ctx: ParserContext,
): Array<AST.ExportSpecifier> => {
  ctx.lexer.expect(TokenType.LeftBrace);
  const specifiers: Array<AST.ExportSpecifier> = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    const localToken = ctx.lexer.token;
    if (
      !ctx.lexer.is(TokenType.Identifier) &&
      !isKeywordToken(localToken.type)
    ) {
      break;
    }
    ctx.lexer.next();

    const local: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: localToken.value as string,
      start: localToken.start,
      end: localToken.end,
    });

    let exported: AST.Identifier = local;

    // Check for 'as' alias
    if (ctx.lexer.is(TokenType.As)) {
      ctx.lexer.next();
      const exportedToken = ctx.lexer.token;
      if (
        !ctx.lexer.is(TokenType.Identifier) &&
        !isKeywordToken(exportedToken.type)
      ) {
        throw new SyntaxError(
          `Expected identifier after 'as' at position ${exportedToken.start}`,
        );
      }
      ctx.lexer.next();
      exported = Object.freeze({
        type: "Identifier" as const,
        name: exportedToken.value as string,
        start: exportedToken.start,
        end: exportedToken.end,
      });
    }

    specifiers.push(
      Object.freeze({
        type: "ExportSpecifier" as const,
        local,
        exported,
        start: local.start,
        end: exported.end,
      }),
    );

    if (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }
  }

  ctx.lexer.expect(TokenType.RightBrace);
  return specifiers;
};

/**
 * Parse a simple variable declaration (const/let/var x = expr).
 *
 * @param ctx - The parser context.
 * @returns The VariableDeclaration AST node.
 */
const parseVariableDeclaration = (
  ctx: ParserContext,
): AST.VariableDeclaration => {
  const start = ctx.lexer.token.start;
  const kindToken = ctx.lexer.next();
  const kind = kindToken.value as "var" | "let" | "const";

  const declarations: Array<AST.VariableDeclarator> = [];

  // Parse declarators iteratively
  let expectMore = true;
  while (expectMore) {
    const idToken = ctx.lexer.expect(TokenType.Identifier);
    const id: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: idToken.value as string,
      start: idToken.start,
      end: idToken.end,
    });

    let init: AST.Expression | null = null;
    if (ctx.lexer.is(TokenType.Equals)) {
      ctx.lexer.next();
      init = ctx.parseAssignmentExpression();
    }

    declarations.push(
      Object.freeze({
        type: "VariableDeclarator" as const,
        id,
        init,
        start: id.start,
        end: init ? init.end : id.end,
      }),
    );

    if (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    } else {
      expectMore = false;
    }
  }

  consumeSemicolon(ctx);

  const lastDecl = declarations[declarations.length - 1];
  return Object.freeze({
    type: "VariableDeclaration" as const,
    declarations: Object.freeze(declarations),
    kind,
    start,
    end: lastDecl.end,
  });
};

/**
 * Create a Literal AST node from a token.
 *
 * @param token - The string literal token.
 * @returns A frozen Literal AST node.
 */
const createLiteralFromToken = (token: {
  readonly value: unknown;
  readonly raw: string;
  readonly start: number;
  readonly end: number;
}): AST.Literal => {
  return Object.freeze({
    type: "Literal" as const,
    value: token.value as string,
    raw: token.raw,
    start: token.start,
    end: token.end,
  });
};

/**
 * Consume an optional semicolon.
 *
 * @param ctx - The parser context.
 */
const consumeSemicolon = (ctx: ParserContext): void => {
  if (ctx.lexer.is(TokenType.Semicolon)) {
    ctx.lexer.next();
  }
};

/**
 * Check if a token type represents a keyword that can be used as an identifier
 * in some contexts (e.g., as property names in imports/exports).
 *
 * @param type - The token type to check.
 * @returns True if the token is a keyword that can serve as identifier.
 */
const isKeywordToken = (type: number): boolean => {
  // Reserved keywords that can appear as export/import specifier names
  return (
    (type >= TokenType.Break && type <= TokenType.With) ||
    (type >= TokenType.Class && type <= TokenType.Super) ||
    (type >= TokenType.Async && type <= TokenType.Static)
  );
};
