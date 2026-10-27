// node test/ttrace2.mjs ENGINE FILE FROM [MAX]: the nested trace (as ntrace.mjs) of the first test from byte FROM on
import { host } from './host.mjs';
const [eng, f, from, MAX] = process.argv.slice(2); const evs = []; let on = 0, last = null;
const r = await host(eng, f, { trace: 2, from: +from, on: (k, a, b, c) => { if (k === 66 && on === 0) on = 1; else if (k === 84 && on === 1) on = 2; else if (on === 1 && evs.length < +(MAX ?? 3000)) { if (k === 65) last = [a, b, c]; else if (k === 99 && last) last.push(c); else if (k === 100 && last) { evs.push([...last, a, c]); last = null; } else if (k === 83 || k === 88 || k === 93) evs.push([a, b, -k, evs.length ? evs[evs.length - 1][3] : 0]); } } });
const T = 1048576, i32 = r.i32, w = (x) => i32[x >> 2]; const keys = w(104);
const txt = (a, b) => { const s = Buffer.from(r.u8.subarray(a, Math.min(b, a + 400))).toString().replace(/\n/g, '⏎'); return s.length > 100 ? s.slice(0, 100) + '…' : s; };
const d0 = Math.min(...evs.filter((e) => e[2] >= 0).map((e) => e[3]));
for (const [a, b, k, d, nd, kn] of evs) { const ind = ' '.repeat(2 * Math.max(0, d - d0)); if (k < 0) { console.log(ind + ({ 83: 'SAID', 88: 'MISSING', 93: 'DEPTH' })[-k], r.where(a).file + ':' + r.where(a).line); continue; } const key = w(w(keys + 8) + 4 * k); console.log(ind + '`' + txt(w(key + 32), w(key + 36)) + '` on `' + txt(a + T, b + T) + '` on #' + nd + ' (rule of #' + kn + ') ' + r.where(a).file + ':' + r.where(a).line); }
