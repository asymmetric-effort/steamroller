/**
 * @module benchmarks/parse.bench
 * @description Parser benchmarks measuring parseAst() performance across
 * various source sizes and complexity levels.
 */

import { bench, describe } from "vitest";
import { parseAst } from "../src/parse-ast.js";

/**
 * Generates synthetic JavaScript source with approximately the given
 * number of variable declarations.
 */
const generateSource = (declCount: number): string => {
  const parts: Array<string> = [];
  for (let i = 0; i < declCount; i++) {
    parts.push(
      `export const var${i} = { a: ${i}, b: 'str${i}', c: [${i}, ${i + 1}, ${i + 2}] };`,
    );
  }
  return parts.join("\n");
};

/**
 * Generates source code with complex nested structures (classes, functions,
 * control flow) to stress-test the parser.
 */
const generateComplexSource = (classCount: number): string => {
  const parts: Array<string> = [];
  for (let i = 0; i < classCount; i++) {
    parts.push(`
export class Handler${i} {
  constructor(config) {
    this.state = ${i};
    this.config = config || {};
    this.items = [];
  }

  process(input) {
    var results = [];
    for (let j = 0; j < input.length; j++) {
      const item = input[j];
      if (item.type === 'a') {
        results.push(this.transform(item));
      } else if (item.type === 'b') {
        const vals = item.values || [];
        const mapped = [];
        for (let k = 0; k < vals.length; k++) {
          mapped.push(vals[k] * this.state);
        }
        results.push(mapped);
      } else {
        try {
          results.push(this.fallback(item));
        } catch (e) {
          results.push(null);
        }
      }
    }
    return results;
  }

  transform(item) {
    return { value: item.value, state: this.state, processed: true };
  }

  fallback(item) {
    return { value: item.value, fallback: true };
  }
}
`);
  }
  return parts.join("\n");
};

const smallSource = generateSource(20);
const mediumSource = generateSource(200);
const largeSource = generateSource(2000);
const complexSource = generateComplexSource(50);

describe("parseAst", () => {
  bench(
    "parse-small (~20 declarations)",
    () => {
      parseAst(smallSource);
    },
    { iterations: 200, warmupIterations: 10 },
  );

  bench(
    "parse-medium (~200 declarations)",
    () => {
      parseAst(mediumSource);
    },
    { iterations: 100, warmupIterations: 5 },
  );

  bench(
    "parse-large (~2000 declarations)",
    () => {
      parseAst(largeSource);
    },
    { iterations: 20, warmupIterations: 2 },
  );

  bench(
    "parse-complex (classes + async + control flow)",
    () => {
      parseAst(complexSource);
    },
    { iterations: 50, warmupIterations: 3 },
  );
});
