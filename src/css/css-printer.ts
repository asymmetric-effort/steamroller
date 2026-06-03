/**
 * @module css/css-printer
 * @description CSS AST-to-CSS serializer with pretty-print and minified modes.
 * Supports position tracking for potential source map generation.
 */

import type {
  Stylesheet,
  Rule,
  Declaration,
  AtRule,
  SelectorList,
  Selector,
  SelectorPart,
  CSSTopLevelNode,
  DeclarationOrNested,
  Comment,
} from "./css-ast.js";

/** Options for the CSS printer. */
export interface CSSPrinterOptions {
  /** Whether to minify the output (collapse whitespace, etc.). */
  readonly minify?: boolean;
  /** Indentation string for pretty-print mode. */
  readonly indent?: string;
}

/**
 * Print a CSS AST back to a CSS string.
 *
 * @param ast - The Stylesheet AST to print.
 * @param options - Printer options.
 * @returns The serialized CSS string.
 */
export const printCSS = (
  ast: Stylesheet,
  options?: CSSPrinterOptions,
): string => {
  const printer = new CSSPrinter(options);
  return printer.printStylesheet(ast);
};

/**
 * CSS AST serializer.
 */
class CSSPrinter {
  private readonly minify: boolean;
  private readonly indentStr: string;
  private depth: number;

  constructor(options?: CSSPrinterOptions) {
    this.minify = options?.minify ?? false;
    this.indentStr = options?.indent ?? "  ";
    this.depth = 0;
  }

  private get newline(): string {
    return this.minify ? "" : "\n";
  }

  private get space(): string {
    return this.minify ? "" : " ";
  }

  private indent(): string {
    if (this.minify) {
      return "";
    }
    return this.indentStr.repeat(this.depth);
  }

  printStylesheet(ast: Stylesheet): string {
    const parts: Array<string> = [];
    for (let i = 0; i < ast.rules.length; i++) {
      const rule = ast.rules[i];
      const printed = this.printTopLevel(rule);
      if (printed.length > 0) {
        parts.push(printed);
      }
    }
    const separator = this.minify ? "" : "\n";
    const result = parts.join(separator);
    return this.minify ? result : result + "\n";
  }

  private printTopLevel(node: CSSTopLevelNode): string {
    switch (node.type) {
      case "Rule":
        return this.printRule(node);
      case "AtRule":
        return this.printAtRule(node);
      case "Comment":
        return this.printComment(node);
      default:
        return "";
    }
  }

  private printRule(rule: Rule): string {
    const selector = this.printSelectorList(rule.selectors);
    const ind = this.indent();
    let result = `${ind}${selector}${this.space}{${this.newline}`;

    this.depth++;
    for (let i = 0; i < rule.declarations.length; i++) {
      result += this.printDeclarationOrNested(rule.declarations[i]);
    }
    this.depth--;

    result += `${this.indent()}}${this.newline}`;
    return result;
  }

  private printDeclarationOrNested(node: DeclarationOrNested): string {
    switch (node.type) {
      case "Declaration":
        return this.printDeclaration(node);
      case "Rule":
        return this.printRule(node);
      case "AtRule":
        return this.printAtRule(node);
      case "Comment":
        return this.printComment(node);
      default:
        return "";
    }
  }

  private printDeclaration(decl: Declaration): string {
    const ind = this.indent();
    const important = decl.important ? `${this.space}!important` : "";
    return `${ind}${decl.property}:${this.space}${decl.value}${important};${this.newline}`;
  }

  private printAtRule(atRule: AtRule): string {
    const ind = this.indent();
    const params = atRule.params ? `${this.space}${atRule.params}` : "";

    if (atRule.rules === undefined) {
      return `${ind}@${atRule.name}${params};${this.newline}`;
    }

    let result = `${ind}@${atRule.name}${params}${this.space}{${this.newline}`;
    this.depth++;
    for (let i = 0; i < atRule.rules.length; i++) {
      const child = atRule.rules[i];
      switch (child.type) {
        case "Rule":
          result += this.printRule(child as Rule);
          break;
        case "AtRule":
          result += this.printAtRule(child as AtRule);
          break;
        case "Declaration":
          result += this.printDeclaration(child as Declaration);
          break;
        case "Comment":
          result += this.printComment(child as Comment);
          break;
        default:
          break;
      }
    }
    this.depth--;
    result += `${this.indent()}}${this.newline}`;
    return result;
  }

  private printComment(comment: Comment): string {
    if (this.minify) {
      return "";
    }
    return `${this.indent()}/*${comment.value}*/${this.newline}`;
  }

  private printSelectorList(list: SelectorList): string {
    return list.selectors
      .map((s) => this.printSelector(s))
      .join(`,${this.space}`);
  }

  private printSelector(selector: Selector): string {
    let result = "";
    for (let i = 0; i < selector.parts.length; i++) {
      const part = selector.parts[i];
      result += this.printSelectorPart(part);
    }
    return result;
  }

  private printSelectorPart(part: SelectorPart): string {
    switch (part.type) {
      case "ElementSelector":
        return part.name;
      case "ClassSelector":
        return `.${part.name}`;
      case "IdSelector":
        return `#${part.name}`;
      case "UniversalSelector":
        return "*";
      case "NestingSelector":
        return "&";
      case "Combinator":
        return part.value === " " ? " " : ` ${part.value} `;
      case "AttributeSelector": {
        let result = `[${part.name}`;
        if (part.operator !== undefined && part.value !== undefined) {
          result += `${part.operator}"${part.value}"`;
          if (part.flags !== undefined) {
            result += ` ${part.flags}`;
          }
        }
        result += "]";
        return result;
      }
      case "PseudoClassSelector": {
        const args = part.args !== undefined ? `(${part.args})` : "";
        return `:${part.name}${args}`;
      }
      case "PseudoElementSelector": {
        const args = part.args !== undefined ? `(${part.args})` : "";
        return `::${part.name}${args}`;
      }
      default:
        return "";
    }
  }
}
