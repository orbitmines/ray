// This file was generated using Claude Opus 4.(5|6)

/**
 * Grammar Parser — Proxy-based API with unified scope model.
 *
 * ══════════════════════════════════════════════════════════════
 * CORE CONCEPTS
 * ══════════════════════════════════════════════════════════════
 *
 * Scope: A single Record<string, any> that replaces both "params" and "bindings".
 *   - Set from above via .with({...}) or initial parse scope
 *   - Set from matching via .bind(name)
 *   - Array tokens create child scopes; sequential tokens see prior siblings' bindings
 *   - Loop tokens accumulate child bindings as ARRAYS across iterations
 *
 * Construction API:
 *   ctx.Array(a, b, c)                  — sequence
 *   ctx.Any(a, b, c)                    — alternatives
 *   ctx.val('x')  or  'x' in Array/Any — literal string
 *   ctx.arbitrary                       — LAZY: match up to first boundary
 *   ctx.regex(/pat/)                    — regex match
 *   ctx.end                             — end of input / boundary
 *   ctx.not('x','y',...)               — GREEDY: boundary → SUCCESS, stop string → FAIL
 *   node[``]                            — loop (0+)
 *   node[``].NonEmpty                   — loop (1+)
 *   node.optional                       — 0 or 1
 *   node.bind(ctx.name) / .bind('name') — capture into scope
 *   node.constrain(fn, op, val)         — counted repetition
 *   node.with({...}) / .with(fn)        — set scope for child
 *   node.unless(fn)                     — guard
 *   node.transform(fn)                  — transform value
 *   node.isolated                       — clear boundaries
 *   ctx.X = expr                        — store a named node
 *   ctx.X                               — lazy reference to named node
 *
 * Loop scope accumulation:
 *   Inside a loop, each iteration binds A="x", B="y" (single values).
 *   From the parent, after the loop: A=["x1","x2",...], B=["y1","y2",...].
 *
 * ══════════════════════════════════════════════════════════════
 */

let DEPTH = 0;

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

type Scope = Record<string, any>;

type MatchResult = {
  success: boolean;
  consumed: number;
  value: any;
  /** New bindings produced by this match (delta from input scope) */
  scope: Scope;
};

type MatchContext = {
  input: string;
  index: number;
  boundaries: Token[];
  iterationBoundaries?: Token[];
  suppressIterBoundaries?: boolean;
  preceding?: string;
  scope: Scope;
};

const FAIL: MatchResult = Object.freeze({ success: false, consumed: 0, value: null, scope: {} });

// ════════════════════════════════════════════════════════════
// Token (internal engine)
// ════════════════════════════════════════════════════════════

abstract class Token {
  protected bindName?: string;

  bindTo(name: string): this {
    this.bindName = name;
    return this;
  }

  abstract match(ctx: MatchContext): MatchResult;
  abstract canStartAt(ctx: MatchContext): boolean;
  abstract getFirstConcreteTokens(): Token[];

  getAllPossibleStartTokens(): Token[] {
    return this.getFirstConcreteTokens();
  }

  protected wrapResult(result: MatchResult): MatchResult {
    if (!result.success) return result;
    const scope = { ...result.scope };
    if (this.bindName) scope[this.bindName] = result.value;
    return { ...result, scope };
  }
}

// ── Literals ──

class StringToken extends Token {
  strings: string[];
  constructor(strings: string[]) {
    super();
    this.strings = [...strings].sort((a, b) => b.length - a.length);
  }
  getFirstConcreteTokens() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    const rem = ctx.input.slice(ctx.index);
    return this.strings.some(s => rem.startsWith(s));
  }
  match(ctx: MatchContext): MatchResult {
    const rem = ctx.input.slice(ctx.index);
    for (const s of this.strings) {
      if (rem.startsWith(s))
        return this.wrapResult({ success: true, consumed: s.length, value: s, scope: {} });
    }
    return FAIL;
  }
}

class RegexToken extends Token {
  pattern: RegExp;
  constructor(pattern: RegExp) {
    super();
    const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';
    this.pattern = new RegExp(pattern.source, flags);
  }
  getFirstConcreteTokens() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    this.pattern.lastIndex = ctx.index;
    return this.pattern.test(ctx.input);
  }
  match(ctx: MatchContext): MatchResult {
    this.pattern.lastIndex = ctx.index;
    const m = this.pattern.exec(ctx.input);
    if (m) return this.wrapResult({ success: true, consumed: m[0].length, value: m[0], scope: {} });
    return FAIL;
  }
}

class EndToken extends Token {
  getFirstConcreteTokens() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    if (ctx.index >= ctx.input.length) return true;
    const allBounds = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];
    for (const b of allBounds) {
      if (b.canStartAt({ ...ctx, boundaries: [], iterationBoundaries: [], preceding: '' })) return true;
    }
    return false;
  }
  match(ctx: MatchContext): MatchResult {
    if (ctx.index >= ctx.input.length)
      return this.wrapResult({ success: true, consumed: 0, value: '', scope: {} });
    const allBounds = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];
    for (const b of allBounds) {
      if (b.canStartAt({ ...ctx, boundaries: [], iterationBoundaries: [], preceding: '' }))
        return this.wrapResult({ success: true, consumed: 0, value: '', scope: {} });
    }
    return FAIL;
  }
}

// ── Not (greedy scan: boundary → SUCCESS, stop string → FAIL) ──

class NotToken extends Token {
  stopStrings: string[];
  constructor(stopStrings: string[]) {
    super();
    this.stopStrings = [...stopStrings].sort((a, b) => b.length - a.length);
  }
  // Transparent — doesn't pollute iteration boundaries
  getFirstConcreteTokens(): Token[] { return []; }
  canStartAt(ctx: MatchContext) {
    if (ctx.index >= ctx.input.length) return false;
    const rem = ctx.input.slice(ctx.index);
    for (const s of this.stopStrings) {
      if (rem.startsWith(s)) return false;
    }
    return true;
  }
  match(ctx: MatchContext): MatchResult {
    // Greedy scan: checks both boundaries and iterationBoundaries.
    // Boundary hit → SUCCESS (returns content before).
    // Stop string hit → FAIL (the pattern must not encounter its stop strings).
    if (ctx.index >= ctx.input.length) return FAIL;
    const rem = ctx.input.slice(ctx.index);
    const allBounds = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];

    for (let i = 0; i <= rem.length; i++) {
      // Check boundaries at position i — yield to boundary (SUCCESS)
      if (allBounds.length > 0 && i > 0) {
        const testCtx: MatchContext = {
          ...ctx, index: ctx.index + i,
          boundaries: [], iterationBoundaries: [], preceding: rem.slice(0, i)
        };
        for (const b of allBounds) {
          if (b.canStartAt(testCtx)) {
            return this.wrapResult({ success: true, consumed: i, value: rem.slice(0, i), scope: {} });
          }
        }
      }

      // Check stop strings at position i — pattern FAILS
      if (i < rem.length) {
        const sub = rem.slice(i);
        for (const s of this.stopStrings) {
          if (sub.startsWith(s)) return FAIL;
        }
      }
    }

    // Reached end of input without hitting stop or boundary
    if (rem.length === 0) return FAIL;
    return this.wrapResult({ success: true, consumed: rem.length, value: rem, scope: {} });
  }
}

// ── Arbitrary ──

class ArbitraryToken extends Token {
  getFirstConcreteTokens(): Token[] { return []; }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const rem = ctx.input.slice(ctx.index);
    const all = [...ctx.boundaries, ...(ctx.iterationBoundaries || [])];
    if (all.length === 0)
      return this.wrapResult({ success: true, consumed: rem.length, value: rem, scope: {} });
    for (let i = 0; i <= rem.length; i++) {
      const preceding = rem.slice(0, i);
      const testCtx: MatchContext = { ...ctx, index: ctx.index + i, boundaries: [], iterationBoundaries: [], preceding };
      for (const b of all) {
        if (b.canStartAt(testCtx))
          return this.wrapResult({ success: true, consumed: i, value: preceding, scope: {} });
      }
    }
    return this.wrapResult({ success: true, consumed: rem.length, value: rem, scope: {} });
  }
}

// ── Array (sequence) — creates child scope ──

class ArrayToken extends Token {
  constructor(public items: Token[]) { super(); }
  getFirstConcreteTokens() {
    const result: Token[] = [];
    for (const t of this.items) {
      const f = t.getFirstConcreteTokens();
      result.push(...f);
      if (f.length > 0) break;
    }
    return result;
  }
  getAllPossibleStartTokens() {
    const result: Token[] = [];
    for (const t of this.items) {
      result.push(...t.getAllPossibleStartTokens());
      if (t.getFirstConcreteTokens().length > 0) break;
    }
    return result;
  }
  canStartAt(ctx: MatchContext) {
    if (this.items.length === 0) return true;
    for (const t of this.items) {
      const f = t.getFirstConcreteTokens();
      if (f.length > 0) return t.canStartAt(ctx);
      if (t.canStartAt(ctx)) return true;
    }
    return true;
  }
  match(ctx: MatchContext): MatchResult {
    let totalConsumed = 0;
    const values: any[] = [];
    // Child scope inherits parent scope; sequential tokens accumulate into it
    let childScope: Scope = { ...ctx.scope };
    let currentIndex = ctx.index;

    for (let i = 0; i < this.items.length; i++) {
      const token = this.items[i];
      const remaining = this.items.slice(i + 1);

      // Boundaries: collect possible start tokens from ALL remaining items
      // (including optional ones) until we find a required (concrete) one.
      const remainingBoundaries: Token[] = [];
      for (const rt of remaining) {
        remainingBoundaries.push(...rt.getAllPossibleStartTokens());
        const f = rt.getFirstConcreteTokens();
        if (f.length > 0) break; // Stop collecting after first required token
      }
      const boundaries = [...remainingBoundaries, ...ctx.boundaries];

      const result = token.match({
        input: ctx.input,
        index: currentIndex,
        boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: childScope,
      });

      if (!result.success) return FAIL;

      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      // Accumulate bindings from this token into child scope
      childScope = { ...childScope, ...result.scope };
    }

    // Return delta: only keys that weren't in the original parent scope
    const delta: Scope = {};
    for (const key of Object.keys(childScope)) {
      if (!(key in ctx.scope) || childScope[key] !== ctx.scope[key]) {
        delta[key] = childScope[key];
      }
    }
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: delta });
  }
}

// ── Loop — accumulates child bindings as arrays ──

class LoopToken extends Token {
  constructor(public items: Token[], public minCount: number = 0) { super(); }
  private get inner(): Token {
    return this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
  }
  getFirstConcreteTokens() {
    if (this.minCount === 0) return [];
    return this.inner.getFirstConcreteTokens();
  }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) {
    if (this.minCount === 0) return true;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    const accumulated: Record<string, any[]> = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    const iterationStarts = ctx.suppressIterBoundaries
      ? [] : inner.getAllPossibleStartTokens();

    // Merge outer boundaries + iterationBoundaries into iteration boundaries so that:
    // - arbitrary and not() (which check both) still see them
    // - structural boundaries (e.g. '}') propagate through nesting
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || [])];

    while (true) {
      const result = inner.match({
        input: ctx.input,
        index: currentIndex,
        boundaries: [],  // Strip outer boundaries from inner
        iterationBoundaries: mergedIterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
      });

      if (result.success && result.consumed > 0) {
        totalConsumed += result.consumed;
        currentIndex += result.consumed;
        values.push(result.value);
        for (const [key, val] of Object.entries(result.scope)) {
          if (!(key in accumulated)) accumulated[key] = [];
          accumulated[key].push(val);
        }
        iterations++;
        continue;
      }

      // Inner failed or consumed 0. Check if we can stop here.
      if (iterations >= this.minCount) {
        // Check outer boundaries at current position
        const testCtx: MatchContext = { ...ctx, index: currentIndex, boundaries: [], iterationBoundaries: [] };
        for (const b of ctx.boundaries) {
          if (b.canStartAt(testCtx))
            return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: accumulated });
        }
        // Also succeed at end of input
        if (currentIndex >= ctx.input.length)
          return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: accumulated });
      }
      break;
    }

    if (iterations < this.minCount) return FAIL;
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: accumulated });
  }
}

// ── Times (counted repetition) ──

type CountSpec = number | string | ((ctx: MatchContext) => number);

function resolveCount(spec: CountSpec, ctx: MatchContext): number {
  if (typeof spec === 'number') return spec;
  if (typeof spec === 'string') return ctx.scope[spec] ?? 0;
  return spec(ctx);
}

class TimesExactlyToken extends Token {
  constructor(public items: Token[], public count: CountSpec) { super(); }
  private get inner(): Token {
    return this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
  }
  getFirstConcreteTokens() {
    if (typeof this.count === 'number' && this.count === 0) return [];
    if (typeof this.count !== 'number') return []; // dynamic, might be 0
    return this.inner.getFirstConcreteTokens();
  }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) {
    const n = resolveCount(this.count, ctx);
    if (n === 0) return true;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    const n = resolveCount(this.count, ctx);
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    let allScope: Scope = {};
    let currentIndex = ctx.index;

    for (let i = 0; i < n; i++) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: ctx.boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        scope: ctx.scope,
      });
      if (!result.success) return FAIL;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allScope = { ...allScope, ...result.scope };
    }
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: allScope });
  }
}

class TimesAtLeastToken extends Token {
  constructor(public items: Token[], public min: CountSpec) { super(); }
  private get inner(): Token {
    return this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
  }
  getFirstConcreteTokens() {
    if (typeof this.min === 'number' && this.min === 0) return [];
    if (typeof this.min !== 'number') return [];
    return this.inner.getFirstConcreteTokens();
  }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) {
    const n = resolveCount(this.min, ctx);
    if (n === 0) return true;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    const min = resolveCount(this.min, ctx);
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    let allScope: Scope = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    // Merge boundaries into iterBounds (same as LoopToken) so structural
    // boundaries propagate to inner matchers like not() and arbitrary.
    const iterationStarts = ctx.suppressIterBoundaries
      ? [] : inner.getAllPossibleStartTokens();
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || [])];

    while (true) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: [],  // Strip outer boundaries
        iterationBoundaries: mergedIterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
      });
      if (!result.success || result.consumed === 0) break;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allScope = { ...allScope, ...result.scope };
      iterations++;
    }

    if (iterations < min) return FAIL;
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, scope: allScope,
    });
  }
}

class TimesAtMostToken extends Token {
  constructor(public items: Token[], public max: CountSpec) { super(); }
  private get inner(): Token {
    return this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
  }
  getFirstConcreteTokens(): Token[] { return []; }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const max = resolveCount(this.max, ctx);
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    let allScope: Scope = {};
    let currentIndex = ctx.index;
    let iterations = 0;

    const iterationStarts = ctx.suppressIterBoundaries
      ? [] : inner.getAllPossibleStartTokens();
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || [])];

    while (iterations < max) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: [],  // Strip outer boundaries
        iterationBoundaries: mergedIterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
      });
      if (!result.success || result.consumed === 0) break;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      allScope = { ...allScope, ...result.scope };
      iterations++;
    }
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, scope: allScope,
    });
  }
}

// ── Any (alternatives) ──

class AnyToken extends Token {
  constructor(public options: Token[]) { super(); }
  getFirstConcreteTokens() {
    const r: Token[] = [];
    for (const t of this.options) r.push(...t.getFirstConcreteTokens());
    return r;
  }
  getAllPossibleStartTokens() {
    const r: Token[] = [];
    for (const t of this.options) r.push(...t.getAllPossibleStartTokens());
    return r;
  }
  canStartAt(ctx: MatchContext) {
    return this.options.some(t => t.canStartAt(ctx));
  }
  match(ctx: MatchContext): MatchResult {
    let zeroConsumedResult: MatchResult | null = null;
    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      // Add other alternatives as disambiguation boundaries
      const others: Token[] = [];
      for (let j = 0; j < this.options.length; j++) {
        if (j !== i) others.push(...this.options[j].getAllPossibleStartTokens());
      }
      const iterBounds = [...others, ...(ctx.iterationBoundaries || [])];
      const result = opt.match({ ...ctx, iterationBoundaries: iterBounds });
      if (result.success) {
        if (result.consumed > 0) return this.wrapResult(result);
        // Save zero-consumed match as fallback, keep trying other options
        if (!zeroConsumedResult) zeroConsumedResult = result;
      }
    }
    if (zeroConsumedResult) return this.wrapResult(zeroConsumedResult);
    return FAIL;
  }
}

// ── Optional ──

class OptionalToken extends Token {
  constructor(public inner: Token) { super(); }
  getFirstConcreteTokens(): Token[] { return []; }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const result = this.inner.match(ctx);
    if (result.success) return this.wrapResult(result);
    return this.wrapResult({ success: true, consumed: 0, value: null, scope: {} });
  }
}

// ── Ref (lazy/recursive reference) ──

class RefToken extends Token {
  private _cached?: Token;
  constructor(public fn: () => Token, public refName: string = 'ref') { super(); }
  private get cached(): Token {
    if (!this._cached) this._cached = this.fn();
    return this._cached;
  }
  getFirstConcreteTokens() { return this.cached.getFirstConcreteTokens(); }
  getAllPossibleStartTokens() { return this.cached.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.cached.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    DEPTH++;
    // Clear iteration boundaries across ref boundary
    const result = this.cached.match({ ...ctx, iterationBoundaries: [] });
    DEPTH--;
    return this.wrapResult(result);
  }
}

// ── WithScope (replaces WithParams — sets scope entries for child) ──

class WithScopeToken extends Token {
  constructor(
    public inner: Token,
    public scopeFn: Scope | ((scope: Scope) => Scope)
  ) { super(); }
  getFirstConcreteTokens() { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    const extra = typeof this.scopeFn === 'function'
      ? this.scopeFn(ctx.scope)
      : this.scopeFn;
    const merged = { ...ctx.scope, ...extra };
    return this.wrapResult(this.inner.match({ ...ctx, scope: merged }));
  }
}

// ── Guard ──

class GuardedToken extends Token {
  constructor(public inner: Token, public guard: (preceding: string) => boolean) { super(); }
  getFirstConcreteTokens() { return [this as Token]; }
  getAllPossibleStartTokens() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) return false;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) return FAIL;
    return this.wrapResult(this.inner.match(ctx));
  }
}

// ── Transform ──

class TransformToken extends Token {
  constructor(public inner: Token, public fn: (value: any, scope: Scope) => any) { super(); }
  getFirstConcreteTokens() { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    const result = this.inner.match(ctx);
    if (!result.success) return result;
    return this.wrapResult({ ...result, value: this.fn(result.value, result.scope) });
  }
}

// ── Isolated (clear boundaries) ──

class IsolatedToken extends Token {
  constructor(public inner: Token) { super(); }
  getFirstConcreteTokens() { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    return this.wrapResult(this.inner.match({ ...ctx, boundaries: [], iterationBoundaries: [] }));
  }
}

// ── NoIterBoundaries ──

class NoIterBoundariesToken extends Token {
  constructor(public inner: Token) { super(); }
  getFirstConcreteTokens() { return this.inner.getFirstConcreteTokens(); }
  getAllPossibleStartTokens() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    return this.wrapResult(this.inner.match({
      ...ctx, iterationBoundaries: [], suppressIterBoundaries: true
    }));
  }
}

// ════════════════════════════════════════════════════════════
// Proxy API (construction interface)
// ════════════════════════════════════════════════════════════

const _matcher = Symbol('matcher');
const _name = Symbol('name');

/** Check if a value is a GNode proxy */
function isToken(val: any): boolean {
  return val != null && (typeof val === 'object' || typeof val === 'function') && _matcher in val;
}

/** Extract the Token from a GNode, string, etc. */
function toToken(val: any): Token {
  if (val === null || val === undefined) throw new Error('Cannot convert null/undefined to matcher');
  if (typeof val === 'string') return new StringToken([val]);
  if (typeof val === 'number' || typeof val === 'boolean') return new StringToken([String(val)]);
  if (isToken(val)) return val[_matcher];
  throw new Error(`Cannot convert ${typeof val} to matcher`);
}

/** Wrap a Token into a proxy node */
function node(matcher: Token, name?: string): any {
  return new Proxy(function () {} as any, {
    get(_t: any, prop: string | symbol): any {
      if (prop === _matcher) return matcher;
      if (prop === _name) return name;
      if (prop === Symbol.toPrimitive) return () => name || '[node]';
      if (prop === Symbol.toStringTag) return 'GNode';

      // [``] → loop
      if (prop === '') return node(new LoopToken([matcher]), name);

      // Property modifiers
      if (prop === 'optional') return node(new OptionalToken(matcher), name);
      if (prop === 'isolated') return node(new IsolatedToken(matcher), name);
      if (prop === 'noIterBoundaries') return node(new NoIterBoundariesToken(matcher), name);
      if (prop === 'end') return node(new EndToken());

      // .NonEmpty → convert loop to min=1
      if (prop === 'NonEmpty') {
        if (matcher instanceof LoopToken)
          return node(new LoopToken(matcher.items, Math.max(matcher.minCount, 1)), name);
        return node(new LoopToken([matcher], 1), name);
      }

      // .bind(target)
      if (prop === 'bind') {
        return (target: any): any => {
          let bName: string;
          if (typeof target === 'string') bName = target;
          else if (isToken(target)) {
            bName = target[_name];
            if (!bName) throw new Error('Bind target node has no name');
          } else throw new Error(`Invalid bind target: ${typeof target}`);
          return node(matcher.bindTo(bName), name);
        };
      }

      // .constrain(accessor, op, value)
      if (prop === 'constrain') {
        return (_accessor: (x: any) => any, op: string, value: any): any => {
          // Extract inner matchers from loop
          let inner: Token[];
          if (matcher instanceof LoopToken) inner = matcher.items;
          else inner = [matcher];

          // Resolve value
          let resolved: CountSpec;
          if (typeof value === 'number') resolved = value;
          else if (typeof value === 'string') resolved = value;
          else if (isToken(value)) resolved = value[_name]!;
          else if (value && typeof value === 'object' && '_type' in value) {
            const refName = value[_name];
            resolved = (ctx: MatchContext) => {
              if (refName && refName in ctx.scope) {
                const v = ctx.scope[refName];
                if (typeof v === 'number') return v;
                if (v && typeof v === 'object' && 'count' in v) return v.count;
              }
              return 0;
            };
          } else resolved = 0;

          switch (op) {
            case '==': return node(new TimesExactlyToken(inner, resolved), name);
            case '>=': return node(new TimesAtLeastToken(inner, resolved), name);
            case '<=': return node(new TimesAtMostToken(inner, resolved), name);
            case '>':
              if (typeof resolved === 'number') return node(new TimesAtLeastToken(inner, resolved + 1), name);
              if (typeof resolved === 'function') { const fn = resolved; return node(new TimesAtLeastToken(inner, (c) => fn(c) + 1), name); }
              return node(new TimesAtLeastToken(inner, resolved), name);
            case '<':
              if (typeof resolved === 'number') return node(new TimesAtMostToken(inner, resolved - 1), name);
              if (typeof resolved === 'function') { const fn = resolved; return node(new TimesAtMostToken(inner, (c) => fn(c) - 1), name); }
              return node(new TimesAtMostToken(inner, resolved), name);
            default: throw new Error(`Unknown operator: ${op}`);
          }
        };
      }

      // .with(scope | fn)
      if (prop === 'with') {
        return (arg: any): any => {
          if (typeof arg === 'function' && !isToken(arg))
            return node(new WithScopeToken(matcher, arg), name);
          if (typeof arg === 'object')
            return node(new WithScopeToken(matcher, arg), name);
          return node(new WithScopeToken(matcher, arg), name);
        };
      }

      if (prop === 'unless') return (guard: (s: string) => boolean) => node(new GuardedToken(matcher, guard), name);
      if (prop === 'transform') return (fn: (v: any, s: Scope) => any) => node(new TransformToken(matcher, fn), name);

      // .as_number — for dynamic scope resolution in expressions
      if (prop === 'as_number') {
        return { [_matcher]: matcher, [_name]: name, _type: 'number_accessor' };
      }

      return undefined;
    },

    has(_t: any, prop: string | symbol) {
      return prop === _matcher || prop === _name;
    }
  });
}

// ════════════════════════════════════════════════════════════
// Context — the grammar construction surface
// ════════════════════════════════════════════════════════════

/**
 * Create a grammar context.
 *
 *   const ctx = createContext();
 *   ctx.greeting = ctx.Array('hello', ' ', ctx.arbitrary.bind(ctx.name));
 *   const result = parse(ctx.greeting, 'hello world');
 */
function createContext(): any {
  const store = new Map<string, Token>();
  let proxy: any;

  proxy = new Proxy({} as any, {
    get(_t: any, prop: string | symbol): any {
      if (typeof prop === 'symbol') return undefined;

      if (prop === 'Array') {
        return (...args: any[]): any => {
          const matchers: Token[] = [];
          for (const arg of args) {
            if (isToken(arg)) matchers.push(arg[_matcher]);
            else if (typeof arg === 'function' && !isToken(arg)) {
              const items = arg(proxy);
              if (Array.isArray(items)) matchers.push(...items.map(toToken));
              else matchers.push(toToken(items));
            } else matchers.push(toToken(arg));
          }
          return node(new ArrayToken(matchers));
        };
      }

      if (prop === 'Any')
        return (...args: any[]) => node(new AnyToken(args.map(toToken)));

      if (prop === 'val') return (v: any) => node(toToken(v));

      // ctx.not('x', 'y', ...) → NotToken (string-based, not regex)
      if (prop === 'not') return (...stopStrings: string[]) => node(new NotToken(stopStrings));

      if (prop === 'end') return node(new EndToken());
      if (prop === 'arbitrary') return node(new ArbitraryToken());
      if (prop === 'regex') return (p: RegExp) => node(new RegexToken(p));

      return node(
        new RefToken(() => {
          const m = store.get(prop);
          if (!m) return new StringToken([`\x00UNDEFINED:${prop}\x00`]);
          return m;
        }, prop),
        prop
      );
    },

    set(_t: any, prop: string | symbol, value: any): boolean {
      if (typeof prop !== 'string') return false;
      store.set(prop, toToken(value));
      return true;
    }
  });

  return proxy;
}

// ════════════════════════════════════════════════════════════
// Parse entry point
// ════════════════════════════════════════════════════════════

function parse(grammar: any, input: string, scope: Scope = {}): MatchResult {
  const matcher = grammar instanceof Token ? grammar : toToken(grammar);
  return matcher.match({
    input, index: 0, boundaries: [], scope,
  });
}

// ════════════════════════════════════════════════════════════
// Guard helpers
// ════════════════════════════════════════════════════════════

function escapedBy(escapeChar: string): (preceding: string) => boolean {
  return (preceding: string) => {
    let count = 0;
    for (let i = preceding.length - 1; i >= 0 && preceding[i] === escapeChar; i--) count++;
    return count % 2 === 1;
  };
}

function endsWith(suffix: string): (preceding: string) => boolean {
  return (preceding: string) => preceding.endsWith(suffix);
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

export {
  // Construction
  createContext, parse, node,
  // Helpers
  toToken, isToken, escapedBy, endsWith,
  // Symbols (for advanced use)
  _matcher, _name,
  Token
};
export type { MatchResult, MatchContext, Scope };


// ════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('═'.repeat(60));
console.log('Parser — Unified Scope Model');
console.log('═'.repeat(60));

// ── 1. Basic sequence + bind ──
console.log('\n── 1. Array + bind ──');
{
  const ctx = createContext();
  ctx.greeting = ctx.Array('hello', ' ', ctx.arbitrary.bind(ctx.name));
  const r = parse(ctx.greeting, 'hello world');
  assert('parses', r.success);
  assert('name="world"', r.scope.name === 'world');
}

// ── 2. Loop via [``] ──
console.log('\n── 2. Loop [``] ──');
{
  const ctx = createContext();
  ctx.digits = ctx.regex(/[0-9]/)[``];
  const r = parse(ctx.digits, '12345');
  assert('all digits', r.success && r.consumed === 5);
  assert('5 items', Array.isArray(r.value) && r.value.length === 5);
}

// ── 3. Constrain ──
console.log('\n── 3. constrain (>=) ──');
{
  const ctx = createContext();
  ctx.indent = ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 2);
  assert('4 spaces ok', parse(ctx.indent, '    x').success);
  assert('1 space fails', !parse(ctx.indent, ' x').success);
}

// ── 4. Any ──
console.log('\n── 4. Any ──');
{
  const ctx = createContext();
  ctx.bool = ctx.Any('true', 'false');
  assert('"true"', parse(ctx.bool, 'true').success);
  assert('"false"', parse(ctx.bool, 'false').success);
  assert('"maybe" fails', !parse(ctx.bool, 'maybe').success);
}

// ── 5. not() — greedy stop-at semantics ──
console.log('\n── 5. not() — greedy stop-at ──');
{
  const ctx = createContext();
  // not() scans forward: stops at boundary or stop string, whichever first.
  // Only fails when stop/boundary is at position 0 (can't consume anything).

  // With boundary from Array: boundary '\n' stops not() before stop string '\n'
  ctx.line = ctx.Array(ctx.not('\n').bind('text'), '\n');
  const r1 = parse(ctx.line, 'hello world\n');
  assert('matches whole group with boundary', r1.success && r1.scope.text === 'hello world');

  // Standalone: stop string hit → FAIL (pattern must not encounter stop strings)
  const r2 = parse(ctx.not('=>'), 'hello=>world');
  assert('fails when stop string encountered', !r2.success);

  // No stop string in input → matches all
  const r3 = parse(ctx.not('=>'), 'hello world');
  assert('no stop → matches all', r3.success && r3.value === 'hello world');

  // With boundary AND stop string: boundary '=>' found first at position 5
  ctx.part = ctx.Array(ctx.not('=>').bind('before'), '=>', ctx.arbitrary.bind('after'));
  const r4 = parse(ctx.part, 'hello=>world');
  assert('boundary stops before =>', r4.success);
  assert('before="hello"', r4.scope.before === 'hello');
  assert('after="world"', r4.scope.after === 'world');

  // Fails when stop string is at position 0
  const r6 = parse(ctx.not(' '), ' abc');
  assert('fails at position 0', !r6.success);

  // Multi-char stop strings — FAIL when encountered
  const r7 = parse(ctx.not('end'), 'abcendxyz');
  assert('fails when stop string encountered', !r7.success);

  // Loop splits at separators using boundaries
  ctx.words = ctx.Array(ctx.not(' ', '\n'), ctx.Any(' ', '\n', ctx.end))[``];
  const r8 = parse(ctx.words, 'hello world bye\n');
  assert('loop splits at spaces', r8.success && r8.value?.length === 3);
}

// ── 6. Bind via ctx.name ──
console.log('\n── 6. Bind via ctx.propName ──');
{
  const ctx = createContext();
  // not('=') matches a whole group up to boundary, no loop needed
  ctx.kv = ctx.Array(ctx.not('=').bind(ctx.key), '=', ctx.arbitrary.bind(ctx.value));
  const r = parse(ctx.kv, 'port=8080');
  assert('parses', r.success);
  assert('key="port"', r.scope.key === 'port');
  assert('value="8080"', r.scope.value === '8080');
}

// ── 7. Optional ──
console.log('\n── 7. Optional ──');
{
  const ctx = createContext();
  ctx.item = ctx.Array(ctx.arbitrary.bind('t'), ctx.val(';').optional);
  assert('with ;', parse(ctx.item, 'hello;').consumed === 6);
  assert('without ;', parse(ctx.item, 'hello').consumed === 5);
}

// ── 8. Scope read (replaces params) ──
console.log('\n── 8. Scope read (== "indent") ──');
{
  const ctx = createContext();
  ctx.indented = ctx.Array(
    ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
    ctx.arbitrary.bind('rest')
  );
  const r1 = parse(ctx.indented, '    x', { indent: 4 });
  assert('indent=4 matches 4 spaces', r1.success && r1.scope.rest === 'x');
  const r2 = parse(ctx.indented, '    x', { indent: 2 });
  assert('indent=2 → rest="  x"', r2.success && r2.scope.rest === '  x');
}

// ── 9. Loop scope accumulation ──
console.log('\n── 9. Loop scope accumulation (KEY FEATURE) ──');
{
  const ctx = createContext();
  ctx.letters = ctx.regex(/[a-z]/).bind('letter')[``];
  const r = parse(ctx.letters, 'abc');
  assert('parses', r.success);
  assert('letter is array', Array.isArray(r.scope.letter));
  assert('letter = [a,b,c]', r.scope.letter?.join(',') === 'a,b,c');
}

// ── 10. Loop with Array — multiple bindings accumulated ──
console.log('\n── 10. Loop + Array: multiple bindings accumulated ──');
{
  const ctx = createContext();
  ctx.pairs = ctx.Array(
    ctx.regex(/\w+/).bind(ctx.key),
    '=',
    ctx.regex(/\w+/).bind(ctx.val_),
    ctx.Any(', ', ctx.end)
  )[``];
  const r = parse(ctx.pairs, 'a=1, b=2, c=3');
  assert('parses', r.success);
  assert('key is array', Array.isArray(r.scope.key));
  assert('keys = [a,b,c]', r.scope.key?.join(',') === 'a,b,c');
  assert('vals = [1,2,3]', r.scope.val_?.join(',') === '1,2,3');
}

// ── 11. .with() sets child scope ──
console.log('\n── 11. .with() sets child scope ──');
{
  const ctx = createContext();
  ctx.spaces = ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'n');
  ctx.doubled = ctx.spaces.with((scope: Scope) => ({ ...scope, n: (scope.n || 0) * 2 }));
  const r = parse(ctx.doubled, '    x', { n: 2 });
  assert('n=2 doubled to 4 spaces', r.success && r.consumed === 4);
}

// ── 12. .transform() ──
console.log('\n── 12. .transform() ──');
{
  const ctx = createContext();
  ctx.num = ctx.regex(/[0-9]+/).transform((v: string) => parseInt(v, 10));
  const r = parse(ctx.num, '42');
  assert('value is number 42', r.success && r.value === 42);
}

// ── 13. Self-referential ──
console.log('\n── 13. Self-referential (recursive) ──');
{
  const ctx = createContext();
  ctx.num = ctx.regex(/[0-9]+/);
  ctx.expr = ctx.Any(
    ctx.Array(ctx.num.bind(ctx.left), ' + ', ctx.expr.bind(ctx.right)),
    ctx.num.bind(ctx.value)
  );
  const r = parse(ctx.expr, '1 + 2 + 3');
  assert('parses chain', r.success);
  assert('value[0] = "1"', r.value?.[0] === '1');
  assert('value[1] = " + "', r.value?.[1] === ' + ');
}

// ── 14. Full STATEMENT grammar ──
console.log('\n── 14. STATEMENT grammar (indentation-aware) ──');
{
  const ctx = createContext();
  ctx.empty_line = ctx.regex(/[ \t]*\n/);

  ctx.statement = ctx.Array(
    ctx.empty_line[``],
    ctx.arbitrary.bind(ctx.content),
    ctx.Any(';', '\n', ctx.end),
    ctx.Array(
      ctx.empty_line[``],
      ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
      ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.added),
      ctx.statement.with(
        (scope: Scope) => ({ ...scope, indent: scope.indent + scope.added.count })
      )
    )[``].bind(ctx.children)
  );

  ctx.program = ctx.statement[``].bind(ctx.statements);

  const input = `hello
  world
    deep
  sibling
bye
`;

  const r = parse(ctx.program, input, { indent: 0 });
  assert('parses', r.success);
  assert('all consumed', r.consumed === input.length);

  console.log(JSON.stringify(r.scope, null, 2))
  console.log(ctx.program[_matcher] instanceof Token)
  const stmts = r.scope.statements;
  assert('2 roots', Array.isArray(stmts) && stmts.length === 2);

  if (stmts?.length >= 1) {
    const [_e, content, _t, children] = stmts[0];
    assert('first = "hello"', content === 'hello');
    assert('2 children', children?.length === 2);
    if (children?.length >= 1) {
      const [_a, _b, _c, childStmt] = children[0];
      const [_d, childContent, _e2, grandchildren] = childStmt;
      assert('child "world"', childContent === 'world');
      assert('1 grandchild "deep"', grandchildren?.length === 1);
    }
  }

  assert('statements has value structure', Array.isArray(r.scope.statements));
  if (stmts?.length >= 2) {
    assert('stmt[1] content via value = "bye"', stmts[1][1] === 'bye');
  }
}

// ── 15. Callback form of Array ──
console.log('\n── 15. Callback Array ──');
{
  const ctx = createContext();
  ctx.pair = ctx.Array((c: any) => [c.regex(/\w+/).bind('a'), ':', c.regex(/\w+/).bind('b')]);
  const r = parse(ctx.pair, 'key:val');
  assert('parses', r.success);
  assert('a=key', r.scope.a === 'key');
  assert('b=val', r.scope.b === 'val');
}

// ── 16. Nested scope isolation ──
console.log('\n── 16. Nested scope: inner sees outer, outer sees accumulated ──');
{
  const ctx = createContext();
  ctx.list = ctx.Array(
    ctx.regex(/\w+/).bind('prefix'),
    ':',
    ctx.Array(ctx.regex(/\w+/).bind('item'), ctx.Any(',', ctx.end))[``].bind('items')
  );
  const r = parse(ctx.list, 'colors:red,blue,green');
  assert('parses', r.success);
  assert('prefix="colors"', r.scope.prefix === 'colors');
  assert('items is array', Array.isArray(r.scope.items));
  assert('3 items', r.scope.items?.length === 3);
  assert('item accumulated', Array.isArray(r.scope.item));
  assert('item = [red,blue,green]', r.scope.item?.join(',') === 'red,blue,green');
}

// ── 17. RULE_NAME with PROPERTIES grammar ──
console.log('\n── 17. RULE_NAME with PROPERTIES grammar ──');
{
  const ctx = createContext();
  ctx.empty_line = ctx.regex(/[ \t]*\n/);

  const RULE_NAME = ctx.Array(ctx.not(' ')[``], '{', ctx.Expression, '}', ctx.not(' ')[``])[``]
  const RULE_ONLINE_BODY = ctx.Any(
    ctx.Array(ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1), ctx.Any(ctx.Array('(', ctx.val(' ')[``], ')').bind(ctx.parenthesis), ctx.val('=>')), ctx.statement.optional),
    ctx.Array(ctx.val(' ')[``], ctx.end)
  )
  ctx.PROPERTIES = ctx.Array(
    ctx.Array(
      ctx.Any(
        RULE_NAME.bind(ctx.property_name),
        ctx.not('\n')
      ),
      ctx.Any(' & ', ' | ').optional
    )[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.properties),
    RULE_ONLINE_BODY.bind(ctx.property_body)
  )

  ctx.statement = ctx.Array(
    ctx.empty_line[``],
    ctx.PROPERTIES.bind(ctx.content),
    ctx.Any(';', '\n', ctx.end),
    ctx.Array(
      ctx.empty_line[``],
      ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
      ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.added),
      ctx.statement.with(
        (scope: Scope) => ({...scope, indent: scope.indent + scope.added.count})
      )
    )[``].bind(ctx.children)
  );

  ctx.Expression = ctx.statement[``].bind(ctx.statements);

  // Test: simple line without RULE_NAME
  const r1 = parse(ctx.statement, 'hello\n', { indent: 0 });
  assert('simple line parses', r1.success);

  // Test: RULE_NAME should match
  const r2 = parse(ctx.statement, 'property{test: String}\n', { indent: 0 });
  assert('RULE_NAME line parses', r2.success);
  console.log('    r2.scope.content:', JSON.stringify(r2.scope.content, null, 2));
  assert('property_name bound', r2.scope.content?.property_name != null);

  // Test: RULE_NAME with arrow body
  const r3 = parse(ctx.statement, 'property{test: String} => body\n', { indent: 0 });
  assert('RULE_NAME with => parses', r3.success);

  // Test: RULE_NAME with parenthesized body
  const r4 = parse(ctx.statement, 'property{test: String} () => body\n', { indent: 0 });
  assert('RULE_NAME with () => parses', r4.success);
}

console.log('\n' + '═'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));