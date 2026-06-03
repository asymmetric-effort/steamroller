/**
 * @module css/css-ast
 * @description AST type definitions for the CSS parser.
 * Covers stylesheets, rules, declarations, at-rules, selectors,
 * media queries, keyframes, font-face, layers, containers, and CSS Modules.
 */

// ============================================================
// Position tracking
// ============================================================

/** Source position for a CSS AST node. */
export interface CSSPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** Location span for a CSS AST node. */
export interface CSSLocation {
  readonly start: CSSPosition;
  readonly end: CSSPosition;
}

// ============================================================
// Base node
// ============================================================

/** Base interface for all CSS AST nodes. */
export interface CSSBaseNode {
  readonly type: string;
  readonly loc?: CSSLocation;
}

// ============================================================
// Stylesheet (root)
// ============================================================

/** The root node of a CSS AST. */
export interface Stylesheet extends CSSBaseNode {
  readonly type: "Stylesheet";
  readonly rules: ReadonlyArray<CSSTopLevelNode>;
}

/** Any node that can appear at the top level of a stylesheet. */
export type CSSTopLevelNode = Rule | AtRule | Comment;

// ============================================================
// Rules
// ============================================================

/** A CSS rule: selector list + declaration block. */
export interface Rule extends CSSBaseNode {
  readonly type: "Rule";
  readonly selectors: SelectorList;
  readonly declarations: ReadonlyArray<DeclarationOrNested>;
}

/** A nested rule or declaration inside a rule block. */
export type DeclarationOrNested = Declaration | Rule | AtRule | Comment;

// ============================================================
// Selectors
// ============================================================

/** A comma-separated list of selectors. */
export interface SelectorList extends CSSBaseNode {
  readonly type: "SelectorList";
  readonly selectors: ReadonlyArray<Selector>;
}

/** A single compound selector with optional combinators. */
export interface Selector extends CSSBaseNode {
  readonly type: "Selector";
  readonly parts: ReadonlyArray<SelectorPart>;
}

/** A single segment of a selector. */
export type SelectorPart =
  | ElementSelector
  | ClassSelector
  | IdSelector
  | AttributeSelector
  | PseudoClassSelector
  | PseudoElementSelector
  | CombinatorSelector
  | NestingSelector
  | UniversalSelector;

/** Element selector: `div`, `span`, etc. */
export interface ElementSelector extends CSSBaseNode {
  readonly type: "ElementSelector";
  readonly name: string;
}

/** Class selector: `.button` */
export interface ClassSelector extends CSSBaseNode {
  readonly type: "ClassSelector";
  readonly name: string;
}

/** ID selector: `#header` */
export interface IdSelector extends CSSBaseNode {
  readonly type: "IdSelector";
  readonly name: string;
}

/** Attribute selector: `[href]`, `[type="text"]` */
export interface AttributeSelector extends CSSBaseNode {
  readonly type: "AttributeSelector";
  readonly name: string;
  readonly operator?: string;
  readonly value?: string;
  readonly flags?: string;
}

/** Pseudo-class selector: `:hover`, `:nth-child(2n)` */
export interface PseudoClassSelector extends CSSBaseNode {
  readonly type: "PseudoClassSelector";
  readonly name: string;
  readonly args?: string;
}

/** Pseudo-element selector: `::before`, `::after` */
export interface PseudoElementSelector extends CSSBaseNode {
  readonly type: "PseudoElementSelector";
  readonly name: string;
  readonly args?: string;
}

/** Combinator between selector parts: `>`, `+`, `~`, ` ` */
export interface CombinatorSelector extends CSSBaseNode {
  readonly type: "Combinator";
  readonly value: ">" | "+" | "~" | " ";
}

/** Nesting selector: `&` */
export interface NestingSelector extends CSSBaseNode {
  readonly type: "NestingSelector";
}

/** Universal selector: `*` */
export interface UniversalSelector extends CSSBaseNode {
  readonly type: "UniversalSelector";
}

// ============================================================
// Declarations
// ============================================================

/** A CSS property: value declaration. */
export interface Declaration extends CSSBaseNode {
  readonly type: "Declaration";
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
}

// ============================================================
// At-rules
// ============================================================

/** A CSS at-rule (e.g., @media, @keyframes, @import). */
export interface AtRule extends CSSBaseNode {
  readonly type: "AtRule";
  readonly name: string;
  readonly params: string;
  readonly rules?: ReadonlyArray<CSSTopLevelNode | DeclarationOrNested>;
}

/** A @media at-rule with parsed query. */
export interface MediaQuery extends CSSBaseNode {
  readonly type: "MediaQuery";
  readonly query: string;
  readonly rules: ReadonlyArray<CSSTopLevelNode>;
}

/** A @keyframes block. */
export interface KeyframeBlock extends CSSBaseNode {
  readonly type: "KeyframeBlock";
  readonly name: string;
  readonly keyframes: ReadonlyArray<KeyframeRule>;
}

/** A single keyframe rule (e.g., `from { ... }` or `50% { ... }`). */
export interface KeyframeRule extends CSSBaseNode {
  readonly type: "KeyframeRule";
  readonly selector: string;
  readonly declarations: ReadonlyArray<Declaration | Comment>;
}

/** A @font-face block. */
export interface FontFace extends CSSBaseNode {
  readonly type: "FontFace";
  readonly declarations: ReadonlyArray<Declaration | Comment>;
}

/** A @layer statement or block. */
export interface LayerStatement extends CSSBaseNode {
  readonly type: "LayerStatement";
  readonly name: string;
  readonly rules?: ReadonlyArray<CSSTopLevelNode>;
}

// ============================================================
// Custom Properties and var()
// ============================================================

/** A CSS custom property declaration: `--my-color: blue`. */
export interface CustomProperty extends CSSBaseNode {
  readonly type: "CustomProperty";
  readonly name: string;
  readonly value: string;
}

/** A var() function reference: `var(--my-color, fallback)`. */
export interface VarFunction extends CSSBaseNode {
  readonly type: "VarFunction";
  readonly name: string;
  readonly fallback?: string;
}

// ============================================================
// Comments
// ============================================================

/** A CSS comment node. */
export interface Comment extends CSSBaseNode {
  readonly type: "Comment";
  readonly value: string;
}
