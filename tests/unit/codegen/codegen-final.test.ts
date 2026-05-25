import { describe, it, expect } from "vitest";
import {
  concatenateModules,
  type RenderedModule,
  type ConcatenateOptions,
} from "../../../src/codegen/concatenate.js";
import {
  validateOutput,
  createValidationError,
  VALIDATION_ERROR,
} from "../../../src/codegen/validate.js";
import {
  resolveAddon,
  resolveAllAddons,
  applyAddons,
  type ResolvedAddons,
} from "../../../src/codegen/addons.js";

describe("concatenateModules", () => {
  it("concatenates multiple modules with default separator", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "const a = 1;" },
      { id: "mod2", code: "const b = 2;" },
      { id: "mod3", code: "const c = 3;" },
    ];
    const result = concatenateModules(modules);
    expect(result.code).toBe("const a = 1;\n\nconst b = 2;\n\nconst c = 3;");
  });

  it("concatenates with a custom separator", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "const a = 1;" },
      { id: "mod2", code: "const b = 2;" },
    ];
    const result = concatenateModules(modules, { separator: "\n" });
    expect(result.code).toBe("const a = 1;\nconst b = 2;");
  });

  it("handles empty module array", () => {
    const result = concatenateModules([]);
    expect(result.code).toBe("");
    expect(result.map).toEqual([]);
  });

  it("handles a single module", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "only", code: "export const x = 42;" },
    ];
    const result = concatenateModules(modules);
    expect(result.code).toBe("export const x = 42;");
    expect(result.map).toHaveLength(1);
    expect(result.map![0].moduleId).toBe("only");
  });

  it("tracks source positions for source map offsets", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "line1\nline2" },
      { id: "mod2", code: "line3\nline4" },
    ];
    const result = concatenateModules(modules, { separator: "\n" });
    const positions = result.map!;

    expect(positions[0].moduleId).toBe("mod1");
    expect(positions[0].startLine).toBe(0);
    expect(positions[0].startColumn).toBe(0);
    expect(positions[0].startOffset).toBe(0);
    expect(positions[0].endLine).toBe(1);
    expect(positions[0].endOffset).toBe(11);

    expect(positions[1].moduleId).toBe("mod2");
    expect(positions[1].startLine).toBe(2);
    expect(positions[1].startOffset).toBe(12);
    expect(positions[1].endLine).toBe(3);
    expect(positions[1].endOffset).toBe(23);
  });

  it("applies namespace wrappers for modules that need them", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "const x = 1;" },
      { id: "mod2", code: "const y = 2;" },
    ];
    const namespaceMap = new Map([["mod1", "ns_mod1"]]);
    const result = concatenateModules(modules, { namespace: namespaceMap });
    expect(result.code).toContain("var ns_mod1 = (function() {");
    expect(result.code).toContain("const x = 1;");
    expect(result.code).toContain("})();");
    expect(result.code).toContain("const y = 2;");
  });

  it("does not wrap modules without namespace mapping", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "const x = 1;" },
    ];
    const namespaceMap = new Map([["other", "ns_other"]]);
    const result = concatenateModules(modules, { namespace: namespaceMap });
    expect(result.code).toBe("const x = 1;");
  });

  it("uses magicString.toString() when available", () => {
    const mockMagicString = { toString: () => "magic output;" };
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "original;", magicString: mockMagicString },
    ];
    const result = concatenateModules(modules);
    expect(result.code).toBe("magic output;");
  });

  it("includes banner and footer in output", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "const a = 1;" },
    ];
    const options: ConcatenateOptions = {
      banner: "/* banner */",
      footer: "/* footer */",
    };
    const result = concatenateModules(modules, options);
    expect(result.code.startsWith("/* banner */")).toBe(true);
    expect(result.code).toContain("const a = 1;");
    expect(result.code.endsWith("/* footer */")).toBe(true);
  });

  it("handles empty modules with banner and footer", () => {
    const result = concatenateModules([], {
      banner: "/* start */",
      footer: "/* end */",
    });
    expect(result.code).toBe("/* start *//* end */");
  });

  it("tracks positions correctly with banner", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "code" },
    ];
    const result = concatenateModules(modules, { banner: "BAN\n" });
    const pos = result.map![0];
    // "BAN\n" = 1 newline, separator "\n\n" = 2 newlines, total = 3
    expect(pos.startLine).toBe(3);
    expect(pos.startOffset).toBe(6);
  });

  it("handles multiline module code in position tracking", () => {
    const modules: ReadonlyArray<RenderedModule> = [
      { id: "mod1", code: "a\nb\nc" },
    ];
    const result = concatenateModules(modules);
    const pos = result.map![0];
    expect(pos.startLine).toBe(0);
    expect(pos.endLine).toBe(2);
  });
});

describe("validateOutput", () => {
  it("returns valid: true for valid JavaScript", () => {
    const result = validateOutput("const x = 42;", "output.js");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid: true for valid module code", () => {
    const result = validateOutput(
      'import { foo } from "./bar.js";\nexport const baz = foo();',
      "bundle.mjs",
    );
    expect(result.valid).toBe(true);
  });

  it("returns valid: false with error for invalid code", () => {
    const result = validateOutput("const = ;", "broken.js");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain(VALIDATION_ERROR);
    expect(result.error).toContain("broken.js");
  });

  it("returns valid: false for unterminated strings", () => {
    const result = validateOutput('const x = "unterminated', "bad.js");
    expect(result.valid).toBe(false);
    expect(result.error).toContain(VALIDATION_ERROR);
    expect(result.error).toContain("bad.js");
  });

  it("returns valid: true for empty string (valid empty module)", () => {
    const result = validateOutput("", "empty.js");
    expect(result.valid).toBe(true);
  });

  it("returns valid: false for unexpected tokens", () => {
    const result = validateOutput("function {}", "invalid.js");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid.js");
  });

  it("includes the file name in error messages", () => {
    const result = validateOutput("@@@", "myfile.js");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("myfile.js");
  });
});

describe("createValidationError", () => {
  it("creates a structured validation error", () => {
    const err = createValidationError("Unexpected token", "output.js");
    expect(err.code).toBe(VALIDATION_ERROR);
    expect(err.fileName).toBe("output.js");
    expect(err.message).toContain("Unexpected token");
    expect(err.message).toContain("output.js");
    expect(err.message).toContain(VALIDATION_ERROR);
  });
});

describe("resolveAddon", () => {
  it("resolves null to empty string", async () => {
    const result = await resolveAddon(null);
    expect(result).toBe("");
  });

  it("resolves undefined to empty string", async () => {
    const result = await resolveAddon(undefined);
    expect(result).toBe("");
  });

  it("resolves a string value directly", async () => {
    const result = await resolveAddon("/* banner */");
    expect(result).toBe("/* banner */");
  });

  it("resolves a sync function", async () => {
    const result = await resolveAddon(() => "/* generated */");
    expect(result).toBe("/* generated */");
  });

  it("resolves an async function", async () => {
    const result = await resolveAddon(async () => "/* async banner */");
    expect(result).toBe("/* async banner */");
  });

  it("resolves empty string", async () => {
    const result = await resolveAddon("");
    expect(result).toBe("");
  });
});

describe("resolveAllAddons", () => {
  it("resolves all addon values", async () => {
    const result = await resolveAllAddons({
      banner: "/* banner */",
      footer: "/* footer */",
      intro: "// intro",
      outro: "// outro",
    });
    expect(result.banner).toBe("/* banner */");
    expect(result.footer).toBe("/* footer */");
    expect(result.intro).toBe("// intro");
    expect(result.outro).toBe("// outro");
  });

  it("resolves mixed value types", async () => {
    const result = await resolveAllAddons({
      banner: () => "fn banner",
      footer: async () => "async footer",
      intro: "string intro",
      outro: null,
    });
    expect(result.banner).toBe("fn banner");
    expect(result.footer).toBe("async footer");
    expect(result.intro).toBe("string intro");
    expect(result.outro).toBe("");
  });

  it("handles all undefined/null values", async () => {
    const result = await resolveAllAddons({});
    expect(result.banner).toBe("");
    expect(result.footer).toBe("");
    expect(result.intro).toBe("");
    expect(result.outro).toBe("");
  });
});

describe("applyAddons", () => {
  it("applies banner before everything", () => {
    const addons: ResolvedAddons = {
      banner: "/* banner */",
      footer: "",
      intro: "",
      outro: "",
    };
    const result = applyAddons("const x = 1;", addons);
    expect(result).toBe("/* banner */\nconst x = 1;");
  });

  it("applies footer after everything", () => {
    const addons: ResolvedAddons = {
      banner: "",
      footer: "/* footer */",
      intro: "",
      outro: "",
    };
    const result = applyAddons("const x = 1;", addons);
    expect(result).toBe("const x = 1;\n/* footer */");
  });

  it("applies intro at the start of wrapper body", () => {
    const addons: ResolvedAddons = {
      banner: "",
      footer: "",
      intro: '"use strict";',
      outro: "",
    };
    const result = applyAddons("const x = 1;", addons);
    expect(result).toBe('"use strict";\nconst x = 1;');
  });

  it("applies outro at the end of wrapper body", () => {
    const addons: ResolvedAddons = {
      banner: "",
      footer: "",
      intro: "",
      outro: "// end",
    };
    const result = applyAddons("const x = 1;", addons);
    expect(result).toBe("const x = 1;\n// end");
  });

  it("applies all addons in correct order", () => {
    const addons: ResolvedAddons = {
      banner: "/* banner */",
      footer: "/* footer */",
      intro: "// intro",
      outro: "// outro",
    };
    const result = applyAddons("CODE", addons);
    expect(result).toBe("/* banner */\n// intro\nCODE\n// outro\n/* footer */");
  });

  it("handles empty code with all addons", () => {
    const addons: ResolvedAddons = {
      banner: "B",
      footer: "F",
      intro: "I",
      outro: "",
    };
    const result = applyAddons("", addons);
    // banner + \n + intro + \n + code("") -> ends with \n -> footer appended
    expect(result).toBe("B\nI\nF");
  });

  it("handles empty code with banner and footer only", () => {
    const addons: ResolvedAddons = {
      banner: "B",
      footer: "F",
      intro: "",
      outro: "",
    };
    const result = applyAddons("", addons);
    // banner + \n + code("") -> current is "B\n" ends with \n -> footer appended
    expect(result).toBe("B\nF");
  });

  it("handles all empty addons", () => {
    const addons: ResolvedAddons = {
      banner: "",
      footer: "",
      intro: "",
      outro: "",
    };
    const result = applyAddons("const x = 1;", addons);
    expect(result).toBe("const x = 1;");
  });

  it("handles code ending with newline", () => {
    const addons: ResolvedAddons = {
      banner: "",
      footer: "",
      intro: "",
      outro: "// end",
    };
    const result = applyAddons("const x = 1;\n", addons);
    expect(result).toBe("const x = 1;\n// end");
  });

  it("does not add extra newlines when banner ends with newline", () => {
    const addons: ResolvedAddons = {
      banner: "/* banner */\n",
      footer: "",
      intro: "",
      outro: "",
    };
    const result = applyAddons("code", addons);
    expect(result).toBe("/* banner */\n\ncode");
  });
});
