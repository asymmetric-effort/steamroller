/**
 * Tests for statement parsing in the Steamroller parser.
 *
 * Covers all statement types: block, empty, debugger, return, throw,
 * break, continue, if, while, do-while, for, for-in, for-of, switch,
 * try/catch/finally, with, labeled, variable declarations, and
 * expression statements.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../../src/parser/parser.js';

describe('Statement Parsing', () => {
  describe('EmptyStatement', () => {
    it('should parse a single semicolon', () => {
      const program = parse(';');
      expect(program.body.length).toBe(1);
      expect(program.body[0].type).toBe('EmptyStatement');
    });

    it('should parse multiple semicolons', () => {
      const program = parse(';;;');
      expect(program.body.length).toBe(3);
    });

    it('should set correct positions', () => {
      const program = parse(';');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
      expect(stmt.end).toBe(1);
    });
  });

  describe('BlockStatement', () => {
    it('should parse an empty block', () => {
      const program = parse('{}');
      expect(program.body.length).toBe(1);
      expect(program.body[0].type).toBe('BlockStatement');
      const block = program.body[0] as { type: string; body: unknown[] };
      expect(block.body.length).toBe(0);
    });

    it('should parse a block with statements', () => {
      const program = parse('{ ; ; }');
      const block = program.body[0] as { type: string; body: unknown[] };
      expect(block.body.length).toBe(2);
    });

    it('should parse nested blocks', () => {
      const program = parse('{ { } }');
      const outer = program.body[0] as { type: string; body: Array<{ type: string }> };
      expect(outer.body[0].type).toBe('BlockStatement');
    });

    it('should set correct positions for block', () => {
      const program = parse('{}');
      const block = program.body[0];
      expect(block.start).toBe(0);
      expect(block.end).toBe(2);
    });
  });

  describe('DebuggerStatement', () => {
    it('should parse debugger;', () => {
      const program = parse('debugger;');
      expect(program.body[0].type).toBe('DebuggerStatement');
    });

    it('should parse debugger with ASI', () => {
      const program = parse('debugger\n;');
      expect(program.body[0].type).toBe('DebuggerStatement');
    });

    it('should set correct start position', () => {
      const program = parse('debugger;');
      expect(program.body[0].start).toBe(0);
    });
  });

  describe('ReturnStatement', () => {
    it('should parse return with no argument', () => {
      const program = parse('return;', { sourceType: 'script' });
      const stmt = program.body[0] as { type: string; argument: unknown };
      expect(stmt.type).toBe('ReturnStatement');
      expect(stmt.argument).toBeNull();
    });

    it('should parse return with expression', () => {
      const program = parse('return 42;', { sourceType: 'script' });
      const stmt = program.body[0] as { type: string; argument: { type: string; value: number } };
      expect(stmt.type).toBe('ReturnStatement');
      expect(stmt.argument.type).toBe('Literal');
      expect(stmt.argument.value).toBe(42);
    });

    it('should handle ASI after return with newline', () => {
      const program = parse('return\n42;', { sourceType: 'script' });
      const stmt = program.body[0] as { type: string; argument: unknown };
      expect(stmt.type).toBe('ReturnStatement');
      expect(stmt.argument).toBeNull();
    });

    it('should parse return with identifier', () => {
      const program = parse('return x;', { sourceType: 'script' });
      const stmt = program.body[0] as { type: string; argument: { type: string; name: string } };
      expect(stmt.argument.type).toBe('Identifier');
      expect(stmt.argument.name).toBe('x');
    });
  });

  describe('ThrowStatement', () => {
    it('should parse throw with expression', () => {
      const program = parse('throw x;');
      const stmt = program.body[0] as { type: string; argument: { type: string; name: string } };
      expect(stmt.type).toBe('ThrowStatement');
      expect(stmt.argument.type).toBe('Identifier');
      expect(stmt.argument.name).toBe('x');
    });

    it('should parse throw with new expression', () => {
      const program = parse('throw new Error();');
      const stmt = program.body[0] as { type: string; argument: { type: string } };
      expect(stmt.type).toBe('ThrowStatement');
      expect(stmt.argument.type).toBe('NewExpression');
    });

    it('should throw error on newline after throw', () => {
      expect(() => parse('throw\nx;')).toThrow(/newline after throw/);
    });

    it('should set correct positions', () => {
      const program = parse('throw x;');
      const stmt = program.body[0] as { type: string; argument: { end: number }; start: number };
      expect(stmt.start).toBe(0);
      expect(stmt.argument.end).toBe(7);
    });
  });

  describe('BreakStatement', () => {
    it('should parse break without label', () => {
      const program = parse('break;');
      const stmt = program.body[0] as { type: string; label: unknown };
      expect(stmt.type).toBe('BreakStatement');
      expect(stmt.label).toBeNull();
    });

    it('should parse break with label', () => {
      const program = parse('break foo;');
      const stmt = program.body[0] as { type: string; label: { type: string; name: string } };
      expect(stmt.type).toBe('BreakStatement');
      expect(stmt.label.type).toBe('Identifier');
      expect(stmt.label.name).toBe('foo');
    });

    it('should handle ASI: break with newline before label', () => {
      const program = parse('break\nfoo;');
      const stmt = program.body[0] as { type: string; label: unknown };
      expect(stmt.type).toBe('BreakStatement');
      expect(stmt.label).toBeNull();
    });
  });

  describe('ContinueStatement', () => {
    it('should parse continue without label', () => {
      const program = parse('continue;');
      const stmt = program.body[0] as { type: string; label: unknown };
      expect(stmt.type).toBe('ContinueStatement');
      expect(stmt.label).toBeNull();
    });

    it('should parse continue with label', () => {
      const program = parse('continue foo;');
      const stmt = program.body[0] as { type: string; label: { type: string; name: string } };
      expect(stmt.type).toBe('ContinueStatement');
      expect(stmt.label.type).toBe('Identifier');
      expect(stmt.label.name).toBe('foo');
    });

    it('should handle ASI: continue with newline before label', () => {
      const program = parse('continue\nfoo;');
      const stmt = program.body[0] as { type: string; label: unknown };
      expect(stmt.type).toBe('ContinueStatement');
      expect(stmt.label).toBeNull();
    });
  });

  describe('IfStatement', () => {
    it('should parse if without else', () => {
      const program = parse('if (x) ;');
      const stmt = program.body[0] as {
        type: string;
        test: { type: string; name: string };
        consequent: { type: string };
        alternate: unknown;
      };
      expect(stmt.type).toBe('IfStatement');
      expect(stmt.test.name).toBe('x');
      expect(stmt.consequent.type).toBe('EmptyStatement');
      expect(stmt.alternate).toBeNull();
    });

    it('should parse if with else', () => {
      const program = parse('if (x) ; else ;');
      const stmt = program.body[0] as {
        type: string;
        alternate: { type: string };
      };
      expect(stmt.type).toBe('IfStatement');
      expect(stmt.alternate).not.toBeNull();
      expect(stmt.alternate.type).toBe('EmptyStatement');
    });

    it('should parse if with block body', () => {
      const program = parse('if (x) {}');
      const stmt = program.body[0] as {
        type: string;
        consequent: { type: string };
      };
      expect(stmt.consequent.type).toBe('BlockStatement');
    });

    it('should parse nested if-else (dangling else)', () => {
      const program = parse('if (x) if (y) ; else ;');
      const stmt = program.body[0] as {
        type: string;
        consequent: { type: string; alternate: unknown };
        alternate: unknown;
      };
      expect(stmt.type).toBe('IfStatement');
      // Else associates with innermost if
      expect(stmt.alternate).toBeNull();
      expect(stmt.consequent.type).toBe('IfStatement');
      expect(stmt.consequent.alternate).not.toBeNull();
    });

    it('should set correct positions', () => {
      const program = parse('if (x) ;');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
    });
  });

  describe('WhileStatement', () => {
    it('should parse while loop', () => {
      const program = parse('while (x) ;');
      const stmt = program.body[0] as {
        type: string;
        test: { name: string };
        body: { type: string };
      };
      expect(stmt.type).toBe('WhileStatement');
      expect(stmt.test.name).toBe('x');
      expect(stmt.body.type).toBe('EmptyStatement');
    });

    it('should parse while with block body', () => {
      const program = parse('while (x) {}');
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(stmt.body.type).toBe('BlockStatement');
    });

    it('should parse while with expression test', () => {
      const program = parse('while (true) ;');
      const stmt = program.body[0] as {
        type: string;
        test: { value: boolean };
      };
      expect(stmt.test.value).toBe(true);
    });
  });

  describe('DoWhileStatement', () => {
    it('should parse do-while loop', () => {
      const program = parse('do ; while (x);');
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
        test: { name: string };
      };
      expect(stmt.type).toBe('DoWhileStatement');
      expect(stmt.body.type).toBe('EmptyStatement');
      expect(stmt.test.name).toBe('x');
    });

    it('should parse do-while with block body', () => {
      const program = parse('do {} while (x);');
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(stmt.body.type).toBe('BlockStatement');
    });

    it('should parse do-while without trailing semicolon (ASI)', () => {
      const program = parse('do ; while (x)\n;');
      expect(program.body[0].type).toBe('DoWhileStatement');
    });
  });

  describe('ForStatement', () => {
    it('should parse for with all parts', () => {
      const program = parse('for (x; y; z) ;');
      const stmt = program.body[0] as {
        type: string;
        init: { name: string };
        test: { name: string };
        update: { name: string };
        body: { type: string };
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.init.name).toBe('x');
      expect(stmt.test.name).toBe('y');
      expect(stmt.update.name).toBe('z');
      expect(stmt.body.type).toBe('EmptyStatement');
    });

    it('should parse for with empty init', () => {
      const program = parse('for (; y; z) ;');
      const stmt = program.body[0] as {
        type: string;
        init: unknown;
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.init).toBeNull();
    });

    it('should parse for with empty test', () => {
      const program = parse('for (x; ; z) ;');
      const stmt = program.body[0] as {
        type: string;
        test: unknown;
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.test).toBeNull();
    });

    it('should parse for with empty update', () => {
      const program = parse('for (x; y;) ;');
      const stmt = program.body[0] as {
        type: string;
        update: unknown;
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.update).toBeNull();
    });

    it('should parse for with all parts empty', () => {
      const program = parse('for (;;) ;');
      const stmt = program.body[0] as {
        type: string;
        init: unknown;
        test: unknown;
        update: unknown;
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.init).toBeNull();
      expect(stmt.test).toBeNull();
      expect(stmt.update).toBeNull();
    });

    it('should parse for with var declaration', () => {
      const program = parse('for (var i = 0; i; i) ;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        init: { type: string; kind: string };
      };
      expect(stmt.type).toBe('ForStatement');
      expect(stmt.init.type).toBe('VariableDeclaration');
      expect(stmt.init.kind).toBe('var');
    });
  });

  describe('ForInStatement', () => {
    it('should parse for-in with var', () => {
      const program = parse('for (var x in obj) ;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        left: { type: string; kind: string };
        right: { name: string };
      };
      expect(stmt.type).toBe('ForInStatement');
      expect(stmt.left.type).toBe('VariableDeclaration');
      expect(stmt.right.name).toBe('obj');
    });

    it('should parse for-in with expression', () => {
      const program = parse('for (x in obj) ;');
      const stmt = program.body[0] as {
        type: string;
        left: { type: string; name: string };
        right: { name: string };
      };
      expect(stmt.type).toBe('ForInStatement');
      expect(stmt.left.name).toBe('x');
      expect(stmt.right.name).toBe('obj');
    });

    it('should parse for-in with block body', () => {
      const program = parse('for (x in obj) {}');
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(stmt.body.type).toBe('BlockStatement');
    });
  });

  describe('ForOfStatement', () => {
    it('should parse for-of with const', () => {
      const program = parse('for (const x of arr) ;');
      const stmt = program.body[0] as {
        type: string;
        left: { type: string; kind: string };
        right: { name: string };
        await: boolean;
      };
      expect(stmt.type).toBe('ForOfStatement');
      expect(stmt.left.type).toBe('VariableDeclaration');
      expect(stmt.left.kind).toBe('const');
      expect(stmt.right.name).toBe('arr');
      expect(stmt.await).toBe(false);
    });

    it('should parse for-of with expression', () => {
      const program = parse('for (x of arr) ;');
      const stmt = program.body[0] as {
        type: string;
        left: { name: string };
      };
      expect(stmt.type).toBe('ForOfStatement');
      expect(stmt.left.name).toBe('x');
    });

    it('should parse for-of with let', () => {
      const program = parse('for (let x of arr) ;');
      const stmt = program.body[0] as {
        type: string;
        left: { kind: string };
      };
      expect(stmt.type).toBe('ForOfStatement');
      expect(stmt.left.kind).toBe('let');
    });
  });

  describe('SwitchStatement', () => {
    it('should parse switch with single case', () => {
      const program = parse('switch (x) { case 1: ; }');
      const stmt = program.body[0] as {
        type: string;
        discriminant: { name: string };
        cases: Array<{ type: string; test: { value: number }; consequent: unknown[] }>;
      };
      expect(stmt.type).toBe('SwitchStatement');
      expect(stmt.discriminant.name).toBe('x');
      expect(stmt.cases.length).toBe(1);
      expect(stmt.cases[0].test.value).toBe(1);
      expect(stmt.cases[0].consequent.length).toBe(1);
    });

    it('should parse switch with default', () => {
      const program = parse('switch (x) { default: ; }');
      const stmt = program.body[0] as {
        type: string;
        cases: Array<{ test: unknown }>;
      };
      expect(stmt.cases[0].test).toBeNull();
    });

    it('should parse switch with multiple cases and default', () => {
      const program = parse('switch (x) { case 1: ; case 2: ; default: ; }');
      const stmt = program.body[0] as {
        type: string;
        cases: unknown[];
      };
      expect(stmt.cases.length).toBe(3);
    });

    it('should parse switch with fallthrough (no consequent)', () => {
      const program = parse('switch (x) { case 1: case 2: ; }');
      const stmt = program.body[0] as {
        type: string;
        cases: Array<{ consequent: unknown[] }>;
      };
      expect(stmt.cases[0].consequent.length).toBe(0);
      expect(stmt.cases[1].consequent.length).toBe(1);
    });

    it('should set correct positions', () => {
      const program = parse('switch (x) {}');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
    });
  });

  describe('TryStatement', () => {
    it('should parse try-catch', () => {
      const program = parse('try {} catch (e) {}');
      const stmt = program.body[0] as {
        type: string;
        block: { type: string };
        handler: { type: string; param: { name: string } };
        finalizer: unknown;
      };
      expect(stmt.type).toBe('TryStatement');
      expect(stmt.block.type).toBe('BlockStatement');
      expect(stmt.handler.type).toBe('CatchClause');
      expect(stmt.handler.param.name).toBe('e');
      expect(stmt.finalizer).toBeNull();
    });

    it('should parse try-finally', () => {
      const program = parse('try {} finally {}');
      const stmt = program.body[0] as {
        type: string;
        handler: unknown;
        finalizer: { type: string };
      };
      expect(stmt.handler).toBeNull();
      expect(stmt.finalizer).not.toBeNull();
      expect(stmt.finalizer.type).toBe('BlockStatement');
    });

    it('should parse try-catch-finally', () => {
      const program = parse('try {} catch (e) {} finally {}');
      const stmt = program.body[0] as {
        type: string;
        handler: { type: string };
        finalizer: { type: string };
      };
      expect(stmt.handler).not.toBeNull();
      expect(stmt.finalizer).not.toBeNull();
    });

    it('should parse optional catch binding', () => {
      const program = parse('try {} catch {}');
      const stmt = program.body[0] as {
        type: string;
        handler: { param: unknown };
      };
      expect(stmt.handler.param).toBeNull();
    });

    it('should throw if neither catch nor finally present', () => {
      expect(() => parse('try {}')).toThrow(/Missing catch or finally/);
    });

    it('should set correct positions', () => {
      const program = parse('try {} catch (e) {}');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
    });
  });

  describe('WithStatement', () => {
    it('should parse with statement', () => {
      const program = parse('with (obj) ;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        object: { name: string };
        body: { type: string };
      };
      expect(stmt.type).toBe('WithStatement');
      expect(stmt.object.name).toBe('obj');
      expect(stmt.body.type).toBe('EmptyStatement');
    });

    it('should parse with with block body', () => {
      const program = parse('with (obj) {}', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(stmt.body.type).toBe('BlockStatement');
    });
  });

  describe('LabeledStatement', () => {
    it('should parse labeled statement', () => {
      const program = parse('foo: ;');
      const stmt = program.body[0] as {
        type: string;
        label: { type: string; name: string };
        body: { type: string };
      };
      expect(stmt.type).toBe('LabeledStatement');
      expect(stmt.label.name).toBe('foo');
      expect(stmt.body.type).toBe('EmptyStatement');
    });

    it('should parse labeled block', () => {
      const program = parse('foo: {}');
      const stmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(stmt.type).toBe('LabeledStatement');
      expect(stmt.body.type).toBe('BlockStatement');
    });

    it('should parse labeled loop', () => {
      const program = parse('outer: while (true) ;');
      const stmt = program.body[0] as {
        type: string;
        label: { name: string };
        body: { type: string };
      };
      expect(stmt.type).toBe('LabeledStatement');
      expect(stmt.label.name).toBe('outer');
      expect(stmt.body.type).toBe('WhileStatement');
    });

    it('should set correct positions', () => {
      const program = parse('foo: ;');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
    });
  });

  describe('VariableDeclaration', () => {
    it('should parse var declaration', () => {
      const program = parse('var x = 1;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        kind: string;
        declarations: Array<{
          type: string;
          id: { name: string };
          init: { value: number };
        }>;
      };
      expect(stmt.type).toBe('VariableDeclaration');
      expect(stmt.kind).toBe('var');
      expect(stmt.declarations.length).toBe(1);
      expect(stmt.declarations[0].id.name).toBe('x');
      expect(stmt.declarations[0].init.value).toBe(1);
    });

    it('should parse let declaration', () => {
      const program = parse('let x = 1;');
      const stmt = program.body[0] as {
        type: string;
        kind: string;
      };
      expect(stmt.type).toBe('VariableDeclaration');
      expect(stmt.kind).toBe('let');
    });

    it('should parse const declaration', () => {
      const program = parse('const x = 1;');
      const stmt = program.body[0] as {
        type: string;
        kind: string;
      };
      expect(stmt.type).toBe('VariableDeclaration');
      expect(stmt.kind).toBe('const');
    });

    it('should parse multiple declarators', () => {
      const program = parse('var x = 1, y = 2;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        declarations: Array<{ id: { name: string }; init: { value: number } }>;
      };
      expect(stmt.declarations.length).toBe(2);
      expect(stmt.declarations[0].id.name).toBe('x');
      expect(stmt.declarations[1].id.name).toBe('y');
    });

    it('should parse declaration without initializer', () => {
      const program = parse('var x;', { sourceType: 'script' });
      const stmt = program.body[0] as {
        type: string;
        declarations: Array<{ init: unknown }>;
      };
      expect(stmt.declarations[0].init).toBeNull();
    });

    it('should set correct positions', () => {
      const program = parse('const x = 1;');
      const stmt = program.body[0];
      expect(stmt.start).toBe(0);
    });
  });

  describe('ExpressionStatement', () => {
    it('should parse identifier expression', () => {
      const program = parse('x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; name: string };
      };
      expect(stmt.type).toBe('ExpressionStatement');
      expect(stmt.expression.type).toBe('Identifier');
      expect(stmt.expression.name).toBe('x');
    });

    it('should parse numeric literal expression', () => {
      const program = parse('42;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; value: number };
      };
      expect(stmt.type).toBe('ExpressionStatement');
      expect(stmt.expression.value).toBe(42);
    });

    it('should parse string literal expression (directive)', () => {
      const program = parse('"use strict";');
      const stmt = program.body[0] as {
        type: string;
        expression: { value: string };
        directive?: string;
      };
      expect(stmt.type).toBe('ExpressionStatement');
      expect(stmt.directive).toBe('use strict');
    });

    it('should parse assignment expression', () => {
      const program = parse('x = 1;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          operator: string;
          left: { name: string };
          right: { value: number };
        };
      };
      expect(stmt.expression.type).toBe('AssignmentExpression');
      expect(stmt.expression.operator).toBe('=');
      expect(stmt.expression.left.name).toBe('x');
      expect(stmt.expression.right.value).toBe(1);
    });

    it('should parse call expression', () => {
      const program = parse('foo();');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; callee: { name: string }; arguments: unknown[] };
      };
      expect(stmt.expression.type).toBe('CallExpression');
      expect(stmt.expression.callee.name).toBe('foo');
      expect(stmt.expression.arguments.length).toBe(0);
    });

    it('should parse call expression with arguments', () => {
      const program = parse('foo(1, 2);');
      const stmt = program.body[0] as {
        type: string;
        expression: { arguments: unknown[] };
      };
      expect(stmt.expression.arguments.length).toBe(2);
    });

    it('should parse member expression', () => {
      const program = parse('a.b;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          object: { name: string };
          property: { name: string };
          computed: boolean;
        };
      };
      expect(stmt.expression.type).toBe('MemberExpression');
      expect(stmt.expression.object.name).toBe('a');
      expect(stmt.expression.property.name).toBe('b');
      expect(stmt.expression.computed).toBe(false);
    });

    it('should parse computed member expression', () => {
      const program = parse('a[0];');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; computed: boolean };
      };
      expect(stmt.expression.type).toBe('MemberExpression');
      expect(stmt.expression.computed).toBe(true);
    });

    it('should handle ASI', () => {
      const program = parse('x\ny');
      expect(program.body.length).toBe(2);
      expect(program.body[0].type).toBe('ExpressionStatement');
      expect(program.body[1].type).toBe('ExpressionStatement');
    });

    it('should parse binary expression', () => {
      const program = parse('x + y;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          operator: string;
          left: { name: string };
          right: { name: string };
        };
      };
      expect(stmt.expression.type).toBe('BinaryExpression');
      expect(stmt.expression.operator).toBe('+');
    });

    it('should parse unary expression', () => {
      const program = parse('!x;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          operator: string;
          prefix: boolean;
        };
      };
      expect(stmt.expression.type).toBe('UnaryExpression');
      expect(stmt.expression.operator).toBe('!');
      expect(stmt.expression.prefix).toBe(true);
    });

    it('should parse this expression', () => {
      const program = parse('this;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string };
      };
      expect(stmt.expression.type).toBe('ThisExpression');
    });

    it('should parse null literal', () => {
      const program = parse('null;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; value: unknown };
      };
      expect(stmt.expression.type).toBe('Literal');
      expect(stmt.expression.value).toBeNull();
    });

    it('should parse boolean literals', () => {
      const program = parse('true;');
      const stmt = program.body[0] as {
        type: string;
        expression: { value: boolean };
      };
      expect(stmt.expression.value).toBe(true);
    });

    it('should parse sequence expression', () => {
      const program = parse('x, y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; expressions: Array<{ name: string }> };
      };
      expect(stmt.expression.type).toBe('SequenceExpression');
      expect(stmt.expression.expressions.length).toBe(2);
    });

    it('should parse new expression', () => {
      const program = parse('new Foo();');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; callee: { name: string } };
      };
      expect(stmt.expression.type).toBe('NewExpression');
      expect(stmt.expression.callee.name).toBe('Foo');
    });
  });

  describe('Nested statements', () => {
    it('should parse if inside while', () => {
      const program = parse('while (x) if (y) ;');
      const whileStmt = program.body[0] as {
        type: string;
        body: { type: string };
      };
      expect(whileStmt.type).toBe('WhileStatement');
      expect(whileStmt.body.type).toBe('IfStatement');
    });

    it('should parse while inside if', () => {
      const program = parse('if (x) while (y) ;');
      const ifStmt = program.body[0] as {
        type: string;
        consequent: { type: string };
      };
      expect(ifStmt.type).toBe('IfStatement');
      expect(ifStmt.consequent.type).toBe('WhileStatement');
    });

    it('should parse block with multiple statement types', () => {
      const program = parse('{ ; debugger; break; }');
      const block = program.body[0] as {
        type: string;
        body: Array<{ type: string }>;
      };
      expect(block.body.length).toBe(3);
      expect(block.body[0].type).toBe('EmptyStatement');
      expect(block.body[1].type).toBe('DebuggerStatement');
      expect(block.body[2].type).toBe('BreakStatement');
    });

    it('should parse for inside switch case', () => {
      const program = parse('switch (x) { case 1: for (;;) ; }');
      const switchStmt = program.body[0] as {
        type: string;
        cases: Array<{ consequent: Array<{ type: string }> }>;
      };
      expect(switchStmt.cases[0].consequent[0].type).toBe('ForStatement');
    });

    it('should parse try with if in catch', () => {
      const program = parse('try {} catch (e) { if (e) ; }');
      const tryStmt = program.body[0] as {
        type: string;
        handler: { body: { body: Array<{ type: string }> } };
      };
      expect(tryStmt.handler.body.body[0].type).toBe('IfStatement');
    });
  });

  describe('Error cases', () => {
    it('should throw on missing closing brace for block', () => {
      expect(() => parse('{')).toThrow();
    });

    it('should throw on missing paren in if condition', () => {
      expect(() => parse('if x ;')).toThrow();
    });

    it('should throw on missing paren in while condition', () => {
      expect(() => parse('while x ;')).toThrow();
    });

    it('should throw on missing while in do-while', () => {
      expect(() => parse('do ; }')).toThrow();
    });

    it('should throw on missing paren in for', () => {
      expect(() => parse('for x ;')).toThrow();
    });

    it('should throw on missing paren in switch', () => {
      expect(() => parse('switch x {}')).toThrow();
    });

    it('should throw on try without catch or finally', () => {
      expect(() => parse('try {}')).toThrow(/Missing catch or finally/);
    });

    it('should throw on throw with newline', () => {
      expect(() => parse('throw\nx;')).toThrow(/newline after throw/);
    });

    it('should throw on unexpected token in expression', () => {
      expect(() => parse('if () ;')).toThrow();
    });

    it('should throw on missing semicolon when ASI does not apply', () => {
      expect(() => parse('x y')).toThrow();
    });
  });

  describe('ASI (Automatic Semicolon Insertion)', () => {
    it('should insert semicolon before }', () => {
      const program = parse('{ x }');
      const block = program.body[0] as { body: Array<{ type: string }> };
      expect(block.body[0].type).toBe('ExpressionStatement');
    });

    it('should insert semicolon at EOF', () => {
      const program = parse('x');
      expect(program.body[0].type).toBe('ExpressionStatement');
    });

    it('should insert semicolon after line terminator', () => {
      const program = parse('x\ny');
      expect(program.body.length).toBe(2);
    });

    it('should not insert semicolon when no line terminator', () => {
      expect(() => parse('x y')).toThrow();
    });
  });

  describe('Compound assignment operators', () => {
    it('should parse +=', () => {
      const program = parse('x += 1;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('+=');
    });

    it('should parse -=', () => {
      const program = parse('x -= 1;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('-=');
    });

    it('should parse *=', () => {
      const program = parse('x *= 1;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('*=');
    });
  });

  describe('Update expressions', () => {
    it('should parse prefix ++', () => {
      const program = parse('++x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string; prefix: boolean };
      };
      expect(stmt.expression.type).toBe('UpdateExpression');
      expect(stmt.expression.operator).toBe('++');
      expect(stmt.expression.prefix).toBe(true);
    });

    it('should parse postfix ++', () => {
      const program = parse('x++;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string; prefix: boolean };
      };
      expect(stmt.expression.type).toBe('UpdateExpression');
      expect(stmt.expression.operator).toBe('++');
      expect(stmt.expression.prefix).toBe(false);
    });

    it('should parse prefix --', () => {
      const program = parse('--x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string; prefix: boolean };
      };
      expect(stmt.expression.type).toBe('UpdateExpression');
      expect(stmt.expression.operator).toBe('--');
      expect(stmt.expression.prefix).toBe(true);
    });

    it('should parse postfix --', () => {
      const program = parse('x--;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string; prefix: boolean };
      };
      expect(stmt.expression.type).toBe('UpdateExpression');
      expect(stmt.expression.operator).toBe('--');
      expect(stmt.expression.prefix).toBe(false);
    });
  });

  describe('Conditional expression', () => {
    it('should parse ternary', () => {
      const program = parse('x ? y : z;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          test: { name: string };
          consequent: { name: string };
          alternate: { name: string };
        };
      };
      expect(stmt.expression.type).toBe('ConditionalExpression');
      expect(stmt.expression.test.name).toBe('x');
      expect(stmt.expression.consequent.name).toBe('y');
      expect(stmt.expression.alternate.name).toBe('z');
    });
  });

  describe('Logical expressions', () => {
    it('should parse ||', () => {
      const program = parse('x || y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.type).toBe('LogicalExpression');
      expect(stmt.expression.operator).toBe('||');
    });

    it('should parse &&', () => {
      const program = parse('x && y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.type).toBe('LogicalExpression');
      expect(stmt.expression.operator).toBe('&&');
    });

    it('should parse ??', () => {
      const program = parse('x ?? y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.type).toBe('LogicalExpression');
      expect(stmt.expression.operator).toBe('??');
    });
  });

  describe('Array and object expressions', () => {
    it('should parse empty array', () => {
      const program = parse('[];');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; elements: unknown[] };
      };
      expect(stmt.expression.type).toBe('ArrayExpression');
      expect(stmt.expression.elements.length).toBe(0);
    });

    it('should parse array with elements', () => {
      const program = parse('[1, 2, 3];');
      const stmt = program.body[0] as {
        type: string;
        expression: { elements: unknown[] };
      };
      expect(stmt.expression.elements.length).toBe(3);
    });

    it('should parse array with holes', () => {
      const program = parse('[,1,,2,];');
      const stmt = program.body[0] as {
        type: string;
        expression: { elements: Array<unknown | null> };
      };
      expect(stmt.expression.elements[0]).toBeNull();
      expect(stmt.expression.elements[2]).toBeNull();
    });

    it('should parse array with spread', () => {
      const program = parse('[...x];');
      const stmt = program.body[0] as {
        type: string;
        expression: { elements: Array<{ type: string }> };
      };
      expect(stmt.expression.elements[0].type).toBe('SpreadElement');
    });

    it('should parse empty object', () => {
      const program = parse('({});');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; properties: unknown[] };
      };
      expect(stmt.expression.type).toBe('ObjectExpression');
      expect(stmt.expression.properties.length).toBe(0);
    });

    it('should parse object with properties', () => {
      const program = parse('({a: 1, b: 2});');
      const stmt = program.body[0] as {
        type: string;
        expression: { properties: Array<{ type: string; key: { name: string } }> };
      };
      expect(stmt.expression.properties.length).toBe(2);
    });

    it('should parse object with shorthand', () => {
      const program = parse('({x});');
      const stmt = program.body[0] as {
        type: string;
        expression: { properties: Array<{ shorthand: boolean }> };
      };
      expect(stmt.expression.properties[0].shorthand).toBe(true);
    });

    it('should parse object with spread', () => {
      const program = parse('({...x});');
      const stmt = program.body[0] as {
        type: string;
        expression: { properties: Array<{ type: string }> };
      };
      expect(stmt.expression.properties[0].type).toBe('SpreadElement');
    });

    it('should parse object with trailing comma', () => {
      const program = parse('({a: 1,});');
      const stmt = program.body[0] as {
        type: string;
        expression: { properties: unknown[] };
      };
      expect(stmt.expression.properties.length).toBe(1);
    });
  });

  describe('Binding pattern errors', () => {
    it('should throw on invalid binding in variable declaration', () => {
      expect(() => parse('const 123 = 1;')).toThrow(/binding pattern/);
    });
  });

  describe('New expression', () => {
    it('should parse new without arguments', () => {
      const program = parse('new Foo;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; arguments: unknown[] };
      };
      expect(stmt.expression.type).toBe('NewExpression');
      expect(stmt.expression.arguments.length).toBe(0);
    });

    it('should parse new with arguments', () => {
      const program = parse('new Foo(1, 2);');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; arguments: unknown[] };
      };
      expect(stmt.expression.type).toBe('NewExpression');
      expect(stmt.expression.arguments.length).toBe(2);
    });
  });

  describe('Call expression with spread', () => {
    it('should parse spread in function call', () => {
      const program = parse('foo(...x);');
      const stmt = program.body[0] as {
        type: string;
        expression: { arguments: Array<{ type: string }> };
      };
      expect(stmt.expression.arguments[0].type).toBe('SpreadElement');
    });
  });

  describe('typeof and void and delete', () => {
    it('should parse typeof', () => {
      const program = parse('typeof x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.type).toBe('UnaryExpression');
      expect(stmt.expression.operator).toBe('typeof');
    });

    it('should parse void', () => {
      const program = parse('void 0;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.operator).toBe('void');
    });

    it('should parse delete', () => {
      const program = parse('delete x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; operator: string };
      };
      expect(stmt.expression.operator).toBe('delete');
    });

    it('should parse ~ (bitwise not)', () => {
      const program = parse('~x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('~');
    });

    it('should parse unary +', () => {
      const program = parse('+x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('+');
    });

    it('should parse unary -', () => {
      const program = parse('-x;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('-');
    });
  });

  describe('Binary operators', () => {
    it('should parse -', () => {
      const program = parse('x - y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('-');
    });

    it('should parse *', () => {
      const program = parse('x * y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('*');
    });

    it('should parse /', () => {
      const program = parse('x / y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('/');
    });

    it('should parse %', () => {
      const program = parse('x % y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('%');
    });

    it('should parse **', () => {
      const program = parse('x ** y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('**');
    });

    it('should parse &', () => {
      const program = parse('x & y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('&');
    });

    it('should parse |', () => {
      const program = parse('x | y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('|');
    });

    it('should parse ^', () => {
      const program = parse('x ^ y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('^');
    });

    it('should parse <<', () => {
      const program = parse('x << y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('<<');
    });

    it('should parse >>', () => {
      const program = parse('x >> y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('>>');
    });

    it('should parse >>>', () => {
      const program = parse('x >>> y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('>>>');
    });

    it('should parse ==', () => {
      const program = parse('x == y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('==');
    });

    it('should parse !=', () => {
      const program = parse('x != y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('!=');
    });

    it('should parse ===', () => {
      const program = parse('x === y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('===');
    });

    it('should parse !==', () => {
      const program = parse('x !== y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('!==');
    });

    it('should parse <', () => {
      const program = parse('x < y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('<');
    });

    it('should parse >', () => {
      const program = parse('x > y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('>');
    });

    it('should parse <=', () => {
      const program = parse('x <= y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('<=');
    });

    it('should parse >=', () => {
      const program = parse('x >= y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('>=');
    });

    it('should parse instanceof', () => {
      const program = parse('x instanceof y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('instanceof');
    });

    it('should parse in', () => {
      const program = parse('x in y;');
      const stmt = program.body[0] as {
        type: string;
        expression: { operator: string };
      };
      expect(stmt.expression.operator).toBe('in');
    });

    it('should respect operator precedence (* before +)', () => {
      const program = parse('a + b * c;');
      const stmt = program.body[0] as {
        type: string;
        expression: {
          type: string;
          operator: string;
          left: { name: string };
          right: { operator: string };
        };
      };
      // a + (b * c)
      expect(stmt.expression.operator).toBe('+');
      expect(stmt.expression.right.operator).toBe('*');
    });
  });

  describe('Contextual keywords as identifiers', () => {
    it('should parse let as variable declaration keyword', () => {
      const program = parse('let x = 1;');
      const stmt = program.body[0] as {
        type: string;
        kind: string;
      };
      expect(stmt.type).toBe('VariableDeclaration');
      expect(stmt.kind).toBe('let');
    });

    it('should parse of as identifier', () => {
      const program = parse('of;');
      const stmt = program.body[0] as {
        type: string;
        expression: { type: string; name: string };
      };
      expect(stmt.expression.name).toBe('of');
    });

    it('should parse async as identifier', () => {
      const program = parse('async;');
      const stmt = program.body[0] as {
        type: string;
        expression: { name: string };
      };
      expect(stmt.expression.name).toBe('async');
    });
  });
});
