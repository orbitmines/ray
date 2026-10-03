import { Text } from './text.ts';
import { Diagnostics, type Diagnostic } from './diagnostics.ts';
import { Natives } from './natives.ts';
import type { Program } from './program.ts';

export type { Diagnostic };
export type Args = { interpreter: Interpreter; frame: Node; args: Node[]; at: Text.Node; self?: Node };
export type Native = { arity: number; fn: (args: Args) => Node | undefined; raw?: boolean };
export type Piece = (
  | { kind: 'literal'; text: string }
  | { kind: 'gap' }
  | { kind: 'capture'; name: string; raw: boolean; typed: boolean; optional: boolean; exact?: boolean; content?: Text.Node; within?: Node; undecided?: boolean; decided?: number }
) & { tight?: boolean };

export class Node {
  at?: Text.Node
  parent?: Node
  with?: Node[]
  sees?: Node[]
  names?: Map<string, Node>
  rules?: Rule[]
  code?: { span: Text.Node; in: Node }
  value?: Node
  program?: boolean
  place?: { in: Node; name: string; member?: boolean }
  text?: boolean
  fn?: Native
  none?: boolean
  style?: string
  theme?: Map<string, string>
  bytes?: Uint8Array
  raw?: boolean
  stands?: Node
  site?: Text.Node
  on?: Node
  given?: Set<string>
  constructor(at?: Text.Node) { this.at = at; }
  own(name: string): Node | undefined { return this.names?.get(name); }
  set(name: string, value: Node): Node { (this.names ??= new Map()).set(name, value); return value; }
}

export class Rule {
  native?: string
  style?: Node
  defines = false
  home?: Node
  lexical?: Text.Node
  implicit = false
  constructor(public pattern: Piece[], public closure: Node, public at: Text.Node, public key: string, public order: number, public body?: Text.Node, public fn?: Native) {}
  get leading(): boolean { return this.pattern[0]?.kind === 'capture'; }
  get enclosed(): boolean { const first = this.pattern[0], last = this.pattern[this.pattern.length - 1]; return this.pattern.length >= 3 && first.kind === 'literal' && last.kind === 'literal' && !Interpreter.word.test(first.text[0] ?? 'a'); }
  // A spelling that takes the one thing written after it.
  get operator(): string | undefined { const [first, second] = this.pattern; return this.pattern.length === 2 && first.kind === 'literal' && second.kind === 'capture' && !Interpreter.word.test(first.text[0] ?? 'a') ? first.text : undefined; }
}

export type Running = { found: Match; at: Text.Node; local?: Node };
export type Match = { rule: Rule; begin: number; end: number; reach: number; captures: Map<string, Text.Node>; literals: [number, number][]; receiver?: Node };

export class Jump { site?: Text.Node; spelled = false; constructor(public label: string, public value?: Node) {} }
export class Recursion { constructor(public at: Text.Node) {} }

export class Interpreter {
  static word = /[\p{L}\p{N}_]/u;
  static DEPTH = 400;

  GLOBAL: Node
  NONE: Node
  EXTERNAL: Node
  BASE?: Node
  made?: Node
  program?: Program
  owns: (src: Text.Source) => boolean = () => true;
  copy_of?: Interpreter
  version = 0
  private order = 0
  private depth = 0
  reading?: Text.Node

  constructor(public diagnostics: Diagnostics) {
    this.GLOBAL = new Node();
    this.NONE = Object.assign(new Node(), { none: true });
    this.EXTERNAL = this.GLOBAL.set('external', Object.assign(new Node(), { fn: { arity: 1, raw: true, fn: ({ interpreter, frame, args: [name] }: Args) => interpreter.external(name, frame) } }));
    const seed = new Rule([{ kind: 'capture', name: 'pattern', raw: false, typed: false, optional: false }, { kind: 'literal', text: '=>' }, { kind: 'capture', name: 'body', raw: false, typed: false, optional: false }], this.GLOBAL, Text.Node.string('{pattern} => {body}'), '', this.order++, undefined, Natives.rule);
    seed.native = 'rule';
    seed.defines = true;
    this.add_rule(this.GLOBAL, seed);
  }

  // Lookup: a scope's own names, then what it sees (and what those see), then what it is made of, then its parent. The outermost answers last.
  *scopes(from: Node): Generator<Node> {
    const seen = new Set<Node>();
    const visit = function* (scope: Node, deep: boolean, global: Node): Generator<Node> {
      for (let at: Node | undefined = scope; at !== undefined; at = deep ? at.parent : undefined) {
        if (seen.has(at)) { if (!deep) return; continue; }
        if (at === global) return;
        seen.add(at);
        yield at;
        for (const sees of at.sees ?? []) yield* visit(sees, true, global);
        for (const made of at.on === undefined ? at.with ?? [] : [at.on, ...(at.with ?? [])]) yield* visit(made, false, global);
      }
    };
    yield* visit(from, true, this.GLOBAL);
    if (!seen.has(this.GLOBAL)) { seen.add(this.GLOBAL); yield this.GLOBAL; for (const made of this.GLOBAL.with ?? []) yield* visit(made, false, this.GLOBAL); }
  }
  private naming?: { scope: Node; hole: Node; name?: string };
  private trying = 0;
  tried<T>(fn: () => T): T { this.trying++; try { return fn(); } finally { this.trying--; } }
  // What the base gave a value is seen from that value and from what is made of it, not from code written around it.
  lookup(frame: Node, name: string, at?: Text.Node): Node | undefined {
    if (at !== undefined && !this.written_in(frame, name)) {
      const local = this.holding(at)?.local;
      if (local?.on?.given?.has(name) && this.reaches(frame, local)) return local.on.own(name);
    }
    const seen = new Set<Node>();
    const visit = (scope: Node | undefined, lexical: boolean, deep: boolean): Node | undefined => {
      for (let at = scope; at !== undefined; at = deep ? at.parent : undefined) {
        if (seen.has(at) || at === this.GLOBAL) { if (!deep) return; continue; }
        seen.add(at);
        const found = at.own(name);
        if (found !== undefined && !(lexical && at.given?.has(name))) return found;
        for (const sees of at.sees ?? []) { const written = sees.own(name); if (written !== undefined && !sees.given?.has(name) && !seen.has(sees)) return written; }
        for (const made of at.on === undefined ? at.with ?? [] : [at.on, ...(at.with ?? [])]) { const held = visit(made, false, false); if (held !== undefined) return held; }
        for (const sees of at.sees ?? []) { const held = visit(sees, true, true); if (held !== undefined) return held; }
        lexical = true;
      }
    };
    const found = visit(frame, false, true);
    if (found !== undefined) return found;
    const global = this.GLOBAL.own(name);
    if (global !== undefined) return global;
    for (const made of this.GLOBAL.with ?? []) { const held = visit(made, false, false); if (held !== undefined) return held; }
    if (this.naming !== undefined && this.naming.name === undefined && frame === this.naming.scope && this.trying === 0) { this.naming.name = name; return frame.set(name, this.naming.hole); }
  }
  reaches(frame: Node, target: Node): boolean {
    const seen = new Set<Node>(), todo = [frame];
    while (todo.length > 0) {
      const at = todo.pop()!;
      if (at === target) return true;
      if (seen.has(at) || at === this.GLOBAL) continue;
      seen.add(at);
      if (at.parent) todo.push(at.parent);
      if (at.sees) todo.push(...at.sees);
    }
    return false;
  }
  written_in(frame: Node, name: string): boolean { return (frame.own(name) !== undefined && !frame.given?.has(name)) || (frame.sees ?? []).some(sees => sees.own(name) !== undefined && !sees.given?.has(name)); }
  // Where a frame holds a name itself or through what it is made of: where a declaration may follow it.
  near_holder(frame: Node, name: string): Node | undefined {
    if (frame.own(name) !== undefined) return frame;
    for (const made of frame.on === undefined ? frame.with ?? [] : [frame.on, ...(frame.with ?? [])]) if (made.own(name) !== undefined && made.given?.has(name)) return made;
  }
  holder(frame: Node, name: string): Node | undefined {
    for (const scope of this.scopes(frame)) if (scope.own(name) !== undefined) return scope;
  }
  member(of: Node, name: string): Node | undefined {
    const seen = new Set<Node>();
    const visit = (node: Node): Node | undefined => {
      if (seen.has(node)) return;
      seen.add(node);
      const own = node.own(name);
      if (own !== undefined) return own;
      for (const made of node.with ?? []) { const found = visit(made); if (found !== undefined) return found; }
    };
    return visit(of) ?? (this.BASE !== undefined && of !== this.BASE ? visit(this.BASE) : undefined);
  }

  // Rules in reach: the scope chain's, and for a value, what it and the base are made of.
  private rule_sets = new WeakMap<Node, { version: number; rules: Rule[] }>();
  rules_of(frame: Node): Rule[] {
    const held = this.rule_sets.get(frame);
    if (held?.version === this.version) return held.rules;
    const rules: Rule[] = [], seen = new Set<Node>();
    const visit = (scope: Node | undefined) => {
      for (let at = scope; at !== undefined && !seen.has(at); at = at.parent) {
        seen.add(at);
        if (at.rules) for (let k = at.rules.length - 1; k >= 0; k--) rules.push(at.rules[k]);
        for (const sees of at.sees ?? []) visit(sees);
      }
    };
    visit(frame);
    this.rule_sets.set(frame, { version: this.version, rules });
    return rules;
  }
  private value_sets = new WeakMap<Node, { version: number; rules: Rule[] }>();
  rules_on(value: Node): Rule[] {
    const held = this.value_sets.get(value);
    if (held?.version === this.version) return held.rules;
    const rules: Rule[] = [], seen = new Set<Node>();
    const visit = (node: Node) => {
      if (seen.has(node) || node === this.GLOBAL) return;
      seen.add(node);
      if (node.rules) for (let k = node.rules.length - 1; k >= 0; k--) rules.push(node.rules[k]);
      for (const made of node.with ?? []) visit(made);
    };
    visit(value);
    if (this.BASE !== undefined) visit(this.BASE);
    this.value_sets.set(value, { version: this.version, rules });
    return rules;
  }
  add_rule(scope: Node, rule: Rule) {
    const rules = (scope.rules ??= []);
    rule.home = scope;
    rule.implicit = scope !== this.GLOBAL && rule.leading && (rule.pattern.length === 1 || rule.pattern[1].kind === 'gap');
    const same = rules.findIndex(other => other.key === rule.key);
    if (same >= 0) { rule.order = rules[same].order; rules.splice(same, 1); }
    rules.push(rule);
    this.version++;
  }

  // Reading: statements, one after another; a jump carries on at the statement its label is.
  read(cursor: Text.Node, frame: Node): Node | undefined {
    const begin = cursor.cursor, mark = this.forced.length;
    let last: Node | undefined;
    while (true) {
      this.blank(cursor);
      if (cursor.done()) { if (this.running.length === 0) this.forced.length = Math.min(this.forced.length, mark); return last; }
      const start = cursor.cursor;
      if (frame === this.GLOBAL) this.reading = cursor.span(start, this.statement_end(cursor, start, frame) - 1);
      try {
        const value = this.statement(cursor, frame);
        if (value !== undefined) last = value;
      } catch (jump) {
        if (!(jump instanceof Jump)) throw jump;
        const at = this.label_at(cursor, begin, jump.label, frame);
        if (at === undefined) { jump.value ??= last; throw jump; }
        if (jump.value !== undefined) last = jump.value;
        if (at < start) { for (let k = mark; k < this.forced.length; k++) this.forced[k].value = undefined; this.forced.length = Math.min(this.forced.length, mark); }
        cursor.cursor = at;
        continue;
      }
      if (cursor.cursor === start) cursor.advance();
    }
  }
  label_at(cursor: Text.Node, begin: number, label: string, frame: Node): number | undefined {
    const text = cursor.source.value;
    for (let j = begin; j < cursor.limit;) {
      while (j < cursor.limit && /\s/.test(text[j])) j++;
      if (j >= cursor.limit) return;
      const probe = cursor.bounded(j, cursor.limit);
      const found = this.best(this.rules_of(frame).filter(rule => rule.native === 'label'), probe, frame, undefined, true);
      if (found?.rule.native === 'label' && [...found.captures.values()][0]?.string.trim() === label) return j;
      j = this.statement_end(cursor, j, frame);
      if (text[j] === '\n') j++;
    }
  }
  statement_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value;
    while (j < cursor.limit && text[j] !== '\n') { const k = this.claim(cursor, j, frame); j = k > j ? k : j + 1; }
    return j;
  }
  blank(cursor: Text.Node) { const text = cursor.source.value; while (cursor.cursor < cursor.limit && /\s/.test(text[cursor.cursor])) cursor.cursor++; }
  spaces(cursor: Text.Node, j: number): number { const text = cursor.source.value; while (j < cursor.limit && (text[j] === ' ' || text[j] === '\t')) j++; return j; }

  statement(cursor: Text.Node, frame: Node): Node | undefined {
    let value: Node | undefined;
    const text = cursor.source.value;
    while (true) {
      if (cursor.done()) break;
      if (value === undefined) {
        cursor.cursor = this.spaces(cursor, cursor.cursor);
        if (cursor.done() || text[cursor.cursor] === '\n') break;
        const start = cursor.cursor;
        const found = this.best(this.rules_of(frame).filter(rule => (!rule.leading && rule.home === this.GLOBAL) || rule.defines), cursor, frame);
        const name = this.token(cursor, start);
        let named: Match | undefined, place: Node | undefined;
        if (name > start) {
          place = this.place(frame, cursor.span(start, name - 1));
          const probe = cursor.bounded(name, cursor.limit);
          named = this.tried(() => this.best(this.receiving(place, frame), probe, frame, place));
        }
        const self = this.holding(cursor.span(start, start))?.found.receiver ?? (frame === this.GLOBAL ? undefined : frame);
        const own = self === undefined ? undefined : this.best(this.receiving(self, frame).filter(rule => !rule.leading && !(rule.pattern[0]?.kind === 'literal' && this.opens(rule.pattern[0].text))), cursor, frame, self);
        const spelled = name > start && !Interpreter.word.test(text[start]) && !named?.rule.defines && !found?.rule.defines;
        if (spelled && own !== undefined && own.rule.pattern[0]?.kind === 'literal') { value = this.fire(own, cursor, frame); continue; }
        if (spelled && found !== undefined && found.rule.pattern[0]?.kind === 'literal') { value = this.fire(found, cursor, frame); continue; }
        if (own !== undefined && (own.end > Math.max(found?.end ?? start, named?.end ?? name) || (found?.rule === own.rule && own.end === found.end && own.end > (named?.end ?? name)))) { value = this.fire(own, cursor, frame); continue; }
        const unbound = place !== undefined && found !== undefined && found.end >= name && !named?.rule.leading && !named?.rule.defines && this.quietly(() => this.lookup(frame, place!.place!.name)) === undefined;
        if (found !== undefined && (unbound || name <= start || found.end > (named?.end ?? name) || (named === undefined && found.end >= name) || (named !== undefined && found.end === named.end && found.reach > named.reach) || (found.rule.defines && !named?.rule.defines && found.end >= named!.end))) { value = this.fire(found, cursor, frame); continue; }
        if (place === undefined) break;
        this.paint_place(place);
        cursor.cursor = name;
        value = place;
        continue;
      }
      const reader = this.deref(value, false);
      if (reader?.fn !== undefined && reader.fn.arity > 0 && !reader.fn.raw && cursor.cursor < cursor.limit && this.claim(cursor, cursor.cursor, frame) > cursor.cursor) { value = this.call(reader, cursor, frame); continue; }
      if (reader?.fn?.raw) { const at = this.spaces(cursor, cursor.cursor); if (at < cursor.limit && text[at] !== '\n') { cursor.cursor = at; value = this.call(reader, cursor, frame); continue; } }
      const found = this.best(this.receiving(value, frame), cursor, frame, value);
      if (found !== undefined) { value = this.fire(found, cursor, frame); continue; }
      const at = this.spaces(cursor, cursor.cursor);
      if (at >= cursor.limit || text[at] === '\n') break;
      const target = this.deref(value);
      if (target?.fn !== undefined && target.fn.arity > 0) {
        cursor.cursor = at;
        value = this.call(target, cursor, frame);
        continue;
      }
      const after = this.best(this.rules_of(frame).filter(rule => !rule.leading && rule.home === this.GLOBAL), cursor.bounded(at, cursor.limit), frame);
      if (after !== undefined) { cursor.cursor = at; this.fire(after, cursor, frame); continue; }
      const end = this.statement_end(cursor, at, frame);
      this.error(`Unexpected \`${text.slice(at, end)}\`.`, cursor.span(at, Math.max(at, end - 1)));
      cursor.cursor = end;
      break;
    }
    return value;
  }
  holding(at: Text.Node): Running | undefined {
    for (let k = this.running.length - 1; k >= 0; k--) {
      const { rule } = this.running[k].found;
      if ((rule.body !== undefined && Interpreter.within(at, rule.body)) || (rule.lexical !== undefined && Interpreter.within(at, rule.lexical))) return this.running[k];
    }
  }
  receiving(value: Node, frame: Node): Rule[] {
    const target = value.place !== undefined || value.code !== undefined ? this.deref(value, false) : value;
    const own = (target !== undefined && !target.none && target !== this.GLOBAL ? this.rules_on(target) : this.BASE !== undefined ? this.rules_on(this.BASE) : []).filter(rule => rule.pattern[0]?.kind !== 'gap' || rule.home === target);
    return [...own, ...this.rules_of(frame).filter(rule => rule.leading && !rule.implicit)];
  }
  // A native taking arguments takes the operands written after it, read when it asks.
  call(target: Node, cursor: Text.Node, frame: Node): Node | undefined {
    const native = target.fn!;
    const args: Node[] = [];
    for (let k = 0; k < native.arity; k++) {
      const from = this.spaces(cursor, cursor.cursor);
      if (from >= cursor.limit || cursor.source.value[from] === '\n') break;
      const claimed = this.claim(cursor, from, frame);
      let end = native.raw && k === 0 ? this.token(cursor, from) : claimed > from ? claimed : this.operand_end(cursor, from, frame);
      if (!(native.raw && k === 0) && end > from && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(cursor.source.value.slice(from, end)) && this.tried(() => this.lookup(frame, cursor.source.value.slice(from, end)))?.fn?.raw) { const after = this.spaces(cursor, end); const token = this.token(cursor, after); if (token > after) end = token; }
      if (end <= from) break;
      const span = cursor.span(from, end - 1);
      args.push(native.raw && k === 0 ? this.literal(span) : this.lazy(span, frame));
      cursor.cursor = end;
    }
    const at = cursor.span(cursor.cursor, cursor.cursor);
    return native.fn({ interpreter: this, frame, args, at });
  }

  // Matching: the longest reading wins, then the one that spells more, then the one met first.
  best(rules: Rule[], cursor: Text.Node, frame: Node, receiver?: Node, quiet: boolean = false): Match | undefined {
    let best: Match | undefined;
    for (const rule of rules) {
      if (rule.at.source === cursor.source && rule.at.begin <= cursor.cursor && cursor.cursor <= rule.at.end) continue;
      const found = quiet ? this.quietly(() => this.match(rule, cursor, frame, receiver)) : this.match(rule, cursor, frame, receiver);
      if (found === undefined) continue;
      const spelled = (m: Match) => receiver !== undefined && m.rule.pattern[m.rule.leading ? 1 : 0]?.kind === 'literal' ? 1 : 0;
      if (best === undefined || (spelled(found) - spelled(best) || found.end - best.end || Number(found.rule.defines) - Number(best.rule.defines) || found.reach - best.reach) > 0) best = found;
    }
    return best;
  }
  match(rule: Rule, cursor: Text.Node, frame: Node, receiver?: Node): Match | undefined {
    const text = cursor.source.value, pieces = rule.pattern;
    let i = cursor.cursor, reach = 0;
    const captures = new Map<string, Text.Node>(), literals: [number, number][] = [];
    const enclosed = rule.enclosed;
    let opened = 0;
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      if (piece.kind === 'literal') {
        const after_line = p > 0 && pieces[p - 1].kind === 'literal' && (pieces[p - 1] as { text: string }).text.endsWith('\n');
        const from = (piece.tight && !after_line) || (p === 0 && receiver !== undefined && !rule.defines && this.opens(piece.text)) ? i : this.spaces(cursor, i);
        if (!this.spelled(cursor, from, piece.text)) return;
        literals.push([from, from + piece.text.length - 1]);
        reach += piece.text.length;
        if (this.opens(piece.text)) opened++; else if (opened > 0 && this.closes(piece.text)) opened--;
        i = from + piece.text.length;
        continue;
      }
      if (piece.kind === 'gap') {
        const j = this.spaces(cursor, i);
        const elided = p >= 2 && pieces[p - 1].kind === 'capture' && pieces[p - 2].kind === 'gap' && captures.get((pieces[p - 1] as { name: string }).name)?.string === '';
        if (j === i && i < cursor.limit && !/\s/.test(text[i]) && !elided) return;
        i = j;
        continue;
      }
      if (p === 0 && receiver !== undefined && !rule.implicit) { if (pieces[1]?.tight && /\s/.test(text[i] ?? '')) return; continue; }
      const next = pieces[p + 1], before = pieces[p - 1];
      const exact = piece.raw && piece.exact === true && next?.kind === 'literal';
      const from = exact ? i : this.spaces(cursor, i);
      let end: number;
      const beyond = p > 0 && piece.raw && next?.kind === 'gap' ? pieces[p + 2] : undefined;
      if (beyond?.kind === 'literal') {
        end = this.first(cursor, from, beyond.text, frame, piece.raw, enclosed || opened > 0);
        if (end < 0) return;
      }
      else if (next?.kind === 'literal') {
        end = p === 0 ? this.last(cursor, from, next.text, frame, piece.raw, enclosed || opened > 0) : this.first(cursor, from, next.text, frame, piece.raw, enclosed || opened > 0);
        if (end < 0) return;
      }
      else if (piece.raw) end = receiver !== undefined || next !== undefined ? this.token_end(cursor, from, frame) : this.unspaced(cursor, from);
      else if (next !== undefined || before?.kind === 'gap') end = this.operand_end(cursor, from, frame);
      else end = this.trailing_end(cursor, from, frame, rule);
      let last = end;
      if (!exact) while (last > from && /\s/.test(text[last - 1])) last--;
      const span = cursor.span(from, last - 1);
      if (last <= from) { if (!piece.optional && !enclosed && opened === 0) return; captures.set(piece.name, span); i = end; continue; }
      if (piece.undecided && piece.decided !== this.version) this.decide(piece);
      if (piece.undecided) return;
      if (piece.typed && this.holds(piece, span) === undefined) return;
      captures.set(piece.name, span);
      i = end;
    }
    if (i === cursor.cursor) return;
    return { rule, begin: cursor.cursor, end: i, reach, captures, literals, receiver };
  }
  private openers?: { version: number; spelled: Set<string> };
  private closers?: { version: number; spelled: Set<string> };
  closes(literal: string): boolean {
    if (this.closers?.version !== this.version) this.closers = { version: this.version, spelled: new Set(this.rules_of(this.GLOBAL).filter(rule => rule.enclosed).map(rule => (rule.pattern[rule.pattern.length - 1] as { text: string }).text)) };
    return this.closers.spelled.has(literal);
  }
  opens(literal: string): boolean {
    if (this.openers?.version !== this.version) this.openers = { version: this.version, spelled: new Set(this.rules_of(this.GLOBAL).filter(rule => rule.enclosed).map(rule => (rule.pattern[0] as { text: string }).text)) };
    return this.openers.spelled.has(literal);
  }
  spelled(cursor: Text.Node, at: number, literal: string): boolean {
    const text = cursor.source.value;
    if (at + literal.length > cursor.limit || !text.startsWith(literal, at)) return false;
    if (Interpreter.word.test(literal[0]) && at > 0 && Interpreter.word.test(text[at - 1])) return false;
    if (Interpreter.word.test(literal[literal.length - 1]) && Interpreter.word.test(text[at + literal.length] ?? '')) return false;
    if (Interpreter.run(literal[0]) && at > 0 && Interpreter.run(text[at - 1])) return false;
    if (Interpreter.run(literal[literal.length - 1]) && Interpreter.run(text[at + literal.length] ?? ' ')) return false;
    return true;
  }
  static run(character: string): boolean { return !/[\s\p{L}\p{N}_(){}\[\]`,"']/u.test(character); }
  // Where a capture ends: at the literal after it, at the end of one operand, or before what binds looser.
  first(cursor: Text.Node, from: number, literal: string, frame: Node, raw: boolean, enclosed: boolean): number {
    const text = cursor.source.value;
    for (let j = from; j < cursor.limit;) {
      if (this.spelled(cursor, j, literal)) return j;
      if (text[j] === '\n' && !enclosed && literal[0] !== '\n') return -1;
      const k = raw ? j : this.claim(cursor, j, frame);
      j = k > j ? k : j + 1;
    }
    return -1;
  }
  last(cursor: Text.Node, from: number, literal: string, frame: Node, raw: boolean, enclosed: boolean): number {
    let found = -1;
    const text = cursor.source.value;
    for (let j = from; j < cursor.limit;) {
      if (this.spelled(cursor, j, literal)) found = j;
      if (text[j] === '\n' && !enclosed) break;
      const k = raw ? j : this.claim(cursor, j, frame);
      j = k > j ? k : j + 1;
    }
    return found;
  }
  unspaced(cursor: Text.Node, j: number): number { const text = cursor.source.value; while (j < cursor.limit && !/\s/.test(text[j])) j++; return j; }
  operand_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value;
    let run = j;
    while (run < cursor.limit && Interpreter.run(text[run])) run++;
    if (run > j && (run >= cursor.limit || /\s/.test(text[run]))) return j;
    while (j < cursor.limit && !/\s/.test(text[j])) { const k = this.claim(cursor, j, frame); j = k > j ? k : j + 1; }
    return j;
  }
  token_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value;
    while (j < cursor.limit && (Interpreter.word.test(text[j]) || (text[j] === '-' && Interpreter.word.test(text[j + 1] ?? '')))) j++;
    return j;
  }
  trailing_end(cursor: Text.Node, j: number, frame: Node, rule: Rule): number {
    const text = cursor.source.value, looser = this.looser(frame, rule);
    while (j < cursor.limit && text[j] !== '\n') {
      if (j > 0 && /\s/.test(text[j - 1]) && looser.some(spelling => this.spelled(cursor, j, spelling))) {
        let k = j; while (k > 0 && /\s/.test(text[k - 1])) k--;
        return k;
      }
      const k = this.claim(cursor, j, frame);
      j = k > j ? k : j + 1;
    }
    return j;
  }
  looser(frame: Node, rule: Rule): string[] {
    const out: string[] = [];
    for (const other of this.rules_of(frame)) { const spelling = other.operator; if (spelling !== undefined && other.order < rule.order) out.push(spelling); }
    if (this.BASE !== undefined) for (const other of this.rules_on(this.BASE)) { const spelling = other.operator; if (spelling !== undefined && other.order < rule.order) out.push(spelling); }
    const own = rule.pattern[0];
    if (own?.kind === 'literal' && Interpreter.run(own.text[0])) out.push(own.text);
    return out;
  }
  // A bracket is any rule written between two literals: what it encloses is skipped over as one.
  private claims = new WeakMap<Text.Source, { version: number; at: Map<number, number> }>();
  claim(cursor: Text.Node, j: number, frame: Node): number {
    let held = this.claims.get(cursor.source);
    if (held === undefined || held.version !== this.version) this.claims.set(cursor.source, held = { version: this.version, at: new Map() });
    const known = held.at.get(j);
    if (known !== undefined && known <= cursor.limit) return known;
    held.at.set(j, j);
    let end = j;
    const probe = cursor.bounded(j, cursor.limit);
    for (const rule of this.rules_of(this.GLOBAL)) {
      if (!rule.enclosed || !cursor.source.value.startsWith((rule.pattern[0] as { text: string }).text, j)) continue;
      const found = this.match(rule, probe, this.GLOBAL);
      if (found !== undefined && found.end > end) end = found.end;
    }
    held.at.set(j, end);
    return end;
  }
  token(cursor: Text.Node, j: number): number {
    const text = cursor.source.value;
    if (j >= cursor.limit) return j;
    if (Interpreter.word.test(text[j])) { while (j < cursor.limit && (Interpreter.word.test(text[j]) || (text[j] === '-' && Interpreter.word.test(text[j + 1] ?? '')))) j++; return j; }
    while (j < cursor.limit && !/[\s\p{L}\p{N}_(){}\[\]`,]/u.test(text[j])) j++;
    return j;
  }

  // Applying: a frame where the rule was written, made of what it is applied to, holding what it was handed.
  fire(found: Match, cursor: Text.Node, frame: Node): Node | undefined {
    cursor.cursor = found.end;
    return this.apply(found, frame, cursor.span(found.begin, found.end - 1));
  }
  apply(found: Match, frame: Node, at: Text.Node): Node | undefined {
    const { rule, captures, receiver } = found;
    if (++this.depth > Interpreter.DEPTH) { this.depth = 0; throw new Recursion(at); }
    try {
      this.running.push({ found, at });
      this.paint_rule(found, at);
      const local = new Node(at);
      this.running[this.running.length - 1].local = local;
      let site = at;
      for (let k = this.running.length - 2; k >= 0; k--) { const body = this.running[k].found.rule.body; if (body !== undefined && Interpreter.within(site, body)) site = this.running[k].at; }
      if (site !== at) local.site = site;
      local.parent = rule.closure;
      if (receiver !== undefined) {
        const value = this.deref(receiver, false);
        if (receiver.place === undefined && value !== undefined && !value.none) this.construct(value);
        if (receiver.place !== undefined) {
          const context = Object.assign(new Node(receiver.at), { stands: receiver, with: value !== undefined && !value.none ? [value] : undefined });
          this.construct(context);
          local.on = context;
        }
        else if (value !== undefined && !value.none) local.on = value;
      }
      const args: Node[] = [];
      rule.pattern.forEach((piece, p) => {
        if (piece.kind !== 'capture') return;
        const value = p === 0 && receiver !== undefined && !rule.implicit ? receiver : captures.has(piece.name) ? (piece.raw ? this.literal(captures.get(piece.name)!) : this.lazy(captures.get(piece.name)!, frame)) : this.NONE;
        local.set(piece.name, value);
        args.push(value);
      });
      for (const piece of rule.pattern) if (piece.kind === 'capture' && piece.content !== undefined && captures.has(piece.name)) this.run_content(piece, captures.get(piece.name)!, local);
      if (rule.fn !== undefined) return rule.fn.fn({ interpreter: this, frame: local, args, at, self: receiver });
      if (rule.body === undefined) return undefined;
      try { return this.read(this.cursor_of(this.inner(rule.body) ?? rule.body), local); }
      catch (jump) {
        if (!(jump instanceof Jump)) throw jump;
        if (jump.site !== undefined && (Interpreter.within(jump.site, rule.body) || (rule.lexical !== undefined && Interpreter.within(jump.site, rule.lexical)))) {
          if (!jump.spelled) return jump.value;
          jump.spelled = false;
          jump.site = at;
        }
        throw jump;
      }
    } finally { this.depth--; this.running.pop(); }
  }
  running: Running[] = []
  static within(inner: Text.Node, outer: Text.Node): boolean { return inner.source === outer.source && inner.begin >= outer.begin && inner.end <= outer.end; }
  // What a capture says besides its name runs on the text it took.
  run_content(piece: Piece & { kind: 'capture' }, span: Text.Node, local: Node) {
    const scope = new Node(span);
    scope.parent = local;
    scope.set(piece.name, this.literal(span));
    this.quietly(() => this.safely(() => this.read(this.cursor_of(piece.content!), scope)));
  }
  private checking = new Set<Piece>();
  holds(piece: Piece & { kind: 'capture' }, span: Text.Node): Node | undefined {
    if (this.checking.has(piece)) return undefined;
    this.checking.add(piece);
    try { return this.checked(piece, span); } finally { this.checking.delete(piece); }
  }
  checked(piece: Piece & { kind: 'capture' }, span: Text.Node): Node | undefined {
    const scope = new Node(span);
    scope.parent = piece.within ?? this.GLOBAL;
    scope.set(piece.name, this.literal(span));
    const refused = this.diagnostics.refused;
    const value = this.quietly(() => this.safely(() => this.read(this.cursor_of(piece.content!), scope)));
    return this.diagnostics.refused > refused || value === undefined || this.deref(value)?.none ? undefined : value;
  }
  // The base's constructor runs once for every value made in reach of it.
  private constructed = new WeakSet<Node>();
  construct(value: Node) {
    const made = this.made?.code;
    if (made === undefined || this.constructed.has(value) || value.text || value.fn !== undefined || value.style !== undefined || value.code !== undefined || value.place !== undefined) return;
    this.constructed.add(value);
    const sees = value.sees;
    value.sees = [...(sees ?? []), made.in];
    const before = new Set(value.names?.keys() ?? []);
    try { this.safely(() => this.read(this.cursor_of(this.inner(made.span) ?? made.span), value)); }
    finally { value.sees = sees; }
    for (const key of value.names?.keys() ?? []) if (!before.has(key)) (value.given ??= new Set()).add(key);
  }

  // Values: a name is a place, read where it is bound; written code is read once, when asked for.
  place(frame: Node, at: Text.Node): Node { return Object.assign(new Node(at), { place: { in: frame, name: at.string } }); }
  lazy(span: Text.Node, frame: Node): Node { return Object.assign(new Node(span), { code: { span, in: frame } }); }
  literal(span: Text.Node): Node { return Object.assign(new Node(span), { text: true }); }
  literal_of(string: string, at?: Text.Node): Node { const node = this.literal(Text.Node.string(string)); if (at !== undefined) node.at = Object.assign(Text.Node.string(string), {}); return node; }
  bound(node: Node): Node | undefined {
    const { in: scope, name, member } = node.place!;
    return member ? this.member(scope, name) : this.lookup(scope, name, node.at);
  }
  deref(node: Node | undefined, report: boolean = true): Node | undefined {
    for (let depth = 0; node !== undefined && depth < 256; depth++) {
      if (node.place !== undefined) {
        const bound = this.bound(node);
        if (bound === undefined) {
          if (node.place.member) return this.NONE;
          if (report) this.error(`Unresolved \`${node.place.name}\`.`, node.at);
          return undefined;
        }
        node = bound;
        continue;
      }
      if (node.code !== undefined && !node.program) { node = this.force(node); continue; }
      return node;
    }
    return node;
  }
  // A value, or the place a name would be written to when nothing is written there yet.
  held(node: Node | undefined, stands?: Node): Node | undefined {
    for (let depth = 0; node !== undefined && depth < 256; depth++) {
      if (node === stands) return node;
      if (node.place !== undefined) { const bound = this.bound(node); if (bound === undefined) return node; node = bound; continue; }
      if (node.code !== undefined && !node.program) { node = this.force(node); continue; }
      return node;
    }
    return node;
  }
  force(node: Node): Node | undefined {
    if (node.value !== undefined) return node.value;
    const { span, in: frame } = node.code!;
    node.value = this.read(this.cursor_of(span), frame);
    this.forced.push(node);
    return node.value;
  }
  forced: Node[] = []
  text(node: Node | undefined): string {
    if (node === undefined) return '';
    if (node.style !== undefined) return node.style;
    if (node.place !== undefined) return node.place.name;
    if (node.code !== undefined) return node.code.span.string.trim();
    return node.at?.string ?? '';
  }
  // Where a name is written down: through the names it was handed, to the place they name.
  location(node: Node): Node | undefined {
    let at: Node | undefined = node, stood = false;
    for (let depth = 0; depth < 64 && at !== undefined; depth++) {
      if (at.code !== undefined && !at.program) {
        const word = at.code.span.string.trim();
        if (!/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word) && !/^[^\s\p{L}\p{N}_]+$/u.test(word)) { const read = this.force(at); if (read?.place === undefined) return at; at = read; continue; }
        at = this.place(at.code.in, at.code.span);
        continue;
      }
      if (at.place === undefined) return at;
      let holder = at.place.member ? at.place.in : this.near_holder(at.place.in, at.place.name);
      if (holder !== undefined && holder !== at.place.in && holder.given?.has(at.place.name) && at.at !== undefined) { const local = this.holding(at.at)?.local; if (local?.on?.given?.has(at.place.name) && this.reaches(at.place.in, local)) holder = local.on; }
      if (holder?.stands !== undefined && holder.given?.has(at.place.name)) { if (stood) return at; stood = true; at = holder.stands; continue; }
      const held = holder?.own(at.place.name);
      if (held === undefined || (held.place === undefined && held.code === undefined) || held.program) return at;
      if (held.code !== undefined && held.value !== undefined && held.value.place === undefined) return at;
      at = held;
    }
    return at;
  }
  declare(target: Node, value: Node | undefined, frame?: Node): Node | undefined {
    const at = this.location(target);
    if (at?.place === undefined) { this.error('Cannot declare `' + this.text(at ?? target) + '` here.', target.at); return value; }
    const held = this.held(value, frame?.stands);
    if (held === undefined) return undefined;
    const scope = at.place.in;
    if (scope.none) return held;
    scope.set(at.place.name, held);
    this.marked_place(at, scope);
    return held;
  }
  assign(target: Node, value: Node | undefined): Node | undefined {
    const at = this.location(target);
    const held = this.deref(value);
    if (held === undefined) return undefined;
    if (at?.place === undefined) {
      const into = this.deref(target, false);
      if (into?.style !== undefined) { this.alias(into.style, held); return held; }
      this.error('Cannot assign here.', target.at);
      return held;
    }
    const scope = at.place.member ? (this.deref(at.place.in) ?? at.place.in) : this.holder(at.place.in, at.place.name) ?? at.place.in;
    if (scope.none) return held;
    scope.set(at.place.name, held);
    this.marked_place(at, scope);
    return held;
  }
  get(node: Node, key: Node): Node | undefined {
    const target = this.deref(node);
    if (target === undefined) return undefined;
    const name = this.text(key);
    if (target.style !== undefined) return this.style(`${target.style}.${name}`);
    const rules = this.rules_on(target);
    const plain = rules.find(rule => rule.pattern.length === 1 && rule.pattern[0].kind === 'literal' && rule.pattern[0].text === name);
    if (plain !== undefined) return this.apply({ rule: plain, begin: 0, end: 0, reach: 0, captures: new Map(), literals: [], receiver: this.location(node) ?? node }, target, key.at ?? node.at!);
    const taking = rules.find(rule => rule.pattern.length === 2 && rule.pattern[0].kind === 'literal' && rule.pattern[0].text === name && rule.pattern[1].kind === 'capture');
    if (taking !== undefined) {
      const capture = (taking.pattern[1] as { name: string }).name, receiver = this.location(node) ?? node;
      return Object.assign(new Node(key.at), { fn: { arity: 1, fn: ({ interpreter, args: [argument], at }: Args) => {
        if (argument === undefined) return undefined;
        const span = argument.code?.span ?? argument.at ?? at;
        return interpreter.apply({ rule: taking, begin: 0, end: 0, reach: 0, captures: new Map([[capture, span]]), literals: [], receiver }, argument.code?.in ?? interpreter.GLOBAL, at);
      } } });
    }
    const place = Object.assign(new Node(key.at), { place: { in: target, name, member: true } });
    if (key.at !== undefined) this.paint_place(place);
    return place;
  }
  inline(node: Node, frame: Node, compose: boolean = false): Node | undefined {
    let target: Node | undefined = node;
    for (let depth = 0; depth < 64 && target !== undefined; depth++) {
      if (target.code !== undefined && !target.program) {
        const word = target.code.span.string.trim();
        if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word)) { const held = this.lookup(target.code.in, word); if (held !== undefined) { target = held; continue; } const read = this.force(target); if (read === undefined) return undefined; target = read; continue; }
        if (target.code.span.empty() || word === '') return undefined;
        if (!(frame.sees ??= []).includes(target.code.in) && frame !== target.code.in) frame.sees.unshift(target.code.in);
        const last = this.read(this.cursor_of(this.inner(target.code.span) ?? target.code.span), frame);
        const held = last === undefined ? undefined : this.deref(last, false);
        if (held?.program && !compose) return this.inline(held, frame);
        if (compose && held !== undefined && !held.text && !held.none && held.code === undefined && held !== frame) { (frame.with ??= []).push(held); this.version++; }
        return last;
      }
      if (target.place !== undefined) { target = this.bound(target); continue; }
      if (target.program) {
        if (!(frame.sees ??= []).includes(target.code!.in) && frame !== target.code!.in) frame.sees.unshift(target.code!.in);
        return this.read(this.cursor_of(target.code!.span), frame);
      }
      if (target.text) return compose || target.at === undefined || target.at.empty() ? target : this.read(this.cursor_of(target.at), frame);
      if (target !== frame && !target.none && !(frame.with ??= []).includes(target)) { frame.with.push(target); this.version++; }
      return target;
    }
    return target;
  }

  // Definitions: a head read by its brackets — text, `{ }` for a space, `{x}` capturing x.
  define(head: Text.Node, body: Text.Node | undefined, scope: Node, closure: Node = scope): Rule | undefined {
    const pieces = this.pieces(head, closure);
    if (pieces.length === 0) { this.error('Expected a pattern before `=>`.', head); return; }
    const key = pieces.map(piece => piece.kind === 'literal' ? piece.text : piece.kind === 'gap' ? '{ }' : `{${piece.name}}`).join('');
    const rule = new Rule(pieces, closure, head, key, this.order++, body);
    if (body !== undefined) {
      const word = this.token(this.cursor_of(body), body.begin);
      if (word > body.begin && body.source.value.slice(body.begin, word) === 'external' && this.lookup(closure, 'external') === this.EXTERNAL) {
        const name = this.token_end(this.cursor_of(body), this.spaces(this.cursor_of(body), word), closure);
        rule.native = body.source.value.slice(this.spaces(this.cursor_of(body), word), name);
      }
    }
    if (body !== undefined) for (const found of body.string.matchAll(/\bexternal\s+([^\s()]+)/g)) if (Natives[found[1]] === Natives.rule || Natives[found[1]] === Natives.define) rule.defines = true;
    this.add_rule(scope, rule);
    this.definitions.push(`${scope === this.GLOBAL ? 'GLOBAL' : ''}::${key}`);
    return rule;
  }
  pieces(span: Text.Node, frame: Node): Piece[] {
    const text = span.source.value, end = span.end + 1, out: Piece[] = [];
    const add = (piece: Piece, at: number) => { if (out.length > 0 && at > span.begin && !/\s/.test(text[at - 1])) piece.tight = true; out.push(piece); };
    const words = (from: number, to: number) => { for (const found of text.slice(from, to).matchAll(/\S+/g)) add({ kind: 'literal', text: found[0] }, from + found.index!); };
    let j = span.begin, run = j;
    while (j < end) {
      const close = text[j] === '{' ? this.group_end(text, j, end) : j;
      if (close <= j) { j++; continue; }
      words(run, j);
      let from = j + 1, to = close - 2;
      while (from <= to && /\s/.test(text[from])) from++;
      while (to >= from && /\s/.test(text[to])) to--;
      if (close - j === 2) add({ kind: 'literal', text: '{}' }, j);
      else if (text[from] === '{' && this.group_end(text, from, to + 1) === to + 1) { add({ kind: 'literal', text: '{' }, j); out.push(...this.pieces(span.span(from, to), frame)); out.push({ kind: 'literal', text: '}', tight: true }); }
      else {
        const piece = this.capture(span.span(j + 1, close - 2), frame);
        if (piece.kind === 'capture' && j > span.begin && !/\s/.test(text[j - 1]) && out[out.length - 1]?.kind === 'literal' && close < end && !/\s/.test(text[close])) piece.exact = true;
        add(piece, j);
      }
      j = run = close;
    }
    words(run, end);
    return out;
  }
  // A capture's content is code: its name is the first name it reads that nothing names.
  capture(content: Text.Node, frame: Node): Piece {
    const written = content.string.trim();
    if (written === '') return { kind: 'gap' };
    if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(written)) return { kind: 'capture', name: written, raw: false, typed: false, optional: false };
    const scope = new Node(content);
    scope.parent = frame;
    const hole = Object.assign(new Node(content), { text: true });
    const was = this.naming, trying = this.trying;
    this.naming = { scope, hole };
    this.trying = 0;
    let value: Node | undefined;
    const refused = this.diagnostics.refused;
    try { value = this.quietly(() => this.safely(() => this.read(this.cursor_of(content), scope))); }
    catch (jump) { if (!(jump instanceof Jump)) throw jump; }
    finally { this.naming = was; this.trying = trying; }
    const undecided = this.diagnostics.refused > refused;
    const name = scope.names === undefined ? undefined : [...scope.names].find(([, held]) => held === hole)?.[0];
    if (name === undefined) {
      const held = value === undefined ? undefined : this.quietly(() => this.deref(value));
      if (held?.text && held.at !== undefined) { const spelled = held.at.string; if (spelled.trim() === '' && !spelled.includes('\n')) return { kind: 'gap' }; return { kind: 'literal', text: spelled.includes('\n') && spelled.trim() === '' ? '\n' : spelled }; }
      return { kind: 'capture', name: written, raw: false, typed: false, optional: false, content };
    }
    const typed = scope.own(name) !== hole && scope.own(name) !== undefined;
    const optional = /\?/.test(written.replace(/`[^`]*`/g, '')) && !typed;
    return { kind: 'capture', name, raw: scope.raw === true, typed, optional, content, within: frame, undecided: undecided && !typed };
  }
  decide(piece: Piece & { kind: 'capture' }) {
    const again = this.capture(piece.content!, piece.within!);
    if (again.kind !== 'capture') { piece.undecided = false; return; }
    piece.typed = again.typed;
    piece.optional = again.optional;
    piece.undecided = again.undecided;
    piece.decided = this.version;
  }
  group_end(text: string, j: number, end: number): number {
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
    const close = pairs[text[j]];
    if (close === undefined) return j;
    let depth = 0;
    for (let k = j; k < end; k++) {
      if (text[k] === '`') { const q = text.indexOf('`', k + 1); if (q < 0 || q >= end) return j; k = q; continue; }
      if (pairs[text[k]] !== undefined) depth++;
      else if (Object.values(pairs).includes(text[k])) { depth--; if (depth === 0) return k + 1; }
    }
    return j;
  }
  // What a group encloses, when it encloses all of the span.
  inner(span: Text.Node): Text.Node | undefined {
    const text = span.source.value;
    let from = span.begin, to = span.end;
    while (from <= to && /\s/.test(text[from])) from++;
    while (to >= from && /\s/.test(text[to])) to--;
    if (from > to || (text[from] !== '(' && text[from] !== '{')) return undefined;
    const close = this.group_end(text, from, to + 1);
    return close === to + 1 ? span.span(from + 1, to - 1) : undefined;
  }
  // What a name was handed, as written: followed through names to the code they hold.
  written(node: Node | undefined): Node | undefined {
    for (let depth = 0; depth < 64 && node !== undefined; depth++) {
      if (node.code !== undefined && !node.program) {
        const word = node.code.span.string.trim();
        const held = /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word) ? this.lookup(node.code.in, word) : undefined;
        if (held === undefined || held === node || (held.code === undefined && held.place === undefined)) return node;
        node = held;
        continue;
      }
      if (node.place !== undefined) { const held = this.bound(node); if (held === undefined) return node; node = held; continue; }
      return node;
    }
    return node;
  }
  rule_from(given: Node, held: Node, at: Text.Node, frame: Node): Node | undefined {
    const pattern = this.written(given) ?? given, body = this.written(held) ?? held;
    const head = pattern.code?.span ?? pattern.at, written = body.code?.span ?? body.at;
    if (head === undefined || written === undefined) return undefined;
    const rule = this.define(head, written, pattern.code?.in ?? pattern.place?.in ?? frame);
    return rule === undefined ? undefined : this.rule_value(rule);
  }
  define_in(scope: Node, tail: Node, body: Node, at: Text.Node): Node | undefined {
    const place = this.location(scope);
    const spelled = this.text(this.deref(tail, false) ?? tail);
    body = this.written(body) ?? body;
    const written = body.code?.span ?? body.at;
    if (written === undefined) return undefined;
    if (place?.place !== undefined && !place.place.member) {
      const head = Object.assign(Text.Node.string(place.place.name + spelled), {});
      const rule = this.define(head, this.inner(written) ?? written, place.place.in, body.code?.in ?? place.place.in);
      if (rule !== undefined) rule.lexical = this.running[this.running.length - 1]?.at;
      return rule === undefined ? undefined : this.rule_value(rule);
    }
    const into = this.deref(scope, false);
    if (into === undefined || into.none) return undefined;
    const rule = this.define(Text.Node.string(spelled), this.inner(written) ?? written, into, body.code?.in ?? into);
    if (rule !== undefined) rule.lexical = this.running[this.running.length - 1]?.at;
    return rule === undefined ? undefined : this.rule_value(rule);
  }
  private rule_values = new WeakMap<Rule, Node>();
  rule_value(rule: Rule): Node {
    let node = this.rule_values.get(rule);
    if (node === undefined) { node = new Node(rule.at); this.rule_values.set(rule, node); this.rules_by_value.set(node, rule); }
    return node;
  }
  rules_by_value = new WeakMap<Node, Rule>();

  external(name: Node | undefined, frame: Node): Node | undefined {
    if (name === undefined) return undefined;
    const key = this.text(name), native = Natives[key];
    if (native === undefined) { this.error(`Expected method \`${key}\` to be externally defined by the runtime, but it wasn't.`, name.at); return undefined; }
    const node = Object.assign(new Node(name.at), { fn: native });
    if (native.arity === 0) return native.fn({ interpreter: this, frame, args: [], at: name.at! });
    return node;
  }

  // Passes: the entrypoint is read twice, so what it writes later is known where it is read first.
  definitions: string[] = [];
  interpret(srcs: Text.Source[]) { for (const _ of this.derive(srcs)); }
  *derive(srcs: Text.Source[]): Generator<void> {
    const derived = this.copy_of !== undefined;
    if (this.copy_of !== undefined) { this.clone_from(this.copy_of); this.copy_of = undefined; }
    this.begin_pass();
    const mine = srcs.filter(src => !derived || this.owns(src));
    for (const src of mine) {
      this.read_source(src);
      if (src.is_entrypoint) this.read_source(src);
      yield;
    }
    for (const src of mine) {
      if (src.is_entrypoint || ![...this.diagnostics.of(src)].some(entry => entry.message.startsWith('Unresolved'))) continue;
      this.read_source(src);
      yield;
    }
    this.end_pass();
  }
  read_source(src: Text.Source) {
    this.diagnostics.forget(src);
    try { this.safely(() => this.read(new Text.Node(src), this.GLOBAL)); }
    catch (jump) { if (!(jump instanceof Jump)) throw jump; this.error(`No \`${jump.label}\` to jump to.`); }
  }
  async interpret_async(srcs: Text.Source[], alive: () => boolean): Promise<boolean> {
    const run = this.derive(srcs);
    for (let step = run.next(); !step.done; step = run.next()) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (!alive()) return false;
    }
    return true;
  }
  feedback(src: Text.Source) { this.read_source(src); this.painted_count++; }
  copy(): Interpreter { const copy = new Interpreter(this.diagnostics); copy.copy_of = this; return copy; }
  clone_from(from: Interpreter) {
    const seen = new Map<Node, Node>();
    const rules = new Map<Rule, Rule>();
    const node = (n: Node | undefined): Node | undefined => {
      if (n === undefined) return undefined;
      const known = seen.get(n);
      if (known !== undefined) return known;
      const copy = Object.assign(new Node(), n);
      seen.set(n, copy);
      copy.parent = node(n.parent);
      if (n.with) copy.with = n.with.map(x => node(x)!);
      if (n.sees) copy.sees = n.sees.map(x => node(x)!);
      if (n.names) copy.names = new Map([...n.names].map(([k, v]) => [k, node(v)!]));
      if (n.rules) copy.rules = n.rules.map(rule);
      if (n.code) copy.code = { span: n.code.span, in: node(n.code.in)! };
      if (n.place) copy.place = { ...n.place, in: node(n.place.in)! };
      if (n.value) copy.value = node(n.value);
      return copy;
    };
    const rule = (r: Rule): Rule => {
      const known = rules.get(r);
      if (known !== undefined) return known;
      const copy = Object.assign(Object.create(Rule.prototype), r) as Rule;
      rules.set(r, copy);
      copy.closure = node(r.closure)!;
      copy.home = node(r.home);
      return copy;
    };
    this.GLOBAL = node(from.GLOBAL)!;
    this.NONE = node(from.NONE)!;
    this.EXTERNAL = node(from.EXTERNAL)!;
    this.BASE = node(from.BASE);
    this.made = node(from.made);
    this.theme = node(from.theme);
    this.order = from.order;
    this.version++;
  }

  // Painting: what is read is painted by the marks on what it names, on its value, or on the rule that read it.
  serving = false
  paints: Text.Node[] = []
  sites: Map<string, Text.Node> = new Map()
  painted_count = 0
  get painted() { return this.painted_count; }
  theme?: Node
  building?: Node
  private names_marked = new WeakMap<Node, Map<string, Node>>();
  private values_marked = new WeakMap<Node, Node>();
  begin_pass() { this.paints = []; this.sites = new Map(); }
  end_pass() { this.painted_count++; }
  paint(span: Text.Node | undefined, style: () => string | undefined) {
    if (!this.program?.serving || span === undefined || span.source.location === undefined || !this.owns(span.source)) return;
    const painted = span.span(span.begin, span.end);
    painted.style = style;
    this.paints.push(painted);
  }
  paint_place(place: Node) {
    if (!this.program?.serving) return;
    this.paint(place.at, () => { const marks = (place as { marks?: Node }).marks; if (marks) return marks.style; const scope = place.place!.member ? place.place!.in : this.holder(place.place!.in, place.place!.name); const named = scope && this.names_marked.get(scope)?.get(place.place!.name); if (named) return named.style; const value = this.quietly(() => this.deref(place, false)); return value && this.values_marked.get(value)?.style; });
  }
  paint_rule(found: Match, at: Text.Node) {
    const style = found.rule.style;
    if (style !== undefined) for (const [from, to] of found.literals) this.paint(at.span(from, to), () => style.style);
  }
  decorate(target: Node, style: Node): Node {
    const rule = this.rules_by_value.get(target);
    if (rule !== undefined) { rule.style = style; return target; }
    if (target.place !== undefined) { const marked = Object.assign(new Node(target.at), { place: target.place, marks: style }); this.paint(target.at, () => style.style); return marked; }
    if (target.code !== undefined && target.value === undefined) { this.paint(target.code.span, () => style.style); return target; }
    if (target.text) { this.paint(target.at, () => style.style); return target; }
    this.values_marked.set(target, style);
    return target;
  }
  marked_place(at: Node, scope: Node) {
    const marks = (at as { marks?: Node }).marks;
    if (marks === undefined) return;
    let names = this.names_marked.get(scope);
    if (names === undefined) this.names_marked.set(scope, names = new Map());
    names.set(at.place!.name, marks);
  }
  style(name: string): Node {
    const node = new Node();
    node.style = name;
    node.fn = { arity: 1, fn: ({ interpreter, args: [target] }: Args) => target === undefined ? undefined : interpreter.decorate(target.code !== undefined && !target.program && interpreter.location(target)?.place !== undefined ? interpreter.location(target)! : target, node) };
    return node;
  }
  alias(name: string, value: Node) {
    if (value.style === undefined) return;
    const table = this.building ?? (this.theme ??= Object.assign(new Node(), { theme: new Map<string, string>() }));
    table.theme!.set(name, value.style);
  }
  colors(): Map<string, string> {
    const table = this.theme?.theme ?? new Map<string, string>();
    const resolve = (name: string, seen: Set<string> = new Set()): string | undefined => {
      if (name.startsWith('#')) return name;
      if (seen.has(name)) return undefined;
      seen.add(name);
      const next = table.get(name);
      if (next !== undefined) return resolve(next, seen);
      const dot = name.lastIndexOf('.');
      return dot > 0 ? resolve(name.slice(0, dot), seen) : undefined;
    };
    const out = new Map<string, string>();
    for (const name of table.keys()) { const color = resolve(name); if (color) out.set(name, color); }
    return out;
  }
  color(name: string | undefined): string | undefined {
    if (name === undefined) return undefined;
    if (name.startsWith('#')) return name;
    const colors = this.colors();
    for (let n = name; n; n = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : '') { const color = colors.get(n); if (color) return color; }
  }
  style_of(rule: Rule): string | undefined { return rule.style?.style; }
  *definitions_of(): Generator<[Rule, Rule]> { for (const scope of this.scopes(this.GLOBAL)) for (const rule of scope.rules ?? []) yield [rule, rule]; }

  // Diagnostics.
  error(message: string, at?: Text.Node) { this.complain('error', message, at); }
  complain(level: Diagnostic['level'], message: string, at?: Text.Node) { this.diagnostics.report({ level, message, node: at, at }); }
  quietly<T>(fn: () => T): T { return this.diagnostics.muted(fn); }
  safely<T>(fn: () => T): T | undefined {
    try { return fn(); }
    catch (e) {
      if (e instanceof Recursion) { this.error('This keeps applying itself.', e.at); return undefined; }
      if (e instanceof RangeError) { this.error('This statement nests deeper than the runtime can follow.', this.reading); return undefined; }
      throw e;
    }
  }
  cursor_of(span: Text.Node): Text.Node { const cursor = new Text.Node(span.source); cursor.cursor = span.begin; cursor.until = span.end + 1; return cursor; }
}
