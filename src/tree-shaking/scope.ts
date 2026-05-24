/**
 * @module tree-shaking/scope
 * @description Scope analysis for tree-shaking. Builds a scope tree from the AST
 * using iterative stack-based traversal, tracking variable declarations, references,
 * and their bindings with correct var/let/const scoping semantics.
 */

import type * as AST from "../ast/types.js";
import { isReference } from "../utils/ast-utils.js";

/** A binding represents a declared name in a scope. */
export interface Binding {
  readonly name: string;
  readonly kind:
    | "var"
    | "let"
    | "const"
    | "function"
    | "class"
    | "param"
    | "import";
  readonly node: AST.BaseNode;
  readonly scope: Scope;
  readonly references: Array<Reference>;
  /** Whether this binding is included in tree-shaking output. Mutable for marking phase. */
  isIncluded: boolean;
}

/** A reference represents a usage of a name in a scope. */
export interface Reference {
  readonly name: string;
  readonly node: AST.BaseNode;
  readonly scope: Scope;
  /** Resolved binding, null if global/unresolved. */
  binding: Binding | null;
}

/**
 * Represents a lexical scope in the scope tree.
 *
 * Mutable properties (children, bindings, references) are documented exceptions
 * required for the iterative scope-building state machine.
 */
export class Scope {
  readonly parent: Scope | null;
  readonly children: Array<Scope>;
  readonly bindings: Map<string, Binding>;
  readonly references: Array<Reference>;
  /** true for block scopes (let/const/class), false for function/module scopes */
  readonly isBlockScope: boolean;

  constructor(parent: Scope | null, isBlockScope: boolean) {
    this.parent = parent;
    this.children = [];
    this.bindings = new Map();
    this.references = [];
    this.isBlockScope = isBlockScope;
    if (parent !== null) {
      parent.children.push(this);
    }
  }

  /**
   * Add a binding to this scope.
   * @param name - The binding name.
   * @param kind - The declaration kind.
   * @param node - The AST node that declares this binding.
   * @returns The created Binding.
   */
  addBinding(name: string, kind: Binding["kind"], node: AST.BaseNode): Binding {
    const binding: Binding = {
      name,
      kind,
      node,
      scope: this,
      references: [],
      isIncluded: false,
    };
    this.bindings.set(name, binding);
    return binding;
  }

  /**
   * Add a reference to this scope.
   * @param name - The referenced name.
   * @param node - The AST node of the reference.
   * @returns The created Reference.
   */
  addReference(name: string, node: AST.BaseNode): Reference {
    const reference: Reference = {
      name,
      node,
      scope: this,
      binding: null,
    };
    this.references.push(reference);
    return reference;
  }

  /**
   * Resolve a name by walking up the scope chain.
   * @param name - The name to resolve.
   * @returns The binding if found, null otherwise.
   */
  resolve(name: string): Binding | null {
    let current: Scope | null = this;
    while (current !== null) {
      const binding = current.bindings.get(name);
      if (binding !== undefined) {
        return binding;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Find the nearest function (non-block) scope by walking up the chain.
   * @returns The nearest function or module scope.
   */
  findFunctionScope(): Scope {
    let current: Scope = this;
    while (current.isBlockScope && current.parent !== null) {
      current = current.parent;
    }
    return current;
  }
}

/** Represents a traversal stack entry with phase tracking. */
interface StackEntry {
  readonly node: AST.BaseNode;
  readonly scope: Scope;
  readonly phase: "enter" | "exit";
  readonly parentNode: AST.BaseNode | null;
}

/**
 * Extract binding names from a pattern node iteratively.
 * @param pattern - The pattern AST node.
 * @returns Array of identifier names declared by the pattern.
 */
const extractPatternNames = (pattern: AST.BaseNode): Array<string> => {
  const names: Array<string> = [];
  const patternStack: Array<AST.BaseNode> = [pattern];

  while (patternStack.length > 0) {
    const current = patternStack.pop()!;

    if (current.type === "Identifier") {
      names.push((current as AST.Identifier).name);
    } else if (current.type === "ObjectPattern") {
      const objPat = current as AST.ObjectPattern;
      for (let i = objPat.properties.length - 1; i >= 0; i--) {
        const prop = objPat.properties[i];
        if (prop.type === "RestElement") {
          patternStack.push((prop as AST.RestElement).argument as AST.BaseNode);
        } else {
          patternStack.push(
            (prop as AST.Property).value as unknown as AST.BaseNode,
          );
        }
      }
    } else if (current.type === "ArrayPattern") {
      const arrPat = current as AST.ArrayPattern;
      for (let i = arrPat.elements.length - 1; i >= 0; i--) {
        const elem = arrPat.elements[i];
        if (elem !== null) {
          patternStack.push(elem as AST.BaseNode);
        }
      }
    } else if (current.type === "RestElement") {
      patternStack.push((current as AST.RestElement).argument as AST.BaseNode);
    } else if (current.type === "AssignmentPattern") {
      patternStack.push(
        (current as AST.AssignmentPattern).left as AST.BaseNode,
      );
    }
  }

  return names;
};

/**
 * Check whether a node creates a new function-level scope.
 */
const isFunctionNode = (node: AST.BaseNode): boolean =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression";

/**
 * Check whether a node creates a new block-level scope.
 */
const isBlockScopeNode = (node: AST.BaseNode): boolean =>
  node.type === "BlockStatement" ||
  node.type === "ForStatement" ||
  node.type === "ForInStatement" ||
  node.type === "ForOfStatement" ||
  node.type === "SwitchStatement";

/**
 * Get child nodes of an AST node for traversal purposes.
 * Returns children in order (will be reversed when pushed to stack).
 */
const getChildNodes = (
  node: AST.BaseNode,
): Array<{ node: AST.BaseNode; parentNode: AST.BaseNode }> => {
  const children: Array<{ node: AST.BaseNode; parentNode: AST.BaseNode }> = [];
  const keys = Object.keys(node);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (
      key === "type" ||
      key === "start" ||
      key === "end" ||
      key === "loc" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    const val = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(val)) {
      for (let j = 0; j < val.length; j++) {
        const item = val[j] as unknown;
        if (
          item !== null &&
          typeof item === "object" &&
          (item as { type?: string }).type !== undefined
        ) {
          children.push({
            node: item as AST.BaseNode,
            parentNode: node,
          });
        }
      }
    } else if (
      val !== null &&
      typeof val === "object" &&
      (val as { type?: string }).type !== undefined
    ) {
      children.push({
        node: val as AST.BaseNode,
        parentNode: node,
      });
    }
  }

  return children;
};

/**
 * Build a scope tree from an AST Program node using iterative stack-based traversal.
 *
 * The traversal processes nodes in two phases:
 * - enter: creates scopes, registers bindings
 * - exit: pops scope context
 *
 * After traversal, all references are resolved against the scope chain.
 *
 * @param ast - The parsed Program AST node.
 * @returns The root module scope with all bindings and references resolved.
 */
export const analyzeScopes = (ast: AST.Program): Scope => {
  const moduleScope = new Scope(null, false);
  const allReferences: Array<Reference> = [];

  // Map nodes that create scopes to their Scope objects for exit phase
  const scopeMap = new Map<AST.BaseNode, Scope>();

  const stack: Array<StackEntry> = [];

  // Push program body in reverse order for correct traversal
  const body = ast.body;
  for (let i = body.length - 1; i >= 0; i--) {
    stack.push({
      node: body[i] as AST.BaseNode,
      scope: moduleScope,
      phase: "enter",
      parentNode: ast as AST.BaseNode,
    });
  }

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const { node, scope, phase, parentNode } = entry;

    if (phase === "exit") {
      // Nothing to do on exit for our iterative approach
      continue;
    }

    // Determine the current scope for this node
    let currentScope = scope;

    // Handle scope-creating nodes
    if (isFunctionNode(node)) {
      const funcScope = new Scope(scope, false);
      scopeMap.set(node, funcScope);

      // Add function name binding to PARENT scope (for declarations)
      // or to the function's own scope (for named expressions)
      if (node.type === "FunctionDeclaration") {
        const funcDecl = node as AST.FunctionDeclaration;
        if (funcDecl.id !== null) {
          scope.addBinding("function", "function", node);
          // Re-add with actual name
          scope.bindings.delete("function");
          scope.addBinding(funcDecl.id.name, "function", node);
        }
      } else if (node.type === "FunctionExpression") {
        const funcExpr = node as AST.FunctionExpression;
        if (funcExpr.id !== null) {
          funcScope.addBinding(funcExpr.id.name, "function", node);
        }
      }

      // Add parameters as bindings in the function scope
      const params = (
        node as
          | AST.FunctionDeclaration
          | AST.FunctionExpression
          | AST.ArrowFunctionExpression
      ).params;
      for (let i = 0; i < params.length; i++) {
        const paramNames = extractPatternNames(params[i] as AST.BaseNode);
        for (let j = 0; j < paramNames.length; j++) {
          funcScope.addBinding(
            paramNames[j],
            "param",
            params[i] as AST.BaseNode,
          );
        }
      }

      // Process function body in the function scope
      if (node.type === "ArrowFunctionExpression") {
        const arrow = node as AST.ArrowFunctionExpression;
        if (arrow.body.type === "BlockStatement") {
          const blockChildren = getChildNodes(arrow.body as AST.BaseNode);
          for (let i = blockChildren.length - 1; i >= 0; i--) {
            stack.push({
              node: blockChildren[i].node,
              scope: funcScope,
              phase: "enter",
              parentNode: arrow.body as AST.BaseNode,
            });
          }
        } else {
          // Expression body
          stack.push({
            node: arrow.body as AST.BaseNode,
            scope: funcScope,
            phase: "enter",
            parentNode: node,
          });
        }
      } else {
        const funcBody = (
          node as AST.FunctionDeclaration | AST.FunctionExpression
        ).body;
        const blockChildren = getChildNodes(funcBody as AST.BaseNode);
        for (let i = blockChildren.length - 1; i >= 0; i--) {
          stack.push({
            node: blockChildren[i].node,
            scope: funcScope,
            phase: "enter",
            parentNode: funcBody as AST.BaseNode,
          });
        }
      }
      continue;
    }

    if (isBlockScopeNode(node) && !isFunctionBodyBlock(node, parentNode)) {
      const blockScope = new Scope(scope, true);
      scopeMap.set(node, blockScope);
      currentScope = blockScope;

      // For for-loops, handle the init declarations in block scope
      if (node.type === "ForStatement") {
        const forNode = node as AST.ForStatement;
        if (
          forNode.init !== null &&
          forNode.init.type === "VariableDeclaration"
        ) {
          const varDecl = forNode.init as AST.VariableDeclaration;
          processVariableDeclaration(varDecl, blockScope);
        }
      } else if (
        node.type === "ForInStatement" ||
        node.type === "ForOfStatement"
      ) {
        const forIn = node as AST.ForInStatement | AST.ForOfStatement;
        if (forIn.left.type === "VariableDeclaration") {
          const varDecl = forIn.left as AST.VariableDeclaration;
          processVariableDeclaration(varDecl, blockScope);
        }
      }

      // Push children with the block scope
      const children = getChildNodes(node);
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({
          node: children[i].node,
          scope: blockScope,
          phase: "enter",
          parentNode: node,
        });
      }
      continue;
    }

    // Handle declarations
    if (node.type === "VariableDeclaration") {
      const varDecl = node as AST.VariableDeclaration;
      processVariableDeclaration(varDecl, currentScope);

      // Still traverse children for references in initializers
      const children = getChildNodes(node);
      for (let i = children.length - 1; i >= 0; i--) {
        // Skip the id patterns in declarators (they're declarations, not references)
        if (children[i].node.type === "VariableDeclarator") {
          const declarator = children[i].node as AST.VariableDeclarator;
          if (declarator.init !== null) {
            stack.push({
              node: declarator.init as AST.BaseNode,
              scope: currentScope,
              phase: "enter",
              parentNode: children[i].node,
            });
          }
        } else {
          stack.push({
            node: children[i].node,
            scope: currentScope,
            phase: "enter",
            parentNode: node,
          });
        }
      }
      continue;
    }

    if (node.type === "ClassDeclaration") {
      const classDecl = node as AST.ClassDeclaration;
      if (classDecl.id !== null) {
        currentScope.addBinding(classDecl.id.name, "class", node);
      }
      // Traverse class body
      const children = getChildNodes(node);
      for (let i = children.length - 1; i >= 0; i--) {
        // Skip the id node
        if (
          children[i].node.type !== "Identifier" ||
          children[i].parentNode !== node
        ) {
          stack.push({
            node: children[i].node,
            scope: currentScope,
            phase: "enter",
            parentNode: node,
          });
        }
      }
      continue;
    }

    if (node.type === "ImportDeclaration") {
      const importDecl = node as AST.ImportDeclaration;
      for (let i = 0; i < importDecl.specifiers.length; i++) {
        const spec = importDecl.specifiers[i];
        moduleScope.addBinding(spec.local.name, "import", spec as AST.BaseNode);
      }
      // No need to traverse further into import declarations
      continue;
    }

    // Handle catch clause
    if (node.type === "CatchClause") {
      const catchClause = node as AST.CatchClause;
      const catchScope = new Scope(currentScope, true);
      scopeMap.set(node, catchScope);

      if (catchClause.param !== null) {
        const paramNames = extractPatternNames(
          catchClause.param as AST.BaseNode,
        );
        for (let i = 0; i < paramNames.length; i++) {
          catchScope.addBinding(
            paramNames[i],
            "param",
            catchClause.param as AST.BaseNode,
          );
        }
      }

      // Traverse catch body in catch scope
      const bodyChildren = getChildNodes(catchClause.body as AST.BaseNode);
      for (let i = bodyChildren.length - 1; i >= 0; i--) {
        stack.push({
          node: bodyChildren[i].node,
          scope: catchScope,
          phase: "enter",
          parentNode: catchClause.body as AST.BaseNode,
        });
      }
      continue;
    }

    // Handle identifiers as references
    if (node.type === "Identifier" && parentNode !== null) {
      const ident = node as AST.Identifier;
      if (
        isReference(
          node as unknown as {
            type: string;
            name?: string;
            computed?: boolean;
            key?: { type: string };
            object?: { type: string };
            property?: { type: string };
            label?: { type: string };
            left?: { type: string };
          },
          parentNode as unknown as {
            type: string;
            name?: string;
            computed?: boolean;
            key?: { type: string };
            object?: { type: string };
            property?: { type: string };
            label?: { type: string };
            left?: { type: string };
          },
        )
      ) {
        // Skip identifiers that are part of declarations we handle above
        if (!isDeclarationId(node, parentNode)) {
          const ref = currentScope.addReference(ident.name, node);
          allReferences.push(ref);
        }
      }
    }

    // Generic traversal for all other nodes
    const children = getChildNodes(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i].node,
        scope: currentScope,
        phase: "enter",
        parentNode: node,
      });
    }
  }

  // Resolve all references
  for (let i = 0; i < allReferences.length; i++) {
    const ref = allReferences[i];
    const binding = ref.scope.resolve(ref.name);
    if (binding !== null) {
      ref.binding = binding;
      binding.references.push(ref);
    }
  }

  return moduleScope;
};

/**
 * Check if a BlockStatement is a function body (not an independent block scope).
 */
const isFunctionBodyBlock = (
  node: AST.BaseNode,
  parent: AST.BaseNode | null,
): boolean => {
  if (node.type !== "BlockStatement") {
    return false;
  }
  if (parent === null) {
    return false;
  }
  return (
    parent.type === "FunctionDeclaration" ||
    parent.type === "FunctionExpression" ||
    parent.type === "ArrowFunctionExpression"
  );
};

/**
 * Check if an identifier node is used as a declaration id.
 */
const isDeclarationId = (
  node: AST.BaseNode,
  parent: AST.BaseNode | null,
): boolean => {
  if (parent === null) {
    return false;
  }
  // ClassExpression ids reach generic traversal (ClassDeclaration handled separately).
  // Function ids and import specifiers are handled with `continue` in their
  // respective branches, so they never reach the generic Identifier handler.
  if (parent.type === "ClassExpression") {
    return (parent as AST.ClassExpression).id === node;
  }
  return false;
};

/**
 * Process a VariableDeclaration, adding bindings to the appropriate scope.
 * var declarations hoist to the nearest function/module scope.
 * let/const declarations stay in the current (block) scope.
 */
const processVariableDeclaration = (
  varDecl: AST.VariableDeclaration,
  currentScope: Scope,
): void => {
  const targetScope =
    varDecl.kind === "var" ? currentScope.findFunctionScope() : currentScope;
  const kind = varDecl.kind as "var" | "let" | "const";

  for (let i = 0; i < varDecl.declarations.length; i++) {
    const declarator = varDecl.declarations[i];
    const names = extractPatternNames(declarator.id as AST.BaseNode);
    for (let j = 0; j < names.length; j++) {
      targetScope.addBinding(names[j], kind, declarator as AST.BaseNode);
    }
  }
};
