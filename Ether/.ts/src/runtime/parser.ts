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

type DelimAnchor = { opener: string; closer: string; anchorPos: number };

type MatchContext = {
  input: string;
  index: number;
  boundaries: Token[];
  iterationBoundaries?: Token[];
  suppressIterBoundaries?: boolean;
  preceding?: string;
  scope: Scope;
  hardBoundaries?: Token[];
  delimAnchors?: DelimAnchor[];
};

const FAIL: MatchResult = Object.freeze({ success: false, consumed: 0, value: null, scope: {} });
const _emptyBounds: Token[] = [];
const _emptyScope: Scope = {};
const _perIterationScopes = Symbol('perIterationScopes');
const _perIterationMatches = Symbol('perIterationMatches');
const _emptyResult: MatchResult = Object.freeze({ success: true, consumed: 0, value: '', scope: _emptyScope });

// Paired delimiter map: opener → closer
const _pairedDelims: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const _closerToOpener: Record<string, string> = { '}': '{', ')': '(', ']': '[' };

// ════════════════════════════════════════════════════════════
// Boundary helpers — fast path for StringToken
// ════════════════════════════════════════════════════════════

/** Check if any boundary token can start at a specific position */
function _boundaryAt(input: string, boundaries: Token[], pos: number, ctx: MatchContext): boolean {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (b instanceof StringToken) {
      const strs = b.strings;
      for (let j = 0; j < strs.length; j++) {
        if (input.startsWith(strs[j], pos)) return true;
      }
    } else {
      if (b.canStartAt({ input, index: pos, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, hardBoundaries: ctx.hardBoundaries, delimAnchors: ctx.delimAnchors })) return true;
    }
  }
  return false;
}

/** Check if any boundary token can start within range [start, end) */
function _boundaryInRange(input: string, boundaries: Token[], start: number, end: number, ctx: MatchContext): boolean {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (b instanceof StringToken) {
      const strs = b.strings;
      for (let j = 0; j < strs.length; j++) {
        const idx = input.indexOf(strs[j], start);
        if (idx >= 0 && idx < end) return true;
      }
    } else {
      for (let pos = start; pos < end; pos++) {
        if (b.canStartAt({ input, index: pos, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, preceding: input.substring(start, pos), delimAnchors: ctx.delimAnchors })) return true;
      }
    }
  }
  return false;
}

/** Find earliest position where any StringToken boundary starts (or -1) */
function _firstStringBoundary(input: string, boundaries: Token[], start: number, end: number): number {
  let earliest = -1;
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (b instanceof StringToken) {
      const strs = b.strings;
      for (let j = 0; j < strs.length; j++) {
        const idx = input.indexOf(strs[j], start);
        if (idx >= 0 && idx < end) {
          if (earliest < 0 || idx < earliest) earliest = idx;
        }
      }
    }
  }
  return earliest;
}

// ════════════════════════════════════════════════════════════
// Token (internal engine)
// ════════════════════════════════════════════════════════════

abstract class Token {
  protected bindName?: string;
  private _fc: Token[] | undefined;  // cached first concrete
  private _ap: Token[] | undefined;  // cached all possible

  bindTo(name: string): this {
    this.bindName = name;
    return this;
  }

  abstract match(ctx: MatchContext): MatchResult;
  abstract canStartAt(ctx: MatchContext): boolean;
  protected abstract computeFirst(): Token[];

  getFirstConcreteTokens(): Token[] {
    let r = this._fc;
    if (r === undefined) { r = this.computeFirst(); this._fc = r; }
    return r;
  }

  protected computeAll(): Token[] {
    return this.computeFirst();
  }

  getAllPossibleStartTokens(): Token[] {
    let r = this._ap;
    if (r === undefined) { r = this.computeAll(); this._ap = r; }
    return r;
  }

  protected wrapResult(result: MatchResult, input?: string, startIndex?: number): MatchResult {
    if (!result.success) return result;
    if (this.bindName) {
      const childScope = result.scope;
      const perIter = childScope[_perIterationScopes] as Scope[] | undefined;

      if (perIter && Array.isArray(result.value)) {
        // Loop result with per-iteration scopes: create {_match, entries: [...]} with per-entry nesting
        const perIterMatch = childScope[_perIterationMatches] as string[] | undefined;
        const nested = perIter.map((iterScope, i) => {
          const keys = Object.keys(iterScope);
          const matchStr = perIterMatch?.[i];
          if (keys.length === 0) return result.value[i];
          return { _value: result.value[i], _match: matchStr, ...iterScope };
        });
        const _match = input != null && startIndex != null ? input.substring(startIndex, startIndex + result.consumed) : undefined;
        return { success: true, consumed: result.consumed, value: result.value, scope: { [this.bindName]: { _match, entries: nested } } };
      }

      // Non-loop: check if child scope has keys (excluding symbols)
      const childKeys = Object.keys(childScope);
      if (childKeys.length > 0) {
        // Nest child scope under the bind name
        const _match = input != null && startIndex != null ? input.substring(startIndex, startIndex + result.consumed) : undefined;
        return { success: true, consumed: result.consumed, value: result.value, scope: { [this.bindName]: { _value: result.value, _match, ...childScope } } };
      }

      // No child scope: simple binding
      const scope = { [this.bindName]: result.value };
      return { success: true, consumed: result.consumed, value: result.value, scope };
    }
    return result;
  }
}

// ── Literals ──

class StringToken extends Token {
  strings: string[];
  constructor(strings: string[]) {
    super();
    this.strings = [...strings].sort((a, b) => b.length - a.length);
  }
  protected computeFirst() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    const strs = this.strings, input = ctx.input, idx = ctx.index;
    for (let i = 0; i < strs.length; i++) {
      if (input.startsWith(strs[i], idx)) return true;
    }
    return false;
  }
  match(ctx: MatchContext): MatchResult {
    const strs = this.strings, input = ctx.input, idx = ctx.index;
    for (let i = 0; i < strs.length; i++) {
      const s = strs[i];
      if (input.startsWith(s, idx))
        return this.wrapResult({ success: true, consumed: s.length, value: s, scope: _emptyScope }, input, idx);
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
  protected computeFirst() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    this.pattern.lastIndex = ctx.index;
    return this.pattern.test(ctx.input);
  }
  match(ctx: MatchContext): MatchResult {
    this.pattern.lastIndex = ctx.index;
    const m = this.pattern.exec(ctx.input);
    if (m) return this.wrapResult({ success: true, consumed: m[0].length, value: m[0], scope: _emptyScope }, ctx.input, ctx.index);
    return FAIL;
  }
}

class EndToken extends Token {
  protected computeFirst() { return [this as Token]; }
  private _check(ctx: MatchContext): boolean {
    if (ctx.index >= ctx.input.length) return true;
    const input = ctx.input, idx = ctx.index;
    const b = ctx.boundaries, ib = ctx.iterationBoundaries, hb = ctx.hardBoundaries;
    if (b && b.length > 0) {
      for (let i = 0; i < b.length; i++) {
        const t = b[i];
        if (t instanceof StringToken) {
          const strs = t.strings;
          for (let j = 0; j < strs.length; j++) if (input.startsWith(strs[j], idx)) return true;
        } else {
          if (t.canStartAt({ input, index: idx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, preceding: '', delimAnchors: ctx.delimAnchors })) return true;
        }
      }
    }
    if (ib && ib.length > 0) {
      for (let i = 0; i < ib.length; i++) {
        const t = ib[i];
        if (t instanceof StringToken) {
          const strs = t.strings;
          for (let j = 0; j < strs.length; j++) if (input.startsWith(strs[j], idx)) return true;
        } else {
          if (t.canStartAt({ input, index: idx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, preceding: '', delimAnchors: ctx.delimAnchors })) return true;
        }
      }
    }
    if (hb && hb.length > 0) {
      for (let i = 0; i < hb.length; i++) {
        const t = hb[i];
        if (t instanceof StringToken) {
          const strs = t.strings;
          for (let j = 0; j < strs.length; j++) if (input.startsWith(strs[j], idx)) return true;
        } else {
          if (t.canStartAt({ input, index: idx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, preceding: '', delimAnchors: ctx.delimAnchors })) return true;
        }
      }
    }
    return false;
  }
  canStartAt(ctx: MatchContext) { return this._check(ctx); }
  match(ctx: MatchContext): MatchResult {
    if (this._check(ctx))
      return this.wrapResult(_emptyResult, ctx.input, ctx.index);
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
  protected computeFirst(): Token[] { return []; }
  canStartAt(ctx: MatchContext) {
    if (ctx.index >= ctx.input.length) return false;
    const input = ctx.input, idx = ctx.index;
    if (ctx.hardBoundaries && ctx.hardBoundaries.length > 0) {
      if (_boundaryAt(input, ctx.hardBoundaries, idx, ctx)) return false;
    }
    const strs = this.stopStrings;
    for (let i = 0; i < strs.length; i++) {
      if (input.startsWith(strs[i], idx)) return false;
    }
    return true;
  }
  match(ctx: MatchContext): MatchResult {
    const input = ctx.input, startIdx = ctx.index;
    if (startIdx >= input.length) return FAIL;
    const hardBounds = ctx.hardBoundaries;
    if (hardBounds && hardBounds.length > 0) {
      if (_boundaryAt(input, hardBounds, startIdx, ctx)) return FAIL;
    }
    const remLen = input.length - startIdx;
    const stopStrs = this.stopStrings;
    const bounds = ctx.boundaries;
    const iterBounds = ctx.iterationBoundaries;
    const hasBounds = (bounds && bounds.length > 0) || (iterBounds && iterBounds.length > 0);
    const hasHard = hardBounds != null && hardBounds.length > 0;

    // Fast path: all boundaries + hard boundaries are StringTokens → use indexOf
    if (this._canUseFastScan(bounds, iterBounds, hardBounds)) {
      return this._fastScan(input, startIdx, remLen, stopStrs, bounds!, iterBounds, hardBounds);
    }

    // Slow path: per-position scanning with non-StringToken boundaries
    const allBounds = hasBounds ? [...(bounds || _emptyBounds), ...(iterBounds || _emptyBounds)] : _emptyBounds;
    const hardB = hardBounds || _emptyBounds;
    let testCtx: MatchContext | null = null;

    for (let i = 0; i <= remLen; i++) {
      const absIdx = startIdx + i;
      if (hasHard && i > 0) {
        let hit = false;
        for (let k = 0; k < hardB.length; k++) {
          const b = hardB[k];
          if (b instanceof StringToken) {
            const strs = b.strings;
            for (let j = 0; j < strs.length; j++) { if (input.startsWith(strs[j], absIdx)) { hit = true; break; } }
          } else {
            if (!testCtx) testCtx = { input, index: absIdx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, hardBoundaries: undefined, preceding: input.substring(startIdx, absIdx), scope: ctx.scope, delimAnchors: ctx.delimAnchors };
            else { testCtx.index = absIdx; testCtx.preceding = input.substring(startIdx, absIdx); }
            if (b.canStartAt(testCtx)) hit = true;
          }
          if (hit) break;
        }
        if (hit) return this.wrapResult({ success: true, consumed: i, value: input.substring(startIdx, absIdx), scope: _emptyScope }, input, startIdx);
      }
      if (allBounds.length > 0 && i > 0) {
        let hit = false;
        for (let k = 0; k < allBounds.length; k++) {
          const b = allBounds[k];
          if (b instanceof StringToken) {
            const strs = b.strings;
            for (let j = 0; j < strs.length; j++) { if (input.startsWith(strs[j], absIdx)) { hit = true; break; } }
          } else {
            if (!testCtx) testCtx = { input, index: absIdx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, hardBoundaries: undefined, preceding: input.substring(startIdx, absIdx), scope: ctx.scope, delimAnchors: ctx.delimAnchors };
            else { testCtx.index = absIdx; testCtx.preceding = input.substring(startIdx, absIdx); testCtx.hardBoundaries = undefined; }
            if (b.canStartAt(testCtx)) hit = true;
          }
          if (hit) break;
        }
        if (hit) return this.wrapResult({ success: true, consumed: i, value: input.substring(startIdx, absIdx), scope: _emptyScope }, input, startIdx);
      }
      if (i < remLen) {
        for (let k = 0; k < stopStrs.length; k++) {
          if (input.startsWith(stopStrs[k], absIdx)) return FAIL;
        }
      }
    }
    if (remLen === 0) return FAIL;
    return this.wrapResult({ success: true, consumed: remLen, value: input.substring(startIdx), scope: _emptyScope }, input, startIdx);
  }

  /** Check if all boundaries are StringTokens (fast path possible) */
  private _canUseFastScan(bounds: Token[] | undefined, iterBounds: Token[] | undefined, hardBounds: Token[] | undefined): boolean {
    if (bounds) for (let i = 0; i < bounds.length; i++) if (!(bounds[i] instanceof StringToken)) return false;
    if (iterBounds) for (let i = 0; i < iterBounds.length; i++) if (!(iterBounds[i] instanceof StringToken)) return false;
    if (hardBounds) for (let i = 0; i < hardBounds.length; i++) if (!(hardBounds[i] instanceof StringToken)) return false;
    return true;
  }

  /** indexOf-based scan when all boundaries are StringTokens */
  private _fastScan(input: string, startIdx: number, remLen: number, stopStrs: string[],
    bounds: Token[], iterBounds: Token[] | undefined, hardBounds: Token[] | undefined): MatchResult {
    // Find earliest stop string
    let earliestStop = -1;
    for (let i = 0; i < stopStrs.length; i++) {
      const idx = input.indexOf(stopStrs[i], startIdx);
      if (idx >= 0 && (earliestStop < 0 || idx < earliestStop)) earliestStop = idx;
    }
    // Find earliest boundary (must be > startIdx, i.e. i > 0)
    let earliestBound = -1;
    const end = startIdx + remLen;
    const allGroups = [bounds, iterBounds, hardBounds];
    for (let g = 0; g < 3; g++) {
      const group = allGroups[g];
      if (!group || group.length === 0) continue;
      for (let i = 0; i < group.length; i++) {
        const b = group[i] as StringToken;
        const strs = b.strings;
        for (let j = 0; j < strs.length; j++) {
          let idx = input.indexOf(strs[j], startIdx);
          // Must be at i > 0, so skip exact startIdx position
          if (idx === startIdx) idx = input.indexOf(strs[j], startIdx + 1);
          if (idx >= 0 && idx <= end) {
            if (earliestBound < 0 || idx < earliestBound) earliestBound = idx;
          }
        }
      }
    }

    // Determine outcome
    if (earliestBound >= 0 && (earliestStop < 0 || earliestBound <= earliestStop)) {
      // Boundary comes first or tie → SUCCESS
      const consumed = earliestBound - startIdx;
      return this.wrapResult({ success: true, consumed, value: input.substring(startIdx, earliestBound), scope: _emptyScope }, input, startIdx);
    }
    if (earliestStop >= 0) {
      // Stop string comes first → FAIL
      return FAIL;
    }
    // Neither found → consume all
    if (remLen === 0) return FAIL;
    return this.wrapResult({ success: true, consumed: remLen, value: input.substring(startIdx), scope: _emptyScope }, input, startIdx);
  }
}

// ── Arbitrary ──

class ArbitraryToken extends Token {
  protected computeFirst(): Token[] { return []; }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const input = ctx.input, startIdx = ctx.index;
    const remLen = input.length - startIdx;
    const bounds = ctx.boundaries;
    const iterBounds = ctx.iterationBoundaries;
    const hasBounds = (bounds && bounds.length > 0) || (iterBounds && iterBounds.length > 0);
    if (!hasBounds)
      return this.wrapResult({ success: true, consumed: remLen, value: input.substring(startIdx), scope: _emptyScope }, input, startIdx);

    const all = [...(bounds || _emptyBounds), ...(iterBounds || _emptyBounds)];
    let testCtx: MatchContext | null = null;
    for (let i = 0; i <= remLen; i++) {
      const absIdx = startIdx + i;
      let hit = false;
      for (let k = 0; k < all.length; k++) {
        const b = all[k];
        if (b instanceof StringToken) {
          const strs = b.strings;
          for (let j = 0; j < strs.length; j++) { if (input.startsWith(strs[j], absIdx)) { hit = true; break; } }
        } else {
          if (!testCtx) testCtx = { input, index: absIdx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, scope: ctx.scope, preceding: input.substring(startIdx, absIdx), delimAnchors: ctx.delimAnchors };
          else { testCtx.index = absIdx; testCtx.preceding = input.substring(startIdx, absIdx); }
          if (b.canStartAt(testCtx)) hit = true;
        }
        if (hit) break;
      }
      if (hit)
        return this.wrapResult({ success: true, consumed: i, value: input.substring(startIdx, absIdx), scope: _emptyScope }, input, startIdx);
    }
    return this.wrapResult({ success: true, consumed: remLen, value: input.substring(startIdx), scope: _emptyScope }, input, startIdx);
  }
}

// ── DepthAwareBoundary (paired delimiter boundary) ──

class DepthAwareBoundaryToken extends Token {
  constructor(public opener: string, public closer: string) { super(); }
  protected computeFirst() { return [this as Token]; }
  canStartAt(ctx: MatchContext): boolean {
    if (!ctx.input.startsWith(this.closer, ctx.index)) return false;
    const anchors = ctx.delimAnchors;
    if (!anchors || anchors.length === 0) return true;
    // Find the most recent anchor for this closer
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (anchors[i].closer === this.closer) {
        let depth = 0;
        const input = ctx.input;
        for (let pos = anchors[i].anchorPos; pos < ctx.index; pos++) {
          if (input.startsWith(this.opener, pos)) depth++;
          if (input.startsWith(this.closer, pos)) depth--;
        }
        return depth <= 0;
      }
    }
    return true; // No anchor for this closer → fire normally
  }
  match(ctx: MatchContext): MatchResult {
    if (this.canStartAt(ctx))
      return this.wrapResult({ success: true, consumed: this.closer.length, value: this.closer, scope: _emptyScope }, ctx.input, ctx.index);
    return FAIL;
  }
}

// ── Array (sequence) — creates child scope ──

class ArrayToken extends Token {
  private _precomputedBounds: (Token[] | null)[] | null = null;

  constructor(public items: Token[]) { super(); }
  protected computeFirst() {
    const result: Token[] = [];
    for (const t of this.items) {
      const f = t.getFirstConcreteTokens();
      result.push(...f);
      if (f.length > 0) break;
    }
    return result;
  }
  protected computeAll() {
    const result: Token[] = [];
    for (const t of this.items) {
      result.push(...t.getAllPossibleStartTokens());
      if (t.getFirstConcreteTokens().length > 0) break;
    }
    return result;
  }
  canStartAt(ctx: MatchContext) {
    if (this.items.length === 0) return true;
    for (let i = 0; i < this.items.length; i++) {
      const t = this.items[i];
      const f = t.getFirstConcreteTokens();
      if (f.length > 0) {
        if (!t.canStartAt(ctx)) return false;
        // Two-item lookahead: match first concrete, check second can follow
        for (let j = i + 1; j < this.items.length; j++) {
          if (this.items[j].getFirstConcreteTokens().length > 0) {
            const r = t.match(ctx);
            if (!r.success) return false;
            return this.items[j].canStartAt({ ...ctx, index: ctx.index + r.consumed });
          }
        }
        return true;
      }
      // Transparent item: skip to find first concrete
    }
    return true; // all items transparent
  }

  /** Pre-compute per-item boundary tokens (from remaining siblings) */
  private _getBounds(): (Token[] | null)[] {
    if (this._precomputedBounds) return this._precomputedBounds;
    const items = this.items, n = items.length;
    // Pre-compute which items are opener delimiters (for depth-aware boundaries)
    const openerPositions: Map<string, number> = new Map();
    for (let k = 0; k < n; k++) {
      if (items[k] instanceof StringToken) {
        const strs = (items[k] as StringToken).strings;
        if (strs.length === 1 && strs[0] in _pairedDelims) {
          openerPositions.set(_pairedDelims[strs[0]], k);
        }
      }
    }
    const arr: (Token[] | null)[] = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i === n - 1) {
        arr[i] = null; // last item uses parent boundaries directly
      } else {
        const rb: Token[] = [];
        for (let j = i + 1; j < n; j++) {
          if (items[j].getFirstConcreteTokens().length > 0) {
            // Check if this is a closing delimiter with a matching opener before item i
            const item = items[j];
            if (item instanceof StringToken && item.strings.length === 1) {
              const closerStr = item.strings[0];
              const openerIdx = openerPositions.get(closerStr);
              if (openerIdx !== undefined && openerIdx < i) {
                // Paired delimiter: use depth-aware boundary
                rb.push(new DepthAwareBoundaryToken(_closerToOpener[closerStr], closerStr));
                break;
              }
            }
            // Concrete sibling: push full token to preserve structural info
            rb.push(item);
            break;
          } else {
            // Transparent sibling: decompose into start tokens
            rb.push(...items[j].getAllPossibleStartTokens());
          }
        }
        arr[i] = rb.length > 0 ? rb : null;
      }
    }
    this._precomputedBounds = arr;
    return arr;
  }

  match(ctx: MatchContext): MatchResult {
    let totalConsumed = 0;
    const values: any[] = [];
    let childScope: Scope = { ...ctx.scope };
    let currentIndex = ctx.index;
    const items = this.items, itemLen = items.length;
    const precomputed = this._getBounds();
    let delimAnchors = ctx.delimAnchors;

    for (let i = 0; i < itemLen; i++) {
      const rb = precomputed[i];
      const boundaries = rb ? [...rb, ...ctx.boundaries] : ctx.boundaries;

      const result = items[i].match({
        input: ctx.input, index: currentIndex,
        boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: childScope,
        hardBoundaries: ctx.hardBoundaries,
        delimAnchors,
      });

      if (!result.success) return FAIL;
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      // Only spread scope if there are actual bindings
      const rScope = result.scope;
      if (rScope !== _emptyScope) {
        const keys = Object.keys(rScope);
        if (keys.length > 0) {
          childScope = { ...childScope, ...rScope };
        }
      }
      // After matching an opener delimiter, push anchor for depth-aware boundary
      if (result.success && items[i] instanceof StringToken) {
        const strs = (items[i] as StringToken).strings;
        if (strs.length === 1 && strs[0] in _pairedDelims) {
          const closer = _pairedDelims[strs[0]];
          delimAnchors = [...(delimAnchors || []), { opener: strs[0], closer, anchorPos: currentIndex }];
        }
      }
    }

    // Return delta: only keys that weren't in the original parent scope
    const delta: Scope = {};
    let hasDelta = false;
    const cKeys = Object.keys(childScope);
    for (let i = 0; i < cKeys.length; i++) {
      const key = cKeys[i];
      if (!(key in ctx.scope) || childScope[key] !== ctx.scope[key]) {
        delta[key] = childScope[key];
        hasDelta = true;
      }
    }
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope: hasDelta ? delta : _emptyScope }, ctx.input, ctx.index);
  }
}

// ── Loop — accumulates child bindings as arrays ──

class LoopToken extends Token {
  private _inner?: Token;
  constructor(public items: Token[], public minCount: number = 0) { super(); }
  private get inner(): Token {
    if (!this._inner) this._inner = this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
    return this._inner;
  }
  protected computeFirst() {
    if (this.minCount === 0) return [];
    return this.inner.getFirstConcreteTokens();
  }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) {
    if (this.minCount === 0) return true;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    const accumulated: Record<string, any[]> = {};
    const perIterScopes: Scope[] = [];
    const perIterMatches: string[] = [];
    let currentIndex = ctx.index;
    let iterations = 0;
    const input = ctx.input;

    const iterationStarts = ctx.suppressIterBoundaries
      ? _emptyBounds : inner.getAllPossibleStartTokens();
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || _emptyBounds)];

    const hasBoundaries = ctx.boundaries.length > 0;
    let retryHardBounds: Token[] | undefined;
    const isTransparentInner = inner.getFirstConcreteTokens().length === 0;
    const innerCtx: MatchContext = {
      input, index: currentIndex,
      boundaries: _emptyBounds,
      iterationBoundaries: mergedIterBounds,
      suppressIterBoundaries: ctx.suppressIterBoundaries,
      scope: ctx.scope,
      hardBoundaries: ctx.hardBoundaries,
      delimAnchors: ctx.delimAnchors,
    };

    const _finish = () => {
      const scope: any = { ...accumulated };
      scope[_perIterationScopes] = perIterScopes;
      scope[_perIterationMatches] = perIterMatches;
      return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope }, ctx.input, ctx.index);
    };

    while (true) {
      innerCtx.index = currentIndex;
      innerCtx.hardBoundaries = ctx.hardBoundaries;
      const result = inner.match(innerCtx);

      if (result.success && result.consumed > 0) {
        let useResult = result;
        if (hasBoundaries) {
          if (_boundaryInRange(input, ctx.boundaries, currentIndex, currentIndex + result.consumed, ctx)) {
            if (!retryHardBounds) retryHardBounds = [...(ctx.hardBoundaries || _emptyBounds), ...ctx.boundaries];
            innerCtx.hardBoundaries = retryHardBounds;
            innerCtx.index = currentIndex;
            const retryResult = inner.match(innerCtx);
            if (retryResult.success && retryResult.consumed > 0) {
              if (!_boundaryInRange(input, ctx.boundaries, currentIndex, currentIndex + retryResult.consumed, ctx)) {
                useResult = retryResult;
              } else { break; }
            } else { break; }
          }
        }

        perIterMatches.push(input.substring(currentIndex, currentIndex + useResult.consumed));
        totalConsumed += useResult.consumed;
        currentIndex += useResult.consumed;
        values.push(useResult.value);
        const rScope = useResult.scope;
        if (rScope !== _emptyScope) {
          const keys = Object.keys(rScope);
          const iterScope: Scope = {};
          for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (!(key in accumulated)) accumulated[key] = [];
            accumulated[key].push(rScope[key]);
            iterScope[key] = rScope[key];
          }
          perIterScopes.push(iterScope);
        } else {
          perIterScopes.push(_emptyScope);
        }
        iterations++;

        if (iterations >= this.minCount && isTransparentInner && hasBoundaries) {
          if (_boundaryAt(input, ctx.boundaries, currentIndex, ctx)) {
            return _finish();
          }
        }
        continue;
      }

      if (iterations >= this.minCount) {
        if (_boundaryAt(input, ctx.boundaries, currentIndex, ctx)) {
          return _finish();
        }
        if (currentIndex >= input.length)
          return _finish();
      }
      break;
    }

    if (iterations < this.minCount) return FAIL;
    return _finish();
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
  private _inner?: Token;
  constructor(public items: Token[], public count: CountSpec) { super(); }
  private get inner(): Token {
    if (!this._inner) this._inner = this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
    return this._inner;
  }
  protected computeFirst() {
    if (typeof this.count === 'number' && this.count === 0) return [];
    if (typeof this.count !== 'number') return [];
    return this.inner.getFirstConcreteTokens();
  }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
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
    const accumulated: Record<string, any[]> = {};
    const perIterScopes: Scope[] = [];
    const perIterMatches: string[] = [];
    let currentIndex = ctx.index;

    for (let i = 0; i < n; i++) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: ctx.boundaries,
        iterationBoundaries: ctx.iterationBoundaries,
        scope: ctx.scope,
        hardBoundaries: ctx.hardBoundaries,
        delimAnchors: ctx.delimAnchors,
      });
      if (!result.success) return FAIL;
      perIterMatches.push(ctx.input.substring(currentIndex, currentIndex + result.consumed));
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      const rScope = result.scope;
      if (rScope !== _emptyScope) {
        const keys = Object.keys(rScope);
        const iterScope: Scope = {};
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (!(key in accumulated)) accumulated[key] = [];
          accumulated[key].push(rScope[key]);
          iterScope[key] = rScope[key];
        }
        perIterScopes.push(iterScope);
      } else {
        perIterScopes.push(_emptyScope);
      }
    }
    const scope: any = { ...accumulated };
    scope[_perIterationScopes] = perIterScopes;
    scope[_perIterationMatches] = perIterMatches;
    return this.wrapResult({ success: true, consumed: totalConsumed, value: values, scope }, ctx.input, ctx.index);
  }
}

class TimesAtLeastToken extends Token {
  private _inner?: Token;
  constructor(public items: Token[], public min: CountSpec) { super(); }
  private get inner(): Token {
    if (!this._inner) this._inner = this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
    return this._inner;
  }
  protected computeFirst() {
    if (typeof this.min === 'number' && this.min === 0) return [];
    if (typeof this.min !== 'number') return [];
    return this.inner.getFirstConcreteTokens();
  }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
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
    const accumulated: Record<string, any[]> = {};
    const perIterScopes: Scope[] = [];
    const perIterMatches: string[] = [];
    let currentIndex = ctx.index;
    let iterations = 0;

    const iterationStarts = ctx.suppressIterBoundaries
      ? _emptyBounds : inner.getAllPossibleStartTokens();
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || _emptyBounds)];

    while (true) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: _emptyBounds,
        iterationBoundaries: mergedIterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
        hardBoundaries: ctx.hardBoundaries,
        delimAnchors: ctx.delimAnchors,
      });
      if (!result.success || result.consumed === 0) break;
      perIterMatches.push(ctx.input.substring(currentIndex, currentIndex + result.consumed));
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      const rScope = result.scope;
      if (rScope !== _emptyScope) {
        const keys = Object.keys(rScope);
        const iterScope: Scope = {};
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (!(key in accumulated)) accumulated[key] = [];
          accumulated[key].push(rScope[key]);
          iterScope[key] = rScope[key];
        }
        perIterScopes.push(iterScope);
      } else {
        perIterScopes.push(_emptyScope);
      }
      iterations++;
    }

    if (iterations < min) return FAIL;
    const scope: any = { ...accumulated };
    scope[_perIterationScopes] = perIterScopes;
    scope[_perIterationMatches] = perIterMatches;
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, scope,
    }, ctx.input, ctx.index);
  }
}

class TimesAtMostToken extends Token {
  private _inner?: Token;
  constructor(public items: Token[], public max: CountSpec) { super(); }
  private get inner(): Token {
    if (!this._inner) this._inner = this.items.length === 1 ? this.items[0] : new ArrayToken(this.items);
    return this._inner;
  }
  protected computeFirst(): Token[] { return []; }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const max = resolveCount(this.max, ctx);
    const inner = this.inner;
    let totalConsumed = 0;
    const values: any[] = [];
    const accumulated: Record<string, any[]> = {};
    const perIterScopes: Scope[] = [];
    const perIterMatches: string[] = [];
    let currentIndex = ctx.index;
    let iterations = 0;

    const iterationStarts = ctx.suppressIterBoundaries
      ? _emptyBounds : inner.getAllPossibleStartTokens();
    const mergedIterBounds = [...iterationStarts, ...ctx.boundaries, ...(ctx.iterationBoundaries || _emptyBounds)];

    while (iterations < max) {
      const result = inner.match({
        input: ctx.input, index: currentIndex,
        boundaries: _emptyBounds,
        iterationBoundaries: mergedIterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
        hardBoundaries: ctx.hardBoundaries,
        delimAnchors: ctx.delimAnchors,
      });
      if (!result.success || result.consumed === 0) break;
      perIterMatches.push(ctx.input.substring(currentIndex, currentIndex + result.consumed));
      totalConsumed += result.consumed;
      currentIndex += result.consumed;
      values.push(result.value);
      const rScope = result.scope;
      if (rScope !== _emptyScope) {
        const keys = Object.keys(rScope);
        const iterScope: Scope = {};
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (!(key in accumulated)) accumulated[key] = [];
          accumulated[key].push(rScope[key]);
          iterScope[key] = rScope[key];
        }
        perIterScopes.push(iterScope);
      } else {
        perIterScopes.push(_emptyScope);
      }
      iterations++;
    }
    const scope: any = { ...accumulated };
    scope[_perIterationScopes] = perIterScopes;
    scope[_perIterationMatches] = perIterMatches;
    return this.wrapResult({
      success: true, consumed: totalConsumed,
      value: { count: iterations, values }, scope,
    }, ctx.input, ctx.index);
  }
}

// ── Any (alternatives) ──

class AnyToken extends Token {
  private _precomputedOthers: Token[][] | null = null;
  constructor(public options: Token[]) { super(); }
  protected computeFirst() {
    const r: Token[] = [];
    for (const t of this.options) r.push(...t.getFirstConcreteTokens());
    return r;
  }
  protected computeAll() {
    const r: Token[] = [];
    for (const t of this.options) r.push(...t.getAllPossibleStartTokens());
    return r;
  }
  canStartAt(ctx: MatchContext) {
    const opts = this.options;
    for (let i = 0; i < opts.length; i++) if (opts[i].canStartAt(ctx)) return true;
    return false;
  }
  /** Pre-compute "other alternatives" boundary tokens for each option */
  private _getOthers(): Token[][] {
    if (this._precomputedOthers) return this._precomputedOthers;
    const opts = this.options, n = opts.length;
    const result: Token[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const others: Token[] = [];
      for (let j = 0; j < n; j++) {
        if (j !== i) others.push(...opts[j].getAllPossibleStartTokens());
      }
      result[i] = others;
    }
    this._precomputedOthers = result;
    return result;
  }
  match(ctx: MatchContext): MatchResult {
    let zeroConsumedResult: MatchResult | null = null;
    const opts = this.options;
    const preOthers = this._getOthers();
    const ctxIterBounds = ctx.iterationBoundaries || _emptyBounds;
    for (let i = 0; i < opts.length; i++) {
      const others = preOthers[i];
      const iterBounds = others.length > 0 ? [...others, ...ctxIterBounds] : ctxIterBounds;
      const result = opts[i].match({
        input: ctx.input, index: ctx.index,
        boundaries: ctx.boundaries,
        iterationBoundaries: iterBounds,
        suppressIterBoundaries: ctx.suppressIterBoundaries,
        scope: ctx.scope,
        hardBoundaries: ctx.hardBoundaries,
        delimAnchors: ctx.delimAnchors,
      });
      if (result.success) {
        if (result.consumed > 0) return this.wrapResult(result, ctx.input, ctx.index);
        if (!zeroConsumedResult) zeroConsumedResult = result;
      }
    }
    if (zeroConsumedResult) return this.wrapResult(zeroConsumedResult, ctx.input, ctx.index);
    return FAIL;
  }
}

// ── Optional ──

class OptionalToken extends Token {
  constructor(public inner: Token) { super(); }
  protected computeFirst(): Token[] { return []; }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt() { return true; }
  match(ctx: MatchContext): MatchResult {
    const result = this.inner.match(ctx);
    if (result.success) return this.wrapResult(result, ctx.input, ctx.index);
    return this.wrapResult({ success: true, consumed: 0, value: null, scope: _emptyScope }, ctx.input, ctx.index);
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
  protected computeFirst() { return this.cached.getFirstConcreteTokens(); }
  protected computeAll() { return this.cached.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.cached.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    DEPTH++;
    const result = this.cached.match({
      input: ctx.input, index: ctx.index,
      boundaries: ctx.boundaries,
      iterationBoundaries: _emptyBounds,
      suppressIterBoundaries: ctx.suppressIterBoundaries,
      scope: ctx.scope,
      hardBoundaries: ctx.hardBoundaries,
      delimAnchors: ctx.delimAnchors,
    });
    DEPTH--;
    return this.wrapResult(result, ctx.input, ctx.index);
  }
}

// ── WithScope (replaces WithParams — sets scope entries for child) ──

class WithScopeToken extends Token {
  constructor(
    public inner: Token,
    public scopeFn: Scope | ((scope: Scope) => Scope)
  ) { super(); }
  protected computeFirst() { return this.inner.getFirstConcreteTokens(); }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    const extra = typeof this.scopeFn === 'function'
      ? this.scopeFn(ctx.scope)
      : this.scopeFn;
    const merged = { ...ctx.scope, ...extra };
    return this.wrapResult(this.inner.match({ ...ctx, scope: merged }), ctx.input, ctx.index);
  }
}

// ── Guard ──

class GuardedToken extends Token {
  constructor(public inner: Token, public guard: (preceding: string) => boolean) { super(); }
  protected computeFirst() { return [this as Token]; }
  protected computeAll() { return [this as Token]; }
  canStartAt(ctx: MatchContext) {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) return false;
    return this.inner.canStartAt(ctx);
  }
  match(ctx: MatchContext): MatchResult {
    if (ctx.preceding !== undefined && this.guard(ctx.preceding)) return FAIL;
    return this.wrapResult(this.inner.match(ctx), ctx.input, ctx.index);
  }
}

// ── Transform ──

class TransformToken extends Token {
  constructor(public inner: Token, public fn: (value: any, scope: Scope) => any) { super(); }
  protected computeFirst() { return this.inner.getFirstConcreteTokens(); }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    const result = this.inner.match(ctx);
    if (!result.success) return result;
    return this.wrapResult({ success: true, consumed: result.consumed, value: this.fn(result.value, result.scope), scope: result.scope }, ctx.input, ctx.index);
  }
}

// ── Isolated (clear boundaries) ──

class IsolatedToken extends Token {
  constructor(public inner: Token) { super(); }
  protected computeFirst() { return this.inner.getFirstConcreteTokens(); }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    return this.wrapResult(this.inner.match({ ...ctx, boundaries: _emptyBounds, iterationBoundaries: _emptyBounds, hardBoundaries: undefined }), ctx.input, ctx.index);
  }
}

// ── NoIterBoundaries ──

class NoIterBoundariesToken extends Token {
  constructor(public inner: Token) { super(); }
  protected computeFirst() { return this.inner.getFirstConcreteTokens(); }
  protected computeAll() { return this.inner.getAllPossibleStartTokens(); }
  canStartAt(ctx: MatchContext) { return this.inner.canStartAt(ctx); }
  match(ctx: MatchContext): MatchResult {
    return this.wrapResult(this.inner.match({
      ...ctx, iterationBoundaries: _emptyBounds, suppressIterBoundaries: true
    }), ctx.input, ctx.index);
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
    input, index: 0, boundaries: _emptyBounds, scope,
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
  _matcher, _name, _perIterationScopes, _perIterationMatches,
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
  const stmtsObj = r.scope.statements;
  assert('statements has _match', typeof stmtsObj._match === 'string');
  const stmts = stmtsObj.entries;
  assert('2 roots', Array.isArray(stmts) && stmts.length === 2);

  if (stmts?.length >= 1) {
    assert('first = "hello"', stmts[0].content === 'hello');
    assert('2 children', stmts[0].children?.entries?.length === 2);
    if (stmts[0].children?.entries?.length >= 1) {
      const child0 = stmts[0].children.entries[0];
      assert('child "world"', child0.content === 'world');
      assert('1 grandchild "deep"', child0.children?.entries?.length === 1);
    }
  }

  assert('statements has entries array', Array.isArray(stmtsObj.entries));
  if (stmts?.length >= 2) {
    assert('stmt[1] content via value = "bye"', stmts[1].content === 'bye');
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
  assert('items has entries', Array.isArray(r.scope.items?.entries));
  assert('items has _match', typeof r.scope.items?._match === 'string');
  assert('3 items', r.scope.items?.entries?.length === 3);
  assert('item not at top level', r.scope.item === undefined);
  assert('item nested in items.entries[0]', r.scope.items?.entries?.[0]?.item === 'red');
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
  assert('property_name nested in content.properties', r2.scope.content?.properties?.property_name != null);

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
