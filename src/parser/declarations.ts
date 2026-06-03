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
import { parseBindingPattern as parseBindingPatternFromModule } from "./patterns.js";
import { parseDecorators } from "./decorators.js";
import {
  parseInterfaceDeclaration,
  parseTypeAliasDeclaration,
  parseEnumDeclaration,
  parseNamespaceDeclaration,
  parseDeclareStatement,
  isTypeAliasStart,
  isInterfaceStart,
} from "./typescript.js";

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
  readonly importKind?: "type" | "value";
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
  readonly typescriptEnabled?: boolean;
  parseExpression(): AST.Expression;
  parseAssignmentExpression(): AST.Expression;
  parseStatement(): AST.Statement | AST.ModuleDeclaration;
  parseBlockStatement(): AST.BlockStatement;
  parseBindingPattern(): AST.Pattern;
  buildTSContext?(): {
    readonly lexer: Lexer;
    parseExpression(): AST.Expression;
    parseAssignmentExpression(): AST.Expression;
    parseStatement(): AST.Statement | AST.ModuleDeclaration;
    parseBlockStatement(): AST.BlockStatement;
    parseBindingPattern(): AST.Pattern;
  };
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

  // In TypeScript mode, skip generic type parameters
  if (ctx.typescriptEnabled && ctx.lexer.is(TokenType.LessThan)) {
    skipGenericTypeParameters(ctx);
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
 * Handles simple identifiers, destructuring patterns (array/object),
 * rest elements (...args), and default values. In TypeScript mode,
 * also handles parameter properties and type annotations.
 *
 * @param ctx - The parser context.
 * @returns Array of Pattern nodes.
 */
const parseParameters = (ctx: ParserContext): Array<AST.Pattern> => {
  ctx.lexer.expect(TokenType.LeftParen);

  const params: Array<AST.Pattern> = [];
  const parseAssignExpr = (): AST.Expression => ctx.parseAssignmentExpression();

  while (!ctx.lexer.is(TokenType.RightParen) && !ctx.lexer.is(TokenType.EOF)) {
    if (params.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    // Check for rest element
    if (ctx.lexer.is(TokenType.Ellipsis)) {
      const restStart = ctx.lexer.token.start;
      ctx.lexer.next();
      const argument = parseBindingPatternFromModule(
        ctx.lexer,
        parseAssignExpr,
      );
      // Skip type annotation on rest param
      if (ctx.typescriptEnabled && ctx.lexer.is(TokenType.Colon)) {
        skipParamTypeAnnotation(ctx);
      }
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

    // In TypeScript mode, check for parameter properties
    if (ctx.typescriptEnabled && isParameterPropertyKeyword(ctx.lexer)) {
      // Skip the access modifier and/or readonly, just get the parameter name
      skipParameterPropertyModifiers(ctx);
    }

    // Parse binding pattern (identifier, array pattern, or object pattern)
    const param = parseBindingPatternFromModule(ctx.lexer, parseAssignExpr);

    // In TypeScript mode, skip optional `?` and type annotation
    if (ctx.typescriptEnabled) {
      if (ctx.lexer.is(TokenType.QuestionMark)) {
        ctx.lexer.next();
      }
      if (ctx.lexer.is(TokenType.Colon)) {
        skipParamTypeAnnotation(ctx);
      }
    }

    // Check for default value (use assignment expression to avoid consuming comma)
    if (ctx.lexer.is(TokenType.Equals)) {
      const assignStart = param.start;
      ctx.lexer.next();
      const right = ctx.parseAssignmentExpression();
      params.push(
        Object.freeze({
          type: "AssignmentPattern" as const,
          left: param,
          right,
          start: assignStart,
          end: right.end,
        }),
      );
    } else {
      params.push(param);
    }
  }

  ctx.lexer.expect(TokenType.RightParen);

  // In TypeScript mode, skip return type annotation
  if (ctx.typescriptEnabled && ctx.lexer.is(TokenType.Colon)) {
    skipParamTypeAnnotation(ctx);
  }

  return params;
};

/**
 * Check if the current token starts a parameter property (private/protected/public/readonly).
 */
const isParameterPropertyKeyword = (lexer: Lexer): boolean => {
  const val = lexer.token.value;
  return (
    val === "private" ||
    val === "protected" ||
    val === "public" ||
    val === "readonly"
  );
};

/**
 * Skip parameter property modifiers (access modifiers and readonly).
 */
const skipParameterPropertyModifiers = (ctx: ParserContext): void => {
  const val = ctx.lexer.token.value;
  if (val === "private" || val === "protected" || val === "public") {
    ctx.lexer.next();
  }
  if (ctx.lexer.token.value === "readonly") {
    ctx.lexer.next();
  }
};

/**
 * Skip a type annotation in parameter context.
 * Consumes `:` and tokens until `,`, `)`, `=`, or end of input.
 */
const skipParamTypeAnnotation = (ctx: ParserContext): void => {
  ctx.lexer.next(); // consume ':'
  let depth = 0;

  while (!ctx.lexer.is(TokenType.EOF)) {
    if (
      depth === 0 &&
      (ctx.lexer.is(TokenType.Comma) ||
        ctx.lexer.is(TokenType.RightParen) ||
        ctx.lexer.is(TokenType.Equals) ||
        ctx.lexer.is(TokenType.LeftBrace) ||
        ctx.lexer.is(TokenType.Arrow))
    ) {
      return;
    }

    if (
      ctx.lexer.is(TokenType.LessThan) ||
      ctx.lexer.is(TokenType.LeftParen) ||
      ctx.lexer.is(TokenType.LeftBracket)
    ) {
      depth++;
    } else if (
      ctx.lexer.is(TokenType.GreaterThan) ||
      ctx.lexer.is(TokenType.RightParen) ||
      ctx.lexer.is(TokenType.RightBracket)
    ) {
      depth--;
      if (depth < 0) {
        return;
      }
    }

    ctx.lexer.next();
  }
};

/**
 * Parse a class declaration.
 *
 * Handles: class Name { ... }
 *          class Name extends SuperClass { ... }
 *          @decorator class Name { ... }
 *
 * @param ctx - The parser context.
 * @param decorators - Pre-parsed decorators attached to this class.
 * @returns The ClassDeclaration AST node.
 */
export const parseClassDeclaration = (
  ctx: ParserContext,
  decorators: ReadonlyArray<AST.Decorator> = Object.freeze([]),
): AST.ClassDeclaration => {
  const start =
    decorators.length > 0 ? decorators[0].start : ctx.lexer.token.start;

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

  // In TypeScript mode, skip generic type parameters
  if (ctx.typescriptEnabled && ctx.lexer.is(TokenType.LessThan)) {
    skipGenericTypeParameters(ctx);
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
    // Skip type arguments on super class
    if (ctx.typescriptEnabled && ctx.lexer.is(TokenType.LessThan)) {
      skipGenericTypeParameters(ctx);
    }
  }

  // In TypeScript mode, skip implements clause
  if (
    ctx.typescriptEnabled &&
    ctx.lexer.is(TokenType.Identifier) &&
    ctx.lexer.token.value === "implements"
  ) {
    ctx.lexer.next(); // consume 'implements'
    // Skip comma-separated type references until we see '{'
    while (!ctx.lexer.is(TokenType.LeftBrace) && !ctx.lexer.is(TokenType.EOF)) {
      if (ctx.lexer.is(TokenType.LessThan)) {
        skipGenericTypeParameters(ctx);
      } else {
        ctx.lexer.next();
      }
    }
  }

  // Parse class body
  const body = parseClassBody(ctx);

  return Object.freeze({
    type: "ClassDeclaration" as const,
    id,
    superClass,
    body,
    decorators,
    start,
    end: body.end,
  });
};

/**
 * Parse a comma-separated list of arguments for decorator call expressions.
 *
 * @param ctx - The parser context.
 * @returns Array of Expression or SpreadElement nodes.
 */
const parseArgumentList = (
  ctx: ParserContext,
): ReadonlyArray<AST.Expression | AST.SpreadElement> => {
  const args: Array<AST.Expression | AST.SpreadElement> = [];

  while (!ctx.lexer.is(TokenType.RightParen) && !ctx.lexer.is(TokenType.EOF)) {
    if (args.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    if (ctx.lexer.is(TokenType.Ellipsis)) {
      const spreadStart = ctx.lexer.token.start;
      ctx.lexer.next();
      const argument = ctx.parseAssignmentExpression();
      args.push(
        Object.freeze({
          type: "SpreadElement" as const,
          argument,
          start: spreadStart,
          end: argument.end,
        }),
      );
    } else {
      args.push(ctx.parseAssignmentExpression());
    }
  }

  return Object.freeze(args);
};

/**
 * Parse a class body enclosed in braces.
 *
 * Handles methods, properties, static members, private fields, static blocks,
 * and decorated members.
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

    // Parse decorators before class member
    const memberDecorators = parseDecorators(ctx.lexer, () =>
      parseArgumentList(ctx),
    );

    const member = parseClassMember(ctx, memberDecorators);
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
 * @param decorators - Pre-parsed decorators for this member.
 * @returns A MethodDefinition, PropertyDefinition, or StaticBlock node.
 */
const parseClassMember = (
  ctx: ParserContext,
  decorators: ReadonlyArray<AST.Decorator> = Object.freeze([]),
): AST.MethodDefinition | AST.PropertyDefinition | AST.StaticBlock => {
  const memberStart =
    decorators.length > 0 ? decorators[0].start : ctx.lexer.token.start;
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
      decorators,
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
    decorators,
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

  // Check for 'import type'
  let importKind: "type" | "value" = "value";
  if (
    ctx.lexer.is(TokenType.Identifier) &&
    ctx.lexer.token.value === "type" &&
    ctx.typescriptEnabled
  ) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next(); // consume 'type'
    // If followed by identifier, '{', or '*', this is 'import type ...'
    if (
      ctx.lexer.is(TokenType.Identifier) ||
      ctx.lexer.is(TokenType.LeftBrace) ||
      ctx.lexer.is(TokenType.Star)
    ) {
      importKind = "type";
    } else {
      ctx.lexer.restoreState(saved);
    }
  }

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
      importKind,
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
    importKind,
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
  decorators: ReadonlyArray<AST.Decorator> = Object.freeze([]),
):
  | AST.ExportNamedDeclaration
  | AST.ExportDefaultDeclaration
  | AST.ExportAllDeclaration => {
  const start =
    decorators.length > 0 ? decorators[0].start : ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.Export);

  // export type { ... } or export type ...
  let exportKind: "type" | "value" = "value";
  if (
    ctx.lexer.is(TokenType.Identifier) &&
    ctx.lexer.token.value === "type" &&
    ctx.typescriptEnabled
  ) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next(); // consume 'type'
    if (ctx.lexer.is(TokenType.LeftBrace) || ctx.lexer.is(TokenType.Star)) {
      exportKind = "type";
    } else if (ctx.lexer.is(TokenType.Identifier)) {
      // Could be 'export type X = ...' (type alias) or 'export type X from ...'
      const saved2 = ctx.lexer.saveState();
      ctx.lexer.next(); // consume identifier
      if (ctx.lexer.is(TokenType.Equals) || ctx.lexer.is(TokenType.LessThan)) {
        // export type X = ... (type alias declaration)
        // Restore to before 'type' was consumed, so parseTypeAliasDeclaration
        // can consume 'type' itself
        ctx.lexer.restoreState(saved);
        if (ctx.buildTSContext) {
          const decl = parseTypeAliasDeclaration(ctx.buildTSContext());
          return Object.freeze({
            type: "ExportNamedDeclaration" as const,
            declaration: decl as unknown as AST.Declaration,
            specifiers: Object.freeze([]),
            source: null,
            exportKind: "value",
            start,
            end: decl.end,
          });
        }
      }
      ctx.lexer.restoreState(saved2);
      // It's 'export type Identifier' - possibly type-only default re-export
      exportKind = "type";
    } else {
      ctx.lexer.restoreState(saved);
    }
  }

  // TypeScript declarations after export
  if (ctx.typescriptEnabled) {
    // export interface
    if (
      ctx.lexer.is(TokenType.Identifier) &&
      ctx.lexer.token.value === "interface" &&
      isInterfaceStart(ctx.lexer)
    ) {
      if (ctx.buildTSContext) {
        const decl = parseInterfaceDeclaration(ctx.buildTSContext());
        return Object.freeze({
          type: "ExportNamedDeclaration" as const,
          declaration: decl as unknown as AST.Declaration,
          specifiers: Object.freeze([]),
          source: null,
          exportKind: "value",
          start,
          end: decl.end,
        });
      }
    }

    // export enum
    if (
      ctx.lexer.is(TokenType.Identifier) &&
      ctx.lexer.token.value === "enum"
    ) {
      if (ctx.buildTSContext) {
        const decl = parseEnumDeclaration(ctx.buildTSContext());
        return Object.freeze({
          type: "ExportNamedDeclaration" as const,
          declaration: decl as unknown as AST.Declaration,
          specifiers: Object.freeze([]),
          source: null,
          exportKind: "value",
          start,
          end: decl.end,
        });
      }
    }

    // export const enum
    if (ctx.lexer.is(TokenType.Const)) {
      const constStart = ctx.lexer.token.start;
      const saved = ctx.lexer.saveState();
      ctx.lexer.next();
      if (
        ctx.lexer.is(TokenType.Identifier) &&
        ctx.lexer.token.value === "enum" &&
        ctx.buildTSContext
      ) {
        const decl = parseEnumDeclaration(
          ctx.buildTSContext(),
          true,
          false,
          constStart,
        );
        return Object.freeze({
          type: "ExportNamedDeclaration" as const,
          declaration: decl as unknown as AST.Declaration,
          specifiers: Object.freeze([]),
          source: null,
          exportKind: "value",
          start,
          end: decl.end,
        });
      }
      ctx.lexer.restoreState(saved);
    }

    // export namespace / export module
    if (
      ((ctx.lexer.is(TokenType.Identifier) &&
        ctx.lexer.token.value === "namespace") ||
        (ctx.lexer.is(TokenType.Identifier) &&
          ctx.lexer.token.value === "module")) &&
      ctx.buildTSContext
    ) {
      const decl = parseNamespaceDeclaration(ctx.buildTSContext());
      return Object.freeze({
        type: "ExportNamedDeclaration" as const,
        declaration: decl as unknown as AST.Declaration,
        specifiers: Object.freeze([]),
        source: null,
        exportKind: "value",
        start,
        end: decl.end,
      });
    }

    // export declare
    if (
      ctx.lexer.is(TokenType.Identifier) &&
      ctx.lexer.token.value === "declare" &&
      ctx.buildTSContext
    ) {
      const decl = parseDeclareStatement(ctx.buildTSContext());
      return Object.freeze({
        type: "ExportNamedDeclaration" as const,
        declaration: decl as unknown as AST.Declaration,
        specifiers: Object.freeze([]),
        source: null,
        exportKind: "value",
        start,
        end: decl.end,
      });
    }

    // export abstract class
    if (
      ctx.lexer.is(TokenType.Identifier) &&
      ctx.lexer.token.value === "abstract"
    ) {
      ctx.lexer.next();
      if (ctx.lexer.is(TokenType.Class)) {
        const declaration = parseClassDeclaration(ctx, decorators);
        return Object.freeze({
          type: "ExportNamedDeclaration" as const,
          declaration,
          specifiers: Object.freeze([]),
          source: null,
          exportKind: "value",
          start,
          end: declaration.end,
        });
      }
    }
  }

  // export default ...
  if (ctx.lexer.is(TokenType.Default)) {
    ctx.lexer.next();
    return parseExportDefault(ctx, start, decorators);
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
      exportKind,
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
    const declaration = parseClassDeclaration(ctx, decorators);
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
  decorators: ReadonlyArray<AST.Decorator> = Object.freeze([]),
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
    const declaration = parseClassDeclaration(ctx, decorators);
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
 * Skip generic type parameters `<T, U extends V>` by balancing angle brackets.
 */
const skipGenericTypeParameters = (ctx: ParserContext): void => {
  let depth = 0;
  while (!ctx.lexer.is(TokenType.EOF)) {
    if (ctx.lexer.is(TokenType.LessThan)) {
      depth++;
    } else if (ctx.lexer.is(TokenType.GreaterThan)) {
      depth--;
      if (depth <= 0) {
        ctx.lexer.next(); // consume '>'
        return;
      }
    }
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
