// The reading model, plain JS: the seed's reading of .entrypoint.ray3 statement by statement (618 of 628 the same), the oracle
// the native engine (bootstrap.wasm) is held against, event by event
export const white = (c) => c === 32 || c === 10 || c === 9 || c === 13;
const word = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;
export class Engine {
  constructor(t) { this.t = t; this.keys = []; this.pairs = []; this.nodes = []; this.log = []; }
  same(a, s) { const t = this.t; for (let i = 0; i < s.length; i++) if (t[a + i] !== s[i]) return false; return true; }
  text(a, e) { return Buffer.from(this.t.slice(a, e)).toString('utf8'); }
  // past what is at a: a pair's close (one open) or open, counted in `open`; else one character
  step(a, open, e) {
    // (inside a quote, a pair of one text on both sides, only its close counts)
    if (open.quote >= 0) { const [, c] = this.pairs[open.quote]; if (a + c.length <= e && this.same(a, c)) { open[open.quote]--; open.total--; open.quote = -1; return a + c.length; } return a + 1; }
    for (let j = 0; j < this.pairs.length; j++) { const [o, c] = this.pairs[j];
      if (open[j] > 0 && a + c.length <= e && this.same(a, c)) { open[j]--; open.total--; return a + c.length; }
      if (a + o.length <= e && this.same(a, o)) { open[j]++; open.total++; if (o.length === c.length && this.same(a, c)) open.quote = j; return a + o.length; } }
    return a + 1;
  }
  // (a line ending, before any comment, with a separator that is no pair's: the statement goes on past its newline)
  endsep(q) { let ls = q; while (ls > 0 && this.t[ls - 1] !== 10) ls--; let last = 0;
    for (let j = ls; j < q; j++) { if (this.t[j] === 47 && this.t[j + 1] === 47 && (j === ls || this.t[j - 1] === 32)) break; if (this.t[j] > 32) last = this.t[j]; }
    return last !== 0 && [40, 41, 123, 125, 91, 93, 34, 39, 96, 44, 59].includes(last) && !this.pairs.some(([o, c]) => (o.length === 1 && o[0] === last) || (c.length === 1 && c[0] === last)); }
  frame() { const f = new Array(this.pairs.length).fill(0); f.total = 0; f.quote = -1; return f; }
  indent(base, a) { let q = a; while (q > base && this.t[q - 1] === 32) q--; return a - q; }
  extent(base, a, e) {
    const ind = this.indent(base, a), f = this.frame(); let q = a;
    while (q < e) {
      if (f.total === 0 && this.t[q] === 10) { let r = q + 1; while (r < e && this.t[r] === 32) r++; if (r >= e || this.t[r] === 10 || (r - q - 1 <= ind && !this.endsep(q))) break; }
      q = this.step(q, f, e);
    }
    return q;
  }
  // a key's parts from i reading a..e: holes kept in `cap` (by part)
  match(key, i, a, e, cap, ind) {
    if (i === key.parts.length) return a === e;
    const p = key.parts[i];
    if (p.kind === 'text') return a + p.bytes.length <= e && this.same(a, p.bytes) && this.match(key, i + 1, a + p.bytes.length, e, cap, ind);
    if (p.kind === 'space') { for (let q = a; q < e && white(this.t[q]);) { q++; if (this.match(key, i + 1, q, e, cap, ind)) return true; } return false; }
    // (a head that is one hole takes a word)
    if (key.parts.length === 1 && p.kind === 'hole') { if (e <= a) return false; for (let q = a; q < e; q++) if (!word(this.t[q])) return false; cap[i] = [a, e]; return true; }
    const typed = p.kind === 'hole' && p.type ? this.typeNode(p.type) : null;
    // (a hole between the two texts of a pair holds anything the pair does)
    const before = key.parts[i - 1], after = key.parts[i + 1];
    const paired = before?.kind === 'text' && after?.kind === 'text' && this.pairs.some(([o, c]) => Buffer.compare(Buffer.from(o), Buffer.from(before.bytes)) === 0 && Buffer.compare(Buffer.from(c), Buffer.from(after.bytes)) === 0);
    // (a hole written against text, or against another hole, takes no space)
    const against = (q) => q && q.kind !== 'space';
    const tight = !paired && key.kind !== 'given' && (against(key.parts[i - 1]) || against(key.parts[i + 1]));
    const f = this.frame();
    for (let q = a; ; ) {
      // (a written head's hole takes something; none ends inside a word)
      if (f.total === 0 && !(key.kind !== 'given' && q === a) && !(q > a && q < e && word(this.t[q - 1]) && word(this.t[q]))) {
        if ((p.kind === 'hole' ? (!typed || this.reads(typed, a, q)) : this.match(p.key, 0, a, q, [], ind)) && this.match(key, i + 1, q, e, cap, ind)) { cap[i] = [a, q]; return true; }
      }
      if (q >= e) return false;
      if (f.total === 0 && tight && white(this.t[q])) return false;
      if (!paired && f.total === 0 && this.t[q] === 10) { let r = q + 1; while (r < e && this.t[r] === 32) r++; if (r - q - 1 <= ind && !this.endsep(q)) return false; }
      q = this.step(q, f, e);
    }
  }
  // (a definition first (a key with the arrow), then one led by text, then the latest; the same among definitions)
  rank(k) { const key = this.keys[k]; return (key.kind === 'creator' || key.kind === 'definer' || key.arrow ? 2 : 0) + (key.parts[0].kind === 'text' ? 1 : 0); }
  // the statement at a: the key that reads it and its holes; its extent its lines, or as many more as it takes
  read(base, a, e, node, excl) {
    const was = this.reading; this.reading = node; try { return this.read_(base, a, e, node, excl); } finally { this.reading = was; }
  }
  read_(base, a, e, node, excl) {
    const ind = this.indent(base, a); let end = this.extent(base, a, e);
    for (;;) {
      for (let n = node; n; n = n.in) {
        let best = -1, cap = null;
        // (a head led by `{this}` is a method: read only on a value, never a statement of its own)
        for (const k of n.keys) { if (excl && k >= excl[0] && k < excl[1]) continue; const p0 = this.keys[k].parts[0]; if (p0.kind === 'hole' && p0.name === 'this') continue; if (best >= 0 && this.rank(k) < this.rank(best)) continue; const c = []; if (this.match(this.keys[k], 0, a, end, c, ind)) { best = k; cap = c; } }
        if (best >= 0) return { k: best, cap, end };
      }
      if (end >= e || (this.t[end] === 10 && this.t[end + 1] === 10)) return { k: -1, end: this.extent(base, a, e) };
      end++; while (end < e && this.t[end] !== 10) end++;
    }
  }
  // a key of the text a..e: runs of characters texts, of space space, `open name close` a hole (a quoted text a text)
  define(a, e, kind, body) {
    const [open, close] = this.brackets, parts = []; let q = a;
    while (q < e) {
      if (q + open.length <= e && this.same(q, open)) {
        let r = q + open.length; while (r + close.length <= e && !this.same(r, close)) r = this.past(r, e);
        const inner = [q + open.length, r]; q = r + close.length;
        if (this.quoted(inner[0], inner[1])) parts.push({ kind: 'text', bytes: this.t.slice(inner[0] + 1, inner[1] - 1) });
        else { let n = inner[0]; while (n < inner[1] && word(this.t[n])) n++; const m = this.text(n, inner[1]).match(/^:\s*(\w+)\s*$/); parts.push({ kind: 'hole', name: this.text(inner[0], n), type: m ? m[1] : null }); }
      } else if (white(this.t[q])) { while (q < e && white(this.t[q])) q++; parts.push({ kind: 'space' }); }
      else { const s = q; while (q < e && !white(this.t[q]) && !(q + open.length <= e && this.same(q, open))) q++; parts.push({ kind: 'text', bytes: this.t.slice(s, q) }); }
    }
    const key = { kind, parts, body, head: this.text(a, e) };
    key.arrow = parts.some((p) => p.kind === 'text' && this.arrow && Buffer.compare(Buffer.from(p.bytes), Buffer.from(this.arrow)) === 0);
    if (parts.length === 3 && parts[0].kind === 'text' && parts[1].kind === 'hole' && parts[2].kind === 'text') this.pairs.push([parts[0].bytes, parts[2].bytes]);
    return key;
  }
  quoted(a, e) { if (e - a < 2 || this.t[a] !== this.t[e - 1]) return false; return this.pairs.some(([o, c]) => o.length === 1 && c.length === 1 && o[0] === this.t[a] && c[0] === this.t[a]); }
  past(a, e) { for (const [o, c] of this.pairs) if (o.length === 1 && c.length === 1 && o[0] === c[0] && this.t[a] === o[0]) { let r = a + 1; while (r < e && this.t[r] !== o[0]) r++; return r + 1; } return a + 1; }
  add(key, node) { this.keys.push(key); const k = this.keys.length - 1; node.keys.push(k); return k; }
}
// Running: a statement read by a rule runs its body, its holes bound (a statement that is a bound hole's name runs what the
// hole took, where it was taken); a definition's head or body that is a bound hole's name in brackets is what it took.
Engine.prototype.bound = function (a, e, frame) {
  const s = this.text(a, e).trim(); const [open, close] = this.brackets.map((b) => Buffer.from(b).toString());
  const name = s.startsWith(open) && s.endsWith(close) ? s.slice(open.length, s.length - close.length) : null;
  for (let f = frame; f; f = f.parent) if (name !== null && f.binds.has(name)) { const b = f.binds.get(name); return this.bound(b.a, b.e, b.frame) ?? b; }
  return null;
};
Engine.prototype.named = function (a, e, frame) {
  const s = this.text(a, e).trim();
  for (let f = frame; f; f = f.parent) if (f.binds.has(s)) return f.binds.get(s);
  return null;
};
Engine.prototype.run = function (base, a, e, node, frame, caller, depth = 0, excl = null) {
  let value = caller; const at = { node };
  if (depth > 60) { this.log.push({ deep: true }); return value; }
  while (a < e) {
    while (a < e && white(this.t[a])) a++; if (a >= e) break;
    if (this.t[a] === 47 && this.t[a + 1] === 47) { while (a < e && this.t[a] !== 10) a++; continue; }
    const before = this.keys.length;
    let r = this.read(base, a, e, at.node, excl);
    // (a body's statement the rules before it do not read: read again with the rules its scope gained since, never its own)
    if (r.k < 0 && excl) r = this.read(base, a, e, at.node, [excl[0], excl[0] + 1]);
    const end = r.end; this.onRead?.(a, end, r, depth);
    if (r.k < 0) { const c = this.chain(base, a, r.end, at.node, excl); if (c) { this.onRead?.(a, r.end, c.rest, depth); const was = this.made; this.made = null; const v = this.run(base, a, c.q, at.node, frame, caller, depth + 1, excl); const made = this.made; this.made = was ?? made; const on = v && v.keys ? v : (made ?? at.node);
      value = this.apply(c.rest, base, c.q, r.end, { node: on }, frame, on, depth, { this: [a, c.q] }); this.onStatement?.(a, r.end, c.rest, depth); if (this.keys.length > before) this.retry(base, at.node, before); a = r.end; continue; } }
    const plain = r.k < 0 || this.keys[r.k].kind === 'rule' ? this.named(a, end, frame) : null;
    const ref = plain ?? (r.k < 0 || this.keys[r.k].kind === 'rule' ? this.bound(a, end, frame) : null);
    // (what a hole took is read in the node current now: by name its value, run once; in brackets the code, run again)
    if (plain) { if (!('value' in plain)) { const was = this.made; this.made = null; plain.value = this.run(base, plain.a, plain.e, at.node, plain.frame, caller, depth + 1); plain.made = this.made; this.made = was ?? plain.made; }
      else if (plain.made) this.made ??= plain.made;
      value = plain.value; }
    else if (ref) value = this.run(base, ref.a, ref.e, at.node, ref.frame, caller, depth + 1);
    else if (r.k >= 0) value = this.apply(r, base, a, end, at, frame, caller, depth);
    // (a statement nothing reads is read again when its node gains a rule that could read it)
    else (at.node.pending ??= []).push({ a, end, frame, caller, depth, excl });
    this.onStatement?.(a, end, r, depth);
    if (this.keys.length > before) this.retry(base, at.node, before);
    a = end;
  }
  return value;
};
Engine.prototype.apply = function (r, base, a, end, at, frame, caller, depth, extra = null) {
  const node = at.node;
  const key = this.keys[r.k], holes = key.parts.map((p, i) => [p, r.cap[i]]).filter(([p, c]) => p.kind !== 'text' && p.kind !== 'space' && c);
  if (key.kind === 'creator' || key.kind === 'definer') {
    let [la, le] = holes[0][1], [ra, re] = holes[holes.length - 1][1];
    const lb = this.bound(la, le, frame), rb = this.bound(ra, re, frame);
    let bodyFrame = frame;
    if (lb) [la, le] = [lb.a, lb.e];
    if (rb) { [ra, re] = [rb.a, rb.e]; bodyFrame = rb.frame; }
    // (a head with parameters, `name (p) => body`, is a method: `name` given the closure `(p) => body` makes)
    if (key.kind === 'definer') { const m = this.method(la, le, ra, re, at, frame, caller, depth); if (m) return caller; }
    // (a body in the language's brackets is what is between them)
    { const [o, c] = this.brackets; let b = ra, z = re; while (b < z && white(this.t[b])) b++; while (z > b && white(this.t[z - 1])) z--;
      if (z - b >= o.length + c.length && this.same(b, o) && this.same(z - c.length, c)) { const f = this.frame(); let q = b; do q = this.step(q, f, z); while (q < z && f.total > 0); if (q === z) [ra, re] = [b + o.length, z - c.length]; } }
    const k = this.add(this.define(la, le, key.kind === 'creator' ? 'definer' : 'rule', [ra, re]), node);
    this.keys[k].frame = bodyFrame; this.onDefine?.(k, node, depth);
    return caller;
  }
  if (key.kind === 'given') {
    const [ga, ge] = holes[holes.length - 1][1]; const g = this.text(ga, ge);
    // (a node made in the one current, read in from here on)
    if (g.startsWith('.')) { at.node = { keys: [], in: node, of: caller }; this.nodes.push(at.node); this.made ??= at.node; return at.node; }
    if (g.startsWith('&')) return caller;
    const m = g.match(/^style\s+/);
    if (m) { let xa = ga + Buffer.byteLength(m[0]), xe = ge;
      // (the style: one word or one pair, then what it styles)
      { const f = this.frame(); do xa = this.step(xa, f, xe); while (xa < xe && (f.total > 0 || !white(this.t[xa]))); while (xa < xe && white(this.t[xa])) xa++; }
      // (a member written: its receiver run, the write (a style) left)
      const f = this.frame(); for (let q = xa; q < xe;) { if (f.total === 0 && this.t[q] === 46 && q > xa && this.text(q, xe).match(/^\.\w+\s*=/)) { xe = q; break; } q = this.step(q, f, xe); }
      return this.run(base, xa, xe, node, frame, caller, depth + 1); }
    return caller;
  }
  if (key.kind === 'stand-in') { const [xa, xe] = r.cap[0]; return this.run(base, xa, xe, node, frame, caller, depth + 1); }
  if (!key.body) return key.value ?? caller;
  const binds = new Map(); key.parts.forEach((p, i) => { if (p.kind === 'hole' && r.cap[i]) binds.set(p.name, { a: r.cap[i][0], e: r.cap[i][1], frame }); });
  if (extra) for (const [n, [xa, xe]] of Object.entries(extra)) if (!binds.has(n)) binds.set(n, { a: xa, e: xe, frame });
  // (its body read in the node it is applied in, with the rules before it: a rule never reads itself)
  return this.run(base, key.body[0], key.body[1], node, { binds, parent: key.frame }, caller, depth + 1, [r.k, this.keys.length]);
};
// the header: `!language`, the brackets, the rule that makes rules; the given keys first
Engine.prototype.language = function (base, e, given) {
  const t = this.t; let p = base;
  while (!white(t[p])) p++; while (white(t[p])) p++; const o = p; while (!white(t[p])) p++; const open = t.slice(o, p); p++; const c = p; while (!white(t[p])) p++; const close = t.slice(c, p);
  this.brackets = [open, close]; this.pairs.push([open, close]);
  while (white(t[p])) p++; const cs = p; while (!(t[p] === 10 && t[p + 1] === 10)) p++;
  const scope = { keys: [], in: null }; for (const g of given) this.add(g, scope);
  const d0 = this.define(cs, p, 'header', null); this.arrow = d0.parts.find((x) => x.kind === 'text').bytes;
  const rc = this.define(cs, p, 'creator', null); rc.parts[rc.parts.findIndex((x) => x.kind === 'hole')] = { kind: 'sub', key: d0 }; this.add(rc, scope);
  return { scope, start: p + 2 };
};
// (the seed's stand-ins for definitions (Selfhosting §6), until the language defines them: `x given (v)` runs x)
const standIn = (word) => ({ kind: 'stand-in', head: '{x} ' + word + ' {y}', parts: [{ kind: 'hole', name: 'x' }, { kind: 'space' }, { kind: 'text', bytes: Array.from(Buffer.from(word)) }, { kind: 'space' }, { kind: 'hole', name: 'y' }] });
export const given = () => [standIn('given'), { kind: 'given', head: 'external', parts: [{ kind: 'text', bytes: Array.from(Buffer.from('external')) }, { kind: 'space' }, { kind: 'hole', name: 'rule' }, { kind: 'hole', name: 'args' }] }];

// (could: the rule's texts all written in the statement, in order; a rule of holes only always could)
Engine.prototype.could = function (key, a, e) {
  let q = a;
  for (const p of key.parts) if (p.kind === 'text') { let f = -1; for (let r = q; r + p.bytes.length <= e; r++) if (this.same(r, p.bytes)) { f = r; break; } if (f < 0) return false; q = f + p.bytes.length; }
  return true;
};
Engine.prototype.retry = function (base, node, from) {
  for (let n = node; n; n = n.in) {
    if (!n.pending?.length) continue;
    const fresh = []; for (let k = from; k < this.keys.length; k++) if (n.keys.includes(k)) fresh.push(k);
    if (!fresh.length) continue;
    const left = [];
    for (const st of n.pending) {
      if (!fresh.some((k) => this.could(this.keys[k], st.a, st.end))) { left.push(st); continue; }
      const r = this.read(base, st.a, st.end, n, st.excl);
      if (r.k < 0) { left.push(st); continue; }
      this.onRetry?.(st, r);
      this.apply(r, base, st.a, r.end, { node: n }, st.frame, st.caller, st.depth);
    }
    n.pending = left;
  }
};

// (a type a hole is written with: the node its rule's value makes, once; what one of that node's rules reads whole)
Engine.prototype.typeNode = function (name) {
  this.types ??= new Map(); if (this.types.has(name)) return this.types.get(name);
  this.types.set(name, null);
  for (let n = this.reading; n; n = n.in) for (const k of n.keys) { const key = this.keys[k];
    if (key.kind === 'rule' && key.head === name) {
      const was = this.made; this.made = null;
      let v = null; try { v = this.run(0, key.body[0], key.body[1], n, { binds: new Map(), parent: key.frame }, 0, 1, [k, k + 1]); } catch {}
      const made = this.made ?? (v && v.keys ? v : null); this.made = was; this.types.set(name, made); return made;
    } }
  return null;
};
Engine.prototype.reads = function (node, a, e) {
  for (const k of node.keys) if (this.match(this.keys[k], 0, a, e, [], 0)) return true;
  return false;
};

Engine.prototype.method = function (la, le, ra, re, at, frame, caller, depth) {
  let q = la; while (q < le && word(this.t[q])) q++; const nameEnd = q; if (nameEnd === la) return false;
  while (q < le && this.t[q] === 32) q++;
  // (its parameters in a pair: not the language's own brackets (a hole), not a quote)
  const eq = (x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)) === 0;
  const pair = this.pairs.find(([o, c]) => q + o.length <= le && this.same(q, o) && !eq(o, c) && !eq(o, this.brackets[0]));
  if (!pair) return false;
  const f = this.frame(); let z = q; do z = this.step(z, f, le); while (z < le && f.total > 0); if (z !== le) return false;
  // (its parameters names, not holes: a head with a hole in its brackets is a rule's)
  for (let r = q; r + this.brackets[0].length <= le; r++) if (this.same(r, this.brackets[0])) return false;
  // (the closure, written out after the text: `(p) => body`, read where the method is written)
  const at0 = this.t.length, arrow = this.arrow;
  this.t.push(...this.t.slice(q, le), 32, ...arrow, 32, ...this.t.slice(ra, re));
  const r = this.read(0, at0, this.t.length, at.node, null);
  if (r.k < 0) { this.t.length = at0; return false; }
  const was = this.made; this.made = null; this.closing = true;
  this.apply(r, 0, at0, r.end, { node: at.node }, frame, caller, depth + 1);
  const made = this.made; this.made = was; this.closing = false;
  const key = { kind: 'rule', parts: [{ kind: 'text', bytes: this.t.slice(la, nameEnd) }], head: this.text(la, nameEnd), body: null, value: made };
  this.add(key, at.node); this.onMethod?.(made, at.node);
  return true;
};

// (a statement nothing reads whole: a part of it read whole, then the rest read on what it answers, the shortest rest; a
// method's head, led by `{this}`, read there too)
Engine.prototype.chain = function (base, a, e, node, excl) {
  const f = this.frame(); const qs = []; for (let q = a; q < e;) { q = this.step(q, f, e); if (f.total === 0 && q < e && !white(this.t[q]) && !white(this.t[q - 1])) qs.push(q); }
  for (let i = qs.length - 1; i >= 0; i--) { const q = qs[i];
    for (let n = node; n; n = n.in) { let best = -1, cap = null;
      for (const k of n.keys) { if (excl && k >= excl[0] && k < excl[1]) continue; const key = this.keys[k]; const p0 = key.parts[0]; const lead = p0.kind === 'hole' && p0.name === 'this';
        const parts = lead ? key.parts.slice(1) : key.parts; if (!parts.length) continue; const c = []; if (this.match({ ...key, parts }, 0, q, e, c, 0)) { if (best < 0 || this.rank(k) >= this.rank(best)) { best = k; cap = lead ? [null, ...c] : c; } } }
      if (best >= 0) { const p = this.read(base, a, q, node, excl); if (p.k >= 0 && p.end >= q) return { q, rest: { k: best, cap, end: e } }; }
    } }
  return null;
};
