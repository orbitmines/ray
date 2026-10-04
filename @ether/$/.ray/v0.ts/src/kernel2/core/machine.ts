// The machine: cursors (pc, state) walking program images. Portable: only the Int32Array and Atomics.
//
//   state:       BASE REGION ACT GROUP SOURCES PROCESS | cells[N]
//   activation:  PENDING PARENT SITE LOG | (exit, value) × MAX_LOG      one run of a region, shared by its states
//   group:       REMAINING ARRIVED NEXT OUTER | state × MAX_GROUP       the branches of one fork, until they join
//   sources:     n | state × n                                         what a merged state was merged from
//   superposed:  n | value × n                                         a REF word points here
//
// A fork gives each branch its own state. Branches meet at a join: the last to arrive goes on with a merged state,
// whose cells are UNRESOLVED until read: one value if every branch had it, their superposition if not.
// ENTER makes an activation and a state for the callee; each entry it enters is a cursor. The activation collapses when its
// last cursor leaves: what reached each exit (superposed) goes to the caller, which goes on at every exit taken.

import { int, kind, address, ref, REF, NOTHING, UNRESOLVED, truthy } from './word.ts';
import { TABLE, ENTRIES, N, size, JUMP, IF, FORK, JOIN, ENTER, EXIT, SET, ADD, SUB, MUL, LT, EQ, SUPERPOSE, SYS, EACH } from './program.ts';
import { type Layout, alloc, WAKE, SERVE, HEAD, TAIL, REQUEST, CODE, PROCESS as P, PC, STATE, DST, ARGC, ARGS, MAX_ARGS, RESULT, FINISHED, EACH_CALL } from './memory.ts';
import { add } from './queue.ts';

export const BASE = 0, REGION = 1, ACT = 2, GROUP = 3, SOURCES = 4, PROCESS = 5, SH = 6;
export const PENDING = 0, PARENT = 1, SITE = 2, LOG = 3, AH = 4, MAX_LOG = 256;
export const REMAINING = 0, ARRIVED = 1, NEXT = 2, OUTER = 3, GH = 4, MAX_GROUP = 64;

export const GONE = 0, YIELDED = 1, PARKED = 2;

export class Machine {
  pc = 0;
  state = 0;

  // `queue` is where this machine's new cursors go, `ring` where it asks the environment for things.
  constructor(public m: Int32Array, public layout: Layout, public queue: number, public ring: number) {}

  // ---------------------------------------------------------------- cursors
  // A new cursor goes on this machine's queue; idle workers are woken to steal it.
  spawn(pc: number, state: number) {
    add(this.m, this.queue, this.layout.queue, pc, state);
    Atomics.add(this.m, WAKE, 1);
    Atomics.notify(this.m, WAKE, 1);
  }

  // ---------------------------------------------------------------- cells
  get(state: number, o: number): number {
    const m = this.m;
    if (o < 0) return m[m[state + BASE] - o - 1];
    const at = state + SH + o;
    if (m[at] === UNRESOLVED) m[at] = this.resolve(state, o);
    return m[at];
  }

  set(state: number, o: number, v: number) { if (o >= 0) this.m[state + SH + o] = v; }

  // A merged cell, first read: what each branch had there.
  resolve(state: number, k: number): number {
    const m = this.m, sources = m[state + SOURCES], values: number[] = [];
    for (let i = 0; i < m[sources]; i++) {
      const v = this.get(m[sources + 1 + i], k);
      if (v !== NOTHING) values.push(v);
    }
    return this.superpose(m[state + PROCESS], values);
  }

  components(v: number): number[] {
    if (kind(v) !== REF) return [v];
    const at = address(v), n = this.m[at];
    return Array.from(this.m.subarray(at + 1, at + 1 + n));
  }

  // One value when they agree, NOTHING when there are none, else a superposition of their components.
  superpose(process: number, values: number[]): number {
    const all: number[] = [];
    for (const v of values) for (const c of this.components(v)) if (!all.includes(c)) all.push(c);
    if (all.length === 0) return NOTHING;
    if (all.length === 1) return all[0];
    const at = alloc(this.m, process, 1 + all.length);
    this.m[at] = all.length;
    this.m.set(all, at + 1);
    return ref(at);
  }

  // ---------------------------------------------------------------- states and activations
  region_of(base: number, index: number) { return base + this.m[base + TABLE + index]; }

  make_state(process: number, base: number, region: number, act: number): number {
    const m = this.m, n = m[region + N], s = alloc(m, process, SH + n);
    m[s + BASE] = base; m[s + REGION] = region; m[s + ACT] = act; m[s + GROUP] = 0; m[s + SOURCES] = 0; m[s + PROCESS] = process;
    m.fill(NOTHING, s + SH, s + SH + n);
    return s;
  }

  copy(state: number): number {
    const m = this.m, n = m[m[state + REGION] + N];
    const s = this.make_state(m[state + PROCESS], m[state + BASE], m[state + REGION], m[state + ACT]);
    m[s + GROUP] = m[state + GROUP];
    for (let k = 0; k < n; k++) m[s + SH + k] = this.get(state, k);
    return s;
  }

  activation(process: number, parent: number, site: number): number {
    const a = alloc(this.m, process, AH + 2 * MAX_LOG);
    this.m[a + PENDING] = 0; this.m[a + PARENT] = parent; this.m[a + SITE] = site; this.m[a + LOG] = 0;
    return a;
  }

  // ---------------------------------------------------------------- forks and joins
  // Branches from `state`: the first keeps it (this cursor goes on there), the others get copies and are spawned.
  fork(state: number, targets: number[], next: number): number {
    const m = this.m, g = alloc(m, m[state + PROCESS], GH + MAX_GROUP);
    m[g + REMAINING] = targets.length; m[g + ARRIVED] = 0; m[g + NEXT] = next; m[g + OUTER] = m[state + GROUP];
    Atomics.add(m, m[state + ACT] + PENDING, targets.length - 1);
    for (let i = targets.length - 1; i >= 1; i--) { const s = this.copy(state); m[s + GROUP] = g; this.spawn(targets[i], s); }
    m[state + GROUP] = g;
    return targets[0];
  }

  // At a join: wait for the other branches. The last to arrive (or leave) goes on with the merged state.
  arrive(state: number): number {
    const m = this.m, g = m[state + GROUP];
    if (g === 0) return state;
    const i = Atomics.add(m, g + ARRIVED, 1);
    if (i >= MAX_GROUP) throw new Error('too many branches at one join');
    Atomics.store(m, g + GH + i, state);
    if (Atomics.sub(m, g + REMAINING, 1) !== 1) return 0;
    return this.merge(g);
  }

  // A branch that ends without reaching its join: one fewer to wait for, in its group and, if no branch of that group
  // arrived, in the group around it.
  leave(state: number) {
    const m = this.m;
    for (let g = m[state + GROUP]; g !== 0; g = m[g + OUTER]) {
      if (Atomics.sub(m, g + REMAINING, 1) !== 1) return;
      if (Atomics.load(m, g + ARRIVED) > 0) { const merged = this.merge(g); this.spawn(m[g + NEXT], merged); return; }
    }
  }

  merge(g: number): number {
    const m = this.m, n = Atomics.load(m, g + ARRIVED), first = m[g + GH];
    Atomics.sub(m, m[first + ACT] + PENDING, n - 1);
    if (n === 1) { m[first + GROUP] = m[g + OUTER]; return first; }
    const s = this.make_state(m[first + PROCESS], m[first + BASE], m[first + REGION], m[first + ACT]);
    const sources = alloc(m, m[first + PROCESS], 1 + n);
    m[sources] = n;
    for (let i = 0; i < n; i++) m[sources + 1 + i] = m[g + GH + i];
    m[s + SOURCES] = sources; m[s + GROUP] = m[g + OUTER];
    m.fill(UNRESOLVED, s + SH, s + SH + m[m[first + REGION] + N]);
    return s;
  }

  // ---------------------------------------------------------------- calls
  // The cursor at an ENTER becomes the callee's first entry; the other entries are spawned with copies of its state.
  enter(state: number, site: number): number {
    const m = this.m, base = m[state + BASE], process = m[state + PROCESS];
    const callee = this.region_of(base, m[site + 1]), ins = m[site + 2], argc = m[site + 3 + ins];
    const act = this.activation(process, state, site), s = this.make_state(process, base, callee, act);
    for (let k = 0; k < argc; k++) this.set(s, k, this.get(state, m[site + 4 + ins + k]));
    m[act + PENDING] = ins;
    for (let i = ins - 1; i >= 1; i--) this.spawn(base + m[callee + ENTRIES + m[site + 3 + i]], this.copy(s));
    this.state = s;
    return base + m[callee + ENTRIES + m[site + 3]];
  }

  exit(state: number, k: number, v: number) {
    const m = this.m, act = m[state + ACT], i = Atomics.add(m, act + LOG, 1);
    if (i >= MAX_LOG) throw new Error('too many exits from one activation');
    m[act + AH + 2 * i] = k; m[act + AH + 2 * i + 1] = v;
    this.end(state);
  }

  // A cursor that is gone: its groups wait for one fewer, its activation has one fewer; the last collapses it.
  end(state: number) {
    this.leave(state);
    const act = this.m[state + ACT];
    if (Atomics.sub(this.m, act + PENDING, 1) === 1) this.collapse(act);
  }

  collapse(act: number) {
    const m = this.m, parent = m[act + PARENT], site = m[act + SITE], n = m[act + LOG];
    const reached = new Map<number, number[]>();
    for (let i = 0; i < n; i++) { const k = m[act + AH + 2 * i]; (reached.get(k) ?? reached.set(k, []).get(k)!).push(m[act + AH + 2 * i + 1]); }
    if (parent === 0) { this.finished(act, [...reached.values()].flat()); return; }
    const base = m[parent + BASE], ins = m[site + 2], argc = m[site + 3 + ins], outs = m[site + 4 + ins + argc], table = site + 5 + ins + argc;
    const taken = [...reached.keys()].filter(k => k < outs).sort((a, b) => a - b);
    if (taken.length === 0) { this.end(parent); return; }
    Atomics.add(m, m[parent + ACT] + PENDING, taken.length - 1);
    if (m[parent + GROUP] !== 0) Atomics.add(m, m[parent + GROUP] + REMAINING, taken.length - 1);
    taken.forEach((k, i) => {
      const s = i === 0 ? parent : this.copy(parent);
      this.set(s, m[table + 2 * k + 1], this.superpose(m[parent + PROCESS], reached.get(k)!));
      this.spawn(base + m[table + 2 * k], s);
    });
  }

  // The root's activation collapsed (its PARENT is 0 and its SITE the process): the process is done; the environment is told.
  finished(act: number, values: number[]) {
    const m = this.m, process = m[act + SITE];
    m[process + RESULT] = this.superpose(process, values);
    this.request(FINISHED, process, 0, 0, -1, []);
  }

  // ---------------------------------------------------------------- the outside world
  request(code: number, process: number, pc: number, state: number, dst: number, args: number[]) {
    const m = this.m, ring = this.ring, tail = m[ring + TAIL];
    while (tail - Atomics.load(m, ring + HEAD) >= this.layout.ring) Atomics.wait(m, SERVE, Atomics.load(m, SERVE), 1);
    const at = ring + 2 + (tail % this.layout.ring) * REQUEST;
    m[at + CODE] = code; m[at + P] = process; m[at + PC] = pc; m[at + STATE] = state; m[at + DST] = dst; m[at + ARGC] = args.length;
    for (let i = 0; i < Math.min(args.length, MAX_ARGS); i++) m[at + ARGS + i] = args[i];
    Atomics.store(m, ring + TAIL, tail + 1);
    Atomics.add(m, SERVE, 1);
    Atomics.notify(m, SERVE);
  }

  // An operation on two values; on superpositions, on every pair of their components.
  binary(process: number, op: number, a: number, b: number): number {
    const f = (x: number, y: number) => op === ADD ? x + y : op === SUB ? x - y : op === MUL ? int((x >> 2) * (y >> 2)) : op === LT ? int(x < y ? 1 : 0) : int(x === y ? 1 : 0);
    if (kind(a) !== REF && kind(b) !== REF) return f(a, b);
    const out: number[] = [];
    for (const x of this.components(a)) for (const y of this.components(b)) out.push(f(x, y));
    return this.superpose(process, out);
  }

  // ---------------------------------------------------------------- running a cursor
  // Runs the cursor at (pc, state) for up to `budget` instructions. YIELDED leaves it in this.pc / this.state.
  run(pc: number, state: number, budget: number): number {
    const m = this.m;
    for (; budget > 0; budget--) {
      const base = m[state + BASE];
      switch (m[pc]) {
        case JUMP: pc = base + m[pc + 1]; continue;
        case IF: {
          const c = this.get(state, m[pc + 1]), ways = new Set(this.components(c).map(truthy));
          if (ways.size === 1) { pc = base + m[pc + (ways.has(true) ? 2 : 3)]; continue; }
          pc = this.fork(state, [base + m[pc + 2], base + m[pc + 3]], base + m[pc + 4]);
          continue;
        }
        case FORK: {
          const n = m[pc + 1], targets = Array.from({ length: n }, (_, i) => base + m[pc + 2 + i]);
          pc = this.fork(state, targets, base + m[pc + 2 + n]);
          continue;
        }
        case JOIN: {
          const merged = this.arrive(state);
          if (merged === 0) return GONE;
          state = merged; pc = base + m[pc + 1];
          continue;
        }
        case ENTER: pc = this.enter(state, pc); state = this.state; continue;
        case EXIT: this.exit(state, m[pc + 1], this.get(state, m[pc + 2])); return GONE;
        case SET: this.set(state, m[pc + 1], this.get(state, m[pc + 2])); pc += 3; continue;
        case ADD: case SUB: case MUL: case LT: case EQ:
          this.set(state, m[pc + 1], this.binary(m[state + PROCESS], m[pc], this.get(state, m[pc + 2]), this.get(state, m[pc + 3]))); pc += 4; continue;
        case SUPERPOSE: this.set(state, m[pc + 1], this.superpose(m[state + PROCESS], [this.get(state, m[pc + 2]), this.get(state, m[pc + 3])])); pc += 4; continue;
        case SYS: {
          const argc = m[pc + 3], args = Array.from({ length: argc }, (_, i) => this.get(state, m[pc + 4 + i]));
          this.request(m[pc + 2], m[state + PROCESS], pc + size(m, pc), state, m[pc + 1], args);
          return PARKED;
        }
        case EACH:
          this.request(EACH_CALL, m[state + PROCESS], pc + 4, state, m[pc + 1], [this.region_of(base, m[pc + 2]), this.get(state, m[pc + 3])]);
          return PARKED;
        default: throw new Error(`not an instruction: ${m[pc]} at ${pc}`);
      }
    }
    this.pc = pc; this.state = state;
    return YIELDED;
  }
}
