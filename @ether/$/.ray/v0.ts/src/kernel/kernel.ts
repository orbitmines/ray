export const NODE = 0, INT = 1, SLOT = 2, CONST = 3, VAR = 4;
export const edge = (payload: number, kind: number) => (payload << 3) | kind;
export const kind = (e: number) => e & 7;
export const payload = (e: number) => e >> 3;
export const node = (id: number) => id << 3;

const FREE = 0;

export class Graph {
  heap: Int32Array;
  // Per word: whether a rule learned at run time depends on it (reduce.ts).
  watched: Uint8Array;
  top = 1;
  free = 0;
  arity: Uint8Array;

  constructor(arity: Uint8Array, capacity = 1024) {
    this.arity = arity;
    this.heap = new Int32Array(capacity * 4);
    this.watched = new Uint8Array(capacity * 4);
  }

  private grow(words: number) {
    let size = this.heap.length * 2;
    while (size < words) size *= 2;
    const h = new Int32Array(size); h.set(this.heap); this.heap = h;
    const w = new Uint8Array(size); w.set(this.watched); this.watched = w;
  }

  make(tag: number, a = 0, b = 0, c = 0): number {
    let id = this.free;
    if (id !== 0) this.free = this.heap[id * 4 + 1];
    else {
      id = this.top++;
      if (id * 4 + 4 > this.heap.length) this.grow(id * 4 + 4);
    }
    const h = this.heap, p = id * 4;
    h[p] = tag; h[p + 1] = a; h[p + 2] = b; h[p + 3] = c;
    return node(id);
  }

  // A node of n children laid out over consecutive slots: child k is at the same place as in a node of three.
  wide(tag: number, n: number): number {
    const id = this.top, slots = (n + 4) >> 2;
    this.top += slots;
    if (this.top * 4 > this.heap.length) this.grow(this.top * 4);
    this.heap[id * 4] = tag;
    return node(id);
  }

  release(e: number) { const id = e >> 3; this.heap[id * 4] = FREE; this.heap[id * 4 + 1] = this.free; this.free = id; }

  tag(e: number) { return this.heap[(e >> 3) * 4]; }
  child(e: number, i: number) { return this.heap[(e >> 3) * 4 + 1 + i]; }

  collect(roots: number[]) {
    const h = this.heap, marked = new Uint8Array(this.top), todo = [...roots];
    while (todo.length > 0) {
      const e = todo.pop()!;
      if (kind(e) !== NODE || marked[e >> 3]) continue;
      marked[e >> 3] = 1;
      for (let i = 0; i < this.arity[this.tag(e)]; i++) todo.push(this.child(e, i));
    }
    for (let id = 1; id < this.top; id++) if (!marked[id] && h[id * 4] !== FREE) { h[id * 4] = FREE; h[id * 4 + 1] = this.free; this.free = id; }
  }
}

export type Rule = { lhs: number; rhs: number; fn?: undefined } | { lhs: number; rhs?: undefined; fn: (g: Graph, caps: number[], node: number) => number | undefined };

export class Rewriter {
  patterns: Graph;
  rules: Rule[][] = [];
  private caps: number[] = [];
  private bound: boolean[] = [];

  constructor(patterns: Graph, rules: Rule[]) {
    this.patterns = patterns;
    for (const rule of rules) (this.rules[patterns.tag(rule.lhs)] ??= []).push(rule);
  }

  // Innermost first: a node's children are made normal before the node itself, and every node is made normal once.
  normalize(g: Graph, root: number): number {
    let state = new Uint8Array(g.top * 2), result = new Int32Array(g.top * 2), waiting = new Int32Array(g.top * 2);
    const NEW = 0, ENTERED = 1, DONE = 2, WAITING = 3;
    const done = (e: number) => kind(e) !== NODE ? e : state[e >> 3] === DONE ? result[e >> 3] : e;
    const todo = [root];
    while (todo.length > 0) {
      const e = todo[todo.length - 1], id = e >> 3;
      if (kind(e) !== NODE || state[id] === DONE) { todo.pop(); continue; }
      if (state[id] === NEW) {
        state[id] = ENTERED;
        for (let i = 0; i < g.arity[g.tag(e)]; i++) { const c = g.child(e, i); if (kind(c) === NODE && state[c >> 3] === NEW) todo.push(c); }
        continue;
      }
      todo.pop();
      if (state[id] === WAITING) { state[id] = DONE; result[id] = done(waiting[id]); continue; }
      const p = id * 4;
      for (let i = 1; i <= g.arity[g.heap[p]]; i++) g.heap[p + i] = done(g.heap[p + i]);
      const rewritten = this.rewrite(g, e);
      if (rewritten === undefined || rewritten === e) { state[id] = DONE; result[id] = e; continue; }
      if (g.top > state.length) {
        const size = g.top * 2;
        const s2 = new Uint8Array(size); s2.set(state); state = s2;
        const r2 = new Int32Array(size); r2.set(result); result = r2;
        const w2 = new Int32Array(size); w2.set(waiting); waiting = w2;
      }
      waiting[id] = rewritten;
      state[id] = WAITING;
      todo.push(e, rewritten);
    }
    return done(root);
  }

  private rewrite(g: Graph, e: number): number | undefined {
    for (const rule of this.rules[g.tag(e)] ?? []) {
      this.bound.length = 0;
      if (!this.match(g, rule.lhs, e)) continue;
      if (rule.fn === undefined) return this.build(g, rule.rhs);
      const made = rule.fn(g, this.caps, e);
      if (made !== undefined) return made;
    }
    return undefined;
  }

  private match(g: Graph, p: number, e: number): boolean {
    const P = this.patterns;
    if (kind(p) === VAR) {
      const v = p >> 3;
      if (this.bound[v]) return same(g, this.caps[v], e);
      this.bound[v] = true; this.caps[v] = e;
      return true;
    }
    if (kind(p) !== NODE || p === 0) return p === e;
    if (kind(e) !== NODE || e === 0 || P.tag(p) !== g.tag(e)) return false;
    for (let i = 0; i < P.arity[P.tag(p)]; i++) if (!this.match(g, P.child(p, i), g.child(e, i))) return false;
    return true;
  }

  private build(g: Graph, p: number): number {
    const P = this.patterns;
    if (kind(p) === VAR) return this.caps[p >> 3];
    if (kind(p) !== NODE || p === 0) return p;
    const n = P.arity[P.tag(p)];
    return g.make(P.tag(p), n > 0 ? this.build(g, P.child(p, 0)) : 0, n > 1 ? this.build(g, P.child(p, 1)) : 0, n > 2 ? this.build(g, P.child(p, 2)) : 0);
  }
}

export function same(g: Graph, x: number, y: number): boolean {
  if (x === y) return true;
  if (kind(x) !== NODE || kind(y) !== NODE || g.tag(x) !== g.tag(y)) return false;
  for (let i = 0; i < g.arity[g.tag(x)]; i++) if (!same(g, g.child(x, i), g.child(y, i))) return false;
  return true;
}
