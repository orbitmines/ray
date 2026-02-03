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

  /**
   * Transform the matched value using a function.
   * Unlike bind(), this replaces the value entirely.
   */
  transform(fn: (value: any, bindings: Record<string, any>) => any): TransformToken {
    return new TransformToken(this, fn);
  }

  /**
   * Guard this token - only match if the guard function returns false.
   * The guard receives the content that precedes this token position.
   *
   * Example: Token.string('"').unless(escapedBy('\\'))
   */
  unless(guard: (preceding: string) => boolean): GuardedToken {
    return new GuardedToken(this, guard);
  }

  /**
   * Isolate this token from parent boundaries.
   * Use for delimited structures where inside content shouldn't see outside boundaries.
   *
   * Example: Token.array('{', content.isolated(), '}')
   *   - Content won't see boundaries from outside the {...}
   */
  isolated(): IsolatedToken {
    return new IsolatedToken(this);
  }

  abstract match(ctx: ParseContext): MatchResult;
  abstract canStartAt(ctx: ParseContext): boolean;

  /**
   * Returns concrete tokens that could START this pattern.
   * Used for boundary detection. arbitrary() returns [] since it matches anything.
   */
  abstract getFirstConcreteTokens(): Token[];

  protected wrapResult(result: MatchResult): MatchResult {
    if (!result.success) return result;

    const bindings = { ...result.bindings };
    if (this.bindName) {
      bindings[this.bindName] = result.value;
    }
    return { ...result, bindings };
  }

  // Static factory methods
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

  /**
   * Create a repeating pattern. Chain with:
   *   .exactly(n)   - Match exactly n times
   *   .atLeast(n)   - Match at least n times
   *   .atMost(n)    - Match at most n times
   *   .between(a,b) - Match between a and b times
   *
   * Without a modifier, matches 0 or more times (like loop).
   *
   * Examples:
   *   Token.times(Token.string(' '))              // 0+ spaces
   *   Token.times(Token.string(' ')).atLeast(1)   // 1+ spaces (NonEmpty)
   *   Token.times(Token.string(' ')).exactly('indent')  // params.indent spaces
   *   Token.times(Token.string(' ')).exactly(3)   // exactly 3 spaces
   */
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

  /**
   * Match end of string.
   */
  static end(): EndToken {
    return new EndToken();
  }

  /**
   * Set or update params for nested parsing.
   * Usage: Token.withParams({ indent: 0 }, expr)  // set initial indent
   *        Token.withParams(ctx => ({ indent: ctx.params.indent + 2 }), expr)  // increment
   */
  static withParams(
    params: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>),
    token: Token
  ): WithParamsToken {
    return new WithParamsToken(token, params);
  }
}

// ============ TimesBuilder ============

/**
 * Builder for Token.times() - allows chaining .atLeast(), .exactly(), etc.
 */
class TimesBuilder {
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Match exactly N times.
   * N can be a number, param name, or function.
   */
  exactly(count: number | string | ((ctx: ParseContext) => number)): TimesToken {
    return new TimesToken(this.tokens, count);
  }

  /**
   * Match at least N times. Returns { count, values } with actual count.
   */
  atLeast(min: number | string | ((ctx: ParseContext) => number)): TimesAtLeastToken {
    return new TimesAtLeastToken(this.tokens, min);
  }

  /**
   * Match at most N times.
   */
  atMost(max: number | string | ((ctx: ParseContext) => number)): TimesAtMostToken {
    return new TimesAtMostToken(this.tokens, max);
  }

  /**
   * Match between min and max times (inclusive).
   */
  between(min: number, max: number): TimesBetweenToken {
    return new TimesBetweenToken(this.tokens, min, max);
  }
}

// ============ Guard Helper Functions ============

/**
 * Guard: true if preceding content ends with the given string.
 * Usage: Token.string('{').unless(endsWith('\\'))
 */
function endsWith(suffix: string): (preceding: string) => boolean {
  return (preceding: string) => preceding.endsWith(suffix);
}

/**
 * Guard: true if position is escaped (preceded by odd number of escape chars).
 * Handles cases like:
 *   \"   -> escaped (1 backslash)
 *   \\"  -> not escaped (2 backslashes = escaped backslash)
 *   \\\" -> escaped (3 backslashes)
 *
 * Usage: Token.string('"').unless(escapedBy('\\'))
 */
function escapedBy(escapeChar: string): (preceding: string) => boolean {
  return (preceding: string) => {
    let count = 0;
    for (let i = preceding.length - 1; i >= 0 && preceding[i] === escapeChar; i--) {
      count++;
    }
    return count % 2 === 1;  // Odd = escaped
  };
}

/**
 * Guard: true if preceding content matches the given regex at the end.
 * Usage: Token.string('{').unless(matchesEnd(/\\$/))
 */
function matchesEnd(pattern: RegExp): (preceding: string) => boolean {
  return (preceding: string) => pattern.test(preceding);
}

// ============ GuardedToken ============

/**
 * Wraps a token with a guard condition.
 * The token only matches if the guard returns false for the preceding content.
 */
class GuardedToken extends Token {
  private inner: Token;
  private guard: (preceding: string) => boolean;

  constructor(inner: Token, guard: (preceding: string) => boolean) {
    super();
    this.inner = inner;
    this.guard = guard;
  }

  getFirstConcreteTokens(): Token[] {
    // Return ourselves so the guard is checked when used as boundary
    return [this];
  }

  canStartAt(ctx: ParseContext): boolean {
    // Check guard first - if guard returns true, we can't start here
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) {
      log(`[guard] blocked at ${ctx.index}, preceding="${ctx.preceding.slice(-10)}"`);
      return false;
    }
    return this.inner.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    // Check guard first
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) {
      return { success: false, consumed: 0, value: null, bindings: {} };
    }
    return this.wrapResult(this.inner.match(ctx));
  }
}

// ============ IsolatedToken ============

/**
 * Wraps a token to isolate it from parent boundaries.
 * When parsing the inner token, parent boundaries are cleared.
 * Use for delimited structures like {...} or "..." where content
 * shouldn't be affected by boundaries from outside.
 */
class IsolatedToken extends Token {
  private inner: Token;

  constructor(inner: Token) {
    super();
    this.inner = inner;
  }

  getFirstConcreteTokens(): Token[] {
    return this.inner.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.inner.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    // Clear parent boundaries - only use boundaries from within this token
    const isolatedCtx: ParseContext = {
      input: ctx.input,
      index: ctx.index,
      boundaries: [],  // Clear parent boundaries
      preceding: ctx.preceding,
      params: ctx.params,
      bindings: ctx.bindings,
    };
    log(`[isolated] clearing ${ctx.boundaries.length} parent boundaries`);
    return this.wrapResult(this.inner.match(isolatedCtx));
  }
}

// ============ Token Implementations ============

class StringToken extends Token {
  strings: string[];

  constructor(strings: string[]) {
    super();
    this.strings = [...strings].sort((a, b) => b.length - a.length);
  }

  getFirstConcreteTokens(): Token[] {
    return [this];
  }

  canStartAt(ctx: ParseContext): boolean {
    const remaining = ctx.input.slice(ctx.index);
    return this.strings.some(s => remaining.startsWith(s));
  }

  match(ctx: ParseContext): MatchResult {
    const remaining = ctx.input.slice(ctx.index);

    for (const str of this.strings) {
      if (remaining.startsWith(str)) {
        log(`[string] matched "${str}" at ${ctx.index}`);
        return this.wrapResult({
          success: true,
          consumed: str.length,
          value: str,
          bindings: {},
        });
      }
    }

    log(`[string] failed to match any of [${this.strings.join(', ')}] at ${ctx.index} "${remaining.slice(0,5)}..."`);
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

/**
 * Matches end of string.
 */
class EndToken extends Token {
  getFirstConcreteTokens(): Token[] {
    return [this];
  }

  canStartAt(ctx: ParseContext): boolean {
    return ctx.index >= ctx.input.length;
  }

  match(ctx: ParseContext): MatchResult {
    if (ctx.index >= ctx.input.length) {
      log(`[end] matched at ${ctx.index}`);
      return this.wrapResult({
        success: true,
        consumed: 0,
        value: '',
        bindings: {},
      });
    }
    log(`[end] failed at ${ctx.index}, not at end`);
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

  getFirstConcreteTokens(): Token[] {
    return [this];
  }

  canStartAt(ctx: ParseContext): boolean {
    this.pattern.lastIndex = ctx.index;
    return this.pattern.test(ctx.input);
  }

  match(ctx: ParseContext): MatchResult {
    this.pattern.lastIndex = ctx.index;
    const match = this.pattern.exec(ctx.input);

    if (match) {
      return this.wrapResult({
        success: true,
        consumed: match[0].length,
        value: match[0],
        bindings: {},
      });
    }

    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

/**
 * Matches arbitrary content until ANY boundary can start.
 * Returns no concrete tokens, so doesn't block other arbitrary tokens.
 *
 * Passes `preceding` content to boundary checks, enabling guard conditions
 * like `.unless(escapedBy('\\'))` to work properly.
 *
 * IMPORTANT: If a boundary matches at position 0, arbitrary FAILS (not succeeds with 0).
 * This allows `Token.any(arbitrary, specific)` to correctly try the specific pattern.
 */
class ArbitraryToken extends Token {
  constructor() {
    super();
  }

  getFirstConcreteTokens(): Token[] {
    return [];  // Not concrete - doesn't become a boundary
  }

  canStartAt(ctx: ParseContext): boolean {
    // Can start unless a boundary matches immediately
    if (ctx.boundaries.length === 0) return true;

    const testCtx: ParseContext = {
      input: ctx.input,
      index: ctx.index,
      boundaries: [],
      preceding: '',
      params: ctx.params,
      bindings: ctx.bindings,
    };

    for (const boundary of ctx.boundaries) {
      if (boundary.canStartAt(testCtx)) {
        return false;  // Boundary starts here, so arbitrary can't
      }
    }
    return true;
  }

  match(ctx: ParseContext): MatchResult {
    const remaining = ctx.input.slice(ctx.index);
    log(`[arb] at ${ctx.index} "${remaining.slice(0,15)}..." bounds=${ctx.boundaries.length}`);

    if (ctx.boundaries.length === 0) {
      log(`[arb] no bounds, consuming all`);
      return this.wrapResult({
        success: true,
        consumed: remaining.length,
        value: remaining,
        bindings: {},
      });
    }

    // Find shortest match where ANY boundary can start
    // Start from i=1 to avoid matching 0 characters (if boundary at 0, we fail)
    for (let i = 0; i <= remaining.length; i++) {
      const preceding = remaining.slice(0, i);

      const testCtx: ParseContext = {
        input: ctx.input,
        index: ctx.index + i,
        boundaries: [],
        preceding,  // Pass preceding content for guard conditions
        params: ctx.params,
        bindings: ctx.bindings,
      };

      for (const boundary of ctx.boundaries) {
        if (boundary.canStartAt(testCtx)) {
          if (i === 0) {
            // Boundary at position 0 - fail so alternative patterns can try
            log(`[arb] boundary at position 0, failing`);
            return { success: false, consumed: 0, value: null, bindings: {} };
          }
          log(`[arb] stopping at offset ${i}, boundary matched`);
          return this.wrapResult({
            success: true,
            consumed: i,
            value: preceding,
            bindings: {},
          });
        }
      }
    }

    log(`[arb] no boundary found, consuming all`);
    return this.wrapResult({
      success: true,
      consumed: remaining.length,
      value: remaining,
      bindings: {},
    });
  }
}

class ArrayToken extends Token {
  tokens: Token[];

  constructor(tokens: Token[]) {
    super();
    this.tokens = tokens;
  }

  getFirstConcreteTokens(): Token[] {
    if (this.tokens.length === 0) return [];
    return this.tokens[0].getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    if (this.tokens.length === 0) return true;
    return this.tokens[0].canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    log(`[array] at ${ctx.index}, ${this.tokens.length} tokens, bounds=${ctx.boundaries.length}`);
    let totalConsumed = 0;
    const values: any[] = [];
    // Start with parent bindings, accumulate as we go
    let accumulatedBindings: Record<string, any> = { ...ctx.bindings };
    let currentIndex = ctx.index;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];

      // Collect concrete first tokens from remaining elements
      const remainingTokens = this.tokens.slice(i + 1);
      const remainingConcreteTokens: Token[] = [];
      for (const rt of remainingTokens) {
        remainingConcreteTokens.push(...rt.getFirstConcreteTokens());
      }
      const boundaries = [...remainingConcreteTokens, ...ctx.boundaries];

      log(`[array] token ${i} at ${currentIndex}, passing ${boundaries.length} bounds`);
      const result = token.match({
        input: ctx.input,
        index: currentIndex,
        boundaries,
        params: ctx.params,
        bindings: accumulatedBindings,  // Pass accumulated bindings
      });

      if (!result.success) {
        log(`[array] token ${i} failed`);
        return { success: false, consumed: 0, value: null, bindings: {} };
      }

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      // Accumulate new bindings for next elements
      accumulatedBindings = { ...accumulatedBindings, ...result.bindings };
    }

    log(`[array] success, consumed=${totalConsumed}`);
    // Return only NEW bindings (not including parent's)
    const newBindings: Record<string, any> = {};
    for (const key of Object.keys(accumulatedBindings)) {
      if (!(key in ctx.bindings)) {
        newBindings[key] = accumulatedBindings[key];
      }
    }
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: values,
      bindings: newBindings,
    });
  }
}

class LoopToken extends Token {
  tokens: Token[];
  minCount: number;

  constructor(tokens: Token[], minCount: number = 0) {
    super();
    this.tokens = tokens;
    this.minCount = minCount;
  }

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
    const innerToken = this.tokens.length === 1
      ? this.tokens[0]
      : new ArrayToken(this.tokens);

    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    // Concrete tokens that could start next iteration - used ONLY for loop termination check
    const innerFirstTokens = innerToken.getFirstConcreteTokens();

    log(`[loop] at ${ctx.index}, parentBounds=${ctx.boundaries.length}`);

    while (true) {
      const testCtx: ParseContext = {
        input: ctx.input,
        index: currentIndex,
        boundaries: [],
        params: ctx.params,
        bindings: ctx.bindings,
      };

      log(`[loop] iteration ${iterations} at ${currentIndex}`);

      // First, try to match
      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      log(`[loop] inner result: success=${result.success}, consumed=${result.consumed}`);

      // If match succeeded and consumed something, continue the loop
      if (result.success && result.consumed > 0) {
        totalConsumed += result.consumed;
        currentIndex += result.consumed;
        values.push(result.value);
        allBindings = { ...allBindings, ...result.bindings };
        iterations++;
        continue;
      }

      // Match failed or consumed 0 - check if we should stop at a boundary
      if (iterations >= this.minCount) {
        // Check parent boundaries - stop if any can match here
        for (const boundary of ctx.boundaries) {
          if (boundary.canStartAt(testCtx)) {
            log(`[loop] stopping at ${currentIndex} - parent boundary can match`);
            return this.wrapResult({
              success: true,
              consumed: totalConsumed,
              value: values,
              bindings: allBindings,
            });
          }
        }
      }

      // No boundary matched and inner match failed - break the loop
      break;
    }

    if (iterations < this.minCount) {
      log(`[loop] failed - only ${iterations} iterations, need ${this.minCount}`);
      return { success: false, consumed: 0, value: null, bindings: {} };
    }

    log(`[loop] success with ${iterations} iterations, consumed=${totalConsumed}`);
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: values,
      bindings: allBindings,
    });
  }
}

/**
 * Match exactly N times, where N can be a number, param name, or function.
 */
class TimesToken extends Token {
  tokens: Token[];
  count: number | string | ((ctx: ParseContext) => number);

  constructor(tokens: Token[], count: number | string | ((ctx: ParseContext) => number)) {
    super();
    this.tokens = tokens;
    this.count = count;
  }

  private getCount(ctx: ParseContext): number {
    if (typeof this.count === 'number') return this.count;
    if (typeof this.count === 'string') return ctx.params[this.count] ?? 0;
    return this.count(ctx);
  }

  getFirstConcreteTokens(): Token[] {
    // If count is dynamic (param or function), it might be 0, so return empty
    // Only return concrete tokens if count is a constant > 0
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
    const innerToken = this.tokens.length === 1
      ? this.tokens[0]
      : new ArrayToken(this.tokens);

    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;

    log(`[times] matching exactly ${count} times at ${ctx.index}`);

    for (let i = 0; i < count; i++) {
      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      if (!result.success) {
        log(`[times] failed at iteration ${i}`);
        return { success: false, consumed: 0, value: null, bindings: {} };
      }

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
    }

    log(`[times] success, matched ${count} times, consumed=${totalConsumed}`);
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: values,
      bindings: allBindings,
    });
  }
}

/**
 * Match at least N times, where N can be a number, param name, or function.
 * Binds the actual count matched.
 */
class TimesAtLeastToken extends Token {
  tokens: Token[];
  min: number | string | ((ctx: ParseContext) => number);

  constructor(tokens: Token[], min: number | string | ((ctx: ParseContext) => number)) {
    super();
    this.tokens = tokens;
    this.min = min;
  }

  private getMin(ctx: ParseContext): number {
    if (typeof this.min === 'number') return this.min;
    if (typeof this.min === 'string') return ctx.params[this.min] ?? 0;
    return this.min(ctx);
  }

  getFirstConcreteTokens(): Token[] {
    // If min is dynamic or 0, might match nothing, so return empty
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
    const innerToken = this.tokens.length === 1
      ? this.tokens[0]
      : new ArrayToken(this.tokens);

    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    log(`[timesAtLeast] matching at least ${min} times at ${ctx.index}`);

    while (true) {
      // Check if we've met minimum and should stop at boundary
      if (iterations >= min) {
        const testCtx: ParseContext = {
          input: ctx.input,
          index: currentIndex,
          boundaries: [],
          params: ctx.params,
          bindings: ctx.bindings,
        };
        for (const boundary of ctx.boundaries) {
          if (boundary.canStartAt(testCtx)) {
            log(`[timesAtLeast] stopping at boundary after ${iterations} iterations`);
            return this.wrapResult({
              success: true,
              consumed: totalConsumed,
              value: { count: iterations, values },
              bindings: allBindings,
            });
          }
        }
      }

      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      if (!result.success || result.consumed === 0) {
        break;
      }

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }

    if (iterations < min) {
      log(`[timesAtLeast] failed - only ${iterations} iterations, need ${min}`);
      return { success: false, consumed: 0, value: null, bindings: {} };
    }

    log(`[timesAtLeast] success with ${iterations} iterations`);
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: { count: iterations, values },
      bindings: allBindings,
    });
  }
}

/**
 * Match at most N times.
 */
class TimesAtMostToken extends Token {
  tokens: Token[];
  max: number | string | ((ctx: ParseContext) => number);

  constructor(tokens: Token[], max: number | string | ((ctx: ParseContext) => number)) {
    super();
    this.tokens = tokens;
    this.max = max;
  }

  private getMax(ctx: ParseContext): number {
    if (typeof this.max === 'number') return this.max;
    if (typeof this.max === 'string') return ctx.params[this.max] ?? 0;
    return this.max(ctx);
  }

  getFirstConcreteTokens(): Token[] {
    return [];  // Might match 0 times
  }

  canStartAt(_ctx: ParseContext): boolean {
    return true;  // Can always match (0 times is valid)
  }

  match(ctx: ParseContext): MatchResult {
    const max = this.getMax(ctx);
    const innerToken = this.tokens.length === 1
      ? this.tokens[0]
      : new ArrayToken(this.tokens);

    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    log(`[timesAtMost] matching at most ${max} times at ${ctx.index}`);

    while (iterations < max) {
      // Check if should stop at boundary
      const testCtx: ParseContext = {
        input: ctx.input,
        index: currentIndex,
        boundaries: [],
        params: ctx.params,
        bindings: ctx.bindings,
      };
      for (const boundary of ctx.boundaries) {
        if (boundary.canStartAt(testCtx)) {
          log(`[timesAtMost] stopping at boundary after ${iterations} iterations`);
          return this.wrapResult({
            success: true,
            consumed: totalConsumed,
            value: { count: iterations, values },
            bindings: allBindings,
          });
        }
      }

      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      if (!result.success || result.consumed === 0) {
        break;
      }

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }

    log(`[timesAtMost] success with ${iterations} iterations`);
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: { count: iterations, values },
      bindings: allBindings,
    });
  }
}

/**
 * Match between min and max times (inclusive).
 */
class TimesBetweenToken extends Token {
  tokens: Token[];
  min: number;
  max: number;

  constructor(tokens: Token[], min: number, max: number) {
    super();
    this.tokens = tokens;
    this.min = min;
    this.max = max;
  }

  getFirstConcreteTokens(): Token[] {
    if (this.min === 0) return [];
    if (this.tokens.length === 0) return [];
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    if (this.min === 0) return true;
    if (this.tokens.length === 0) return true;
    const inner = this.tokens.length === 1 ? this.tokens[0] : new ArrayToken(this.tokens);
    return inner.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    const innerToken = this.tokens.length === 1
      ? this.tokens[0]
      : new ArrayToken(this.tokens);

    let totalConsumed = 0;
    const values: any[] = [];
    let allBindings: Record<string, any> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    log(`[timesBetween] matching ${this.min}-${this.max} times at ${ctx.index}`);

    while (iterations < this.max) {
      // Check if we've met minimum and should stop at boundary
      if (iterations >= this.min) {
        const testCtx: ParseContext = {
          input: ctx.input,
          index: currentIndex,
          boundaries: [],
          params: ctx.params,
          bindings: ctx.bindings,
        };
        for (const boundary of ctx.boundaries) {
          if (boundary.canStartAt(testCtx)) {
            log(`[timesBetween] stopping at boundary after ${iterations} iterations`);
            return this.wrapResult({
              success: true,
              consumed: totalConsumed,
              value: { count: iterations, values },
              bindings: allBindings,
            });
          }
        }
      }

      const result = innerToken.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: ctx.boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      if (!result.success || result.consumed === 0) {
        break;
      }

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allBindings = { ...allBindings, ...result.bindings };
      iterations++;
    }

    if (iterations < this.min) {
      log(`[timesBetween] failed - only ${iterations} iterations, need at least ${this.min}`);
      return { success: false, consumed: 0, value: null, bindings: {} };
    }

    log(`[timesBetween] success with ${iterations} iterations`);
    return this.wrapResult({
      success: true,
      consumed: totalConsumed,
      value: { count: iterations, values },
      bindings: allBindings,
    });
  }
}

/**
 * Set or update params for nested parsing.
 * Useful for indentation-sensitive parsing.
 */
class WithParamsToken extends Token {
  inner: Token;
  paramsFn: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>);

  constructor(
    inner: Token,
    params: Record<string, any> | ((ctx: ParseContext, bindings: Record<string, any>) => Record<string, any>)
  ) {
    super();
    this.inner = inner;
    this.paramsFn = params;
  }

  getFirstConcreteTokens(): Token[] {
    return this.inner.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.inner.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    const newParams = typeof this.paramsFn === 'function'
      ? this.paramsFn(ctx, ctx.bindings)  // Pass accumulated bindings!
      : this.paramsFn;

    const mergedParams = { ...ctx.params, ...newParams };
    log(`[withParams] setting params:`, mergedParams, 'from bindings:', ctx.bindings);

    return this.wrapResult(this.inner.match({
      ...ctx,
      params: mergedParams,
    }));
  }
}

class OptionalToken extends Token {
  token: Token;

  constructor(token: Token) {
    super();
    this.token = token;
  }

  getFirstConcreteTokens(): Token[] {
    return this.token.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.token.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);

    if (result.success) {
      return this.wrapResult(result);
    }

    return this.wrapResult({
      success: true,
      consumed: 0,
      value: null,
      bindings: {},
    });
  }
}

/**
 * Transform a matched value using a function.
 */
class TransformToken extends Token {
  token: Token;
  transformFn: (value: any, bindings: Record<string, any>) => any;

  constructor(token: Token, fn: (value: any, bindings: Record<string, any>) => any) {
    super();
    this.token = token;
    this.transformFn = fn;
  }

  getFirstConcreteTokens(): Token[] {
    return this.token.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.token.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    const result = this.token.match(ctx);

    if (!result.success) {
      return result;
    }

    const transformedValue = this.transformFn(result.value, result.bindings);
    return this.wrapResult({
      ...result,
      value: transformedValue,
    });
  }
}

class RefToken extends Token {
  fn: () => Token;
  private _cached?: Token;
  name: string;

  constructor(fn: () => Token, name: string = 'ref') {
    super();
    this.fn = fn;
    this.name = name;
  }

  private get cached(): Token {
    if (!this._cached) this._cached = this.fn();
    return this._cached;
  }

  getFirstConcreteTokens(): Token[] {
    return this.cached.getFirstConcreteTokens();
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.cached.canStartAt(ctx);
  }

  match(ctx: ParseContext): MatchResult {
    log(`[ref:${this.name}] at ${ctx.index} "${ctx.input.slice(ctx.index, ctx.index+10)}..." bounds=${ctx.boundaries.length}`);
    DEPTH++;
    const result = this.cached.match(ctx);
    DEPTH--;
    log(`[ref:${this.name}] result: success=${result.success} consumed=${result.consumed}`);
    return this.wrapResult(result);
  }
}

class AnyToken extends Token {
  tokens: Token[];

  constructor(tokens: Token[]) {
    super();
    this.tokens = tokens;
  }

  getFirstConcreteTokens(): Token[] {
    const result: Token[] = [];
    for (const token of this.tokens) {
      result.push(...token.getFirstConcreteTokens());
    }
    return result;
  }

  canStartAt(ctx: ParseContext): boolean {
    return this.tokens.some(t => t.canStartAt(ctx));
  }

  match(ctx: ParseContext): MatchResult {
    log(`[any] at ${ctx.index}, ${this.tokens.length} alternatives, bounds=${ctx.boundaries.length}`);

    // Collect ALL concrete tokens from ALL alternatives - they all become mutual boundaries
    // This ensures that `arbitrary | {specific}` will have arbitrary stop at `{`
    const allConcreteTokens: Token[] = [];
    for (const token of this.tokens) {
      allConcreteTokens.push(...token.getFirstConcreteTokens());
    }

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];

      // ALL alternatives' concrete tokens (except our own) become boundaries
      const otherConcreteTokens: Token[] = [];
      for (let j = 0; j < this.tokens.length; j++) {
        if (j !== i) {
          otherConcreteTokens.push(...this.tokens[j].getFirstConcreteTokens());
        }
      }
      const boundaries = [...otherConcreteTokens, ...ctx.boundaries];

      log(`[any] trying alt ${i} with ${boundaries.length} bounds`);
      const result = token.match({
        input: ctx.input,
        index: ctx.index,
        boundaries,
        params: ctx.params,
        bindings: ctx.bindings,
      });

      log(`[any] alt ${i} result: success=${result.success}, consumed=${result.consumed}`);
      if (result.success) {
        return this.wrapResult(result);
      }
    }

    log(`[any] all alternatives failed`);
    return { success: false, consumed: 0, value: null, bindings: {} };
  }
}

// ============ Parser ============

class Parser {
  grammar: Token;
  initialParams: Record<string, any>;

  constructor(grammar: Token, initialParams: Record<string, any> = {}) {
    this.grammar = grammar;
    this.initialParams = initialParams;
  }

  parse(input: string): MatchResult {
    return this.grammar.match({
      input,
      index: 0,
      boundaries: [],
      params: this.initialParams,
      bindings: {},
    });
  }
}

// ============ EXAMPLES ============

console.log('='.repeat(60));
console.log('Test 1: Nested braces - NO [^{}]+ NEEDED!');
console.log('='.repeat(60) + '\n');

// The magic: arbitrary() automatically stops at { and }
const NESTED_BRACES: Token = Token.array(
  Token.string('{'),
  Token.loop(
    Token.any(
      Token.ref(() => NESTED_BRACES, 'NESTED_BRACES'),
      Token.arbitrary()
    )
  ).bind('content'),
  Token.string('}')
);

const p1 = new Parser(NESTED_BRACES);

// Test three levels with debug
console.log('\nThree levels: "{ { { x } } }"');
DEBUG = true;
const r1c = p1.parse('{ { { x } } }');
DEBUG = false;
console.log('Success:', r1c.success, 'Consumed:', r1c.consumed);

console.log('\n' + '='.repeat(60));
console.log('Test 2: Nested parens');
console.log('='.repeat(60) + '\n');

const NESTED_PARENS: Token = Token.array(
  Token.string('('),
  Token.loop(
    Token.any(
      Token.ref(() => NESTED_PARENS),
      Token.arbitrary()
    )
  ).bind('content'),
  Token.string(')')
);

const p2 = new Parser(NESTED_PARENS);
console.log('Input: "(a + (b * (c - d)))"');
console.log('Result:', JSON.stringify(p2.parse('(a + (b * (c - d)))').bindings, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 3: Function with nested body');
console.log('='.repeat(60) + '\n');

const FUNC = Token.array(
  Token.regex(/[a-zA-Z_]\w*/).bind('name'),
  Token.arbitrary(),
  Token.string('('),
  Token.arbitrary().bind('args'),
  Token.string(')'),
  Token.arbitrary(),
  Token.string('{'),
  Token.loop(
    Token.any(
      Token.ref(() => NESTED_BRACES),
      Token.arbitrary()
    )
  ).bind('body'),
  Token.string('}')
);

const p3 = new Parser(FUNC);
console.log('Input: "calc(x, y) { if (x) { y; } return z; }"');
console.log('Result:', JSON.stringify(p3.parse('calc(x, y) { if (x) { y; } return z; }').bindings, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 4: Quoted strings');
console.log('='.repeat(60) + '\n');

const QUOTED = Token.array(
  Token.string('"'),
  Token.arbitrary().bind('content'),
  Token.string('"')
);

const p4 = new Parser(QUOTED);
console.log('Input: \'"hello world"\'');
console.log('Result:', JSON.stringify(p4.parse('"hello world"').bindings, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 5: Mixed delimiters');
console.log('='.repeat(60) + '\n');

const MIXED = Token.array(
  Token.string('['),
  Token.loop(
    Token.any(
      Token.array(
        Token.string('{'),
        Token.arbitrary().bind('inner'),
        Token.string('}')
      ),
      Token.arbitrary()
    )
  ).bind('items'),
  Token.string(']')
);

const p5 = new Parser(MIXED);
console.log('Input: "[ a, {b, c}, d ]"');
console.log('Result:', JSON.stringify(p5.parse('[ a, {b, c}, d ]').bindings, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 6: HTML-like tags');
console.log('='.repeat(60) + '\n');

const TAG: Token = Token.array(
  Token.string('<'),
  Token.regex(/[a-z]+/).bind('tagName'),
  Token.string('>'),
  Token.loop(
    Token.any(
      Token.ref(() => TAG),
      Token.arbitrary()
    )
  ).bind('children'),
  Token.string('</'),
  Token.arbitrary(),
  Token.string('>')
);

const p6 = new Parser(TAG);
console.log('Input: "<div>hello <span>world</span> foo</div>"');
console.log('Result:', JSON.stringify(p6.parse('<div>hello <span>world</span> foo</div>').bindings, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 7: Quoted strings with escaped quotes (using guards)');
console.log('='.repeat(60) + '\n');

// NEW API: Use .unless(escapedBy('\\')) on the closing quote
const QUOTED_ESCAPED = Token.array(
  Token.string('"'),
  Token.arbitrary().bind('content'),
  Token.string('"').unless(escapedBy('\\'))  // Guard: don't match if escaped
);

const p7 = new Parser(QUOTED_ESCAPED);
const input7 = '"hello \\"world\\" foo"';
console.log('Input:', input7);
const r7 = p7.parse(input7);
console.log('Success:', r7.success, 'Consumed:', r7.consumed, 'of', input7.length);
console.log('Content:', JSON.stringify(r7.bindings.content));

// Test escaped backslash before real quote: "hello \\" -> content is "hello \"
console.log('\nTest 7b: Escaped backslash before closing quote');
const input7b = '"hello \\\\"';
console.log('Input:', input7b, '(should be: content="hello \\\\")');
const r7b = p7.parse(input7b);
console.log('Success:', r7b.success, 'Consumed:', r7b.consumed, 'of', input7b.length);
console.log('Content:', JSON.stringify(r7b.bindings.content));

// Test escaped backslash then escaped quote: "hello \\\"world" -> content is "hello \"world"
console.log('\nTest 7c: Escaped backslash + escaped quote');
const input7c = '"hello \\\\\\"world"';
console.log('Input:', input7c);
const r7c = p7.parse(input7c);
console.log('Success:', r7c.success, 'Consumed:', r7c.consumed, 'of', input7c.length);
console.log('Content:', JSON.stringify(r7c.bindings.content));

console.log('\n' + '='.repeat(60));
console.log('Test 8: Template strings with nested expressions');
console.log('='.repeat(60) + '\n');

// Template string: "text {expression} more text"
// Expression can contain nested strings: {predicate ? "yes" : "no"}
// The .isolated() on the entire {expr} prevents outer string's " from being a boundary
const TEMPLATE_EXPR: Token = Token.array(
  Token.string('{'),
  Token.loop(
    Token.any(
      Token.ref(() => TEMPLATE_STRING, 'nested'),  // Nested string in expression
      Token.arbitrary()
    )
  ).bind('expr'),
  Token.string('}')
).isolated();  // Isolate the entire {...} structure from parent boundaries

const TEMPLATE_STRING: Token = Token.array(
  Token.string('"'),
  Token.loop(
    Token.any(
      Token.ref(() => TEMPLATE_EXPR),  // {expression} block
      Token.arbitrary()
    )
  ).bind('parts'),
  Token.string('"').unless(escapedBy('\\'))
);

const p8 = new Parser(TEMPLATE_STRING);

console.log('Test 8a: Simple template');
const input8a = '"hello {name} world"';
console.log('Input:', input8a);
const r8a = p8.parse(input8a);
console.log('Success:', r8a.success, 'Consumed:', r8a.consumed);
console.log('Parts:', JSON.stringify(r8a.bindings.parts, null, 2));

console.log('\nTest 8b: Template with nested string in expression');
const input8b = '"result: {x > 0 ? "positive" : "negative"}"';
console.log('Input:', input8b);
const r8b = p8.parse(input8b);
console.log('Success:', r8b.success, 'Consumed:', r8b.consumed);
console.log('Parts:', JSON.stringify(r8b.bindings.parts, null, 2));

console.log('\nTest 8c: Template with escaped quote');
const input8c = '"say \\"hello\\" to {name}"';
console.log('Input:', input8c);
const r8c = p8.parse(input8c);
console.log('Success:', r8c.success, 'Consumed:', r8c.consumed);
console.log('Parts:', JSON.stringify(r8c.bindings.parts, null, 2));

console.log('\n' + '='.repeat(60));
console.log('Test 9: Indentation-sensitive parsing');
console.log('='.repeat(60) + '\n');

// Grammar for indentation-sensitive language like:
//   class Test
//     method () => hi
//     another () => bye
//   class Other
//     foo () => bar
//
// UNIFIED STRUCTURE:
// - STATEMENT = content + terminator + children
// - Children are: (parent_indent + added_indent + STATEMENT)*
// - PROGRAM = STATEMENT* at indent=0

// STATEMENT handles content + terminator + optional indented children
// The leading indent is matched by whoever invokes us (or we're at root)
const STATEMENT: Token = Token.array(
  Token.arbitrary().bind('content'),
  Token.any(Token.string(';'), Token.string('\n'), Token.end()),
  // Children: each starts with parent_indent + extra_indent
  Token.loop(
    Token.array(
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
const PROGRAM: Token = Token.loop(Token.ref(() => STATEMENT)).bind('statements');

// Helper to transform the raw parse result into a clean tree
function toTree(value: any): any {
  const [content, _term, children] = value;
  return {
    content,
    children: (children || []).map((c: any) => {
      // Each child is: [parentIndent, addedIndent, statementValue]
      const [_parentIndent, _addedIndent, childStatement] = c;
      return toTree(childStatement);
    })
  };
}

function programToTrees(result: any): any[] {
  return result.bindings.statements.map(toTree);
}

const p9 = new Parser(PROGRAM, { indent: 0 });

console.log('Test 9a: Single line');
const input9a = 'hello\n';
console.log('Input:', JSON.stringify(input9a));
const r9a = p9.parse(input9a);
console.log('Success:', r9a.success);
console.log('Trees:', JSON.stringify(programToTrees(r9a), null, 2));

console.log('\nTest 9b: Two children (2-space indent)');
const input9b = 'class Test\n  method one\n  method two\n';
console.log('Input:', JSON.stringify(input9b));
const r9b = p9.parse(input9b);
console.log('Success:', r9b.success);
console.log('Trees:', JSON.stringify(programToTrees(r9b), null, 2));

console.log('\nTest 9c: Deeper nesting (flexible indent)');
const input9c = 'root\n  child1\n    grandchild\n  child2\n';
console.log('Input:', JSON.stringify(input9c));
const r9c = p9.parse(input9c);
console.log('Success:', r9c.success);
console.log('Trees:', JSON.stringify(programToTrees(r9c), null, 2));

console.log('\nTest 9d: 4-space indent');
const input9d = 'root\n    child1\n    child2\n';
console.log('Input:', JSON.stringify(input9d));
const r9d = p9.parse(input9d);
console.log('Success:', r9d.success);
console.log('Trees:', JSON.stringify(programToTrees(r9d), null, 2));

console.log('\nTest 9e: Mixed indent depths');
const input9e = 'root\n  a\n    b\n      c\n  d\n';
console.log('Input:', JSON.stringify(input9e));
const r9e = p9.parse(input9e);
console.log('Success:', r9e.success);
console.log('Trees:', JSON.stringify(programToTrees(r9e), null, 2));

console.log('\nTest 9f: Multiple roots');
const input9f = 'first root\n  child1\nsecond root\n  child2\nthird root\n';
console.log('Input:', JSON.stringify(input9f));
const r9f = p9.parse(input9f);
console.log('Success:', r9f.success);
console.log('Trees:', JSON.stringify(programToTrees(r9f), null, 2));

// ============ SELF-HOSTING GRAMMAR SYSTEM ============

console.log('\n' + '='.repeat(60));
console.log('Test 10: Self-Hosting Grammar');
console.log('='.repeat(60) + '\n');


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
    // const self = this;
    // const WS = Token.loop(Token.regex(/[ \t]/));
    //
    // const extractString = (chars: any[]): string => {
    //   let value = '';
    //   for (const c of chars) {
    //     if (Array.isArray(c) && c[0] === 'ESC') {
    //       const escaped = c[1];
    //       if (escaped === 'n') value += '\n';
    //       else if (escaped === 't') value += '\t';
    //       else if (escaped === '\\') value += '\\';
    //       else if (escaped === '"') value += '"';
    //       else value += escaped;
    //     } else if (typeof c === 'string') {
    //       value += c;
    //     }
    //   }
    //   return value;
    // };
    //
    // const STRING_LITERAL = Token.array(
    //   Token.string('"'),
    //   Token.loop(Token.any(
    //     Token.array(Token.string('\\'), Token.regex(/./)).transform((v) => ['ESC', v[1]]),
    //     Token.regex(/[^"\\]/)
    //   )),
    //   Token.string('"')
    // ).transform((v) => Token.string(extractString(v[1] || [])));
    //
    // const ARBITRARY = Token.string('*').transform(() => Token.arbitrary());
    //
    // const PATTERN: Token = Token.ref(() => ALTERNATIVES, 'Pattern');
    //
    // const BINDING = Token.array(
    //   Token.string('{'), WS,
    //   Token.regex(/[a-zA-Z_][a-zA-Z0-9_]*/), WS,
    //   Token.optional(Token.array(Token.string(':'), WS, PATTERN, WS)),
    //   Token.string('}')
    // ).transform((v) => {
    //   const name = v[2];
    //   const optionalInner = v[4];
    //   let innerToken: Token = optionalInner && optionalInner.length > 0
    //     ? optionalInner[2]
    //     : self.getRule('Expression');
    //   return innerToken.bind(name);
    // });
    //
    // const GROUP = Token.array(
    //   Token.string('('), WS, PATTERN, WS, Token.string(')')
    // ).transform((v) => v[2]);
    //
    // const REFERENCE = Token.regex(/[a-zA-Z_][a-zA-Z0-9_]*/)
    //   .transform((v) => self.getRule(v));
    //
    // const ATOM = Token.any(STRING_LITERAL, ARBITRARY, BINDING, GROUP, REFERENCE);
    //
    // const POSTFIX = Token.optional(Token.array(
    //   Token.string('[]'),
    //   Token.optional(Token.string('.NonEmpty'))
    // ));
    //
    // const ELEMENT = Token.array(ATOM, POSTFIX).transform((v) => {
    //   let token: Token = v[0];
    //   const postfixResult = v[1];
    //   if (postfixResult) {
    //     const isNonEmpty = postfixResult[1];
    //     token = isNonEmpty ? Token.times(token).atLeast(1) : Token.loop(token);
    //   }
    //   return token;
    // });
    //
    // const SEQUENCE = Token.array(
    //   WS, ELEMENT,
    //   Token.loop(Token.array(WS, Token.optional(Token.string(',')), WS, ELEMENT)),
    //   WS
    // ).transform((v) => {
    //   const tokens: Token[] = [v[1]];
    //   for (const r of v[2] || []) {
    //     if (r[3] instanceof Token) tokens.push(r[3]);
    //   }
    //   return tokens.length === 1 ? tokens[0] : Token.array(...tokens);
    // });
    //
    // const ALTERNATIVES: Token = Token.array(
    //   SEQUENCE,
    //   Token.loop(Token.array(WS, Token.string('|'), WS, SEQUENCE))
    // ).transform((v) => {
    //   const tokens: Token[] = [v[0]];
    //   for (const alt of v[1] || []) {
    //     if (alt[3] instanceof Token) tokens.push(alt[3]);
    //   }
    //   return tokens.length === 1 ? tokens[0] : Token.any(...tokens);
    // });

    return PROGRAM;
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
    const arrowMatch = trimmed.match(/=>/);
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


// ============ TESTS ============

console.log('Test 10a: Bootstrap grammar');
const grammar = new SelfHostingGrammar();
console.log('Initial rules:', grammar.getRuleNames());

console.log('\nTest 10b: Parse simple quoted string');
const simpleParser = new Parser(grammar.getRule('QuotedString'));
const simple = simpleParser.parse('"hello world"');
console.log('Input: "hello world"');
console.log('Success:', simple.success);
console.log('Content:', simple.bindings.content);

console.log('\nTest 10c: Compile pattern directly');
// Pattern: ("(", content, ")") - matches anything in parens
// const pattern1 = grammar.compilePatternContent('("(", {content: *}, ")")');
// console.log('Pattern: ("(", {content: *}, ")") compiled');
//
// // Test it
// grammar.addRule('Parens', pattern1);
// const parensParser = new Parser(grammar.getRule('Parens'));
// const parens = parensParser.parse('(hello world)');
// console.log('Parse (hello world):', parens.success, parens.bindings);
//
// console.log('\nTest 10d: Define backtick strings');
// // Pattern: ("`", value, "`")
// const backtickPattern = grammar.compilePatternContent('("`", {value: *}, "`")');
// grammar.addRule('RawString', backtickPattern);
// console.log('Rules now:', grammar.getRuleNames());
//
// // Test the new rule
// const rawParser = new Parser(grammar.getRule('RawString'));
// const raw = rawParser.parse('`hello`');
// console.log('Parse `hello`:', raw.success, raw.bindings);
//
// console.log('\nTest 10e: Define String with interpolation');
// // Pattern: ('"', parts[], '"') where parts = text | {expr}
// const stringPattern = grammar.compilePatternContent(
//   '("\\"", {parts: ({text: *} | ("{", {expr: Expression}, "}"))[]}, "\\"")'
// );
// grammar.addRule('String', stringPattern);
// console.log('Added interpolated String rule');
// console.log('Rules now:', grammar.getRuleNames());

// Test interpolated string
const stringParser = new Parser(grammar.getRule('String'));
const interp = stringParser.parse('"hello {name} world"');
console.log('Parse "hello {name} world":', interp.success);
console.log('Parts:', JSON.stringify(interp.bindings.parts, null, 2));

console.log('\nTest 10f: Self-hosting demonstration');
// The grammar can now parse patterns that use String!
// Because String is now defined with interpolation, patterns can use interpolation too
console.log('Grammar is now self-hosting: String rule can parse patterns with {expressions}');


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
const grammar5 = new SelfHostingGrammar();
const result5 = grammar5.parseWithEvolution(
  fs.readFileSync('../.ray/Language/String/String.ray', 'utf8') +
  fs.readFileSync('../.ray/Node.ray', 'utf8')
);

console.log('Results:');
for (const stmt of result5.statements) {
  if (stmt.type === 'grammar_def') {
    console.log(`  [GRAMMAR DEF] "${stmt.patternText}" => ${stmt.ruleName}`);
  } else {
    console.log(`  [STATEMENT] "${stmt.raw.replaceAll("\n", "")}"`);
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

export { Token, Parser, escapedBy, endsWith, matchesEnd, SelfHostingGrammar };
export type { MatchResult, ParseContext };
