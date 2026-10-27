// The Wasm level's interim engine, until the native engine runs the full language and builds $/Wasm.project.ray itself.
// Its host: what the platform gives it (memory, `log`), a text in, the bytes it writes out.
//   node bootstrap.mjs                 rebuild bootstrap.wasm from bootstrap.ray, once it rebuilds itself the same
//   node bootstrap.mjs check           whether bootstrap.wasm, reading bootstrap.ray, writes itself
//   node bootstrap.mjs FILE OUT        read FILE, write what it writes to OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const TEXT = 1048576, OUT = 5242880, TLEN = 64, NKEYS = 12;
export const read = async (engine, text) => {
  const memory = new WebAssembly.Memory({ initial: 1024 });
  const log = (at) => { const line = text.subarray(0, at - TEXT).toString().split('\n').length; throw new Error(`line ${line}: nothing reads ${JSON.stringify(Buffer.from(new Uint8Array(memory.buffer, at, 80)).toString())}`); };
  const { instance } = await WebAssembly.instantiate(engine, { m: { memory, log, ev: () => 0, fetch: () => 0 } });
  const u8 = new Uint8Array(memory.buffer), i32 = new Int32Array(memory.buffer);
  u8.set(text, TEXT); i32[TLEN / 4] = text.length;
  const n = instance.exports.main();
  return { bytes: u8.slice(OUT, OUT + n), keys: i32[NKEYS / 4] };
};
const [mode, out] = process.argv.slice(2);
const source = readFileSync(here('bootstrap.ray')), seed = readFileSync(here('bootstrap.wasm'));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
if (mode === undefined || mode === 'check') {
  const t0 = performance.now();
  const once = (await read(seed, source)).bytes, twice = (await read(once, source)).bytes;
  const ms = Math.round(performance.now() - t0);
  if (!same(once, twice)) { console.log(`not a fixpoint: ${once.length} bytes, then ${twice.length}`); process.exit(1); }
  if (mode === 'check') { console.log(same(once, seed) ? `fixpoint: bootstrap.wasm writes itself (${seed.length} bytes, ${ms} ms)` : `bootstrap.ray changed: rebuild (${seed.length} → ${once.length} bytes)`); process.exit(same(once, seed) ? 0 : 1); }
  writeFileSync(here('bootstrap.wasm'), once); console.log(`rebuilt: ${once.length} bytes, a fixpoint (${ms} ms)`);
} else {
  const { bytes } = await read(seed, readFileSync(mode)); writeFileSync(out, bytes); console.log(`${bytes.length} bytes`);
}
