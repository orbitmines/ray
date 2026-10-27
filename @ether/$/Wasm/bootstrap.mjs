// The Wasm level's interim engine, until the native engine runs the full language and builds $/Wasm.project.ray itself: its
// source. Its revisions are `@ether/ray/bootstrap/.entrypoint.N.wasm`, each written by the one before it
// (`node .entrypoint.mjs build` there). Its host here: what the platform gives it (memory, `log`), a text in, the bytes out.
//   node bootstrap.mjs FILE OUT        FILE read by the latest revision, what it writes to OUT
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = here('../../ray/bootstrap/'), n = Math.max(...readdirSync(dir).map((f) => f.match(/^\.entrypoint\.(\d+)\.wasm$/)).filter(Boolean).map((m) => +m[1]));
  const engine = () => dir + `.entrypoint.${n}.wasm`;
  const [file, out] = process.argv.slice(2);
  const { bytes } = await read(readFileSync(engine()), readFileSync(file)); writeFileSync(out, bytes); console.log(`${bytes.length} bytes`);
}
