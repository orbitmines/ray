// node test/ntrace.mjs ENGINE FILE OFFSET [MAX]: the native engine's nested trace of the top-level statement at byte OFFSET, as the
// seed's RAY_TRACE prints it: each rule applied, its head and the text it reads, indented by depth)
import { host } from './host.mjs';
const [eng, f, off, MAX] = process.argv.slice(2); let at = -1;
await host(eng, f, { trace: 1, notests: 1, on: (k, a) => { if (k === 90 && a <= +off && a > at) at = a; } });
const evs = []; let on = false, last = null;
const r = await host(eng, f, { trace: 2, notests: 1, on: (k, a, b, c) => { if (k === 90) on = a === at; else if (on && evs.length < +(MAX ?? 3000)) { if (k === 65) last = [a, b, c]; else if (k === 99 && last) { last.push(c); } else if (k === 100 && last) { evs.push([...last, a, c]); last = null; } else if (k === 83 || k === 88 || k === 93) evs.push([a, b, -k, 0]); } } });
const T = 1048576, i32 = r.i32, w = (x) => i32[x >> 2]; const keys = w(104);
const txt = (a, b) => { const s = Buffer.from(r.u8.subarray(a, b)).toString().replace(/\n/g, '⏎'); return s.length > 100 ? s.slice(0, 100) + '…' : s; };
const d0 = Math.min(...evs.filter((e) => e[2] >= 0).map((e) => e[3]));
for (const [a, b, k, d, nd, kn] of evs) { if (k < 0) { console.log(' '.repeat(2 * Math.max(0, d - d0)) + ({ 83: 'SAID', 88: 'MISSING', 93: 'DEPTH' })[-k], r.where(a).file + ':' + r.where(a).line); continue; } const key = w(w(keys + 8) + 4 * k); console.log(' '.repeat(2 * (d - d0)) + '`' + txt(w(key + 32), w(key + 36)) + '` on `' + txt(a + T, b + T) + '` on #' + nd + ' (rule of #' + kn + ') ' + r.where(a).file + ':' + r.where(a).line); }
