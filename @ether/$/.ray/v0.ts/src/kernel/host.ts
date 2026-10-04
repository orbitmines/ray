import { Graph, INT, CONST, edge } from './kernel.ts';
import { compile } from './k.ts';
import { reduce } from './reduce.ts';
import { javascript } from './js.ts';
import { Machine, Raised, basics, memory, graph, raising, NONE, GLOBAL as TRUE, NATIVE, PROP, arities, type Native } from './vm.ts';

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
  root: number;
  GLOBAL: number;
  private names = new Map<string, number>();
  private spelled = new Map<number, string>();
  private pending: number[] = [];
  private booted = false;

  constructor() {
    const natives: Record<string, Native> = { ...basics, ...memory, ...graph, ...raising, unported: (m: Machine, what: number) => { throw new Error('unported: ' + this.name_text(what >> 3)); } };
    const table = Object.values(natives);
    const a = new Uint8Array(NATIVE + table.length);
    a.set(arities(table));
    a[SCOPE] = 2; a[CODE] = 3; a[PLACE] = 3; a[TEXT] = 1; a[FN] = 1; a[RULEV] = 1;
    this.graph = new Graph(a, 1 << 16);
    this.machine = new Machine(this.graph, [], table);
    const root = this.machine.alloc(128);
    this.machine.H.fill(NONE, root, root + 128);
    this.root = root;
    const chars = this.machine.alloc(65536);
    for (let code = 0; code < 65536; code++) this.machine.H[chars + code] = I(classes[code]);
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    const tags = { SCOPE: I(SCOPE), CODE: I(CODE), PLACE: I(PLACE), TEXT: I(TEXT), FN: I(FN), RULEV: I(RULEV), PROP: I(PROP) };
    const program = compile(fs.readFileSync(path.join(import.meta.dirname, '.kernel.ray'), 'utf8'), natives, { graph: this.graph, catches: this.machine.catches, constants: { UNDEF, BREAK, NIL: 0, ROOT: I(root), CLASSES: I(chars), ...tags }, intern: (text: string) => this.name_id(text) });
    this.k = program.blocks;
    this.fields = program.fields;
    reduce(this.graph, [...this.k.values()], natives, this.machine.catches);
    if (process.env.RAY_BACKEND !== 'vm') { this.machine.compiled = javascript(this.graph, this.k, table, this.machine.catches, program.arity); this.machine.arity = program.arity; }
    this.kernel('boot');
    this.booted = true;
    for (const name of this.pending) this.kernel('name_adopt', I(name));
    this.GLOBAL = this.kernel('global');
    this.kernel('natives_table');
    this.kernel('seed_rule', I(this.source('', '{pattern} => {body}')));
  }

  kernel(name: string, ...args: number[]): number { return this.machine.run(this.k.get(name)!, args); }
  private field(record: number, name: string) { return this.machine.H[record + this.fields.get(name)!]; }
  private list(l: number): number[] { const n = this.field(l, 'list_size') >> 3, items = this.field(l, 'list_items') >> 3; return Array.from(this.machine.H.subarray(items, items + n)); }

  // A source is laid out in memory: its characters, then what the kernel lays out beside them.
  source(location: string, value: string): number {
    const n = value.length, chars = this.machine.alloc(n + 1);
    for (let k = 0; k < n; k++) this.machine.H[chars + k] = I(value.charCodeAt(k));
    return this.kernel('lay', I(chars), I(n), location !== '' ? TRUE : NONE) >> 3;
  }
  span(src: number, begin: number, end: number): Span { return { src, begin, end }; }

  // Names are the kernel's: before it runs they are laid out here and taken into its index when it boots.
  name_id(name: string): number {
    let id = this.names.get(name);
    if (id !== undefined) return id;
    const n = name.length, chars = this.machine.alloc(n + 1);
    for (let k = 0; k < n; k++) this.machine.H[chars + k] = I(name.charCodeAt(k));
    if (!this.booted) {
      id = this.machine.alloc(3);
      this.machine.H[id] = I(chars); this.machine.H[id + 1] = I(n); this.machine.H[id + 2] = UNDEF;
      this.pending.push(id);
    } else id = this.kernel('intern', I(chars), I(0), I(n)) >> 3;
    this.spelled.set(id, name); this.names.set(name, id);
    return id;
  }
  name_text(id: number): string {
    let text = this.spelled.get(id);
    if (text !== undefined) return text;
    const H = this.machine.H, chars = H[id] >> 3, n = H[id + 1] >> 3;
    text = String.fromCharCode(...Array.from(H.subarray(chars, chars + n), c => c >> 3));
    this.spelled.set(id, text); this.names.set(text, id);
    return text;
  }

  read(span: Span, frame: number): number | undefined { const r = this.kernel('read', I(span.src), I(span.begin), I(span.end), frame); return r === UNDEF ? undefined : r; }
  safely<T>(fn: () => T): T | undefined {
    try { return fn(); }
    catch (e) {
      if (e instanceof Raised && this.field(e.value >> 3, 'raised_kind') === I(2)) { this.kernel('recursion_said', e.value); return undefined; }
      throw e;
    }
  }

  // What the kernel recorded.
  name_keys(e: number): string[] {
    const out: string[] = [], h = this.graph.heap, holder = this.kernel('holder_of', e, NONE);
    if (holder === NONE) return out;
    for (let p = h[(holder >> 3) * 4 + 1]; p !== 0; p = h[(p >> 3) * 4 + 3]) out.push(this.name_text(h[(p >> 3) * 4 + 1] >> 3));
    return out;
  }
  rule_keys(scope: number): string[] { const n = this.kernel('rule_count', scope) >> 3; return Array.from({ length: n }, (_, k) => this.name_text(this.kernel('rule_key_at', scope, I(k)) >> 3)); }
  get definitions(): string[] {
    const pairs = this.list(this.field(this.root, 'definitions') >> 3), out: string[] = [];
    for (let k = 0; k < pairs.length; k += 2) out.push(`${pairs[k] !== NONE ? 'GLOBAL' : ''}::${this.name_text(pairs[k + 1] >> 3)}`);
    return out;
  }
  get diagnostics(): Diagnostic[] {
    return this.list(this.field(this.root, 'diagnostics') >> 3).map(d => {
      const p = d >> 3, v = (name: string) => this.field(p, name) >> 3, src = v('diag_src');
      return { level: this.name_text(v('diag_level')), message: this.name_text(v('diag_message')), at: src < 0 ? undefined : this.span(src, v('diag_begin'), v('diag_end')) };
    });
  }
}
