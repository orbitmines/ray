// [ENTRY=.entrypoint.ray3] node test/tlast.mjs PROBE [ENGINE]: PROBE included last, after the whole library (beside the entrypoint), no tests; each
// statement written in it, what it was worth (as tval.mjs)
import { host } from './host.mjs'; import { readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'; import { dirname, join } from 'node:path';
const [probe, eng] = process.argv.slice(2);
const { engine } = await import('../../../ray/bootstrap/.entrypoint.mjs');
const dir = join(dirname(new URL(import.meta.url).pathname), '../../../ray/bootstrap'); const main = join(dir, '.lt_tlast.ray'), inc = join(dir, '.lt_tlast_probe.ray');
writeFileSync(main, readFileSync(join(dir, (process.env.ENTRY ?? '.entrypoint.ray'))).toString() + '\ninclude @./.lt_tlast_probe.ray\n'); copyFileSync(probe, inc);
const T = 1048576, seen = []; let at = -1, len = readFileSync(probe).length, r;
try {
  const r0 = await host(eng ?? engine(), main, { trace: 1, notests: 1 }); at = r0.files.find((x) => x.file.endsWith('.lt_tlast_probe.ray'))?.at ?? -1;
  r = await host(eng ?? engine(), main, { trace: 2, notests: 1, on: (k, a, v, tx) => { if (k === 87 && at >= 0 && a >= at && a < at + len) seen.push([a, v, tx]); } });
} finally { rmSync(main); rmSync(inc); }
if (at < 0) { console.log('the probe was not included'); process.exit(1); }
const w = (x) => r.i32[x >> 2];
const what = (v, tx) => { if (!v) return '0'; if (v === w(244)) return 'true'; if (v === w(248)) return 'false'; if (v === w(252)) return 'None'; const tag = w(v + 4); if (tag === 3030) return 'count ' + w(v + 32); if (tx || tag === 2020) return 'text ' + JSON.stringify(Buffer.from(r.u8.subarray(w(v + 32), Math.min(w(v + 36), w(v + 32) + 30))).toString()); if (v === w(308)) return 'head'; return 'node #' + v + (tag !== 1313 ? ' tag ' + tag : ''); };
const by = new Map(); for (const [a, v, tx] of seen) { const t = Buffer.from(r.u8.subarray(a + T, a + T + 50)).toString().split('\n')[0]; by.set(a, [t, what(v, tx)]); }
for (const [a, [t, x]] of [...by].sort((p, q) => p[0] - q[0])) console.log(t.padEnd(46).slice(0, 46), '=>', x);
if (r.error) console.log(String(r.error));
