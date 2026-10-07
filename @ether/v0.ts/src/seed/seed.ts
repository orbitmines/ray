// the debug switches, read once (reading the environment is a call into the runtime)
const ENV = { SEED_CAPS: process.env.SEED_CAPS, SEED_COUNT: process.env.SEED_COUNT, SEED_DBG: process.env.SEED_DBG, SEED_DEPTH: process.env.SEED_DEPTH, SEED_EXT: process.env.SEED_EXT, SEED_INLINE: process.env.SEED_INLINE, SEED_REREAD: process.env.SEED_REREAD, SEED_SLOW: process.env.SEED_SLOW, SEED_STEPS: process.env.SEED_STEPS, SEED_TIME: process.env.SEED_TIME, SEED_HANG: process.env.SEED_HANG, SEED_STACK: process.env.SEED_STACK };
// The seed: what starts the reader when there is nothing yet (spec/Reader.md R0). It knows no syntax. Its one assumption is
// about meaning: the entrypoint's first statement defines how rules are defined, and uses that definition in its own body.
// From that statement it infers the capture brackets, the definer, the access word and the statement end (R0.1); it reads
// with those alone (R0.2) until the entrypoint hands reading over (R0.6). A rule's body is read once into a goto program,
// and the goto program is written out as JS (R0.4): nothing is interpreted.

export type Text = { name: string; s: string };
export type Span = { text: Text; b: number; e: number };   // end exclusive
export class Node {
  members = new Map<string, unknown>();
  rules: Rule[] = [];
  // a frame's caller (the frame that applied the rule) and the rule it is a frame of
  caller?: Node; rule?: Rule;
  // how many rules were defined here: a body read here is read again when this, or the count of a scope around it, changed
  version = 0;
  constructor(public parent?: Node) {}
  *reach(): Generator<Rule> { for (let n: Node | undefined = this; n; n = n.parent) for (let i = n.rules.length - 1; i >= 0; i--) yield n.rules[i]; }
}
// Code: a span, read later in the frame it was written in.
// What a span always is, whatever frame it is read in: its text, the one word it is (if it is one), its programs.
export type SpanOf = { s: string; word: string | undefined; programs: Map<Rule | undefined, Map<Node | undefined, { version: number; fn: Compiled; unread?: boolean; epoch?: number; handed?: Rule }>> };
const spans = new WeakMap<Text, Map<number, SpanOf>>();
function span_of(text: Text, b: number, e: number): SpanOf {
  let m = spans.get(text); if (m === undefined) spans.set(text, m = new Map());
  const k = b * 4194304 + e; let t = m.get(k);
  if (t === undefined) { const s = text.s.slice(b, e), w = s.trim(); m.set(k, t = { s, word: w.length > 0 && !/\s/.test(w) ? w : undefined, programs: new Map() }); }
  return t;
}
// `planner`: the reader in force where it was written, which reads it into a program (none: the seed).
export class Code {
  of: SpanOf;
  raw = false;   // a capture taken as written: its value is its text, never read
  constructor(public text: Text, public b: number, public e: number, public frame: Node, public planner?: Rule, of?: SpanOf) { this.of = of ?? span_of(text, b, e); }
  get s() { return this.of.s; }
}
// A typed capture holds only what its type's own rules read whole (R2.2, R2.3); it is then read by them.
export type Piece = { lit: string } | { cap: string; type?: Node };
export type Rule = { head: Code; pieces: Piece[]; body: Code; order: number; fn?: Compiled; version?: number; planner?: Rule };
export type Diagnostic = { message: string; at: Span };
// What the first statement taught (R0.1).
// `indent` is what the first statement's body was indented by: a line that starts deeper than its statement continues it.
export type Learned = { open: string; close: string; space: string; definer: string; access: string; end: string; indent: string };

// ---------------------------------------------------------------- the goto program a body compiles to (R0.4, R3.1)
// Each statement is one step; `label`/`goto` are the program's edges, the rest are calls of an external or of a rule.
type Step =
  | { kind: 'external'; name: string; args: (Span & { code?: boolean })[]; at: Span }
  | { kind: 'apply'; rule: Rule; caps: [string, Span][]; given?: [string, unknown][]; at: Span }
  | { kind: 'label'; name: string }
  | { kind: 'goto'; name: string; when?: Span & { code?: boolean }; at: Span }
  | { kind: 'name'; at: Span }
  | { kind: 'unread'; at: Span };
export type Compiled = (frame: Node) => unknown;
// A jump to a label (R3.1): raised by `goto`, caught by the program that has the label, with the value read last.
// SEED_SLOW=ms: top-level statements that took longer, printed as they finish.
const SLOW = Number(ENV.SEED_SLOW ?? 0);
// SEED_EXT: calls and time per external, printed at exit.
const EXT = ENV.SEED_EXT ? new Map<string, [number, number]>() : undefined;
const EXT_IN = new Map<string, number>();
if (EXT) process.on('exit', () => { for (const [n, c] of [...EXT_IN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log('externals in', String(c).padStart(9), n.split('\n')[0]); for (const [n, [c, t]] of [...EXT.entries()].sort((a, b) => b[1][1] - a[1][1])) console.log('external', n.padEnd(10), String(c).padStart(9), Math.round(t) + ' ms'); });
// SEED_DEPTH: the deepest frame chain a name was looked up through.
const DEPTH = ENV.SEED_DEPTH ? { max: 0, word: '' } : undefined;
if (DEPTH) process.on('exit', () => console.log('deepest lookup', DEPTH.max, DEPTH.word));
// SEED_COUNT: how often each rule was applied, printed at exit.
// The arguments each external reads, in the order it reads them: given to it read (no code made for them), the rest as code.
const EAGER: Record<string, number[]> = { declare: [1], get: [0], assign: [1], keep: [0], own: [0], set: [2, 0], same: [0, 1], reader: [0], planner: [0], rules: [0], report: [0, 1, 2], io: [1], code: [0, 1], read: [0, 1] };
// SEED_HANG=n: after n applications, the rules being applied (innermost last), and stop.
const HANG = ENV.SEED_HANG ? { n: 0, max: Number(ENV.SEED_HANG), stack: [] as string[] } : undefined;
const COUNT = ENV.SEED_COUNT ? new Map<string, number>() : undefined, SELF = COUNT && new Map<string, number>(), STACK = ['(top)'];
if (COUNT) process.on('exit', () => { const all = [...COUNT.entries()].sort((a, b) => b[1] - a[1]); console.log('applications', all.reduce((t, [, n]) => t + n, 0)); for (const [h, n] of all.slice(0, 25)) console.log(String(n).padStart(9), h.split('\n')[0]); console.log('applications within each method'); for (const [h, n] of [...SELF!.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(n).padStart(9), h.split('\n')[0]); });
export class Jump { constructor(public name: string, public value: unknown) {} }

export class Seed {
  learned?: Learned;
  global = new Node();
  diagnostics: Diagnostic[] = [];
  order = 0;
  version = 0;
  externals = new Map<string, (frame: Node, args: unknown[], at: Span) => unknown>();
  output: (line: string) => void = line => console.log(line);

  constructor() {
    const self = this;
    // R0.7 — none of them syntax
    this.externals.set('rule', (frame, [pattern, body]) => self.define(self.code_of(pattern), self.code_of(body)));
    this.externals.set('declare', (frame, [name, value]) => { const n = self.code_of(name); if (ENV.SEED_DBG && n.s === 'Item') { const vv = (value); console.log('DECLARE Item', self.show(vv), n.frame === self.global); n.frame.members.set(n.s, vv); return vv; } const v = (value); n.frame.members.set(n.s, v); return v; });
    this.externals.set('node', () => new Node());
    // a node's `outer` (the frame it was made in), and a frame's `caller_frame` and `applied_rule` (as a node), read like members
    // (named so no member a program sets is taken for them)
    this.externals.set('get', (frame, [of, name]) => { const n = (of) as Node | undefined, k = self.code_of(name).s; return !(n instanceof Node) ? undefined : n.members.has(k) ? n.members.get(k) : k === 'outer' ? n.parent : k === 'caller_frame' ? n.caller : k === 'applied_rule' ? (n.rule && self.node_of(n.rule)) : undefined; });
    // a name written where it was declared (the nearest frame from where it was written that has it, else there)
    this.externals.set('assign', (frame, [name, value]) => { const c = self.code_of(name), k = c.s.trim(), v = (value); if (ENV.SEED_DBG && k === 'Item') console.log('ASSIGN Item', self.show(v)); let at: Node | undefined = c.frame; while (at && !at.members.has(k)) at = at.parent; (at ?? c.frame).members.set(k, v); return v; });
    // a member set to code as written, unread (read where the member is read)
    this.externals.set('keep', (frame, [of, name, value]) => { const o = (of) as Node; o.members.set(self.code_of(name).s, value); return value; });
    // whether a node has a member of its own (one set there, even to nothing)
    this.externals.set('own', (frame, [of, name]) => { const n = (of); return n instanceof Node && n.members.has(self.code_of(name).s) ? true : undefined; });
    this.externals.set('set', (frame, [of, name, value]) => { const v = (value), o = (of) as Node; if (!(o instanceof Node)) throw new Error('set on ' + (of instanceof Code ? JSON.stringify(of.s) + ' in ' + self.show(of.frame) + ' = ' + self.show(o) : String(of)) + ' (not a node)'); const k = self.code_of(name).s; if (k === 'outer') { if (ENV.SEED_DBG) console.log('SET PARENT', self.show(o), '->', self.show(v)); o.parent = v as Node | undefined; } else o.members.set(k, v); return v; });
    // the frame a name is bound in: the nearest from where it was written that has it (even holding nothing), else that one
    this.externals.set('declaring', (frame, [name]) => { const c = self.code_of(name), k = c.s.trim(); for (let n: Node | undefined = c.frame; n; n = n.parent) if (n.members.has(k)) return n; return c.frame; });
    this.externals.set('same', (frame, [a, b]) => (a) === (b) ? true : undefined);
    // R0.6: reading handed to a rule of the entrypoint; it is applied to the place where a statement starts and answers the
    // place after it.
    this.externals.set('reader', (frame, [rule]) => { if (ENV.SEED_TIME) console.log('handover at', Math.round(performance.now()), 'ms'); self.handed = self.rule_of((rule)); return self.handed; });
    this.externals.set('planner', (frame, [rule]) => { self.planner = self.rule_of((rule)); return self.planner; });
    // R0.7, R1: a text is a chain of places, each holding a character node (one node per character) and the next place.
    this.externals.set('rules', (frame, [of]) => self.rules_of((of) as Node));
    // Run a rule's body, or code, in a frame: captures given as spans (`name`, `from`, `to`) or as values (`value`, in order).
    // (a rule's frame made inside `parent`, when given: a method's inside the value it is a method of)
    this.externals.set('apply', (frame, [rule, caps, within, parent]) => {
      const r = rule instanceof Code ? rule : self.force(rule), w = self.force(within) as Node;
      // code applied in a frame: the frame sees where the code was written (when that is inside what it saw); a method's frame
      // (one with `method`) is where a jump nothing in it caught stops (`return`)
      if (r instanceof Code) {
        if (r.frame !== w && (w.parent === undefined || self.inside(r.frame, w.parent))) w.parent = r.frame;
        const run = self.compile(new Code(r.text, r.b, r.e, w, r.planner, r.of));
        if (!w.members.has('method')) return run(w);
        try { return run(w); } catch (x) { if (x instanceof Jump) return x.value; throw x; }
      }
      return self.apply_chain(r as Node, self.force(caps) as Node | undefined, w, parent === undefined ? undefined : self.force(parent) as Node);
    });
    // What reading says: a diagnostic over the places from `from` to `to`.
    // (a message given as text: a node with the places it is `from` and `to`)
    this.externals.set('report', (frame, [from, to, message]) => { const f = self.where.get((from) as Node)!, t = (to) as Node | undefined; const e = t === undefined ? f.text.s.length : self.where.get(t)!.i; const m = (message) as Node | undefined; let said = `Unread \`${f.text.s.slice(f.i, e).slice(0, 60)}\`.`; if (m instanceof Node && m.members.has('from')) { const mf = self.where.get(m.members.get('from') as Node), mt = m.members.get('to') as Node | undefined; if (mf) said = mf.text.s.slice(mf.i, mt === undefined ? mf.text.s.length : self.where.get(mt)!.i); } self.say(said, { text: f.text, b: f.i, e }); return undefined; });
    // The outside world (the host's natives, as the old host has them): only writing a stream so far.
    this.externals.set('io', (frame, [stream, content]) => { const v = (content); self.output(self.show(v)); return undefined; });
    // A rule whose head the reader in Ray has read (R2.1): `pieces` a chain of `literal`/`capture` (spans, a capture's
    // `type`). Answers the rule as a node (`pieces`, `head_from`, `head_to`, `scope`) for the reader to keep where it reads rules.
    this.externals.set('define', (frame, [pattern, pieces, body]) => {
      const head = self.code_of(pattern), list: Piece[] = [];
      for (let p = self.force(pieces) as Node | undefined; p; p = p.members.get('next') as Node | undefined) {
        const f = self.where.get(p.members.get('from') as Node)!, t = p.members.get('to') as Node | undefined;
        const text = f.text.s.slice(f.i, t === undefined ? f.text.s.length : self.where.get(t)!.i);
        list.push(p.members.has('capture') ? (p.members.has('type') ? { cap: text, type: p.members.get('type') as Node } : { cap: text }) : { lit: text });
      }
      const b = self.code_of(body);
      const rule: Rule = { head, pieces: list, body: new Code(b.text, b.b, b.e, b.frame, self.planner), order: self.order++, planner: self.planner };
      self.version++; head.frame.version++;
      // the rule as the reader keeps it: with the pieces it read (their flags: `leading`, `optional`, `raw`, `gap`, `line_end`)
      const n = self.node_of(rule); n.members.set('pieces', self.force(pieces));
      return n;
    });
    // Where code is: a node with the place it starts at (`from`) and the place after it (`to`, none at the text's end).
    this.externals.set('span', (frame, [code]) => { if (!(code instanceof Code)) return undefined; const c = self.written(code), n = new Node(); n.members.set('from', self.place(c.text, c.b)); n.members.set('to', c.e >= c.text.s.length ? undefined : self.place(c.text, c.e)); n.members.set('frame', c.frame); return n; });
    // Code from one place to another, read where `like` was written (a capture's type, read once when its rule is defined).
    // The same, unread: a node holding the code (as `**` does).
    this.externals.set('code', (frame, [from, to, like]) => { const f = self.where.get((from) as Node)!, t = (to) as Node | undefined, l = self.written(like), n = new Node(); n.members.set('code', new Code(f.text, f.i, t === undefined ? f.text.s.length : self.where.get(t)!.i, l.frame, l.planner)); return n; });
    this.externals.set('read', (frame, [from, to, like]) => { const f = self.where.get((from) as Node)!, t = (to) as Node | undefined, l = self.written(like); const c = new Code(f.text, f.i, t === undefined ? f.text.s.length : self.where.get(t)!.i, l.frame, l.planner); if (ENV.SEED_DBG && c.s === 'Item') console.log('READ Item', l.frame === self.global, l.frame.members.has('Item'), self.show(l.frame.members.get('Item')), JSON.stringify(f.text.s.slice(f.i - 30, f.i + 10))); return self.force(c); });
    this.externals.set('.', frame => frame);
    // the top scope (what the entrypoint is read in)
    this.externals.set('global', () => self.global);
    // Code as a value (a Program): a node holding the code unread, not read where a name names it.
    this.externals.set('**', (frame, [x]) => { const n = new Node(); if (x instanceof Code) n.members.set('code', self.named(x)); else n.members.set('value', x); return n; });
    // What the first statement taught, as characters (R0.1): `end`, `space`, and `indent` (a chain).
    this.externals.set('learned', () => { const n = new Node(), l = self.learned!; n.members.set('end', self.character(l.end)); n.members.set('space', self.character(l.space)); n.members.set('indent', self.chain_of(l.indent)); n.members.set('access', self.chain_of(l.access)); n.members.set('open', self.character(l.open)); n.members.set('close', self.character(l.close)); n.members.set('definer', self.chain_of(l.definer)); return n; });
  }

  say(message: string, at: Span) { this.diagnostics.push({ message, at }); }

  // ---------------------------------------------------------------- R1: text as a chain of places
  handed?: Rule;
  // The rule of the entrypoint that reads a body into its statements (R0.6); a rule is compiled by the planner in force when
  // it was defined, so the reader never reads itself (R0.5).
  planner?: Rule;
  characters = new Map<string, Node>();
  character(c: string): Node { let n = this.characters.get(c); if (n === undefined) this.characters.set(c, n = new Node()); return n; }
  places = new Map<Text, Node[]>();
  // The place at `i` in a text: its character and the next place (none at the end). Made once per text.
  place(text: Text, i: number): Node | undefined {
    let all = this.places.get(text);
    if (all === undefined) {
      all = [];
      // every place knows the text it is in (a node per text)
      const of = new Node();
      for (let k = 0; k < text.s.length; k++) { const n = new Node(); n.members.set('character', this.character(text.s[k])); n.members.set('text', of); all.push(n); }
      all.forEach((n, k) => { if (k + 1 < all!.length) n.members.set('next', all![k + 1]); if (k > 0) n.members.set('previous', all![k - 1]); this.where.set(n, { text, i: k }); });
      // (the end of a text, the place after its last, is nothing: what comes before it is the text's `last`)
      if (all.length > 0) of.members.set('last', all[all.length - 1]);
      if (all.length > 0) of.members.set('first', all[0]);
      this.places.set(text, all);
    }
    return all[i];
  }
  where = new Map<Node, { text: Text; i: number }>();
  // A literal written in a head, as a chain of places of its own.
  chain_of(s: string): Node | undefined { return s.length === 0 ? undefined : this.place({ name: 'literal', s }, 0); }
  // A capture's name: written as text by the seed's pieces, or the span of the piece the reader in Ray read.
  cap_name(c: Node): string { const n = c.members.get('name'); if (typeof n === 'string') return n; const p = c.members.get('piece') as Node, f = this.where.get(p.members.get('from') as Node)!, t = p.members.get('to') as Node | undefined; return f.text.s.slice(f.i, t === undefined ? f.text.s.length : this.where.get(t)!.i); }
  rule_of(x: unknown): Rule { return x instanceof Node ? x.members.get('rule') as Rule : x as Rule; }
  // A rule as a node: its pieces in order (`literal`: a chain of places; `capture`: its name), its head and its order.
  rule_nodes = new Map<Rule, Node>();
  node_of(rule: Rule): Node {
    let n = this.rule_nodes.get(rule);
    if (n !== undefined) return n;
    n = new Node(); n.members.set('rule', rule); n.members.set('scope', rule.head.frame); n.members.set('body', rule.body);
    { const h = rule.head, from = h.s.length - h.s.trimStart().length, to = h.s.trimEnd().length; n.members.set('head_from', this.place(h.text, h.b + from)); n.members.set('head_to', h.b + to >= h.text.s.length ? undefined : this.place(h.text, h.b + to)); }
    let first: Node | undefined, last: Node | undefined;
    for (const piece of rule.pieces) {
      const p = new Node();
      if ('lit' in piece) { const c = this.chain_of(piece.lit); p.members.set('literal', c); p.members.set('from', c); } else { p.members.set('capture', piece.cap); if (piece.type) p.members.set('type', piece.type); if (first === undefined) p.members.set('leading', true); }
      if (last) last.members.set('next', p); else first = p;
      last = p;
    }
    n.members.set('pieces', first);
    this.rule_nodes.set(rule, n);
    return n;
  }
  // The rules in reach of a frame, nearest first, as a chain.
  rules_of(frame: Node): Node | undefined {
    let first: Node | undefined, last: Node | undefined;
    for (const rule of frame.reach()) { const link = new Node(); link.members.set('rule', this.node_of(rule)); if (last) last.members.set('next', link); else first = link; last = link; }
    return first;
  }
  // A rule applied with captures read by the entrypoint's reader: a chain of (name, from, to) where from/to are places.
  apply_chain(rule: Node, caps: Node | undefined, within: Node, parent?: Node): unknown {
    if (ENV.SEED_CAPS) { const ps: string[] = []; const rr = rule instanceof Node ? rule.members.get('pieces') as Node | undefined : undefined; for (let p = rr; p; p = p.members.get('next') as Node | undefined) ps.push([...p.members.keys()].filter(k => k !== 'next').join('+')); console.log('APPLY', JSON.stringify(this.rule_of(rule).head.s.trim().slice(0, 40)), ps.join(' | '), '::', (() => { const out: string[] = []; for (let c = caps; c; c = c.members.get('next') as Node | undefined) { const f = this.where.get(c.members.get('from') as Node), t = c.members.get('to') as Node | undefined; out.push(f ? JSON.stringify(f.text.s.slice(f.i, t === undefined ? f.text.s.length : this.where.get(t)!.i)) : [...c.members.keys()].join('+')); } return out.join(' | '); })()); }
    const r = this.rule_of(rule), list: [string, Span][] = [], given: [string, unknown][] = [];
    if (caps !== undefined && caps.members.has('value') && !caps.members.has('piece') && !caps.members.has('name')) {
      // captures given as values, in the order the rule's head names them
      const f = new Node(parent ?? r.head.frame), names = r.pieces.filter(p => 'cap' in p).map(p => (p as { cap: string }).cap);
      f.caller = within; f.rule = r;
      let i = 0; for (let c: Node | undefined = caps; c; c = c.members.get('next') as Node | undefined) f.members.set(names[i++], c.members.get('value'));
      return this.compiled(r)(f);
    }
    for (let c = caps; c; c = c.members.get('next') as Node | undefined) {
      // a capture given as a value (a receiver bound to its capture): the value itself
      if (c.members.has('value')) { given.push([this.cap_name(c), c.members.get('value')]); continue; }
      const from = this.where.get(c.members.get('from') as Node)!, to = c.members.get('to') as Node | undefined;
      const e = to === undefined ? from.text.s.length : this.where.get(to)!.i;
      list.push([this.cap_name(c), { text: from.text, b: from.i, e, type: c.members.get('type') as Node | undefined, raw: c.members.has('raw') } as Span]);
    }
    return this.apply(r, within, list, this.planner, given, parent);
  }

  // ---------------------------------------------------------------- R0.1: the first statement, read by what it says about itself
  // `{pattern} => {body} => external rule pattern body`: the body's words that the head wraps in one pair of characters are
  // the captures; that pair are the brackets; the literal between the head's captures, met again after the head, is the
  // definer; the body's other words are the access word and the external; what follows the body's last capture ends it.
  axiom(text: Text): number {
    const s = text.s;
    for (let k = 1; k < s.length; k++) {
      const open = s[0], close = s[k], name = s.slice(1, k);
      if (name.length === 0 || name.includes(open)) continue;
      if (s.indexOf(name, k + 1) < 0) continue;
      // the head's captures, with the brackets this guess gives
      const caps: { b: number; e: number; name: string }[] = [];
      for (let i = 0; i < s.length && caps.length < 2; i++) if (s[i] === open) { const j = s.indexOf(close, i + 1); if (j < 0) break; caps.push({ b: i, e: j + 1, name: s.slice(i + 1, j) }); i = j; }
      if (caps.length < 2) continue;
      const after = caps[1].e;
      // the body: words, separated by what separates the capture names in it
      const first = s.indexOf(caps[0].name, after), second = s.indexOf(caps[1].name, first + caps[0].name.length);
      if (first < 0 || second < 0) continue;
      const space = s.slice(first + caps[0].name.length, second);
      if (space.length === 0) continue;
      const between = s.slice(caps[0].e, caps[1].b), definer = between.split(space).filter(w => w.length > 0).join(space);
      // after the head: the definer again, then either a space and the body, or a line end and the body indented
      const defAt = s.indexOf(definer, after);
      if (defAt < 0 || s.slice(after, defAt).split(space).some(w => w.length > 0)) continue;
      const bodyLine = s.slice(defAt + definer.length, first);
      const end = second + caps[1].name.length;
      const stop = s[end] ?? '';
      // the gap before the body: a space, or the statement end and the spaces that indent the body (which continue it)
      let gap = '';
      if (bodyLine.startsWith(space)) gap = space;
      else if (stop.length > 0 && bodyLine.startsWith(stop)) { gap = stop; while (bodyLine.startsWith(space, gap.length)) gap += space; }
      const indent = gap === space ? '' : gap.slice(stop.length);
      if (gap.length === 0 || (gap !== space && indent.length === 0)) continue;
      const lead = bodyLine.slice(gap.length).split(space).filter(w => w.length > 0);
      if (lead.length !== 2) continue;
      this.learned = { open, close, space, definer, access: lead[0], end: stop, indent };
      const head = new Code(text, 0, after, this.global), body = new Code(text, defAt + definer.length + gap.length, end, this.global);
      this.define(head, body);
      return end;
    }
    throw new Error('the first statement does not define how rules are defined');
  }

  // Where the statement that starts at `p` ends: at a statement end not followed by a line deeper than `base`.
  stop(text: Text, p: number, limit: number, base: string): number {
    const s = text.s, { end, indent } = this.learned!;
    for (let i = p; ;) {
      const e = s.indexOf(end, i);
      if (e < 0 || e >= limit) return limit;
      if (indent.length > 0 && s.startsWith(base + indent, e + end.length)) { i = e + end.length; continue; }
      return e;
    }
  }
  // What the line holding `p` is indented by: the spaces it starts with.
  base(text: Text, p: number): string {
    const { end, space } = this.learned!, from = text.s.lastIndexOf(end, p - 1) + end.length;
    let i = from; while (i < p && text.s.startsWith(space, i)) i += space.length;
    return text.s.slice(from, i);
  }

  // ---------------------------------------------------------------- rules: defined where their head was written
  // Whether `a` is `b` or a scope inside it.
  inside(a: Node, b: Node): boolean { for (let n: Node | undefined = a; n; n = n.parent) if (n === b) return a !== b; return false; }
  // Code followed back to where it was written: a word naming code held by its frame is that code.
  written(x: unknown): Code {
    let c = this.code_of(x);
    for (let i = 0; i < 64; i++) {
      const w = c.of.word; if (w === undefined) break;
      let held: unknown; for (let n: Node | undefined = c.frame; n; n = n.parent) if (n.members.has(w)) { held = n.members.get(w); break; }
      if (!(held instanceof Code)) break;
      c = held;
    }
    return c;
  }
  // A name given to an external: code as written, followed back to where it was written when it is a word naming held code
  // (a capture passed on); a raw capture is taken as written.
  named(x: unknown): Code { return x instanceof Code && !x.raw ? this.written(x) : this.code_of(x); }
  code_of(x: unknown): Code { return x instanceof Code ? x : new Code({ name: '?', s: String(x) }, 0, String(x).length, this.global); }
  define(head: Code, body: Code, pieces?: Piece[]): Rule {
    const rule: Rule = { head, pieces: pieces ?? this.pieces(head.s.trim()), body: new Code(body.text, body.b, body.e, body.frame, this.planner), order: this.order++, planner: this.planner };
    head.frame.rules.push(rule);
    this.version++; head.frame.version++;
    return rule;
  }
  // The pieces of a head: a capture is the learned brackets around a name (its first word); brackets around other brackets are literal.
  pieces(head: string): Piece[] {
    const { open, close, space } = this.learned!;
    const out: Piece[] = [];
    let lit = '';
    for (let i = 0; i < head.length;) {
      if (head[i] === open) {
        const j = head.indexOf(close, i + 1), inner = j < 0 ? '' : head.slice(i + 1, j);
        if (j > i + 1 && !inner.includes(open)) { if (lit) { out.push({ lit }); lit = ''; } out.push({ cap: inner.split(space)[0] }); i = j + 1; continue; }
      }
      lit += head[i++];
    }
    if (lit) out.push({ lit });
    return out;
  }

  // ---------------------------------------------------------------- R0.2: reading with what was learned
  // Every way a rule reads from `p`: literals exactly, a capture one or more characters up to where the next piece reads,
  // never across the learned statement end; longest first.
  match(rule: Rule, text: Text, p: number, limit: number): { end: number; caps: [string, Span][] }[] {
    const out: { end: number; caps: [string, Span][] }[] = [];
    // a rule led by a literal starts with its first character; one led by a capture needs the literal after it in the statement
    const p0 = rule.pieces[0], p1 = rule.pieces[1], s = text.s, { space, end } = this.learned!;
    if ('lit' in p0) { if (s[p] !== p0.lit[0]) return out; }
    else if (p1 !== undefined && 'lit' in p1) { const f = s.indexOf(p1.lit[0], p); if ((f < 0 || f >= limit) && !(p1.lit[0] === space && s.indexOf(end, p) >= 0)) return out; }
    this.go(rule, text, limit, 0, p, [], out);
    return out;
  }
  go(rule: Rule, text: Text, limit: number, i: number, at: number, caps: [string, Span][], out: { end: number; caps: [string, Span][] }[]): void {
    if (i === rule.pieces.length) { out.push({ end: at, caps: [...caps] }); return; }
    const piece = rule.pieces[i];
    if ('lit' in piece) { const e = this.literal(text, piece.lit, at, limit); if (e >= 0) this.go(rule, text, limit, i + 1, e, caps, out); return; }
    // deeper lines continue what the line above them ends with: a capture that crosses a line end runs to the statement's end
    const { space, end } = this.learned!, line = text.s.indexOf(end, at);
    // the last piece ends where the statement does; one followed by a literal only where that literal's first character is
    // (or at a line end, for a space)
    const next = rule.pieces[i + 1], first = next !== undefined && 'lit' in next ? next.lit[0] : undefined;
    for (let e = limit; e > at; e--) {
      if (line >= 0 && line < e && e !== limit) continue;
      if (next === undefined && e !== limit) continue;
      if (first !== undefined && text.s[e] !== first && !(first === space && text.s.startsWith(end, e))) continue;
      caps.push([piece.cap, { text, b: at, e }]); this.go(rule, text, limit, i + 1, e, caps, out); caps.pop();
    }
  }
  // Where a literal read from `at` ends, or -1. A space in it also reads a line end and the indentation that continues the
  // statement (the first statement wrote its definer's space so).
  literal(text: Text, lit: string, at: number, limit: number): number {
    const s = text.s, { space, end, indent } = this.learned!;
    let i = at;
    for (let j = 0; j < lit.length;) {
      if (lit.startsWith(space, j) && indent.length > 0 && s.startsWith(end, i) && s.startsWith(indent, i + end.length)) {
        i += end.length; while (s.startsWith(indent, i)) i += indent.length; j += space.length; continue;
      }
      if (s[i] !== lit[j]) return -1;
      i++; j++;
    }
    return i <= limit ? i : -1;
  }
  // The reading of what starts at `p`: the longest. Between equally long ones, one that starts with a literal (a statement
  // led by a word) reads the whole over one that starts with a capture (an operator between operands); then a rule written
  // with the same head as an earlier one overrides it (`=>`); otherwise the one declared first reads the whole, as declaration
  // order is precedence and what is declared first binds loosest (G3.1).
  // `seed_only`: code the seed compiles sees only the rules defined while the seed was the reader (R0.5: later readers'
  // rules never reach into the code of the reader before them).
  reading(frame: Node, text: Text, p: number, limit: number, seed_only = false) {
    let best: { rule: Rule; end: number; caps: [string, Span][] } | undefined;
    for (const rule of frame.reach()) if (!seed_only || rule.planner === undefined) for (const m of this.match(rule, text, p, limit)) {
      if (best === undefined || m.end > best.end) { best = { rule, ...m }; continue; }
      if (m.end < best.end) continue;
      const definer = this.global.rules[0].head.s.trim();
      if (best.rule.head.s.trim() === definer && rule.head.s.trim() !== definer) continue;
      if (rule.head.s.trim() === definer && best.rule.head.s.trim() !== definer) { best = { rule, ...m }; continue; }
      // at the first place the two heads differ, one with a literal there over one with a capture (the more particular)
      const p = this.particular(rule.pieces, best.rule.pieces);
      if (p !== 0) { if (p > 0) best = { rule, ...m }; continue; }
      const led = 'lit' in rule.pieces[0];
      // between two led by a literal, the one with more pieces is the more particular
      if (led && rule.pieces.length !== best.rule.pieces.length) { if (rule.pieces.length > best.rule.pieces.length) best = { rule, ...m }; continue; }
      const same = rule.head.s.trim() === best.rule.head.s.trim();
      if (same ? rule.order > best.rule.order : rule.order < best.rule.order) best = { rule, ...m };
    }
    return best;
  }

  // Which of two heads is the more particular: walked side by side, character by character, at the first place where one has
  // a literal and the other a capture, the one with the literal (1: `a`, -1: `b`); 0 when they part between two literals first.
  particular(a: Piece[], b: Piece[]): number {
    const walk = (ps: Piece[]) => ps.flatMap(p => 'lit' in p ? [...p.lit] : [null]);
    const x = walk(a), y = walk(b);
    for (let i = 0; i < x.length && i < y.length; i++) {
      if (x[i] === null && y[i] === null) continue;
      if (x[i] === null) return -1;
      if (y[i] === null) return 1;
      if (x[i] !== y[i]) return 0;
    }
    return 0;
  }

  // ---------------------------------------------------------------- R0.4: a body read once into a goto program, then JS
  // `planner`: the planner of the code the captures are in (undefined: the seed's) — passed always, never defaulted (R0.5).
  apply(rule: Rule, caller: Node, caps: [string, Span][], planner: Rule | undefined, given: [string, unknown][] = [], parent?: Node): unknown {
    if (COUNT || EXT) { const h = rule.head.s.trim(); if (COUNT) { COUNT.set(h, (COUNT.get(h) ?? 0) + 1); SELF!.set(STACK[STACK.length - 1], (SELF!.get(STACK[STACK.length - 1]) ?? 0) + 1); } if (/^\{\w+\}\.\w/.test(h) || /^[a-z_]+$/.test(h)) { STACK.push(h); try { return this.apply_(rule, caller, caps, planner, given, parent); } finally { STACK.pop(); } } }
    if (HANG) { HANG.stack.push(rule.head.s.trim().slice(0, 60) + ' ← ' + caps.map(([n, c]) => n + '=' + JSON.stringify(c.text.s.slice(c.b, c.e).slice(0, 30))).join(' ')); if (++HANG.n > HANG.max) { console.log(HANG.stack.slice(-40).join('\n')); process.exit(3); } try { return this.apply_(rule, caller, caps, planner, given, parent); } finally { HANG.stack.pop(); } }
    return this.apply_(rule, caller, caps, planner, given, parent);
  }
  apply_(rule: Rule, caller: Node, caps: [string, Span][], planner: Rule | undefined, given: [string, unknown][] = [], parent?: Node): unknown {
    const frame = new Node(parent ?? rule.head.frame);
    frame.caller = caller; frame.rule = rule;
    for (const [name, v] of given) frame.members.set(name, v);
    // a typed capture is read by its type's rules
    // a capture typed by a scope of reading rules is read by them; one typed by a check is read where it was written
    for (const [name, sp] of caps) {
      // an optional capture that holds nothing is nothing
      if (sp.b === sp.e) { frame.members.set(name, undefined); continue; }
      const t = (sp as { type?: Node }).type;
      const code = new Code(sp.text, sp.b, sp.e, t !== undefined && (t.rules.length > 0 || t.members.get('rules') !== undefined) ? t : caller, planner, (sp as { of?: SpanOf }).of);
      if ((sp as { raw?: boolean }).raw) code.raw = true;
      frame.members.set(name, code);
    }
    // a method returns what a jump nothing in it caught carried (`return`): it stops there
    if (this.rule_nodes.get(rule)?.members.has('method')) {
      try { return this.compiled(rule)(frame); } catch (x) { if (x instanceof Jump) return x.value; throw x; }
    }
    return this.compiled(rule)(frame);
  }
  // A body is read when it runs, with the rules in reach then; read again when rules are added.
  compiled(rule: Rule): Compiled { return this.compile(rule.body); }
  // Code read where it was written: its own compiled program, run in its frame.
  // Code that names a member of its frame is that member (as an argument is); other code runs its compiled program.
  forced = 0; compiles = 0; recompiles = 0;
  force(x: unknown): unknown {
    if (!(x instanceof Code) || x.raw) return x;
    this.forced++;
    const word = x.of.word;
    if (word !== undefined) { let d = 0; for (let at: Node | undefined = x.frame; at; at = at.parent) { d++; const v = at.members.get(word); if (v !== undefined || at.members.has(word)) { if (DEPTH && d > DEPTH.max) { DEPTH.max = d; DEPTH.word = word; } return this.force(v); } } if (DEPTH && d > DEPTH.max) { DEPTH.max = d; DEPTH.word = word + ' (unresolved)'; } }
    return this.compile(x)(x.frame);
  }

  // The statements of a body, each read by the rules in reach of the frame it was written in — decided here, once.
  program(body: Code): Step[] {
    const { access, end, space } = this.learned!;
    const steps: Step[] = [], s = body.text.s, base = this.base(body.text, body.b);
    let p = body.b;
    while (p < body.e) {
      if (s.startsWith(end, p)) { p += end.length; if (s.startsWith(base, p)) p += base.length; continue; }
      if (s.startsWith(space, p)) { p += space.length; continue; }
      const stop = this.stop(body.text, p, body.e, base);
      const at: Span = { text: body.text, b: p, e: stop };
      if (s.startsWith(access + space, p)) {
        const words: Span[] = [];
        for (let i = p + access.length; i < stop;) {
          if (s.startsWith(space, i)) { i += space.length; continue; }
          const b = i; while (i < stop && !s.startsWith(space, i)) i++;
          words.push({ text: body.text, b, e: i });
        }
        const [name, ...args] = words;
        if (name === undefined) { steps.push({ kind: 'unread', at }); p = stop; continue; }
        const n = s.slice(name.b, name.e);
        if (n === 'label') steps.push({ kind: 'label', name: s.slice(args[0].b, args[0].e) });
        else if (n === 'goto') steps.push({ kind: 'goto', name: s.slice(args[0].b, args[0].e), when: args[1], at });
        else steps.push({ kind: 'external', name: n, args, at });
      } else {
        const r = this.reading(body.frame, body.text, p, stop, true);
        if (r !== undefined && r.end === stop) steps.push({ kind: 'apply', rule: r.rule, caps: r.caps, at });
        else if (!s.slice(p, stop).includes(space)) steps.push({ kind: 'name', at });
        else steps.push({ kind: 'unread', at });
      }
      p = stop;
    }
    return steps;
  }

  // A body read into its statements by the planner of the entrypoint: it answers a chain of steps, each one of `external`
  // (its `name` and `arguments`, spans), `rule` with `captures`, `word` (a statement that is one word) or `unread`, with the
  // statement's `from` and `to`.
  planned = 0;
  plan_by(planner: Rule, body: Code): Step[] {
    this.planned++;
    const frame = new Node(planner.head.frame), names = planner.pieces.filter(p => 'cap' in p).map(p => (p as { cap: string }).cap);
    // the body's statements are at the indentation of its first line with anything on it
    let first = body.b; const { end, space } = this.learned!; while (first < body.e && (body.text.s.startsWith(end, first) || body.text.s.startsWith(space, first))) first++;
    const base = this.base(body.text, first);
    [this.place(body.text, body.b), body.e >= body.text.s.length ? undefined : this.place(body.text, body.e), this.chain_of(base), body.frame].forEach((v, i) => frame.members.set(names[i], v));
    const steps: Step[] = [];
    const span = (from: unknown, to: unknown): Span => { const f = this.where.get(from as Node)!; const t = to as Node | undefined; return { text: f.text, b: f.i, e: t === undefined ? f.text.s.length : this.where.get(t)!.i }; };
    for (let st = this.compiled(planner)(frame) as Node | undefined; st; st = st.members.get('next') as Node | undefined) {
      const m = st.members, at = span(m.get('from'), m.get('to'));
      if (m.has('external')) {
        const name = span(m.get('name_from'), m.get('name_to')), n = name.text.s.slice(name.b, name.e), args: Span[] = [];
        for (let a = m.get('arguments') as Node | undefined; a; a = a.members.get('next') as Node | undefined) args.push(span(a.members.get('from'), a.members.get('to')));
        if (n === 'label') steps.push({ kind: 'label', name: args[0].text.s.slice(args[0].b, args[0].e) });
        else if (n === 'goto') steps.push({ kind: 'goto', name: args[0].text.s.slice(args[0].b, args[0].e), when: args[1], at });
        else steps.push({ kind: 'external', name: n, args, at });
      } else if (m.has('rule')) {
        // captures as spans, or given as values (`value`)
        const caps: [string, Span][] = [], given: [string, unknown][] = [];
        for (let c = m.get('captures') as Node | undefined; c; c = c.members.get('next') as Node | undefined) {
          if (c.members.has('value')) { given.push([this.cap_name(c), c.members.get('value')]); continue; }
          caps.push([this.cap_name(c), { ...span(c.members.get('from'), c.members.get('to')), type: c.members.get('type'), raw: c.members.has('raw') } as Span]);
        }
        steps.push({ kind: 'apply', rule: (m.get('rule') as Node).members.get('rule') as Rule, caps, given, at });
      } else if (m.has('word')) steps.push({ kind: 'name', at });
      else steps.push({ kind: 'unread', at });
    }
    if (ENV.SEED_STEPS) console.log('PLAN', JSON.stringify(body.s.slice(0, 40)), steps.map(st => st.kind + (st.kind === 'apply' ? '[' + st.rule.head.s.trim() + ']' + JSON.stringify(st.caps.map(([n, c]) => n + '=' + c.text.s.slice(c.b, c.e))) : '') + ('at' in st ? ':' + JSON.stringify(st.at.text.s.slice(st.at.b, st.at.e).slice(0, 30)) : '')).join(' | '));
    return steps;
  }

  // The goto program written out as JS: a `switch` over its labels, each step a statement.
  // A program is the same for the same span, read by the same planner with the same rules in reach: kept by those, not by
  // the code value (a capture is a new value every time its rule applies).
  compiled_code = new Map<string, { version: number; fn: Compiled }>();
  texts_seen = new Map<Text, number>(); scopes_seen = new Map<Node, number>(); planners_seen = new Map<Rule | undefined, number>();
  id<K>(m: Map<K, number>, k: K) { let n = m.get(k); if (n === undefined) m.set(k, n = m.size); return n; }
  compile(body: Code): Compiled {
    let scope: Node | undefined = body.frame; while (scope && scope.version === 0) scope = scope.parent;
    let byPlanner = body.of.programs.get(body.planner); if (byPlanner === undefined) body.of.programs.set(body.planner, byPlanner = new Map());
    const kept = byPlanner.get(scope);
    // nothing defined since it was last found current: it is
    if (kept !== undefined && kept.epoch === this.version && kept.handed === this.planner) return kept.fn;
    // a body the seed reads sees only the seed's rules, which no rule defined after the planner was handed over changes
    const version = body.planner === undefined && this.planner !== undefined ? -1 : this.reach_version(body.frame);
    this.compiles++;
    // the entrypoint's code is read once, by the rules in force then (R0.5), unless it left something unread
    if (kept !== undefined && (kept.version === version || (body.text === this.boot_text && !kept.unread && !ENV.SEED_REREAD))) { kept.epoch = this.version; kept.handed = this.planner; return kept.fn; }
    this.recompiles++;
    const steps = this.expand(this.steps_of(body), body, 0);
    const labels = new Map<string, number>();
    steps.forEach(st => { if (st.kind === 'label') labels.set(st.name, labels.size + 1); });
    const lines: string[] = ['let r, pc = 0; const V = f.version;', `const L = ${JSON.stringify(Object.fromEntries(labels))};`, 'for (;;) { try { switch (pc) {', 'case 0:'];
    // a statement that defined a rule where this body is read: the rest of the body read after it, with that rule in reach
    // (not in a body with labels: a jump does not cross where it was read again)
    const reread = (st: Step & { at: Span }, i: number) => { if (labels.size === 0 && i < steps.length - 1) lines.push(`if (f.version !== V) return S.rest(f, ${ref({ text: body.text, b: st.at.e, e: body.e })}, ${ref(body.planner)});`); };
    const k: unknown[] = [];
    const ref = (x: unknown) => { k.push(x); return `k[${k.length - 1}]`; };
    // An argument an external reads, as a JS expression: when it reads (by the rules this body is read by) as one external whose
    // arguments are read in the order written, that external called in place; else read when it runs.
    const expr = (sp: Span, d: number): string => {
      const of = span_of(sp.text, sp.b, sp.e), read = `S.val(f, ${ref({ ...sp, of })}, ${ref(body.planner)})`;
      if (EXT || d > 6) return read;
      const inner = this.expand(this.steps_of(new Code(sp.text, sp.b, sp.e, body.frame, body.planner, of)), body, 0);
      const st = inner[0];
      if (inner.length !== 1 || st.kind !== 'external') return read;
      const ext = this.externals.get(st.name), eager = EAGER[st.name] ?? [];
      if (ext === undefined || eager.some((e, i) => i > 0 && e < eager[i - 1])) return read;
      return `${ref(ext)}(f, [${st.args.map((a, i) => eager.includes(i) ? expr(a, d + 1) : `${a.code ? 'S.code_at' : 'S.arg'}(f, ${ref({ ...a, of: span_of(a.text, a.b, a.e) })}, ${ref(body.planner)})`).join(', ')}], ${ref(st.at)})`;
    };
    for (const [i, st] of steps.entries()) {
      if (st.kind === 'label') { lines.push(`case ${labels.get(st.name)}:`); continue; }
      if (st.kind === 'goto') {
        const to = labels.get(st.name);
        const when = st.when ? `${expr(st.when, 0)} !== undefined` : 'true';
        // a label of this body: a jump within it; any other (a captured name, a label of a body around it): raised
        if (to !== undefined) lines.push(`if (${when}) { pc = ${to}; continue; }`);
        else lines.push(`if (${when}) throw new S.Jump(S.label_name(f, ${ref({ ...st.at, b: st.at.b, e: st.at.e, name: st.name })}), r);`);
        continue;
      }
      if (st.kind === 'name') { lines.push(`r = S.name(f, ${ref(st.at)});`); continue; }
      if (st.kind === 'unread') { lines.push(`S.say(${JSON.stringify('Unread `' + st.at.text.s.slice(st.at.b, st.at.e).slice(0, 60) + '`.')}, ${ref(st.at)});`); continue; }
      if (st.kind === 'external') {
        let ext = this.externals.get(st.name);
        if (EXT && ext) { const inner = ext, name = st.name; ext = (f: Node, a: unknown[], at: Span) => { const where = STACK[STACK.length - 1]; EXT_IN.set(where, (EXT_IN.get(where) ?? 0) + 1); const t = performance.now(); try { return inner(f, a, at); } finally { const e = EXT.get(name) ?? [0, 0]; e[0]++; e[1] += performance.now() - t; EXT.set(name, e); } }; }
        if (ext === undefined) { this.say(`No external \`${st.name}\`.`, st.at); continue; }
        const eager = EAGER[st.name] ?? [], spans = st.args.map(a => ref({ ...a, of: span_of(a.text, a.b, a.e) }));
        const read = eager.filter(i => i < st.args.length).map(i => `const a${i} = ${expr(st.args[i], 0)};`).join(' ');
        lines.push(`try { ${read} r = ${ref(ext)}(f, [${st.args.map((a, i) => eager.includes(i) ? `a${i}` : `${a.code ? 'S.code_at' : 'S.arg'}(f, ${spans[i]}, ${ref(body.planner)})`).join(', ')}], ${ref(st.at)}); } catch (x) { throw S.where_failed(x, ${ref(st.at)}); }`);
        if (st.name === 'rule' || st.name === 'define') reread(st, i);
        continue;
      }
      const caps = st.caps.map(([n, sp]) => [n, { ...sp, of: span_of(sp.text, sp.b, sp.e) }] as [string, Span]);
      lines.push(`try { r = S.apply(${ref(st.rule)}, f, ${ref(caps)}, ${ref(body.planner)}, ${ref(st.given ?? [])}); } catch (x) { throw S.where_failed(x, ${ref(st.at)}); }`);
      reread(st, i);
    }
    lines.push('return r;', '} } catch (x) { if (x instanceof S.Jump && L[x.name] !== undefined) { pc = L[x.name]; r = x.value; continue; } throw x; } }');
    const fn = new Function('S', 'k', `return function (f) { ${lines.join('\n')} };`)(this, k) as Compiled;
    byPlanner.set(scope, { version, fn, unread: steps.some(st => st.kind === 'unread'), epoch: this.version, handed: this.planner });
    return fn;
  }
  Jump = Jump;
  // The rules defined in the scopes a frame reaches, counted (what reading there depends on).
  reach_version(frame: Node): number { let v = 0; for (let n: Node | undefined = frame; n; n = n.parent) v += n.version; return v; }

  // ---------------------------------------------------------------- R3.3: lowering, a rule with no frame of its own expanded where it is applied
  // The statements of a body, as steps; a statement read by a rule whose body is only a label is a label of this body, named by
  // what it captured.
  steps_of(body: Code): Step[] {
    return (body.planner ? this.plan_by(body.planner, body) : this.program(body)).map(st => {
      if (st.kind !== 'apply') return st;
      const named = this.labelling(st.rule);
      if (named === undefined) return st;
      const cap = st.caps.find(([n]) => n === named);
      return cap ? { kind: 'label', name: cap[1].text.s.slice(cap[1].b, cap[1].e) } as Step : st;
    });
  }
  // A rule whose body needs no frame: only externals (not `.`), jumps and labels of its own, and its captures read as
  // statements or given to externals. Its steps, or nothing.
  frameless = new Map<Rule, { steps: Step[]; labels: Set<string> } | null>();
  inlinable(rule: Rule): { steps: Step[]; labels: Set<string> } | undefined {
    let got = this.frameless.get(rule);
    if (got === undefined) {
      got = null;
      if (!this.rule_nodes.get(rule)?.members.has('method') && ENV.SEED_INLINE !== '0') {
        const caps = new Set(rule.pieces.filter(p => 'cap' in p).map(p => (p as { cap: string }).cap));
        const text = (sp: Span) => sp.text.s.slice(sp.b, sp.e).trim();
        const steps = this.steps_of(rule.body), labels = new Set<string>();
        steps.forEach(st => { if (st.kind === 'label') labels.add(st.name); });
        const ok = steps.length > 0 && steps.every(st =>
          st.kind === 'label' ? !caps.has(st.name)
          : st.kind === 'goto' ? !caps.has(st.name) && (st.when === undefined || caps.has(text(st.when)))
          : st.kind === 'name' ? caps.has(text(st.at))
          : st.kind === 'external' ? st.name !== '.' && st.args.every(a => caps.has(text(a)))
          : false);
        if (ok) got = { steps, labels };
      }
      this.frameless.set(rule, got);
    }
    return got ?? undefined;
  }
  // Steps with every application of a frameless rule expanded in place: its captures given to externals as code where the
  // statement was written, read as statements by splicing their own steps; its labels made its own.
  inlined = 0;
  expand(steps: Step[], body: Code, depth: number): Step[] {
    const out: Step[] = [];
    for (const st of steps) {
      const inl = st.kind === 'apply' && depth < 24 && (st.given ?? []).length === 0 ? this.inlinable(st.rule) : undefined;
      if (st.kind !== 'apply' || inl === undefined || st.caps.some(([, sp]) => (sp as { type?: unknown }).type !== undefined || (sp as { raw?: boolean }).raw || sp.b === sp.e)) { out.push(st); continue; }
      const caps = new Map(st.caps);
      const text = (sp: Span) => sp.text.s.slice(sp.b, sp.e).trim();
      if ([...inl.steps].some(rs => (rs.kind === 'name' && !caps.has(text(rs.at))) || (rs.kind === 'external' && rs.args.some(a => !caps.has(text(a)))) || (rs.kind === 'goto' && rs.when !== undefined && !caps.has(text(rs.when))))) { out.push(st); continue; }
      const id = ++this.inlined, own = (name: string) => inl.labels.has(name) ? `${name}#${id}` : name;
      for (const rs of inl.steps) {
        if (rs.kind === 'label') out.push({ kind: 'label', name: own(rs.name) });
        else if (rs.kind === 'goto') out.push({ kind: 'goto', name: own(rs.name), when: rs.when && { ...caps.get(text(rs.when))!, code: true }, at: st.at });
        else if (rs.kind === 'external') out.push({ kind: 'external', name: rs.name, args: rs.args.map(a => ({ ...caps.get(text(a))!, code: true })), at: st.at });
        else if (rs.kind === 'name') { const sp = caps.get(text(rs.at))!; out.push(...this.expand(this.steps_of(new Code(sp.text, sp.b, sp.e, body.frame, body.planner)), body, depth + 1)); }
      }
    }
    return out;
  }
  // A capture given to an external where its rule was expanded: its code, in the frame it was written in.
  code_at(frame: Node, sp: Span & { of?: SpanOf }, planner?: Rule): Code { return new Code(sp.text, sp.b, sp.e, frame, planner, sp.of); }

  // The label a `goto` names: a captured name's text (`goto {literal target}`), or the word written.
  label_name(frame: Node, at: { name: string }): string {
    for (let n: Node | undefined = frame; n; n = n.parent) if (n.members.has(at.name)) { const v = n.members.get(at.name); return v instanceof Code ? v.s.trim() : String(v); }
    return at.name;
  }
  // Whether a rule's body is only a label named by one of its captures: that capture's name.
  labelled = new Map<Rule, string | null>();
  labelling(rule: Rule): string | undefined {
    let n = this.labelled.get(rule);
    if (n === undefined) {
      const steps = rule.body.planner ? this.plan_by(rule.body.planner, rule.body) : this.program(rule.body);
      const caps = rule.pieces.filter(p => 'cap' in p).map(p => (p as { cap: string }).cap);
      n = steps.length === 1 && steps[0].kind === 'label' && caps.includes(steps[0].name) ? steps[0].name : null;
      this.labelled.set(rule, n);
    }
    return n ?? undefined;
  }
  // An argument that names a member of the frame (a capture, a local) is what it names; any other word is code.
  arg(frame: Node, sp: Span & { of?: SpanOf }, planner?: Rule): unknown {
    const of = sp.of ?? span_of(sp.text, sp.b, sp.e), word = of.s;
    for (let at: Node | undefined = frame; at; at = at.parent) { const v = at.members.get(word); if (v !== undefined || at.members.has(word)) return v; }
    return new Code(sp.text, sp.b, sp.e, frame, planner, of);
  }
  // The rest of a body, from `sp.b`, read again where it runs (a rule was defined there) and run.
  rest(frame: Node, sp: Span, planner?: Rule): unknown { return this.compile(new Code(sp.text, sp.b, sp.e, frame, planner))(frame); }
  // An argument an external reads: the member it names, read; or its code run where it was written.
  val(frame: Node, sp: Span & { of: SpanOf }, planner?: Rule): unknown {
    const of = sp.of, w = of.word;
    if (w !== undefined) for (let at: Node | undefined = frame; at; at = at.parent) { const v = at.members.get(w); if (v !== undefined || at.members.has(w)) return this.force(v); }
    let scope: Node | undefined = frame; while (scope && scope.version === 0) scope = scope.parent;
    const kept = of.programs.get(planner)?.get(scope);
    if (kept !== undefined && kept.epoch === this.version && kept.handed === this.planner) return kept.fn(frame);
    return this.compile(new Code(sp.text, sp.b, sp.e, frame, planner, of))(frame);
  }
  // A statement that is one word: the member it names, or nothing and a diagnostic.
  name(frame: Node, sp: Span): unknown {
    const word = sp.text.s.slice(sp.b, sp.e);
    for (let at: Node | undefined = frame; at; at = at.parent) if (at.members.has(word)) return this.force(at.members.get(word));
    this.say(`Unresolved \`${word}\`.`, sp);
    return undefined;
  }
  // An error in a compiled body, with the statements it was in (innermost first).
  where_failed(x: unknown, at: Span): unknown {
    if (x instanceof Jump) return x;
    const e = x instanceof Error ? x : new Error(String(x));
    const line = at.text.s.slice(0, at.b).split('\n').length;
    (e as any).ray = [...((e as any).ray ?? []), `${at.text.name.split('/').pop()}:${line} ${at.text.s.slice(at.b, at.e).split('\n')[0]}`];
    return e;
  }
  show(v: unknown): string { if (v instanceof Node && v.members.get('code') instanceof Code) return 'CODE:' + JSON.stringify((v.members.get('code') as Code).s.slice(0, 50)); return v instanceof Code ? 'code:' + v.s : v instanceof Node ? 'node(' + v.rules.length + ' rules, ' + [...v.members.keys()].join(',') + ')' : String(v); }

  // ---------------------------------------------------------------- R0.3: a text read statement after statement
  // A text read statement after statement, in `scope`: a file other than the entrypoint has a scope of its own inside the
  // entrypoint's, so what it defines reaches neither the reader's code nor other files.
  read(text: Text, from = 0, scope: Node = this.global) {
    const s = text.s, { end } = this.learned!;
    let p = from;
    while (p < s.length) {
      if (s.startsWith(end, p)) { p += end.length; continue; }
      if (this.handed) {
        // the reader's frame is the top's; the scope it reads in is what applies it (its `caller`)
        const frame = new Node(this.global); frame.caller = scope;
        const cap = this.handed.pieces.find(x => 'cap' in x) as { cap: string };
        frame.members.set(cap.cap, this.place(text, p));
        let next: Node | undefined;
        const started = SLOW ? performance.now() : 0;
        try { next = this.compiled(this.handed)(frame) as Node | undefined; }
        catch (x) {
          if (x instanceof Jump && ENV.SEED_DBG) console.log('JUMP escaped', x.name, JSON.stringify(s.slice(p, p + 60)));
          if (x instanceof Jump) throw x;
          // a statement that failed: said where it starts, and reading goes on at the next line that is not indented
          const message = x instanceof Error ? x.message : String(x), trace = (x as { ray?: string[] }).ray ?? [];
          if (ENV.SEED_STACK && x instanceof Error) console.log(x.stack?.split('\n').slice(0, 12).join('\n'));
          let e = s.indexOf(end, p); while (e >= 0 && (s.startsWith(end, e + end.length) || s.startsWith(this.learned!.indent, e + end.length) || s.startsWith(this.learned!.space, e + end.length))) e = s.indexOf(end, e + end.length);
          this.say(`Failed: ${message}${trace.length ? ' (in ' + trace[0] + ')' : ''}`, { text, b: p, e: e < 0 ? s.length : e });
          p = e < 0 ? s.length : e + end.length;
          continue;
        }
        if (SLOW && performance.now() - started > SLOW) console.log('slow', Math.round(performance.now() - started), 'ms', text.name.split('/').pop() + ':' + (s.slice(0, p).split(end).length), JSON.stringify(s.slice(p, p + 70)));
        const w = next === undefined ? undefined : this.where.get(next);
        if (next !== undefined && w === undefined) throw new Error(`the reader answered ${this.show(next)}, not a place, after \`${s.slice(p, p + 60)}\``);
        p = w === undefined ? s.length : w.i;
        continue;
      }
      // a statement at the top is read as a body's statement is, and run there
      const stop = this.stop(text, p, s.length, '');
      try { this.compile(new Code(text, p, stop, scope, this.planner))(scope); } catch (x) { if (!(x instanceof Jump)) throw x; }
      p = stop;
    }
  }
  boot_text?: Text;
  boot(text: Text) { this.boot_text = text; const after = this.axiom(text); this.read(text, after); }
  file(text: Text) { this.read(text, 0, new Node(this.global)); }
  // The files of one project, read in one scope of their own inside the entrypoint's: what one defines the others see (P8.8).
  project(texts: Text[], each?: (text: Text) => void) { const scope = new Node(this.global); for (const t of texts) { this.read(t, 0, scope); each?.(t); } }
}
