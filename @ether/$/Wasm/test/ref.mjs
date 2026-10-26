// The reference: the model as it reads (model.mjs, the seed's oracle at 618/628), the Wasm level's givens, and what it does
// as events: R a end k (a statement and what read it), D a e kind (a key defined, its head), U a end (left unread), Y a end k
// (read again)
import { Engine, given } from './model.mjs';
const sleb = (v) => { const o = []; for (;;) { const b = v & 127; v >>= 7; if ((v === 0 && !(b & 64)) || (v === -1 && (b & 64))) { o.push(b); return o; } o.push(b | 128); } };
const leb = (v) => { const o = []; v >>>= 0; do { let b = v & 127; v >>>= 7; if (v) b |= 128; o.push(b); } while (v); return o; };
const KIND = { header: 0, creator: 1, definer: 2, rule: 3, given: 4, 'stand-in': 5 };
export const reference = (bytes) => {
  const t = Array.from(bytes); const x = new Engine(t); x.out = []; x.marks = []; x.begins = []; const ev = []; const CAP = +(process.env.EVCAP ?? 1e9); const push0 = ev.push.bind(ev); ev.push = (y) => { if (ev.length > CAP) throw new Error('too many events'); return push0(y); };
  const define0 = x.define.bind(x); x.define = (a, e, kind, body) => { const k = define0(a, e, kind, body); k.ha = a; k.he = e; return k; };
  const add0 = x.add.bind(x); x.add = (key, node) => { const k = add0(key, node); ev.push(`D ${key.ha ?? -1} ${key.he ?? -1} ${KIND[key.kind]}`); return k; };
  x.onStatement = (a, end, r, depth) => ev.push(`R ${a} ${end} ${r.k}`);
  x.onRetry = (st, r) => ev.push(`Y ${st.a} ${st.end} ${r.k}`);
  const run0 = x.run.bind(x);
  const apply0 = x.apply.bind(x);
  x.apply = function (r, base, a, end, at, frame, caller, depth, extra) {
    const key = x.keys[r.k]; ev.push(`A ${a} ${end} ${r.k}`);
    if (key.kind === 'given') {
      const holes = key.parts.map((p, i) => [p, r.cap[i]]).filter(([p, c]) => p.kind !== 'text' && p.kind !== 'space' && c);
      const [ga, ge] = holes[holes.length - 1][1]; const g = x.text(ga, ge);
      const m = g.match(/^(emit|leb|sleb|const|patch)\s+(.*)$/s);
      const num = (s) => { let y = s.trim(); const b = x.boundBy(y, frame); if (b) y = x.text(b.a, b.e).trim(); return /^0x/.test(y) ? parseInt(y.slice(2), 16) : (parseInt(y, 10) || 0); };
      if (m) { const n = num(m[2]);
        if (m[1] === 'emit') x.out.push(n & 255); else if (m[1] === 'leb') x.out.push(...leb(n)); else if (m[1] === 'sleb') x.out.push(...sleb(n));
        else if (m[1] === 'const') x.out.push(0x41, ...sleb(n | 0)); else { const at = x.marks.pop(); x.out[at] = n & 255; }
        return caller; }
      if (/^mark\s*$/.test(g)) { x.marks.push(x.out.length); return caller; }
      if (/^begin\s*$/.test(g)) { x.begins.push(x.out.length); return caller; }
      if (/^finish\s*$/.test(g)) { const at = x.begins.pop(); x.out.splice(at, 0, ...leb(x.out.length - at)); return caller; }
    }
    return apply0(r, base, a, end, at, frame, caller, depth, extra);
  };
  x.boundBy = (s, frame) => { const [open, close] = x.brackets.map((y) => Buffer.from(y).toString());
    const name = s.startsWith(open) && s.endsWith(close) ? s.slice(open.length, s.length - close.length) : null;
    for (let f = frame; f; f = f.parent) if (name !== null && f.binds.has(name)) { const b = f.binds.get(name); return x.bound(b.a, b.e, b.frame) ?? b; }
    return null; };
  const { scope, start } = x.language(0, t.length, given());
  run0(0, start, t.length, scope, null, 0);
  const left = (n) => { for (const p of n.pending ?? []) ev.push(`U ${p.a} ${p.end}`); }; left(scope); for (const n of x.nodes) left(n);
  return { events: ev, out: Uint8Array.from(x.out), keys: x.keys.length };
};
