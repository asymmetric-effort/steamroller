/**
 * Destructuring pattern parsing for the Steamroller parser.
 *
 * Handles parsing of array patterns, object patterns, rest elements,
 * and assignment patterns in declarations, parameters, and assignments.
 * Also provides expression-to-pattern conversion for assignment contexts.
 *
 * Uses iterative stack-based approaches instead of recursion.
 *
 * @module parser/patterns
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType, tokenTypeName } from "./token-types.js";

/**
 * Parse a binding pattern (for declarations and parameters).
 *
 * Dispatches to array pattern, object pattern, or identifier binding
 * based on the current token type.
 *
 * @param lexer - The lexer instance.
 * @param parseAssignExpr - Function to parse an assignment expression.
 * @returns The parsed Pattern AST node.
 * @throws {SyntaxError} If no valid binding pattern is found.
 */
export const parseBindingPattern = (
  lexer: Lexer,
  parseAssignExpr: () => AST.Expression,
): AST.Pattern => {
  if (lexer.is(TokenType.LeftBracket)) {
    return parseArrayPattern(lexer, parseAssignExpr);
  }
  if (lexer.is(TokenType.LeftBrace)) {
    return parseObjectPattern(lexer, parseAssignExpr);
  }
  // Simple identifier binding
  return parseBindingIdentifier(lexer);
};

/**
 * Parse a simple identifier as a binding pattern.
 *
 * @param lexer - The lexer instance.
 * @returns An Identifier AST node.
 * @throws {SyntaxError} If the current token is not an identifier.
 */
const parseBindingIdentifier = (lexer: Lexer): AST.Identifier => {
  if (!lexer.is(TokenType.Identifier)) {
    const typeName = tokenTypeName(lexer.token.type);
    throw new SyntaxError(
      `Expected binding pattern but found ${typeName} at position ${lexer.token.start}`,
    );
  }
  const token = lexer.next();
  return Object.freeze({
    type: "Identifier" as const,
    name: token.value as string,
    start: token.start,
    end: token.end,
  });
};

/**
 * Parse an array destructuring pattern: [a, b, ...rest]
 *
 * Supports holes (elision), default values, rest elements,
 * and nested patterns.
 *
 * @param lexer - The lexer instance.
 * @param parseAssignExpr - Function to parse an assignment expression.
 * @returns An ArrayPattern AST node.
 * @throws {SyntaxError} For unterminated patterns.
 */
export const parseArrayPattern = (
  lexer: Lexer,
  parseAssignExpr: () => AST.Expression,
): AST.ArrayPattern => {
  const startToken = lexer.next(); // consume [
  const start = startToken.start;
  const elements: Array<AST.Pattern | null> = [];

  while (!lexer.is(TokenType.RightBracket)) {
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(`Unterminated array pattern at position ${start}`);
    }

    // Handle holes (elision): [,, a]
    if (lexer.is(TokenType.Comma)) {
      elements.push(null);
      lexer.next();
      continue;
    }

    // Handle rest element: [...rest]
    if (lexer.is(TokenType.Ellipsis)) {
      const restStart = lexer.token.start;
      lexer.next();
      const argument = parseBindingPattern(lexer, parseAssignExpr);
      elements.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: restStart,
          end: argument.end,
        }),
      );
      // Rest must be last element - skip trailing comma if present
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      }
      break;
    }

    // Parse element pattern
    const elemPattern = parseBindingPattern(lexer, parseAssignExpr);

    // Check for default value: pattern = expr
    if (lexer.is(TokenType.Equals)) {
      const assignStart = elemPattern.start;
      lexer.next();
      const right = parseAssignExpr();
      elements.push(
        Object.freeze({
          type: "AssignmentPattern" as const,
          left: elemPattern,
          right,
          start: assignStart,
          end: right.end,
        }),
      );
    } else {
      elements.push(elemPattern);
    }

    // Consume trailing comma or expect closing bracket
    if (!lexer.is(TokenType.RightBracket)) {
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      } else {
        throw new SyntaxError(
          `Expected ',' or ']' in array pattern at position ${lexer.token.start}`,
        );
      }
    }
  }

  const endToken = lexer.next(); // consume ]
  const end = endToken.end;

  return Object.freeze({
    type: "ArrayPattern" as const,
    start,
    end,
    elements: Object.freeze(elements),
  });
};

/**
 * Parse an object destructuring pattern: { a, b: alias, c = default, ...rest }
 *
 * Supports shorthand properties, renamed bindings, computed keys,
 * default values, rest elements, and nested patterns.
 *
 * @param lexer - The lexer instance.
 * @param parseAssignExpr - Function to parse an assignment expression.
 * @returns An ObjectPattern AST node.
 * @throws {SyntaxError} For unterminated patterns.
 */
export const parseObjectPattern = (
  lexer: Lexer,
  parseAssignExpr: () => AST.Expression,
): AST.ObjectPattern => {
  const startToken = lexer.next(); // consume {
  const start = startToken.start;
  const properties: Array<AST.Property | AST.RestElement> = [];

  while (!lexer.is(TokenType.RightBrace)) {
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(`Unterminated object pattern at position ${start}`);
    }

    // Handle rest element: { ...rest }
    if (lexer.is(TokenType.Ellipsis)) {
      const restStart = lexer.token.start;
      lexer.next();
      const argument = parseBindingIdentifier(lexer);
      properties.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: restStart,
          end: argument.end,
        }),
      );
      // Rest must be last property - skip trailing comma if present
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      }
      break;
    }

    // Parse property pattern
    const propStart = lexer.token.start;
    let computed = false;
    let key: AST.Expression;

    // Computed property key: [expr]
    if (lexer.is(TokenType.LeftBracket)) {
      computed = true;
      lexer.next(); // consume [
      key = parseAssignExpr();
      lexer.expect(TokenType.RightBracket);
    } else if (lexer.is(TokenType.StringLiteral)) {
      const litToken = lexer.next();
      key = Object.freeze({
        type: "Literal" as const,
        value: litToken.value as string,
        raw: litToken.raw,
        start: litToken.start,
        end: litToken.end,
      });
    } else if (lexer.is(TokenType.NumericLiteral)) {
      const litToken = lexer.next();
      key = Object.freeze({
        type: "Literal" as const,
        value: litToken.value as number,
        raw: litToken.raw,
        start: litToken.start,
        end: litToken.end,
      });
    } else {
      // Identifier key (or keyword used as property name)
      const keyToken = lexer.next();
      key = Object.freeze({
        type: "Identifier" as const,
        name: keyToken.value as string,
        start: keyToken.start,
        end: keyToken.end,
      });
    }

    // Check for colon (rename binding): key: pattern
    if (lexer.is(TokenType.Colon)) {
      lexer.next(); // consume :
      const valuePattern = parseBindingPattern(lexer, parseAssignExpr);

      // Check for default on the value pattern
      if (lexer.is(TokenType.Equals)) {
        const assignStart = valuePattern.start;
        lexer.next();
        const right = parseAssignExpr();
        const assignPattern: AST.AssignmentPattern = Object.freeze({
          type: "AssignmentPattern" as const,
          left: valuePattern,
          right,
          start: assignStart,
          end: right.end,
        });
        properties.push(
          Object.freeze({
            type: "Property" as const,
            key,
            value: assignPattern,
            kind: "init" as const,
            method: false,
            shorthand: false,
            computed,
            start: propStart,
            end: assignPattern.end,
          }),
        );
      } else {
        properties.push(
          Object.freeze({
            type: "Property" as const,
            key,
            value: valuePattern,
            kind: "init" as const,
            method: false,
            shorthand: false,
            computed,
            start: propStart,
            end: valuePattern.end,
          }),
        );
      }
    } else if (lexer.is(TokenType.Equals)) {
      // Shorthand with default: { a = 1 }
      lexer.next(); // consume =
      const right = parseAssignExpr();
      const assignPattern: AST.AssignmentPattern = Object.freeze({
        type: "AssignmentPattern" as const,
        left: key as AST.Identifier,
        right,
        start: key.start,
        end: right.end,
      });
      properties.push(
        Object.freeze({
          type: "Property" as const,
          key,
          value: assignPattern,
          kind: "init" as const,
          method: false,
          shorthand: true,
          computed: false,
          start: propStart,
          end: assignPattern.end,
        }),
      );
    } else {
      // Shorthand property: { a }
      properties.push(
        Object.freeze({
          type: "Property" as const,
          key,
          value: key as AST.Identifier,
          kind: "init" as const,
          method: false,
          shorthand: true,
          computed: false,
          start: propStart,
          end: key.end,
        }),
      );
    }

    // Consume trailing comma or expect closing brace
    if (!lexer.is(TokenType.RightBrace)) {
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      } else {
        throw new SyntaxError(
          `Expected ',' or '}' in object pattern at position ${lexer.token.start}`,
        );
      }
    }
  }

  const endToken = lexer.next(); // consume }
  const end = endToken.end;

  return Object.freeze({
    type: "ObjectPattern" as const,
    start,
    end,
    properties: Object.freeze(properties),
  });
};

/**
 * Convert an expression to a pattern (for assignment patterns).
 *
 * Used when the parser realizes (expr) = value means destructuring assignment.
 * Uses an iterative stack-based conversion approach.
 *
 * Conversion rules:
 * - ArrayExpression -> ArrayPattern
 * - ObjectExpression -> ObjectPattern
 * - Identifier -> Identifier (already valid)
 * - MemberExpression -> MemberExpression (valid assignment target)
 * - AssignmentExpression (=) -> AssignmentPattern
 * - SpreadElement -> RestElement
 *
 * @param expr - The expression to convert.
 * @returns The converted Pattern AST node.
 * @throws {SyntaxError} If the expression cannot be converted to a pattern.
 */
export const expressionToPattern = (expr: AST.Expression): AST.Pattern => {
  // Simple cases handled directly
  if (expr.type === "Identifier") {
    return expr;
  }
  if (expr.type === "MemberExpression") {
    return expr;
  }
  if (expr.type === "AssignmentExpression") {
    const assignExpr = expr as AST.AssignmentExpression;
    if (assignExpr.operator !== "=") {
      throw new SyntaxError(
        `Invalid destructuring assignment operator '${assignExpr.operator}' at position ${assignExpr.start}`,
      );
    }
    const left = expressionToPatternShallow(assignExpr.left as AST.Expression);
    return Object.freeze({
      type: "AssignmentPattern" as const,
      left,
      right: assignExpr.right,
      start: assignExpr.start,
      end: assignExpr.end,
    });
  }

  if (expr.type === "ArrayExpression") {
    return convertArrayExpressionToPattern(expr as AST.ArrayExpression);
  }

  if (expr.type === "ObjectExpression") {
    return convertObjectExpressionToPattern(expr as AST.ObjectExpression);
  }

  throw new SyntaxError(
    `Invalid destructuring target at position ${expr.start}`,
  );
};

/**
 * Shallow conversion of expression to pattern for nested elements.
 * Handles the same cases as expressionToPattern.
 *
 * @param expr - The expression to convert.
 * @returns The converted Pattern AST node.
 */
const expressionToPatternShallow = (expr: AST.Expression): AST.Pattern => {
  if (expr.type === "Identifier") {
    return expr;
  }
  if (expr.type === "MemberExpression") {
    return expr;
  }
  if (expr.type === "ArrayExpression") {
    return convertArrayExpressionToPattern(expr as AST.ArrayExpression);
  }
  if (expr.type === "ObjectExpression") {
    return convertObjectExpressionToPattern(expr as AST.ObjectExpression);
  }
  if (expr.type === "AssignmentExpression") {
    const assignExpr = expr as AST.AssignmentExpression;
    if (assignExpr.operator !== "=") {
      throw new SyntaxError(
        `Invalid destructuring assignment operator '${assignExpr.operator}' at position ${assignExpr.start}`,
      );
    }
    const left = expressionToPatternShallow(assignExpr.left as AST.Expression);
    return Object.freeze({
      type: "AssignmentPattern" as const,
      left,
      right: assignExpr.right,
      start: assignExpr.start,
      end: assignExpr.end,
    });
  }
  throw new SyntaxError(
    `Invalid destructuring target at position ${expr.start}`,
  );
};

/**
 * Convert an ArrayExpression to an ArrayPattern iteratively.
 *
 * Uses a stack to process nested arrays/objects without recursion.
 *
 * @param arrExpr - The array expression to convert.
 * @returns The converted ArrayPattern AST node.
 */
const convertArrayExpressionToPattern = (
  arrExpr: AST.ArrayExpression,
): AST.ArrayPattern => {
  const elements: Array<AST.Pattern | null> = [];

  for (let i = 0; i < arrExpr.elements.length; i++) {
    const elem = arrExpr.elements[i];

    if (elem === null) {
      elements.push(null);
      continue;
    }

    if (elem.type === "SpreadElement") {
      const spread = elem as AST.SpreadElement;
      const argument = expressionToPatternShallow(spread.argument);
      elements.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: spread.start,
          end: spread.end,
        }),
      );
      continue;
    }

    // Regular element - convert expression to pattern
    const pattern = expressionToPatternShallow(elem);
    elements.push(pattern);
  }

  return Object.freeze({
    type: "ArrayPattern" as const,
    start: arrExpr.start,
    end: arrExpr.end,
    elements: Object.freeze(elements),
  });
};

/**
 * Convert an ObjectExpression to an ObjectPattern iteratively.
 *
 * Uses a stack to process nested arrays/objects without recursion.
 *
 * @param objExpr - The object expression to convert.
 * @returns The converted ObjectPattern AST node.
 */
const convertObjectExpressionToPattern = (
  objExpr: AST.ObjectExpression,
): AST.ObjectPattern => {
  const properties: Array<AST.Property | AST.RestElement> = [];

  for (let i = 0; i < objExpr.properties.length; i++) {
    const prop = objExpr.properties[i];

    if (prop.type === "SpreadElement") {
      const spread = prop as AST.SpreadElement;
      const argument = expressionToPatternShallow(spread.argument);
      properties.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: spread.start,
          end: spread.end,
        }),
      );
      continue;
    }

    // Property
    const property = prop as AST.Property;
    const value = expressionToPatternShallow(property.value as AST.Expression);

    properties.push(
      Object.freeze({
        type: "Property" as const,
        key: property.key,
        value,
        kind: "init" as const,
        method: false,
        shorthand: property.shorthand,
        computed: property.computed,
        start: property.start,
        end: property.end,
      }),
    );
  }

  return Object.freeze({
    type: "ObjectPattern" as const,
    start: objExpr.start,
    end: objExpr.end,
    properties: Object.freeze(properties),
  });
};
