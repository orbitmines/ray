// The language run by its native engine: `.entrypoint.wasm` reads `.entrypoint.ray` (the language, asking the level it runs
// on for what is not its own: `$/Wasm/level.ray`, then `$/Wasm/map.ray`), the library it includes, and runs its tests.
//   node .entrypoint.mjs              the language and its tests: how many pass
//   node .entrypoint.mjs FILE         FILE read as the language (a file of its own, `!language …` first)
//   node .entrypoint.mjs build        .entrypoint.wasm written again by the engine from $/Wasm/bootstrap.ray, checked to be
//                                     the engine that wrote it (a fixpoint)
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { host } from '../../$/Wasm/test/host.mjs';
import { read } from '../../$/Wasm/bootstrap.mjs';
const here = (name) => fileURLToPath(new URL(name, import.meta.url));
// (its reading goes deep: run again with room for it)
if (!process.execArgv.some((x) => x.startsWith('--stack-size'))) process.exit(spawnSync(process.execPath, ['--stack-size=60000', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' }).status ?? 1);
const engine = here('.entrypoint.wasm');
const [mode] = process.argv.slice(2);
if (mode === 'build') {
  const source = readFileSync(here('../../$/Wasm/bootstrap.ray'));
  const once = (await read(readFileSync(engine), source)).bytes, twice = (await read(once, source)).bytes;
  if (once.length !== twice.length || once.some((x, i) => x !== twice[i])) { console.log('not a fixpoint'); process.exit(1); }
  writeFileSync(engine, once); console.log(`.entrypoint.wasm: ${once.length} bytes, writes itself`);
} else {
  const file = mode ?? here('.entrypoint.ray');
  let tests = 0, passed = 0;
  const r = await host(engine, file, { trace: 1, on: (kind, a, failed) => { if (kind === 84) { tests++; if (!failed) passed++; } } });
  console.log(`${tests} tests, ${passed} passed, ${r.ms} ms${r.error ? ', ' + String(r.error) : ''}`);
}
