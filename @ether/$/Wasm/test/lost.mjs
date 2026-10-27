// node test/lost.mjs ENGINE FILE PU [N]: tests the seed passes (its .pu file) that the native engine fails, by the first said
import { host } from './host.mjs'; import { readFileSync } from 'node:fs';
const [eng, f, pu, N] = process.argv.slice(2); const tests = []; let cur = [];
const seed = new Map(); for (const l of readFileSync(pu, 'utf8').split('\n')) { const m = l.match(/^PASS\s+\S*\/([^/:]+): (.*)$/); if (m) { if (!seed.has(m[1])) seed.set(m[1], []); seed.get(m[1]).push(m[2].replace(/…$/, '').trim()); } }
const r = await host(eng, f, { trace: 1, on: (k, a, b) => { if (k === 83) cur.push(a); else if (k === 66) cur = []; else if (k === 84) { tests.push([a, b, cur]); cur = []; } } });
const T = 1048576; const inFile = (a) => r.files.some((x) => a >= x.at && a < x.at + x.text.length);
const label = (a) => { if (!inFile(a)) return 'GEN ' + JSON.stringify(Buffer.from(r.u8.subarray(a + T, a + T + 50)).toString()); const w = r.where(a); return `${w.file}:${w.line} ${w.text.slice(0, 60)}`; };
const groups = new Map();
for (const [a, failed, said] of tests) { if (!failed) continue; const w = r.where(a), t = w.text.replace(/\s*\/\/.*$/, '').trim(); if (!(seed.get(w.file === '.entrypoint.ray' ? '.entrypoint.ray3' : w.file) ?? []).some((x) => t.startsWith(x.slice(0, 60)) || x.startsWith(t.slice(0, 60)))) continue; const k = said.length ? label(said[0]) : '(nothing said)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(`${w.file}:${w.line} ${t.slice(0, 50)}`); }
for (const [k, v] of [...groups].sort((x, y) => y[1].length - x[1].length).slice(0, +(N ?? 15))) console.log(String(v.length).padStart(4), k.slice(0, 90), '\n       e.g.', v[0], '|', v[1] ?? '');
