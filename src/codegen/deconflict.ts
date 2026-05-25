// JS reserved words and common globals to avoid
const RESERVED = new Set([
  "break",
  "case",
  "catch",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "class",
  "const",
  "enum",
  "export",
  "extends",
  "import",
  "super",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "await",
]);

const GLOBALS = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "arguments",
  "eval",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Error",
  "Promise",
  "JSON",
  "Math",
  "Date",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Proxy",
  "Reflect",
  "console",
  "globalThis",
]);

const FORMAT_GLOBALS: Readonly<Record<string, ReadonlySet<string>>> = {
  cjs: new Set(["exports", "module", "require", "__filename", "__dirname"]),
  amd: new Set(["define", "require"]),
  iife: new Set([]),
  umd: new Set(["exports", "module", "require", "define"]),
  system: new Set(["System"]),
  es: new Set([]),
};

export interface ModuleBindings {
  readonly moduleId: string;
  readonly names: ReadonlyArray<string>;
}

export interface DeconflictionResult {
  readonly renames: ReadonlyMap<string, Map<string, string>>;
  readonly allNames: ReadonlySet<string>;
}

// Generate unique name by appending $1, $2, etc.
export const generateUniqueName = (
  base: string,
  usedNames: ReadonlySet<string>,
): string => {
  let counter = 1;
  let candidate = `${base}$${counter}`;
  while (usedNames.has(candidate)) {
    counter++;
    candidate = `${base}$${counter}`;
  }
  return candidate;
};

// Deconflict variable names across modules in a chunk
export const deconflictChunk = (
  moduleBindings: ReadonlyArray<ModuleBindings>,
  format: string,
): DeconflictionResult => {
  const usedNames = new Set<string>([
    ...RESERVED,
    ...GLOBALS,
    ...(FORMAT_GLOBALS[format] ?? []),
  ]);
  const renames = new Map<string, Map<string, string>>();

  // First pass: collect all names and detect collisions
  const nameCounts = new Map<string, number>();
  for (const mod of moduleBindings) {
    for (const name of mod.names) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
  }

  // Second pass: rename collisions
  for (const mod of moduleBindings) {
    const moduleRenames = new Map<string, string>();
    for (const name of mod.names) {
      if (usedNames.has(name) || (nameCounts.get(name) ?? 0) > 1) {
        // Need to deconflict
        const unique = generateUniqueName(name, usedNames);
        moduleRenames.set(name, unique);
        usedNames.add(unique);
      } else {
        usedNames.add(name);
      }
    }
    if (moduleRenames.size > 0) {
      renames.set(mod.moduleId, moduleRenames);
    }
  }

  return { renames, allNames: usedNames };
};
