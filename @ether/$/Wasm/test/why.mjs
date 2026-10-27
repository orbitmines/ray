// node test/why.mjs ENGINE FILE [N]: FILE run as the language by the native engine (RUNMODE): its tests, failures grouped by the
// first thing said in them; with PU=<a seed suite's .pu file>, how many agree with the seed
import { host } from './host.mjs';
const [eng, f, N] = process.argv.slice(2); const tests = []; let cur = [];
const r = await host(eng, f, { trace: 1, on: (kind, a, b) => { if (kind === 83) cur.push(a); else if (kind === 84) { tests.push([a, b, cur]); cur = []; } } });
const label = (a) => { const w = r.where(a); return `${w.file}:${w.line} ${w.text.slice(0, 70)}`; };
const groups = new Map(); let passed = 0;
for (const [a, failed, said] of tests) { if (!failed) { passed++; continue; } const k = said.length ? label(said[0]) : '(nothing said)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
console.log(`${tests.length} tests, ${passed} passed, ${r.ms} ms, heap ${((r.i32[1] - 8388608) >> 20)} MB, ${r.files.length} files${r.error ? ' ERROR ' + String(r.error).slice(0, 80) : ''}`);
for (const [k, v] of [...groups].sort((x, y) => y[1].length - x[1].length).slice(0, +(N ?? 15))) console.log(String(v.length).padStart(4), k, '  e.g.', label(v[0]).slice(0, 50));
// against the seed: its PASS lines, by file and the test's text
import('node:fs').then(({ readFileSync }) => {
  const pu = process.env.PU; if (!pu) return;
  const seed = new Map(); for (const l of readFileSync(pu, 'utf8').split('\n')) { const m = l.match(/^PASS\s+\S*\/([^/:]+): (.*)$/); if (m) { if (!seed.has(m[1])) seed.set(m[1], []); seed.get(m[1]).push(m[2].replace(/…$/, '').trim()); } }
  const textOf = (a) => { const w = r.where(a); return w.text.replace(/\s*\/\/.*$/, '').trim(); };
  const per = new Map(); const wrongPass = [];
  for (const [a, failed] of tests) { const w = r.where(a), t = textOf(a), s = (seed.get(w.file) ?? []).some((x) => t.startsWith(x.slice(0, 60)) || x.startsWith(t.slice(0, 60)));
    const e = per.get(w.file) ?? { both: 0, seedOnly: 0, nativeOnly: 0, neither: 0 }; per.set(w.file, e);
    if (s && !failed) e.both++; else if (s && failed) e.seedOnly++; else if (!s && !failed) { e.nativeOnly++; wrongPass.push(`${w.file}:${w.line} ${t.slice(0, 70)}`); } else e.neither++; }
  for (const [f, e] of per) console.log(`  ${f}: both pass ${e.both}, seed only ${e.seedOnly}, native only ${e.nativeOnly}, neither ${e.neither} (seed passes ${(seed.get(f) ?? []).length})`);
  if (process.env.SHOW) for (const x of wrongPass.slice(0, 20)) console.log('   native-only', x);
});
