/**
 * Integration tests for TypeScript support.
 *
 * Tests the full pipeline from TypeScript source through the plugin
 * to JavaScript output.
 */

import { describe, it, expect } from "vitest";
import {
  typescriptPlugin,
  isTypeScriptFile,
  transformTypescriptAST,
} from "../../src/plugins/typescript-plugin.js";

// ============================================================
// Auto-detection
// ============================================================

describe("TypeScript auto-detection", () => {
  it("detects .ts files", () => {
    expect(isTypeScriptFile("foo.ts")).toBe(true);
  });

  it("detects .tsx files", () => {
    expect(isTypeScriptFile("foo.tsx")).toBe(true);
  });

  it("rejects .d.ts files", () => {
    expect(isTypeScriptFile("foo.d.ts")).toBe(false);
  });

  it("rejects .js files", () => {
    expect(isTypeScriptFile("foo.js")).toBe(false);
  });

  it("rejects .jsx files", () => {
    expect(isTypeScriptFile("foo.jsx")).toBe(false);
  });
});

// ============================================================
// AST-based TypeScript transform
// ============================================================

describe("TypeScript AST transform integration", () => {
  it("transforms a .ts file with enums", () => {
    const code = `
enum Color { Red, Green, Blue }

const favorite: Color = Color.Red;
console.log(favorite);
`;
    const result = transformTypescriptAST(code, "test.ts");
    expect(result).not.toBeNull();
    expect(result!).toContain("var Color;");
    expect(result!).toContain("(function(Color)");
    expect(result!).toContain('Color[Color["Red"] = 0] = "Red"');
    // Original code preserved
    expect(result!).toContain("console.log(favorite)");
  });

  it("transforms a .ts file with namespaces", () => {
    const code = `
namespace Utils {
  export const VERSION = "1.0.0";
  export function greet(name: string): string {
    return "Hello, " + name;
  }
}
`;
    const result = transformTypescriptAST(code, "test.ts");
    expect(result).not.toBeNull();
    expect(result!).toContain("var Utils;");
    expect(result!).toContain("(function(Utils)");
    expect(result!).toContain("Utils.VERSION = VERSION;");
  });

  it("removes type-only imports", () => {
    const code = `
import type { Foo } from "./types";
import { bar } from "./utils";

const x = bar();
`;
    const result = transformTypescriptAST(code, "test.ts");
    expect(result).not.toBeNull();
    // Type import removed
    expect(result!).not.toContain("import type");
    // Value import preserved
    expect(result!).toContain('import { bar } from "./utils"');
  });

  it("removes interfaces and type aliases", () => {
    const code = `
interface Config {
  host: string;
  port: number;
}

type Status = "active" | "inactive";

const config: Config = { host: "localhost", port: 3000 };
`;
    const result = transformTypescriptAST(code, "test.ts");
    expect(result).not.toBeNull();
    expect(result!).not.toContain("interface Config");
    expect(result!).not.toContain("type Status");
  });

  it("handles complex TypeScript file with multiple features", () => {
    const code = `interface User {
  name: string;
  age: number;
}
type UserOrNull = User | null;
enum Role {
  Admin = "admin",
  User = "user",
  Guest = "guest"
}
const enum Priority {
  Low = 0,
  Medium = 1,
  High = 2
}
export function getUser(id: number) {
  return null;
}
const role = Role.Admin;
`;
    const result = transformTypescriptAST(code, "test.ts");
    expect(result).not.toBeNull();
    // Interfaces and types stripped
    expect(result!).not.toContain("interface User");
    expect(result!).not.toContain("type UserOrNull");
    // Regular enum transformed
    expect(result!).toContain("var Role;");
    expect(result!).toContain('Role["Admin"] = "admin"');
    // Const enum stripped
    expect(result!).not.toContain("const enum");
    // Functions preserved
    expect(result!).toContain("export function getUser");
  });
});

// ============================================================
// Plugin integration
// ============================================================

describe("TypeScript plugin", () => {
  it("creates a plugin with correct name", () => {
    const plugin = typescriptPlugin();
    expect(plugin.name).toBe("steamroller:typescript");
  });

  it("returns null for non-TypeScript files", () => {
    const plugin = typescriptPlugin();
    const result = (plugin.transform as Function).call(
      {},
      "const x = 1;",
      "test.js",
    );
    expect(result).toBeNull();
  });

  it("transforms TypeScript files", () => {
    const plugin = typescriptPlugin();
    const code = "interface Foo { x: number; }\nconst y = 42;";
    const result = (plugin.transform as Function).call(
      { warn: () => {} },
      code,
      "test.ts",
    );
    expect(result).not.toBeNull();
    expect(result.code).toBeDefined();
  });
});
