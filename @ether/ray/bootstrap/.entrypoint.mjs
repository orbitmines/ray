// The language compiled by itself: `.entrypoint.N.wasm`, the latest revision, is Expression.ray (the reader) with the
// compiler written in it ($/Wasm/Compiled.ray, Low.ray, High.ray, compile.ray), compiled. Given a program, it writes
// that program as a WebAssembly module, with the runtime ($/Wasm/runtime.ray) in it. Each revision is written by the one
// before it, from those same sources: revision 0 was written by the interim engine ($/Wasm/bootstrap.*).
//   node .entrypoint.mjs FILE         FILE compiled by the latest revision, then run: what its main answers
//   node .entrypoint.mjs build        the next revision, `.entrypoint.(N+1).wasm`, written by `.entrypoint.N.wasm` (N
//                                     committed first), checked to write itself the same
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const wasm = (name) => here(`../../$/Wasm/${name}`);
export const revision = () => Math.max(0, ...readdirSync(here('.')).map((f) => f.match(/^\.entrypoint\.(\d+)\.wasm$/)).filter(Boolean).map((m) => +m[1]));
export const engine = () => here(`.entrypoint.${revision()}.wasm`);
const PAGES = 32000;
// (what it reads: lines that are only a comment left out; Expression.ray up to where its parser is set, its tests after)
const uncommented = (text) => text.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const reader = () => { const t = readFileSync(here('Expression.ray'), 'utf8'), end = 'level set_parser (parser)\n'; return t.slice(0, t.indexOf(end) + end.length); };
export const source = () => uncommented([reader(), ...['Compiled.ray', 'Low.ray', 'High.ray', 'compile.ray'].map((f) => readFileSync(wasm(f), 'utf8'))].join(''));
// (a module compiling a program: its input the header Expression reads first, the program, the runtime, apart by a 0)
export const compiled = async (module, program) => {
  const memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES });
  const { instance } = await WebAssembly.instantiate(module, { m: { memory } });
  const input = Buffer.from([readFileSync(wasm('header.ray'), 'utf8'), uncommented(program), readFileSync(wasm('runtime.ray'), 'utf8')].join('\0'));
  new Uint8Array(memory.buffer).set(input, 8388608); new Int32Array(memory.buffer)[4088 >> 2] = input.length;
  instance.exports.main();
  return new Uint8Array(memory.buffer).slice(instance.exports.out_base(), instance.exports.out_base() + instance.exports.out_length());
};
export const run = async (module) => {
  const memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES });
  const { instance } = await WebAssembly.instantiate(module, { m: { memory } });
  return instance.exports.main();
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // (its reading goes deep: run again with room for it)
  if (!process.execArgv.some((x) => x.startsWith('--stack-size'))) process.exit(spawnSync('bash', ['-c', `ulimit -s unlimited; exec "${process.execPath}" --stack-size=60000 ${process.argv.slice(1).map((a) => JSON.stringify(a)).join(' ')}`], { stdio: 'inherit' }).status ?? 1);
  const [mode] = process.argv.slice(2);
  if (mode === 'build') {
    const n = revision(), name = `.entrypoint.${n}.wasm`;
    const committed = execFileSync('git', ['status', '--porcelain', '--', name], { cwd: here('.') }).toString().trim() === '' && execFileSync('git', ['ls-files', '--', name], { cwd: here('.') }).toString().trim() !== '';
    if (!committed) { console.log(`${name} is not committed: commit it before building the next`); process.exit(1); }
    const was = readFileSync(here(name)), text = source();
    const next = await compiled(was, text);
    if (next.length === was.length && next.every((x, i) => x === was[i])) { console.log(`${name} is what the source writes: nothing to build`); process.exit(0); }
    const again = await compiled(next, text);
    if (again.length !== next.length || again.some((x, i) => x !== next[i])) { console.log(`revision ${n + 1} does not write itself: not kept`); process.exit(1); }
    writeFileSync(here(`.entrypoint.${n + 1}.wasm`), next);
    console.log(`.entrypoint.${n + 1}.wasm: ${next.length} bytes, written by revision ${n}, writes itself`);
  } else {
    if (!mode) { console.log('node .entrypoint.mjs FILE | build'); process.exit(1); }
    const t0 = Date.now(), module = await compiled(readFileSync(engine()), readFileSync(mode, 'utf8'));
    console.log(`${mode}: ${module.length} bytes (revision ${revision()}, ${Date.now() - t0} ms); main() = ${await run(module)}`);
  }
}
