/**
 * Member access, call expression, and optional chaining parser.
 *
 * Implements iterative left-to-right parsing of:
 * - Member access: obj.prop, obj[expr]
 * - Call expressions: fn(args), fn(...args)
 * - Optional chaining: obj?.prop, obj?.[expr], fn?.()
 * - New expressions: new Foo(), new Foo, new Foo(a, b)
 * - Tagged templates: tag`template`
 *
 * Uses iterative while loops (no recursion) per coding standards.
 *
 * @module parser/member-call
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";
import { tokenTypeName } from "./token-types.js";
import { parseTaggedTemplate } from "./expressions.js";

/**
 * Result of parsing call arguments: the argument list and end position.
 */
interface ParsedArguments {
  readonly args: ReadonlyArray<AST.Expression | AST.SpreadElement>;
  readonly end: number;
}

/**
 * Parse call arguments: (expr, expr, ...expr)
 *
 * Consumes the opening and closing parentheses and parses
 * comma-separated expressions with spread support.
 *
 * @param lexer - The lexer instance.
 * @param parseExpr - Function to parse an assignment expression.
 * @returns The parsed arguments and the end position after closing paren.
 */
export const parseArguments = (
  lexer: Lexer,
  parseExpr: () => AST.Expression,
): ParsedArguments => {
  lexer.expect(TokenType.LeftParen);
  const args: Array<AST.Expression | AST.SpreadElement> = [];

  while (!lexer.is(TokenType.RightParen)) {
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(
        `Unterminated argument list at position ${lexer.token.start}`,
      );
    }

    // Spread argument
    if (lexer.is(TokenType.Ellipsis)) {
      const spreadStart = lexer.token.start;
      lexer.next();
      const argument = parseExpr();
      args.push(
        Object.freeze({
          type: "SpreadElement" as const,
          start: spreadStart,
          end: argument.end,
          argument,
        }),
      );
    } else {
      const arg = parseExpr();
      args.push(arg);
    }

    // Consume trailing comma or expect closing paren
    if (!lexer.is(TokenType.RightParen)) {
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      } else {
        const name = tokenTypeName(lexer.token.type);
        throw new SyntaxError(
          `Expected ',' or ')' in argument list but found ${name} at position ${lexer.token.start}`,
        );
      }
    }
  }

  const closeParen = lexer.expect(TokenType.RightParen);
  return { args: Object.freeze(args), end: closeParen.end };
};

/**
 * Parse an identifier for member access (property name).
 *
 * Accepts identifiers and contextual keywords that are valid as
 * property names (e.g., get, set, async, etc.).
 *
 * @param lexer - The lexer instance.
 * @returns An Identifier AST node.
 * @throws {SyntaxError} If the current token is not a valid property name.
 */
const parsePropertyIdentifier = (lexer: Lexer): AST.Identifier => {
  const token = lexer.token;

  // Accept identifiers and contextual/reserved keywords as property names
  if (
    token.type === TokenType.Identifier ||
    token.type === TokenType.Get ||
    token.type === TokenType.Set ||
    token.type === TokenType.Async ||
    token.type === TokenType.From ||
    token.type === TokenType.Of ||
    token.type === TokenType.As ||
    token.type === TokenType.Let ||
    token.type === TokenType.Static ||
    token.type === TokenType.Yield ||
    token.type === TokenType.Await ||
    // Reserved keywords allowed as property names
    token.type === TokenType.Break ||
    token.type === TokenType.Case ||
    token.type === TokenType.Catch ||
    token.type === TokenType.Continue ||
    token.type === TokenType.Debugger ||
    token.type === TokenType.Default ||
    token.type === TokenType.Delete ||
    token.type === TokenType.Do ||
    token.type === TokenType.Else ||
    token.type === TokenType.Finally ||
    token.type === TokenType.For ||
    token.type === TokenType.Function ||
    token.type === TokenType.If ||
    token.type === TokenType.In ||
    token.type === TokenType.Instanceof ||
    token.type === TokenType.New ||
    token.type === TokenType.Return ||
    token.type === TokenType.Switch ||
    token.type === TokenType.This ||
    token.type === TokenType.Throw ||
    token.type === TokenType.Try ||
    token.type === TokenType.Typeof ||
    token.type === TokenType.Var ||
    token.type === TokenType.Void ||
    token.type === TokenType.While ||
    token.type === TokenType.With ||
    token.type === TokenType.Class ||
    token.type === TokenType.Const ||
    token.type === TokenType.Export ||
    token.type === TokenType.Extends ||
    token.type === TokenType.Import ||
    token.type === TokenType.Super ||
    token.type === TokenType.True ||
    token.type === TokenType.False ||
    token.type === TokenType.Null
  ) {
    const consumed = lexer.next();
    // For literal keywords (true/false/null), use raw since value is the actual value
    const name =
      consumed.type === TokenType.True ||
      consumed.type === TokenType.False ||
      consumed.type === TokenType.Null
        ? consumed.raw
        : (consumed.value as string);
    return Object.freeze({
      type: "Identifier" as const,
      start: consumed.start,
      end: consumed.end,
      name,
    });
  }

  const name = tokenTypeName(token.type);
  throw new SyntaxError(
    `Expected property name but found ${name} at position ${token.start}`,
  );
};

/**
 * Parse member/call/optional chain expression iteratively.
 *
 * Takes a parsed primary expression and extends it with
 * .prop, [expr], (args), ?.prop, ?.[expr], ?.(), and tagged templates.
 *
 * If optional chaining is used, the result is wrapped in a ChainExpression.
 *
 * @param lexer - The lexer instance.
 * @param object - The initial (primary) expression.
 * @param parseExpr - Function to parse an assignment expression.
 * @returns The extended expression (possibly wrapped in ChainExpression).
 */
export const parseMemberCallExpression = (
  lexer: Lexer,
  object: AST.Expression,
  parseExpr: () => AST.Expression,
): AST.Expression => {
  let result = object;
  let inOptionalChain = false;

  // Iterative loop: keep consuming . [] () ?. or tagged templates
  while (true) {
    if (lexer.is(TokenType.Dot)) {
      // MemberExpression: obj.prop
      lexer.next();
      const property = parsePropertyIdentifier(lexer);
      result = Object.freeze({
        type: "MemberExpression" as const,
        start: result.start,
        end: property.end,
        object: result,
        property,
        computed: false,
        optional: false,
      });
    } else if (lexer.is(TokenType.LeftBracket)) {
      // MemberExpression (computed): obj[expr]
      lexer.next();
      const property = parseExpr();
      const closeBracket = lexer.expect(TokenType.RightBracket);
      result = Object.freeze({
        type: "MemberExpression" as const,
        start: result.start,
        end: closeBracket.end,
        object: result,
        property,
        computed: true,
        optional: false,
      });
    } else if (lexer.is(TokenType.LeftParen)) {
      // CallExpression: fn(args)
      const parsed = parseArguments(lexer, parseExpr);
      result = Object.freeze({
        type: "CallExpression" as const,
        start: result.start,
        end: parsed.end,
        callee: result,
        arguments: parsed.args,
        optional: false,
      });
    } else if (lexer.is(TokenType.QuestionDot)) {
      // Optional chaining: ?.prop, ?.[expr], ?.()
      inOptionalChain = true;
      lexer.next();

      if (lexer.is(TokenType.LeftParen)) {
        // Optional call: obj?.()
        const parsed = parseArguments(lexer, parseExpr);
        result = Object.freeze({
          type: "CallExpression" as const,
          start: result.start,
          end: parsed.end,
          callee: result,
          arguments: parsed.args,
          optional: true,
        });
      } else if (lexer.is(TokenType.LeftBracket)) {
        // Optional computed member: obj?.[expr]
        lexer.next();
        const property = parseExpr();
        const closeBracket = lexer.expect(TokenType.RightBracket);
        result = Object.freeze({
          type: "MemberExpression" as const,
          start: result.start,
          end: closeBracket.end,
          object: result,
          property,
          computed: true,
          optional: true,
        });
      } else {
        // Optional member: obj?.prop
        const property = parsePropertyIdentifier(lexer);
        result = Object.freeze({
          type: "MemberExpression" as const,
          start: result.start,
          end: property.end,
          object: result,
          property,
          computed: false,
          optional: true,
        });
      }
    } else if (
      lexer.is(TokenType.TemplateHead) ||
      lexer.is(TokenType.TemplateNoSub) ||
      lexer.is(TokenType.TemplateLiteral)
    ) {
      // Tagged template: tag`...`
      result = parseTaggedTemplate(lexer, result);
    } else {
      break;
    }
  }

  // Wrap in ChainExpression if optional chaining was used
  if (inOptionalChain) {
    result = Object.freeze({
      type: "ChainExpression" as const,
      start: result.start,
      end: result.end,
      expression: result as AST.CallExpression | AST.MemberExpression,
    });
  }

  return result;
};

/**
 * Parse a new expression: new Foo(args) or new Foo
 *
 * Handles nested new expressions (new new Foo()) iteratively using
 * an explicit stack of 'new' start positions.
 *
 * @param lexer - The lexer instance.
 * @param parsePrimary - Function to parse primary expressions.
 * @param parseExpr - Function to parse assignment expressions.
 * @returns A NewExpression AST node.
 */
export const parseNewExpression = (
  lexer: Lexer,
  parsePrimary: () => AST.Expression,
  parseExpr: () => AST.Expression,
): AST.Expression => {
  // Collect nested 'new' keywords
  const newStarts: Array<number> = [];

  while (lexer.is(TokenType.New)) {
    const start = lexer.token.start;
    lexer.next();

    // Check for new.target meta property
    if (lexer.is(TokenType.Dot)) {
      const saved = lexer.saveState();
      lexer.next();
      if (
        lexer.is(TokenType.Identifier) &&
        (lexer.token.value as string) === "target"
      ) {
        const targetToken = lexer.next();
        const metaResult: AST.MetaProperty = Object.freeze({
          type: "MetaProperty" as const,
          start,
          end: targetToken.end,
          meta: Object.freeze({
            type: "Identifier" as const,
            start,
            end: start + 3,
            name: "new",
          }),
          property: Object.freeze({
            type: "Identifier" as const,
            start: targetToken.start,
            end: targetToken.end,
            name: "target",
          }),
        });

        // Wrap any pending new starts around the result
        let wrapped: AST.Expression = metaResult;
        for (let i = newStarts.length - 1; i >= 0; i--) {
          wrapped = Object.freeze({
            type: "NewExpression" as const,
            start: newStarts[i],
            end: wrapped.end,
            callee: wrapped,
            arguments: Object.freeze([]) as ReadonlyArray<
              AST.Expression | AST.SpreadElement
            >,
          });
        }
        return wrapped;
      }
      lexer.restoreState(saved);
    }

    newStarts.push(start);
  }

  // Parse the callee (primary expression)
  let callee = parsePrimary();

  // Parse member accesses on the callee (but not calls - those are for the outermost new)
  // new foo.bar() should be new (foo.bar)()
  while (lexer.is(TokenType.Dot) || lexer.is(TokenType.LeftBracket)) {
    if (lexer.is(TokenType.Dot)) {
      lexer.next();
      const property = parsePropertyIdentifier(lexer);
      callee = Object.freeze({
        type: "MemberExpression" as const,
        start: callee.start,
        end: property.end,
        object: callee,
        property,
        computed: false,
        optional: false,
      });
    } else {
      lexer.next();
      const property = parseExpr();
      const closeBracket = lexer.expect(TokenType.RightBracket);
      callee = Object.freeze({
        type: "MemberExpression" as const,
        start: callee.start,
        end: closeBracket.end,
        object: callee,
        property,
        computed: true,
        optional: false,
      });
    }
  }

  // Build NewExpression nodes from inside out
  // The innermost 'new' gets the arguments (if any)
  let result: AST.Expression = callee;

  for (let i = newStarts.length - 1; i >= 0; i--) {
    // Only the outermost (first) new gets arguments if there's a paren
    // Actually, the innermost new gets the args: new new Foo(a) => new (new Foo(a))
    // Let's handle it: only the innermost gets args if () follows immediately
    if (i === newStarts.length - 1 && lexer.is(TokenType.LeftParen)) {
      const parsed = parseArguments(lexer, parseExpr);
      result = Object.freeze({
        type: "NewExpression" as const,
        start: newStarts[i],
        end: parsed.end,
        callee: result,
        arguments: parsed.args,
      });
    } else {
      result = Object.freeze({
        type: "NewExpression" as const,
        start: newStarts[i],
        end: result.end,
        callee: result,
        arguments: Object.freeze([]) as ReadonlyArray<
          AST.Expression | AST.SpreadElement
        >,
      });
    }
  }

  return result;
};

/**
 * Parse a super keyword expression for member access and calls.
 *
 * Handles: super.prop, super[expr], super(args)
 *
 * @param lexer - The lexer instance.
 * @param parseExpr - Function to parse assignment expressions.
 * @returns A Super-based expression (MemberExpression or CallExpression).
 * @throws {SyntaxError} If super is not followed by . [ or (.
 */
export const parseSuperExpression = (
  lexer: Lexer,
  parseExpr: () => AST.Expression,
): AST.Expression => {
  const start = lexer.token.start;
  const superToken = lexer.next(); // consume 'super'

  const superNode: AST.Super = Object.freeze({
    type: "Super" as const,
    start,
    end: superToken.end,
  });

  if (lexer.is(TokenType.Dot)) {
    // super.prop
    lexer.next();
    const property = parsePropertyIdentifier(lexer);
    return Object.freeze({
      type: "MemberExpression" as const,
      start,
      end: property.end,
      object: superNode,
      property,
      computed: false,
      optional: false,
    });
  }

  if (lexer.is(TokenType.LeftBracket)) {
    // super[expr]
    lexer.next();
    const property = parseExpr();
    const closeBracket = lexer.expect(TokenType.RightBracket);
    return Object.freeze({
      type: "MemberExpression" as const,
      start,
      end: closeBracket.end,
      object: superNode,
      property,
      computed: true,
      optional: false,
    });
  }

  if (lexer.is(TokenType.LeftParen)) {
    // super(args)
    const parsed = parseArguments(lexer, parseExpr);
    return Object.freeze({
      type: "CallExpression" as const,
      start,
      end: parsed.end,
      callee: superNode,
      arguments: parsed.args,
      optional: false,
    });
  }

  throw new SyntaxError(
    `'super' keyword must be followed by '.', '[', or '(' at position ${lexer.token.start}`,
  );
};
