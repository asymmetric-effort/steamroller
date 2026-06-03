/**
 * Unit tests for native bindings configuration (forceNative, disableNative,
 * STEAMROLLER_NATIVE env var, STEAMROLLER_DEBUG logging).
 *
 * @module tests/unit/native/native-config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isNativeAvailable,
  shouldUseNative,
  configureNative,
  resetNativeConfig,
} from "../../../src/native/index.js";

describe("native config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetNativeConfig();
    delete process.env["STEAMROLLER_NATIVE"];
    delete process.env["STEAMROLLER_DEBUG"];
  });

  afterEach(() => {
    resetNativeConfig();
    process.env["STEAMROLLER_NATIVE"] = originalEnv["STEAMROLLER_NATIVE"];
    process.env["STEAMROLLER_DEBUG"] = originalEnv["STEAMROLLER_DEBUG"];
    if (originalEnv["STEAMROLLER_NATIVE"] === undefined) {
      delete process.env["STEAMROLLER_NATIVE"];
    }
    if (originalEnv["STEAMROLLER_DEBUG"] === undefined) {
      delete process.env["STEAMROLLER_DEBUG"];
    }
  });

  describe("shouldUseNative", () => {
    it("returns false when native is not available and not forced", () => {
      // In test environment, native bindings are not installed
      expect(isNativeAvailable()).toBe(false);
      expect(shouldUseNative()).toBe(false);
    });

    it("returns false when STEAMROLLER_NATIVE=0", () => {
      process.env["STEAMROLLER_NATIVE"] = "0";
      expect(shouldUseNative()).toBe(false);
    });

    it("throws when STEAMROLLER_NATIVE=1 but native is unavailable", () => {
      process.env["STEAMROLLER_NATIVE"] = "1";
      expect(() => shouldUseNative()).toThrow(
        /Native bindings forced.*but not available/,
      );
    });

    it("returns false when disableNative is set", () => {
      configureNative({ disableNative: true });
      expect(shouldUseNative()).toBe(false);
    });

    it("throws when forceNative is set but native is unavailable", () => {
      configureNative({ forceNative: true });
      expect(() => shouldUseNative()).toThrow(
        /Native bindings forced.*but not available/,
      );
    });

    it("disableNative takes priority over forceNative", () => {
      configureNative({ forceNative: true, disableNative: true });
      // disableNative wins - should not throw
      expect(shouldUseNative()).toBe(false);
    });

    it("STEAMROLLER_NATIVE=0 takes priority over forceNative config", () => {
      process.env["STEAMROLLER_NATIVE"] = "0";
      configureNative({ forceNative: true });
      // env disable wins - should not throw
      expect(shouldUseNative()).toBe(false);
    });
  });

  describe("configureNative / resetNativeConfig", () => {
    it("resetNativeConfig clears programmatic config", () => {
      configureNative({ disableNative: true });
      expect(shouldUseNative()).toBe(false);

      resetNativeConfig();
      // Back to default (auto-detect, which is false in test env)
      expect(shouldUseNative()).toBe(false);
    });

    it("configureNative can be called multiple times", () => {
      configureNative({ disableNative: true });
      expect(shouldUseNative()).toBe(false);

      configureNative({ disableNative: false });
      // Auto-detect: still false since native is not available
      expect(shouldUseNative()).toBe(false);
    });
  });

  describe("debug logging", () => {
    it("logs to stderr when STEAMROLLER_DEBUG=1", () => {
      process.env["STEAMROLLER_DEBUG"] = "1";
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      shouldUseNative();

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[steamroller:native]"),
      );

      stderrSpy.mockRestore();
    });

    it("does not log when STEAMROLLER_DEBUG is not set", () => {
      delete process.env["STEAMROLLER_DEBUG"];
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      shouldUseNative();

      // No calls should contain our prefix
      const nativeCalls = stderrSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("[steamroller:native]"),
      );
      expect(nativeCalls).toHaveLength(0);

      stderrSpy.mockRestore();
    });

    it("logs when configureNative is called with STEAMROLLER_DEBUG=1", () => {
      process.env["STEAMROLLER_DEBUG"] = "1";
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      configureNative({ disableNative: true });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("configureNative"),
      );

      stderrSpy.mockRestore();
    });
  });
});
