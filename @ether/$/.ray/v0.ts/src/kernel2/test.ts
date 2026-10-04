// Runs every example on one thread and on workers (Node), and checks what they answer.
// `node --import tsx src/kernel2/test.ts`  (or `deno run -A src/kernel2/test.ts web` for Web Workers and WebGPU)

import { assemble } from './core/assembly.ts';
import { Environment, type Host } from './runtime/environment.ts';
import { integer } from './core/word.ts';

const expected: Record<string, number[]> = {
  superpose: [1, 2],
  entries: [20, 30],
  exits: [-1, 1],
  loop: [5050],
  each: Array.from({ length: 100 }, (_, i) => i * i),
};

const read = async (path: string) => {
  const url = new URL(path, import.meta.url);
  if (typeof (globalThis as any).Deno !== 'undefined') return (globalThis as any).Deno.readTextFile(url);
  const fs = await import('node:fs');
  return fs.readFileSync(url, 'utf8');
};

async function check(name: string, host: Host) {
  const env = new Environment(host, { words: 1 << 22 });
  const program = env.load(name, assemble(await read(`./examples/${name}.k2`)));
  let out = '';
  const t = performance.now();
  const values = (await env.run(program, 'main', [], { out: text => { out += text; } }).done).map(integer).sort((a, b) => a - b);
  const ms = (performance.now() - t).toFixed(1);
  env.stop();
  const want = expected[name].slice().sort((a, b) => a - b), ok = JSON.stringify(values) === JSON.stringify(want);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} threads=${host.threads} ${ms}ms  ${ok ? '' : JSON.stringify(values) + ' ≠ ' + JSON.stringify(want)}  printed: ${out.trim().replace(/\n/g, ' / ').slice(0, 60)}`);
  return ok;
}

const web = typeof (globalThis as any).Deno !== 'undefined';
const hosts = web
  ? [async () => (await import('./host/web.ts')).web({ threads: 0, worker: new URL('./runtime/worker.ts', import.meta.url) }),
     async () => (await import('./host/web.ts')).web({ threads: 4, worker: new URL('./runtime/worker.ts', import.meta.url) })]
  : [async () => (await import('./host/node.ts')).node({ threads: 0 }), async () => (await import('./host/node.ts')).node({ threads: 4 })];
let all = true;
for (const make of hosts) for (const name of Object.keys(expected)) all = (await check(name, await make())) && all;
console.log(all ? 'all ok' : 'some failed');
if (!web) process.exit(all ? 0 : 1);
