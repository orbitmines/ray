import type { Text } from "./source.ts";
import { env } from "./node.js.ts";

// Ether's version, read once from the package manifest. Shown where a
// diagnostic's phase used to be — the console label and the LSP `code`.
let _version: string | undefined;
export function version(): string {
  if (_version !== undefined) return _version;
  try { return _version = JSON.parse(env.fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version; }
  catch { return _version = '?'; }
}

export interface Diagnostic {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'trace';
  node?: Text.Node;
  message?: string;
  /** The expression this diagnostic fired in (parser-owned). `report` uses it
   *  for cascade dedup: the first error/fatal marks it, later errors on the
   *  same expression are dropped as the first one propagating. */
  expression?: Expression;
}

/** Cascade-dedup handle: the parser (minimal.ts) gives every expression one
 *  and tags diagnostics with the one they fired in; `report` flips `errored`.
 *  Structural so diagnostics.ts needn't import the parser's `Expression`. */
export interface Expression { errored?: boolean }

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = {
  trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5,
};

export class Diagnostics {
  /** Per-file Diagnostic lists in insertion order. Diagnostics whose node
   *  doesn't carry a file (synthetic verify fatal, framework-internal
   *  reports) go under the `undefined` key. The LSP reads `items.get(file)`
   *  to publish per-uri; `print()` iterates by file for source rendering;
   *  flat-iterating consumers walk every bucket via `all()`. */
  items: Map<string | undefined, Diagnostic[]> = new Map();

  /** Iterate every diagnostic across every file in insertion order
   *  (within each bucket). Insertion order across buckets is the order
   *  in which the first item per file landed. */
  *all(): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) yield* arr;
  }

  constructor() {

  }

  // Wall-clock origin for the total elapsed shown at the end of `print()`.
  private _start = performance.now();
  start = () => { this._start = performance.now(); };

  /** Forget every diagnostic for a specific source (keyed by its file), rebuilding
   *  the derived caches so a stale "this line already errored" entry can't suppress
   *  fresh diagnostics when the source is re-parsed. */
  delete(source: Text.Source): void {
    this.deleteAll([source.location]);
  }

  /** Forget a whole set of files at once — one cache rebuild instead of one
   *  per file (rebuilds walk every retained diagnostic, so per-file deletion
   *  over a large pass is quadratic). */
  deleteAll(locations: Iterable<string | undefined>): void {
    for (const location of locations) this.items.delete(location);
  }

  report(diag: Diagnostic) {
    // Skip the allocation entirely when the level is below the display
    // threshold — Node.copy + Diagnostic + double-push cost ~1µs each, and
    // these fire for every match/save/options stamp.
    if ((diag.level === 'trace' || diag.level === 'debug' || diag.level === 'info') && !Diagnostics.showLevel(diag.level)) return;
    // Cascade dedup: at most one error/fatal per expression. The parser tags
    // each diagnostic with the expression it fired in; a second error on the
    // same expression is the first one propagating, so drop it.
    if (diag.level === 'error' || diag.level === 'fatal') {
      if (diag.expression?.errored) return;
      if (diag.expression) diag.expression.errored = true;
    }
    const file = diag.node?.file;
    let arr = this.items.get(file);
    if (!arr) { arr = []; this.items.set(file, arr); }
    arr.push(diag);
  }

  exit(): never {
    this.print();
    if (env.nodejs) return process.exit(1);
    throw new Error('fatal diagnostic');
  }

  fatal(message: string, node?: Text.Node): never {
    this.report({ level: 'fatal', message, node });
    return this.exit()
  }
  error(message: string, node?: Text.Node) { return this.report({ level: 'error', message, node }); }
  warning(message: string, node?: Text.Node) { return this.report({ level: 'warning', message, node }); }
  info(message: string, node?: Text.Node) { return this.report({ level: 'info', message, node });}
  debug(message: string, node?: Text.Node) { return this.report({ level: 'debug', message, node });}
  trace(message: string, node?: Text.Node) { return this.report({ level: 'trace', message, node });}

  get errors() {
    const out: Diagnostic[] = [];
    for (const d of this.all()) if (d.level === 'error' || d.level === 'fatal') out.push(d);
    return out;
  }
  get warnings() {
    const out: Diagnostic[] = [];
    for (const d of this.all()) if (d.level === 'warning') out.push(d);
    return out;
  }
  get hasErrors() {
    for (const d of this.all()) if (d.level === 'error' || d.level === 'fatal') return true;
    return false;
  }
  get count() {
    let n = 0;
    for (const arr of this.items.values()) n += arr.length;
    return n;
  }

  /**
   * Minimum severity to display, resolved once at module load from the
   * DEBUG toggle (env var in Node.js, `window.DEBUG` in the browser).
   * DEBUG=0 → trace (show all), DEBUG=1 → debug+, …, DEBUG=5 → fatal only.
   * Default: 2 (info+). Static-init means `showLevel` is a single `>=`
   * compare in the wrapper hot path — re-reading the toggle + `parseInt`
   * per call costs several ms across a trace-level run.
   */
  static readonly minLevel: number = (() => {
    const debug = env.variable('DEBUG');
    if (debug === undefined || debug === '') return DIAGNOSTIC_SEVERITY.info;
    const n = parseInt(debug, 10);
    if (!isNaN(n)) return n;
    // Allow level names too: DEBUG=trace, DEBUG=warning, etc.
    if (debug in DIAGNOSTIC_SEVERITY) return DIAGNOSTIC_SEVERITY[debug as Diagnostic['level']];
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

  /** The default terminal theme for highlight groups (the Ray.kt palette);
   *  a dotted style's group is its first segment. */
  static theme: Record<string, string> = {
    comment:     '\x1b[38;2;108;103;131m',
    punctuation: '\x1b[38;2;108;103;131m',
    keyword:     '\x1b[38;2;108;103;131m',
    string:      '\x1b[38;2;255;204;153m',
    number:      '\x1b[38;2;255;204;153m',
    boolean:     '\x1b[38;2;255;204;153m',
    access:      '\x1b[38;2;255;204;153m',
    decorator:   '\x1b[38;2;255;204;153m',
    operator:    '\x1b[38;2;171;179;191m',
    builtin:     '\x1b[38;2;154;134;253m',
    class:       '\x1b[38;2;154;134;253m',
    function:    '\x1b[38;2;154;134;253m',
    namespace:   '\x1b[38;2;154;134;253m',
    type:        '\x1b[38;2;154;134;253m',
    macro:       '\x1b[38;2;154;134;253m',
    variable:    '\x1b[38;2;196;185;254m',
    property:    '\x1b[38;2;196;185;254m',
    parameter:   '\x1b[38;2;196;185;254m',
  }

  /** Painted nodes per file, injected by whoever owns the highlighting (the
   *  interpreter's Log) — already colored (`node.color`), half-open begin/end.
   *  Source excerpts render with them as the base coat, diagnostic ranges on
   *  top. */
  highlighting?: (file: string) => readonly Text.Node[] | undefined;

  /** The project a file belongs to, as a display header — its `.project.ray`
   *  path, else the project's only file, else its directory. Injected by the
   *  owner; the inline source is grouped under it (one info-colored header per
   *  project, a blank line between). */
  project?: (file: string) => string | undefined;

  /** One source line, colored: the given colored nodes (absolute positions,
   *  inclusive ends) clipped to the line and painted in order — later wins, so
   *  callers pass the syntax base coat first and diagnostic segments on top —
   *  gray where none apply. */
  private _colorLine(line: Text.Node, segments: readonly Text.Node[]): string {
    const { c } = Diagnostics;
    const text = line.string;
    const chars: (string | undefined)[] = new Array(text.length).fill(undefined);
    for (const s of segments) {
      if (!s.color) continue;
      for (let k = Math.max(s.begin! - line.begin!, 0); k <= Math.min(s.end! - line.begin!, text.length - 1); k++) chars[k] = s.color;
    }
    let colored = '';
    let current: string | undefined;
    for (let k = 0; k < text.length; k++) {
      const color = chars[k] ?? c.gray;
      if (color !== current) { colored += color; current = color; }
      colored += text[k];
    }
    return colored;
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
  private _printFile(file: string | undefined, source: Text.Source, items: Diagnostic[]) {
    const { c } = Diagnostics;
    const text = source.value;
    if (!text) return;
    const cols = (env.nodejs && process.stdout.columns) || 80;
    const lineNumWidth = String(source.newlines.length + 1).length;
    const gutterLen = lineNumWidth + 1;

    if (file) console.error(`${c.gray}${file}${c.reset}`);

    // Every diagnostic in this bucket is keyed by its node's file (see
    // `print`), so `d.node` exists and lands in `file`.
    const anchors = items.filter(d => d.node);

    const cursor = (d: Diagnostic) => d.node!.cursor!;

    anchors.sort((a, b) => cursor(a) - cursor(b));

    let anchorIdx = 0;
    for (const [line, lineNo] of source.lines) {
      // Collect visible anchors on this line.
      const lineAnchors: Diagnostic[] = [];
      while (anchorIdx < anchors.length && cursor(anchors[anchorIdx]) <= line.end) {
        const d = anchors[anchorIdx];
        if (cursor(d) >= line.begin) lineAnchors.push(d);
        anchorIdx++;
      }

      if (lineAnchors.length === 0) continue;

      // Group anchors that share a cursor — they render under one pipe (one
      // annotation block, diagnostics stacked). The Map keeps insertion order,
      // and lineAnchors is cursor-sorted, so groups come out left-to-right.
      const info = [...Map.groupBy(lineAnchors, d => cursor(d) - line.begin)].map(([col, diags]) => ({ col, diags }));
      const aboveInfo = info.filter((_, i) => i % 2 === 1).reverse().sort((a, b) => b.col - a.col);
      const belowInfo = info.filter((_, i) => i % 2 === 0);

      const blankGutter = ' '.repeat(gutterLen);

      // Above annotations.
      if (aboveInfo.length) this._renderAnnotations(blankGutter, gutterLen, aboveInfo, cols, 'before');

      // The colored span of each group follows its most severe diagnostic: an
      // error with a wide selection colours its full span even when a narrower
      // info trace shares the anchor cursor. One node per separately-colored
      // segment, ordered by position in the line.
      // The syntax base coat — painted nodes, smaller spans win, so widest
      // first — with the diagnostic segments painted on top.
      const base = [...(file !== undefined ? this.highlighting?.(file) ?? [] : [])]
        .sort((a, b) => (b.end! - b.begin!) - (a.end! - a.begin!));
      const segments = info.flatMap(({ diags }) => {
        const worst = diags.reduce((a, b) =>
          DIAGNOSTIC_SEVERITY[b.level] > DIAGNOSTIC_SEVERITY[a.level] ? b : a
        );
        worst.node!.color = Diagnostics.levelColor[worst.level] ?? c.gray;
        return worst.node!.segments;
      });
      console.error(`${c.gray}${String(lineNo + 1).padStart(lineNumWidth)} ${c.reset}${this._colorLine(line, [...base, ...segments])}${c.reset}`);

      // Below annotations.
      if (belowInfo.length) this._renderAnnotations(blankGutter, gutterLen, belowInfo, cols);

      console.error('');
    }
  }

  /**
   * Render annotations one at a time in order, returning groups of lines.
   * Each group = [connector line (if needed), description lines, error lines].
   * First group starts with the initial connector for all annotations.
   */
  private _renderAnnotationGroups(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; diags: Diagnostic[] }[],
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

      // Each diagnostic renders as one wrapped block under the pipe: the full
      // "level message [version]" content (trace is just its message, no label
      // or tag), built by `format` and wrapped as a single colored string.
      for (const diag of t.diags)
        for (const line of this._wrap(this.format(diag).colored, Math.max(pipeAwareAvailable, 10)))
          emit(line.text, line.len);

      // Skip overlap connector — the next group's connector already shows the pipes.

      groups.push(group);
    }

    return groups;
  }

  /** Render and print an annotation block. 'before' (above the source) caps the
   *  block with a down-connector linking its pipes to the source line. */
  private _renderAnnotations(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; diags: Diagnostic[] }[],
    cols: number,
    pipesFrom: 'after' | 'before' = 'after'
  ): void {
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
    if (pipesFrom === 'before') merged.push(this._connectorLine(blankGutter, gutterLen, annotations));

    let prev = '';
    for (const l of merged) { if (l !== prev) console.error(l); prev = l; }
  }

  /** Build a line with gray | connectors at each annotation column. */
  private _connectorLine(blankGutter: string, gutterLen: number, traces: { col: number }[]): string {
    const { c } = Diagnostics;
    const sorted = [...traces].sort((a, b) => a.col - b.col);
    let line = blankGutter;
    let pos = 0;
    for (const t of sorted) {
      if (t.col > pos) line += ' '.repeat(t.col - pos);
      line += `${c.gray}|${c.reset}`;
      pos = t.col + 1;
    }
    return line;
  }

  /** A diagnostic's full one-line content — level label, message, and the
   *  trailing Ether version tag — both colored and plain. trace carries no
   *  label or tag: it's just its message in the level's color. This is the one
   *  place a diagnostic becomes text; callers wrap the result directly. */
  format(d: Diagnostic): { colored: string; plain: string } {
    const { c } = Diagnostics;
    const color = Diagnostics.levelColor[d.level];
    const msg = d.message ?? '';
    if (d.level === 'trace') return { colored: `${color}${msg}${c.reset}`, plain: msg };
    const tag = ` [${version()}]`;
    return {
      colored: `${color}${d.level}${c.reset} ${msg}${c.gray}${tag}${c.reset}`,
      plain: `${d.level} ${msg}${tag}`,
    };
  }

  /** Word-wrap a colored string by *visible* width (escape codes don't count),
   *  re-opening the active color at the start of each continuation line. */
  private _wrap(s: string, available: number): { text: string; len: number }[] {
    const { c } = Diagnostics;
    // Decompose into visible chars, each tagged with the color active at it.
    const chars: { ch: string; color: string }[] = [];
    let color = '';
    for (let i = 0; i < s.length; i++) {
      const m = s[i] === '\x1b' ? /^\x1b\[[0-9;]*m/.exec(s.slice(i)) : null;
      if (m) { color = m[0] === c.reset ? '' : m[0]; i += m[0].length - 1; continue; }
      chars.push({ ch: s[i], color });
    }
    const render = (cs: { ch: string; color: string }[]): string => {
      let out = '', cur = '';
      for (const x of cs) { if (x.color !== cur) { out += x.color || c.reset; cur = x.color; } out += x.ch; }
      return cur ? out + c.reset : out;
    };
    const plainLines = this._wrapToLines(chars.map(x => x.ch).join(''), available);
    const out: { text: string; len: number }[] = [];
    let pos = 0;
    for (let li = 0; li < plainLines.length; li++) {
      const len = plainLines[li].length;
      out.push({ text: render(chars.slice(pos, pos + len)), len });
      pos += len;
      if (li < plainLines.length - 1 && chars[pos]?.ch === ' ') pos++; // drop the wrap-boundary space
    }
    return out;
  }

  /** Word-wrap plain text into lines at word boundaries */
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
    // `exec` is the work up to here; everything below is rendering, timed
    // separately as `print` so the two costs stay distinguishable.
    const exec = performance.now() - this._start;
    const printStart = performance.now();
    const { c } = Diagnostics;

    // 1. Inline annotated source. `items` is already keyed by file —
    //    each non-undefined bucket is one file's diagnostics. Entries
    //    without a file (`undefined` bucket) just don't get rendered
    //    inline (they show up in the flat summary below).
    // group the files by their project (first-seen order), each group under one
    // info-colored header, a blank line between groups
    const groups = new Map<string | undefined, [string, Diagnostic[]][]>();
    for (const [file, items] of this.items) {
      if (!file) continue;
      const header = this.project?.(file);
      let g = groups.get(header);
      if (!g) groups.set(header, g = []);
      g.push([file, items]);
    }
    for (const [header, files] of groups) {
      if (header) console.error(`${Diagnostics.levelColor.info}${header}${c.reset}`);
      for (const [file, items] of files) {
        const source = items.find(d => d.node?.source.value)?.node?.source;
        if (!source) continue;
        this._printFile(file, source, items);
      }
    }

    // 2. Flat list: everything above the threshold except traces, which are
    //    inline-only noise in this summary.
    const flat: Diagnostic[] = [];
    for (const d of this.all()) {
      if (!Diagnostics.showLevel(d.level)) continue;
      if (d.level === 'trace') continue;
      flat.push(d);
    }
    const errs = this.errors, warns = this.warnings;

    if (flat.length === 0) {
      console.error(`  ${c.gray}No errors.${c.reset}`);
    } else {
      for (const d of flat) {
        const { colored } = this.format(d);
        const locNode = d.node;
        if (d.level === 'fatal') {
          console.error('');
          console.error(colored);
          continue;
        }
        if (locNode?.file) console.error(`${c.gray}${locNode.file}:${locNode.line}:${locNode.col}${c.reset}`);
        console.error(`  ${colored}`);
      }
    }


    const parts: string[] = [];
    if (errs.length) parts.push(`${Diagnostics.levelColor.error}${errs.length} error${errs.length > 1 ? 's' : ''}${c.reset}`);
    if (warns.length) parts.push(`${Diagnostics.levelColor.warning}${warns.length} warning${warns.length > 1 ? 's' : ''}${c.reset}`);
    const execStr = `${exec.toFixed(2)}ms`;
    const printStr = `${(performance.now() - printStart).toFixed(2)}ms`;
    const timing = `${c.gray}${execStr}${c.reset} ${c.dark_gray}+ ${printStr} print${c.reset}`;
    if (parts.length) console.error(`\n  ${parts.join(', ')}${c.gray}, ${c.reset}${timing}`);
    else console.error(`\n  ${timing}`);
  }
}
