// The one memory everything lives in: an Int32Array, shared by every thread.
//
//   control | injection queue | queue per worker | system-call ring per worker | processes | heap →
//
//   control:   WAKE (bumped when there is work)  SERVE (bumped when the environment has requests)  HEAP (next free heap word)  STOP
//   queue:     TOP BOTTOM | (pc, state) × capacity           the injection queue's owner is the environment
//   ring:      HEAD TAIL | request × capacity               written by its worker, read by the environment
//   request:   CODE PROCESS PC STATE DST ARGC | arg × ARGS
//   process:   STATUS LIVE RESULT ARENA NEXT END            LIVE counts its cursors; RESULT is what its root answered
//
// The heap holds program images and process arenas; a process allocates its states and superpositions in its arena.

export const WAKE = 0, SERVE = 1, HEAP = 2, STOP = 3, CONTROL = 8;
export const TOP = 0, BOTTOM = 1, SLOTS = 2;
export const HEAD = 0, TAIL = 1;
export const CODE = 0, PROCESS = 1, PC = 2, STATE = 3, DST = 4, ARGC = 5, ARGS = 6, MAX_ARGS = 4, REQUEST = ARGS + MAX_ARGS;
export const STATUS = 0, LIVE = 1, RESULT = 2, ARENA = 3, NEXT = 4, END = 5, PROCESS_SIZE = 8;
export const FREE = 0, RUNNING = 1, CANCELLED = 2, DONE = 3;

// System calls the environment answers that are not the program's own: a process is done, an EACH to run.
export const FINISHED = -1, EACH_CALL = -2;

export type Config = { workers: number; words: number; queue?: number; ring?: number; processes?: number };

export type Layout = {
  words: number; workers: number; queue: number; ring: number; processes: number;
  injection: number; queues: number[]; rings: number[]; table: number; heap: number;
};

export function plan(config: Config): Layout {
  const queue = config.queue ?? 1 << 14, ring = config.ring ?? 1 << 10, processes = config.processes ?? 64;
  let at = CONTROL;
  const injection = at; at += SLOTS + 2 * queue;
  const queues: number[] = [];
  for (let w = 0; w < config.workers; w++) { queues.push(at); at += SLOTS + 2 * queue; }
  const rings: number[] = [];
  for (let w = 0; w < config.workers; w++) { rings.push(at); at += 2 + ring * REQUEST; }
  const table = at; at += processes * PROCESS_SIZE;
  if (at >= config.words) throw new Error('memory too small for its layout');
  return { words: config.words, workers: config.workers, queue, ring, processes, injection, queues, rings, table, heap: at };
}

export const process_at = (layout: Layout, id: number) => layout.table + id * PROCESS_SIZE;

// An arena's words, for any thread: one atomic add.
export function alloc(m: Int32Array, process: number, words: number): number {
  const at = Atomics.add(m, process + NEXT, words);
  if (at + words > m[process + END]) throw new Error(`process arena full (${m[process + END] - m[process + ARENA]} words)`);
  return at;
}

// Heap words, for the environment only (images and arenas).
export function heap(m: Int32Array, words: number): number {
  const at = m[HEAP];
  if (at + words > m.length) throw new Error('memory full');
  m[HEAP] = at + words;
  return at;
}
