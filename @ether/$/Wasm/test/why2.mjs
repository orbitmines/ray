// node test/why2.mjs ENGINE FILE NAME [N]: of the tests written in file NAME, the failures grouped by the first thing said
import { host } from './host.mjs';
const [eng, f, name, N] = process.argv.slice(2); const tests = []; let cur = [];
const r = await host(eng, f, { trace: 1, on: (kind, a, b) => { if (kind === 83) cur.push(a); else if (kind === 66) cur = []; else if (kind === 84) { tests.push([a, b, cur]); cur = []; } } });
const T = 1048576, label = (a) => { const w = r.where(a); const main = r.files.reduce((s, x) => s, 0); return `${w.file}:${w.line} ${w.text.slice(0, 60)}`; };
const groups = new Map(); let n = 0, p = 0;
for (const [a, failed, said] of tests) { if (r.where(a).file !== name) continue; n++; if (!failed) { p++; continue; } const k = said.length ? label(said[0]) : '(nothing said)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
console.log(`${name}: ${n} tests, ${p} passed`);
for (const [k, v] of [...groups].sort((x, y) => y[1].length - x[1].length).slice(0, +(N ?? 12))) console.log(String(v.length).padStart(4), k, '  e.g.', label(v[0]).slice(0, 60));
