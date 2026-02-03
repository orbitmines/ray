/**
 * Pattern-matching Parser with Automatic Boundary Detection
 * and Dynamic Grammar Evolution
 *
 * Grammar definitions are detected by the pattern: anything with {binding} followed by =>
 *   "/", {path: *}, ("/", *)[] =>           - Path pattern
 *   {greeting: *}, " ", {name: *} => Greeting  - Greeting pattern
 *   "[", {items: *}, "]" => List     - List pattern
 *
 * When parsing a file:
 *   1. Identify all grammar definitions (statements ending with =>)
 *   2. Compile them into the grammar
 *   3. Reparse ALL statements (except definitions) with the evolved grammar
 *   4. Earlier statements ARE reparsed with later-defined grammars
 */

let DEBUG = false;
let DEPTH = 0;
function log(...args: any[]) {
  if (DEBUG) console.log('  '.repeat(DEPTH), ...args);
}

type MatchResult = {
  success: boolean;
  consumed: number;
  value: any;
  bindings: Record<string, any>;
};

type ParseContext = {
  input: string;
  index: number;
  boundaries: Token[];
  preceding?: string;
  params: Record<string, any>;
  bindings: Record<string, any>;
};

// ============ Token Base Class ============

abstract class Token {
  protected bindName?: string;
  protected transformer?: (bindings: Record<string, any>) => any;

  bind(name: string): this {
    this.bindName = name;
    return this;
  }

  set(name: string, fn: (bindings: Record<string, any>) => any): this {
    this.bindName = name;
    this.transformer = fn;
    return this;
  }

  transform(fn: (value: any, bindings: Record<string, any>) => any): TransformToken {
    return new TransformToken(this, fn);
  }

  unless(guard: (preceding: string) => boolean): GuardedToken {
    return new GuardedToken(this, guard);
  }

  isolated(): IsolatedToken {
    return new IsolatedToken(this);
  }

  abstract match(ctx: ParseContext): MatchResult;
  abstract canStartAt(ctx: ParseContext): boolean;
  abstract getFirstConcreteTokens(): Token[];

  protected wrapResult(result: MatchResult): MatchResult {
    if (!result.success) return result;
    const bindings = { ...result.bindings };
    if (this.bindName) {
      bindings[this.bindName] = result.value;
    }
    if (this.transformer) {
      bindings[this.bindName!] = this.transformer(bindings);
    }
    return { ...result, bindings };
  }

  static string(...strings: string[]): StringToken {
    return new StringToken(strings);
  }

  static regex(pattern: RegExp): RegexToken {
    return new RegexToken(pattern);
  }

  static arbitrary(): ArbitraryToken {
    return new ArbitraryToken();
  }

  static array(...tokens: Token[]): ArrayToken {
    return new ArrayToken(tokens);
  }

  static loop(...tokens: Token[]): LoopToken {
    return new LoopToken(tokens, 0);
  }

  static loopAtLeast(min: number, ...tokens: Token[]): LoopToken {
    return new LoopToken(tokens, min);
  }

  static times(...tokens: Token[]): TimesBuilder {
    return new TimesBuilder(tokens);
  }

  static optional(token: Token): OptionalToken {
    return new OptionalToken(token);
  }

  static ref(fn: () => Token, name?: string): RefToken {
    return new RefToken(fn, name);
  }

  static any(...tokens: Token[]): AnyToken {
    return new AnyToken(tokens);
  }

  static end(): EndToken {
    return new EndToken();
  }

  static withParams(
    params: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>),
    token: Token
  ): WithParamsToken {
    return new WithParamsToken(token, params);
  }
}

// ============ Guard Helpers ============

function escapedBy(escapeChar: string): (preceding: string) => boolean {
  return (preceding: string) => {
    let count = 0;
    for (let i = preceding.length - 1; i >= 0 && preceding[i] === escapeChar; i--) {
      count++;
    }
    return count % 2 === 1;
  };
}

function endsWith(suffix: string): (preceding: string) => boolean {
  return (preceding: string) => preceding.endsWith(suffix);
}

// ============ Token Implementations ============

class TimesBuilder {
  private tokens: Token[];
  constructor(tokens: Token[]) { this.tokens = tokens; }
  exactly(count: number | string | ((ctx: ParseContext) => number)): TimesToken {
    return new TimesToken(this.tokens, count);
  }
  atLeast(min: number | string | ((ctx: ParseContext) => number)): TimesAtLeastToken {
    return new TimesAtLeastToken(this.tokens, min);
  }
}

class GuardedToken extends Token {
  constructor(private inner: Token, private guard: (preceding: string) => boolean) { super(); }
  getFirstConcreteTokens(): Token[] { return [this]; }
  canStartAt(ctx: ParseContext): boolean {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) return false;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: ParseContext): MatchResult {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) {
      return { success: false, consumed: 0, value: null, bindings: {} };
    }
    return this.wrapResult(this.inner.match(ctx));
  }
}

class IsolatedToken extends Token {
  constructor(private inner: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return this.inner.getFirstConcreteTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.inner.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    return this.wrapResult(this.inner.match({ ...ctx, boundaries: [] }));
  }
}

class StringToken extends Token {
  strings: string[];
  constructor(strings: string[]) {
    super();
    this.strings = [...strings].sort((a, b) => b.length - a.length);
  }
  getFirstConcreteTokens(): Token[] { return [this]; }
  canStartAt(ctx: ParseContext): boolean {
    const remaining = ctx.input.slice(ctx.index);
    return this.strings.some(s => remaining.startsWith(s));
  }
  match(ctx: ParseContext): MatchResult {
    const remaining = ctx.input.slice(ctx.index);
    for (const str of this.strings) {
      if (remaining.startsWith(str)) {
        return this.wrapResult({ success: true, consumed: str.length, value: str, bindings: {} });
      }
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

class EndToken extends Token {
  getFirstConcreteTokens(): Token[] { return [this]; }
  canStartAt(ctx: ParseContext): boolean { return ctx.index >= ctx.input.length; }
  match(ctx: ParseContext): MatchResult {
    if (ctx.index >= ctx.input.length) {
      return this.wrapResult({ success: true, consumed: 0, value: '', bindings: {} });
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

class RegexToken extends Token {
  pattern: RegExp;
  constructor(pattern: RegExp) {
    super();
    const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';
    this.pattern = new RegExp(pattern.source, flags);
  }
  getFirstConcreteTokens(): Token[] { return [this]; }
  canStartAt(ctx: ParseContext): boolean {
    this.pattern.lastIndex = ctx.index;
    return this.pattern.test(ctx.input);
  }
  match(ctx: ParseContext): MatchResult {
    this.pattern.lastIndex = ctx.index;
    const match = this.pattern.exec(ctx.input);
    if (match) {
      return this.wrapResult({ success: true, consumed: match[0].length, value: match[0], bindings: {} });
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

class ArbitraryToken extends Token {
  getFirstConcreteTokens(): Token[] { return []; }
  canStartAt(ctx: ParseContext): boolean {
    if (ctx.boundaries.length === 0) return true;
    const testCtx: ParseContext = { ...ctx, boundaries: [], preceding: '' };
    for (const boundary of ctx.boundaries) {
      if (boundary.canStartAt(testCtx)) return false;
    }
    return true;
  }
  match(ctx: ParseContext): MatchResult {
    const remaining = ctx.input.slice(ctx.index);
    if (ctx.boundaries.length === 0) {
      return this.wrapResult({ success: true, consumed: remaining.length, value: remaining, bindings: {} });
    }
    for (let i = 0; i <= remaining.length; i++) {
      const preceding = remaining.slice(0, i);
      const testCtx: ParseContext = { ...ctx, index: ctx.index + i, boundaries: [], preceding };
      for (const boundary of ctx.boundaries) {
        if (boundary.canStartAt(testCtx)) {
          if (i === 0) return { success: false, consumed: 0, value: null, bindings: {} };
          return this.wrapResult({ success: true, consumed: i, value: preceding, bindings: {} });
        }
      }
    }
    return this.wrapResult({ success: true, consumed: remaining.length, value: remaining, bindings: {} });
  }
}

class ArrayToken extends Token {
  constructor(public tokens: Token[]) { super(); }
  getFirstConcreteTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    return this.tokens[0].getFirstConcreteTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.tokens.length === 0) return true;
    return this.tokens[0].canStartAt(ctx);
  }
  match(ctx: ParseContext): MatchResult {
    let totalConsumed = 0;
    const values: any[] = [];
    let accumulatedBindings: Record<string, any> = { ...ctx.bindings };
    let currentIndex = ctx.index;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const remainingTokens = this.tokens.slice(i + 1);
      const remainingConcreteTokens: Token[] = [];
      for (const rt of remainingTokens) {
        remainingConcreteTokens.push(...rt.getFirstConcreteTokens());
      }
      const boundaries = [...remainingConcreteTokens, ...ctx.boundaries];

      const result = token.match({
        input: ctx.input, index: currentIndex, boundaries,
        params: ctx.params, bindings: accumulatedBindings,
      });

      if (!result.success) return { success: false, consumed: 0, value: null, bindings: {} };

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      accumulatedBindings = { ...accumulatedBindings, ...result.bindings };
    }

    const newBindings: Record<string, any> = {};
    for (const key of Object.keys(accumulatedBindings)) {
      if (!(key in ctx.bindings)) newBindings[key] = accumulatedBindings[key];
    }
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, bindings: newBindings });
  }
}

class LoopToken extends Token {
  constructor(public tokens: Token[], public minCount: number = 0) { super(); }
  getFirstConcreteTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.tokens.length === 0) return true;
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.canStartAt(ctx);
  }
  match(ctx: ParseContext): MatchResult {
    const innerToken = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    while (true) {
      const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [] };

      const result = innerToken.match({
        input: ctx.input, index: currentIndex, boundaries: ctx.boundaries,
        params: ctx.params, bindings: ctx.bindings,
      });

      if (result.success && result.consumed > 0) {
        totalConsumed += result.consumed;
        currentIndex += result.consumed;
        values.push(result.value);
        allBindings = { ...allBindings, ...result.bindings };
        iterations++;
        continue;
      }

      if (iterations >= this.minCount) {
        for (const boundary of ctx.boundaries) {
          if (boundary.canStartAt(testCtx)) {
            return this.wrapResult({ success: true, consumed: totalConsumed, value: values, bindings: allBindings });
          }
        }
      }
      break;
    }

    if (iterations < this.minCount) return { success: false, consumed: 0, value: null, bindings: {} };
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, bindings: allBindings });
  }
}

class TimesToken extends Token {
  constructor(public tokens: Token[], public count: number | string | ((ctx: ParseContext) => number)) { super(); }
  private getCount(ctx: ParseContext): number {
    if (typeof this.count === 'number') return this.count;
    if (typeof this.count === 'string') return ctx.params[this.count] ?? 0;
    return this.count(ctx);
  }
  getFirstConcreteTokens(): Token[] {
    if (typeof this.count !== 'number' || this.count === 0) return [];
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    const count = this.getCount(ctx);
    if (count === 0) return true;
    if (this.tokens.length === 0) return true;
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.canStartAt(ctx);
  }
  match(ctx: ParseContext): MatchResult {
    const count = this.getCount(ctx);
    const innerToken = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;

    for (let i = 0; i < count; i++) {
      const result = innerToken.match({
        input: ctx.input, index: currentIndex, boundaries: ctx.boundaries,
        params: ctx.params, bindings: ctx.bindings,
      });
      if (!result.success) return { success: false, consumed: 0, value: null, bindings: {} };
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
    }
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, bindings: allBindings });
  }
}

class TimesAtLeastToken extends Token {
  constructor(public tokens: Token[], public min: number | string | ((ctx: ParseContext) => number)) { super(); }
  private getMin(ctx: ParseContext): number {
    if (typeof this.min === 'number') return this.min;
    if (typeof this.min === 'string') return ctx.params[this.min] ?? 0;
    return this.min(ctx);
  }
  getFirstConcreteTokens(): Token[] {
    if (typeof this.min !== 'number' || this.min === 0) return [];
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    const min = this.getMin(ctx);
    if (min === 0) return true;
    if (this.tokens.length === 0) return true;
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.canStartAt(ctx);
  }
  match(ctx: ParseContext): MatchResult {
    const min = this.getMin(ctx);
    const innerToken = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    while (true) {
      if (iterations >= min) {
        const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [] };
        for (const boundary of ctx.boundaries) {
          if (boundary.canStartAt(testCtx)) {
            return this.wrapResult({
              success: true, consumed: totalConsumed,
              value: { count: iterations, values }, bindings: allBindings,
            });
          }
        }
      }
      const result = innerToken.match({
        input: ctx.input, index: currentIndex, boundaries: ctx.boundaries,
        params: ctx.params, bindings: ctx.bindings,
      });
      if (!result.success || result.consumed === 0) break;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }

    if (iterations < min) return { success: false, consumed: 0, value: null, bindings: {} };
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, bindings: allBindings,
    });
  }
}

class OptionalToken extends Token {
  constructor(public token: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return this.token.getFirstConcreteTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.token.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);
    if (result.success) return this.wrapResult(result);
    return this.wrapResult({ success: true, consumed: 0, value: null, bindings: {} });
  }
}

class TransformToken extends Token {
  constructor(public token: Token, public transformFn: (value: any, bindings: Record<string, any>) => any) { super(); }
  getFirstConcreteTokens(): Token[] { return this.token.getFirstConcreteTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.token.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);
    if (!result.success) return result;
    const transformedValue = this.transformFn(result.value, result.bindings);
    return this.wrapResult({ ...result, value: transformedValue });
  }
}

class RefToken extends Token {
  private _cached?: Token;
  constructor(public fn: () => Token, public name: string = 'ref') { super(); }
  private get cached(): Token {
    if (!this._cached) this._cached = this.fn();
    return this._cached;
  }
  getFirstConcreteTokens(): Token[] { return this.cached.getFirstConcreteTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.cached.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    DEPTH++;
    const result = this.cached.match(ctx);
    DEPTH--;
    return this.wrapResult(result);
  }
}

class AnyToken extends Token {
  constructor(public tokens: Token[]) { super(); }
  getFirstConcreteTokens(): Token[] {
    const result: Token[] = [];
    for (const token of this.tokens) result.push(...token.getFirstConcreteTokens());
    return result;
  }
  canStartAt(ctx: ParseContext): boolean {
    return this.tokens.some(t => t.canStartAt(ctx));
  }
  match(ctx: ParseContext): MatchResult {
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const otherConcreteTokens: Token[] = [];
      for (let j = 0; j < this.tokens.length; j++) {
        if (j !== i) otherConcreteTokens.push(...this.tokens[j].getFirstConcreteTokens());
      }
      const boundaries = [...otherConcreteTokens, ...ctx.boundaries];
      const result = token.match({ ...ctx, boundaries });
      if (result.success) return this.wrapResult(result);
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

class WithParamsToken extends Token {
  constructor(
    public inner: Token,
    public paramsFn: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>)
  ) { super(); }
  getFirstConcreteTokens(): Token[] { return this.inner.getFirstConcreteTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.inner.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    const newParams = typeof this.paramsFn === 'function'
      ? this.paramsFn(ctx, ctx.bindings)
      : this.paramsFn;
    const mergedParams = { ...ctx.params, ...newParams };
    return this.wrapResult(this.inner.match({ ...ctx, params: mergedParams }));
  }
}

// ============ Parser ============

class Parser {
  constructor(public grammar: Token, public initialParams: Record<string, any> = {}) {}
  parse(input: string): MatchResult {
    return this.grammar.match({
      input, index: 0, boundaries: [],
      params: this.initialParams, bindings: {},
    });
  }
}

// ============ Self-Hosting Grammar with Dynamic Evolution ============

interface ParsedStatement {
  type: 'grammar_def' | 'statement';
  raw: string;
  patternText?: string;
  ruleName?: string;
  bindings?: Record<string, any>;
  value?: any;
}

interface DynamicParseResult {
  statements: ParsedStatement[];
  grammar: SelfHostingGrammar;
}

class SelfHostingGrammar {
  private rules: Map<string, Token[]> = new Map();
  private ruleOrder: string[] = [];
  private primitiveRules: Set<string> = new Set();
  patternGrammar: Token;

  constructor() {
    this.addPrimitive('PROGRAM', Token.arbitrary());
    this.addPrimitive('String', Token.arbitrary());
    this.addPrimitive('Expression', Token.ref(() => this.getRule('PROGRAM'), 'Expression'));
    this.addPrimitive('QuotedString', Token.array(
      Token.string('"'),
      Token.arbitrary().bind('content'),
      Token.string('"').unless(escapedBy('\\'))
    ));
    this.patternGrammar = this.buildPatternGrammar();
  }

  private buildPatternGrammar(): Token {
    const self = this;
    const WS = Token.loop(Token.regex(/[ \t]/));

    const extractString = (chars: any[]): string => {
      let value = '';
      for (const c of chars) {
        if (Array.isArray(c) && c[0] === 'ESC') {
          const escaped = c[1];
          if (escaped === 'n') value += '\n';
          else if (escaped === 't') value += '\t';
          else if (escaped === '\\') value += '\\';
          else if (escaped === '"') value += '"';
          else value += escaped;
        } else if (typeof c === 'string') {
          value += c;
        }
      }
      return value;
    };

    const STRING_LITERAL = Token.array(
      Token.string('"'),
      Token.loop(Token.any(
        Token.array(Token.string('\\'), Token.regex(/./)).transform((v) => ['ESC', v[1]]),
        Token.regex(/[^"\\]/)
      )),
      Token.string('"')
    ).transform((v) => Token.string(extractString(v[1] || [])));

    const ARBITRARY = Token.string('*').transform(() => Token.arbitrary());

    const PATTERN: Token = Token.ref(() => ALTERNATIVES, 'Pattern');

    const BINDING = Token.array(
      Token.string('{'), WS,
      Token.regex(/[a-zA-Z_][a-zA-Z0-9_]*/), WS,
      Token.optional(Token.array(Token.string(':'), WS, PATTERN, WS)),
      Token.string('}')
    ).transform((v) => {
      const name = v[2];
      const optionalInner = v[4];
      let innerToken: Token = optionalInner && optionalInner.length > 0
        ? optionalInner[2]
        : self.getRule('Expression');
      return innerToken.bind(name);
    });

    const GROUP = Token.array(
      Token.string('('), WS, PATTERN, WS, Token.string(')')
    ).transform((v) => v[2]);

    const REFERENCE = Token.regex(/[a-zA-Z_][a-zA-Z0-9_]*/)
      .transform((v) => self.getRule(v));

    const ATOM = Token.any(STRING_LITERAL, ARBITRARY, BINDING, GROUP, REFERENCE);

    const POSTFIX = Token.optional(Token.array(
      Token.string('[]'),
      Token.optional(Token.string('.NonEmpty'))
    ));

    const ELEMENT = Token.array(ATOM, POSTFIX).transform((v) => {
      let token: Token = v[0];
      const postfixResult = v[1];
      if (postfixResult) {
        const isNonEmpty = postfixResult[1];
        token = isNonEmpty ? Token.times(token).atLeast(1) : Token.loop(token);
      }
      return token;
    });

    const SEQUENCE = Token.array(
      WS, ELEMENT,
      Token.loop(Token.array(WS, Token.optional(Token.string(',')), WS, ELEMENT)),
      WS
    ).transform((v) => {
      const tokens: Token[] = [v[1]];
      for (const r of v[2] || []) {
        if (r[3] instanceof Token) tokens.push(r[3]);
      }
      return tokens.length === 1 ? tokens[0] : Token.array(...tokens);
    });

    const ALTERNATIVES: Token = Token.array(
      SEQUENCE,
      Token.loop(Token.array(WS, Token.string('|'), WS, SEQUENCE))
    ).transform((v) => {
      const tokens: Token[] = [v[0]];
      for (const alt of v[1] || []) {
        if (alt[3] instanceof Token) tokens.push(alt[3]);
      }
      return tokens.length === 1 ? tokens[0] : Token.any(...tokens);
    });

    return ALTERNATIVES;
  }

  private addPrimitive(name: string, token: Token) {
    this.rules.set(name, [token]);
    this.ruleOrder.push(name);
    this.primitiveRules.add(name);
  }

  getRule(name: string): Token {
    return Token.ref(() => {
      const rules = this.rules.get(name);
      if (!rules || rules.length === 0) {
        return Token.string('\x00UNDEFINED_RULE:' + name + '\x00');
      }
      return rules.length === 1 ? rules[0] : Token.any(...rules);
    }, name);
  }

  addRule(name: string, token: Token) {
    if (this.primitiveRules.has(name)) {
      this.rules.set(name, []);
      this.primitiveRules.delete(name);
    }
    if (!this.rules.has(name)) {
      this.rules.set(name, []);
      this.ruleOrder.push(name);
    }
    this.rules.get(name)!.unshift(token);
  }

  getRuleNames(): string[] {
    return [...this.ruleOrder];
  }

  compilePatternContent(content: string): Token {
    const parser = new Parser(this.patternGrammar);
    const result = parser.parse(content);
    if (!result.success || !(result.value instanceof Token)) {
      throw new Error(`Failed to parse pattern: "${content}"`);
    }
    return result.value;
  }

  // ============ Dynamic Grammar Parsing ============

  /**
   * Check if a line is a grammar definition.
   * Grammar definitions contain {binding} syntax and end with =>
   * Returns { patternText, ruleName } or null
   */
  private extractGrammarDef(line: string): { patternText: string; ruleName: string } | null {
    const trimmed = line.trim();

    // Must contain { and end with => (with optional rule name)
    if (!trimmed.includes('{')) return null;

    // Check for => at the end
    const arrowMatch = trimmed.match(/=>\s*([A-Z][a-zA-Z0-9_]*)?\s*$/);
    if (!arrowMatch) return null;

    // Extract the pattern part (everything before =>)
    const arrowIndex = trimmed.lastIndexOf('=>');
    const patternText = trimmed.slice(0, arrowIndex).trim();
    const ruleName = arrowMatch[1] || 'Expression';

    return { patternText, ruleName };
  }

  /**
   * Parse input with dynamic grammar evolution.
   *
   * 1. Find all grammar definitions (lines with {binding} ending in =>)
   * 2. Compile them into the grammar
   * 3. Reparse ALL non-definition statements with the evolved grammar
   */
  parseWithEvolution(input: string): DynamicParseResult {
    // Split into lines/statements
    const lines: { raw: string; start: number; end: number }[] = [];
    let pos = 0;
    while (pos < input.length) {
      let endPos = input.indexOf('\n', pos);
      if (endPos === -1) endPos = input.length;
      else endPos += 1;

      const raw = input.slice(pos, endPos);
      if (raw.trim()) {
        lines.push({ raw, start: pos, end: endPos });
      }
      pos = endPos;
    }

    // Phase 1: Identify grammar definitions
    const grammarDefs: ({ patternText: string; ruleName: string; lineIndex: number } | null)[] = [];
    const isGrammarDef: boolean[] = [];

    for (let i = 0; i < lines.length; i++) {
      const def = this.extractGrammarDef(lines[i].raw);
      grammarDefs.push(def ? { ...def, lineIndex: i } : null);
      isGrammarDef.push(def !== null);
    }

    // Phase 2: Compile grammar definitions
    for (const def of grammarDefs) {
      if (def) {
        try {
          const compiledToken = this.compilePatternContent(def.patternText);
          if (def.ruleName !== 'Expression') {
            this.addRule(def.ruleName, compiledToken);
          }
          this.addRule('Expression', compiledToken);
        } catch (e) {
          // Compilation failed, skip this definition
        }
      }
    }

    // Phase 3: Reparse non-definition statements
    const statements: ParsedStatement[] = [];
    const expr = this.getRule('Expression');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const def = grammarDefs[i];

      if (def) {
        // Grammar definition - keep frozen
        statements.push({
          type: 'grammar_def',
          raw: line.raw,
          patternText: def.patternText,
          ruleName: def.ruleName,
        });
      } else {
        // Regular statement - parse with evolved grammar
        const content = line.raw.replace(/\n$/, '');
        const parser = new Parser(expr);
        const result = parser.parse(content);

        statements.push({
          type: 'statement',
          raw: line.raw,
          bindings: result.success ? result.bindings : undefined,
          value: result.success ? result.value : undefined,
        });
      }
    }

    return { statements, grammar: this };
  }
}

// ============ Tests ============

console.log('='.repeat(60));
console.log('Dynamic Grammar Evolution Tests');
console.log('='.repeat(60) + '\n');

console.log('Test 1: Path pattern affects EARLIER statements');
console.log('-'.repeat(40));

const input1 = `/path/earlier/in/file

"/", {first: *}, ("/", {rest: *})[] =>

/another/path/here
`;

console.log('Input:');
console.log(input1);

const grammar1 = new SelfHostingGrammar();
const result1 = grammar1.parseWithEvolution(input1);

console.log('Results:');
for (const stmt of result1.statements) {
  if (stmt.type === 'grammar_def') {
    console.log(`  [GRAMMAR DEF] "${stmt.patternText}" => ${stmt.ruleName}`);
  } else {
    console.log(`  [STATEMENT] "${stmt.raw.trim()}"`);
    if (stmt.bindings && Object.keys(stmt.bindings).length > 0) {
      console.log(`    bindings: ${JSON.stringify(stmt.bindings)}`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('Test 2: Greeting pattern');
console.log('-'.repeat(40));

const input2 = `hello world

{greeting: *}, " ", {name: *} => Greeting

goodbye friend
`;

console.log('Input:');
console.log(input2);

const grammar2 = new SelfHostingGrammar();
const result2 = grammar2.parseWithEvolution(input2);

console.log('Results:');
for (const stmt of result2.statements) {
  if (stmt.type === 'grammar_def') {
    console.log(`  [GRAMMAR DEF] "${stmt.patternText}" => ${stmt.ruleName}`);
  } else {
    console.log(`  [STATEMENT] "${stmt.raw.trim()}"`);
    if (stmt.bindings && Object.keys(stmt.bindings).length > 0) {
      console.log(`    bindings: ${JSON.stringify(stmt.bindings)}`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('Test 3: List pattern - EARLIER statement reparsed');
console.log('-'.repeat(40));

const input3 = `[a, b, c]

"[", {first: *}, (", ", {rest: *})[], "]" => List

[x, y, z]
`;

console.log('Input:');
console.log(input3);
console.log('KEY: The FIRST line [a, b, c] should be parsed with the List pattern!');

const grammar3 = new SelfHostingGrammar();
const result3 = grammar3.parseWithEvolution(input3);

console.log('\nResults:');
for (const stmt of result3.statements) {
  if (stmt.type === 'grammar_def') {
    console.log(`  [GRAMMAR DEF] "${stmt.patternText}" => ${stmt.ruleName}`);
  } else {
    console.log(`  [STATEMENT] "${stmt.raw.trim()}"`);
    if (stmt.bindings && Object.keys(stmt.bindings).length > 0) {
      console.log(`    bindings: ${JSON.stringify(stmt.bindings)}`);
      console.log(`    ✓ Successfully parsed!`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('Test 4: Block pattern with nested braces');
console.log('-'.repeat(40));

const input4 = `{simple content}

"{", {content: *}, "}" => Block

{more content here}
`;

console.log('Input:');
console.log(input4);

const grammar4 = new SelfHostingGrammar();
const result4 = grammar4.parseWithEvolution(input4);

console.log('Results:');
for (const stmt of result4.statements) {
  if (stmt.type === 'grammar_def') {
    console.log(`  [GRAMMAR DEF] "${stmt.patternText}" => ${stmt.ruleName}`);
  } else {
    console.log(`  [STATEMENT] "${stmt.raw.trim()}"`);
    if (stmt.bindings && Object.keys(stmt.bindings).length > 0) {
      console.log(`    bindings: ${JSON.stringify(stmt.bindings)}`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`
Grammar definitions are detected by: {binding} syntax + ending with =>

Examples:
  "/", {path: *} =>                    - Path pattern
  {greeting: *}, " ", {name: *} =>     - Greeting pattern  
  "[", {items: *}, "]" => List         - List pattern (named)

The key feature: EARLIER statements ARE reparsed with the evolved grammar!
Grammar definition statements themselves are FROZEN (not reparsed).
`);

export { Token, Parser, SelfHostingGrammar, escapedBy, endsWith };
export type { MatchResult, ParseContext, ParsedStatement, DynamicParseResult };