// What a worker does, on any platform: take cursors (its own first, then steal), run each for a quantum, put back what
// yielded, sleep when there is nothing to do. `pump` is the same on one thread, for when there are no workers.

import { type Layout, WAKE, STOP, STATUS, CANCELLED } from './memory.ts';
import { take, steal, add } from './queue.ts';
import { Machine, PROCESS, YIELDED } from './machine.ts';

export const QUANTUM = 10_000;

export function work(m: Int32Array, layout: Layout, id: number) {
  const machine = new Machine(m, layout, layout.queues[id], layout.rings[id]), got = new Int32Array(2);
  const others = layout.queues.filter((_, w) => w !== id);
  for (;;) {
    if (Atomics.load(m, STOP) !== 0) return;
    const awake = Atomics.load(m, WAKE);
    const found = take(m, layout.queues[id], layout.queue, got) || steal(m, layout.injection, layout.queue, got) || others.some(q => steal(m, q, layout.queue, got));
    if (!found) { Atomics.wait(m, WAKE, awake, 50); continue; }
    cursor(machine, got[0], got[1], layout.queues[id]);
  }
}

// Every cursor queued on one thread, until none is left (the environment serves what they asked for in between).
export function pump(machine: Machine, serve: () => void) {
  const { m, layout } = machine, got = new Int32Array(2);
  for (;;) {
    while (take(m, machine.queue, layout.queue, got)) { cursor(machine, got[0], got[1], machine.queue); serve(); }
    serve();
    if (!take(m, machine.queue, layout.queue, got)) return;
    cursor(machine, got[0], got[1], machine.queue);
  }
}

function cursor(machine: Machine, pc: number, state: number, queue: number) {
  const m = machine.m;
  if (m[m[state + PROCESS] + STATUS] === CANCELLED) return;
  if (machine.run(pc, state, QUANTUM) === YIELDED) add(m, queue, machine.layout.queue, machine.pc, machine.state);
}
