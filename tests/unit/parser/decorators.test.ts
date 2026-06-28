import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";

describe("Decorator Parsing", () => {
  describe("Class Decorators", () => {
    it("should parse a simple decorator on a class", () => {
      const program = parse("@simple class Foo {}");
      expect(program.body.length).toBe(1);
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        decorators: ReadonlyArray<{
          type: string;
          expression: { type: string; name: string };
        }>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.id.name).toBe("Foo");
      expect(decl.decorators.length).toBe(1);
      expect(decl.decorators[0].type).toBe("Decorator");
      expect(decl.decorators[0].expression.type).toBe("Identifier");
      expect(decl.decorators[0].expression.name).toBe("simple");
    });

    it("should parse a member expression decorator", () => {
      const program = parse("@module.dec class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{
          type: string;
          expression: {
            type: string;
            object: { name: string };
            property: { name: string };
          };
        }>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.decorators.length).toBe(1);
      const expr = decl.decorators[0].expression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.object.name).toBe("module");
      expect(expr.property.name).toBe("dec");
    });

    it("should parse a deeply nested member expression decorator", () => {
      const program = parse("@a.b.c class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{
          type: string;
          expression: {
            type: string;
            object: {
              type: string;
              object: { name: string };
              property: { name: string };
            };
            property: { name: string };
          };
        }>;
      };
      expect(decl.decorators.length).toBe(1);
      const expr = decl.decorators[0].expression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.property.name).toBe("c");
      expect(expr.object.type).toBe("MemberExpression");
      expect(expr.object.object.name).toBe("a");
      expect(expr.object.property.name).toBe("b");
    });

    it("should parse a call expression decorator", () => {
      const program = parse("@dec(1, 2) class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{
          type: string;
          expression: {
            type: string;
            callee: { type: string; name: string };
            arguments: ReadonlyArray<{ type: string; value: number }>;
          };
        }>;
      };
      expect(decl.decorators.length).toBe(1);
      const expr = decl.decorators[0].expression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.callee.type).toBe("Identifier");
      expect(expr.callee.name).toBe("dec");
      expect(expr.arguments.length).toBe(2);
      expect(expr.arguments[0].value).toBe(1);
      expect(expr.arguments[1].value).toBe(2);
    });

    it("should parse a member call expression decorator", () => {
      const program = parse("@mod.dec('arg') class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{
          type: string;
          expression: {
            type: string;
            callee: {
              type: string;
              object: { name: string };
              property: { name: string };
            };
            arguments: ReadonlyArray<{ value: string }>;
          };
        }>;
      };
      expect(decl.decorators.length).toBe(1);
      const expr = decl.decorators[0].expression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.callee.type).toBe("MemberExpression");
      expect(expr.callee.object.name).toBe("mod");
      expect(expr.callee.property.name).toBe("dec");
      expect(expr.arguments.length).toBe(1);
      expect(expr.arguments[0].value).toBe("arg");
    });

    it("should parse multiple stacked decorators", () => {
      const program = parse("@first @second @third class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{
          type: string;
          expression: { name: string };
        }>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.decorators.length).toBe(3);
      expect(decl.decorators[0].expression.name).toBe("first");
      expect(decl.decorators[1].expression.name).toBe("second");
      expect(decl.decorators[2].expression.name).toBe("third");
    });

    it("should parse decorators with class extends", () => {
      const program = parse("@dec class Foo extends Bar {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        superClass: { name: string };
        decorators: ReadonlyArray<{
          type: string;
          expression: { name: string };
        }>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.id.name).toBe("Foo");
      expect(decl.superClass.name).toBe("Bar");
      expect(decl.decorators.length).toBe(1);
      expect(decl.decorators[0].expression.name).toBe("dec");
    });

    it("should set start position from first decorator", () => {
      const program = parse("@dec class Foo {}");
      const decl = program.body[0] as {
        start: number;
        decorators: ReadonlyArray<{ start: number }>;
      };
      expect(decl.start).toBe(0);
      expect(decl.decorators[0].start).toBe(0);
    });
  });

  describe("Class Member Decorators", () => {
    it("should parse a decorator on a method", () => {
      const program = parse("class Foo { @dec method() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            decorators: ReadonlyArray<{
              type: string;
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("MethodDefinition");
      expect(member.key.name).toBe("method");
      expect(member.decorators.length).toBe(1);
      expect(member.decorators[0].type).toBe("Decorator");
      expect(member.decorators[0].expression.name).toBe("dec");
    });

    it("should parse a decorator on a class field", () => {
      const program = parse("class Foo { @dec field = 42 }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            value: { value: number };
            decorators: ReadonlyArray<{
              type: string;
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("PropertyDefinition");
      expect(member.key.name).toBe("field");
      expect(member.value.value).toBe(42);
      expect(member.decorators.length).toBe(1);
      expect(member.decorators[0].expression.name).toBe("dec");
    });

    it("should parse a decorator on a static method", () => {
      const program = parse("class Foo { @dec static method() {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            static: boolean;
            decorators: ReadonlyArray<{
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("MethodDefinition");
      expect(member.key.name).toBe("method");
      expect(member.static).toBe(true);
      expect(member.decorators.length).toBe(1);
      expect(member.decorators[0].expression.name).toBe("dec");
    });

    it("should parse a decorator on a static field", () => {
      const program = parse("class Foo { @dec static field = 'value' }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            static: boolean;
            decorators: ReadonlyArray<{
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("PropertyDefinition");
      expect(member.key.name).toBe("field");
      expect(member.static).toBe(true);
      expect(member.decorators.length).toBe(1);
      expect(member.decorators[0].expression.name).toBe("dec");
    });

    it("should parse multiple decorators on a method", () => {
      const program = parse("class Foo { @a @b @c method() {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            decorators: ReadonlyArray<{
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("MethodDefinition");
      expect(member.decorators.length).toBe(3);
      expect(member.decorators[0].expression.name).toBe("a");
      expect(member.decorators[1].expression.name).toBe("b");
      expect(member.decorators[2].expression.name).toBe("c");
    });

    it("should parse call expression decorator on a member", () => {
      const program = parse("class Foo { @validate(true) field = 0 }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            decorators: ReadonlyArray<{
              expression: {
                type: string;
                callee: { name: string };
                arguments: ReadonlyArray<{ value: boolean }>;
              };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.decorators.length).toBe(1);
      const expr = member.decorators[0].expression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.callee.name).toBe("validate");
      expect(expr.arguments[0].value).toBe(true);
    });

    it("should parse getter with decorator", () => {
      const program = parse("class Foo { @dec get value() {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
            decorators: ReadonlyArray<{
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("MethodDefinition");
      expect(member.kind).toBe("get");
      expect(member.key.name).toBe("value");
      expect(member.decorators.length).toBe(1);
      expect(member.decorators[0].expression.name).toBe("dec");
    });

    it("should parse setter with decorator", () => {
      const program = parse("class Foo { @dec set value(v) {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
            decorators: ReadonlyArray<{
              expression: { name: string };
            }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.type).toBe("MethodDefinition");
      expect(member.kind).toBe("set");
      expect(member.key.name).toBe("value");
      expect(member.decorators.length).toBe(1);
    });

    it("should parse members without decorators as empty array", () => {
      const program = parse("class Foo { method() {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            decorators: ReadonlyArray<unknown>;
          }>;
        };
      };
      const member = decl.body.body[0];
      expect(member.decorators.length).toBe(0);
    });
  });

  describe("Decorated Exports", () => {
    it("should parse decorator before export class", () => {
      const program = parse("@dec export class Foo {}");
      expect(program.body.length).toBe(1);
      const stmt = program.body[0] as {
        type: string;
        declaration: {
          type: string;
          id: { name: string };
          decorators: ReadonlyArray<{
            expression: { name: string };
          }>;
        };
      };
      expect(stmt.type).toBe("ExportNamedDeclaration");
      expect(stmt.declaration.type).toBe("ClassDeclaration");
      expect(stmt.declaration.id.name).toBe("Foo");
      expect(stmt.declaration.decorators.length).toBe(1);
      expect(stmt.declaration.decorators[0].expression.name).toBe("dec");
    });

    it("should parse decorator before export default class", () => {
      const program = parse("@dec export default class Foo {}");
      const stmt = program.body[0] as {
        type: string;
        declaration: {
          type: string;
          id: { name: string };
          decorators: ReadonlyArray<{
            expression: { name: string };
          }>;
        };
      };
      expect(stmt.type).toBe("ExportDefaultDeclaration");
      expect(stmt.declaration.type).toBe("ClassDeclaration");
      expect(stmt.declaration.id.name).toBe("Foo");
      expect(stmt.declaration.decorators.length).toBe(1);
      expect(stmt.declaration.decorators[0].expression.name).toBe("dec");
    });

    it("should parse multiple decorators before export class", () => {
      const program = parse("@a @b export class Foo {}");
      const stmt = program.body[0] as {
        type: string;
        declaration: {
          type: string;
          decorators: ReadonlyArray<{
            expression: { name: string };
          }>;
        };
      };
      expect(stmt.type).toBe("ExportNamedDeclaration");
      expect(stmt.declaration.decorators.length).toBe(2);
      expect(stmt.declaration.decorators[0].expression.name).toBe("a");
      expect(stmt.declaration.decorators[1].expression.name).toBe("b");
    });
  });

  describe("Error Cases", () => {
    it("should throw when decorator is not followed by class or export", () => {
      expect(() => parse("@dec function foo() {}")).toThrow();
    });

    it("should throw when decorator is not followed by anything valid", () => {
      expect(() => parse("@dec const x = 1")).toThrow();
    });

    it("should throw when @ is not followed by identifier", () => {
      expect(() => parse("@123 class Foo {}")).toThrow();
    });

    it("should throw when decorator member access has no identifier after dot", () => {
      expect(() => parse("@foo. class Foo {}")).toThrow();
    });
  });

  describe("Decorator with No Arguments (empty call)", () => {
    it("should parse decorator with empty call expression", () => {
      const program = parse("@dec() class Foo {}");
      const decl = program.body[0] as {
        decorators: ReadonlyArray<{
          expression: {
            type: string;
            callee: { name: string };
            arguments: ReadonlyArray<unknown>;
          };
        }>;
      };
      expect(decl.decorators.length).toBe(1);
      const expr = decl.decorators[0].expression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.callee.name).toBe("dec");
      expect(expr.arguments.length).toBe(0);
    });
  });

  describe("Combined Class and Member Decorators", () => {
    it("should parse both class decorators and member decorators", () => {
      const program = parse(`
        @classDec
        class Foo {
          @memberDec
          method() {}
        }
      `);
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<{ expression: { name: string } }>;
        body: {
          body: ReadonlyArray<{
            type: string;
            decorators: ReadonlyArray<{ expression: { name: string } }>;
          }>;
        };
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.decorators.length).toBe(1);
      expect(decl.decorators[0].expression.name).toBe("classDec");
      expect(decl.body.body[0].decorators.length).toBe(1);
      expect(decl.body.body[0].decorators[0].expression.name).toBe("memberDec");
    });

    it("should parse multiple decorated members in one class", () => {
      const program = parse(`
        class Foo {
          @dec1 field1 = 1;
          @dec2 field2 = 2;
          @dec3 method() {}
        }
      `);
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            type: string;
            decorators: ReadonlyArray<{ expression: { name: string } }>;
          }>;
        };
      };
      const members = decl.body.body;
      expect(members.length).toBe(3);
      expect(members[0].decorators[0].expression.name).toBe("dec1");
      expect(members[1].decorators[0].expression.name).toBe("dec2");
      expect(members[2].decorators[0].expression.name).toBe("dec3");
    });
  });

  describe("Decorator Position Tracking", () => {
    it("should correctly track start and end positions", () => {
      const program = parse("@dec class Foo {}");
      const decl = program.body[0] as {
        start: number;
        end: number;
        decorators: ReadonlyArray<{
          start: number;
          end: number;
          expression: { start: number; end: number };
        }>;
      };
      // Decorator starts at @ (position 0)
      expect(decl.decorators[0].start).toBe(0);
      // Expression 'dec' starts at position 1, ends at position 4
      expect(decl.decorators[0].expression.start).toBe(1);
      expect(decl.decorators[0].expression.end).toBe(4);
      // Decorator end matches expression end
      expect(decl.decorators[0].end).toBe(4);
      // Class declaration start is set to decorator start
      expect(decl.start).toBe(0);
    });

    it("should track positions for member decorators", () => {
      const program = parse("class Foo { @dec method() {} }");
      const decl = program.body[0] as {
        body: {
          body: ReadonlyArray<{
            start: number;
            decorators: ReadonlyArray<{ start: number; end: number }>;
          }>;
        };
      };
      const member = decl.body.body[0];
      // @dec starts at position 12
      expect(member.decorators[0].start).toBe(12);
      // Member start should be decorator start
      expect(member.start).toBe(12);
    });
  });

  describe("Class Declaration without Decorators", () => {
    it("should have empty decorators array when no decorators", () => {
      const program = parse("class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: ReadonlyArray<unknown>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.decorators.length).toBe(0);
    });
  });
});
