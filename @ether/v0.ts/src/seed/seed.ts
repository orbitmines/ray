// The seed: what starts the reader when there is nothing yet (spec/Reader.md R0). It knows no spelling of the language:
// it reads the first statement of the entrypoint by its structure (captures `{…}`, the literal between them, a body), and
// learns from it the word that defines a rule and the word that reaches the host's primitives. A capture with no type
// reads up to the end of its line (Decided, 2026-10-06, option 3). Everything else is a rule the entrypoint defines.
//
// Nothing is interpreted: a rule's body is read once, by the rules in reach, into a plan of applications and primitive
// calls, and the plan is emitted as a JS function. Applying a rule inside its own body is a call of that function.

export type Text = { name: string; s: string };
// A place in a text: where a span begins and ends (end exclusive).
export type Span = { text: Text; b: number; e: number };
// Code: a span, read later in the frame it was written in.
export type Code = Span & { kind: 'code'; frame: Scope };
export type Piece = { lit: string } | { cap: string };
export type Rule = { pieces: Piece[]; body: Code; scope: Scope; order: number; fn?: Fn; version?: number; head: string };
export type Fn = (frame: Scope) => unknown;
export type Diagnostic = { level: 'error' | 'info'; message: string; at: Span };

export class Scope {
  members = new Map<string, unknown>();
  rules: Rule[] = [];
  constructor(public parent?: Scope) {}
  // The rules in reach, nearest scope first (a rule made in a frame keeps that frame: R4.2).
  *reach(): Generator<Rule> { for (let s: Scope | undefined = this; s; s = s.parent) yield* s.rules; }
  find(name: string): { scope: Scope; value: unknown } | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) if (s.members.has(name)) return { scope: s, value: s.members.get(name) };
    return undefined;
  }
}

const isCode = (x: unknown): x is Code => typeof x === 'object' && x !== null && (x as Code).kind === 'code';
const textOf = (sp: Span) => sp.text.s.slice(sp.b, sp.e);
const WORD = /[\p{L}\p{N}_]/u;

export type Primitive = (seed: Seed, frame: Scope, args: Code[], at: Span) => unknown;

export class Seed {
  definer = '';          // learned from the first statement (`=>`)
  access = '';           // the word that reaches the primitives (`external`)
  global = new Scope();
  diagnostics: Diagnostic[] = [];
  order = 0;
  version = 0;           // bumped when a rule is added anywhere: plans read before it are read again
  primitives = new Map<string, Primitive>();

  constructor() {
    // The primitives (R3.2) — only the first ones so far; the rest come with the layers that need them.
    // a rule is defined, and a name declared, where its head or name was written
    this.primitives.set('rule', (seed, frame, [pattern, body]) => seed.define(pattern, body, pattern.frame));
    this.primitives.set('declare', (seed, frame, [name, value], at) => {
      const n = textOf(name).trim();
      const v = seed.force(value);
      name.frame.members.set(n, v);
      return v;
    });
    this.primitives.set('print', (seed, frame, args) => { console.log(args.map(a => seed.show(seed.force(a))).join(' ')); return undefined; });
  }

  say(level: Diagnostic['level'], message: string, at: Span) { this.diagnostics.push({ level, message, at }); }

  // ---------------------------------------------------------------- R0.1: the first statement, read by its structure
  axiom(text: Text): number {
    const s = text.s, end = s.indexOf('\n') < 0 ? s.length : s.indexOf('\n');
    const line = s.slice(0, end);
    // Pieces: `{name}` captures and the literals between them.
    const pieces = parse_pieces(line);
    const caps = pieces.map((p, i) => ('cap' in p ? i : -1)).filter(i => i >= 0);
    if (caps.length < 2) throw new Error('the first statement must be a rule with two captures');
    const between = pieces.slice(caps[0] + 1, caps[1]).map(p => ('lit' in p ? p.lit : '')).join('').trim();
    this.definer = between;
    // The head is everything before the last definer; the body after it.
    const cut = line.lastIndexOf(' ' + this.definer + ' ');
    const headText = line.slice(0, cut), bodyAt = cut + this.definer.length + 2;
    this.access = (line.slice(bodyAt).match(/^\S+/) ?? [''])[0];
    const head: Code = { kind: 'code', text, b: 0, e: cut, frame: this.global };
    const body: Code = { kind: 'code', text, b: bodyAt, e: end, frame: this.global };
    this.define(head, body, this.global);
    void headText;
    return end;
  }

  // ---------------------------------------------------------------- rules
  define(pattern: Code, body: Code, frame: Scope): Rule {
    const head = textOf(pattern).trim();
    const rule: Rule = { pieces: parse_pieces(head), body, scope: frame, order: this.order++, head };
    frame.rules.push(rule);
    this.version++;
    return rule;
  }

  // Every way `rule` reads `text` from `p`: its end and its captures. A capture with no type reads up to the end of its line,
  // longest first; a literal reads exactly itself.
  match(rule: Rule, text: Text, p: number): { end: number; caps: Map<string, Span> }[] {
    const out: { end: number; caps: Map<string, Span> }[] = [];
    const s = text.s;
    const go = (i: number, at: number, caps: Map<string, Span>) => {
      if (i === rule.pieces.length) { out.push({ end: at, caps: new Map(caps) }); return; }
      const piece = rule.pieces[i];
      if ('lit' in piece) {
        if (!s.startsWith(piece.lit, at)) return;
        // a literal that is a word does not end inside a longer word (⊣ is not yet a rule; until it is, words are whole)
        const last = piece.lit[piece.lit.length - 1], next = s[at + piece.lit.length];
        if (last !== undefined && WORD.test(last) && next !== undefined && WORD.test(next)) return;
        go(i + 1, at + piece.lit.length, caps);
        return;
      }
      let lineEnd = s.indexOf('\n', at); if (lineEnd < 0) lineEnd = s.length;
      for (let e = lineEnd; e > at; e--) { caps.set(piece.cap, { text, b: at, e }); go(i + 1, e, caps); caps.delete(piece.cap); }
    };
    go(0, p, new Map());
    return out;
  }

  // The reading of the statement at `p`: the longest; between equally long ones the latest defined (`=>` overrides).
  reading(frame: Scope, text: Text, p: number, limit: number) {
    let best: { rule: Rule; end: number; caps: Map<string, Span> } | undefined;
    for (const rule of frame.reach()) {
      for (const m of this.match(rule, text, p)) {
        if (m.end > limit) continue;
        if (best === undefined || m.end > best.end || (m.end === best.end && rule.order > best.rule.order)) best = { rule, ...m };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- applying: a frame where the rule was written, its captures as code
  apply(rule: Rule, caller: Scope, caps: Map<string, Span>): unknown {
    const frame = new Scope(rule.scope);
    for (const [name, sp] of caps) frame.members.set(name, { kind: 'code', ...sp, frame: caller } as Code);
    return this.compiled(rule)(frame);
  }

  compiled(rule: Rule): Fn {
    if (rule.fn === undefined || rule.version !== this.version) { rule.fn = this.compile(rule.body); rule.version = this.version; }
    return rule.fn;
  }

  // A body read once into a plan, emitted as a JS function of its frame.
  compile(body: Code): Fn {
    const plan = this.plan(body);
    const src = plan.map((step, k) => `r = s.steps[${k}](f);`).join('\n');
    const steps = plan;
    const made = new Function('s', `return function (f) { let r; ${src}\n return r; };`);
    return made({ steps });
  }

  // What a body says, statement by statement: each a primitive call (`access name args…`) or a rule applied.
  plan(body: Code): ((frame: Scope) => unknown)[] {
    const steps: ((frame: Scope) => unknown)[] = [];
    const { text } = body;
    let p = body.b;
    while (p < body.e) {
      while (p < body.e && (text.s[p] === ' ' || text.s[p] === '\n')) p++;
      if (p >= body.e) break;
      const at = p;
      // the access word, then a primitive's name and its arguments (words, each code read where it is used)
      if (text.s.startsWith(this.access + ' ', p)) {
        let lineEnd = text.s.indexOf('\n', p); if (lineEnd < 0 || lineEnd > body.e) lineEnd = body.e;
        const words: Span[] = [];
        for (let i = p + this.access.length; i < lineEnd;) {
          while (i < lineEnd && text.s[i] === ' ') i++;
          const b = i; while (i < lineEnd && text.s[i] !== ' ') i++;
          if (i > b) words.push({ text, b, e: i });
        }
        const [name, ...args] = words;
        const primitive = this.primitives.get(textOf(name));
        const span: Span = { text, b: at, e: lineEnd };
        if (primitive === undefined) { this.say('error', `No primitive \`${textOf(name)}\`.`, span); p = lineEnd; continue; }
        // an argument that names a member of the frame (a capture, a local) is what it names; any other word is code
        steps.push(frame => primitive(this, frame, args.map(a => { const held = frame.find(textOf(a)); return isCode(held?.value) ? held!.value as Code : ({ kind: 'code', ...a, frame }) as Code; }), span));
        p = lineEnd;
        continue;
      }
      // a statement read by a rule — which rule is decided when the body runs in its frame, once per frame shape
      const end = (() => { let e = text.s.indexOf('\n', p); return e < 0 || e > body.e ? body.e : e; })();
      const span: Span = { text, b: at, e: end };
      steps.push(frame => this.statement(frame, span));
      p = end;
    }
    return steps;
  }

  // A statement read in a frame: the rule that reads it applied, or a name the frame holds, or an error.
  statement(frame: Scope, span: Span): unknown {
    const r = this.reading(frame, span.text, span.b, span.e);
    if (r !== undefined && r.end === span.e) return this.apply(r.rule, frame, r.caps);
    const word = textOf(span).trim();
    const held = frame.find(word);
    if (held !== undefined) return held.value;
    this.say('error', `Unread \`${word.slice(0, 60)}\`.`, span);
    return undefined;
  }

  // What code is: read where it was written.
  force(x: unknown): unknown {
    if (!isCode(x)) return x;
    const text = textOf(x).trim();
    const held = x.frame.find(text);
    if (held !== undefined) return this.force(held.value);
    return this.statement(x.frame, x);
  }

  show(v: unknown): string { return isCode(v) ? textOf(v) : v instanceof Scope ? 'scope' : String(v); }

  // ---------------------------------------------------------------- R0.2: a text read statement after statement
  read(text: Text, from = 0) {
    let p = from;
    const s = text.s;
    while (p < s.length) {
      if (s[p] === '\n') { p++; continue; }
      const r = this.reading(this.global, text, p, s.length);
      if (r === undefined) {
        let e = s.indexOf('\n', p); if (e < 0) e = s.length;
        this.say('error', `Unread \`${s.slice(p, e).slice(0, 60)}\`.`, { text, b: p, e });
        p = e;
        continue;
      }
      this.apply(r.rule, this.global, r.caps);
      p = r.end;
    }
  }

  boot(text: Text) { const after = this.axiom(text); this.read(text, after); }
}

// `{name}` captures and the literals between them.
export function parse_pieces(head: string): Piece[] {
  const out: Piece[] = [];
  let lit = '';
  for (let i = 0; i < head.length;) {
    if (head[i] === '{') {
      const close = head.indexOf('}', i);
      if (close > i) { if (lit) { out.push({ lit }); lit = ''; } out.push({ cap: head.slice(i + 1, close).trim() }); i = close + 1; continue; }
    }
    lit += head[i++];
  }
  if (lit) out.push({ lit });
  return out;
}
