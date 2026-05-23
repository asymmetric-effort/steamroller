/**
 * Tests for src/utils/arg-parser.ts
 *
 * Covers long/short flags, boolean negation, dot notation,
 * arrays, aliases, defaults, positionals, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { parseArgs } from "../../../src/utils/arg-parser";
import type { ParsedArgs, ParserOptions } from "../../../src/utils/arg-parser";

describe("parseArgs", () => {
  describe("empty and trivial inputs", () => {
    it("returns empty positional array for no arguments", () => {
      const result = parseArgs([]);
      expect(result._).toEqual([]);
    });

    it("returns empty positional array when called with no options", () => {
      const result = parseArgs([], undefined);
      expect(result._).toEqual([]);
    });

    it("returns frozen result", () => {
      const result = parseArgs(["--foo", "bar"]);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("returns frozen positional array", () => {
      const result = parseArgs(["hello"]);
      expect(Object.isFrozen(result._)).toBe(true);
    });
  });

  describe("long flags", () => {
    it("parses --flag=value with equals sign", () => {
      const result = parseArgs(["--name=alice"]);
      expect(result["name"]).toBe("alice");
    });

    it("parses --flag value with space separator", () => {
      const result = parseArgs(["--name", "alice"]);
      expect(result["name"]).toBe("alice");
    });

    it("parses --flag as boolean true when standalone", () => {
      const result = parseArgs(["--verbose"], { boolean: ["verbose"] });
      expect(result["verbose"]).toBe(true);
    });

    it("parses --flag as boolean true for unknown flags with no next value", () => {
      const result = parseArgs(["--verbose"]);
      expect(result["verbose"]).toBe(true);
    });

    it("treats --flag=true as boolean true on untyped flag", () => {
      const result = parseArgs(["--flag=true"]);
      expect(result["flag"]).toBe(true);
    });

    it("treats --flag=false as boolean false on untyped flag", () => {
      const result = parseArgs(["--flag=false"]);
      expect(result["flag"]).toBe(false);
    });

    it("coerces numeric string to number for untyped flag", () => {
      const result = parseArgs(["--port=8080"]);
      expect(result["port"]).toBe(8080);
    });

    it("coerces negative numbers", () => {
      const result = parseArgs(["--offset=-10"]);
      expect(result["offset"]).toBe(-10);
    });

    it("coerces floating point numbers", () => {
      const result = parseArgs(["--ratio=3.14"]);
      expect(result["ratio"]).toBe(3.14);
    });

    it("parses --flag=value with empty value", () => {
      const result = parseArgs(["--name="]);
      expect(result["name"]).toBe("");
    });

    it("does not consume next arg starting with - as value for unknown flag", () => {
      const result = parseArgs(["--foo", "--bar"]);
      expect(result["foo"]).toBe(true);
      expect(result["bar"]).toBe(true);
    });
  });

  describe("short flags", () => {
    it("parses -f as boolean true for known boolean", () => {
      const result = parseArgs(["-v"], { boolean: ["v"] });
      expect(result["v"]).toBe(true);
    });

    it("parses -f value with space separator", () => {
      const result = parseArgs(["-n", "alice"]);
      expect(result["n"]).toBe("alice");
    });

    it("parses -fvalue as flag with attached value", () => {
      const result = parseArgs(["-n42"], { string: ["n"] });
      expect(result["n"]).toBe("42");
    });

    it("parses combined boolean short flags -abc", () => {
      const result = parseArgs(["-abc"], { boolean: ["a", "b", "c"] });
      expect(result["a"]).toBe(true);
      expect(result["b"]).toBe(true);
      expect(result["c"]).toBe(true);
    });

    it("parses -f as true for unknown single-char flag with no next value", () => {
      const result = parseArgs(["-z"]);
      expect(result["z"]).toBe(true);
    });

    it("parses -f value where value is next arg for unknown flag", () => {
      const result = parseArgs(["-z", "hello"]);
      expect(result["z"]).toBe("hello");
    });

    it("does not consume next arg starting with - as value for short flag", () => {
      const result = parseArgs(["-z", "-x"]);
      expect(result["z"]).toBe(true);
      expect(result["x"]).toBe(true);
    });

    it("treats unknown multi-char short as value attached to first char", () => {
      const result = parseArgs(["-xhello"]);
      expect(result["x"]).toBe("hello");
    });
  });

  describe("boolean negation (--no-flag)", () => {
    it("sets known boolean flag to false with --no-flag", () => {
      const result = parseArgs(["--no-verbose"], { boolean: ["verbose"] });
      expect(result["verbose"]).toBe(false);
    });

    it("treats --no-flag as literal flag name for non-booleans", () => {
      const result = parseArgs(["--no-thing", "val"]);
      expect(result["no-thing"]).toBe("val");
    });

    it("handles --no-flag with alias", () => {
      const result = parseArgs(["--no-verbose"], {
        boolean: ["verbose"],
        alias: { verbose: "v" },
      });
      expect(result["verbose"]).toBe(false);
    });
  });

  describe("dot notation", () => {
    it("creates nested object from --foo.bar=baz", () => {
      const result = parseArgs(["--foo.bar=baz"]);
      expect(result["foo"]).toEqual({ bar: "baz" });
    });

    it("creates deeply nested object", () => {
      const result = parseArgs(["--a.b.c=deep"]);
      expect(result["a"]).toEqual({ b: { c: "deep" } });
    });

    it("merges multiple dot-notation flags", () => {
      const result = parseArgs(["--server.host=localhost", "--server.port=3000"]);
      expect(result["server"]).toEqual({ host: "localhost", port: 3000 });
    });

    it("handles dot notation with space value", () => {
      const result = parseArgs(["--db.name", "mydb"]);
      expect(result["db"]).toEqual({ name: "mydb" });
    });
  });

  describe("array accumulation", () => {
    it("accumulates repeated --flag values into array", () => {
      const result = parseArgs(["--tag", "a", "--tag", "b"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a", "b"]);
    });

    it("wraps single array flag value in array", () => {
      const result = parseArgs(["--tag", "a"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a"]);
    });

    it("handles --flag=value for array flags", () => {
      const result = parseArgs(["--tag=a", "--tag=b"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a", "b"]);
    });

    it("handles comma-separated values for array flags with space", () => {
      const result = parseArgs(["--tag", "a,b,c"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a", "b", "c"]);
    });

    it("handles comma-separated values for array flags with equals", () => {
      const result = parseArgs(["--tag=a,b"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a", "b"]);
    });

    it("handles comma-separated values for array flags with short form", () => {
      const result = parseArgs(["-t", "x,y"], { array: ["t"] });
      expect(result["t"]).toEqual(["x", "y"]);
    });

    it("handles comma-separated values for array flags with short attached value", () => {
      const result = parseArgs(["-tx,y"], { array: ["t"], string: [] });
      expect(result["t"]).toEqual(["x", "y"]);
    });

    it("sets true for array flag with no next value", () => {
      const result = parseArgs(["--tag"], { array: ["tag"] });
      expect(result["tag"]).toEqual([true]);
    });
  });

  describe("positional arguments", () => {
    it("collects bare words as positionals", () => {
      const result = parseArgs(["hello", "world"]);
      expect(result._).toEqual(["hello", "world"]);
    });

    it("interleaves positionals with flags", () => {
      const result = parseArgs(["hello", "--verbose", "world"], { boolean: ["verbose"] });
      expect(result._).toEqual(["hello", "world"]);
      expect(result["verbose"]).toBe(true);
    });

    it("treats flag values as non-positional", () => {
      const result = parseArgs(["--name", "alice", "file.txt"]);
      expect(result["name"]).toBe("alice");
      expect(result._).toEqual(["file.txt"]);
    });
  });

  describe("-- separator", () => {
    it("stops flag parsing after --", () => {
      const result = parseArgs(["--verbose", "--", "--not-a-flag"], { boolean: ["verbose"] });
      expect(result["verbose"]).toBe(true);
      expect(result._).toEqual(["--not-a-flag"]);
    });

    it("collects all tokens after -- as positionals", () => {
      const result = parseArgs(["--", "-f", "--bar", "baz"]);
      expect(result._).toEqual(["-f", "--bar", "baz"]);
    });

    it("handles -- at start", () => {
      const result = parseArgs(["--", "a", "b"]);
      expect(result._).toEqual(["a", "b"]);
    });

    it("handles -- with no tokens after it", () => {
      const result = parseArgs(["--foo", "bar", "--"]);
      expect(result["foo"]).toBe("bar");
      expect(result._).toEqual([]);
    });
  });

  describe("alias expansion", () => {
    it("expands single-string alias", () => {
      const result = parseArgs(["-v"], {
        boolean: ["verbose"],
        alias: { verbose: "v" },
      });
      expect(result["verbose"]).toBe(true);
      expect(result["v"]).toBe(true);
    });

    it("expands array of aliases", () => {
      const result = parseArgs(["-o", "file.txt"], {
        string: ["output"],
        alias: { output: ["o", "out"] },
      });
      expect(result["output"]).toBe("file.txt");
      expect(result["o"]).toBe("file.txt");
      expect(result["out"]).toBe("file.txt");
    });

    it("resolves alias in reverse (canonical to alias)", () => {
      const result = parseArgs(["--verbose"], {
        boolean: ["verbose"],
        alias: { verbose: "v" },
      });
      expect(result["v"]).toBe(true);
    });

    it("handles alias with default", () => {
      const result = parseArgs([], {
        string: ["output"],
        alias: { output: "o" },
        default: { output: "stdout" },
      });
      expect(result["output"]).toBe("stdout");
      expect(result["o"]).toBe("stdout");
    });
  });

  describe("default values", () => {
    it("applies defaults for missing flags", () => {
      const result = parseArgs([], {
        default: { verbose: false, port: 3000 },
      });
      expect(result["verbose"]).toBe(false);
      expect(result["port"]).toBe(3000);
    });

    it("does not override provided values with defaults", () => {
      const result = parseArgs(["--port", "8080"], {
        default: { port: 3000 },
      });
      expect(result["port"]).toBe(8080);
    });

    it("wraps non-array default in array for array flags", () => {
      const result = parseArgs([], {
        array: ["tag"],
        default: { tag: "latest" },
      });
      expect(result["tag"]).toEqual(["latest"]);
    });

    it("keeps array default as-is for array flags", () => {
      const result = parseArgs([], {
        array: ["tag"],
        default: { tag: ["a", "b"] },
      });
      expect(result["tag"]).toEqual(["a", "b"]);
    });
  });

  describe("string-typed flags", () => {
    it("does not coerce numeric values for string flags", () => {
      const result = parseArgs(["--port", "8080"], { string: ["port"] });
      expect(result["port"]).toBe("8080");
    });

    it("does not coerce boolean-like values for string flags", () => {
      const result = parseArgs(["--flag=true"], { string: ["flag"] });
      expect(result["flag"]).toBe("true");
    });

    it("sets empty string for string flag with no next value", () => {
      const result = parseArgs(["--name"], { string: ["name"] });
      expect(result["name"]).toBe("");
    });

    it("sets empty string for string flag followed by another flag", () => {
      const result = parseArgs(["--name", "--verbose"], {
        string: ["name"],
        boolean: ["verbose"],
      });
      expect(result["name"]).toBe("");
      expect(result["verbose"]).toBe(true);
    });
  });

  describe("mixed usage", () => {
    it("handles complex real-world-like invocation", () => {
      const result = parseArgs(
        [
          "build",
          "--verbose",
          "-o", "dist",
          "--config.entry=src/index.ts",
          "--minify",
          "--target", "es2022",
          "--plugin", "a",
          "--plugin", "b",
          "--", "extra1", "extra2",
        ],
        {
          boolean: ["verbose", "minify"],
          string: ["output", "target"],
          array: ["plugin"],
          alias: { output: "o", verbose: "v" },
        },
      );

      expect(result._).toEqual(["build", "extra1", "extra2"]);
      expect(result["verbose"]).toBe(true);
      expect(result["output"]).toBe("dist");
      expect(result["o"]).toBe("dist");
      expect(result["config"]).toEqual({ entry: "src/index.ts" });
      expect(result["minify"]).toBe(true);
      expect(result["target"]).toBe("es2022");
      expect(result["plugin"]).toEqual(["a", "b"]);
    });

    it("handles flags before and after positionals", () => {
      const result = parseArgs(["--foo", "1", "pos1", "--bar", "2", "pos2"], {
        string: ["foo", "bar"],
      });
      expect(result["foo"]).toBe("1");
      expect(result["bar"]).toBe("2");
      expect(result._).toEqual(["pos1", "pos2"]);
    });
  });

  describe("edge cases", () => {
    it("handles flag with = containing special characters in value", () => {
      const result = parseArgs(["--url=https://example.com/path?q=1&r=2"]);
      expect(result["url"]).toBe("https://example.com/path?q=1&r=2");
    });

    it("handles single dash as positional", () => {
      const result = parseArgs(["-"]);
      expect(result._).toEqual(["-"]);
    });

    it("handles empty string as positional", () => {
      const result = parseArgs([""]);
      expect(result._).toEqual([""]);
    });

    it("does not consume - as a flag", () => {
      const result = parseArgs(["-"]);
      expect(result._).toEqual(["-"]);
    });

    it("preserves order of positionals", () => {
      const result = parseArgs(["c", "a", "b"]);
      expect(result._).toEqual(["c", "a", "b"]);
    });

    it("handles very long flag names", () => {
      const longName = "a".repeat(200);
      const result = parseArgs([`--${longName}=val`]);
      expect(result[longName]).toBe("val");
    });

    it("exports ParsedArgs and ParserOptions types", () => {
      const opts: ParserOptions = { boolean: ["v"] };
      const res: ParsedArgs = parseArgs([], opts);
      expect(res._).toEqual([]);
    });

    it("handles boolean flag that later gets a non-flag token (token is positional)", () => {
      const result = parseArgs(["--debug", "file.txt"], { boolean: ["debug"] });
      expect(result["debug"]).toBe(true);
      expect(result._).toEqual(["file.txt"]);
    });

    it("handles overwriting a previous value for non-array flag", () => {
      const result = parseArgs(["--color", "red", "--color", "blue"]);
      expect(result["color"]).toBe("blue");
    });

    it("handles dot notation overwriting non-object", () => {
      const result = parseArgs(["--a=1", "--a.b=2"]);
      expect(result["a"]).toEqual({ b: 2 });
    });

    it("handles alias not matching any provided arg", () => {
      const result = parseArgs([], {
        alias: { verbose: "v" },
      });
      expect(result["verbose"]).toBeUndefined();
      expect(result["v"]).toBeUndefined();
    });

    it("handles equals sign in the value portion", () => {
      const result = parseArgs(["--env=KEY=VALUE"]);
      expect(result["env"]).toBe("KEY=VALUE");
    });

    it("ignores dot-notation deeper than MAX_DOT_DEPTH (10 levels)", () => {
      const deepKey = Array.from({ length: 12 }, (_, i) => `k${i}`).join(".");
      const result = parseArgs([`--${deepKey}=val`]);
      expect(result[deepKey]).toBeUndefined();
    });

    it("converts non-array existing value to array when array flag used with non-array form first", () => {
      /* First --tag sets tag to "a", then second --tag should create ["a","b"] */
      const result = parseArgs(["--tag=a", "--tag=b"], { array: ["tag"] });
      expect(result["tag"]).toEqual(["a", "b"]);
    });

    it("handles null-ish intermediate in dot notation path", () => {
      const result = parseArgs(["--a=1", "--a.b.c=2"]);
      expect(result["a"]).toEqual({ b: { c: 2 } });
    });
  });
});
