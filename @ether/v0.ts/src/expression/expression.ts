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
  // (its equivalences by what they start with: led by a literal, by its first character; led by a capture, '' (positions in `eqs`))
  led?: Map<string, number[]>;
  // (with it: the heads of its equivalences, and whether any is a rule, not a value under a name)
  keys?: Set<string>; ruled?: boolean;
  // (the version it was first reached at by a reading)
  reached?: number;
  // (a closure: a method without a name, as a value)
  closure = false;
  // (what it is also made of, read after what it continues into: `A + B`, a component)
  also?: Ray[];
  // (a program run at a level: the rules of what the level is made of read here too)
  level = false;
  // (a context the host reads text with: what it reads a span as, or undefined)
  test?: (s: string) => unknown;
  scope = false; caller?: Ray; self?: unknown;
  // (a context of its own: what its rules say is read there alone)
  alone = false;
  // (a node a head was read into: what it was written as, its parameters (each a member, in order), whether it is applied with what
  // is on its right; a member's type, what `:` said of it)
  // (a field's own node in a head, and the head node it is a field of; what a head was read as, in order)
  field_of?: Ray; pieces?: unknown;
  own?: boolean; spelled?: string; params?: string[]; leftward?: boolean; again?: boolean; method?: boolean; literal?: boolean; closing?: string; types?: Map<string, Code>; between?: string; defaults?: Set<string>; default_codes?: Map<string, Code>;
  // (a frame of an equivalence applied: which, and whether to a statement)
  rule?: Eq; statement = false;
  // (of its captures read as values, each as it was written: `x**`)
  codes?: Map<string, Code>;
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
  // (`argument`: what a method or closure was given: one that begins by reading on from a value is a closure of that value)
  argument = false;
  // (a word handed through a capture: read past the frame holding that capture, which would name it again)
  past?: Ray;
  constructor(public text: Text, public b: number, public e: number, public ctx: Ray, public floor = 0) {}
  get s() { return this.text.s.slice(this.b, this.e); }
}
// A piece of a pattern: a literal, or a capture (named; `reader`: what reads its span, code read where it was written).
export type Piece = { lit: string } | { cap: string; reader?: Code; type?: unknown };
// An equivalence: its pattern, its functionality (code, read where it is applied; or the host's), where it was added, when.
export type Eq = { own?: boolean; pieces: Piece[]; body: Code; ctx: Ray; order: number; seq: number; key: string; value?: boolean; operator?: boolean; pairs: number; busy?: number; native?: (F: Ray) => unknown; js?: ((F: Ray) => unknown) | null; word?: string; receiver?: string; apart?: boolean; node?: Ray; passing?: boolean; indexed?: boolean };
export type Diagnostic = { message: string; at: { text: Text; b: number; e: number } };
type Learned = { open: string; close: string; space: string; definer: string; end: string; indent: string; type: string; add: string; typed?: string };
type Cap = { name: string; b: number; e: number; floor: number; reader?: Code; type?: unknown; block?: boolean; argument?: boolean };
// What reading a span gave: an equivalence applied to captures (read on the value of `on`, or on `self`), or a name.
type Place = { at: Ray; here: Ray; word: string; text?: Text; b?: number; e?: number; on?: Place };
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
  // the kind of a value of the host's own: its `typeof`; one character of text, a character (`char`) where one is mapped
  kind_of(v: unknown): Ray | undefined { return typeof v === 'string' && this.kinds.has('char') && v.length > 0 && v.length <= 2 && [...v].length === 1 ? this.kind('char') : this.kind(typeof v); }
  kind(k: string): Ray | undefined { const v = this.kinds.get(k); if (v instanceof Code) { const r = this.walk(v); if (r instanceof Ray) { this.kinds.set(k, r); return r; } return undefined; } return v; }
  order = 0;
  version = 0;
  // what each version declared, and where: the literals any text it reads has in it (`needle`; none: it may read anything)
  changes: { needle: string; at: Ray }[] = [];
  // (what is declared where no reading has reached yet changes no reading: a closure made, a value made; nor in a rule's frame,
  // read as its shape: every frame of it declares the same there)
  changed(pieces: Piece[], at: Ray) { if (at.reached === undefined || (SHAPED && at.rule && at.scope && !at.into)) return; this.version++; this.counts.changes = (this.counts.changes ?? 0) + 1; this.changes.push({ needle: this.needle(pieces), at }); }
  // whether anything declared since a version may read a span: declared where a reading then could reach (one first reached
  // later was reached by none)
  since_read(version: number, span: string): boolean {
    for (let v = version; v < this.version; v++) {
      const c = this.changes[v]; this.counts.scanned = (this.counts.scanned ?? 0) + 1;
      if (c.at.reached === undefined || c.at.reached > version) continue;
      if (!c.needle || span.includes(c.needle)) return true;
    }
    return false;
  }
  diagnostics: Diagnostic[] = [];
  output: (line: string) => void = line => console.log(line);
  // equivalences read on a value (added at a value, not a frame): kept by their first character
  sends = new Map<string, Eq[]>();
  // the literal read after a value or a leading capture, by its first character: where a name or an operand ends
  // (the earliest an operation read on from a value was declared: what is declared before it reads on past all of them)
  earliest = Infinity;
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
      this.pairs.set(open, close); this.closers.add(close); this.paired++; this.syntax++;
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
    this.counts.defined = (this.counts.defined ?? 0) + 1;
    const { open, close, space, definer } = this.learned;
    const caps = this.captures(at), held = (w: string) => { const c = caps.get(w); return c ? this.written(c) : undefined; };
    // (a functionality naming a value: that value; one written by the rule, its words naming what it captured standing for it)
    // (a rule that writes definitions writes its own: its words naming what it captured stand for that)
    const w = f.s.trim(), valued = this.valued_capture(at, w);
    const body = this.unblocked(held(w) ?? (valued ? new Value(valued.n.m.get(w), f) : this.substitutes(this.writer(at, f)) ? this.substituted(f, caps) : f));
    // (a pattern handed on, written elsewhere, stands for itself)
    let head = p.s.trim(), stood = p.ctx !== at && p.ctx !== at.into;
    // (a capture read as a value, named in a head: what it was written as)
    if (!held(head)) for (const n of this.reach(at)) if (n.rule && n.has(head)) { const c = n.codes?.get(head); if (c) { head = c.s.trim(); stood = true; } break; }
    if (stood && head !== p.s.trim()) { /* written as */ }
    else if (held(head)) {
      // (a word naming what holds a word, as written (`name` given `red`): that word)
      let c = held(head)!;
      for (let k = 0; k < 8; k++) { const w = c.s.trim(); let next: Code | undefined; for (const n of this.reach(c.ctx)) if (n.has(w)) { const x = n.m.get(w); if (x instanceof Code && x.word && x !== c) next = x; break; } if (!next) break; c = next; }
      head = c.s.trim(); stood = true;
    }
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
      if (!statement && pieces.length === 1 && 'lit' in pieces[0] && this.name_end(p.text, lead, p.e) === lead + head.length) { pieces = [{ cap: head }]; into.closure = true; }
      const eq = this.add(into, pieces, body); if (this.static_now > 0) eq.own = true; return statement ? this.held_as(eq) : into;
    }
    // (written by a rule: where the rule was applied, or into what is read into)
    let where = at.into ?? (at.caller ? at.caller.into ?? at.caller : at);
    // (one name, written where nothing it is read into says where: where that name is held, from where it is read)
    if (!at.into && head.length > 0 && this.name_end({ name: '', s: head }, 0, head.length) === head.length) for (const n of this.reach(at.caller ?? at)) if (n !== this.base && (n.has(head) || this.has_key(n, head))) { where = n.into ?? n; break; }
    // (a functionality that is one word naming what the rule captured, written in a head being read: that parameter's default, read
    // when it is not given; elsewhere: what it reads now)
    let given: unknown = body instanceof Value ? body.value : body;
    if (held(w) && body instanceof Code) {
      if (where === this.reading_node) { (where.defaults ??= new Set()).add(head); (where.default_codes ??= new Map()).set(head, body); return where; }
      given = this.walk(body);
    }
    const T = new Ray(where); T.scope = true; T.into = where; T.sees = this.global; T.m.set(this.functionality, given);
    const said = head + space + definer + space + this.functionality;
    let text = this.rewritten.get(said); if (!text) this.rewritten.set(said, text = { name: p.text.name, s: said });
    // (a head that is one name reads as itself: defined as the first statement says, without reading it again)
    const one = { name: '', s: head };
    if (head.length > 0 && this.name_end(one, 0, head.length) === head.length && !this.operator_at(one, 0) && !this.pairs.has(head[0])) return this.defined(new Code(text, 0, head.length, T), new Code(text, said.length - this.functionality.length, said.length, T), T, statement);
    // (what a rule led by a literal wrote starts as it does: not read by it again)
    const by = this.writer(at, p), r = this.parse(text, 0, text.s.length, T, 0, by && 'lit' in by.pieces[0] ? new Set([by]) : undefined);
    if (r === undefined || r.e < text.s.length) { this.say(`Unread \`${said.slice(0, 60)}\`.`, p.text, p.b, p.e); return undefined; }
    return this.run(r, statement ? stated(new Code(text, 0, text.s.length, T)) : new Code(text, 0, text.s.length, T));
  }
  // (the frame of a rule applied, from where a definition is written, that holds a word as a value read, not as code)
  valued_capture(at: Ray, w: string): { n: Ray } | undefined {
    if (at.has(w)) return at.m.get(w) instanceof Code ? undefined : { n: at };
    for (const n of this.reach(at)) if (n.rule && n.has(w)) return n.m.get(w) instanceof Code ? undefined : { n };
    return undefined;
  }
  // (a rule that is not a method writes its own definitions: its capture words in them stand for what it captured)
  substitutes(w: Eq | undefined): boolean { return !!w && (w.pairs === 0 || !w.node); }
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
      if (!this.edge(s, i - 1) && !this.infix.has(s[i - 1])) continue;
      for (const [k, c] of caps) if (s.startsWith(k, i) && (this.edge(s, i + k.length) || this.infix.has(s[i + k.length]))) {
        const x = stood = this.written(c), shift = indent(f.text.s, f.b + i) - indent(x.text.s, x.b), lines = x.s.split(end);
        out += s.slice(from, i) + lines.map((l, j) => j === 0 ? l : shift >= 0 ? space.repeat(shift) + l : l.slice(Math.min(-shift, this.depth(l, 0)))).join(end);
        from = i + k.length; i = from - 1; break;
      }
    }
    if (!stood) return f;
    // (read where what it captured was written)
    // (its first line is written as deep as where it started: the lines after it as much deeper again, so they stay under it)
    const line = f.text.s.lastIndexOf(end, f.b - 1) + 1, col = f.b - line, deeper = space.repeat(col - this.depth(f.text.s, line));
    const t = space.repeat(col) + (out + s.slice(from)).split(end).map((l, j) => j === 0 || l.trim() === '' ? l : deeper + l).join(end);
    return new Code(this.text_of(f.text.name, t), col, t.length, stood.ctx);
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
    // (a name the nearest holds as a value read hides one further out held as code)
    const valued = new Set<string>();
    // (where the code was written first, out from it; then what it reaches, a value it is read into among them)
    for (let n: Ray | undefined = at; n; n = n.outer) if (n.rule || n === at) this.take(n, out, valued);
    for (const n of this.reach(at)) if (n.rule || n === at) this.take(n, out, valued);
    return out;
  }
  take(n: Ray, out: Map<string, Code>, valued: Set<string>) { if (n.size) for (const [k, c] of n.m) { if (out.has(k) || valued.has(k)) continue; if (c instanceof Code) out.set(k, c); else valued.add(k); }
  }
  // whether a pattern names a capture held in a frame (a word of it, between edges)
  names_held(head: string, at: Ray): boolean {
    for (const [k, c] of this.captures(at)) if (c instanceof Code) for (let i = head.indexOf(k); i >= 0; i = head.indexOf(k, i + 1)) if (this.edge(head, i - 1) && this.edge(head, i + k.length)) return true;
    return false;
  }
  edge(head: string, i: number): boolean {
    if (i < 0 || i >= head.length) return true;
    const c = head[i], { open, close } = this.learned; if (c === open || c === close || this.blank(c)) return true;
    for (const [o, k] of this.pairs) if (head.startsWith(o, i) || head.startsWith(k, i)) return true;
    return false;
  }
  rewritten = new Map<string, Text>();
  // (code written again, alike: one text)
  texts = new Map<string, Map<string, Text>>();
  text_of(name: string, s: string): Text { let m = this.texts.get(name); if (!m) this.texts.set(name, m = new Map()); let t = m.get(s); if (!t) m.set(s, t = { name, s }); return t; }
  // Code followed back to where it was written: code that is one word naming code held where it is read is that code.
  // (`as_written`: a capture read as a value, as it was written, `x**`)
  written(c: Code, as_written = false): Code {
    for (let k = 0; k < 64 && !c.word; k++) {
      const w = c.s.trim(); let held: unknown;
      for (const n of this.reach(c.ctx)) if (n.has(w)) { held = n.m.get(w); if (as_written && !(held instanceof Code)) held = n.codes?.get(w); break; }
      if (!(held instanceof Code) || held === c) return c;
      c = held;
    }
    return c;
  }
  // ---------------------------------------------------------------- methods: heads read as what they say (the language's `@captures`)
  // what reads what is inside a capture, and the node it reads it into
  captured_by?: Ray; reading_node?: Ray; booting = false;
  // (asked on the side: what it says, or leaves unresolved, is not said)
  aside<T>(f: () => T): T {
    const said = this.diagnostics.length, mark = this.unread_log.length, steps = this.steps, applying = this.applying;
    this.steps = 0; this.applying = 0;
    try { return f(); } catch (e) { if (!(e instanceof Runaway)) throw e; return undefined as T; }
    finally { this.steps = steps; this.applying = applying; this.unsay(said); this.forget(mark); }
  }
  // text read whole in a context (else nothing): its value
  read_in(ctx: Ray, code: Code): unknown {
    const read = this.parse(code.text, code.b, code.e, ctx, 0); let end = code.e; while (end > code.b && this.blank(code.text.s[end - 1])) end--;
    if (!read || read.name || read.e !== end) return undefined;
    const v = this.within(code, ctx); return v === NOT ? undefined : v;
  }
  // a node a head is read into, written as `text`
  named(text: string): Ray { const n = new Ray(this.base); n.spelled = text; return n; }
  // a parameter of the node being read: its name, then what it says (`a: T = d`) read into it
  parameter(target: Code): unknown {
    const node = this.reading_node; if (!node) return undefined;
    const t = target.s.trim(), name = t.slice(0, this.name_end({ name: '', s: t }, 0, t.length));
    // (text written in quotes, a piece of the head as it is: its value)
    if (!name) return this.quotes.has(t[0]) ? this.walk(target) : undefined;
    (node.params ??= []).includes(name) || node.params.push(name);
    // (the head's piece for it: a node of its own, what `:` and `= d` said of it with it)
    const field = this.named(name); field.params = [name]; field.field_of = node;
    // (what it says read into the node, as written where it was: what does not read, not a parameter)
    const T = new Ray(target.ctx); T.scope = true; T.into = node; T.sees = node;
    if (t === name) return field;
    // (its name is the parameter's while it is read: not what that name reads as where the head is written, `head: String` in a class
    // that has `head`)
    const had = node.has(name); if (!had) node.m.set(name, undefined);
    const said = this.diagnostics.length;
    try { this.walk(stated(new Code(target.text, target.b, target.e, T))); } finally { if (!had) node.m.delete(name); }
    const type = node.types?.get(name), dflt = node.default_codes?.get(name);
    if (type) field.types = new Map([[name, type]]); if (dflt) { field.default_codes = new Map([[name, dflt]]); field.defaults = new Set([name]); }
    return this.diagnostics.length > said ? undefined : field;
  }
  // a member's type (what `:` said of it, as written), kept with what it is declared in
  // (in a head being read: only that, nothing read)
  typed(F: Ray, type: unknown): boolean {
    let n: Ray | undefined = F; while (n && !n.place) n = n.caller;
    const p = n?.place; if (!p || !(type instanceof Code)) return false;
    (p.here.types ??= new Map()).set(p.word, type);
    if (p.here !== this.reading_node) return false;
    this.unread.delete(p); return true;
  }
  // a parameter list read into a node (by what reads what is inside a capture)
  read_parameters(node: unknown, code: unknown): unknown {
    if (!(node instanceof Ray) || !(code instanceof Code) || !this.captured_by) return node;
    const was = this.reading_node; this.reading_node = node; node.params ??= [];
    // (its pieces, in order, as what reads them says: kept with it)
    try { node.pieces = this.read_in(this.captured_by, code); } finally { this.reading_node = was; }
    return node;
  }
  // (what reads a capture, written alike: one text)
  reader_texts = new Map<string, Text>();
  reader_text(s: string): Text { let t = this.reader_texts.get(s); if (!t) this.reader_texts.set(s, t = { name: 'reader', s }); return t; }
  // what is inside a capture, read as a parameter: its name, and what reads it (as written); none when it does not read so
  parameter_of(t: string, ctx: Ray): Piece | undefined {
    if (!this.captured_by || this.reading_node) return undefined;
    let kept = this.parameters_seen.get(t);
    if (kept === undefined) {
      const N = this.named(''); N.params = []; const was = this.reading_node; this.reading_node = N;
      let v: unknown; try { v = this.aside(() => this.read_in(this.captured_by!, new Code({ name: 'capture', s: t }, 0, t.length, ctx))); } finally { this.reading_node = was; }
      const reader = N.types?.get(N.params[0]);
      kept = v instanceof Ray && v.literal ? { name: '', lit: v.spelled } : (v === N || (v instanceof Ray && v.field_of === N)) && N.params.length === 1 ? { name: N.params[0], reader: reader ? reader.s : undefined } : null;
      if (!this.booting || kept) this.parameters_seen.set(t, kept);
    }
    if (kept?.lit !== undefined) return { lit: kept.lit };
    return kept ? { cap: kept.name, reader: kept.reader !== undefined ? new Code(this.reader_text(kept.reader), 0, kept.reader.length, ctx) : undefined } : undefined;
  }
  parameters_seen = new Map<string, { name: string; reader?: string; lit?: string } | null>();
  // `@define node receiver between`: what a definition's head was read as, defined: as written; with parameters, its name and
  // what it is given (after a space, or hugging it); applied right to left, at the top, `this` what is on its right (`receiver`).
  // Its functionality is read in a frame continuing into the node: what it is given is matched against its parameters (written
  // `between` one another, in a pair or not), each read by its type; what is not given is what the node says.
  define(F: Ray, node: unknown, receiver: unknown, between: unknown): unknown {
    // (the definition it is asked for: the nearest that reads a definition, through what reads code where it is given)
    let R: Ray | undefined = F.caller; while (R && !(R.rule && R.rule.pairs === 0)) R = R.caller ?? (R.rule ? undefined : R.outer);
    if (!R || !(node instanceof Ray) || node.spelled === undefined) return undefined;
    const at = R.caller!, statement = R.statement, caps = R.rule!.pieces.filter(x => 'cap' in x) as { cap: string }[];
    const f = R.m.get(caps[caps.length - 1].cap) as Code;
    if (DBGF && node instanceof Ray && node.spelled === '') console.log('  define f', JSON.stringify(f.s), 'f.ctx#', this.id(f.ctx), 'R#', this.id(R), 'R.caller#', this.id(R.caller));
    const text = this.text_of(f.text.name, node.spelled), head = new Code(text, 0, text.s.length, at);
    // (one read as another statement: that statement, read again where it was written)
    // (not when that is this one again: then as written)
    if (node.again && !this.restating.has(node.spelled)) {
      const { end, space, definer } = this.learned, line = f.text.s.lastIndexOf(end, f.b - 1) + 1, col = this.depth(f.text.s, line), t = space.repeat(col) + node.spelled + space + definer + space + f.s;
      this.restating.add(node.spelled); try { return this.walk(stated(new Code(this.text_of(f.text.name, t), col, t.length, at))); } finally { this.restating.delete(node.spelled); }
    }
    if (!node.params && !node.leftward) { if (node.own) this.static_now++; try { return this.defined(head, f, at, statement); } finally { if (node.own) this.static_now--; } }
    if (typeof between === 'string') node.between = between;
    // (a method without a name is a value, a closure, where code is run; read into a value (a class's block), it is how that value is
    // called)
    const declares = statement && (node.spelled !== '' || (at.into !== undefined && !at.into.scope));
    // (a closure has no `this` of its own: `this` in it is the one where it was written)
    // (a closure whose functionality is code a rule was handed: it closes over where that code was written, not over the rule)
    const body = this.unblocked(this.written(f)), handed = body.ctx !== at;
    const into = declares ? at.into ?? at : Object.assign(new Ray(handed ? body.ctx : at), { closure: node.spelled === '' });
    // (read again into what continues into a class that has it, from the same text: that one)
    if (declares && !into.scope) for (let n = into.outer; n && !n.scope; n = n.outer) { const was = n.eqs.find(x => x.node && x.body.text === body.text && x.body.b === body.b && x.body.e === body.e && x.body.ctx.outer === body.ctx.outer); if (was) return this.held_as(was); }
    const { open, close, space } = this.learned, name = node.spelled, out: Eq[] = [];
    const r = node.params || typeof receiver !== 'string' ? this.given_name : receiver;
    // (what it is given: a capture no name written can be)
    const form = (pieces: Piece[], apart: boolean) => { const eq = this.add(node.params || !node.leftward ? into : this.global, pieces, body, node); eq.node = node; if (apart && eq.indexed) this.syntax++; eq.apart = apart; if (this.static_now > 0 || node.own) eq.own = true; if (!node.params) eq.receiver = r; out.push(eq); };
    const lead = (s: string) => { const ps = this.pieces(s, at); const last = ps[ps.length - 1]; if (last && 'lit' in last) return ps; return [...ps, { lit: '' }].filter(x => !('lit' in x) || x.lit !== ''); };
    const cap: Piece = { cap: r };
    // (what is given between a pair, `[at: Integer]`: read between it, `xs[3]`)
    if (node.closing !== undefined) form([{ lit: name }, cap, { lit: node.closing }], false);
    else if (name === '') form([cap], false);
    else { form([...lead(name), cap], false); const sp = lead(name + space); form(sp[sp.length - 1] && 'lit' in sp[sp.length - 1] ? [...sp, cap] : [...lead(name), { lit: space }, cap], true); }
    // (all of its parameters with a default: also as written alone)
    if (node.params && name !== '' && node.closing === undefined && node.params.every(x => this.defaulted_param(node, x))) { const eq = this.add(into, this.pieces(name, at), body, node); eq.node = node; out.push(eq); }
    return declares ? this.held_as(out[0]) : into;
  }
  // (a parameter with a default: written `= d` on it in its head)
  defaulted_param(node: Ray, x: string): boolean { return !!node.defaults?.has(x) || this.valued(node, x) !== undefined; }
  given_name = '\u0000given'; restating = new Set<string>();
  // what a method was given, matched against its parameters (out of the one pair it may be written in), from all of them to as
  // few as its defaults allow; NOT when it does not read so
  bound(eq: Eq, F: Ray, code: Code): Cap[] | typeof NOT {
    const node = eq.node!, params = node.params!, given = F.m.get(this.given_name);
    if (!(given instanceof Code) || !this.held(given.text, given.b, given.e)) { F.m.delete(this.given_name); return params.length === 0 || params.every(x => this.defaulted_param(node, x)) ? [] : NOT; }
    let b = given.b, e = given.e; const s = given.text.s; while (b < e && this.blank(s[b])) b++; while (e > b && this.blank(s[e - 1])) e--;
    // (a bracket around what is given, not quotes: `"x"` is a value)
    const close = this.quotes.has(s[b]) ? undefined : this.pairs.get(s[b]); if (node.closing === undefined && close !== undefined && s[e - 1] === close && this.scan(given.text, b + 1, e - 1, () => {}) === e - 1) { b++; e--; }
    F.m.delete(this.given_name);
    if (!this.held(given.text, b, e)) return params.every(x => this.defaulted_param(node, x)) ? [] : NOT;
    const between = node.between ?? ', ';
    for (let k = params.length; k >= 0; k--) {
      if (k < params.length && !this.defaulted_param(node, params[k])) break;
      if (k === 0) { if (this.held(given.text, b, e)) break; return []; }
      if (k === 1) return [{ name: params[0], b, e, floor: 0, reader: node.types?.get(params[0]), argument: true }];
      let sub = this.subs.get(node)?.[k]; if (!sub) { const pieces: Piece[] = []; params.slice(0, k).forEach((x, i) => { if (i) pieces.push({ lit: between }); pieces.push({ cap: x, reader: node.types?.get(x) }); }); sub = equivalence({ pieces, body: eq.body, ctx: eq.ctx, order: 0, seq: eq.seq, key: '', pairs: Infinity }); const m = this.subs.get(node) ?? []; m[k] = sub; this.subs.set(node, m); }
      const r = this.match(sub, given.text, b, e, given.ctx, 0, b, []);
      if (r && r.e >= e) return r.caps.map(c => ({ ...c, argument: true }));
    }
    return NOT;
  }
  subs = new WeakMap<Ray, Eq[]>();
  // whether reading in `ctx` reads by the rules of `c`
  inside(ctx: Ray, c: Ray): boolean { for (let n: Ray | undefined = ctx; n; n = n.outer) if (n === c || n.into === c) return true; return false; }
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
        // (a capture: what the language reads inside it as a parameter, its name and what reads it; else a name, then what reads it)
        const t = inner.trim(), said = this.parameter_of(t, ctx);
        if (said && 'lit' in said) { lit += said.lit; i = j + 1; continue; }
        if (said) { if (lit) { out.push({ lit }); lit = ''; } out.push(said); i = j + 1; continue; }
        const w = t.indexOf(space), name = w < 0 ? t : t.slice(0, w), reader = w < 0 ? '' : t.slice(w + 1).trim();
        // (one whose name holds brackets, or read by a bracket, is brackets written around it)
        if (j > i + 1 && t !== '' && !name.includes(open) && !name.includes(close) && reader[0] !== open) {
          if (lit) { out.push({ lit }); lit = ''; }
          out.push({ cap: name, reader: reader ? new Code(this.reader_text(reader), 0, reader.length, ctx) : undefined });
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
  // that does not close a pair (empty lines go on). (Any deeper line goes on: a label is written a space less deep.)
  stop(text: Text, p: number, limit: number, base: number): number {
    const s = text.s, { end, indent } = this.learned;
    for (let i = p; ;) {
      const e = s.indexOf(end, i);
      if (e < 0 || e >= limit) return limit;
      let n = e + end.length; while (n < limit && s.startsWith(end, n + this.depth(s, n))) n += this.depth(s, n) + end.length;
      if (n >= limit) return e;
      const d = this.depth(s, n);
      if (d > base || (d === base && (this.closes(s, n + d) || (this.leads(s, n + d) && !this.named_by(s, n + d, s.slice(n + d, this.name_end({ name: '', s }, n + d, s.length)))) || this.trails(s, e)))) { i = n; continue; }
      return e;
    }
  }
  // the name a head starts with
  lead(pieces: Piece[]): string { const p = pieces[0]; if (!('lit' in p)) return ''; let i = 0; while (i < p.lit.length && !this.edge(p.lit, i) && !this.pairs.has(p.lit[i])) i++; return p.lit.slice(0, i); }
  // whether a line ends with what reads on from a value, a value to follow it on the next line (G2.12): `a,`
  trails(s: string, e: number): boolean {
    let j = e; while (j > 0 && s[j - 1] === this.learned.space) j--;
    // (what is read after a value as all it reads ends it: `x**`)
    for (const l of this.postfixes) if (s.endsWith(l, j)) return false;
    for (const l of this.trailing) if (s.endsWith(l, j) && (this.blank(s[j - l.length - 1]) || !this.postfixes.has(l))) return true;
    return false;
  }
  // literals read after a value as all it reads (`T?`); operators that may end a line, a value following on the next
  postfixes = new Set<string>(); trailing = new Set<string>();
  indexed(x: { lit: string; eq: Eq }) {
    const ps = x.eq.pieces; if (ps.length === 2 && 'cap' in ps[0] && 'lit' in ps[1]) this.postfixes.add(ps[1].lit);
    const l = x.lit.trimEnd(); if (l.length > 0 && l !== x.lit && !x.eq.ctx.scope && !x.eq.node && !this.bracket(l[0])) this.trailing.add(l);
  }
  // whether a line starts with what reads on from a value (and is not a definition): it goes on with the line above (G2.13)
  leads(s: string, at: number): boolean {
    const { end, definer, space } = this.learned, line = s.slice(at, s.indexOf(end, at) < 0 ? s.length : s.indexOf(end, at));
    if (line.includes(space + definer)) return false;
    const j = s.indexOf(space, at);
    for (const x of [...this.infix.get(s[at]) ?? [], ...this.infix.get(space) ?? [], ...(j > at ? this.words.get(s.slice(at, j)) ?? [] : [])]) { const l = x.lit.trimStart(); if (l.length > 0 && !this.bracket(l[0]) && s.startsWith(l, at) && !x.eq.ctx.scope && !x.eq.apart && 'lit' in x.eq.pieces[0] && !this.shorter(l, { name: '', s }, at) ) return true; }
    return false;
  }
  // (an operator written first, a space, then an operator written apart, `* := Node`: the operator is a name, not what reads on)
  named_by(s: string, at: number, l: string): boolean {
    let k = at + l.trimEnd().length; if (!this.blank(s[k])) return false; while (k < s.length && s[k] === this.learned.space) k++;
    let j = k; while (j < s.length && !this.blank(s[j])) j++;
    return j > k && j < s.length && (this.operators.get(s[k])?.has(s.slice(k, j)) ?? false);
  }
  *statements(code: Code): Generator<[number, number]> {
    const s = code.text.s, { end } = this.learned;
    // (where each statement ends, kept while nothing that reads on from a value, or balances, was declared since)
    let at = this.splits.get(code.text); if (!at) this.splits.set(code.text, at = new Map());
    let from = at.get(code.b); if (!from) at.set(code.b, from = new Map());
    let kept = from.get(code.e); if (!kept) from.set(code.e, kept = { list: [] });
    let p = code.b, block = -1;
    for (let i = 0; p < code.e; i++) {
      const k = kept.list[i];
      if (k && k.syntax === this.syntax) { block = k.block; yield [k.p, k.e]; p = k.e; continue; }
      while (p < code.e && this.blank(s[p])) p++;
      if (p >= code.e) { kept.count = i; kept.counted = this.syntax; break; }
      // (a statement less deep than the block's first, a label, ends as the block's statements do)
      const line = s.lastIndexOf(end, p - 1) + end.length, own = this.depth(s, line) === p - line ? p - line : 0;
      if (block < 0) block = own;
      const base = Math.max(own, block), e = this.stop(code.text, p, code.e, base);
      kept.list.length = i; kept.list.push({ p, e, block, syntax: this.syntax });
      yield [p, e];
      p = e;
      if (p >= code.e) { kept.count = i + 1; kept.counted = this.syntax; }
    }
  }
  // (whether code is one statement, as last split: undefined when that is not known now)
  single(code: Code): boolean | undefined {
    const k = this.splits.get(code.text)?.get(code.b)?.get(code.e);
    if (!k || k.counted !== this.syntax || k.count === undefined) return undefined;
    for (let i = 0; i < k.count; i++) if (k.list[i]?.syntax !== this.syntax) return undefined;
    return k.count === 1;
  }
  splits = new WeakMap<Text, Map<number, Map<number, { list: { p: number; e: number; block: number; syntax: number }[]; count?: number; counted?: number }>>>();
  // (how often an operation read on from a value was first declared: what reads on from any value may differ since)
  sent = 0;
  // (how often what reads on from a value, or what balances, was declared: where statements end may differ since)
  syntax = 0;

  // ---------------------------------------------------------------- equivalences: added to the Expression of a context
  add(ctx: Ray, pieces: Piece[], given: Code | Value, node?: Ray): Eq {
    this.adds++;
    const key = pieces.map(p => 'lit' in p ? p.lit : this.learned.open + this.learned.close).join('');
    const body = given instanceof Value ? given.code : given;
    // (one that reads definitions reads heads: brackets there are a pattern's, not pairs)
    const heads = pieces.some(x => 'lit' in x && x.lit.includes(this.learned.definer));
    const eq = equivalence({ pieces, body, ctx, order: this.order, seq: this.order++, key, pairs: heads ? 0 : Infinity });
    // (an operation on values binds as its head was first declared: what a class declares again keeps that place)
    if (!ctx.scope) { const first = this.heads.get(key); if (first === undefined) this.heads.set(key, eq.order); else eq.order = first; }
    // (a value under a name is a name: read where it is read, not a rule; declaring one changes no reading)
    if (given instanceof Value) { const v = given.value; eq.native = () => v; eq.value = true; }
    if (ctx.eqs === NONE) ctx.eqs = [];
    // (the same head again in the same place: it replaces the one before, and reads the same)
    // (overloads by what their captures are read by are not the same head)
    const readers = (ps: Piece[], n?: Ray) => ps.map(p => 'cap' in p && p.reader ? p.reader.s : 'cap' in p && p.type !== undefined ? '#' + this.id(p.type) : '').join('\0') + (n?.params ? '\0' + n.params.map(x => this.id(n.types?.get(x))).join(',') : '');
    // (nor the class's own (`static`) and what is made of it's)
    const was = ctx.eqs.findIndex(x => x.key === key && readers(x.pieces, x.node) === readers(pieces, node) && !!x.own === (this.static_now > 0 || !!node?.own));
    if (was >= 0) { const old = ctx.eqs[was]; if (!(old.value && eq.value)) this.changed(pieces, ctx); old.body = eq.body; old.native = eq.native; old.js = undefined; old.word = undefined; old.pieces = eq.pieces; old.value = eq.value; ctx.led = undefined; if ('lit' in pieces[0]) this.declared.set(this.lead(pieces), eq.seq); return old; }
    ctx.eqs.push(eq); ctx.led = undefined; if (!eq.value) this.changed(pieces, ctx);
    if ('lit' in pieces[0]) this.declared.set(this.lead(pieces), eq.seq);
    const p0 = pieces[0], p1 = pieces[1];
    // (read on a value: added at one, taking something; one that takes nothing is a member, read in the value)
    // (a name and an opened bracket, `m(`, is a method's call: read in the value, after what reads members)
    const call = 'lit' in p0 && p0.lit.length > 1 && !p0.lit.includes(this.learned.space) && this.pairs.has(p0.lit[p0.lit.length - 1]);
    const operator = !ctx.scope && 'lit' in p0 && !call && (pieces.length > 1 || this.bracket(p0.lit[0]));
    if (operator) {
      eq.operator = true;
      const k = 'lit' in p0 ? p0.lit[0] : '';
      let list = this.sends.get(k); if (!list) this.sends.set(k, list = []);
      // (read on a value, one head written alike stands for all of them: which applies is the value's)
      const sig = readers(pieces, node); if (!list.some(x => x.key === key && readers(x.pieces, x.node) === sig)) { list.push(eq); this.sent++; }
    }
    const after = operator && 'lit' in p0 ? p0.lit : p0 && !('lit' in p0) && p1 && 'lit' in p1 ? p1.lit : undefined;
    // (a definition is a whole statement: what reads one never reads on from inside another)
    // (a method's name hugging what it is given, one name as written, `or{…}`: a call after a member, not where names end)
    const named = !!node && after !== undefined && operator && this.name_end({ name: '', s: after }, 0, after.length) === after.length;
    if (after !== undefined && !heads && !named) {
      // (a method's name and a space, `s {…}`, is written apart, whatever its length)
      const apart = this.apart(after) || (!!node && after.endsWith(this.learned.space) && this.name_end({ name: '', s: after }, 0, after.length) === after.length - 1);
      const by = apart ? this.words : this.infix, k = apart ? after.slice(0, after.indexOf(this.learned.space)) : after[0];
      let list = by.get(k); if (!list) by.set(k, list = []);
      if (!list.some(x => x.lit === after && x.eq.key === key && x.order <= eq.order && x.eq.ctx.alone === ctx.alone && (!ctx.alone || x.eq.ctx === ctx))) { const x = { lit: after, order: eq.order, eq, from: operator && 'lit' in p0 ? 0 : 1 }; list.push(x); eq.indexed = true; this.syntax++; if (by === this.infix) this.indexed(x); if (x.order < this.earliest) this.earliest = x.order; this.spelled(after); }
    }
    // (a quote, one character, a capture, the quote: that character escapes what follows it inside the quote)
    if (pieces.length === 3 && 'lit' in p0 && p0.lit.length === 2 && this.quotes.has(p0.lit[0]) && !this.blank(p0.lit[1]) && !('lit' in p1) && 'lit' in pieces[2] && pieces[2].lit === p0.lit[0] && this.escapes.get(p0.lit[0]) !== p0.lit[1]) { this.escapes.set(p0.lit[0], p0.lit[1]); this.paired++; this.syntax++; }
    // (`open {x} close` where statements are read, a character each: a pair that balances)
    if (ctx.scope && !ctx.alone && pieces.length === 3 && 'lit' in p0 && !('lit' in p1) && (!p1.reader || p1.reader.s.trim() === this.learned.type) && 'lit' in pieces[2] && p0.lit.length === 1 && pieces[2].lit.length === 1 && !this.blank(p0.lit)) { this.pairs.set(p0.lit, pieces[2].lit); if (p0.lit === pieces[2].lit) this.quotes.add(p0.lit); else this.closers.add(pieces[2].lit); this.paired++; this.syntax++; }
    return eq;
  }

  // ---------------------------------------------------------------- the walk
  // A span read from `b`: the best of the readings of what starts there (an equivalence of the context, or a name), then what
  // reads on from the value it gives (an equivalence added at a value), each from the floor on.
  parse(text: Text, b: number, e: number, ctx: Ray, floor: number, not?: Set<Eq>): Read | undefined {
    this.counts.parses++;
    const s = text.s; while (b < e && this.blank(s[b])) b++; while (e > b && this.blank(s[e - 1])) e--;
    if (b >= e) return undefined;
    let best: Read | undefined;
    // (each reading of what starts there, with what reads on from it)
    // (what reads definitions is tried on a definition only: the definer written outside every bracket)
    let defines = false; if (this.contains(text, b, e, this.learned.definer)) this.scan(text, b, e, i => { if (this.literal(text, this.learned.space + this.learned.definer, i, e) >= 0) { defines = true; return false; } });
    let self: unknown, held = false, near = 0, span: string | undefined; const found = new Map<string, boolean>();
    const word = s.slice(b, this.name_end(text, b, e));
    for (const n of this.reach(ctx)) {
      near++;
      if (self === undefined && n.into && !n.into.scope && !n.rule) self = n.self ?? n.into;
      if (!n.scope && n !== this.base && self === undefined) self = n;
      // (only those led by what is written first, or by a capture: in the order declared, the latest first)
      const led = this.led(n), a = led.get(s[b]) ?? NO_LEAD, c = led.get('') ?? NO_LEAD;
      for (let x = a.length - 1, y = c.length - 1; x >= 0 || y >= 0;) {
        const i = y < 0 || (x >= 0 && a[x] > c[y]) ? a[x--] : c[y--];
        const eq = n.eqs[i], p0 = eq.pieces[0];
        if (eq.value || not?.has(eq)) continue;
        // (a rule does not read the whole of its own functionality: that never ends)
        if (eq.body.text === text && this.whole(eq.body, b, e)) continue;
        if ((eq.pairs === 0 && !defines) || eq.busy) continue;
        // (a value's equivalence led by a bracket is a call on it, an operator of it reads after it: not where a statement starts)
        if (!n.scope && 'lit' in p0 && this.bracket(p0.lit[0])) continue;
        // (a name a nearer context holds hides a member of that name further out)
        if (held && 'lit' in p0 && (eq.pieces.length === 1 ? p0.lit === word : !n.scope && p0.lit.startsWith(word))) continue;
        // (one capture its reader reads, alone: what it reads, read at any precedence)
        const atom = eq.pieces.length === 1 && !('lit' in p0) && p0.reader !== undefined && n.scope;
        // (one led by a capture reads only what has its literals in it)
        if (!('lit' in p0) && !atom) { const k = this.needle(eq.pieces); if (k) { let h = found.get(k); if (h === undefined) found.set(k, h = (span ??= s.slice(b, e)).includes(k)); if (!h) continue; } }
        if ('lit' in p0 ? s[b] === p0.lit[0] && this.literal(text, p0.lit, b, e) >= 0 : eq.order >= floor || atom) { const r = this.match(eq, text, b, e, ctx, 0, b, []); if (r) { if (!n.scope) r.self = self; r.near = near; const o = this.on(r, text, e, ctx, floor, not); if (this.better(o, best)) best = o; } }
      }
      if (word && (n.has(word) || this.has_key(n, word))) held = true;
    }
    // a name: up to where something reads on
    // (not where an operator is written: `!=` is no name)
    const w = this.name_end(text, b, e); if (w > b && (!this.operator_at(text, b) || this.named_by(s, b, s.slice(b, w))) && !(this.infix.has(s[b]) && this.leads(s, b) && !this.named_by(s, b, s.slice(b, w)))) { const o = this.on(read_of(undefined, true, [], b, w), text, e, ctx, floor, not); if (this.better(o, best)) best = o; }
    // (what begins with what reads on from a value, read whole by nothing else, reads on from what it is read in: `!= " "` in
    // `Char{!= " "}`)
    if ((!best || best.e < e) && this.leads(s, b)) { const o = this.on(read_of(this.implicit, false, [], b, b), text, e, ctx, floor, not); if (o.e > b && this.better(o, best)) best = o; }
    // (one character of what reads on, written apart, ` . + 1`: the value it reads on, itself)
    if ((!best || best.e < e) && b + 1 < e && this.blank(s[b + 1]) && this.leads(s, b)) { const o = this.on(read_of(this.implicit, false, [], b, b + 1), text, e, ctx, floor, not); if (this.better(o, best)) best = o; }
    return best;
  }
  led(n: Ray): Map<string, number[]> {
    if (n.led) return n.led;
    const m = new Map<string, number[]>(), keys = new Set<string>(); let ruled = false;
    n.eqs.forEach((eq, i) => { const p0 = eq.pieces[0], k = 'lit' in p0 ? p0.lit[0] : ''; let l = m.get(k); if (!l) m.set(k, l = []); l.push(i); keys.add(eq.key); if (!eq.value) ruled = true; });
    n.keys = keys; n.ruled = ruled;
    return n.led = m;
  }
  // (the longest run of a pattern's literals written without a space: what any text it reads has in it)
  needle(pieces: Piece[]): string {
    let k = this.needles.get(pieces);
    if (k === undefined) { k = ''; for (const p of pieces) if ('lit' in p) for (const w of p.lit.split(this.learned.space)) if (w.length > k.length) k = w; this.needles.set(pieces, k); }
    return k;
  }
  needles = new WeakMap<Piece[], string>();
  // (whether a span has a literal in it, not copied out)
  contains(text: Text, b: number, e: number, k: string): boolean { if (!k) return true; const i = text.s.indexOf(k, b); return i >= 0 && i + k.length <= e; }
  // (what a statement that begins by reading on reads on from: the value it is read in)
  implicit: Eq = equivalence({ pieces: [], body: new Code({ name: '', s: '' }, 0, 0, new Ray()), ctx: new Ray(), order: -1, seq: -1, key: '', pairs: Infinity, native: F => { const e = this.element_of(F); return e !== undefined ? e : this.self(F); } });
  // A reading with what reads on from its value, as far as it goes.
  on(best: Read, text: Text, e: number, ctx: Ray, floor: number, not?: Set<Eq>): Read {
    const s = text.s;
    // (a context that reaches neither the language's top nor the base reads no operators: a word is read there)
    let reaches = false; for (const n of this.reach(ctx)) if (n === this.global || n === this.base) { reaches = true; break; }
    if (!reaches) return best;
    while (best.e < e) {
      let on: Read | undefined, at = best.e, span: string | undefined;
      const spaced = this.blank(s[at]); while (at < e && this.blank(s[at])) at++;
      for (const list of [this.sends.get(s[at]), this.sends.get('')]) if (list) for (const eq of list) {
        if ((eq.order < floor && spaced) || not?.has(eq) || eq.busy) continue;
        if (best.e > best.b && !this.blank(s[at - 1]) && 'lit' in eq.pieces[0] && (eq.apart || this.apart(eq.pieces[0].lit))) continue;
        { const k = this.needle(eq.pieces); if (k && !(span ??= s.slice(at, e)).includes(k)) continue; }
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
  reach(ctx: Ray): Ray[] {
    const out: Ray[] = [], epoch = ++this.epoch;
    // (the base last: what every value continues into answers after everything written around it)
    // (a context of its own is reached only by what is read in it)
    this.read_alone = ctx.alone ? ctx : ctx.written && ctx.into?.alone ? ctx.into : undefined;
    if (this.reach_(ctx, out, epoch) && this.base && this.base.seen !== epoch) { this.base.seen = epoch; this.base.reached ??= this.version; out.push(this.base); }
    return out;
  }
  read_alone?: Ray; receiving?: Place;
  reach_(ctx: Ray, out: Ray[], epoch: number): boolean {
    let valued = false, sees: Ray[] | undefined;
    // (a block read into a value reaches that value first, then where it was written)
    for (let n: Ray | undefined = ctx; n && n.seen !== epoch; n = n.outer) {
      if (n === this.base) { valued = true; break; }
      if (n.alone && n !== this.read_alone) continue;
      n.seen = epoch; n.reached ??= this.version; if (!n.scope || (n.into && !n.into.scope)) valued = true; out.push(n);
      if (n.sees && n.sees === n.into) { if (this.reach_(n.sees, out, epoch)) valued = true; } else if (n.sees) (sees ??= []).push(n.sees);
      // (what it is also made of, `A + B`: next to what it continues into, before what is further out)
      if (n.also) for (const x of n.also) if (this.reach_(x, out, epoch)) valued = true;
    }
    if (sees) for (const x of sees) if (this.reach_(x, out, epoch)) valued = true;
    return valued;
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
    // (the same head written again in the same place overrides it: R2.5)
    if (a.eq.key === b.eq.key) {
      if (a.eq.ctx !== b.eq.ctx) return false;
      const ta = this.typed_as(a.eq), tb = this.typed_as(b.eq);
      if (ta === tb) return a.eq.seq > b.eq.seq;
      const ua = ta.replace(/\0|,/g, '') === '', ub = tb.replace(/\0|,/g, '') === '';
      if (ua !== ub) return ub;
      return a.eq.seq < b.eq.seq;
    }
    for (let i = a.b; i < a.e; i++) { const x = a.caps.some(c => i >= c.b && i < c.e), y = b.caps.some(c => i >= c.b && i < c.e); if (x !== y) return !x; }
    // (a capture left empty: less particular)
    const ea = a.caps.some(c => c.b === c.e), eb = b.caps.some(c => c.b === c.e);
    if (ea !== eb) return eb;
    return a.eq.order < b.eq.order;
  }
  typed_as(eq: Eq): string { return eq.pieces.map(p => 'cap' in p && p.reader ? p.reader.s : '').join('\0') + (eq.node?.params ? '\0' + eq.node.params.map(x => eq.node!.types?.get(x)?.s ?? '').join(',') : ''); }
  // Where an equivalence reads from `at`: its literals exactly (a space also reads line ends and indentation); a capture enclosed
  // by literals up to where the next one is (the latest first, pairs balanced); one leading the head no further than what binds
  // looser; one ending it as far as an operand from its own equivalence on goes. A capture with a reader holds only what it reads.
  match(eq: Eq, text: Text, at: number, e: number, ctx: Ray, i: number, start: number, caps: Cap[]): Read | undefined {
    if (DEADLINE && performance.now() > DEADLINE) { writeSync(2, `deadline: matching ${eq.key.slice(0, 40)} on ${text.name}:${text.s.slice(0, at).split(this.learned.end).length} steps=${this.steps} settling=${this.settling} applying=${this.applying}\n`); process.exit(3); }
    if (i === 0) this.counts.matches++;
    if (i === eq.pieces.length) return read_of(eq, false, [...caps], start, at);
    const piece = eq.pieces[i];
    if ('lit' in piece) {
      // (a head, what is before the definer, is balanced)
      const n = this.literal(text, piece.lit, at, e); if (n < 0) return undefined;
      // (a method's name is the whole of a name written there: `map` is not read in `mapping`)
      if (i === 0 && eq.node && n < e && !this.blank(text.s[n - 1]) && this.name_end(text, at, e) > n) return undefined;
      // (not where a longer operator it begins is written: `!` is not read in `!=`, `.` not in `..<`)
      if (this.shorter(piece.lit, text, at)) return undefined;
      // (not where it would be the rest of another operator written there: `?` is not the second of `??`; a space is no operator's)
      if (i > 0 && piece.lit.length === 1 && !this.blank(piece.lit) && at > 0 && !this.blank(text.s[at - 1]) && this.longer(text.s[at - 1], text.s[at])) return undefined;
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
      // (a closure's parameter is what it is called with, `f(x)`: not a block it is read with, `f ~~ { … }`)
      if (i === 0 && !(piece.reader && eq.ctx.scope) && (eq.ctx.scope || (eq.ctx.closure && this.calling !== eq.ctx) || eq.pieces.length > 1 || !(ctx.sees === eq.ctx || (ctx.written && (ctx.outer === eq.ctx || (ctx.level && this.made_of_(ctx.outer, eq.ctx))))) || (this.deciding > 0 && !eq.ctx.scope && !eq.ctx.closure))) return undefined;
      // (after the definer: the functionality, to the end; an operator read on a value reads one operand: the same operator after it reads on from what it gives)
      // (led by a literal, a statement: its last capture, the rest; an operator's, one operand)
      // (a reader's own rule, read in a value as its type: to the end, too)
      const statement = ('lit' in eq.pieces[0] && eq.ctx.scope) || (!('lit' in eq.pieces[0]) && !eq.ctx.scope);
      // (an operation hugging its value, written without a space: its operand ends at any operation written with one)
      const hugs = !eq.ctx.scope && 'lit' in eq.pieces[0] && !eq.pieces.some(x => 'lit' in x && x.lit.includes(this.learned.space));
      const atom = i === 0 && piece.reader !== undefined;
      // (led by a literal: the rest, as a statement reads it, `return x if c`)
      const r = prev && 'lit' in prev && prev.lit.includes(this.learned.definer) ? e : statement && 'lit' in eq.pieces[0] ? this.rest(eq, text, at, e, ctx) : statement && !atom ? this.scan(text, at, e, () => {}, eq.pairs) : this.operand(text, at, e, hugs || atom ? Infinity : floor, ctx, eq.pairs, !eq.ctx.scope && 'lit' in eq.pieces[0]); ends = r > at && this.held(text, at, r) ? [r] : [];
      // (an atom: as far as an operand goes, else just the name there, `0` in `0..<n`)
      if (atom) { const w = this.name_end(text, at, e); if (w > at && w < r) ends.push(w); }
      // (what hugs a literal, opening a pair: to where that pair closes, `f(a).b`)
      if (prev && 'lit' in prev && !this.blank(prev.lit[prev.lit.length - 1]) && this.pairs.has(text.s[at]) && !this.quotes.has(text.s[at])) { const c = this.scan(text, at + 1, e, () => {}); if (c < e && text.s[c] === this.pairs.get(text.s[at])) ends = [c + 1]; } }
    else {
      // (what follows the definer in a head reader is functionality: its brackets balance)
      const after = eq.pairs === 0 && eq.pieces.slice(0, i).some(x => 'lit' in x && x.lit.includes(this.learned.definer));
      // (between the two of a pair read as nothing inside, `"…"`: what is inside balances nothing)
      const quoted = !!prev && 'lit' in prev && 'lit' in next && this.quotes.has(prev.lit[prev.lit.length - 1]) && next.lit[0] === prev.lit[prev.lit.length - 1];
      // (what the definer follows is on the line it starts: a head is written on one line)
      const line = 'lit' in next && next.lit.includes(this.learned.definer) ? text.s.indexOf(this.learned.end, at) : -1;
      ends = this.ends(text, at, line >= 0 && line < e ? line + 1 : e, 'lit' in next ? next.lit : undefined, quoted ? 0 : after ? Infinity : eq.pairs);
      // (inside a bracket, or a pair, a capture may hold nothing, or only spaces: after what opens it, or before what closes it)
      bracketed = (next && 'lit' in next && this.closer(next.lit[0])) || (prev && 'lit' in prev && this.opener(prev.lit[prev.lit.length - 1]));
      if (bracketed && ('lit' in next ? this.literal(text, next.lit, at, e) >= 0 : true)) ends.push(at);
      // (one leading the head, the longest; one between two literals, the shortest)
      // (a head, before the definer: to the definer, whatever it holds)
      if (i === 0 && !('lit' in next && next.lit.includes(this.learned.definer))) { const o = this.operand(text, at, e, floor, ctx, eq.pairs); ends = ends.filter(n => n <= o); } else if (i > 0) ends.reverse();
      // (before a space: not where what follows reads on from it, nor after what reads on: `class: A + B { … }` has the parent `A + B`)
      if (i > 0 && 'lit' in next && next.lit.trim() === '' && !after) ends = ends.filter(n => { let k = n; while (k < e && this.blank(text.s[k])) k++; return !this.spaced_operator(text.s, k) && !(this.trails(text.s, n) && this.held(text, at, n) && text.s.slice(at, n).trim().includes(this.learned.space)); });
      // (between two literals, outside a pair: up to an operation declared before it, as an operand, `{g}({b})` in `a | b : T = f(x)`)
      if (i > 0 && !after && !bracketed && !quoted && eq.order >= this.earliest && !('lit' in next && next.lit.includes(this.learned.definer))) { const o = this.operand(text, at, e, eq.order, ctx, eq.pairs); ends = ends.filter(n => n <= o); }
      // (a head ends at a definer that ends its line, the functionality below it, as the first statement's does; else at the first)
      if ('lit' in next && next.lit.includes(this.learned.definer)) {
        const { definer, end } = this.learned, at_end = (n: number) => { const d = text.s.indexOf(definer, n); return d >= 0 && text.s[d + definer.length] === end; };
        const up = [...ends].sort((x, y) => x - y);
        ends = [...up.filter(at_end).reverse(), ...up.filter(n => !at_end(n))];
      }
    }
    const fixed = piece.type !== undefined ? (piece.type instanceof Ray ? piece.type : REJECT) : this.fixed(piece.reader, eq);
    if (fixed === REJECT) return undefined;
    // (a literal written hugging the capture before it, `{value}?`, is read hugging it)
    const hugged = !!next && 'lit' in next && !this.blank(next.lit[0]) && !this.bracket(next.lit[0]) && !this.quotes.has(next.lit[0]);
    for (const n of ends) {
      if (n > at && !this.held(text, at, n) && !bracketed) continue;
      if (hugged && n > at && this.blank(text.s[n - 1])) continue;
      if (fixed && (n === at || !this.reads(fixed, text, at, n, eq, ctx))) continue;
      const block = !!prev && 'lit' in prev && prev.lit.endsWith(this.learned.open) && !!next && 'lit' in next && next.lit.startsWith(this.learned.close);
      caps.push({ name: piece.cap, b: at, e: n, floor, reader: piece.reader, type: piece.type, block, argument: false });
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
    // (kept per reader and rule, until something is declared under the reader's first word)
    let m = this.dependents.get(reader); if (!m) this.dependents.set(reader, m = new Map());
    const k = m.get(eq ?? reader), at = this.latest(reader); if (k && k.at === at) return k.r;
    const r = this.dependent_(reader, eq); m.set(eq ?? reader, { at, r }); return r;
  }
  dependents = new WeakMap<Code, Map<object, { at: number; r: boolean }>>();
  dependent_(reader: Code, eq?: Eq): boolean {
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
    const said = this.diagnostics.length, mark = this.unread_log.length, steps = this.steps;
    this.deciding++; let r: unknown; try { r = this.walk(eq ? new Code(reader.text, reader.b, reader.e, eq.body.ctx) : reader); } finally { this.deciding--; }
    this.steps = steps;
    this.unsay(said); this.forget(mark);
    // (what reads nothing there yet reads nothing until something is declared)
    return r === this.expression ? undefined : r instanceof Ray ? r : REJECT;
  }
  // whether a reader reads a span whole (the parameters of a value, typed by a value that is not a scope, read any: what is read
  // where it was written, if it is one of it)
  reads(r: Ray, text: Text, b: number, e: number, eq: Eq, ctx?: Ray): boolean {
    if (r.test) return r.test(text.s.slice(b, e).trim()) !== undefined;
    // (what is read by a value, not a block read into it: what it is called with)
    const was = this.calling; this.calling = r; try { return this.reads_(r, text, b, e, eq, ctx); } finally { this.calling = was; }
  }
  calling?: Ray; wording = false;
  reads_(r: Ray, text: Text, b: number, e: number, eq: Eq, ctx?: Ray): boolean {
    // (the parameters of a value's rule, or of a call, `f(a: T)`: values, decided where applied)
    if (!r.scope && (!eq.ctx.scope || this.calls(eq))) return true;
    const read = this.parsed(r, text, b, e, r, 0); let end = e; while (end > b && this.blank(text.s[end - 1])) end--;
    if (r.scope) return !!read && read.e === end;
    // (a value that is not a scope reads what its own equivalences, or names, read whole; anything else is read where it was
    // written, and is one of it or not: decided where it is applied, unless the span is a rule of its own)
    // (a rule where statements are read reads text by its types; only a value's own rules (its parameters, a level's) decide by the
    // value, where applied)
    if (!!read && read.e === end && this.own(read, r, text)) return true;
    // (a name whose value the language says is one of it: `center` read by `start | center`)
    if (!ctx) return false;
    // (one value written apart from nothing else, not a name: what it is, decided where it is applied)
    if (this.name_end(text, b, end) !== end) return false;
    const word = text.s.slice(b, end);
    // (what is not read yet is not read for this: reading it reads on)
    const now = (v: unknown) => v instanceof Later ? (v.read ? v.value : undefined) : v;
    for (const n of this.reach(ctx)) { if (n.has(word)) return this.of_type(now(n.m.get(word)), r); const x = this.valued(n, word); if (x) return this.of_type(now(x.native!(n)), r); }
    // (a word nothing holds that a rule reads whole (a number): one of it when what that reads is)
    // (read by a reader the host runs, `{number Numeral}`: what that reader reads it as, without reading it)
    if (this.wording) return false;
    let there: Read | undefined; this.wording = true; try { there = this.parsed(ctx, text, b, end, ctx, 0); } finally { this.wording = false; }
    const p = there && there.e === end && !there.on && there.eq?.pieces.length === 1 ? there.eq.pieces[0] : undefined;
    const by = p && 'cap' in p ? this.fixed(p.reader, there!.eq) : undefined;
    if (!(by instanceof Ray) || !by.test) return false;
    const v = by.test(word); return v !== undefined && this.is(v, r);
  }
  // (one of it without asking the language (read for every name, it would be): it, made of it, or one of what it superposes)
  of_type(v: unknown, r: Ray, seen = new Set<Ray>()): boolean {
    if (v === r) return true;
    for (let n = v instanceof Ray ? v : undefined; n; n = n.outer) if (n === r) return true;
    return false;
  }
  // whether a reading is a value's own: a name it holds, or one of its equivalences (or its class's), not the base's
  own(read: Read, r: Ray, text: Text): boolean {
    if (read.name) { const word = text.s.slice(read.b, read.e); return this.reach(r).some(n => n.has(word)); }
    // (a word is one of it when it is a name it holds, not a method: `red` of an enum, not `first` of a Ray)
    // (and what it reads on from is one of it too: `me/device` is not an Instance's for its `/`)
    for (let x: Read | undefined = read; x; x = x.on) if (x.name) { const word = text.s.slice(x.b, x.from ?? x.e).trim(); if (!this.reach(r).some(n => n.has(word) || this.valued(n, word) !== undefined)) return false; }
    else if (x.eq) { if (x.eq.pieces.length === 1 && 'lit' in x.eq.pieces[0] && !x.eq.value) return false; let mine = false; for (let n: Ray | undefined = r; n && !n.scope && n !== this.base; n = n.outer) if (x.eq.ctx === n) mine = true; if (!mine) return false; }
    return true;
  }
  // (a literal starting, or ending, with a bracket)
  bracket(c: string | undefined): boolean { if (c === undefined) return false; if (c === this.learned.open || c === this.learned.close) return true; for (const [o, k] of this.pairs) if (o === c || k === c) return true; return false; }
  opener(c: string | undefined): boolean { return c !== undefined && (c === this.learned.open || this.pairs.has(c)); }
  closer(c: string | undefined): boolean { return c !== undefined && (c === this.learned.close || this.closers.has(c) || this.quotes.has(c)); }
  held(text: Text, b: number, e: number): boolean { for (let i = b; i < e; i++) if (!this.blank(text.s[i])) return true; return false; }
  // A walk over a span keeping what pairs are open: `at` is called where none is (false stops it); where one closes that was not
  // opened, it stops.
  scan(text: Text, b: number, e: number, at: (i: number) => boolean | void, pairs = Infinity): number {
    const s = text.s;
    for (let i = b; i < e; i++) {
      if (at(i) === false) return i;
      if (pairs === 0) continue;
      const c = s[i];
      // (a pair: past where it closes; a closer not opened in it, there)
      if (this.pairs.has(c)) { const m = this.closing(text, i); if (m === -1) return e; if (m < -1) return Math.min(-m - 2, e); if (m >= e) return e; i = m; continue; }
      if (this.closers.has(c)) return i;
    }
    return e;
  }
  // where the pair opened at `i` closes (-1: it does not; -(j + 2): a closer at `j` that is not its own stops it), kept per text
  closing(text: Text, i: number): number {
    let seen = this.closings.get(text); if (!seen || seen.paired !== this.paired) this.closings.set(text, seen = { paired: this.paired, at: new Map() });
    const was = seen.at.get(i); if (was !== undefined) return was;
    const s = text.s, stack = [this.pairs.get(s[i])!]; let r = -1;
    for (let j = i + 1; j < s.length; j++) {
      const c = s[j], top = stack[stack.length - 1];
      if (c === top) { stack.pop(); if (stack.length === 0) { r = j; break; } continue; }
      if (this.quotes.has(top)) { if (c === this.escapes.get(top)) j++; continue; }
      const close = this.pairs.get(c);
      if (close !== undefined) { stack.push(close); continue; }
      if (this.closers.has(c)) { r = -(j + 2); break; }
    }
    seen.at.set(i, r); return r;
  }
  closings = new WeakMap<Text, { paired: number; at: Map<number, number> }>(); paired = 0;
  // (inside a quote: the character that takes the one after it as written, learned from a rule written quote, it, a capture, quote)
  escapes = new Map<string, string>();
  escaped(text: Text, at: number, i: number, x: string): boolean { let k = 0; for (let j = i - 1; j >= at && text.s[j] === x; j--) k++; return k % 2 === 1; }
  // whether every pair opened in a span is closed in it
  balanced(text: Text, b: number, e: number): boolean {
    const s = text.s, stack: string[] = [];
    for (let i = b; i < e; i++) {
      const c = s[i], top = stack.length ? stack[stack.length - 1] : undefined;
      if (top !== undefined) { if (c === top) { stack.pop(); continue; } if (this.quotes.has(top)) { if (c === this.escapes.get(top)) i++; continue; } }
      const close = this.pairs.get(c);
      if (close !== undefined) { stack.push(close); continue; }
      if (this.closers.has(c)) return false;
    }
    return stack.length === 0;
  }
  // The places from `at` (before `e`) where no pair is open and `lit` is written (or the end, for none), latest first.
  ends(text: Text, at: number, e: number, lit: string | undefined, pairs?: number): number[] {
    const out: number[] = [];
    // (a quote written after its escape, inside the pair, is not where it closes)
    const x = lit !== undefined ? this.escapes.get(lit[0]) : undefined;
    const stopped = this.scan(text, at, e, i => { if (i > at && (lit === undefined || (this.literal(text, lit, i, e) >= 0 && !this.amid(text, at, i) && !(x !== undefined && this.escaped(text, at, i, x))))) out.push(i); }, pairs);
    if (lit === undefined && stopped === e) out.push(e);
    return out.reverse();
  }
  // (whether `i` is inside an operator written from before it, after `at`: in `==`, a shorter one, `=`, is not read)
  amid(text: Text, at: number, i: number): boolean {
    const s = text.s;
    for (let k = i - 1; k >= at && k >= i - 4 && !this.blank(s[k]); k--) for (const l of this.operators.get(s[k]) ?? []) if (l.length > i - k && s.startsWith(l, k)) return true;
    return false;
  }
  // (an operator written apart, a space after it: `+ B`, not `@word`)
  spaced_operator(s: string, at: number): boolean {
    if (!this.leads(s, at)) return false;
    let j = at; while (j < s.length && !this.blank(s[j])) j++;
    return j < s.length && j > at && /^[^\p{L}\p{N}_]+$/u.test(s.slice(at, j));
  }
  operator_at(text: Text, at: number): boolean { for (const op of this.operators.get(text.s[at]) ?? []) if (text.s.startsWith(op, at)) return true; return false; }
  shorter(lit: string, text: Text, at: number): boolean {
    const l = lit.trim(); if (l.length === 0 || this.bracket(l[0]) || this.quotes.has(l[0])) return false;
    const from = at + (lit.length - lit.trimStart().length), set = this.operators.get(l[0]); if (!set) return false;
    for (const op of set) if (op.length > l.length && op.startsWith(l) && text.s.startsWith(op, from) && !l.includes(this.learned.space)) return true;
    return false;
  }
  // every operation's spelling (without the spaces around it), by its first character; not one written as a name (`of`)
  operators = new Map<string, Set<string>>();
  spelled(lit: string) { const l = lit.trim().split(this.learned.space)[0]; if (l.length < 2 || /[\p{L}\p{N}_]/u.test(l)) return; let set = this.operators.get(l[0]); if (!set) this.operators.set(l[0], set = new Set()); set.add(l); }
  // (what a statement led by a literal reads last: the rest, up to an operation declared before it; a pair not opened in it, there,
  // is text)
  rest(eq: Eq, text: Text, at: number, e: number, ctx: Ray): number {
    if (eq.order < this.earliest) return e;
    const o = this.operand(text, at, e, eq.order, ctx, eq.pairs, true); return o < e && this.closes(text.s, o) ? e : o;
  }
  // Where a name from `at` ends: at a space, a pair, or a literal read on from a value.
  name_end(text: Text, at: number, e: number): number {
    const s = text.s;
    for (let i = at; i < e; i++) {
      if (this.blank(s[i]) || this.closes(s, i)) return i;
      if (this.pairs.has(s[i])) return i;
      // (a space in the literal reads a line end too, as where it is read)
      if (i > at) for (const x of this.infix.get(s[i]) ?? []) if (this.literal(text, x.lit, i, e) >= 0 || (s.startsWith(x.lit.trimEnd(), i) && x.lit !== x.lit.trimEnd() && this.blank(s[i + x.lit.trimEnd().length]))) return i;
    }
    return e;
  }
  // (an operator written as a word and a space, `or `, is written apart from what is before it; one character, `, `, may hug it)
  apart(lit: string): boolean { return lit.indexOf(this.learned.space) > 1; }
  // Where an operand from `at` ends: where (no pair open) an equivalence declared before `floor` reads on after a space (what hugs
  // a value is part of it: `x.m`, `f(a)`), else at `e`.
  operand(text: Text, at: number, e: number, floor: number, ctx: Ray, pairs?: number, same = false): number {
    const s = text.s, { space } = this.learned, alone = ctx.alone ? ctx : ctx.written && ctx.into?.alone ? ctx.into : undefined;
    // (what reads on there first, then whether it is inside an operator written from before it: most places have neither)
    return this.scan(text, at, e, i => {
      if (i <= at) return;
      const list = this.infix.get(s[i]);
      if (list) for (const x of list) if (x.lit.includes(space) && this.stops(x, i, text, e, floor, same, alone)) return this.amid(text, at, i) ? undefined : false;
      if (this.words.size && this.blank(s[i - 1]) && !this.blank(s[i])) { const j = s.indexOf(space, i), list = j > i ? this.words.get(s.slice(i, j)) : undefined; if (list) for (const x of list) if (this.stops(x, i, text, e, floor, same, alone)) return this.amid(text, at, i) ? undefined : false; }
    }, pairs);
  }
  // (whether an operation declared before `floor` reads on at `i`)
  stops(x: { lit: string; order: number; eq: Eq; from: number }, i: number, text: Text, e: number, floor: number, same: boolean, alone: Ray | undefined): boolean {
    return (same ? x.order <= floor : x.order < floor) && (x.eq.ctx.alone || alone ? x.eq.ctx === alone : true) && this.literal(text, x.lit, i, e) >= 0 && this.follows(x.eq, x.from, text, i, e);
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
  // (how many walks are open: a statement under one is not the outermost)
  open = 0;
  walk(code: Code): unknown {
    this.open++;
    try { return this.walk1(code); } finally { this.open--; }
  }
  walk1(code: Code): unknown {
    if (TRACE && code.statement) { this.depth_++; if (this.depth_ < Number(TRACE)) writeSync(2, `${' '.repeat(this.depth_)}${code.text.name}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 60))}\n`); try { return this.walk2(code); } finally { this.depth_--; } }
    return this.walk2(code);
  }
  depth_ = 0;
  walk2(code: Code): unknown {
    if (code.statement) { const mark = this.unread_log.length; const v = this.walk_(code); for (const p of this.since(mark)) { const d = this.unread.get(p)!; this.unread.delete(p); this.say(d.message, d.at.text, d.at.b, d.at.e); } this.unread_log.length = Math.min(this.unread_log.length, mark); return v; }
    return this.walk_(code);
  }
  walk_(code: Code): unknown {
    // (a statement that reads more than any is written to: one that does not end)
    if (STACK) { this.recent[this.steps % 60] = `${code.text.name.split('/').pop()}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 50))}`; }
    this.counts.walks++;
    if (++this.steps > LONGEST) { if (STACK) writeSync(2, this.chain.slice(0, 30).concat(["...."], this.chain.slice(-40)).join('\n') + '\n====\n' + [...this.recent.slice(this.steps % 60), ...this.recent.slice(0, this.steps % 60)].join('\n') + '\n----\n'); this.steps = 0; this.applying = 0; throw new Runaway(`more than ${LONGEST} readings (\`${code.s.slice(0, 40)}\`)`); }
    // (nothing written: nothing)
    if (!this.held(code.text, code.b, code.e)) return undefined;
    // (code of several statements: each, in order)
    const st = this.single(code) ? undefined : this.statements(code), first = st?.next();
    if (st && first && !first.done) { const second = st.next(); if (!second.done) return this.in_order(function* () { for (let x: IteratorResult<[number, number]> = first; !x.done; x = x === first ? second : st.next()) yield stated(new Code(code.text, x.value[0], x.value[1], code.ctx, code.floor)); }()); }
    // (a definition written in a functionality, its pattern naming what the rule captured: written again first, then read)
    if (this.definer && this.contains(code.text, code.b, code.e, this.needle(this.definer.pieces))) { const d = this.definition(code); if (d && this.names_held(code.text.s.slice(d.caps[0].b, d.caps[0].e), code.ctx)) return this.defined(new Code(code.text, d.caps[0].b, d.caps[0].e, code.ctx), new Code(code.text, d.caps[1].b, d.caps[1].e, code.ctx), code.ctx, code.statement || (code.ctx.rule ? code.ctx.statement : false)); }
    let r = this.reading(code); const s = code.text.s;
    // (an argument that begins by reading on from a value: a closure of that value)
    if (code.argument && !code.statement && r) { let x: Read | undefined = r; while (x.on) x = x.on; if (x.eq === this.implicit) return this.element_closure(code); }
    let e = code.e; while (e > code.b && this.blank(s[e - 1])) e--;
    if (r === undefined || r.e < e) {
      const from = r ? r.e : code.b, unread = s.slice(from, e).trim();
      this.say(unread.includes(this.learned.space) || r ? `Unread \`${unread.slice(0, 60)}\`.` : `Unresolved \`${unread}\`.`, code.text, from, e);
      // (what did not apply is nothing here)
      if (!r) return undefined; const v = this.run(r, code); return v === NOT ? undefined : v;
    }
    // (a reading whose captures its readers did not read has not applied: the next one)
    const missing = this.missing; this.missing = undefined;
    try {
    for (const not = new Set<Eq>(); ;) {
      this.failed = undefined;
      const v = this.run(r!, code);
      if (v !== NOT) return v;
      // (what read on from a value applied what that value has with that head: none of that head applies)
      // (only what did not apply, where that is known: what read on from it still may)
      let failed = this.failed; this.failed = undefined;
      { let x: Read | undefined = r; while (x && x !== failed) x = x.on; if (!x) failed = undefined; }
      for (let x: Read | undefined = r; x; x = x.on) if (x.eq && (!failed || x === failed)) { not.add(x.eq); const p0 = x.eq.pieces[0]; if (x.on && 'lit' in p0) for (const y of this.sends.get(p0.lit[0]) ?? []) if (y.key === x.eq.key) not.add(y); }
      r = this.parse(code.text, code.b, code.e, code.ctx, code.floor, not);
      if (NOTS && not.size % 1000 === 0) writeSync(2, `not ${not.size} ${code.s.slice(0, 30)} → ${r?.eq?.key ?? (r?.name ? 'name' : r)} on ${r?.on?.eq?.key ?? r?.on?.name}\n`);
      if (r === undefined || r.e < e) { const m = this.missing as Diagnostic | undefined; if (m) this.say(m.message, m.at.text, m.at.b, m.at.e); else this.say(`Unread \`${s.slice(code.b, e).trim().slice(0, 60)}\`.`, code.text, code.b, e); return undefined; }
    }
    } finally { this.missing = missing; }
  }
  missing?: Diagnostic;
  // (the reading that did not apply, the innermost first)
  failed?: Read;
  // (what the definer reads in a span: what is written there and which operators are declared say, nothing else; kept)
  definitions = new WeakMap<Text, Map<number, Map<number, { syntax: number; sent: number; pieces: Piece[]; d: Read | undefined }>>>();
  definition(code: Code): Read | undefined {
    let m = this.definitions.get(code.text); if (!m) this.definitions.set(code.text, m = new Map());
    let at = m.get(code.b); if (!at) m.set(code.b, at = new Map());
    const x = at.get(code.e); if (x && x.syntax === this.syntax && x.sent === this.sent && x.pieces === this.definer!.pieces) return x.d;
    const d = this.match(this.definer!, code.text, code.b, code.e, code.ctx, 0, code.b, []);
    at.set(code.e, { syntax: this.syntax, sent: this.sent, pieces: this.definer!.pieces, d }); return d;
  }
  // (read once per span, floor and the nearest context that adds equivalences, until one is added)
  memo = new WeakMap<Ray, Map<Text, Map<number, { floor: number; e: number; version: number; r: Read | undefined }[]>>>();
  reading(code: Code): Read | undefined {
    // (a frame that also reaches another context, a value's or where its code was written, reads as itself)
    let key: Ray = code.ctx;
    // (a rule's frame reads as every frame of that rule on what is made of the same class: its names are read when it runs)
    if (SHAPED && key.rule && key.scope && !key.into && key.eqs === NONE) key = this.shape(key);
    else {
      while (key.eqs === NONE && key.scope && key.outer && !key.sees && !key.into) key = key.outer;
      // (one that holds rules of its own reads as itself: what it holds as values are only names)
      if (SHAPED && key.rule && key.scope && !key.into && !this.has_rules(key)) key = this.shape(key);
      // (a block read into a value reads as it does into every value of that class, from where it was written)
      else if (SHAPED && key.into && key.scope && !key.rule && !key.into.scope && key.into !== this.global) key = this.shape_into(key);
    }
    return this.parsed(key, code.text, code.b, code.e, code.ctx, code.floor);
  }
  // a span read in a context, as it was read before there (`key`: what reads as that context), until something declared since
  // may read it
  parsed(key: Ray, text: Text, b: number, e: number, ctx: Ray, floor: number): Read | undefined {
    if (NOMEMO) return this.parse(text, b, e, ctx, floor);
    this.counts.memo = (this.counts.memo ?? 0) + 1;
    let m = this.memo.get(key); if (!m) this.memo.set(key, m = new Map());
    let at = m.get(text); if (!at) m.set(text, at = new Map());
    let list = at.get(b); if (!list) at.set(b, list = []);
    for (const x of list) if (x.floor === floor && x.e === e) {
      if (x.version === this.version) return x.r;
      // (what was declared since does not read anything there: read as it was)
      if (!this.since_read(x.version, text.s.slice(b, e))) { x.version = this.version; return x.r; }
      x.r = this.parse_shared(text, b, e, ctx, floor); x.version = this.version; return x.r;
    }
    const r = this.parse_shared(text, b, e, ctx, floor);
    list.push({ floor, e, version: this.version, r });
    return r;
  }
  // A span read in a context as it was read in any context that reaches the same equivalences, in the same order (S2: a span is
  // read once): what a reading depends on is which contexts with equivalences it reaches, which of them (or of those between)
  // hold its first word, where a value it is read on is first found, and what reading a capture alone asks of the context.
  // (the reading kept says how near its equivalence was by its place among those contexts: given back as near as it is here)
  shared = new WeakMap<Text, Map<string, { version: number; r: Read | undefined; at: number; eqi: number; sent: number; held: Ray[] }>>();
  parse_shared(text: Text, b: number, e: number, ctx: Ray, floor: number): Read | undefined {
    if (NOSHARE) return this.parse(text, b, e, ctx, floor);
    this.counts.shared = (this.counts.shared ?? 0) + 1;
    const s = text.s; let bb = b, ee = e; while (bb < ee && this.blank(s[bb])) bb++; while (ee > bb && this.blank(s[ee - 1])) ee--;
    if (bb >= ee) return undefined;
    const word = s.slice(bb, this.name_end(text, bb, ee)), nears: number[] = [], held: Ray[] = [];
    // (what reading a capture alone asks of the context, `sees`, `outer` where code is written, the value called: only which of the
    // contexts with equivalences it is)
    let sig = `${b}:${e}:${floor}:${ctx.level ? this.id(this.ruling(ctx.outer)) : ''}:${ctx.alone ? this.id(ctx) : ctx.written && ctx.into?.alone ? this.id(ctx.into) : ''}:${this.deciding > 0 ? 'D' : ''}|`;
    let self = false, near = 0;

    for (const n of this.reach(ctx)) {
      near++;
      if (!self && ((n.into && !n.into.scope && !n.rule) || (!n.scope && n !== this.base))) { self = true; sig += 's'; }
      // (names a context holds as values are not rules: only whether it holds the first word)
      if (n.eqs.length > 0 && !n.led) this.led(n);
      // (a closure is as every closure made by the same definition: its rule written alike, at the same place)
      if (n.eqs.length > 0 && n.ruled && this.candidates(n, s[bb])) { sig += (n.closure ? 'k' + this.structure(n) : this.id(n)) + (n === ctx.sees ? 'S' : '') + (ctx.written && n === ctx.outer ? 'O' : '') + (n === this.calling ? 'C' : '') + ','; nears.push(near); held.push(n); }
      if (word && (n.has(word) || (n.eqs.length > 0 && n.keys!.has(word)))) sig += 'h';
    }
    let m = this.shared.get(text); if (!m) this.shared.set(text, m = new Map());
    const x = m.get(sig);
    if (x && (x.version === this.version || !this.since_shared(x, s.slice(b, e)))) { x.version = this.version; x.sent = this.sent; return this.neared(x.r, nears, x.at, x.eqi >= 0 ? held[x.at].eqs[x.eqi] : undefined); }
    if (MISSES) console.log('MISS', text.name.split('/').pop() + ':' + text.s.slice(0, b).split('\n').length, JSON.stringify(s.slice(b, Math.min(e, b + 50))), x ? 'stale' : 'new', sig.slice(0, 100));
    const r = this.parse(text, b, e, ctx, floor);
    // (how near, among the contexts with equivalences: the how manyth of them; read by a closure's rule: the how manyth of its)
    let inner = r; while (inner?.on) inner = inner.on;
    const at = inner?.near === undefined ? -1 : nears.indexOf(inner.near);
    const eqi = at >= 0 && held[at].closure && inner?.eq ? held[at].eqs.indexOf(inner.eq) : -1;
    m.set(sig, { version: this.version, r, at, eqi, sent: this.sent, held });
    return r;
  }
  // (what a value is made of, as far as reading by its rules goes: the nearest with rules of its own, or made of more than one)
  ruling(v: Ray | undefined): Ray | undefined { while (v && !this.has_rules(v) && !v.also && v.outer && !v.scope) v = v.outer; return v; }
  // whether anything declared since a shared reading may read its span: only in the contexts it was read with (any other that comes to
  // have a rule for it reads under another signature), unless an operation on values was first declared since (read on from any)
  since_shared(x: { version: number; sent: number; held: Ray[] }, span: string): boolean {
    if (x.sent !== this.sent) return this.since_read(x.version, span);
    for (let v = x.version; v < this.version; v++) {
      const c = this.changes[v];
      if (c.at.reached === undefined || c.at.reached > x.version || !x.held.includes(c.at)) continue;
      if (!c.needle || span.includes(c.needle)) return true;
    }
    return false;
  }
  // (a closure's rules as they are written, where: what reads the same)
  structure(n: Ray): string {
    const k = this.structures.get(n); if (k && k.count === n.eqs.length) return k.s;
    const s = n.eqs.map(x => x.key + '@' + this.id(x.body.text) + ':' + x.body.b + ':' + x.body.e + (x.value ? 'v' : '') + (x.node?.params ? '(' + x.node.params.join(',') + ')' : '') + x.pieces.map(p => 'cap' in p && p.reader ? p.reader.s : '').join(';')).join('|');
    this.structures.set(n, { count: n.eqs.length, s }); return s;
  }
  structures = new WeakMap<Ray, { count: number; s: string }>();
  // (whether a context has a rule a span starting with `c` could be read by: led by it, or by a capture)
  candidates(n: Ray, c: string): boolean {
    const led = this.led(n);
    for (const k of [c, '']) { const l = led.get(k); if (l) for (const i of l) if (!n.eqs[i].value) return true; }
    return false;
  }
  // a reading kept, as near as its equivalence is from here
  neared(r: Read | undefined, nears: number[], at: number, eq?: Eq): Read | undefined {
    if (!r || at < 0) return r;
    const chain: Read[] = []; for (let x: Read | undefined = r; x; x = x.on) chain.push(x);
    const inner = chain[chain.length - 1]; if (inner.near === nears[at] && (!eq || inner.eq === eq)) return r;
    let out: Read = { ...inner, near: nears[at], eq: eq ?? inner.eq };
    for (let i = chain.length - 2; i >= 0; i--) out = { ...chain[i], on: out };
    return out;
  }
  ids = new WeakMap<object, number>(); counted = 0;
  id(x: unknown): number { if (typeof x !== 'object' || x === null) return 0; let i = this.ids.get(x); if (i === undefined) this.ids.set(x, i = ++this.counted); return i; }
  // (kept by what they are shaped by, one after another: no key written out; what is shaped by a frame goes with it)
  shapes = new WeakMap<object, unknown>();
  // (what is not an object, kept by one that stands for it)
  keyed(x: unknown): object { if (typeof x === 'object' && x !== null) return x; let k = this.standing.get(x); if (!k) this.standing.set(x, k = {}); return k; }
  standing = new Map<unknown, object>();
  shaped(a: object | undefined, b: object | undefined, c: object | undefined, d?: object, e?: object, n = 3): Ray {
    let m = this.shapes;
    const by = [a, b, c, d, e];
    for (let i = 0; i < n - 1; i++) { const k = this.keyed(by[i]); let x = m.get(k) as WeakMap<object, unknown> | undefined; if (!x) m.set(k, x = new WeakMap()); m = x; }
    const k = this.keyed(by[n - 1]); let r = m.get(k) as Ray | undefined; if (!r) m.set(k, r = new Ray()); return r;
  }
  shape(F: Ray): Ray {
    // (a method's frame continues into its node, then into what it was applied on: shaped as that)
    const W = F.outer?.method ? F.outer.sees! : F, o = W.outer, sees = W === F ? F.sees : W.sees;
    const on = o && !o.scope ? o.outer : o;
    return this.shaped(F.rule, on, sees);
  }
  shape_into(T: Ray): Ray {
    return this.shaped(INTO, T.outer, T.into!.outer, T.sees === T.into ? undefined : T.sees, T.written, 5);
  }
  // the value a reading found its equivalence on, from a frame: as the reading found it (`near` contexts out)
  self_of(ctx: Ray, near: number): unknown {
    let self: unknown, i = 0;
    for (const n of this.reach(ctx)) { i++; if (self === undefined && n.rule && n.self !== undefined && !(n.self instanceof Ray)) self = n.self; if (self === undefined && n.into && !n.into.scope && !n.rule) self = n.self ?? n.into; if (!n.scope && n !== this.base && self === undefined) self = n; if (i >= near) break; }
    return self;
  }
  // whether a character and the one after it begin an operator (or what reads on from a value)
  longer(c: string, next: string): boolean {
    const two = c + next;
    for (const list of [this.infix.get(c), this.words.get(c)]) if (list) for (const x of list) if (x.lit.startsWith(two)) return true;
    for (const x of this.sends.get(c) ?? []) { const p = x.pieces[0]; if ('lit' in p && p.lit.startsWith(two)) return true; }
    return false;
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
        const held = n.places?.get(word), placed = held ?? { at: n.into ?? n, here: code.ctx.into ?? code.ctx, word, text: undefined, b: undefined, e: undefined, on: undefined };
        // (the name's place, once what it holds was read)
        // (a capture a rule was handed is passed on as it is: what a field holds is read when the field is read)
        const read = this.held_value(v); this.place = placed; return read;
      }
      const at = code.ctx.into ?? code.ctx;
      this.place = { at, here: at, word, text: code.text, b: r.b, e: r.e, on: at === this.none ? this.receiving : undefined };
      // (what a value does not have, read in it, is nothing; a name nothing holds, said once the statement is read, unless it was
      // only a place given a value)
      if (!(code.ctx.into !== undefined && code.ctx.caller === undefined && !code.ctx.sees)) this.note(this.place, { message: `Unresolved \`${word}\`.`, at: { text: code.text, b: r.b, e: r.e } });
      return undefined;
    }
    const eq = r.eq!;
    if (r.on === undefined) {
      // (led by what reads on from a value, inside a closure of one value: on that value)
      let self = r.self === undefined || this.elements === 0 || !('lit' in eq.pieces[0]) ? undefined : this.element_of_ctx(code.ctx);
      if (self !== undefined && !this.leads(code.text.s, r.b)) self = undefined;
      if (self === undefined && r.self !== undefined) self = this.self_of(code.ctx, r.near ?? 0);
      // (a rule whose functionality is the host's own code, given nothing: that code, called directly)
      const v = self === undefined && r.caps.length === 0 && eq.js && !eq.node && !eq.receiver ? this.direct(eq, code) : this.apply(eq, r.caps, code, self);
      if (v === NOT) this.failed = r;
      // (a name, or a member: its place)
      // (a declared name is written where it is declared; one computed, as `this`, only where it is read)
      if (eq.pieces.length === 1 && 'lit' in eq.pieces[0]) { const here = code.ctx.into ?? code.ctx; this.place = { at: eq.native && !eq.js ? eq.ctx : here, here, word: eq.key, text: undefined, b: undefined, e: undefined, on: undefined }; }
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
    // (a value without that head: another reading, else said)
    if (owns.length === 0) { this.failed = r; this.missing ??= { message: `No \`${code.text.s.slice(r.on.e, r.e).trim().slice(0, 40)}\` on ${this.show(value)}.`, at: { text: code.text, b: r.on.e, e: r.e } }; return NOT; }
    // (the value's own equivalences with that head, nearest first: the first that reads what follows, its own captures read from the
    // same place, and applies)
    // (read on a name nothing holds: what is read there remembers it, a member declared there makes it, `a.b := v`)
    const was = this.receiving; if (value === undefined && r.on.name && place?.text) this.receiving = place;
    try {
      for (const x of owns) {
        const caps = x === eq ? r.caps : this.match(x, code.text, r.from!, r.e, code.ctx, 0, r.from!, [])?.caps;
        if (!caps) continue;
        const v = this.apply(x, caps, code, value === undefined ? this.none : value, place);
        // (what answers what it was applied on is where that was)
        if (v === (value === undefined ? this.none : value) && place) this.place = place;
        if (v !== NOT) return v;
      }
    } finally { this.receiving = was; }
    this.failed = r;
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
  valued(n: Ray, word: string): Eq | undefined { if (!this.has_key(n, word)) return undefined; for (let i = n.eqs.length - 1; i >= 0; i--) { const x = n.eqs[i]; if (x.value && x.key === word) return x; } return undefined; }
  // names read that nothing holds, waiting for the end of their statement
  unread = new Map<Place, Diagnostic>(); unread_log: Place[] = [];
  // (what is left unresolved, in the order it was left: what was since a mark)
  note(p: Place, d: Diagnostic) { this.unread.set(p, d); this.unread_log.push(p); }
  since(mark: number): Place[] { const out: Place[] = []; for (let i = mark; i < this.unread_log.length; i++) if (this.unread.has(this.unread_log[i])) out.push(this.unread_log[i]); return out; }
  forget(mark: number) { for (const p of this.since(mark)) this.unread.delete(p); this.unread_log.length = Math.min(this.unread_log.length, mark); }
  // A value given to the place the receiver was read at (`:=`): declared there; or where it is declared (`=`).
  declare(F: Ray, v: unknown, assign: boolean): unknown {
    let n: Ray | undefined = F; while (n && !n.place) n = n.caller;
    return this.declare_at(n?.place, v, assign);
  }
  // the place read just before (`@place`): what a method is applied on, kept before anything else is read
  place_of(F: Ray): Place | undefined { let n: Ray | undefined = F; while (n && !n.place) n = n.caller; return n?.place; }
  // (kept under a name in the frame it is read in: what that frame was applied on)
  keep_place(F: Ray, name: string): undefined { const at = F.caller; let n: Ray | undefined = at; while (n && !n.place) n = n.caller; if (at) at.m.set(name, n?.place); return undefined; }
  declare_at(p: Place | undefined, v: unknown, assign: boolean): unknown {
    if (!p) return v;
    this.unread.delete(p);
    // (declared where it was read; written where it is declared; written in a head's parameter, its default)
    let at = assign ? p.at : p.here;
    // (declared: the name is where it was declared from now on)
    if (!assign) p.at = p.here;
    // (a member of a name nothing holds: that name, a value of its own, declared where it was read)
    if (at === this.none && p.on?.text) { const on = p.on, ns = new Ray(this.base); this.unread.delete(on); this.add(on.at, [{ lit: on.word }], new Value(ns, new Code(on.text!, on.b!, on.e!, on.at))); at = ns; }
    const t = { name: '', s: p.word };
    // (written while what is written is kept: what it held before, to be put back)
    if (this.journal) { const was = at.eqs.findIndex(x => x.key === p.word && x.value); this.journal.push({ at, word: p.word, was: was >= 0 ? at.eqs[was].native!(at) : undefined, had: was >= 0 }); }
    this.add(at, [{ lit: p.word }], new Value(v, new Code(t, 0, p.word.length, at)));
    return v;
  }
  // what is written while code is read (`with settings`), kept; and put back
  journal?: { at: Ray; word: string; was: unknown; had: boolean }[];
  writing(code: unknown): unknown {
    const was = this.journal; this.journal = [];
    try { this.force(code); return this.journal; } finally { const j = this.journal; this.journal = was; if (was) was.push(...j); }
  }
  unwritten(journal: unknown): undefined {
    if (!Array.isArray(journal)) return undefined;
    for (const w of [...journal].reverse()) {
      const i = w.at.eqs.findIndex((x: Eq) => x.key === w.word && x.value);
      if (w.had) { const t = { name: '', s: w.word }; this.add(w.at, [{ lit: w.word }], new Value(w.was, new Code(t, 0, w.word.length, w.at))); }
      else if (i >= 0) { w.at.eqs.splice(i, 1); w.at.led = undefined; }
    }
    return undefined;
  }
  // a field's type held as written (`x: T`, not given): what `= default` writes to it is read when the field is first read
  held_types = new WeakSet<Code>();
  holding(p: Place | undefined, c: Code): Code { this.held_types.add(c); this.held_place = p; return c; }
  // (the place a `:` just declared: `= d` right after it is its default; any other `=` writes)
  held_place?: Place;
  defaulted(F: Ray): boolean {
    let n: Ray | undefined = F; while (n && !n.place) n = n.caller; const p = n?.place;
    const h = this.held_place;
    if (!p || h === undefined || p !== h) return false;
    this.held_place = undefined;
    const x = this.valued(p.at, p.word), v = x?.native!(p.at);
    return v instanceof Code && this.held_types.has(v);
  }
  later(c: Code): Later { return new Later(c); }
  // whether what is written has a place to be written to (written to nothing, it is not read)
  placed(F: Ray): boolean { let n: Ray | undefined = F; while (n && !n.place) n = n.caller; return !!n?.place; }
  // `x = v` in a parameter of a head being read: its default, as written (read where it is given, when it is not)
  assigning(F: Ray): boolean {
    let n: Ray | undefined = F; while (n && !n.place) n = n.caller;
    const p = n?.place, held = F.m.get('value'), code = held instanceof Code ? this.written(held) : held;
    if (!p || !this.reading_node || p.at !== this.reading_node || !(code instanceof Code)) return false;
    this.unread.delete(p); (p.at.defaults ??= new Set()).add(p.word); (p.at.default_codes ??= new Map()).set(p.word, code);
    return true;
  }
  // what a member given nothing is: its default read in the value given it (when it is first read), else what the head declared it as
  default_of(target: unknown, node: unknown, name: unknown): unknown {
    if (!(target instanceof Ray) || !(node instanceof Ray) || typeof name !== 'string') return undefined;
    const c = node.default_codes?.get(name);
    if (c) { const T = new Ray(c.ctx); T.scope = true; T.into = target; T.sees = target; return new Later(new Code(c.text, c.b, c.e, T, c.floor)); }
    const x = this.valued(node, name); return x ? x.native!(node) : undefined;
  }
  // where the method it is read in was called from (`&caller`): the nearest method around where it is read
  caller_of(F: Ray): Ray | undefined {
    for (let c: Ray | undefined = F.caller, n = 0; c && n < 10000; c = c.rule && !c.rule.node ? c.caller : c.outer ?? c.sees, n++) if (c.method) return c.caller;
    return undefined;
  }
  // (`return` leaves, `recur` enters again, the method it is written in: the nearest method around where it is read)
  jump(kind: string, value?: unknown, F?: Ray): never {
    let to: Ray | undefined;
    if (kind === 'return' || kind === 'recur') for (let c: Ray | undefined = F?.caller, n = 0; c && n < 10000; c = c.rule && !c.rule.node ? c.caller : c.outer ?? c.sees, n++) if (c.method) { to = c; break; }
    throw new Jump(kind, value, to);
  }
  // (how many methods, and statements in order, are being run: what a `return`, or a `goto`, can leave)
  methods = 0; ordered = 0;
  // Statements read in order; a `goto` to a label among them goes on from that label (one further on is split first).
  in_order(st: Iterator<Code>): unknown {
    const seen: Code[] = []; let v: unknown;
    // (a label is a place among the statements it is written with: named before any of them is read, so a statement can name one
    // further on)
    for (let x = st.next(); !x.done; x = st.next()) seen.push(x.value);
    for (const c of seen) { const name = this.label_ahead(c); if (name !== undefined) this.add(c.ctx, [{ lit: name }], new Value(new Label(c), c)); }
    this.ordered++;
    try {
      for (let i = 0; i < seen.length; i++) {
        try { v = this.walk(seen[i]); }
        catch (x) {
          if (!(x instanceof Jump) || x.kind !== 'goto') throw x;
          // (to a place: only the statements that hold it; by its name, the first label of that name among them)
          const j = x.value instanceof Label ? seen.indexOf(x.value.at) : seen.findIndex(c => this.label_name(c) === x.value);
          if (j < 0) throw x;
          i = j - 1;
        }
      }
      return v;
    } finally { this.ordered--; }
  }
  // the name of a statement that is a label (one read by the interpreter's `label`), else nothing
  // (whether a statement is a label, asked before what is before it is read: kept by where it is written, once the language is read)
  label_ahead(c: Code): string | undefined {
    let m = this.labelled.get(c.text); if (!m) this.labelled.set(c.text, m = new Map());
    const k = c.b * 65536 + (c.e - c.b), was = m.get(k); if (was !== undefined && !this.booting) return was === null ? undefined : was;
    const name = this.label_name(c, true); m.set(k, name ?? null); return name;
  }
  labelled = new WeakMap<Text, Map<number, string | null>>();
  // (`ahead`: asked before the statements before it are read: read as it would be now, not kept)
  label_name(c: Code, ahead = false): string | undefined {
    const r = ahead ? this.aside(() => this.parse(c.text, c.b, c.e, c.ctx, c.floor)) : this.reading(c);
    if (!r?.eq || r.caps.length === 0) return undefined;
    // (its functionality the interpreter's `label`, or read as what is)
    for (let eq: Eq | undefined = r.eq, k = 0; eq && k < 4; eq = this.reading(eq.body)?.eq, k++) if (eq.body.s.includes('$.label(')) return c.text.s.slice(r.caps[0].b, r.caps[0].e).trim();
    return undefined;
  }
  label(_F: Ray): unknown { return undefined; }
  // a message said where it is written (what it reads as, else as it is written)
  report(m: unknown): unknown {
    if (!(m instanceof Code)) return undefined;
    const c = this.written(m), v = this.force(c), text = typeof v === 'string' ? v : c.s.trim();
    this.say(text, c.text, c.b, c.e); return v;
  }
  // a member given to a value, by its name
  field_set(target: unknown, name: unknown, value: unknown): unknown {
    if (!(target instanceof Ray) || typeof name !== 'string') return undefined;
    const t = { name: '', s: name }; this.add(target, [{ lit: name }], new Value(value, new Code(t, 0, name.length, target))); return value;
  }
  dispatch(value: unknown, key: string): Eq | undefined { return this.dispatching(value, key, true)[0]; }
  dispatching(value: unknown, key: string, one = false): Eq[] {
    const out: Eq[] = [];
    // (nothing, absent, reads as the interpreter's nothing)
    if (value === undefined && this.none) value = this.none;
    // (a value of the host's own kind: the class the interpreter maps that kind to)
    if (!(value instanceof Ray) && value !== undefined) { const k = this.kind_of(value); if (k) value = k; }
    // (its own, its class's, …: what each is also made of next to it (`A + B`, a component); the base last)
    // (a class's own (`static`) only on that class itself, not on what is made of it; on the class, before the rest)
    const seen = new Set<Ray>();
    if (value instanceof Ray && this.visit(value, value, key, one, seen, out)) return out;
    const B = this.base;
    if (B && this.has_key(B, key)) for (let i = B.eqs.length - 1; i >= 0; i--) if (B.eqs[i].key === key) { out.push(B.eqs[i]); if (one) return out; }
    return out;
  }
  // (whether a context has rules of its own, not only values under names)
  has_rules(n: Ray): boolean { if (n.eqs.length === 0) return false; if (!n.led) this.led(n); return !!n.ruled; }
  // (whether a context has an equivalence with that head)
  has_key(n: Ray, key: string): boolean { if (n.eqs.length === 0) return false; if (!n.led) this.led(n); return n.keys!.has(key); }
  visit(start: Ray, value: Ray, key: string, one: boolean, seen: Set<Ray>, out: Eq[]): boolean {
    for (let n: Ray | undefined = start; n && (n === start || !n.scope) && !seen.has(n) && n !== this.base; n = n.outer) {
      seen.add(n);
      if (this.has_key(n, key)) {
        if (n === value) for (let i = n.eqs.length - 1; i >= 0; i--) if (n.eqs[i].key === key && n.eqs[i].own) { out.push(n.eqs[i]); if (one) return true; }
        for (let i = n.eqs.length - 1; i >= 0; i--) if (n.eqs[i].key === key && !n.eqs[i].own) { out.push(n.eqs[i]); if (one) return true; }
      }
      if (n.also) for (const a of n.also) if (this.visit(a, value, key, one, seen, out)) return true;
    }
    return false;
  }
  // An equivalence applied: a frame inside the value it is applied on (or where its functionality was written), its captures bound
  // (as code, read where they were written each time they are named; one with a reader, what the reader read), its functionality
  // run there.
  apply(eq: Eq, caps: Cap[], code: Code, self?: unknown, place?: Place): unknown {
    // (what applies deeper than any program is written: a reading that never ends, said where its statement is)
    if (STACK) this.chain.push(`${eq.key.slice(0, 30)} @${eq.body.text.name.split('/').pop()}:${eq.body.text.s.slice(0, eq.body.b).split(this.learned.end).length} on ${code.text.name.split('/').pop()}:${code.text.s.slice(0, code.b).split(this.learned.end).length} ${JSON.stringify(code.s.slice(0, 40))}`);
    this.counts.applications++;
    if (++this.applying > DEEPEST) { if (STACK) writeSync(2, this.chain.slice(0, 25).join('\n') + '\n....\n' + this.chain.slice(-12).join('\n') + '\n----\n'); this.applying = 0; throw new Runaway(`deeper than ${DEEPEST} applications (\`${eq.key.slice(0, 40)}\`)`); }
    const T0 = RULES ? performance.now() : 0, C0 = RULES ? this.child_ms : 0, W0 = this.counts.walks, CW = this.child_w, M0 = this.counts.matches, CM = this.child_m; if (RULES) { this.child_ms = 0; this.child_w = 0; this.child_m = 0; }
    try { const v = this.apply_(eq, caps, code, self, place); if (!this.passes(eq)) this.place = undefined; return v; } finally { if (this.applying > 0) this.applying--; if (STACK) this.chain.pop(); if (RULES) { const t = performance.now() - T0, k = eq.key.slice(0, 50) + ' @' + eq.body.text.name.split('/').pop() + ':' + eq.body.text.s.slice(0, eq.body.b).split('\n').length; const x = this.rule_ms.get(k) ?? [0, 0, 0, 0]; const w = this.counts.walks - W0, m = this.counts.matches - M0; x[0] += t - this.child_ms; x[1]++; x[2] += w - this.child_w; x[3] += m - this.child_m; this.rule_ms.set(k, x); this.child_ms = C0 + t; this.child_w = CW + w; this.child_m = CM + m; } }
  }
  direct(eq: Eq, code: Code): unknown {
    this.counts.applications++;
    const F = new Ray(eq.body.ctx); F.scope = true; F.caller = code.ctx; F.rule = eq; F.statement = code.statement;
    const v = eq.js!(F); this.place = undefined; return v;
  }
  // (what a functionality that is one name gives is where that name is; any other gives a value, at no place)
  passes(eq: Eq): boolean {
    if (eq.passing === undefined) { const t = eq.body.s.trim(); eq.passing = !eq.native && t.length > 0 && this.name_end({ name: '', s: t }, 0, t.length) === t.length; }
    return eq.passing;
  }
  // (how much reading was done: walks, parses, match attempts, applications)
  counts: Record<string, number> = { walks: 0, parses: 0, matches: 0, applications: 0, defined: 0 };
  child_w = 0; child_m = 0; child_ms = 0; rule_ms = new Map<string, number[]>();
  applying = 0; steps = 0; chain: string[] = []; recent: string[] = [];
  apply_(eq: Eq, caps: Cap[], code: Code, self?: unknown, place?: Place): unknown {
    // (`recur(…)`: the method again, given what it is given there)
    for (let again: Code | undefined; ;) {
    // (a frame inside the value it is applied on: a value of the host's own kind, inside the class it is mapped to)
    const kind = self !== undefined && !(self instanceof Ray) ? this.kind_of(self) : undefined;
    const F = new Ray(self instanceof Ray && !self.scope ? self : kind ?? eq.body.ctx); F.place = place;
    // (what a rule enclosed in literals reads is a value)
    const ps = eq.pieces, enclosed = ps.length > 1 && 'lit' in ps[0] && 'lit' in ps[ps.length - 1];
    F.scope = true; F.caller = code.ctx; F.self = self; F.rule = eq; F.statement = code.statement && !enclosed;
    if (F.outer !== eq.body.ctx) F.sees = eq.body.ctx;
    const at = code.ctx.written ?? code.ctx;
    if (!this.captured(eq, F, caps, code.text, at)) return NOT;
    // (a method: what it was given matched against its parameters; the frame continues into it, what it was not given what it says)
    if (eq.node?.params) {
      if (again) F.m.set(this.given_name, again);
      const given = F.m.get(this.given_name), sub = this.bound(eq, F, code);
      if (sub === NOT) return NOT;
      if (sub.length && !this.captured(eq, F, sub, (given as Code).text, (given as Code).ctx)) return NOT;
      for (const x of eq.node.params.slice(sub.length)) F.m.set(x, this.default_of(F, eq.node, x));
      const I = new Ray(eq.node); I.scope = true; I.method = true; I.caller = code.ctx; const W = new Ray(F.outer); W.scope = true; W.sees = F.sees; I.sees = W; F.outer = I; F.sees = undefined;
    }
    // (what a form declares first, where it is not given it; the capture it is applied with, `this`)
    if (eq.receiver) F.self = this.get(F, eq.receiver);
    if (eq.native) return eq.native(F);
    // (a method: what `return` gives, from inside it)
    if (eq.node) {
      const I = F.outer; this.methods++;
      try { return this.body(eq, F); }
      catch (x) {
        if (!(x instanceof Jump) || (x.to !== I && x.to) || (x.kind !== 'return' && x.kind !== 'recur')) throw x;
        if (x.kind === 'return') return x.value;
        again = x.value as Code | undefined; continue;
      } finally { this.methods--; }
    }
    return this.body(eq, F);
    }
  }
  // captures bound in a frame: code, read where written each time it is named; one with a reader (or a type) a value, what that
  // reads it as, read once, here; false when one is not read so
  captured(eq: Eq, F: Ray, caps: Cap[], text: Text, at: Ray): boolean {
    for (const c of caps) { const k = new Code(text, c.b, c.e, at, c.floor); F.m.set(c.name, c.b === c.e ? k : c.reader || c.type !== undefined ? NOT : (c.argument || eq.ctx.closure) ? this.argued(this.written(k)) : this.written(k)); }
    for (const c of caps) if ((c.reader || c.type !== undefined) && c.b < c.e) {
      // (while what reads its captures is read, the rule reads nothing itself)
      const k = new Code(text, c.b, c.e, at, c.floor);
      let r: unknown = c.type;
      // (a reader decided where it was written: what it was decided to be; else read here)
      const decided = c.reader ? this.fixed(c.reader, eq) : undefined;
      if (decided instanceof Ray) r = decided;
      else if (c.reader) { eq.busy = (eq.busy ?? 0) + 1; try { r = this.walk(new Code(c.reader.text, c.reader.b, c.reader.e, F)); } finally { eq.busy--; } }
      // (a value of the host's own kind, as what is read in: read in the class the interpreter maps that kind to, being that value)
      const dependent = !!c.reader && this.dependent(c.reader, eq);
      const kind = !(r instanceof Ray) && r !== undefined && dependent ? this.kind_of(r) : undefined;
      if (r === this.expression) F.m.set(c.name, this.walk(k));
      else if (kind) { const v = c.block ? this.into(this.written(k), kind, r) : this.within(k, kind, false, r); if (v === NOT) return false; F.m.set(c.name, v); }
      else if (!(r instanceof Ray)) return false;
      // (code handed on, a word naming held code: that code, read into it)
      else { const v = c.block ? this.into(this.written(k), r) : this.within(k, r, !dependent, undefined, eq); if (v === NOT) return false; F.m.set(c.name, v); }
      (F.codes ??= new Map()).set(c.name, k);
      if (this.place) (F.places ??= new Map()).set(c.name, this.place);
    }
    return true;
  }
  // Code read into a value: its statements read in a frame of the value (what they define is the value's), which sees where the
  // code was written.
  // (read by a context of nothing, a word: the code itself)
  within(code: Code, r: Ray, typed = false, self?: unknown, by?: Eq): unknown {
    const was = this.calling; this.calling = r; try { return this.within_(code, r, typed, self, by); } finally { this.calling = was; }
  }
  within_(code: Code, r: Ray, typed = false, self?: unknown, by?: Eq): unknown {
    // (a context the host reads with its own function: what that gives, or not read)
    // (one that reads a span as it is written: that span, a word)
    if (r.test) { const t = code.s.trim(), v = r.test(t); if (v === undefined) return NOT; if (v !== t) return v; const w = new Code(code.text, code.b, code.e, code.ctx, code.floor); w.word = true; return w; }
    const T = new Ray(r); T.scope = true; T.into = r; T.written = code.ctx; T.self = self;
    const read = this.parsed(r, code.text, code.b, code.e, r, 0); let end = code.e; while (end > code.b && this.blank(code.text.s[end - 1])) end--;
    // (a name read in a frame, a rule's application (`(&.caller).x`): what that frame holds under it)
    if (r.scope && read?.name && read.e === end && (r.rule || r.caller)) return this.walk(new Code(code.text, code.b, code.e, r, code.floor));
    if (r.scope && read?.name && read.e === end) { const w = new Code(code.text, code.b, code.e, code.ctx, code.floor); w.word = true; return w; }
    const word = read?.name ? code.text.s.slice(read.b, read.e) : undefined;
    // (a reader decided where it was written, a type: what it does not read whole is read where it was written, one of it, or not read)
    if (typed && !r.scope && !(read && read.e === end && this.own(read, r, code.text))) {
      // (read where it was written, while the rule asking reads nothing itself)
      let at = code.ctx; while (at.written) at = at.written;
      if (by) by.busy = (by.busy ?? 0) + 1;
      const said = this.diagnostics.length, mark = this.unread_log.length;
      let v: unknown; try { v = this.walk(new Code(code.text, code.b, code.e, at, code.floor)); } finally { if (by) by.busy!--; }
      if (this.is(v, r)) return v;
      // (what reads as nothing, as text: `device/terminal` is `Written`)
      const t = code.s.trim(); if ((v === undefined || v === this.none) && this.is(t, r)) { this.unsay(said); this.forget(mark); return t; }
      return NOT;
    }
    return this.sequence(code, T);
  }
  // whether a value is a context or made of it: what it continues into, what it is also made of
  made_of_(v: Ray | undefined, c: Ray, seen = new Set<Ray>()): boolean {
    for (let n = v; n && !seen.has(n); n = n.outer) { if (n === c) return true; seen.add(n); for (const a of n.also ?? []) if (this.made_of_(a, c, seen)) return true; }
    return false;
  }
  // whether a value is one of a context (it, or made of it; anything is one of the base)
  is(v: unknown, r: Ray): boolean {
    if (r === this.base) return true;
    const start = v instanceof Ray ? v : v === undefined ? undefined : this.kind_of(v);
    if (start && this.made_of_(start, r)) return true;
    // (else what the type value's own rule of one capture answers for the value: a narrowing's constraint, a superposition's
    // components; applied to the value directly)
    const eq = this.admitting(r); if (!eq || this.admits_now > 32) return false;
    const F = new Ray(eq.body.ctx); F.scope = true; F.rule = eq; F.self = r; F.caller = eq.body.ctx;
    F.m.set((eq.pieces[0] as { cap: string }).cap, v);
    this.admits_now++; try { return this.truthy(eq.native ? eq.native(F) : this.body(eq, F)); } finally { this.admits_now--; }
  }
  admits_now = 0;
  // (a type value's rule of one capture, its own or its class's, not the base's)
  admitting(r: Ray): Eq | undefined {
    for (let n: Ray | undefined = r; n && n !== this.base; n = n.outer) {
      if (n.eqs.length === 0) continue;
      for (let i = n.eqs.length - 1; i >= 0; i--) { const eq = n.eqs[i]; if (eq.pieces.length === 1 && 'cap' in eq.pieces[0] && !eq.pieces[0].reader && eq.pieces[0].type === undefined && !eq.node && !eq.value) return eq; }
      if (n.scope) break;
    }
    return undefined;
  }
  // a statement read as the class's own (`static`): what it defines is marked so
  static_now = 0;
  statically(code: unknown): unknown {
    this.static_now++;
    try { if (!(code instanceof Code)) return this.force(code); const c = this.written(code); return this.walk(stated(new Code(c.text, c.b, c.e, c.ctx, c.floor))); } finally { this.static_now--; }
  }
  // a value called with values, as the language calls it (`f(a, b)`): what holds them named where no name can be written
  called(f: Ray, xs: unknown[]): unknown {
    const T = new Ray(this.global); T.scope = true; T.m.set('\u0001f', f); xs.forEach((x, i) => T.m.set('\u0001' + i, x));
    const t = { name: 'called', s: '\u0001f(' + xs.map((_, i) => '\u0001' + i).join(', ') + ')' };
    return this.walk(new Code(t, 0, t.s.length, T));
  }
  // `p(…)` of a program (`@call`): the method its parameters and code are (made once), applied to what it is given
  program_methods = new WeakMap<Ray, Eq>();
  call_program(p: unknown, code: unknown, parameters: unknown, given: unknown): unknown {
    if (!(p instanceof Ray)) return undefined;
    // (given nothing: run, at its level)
    if (!(given instanceof Code) || !this.held(given.text, given.b, given.e)) return this.ran(p);
    let eq = this.program_methods.get(p);
    if (!eq) {
      const body = this.block_code(code); if (!body) return undefined;
      const node = this.named(''); node.params = []; const ps = this.block_code(parameters); if (ps) this.read_parameters(node, ps);
      eq = equivalence({ pieces: [{ cap: this.given_name }], body, ctx: body.ctx, order: 0, seq: 0, key: '', pairs: Infinity, node });
      this.program_methods.set(p, eq);
    }
    const g = this.written(given);
    return this.apply_(eq, [{ name: this.given_name, b: g.b, e: g.e, floor: 0 }], g);
  }
  // the code a value was made of: a block's (`{ … }`), or a program's held under one of its names
  block_code(v: unknown): Code | undefined {
    if (v instanceof Code) return v;
    if (!(v instanceof Ray)) return undefined;
    const c = this.blocks.get(v); if (c) return c;
    for (const eq of v.eqs) if (eq.value && eq.native) { const raw = eq.native(v), x = raw instanceof Later ? this.held_value(raw) : raw; if (x instanceof Ray && this.blocks.has(x)) return this.blocks.get(x); if (x instanceof Code && eq.key === 'code') return x; }
    return undefined;
  }
  // a closure applied to values, one for each of its parameters
  invoke_all(f: unknown, xs: unknown[]): unknown {
    if (f instanceof Ray && f.eqs.length !== 1) return this.called(f, xs);
    if (!(f instanceof Ray) || f.eqs.length !== 1) return undefined;
    const eq = f.eqs[0]; if (!eq.node?.params) return undefined;
    const F = new Ray(eq.body.ctx); F.scope = true; F.rule = eq; F.self = f;
    eq.node.params.forEach((p, i) => F.m.set(p, i < xs.length ? xs[i] : this.default_of(F, eq.node!, p)));
    if (F.outer !== eq.body.ctx) F.sees = eq.body.ctx;
    const I = new Ray(eq.node); I.scope = true; I.method = true; const W = new Ray(F.outer); W.scope = true; W.sees = F.sees; I.sees = W; F.outer = I; F.sees = undefined;
    return eq.native ? eq.native(F) : this.body(eq, F);
  }
  // A block's statements in order. One naming what nothing holds yet is read again once the block is read: what the block declares
  // further on it may name (only then is what it leaves unresolved said).
  sequence(code: Code, T: Ray): unknown {
    // (one statement: it alone)
    if (this.single(code)) { const one = this.splits.get(code.text)!.get(code.b)!.get(code.e)!.list[0]; return this.settle([stated(new Code(code.text, one.p, one.e, T))]); }
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
      // (inside another settling, one is read again only once something was declared since it was read: what it left unresolved is
      // otherwise left to that one, which reads it again with what it is in (reading it again at each would multiply))
      let kept: Map<Code, { adds: number; left: [Place, Diagnostic][] }> | undefined;
      for (let round = 0, before = Infinity; ; round++) {
        const again: Code[] = [], final = round >= 8;
        for (const c of left) {
          const k = kept?.get(c);
          if (inner && k && k.adds === this.adds) { for (const [p, d] of k.left) this.note(p, d); continue; }
          if (final) { last = this.tried(c, !inner); continue; }
          // (a statement that defined what a class holds, read again into one of what is made of it: the class's already, A7)
          // (the same block, written in the same frame: what it closes over is the same)
          const into = c.ctx.into, was = into && !into.scope ? this.defining.get(c.text)?.get(c.b) : undefined;
          if (was && was.cls !== into && was.written === c.ctx.outer && this.made(into!, was.cls)) continue;
          const d = this.diagnostics.length, mark = this.unread_log.length, n = into?.eqs.length ?? 0;
          this.ran_away = false; last = this.tried(c, false);
          // (one that did not end is not read again)
          if (this.ran_away) { this.forget(mark); continue; }
          // (or one that declared a field the class gives each of what is made of it (its `field_defaults`): given it there)
          if (into && !into.scope && into.eqs.length > n && (into.eqs.slice(n).every(eq => !eq.native) || into.eqs.slice(n).some(eq => eq.key === 'field_defaults'))) { let at = this.defining.get(c.text); if (!at) this.defining.set(c.text, at = new Map()); at.set(c.b, { cls: into, written: c.ctx.outer }); }
          const left_unresolved = this.since(mark); if (inner && left_unresolved.length > 0) (kept ??= new Map()).set(c, { adds: this.adds, left: left_unresolved.map(p => [p, this.unread.get(p)!]) }); this.forget(mark);
          if (left_unresolved.length > 0) { this.unsay(d); again.push(c); }
        }
        if (ROUNDS) console.log(this.settling + ' ' + this.applying + ' round', round, 'left', again.length, again[0] ? again[0].text.name + ':' + again[0].text.s.slice(0, again[0].b).split('\n').length : '', Math.round(performance.now()));
        if (ROUNDS === '2' && this.settling === 1) for (const c of again) console.log('   left', c.text.name.split('/').pop() + ':' + c.text.s.slice(0, c.b).split('\n').length, JSON.stringify(c.s.slice(0, 50)));
        if (final || again.length === 0) break;
        // (nothing more was read: the last time)
        if (again.length >= before) round = 7;
        before = again.length; left = again;
      }
    } finally { this.settling--; }
    return last;
  }
  settling = 0; ran_away = false; deciding = 0; adds = 0;
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
    catch (x) { if (x instanceof Jump && (x.kind === 'return' || x.kind === 'recur' ? this.methods : this.ordered) > 0) throw x; if (x instanceof Jump) { this.say(`Nothing to ${x.kind} from here.`, c.text, c.b, c.e); return undefined; } if (x instanceof Runaway && (this.settling > 1 || this.open > 0)) throw x; if (x instanceof Runaway) this.ran_away = true; this.say(`Failed: ${x instanceof Error ? x.message : String(x)}`, c.text, c.b, c.e); if (process.env.EXPR_STACK) console.log((x as Error).stack); return undefined; }
  }
  // A block read into a value: its names where it was written, what it declares the value's.
  into(code: Code, r: Ray, self?: unknown): unknown {
    // (into a rule's application: where it was applied; into a frame that reads into a value: into that value)
    if (r.scope && r.rule && r.caller) r = r.caller;
    if (r.scope && r.into) r = r.into;
    const T = new Ray(code.ctx); T.scope = true; T.into = r; T.sees = r; T.self = self;
    return this.sequence(code, T);
  }
  body(eq: Eq, F: Ray): unknown {
    if (eq.js === undefined) eq.js = this.located(eq.body) && this.interpreted.has(eq.body.text) ? this.js(eq) : this.accelerated?.(eq) ?? null;
    if (eq.js) return eq.js(F);
    // (a statement handed through, its functionality the capture it is: still a statement)
    if (F.statement) { const w = eq.word ??= eq.body.s.trim(); const c = F.m.get(w); if (c instanceof Code) return this.walk(stated(new Code(c.text, c.b, c.e, c.ctx, c.floor))); }
    // (one statement: read as the one it is, a label of itself the only place a `goto` in it goes)
    const one = this.single(eq.body) ? this.splits.get(eq.body.text)!.get(eq.body.b)!.get(eq.body.e)!.list[0] : undefined;
    if (one) {
      const c = stated(new Code(eq.body.text, one.p, one.e, F));
      this.ordered++;
      try { for (;;) { try { return this.walk(c); } catch (x) { if (!(x instanceof Jump) || x.kind !== 'goto' || (x.value instanceof Label ? x.value.at !== c : this.label_name(c) !== x.value)) throw x; } } } finally { this.ordered--; }
    }
    const h = this;
    return this.in_order(function* () { for (const [b, e] of h.statements(eq.body)) yield stated(new Code(eq.body.text, b, e, F)); }());
  }
  force(v: unknown): unknown { return v instanceof Code ? this.walk(v) : v; }
  // what a name holds, as it is read: one read when it is first read, read now
  held_value(v: unknown): unknown {
    if (v instanceof Later) { if (!v.read) { v.read = true; v.value = this.walk(v.code); } return v.value; }
    return this.force(v);
  }
  // (code given as an argument: marked so, as a copy)
  argued(c: Code): Code { if (c.argument) return c; const a = new Code(c.text, c.b, c.e, c.ctx, c.floor); a.argument = true; a.word = c.word; a.past = c.past; return a; }
  // an argument that begins by reading on from a value: a closure of one value, what each such reading in it reads on (T19)
  element = '\u0000element'; elements = 0;
  element_closure(code: Code): Ray {
    const into = new Ray(code.ctx); into.closure = true; this.elements++;
    const body = new Code(code.text, code.b, code.e, code.ctx, code.floor);
    this.add(into, [{ cap: this.element }], body);
    return into;
  }
  // the value the nearest such closure was called with, from where a reading on it is read
  element_of(F: Ray): unknown { return this.element_of_ctx(F.caller); }
  element_of_ctx(ctx: Ray | undefined): unknown {
    for (let n: Ray | undefined = ctx; n; n = n.caller ?? n.outer) { if (n.has(this.element)) return this.force(n.m.get(this.element)); if (!n.rule && !n.scope) break; }
    return undefined;
  }
  // the value a frame was applied on: the nearest that has one
  name(F: Ray, word: string): unknown { let t = this.named_texts.get(word); if (!t) this.named_texts.set(word, t = { name: word, s: word }); return this.walk(new Code(t, 0, word.length, F)); }
  named_texts = new Map<string, Text>();
  // the context a name is declared in: the nearest from where it is read that has it (else there)
  declaring(name: Code, F?: Ray): Ray {
    const word = name.s.trim(), has = (n: Ray) => n.has(word) || this.has_key(n, word);
    // (from where the assignment is read: what it is read into, then around it; else where the name was written)
    let at = F?.caller; while (at && at.rule && !at.into) at = at.caller;
    if (at?.into && has(at.into)) return at.into;
    for (const n of this.reach(at ?? name.ctx)) if (has(n)) return n.into ?? n;
    for (const n of this.reach(name.ctx)) if (has(n)) return n.into ?? n;
    return at?.into ?? at ?? name.ctx;
  }
  // the context a statement is read in: what is read into, else the nearest frame no rule applied
  here(F: Ray): Ray | undefined {
    // (what a closure is called with is read where it was written: not in the closure)
    for (let n: Ray | undefined = F.caller; n; n = n.into?.closure && n.written ? n.written : n.caller ?? n.outer) { if (n.into?.closure) continue; if (n.into) return n.into; if (!n.rule) return n; }
    return undefined;
  }
  // whether a context has a name of its own
  has(x: unknown, word: string): boolean { return x instanceof Ray && (x.has(word) || this.has_key(x, word)); }
  self(F: Ray): unknown { return this.self_(F.caller, new Set<Ray>()); }
  self_(n: Ray | undefined, seen: Set<Ray>): unknown {
    for (; n && !seen.has(n); n = n.caller ?? n.outer) { seen.add(n); if (n.self instanceof Ray && n.self.closure && n.rule?.node?.spelled === '') return this.self_(n.self.outer, seen); if (n.self !== undefined) return n.self; if (n.written && !n.rule && n.outer && !n.outer.scope) return n.outer; if (n.into && !n.rule && n.into !== this.global && !n.into.scope) return n.into; if (n.sees) { const v = this.self_(n.sees, seen); if (v !== undefined) return v; } }
    return undefined;
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
    const T = new Ray(O instanceof Ray ? O : c.ctx); T.scope = true; if (O instanceof Ray) { T.sees = c.ctx; T.written = c.ctx; T.level = true; }
    return this.sequence(c, T);
  }
  // what a value holds under a name (its own, or its class's)
  field(v: unknown, word: string): unknown {
    for (let n = v instanceof Ray ? v : undefined; n && !n.scope; n = n.outer) {
      if (n.has(word)) return this.held_value(n.m.get(word));
      for (let i = n.eqs.length - 1; i >= 0; i--) { const x = n.eqs[i]; if (x.key === word && x.native) return this.held_value(x.native(n)); }
    }
    return undefined;
  }
  // what a value holds along a path, each step a member it holds (`device/terminal`); nothing where a step is not held
  path(v: unknown, text: string, by: string): unknown {
    let at = v;
    for (const step of text.split(by)) { if (!(at instanceof Ray) || !this.holds_member(at, step)) return undefined; at = this.field(at, step); }
    return at;
  }
  holds_member(v: Ray, word: string): boolean { for (let n: Ray | undefined = v; n && !n.scope; n = n.outer) if (n.has(word) || (this.has_key(n, word) && n.eqs.some(x => x.key === word && x.native))) return true; return false; }
  // a closure applied to a value; whether a value holds (every value but nothing and false)
  invoke(f: unknown, x: unknown): unknown {
    if (f instanceof Ray && f.eqs.length !== 1) return this.called(f, [x]);
    if (!(f instanceof Ray) || f.eqs.length !== 1) return undefined;
    if (++this.applying > DEEPEST) { this.applying = 0; throw new Runaway(`deeper than ${DEEPEST} applications (a type's constraint)`); }
    try { return this.invoke_(f, x); } finally { if (this.applying > 0) this.applying--; }
  }
  invoke_(f: Ray, x: unknown): unknown {
    const eq = f.eqs[0];
    const F = new Ray(eq.body.ctx); F.scope = true; F.rule = eq;
    // (a method: its first parameter given the value, the rest what they say; the frame continues into it, as applied)
    if (eq.node?.params) {
      const ps = eq.node.params; if (ps.length === 0) return undefined;
      F.m.set(ps[0], x); for (const p of ps.slice(1)) F.m.set(p, this.default_of(F, eq.node, p));
      if (F.outer !== eq.body.ctx) F.sees = eq.body.ctx;
      const I = new Ray(eq.node); I.scope = true; I.method = true; const W = new Ray(F.outer); W.scope = true; W.sees = F.sees; I.sees = W; F.outer = I; F.sees = undefined;
      return eq.native ? eq.native(F) : this.body(eq, F);
    }
    const c = eq.pieces.find(q => 'cap' in q) as { cap: string } | undefined; if (!c) return undefined;
    F.m.set(c.cap, x);
    return eq.native ? eq.native(F) : this.body(eq, F);
  }
  truthy(v: unknown): boolean { return v !== undefined && v !== this.none && v !== NOT && v !== this.name(this.global, 'false'); }
  // a context the host reads text with (`js.ray`): `test` gives what a span is read as, or undefined
  reader(test: (s: string) => unknown): Ray { const r = new Ray(); r.test = test; return r; }

  // ---------------------------------------------------------------- @js: the host's language, at its location
  location = '@js'; interpreted = new Set<Text>(); mapping?: Text;
  // (an optional layer, `compile.ts`: a rule's functionality given an equivalent in the host's language; none: read as written)
  accelerated?: (eq: Eq) => ((F: Ray) => unknown) | undefined;
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
  boot(text: Text, mapping?: Text, kinds?: Text) {
    const from = this.axiom(text);
    // (the host's language at its location: `@js code`, the code run with the frame it is read in)
    const at = this.add(this.global, [{ lit: this.location + this.learned.space }, { cap: this.location }], new Code(text, 0, 0, this.global));
    // (code there run by this interpreter: what its own files write; elsewhere, code in that language is a value, the text written)
    at.native = F => { const c = F.m.get(this.location) as Code; if (!this.interpreted.has(c.text)) return c.s.trim(); return new Function('$', 'F', 'Ray', `return (${c.s});`)(this, c.ctx, Ray); };
    this.interpreted.add(text); if (mapping) { this.interpreted.add(mapping); this.mapping = mapping; } if (kinds) this.interpreted.add(kinds);
    // (read as one: what the mapping names that the language declares later is read again once it is)
    this.booting = true;
    try { this.project([...(mapping ? [mapping] : []), text, ...(kinds ? [kinds] : [])], this.global, from, text); } finally { this.booting = false; }
  }
}
// (every equivalence the same shape: what it comes to hold, held from the start)
function equivalence(x: Pick<Eq, 'pieces' | 'body' | 'ctx' | 'order' | 'seq' | 'key' | 'pairs'> & Partial<Eq>): Eq {
  return { own: undefined, pieces: x.pieces, body: x.body, ctx: x.ctx, order: x.order, seq: x.seq, key: x.key, value: undefined, operator: undefined, pairs: x.pairs, busy: undefined, native: x.native, js: undefined, word: undefined, receiver: undefined, apart: undefined, node: x.node, passing: undefined, indexed: undefined };
}
// (every reading the same shape)
function read_of(eq: Eq | undefined, name: boolean, caps: Cap[], b: number, e: number): Read {
  return { eq, name, caps, on: undefined, self: undefined, b, e, near: undefined, from: undefined };
}
function stated(c: Code): Code { c.statement = true; return c; }
// A value given as a functionality (where it was written).
export class Value { constructor(public value: unknown, public code: Code) {} }
const NOT = Symbol('not read');
const NO_LEAD: number[] = [];
// a reading that does not end: what applies deeper, or more often, than any program is written to
class Runaway extends Error {}
// a value read when it is first read (a field's default), then kept
class Later { constructor(public code: Code) {} read = false; value?: unknown; }
// a jump out of what is being read: to the end, or the start again, of the loop it is in (`break`, `continue`), out of the method
// it is in with a value (`return`)
// a label's place: the statement it is, among those it is written with
export class Label { constructor(public at: Code) {} }
export class Jump { constructor(public kind: string, public value?: unknown, public to?: Ray) {} }
const NOMEMO = !!process.env.EXPR_NOMEMO, NOSHARE = !!process.env.EXPR_NOSHARE, SHAPED = !process.env.EXPR_UNSHAPED, DEADLINE = Number(process.env.EXPR_DEADLINE ?? 0) * 1000, STACK = !!process.env.EXPR_CHAIN, SLOW = Number(process.env.EXPR_SLOW ?? 0);
const MISSES = !!process.env.EXPR_MISSES, RULES = !!process.env.EXPR_RULES, ROUNDS = process.env.EXPR_ROUNDS, NOTS = !!process.env.EXPR_NOTS, DBGF = !!process.env.DBGF;
const DEEPEST = Number(process.env.EXPR_DEEPEST ?? 3000), LONGEST = Number(process.env.EXPR_LONGEST ?? 1000000);
const REJECT = Symbol('reads nothing');
// (what a shape is keyed by where nothing is, and a block read into a value)
const INTO = {};
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
