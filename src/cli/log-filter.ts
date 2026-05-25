/**
 * Log filtering based on pattern matching for --filterLogs CLI flag.
 * Supports filtering by code, message, and plugin with negation.
 *
 * @module cli/log-filter
 */

import type { RollupLog } from "../types.js";

/** Filter rule parsed from a pattern string. */
interface FilterRule {
  readonly field: "code" | "message" | "plugin";
  readonly pattern: string;
  readonly negated: boolean;
}

/**
 * Parse a single filter pattern string into a FilterRule.
 * Patterns have the form: [!]field:value
 *
 * @param pattern - The pattern string to parse
 * @returns Parsed filter rule or null if invalid
 */
export const parseFilterPattern = (pattern: string): FilterRule | null => {
  const trimmed = pattern.trim();
  if (trimmed === "") {
    return null;
  }

  const negated = trimmed.startsWith("!");
  const body = negated ? trimmed.slice(1) : trimmed;

  const colonIndex = body.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const field = body.slice(0, colonIndex);
  const value = body.slice(colonIndex + 1);

  if (field !== "code" && field !== "message" && field !== "plugin") {
    return null;
  }

  if (value === "") {
    return null;
  }

  return { field, pattern: value, negated };
};

/**
 * Check whether a log entry matches a single filter rule.
 *
 * @param log - The log entry to check
 * @param rule - The filter rule to apply
 * @returns Whether the log matches the rule
 */
const matchesRule = (log: RollupLog, rule: FilterRule): boolean => {
  const fieldValue = log[rule.field];
  if (fieldValue === undefined || fieldValue === null) {
    return false;
  }
  const stringValue = String(fieldValue);
  return stringValue.includes(rule.pattern);
};

/**
 * Create a log filter function from an array of pattern strings.
 * The filter returns true if the log should be included (shown).
 *
 * Filter logic:
 * - If there are include rules (non-negated), the log must match at least one
 * - If there are exclude rules (negated), the log must not match any
 * - Both conditions must be satisfied
 *
 * @param patterns - Array of filter pattern strings
 * @returns Predicate function that returns true for logs to include
 */
export const getLogFilter = (
  patterns: ReadonlyArray<string>,
): ((log: RollupLog) => boolean) => {
  const rules: FilterRule[] = [];

  for (const pattern of patterns) {
    const rule = parseFilterPattern(pattern);
    if (rule !== null) {
      rules.push(rule);
    }
  }

  if (rules.length === 0) {
    return () => true;
  }

  const includeRules = rules.filter((r) => !r.negated);
  const excludeRules = rules.filter((r) => r.negated);

  return (log: RollupLog): boolean => {
    /* Check excludes: if any exclude matches, filter out */
    for (const rule of excludeRules) {
      if (matchesRule(log, rule)) {
        return false;
      }
    }

    /* Check includes: if there are include rules, at least one must match */
    if (includeRules.length > 0) {
      let matched = false;
      for (const rule of includeRules) {
        if (matchesRule(log, rule)) {
          matched = true;
          break;
        }
      }
      return matched;
    }

    return true;
  };
};
