import type { Text } from "./source.ts";

export interface Diagnostic {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'trace';
  phase: string;
  node?: Text.Node;
  message?: string;
  clock?: Clock;
  diagnostics?: Diagnostic[];
  superseded?: boolean;
}

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = {
  trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5,
};

/**
 * Four-stamp clock for instrumented wrappers. The wrapper calls the
 * stamps in order around its body so the clock can report body time
 * (`ms`) separately from its own wrapper bookkeeping (`overhead`):
 *
 *     const clock = new Clock();        // a — wrapper enter
 *     // … pre-body wrapper bookkeeping …
 *     clock.body();                     // c — body about to run
 *     try { return original.apply(...); }
 *     finally {
 *       clock.done();                   // d — body just returned
 *       // … post-body wrapper bookkeeping (report, etc.) …
 *       clock.stop();                   // b — wrapper exit
 *     }
 *
 * `wall = b − a`, body raw `= d − c`, `overhead = wall − raw` (the
 * pre + post bookkeeping the wrapper paid for measurement). `ms`
 * walks `children` recursively at print time:
 *   - excluded child → subtract its entire `wall`, don't descend
 *     (the subtree is a black box of incidental work);
 *   - non-excluded child → subtract its `overhead`, recurse to
 *     subtract grandchildren's overheads too (instrumentation tax
 *     bleeds up through the whole instrumented chain).
 */
export class Clock {
  /** Wrapper enter (set in constructor). */
  a: number;
  /** Wrapper exit (set by `stop`). Null until then. */
  b: number | null = null;
  /** Body start (set by `body`). Defaults to `a` if never stamped. */
  c: number | null = null;
  /** Body end (set by `done`). Defaults to `b` (or now) if never stamped. */
  d: number | null = null;
  /** Marker — `@uninstrumented` calls set this. The parent treats this
   *  clock as a black box: its entire wall is tax, not measured work. */
  excluded: boolean = false;
  /** Transitive wrapper cost that landed inside this clock's `raw` —
   *  each completed child folds its numbers in (`tax`), so no clock ever
   *  retains its descendants. Keeping the child tree alive instead is
   *  what blew the heap at DEBUG=trace: one root call (a parse pass)
   *  transitively held millions of Clock objects. */
  taxed = 0;
  constructor() { this.a = performance.now(); }
  body(): this { this.c = performance.now(); return this; }
  done(): this { this.d = performance.now(); return this; }
  stop(): this { if (this.b === null) this.b = performance.now(); return this; }
  /** Total wall time (a → b). */
  get wall(): number { return (this.b ?? performance.now()) - this.a; }
  /** Body wall time (d − c). */
  get raw(): number {
    const start = this.c ?? this.a;
    const end = this.d ?? this.b ?? performance.now();
    return end - start;
  }
  /** Wrapper bookkeeping cost = total wrapper span − body span.
   *  Pre-body is `c − a`, post-body is `b − d`. If `body`/`done` were
   *  never stamped, body span is the whole wrapper and overhead is 0. */
  get overhead(): number {
    const o = this.wall - this.raw;
    return o > 0 ? o : 0;
  }
  /** What this call folds into its parent's `taxed` when it completes:
   *  an excluded call is incidental work — its whole wall (which already
   *  contains its own subtree) plus its unmeasurable birth cost; a
   *  measured call contributes only its wrapper bookkeeping, birth cost,
   *  and the tax it accumulated from its own descendants (its body time
   *  is real work the parent legitimately contains). */
  get tax(): number {
    const birth = birthCost();
    return this.excluded ? this.wall + birth : this.overhead + birth + this.taxed;
  }
  private _ms?: number;
  get ms(): number {
    if (this._ms !== undefined) return this._ms;
    const total = this.raw - this.taxed;
    return this._ms = total > 0 ? total : 0;
  }
  toString = () => `${this.ms.toFixed(2)}ms`;
}

/**
 * A cached, denormalized view derived from a source-of-truth stream.
 * Wherever you see `Cache<...>`, that field is *not* source data — it's
 * a maintained projection. `add(item)` folds in incremental updates;
 * `rebuild(items)` is for invalidations the cache can't apply
 * incrementally (e.g. range deletes during rewalk); `view` is the cached
 * projection (each cache picks its own lookup shape).
 */
export class Cache<Item, View> {
  view: View;
  private _empty: () => View;
  private _add: (view: View, item: Item) => void;
  /** Optional bulk-rebuild path. When provided, `rebuild()` calls it
   *  once instead of looping `_add` per item — lets caches with O(N²)
   *  incremental insertion (sorted arrays) batch + sort once. */
  private _bulk?: (view: View, items: Iterable<Item>) => void;
  constructor(
    empty: () => View,
    add: (view: View, item: Item) => void,
    bulk?: (view: View, items: Iterable<Item>) => void,
  ) {
    this._empty = empty; this._add = add; this._bulk = bulk; this.view = empty();
  }
  add(item: Item): void { this._add(this.view, item); }
  rebuild(items: Iterable<Item>): void {
    this.view = this._empty();
    if (this._bulk) this._bulk(this.view, items);
    else for (const item of items) this._add(this.view, item);
  }
  clear(): void { this.view = this._empty(); }
}

export interface Timing {
  phase: string;
  level: Diagnostic['level'];
  ms: number;
  count: number;
  children: Map<string, Timing>;
}

export class Diagnostics {
  /** Per-file Diagnostic lists in insertion order. Diagnostics whose node
   *  doesn't carry a file (synthetic verify fatal, framework-internal
   *  reports) go under the `undefined` key. The LSP reads `items.get(file)`
   *  to publish per-uri; `print()` iterates by file for source rendering;
   *  flat-iterating consumers walk every bucket via `all()`. */
  items: Map<string | undefined, Diagnostic[]> = new Map();

  /** The per-phase call tree, folded incrementally as timing diagnostics
   *  are reported — trace-level timings are *only* counted here, never
   *  retained in `items` (retaining one Diagnostic + stack snapshot per
   *  instrumented call is what OOM'd DEBUG=trace). Survives `delete()`:
   *  timings describe the work the whole run did, not the current
   *  diagnostic state of a source. */
  timings: Map<string, Timing> = new Map();
  /** Iterate every diagnostic across every file in insertion order
   *  (within each bucket). Insertion order across buckets is the order
   *  in which the first item per file landed. */
  *all(): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) yield* arr;
  }
  /** **Cache** — derived from the error/fatal subset of `items` (with a
   *  source-bearing node). Per-line error-count map (per Text.Source).
   *  Counts because a single line may carry multiple errors and
   *  supersession in `Node.rewalk` removes them one at a time — when
   *  the count hits zero the line is no longer "errored" for cascade-
   *  dedup purposes. Lookup is O(1) and replaces an O(N)
   *  `program.diagnostics` walk in `Runtime._cascaded`. The line key
   *  is a proxy for "same expression"; expressions can be multi-line
   *  and `;`-separated, so this should become expression-keyed once
   *  expression ranges are first-class. */
  erroredRegions = new Cache<Diagnostic, Map<string | undefined, Map<number, number>>>(
    () => new Map(),
    (view, d) => {
      if (d.level !== 'error' && d.level !== 'fatal') return;
      const node = d.node;
      if (!node || node.cursor == null) return;
      const file = node.file;
      let map = view.get(file);
      if (!map) { map = new Map(); view.set(file, map); }
      const line = node.line;
      map.set(line, (map.get(line) ?? 0) + 1);
    },
  );

  /** **Cache** — derived from items with a source-bearing node. Per-
   *  Text.Source sorted-by-cursor `Diagnostic[]`. Used by `Node.rewalk`
   *  to find diagnostics in `[rangeStart, rangeEnd)` via binary search
   *  and mark them `superseded`, instead of filtering the whole
   *  `program.diagnostics` / `log.items` arrays per rewalk (O(N) per
   *  rewalk, O(N²) over a parse). Tail-insertion sort during `report`:
   *  pushes during forward parse land at the tail in O(1); pushes from
   *  inside a rewalk scan back past the trigger's small set of post-
   *  range entries. */
  byPosition = new Cache<Diagnostic, Map<string | undefined, Diagnostic[]>>(
    () => new Map(),
    (view, d) => {
      const node = d.node;
      if (!node || node.cursor == null) return;
      const file = node.file;
      let arr = view.get(file);
      if (!arr) { arr = []; view.set(file, arr); }
      const cursor = node.cursor;
      let i = arr.length;
      while (i > 0 && arr[i - 1].node!.cursor! > cursor) i--;
      if (i === arr.length) arr.push(d);
      else arr.splice(i, 0, d);
    },
    // Bulk: bucket by file, sort each bucket once.
    (view, items) => {
      for (const d of items) {
        const node = d.node;
        if (!node || node.cursor == null) continue;
        let arr = view.get(node.file);
        if (!arr) { arr = []; view.set(node.file, arr); }
        arr.push(d);
      }
      for (const arr of view.values()) arr.sort((a, b) => a.node!.cursor! - b.node!.cursor!);
    },
  );

  constructor() {

  }

  clock() { return new Clock(); }
  private _start = this.clock();
  start = () => this._start = this.clock();

  deduplicate() {
    const seen = new Set<string>();
    for (const [file, arr] of this.items) {
      const filtered = arr.filter(d => {
        const idx = d.node?.begin ?? 0;
        const key = `${file ?? ''}:${idx}|${d.message ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (filtered.length === 0) this.items.delete(file);
      else this.items.set(file, filtered);
    }
  }

  /** Forget every diagnostic for a specific source (keyed by its file), rebuilding
   *  the derived caches so a stale "this line already errored" entry can't suppress
   *  fresh diagnostics when the source is re-parsed. */
  delete(source: Text.Source): void {
    this.items.delete(source.location);
    const remaining = [...this.all()];
    this.erroredRegions.rebuild(remaining);
    this.byPosition.rebuild(remaining);
  }

  /** True if `node`'s line in its file already carries an earlier
   *  error — cascade dedup, so a single broken expression doesn't
   *  spray duplicate errors across the line. O(1) via the per-file
   *  errored-line counter map; the line key is a proxy for "same
   *  expression" pending real expression ranges. */
  cascaded(node?: Text.Node): boolean {
    if (!node || node.cursor == null) return false;
    return (this.erroredRegions.view.get(node.file)?.get(node.line) ?? 0) > 0;
  }

  timing(map: Map<string, Timing>, phase: string, level: Diagnostic['level']): Timing {
    let n = map.get(phase);
    if (!n) map.set(phase, n = { phase, level, ms: 0, count: 0, children: new Map() });
    return n;
  }

  /** Fold one timing diagnostic into the call tree along its (live)
   *  ancestor stack. Same folding the old print-time walk did: each phase
   *  appears once per call path, recursion collapses onto its outermost
   *  node (count still tallies, inclusive ms doesn't double-count), and
   *  excluded frames are invisible. Only the debug+ `instrument` path
   *  lands here — trace wrappers fold O(1) in `wrap` itself. */
  private _timing(diag: Diagnostic): void {
    const ctx = (diag.node as unknown as Instrumentable | undefined)?.__instrumentation;
    const stack = ctx?.stack ?? [];
    let map = this.timings;
    let selfNode: Timing | undefined;
    const onPath = new Set<string>();
    for (const f of stack) {
      if (f.clock?.excluded || onPath.has(f.phase)) continue;
      onPath.add(f.phase);
      const n = this.timing(map, f.phase, f.level);
      if (f.phase === diag.phase) selfNode = n;
      map = n.children;
    }
    const recursive = onPath.has(diag.phase);
    const node = recursive ? selfNode! : this.timing(map, diag.phase, diag.level);
    node.count++;
    if (!recursive) node.ms += diag.clock!.ms;
  }

  report(diag: Diagnostic) {
    // Skip the allocation entirely when the level is below the display
    // threshold — Node.copy + Diagnostic + double-push cost ~1µs each, and
    // these fire for every match/save/options stamp. Cascade dedup +
    // stack snapshot now live in `Diagnostics.report` (it pulls the stack
    // via `node.__instrumentation()?.stack` since Node is Instrumentable).
    if ((diag.level === 'trace' || diag.level === 'debug' || diag.level === 'info') && !Diagnostics.showLevel(diag.level)) return;
    // Timing diagnostics fold into the aggregate tree immediately;
    // trace-level ones exist only there (the inline per-line display
    // drops trace timings anyway, and retaining one Diagnostic per
    // instrumented call is unpayable at DEBUG=trace).
    if (diag.clock) {
      this._timing(diag);
      if (diag.level === 'trace') return;
    }
    // Cascade dedup for error/fatal: skip if the node's line already
    // carries an earlier error.
    if ((diag.level === 'error' || diag.level === 'fatal') && this.cascaded(diag.node)) return;
    // If the node is an Instrumentable (real Node), snapshot its
    // program's call stack onto the diagnostic — errors/warnings/fatals
    // need it for stack traces.
    //
    // `.slice()` instead of `.map(f => ({...f}))`: stack frames are
    // never mutated after push, so references are safe; this drops the
    // per-frame shallow-copy allocation cost.
    if (diag.level === 'error' || diag.level === 'warning' || diag.level === 'fatal') {
      const ctx = (diag.node as unknown as Instrumentable | undefined)?.__instrumentation;
      if (ctx && ctx.stack.length) diag.diagnostics = ctx.stack.slice();
    }
    const file = diag.node?.file;
    let arr = this.items.get(file);
    if (!arr) { arr = []; this.items.set(file, arr); }
    arr.push(diag);
    this.erroredRegions.add(diag);
    this.byPosition.add(diag);
  }

  exit(): never {
    this.print();
    return process.exit(1);
  }

  fatal(phase: string, message: string, node?: Text.Node): never {
    this.report({ level: 'fatal', phase, message, node });
    return this.exit()
  }
  error(phase: string, message: string, node?: Text.Node) { return this.report({ level: 'error', phase, message, node }); }
  warning(phase: string, message: string, node?: Text.Node) { return this.report({ level: 'warning', phase, message, node }); }
  info(phase: string, message: string, node?: Text.Node) { return this.report({ level: 'info', phase, message, node });}
  debug(phase: string, message: string, node?: Text.Node) { return this.report({ level: 'debug', phase, message, node });}
  trace(phase: string, message: string, node?: Text.Node) { return this.report({ level: 'trace', phase, message, node });}

  get errors() {
    const out: Diagnostic[] = [];
    for (const d of this.all()) if (!d.superseded && (d.level === 'error' || d.level === 'fatal')) out.push(d);
    return out;
  }
  get warnings() {
    const out: Diagnostic[] = [];
    for (const d of this.all()) if (!d.superseded && d.level === 'warning') out.push(d);
    return out;
  }
  get hasErrors() {
    for (const d of this.all()) if (!d.superseded && (d.level === 'error' || d.level === 'fatal')) return true;
    return false;
  }
  get count() {
    let n = 0;
    for (const arr of this.items.values()) n += arr.length;
    return n;
  }

  /**
   * Minimum severity to display, resolved once at module load from the
   * DEBUG env var. DEBUG=0 → trace (show all), DEBUG=1 → debug+, …,
   * DEBUG=5 → fatal only. Default: 2 (info+). Static-init means
   * `showLevel` is a single `>=` compare in the wrapper hot path —
   * re-reading `process.env.DEBUG` + `parseInt` per call costs several
   * ms across a trace-level run.
   */
  static readonly minLevel: number = (() => {
    const env = process.env.DEBUG;
    if (env === undefined || env === '') return DIAGNOSTIC_SEVERITY.info;
    const n = parseInt(env, 10);
    if (!isNaN(n)) return n;
    // Allow level names too: DEBUG=trace, DEBUG=warning, etc.
    if (env in DIAGNOSTIC_SEVERITY) return DIAGNOSTIC_SEVERITY[env as Diagnostic['level']];
    return DIAGNOSTIC_SEVERITY.info;
  })();

  static showLevel(level: Diagnostic['level']): boolean {
    return DIAGNOSTIC_SEVERITY[level] >= Diagnostics.minLevel;
  }


  // ANSI helpers
  static c = {
    reset:       '\x1b[0m',
    blue:        '\x1b[34m',
    dark_blue:   '\x1b[2;34m',   // dim blue for debug
    yellow:      '\x1b[33m',
    gray:        '\x1b[90m',
    dark_gray:   '\x1b[2;90m',
    red:         '\x1b[1;31m',
    bold_yellow: '\x1b[1;33m',
    bold_blue:   '\x1b[1;34m',
    white:       '\x1b[37m',
    dim:         '\x1b[2m',
    bold:        '\x1b[1m',
  }

  /** Color for each diagnostic level — fatal/error/warning are bold. */
  static levelColor: Record<Diagnostic['level'], string> = {
    fatal:   '\x1b[1;31m',   // bold red (same as error)
    error:   '\x1b[1;31m',   // bold red
    warning: '\x1b[1;33m',   // bold yellow
    info:    '\x1b[34m',     // blue (not bold)
    debug:   '\x1b[32m',     // green (not bold)
    trace:   '\x1b[90m',     // gray (not bold)
  }

  /**
   * Print annotated source lines for a program's diagnostics.
   * Alternates annotations above/below the source line; timing diagnostics
   * are rendered on a dedicated line beneath the source, indented two spaces.
   *
   *         Forward reference to 'test'
   *         |
   * external test
   *    0.5ms, 5 * ~0.9ms = 4.5ms
   *    |
   *    Method on *
   *    error[external]: Expected method to ...
   */
  /** Render annotated source for one file's diagnostics. Caller is
   *  responsible for grouping `items` by `d.node?.file` and passing
   *  the file's source string in. The renderer doesn't know about
   *  Programs — diagnostics are the unit, source files are the group. */
  private _printFile(file: string | undefined, source: string, items: Diagnostic[]) {
    const { c } = Diagnostics;
    if (!source) return;
    const cols = process.stdout.columns || 80;
    const lines = source.split('\n');
    const lineNumWidth = String(lines.length).length;
    const gutterLen = lineNumWidth + 1;

    if (file) console.error(`${c.gray}${file}${c.reset}`);

    // Pick the best source-bearing node for display: the diagnostic's own
    // node, or else the top-of-stack frame (errors reported on value/partial
    // nodes carry no source themselves, but their stack does). Compare by
    // file path — same file = same source.
    const displayNode = (d: Diagnostic): Text.Node | undefined =>
      d.node?.file === file ? d.node
        : d.diagnostics?.[d.diagnostics.length - 1]?.node?.file === file
            ? d.diagnostics[d.diagnostics.length - 1].node
            : undefined;

    const tied = items.filter(d => !d.superseded && !!displayNode(d));
    const anchors = tied.filter(d => !d.clock);
    const timings = tied.filter(d => !!d.clock);

    const cursor = (d: Diagnostic) => displayNode(d)!.cursor!;
    const ranges = (d: Diagnostic): { begin: number; end: number }[] => {
      const n = displayNode(d)!;
      if (n.selection.length === 0) {
        const i = n.cursor!;
        return [{ begin: i, end: i }];
      }
      // selection is packed [b0,e0,b1,e1,…] — unpack into {begin,end} pairs
      // for the print code's internal API.
      const out: { begin: number; end: number }[] = [];
      const sel = n.selection;
      for (let i = 0; i < sel.length; i += 2) out.push({ begin: sel[i], end: sel[i + 1] });
      return out;
    };

    anchors.sort((a, b) => cursor(a) - cursor(b));

    let anchorIdx = 0;
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const line = lines[lineNo];
      const lineStart = lines.slice(0, lineNo).reduce((a, l) => a + l.length + 1, 0);
      const lineEnd = lineStart + line.length;
      const lineLabel = `${c.gray}${String(lineNo + 1).padStart(lineNumWidth)} ${c.reset}`;
      const blankGutter = ' '.repeat(gutterLen);

      // Collect visible anchors on this line.
      const lineAnchors: Diagnostic[] = [];
      while (anchorIdx < anchors.length && cursor(anchors[anchorIdx]) < lineEnd) {
        const d = anchors[anchorIdx];
        if (cursor(d) >= lineStart && Diagnostics.showLevel(d.level)) lineAnchors.push(d);
        anchorIdx++;
      }

      // Collect timings on this line, partitioned by phase.
      const lineTimings = timings.filter(d => {
        const idx = d.node?.cursor;
        return idx !== undefined && idx >= lineStart && idx < lineEnd;
      });
      const timingLine = this._formatTimingLine(lineTimings);

      if (lineAnchors.length === 0) {
        if (!timingLine) continue;
        console.error(`${lineLabel}${c.gray}${line}${c.reset}`);
        console.error(`${blankGutter}${timingLine}`);
        continue;
      }

      // Group anchors that share a cursor — they render under one pipe
      // (one annotation block, diagnostics stacked).
      const byCursor = new Map<number, Diagnostic[]>();
      const cursorOrder: number[] = [];
      for (const d of lineAnchors) {
        const col = cursor(d) - lineStart;
        if (!byCursor.has(col)) { byCursor.set(col, []); cursorOrder.push(col); }
        byCursor.get(col)!.push(d);
      }
      // Group color *and* range follow the most severe diagnostic in the
      // group: an error with a wide selection should colour its full span
      // even when an info trace at the same anchor cursor was emitted
      // first with a narrower range.
      const info = cursorOrder.map(col => {
        const diags = byCursor.get(col)!;
        const worst = diags.reduce((a, b) =>
          DIAGNOSTIC_SEVERITY[b.level] > DIAGNOSTIC_SEVERITY[a.level] ? b : a
        );
        return {
          diags,
          col,
          ranges: ranges(worst).map(r => ({ begin: r.begin - lineStart, end: r.end - lineStart })),
          color: Diagnostics.levelColor[worst.level] ?? c.gray,
        };
      });
      const aboveInfo = info.filter((_, i) => i % 2 === 1).reverse();
      const belowInfo = info.filter((_, i) => i % 2 === 0);

      // Above annotations.
      if (aboveInfo.length) {
        const aboveRL = [...aboveInfo].sort((a, b) => b.col - a.col);
        const rendered = this._renderAnnotations(blankGutter, gutterLen, aboveRL, cols, 'before');
        rendered.push(this._connectorLine(blankGutter, gutterLen, aboveRL));
        let prev = '';
        for (const l of rendered) { if (l !== prev) console.error(l); prev = l; }
      }

      // Source line with colored ranges.
      const colorSegments: { begin: number; end: number; color: string }[] = [];
      for (const ti of info) {
        for (const r of ti.ranges) {
          if (r.end < 0 || r.begin >= line.length) continue;
          colorSegments.push({ begin: Math.max(r.begin, 0), end: Math.min(r.end, line.length - 1), color: ti.color });
        }
      }
      colorSegments.sort((a, b) => a.begin - b.begin);

      let colored = '';
      let pos = 0;
      for (const seg of colorSegments) {
        if (seg.begin > pos) colored += c.gray + line.slice(pos, seg.begin);
        const endCol = seg.end + 1;
        if (endCol > pos) colored += seg.color + line.slice(Math.max(seg.begin, pos), endCol);
        pos = Math.max(pos, endCol);
      }
      if (pos < line.length) colored += c.gray + line.slice(pos);
      console.error(`${lineLabel}${colored}${c.reset}`);

      // Below annotations.
      if (belowInfo.length) {
        const rendered = this._renderAnnotations(blankGutter, gutterLen, belowInfo, cols);
        let prev = '';
        for (const l of rendered) { if (l !== prev) console.error(l); prev = l; }
      }

      // Timing line underneath everything rendered for this source line.
      if (timingLine) console.error(`${blankGutter}${timingLine}`);

      console.error('');
    }
  }

  /**
   * Format a per-line timing line, one aggregate per unique phase:
   *   - 1 sample of phase X:  `0.5ms`  (in X's level color)
   *   - N samples of phase X: `N * ~<avg>ms = <total>ms`  (numbers colored;
   *                           `*`, `~`, `=` in dark gray)
   * Phases are joined by a dark-gray `, ` and the whole line is prefixed
   * with a dark-gray `$ `. Trace-level timings are dropped — they'd flood
   * each line at DEBUG=trace; the per-phase aggregate tree at the bottom
   * of `print()` is the place to read them. Debug+ level timings render.
   */
  private _formatTimingLine(timings: Diagnostic[]): string | null {
    const { c } = Diagnostics;
    const visible = timings.filter(t =>
      t.clock &&
      DIAGNOSTIC_SEVERITY[t.level] >= DIAGNOSTIC_SEVERITY.debug &&
      Diagnostics.showLevel(t.level));
    if (!visible.length) return null;

    // Group by phase, preserving first-seen order.
    const order: string[] = [];
    const byPhase = new Map<string, Diagnostic[]>();
    for (const t of visible) {
      if (!byPhase.has(t.phase)) { byPhase.set(t.phase, []); order.push(t.phase); }
      byPhase.get(t.phase)!.push(t);
    }

    const parts = order.map(phase => {
      const group = byPhase.get(phase)!;
      const color = Diagnostics.levelColor[group[0].level];
      const total = group.reduce((a, t) => a + (t.clock?.ms ?? 0), 0);
      const suffix = ` ${color}${phase}${c.reset}`;
      if (group.length === 1) {
        return `${color}${total.toFixed(2)}ms${c.reset}${suffix}`;
      }
      const avg = total / group.length;
      return `${color}${group.length}${c.reset}${c.dark_gray} * ~${c.reset}${color}${avg.toFixed(2)}ms${c.reset}` +
             `${c.dark_gray} = ${c.reset}${color}${total.toFixed(2)}ms${c.reset}${suffix}`;
    });

    return `${c.dark_gray}$ ${c.reset}` + parts.join(`${c.dark_gray}, ${c.reset}`);
  }

  /**
   * Render annotations one at a time in order, returning groups of lines.
   * Each group = [connector line (if needed), description lines, error lines].
   * First group starts with the initial connector for all annotations.
   */
  private _renderAnnotationGroups(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; color: string; diags: Diagnostic[] }[],
    cols: number,
    pipesFrom: 'after' | 'before' = 'after'
  ): string[][] {
    const { c } = Diagnostics;
    const groups: string[][] = [];

    for (let i = 0; i < annotations.length; i++) {
      const t = annotations[i];
      // 'after': pipes for annotations not yet rendered (below style)
      // 'before': pipes for annotations already rendered (above style)
      const remaining = pipesFrom === 'after' ? annotations.slice(i + 1) : annotations.slice(0, i);
      const prefixLen = gutterLen + t.col;
      const fullAvailable = cols - prefixLen;
      // If there are pipes to the right, wrap text before the first pipe
      // so pipes can appear on every line — but only if it leaves at least 30 chars.
      const sorted_remaining = [...remaining].sort((a, b) => a.col - b.col);
      const firstPipeAfterText = sorted_remaining.find(r => r.col > t.col);
      const pipeGap = firstPipeAfterText ? firstPipeAfterText.col - t.col - 1 : fullAvailable;
      const pipeAwareAvailable = pipeGap >= 30 ? pipeGap : fullAvailable;
      const group: string[] = [];

      // Connector line.
      // 'after': this + all not-yet-rendered (pipes extend toward source)
      // 'before': only passthrough pipes for already-rendered annotations (not this one's own pipe)
      if (pipesFrom === 'after') {
        group.push(this._connectorLine(blankGutter, gutterLen, annotations.slice(i)));
      } else if (pipesFrom === 'before' && remaining.length) {
        group.push(this._connectorLine(blankGutter, gutterLen, remaining));
      }

      // Emit a text line with pipes for remaining annotations.
      // contentCol: where actual non-space content starts (for continuation lines,
      // pipes can be placed in the space between t.col and contentCol).
      const emit = (text: string, plainLen: number, contentCol?: number): boolean => {
        const sorted = [...remaining].sort((a, b) => a.col - b.col);
        const actualContentStart = contentCol ?? t.col;
        const actualContentEnd = t.col + plainLen;
        let line = blankGutter;
        let lpos = 0;
        let overlapped = false;

        // Build from left to right: interleave pipes and text
        // Passthrough pipes use gray; own pipe keeps its color
        const pipeColor = c.gray;

        // Phase 1: space/pipes before t.col (all passthrough)
        for (const r of sorted) {
          if (r.col < t.col && r.col >= lpos) {
            if (r.col > lpos) line += ' '.repeat(r.col - lpos);
            line += `${pipeColor}|${c.reset}`;
            lpos = r.col + 1;
          }
        }
        if (t.col > lpos) { line += ' '.repeat(t.col - lpos); lpos = t.col; }

        // Phase 2: the padding zone (t.col to actualContentStart) — pipes can go here
        if (contentCol) {
          const contentText = text.slice(contentCol - t.col);

          // Collect all pipes in the padding zone: all gray
          // Own pipe only needed in 'before' mode (above) where it connects down to source
          const paddingPipes = [
            ...(pipesFrom === 'before' ? [{ col: t.col, pipeCol: pipeColor }] : []),
            ...sorted.filter(r => r.col >= t.col && r.col < actualContentStart).map(r => ({ col: r.col, pipeCol: pipeColor }))
          ].sort((a, b) => a.col - b.col);

          for (const p of paddingPipes) {
            if (p.col >= lpos) {
              if (p.col > lpos) line += ' '.repeat(p.col - lpos);
              line += `${p.pipeCol}|${c.reset}`;
              lpos = p.col + 1;
            }
          }
          if (actualContentStart > lpos) { line += ' '.repeat(actualContentStart - lpos); lpos = actualContentStart; }
          line += contentText;
          lpos = actualContentEnd;
        } else {
          line += text;
          lpos = actualContentEnd;
        }

        // Phase 3: pipes after the text (all passthrough)
        for (const r of sorted) {
          if (r.col < actualContentStart) continue; // already handled
          if (r.col >= actualContentStart && r.col < actualContentEnd) {
            overlapped = true;
          } else if (r.col >= lpos + 1) {
            line += ' '.repeat(r.col - lpos);
            line += `${pipeColor}|${c.reset}`;
            lpos = r.col + 1;
          } else {
            overlapped = true;
          }
        }
        group.push(line);
        return overlapped;
      };

      // Render each diagnostic in this group under one pipe:
      //   trace-level → the message (or phase) in the level's color
      //   otherwise  → labeled "error[phase]: message"
      let needsConnector = false;
      for (const diag of t.diags) {
        const diagColor = Diagnostics.levelColor[diag.level] ?? t.color;
        if (diag.level === 'trace') {
          const text = diag.message ?? diag.phase;
          const descLines = this._wrapToLines(text, Math.max(pipeAwareAvailable, 10));
          for (const dl of descLines) {
            if (emit(`${diagColor}${dl}${c.reset}`, dl.length)) needsConnector = true;
          }
        } else {
          const { colored: label, plain: labelPlain } = this.formatDiagnosticLabel(diag);
          const diagAvail = Math.max(pipeAwareAvailable - labelPlain.length, 10);
          const msgLines = this._wrapToLines(diag.message ?? '', diagAvail);
          const contTextCol = t.col + labelPlain.length;
          for (let mi = 0; mi < msgLines.length; mi++) {
            if (mi === 0) {
              if (emit(`${label}${msgLines[mi]}`, labelPlain.length + msgLines[mi].length)) needsConnector = true;
            } else {
              const pad = ' '.repeat(labelPlain.length);
              if (emit(`${pad}${msgLines[mi]}`, labelPlain.length + msgLines[mi].length, contTextCol)) needsConnector = true;
            }
          }
        }
      }

      // Skip overlap connector — the next group's connector already shows the pipes.

      groups.push(group);
    }

    return groups;
  }

  /** Flatten annotation groups into lines (for below, which doesn't need reversal) */
  private _renderAnnotations(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; color: string; diags: Diagnostic[] }[],
    cols: number,
    pipesFrom: 'after' | 'before' = 'after'
  ): string[] {
    const lines = this._renderAnnotationGroups(blankGutter, gutterLen, annotations, cols, pipesFrom).flat();

    // Post-process: drop connector-only lines whose pipe positions are all
    // already present on the previous line (as | characters at the same columns).
    const merged: string[] = [];
    for (const line of lines) {
      if (merged.length === 0) { merged.push(line); continue; }
      const curPlain = line.replace(/\x1b\[[0-9;]*m/g, '');
      const isConnectorOnly = /^[\s|]*$/.test(curPlain) && curPlain.includes('|');
      if (!isConnectorOnly) { merged.push(line); continue; }

      // Get pipe positions from current connector line
      const curPipes = new Set<number>();
      for (let k = 0; k < curPlain.length; k++) if (curPlain[k] === '|') curPipes.add(k);

      // Check if previous line has | at all those positions
      const prevPlain = merged[merged.length - 1].replace(/\x1b\[[0-9;]*m/g, '');
      let allPresent = true;
      for (const col of curPipes) {
        if (prevPlain[col] !== '|') { allPresent = false; break; }
      }

      if (!allPresent) merged.push(line);
      // else: skip — previous line already shows these pipes
    }
    return merged;
  }

  /** Build a line with | connectors. Primary pipe keeps its color, others are gray. */
  private _connectorLine(blankGutter: string, gutterLen: number, traces: { col: number; color: string }[], primaryCol?: number): string {
    const { c } = Diagnostics;
    const sorted = [...traces].sort((a, b) => a.col - b.col);
    let line = blankGutter;
    let pos = 0;
    for (const t of sorted) {
      if (t.col > pos) line += ' '.repeat(t.col - pos);
      const color = (primaryCol !== undefined && t.col === primaryCol) ? t.color : c.gray;
      line += `${color}|${c.reset}`;
      pos = t.col + 1;
    }
    return line;
  }

  /** Format a diagnostic label: level in appropriate color (only error/warning bold), [phase] in gray */
  formatDiagnosticLabel(d: Diagnostic): { colored: string; plain: string } {
    const { c } = Diagnostics;
    const color = Diagnostics.levelColor[d.level];
    return {
      colored: `${color}${d.level}${c.reset}${c.gray}[${d.phase}]${c.reset}: `,
      plain: `${d.level}[${d.phase}]: `
    };
  }

  /** Word-wrap text into lines at word boundaries */
  private _wrapToLines(text: string, available: number): string[] {
    if (available < 10 || text.length <= available) return [text];
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (test.length > available && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }


  /**
   * Merged output:
   *   1. Per-program inline annotated source (timing line beneath each source line)
   *   2. Flat summary — errors, warnings, and traces that carry a stacktrace
   */
  print() {
    const exec = this._start.wall; // execution time captured before rendering, so it excludes the cost of printing diagnostics
    const { c } = Diagnostics;

    // 1. Inline annotated source. `items` is already keyed by file —
    //    each non-undefined bucket is one file's diagnostics. Entries
    //    without a file (`undefined` bucket) just don't get rendered
    //    inline (they show up in the flat summary below).
    for (const [file, items] of this.items) {
      if (!file) continue;
      const source = items.find(d => d.node?.source.value)?.node?.source.value ?? '';
      if (!source) continue;
      this._printFile(file, source, items);
    }

    // 2. Flat list: skip timings, and skip traces that don't carry a stack.
    const flat: Diagnostic[] = [];
    for (const d of this.all()) {
      if (d.superseded) continue;
      if (d.clock) continue;
      if (!Diagnostics.showLevel(d.level)) continue;
      if (d.level === 'trace' && (!d.diagnostics || !d.diagnostics.length)) continue;
      flat.push(d);
    }
    const errs = this.errors, warns = this.warnings;

    if (flat.length === 0) {
      console.error(`  ${c.gray}No errors.${c.reset}`);
    } else {
      for (const d of flat) {
        const { colored: label } = this.formatDiagnosticLabel(d);
        // `.do` guarantees every stack frame carries source, so if d.node
        // lacks it the topmost stack frame is a reliable fallback.
        const locNode = d.node?.file ? d.node : d.diagnostics?.[d.diagnostics.length - 1]?.node;
        if (d.level === 'fatal') {
          console.error('');
          console.error(`${label}${d.message ?? ''}`);
          continue;
        }
        if (locNode?.file) console.error(`${c.gray}${locNode.file}:${locNode.line}:${locNode.col}${c.reset}`);
        console.error(`  ${label}${d.message ?? ''}`);
        if (d.diagnostics?.length) {
          // Most-recent first (innermost = where the error fired, callers
          // below). The stack was pushed oldest-first, so reverse it.
          const visible = d.diagnostics.filter(f => Diagnostics.showLevel(f.level)).reverse();
          for (let i = 0; i < visible.length; i++) {
            const frame = visible[i];
            const phaseColor = Diagnostics.levelColor[frame.level];
            const fn = frame.node;
            // Strip trailing "(file:line:col)" if it would duplicate the
            // error header's location (the frame above us in the display) or
            // the next visible frame's location (the caller below).
            const next = visible[i + 1]?.node;
            const dup = fn?.sameCursor(locNode) || (!!next && fn?.sameCursor(next));
            const at = fn?.file && !dup
              ? ` ${c.gray}(${fn.file}:${fn.line}:${fn.col})${c.reset}`
              : '';
            console.error(`    ${c.gray}at ${phaseColor}${frame.phase}${c.reset}${at}`);
          }
        }
      }
    }

    // 3. Per-phase timing tree (debug-level data — gate on debug
    //    visibility). Built incrementally in `_timing` as timing
    //    diagnostics were reported — a call tree, not a flat list: a
    //    phase appears under every caller it actually had, recursion
    //    folded onto its outermost node. The `(total)` line sums root
    //    phases only — child timings are already inside their parent's
    //    clocked range.
    if (Diagnostics.showLevel('debug')) {
      type TNode = Timing;
      const rootChildren = this.timings;
      if (rootChildren.size) {
        // Depth-first walk. `prefix` carries ancestor pipes (`│  ` while an
        // ancestor still has siblings below, `   ` once it doesn't);
        // `branch` is this line's own elbow (`├─ `/`└─ `, empty for roots).
        const lines: { prefix: string; branch: string; node: TNode }[] = [];
        const visit = (node: TNode, prefix: string, branch: string) => {
          lines.push({ prefix, branch, node });
          const kids = [...node.children.values()].sort((a, b) => b.ms - a.ms);
          const childPrefix = branch === '' ? '' : prefix + (branch === '└─ ' ? '   ' : '│  ');
          for (let i = 0; i < kids.length; i++) {
            visit(kids[i], childPrefix, i === kids.length - 1 ? '└─ ' : '├─ ');
          }
        };
        const roots = [...rootChildren.values()].sort((a, b) => b.ms - a.ms);
        for (const root of roots) visit(root, '', '');
        // Total: sum of root totals — each root's time already includes its
        // whole subtree.
        let totalMs = 0;
        for (const root of roots) totalMs += root.ms;
        // Width: longest "<prefix><branch><phase>" so the right column lines
        // up regardless of nesting depth.
        const phaseW = Math.max(...lines.map(l => l.prefix.length + l.branch.length + l.node.phase.length), 7);
        console.error(`\n  ${c.dim}timings (per phase, DEBUG=1):${c.reset}`);
        let first = true;
        for (const { prefix, branch, node } of lines) {
          // Blank line between top-level subtrees so each separates visually.
          if (prefix === '' && branch === '' && !first) console.error('');
          first = false;
          const color = Diagnostics.levelColor[node.level] ?? c.gray;
          const avg = node.ms / node.count;
          // Connectors in dark gray so they recede; the phase keeps its level color.
          const connector = `${c.dark_gray}${prefix}${branch}${c.reset}`;
          const padding = ' '.repeat(phaseW - prefix.length - branch.length - node.phase.length);
          console.error(
            `    ${connector}${color}${node.phase}${c.reset}${padding}` +
            ` ${c.dark_gray}${String(node.count).padStart(6)}×${c.reset}` +
            ` ${color}${node.ms.toFixed(2).padStart(8)}ms${c.reset}` +
            ` ${c.dark_gray}avg ${avg.toFixed(3)}ms${c.reset}`
          );
        }
        console.error(
          `    ${c.dim}${'(total)'.padEnd(phaseW)}${c.reset}` +
          ` ${' '.repeat(7)}` +
          ` ${c.dim}${totalMs.toFixed(2).padStart(8)}ms${c.reset}`
        );
      }
    }

    const parts: string[] = [];
    if (errs.length) parts.push(`${Diagnostics.levelColor.error}${errs.length} error${errs.length > 1 ? 's' : ''}${c.reset}`);
    if (warns.length) parts.push(`${Diagnostics.levelColor.warning}${warns.length} warning${warns.length > 1 ? 's' : ''}${c.reset}`);
    const execStr = `${exec.toFixed(2)}ms`;
    if (parts.length) console.error(`\n  ${parts.join(', ')}${c.gray}, ${this._start.toString()}${c.reset} ${c.dark_gray}${execStr}${c.reset}`);
    else console.error(`\n  ${c.gray}${this._start.toString()}${c.reset} ${c.dark_gray}${execStr}${c.reset}`);
  }
}

// ─── Instrumentation decorator ───────────────────────────────────────
//
// A class-level annotation that wraps every method with the same
// frame-push + clock + emit sequence `Node.do(level, phase, fn)` runs
// inline. The dominant cost is `.do`'s body itself (Clock + Diagnostic
// alloc + push/pop), which we already gate on `Diagnostics.showLevel`
// to short-circuit when the level is below the display threshold. The
// decorator adds one extra function frame per call (~10–50ns once V8
// has warmed up the call site).
//
// For *zero* runtime overhead, the only honest answer is AOT codegen
// (a TS transformer that inlines this at every annotated call site).
// That's a build-step concern; this is the runtime version.
//
// Two decorators:
//   - `@instrument(level, phase?)` — wrap one method explicitly.
//   - `@instrumented(level)` — class-level; walks the prototype at
//     class-init and wraps every own method (skip `@uninstrumented`
//     ones). Wrapping happens once at class init, so V8 sees stable
//     prototype methods after that.

/** Minimum host shape the decorator needs. The real `Node` (via
 *  `node.program.stack` + `node.program.log`) satisfies this with a small
 *  adapter — see `Instrumentable`. */
export interface InstrumentationCtx {
  /** Push a stack frame. Errors snapshot this stack. */
  stack: Diagnostic[]
  /** Where reports go. */
  log: Diagnostics;
}

/** Hosts return the context the decorator should drive. Build it once
 *  per instance and cache; the wrapper calls this on every method
 *  invocation. */
export interface Instrumentable {
  __instrumentation: InstrumentationCtx | undefined;
  /** Text.Node the wrapper attaches to its frame + timing diagnostics so
   *  errors fired inside the call have a real source location and the
   *  display can render the timing line at the right place. Real Node
   *  satisfies this (it extends `Text.Node`); test mocks return a
   *  cursor-bearing Text.Node of their own. */
  readonly position: Text.Node;
}

const EXCLUDED = Symbol('uninstrumented');

// Decorators are written to handle both signatures so the same source
// works whether the host transpiler emits legacy (`__decorate`) or ES
// standard (`__decorateElement`) decorators:
//   - Legacy method:  (target, key, descriptor) → returns descriptor
//   - ES standard:    (value, context)          → returns value
//   - Legacy class:   (constructor)             → returns constructor
//   - ES standard:    (value, context)          → returns value
// Detection: ES standard always passes a `context` object whose
// `kind` field identifies the form; legacy method decorators pass a
// PropertyDescriptor as the third arg.

/** Two roles, one decorator (kind inferred from the target):
 *
 *  - **Method:** mark its time as `excluded` from the parent's clock —
 *    the `@instrumented` walk wraps it with `excluded: true`, so calls
 *    still push a frame and time themselves but the duration is
 *    subtracted from the surrounding phase rather than emitted. For
 *    incidental work (logging, diagnostic emission) that shouldn't
 *    inflate the caller's reported time.
 *
 *  - **Field:** opt the field out of recursive cascade. The cascade
 *    walk (`recurse`, driven by `@instrumented(..., { recursive: true })`)
 *    skips this field on every instance — its value's class isn't
 *    wrapped, no HOST stamped, no descent. Use to keep cascades out of
 *    subgraphs that would loop or aren't meaningful (e.g. `Runtime.log`
 *    — descending into Diagnostics would re-enter the wrapper's own
 *    report cycle). The opt-out set is stamped on the class's
 *    prototype under the same `EXCLUDED` symbol used by methods —
 *    shapes don't collide (function gets a boolean, prototype gets a
 *    Set of field names). */
export function uninstrumented(targetOrValue: any, keyOrContext: any, descriptor?: PropertyDescriptor): any {
  // ES standard form: (value, context). `context.kind` distinguishes
  // method (value is the function) from field (value is the field's
  // initializer return / undefined; access happens via initializer).
  if (descriptor === undefined && keyOrContext && typeof keyOrContext === 'object' && 'kind' in keyOrContext) {
    if (keyOrContext.kind === 'field') {
      const name = String(keyOrContext.name);
      keyOrContext.addInitializer?.(function (this: any) {
        const proto = Object.getPrototypeOf(this);
        const own = Object.prototype.hasOwnProperty.call(proto, EXCLUDED);
        const set: Set<string> = own ? proto[EXCLUDED] : new Set<string>(proto[EXCLUDED] ?? []);
        if (!own) Object.defineProperty(proto, EXCLUDED, { value: set, writable: true, configurable: true });
        set.add(name);
      });
      return targetOrValue;
    }
    if (typeof targetOrValue === 'function') (targetOrValue as any)[EXCLUDED] = true;
    return targetOrValue;
  }
  // Legacy form: descriptor present → method/accessor; descriptor absent → field.
  // (Legacy field decorators get `(prototype, fieldName)` with no descriptor.)
  if (descriptor === undefined) {
    const proto = targetOrValue;
    const own = Object.prototype.hasOwnProperty.call(proto, EXCLUDED);
    const set: Set<string> = own ? proto[EXCLUDED] : new Set<string>(proto[EXCLUDED] ?? []);
    if (!own) Object.defineProperty(proto, EXCLUDED, { value: set, writable: true, configurable: true });
    set.add(String(keyOrContext));
    return;
  }
  if (typeof descriptor.value === 'function') (descriptor.value as any)[EXCLUDED] = true;
  return descriptor;
}

/** Wrap one method explicitly. `phase` defaults to the method name. */
export function instrument(level: Diagnostic['level'] = 'debug', phase?: string) {
  return function (targetOrValue: any, keyOrContext: any, descriptor?: PropertyDescriptor): any {
    // ES standard form: (value, context).
    if (descriptor === undefined) {
      if (typeof targetOrValue !== 'function') return targetOrValue;
      const name = phase ?? String(keyOrContext?.name ?? '');
      const original = targetOrValue as (...args: any[]) => any;
      const wrapped = wrap(original, level, name, { excluded: !!(original as any)[EXCLUDED] });
      Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
      return wrapped;
    }
    // Legacy form: (target, key, descriptor).
    const name = phase ?? String(keyOrContext);
    if (typeof descriptor.value === 'function') {
      const original = descriptor.value as (...args: any[]) => any;
      const wrapped = wrap(original, level, name, { excluded: !!(original as any)[EXCLUDED] });
      Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
      descriptor.value = wrapped;
    }
    return descriptor;
  };
}

/** Per-prototype marker — `wrap_prototype` reads it to skip prototypes
 *  it's already wrapped. Without this, recursive cascades from multiple
 *  decorated classes (or repeated walks per call) would re-wrap a method
 *  with another wrapper around the existing one. */
const WRAPPED = Symbol('instrumented');

/** Per-instance memo — the own-field count `recurse` saw the last time it
 *  walked this instance. `recurse`'s only job is discovering newly-reachable
 *  instrumentable classes; if an instance's field set is unchanged since the
 *  last walk there's nothing new to find, so we skip it. Lazily-populated
 *  fields (e.g. `Node._right` on first `.direction` access, `Node._methods`
 *  on first `.methods`) grow the count and force exactly one re-walk. This
 *  keeps the steady state O(1) per call instead of re-walking the whole
 *  object graph on every instrumented method — hot scan methods (`peek` /
 *  `done` in `capture_while` loops) otherwise drive it into the millions. */
const WALKED = Symbol('recurse_field_count');

/** Per-frame Timing node + per-ctx path registry for the O(1) trace fold. */
const TIMING = Symbol('timing_node');
const PATH = Symbol('timing_path');

/** Per-instance back-pointer to the host that cascaded into this object.
 *  Cascaded subobjects (e.g. a `Direction` reached via `Node._left`)
 *  don't define their own `__instrumentation` — the framework stamps
 *  this symbol on them at recurse time, and the wrapper reads it to find
 *  the host's ctx. Lets a class be cascade-discoverable without
 *  referencing the instrumentation framework in its source. */
const HOST = Symbol('instrumentation_host');

/** Skip wrapping built-in JS classes (Map, Set, Date, …). Their
 *  prototypes are global; wrapping them would corrupt every instance in
 *  the program. `Function.prototype.toString` on a native function
 *  contains `[native code]`; user-defined classes don't. */
function is_native(ctor: any): boolean {
  return Function.prototype.toString.call(ctor).includes('[native code]');
}

/** Wrap every own method on `proto` exactly once. Idempotent — the
 *  `WRAPPED` marker breaks cycles (Direction's position points back to
 *  the Node that holds it; Node's _left / _right point forward to the
 *  Direction; without the marker we'd loop). */
function wrap_prototype(proto: any, level: Diagnostic['level'], recursive: boolean): void {
  if (proto[WRAPPED]) return;
  proto[WRAPPED] = true;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    // Auto-skip the `Instrumentable` framework hook — wrapping it would
    // infinite-recurse, since the wrapper itself reads `__instrumentation`
    // to fetch the ctx. Saves every host class from having to remember
    // `@uninstrumented` on this one method.
    if (name === '__instrumentation') continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc) continue;
    if (typeof desc.value !== 'function') continue;     // skip getters/setters
    const original = desc.value as (...args: any[]) => any;
    const wrapped = wrap(original, level, name, { excluded: !!(original as any)[EXCLUDED], recursive });
    Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
    Object.defineProperty(proto, name, { ...desc, value: wrapped });
  }
}

/** Walk `instance`'s own enumerable fields. For each value that's a
 *  user-defined class instance (not a JS built-in) and not the same
 *  class as any seen so far, wrap that class's prototype, stamp HOST on
 *  it, and recurse into its fields. Plain objects, primitives, arrays,
 *  Maps, etc. are filtered by `is_native`; same-class fields (e.g.
 *  Node._super → Node) are filtered by `seen`. Lazily-created subobjects
 *  (e.g. Node._left becoming a Direction on first access) get picked up
 *  the next call after their field is populated.
 *
 *  Cascaded subobjects (those with HOST already set) skip the walk
 *  entirely — they live inside another host's tree, their prototypes
 *  were already wrapped via that host's recurse, and they shouldn't
 *  override anyone else's HOST. The WRAPPED marker on prototypes makes
 *  the steady state a tight identity-check loop with no allocations
 *  beyond this walk's own stack + seen Set. */
function recurse(instance: any, level: Diagnostic['level']): void {
  if (instance[HOST]) return;
  // Skip the walk when nothing's changed since last time. Only the top
  // instance is memoized: every subobject the walk reaches gets a HOST
  // stamp and so short-circuits above. `WALKED` is a Symbol, so stamping
  // it doesn't perturb the `Object.keys` count it stores.
  const keyCount = Object.keys(instance).length;
  if (instance[WALKED] === keyCount) return;
  instance[WALKED] = keyCount;

  // The host is whatever exposes a ctx. Usually that's the entry instance
  // itself (a Node), and the walk stamps HOST downward onto its subobjects.
  // But the wrapper also calls recurse on subobjects themselves (e.g. every
  // `Direction.peek`), and those have no ctx — walking only downward would
  // wrap their prototypes yet never give *them* a host, so their wrappers
  // bail and the cascade silently misses them. So resolve the host in
  // whichever direction it lies: if the entry has no ctx, the first reachable
  // object that does (e.g. `Direction.position` → its Node) becomes the host,
  // and the entry + the rest of the graph are stamped to point at it.
  let host: any = instance.__instrumentation ? instance : undefined;
  const pending: any[] = [];                           // ctx-less objects awaiting a host stamp
  const seen = new Set<any>([instance.constructor]);
  const stack: any[] = [instance];
  while (stack.length) {
    const cur = stack.pop()!;
    // Per-instance-class set of field names declared `@uninstrumented`
    // — those fields are invisible to cascade. Reads through the
    // prototype chain so subclasses inherit the opt-outs. Reuses the
    // same `EXCLUDED` symbol the method form stamps onto functions:
    // shapes don't collide (function → boolean, prototype → Set).
    const opt: Set<string> | undefined = cur[EXCLUDED];
    for (const key of Object.keys(cur)) {
      if (opt?.has(key)) continue;
      const v = cur[key];
      if (!v || typeof v !== 'object') continue;
      const ctor = v.constructor;
      if (!ctor || seen.has(ctor) || is_native(ctor)) continue;
      seen.add(ctor);
      wrap_prototype(ctor.prototype, level, true);    // cascade is always recursive itself
      const ctx = v.__instrumentation;
      if (ctx) { if (!host) host = v; }                // a host candidate (e.g. a Node)
      else pending.push(v);                            // needs a HOST back-pointer
      stack.push(v);
    }
  }
  if (!host) return;                                   // nothing instrumentable reachable
  if (host !== instance && !instance.__instrumentation) instance[HOST] = host;
  for (const v of pending) v[HOST] = host;             // ctx back-pointer for the wrapper
}

/** Wrap every own method on the class.
 *
 *  `recursive` cascades the wrap to Instrumentable subobjects discovered
 *  on each instance — at the top of every wrapped method, walk this
 *  instance's fields and (idempotently) wrap any reachable class that
 *  exposes `__instrumentation` and isn't `this`'s own class. Use it when
 *  a class delegates work to peer objects you'd want to see as their own
 *  frames in the trace (e.g. `Node` holding `Direction` via _left/_right).
 *  The cascaded objects route through *this* host's ctx — they implement
 *  `__instrumentation` as a delegation back to whichever field of theirs
 *  points at the host (e.g. Direction.__instrumentation → position's). */
export function instrumented(
  level: Diagnostic['level'] = 'debug',
  options: { recursive?: boolean } = {},
) {
  // Both legacy and ES standard class decorators get the constructor
  // as the first argument, so the prototype walk works for either.
  return function <T extends new (...args: any[]) => any>(target: T, _context?: any): T {
    wrap_prototype(target.prototype, level, !!options.recursive);
    return target;
  };
}

/** Closure-once-per-method. Captured `level`, `name`, and `excluded`
 *  keep the wrapper monomorphic across all calls to this method. When
 *  the captured `level` is below the display threshold, `wrap` returns
 *  `original` directly — no wrapper, no per-call check.
 *
 *  Reported timing reflects real work only. On exit the wrapper:
 *    - measures its own pre-body and post-body bookkeeping (clock alloc,
 *      stack push/pop, `report` call) and adds that to every ancestor
 *      frame's `clock.excluded` — so a method's reported time is body
 *      time, not body + N children's wrapper tax;
 *    - if `excluded` is true (the `@uninstrumented` path), additionally
 *      adds the body itself to every ancestor's exclusion and skips
 *      `report`, treating the call as incidental work that shouldn't
 *      show in the timing tree at all. */
function wrap<Args extends any[], Ret>(
  original: (this: Instrumentable, ...args: Args) => Ret,
  level: Diagnostic['level'],
  name: string,
  options: { excluded?: boolean, recursive?: boolean } = {},
): (this: Instrumentable, ...args: Args) => Ret {
  if (!Diagnostics.showLevel(level)) return original;
  const { excluded = false, recursive = false } = options;

  const trace = level === 'trace';

  return function (this: Instrumentable, ...args: Args): Ret {
    const clock = new Clock();
    // Recursive cascade: discover Instrumentable subobjects on this
    // instance and wrap their prototypes too. Cheap on the steady state
    // — every reachable class has its WRAPPED marker, so the inner
    // branches collapse to identity + symbol checks.
    if (recursive) recurse(this, level);
    // Hosts (classes that defined `__instrumentation` themselves) use
    // their own ctx. Cascaded subobjects (no `__instrumentation` of
    // their own — e.g. Direction) follow the HOST back-pointer the
    // recurse walk stamped on them and route through the host's ctx.
    // No ctx anywhere → call through (e.g. a Direction created on a
    // plain Text.Node with no host upstream).
    const ctx = this.__instrumentation ?? (this as any)[HOST]?.__instrumentation;
    if (!ctx) return original.apply(this, args);
    // Snapshot position once per call so frame + timing share the same
    // location even if `this.position` mutates while the body runs
    // (e.g. parser advances its cursor). The receiver doubles as the
    // diagnostic node so anything reported inside the body lands on
    // the right source location. Cascaded subobjects (no `position` of
    // their own — e.g. Value, Methods) borrow the host's node, same as
    // the ctx fallback above; without a node `report` can't re-derive
    // the ctx for the stack snapshot, and the frame floats up as a root.
    if (excluded) clock.excluded = true;
    const node = this.position ?? (this as any)[HOST]?.position;
    const frame: Diagnostic = { level, phase: name, node, clock };
    // Trace timings fold straight into the call tree, O(1) per call —
    // no Diagnostic retention, no stack walk. The tree position comes
    // from the parent frame's node; a per-ctx path registry collapses
    // recursion onto its outermost node. (Debug+ instruments are rare
    // and go through `report` below instead.)
    let tnode: Timing | undefined;
    let re_entered = false;
    if (trace) {
      const parent_frame = ctx.stack.length ? ctx.stack[ctx.stack.length - 1] : undefined;
      const parentT: Timing | undefined = parent_frame ? (parent_frame as any)[TIMING] : undefined;
      if (excluded) (frame as any)[TIMING] = parentT;
      else {
        const path: Map<string, { node: Timing; n: number }> = ((ctx as any)[PATH] ??= new Map());
        let entry = path.get(name);
        re_entered = !!entry;
        if (!entry) {
          // Inlined (not ctx.log.timing(...)): the cascade may have wrapped
          // Diagnostics itself, and a wrapper calling a wrapped method from
          // inside its own bookkeeping would recurse forever.
          const map = parentT ? parentT.children : ctx.log.timings;
          let into = map.get(name);
          if (!into) map.set(name, into = { phase: name, level, ms: 0, count: 0, children: new Map() });
          path.set(name, entry = { node: into, n: 0 });
        }
        entry.n++;
        tnode = entry.node;
        (frame as any)[TIMING] = tnode;
      }
    }
    ctx.stack.push(frame);
    clock.body();
    try { return original.apply(this, args); }
    finally {
      clock.done();
      ctx.stack.pop();
      clock.stop();
      if (!excluded) {
        if (tnode) {
          tnode.count++;
          if (!re_entered) tnode.ms += clock.ms;
          const path = (ctx as any)[PATH] as Map<string, { node: Timing; n: number }>;
          const entry = path.get(name);
          if (entry && --entry.n <= 0) path.delete(name);
        } else if (!trace) ctx.log.report(frame);
      }
      // Fold this call's tax into the immediate parent — numbers only,
      // the clock itself is garbage the moment this frame unwinds.
      const parent = ctx.stack.length > 0 ? ctx.stack[ctx.stack.length - 1].clock : undefined;
      if (parent) parent.taxed += clock.tax;
    }
  };
}

/** The slice of every wrapped call no clock can measure about itself — the
 *  wrapper invocation, the `Clock` allocation, and the `performance.now()`
 *  that stamps `a` — all happen before `a`, so they never land in any
 *  `overhead` and instead inflate the *parent's* raw (and only the parent's,
 *  since the child never sees them). It's ~constant per call, so calibrate it
 *  once: run a wrapped no-op many times and take, per call, the wall the loop
 *  paid minus the wall the call's own clock accounted for (raw + overhead).
 *  `Clock.ms` adds this back per descendant so a parent isn't billed for its
 *  children's unmeasurable birth cost. Lazy + memoized; 0 when instrumentation
 *  is off (nothing was wrapped, so nothing leaked). */
let _birthMs: number | undefined;
function birthCost(): number {
  if (_birthMs !== undefined) return _birthMs;
  if (!Diagnostics.showLevel('trace')) return _birthMs = 0;
  let accounted = 0;
  const ctx: any = { stack: [], log: { report(d: Diagnostic) { accounted += d.clock!.raw + d.clock!.overhead; } } };
  const host: any = { __instrumentation: ctx };
  // Calibrate via the report path ('debug' level) — the trace fold needs a
  // real timing tree on the log, and the per-call cost profile is the same.
  const noop = wrap(function (this: unknown) {}, 'debug', '__calibrate__', {});
  for (let i = 0; i < 2000; i++) noop.call(host);            // warm the JIT
  let best = Infinity;
  for (let trial = 0; trial < 5; trial++) {
    accounted = 0;
    const N = 1 << 15;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) noop.call(host);
    const leaked = (performance.now() - t0 - accounted) / N;  // wall the clocks couldn't see
    best = Math.min(best, leaked);
  }
  return _birthMs = best > 0 ? best : 0;
}
