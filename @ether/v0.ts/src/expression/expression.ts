// The host of `{expression: dynamically Expression} => expression`: Ray vertices, text, and the walk. It knows no syntax. The
// first statement says how equivalences are added:
//   {pattern} => {functionality} =>
//     Expression |= pattern => functionality
// from it the host learns the capture brackets, the definer, the space, the statement end, the indentation that continues a
// statement, and the type that grows (R0.1). In a capture, the first word names it and what follows it reads the span
// (`{x Number}`: the span as `Number` reads it). Everything else is equivalences the language adds, each a rewrite of the ones
// before it. What balances in a capture is what the language reads as `open {x} close`; a name ends where something the
// language reads on from a value starts. The host's own language is at its location, `@js`.

import { writeSync } from 'fs';
// EXPR_TRACE: each statement read at the top, as it starts
const TRACE = process.env.EXPR_TRACE;
export type Text = { name: string; s: string };
const NONE: Eq[] = [];
// A vertex: its members, what it continues into (`outer`: a frame its enclosing one, an instance its class), the equivalences
// added at it (its Expression). A frame (`scope`) knows the frame that applied it (`caller`) and the value it was applied on
// (`self`).
export class Ray {
  // (made when a member is first set: most frames hold nothing)
  private m_?: Map<string, unknown>;
  get m(): Map<string, unknown> { return this.m_ ??= new Map(); }
  has(k: string): boolean { return this.m_ !== undefined && this.m_.has(k); }
  get size(): number { return this.m_?.size ?? 0; }
  eqs: Eq[] = NONE;
  // (a context the host reads text with: what it reads a span as, or undefined)
  test?: (s: string) => unknown;
  scope = false; caller?: Ray; self?: unknown;
  // (a frame of an equivalence applied: which, and whether to a statement)
  rule?: Eq; statement = false;
  // (a frame of an equivalence applied on a value: where that value was read; of its captures read as values, where each was)
  place?: Place; places?: Map<string, Place>;
  // (a definition written again is read in a frame of its own, and added where it was written)
  into?: Ray;
  // (code read into a value sees, after the value's, where it was written)
  sees?: Ray;
  // (a frame code is read in, inside a value: where the code was written; what it captures is read there)
  written?: Ray;
  // (the walk over contexts it was last reached in)
  seen = 0;
  constructor(public outer?: Ray) {}
}
// Code: a span of a text, walked in `ctx` from the equivalence `floor` on.
export class Code {
  // (`word`: a word as written, read by a context of nothing: what it is, not what it names; `statement`: read as a statement,
  // not as a value)
  word = false; statement = false;
  // (a word handed through a capture: read past the frame holding that capture, which would name it again)
  past?: Ray;
  constructor(public text: Text, public b: number, public e: number, public ctx: Ray, public floor = 0) {}
  get s() { return this.text.s.slice(this.b, this.e); }
}
// A piece of a pattern: a literal, or a capture (named; `reader`: what reads its span, code read where it was written).
export type Piece = { lit: string } | { cap: string; reader?: Code };
// An equivalence: its pattern, its functionality (code, read where it is applied; or the host's), where it was added, when.
export type Eq = { pieces: Piece[]; body: Code; ctx: Ray; order: number; seq: number; key: string; value?: boolean; pairs: number; busy?: number; native?: (F: Ray) => unknown; js?: (F: Ray) => unknown };
export type Diagnostic = { message: string; at: { text: Text; b: number; e: number } };
type Learned = { open: string; close: string; space: string; definer: string; end: string; indent: string; type: string; add: string };
type Cap = { name: string; b: number; e: number; floor: number; reader?: Code; block?: boolean };
// What reading a span gave: an equivalence applied to captures (read on the value of `on`, or on `self`), or a name.
type Place = { at: Ray; here: Ray; word: string; text?: Text; b?: number; e?: number };
type Read = { eq?: Eq; name?: boolean; caps: Cap[]; on?: Read; self?: unknown; b: number; e: number; near?: number; from?: number };

export class Host {
  learned!: Learned;
  global = new Ray();
  // what the type that grows names: the Expression of the context a span is walked in
  expression = new Ray();
  base?: Ray;
  // the interpreter's nothing (`js.ray`), and the classes it maps its own kinds of value to
  none?: Ray; kinds = new Map<string, Ray>();
  // (a kind named before its class is declared: the class, once it is)
  kind(k: string): Ray | undefined { const v = this.kinds.get(k); if (v instanceof Code) { const r = this.walk(v); if (r instanceof Ray) { this.kinds.set(k, r); return r; } return undefined; } return v; }
  order = 0;
  version = 0;
  diagnostics: Diagnostic[] = [];
  output: (line: string) => void = line => console.log(line);
  // equivalences read on a value (added at a value, not a frame): kept by their first character
  sends = new Map<string, Eq[]>();
  // the literal read after a value or a leading capture, by its first character: where a name or an operand ends
  infix = new Map<string, { lit: string; order: number; eq: Eq; from: number }[]>();
  // (those written as a word and a space, `or `, by the word: read only after a space)
  words = new Map<string, { lit: string; order: number; eq: Eq; from: number }[]>();
  // what the language reads as `open {x} close`: these balance in a capture (`open === close`: nothing inside is read)
  pairs = new Map<string, string>(); quotes = new Set<string>(); closers = new Set<string>();
  // the order each head of an operation on values was first declared in
  heads = new Map<string, number>();
  constructor() { this.global.scope = true; }

  // (the same said again about the same place is said once)
  said = new Set<string>();
  // what was said since then, unsaid
  unsay(from: number) { for (const x of this.diagnostics.splice(from)) this.said.delete(this.key(x.message, x.at.text, x.at.b, x.at.e)); }
  key(message: string, text: Text, b: number, e: number): string { return `${text.name}\0${b}\0${e}\0${message}`; }
  say(message: string, text: Text, b: number, e: number) { const k = this.key(message, text, b, e); if (this.said.has(k)) return; this.said.add(k); this.diagnostics.push({ message, at: { text, b, e } }); }
  blank(c: string | undefined) { return c === this.learned.space || c === this.learned.end; }

  // ---------------------------------------------------------------- R0.1: the first statement, read by what it says about itself
  // The head's two captures are words of the body that the head wraps in one pair of characters; the literal between them, met
  // again after the head, is the definer; the body is on the next line, indented; before its captures, the type that grows and
  // the word that adds to it; what follows the body is the statement end.
  axiom(text: Text): number {
    const s = text.s, open = s[0];
    for (let k = 2; k < s.length; k++) {
      const close = s[k], a = s.slice(1, k);
      if (a.includes(open) || s.indexOf(a, k + 1) < 0) continue;
      const o2 = s.indexOf(open, k), c2 = s.indexOf(close, o2); if (o2 < 0 || c2 < 0) continue;
      const b = s.slice(o2 + 1, c2), between = s.slice(k + 1, o2), definer = between.trim(), space = between[0];
      if (!definer || between[between.length - 1] !== space) continue;
      const after = s.indexOf(definer, c2 + 1), first = s.indexOf(a, after), second = s.indexOf(b, first + a.length);
      if (after < 0 || first < 0 || second < 0 || s.slice(c2 + 1, after).trim() !== '') continue;
      const end = s[after + definer.length];
      let i = after + definer.length + end.length, indent = ''; while (s[i] === space) indent += s[i++];
      const lead = s.slice(i, first).split(space).filter(w => w.length > 0);
      if (indent.length === 0 || lead.length !== 2 || s.slice(first + a.length, second).trim() !== definer) continue;
      const stop = second + b.length;
      this.learned = { open, close, space, definer, end, indent, type: lead[0], add: lead[1] };
      // (its brackets balance, as they do around its own captures)
      this.pairs.set(open, close); this.closers.add(close);
      this.global.m.set(lead[0], this.expression);
      const eq = this.add(this.global, this.pieces(s.slice(0, c2 + 1), this.global), new Code(text, i, stop, this.global));
      // (its functionality is what it says: the pattern and the functionality given to it, added to the Expression it is walked in)
      this.functionality = b; this.definer = eq;
      eq.native = F => this.defined(F.m.get(a) as Code, F.m.get(b) as Code, F.caller!, F.statement);
      return stop;
    }
    throw new Error('the first statement does not say how equivalences are added');
  }
  // A pattern and functionality given to the definer, in the frame `at` they were written in. A word of the pattern that names a
  // capture of that frame stands for what it captured, as `pattern` does in the first statement's own body; a functionality that
  // is one such word is that code. A pattern that stood for something is a definition written again: walked where what it stood
  // for was written (what reads heads reads it again), its functionality where it was written.
  // Read as a statement, it is added where it is read; read as a value, it is that equivalence alone (a closure). Either way its
  // value is the equivalence, a vertex it is applied on.
  defined(p: Code, f: Code, at: Ray, statement = true): unknown {
    const { open, close, space, definer } = this.learned;
    const caps = this.captures(at), held = (w: string) => { const c = caps.get(w); return c ? this.written(c) : undefined; };
    // (a functionality naming a value: that value; one written by the rule, its words naming what it captured standing for it)
    const w = f.s.trim(), body = this.unblocked(held(w) ?? (at.has(w) ? new Value(at.m.get(w), f) : this.writer(at, f) ? this.substituted(f, caps) : f));
    // (a pattern handed on, written elsewhere, stands for itself)
    let head = p.s.trim(), stood = p.ctx !== at && p.ctx !== at.into;
    if (held(head)) { head = held(head)!.s.trim(); stood = true; }
    else {
      let out = '', from = 0;
      // (a capture's name also ends where, in the head of the rule that captured it, a capture is followed by a literal)
      const after = new Set<string>(); for (let n: Ray | undefined = at; n; n = n.caller) if (n.rule) { n.rule.pieces.forEach((x, j, ps) => { const y = ps[j + 1]; if (!('lit' in x) && y && 'lit' in y) after.add(y.lit[0]); }); break; }
      const edge = (i: number) => this.edge(head, i) || after.has(head[i]);
      for (let i = 0; i < head.length; i++) {
        if (!edge(i - 1)) continue;
        for (const [k, c] of caps) if (head.startsWith(k, i) && edge(i + k.length)) { out += head.slice(from, i) + this.written(c).s; from = i + k.length; i = from - 1; stood = true; break; }
      }
      head = out + head.slice(from);
    }
    if (!stood) {
      const into = statement ? at.into ?? at : new Ray(at);
      // (read again into what continues into a class that has it, from the same text: that one)
      const bc = body instanceof Value ? body.code : body;
      if (statement && !into.scope) for (let n = into.outer; n && !n.scope; n = n.outer) { const was = n.eqs.find(x => x.body.text === bc.text && x.body.b === bc.b && x.body.e === bc.e && x.body.ctx.outer === bc.ctx.outer); if (was) return this.held_as(was); }
      // (a closure is given what it reads: a pattern of one word is what it is given, named)
      let pieces = this.pieces(head, at); const lead = p.b + p.s.indexOf(head);
      if (!statement && pieces.length === 1 && 'lit' in pieces[0] && this.name_end(p.text, lead, p.e) === lead + head.length) pieces = [{ cap: head }];
      const eq = this.add(into, pieces, body); return statement ? this.held_as(eq) : into;
    }
    // (written by a rule: where the rule was applied, or into what is read into)
    const where = at.into ?? (at.caller ? at.caller.into ?? at.caller : at);
    const T = new Ray(where); T.scope = true; T.into = where; T.sees = this.global; T.m.set(this.functionality, body instanceof Value ? body.value : body);
    const said = head + space + definer + space + this.functionality;
    let text = this.rewritten.get(said); if (!text) this.rewritten.set(said, text = { name: p.text.name, s: said });
    // (what a rule led by a literal wrote starts as it does: not read by it again)
    const by = this.writer(at, p), r = this.parse(text, 0, text.s.length, T, 0, by && 'lit' in by.pieces[0] ? new Set([by]) : undefined);
    if (r === undefined || r.e < text.s.length) { this.say(`Unread \`${said.slice(0, 60)}\`.`, p.text, p.b, p.e); return undefined; }
    return this.run(r, statement ? stated(new Code(text, 0, text.s.length, T)) : new Code(text, 0, text.s.length, T));
  }
  // (a functionality written as one block: what is in it)
  unblocked<T>(f: T): T {
    if (!(f instanceof Code)) return f;
    const s = f.text.s; let b = f.b, e = f.e; while (b < e && this.blank(s[b])) b++; while (e > b && this.blank(s[e - 1])) e--;
    if (s[b] !== this.learned.open || s[e - 1] !== this.learned.close || this.scan(f.text, b, e, () => {}) !== e) return f;
    let depth = 0; for (let i = b; i < e; i++) { if (s[i] === this.learned.open) depth++; else if (s[i] === this.learned.close && --depth === 0 && i < e - 1) return f; }
    return new Code(f.text, b + 1, e - 1, f.ctx, f.floor) as T;
  }
  // Code written by a rule, each word naming a capture standing for what it captured (its further lines as deep under that word's
  // line as they were under their own).
  substituted(f: Code, caps: Map<string, Code>): Code {
    const s = f.s, { end, space } = this.learned, indent = (t: string, i: number) => { const l = t.lastIndexOf(end, i - 1) + 1; let k = l; while (t[k] === space) k++; return k - l; };
    let out = '', from = 0, stood: Code | undefined;
    for (let i = 0; i < s.length; i++) {
      if (!this.edge(s, i - 1)) continue;
      for (const [k, c] of caps) if (s.startsWith(k, i) && this.edge(s, i + k.length)) {
        const x = stood = this.written(c), shift = indent(s, i) - indent(x.text.s, x.b), lines = x.s.split(end);
        out += s.slice(from, i) + lines.map((l, j) => j === 0 ? l : shift >= 0 ? space.repeat(shift) + l : l.slice(Math.min(-shift, this.depth(l, 0)))).join(end);
        from = i + k.length; i = from - 1; break;
      }
    }
    if (!stood) return f;
    // (read where what it captured was written)
    const col = f.b - (f.text.s.lastIndexOf(end, f.b - 1) + 1), t = space.repeat(col) + out + s.slice(from);
    return new Code({ name: f.text.name, s: t }, col, t.length, stood.ctx);
  }
  // an equivalence as a value: a vertex that has it
  held_as(eq: Eq): Ray { const v = new Ray(); v.eqs = [eq]; return v; }
  // the rule whose functionality a code was written in: found from the frame it is read in, through those that applied it
  writer(at: Ray, c: Code): Eq | undefined {
    const seen = new Set<Ray>();
    const go = (n: Ray | undefined): Eq | undefined => {
      for (; n && !seen.has(n); n = n.outer) { seen.add(n); const b = n.rule?.body; if (b && b.text === c.text && b.b <= c.b && c.e <= b.e) return n.rule; const x = go(n.caller) ?? go(n.sees); if (x) return x; }
      return undefined;
    };
    return go(at);
  }
  functionality = '';
  definer?: Eq;
  // the captures a frame reaches: those of the frames of rules applied, nearest first
  captures(at: Ray): Map<string, Code> {
    const out = new Map<string, Code>();
    for (const n of this.reach(at)) { if (!n.rule && n !== at) continue; if (n.size) for (const [k, c] of n.m) if (!out.has(k) && c instanceof Code) out.set(k, c); }
    return out;
  }
  // whether a pattern names a capture held in a frame (a word of it, between edges)
  names_held(head: string, at: Ray): boolean {
    for (const [k, c] of this.captures(at)) if (c instanceof Code) for (let i = head.indexOf(k); i >= 0; i = head.indexOf(k, i + 1)) if (this.edge(head, i - 1) && this.edge(head, i + k.length)) return true;
    return false;
  }
  edge(head: string, i: number): boolean { const { open, close } = this.learned; return i < 0 || i >= head.length || head[i] === open || head[i] === close || this.blank(head[i]) || [...this.pairs].some(([o, c]) => head.startsWith(o, i) || head.startsWith(c, i)); }
  rewritten = new Map<string, Text>();
  // Code followed back to where it was written: code that is one word naming code held where it is read is that code.
  written(c: Code): Code {
    for (let k = 0; k < 64 && !c.word; k++) {
      const w = c.s.trim(); let held: unknown;
      for (const n of this.reach(c.ctx)) if (n.has(w)) { held = n.m.get(w); break; }
      if (!(held instanceof Code) || held === c) return c;
      c = held;
    }
    return c;
  }
  // The pieces of a head: a capture is the brackets around its name and what reads it (`{name reader}`); brackets around brackets
  // are literal.
  pieces(head: string, ctx: Ray): Piece[] {
    const { open, close, space } = this.learned, out: Piece[] = [];
    let lit = '';
    for (let i = 0; i < head.length;) {
      if (head[i] === open) {
        // (to its own close: what reads a capture may hold brackets)
        let j = -1; for (let k = i + 1, depth = 1; k < head.length; k++) { if (head[k] === open) depth++; else if (head[k] === close && --depth === 0) { j = k; break; } }
        const inner = j < 0 ? '' : head.slice(i + 1, j);
        // (brackets around nothing write nothing; around spaces, those spaces)
        if (j === i + 1) { i = j + 1; continue; }
        if (j > i + 1 && inner.trim() === '' && !inner.includes(this.learned.end)) { lit += inner; i = j + 1; continue; }
        const t = inner.trim(), w = t.indexOf(space), name = w < 0 ? t : t.slice(0, w), reader = w < 0 ? '' : t.slice(w + 1).trim();
        // (a capture: a name, then what reads it; one whose name holds brackets, or read by a bracket, is brackets written around it)
        if (j > i + 1 && t !== '' && !name.includes(open) && !name.includes(close) && reader[0] !== open) {
          if (lit) { out.push({ lit }); lit = ''; }
          out.push({ cap: name, reader: reader ? new Code({ name: 'reader', s: reader }, 0, reader.length, ctx) : undefined });
          i = j + 1; continue;
        }
      }
      lit += head[i++];
    }
    if (lit) out.push({ lit });
    return out;
  }

  // ---------------------------------------------------------------- statements: a line, and the deeper lines after it
  depth(s: string, at: number): number { let i = at; while (s[i] === this.learned.space) i++; return i - at; }
  closes(s: string, at: number): boolean { return this.closers.has(s[at]); }
  // Where the statement starting at `p` (on a line indented by `base`) ends: at the line end before a line no deeper than it
  // that does not close a pair (empty lines go on).
  stop(text: Text, p: number, limit: number, base: number): number {
    const s = text.s, { end, indent } = this.learned;
    for (let i = p; ;) {
      const e = s.indexOf(end, i);
      if (e < 0 || e >= limit) return limit;
      let n = e + end.length; while (n < limit && s.startsWith(end, n + this.depth(s, n))) n += this.depth(s, n) + end.length;
      if (n >= limit) return e;
      const d = this.depth(s, n);
      if (d >= base + indent.length || (d === base && (this.closes(s, n + d) || this.leads(s, n + d)))) { i = n; continue; }
      return e;
    }
  }
  // the name a head starts with
  lead(pieces: Piece[]): string { const p = pieces[0]; if (!('lit' in p)) return ''; let i = 0; while (i < p.lit.length && !this.edge(p.lit, i) && !this.pairs.has(p.lit[i])) i++; return p.lit.slice(0, i); }
  // whether a line starts with what reads on from a value (and is not a definition): it goes on with the line above (G2.13)
  leads(s: string, at: number): boolean {
    const { end, definer, space } = this.learned, line = s.slice(at, s.indexOf(end, at) < 0 ? s.length : s.indexOf(end, at));
    if (line.includes(space + definer)) return false;
    const j = s.indexOf(space, at);
    for (const x of [...this.infix.get(s[at]) ?? [], ...this.infix.get(space) ?? [], ...(j > at ? this.words.get(s.slice(at, j)) ?? [] : [])]) { const l = x.lit.trimStart(); if (l.length > 0 && !this.bracket(l[0]) && s.startsWith(l, at) && !x.eq.ctx.scope && 'lit' in x.eq.pieces[0]) return true; }
    return false;
  }
  *statements(code: Code): Generator<[number, number]> {
    const s = code.text.s, { end } = this.learned;
    let p = code.b;
    while (p < code.e) {
      if (this.blank(s[p])) { p++; continue; }
      const line = s.lastIndexOf(end, p - 1) + end.length, base = this.depth(s, line) === p - line ? p - line : 0, e = this.stop(code.text, p, code.e, base);
      yield [p, e];
      p = e;
    }
  }

  // ---------------------------------------------------------------- equivalences: added to the Expression of a context
  add(ctx: Ray, pieces: Piece[], given: Code | Value): Eq {
    const key = pieces.map(p => 'lit' in p ? p.lit : this.learned.open + this.learned.close).join('');
    const body = given instanceof Value ? given.code : given;
    // (one that reads definitions reads heads: brackets there are a pattern's, not pairs)
    const heads = pieces.some(x => 'lit' in x && x.lit.includes(this.learned.definer));
    const eq: Eq = { pieces, body, ctx, order: this.order, seq: this.order++, key, pairs: heads ? 0 : Infinity };
    // (an operation on values binds as its head was first declared: what a class declares again keeps that place)
    if (!ctx.scope) { const first = this.heads.get(key); if (first === undefined) this.heads.set(key, eq.order); else eq.order = first; }
    // (a value under a name is a name: read where it is read, not a rule; declaring one changes no reading)
    if (given instanceof Value) { const v = given.value; eq.native = () => v; eq.value = true; }
    if (ctx.eqs === NONE) ctx.eqs = [];
    // (the same head again in the same place: it replaces the one before, and reads the same)
    // (overloads by what their captures are read by are not the same head)
    const readers = (ps: Piece[]) => ps.map(p => 'cap' in p && p.reader ? p.reader.s : '').join('\0');
    const was = ctx.eqs.findIndex(x => x.key === key && readers(x.pieces) === readers(pieces));
    if (was >= 0) { const old = ctx.eqs[was]; if (!(old.value && eq.value)) this.version++; old.body = eq.body; old.native = eq.native; old.js = undefined; old.pieces = eq.pieces; old.value = eq.value; if ('lit' in pieces[0]) this.declared.set(this.lead(pieces), eq.seq); return old; }
    ctx.eqs.push(eq); if (!eq.value) this.version++;
    if ('lit' in pieces[0]) this.declared.set(this.lead(pieces), eq.seq);
    const p0 = pieces[0], p1 = pieces[1];
    // (read on a value: added at one, taking something; one that takes nothing is a member, read in the value)
    // (a name and an opened bracket, `m(`, is a method's call: read in the value, after what reads members)
    const call = 'lit' in p0 && p0.lit.length > 1 && !p0.lit.includes(this.learned.space) && this.pairs.has(p0.lit[p0.lit.length - 1]);
    const operator = !ctx.scope && 'lit' in p0 && !call && (pieces.length > 1 || this.bracket(p0.lit[0]));
    if (operator) {
      const k = 'lit' in p0 ? p0.lit[0] : '';
      let list = this.sends.get(k); if (!list) this.sends.set(k, list = []);
      list.push(eq);
    }
    const after = operator && 'lit' in p0 ? p0.lit : p0 && !('lit' in p0) && p1 && 'lit' in p1 ? p1.lit : undefined;
    // (a definition is a whole statement: what reads one never reads on from inside another)
    if (after !== undefined && !heads) {
      const by = this.apart(after) ? this.words : this.infix, k = this.apart(after) ? after.slice(0, after.indexOf(this.learned.space)) : after[0];
      let list = by.get(k); if (!list) by.set(k, list = []); list.push({ lit: after, order: eq.order, eq, from: operator && 'lit' in p0 ? 0 : 1 });
    }
    // (`open {x} close` where statements are read, a character each: a pair that balances)
    if (ctx.scope && pieces.length === 3 && 'lit' in p0 && !('lit' in p1) && 'lit' in pieces[2] && p0.lit.length === 1 && pieces[2].lit.length === 1 && !this.blank(p0.lit)) { this.pairs.set(p0.lit, pieces[2].lit); if (p0.lit === pieces[2].lit) this.quotes.add(p0.lit); else this.closers.add(pieces[2].lit); }
    return eq;
  }

  // ---------------------------------------------------------------- the walk
  // A span read from `b`: the best of the readings of what starts there (an equivalence of the context, or a name), then what
  // reads on from the value it gives (an equivalence added at a value), each from the floor on.
  parse(text: Text, b: number, e: number, ctx: Ray, floor: number, not?: Set<Eq>): Read | undefined {
    const s = text.s; while (b < e && this.blank(s[b])) b++; while (e > b && this.blank(s[e - 1])) e--;
    if (b >= e) return undefined;
    let best: Read | undefined;
    // (each reading of what starts there, with what reads on from it)
    const consider = (r: Read | undefined) => { if (r) { r = this.on(r, text, e, ctx, floor, not); if (this.better(r, best)) best = r; } };
    // (what reads definitions is tried on a definition only: the definer written outside every bracket)
    let defines = false; this.scan(text, b, e, i => { if (this.literal(text, this.learned.space + this.learned.definer, i, e) >= 0) { defines = true; return false; } });
    let self: unknown, held = false, near = 0;
    const word = s.slice(b, this.name_end(text, b, e));
    for (const n of this.reach(ctx)) {
      near++;
      if (self === undefined && n.into && !n.into.scope && !n.rule) self = n.self ?? n.into;
      if (!n.scope && n !== this.base && self === undefined) self = n;
      for (let i = n.eqs.length - 1; i >= 0; i--) {
        const eq = n.eqs[i], p0 = eq.pieces[0];
        if (eq.value || not?.has(eq)) continue;
        // (a rule does not read the whole of its own functionality: that never ends)
        if (eq.body.text === text && this.whole(eq.body, b, e)) continue;
        if ((eq.pairs === 0 && !defines) || eq.busy) continue;
        // (a value's equivalence led by a bracket is a call on it: read after it, not where a statement starts)
        if (!n.scope && 'lit' in p0 && this.bracket(p0.lit[0])) continue;
        // (a name a nearer context holds hides a member of that name further out)
        if (held && eq.pieces.length === 1 && 'lit' in p0 && p0.lit === word) continue;
        // (one capture its reader reads, alone: what it reads, read at any precedence)
        const atom = eq.pieces.length === 1 && !('lit' in p0) && p0.reader !== undefined && n.scope;
        if ('lit' in p0 ? s[b] === p0.lit[0] && this.literal(text, p0.lit, b, e) >= 0 : eq.order >= floor || atom) { const r = this.match(eq, text, b, e, ctx, 0, b, []); if (r) { if (!n.scope) r.self = self; r.near = near; consider(r); } }
      }
      if (word && (n.has(word) || n.eqs.some(x => x.value && x.key === word))) held = true;
    }
    // a name: up to where something reads on
    const w = this.name_end(text, b, e); if (w > b) consider({ name: true, caps: [], b, e: w });
    return best;
  }
  // A reading with what reads on from its value, as far as it goes.
  on(best: Read, text: Text, e: number, ctx: Ray, floor: number, not?: Set<Eq>): Read {
    const s = text.s;
    // (a context that reaches neither the language's top nor the base reads no operators: a word is read there)
    let reaches = false; for (const n of this.reach(ctx)) if (n === this.global || n === this.base) { reaches = true; break; }
    if (!reaches) return best;
    while (best.e < e) {
      let on: Read | undefined, at = best.e;
      const spaced = this.blank(s[at]); while (at < e && this.blank(s[at])) at++;
      for (const list of [this.sends.get(s[at]), this.sends.get('')]) if (list) for (const eq of list) {
        if ((eq.order < floor && spaced) || not?.has(eq) || eq.busy) continue;
        if (!this.blank(s[at - 1]) && 'lit' in eq.pieces[0] && this.apart(eq.pieces[0].lit)) continue;
        const r = this.match(eq, text, at, e, ctx, 0, at, []);
        if (r && this.better(r, on)) on = r;
      }
      if (!on) break;
      on.on = best; on.from = on.b; on.b = best.b; best = on;
    }
    return best;
  }
  // The contexts a context reaches, nearest first: what it continues into; the base, once a value was passed; then where code
  // read into a value was written.
  // (each context once: marked with the walk it was reached in)
  epoch = 0;
  reach(ctx: Ray): Ray[] { const out: Ray[] = []; this.reach_(ctx, out, ++this.epoch); return out; }
  reach_(ctx: Ray, out: Ray[], epoch: number) {
    let valued = false, sees: Ray[] | undefined;
    // (a block read into a value reaches that value first, then where it was written)
    for (let n: Ray | undefined = ctx; n && n.seen !== epoch; n = n.outer) { n.seen = epoch; if (!n.scope || (n.into && !n.into.scope)) valued = true; out.push(n); if (n.sees && n.sees === n.into) this.reach_(n.sees, out, epoch); else if (n.sees) (sees ??= []).push(n.sees); }
    if (valued && this.base && this.base.seen !== epoch) { this.base.seen = epoch; out.push(this.base); }
    if (sees) for (const x of sees) this.reach_(x, out, epoch);
  }
  // Between two readings: the longer; an equivalence over a name; one equivalence over one read on from another; one led by a
  // literal over one led by a capture; the more
  // particular (where the two first differ, one has a literal and the other a capture); then of two with the same head the later
  // (it overrides), of two others the one declared first (what is declared first binds loosest).
  better(a: Read, b: Read | undefined): boolean {
    if (!b) return true;
    if (a.e !== b.e) return a.e > b.e;
    if (!a.eq || !b.eq) return !!a.eq;
    // (a definition, read whole, is one: what reads definitions before what reads its head)
    const da = a.eq.pairs === 0 && a.eq.pieces.some(x => 'lit' in x && x.lit.includes(this.learned.definer)), db = b.eq.pairs === 0 && b.eq.pieces.some(x => 'lit' in x && x.lit.includes(this.learned.definer));
    if (da !== db) return da;
    // (the nearer context binds first)
    if ((a.near ?? 0) !== (b.near ?? 0) && !a.on && !b.on) return (a.near ?? 0) < (b.near ?? 0);
    // (one equivalence reading the whole before a reading read on from another)
    if (!a.on !== !b.on) return !a.on;
    const la = 'lit' in a.eq.pieces[0], lb = 'lit' in b.eq.pieces[0];
    if (la !== lb) return la;
    // (the same head: the nearer, found first, binds)
    // (the same head in one context, read differently: the one declared first, as the rules of a level are written in order)
    if (a.eq.key === b.eq.key) return a.eq.ctx === b.eq.ctx && a.eq.seq < b.eq.seq;
    for (let i = a.b; i < a.e; i++) { const x = a.caps.some(c => i >= c.b && i < c.e), y = b.caps.some(c => i >= c.b && i < c.e); if (x !== y) return !x; }
    // (a capture left empty: less particular)
    const ea = a.caps.some(c => c.b === c.e), eb = b.caps.some(c => c.b === c.e);
    if (ea !== eb) return eb;
    return a.eq.order < b.eq.order;
  }
  // Where an equivalence reads from `at`: its literals exactly (a space also reads line ends and indentation); a capture enclosed
  // by literals up to where the next one is (the latest first, pairs balanced); one leading the head no further than what binds
  // looser; one ending it as far as an operand from its own equivalence on goes. A capture with a reader holds only what it reads.
  match(eq: Eq, text: Text, at: number, e: number, ctx: Ray, i: number, start: number, caps: Cap[]): Read | undefined {
    if (DEADLINE && performance.now() > DEADLINE) { writeSync(2, `deadline: matching ${eq.key.slice(0, 40)} on ${text.name}:${text.s.slice(0, at).split(this.learned.end).length} steps=${this.steps} settling=${this.settling} applying=${this.applying}\n`); process.exit(3); }
    if (i === eq.pieces.length) return { eq, caps: [...caps], b: start, e: at };
    const piece = eq.pieces[i];
    if ('lit' in piece) {
      // (a head, what is before the definer, is balanced)
      const n = this.literal(text, piece.lit, at, e); if (n < 0) return undefined;
      const d = piece.lit.indexOf(this.learned.definer);
      const head = d >= 0 ? text.s.indexOf(this.learned.definer, at + d - 1) : -1;
      if (d >= 0 && !('lit' in eq.pieces[0]) && !this.balanced(text, start, head)) return undefined;
      // (a statement whose first line ends with the definer has its head before that one)
      if (d >= 0) { const { end, definer } = this.learned, line = text.s.indexOf(end, start), last = line < 0 ? -1 : text.s.lastIndexOf(definer, line); if (line >= 0 && last >= 0 && last + definer.length === line && head !== last && line < e && this.balanced(text, start, last)) return undefined; }
      // (a head that has the definer in it defines what reads heads: only the first statement's definer reads it)
      if (d >= 0 && eq !== this.definer && text.s.slice(start, head).includes(this.learned.space + this.learned.definer + this.learned.space)) return undefined;
      return this.match(eq, text, n, e, ctx, i + 1, start, caps);
    }
    // (an operator's operands from its own equivalence on; a statement's, a bracket's, from the start)
    const next = eq.pieces[i + 1], floor = i === 0 || (next === undefined && !('lit' in eq.pieces[0] && eq.ctx.scope)) ? eq.order : 0;
    let ends: number[], bracketed = false;
    const prev = eq.pieces[i - 1];
    if (next === undefined) {
      // (one capture alone reads anything: only where a value's own equivalences read text, a closure's parameters, an enum's
      // members)
      // (one capture alone reads anything: only where that very value's own equivalences read text (a value read in, a level a
      // program runs by), not what continues into it)
      if (i === 0 && !(piece.reader && eq.ctx.scope) && (eq.ctx.scope || eq.pieces.length > 1 || !(ctx.sees === eq.ctx || (ctx.written && ctx.outer === eq.ctx)) || (this.deciding > 0 && !eq.ctx.scope))) return undefined;
      // (after the definer: the functionality, to the end; an operator read on a value reads one operand: the same operator after it reads on from what it gives)
      // (led by a literal, a statement: its last capture, the rest; an operator's, one operand)
      // (a reader's own rule, read in a value as its type: to the end, too)
      const statement = ('lit' in eq.pieces[0] && eq.ctx.scope) || (!('lit' in eq.pieces[0]) && !eq.ctx.scope);
      // (an operation hugging its value, written without a space: its operand ends at any operation written with one)
      const hugs = !eq.ctx.scope && 'lit' in eq.pieces[0] && !eq.pieces.some(x => 'lit' in x && x.lit.includes(this.learned.space));
      const atom = i === 0 && piece.reader !== undefined;
      const r = (prev && 'lit' in prev && prev.lit.includes(this.learned.definer)) || (statement && 'lit' in eq.pieces[0]) ? e : statement && !atom ? this.scan(text, at, e, () => {}, eq.pairs) : this.operand(text, at, e, hugs || atom ? Infinity : floor, ctx, eq.pairs, !eq.ctx.scope && 'lit' in eq.pieces[0]); ends = r > at && this.held(text, at, r) ? [r] : [];
      // (an atom: as far as an operand goes, else just the name there, `0` in `0..<n`)
      if (atom) { const w = this.name_end(text, at, e); if (w > at && w < r) ends.push(w); } }
    else {
      ends = this.ends(text, at, e, 'lit' in next ? next.lit : undefined, eq.pairs);
      // (next to a bracket, or a pair, a capture may hold nothing, or only spaces)
      bracketed = (next && 'lit' in next && this.opens(next.lit)) || (prev && 'lit' in prev && this.closed(prev.lit));
      if (bracketed && ('lit' in next ? this.literal(text, next.lit, at, e) >= 0 : true)) ends.push(at);
      // (one leading the head, the longest; one between two literals, the shortest)
      if (i === 0) { const o = this.operand(text, at, e, floor, ctx, eq.pairs); ends = ends.filter(n => n <= o); } else ends.reverse();
      // (a head ends at a definer that ends its line, the functionality below it, as the first statement's does; else at the first)
      if ('lit' in next && next.lit.includes(this.learned.definer)) {
        const { definer, end } = this.learned, at_end = (n: number) => { const d = text.s.indexOf(definer, n); return d >= 0 && text.s[d + definer.length] === end; };
        const up = [...ends].sort((x, y) => x - y);
        ends = [...up.filter(at_end).reverse(), ...up.filter(n => !at_end(n))];
      }
    }
    const fixed = this.fixed(piece.reader, eq);
    if (fixed === REJECT) return undefined;
    // (a literal written hugging the capture before it, `{value}?`, is read hugging it)
    const hugged = !!next && 'lit' in next && !this.blank(next.lit[0]) && !this.bracket(next.lit[0]) && !this.quotes.has(next.lit[0]);
    for (const n of ends) {
      if (n > at && !this.held(text, at, n) && !bracketed) continue;
      if (hugged && n > at && this.blank(text.s[n - 1])) continue;
      if (fixed && (n === at || !this.reads(fixed, text, at, n, eq))) continue;
      const block = !!prev && 'lit' in prev && prev.lit.endsWith(this.learned.open) && !!next && 'lit' in next && next.lit.startsWith(this.learned.close);
      caps.push({ name: piece.cap, b: at, e: n, floor, reader: piece.reader, block });
      const r = this.match(eq, text, n, e, ctx, i + 1, start, caps);
      caps.pop();
      if (r) return r;
    }
    return undefined;
  }
  // A reader decided where it was written: its value there (a context the span is read in), or REJECT when it is none; undefined
  // when it depends on the frame it is applied in (one of the rule's own captures, or what is computed from the frame, as `this`).
  fixed(reader: Code | undefined, eq?: Eq): Ray | typeof REJECT | undefined {
    if (!reader) return undefined;
    // (a context it was decided to be stays it; what was not yet decided is decided again once something was declared)
    const kept = this.readers.get(reader); if (kept && (kept.r instanceof Ray || kept.version === this.version || kept.at >= this.latest(reader))) return kept.r;
    // (while it is being decided, it reads nothing: a reader does not read itself)
    this.readers.set(reader, { version: this.version, at: this.order, r: REJECT });
    const r = this.fixed_(reader, eq); this.readers.set(reader, { version: this.version, at: this.order, r }); return r;
  }
  readers = new WeakMap<Code, { version: number; at: number; r: Ray | typeof REJECT | undefined }>();
  // (when each name was last declared)
  declared = new Map<string, number>();
  first(reader: Code): string { return reader.text.s.slice(reader.b, this.name_end(reader.text, reader.b, reader.e)).trim(); }
  // when any name a reader is written with was last declared
  latest(reader: Code): number {
    let words = this.words_of.get(reader);
    if (!words) { words = []; const s = reader.text.s; for (let i = reader.b; i < reader.e;) { if (this.blank(s[i])) { i++; continue; } const j = this.name_end(reader.text, i, reader.e); if (j > i) { words.push(s.slice(i, j)); i = j; } else i++; } this.words_of.set(reader, words); }
    let at = 0; for (const w of words) { const d = this.declared.get(w); if (d !== undefined && d > at) at = d; }
    return at;
  }
  words_of = new WeakMap<Code, string[]>();
  // whether a reader depends on the frame it is applied in: led by one of the rule's own captures, a name a rule's frame holds, or
  // what is computed from the frame (as `this`)
  dependent(reader: Code, eq?: Eq): boolean {
    const first = reader.text.s.slice(reader.b, this.name_end(reader.text, reader.b, reader.e)).trim();
    if (eq && eq.pieces.some(p => 'cap' in p && p.cap === first)) return true;
    for (const n of this.reach(eq?.body.ctx ?? reader.ctx)) { const x = n.eqs.find(y => y.key === first); if (x) return n.rule !== undefined || (!x.native && /\bF\b/.test(x.body.s)); if (n.has(first)) return n.rule !== undefined; }
    return false;
  }
  fixed_(reader: Code, eq?: Eq): Ray | typeof REJECT | undefined {
    if (this.dependent(reader, eq)) return undefined;
    const first = reader.text.s.slice(reader.b, this.name_end(reader.text, reader.b, reader.e)).trim();
    if (first === this.learned.type) return undefined;
    // (decided on the side: what it says, or leaves unresolved, is not said)
    // (deciding it is not reading the statement it is asked in)
    // (and what a value reads with one capture alone does not read it: it is a type where the rule was written)
    const said = this.diagnostics.length, unread = this.unread.size === 0 ? undefined : new Map(this.unread), steps = this.steps;
    this.deciding++; let r: unknown; try { r = this.walk(eq ? new Code(reader.text, reader.b, reader.e, eq.body.ctx) : reader); } finally { this.deciding--; }
    this.steps = steps;
    this.unsay(said); if (unread) this.unread = unread; else this.unread.clear();
    // (what reads nothing there yet reads nothing until something is declared)
    return r === this.expression ? undefined : r instanceof Ray ? r : REJECT;
  }
  // whether a reader reads a span whole (the parameters of a value, typed by a value that is not a scope, read any: what is read
  // where it was written, if it is one of it)
  reads(r: Ray, text: Text, b: number, e: number, eq: Eq): boolean {
    if (r.test) return r.test(text.s.slice(b, e).trim()) !== undefined;
    // (the parameters of a value's rule, or of a call, `f(a: T)`: values, decided where applied)
    if (!r.scope && (!eq.ctx.scope || this.calls(eq))) return true;
    const read = this.parse(text, b, e, r, 0); let end = e; while (end > b && this.blank(text.s[end - 1])) end--;
    if (r.scope) return !!read && read.e === end;
    if (this.patterns && this.fits(r, text.s.slice(b, end).trimStart())) return true;
    // (a value that is not a scope reads what its own equivalences, or names, read whole; anything else is read where it was
    // written, and is one of it or not: decided where it is applied, unless the span is a rule of its own)
    // (a rule where statements are read reads text by its types; only a value's own rules (its parameters, a level's) decide by the
    // value, where applied)
    return !!read && read.e === end && this.own(read, r, text);
  }
  // whether a reading is a value's own: a name it holds, or one of its equivalences (or its class's), not the base's
  own(read: Read, r: Ray, text: Text): boolean {
    if (read.name) { const word = text.s.slice(read.b, read.e); return this.reach(r).some(n => n.has(word)); }
    for (let x: Read | undefined = read; x; x = x.on) if (x.eq) { let mine = false; for (let n: Ray | undefined = r; n && !n.scope && n !== this.base; n = n.outer) if (x.eq.ctx === n) mine = true; if (!mine) return false; }
    return true;
  }
  // (a literal starting, or ending, with a bracket)
  bracket(c: string | undefined): boolean { if (c === undefined) return false; if (c === this.learned.open || c === this.learned.close) return true; for (const [o, k] of this.pairs) if (o === c || k === c) return true; return false; }
  opens(lit: string): boolean { return this.bracket(lit[0]); }
  closed(lit: string): boolean { return this.bracket(lit[lit.length - 1]); }
  held(text: Text, b: number, e: number): boolean { for (let i = b; i < e; i++) if (!this.blank(text.s[i])) return true; return false; }
  // A walk over a span keeping what pairs are open: `at` is called where none is (false stops it); where one closes that was not
  // opened, it stops.
  scan(text: Text, b: number, e: number, at: (i: number) => boolean | void, pairs = Infinity): number {
    const s = text.s, stack: string[] = [];
    for (let i = b; i < e; i++) {
      if (stack.length === 0 && at(i) === false) return i;
      if (pairs === 0) continue;
      const c = s[i], top = stack.length ? stack[stack.length - 1] : undefined;
      if (top !== undefined) { if (c === top) { stack.pop(); continue; } if (this.quotes.has(top)) continue; }
      const close = this.pairs.get(c);
      if (close !== undefined) { stack.push(close); continue; }
      if (this.closers.has(c)) return i;
    }
    return e;
  }
  // whether every pair opened in a span is closed in it
  balanced(text: Text, b: number, e: number): boolean {
    const s = text.s, stack: string[] = [];
    for (let i = b; i < e; i++) {
      const c = s[i], top = stack.length ? stack[stack.length - 1] : undefined;
      if (top !== undefined) { if (c === top) { stack.pop(); continue; } if (this.quotes.has(top)) continue; }
      const close = this.pairs.get(c);
      if (close !== undefined) { stack.push(close); continue; }
      if (this.closers.has(c)) return false;
    }
    return stack.length === 0;
  }
  // The places from `at` (before `e`) where no pair is open and `lit` is written (or the end, for none), latest first.
  ends(text: Text, at: number, e: number, lit: string | undefined, pairs?: number): number[] {
    const out: number[] = [];
    const stopped = this.scan(text, at, e, i => { if (i > at && (lit === undefined || this.literal(text, lit, i, e) >= 0)) out.push(i); }, pairs);
    if (lit === undefined && stopped === e) out.push(e);
    return out.reverse();
  }
  // Where a name from `at` ends: at a space, a pair, or a literal read on from a value.
  name_end(text: Text, at: number, e: number): number {
    const s = text.s;
    for (let i = at; i < e; i++) {
      if (this.blank(s[i]) || this.closes(s, i)) return i;
      if (this.pairs.has(s[i])) return i;
      if (i > at) for (const x of this.infix.get(s[i]) ?? []) if (s.startsWith(x.lit, i)) return i;
    }
    return e;
  }
  // (an operator written as a word and a space, `or `, is written apart from what is before it; one character, `, `, may hug it)
  apart(lit: string): boolean { return lit.indexOf(this.learned.space) > 1; }
  // Where an operand from `at` ends: where (no pair open) an equivalence declared before `floor` reads on after a space (what hugs
  // a value is part of it: `x.m`, `f(a)`), else at `e`.
  operand(text: Text, at: number, e: number, floor: number, ctx: Ray, pairs?: number, same = false): number {
    const s = text.s, { space } = this.learned, stops = (x: { lit: string; order: number; eq: Eq; from: number }, i: number) => (same ? x.order <= floor : x.order < floor) && this.literal(text, x.lit, i, e) >= 0 && this.follows(x.eq, x.from, text, i, e);
    return this.scan(text, at, e, i => {
      if (i <= at) return;
      for (const x of this.infix.get(s[i]) ?? []) if (x.lit.includes(space) && stops(x, i)) return false;
      if (this.words.size && this.blank(s[i - 1]) && !this.blank(s[i])) { const j = s.indexOf(space, i), list = j > i ? this.words.get(s.slice(i, j)) : undefined; if (list) for (const x of list) if (stops(x, i)) return false; }
    }, pairs);
  }
  // Whether an equivalence's literals from piece `from` on are written after `at`, in order.
  follows(eq: Eq, from: number, text: Text, at: number, e: number): boolean {
    let i = at;
    for (let k = from; k < eq.pieces.length; k++) {
      const p = eq.pieces[k];
      if (!('lit' in p)) continue;
      if (k === from) { const n = this.literal(text, p.lit, i, e); if (n < 0) return false; i = n; continue; }
      let found = -1; for (let j = i; j < e; j++) { const n = this.literal(text, p.lit, j, e); if (n >= 0) { found = n; break; } }
      if (found < 0) return false; i = found;
    }
    return true;
  }
  // Where a literal read from `at` ends, or -1. A space in it also reads line ends and indentation.
  literal(text: Text, lit: string, at: number, e: number): number {
    const s = text.s, { space } = this.learned;
    let i = at;
    for (let j = 0; j < lit.length; j++) {
      if (lit[j] === space) { if (!this.blank(s[i])) return -1; while (i < e && this.blank(s[i])) i++; continue; }
      if (s[i] !== lit[j]) return -1;
      i++;
    }
    return i <= e ? i : -1;
  }

  // ---------------------------------------------------------------- what a reading means: its functionality applied
  // A span walked as Expression: read, then applied. What no equivalence reads is said, and stays its text (G1.8).
  walk(code: Code): unknown {
    if (TRACE && code.statement) { this.depth_++; if (this.depth_ < Number(TRACE)) writeSync(2, `${' '.repeat(this.depth_)}${code.text.name}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 60))}\n`); try { return this.walk2(code); } finally { this.depth_--; } }
    return this.walk2(code);
  }
  depth_ = 0;
  walk2(code: Code): unknown {
    if (code.statement) { const before = new Set(this.unread.keys()); const v = this.walk_(code); for (const [p, d] of this.unread) if (!before.has(p)) { this.unread.delete(p); this.say(d.message, d.at.text, d.at.b, d.at.e); } return v; }
    return this.walk_(code);
  }
  walk_(code: Code): unknown {
    // (a statement that reads more than any is written to: one that does not end)
    if (STACK) { this.recent[this.steps % 60] = `${code.text.name.split('/').pop()}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 50))}`; }
    if (++this.steps > LONGEST) { if (STACK) writeSync(2, this.chain.slice(0, 30).join('\n') + '\n====\n' + [...this.recent.slice(this.steps % 60), ...this.recent.slice(0, this.steps % 60)].join('\n') + '\n----\n'); this.steps = 0; this.applying = 0; throw new Runaway(`more than ${LONGEST} readings (\`${code.s.slice(0, 40)}\`)`); }
    // (nothing written: nothing)
    if (!this.held(code.text, code.b, code.e)) return undefined;
    // (code of several statements: each, in order)
    const st = this.statements(code), first = st.next();
    if (!first.done) { const second = st.next(); if (!second.done) { let v = this.walk(stated(new Code(code.text, first.value[0], first.value[1], code.ctx, code.floor))); for (let x: IteratorResult<[number, number]> = second; !x.done; x = st.next()) v = this.walk(stated(new Code(code.text, x.value[0], x.value[1], code.ctx, code.floor))); return v; } }
    // (a definition written in a functionality, its pattern naming what the rule captured: written again first, then read)
    if (this.definer) { const d = this.match(this.definer, code.text, code.b, code.e, code.ctx, 0, code.b, []); if (d && this.names_held(code.text.s.slice(d.caps[0].b, d.caps[0].e), code.ctx)) return this.defined(new Code(code.text, d.caps[0].b, d.caps[0].e, code.ctx), new Code(code.text, d.caps[1].b, d.caps[1].e, code.ctx), code.ctx, code.ctx.rule ? code.ctx.statement : code.statement); }
    let r = this.reading(code); const s = code.text.s;
    let e = code.e; while (e > code.b && this.blank(s[e - 1])) e--;
    if (r === undefined || r.e < e) {
      const from = r ? r.e : code.b, unread = s.slice(from, e).trim();
      this.say(unread.includes(this.learned.space) || r ? `Unread \`${unread.slice(0, 60)}\`.` : `Unresolved \`${unread}\`.`, code.text, from, e);
      // (what did not apply is nothing here)
      if (!r) return undefined; const v = this.run(r, code); return v === NOT ? undefined : v;
    }
    // (a reading whose captures its readers did not read has not applied: the next one)
    for (const not = new Set<Eq>(); ;) {
      const v = this.run(r!, code);
      if (v !== NOT) return v;
      // (what read on from a value applied what that value has with that head: none of that head applies)
      for (let x: Read | undefined = r; x; x = x.on) if (x.eq) { not.add(x.eq); const p0 = x.eq.pieces[0]; if (x.on && 'lit' in p0) for (const y of this.sends.get(p0.lit[0]) ?? []) if (y.key === x.eq.key) not.add(y); }
      r = this.parse(code.text, code.b, code.e, code.ctx, code.floor, not);
      if (process.env.EXPR_NOTS && not.size % 1000 === 0) writeSync(2, `not ${not.size} ${code.s.slice(0, 30)} → ${r?.eq?.key ?? (r?.name ? 'name' : r)} on ${r?.on?.eq?.key ?? r?.on?.name}\n`);
      if (r === undefined || r.e < e) { this.say(`Unread \`${s.slice(code.b, e).trim().slice(0, 60)}\`.`, code.text, code.b, e); return undefined; }
    }
  }
  // (read once per span, floor and the nearest context that adds equivalences, until one is added)
  memo = new WeakMap<Ray, Map<Text, Map<number, { floor: number; e: number; version: number; r: Read | undefined }[]>>>();
  reading(code: Code): Read | undefined {
    // (a frame that also reaches another context, a value's or where its code was written, reads as itself)
    let key: Ray = code.ctx; while (key.eqs === NONE && key.scope && key.outer && !key.sees && !key.into) key = key.outer;
    // (a rule's frame reads as every frame of that rule on what is made of the same class: its names are read when it runs)
    if (SHAPED && key.rule && key.scope && !key.into) key = this.shape(key);
    if (NOMEMO) return this.parse(code.text, code.b, code.e, code.ctx, code.floor);
    let m = this.memo.get(key); if (!m) this.memo.set(key, m = new Map());
    let at = m.get(code.text); if (!at) m.set(code.text, at = new Map());
    let list = at.get(code.b); if (!list) at.set(code.b, list = []);
    for (const x of list) if (x.floor === code.floor && x.e === code.e) {
      if (x.version === this.version) return x.r;
      x.r = this.parse(code.text, code.b, code.e, code.ctx, code.floor); x.version = this.version; return x.r;
    }
    const r = this.parse(code.text, code.b, code.e, code.ctx, code.floor);
    list.push({ floor: code.floor, e: code.e, version: this.version, r });
    return r;
  }
  shapes = new Map<string, Ray>(); ids = new WeakMap<object, number>(); counted = 0;
  id(x: unknown): number { if (typeof x !== 'object' || x === null) return 0; let i = this.ids.get(x); if (i === undefined) this.ids.set(x, i = ++this.counted); return i; }
  shape(F: Ray): Ray {
    const on = F.outer && !F.outer.scope ? F.outer.outer : F.outer, k = `${this.id(F.rule)}|${this.id(on)}|${this.id(F.sees)}`;
    let s = this.shapes.get(k); if (!s) this.shapes.set(k, s = new Ray()); return s;
  }
  // the value a reading found its equivalence on, from a frame: as the reading found it (`near` contexts out)
  self_of(ctx: Ray, near: number): unknown {
    let self: unknown, i = 0;
    for (const n of this.reach(ctx)) { i++; if (self === undefined && n.into && !n.into.scope && !n.rule) self = n.self ?? n.into; if (!n.scope && n !== this.base && self === undefined) self = n; if (i >= near) break; }
    return self;
  }
  // Where what was read last is (a name's place: the context it is declared in, or would be): what `:=` and `=` act on.
  place?: Place;
  run(r: Read, code: Code): unknown {
    if (r.name) {
      const word = code.text.s.slice(r.b, r.e);
      for (const n of this.reach(code.ctx)) if (n !== code.past && (n.has(word) || this.valued(n, word))) {
        const x = n.has(word) ? undefined : this.valued(n, word), v = x ? x.native!(n) : n.m.get(word);
        // (a word given as written: read here, as it is written)
        if (v instanceof Code && v.word) { const w = new Code(v.text, v.b, v.e, code.ctx); w.past = n; return this.walk(w); }
        // (a capture: where what it holds was read)
        const held = n.places?.get(word); this.place = held ?? { at: n.into ?? n, here: code.ctx.into ?? code.ctx, word };
        if (v === NOT && process.env.EXPR_NOTS) writeSync(2, `NOT held: ${word} in frame of ${n.rule?.key} @${n.rule?.body.text.name.split('/').pop()}:${n.rule?.body.text.s.slice(0, n.rule.body.b).split('\n').length} read at ${code.text.name.split('/').pop()}:${code.text.s.slice(0, code.b).split('\n').length}\n`);
        return this.force(v);
      }
      const at = code.ctx.into ?? code.ctx;
      this.place = { at, here: at, word, text: code.text, b: r.b, e: r.e };
      // (what a value does not have, read in it, is nothing; a name nothing holds, said once the statement is read, unless it was
      // only a place given a value)
      if (!(code.ctx.into !== undefined && code.ctx.caller === undefined && !code.ctx.sees)) this.unread.set(this.place, { message: `Unresolved \`${word}\`.`, at: { text: code.text, b: r.b, e: r.e } });
      return undefined;
    }
    const eq = r.eq!;
    if (r.on === undefined) {
      const v = this.apply(eq, r.caps, code, r.self === undefined ? undefined : this.self_of(code.ctx, r.near ?? 0));
      // (a name, or a member: its place)
      // (a declared name is written where it is declared; one computed, as `this`, only where it is read)
      if (eq.pieces.length === 1 && 'lit' in eq.pieces[0]) { const here = code.ctx.into ?? code.ctx; this.place = { at: eq.native && !eq.js ? eq.ctx : here, here, word: eq.key }; }
      return v;
    }
    // on a value: the equivalence with that head it has (its own, its class's, …, the base's), applied where the value was read
    // (what it is read on is a value, not the statement)
    const value = this.run(r.on, code.statement ? new Code(code.text, code.b, code.e, code.ctx, code.floor) : code), place = this.place;
    // (what it is read on did not apply: neither does this)
    if (value === NOT) return NOT;
    let owns = this.dispatching(value, eq.key);
    // (a name the value holds is read before what its classes add: `x.m`, `m` being one of its names, read as the base reads it)
    const own = owns[0];
    if (own && own.ctx !== this.base && own.pieces.length === 2 && 'lit' in own.pieces[0] && r.caps.length === 1) {
      const c = r.caps[0], word = code.text.s.slice(c.b, this.name_end(code.text, c.b, c.e)).trim();
      if (word && this.holds(value, word)) owns = this.dispatching(this.base, eq.key);
    }
    if (owns.length === 0) { this.say(`No \`${code.text.s.slice(r.on.e, r.e).trim().slice(0, 40)}\` on ${this.show(value)}.`, code.text, r.on.e, r.e); return undefined; }
    // (the value's own equivalences with that head, nearest first: the first that reads what follows, its own captures read from the
    // same place, and applies)
    for (const x of owns) {
      const caps = x === eq ? r.caps : this.match(x, code.text, r.from!, r.e, code.ctx, 0, r.from!, [])?.caps;
      if (!caps) continue;
      const v = this.apply(x, caps, code, value === undefined ? this.none : value, place);
      if (v !== NOT) return v;
    }
    return NOT;
  }
  // whether a span is the whole of some code (spaces around it aside)
  whole(c: Code, b: number, e: number): boolean {
    const s = c.text.s; let cb = c.b, ce = c.e; while (cb < ce && this.blank(s[cb])) cb++; while (ce > cb && this.blank(s[ce - 1])) ce--;
    return cb === b && ce === e;
  }
  // whether a rule is written as a call: a name and an opened bracket first
  calls(eq: Eq): boolean { const p = eq.pieces[0]; return 'lit' in p && p.lit.length > 1 && this.pairs.has(p.lit[p.lit.length - 1]) && !this.blank(p.lit[0]); }
  // whether a value has a name, of its own or its class's
  holds(value: unknown, word: string): boolean {
    // (a method: an equivalence led by the name)
    const leads = (x: Eq) => { const p = x.pieces[0]; return 'lit' in p && p.lit.startsWith(word) && (p.lit.length === word.length || this.edge(p.lit, word.length)); };
    for (let n = value instanceof Ray ? value : undefined; n && !n.scope; n = n.outer) if (n.has(word) || n.eqs.some(leads)) return true;
    return false;
  }
  // the value a context holds under a name (declared with `:=`), as the latest equivalence of it
  valued(n: Ray, word: string): Eq | undefined { for (let i = n.eqs.length - 1; i >= 0; i--) { const x = n.eqs[i]; if (x.value && x.key === word) return x; } return undefined; }
  // names read that nothing holds, waiting for the end of their statement
  unread = new Map<Place, Diagnostic>();
  // A value given to the place the receiver was read at (`:=`): declared there; or where it is declared (`=`).
  declare(F: Ray, v: unknown, assign: boolean): unknown {
    let n: Ray | undefined = F; while (n && !n.place) n = n.caller;
    const p = n?.place; if (!p) return v;
    this.unread.delete(p);
    // (declared where it was read; written where it is declared)
    const at = assign ? p.at : p.here;
    const t = { name: '', s: p.word };
    this.add(at, [{ lit: p.word }], new Value(v, new Code(t, 0, p.word.length, at)));
    return v;
  }
  dispatch(value: unknown, key: string): Eq | undefined { return this.dispatching(value, key, true)[0]; }
  dispatching(value: unknown, key: string, one = false): Eq[] {
    let based = false; const out: Eq[] = [];
    // (nothing, absent, reads as the interpreter's nothing)
    if (value === undefined && this.none) value = this.none;
    // (a value of the host's own kind: the class the interpreter maps that kind to)
    if (!(value instanceof Ray) && value !== undefined) { const k = this.kind(typeof value); if (k) value = k; }
    for (let n: Ray | undefined = value instanceof Ray ? value : (based = true, this.base); n; n = n.outer && !n.outer.scope ? n.outer : based ? undefined : (based = true, this.base)) {
      for (let i = n.eqs.length - 1; i >= 0; i--) if (n.eqs[i].key === key) { out.push(n.eqs[i]); if (one) return out; }
    }
    return out;
  }
  // An equivalence applied: a frame inside the value it is applied on (or where its functionality was written), its captures bound
  // (as code, read where they were written each time they are named; one with a reader, what the reader read), its functionality
  // run there.
  apply(eq: Eq, caps: Cap[], code: Code, self?: unknown, place?: Place): unknown {
    // (what applies deeper than any program is written: a reading that never ends, said where its statement is)
    if (STACK) this.chain.push(`${eq.key.slice(0, 30)} @${eq.body.text.name.split('/').pop()}:${eq.body.text.s.slice(0, eq.body.b).split(this.learned.end).length} on ${code.text.name.split('/').pop()}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 40))}`);
    if (++this.applying > DEEPEST) { if (STACK) writeSync(2, this.chain.slice(-40).join('\n') + '\n----\n'); this.applying = 0; throw new Runaway(`deeper than ${DEEPEST} applications (\`${eq.key.slice(0, 40)}\`)`); }
    try { return this.apply_(eq, caps, code, self, place); } finally { if (this.applying > 0) this.applying--; if (STACK) this.chain.pop(); }
  }
  applying = 0; steps = 0; chain: string[] = []; recent: string[] = [];
  apply_(eq: Eq, caps: Cap[], code: Code, self?: unknown, place?: Place): unknown {
    const F = new Ray(self instanceof Ray && !self.scope ? self : eq.body.ctx); F.place = place;
    // (what a rule enclosed in literals reads is a value)
    const ps = eq.pieces, enclosed = 'lit' in ps[0] && 'lit' in ps[ps.length - 1] && ps.length > 1;
    F.scope = true; F.caller = code.ctx; F.self = self; F.rule = eq; F.statement = code.statement && !enclosed;
    if (F.outer !== eq.body.ctx) F.sees = eq.body.ctx;
    const at = code.ctx.written ?? code.ctx;
    for (const c of caps) { const k = new Code(code.text, c.b, c.e, at, c.floor); F.m.set(c.name, c.b === c.e ? k : c.reader ? NOT : this.written(k)); }
    // (a capture with a reader is a value: what its reader reads, read once, here)
    for (const c of caps) if (c.reader && c.b < c.e) {
      // (while what reads its captures is read, the rule reads nothing itself)
      const k = new Code(code.text, c.b, c.e, at, c.floor); eq.busy = (eq.busy ?? 0) + 1;
      let r: unknown; try { r = this.walk(new Code(c.reader.text, c.reader.b, c.reader.e, F)); } finally { eq.busy--; }
      // (a value of the host's own kind, as what is read in: read in the class the interpreter maps that kind to, being that value)
      const kind = !(r instanceof Ray) && r !== undefined && this.dependent(c.reader, eq) ? this.kind(typeof r) : undefined;
      if (r === this.expression) F.m.set(c.name, this.walk(k));
      else if (kind) { const v = c.block ? this.into(this.written(k), kind, r) : this.within(k, kind, false, r); if (v === NOT) return NOT; F.m.set(c.name, v); }
      else if (!(r instanceof Ray)) return NOT;
      // (code handed on, a word naming held code: that code, read into it)
      else { const v = c.block ? this.into(this.written(k), r) : this.within(k, r, !this.dependent(c.reader, eq), undefined, eq); if (v === NOT) return NOT; F.m.set(c.name, v); }
      if (this.place) (F.places ??= new Map()).set(c.name, this.place);
    }
    if (eq.native) return eq.native(F);
    return this.body(eq, F);
  }
  // Code read into a value: its statements read in a frame of the value (what they define is the value's), which sees where the
  // code was written.
  // (read by a context of nothing, a word: the code itself)
  within(code: Code, r: Ray, typed = false, self?: unknown, by?: Eq): unknown {
    // (a context the host reads with its own function: what that gives, or not read)
    // (one that reads a span as it is written: that span, a word)
    if (r.test) { const t = code.s.trim(), v = r.test(t); if (v === undefined) return NOT; if (v !== t) return v; const w = new Code(code.text, code.b, code.e, code.ctx, code.floor); w.word = true; return w; }
    const T = new Ray(r); T.scope = true; T.into = r; T.written = code.ctx; T.self = self;
    const read = this.parse(code.text, code.b, code.e, r, 0); let end = code.e; while (end > code.b && this.blank(code.text.s[end - 1])) end--;
    if (r.scope && read?.name && read.e === end) { const w = new Code(code.text, code.b, code.e, code.ctx, code.floor); w.word = true; return w; }
    const word = read?.name ? code.text.s.slice(read.b, read.e) : undefined;
    // (a reader decided where it was written, a type: what it does not read whole is read where it was written, one of it, or not read)
    // (a type that reads the text as it is written: that text)
    if (typed && !r.scope && this.patterns && !(read && read.e === end && this.own(read, r, code.text)) && this.fits(r, code.s.trim())) return code.s.trim();
    if (typed && !r.scope && !(read && read.e === end && this.own(read, r, code.text))) {
      // (read where it was written, while the rule asking reads nothing itself)
      let at = code.ctx; while (at.written) at = at.written;
      if (by) by.busy = (by.busy ?? 0) + 1;
      let v: unknown; try { v = this.walk(new Code(code.text, code.b, code.e, at, code.floor)); } finally { if (by) by.busy!--; }
      return this.is(v, r) ? v : NOT;
    }
    return this.sequence(code, T);
  }
  // whether a value is one of a context (it, or made of it; anything is one of the base)
  is(v: unknown, r: Ray): boolean {
    if (r === this.base) return true;
    if (!(v instanceof Ray)) { const k = v === undefined ? undefined : this.kind(typeof v); return k !== undefined && this.is(k, r); }
    for (let n: Ray | undefined = v; n; n = n.outer) if (n === r) return true;
    return false;
  }
  // A block's statements in order. One naming what nothing holds yet is read again once the block is read: what the block declares
  // further on it may name (only then is what it leaves unresolved said).
  sequence(code: Code, T: Ray): unknown {
    return this.settle(function* (h: Host) { for (const [b, e] of h.statements(code)) yield stated(new Code(code.text, b, e, T)); }(this));
  }
  // Statements in order (each split once those before it were read: what they declare says where it ends); each that said
  // something (a name nothing holds yet, what nothing read) is read again once the others were, while that leaves fewer of them;
  // only the last time is what they say said. The value: what the last one gave.
  settle(codes: Iterable<Code>): unknown {
    let left: Iterable<Code> = codes, last: unknown;
    // (settled inside another settling: what it leaves unresolved is left for that one)
    const inner = this.settling++ > 0;
    try {
      for (let round = 0, before = Infinity; ; round++) {
        const again: Code[] = [], final = round >= 8;
        for (const c of left) {
          if (final) { last = this.tried(c, !inner); continue; }
          // (a statement that defined what a class holds, read again into one of what is made of it: the class's already, A7)
          // (the same block, written in the same frame: what it closes over is the same)
          const into = c.ctx.into, was = into && !into.scope ? this.defining.get(c.text)?.get(c.b) : undefined;
          if (was && was.cls !== into && was.written === c.ctx.outer && this.made(into!, was.cls)) continue;
          const d = this.diagnostics.length, held = this.unread.size === 0 ? undefined : new Set(this.unread.keys()), n = into?.eqs.length ?? 0;
          this.ran_away = false; last = this.tried(c, false);
          // (one that did not end is not read again)
          if (this.ran_away) { for (const p of this.unread.keys()) if (!held?.has(p)) this.unread.delete(p); continue; }
          if (into && !into.scope && into.eqs.length > n && into.eqs.slice(n).every(eq => !eq.native)) { let at = this.defining.get(c.text); if (!at) this.defining.set(c.text, at = new Map()); at.set(c.b, { cls: into, written: c.ctx.outer }); }
          let left_unresolved = false; for (const p of this.unread.keys()) if (!held?.has(p)) { this.unread.delete(p); left_unresolved = true; }
          if (left_unresolved) { this.unsay(d); again.push(c); }
        }
        if (process.env.EXPR_ROUNDS) console.log(this.settling + ' ' + this.applying + ' round', round, 'left', again.length, again[0] ? again[0].text.name + ':' + again[0].text.s.slice(0, again[0].b).split('\n').length : '', Math.round(performance.now()));
        if (final || again.length === 0) break;
        // (nothing more was read: the last time)
        if (again.length >= before) round = 7;
        before = again.length; left = again;
      }
    } finally { this.settling--; }
    return last;
  }
  settling = 0; ran_away = false; deciding = 0;
  // block statements that defined what a class holds (where they start), and that class
  defining = new WeakMap<Text, Map<number, { cls: Ray; written?: Ray }>>();
  // whether a value is made of a class (it continues into it)
  made(value: Ray, cls: Ray): boolean { for (let n = value.outer; n && !n.scope; n = n.outer) if (n === cls) return true; return false; }
  // a statement walked (what fails, said where it is)
  tried(c: Code, speak = true): unknown {
    if (this.settling <= 1) this.steps = 0;
    if (SLOW && this.settling <= 1) { const t = performance.now(); try { return this.tried_(c, speak); } finally { const ms = performance.now() - t; if (ms > SLOW) writeSync(2, `slow ${Math.round(ms)} ms ${this.steps} readings ${c.text.name}:${c.text.s.slice(0, c.b).split(this.learned.end).length} ${JSON.stringify(c.s.slice(0, 60))}\n`); } }
    return this.tried_(c, speak);
  }
  tried_(c: Code, speak: boolean): unknown {
    if (TRACE) writeSync(2, `${c.text.name}:${c.text.s.slice(0, c.b).split(this.learned.end).length} ${JSON.stringify(c.s.slice(0, 70))}\n`);
    try { return speak ? this.walk(c) : this.walk_(c); }
    // (one that does not end ends the outermost statement it is in)
    catch (x) { if (x instanceof Runaway && this.settling > 1) throw x; if (x instanceof Runaway) this.ran_away = true; this.say(`Failed: ${x instanceof Error ? x.message : String(x)}`, c.text, c.b, c.e); if (process.env.EXPR_STACK) console.log((x as Error).stack); return undefined; }
  }
  // A block read into a value: its names where it was written, what it declares the value's.
  into(code: Code, r: Ray, self?: unknown): unknown {
    const T = new Ray(code.ctx); T.scope = true; T.into = r; T.sees = r; T.self = self;
    return this.sequence(code, T);
  }
  body(eq: Eq, F: Ray): unknown {
    if (eq.js === undefined && this.located(eq.body) && this.interpreted.has(eq.body.text)) eq.js = this.js(eq);
    if (eq.js) return eq.js(F);
    // (a statement handed through, its functionality the capture it is: still a statement)
    if (F.statement) { const w = eq.body.s.trim(); const c = F.m.get(w); if (c instanceof Code) return this.walk(stated(new Code(c.text, c.b, c.e, c.ctx, c.floor))); }
    let v: unknown;
    for (const [b, e] of this.statements(eq.body)) v = this.walk(stated(new Code(eq.body.text, b, e, F)));
    return v;
  }
  force(v: unknown): unknown { return v instanceof Code ? this.walk(v) : v; }
  // the value a frame was applied on: the nearest that has one
  name(F: Ray, word: string): unknown { const t = { name: word, s: word }; return this.walk(new Code(t, 0, word.length, F)); }
  // the context a name is declared in: the nearest from where it is read that has it (else there)
  declaring(name: Code, F?: Ray): Ray {
    const word = name.s.trim(), has = (n: Ray) => n.has(word) || n.eqs.some(eq => eq.key === word);
    // (from where the assignment is read: what it is read into, then around it; else where the name was written)
    let at = F?.caller; while (at && at.rule && !at.into) at = at.caller;
    if (at?.into && has(at.into)) return at.into;
    for (const n of this.reach(at ?? name.ctx)) if (has(n)) return n.into ?? n;
    for (const n of this.reach(name.ctx)) if (has(n)) return n.into ?? n;
    return at?.into ?? at ?? name.ctx;
  }
  // the context a statement is read in: what is read into, else the nearest frame no rule applied
  here(F: Ray): Ray | undefined { for (let n: Ray | undefined = F.caller; n; n = n.caller ?? n.outer) { if (n.into) return n.into; if (!n.rule) return n; } return undefined; }
  // whether a context has a name of its own
  has(x: unknown, word: string): boolean { return x instanceof Ray && (x.has(word) || x.eqs.some(eq => eq.key === word)); }
  self(F: Ray): unknown {
    const seen = new Set<Ray>();
    const go = (n: Ray | undefined): unknown => { for (; n && !seen.has(n); n = n.caller ?? n.outer) { seen.add(n); if (n.self !== undefined) return n.self; if (n.written && !n.rule && n.outer && !n.outer.scope) return n.outer; if (n.into && !n.rule && n.into !== this.global && !n.into.scope) return n.into; if (n.sees) { const v = go(n.sees); if (v !== undefined) return v; } } return undefined; };
    return go(F.caller);
  }

  // arguments given to an instance (`@given`): read where they were written (`this` theirs), what they name the instance's
  given(instance: unknown, code: unknown): unknown {
    if (!(instance instanceof Ray) || !(code instanceof Code)) return code instanceof Code ? undefined : code;
    const T = new Ray(code.ctx); T.scope = true; T.into = instance; T.self = this.self_at(code.ctx);
    return this.sequence(code, T);
  }
  self_at(ctx: Ray): unknown { const F = new Ray(); F.caller = ctx; return this.self(F); }
  // the code each block was made of (`@block`), and running a program (`@run`): its code read again where it was written, with
  // the equivalences of its level (`O`) in scope
  blocks = new WeakMap<Ray, Code>();
  ran(p: unknown): unknown {
    const code = this.field(p, 'code'), O = this.field(p, 'O');
    const c = code instanceof Ray ? this.blocks.get(code) : code instanceof Code ? code : undefined;
    if (!c) return code;
    // (the level's equivalences nearer than what the code names)
    const T = new Ray(O instanceof Ray ? O : c.ctx); T.scope = true; if (O instanceof Ray) { T.sees = c.ctx; T.written = c.ctx; }
    return this.sequence(c, T);
  }
  // what a value holds under a name (its own, or its class's)
  field(v: unknown, word: string): unknown {
    for (let n = v instanceof Ray ? v : undefined; n && !n.scope; n = n.outer) {
      if (n.has(word)) return this.force(n.m.get(word));
      for (let i = n.eqs.length - 1; i >= 0; i--) { const x = n.eqs[i]; if (x.key === word && x.native) return x.native(n); }
    }
    return undefined;
  }
  // A type reading text (`js.ray` names the fields the language's types are made of): text reads itself; a host reader what it
  // reads; nothing, nothing; `one` a character; alternatives any of theirs; a narrowing what it narrows that its constraint holds
  // of; a repetition one or more of what it repeats; a sequence its parts in order.
  patterns?: { alternatives: string; narrowed: string; constraint: string; repeated: string; sequence: string; value: string; next: string; one: string };
  fits(T: unknown, s: string): boolean {
    if (!(T instanceof Ray)) return this.fit_at(T, s, 0, new Map(), 0).has(s.length);
    if (this.fitted_version !== this.version) { this.fitted = new WeakMap(); this.fitted_version = this.version; this.one = undefined; }
    let m = this.fitted.get(T); if (!m) this.fitted.set(T, m = new Map());
    let v = m.get(s); if (v === undefined) m.set(s, v = this.fit_at(T, s, 0, new Map(), 0).has(s.length));
    return v;
  }
  fitted = new WeakMap<Ray, Map<string, boolean>>(); fitted_version = -1; one?: unknown;
  fit_at(T: unknown, s: string, i: number, memo: Map<unknown, Map<number, Set<number>>>, depth: number): Set<number> {
    let at = memo.get(T); if (!at) memo.set(T, at = new Map());
    const kept = at.get(i); if (kept) return kept;
    const out = new Set<number>(); at.set(i, out);
    const p = this.patterns; if (depth > 64) return out;
    if (typeof T === 'string') { if (s.startsWith(T, i)) out.add(i + T.length); return out; }
    if (typeof T === 'number') { const t = String(T); if (s.startsWith(t, i)) out.add(i + t.length); return out; }
    if (T === undefined || T === this.none) { out.add(i); return out; }
    if (!(T instanceof Ray) || !p) return out;
    if (T.test) { for (let j = i + 1; j <= s.length; j++) if (T.test(s.slice(i, j)) !== undefined) out.add(j); return out; }
    if (T === (this.one ??= this.name(this.global, p.one))) { if (i < s.length) out.add(i + (s.codePointAt(i)! > 0xffff ? 2 : 1)); return out; }
    const alternatives = this.field(T, p.alternatives), narrowed = this.field(T, p.narrowed), repeated = this.field(T, p.repeated), first = this.field(T, p.sequence);
    if (alternatives instanceof Ray) for (let v = this.field(alternatives, p.sequence); v instanceof Ray; v = this.field(v, p.next)) for (const j of this.fit_at(this.field(v, p.value), s, i, memo, depth + 1)) out.add(j);
    else if (narrowed !== undefined) { const c = this.field(T, p.constraint); for (const j of this.fit_at(narrowed, s, i, memo, depth + 1)) if (this.truthy(this.invoke(c, s.slice(i, j)))) out.add(j); }
    else if (repeated !== undefined) { let edge = [...this.fit_at(repeated, s, i, memo, depth + 1)].filter(j => j > i); const seen = new Set<number>(); while (edge.length) { const next: number[] = []; for (const j of edge) if (!seen.has(j)) { seen.add(j); out.add(j); for (const k of this.fit_at(repeated, s, j, memo, depth + 1)) if (k > j) next.push(k); } edge = next; } }
    else if (first instanceof Ray) { let ends = new Set([i]); for (let v: unknown = first; v instanceof Ray; v = this.field(v, p.next)) { const next = new Set<number>(); for (const j of ends) for (const k of this.fit_at(this.field(v, p.value), s, j, memo, depth + 1)) next.add(k); ends = next; } for (const j of ends) out.add(j); }
    return out;
  }
  // a closure applied to a value; whether a value holds (every value but nothing and false)
  invoke(f: unknown, x: unknown): unknown {
    if (!(f instanceof Ray) || f.eqs.length !== 1) return undefined;
    const eq = f.eqs[0], c = eq.pieces.find(q => 'cap' in q) as { cap: string } | undefined; if (!c) return undefined;
    const F = new Ray(eq.body.ctx); F.scope = true; F.rule = eq; F.m.set(c.cap, x);
    return eq.native ? eq.native(F) : this.body(eq, F);
  }
  truthy(v: unknown): boolean { return v !== undefined && v !== this.none && v !== NOT && v !== this.name(this.global, 'false'); }
  // a context the host reads text with (`js.ray`): `test` gives what a span is read as, or undefined
  reader(test: (s: string) => unknown): Ray { const r = new Ray(); r.test = test; return r; }

  // ---------------------------------------------------------------- @js: the host's language, at its location
  location = '@js'; interpreted = new Set<Text>();
  located(body: Code): boolean { const s = body.s.trimStart(); return s.startsWith(this.location) && this.blank(s[this.location.length]); }
  js(eq: Eq): (F: Ray) => unknown {
    const src = eq.body.s.trimStart().slice(this.location.length);
    const names = eq.pieces.filter(p => 'cap' in p).map(p => (p as { cap: string }).cap);
    // (a capture named in it is read where it was written, each time it is named)
    const code = rename(src, names);
    let fn: Function;
    try { fn = new Function('$', 'F', 'Ray', `return (${code});`); } catch { fn = new Function('$', 'F', 'Ray', code); }
    return (F: Ray) => fn(this, F, Ray);
  }
  get(F: Ray, name: string): unknown { return this.force(F.m.get(name)); }

  show(v: unknown): string {
    if (v === undefined || v === this.none) return 'undefined';
    if (v instanceof Ray) { for (const [k, x] of this.global.m) if (x === v) return k; for (const eq of this.global.eqs) if (eq.native && eq.pieces.length === 1 && 'lit' in eq.pieces[0] && eq.native(this.global) === v) return eq.pieces[0].lit; return 'Ray(' + v.eqs.map(e => e.key).join(',') + ')'; }
    if (v instanceof Code) return v.s.trim();
    if (typeof v === 'string') return v;
    return String(v);
  }

  // ---------------------------------------------------------------- reading a text
  read(text: Text, scope: Ray, from = 0) { this.project([text], scope, from); }
  // Texts read as one: their statements in order, settled together.
  project(texts: Text[], scope: Ray, from = 0, starting = texts[0]) {
    this.settle(function* (h: Host) { for (const text of texts) for (const [b, e] of h.statements(new Code(text, text === starting ? from : 0, text.s.length, scope))) yield stated(new Code(text, b, e, scope)); }(this));
  }
  // The language, its first statement first; then what this interpreter maps the language's values to (`js.ray`: an interpreter in
  // another host language has its own), then the rest of the language.
  boot(text: Text, mapping?: Text) {
    const from = this.axiom(text);
    // (the host's language at its location: `@js code`, the code run with the frame it is read in)
    const at = this.add(this.global, [{ lit: this.location + this.learned.space }, { cap: this.location }], new Code(text, 0, 0, this.global));
    // (code there run by this interpreter: what its own files write; elsewhere, code in that language is a value, the text written)
    at.native = F => { const c = F.m.get(this.location) as Code; if (!this.interpreted.has(c.text)) return c.s.trim(); return new Function('$', 'F', 'Ray', `return (${c.s});`)(this, c.ctx, Ray); };
    this.interpreted.add(text); if (mapping) this.interpreted.add(mapping);
    // (read as one: what the mapping names that the language declares later is read again once it is)
    this.project(mapping ? [mapping, text] : [text], this.global, from, text);
  }
}
function stated(c: Code): Code { c.statement = true; return c; }
// A value given as a functionality (where it was written).
class Value { constructor(public value: unknown, public code: Code) {} }
const NOT = Symbol('not read');
// a reading that does not end: what applies deeper, or more often, than any program is written to
class Runaway extends Error {}
const NOMEMO = !!process.env.EXPR_NOMEMO, SHAPED = !process.env.EXPR_UNSHAPED, DEADLINE = Number(process.env.EXPR_DEADLINE ?? 0) * 1000, STACK = !!process.env.EXPR_CHAIN, SLOW = Number(process.env.EXPR_SLOW ?? 0);
const DEEPEST = Number(process.env.EXPR_DEEPEST ?? 3000), LONGEST = Number(process.env.EXPR_LONGEST ?? 1000000);
const REJECT = Symbol('reads nothing');
// JS source with each capture named in it read from the frame (`F`).
function rename(src: string, names: string[]): string {
  if (names.length === 0) return src;
  let out = '', i = 0;
  const id = /[A-Za-z_$][\w$]*/y;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; continue; }
    id.lastIndex = i; const m = id.exec(src);
    if (m) { const w = m[0], prev = src.slice(0, i).trimEnd().slice(-1); out += names.includes(w) && prev !== '.' ? `$.get(F, ${JSON.stringify(w)})` : w; i += w.length; continue; }
    out += c; i++;
  }
  return out;
}
