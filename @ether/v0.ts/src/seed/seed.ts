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
export class Code { constructor(public text: Text, public b: number, public e: number, public frame: Node) {} get s() { return this.text.s.slice(this.b, this.e); } }
export type Piece = { lit: string } | { cap: string };
export type Rule = { head: Code; pieces: Piece[]; body: Code; order: number; fn?: Compiled; version?: number };
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
  | { kind: 'unread'; at: Span };
export type Compiled = (frame: Node) => unknown;

export class Seed {
  learned?: Learned;
  global = new Node();
  diagnostics: Diagnostic[] = [];
  order = 0;
  version = 0;
  reader?: (seed: Seed, text: Text, at: number, frame: Node) => number;   // handed over by the entrypoint (R0.6)
  externals = new Map<string, (frame: Node, args: unknown[], at: Span) => unknown>();
  output: (line: string) => void = line => console.log(line);

  constructor() {
    const self = this;
    // R0.7 — none of them syntax
    this.externals.set('rule', (frame, [pattern, body]) => self.define(self.code_of(pattern), self.code_of(body)));
    this.externals.set('declare', (frame, [name, value]) => { const n = self.code_of(name); const v = self.force(value); n.frame.members.set(n.s, v); return v; });
    this.externals.set('find', (frame, [name]) => { const n = self.code_of(name); for (let at: Node | undefined = n.frame; at; at = at.parent) if (at.members.has(n.s)) return at.members.get(n.s); return undefined; });
    this.externals.set('node', () => new Node());
    this.externals.set('get', (frame, [of, name]) => (self.force(of) as Node)?.members.get(self.code_of(name).s));
    this.externals.set('set', (frame, [of, name, value]) => { const v = self.force(value); (self.force(of) as Node).members.set(self.code_of(name).s, v); return v; });
    this.externals.set('same', (frame, [a, b]) => self.force(a) === self.force(b) ? true : undefined);
    this.externals.set('print', (frame, args) => { self.output(args.map(a => self.show(self.force(a))).join(' ')); return undefined; });
  }

  say(message: string, at: Span) { this.diagnostics.push({ message, at }); }

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
  // What a line is indented by, up to `p`.
  base(text: Text, p: number): string {
    const { end } = this.learned!, from = text.s.lastIndexOf(end, p - 1) + end.length;
    return text.s.slice(from, p);
  }

  // ---------------------------------------------------------------- rules: defined where their head was written
  code_of(x: unknown): Code { return x instanceof Code ? x : new Code({ name: '?', s: String(x) }, 0, String(x).length, this.global); }
  define(head: Code, body: Code): Rule {
    const rule: Rule = { head, pieces: this.pieces(head.s.trim()), body, order: this.order++ };
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
      for (let e = last; e > at; e--) { caps.push([piece.cap, { text, b: at, e }]); go(i + 1, e, caps); caps.pop(); }
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
  // The reading of what starts at `p`: the longest. Between equally long ones, a rule written with the same head as an earlier
  // one overrides it (`=>`); otherwise the one declared first reads the whole, as declaration order is precedence and what
  // is declared first binds loosest (G3.1).
  reading(frame: Node, text: Text, p: number, limit: number) {
    let best: { rule: Rule; end: number; caps: [string, Span][] } | undefined;
    for (const rule of frame.reach()) for (const m of this.match(rule, text, p, limit)) {
      if (best === undefined || m.end > best.end) { best = { rule, ...m }; continue; }
      if (m.end < best.end) continue;
      const same = rule.head.s.trim() === best.rule.head.s.trim();
      if (same ? rule.order > best.rule.order : rule.order < best.rule.order) best = { rule, ...m };
    }
    return best;
  }

  // ---------------------------------------------------------------- R0.4: a body read once into a goto program, then JS
  apply(rule: Rule, caller: Node, caps: [string, Span][]): unknown {
    const frame = new Node(rule.head.frame);
    for (const [name, sp] of caps) frame.members.set(name, new Code(sp.text, sp.b, sp.e, caller));
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
        const r = this.reading(body.frame, body.text, p, stop);
        if (r !== undefined && r.end === stop) steps.push({ kind: 'apply', rule: r.rule, caps: r.caps, at });
        else steps.push({ kind: 'unread', at });
      }
      p = stop;
    }
    return steps;
  }

  // The goto program written out as JS: a `switch` over its labels, each step a statement.
  compiled_code = new Map<Code | string, { version: number; fn: Compiled }>();
  compile(body: Code): Compiled {
    const kept = this.compiled_code.get(body);
    if (kept !== undefined && kept.version === this.version) return kept.fn;
    const steps = this.program(body);
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
        lines.push(st.when ? `if (S.force(S.arg(f, ${ref(st.when)})) !== undefined) { pc = ${to}; continue; }` : `pc = ${to}; continue;`);
        continue;
      }
      if (st.kind === 'unread') { lines.push(`S.say(${JSON.stringify('Unread `' + st.at.text.s.slice(st.at.b, st.at.e).slice(0, 60) + '`.')}, ${ref(st.at)});`); continue; }
      if (st.kind === 'external') {
        const ext = this.externals.get(st.name);
        if (ext === undefined) { this.say(`No external \`${st.name}\`.`, st.at); continue; }
        lines.push(`r = ${ref(ext)}(f, [${st.args.map(a => `S.arg(f, ${ref(a)})`).join(', ')}], ${ref(st.at)});`);
        continue;
      }
      lines.push(`r = S.apply(${ref(st.rule)}, f, ${ref(st.caps)});`);
    }
    lines.push('return r;', '}');
    const fn = new Function('S', 'k', `return function (f) { ${lines.join('\n')} };`)(this, k) as Compiled;
    this.compiled_code.set(body, { version: this.version, fn });
    return fn;
  }
  // An argument that names a member of the frame (a capture, a local) is what it names; any other word is code.
  arg(frame: Node, sp: Span): unknown {
    const word = sp.text.s.slice(sp.b, sp.e);
    for (let at: Node | undefined = frame; at; at = at.parent) if (at.members.has(word)) return at.members.get(word);
    return new Code(sp.text, sp.b, sp.e, frame);
  }
  show(v: unknown): string { return v instanceof Code ? v.s : v instanceof Node ? 'node' : String(v); }

  // ---------------------------------------------------------------- R0.3: a text read statement after statement
  read(text: Text, from = 0) {
    const s = text.s, { end } = this.learned!;
    let p = from;
    while (p < s.length) {
      if (s.startsWith(end, p)) { p += end.length; continue; }
      if (this.reader) { p = this.reader(this, text, p, this.global); continue; }
      const stop = this.stop(text, p, s.length, '');
      const r = this.reading(this.global, text, p, stop);
      if (r === undefined || r.end !== stop) { this.say(`Unread \`${s.slice(p, stop).slice(0, 60)}\`.`, { text, b: p, e: stop }); p = stop; continue; }
      this.apply(r.rule, this.global, r.caps);
      p = r.end;
    }
  }
  boot(text: Text) { const after = this.axiom(text); this.read(text, after); }
}
