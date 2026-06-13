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


  /** Painted spans per file, injected by whoever owns the highlighting
   *  (the interpreter's Log) — source excerpts render with them as the
   *  base coat, diagnostic ranges on top. */
  highlighting?: (file: string) => readonly { begin: number; end: number; style: string }[] | undefined;

  /** One source line, colored: the painted syntax underneath (smaller
   *  spans win, as in every renderer of these spans), the given segments —
   *  inclusive ends, in their own colors — over it, gray where nothing
   *  applies. */
  private _colorLine(line: string, lineStart: number, file: string | undefined, segments: { begin: number; end: number; color: string }[]): string {
    const { c } = Diagnostics;
    const chars: (string | undefined)[] = new Array(line.length).fill(undefined);
    const spans = file !== undefined ? this.highlighting?.(file) : undefined;
    if (spans) {
      const lineEnd = lineStart + line.length;
      const overlapping = spans
        .filter(s => s.begin < lineEnd && s.end > lineStart)
        .sort((a, b) => (b.end - b.begin) - (a.end - a.begin));
      for (const s of overlapping) {
        const color = Diagnostics.theme[s.style.split('.')[0]];
        if (!color) continue;
        const from = Math.max(s.begin - lineStart, 0), to = Math.min(s.end - lineStart, line.length);
        for (let k = from; k < to; k++) chars[k] = color;
      }
    }
    for (const seg of segments)
      for (let k = Math.max(seg.begin, 0); k <= Math.min(seg.end, line.length - 1); k++) chars[k] = seg.color;
    let colored = '';
    let current: string | undefined;
    for (let k = 0; k < line.length; k++) {
      const color = chars[k] ?? c.gray;
      if (color !== current) { colored += color; current = color; }
      colored += line[k];
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
  private _printFile(file: string | undefined, source: string, items: Diagnostic[]) {
    const { c } = Diagnostics;
    if (!source) return;
    const cols = (env.nodejs && process.stdout.columns) || 80;
    const lines = source.split('\n');
    const lineNumWidth = String(lines.length).length;
    const gutterLen = lineNumWidth + 1;

    if (file) console.error(`${c.gray}${file}${c.reset}`);

    // The diagnostic's node, if it lands in this file.
    const displayNode = (d: Diagnostic): Text.Node | undefined =>
      d.node?.file === file ? d.node : undefined;

    const anchors = items.filter(d => !!displayNode(d));

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

      if (lineAnchors.length === 0) continue;

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
      // diagnostic colors override the painted syntax underneath
      console.error(`${lineLabel}${this._colorLine(line, lineStart, file, colorSegments)}${c.reset}`);

      // Below annotations.
      if (belowInfo.length) {
        const rendered = this._renderAnnotations(blankGutter, gutterLen, belowInfo, cols);
        let prev = '';
        for (const l of rendered) { if (l !== prev) console.error(l); prev = l; }
      }

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
      for (const diag of t.diags) {
        const diagColor = Diagnostics.levelColor[diag.level] ?? t.color;
        if (diag.level === 'trace') {
          const text = diag.message ?? '';
          const descLines = this._wrapToLines(text, Math.max(pipeAwareAvailable, 10));
          for (const dl of descLines) {
            emit(`${diagColor}${dl}${c.reset}`, dl.length);
          }
        } else {
          const { colored: label, plain: labelPlain } = this.formatDiagnosticLabel(diag);
          const tag = this.versionTag();
          const diagAvail = Math.max(pipeAwareAvailable - labelPlain.length, 10);
          const msgLines = this._wrapToLines(diag.message ?? '', diagAvail);
          const contTextCol = t.col + labelPlain.length;
          for (let mi = 0; mi < msgLines.length; mi++) {
            // the version trails the last line of the (wrapped) message
            const suffix = mi === msgLines.length - 1 ? tag.colored : '';
            const suffixLen = mi === msgLines.length - 1 ? tag.plain.length : 0;
            if (mi === 0) {
              emit(`${label}${msgLines[mi]}${suffix}`, labelPlain.length + msgLines[mi].length + suffixLen);
            } else {
              const pad = ' '.repeat(labelPlain.length);
              emit(`${pad}${msgLines[mi]}${suffix}`, labelPlain.length + msgLines[mi].length + suffixLen, contTextCol);
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

  /** Format a diagnostic label: just the level, colored (only error/warning
   *  bold). The Ether version trails the message instead — see `versionTag`. */
  formatDiagnosticLabel(d: Diagnostic): { colored: string; plain: string } {
    const { c } = Diagnostics;
    const color = Diagnostics.levelColor[d.level];
    return {
      colored: `${color}${d.level}${c.reset} `,
      plain: `${d.level} `
    };
  }

  /** The Ether version, gray, trailing a diagnostic's message. */
  private versionTag(): { colored: string; plain: string } {
    const { c } = Diagnostics;
    const plain = ` [${version()}]`;
    return { colored: `${c.gray}${plain}${c.reset}`, plain };
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
    // `exec` is the work up to here; everything below is rendering, timed
    // separately as `print` so the two costs stay distinguishable.
    const exec = performance.now() - this._start;
    const printStart = performance.now();
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
        const { colored: label } = this.formatDiagnosticLabel(d);
        const tag = this.versionTag().colored;
        const locNode = d.node;
        if (d.level === 'fatal') {
          console.error('');
          console.error(`${label}${d.message ?? ''}${tag}`);
          continue;
        }
        if (locNode?.file) console.error(`${c.gray}${locNode.file}:${locNode.line}:${locNode.col}${c.reset}`);
        console.error(`  ${label}${d.message ?? ''}${tag}`);
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
