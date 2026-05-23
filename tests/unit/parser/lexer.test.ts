import { describe, it, expect } from 'vitest';
import { Lexer } from '../../../src/parser/lexer.js';
import { TokenType } from '../../../src/parser/token-types.js';

describe('Lexer', () => {
  describe('constructor', () => {
    it('should produce EOF for empty source', () => {
      const lexer = new Lexer('', false);
      expect(lexer.token.type).toBe(TokenType.EOF);
      expect(lexer.token.start).toBe(0);
      expect(lexer.token.end).toBe(0);
    });

    it('should produce EOF for whitespace-only source', () => {
      const lexer = new Lexer('   \t\n  ', false);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should accept strict mode flag', () => {
      const lexer = new Lexer('', true);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should handle hashbang when allowed', () => {
      const lexer = new Lexer('#!/usr/bin/env node\nfoo', false, true);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('foo');
    });

    it('should not skip hashbang when not allowed', () => {
      // When allowHashBang is false, # is treated as a Hash punctuator
      const lexer = new Lexer('#!/usr/bin/env node\nfoo', false, false);
      expect(lexer.token.type).toBe(TokenType.Hash);
    });

    it('should handle hashbang with no subsequent code', () => {
      const lexer = new Lexer('#!/usr/bin/env node', false, true);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should not treat non-hashbang as hashbang even if allowed', () => {
      const lexer = new Lexer('foo', false, true);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('foo');
    });
  });

  describe('token getter', () => {
    it('should return the current token', () => {
      const lexer = new Lexer('abc', false);
      const token = lexer.token;
      expect(token.type).toBe(TokenType.Identifier);
      expect(token.value).toBe('abc');
    });
  });

  describe('hadLineTerminatorBefore getter', () => {
    it('should be false when no line terminator preceded current token', () => {
      const lexer = new Lexer('a b', false);
      expect(lexer.hadLineTerminatorBefore).toBe(false);
    });

    it('should be true when line terminator preceded current token', () => {
      const lexer = new Lexer('\na', false);
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });

    it('should update after advancing', () => {
      const lexer = new Lexer('a\nb', false);
      expect(lexer.hadLineTerminatorBefore).toBe(false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });
  });

  describe('next()', () => {
    it('should return the previous token and advance', () => {
      const lexer = new Lexer('a b', false);
      const first = lexer.next();
      expect(first.type).toBe(TokenType.Identifier);
      expect(first.value).toBe('a');
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('b');
    });

    it('should advance to EOF', () => {
      const lexer = new Lexer('x', false);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should return EOF when already at EOF', () => {
      const lexer = new Lexer('', false);
      const token = lexer.next();
      expect(token.type).toBe(TokenType.EOF);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });
  });

  describe('expect()', () => {
    it('should consume and return the token when type matches', () => {
      const lexer = new Lexer('abc;', false);
      const token = lexer.expect(TokenType.Identifier);
      expect(token.type).toBe(TokenType.Identifier);
      expect(token.value).toBe('abc');
      expect(lexer.token.type).toBe(TokenType.Semicolon);
    });

    it('should throw SyntaxError when type does not match', () => {
      const lexer = new Lexer('abc', false);
      expect(() => lexer.expect(TokenType.NumericLiteral)).toThrow(SyntaxError);
    });

    it('should include expected and actual type names in error message', () => {
      const lexer = new Lexer('abc', false);
      expect(() => lexer.expect(TokenType.NumericLiteral)).toThrow(
        /Expected NumericLiteral but found Identifier/,
      );
    });

    it('should include position in error message', () => {
      const lexer = new Lexer('  abc', false);
      expect(() => lexer.expect(TokenType.Semicolon)).toThrow(/position 2/);
    });
  });

  describe('is()', () => {
    it('should return true when current token matches', () => {
      const lexer = new Lexer('abc', false);
      expect(lexer.is(TokenType.Identifier)).toBe(true);
    });

    it('should return false when current token does not match', () => {
      const lexer = new Lexer('abc', false);
      expect(lexer.is(TokenType.NumericLiteral)).toBe(false);
    });

    it('should return true for EOF at end of source', () => {
      const lexer = new Lexer('', false);
      expect(lexer.is(TokenType.EOF)).toBe(true);
    });
  });

  describe('eat()', () => {
    it('should consume token and return true when type matches', () => {
      const lexer = new Lexer('abc 123', false);
      const result = lexer.eat(TokenType.Identifier);
      expect(result).toBe(true);
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
    });

    it('should not consume and return false when type does not match', () => {
      const lexer = new Lexer('abc', false);
      const result = lexer.eat(TokenType.NumericLiteral);
      expect(result).toBe(false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
    });

    it('should handle eating EOF', () => {
      const lexer = new Lexer('', false);
      const result = lexer.eat(TokenType.EOF);
      expect(result).toBe(true);
    });
  });

  describe('saveState() and restoreState()', () => {
    it('should save and restore lexer position', () => {
      const lexer = new Lexer('a b c', false);
      const state = lexer.saveState();

      lexer.next(); // advance to 'b'
      lexer.next(); // advance to 'c'
      expect(lexer.token.value).toBe('c');

      lexer.restoreState(state);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a');
    });

    it('should restore hadLineTerminatorBefore', () => {
      const lexer = new Lexer('a\nb', false);
      const state = lexer.saveState();
      expect(lexer.hadLineTerminatorBefore).toBe(false);

      lexer.next(); // advance past newline to 'b'
      expect(lexer.hadLineTerminatorBefore).toBe(true);

      lexer.restoreState(state);
      expect(lexer.hadLineTerminatorBefore).toBe(false);
    });

    it('should return a frozen state object', () => {
      const lexer = new Lexer('a', false);
      const state = lexer.saveState();
      expect(Object.isFrozen(state)).toBe(true);
    });

    it('should restore template depth', () => {
      const lexer = new Lexer('`a${b}c`', false);
      // token is TemplateHead `a${
      expect(lexer.token.type).toBe(TokenType.TemplateHead);

      const state = lexer.saveState();
      lexer.next(); // identifier b
      lexer.next(); // TemplateTail }c`
      expect(lexer.token.type).toBe(TokenType.TemplateTail);

      lexer.restoreState(state);
      expect(lexer.token.type).toBe(TokenType.TemplateHead);
    });
  });

  describe('scanning identifiers', () => {
    it('should scan simple identifiers', () => {
      const lexer = new Lexer('foo', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('foo');
      expect(lexer.token.raw).toBe('foo');
      expect(lexer.token.start).toBe(0);
      expect(lexer.token.end).toBe(3);
    });

    it('should scan identifiers with underscores', () => {
      const lexer = new Lexer('_private', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('_private');
    });

    it('should scan identifiers with dollar signs', () => {
      const lexer = new Lexer('$element', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('$element');
    });

    it('should scan identifiers with digits', () => {
      const lexer = new Lexer('abc123', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('abc123');
    });

    it('should scan single-character identifiers', () => {
      const lexer = new Lexer('x', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('x');
    });

    it('should scan multiple identifiers', () => {
      const lexer = new Lexer('a b c', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
      lexer.next();
      expect(lexer.token.value).toBe('c');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.EOF);
    });
  });

  describe('scanning keywords', () => {
    it('should scan reserved keywords', () => {
      const lexer = new Lexer('return', false);
      expect(lexer.token.type).toBe(TokenType.Return);
      expect(lexer.token.value).toBe('return');
    });

    it('should scan if keyword', () => {
      const lexer = new Lexer('if', false);
      expect(lexer.token.type).toBe(TokenType.If);
    });

    it('should scan function keyword', () => {
      const lexer = new Lexer('function', false);
      expect(lexer.token.type).toBe(TokenType.Function);
    });

    it('should scan class keyword', () => {
      const lexer = new Lexer('class', false);
      expect(lexer.token.type).toBe(TokenType.Class);
    });

    it('should scan const keyword', () => {
      const lexer = new Lexer('const', false);
      expect(lexer.token.type).toBe(TokenType.Const);
    });

    it('should scan contextual keywords', () => {
      const lexer = new Lexer('async', false);
      expect(lexer.token.type).toBe(TokenType.Async);
    });

    it('should scan true as boolean literal', () => {
      const lexer = new Lexer('true', false);
      expect(lexer.token.type).toBe(TokenType.True);
      expect(lexer.token.value).toBe(true);
    });

    it('should scan false as boolean literal', () => {
      const lexer = new Lexer('false', false);
      expect(lexer.token.type).toBe(TokenType.False);
      expect(lexer.token.value).toBe(false);
    });

    it('should scan null as null literal', () => {
      const lexer = new Lexer('null', false);
      expect(lexer.token.type).toBe(TokenType.Null);
      expect(lexer.token.value).toBe(null);
    });

    it('should scan strict-reserved words in strict mode', () => {
      const lexer = new Lexer('yield', true);
      expect(lexer.token.type).toBe(TokenType.Yield);
    });

    it('should scan strict-reserved words in non-strict mode', () => {
      const lexer = new Lexer('yield', false);
      // Still gets its token type in non-strict mode
      expect(lexer.token.type).toBe(TokenType.Yield);
    });

    it('should scan let in strict mode', () => {
      const lexer = new Lexer('let', true);
      expect(lexer.token.type).toBe(TokenType.Let);
    });

    it('should scan static in strict mode', () => {
      const lexer = new Lexer('static', true);
      expect(lexer.token.type).toBe(TokenType.Static);
    });

    it('should scan strict-only reserved words that map to Identifier type in non-strict', () => {
      // 'implements' maps to Identifier token type (not a dedicated type)
      const lexer = new Lexer('implements', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
    });

    it('should scan strict-only reserved words that map to Identifier type in strict', () => {
      const lexer = new Lexer('implements', true);
      expect(lexer.token.type).toBe(TokenType.Identifier);
    });

    it('should scan multiple keywords and identifiers', () => {
      const lexer = new Lexer('if foo else bar', false);
      expect(lexer.token.type).toBe(TokenType.If);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('foo');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Else);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('bar');
    });
  });

  describe('scanning numbers', () => {
    it('should scan integer literals', () => {
      const lexer = new Lexer('42', false);
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(42);
    });

    it('should scan decimal literals', () => {
      const lexer = new Lexer('3.14', false);
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(3.14);
    });

    it('should scan dot-prefixed decimals', () => {
      const lexer = new Lexer('.5', false);
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(0.5);
    });

    it('should scan hex literals', () => {
      const lexer = new Lexer('0xff', false);
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(255);
    });

    it('should scan bigint literals', () => {
      const lexer = new Lexer('123n', false);
      expect(lexer.token.type).toBe(TokenType.BigIntLiteral);
      expect(lexer.token.value).toBe(BigInt(123));
    });
  });

  describe('scanning strings', () => {
    it('should scan single-quoted strings', () => {
      const lexer = new Lexer("'hello'", false);
      expect(lexer.token.type).toBe(TokenType.StringLiteral);
      expect(lexer.token.value).toBe('hello');
    });

    it('should scan double-quoted strings', () => {
      const lexer = new Lexer('"world"', false);
      expect(lexer.token.type).toBe(TokenType.StringLiteral);
      expect(lexer.token.value).toBe('world');
    });

    it('should scan strings with escapes', () => {
      const lexer = new Lexer('"a\\nb"', false);
      expect(lexer.token.type).toBe(TokenType.StringLiteral);
      expect(lexer.token.value).toBe('a\nb');
    });

    it('should scan empty strings', () => {
      const lexer = new Lexer('""', false);
      expect(lexer.token.type).toBe(TokenType.StringLiteral);
      expect(lexer.token.value).toBe('');
    });
  });

  describe('scanning template literals', () => {
    it('should scan simple template literal (no substitutions)', () => {
      const lexer = new Lexer('`hello`', false);
      expect(lexer.token.type).toBe(TokenType.TemplateNoSub);
      expect(lexer.token.value).toBe('hello');
    });

    it('should scan template with substitution', () => {
      const lexer = new Lexer('`a${b}c`', false);
      expect(lexer.token.type).toBe(TokenType.TemplateHead);
      expect(lexer.token.value).toBe('a');

      lexer.next(); // identifier b
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('b');

      lexer.next(); // template tail }c`
      expect(lexer.token.type).toBe(TokenType.TemplateTail);
      expect(lexer.token.value).toBe('c');
    });

    it('should scan template with multiple substitutions', () => {
      const lexer = new Lexer('`${a}${b}`', false);
      expect(lexer.token.type).toBe(TokenType.TemplateHead);
      lexer.next(); // a
      expect(lexer.token.type).toBe(TokenType.Identifier);
      lexer.next(); // middle
      expect(lexer.token.type).toBe(TokenType.TemplateMiddle);
      lexer.next(); // b
      expect(lexer.token.type).toBe(TokenType.Identifier);
      lexer.next(); // tail
      expect(lexer.token.type).toBe(TokenType.TemplateTail);
    });

    it('should scan empty template literal', () => {
      const lexer = new Lexer('``', false);
      expect(lexer.token.type).toBe(TokenType.TemplateNoSub);
      expect(lexer.token.value).toBe('');
    });
  });

  describe('scanning operators and punctuators', () => {
    it('should scan semicolons', () => {
      const lexer = new Lexer(';', false);
      expect(lexer.token.type).toBe(TokenType.Semicolon);
    });

    it('should scan braces', () => {
      const lexer = new Lexer('{}', false);
      expect(lexer.token.type).toBe(TokenType.LeftBrace);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.RightBrace);
    });

    it('should scan parentheses', () => {
      const lexer = new Lexer('()', false);
      expect(lexer.token.type).toBe(TokenType.LeftParen);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.RightParen);
    });

    it('should scan arrow', () => {
      const lexer = new Lexer('=>', false);
      expect(lexer.token.type).toBe(TokenType.Arrow);
    });

    it('should scan comparison operators', () => {
      const lexer = new Lexer('===', false);
      expect(lexer.token.type).toBe(TokenType.EqualsEqualsEquals);
    });

    it('should scan assignment operators', () => {
      const lexer = new Lexer('+=', false);
      expect(lexer.token.type).toBe(TokenType.PlusEquals);
    });

    it('should scan dot (not followed by digit)', () => {
      const lexer = new Lexer('.x', false);
      expect(lexer.token.type).toBe(TokenType.Dot);
    });

    it('should scan ellipsis', () => {
      const lexer = new Lexer('...', false);
      expect(lexer.token.type).toBe(TokenType.Ellipsis);
    });
  });

  describe('scanning regex literals', () => {
    it('should scan regex at start of input', () => {
      const lexer = new Lexer('/abc/g', false);
      expect(lexer.token.type).toBe(TokenType.RegExpLiteral);
    });

    it('should scan regex after operator', () => {
      const lexer = new Lexer('= /abc/g', false);
      lexer.next(); // advance past =
      expect(lexer.token.type).toBe(TokenType.RegExpLiteral);
    });

    it('should scan division after identifier', () => {
      const lexer = new Lexer('a / b', false);
      lexer.next(); // advance past identifier
      expect(lexer.token.type).toBe(TokenType.Slash);
    });

    it('should scan /= after identifier as SlashEquals', () => {
      const lexer = new Lexer('a /= b', false);
      lexer.next(); // advance past identifier
      expect(lexer.token.type).toBe(TokenType.SlashEquals);
    });
  });

  describe('skipping whitespace and comments', () => {
    it('should skip single spaces', () => {
      const lexer = new Lexer('a b', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
    });

    it('should skip tabs', () => {
      const lexer = new Lexer('a\tb', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
    });

    it('should skip newlines', () => {
      const lexer = new Lexer('a\nb', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
    });

    it('should skip line comments', () => {
      const lexer = new Lexer('a // comment\nb', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
    });

    it('should skip block comments', () => {
      const lexer = new Lexer('a /* comment */ b', false);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.value).toBe('b');
    });

    it('should track line terminators through block comments', () => {
      const lexer = new Lexer('a /*\n*/ b', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });

    it('should not track line terminators through single-line block comments', () => {
      const lexer = new Lexer('a /* inline */ b', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(false);
    });

    it('should skip multiple consecutive comments', () => {
      const lexer = new Lexer('// first\n// second\na', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a');
    });

    it('should skip comment-only source to EOF', () => {
      const lexer = new Lexer('// just a comment', false);
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should handle block comment followed by line comment', () => {
      const lexer = new Lexer('/* block */ // line\na', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a');
    });
  });

  describe('line terminator tracking', () => {
    it('should track LF', () => {
      const lexer = new Lexer('a\nb', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });

    it('should track CR', () => {
      const lexer = new Lexer('a\rb', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });

    it('should track CRLF', () => {
      const lexer = new Lexer('a\r\nb', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(true);
    });

    it('should not have line terminator for same-line tokens', () => {
      const lexer = new Lexer('a b', false);
      lexer.next();
      expect(lexer.hadLineTerminatorBefore).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw on unexpected characters', () => {
      // Unicode characters that are not valid identifier starts or punctuators
      // Use a character that the lexer genuinely cannot handle
      expect(() => new Lexer('\x00', false)).toThrow(SyntaxError);
    });

    it('should throw on unterminated string', () => {
      expect(() => new Lexer('"unclosed', false)).toThrow(SyntaxError);
    });

    it('should throw on unterminated template', () => {
      expect(() => new Lexer('`unclosed', false)).toThrow(SyntaxError);
    });

    it('should throw on unterminated block comment', () => {
      expect(() => new Lexer('/* unclosed', false)).toThrow();
    });

    it('should throw on legacy octal in strict mode', () => {
      expect(() => new Lexer('077', true)).toThrow(SyntaxError);
    });
  });

  describe('complex token sequences', () => {
    it('should tokenize a simple expression', () => {
      const lexer = new Lexer('a + b', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Plus);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('b');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should tokenize a function call', () => {
      const lexer = new Lexer('foo(1, 2)', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.LeftParen);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(1);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Comma);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      expect(lexer.token.value).toBe(2);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.RightParen);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should tokenize variable declaration with string', () => {
      const lexer = new Lexer("const x = 'hello';", false);
      expect(lexer.token.type).toBe(TokenType.Const);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('x');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Equals);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.StringLiteral);
      expect(lexer.token.value).toBe('hello');
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Semicolon);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.EOF);
    });

    it('should tokenize arrow function', () => {
      const lexer = new Lexer('(x) => x', false);
      expect(lexer.token.type).toBe(TokenType.LeftParen);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.RightParen);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Arrow);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
    });

    it('should tokenize object literal', () => {
      const lexer = new Lexer('{ a: 1 }', false);
      expect(lexer.token.type).toBe(TokenType.LeftBrace);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Identifier);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.Colon);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.NumericLiteral);
      lexer.next();
      expect(lexer.token.type).toBe(TokenType.RightBrace);
    });
  });

  describe('Unicode identifiers', () => {
    it('should scan identifiers starting with Unicode letters', () => {
      const lexer = new Lexer('\u00e9value', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('\u00e9value');
    });

    it('should scan identifiers with zero-width joiner', () => {
      const lexer = new Lexer('a\u200db', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a\u200db');
    });

    it('should scan identifiers with zero-width non-joiner', () => {
      const lexer = new Lexer('a\u200cb', false);
      expect(lexer.token.type).toBe(TokenType.Identifier);
      expect(lexer.token.value).toBe('a\u200cb');
    });
  });

  describe('edge cases', () => {
    it('should handle dot at end of source', () => {
      const lexer = new Lexer('.', false);
      expect(lexer.token.type).toBe(TokenType.Dot);
    });

    it('should handle slash at end of source as regex start', () => {
      // At start of input, / is regex start, but /EOF is invalid regex
      expect(() => new Lexer('/', false)).toThrow();
    });

    it('should handle slash at end of source after identifier', () => {
      // After an identifier, / is division
      const lexer = new Lexer('a /', false);
      lexer.next(); // consume 'a'
      expect(lexer.token.type).toBe(TokenType.Slash);
    });
  });
});
