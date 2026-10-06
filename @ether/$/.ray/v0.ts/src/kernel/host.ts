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
export type Diagnostic = { level: string; message: string; at?: Span; top?: { src: number; at: number } };

// Character classes: 1 word, 2 space, 4 run (an operator character), 8 run between tokens, 16 letter.
const classes = new Uint8Array(65536);
for (let code = 0; code < 65536; code++) {
  const c = String.fromCharCode(code);
  classes[code] = (/[\p{L}\p{N}_]/u.test(c) ? 1 : 0) | (/\s/.test(c) ? 2 : 0) | (!/[\s\p{L}\p{N}_(){}\[\]`"',;]/u.test(c) ? 4 : 0) | (!/[\s\p{L}\p{N}_(){}\[\]`]/u.test(c) ? 8 : 0) | (/\p{L}/u.test(c) ? 16 : 0);
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
  private sources: number[] = [];
  // Paints per source: by span, the latest first (up to five); each a style name, a place or a rule, its style found when asked.
  private paints = new Map<number, Map<number, { begin: number; end: number; refs: [number, number][] }>>();
  active?: Set<number>;
  on_trace?: (rule: number, src: number, begin: number, end: number) => void;
  private reads = new Map<number, Set<number>>();
  private heavy = Number(process.env.KMEM ?? 1 << 24);
  private dried = new Set<string>();
  private fence = 0;
  // What compiling the reader left for compiling bodies later: its blocks, natives, constants and classes; and what compiled bodies hold.
  private compiling?: { natives: Record<string, Native>; table: Native[]; constants: Record<string, number>; program: import('./k.ts').Program };
  private kept: number[] = [];
  private bodies = 0;

  constructor() {
    const natives: Record<string, Native> = { ...basics, ...memory, ...graph, ...raising, unported: (m: Machine, what: number) => { throw new Error('unported: ' + this.name_text(what)); }, dried: (m: Machine, src: number, b: number, limit: number) => { const key = `${src}:${b}:${limit}`; if (this.dried.has(key)) return TRUE; this.dried.add(key); return NONE; }, compile_body: (m: Machine, src: number, begin: number, limit: number) => this.compile_body(src, begin >> 3, limit >> 3), run_body: (m: Machine, block: number, frame: number, src: number, limit: number, begin: number, mark: number, c: number) => (this.machine.compiled!.get(block) as any)(this.machine, frame, src, limit, begin, mark, c), heavy: () => this.fence > 0 && this.graph.made > this.heavy ? TRUE : NONE, read_at: (m: Machine, src: number, at: number) => { if (this.active === undefined || this.active.has(src)) { let read = this.reads.get(src); if (read === undefined) this.reads.set(src, read = new Set()); read.add(at >> 3); } return NONE; }, shown: (m: Machine, src: number) => this.active === undefined || this.active.has(src) ? TRUE : NONE, traced: (m: Machine, rule: number, src: number, b: number, e: number) => { this.on_trace?.(rule, src, b >> 3, e >> 3); return NONE; }, was_read: (m: Machine, src: number, at: number) => this.reads.get(src)?.has(at >> 3) ? TRUE : NONE, paint: (m: Machine, src: number, b: number, e: number, kind: number, ref: number) => { this.paint(src, b >> 3, e >> 3, kind >> 3, ref); return NONE; }, collect: (m: Machine, a: number, b: number, c: number, mark: number) => { if (this.fence > 0 && this.graph.made > Number(process.env.KGC ?? 1 << 23)) this.collect([a, b, c], mark >> 3); return NONE; } };
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
    this.compiling = { natives, table, constants: { UNDEF, BREAK, NIL: 0, ROOT: root, CLASSES: chars, ...tags }, program };
    if (process.env.KOPT === 'off') reduce(this.graph, this.k, natives, this.machine.catches);
    else for (const [name, b] of reduce(this.graph, this.k, natives, this.machine.catches, program.arity)) this.k.set(name, b);
    if (process.env.RAY_BACKEND !== 'vm') {
      this.machine.compiled = javascript(this.graph, this.k, table, this.machine.catches, program.arity, new Map(), process.env.KLEARN !== 'off'); this.machine.arity = program.arity;
    }
    if (process.env.RAY_BACKEND !== 'vm' && process.env.KLEARN !== 'off') {
      const Q = new Reducer(this.graph, this.machine.R, results(this.graph, this.k, natives, this.machine.catches));
      this.machine.Q = Q;
      Q.names = [...this.k.keys()];
      if (process.env.KLEARN_REPORT) process.on('exit', () => console.error(Q.report([...this.k.keys()]).slice(0, Number(process.env.KLEARN_REPORT)).map(s => `${s.name}\t${s.lookups}\t${s.hits}\t${s.learned}\t${s.kept}\t${(s.reads / Math.max(1, s.kept)).toFixed(0)}\t${s.off}`).join('\n')));
    }

    this.kernel('boot');
    this.booted = true;
    for (const name of this.pending.sort((a, b) => this.field(a, 'length') - this.field(b, 'length'))) this.kernel('name_adopt', name);
    this.GLOBAL = this.kernel('global');
    this.kernel('natives_table');
    this.kernel('seed_rule', this.source('', '{pattern} => {body}'));
    if (process.env.KPLANS === 'off') this.kernel('set_unplanned');
    if (process.env.KBUDGET) this.kernel('set_budget', I(Number(process.env.KBUDGET)));
    this.fence = this.graph.top;
  }

  // What the reader keeps going is kept; code forced since `mark` is forgotten when nothing else reaches it.
  private collect(roots: number[], mark: number) {
    const forced = this.field(this.root, 'forced'), F = this.fields;
    const first = F.get('first')!, last = F.get('last')!, size = F.get('size')!, value = F.get('value')!, next = F.get('next')!;
    const newer: number[] = [];
    let link = this.get(forced, first);
    for (let k = (this.get(forced, size) >> 3) - mark; k > 0; k--) { newer.push(this.get(link, value)); link = this.get(link, next); }
    this.put(forced, first, link);
    this.put(forced, size, I(mark));
    if (link === 0) this.put(forced, last, 0);
    const held: number[] = [];
    for (const spans of this.paints.values()) for (const paint of spans.values()) for (const [, ref] of paint.refs) held.push(ref);
    const freed = this.graph.sweep([...roots, this.root, this.GLOBAL, ...this.names.values(), ...this.sources, ...held, ...this.kept], this.fence);
    const h = this.graph.heap;
    let kept = 0;
    for (let k = newer.length - 1; k >= 0; k--) {
      if (h[(newer[k] >> 3) * 4] === 0) continue;
      const l = this.record(2);
      this.put(l, value, newer[k]); this.put(l, next, this.get(forced, first));
      if (this.get(forced, first) === 0) this.put(forced, last, l);
      this.put(forced, first, l);
      kept++;
    }
    this.put(forced, size, I(mark + kept));
  }

  // A span's statements as a goto program: each planned statement runs as its plan, under its guard; any other is one step of the
  // reader; where reading goes next is checked against where the next statement starts, and anything else reads on from there.
  private compile_body(src: number, begin: number, limit: number): number {
    if (this.compiling === undefined || process.env.KBODIES !== 'on') return 0;
    const field = (r: number, name: string) => this.get(r, this.fields.get(name)!);
    const statements: { start: number; plan: number; kind: number; end: number }[] = [];
    for (let s = this.kernel('blank_end', src, I(begin), I(limit)) >> 3; s < limit;) {
      const plan = this.kernel('plan_at', src, I(s)), planned = plan !== 0;
      const end = planned ? field(plan, 'end') >> 3 : this.kernel('statement_end', src, I(s), I(limit)) >> 3;
      statements.push({ start: s, plan, kind: planned ? field(plan, 'kind') >> 3 : 0, end });
      const next = this.kernel('blank_end', src, I(Math.max(end, s + 1)), I(limit)) >> 3;
      s = next > s ? next : s + 1;
    }
    if (!statements.some(x => x.plan !== 0)) return 0;
    const name = `body_${this.bodies++}`, constants: Record<string, number> = { ...this.compiling.constants };
    const int = (r: number, f: string) => field(r, f) >> 3;
    const out: string[] = [`${name} (frame, src, limit, begin, mark, c) => (`, '  last := UNDEF', '  pos := 0', '  value := UNDEF', '  next := 0', '  h := 0', '  g := 0'];
    if (statements.some(x => x.kind === 3)) out.push('  ext := external_is(frame)');
    if (statements.some(x => x.kind === 5)) out.push(`  sh, sg := self_at(src, ${statements[0].start}, frame)`);
    statements.forEach((x, i) => {
      const P = `P_${i}`, S = x.start, p = x.plan;
      if (p !== 0) { constants[P] = p; this.kept.push(p); }
      const fallback = () => `{ return read_on(src, ${S}, limit, frame, begin, mark, last) }`;
      const caught = `catch e { pos, last := jumped(e, src, limit, begin, frame, mark, last, ${S}); goto dispatch }`;
      out.push(`  s${i}\\`);
      if (p !== 0) out.push('  h, g := frame_key(frame)', `  if plan_at(src, ${S}) != ${P} { c.block = NIL; c.reads = 0; return read_on(src, ${S}, limit, frame, begin, mark, last) }`, `  if h != ${P}.h ${fallback()}`, `  if g != ${P}.g ${fallback()}`, `  if !declared_is(${P}.declared) ${fallback()}`);
      if (x.kind === 1) {
        const cb = int(p, 'cb');
        out.push('  spend(2)', `  if ${cb < 0 ? 'global' : `code_met(src, ${cb}, ${int(p, 'ce')}, frame)`} { pos = goto_to(${P}, src, limit, begin, frame, mark, last, ${S}); goto dispatch }`, `  pos = ${x.end}`);
      } else if (x.kind === 2) out.push('  spend(2)', `  pos = ${x.end}`);
      else if (x.kind === 3) {
        const f = field(p, 'native_fn'), count = int(p, 'count'), spans = field(p, 'spans'), N = `N_${i}`;
        constants[N] = field(f, 'name');
        const args = Array.from({ length: 4 }, (_, k) => k < count ? `code(src, ${this.get(spans, 2 * k) >> 3}, ${this.get(spans, 2 * k + 1) >> 3}, frame)` : 'UNDEF');
        out.push(`  if !ext ${fallback()}`, `  value, pos := statement(src, ${x.end}, limit, frame, external_call(${N}, ${count}, ${args.join(', ')}, frame, src, ${x.end}, ${x.end - 1})) ${caught}`, '  if value != UNDEF { last = value }');
      } else if (x.kind === 5) {
        out.push(`  if sh != ${int(p, 'sh')} or sg != ${int(p, 'sg')} ${fallback()}`, `  value, pos := statement(src, ${x.end}, limit, frame, place_of(frame, src, ${S}, ${x.end})) ${caught}`, '  if value != UNDEF { last = value }');
      } else out.push(`  value, pos := planned_statement(src, ${S}, limit, frame) ${caught}`, '  if value != UNDEF { last = value }', `  if pos == ${S} { pos = ${S + 1} }`);
      out.push('  next = blank_end(src, pos, limit)');
      if (i + 1 < statements.length) out.push(`  if next == ${statements[i + 1].start} { goto s${i + 1} }`);
      else out.push('  if next >= limit { return body_done(mark, last) }');
      out.push('  goto dispatch');
    });
    out.push('  dispatch\\', '  next = blank_end(src, pos, limit)', '  if next >= limit { return body_done(mark, last) }');
    statements.forEach((x, i) => out.push(`  if next == ${x.start} { goto s${i} }`));
    out.push('  return read_on(src, pos, limit, frame, begin, mark, last)', ')');
    const t0 = performance.now();
    const before = this.compiling.program;
    const made = compile(out.join('\n'), this.compiling.natives, { graph: this.graph, catches: this.machine.catches, constants, intern: (text: string) => this.name_id(text), known: { blocks: before.blocks, arity: before.arity, fields: this.fields, classes: before.classes } });
    const t1 = performance.now();
    const block = made.fresh.get(name)!;
    const fns = javascript(this.graph, made.fresh, this.compiling.table, this.machine.catches, made.arity, this.machine.compiled!, process.env.KLEARN !== 'off');
    for (const [b, f] of fns) this.machine.compiled!.set(b, f as any);
    this.machine.arity!.set(block, made.arity.get(block)!);
    this.kept.push(block);
    if (process.env.KBODY_TIME) { const t = (globalThis as any).__bt ??= (process.on('exit', () => console.error('bodies', (globalThis as any).__bt)), { n: 0, ms: 0 }); t.n++; t.ms += performance.now() - t0; t.compile = (t.compile ?? 0) + t1 - t0; }
    if (process.env.KBODY_LOG) console.error(out.join('\n'));
    return block;
  }

  kernel(name: string, ...args: number[]): number { return this.machine.run(this.k.get(name)!, args); }
  // Records are graph nodes of n children.
  private record(n: number) { return this.graph.wide(RECORD, n); }
  private put(p: number, k: number, v: number) { this.graph.heap[(p >> 3) * 4 + 1 + k] = v; }
  private get(p: number, k: number) { return this.graph.heap[(p >> 3) * 4 + 1 + k]; }
  private field(record: number, name: string) { return this.get(record, this.fields.get(name)!); }
  private list(l: number): number[] { const out: number[] = []; for (let at = this.field(l, 'first'); at !== 0; at = this.field(at, 'next')) out.push(this.field(at, 'value')); return out; }

  // A source is laid out in memory: its characters, then what the kernel lays out beside them.
  source(location: string, value: string): number {
    const n = value.length, chars = this.record(n + 1);
    for (let k = 0; k < n; k++) this.put(chars, k, I(value.charCodeAt(k)));
    const src = this.kernel('lay', chars, I(n), location !== '' ? TRUE : NONE);
    this.sources.push(src);
    return src;
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
      this.put(id, this.fields.get('chars')!, chars); this.put(id, this.fields.get('length')!, I(n));
      this.pending.push(id);
    } else id = this.kernel('intern', chars, I(0), I(n));
    this.spelled.set(id, name); this.names.set(name, id);
    return id;
  }
  name_text(id: number): string {
    let text = this.spelled.get(id);
    if (text !== undefined) return text;
    const chars = this.field(id, 'chars'), n = this.field(id, 'length') >> 3;
    text = String.fromCharCode(...Array.from({ length: n }, (_, k) => this.get(chars, k) >> 3));
    this.spelled.set(id, text); this.names.set(text, id);
    return text;
  }

  serve(on: boolean) { this.kernel('set_serving', on ? TRUE : NONE); }
  trace(on?: (rule: number, src: number, begin: number, end: number) => void) { this.on_trace = on; this.kernel('set_tracing', on ? TRUE : NONE); }
  private paint(src: number, begin: number, end: number, kind: number, ref: number) {
    if (this.active !== undefined && !this.active.has(src)) return;
    let spans = this.paints.get(src);
    if (spans === undefined) this.paints.set(src, spans = new Map());
    const key = begin * 65536 + (end - begin), at = spans.get(key);
    if (at === undefined) { spans.set(key, { begin, end, refs: [[kind, ref]] }); return; }
    at.refs.unshift([kind, ref]);
    if (at.refs.length > 5) at.refs.length = 5;
  }
  forget_paints(src: number) { this.paints.delete(src); this.reads.delete(src); }
  dry(only?: number) {
    this.kernel('dry_all');
    for (const src of only !== undefined ? [only] : this.active ?? this.reads.keys()) this.kernel('dry_source', src);
  }
  // A source edited from another: the paints outside the statements the edit touched are carried over, those statements are painted dry.
  redry(before: number, src: number, was: string, text: string) {
    const m = Math.min(was.length, text.length);
    let p = 0, s = 0;
    while (p < m && was.charCodeAt(p) === text.charCodeAt(p)) p++;
    while (s < m - p && was.charCodeAt(was.length - 1 - s) === text.charCodeAt(text.length - 1 - s)) s++;
    let from = 0, to = text.length;
    for (let pos = this.kernel('blank_end', src, I(0), I(text.length)) >> 3; pos < text.length;) {
      const start = this.kernel('spaces', src, I(pos), I(text.length)) >> 3, end = this.kernel('statement_end', src, I(start), I(text.length)) >> 3;
      const next = this.kernel('blank_end', src, I(Math.max(end, start + 1)), I(text.length)) >> 3;
      if (next <= p) from = next;
      if (pos > text.length - s) { to = pos; break; }
      pos = next > pos ? next : pos + 1;
    }
    const delta = text.length - was.length, spans = new Map<number, { begin: number; end: number; refs: [number, number][] }>();
    for (const paint of this.paints.get(before)?.values() ?? []) {
      if (paint.end < from) spans.set(paint.begin * 65536 + (paint.end - paint.begin), paint);
      else if (paint.begin >= to - delta) spans.set((paint.begin + delta) * 65536 + (paint.end - paint.begin), { begin: paint.begin + delta, end: paint.end + delta, refs: paint.refs });
    }
    this.paints.set(src, spans);
    const read = this.reads.get(before);
    if (read !== undefined) this.reads.set(src, new Set([...read].flatMap(at => at < from ? [at] : at >= to - delta ? [at + delta] : [])));
    if (from < to) this.kernel('dry_from', src, I(from), I(to), this.GLOBAL);
  }
  // Paints read elsewhere (another reader of the same text) take the place of a source's own.
  adopt(src: number, paints: { begin: number; end: number; style: string }[]) {
    const spans = new Map<number, { begin: number; end: number; refs: [number, number][] }>();
    for (const p of paints) spans.set(p.begin * 65536 + (p.end - p.begin), { begin: p.begin, end: p.end, refs: [[0, this.name_id(p.style)]] });
    this.paints.set(src, spans);
  }
  // All the reader knows, to be set back to: what reading something leaves behind is then forgotten.
  snapshot() {
    const g = this.graph, copy = <K, V>(m: Map<K, V>) => new Map(m);
    return {
      heap: g.heap.slice(0, g.top * 4), width: g.width.slice(0, g.top), top: g.top, free: g.free, wfree: copy(g.wfree), made: g.made,
      names: copy(this.names), spelled: copy(this.spelled), pending: [...this.pending], sources: [...this.sources], kept: [...this.kept],
      paints: new Map([...this.paints].map(([src, spans]) => [src, new Map([...spans].map(([k, p]) => [k, { ...p, refs: [...p.refs] }]))])),
      reads: new Map([...this.reads].map(([src, at]) => [src, new Set(at)])), dried: new Set(this.dried), active: this.active && new Set(this.active),
    };
  }
  restore(s: ReturnType<Reader['snapshot']>) {
    const g = this.graph;
    g.heap.set(s.heap); g.heap.fill(0, s.heap.length, g.top * 4);
    g.width.set(s.width); g.width.fill(0, s.width.length, g.top);
    g.top = s.top; g.free = s.free; g.wfree = new Map(s.wfree); g.made = s.made;
    this.names = new Map(s.names); this.spelled = new Map(s.spelled); this.pending = [...s.pending]; this.sources = [...s.sources]; this.kept = [...s.kept];
    this.paints = new Map([...s.paints].map(([src, spans]) => [src, new Map([...spans].map(([k, p]) => [k, { ...p, refs: [...p.refs] }]))]));
    this.reads = new Map([...s.reads].map(([src, at]) => [src, new Set(at)])); this.dried = new Set(s.dried); this.active = s.active && new Set(s.active);
  }
  // A whole source, a top-level statement at a time.
  read_all(src: number, end: number) {
    for (let pos = 0; pos < end;) pos = this.step_on(src, pos, end);
  }
  // One top-level statement, and where reading goes on: past a statement that kept applying itself (said by recursion_said), or
  // one the reader failed on (said as a diagnostic), at the next statement.
  step_on(src: number, at: number, end: number): number {
    try {
      const next = this.safely(() => this.step(src, at, end));
      if (next !== undefined) return next;
      this.kernel('recover');
      return this.kernel('next_statement', src, I(at), I(end)) >> 3;
    } catch (e) {
      this.kernel('recover');
      if (process.env.KERRORS) console.error(e);
      return this.kernel('failed_at', src, I(at), I(end)) >> 3;
    }
  }
  // A source read once more where the first reading left something unresolved (the entrypoint always: what it defines late is
  // used early), what it said before forgotten.
  settle(src: number, end: number, always = false) {
    if (!always && !this.diagnostics_of(src).some(d => d.message.startsWith('Unresolved'))) return false;
    this.kernel('forget_diagnostics', src);
    this.read_all(src, end);
    return true;
  }
  // Reads one statement at `pos` of a source; answers where reading goes on.
  step(src: number, pos: number, end: number): number { return this.kernel('read_step', src, I(pos), I(end), this.GLOBAL) >> 3; }
  // A source no one reads any more: its paints, what was read of it, and it as a root.
  drop(src: number) {
    this.forget_paints(src);
    this.active?.delete(src);
    const k = this.sources.indexOf(src);
    if (k >= 0) this.sources.splice(k, 1);
    for (const key of [...this.dried]) if (key.startsWith(`${src}:`)) this.dried.delete(key);
  }
  diagnostics_of(src: number): Diagnostic[] { return this.diagnostics.filter(d => d.at?.src === src); }
  // What a source is painted with: each span with the first of its paints that names a style.
  painted(src: number): { begin: number; end: number; style: string }[] {
    const out: { begin: number; end: number; style: string }[] = [];
    for (const paint of this.paints.get(src)?.values() ?? []) {
      for (const [kind, ref] of paint.refs) {
        let name = kind === 0 ? ref : kind === 1 || kind === 3 ? this.kernel('place_style', ref) : this.kernel('rule_style_name', ref);
        if (kind === 3 && (name === NONE || name === UNDEF)) name = this.name_id('variable');
        if (name === NONE || name === UNDEF || name === 0 || (name & 7) !== 0) continue;
        out.push({ begin: paint.begin, end: paint.end, style: this.name_text(name) });
        break;
      }
    }
    return out;
  }

  read(span: Span, frame: number): number | undefined { const r = this.kernel('read', span.src, I(span.begin), I(span.end), frame); return r === UNDEF ? undefined : r; }
  safely<T>(fn: () => T): T | undefined {
    try { return fn(); }
    catch (e) {
      if (e instanceof Raised && this.field(e.value, 'kind') === I(2)) { this.kernel('recursion_said', e.value); return undefined; }
      this.kernel('recover');
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
      const v = (name: string) => this.field(d, name), src = v('src');
      return { level: this.name_text(v('level')), message: this.name_text(v('message')), at: src === I(-1) ? undefined : this.span(src, v('begin') >> 3, v('end') >> 3), top: v('top_src') === I(-1) ? undefined : { src: v('top_src'), at: v('top_at') >> 3 } };
    });
  }
}

// The order a library is read in: a file after the files defining the names it uses at the top level, and among files that are
// ready, those writing more syntax (rules spelled with something other than a name first) earlier; a cycle is broken at the file
// waiting on the fewest others.
export function reading_order(files: { path: string; text: string }[]): string[] {
  const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const syntax = (text: string) => text.split('\n').filter(line => /^[^A-Za-z\s/].*=>|^[A-Za-z_]+ \{[a-z]/.test(line)).length;
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []), syntax: syntax(f.text) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order: string[] = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) {
    const waiting = (path: string) => [...needs.get(path)!].filter(p => left.has(p)).length;
    const next = [...left].map(path => info.find(f => f.path === path)!).sort((a, b) => waiting(a.path) - waiting(b.path) || b.syntax - a.syntax || (a.path < b.path ? -1 : 1))[0];
    order.push(next.path);
    left.delete(next.path);
  }
  return order;
}
