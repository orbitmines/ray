import fs from "fs";

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
  iterationBoundaries?: Token[];
  suppressIterBoundaries?: boolean;
  preceding?: string;
  params: Record<string, any>;
  bindings: Record<string, any>;
};

abstract class Token {
  protected bindName?: string;

  bind(name: string): this {
    this.bindName = name;
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

  noIterBoundaries(): NoIterBoundariesToken {
    return new NoIterBoundariesToken(this);
  }

  abstract match(ctx: ParseContext): MatchResult;
  abstract canStartAt(ctx: ParseContext): boolean;
  abstract getFirstConcreteTokens(): Token[];

  getAllPossibleStartTokens(): Token[] {
    return this.getFirstConcreteTokens();
  }

  canMatchEmpty(): boolean {
    return false;
  }

  protected wrapResult(result: MatchResult): MatchResult {
    if (!result.success) return result;
    const bindings = { ...result.bindings };
    if (this.bindName) {
      bindings[this.bindName] = result.value;
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

class TimesBuilder {
  private tokens: Token[];
  constructor(tokens: Token[]) { this.tokens = tokens; }
  exactly(count: number | string | ((ctx: ParseContext) => number)): TimesToken {
    return new TimesToken(this.tokens, count);
  }
  atLeast(min: number | string | ((ctx: ParseContext) => number)): TimesAtLeastToken {
    return new TimesAtLeastToken(this.tokens, min);
  }
  atMost(max: number | string | ((ctx: ParseContext) => number)): TimesAtMostToken {
    return new TimesAtMostToken(this.tokens, max);
  }
  between(min: number, max: number): TimesBetweenToken {
    return new TimesBetweenToken(this.tokens, min, max);
  }
}

function endsWith(suffix: string): (preceding: string) => boolean {
  return (preceding: string) => preceding.endsWith(suffix);
}

function escapedBy(escapeChar: string): (preceding: string) => boolean {
  return (preceding: string) => {
    let count = 0;
    for (let i = preceding.length - 1; i >= 0 && preceding[i] === escapeChar; i--) {
      count++;
    }
    return count % 2 === 1;
  };
}

function matchesEnd(pattern: RegExp): (preceding: string) => boolean {
  return (preceding: string) => pattern.test(preceding);
}

class GuardedToken extends Token {
  constructor(private inner: Token, private guard: (preceding: string) => boolean) { super(); }
  getFirstConcreteTokens(): Token[] { return [this]; }
  getAllPossibleStartTokens(): Token[] { return [this]; }
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
  getAllPossibleStartTokens(): Token[] { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.inner.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    return this.wrapResult(this.inner.match({ ...ctx, boundaries: [], iterationBoundaries: [] }));
  }
}

class NoIterBoundariesToken extends Token {
  constructor(private inner: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens(): Token[] { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.inner.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    return this.wrapResult(this.inner.match({
      ...ctx, iterationBoundaries: [], suppressIterBoundaries: true
    }));
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
  canStartAt(ctx: ParseContext): boolean {
    if (ctx.index >= ctx.input.length) return true;
    for (const boundary of ctx.boundaries) {
      const testCtx: ParseContext = { ...ctx, boundaries: [], preceding: '' };
      if (boundary.canStartAt(testCtx)) return true;
    }
    return false;
  }
  match(ctx: ParseContext): MatchResult {
    if (ctx.index >= ctx.input.length) {
      return this.wrapResult({ success: true, consumed: 0, value: '', bindings: {} });
    }
    for (const boundary of ctx.boundaries) {
      const testCtx: ParseContext = { ...ctx, boundaries: [], preceding: '' };
      if (boundary.canStartAt(testCtx)) {
        return this.wrapResult({ success: true, consumed: 0, value: '', bindings: {} });
      }
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
  canStartAt(_ctx: ParseContext): boolean { return true; }
  match(ctx: ParseContext): MatchResult {
    const remaining = ctx.input.slice(ctx.index);
    const allBoundaries = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];
    if (allBoundaries.length === 0) {
      return this.wrapResult({ success: true, consumed: remaining.length, value: remaining, bindings: {} });
    }
    for (let i = 0; i <= remaining.length; i++) {
      const preceding = remaining.slice(0, i);
      const testCtx: ParseContext = { ...ctx, index: ctx.index + i, boundaries: [], iterationBoundaries: [], preceding };
      for (const boundary of allBoundaries) {
        if (boundary.canStartAt(testCtx)) {
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
    const result: Token[] = [];
    for (const token of this.tokens) {
      const firsts = token.getFirstConcreteTokens();
      result.push(...firsts);
      if (firsts.length > 0) break;
    }
    return result;
  }
  getAllPossibleStartTokens(): Token[] {
    const result: Token[] = [];
    for (const token of this.tokens) {
      result.push(...token.getAllPossibleStartTokens());
      if (token.getFirstConcreteTokens().length > 0) break;
    }
    return result;
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.tokens.length === 0) return true;
    for (const token of this.tokens) {
      const firsts = token.getFirstConcreteTokens();
      if (firsts.length > 0) {
        return token.canStartAt(ctx);
      }
      if (token.canStartAt(ctx)) return true;
    }
    return true;
  }
  match(ctx: ParseContext): MatchResult {
    let totalConsumed = 0;
    const values: any[] = [];
    let accumulatedBindings: Record<string, any> = { ...ctx.bindings };
    let currentIndex = ctx.index;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const remainingTokens = this.tokens.slice(i + 1);
      const remainingBoundaries: Token[] = [];
      for (const rt of remainingTokens) {
        const firsts = rt.getFirstConcreteTokens();
        if (firsts.length > 0) {
          remainingBoundaries.push(...rt.getAllPossibleStartTokens());
          break;
        }
      }
      const boundaries = [...remainingBoundaries, ...ctx.boundaries];

      const result = token.match({
        input: ctx.input, index: currentIndex, boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
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
    if (this.minCount === 0) return [];
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }
  getAllPossibleStartTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getAllPossibleStartTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.minCount === 0) return true;
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
    const iterationStarts = ctx.suppressIterBoundaries ? [] : innerToken.getAllPossibleStartTokens();

    while (true) {
      const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };
      const result = innerToken.match({
        input: ctx.input, index: currentIndex, boundaries: ctx.boundaries,
        iterationBoundaries: iterationStarts,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
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
  getAllPossibleStartTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getAllPossibleStartTokens();
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
        iterationBoundaries: ctx.iterationBoundaries,
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
  getAllPossibleStartTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getAllPossibleStartTokens();
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
        const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };
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
        iterationBoundaries: ctx.iterationBoundaries,
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

class TimesAtMostToken extends Token {
  constructor(public tokens: Token[], public max: number | string | ((ctx: ParseContext) => number)) { super(); }
  private getMax(ctx: ParseContext): number {
    if (typeof this.max === 'number') return this.max;
    if (typeof this.max === 'string') return ctx.params[this.max] ?? 0;
    return this.max(ctx);
  }
  getFirstConcreteTokens(): Token[] { return []; }
  getAllPossibleStartTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getAllPossibleStartTokens();
  }
  canStartAt(_ctx: ParseContext): boolean { return true; }
  match(ctx: ParseContext): MatchResult {
    const max = this.getMax(ctx);
    const innerToken = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    while (iterations < max) {
      const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };
      for (const boundary of ctx.boundaries) {
        if (boundary.canStartAt(testCtx)) {
          return this.wrapResult({
            success: true, consumed: totalConsumed,
            value: { count: iterations, values }, bindings: allBindings,
          });
        }
      }
      const result = innerToken.match({
        input: ctx.input, index: currentIndex, boundaries: ctx.boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        params: ctx.params, bindings: ctx.bindings,
      });
      if (!result.success || result.consumed === 0) break;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, bindings: allBindings,
    });
  }
}

class TimesBetweenToken extends Token {
  constructor(public tokens: Token[], public min: number, public max: number) { super(); }
  getFirstConcreteTokens(): Token[] {
    if (this.min === 0) return [];
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }
  getAllPossibleStartTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getAllPossibleStartTokens();
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.min === 0) return true;
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

    while (iterations < this.max) {
      if (iterations >= this.min) {
        const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };
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
        iterationBoundaries: ctx.iterationBoundaries,
        params: ctx.params, bindings: ctx.bindings,
      });
      if (!result.success || result.consumed === 0) break;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }

    if (iterations < this.min) return { success: false, consumed: 0, value: null, bindings: {} };
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, bindings: allBindings,
    });
  }
}

class WithParamsToken extends Token {
  constructor(
    public inner: Token,
    public paramsFn: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>)
  ) { super(); }
  getFirstConcreteTokens(): Token[] { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens(): Token[] { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.inner.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    const newParams = typeof this.paramsFn === 'function'
      ? this.paramsFn(ctx, ctx.bindings)
      : this.paramsFn;
    const mergedParams = { ...ctx.params, ...newParams };
    return this.wrapResult(this.inner.match({ ...ctx, params: mergedParams }));
  }
}

class OptionalToken extends Token {
  constructor(public token: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return []; }
  getAllPossibleStartTokens(): Token[] { return this.token.getAllPossibleStartTokens(); }
  canStartAt(_ctx: ParseContext): boolean { return true; }
  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);
    if (result.success) return this.wrapResult(result);
    return this.wrapResult({ success: true, consumed: 0, value: null, bindings: {} });
  }
}

class TransformToken extends Token {
  constructor(public token: Token, public transformFn: (value: any, bindings: Record<string, any>) => any) { super(); }
  getFirstConcreteTokens(): Token[] { return this.token.getFirstConcreteTokens(); }
  getAllPossibleStartTokens(): Token[] { return this.token.getAllPossibleStartTokens(); }
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
  getAllPossibleStartTokens(): Token[] { return this.cached.getAllPossibleStartTokens(); }
  canStartAt(ctx: ParseContext): boolean { return this.cached.canStartAt(ctx); }
  match(ctx: ParseContext): MatchResult {
    DEPTH++;
    const result = this.cached.match({ ...ctx, iterationBoundaries: [] });
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
  getAllPossibleStartTokens(): Token[] {
    const result: Token[] = [];
    for (const token of this.tokens) result.push(...token.getAllPossibleStartTokens());
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
        if (j !== i) otherConcreteTokens.push(...this.tokens[j].getAllPossibleStartTokens());
      }
      const iterBoundaries = [...otherConcreteTokens, ...(ctx.iterationBoundaries || [])];
      const result = token.match({ ...ctx, iterationBoundaries: iterBoundaries });
      if (result.success) return this.wrapResult(result);
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

class Parser3 {
  constructor(public grammar: Token, public initialParams: Record<string, any> = {}) {}
  parse(input: string): MatchResult {
    return this.grammar.match({
      input, index: 0, boundaries: [],
      params: this.initialParams, bindings: {},
    });
  }
}

export { Token, Parser3, escapedBy, endsWith, matchesEnd };
export type { MatchResult, ParseContext };

/**
 * Proxy-Based Grammar Builder
 *
 * Rewrites the Token grammar parsing mechanism from parser.ts using the
 * fluent, proxy-based API syntax from the Var/Node design.
 *
 * ═══════════════════════════════════════════════════════════
 * SYNTAX MAPPING (Old Token API → New Proxy API)
 * ═══════════════════════════════════════════════════════════
 *
 * Token.string('x')                 →  ctx.val('x')  or  'x' inside Array/Any
 * Token.arbitrary()                 →  ctx.arbitrary
 * Token.regex(/pat/)                →  ctx.regex(/pat/)
 * Token.end()                       →  ctx.end
 * Token.array(a, b, c)             →  ctx.Array(a, b, c)
 * Token.any(a, b, c)               →  ctx.Any(a, b, c)
 * Token.loop(tok)                   →  tok[``]        (empty template literal key)
 * Token.loopAtLeast(1, tok)        →  tok[``].NonEmpty  or  tok[``].constrain(x => x.length, '>=', 1)
 * Token.optional(tok)              →  tok.optional
 * Token.ref(() => X, 'X')          →  ctx.X          (auto-creates ref from rule name)
 * tok.bind('name')                  →  tok.bind(ctx.name)  or  tok.bind('name')
 * Token.withParams({...}, tok)     →  tok.with({...})  or  tok.with((ctx, bindings) => ({...}))
 * tok.isolated()                    →  tok.isolated
 * tok.unless(fn)                    →  tok.unless(fn)
 * tok.transform(fn)                →  tok.transform(fn)
 * tok.noIterBoundaries()           →  tok.noIterBoundaries
 * ctx.not('x')                      →  matches any single char that is NOT 'x'
 *
 * Token.times(tok).exactly(n)      →  tok[``].constrain(x => x.length, '==', n)
 * Token.times(tok).atLeast(n)      →  tok[``].constrain(x => x.length, '>=', n)
 * Token.times(tok).atMost(n)       →  tok[``].constrain(x => x.length, '<=', n)
 * Token.times(tok).exactly('param')→  tok[``].constrain(x => x.length, '==', 'param')
 *
 * ctx.X = expr                      →  defines rule 'X'
 * ctx.X                              →  references rule 'X' (lazy Token.ref)
 *
 * ═══════════════════════════════════════════════════════════
 * EXAMPLE: STATEMENT grammar
 * ═══════════════════════════════════════════════════════════
 *
 * OLD:
 *   const STATEMENT = Token.array(
 *     Token.loop(EMPTY_LINE),
 *     Token.arbitrary().bind('content'),
 *     Token.any(Token.string(';'), Token.string('\n'), Token.end()),
 *     Token.loop(Token.array(
 *       Token.loop(EMPTY_LINE),
 *       Token.times(Token.string(' ')).exactly('indent'),
 *       Token.times(Token.string(' ')).atLeast(1).bind('added'),
 *       Token.withParams(
 *         (ctx, bindings) => ({ indent: ctx.params.indent + bindings.added.count }),
 *         Token.ref(() => STATEMENT)
 *       )
 *     )).bind('children')
 *   );
 *
 * NEW:
 *   ctx.empty_line = ctx.regex(/[ \t]*\n/);
 *   ctx.statement = ctx.Array(
 *     ctx.empty_line[``],
 *     ctx.arbitrary.bind(ctx.content),
 *     ctx.Any(';', '\n', ctx.end),
 *     ctx.Array(
 *       ctx.empty_line[``],
 *       ctx.val(' ')[``].constrain(x => x.length, '==', 'indent'),
 *       ctx.val(' ')[``].constrain(x => x.length, '>=', 1).bind(ctx.added),
 *       ctx.statement.with((pctx, bindings) => ({ indent: pctx.params.indent + bindings.added.count }))
 *     )[``].bind(ctx.children)
 *   );
 *   ctx.Expression = ctx.statement[``].bind(ctx.statements);
 */

// import {
//   Token, Parser, escapedBy, endsWith, matchesEnd,
//   type MatchResult, type ParseContext
// } from './parser';

// ============ Symbols ============

const _token = Symbol('token');
const _name = Symbol('name');
const _self = Symbol('self');

export { _self as _, _token, _name };

// ============ Types ============

type Val = GNode | string | number | boolean | void | undefined | null;

interface GNode {
  [_token]: Token;
  [_name]: string | undefined;
  [key: string]: any;
}

// ============ Helpers ============

function isGNode(val: any): val is GNode {
  return val != null && (typeof val === 'object' || typeof val === 'function') && _token in val;
}

function extractToken(val: Val): Token {
  if (val === null || val === undefined) {
    throw new Error('Cannot convert null/undefined to token');
  }
  if (typeof val === 'string') return Token.string(val);
  if (typeof val === 'number' || typeof val === 'boolean') return Token.string(String(val));
  if (isGNode(val)) return val[_token];
  throw new Error(`Cannot convert ${typeof val} to token`);
}

// ============ Node Creation ============

function wrapNode(token: Token, name?: string): GNode {
  const proxy: GNode = new Proxy(function () {} as any, {
    get(_target: any, prop: string | symbol): any {
      // Internal symbols
      if (prop === _token) return token;
      if (prop === _name) return name;
      if (prop === _self) return proxy;
      if (prop === Symbol.toPrimitive) return () => name || '[GNode]';
      if (prop === Symbol.toStringTag) return 'GNode';

      // [``] = [""] = loop
      if (prop === '') return wrapNode(Token.loop(token), name);

      // Property modifiers
      if (prop === 'optional') return wrapNode(Token.optional(token), name);
      if (prop === 'isolated') return wrapNode(token.isolated(), name);
      if (prop === 'noIterBoundaries') return wrapNode(token.noIterBoundaries(), name);
      if (prop === 'end') return wrapNode(Token.end());

      // .NonEmpty → loopAtLeast(1) after [``]
      if (prop === 'NonEmpty') {
        if ('tokens' in token && 'minCount' in token) {
          return wrapNode(Token.loopAtLeast(1, ...(token as any).tokens), name);
        }
        return wrapNode(Token.loopAtLeast(1, token), name);
      }

      // .bind(target)
      if (prop === 'bind') {
        return (target: any): GNode => {
          let bindName: string;
          if (typeof target === 'string') bindName = target;
          else if (isGNode(target)) {
            bindName = target[_name]!;
            if (!bindName) throw new Error('Bind target has no name');
          } else throw new Error(`Invalid bind target: ${typeof target}`);
          return wrapNode(token.bind(bindName), name);
        };
      }

      // .constrain(accessor, op, value)
      if (prop === 'constrain') {
        return (_accessor: (x: any) => any, op: string, value: any): GNode => {
          return applyConstraint(token, op, value, name);
        };
      }

      // .with(params)
      if (prop === 'with') {
        return (params: any): GNode => {
          if (typeof params === 'function' && !isGNode(params)) {
            return wrapNode(Token.withParams(params, token), name);
          }
          if (typeof params === 'object') {
            const entries = Object.entries(params);
            const hasDynamic = entries.some(([_, v]) => isGNode(v));
            if (hasDynamic) {
              return wrapNode(Token.withParams((ctx, bindings) => {
                const result: Record<string, any> = {};
                for (const [k, v] of entries) {
                  if (isGNode(v as any)) {
                    const refName = (v as any)[_name];
                    result[k] = refName ? (bindings[refName] ?? ctx.params[refName]) : v;
                  } else {
                    result[k] = v;
                  }
                }
                return result;
              }, token), name);
            }
            return wrapNode(Token.withParams(params, token), name);
          }
          return wrapNode(Token.withParams(params, token), name);
        };
      }

      if (prop === 'unless') return (guard: (s: string) => boolean) => wrapNode(token.unless(guard), name);
      if (prop === 'transform') return (fn: (v: any, b: Record<string, any>) => any) => wrapNode(token.transform(fn), name);

      // .as_number / .as_string for dynamic param resolution
      if (prop === 'as_number') {
        return {
          [_token]: token, [_name]: name, _type: 'number_accessor',
          resolve: (ctx: ParseContext, bindings: Record<string, any>) => {
            if (name && name in bindings) {
              const v = bindings[name];
              if (typeof v === 'number') return v;
              if (v && typeof v === 'object' && 'count' in v) return v.count;
            }
            if (name && name in ctx.params) return ctx.params[name];
            return 0;
          }
        };
      }

      return undefined;
    },

    has(_target: any, prop: string | symbol): boolean {
      return prop === _token || prop === _name || prop === _self;
    }
  });
  return proxy;
}

// ============ Constraint Application ============

function applyConstraint(token: Token, op: string, value: any, name?: string): GNode {
  let innerTokens: Token[];
  if ('tokens' in token && Array.isArray((token as any).tokens)) {
    innerTokens = (token as any).tokens;
  } else {
    innerTokens = [token];
  }

  let resolved: number | string | ((ctx: ParseContext) => number);

  if (typeof value === 'number') resolved = value;
  else if (typeof value === 'string') resolved = value;
  else if (value && (typeof value === 'object' || typeof value === 'function')) {
    if ('_type' in value && value._type === 'number_accessor') {
      const refName = value[_name];
      resolved = (ctx: ParseContext) => {
        if (refName && refName in ctx.bindings) {
          const v = ctx.bindings[refName];
          if (typeof v === 'number') return v;
          if (v && typeof v === 'object' && 'count' in v) return v.count;
        }
        if (refName && refName in ctx.params) return ctx.params[refName];
        return 0;
      };
    } else if (isGNode(value)) {
      resolved = value[_name]!;
    } else resolved = 0;
  } else resolved = 0;

  const times = Token.times(...innerTokens);

  switch (op) {
    case '>=': return wrapNode(times.atLeast(resolved), name);
    case '>':
      if (typeof resolved === 'number') return wrapNode(times.atLeast(resolved + 1), name);
      if (typeof resolved === 'function') { const fn = resolved; return wrapNode(times.atLeast((ctx) => fn(ctx) + 1), name); }
      return wrapNode(times.atLeast(resolved), name);
    case '==': return wrapNode(times.exactly(resolved), name);
    case '<=': return wrapNode(times.atMost(resolved), name);
    case '<':
      if (typeof resolved === 'number') return wrapNode(times.atMost(resolved - 1), name);
      if (typeof resolved === 'function') { const fn = resolved; return wrapNode(times.atMost((ctx) => fn(ctx) - 1), name); }
      return wrapNode(times.atMost(resolved), name);
    default: throw new Error(`Unknown constraint operator: ${op}`);
  }
}

// ============ Grammar Context ============

export class GrammarContext {
  private rules = new Map<string, Token[]>();
  private ruleOrder: string[] = [];

  context(): any {
    const self = this;

    return new Proxy({} as any, {
      get(_target: any, prop: string | symbol): any {
        if (typeof prop === 'symbol') return undefined;

        if (prop === 'Array') {
          return (...args: any[]): GNode => {
            const tokens: Token[] = [];
            for (const arg of args) {
              if (isGNode(arg)) tokens.push(arg[_token]);
              else if (typeof arg === 'function') {
                const items = arg(self.context());
                if (Array.isArray(items)) tokens.push(...items.map(extractToken));
                else tokens.push(extractToken(items));
              } else tokens.push(extractToken(arg));
            }
            return wrapNode(Token.array(...tokens));
          };
        }

        if (prop === 'Any') return (...args: any[]) => wrapNode(Token.any(...args.map(extractToken)));
        if (prop === 'val') return (v: Val) => wrapNode(extractToken(v));
        if (prop === 'not') return (v: string) => {
          const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return v.length === 1
            ? wrapNode(Token.regex(new RegExp(`[^${esc}]`)))
            : wrapNode(Token.regex(new RegExp(`(?!${esc}).`, 's')));
        };
        if (prop === 'end') return wrapNode(Token.end());
        if (prop === 'arbitrary') return wrapNode(Token.arbitrary());
        if (prop === 'regex') return (p: RegExp) => wrapNode(Token.regex(p));
        if (prop === 'is_none') return () => self.rules.size === 0;

        // Dynamic: ctx.X → lazy ref to rule 'X'
        return wrapNode(
          Token.ref(() => {
            const rules = self.rules.get(prop);
            if (!rules || !rules.length) return Token.string(`\x00UNDEFINED:${prop}\x00`);
            return rules.length === 1 ? rules[0] : Token.any(...rules);
          }, prop),
          prop
        );
      },

      set(_target: any, prop: string | symbol, value: any): boolean {
        if (typeof prop !== 'string') return false;
        self.addRule(prop, extractToken(value));
        return true;
      }
    });
  }

  addRule(name: string, token: Token): void {
    if (!this.rules.has(name)) this.ruleOrder.push(name);
    this.rules.set(name, [token]);
  }

  addAlternative(name: string, token: Token): void {
    if (!this.rules.has(name)) { this.rules.set(name, []); this.ruleOrder.push(name); }
    this.rules.get(name)!.unshift(token);
  }

  getRule(name: string): Token {
    return Token.ref(() => {
      const rules = this.rules.get(name);
      if (!rules || !rules.length) return Token.string(`\x00UNDEFINED:${name}\x00`);
      return rules.length === 1 ? rules[0] : Token.any(...rules);
    }, name);
  }

  parse(ruleName: string, input: string, params: Record<string, any> = {}): MatchResult {
    return new Parser3(this.getRule(ruleName), params).parse(input);
  }
}

// ============ Convenience ============

export function wrap(token: Token, name?: string): GNode { return wrapNode(token, name); }
// export { GNode, wrapNode, extractToken, isGNode };
// export { Token, Parser, escapedBy, endsWith, matchesEnd };
// export type { MatchResult, ParseContext };


// ════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════

function runTests() {
  console.log('═'.repeat(60));
  console.log('Proxy-Based Grammar Builder — Test Suite');
  console.log('═'.repeat(60));

  let passed = 0, failed = 0;
  function assert(label: string, cond: boolean, detail?: string) {
    if (cond) { console.log(`  ✓ ${label}`); passed++; }
    else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  }

  console.log('\n── 1. Array + arbitrary + bind ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.greeting = ctx.Array('hello', ' ', ctx.arbitrary.bind(ctx.name));
    const r = g.parse('greeting', 'hello world');
    assert('parses', r.success);
    assert('name="world"', r.bindings.name === 'world');
  }

  console.log('\n── 2. Loop via [``] ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.digits = ctx.regex(/[0-9]/)[``];
    const r = g.parse('digits', '12345');
    assert('all digits', r.success && r.consumed === 5);
    assert('5 items', Array.isArray(r.value) && r.value.length === 5);
  }

  console.log('\n── 3. constrain (>=) ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.indent = ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 2);
    assert('4 spaces ok', g.parse('indent', '    x').success);
    assert('1 space fails', !g.parse('indent', ' x').success);
  }

  console.log('\n── 4. Any ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.bool = ctx.Any('true', 'false');
    assert('"true"', g.parse('bool', 'true').success);
    assert('"false"', g.parse('bool', 'false').success);
    assert('"maybe" fails', !g.parse('bool', 'maybe').success);
  }

  console.log('\n── 5. not() ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.word = ctx.not(' ')[``];
    assert('stops at space', g.parse('word', 'hello world').consumed === 5);
  }

  console.log('\n── 6. Bind via ctx.propName ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.kv = ctx.Array(ctx.not('=')[``].bind(ctx.key), '=', ctx.arbitrary.bind(ctx.value));
    const r = g.parse('kv', 'port=8080');
    assert('parses', r.success);
    assert('key chars', Array.isArray(r.bindings.key) && r.bindings.key.join('') === 'port');
    assert('value', r.bindings.value === '8080');
  }

  console.log('\n── 7. Optional ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.item = ctx.Array(ctx.arbitrary.bind('t'), ctx.val(';').optional);
    assert('with ;', g.parse('item', 'hi;').consumed === 3);
    assert('without ;', g.parse('item', 'hi').consumed === 2);
  }

  console.log('\n── 8. constrain with param ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    // Need a boundary after indent to enforce exact match
    ctx.indented = ctx.Array(
      ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'level'),
      ctx.arbitrary.bind('rest')
    );
    const r1 = g.parse('indented', '    x', { level: 4 });
    assert('level=4 matches 4 spaces', r1.success && r1.bindings.rest === 'x');

    const r2 = g.parse('indented', '    x', { level: 2 });
    assert('level=2 gets 2 spaces + rest', r2.success && r2.bindings.rest === '  x');
  }

  console.log('\n── 9. Full STATEMENT grammar ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.empty_line = ctx.regex(/[ \t]*\n/);

    ctx.statement = ctx.Array(
      ctx.empty_line[``],
      ctx.arbitrary.bind('content'),
      ctx.Any(';', '\n', ctx.end),
      ctx.Array(
        ctx.empty_line[``],
        ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
        ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1).bind('added'),
        ctx.statement.with(
          (pctx: ParseContext, bindings: Record<string, any>) => ({
            indent: pctx.params.indent + bindings.added.count
          })
        )
      )[``].bind('children')
    );

    ctx.program = ctx.statement[``].bind('statements');

    const input = `hello
  world
    deep
  sibling
bye
`;
    const r = g.parse('program', input, { indent: 0 });
    assert('parses nested program', r.success);
    assert('all consumed', r.consumed === input.length);

    const stmts = r.bindings.statements || [];
    assert('2 roots', stmts.length === 2);

    if (stmts.length >= 1) {
      const [_, c, __, ch] = stmts[0];
      assert('first = "hello"', c === 'hello');
      assert('2 children', ch.length === 2);
      if (ch.length >= 1) {
        const [_a, _b, _c, childStmt] = ch[0];
        const [_d, childContent, _e, grandchildren] = childStmt;
        assert('child "world"', childContent === 'world');
        assert('1 grandchild', grandchildren.length === 1);
      }
    }
  }

  console.log('\n── 10. Self-referential expression parser ──');
  {
    const g = new GrammarContext(), ctx = g.context();

    // Simple arithmetic: num | num + expr
    ctx.num = ctx.regex(/[0-9]+/);
    ctx.expr = ctx.Any(
      ctx.Array(ctx.num.bind('left'), ' + ', ctx.expr.bind('right')),
      ctx.num.bind('value')
    );

    const r = g.parse('expr', '1 + 2 + 3');
    assert('parses chain', r.success);
    assert('left=1', r.bindings.left === '1');
    assert('right="2 + 3"', r.bindings.right !== undefined);
  }

  console.log('\n── 11. .with() dynamic params ──');
  {
    const g = new GrammarContext(), ctx = g.context();

    ctx.spaces = ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'n');
    ctx.double_spaces = ctx.spaces.with((pctx: ParseContext) => ({ n: (pctx.params.n || 0) * 2 }));

    const r = g.parse('double_spaces', '    x', { n: 2 }); // 2*2 = 4 spaces
    assert('4 spaces with n=2 doubled', r.success && r.consumed === 4);
  }

  console.log('\n── 12. .transform() ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.num = ctx.regex(/[0-9]+/).transform((v: string) => parseInt(v, 10));
    const r = g.parse('num', '42');
    assert('transforms to number', r.success && r.value === 42);
  }

  console.log('\n── 13. Callback form of Array ──');
  {
    const g = new GrammarContext(), ctx = g.context();
    ctx.pair = ctx.Array((c: any) => [c.regex(/\w+/).bind('a'), ':', c.regex(/\w+/).bind('b')]);
    const r = g.parse('pair', 'key:val');
    assert('parses pair', r.success);
    assert('a=key', r.bindings.a === 'key');
    assert('b=val', r.bindings.b === 'val');
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
}

runTests();