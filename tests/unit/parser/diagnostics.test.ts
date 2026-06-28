/**
 * Unit tests for error recovery and diagnostics module.
 *
 * @module tests/unit/parser/diagnostics
 */

import { describe, it, expect } from "bun:test";
import {
  createParseError,
  positionToLineColumn,
  skipToStatementBoundary,
  ErrorCollector,
} from "../../../src/parser/diagnostics.js";
import type { ParseError } from "../../../src/parser/diagnostics.js";
import { parse, parseRecoverable } from "../../../src/parser/parser.js";
import type { RecoverableParseResult } from "../../../src/parser/parser.js";
import { Lexer } from "../../../src/parser/lexer.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("Diagnostics", () => {
  describe("positionToLineColumn", () => {
    it("returns line 1, column 0 for position 0", () => {
      const loc = positionToLineColumn("hello", 0);
      expect(loc.line).toBe(1);
      expect(loc.column).toBe(0);
    });

    it("computes correct line for multiline source", () => {
      const source = "abc\ndef\nghi";
      const loc = positionToLineColumn(source, 4); // 'd' on line 2
      expect(loc.line).toBe(2);
      expect(loc.column).toBe(0);
    });

    it("computes correct column on second line", () => {
      const source = "abc\ndef\nghi";
      const loc = positionToLineColumn(source, 6); // 'f' on line 2, col 2
      expect(loc.line).toBe(2);
      expect(loc.column).toBe(2);
    });

    it("handles third line", () => {
      const source = "abc\ndef\nghi";
      const loc = positionToLineColumn(source, 8); // 'g' on line 3
      expect(loc.line).toBe(3);
      expect(loc.column).toBe(0);
    });

    it("handles position at end of source", () => {
      const source = "abc";
      const loc = positionToLineColumn(source, 3);
      expect(loc.line).toBe(1);
      expect(loc.column).toBe(3);
    });
  });

  describe("createParseError", () => {
    it("creates error with position and location", () => {
      const source = "const x = ;";
      const error = createParseError("Unexpected token", 10, source);
      expect(error).toBeInstanceOf(SyntaxError);
      expect(error.pos).toBe(10);
      expect(error.loc.line).toBe(1);
      expect(error.loc.column).toBe(10);
    });

    it("includes line and column in message", () => {
      const source = "abc\ndef";
      const error = createParseError("Bad token", 5, source);
      expect(error.message).toContain("(2:1)");
    });

    it("includes a code frame", () => {
      const source = "const x = ;\nconst y = 2;";
      const error = createParseError("Unexpected", 10, source);
      expect(error.frame).toContain("|");
      expect(error.frame).toContain("^");
    });

    it("frame shows the error line with marker", () => {
      const source = "line1\nline2\nline3";
      const error = createParseError("Error here", 6, source);
      // position 6 is 'l' on line 2, col 0
      expect(error.frame).toContain(">");
      expect(error.frame).toContain("^");
    });

    it("provides correct loc for first character", () => {
      const error = createParseError("Start", 0, "hello");
      expect(error.loc.line).toBe(1);
      expect(error.loc.column).toBe(0);
    });
  });

  describe("skipToStatementBoundary", () => {
    it("skips to semicolon and consumes it", () => {
      const lexer = new Lexer("bad stuff ; good", true);
      skipToStatementBoundary(lexer);
      // After skipping, should be at 'good'
      expect(lexer.token.type).toBe(TokenType.Identifier);
    });

    it("skips to right brace without consuming it", () => {
      const lexer = new Lexer("bad stuff }", true);
      skipToStatementBoundary(lexer);
      expect(lexer.token.type).toBe(TokenType.RightBrace);
    });

    it("skips to keyword that starts a statement", () => {
      const lexer = new Lexer("bad stuff const x = 1", true);
      skipToStatementBoundary(lexer);
      expect(lexer.token.type).toBe(TokenType.Const);
    });

    it("stops at EOF if no boundary found", () => {
      const lexer = new Lexer("x y z", true);
      skipToStatementBoundary(lexer);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it("skips to if keyword", () => {
      const lexer = new Lexer("bad if (true) {}", true);
      skipToStatementBoundary(lexer);
      expect(lexer.token.type).toBe(TokenType.If);
    });
  });

  describe("ErrorCollector", () => {
    it("starts with no errors", () => {
      const collector = new ErrorCollector();
      expect(collector.hasErrors).toBe(false);
      expect(collector.errors.length).toBe(0);
    });

    it("collects errors", () => {
      const collector = new ErrorCollector();
      collector.addError("first error", 0, "source");
      collector.addError("second error", 5, "source");
      expect(collector.hasErrors).toBe(true);
      expect(collector.errors.length).toBe(2);
    });

    it("errors include position and location", () => {
      const collector = new ErrorCollector();
      collector.addError("test", 4, "abc\ndef");
      const err = collector.errors[0];
      expect(err.pos).toBe(4);
      expect(err.loc.line).toBe(2);
      expect(err.loc.column).toBe(0);
    });

    it("errors include code frame", () => {
      const collector = new ErrorCollector();
      collector.addError("test", 0, "const x = 1;");
      expect(collector.errors[0].frame).toContain("^");
    });
  });

  describe("recoverable mode via parseRecoverable", () => {
    it("collects multiple errors and produces partial AST", () => {
      // Two bad statements with a good one in between
      const source = "const x = ;\nconst y = 2;\nconst z = ;";
      const result: RecoverableParseResult = parseRecoverable(source);
      expect(result.errors.length).toBeGreaterThan(0);
      // Should have at least the valid statement in the AST
      expect(result.program.body.length).toBeGreaterThan(0);
      expect(result.program.type).toBe("Program");
    });

    it("produces complete AST when no errors", () => {
      const source = "const x = 1;\nconst y = 2;";
      const result = parseRecoverable(source);
      expect(result.errors.length).toBe(0);
      expect(result.program.body.length).toBe(2);
    });

    it("still produces partial AST with errors", () => {
      const source = "const a = 1;\n@@@\nconst b = 2;";
      const result = parseRecoverable(source);
      expect(result.errors.length).toBeGreaterThan(0);
      // Should contain at least one valid declaration
      const validStmts = result.program.body.filter(
        (s) => s.type === "VariableDeclaration",
      );
      expect(validStmts.length).toBeGreaterThanOrEqual(1);
    });

    it("error messages include location info", () => {
      const source = "const x = ;";
      const result = parseRecoverable(source);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors[0];
      expect(err.loc.line).toBeGreaterThanOrEqual(1);
      expect(err.loc.column).toBeGreaterThanOrEqual(0);
    });
  });

  describe("non-recoverable mode (default)", () => {
    it("throws on first error by default", () => {
      const source = "const x = ;";
      expect(() => parse(source)).toThrow(SyntaxError);
    });

    it("throws immediately without collecting errors", () => {
      const source = "const x = ;\nconst y = ;";
      expect(() => parse(source)).toThrow(SyntaxError);
    });
  });

  describe("integration with createParseError", () => {
    it("error is throwable as SyntaxError", () => {
      const error = createParseError("test", 0, "code");
      expect(() => {
        throw error;
      }).toThrow(SyntaxError);
    });

    it("error has all expected properties", () => {
      const error = createParseError("bad token", 5, "hello\nworld");
      expect(typeof error.pos).toBe("number");
      expect(typeof error.loc).toBe("object");
      expect(typeof error.loc.line).toBe("number");
      expect(typeof error.loc.column).toBe("number");
      expect(typeof error.frame).toBe("string");
      expect(error.message).toContain("bad token");
    });
  });
});
