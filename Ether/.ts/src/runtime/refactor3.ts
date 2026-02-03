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
  /** Concrete tokens that should stop arbitrary/loop matching */
  boundaries: Token[];
  /** Boundaries only for current loop iteration (cleared on ref) */
  iterationBoundaries?: Token[];
  /** Content consumed so far in current arbitrary/loop (for guard conditions) */
  preceding?: string;
  /** Parameters passed down for parameterized parsing (e.g., indentation level) */
  params: Record<string, any>;
  /** Bindings accumulated so far in current array (for withParams access) */
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

  abstract match(ctx: ParseContext): MatchResult;
  abstract canStartAt(ctx: ParseContext): boolean;

  /**
   * Returns concrete tokens that MUST start this pattern (for determining if something can match empty).
   * Used by ArrayToken to know whether to look past this token for boundaries.
   */
  abstract getFirstConcreteTokens(): Token[];

  /**
   * Returns ALL concrete tokens that COULD start this pattern (for boundary detection).
   * Default implementation returns same as getFirstConcreteTokens().
   * Optional overrides to return inner tokens even though it can match empty.
   */
  getAllPossibleStartTokens(): Token[] {
    return this.getFirstConcreteTokens();
  }

  /**
   * Returns true if this token can match zero characters.
   * Used for boundary calculation in loops - if this token can match empty,
   * we need to look past it to find boundaries.
   */
  canMatchEmpty(): boolean {
    return false;  // Default: most tokens require some input
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

// ============ TimesBuilder ============

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

// ============ Guard Helper Functions ============

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

// ============ Token Implementations ============

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
    // Isolated clears all boundaries including iteration boundaries
    return this.wrapResult(this.inner.match({ ...ctx, boundaries: [], iterationBoundaries: [] }));
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
    // Physical end
    if (ctx.index >= ctx.input.length) return true;
    // Logical end - a boundary can start here
    for (const boundary of ctx.boundaries) {
      const testCtx: ParseContext = { ...ctx, boundaries: [], preceding: '' };
      if (boundary.canStartAt(testCtx)) return true;
    }
    return false;
  }
  match(ctx: ParseContext): MatchResult {
    // Physical end
    if (ctx.index >= ctx.input.length) {
      return this.wrapResult({ success: true, consumed: 0, value: '', bindings: {} });
    }
    // Logical end - a boundary can start here
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
  canStartAt(ctx: ParseContext): boolean {
    const allBoundaries = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];
    if (allBoundaries.length === 0) return true;
    const testCtx: ParseContext = { ...ctx, boundaries: [], iterationBoundaries: [], preceding: '' };
    for (const boundary of allBoundaries) {
      if (boundary.canStartAt(testCtx)) return false;
    }
    return true;
  }
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
    // Collect from first token, but if it returns [] (can match empty),
    // also collect from subsequent tokens
    const result: Token[] = [];
    for (const token of this.tokens) {
      const firsts = token.getFirstConcreteTokens();
      result.push(...firsts);
      if (firsts.length > 0) break;  // Stop at first non-empty (required token)
    }
    return result;
  }
  getAllPossibleStartTokens(): Token[] {
    // Collect ALL possible start tokens from leading elements that can match empty
    const result: Token[] = [];
    for (const token of this.tokens) {
      result.push(...token.getAllPossibleStartTokens());
      if (token.getFirstConcreteTokens().length > 0) break;  // Stop at required token
    }
    return result;
  }
  canStartAt(ctx: ParseContext): boolean {
    if (this.tokens.length === 0) return true;
    // Check if first non-optional token can start
    for (const token of this.tokens) {
      const firsts = token.getFirstConcreteTokens();
      if (firsts.length > 0) {
        return token.canStartAt(ctx);
      }
      // Token can match empty, check if it can start here or continue
      if (token.canStartAt(ctx)) return true;
    }
    return true;  // All tokens can match empty
  }
  match(ctx: ParseContext): MatchResult {
    let totalConsumed = 0;
    const values: any[] = [];
    let accumulatedBindings: Record<string, any> = { ...ctx.bindings };
    let currentIndex = ctx.index;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const remainingTokens = this.tokens.slice(i + 1);

      // Only add boundaries from REQUIRED remaining tokens (those with non-empty getFirstConcreteTokens)
      // Skip optional elements - they shouldn't create boundaries for preceding elements
      const remainingBoundaries: Token[] = [];
      for (const rt of remainingTokens) {
        const firsts = rt.getFirstConcreteTokens();
        if (firsts.length > 0) {
          // This is a required element - add its possible starts as boundaries and stop
          remainingBoundaries.push(...rt.getAllPossibleStartTokens());
          break;
        }
        // This is an optional element (can match empty) - skip it, look for next required
      }
      const boundaries = [...remainingBoundaries, ...ctx.boundaries];

      const result = token.match({
        input: ctx.input,
        index: currentIndex,
        boundaries,
        iterationBoundaries: ctx.iterationBoundaries,  // Pass through
        params: ctx.params,
        bindings: accumulatedBindings,
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
    if (this.minCount === 0) return [];  // Can match empty, so don't block
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
    if (this.minCount === 0) return true;  // Can match empty
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

    // Get inner's possible start tokens - these indicate start of NEXT iteration
    const iterationStarts = innerToken.getAllPossibleStartTokens();

    while (true) {
      const testCtx: ParseContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };

      // Pass iteration start tokens as iterationBoundaries (cleared by refs)
      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        iterationBoundaries: iterationStarts,  // For next-iteration detection
        params: ctx.params,
        bindings: ctx.bindings,
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
    return this.wrapResult(this.inner.match({ ...ctx, params: mergedParams }));  // ctx includes iterationBoundaries
  }
}

class OptionalToken extends Token {
  constructor(public token: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return []; }  // Can match empty, so don't block boundaries
  getAllPossibleStartTokens(): Token[] { return this.token.getAllPossibleStartTokens(); }  // But CAN start with these
  canStartAt(_ctx: ParseContext): boolean { return true; }  // Can always match (empty)
  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);  // ctx includes iterationBoundaries
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
    // Clear iterationBoundaries when crossing ref boundary - they shouldn't propagate into nested structures
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
      const boundaries = [...otherConcreteTokens, ...ctx.boundaries];
      const result = token.match({ ...ctx, boundaries });  // ctx includes iterationBoundaries
      if (result.success) return this.wrapResult(result);
    }
    return { success: false, consumed: 0, value: null, bindings: {} };
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

// ============ Self-Hosting Grammar ============

interface TreeNode {
  content: string;
  children: TreeNode[];
  type: 'grammar_def' | 'statement';
  bindings?: Record<string, any>;
  patternText?: string;
  ruleName?: string;
}

interface ParsedStatement {
  type: 'grammar_def' | 'statement';
  raw: string;
  patternText?: string;
  ruleName?: string;
  bindings?: Record<string, any>;
  value?: any;
  children?: TreeNode[];
}

interface DynamicParseResult {
  statements: ParsedStatement[];
  grammar: SelfHostingGrammar;
  tree?: TreeNode[];
}

class SelfHostingGrammar {
  private rules: Map<string, Token[]> = new Map();
  private ruleOrder: string[] = [];
  private primitiveRules: Set<string> = new Set();
  patternGrammar: Token;
  programGrammar: Token;

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
    this.programGrammar = this.buildProgramGrammar();
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

  /**
   * Build the indentation-aware PROGRAM grammar.
   * Returns a tree of statements with nested children.
   */
  private buildProgramGrammar(): Token {
    // Empty line = optional whitespace followed by newline
    const EMPTY_LINE = Token.regex(/[ \t]*\n/);

    const STATEMENT: Token = Token.array(
      Token.loop(EMPTY_LINE),  // Skip any leading empty lines
      Token.arbitrary().bind('content'),
      Token.any(Token.string(';'), Token.string('\n'), Token.end()),
      // Children: each starts with parent_indent + extra_indent
      Token.loop(
        Token.array(
          Token.loop(EMPTY_LINE),  // Skip empty lines between children
          // Match parent's indent (params.indent spaces)
          Token.times(Token.string(' ')).exactly('indent'),
          // Match additional indent (at least 1 space) - this determines child's level
          Token.times(Token.string(' ')).atLeast(1).bind('added'),
          // Recurse with new indent = parent + added
          Token.withParams(
            (ctx, bindings) => ({ indent: ctx.params.indent + bindings.added.count }),
            Token.ref(() => STATEMENT)
          )
        )
      ).bind('children')
    );

    // PROGRAM = loop of statements at root level (indent=0)
    return Token.loop(Token.ref(() => STATEMENT)).bind('statements');
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

  /**
   * Check if a line is a grammar definition.
   * Grammar definitions contain {binding} syntax and end with =>
   */
  private extractGrammarDef(content: string): { patternText: string; ruleName: string } | null {
    const trimmed = content.trim();

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
   * Convert raw parse value to a tree node structure.
   * STATEMENT value structure: [emptyLines, content, term, children]
   * Child structure: [emptyLines, indent, added, statement]
   */
  private toTreeNode(value: any): TreeNode {
    const [_emptyLines, content, _term, children] = value;
    return {
      content,
      children: (children || []).map((c: any) => {
        // Each child is: [emptyLines, parentIndent, addedIndent, statementValue]
        const [_childEmptyLines, _parentIndent, _addedIndent, childStatement] = c;
        return this.toTreeNode(childStatement);
      }),
      // These get filled in during evolution
      type: 'statement',
      bindings: undefined,
      patternText: undefined,
      ruleName: undefined,
    };
  }

  /**
   * Collect all nodes in the tree in pre-order (parent before children).
   */
  private collectNodes(node: TreeNode, acc: TreeNode[] = []): TreeNode[] {
    acc.push(node);
    for (const child of node.children) {
      this.collectNodes(child, acc);
    }
    return acc;
  }

  /**
   * Parse input with dynamic grammar evolution.
   *
   * 1. Parse with PROGRAM grammar to get tree structure
   * 2. Walk tree in order, for each node:
   *    - If grammar definition: compile and reparse all previous non-def nodes
   *    - If regular: parse content with current grammar
   * 3. Recurse into children with same logic
   */
  parseWithEvolution(input: string): DynamicParseResult {
    // Step 1: Parse with PROGRAM grammar
    const parser = new Parser(this.programGrammar, { indent: 0 });
    const parseResult = parser.parse(input);

    if (!parseResult.success) {
      return { statements: [], grammar: this };
    }

    // Step 2: Convert to tree nodes
    const rawStatements = parseResult.bindings.statements || [];
    const rootNodes: TreeNode[] = rawStatements.map((s: any) => this.toTreeNode(s));

    // Step 3: Collect ALL nodes in pre-order for processing
    const allNodes: TreeNode[] = [];
    for (const root of rootNodes) {
      this.collectNodes(root, allNodes);
    }

    // Step 4: Process nodes in order with incremental grammar evolution
    const isGrammarDef: boolean[] = [];

    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      const def = this.extractGrammarDef(node.content);

      if (def) {
        // This is a grammar definition
        isGrammarDef.push(true);
        node.type = 'grammar_def';
        node.patternText = def.patternText;
        node.ruleName = def.ruleName;

        // Compile and add to grammar
        try {
          const compiledToken = this.compilePatternContent(def.patternText);
          if (def.ruleName !== 'Expression') {
            this.addRule(def.ruleName, compiledToken);
          }
          this.addRule('Expression', compiledToken);

          // REPARSE all previous non-definition nodes with evolved grammar
          const expr = this.getRule('Expression');
          for (let j = 0; j < i; j++) {
            if (!isGrammarDef[j]) {
              const content = allNodes[j].content;
              const exprParser = new Parser(expr);
              const result = exprParser.parse(content);
              allNodes[j].bindings = result.success ? result.bindings : undefined;
            }
          }
        } catch (e) {
          console.error(`Failed to compile pattern: ${def.patternText}`, e);
        }
      } else {
        // Regular statement - parse with current grammar
        isGrammarDef.push(false);
        node.type = 'statement';
        const expr = this.getRule('Expression');
        const exprParser = new Parser(expr);
        const result = exprParser.parse(node.content);
        node.bindings = result.success ? result.bindings : undefined;
      }
    }

    // Step 5: Flatten to statements for compatibility (but tree is also available)
    const statements: ParsedStatement[] = allNodes.map(node => ({
      type: node.type,
      raw: node.content + '\n',
      patternText: node.patternText,
      ruleName: node.ruleName,
      bindings: node.bindings,
      children: node.children,
    }));

    return { statements, grammar: this, tree: rootNodes };
  }
}

// ============ TESTS ============

// Helper to print tree
export function printTree(nodes: TreeNode[], indent: string = ''): void {
  for (const node of nodes) {
    const typeTag = node.type === 'grammar_def' ? '[GRAMMAR]' : '[STMT]';
    console.log(`${indent}${typeTag} "${node.content}"`);
    if (node.bindings && Object.keys(node.bindings).length > 0) {
      console.log(`${indent}  bindings: ${JSON.stringify(node.bindings)}`);
    }
    if (node.children.length > 0) {
      printTree(node.children, indent + '  ');
    }
  }
}

console.log('='.repeat(60));
console.log('Dynamic Grammar Evolution Tests (Tree-based)');
console.log('='.repeat(60) + '\n');

console.log('Test 1: Flat statements with grammar');
console.log('-'.repeat(40));

const input1 = `/path/earlier/in/file
"/", {first: *}, ("/", {rest: *})[] =>
/another/path/here
`;

console.log('Input:');
console.log(input1);

const grammar1 = new SelfHostingGrammar();
const result1 = grammar1.parseWithEvolution(input1);

console.log('Tree:');
printTree(result1.tree || []);

console.log('\n' + '='.repeat(60));
console.log('Test 2: Nested structure with indentation');
console.log('-'.repeat(40));

const input2 = `root statement
  child one
  child two
    grandchild
  child three
another root
`;

console.log('Input:');
console.log(input2);

const grammar2 = new SelfHostingGrammar();
const result2 = grammar2.parseWithEvolution(input2);

console.log('Tree:');
printTree(result2.tree || []);

console.log('\n' + '='.repeat(60));
console.log('Test 2b: Empty lines between statements');
console.log('-'.repeat(40));

const input2b = `
root one
  child a

  child b

root two

root three
  nested
    deep

`;

console.log('Input:');
console.log(JSON.stringify(input2b));

const grammar2b = new SelfHostingGrammar();
const result2b = grammar2b.parseWithEvolution(input2b);

console.log('\nTree:');
printTree(result2b.tree || []);

console.log('\n' + '='.repeat(60));
console.log('Test 3: Grammar in nested context');
console.log('-'.repeat(40));

const input3 = `module Math
  {a: *} + {b: *} => Add
  1 + 2
  3 + 4
module Text
  hello world
`;

console.log('Input:');
console.log(input3);
console.log('KEY: Grammar defined inside "module Math" affects siblings!');

const grammar3 = new SelfHostingGrammar();
const result3 = grammar3.parseWithEvolution(input3);

console.log('\nTree:');
printTree(result3.tree || []);

console.log('\n' + '='.repeat(60));
console.log('Test 4: Multiple grammars at different levels');
console.log('-'.repeat(40));

const input4 = `[a, b, c]
"[", {first: *}, (", ", {rest: *})[], "]" => List
config
  name = value
  {key: *} = {val: *} => Assign
  port = 8080
[x, y]
`;

console.log('Input:');
console.log(input4);

const grammar4 = new SelfHostingGrammar();
const result4 = grammar4.parseWithEvolution(input4);

console.log('\nTree:');
printTree(result4.tree || []);

console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`
Tree-based grammar evolution:
1. Parse with PROGRAM grammar (indentation-aware)
2. Collect all nodes in pre-order (flattened)
3. Process each node:
   - Grammar def? Compile and reparse ALL previous nodes
   - Regular? Parse with current grammar
4. Result includes both flat statements AND tree structure

Tree structure preserved with children!
`);


export { Token, Parser, escapedBy, endsWith, matchesEnd, SelfHostingGrammar };
export type { MatchResult, ParseContext, ParsedStatement, DynamicParseResult, TreeNode };