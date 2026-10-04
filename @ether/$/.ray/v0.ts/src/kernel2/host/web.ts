// The environment's host in a browser (or Deno): Web Workers over a SharedArrayBuffer, WebGPU for lanes.
// Shared memory needs a cross-origin isolated page (COOP/COEP headers, see web/serve.ts); without it, everything runs on
// the page's own thread.

import type { Host } from '../runtime/environment.ts';
import { Gpu } from '../gpu/webgpu.ts';

export async function web(options: { threads?: number; worker: URL | string }): Promise<Host> {
  const shared = (globalThis as any).crossOriginIsolated !== false && typeof SharedArrayBuffer !== 'undefined';
  const workers: Worker[] = [];
  return {
    threads: shared ? options.threads ?? Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1) : 0,
    memory: words => new Int32Array(shared ? new SharedArrayBuffer(4 * words) : new ArrayBuffer(4 * words)),
    start(memory, layout, id) {
      const w = new Worker(options.worker, { type: 'module' });
      w.onerror = e => console.error(`worker ${id}:`, e);
      w.postMessage({ buffer: memory.buffer, layout, id });
      workers.push(w);
    },
    idle: async (memory, index, value) => {
      const wait = (Atomics as any).waitAsync;
      const r = wait !== undefined && memory.buffer instanceof SharedArrayBuffer ? wait(memory, index, value, 100) : { async: true, value: undefined };
      if (!r.async) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([r.value, new Promise(resolve => timer = setTimeout(resolve, r.value === undefined ? 1 : 100))]);   // a timer keeps the event loop alive
      clearTimeout(timer);
    },
    stop() { for (const w of workers) w.terminate(); },
    gpu: await Gpu.create(),
  };
}
