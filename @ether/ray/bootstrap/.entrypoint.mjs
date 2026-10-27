// The language run by its native engine: `.entrypoint.N.wasm`, the latest revision, reads `.entrypoint.ray` (the language,
// asking the level it runs on for what is not its own: `$/Wasm/level.ray`, then `$/Wasm/map.ray`), the library it
// includes, and runs its tests. Each revision is written by the one before it, from `$/Wasm/bootstrap.ray`.
//   node .entrypoint.mjs              the language and its tests: how many pass
//   node .entrypoint.mjs FILE         FILE read as the language (a file of its own, `!language …` first)
//   node .entrypoint.mjs build        the next revision, `.entrypoint.(N+1).wasm`, written by `.entrypoint.N.wasm` from
//                                     $/Wasm/bootstrap.ray (N committed first), checked to write itself the same
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { host } from '../../$/Wasm/test/host.mjs';
import { read } from '../../$/Wasm/bootstrap.mjs';
const here = (name) => fileURLToPath(new URL(name, import.meta.url));
export const revision = () => Math.max(0, ...readdirSync(here('.')).map((f) => f.match(/^\.entrypoint\.(\d+)\.wasm$/)).filter(Boolean).map((m) => +m[1]));
export const engine = () => here(`.entrypoint.${revision()}.wasm`);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // (its reading goes deep: run again with room for it)
  if (!process.execArgv.some((x) => x.startsWith('--stack-size'))) process.exit(spawnSync(process.execPath, ['--stack-size=60000', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' }).status ?? 1);
  const [mode] = process.argv.slice(2);
  if (mode === 'build') {
    const n = revision(), name = `.entrypoint.${n}.wasm`;
    const committed = execFileSync('git', ['status', '--porcelain', '--', name], { cwd: here('.') }).toString().trim() === '' && execFileSync('git', ['ls-files', '--', name], { cwd: here('.') }).toString().trim() !== '';
    if (!committed) { console.log(`${name} is not committed: commit it before building the next`); process.exit(1); }
    const source = readFileSync(here('../../$/Wasm/bootstrap.ray')), was = readFileSync(here(name));
    const next = (await read(was, source)).bytes;
    if (next.length === was.length && next.every((x, i) => x === was[i])) { console.log(`${name} is what the source writes: nothing to build`); process.exit(0); }
    const again = (await read(next, source)).bytes;
    if (again.length !== next.length || again.some((x, i) => x !== next[i])) { console.log(`revision ${n + 1} does not write itself: not kept`); process.exit(1); }
    writeFileSync(here(`.entrypoint.${n + 1}.wasm`), next);
    console.log(`.entrypoint.${n + 1}.wasm: ${next.length} bytes, written by revision ${n}, writes itself`);
  } else {
    const file = mode ?? here('.entrypoint.ray');
    let tests = 0, passed = 0;
    const r = await host(engine(), file, { trace: 1, on: (kind, a, failed) => { if (kind === 84) { tests++; if (!failed) passed++; } } });
    console.log(`${tests} tests, ${passed} passed, ${r.ms} ms (revision ${revision()})${r.error ? ', ' + String(r.error) : ''}`);
  }
}
