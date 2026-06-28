/**
 * @module tests/unit/css/css-parser
 * @description Unit tests for the CSS parser: selectors, declarations,
 * at-rules, nesting, custom properties, and CSS Modules syntax.
 */

import { describe, it, expect } from "bun:test";
import { parseCSS, tokenize } from "../../../src/css/css-parser.js";
import type {
  Rule,
  AtRule,
  Declaration,
  Comment,
} from "../../../src/css/css-ast.js";

describe("CSS Tokenizer", () => {
  it("tokenizes identifiers", () => {
    const tokens = tokenize("color");
    expect(tokens[0].type).toBe("ident");
    expect(tokens[0].value).toBe("color");
  });

  it("tokenizes strings", () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"hello"');
  });

  it("tokenizes numbers", () => {
    const tokens = tokenize("42px");
    expect(tokens[0].type).toBe("number");
    expect(tokens[0].value).toBe("42px");
  });

  it("tokenizes hash colors", () => {
    const tokens = tokenize("#ff0000");
    expect(tokens[0].type).toBe("hash");
    expect(tokens[0].value).toBe("#ff0000");
  });

  it("tokenizes at-keywords", () => {
    const tokens = tokenize("@media");
    expect(tokens[0].type).toBe("at-keyword");
    expect(tokens[0].value).toBe("@media");
  });

  it("tokenizes functions", () => {
    const tokens = tokenize("rgb(");
    expect(tokens[0].type).toBe("function");
    expect(tokens[0].value).toBe("rgb");
  });

  it("tokenizes whitespace", () => {
    const tokens = tokenize("  \n\t");
    expect(tokens[0].type).toBe("whitespace");
  });

  it("tokenizes comments", () => {
    const tokens = tokenize("/* hello */");
    expect(tokens[0].type).toBe("comment");
    expect(tokens[0].value).toBe("/* hello */");
  });

  it("tokenizes custom properties", () => {
    const tokens = tokenize("--my-color");
    expect(tokens[0].type).toBe("ident");
    expect(tokens[0].value).toBe("--my-color");
  });
});

describe("CSS Parser - Basic selectors", () => {
  it("parses an element selector", () => {
    const ast = parseCSS("div { color: red; }");
    expect(ast.rules.length).toBe(1);
    const rule = ast.rules[0] as Rule;
    expect(rule.type).toBe("Rule");
    expect(rule.selectors.selectors[0].parts[0].type).toBe("ElementSelector");
    expect(
      (rule.selectors.selectors[0].parts[0] as { name: string }).name,
    ).toBe("div");
  });

  it("parses a class selector", () => {
    const ast = parseCSS(".button { color: blue; }");
    const rule = ast.rules[0] as Rule;
    expect(rule.selectors.selectors[0].parts[0].type).toBe("ClassSelector");
    expect(
      (rule.selectors.selectors[0].parts[0] as { name: string }).name,
    ).toBe("button");
  });

  it("parses an ID selector", () => {
    const ast = parseCSS("#header { margin: 0; }");
    const rule = ast.rules[0] as Rule;
    expect(rule.selectors.selectors[0].parts[0].type).toBe("IdSelector");
    expect(
      (rule.selectors.selectors[0].parts[0] as { name: string }).name,
    ).toBe("header");
  });

  it("parses a universal selector", () => {
    const ast = parseCSS("* { margin: 0; }");
    const rule = ast.rules[0] as Rule;
    expect(rule.selectors.selectors[0].parts[0].type).toBe("UniversalSelector");
  });

  it("parses an attribute selector", () => {
    const ast = parseCSS('[type="text"] { border: 1px; }');
    const rule = ast.rules[0] as Rule;
    const attr = rule.selectors.selectors[0].parts[0];
    expect(attr.type).toBe("AttributeSelector");
    expect((attr as { name: string }).name).toBe("type");
    expect((attr as { value: string }).value).toBe("text");
  });

  it("parses attribute selector without value", () => {
    const ast = parseCSS("[disabled] { opacity: 0.5; }");
    const rule = ast.rules[0] as Rule;
    const attr = rule.selectors.selectors[0].parts[0];
    expect(attr.type).toBe("AttributeSelector");
    expect((attr as { name: string }).name).toBe("disabled");
  });

  it("parses a pseudo-class selector", () => {
    const ast = parseCSS("a:hover { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(parts.length).toBe(2);
    expect(parts[1].type).toBe("PseudoClassSelector");
    expect((parts[1] as { name: string }).name).toBe("hover");
  });

  it("parses a pseudo-element selector", () => {
    const ast = parseCSS("p::before { content: ''; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(parts[1].type).toBe("PseudoElementSelector");
    expect((parts[1] as { name: string }).name).toBe("before");
  });

  it("parses the nesting selector (&)", () => {
    const ast = parseCSS(".parent { &:hover { color: red; } }");
    const rule = ast.rules[0] as Rule;
    const nested = rule.declarations[0] as Rule;
    expect(nested.type).toBe("Rule");
    expect(nested.selectors.selectors[0].parts[0].type).toBe("NestingSelector");
  });
});

describe("CSS Parser - Combinators", () => {
  it("parses descendant combinator (space)", () => {
    const ast = parseCSS("div span { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(parts.length).toBe(3);
    expect(parts[1].type).toBe("Combinator");
    expect((parts[1] as { value: string }).value).toBe(" ");
  });

  it("parses child combinator (>)", () => {
    const ast = parseCSS("div > span { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(
      parts.some(
        (p) =>
          p.type === "Combinator" && (p as { value: string }).value === ">",
      ),
    ).toBe(true);
  });

  it("parses adjacent sibling combinator (+)", () => {
    const ast = parseCSS("h1 + p { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(
      parts.some(
        (p) =>
          p.type === "Combinator" && (p as { value: string }).value === "+",
      ),
    ).toBe(true);
  });

  it("parses general sibling combinator (~)", () => {
    const ast = parseCSS("h1 ~ p { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(
      parts.some(
        (p) =>
          p.type === "Combinator" && (p as { value: string }).value === "~",
      ),
    ).toBe(true);
  });
});

describe("CSS Parser - Selector lists", () => {
  it("parses comma-separated selectors", () => {
    const ast = parseCSS("h1, h2, h3 { margin: 0; }");
    const rule = ast.rules[0] as Rule;
    expect(rule.selectors.selectors.length).toBe(3);
  });
});

describe("CSS Parser - Declarations", () => {
  it("parses property-value pairs", () => {
    const ast = parseCSS("div { color: red; font-size: 16px; }");
    const rule = ast.rules[0] as Rule;
    const decls = rule.declarations.filter(
      (d) => d.type === "Declaration",
    ) as Declaration[];
    expect(decls.length).toBe(2);
    expect(decls[0].property).toBe("color");
    expect(decls[0].value).toBe("red");
    expect(decls[1].property).toBe("font-size");
    expect(decls[1].value).toBe("16px");
  });

  it("parses !important declarations", () => {
    const ast = parseCSS("div { color: red !important; }");
    const rule = ast.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.important).toBe(true);
    expect(decl.value).toBe("red");
  });

  it("parses multi-value declarations", () => {
    const ast = parseCSS("div { border: 1px solid black; }");
    const rule = ast.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.property).toBe("border");
    expect(decl.value).toBe("1px solid black");
  });
});

describe("CSS Parser - Custom properties", () => {
  it("parses custom property declarations", () => {
    const ast = parseCSS(":root { --main-color: #333; }");
    const rule = ast.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.property).toBe("--main-color");
    expect(decl.value).toBe("#333");
  });

  it("parses var() references in values", () => {
    const ast = parseCSS("div { color: var(--main-color, blue); }");
    const rule = ast.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.value).toContain("var");
    expect(decl.value).toContain("--main-color");
  });
});

describe("CSS Parser - At-rules", () => {
  it("parses @import", () => {
    const ast = parseCSS('@import "base.css";');
    expect(ast.rules.length).toBe(1);
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.type).toBe("AtRule");
    expect(atRule.name).toBe("import");
    expect(atRule.params).toContain("base.css");
  });

  it("parses @charset", () => {
    const ast = parseCSS('@charset "UTF-8";');
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("charset");
  });

  it("parses @media with nested rules", () => {
    const ast = parseCSS(
      "@media (max-width: 768px) { .container { width: 100%; } }",
    );
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("media");
    expect(atRule.params).toContain("max-width");
    expect(atRule.rules).toBeDefined();
    expect(atRule.rules!.length).toBe(1);
  });

  it("parses @keyframes", () => {
    const ast = parseCSS(
      "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }",
    );
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("keyframes");
    expect(atRule.params).toBe("fadeIn");
    expect(atRule.rules).toBeDefined();
    expect(atRule.rules!.length).toBe(2);
  });

  it("parses @font-face", () => {
    const ast = parseCSS(
      '@font-face { font-family: "MyFont"; src: url("font.woff2"); }',
    );
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("font-face");
    expect(atRule.rules).toBeDefined();
  });

  it("parses @layer", () => {
    const ast = parseCSS("@layer base { .button { color: red; } }");
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("layer");
    expect(atRule.params).toBe("base");
    expect(atRule.rules).toBeDefined();
  });

  it("parses @container", () => {
    const ast = parseCSS(
      "@container (min-width: 500px) { .card { flex-direction: row; } }",
    );
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("container");
    expect(atRule.rules).toBeDefined();
  });

  it("parses @supports", () => {
    const ast = parseCSS(
      "@supports (display: grid) { .grid { display: grid; } }",
    );
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("supports");
    expect(atRule.rules).toBeDefined();
  });

  it("parses @layer declaration (no block)", () => {
    const ast = parseCSS("@layer base, theme, utilities;");
    const atRule = ast.rules[0] as AtRule;
    expect(atRule.name).toBe("layer");
    expect(atRule.rules).toBeUndefined();
  });
});

describe("CSS Parser - Nesting", () => {
  it("parses nested rules with & selector", () => {
    const ast = parseCSS(".parent { color: red; &:hover { color: blue; } }");
    const rule = ast.rules[0] as Rule;
    expect(rule.declarations.length).toBe(2);
    const nested = rule.declarations[1] as Rule;
    expect(nested.type).toBe("Rule");
    const parts = nested.selectors.selectors[0].parts;
    expect(parts[0].type).toBe("NestingSelector");
  });

  it("parses deeply nested rules", () => {
    const ast = parseCSS(".a { .b { .c { color: red; } } }");
    const ruleA = ast.rules[0] as Rule;
    const ruleB = ruleA.declarations[0] as Rule;
    expect(ruleB.type).toBe("Rule");
    const ruleC = ruleB.declarations[0] as Rule;
    expect(ruleC.type).toBe("Rule");
  });
});

describe("CSS Parser - Comments", () => {
  it("parses and preserves comments", () => {
    const ast = parseCSS("/* header styles */\n.header { color: red; }");
    expect(ast.rules.length).toBe(2);
    const comment = ast.rules[0] as Comment;
    expect(comment.type).toBe("Comment");
    expect(comment.value).toBe(" header styles ");
  });

  it("handles comments between declarations", () => {
    const ast = parseCSS(".a { color: red; /* note */ font-size: 16px; }");
    const rule = ast.rules[0] as Rule;
    const decls = rule.declarations.filter((d) => d.type === "Declaration");
    expect(decls.length).toBe(2);
  });
});

describe("CSS Parser - Complex selectors", () => {
  it("parses compound selectors", () => {
    const ast = parseCSS("div.active#main { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(parts.length).toBe(3);
    expect(parts[0].type).toBe("ElementSelector");
    expect(parts[1].type).toBe("ClassSelector");
    expect(parts[2].type).toBe("IdSelector");
  });

  it("parses pseudo-class with arguments", () => {
    const ast = parseCSS("li:nth-child(2n+1) { color: red; }");
    const rule = ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    const pseudo = parts[1];
    expect(pseudo.type).toBe("PseudoClassSelector");
    expect((pseudo as { name: string }).name).toBe("nth-child");
    expect((pseudo as { args: string }).args).toBe("2n+1");
  });
});

describe("CSS Parser - Location tracking", () => {
  it("provides location info for rules", () => {
    const ast = parseCSS("div { color: red; }");
    const rule = ast.rules[0] as Rule;
    expect(rule.loc).toBeDefined();
    expect(rule.loc!.start.line).toBe(1);
    expect(rule.loc!.start.column).toBe(0);
  });

  it("tracks multi-line positions correctly", () => {
    const source = ".a {\n  color: red;\n}\n.b {\n  color: blue;\n}";
    const ast = parseCSS(source);
    expect(ast.rules.length).toBe(2);
    const ruleB = ast.rules[1] as Rule;
    expect(ruleB.loc).toBeDefined();
    expect(ruleB.loc!.start.line).toBeGreaterThan(1);
  });
});

describe("CSS Parser - Edge cases", () => {
  it("handles empty stylesheet", () => {
    const ast = parseCSS("");
    expect(ast.type).toBe("Stylesheet");
    expect(ast.rules.length).toBe(0);
  });

  it("handles empty rule block", () => {
    const ast = parseCSS("div { }");
    const rule = ast.rules[0] as Rule;
    expect(rule.declarations.length).toBe(0);
  });

  it("handles multiple rules", () => {
    const ast = parseCSS("h1 { color: red; } p { color: blue; }");
    expect(ast.rules.length).toBe(2);
  });
});
