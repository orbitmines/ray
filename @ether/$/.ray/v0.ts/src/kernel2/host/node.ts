// The environment's host on Node: worker_threads over a SharedArrayBuffer. No WebGPU (lanes run on the CPU).

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { Host } from '../runtime/environment.ts';

// Run from TypeScript sources (through tsx), a worker first registers tsx, then imports the worker's own entry.
function entry(): URL {
  const file = new URL('../runtime/worker.ts', import.meta.url);
  const tsx = import.meta.resolve('tsx/esm/api');
  return new URL('data:text/javascript,' + encodeURIComponent(`import { register } from ${JSON.stringify(tsx)}; register(); await import(${JSON.stringify(file.href)});`));
}

export function node(options: { threads?: number } = {}): Host {
  const workers: Worker[] = [];
  return {
    threads: options.threads ?? Math.max(1, availableParallelism() - 1),
    memory: words => new Int32Array(new SharedArrayBuffer(4 * words)),
    start(memory, layout, id) {
      const w = new Worker(entry(), { workerData: { buffer: memory.buffer, layout, id } });
      w.on('error', e => { console.error(`worker ${id}:`, e); });
      w.unref();
      workers.push(w);
    },
    idle: async (memory, index, value) => {
      const r = Atomics.waitAsync(memory, index, value, 100);
      if (!r.async) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([r.value, new Promise(resolve => timer = setTimeout(resolve, 100))]);   // a pending waitAsync alone does not keep Node alive
      clearTimeout(timer);
    },
    stop() { for (const w of workers) w.terminate(); },
  };
}
