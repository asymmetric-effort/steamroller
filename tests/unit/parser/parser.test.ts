import { describe, it, expect } from "vitest";
import { Parser, parse } from "../../../src/parser/parser.js";
import type { ParseOptions } from "../../../src/parser/parser.js";

describe("Parser", () => {
  describe("constructor", () => {
    it("should create a parser with default options", () => {
      const parser = new Parser("");
      expect(parser).toBeInstanceOf(Parser);
    });

    it("should create a parser with module sourceType", () => {
      const parser = new Parser("", { sourceType: "module" });
      expect(parser).toBeInstanceOf(Parser);
    });

    it("should create a parser with script sourceType", () => {
      const parser = new Parser("", { sourceType: "script" });
      expect(parser).toBeInstanceOf(Parser);
    });

    it("should create a parser with allowHashBang option", () => {
      const parser = new Parser("#!/usr/bin/env node\n", {
        allowHashBang: true,
      });
      expect(parser).toBeInstanceOf(Parser);
    });

    it("should create a parser with ecmaVersion option", () => {
      const parser = new Parser("", { ecmaVersion: 2024 });
      expect(parser).toBeInstanceOf(Parser);
    });

    it("should accept undefined options", () => {
      const parser = new Parser("", undefined);
      expect(parser).toBeInstanceOf(Parser);
    });
  });

  describe("parseProgram()", () => {
    it("should return a Program node for empty source", () => {
      const parser = new Parser("");
      const program = parser.parseProgram();
      expect(program.type).toBe("Program");
      expect(program.body).toEqual([]);
      expect(program.sourceType).toBe("module");
      expect(program.start).toBe(0);
      expect(program.end).toBe(0);
    });

    it("should return module sourceType by default", () => {
      const parser = new Parser("");
      const program = parser.parseProgram();
      expect(program.sourceType).toBe("module");
    });

    it("should return script sourceType when specified", () => {
      const parser = new Parser("", { sourceType: "script" });
      const program = parser.parseProgram();
      expect(program.sourceType).toBe("script");
    });

    it("should return a frozen Program node", () => {
      const parser = new Parser("");
      const program = parser.parseProgram();
      expect(Object.isFrozen(program)).toBe(true);
    });

    it("should return a frozen body array", () => {
      const parser = new Parser("");
      const program = parser.parseProgram();
      expect(Object.isFrozen(program.body)).toBe(true);
    });

    it("should parse empty statements (semicolons)", () => {
      const parser = new Parser(";");
      const program = parser.parseProgram();
      expect(program.body.length).toBe(1);
      expect(program.body[0].type).toBe("EmptyStatement");
    });

    it("should parse multiple empty statements", () => {
      const parser = new Parser(";;;");
      const program = parser.parseProgram();
      expect(program.body.length).toBe(3);
      expect(program.body[0].type).toBe("EmptyStatement");
      expect(program.body[1].type).toBe("EmptyStatement");
      expect(program.body[2].type).toBe("EmptyStatement");
    });

    it("should set correct positions for empty statements", () => {
      const parser = new Parser(";");
      const program = parser.parseProgram();
      expect(program.body[0].start).toBe(0);
      expect(program.body[0].end).toBe(1);
    });

    it("should set correct end position for program with content", () => {
      const parser = new Parser("  ;  ");
      const program = parser.parseProgram();
      expect(program.end).toBe(5);
    });

    it("should handle whitespace-only source", () => {
      const parser = new Parser("   \n\t  ");
      const program = parser.parseProgram();
      expect(program.body).toEqual([]);
      expect(program.type).toBe("Program");
    });

    it("should handle comment-only source", () => {
      const parser = new Parser("// just a comment");
      const program = parser.parseProgram();
      expect(program.body).toEqual([]);
    });

    it("should handle hashbang source when allowed", () => {
      const parser = new Parser("#!/usr/bin/env node\n;", {
        allowHashBang: true,
      });
      const program = parser.parseProgram();
      expect(program.body.length).toBe(1);
      expect(program.body[0].type).toBe("EmptyStatement");
    });

    it("should parse identifiers as expression statements", () => {
      const parser = new Parser("foo");
      const program = parser.parseProgram();
      expect(program.body.length).toBe(1);
      expect(program.body[0].type).toBe("ExpressionStatement");
    });

    it("should parse identifier expression with correct name", () => {
      const parser = new Parser("foo");
      const program = parser.parseProgram();
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; name: string };
      };
      expect(stmt.expression.type).toBe("Identifier");
      expect(stmt.expression.name).toBe("foo");
    });

    it("should parse identifier with leading whitespace at correct position", () => {
      const parser = new Parser("  foo");
      const program = parser.parseProgram();
      const stmt = program.body[0] as { type: string; start: number };
      expect(stmt.start).toBe(2);
    });
  });
});

describe("parse() function", () => {
  it("should parse empty source to Program", () => {
    const program = parse("");
    expect(program.type).toBe("Program");
    expect(program.body).toEqual([]);
    expect(program.sourceType).toBe("module");
  });

  it("should accept options", () => {
    const program = parse("", { sourceType: "script" });
    expect(program.sourceType).toBe("script");
  });

  it("should default to module sourceType", () => {
    const program = parse("");
    expect(program.sourceType).toBe("module");
  });

  it("should parse semicolons as empty statements", () => {
    const program = parse(";");
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe("EmptyStatement");
  });

  it("should parse identifiers as expression statements", () => {
    const program = parse("x");
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe("ExpressionStatement");
  });

  it("should accept allowHashBang option", () => {
    const program = parse("#!/usr/bin/env node\n", { allowHashBang: true });
    expect(program.body).toEqual([]);
  });

  it("should handle ParseOptions interface types correctly", () => {
    const opts: ParseOptions = {
      sourceType: "module",
      allowHashBang: false,
      ecmaVersion: 2024,
    };
    const program = parse("", opts);
    expect(program.type).toBe("Program");
  });

  it("should handle undefined options", () => {
    const program = parse("", undefined);
    expect(program.type).toBe("Program");
    expect(program.sourceType).toBe("module");
  });

  it("should handle empty options object", () => {
    const program = parse("", {});
    expect(program.type).toBe("Program");
    expect(program.sourceType).toBe("module");
  });
});
