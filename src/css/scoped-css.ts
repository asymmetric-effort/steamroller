/**
 * @module css/scoped-css
 * @description Generate scoped CSS from style blocks by adding data-v-[hash]
 * attribute selectors to all CSS rules. Supports :deep(), :global(), and
 * :slotted() pseudo-selectors for Vue-style scoped CSS.
 */

// ============================================================
// Types
// ============================================================

/** Options for scoped CSS generation. */
export interface ScopedCSSOptions {
  /** The scope ID to use (e.g., "data-v-abc123"). */
  readonly scopeId: string;
}

// ============================================================
// Hash generation
// ============================================================

/**
 * Generate a short hash string from content, suitable for use as a scope ID.
 * Uses a simple DJB2-style hash for deterministic output.
 *
 * @param content - The content to hash.
 * @returns A short hex hash string.
 */
export const generateScopeId = (content: string): string => {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).slice(0, 8);
};

// ============================================================
// Scoped CSS processing
// ============================================================

/**
 * Process a CSS string to add scoped attribute selectors to all rules.
 * Transforms selectors to include `[data-v-HASH]` for Vue-style scoping.
 *
 * Handles:
 * - Simple selectors: `.btn { }` -> `.btn[data-v-abc] { }`
 * - Compound selectors: `.a .b { }` -> `.a[data-v-abc] .b[data-v-abc] { }`
 * - Combinators: `.a > .b { }` -> `.a[data-v-abc] > .b[data-v-abc] { }`
 * - :deep() pseudo: `.a :deep(.b) { }` -> `.a[data-v-abc] .b { }`
 * - :global() pseudo: `:global(.a) { }` -> `.a { }`
 * - :slotted() pseudo: `:slotted(.a) { }` -> `.a[data-v-abc-s] { }`
 * - Multiple selectors: `.a, .b { }` -> `.a[data-v-abc], .b[data-v-abc] { }`
 * - @rules: passes through at-rules, processes nested rule blocks
 *
 * @param css - The CSS source string.
 * @param options - Scoped CSS options including the scope ID.
 * @returns The scoped CSS string.
 */
export const scopeCSS = (css: string, options: ScopedCSSOptions): string => {
  const { scopeId } = options;
  const attr = `[${scopeId}]`;

  return processBlock(css, attr);
};

/**
 * Process a block of CSS, scoping all rule selectors.
 *
 * @param css - The CSS string to process.
 * @param attr - The attribute selector string (e.g., "[data-v-abc123]").
 * @returns The scoped CSS.
 */
const processBlock = (css: string, attr: string): string => {
  let result = "";
  let i = 0;

  while (i < css.length) {
    // Skip whitespace
    if (/\s/.test(css[i])) {
      result += css[i];
      i++;
      continue;
    }

    // Skip comments
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) {
        result += css.slice(i);
        break;
      }
      result += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Handle @rules
    if (css[i] === "@") {
      const atResult = processAtRule(css, i, attr);
      result += atResult.output;
      i = atResult.end;
      continue;
    }

    // Parse a rule: selector { declarations }
    const braceIdx = findTopLevelChar(css, "{", i);
    if (braceIdx === -1) {
      // No more rules, append rest
      result += css.slice(i);
      break;
    }

    const selector = css.slice(i, braceIdx).trim();
    const closeIdx = findMatchingBrace(css, braceIdx);
    const body = css.slice(braceIdx + 1, closeIdx);

    // Check if body contains nested rules (has { })
    if (body.includes("{")) {
      // Nested - process recursively
      const scopedSelector = scopeSelectorList(selector, attr);
      result += scopedSelector + " {\n" + processBlock(body, attr) + "}";
    } else {
      // Leaf rule - scope the selector
      const scopedSelector = scopeSelectorList(selector, attr);
      result += scopedSelector + " {" + body + "}";
    }

    i = closeIdx + 1;
  }

  return result;
};

/**
 * Process an @-rule (e.g., @media, @keyframes, @supports).
 *
 * @param css - The full CSS string.
 * @param start - The starting index of the @-rule.
 * @param attr - The attribute selector string.
 * @returns An object with the output string and the end position.
 */
const processAtRule = (
  css: string,
  start: number,
  attr: string,
): { output: string; end: number } => {
  const braceIdx = findTopLevelChar(css, "{", start);
  const semiIdx = css.indexOf(";", start);

  // @rule without a block (e.g., @import, @charset)
  if (braceIdx === -1 || (semiIdx !== -1 && semiIdx < braceIdx)) {
    const end = semiIdx === -1 ? css.length : semiIdx + 1;
    return { output: css.slice(start, end), end };
  }

  const prelude = css.slice(start, braceIdx);
  const closeIdx = findMatchingBrace(css, braceIdx);
  const body = css.slice(braceIdx + 1, closeIdx);

  // @keyframes should not be scoped
  if (/^@keyframes\s/i.test(prelude.trim())) {
    return {
      output: prelude + "{" + body + "}",
      end: closeIdx + 1,
    };
  }

  // Process nested content
  const scopedBody = processBlock(body, attr);
  return {
    output: prelude + "{" + scopedBody + "}",
    end: closeIdx + 1,
  };
};

/**
 * Scope a comma-separated selector list.
 *
 * @param selectorList - The full selector list string (e.g., ".a, .b > .c").
 * @param attr - The attribute selector string.
 * @returns The scoped selector list.
 */
const scopeSelectorList = (selectorList: string, attr: string): string => {
  return selectorList
    .split(",")
    .map((sel) => scopeSelector(sel.trim(), attr))
    .join(", ");
};

/**
 * Scope a single selector (no commas).
 *
 * @param selector - A single CSS selector.
 * @param attr - The attribute selector string.
 * @returns The scoped selector.
 */
const scopeSelector = (selector: string, attr: string): string => {
  // Handle :global() - remove the pseudo and don't scope
  if (selector.startsWith(":global(")) {
    const inner = extractPseudoArg(selector, ":global(");
    if (inner !== null) {
      return inner;
    }
  }

  // Check for :global() anywhere in the selector
  if (selector.includes(":global(")) {
    return selector.replace(/:global\(([^)]+)\)/g, "$1");
  }

  // Handle :deep() - scope up to :deep, then leave the rest unscoped
  if (selector.includes(":deep(")) {
    return scopeDeep(selector, attr);
  }

  // Handle :slotted()
  if (selector.includes(":slotted(")) {
    return scopeSlotted(selector, attr);
  }

  // Regular selector: add attr to each simple selector part
  return addAttrToSelector(selector, attr);
};

/**
 * Add the scope attribute to each simple selector in a compound selector.
 * For example: ".a .b > .c" -> ".a[attr] .b[attr] > .c[attr]"
 *
 * @param selector - The selector string.
 * @param attr - The attribute selector string.
 * @returns The selector with scope attributes added.
 */
const addAttrToSelector = (selector: string, attr: string): string => {
  // Split by combinators while keeping them
  const parts = selector.split(/(\s*[>+~]\s*|\s+)/);
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    // Skip empty parts and combinators
    if (!trimmed || /^[>+~]$/.test(trimmed)) {
      result.push(part);
      continue;
    }

    // Add attr to the end of the simple selector
    // Handle pseudo-elements (::before, ::after) - attr goes before them
    const pseudoElementMatch = trimmed.match(/(::[\w-]+(?:\([^)]*\))?)$/);
    if (pseudoElementMatch) {
      const base = trimmed.slice(
        0,
        trimmed.length - pseudoElementMatch[1].length,
      );
      result.push(base + attr + pseudoElementMatch[1]);
    } else {
      // Handle pseudo-classes at end (:hover, :focus, etc.)
      const pseudoClassMatch = trimmed.match(
        /(:(?:hover|focus|active|visited|first-child|last-child|nth-child\([^)]*\)|not\([^)]*\)|first-of-type|last-of-type|disabled|enabled|checked|empty|root|link))$/,
      );
      if (pseudoClassMatch) {
        const base = trimmed.slice(
          0,
          trimmed.length - pseudoClassMatch[1].length,
        );
        result.push(base + attr + pseudoClassMatch[1]);
      } else {
        result.push(trimmed + attr);
      }
    }
  }

  return result.join("");
};

/**
 * Handle :deep() pseudo-selector.
 * Everything before :deep() gets scoped, the argument and everything after does not.
 *
 * @param selector - The selector containing :deep().
 * @param attr - The attribute selector string.
 * @returns The transformed selector.
 */
const scopeDeep = (selector: string, attr: string): string => {
  const deepIdx = selector.indexOf(":deep(");
  const before = selector.slice(0, deepIdx).trim();
  const afterDeep = selector.slice(deepIdx);

  // Extract the argument from :deep(...)
  const inner = extractPseudoArg(afterDeep, ":deep(");
  if (inner === null) {
    return selector;
  }

  const restStart = deepIdx + ":deep(".length + inner.length + 1;
  const rest = selector.slice(restStart);

  if (before) {
    return addAttrToSelector(before, attr) + " " + inner + rest;
  }
  // :deep(.x) at the start - just scope with attr prefix
  return attr + " " + inner + rest;
};

/**
 * Handle :slotted() pseudo-selector.
 * The argument gets scoped with a slot-specific attribute.
 *
 * @param selector - The selector containing :slotted().
 * @param attr - The attribute selector string.
 * @returns The transformed selector.
 */
const scopeSlotted = (selector: string, attr: string): string => {
  const slottedIdx = selector.indexOf(":slotted(");
  const before = selector.slice(0, slottedIdx).trim();
  const afterSlotted = selector.slice(slottedIdx);

  const inner = extractPseudoArg(afterSlotted, ":slotted(");
  if (inner === null) {
    return selector;
  }

  const slotAttr = attr.replace("]", "-s]");
  const scoped = inner + slotAttr;

  if (before) {
    return addAttrToSelector(before, attr) + " " + scoped;
  }
  return scoped;
};

/**
 * Extract the argument from a pseudo-function like :deep(...) or :global(...).
 *
 * @param str - The string starting with the pseudo-function.
 * @param prefix - The prefix including the opening paren (e.g., ":deep(").
 * @returns The extracted argument, or null if not found.
 */
const extractPseudoArg = (str: string, prefix: string): string | null => {
  if (!str.startsWith(prefix)) {
    return null;
  }
  let depth = 1;
  let i = prefix.length;
  while (i < str.length && depth > 0) {
    if (str[i] === "(") depth++;
    if (str[i] === ")") depth--;
    if (depth > 0) i++;
  }
  if (depth !== 0) {
    return null;
  }
  return str.slice(prefix.length, i);
};

/**
 * Find the first occurrence of a character at the top level (not inside braces, parens, or strings).
 *
 * @param css - The CSS string.
 * @param char - The character to find.
 * @param start - The starting position.
 * @returns The index of the character, or -1 if not found.
 */
const findTopLevelChar = (css: string, char: string, start: number): number => {
  let depth = 0;
  let inString: string | null = null;

  for (let i = start; i < css.length; i++) {
    const ch = css[i];

    if (inString !== null) {
      if (ch === inString && css[i - 1] !== "\\") {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;

    if (ch === char && depth === 0) {
      return i;
    }
  }

  return -1;
};

/**
 * Find the matching closing brace for an opening brace.
 *
 * @param css - The CSS string.
 * @param openIdx - The position of the opening brace.
 * @returns The position of the matching closing brace.
 */
const findMatchingBrace = (css: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  let inString: string | null = null;

  while (i < css.length && depth > 0) {
    const ch = css[i];

    if (inString !== null) {
      if (ch === inString && css[i - 1] !== "\\") {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }

    if (depth > 0) {
      i++;
    }
  }

  return i;
};
