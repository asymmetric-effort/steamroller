/**
 * @module tree-shaking/side-effects
 * @description Side effect detection for tree-shaking. Determines which AST nodes
 * have observable effects and cannot be safely removed. Uses iterative stack-based
 * analysis to avoid recursion.
 */

import type * as AST from "../ast/types.js";
import type { Scope } from "./scope.js";

/** Result of side effect analysis for a node. */
export type SideEffectResult = "none" | "possible" | "definite";

/**
 * Set of Object.* methods known to be pure (no observable side effects).
 */
const KNOWN_PURE_OBJECT_METHODS: ReadonlySet<string> = new Set([
  "Object.keys",
  "Object.values",
  "Object.entries",
  "Object.freeze",
  "Object.isFrozen",
  "Object.getOwnPropertyNames",
  "Object.getOwnPropertyDescriptor",
  "Object.getOwnPropertyDescriptors",
  "Object.getPrototypeOf",
  "Object.is",
  "Object.hasOwn",
  "Object.fromEntries",
  "Object.create",
  "Array.isArray",
  "Array.from",
  "Array.of",
  "Math.abs",
  "Math.ceil",
  "Math.floor",
  "Math.round",
  "Math.max",
  "Math.min",
  "Math.pow",
  "Math.sqrt",
  "Math.trunc",
  "Math.sign",
  "Math.random",
  "Number.isFinite",
  "Number.isInteger",
  "Number.isNaN",
  "Number.parseFloat",
  "Number.parseInt",
  "String.fromCharCode",
  "String.fromCodePoint",
  "JSON.stringify",
  "JSON.parse",
]);

/**
 * Combine two side effect results, returning the more severe.
 * @param a - First result.
 * @param b - Second result.
 * @returns The more severe result.
 */
const combineSideEffects = (
  a: SideEffectResult,
  b: SideEffectResult,
): SideEffectResult => {
  if (a === "definite" || b === "definite") {
    return "definite";
  }
  if (a === "possible" || b === "possible") {
    return "possible";
  }
  return "none";
};

/**
 * Extract a dotted name from a member expression chain (e.g., "Object.keys").
 * Returns null if the expression is not a simple static member chain.
 * Uses iterative approach to walk the member expression.
 * @param node - The expression node.
 * @returns The dotted name string, or null.
 */
const extractStaticMemberName = (node: AST.Expression): string | null => {
  if (node.type === "Identifier") {
    return (node as AST.Identifier).name;
  }
  if (node.type !== "MemberExpression") {
    return null;
  }
  const member = node as AST.MemberExpression;
  if (member.computed) {
    return null;
  }
  if (member.property.type !== "Identifier") {
    return null;
  }
  const parts: Array<string> = [];
  let current: AST.Expression | AST.Super = member.property;
  parts.push((current as AST.Identifier).name);

  let obj: AST.Expression | AST.Super = member.object;
  while (obj.type === "MemberExpression") {
    const m = obj as AST.MemberExpression;
    if (m.computed || m.property.type !== "Identifier") {
      return null;
    }
    parts.push((m.property as AST.Identifier).name);
    obj = m.object;
  }
  if (obj.type === "Identifier") {
    parts.push((obj as AST.Identifier).name);
    parts.reverse();
    return parts.join(".");
  }
  return null;
};

/**
 * Check if a function call is known to be pure.
 * @param callee - The callee expression.
 * @param scope - The current scope.
 * @param manualPureFunctions - User-specified list of pure function names.
 * @returns true if the call is known to be pure.
 */
export const isKnownPureCall = (
  callee: AST.Expression,
  scope: Scope,
  manualPureFunctions: ReadonlyArray<string>,
): boolean => {
  const name = extractStaticMemberName(callee);
  if (name === null) {
    return false;
  }

  // Check built-in pure methods
  if (KNOWN_PURE_OBJECT_METHODS.has(name)) {
    return true;
  }

  // Check manual pure functions list
  for (let i = 0; i < manualPureFunctions.length; i++) {
    if (manualPureFunctions[i] === name) {
      return true;
    }
  }

  // Check if the callee resolves to a binding that is a simple function
  if (callee.type === "Identifier") {
    const binding = scope.resolve((callee as AST.Identifier).name);
    if (binding !== null && binding.kind === "import") {
      // Import bindings may be pure, but we can't know without module info
      return false;
    }
  }

  return false;
};

/** Work item for iterative expression side-effect analysis. */
interface ExpressionWorkItem {
  readonly node: AST.Expression;
}

/**
 * Determine if an expression has side effects using iterative stack-based analysis.
 * @param node - The expression AST node.
 * @param scope - The current scope.
 * @param pureAnnotations - Set of start positions with PURE annotations.
 * @returns The side effect classification.
 */
export const hasExpressionSideEffects = (
  node: AST.Expression,
  scope: Scope,
  pureAnnotations: ReadonlySet<number>,
): SideEffectResult => {
  const workStack: Array<ExpressionWorkItem> = [{ node }];
  let result: SideEffectResult = "none";

  while (workStack.length > 0) {
    // Short-circuit: if already definite, no need to check more
    if (result === "definite") {
      return "definite";
    }

    const item = workStack.pop()!;
    const current = item.node;

    switch (current.type) {
      // Pure expressions - no side effects
      case "Identifier":
      case "Literal":
      case "ThisExpression":
      case "MetaProperty":
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        // These are always pure - they define a value without executing
        break;

      case "TemplateLiteral": {
        // Template literals without tags are pure if their expressions are pure
        const tmpl = current as AST.TemplateLiteral;
        for (let i = tmpl.expressions.length - 1; i >= 0; i--) {
          workStack.push({ node: tmpl.expressions[i] });
        }
        break;
      }

      case "TaggedTemplateExpression": {
        // Tagged templates call the tag function - side effect
        result = combineSideEffects(result, "definite");
        break;
      }

      case "ArrayExpression": {
        const arr = current as AST.ArrayExpression;
        for (let i = arr.elements.length - 1; i >= 0; i--) {
          const elem = arr.elements[i];
          if (elem !== null && elem.type !== "SpreadElement") {
            workStack.push({ node: elem as AST.Expression });
          } else if (elem !== null && elem.type === "SpreadElement") {
            // Spread triggers iteration - possible side effect
            result = combineSideEffects(result, "possible");
            workStack.push({ node: (elem as AST.SpreadElement).argument });
          }
        }
        break;
      }

      case "ObjectExpression": {
        const obj = current as AST.ObjectExpression;
        for (let i = obj.properties.length - 1; i >= 0; i--) {
          const prop = obj.properties[i];
          if (prop.type === "SpreadElement") {
            result = combineSideEffects(result, "possible");
            workStack.push({ node: (prop as AST.SpreadElement).argument });
          } else {
            const p = prop as AST.Property;
            if (p.computed) {
              workStack.push({ node: p.key });
            }
            if (p.kind === "get" || p.kind === "set") {
              // Getter/setter definitions themselves don't have side effects
              break;
            }
            workStack.push({ node: p.value as AST.Expression });
          }
        }
        break;
      }

      case "ClassExpression": {
        const cls = current as AST.ClassExpression;
        // Class decorators have side effects
        if (cls.decorators.length > 0) {
          result = combineSideEffects(result, "definite");
          break;
        }
        // Super class expression may have side effects
        if (cls.superClass !== null) {
          workStack.push({ node: cls.superClass });
        }
        // Static property initializers and computed keys may have side effects
        const body = cls.body.body;
        for (let i = body.length - 1; i >= 0; i--) {
          const member = body[i];
          if (member.type === "PropertyDefinition") {
            const propDef = member as AST.PropertyDefinition;
            if (propDef.decorators.length > 0) {
              result = combineSideEffects(result, "definite");
            }
            if (propDef.static && propDef.value !== null) {
              workStack.push({ node: propDef.value });
            }
            if (propDef.computed) {
              workStack.push({ node: propDef.key });
            }
          } else if (member.type === "StaticBlock") {
            // Static blocks execute at class evaluation
            result = combineSideEffects(result, "definite");
          } else if (member.type === "MethodDefinition") {
            const methDef = member as AST.MethodDefinition;
            if (methDef.decorators.length > 0) {
              result = combineSideEffects(result, "definite");
            }
            if (methDef.computed) {
              workStack.push({ node: methDef.key });
            }
          }
        }
        break;
      }

      case "SequenceExpression": {
        const seq = current as AST.SequenceExpression;
        for (let i = seq.expressions.length - 1; i >= 0; i--) {
          workStack.push({ node: seq.expressions[i] });
        }
        break;
      }

      case "UnaryExpression": {
        const unary = current as AST.UnaryExpression;
        if (unary.operator === "delete") {
          result = combineSideEffects(result, "definite");
        } else {
          // typeof, void, !, ~, +, - are pure on their argument
          workStack.push({ node: unary.argument });
        }
        break;
      }

      case "BinaryExpression": {
        const binary = current as AST.BinaryExpression;
        workStack.push({ node: binary.left });
        workStack.push({ node: binary.right });
        break;
      }

      case "LogicalExpression": {
        const logical = current as AST.LogicalExpression;
        workStack.push({ node: logical.left });
        workStack.push({ node: logical.right });
        break;
      }

      case "ConditionalExpression": {
        const cond = current as AST.ConditionalExpression;
        workStack.push({ node: cond.test });
        workStack.push({ node: cond.consequent });
        workStack.push({ node: cond.alternate });
        break;
      }

      case "AssignmentExpression": {
        result = combineSideEffects(result, "definite");
        break;
      }

      case "UpdateExpression": {
        result = combineSideEffects(result, "definite");
        break;
      }

      case "YieldExpression": {
        result = combineSideEffects(result, "definite");
        break;
      }

      case "AwaitExpression": {
        result = combineSideEffects(result, "definite");
        break;
      }

      case "ImportExpression": {
        // Dynamic import has side effects (triggers module loading)
        result = combineSideEffects(result, "definite");
        break;
      }

      case "NewExpression": {
        const newExpr = current as AST.NewExpression;
        // Check for PURE annotation
        if (pureAnnotations.has(newExpr.start)) {
          break;
        }
        result = combineSideEffects(result, "definite");
        break;
      }

      case "CallExpression": {
        const call = current as AST.CallExpression;
        // Check for PURE annotation
        if (pureAnnotations.has(call.start)) {
          break;
        }
        // Check if the callee is a known pure function
        if (
          call.callee.type !== "Super" &&
          isKnownPureCall(call.callee as AST.Expression, scope, [])
        ) {
          // Still need to check arguments for side effects
          for (let i = call.arguments.length - 1; i >= 0; i--) {
            const arg = call.arguments[i];
            if (arg.type === "SpreadElement") {
              result = combineSideEffects(result, "possible");
              workStack.push({ node: (arg as AST.SpreadElement).argument });
            } else {
              workStack.push({ node: arg as AST.Expression });
            }
          }
          break;
        }
        result = combineSideEffects(result, "definite");
        break;
      }

      case "MemberExpression": {
        // Property access could trigger a getter
        result = combineSideEffects(result, "possible");
        break;
      }

      case "ChainExpression": {
        const chain = current as AST.ChainExpression;
        workStack.push({ node: chain.expression });
        break;
      }

      default:
        // Unknown expression type - assume possible side effects
        result = combineSideEffects(result, "possible");
        break;
    }
  }

  return result;
};

/**
 * Determine if a statement has side effects.
 * @param node - The statement AST node.
 * @param scope - The current scope.
 * @param pureAnnotations - Set of start positions with PURE annotations.
 * @returns The side effect classification.
 */
export const hasStatementSideEffects = (
  node: AST.Statement,
  scope: Scope,
  pureAnnotations: ReadonlySet<number>,
): SideEffectResult => {
  switch (node.type) {
    case "EmptyStatement":
    case "DebuggerStatement":
      return "none";

    case "ExpressionStatement": {
      const exprStmt = node as AST.ExpressionStatement;
      // Directive prologues (like "use strict") have no runtime side effects
      if (exprStmt.directive !== undefined) {
        return "none";
      }
      return hasExpressionSideEffects(
        exprStmt.expression,
        scope,
        pureAnnotations,
      );
    }

    case "VariableDeclaration": {
      const varDecl = node as AST.VariableDeclaration;
      let result: SideEffectResult = "none";
      for (let i = 0; i < varDecl.declarations.length; i++) {
        const declarator = varDecl.declarations[i];
        if (declarator.init !== null) {
          const initResult = hasExpressionSideEffects(
            declarator.init,
            scope,
            pureAnnotations,
          );
          result = combineSideEffects(result, initResult);
        }
      }
      return result;
    }

    case "FunctionDeclaration":
      // Function declarations don't execute, they just define
      return "none";

    case "ClassDeclaration": {
      const classDecl = node as AST.ClassDeclaration;
      // Decorators cause side effects
      if (classDecl.decorators.length > 0) {
        return "definite";
      }
      // Super class expression may have side effects
      if (classDecl.superClass !== null) {
        const superResult = hasExpressionSideEffects(
          classDecl.superClass,
          scope,
          pureAnnotations,
        );
        if (superResult !== "none") {
          return superResult;
        }
      }
      // Static properties and computed keys
      const body = classDecl.body.body;
      let result: SideEffectResult = "none";
      for (let i = 0; i < body.length; i++) {
        const member = body[i];
        if (member.type === "PropertyDefinition") {
          const propDef = member as AST.PropertyDefinition;
          if (propDef.decorators.length > 0) {
            return "definite";
          }
          if (propDef.static && propDef.value !== null) {
            const valResult = hasExpressionSideEffects(
              propDef.value,
              scope,
              pureAnnotations,
            );
            result = combineSideEffects(result, valResult);
          }
          if (propDef.computed) {
            const keyResult = hasExpressionSideEffects(
              propDef.key,
              scope,
              pureAnnotations,
            );
            result = combineSideEffects(result, keyResult);
          }
        } else if (member.type === "StaticBlock") {
          return "definite";
        } else if (member.type === "MethodDefinition") {
          const methDef = member as AST.MethodDefinition;
          if (methDef.decorators.length > 0) {
            return "definite";
          }
          if (methDef.computed) {
            const keyResult = hasExpressionSideEffects(
              methDef.key,
              scope,
              pureAnnotations,
            );
            result = combineSideEffects(result, keyResult);
          }
        }
      }
      return result;
    }

    case "ReturnStatement":
    case "ThrowStatement":
    case "BreakStatement":
    case "ContinueStatement":
      // Flow control statements are side effects (they alter program flow)
      return "definite";

    case "IfStatement": {
      const ifStmt = node as AST.IfStatement;
      const testResult = hasExpressionSideEffects(
        ifStmt.test,
        scope,
        pureAnnotations,
      );
      if (testResult === "definite") {
        return "definite";
      }
      const consequentResult = hasStatementSideEffects(
        ifStmt.consequent,
        scope,
        pureAnnotations,
      );
      let altResult: SideEffectResult = "none";
      if (ifStmt.alternate !== null) {
        altResult = hasStatementSideEffects(
          ifStmt.alternate,
          scope,
          pureAnnotations,
        );
      }
      return combineSideEffects(
        testResult,
        combineSideEffects(consequentResult, altResult),
      );
    }

    case "WhileStatement": {
      const whileStmt = node as AST.WhileStatement;
      const testResult = hasExpressionSideEffects(
        whileStmt.test,
        scope,
        pureAnnotations,
      );
      const bodyResult = hasStatementSideEffects(
        whileStmt.body,
        scope,
        pureAnnotations,
      );
      return combineSideEffects(testResult, bodyResult);
    }

    case "DoWhileStatement": {
      const doWhileStmt = node as AST.DoWhileStatement;
      const testResult = hasExpressionSideEffects(
        doWhileStmt.test,
        scope,
        pureAnnotations,
      );
      const bodyResult = hasStatementSideEffects(
        doWhileStmt.body,
        scope,
        pureAnnotations,
      );
      return combineSideEffects(testResult, bodyResult);
    }

    case "ForStatement": {
      const forStmt = node as AST.ForStatement;
      let result: SideEffectResult = "none";
      if (forStmt.init !== null) {
        if (forStmt.init.type === "VariableDeclaration") {
          result = hasStatementSideEffects(
            forStmt.init as AST.VariableDeclaration,
            scope,
            pureAnnotations,
          );
        } else {
          result = hasExpressionSideEffects(
            forStmt.init as AST.Expression,
            scope,
            pureAnnotations,
          );
        }
      }
      if (forStmt.test !== null) {
        result = combineSideEffects(
          result,
          hasExpressionSideEffects(forStmt.test, scope, pureAnnotations),
        );
      }
      if (forStmt.update !== null) {
        result = combineSideEffects(
          result,
          hasExpressionSideEffects(forStmt.update, scope, pureAnnotations),
        );
      }
      result = combineSideEffects(
        result,
        hasStatementSideEffects(forStmt.body, scope, pureAnnotations),
      );
      return result;
    }

    case "ForInStatement":
    case "ForOfStatement":
      // for-in/for-of iterate and assign - definite side effect
      return "definite";

    case "SwitchStatement": {
      const switchStmt = node as AST.SwitchStatement;
      let result: SideEffectResult = hasExpressionSideEffects(
        switchStmt.discriminant,
        scope,
        pureAnnotations,
      );
      for (let i = 0; i < switchStmt.cases.length; i++) {
        const c = switchStmt.cases[i];
        if (c.test !== null) {
          result = combineSideEffects(
            result,
            hasExpressionSideEffects(c.test, scope, pureAnnotations),
          );
        }
        for (let j = 0; j < c.consequent.length; j++) {
          result = combineSideEffects(
            result,
            hasStatementSideEffects(c.consequent[j], scope, pureAnnotations),
          );
        }
      }
      return result;
    }

    case "TryStatement": {
      // Try blocks imply error handling = possible side effects
      return "possible";
    }

    case "BlockStatement": {
      const block = node as AST.BlockStatement;
      let result: SideEffectResult = "none";
      for (let i = 0; i < block.body.length; i++) {
        result = combineSideEffects(
          result,
          hasStatementSideEffects(block.body[i], scope, pureAnnotations),
        );
        if (result === "definite") {
          return "definite";
        }
      }
      return result;
    }

    case "LabeledStatement": {
      const labeled = node as AST.LabeledStatement;
      return hasStatementSideEffects(labeled.body, scope, pureAnnotations);
    }

    case "WithStatement": {
      // With statements modify scope resolution - definite side effect
      return "definite";
    }

    default:
      return "possible";
  }
};

/**
 * Analyze a module for top-level side effects.
 * @param ast - The parsed Program AST node.
 * @param scope - The module scope.
 * @param pureAnnotations - Set of start positions with PURE annotations.
 * @param manualPureFunctions - User-specified list of pure function names.
 * @returns Analysis result with side effect flag and the nodes that have side effects.
 */
export const analyzeModuleSideEffects = (
  ast: AST.Program,
  scope: Scope,
  pureAnnotations: ReadonlySet<number>,
  manualPureFunctions: ReadonlyArray<string>,
): {
  readonly hasSideEffects: boolean;
  readonly sideEffectNodes: ReadonlyArray<AST.BaseNode>;
} => {
  const sideEffectNodes: Array<AST.BaseNode> = [];

  for (let i = 0; i < ast.body.length; i++) {
    const stmt = ast.body[i];

    // Skip import/export declarations (they are module structure, not side effects)
    if (
      stmt.type === "ImportDeclaration" ||
      stmt.type === "ExportAllDeclaration"
    ) {
      continue;
    }

    // ExportNamedDeclaration may wrap a declaration with side effects
    if (stmt.type === "ExportNamedDeclaration") {
      const exportDecl = stmt as AST.ExportNamedDeclaration;
      if (exportDecl.declaration !== null) {
        const declResult = hasStatementSideEffects(
          exportDecl.declaration as AST.Statement,
          scope,
          pureAnnotations,
        );
        if (declResult !== "none") {
          sideEffectNodes.push(stmt);
        }
      }
      continue;
    }

    // ExportDefaultDeclaration may have side-effectful expression
    if (stmt.type === "ExportDefaultDeclaration") {
      const exportDefault = stmt as AST.ExportDefaultDeclaration;
      const decl = exportDefault.declaration;
      if (
        decl.type === "FunctionDeclaration" ||
        decl.type === "ClassDeclaration"
      ) {
        const declResult = hasStatementSideEffects(
          decl as AST.Statement,
          scope,
          pureAnnotations,
        );
        if (declResult !== "none") {
          sideEffectNodes.push(stmt);
        }
      } else {
        // Expression
        const exprResult = hasExpressionSideEffects(
          decl as AST.Expression,
          scope,
          pureAnnotations,
        );
        if (exprResult !== "none") {
          sideEffectNodes.push(stmt);
        }
      }
      continue;
    }

    // Regular statements
    const stmtResult = hasStatementSideEffects(
      stmt as AST.Statement,
      scope,
      pureAnnotations,
    );
    if (stmtResult !== "none") {
      sideEffectNodes.push(stmt);
    }
  }

  return { hasSideEffects: sideEffectNodes.length > 0, sideEffectNodes };
};
