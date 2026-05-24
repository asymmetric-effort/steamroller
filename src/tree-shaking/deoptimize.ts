/**
 * @module tree-shaking/deoptimize
 * @description Deoptimization detection for tree-shaking. When eval() or arguments
 * are used in a scope, all bindings in that scope (and parent scopes for eval) must
 * be preserved, preventing tree-shaking of those bindings.
 *
 * Uses iterative stack-based AST traversal to detect these patterns without recursion.
 */

import type * as AST from "../ast/types.js";
import type { Scope, Binding } from "./scope.js";

/** Reason a scope was deoptimized. */
export type DeoptimizationReason = "eval" | "arguments";

/** Result of deoptimization analysis for a module. */
export interface DeoptimizationResult {
  readonly hasEval: boolean;
  readonly hasArguments: boolean;
  readonly deoptimizedScopes: ReadonlyArray<{
    readonly scope: Scope;
    readonly reason: DeoptimizationReason;
  }>;
}

/**
 * Detect whether an AST contains any direct eval() calls.
 * Uses iterative stack-based traversal.
 *
 * @param ast - The parsed Program AST node.
 * @returns true if a direct eval() call is found.
 */
export const detectEvalUsage = (ast: AST.Program): boolean => {
  const stack: Array<AST.BaseNode> = [];

  for (let i = ast.body.length - 1; i >= 0; i--) {
    stack.push(ast.body[i] as AST.BaseNode);
  }

  while (stack.length > 0) {
    const node = stack.pop()!;

    // Check for direct eval() call: CallExpression with Identifier callee named "eval"
    if (node.type === "CallExpression") {
      const call = node as unknown as {
        readonly callee: AST.BaseNode;
        readonly arguments: ReadonlyArray<AST.BaseNode>;
      };
      if (
        call.callee.type === "Identifier" &&
        (call.callee as unknown as AST.Identifier).name === "eval"
      ) {
        return true;
      }
    }

    // Push child nodes onto stack
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === "type" || key === "start" || key === "end" || key === "loc") {
        continue;
      }
      const val = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (let j = val.length - 1; j >= 0; j--) {
          const item = val[j] as unknown;
          if (
            item !== null &&
            typeof item === "object" &&
            (item as { type?: string }).type !== undefined
          ) {
            stack.push(item as AST.BaseNode);
          }
        }
      } else if (
        val !== null &&
        typeof val === "object" &&
        (val as { type?: string }).type !== undefined
      ) {
        stack.push(val as AST.BaseNode);
      }
    }
  }

  return false;
};

/**
 * Detect whether an AST contains any references to `arguments` inside
 * non-arrow function bodies. Arrow functions do not have their own `arguments`.
 * Uses iterative stack-based traversal.
 *
 * @param ast - The parsed Program AST node.
 * @returns true if `arguments` is referenced in a non-arrow function.
 */
export const detectArgumentsUsage = (ast: AST.Program): boolean => {
  /** Stack entry tracks whether we are inside a non-arrow function. */
  interface TraversalEntry {
    readonly node: AST.BaseNode;
    readonly inNonArrowFunction: boolean;
  }

  const stack: Array<TraversalEntry> = [];

  for (let i = ast.body.length - 1; i >= 0; i--) {
    stack.push({
      node: ast.body[i] as AST.BaseNode,
      inNonArrowFunction: false,
    });
  }

  while (stack.length > 0) {
    const { node, inNonArrowFunction } = stack.pop()!;

    // Check for `arguments` identifier inside a non-arrow function
    if (
      node.type === "Identifier" &&
      (node as unknown as AST.Identifier).name === "arguments" &&
      inNonArrowFunction
    ) {
      return true;
    }

    // Determine context for children
    let childContext = inNonArrowFunction;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression"
    ) {
      childContext = true;
    } else if (node.type === "ArrowFunctionExpression") {
      // Arrow functions inherit parent's arguments context, don't set new one
      childContext = false;
    }

    // Push child nodes
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === "type" || key === "start" || key === "end" || key === "loc") {
        continue;
      }
      const val = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (let j = val.length - 1; j >= 0; j--) {
          const item = val[j] as unknown;
          if (
            item !== null &&
            typeof item === "object" &&
            (item as { type?: string }).type !== undefined
          ) {
            stack.push({
              node: item as AST.BaseNode,
              inNonArrowFunction: childContext,
            });
          }
        }
      } else if (
        val !== null &&
        typeof val === "object" &&
        (val as { type?: string }).type !== undefined
      ) {
        stack.push({
          node: val as AST.BaseNode,
          inNonArrowFunction: childContext,
        });
      }
    }
  }

  return false;
};

/**
 * Mark all bindings in a scope as included (cannot be tree-shaken).
 * When reason is "eval", also marks all parent scope bindings.
 * When reason is "arguments", only marks the given scope's bindings.
 *
 * @param scope - The scope to deoptimize.
 * @param reason - The reason for deoptimization.
 */
export const deoptimizeScope = (
  scope: Scope,
  reason: DeoptimizationReason,
): void => {
  if (reason === "eval") {
    // eval can access any binding in the current scope and all parent scopes
    let current: Scope | null = scope;
    while (current !== null) {
      const bindings: IterableIterator<Binding> = current.bindings.values();
      let entry = bindings.next();
      while (!entry.done) {
        entry.value.isIncluded = true;
        entry = bindings.next();
      }
      current = current.parent;
    }
  } else {
    // arguments: only the current function scope's parameter bindings
    const bindings: IterableIterator<Binding> = scope.bindings.values();
    let entry = bindings.next();
    while (!entry.done) {
      entry.value.isIncluded = true;
      entry = bindings.next();
    }
  }
};
