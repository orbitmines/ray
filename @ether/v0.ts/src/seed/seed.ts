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
  constructor(public parent?: Node) {}
  *reach(): Generator<Rule> { for (let n: Node | undefined = this; n; n = n.parent) for (let i = n.rules.length - 1; i >= 0; i--) yield n.rules[i]; }
}
// Code: a span, read later in the frame it was written in.
// `planner`: the reader in force where it was written, which reads it into a program (none: the seed).
export class Code { constructor(public text: Text, public b: number, public e: number, public frame: Node, public planner?: Rule) {} get s() { return this.text.s.slice(this.b, this.e); } }
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
  | { kind: 'external'; name: string; args: Span[]; at: Span }
  | { kind: 'apply'; rule: Rule; caps: [string, Span][]; at: Span }
  | { kind: 'label'; name: string }
  | { kind: 'goto'; name: string; when?: Span; at: Span }
  | { kind: 'name'; at: Span }
  | { kind: 'unread'; at: Span };
export type Compiled = (frame: Node) => unknown;

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
    this.externals.set('declare', (frame, [name, value]) => { const n = self.code_of(name); const v = self.force(value); n.frame.members.set(n.s, v); return v; });
    this.externals.set('find', (frame, [name]) => { const n = self.code_of(name); for (let at: Node | undefined = n.frame; at; at = at.parent) if (at.members.has(n.s)) return at.members.get(n.s); return undefined; });
    this.externals.set('node', () => new Node());
    this.externals.set('none', () => undefined);
    this.externals.set('get', (frame, [of, name]) => (self.force(of) as Node)?.members.get(self.code_of(name).s));
    this.externals.set('set', (frame, [of, name, value]) => { const v = self.force(value); (self.force(of) as Node).members.set(self.code_of(name).s, v); return v; });
    this.externals.set('same', (frame, [a, b]) => self.force(a) === self.force(b) ? true : undefined);
    this.externals.set('print', (frame, args) => { self.output(args.map(a => self.show(self.force(a))).join(' ')); return undefined; });
    // R0.6: reading handed to a rule of the entrypoint; it is applied to the place where a statement starts and answers the
    // place after it.
    this.externals.set('reader', (frame, [rule]) => { self.handed = self.force(rule) as Rule; return self.handed; });
    this.externals.set('planner', (frame, [rule]) => { self.planner = self.force(rule) as Rule; return self.planner; });
    // R0.7, R1: a text is a chain of places, each holding a character node (one node per character) and the next place.
    this.externals.set('rules', (frame, [of]) => self.rules_of(self.force(of) as Node));
    this.externals.set('apply', (frame, [rule, caps, within]) => self.apply_chain(self.force(rule) as Node, self.force(caps) as Node, self.force(within) as Node));
    this.externals.set('frame', frame => frame.parent ?? frame);
    // A rule from a head read by the entrypoint's reader: its pieces a chain of `literal` or `capture`, each a span (`from`, `to`).
    this.externals.set('define', (frame, [pattern, pieces, body]) => {
      const head = self.code_of(pattern), list: Piece[] = [];
      for (let p = self.force(pieces) as Node | undefined; p; p = p.members.get('next') as Node | undefined) {
        const f = self.where.get(p.members.get('from') as Node)!, t = p.members.get('to') as Node | undefined;
        const text = f.text.s.slice(f.i, t === undefined ? f.text.s.length : self.where.get(t)!.i);
        list.push(p.members.has('capture') ? (p.members.has('type') ? { cap: text, type: p.members.get('type') as Node } : { cap: text }) : { lit: text });
      }
      return self.define(head, self.code_of(body), list);
    });
    // Where code is: a node with the place it starts at (`from`) and the place after it (`to`, none at the text's end).
    this.externals.set('span', (frame, [code]) => { const c = self.code_of(code), n = new Node(); n.members.set('from', self.place(c.text, c.b)); n.members.set('to', c.e >= c.text.s.length ? undefined : self.place(c.text, c.e)); return n; });
    // A scope made by reading a block in it: what the block defines is the scope's (a type is a scope of reading rules).
    this.externals.set('scope', (frame, [code]) => { const c = self.code_of(code), n = new Node(c.frame); self.compile(new Code(c.text, c.b, c.e, n, c.planner))(n); return n; });
    // Code from one place to another, read where `like` was written (a capture's type, read once when its rule is defined).
    this.externals.set('evaluate', (frame, [from, to, like]) => { const f = self.where.get(self.force(from) as Node)!, t = self.force(to) as Node | undefined, l = self.code_of(like); return self.force(new Code(f.text, f.i, t === undefined ? f.text.s.length : self.where.get(t)!.i, l.frame, l.planner)); });
    // The character a word starts with (so the reader can name characters it spells with: `:`).
    this.externals.set('character', (frame, [word]) => self.character(self.code_of(word).s[0]));
    // A scope's own rules, latest first (not those of the scopes around it): a type's reading rules.
    this.externals.set('own_rules', (frame, [of]) => { const n = self.force(of) as Node; let first: Node | undefined, last: Node | undefined; for (let i = n.rules.length - 1; i >= 0; i--) { const link = new Node(); link.members.set('rule', self.node_of(n.rules[i])); if (last) last.members.set('next', link); else first = link; last = link; } return first; });
    // A rule applied to values (not code): its captures, in order, are the arguments given.
    this.externals.set('invoke', (frame, [rule, ...args]) => { const r = self.force(rule) as Rule, f = new Node(r.head.frame); r.pieces.filter(p => 'cap' in p).forEach((p, i) => f.members.set((p as { cap: string }).cap, self.force(args[i]))); return self.compiled(r)(f); });
    // The rule that defines rules (the first statement's), as a node: its reading of a statement is the loosest of all (R0.1).
    this.externals.set('definer', () => self.node_of(self.global.rules[0]));
    this.externals.set('latest', () => { let last: Rule | undefined; for (const r of self.global.reach()) if (last === undefined || r.order > last.order) last = r; return last; });
    // What no rule reads, from a place to a place (or the text's end): a diagnostic (G1.8).
    this.externals.set('unread', (frame, [from, to]) => { const f = self.where.get(self.force(from) as Node)!, t = self.force(to) as Node | undefined; const e = t === undefined ? f.text.s.length : self.where.get(t)!.i; self.say(`Unread \`${f.text.s.slice(f.i, e).slice(0, 60)}\`.`, { text: f.text, b: f.i, e }); return undefined; });
    // What the first statement taught, as characters (R0.1): `end`, `space`, and `indent` (a chain).
    this.externals.set('learned', () => { const n = new Node(), l = self.learned!; n.members.set('end', self.character(l.end)); n.members.set('space', self.character(l.space)); n.members.set('indent', self.chain_of(l.indent)); n.members.set('access', self.chain_of(l.access)); n.members.set('open', self.character(l.open)); n.members.set('close', self.character(l.close)); return n; });
    // The head of a rule as a chain, to tell whether two rules are written with the same head.
    this.externals.set('head', (frame, [rule]) => self.chain_of(((self.force(rule) as Node).members.get('rule') as Rule).head.s.trim()));
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
      for (let k = 0; k < text.s.length; k++) { const n = new Node(); n.members.set('character', this.character(text.s[k])); all.push(n); }
      all.forEach((n, k) => { if (k + 1 < all!.length) n.members.set('next', all![k + 1]); this.where.set(n, { text, i: k }); });
      this.places.set(text, all);
    }
    return all[i];
  }
  where = new Map<Node, { text: Text; i: number }>();
  // A literal written in a head, as a chain of places of its own.
  chain_of(s: string): Node | undefined { return s.length === 0 ? undefined : this.place({ name: 'literal', s }, 0); }
  // A rule as a node: its pieces in order (`literal`: a chain of places; `capture`: its name), its head and its order.
  rule_nodes = new Map<Rule, Node>();
  node_of(rule: Rule): Node {
    let n = this.rule_nodes.get(rule);
    if (n !== undefined) return n;
    n = new Node(); n.members.set('rule', rule);
    let first: Node | undefined, last: Node | undefined;
    for (const piece of rule.pieces) {
      const p = new Node();
      if ('lit' in piece) p.members.set('literal', this.chain_of(piece.lit)); else { p.members.set('capture', piece.cap); if (piece.type) p.members.set('type', piece.type); }
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
  apply_chain(rule: Node, caps: Node | undefined, within: Node): unknown {
    const r = rule.members.get('rule') as Rule, list: [string, Span][] = [];
    for (let c = caps; c; c = c.members.get('next') as Node | undefined) {
      const from = this.where.get(c.members.get('from') as Node)!, to = c.members.get('to') as Node | undefined;
      const e = to === undefined ? from.text.s.length : this.where.get(to)!.i;
      list.push([c.members.get('name') as string, { text: from.text, b: from.i, e, type: c.members.get('type') as Node | undefined } as Span]);
    }
    return this.apply(r, within, list, this.planner);
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
  code_of(x: unknown): Code { return x instanceof Code ? x : new Code({ name: '?', s: String(x) }, 0, String(x).length, this.global); }
  define(head: Code, body: Code, pieces?: Piece[]): Rule {
    const rule: Rule = { head, pieces: pieces ?? this.pieces(head.s.trim()), body: new Code(body.text, body.b, body.e, body.frame, this.planner), order: this.order++, planner: this.planner };
    head.frame.rules.push(rule);
    this.version++;
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
    const go = (i: number, at: number, caps: [string, Span][]) => {
      if (i === rule.pieces.length) { out.push({ end: at, caps: [...caps] }); return; }
      const piece = rule.pieces[i];
      if ('lit' in piece) { const e = this.literal(text, piece.lit, at, limit); if (e >= 0) go(i + 1, e, caps); return; }
      const last = limit;
      // deeper lines continue what the line above them ends with: a capture that crosses a line end runs to the statement's end
      const line = text.s.indexOf(this.learned!.end, at);
      for (let e = last; e > at; e--) {
        if (line >= 0 && line < e && e !== limit) continue;
        caps.push([piece.cap, { text, b: at, e }]); go(i + 1, e, caps); caps.pop();
      }
    };
    go(0, p, []);
    return out;
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
      const led = 'lit' in rule.pieces[0], bestLed = 'lit' in best.rule.pieces[0];
      if (led !== bestLed) { if (led) best = { rule, ...m }; continue; }
      const same = rule.head.s.trim() === best.rule.head.s.trim();
      if (same ? rule.order > best.rule.order : rule.order < best.rule.order) best = { rule, ...m };
    }
    return best;
  }

  // ---------------------------------------------------------------- R0.4: a body read once into a goto program, then JS
  // `planner`: the planner of the code the captures are in (undefined: the seed's) — passed always, never defaulted (R0.5).
  apply(rule: Rule, caller: Node, caps: [string, Span][], planner: Rule | undefined): unknown {
    const frame = new Node(rule.head.frame);
    // a typed capture is read by its type's rules
    for (const [name, sp] of caps) frame.members.set(name, new Code(sp.text, sp.b, sp.e, (sp as { type?: Node }).type ?? caller, planner));
    return this.compiled(rule)(frame);
  }
  compiled(rule: Rule): Compiled {
    if (rule.fn === undefined || rule.version !== this.version) { rule.version = this.version; rule.fn = this.compile(rule.body); }
    return rule.fn;
  }
  // Code read where it was written: its own compiled program, run in its frame.
  // Code that names a member of its frame is that member (as an argument is); other code runs its compiled program.
  force(x: unknown): unknown {
    if (!(x instanceof Code)) return x;
    const word = x.s.trim();
    for (let at: Node | undefined = x.frame; at; at = at.parent) if (at.members.has(word)) return this.force(at.members.get(word));
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
    const base = this.base(body.text, body.b);
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
        const caps: [string, Span][] = [];
        for (let c = m.get('captures') as Node | undefined; c; c = c.members.get('next') as Node | undefined) caps.push([c.members.get('name') as string, { ...span(c.members.get('from'), c.members.get('to')), type: c.members.get('type') } as Span]);
        steps.push({ kind: 'apply', rule: (m.get('rule') as Node).members.get('rule') as Rule, caps, at });
      } else if (m.has('word')) steps.push({ kind: 'name', at });
      else steps.push({ kind: 'unread', at });
    }
    return steps;
  }

  // The goto program written out as JS: a `switch` over its labels, each step a statement.
  // A program is the same for the same span, read by the same planner with the same rules in reach: kept by those, not by
  // the code value (a capture is a new value every time its rule applies).
  compiled_code = new Map<string, { version: number; fn: Compiled }>();
  texts_seen = new Map<Text, number>(); scopes_seen = new Map<Node, number>(); planners_seen = new Map<Rule | undefined, number>();
  id<K>(m: Map<K, number>, k: K) { let n = m.get(k); if (n === undefined) m.set(k, n = m.size); return n; }
  compile(body: Code): Compiled {
    let scope: Node | undefined = body.frame; while (scope && scope.rules.length === 0) scope = scope.parent;
    const key = `${this.id(this.texts_seen, body.text)}:${body.b}:${body.e}:${this.id(this.planners_seen, body.planner)}:${scope ? this.id(this.scopes_seen, scope) : -1}`;
    const kept = this.compiled_code.get(key);
    if (kept !== undefined && kept.version === this.version) return kept.fn;
    const steps = body.planner ? this.plan_by(body.planner, body) : this.program(body);
    const labels = new Map<string, number>();
    steps.forEach(st => { if (st.kind === 'label') labels.set(st.name, labels.size + 1); });
    const lines: string[] = ['let r, pc = 0;', 'for (;;) switch (pc) {', 'case 0:'];
    const k: unknown[] = [];
    const ref = (x: unknown) => { k.push(x); return `k[${k.length - 1}]`; };
    for (const st of steps) {
      if (st.kind === 'label') { lines.push(`case ${labels.get(st.name)}:`); continue; }
      if (st.kind === 'goto') {
        const to = labels.get(st.name);
        if (to === undefined) { this.say(`No label \`${st.name}\`.`, st.at); continue; }
        lines.push(st.when ? `if (S.force(S.arg(f, ${ref(st.when)}, ${ref(body.planner)})) !== undefined) { pc = ${to}; continue; }` : `pc = ${to}; continue;`);
        continue;
      }
      if (st.kind === 'name') { lines.push(`r = S.name(f, ${ref(st.at)});`); continue; }
      if (st.kind === 'unread') { lines.push(`S.say(${JSON.stringify('Unread `' + st.at.text.s.slice(st.at.b, st.at.e).slice(0, 60) + '`.')}, ${ref(st.at)});`); continue; }
      if (st.kind === 'external') {
        const ext = this.externals.get(st.name);
        if (ext === undefined) { this.say(`No external \`${st.name}\`.`, st.at); continue; }
        lines.push(`try { r = ${ref(ext)}(f, [${st.args.map(a => `S.arg(f, ${ref(a)}, ${ref(body.planner)})`).join(', ')}], ${ref(st.at)}); } catch (x) { throw S.where_failed(x, ${ref(st.at)}); }`);
        continue;
      }
      lines.push(`try { r = S.apply(${ref(st.rule)}, f, ${ref(st.caps)}, ${ref(body.planner)}); } catch (x) { throw S.where_failed(x, ${ref(st.at)}); }`);
    }
    lines.push('return r;', '}');
    const fn = new Function('S', 'k', `return function (f) { ${lines.join('\n')} };`)(this, k) as Compiled;
    this.compiled_code.set(key, { version: this.version, fn });
    return fn;
  }
  // An argument that names a member of the frame (a capture, a local) is what it names; any other word is code.
  arg(frame: Node, sp: Span, planner?: Rule): unknown {
    const word = sp.text.s.slice(sp.b, sp.e);
    for (let at: Node | undefined = frame; at; at = at.parent) if (at.members.has(word)) return at.members.get(word);
    return new Code(sp.text, sp.b, sp.e, frame, planner);
  }
  // A statement that is one word: the member it names, or nothing and a diagnostic.
  name(frame: Node, sp: Span): unknown {
    const word = sp.text.s.slice(sp.b, sp.e);
    for (let at: Node | undefined = frame; at; at = at.parent) if (at.members.has(word)) return this.force(at.members.get(word));
    this.say(`Unresolved \`${word}\`.`, sp);
    return undefined;
  }
  // An error in a compiled body, with the statements it was in (innermost first).
  where_failed(x: unknown, at: Span): Error {
    const e = x instanceof Error ? x : new Error(String(x));
    const line = at.text.s.slice(0, at.b).split('\n').length;
    (e as any).ray = [...((e as any).ray ?? []), `${at.text.name.split('/').pop()}:${line} ${at.text.s.slice(at.b, at.e).split('\n')[0]}`];
    return e;
  }
  show(v: unknown): string { return v instanceof Code ? v.s : v instanceof Node ? 'node' : String(v); }

  // ---------------------------------------------------------------- R0.3: a text read statement after statement
  read(text: Text, from = 0) {
    const s = text.s, { end } = this.learned!;
    let p = from;
    while (p < s.length) {
      if (s.startsWith(end, p)) { p += end.length; continue; }
      if (this.handed) {
        const frame = new Node(this.handed.head.frame);
        const cap = this.handed.pieces.find(x => 'cap' in x) as { cap: string };
        frame.members.set(cap.cap, this.place(text, p));
        const next = this.compiled(this.handed)(frame) as Node | undefined;
        p = next === undefined ? s.length : this.where.get(next)!.i;
        continue;
      }
      const stop = this.stop(text, p, s.length, '');
      const r = this.reading(this.global, text, p, stop);
      if (r === undefined || r.end !== stop) { this.say(`Unread \`${s.slice(p, stop).slice(0, 60)}\`.`, { text, b: p, e: stop }); p = stop; continue; }
      this.apply(r.rule, this.global, r.caps, this.planner);
      p = r.end;
    }
  }
  boot(text: Text) { const after = this.axiom(text); this.read(text, after); }
}
