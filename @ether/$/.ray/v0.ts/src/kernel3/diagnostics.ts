import { Text } from './text.ts';
import { env } from './env.ts';
import type { Program } from './program.ts';

export interface Diagnostic {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'trace';
  node?: Text.Node;
  at?: Text.Node;
  message: string;
}

const c = {
  reset:     '\x1b[0m',
  gray:      '\x1b[90m',
  dark_gray: '\x1b[2;90m',
}
const ansi = (hex: string, bold: boolean = false): string => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m`;
};
const theme: Record<string, string> = { namespace: '\x1b[38;2;154;134;253m', type: '\x1b[38;2;154;134;253m', class: '\x1b[38;2;154;134;253m', enum: '\x1b[38;2;154;134;253m', interface: '\x1b[38;2;154;134;253m', struct: '\x1b[38;2;154;134;253m', typeParameter: '\x1b[38;2;154;134;253m', parameter: '\x1b[38;2;196;185;254m', variable: '\x1b[38;2;196;185;254m', property: '\x1b[38;2;196;185;254m', enumMember: '\x1b[38;2;255;204;153m', event: '\x1b[38;2;154;134;253m', function: '\x1b[38;2;154;134;253m', method: '\x1b[38;2;154;134;253m', macro: '\x1b[38;2;154;134;253m', keyword: '\x1b[38;2;108;103;131m', modifier: '\x1b[38;2;108;103;131m', comment: '\x1b[38;2;108;103;131m', string: '\x1b[38;2;255;204;153m', number: '\x1b[38;2;255;204;153m', regexp: '\x1b[38;2;255;204;153m', operator: '\x1b[38;2;171;179;191m', decorator: '\x1b[38;2;255;204;153m' };

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = { trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5 };
export class Diagnostics {
  items: Map</*location:*/ Text.Source | undefined, Map<Text.Node | undefined, Diagnostic[]>> = new Map();

  program?: Program

  private start = performance.now();

  constructor(public level: Diagnostic['level'] = 'info') {}

  *all(filter?: (x: Diagnostic) => boolean): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) { for (const [, elements] of arr) { for (const element of elements) { if (filter ? filter(element) : true) yield element; } } }
  }
  *get(src: Text.Source): IterableIterator<Diagnostic> { for (const arr of this.items.get(src).values()) { yield* arr; } }
  *of(src: Text.Source): IterableIterator<Diagnostic> {
    for (const [key, arr] of this.items) { if (key !== src && key?.location !== src.location) continue; for (const [, elements] of arr) yield* elements; }
  }

  is_visible(level: Diagnostic['level']): boolean { return DIAGNOSTIC_SEVERITY[level] >= DIAGNOSTIC_SEVERITY[this.level]; }

  get empty() { return [...this.items.keys()].length === 0 }
  get has_errors(): boolean { return [...this.errors].length > 0 }
  get errors() { return this.all(x => DIAGNOSTIC_SEVERITY[x.level] >= DIAGNOSTIC_SEVERITY['error'])}
  get warnings() { return this.all(x => x.level === 'warning')}

  forget(src: Text.Source | Iterable<Text.Source>) {
    if (Symbol.iterator in src) { for (const element of src) { this.forget(element) }; return; }
    for (const key of [...this.items.keys()]) if (key === src || key?.location === src.location) this.items.delete(key);
  }

  print() {
    if (this.empty) return;

    const exec_time = performance.now() - this.start;
    const print_start = performance.now();

    const header_of = (src?: Text.Source) => src ? (this.program?.project_header(src) ?? src.location) : undefined;
    const group = <T>(items: Iterable<T>, key: (t: T) => string | undefined): Map<string | undefined, T[]> => {
      const m = new Map<string | undefined, T[]>();
      for (const t of items) { const h = key(t); let g = m.get(h); if (!g) m.set(h, g = []); g.push(t); }
      return m;
    };

    for (const [header, srcs] of group(this.items.keys(), header_of)) {
      if (header) console.error(`${this.color('info')}${header}${c.reset}`);
      for (const src of srcs) if (src !== undefined) this.print_lines_of(src);
    }

    let first = true;
    for (const [header, entries] of group(this.all(), e => header_of(e.node?.source))) {
      if (!first) console.error('');
      if (header) console.error(`${this.color('info')}${header}${c.reset}`);
      first = false;
      for (const entry of entries) this.print_diagnostic(entry);
    }

    const parts: string[] = []
    const count = (level: Diagnostic['level'], entries: Iterable<Diagnostic>) => { const count = [...entries].length; if (count !== 0) parts.push(`${this.color(level)}${count} ${level}${count > 1 ? 's' : ''}${c.reset}`); }
    
    count('error', this.errors); count('warning', this.warnings)
    parts.push(`${c.gray}${exec_time.toFixed(2)}ms${c.reset} ${c.dark_gray}+ ${(performance.now() - print_start).toFixed(2)}ms print${c.reset}`)
    console.error(`\n  ${parts.join(`${c.gray}, ${c.reset}`)}`)
  }
  print_lines_of(src: Text.Source) {
    console.error(`${c.gray}${src.location ? src.location : `unknown location`}${c.reset}`);

    let entry_i = 0;
    const entries = [...this.get(src)].filter(x => x.node).sort((a, b) => a.node.cursor - b.node.cursor)

    const line_number_width = String(src.newlines.length + 1).length;
    const painted = this.program?.painted(src) ?? [];
    for (const [line, i] of src.lines) {
      const visibile: Diagnostic[] = [];
      while (entry_i < entries.length && entries[entry_i].node.cursor <= line.end) {
        const entry = entries[entry_i];
        if (entry.node.cursor >= line.begin) visibile.push(entry);
        entry_i++;
      }

      if (visibile.length === 0) continue;

      const annotate = (group: { col: number; entries: Diagnostic[] }[], before: boolean) => {
        if (group.length === 0) return;
        const gutter = ' '.repeat(line_number_width + 1);
        const cols = (env.nodejs && process.stdout.columns) || 80;
        const pipe = `${c.gray}|${c.reset}`;
        const ANSI = /\x1b\[[0-9;]*m/g;
        const plain = (s: string) => s.replace(ANSI, '');

        // Word-wrap plain text at spaces to fit `width` columns.
        const wrapPlain = (text: string, width: number): string[] => {
          if (width < 10 || text.length <= width) return [text];
          const out: string[] = [];
          let cur = '';
          for (const word of text.split(' ')) {
            const next = cur ? `${cur} ${word}` : word;
            if (next.length > width && cur) { out.push(cur); cur = word; } else cur = next;
          }
          if (cur) out.push(cur);
          return out;
        };
        // Word-wrap a coloured string by *visible* width, re-opening colour per line.
        const wrap = (s: string, width: number): { text: string; len: number }[] => {
          const chars: { ch: string; color: string }[] = [];
          let color = '', last = 0;
          for (const m of s.matchAll(ANSI)) {
            for (let k = last; k < m.index; k++) chars.push({ ch: s[k], color });
            color = m[0] === c.reset ? '' : m[0];
            last = m.index + m[0].length;
          }
          for (let k = last; k < s.length; k++) chars.push({ ch: s[k], color });
          const paint = (cs: typeof chars) => {
            let out = '', cur = '';
            for (const x of cs) { if (x.color !== cur) out += (cur = x.color) || c.reset; out += x.ch; }
            return cur ? out + c.reset : out;
          };
          let pos = 0;
          return wrapPlain(plain(s), width).map((pl, li, all) => {
            const piece = { text: paint(chars.slice(pos, pos + pl.length)), len: pl.length };
            pos += pl.length + (li < all.length - 1 && chars[pos + pl.length]?.ch === ' ' ? 1 : 0);
            return piece;
          });
        };

        // One line: items placed left-to-right at their columns. A bare item is
        // a gray pipe; a {text} item is its coloured run. Anything a run already
        // covered is dropped — that's how a message hides the pipes behind it.
        const draw = (items: { col: number; text?: string; len?: number }[]): string => {
          let line = gutter, pos = 0;
          for (const it of [...items].sort((a, b) => a.col - b.col)) {
            if (it.col < pos) continue;
            line += ' '.repeat(it.col - pos);
            if (it.text === undefined) { line += pipe; pos = it.col + 1; }
            else { line += it.text; pos = it.col + (it.len ?? 0); }
          }
          return line;
        };

        // Each group draws a connector then its wrapped message(s). `through` are
        // the groups whose pipes pass through this block — the already-rendered
        // ones above the source, the not-yet-rendered ones below.
        const lines: string[] = [];
        group.forEach((g, i) => {
          const through = before ? group.slice(0, i) : group.slice(i + 1);
          if (!before) lines.push(draw(group.slice(i)));
          else if (through.length) lines.push(draw(through));
          // wrap to the gap before the next pipe on the right if it's roomy (≥30), else full width
          const right = [...through].sort((a, b) => a.col - b.col).find(r => r.col > g.col);
          const full = cols - gutter.length - g.col;
          const gap = right ? right.col - g.col - 1 : full;
          const width = Math.max(gap >= 30 ? gap : full, 10);
          for (const e of g.entries)
            for (const ln of wrap(this.format(e), width))
              lines.push(draw([...through, { col: g.col, ...ln }]));
        });
        if (before) lines.push(draw(group));

        // Print, dropping a pipes-only line whose pipes already show above, and
        // collapsing exact repeats.
        let prev: string | undefined;
        for (const line of lines) {
          if (prev !== undefined) {
            if (line === prev) continue;
            const p = plain(line);
            if (/^[\s|]*$/.test(p) && p.includes('|') && [...p].every((ch, k) => ch !== '|' || plain(prev!)[k] === '|')) continue;
          }
          console.error(line);
          prev = line;
        }
      }
      const highlight = (): string => {
        const segments = info.flatMap(({ entries }) => {
          const worst = entries.reduce((a, b) =>
            DIAGNOSTIC_SEVERITY[b.level] > DIAGNOSTIC_SEVERITY[a.level] ? b : a
          );
          worst.node.color = this.color(worst.level);
          return worst.node.segments;
        });
        const text = line.string;
        const chars: (string | undefined)[] = new Array(text.length).fill(undefined);
        const coat = painted.filter(s => s.end >= line.begin && s.begin <= line.end).sort((a, b) => (b.end - b.begin) - (a.end - a.begin));
        for (const s of coat) {
          const hex = s.color;
          if (!hex) continue;
          for (let k = Math.max(s.begin - line.begin, 0); k <= Math.min(s.end - line.begin, text.length - 1); k++) chars[k] = ansi(hex);
        }
        for (const s of segments) {
          if (!s.color) continue;
          for (let k = Math.max(s.begin - line.begin, 0); k <= Math.min(s.end - line.begin, text.length - 1); k++) chars[k] = s.color;
        }
        let colored = '', current: string | undefined;
        for (let k = 0; k < text.length; k++) {
          const color = chars[k] ?? c.gray;
          if (color !== current) { colored += color; current = color; }
          colored += text[k];
        }
        return colored;
      }
      
      const info = [...Map.groupBy(visibile, entry => entry.node.cursor - line.begin)].map(([col, entries]) => ({ col, entries }));
      const above = info.filter((_, i) => i % 2 === 1).reverse().sort((a, b) => b.col - a.col);
      const below = info.filter((_, i) => i % 2 === 0);

      annotate(above, true)
      console.error(`${c.gray}${String(i + 1).padStart(line_number_width)} ${c.reset}${highlight()}${c.reset}`);
      annotate(below, false)
      console.error('')
    }
  }
  print_diagnostic(entry: Diagnostic) {
    if (entry.level === 'fatal') { console.error(''); console.error(this.format(entry)); return; }
    console.error(`${c.gray}${entry.node?.source?.location ? `${entry.node?.source?.location}:${entry.node.line}:${entry.node.col}` : `unknown location`}${c.reset}`);
    console.error(`  ${this.format(entry)}`);
  }

  format(entry: Diagnostic): string { return `${this.color(entry.level)}${entry.level}${c.reset} ${this.message(entry)}${c.gray} [${env.version.toString()}]${c.reset}`; }

  message(entry: Diagnostic): string {
    if (!entry.at) return entry.message;
    const at = this.current(entry.at);
    return `${entry.message} (in ${at.source.name}:${at.line}:${at.col})`;
  }
  current(node: Text.Node): Text.Node {
    const source = this.program?.sources.find(src => src.location === node.source.location);
    if (!source || source === node.source) return node;
    const before = node.source.value;
    const { prefix, suffix, delta } = Text.shift(before, source.value);
    const begin = node.begin < prefix ? node.begin : node.begin >= before.length - suffix ? node.begin + delta : node.begin;
    return new Text.Node(source).span(begin, begin);
  }

  private silent = 0;
  muted<T>(fn: () => T): T { this.silent++; try { return fn(); } finally { this.silent--; } }

  refused = 0;
  report(entry: Diagnostic) {
    if (this.silent > 0 && (entry.level === 'error' || entry.level === 'fatal')) this.refused++;
    if (this.silent > 0 || !this.is_visible(entry.level)) return;
    
    const source = entry.node?.source;
    let expr = this.items.get(source);
    if (!expr) { expr = new Map(); this.items.set(source, expr); }
    let expr_diagnostics = expr.get(entry.node?.expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(entry.node?.expression, expr_diagnostics); }

    // The same complaint about the same place is only worth making once
    if (expr_diagnostics.some(x => x.level === entry.level && x.message === entry.message && x.node?.begin === entry.node?.begin)) return;

    expr_diagnostics.push(entry);
    
    if (entry.level === 'fatal') return this.exit();
  }

  exit(): never {
    this.print();
    if (env.nodejs) return process.exit(1);
    throw new Error('fatal diagnostic');
  }

  static STYLES: Record<Diagnostic['level'], string[]> = { fatal: ['fatal'], error: ['error'], warning: ['warn', 'warning'], info: ['info'], debug: ['debug'], trace: ['trace'] };
  color(level: Diagnostic['level']): string {
    const hex = Diagnostics.STYLES[level].map(style => this.program?.color(style)).find(Boolean);
    return hex ? ansi(hex, level === 'fatal' || level === 'error' || level === 'warning') : Diagnostics.levelColor[level];
  }

  static levelColor: Record<Diagnostic['level'], string> = {
    fatal:   '\x1b[1;31m',
    error:   '\x1b[1;31m',
    warning: '\x1b[1;33m',
    info:    '\x1b[34m',
    debug:   '\x1b[32m',
    trace:   '\x1b[90m',
  }
}
