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

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = { trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5 };
export class Diagnostics {
  items: Map</*location:*/ Text.Source | undefined, Map<Text.Node | undefined, Diagnostic[]>> = new Map();

  program?: Program

  private start = performance.now();

  constructor(public level: Diagnostic['level'] = 'info') {}

  *all(filter?: (x: Diagnostic) => boolean): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) { for (const [, elements] of arr) { for (const element of elements) { if (filter ? filter(element) : true) yield element; } } }
  }
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
