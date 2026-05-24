/**
 * @module module/Module
 * @description Core module representation for the bundler's module graph.
 * Tracks imports, exports, dependencies, and metadata for each module.
 *
 * NOTE: This class has mutable state (dependencies, isIncluded, etc.) as a
 * documented exception for the graph-building state machine.
 */

import type { ProgramNode } from "../ast/types.js";
import type {
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Identifier,
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportExpression,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Literal,
  ModuleDeclaration,
  Statement,
} from "../ast/types.js";
import type { ModuleInfo, ResolvedId } from "../types.js";
import type { ExternalModule } from "./ExternalModule.js";

/** Describes a single import statement and its specifiers. */
export interface ImportDescriptor {
  readonly source: string;
  readonly specifiers: ReadonlyArray<{
    readonly type: "default" | "named" | "namespace";
    readonly imported: string;
    readonly local: string;
  }>;
  readonly attributes: Readonly<Record<string, string>>;
}

/** Describes a single export from the module. */
export interface ExportDescriptor {
  readonly type: "named" | "default" | "all" | "allAs";
  readonly local?: string;
  readonly exported?: string;
  readonly source?: string;
}

/**
 * Represents an internal (non-external) module in the module graph.
 *
 * Mutable properties are documented exceptions required for the
 * graph-building state machine pattern.
 */
export class Module {
  readonly id: string;

  /** The module source code. Mutated during transform phase. */
  code: string;

  /** Parsed AST. Set after parsing, null before. */
  ast: ProgramNode | null;

  /** Set of modules this module directly depends on. */
  readonly dependencies: Set<Module | ExternalModule>;

  /** Set of modules that import this module. */
  readonly importers: Set<Module>;

  /** Parsed import descriptors extracted from the AST. */
  readonly imports: Array<ImportDescriptor>;

  /** Parsed export descriptors extracted from the AST. */
  readonly exports: Array<ExportDescriptor>;

  /** Dynamic import sources discovered in the AST. */
  readonly dynamicImports: Array<string>;

  /** Whether this module is an entry point. */
  isEntry: boolean;

  /** Whether this module is included after tree-shaking. */
  isIncluded: boolean;

  /** Import attributes (e.g., { type: "json" }). */
  readonly attributes: Readonly<Record<string, string>>;

  /** Plugin-provided metadata. */
  readonly meta: Record<string, unknown>;

  /** Synthetic named exports configuration. */
  syntheticNamedExports: boolean | string;

  /** Whether this module has a default export. */
  hasDefaultExport: boolean;

  /** Side effects configuration for tree-shaking. */
  moduleSideEffects: boolean | "no-treeshake";

  constructor(id: string, code: string, isEntry: boolean) {
    this.id = id;
    this.code = code;
    this.ast = null;
    this.dependencies = new Set();
    this.importers = new Set();
    this.imports = [];
    this.exports = [];
    this.dynamicImports = [];
    this.isEntry = isEntry;
    this.isIncluded = false;
    this.attributes = {};
    this.meta = {};
    this.syntheticNamedExports = false;
    this.hasDefaultExport = false;
    this.moduleSideEffects = true;
  }

  /** Extract import and export descriptors from the AST. */
  extractImportsExports(): void {
    if (this.ast === null) {
      return;
    }

    this.imports.length = 0;
    this.exports.length = 0;
    this.dynamicImports.length = 0;

    const body = this.ast.body;
    for (let i = 0; i < body.length; i++) {
      const node = body[i] as Statement | ModuleDeclaration;
      if (node.type === "ImportDeclaration") {
        this.processImportDeclaration(node as ImportDeclaration);
      } else if (node.type === "ExportNamedDeclaration") {
        this.processExportNamedDeclaration(node as ExportNamedDeclaration);
      } else if (node.type === "ExportDefaultDeclaration") {
        this.processExportDefaultDeclaration(node as ExportDefaultDeclaration);
      } else if (node.type === "ExportAllDeclaration") {
        this.processExportAllDeclaration(node as ExportAllDeclaration);
      }
    }

    this.extractDynamicImports(body);
    this.hasDefaultExport = this.exports.some((e) => e.type === "default");
  }

  /** Convert to ModuleInfo for plugin API compatibility. */
  toModuleInfo(): ModuleInfo {
    const importedIds: Array<string> = [];
    const importedIdResolutions: Array<ResolvedId> = [];

    for (const imp of this.imports) {
      importedIds.push(imp.source);
      importedIdResolutions.push({
        id: imp.source,
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "steamroller",
      });
    }

    const importerIds: Array<string> = [];
    for (const importer of this.importers) {
      importerIds.push(importer.id);
    }

    const exportedBindings: Record<string, Array<string>> = {};
    const exportNames: Array<string> = [];
    for (const exp of this.exports) {
      const key = exp.source ?? ".";
      if (exportedBindings[key] === undefined) {
        exportedBindings[key] = [];
      }
      const name =
        exp.type === "default"
          ? "default"
          : exp.type === "all"
            ? "*"
            : (exp.exported ?? exp.local ?? "*");
      exportedBindings[key].push(name);
      exportNames.push(name);
    }

    return {
      id: this.id,
      code: this.code,
      ast: this.ast,
      isEntry: this.isEntry,
      isExternal: false,
      isIncluded: this.isIncluded,
      importedIds,
      importedIdResolutions,
      dynamicallyImportedIds: [...this.dynamicImports],
      dynamicallyImportedIdResolutions: this.dynamicImports.map((source) => ({
        id: source,
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "steamroller",
      })),
      importers: importerIds,
      dynamicImporters: [],
      exportedBindings,
      exports: exportNames,
      hasDefaultExport: this.hasDefaultExport,
      meta: { ...this.meta },
      syntheticNamedExports: this.syntheticNamedExports,
      moduleSideEffects: this.moduleSideEffects,
    };
  }

  private processImportDeclaration(node: ImportDeclaration): void {
    const source = String(node.source.value);
    const specifiers: Array<{
      readonly type: "default" | "named" | "namespace";
      readonly imported: string;
      readonly local: string;
    }> = [];

    for (let j = 0; j < node.specifiers.length; j++) {
      const spec = node.specifiers[j];
      if (spec.type === "ImportDefaultSpecifier") {
        const defaultSpec = spec as ImportDefaultSpecifier;
        specifiers.push({
          type: "default",
          imported: "default",
          local: defaultSpec.local.name,
        });
      } else if (spec.type === "ImportNamespaceSpecifier") {
        const nsSpec = spec as ImportNamespaceSpecifier;
        specifiers.push({
          type: "namespace",
          imported: "*",
          local: nsSpec.local.name,
        });
      } else if (spec.type === "ImportSpecifier") {
        const namedSpec = spec as ImportSpecifier;
        const imported =
          namedSpec.imported.type === "Identifier"
            ? (namedSpec.imported as Identifier).name
            : String((namedSpec.imported as Literal).value);
        specifiers.push({
          type: "named",
          imported,
          local: namedSpec.local.name,
        });
      }
    }

    this.imports.push({
      source,
      specifiers,
      attributes: {},
    });
  }

  private processExportNamedDeclaration(node: ExportNamedDeclaration): void {
    if (node.declaration !== null) {
      if (node.declaration.type === "VariableDeclaration") {
        for (let k = 0; k < node.declaration.declarations.length; k++) {
          const decl = node.declaration.declarations[k];
          if (decl.id.type === "Identifier") {
            const name = (decl.id as Identifier).name;
            this.exports.push({
              type: "named",
              local: name,
              exported: name,
              source: node.source ? String(node.source.value) : undefined,
            });
          }
        }
      } else if (
        node.declaration.type === "FunctionDeclaration" ||
        node.declaration.type === "ClassDeclaration"
      ) {
        const declId = node.declaration.id;
        if (declId !== null) {
          const name = declId.name;
          this.exports.push({
            type: "named",
            local: name,
            exported: name,
            source: node.source ? String(node.source.value) : undefined,
          });
        }
      }
    }

    for (let k = 0; k < node.specifiers.length; k++) {
      const spec = node.specifiers[k] as ExportSpecifier;
      const local =
        spec.local.type === "Identifier"
          ? (spec.local as Identifier).name
          : String((spec.local as Literal).value);
      const exported =
        spec.exported.type === "Identifier"
          ? (spec.exported as Identifier).name
          : String((spec.exported as Literal).value);
      this.exports.push({
        type: "named",
        local,
        exported,
        source: node.source ? String(node.source.value) : undefined,
      });
    }
  }

  private processExportDefaultDeclaration(
    _node: ExportDefaultDeclaration,
  ): void {
    this.exports.push({
      type: "default",
      local: "default",
      exported: "default",
    });
  }

  private processExportAllDeclaration(node: ExportAllDeclaration): void {
    const source = String(node.source.value);
    if (node.exported !== null) {
      const exported =
        node.exported.type === "Identifier"
          ? (node.exported as Identifier).name
          : String((node.exported as Literal).value);
      this.exports.push({
        type: "allAs",
        exported,
        source,
      });
    } else {
      this.exports.push({
        type: "all",
        source,
      });
    }
  }

  private extractDynamicImports(
    body: ReadonlyArray<Statement | ModuleDeclaration>,
  ): void {
    // Iterative traversal using an explicit stack
    // Only objects with a `type` property are pushed (see filter below),
    // so each popped value is guaranteed to be a non-null object.
    const stack: Array<Record<string, unknown>> = [
      ...(body as unknown as ReadonlyArray<Record<string, unknown>>),
    ];
    while (stack.length > 0) {
      const current = stack.pop()!;

      if ((current as { type?: string }).type === "ImportExpression") {
        const importExpr = current as unknown as ImportExpression;
        if (importExpr.source.type === "Literal") {
          const lit = importExpr.source as Literal;
          if (typeof lit.value === "string") {
            this.dynamicImports.push(lit.value);
          }
        }
      }

      const keys = Object.keys(current);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (
          key === "type" ||
          key === "start" ||
          key === "end" ||
          key === "loc"
        ) {
          continue;
        }
        const val = current[key];
        if (Array.isArray(val)) {
          for (let j = 0; j < val.length; j++) {
            const item = val[j] as unknown;
            if (
              item !== null &&
              typeof item === "object" &&
              (item as { type?: string }).type !== undefined
            ) {
              stack.push(item as Record<string, unknown>);
            }
          }
        } else if (
          val !== null &&
          typeof val === "object" &&
          (val as { type?: string }).type !== undefined
        ) {
          stack.push(val as Record<string, unknown>);
        }
      }
    }
  }
}
