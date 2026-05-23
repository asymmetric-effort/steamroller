import { describe, it, expect } from "vitest";
import {
  createFilter,
  dataToEsm,
  addExtension,
  makeLegalIdentifier,
  extractAssignedNames,
  attachScopes,
} from "../../../src/utils/pluginutils.js";
import type {
  DataToEsmOptions,
  AstNode,
  FilterPattern,
} from "../../../src/utils/pluginutils.js";

// ---------------------------------------------------------------------------
// createFilter
// ---------------------------------------------------------------------------

describe("createFilter", () => {
  it("matches everything when called with no arguments", () => {
    const filter = createFilter();
    expect(filter("foo.ts")).toBe(true);
    expect(filter("bar/baz.js")).toBe(true);
    expect(filter("")).toBe(true);
  });

  it("filters by a single string include pattern", () => {
    const filter = createFilter("*.ts");
    expect(filter("foo.ts")).toBe(true);
    expect(filter("foo.js")).toBe(false);
  });

  it("filters by a RegExp include pattern", () => {
    const filter = createFilter(/\.tsx?$/);
    expect(filter("component.tsx")).toBe(true);
    expect(filter("component.ts")).toBe(true);
    expect(filter("component.js")).toBe(false);
  });

  it("excludes overrides include", () => {
    const filter = createFilter("*.ts", "secret.ts");
    expect(filter("foo.ts")).toBe(true);
    expect(filter("secret.ts")).toBe(false);
  });

  it("accepts an array of include patterns", () => {
    const filter = createFilter(["*.ts", "*.tsx"]);
    expect(filter("a.ts")).toBe(true);
    expect(filter("b.tsx")).toBe(true);
    expect(filter("c.js")).toBe(false);
  });

  it("accepts an array of exclude patterns", () => {
    const filter = createFilter(undefined, ["*.test.ts", "*.spec.ts"]);
    expect(filter("foo.ts")).toBe(true);
    expect(filter("foo.test.ts")).toBe(false);
    expect(filter("foo.spec.ts")).toBe(false);
  });

  it("handles mixed string and RegExp in arrays", () => {
    const filter = createFilter(["*.ts", /\.jsx$/]);
    expect(filter("a.ts")).toBe(true);
    expect(filter("b.jsx")).toBe(true);
    expect(filter("c.css")).toBe(false);
  });

  it("handles glob patterns with directories", () => {
    const filter = createFilter("src/**");
    expect(filter("src/foo.ts")).toBe(true);
    expect(filter("src/nested/bar.ts")).toBe(true);
    expect(filter("lib/foo.ts")).toBe(false);
  });

  it("handles null include (matches everything)", () => {
    const filter = createFilter(null);
    expect(filter("anything.ts")).toBe(true);
  });

  it("handles undefined exclude (excludes nothing)", () => {
    const filter = createFilter("*.ts", undefined);
    expect(filter("foo.ts")).toBe(true);
    expect(filter("foo.js")).toBe(false);
  });

  it("handles null exclude (excludes nothing)", () => {
    const filter = createFilter("*.ts", null);
    expect(filter("foo.ts")).toBe(true);
  });

  it("normalises backslashes in ids", () => {
    const filter = createFilter("src/**");
    expect(filter("src\\foo.ts")).toBe(true);
  });

  it("returns false when id matches no include pattern", () => {
    const filter = createFilter(["*.ts"]);
    expect(filter("main.js")).toBe(false);
    expect(filter("readme.md")).toBe(false);
  });

  it("handles RegExp in exclude array", () => {
    const filter = createFilter(undefined, [/node_modules/]);
    expect(filter("src/index.ts")).toBe(true);
    expect(filter("node_modules/foo/bar.js")).toBe(false);
  });

  it("handles empty array patterns", () => {
    const filter = createFilter([]);
    // No include matchers means hasInclude is false, so everything passes
    expect(filter("anything")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dataToEsm
// ---------------------------------------------------------------------------

describe("dataToEsm", () => {
  it("serialises a string value", () => {
    const result = dataToEsm("hello", { namedExports: false });
    expect(result).toContain('export default "hello"');
  });

  it("serialises a number", () => {
    const result = dataToEsm(42, { namedExports: false });
    expect(result).toContain("export default 42");
  });

  it("serialises a boolean", () => {
    const result = dataToEsm(true, { namedExports: false });
    expect(result).toContain("export default true");
  });

  it("serialises null", () => {
    const result = dataToEsm(null, { namedExports: false });
    expect(result).toContain("export default null");
  });

  it("serialises undefined", () => {
    const result = dataToEsm(undefined, { namedExports: false });
    expect(result).toContain("export default undefined");
  });

  it("serialises an object with namedExports=true (default)", () => {
    const result = dataToEsm({ foo: "bar", count: 1 });
    expect(result).toContain('export var foo = "bar"');
    expect(result).toContain("export var count = 1");
  });

  it("serialises an object with namedExports=false", () => {
    const result = dataToEsm({ a: 1 }, { namedExports: false });
    expect(result).toContain("export default");
    expect(result).toContain("a: 1");
  });

  it("serialises arrays", () => {
    const result = dataToEsm([1, 2, 3], { namedExports: false });
    expect(result).toContain("export default");
    expect(result).toContain("1");
    expect(result).toContain("2");
    expect(result).toContain("3");
  });

  it("serialises nested objects", () => {
    const result = dataToEsm(
      { outer: { inner: "value" } },
      { namedExports: true },
    );
    expect(result).toContain("export var outer");
    expect(result).toContain('inner: "value"');
  });

  it("uses compact mode", () => {
    const result = dataToEsm({ a: 1, b: 2 }, { compact: true });
    // Compact: no spaces around assignment, no newlines
    expect(result).not.toContain("\n");
    expect(result).toContain("export var a =1;");
  });

  it("uses compact mode with nested objects", () => {
    const result = dataToEsm(
      { nested: { x: 1 } },
      { compact: true, namedExports: false },
    );
    expect(result).toContain("x:1");
    expect(result).not.toContain("\n");
  });

  it("uses preferConst", () => {
    const result = dataToEsm({ x: 10 }, { preferConst: true });
    expect(result).toContain("export const x");
  });

  it("uses custom indent", () => {
    const result = dataToEsm(
      { nested: { deep: true } },
      { indent: "  " },
    );
    expect(result).toContain("  deep: true");
  });

  it("handles empty objects with namedExports=true", () => {
    const result = dataToEsm({});
    expect(result).toBe("");
  });

  it("handles empty arrays", () => {
    const result = dataToEsm([], { namedExports: false });
    expect(result).toContain("[]");
  });

  it("handles empty nested objects", () => {
    const result = dataToEsm({ a: {} });
    expect(result).toContain("{}");
  });

  it("handles RegExp values", () => {
    const result = dataToEsm({ pattern: /foo/g }, { namedExports: true });
    expect(result).toContain("/foo/g");
  });

  it("handles Date values", () => {
    const d = new Date("2024-01-01T00:00:00.000Z");
    const result = dataToEsm({ created: d });
    expect(result).toContain("new Date(");
    expect(result).toContain("2024-01-01");
  });

  it("quotes non-identifier object keys", () => {
    const result = dataToEsm({ "foo-bar": 1 }, { namedExports: false });
    expect(result).toContain('"foo-bar"');
  });

  it("does not quote valid identifier keys", () => {
    const result = dataToEsm({ valid: 1 }, { namedExports: false });
    expect(result).toContain("valid:");
    expect(result).not.toContain('"valid"');
  });

  it("handles non-object data with namedExports=true (falls through to default)", () => {
    const result = dataToEsm(42);
    expect(result).toContain("export default 42");
  });

  it("serialises with default options when no options provided", () => {
    const result = dataToEsm({ key: "value" });
    expect(result).toContain("export var key");
    expect(result).toContain("var");
  });

  it("default indent is tab for nested objects", () => {
    const result = dataToEsm({ o: { k: 1 } });
    expect(result).toContain("\tk: 1");
  });

  it("quotes reserved-word keys in objects", () => {
    const result = dataToEsm({ nested: { class: "x" } }, { namedExports: false });
    expect(result).toContain('"class"');
  });

  it("makes illegal identifier keys legal in named exports", () => {
    const result = dataToEsm({ "my-var": 1 }, { namedExports: true });
    expect(result).toContain("export var my_var");
  });

  it("handles arrays with mixed types", () => {
    const result = dataToEsm([1, "two", true, null], { namedExports: false });
    expect(result).toContain("1");
    expect(result).toContain('"two"');
    expect(result).toContain("true");
    expect(result).toContain("null");
  });

  it("compact mode with namedExports=false", () => {
    const result = dataToEsm({ a: 1 }, { namedExports: false, compact: true });
    expect(result).toContain("export default{a:1};");
  });

  it("handles object with null prototype", () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj["key"] = "value";
    const result = dataToEsm(obj);
    expect(result).toContain("export var key");
  });

  it("handles empty string key in object", () => {
    const result = dataToEsm({ "": "empty" }, { namedExports: false });
    expect(result).toContain('""');
  });

  it("handles Date in array", () => {
    const d = new Date("2024-06-15T00:00:00.000Z");
    const result = dataToEsm([d], { namedExports: false });
    expect(result).toContain("new Date(");
  });

  it("handles RegExp in array", () => {
    const result = dataToEsm([/test/i], { namedExports: false });
    expect(result).toContain("/test/i");
  });

  it("treats array at top level as non-object (default export)", () => {
    // Array is not a plain object, so namedExports=true still produces default
    const result = dataToEsm([1, 2]);
    expect(result).toContain("export default");
  });

  it("treats RegExp at top level as non-object (default export)", () => {
    const result = dataToEsm(/abc/);
    expect(result).toContain("export default /abc/");
  });

  it("treats Date at top level as non-object (default export)", () => {
    const result = dataToEsm(new Date("2024-01-01T00:00:00.000Z"));
    expect(result).toContain("export default new Date(");
  });

  it("handles null at top level with namedExports=true (falls to default)", () => {
    const result = dataToEsm(null);
    expect(result).toContain("export default null");
  });

  it("handles class instances via JSON fallback", () => {
    // A class instance is not a plain object, Date, RegExp, or primitive
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class Custom {
      readonly x = 1;
    }
    const result = dataToEsm({ val: new Custom() });
    expect(result).toContain('"x":1');
  });
});

// ---------------------------------------------------------------------------
// addExtension
// ---------------------------------------------------------------------------

describe("addExtension", () => {
  it("adds .js when no extension is present", () => {
    expect(addExtension("foo")).toBe("foo.js");
  });

  it("preserves an existing extension", () => {
    expect(addExtension("foo.ts")).toBe("foo.ts");
  });

  it("uses a custom extension", () => {
    expect(addExtension("bar", ".mjs")).toBe("bar.mjs");
  });

  it("preserves path with directory and existing extension", () => {
    expect(addExtension("src/utils/index.ts")).toBe("src/utils/index.ts");
  });

  it("adds extension to filename with directory but no extension", () => {
    expect(addExtension("src/utils/index")).toBe("src/utils/index.js");
  });

  it("does not add extension when dotfile-like basename has leading dot only", () => {
    // A dot at position 0 of the basename is not treated as having an extension
    expect(addExtension(".gitignore")).toBe(".gitignore.js");
  });

  it("preserves filename that already has the default extension", () => {
    expect(addExtension("main.js")).toBe("main.js");
  });

  it("handles empty string", () => {
    expect(addExtension("")).toBe(".js");
  });
});

// ---------------------------------------------------------------------------
// makeLegalIdentifier
// ---------------------------------------------------------------------------

describe("makeLegalIdentifier", () => {
  it("returns a simple valid identifier unchanged", () => {
    expect(makeLegalIdentifier("foo")).toBe("foo");
  });

  it("replaces dashes with underscores", () => {
    expect(makeLegalIdentifier("my-var")).toBe("my_var");
  });

  it("replaces spaces with underscores", () => {
    expect(makeLegalIdentifier("hello world")).toBe("hello_world");
  });

  it("prefixes with underscore when starting with a digit", () => {
    expect(makeLegalIdentifier("123abc")).toBe("_123abc");
  });

  it("prefixes reserved words with underscore", () => {
    expect(makeLegalIdentifier("class")).toBe("_class");
    expect(makeLegalIdentifier("return")).toBe("_return");
    expect(makeLegalIdentifier("const")).toBe("_const");
  });

  it("replaces multiple special characters", () => {
    expect(makeLegalIdentifier("a@b#c")).toBe("a_b_c");
  });

  it("preserves dollar signs", () => {
    expect(makeLegalIdentifier("$scope")).toBe("$scope");
  });

  it("preserves underscores", () => {
    expect(makeLegalIdentifier("_private")).toBe("_private");
  });

  it("handles empty string", () => {
    expect(makeLegalIdentifier("")).toBe("");
  });

  it("handles string that is entirely special characters", () => {
    const result = makeLegalIdentifier("---");
    expect(result).toBe("___");
  });
});

// ---------------------------------------------------------------------------
// extractAssignedNames
// ---------------------------------------------------------------------------

describe("extractAssignedNames", () => {
  it("extracts name from a simple Identifier", () => {
    const node: AstNode = { type: "Identifier", name: "x" };
    expect(extractAssignedNames(node)).toEqual(["x"]);
  });

  it("extracts names from an ObjectPattern", () => {
    const node: AstNode = {
      type: "ObjectPattern",
      properties: [
        {
          type: "Property",
          key: { type: "Identifier", name: "a" },
          value: { type: "Identifier", name: "a" },
        },
        {
          type: "Property",
          key: { type: "Identifier", name: "b" },
          value: { type: "Identifier", name: "b" },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["a", "b"]);
  });

  it("extracts names from an ArrayPattern", () => {
    const node: AstNode = {
      type: "ArrayPattern",
      elements: [
        { type: "Identifier", name: "x" },
        { type: "Identifier", name: "y" },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["x", "y"]);
  });

  it("extracts names from nested patterns", () => {
    const node: AstNode = {
      type: "ObjectPattern",
      properties: [
        {
          type: "Property",
          key: { type: "Identifier", name: "a" },
          value: {
            type: "ArrayPattern",
            elements: [
              { type: "Identifier", name: "b" },
              { type: "Identifier", name: "c" },
            ],
          },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["b", "c"]);
  });

  it("extracts names from RestElement", () => {
    const node: AstNode = {
      type: "ArrayPattern",
      elements: [
        { type: "Identifier", name: "first" },
        {
          type: "RestElement",
          argument: { type: "Identifier", name: "rest" },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["first", "rest"]);
  });

  it("extracts names from AssignmentPattern", () => {
    const node: AstNode = {
      type: "AssignmentPattern",
      left: { type: "Identifier", name: "x" },
    };
    expect(extractAssignedNames(node)).toEqual(["x"]);
  });

  it("handles ArrayPattern with null elements (holes)", () => {
    const node: AstNode = {
      type: "ArrayPattern",
      elements: [
        { type: "Identifier", name: "a" },
        null,
        { type: "Identifier", name: "c" },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["a", "c"]);
  });

  it("handles ObjectPattern with RestElement", () => {
    const node: AstNode = {
      type: "ObjectPattern",
      properties: [
        {
          type: "Property",
          key: { type: "Identifier", name: "a" },
          value: { type: "Identifier", name: "a" },
        },
        {
          type: "RestElement",
          argument: { type: "Identifier", name: "rest" },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["a", "rest"]);
  });

  it("handles deeply nested destructuring", () => {
    const node: AstNode = {
      type: "ObjectPattern",
      properties: [
        {
          type: "Property",
          key: { type: "Identifier", name: "a" },
          value: {
            type: "ObjectPattern",
            properties: [
              {
                type: "Property",
                key: { type: "Identifier", name: "b" },
                value: {
                  type: "ArrayPattern",
                  elements: [{ type: "Identifier", name: "c" }],
                },
              },
            ],
          },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["c"]);
  });

  it("returns empty array for an unknown node type", () => {
    const node: AstNode = { type: "Literal" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles Identifier without name", () => {
    const node: AstNode = { type: "Identifier" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles ObjectPattern without properties", () => {
    const node: AstNode = { type: "ObjectPattern" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles ArrayPattern without elements", () => {
    const node: AstNode = { type: "ArrayPattern" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles RestElement without argument", () => {
    const node: AstNode = { type: "RestElement" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles AssignmentPattern without left", () => {
    const node: AstNode = { type: "AssignmentPattern" };
    expect(extractAssignedNames(node)).toEqual([]);
  });

  it("handles nested AssignmentPattern in ArrayPattern", () => {
    const node: AstNode = {
      type: "ArrayPattern",
      elements: [
        {
          type: "AssignmentPattern",
          left: { type: "Identifier", name: "x" },
        },
      ],
    };
    expect(extractAssignedNames(node)).toEqual(["x"]);
  });
});

// ---------------------------------------------------------------------------
// attachScopes (stub)
// ---------------------------------------------------------------------------

describe("attachScopes", () => {
  it("exists as a stub and returns void", () => {
    const result = attachScopes();
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Type-level coverage (ensure types are exported and usable)
// ---------------------------------------------------------------------------

describe("type exports", () => {
  it("DataToEsmOptions is usable", () => {
    const opts: DataToEsmOptions = {
      indent: "  ",
      preferConst: true,
      namedExports: false,
      compact: false,
    };
    expect(opts.indent).toBe("  ");
  });

  it("AstNode is usable", () => {
    const node: AstNode = { type: "Identifier", name: "x" };
    expect(node.type).toBe("Identifier");
  });

  it("FilterPattern accepts null", () => {
    const p: FilterPattern = null;
    expect(p).toBeNull();
  });

  it("FilterPattern accepts array", () => {
    const p: FilterPattern = ["*.ts", /\.js$/];
    expect(Array.isArray(p)).toBe(true);
  });
});
