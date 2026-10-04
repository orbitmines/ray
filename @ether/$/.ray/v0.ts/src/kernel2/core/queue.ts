// A queue of cursors (pc, state) in memory, owned by one thread: the owner adds and takes at the bottom (newest first),
// any other thread steals from the top (oldest first). Chase–Lev, over Atomics.
//
// `take` and `steal` answer whether they got a cursor; it is left in `got[0]` (pc) and `got[1]` (state).

import { TOP, BOTTOM, SLOTS } from './memory.ts';

export function add(m: Int32Array, q: number, capacity: number, pc: number, state: number) {
  const b = m[q + BOTTOM], t = Atomics.load(m, q + TOP);
  if (b - t >= capacity) throw new Error('cursor queue full');
  const at = q + SLOTS + 2 * (b % capacity);
  m[at] = pc; m[at + 1] = state;
  Atomics.store(m, q + BOTTOM, b + 1);
}

export function take(m: Int32Array, q: number, capacity: number, got: Int32Array): boolean {
  const b = Atomics.sub(m, q + BOTTOM, 1) - 1;
  const t = Atomics.load(m, q + TOP);
  if (t > b) { Atomics.store(m, q + BOTTOM, t); return false; }
  const at = q + SLOTS + 2 * (b % capacity);
  got[0] = m[at]; got[1] = m[at + 1];
  if (t === b) {
    const won = Atomics.compareExchange(m, q + TOP, t, t + 1) === t;
    Atomics.store(m, q + BOTTOM, t + 1);
    return won;
  }
  return true;
}

export function steal(m: Int32Array, q: number, capacity: number, got: Int32Array): boolean {
  const t = Atomics.load(m, q + TOP), b = Atomics.load(m, q + BOTTOM);
  if (t >= b) return false;
  const at = q + SLOTS + 2 * (t % capacity);
  const pc = m[at], state = m[at + 1];
  if (Atomics.compareExchange(m, q + TOP, t, t + 1) !== t) return false;
  got[0] = pc; got[1] = state;
  return true;
}
