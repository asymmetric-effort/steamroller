/**
 * Unit tests for native bindings detection and access.
 *
 * @module tests/unit/native/native-detection
 */

import { describe, it, expect } from "bun:test";
import {
  isNativeAvailable,
  getNativeParser,
  getNativeMinifier,
  getNativeResolver,
} from "../../../src/native/index.js";

describe("native detection", () => {
  it("isNativeAvailable returns false when no native package is installed", () => {
    expect(isNativeAvailable()).toBe(false);
  });

  it("getNativeParser returns null when native is unavailable", () => {
    expect(getNativeParser()).toBeNull();
  });

  it("getNativeMinifier returns null when native is unavailable", () => {
    expect(getNativeMinifier()).toBeNull();
  });

  it("getNativeResolver returns null when native is unavailable", () => {
    expect(getNativeResolver()).toBeNull();
  });

  it("all accessors return consistent results across repeated calls", () => {
    const available1 = isNativeAvailable();
    const available2 = isNativeAvailable();
    expect(available1).toBe(available2);

    const parser1 = getNativeParser();
    const parser2 = getNativeParser();
    expect(parser1).toBe(parser2);
  });
});
