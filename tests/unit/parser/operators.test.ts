/**
 * Unit tests for operator expression parsing (Pratt parsing).
 *
 * Covers binary, logical, unary, update, conditional, and assignment
 * expressions with correct precedence, associativity, and error handling.
 *
 * @module tests/unit/parser/operators
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper to parse an expression from an expression statement.
 */
const parseExpr = (source: string): AST.Expression => {
  const program = parse(source, { sourceType: "module" });
  expect(program.body.length).toBeGreaterThan(0);
  const stmt = program.body[0];
  expect(stmt.type).toBe("ExpressionStatement");
  return (stmt as AST.ExpressionStatement).expression;
};

describe("Operator Parsing (Pratt)", () => {
  describe("Binary Arithmetic Operators", () => {
    it("should parse addition", () => {
      const expr = parseExpr("1 + 2;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("+");
      expect((expr.left as AST.Literal).value).toBe(1);
      expect((expr.right as AST.Literal).value).toBe(2);
    });

    it("should parse subtraction", () => {
      const expr = parseExpr("5 - 3;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("-");
      expect((expr.left as AST.Literal).value).toBe(5);
      expect((expr.right as AST.Literal).value).toBe(3);
    });

    it("should parse multiplication", () => {
      const expr = parseExpr("3 * 4;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("*");
    });

    it("should parse division", () => {
      const expr = parseExpr("10 / 2;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("/");
    });

    it("should parse modulo", () => {
      const expr = parseExpr("7 % 3;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("%");
    });

    it("should parse exponentiation", () => {
      const expr = parseExpr("5 ** 2;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("**");
      expect((expr.left as AST.Literal).value).toBe(5);
      expect((expr.right as AST.Literal).value).toBe(2);
    });
  });

  describe("Precedence", () => {
    it("should respect multiplication over addition: 1 + 2 * 3", () => {
      const expr = parseExpr("1 + 2 * 3;") as AST.BinaryExpression;
      expect(expr.operator).toBe("+");
      expect((expr.left as AST.Literal).value).toBe(1);
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("*");
      expect((right.left as AST.Literal).value).toBe(2);
      expect((right.right as AST.Literal).value).toBe(3);
    });

    it("should respect division over subtraction: 6 - 4 / 2", () => {
      const expr = parseExpr("6 - 4 / 2;") as AST.BinaryExpression;
      expect(expr.operator).toBe("-");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("/");
    });

    it("should respect exponentiation over multiplication: 2 * 3 ** 2", () => {
      const expr = parseExpr("2 * 3 ** 2;") as AST.BinaryExpression;
      expect(expr.operator).toBe("*");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("**");
    });

    it("should respect comparison over logical: a < b && c > d", () => {
      const expr = parseExpr("a < b && c > d;") as AST.LogicalExpression;
      expect(expr.operator).toBe("&&");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("<");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe(">");
    });

    it("should respect && over ||: a || b && c", () => {
      const expr = parseExpr("a || b && c;") as AST.LogicalExpression;
      expect(expr.operator).toBe("||");
      expect((expr.left as AST.Identifier).name).toBe("a");
      const right = expr.right as AST.LogicalExpression;
      expect(right.operator).toBe("&&");
    });

    it("should respect bitwise AND over bitwise OR: a | b & c", () => {
      const expr = parseExpr("a | b & c;") as AST.BinaryExpression;
      expect(expr.operator).toBe("|");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("&");
    });

    it("should respect bitwise XOR precedence: a | b ^ c", () => {
      const expr = parseExpr("a | b ^ c;") as AST.BinaryExpression;
      expect(expr.operator).toBe("|");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("^");
    });

    it("should respect shift over addition: a + b << c", () => {
      const expr = parseExpr("a + b << c;") as AST.BinaryExpression;
      expect(expr.operator).toBe("<<");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("+");
    });

    it("should parse chained additions left-to-right: 1 + 2 + 3", () => {
      const expr = parseExpr("1 + 2 + 3;") as AST.BinaryExpression;
      expect(expr.operator).toBe("+");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("+");
      expect((left.left as AST.Literal).value).toBe(1);
      expect((left.right as AST.Literal).value).toBe(2);
      expect((expr.right as AST.Literal).value).toBe(3);
    });
  });

  describe("Associativity", () => {
    it("should parse ** as right-associative: 2 ** 3 ** 4", () => {
      const expr = parseExpr("2 ** 3 ** 4;") as AST.BinaryExpression;
      expect(expr.operator).toBe("**");
      expect((expr.left as AST.Literal).value).toBe(2);
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("**");
      expect((right.left as AST.Literal).value).toBe(3);
      expect((right.right as AST.Literal).value).toBe(4);
    });

    it("should parse subtraction as left-associative: 10 - 3 - 2", () => {
      const expr = parseExpr("10 - 3 - 2;") as AST.BinaryExpression;
      expect(expr.operator).toBe("-");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("-");
      expect((left.left as AST.Literal).value).toBe(10);
      expect((left.right as AST.Literal).value).toBe(3);
      expect((expr.right as AST.Literal).value).toBe(2);
    });
  });

  describe("Comparison Operators", () => {
    it("should parse less than", () => {
      const expr = parseExpr("a < b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("<");
    });

    it("should parse greater than", () => {
      const expr = parseExpr("a > b;") as AST.BinaryExpression;
      expect(expr.operator).toBe(">");
    });

    it("should parse less than or equal", () => {
      const expr = parseExpr("a <= b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("<=");
    });

    it("should parse greater than or equal", () => {
      const expr = parseExpr("a >= b;") as AST.BinaryExpression;
      expect(expr.operator).toBe(">=");
    });

    it("should parse strict equality", () => {
      const expr = parseExpr("a === b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("===");
    });

    it("should parse strict inequality", () => {
      const expr = parseExpr("a !== b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("!==");
    });

    it("should parse loose equality", () => {
      const expr = parseExpr("a == b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("==");
    });

    it("should parse loose inequality", () => {
      const expr = parseExpr("a != b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("!=");
    });
  });

  describe("Logical Operators", () => {
    it("should parse logical OR", () => {
      const expr = parseExpr("a || b;") as AST.LogicalExpression;
      expect(expr.type).toBe("LogicalExpression");
      expect(expr.operator).toBe("||");
    });

    it("should parse logical AND", () => {
      const expr = parseExpr("a && b;") as AST.LogicalExpression;
      expect(expr.type).toBe("LogicalExpression");
      expect(expr.operator).toBe("&&");
    });

    it("should parse nullish coalescing", () => {
      const expr = parseExpr("a ?? b;") as AST.LogicalExpression;
      expect(expr.type).toBe("LogicalExpression");
      expect(expr.operator).toBe("??");
    });

    it("should chain ?? operators", () => {
      const expr = parseExpr("a ?? b ?? c;") as AST.LogicalExpression;
      expect(expr.operator).toBe("??");
      const left = expr.left as AST.LogicalExpression;
      expect(left.operator).toBe("??");
    });

    it("should chain || operators", () => {
      const expr = parseExpr("a || b || c;") as AST.LogicalExpression;
      expect(expr.operator).toBe("||");
      const left = expr.left as AST.LogicalExpression;
      expect(left.operator).toBe("||");
    });
  });

  describe("Bitwise Operators", () => {
    it("should parse bitwise OR", () => {
      const expr = parseExpr("a | b;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("|");
    });

    it("should parse bitwise AND", () => {
      const expr = parseExpr("a & b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("&");
    });

    it("should parse bitwise XOR", () => {
      const expr = parseExpr("a ^ b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("^");
    });

    it("should parse left shift", () => {
      const expr = parseExpr("a << b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("<<");
    });

    it("should parse right shift", () => {
      const expr = parseExpr("a >> b;") as AST.BinaryExpression;
      expect(expr.operator).toBe(">>");
    });

    it("should parse unsigned right shift", () => {
      const expr = parseExpr("a >>> b;") as AST.BinaryExpression;
      expect(expr.operator).toBe(">>>");
    });
  });

  describe("in and instanceof", () => {
    it("should parse instanceof operator", () => {
      const expr = parseExpr("a instanceof B;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("instanceof");
      expect((expr.left as AST.Identifier).name).toBe("a");
      expect((expr.right as AST.Identifier).name).toBe("B");
    });

    it("should parse in operator", () => {
      const expr = parseExpr("a in b;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("in");
    });
  });

  describe("Unary Expressions", () => {
    it("should parse logical NOT", () => {
      const expr = parseExpr("!x;") as AST.UnaryExpression;
      expect(expr.type).toBe("UnaryExpression");
      expect(expr.operator).toBe("!");
      expect(expr.prefix).toBe(true);
      expect((expr.argument as AST.Identifier).name).toBe("x");
    });

    it("should parse bitwise NOT", () => {
      const expr = parseExpr("~x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("~");
      expect(expr.prefix).toBe(true);
    });

    it("should parse unary plus", () => {
      const expr = parseExpr("+x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("+");
      expect(expr.prefix).toBe(true);
    });

    it("should parse unary minus", () => {
      const expr = parseExpr("-x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("-");
      expect(expr.prefix).toBe(true);
    });

    it("should parse typeof", () => {
      const expr = parseExpr("typeof x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("typeof");
      expect(expr.prefix).toBe(true);
    });

    it("should parse void", () => {
      const expr = parseExpr("void x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("void");
      expect(expr.prefix).toBe(true);
    });

    it("should parse delete", () => {
      const expr = parseExpr("delete x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("delete");
      expect(expr.prefix).toBe(true);
    });

    it("should parse double negation", () => {
      const expr = parseExpr("!!x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("!");
      const inner = expr.argument as AST.UnaryExpression;
      expect(inner.operator).toBe("!");
      expect((inner.argument as AST.Identifier).name).toBe("x");
    });

    it("should parse chained unary: -+x", () => {
      const expr = parseExpr("-+x;") as AST.UnaryExpression;
      expect(expr.operator).toBe("-");
      const inner = expr.argument as AST.UnaryExpression;
      expect(inner.operator).toBe("+");
    });
  });

  describe("Update Expressions (prefix)", () => {
    it("should parse prefix increment", () => {
      const expr = parseExpr("++x;") as AST.UpdateExpression;
      expect(expr.type).toBe("UpdateExpression");
      expect(expr.operator).toBe("++");
      expect(expr.prefix).toBe(true);
      expect((expr.argument as AST.Identifier).name).toBe("x");
    });

    it("should parse prefix decrement", () => {
      const expr = parseExpr("--x;") as AST.UpdateExpression;
      expect(expr.type).toBe("UpdateExpression");
      expect(expr.operator).toBe("--");
      expect(expr.prefix).toBe(true);
    });
  });

  describe("Update Expressions (postfix)", () => {
    it("should parse postfix increment", () => {
      const expr = parseExpr("x++;") as AST.UpdateExpression;
      expect(expr.type).toBe("UpdateExpression");
      expect(expr.operator).toBe("++");
      expect(expr.prefix).toBe(false);
      expect((expr.argument as AST.Identifier).name).toBe("x");
    });

    it("should parse postfix decrement", () => {
      const expr = parseExpr("x--;") as AST.UpdateExpression;
      expect(expr.type).toBe("UpdateExpression");
      expect(expr.operator).toBe("--");
      expect(expr.prefix).toBe(false);
    });
  });

  describe("Conditional (Ternary) Expression", () => {
    it("should parse simple ternary", () => {
      const expr = parseExpr("a ? b : c;") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      expect((expr.test as AST.Identifier).name).toBe("a");
      expect((expr.consequent as AST.Identifier).name).toBe("b");
      expect((expr.alternate as AST.Identifier).name).toBe("c");
    });

    it("should parse nested ternary in consequent", () => {
      const expr = parseExpr("a ? b ? c : d : e;") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      expect((expr.test as AST.Identifier).name).toBe("a");
      const inner = expr.consequent as AST.ConditionalExpression;
      expect(inner.type).toBe("ConditionalExpression");
      expect((inner.test as AST.Identifier).name).toBe("b");
      expect((inner.consequent as AST.Identifier).name).toBe("c");
      expect((inner.alternate as AST.Identifier).name).toBe("d");
      expect((expr.alternate as AST.Identifier).name).toBe("e");
    });

    it("should parse nested ternary in alternate", () => {
      const expr = parseExpr("a ? b : c ? d : e;") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      expect((expr.test as AST.Identifier).name).toBe("a");
      expect((expr.consequent as AST.Identifier).name).toBe("b");
      const inner = expr.alternate as AST.ConditionalExpression;
      expect(inner.type).toBe("ConditionalExpression");
      expect((inner.test as AST.Identifier).name).toBe("c");
    });

    it("should parse ternary with binary test", () => {
      const expr = parseExpr("a > b ? c : d;") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      const test = expr.test as AST.BinaryExpression;
      expect(test.operator).toBe(">");
    });
  });

  describe("Assignment Expressions", () => {
    it("should parse simple assignment", () => {
      const expr = parseExpr("x = 1;") as AST.AssignmentExpression;
      expect(expr.type).toBe("AssignmentExpression");
      expect(expr.operator).toBe("=");
      expect((expr.left as AST.Identifier).name).toBe("x");
      expect((expr.right as AST.Literal).value).toBe(1);
    });

    it("should parse += assignment", () => {
      const expr = parseExpr("x += 1;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("+=");
    });

    it("should parse -= assignment", () => {
      const expr = parseExpr("x -= 1;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("-=");
    });

    it("should parse *= assignment", () => {
      const expr = parseExpr("x *= 2;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("*=");
    });

    it("should parse /= assignment", () => {
      const expr = parseExpr("x /= 2;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("/=");
    });

    it("should parse %= assignment", () => {
      const expr = parseExpr("x %= 3;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("%=");
    });

    it("should parse **= assignment", () => {
      const expr = parseExpr("x **= 2;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("**=");
    });

    it("should parse &= assignment", () => {
      const expr = parseExpr("x &= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("&=");
    });

    it("should parse |= assignment", () => {
      const expr = parseExpr("x |= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("|=");
    });

    it("should parse ^= assignment", () => {
      const expr = parseExpr("x ^= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("^=");
    });

    it("should parse <<= assignment", () => {
      const expr = parseExpr("x <<= 1;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("<<=");
    });

    it("should parse >>= assignment", () => {
      const expr = parseExpr("x >>= 1;") as AST.AssignmentExpression;
      expect(expr.operator).toBe(">>=");
    });

    it("should parse >>>= assignment", () => {
      const expr = parseExpr("x >>>= 1;") as AST.AssignmentExpression;
      expect(expr.operator).toBe(">>>=");
    });

    it("should parse &&= assignment", () => {
      const expr = parseExpr("x &&= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("&&=");
    });

    it("should parse ||= assignment", () => {
      const expr = parseExpr("x ||= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("||=");
    });

    it("should parse ??= assignment", () => {
      const expr = parseExpr("x ??= y;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("??=");
    });

    it("should parse chained assignment: a = b = c", () => {
      const expr = parseExpr("a = b = c;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("=");
      expect((expr.left as AST.Identifier).name).toBe("a");
      const right = expr.right as AST.AssignmentExpression;
      expect(right.operator).toBe("=");
      expect((right.left as AST.Identifier).name).toBe("b");
      expect((right.right as AST.Identifier).name).toBe("c");
    });
  });

  describe("Sequence Expression", () => {
    it("should parse comma-separated expressions", () => {
      const expr = parseExpr("a, b, c;") as AST.SequenceExpression;
      expect(expr.type).toBe("SequenceExpression");
      expect(expr.expressions.length).toBe(3);
      expect((expr.expressions[0] as AST.Identifier).name).toBe("a");
      expect((expr.expressions[1] as AST.Identifier).name).toBe("b");
      expect((expr.expressions[2] as AST.Identifier).name).toBe("c");
    });

    it("should parse two-element sequence", () => {
      const expr = parseExpr("a, b;") as AST.SequenceExpression;
      expect(expr.type).toBe("SequenceExpression");
      expect(expr.expressions.length).toBe(2);
    });
  });

  describe("Error Cases", () => {
    it("should throw when mixing ?? with ||", () => {
      expect(() => parseExpr("a ?? b || c;")).toThrow(
        /Cannot mix '\?\?' with '\|\|' or '&&'/,
      );
    });

    it("should throw when mixing ?? with &&", () => {
      expect(() => parseExpr("a ?? b && c;")).toThrow(
        /Cannot mix '\?\?' with '\|\|' or '&&'/,
      );
    });

    it("should throw when mixing || with ??", () => {
      expect(() => parseExpr("a || b ?? c;")).toThrow(
        /Cannot mix '\?\?' with '\|\|' or '&&'/,
      );
    });

    it("should throw when mixing && with ??", () => {
      expect(() => parseExpr("a && b ?? c;")).toThrow(
        /Cannot mix '\?\?' with '\|\|' or '&&'/,
      );
    });

    it("should allow ?? with || when parenthesized", () => {
      // (a ?? b) || c — the ?? is inside parens so no mixing at top level
      const expr = parseExpr("(a ?? b) || c;") as AST.LogicalExpression;
      expect(expr.operator).toBe("||");
      const left = expr.left as AST.LogicalExpression;
      expect(left.operator).toBe("??");
    });
  });

  describe("Complex Expressions", () => {
    it("should parse unary with binary: -a + b", () => {
      const expr = parseExpr("-a + b;") as AST.BinaryExpression;
      expect(expr.operator).toBe("+");
      const left = expr.left as AST.UnaryExpression;
      expect(left.operator).toBe("-");
      expect((left.argument as AST.Identifier).name).toBe("a");
    });

    it("should parse typeof in comparison: typeof x === 'string'", () => {
      const expr = parseExpr("typeof x === 'string';") as AST.BinaryExpression;
      expect(expr.operator).toBe("===");
      const left = expr.left as AST.UnaryExpression;
      expect(left.operator).toBe("typeof");
    });

    it("should parse assignment with binary RHS: x = a + b", () => {
      const expr = parseExpr("x = a + b;") as AST.AssignmentExpression;
      expect(expr.operator).toBe("=");
      const right = expr.right as AST.BinaryExpression;
      expect(right.operator).toBe("+");
    });

    it("should parse ternary with assignment: a ? x = 1 : x = 2", () => {
      const expr = parseExpr("a ? x = 1 : x = 2;") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      const consequent = expr.consequent as AST.AssignmentExpression;
      expect(consequent.operator).toBe("=");
      const alternate = expr.alternate as AST.AssignmentExpression;
      expect(alternate.operator).toBe("=");
    });

    it("should parse postfix with binary: x++ + y", () => {
      const expr = parseExpr("x++ + y;") as AST.BinaryExpression;
      expect(expr.operator).toBe("+");
      const left = expr.left as AST.UpdateExpression;
      expect(left.operator).toBe("++");
      expect(left.prefix).toBe(false);
    });

    it("should parse prefix with binary: ++x * 2", () => {
      const expr = parseExpr("++x * 2;") as AST.BinaryExpression;
      expect(expr.operator).toBe("*");
      const left = expr.left as AST.UpdateExpression;
      expect(left.operator).toBe("++");
      expect(left.prefix).toBe(true);
    });

    it("should parse void with binary: void 0 === undefined", () => {
      // void binds tighter than ===, so this is (void 0) === undefined
      // Actually void is a unary prefix so it only takes its immediate operand
      const expr = parseExpr("void 0 === undefined;") as AST.BinaryExpression;
      expect(expr.operator).toBe("===");
      const left = expr.left as AST.UnaryExpression;
      expect(left.operator).toBe("void");
    });

    it("should handle parenthesized expressions overriding precedence", () => {
      const expr = parseExpr("(1 + 2) * 3;") as AST.BinaryExpression;
      expect(expr.operator).toBe("*");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("+");
    });

    it("should parse equality chain: a === b === c (left-assoc)", () => {
      const expr = parseExpr("a == b == c;") as AST.BinaryExpression;
      expect(expr.operator).toBe("==");
      const left = expr.left as AST.BinaryExpression;
      expect(left.operator).toBe("==");
      expect((left.left as AST.Identifier).name).toBe("a");
      expect((left.right as AST.Identifier).name).toBe("b");
      expect((expr.right as AST.Identifier).name).toBe("c");
    });
  });

  describe("Node Position Tracking", () => {
    it("should track start/end for binary expression", () => {
      const expr = parseExpr("a + b;") as AST.BinaryExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(5);
    });

    it("should track start/end for unary expression", () => {
      const expr = parseExpr("!x;") as AST.UnaryExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(2);
    });

    it("should track start/end for update expression (prefix)", () => {
      const expr = parseExpr("++x;") as AST.UpdateExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(3);
    });

    it("should track start/end for update expression (postfix)", () => {
      const expr = parseExpr("x++;") as AST.UpdateExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(3);
    });

    it("should track start/end for conditional expression", () => {
      const expr = parseExpr("a ? b : c;") as AST.ConditionalExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(9);
    });

    it("should track start/end for assignment expression", () => {
      const expr = parseExpr("x = 1;") as AST.AssignmentExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(5);
    });
  });
});
