// node parity.mjs ENGINE.wasm FILE...: the native engine's events and bytes against the reference's, file by file
import { readFileSync } from 'node:fs'; import { reference } from './ref.mjs'; import { native } from './native.mjs';
const engine = readFileSync(process.argv[2]); let bad = 0;
for (const f of process.argv.slice(3)) {
  const text = readFileSync(f); let r, n;
  const t0 = performance.now(); try { r = reference(text); } catch (e) { console.log('REF-ERR', f, String(e).slice(0, 120)); continue; } const rm = performance.now() - t0;
  try { n = await native(engine, text); } catch (e) { console.log('NATIVE-ERR', f, String(e).slice(0, 160)); bad++; continue; }
  let i = 0; while (i < r.events.length && r.events[i] === n.events[i]) i++;
  const same = i === r.events.length && i === n.events.length, bytes = Buffer.compare(Buffer.from(r.out), Buffer.from(n.out)) === 0;
  if (!same || !bytes) bad++;
  const where = (ev) => { const m = ev?.match(/^\w (-?\d+)/); if (!m || +m[1] < 0) return ''; const line = text.subarray(0, +m[1]).toString().split('\n').length; return ` line ${line} ${JSON.stringify(text.subarray(+m[1], +m[1] + 50).toString())}`; };
  console.log(same && bytes ? 'SAME' : 'DIFF', f.split('/').pop(), `${r.events.length} events, ${r.out.length} bytes, ref ${Math.round(rm)} ms, native ${Math.round(n.ms)} ms`);
  if (!same) console.log(`  at ${i}: ref ${r.events[i]}${where(r.events[i])}\n          native ${n.events[i]}${where(n.events[i])}\n  before: ${r.events.slice(Math.max(0, i - 3), i).join(' | ')}`);
  else if (!bytes) console.log(`  bytes differ: ref ${r.out.length} native ${n.out.length}`);
}
process.exit(bad ? 1 : 0);
