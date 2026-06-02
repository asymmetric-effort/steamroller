/**
 * Unit tests for JSX parsing module.
 *
 * @module tests/unit/parser/jsx
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper to parse JSX expression statements.
 */
const parseJSX = (code: string): AST.Expression => {
  const program = parse(code, { jsx: true });
  const stmt = program.body[0] as AST.ExpressionStatement;
  return stmt.expression;
};

describe("JSX Parser", () => {
  describe("self-closing elements", () => {
    it("parses a simple self-closing tag", () => {
      const expr = parseJSX("<Foo />;") as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      expect(expr.openingElement.selfClosing).toBe(true);
      expect(expr.closingElement).toBeNull();
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.type).toBe("JSXIdentifier");
      expect(name.name).toBe("Foo");
    });

    it("parses a self-closing tag with no space before /", () => {
      const expr = parseJSX("<Bar/>;") as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      expect(expr.openingElement.selfClosing).toBe(true);
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("Bar");
    });

    it("parses a lowercase self-closing tag", () => {
      const expr = parseJSX("<div />;") as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("div");
    });

    it("parses a tag with hyphens in the name", () => {
      const expr = parseJSX("<my-component />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("my-component");
    });
  });

  describe("elements with children", () => {
    it("parses element with text children", () => {
      const expr = parseJSX("<div>text</div>;") as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      expect(expr.openingElement.selfClosing).toBe(false);
      expect(expr.closingElement).not.toBeNull();
      expect(expr.children.length).toBe(1);
      const text = expr.children[0] as AST.JSXText;
      expect(text.type).toBe("JSXText");
      expect(text.value).toBe("text");
    });

    it("parses element with multiple text segments and expressions", () => {
      const expr = parseJSX(
        "<p>hello {name} world</p>;",
      ) as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(3);
      expect((expr.children[0] as AST.JSXText).type).toBe("JSXText");
      expect((expr.children[1] as AST.JSXExpressionContainer).type).toBe(
        "JSXExpressionContainer",
      );
      expect((expr.children[2] as AST.JSXText).type).toBe("JSXText");
    });
  });

  describe("fragments", () => {
    it("parses empty fragment", () => {
      const expr = parseJSX("<></>;") as unknown as AST.JSXFragment;
      expect(expr.type).toBe("JSXFragment");
      expect(expr.children.length).toBe(0);
    });

    it("parses fragment with content", () => {
      const expr = parseJSX("<>content</>;") as unknown as AST.JSXFragment;
      expect(expr.type).toBe("JSXFragment");
      expect(expr.children.length).toBe(1);
      const text = expr.children[0] as AST.JSXText;
      expect(text.value).toBe("content");
    });

    it("parses fragment with nested elements", () => {
      const expr = parseJSX(
        "<><span /><div /></>;",
      ) as unknown as AST.JSXFragment;
      expect(expr.type).toBe("JSXFragment");
      expect(expr.children.length).toBe(2);
    });
  });

  describe("attributes", () => {
    it("parses string attribute", () => {
      const expr = parseJSX('<Foo a="1" />;') as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(1);
      const attr = attrs[0] as AST.JSXAttribute;
      expect(attr.type).toBe("JSXAttribute");
      const attrName = attr.name as AST.JSXIdentifier;
      expect(attrName.name).toBe("a");
      const val = attr.value as AST.Literal;
      expect(val.type).toBe("Literal");
      expect(val.value).toBe("1");
    });

    it("parses expression attribute", () => {
      const expr = parseJSX("<Foo b={2} />;") as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(1);
      const attr = attrs[0] as AST.JSXAttribute;
      const val = attr.value as AST.JSXExpressionContainer;
      expect(val.type).toBe("JSXExpressionContainer");
    });

    it("parses multiple attributes", () => {
      const expr = parseJSX(
        '<Foo a="1" b={2} />;',
      ) as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(2);
    });

    it("parses boolean attribute (no value)", () => {
      const expr = parseJSX("<Foo disabled />;") as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(1);
      const attr = attrs[0] as AST.JSXAttribute;
      expect(attr.value).toBeNull();
    });
  });

  describe("spread attributes", () => {
    it("parses spread attribute", () => {
      const expr = parseJSX("<Foo {...props} />;") as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(1);
      const spread = attrs[0] as AST.JSXSpreadAttribute;
      expect(spread.type).toBe("JSXSpreadAttribute");
      expect(spread.argument.type).toBe("Identifier");
    });

    it("parses spread alongside named attributes", () => {
      const expr = parseJSX(
        '<Foo a="x" {...props} b={1} />;',
      ) as unknown as AST.JSXElement;
      const attrs = expr.openingElement.attributes;
      expect(attrs.length).toBe(3);
      expect(attrs[0].type).toBe("JSXAttribute");
      expect(attrs[1].type).toBe("JSXSpreadAttribute");
      expect(attrs[2].type).toBe("JSXAttribute");
    });
  });

  describe("expression containers", () => {
    it("parses expression in children", () => {
      const expr = parseJSX("<div>{x}</div>;") as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(1);
      const container = expr.children[0] as AST.JSXExpressionContainer;
      expect(container.type).toBe("JSXExpressionContainer");
      const inner = container.expression as AST.Identifier;
      expect(inner.type).toBe("Identifier");
      expect(inner.name).toBe("x");
    });

    it("parses empty expression container", () => {
      const expr = parseJSX("<div>{}</div>;") as unknown as AST.JSXElement;
      const container = expr.children[0] as AST.JSXExpressionContainer;
      expect(container.expression.type).toBe("JSXEmptyExpression");
    });

    it("parses complex expression in container", () => {
      const expr = parseJSX("<div>{a + b}</div>;") as unknown as AST.JSXElement;
      const container = expr.children[0] as AST.JSXExpressionContainer;
      expect(container.expression.type).toBe("BinaryExpression");
    });
  });

  describe("member expression tags", () => {
    it("parses simple member expression tag", () => {
      const expr = parseJSX("<Foo.Bar />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXMemberExpression;
      expect(name.type).toBe("JSXMemberExpression");
      const obj = name.object as AST.JSXIdentifier;
      expect(obj.name).toBe("Foo");
      expect(name.property.name).toBe("Bar");
    });

    it("parses nested member expression tag", () => {
      const expr = parseJSX("<A.B.C />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXMemberExpression;
      expect(name.type).toBe("JSXMemberExpression");
      expect(name.property.name).toBe("C");
      const inner = name.object as AST.JSXMemberExpression;
      expect(inner.type).toBe("JSXMemberExpression");
      expect(inner.property.name).toBe("B");
      const obj = inner.object as AST.JSXIdentifier;
      expect(obj.name).toBe("A");
    });
  });

  describe("namespaced names", () => {
    it("parses namespaced tag name", () => {
      const expr = parseJSX("<ns:tag />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXNamespacedName;
      expect(name.type).toBe("JSXNamespacedName");
      expect(name.namespace.name).toBe("ns");
      expect(name.name.name).toBe("tag");
    });

    it("parses namespaced attribute name", () => {
      const expr = parseJSX(
        '<div xml:lang="en" />;',
      ) as unknown as AST.JSXElement;
      const attr = expr.openingElement.attributes[0] as AST.JSXAttribute;
      const attrName = attr.name as AST.JSXNamespacedName;
      expect(attrName.type).toBe("JSXNamespacedName");
      expect(attrName.namespace.name).toBe("xml");
      expect(attrName.name.name).toBe("lang");
    });
  });

  describe("nested JSX", () => {
    it("parses nested elements", () => {
      const expr = parseJSX(
        "<div><span /></div>;",
      ) as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(1);
      const child = expr.children[0] as unknown as AST.JSXElement;
      expect(child.type).toBe("JSXElement");
      const childName = child.openingElement.name as AST.JSXIdentifier;
      expect(childName.name).toBe("span");
    });

    it("parses deeply nested elements", () => {
      const expr = parseJSX(
        "<a><b><c /></b></a>;",
      ) as unknown as AST.JSXElement;
      const b = expr.children[0] as unknown as AST.JSXElement;
      expect(b.type).toBe("JSXElement");
      const c = b.children[0] as unknown as AST.JSXElement;
      expect(c.type).toBe("JSXElement");
      expect(c.openingElement.selfClosing).toBe(true);
    });

    it("parses multiple children elements", () => {
      const expr = parseJSX(
        "<div><a /><b /><c /></div>;",
      ) as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(3);
    });
  });

  describe("error cases", () => {
    it("throws on unclosed tag", () => {
      expect(() => parseJSX("<div>;")).toThrow();
    });

    it("throws on mismatched tags", () => {
      expect(() => parseJSX("<div></span>;")).toThrow(/mismatch/);
    });

    it("throws on missing identifier after dot", () => {
      expect(() => parseJSX("<Foo. />;")).toThrow();
    });

    it("throws on missing expression in spread", () => {
      expect(() => parseJSX("<Foo {abc} />;")).toThrow();
    });
  });

  describe("JSX disabled", () => {
    it("throws when JSX is not enabled and < encountered in expression", () => {
      expect(() => parse("<div />;", { jsx: false })).toThrow();
    });
  });

  describe("identifier edge cases", () => {
    it("parses tag starting with $", () => {
      const expr = parseJSX("<$comp />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("$comp");
    });

    it("parses tag starting with _", () => {
      const expr = parseJSX("<_internal />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("_internal");
    });

    it("parses tag with digits in name", () => {
      const expr = parseJSX("<Item2 />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("Item2");
    });
  });

  describe("namespaced closing tags", () => {
    it("parses matching namespaced opening and closing tags", () => {
      const expr = parseJSX(
        "<ns:tag>content</ns:tag>;",
      ) as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      expect(expr.closingElement).not.toBeNull();
      const closeName = expr.closingElement!.name as AST.JSXNamespacedName;
      expect(closeName.type).toBe("JSXNamespacedName");
    });

    it("parses matching member expression opening and closing tags", () => {
      const expr = parseJSX("<A.B>content</A.B>;") as unknown as AST.JSXElement;
      expect(expr.type).toBe("JSXElement");
      expect(expr.closingElement).not.toBeNull();
    });
  });

  describe("additional error cases", () => {
    it("throws on invalid attribute value after equals", () => {
      // Force the code path where = is followed by a non-string, non-brace, non-lt token
      // Using a numeric literal which is none of those
      expect(() => parseJSX("<Foo bar=123 />;")).toThrow();
    });

    it("throws on unclosed fragment (missing </>)", () => {
      expect(() => parseJSX("<>content;")).toThrow();
    });

    it("throws on invalid closing fragment (missing >)", () => {
      // Fragment where closing is malformed
      expect(() => parseJSX("<>text</!>;")).toThrow();
    });

    it("throws when closing element is missing > after tag name", () => {
      // Trigger branch 24[0]: !lexer.is(TokenType.GreaterThan) in closing element
      expect(() => parseJSX("<div></div!;")).toThrow();
    });

    it("throws on missing > after JSX opening element", () => {
      expect(() => parseJSX("<div !")).toThrow();
    });

    it("throws on missing closing tag for non-self-closing element", () => {
      expect(() => parseJSX("<div>text;")).toThrow();
    });

    it("throws on empty identifier for JSX element name at end of input", () => {
      // readJSXIdentifier returns empty name when position is past source length
      expect(() => parseJSX("< />;")).toThrow();
    });

    it("throws on missing identifier after colon in JSX element name", () => {
      expect(() => parseJSX("<ns: />;")).toThrow();
    });

    it("throws on missing identifier after dot in JSX member expression", () => {
      // parseJSXElementName: prop.name === "" after dot
      expect(() => parseJSX("<Foo. />;")).toThrow();
    });

    it("throws on missing ... in spread attribute", () => {
      // parseJSXAttributes: !lexer.is(TokenType.Ellipsis) after {
      expect(() => parseJSX("<Foo {abc} />;")).toThrow();
    });

    it("throws on missing } after spread attribute", () => {
      expect(() => parseJSX("<Foo {...props />;")).toThrow();
    });

    it("throws on empty identifier after colon in attribute name", () => {
      // parseJSXAttributes: sub.name === "" after ':'
      expect(() => parseJSX("<Foo ns:=1 />;")).toThrow();
    });

    it("throws on missing } in JSX expression container", () => {
      expect(() => parseJSX("<div>{x</div>;")).toThrow();
    });
  });

  describe("JSX element as attribute value", () => {
    it("parses a JSX element as an attribute value via expression container", () => {
      const expr = parseJSX(
        "<Foo bar={<Baz />} />;",
      ) as unknown as AST.JSXElement;
      const attr = expr.openingElement.attributes[0] as AST.JSXAttribute;
      expect(attr.value).not.toBeNull();
      const container = attr.value as AST.JSXExpressionContainer;
      expect(container.type).toBe("JSXExpressionContainer");
    });
  });

  describe("unicode identifier edge cases", () => {
    it("parses tag with high unicode start character", () => {
      // Character code >= 0xC0 (Latin capital A with grave: \u00C0)
      const expr = parseJSX("<\u00C0comp />;") as unknown as AST.JSXElement;
      const name = expr.openingElement.name as AST.JSXIdentifier;
      expect(name.name).toBe("\u00C0comp");
    });
  });

  describe("children edge cases", () => {
    it("parses nested element child within element", () => {
      const expr = parseJSX(
        "<div><span>inner</span></div>;",
      ) as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(1);
      const child = expr.children[0] as unknown as AST.JSXElement;
      expect(child.type).toBe("JSXElement");
    });

    it("parses fragment child within element", () => {
      const expr = parseJSX(
        "<div><>frag</></div>;",
      ) as unknown as AST.JSXElement;
      expect(expr.children.length).toBe(1);
      const child = expr.children[0] as unknown as AST.JSXFragment;
      expect(child.type).toBe("JSXFragment");
    });
  });
});
