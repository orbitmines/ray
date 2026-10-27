// node test/tval.mjs PROBE [ENGINE]: PROBE appended to the entrypoint, its tests run; each statement written in it, what it
// was worth (a count, a text, None, true/false, a node), the last few times
import { host } from './host.mjs'; import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const [probe, eng] = process.argv.slice(2);
const { engine } = await import('../../../ray/bootstrap/.entrypoint.mjs');
const dir = new URL('../../../ray/bootstrap/', import.meta.url).pathname, main = dir + '.lt_tval.ray';
const base = readFileSync(dir + '.entrypoint.ray'); writeFileSync(main, Buffer.concat([base, Buffer.from('\n'), readFileSync(probe)]));
const from = base.length + 1, T = 1048576, seen = [];
const r = await host(eng ?? engine(), main, { trace: 2, from, on: (k, a, v, tx) => { if (k === 87 && a >= from && a < from + readFileSync(probe).length) seen.push([a, v, tx]); } });
rmSync(main); const w = (x) => r.i32[x >> 2];
const what = (v, tx) => { if (!v) return '0'; if (v === w(244)) return 'true'; if (v === w(248)) return 'false'; if (v === w(252)) return 'None'; const tag = w(v + 4); if (tag === 3030) return 'count ' + w(v + 32); if (tx || tag === 2020) return 'text ' + JSON.stringify(Buffer.from(r.u8.subarray(w(v + 32), Math.min(w(v + 36), w(v + 32) + 30))).toString()); if (v === w(308)) return 'head'; return 'node #' + v + (tag !== 1313 ? ' tag ' + tag : ''); };
const by = new Map(); for (const [a, v, tx] of seen) { const t = Buffer.from(r.u8.subarray(a + T, a + T + 50)).toString().split('\n')[0]; by.set(a, [t, what(v, tx)]); }
for (const [a, [t, x]] of [...by].sort((p, q) => p[0] - q[0])) console.log(t.padEnd(46).slice(0, 46), '=>', x);
