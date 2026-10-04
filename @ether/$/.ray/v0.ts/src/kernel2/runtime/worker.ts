// A worker thread's entry, on Node (worker_threads) or the web (Web Workers): it is handed the memory and runs `work`.

import { work } from '../core/worker.ts';

type Init = { buffer: SharedArrayBuffer; layout: any; id: number };
const start = (init: Init) => work(new Int32Array(init.buffer), init.layout, init.id);

if (typeof (globalThis as any).WorkerGlobalScope !== 'undefined') (globalThis as any).onmessage = (e: MessageEvent<Init>) => start(e.data);
else { const { workerData } = await import('node:worker_threads'); start(workerData); }
