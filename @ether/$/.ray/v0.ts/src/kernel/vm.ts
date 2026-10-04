import { Graph, INT, SLOT, CONST, edge } from './kernel.ts';

export const JUMP = 1, IF = 2, RETURN = 3, CALL = 4, ARGS = 5, BLOCK = 6, CELL = 7, OBJ = 8, PROP = 9, NATIVE = 64;

export const NONE = edge(0, CONST), GLOBAL = edge(1, CONST), ONE = INT;
export const int = (n: number) => edge(n, INT);

export type Native = (machine: Machine, ...args: number[]) => number;

export const basics: Record<string, Native> = {
  mov: (m: Machine, a: number) => a,
  add: (m: Machine, a: number, b: number) => a + b - ONE,
  sub: (m: Machine, a: number, b: number) => a - b + ONE,
  mul: (m: Machine, a: number, b: number) => (((a >> 3) * (b >> 3)) << 3) | ONE,
  div: (m: Machine, a: number, b: number) => (Math.trunc((a >> 3) / (b >> 3)) << 3) | ONE,
  mod: (m: Machine, a: number, b: number) => (((a >> 3) % (b >> 3)) << 3) | ONE,
  lt: (m: Machine, a: number, b: number) => a < b ? GLOBAL : NONE,
  le: (m: Machine, a: number, b: number) => a <= b ? GLOBAL : NONE,
  gt: (m: Machine, a: number, b: number) => a > b ? GLOBAL : NONE,
  ge: (m: Machine, a: number, b: number) => a >= b ? GLOBAL : NONE,
  eq: (m: Machine, a: number, b: number) => a === b ? GLOBAL : NONE,
  ne: (m: Machine, a: number, b: number) => a !== b ? GLOBAL : NONE,
  not: (m: Machine, a: number) => a === NONE ? GLOBAL : NONE,
  has: (m: Machine, a: number, bit: number) => ((a >> 3) & (bit >> 3)) !== 0 ? GLOBAL : NONE,
  max: (m: Machine, a: number, b: number) => a > b ? a : b,
  hash: (m: Machine, a: number) => (((Math.imul(a, 0x9e3779b1) >>> 7) & 0xffffff) << 3) | ONE,
};

// The graph the program's values are: nodes [tag, a, b, c]; a child that is no node is 0.
export const graph: Record<string, Native> = {
  node_make: (m: Machine, tag: number, a: number, b: number, c: number) => m.graph.make(tag >> 3, a, b, c),
  node_tag: (m: Machine, e: number) => (e & 7) === 0 && e !== 0 ? (m.graph.heap[(e >> 3) * 4] << 3) | ONE : -7,
  node_child: (m: Machine, e: number, i: number) => m.graph.heap[(e >> 3) * 4 + 1 + (i >> 3)],
  node_set: (m: Machine, e: number, i: number, v: number) => { m.graph.heap[(e >> 3) * 4 + 1 + (i >> 3)] = v; return NONE; },
  node_index: (m: Machine, e: number) => ((e >> 3) << 3) | ONE,
};

// What a program raises: a value, caught by `… catch e { … }` (anything else thrown passes through as it is).
export class Raised { constructor(public value: number) {} }
export const raising: Record<string, Native> = {
  raise: (m: Machine, v: number) => { throw new Raised(v); },
  caught: (m: Machine, e: number) => { const x = m.thrown[e >> 3]; return x instanceof Raised ? x.value : NONE; },
  rethrow: (m: Machine, e: number) => { const x = m.thrown[e >> 3]; m.thrown[e >> 3] = undefined; throw x; },
  forget: (m: Machine, e: number) => { m.thrown[e >> 3] = undefined; return NONE; },
};

// Memory the program lays its records out in: addresses are ints, words hold edges.
export const memory: Record<string, Native> = {
  result_put: (m: Machine, k: number, v: number) => { m.R[k >> 3] = v; return NONE; },
  result_get: (m: Machine, k: number) => m.R[k >> 3],
  alloc: (m: Machine, n: number) => (m.alloc(n >> 3) << 3) | ONE,
  load: (m: Machine, p: number, k: number) => m.H[(p >> 3) + (k >> 3)],
  store: (m: Machine, p: number, k: number, v: number) => { m.H[(p >> 3) + (k >> 3)] = v; return NONE; },
};

export const objects: Native[] = [
  (m: Machine) => m.object(),
  (m: Machine, o: number, k: number) => { const p = m.property(o, k); return p === 0 ? NONE : m.graph.heap[(p >> 3) * 4 + 2]; },
  (m: Machine, o: number, k: number, v: number) => { m.assign(o, k, v); return NONE; },
  (m: Machine, o: number, k: number) => m.property(o, k) === 0 ? NONE : GLOBAL,
];

export function arities(natives: Native[]): Uint8Array {
  const a = new Uint8Array(NATIVE + natives.length);
  a[JUMP] = 1; a[IF] = 3; a[RETURN] = 1; a[CALL] = 3; a[ARGS] = 2; a[BLOCK] = 2; a[CELL] = 1; a[OBJ] = 1; a[PROP] = 3;
  for (let i = 0; i < natives.length; i++) a[NATIVE + i] = 3;
  return a;
}

export const cell = (g: Graph) => (g.make(CELL, NONE) & ~7) | SLOT;

const OP_JUMP = 0, OP_IF = 1, OP_CALL = 2, OP_RETURN = 3, OP_NATIVE = 4;

export type Laid = { memory: Int32Array; pooled: Map<number, number>; entry: Map<number, number>; cellAt: Map<number, number>; at: Map<number, number>; handlers: Map<number, [number, number]> };
export type Catches = Map<number, { handler: number; cell: number }>;

export function layout(g: Graph, blocks: number[], into: Laid = { memory: new Int32Array(0), pooled: new Map(), entry: new Map(), cellAt: new Map(), at: new Map(), handlers: new Map() }, catches: Catches = new Map()): Laid {
  const h = g.heap, out: number[] = Array.from(into.memory), { entry, cellAt, at, pooled, handlers } = into;
  const fixups: [number, number, boolean][] = [], caught: [number, number, number][] = [], fresh: [number, number][] = [];
  const list = (l: number) => { const xs: number[] = []; for (; l !== 0 && h[(l >> 3) * 4] === ARGS; l = h[(l >> 3) * 4 + 2]) xs.push(h[(l >> 3) * 4 + 1]); return xs; };
  const operand = (e: number) => {
    if ((e & 7) === SLOT) { out.push(cellAt.get(e >> 3)!); return; }
    const k = pooled.get(e);
    if (k !== undefined) out.push(k); else { fresh.push([out.length, e]); out.push(0); }
  };
  const target = (e: number, block = false) => { fixups.push([out.length, e, block]); out.push(0); };
  const queue = [...blocks];
  while (queue.length > 0) {
    const b = queue.shift()!;
    if (entry.has(b)) continue;
    const start = out.length, cells = list(h[(b >> 3) * 4 + 1]);
    entry.set(b, start);
    out.push(cells.length, 0, 0, 0);
    for (const c of cells) { cellAt.set(c >> 3, out.length); out.push(NONE); }
    const todo = [h[(b >> 3) * 4 + 2]];
    while (todo.length > 0) {
      let pc = todo.pop()!;
      while (pc !== 0 && !at.has(pc)) {
        at.set(pc, out.length);
        const p = (pc >> 3) * 4, t = h[p], c = catches.get(pc);
        if (c !== undefined) { caught.push([out.length, c.handler, cellAt.get(c.cell >> 3)!]); todo.push(c.handler); }
        if (t === JUMP) { out.push(OP_JUMP); target(h[p + 1]); pc = h[p + 1]; }
        else if (t === IF) { out.push(OP_IF); operand(h[p + 1]); target(h[p + 2]); target(h[p + 3]); todo.push(h[p + 2]); pc = h[p + 3]; }
        else if (t === RETURN) { out.push(OP_RETURN); operand(h[p + 1]); out.push(start); pc = 0; }
        else if (t === CALL) {
          const [callee, ...args] = list(h[p + 2]);
          if (!entry.has(callee)) queue.push(callee);
          out.push(OP_CALL);
          if (h[p + 1] === 0) out.push(0); else operand(h[p + 1]);
          target(callee, true);
          out.push(args.length);
          for (const x of args) operand(x);
          target(h[p + 3]);
          pc = h[p + 3];
        }
        else {
          out.push(OP_NATIVE + t - NATIVE);
          if (h[p + 1] === 0) out.push(0); else operand(h[p + 1]);
          for (const x of list(h[p + 2])) operand(x);
          target(h[p + 3]);
          pc = h[p + 3];
        }
      }
      if (pc !== 0) { out.push(OP_JUMP); target(pc); }
    }
  }
  for (const [i, e] of fresh) { let k = pooled.get(e); if (k === undefined) { k = out.length; out.push(e); pooled.set(e, k); } out[i] = k; }
  for (const [i, e, block] of fixups) out[i] = e === 0 ? -1 : (block ? entry : at).get(e)!;
  for (const [pc, handler, cell] of caught) handlers.set(pc, [at.get(handler)!, cell]);
  return { memory: Int32Array.from(out), pooled, entry, cellAt, at, handlers };
}

type Run = (machine: Machine, start: number, args: ArrayLike<number>) => number;

function generate(natives: Native[]): Run {
  const enter = (start: string, value: string) => `{
    const e = ${start}, n = m[e];
    if (m[e + 3]++ !== 0) {
      if (sp + n + 2 > saved.length) saved = M.grow(sp + n + 2);
      for (let k = 0; k < n; k++) saved[sp++] = m[e + 4 + k]; saved[sp++] = m[e + 1]; saved[sp++] = m[e + 2];
    }
    for (let k = 0; k < n; k++) m[e + 4 + k] = ${value};
  }`;
  const cases = natives.map((fn, i) => {
    const n = fn.length - 1;
    if (fn === basics.mov) return `case ${OP_NATIVE + i}: r = m[m[pc + 2]]; pc += 3; break;`;
    return `case ${OP_NATIVE + i}: r = n${i}(M${Array.from({ length: n }, (_, k) => `, m[m[pc + ${2 + k}]]`).join('')}); pc += ${2 + n}; break;`;
  });
  return new Function('N', `
    ${natives.map((_, i) => `const n${i} = N[${i}];`).join(' ')}
    return function run(M, start, args) {
      const tmp = M.tmp, handlers = M.handlers;
      let m = M.memory;
      let saved = M.saved;
      let sp = M.sp;
      ${enter('start', `k < args.length ? args[k] : ${NONE}`)}
      m[start + 1] = -1; m[start + 2] = 0;
      let pc = start + 4 + m[start];
      for (;;) {
        try {
          for (;;) {
            const at = pc;
            let r = 0;
            switch (m[pc]) {
              case ${OP_JUMP}: pc = m[pc + 1]; continue;
              case ${OP_IF}: pc = m[m[pc + 1]] !== ${NONE} ? m[pc + 2] : m[pc + 3]; continue;
              case ${OP_CALL}: {
                const b = m[pc + 2], argc = m[pc + 3];
                for (let k = 0; k < argc; k++) tmp[k] = m[m[pc + 4 + k]];
                ${enter('b', `k < argc ? tmp[k] : ${NONE}`)}
                m[b + 1] = pc; m[b + 2] = m[pc + 1];
                pc = b + 4 + m[b];
                continue;
              }
              case ${OP_RETURN}: {
                const r = m[m[pc + 1]], b = m[pc + 2], call = m[b + 1], d = m[b + 2];
                if (--m[b + 3] !== 0) { m[b + 2] = saved[--sp]; m[b + 1] = saved[--sp]; for (let k = m[b] - 1; k >= 0; k--) m[b + 4 + k] = saved[--sp]; }
                if (call === -1) { M.sp = sp; return r; }
                if (d !== 0) m[d] = r;
                pc = m[call + 4 + m[call + 3]];
                continue;
              }
              default:
                M.sp = sp;
                switch (m[pc]) {
                  ${cases.join('\n                  ')}
                  default: throw new Error('not an instruction: ' + m[pc] + ' at ' + pc);
                }
                saved = M.saved; m = M.memory;
            }
            const d = m[at + 1];
            if (d !== 0) m[d] = r;
            pc = m[pc];
          }
        } catch (thrown) {
          m = M.memory; saved = M.saved;
          let at = pc;
          for (;;) {
            const h = handlers.get(at);
            if (h !== undefined) { m[h[1]] = M.box(thrown); pc = h[0]; break; }
            const b = M.block_of(at), call = m[b + 1];
            if (--m[b + 3] !== 0) { m[b + 2] = saved[--sp]; m[b + 1] = saved[--sp]; for (let k = m[b] - 1; k >= 0; k--) m[b + 4 + k] = saved[--sp]; }
            if (call === -1) { M.sp = sp; throw thrown; }
            at = call;
          }
        }
      }
    };`)(natives) as Run;
}

export class Machine {
  graph: Graph;
  memory: Int32Array;
  entry: Map<number, number>;
  private laid: Laid;
  handlers: Map<number, [number, number]>;
  catches: Catches = new Map();
  thrown: unknown[] = [];
  H = new Int32Array(1 << 16);
  R = new Int32Array(64);
  top = 8;
  alloc(n: number): number { const at = this.top; this.top += n; if (this.top > this.H.length) { let size = this.H.length * 2; while (size < this.top) size *= 2; const h = new Int32Array(size); h.set(this.H); this.H = h; } return at; }
  compiled?: Map<number, (M: Machine, ...args: number[]) => number>;
  arity?: Map<number, number>;
  private starts?: number[];
  saved = new Int32Array(256);
  tmp = new Int32Array(256);
  sp = 0;
  roots: number[] = [];
  made = 0;
  limit = 1 << 14;
  private runner: Run;

  constructor(graph: Graph, blocks: number[], natives: Native[], catches?: Catches) {
    this.graph = graph;
    if (catches !== undefined) this.catches = catches;
    this.laid = layout(graph, blocks, undefined, this.catches);
    this.memory = this.laid.memory; this.entry = this.laid.entry; this.handlers = this.laid.handlers;
    this.runner = generate(natives);
  }

  add(blocks: number[]) { this.laid = layout(this.graph, blocks, this.laid, this.catches); this.memory = this.laid.memory; this.starts = undefined; }

  block_of(pc: number): number {
    const starts = this.starts ??= [...this.entry.values()].sort((a, b) => a - b);
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pc) lo = mid; else hi = mid - 1; }
    return starts[lo];
  }

  box(thrown: unknown): number { this.thrown.push(thrown); return int(this.thrown.length - 1); }

  run(block: number, args: ArrayLike<number> = []): number {
    const f = this.compiled?.get(block);
    if (f !== undefined) { const n = this.arity!.get(block)!, a = Array.from({ length: n }, (_, i) => i < args.length ? args[i] : NONE); return f(this, ...a); }
    if (!this.entry.has(block)) this.add([block]);
    return this.runner(this, this.entry.get(block)!, args);
  }

  grow(need: number): Int32Array { let size = this.saved.length * 2; while (size < need) size *= 2; const s = new Int32Array(size); s.set(this.saved); return this.saved = s; }

  object(): number {
    if (++this.made > this.limit) this.collect();
    return this.graph.make(OBJ, 0);
  }

  property(o: number, k: number): number {
    const h = this.graph.heap;
    if ((o & 7) !== 0 || h[(o >> 3) * 4] !== OBJ) return 0;
    for (let p = h[(o >> 3) * 4 + 1]; p !== 0; p = h[(p >> 3) * 4 + 3]) if (h[(p >> 3) * 4 + 1] === k) return p;
    return 0;
  }

  assign(o: number, k: number, v: number) {
    const g = this.graph, at = (o >> 3) * 4 + 1;
    if ((o & 7) !== 0 || g.heap[at - 1] !== OBJ) return;
    let before = 0;
    for (let p = g.heap[at]; p !== 0; before = p, p = g.heap[(p >> 3) * 4 + 3]) {
      if (g.heap[(p >> 3) * 4 + 1] !== k) continue;
      if (v !== NONE) { g.heap[(p >> 3) * 4 + 2] = v; return; }
      const next = g.heap[(p >> 3) * 4 + 3];
      if (before === 0) g.heap[at] = next; else g.heap[(before >> 3) * 4 + 3] = next;
      g.release(p);
      return;
    }
    if (v !== NONE) { const p = g.make(PROP, k, v, g.heap[at]); g.heap[at] = p; }
  }

  collect() {
    const roots = [...this.roots];
    for (const start of this.entry.values()) for (let k = 0; k < this.memory[start]; k++) roots.push(this.memory[start + 4 + k]);
    for (let i = 0; i < this.sp; i++) roots.push(this.saved[i]);
    this.graph.collect(roots.filter(e => (e & 7) === 0 && (e >> 3) < this.graph.top));
    this.made = 0;
  }
}
