// node test/cmp.mjs ENGINE_A ENGINE_B FILE [N]: the tests that pass with A and fail with B (and how many the other way), with
// what B said first in them
import { host } from './host.mjs';
const [ea, eb, f, N] = process.argv.slice(2);
const run = async (e) => { const res = new Map(); let cur = null, first = null; const r = await host(e, f, { trace: 1, on: (k, a, b) => { if (k === 66) { cur = a; first = null; } if (k === 83 && cur !== null && first === null) first = a; if (k === 84) res.set(a, [b, first]); } }); return [r, res]; };
const [ra, A] = await run(ea), [rb, B] = await run(eb);
const lost = [], won = []; for (const [a, [fa]] of A) { const x = B.get(a); if (!x) continue; if (!fa && x[0]) lost.push([a, x[1]]); if (fa && !x[0]) won.push(a); }
console.log(`${lost.length} pass with A only, ${won.length} with B only`);
const by = new Map(); for (const [a, s] of lost) { const w = s === null ? '(nothing said)' : (() => { const q = rb.where(s); return `${q.file}:${q.line} ${q.text.slice(0, 60)}`; })(); if (!by.has(w)) by.set(w, []); by.get(w).push(a); }
for (const [w, l] of [...by].sort((x, y) => y[1].length - x[1].length).slice(0, +(N ?? 12))) { const q = ra.where(l[0]); console.log(String(l.length).padStart(4), w, '  e.g.', `${q.file}:${q.line} ${q.text.slice(0, 50)}`); }
