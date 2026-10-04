// The environment: what an operating system is to programs. It owns the memory, loads program images once, runs processes
// (each with its own arena), answers their system calls, hands lanes to the GPU, and keeps its workers busy.
// Platform specifics (threads, shared memory, waiting) come from a Host: host/node.ts, host/web.ts.

import { plan, type Layout, process_at, heap, HEAP, WAKE, SERVE, STOP, HEAD, TAIL, REQUEST, CODE, PROCESS as P, PC, STATE, DST, ARGC, ARGS,
  STATUS, LIVE, RESULT, ARENA, NEXT, END, FREE, RUNNING, CANCELLED, FINISHED, EACH_CALL } from '../core/memory.ts';
import { region_at, ENTRIES, E, PRINT } from '../core/program.ts';
import { Machine, SH, PENDING } from '../core/machine.ts';
import { add } from '../core/queue.ts';
import { pump } from '../core/worker.ts';
import { kind, integer, REF, SPECIAL, NOTHING } from '../core/word.ts';
import { eligible, lanes } from '../gpu/lanes.ts';
import type { Gpu } from '../gpu/webgpu.ts';

export type Host = {
  threads: number;                                            // 0: everything on the calling thread
  memory(words: number): Int32Array;                          // shared between threads when threads > 0
  start(memory: Int32Array, layout: Layout, id: number): void; // a worker running core/worker.ts `work`
  idle(memory: Int32Array, index: number, value: number): Promise<void>;  // until memory[index] changes (or a while)
  stop?(): void;
  gpu?: Gpu;
};

export type Program = { key: string; image: Int32Array; base: number; regions: Map<string, number> };
export type Io = { out(text: string): void };
export type Run = { id: number; done: Promise<number[]> };

export class Environment {
  m: Int32Array;
  layout: Layout;
  machine: Machine;
  programs = new Map<string, Program>();
  private running = new Map<number, { io: Io; resolve: (values: number[]) => void; arena: number }>();
  private arenas: number[] = [];
  private serving = false;

  constructor(public host: Host, options: { words?: number; arena?: number } = {}) {
    const words = options.words ?? 1 << 24;
    this.m = host.memory(words);
    this.layout = plan({ workers: Math.max(1, host.threads), words });
    this.m[HEAP] = this.layout.heap;
    this.arena = options.arena ?? 1 << 20;
    this.machine = new Machine(this.m, this.layout, this.layout.injection, this.layout.rings[0]);
    for (let id = 0; id < host.threads; id++) host.start(this.m, this.layout, id);
  }
  private arena: number;

  // ---------------------------------------------------------------- programs
  // An image is laid out once per key (e.g. a hash of its source) and shared by every process that runs it.
  load(key: string, built: { image: Int32Array; regions: Map<string, number> }): Program {
    const known = this.programs.get(key);
    if (known !== undefined) return known;
    const base = heap(this.m, built.image.length);
    this.m.set(built.image, base);
    const program = { key, image: built.image, base, regions: built.regions };
    this.programs.set(key, program);
    return program;
  }

  // ---------------------------------------------------------------- processes
  run(program: Program, region: string, args: number[], io: Io): Run {
    const m = this.m, slot = [...Array(this.layout.processes).keys()].find(i => m[process_at(this.layout, i) + STATUS] === FREE);
    if (slot === undefined) throw new Error('no free process');
    const process = process_at(this.layout, slot), arena = this.arenas.pop() ?? heap(m, this.arena);
    m[process + STATUS] = RUNNING; m[process + LIVE] = 0; m[process + RESULT] = NOTHING;
    m[process + ARENA] = arena; m[process + NEXT] = arena; m[process + END] = arena + this.arena;
    const index = program.regions.get(region);
    if (index === undefined) throw new Error(`no region ${region}`);
    const at = program.base + region_at(program.image, index);
    const act = this.machine.activation(process, 0, process), state = this.machine.make_state(process, program.base, at, act);
    args.forEach((v, k) => m[state + SH + k] = v);
    const entries = m[at + E];
    m[act + PENDING] = entries;
    const done = new Promise<number[]>(resolve => this.running.set(process, { io, resolve, arena }));
    for (let e = 0; e < entries; e++) this.ready(program.base + m[at + ENTRIES + e], e === 0 ? state : this.machine.copy(state));
    this.serve();
    return { id: process, done };
  }

  cancel(id: number) {
    const r = this.running.get(id);
    if (r === undefined) return;
    this.m[id + STATUS] = CANCELLED;
    this.finish(id, []);
  }

  private finish(process: number, values: number[]) {
    const r = this.running.get(process)!;
    this.running.delete(process);
    this.arenas.push(r.arena);
    this.m[process + STATUS] = FREE;
    r.resolve(values);
  }

  private ready(pc: number, state: number) {
    add(this.m, this.layout.injection, this.layout.queue, pc, state);
    Atomics.add(this.m, WAKE, 1);
    Atomics.notify(this.m, WAKE);
  }

  // ---------------------------------------------------------------- serving
  // With workers: wait for requests until no process is running. Without: run the cursors here, in between requests.
  private async serve() {
    if (this.serving) return;
    this.serving = true;
    while (this.running.size > 0) {
      if (this.host.threads === 0) { pump(this.machine, () => this.answer()); await Promise.resolve(); if (this.running.size > 0) await this.host.idle(this.m, SERVE, Atomics.load(this.m, SERVE)); continue; }
      const seen = Atomics.load(this.m, SERVE);
      this.answer();
      if (this.running.size > 0) await this.host.idle(this.m, SERVE, seen);
    }
    this.serving = false;
  }

  private answer() {
    const m = this.m;
    for (const ring of this.layout.rings) {
      for (let head = m[ring + HEAD]; head < Atomics.load(m, ring + TAIL); head++) {
        const at = ring + 2 + (head % this.layout.ring) * REQUEST, code = m[at + CODE], process = m[at + P];
        const args = Array.from(m.subarray(at + ARGS, at + ARGS + m[at + ARGC]));
        const pc = m[at + PC], state = m[at + STATE], dst = m[at + DST];
        Atomics.store(m, ring + HEAD, head + 1);
        if (code === FINISHED) { if (this.running.has(process)) this.finish(process, this.machine.components(m[process + RESULT])); continue; }
        if (m[process + STATUS] !== RUNNING) continue;
        if (code === PRINT) { this.running.get(process)?.io.out(this.show(args[0]) + '\n'); this.resume(pc, state, dst, args[0]); continue; }
        if (code === EACH_CALL) { this.each(process, pc, state, dst, args[0], args[1]); continue; }
        throw new Error(`unknown system call ${code}`);
      }
    }
  }

  private resume(pc: number, state: number, dst: number, value: number) {
    if (dst >= 0) this.m[state + SH + dst] = value;
    this.ready(pc, state);
  }

  // A region on every component of a value: on the GPU when there is one and the region can run there, else as CPU lanes.
  private async each(process: number, pc: number, state: number, dst: number, region: number, value: number) {
    const program = [...this.programs.values()].find(p => region >= p.base && region < p.base + p.image.length)!;
    const inputs = Int32Array.from(this.machine.components(value)), at = region - program.base;
    if (!eligible(program.image, at)) throw new Error('each: the region does not run as lanes (calls, forks or system calls)');
    const out = this.host.gpu !== undefined && inputs.length >= 64 ? await this.host.gpu.lanes(program.image, at, inputs) : lanes(program.image, at, inputs);
    const values: number[] = [];
    for (let lane = 0; lane < inputs.length; lane++) if (out[2 * lane] >= 0) values.push(out[2 * lane + 1]);
    this.resume(pc, state, dst, this.machine.superpose(process, values));
    this.serve();
  }

  // ---------------------------------------------------------------- showing values
  show(v: number): string {
    if (kind(v) === REF) return this.machine.components(v).map(c => this.show(c)).join(' | ');
    if (kind(v) === SPECIAL) return v === NOTHING ? 'nothing' : 'unresolved';
    return String(integer(v));
  }

  stop() { Atomics.store(this.m, STOP, 1); Atomics.notify(this.m, WAKE); this.host.stop?.(); }
}
