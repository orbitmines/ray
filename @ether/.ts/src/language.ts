import fs from "fs";
import path from "path";
import {is_array, is_function, is_string} from "./lodash.ts";

export interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  phase: string;
  message: string;
  location?: Location;
}

export interface Trace {
  token: string;
  begin: number;
  end: number;
  kind: 'method' | 'resolve' | 'split' | 'implicit-self' | 'forward-ref';
  description: string;
  order: number;
  errors: Diagnostic[];
}

export class Diagnostics {
  private items: Diagnostic[] = [];
  private keys = new Set<string>();
  private _cascadeSuppression = false;
  private _unresolvedNames = new Set<string>();

  constructor() {

  }

  clock = () => {
    class Clock {
      a: number; b: number;
      constructor() { this.a = performance.now(); }
      stop = () => this.b = performance.now();
      toString = () => {
        this.stop();
        return `${(this.b - this.a).toFixed(1)}ms`
      }
    }
    return new Clock();
  }

  enableCascadeSuppression() { this._cascadeSuppression = true; }

  describe = (a: any) => {

  }

  deduplicate() {
    const seen = new Set<string>();
    this.items = this.items.filter(d => {
      const { file, line, col } = d.location ?? {};
      const key = `${file ?? ''}:${line ?? 0}:${col ?? 0}|${d.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  report(diag: Diagnostic) {
    if (this._cascadeSuppression && diag.phase === 'resolve') {
      const nameMatch = diag.message.match(/Unresolved identifier: (.+)/);
      if (nameMatch) {
        const name = nameMatch[1];
        for (const prev of this._unresolvedNames) {
          if (name.includes(prev) && name !== prev) return;
        }
        this._unresolvedNames.add(name);
      }
    }
    this.items.push(diag);
  }

  fatal(phase: string, message: string, location?: Location): never {
    this.error(phase, message, location);
    this.print();
    process.exit(1);
  }
  error = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'error', phase, message, location });
  warning = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'warning', phase, message, location });
  info = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'info', phase, message, location });

  get errors() { return this.items.filter(d => d.level === 'error'); }
  get warnings() { return this.items.filter(d => d.level === 'warning'); }
  get hasErrors() { return this.items.some(d => d.level === 'error'); }
  get count() { return this.items.length; }

  static locate(source: string, pos: number): { line: number; col: number; context: string } {
    let line = 1, col = 1;
    for (let i = 0; i < pos && i < source.length; i++) {
      if (source[i] === '\n') { line++; col = 1; } else col++;
    }
    const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = source.indexOf('\n', pos);
    const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    const pointer = ' '.repeat(col - 1) + '^';
    return { line, col, context: `  ${lineText}\n  ${pointer}` };
  }

  // ANSI helpers
  private static c = {
    reset:   '\x1b[0m',
    blue:    '\x1b[34m',
    yellow:  '\x1b[33m',
    gray:    '\x1b[90m',
    red:     '\x1b[1;31m',
    white:   '\x1b[37m',
    dim:     '\x1b[2m',
    bold:    '\x1b[1m',
  }

  /**
   * Print annotated source showing how each token was interpreted.
   * Alternates annotations above/below the source line.
   * Colors: blue/yellow alternate for tokens, red for errors, dark gray for order.
   *
   *         Forward reference to 'test'
   *         |
   * external test
   *    |
   *    Method on *
   *    error[external]: Expected method to ...
   */
  printTrace(source: string, traces: Trace[], file?: string) {
    const { c } = Diagnostics;
    const cols = process.stdout.columns || 80;
    const lines = source.split('\n');
    const lineNumWidth = String(lines.length).length;
    const gutterLen = lineNumWidth + 1; // "1 " or " 1 "

    if (file) console.error(`${c.gray}${file}${c.reset}`);

    let traceIdx = 0;
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const line = lines[lineNo];
      const lineStart = lines.slice(0, lineNo).reduce((a, l) => a + l.length + 1, 0);
      const lineEnd = lineStart + line.length;
      const lineLabel = `${c.gray}${String(lineNo + 1).padStart(lineNumWidth)} ${c.reset}`;
      const blankGutter = ' '.repeat(gutterLen);

      // Collect traces on this line
      const lineTraces: Trace[] = [];
      while (traceIdx < traces.length && traces[traceIdx].begin < lineEnd) {
        if (traces[traceIdx].begin >= lineStart) lineTraces.push(traces[traceIdx]);
        traceIdx++;
      }

      if (lineTraces.length === 0) {
        console.error(`${lineLabel}${c.gray}${line}${c.reset}`);
        continue;
      }

      // Split into above (odd index) and below (even index)
      const above: Trace[] = [];
      const below: Trace[] = [];
      for (let i = 0; i < lineTraces.length; i++) {
        if (i % 2 === 1) above.push(lineTraces[i]);
        else below.push(lineTraces[i]);
      }

      // Compute columns and colors for each trace
      const tokenColors = [c.blue, c.yellow];
      const traceInfo = lineTraces.map((t, i) => ({
        trace: t,
        col: t.begin - lineStart,
        color: t.errors.length ? c.red : tokenColors[i % 2],
      }));
      const aboveInfo = traceInfo.filter((_, i) => i % 2 === 1).reverse();
      const belowInfo = traceInfo.filter((_, i) => i % 2 === 0);

      // Above: render right-to-left (rightmost = furthest from source first).
      // "remaining" = annotations already rendered (closer to source = to the left),
      // so pipes extend downward toward the source line.
      if (aboveInfo.length) {
        const aboveRL = [...aboveInfo].sort((a, b) => b.col - a.col); // rightmost first
        const lines = this._renderAnnotations(blankGutter, gutterLen, aboveRL, cols, 'before');
        // Final connector: all above annotations' pipes connecting to source line
        lines.push(this._connectorLine(blankGutter, gutterLen, aboveRL));
        // Deduplicate consecutive identical lines
        let prev = '';
        for (const l of lines) {
          if (l !== prev) console.error(l);
          prev = l;
        }
      }

      // Render source line with colored tokens
      let colored = '';
      let pos = 0;
      for (const ti of traceInfo) {
        const endCol = ti.trace.end - lineStart + 1;
        if (ti.col > pos) colored += c.white + line.slice(pos, ti.col);
        colored += ti.color + line.slice(ti.col, endCol);
        pos = endCol;
      }
      if (pos < line.length) colored += c.white + line.slice(pos);
      console.error(`${lineLabel}${colored}${c.reset}`);

      // Below: left to right, deduplicate consecutive identical lines
      if (belowInfo.length) {
        const lines = this._renderAnnotations(blankGutter, gutterLen, belowInfo, cols);
        let prev = '';
        for (const l of lines) {
          if (l !== prev) console.error(l);
          prev = l;
        }
      }

      console.error(''); // blank line between source lines
    }
  }

  /**
   * Render annotations one at a time in order, returning groups of lines.
   * Each group = [connector line (if needed), description lines, error lines].
   * First group starts with the initial connector for all annotations.
   */
  private _renderAnnotationGroups(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; color: string; trace: Trace }[],
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

      // Description — wrap to pipe-aware width so pipes show on every line
      let needsConnector = false;
      if (t.trace.description) {
        const descLines = this._wrapToLines(t.trace.description, Math.max(pipeAwareAvailable, 10));
        for (const dl of descLines) {
          if (emit(`${t.color}${dl}${c.reset}`, dl.length)) needsConnector = true;
        }
      }

      // Errors — wrap message to pipe-aware width
      for (const err of t.trace.errors) {
        const label = `\x1b[1;31merror\x1b[0m${c.gray}[${err.phase}]${c.reset}: `;
        const labelPlain = `error[${err.phase}]: `;
        const errAvail = Math.max(pipeAwareAvailable - labelPlain.length, 10);
        const msgLines = this._wrapToLines(err.message, errAvail);
        // textCol for continuation: actual text starts after the label padding
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

      // Skip overlap connector — the next group's connector already shows the pipes.

      groups.push(group);
    }

    return groups;
  }

  /** Flatten annotation groups into lines (for below, which doesn't need reversal) */
  private _renderAnnotations(
    blankGutter: string, gutterLen: number,
    annotations: { col: number; color: string; trace: Trace }[],
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


  print(label?: string) {
    const errs = this.errors, warns = this.warnings;
    if (errs.length === 0 && warns.length === 0) {
      console.error(label ? `  \x1b[90m${label}: No errors.\x1b[0m` : '  \x1b[90mNo errors.\x1b[0m');
      return;
    }
    for (const d of this.items) {
      const lbl = d.level === 'error' ? `\x1b[1;31merror\x1b[0m` : `\x1b[1;33mwarning\x1b[0m`;
      const { file, line, col } = d.location ?? {};
      if (file) console.error(`  \x1b[90m${file}:${line ?? 0}:${col ?? 0}\x1b[0m`);
      console.error(`    ${lbl}\x1b[90m[${d.phase}]\x1b[0m: ${d.message}`);
    }
    const parts: string[] = [];
    if (errs.length) parts.push(`\x1b[1;31m${errs.length} error${errs.length > 1 ? 's' : ''}\x1b[0m`);
    if (warns.length) parts.push(`\x1b[1;33m${warns.length} warning${warns.length > 1 ? 's' : ''}\x1b[0m`);
    console.error(`\n  ${parts.join(', ')}`);
  }
}

type Expression = string | Node | Expression[]
interface Backend {
  language: Language
  log: Diagnostics;

  load(location: string | string[]): this
  loadFile(location: string): this
  loadDirectory(location: string, options: { recursively?: boolean }): this
  add(...source: string[]): this

  // Override all syntax.
  syntax(expression: (E: ((...args: Expression[]) => Node) & { [key: string]: any }) => Expression | Expression[]): this

  base(fn: (x: Node) => void): this
  context(fn: (x: Node) => void): this
  external_method(key: Key, fn: Method): this
  object(key: Key, fn: (x: Node) => void): this

  cli(location: string[], args: { [key: string]: string[] }): void
  exec(): void
  repl(): void
  build(): void
}

export class Runtime implements Backend {

  EXTERNALLY_DEFINED = new Reader(this)

  BASE: Node = new Node(this.EXTERNALLY_DEFINED, undefined)
  CTX: Node = new Node(this.EXTERNALLY_DEFINED, this.BASE)
  GLOBAL: Node = new Node(this.EXTERNALLY_DEFINED, this.CTX)

  // Base path for resolving relative file locations.
  // Default: repository root (two levels up from @ether/.ts/).
  // Override this to use packaged/bundled .ray files instead.
  root: string = path.resolve(import.meta.dirname, '..', '..', '..')

  constructor(public language: Language) {}
  log = new Diagnostics();

  base = (fn: (x: Node) => void): this => { fn(this.BASE); return this; }
  context = (fn: (x: Node) => void): this => { fn(this.CTX); return this; }
  object = (key: Key, fn: (x: Node) => void): this => {
    if (!this.GLOBAL.has(key)) this.GLOBAL.set(new Node(this.EXTERNALLY_DEFINED))
    fn(this.GLOBAL.resolve(key)());
    return this;
  }
  external_method = (key: Key, fn: Method): this => { this.GLOBAL.external_method(key, fn); return this; }

  private _tokenHandler: ((node: Node) => void) | null = null;

  syntax = (expression: (E: ((...args: Expression[]) => Node) & { [key: string]: any }) => Expression | Expression[]): this => {
    const placeholderReader = new Reader(this);
    placeholderReader.source = '';
    const E: any = (...args: Expression[]) => {
      const node = new Node(placeholderReader);
      node.cursor = { index: 0 };
      return node;
    };
    E.token = (fn: (node: Node) => void) => { this._tokenHandler = fn; };
    expression(E);
    return this;
  }

  private resolve_path = (location: string): string =>
    path.isAbsolute(location) ? location : path.resolve(this.root, location)

  load = (location: string | string[]): this => {
    if (is_array(location)) { location.forEach(this.load); return this; }

    const full = this.resolve_path(location);
    if (!fs.existsSync(full)) { this.log.error('load', `Not found: ${full}`); return this; }
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      this.loadFile(full)
    } else if (stat.isDirectory()) {
      this.loadDirectory(full, { recursively: true })
    } else {
      return this.log.fatal('file system', `"${full}": not a file or directory`);
    }
    return this;
  }
  loadFile = (location: string): this => {
    const full = this.resolve_path(location);
    if (!fs.existsSync(full)) { this.log.error('load', `File not found: ${full}`); return this; }
    this.parse(fs.readFileSync(full, 'utf-8'), full);
    return this;
  }
  loadDirectory = (location: string, options: { recursively?: boolean }): this => {
    const full = this.resolve_path(location);
    if (!fs.existsSync(full)) { this.log.error('load', `Directory not found: ${full}`); return this; }
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory() && options?.recursively) walk(entryPath);
        else if (entry.name.endsWith(this.language._extension[0] ?? '.ray')) this.loadFile(entryPath);
      }
    };
    walk(full);
    return this;
  }
  add = (...source: string[]): this => {
    for (const src of source) {
      this.parse(src);
    }
    return this;
  }

  parse = (source: string, file?: string): Node | null => {
    if (!this._tokenHandler) return null;

    const reader = new Reader(this);
    reader.source = source;

    const node = new Node(reader, this.BASE);
    node.cursor = { index: -1 };

    while (!node.right.done()) {
      this._tokenHandler(node);
    }

    // Only verify and print traces for top-level parses
    if (file) {
      reader.verify();
      if (reader.traces.length) {
        this.log.printTrace(source, reader.traces, file);
      }
    }

    return reader.result;
  }

  cli = (location: string[], args: { [key: string]: string[] }) => {
    const timer = this.log.clock()

    const _eval = args['eval'] ?? []; delete args['eval'];
    if (_eval) { this.add(..._eval) } else { this.load(location) }

    this.exec()

    this.log.info('timer', `  ${timer.toString()} total`)
  }

  exec = (): Node | undefined => {
    // Run all queued pass steps
    for (const pass of this.language.passes) {
      for (const step of pass.steps) {
        step();
      }
    }

    if (this.log.hasErrors) {
      process.exitCode = 1;
      this.log.print()
    }

    return undefined;
  }

  repl = () => {
    import('readline').then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = () => {
        rl.question(`${this.language.name}> `, (line: string) => {
          this.log.describe(
            this.load(line.trim()).exec()
          )
          prompt()
        });
      };
      prompt()
    })
  }
  build(): void {
    throw new Error("Method not implemented.");
  }
}

export class Language implements Backend {

  language: Language = this;
  backend: Backend = new Runtime(this);
  get log() { return this.backend.log; }

  _extension: string[] = []
  extension = (...extension: string[]): this => { this._extension.push(...extension); return this }

  passes: { ref?: string, steps: (() => void)[] }[] = [{ steps: [] }]
  get current_pass() { return this.passes[this.passes.length - 1] }
  step = <K extends { [K in keyof Backend]: Backend[K] extends (...args: any[]) => any ? K : never }[keyof Backend]>(method: K) => {
    return (...args: Backend[K] extends (...args: infer A) => any ? A : never) => {
      this.current_pass.steps.push(() => (this.backend[method] as (...args: any[]) => any)(...args));
      return this;
    };
  }
  pass = (fn: (language: this) => this): this => {
    if (this.current_pass.steps.length > 0)
      this.passes.push({ steps: [] })

    fn(this)
    this.passes.push({ steps: [] })
    return this;
  }
  ref = (ref: string): this => { this.current_pass.ref = ref; return this }
  delegate = <K extends keyof Backend>(method: K) => (...args: Backend[K] extends (...args: infer A) => any ? A : never) => (this.backend[method] as (...args: any[]) => any)(...args);

  constructor(public name: string, public version: string) {

  }

  cd = (dir: string, fn: (language: Language) => void): this => {
    fn(new Proxy(class {}, {
      get: (target, property) => {
        if (is_string(property) && ['load', 'loadFile', 'loadDirectory'].includes(property))
          return (...args: any[])=> (this as any)[property](...args.map(x => is_string(x) ? `${dir}/${x}` : x));

        return (this as any)[property]
      }
    }) as any as Language)
    return this;
  }

  load = this.step('loadFile')
  loadFile = this.step('loadFile')
  loadDirectory = this.step('loadDirectory')
  add = this.step('add')

  syntax = this.step('syntax')

  base = this.step('base')
  context = this.step('context')
  object = this.step('object')
  external_method = this.step('external_method')

  cli = this.delegate('cli')
  exec = this.delegate('exec')
  repl = this.delegate('repl')
  build = this.delegate('build')
}

const UNKNOWN = Symbol("Unknown")
type Method = (self: Node, args?: Node) => Node
type ResolvedMethod = (args?: Node) => Node | undefined
type Key = string | Node
export class Node {
  value: { encoded: any; ctx?: Node, methods: Map<Key, Method>, options: { [key: string]: string } } = { encoded: UNKNOWN, methods: new Map(), options: {} };

  switch_ctx = (ctx: Node): this => { this.value.ctx = ctx; return this; }

  private _thunks: ((self: Node) => void)[] | null = null;
  lazily(fn: (self: Node) => void): this { if (!this._thunks) this._thunks = []; this._thunks.push(fn); return this; }
  realize(): Node {
    if (this._thunks) { const t = this._thunks; this._thunks = null; for (const fn of t) fn(this); }
    return this;
  }
  lazy_get = (key: Key): Node => new Node(this.reader).switch_ctx(this.value.ctx).lazily((self) => self.value = this.get(key)(this).value);
  lazy_set = (value: Node): Node => this.lazily((self) => self.value = value.realize().value);
  lazy_call = (args: Node): Node => new Node(this.reader).switch_ctx(this.value.ctx).lazily((self) => self.value = this.call(args).value);

  constructor(public reader: Reader, public _super: Node = reader.runtime.BASE, encoded: any = UNKNOWN) { this.value.encoded = encoded; }

  get unknown(): boolean { return this.value.encoded === UNKNOWN; }
  get none(): boolean { return this.value.encoded === null || this.value.encoded === undefined; }

  //TODO has/get should pattern match if key is Node
  has = (key: Key): boolean => { return this.value.methods.has(key); }
  get = (key: Key): Method | undefined => { this.realize(); return this.value.methods.get(key); }
  set = (val: Node): Node => { this.realize(); this.value = val.value; return this; }
  call = (args: Node) => {
    this.realize()
    if (!is_function(this.value.encoded)) {
      this.error('call', `Expected a function to call.`)
      return new Node(this.reader)
    }
    return this.value.encoded(this, args)
  }

  resolve = (key: Key): ResolvedMethod => {
    if (this.has(key)) return (...args) => this.get(key)(this, ...args)
    if (this._super) return this._super.resolve(key);
    return () => new Node(null, null)
  }

  /** Find the node in the _super chain that has this method key */
  _findMethod = (key: Key): Node | null => {
    if (this.value.methods.has(key)) return this;
    if (this._super) return this._super._findMethod(key);
    return null;
  }

  /** Collect all method keys from this node and its _super chain */
  get methods(): Set<Key> {
    const keys = new Set<Key>(this.value.methods.keys());
    if (this._super) for (const k of this._super.methods) keys.add(k);
    return keys;
  }

  external_method = (key: Key, fn?: Method): this => {
    // Two-stage: first call binds self → returns callable partial, second call runs fn(self, args)
    const methodFn: Method = (self: Node) => {
      const partial = new Node(self.reader, self._super, key);
      partial.value.encoded = ((_self: Node, args: Node) => {
        if (!fn) return this.fatal('forward ref', 'Method was called before it was initialized.');
        // Temporarily swap reader so errors land on the parse trace
        const prevReader = self.reader;
        self.reader = partial.reader;
        const result = fn(self, args);
        self.reader = prevReader;
        return result;
      });
      return partial;
    };
    this.value.methods.set(key, methodFn);
    return this;
  }

  /**
   *
   */
  public cursor: Location; public selection: { begin: Location, end: Location }[] = []
  private single_char = () => this.selection.length === 0;
  private get first() { return !this.single_char() ? this.selection[0] : undefined }
  private get last() { return !this.single_char() ? this.selection[this.selection.length - 1] : undefined }
  get begin() { return this.first?.begin ?? this.cursor; }
  set begin(location: Location) { if (this.first) { this.first.begin = location } else { this.selection.push({ begin: location, end: this.cursor }); } }
  get end() { return this.last?.end ?? this.cursor; }
  set end(location: Location) { if (this.last) { this.last.end = location } else { this.selection.push({ begin: this.cursor, end: location }); } }

  private create_direction = (direction: -1 | 1) => {
    const boundary = () => direction === -1 ? this.begin : this.end;

    const move = (offset: number = 1) => {
      if (direction === -1) {
        this.begin = { index: this.begin.index - offset }
      } else {
        this.end = { index: this.end.index + offset }
      }
    }

    move.done = () => {
      const next = boundary().index + direction;
      return next < 0 || next >= this.reader.source.length;
    };

    move.peak = (offset: number = 1): string => {
      if (offset === 0) return '';
      if (offset < 0) return (direction === -1 ? this.right : this.left).peak(offset * -1)

      let a = boundary().index;
      let b = a + (offset * direction);
      if (offset == 1) return b < 0 || b >= this.reader.source.length ? '' : this.reader.source[b];

      if (b < a) { [a, b] = [b, a] }
      return this.reader.source.slice(Math.max(a, 0), Math.min(b + 1, this.reader.source.length))
    }
    move.at = (s: string): boolean => move.peak(s.length) === s;
    move.capture = (char: string): boolean => {
      if (move.done() || move.peak() !== char) return false;
      move();
      return true;
    }
    move.capture_while = (pred: (ch: string) => boolean): number => {
      let n = 0;
      while (!move.done() && pred(move.peak())) { n++; move(); }
      return n;
    }
    move.capture_whitespace = (): number => move.capture_while(ch => ch === ' ');
    move.capture_line = (): string => {
      let a = boundary().index;
      move.capture_while(ch => ch !== '\n');
      let b = boundary().index;

      if (a === b) return '';
      if (b < a) { [a, b] = [b, a] }
      return this.reader.source.slice(a, b + 1)
    }
    move.capture_indent = (): number => {
      if (direction === -1) { return this.fatal('rtl', 'capture_indent not supported for rtl.') } // TODO EOL whitespace if -1
      move.capture('\n');
      return move.capture_whitespace();
    }
    move.upto = (char: string): string => {}
    move.until = (char: string): string => {
      // const opens  = direction === 1 ? '([{' : ')]}';
      // const closes = direction === 1 ? ')]}' : '([{';
      // const depth: string[] = [];
      // const before = boundary().index;
      //
      // while (!done()) {
      //   const ch = move.peak();
      //   if (depth.length === 0 && ch === char) break;
      //   const open = opens.indexOf(ch);
      //   if (open !== -1) depth.push(closes[open]);
      //   else if (depth.length > 0 && ch === depth[depth.length - 1]) depth.pop();
      //   move();
      // }
      //
      // return slice(before, boundary().index);
    }
    move.goto = (char: string): string => {}
    move.skip = () => this.move({ index: boundary().index + (1 * direction) })

    return move;
  }

  left = this.create_direction(-1)
  move = (cursor: Location) => {
    this.cursor = cursor; this.selection = []
    this.clear()
  }
  right = this.create_direction(1)

  _direction: -1 | 1 = 1
  get ltr() { this._direction = 1; return this }; get rtl() { this._direction = -1; return this };
  get direction() { return this._direction === -1 ? this.left : this.right; }
  private directed_delegate = (method: string) => (...args: any[]): this => { (this.direction as any)[method](...args); return this; }

  done = this.directed_delegate('done')
  capture = this.directed_delegate('capture')
  capture_while = this.directed_delegate('capture_while')
  capture_whitespace = this.directed_delegate('capture_whitespace')
  capture_line = this.directed_delegate('capture_line')
  upto = this.directed_delegate('upto')
  until = this.directed_delegate('until')
  goto = this.directed_delegate('goto')
  skip = this.directed_delegate('skip')

  clear = () => {
    this._thunks = [] //TODO Maybe move _thunks into .value?
    this.value = { encoded: UNKNOWN, methods: new Map(), options: {} };
  }

  get string() { return this.single_char() ? this.reader.source[this.cursor.index] : this.reader.source.slice(this.begin.index, this.end.index + 1); }

  copy = () => {
    const copy = new Node(this.reader, this._super)
    copy._thunks = [...this._thunks]
    copy.value = {...this.value}
    return copy;
  }

  get log() { return this.reader.log }
  error = (phase: string, message: string) => {
    const diag: Diagnostic = { level: 'error', phase, message, location: this.begin };
    this.log.report(diag);
    const traces = this.reader?.traces;
    if (traces?.length) traces[traces.length - 1].errors.push(diag);
  }
  warning = (phase: string, message: string) => {
    const diag: Diagnostic = { level: 'warning', phase, message, location: this.begin };
    this.log.report(diag);
    const traces = this.reader?.traces;
    if (traces?.length) traces[traces.length - 1].errors.push(diag);
  }
  info = (phase: string, message: string) => this.log.info(phase, message, this.begin)
  fatal = (phase: string, message: string) => this.log.fatal(phase, message, this.begin)

  /**
   * .match(key): Unified token resolution.
   *   1. Exact resolve in context
   *   2. Method on current result (via reader cursor)
   *   3. Split: longest prefix that resolves + suffix is a method → rewind pointer
   *   4. Method on `this` (implicit self)
   *   5. Forward ref fallback
   */
  private _matched = (node: Node, kind: Trace['kind'], description: string): Node => {
    node.reader = this.reader;
    if (this.cursor) this.reader.trace(this.string ?? '', this.begin?.index ?? 0, this.end?.index ?? 0, kind, description);
    return node;
  }

  match = (key: string): Node => {
    const runtime = this.reader.runtime;

    // If result is lazy (has pending thunks), we can't inspect its methods.
    // Capture the rest of the line and defer the entire resolution.
    const result = this.reader.result;
    if (result && result._thunks) {
      // Capture remaining source on this line
      const captureStart = this.begin?.index ?? 0;
      let captureEnd = captureStart;
      while (captureEnd < this.reader.source.length && this.reader.source[captureEnd] !== '\n') captureEnd++;
      const restOfLine = this.reader.source.slice(captureStart, captureEnd);

      // Advance the node pointer past the captured content
      if (this.cursor) this.end = { index: captureEnd - 1 };

      // Create trace for this deferred region
      const trace = this.cursor
        ? this.reader.trace(restOfLine, captureStart, captureEnd - 1, 'forward-ref', '')
        : null;

      // Report the unresolved error (attaches to the trace above)
      this.error('parse', `Unresolved syntax: '${restOfLine.trim()}'`);

      // Create a lazy node — when realized, just takes the value from the resolved result
      const lazy = new Node(this.reader).lazily(self => {
        result.realize();
        self.value = result.value;
      });
      this.reader.pending.push(lazy);
      this.reader.result = lazy;
      return lazy;
    }

    // 1. Method on current result
    if (result) {
      const method = result.get(key);
      if (method) {
        const lazy = new Node(this.reader).lazily(self => { self.value = method(result).value; });
        this.reader.pending.push(lazy);
        return this._matched(lazy, 'method', `Method on result`);
      }
    }

    // 2. Exact resolve in context — walk _super chain, call the method to get a partial
    const found = this._findMethod(key);
    if (found) {
      const method = found.get(key);
      const owner = found === runtime.BASE ? '*' : found === runtime.CTX ? 'ctx' : 'scope';
      const lazy = new Node(this.reader).lazily(self => { self.value = method(found).value; });
      this.reader.pending.push(lazy);
      return this._matched(lazy, 'resolve', `Method on ${owner}`);
    }

    // 3. Split: collect all methods from result (and its parents), try each as suffix of key
    if (key.length > 1) {
      const target = result ?? runtime.BASE;
      const allMethods = target.methods;

      const candidates: { suffix: string, len: number }[] = [];
      for (const m of allMethods) {
        if (!is_string(m)) continue;
        if (key.length > m.length && key.endsWith(m)) {
          candidates.push({ suffix: m, len: m.length });
        }
      }
      candidates.sort((a, b) => b.len - a.len);

      for (const { suffix } of candidates) {
        const prefix = key.slice(0, key.length - suffix.length);
        const prefixResolved = this.resolve(prefix);
        if (!prefixResolved || prefixResolved().none) continue;

        if (this._direction === 1) {
          this.end = { index: this.end.index - suffix.length };
        } else {
          this.begin = { index: this.begin.index + suffix.length };
        }
        const lazy = new Node(this.reader).lazily(self => { self.value = (prefixResolved() as Node).value; });
        this.reader.pending.push(lazy);
        return this._matched(lazy, 'split', `Split: '${prefix}' + '${suffix}'`);
      }
    }

    // 4. Method on `this` (implicit self)
    if (runtime.CTX.has('this')) {
      const thisNode = runtime.CTX.get('this')(runtime.CTX);
      if (thisNode && !thisNode.none) {
        const method = thisNode.get(key);
        if (method) {
          const lazy = new Node(this.reader).lazily(self => { self.value = method(thisNode).value; });
          this.reader.pending.push(lazy);
          return this._matched(lazy, 'implicit-self', `Method on this`);
        }
      }
    }

    // 5. Forward ref — already lazy by nature (errors only on access)
    const forward = new Node(this.reader, undefined);
    forward.external_method(key, () => forward.fatal('forward ref', `Unresolved: ${key}`));
    if (this.cursor) this.reader.trace(this.string ?? '', this.begin?.index ?? 0, this.end?.index ?? 0, 'forward-ref', `Forward reference to '${key}'`);
    return forward;
  }

  /**
   * .save(): Commit this node into the reader's expression result.
   * If no result yet, this becomes the result.
   * If there is a result, call it with this as argument (juxtaposition).
   */
  save = (): this => {
    if (this.reader.result) {
      this.reader.result = this.reader.result.lazy_call(this);
    } else {
      this.reader.result = this;
    }
    return this;
  }

  /**
   * .expression(): Recursively parse an expression in the current direction.
   * Saves the previous reader result, parses tokens until end of line,
   * then restores context and returns with this node holding the parsed value.
   */
  expression = (): this => {
    const prevResult = this.reader.result;
    this.reader.result = null;

    // Parse tokens in current direction until end of line
    while (!this.direction.done()) {
      const ch = this.direction.peak();
      if (ch === '\n') break;
      if (ch === ' ') { this.direction(); continue; }

      // Capture one token
      const token = new Node(this.reader, this._super);
      token.cursor = { index: this._direction === 1 ? this.end.index : this.begin.index };
      token._direction = this._direction;
      token.direction.capture_while((c: string) => c !== ' ' && c !== '\n');

      const resolved = token.match(token.string);

      if (resolved.value.options['rtl']) {
        resolved.rtl.expression().save();
      } else if (resolved.value.options['left_associative']) {
        resolved.ltr.expression().save();
      } else {
        resolved.save();
      }

      // Advance our pointer past what the token consumed
      if (this._direction === 1) {
        this.end = { index: token.end.index };
      } else {
        this.begin = { index: token.begin.index };
      }
    }

    // Transfer parsed result into this node
    if (this.reader.result) {
      this.value = this.reader.result.value;
    }

    // Restore previous result
    this.reader.result = prevResult;
    return this;
  }

  freeze = () => {
    //TODO Freeze these tokens from reparsing. But do something with them
    return this;
  }
  comment = () => {
    //TODO Set as comment, skippable for others. peak/etc skip over comments
    return this;
  }

  block = (fn?: (_: this) => Expression,  punctuation?: { begin: string, end: string }): this => {
    this.capture_whitespace().skip()
    if (punctuation) this.capture(punctuation.begin)

    // if (punctuation) { fn(this) } else { this. }

    if (punctuation) this.capture(punctuation.end)

    return this;
  }

  reinterpret = (pass: string): this => {
    return this;
  }
  interpret = (fn: (self: Node & { [key: string]: Node }) => void): this => {
    return this;
  }

  repeats = (operator?: '>=' | '>' | '<' | '<=' | '==', x?: number): this => {

    return this;
  }
  bind = (name: string): this => {

    return this;
  }

  map = <T>(fn: (x: any) => T): T[] => {
    if (!is_array(this.value.encoded)) return this.fatal('type', 'Called .map on a value which is not an Array')
    return this.value.encoded.map(fn)
  }

}

export type Location = {
  file?: string;
  line?: number;
  col?: number;
  index: number
}

//  scope = () => {}
//  allowForwardRef = () => {}

export class Reader {
  source: string = '';
  result: Node | null = null;
  traces: Trace[] = [];
  pending: Node[] = [];
  get language() { return this.runtime.language }
  get log() { return this.language.log }

  constructor(public runtime: Runtime) {

  }

  trace(token: string, begin: number, end: number, kind: Trace['kind'], description: string) {
    this.traces.push({ token, begin, end, kind, description, order: this.traces.length, errors: [] });
    return this.traces[this.traces.length - 1];
  }

  /** Realize all pending lazy nodes, triggering deferred method calls and error reporting. */
  verify() {
    for (let i = 0; i < this.pending.length; i++) {
      this.pending[i].realize();
    }
  }

}
