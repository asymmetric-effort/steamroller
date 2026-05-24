/**
 * @module ast/types
 * @description Complete ESTree-compatible AST node type definitions.
 *
 * Provides TypeScript interfaces for all ESTree AST node types including
 * statements, declarations, expressions, patterns, module declarations,
 * and JSX extensions. All nodes extend a common BaseNode interface with
 * discriminated unions on the `type` field.
 */

// ============================================================
// Source Location
// ============================================================

/** Source position within the original text. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/** Source location range. */
export interface SourceLocation {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
  readonly source?: string | null;
}

// ============================================================
// Base Node
// ============================================================

/** Base interface shared by all AST nodes. */
export interface BaseNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly loc?: SourceLocation | null;
  readonly leadingComments?: ReadonlyArray<Comment>;
  readonly trailingComments?: ReadonlyArray<Comment>;
}

/** A comment within the source text. */
export interface Comment extends BaseNode {
  readonly type: "Line" | "Block";
  readonly value: string;
}

// ============================================================
// Program
// ============================================================

/** The root node of a parsed program. */
export interface Program extends BaseNode {
  readonly type: "Program";
  readonly body: ReadonlyArray<Statement | ModuleDeclaration>;
  readonly sourceType: "module" | "script";
}

// ============================================================
// Statements
// ============================================================

/** A statement consisting of a single expression. */
export interface ExpressionStatement extends BaseNode {
  readonly type: "ExpressionStatement";
  readonly expression: Expression;
  readonly directive?: string;
}

/** A block of statements enclosed in braces. */
export interface BlockStatement extends BaseNode {
  readonly type: "BlockStatement";
  readonly body: ReadonlyArray<Statement>;
}

/** An empty statement (a solitary semicolon). */
export interface EmptyStatement extends BaseNode {
  readonly type: "EmptyStatement";
}

/** A debugger statement. */
export interface DebuggerStatement extends BaseNode {
  readonly type: "DebuggerStatement";
}

/** A return statement. */
export interface ReturnStatement extends BaseNode {
  readonly type: "ReturnStatement";
  readonly argument: Expression | null;
}

/** A labeled statement. */
export interface LabeledStatement extends BaseNode {
  readonly type: "LabeledStatement";
  readonly label: Identifier;
  readonly body: Statement;
}

/** A break statement. */
export interface BreakStatement extends BaseNode {
  readonly type: "BreakStatement";
  readonly label: Identifier | null;
}

/** A continue statement. */
export interface ContinueStatement extends BaseNode {
  readonly type: "ContinueStatement";
  readonly label: Identifier | null;
}

/** An if statement with optional else branch. */
export interface IfStatement extends BaseNode {
  readonly type: "IfStatement";
  readonly test: Expression;
  readonly consequent: Statement;
  readonly alternate: Statement | null;
}

/** A switch statement. */
export interface SwitchStatement extends BaseNode {
  readonly type: "SwitchStatement";
  readonly discriminant: Expression;
  readonly cases: ReadonlyArray<SwitchCase>;
}

/** A case or default clause within a switch statement. */
export interface SwitchCase extends BaseNode {
  readonly type: "SwitchCase";
  readonly test: Expression | null;
  readonly consequent: ReadonlyArray<Statement>;
}

/** A throw statement. */
export interface ThrowStatement extends BaseNode {
  readonly type: "ThrowStatement";
  readonly argument: Expression;
}

/** A try statement with optional catch and finally blocks. */
export interface TryStatement extends BaseNode {
  readonly type: "TryStatement";
  readonly block: BlockStatement;
  readonly handler: CatchClause | null;
  readonly finalizer: BlockStatement | null;
}

/** A catch clause within a try statement. */
export interface CatchClause extends BaseNode {
  readonly type: "CatchClause";
  readonly param: Pattern | null;
  readonly body: BlockStatement;
}

/** A while loop. */
export interface WhileStatement extends BaseNode {
  readonly type: "WhileStatement";
  readonly test: Expression;
  readonly body: Statement;
}

/** A do-while loop. */
export interface DoWhileStatement extends BaseNode {
  readonly type: "DoWhileStatement";
  readonly body: Statement;
  readonly test: Expression;
}

/** A classic for loop. */
export interface ForStatement extends BaseNode {
  readonly type: "ForStatement";
  readonly init: VariableDeclaration | Expression | null;
  readonly test: Expression | null;
  readonly update: Expression | null;
  readonly body: Statement;
}

/** A for-in loop. */
export interface ForInStatement extends BaseNode {
  readonly type: "ForInStatement";
  readonly left: VariableDeclaration | Pattern;
  readonly right: Expression;
  readonly body: Statement;
}

/** A for-of loop. */
export interface ForOfStatement extends BaseNode {
  readonly type: "ForOfStatement";
  readonly left: VariableDeclaration | Pattern;
  readonly right: Expression;
  readonly body: Statement;
  readonly await: boolean;
}

/** A with statement. */
export interface WithStatement extends BaseNode {
  readonly type: "WithStatement";
  readonly object: Expression;
  readonly body: Statement;
}

// ============================================================
// Declarations
// ============================================================

/** A variable declaration (var, let, or const). */
export interface VariableDeclaration extends BaseNode {
  readonly type: "VariableDeclaration";
  readonly declarations: ReadonlyArray<VariableDeclarator>;
  readonly kind: "var" | "let" | "const";
}

/** A single variable declarator within a VariableDeclaration. */
export interface VariableDeclarator extends BaseNode {
  readonly type: "VariableDeclarator";
  readonly id: Pattern;
  readonly init: Expression | null;
}

/** A function declaration. */
export interface FunctionDeclaration extends BaseNode {
  readonly type: "FunctionDeclaration";
  readonly id: Identifier | null;
  readonly params: ReadonlyArray<Pattern>;
  readonly body: BlockStatement;
  readonly generator: boolean;
  readonly async: boolean;
}

/** A class declaration. */
export interface ClassDeclaration extends BaseNode {
  readonly type: "ClassDeclaration";
  readonly id: Identifier | null;
  readonly superClass: Expression | null;
  readonly body: ClassBody;
}

/** The body of a class, containing method and property definitions. */
export interface ClassBody extends BaseNode {
  readonly type: "ClassBody";
  readonly body: ReadonlyArray<
    MethodDefinition | PropertyDefinition | StaticBlock
  >;
}

/** A method definition within a class body. */
export interface MethodDefinition extends BaseNode {
  readonly type: "MethodDefinition";
  readonly key: Expression;
  readonly value: FunctionExpression;
  readonly kind: "constructor" | "method" | "get" | "set";
  readonly computed: boolean;
  readonly static: boolean;
}

/** A property definition (class field) within a class body. */
export interface PropertyDefinition extends BaseNode {
  readonly type: "PropertyDefinition";
  readonly key: Expression;
  readonly value: Expression | null;
  readonly computed: boolean;
  readonly static: boolean;
}

/** A static initialization block within a class body. */
export interface StaticBlock extends BaseNode {
  readonly type: "StaticBlock";
  readonly body: ReadonlyArray<Statement>;
}

// ============================================================
// Expressions
// ============================================================

/** An identifier reference. */
export interface Identifier extends BaseNode {
  readonly type: "Identifier";
  readonly name: string;
}

/** Regular expression literal value container. */
export interface RegExpValue {
  readonly pattern: string;
  readonly flags: string;
}

/** A literal value (string, number, boolean, null, RegExp, or BigInt). */
export interface Literal extends BaseNode {
  readonly type: "Literal";
  readonly value: string | number | boolean | null | RegExp | bigint;
  readonly raw?: string;
  readonly regex?: RegExpValue;
  readonly bigint?: string;
}

/** A template literal. */
export interface TemplateLiteral extends BaseNode {
  readonly type: "TemplateLiteral";
  readonly quasis: ReadonlyArray<TemplateElement>;
  readonly expressions: ReadonlyArray<Expression>;
}

/** An element within a template literal. */
export interface TemplateElement extends BaseNode {
  readonly type: "TemplateElement";
  readonly tail: boolean;
  readonly value: {
    readonly raw: string;
    readonly cooked: string | null;
  };
}

/** A tagged template expression. */
export interface TaggedTemplateExpression extends BaseNode {
  readonly type: "TaggedTemplateExpression";
  readonly tag: Expression;
  readonly quasi: TemplateLiteral;
}

/** A reference to `this`. */
export interface ThisExpression extends BaseNode {
  readonly type: "ThisExpression";
}

/** An array literal expression. */
export interface ArrayExpression extends BaseNode {
  readonly type: "ArrayExpression";
  readonly elements: ReadonlyArray<Expression | SpreadElement | null>;
}

/** An object literal expression. */
export interface ObjectExpression extends BaseNode {
  readonly type: "ObjectExpression";
  readonly properties: ReadonlyArray<Property | SpreadElement>;
}

/** A property within an object expression or object pattern. */
export interface Property extends BaseNode {
  readonly type: "Property";
  readonly key: Expression;
  readonly value: Expression | Pattern;
  readonly kind: "init" | "get" | "set";
  readonly method: boolean;
  readonly shorthand: boolean;
  readonly computed: boolean;
}

/** A spread element (...expr). */
export interface SpreadElement extends BaseNode {
  readonly type: "SpreadElement";
  readonly argument: Expression;
}

/** A function expression. */
export interface FunctionExpression extends BaseNode {
  readonly type: "FunctionExpression";
  readonly id: Identifier | null;
  readonly params: ReadonlyArray<Pattern>;
  readonly body: BlockStatement;
  readonly generator: boolean;
  readonly async: boolean;
}

/** An arrow function expression. */
export interface ArrowFunctionExpression extends BaseNode {
  readonly type: "ArrowFunctionExpression";
  readonly id: null;
  readonly params: ReadonlyArray<Pattern>;
  readonly body: BlockStatement | Expression;
  readonly expression: boolean;
  readonly generator: false;
  readonly async: boolean;
}

/** A class expression. */
export interface ClassExpression extends BaseNode {
  readonly type: "ClassExpression";
  readonly id: Identifier | null;
  readonly superClass: Expression | null;
  readonly body: ClassBody;
}

/** A sequence expression (comma-separated expressions). */
export interface SequenceExpression extends BaseNode {
  readonly type: "SequenceExpression";
  readonly expressions: ReadonlyArray<Expression>;
}

/** Unary operator tokens. */
export type UnaryOperator =
  | "-"
  | "+"
  | "!"
  | "~"
  | "typeof"
  | "void"
  | "delete";

/** A unary expression. */
export interface UnaryExpression extends BaseNode {
  readonly type: "UnaryExpression";
  readonly operator: UnaryOperator;
  readonly prefix: boolean;
  readonly argument: Expression;
}

/** Binary operator tokens. */
export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof";

/** A binary expression. */
export interface BinaryExpression extends BaseNode {
  readonly type: "BinaryExpression";
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** Logical operator tokens. */
export type LogicalOperator = "||" | "&&" | "??";

/** A logical expression (&&, ||, ??). */
export interface LogicalExpression extends BaseNode {
  readonly type: "LogicalExpression";
  readonly operator: LogicalOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** Assignment operator tokens. */
export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "**="
  | "<<="
  | ">>="
  | ">>>="
  | "|="
  | "^="
  | "&="
  | "||="
  | "&&="
  | "??=";

/** An assignment expression. */
export interface AssignmentExpression extends BaseNode {
  readonly type: "AssignmentExpression";
  readonly operator: AssignmentOperator;
  readonly left: Pattern | Expression;
  readonly right: Expression;
}

/** Update operator tokens. */
export type UpdateOperator = "++" | "--";

/** An update (increment/decrement) expression. */
export interface UpdateExpression extends BaseNode {
  readonly type: "UpdateExpression";
  readonly operator: UpdateOperator;
  readonly argument: Expression;
  readonly prefix: boolean;
}

/** A conditional (ternary) expression. */
export interface ConditionalExpression extends BaseNode {
  readonly type: "ConditionalExpression";
  readonly test: Expression;
  readonly consequent: Expression;
  readonly alternate: Expression;
}

/** A function or method call expression. */
export interface CallExpression extends BaseNode {
  readonly type: "CallExpression";
  readonly callee: Expression | Super;
  readonly arguments: ReadonlyArray<Expression | SpreadElement>;
  readonly optional: boolean;
}

/** A new expression (constructor call). */
export interface NewExpression extends BaseNode {
  readonly type: "NewExpression";
  readonly callee: Expression;
  readonly arguments: ReadonlyArray<Expression | SpreadElement>;
}

/** A member access expression. */
export interface MemberExpression extends BaseNode {
  readonly type: "MemberExpression";
  readonly object: Expression | Super;
  readonly property: Expression;
  readonly computed: boolean;
  readonly optional: boolean;
}

/** A chain expression (optional chaining). */
export interface ChainExpression extends BaseNode {
  readonly type: "ChainExpression";
  readonly expression: CallExpression | MemberExpression;
}

/** A yield expression within a generator function. */
export interface YieldExpression extends BaseNode {
  readonly type: "YieldExpression";
  readonly argument: Expression | null;
  readonly delegate: boolean;
}

/** An await expression within an async function. */
export interface AwaitExpression extends BaseNode {
  readonly type: "AwaitExpression";
  readonly argument: Expression;
}

/** A meta-property expression (e.g. new.target, import.meta). */
export interface MetaProperty extends BaseNode {
  readonly type: "MetaProperty";
  readonly meta: Identifier;
  readonly property: Identifier;
}

/** A dynamic import() expression. */
export interface ImportExpression extends BaseNode {
  readonly type: "ImportExpression";
  readonly source: Expression;
}

/** The super keyword used in class methods. */
export interface Super extends BaseNode {
  readonly type: "Super";
}

// ============================================================
// Patterns
// ============================================================

/** An object destructuring pattern. */
export interface ObjectPattern extends BaseNode {
  readonly type: "ObjectPattern";
  readonly properties: ReadonlyArray<Property | RestElement>;
}

/** An array destructuring pattern. */
export interface ArrayPattern extends BaseNode {
  readonly type: "ArrayPattern";
  readonly elements: ReadonlyArray<Pattern | null>;
}

/** A rest element (...x) in a destructuring pattern or function params. */
export interface RestElement extends BaseNode {
  readonly type: "RestElement";
  readonly argument: Pattern;
}

/** A default value assignment within a destructuring pattern. */
export interface AssignmentPattern extends BaseNode {
  readonly type: "AssignmentPattern";
  readonly left: Pattern;
  readonly right: Expression;
}

// ============================================================
// Module Declarations
// ============================================================

/** An import declaration. */
export interface ImportDeclaration extends BaseNode {
  readonly type: "ImportDeclaration";
  readonly specifiers: ReadonlyArray<
    ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
  >;
  readonly source: Literal;
}

/** A named import specifier (import { x } from ...). */
export interface ImportSpecifier extends BaseNode {
  readonly type: "ImportSpecifier";
  readonly imported: Identifier | Literal;
  readonly local: Identifier;
}

/** A default import specifier (import x from ...). */
export interface ImportDefaultSpecifier extends BaseNode {
  readonly type: "ImportDefaultSpecifier";
  readonly local: Identifier;
}

/** A namespace import specifier (import * as x from ...). */
export interface ImportNamespaceSpecifier extends BaseNode {
  readonly type: "ImportNamespaceSpecifier";
  readonly local: Identifier;
}

/** A named export declaration. */
export interface ExportNamedDeclaration extends BaseNode {
  readonly type: "ExportNamedDeclaration";
  readonly declaration: Declaration | null;
  readonly specifiers: ReadonlyArray<ExportSpecifier>;
  readonly source: Literal | null;
}

/** A default export declaration. */
export interface ExportDefaultDeclaration extends BaseNode {
  readonly type: "ExportDefaultDeclaration";
  readonly declaration: Declaration | Expression;
}

/** An export-all declaration (export * from ...). */
export interface ExportAllDeclaration extends BaseNode {
  readonly type: "ExportAllDeclaration";
  readonly source: Literal;
  readonly exported: Identifier | Literal | null;
}

/** A single export specifier (export { x as y }). */
export interface ExportSpecifier extends BaseNode {
  readonly type: "ExportSpecifier";
  readonly local: Identifier | Literal;
  readonly exported: Identifier | Literal;
}

// ============================================================
// JSX
// ============================================================

/** A JSX element with opening/closing tags and children. */
export interface JSXElement extends BaseNode {
  readonly type: "JSXElement";
  readonly openingElement: JSXOpeningElement;
  readonly closingElement: JSXClosingElement | null;
  readonly children: ReadonlyArray<
    JSXElement | JSXFragment | JSXExpressionContainer | JSXText
  >;
}

/** The opening tag of a JSX element. */
export interface JSXOpeningElement extends BaseNode {
  readonly type: "JSXOpeningElement";
  readonly name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName;
  readonly attributes: ReadonlyArray<JSXAttribute | JSXSpreadAttribute>;
  readonly selfClosing: boolean;
}

/** The closing tag of a JSX element. */
export interface JSXClosingElement extends BaseNode {
  readonly type: "JSXClosingElement";
  readonly name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName;
}

/** A JSX fragment (<>...</>). */
export interface JSXFragment extends BaseNode {
  readonly type: "JSXFragment";
  readonly openingFragment: JSXOpeningFragment;
  readonly closingFragment: JSXClosingFragment;
  readonly children: ReadonlyArray<
    JSXElement | JSXFragment | JSXExpressionContainer | JSXText
  >;
}

/** The opening fragment tag (<>). */
export interface JSXOpeningFragment extends BaseNode {
  readonly type: "JSXOpeningFragment";
}

/** The closing fragment tag (</>). */
export interface JSXClosingFragment extends BaseNode {
  readonly type: "JSXClosingFragment";
}

/** A JSX attribute (name="value" or name={expr}). */
export interface JSXAttribute extends BaseNode {
  readonly type: "JSXAttribute";
  readonly name: JSXIdentifier | JSXNamespacedName;
  readonly value:
    | Literal
    | JSXExpressionContainer
    | JSXElement
    | JSXFragment
    | null;
}

/** A spread attribute in a JSX element ({...expr}). */
export interface JSXSpreadAttribute extends BaseNode {
  readonly type: "JSXSpreadAttribute";
  readonly argument: Expression;
}

/** An expression container within JSX ({expr}). */
export interface JSXExpressionContainer extends BaseNode {
  readonly type: "JSXExpressionContainer";
  readonly expression: Expression | JSXEmptyExpression;
}

/** An empty JSX expression (the {} in <div>{}</div>). */
export interface JSXEmptyExpression extends BaseNode {
  readonly type: "JSXEmptyExpression";
}

/** Text content within a JSX element. */
export interface JSXText extends BaseNode {
  readonly type: "JSXText";
  readonly value: string;
  readonly raw: string;
}

/** An identifier within JSX. */
export interface JSXIdentifier extends BaseNode {
  readonly type: "JSXIdentifier";
  readonly name: string;
}

/** A member expression in JSX element names (e.g. Foo.Bar). */
export interface JSXMemberExpression extends BaseNode {
  readonly type: "JSXMemberExpression";
  readonly object: JSXIdentifier | JSXMemberExpression;
  readonly property: JSXIdentifier;
}

/** A namespaced name in JSX (e.g. xml:lang). */
export interface JSXNamespacedName extends BaseNode {
  readonly type: "JSXNamespacedName";
  readonly namespace: JSXIdentifier;
  readonly name: JSXIdentifier;
}

// ============================================================
// Rollup Wrapper Types
// ============================================================

/** Rollup-compatible AST node wrapper that permits extra properties. */
export type RollupAstNode<T extends BaseNode> = T & {
  readonly [key: string]: unknown;
};

/** A Rollup-wrapped Program node. */
export type ProgramNode = RollupAstNode<Program>;

// ============================================================
// Union Types
// ============================================================

/** All statement node types. */
export type Statement =
  | ExpressionStatement
  | BlockStatement
  | EmptyStatement
  | DebuggerStatement
  | ReturnStatement
  | LabeledStatement
  | BreakStatement
  | ContinueStatement
  | IfStatement
  | SwitchStatement
  | ThrowStatement
  | TryStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ForInStatement
  | ForOfStatement
  | WithStatement
  | VariableDeclaration
  | FunctionDeclaration
  | ClassDeclaration;

/** All declaration node types. */
export type Declaration =
  | VariableDeclaration
  | FunctionDeclaration
  | ClassDeclaration;

/** All expression node types. */
export type Expression =
  | Identifier
  | Literal
  | TemplateLiteral
  | TaggedTemplateExpression
  | ThisExpression
  | ArrayExpression
  | ObjectExpression
  | FunctionExpression
  | ArrowFunctionExpression
  | ClassExpression
  | SequenceExpression
  | UnaryExpression
  | BinaryExpression
  | LogicalExpression
  | AssignmentExpression
  | UpdateExpression
  | ConditionalExpression
  | CallExpression
  | NewExpression
  | MemberExpression
  | ChainExpression
  | YieldExpression
  | AwaitExpression
  | MetaProperty
  | ImportExpression;

/** All pattern node types. */
export type Pattern =
  | Identifier
  | ObjectPattern
  | ArrayPattern
  | RestElement
  | AssignmentPattern
  | MemberExpression;

/** All module declaration node types. */
export type ModuleDeclaration =
  | ImportDeclaration
  | ExportNamedDeclaration
  | ExportDefaultDeclaration
  | ExportAllDeclaration;

/** All JSX node types. */
export type JSXNode =
  | JSXElement
  | JSXOpeningElement
  | JSXClosingElement
  | JSXFragment
  | JSXOpeningFragment
  | JSXClosingFragment
  | JSXAttribute
  | JSXSpreadAttribute
  | JSXExpressionContainer
  | JSXEmptyExpression
  | JSXText
  | JSXIdentifier
  | JSXMemberExpression
  | JSXNamespacedName;

/** Any AST node. */
export type AstNode =
  | Statement
  | Declaration
  | Expression
  | Pattern
  | ModuleDeclaration
  | Program
  | JSXNode;
