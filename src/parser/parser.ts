/**
 * Core Parser class for the Steamroller JavaScript parser.
 *
 * Consumes a token stream from the Lexer and produces an ESTree-compatible
 * AST. Dispatches to specialized modules for declarations, statements,
 * and expressions.
 *
 * @module parser/parser
 */

import type * as AST from "../ast/types.js";
import type { Token } from "./token.js";
import { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";
import {
  parseFunctionDeclaration,
  parseClassDeclaration,
  parseImportDeclaration,
  parseExportDeclaration,
} from "./declarations.js";
import type { ParserContext as DeclarationsContext } from "./declarations.js";
import { parseDecorators } from "./decorators.js";
import { parseBindingPattern as parseBindingPatternFromModule } from "./patterns.js";
import {
  parseExpression as parseExpressionModule,
  parseAssignmentExpression as parseAssignmentExpressionModule,
  setBlockStatementParser,
  setJSXParser,
} from "./expressions.js";
import { parseJSXElementOrFragment } from "./jsx.js";
import type { JSXParserContext } from "./jsx.js";
import {
  parseBlockStatement as parseBlockStmt,
  parseEmptyStatement,
  parseDebuggerStatement,
  parseReturnStatement,
  parseThrowStatement,
  parseBreakStatement,
  parseContinueStatement,
  parseIfStatement,
  parseWhileStatement,
  parseDoWhileStatement,
  parseForStatement,
  parseSwitchStatement,
  parseTryStatement,
  parseWithStatement,
  parseLabeledStatement,
  parseVariableDeclaration,
  parseExpressionStatement,
} from "./statements.js";
import type { ParserContext as StatementsContext } from "./statements.js";
import {
  createParseError,
  skipToStatementBoundary,
  ErrorCollector,
} from "./diagnostics.js";
import type { ParseError } from "./diagnostics.js";

/**
 * Options for the parser.
 */
export interface ParseOptions {
  /** Whether to parse as module or script. Defaults to 'module'. */
  readonly sourceType?: "module" | "script";
  /** Whether to allow a hashbang (#!) at the start of the source. */
  readonly allowHashBang?: boolean;
  /** The ECMAScript version to target. Defaults to 2024. */
  readonly ecmaVersion?: number;
  /** Whether to enable JSX syntax parsing. Defaults to false. */
  readonly jsx?: boolean;
  /** Whether to collect errors instead of throwing. Defaults to false. */
  readonly recoverable?: boolean;
}

/**
 * Result of a recoverable parse operation.
 */
export interface RecoverableParseResult {
  readonly program: AST.Program;
  readonly errors: ReadonlyArray<ParseError>;
}

/**
 * The core Parser class that transforms source text into an AST.
 *
 * Internal state fields are mutable (documented exception for parser
 * state machine pattern).
 */
export class Parser implements DeclarationsContext, StatementsContext {
  /** The lexer producing the token stream. */
  lexer: Lexer;
  /** Whether parsing as module or script. */
  sourceType: "module" | "script";
  /** Whether `in` operator is allowed in expressions (false in for-loop headers). */
  allowIn: boolean;
  /** Whether JSX parsing is enabled. */
  readonly jsxEnabled: boolean;
  /** Whether recoverable mode is active. */
  readonly recoverable: boolean;
  /** The original source text for error diagnostics. */
  readonly source: string;
  /** Collected errors in recoverable mode. */
  readonly errorCollector: ErrorCollector;

  /**
   * Create a new Parser for the given source text.
   *
   * @param source - The source text to parse.
   * @param options - Optional parse configuration.
   */
  constructor(source: string, options?: ParseOptions) {
    const sourceType = options?.sourceType ?? "module";
    const allowHashBang = options?.allowHashBang ?? false;
    const isStrict = sourceType === "module";

    this.sourceType = sourceType;
    this.source = source;
    this.lexer = new Lexer(source, isStrict, allowHashBang);
    this.allowIn = true;
    this.jsxEnabled = options?.jsx ?? false;
    this.recoverable = options?.recoverable ?? false;
    this.errorCollector = new ErrorCollector();

    // Register block statement parser for function/class expression bodies.
    // The lexer parameter is ignored since this parser instance owns the lexer.
    setBlockStatementParser((_lex: Lexer) => this.parseBlockStatement());

    // Register JSX parser when enabled
    if (this.jsxEnabled) {
      setJSXParser((_lex: Lexer) => {
        const jsxCtx: JSXParserContext = {
          lexer: this.lexer,
          parseAssignmentExpression: () => this.parseAssignmentExpression(),
        };
        return parseJSXElementOrFragment(jsxCtx) as unknown as AST.Expression;
      });
    } else {
      setJSXParser(null);
    }
  }

  /**
   * Get the current token from the lexer.
   */
  get token(): Token {
    return this.lexer.token;
  }

  /**
   * Whether a line terminator preceded the current token.
   */
  get hadLineTerminatorBefore(): boolean {
    return this.lexer.hadLineTerminatorBefore;
  }

  /**
   * Advance to the next token and return the previous one.
   */
  next(): Token {
    return this.lexer.next();
  }

  /**
   * Expect and consume a specific token type.
   *
   * @param type - The expected token type.
   * @returns The consumed token.
   */
  expect(type: number): Token {
    return this.lexer.expect(type);
  }

  /**
   * Check if the current token is a specific type.
   *
   * @param type - The token type to check.
   * @returns True if the current token matches.
   */
  is(type: number): boolean {
    return this.lexer.is(type);
  }

  /**
   * Consume a token if it matches the type.
   *
   * @param type - The token type to try to consume.
   * @returns True if the token was consumed.
   */
  eat(type: number): boolean {
    return this.lexer.eat(type);
  }

  /**
   * Parse the complete program.
   *
   * Iteratively parses statements and declarations until EOF is reached,
   * producing a Program AST node. In recoverable mode, catches parse errors
   * and skips to the next statement boundary.
   *
   * @returns The root Program AST node.
   */
  parseProgram(): AST.Program {
    const start = this.lexer.token.start;
    const body: Array<AST.Statement | AST.ModuleDeclaration> = [];

    // Parse statements/declarations until EOF
    while (!this.lexer.is(TokenType.EOF)) {
      if (this.recoverable) {
        try {
          const stmt = this.parseStatement();
          body.push(stmt);
        } catch (err: unknown) {
          if (err instanceof SyntaxError) {
            this.errorCollector.addError(
              err.message,
              this.lexer.token.start,
              this.source,
            );
            skipToStatementBoundary(this.lexer);
          } else {
            throw err;
          }
        }
      } else {
        const stmt = this.parseStatement();
        body.push(stmt);
      }
    }

    const end = this.lexer.token.end;

    return Object.freeze({
      type: "Program" as const,
      start,
      end,
      body: Object.freeze(body),
      sourceType: this.sourceType,
    });
  }

  /**
   * Parse a single statement or module declaration.
   *
   * Delegates to specialized parsers for declarations (function, class,
   * import, export) and all statement types (if, for, while, switch,
   * try, etc.). Falls back to expression statement for unrecognized tokens.
   *
   * @returns The parsed statement or module declaration AST node.
   */
  parseStatement(): AST.Statement | AST.ModuleDeclaration {
    const token = this.lexer.token;

    switch (token.type) {
      // Empty statement
      case TokenType.Semicolon:
        return parseEmptyStatement(this);

      // Block statement
      case TokenType.LeftBrace:
        return parseBlockStmt(this);

      // Function declaration
      case TokenType.Function:
        return parseFunctionDeclaration(this, false);

      // Async function declaration
      case TokenType.Async: {
        const saved = this.lexer.saveState();
        this.lexer.next();
        if (this.lexer.is(TokenType.Function)) {
          return parseFunctionDeclaration(this, true);
        }
        this.lexer.restoreState(saved);
        // Falls through to expression statement
        return parseExpressionStatement(this);
      }

      // Class declaration
      case TokenType.Class:
        return parseClassDeclaration(this);

      // Import declaration (module only) or import() / import.meta expression
      case TokenType.Import: {
        const savedImport = this.lexer.saveState();
        this.lexer.next();
        if (
          this.lexer.is(TokenType.LeftParen) ||
          this.lexer.is(TokenType.Dot)
        ) {
          // import() or import.meta - treat as expression statement
          this.lexer.restoreState(savedImport);
          return parseExpressionStatement(this);
        }
        this.lexer.restoreState(savedImport);
        return parseImportDeclaration(this);
      }

      // Export declaration (module only)
      case TokenType.Export:
        return parseExportDeclaration(this);

      // Control flow statements
      case TokenType.If:
        return parseIfStatement(this);

      case TokenType.While:
        return parseWhileStatement(this);

      case TokenType.Do:
        return parseDoWhileStatement(this);

      case TokenType.For:
        return parseForStatement(this);

      case TokenType.Switch:
        return parseSwitchStatement(this);

      case TokenType.Try:
        return parseTryStatement(this);

      case TokenType.With:
        return parseWithStatement(this);

      // Jump statements
      case TokenType.Return:
        return parseReturnStatement(this);

      case TokenType.Throw:
        return parseThrowStatement(this);

      case TokenType.Break:
        return parseBreakStatement(this);

      case TokenType.Continue:
        return parseContinueStatement(this);

      case TokenType.Debugger:
        return parseDebuggerStatement(this);

      // Decorator: @expr class ...  or  @expr export class ...
      case TokenType.At: {
        const decorators = parseDecorators(this.lexer, () =>
          this.parseDecoratorArgs(),
        );
        if (this.lexer.is(TokenType.Class)) {
          return parseClassDeclaration(this, decorators);
        }
        if (this.lexer.is(TokenType.Export)) {
          return parseExportDeclaration(this, decorators);
        }
        throw new SyntaxError(
          `Decorators must precede a class declaration or export at position ${this.lexer.token.start}`,
        );
      }

      // Variable declarations
      case TokenType.Var:
      case TokenType.Let:
      case TokenType.Const:
        return parseVariableDeclaration(this);

      // Labeled statement check (identifier followed by colon)
      case TokenType.Identifier: {
        const saved = this.lexer.saveState();
        const identToken = this.lexer.next();
        if (this.lexer.is(TokenType.Colon)) {
          return parseLabeledStatement(this, identToken);
        }
        this.lexer.restoreState(saved);
        return parseExpressionStatement(this);
      }

      // Default: expression statement
      default:
        return parseExpressionStatement(this);
    }
  }

  /**
   * Parse a block statement: { ... }
   *
   * @returns The BlockStatement AST node.
   */
  parseBlockStatement(): AST.BlockStatement {
    return parseBlockStmt(this);
  }

  /**
   * Parse an expression.
   *
   * Delegates to the expressions module for full expression parsing
   * including sequence expressions (comma-separated).
   *
   * @returns The Expression AST node.
   */
  parseExpression(): AST.Expression {
    return parseExpressionModule(this.lexer, this.allowIn);
  }

  /**
   * Parse an assignment expression (single, no comma).
   *
   * @returns The Expression AST node.
   */
  parseAssignmentExpression(): AST.Expression {
    return parseAssignmentExpressionModule(this.lexer, this.allowIn);
  }

  /**
   * Parse a binding pattern for destructuring.
   *
   * Handles identifiers, array patterns, and object patterns
   * with full support for nesting, defaults, and rest elements.
   *
   * @returns The Pattern AST node.
   */
  parseBindingPattern(): AST.Pattern {
    return parseBindingPatternFromModule(this.lexer, () =>
      parseAssignmentExpressionModule(this.lexer, this.allowIn),
    );
  }

  /**
   * Parse decorator call expression arguments.
   *
   * Used as a callback for parseDecorators to handle argument lists
   * inside decorator call expressions like @dec(arg1, arg2).
   *
   * @returns Array of Expression or SpreadElement nodes.
   */
  parseDecoratorArgs(): ReadonlyArray<AST.Expression | AST.SpreadElement> {
    const args: Array<AST.Expression | AST.SpreadElement> = [];

    while (
      !this.lexer.is(TokenType.RightParen) &&
      !this.lexer.is(TokenType.EOF)
    ) {
      if (args.length > 0) {
        this.lexer.expect(TokenType.Comma);
      }

      if (this.lexer.is(TokenType.Ellipsis)) {
        const spreadStart = this.lexer.token.start;
        this.lexer.next();
        const argument = this.parseAssignmentExpression();
        args.push(
          Object.freeze({
            type: "SpreadElement" as const,
            argument,
            start: spreadStart,
            end: argument.end,
          }),
        );
      } else {
        args.push(this.parseAssignmentExpression());
      }
    }

    return Object.freeze(args);
  }
}

/**
 * Parse source text into an AST Program node.
 *
 * This is the primary public API for parsing JavaScript source code.
 *
 * @param source - The source text to parse.
 * @param options - Optional parse configuration.
 * @returns The root Program AST node.
 */
export const parse = (source: string, options?: ParseOptions): AST.Program => {
  const parser = new Parser(source, options);
  return parser.parseProgram();
};

/**
 * Parse source text in recoverable mode, collecting errors.
 *
 * Returns a partial AST alongside all collected parse errors.
 * Non-recoverable errors (e.g., non-SyntaxError) will still throw.
 *
 * @param source - The source text to parse.
 * @param options - Optional parse configuration (recoverable is forced true).
 * @returns A result containing the partial program and array of errors.
 */
export const parseRecoverable = (
  source: string,
  options?: ParseOptions,
): RecoverableParseResult => {
  const parser = new Parser(source, { ...options, recoverable: true });
  const program = parser.parseProgram();
  return { program, errors: Object.freeze([...parser.errorCollector.errors]) };
};
