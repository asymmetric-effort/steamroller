/**
 * TypeScript-specific parsing functions for the Steamroller parser.
 *
 * Provides parsing logic for TypeScript declarations (interfaces, type aliases,
 * enums, namespaces), type annotations, type parameters, and TypeScript-specific
 * expression forms (as, satisfies, non-null assertions).
 *
 * @module parser/typescript
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import type { Token } from "./token.js";
import { TokenType } from "./token-types.js";

/**
 * Check if the current token is an identifier with a specific value.
 * Used for TypeScript contextual keywords that are just identifiers in JS.
 */
const isIdent = (lexer: Lexer, value: string): boolean => {
  return lexer.is(TokenType.Identifier) && lexer.token.value === value;
};

/**
 * Expect and consume an identifier with a specific value.
 */
const expectIdent = (lexer: Lexer, value: string): Token => {
  if (!isIdent(lexer, value)) {
    throw new SyntaxError(
      `Expected '${value}' at position ${lexer.token.start}`,
    );
  }
  return lexer.next();
};

/**
 * Context for TypeScript parsing, providing access to sub-parsers.
 */
export interface TSParserContext {
  readonly lexer: Lexer;
  parseExpression(): AST.Expression;
  parseAssignmentExpression(): AST.Expression;
  parseStatement(): AST.Statement | AST.ModuleDeclaration;
  parseBlockStatement(): AST.BlockStatement;
  parseBindingPattern(): AST.Pattern;
}

// ============================================================
// Type Annotations
// ============================================================

/**
 * Parse a type annotation after a colon: `: Type`.
 * Returns null if the current token is not a colon.
 */
export const tryParseTypeAnnotation = (
  ctx: TSParserContext,
): AST.TSTypeAnnotation | null => {
  if (!ctx.lexer.is(TokenType.Colon)) {
    return null;
  }
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume ':'
  const typeAnnotation = parseType(ctx);
  return Object.freeze({
    type: "TSTypeAnnotation" as const,
    start,
    end: typeAnnotation.end,
    typeAnnotation,
  });
};

/**
 * Parse a return type annotation after ')': ): Type
 */
export const tryParseReturnType = (
  ctx: TSParserContext,
): AST.TSTypeAnnotation | null => {
  return tryParseTypeAnnotation(ctx);
};

// ============================================================
// Type Parameters
// ============================================================

/**
 * Parse type parameters `<T, U extends V>` if present.
 */
export const tryParseTypeParameters = (
  ctx: TSParserContext,
): AST.TSTypeParameterDeclaration | null => {
  if (!ctx.lexer.is(TokenType.LessThan)) {
    return null;
  }
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume '<'

  const params: AST.TSTypeParameter[] = [];

  while (!ctx.lexer.is(TokenType.GreaterThan) && !ctx.lexer.is(TokenType.EOF)) {
    if (params.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    // Handle variance modifiers: in, out
    if (ctx.lexer.is(TokenType.In) || isIdent(ctx.lexer, "out")) {
      ctx.lexer.next(); // skip variance modifier
    }

    const paramStart = ctx.lexer.token.start;
    const nameToken = ctx.lexer.next();
    const name: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      start: nameToken.start,
      end: nameToken.end,
      name: nameToken.value as string,
    });

    let constraint: AST.TSType | null = null;
    if (ctx.lexer.is(TokenType.Extends)) {
      ctx.lexer.next(); // consume 'extends'
      constraint = parseType(ctx);
    }

    let defaultType: AST.TSType | null = null;
    if (ctx.lexer.is(TokenType.Equals)) {
      ctx.lexer.next(); // consume '='
      defaultType = parseType(ctx);
    }

    const paramEnd = defaultType?.end ?? constraint?.end ?? name.end;
    params.push(
      Object.freeze({
        type: "TSTypeParameter" as const,
        start: paramStart,
        end: paramEnd,
        name,
        constraint,
        default: defaultType,
      }),
    );
  }

  const end = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.GreaterThan);

  return Object.freeze({
    type: "TSTypeParameterDeclaration" as const,
    start,
    end,
    params: Object.freeze(params),
  });
};

/**
 * Parse type arguments `<Type, Type>` if present.
 */
export const tryParseTypeArguments = (
  ctx: TSParserContext,
): AST.TSTypeParameterInstantiation | null => {
  if (!ctx.lexer.is(TokenType.LessThan)) {
    return null;
  }

  // Lookahead: distinguish between `<` as less-than and as type parameter
  const saved = ctx.lexer.saveState();

  try {
    const start = ctx.lexer.token.start;
    ctx.lexer.next(); // consume '<'

    const params: AST.TSType[] = [];
    params.push(parseType(ctx));

    while (ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
      params.push(parseType(ctx));
    }

    if (!ctx.lexer.is(TokenType.GreaterThan)) {
      ctx.lexer.restoreState(saved);
      return null;
    }

    const end = ctx.lexer.token.end;
    ctx.lexer.next(); // consume '>'

    return Object.freeze({
      type: "TSTypeParameterInstantiation" as const,
      start,
      end,
      params: Object.freeze(params),
    });
  } catch {
    ctx.lexer.restoreState(saved);
    return null;
  }
};

// ============================================================
// Type Parsing
// ============================================================

/**
 * Parse a TypeScript type expression.
 * Handles union, intersection, and primary types.
 */
export const parseType = (ctx: TSParserContext): AST.TSType => {
  const type = parseIntersectionType(ctx);

  // Union type: A | B | C
  if (ctx.lexer.is(TokenType.Pipe)) {
    const types: AST.TSType[] = [type];
    while (ctx.lexer.is(TokenType.Pipe)) {
      ctx.lexer.next(); // consume '|'
      types.push(parseIntersectionType(ctx));
    }
    return Object.freeze({
      type: "TSUnionType" as const,
      start: types[0].start,
      end: types[types.length - 1].end,
      types: Object.freeze(types),
    });
  }

  return type;
};

/**
 * Parse intersection type: A & B & C
 */
const parseIntersectionType = (ctx: TSParserContext): AST.TSType => {
  // Handle leading | or &
  if (ctx.lexer.is(TokenType.Pipe)) {
    ctx.lexer.next();
  }
  if (ctx.lexer.is(TokenType.Ampersand)) {
    ctx.lexer.next();
  }

  let type = parseConditionalOrPrimaryType(ctx);

  if (ctx.lexer.is(TokenType.Ampersand)) {
    const types: AST.TSType[] = [type];
    while (ctx.lexer.is(TokenType.Ampersand)) {
      ctx.lexer.next();
      types.push(parseConditionalOrPrimaryType(ctx));
    }
    return Object.freeze({
      type: "TSIntersectionType" as const,
      start: types[0].start,
      end: types[types.length - 1].end,
      types: Object.freeze(types),
    });
  }

  // Handle array suffix: Type[] or Type[][]
  while (
    ctx.lexer.is(TokenType.LeftBracket) &&
    !ctx.lexer.hadLineTerminatorBefore
  ) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next(); // consume '['
    if (ctx.lexer.is(TokenType.RightBracket)) {
      const end = ctx.lexer.token.end;
      ctx.lexer.next(); // consume ']'
      type = Object.freeze({
        type: "TSArrayType" as const,
        start: type.start,
        end,
        elementType: type,
      });
    } else {
      // Indexed access type: T[K]
      const indexType = parseType(ctx);
      const end = ctx.lexer.token.end;
      ctx.lexer.expect(TokenType.RightBracket);
      type = Object.freeze({
        type: "TSIndexedAccessType" as const,
        start: type.start,
        end,
        objectType: type,
        indexType,
      });
    }
  }

  return type;
};

/**
 * Parse a conditional type or primary type.
 * Conditional: T extends U ? X : Y
 */
const parseConditionalOrPrimaryType = (ctx: TSParserContext): AST.TSType => {
  const type = parsePrimaryType(ctx);

  // Check for conditional: extends ... ? ... : ...
  if (ctx.lexer.is(TokenType.Extends)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next(); // consume 'extends'

    try {
      const extendsType = parsePrimaryType(ctx);

      if (ctx.lexer.is(TokenType.QuestionMark)) {
        ctx.lexer.next(); // consume '?'
        const trueType = parseType(ctx);
        ctx.lexer.expect(TokenType.Colon);
        const falseType = parseType(ctx);

        return Object.freeze({
          type: "TSConditionalType" as const,
          start: type.start,
          end: falseType.end,
          checkType: type,
          extendsType,
          trueType,
          falseType,
        });
      }
      // Not a conditional type - restore
      ctx.lexer.restoreState(saved);
    } catch {
      ctx.lexer.restoreState(saved);
    }
  }

  return type;
};

/**
 * Parse a primary type (not union/intersection).
 */
const parsePrimaryType = (ctx: TSParserContext): AST.TSType => {
  const token = ctx.lexer.token;

  // Keyword types
  if (isTypeKeyword(token)) {
    return parseKeywordType(ctx);
  }

  // typeof type query
  if (ctx.lexer.is(TokenType.Typeof)) {
    return parseTypeofType(ctx);
  }

  // keyof type
  if (isIdent(ctx.lexer, "keyof")) {
    return parseKeyofType(ctx);
  }

  // infer type
  if (isIdent(ctx.lexer, "infer")) {
    return parseInferType(ctx);
  }

  // Parenthesized type or function type
  if (ctx.lexer.is(TokenType.LeftParen)) {
    return parseParenthesizedOrFunctionType(ctx);
  }

  // Tuple type
  if (ctx.lexer.is(TokenType.LeftBracket)) {
    return parseTupleType(ctx);
  }

  // Object type literal / mapped type
  if (ctx.lexer.is(TokenType.LeftBrace)) {
    return parseTypeLiteralOrMappedType(ctx);
  }

  // Literal types: string, number, boolean literals
  if (
    ctx.lexer.is(TokenType.StringLiteral) ||
    ctx.lexer.is(TokenType.NumericLiteral) ||
    ctx.lexer.is(TokenType.True) ||
    ctx.lexer.is(TokenType.False) ||
    ctx.lexer.is(TokenType.Null)
  ) {
    return parseLiteralType(ctx);
  }

  // Negative numeric literal type
  if (ctx.lexer.is(TokenType.Minus)) {
    return parseNegativeLiteralType(ctx);
  }

  // Rest type (in tuples)
  if (ctx.lexer.is(TokenType.Ellipsis)) {
    const start = ctx.lexer.token.start;
    ctx.lexer.next();
    const typeAnnotation = parseType(ctx);
    return Object.freeze({
      type: "TSRestType" as const,
      start,
      end: typeAnnotation.end,
      typeAnnotation,
    });
  }

  // 'readonly' modifier before array/tuple types
  if (isIdent(ctx.lexer, "readonly")) {
    ctx.lexer.next(); // consume 'readonly'
    return parsePrimaryType(ctx);
  }

  // 'unique' keyword (e.g., unique symbol)
  if (
    ctx.lexer.is(TokenType.Identifier) &&
    ctx.lexer.token.value === "unique"
  ) {
    ctx.lexer.next();
    return parsePrimaryType(ctx);
  }

  // Void type
  if (ctx.lexer.is(TokenType.Void)) {
    return parseKeywordType(ctx);
  }

  // Type reference (identifier or contextual keyword)
  if (
    ctx.lexer.is(TokenType.Identifier) ||
    ctx.lexer.is(TokenType.Async) ||
    ctx.lexer.is(TokenType.Await) ||
    ctx.lexer.is(TokenType.From) ||
    ctx.lexer.is(TokenType.Of) ||
    ctx.lexer.is(TokenType.Get) ||
    ctx.lexer.is(TokenType.Set)
  ) {
    return parseTypeReference(ctx);
  }

  // 'new' for construct signatures in type position
  if (ctx.lexer.is(TokenType.New)) {
    ctx.lexer.next();
    return parseParenthesizedOrFunctionType(ctx);
  }

  // Fallback: treat as keyword type
  if (ctx.lexer.is(TokenType.This)) {
    return parseKeywordType(ctx);
  }

  throw new SyntaxError(
    `Unexpected token in type at position ${token.start}: ${token.raw}`,
  );
};

/**
 * Check if a token is a type keyword (string, number, boolean, etc.)
 */
const isTypeKeyword = (token: Token): boolean => {
  if (token.type !== TokenType.Identifier) {
    return false;
  }
  const name = token.value as string;
  return (
    name === "string" ||
    name === "number" ||
    name === "boolean" ||
    name === "symbol" ||
    name === "bigint" ||
    name === "any" ||
    name === "unknown" ||
    name === "never" ||
    name === "undefined" ||
    name === "object"
  );
};

/**
 * Parse a keyword type.
 */
const parseKeywordType = (ctx: TSParserContext): AST.TSKeywordType => {
  const token = ctx.lexer.next();
  return Object.freeze({
    type: "TSKeywordType" as const,
    start: token.start,
    end: token.end,
    keyword: token.value as string,
  });
};

/**
 * Parse a typeof type query.
 */
const parseTypeofType = (ctx: TSParserContext): AST.TSTypeofType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume 'typeof'

  const nameToken = ctx.lexer.next();
  let exprName: AST.Identifier | AST.TSQualifiedName = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  while (ctx.lexer.is(TokenType.Dot)) {
    ctx.lexer.next();
    const rightToken = ctx.lexer.next();
    const right: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      start: rightToken.start,
      end: rightToken.end,
      name: rightToken.value as string,
    });
    exprName = Object.freeze({
      type: "TSQualifiedName" as const,
      start: exprName.start,
      end: right.end,
      left: exprName,
      right,
    });
  }

  return Object.freeze({
    type: "TSTypeQuery" as const,
    start,
    end: exprName.end,
    exprName,
  });
};

/**
 * Parse a keyof type.
 */
const parseKeyofType = (ctx: TSParserContext): AST.TSKeyofType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume 'keyof'
  const innerType = parsePrimaryType(ctx);
  return Object.freeze({
    type: "TSKeyofType" as const,
    start,
    end: innerType.end,
    type_: innerType,
  });
};

/**
 * Parse an infer type.
 */
const parseInferType = (ctx: TSParserContext): AST.TSInferType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume 'infer'
  const nameToken = ctx.lexer.next();
  const name: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  let constraint: AST.TSType | null = null;
  if (ctx.lexer.is(TokenType.Extends)) {
    ctx.lexer.next();
    constraint = parsePrimaryType(ctx);
  }

  return Object.freeze({
    type: "TSInferType" as const,
    start,
    end: constraint?.end ?? name.end,
    typeParameter: Object.freeze({
      type: "TSTypeParameter" as const,
      start: name.start,
      end: constraint?.end ?? name.end,
      name,
      constraint,
      default: null,
    }),
  });
};

/**
 * Parse a type reference: TypeName or TypeName<Args>
 */
const parseTypeReference = (ctx: TSParserContext): AST.TSType => {
  const start = ctx.lexer.token.start;
  const nameToken = ctx.lexer.next();

  let typeName: AST.Identifier | AST.TSQualifiedName = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  // Handle qualified names: Foo.Bar.Baz
  while (ctx.lexer.is(TokenType.Dot)) {
    ctx.lexer.next();
    const rightToken = ctx.lexer.next();
    const right: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      start: rightToken.start,
      end: rightToken.end,
      name: rightToken.value as string,
    });
    typeName = Object.freeze({
      type: "TSQualifiedName" as const,
      start: typeName.start,
      end: right.end,
      left: typeName,
      right,
    });
  }

  // Try type arguments
  const typeParameters = tryParseTypeArguments(ctx);

  const end = typeParameters?.end ?? typeName.end;
  const ref: AST.TSTypeReference = Object.freeze({
    type: "TSTypeReference" as const,
    start,
    end,
    typeName,
    typeParameters,
  });

  // Check for array suffix
  let result: AST.TSType = ref;
  while (ctx.lexer.is(TokenType.LeftBracket)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    if (ctx.lexer.is(TokenType.RightBracket)) {
      const arrayEnd = ctx.lexer.token.end;
      ctx.lexer.next();
      result = Object.freeze({
        type: "TSArrayType" as const,
        start: result.start,
        end: arrayEnd,
        elementType: result,
      });
    } else {
      // Indexed access type
      const indexType = parseType(ctx);
      const bracketEnd = ctx.lexer.token.end;
      ctx.lexer.expect(TokenType.RightBracket);
      result = Object.freeze({
        type: "TSIndexedAccessType" as const,
        start: result.start,
        end: bracketEnd,
        objectType: result,
        indexType,
      });
    }
  }

  return result;
};

/**
 * Parse a parenthesized type or function type.
 */
const parseParenthesizedOrFunctionType = (ctx: TSParserContext): AST.TSType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume '('

  // Empty parens: () => ReturnType
  if (ctx.lexer.is(TokenType.RightParen)) {
    const parenEnd = ctx.lexer.token.end;
    ctx.lexer.next(); // consume ')'
    if (ctx.lexer.is(TokenType.Arrow)) {
      ctx.lexer.next(); // consume '=>'
      const returnType = parseType(ctx);
      return Object.freeze({
        type: "TSFunctionType" as const,
        start,
        end: returnType.end,
        params: Object.freeze([]),
        typeParameters: null,
        returnType: Object.freeze({
          type: "TSTypeAnnotation" as const,
          start: returnType.start,
          end: returnType.end,
          typeAnnotation: returnType,
        }),
      });
    }
    // Empty parens with no arrow - treat as void-like
    return Object.freeze({
      type: "TSKeywordType" as const,
      start,
      end: parenEnd,
      keyword: "void",
    });
  }

  // Try to parse as function type by looking for arrow after params
  const saved = ctx.lexer.saveState();
  try {
    // Parse params (simplified - identifiers with optional types)
    const params = parseFunctionTypeParams(ctx);
    ctx.lexer.expect(TokenType.RightParen);

    // Check for arrow
    if (ctx.lexer.is(TokenType.Arrow)) {
      ctx.lexer.next(); // consume '=>'
      const returnType = parseType(ctx);
      return Object.freeze({
        type: "TSFunctionType" as const,
        start,
        end: returnType.end,
        params: Object.freeze(params),
        typeParameters: null,
        returnType: Object.freeze({
          type: "TSTypeAnnotation" as const,
          start: returnType.start,
          end: returnType.end,
          typeAnnotation: returnType,
        }),
      });
    }

    // Check for return type annotation ): Type
    if (ctx.lexer.is(TokenType.Colon)) {
      ctx.lexer.next();
      const returnType = parseType(ctx);
      return Object.freeze({
        type: "TSFunctionType" as const,
        start,
        end: returnType.end,
        params: Object.freeze(params),
        typeParameters: null,
        returnType: Object.freeze({
          type: "TSTypeAnnotation" as const,
          start: returnType.start,
          end: returnType.end,
          typeAnnotation: returnType,
        }),
      });
    }

    // If we have exactly one param with no type, this was a parenthesized type
    if (params.length === 1) {
      ctx.lexer.restoreState(saved);
    }
  } catch {
    ctx.lexer.restoreState(saved);
  }

  // Parse as parenthesized type
  ctx.lexer.restoreState(saved);
  ctx.lexer.next(); // consume '(' again
  const innerType = parseType(ctx);
  const end = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightParen);

  return Object.freeze({
    type: "TSParenthesizedType" as const,
    start,
    end,
    typeAnnotation: innerType,
  });
};

/**
 * Parse function type parameters (simplified).
 */
const parseFunctionTypeParams = (ctx: TSParserContext): AST.Pattern[] => {
  const params: AST.Pattern[] = [];

  while (!ctx.lexer.is(TokenType.RightParen) && !ctx.lexer.is(TokenType.EOF)) {
    if (params.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    // Rest param
    if (ctx.lexer.is(TokenType.Ellipsis)) {
      ctx.lexer.next();
    }

    const token = ctx.lexer.next();
    const id: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      start: token.start,
      end: token.end,
      name: token.value as string,
    });

    // Optional marker
    if (ctx.lexer.is(TokenType.QuestionMark)) {
      ctx.lexer.next();
    }

    // Type annotation
    if (ctx.lexer.is(TokenType.Colon)) {
      ctx.lexer.next();
      parseType(ctx); // consume but we don't store it on the pattern
    }

    params.push(id);
  }

  return params;
};

/**
 * Parse a tuple type: [A, B, C]
 */
const parseTupleType = (ctx: TSParserContext): AST.TSTupleType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume '['

  const elementTypes: AST.TSType[] = [];

  while (
    !ctx.lexer.is(TokenType.RightBracket) &&
    !ctx.lexer.is(TokenType.EOF)
  ) {
    if (elementTypes.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }
    elementTypes.push(parseType(ctx));

    // Named tuple element: name: Type
    if (ctx.lexer.is(TokenType.Colon)) {
      ctx.lexer.next();
      // Replace the last element (was the name) with the actual type
      elementTypes.pop();
      elementTypes.push(parseType(ctx));
    }

    // Optional element marker
    if (ctx.lexer.is(TokenType.QuestionMark)) {
      ctx.lexer.next();
    }
  }

  const end = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightBracket);

  return Object.freeze({
    type: "TSTupleType" as const,
    start,
    end,
    elementTypes: Object.freeze(elementTypes),
  });
};

/**
 * Parse a type literal { ... } or mapped type { [K in T]: V }.
 */
const parseTypeLiteralOrMappedType = (ctx: TSParserContext): AST.TSType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume '{'

  // Check for mapped type: { [K in T]: V }
  // Or index signature: { [key: string]: V }
  if (
    ctx.lexer.is(TokenType.LeftBracket) ||
    isModifier(ctx, "readonly") ||
    isModifier(ctx, "+") ||
    isModifier(ctx, "-")
  ) {
    // Skip optional readonly/+/- modifiers
    if (
      isIdent(ctx.lexer, "readonly") ||
      ctx.lexer.is(TokenType.Plus) ||
      ctx.lexer.is(TokenType.Minus)
    ) {
      ctx.lexer.next();
    }

    if (ctx.lexer.is(TokenType.LeftBracket)) {
      const saved = ctx.lexer.saveState();
      ctx.lexer.next(); // consume '['

      const keyToken = ctx.lexer.next();

      // Check for mapped type: [K in T]
      if (ctx.lexer.is(TokenType.In)) {
        ctx.lexer.next(); // consume 'in'
        const constraintType = parseType(ctx);

        // Optional 'as' clause for key remapping
        let nameType: AST.TSType | null = null;
        if (ctx.lexer.is(TokenType.As)) {
          ctx.lexer.next();
          nameType = parseType(ctx);
        }

        ctx.lexer.expect(TokenType.RightBracket);

        // Optional modifier
        let optional: boolean | "+" | "-" = false;
        if (ctx.lexer.is(TokenType.QuestionMark)) {
          optional = true;
          ctx.lexer.next();
        } else if (
          ctx.lexer.is(TokenType.Minus) ||
          ctx.lexer.is(TokenType.Plus)
        ) {
          const modToken = ctx.lexer.next();
          optional = modToken.value as "+" | "-";
          if (ctx.lexer.is(TokenType.QuestionMark)) {
            ctx.lexer.next();
          }
        }

        let typeAnnotation: AST.TSType | null = null;
        if (ctx.lexer.is(TokenType.Colon)) {
          ctx.lexer.next();
          typeAnnotation = parseType(ctx);
        }

        // Consume optional semicolon
        if (ctx.lexer.is(TokenType.Semicolon)) {
          ctx.lexer.next();
        }

        const end = ctx.lexer.token.end;
        ctx.lexer.expect(TokenType.RightBrace);

        const keyName: AST.Identifier = Object.freeze({
          type: "Identifier" as const,
          start: keyToken.start,
          end: keyToken.end,
          name: keyToken.value as string,
        });

        return Object.freeze({
          type: "TSMappedType" as const,
          start,
          end,
          typeParameter: Object.freeze({
            type: "TSTypeParameter" as const,
            start: keyName.start,
            end: constraintType.end,
            name: keyName,
            constraint: constraintType,
            default: null,
          }),
          typeAnnotation,
          nameType,
          optional,
          readonly: false,
        });
      }

      // Restore and parse as type literal
      ctx.lexer.restoreState(saved);
    }
  }

  // Parse as type literal with members
  const members: AST.TSTypeElement[] = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    members.push(parseTypeMember(ctx));

    // Consume separator
    if (ctx.lexer.is(TokenType.Semicolon) || ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }
  }

  const end = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "TSTypeLiteral" as const,
    start,
    end,
    members: Object.freeze(members),
  });
};

/**
 * Check if current token is a modifier.
 */
const isModifier = (ctx: TSParserContext, value: string): boolean => {
  return ctx.lexer.token.value === value;
};

/**
 * Parse a type member (property signature, method signature, index signature, etc.)
 */
const parseTypeMember = (ctx: TSParserContext): AST.TSTypeElement => {
  const start = ctx.lexer.token.start;

  // Handle readonly modifier
  let isReadonly = false;
  if (isIdent(ctx.lexer, "readonly")) {
    isReadonly = true;
    ctx.lexer.next();
  }

  // Index signature: [key: string]: value
  if (ctx.lexer.is(TokenType.LeftBracket)) {
    ctx.lexer.next(); // consume '['
    const paramToken = ctx.lexer.next();
    const param: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      start: paramToken.start,
      end: paramToken.end,
      name: paramToken.value as string,
    });
    ctx.lexer.expect(TokenType.Colon);
    parseType(ctx); // index type
    ctx.lexer.expect(TokenType.RightBracket);

    let typeAnnotation: AST.TSTypeAnnotation | null = null;
    if (ctx.lexer.is(TokenType.Colon)) {
      typeAnnotation = tryParseTypeAnnotation(ctx);
    }

    return Object.freeze({
      type: "TSIndexSignature" as const,
      start,
      end: typeAnnotation?.end ?? ctx.lexer.token.start,
      parameters: Object.freeze([param]),
      typeAnnotation,
      readonly: isReadonly,
    });
  }

  // Call signature: (params): ReturnType
  if (ctx.lexer.is(TokenType.LeftParen) || ctx.lexer.is(TokenType.LessThan)) {
    const typeParameters = tryParseTypeParameters(ctx);
    ctx.lexer.expect(TokenType.LeftParen);
    const params = parseFunctionTypeParams(ctx);
    ctx.lexer.expect(TokenType.RightParen);
    const returnType = tryParseTypeAnnotation(ctx);

    return Object.freeze({
      type: "TSCallSignature" as const,
      start,
      end: returnType?.end ?? ctx.lexer.token.start,
      typeParameters,
      params: Object.freeze(params),
      returnType,
    });
  }

  // Construct signature: new (params): ReturnType
  if (ctx.lexer.is(TokenType.New)) {
    ctx.lexer.next();
    const typeParameters = tryParseTypeParameters(ctx);
    ctx.lexer.expect(TokenType.LeftParen);
    const params = parseFunctionTypeParams(ctx);
    ctx.lexer.expect(TokenType.RightParen);
    const returnType = tryParseTypeAnnotation(ctx);

    return Object.freeze({
      type: "TSConstructSignature" as const,
      start,
      end: returnType?.end ?? ctx.lexer.token.start,
      typeParameters,
      params: Object.freeze(params),
      returnType,
    });
  }

  // Property or method signature
  let computed = false;
  let key: AST.Expression;

  if (ctx.lexer.is(TokenType.LeftBracket)) {
    // Computed key
    computed = true;
    ctx.lexer.next();
    key = ctx.parseExpression();
    ctx.lexer.expect(TokenType.RightBracket);
  } else {
    const keyToken = ctx.lexer.next();
    if (
      keyToken.type === TokenType.StringLiteral ||
      keyToken.type === TokenType.NumericLiteral
    ) {
      key = Object.freeze({
        type: "Literal" as const,
        start: keyToken.start,
        end: keyToken.end,
        value: keyToken.value as string | number,
        raw: keyToken.raw,
      });
    } else {
      key = Object.freeze({
        type: "Identifier" as const,
        start: keyToken.start,
        end: keyToken.end,
        name: keyToken.value as string,
      });
    }
  }

  // Optional marker
  let optional = false;
  if (ctx.lexer.is(TokenType.QuestionMark)) {
    optional = true;
    ctx.lexer.next();
  }

  // Method signature: key(params): ReturnType
  if (ctx.lexer.is(TokenType.LeftParen) || ctx.lexer.is(TokenType.LessThan)) {
    const typeParameters = tryParseTypeParameters(ctx);
    ctx.lexer.expect(TokenType.LeftParen);
    const params = parseFunctionTypeParams(ctx);
    ctx.lexer.expect(TokenType.RightParen);
    const returnType = tryParseTypeAnnotation(ctx);

    return Object.freeze({
      type: "TSMethodSignature" as const,
      start,
      end: returnType?.end ?? ctx.lexer.token.start,
      key,
      typeParameters,
      params: Object.freeze(params),
      returnType,
      computed,
      optional,
    });
  }

  // Property signature: key: Type
  const typeAnnotation = tryParseTypeAnnotation(ctx);

  return Object.freeze({
    type: "TSPropertySignature" as const,
    start,
    end: typeAnnotation?.end ?? key.end,
    key,
    typeAnnotation,
    computed,
    optional,
    readonly: isReadonly,
  });
};

/**
 * Parse a literal type.
 */
const parseLiteralType = (ctx: TSParserContext): AST.TSLiteralType => {
  const token = ctx.lexer.next();
  let value: string | number | boolean | null;
  if (token.type === TokenType.True) {
    value = true;
  } else if (token.type === TokenType.False) {
    value = false;
  } else if (token.type === TokenType.Null) {
    value = null;
  } else {
    value = token.value as string | number;
  }

  return Object.freeze({
    type: "TSLiteralType" as const,
    start: token.start,
    end: token.end,
    literal: Object.freeze({
      type: "Literal" as const,
      start: token.start,
      end: token.end,
      value,
      raw: token.raw,
    }),
  });
};

/**
 * Parse a negative numeric literal type (-1, -2.5).
 */
const parseNegativeLiteralType = (ctx: TSParserContext): AST.TSLiteralType => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume '-'
  const numToken = ctx.lexer.next();

  return Object.freeze({
    type: "TSLiteralType" as const,
    start,
    end: numToken.end,
    literal: Object.freeze({
      type: "UnaryExpression" as const,
      start,
      end: numToken.end,
      operator: "-" as const,
      prefix: true,
      argument: Object.freeze({
        type: "Literal" as const,
        start: numToken.start,
        end: numToken.end,
        value: numToken.value as number,
        raw: numToken.raw,
      }),
    }),
  });
};

// ============================================================
// Declaration Parsing
// ============================================================

/**
 * Parse an interface declaration.
 */
export const parseInterfaceDeclaration = (
  ctx: TSParserContext,
  isDeclare: boolean = false,
): AST.TSInterfaceDeclaration => {
  const start = ctx.lexer.token.start;
  expectIdent(ctx.lexer, "interface");

  const nameToken = ctx.lexer.next();
  const id: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  const typeParameters = tryParseTypeParameters(ctx);

  // Parse extends clause
  const extendsTypes: AST.TSExpressionWithTypeArguments[] = [];
  if (ctx.lexer.is(TokenType.Extends)) {
    ctx.lexer.next();
    do {
      const exprStart = ctx.lexer.token.start;
      const baseToken = ctx.lexer.next();
      let expression: AST.Identifier | AST.TSQualifiedName = Object.freeze({
        type: "Identifier" as const,
        start: baseToken.start,
        end: baseToken.end,
        name: baseToken.value as string,
      });

      while (ctx.lexer.is(TokenType.Dot)) {
        ctx.lexer.next();
        const rightToken = ctx.lexer.next();
        const right: AST.Identifier = Object.freeze({
          type: "Identifier" as const,
          start: rightToken.start,
          end: rightToken.end,
          name: rightToken.value as string,
        });
        expression = Object.freeze({
          type: "TSQualifiedName" as const,
          start: expression.start,
          end: right.end,
          left: expression,
          right,
        });
      }

      const typeArgs = tryParseTypeArguments(ctx);

      extendsTypes.push(
        Object.freeze({
          type: "TSExpressionWithTypeArguments" as const,
          start: exprStart,
          end: typeArgs?.end ?? expression.end,
          expression,
          typeParameters: typeArgs,
        }),
      );
    } while (ctx.lexer.eat(TokenType.Comma));
  }

  // Parse body
  const bodyStart = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.LeftBrace);

  const members: AST.TSTypeElement[] = [];
  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    members.push(parseTypeMember(ctx));
    if (ctx.lexer.is(TokenType.Semicolon) || ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }
  }

  const bodyEnd = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightBrace);

  const body: AST.TSInterfaceBody = Object.freeze({
    type: "TSInterfaceBody" as const,
    start: bodyStart,
    end: bodyEnd,
    body: Object.freeze(members),
  });

  return Object.freeze({
    type: "TSInterfaceDeclaration" as const,
    start,
    end: bodyEnd,
    id,
    typeParameters,
    extends: Object.freeze(extendsTypes),
    body,
    declare: isDeclare,
  });
};

/**
 * Parse a type alias declaration.
 */
export const parseTypeAliasDeclaration = (
  ctx: TSParserContext,
  isDeclare: boolean = false,
): AST.TSTypeAliasDeclaration => {
  const start = ctx.lexer.token.start;
  expectIdent(ctx.lexer, "type");

  const nameToken = ctx.lexer.next();
  const id: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  const typeParameters = tryParseTypeParameters(ctx);

  ctx.lexer.expect(TokenType.Equals);
  const typeAnnotation = parseType(ctx);

  // Consume optional semicolon
  if (ctx.lexer.is(TokenType.Semicolon)) {
    ctx.lexer.next();
  }

  return Object.freeze({
    type: "TSTypeAliasDeclaration" as const,
    start,
    end: typeAnnotation.end,
    id,
    typeParameters,
    typeAnnotation,
    declare: isDeclare,
  });
};

/**
 * Parse an enum declaration.
 */
export const parseEnumDeclaration = (
  ctx: TSParserContext,
  isConst: boolean = false,
  isDeclare: boolean = false,
  startPos?: number,
): AST.TSEnumDeclaration => {
  const start = startPos ?? ctx.lexer.token.start;
  expectIdent(ctx.lexer, "enum");

  const nameToken = ctx.lexer.next();
  const id: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: nameToken.start,
    end: nameToken.end,
    name: nameToken.value as string,
  });

  ctx.lexer.expect(TokenType.LeftBrace);

  const members: AST.TSEnumMember[] = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    if (members.length > 0 && ctx.lexer.is(TokenType.Comma)) {
      ctx.lexer.next();
    }

    if (ctx.lexer.is(TokenType.RightBrace)) {
      break;
    }

    const memberStart = ctx.lexer.token.start;
    let memberId: AST.Identifier | AST.Literal;

    if (ctx.lexer.is(TokenType.StringLiteral)) {
      const strToken = ctx.lexer.next();
      memberId = Object.freeze({
        type: "Literal" as const,
        start: strToken.start,
        end: strToken.end,
        value: strToken.value as string,
        raw: strToken.raw,
      });
    } else {
      const memberToken = ctx.lexer.next();
      memberId = Object.freeze({
        type: "Identifier" as const,
        start: memberToken.start,
        end: memberToken.end,
        name: memberToken.value as string,
      });
    }

    let initializer: AST.Expression | null = null;
    if (ctx.lexer.is(TokenType.Equals)) {
      ctx.lexer.next();
      initializer = ctx.parseAssignmentExpression();
    }

    members.push(
      Object.freeze({
        type: "TSEnumMember" as const,
        start: memberStart,
        end: initializer?.end ?? memberId.end,
        id: memberId,
        initializer,
      }),
    );
  }

  const end = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "TSEnumDeclaration" as const,
    start,
    end,
    id,
    members: Object.freeze(members),
    const: isConst,
    declare: isDeclare,
  });
};

/**
 * Parse a namespace or module declaration.
 */
export const parseNamespaceDeclaration = (
  ctx: TSParserContext,
  isDeclare: boolean = false,
): AST.TSModuleDeclaration => {
  const start = ctx.lexer.token.start;

  // Consume 'namespace' or 'module'
  ctx.lexer.next();

  let id: AST.Identifier | AST.Literal;
  if (ctx.lexer.is(TokenType.StringLiteral)) {
    const strToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Literal" as const,
      start: strToken.start,
      end: strToken.end,
      value: strToken.value as string,
      raw: strToken.raw,
    });
  } else {
    const nameToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Identifier" as const,
      start: nameToken.start,
      end: nameToken.end,
      name: nameToken.value as string,
    });
  }

  // Check for nested namespace: namespace A.B { ... }
  if (ctx.lexer.is(TokenType.Dot)) {
    ctx.lexer.next();
    const inner = parseNamespaceDeclaration(ctx, isDeclare);
    return Object.freeze({
      type: "TSModuleDeclaration" as const,
      start,
      end: inner.end,
      id,
      body: inner,
      declare: isDeclare,
      global: false,
    });
  }

  // Parse body
  const bodyStart = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.LeftBrace);

  const bodyStatements: Array<AST.Statement | AST.ModuleDeclaration> = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    const stmt = ctx.parseStatement();
    bodyStatements.push(stmt);
  }

  const bodyEnd = ctx.lexer.token.end;
  ctx.lexer.expect(TokenType.RightBrace);

  const body: AST.TSModuleBlock = Object.freeze({
    type: "TSModuleBlock" as const,
    start: bodyStart,
    end: bodyEnd,
    body: Object.freeze(bodyStatements),
  });

  return Object.freeze({
    type: "TSModuleDeclaration" as const,
    start,
    end: bodyEnd,
    id,
    body,
    declare: isDeclare,
    global: false,
  });
};

/**
 * Check if the current `type` keyword starts a type alias declaration
 * (i.e., it's followed by an identifier and then `=` or `<`).
 */
export const isTypeAliasStart = (lexer: Lexer): boolean => {
  const saved = lexer.saveState();
  lexer.next(); // consume 'type'

  // The next token must be an identifier (TS contextual keywords are identifiers)
  if (!lexer.is(TokenType.Identifier)) {
    lexer.restoreState(saved);
    return false;
  }

  lexer.next(); // consume identifier

  const result = lexer.is(TokenType.Equals) || lexer.is(TokenType.LessThan);

  lexer.restoreState(saved);
  return result;
};

/**
 * Check if the current `interface` keyword starts an interface declaration
 * (i.e., it's followed by an identifier).
 */
export const isInterfaceStart = (lexer: Lexer): boolean => {
  const saved = lexer.saveState();
  lexer.next(); // consume 'interface'
  const result = lexer.is(TokenType.Identifier);
  lexer.restoreState(saved);
  return result;
};

/**
 * Parse a `declare` statement. Handles all forms:
 * - declare function ...
 * - declare class ...
 * - declare const/let/var ...
 * - declare interface ...
 * - declare type ...
 * - declare enum ...
 * - declare namespace/module ...
 */
export const parseDeclareStatement = (
  ctx: TSParserContext,
): AST.Statement | AST.ModuleDeclaration => {
  const start = ctx.lexer.token.start;
  ctx.lexer.next(); // consume 'declare'

  if (isIdent(ctx.lexer, "interface")) {
    const decl = parseInterfaceDeclaration(ctx, true);
    return Object.freeze({
      ...decl,
      start,
      declare: true,
    }) as unknown as AST.Statement;
  }

  if (isIdent(ctx.lexer, "type") && isTypeAliasStart(ctx.lexer)) {
    const decl = parseTypeAliasDeclaration(ctx, true);
    return Object.freeze({
      ...decl,
      start,
      declare: true,
    }) as unknown as AST.Statement;
  }

  if (isIdent(ctx.lexer, "enum")) {
    return parseEnumDeclaration(ctx, false, true) as unknown as AST.Statement;
  }

  if (ctx.lexer.is(TokenType.Const)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    if (isIdent(ctx.lexer, "enum")) {
      return parseEnumDeclaration(ctx, true, true) as unknown as AST.Statement;
    }
    ctx.lexer.restoreState(saved);
  }

  if (isIdent(ctx.lexer, "namespace") || isIdent(ctx.lexer, "module")) {
    // For declare namespace/module, skip the body entirely since it's ambient
    const nsStart = ctx.lexer.token.start;
    ctx.lexer.next(); // consume 'namespace'/'module'
    ctx.lexer.next(); // consume name
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  // For function, class, var, let, const - parse normally but wrap as declare
  // For simplicity, skip to end of statement (these are ambient declarations)
  // We need to produce AST nodes the transform can strip
  if (ctx.lexer.is(TokenType.Function)) {
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  if (ctx.lexer.is(TokenType.Class)) {
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  if (
    ctx.lexer.is(TokenType.Var) ||
    ctx.lexer.is(TokenType.Let) ||
    ctx.lexer.is(TokenType.Const)
  ) {
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  if (isIdent(ctx.lexer, "abstract")) {
    ctx.lexer.next();
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  // Global augmentation: declare global { ... }
  if (
    ctx.lexer.is(TokenType.Identifier) &&
    ctx.lexer.token.value === "global"
  ) {
    skipToStatementEnd(ctx);
    return makeDummyTypeAlias(start, ctx.lexer.token.start);
  }

  // Fallback
  skipToStatementEnd(ctx);
  return makeDummyTypeAlias(start, ctx.lexer.token.start);
};

/**
 * Create a dummy type alias declaration for stripped 'declare' statements.
 */
const makeDummyTypeAlias = (start: number, end: number): AST.Statement => {
  return Object.freeze({
    type: "TSTypeAliasDeclaration" as const,
    start,
    end,
    id: Object.freeze({
      type: "Identifier" as const,
      start,
      end: start,
      name: "",
    }),
    typeParameters: null,
    typeAnnotation: Object.freeze({
      type: "TSKeywordType" as const,
      start,
      end: start,
      keyword: "any",
    }),
    declare: true,
  }) as unknown as AST.Statement;
};

/**
 * Skip to the end of a statement (semicolon, or balanced brace, or newline).
 */
const skipToStatementEnd = (ctx: TSParserContext): void => {
  let braceDepth = 0;

  while (!ctx.lexer.is(TokenType.EOF)) {
    if (ctx.lexer.is(TokenType.LeftBrace)) {
      braceDepth++;
      ctx.lexer.next();
    } else if (ctx.lexer.is(TokenType.RightBrace)) {
      if (braceDepth > 0) {
        braceDepth--;
        ctx.lexer.next();
        if (braceDepth === 0) {
          return;
        }
      } else {
        return;
      }
    } else if (ctx.lexer.is(TokenType.Semicolon) && braceDepth === 0) {
      ctx.lexer.next();
      return;
    } else {
      ctx.lexer.next();
    }
  }
};

/**
 * Parse parameter properties in constructor parameters.
 * Checks if the current token is an accessibility modifier or readonly.
 */
export const isParameterPropertyStart = (lexer: Lexer): boolean => {
  const val = lexer.token.value;
  return (
    val === "private" ||
    val === "protected" ||
    val === "public" ||
    isIdent(lexer, "readonly")
  );
};

/**
 * Parse a parameter property.
 */
export const parseParameterProperty = (
  ctx: TSParserContext,
): AST.TSParameterProperty => {
  const start = ctx.lexer.token.start;
  let accessibility: "public" | "protected" | "private" | null = null;
  let isReadonly = false;

  // Consume accessibility modifier
  const val = ctx.lexer.token.value as string;
  if (val === "public" || val === "protected" || val === "private") {
    accessibility = val;
    ctx.lexer.next();
  }

  // Consume readonly
  if (isIdent(ctx.lexer, "readonly")) {
    isReadonly = true;
    ctx.lexer.next();
  }

  // Parse parameter name
  const paramToken = ctx.lexer.next();
  let parameter: AST.Identifier | AST.AssignmentPattern;
  const paramId: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: paramToken.start,
    end: paramToken.end,
    name: paramToken.value as string,
  });

  // Skip optional marker
  if (ctx.lexer.is(TokenType.QuestionMark)) {
    ctx.lexer.next();
  }

  // Skip type annotation
  if (ctx.lexer.is(TokenType.Colon)) {
    ctx.lexer.next();
    parseType(ctx);
  }

  // Check for default value
  if (ctx.lexer.is(TokenType.Equals)) {
    ctx.lexer.next();
    const defaultValue = ctx.parseAssignmentExpression();
    parameter = Object.freeze({
      type: "AssignmentPattern" as const,
      start: paramId.start,
      end: defaultValue.end,
      left: paramId,
      right: defaultValue,
    });
  } else {
    parameter = paramId;
  }

  return Object.freeze({
    type: "TSParameterProperty" as const,
    start,
    end: parameter.end,
    parameter,
    accessibility,
    readonly: isReadonly,
  });
};
