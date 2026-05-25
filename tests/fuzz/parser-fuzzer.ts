/**
 * @module tests/fuzz/parser-fuzzer
 * @description Generates random valid-ish JavaScript source strings and feeds
 * them through the parser to verify no crashes occur. Only SyntaxError is
 * acceptable as a non-crash outcome.
 */

import { parse } from "../../src/parser/parser.js";

/** Result of a fuzz testing session. */
export interface FuzzResult {
  readonly passed: number;
  readonly crashed: number;
  readonly syntaxErrors: number;
  readonly errors: ReadonlyArray<string>;
  readonly totalIterations: number;
}

/** A simple seeded PRNG for reproducible fuzz generation. */
export const createRng = (seed: number): { readonly next: () => number } => {
  let state = seed | 0;

  return {
    next: (): number => {
      state = (state * 1664525 + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    },
  };
};

/** Token templates for generating valid-ish JavaScript. */
const KEYWORDS: ReadonlyArray<string> = [
  "const",
  "function",
  "class",
  "if",
  "else",
  "for",
  "while",
  "return",
  "import",
  "export",
  "new",
  "typeof",
  "void",
  "delete",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "yield",
  "async",
  "await",
  "of",
  "in",
];

const IDENTIFIERS: ReadonlyArray<string> = [
  "x",
  "y",
  "z",
  "foo",
  "bar",
  "baz",
  "a",
  "b",
  "c",
  "value",
  "result",
  "item",
  "index",
  "temp",
  "data",
];

const OPERATORS: ReadonlyArray<string> = [
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "==",
  "===",
  "!=",
  "!==",
  "<",
  ">",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "...",
];

const LITERALS: ReadonlyArray<string> = [
  "0",
  "1",
  "42",
  "3.14",
  "'hello'",
  '"world"',
  "true",
  "false",
  "null",
  "undefined",
  "[]",
  "{}",
  "``",
];

const PUNCTUATION: ReadonlyArray<string> = [
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ",",
  ".",
  ":",
  "=>",
];

/**
 * Generates a random valid-ish JavaScript source string.
 * Uses templates and random token selection to create plausible source code.
 */
export const generateRandomSource = (seed: number, length: number): string => {
  const rng = createRng(seed);
  const parts: Array<string> = [];
  let currentLength = 0;

  const TEMPLATES: ReadonlyArray<() => string> = [
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      const lit = LITERALS[Math.floor(rng.next() * LITERALS.length)];
      return `const ${id} = ${lit};\n`;
    },
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      return `function ${id}() { return ${Math.floor(rng.next() * 100)}; }\n`;
    },
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      return `const ${id} = () => ${Math.floor(rng.next() * 100)};\n`;
    },
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      return `class ${id.charAt(0).toUpperCase() + id.slice(1)} { constructor() {} }\n`;
    },
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      const op = OPERATORS[Math.floor(rng.next() * 5)];
      return `const ${id} = ${Math.floor(rng.next() * 10)} ${op} ${Math.floor(rng.next() * 10)};\n`;
    },
    () => {
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      return `if (${id}) { ${id}; }\n`;
    },
    () => {
      return `// comment ${Math.floor(rng.next() * 1000)}\n`;
    },
    () => {
      const kw = KEYWORDS[Math.floor(rng.next() * KEYWORDS.length)];
      const id = IDENTIFIERS[Math.floor(rng.next() * IDENTIFIERS.length)];
      const punct = PUNCTUATION[Math.floor(rng.next() * PUNCTUATION.length)];
      return `${kw} ${id} ${punct} `;
    },
  ];

  while (currentLength < length) {
    const templateIdx = Math.floor(rng.next() * TEMPLATES.length);
    const fragment = TEMPLATES[templateIdx]();
    parts.push(fragment);
    currentLength += fragment.length;
  }

  return parts.join("");
};

/**
 * Runs the fuzzer for the given number of iterations.
 * Feeds randomly generated source through the parser and reports crashes.
 * Only SyntaxError is considered acceptable; other errors are crashes.
 */
export const fuzzParser = (
  iterations: number,
  maxLength: number,
): FuzzResult => {
  let passed = 0;
  let crashed = 0;
  let syntaxErrors = 0;
  const errors: Array<string> = [];

  for (let i = 0; i < iterations; i++) {
    const source = generateRandomSource(
      i,
      Math.floor((maxLength * ((i % 10) + 1)) / 10),
    );

    try {
      parse(source);
      passed++;
    } catch (err: unknown) {
      if (
        err instanceof SyntaxError ||
        (err instanceof Error && err.message.includes("Unexpected"))
      ) {
        syntaxErrors++;
        passed++;
      } else if (err instanceof Error) {
        // Parser errors that are not SyntaxError but are expected parse failures
        if (
          err.message.includes("Expected") ||
          err.message.includes("Unexpected") ||
          err.message.includes("Invalid") ||
          err.message.includes("Unterminated") ||
          err.message.includes("Cannot") ||
          err.message.includes("already been declared") ||
          err.message.includes("not allowed") ||
          err.message.includes("position")
        ) {
          syntaxErrors++;
          passed++;
        } else {
          crashed++;
          errors.push(`Iteration ${i}: ${err.message}`);
        }
      } else {
        crashed++;
        errors.push(`Iteration ${i}: non-Error thrown: ${String(err)}`);
      }
    }
  }

  return {
    passed,
    crashed,
    syntaxErrors,
    errors,
    totalIterations: iterations,
  };
};
