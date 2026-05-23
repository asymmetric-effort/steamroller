/**
 * @module tests/unit/ast/types
 * @description Tests for ESTree-compatible AST type definitions.
 *
 * Since these are purely type-level definitions with no runtime behavior,
 * we verify that all interfaces compile correctly by constructing sample
 * objects, testing discriminated union narrowing, and confirming that the
 * RollupAstNode wrapper and union types accept all expected members.
 */
import { describe, it, expect } from 'vitest';
import type {
  BaseNode,
  SourcePosition,
  SourceLocation,
  Comment,
  Program,
  ExpressionStatement,
  BlockStatement,
  EmptyStatement,
  DebuggerStatement,
  ReturnStatement,
  LabeledStatement,
  BreakStatement,
  ContinueStatement,
  IfStatement,
  SwitchStatement,
  SwitchCase,
  ThrowStatement,
  TryStatement,
  CatchClause,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  ForInStatement,
  ForOfStatement,
  WithStatement,
  VariableDeclaration,
  VariableDeclarator,
  FunctionDeclaration,
  ClassDeclaration,
  ClassBody,
  MethodDefinition,
  PropertyDefinition,
  StaticBlock,
  Identifier,
  Literal,
  RegExpValue,
  TemplateLiteral,
  TemplateElement,
  TaggedTemplateExpression,
  ThisExpression,
  ArrayExpression,
  ObjectExpression,
  Property,
  SpreadElement,
  FunctionExpression,
  ArrowFunctionExpression,
  ClassExpression,
  SequenceExpression,
  UnaryExpression,
  BinaryExpression,
  LogicalExpression,
  AssignmentExpression,
  UpdateExpression,
  ConditionalExpression,
  CallExpression,
  NewExpression,
  MemberExpression,
  ChainExpression,
  YieldExpression,
  AwaitExpression,
  MetaProperty,
  ImportExpression,
  Super,
  ObjectPattern,
  ArrayPattern,
  RestElement,
  AssignmentPattern,
  ImportDeclaration,
  ImportSpecifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
  ExportAllDeclaration,
  ExportSpecifier,
  JSXElement,
  JSXOpeningElement,
  JSXClosingElement,
  JSXFragment,
  JSXOpeningFragment,
  JSXClosingFragment,
  JSXAttribute,
  JSXSpreadAttribute,
  JSXExpressionContainer,
  JSXEmptyExpression,
  JSXText,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  RollupAstNode,
  ProgramNode,
  Statement,
  Declaration,
  Expression,
  Pattern,
  ModuleDeclaration,
  JSXNode,
  AstNode,
  UnaryOperator,
  BinaryOperator,
  LogicalOperator,
  AssignmentOperator,
  UpdateOperator,
} from '../../../src/ast/types.js';

// ============================================================
// Helper: base node properties shared by every node
// ============================================================

const BASE = { start: 0, end: 10 } as const;

/** Create a minimal Identifier node. */
const id = (name: string): Identifier => ({
  type: 'Identifier' as const,
  name,
  ...BASE,
});

/** Create a minimal Literal node. */
const lit = (value: string | number | boolean | null): Literal => ({
  type: 'Literal' as const,
  value,
  ...BASE,
});

/** Create a minimal BlockStatement node. */
const block = (body: ReadonlyArray<Statement> = []): BlockStatement => ({
  type: 'BlockStatement' as const,
  body,
  ...BASE,
});

/** Create a minimal FunctionExpression node. */
const funcExpr = (): FunctionExpression => ({
  type: 'FunctionExpression' as const,
  id: null,
  params: [],
  body: block(),
  generator: false,
  async: false,
  ...BASE,
});

/** Create a minimal ClassBody node. */
const classBody = (): ClassBody => ({
  type: 'ClassBody' as const,
  body: [],
  ...BASE,
});

// ============================================================
// Tests
// ============================================================

describe('ESTree AST type definitions', () => {
  // ----------------------------------------------------------
  // Source Location
  // ----------------------------------------------------------

  describe('SourceLocation', () => {
    it('should compile a valid SourcePosition', () => {
      const pos: SourcePosition = { line: 1, column: 0 };
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(0);
    });

    it('should compile a valid SourceLocation', () => {
      const loc: SourceLocation = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 5 },
        source: 'test.js',
      };
      expect(loc.start.line).toBe(1);
      expect(loc.end.column).toBe(5);
      expect(loc.source).toBe('test.js');
    });

    it('should allow null source in SourceLocation', () => {
      const loc: SourceLocation = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 5 },
        source: null,
      };
      expect(loc.source).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // BaseNode & Comment
  // ----------------------------------------------------------

  describe('BaseNode', () => {
    it('should enforce type, start, and end properties', () => {
      const node: BaseNode = { type: 'Test', ...BASE };
      expect(node.type).toBe('Test');
      expect(node.start).toBe(0);
      expect(node.end).toBe(10);
    });

    it('should allow optional loc, leadingComments, trailingComments', () => {
      const comment: Comment = {
        type: 'Line',
        value: ' hello',
        ...BASE,
      };
      const node: BaseNode = {
        type: 'Test',
        ...BASE,
        loc: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 10 },
        },
        leadingComments: [comment],
        trailingComments: [],
      };
      expect(node.loc).toBeDefined();
      expect(node.leadingComments).toHaveLength(1);
      expect(node.trailingComments).toHaveLength(0);
    });
  });

  describe('Comment', () => {
    it('should support Line comments', () => {
      const c: Comment = { type: 'Line', value: ' a line comment', ...BASE };
      expect(c.type).toBe('Line');
      expect(c.value).toBe(' a line comment');
    });

    it('should support Block comments', () => {
      const c: Comment = { type: 'Block', value: ' a block comment ', ...BASE };
      expect(c.type).toBe('Block');
    });
  });

  // ----------------------------------------------------------
  // Program
  // ----------------------------------------------------------

  describe('Program', () => {
    it('should compile a module Program', () => {
      const prog: Program = {
        type: 'Program',
        body: [],
        sourceType: 'module',
        ...BASE,
      };
      expect(prog.type).toBe('Program');
      expect(prog.sourceType).toBe('module');
      expect(prog.body).toHaveLength(0);
    });

    it('should compile a script Program', () => {
      const prog: Program = {
        type: 'Program',
        body: [],
        sourceType: 'script',
        ...BASE,
      };
      expect(prog.sourceType).toBe('script');
    });

    it('should accept statements and module declarations in body', () => {
      const stmt: ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: id('x'),
        ...BASE,
      };
      const imp: ImportDeclaration = {
        type: 'ImportDeclaration',
        specifiers: [],
        source: lit('mod') as Literal,
        ...BASE,
      };
      const prog: Program = {
        type: 'Program',
        body: [stmt, imp],
        sourceType: 'module',
        ...BASE,
      };
      expect(prog.body).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------
  // Statements
  // ----------------------------------------------------------

  describe('Statements', () => {
    it('should compile ExpressionStatement', () => {
      const node: ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: id('x'),
        ...BASE,
      };
      expect(node.type).toBe('ExpressionStatement');
    });

    it('should compile ExpressionStatement with directive', () => {
      const node: ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: lit('use strict'),
        directive: 'use strict',
        ...BASE,
      };
      expect(node.directive).toBe('use strict');
    });

    it('should compile BlockStatement', () => {
      const node: BlockStatement = block();
      expect(node.type).toBe('BlockStatement');
      expect(node.body).toHaveLength(0);
    });

    it('should compile EmptyStatement', () => {
      const node: EmptyStatement = { type: 'EmptyStatement', ...BASE };
      expect(node.type).toBe('EmptyStatement');
    });

    it('should compile DebuggerStatement', () => {
      const node: DebuggerStatement = { type: 'DebuggerStatement', ...BASE };
      expect(node.type).toBe('DebuggerStatement');
    });

    it('should compile ReturnStatement with argument', () => {
      const node: ReturnStatement = {
        type: 'ReturnStatement',
        argument: id('x'),
        ...BASE,
      };
      expect(node.argument).not.toBeNull();
    });

    it('should compile ReturnStatement without argument', () => {
      const node: ReturnStatement = {
        type: 'ReturnStatement',
        argument: null,
        ...BASE,
      };
      expect(node.argument).toBeNull();
    });

    it('should compile LabeledStatement', () => {
      const node: LabeledStatement = {
        type: 'LabeledStatement',
        label: id('loop'),
        body: { type: 'EmptyStatement', ...BASE },
        ...BASE,
      };
      expect(node.label.name).toBe('loop');
    });

    it('should compile BreakStatement', () => {
      const node: BreakStatement = {
        type: 'BreakStatement',
        label: null,
        ...BASE,
      };
      expect(node.label).toBeNull();
    });

    it('should compile BreakStatement with label', () => {
      const node: BreakStatement = {
        type: 'BreakStatement',
        label: id('outer'),
        ...BASE,
      };
      expect(node.label?.name).toBe('outer');
    });

    it('should compile ContinueStatement', () => {
      const node: ContinueStatement = {
        type: 'ContinueStatement',
        label: null,
        ...BASE,
      };
      expect(node.type).toBe('ContinueStatement');
    });

    it('should compile IfStatement', () => {
      const node: IfStatement = {
        type: 'IfStatement',
        test: id('cond'),
        consequent: block(),
        alternate: null,
        ...BASE,
      };
      expect(node.alternate).toBeNull();
    });

    it('should compile IfStatement with else branch', () => {
      const node: IfStatement = {
        type: 'IfStatement',
        test: id('cond'),
        consequent: block(),
        alternate: block(),
        ...BASE,
      };
      expect(node.alternate).not.toBeNull();
    });

    it('should compile SwitchStatement and SwitchCase', () => {
      const caseNode: SwitchCase = {
        type: 'SwitchCase',
        test: lit(1),
        consequent: [],
        ...BASE,
      };
      const defaultCase: SwitchCase = {
        type: 'SwitchCase',
        test: null,
        consequent: [],
        ...BASE,
      };
      const node: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: id('x'),
        cases: [caseNode, defaultCase],
        ...BASE,
      };
      expect(node.cases).toHaveLength(2);
      expect(node.cases[0].test).not.toBeNull();
      expect(node.cases[1].test).toBeNull();
    });

    it('should compile ThrowStatement', () => {
      const node: ThrowStatement = {
        type: 'ThrowStatement',
        argument: id('err'),
        ...BASE,
      };
      expect(node.argument.type).toBe('Identifier');
    });

    it('should compile TryStatement and CatchClause', () => {
      const catchClause: CatchClause = {
        type: 'CatchClause',
        param: id('e'),
        body: block(),
        ...BASE,
      };
      const node: TryStatement = {
        type: 'TryStatement',
        block: block(),
        handler: catchClause,
        finalizer: block(),
        ...BASE,
      };
      expect(node.handler?.param).not.toBeNull();
    });

    it('should compile TryStatement without handler', () => {
      const node: TryStatement = {
        type: 'TryStatement',
        block: block(),
        handler: null,
        finalizer: block(),
        ...BASE,
      };
      expect(node.handler).toBeNull();
    });

    it('should compile CatchClause without param', () => {
      const catchClause: CatchClause = {
        type: 'CatchClause',
        param: null,
        body: block(),
        ...BASE,
      };
      expect(catchClause.param).toBeNull();
    });

    it('should compile WhileStatement', () => {
      const node: WhileStatement = {
        type: 'WhileStatement',
        test: lit(true),
        body: block(),
        ...BASE,
      };
      expect(node.type).toBe('WhileStatement');
    });

    it('should compile DoWhileStatement', () => {
      const node: DoWhileStatement = {
        type: 'DoWhileStatement',
        body: block(),
        test: lit(true),
        ...BASE,
      };
      expect(node.type).toBe('DoWhileStatement');
    });

    it('should compile ForStatement', () => {
      const node: ForStatement = {
        type: 'ForStatement',
        init: null,
        test: null,
        update: null,
        body: block(),
        ...BASE,
      };
      expect(node.init).toBeNull();
    });

    it('should compile ForStatement with init expression', () => {
      const node: ForStatement = {
        type: 'ForStatement',
        init: id('i'),
        test: lit(true),
        update: id('i'),
        body: block(),
        ...BASE,
      };
      expect(node.init).not.toBeNull();
    });

    it('should compile ForStatement with VariableDeclaration init', () => {
      const decl: VariableDeclaration = {
        type: 'VariableDeclaration',
        declarations: [
          { type: 'VariableDeclarator', id: id('i'), init: lit(0), ...BASE },
        ],
        kind: 'let',
        ...BASE,
      };
      const node: ForStatement = {
        type: 'ForStatement',
        init: decl,
        test: null,
        update: null,
        body: block(),
        ...BASE,
      };
      expect(node.init?.type).toBe('VariableDeclaration');
    });

    it('should compile ForInStatement', () => {
      const node: ForInStatement = {
        type: 'ForInStatement',
        left: id('key'),
        right: id('obj'),
        body: block(),
        ...BASE,
      };
      expect(node.type).toBe('ForInStatement');
    });

    it('should compile ForOfStatement', () => {
      const node: ForOfStatement = {
        type: 'ForOfStatement',
        left: id('item'),
        right: id('arr'),
        body: block(),
        await: false,
        ...BASE,
      };
      expect(node.await).toBe(false);
    });

    it('should compile ForOfStatement with await', () => {
      const node: ForOfStatement = {
        type: 'ForOfStatement',
        left: id('item'),
        right: id('iterable'),
        body: block(),
        await: true,
        ...BASE,
      };
      expect(node.await).toBe(true);
    });

    it('should compile WithStatement', () => {
      const node: WithStatement = {
        type: 'WithStatement',
        object: id('obj'),
        body: block(),
        ...BASE,
      };
      expect(node.type).toBe('WithStatement');
    });
  });

  // ----------------------------------------------------------
  // Declarations
  // ----------------------------------------------------------

  describe('Declarations', () => {
    it('should compile VariableDeclaration with const', () => {
      const node: VariableDeclaration = {
        type: 'VariableDeclaration',
        declarations: [
          { type: 'VariableDeclarator', id: id('x'), init: lit(42), ...BASE },
        ],
        kind: 'const',
        ...BASE,
      };
      expect(node.kind).toBe('const');
    });

    it('should compile VariableDeclaration with var and let kinds', () => {
      const varDecl: VariableDeclaration = {
        type: 'VariableDeclaration',
        declarations: [],
        kind: 'var',
        ...BASE,
      };
      const letDecl: VariableDeclaration = {
        type: 'VariableDeclaration',
        declarations: [],
        kind: 'let',
        ...BASE,
      };
      expect(varDecl.kind).toBe('var');
      expect(letDecl.kind).toBe('let');
    });

    it('should compile VariableDeclarator without init', () => {
      const node: VariableDeclarator = {
        type: 'VariableDeclarator',
        id: id('x'),
        init: null,
        ...BASE,
      };
      expect(node.init).toBeNull();
    });

    it('should compile FunctionDeclaration', () => {
      const node: FunctionDeclaration = {
        type: 'FunctionDeclaration',
        id: id('foo'),
        params: [id('a'), id('b')],
        body: block(),
        generator: false,
        async: false,
        ...BASE,
      };
      expect(node.params).toHaveLength(2);
    });

    it('should compile async generator FunctionDeclaration', () => {
      const node: FunctionDeclaration = {
        type: 'FunctionDeclaration',
        id: id('gen'),
        params: [],
        body: block(),
        generator: true,
        async: true,
        ...BASE,
      };
      expect(node.generator).toBe(true);
      expect(node.async).toBe(true);
    });

    it('should compile FunctionDeclaration with null id (export default)', () => {
      const node: FunctionDeclaration = {
        type: 'FunctionDeclaration',
        id: null,
        params: [],
        body: block(),
        generator: false,
        async: false,
        ...BASE,
      };
      expect(node.id).toBeNull();
    });

    it('should compile ClassDeclaration', () => {
      const node: ClassDeclaration = {
        type: 'ClassDeclaration',
        id: id('Foo'),
        superClass: null,
        body: classBody(),
        ...BASE,
      };
      expect(node.type).toBe('ClassDeclaration');
      expect(node.superClass).toBeNull();
    });

    it('should compile ClassDeclaration with superClass', () => {
      const node: ClassDeclaration = {
        type: 'ClassDeclaration',
        id: id('Bar'),
        superClass: id('Foo'),
        body: classBody(),
        ...BASE,
      };
      expect(node.superClass).not.toBeNull();
    });

    it('should compile ClassBody with MethodDefinition', () => {
      const method: MethodDefinition = {
        type: 'MethodDefinition',
        key: id('greet'),
        value: funcExpr(),
        kind: 'method',
        computed: false,
        static: false,
        ...BASE,
      };
      const body: ClassBody = {
        type: 'ClassBody',
        body: [method],
        ...BASE,
      };
      expect(body.body).toHaveLength(1);
    });

    it('should compile MethodDefinition kinds', () => {
      const kinds: ReadonlyArray<'constructor' | 'method' | 'get' | 'set'> = [
        'constructor',
        'method',
        'get',
        'set',
      ];
      const methods = kinds.map(
        (kind): MethodDefinition => ({
          type: 'MethodDefinition',
          key: id('m'),
          value: funcExpr(),
          kind,
          computed: false,
          static: false,
          ...BASE,
        }),
      );
      expect(methods).toHaveLength(4);
      expect(methods[0].kind).toBe('constructor');
      expect(methods[3].kind).toBe('set');
    });

    it('should compile PropertyDefinition', () => {
      const node: PropertyDefinition = {
        type: 'PropertyDefinition',
        key: id('count'),
        value: lit(0),
        computed: false,
        static: false,
        ...BASE,
      };
      expect(node.type).toBe('PropertyDefinition');
    });

    it('should compile PropertyDefinition without value', () => {
      const node: PropertyDefinition = {
        type: 'PropertyDefinition',
        key: id('name'),
        value: null,
        computed: false,
        static: true,
        ...BASE,
      };
      expect(node.value).toBeNull();
      expect(node.static).toBe(true);
    });

    it('should compile StaticBlock', () => {
      const node: StaticBlock = {
        type: 'StaticBlock',
        body: [],
        ...BASE,
      };
      expect(node.type).toBe('StaticBlock');
    });
  });

  // ----------------------------------------------------------
  // Expressions
  // ----------------------------------------------------------

  describe('Expressions', () => {
    it('should compile Identifier', () => {
      const node = id('myVar');
      expect(node.name).toBe('myVar');
    });

    it('should compile Literal with string value', () => {
      const node = lit('hello');
      expect(node.value).toBe('hello');
    });

    it('should compile Literal with number value', () => {
      const node = lit(42);
      expect(node.value).toBe(42);
    });

    it('should compile Literal with boolean value', () => {
      const node = lit(true);
      expect(node.value).toBe(true);
    });

    it('should compile Literal with null value', () => {
      const node = lit(null);
      expect(node.value).toBeNull();
    });

    it('should compile Literal with regex', () => {
      const regexVal: RegExpValue = { pattern: 'abc', flags: 'gi' };
      const node: Literal = {
        type: 'Literal',
        value: null,
        raw: '/abc/gi',
        regex: regexVal,
        ...BASE,
      };
      expect(node.regex?.pattern).toBe('abc');
      expect(node.regex?.flags).toBe('gi');
    });

    it('should compile Literal with bigint', () => {
      const node: Literal = {
        type: 'Literal',
        value: BigInt(100),
        raw: '100n',
        bigint: '100',
        ...BASE,
      };
      expect(node.bigint).toBe('100');
    });

    it('should compile TemplateLiteral', () => {
      const elem: TemplateElement = {
        type: 'TemplateElement',
        tail: true,
        value: { raw: 'hello ', cooked: 'hello ' },
        ...BASE,
      };
      const node: TemplateLiteral = {
        type: 'TemplateLiteral',
        quasis: [elem],
        expressions: [],
        ...BASE,
      };
      expect(node.quasis).toHaveLength(1);
      expect(node.quasis[0].value.raw).toBe('hello ');
    });

    it('should compile TemplateElement with null cooked', () => {
      const elem: TemplateElement = {
        type: 'TemplateElement',
        tail: false,
        value: { raw: '\\unicode', cooked: null },
        ...BASE,
      };
      expect(elem.value.cooked).toBeNull();
    });

    it('should compile TaggedTemplateExpression', () => {
      const node: TaggedTemplateExpression = {
        type: 'TaggedTemplateExpression',
        tag: id('html'),
        quasi: {
          type: 'TemplateLiteral',
          quasis: [
            {
              type: 'TemplateElement',
              tail: true,
              value: { raw: 'test', cooked: 'test' },
              ...BASE,
            },
          ],
          expressions: [],
          ...BASE,
        },
        ...BASE,
      };
      expect(node.tag.type).toBe('Identifier');
    });

    it('should compile ThisExpression', () => {
      const node: ThisExpression = { type: 'ThisExpression', ...BASE };
      expect(node.type).toBe('ThisExpression');
    });

    it('should compile ArrayExpression', () => {
      const node: ArrayExpression = {
        type: 'ArrayExpression',
        elements: [lit(1), null, lit(3)],
        ...BASE,
      };
      expect(node.elements).toHaveLength(3);
      expect(node.elements[1]).toBeNull();
    });

    it('should compile ObjectExpression', () => {
      const prop: Property = {
        type: 'Property',
        key: id('a'),
        value: lit(1),
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
        ...BASE,
      };
      const node: ObjectExpression = {
        type: 'ObjectExpression',
        properties: [prop],
        ...BASE,
      };
      expect(node.properties).toHaveLength(1);
    });

    it('should compile Property with get/set kinds', () => {
      const getter: Property = {
        type: 'Property',
        key: id('x'),
        value: funcExpr(),
        kind: 'get',
        method: false,
        shorthand: false,
        computed: false,
        ...BASE,
      };
      const setter: Property = {
        type: 'Property',
        key: id('x'),
        value: funcExpr(),
        kind: 'set',
        method: false,
        shorthand: false,
        computed: false,
        ...BASE,
      };
      expect(getter.kind).toBe('get');
      expect(setter.kind).toBe('set');
    });

    it('should compile Property with shorthand and method', () => {
      const shorthand: Property = {
        type: 'Property',
        key: id('x'),
        value: id('x'),
        kind: 'init',
        method: false,
        shorthand: true,
        computed: false,
        ...BASE,
      };
      const method: Property = {
        type: 'Property',
        key: id('fn'),
        value: funcExpr(),
        kind: 'init',
        method: true,
        shorthand: false,
        computed: false,
        ...BASE,
      };
      expect(shorthand.shorthand).toBe(true);
      expect(method.method).toBe(true);
    });

    it('should compile SpreadElement', () => {
      const node: SpreadElement = {
        type: 'SpreadElement',
        argument: id('arr'),
        ...BASE,
      };
      expect(node.type).toBe('SpreadElement');
    });

    it('should compile FunctionExpression', () => {
      const node = funcExpr();
      expect(node.type).toBe('FunctionExpression');
      expect(node.generator).toBe(false);
    });

    it('should compile FunctionExpression with id', () => {
      const node: FunctionExpression = {
        type: 'FunctionExpression',
        id: id('namedFn'),
        params: [],
        body: block(),
        generator: true,
        async: true,
        ...BASE,
      };
      expect(node.id?.name).toBe('namedFn');
    });

    it('should compile ArrowFunctionExpression with expression body', () => {
      const node: ArrowFunctionExpression = {
        type: 'ArrowFunctionExpression',
        id: null,
        params: [id('x')],
        body: id('x'),
        expression: true,
        generator: false,
        async: false,
        ...BASE,
      };
      expect(node.expression).toBe(true);
    });

    it('should compile ArrowFunctionExpression with block body', () => {
      const node: ArrowFunctionExpression = {
        type: 'ArrowFunctionExpression',
        id: null,
        params: [],
        body: block(),
        expression: false,
        generator: false,
        async: true,
        ...BASE,
      };
      expect(node.async).toBe(true);
      expect(node.expression).toBe(false);
    });

    it('should compile ClassExpression', () => {
      const node: ClassExpression = {
        type: 'ClassExpression',
        id: null,
        superClass: null,
        body: classBody(),
        ...BASE,
      };
      expect(node.type).toBe('ClassExpression');
    });

    it('should compile SequenceExpression', () => {
      const node: SequenceExpression = {
        type: 'SequenceExpression',
        expressions: [lit(1), lit(2)],
        ...BASE,
      };
      expect(node.expressions).toHaveLength(2);
    });

    it('should compile UnaryExpression with all operators', () => {
      const operators: ReadonlyArray<UnaryOperator> = [
        '-', '+', '!', '~', 'typeof', 'void', 'delete',
      ];
      const nodes = operators.map(
        (op): UnaryExpression => ({
          type: 'UnaryExpression',
          operator: op,
          prefix: true,
          argument: id('x'),
          ...BASE,
        }),
      );
      expect(nodes).toHaveLength(7);
      expect(nodes[0].operator).toBe('-');
      expect(nodes[6].operator).toBe('delete');
    });

    it('should compile BinaryExpression with representative operators', () => {
      const operators: ReadonlyArray<BinaryOperator> = [
        '==', '!=', '===', '!==', '<', '<=', '>', '>=',
        '<<', '>>', '>>>', '+', '-', '*', '/', '%', '**',
        '|', '^', '&', 'in', 'instanceof',
      ];
      const nodes = operators.map(
        (op): BinaryExpression => ({
          type: 'BinaryExpression',
          operator: op,
          left: id('a'),
          right: id('b'),
          ...BASE,
        }),
      );
      expect(nodes).toHaveLength(22);
    });

    it('should compile LogicalExpression', () => {
      const operators: ReadonlyArray<LogicalOperator> = ['||', '&&', '??'];
      const nodes = operators.map(
        (op): LogicalExpression => ({
          type: 'LogicalExpression',
          operator: op,
          left: id('a'),
          right: id('b'),
          ...BASE,
        }),
      );
      expect(nodes).toHaveLength(3);
    });

    it('should compile AssignmentExpression with representative operators', () => {
      const operators: ReadonlyArray<AssignmentOperator> = [
        '=', '+=', '-=', '*=', '/=', '%=', '**=',
        '<<=', '>>=', '>>>=', '|=', '^=', '&=',
        '||=', '&&=', '??=',
      ];
      const nodes = operators.map(
        (op): AssignmentExpression => ({
          type: 'AssignmentExpression',
          operator: op,
          left: id('x'),
          right: lit(1),
          ...BASE,
        }),
      );
      expect(nodes).toHaveLength(16);
    });

    it('should compile UpdateExpression', () => {
      const operators: ReadonlyArray<UpdateOperator> = ['++', '--'];
      const prefix: UpdateExpression = {
        type: 'UpdateExpression',
        operator: operators[0],
        argument: id('i'),
        prefix: true,
        ...BASE,
      };
      const postfix: UpdateExpression = {
        type: 'UpdateExpression',
        operator: operators[1],
        argument: id('i'),
        prefix: false,
        ...BASE,
      };
      expect(prefix.prefix).toBe(true);
      expect(postfix.prefix).toBe(false);
    });

    it('should compile ConditionalExpression', () => {
      const node: ConditionalExpression = {
        type: 'ConditionalExpression',
        test: id('cond'),
        consequent: lit(1),
        alternate: lit(2),
        ...BASE,
      };
      expect(node.type).toBe('ConditionalExpression');
    });

    it('should compile CallExpression', () => {
      const node: CallExpression = {
        type: 'CallExpression',
        callee: id('fn'),
        arguments: [lit(1), { type: 'SpreadElement', argument: id('args'), ...BASE }],
        optional: false,
        ...BASE,
      };
      expect(node.arguments).toHaveLength(2);
    });

    it('should compile CallExpression with optional chaining', () => {
      const node: CallExpression = {
        type: 'CallExpression',
        callee: id('fn'),
        arguments: [],
        optional: true,
        ...BASE,
      };
      expect(node.optional).toBe(true);
    });

    it('should compile CallExpression with Super callee', () => {
      const superNode: Super = { type: 'Super', ...BASE };
      const node: CallExpression = {
        type: 'CallExpression',
        callee: superNode,
        arguments: [],
        optional: false,
        ...BASE,
      };
      expect(node.callee.type).toBe('Super');
    });

    it('should compile NewExpression', () => {
      const node: NewExpression = {
        type: 'NewExpression',
        callee: id('Foo'),
        arguments: [lit(1)],
        ...BASE,
      };
      expect(node.type).toBe('NewExpression');
    });

    it('should compile MemberExpression', () => {
      const node: MemberExpression = {
        type: 'MemberExpression',
        object: id('obj'),
        property: id('prop'),
        computed: false,
        optional: false,
        ...BASE,
      };
      expect(node.computed).toBe(false);
    });

    it('should compile MemberExpression with computed property', () => {
      const node: MemberExpression = {
        type: 'MemberExpression',
        object: id('arr'),
        property: lit(0),
        computed: true,
        optional: false,
        ...BASE,
      };
      expect(node.computed).toBe(true);
    });

    it('should compile MemberExpression with Super object', () => {
      const node: MemberExpression = {
        type: 'MemberExpression',
        object: { type: 'Super', ...BASE },
        property: id('method'),
        computed: false,
        optional: false,
        ...BASE,
      };
      expect(node.object.type).toBe('Super');
    });

    it('should compile ChainExpression', () => {
      const call: CallExpression = {
        type: 'CallExpression',
        callee: id('fn'),
        arguments: [],
        optional: true,
        ...BASE,
      };
      const node: ChainExpression = {
        type: 'ChainExpression',
        expression: call,
        ...BASE,
      };
      expect(node.type).toBe('ChainExpression');
    });

    it('should compile ChainExpression with MemberExpression', () => {
      const member: MemberExpression = {
        type: 'MemberExpression',
        object: id('obj'),
        property: id('prop'),
        computed: false,
        optional: true,
        ...BASE,
      };
      const node: ChainExpression = {
        type: 'ChainExpression',
        expression: member,
        ...BASE,
      };
      expect(node.expression.type).toBe('MemberExpression');
    });

    it('should compile YieldExpression', () => {
      const node: YieldExpression = {
        type: 'YieldExpression',
        argument: lit(1),
        delegate: false,
        ...BASE,
      };
      expect(node.delegate).toBe(false);
    });

    it('should compile YieldExpression with delegate', () => {
      const node: YieldExpression = {
        type: 'YieldExpression',
        argument: id('gen'),
        delegate: true,
        ...BASE,
      };
      expect(node.delegate).toBe(true);
    });

    it('should compile YieldExpression without argument', () => {
      const node: YieldExpression = {
        type: 'YieldExpression',
        argument: null,
        delegate: false,
        ...BASE,
      };
      expect(node.argument).toBeNull();
    });

    it('should compile AwaitExpression', () => {
      const node: AwaitExpression = {
        type: 'AwaitExpression',
        argument: id('promise'),
        ...BASE,
      };
      expect(node.type).toBe('AwaitExpression');
    });

    it('should compile MetaProperty', () => {
      const node: MetaProperty = {
        type: 'MetaProperty',
        meta: id('new'),
        property: id('target'),
        ...BASE,
      };
      expect(node.meta.name).toBe('new');
      expect(node.property.name).toBe('target');
    });

    it('should compile ImportExpression', () => {
      const node: ImportExpression = {
        type: 'ImportExpression',
        source: lit('./module.js'),
        ...BASE,
      };
      expect(node.type).toBe('ImportExpression');
    });

    it('should compile Super', () => {
      const node: Super = { type: 'Super', ...BASE };
      expect(node.type).toBe('Super');
    });
  });

  // ----------------------------------------------------------
  // Patterns
  // ----------------------------------------------------------

  describe('Patterns', () => {
    it('should compile ObjectPattern', () => {
      const prop: Property = {
        type: 'Property',
        key: id('a'),
        value: id('a'),
        kind: 'init',
        method: false,
        shorthand: true,
        computed: false,
        ...BASE,
      };
      const node: ObjectPattern = {
        type: 'ObjectPattern',
        properties: [prop],
        ...BASE,
      };
      expect(node.properties).toHaveLength(1);
    });

    it('should compile ObjectPattern with RestElement', () => {
      const rest: RestElement = {
        type: 'RestElement',
        argument: id('rest'),
        ...BASE,
      };
      const node: ObjectPattern = {
        type: 'ObjectPattern',
        properties: [rest],
        ...BASE,
      };
      expect(node.properties[0].type).toBe('RestElement');
    });

    it('should compile ArrayPattern', () => {
      const node: ArrayPattern = {
        type: 'ArrayPattern',
        elements: [id('a'), null, id('c')],
        ...BASE,
      };
      expect(node.elements).toHaveLength(3);
      expect(node.elements[1]).toBeNull();
    });

    it('should compile RestElement', () => {
      const node: RestElement = {
        type: 'RestElement',
        argument: id('args'),
        ...BASE,
      };
      expect(node.type).toBe('RestElement');
    });

    it('should compile AssignmentPattern', () => {
      const node: AssignmentPattern = {
        type: 'AssignmentPattern',
        left: id('x'),
        right: lit(42),
        ...BASE,
      };
      expect(node.left.type).toBe('Identifier');
    });
  });

  // ----------------------------------------------------------
  // Module Declarations
  // ----------------------------------------------------------

  describe('Module Declarations', () => {
    it('should compile ImportDeclaration', () => {
      const node: ImportDeclaration = {
        type: 'ImportDeclaration',
        specifiers: [],
        source: lit('module'),
        ...BASE,
      };
      expect(node.type).toBe('ImportDeclaration');
    });

    it('should compile ImportSpecifier', () => {
      const node: ImportSpecifier = {
        type: 'ImportSpecifier',
        imported: id('foo'),
        local: id('foo'),
        ...BASE,
      };
      expect(node.imported.type).toBe('Identifier');
    });

    it('should compile ImportSpecifier with string imported', () => {
      const node: ImportSpecifier = {
        type: 'ImportSpecifier',
        imported: lit('foo') as Literal,
        local: id('foo'),
        ...BASE,
      };
      expect(node.imported.type).toBe('Literal');
    });

    it('should compile ImportDefaultSpecifier', () => {
      const node: ImportDefaultSpecifier = {
        type: 'ImportDefaultSpecifier',
        local: id('React'),
        ...BASE,
      };
      expect(node.local.name).toBe('React');
    });

    it('should compile ImportNamespaceSpecifier', () => {
      const node: ImportNamespaceSpecifier = {
        type: 'ImportNamespaceSpecifier',
        local: id('ns'),
        ...BASE,
      };
      expect(node.type).toBe('ImportNamespaceSpecifier');
    });

    it('should compile ImportDeclaration with all specifier types', () => {
      const node: ImportDeclaration = {
        type: 'ImportDeclaration',
        specifiers: [
          { type: 'ImportDefaultSpecifier', local: id('def'), ...BASE },
          { type: 'ImportSpecifier', imported: id('a'), local: id('a'), ...BASE },
          { type: 'ImportNamespaceSpecifier', local: id('ns'), ...BASE },
        ],
        source: lit('pkg'),
        ...BASE,
      };
      expect(node.specifiers).toHaveLength(3);
    });

    it('should compile ExportNamedDeclaration', () => {
      const node: ExportNamedDeclaration = {
        type: 'ExportNamedDeclaration',
        declaration: null,
        specifiers: [
          {
            type: 'ExportSpecifier',
            local: id('x'),
            exported: id('x'),
            ...BASE,
          },
        ],
        source: null,
        ...BASE,
      };
      expect(node.specifiers).toHaveLength(1);
    });

    it('should compile ExportNamedDeclaration with declaration', () => {
      const decl: VariableDeclaration = {
        type: 'VariableDeclaration',
        declarations: [
          { type: 'VariableDeclarator', id: id('x'), init: lit(1), ...BASE },
        ],
        kind: 'const',
        ...BASE,
      };
      const node: ExportNamedDeclaration = {
        type: 'ExportNamedDeclaration',
        declaration: decl,
        specifiers: [],
        source: null,
        ...BASE,
      };
      expect(node.declaration?.type).toBe('VariableDeclaration');
    });

    it('should compile ExportNamedDeclaration with source', () => {
      const node: ExportNamedDeclaration = {
        type: 'ExportNamedDeclaration',
        declaration: null,
        specifiers: [],
        source: lit('other') as Literal,
        ...BASE,
      };
      expect(node.source).not.toBeNull();
    });

    it('should compile ExportSpecifier with Literal local/exported', () => {
      const node: ExportSpecifier = {
        type: 'ExportSpecifier',
        local: lit('foo') as Literal,
        exported: lit('bar') as Literal,
        ...BASE,
      };
      expect(node.type).toBe('ExportSpecifier');
    });

    it('should compile ExportDefaultDeclaration with expression', () => {
      const node: ExportDefaultDeclaration = {
        type: 'ExportDefaultDeclaration',
        declaration: id('myVal'),
        ...BASE,
      };
      expect(node.type).toBe('ExportDefaultDeclaration');
    });

    it('should compile ExportDefaultDeclaration with declaration', () => {
      const fn: FunctionDeclaration = {
        type: 'FunctionDeclaration',
        id: null,
        params: [],
        body: block(),
        generator: false,
        async: false,
        ...BASE,
      };
      const node: ExportDefaultDeclaration = {
        type: 'ExportDefaultDeclaration',
        declaration: fn,
        ...BASE,
      };
      expect(node.declaration.type).toBe('FunctionDeclaration');
    });

    it('should compile ExportAllDeclaration', () => {
      const node: ExportAllDeclaration = {
        type: 'ExportAllDeclaration',
        source: lit('module'),
        exported: null,
        ...BASE,
      };
      expect(node.exported).toBeNull();
    });

    it('should compile ExportAllDeclaration with exported name', () => {
      const node: ExportAllDeclaration = {
        type: 'ExportAllDeclaration',
        source: lit('module'),
        exported: id('ns'),
        ...BASE,
      };
      expect(node.exported?.type).toBe('Identifier');
    });
  });

  // ----------------------------------------------------------
  // JSX
  // ----------------------------------------------------------

  describe('JSX', () => {
    it('should compile JSXIdentifier', () => {
      const node: JSXIdentifier = {
        type: 'JSXIdentifier',
        name: 'div',
        ...BASE,
      };
      expect(node.name).toBe('div');
    });

    it('should compile JSXNamespacedName', () => {
      const node: JSXNamespacedName = {
        type: 'JSXNamespacedName',
        namespace: { type: 'JSXIdentifier', name: 'xml', ...BASE },
        name: { type: 'JSXIdentifier', name: 'lang', ...BASE },
        ...BASE,
      };
      expect(node.namespace.name).toBe('xml');
    });

    it('should compile JSXMemberExpression', () => {
      const node: JSXMemberExpression = {
        type: 'JSXMemberExpression',
        object: { type: 'JSXIdentifier', name: 'Foo', ...BASE },
        property: { type: 'JSXIdentifier', name: 'Bar', ...BASE },
        ...BASE,
      };
      expect(node.object.name).toBe('Foo');
    });

    it('should compile nested JSXMemberExpression', () => {
      const inner: JSXMemberExpression = {
        type: 'JSXMemberExpression',
        object: { type: 'JSXIdentifier', name: 'A', ...BASE },
        property: { type: 'JSXIdentifier', name: 'B', ...BASE },
        ...BASE,
      };
      const node: JSXMemberExpression = {
        type: 'JSXMemberExpression',
        object: inner,
        property: { type: 'JSXIdentifier', name: 'C', ...BASE },
        ...BASE,
      };
      expect(node.object.type).toBe('JSXMemberExpression');
    });

    it('should compile JSXEmptyExpression', () => {
      const node: JSXEmptyExpression = { type: 'JSXEmptyExpression', ...BASE };
      expect(node.type).toBe('JSXEmptyExpression');
    });

    it('should compile JSXExpressionContainer', () => {
      const node: JSXExpressionContainer = {
        type: 'JSXExpressionContainer',
        expression: id('value'),
        ...BASE,
      };
      expect(node.expression.type).toBe('Identifier');
    });

    it('should compile JSXExpressionContainer with empty expression', () => {
      const node: JSXExpressionContainer = {
        type: 'JSXExpressionContainer',
        expression: { type: 'JSXEmptyExpression', ...BASE },
        ...BASE,
      };
      expect(node.expression.type).toBe('JSXEmptyExpression');
    });

    it('should compile JSXText', () => {
      const node: JSXText = {
        type: 'JSXText',
        value: 'Hello World',
        raw: 'Hello World',
        ...BASE,
      };
      expect(node.value).toBe('Hello World');
    });

    it('should compile JSXAttribute', () => {
      const node: JSXAttribute = {
        type: 'JSXAttribute',
        name: { type: 'JSXIdentifier', name: 'className', ...BASE },
        value: lit('container'),
        ...BASE,
      };
      expect(node.name.name).toBe('className');
    });

    it('should compile JSXAttribute with null value', () => {
      const node: JSXAttribute = {
        type: 'JSXAttribute',
        name: { type: 'JSXIdentifier', name: 'disabled', ...BASE },
        value: null,
        ...BASE,
      };
      expect(node.value).toBeNull();
    });

    it('should compile JSXAttribute with expression container value', () => {
      const node: JSXAttribute = {
        type: 'JSXAttribute',
        name: { type: 'JSXIdentifier', name: 'onClick', ...BASE },
        value: {
          type: 'JSXExpressionContainer',
          expression: id('handler'),
          ...BASE,
        },
        ...BASE,
      };
      expect(node.value?.type).toBe('JSXExpressionContainer');
    });

    it('should compile JSXSpreadAttribute', () => {
      const node: JSXSpreadAttribute = {
        type: 'JSXSpreadAttribute',
        argument: id('props'),
        ...BASE,
      };
      expect(node.type).toBe('JSXSpreadAttribute');
    });

    it('should compile JSXOpeningElement', () => {
      const node: JSXOpeningElement = {
        type: 'JSXOpeningElement',
        name: { type: 'JSXIdentifier', name: 'div', ...BASE },
        attributes: [],
        selfClosing: false,
        ...BASE,
      };
      expect(node.selfClosing).toBe(false);
    });

    it('should compile JSXOpeningElement with self-closing', () => {
      const node: JSXOpeningElement = {
        type: 'JSXOpeningElement',
        name: { type: 'JSXIdentifier', name: 'br', ...BASE },
        attributes: [],
        selfClosing: true,
        ...BASE,
      };
      expect(node.selfClosing).toBe(true);
    });

    it('should compile JSXClosingElement', () => {
      const node: JSXClosingElement = {
        type: 'JSXClosingElement',
        name: { type: 'JSXIdentifier', name: 'div', ...BASE },
        ...BASE,
      };
      expect(node.type).toBe('JSXClosingElement');
    });

    it('should compile JSXElement', () => {
      const text: JSXText = {
        type: 'JSXText',
        value: 'content',
        raw: 'content',
        ...BASE,
      };
      const node: JSXElement = {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'span', ...BASE },
          attributes: [],
          selfClosing: false,
          ...BASE,
        },
        closingElement: {
          type: 'JSXClosingElement',
          name: { type: 'JSXIdentifier', name: 'span', ...BASE },
          ...BASE,
        },
        children: [text],
        ...BASE,
      };
      expect(node.children).toHaveLength(1);
    });

    it('should compile self-closing JSXElement', () => {
      const node: JSXElement = {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'img', ...BASE },
          attributes: [],
          selfClosing: true,
          ...BASE,
        },
        closingElement: null,
        children: [],
        ...BASE,
      };
      expect(node.closingElement).toBeNull();
    });

    it('should compile JSXOpeningFragment and JSXClosingFragment', () => {
      const opening: JSXOpeningFragment = { type: 'JSXOpeningFragment', ...BASE };
      const closing: JSXClosingFragment = { type: 'JSXClosingFragment', ...BASE };
      expect(opening.type).toBe('JSXOpeningFragment');
      expect(closing.type).toBe('JSXClosingFragment');
    });

    it('should compile JSXFragment', () => {
      const node: JSXFragment = {
        type: 'JSXFragment',
        openingFragment: { type: 'JSXOpeningFragment', ...BASE },
        closingFragment: { type: 'JSXClosingFragment', ...BASE },
        children: [],
        ...BASE,
      };
      expect(node.type).toBe('JSXFragment');
    });

    it('should compile JSXFragment with mixed children', () => {
      const node: JSXFragment = {
        type: 'JSXFragment',
        openingFragment: { type: 'JSXOpeningFragment', ...BASE },
        closingFragment: { type: 'JSXClosingFragment', ...BASE },
        children: [
          { type: 'JSXText', value: 'text', raw: 'text', ...BASE },
          {
            type: 'JSXExpressionContainer',
            expression: id('x'),
            ...BASE,
          },
        ],
        ...BASE,
      };
      expect(node.children).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------
  // Rollup Wrapper Types
  // ----------------------------------------------------------

  describe('RollupAstNode', () => {
    it('should wrap a BaseNode and allow extra properties', () => {
      const node: RollupAstNode<Identifier> = {
        type: 'Identifier',
        name: 'x',
        ...BASE,
        customProp: 'extra',
      };
      expect(node.type).toBe('Identifier');
      expect(node.name).toBe('x');
      expect(node.customProp).toBe('extra');
    });

    it('should preserve all original properties', () => {
      const node: RollupAstNode<Literal> = {
        type: 'Literal',
        value: 42,
        raw: '42',
        ...BASE,
      };
      expect(node.value).toBe(42);
      expect(node.raw).toBe('42');
    });

    it('should allow indexing with string keys', () => {
      const node: RollupAstNode<Identifier> = {
        type: 'Identifier',
        name: 'y',
        ...BASE,
        meta: { resolved: true },
      };
      const key = 'meta';
      expect(node[key]).toEqual({ resolved: true });
    });
  });

  describe('ProgramNode', () => {
    it('should be a RollupAstNode<Program>', () => {
      const node: ProgramNode = {
        type: 'Program',
        body: [],
        sourceType: 'module',
        ...BASE,
        rollupMeta: 'test',
      };
      expect(node.type).toBe('Program');
      expect(node.sourceType).toBe('module');
      expect(node.rollupMeta).toBe('test');
    });

    it('should accept statements in body', () => {
      const stmt: ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: id('x'),
        ...BASE,
      };
      const node: ProgramNode = {
        type: 'Program',
        body: [stmt],
        sourceType: 'script',
        ...BASE,
      };
      expect(node.body).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------
  // Union Types
  // ----------------------------------------------------------

  describe('Union types', () => {
    it('should accept all Statement members', () => {
      const statements: ReadonlyArray<Statement> = [
        { type: 'ExpressionStatement', expression: id('x'), ...BASE },
        block(),
        { type: 'EmptyStatement', ...BASE },
        { type: 'DebuggerStatement', ...BASE },
        { type: 'ReturnStatement', argument: null, ...BASE },
        { type: 'LabeledStatement', label: id('l'), body: block(), ...BASE },
        { type: 'BreakStatement', label: null, ...BASE },
        { type: 'ContinueStatement', label: null, ...BASE },
        { type: 'IfStatement', test: id('c'), consequent: block(), alternate: null, ...BASE },
        { type: 'SwitchStatement', discriminant: id('x'), cases: [], ...BASE },
        { type: 'ThrowStatement', argument: id('e'), ...BASE },
        {
          type: 'TryStatement',
          block: block(),
          handler: null,
          finalizer: block(),
          ...BASE,
        },
        { type: 'WhileStatement', test: lit(true), body: block(), ...BASE },
        { type: 'DoWhileStatement', body: block(), test: lit(true), ...BASE },
        {
          type: 'ForStatement',
          init: null,
          test: null,
          update: null,
          body: block(),
          ...BASE,
        },
        {
          type: 'ForInStatement',
          left: id('k'),
          right: id('o'),
          body: block(),
          ...BASE,
        },
        {
          type: 'ForOfStatement',
          left: id('v'),
          right: id('a'),
          body: block(),
          await: false,
          ...BASE,
        },
        { type: 'WithStatement', object: id('o'), body: block(), ...BASE },
        {
          type: 'VariableDeclaration',
          declarations: [],
          kind: 'const' as const,
          ...BASE,
        },
        {
          type: 'FunctionDeclaration',
          id: id('f'),
          params: [],
          body: block(),
          generator: false,
          async: false,
          ...BASE,
        },
        {
          type: 'ClassDeclaration',
          id: id('C'),
          superClass: null,
          body: classBody(),
          ...BASE,
        },
      ];
      expect(statements).toHaveLength(21);
    });

    it('should accept all Declaration members', () => {
      const declarations: ReadonlyArray<Declaration> = [
        {
          type: 'VariableDeclaration',
          declarations: [],
          kind: 'const' as const,
          ...BASE,
        },
        {
          type: 'FunctionDeclaration',
          id: id('f'),
          params: [],
          body: block(),
          generator: false,
          async: false,
          ...BASE,
        },
        {
          type: 'ClassDeclaration',
          id: id('C'),
          superClass: null,
          body: classBody(),
          ...BASE,
        },
      ];
      expect(declarations).toHaveLength(3);
    });

    it('should accept all Expression members', () => {
      const expressions: ReadonlyArray<Expression> = [
        id('x'),
        lit(1),
        {
          type: 'TemplateLiteral',
          quasis: [
            {
              type: 'TemplateElement',
              tail: true,
              value: { raw: '', cooked: '' },
              ...BASE,
            },
          ],
          expressions: [],
          ...BASE,
        },
        {
          type: 'TaggedTemplateExpression',
          tag: id('tag'),
          quasi: {
            type: 'TemplateLiteral',
            quasis: [
              {
                type: 'TemplateElement',
                tail: true,
                value: { raw: '', cooked: '' },
                ...BASE,
              },
            ],
            expressions: [],
            ...BASE,
          },
          ...BASE,
        },
        { type: 'ThisExpression', ...BASE },
        { type: 'ArrayExpression', elements: [], ...BASE },
        { type: 'ObjectExpression', properties: [], ...BASE },
        funcExpr(),
        {
          type: 'ArrowFunctionExpression',
          id: null,
          params: [],
          body: block(),
          expression: false,
          generator: false,
          async: false,
          ...BASE,
        },
        {
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: classBody(),
          ...BASE,
        },
        { type: 'SequenceExpression', expressions: [lit(1)], ...BASE },
        {
          type: 'UnaryExpression',
          operator: '-',
          prefix: true,
          argument: lit(1),
          ...BASE,
        },
        {
          type: 'BinaryExpression',
          operator: '+',
          left: lit(1),
          right: lit(2),
          ...BASE,
        },
        {
          type: 'LogicalExpression',
          operator: '&&',
          left: id('a'),
          right: id('b'),
          ...BASE,
        },
        {
          type: 'AssignmentExpression',
          operator: '=',
          left: id('x'),
          right: lit(1),
          ...BASE,
        },
        {
          type: 'UpdateExpression',
          operator: '++',
          argument: id('i'),
          prefix: true,
          ...BASE,
        },
        {
          type: 'ConditionalExpression',
          test: id('c'),
          consequent: lit(1),
          alternate: lit(2),
          ...BASE,
        },
        {
          type: 'CallExpression',
          callee: id('fn'),
          arguments: [],
          optional: false,
          ...BASE,
        },
        { type: 'NewExpression', callee: id('C'), arguments: [], ...BASE },
        {
          type: 'MemberExpression',
          object: id('o'),
          property: id('p'),
          computed: false,
          optional: false,
          ...BASE,
        },
        {
          type: 'ChainExpression',
          expression: {
            type: 'MemberExpression',
            object: id('o'),
            property: id('p'),
            computed: false,
            optional: true,
            ...BASE,
          },
          ...BASE,
        },
        {
          type: 'YieldExpression',
          argument: null,
          delegate: false,
          ...BASE,
        },
        { type: 'AwaitExpression', argument: id('p'), ...BASE },
        {
          type: 'MetaProperty',
          meta: id('import'),
          property: id('meta'),
          ...BASE,
        },
        { type: 'ImportExpression', source: lit('./m'), ...BASE },
      ];
      expect(expressions).toHaveLength(25);
    });

    it('should accept all Pattern members', () => {
      const patterns: ReadonlyArray<Pattern> = [
        id('x'),
        { type: 'ObjectPattern', properties: [], ...BASE },
        { type: 'ArrayPattern', elements: [], ...BASE },
        { type: 'RestElement', argument: id('r'), ...BASE },
        {
          type: 'AssignmentPattern',
          left: id('x'),
          right: lit(0),
          ...BASE,
        },
        {
          type: 'MemberExpression',
          object: id('o'),
          property: id('p'),
          computed: false,
          optional: false,
          ...BASE,
        },
      ];
      expect(patterns).toHaveLength(6);
    });

    it('should accept all ModuleDeclaration members', () => {
      const moduleDecls: ReadonlyArray<ModuleDeclaration> = [
        {
          type: 'ImportDeclaration',
          specifiers: [],
          source: lit('m'),
          ...BASE,
        },
        {
          type: 'ExportNamedDeclaration',
          declaration: null,
          specifiers: [],
          source: null,
          ...BASE,
        },
        {
          type: 'ExportDefaultDeclaration',
          declaration: id('x'),
          ...BASE,
        },
        {
          type: 'ExportAllDeclaration',
          source: lit('m'),
          exported: null,
          ...BASE,
        },
      ];
      expect(moduleDecls).toHaveLength(4);
    });

    it('should accept all JSXNode members', () => {
      const jsxId: JSXIdentifier = { type: 'JSXIdentifier', name: 'div', ...BASE };
      const jsxNodes: ReadonlyArray<JSXNode> = [
        {
          type: 'JSXElement',
          openingElement: {
            type: 'JSXOpeningElement',
            name: jsxId,
            attributes: [],
            selfClosing: true,
            ...BASE,
          },
          closingElement: null,
          children: [],
          ...BASE,
        },
        {
          type: 'JSXOpeningElement',
          name: jsxId,
          attributes: [],
          selfClosing: false,
          ...BASE,
        },
        { type: 'JSXClosingElement', name: jsxId, ...BASE },
        {
          type: 'JSXFragment',
          openingFragment: { type: 'JSXOpeningFragment', ...BASE },
          closingFragment: { type: 'JSXClosingFragment', ...BASE },
          children: [],
          ...BASE,
        },
        { type: 'JSXOpeningFragment', ...BASE },
        { type: 'JSXClosingFragment', ...BASE },
        {
          type: 'JSXAttribute',
          name: jsxId,
          value: null,
          ...BASE,
        },
        {
          type: 'JSXSpreadAttribute',
          argument: id('p'),
          ...BASE,
        },
        {
          type: 'JSXExpressionContainer',
          expression: id('x'),
          ...BASE,
        },
        { type: 'JSXEmptyExpression', ...BASE },
        { type: 'JSXText', value: 't', raw: 't', ...BASE },
        jsxId,
        {
          type: 'JSXMemberExpression',
          object: jsxId,
          property: jsxId,
          ...BASE,
        },
        {
          type: 'JSXNamespacedName',
          namespace: jsxId,
          name: jsxId,
          ...BASE,
        },
      ];
      expect(jsxNodes).toHaveLength(14);
    });

    it('should accept representative AstNode members', () => {
      const nodes: ReadonlyArray<AstNode> = [
        block(),
        id('x'),
        { type: 'ObjectPattern', properties: [], ...BASE },
        {
          type: 'ImportDeclaration',
          specifiers: [],
          source: lit('m'),
          ...BASE,
        },
        {
          type: 'Program',
          body: [],
          sourceType: 'module',
          ...BASE,
        },
        { type: 'JSXEmptyExpression', ...BASE },
      ];
      expect(nodes).toHaveLength(6);
    });
  });

  // ----------------------------------------------------------
  // Discriminated Union Narrowing
  // ----------------------------------------------------------

  describe('Discriminated union narrowing', () => {
    it('should narrow Statement by type field', () => {
      const stmt: Statement = {
        type: 'IfStatement',
        test: id('x'),
        consequent: block(),
        alternate: null,
        ...BASE,
      };

      // Narrowing via type check
      if (stmt.type === 'IfStatement') {
        expect(stmt.test.type).toBe('Identifier');
        expect(stmt.alternate).toBeNull();
      } else {
        // This branch should never execute
        expect(true).toBe(false);
      }
    });

    it('should narrow Expression by type field', () => {
      const expr: Expression = {
        type: 'BinaryExpression',
        operator: '+',
        left: lit(1),
        right: lit(2),
        ...BASE,
      };

      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('+');
      } else {
        expect(true).toBe(false);
      }
    });

    it('should narrow Pattern by type field', () => {
      const pat: Pattern = {
        type: 'ArrayPattern',
        elements: [id('a')],
        ...BASE,
      };

      if (pat.type === 'ArrayPattern') {
        expect(pat.elements).toHaveLength(1);
      } else {
        expect(true).toBe(false);
      }
    });

    it('should narrow ModuleDeclaration by type field', () => {
      const mod: ModuleDeclaration = {
        type: 'ExportAllDeclaration',
        source: lit('pkg'),
        exported: null,
        ...BASE,
      };

      if (mod.type === 'ExportAllDeclaration') {
        expect(mod.exported).toBeNull();
      } else {
        expect(true).toBe(false);
      }
    });

    it('should narrow AstNode across categories', () => {
      const node: AstNode = {
        type: 'Program',
        body: [],
        sourceType: 'module',
        ...BASE,
      };

      if (node.type === 'Program') {
        expect(node.sourceType).toBe('module');
      } else {
        expect(true).toBe(false);
      }
    });
  });

  // ----------------------------------------------------------
  // Base property verification per category
  // ----------------------------------------------------------

  describe('Base properties on every category', () => {
    it('should have start and end on Statement nodes', () => {
      const stmt: Statement = block([]);
      expect(stmt.start).toBe(0);
      expect(stmt.end).toBe(10);
      expect(typeof stmt.type).toBe('string');
    });

    it('should have start and end on Declaration nodes', () => {
      const decl: Declaration = {
        type: 'VariableDeclaration',
        declarations: [],
        kind: 'const',
        ...BASE,
      };
      expect(decl.start).toBe(0);
      expect(decl.end).toBe(10);
    });

    it('should have start and end on Expression nodes', () => {
      const expr: Expression = id('x');
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(10);
    });

    it('should have start and end on Pattern nodes', () => {
      const pat: Pattern = { type: 'RestElement', argument: id('r'), ...BASE };
      expect(pat.start).toBe(0);
      expect(pat.end).toBe(10);
    });

    it('should have start and end on ModuleDeclaration nodes', () => {
      const mod: ModuleDeclaration = {
        type: 'ImportDeclaration',
        specifiers: [],
        source: lit('m'),
        ...BASE,
      };
      expect(mod.start).toBe(0);
      expect(mod.end).toBe(10);
    });

    it('should have start and end on JSXNode nodes', () => {
      const jsx: JSXNode = { type: 'JSXEmptyExpression', ...BASE };
      expect(jsx.start).toBe(0);
      expect(jsx.end).toBe(10);
    });

    it('should have start and end on Program node', () => {
      const prog: Program = {
        type: 'Program',
        body: [],
        sourceType: 'module',
        ...BASE,
      };
      expect(prog.start).toBe(0);
      expect(prog.end).toBe(10);
    });
  });
});
