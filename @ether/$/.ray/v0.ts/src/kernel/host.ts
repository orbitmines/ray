import { Graph, INT, CONST, edge } from './kernel.ts';
import { compile, type Records } from './k.ts';
import { reduce, results, Reducer } from './reduce.ts';
import { javascript } from './js.ts';
import { Machine, Raised, basics, memory, graph, raising, NONE, GLOBAL as TRUE, NATIVE, PROP, RECORD, arities, type Native } from './vm.ts';

// The host of the reader in `.kernel.ray`: it lays out the machine, the character classes and the sources, runs `read`,
// and shows what the kernel recorded (names, rules, definitions, diagnostics) to whoever runs it.

const UNDEF = edge(2, CONST), BREAK = edge(5, CONST);
export const SCOPE = 10, CODE = 11, PLACE = 12, TEXT = 13, FN = 14, RULEV = 15;
const I = (n: number) => (n << 3) | INT;

export type Span = { src: number; begin: number; end: number };
export type Diagnostic = { level: string; message: string; at?: Span };

// Character classes: 1 word, 2 space, 4 run (an operator character), 8 run between tokens, 16 letter.
const classes = new Uint8Array(65536);
for (let code = 0; code < 65536; code++) {
  const c = String.fromCharCode(code);
  classes[code] = (/[\p{L}\p{N}_]/u.test(c) ? 1 : 0) | (/\s/.test(c) ? 2 : 0) | (!/[\s\p{L}\p{N}_(){}\[\]`"']/u.test(c) ? 4 : 0) | (!/[\s\p{L}\p{N}_(){}\[\]`]/u.test(c) ? 8 : 0) | (/\p{L}/u.test(c) ? 16 : 0);
}

export class Reader {
  graph: Graph;
  machine: Machine;
  k: Map<string, number>;
  fields: Map<string, number>;
  records: Records;
  root: number;
  GLOBAL: number;
  private names = new Map<string, number>();
  private spelled = new Map<number, string>();
  private pending: number[] = [];
  private booted = false;

  constructor() {
    const natives: Record<string, Native> = { ...basics, ...memory, ...graph, ...raising, unported: (m: Machine, what: number) => { throw new Error('unported: ' + this.name_text(what)); } };
    const table = Object.values(natives);
    const a = new Uint8Array(NATIVE + table.length);
    a.set(arities(table));
    a[SCOPE] = 2; a[CODE] = 3; a[PLACE] = 3; a[TEXT] = 1; a[FN] = 1; a[RULEV] = 1;
    this.graph = new Graph(a, 1 << 16);
    this.machine = new Machine(this.graph, [], table);
    const root = this.record(128);
    for (let k = 0; k < 128; k++) this.put(root, k, NONE);
    this.root = root;
    const chars = this.record(65536);
    for (let code = 0; code < 65536; code++) this.put(chars, code, I(classes[code]));
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    const tags = { SCOPE: I(SCOPE), CODE: I(CODE), PLACE: I(PLACE), TEXT: I(TEXT), FN: I(FN), RULEV: I(RULEV), PROP: I(PROP) };
    const program = compile(fs.readFileSync(path.join(import.meta.dirname, '.kernel.ray'), 'utf8'), natives, { graph: this.graph, catches: this.machine.catches, constants: { UNDEF, BREAK, NIL: 0, ROOT: root, CLASSES: chars, ...tags }, intern: (text: string) => this.name_id(text), laid: (fields, records) => { this.fields = fields; this.records = records; } });
    this.k = program.blocks;
    if (process.env.KOPT === 'off') reduce(this.graph, this.k, natives, this.machine.catches);
    else for (const [name, b] of reduce(this.graph, this.k, natives, this.machine.catches, program.arity)) this.k.set(name, b);
    if (process.env.RAY_BACKEND !== 'vm') {
      this.machine.compiled = javascript(this.graph, this.k, table, this.machine.catches, program.arity); this.machine.arity = program.arity;
      const Q = new Reducer(this.graph, this.machine.R, results(this.graph, this.k, natives, this.machine.catches));
      this.machine.Q = Q;
      Q.names = [...this.k.keys()];
      if (process.env.KLEARN_REPORT) process.on('exit', () => console.error(Q.report([...this.k.keys()]).slice(0, Number(process.env.KLEARN_REPORT)).map(s => `${s.name}\t${s.lookups}\t${s.hits}\t${s.learned}\t${s.kept}\t${(s.reads / Math.max(1, s.kept)).toFixed(0)}\t${s.off}`).join('\n')));
    }

    this.kernel('boot');
    this.booted = true;
    for (const name of this.pending.sort((a, b) => this.field(a, 'name_length') - this.field(b, 'name_length'))) this.kernel('name_adopt', name);
    this.GLOBAL = this.kernel('global');
    this.kernel('natives_table');
    this.kernel('seed_rule', this.source('', '{pattern} => {body}'));
  }

  kernel(name: string, ...args: number[]): number { return this.machine.run(this.k.get(name)!, args); }
  // Records are graph nodes of n children.
  private record(n: number) { return this.graph.wide(RECORD, n); }
  private put(p: number, k: number, v: number) { this.graph.heap[(p >> 3) * 4 + 1 + k] = v; }
  private get(p: number, k: number) { return this.graph.heap[(p >> 3) * 4 + 1 + k]; }
  private field(record: number, name: string) { return this.get(record, this.fields.get(name)!); }
  private list(l: number): number[] { const out: number[] = []; for (let at = this.field(l, 'list_first'); at !== 0; at = this.field(at, 'link_next')) out.push(this.field(at, 'link_value')); return out; }

  // A source is laid out in memory: its characters, then what the kernel lays out beside them.
  source(location: string, value: string): number {
    const n = value.length, chars = this.record(n + 1);
    for (let k = 0; k < n; k++) this.put(chars, k, I(value.charCodeAt(k)));
    return this.kernel('lay', chars, I(n), location !== '' ? TRUE : NONE);
  }
  span(src: number, begin: number, end: number): Span { return { src, begin, end }; }

  // Names are the kernel's: before it runs they are laid out here and taken into its index when it boots.
  name_id(name: string): number {
    let id = this.names.get(name);
    if (id !== undefined) return id;
    const n = name.length, chars = this.record(n + 1);
    for (let k = 0; k < n; k++) this.put(chars, k, I(name.charCodeAt(k)));
    if (!this.booted) {
      id = this.record(this.records.get('Name')!.length);
      this.put(id, this.fields.get('name_chars')!, chars); this.put(id, this.fields.get('name_length')!, I(n));
      this.pending.push(id);
    } else id = this.kernel('intern', chars, I(0), I(n));
    this.spelled.set(id, name); this.names.set(name, id);
    return id;
  }
  name_text(id: number): string {
    let text = this.spelled.get(id);
    if (text !== undefined) return text;
    const chars = this.field(id, 'name_chars'), n = this.field(id, 'name_length') >> 3;
    text = String.fromCharCode(...Array.from({ length: n }, (_, k) => this.get(chars, k) >> 3));
    this.spelled.set(id, text); this.names.set(text, id);
    return text;
  }

  read(span: Span, frame: number): number | undefined { const r = this.kernel('read', span.src, I(span.begin), I(span.end), frame); return r === UNDEF ? undefined : r; }
  safely<T>(fn: () => T): T | undefined {
    try { return fn(); }
    catch (e) {
      if (e instanceof Raised && this.field(e.value, 'raised_kind') === I(2)) { this.kernel('recursion_said', e.value); return undefined; }
      throw e;
    }
  }

  // What the kernel recorded.
  name_keys(e: number): string[] {
    const out: string[] = [], h = this.graph.heap, holder = this.kernel('holder_of', e, NONE);
    if (holder === NONE) return out;
    for (let p = h[(holder >> 3) * 4 + 1]; p !== 0; p = h[(p >> 3) * 4 + 3]) out.push(this.name_text(h[(p >> 3) * 4 + 1]));
    return out;
  }
  rule_keys(scope: number): string[] { const n = this.kernel('rules_count', scope) >> 3; return Array.from({ length: n }, (_, k) => this.name_text(this.kernel('rule_key_at', scope, I(k)))); }
  get definitions(): string[] {
    const pairs = this.list(this.field(this.root, 'definitions')), out: string[] = [];
    for (let k = 0; k < pairs.length; k += 2) out.push(`${pairs[k] !== NONE ? 'GLOBAL' : ''}::${this.name_text(pairs[k + 1])}`);
    return out;
  }
  get diagnostics(): Diagnostic[] {
    return this.list(this.field(this.root, 'diagnostics')).map(d => {
      const v = (name: string) => this.field(d, name), src = v('diag_src');
      return { level: this.name_text(v('diag_level')), message: this.name_text(v('diag_message')), at: src === I(-1) ? undefined : this.span(src, v('diag_begin') >> 3, v('diag_end') >> 3) };
    });
  }
}
