import { Graph, Rewriter, INT, VAR, SLOT, edge, kind, type Rule } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, BLOCK, CELL, NATIVE, NONE, GLOBAL, arities, type Native, type Catches } from './vm.ts';

// Reductions on the machine's own program graph: the same pattern → pattern rewriting as any other graph.
// - a step that does nothing is skipped; a branch on a constant is taken;
// - a native on constants is its value, and a branch right after a cell is set to a constant is taken;
// - a call handing constants to parameters its function never writes calls a copy of the function with those constants in place
//   (the same function with the same constants is one copy);
// - a call to a small function that calls nothing is its body: parameters and cells set, `return` setting the call's cell.
export function reductions(natives: Record<string, Native>, catches: Catches = new Map(), arity = new Map<number, number>()): Rewriter {
  const table = Object.values(natives), index = new Map(Object.keys(natives).map((name, k) => [name, NATIVE + k]));
  const P = new Graph(arities(table));
  const v = (i: number) => edge(i, VAR), at = (op: string) => index.get(op)!;
  const args = (...xs: number[]) => xs.reduceRight((rest, x) => P.make(ARGS, x, rest), 0);
  const constant = (e: number) => kind(e) !== SLOT;
  const int = (e: number) => kind(e) === INT;
  const rules: Rule[] = [];
  const mov = at('mov');

  rules.push({ lhs: P.make(mov, 0, args(v(0)), v(1)), rhs: v(1) });
  rules.push({ lhs: P.make(IF, v(0), v(1), v(2)), fn: (g, [c, then, otherwise]) => constant(c) ? (c !== NONE ? then : otherwise) : undefined });
  rules.push({ lhs: P.make(mov, v(0), args(v(1)), P.make(IF, v(0), v(2), v(3))), fn: (g, [dst, c, then, otherwise]) => constant(c) ? g.make(mov, dst, g.make(ARGS, c, 0), c !== NONE ? then : otherwise) : undefined });

  const truth = (b: boolean) => b ? GLOBAL : NONE;
  const fold = (op: string, when: (a: number, b: number) => boolean, f: (a: number, b: number) => number) => {
    if (!index.has(op)) return;
    rules.push({ lhs: P.make(at(op), v(0), args(v(1), v(2)), v(3)), fn: (g, [dst, a, b, next]) => when(a, b) ? g.make(mov, dst, g.make(ARGS, f(a, b), 0), next) : undefined });
  };
  const ints = (a: number, b: number) => int(a) && int(b), constants = (a: number, b: number) => constant(a) && constant(b);
  fold('add', ints, (a, b) => edge((a >> 3) + (b >> 3), INT));
  fold('sub', ints, (a, b) => edge((a >> 3) - (b >> 3), INT));
  fold('mul', ints, (a, b) => edge((a >> 3) * (b >> 3), INT));
  fold('lt', ints, (a, b) => truth(a < b));
  fold('le', ints, (a, b) => truth(a <= b));
  fold('gt', ints, (a, b) => truth(a > b));
  fold('ge', ints, (a, b) => truth(a >= b));
  fold('max', ints, (a, b) => a > b ? a : b);
  fold('has', ints, (a, b) => truth(((a >> 3) & (b >> 3)) !== 0));
  fold('eq', constants, (a, b) => truth(a === b));
  fold('ne', constants, (a, b) => truth(a !== b));
  if (index.has('not')) rules.push({ lhs: P.make(at('not'), v(0), args(v(1)), v(2)), fn: (g, [dst, a, next]) => constant(a) ? g.make(mov, dst, g.make(ARGS, truth(a === NONE), 0), next) : undefined });

  if (arity.size > 0) {
    const program = new Program(catches, arity, mov);
    rules.push({ lhs: P.make(CALL, v(0), v(1), v(2)), fn: (g, [dst, list, next], node) => program.call(g, node, dst, list, next) });
    return Object.assign(new Rewriter(P, rules), { program });
  }
  return new Rewriter(P, rules);
}

// What the call rules need to know about functions: their instructions, the cells they write, their size, whether they call.
class Program {
  copies = new Map<string, number>();
  private bound = new Map<number, Set<number>>();
  private origin = new Map<number, number>();
  private count = new Map<number, number>();
  private facts = new Map<number, { writes: Set<number>; size: number; leaf: boolean }>();
  constructor(private catches: Catches, private arity: Map<number, number>, private mov: number) {}

  origin_of(b: number) { return this.origin.get(b) ?? b; }

  private list(g: Graph, l: number) { const xs: number[] = []; for (; l !== 0 && g.tag(l) === ARGS; l = g.child(l, 1)) xs.push(g.child(l, 0)); return xs; }
  private made_list(g: Graph, xs: number[]) { return xs.reduceRight((rest, x) => g.make(ARGS, x, rest), 0); }

  private instructions(g: Graph, start: number) {
    const out: number[] = [], seen = new Set<number>(), todo = [start];
    while (todo.length > 0) {
      const e = todo.pop()!;
      if (e === 0 || kind(e) !== 0 || seen.has(e)) continue;
      seen.add(e); out.push(e);
      const t = g.tag(e), c = this.catches.get(e);
      if (c !== undefined) todo.push(c.handler);
      if (t === JUMP) todo.push(g.child(e, 0));
      else if (t === IF) todo.push(g.child(e, 1), g.child(e, 2));
      else if (t !== RETURN) todo.push(g.child(e, 2));
    }
    return out;
  }

  private about(g: Graph, b: number) {
    let f = this.facts.get(b);
    if (f !== undefined) return f;
    const writes = new Set<number>(), body = this.instructions(g, g.child(b, 1));
    let leaf = true;
    for (const e of body) {
      const t = g.tag(e);
      if (t === CALL) leaf = false;
      if (t !== JUMP && t !== IF && t !== RETURN && g.child(e, 0) !== 0) writes.add(g.child(e, 0) >> 3);
      const c = this.catches.get(e);
      if (c !== undefined) { leaf = false; writes.add(c.cell >> 3); }
    }
    f = { writes, size: body.length, leaf };
    this.facts.set(b, f);
    return f;
  }

  // The instructions from `start` again, with cells renamed (or replaced by constants) and `return v` made by `ret`.
  private copy(g: Graph, start: number, cells: Map<number, number>, ret?: (value: number) => number) {
    const operand = (e: number) => (e & 7) === SLOT ? cells.get(e >> 3) ?? e : e;
    const nodes = new Map<number, number>();
    const copy = (e: number): number => {
      if (e === 0) return 0;
      const known = nodes.get(e);
      if (known !== undefined) return known;
      const t = g.tag(e);
      if (t === RETURN && ret !== undefined) { const r = ret(operand(g.child(e, 0))); nodes.set(e, r); return r; }
      const made = g.make(t, 0, 0, 0);
      nodes.set(e, made);
      const set = (i: number, x: number) => { g.heap[(made >> 3) * 4 + 1 + i] = x; };
      if (t === JUMP) set(0, copy(g.child(e, 0)));
      else if (t === IF) { set(0, operand(g.child(e, 0))); set(1, copy(g.child(e, 1))); set(2, copy(g.child(e, 2))); }
      else if (t === RETURN) set(0, operand(g.child(e, 0)));
      else { set(0, g.child(e, 0) === 0 ? 0 : operand(g.child(e, 0))); set(1, this.made_list(g, this.list(g, g.child(e, 1)).map(operand))); set(2, copy(g.child(e, 2))); }
      const c = this.catches.get(e);
      if (c !== undefined) this.catches.set(made, { handler: copy(c.handler), cell: operand(c.cell) });
      return made;
    };
    return copy(start);
  }

  call(g: Graph, node: number, dst: number, list: number, next: number): number | undefined {
    const caught = this.catches.get(node);
    const [callee, ...given] = this.list(g, list);
    if (kind(callee) !== 0 || callee === 0 || g.tag(callee) !== BLOCK || !this.arity.has(callee)) return undefined;
    const n = this.arity.get(callee)!, cells = this.list(g, g.child(callee, 0)), params = cells.slice(0, n), f = this.about(g, callee);
    if (f.leaf && f.size <= 24 && caught === undefined) {
      const renamed = new Map<number, number>();
      for (const c of cells) renamed.set(c >> 3, (g.make(CELL, NONE) & ~7) | SLOT);
      const body = this.copy(g, g.child(callee, 1), renamed, value => g.make(this.mov, dst, g.make(ARGS, value, 0), next));
      let entry = body;
      for (let i = cells.length - 1; i >= 0; i--) entry = g.make(this.mov, renamed.get(cells[i] >> 3)!, g.make(ARGS, i < n && i < given.length ? given[i] : NONE, 0), entry);
      return entry;
    }
    const constants = new Map<number, number>();
    let key = '';
    for (let i = 0; i < n && i < given.length; i++) {
      if ((given[i] & 7) === SLOT || f.writes.has(params[i] >> 3) || this.bound.get(callee)?.has(i)) continue;
      constants.set(params[i] >> 3, given[i]);
      key += `${i}=${given[i]},`;
    }
    if (constants.size === 0) return undefined;
    key = `${callee}|${key}`;
    let copied = this.copies.get(key);
    const origin = this.origin.get(callee) ?? callee;
    if (copied === undefined && (this.count.get(origin) ?? 0) >= 16) return undefined;
    if (copied === undefined) {
      this.count.set(origin, (this.count.get(origin) ?? 0) + 1);
      const renamed = new Map<number, number>(), fresh: number[] = [];
      for (const c of cells) { const made = (g.make(CELL, NONE) & ~7) | SLOT; fresh.push(made); renamed.set(c >> 3, constants.get(c >> 3) ?? made); }
      copied = g.make(BLOCK, this.made_list(g, fresh), this.copy(g, g.child(callee, 1), renamed));
      this.arity.set(copied, n);
      this.copies.set(key, copied);
      const bound = new Set(this.bound.get(callee) ?? []);
      for (let i = 0; i < n; i++) if (constants.has(params[i] >> 3)) bound.add(i);
      this.bound.set(copied, bound);
      this.origin.set(copied, origin);
    }
    const made = g.make(CALL, dst, this.made_list(g, [copied, ...given.map((x, i) => i < n && constants.has(params[i] >> 3) ? NONE : x)]), next);
    if (caught !== undefined) this.catches.set(made, caught);
    return made;
  }
}

// A block's cells are those its instructions name: inlined bodies bring theirs.
export function cells(g: Graph, block: number, catches: Catches) {
  const listed = new Set<number>(), order: number[] = [];
  for (let l = g.child(block, 0); l !== 0; l = g.child(l, 1)) { listed.add(g.child(l, 0) >> 3); order.push(g.child(l, 0)); }
  const seen = new Set<number>(), todo = [g.child(block, 1)];
  const note = (e: number) => { if ((e & 7) === SLOT && !listed.has(e >> 3)) { listed.add(e >> 3); order.push(e); } };
  while (todo.length > 0) {
    const e = todo.pop()!;
    if (e === 0 || seen.has(e)) continue;
    seen.add(e);
    const t = g.tag(e), c = catches.get(e);
    if (c !== undefined) { note(c.cell); todo.push(c.handler); }
    if (t === JUMP) todo.push(g.child(e, 0));
    else if (t === IF) { note(g.child(e, 0)); todo.push(g.child(e, 1), g.child(e, 2)); }
    else if (t === RETURN) note(g.child(e, 0));
    else {
      note(g.child(e, 0));
      for (let l = g.child(e, 1); l !== 0 && g.tag(l) === ARGS; l = g.child(l, 1)) note(g.child(l, 0));
      todo.push(g.child(e, 2));
    }
  }
  g.heap[(block >> 3) * 4 + 1] = order.reduceRight((rest, x) => g.make(ARGS, x, rest), 0);
}

// Reduces the blocks; answers the copies the call rules made, by name (`name·k`), with every block's cells brought up to date.
export function reduce(g: Graph, blocks: Map<string, number>, natives: Record<string, Native>, catches: Catches = new Map(), arity?: Map<number, number>): Map<string, number> {
  const rewriter = reductions(natives, catches, arity) as Rewriter & { program?: Program };
  for (const block of blocks.values()) rewriter.normalize(g, block);
  for (const c of catches.values()) c.handler = rewriter.normalize(g, c.handler);
  const made = new Map<string, number>(), names = new Map<number, string>();
  for (const [name, b] of blocks) names.set(b, name);
  for (const [key, copy] of rewriter.program?.copies ?? []) {
    made.set(`${names.get(rewriter.program!.origin_of(copy)) ?? 'block'}·${made.size}`, copy);
  }
  for (const b of [...blocks.values(), ...made.values()]) cells(g, b, catches);
  return made;
}

// How many results beyond the first a call can leave behind, for each block in order: as many as any block answers
// (`return a, b, …`), since a call can hand on the results of the calls it makes.
export function results(g: Graph, blocks: Map<string, number>, natives: Record<string, Native>, catches: Catches = new Map()) {
  const put = NATIVE + Object.values(natives).indexOf(natives.result_put);
  return [...blocks.values()].map(b => {
    let most = 0;
    const seen = new Set<number>(), todo = [g.child(b, 1)];
    while (todo.length > 0) {
      const e = todo.pop()!;
      if (e === 0 || seen.has(e)) continue;
      seen.add(e);
      const t = g.tag(e), c = catches.get(e);
      if (c !== undefined) todo.push(c.handler);
      if (t === JUMP) todo.push(g.child(e, 0));
      else if (t === IF) todo.push(g.child(e, 1), g.child(e, 2));
      else if (t !== RETURN) {
        if (t === put) { const k = g.child(g.child(e, 1), 0); if ((k & 7) === INT) most = Math.max(most, k >> 3); }
        todo.push(g.child(e, 2));
      }
    }
    return most;
  }).map((_, i, all) => Math.max(...all));
}

// ---------------------------------------------------------------- reductions at run time
// A call reduced to its value is kept as a rule: the call, what it read, and its value. The rule is a node of the rule graph:
//   [argc, (slot, key) per argument, guards: (slot, field, kind, expected)…, checked reads: (node, field, kind, expected)…,
//    watched reads: (node, field)…, value, its slot, results: (value, slot)…]
// An argument that is a value (not a record) is matched by what it reads rather than by itself: the rule holds for any argument
// whose reads are the same, and for what the call reached from it that was made after it. Every other read is watched: writing
// it retracts the rules that read it; a word written over and over is read again when the rule is tried instead.
// A call that writes what it does not restore, or answers something it made, is not kept; neither are calls of a function
// whose calls are cheap or rarely the same.
const ABS = 0, SAME = 1, NEW = 2, TAG = 3;
const RECORD_TAG = 63, WRITES = 64, READS = 4096, VARIANTS = 8;

class Learning {
  vals: number[] = []; roots: number[] = []; rel = new Map<number, number>();
  seen = new Set<number>(); absolute = new Set<number>(); written = new Map<number, number>();
  guards: number[] = []; vol: number[] = []; deps: number[] = [];
  pattern: number[] = []; aborted = false;
  constructor(public fn: number, public args: number[], public hash: number, public top: number) {}
}

type Stats = { lookups: number; hits: number; learned: number; kept: number; reads: number };

export class Reducer {
  rules: Graph;
  on = false;
  learning: Learning[] = [];
  index: Map<number, number[]>[] = [];
  state: Uint8Array;
  stats: Stats[] = [];
  results: number[];
  private watchers = new Map<number, number[]>();
  private retracted = new Set<number>();
  private touched = new Map<number, number>();
  private volatile = new Set<number>();
  private vals: number[] = [];
  private roots: number[] = [];
  args: number[] = [];

  constructor(public g: Graph, public R: Int32Array, results: number[]) {
    this.results = results;
    this.rules = new Graph(new Uint8Array(256), 1 << 12);
    this.state = new Uint8Array(results.length);
    for (let i = 0; i < results.length; i++) { this.index.push(new Map()); this.stats.push({ lookups: 0, hits: 0, learned: 0, kept: 0, reads: 0 }); }
    if (process.env.KLEARN === 'off') this.state.fill(1);
  }

  private relative(a: number) { return (a & 7) === 0 && a !== 0 && this.g.heap[(a >> 3) * 4] !== RECORD_TAG; }

  private hash(fn: number, A: number[], n: number) {
    let h = fn + 1;
    for (let i = 0; i < n; i++) h = Math.imul(h ^ (this.relative(A[i]) ? 0x5bd1e995 : A[i]), 0x9e3779b1) >>> 0;
    return h;
  }

  // The value of a call by a rule, or undefined.
  reduce(fn: number, n: number): number | undefined {
    if (process.env.KLEARN_NOUSE) return undefined;
    if (process.env.KLEARN_ONLY && !process.env.KLEARN_ONLY.split(',').includes(this.names[fn])) return undefined;
    const A = this.args, st = this.stats[fn];
    st.lookups++;
    const list = this.index[fn].get(this.hash(fn, A, n));
    if (list === undefined) return undefined;
    for (let i = 0; i < list.length; i++) {
      const rule = list[i];
      if (this.retracted.has(rule)) { list.splice(i--, 1); this.retracted.delete(rule); continue; }
      if (!this.holds(rule, A, n)) continue;
      st.hits++;
      return this.apply(rule);
    }
    return undefined;
  }

  private holds(rule: number, A: number[], n: number) {
    const H = this.g.heap, r = this.rules.heap, vals = this.vals, roots = this.roots;
    let at = (rule >> 3) * 4 + 1;
    if (r[at++] !== n) return false;
    vals.length = 0; roots.length = 0;
    for (let i = 0; i < n; i++) {
      const s = r[at++], key = r[at++], a = A[i];
      if (s < 0) { if (a !== key) return false; continue; }
      if (s === vals.length) { if (!this.relative(a) || vals.includes(a)) return false; vals.push(a); roots.push(a >> 3); }
      else if (vals[s] !== a) return false;
    }
    const guards = r[at++];
    for (let i = 0; i < guards; i++, at += 4) {
      const s = r[at], base = vals[s], kind = r[at + 2], x = r[at + 3];
      if (kind === TAG) { if (H[(base >> 3) * 4] !== x) return false; continue; }
      const v = H[(base >> 3) * 4 + 1 + r[at + 1]];
      if (kind === ABS) { if (v !== x) return false; }
      else if (kind === SAME) { if (v !== vals[x]) return false; }
      else { if ((v & 7) !== 0 || v === 0 || (v >> 3) < roots[s] || vals.includes(v)) return false; vals.push(v); roots.push(roots[s]); }
    }
    const vol = r[at++];
    for (let i = 0; i < vol; i++, at += 4) if (H[(r[at] >> 3) * 4 + 1 + r[at + 1]] !== (r[at + 2] === SAME ? vals[r[at + 3]] : r[at + 3])) return false;
    return true;
  }

  // A rule used inside a learning call: the call read what the rule read.
  private apply(rule: number) {
    const H = this.g.heap, r = this.rules.heap, vals = this.vals;
    let at = (rule >> 3) * 4 + 1;
    const n = r[at++];
    at += n * 2;
    const guards = r[at++], learning = this.learning.length > 0;
    for (let i = 0; i < guards; i++, at += 4) {
      if (!learning) continue;
      const base = vals[r[at]];
      if (r[at + 2] === TAG) this.saw_tag(base, H[(base >> 3) * 4]);
      else this.saw(base, r[at + 1], H[(base >> 3) * 4 + 1 + r[at + 1]]);
    }
    const vol = r[at++];
    for (let i = 0; i < vol; i++, at += 4) if (learning) this.saw(r[at], r[at + 1], H[(r[at] >> 3) * 4 + 1 + r[at + 1]]);
    const deps = r[at++];
    for (let i = 0; i < deps; i++, at += 2) if (learning) this.saw(r[at], r[at + 1], H[(r[at] >> 3) * 4 + 1 + r[at + 1]]);
    const value = r[at++], slot = r[at++], results = r[at++];
    for (let i = 0; i < results; i++, at += 2) this.R[i + 1] = r[at + 1] >= 0 ? vals[r[at + 1]] : r[at];
    return slot >= 0 ? vals[slot] : value;
  }

  learn(fn: number, n: number): Learning {
    const A = this.args.slice(0, n), l = new Learning(fn, A, this.hash(fn, A, n), this.g.top);
    for (const a of A) {
      if (!this.relative(a)) { l.pattern.push(-1); continue; }
      let s = l.rel.get(a);
      if (s === undefined) { s = l.vals.length; l.vals.push(a); l.roots.push(a >> 3); l.rel.set(a, s); }
      l.pattern.push(s);
    }
    this.learning.push(l);
    this.on = true;
    this.stats[fn].learned++;
    return l;
  }

  failed(l: Learning) { this.drop(l); }

  learned(l: Learning, v: number): number {
    this.drop(l);
    const fn = l.fn;
    if (l.aborted) return this.decide(fn), v;
    const H = this.g.heap;
    for (const [w, old] of l.written) if (H[w] !== old) return this.decide(fn), v;
    const slot = this.slot(l, v);
    if (slot === undefined) return this.decide(fn), v;
    const results: number[] = [];
    for (let i = 1; i <= this.results[fn]; i++) {
      const s = this.slot(l, this.R[i]);
      if (s === undefined) return this.decide(fn), v;
      results.push(this.R[i], s);
    }
    const words = [l.args.length];
    l.args.forEach((a, i) => words.push(l.pattern[i], l.pattern[i] < 0 ? a : 0));
    words.push(l.guards.length / 4, ...l.guards, l.vol.length / 4, ...l.vol, l.deps.length / 2, ...l.deps, v, slot, results.length / 2, ...results);
    const rule = this.rules.wide(RECORD_TAG, words.length);
    this.rules.heap.set(words, (rule >> 3) * 4 + 1);
    let list = this.index[fn].get(l.hash);
    if (list === undefined) this.index[fn].set(l.hash, list = []);
    list.push(rule);
    if (list.length > VARIANTS) this.retracted.add(list.shift()!);
    const D = l.deps, W = this.g.watched;
    for (let i = 0; i < D.length; i += 2) {
      const w = (D[i] >> 3) * 4 + 1 + D[i + 1];
      let ws = this.watchers.get(w);
      if (ws === undefined) this.watchers.set(w, ws = []);
      ws.push(rule);
      W[w] = 1;
    }
    const st = this.stats[fn];
    st.kept++; st.reads += l.guards.length / 4 + l.vol.length / 4 + l.deps.length / 2;
    this.decide(fn);
    return v;
  }

  private slot(l: Learning, v: number): number | undefined {
    if ((v & 7) !== 0 || v === 0) return -1;
    if ((v >> 3) >= l.top) return undefined;
    return l.rel.get(v) ?? -1;
  }

  private decide(fn: number) {
    const st = this.stats[fn];
    if (st.kept >= 2 && st.reads / st.kept < 32) this.state[fn] = 1;
    if (st.learned < 16) return;
    if (st.kept === 0 || (st.lookups > 512 && st.hits * 8 < st.lookups)) this.state[fn] = 1;
  }

  private drop(l: Learning) {
    const i = this.learning.lastIndexOf(l);
    if (i >= 0) this.learning.splice(i, 1);
    this.on = this.learning.length > 0;
  }

  private abort(l: Learning) { l.aborted = true; this.drop(l); }

  rd(p: number, k: number): number {
    const v = this.g.heap[(p >> 3) * 4 + 1 + k];
    this.saw(p, k, v);
    return v;
  }

  tg(e: number): number {
    if ((e & 7) !== 0 || e === 0) return -7;
    const t = this.g.heap[(e >> 3) * 4];
    this.saw_tag(e, t);
    return t === RECORD_TAG ? -7 : (t << 3) | 1;
  }

  private saw(p: number, k: number, v: number) {
    const w = (p >> 3) * 4 + 1 + k, L = this.learning;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if ((p >> 3) >= l.top || l.written.has(w)) continue;
      const s = l.rel.get(p), key = s !== undefined ? -(s * 4294967296 + k) - 1 : w;
      if (l.seen.has(key)) continue;
      l.seen.add(key);
      if (l.seen.size > READS) { this.abort(l); i--; continue; }
      if (s !== undefined) { this.guard(l, s, k, v); continue; }
      const pointer = (v & 7) === 0 && v !== 0, same = pointer ? l.rel.get(v) : undefined;
      if (same !== undefined) { l.vol.push(p, k, SAME, same); continue; }
      if (pointer) l.absolute.add(v);
      if (this.volatile.has(w)) { l.vol.push(p, k, ABS, v); continue; }
      l.deps.push(p, k);
    }
  }

  private saw_tag(e: number, t: number) {
    const L = this.learning;
    for (const l of L) {
      if ((e >> 3) >= l.top) continue;
      const s = l.rel.get(e);
      if (s === undefined) continue;
      const w = -(s * 4294967296 + 4294967295) - 1;
      if (l.seen.has(w)) continue;
      l.seen.add(w);
      l.guards.push(s, 0, TAG, t);
    }
  }

  private guard(l: Learning, s: number, k: number, v: number) {
    if ((v & 7) === 0 && v !== 0) {
      const t = l.rel.get(v);
      if (t !== undefined) { l.guards.push(s, k, SAME, t); return; }
      const id = v >> 3;
      if (id >= l.roots[s] && id < l.top && !l.absolute.has(v)) {
        const n = l.vals.length;
        l.vals.push(v); l.roots.push(l.roots[s]); l.rel.set(v, n);
        l.guards.push(s, k, NEW, n);
        return;
      }
    }
    l.guards.push(s, k, ABS, v);
  }

  st(p: number, k: number, v: number): number {
    const H = this.g.heap, w = (p >> 3) * 4 + 1 + k;
    if (this.on) {
      const L = this.learning;
      for (let i = 0; i < L.length; i++) {
        const l = L[i];
        if ((p >> 3) >= l.top || l.written.has(w)) continue;
        l.written.set(w, H[w]);
        if (l.written.size > WRITES) { this.abort(l); i--; }
      }
    }
    H[w] = v;
    if (this.g.watched[w] !== 0) this.touch(w);
    return 0;
  }

  // A watched word was written: the rules that read it are retracted.
  private touch(w: number) {
    this.g.watched[w] = 0;
    const ws = this.watchers.get(w);
    this.watchers.delete(w);
    if (ws !== undefined) for (const rule of ws) this.retracted.add(rule);
    const n = (this.touched.get(w) ?? 0) + 1;
    this.touched.set(w, n);
    if (n >= 3) this.volatile.add(w);
  }

  check = process.env.KLEARN_CHECK !== undefined;
  names: string[] = [];
  mismatch(fn: number, args: number[], kept: number, ran: number, keptR: number[], ranR: number[]) {
    const fs = process.getBuiltinModule('fs') as typeof import('fs');
    fs.writeSync(2, `mismatch ${this.names[fn]}(${args.join(', ')}): kept ${kept} ran ${ran} R ${keptR} / ${ranR}\n`);
    this.check = false;
    this.last = { fn, args };
  }
  last?: { fn: number; args: number[] };

  report(names: string[]) {
    return this.stats.map((s, i) => ({ name: names[i], ...s, off: this.state[i] })).filter(s => s.lookups > 0).sort((a, b) => b.lookups - a.lookups);
  }
}
