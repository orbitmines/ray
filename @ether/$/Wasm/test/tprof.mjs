// node test/tprof.mjs ENGINE FILE [N]: applications during the tests, counted by rule (its head and where it is written)
import { host } from './host.mjs';
const [eng, f, N] = process.argv.slice(2); const cnt = new Map(); let intest = false, total = 0;
const r = await host(eng, f, { trace: 1, on: (k, a, b, c) => { if (k === 66) intest = true; if (intest && k === 65) { cnt.set(c, (cnt.get(c) ?? 0) + 1); total++; } } });
const w = (x) => r.i32[x >> 2], K = w(104);
console.log(total, 'applications in tests');
for (const [k, n] of [...cnt].sort((x, y) => y[1] - x[1]).slice(0, +(N ?? 25))) { const kp = w(w(K + 8) + 4 * k); const a = w(kp + 32), e = w(kp + 36); const wh = r.where(a - 1048576); console.log(String(n).padStart(9), JSON.stringify(Buffer.from(r.u8.subarray(a, Math.min(e, a + 60))).toString()).padEnd(50), `${wh.file}:${wh.line}`); }
