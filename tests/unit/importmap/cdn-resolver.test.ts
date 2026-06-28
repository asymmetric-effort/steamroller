/**
 * @module tests/unit/importmap/cdn-resolver
 * @description Unit tests for CDN URL resolution of bare specifiers.
 */

import { describe, it, expect } from "bun:test";
import {
  resolveToCdn,
  parseSpecifier,
  getCdnBaseUrl,
} from "../../../src/importmap/cdn-resolver.js";

describe("parseSpecifier", () => {
  it("parses a plain package name", () => {
    expect(parseSpecifier("lodash")).toEqual({
      packageName: "lodash",
      subpath: "",
    });
  });

  it("parses a plain package with subpath", () => {
    expect(parseSpecifier("lodash/merge")).toEqual({
      packageName: "lodash",
      subpath: "merge",
    });
  });

  it("parses a plain package with deep subpath", () => {
    expect(parseSpecifier("lodash/fp/merge")).toEqual({
      packageName: "lodash",
      subpath: "fp/merge",
    });
  });

  it("parses a scoped package name", () => {
    expect(parseSpecifier("@vue/reactivity")).toEqual({
      packageName: "@vue/reactivity",
      subpath: "",
    });
  });

  it("parses a scoped package with subpath", () => {
    expect(parseSpecifier("@vue/reactivity/dist/index")).toEqual({
      packageName: "@vue/reactivity",
      subpath: "dist/index",
    });
  });

  it("handles a scope-only specifier without name", () => {
    expect(parseSpecifier("@scope")).toEqual({
      packageName: "@scope",
      subpath: "",
    });
  });

  it("returns empty for empty string", () => {
    expect(parseSpecifier("")).toEqual({ packageName: "", subpath: "" });
  });

  it("trims whitespace around the specifier", () => {
    expect(parseSpecifier("  lodash  ")).toEqual({
      packageName: "lodash",
      subpath: "",
    });
  });
});

describe("resolveToCdn", () => {
  it("resolves a package to esm.sh by default", () => {
    expect(resolveToCdn("react", "18.2.0")).toBe("https://esm.sh/react@18.2.0");
  });

  it("resolves without version when version is empty", () => {
    expect(resolveToCdn("react", "")).toBe("https://esm.sh/react");
  });

  it("resolves a package with subpath", () => {
    expect(resolveToCdn("lodash/merge", "4.17.21")).toBe(
      "https://esm.sh/lodash@4.17.21/merge",
    );
  });

  it("resolves to unpkg CDN", () => {
    expect(resolveToCdn("react", "18.2.0", "unpkg")).toBe(
      "https://unpkg.com/react@18.2.0",
    );
  });

  it("resolves to jsdelivr CDN", () => {
    expect(resolveToCdn("react", "18.2.0", "jsdelivr")).toBe(
      "https://cdn.jsdelivr.net/npm/react@18.2.0",
    );
  });

  it("resolves to skypack CDN", () => {
    expect(resolveToCdn("react", "18.2.0", "skypack")).toBe(
      "https://cdn.skypack.dev/react@18.2.0",
    );
  });

  it("resolves a scoped package to CDN", () => {
    expect(resolveToCdn("@vue/reactivity", "3.3.4")).toBe(
      "https://esm.sh/@vue/reactivity@3.3.4",
    );
  });

  it("resolves a scoped package with subpath to CDN", () => {
    expect(resolveToCdn("@vue/reactivity/dist/index", "3.3.4")).toBe(
      "https://esm.sh/@vue/reactivity@3.3.4/dist/index",
    );
  });

  it("returns just the base URL for empty specifier", () => {
    expect(resolveToCdn("", "", "esm.sh")).toBe("https://esm.sh/");
  });
});

describe("getCdnBaseUrl", () => {
  it("returns the esm.sh base URL", () => {
    expect(getCdnBaseUrl("esm.sh")).toBe("https://esm.sh/");
  });

  it("returns the unpkg base URL", () => {
    expect(getCdnBaseUrl("unpkg")).toBe("https://unpkg.com/");
  });

  it("returns the jsdelivr base URL", () => {
    expect(getCdnBaseUrl("jsdelivr")).toBe("https://cdn.jsdelivr.net/npm/");
  });

  it("returns the skypack base URL", () => {
    expect(getCdnBaseUrl("skypack")).toBe("https://cdn.skypack.dev/");
  });
});
