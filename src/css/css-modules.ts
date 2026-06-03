/**
 * @module css/css-modules
 * @description CSS Modules implementation for steamroller.
 * Scopes class names with content hashes, handles :local() and :global()
 * scoping, and supports the `composes:` keyword for composition.
 * Generates JS class-name mappings for import in JavaScript modules.
 */

import type {
  Stylesheet,
  Rule,
  Declaration,
  SelectorList,
  Selector,
  SelectorPart,
  CSSTopLevelNode,
  DeclarationOrNested,
  AtRule,
} from "./css-ast.js";

/** A mapping of original class names to their scoped versions. */
export type CSSModuleMapping = Readonly<Record<string, string>>;

/** Result of processing a CSS Module. */
export interface CSSModuleResult {
  /** The transformed stylesheet with scoped class names. */
  readonly ast: Stylesheet;
  /** Mapping of original class names to scoped class names. */
  readonly mapping: CSSModuleMapping;
  /** List of composes references to other modules. */
  readonly composes: ReadonlyArray<CSSComposesRef>;
}

/** A `composes:` reference to another CSS module. */
export interface CSSComposesRef {
  /** The local class name that composes. */
  readonly localClass: string;
  /** The class name(s) being composed. */
  readonly composedClasses: ReadonlyArray<string>;
  /** The module path if composing from another file. */
  readonly from?: string;
}

/**
 * Generate a short content hash for scoping class names.
 *
 * @param input - The string to hash (typically file path + class name).
 * @returns A short alphanumeric hash string.
 */
export const generateHash = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  // Convert to positive base36 and take 7 chars
  const positive = hash >>> 0;
  return positive.toString(36).slice(0, 7);
};

/**
 * Generate a scoped class name from the original name and file path.
 *
 * @param className - The original class name.
 * @param filePath - The source file path for uniqueness.
 * @returns The scoped class name.
 */
export const scopeClassName = (className: string, filePath: string): string => {
  const hash = generateHash(filePath + ":" + className);
  return `${className}_${hash}`;
};

/**
 * Process a CSS Module stylesheet, scoping all local class names.
 *
 * @param ast - The parsed stylesheet.
 * @param filePath - The file path for generating unique scoped names.
 * @returns The processed result with scoped AST, mapping, and composes refs.
 */
export const processCSSModule = (
  ast: Stylesheet,
  filePath: string,
): CSSModuleResult => {
  const mapping: Record<string, string> = {};
  const composes: Array<CSSComposesRef> = [];
  const globalClasses = new Set<string>();

  // First pass: collect all class names and detect :global
  collectClassNames(ast.rules, mapping, globalClasses, filePath);

  // Second pass: transform the AST with scoped names
  const transformedRules = transformRules(
    ast.rules,
    mapping,
    globalClasses,
    composes,
  );

  return {
    ast: {
      type: "Stylesheet",
      rules: transformedRules,
      loc: ast.loc,
    },
    mapping: { ...mapping },
    composes,
  };
};

/**
 * Collect class names from stylesheet rules, building the mapping.
 */
const collectClassNames = (
  rules: ReadonlyArray<CSSTopLevelNode>,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
  filePath: string,
): void => {
  for (const rule of rules) {
    if (rule.type === "Rule") {
      collectClassNamesFromSelectorList(
        rule.selectors,
        mapping,
        globalClasses,
        filePath,
      );
      // Recurse into nested rules
      for (const decl of rule.declarations) {
        if (decl.type === "Rule") {
          collectClassNamesFromSelectorList(
            decl.selectors,
            mapping,
            globalClasses,
            filePath,
          );
        }
      }
    } else if (rule.type === "AtRule" && rule.rules) {
      collectClassNames(
        rule.rules as ReadonlyArray<CSSTopLevelNode>,
        mapping,
        globalClasses,
        filePath,
      );
    }
  }
};

/**
 * Collect class names from a selector list.
 */
const collectClassNamesFromSelectorList = (
  selectorList: SelectorList,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
  filePath: string,
): void => {
  for (const selector of selectorList.selectors) {
    let inGlobal = false;
    for (const part of selector.parts) {
      if (part.type === "PseudoClassSelector" && part.name === "global") {
        inGlobal = true;
        // If :global(.className), extract the class from args
        if (part.args) {
          const classMatch = part.args.match(/\.([A-Za-z_][\w-]*)/g);
          if (classMatch) {
            for (const cls of classMatch) {
              globalClasses.add(cls.slice(1));
            }
          }
        }
        continue;
      }
      if (part.type === "PseudoClassSelector" && part.name === "local") {
        inGlobal = false;
        // If :local(.className), extract the class from args
        if (part.args) {
          const classMatch = part.args.match(/\.([A-Za-z_][\w-]*)/g);
          if (classMatch) {
            for (const cls of classMatch) {
              const name = cls.slice(1);
              if (!(name in mapping)) {
                mapping[name] = scopeClassName(name, filePath);
              }
            }
          }
        }
        continue;
      }
      if (part.type === "ClassSelector" && !inGlobal) {
        if (!(part.name in mapping)) {
          mapping[part.name] = scopeClassName(part.name, filePath);
        }
      }
    }
  }
};

/**
 * Transform rules with scoped class names.
 */
const transformRules = (
  rules: ReadonlyArray<CSSTopLevelNode>,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
  composes: Array<CSSComposesRef>,
): ReadonlyArray<CSSTopLevelNode> => {
  const result: Array<CSSTopLevelNode> = [];

  for (const rule of rules) {
    if (rule.type === "Rule") {
      result.push(transformRule(rule, mapping, globalClasses, composes));
    } else if (rule.type === "AtRule") {
      if (rule.rules) {
        const transformedChildren = transformRules(
          rule.rules as ReadonlyArray<CSSTopLevelNode>,
          mapping,
          globalClasses,
          composes,
        );
        result.push({
          ...rule,
          rules: transformedChildren,
        });
      } else {
        result.push(rule);
      }
    } else {
      result.push(rule);
    }
  }

  return result;
};

/**
 * Transform a single rule, scoping selectors and extracting composes.
 */
const transformRule = (
  rule: Rule,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
  composes: Array<CSSComposesRef>,
): Rule => {
  const transformedSelectors = transformSelectorList(
    rule.selectors,
    mapping,
    globalClasses,
  );

  // Extract current class name for composes processing
  const currentClass = extractFirstClassName(rule.selectors);

  const transformedDeclarations: Array<DeclarationOrNested> = [];
  for (const decl of rule.declarations) {
    if (decl.type === "Declaration" && decl.property === "composes") {
      // Parse composes: className from './other.module.css'
      const composesRef = parseComposesValue(decl.value, currentClass);
      if (composesRef) {
        composes.push(composesRef);
      }
      // Don't include composes declarations in the output
      continue;
    }
    if (decl.type === "Rule") {
      transformedDeclarations.push(
        transformRule(decl, mapping, globalClasses, composes),
      );
    } else {
      transformedDeclarations.push(decl);
    }
  }

  return {
    ...rule,
    selectors: transformedSelectors,
    declarations: transformedDeclarations,
  };
};

/**
 * Transform a selector list, replacing class names with scoped versions.
 */
const transformSelectorList = (
  list: SelectorList,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
): SelectorList => {
  return {
    ...list,
    selectors: list.selectors.map((s) =>
      transformSelector(s, mapping, globalClasses),
    ),
  };
};

/**
 * Transform a single selector, replacing local class names.
 */
const transformSelector = (
  selector: Selector,
  mapping: Record<string, string>,
  globalClasses: Set<string>,
): Selector => {
  const parts: Array<SelectorPart> = [];
  let inGlobal = false;

  for (const part of selector.parts) {
    if (part.type === "PseudoClassSelector" && part.name === "global") {
      inGlobal = true;
      // If :global(.className), emit the class directly without scoping
      if (part.args) {
        const classMatch = part.args.match(/\.([A-Za-z_][\w-]*)/g);
        if (classMatch) {
          for (const cls of classMatch) {
            parts.push({ type: "ClassSelector", name: cls.slice(1) });
          }
        }
      }
      continue;
    }
    if (part.type === "PseudoClassSelector" && part.name === "local") {
      inGlobal = false;
      // If :local(.className), emit the scoped class
      if (part.args) {
        const classMatch = part.args.match(/\.([A-Za-z_][\w-]*)/g);
        if (classMatch) {
          for (const cls of classMatch) {
            const name = cls.slice(1);
            const scoped = mapping[name] ?? name;
            parts.push({ type: "ClassSelector", name: scoped });
          }
        }
      }
      continue;
    }
    if (
      part.type === "ClassSelector" &&
      !inGlobal &&
      !globalClasses.has(part.name)
    ) {
      const scoped = mapping[part.name] ?? part.name;
      parts.push({ ...part, name: scoped });
    } else {
      parts.push(part);
    }
  }

  return { ...selector, parts };
};

/**
 * Extract the first class name from a selector list.
 */
const extractFirstClassName = (list: SelectorList): string | undefined => {
  for (const selector of list.selectors) {
    for (const part of selector.parts) {
      if (part.type === "ClassSelector") {
        return part.name;
      }
    }
  }
  return undefined;
};

/**
 * Parse a `composes:` declaration value.
 *
 * @param value - The value of the composes declaration, e.g., "button from './base.module.css'"
 * @param localClass - The class that is composing.
 * @returns A CSSComposesRef, or undefined if parsing fails.
 */
const parseComposesValue = (
  value: string,
  localClass?: string,
): CSSComposesRef | undefined => {
  if (!localClass) {
    return undefined;
  }

  const fromMatch = value.match(/^(.+)\s+from\s+['"]([^'"]+)['"]\s*$/);
  if (fromMatch) {
    const classNames = fromMatch[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return {
      localClass,
      composedClasses: classNames,
      from: fromMatch[2],
    };
  }

  // Local composes (from same file)
  const classNames = value
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (classNames.length > 0) {
    return {
      localClass,
      composedClasses: classNames,
    };
  }

  return undefined;
};

/**
 * Generate a JavaScript module exporting the CSS Module class name mapping.
 *
 * @param mapping - The class name mapping.
 * @param composes - The composes references.
 * @returns JavaScript module source code.
 */
export const generateJSMapping = (
  mapping: CSSModuleMapping,
  composes: ReadonlyArray<CSSComposesRef>,
): string => {
  const lines: Array<string> = [];

  // Collect imports needed for composes
  const importsByFile = new Map<string, Set<string>>();
  for (const comp of composes) {
    if (comp.from) {
      let classes = importsByFile.get(comp.from);
      if (!classes) {
        classes = new Set();
        importsByFile.set(comp.from, classes);
      }
      for (const cls of comp.composedClasses) {
        classes.add(cls);
      }
    }
  }

  // Generate imports
  let importIdx = 0;
  const importVarMap = new Map<string, string>();
  for (const [filePath] of importsByFile) {
    const varName = `_styles${importIdx}`;
    importVarMap.set(filePath, varName);
    lines.push(`import ${varName} from ${JSON.stringify(filePath)};`);
    importIdx++;
  }

  if (lines.length > 0) {
    lines.push("");
  }

  // Build the final mapping including composes
  const finalMapping: Record<string, string> = { ...mapping };
  for (const comp of composes) {
    const currentValue = finalMapping[comp.localClass] ?? comp.localClass;
    if (comp.from) {
      const importVar = importVarMap.get(comp.from);
      if (importVar) {
        // Will be resolved at runtime
        for (const cls of comp.composedClasses) {
          finalMapping[comp.localClass] =
            `${currentValue} " + ${importVar}[${JSON.stringify(cls)}] + "`;
        }
      }
    } else {
      // Local composes
      for (const cls of comp.composedClasses) {
        const composedScoped = finalMapping[cls] ?? cls;
        finalMapping[comp.localClass] = `${currentValue} ${composedScoped}`;
      }
    }
  }

  // Generate the export
  lines.push("export default {");
  for (const [original, scoped] of Object.entries(finalMapping)) {
    lines.push(`  ${JSON.stringify(original)}: ${JSON.stringify(scoped)},`);
  }
  lines.push("};");

  return lines.join("\n") + "\n";
};
