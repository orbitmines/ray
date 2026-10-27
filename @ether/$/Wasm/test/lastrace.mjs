// [ENTRY=.entrypoint.ray] [AT=offset of the statement in PROBE] node test/lastrace.mjs ENGINE PROBE [MAX]: PROBE's text read after the whole library (included last, beside the entrypoint),
// the nested trace (as ntrace.mjs) of its first statement
import { host } from './host.mjs'; import { readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'; import { dirname, join } from 'node:path';
const [eng, probe, MAX] = process.argv.slice(2);
const dir = join(dirname(new URL(import.meta.url).pathname), '../../../ray/bootstrap'); const main = join(dir, '.lt_last.ray'), inc = join(dir, '.lt_last_probe.ray');
writeFileSync(main, readFileSync(join(dir, process.env.ENTRY ?? '.entrypoint.ray3')).toString() + '\ninclude @./.lt_last_probe.ray\n'); copyFileSync(probe, inc);
let target = -1, on = false, last = null; const evs = [];
const r0 = await host(eng, main, { trace: 1, notests: 1, on: (k, a) => { if (k === 90 && target < 0) {} } });
const pf = r0.files.find((x) => x.file.endsWith('.lt_last_probe.ray')); target = pf ? pf.at + +(process.env.AT ?? 0) : -1;
const r = await host(eng, main, { trace: 2, notests: 1, on: (k, a, b, c) => { if (k === 90) on = target >= 0 && a >= target - 2 && a <= target + 2; else if (on && evs.length < +(MAX ?? 3000)) { if (k === 65) last = [a, b, c]; else if (k === 99 && last) last.push(c); else if (k === 100 && last) { evs.push([...last, a, c]); last = null; } else if (k === 83 || k === 88 || k === 93) evs.push([a, b, -k, evs.length ? evs[evs.length - 1][3] : 0]); } } });
rmSync(main); rmSync(inc); if (process.env.NODES) for (const nd of process.env.NODES.split(",")) { const n = +nd; const ch = []; let x = n; while (x && ch.length < 8) { ch.push(x + ":" + r.i32[x / 4 + 1] + (r.i32[x / 4 + 7] ? "(w" + r.i32[x / 4 + 7] + ")" : "")); x = r.i32[x / 4]; } console.error(nd, ch.join(" > ")); const ks = r.i32[n / 4 + 2], K = r.i32[104 / 4]; const out = []; for (let j = 0; j < r.i32[ks / 4] && j < 30; j++) { const kp = r.i32[(r.i32[K / 4 + 2] + 4 * r.i32[r.i32[ks / 4 + 2] / 4 + j]) / 4]; out.push(Buffer.from(r.u8.subarray(r.i32[kp / 4 + 8], Math.min(r.i32[kp / 4 + 9], r.i32[kp / 4 + 8] + 20))).toString()); } console.error("   keys:", JSON.stringify(out)); }
const T = 1048576, i32 = r.i32, w = (x) => i32[x >> 2]; const keys = w(104);
const txt = (a, b) => { const s = Buffer.from(r.u8.subarray(a, b)).toString().replace(/\n/g, '⏎').replace(/[^\x20-\x7e⏎ -￿]/g, '?'); return s.length > 100 ? s.slice(0, 100) + '…' : s; };
const d0 = Math.min(...evs.filter((e) => e[2] >= 0).map((e) => e[3]));
for (const [a, b, k, d, nd, kn] of evs) { const ind = ' '.repeat(2 * Math.max(0, d - d0)); if (k < 0) { console.log(ind + ({ 83: 'SAID', 88: 'MISSING', 93: 'DEPTH' })[-k], r.where(a).file + ':' + r.where(a).line); continue; } const key = w(w(keys + 8) + 4 * k); console.log(ind + '`' + txt(w(key + 32), w(key + 36)) + '` on `' + txt(a + T, b + T) + '` on #' + nd + ' ' + r.where(a).file + ':' + r.where(a).line); }
