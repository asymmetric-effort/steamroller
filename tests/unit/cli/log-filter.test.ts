/**
 * Unit tests for log filter module.
 *
 * @module tests/unit/cli/log-filter
 */

import { describe, it, expect } from "vitest";
import {
  getLogFilter,
  parseFilterPattern,
} from "../../../src/cli/log-filter.js";

describe("parseFilterPattern", () => {
  it("should parse code filter", () => {
    const result = parseFilterPattern("code:CIRCULAR_DEPENDENCY");
    expect(result).toEqual({
      field: "code",
      pattern: "CIRCULAR_DEPENDENCY",
      negated: false,
    });
  });

  it("should parse negated code filter", () => {
    const result = parseFilterPattern("!code:CIRCULAR_DEPENDENCY");
    expect(result).toEqual({
      field: "code",
      pattern: "CIRCULAR_DEPENDENCY",
      negated: true,
    });
  });

  it("should parse message filter", () => {
    const result = parseFilterPattern("message:some warning text");
    expect(result).toEqual({
      field: "message",
      pattern: "some warning text",
      negated: false,
    });
  });

  it("should parse plugin filter", () => {
    const result = parseFilterPattern("plugin:my-plugin");
    expect(result).toEqual({
      field: "plugin",
      pattern: "my-plugin",
      negated: false,
    });
  });

  it("should return null for empty string", () => {
    expect(parseFilterPattern("")).toBeNull();
  });

  it("should return null for whitespace-only string", () => {
    expect(parseFilterPattern("   ")).toBeNull();
  });

  it("should return null for pattern without colon", () => {
    expect(parseFilterPattern("invalidpattern")).toBeNull();
  });

  it("should return null for unknown field", () => {
    expect(parseFilterPattern("unknown:value")).toBeNull();
  });

  it("should return null for empty value after colon", () => {
    expect(parseFilterPattern("code:")).toBeNull();
  });

  it("should handle negated message filter", () => {
    const result = parseFilterPattern("!message:warning text");
    expect(result).toEqual({
      field: "message",
      pattern: "warning text",
      negated: true,
    });
  });

  it("should handle negated plugin filter", () => {
    const result = parseFilterPattern("!plugin:noisy-plugin");
    expect(result).toEqual({
      field: "plugin",
      pattern: "noisy-plugin",
      negated: true,
    });
  });
});

describe("getLogFilter", () => {
  it("should return a function that always returns true for empty patterns", () => {
    const filter = getLogFilter([]);
    expect(filter({ message: "anything" })).toBe(true);
  });

  it("should include logs matching a code pattern", () => {
    const filter = getLogFilter(["code:CIRCULAR_DEPENDENCY"]);
    expect(filter({ message: "circular", code: "CIRCULAR_DEPENDENCY" })).toBe(
      true,
    );
    expect(filter({ message: "other", code: "UNUSED_VARIABLE" })).toBe(false);
  });

  it("should exclude logs matching a negated code pattern", () => {
    const filter = getLogFilter(["!code:CIRCULAR_DEPENDENCY"]);
    expect(filter({ message: "circular", code: "CIRCULAR_DEPENDENCY" })).toBe(
      false,
    );
    expect(filter({ message: "other", code: "UNUSED_VARIABLE" })).toBe(true);
  });

  it("should filter by message content", () => {
    const filter = getLogFilter(["message:deprecated"]);
    expect(filter({ message: "This is deprecated" })).toBe(true);
    expect(filter({ message: "This is fine" })).toBe(false);
  });

  it("should filter by plugin name", () => {
    const filter = getLogFilter(["plugin:json"]);
    expect(filter({ message: "json issue", plugin: "json" })).toBe(true);
    expect(filter({ message: "other issue", plugin: "commonjs" })).toBe(false);
  });

  it("should handle multiple include patterns (OR logic)", () => {
    const filter = getLogFilter([
      "code:CIRCULAR_DEPENDENCY",
      "code:UNUSED_EXPORT",
    ]);
    expect(filter({ message: "circular", code: "CIRCULAR_DEPENDENCY" })).toBe(
      true,
    );
    expect(filter({ message: "unused", code: "UNUSED_EXPORT" })).toBe(true);
    expect(filter({ message: "other", code: "SOMETHING_ELSE" })).toBe(false);
  });

  it("should handle multiple exclude patterns", () => {
    const filter = getLogFilter([
      "!code:CIRCULAR_DEPENDENCY",
      "!code:UNUSED_EXPORT",
    ]);
    expect(filter({ message: "circular", code: "CIRCULAR_DEPENDENCY" })).toBe(
      false,
    );
    expect(filter({ message: "unused", code: "UNUSED_EXPORT" })).toBe(false);
    expect(filter({ message: "other", code: "SOMETHING_ELSE" })).toBe(true);
  });

  it("should combine include and exclude rules", () => {
    const filter = getLogFilter([
      "code:CIRCULAR_DEPENDENCY",
      "!plugin:noisy-plugin",
    ]);
    /* Matches include but not exclude */
    expect(
      filter({
        message: "dep",
        code: "CIRCULAR_DEPENDENCY",
        plugin: "good-plugin",
      }),
    ).toBe(true);
    /* Matches include AND exclude -> excluded */
    expect(
      filter({
        message: "dep",
        code: "CIRCULAR_DEPENDENCY",
        plugin: "noisy-plugin",
      }),
    ).toBe(false);
    /* Does not match include -> excluded */
    expect(filter({ message: "other", code: "OTHER" })).toBe(false);
  });

  it("should skip invalid patterns gracefully", () => {
    const filter = getLogFilter(["invalid", "code:VALID"]);
    expect(filter({ message: "test", code: "VALID" })).toBe(true);
    expect(filter({ message: "test", code: "OTHER" })).toBe(false);
  });

  it("should handle log with missing field (no match)", () => {
    const filter = getLogFilter(["plugin:json"]);
    /* Log without plugin field should not match */
    expect(filter({ message: "no plugin" })).toBe(false);
  });

  it("should handle negation with missing field (no match = not excluded)", () => {
    const filter = getLogFilter(["!plugin:json"]);
    /* Log without plugin field won't match the exclude rule -> included */
    expect(filter({ message: "no plugin" })).toBe(true);
  });

  it("should handle partial string matches in messages", () => {
    const filter = getLogFilter(["message:warn"]);
    expect(filter({ message: "This is a warning" })).toBe(true);
    expect(filter({ message: "This is an error" })).toBe(false);
  });
});
