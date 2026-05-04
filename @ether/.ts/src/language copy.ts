import fs from "fs";
import path from "path";
import {is_array, is_function, is_string} from "./lodash.ts";
import {Version} from "./version.ts";
import { Clock, Diagnostics, Cache, DIAGNOSTIC_SEVERITY, instrumented, uninstrumented } from "./diagnostics.ts";
import type { Diagnostic, Instrumentable, InstrumentationCtx } from "./diagnostics.ts";
import { Text } from "./source.ts";

/** Standard lower_bound binary search: returns the first index `i` in
 *  the sorted array `arr` such that `key(arr[i]) >= target`. Returns
 *  `arr.length` if no element satisfies the predicate. Used by
 *  `Node.rewalk` to find the in-range slice in the by-position caches. */
function lowerBound<T>(arr: T[], target: number, key: (t: T) => number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(arr[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// (Text.Source + Diagnostics moved to ./diagnostics.ts — re-exported above.)

/** Atom of a syntax pattern — what the future DSL form `E('{', sub, '}', E())`
 *  will compose. Sub-Expressions are themselves valid atoms (recursive). */
export type ExpressionAtom = string | Node | Expression;
export type TokenHandler = (node: Node) => Node | undefined;

/** A parser expression. Three roles, dispatched by constructor shape:
 *    E(handler)       — the language's parser body. `handle` IS the per-step
 *                       token handler; `iterate` drives it over a parse-root.
 *    E(node)          — bound to an existing parse-root Node, borrowing the
 *                       runtime's registered handler at iterate time. Used by
 *                       callers that want "the expression starting from this
 *                       node" without re-passing the node every step.
 *    E(a1, a2, …)     — DSL pattern composition (the `E(E(), '{', sub, '}')`
 *                       form). Atoms land in `atoms`; builder methods
 *                       (.repeats / .bind / .freeze / .until / …) will hang
 *                       off this Expression once those land in spec.ts. The
 *                       composition path is populate-only today — the builder
 *                       methods aren't wired up yet, but the data shape is
 *                       there so the syntax doesn't need to be changed when
 *                       they arrive.
 *
 *  Owns the read-loop: `iterate(node, past?)` so call sites (parse, rewalk,
 *  any future driver) don't reimplement
 *  `while (!direction.done() && !past()) handle(...)`. */
export class Expression {
  handle?: TokenHandler;
  node?: Node;
  atoms: ExpressionAtom[] = [];

  constructor(...args: (ExpressionAtom | TokenHandler)[]) {
    if (args.length === 1) {
      const a = args[0];
      if (typeof a === 'function') { this.handle = a as TokenHandler; return; }
      if (a instanceof Node) { this.node = a; return; }
    }
    for (const a of args) this.atoms.push(a as ExpressionAtom);
  }

  /** Drive the handler over `node` until either `node.direction.done()`
   *  (cursor at end-of-source in the current direction) or `past()` (when
   *  given) returns true. The `past` predicate is how rewalks stop at an
   *  inner expression boundary instead of EOF.
   *
   *  Per-iteration instrumentation now comes from `@instrumented` on the
   *  Node methods the handler invokes — there's no separate `interpret`
   *  frame anymore.
   *
   *  Falls back to the runtime's registered Expression's handler when this
   *  Expression has none of its own — that's the `E(node)` form. */
  iterate(node: Node, past?: () => boolean): void {
    const handle = this.handle ?? node.program?.runtime._expression?.handle;
    if (!handle) return;
    while (!node.direction.done() && (!past || !past())) handle(node);
  }
}

/** A symbol-resolution slot, identified by (owner, key). Multiple parties
 *  participate: a declaration site (e.g. `.external_method` registering the
 *  name), and demand sites (forward refs from source, abstract-call lookups,
 *  etc.). Each contributing Node lands in `nodes`. When an implementation
 *  arrives, `resolve(fn)` flips `resolved` and stores `fn`. The verify pass
 *  iterates unresolved Resolutions and emits errors on every node in `nodes`,
 *  so authors see exactly which sites depend on a missing symbol. */

//TODO Closest resolution like a new class Node which overrides the Node ref within that repository.
export class Resolution {
  resolved: boolean = false
  fn?: Method
  nodes: Node[] = []
  /** Sticky flags for this symbol — direction flags, accepts_program, the
   *  `external`-stamp, anything else stamped via `with()`. Lives on the
   *  resolution (not per-Node) so they persist across re-matches: a future
   *  `match(key)` returns a fresh forward whose `value.options` aliases this
   *  map, so flags previously stamped (e.g. by `external left-to-right X`)
   *  show up immediately. The rewalk consults this directly when deciding
   *  matching/opposite — we cannot trust per-instance stamps because the
   *  previous parsing direction may have been wrong. */
  options: { [key: string]: string } = {}

  constructor(public owner: Node, public key: Key, public message: string = `Unresolved \`${String(key)}\``) {}

  resolve = (fn: Method): this => { this.fn = fn; this.resolved = true; return this; }
  add = (node: Node): this => { this.nodes.push(node); return this; }
}

export class Runtime implements Backend {

  log = new Diagnostics();
  programs: Program[] = [];

  /** Symbol resolutions, keyed implicitly by (owner, key). Get-or-create via
   *  `resolution(owner, key)`. Verify reports any entry where `resolved` is
   *  false against every node that registered with it. */
  _resolutions: Resolution[] = []
  /** Index for `_resolutions` keyed by (owner, key). Lookup was an O(N)
   *  `_resolutions.find(...)` per `resolution()` call — and `resolution()`
   *  fires on every match dispatch + forward-ref check, so total cost
   *  was O(N²) at scale (the dominant superlinearity at >50KB files).
   *  This index makes lookup O(1). */
  _resolutionsIndex: Map<Node, Map<Key, Resolution>> = new Map();

  /** **Cache** — derived from the union of `Resolution.nodes` across every
   *  resolution. Per-Text.Source sorted-by-cursor `Node[]`. Maintained by
   *  `track()` (single-item add) and `Node.rewalk` (range clears → full
   *  rebuild from all resolutions). Lets `right.next()` / `left.next()`
   *  binary-search for the nearest tracked sibling instead of walking
   *  every resolution × every node — the dominant O(N²) cost for large
   *  files (6.4M walks at 3,350 lines before this index). */
  byPosition = new Cache<Node, Map<Text.Source, Node[]>>(
    () => new Map(),
    // Streaming add: tail-first insertion sort. The parser advances forward
    // through the source, so almost every add lands at the very end (O(1)).
    (view, node) => {
      if (node.source === Text.Source.EMPTY || node.cursor == null) return;
      let arr = view.get(node.source);
      if (!arr) { arr = []; view.set(node.source, arr); }
      const cursor = node.cursor;
      let i = arr.length;
      while (i > 0 && arr[i - 1].cursor! > cursor) i--;
      if (i === arr.length) arr.push(node);
      else arr.splice(i, 0, node);
    },
    // Bulk rebuild: bucket by Text.Source, sort each bucket once. Per-add
    // insertion would be O(N²) when the rebuild source isn't already in
    // cursor order (rewalk's `for r of _resolutions for n of r.nodes`
    // interleaves cursors across resolutions).
    (view, nodes) => {
      for (const n of nodes) {
        if (n.source === Text.Source.EMPTY || n.cursor == null) continue;
        let arr = view.get(n.source);
        if (!arr) { arr = []; view.set(n.source, arr); }
        arr.push(n);
      }
      for (const arr of view.values()) arr.sort((a, b) => a.cursor! - b.cursor!);
    },
  );

  /** Append `node` to `resolution.nodes` AND to the by-position cache.
   *  Use this everywhere a node would be added via `resolution.add(node)`;
   *  the bare `add` is left for cases where source position isn't
   *  available (BASE/CTX-side method declarations from JS). */
  track(resolution: Resolution, node: Node): Resolution {
    resolution.add(node);
    this.byPosition.add(node);
    return resolution;
  }

  /** Wipe every cached scrap that references this program / its source
   *  file, so a subsequent re-parse starts clean. Call this from the
   *  LSP / hot-reload path *before* re-parsing — without it, stale
   *  per-file entries pile up across edits and cascade-dedup over-fires
   *  ("this line already errored" → suppresses the new error). Touched:
   *  `_resolutions[*].nodes`, `byPosition` (Node side), `log.items`,
   *  `log.erroredRegions`, `log.byPosition`. */
  dropProgramState(program: Program): void {
    const sf = program.root?.source;
    if (!sf) return;
    const file = sf.location;
    // Resolution demand sites tied to this file → drop.
    for (const r of this._resolutions) {
      r.nodes = r.nodes.filter(n => n.source !== sf);
    }
    // Per-Node by-position cache: keyed by Text.Source reference.
    this.byPosition.view.delete(sf);
    // Per-Diagnostic caches: keyed by file path string.
    this.log.byPosition.view.delete(file);
    this.log.erroredRegions.view.delete(file);
    // Per-file items bucket — drop the whole entry. The bucket is keyed
    // by file path and only contains diagnostics from this file.
    this.log.items.delete(file);
    // Plus filter the no-file bucket: errors fired on synthetic nodes
    // (settle-time empty args, the verify fatal) carry no source
    // but still belong to this program. Drop those too, plus the verify
    // fatal which has no node at all (re-emitted next verify).
    const noFile = this.log.items.get(undefined);
    if (noFile) {
      const filtered = noFile.filter(d => {
        if (d.phase === 'verify' && d.level === 'fatal' && !d.node) return false;
        return (d.node as Node | undefined)?.program !== program;
      });
      if (filtered.length === 0) this.log.items.delete(undefined);
      else this.log.items.set(undefined, filtered);
    }
  }

  resolution = (owner: Node, key: Key, message?: string): Resolution => {
    // A symbol's resolution is identified by `key` *and* by where it was
    // first registered — but lookups can come from any scope (parse-root,
    // CTX, BASE) depending on whether the match was a default lookup, a
    // CTX-scoped match in an accepts_program branch, or an external_method
    // declaration. Walk the `_super` chain of the requested owner so all
    // those lookup paths land on the same Resolution instance for a given
    // key, and modifier flags stamped via `args.with(...)` stay sticky.
    let r: Resolution | undefined;
    for (let cur: Node | undefined = owner; cur && !r; cur = cur._super) {
      r = this._resolutionsIndex.get(cur)?.get(key);
    }
    if (!r) {
      r = new Resolution(owner, key, message ?? `Unresolved \`${String(key)}\``);
      this._resolutions.push(r);
      let byKey = this._resolutionsIndex.get(owner);
      if (!byKey) { byKey = new Map(); this._resolutionsIndex.set(owner, byKey); }
      byKey.set(key, r);
    } else if (message && !r.resolved) {
      r.message = message;
    }
    return r;
  }

  object = (key: Key, fn: (x: Node) => void): this => {
    if (!this.GLOBAL.eager.has(key)) this.GLOBAL.eager.set(new Node(this.EXTERNALLY_DEFINED))
    fn(this.GLOBAL.get(key));
    return this;
  }
  external_method = (key: Key, fn: Method): this => { this.GLOBAL.external_method(key, fn); return this; }

  /** The language's parser. Set by `.syntax(E => E(handle))` — the handler
   *  passed to `E` becomes this Expression's `handle`. `Expression.iterate`
   *  is the only consumer; everything that used to call `_tokenHandler` now
   *  goes through `_expression.iterate(node, past?)`. */
  _expression: Expression | null = null;

  syntax = (expression: (E: ((...args: (ExpressionAtom | TokenHandler)[]) => Expression) & { [key: string]: any }) => Expression): this => {
    const E: any = (...args: (ExpressionAtom | TokenHandler)[]) => new Expression(...args);
    const result = expression(E);
    if (result?.handle) this._expression = result;
    return this;
  }

  cli = (location: string[], args: { [key: string]: string[] }) => {
    const timer = this.log.clock()

    const _eval = args['eval'] ?? []; delete args['eval'];
    if (_eval) { this.add(..._eval) } else { this.load(location) }

    this.exec()

    this.log.info('timer', `  ${timer.toString()} total`)
  }

  /** Verify every program (parsing already done) and sweep the resolution
   *  registry. Shared by `exec` and the LSP so editor diagnostics match what
   *  `.abstract().exec()` produces — same realize order, same sweep, same
   *  cascade rules. CLI-only concerns (process.exitCode, log.print) live in
   *  `exec`, not here. */
  verify = (): Node | undefined => {
    let result: Node | undefined;
    // Currently the programs are just a list of files read in order of loading. That will change. TODO
    for (const program of this.programs) {
      result = this.abstract_interpretation.enabled ? program.verify() : program.result?.settle().realize();
    }

    if (this.abstract_interpretation.enabled) {
      // Sweep the resolution registry: every still-unresolved entry reports on
      // every node that participated (declaration + demand sites). Skip nodes
      // whose expression already has a prior error on the same line — `external
      // test 1 2 3` should fire only on `test`, not cascade through dead args.
      for (const r of this._resolutions) {
        if (r.resolved) continue;
        for (const node of r.nodes) {
          if (node.superseded) continue;
          if (this.log.cascaded(node)) continue;
          node.error('forward ref', r.message);
        }
      }
      if (this.log.hasErrors) this.log.fatal('verify', 'Exited during abstract interpretation, errors occurred while verifying the soundness of the program.')
    }

    return result;
  }

  exec = (): Node | undefined => {
    // Run all queued pass steps
    for (const pass of this.language.passes) {
      for (const step of pass.steps) {
        step();
      }
    }

    const result = this.verify();

    if (this.log.hasErrors) process.exitCode = 1;
    if (this.log.errors.length > 0 || this.log.warnings.length > 0) this.log.print();

    return result;
  }

}

/**
 * Editor-facing language configuration. Mirrors a subset of VS Code's
 * LanguageConfiguration shape so the LSP can hand it through directly to
 * `vscode.languages.setLanguageConfiguration`. Other editors can map from
 * here. RegExps travel as `{ pattern, flags? }` so they survive JSON.
 */
export interface EditorLanguageConfiguration {
  comments?: { lineComment?: string; blockComment?: [string, string] };
  brackets?: [string, string][];
  autoClosingPairs?: (
    | { open: string; close: string; notIn?: string[] }
    | [string, string]
  )[];
  surroundingPairs?: ([string, string] | { open: string; close: string })[];
  wordPattern?: { pattern: string; flags?: string };
  indentationRules?: {
    increaseIndentPattern?: { pattern: string; flags?: string };
    decreaseIndentPattern?: { pattern: string; flags?: string };
  };
}

export class Language implements Backend {

  /**
   * Editor configuration accumulated across `.configuration(...)` calls. The
   * LSP exposes this verbatim — it's read once after the server is ready, so
   * nothing here needs to be reactive for now. Empty by default; adapters
   * (vscode, etc.) skip configuration when nothing is set.
   */
  _configuration: EditorLanguageConfiguration = {};
  configuration = (cfg: EditorLanguageConfiguration): this => {
    Object.assign(this._configuration, cfg);
    return this;
  }

}

type Key = string | Node

// Shared sentinels that replace per-Node `new Map()` and `{}` allocations
// in the value initializer. Writers (external_method, with, clear) replace
// them with fresh instances on first mutation. Readers tolerate them as
// regular empty Map / empty object.
const EMPTY_METHODS: Map<Key, Node> = new Map();
const EMPTY_OPTIONS: { [key: string]: string } = {};

export class Node extends Text.Node implements Instrumentable {
  // `methods` is lazy-allocated on first .set — most Nodes never declare a
  // method (forward refs, lazy juxtapositions, parser intermediates), and
  // `new Map()` per Node is measurable now that the closure-allocation noise
  // is gone. `options` shares the `EMPTY_OPTIONS` sentinel until a `with()`
  // call replaces it with a fresh object — same trick: avoid the per-Node
  // literal allocation.
  value: { encoded: any; ctx?: Node, self?: Node, methods: Map<Key, Node>, options: { [key: string]: string }, resolution?: Resolution } = { encoded: UNKNOWN, methods: EMPTY_METHODS, options: EMPTY_OPTIONS };

  // TODO get/call switch_ctx.


  /** Set by `Node.rewalk` when this node's source range was cleared for
   *  re-interpretation. The node stays in `Resolution.nodes` and the
   *  `Runtime.byPosition` cache (avoiding O(N) splices per rewalk), but
   *  every reader (`forwardRef`, the verify pass's unresolved emit,
   *  `right.next()`) filters on `!superseded`. */
  superseded: boolean = false;

  //Todo sHOULD BE Not this.applied but 'accepts zero args, then call'
  settle(): Node { this.realize(); return this.callable && !this.applied ? this.call() : this; }

  with(key: string, value?: string): this {
    // Replace the shared empty sentinel with a fresh object on first mutation
    // so the sentinel stays empty for every Node still using it.
    if (this.value.options === EMPTY_OPTIONS) this.value.options = {};
    this.value.options[key] = value ?? 'true';
    this.debug('options', `${key} = ${this.value.options[key]}`)
    return this;
  }
  enabled(key: string): boolean { return !!this.value.options[key]; }

  /** Expression-level assertions over the resolved Nodes reachable from
   *  `this` via `.right.next()`. Each method walks AST-style up to the
   *  given boundary Node (exclusive — same convention as `.rewalk`'s
   *  `[start.begin, trigger.begin)` range), inspects the relevant
   *  `value.options` flags, emits an error on `this` if the assertion
   *  fails, and returns its findings. */
  // `assert` is per-Node lazy for the same reason as `eager` — most Nodes
  // never call assertions; the wrapper allocates only on first access.
  private _assert?: { non_mixed_associativity: (boundary: Node) => 'left' | 'right' | 'mixed' | 'none' };
  get assert() { return this._assert ??= {
    /** Walks resolved siblings rightward up to `boundary.cursor`,
     *  collecting `associativity` flags from methods that were actually
     *  dispatched *as infix operators* in this expression — the dispatch
     *  marks those by eagerly setting `value.self = anchor` (a Node with
     *  a real cursor) on the matched copy. Methods that just appear as
     *  args of a modifier chain (e.g. `external right-associative x` —
     *  x is a leaf, not an operator) keep `value.self === BASE/CTX` (no
     *  cursor) and are skipped, so right-assoc-flagged leaves don't
     *  trigger spurious mix errors or spurious right-assoc rewalks.
     *
     *  If both 'left' and 'right' appear, emits "Cannot mix … in a
     *  single infix expression with mixed associativity, use parenthesis
     *  to mix them." on a synthetic span Node covering the range from
     *  the *first* assoc-flagged operator to the *last* — so the
     *  squiggle hugs the offending range — and returns 'mixed'.
     *  Otherwise returns the dominant flag ('left', 'right', or 'none'
     *  if no associativity-flagged method was dispatched as infix). */
    non_mixed_associativity: (boundary: Node): 'left' | 'right' | 'mixed' | 'none' => {
      const lefts = new Set<string>(), rights = new Set<string>();
      let firstOp: Node | null = null;
      let lastOp: Node | null = null;
      let dispatchCount = 0;
      let n: Node | null = this;
      while (n && n.cursor != null && boundary.cursor != null && n.cursor < boundary.cursor) {
        const dispatchedAsInfix = n.value.self?.cursor != null;
        const a = n.value.options['associativity'];
        if (dispatchedAsInfix && (a === 'left' || a === 'right')) {
          if (!firstOp) firstOp = n;
          lastOp = n;
          dispatchCount++;
          (a === 'left' ? lefts : rights).add(n.string ?? '');
        }
        n = n.right.next() as Node | null;
      }
      // Trivial expressions (0 or 1 infix dispatch) reduce identically LTR
      // or RTL, so no rewalk is needed regardless of the operator's
      // associativity. Skip — rewalks are the dominant per-token cost on
      // larger files (each filters every diagnostic + every resolution.node).
      if (dispatchCount <= 1) return 'none';
      if (lefts.size && rights.size) {
        const names = [...lefts, ...rights].map(m => `\`${m}\``).join(', ');
        const span = new Node(this.program);
        span.source = this.source;
        span.cursor = firstOp!.cursor!;
        span.selection = [firstOp!.begin, lastOp!.end];
        span.error('associativity',
          `Cannot mix ${names} in a single infix expression with mixed associativity, use parenthesis to mix them.`);
        return 'mixed';
      }
      if (rights.size) return 'right';
      if (lefts.size) return 'left';
      return 'none';
    },
  }; }

  /** If this node carries an unresolved resolution, return the latest
   *  cursor-bearing Node from `resolution.nodes` (so diagnostics emitted
   *  on the returned node land on a real source position). Falls back to
   *  `this` when none of the resolution's nodes have a cursor but `this`
   *  does, otherwise `null`. Used by the dispatch to surface "Unresolved
   *  X" errors on a forward ref's actual source-anchor instead of on a
   *  juxtaposition lazy whose cursor is undefined. */
  forwardRef(): Node | null {
    const r = this.value.resolution;
    if (!r || r.resolved) return null;
    // Walk backwards directly — `[...arr].reverse().find()` allocates a fresh
    // array per call, which is hot enough to matter (fires on every
    // wrongDirection emit + every match in the dispatch).
    for (let i = r.nodes.length - 1; i >= 0; i--) {
      if (r.nodes[i].superseded) continue;
      if (r.nodes[i].cursor != null) return r.nodes[i];
    }
    return this.cursor != null ? this : null;
  }

  /** Run `fn` with parser+program state snapshotted, then restore it
   *  unconditionally — anything `fn` advances the cursor past, saves into
   *  `program.result`, or reports as a diagnostic is rolled back. Use for
   *  speculative reads (e.g. recursing into the tokenHandler to find the
   *  next non-direction-flagged token without committing to the walk). */
  peek<T>(fn: () => T): T {
    const parser = this.copy();
    const program = this.program.snapshot();
    try { return fn(); } finally {
      this.cursor = parser.cursor;
      this.selection = parser.selection.slice();
      this._direction = parser._direction;
      this.program.restore(program);
    }
  }

  /** Re-run the token handler over `[start.begin, trigger.begin)` under a
   *  new walk direction, optionally pre-pinning `seed` as the running
   *  result so the recursive walk starts with it as the anchor. The
   *  handler's own dispatch (matchesDirection / wrongDirection / direction
   *  switches) builds the chain — no separate anchor pass.
   *
   *  Diagnostics, log entries, and resolution-node entries inside the
   *  range are cleared first so the re-interpretation starts clean.
   *  Parser position (cursor / selection / direction) is restored on
   *  exit; program state changes from the inner handler calls persist. */
  rewalk(start: Node, trigger: Node, direction: 'left-to-right' | 'right-to-left', seed?: Node): void {
    const program = this.program;
    const sf = start.source;
    const rangeStart: number = start.begin ?? 0;
    const rangeEnd: number = trigger.begin ?? Number.POSITIVE_INFINITY;

    // Mark in-range Diagnostics + Nodes as `superseded` instead of
    // filtering the whole `program.diagnostics` / `log.items` /
    // `_resolutions[*].nodes` arrays. Filter was O(N) per rewalk and
    // O(N²) cumulatively (the dominant cost beyond ~1k lines). The
    // by-position caches give O(log N + range) lookup; readers
    // (`forwardRef`, `verify`, `right.next`, display, count getters)
    // skip `superseded` items.
    if (sf) {
      const log = program.runtime.log as Diagnostics;
      // Diagnostics caches are keyed by file path (string); the Node
      // by-position cache (below) is still keyed by Text.Source object.
      const file = sf.location;
      const errMap = log.erroredRegions.view.get(file);
      const dArr = log.byPosition.view.get(file);
      if (dArr && dArr.length) {
        const lo = lowerBound(dArr, rangeStart, d => d.node!.cursor!);
        const hi = lowerBound(dArr, rangeEnd, d => d.node!.cursor!);
        for (let i = lo; i < hi; i++) {
          const d = dArr[i];
          d.superseded = true;
          // Decrement the per-line error counter (only error/fatal
          // contribute to it). Surgical, so the rebuild loop over
          // log.items is gone — that was the remaining O(N²) cost.
          if (errMap && (d.level === 'error' || d.level === 'fatal') && d.node?.cursor != null) {
            const line = sf.lineOf(d.node);
            const count = errMap.get(line);
            if (count != null) {
              if (count === 1) errMap.delete(line);
              else errMap.set(line, count - 1);
            }
          }
        }
        if (lo < hi) dArr.splice(lo, hi - lo);
        if (dArr.length === 0) log.byPosition.view.delete(file);
      }
      if (errMap && errMap.size === 0) log.erroredRegions.view.delete(file);
      const nArr = program.runtime.byPosition.view.get(sf);
      if (nArr && nArr.length) {
        const lo = lowerBound(nArr, rangeStart, n => n.cursor!);
        const hi = lowerBound(nArr, rangeEnd, n => n.cursor!);
        for (let i = lo; i < hi; i++) nArr[i].superseded = true;
        if (lo < hi) nArr.splice(lo, hi - lo);
        if (nArr.length === 0) program.runtime.byPosition.view.delete(sf);
      }
    }

    const parser = this.copy();

    // Start at the boundary opposite the walk direction so the trigger
    // itself is the first token captured: RTL walks leftward, so the
    // cursor sits one past the trigger's right edge. With a `seed`, the
    // trigger is the anchor (already populated as `result`) — we don't
    // want to re-capture it, so we start at its inner edge instead.
    const triggerEnd = trigger.end ?? rangeEnd;
    const triggerBegin = trigger.begin ?? rangeEnd;
    this.cursor = direction === 'right-to-left'
      ? (seed ? triggerBegin : triggerEnd + 1)
      : (seed ? triggerEnd : Math.max(rangeStart - 1, 0));
    this.selection = [];
    if (direction === 'right-to-left') this.rtl; else this.ltr;
    program.result = seed ?? null;
    program.expression_start = undefined;

    // Stop once the most-recently-captured token has reached the original
    // expression boundary — `_.begin` (RTL) / `_.end` (LTR) tracks the
    // current selection's outer edge. Pass `instrument: false` because the
    // outer LTR walk is already framed; double-instrumenting would double-
    // count timings and clutter the trace.
    const past = (): boolean => direction === 'right-to-left' ? this.begin <= rangeStart : this.end >= rangeEnd;
    program.runtime._expression!.iterate(this, past, false);

    this.cursor = parser.cursor;
    this.selection = parser.selection.slice();
    this._direction = parser._direction;
  }

  //TODO Should be a .register, and then the .external part is a flag.
  external_method(key: Key, fn: Method, callback?: (fn: Node) => Node): this {
    // `self` is bound by `methods.resolve` (stored as value.self on the lookup copy) and arrives
    // here as the first positional of value.encoded. The method fires when `save()` juxtaposes
    // the next token (prev.call(this)), or when end-of-expression settle fires it with empty args.
    const runtime = this.program.runtime;
    const receiver = `[${this === runtime.BASE ? 'base class' : (this === runtime.CTX ? 'global context' : 'local context')}]`;
    const resolution = runtime.resolution(this, key, `Method \`${String(key)}\` was declared on ${receiver} but never implemented.`);
    if (fn) resolution.resolve(fn);

    const methodNode = new Node(this.program, this._super, key);
    runtime.track(resolution, methodNode);
    // Share options + back-link to the resolution so flags stamped via
    // `fn.with(...)` (and through bound copies) live on the resolution and
    // are visible to anything that re-matches the key later.
    methodNode.value.options = resolution.options;
    methodNode.value.resolution = resolution;
    methodNode.value.encoded = ((self: Node | undefined, _method: Node, args: Node) => {
      if (!resolution.resolved) return this.error('forward ref', 'Method was called before it was initialized.');
      // Receiver often lives outside any source file (e.g. BASE). Swap its program to the
      // caller's so errors the user fn reports on `self` land on the caller's stack.
      const receiver = self ?? args._super;
      const prev = receiver.program;
      receiver.program = args.program;
      try {
        return resolution.fn!(receiver, _method, args);
      } finally {
        receiver.program = prev;
      }
    });
    callback?.(methodNode);
    if (this.value.methods === EMPTY_METHODS) this.value.methods = new Map();
    this.value.methods.set(key, methodNode);
    return this;
  }

  // cursor, selection, source, begin/end, line/col, single_char, string,
  // direction state (_direction, ltr, rtl, direction, behind), navigation
  // primitives (left/right, capture/skip/etc.) all inherited from Text.Node.
  // Node only adds the pieces that need program/runtime access: a real
  // `next_neighbor` (Direction.next dispatches here), and the `clear`
  // hook on `move`.

  /** AST-style sibling navigation: nearest resolution-tracked Node in
   *  `sign` direction (sign=+1 LTR, sign=-1 RTL) within the same source
   *  file. Reads from `runtime.byPosition` (the per-Text.Source
   *  sorted-by-cursor cache) via binary search, so this is O(log N)
   *  instead of O(R*N) over every resolution × every node. Returns null
   *  if there's no neighbor. Caller filters by expression boundary. */
  override next_neighbor(sign: -1 | 1): Node | null {
    if (this.source === Text.Source.EMPTY || this.cursor == null) return null;
    const arr = this.program.runtime.byPosition.view.get(this.source);
    if (!arr || arr.length === 0) return null;
    const myCursor = this.cursor;
    // Boundary depends on direction (the original walk used strict
    // inequality on both sides):
    //   sign===1  → keep c > myCursor → search for first c >  myCursor
    //   sign===-1 → keep c < myCursor → search for first c >= myCursor,
    //                                   then walk backward from there.
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const c = arr[mid].cursor!;
      const skip = sign === 1 ? (c <= myCursor) : (c < myCursor);
      if (skip) lo = mid + 1; else hi = mid;
    }
    // Walk past any `this` entries (a node IS in its own slot in the cache).
    if (sign === 1) {
      for (let i = lo; i < arr.length; i++) if (arr[i] !== this && !arr[i].superseded) return arr[i];
    } else {
      for (let i = lo - 1; i >= 0; i--) if (arr[i] !== this && !arr[i].superseded) return arr[i];
    }
    return null;
  }



  copy(): Node {
    const copy = new Node(this.program, this._super)
    copy.source = this.source
    copy._thunks = this._thunks ? [...this._thunks] : null
    copy.value = {...this.value}
    copy.cursor = this.cursor
    copy.selection = this.selection.slice()
    copy._direction = this._direction
    return copy;
  }

  // `methods` lazy for the same reason as `eager` / `assert`. The wrapper
  // closures still bind `this`; they're shared across calls *on the same
  // Node*, allocated once on first access.
  private _methods?: { all: () => Set<Key>; has: (k: Key) => boolean; resolve: (k: Key) => Node; defines: (k: Key) => Node | null };
  get methods() {
    return this._methods ??= {
      all: (): Set<Key> => {
        const keys = new Set<Key>(this.value.methods.keys());
        if (this._super) for (const k of this._super.methods.all()) keys.add(k);
        return keys;
      },
      has: (key: Key): boolean => !this.methods.resolve(key).none,
      resolve: (key: Key): Node => {
        if (this.eager.has(key)) {
          const bound = this.eager.get(key)!.copy();
          bound.value.self = this;
          return bound;
        }
        if (this._super) return this._super.methods.resolve(key);
        return new Node(this.program, null, null)
      },
      defines: (key: Key): Node | null => {
        if (this.eager.has(key)) return this;
        if (this._super) return this._super.methods.defines(key);
        return null;
      }
    };
  }



  match(key: string, ctx: Node = this): Node {
    const runtime = this.program.runtime;

    // Empty/undefined keys come from handler iterations that ran one past the
    // end of the source — `capture_while` matched zero chars, the cursor sat
    // on an out-of-range index, and `_.string` resolved to undefined. Those
    // never represent a real token; turn them into a none node so .save()
    // can skip them rather than producing a spurious forward-ref squiggle on
    // the trailing empty line.
    if (key == null || (typeof key === 'string' && key.length === 0)) {
      return new Node(this.program, null, null);
    }

    // If result is lazy (has pending thunks), we can't inspect its methods.
    // Capture the rest of the line and defer the entire resolution.
    const result = this.program.result;
    // if (result && result._thunks) {
    //   // Extend selection to end of line using the existing direction primitives
    //   this.right.capture_while((ch: string) => ch !== '\n');

    //   // Create trace for this deferred region, then report error
    //   this.error('parse', `Unresolved syntax: '${this.string?.trim() ?? ''}'`);

    //   // Create a lazy node — when realized, just takes the value from the resolved result
    //   const lazy = new Node(this.program).lazily(self => {
    //     result.realize();
    //     self.value = result.value;
    //   });
    //   lazy.source = this.source;
    //   lazy.cursor = this.cursor;
    //   this.program.pending.push(lazy);
    //   this.program.result = lazy;
    //   return lazy;
    // }

    // TODO instead of .resolve calling .realize(), we should lazy the syntax parsing and have unresolved syntax error if .realize isnt called?

    // TODO Check if in context first.


    // 1. Method on current result
    // if (result) {
    //   const method = result.methods.resolve(key);

    //   const found = !method.none ? result.methods.defines(key) : false;
    //   const on = result?.string?.trim()

    //   if (!method.none) {
    //     this.trace('method', `Interpreted as a [Method call${on ? ` on \`${on}\`` : ''}${found && (found === runtime.BASE || found === runtime.CTX) ? ` on the ${found === runtime.BASE ? 'base class' : 'global context'}` : ''}]`);
    //     return method;
    //   }
    // }

    // TODO If not calling on a .result but inside a new expression.

    // 2. Exact resolve in context — walk _super chain, return the bound method.
    //    Application happens in save() (juxtaposition) or settle() (end-of-expression).
    const method = ctx.methods.resolve(key);

    if (!method.none) {
      const found = ctx.methods.defines(key);
      const receiver = `[${found === runtime.BASE ? 'base class' : 'global context'}]`

      const on = result?.string?.trim()

      this.trace('method', `Interpreted as => ${on ? `\`${on}\`(` : ''}${found && (found === runtime.BASE || found === runtime.CTX) ? receiver : ''}.${this.string}`);

      // Carry location from the reader onto the method so diagnostics land on the token.
      // Deep-copy the selection: parse-root keeps mutating it (capture_while
      // extends `last.end` in place during the next iteration's whitespace
      // skim), and a shared reference would silently bleed those mutations
      // into the bound method's apparent range — putting the trailing space
      // back onto the diagnostic squiggle.
      method.program = this.program;
      method.source = this.source;
      method.selection = this.selection.slice();
      // Anchor cursor on the token's leftmost char regardless of capture
      // direction (RTL captures leave the parse-root's cursor on the right
      // edge of the captured range, which would mis-place diagnostics).
      method.cursor = method.selection.length > 0 ? method.selection[0] : this.cursor;
      // Track this matched instance in the resolution registry so AST-
      // style navigation (e.g. `node.right.next()`) can find resolved
      // Nodes by source position. Forward refs are tracked at the
      // bottom of `match`; mirror that for resolved methods so both
      // surface uniformly.
      if (method.value.resolution) runtime.track(method.value.resolution, method);
      return method;
    }


    // 3. Split: collect all methods from result (and its parents), try each as suffix of key
 //TODO Right-to-left match should parse properly here; directionality respected
    // if (key.length > 1) {
    //   const target = result ?? runtime.BASE;
    //   const allMethods = target.methods.all();

    //   const candidates: { suffix: string, len: number }[] = [];
    //   for (const m of allMethods) {
    //     if (!is_string(m)) continue;
    //     if (key.length > m.length && key.endsWith(m)) {
    //       candidates.push({ suffix: m, len: m.length });
    //     }
    //   }
    //   candidates.sort((a, b) => b.len - a.len);

    //   for (const { suffix } of candidates) {
    //     const prefix = key.slice(0, key.length - suffix.length);
    //     const prefixResolved = this.methods.resolve(prefix);
    //     if (!prefixResolved || prefixResolved().none) continue;

    //     if (this._direction === 1) {
    //       this.end = this.end - suffix.length;
    //     } else {
    //       this.begin = this.begin + suffix.length;
    //     }
    //     const lazy = new Node(this.program).lazily(self => { self.value = (prefixResolved() as Node).value; });
    //     this.program.pending.push(lazy);
    //     return this._matched(lazy, 'split', `Split: '${prefix}' + '${suffix}'`);
    //   }
    // }

    //TODO If in closure
    // 4. Method on `this` (implicit self)
    //TODO Should be this.value.ctx
    // if (runtime.CTX.eager.has('this')) {
    //   const thisNode = runtime.CTX.eager.get('this')(runtime.CTX);
    //   if (thisNode && !thisNode.none) {
    //     const method = thisNode.eager.get(key);
    //     if (method) {
    //       const lazy = new Node(this.program).lazily(self => { self.value = method(thisNode).value; });
    //       this.program.pending.push(lazy);
    //       return this._matched(lazy, 'implicit-self', `Method on this`);
    //     }
    //   }
    // }

    // 5. Forward ref — already lazy by nature (errors only on access)
    const receiver =
      ctx === runtime.BASE                  ? '[base class]'
      : (ctx === runtime.CTX
        || ctx.program?.root === ctx)       ? '[global context]'
                                            : '[local context]';

    const forward = new Node(this.program, undefined);
    forward.source = this.source;
    // Deep-copy: same reasoning as in the `method` branch above — sharing the
    // parse-root's selection array would let later capture_while extensions
    // bleed into this forward ref's range.
    forward.selection = this.selection.slice();
    // Anchor on the token's leftmost char regardless of capture direction.
    forward.cursor = forward.selection.length > 0 ? forward.selection[0] : this.cursor;
    const unresolved = `Unresolved variable \`${String(key)}\` in ${receiver}`;
    const resolution = runtime.resolution(ctx, key, unresolved);
    runtime.track(resolution, forward);
    // Share options + back-link to the resolution so subsequent matches of
    // the same key see flags stamped on prior instances (e.g. by an earlier
    // `external left-to-right X`), and so the rewalk can ask "is this a
    // method?" via `value.resolution.resolved`.
    forward.value.options = resolution.options;
    forward.value.resolution = resolution;
    forward.value.encoded = () => resolution.resolved
      ? resolution.fn!(forward, forward)
      : forward.error('forward ref', unresolved);

    //TODO We need to store that something is a forward ref somehow; because that means we need to load certain things first.
    //TODO We want a tree of order of things to load. 
    this.trace('forward-ref', `Forward reference to '${key}' in ${receiver}`);
    return forward;
  }

  /**
   * .save(): Commit this node into the reader's expression result.
   * If no result yet, this becomes the result.
   * If there is a result, call it with this as argument (juxtaposition).
   */
  save(): this {
    // None nodes (encoded === null/undefined) come from .match() short-circuits
    // for empty/undefined keys. Saving one would either juxtapose a no-arg
    // call onto the previous result (firing irrelevant errors from the
    // previous method's body) or stash garbage as the program's result.
    // Either way, drop it on the floor.
    if (this.none) return this;

    if (this.program!.result) {
      const prev = this.program!.result;
      const next = prev.call(this);
      // TODO Set pointer over the whole thing
      // next.source = this.source ?? prev.source;
      // next.program     = this.program!;
      // next.cursor      = prev.cursor;
      // next.selection   = [{ begin: prev.begin, end: this.end }];

      this.program!.result = next;
    } else {
      this.program!.result = this;
    }
    return this;
  }

  /**
   * .expression(): Recursively parse an expression by invoking the language's
   * registered token handler in the current direction until end of line.
   * Saves the previous reader result, then restores context and returns with
   * this node holding the parsed value.
   */
  // expression = (): this => this.do('debug', 'expression', () => {
  //   const prevResult = this.program!.result;
  //   this.program!.result = null;

  //   const handler = this.program!.runtime._tokenHandler;
  //   if (handler) {
  //     while (!this.direction.done() && this.direction.peek() !== '\n') {
  //       handler(this);
  //     }
  //   }

  //   // Transfer parsed result into this node
  //   if (this.program!.result) {
  //     this.value = this.program!.result.value;
  //   }

  //   // Restore previous result
  //   this.program!.result = prevResult;
  //   return this;
  // });

  freeze(): this {
    //TODO Freeze these tokens from reparsing. But do something with them
    return this;
  }
  comment(): this {
    //TODO Set as comment, skippable for others. peek/etc skip over comments
    return this;
  }

  suggest(): void {
    // TODO
  }

  block(fn?: (_: this) => Expression, punctuation?: { begin: string, end: string }): this {
    this.capture_whitespace().skip()
    if (punctuation) this.capture(punctuation.begin)

    // if (punctuation) { fn(this) } else { this. }

    if (punctuation) this.capture(punctuation.end)

    return this;
  }

  reinterpret(_pass: string): this { return this; }
  interpret(_fn: (self: Node & { [key: string]: Node }) => void): this { return this; }
  repeats(_operator?: '>=' | '>' | '<' | '<=' | '==', _x?: number): this { return this; }
  bind(_name: string): this { return this; }

  map<T>(fn: (x: any) => T): T[] {
    if (!is_array(this.value.encoded)) return this.fatal('type', 'Called .map on a value which is not an Array')
    return this.value.encoded.map(fn)
  }

}

//  scope = () => {}
//  allowForwardRef = () => {}

export class Program implements InstrumentationCtx {
  result: Node | null = null;
  pending: Node[] = [];
  /** The parse-root Node if this program parsed a source. */
  root?: Node;
  /** First Node of the current expression. The language definition writes
   *  this when a fresh expression begins so features that need to re-walk
   *  the expression's source (e.g. `</`'s direction switch) have the
   *  starting anchor — its `source`, `cursor`, and `begin` give the
   *  range, and its program/super give the resolution context. */
  expression_start?: Node;

  constructor(public runtime: Runtime, public parent?: Program) {
    runtime.programs.push(this);
  }

  /** Realize all pending lazy nodes, triggering deferred method calls and error reporting. */
  verify(): Node | undefined {
    // Fold the trailing expression (no closing newline) through settle so bare callables fire.
    if (this.result) {
      this.pending.push(this.result.settle());
      this.result = null;
    }
    for (let i = 0; i < this.pending.length; i++) {
      this.pending[i].realize();
    }
    //TODO MOVE .RESULT to the last .pending?
    //TODO Each successive statement should have dependence on the previous in .realize, so calling .abstract().realize() on them should trickle taht down. .abstract() should recursively be applied to all touched nodes.

    return this.pending[this.pending.length - 1];
  }

  /** End-of-expression: settle the running result, force its realize so
   *  side effects (modifier-body `args.with(...)` stamping, etc.) fire in
   *  source order, push it onto `pending`, and reset the per-expression
   *  state so the next expression starts clean. Called by the language's
   *  token handler whenever it crosses a newline. No-op when there's no
   *  current result. */
  commit = (): void => {
    if (this.result) {
      const settled = this.result.settle();
      // Force the settled chain to realize NOW, not at verify time.
      // accepts_program-ending expressions (e.g. `external right-to-left X`)
      // build a `composed` node that lazily wires up the chain; until
      // something realizes it, the chain's side effects (most notably
      // modifier-body stamping like `args.with('right-to-left')` on X's
      // resolution.options) don't happen — and a later line that
      // references X then sees stale flags. Realizing here fires the chain
      // in source order, which matches what a user reading the file expects.
      settled.realize();
      this.pending.push(settled);
    }
    this.result = null;
    // Reset expression_start so the next expression's first token re-pins
    // it (deferred opposite-direction methods deliberately leave it set
    // across iters within the same expression).
    this.expression_start = undefined;
  };

  /** Snapshot of mutable program-level state the token handler can touch
   *  (`result`, `expression_start`, plus *lengths* of the diagnostic / log
   *  / resolution-node / pending arrays — restoring by truncation drops
   *  anything appended in between). Paired with `restore` for speculative
   *  handler runs (see `Node.peek`). */
  snapshot = () => {
    const log = this.runtime.log;
    // Per-file lengths so `restore` can truncate each bucket back. Files
    // not present here either are new since snapshot (delete on restore)
    // or were already empty (no-op).
    const log_items_lengths = new Map<string | undefined, number>();
    for (const [file, arr] of log.items) log_items_lengths.set(file, arr.length);
    return {
      result: this.result,
      expression_start: this.expression_start,
      log_items_lengths,
      resolution_node_lengths: this.runtime._resolutions.map(r => r.nodes.length),
      pending_length: this.pending.length,
    };
  };
  restore = (snap: ReturnType<Program['snapshot']>): void => {
    const log = this.runtime.log;
    this.result = snap.result;
    this.expression_start = snap.expression_start;
    // Truncate each known bucket; drop buckets that didn't exist at
    // snapshot time (created during the peeked operation).
    for (const [file, arr] of log.items) {
      const prev = snap.log_items_lengths.get(file);
      if (prev === undefined) log.items.delete(file);
      else arr.length = prev;
    }
    this.runtime._resolutions.forEach((r, i) => {
      r.nodes.length = snap.resolution_node_lengths[i];
    });
    this.pending.length = snap.pending_length;
  };

}
