import { Text } from './text.ts';
import type { Called, Unit } from './compile/ir.ts';
import { applied, called, named } from './compile/record.ts';
import { type Event, type Replayed, type Variant, replay } from './compile/graph.ts';
import { evaluate, type Ran } from './compile/evaluate.ts';
import { reduce, run, type Body } from './compile/body.ts';
import { Boot } from './boot.ts';
import { env } from './env.ts';
import { Diagnostics, type Diagnostic } from './diagnostics.ts';
import { Natives } from './natives.ts';
import type { Program } from './program.ts';

export type { Diagnostic };
export type Args = { interpreter: Interpreter; frame: Node; args: Node[]; at: Text.Node; self?: Node };
export type Native = { arity: number; fn: (args: Args) => Node | undefined; raw?: boolean; recipe?: unknown[] };
export type Piece = (
  | { kind: 'literal'; text: string }
  | { kind: 'gap' }
  | { kind: 'capture'; name: string; raw: boolean; typed: boolean; optional: boolean; exact?: boolean; content?: Text.Node; within?: Node; undecided?: boolean; decided?: number; type?: Node; operator?: boolean }
) & { tight?: boolean };

export type NameGuard = Variant & { own?: object; parent?: Node; sees?: Node[]; self?: { rules: object; mine: object; on: object }; declared?: number };
export type Slot = { parent: Node; sees?: Node[]; holder?: Node; valid: boolean };
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
  body?: Text.Node
  bare?: boolean
  on?: Node
  given?: Set<string>
  constructed?: boolean
  rule_of?: Rule
  marked_names?: Map<string, Node>
  marked_value?: Node
  layout?: number
  visited?: number
  reached?: number
  held_by?: number
  heading?: { rules: Rule[]; decided: object; heads: Rule[] }
  scoped?: { deps: Node[]; stamps: number[]; rules: Rule[] }
  ruled?: { base?: Node; deps: Node[]; stamps: number[]; rules: Rule[] }
  shaped?: { of: Rule[]; based: Set<Rule>; shape: { rules: Rule[]; mine: Rule[]; on: Rule[] } }
  watchers?: Map<string, Variant[]>
  constructor(at?: Text.Node) { this.at = at; }
  own(name: string): Node | undefined { return this.names?.get(name); }
  watching?: Map<string, Slot[]>
  static sets = 0;
  // Every name some scope other than a global one has held: a name outside it is found in the global scope or nowhere.
  static scoped = new Set<string>();
  static globals = new WeakSet<Node>();
  static complete = true;
  set(name: string, value: Node): Node {
    Node.sets++;
    if (!Node.globals.has(this)) Node.scoped.add(name);
    const names = (this.names ??= new Map());
    if (this.watching !== undefined && !names.has(name)) { const slots = this.watching.get(name); if (slots !== undefined) { for (const slot of slots) slot.valid = false; this.watching.delete(name); } }
    names.set(name, value);
    return value;
  }
}

export class Rule {
  static count = 0
  id = ++Rule.count
  native?: string
  direct?: Text.Node[]
  passes?: Text.Node
  style?: Node
  defines = false
  home?: Node
  lexical?: Text.Node
  implicit = false
  template?: { id: number }
  value_node?: Node
  // What the captured values must fit: a method's parameter pattern.
  guard?: { span: Text.Node; in: Node }
  // Written beside other definitions of the same name: its parameters choose between them.
  overloaded = false
  inner_body?: Text.Node
  reduced?: Body
  applications = 0
  fitting?: { declared: number; rules: number; found?: { names: string[]; refused: boolean; value?: Node }; by: Map<Node, { fit: boolean; on: Rule[] }> }
  get name(): string { return this.pattern.map(piece => piece.kind === 'literal' ? piece.text : piece.kind === 'gap' ? '{ }' : `{${piece.name}}`).join(''); }
  constructor(public pattern: Piece[], public closure: Node, public at: Text.Node, public key: string, public order: number, public body?: Text.Node, public fn?: Native) {}
  get leading(): boolean { return this.pattern[0]?.kind === 'capture'; }
  // A leading capture with a type is a pattern over text.
  get reads(): boolean { const first = this.pattern[0]; return first?.kind === 'capture' && (first.typed || first.undecided === true); }
  private enclosing?: boolean;
  get enclosed(): boolean { if (this.enclosing === undefined) { const first = this.pattern[0], last = this.pattern[this.pattern.length - 1]; this.enclosing = this.pattern.length >= 3 && first.kind === 'literal' && last.kind === 'literal' && !Interpreter.word.test(first.text[0] ?? 'a'); } return this.enclosing; }
  // A spelling that takes the one thing written after it.
  private heads?: [string | undefined, string | undefined];
  head(receiving: boolean): string | undefined {
    const pieces = this.pattern;
    this.heads ??= [pieces[0]?.kind === 'literal' ? pieces[0].text : undefined, pieces[0]?.kind === 'literal' ? pieces[0].text : pieces[0]?.kind === 'capture' && !this.implicit && pieces[1]?.kind === 'literal' ? pieces[1].text : undefined];
    return this.heads[receiving ? 1 : 0];
  }
  private later?: string[];
  spelled_within(text: string, from: number, limit: number): boolean {
    this.later ??= this.pattern.slice(1).filter((piece): piece is Piece & { kind: 'literal' } => piece.kind === 'literal' && piece.text.trim() !== '').map(piece => piece.text.trim());
    for (const literal of this.later) { const at = text.indexOf(literal, from); if (at < 0 || at + literal.length > limit) return false; }
    return true;
  }
  get operator(): string | undefined { const [first, second] = this.pattern; return this.pattern.length === 2 && first.kind === 'literal' && second.kind === 'capture' && !Interpreter.word.test(first.text[0] ?? 'a') ? first.text : undefined; }
}

export class Heads {
  private by = new Map<string, number[]>();
  private open: number[] = [];
  private cached = new Map<string, number[]>();
  constructor(rules: Rule[], receiving: boolean) {
    rules.forEach((rule, k) => {
      const head = rule.head(receiving);
      if (head === undefined || head === '') this.open.push(k);
      else { const first = head[0]; const list = this.by.get(first); if (list === undefined) this.by.set(first, [k]); else list.push(k); }
    });
  }
  at(here: string, after: string): number[] {
    const key = here + after;
    let held = this.cached.get(key);
    if (held === undefined) {
      const found = new Set<number>(this.open);
      for (const k of this.by.get(here) ?? []) found.add(k);
      if (after !== '') for (const k of this.by.get(after) ?? []) found.add(k);
      held = [...found].sort((a, b) => a - b);
      this.cached.set(key, held);
    }
    return held;
  }
}

export type Running ={ found: Match; at: Text.Node; local?: Node; site?: Text.Node };
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
  declared = 0
  private order = 0
  private depth = 0
  reading?: Text.Node

  constructor(public diagnostics: Diagnostics) {
    this.GLOBAL = new Node();
    Node.globals.add(this.GLOBAL);
    this.NONE = Object.assign(new Node(), { none: true });
    this.EXTERNAL = this.GLOBAL.set('external', Object.assign(new Node(), { fn: this.rebuild(['external']) }));
    const seed = new Rule([{ kind: 'capture', name: 'pattern', raw: false, typed: false, optional: false }, { kind: 'literal', text: '=>' }, { kind: 'capture', name: 'body', raw: false, typed: false, optional: false }], this.GLOBAL, Text.Node.string('{pattern} => {body}'), '', this.order++, undefined, Natives.rule);
    seed.native = 'rule';
    seed.defines = true;
    this.add_rule(this.GLOBAL, seed);
  }

  // Lookup: a scope's own names, then what it sees (and what those see), then what it is made of, then its parent. The outermost answers last.
  *scopes(from: Node, written?: Text.Node): Generator<Node> {
    const seen = new Set<Node>();
    const sees_of = (scope: Node): Node[] => written !== undefined && scope.body !== undefined && Interpreter.within(written, scope.body) ? [] : scope.sees ?? [];
    const visit = function* (scope: Node, deep: boolean, global: Node): Generator<Node> {
      const later: Node[] = [];
      for (let at: Node | undefined = scope; at !== undefined; at = deep ? at.parent : undefined) {
        if (seen.has(at)) { if (!deep) break; continue; }
        if (at === global) break;
        seen.add(at);
        yield at;
        for (const sees of sees_of(at)) if (!seen.has(sees)) yield sees;
        for (const made of at.on === undefined ? at.with ?? [] : [at.on, ...(at.with ?? [])]) yield* visit(made, false, global);
        if (deep) later.push(...sees_of(at));
      }
      for (const sees of later) yield* visit(sees, true, global);
    };
    yield* visit(from, true, this.GLOBAL);
    if (!seen.has(this.GLOBAL)) { seen.add(this.GLOBAL); yield this.GLOBAL; for (const made of this.GLOBAL.with ?? []) yield* visit(made, false, this.GLOBAL); }
  }
  // An interpreter that is no copy reaches no global scope but its own.
  single = true;
  private naming?: { scope: Node; hole: Node; name?: string; names?: string[]; first?: Node };
  hole(node: Node): boolean { return this.naming?.hole === node; }
  private trying = 0;
  tried<T>(fn: () => T): T { this.trying++; try { return fn(); } finally { this.trying--; } }
  // What the base gave a value is seen from that value and from what is made of it, not from code written around it.
  lookup(frame: Node, name: string, at?: Text.Node): Node | undefined {
    if (at !== undefined && this.given_names.has(name) && !this.written_in(frame, name)) {
      const local = this.holding(at)?.local;
      if (local?.on?.given?.has(name) && this.reaches(frame, local)) return local.on.own(name);
    }
    if (this.single && Node.complete && !Node.scoped.has(name)) { const global = this.GLOBAL.own(name); if (global !== undefined) return global; }
    const seen = ++this.visits;
    const found = at !== undefined && frame.parent !== undefined && frame !== this.GLOBAL && this.stable_sites.has(at) ? this.seek(frame, false, false, name, at, seen) ?? this.slotted(frame.parent, this.sees_of(frame, at), name, at, seen) : this.seek(frame, false, true, name, at, seen);
    if (found !== undefined) return found;
    const global = this.GLOBAL.own(name);
    if (global !== undefined) return global;
    for (const made of this.GLOBAL.with ?? []) { const held = this.seek(made, false, false, name, at, seen); if (held !== undefined) return held; }
    if (this.naming !== undefined && (this.naming.name === undefined || this.naming.names !== undefined) && frame === this.naming.scope && (this.naming.names === undefined ? this.trying === 0 : Interpreter.word.test(name[0]))) { const first = this.naming.names?.length === 0 ? this.naming.first : undefined; this.naming.name ??= name; this.naming.names?.push(name); return frame.set(name, first ?? this.naming.hole); }
  }
  static nowhere: Node[] = [];
  sees_of(scope: Node, written: Text.Node | undefined): Node[] { return written !== undefined && scope.body !== undefined && Interpreter.within(written, scope.body) ? Interpreter.nowhere : scope.sees ?? Interpreter.nowhere; }
  private visits = 0;
  given_names = new Set<string>();
  stable_sites = new WeakSet<Text.Node>();
  stable(span: Text.Node): Text.Node { this.stable_sites.add(span); return span; }
  private slots = new WeakMap<Text.Node, Slot>();
  private collecting?: Node[];
  found_in?: Node;
  slotted(parent: Node, sees: Node[], name: string, at: Text.Node, seen: number): Node | undefined {
    const slot = this.slots.get(at);
    if (slot !== undefined && slot.valid && slot.parent === parent && (slot.sees === undefined ? sees.length === 0 : slot.sees.length === sees.length && slot.sees.every((node, n) => node === sees[n]))) return slot.holder?.own(name);
    const collecting = this.collecting;
    this.collecting = [];
    this.found_in = undefined;
    let found: Node | undefined, visited: Node[];
    try {
      found = this.seek(parent, true, true, name, at, seen, sees);
      if (found === undefined) {
        this.collecting.push(this.GLOBAL);
        found = this.GLOBAL.own(name);
        if (found !== undefined) this.found_in = this.GLOBAL;
        else for (const made of this.GLOBAL.with ?? []) { found = this.seek(made, false, false, name, at, seen); if (found !== undefined) break; }
      }
    } finally { visited = this.collecting; this.collecting = collecting; }
    if (collecting !== undefined) collecting.push(...visited);
    const made: Slot = { parent, sees: sees.length === 0 ? undefined : [...sees], holder: found === undefined ? undefined : this.found_in, valid: true };
    if (found !== undefined && made.holder?.own(name) !== found) return found;
    for (const node of visited) { const watching = (node.watching ??= new Map()); const list = watching.get(name); if (list === undefined) watching.set(name, [made]); else { list.push(made); if (list.length >= 64 && (list.length & (list.length - 1)) === 0) watching.set(name, list.filter((slot: Slot) => slot.valid)); } }
    if (slot !== undefined) slot.valid = false;
    this.slots.set(at, made);
    return found;
  }
  seek(scope: Node | undefined, lexical: boolean, deep: boolean, name: string, written: Text.Node | undefined, seen: number, first?: Node[]): Node | undefined {
    let later: Node[] | undefined = first !== undefined && first.length > 0 ? [...first] : undefined;
    for (let at = scope; at !== undefined; at = deep ? at.parent : undefined) {
      if (at.visited === seen || at === this.GLOBAL) { if (!deep) break; continue; }
      at.visited = seen;
      this.collecting?.push(at);
      const found = at.own(name);
      if (found !== undefined && !(lexical && at.given?.has(name))) { this.found_in = at; return found; }
      const sees = this.sees_of(at, written);
      if (sees.length > 0) { const held = this.seen_own(sees, name, written, seen); if (held !== undefined) return held; }
      if (at.on !== undefined) { const held = this.seek(at.on, false, false, name, written, seen); if (held !== undefined) return held; }
      if (at.with !== undefined) for (const made of at.with) { const held = this.seek(made, false, false, name, written, seen); if (held !== undefined) return held; }
      if (deep && sees.length > 0) (later ??= []).push(...sees);
      lexical = true;
    }
    if (later !== undefined) for (const sees of later) { const held = this.seek(sees, true, true, name, written, seen); if (held !== undefined) return held; }
  }
  // What a frame sees, and what those see in turn: the frames its code was written in, nearest first.
  seen_own(sees: Node[], name: string, written: Text.Node | undefined, seen: number): Node | undefined {
    let deeper: Node[] | undefined, walked: Set<Node> | undefined;
    for (const other of sees) {
      this.collecting?.push(other);
      const held = other.own(name);
      if (held !== undefined && !other.given?.has(name) && other.visited !== seen) { this.found_in = other; return held; }
      const further = this.sees_of(other, written);
      if (further.length > 0) (deeper ??= []).push(...further);
    }
    while (deeper !== undefined && deeper.length > 0) {
      walked ??= new Set(sees);
      const next: Node[] = [];
      for (const other of deeper) {
        if (walked.has(other)) continue;
        walked.add(other);
        this.collecting?.push(other);
        const held = other.own(name);
        if (held !== undefined && !other.given?.has(name) && other.visited !== seen) { this.found_in = other; return held; }
        next.push(...this.sees_of(other, written));
      }
      deeper = next;
    }
  }
  private seen_holder(sees: Node[], name: string, written: Text.Node | undefined, seen: number): Node | undefined {
    const walked = new Set<Node>();
    for (let level = sees; level.length > 0;) {
      const next: Node[] = [];
      for (const other of level) {
        if (walked.has(other)) continue;
        walked.add(other);
        if (other.held_by !== seen && other.own(name) !== undefined) return other;
        next.push(...this.sees_of(other, written));
      }
      level = next;
    }
  }
  private reaching = 0;
  private reach_stack: Node[] = [];
  reaches(frame: Node, target: Node): boolean {
    const seen = ++this.reaching, todo = this.reach_stack;
    todo.length = 0;
    todo.push(frame);
    while (todo.length > 0) {
      const at = todo.pop()!;
      if (at === target) return true;
      if (at.reached === seen || at === this.GLOBAL) continue;
      at.reached = seen;
      if (at.parent) todo.push(at.parent);
      if (at.sees) for (const other of at.sees) todo.push(other);
    }
    return false;
  }
  written_in(frame: Node, name: string): boolean { return (frame.own(name) !== undefined && !frame.given?.has(name)) || (frame.sees ?? []).some(sees => sees.own(name) !== undefined && !sees.given?.has(name)); }
  // Where a frame holds a name itself or through what it is made of: where a declaration may follow it.
  near_holder(frame: Node, name: string): Node | undefined {
    if (frame.own(name) !== undefined) return frame;
    for (const made of frame.on === undefined ? frame.with ?? [] : [frame.on, ...(frame.with ?? [])]) if (made.own(name) !== undefined && made.given?.has(name)) return made;
  }
  private holding_seen = 0;
  holder(frame: Node, name: string, written?: Text.Node): Node | undefined {
    const seen = ++this.holding_seen;
    const found = this.holder_in(frame, true, this.GLOBAL, name, written, seen);
    if (found !== undefined) return found;
    if (this.GLOBAL.held_by === seen) return undefined;
    this.GLOBAL.held_by = seen;
    if (this.GLOBAL.own(name) !== undefined) return this.GLOBAL;
    for (const made of this.GLOBAL.with ?? []) { const held = this.holder_in(made, false, this.GLOBAL, name, written, seen); if (held !== undefined) return held; }
  }
  private holder_in(scope: Node, deep: boolean, global: Node, name: string, written: Text.Node | undefined, seen: number): Node | undefined {
    let later: Node[] | undefined;
    for (let at: Node | undefined = scope; at !== undefined; at = deep ? at.parent : undefined) {
      if (at.held_by === seen) { if (!deep) break; continue; }
      if (at === global) break;
      at.held_by = seen;
      if (at.own(name) !== undefined) return at;
      const sees = this.sees_of(at, written);
      if (sees.length > 0) { const other = this.seen_holder(sees, name, written, seen); if (other !== undefined) return other; }
      if (at.on !== undefined) { const held = this.holder_in(at.on, false, global, name, written, seen); if (held !== undefined) return held; }
      if (at.with !== undefined) for (const made of at.with) { const held = this.holder_in(made, false, global, name, written, seen); if (held !== undefined) return held; }
      if (deep && sees.length > 0) (later ??= []).push(...sees);
    }
    if (later !== undefined) for (const other of later) { const held = this.holder_in(other, true, global, name, written, seen); if (held !== undefined) return held; }
  }
  member(of: Node, name: string): Node | undefined {
    const own = of.own(name);
    if (own !== undefined || of.with === undefined) return own;
    return this.member_in(of, name, ++this.visits);
  }
  private member_in(node: Node, name: string, seen: number): Node | undefined {
    if (node.visited === seen) return;
    node.visited = seen;
    const own = node.own(name);
    if (own !== undefined) return own;
    if (node.with !== undefined) for (const made of node.with) { const found = this.member_in(made, name, seen); if (found !== undefined) return found; }
  }

  // Rules in reach: the scope chain's, and for a value, what it and the base are made of.
  notify(scope: Node, rule?: Rule) {
    const watchers = scope.watchers;
    if (watchers === undefined) return;
    const chars = rule === undefined || rule.enclosed || rule.operator !== undefined ? undefined : [rule.head(false)?.[0], rule.head(true)?.[0]];
    if (chars === undefined || chars.some(char => char === undefined)) { for (const list of watchers.values()) for (const variant of list) variant.valid = false; scope.watchers = undefined; return; }
    for (const char of chars) { const list = watchers.get(char!); if (list === undefined) continue; for (const variant of list) variant.valid = false; watchers.delete(char!); }
  }
  watch(variant: Variant, frame: Node, cursor: Text.Node, positions: number[]) {
    const text = cursor.source.value, chars = new Set<string>();
    for (const at of positions) { chars.add(text[at] ?? ''); chars.add(text[this.spaces(cursor, at)] ?? ''); }
    const nodes = [...this.deps_of(frame)];
    if (this.BASE !== undefined) { this.rules_made(this.BASE); nodes.push(...(this.BASE.ruled?.deps ?? [])); }
    for (const node of nodes) {
      const watchers = (node.watchers ??= new Map());
      for (const char of chars) { const list = watchers.get(char); if (list === undefined) watchers.set(char, [variant]); else { list.push(variant); if (list.length >= 64 && (list.length & (list.length - 1)) === 0) watchers.set(char, list.filter((other: Variant) => other.valid)); } }
    }
  }
  static touch(node: Node) {
    node.layout = (node.layout ?? 0) + 1;
    if (node.watching !== undefined) { for (const slots of node.watching.values()) for (const slot of slots) slot.valid = false; node.watching = undefined; }
  }
  static current(held: { deps: Node[]; stamps: number[] } | undefined): boolean {
    if (held === undefined) return false;
    const { deps, stamps } = held;
    for (let k = 0; k < deps.length; k++) if ((deps[k].layout ?? 0) !== stamps[k]) return false;
    return true;
  }
  rules_of(frame: Node): Rule[] {
    if (frame.parent !== undefined && frame.parent !== frame && !frame.rules?.length && !frame.sees?.length) return this.rules_of(frame.parent);
    if (frame.parent !== undefined && frame.parent !== frame && !frame.rules?.length && frame.sees?.length === 1 && frame.sees[0] !== frame) return this.rules_seen(frame.parent, frame.sees[0]);
    const held = frame.scoped;
    if (Interpreter.current(held)) return held!.rules;
    const rules: Rule[] = [], seen = new Set<Node>(), deps: Node[] = [], stamps: number[] = [];
    const visit = (scope: Node | undefined) => {
      for (let at = scope; at !== undefined && !seen.has(at); at = at.parent) {
        seen.add(at);
        deps.push(at); stamps.push(at.layout ?? 0);
        if (at.rules) for (let k = at.rules.length - 1; k >= 0; k--) rules.push(at.rules[k]);
        for (const sees of at.sees ?? []) visit(sees);
      }
    };
    visit(frame);
    const shared = this.canonical(rules);
    frame.scoped = { deps, stamps, rules: shared };
    return shared;
  }
  deps_of(frame: Node): Node[] {
    this.rules_of(frame);
    let at = frame;
    while (true) {
      if (at.parent !== undefined && at.parent !== at && !at.rules?.length && !at.sees?.length) { at = at.parent; continue; }
      if (at.parent !== undefined && at.parent !== at && !at.rules?.length && at.sees?.length === 1 && at.sees[0] !== at) return this.seen_rules.get(at.parent)?.get(at.sees[0])?.deps ?? [];
      if (at.scoped === undefined && at.parent !== undefined && at.parent !== at) { at = at.parent; continue; }
      return at.scoped?.deps ?? [];
    }
  }
  private seen_rules = new WeakMap<Node, WeakMap<Node, { deps: Node[]; stamps: number[]; rules: Rule[] }>>();
  // A frame holding nothing of its own that sees one other frame: what it reaches is that frame's then its parent's, the same for every such frame.
  rules_seen(parent: Node, sees: Node): Rule[] {
    let by = this.seen_rules.get(parent);
    if (by === undefined) this.seen_rules.set(parent, by = new WeakMap());
    const held = by.get(sees);
    if (Interpreter.current(held)) return held!.rules;
    const rules: Rule[] = [], seen = new Set<Node>(), deps: Node[] = [], stamps: number[] = [];
    const visit = (scope: Node | undefined) => {
      for (let at = scope; at !== undefined && !seen.has(at); at = at.parent) {
        seen.add(at);
        deps.push(at); stamps.push(at.layout ?? 0);
        if (at.rules) for (let k = at.rules.length - 1; k >= 0; k--) rules.push(at.rules[k]);
        for (const other of at.sees ?? []) visit(other);
      }
    };
    visit(sees);
    visit(parent);
    const shared = this.canonical(rules);
    by.set(sees, { deps, stamps, rules: shared });
    return shared;
  }
  private decided_at?: { declared: number };
  decisions(): object {
    if (this.decided_at?.declared !== this.declared) this.decided_at = { declared: this.declared };
    return this.decided_at;
  }
  private canonicals = new Map<number, Rule[][]>();
  canonical(rules: Rule[]): Rule[] {
    let hash = rules.length;
    for (const rule of rules) hash = (Math.imul(hash, 31) + rule.id) | 0;
    const bucket = this.canonicals.get(hash);
    if (bucket === undefined) { this.canonicals.set(hash, [rules]); return rules; }
    for (const held of bucket) {
      if (held.length !== rules.length) continue;
      let same = true;
      for (let k = 0; same && k < rules.length; k++) same = held[k] === rules[k];
      if (same) return held;
    }
    bucket.push(rules);
    return rules;
  }
  rules_on(value: Node): Rule[] { return this.rules_made(value); }
  rules_made(value: Node): Rule[] {
    if (value !== this.BASE && value !== this.GLOBAL && !value.rules?.length && value.with?.length === 1 && value.with[0] !== value) return this.rules_made(value.with[0]);
    if (value !== this.BASE && value !== this.GLOBAL && !value.rules?.length && !value.with?.length && this.BASE !== undefined) return this.rules_made(this.BASE);
    const held = value.ruled;
    if (held?.base === this.BASE && Interpreter.current(held)) return held!.rules;
    const rules: Rule[] = [], seen = new Set<Node>(), deps: Node[] = [], stamps: number[] = [];
    const visit = (node: Node) => {
      if (seen.has(node) || node === this.GLOBAL) return;
      seen.add(node);
      deps.push(node); stamps.push(node.layout ?? 0);
      if (node.rules) for (let k = node.rules.length - 1; k >= 0; k--) rules.push(node.rules[k]);
      for (const made of node.with ?? []) visit(made);
    };
    visit(value);
    if (this.BASE !== undefined) visit(this.BASE);
    const shared = this.canonical(rules);
    value.ruled = { base: this.BASE, deps, stamps, rules: shared };
    return shared;
  }
  private named = new Map<string, Rule[]>();
  add_rule(scope: Node, rule: Rule) {
    if (this.program?.serving && rule.body !== undefined && this.painting(rule.body.source)) this.bodies.add(rule);
    if (this.program?.serving && this.painting(rule.at.source)) this.paint_head(rule, rule.style);
    const rules = (scope.rules ??= []);
    rule.home = scope;
    rule.implicit = scope !== this.GLOBAL && rule.leading && (rule.pattern.length === 1 || rule.pattern[1].kind === 'gap');
    if (rule.guard !== undefined) {
      const named = this.named.get(rule.name) ?? [];
      named.push(rule);
      this.named.set(rule.name, named);
      if (named.some(other => other.key !== rule.key)) for (const other of named) other.overloaded = true;
    }
    const same = rules.findIndex(other => other.key === rule.key);
    if (same >= 0) { rule.order = rules[same].order; rules.splice(same, 1); }
    const spelled = rule.operator;
    if (spelled !== undefined && (this.operators_written.get(rule.key)?.order ?? Infinity) > rule.order) { this.operators_written.set(rule.key, { order: rule.order, operator: spelled }); this.loosers = new WeakMap(); }
    rules.push(rule);
    Interpreter.touch(scope);
    this.notify(scope, rule);
    this.version++;
    this.rules_version++;
  }

  // Reading: statements, one after another; a jump carries on at the statement its label is.
  private units = new WeakMap<Text.Source, { by: Map<number, Unit> }>();
  unit_of(cursor: Text.Node): Unit {
    let held = this.units.get(cursor.source);
    if (held === undefined) this.units.set(cursor.source, held = { by: new Map() });
    const span = cursor.cursor * 65536 + (cursor.limit - cursor.cursor);
    let unit = held.by.get(span);
    if (unit === undefined) held.by.set(span, unit = { statements: new Map(), labels: new Map() });
    return unit;
  }
  firing: { depth: number; fires: Match[]; calls: Called[] }[] = [];
  private graphs = new WeakMap<Text.Source, Map<number, Map<number, Variant[]>>>();
  graph_of(cursor: Text.Node): Map<number, Variant[]> {
    let by = this.graphs.get(cursor.source);
    if (by === undefined) this.graphs.set(cursor.source, by = new Map());
    const span = cursor.cursor * 65536 + (cursor.limit - cursor.cursor);
    let graph = by.get(span);
    if (graph === undefined) by.set(span, graph = new Map());
    return graph;
  }
  read(cursor: Text.Node, frame: Node): Node | undefined { return this.read_on(cursor, frame, cursor.cursor, this.forced.length, undefined); }
  // Reading on from where the cursor is, in a span that began at `begin`: what a compiled body hands back to when it cannot go on.
  read_on(cursor: Text.Node, frame: Node, begin: number, mark: number, last: Node | undefined): Node | undefined {
    const painting = this.painting(cursor.source);
    const graph = painting ? undefined : this.graph_of(cursor.cursor === begin ? cursor : this.spanned(cursor, begin));
    const unit = painting ? undefined : this.unit_of(cursor.cursor === begin ? cursor : this.spanned(cursor, begin));
    while (true) {
      this.blank(cursor);
      if (cursor.done()) { if (this.running.length === 0) this.forced.length = Math.min(this.forced.length, mark); return last; }
      const start = cursor.cursor;
      if (painting) { let read = this.read_at.get(cursor.source); if (read === undefined) this.read_at.set(cursor.source, read = new Set()); read.add(start); }
      if (frame === this.GLOBAL) this.reading = cursor.span(start, this.statement_end(cursor, start, frame) - 1);
      try {
        const ran = this.step(cursor, frame, start, graph, unit);
        if (ran.value !== undefined) last = ran.value;
        if (ran.jump !== undefined) {
          const at = this.label_at(cursor, begin, ran.jump.label, frame);
          if (at === undefined) throw Object.assign(new Jump(ran.jump.label), { site: ran.jump.site, spelled: true });
          if (at < start) { for (let k = mark; k < this.forced.length; k++) this.forced[k].value = undefined; this.forced.length = Math.min(this.forced.length, mark); }
          cursor.cursor = at;
          continue;
        }
      } catch (jump) {
        if (!(jump instanceof Jump)) throw jump;
        const at = this.label_at(cursor, begin, jump.label, frame);
        if (at === undefined) { jump.value ??= this.held(last); throw jump; }
        if (jump.value !== undefined) last = jump.value;
        if (at < start) { for (let k = mark; k < this.forced.length; k++) this.forced[k].value = undefined; this.forced.length = Math.min(this.forced.length, mark); }
        cursor.cursor = at;
        continue;
      }
      if (cursor.cursor === start) cursor.advance();
    }
  }
  private spans_at = new WeakMap<Text.Source, Map<number, Text.Node>>();
  spanned(cursor: Text.Node, begin: number): Text.Node {
    let by = this.spans_at.get(cursor.source);
    if (by === undefined) this.spans_at.set(cursor.source, by = new Map());
    const key = begin * 65536 + (cursor.limit - begin);
    let held = by.get(key);
    if (held === undefined) { held = cursor.bounded(begin, cursor.limit); by.set(key, held); }
    return held;
  }
  // One statement at `start`: its recorded unit, else a recorded variant, else read and recorded. A jump it makes is handed back.
  step(cursor: Text.Node, frame: Node, start: number, graph: Map<number, Variant[]> | undefined, unit: Unit | undefined): Ran {
    const compiled = unit?.statements.get(start);
    let rules = compiled === undefined ? undefined : this.heads(frame);
    if (compiled !== undefined && (compiled.rules === rules || this.print(compiled.rules) === this.print(rules!))) {
      const ran = evaluate(this, compiled, cursor, frame);
      if (ran !== undefined) { cursor.cursor = compiled.end; return ran; }
    }
    let seen = graph?.get(start);
    if (seen !== undefined && seen.length > 0) {
      let ran: Replayed = 'missed';
      for (const variant of seen) { if (!variant.valid) continue; cursor.cursor = start; ran = replay(this, variant, cursor, frame); if (ran !== 'missed') break; }
      if (ran !== 'missed' && 'diverged' in ran) { const value = this.statement(cursor, frame, ran.diverged); if (cursor.cursor === start) cursor.advance(); return { value }; }
      if (ran !== 'missed') { if (cursor.cursor === start) cursor.advance(); return { value: ran.value }; }
      cursor.cursor = start;
    }
    const firing = { depth: this.running.length, fires: [] as Match[], calls: [] as Called[] };
    this.firing.push(firing);
    let value: Node | undefined;
    let thrown = true;
    if (graph !== undefined && seen === undefined) graph.set(start, seen = Object.assign([], { visits: 0 }));
    if (unit !== undefined && rules === undefined) rules = this.heads(frame);
    const trace: Event[] | undefined = seen !== undefined && ++(seen as Variant[] & { visits: number }).visits >= 3 && this.naming === undefined ? [] : undefined, volatile = this.volatile, positions: number[] = [];
    try { value = this.statement(cursor, frame, undefined, trace, positions); thrown = false; }
    finally {
      this.firing.pop();
      if (trace !== undefined && trace.length > 0 && this.volatile === volatile && this.naming === undefined && (!thrown || trace[trace.length - 1].k === 'fire')) { const held = Object.assign((graph!.get(start) ?? []).filter(variant => variant.valid), { visits: (seen as Variant[] & { visits: number }).visits }); if (held.length >= 8) held.shift()!.valid = false; const variant = { events: trace, valid: true }; held.push(variant); graph!.set(start, held); this.watch(variant, frame, cursor, positions); }
      if (unit !== undefined && firing.fires.length === 1 && (thrown || cursor.cursor === firing.fires[0].end)) applied(this, unit, start, firing.fires[0], rules!);
      if (unit !== undefined && !thrown && firing.fires.length === 0 && firing.calls.length === 0 && this.naming === undefined) named(this, unit, start, cursor.cursor, value, rules!, cursor);
      if (unit !== undefined && !thrown && firing.fires.length === 0 && firing.calls.length > 0 && firing.calls[firing.calls.length - 1].end === cursor.cursor) called(this, unit, start, cursor.cursor, firing.calls, rules!, cursor.span(start, this.token(cursor, start) - 1), frame);
    }
    if (cursor.cursor === start) cursor.advance();
    return { value };
  }
  label_at(cursor: Text.Node, begin: number, label: string, frame: Node): number | undefined {
    const labels = this.derived(this.rules_of(frame), 'label', all => all.filter(rule => rule.native === 'label'));
    const epoch = this.reading_epoch();
    let held = this.label_sets.get(cursor.source);
    if (held === undefined || held.epoch !== epoch) this.label_sets.set(cursor.source, held = { epoch, by: new Map() });
    const span = begin * 65536 + (cursor.limit - begin);
    let by_list = held.by.get(span);
    if (by_list === undefined) held.by.set(span, by_list = new WeakMap());
    let found = by_list.get(labels);
    if (found === undefined) { found = this.labels_in(cursor, begin, frame, labels); by_list.set(labels, found); }
    return found.get(label);
  }
  private label_sets = new WeakMap<Text.Source, { epoch: object; by: Map<number, WeakMap<Rule[], Map<string, number>>> }>();
  labels_in(cursor: Text.Node, begin: number, frame: Node, labels: Rule[]): Map<string, number> {
    const text = cursor.source.value, out = new Map<string, number>();
    for (let j = begin; j < cursor.limit;) {
      while (j < cursor.limit && /\s/.test(text[j])) j++;
      if (j >= cursor.limit) break;
      const probe = cursor.bounded(j, cursor.limit);
      const found = this.best(labels, probe, frame, undefined, true);
      if (found?.rule.native === 'label') { const name = [...found.captures.values()][0]?.string.trim(); if (name !== undefined && !out.has(name)) out.set(name, j); }
      j = this.statement_end(cursor, j, frame);
      if (text[j] === '\n') j++;
    }
    return out;
  }
  statement_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value;
    while (j < cursor.limit && text[j] !== '\n') { const k = this.claim(cursor, j, frame); j = k > j ? k : j + 1; }
    return j;
  }
  private blanks = new WeakMap<Text.Source, { text: string; next: Int32Array }>();
  blank(cursor: Text.Node) {
    const text = cursor.source.value;
    const cached = this.blanks.get(cursor.source);
    let next = cached?.text === text ? cached.next : undefined;
    if (next === undefined) {
      next = new Int32Array(text.length + 1);
      next[text.length] = text.length;
      for (let j = text.length - 1; j >= 0; j--) next[j] = /\s/.test(text[j]) ? next[j + 1] : j;
      this.blanks.set(cursor.source, { text, next });
    }
    if (cursor.cursor < cursor.limit) cursor.cursor = Math.min(next[cursor.cursor], cursor.limit);
  }
  spaces(cursor: Text.Node, j: number): number { const text = cursor.source.value; while (j < cursor.limit && (text[j] === ' ' || text[j] === '\t')) j++; return j; }

  statement(cursor: Text.Node, frame: Node, from?: Node, trace?: Event[], positions?: number[]): Node | undefined {
    let value: Node | undefined = from;
    const text = cursor.source.value;
    let basis = this.sensitive;
    while (true) {
      basis = this.sensitive;
      if (cursor.done()) break;
      if (value === undefined) {
        cursor.cursor = this.spaces(cursor, cursor.cursor);
        if (cursor.done() || text[cursor.cursor] === '\n') break;
        const start = cursor.cursor;
        const heads = this.heads(frame);
        if (trace !== undefined) { this.rules_of(frame); trace.push(frame.parent !== undefined && frame !== this.GLOBAL ? { k: 'heads', parent: frame.parent, sees: frame.sees === undefined || frame.sees.length === 0 ? undefined : [...frame.sees], print: frame.rules?.length ? this.print(frame.rules) : undefined } : { k: 'heads', frame }); positions!.push(start); }
        const found = this.best(heads, cursor, frame);
        let name = this.token(cursor, start);
        let named: Match | undefined, place: Node | undefined;
        if (name > start) {
          place = this.place(frame, cursor.span(start, name - 1));
          const probe = cursor.bounded(name, cursor.limit);
          named = this.tried(() => { const receiving = this.receiving(place!, frame); if (trace !== undefined) { const shape = this.shape(place!); trace.push({ k: 'named', end: name, owned: this.print(shape.rules), on: this.print(shape.on) }); positions!.push(name); } return this.best(receiving, probe, frame, place); });
        }
        let head = start;
        while (head < cursor.limit && !/\s/.test(text[head]) && this.claim(cursor, head, frame) === head) head++;
        if (head > name && name > start) {
          const whole = this.place(frame, cursor.span(start, head - 1));
          const defined = this.tried(() => { const receiving = this.receiving(whole, frame); if (trace !== undefined) { const shape = this.shape(whole); trace.push({ k: 'whole', end: head, owned: this.print(shape.rules), on: this.print(shape.on) }); positions!.push(head); } return this.best(receiving, cursor.bounded(head, cursor.limit), frame, whole); });
          if (defined?.rule.defines) { place = whole; named = defined; name = head; }
        }
        const self = this.holding_at(cursor.source, start)?.found.receiver ?? (frame === this.GLOBAL || frame.bare ? undefined : frame);
        if (trace !== undefined) { const shape = self === undefined ? undefined : this.shape(self); trace.push(shape === undefined ? { k: 'self' } : { k: 'self', mine: this.print(shape.mine), rules: this.print(shape.rules), on: this.print(shape.on) }); }
        const own = self === undefined ? undefined : this.best_on(self, frame, cursor, true);
        const spelled = name > start && !Interpreter.word.test(text[start]) && !named?.rule.defines && !found?.rule.defines;
        if (spelled && own !== undefined && own.rule.pattern[0]?.kind === 'literal') { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: own, receiver: 'self', occurrence: this.occurrence(own.rule, 'self', frame, self) }); } value = this.fire(own, cursor, frame); continue; }
        if (spelled && found !== undefined && found.rule.pattern[0]?.kind === 'literal') { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: found, receiver: 'none', occurrence: this.occurrence(found.rule, 'none', frame, undefined) }); } value = this.fire(found, cursor, frame); continue; }
        const asks_own = own !== undefined && place !== undefined && own.rule.pattern[0]?.kind === 'literal' && (own.rule.pattern[0] as { text: string }).text === place.place!.name;
        const shadowed = asks_own && this.tried(() => this.quietly(() => this.lookup(frame, place!.place!.name))) !== undefined;
        if (asks_own) trace?.push({ k: 'unbound', name: place!.place!.name, unbound: !shadowed });
        if (own !== undefined && !shadowed && (own.end > Math.max(found?.end ?? start, named?.end ?? name) || (found?.rule === own.rule && own.end === found.end && own.end > (named?.end ?? name)))) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: own, receiver: 'self', occurrence: this.occurrence(own.rule, 'self', frame, self) }); } value = this.fire(own, cursor, frame); continue; }
        const asks = place !== undefined && found !== undefined && found.end >= name && !named?.rule.leading && !named?.rule.defines;
        const unbound = asks && this.quietly(() => this.lookup(frame, place!.place!.name)) === undefined;
        if (asks) trace?.push({ k: 'unbound', name: place!.place!.name, unbound });
        if (found !== undefined && (unbound || name <= start || found.end > (named?.end ?? name) || (named === undefined && found.end >= name) || (named !== undefined && found.end === named.end && found.reach > named.reach) || (found.rule.defines && !named?.rule.defines && found.end >= named!.end))) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: found, receiver: 'none', occurrence: this.occurrence(found.rule, 'none', frame, undefined) }); } value = this.fire(found, cursor, frame); continue; }
        if (place === undefined) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'break' }); } break; }
        if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'place', end: name }); }
        this.paint_place(place);
        cursor.cursor = name;
        value = place;
        continue;
      }
      const reader = this.deref(value, false);
      if (reader?.fn !== undefined && reader.fn.arity > 0 && !reader.fn.raw && cursor.cursor < cursor.limit && this.claim(cursor, cursor.cursor, frame) > cursor.cursor) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'call', fn: reader.fn }); } value = this.call(reader, cursor, frame); continue; }
      if (reader?.fn?.raw) { const at = this.spaces(cursor, cursor.cursor); if (at < cursor.limit && text[at] !== '\n') { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'raw', fn: reader.fn }); } cursor.cursor = at; value = this.call(reader, cursor, frame); continue; } }
      trace?.push({ k: 'reader', fn: reader?.fn });
      const lists = this.on_lists(value, frame);
      if (trace !== undefined) { const shape = this.shape(value); trace.push({ k: 'on', mine: this.print(shape.mine), rules: this.print(shape.rules), on: this.print(shape.on) }); positions!.push(cursor.cursor); }
      const found = this.best(lists.mine, cursor, frame, value) ?? this.best(lists.rules, cursor, frame, value);
      if (found !== undefined) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: found, receiver: 'value', occurrence: this.occurrence(found.rule, 'value', frame, value) }); } value = this.fire(found, cursor, frame); continue; }
      const at = this.spaces(cursor, cursor.cursor);
      if (at >= cursor.limit || text[at] === '\n') { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'break' }); } break; }
      const target = this.deref(value);
      if (target?.fn !== undefined && target.fn.arity > 0) {
        if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'target', fn: target.fn }); }
        cursor.cursor = at;
        value = this.call(target, cursor, frame);
        continue;
      }
      trace?.push({ k: 'target', fn: target?.fn });
      const afters = this.derived(this.rules_of(frame), 'after', this.keep_after);
      positions?.push(at);
      const after = this.best(afters, cursor.bounded(at, cursor.limit), frame);
      if (after !== undefined) { if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'fire', match: after, receiver: 'none', occurrence: this.occurrence(after.rule, 'none', frame, undefined), at }); } cursor.cursor = at; this.fire(after, cursor, frame); continue; }
      if (trace !== undefined) { if (this.sensitive !== basis) trace.push({ k: 'declared', declared: this.declared }); trace.push({ k: 'unexpected' }); }
      const end = this.statement_end(cursor, at, frame);
      this.error(`Unexpected \`${text.slice(at, end)}\`.`, cursor.span(at, Math.max(at, end - 1)));
      cursor.cursor = end;
      break;
    }
    return value;
  }
  on_lists(value: Node, frame: Node): { mine: Rule[]; rules: Rule[] } {
    const on = this.owned(value), leading = this.leading_of(frame);
    return { mine: this.joined(on.mine, leading.mine), rules: this.joined(on.rules, leading.rules) };
  }
  private externals = new WeakMap<Text.Source, Map<string, Node>>();
  holding_at(source: Text.Source, at: number): Running | undefined {
    for (let k = this.running.length - 1; k >= 0; k--) {
      const { rule } = this.running[k].found;
      const body = rule.body, lexical = rule.lexical;
      if ((body !== undefined && body.source === source && body.begin <= at && at <= body.end) || (lexical !== undefined && lexical.source === source && lexical.begin <= at && at <= lexical.end)) return this.running[k];
    }
  }
  holding(at: Text.Node): Running | undefined {
    for (let k = this.running.length - 1; k >= 0; k--) {
      const { rule } = this.running[k].found;
      if ((rule.body !== undefined && Interpreter.within(at, rule.body)) || (rule.lexical !== undefined && Interpreter.within(at, rule.lexical))) return this.running[k];
    }
  }
  private templates = new Map<string, { id: number }>();
  template_of(rule: Rule): { id: number } {
    if (rule.template !== undefined) return rule.template;
    const key = `${rule.at.source.location ?? rule.at.source.value.length}:${rule.at.begin}:${rule.at.end}:${rule.key}`;
    let made = this.templates.get(key);
    if (made === undefined) this.templates.set(key, made = { id: this.templates.size + 1 });
    return rule.template = made;
  }
  private prints = new WeakMap<Rule[], object>();
  private printed = new Map<string, object>();
  print(rules: Rule[]): object {
    let held = this.prints.get(rules);
    if (held !== undefined) return held;
    const ids: number[] = [];
    for (const rule of rules) ids.push(this.template_of(rule).id);
    const key = ids.join(',');
    held = this.printed.get(key);
    if (held === undefined) this.printed.set(key, held = {});
    this.prints.set(rules, held);
    return held;
  }
  private by_template = new WeakMap<Rule[], Map<{ id: number }, Rule[]>>();
  in_list(rules: Rule[], template: { id: number }): Rule[] | undefined {
    let held = this.by_template.get(rules);
    if (held === undefined) { held = new Map(); for (const rule of rules) { const own = this.template_of(rule); const list = held.get(own); if (list === undefined) held.set(own, [rule]); else list.push(rule); } this.by_template.set(rules, held); }
    return held.get(template);
  }
  candidates_for(role: 'none' | 'self' | 'value', template: { id: number }, frame: Node, receiver: Node | undefined, target?: [Node | undefined]): Rule[] {
    const first = role === 'none' ? this.heads(frame) : (target !== undefined ? this.owned_target(target[0]) : this.owned(receiver!)).rules;
    const second = role === 'none' ? this.derived(this.rules_of(frame), 'after', this.keep_after) : this.leading_of(frame).rules;
    const one = this.in_list(first, template), two = this.in_list(second, template);
    return one === undefined ? two ?? [] : two === undefined ? one : [...one, ...two];
  }
  occurrence(rule: Rule, role: 'none' | 'self' | 'value', frame: Node, receiver: Node | undefined): number { return this.candidates_for(role, this.template_of(rule), frame, receiver).indexOf(rule); }
  resolve(match: Match, role: 'none' | 'self' | 'value', occurrence: number, frame: Node, receiver: Node | undefined, target?: [Node | undefined]): Match | undefined {
    const rule = this.candidates_for(role, this.template_of(match.rule), frame, receiver, target)[occurrence];
    if (rule === undefined) return undefined;
    return rule === match.rule && receiver === match.receiver ? match : { ...match, rule, receiver };
  }
  like(one: Node | undefined, other: Node | undefined): boolean { return Interpreter.like(one, other, 3, this); }
  static like(one: Node | undefined, other: Node | undefined, depth: number, it: Interpreter): boolean {
    if (one === other) return true;
    if (one === undefined || other === undefined || depth === 0 || one === it.GLOBAL || other === it.GLOBAL) return false;
    if ((one.rules?.length ?? 0) !== (other.rules?.length ?? 0) || (one.rules?.length && it.print(one.rules!) !== it.print(other.rules!))) return false;
    if (!Interpreter.like(one.parent, other.parent, depth - 1, it)) return false;
    const a = one.sees ?? Interpreter.nowhere, b = other.sees ?? Interpreter.nowhere;
    if (a.length !== b.length) return false;
    for (let n = 0; n < a.length; n++) if (!Interpreter.like(a[n], b[n], depth - 1, it)) return false;
    return true;
  }
  only_a_name(cursor: Text.Node, frame: Node, rules: Rule[], held?: { guard?: NameGuard; guards?: NameGuard[] }): boolean {
    if (this.naming !== undefined) return false;
    const self = this.holding_at(cursor.source, cursor.cursor)?.found.receiver ?? (frame === this.GLOBAL || frame.bare ? undefined : frame);
    let shape: { rules: Rule[]; mine: Rule[]; on: Rule[] } | undefined;
    for (const guard of held?.guards ?? Interpreter.no_guards) {
      if (!guard.valid || (guard.declared !== undefined && guard.declared !== this.declared) || !this.same_frame(frame, guard)) continue;
      if (self === undefined) { if (guard.self === undefined) return true; continue; }
      if (guard.self === undefined) continue;
      shape ??= this.shape(self);
      if (this.print(shape.rules) === guard.self.rules && this.print(shape.mine) === guard.self.mine && this.print(shape.on) === guard.self.on) return true;
    }
    const sensitive = this.sensitive;
    if (this.best(rules, cursor, frame) !== undefined) return false;
    if (self !== undefined && this.best_on(self, frame, cursor, true) !== undefined) return false;
    if (held !== undefined) {
      const shape = self === undefined ? undefined : this.shape(self);
      const made: NameGuard = { declared: this.sensitive === sensitive ? undefined : this.declared, valid: true, events: [], own: frame.rules?.length ? this.own_print(frame) : undefined, parent: frame.parent, sees: frame.sees === undefined || frame.sees.length === 0 ? undefined : [...frame.sees], self: shape === undefined ? undefined : { rules: this.print(shape.rules), mine: this.print(shape.mine), on: this.print(shape.on) } };
      const guards = (held.guards = (held.guards ?? []).filter(guard => guard.valid));
      if (guards.length >= 8) guards.shift()!.valid = false;
      guards.push(made);
      this.watch(made, frame, cursor, [cursor.cursor]);
    }
    return true;
  }
  static no_guards: NameGuard[] = [];
  // A frame like the one a guard was made in: the same parent and seen frames, and its own rules written alike.
  same_frame(frame: Node, shape: { own?: object; parent?: Node; sees?: Node[] }): boolean {
    if (frame.parent !== shape.parent && !this.like(frame.parent, shape.parent)) return false;
    if (shape.own !== undefined ? !frame.rules?.length || this.own_print(frame) !== shape.own : frame.rules?.length) return false;
    const sees = frame.sees, expected = shape.sees;
    if (expected === undefined) return sees === undefined || sees.length === 0;
    if (sees === undefined || sees.length !== expected.length) return false;
    for (let n = 0; n < sees.length; n++) if (sees[n] !== expected[n] && !this.like(sees[n], expected[n])) return false;
    return true;
  }
  private own_prints = new WeakMap<Node, { layout: number; print: object }>();
  own_print(frame: Node): object {
    const held = this.own_prints.get(frame), layout = frame.layout ?? 0;
    if (held !== undefined && held.layout === layout) return held.print;
    const ids: number[] = [];
    for (const rule of frame.rules ?? []) ids.push(this.template_of(rule).id);
    const key = ids.join(',');
    let print = this.printed.get(key);
    if (print === undefined) this.printed.set(key, print = {});
    this.own_prints.set(frame, { layout, print });
    return print;
  }
  // What a value's own class says is read before what every value says.
  best_on(value: Node, frame: Node, cursor: Text.Node, own: boolean = false): Match | undefined {
    const on = this.owned(value), leading = this.leading_of(frame);
    if (!own) return this.best(this.joined(on.mine, leading.mine), cursor, frame, value) ?? this.best(this.joined(on.rules, leading.rules), cursor, frame, value);
    const based = this.based(), openers = this.openers_now();
    const rules = this.derived(this.joined(on.rules, leading.rules), 'own', this.keep_own, openers);
    return this.best(this.derived(rules, 'own mine', this.keep_mine, based), cursor, frame, value) ?? this.best(rules, cursor, frame, value);
  }
  receiving(value: Node, frame: Node): Rule[] { return this.joined(this.owned(value).rules, this.leading_of(frame).rules); }
  private derivations = new WeakMap<Rule[], Map<string, { on?: object; rules: Rule[] }>>();
  derived(rules: Rule[], tag: string, make: (rules: Rule[]) => Rule[], on?: object): Rule[] {
    let table = this.derivations.get(rules);
    if (table === undefined) this.derivations.set(rules, table = new Map());
    const held = table.get(tag);
    if (held !== undefined && held.on === on) return held.rules;
    const made = this.canonical(make(rules));
    table.set(tag, { on, rules: made });
    return made;
  }
  private pairs = new WeakMap<Rule[], WeakMap<Rule[], Rule[]>>();
  joined(first: Rule[], second: Rule[]): Rule[] {
    if (first.length === 0) return second;
    if (second.length === 0) return first;
    let inner = this.pairs.get(first);
    if (inner === undefined) this.pairs.set(first, inner = new WeakMap());
    let held = inner.get(second);
    if (held === undefined) inner.set(second, held = this.canonical([...first, ...second]));
    return held;
  }
  private base_set?: { version: number; of?: Rule[]; rules: Set<Rule> };
  based(): Set<Rule> {
    if (this.base_set?.version === this.version) return this.base_set.rules;
    const of = this.BASE === undefined ? undefined : this.rules_on(this.BASE);
    this.base_set = { version: this.version, of, rules: this.base_set !== undefined && this.base_set.of === of ? this.base_set.rules : new Set(of ?? []) };
    return this.base_set.rules;
  }
  // The rules a value answers to itself, and of those the ones its own class (not the base) says.
  private owned_sets = new WeakMap<Node, { of: Rule[]; based: Set<Rule>; target?: Node; rules: Rule[]; mine: Rule[] }>();
  owned(value: Node): { rules: Rule[]; mine: Rule[] } {
    return this.owned_target(value.place !== undefined || value.code !== undefined ? this.deref(value, false) : value);
  }
  shape(value: Node): { rules: Rule[]; mine: Rule[]; on: Rule[] } { return this.shape_of(value.place !== undefined || value.code !== undefined ? this.deref(value, false) : value); }
  shape_of(target: Node | undefined): { rules: Rule[]; mine: Rule[]; on: Rule[] } {
    if (target === undefined || target.none || target === this.GLOBAL) { const owned = this.owned_target(target); return this.shape_from(owned, Interpreter.receiving_any); }
    const on = this.rules_on(target), based = this.based(), held = target.shaped;
    if (held !== undefined && held.of === on && held.based === based) return held.shape;
    const shape = this.shape_from(this.owned_target(target), on);
    target.shaped = { of: on, based, shape };
    return shape;
  }
  private shapes = new WeakMap<{ rules: Rule[]; mine: Rule[] }, WeakMap<Rule[], { rules: Rule[]; mine: Rule[]; on: Rule[] }>>();
  shape_from(owned: { rules: Rule[]; mine: Rule[] }, on: Rule[]): { rules: Rule[]; mine: Rule[]; on: Rule[] } {
    let by = this.shapes.get(owned);
    if (by === undefined) this.shapes.set(owned, by = new WeakMap());
    let shape = by.get(on);
    if (shape === undefined) by.set(on, shape = { rules: owned.rules, mine: owned.mine, on });
    return shape;
  }
  owned_target(target: Node | undefined): { rules: Rule[]; mine: Rule[] } {
    const key = target === undefined || target === this.GLOBAL ? this.BASE : target;
    if (key === undefined) return Interpreter.owned_by_nothing;
    const based = this.based();
    if (target !== undefined && target !== this.GLOBAL && !target.rules?.length) {
      const rules = this.derived(this.rules_on(key), 'owned', this.keep_owned);
      return this.paired(rules, this.derived(rules, 'mine', this.keep_mine, based));
    }
    const held = this.owned_sets.get(key), of = this.rules_on(key);
    if (held?.of === of && held.based === based && held.target === target) return held;
    const rules = this.canonical(of.filter(rule => (rule.pattern[0]?.kind !== 'gap' && !rule.implicit) || rule.home === target));
    const made = { of, based, target, rules, mine: this.derived(rules, 'mine', this.keep_mine, based) };
    this.owned_sets.set(key, made);
    return made;
  }
  static owned_by_nothing = { rules: [] as Rule[], mine: [] as Rule[] };
  leading_of(frame: Node): { rules: Rule[]; mine: Rule[] } {
    const based = this.based();
    const rules = this.derived(this.rules_of(frame), 'leading', this.keep_leading);
    return this.paired(rules, this.derived(rules, 'mine', this.keep_mine, based));
  }
  private pairs_of = new WeakMap<Rule[], WeakMap<Rule[], { rules: Rule[]; mine: Rule[] }>>();
  paired(rules: Rule[], mine: Rule[]): { rules: Rule[]; mine: Rule[] } {
    let by = this.pairs_of.get(rules);
    if (by === undefined) this.pairs_of.set(rules, by = new WeakMap());
    let pair = by.get(mine);
    if (pair === undefined) by.set(mine, pair = { rules, mine });
    return pair;
  }
  // A native taking arguments takes the operands written after it, read when it asks.
  call(target: Node, cursor: Text.Node, frame: Node): Node | undefined {
    const native = target.fn!;
    const args: Node[] = [];
    for (let k = 0; k < native.arity; k++) {
      const from = this.spaces(cursor, cursor.cursor);
      if (from >= cursor.limit || cursor.source.value[from] === '\n') break;
      const claimed = this.claim(cursor, from, frame);
      let end = native.raw && k === 0 ? this.name_end(cursor, from) : claimed > from ? claimed : this.operand_end(cursor, from, frame);
      if (!(native.raw && k === 0) && end > from && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(cursor.source.value.slice(from, end)) && this.tried(() => this.lookup(frame, cursor.source.value.slice(from, end)))?.fn?.raw) { const after = this.spaces(cursor, end); const token = this.token(cursor, after); if (token > after) end = token; }
      if (end <= from) break;
      const span = cursor.span(from, end - 1);
      args.push(native.raw && k === 0 ? this.literal(span) : this.lazy(span, frame));
      cursor.cursor = end;
    }
    const at = cursor.span(cursor.cursor, cursor.cursor);
    const firing = this.firing[this.firing.length - 1];
    if (firing !== undefined && firing.depth === this.running.length) firing.calls.push({ native, spans: args.map(arg => arg.code?.span ?? arg.at!), end: cursor.cursor, at });
    return native.fn({ interpreter: this, frame, args, at });
  }

  // Matching: the longest reading wins, then the one that spells more, then the one met first.
  best(rules: Rule[], cursor: Text.Node, frame: Node, receiver?: Node, quiet: boolean = false): Match | undefined {
    const epoch = this.reading_epoch();
    let at = this.readings.get(cursor.source);
    if (at === undefined || at.epoch !== epoch) this.readings.set(cursor.source, at = { epoch, by: new Map() });
    const position = cursor.cursor * 65536 + (cursor.limit - cursor.cursor);
    let by_rules = at.by.get(position);
    if (by_rules === undefined) at.by.set(position, by_rules = new WeakMap());
    let by_scope = by_rules.get(rules);
    if (by_scope === undefined) by_rules.set(rules, by_scope = new WeakMap());
    const scope = this.rules_of(frame);
    let by_receiver = by_scope.get(scope);
    if (by_receiver === undefined) by_scope.set(scope, by_receiver = new Map());
    const on = receiver === undefined ? null : this.operates(rules) ? this.receiver_rules(receiver) : Interpreter.receiving_any;
    const known = by_receiver.get(on);
    if (known !== undefined) { if (known.sensitive) this.sensitive++; return known.found === null ? undefined : known.found.receiver === receiver ? known.found : { ...known.found, receiver }; }
    const volatile = this.volatile, sensitive = this.sensitive;
    const found = quiet ? this.quietly(() => this.best_of(rules, cursor, frame, receiver)) : this.best_of(rules, cursor, frame, receiver);
    if (this.volatile === volatile && this.readings.get(cursor.source) === at) by_receiver.set(on, { found: found === undefined ? null : found, sensitive: this.sensitive !== sensitive });
    return found;
  }
  private readings = new WeakMap<Text.Source, { epoch: object; by: Map<number, WeakMap<Rule[], WeakMap<Rule[], Map<Rule[] | null, { found: Match | null; sensitive: boolean }>>>> }>();
  private static receiving_any: Rule[] = [];
  volatile = 0;
  sensitive = 0;
  private epoch_at?: { rules: number; version: number; declared: number; base?: Node; global: Rule[]; based: Rule[]; token: object };
  reading_epoch(): object {
    const held = this.epoch_at;
    if (held !== undefined && held.rules === this.rules_version && held.version === this.version && held.declared === this.declared && held.base === this.BASE) return held.token;
    const global = this.rules_of(this.GLOBAL), based = this.BASE === undefined ? Interpreter.receiving_any : this.rules_on(this.BASE);
    const token = held !== undefined && held.global === global && held.based === based && held.declared === this.declared && held.base === this.BASE ? held.token : {};
    this.epoch_at = { rules: this.rules_version, version: this.version, declared: this.declared, base: this.BASE, global, based, token };
    return token;
  }
  receiver_rules(receiver: Node): Rule[] {
    const held = this.quietly(() => this.deref(receiver, false));
    return held === undefined || held.none ? Interpreter.receiving_any : this.rules_on(held);
  }
  private operating = new WeakMap<Rule[], boolean>();
  operates(rules: Rule[]): boolean {
    let held = this.operating.get(rules);
    if (held === undefined) { held = rules.some(rule => rule.pattern.some(piece => piece.kind === 'capture' && piece.operator)); this.operating.set(rules, held); }
    return held;
  }
  private indices = new WeakMap<Rule[], [Heads | undefined, Heads | undefined]>();
  index_of(rules: Rule[], receiving: boolean): Heads {
    let held = this.indices.get(rules);
    if (held === undefined) this.indices.set(rules, held = [undefined, undefined]);
    return held[receiving ? 1 : 0] ??= new Heads(rules, receiving);
  }
  best_of(rules: Rule[], cursor: Text.Node, frame: Node, receiver?: Node): Match | undefined {
    let best: Match | undefined, best_spelled = 0;
    const text = cursor.source.value, here = cursor.cursor, after = this.spaces(cursor, here), receiving = receiver !== undefined;
    const index = this.index_of(rules, receiving);
    for (const k of index.at(text[here] ?? '', after === here ? '' : text[after] ?? '')) {
      const rule = rules[k];
      if (rule.at.source === cursor.source && rule.at.begin <= here && here <= rule.at.end) continue;
      const head = rule.head(receiving);
      if (head !== undefined && !text.startsWith(head, here) && !text.startsWith(head, after)) continue;
      if (!rule.spelled_within(text, here, cursor.limit)) continue;
      const found = this.match(rule, cursor, frame, receiver);
      if (found === undefined) continue;
      const spelled = receiving && rule.pattern[rule.leading ? 1 : 0]?.kind === 'literal' ? 1 : 0;
      if (best === undefined || (spelled - best_spelled || found.end - best.end || Number(rule.defines) - Number(best.rule.defines) || found.reach - best.reach) > 0) { best = found; best_spelled = spelled; }
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
        if (!this.spelled(cursor, from, piece.text, piece.tight === true && p > 0 && from === i, pieces[p + 1]?.kind === 'capture' && pieces[p + 1].tight === true && (pieces[p + 1] as { typed?: boolean }).typed === true)) return;
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
      if (piece.operator) {
        const from = this.spaces(cursor, i), spelled = this.operator_at(cursor, from, frame, receiver);
        if (spelled === undefined || (piece.content !== undefined && !this.operator_fits(piece, spelled))) return;
        captures.set(piece.name, cursor.span(from, from + spelled.text.length - 1));
        i = from + spelled.text.length;
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
      else if (piece.tight && from === i && this.claim(cursor, from, frame) > from) end = this.claim(cursor, from, frame);
      else end = this.trailing_end(cursor, from, frame, rule);
      let last = end;
      if (!exact) while (last > from && /\s/.test(text[last - 1])) last--;
      let span = cursor.span(from, last - 1);
      if (last <= from) { if (!piece.optional && !enclosed && opened === 0) return; captures.set(piece.name, span); i = end; continue; }
      if (piece.undecided && piece.decided !== this.declared) this.decide(piece);
      if (piece.undecided) return;
      if (piece.typed && this.holds(piece, span) === undefined) {
        if (next !== undefined) return;
        const shorter = this.held_within(cursor, piece, from, last, frame);
        if (shorter === undefined) return;
        captures.set(piece.name, cursor.span(from, shorter - 1));
        i = shorter;
        continue;
      }
      captures.set(piece.name, span);
      i = end;
    }
    if (i === cursor.cursor) return;
    if (rule.guard !== undefined && rule.overloaded && !this.fits(rule, captures, frame)) return;
    return { rule, begin: cursor.cursor, end: i, reach, captures, literals, receiver };
  }
  private openers?: { version: number; spelled: Set<string> };
  private closers?: { version: number; spelled: Set<string> };
  closes(literal: string): boolean {
    if (this.closers?.version !== this.rules_version) this.closers = { version: this.rules_version, spelled: new Set(this.rules_of(this.GLOBAL).filter(rule => rule.enclosed).map(rule => (rule.pattern[rule.pattern.length - 1] as { text: string }).text)) };
    return this.closers.spelled.has(literal);
  }
  opens(literal: string): boolean { return this.openers_now().has(literal); }
  openers_now(): Set<string> {
    if (this.openers?.version !== this.rules_version) this.openers = { version: this.rules_version, spelled: new Set(this.rules_of(this.GLOBAL).filter(rule => rule.enclosed).map(rule => (rule.pattern[0] as { text: string }).text)) };
    return this.openers.spelled;
  }
  spelled(cursor: Text.Node, at: number, literal: string, joined: boolean = false, followed: boolean = false): boolean {
    const text = cursor.source.value;
    if (at + literal.length > cursor.limit || !text.startsWith(literal, at)) return false;
    if (Interpreter.word.test(literal[0]) && at > 0 && Interpreter.word.test(text[at - 1])) return false;
    if (!followed && Interpreter.word.test(literal[literal.length - 1]) && Interpreter.word.test(text[at + literal.length] ?? '')) return false;
    if (!joined && Interpreter.run(literal[0]) && at > 0 && Interpreter.run(text[at - 1])) return false;
    if (!followed && Interpreter.run(literal[literal.length - 1]) && Interpreter.run(text[at + literal.length] ?? ' ')) return false;
    return true;
  }
  static run(character: string): boolean { return !/[\s\p{L}\p{N}_(){}\[\]`"']/u.test(character); }
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
  held_within(cursor: Text.Node, piece: Piece & { kind: 'capture' }, from: number, last: number, frame: Node): number | undefined {
    const ends: number[] = [];
    for (let j = from; j < last;) { const k = Math.max(this.claim(cursor, j, frame), this.token(cursor, j)); j = k > j ? k : j + 1; if (j < last && !/\s/.test(cursor.source.value[j - 1])) ends.push(j); }
    for (let e = ends.length - 1; e >= 0; e--) if (this.holds(piece, cursor.span(from, ends[e] - 1)) !== undefined) return ends[e];
  }
  name_end(cursor: Text.Node, j: number): number { const text = cursor.source.value; while (j < cursor.limit && !/\s/.test(text[j]) && !this.closes(text[j])) j++; return j; }
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
      if (looser.some(spelling => this.spelled(cursor, j, spelling) && ((j > 0 && /\s/.test(text[j - 1])) || /\s/.test(text[j + spelling.length] ?? '')))) {
        let k = j; while (k > 0 && /\s/.test(text[k - 1])) k--;
        return k;
      }
      const k = this.claim(cursor, j, frame);
      j = k > j ? k : j + 1;
    }
    return j;
  }
  private loosers = new WeakMap<Rule[], WeakMap<Rule[], Map<Rule, string[]>>>();
  operators_written = new Map<string, { order: number; operator: string }>();
  looser(frame: Node, rule: Rule): string[] {
    const scope = this.rules_of(frame), based = this.BASE === undefined ? Interpreter.receiving_any : this.rules_on(this.BASE);
    let by_base = this.loosers.get(scope);
    if (by_base === undefined) this.loosers.set(scope, by_base = new WeakMap());
    let by_rule = by_base.get(based);
    if (by_rule === undefined) by_base.set(based, by_rule = new Map());
    let held = by_rule.get(rule);
    if (held === undefined) by_rule.set(rule, held = this.looser_of(scope, based, rule));
    return held;
  }
  private looser_of(scope: Rule[], based: Rule[], rule: Rule): string[] {
    const latest = new Map<string, Rule>();
    for (const rules of [scope, based]) for (const other of rules) if (other.operator !== undefined && (latest.get(other.key)?.order ?? -1) < other.order) latest.set(other.key, other);
    const order = Math.max(rule.order, latest.get(rule.key)?.order ?? -1);
    const out: string[] = rule.operator === undefined ? [] : [rule.operator];
    for (const other of latest.values()) if (other.order < order) out.push(other.operator!);
    for (const [key, written] of this.operators_written) if (!latest.has(key) && written.order < order && !out.includes(written.operator)) out.push(written.operator);
    return out;
  }
  // A bracket is any rule written between two literals: what it encloses is skipped over as one.
  private claims = new WeakMap<Text.Source, { brackets: Rule[]; at: Map<number, number> }>();
  private bracket_set?: { version: number; rules: Rule[] };
  brackets(): Rule[] {
    if (this.bracket_set?.version !== this.rules_version) this.bracket_set = { version: this.rules_version, rules: this.canonical(this.rules_of(this.GLOBAL).filter(rule => rule.enclosed)) };
    return this.bracket_set.rules;
  }
  rules_version = 0;
  claim(cursor: Text.Node, j: number, frame: Node): number {
    const brackets = this.brackets();
    let held = this.claims.get(cursor.source);
    if (held === undefined || held.brackets !== brackets) this.claims.set(cursor.source, held = { brackets, at: new Map() });
    const known = held.at.get(j);
    if (known !== undefined && known <= cursor.limit) return known;
    held.at.set(j, j);
    let end = j, probe: Text.Node | undefined;
    for (const rule of brackets) {
      if (!cursor.source.value.startsWith((rule.pattern[0] as { text: string }).text, j)) continue;
      const found = this.match(rule, probe ??= cursor.bounded(j, cursor.limit), this.GLOBAL);
      if (found !== undefined && found.end > end) end = found.end;
    }
    held.at.set(j, end);
    return end;
  }
  token(cursor: Text.Node, j: number): number {
    const text = cursor.source.value;
    if (j >= cursor.limit) return j;
    if (Interpreter.word.test(text[j])) { while (j < cursor.limit && (Interpreter.word.test(text[j]) || (text[j] === '-' && Interpreter.word.test(text[j + 1] ?? '')))) j++; return j; }
    while (j < cursor.limit && !/[\s\p{L}\p{N}_(){}\[\]`]/u.test(text[j])) j++;
    return j;
  }

  // Applying: a frame where the rule was written, made of what it is applied to, holding what it was handed.
  heads(frame: Node): Rule[] {
    const rules = this.rules_of(frame), decided = this.decisions(), held = frame.heading;
    if (held !== undefined && held.rules === rules && held.decided === decided) return held.heads;
    const heads = this.derived(rules, 'heads', this.keep_heads, decided);
    frame.heading = { rules, decided, heads };
    return heads;
  }
  readonly keep_after = (all: Rule[]) => all.filter(rule => !rule.leading && rule.home === this.GLOBAL);
  private readonly keep_heads = (all: Rule[]) => all.filter(rule => ((!rule.leading || rule.reads) && rule.home === this.GLOBAL) || rule.defines);
  private readonly keep_owned = (all: Rule[]) => all.filter(rule => rule.pattern[0]?.kind !== 'gap' && !rule.implicit);
  private readonly keep_leading = (all: Rule[]) => all.filter(rule => rule.leading && !rule.implicit);
  private readonly keep_mine = (all: Rule[]) => { const based = this.based(); return all.filter(rule => !based.has(rule) && rule.home !== this.GLOBAL); };
  private readonly keep_own = (all: Rule[]) => { const openers = this.openers_now(); return all.filter(rule => !rule.leading && !(rule.pattern[0]?.kind === 'literal' && openers.has(rule.pattern[0].text))); };
  fire(found: Match, cursor: Text.Node, frame: Node, target?: [Node | undefined], at?: Text.Node): Node | undefined {
    const firing = this.firing[this.firing.length - 1];
    if (firing !== undefined && firing.depth === this.running.length) firing.fires.push(found);
    cursor.cursor = found.end;
    return this.apply(found, frame, at ?? cursor.span(found.begin, found.end - 1), undefined, target);
  }
  apply(found: Match, frame: Node, at: Text.Node, given?: Map<string, Node>, target?: [Node | undefined]): Node | undefined {
    const { rule, captures, receiver } = found;
    if (++this.depth > Interpreter.DEPTH) { this.depth = 0; throw new Recursion(at); }
    try {
      this.running.push({ found, at });
      const short = this.operation(found, frame, at, given);
      if (short !== undefined) return short;
      this.paint_rule(found, at);
      if (rule.native === 'get' && rule.direct !== undefined && receiver?.place !== undefined && given === undefined && !this.program?.serving) {
        const member = this.member_of(rule, captures, receiver);
        if (member !== undefined) return member;
      }
      if (rule.passes !== undefined && !this.painting(at.source) && receiver === undefined && given === undefined) {
        const name = rule.passes.string, piece = rule.pattern.find(other => other.kind === 'capture' && other.name === name) as (Piece & { kind: 'capture' }) | undefined;
        const span = captures.get(name);
        const local = new Node(at);
        local.parent = rule.closure;
        local.body = rule.body;
        this.running[this.running.length - 1].local = local;
        local.set(name, span === undefined || piece === undefined ? this.NONE : piece.raw ? this.literal(span) : this.lazy(span, frame));
        const passed = this.place(local, rule.passes);
        this.deref(passed, false);
        return passed;
      }
      const local = new Node(at);
      this.running[this.running.length - 1].local = local;
      const site = this.site_at(this.running.length - 1);
      if (site !== at) local.site = site;
      local.parent = rule.closure;
      local.body = rule.body;
      if (receiver !== undefined) {
        const value = target !== undefined ? target[0] : this.deref(receiver, false);
        if (receiver.place === undefined && value !== undefined && !value.none) this.construct(value);
        if (receiver.place !== undefined) {
          const context = new Node(receiver.at);
          context.stands = receiver;
          if (value !== undefined && !value.none) context.with = [value];
          this.construct(context);
          local.on = context;
        }
        else if (value !== undefined && !value.none) local.on = value;
      }
      const args: Node[] = [];
      rule.pattern.forEach((piece, p) => {
        if (piece.kind !== 'capture') return;
        const value = given?.has(piece.name) ? given.get(piece.name)! : p === 0 && receiver !== undefined && !rule.implicit ? receiver : captures.has(piece.name) ? (piece.raw ? this.literal(captures.get(piece.name)!) : (piece.typed ? this.holds(piece, captures.get(piece.name)!) : undefined) ?? this.lazy(captures.get(piece.name)!, frame)) : this.NONE;
        local.set(piece.name, value);
        args.push(value);
      });
      if (this.program?.serving) for (const piece of rule.pattern) if (piece.kind === 'capture' && piece.content !== undefined && captures.has(piece.name) && this.painting(captures.get(piece.name)!.source)) this.run_content(piece, captures.get(piece.name)!, local);
      if (rule.fn !== undefined) return rule.fn.fn({ interpreter: this, frame: local, args, at, self: receiver });
      if (rule.body === undefined) return undefined;
      if (rule.direct !== undefined) return Natives[rule.native!].fn({ interpreter: this, frame: local, args: rule.direct.map(word => this.painting(word.source) ? this.lazy(word, local) : this.place(local, word)), at: rule.body.span(rule.body.end, rule.body.end) });
      try { return this.run_body(rule, local); }
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
  static reducing = env.nodejs && process.env.RAY_REDUCE === 'on';
  // A body is read until it has been applied a few times, then run from its reduction.
  run_body(rule: Rule, local: Node): Node | undefined {
    const span = rule.inner_body ??= this.inner(rule.body!) ?? rule.body!;
    const cursor = this.cursor_of(span);
    if (this.painting(span.source) || !Interpreter.reducing || ++rule.applications < 4) return this.read(cursor, local);
    let body = rule.reduced;
    if (body === undefined || (body.steps > 0 && body.unit.statements.size !== body.known)) {
      const unit = this.unit_of(cursor), graph = this.graph_of(cursor);
      body = rule.reduced = reduce(this, span, unit, graph);
      body.known = unit.statements.size;
    }
    return run(this, body, cursor, local);
  }
  unforce(mark: number) { for (let k = mark; k < this.forced.length; k++) this.forced[k].value = undefined; this.forced.length = Math.min(this.forced.length, mark); }
  // Where an application stands in written code: the call site of each rule whose body it is inside.
  site_at(top: number): Text.Node {
    const entry = this.running[top];
    if (entry.site !== undefined) return entry.site;
    let site = entry.at;
    for (let k = top - 1; k >= 0; k--) { const body = this.running[k].found.rule.body; if (body !== undefined && Interpreter.within(entry.at, body)) { site = this.site_at(k); break; } }
    return entry.site = site;
  }
  static same(one: Text.Node | undefined, other: Text.Node): boolean { return one !== undefined && one.source === other.source && one.begin === other.begin && one.end === other.end; }
  static within(inner: Text.Node, outer: Text.Node): boolean { return inner.source === outer.source && inner.begin >= outer.begin && inner.end <= outer.end; }
  // What a capture says besides its name runs on the text it took.
  run_content(piece: Piece & { kind: 'capture' }, span: Text.Node, local: Node) {
    const scope = new Node(span);
    scope.parent = local;
    scope.set(piece.name, this.literal(span));
    this.quietly(() => this.safely(() => this.read(this.cursor_of(piece.content!), scope)));
  }
  private checking = new Set<Piece>();
  held_texts = new Map<string, { declared: number; value: Node | undefined; missing: Set<string> }>();
  holds(piece: Piece & { kind: 'capture' }, span: Text.Node): Node | undefined {
    this.sensitive++;
    if (this.checking.has(piece)) return undefined;
    const site = `${piece.content?.source.location ?? piece.content?.string}:${piece.content?.begin}`;
    const known = this.held_texts, text = `${site}|${span.string}`, held = known.get(text);
    if (held !== undefined && this.still(held)) return held.value;
    const prefixes = this.rejected.get(site);
    let bits: string | undefined;
    if (prefixes !== undefined) {
      bits = Interpreter.bits_of(span.string);
      for (const length of prefixes.lengths) { if (length > bits.length) continue; const by = prefixes.by.get(bits.slice(0, length)); if (by !== undefined && this.still(by)) return undefined; }
    }
    this.checking.add(piece);
    const missing = this.missing, probe = this.probe;
    this.missing = new Set();
    try {
      const value = this.checked(piece, span);
      const made = { declared: this.declared, value, missing: this.missing };
      known.set(text, made);
      const probed = this.probe;
      if (value === undefined && probed !== undefined && !probed.other && probed.bits > 0) {
        bits ??= Interpreter.bits_of(span.string);
        if (probed.bits <= bits.length) {
          let held = this.rejected.get(site);
          if (held === undefined) this.rejected.set(site, held = { lengths: new Set(), by: new Map() });
          held.lengths.add(probed.bits);
          held.by.set(bits.slice(0, probed.bits), made);
        }
      }
      return value;
    } finally { this.checking.delete(piece); this.missing = missing; this.probe = probe; }
  }
  still(held: { declared: number; missing: Set<string> }): boolean { return held.declared === this.declared || ![...held.missing].some(name => this.GLOBAL.own(name) !== undefined); }
  probe?: { node: Node; bits: number; other: boolean; reading: boolean };
  private rejected = new Map<string, { lengths: Set<number>; by: Map<string, { declared: number; value: Node | undefined; missing: Set<string> }> }>();
  static bits_of(text: string): string { let out = ''; for (const byte of new TextEncoder().encode(text)) out += byte.toString(2).padStart(8, '0'); return out; }
  checked(piece: Piece & { kind: 'capture' }, span: Text.Node): Node | undefined {
    const scope = new Node(span);
    scope.parent = piece.within ?? this.GLOBAL;
    const literal = this.literal(span);
    this.probe = { node: literal, bits: 0, other: false, reading: false };
    scope.set(piece.name, literal);
    const refused = this.diagnostics.refused;
    const value = this.quietly(() => this.safely(() => this.read(this.cursor_of(piece.content!), scope)));
    const failed = this.diagnostics.refused > refused || value === undefined || this.quietly(() => this.deref(value))?.none;
    this.diagnostics.refused = refused;
    return failed ? undefined : value;
  }
  // The base's constructor runs once for every value made in reach of it.
  construct(value: Node) {
    const made = this.made?.code;
    if (made === undefined || value.constructed || value.text || (value.fn !== undefined && value.style === undefined) || value.code !== undefined || value.place !== undefined) return;
    value.constructed = true;
    const fresh = value.names === undefined && value.sees === undefined && value.rules === undefined;
    const template = this.template;
    if (fresh && template !== undefined && !this.painting(this.made!.code!.span.source) && template.made === this.made && template.base === this.BASE && template.stands === (value.stands !== undefined) && template.seen >= 2) {
      for (const [name, held] of template.names) value.set(name, held === 'self' ? value : value.stands!);
      if (template.names.length > 0) { value.given = template.given ??= new Set(template.names.map(([name]) => name)); for (const [name] of template.names) this.given_names.add(name); }
      Interpreter.touch(value);
      return;
    }
    const counts = fresh ? [this.diagnostics.reports, this.rules_version, this.declared, this.version, Node.sets] : undefined;
    const sees = value.sees;
    value.sees = [...(sees ?? []), made.in];
    Interpreter.touch(value);
    this.notify(value);
    const before = new Set(value.names?.keys() ?? []);
    try { this.safely(() => this.read(this.cursor_of(this.inner(made.span) ?? made.span), value)); }
    finally { value.sees = sees; Interpreter.touch(value); this.notify(value); }
    for (const key of value.names?.keys() ?? []) if (!before.has(key)) { (value.given ??= new Set()).add(key); this.given_names.add(key); }
    Interpreter.touch(value);
    if (counts !== undefined) {
      const names: [string, 'self' | 'stands' | undefined][] = [...(value.names ?? new Map<string, Node>()).entries()].map(([name, held]) => [name, held === value ? 'self' : held === value.stands && held !== undefined ? 'stands' : undefined]);
      const quiet = names.every(([, held]) => held !== undefined) && counts[0] === this.diagnostics.reports && counts[1] === this.rules_version && counts[2] === this.declared && counts[3] === this.version && Node.sets - counts[4] === names.length && value.sees === undefined && value.rules === undefined;
      const same = quiet && this.template !== undefined && this.template.stands === (value.stands !== undefined) && this.template.made === this.made && this.template.base === this.BASE && this.template.names.length === names.length && this.template.names.every(([name, held], k) => names[k][0] === name && names[k][1] === held);
      this.template = quiet ? { made: this.made, base: this.BASE, stands: value.stands !== undefined, names: names as [string, 'self' | 'stands'][], seen: same ? this.template!.seen + 1 : 1 } : undefined;
    }
  }
  private template?: { made?: Node; base?: Node; stands: boolean; names: [string, 'self' | 'stands'][]; seen: number; given?: Set<string> };

  // Values: a name is a place, read where it is bound; written code is read once, when asked for.
  place(frame: Node, at: Text.Node): Node { const node = new Node(at); node.place = { in: frame, name: at.string }; return node; }
  lazy(span: Text.Node, frame: Node): Node { const node = new Node(span); node.code = { span, in: frame }; return node; }
  literal(span: Text.Node): Node { const node = new Node(span); node.text = true; return node; }
  literal_of(string: string, at?: Text.Node): Node { const node = this.literal(Text.Node.string(string)); if (at !== undefined) node.at = Object.assign(Text.Node.string(string), {}); return node; }
  bound(node: Node): Node | undefined {
    const { in: scope, name, member } = node.place!;
    return member ? this.member(scope, name) : this.lookup(scope, name, node.at);
  }
  // What a place for this name would dereference to, without making the place.
  deref_name(frame: Node, at: Text.Node): Node | undefined {
    const name = at.string, bound = this.lookup(frame, name, at);
    if (bound !== undefined) return this.deref(bound, false);
    const method = this.method_named(frame, name, at);
    if (method !== undefined) return method;
    this.missing?.add(name);
    return undefined;
  }
  deref(node: Node | undefined, report: boolean = true): Node | undefined {
    for (let depth = 0; node !== undefined && depth < 256; depth++) {
      if (node.place !== undefined) {
        const bound = this.bound(node);
        if (bound === undefined) {
          if (node.place.member) return this.NONE;
          const method = this.method_named(node.place.in, node.place.name, node.at);
          if (method !== undefined) return method;
          if (report && this.load(node.place.name)) continue;
          this.missing?.add(node.place.name);
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
    node.value = this.word_of(span, frame) ?? this.read(this.cursor_of(span), frame);
    this.forced.push(node);
    return node.value;
  }
  forced: Node[] = []
  private words = new WeakMap<Text.Source, { value: string; by: Map<number, { cursor: Text.Node; guard?: NameGuard } | null> }>();
  word_of(span: Text.Node, frame: Node): Node | undefined {
    if (frame === this.GLOBAL || this.naming !== undefined) return undefined;
    const source = span.source, value = source.value;
    let at = this.words.get(source);
    if (at === undefined || at.value !== value) this.words.set(source, at = { value, by: new Map() });
    const key = span.begin * 65536 + (span.end - span.begin);
    let held = at.by.get(key);
    if (held === undefined) at.by.set(key, held = /^\s*[\p{L}_][\p{L}\p{N}_-]*\s*$/u.test(span.string) ? { cursor: this.cursor_of(span) } : null);
    if (held === null || this.painting(span.source)) return undefined;
    const cursor = held.cursor;
    cursor.cursor = span.begin;
    this.blank(cursor);
    const begin = cursor.cursor;
    if (!this.only_a_name(cursor, frame, this.heads(frame), held)) return undefined;
    const word = (held as { word?: Text.Node }).word ??= this.stable(cursor.span(begin, this.token(cursor, begin) - 1));
    return this.place(frame, word);
  }
  text(node: Node | undefined): string {
    if (node === undefined) return '';
    if (node === this.probe?.node && !this.probe.reading) this.probe.other = true;
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
        if (!/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word) && !/^[^\s\p{L}\p{N}_]+$/u.test(word)) { const read = this.force(at); if (read?.place === undefined && read?.code === undefined) return at; at = read; stood = false; continue; }
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
    if (scope === this.GLOBAL && scope.own(at.place.name) === undefined) this.declared++;
    scope.set(at.place.name, held);
    this.marked_place(at, scope);
    this.paint_place(at);
    return held;
  }
  assign(target: Node, value: Node | undefined): Node | undefined {
    const at = this.location(target);
    const held = this.deref(value);
    if (held === undefined) return undefined;
    const self = at?.place !== undefined && !at.place.member ? this.holder(at.place.in, at.place.name) : undefined;
    if (at?.place === undefined || (self?.given?.has(at.place.name) && self.stands === undefined)) {
      const into = this.deref(target, false);
      if (into?.style !== undefined) { this.alias(into.style, held); return held; }
      this.error('Cannot assign here.', target.at);
      return held;
    }
    const scope = at.place.member ? (this.deref(at.place.in) ?? at.place.in) : this.holder(at.place.in, at.place.name, at.at) ?? at.place.in;
    if (scope.none) return held;
    scope.set(at.place.name, held);
    this.marked_place(at, scope);
    return held;
  }
  // `this.name` where the name is no method of the value: the member place, without the frame `get` would be read in.
  member_of(rule: Rule, captures: Map<string, Text.Node>, receiver: Node): Node | undefined {
    const [self, property] = rule.direct!;
    if (self.string !== 'this') return undefined;
    const piece = rule.pattern.find(other => other.kind === 'capture' && other.name === property.string) as (Piece & { kind: 'capture' }) | undefined;
    const span = captures.get(property.string);
    if (piece === undefined || !piece.raw || span === undefined) return undefined;
    const target = this.deref(receiver);
    if (target === undefined) return undefined;
    const name = span.string;
    if (target.style !== undefined) return undefined;
    if (this.members_of(this.rules_on(target)).has(name)) return undefined;
    return Object.assign(new Node(span), { place: { in: target, name, member: true } });
  }
  private member_index = new WeakMap<Rule[], Map<string, { plain?: Rule; taking: Rule[] }>>();
  members_of(rules: Rule[]): Map<string, { plain?: Rule; taking: Rule[] }> {
    let index = this.member_index.get(rules);
    if (index !== undefined) return index;
    index = new Map();
    for (const rule of rules) {
      const [first, second] = rule.pattern;
      if (first?.kind !== 'literal' || rule.pattern.length > 2 || (second !== undefined && second.kind !== 'capture')) continue;
      let entry = index.get(first.text);
      if (entry === undefined) index.set(first.text, entry = { taking: [] });
      if (second === undefined) entry.plain ??= rule; else entry.taking.push(rule);
    }
    this.member_index.set(rules, index);
    return index;
  }
  get(node: Node, key: Node): Node | undefined {
    const target = this.deref(node);
    if (target === undefined) return undefined;
    const name = this.text(key);
    if (target.style !== undefined) return this.style(`${target.style}.${name}`);
    const entry = this.members_of(this.rules_on(target)).get(name);
    const plain = entry?.plain;
    if (plain !== undefined) return this.apply({ rule: plain, begin: 0, end: 0, reach: 0, captures: new Map(), literals: [], receiver: this.location(node) ?? node }, target, key.at ?? node.at!);
    const taking = entry?.taking ?? [];
    if (taking.length > 0) {
      return Object.assign(new Node(key.at), { fn: this.rebuild(['taking', this.location(node) ?? node, taking]) });
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
        if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word)) { const held = this.lookup(target.code.in, word, target.code.span); if (held !== undefined) { target = held; continue; } const read = this.force(target); if (read === undefined) return undefined; target = read; continue; }
        if (target.code.span.empty() || word === '') return undefined;
        if (!(frame.sees ??= []).includes(target.code.in) && frame !== target.code.in) { frame.sees.unshift(target.code.in); Interpreter.touch(frame); this.notify(frame); }
        const last = this.read(this.cursor_of(this.inner(target.code.span) ?? target.code.span), frame);
        const held = last === undefined ? undefined : this.deref(last, false);
        if (held?.program && !compose) return this.inline(held, frame);
        if (compose && held !== undefined && !held.text && !held.none && held.code === undefined && held !== frame) { (frame.with ??= []).push(held); Interpreter.touch(frame); this.version++; }
        return last;
      }
      if (target.place !== undefined) { target = this.bound(target); continue; }
      if (target.program) {
        if (!(frame.sees ??= []).includes(target.code!.in) && frame !== target.code!.in) { frame.sees.unshift(target.code!.in); Interpreter.touch(frame); this.notify(frame); }
        return this.read(this.cursor_of(target.code!.span), frame);
      }
      if (target.text) { if (target === this.probe?.node) this.probe.other = true; return compose || target.at === undefined || target.at.empty() ? target : this.read(this.cursor_of(target.at), frame); }
      if (target !== frame && !target.none && !(frame.with ??= []).includes(target)) { frame.with.push(target); Interpreter.touch(frame); this.version++; }
      return target;
    }
    return target;
  }

  // Definitions: a head read by its brackets — text, `{ }` for a space, `{x}` capturing x.
  define(head: Text.Node, body: Text.Node | undefined, scope: Node, closure: Node = scope, guard?: { span: Text.Node; in: Node }, written?: Text.Node): Rule | undefined {
    const site = head.source.location !== undefined ? head : written ?? this.running[this.running.length - 1]?.at;
    const made = site === undefined || scope === this.GLOBAL ? undefined : this.rules_on(scope).find(rule => !this.based().has(rule) && rule.at.string === head.string && Interpreter.same(rule.at.source.location !== undefined ? rule.at : rule.lexical, site));
    if (made !== undefined) return made;
    const pieces = this.pieces_of(head, closure);
    if (pieces.length === 0) { this.error('Expected a pattern before `=>`.', head); return; }
    const key = pieces.map(piece => piece.kind === 'literal' ? piece.text : piece.kind === 'gap' ? '{ }' : `{${piece.name}}`).join('') + (guard === undefined || guard.span.string.trim() === '' ? '' : `(${guard.span.string.trim()})`);
    const rule = new Rule(pieces, closure, head, key, this.order++, body);
    if (guard !== undefined && guard.span.string.trim() !== '') rule.guard = guard;
    if (body !== undefined) {
      const word = this.token(this.cursor_of(body), body.begin);
      if (word > body.begin && body.source.value.slice(body.begin, word) === 'external' && this.lookup(closure, 'external') === this.EXTERNAL) {
        const name = this.token_end(this.cursor_of(body), this.spaces(this.cursor_of(body), word), closure);
        rule.native = body.source.value.slice(this.spaces(this.cursor_of(body), word), name);
        const native = Natives[rule.native], cursor = this.cursor_of(body), words: Text.Node[] = [];
        let at = name, plain = true;
        while (plain) {
          const from = this.spaces(cursor, at);
          if (from >= cursor.limit) break;
          const to = this.token_end(cursor, from, closure);
          if (to === from) plain = false;
          else { words.push(cursor.span(from, to - 1)); at = to; }
        }
        if (plain && native !== undefined && !native.raw && words.length === native.arity && words.length > 0) { rule.direct = words; for (const word of words) this.stable_sites.add(word); }
      }
    }
    if (body !== undefined && pieces[0]?.kind !== 'capture') { const inner = this.inner(body) ?? body, cursor = this.cursor_of(inner), from = this.spaces(cursor, inner.begin), to = this.token_end(cursor, from, closure); if (to > from && this.spaces(cursor, to) >= cursor.limit && pieces.some(piece => piece.kind === 'capture' && piece.name === inner.source.value.slice(from, to))) rule.passes = cursor.span(from, to - 1); }
    if (body !== undefined) for (const found of body.string.matchAll(/\bexternal\s+([^\s()]+)/g)) if (Natives[found[1]] === Natives.rule || Natives[found[1]] === Natives.define) rule.defines = true;
    this.add_rule(scope, rule);
    this.definitions.push(`${scope === this.GLOBAL ? 'GLOBAL' : ''}::${key}`);
    return rule;
  }
  private parsed = new WeakMap<Text.Source, Map<number, WeakMap<Node, Piece[]>>>();
  pieces_of(head: Text.Node, closure: Node): Piece[] {
    let by = this.parsed.get(head.source);
    if (by === undefined) this.parsed.set(head.source, by = new Map());
    const span = head.begin * 65536 + (head.end - head.begin);
    let held = by.get(span);
    if (held === undefined) by.set(span, held = new WeakMap());
    let pieces = held.get(closure);
    if (pieces === undefined) { pieces = this.pieces(head, closure); held.set(closure, pieces); }
    return pieces;
  }
  pieces(span: Text.Node, frame: Node): Piece[] {
    const text = span.source.value, end = span.end + 1, out: Piece[] = [];
    const add = (piece: Piece, at: number) => { if (out.length > 0 && at > span.begin && !/\s/.test(text[at - 1])) piece.tight = true; out.push(piece); };
    const words = (from: number, to: number) => { for (const found of text.slice(from, to).matchAll(/\S+/g)) add({ kind: 'literal', text: found[0] }, from + found.index!); };
    let j = span.begin, run = j;
    while (j < end) {
      const shut = text[j] === '[' ? text.indexOf(']', j) : -1;
      const inner = shut > j && shut < end ? text.slice(j + 1, shut) : '';
      if (Interpreter.word.test(inner.trim()[0] ?? '') && !inner.includes('{')) {
        words(run, j);
        const piece = this.capture(span.span(j + 1, shut - 1), frame);
        if (piece.kind === 'capture') add({ ...piece, raw: true, operator: true }, j);
        j = run = shut + 1;
        continue;
      }
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
    const naming: { scope: Node; hole: Node; name?: string } = { scope, hole };
    this.naming = naming;
    this.trying = 0;
    let value: Node | undefined;
    const refused = this.diagnostics.refused;
    this.unpainted++;
    try { value = this.quietly(() => this.safely(() => this.read(this.cursor_of(content), scope))); }
    catch (jump) { if (!(jump instanceof Jump)) throw jump; }
    finally { this.naming = was; this.trying = trying; this.unpainted--; }
    const undecided = this.diagnostics.refused > refused;
    this.diagnostics.refused = refused;
    const name = naming.name;
    if (name === undefined) {
      const held = value === undefined ? undefined : this.quietly(() => this.deref(value));
      if (held?.text && held.at !== undefined) { const spelled = held.at.string; if (spelled.trim() === '' && !spelled.includes('\n')) return { kind: 'gap' }; return { kind: 'literal', text: spelled.includes('\n') && spelled.trim() === '' ? '\n' : spelled }; }
      return { kind: 'capture', name: written, raw: false, typed: false, optional: false, content };
    }
    const typed = scope.own(name) !== hole && scope.own(name) !== undefined;
    const optional = /\?/.test(written.replace(/`[^`]*`/g, '')) && !typed;
    return { kind: 'capture', name, raw: scope.raw === true, typed, optional, content, within: frame, undecided: undecided && !typed, decided: this.declared, type: typed ? scope.own(name) : undefined };
  }
  decide(piece: Piece & { kind: 'capture' }) {
    this.sensitive++;
    if (this.checking.has(piece)) return;
    this.checking.add(piece);
    let again: Piece;
    try { again = this.capture(piece.content!, piece.within!); } finally { this.checking.delete(piece); }
    if (again.kind !== 'capture') { piece.undecided = false; return; }
    piece.typed = again.typed;
    piece.type = again.type;
    piece.optional = again.optional;
    piece.undecided = again.undecided;
    piece.decided = this.declared;
  }
  // A parameter pattern fits what was captured: one free name is the argument, several are a list, none continues from the argument.
  fits(rule: Rule, captures: Map<string, Text.Node>, frame: Node): boolean {
    this.sensitive++;
    this.volatile++;
    const piece = rule.pattern.find((p): p is Piece & { kind: 'capture' } => p.kind === 'capture');
    const span = piece === undefined ? undefined : captures.get(piece.name);
    if (span === undefined || rule.guard === undefined) return true;
    const pattern = rule.guard.span;
    const scratch = (): Node => Object.assign(new Node(pattern), { parent: rule.guard!.in, bare: true });
    const reading = (scope: Node, first?: Node, from?: Node): { names: string[]; refused: boolean; value?: Node } => {
      const naming: { scope: Node; hole: Node; name?: string; names?: string[]; first?: Node } = { scope, hole: Object.assign(new Node(pattern), { text: true }), names: [], first };
      const was = this.naming, trying = this.trying, before = this.diagnostics.refused;
      this.naming = naming;
      this.trying = 0;
      let value: Node | undefined;
      try { value = this.quietly(() => this.safely(() => { const read = from === undefined ? this.read(this.cursor_of(pattern), scope) : this.statement(this.cursor_of(pattern), scope, from); return read === undefined ? undefined : this.deref(read, false) ?? read; })); }
      catch (jump) { if (!(jump instanceof Jump)) throw jump; }
      finally { this.naming = was; this.trying = trying; }
      const failed = this.diagnostics.refused > before;
      this.diagnostics.refused = before;
      return { names: naming.names!, refused: failed, value };
    };
    const present = (read: { refused: boolean; value?: Node }) => !read.refused && read.value !== undefined && !read.value.none;
    const argument = this.lazy(span, frame);
    let memo = rule.fitting;
    if (memo === undefined || memo.declared !== this.declared || memo.rules !== this.rules_version) memo = rule.fitting = { declared: this.declared, rules: this.rules_version, by: new Map() };
    const found = memo.found ??= reading(scratch());
    if (found.names.length === 1 && pattern.string.trim() === found.names[0]) return true;
    if (found.names.length > 1) return !found.refused;
    const value = this.quietly(() => this.deref(argument, false));
    const on = value === undefined ? undefined : this.rules_on(value);
    const known = value === undefined ? undefined : memo.by.get(value);
    if (known !== undefined && known.on === on) return known.fit;
    const fit = found.names.length === 1 ? present(reading(scratch(), argument)) : present(reading(scratch(), undefined, argument));
    if (value !== undefined && rule.fitting === memo && memo.declared === this.declared && memo.rules === this.rules_version && this.rules_on(value) === on) memo.by.set(value, { fit, on: on! });
    return fit;
  }
  // What stands between two operands: the longest spelling that begins a rule taking one operand, on the left operand or in reach.
  filtered = new Map<string, { declared: number; fits: boolean; missing: Set<string> }>();
  missing?: Set<string>;
  private spellings = new WeakMap<Node, { version: number; operators: Rule[] }>();
  operator_at(cursor: Text.Node, j: number, frame: Node, receiver?: Node): { text: string; rule: Rule } | undefined {
    const text = cursor.source.value;
    if (!Interpreter.run(text[j] ?? ' ')) return undefined;
    const held = receiver === undefined ? undefined : this.quietly(() => this.deref(receiver, false));
    let best: { text: string; rule: Rule } | undefined;
    if (held !== undefined && !held.none) best = this.longest_operator(this.operators(held, false), text, j, best);
    return this.longest_operator(this.operators(frame, true), text, j, best);
  }
  longest_operator(rules: Rule[], text: string, j: number, best: { text: string; rule: Rule } | undefined): { text: string; rule: Rule } | undefined {
    for (const rule of rules) {
      const first = rule.pattern[0] as { text: string };
      if (text.startsWith(first.text, j) && (best === undefined || first.text.length > best.text.length)) best = { text: first.text, rule };
    }
    return best;
  }
  operators(of: Node, scope: boolean): Rule[] {
    const known = this.spellings.get(of);
    if (known?.version === this.version) return known.operators;
    const rules = scope ? [...this.rules_of(of), ...this.based()] : this.rules_on(of);
    const found = rules.filter(rule => { const [first, second] = rule.pattern; return rule.pattern.length === 2 && first.kind === 'literal' && second.kind === 'capture' && Interpreter.run(first.text[0]); });
    this.spellings.set(of, { version: this.version, operators: found });
    return found;
  }
  // An operator's filter is asked of the method it names.
  static site(at: Text.Node | undefined): string { return at === undefined ? '' : `${at.source.location ?? at.string}:${at.begin}`; }
  operator_fits(piece: Piece & { kind: 'capture' }, spelled: { text: string; rule: Rule }): boolean {
    this.sensitive++;
    const key = `${Interpreter.site(piece.content)}|${spelled.rule.key}|${Interpreter.site(spelled.rule.at.source.location !== undefined ? spelled.rule.at : spelled.rule.lexical)}`;
    const known = this.filtered;
    const held = known.get(key);
    if (held !== undefined && (held.declared === this.declared || ![...held.missing].some(name => this.GLOBAL.own(name) !== undefined))) return held.fits;
    if (this.checking.has(piece)) return false;
    this.checking.add(piece);
    const missing = this.missing;
    this.missing = new Set();
    try { const { fits } = this.operator_checked(piece, spelled); known.set(key, { declared: this.declared, fits, missing: this.missing }); return fits; } finally { this.checking.delete(piece); this.missing = missing; }
  }
  operator_checked(piece: Piece & { kind: 'capture' }, spelled: { text: string; rule: Rule }): { fits: boolean; settled: boolean } {
    const scope = new Node(piece.content);
    scope.parent = piece.within ?? this.GLOBAL;
    scope.set(piece.name, this.rule_value(spelled.rule));
    const refused = this.diagnostics.refused;
    const value = this.quietly(() => this.safely(() => this.read(this.cursor_of(piece.content!), scope)));
    const settled = this.diagnostics.refused === refused;
    const fits = settled && value !== undefined && !this.quietly(() => this.deref(value, false))?.none;
    this.diagnostics.refused = refused;
    return { fits, settled };
  }
  private static opening = new Set(['{', '(', '[']);
  private static closing = new Set(['}', ')', ']']);
  private groups = new Map<string, Map<number, number>>();
  group_end(text: string, j: number, end: number): number {
    if (!Interpreter.opening.has(text[j])) return j;
    let held = this.groups.get(text);
    if (held === undefined) this.groups.set(text, held = new Map());
    let close = held.get(j);
    if (close === undefined) { close = this.group_close(text, j); held.set(j, close); }
    return close >= 0 && close <= end ? close : j;
  }
  group_close(text: string, j: number): number {
    let depth = 0;
    for (let k = j; k < text.length; k++) {
      if (text[k] === '`') { const q = text.indexOf('`', k + 1); if (q < 0) return -1; k = q; continue; }
      if (Interpreter.opening.has(text[k])) depth++;
      else if (Interpreter.closing.has(text[k])) { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
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
  writing(site: Text.Node): Text.Node | undefined {
    return this.holding(site)?.at ?? this.running[this.running.length - 1]?.at;
  }
  define_in(scope: Node, tail: Node, body: Node, at: Text.Node, parameters?: Node): Node | undefined {
    const pattern = parameters === undefined ? undefined : this.written(parameters);
    const guard = pattern?.code === undefined ? undefined : { span: this.inner(pattern.code.span) ?? pattern.code.span, in: pattern.code.in };
    const place = this.location(scope);
    const spelled = this.text(this.deref(tail, false) ?? tail);
    body = this.written(body) ?? body;
    const written = body.code?.span ?? body.at;
    if (written === undefined) return undefined;
    if (place?.place !== undefined && !place.place.member) {
      const head = Object.assign(Text.Node.string(place.place.name + spelled), {});
      const lexical = this.writing(at);
      const rule = this.define(head, this.inner(written) ?? written, place.place.in, body.code?.in ?? place.place.in, guard, lexical);
      if (rule !== undefined) rule.lexical = lexical;
      return rule === undefined ? undefined : this.rule_value(rule);
    }
    const into = this.deref(scope, false);
    if (into === undefined || into.none) return undefined;
    const lexical = this.writing(at);
    const rule = this.define(Text.Node.string(spelled), this.inner(written) ?? written, into, body.code?.in ?? into, guard, lexical);
    if (rule !== undefined) rule.lexical = lexical;
    return rule === undefined ? undefined : this.rule_value(rule);
  }
  private methods = new WeakMap<Rule[], Map<string, Rule>>();
  method_named(frame: Node, name: string, at?: Text.Node): Node | undefined {
    const rules = this.rules_of(frame);
    let index = this.methods.get(rules);
    if (index === undefined) { index = new Map(); for (const rule of rules) if (rule.pattern.length === 2 && rule.pattern[0].kind === 'literal' && rule.pattern[1].kind === 'capture' && !index.has(rule.pattern[0].text)) index.set(rule.pattern[0].text, rule); this.methods.set(rules, index); }
    const rule = index.get(name);
    if (rule === undefined) return undefined;
    return Object.assign(new Node(at), { fn: this.rebuild(['method', rule, frame]) });
  }
  rebuild(recipe: unknown[]): Native {
    const made = this.made_native(recipe);
    made.recipe = recipe;
    return made;
  }
  made_native(recipe: unknown[]): Native {
    switch (recipe[0]) {
      case 'external': return { arity: 1, raw: true, fn: ({ interpreter, frame, args: [name] }: Args) => interpreter.external(name, frame) };
      case 'forward': return { arity: 1, raw: true, fn: (): Node | undefined => undefined };
      case 'style': { const node = recipe[1] as Node; return { arity: 1, fn: ({ interpreter, args: [target] }: Args) => target === undefined ? undefined : interpreter.decorate(target.code !== undefined && !target.program && interpreter.location(target)?.place !== undefined ? interpreter.location(target)! : target, node) }; }
      case 'method': {
        const rule = recipe[1] as Rule, frame = recipe[2] as Node, capture = (rule.pattern[1] as { name: string }).name;
        return { arity: 1, fn: ({ interpreter, args: [argument], at: where }: Args) => interpreter.apply({ rule, begin: 0, end: 0, reach: 0, captures: new Map(), literals: [] }, frame, where, new Map([[capture, argument ?? interpreter.NONE]])) };
      }
      case 'taking': {
        const receiver = recipe[1] as Node, taking = recipe[2] as Rule[];
        return { arity: 1, fn: ({ interpreter, args: [argument], at }: Args) => {
          if (argument === undefined) return undefined;
          const span = argument.code?.span ?? argument.at ?? at, frame = argument.code?.in ?? interpreter.GLOBAL;
          for (const rule of taking) {
            const captures = new Map([[(rule.pattern[1] as { name: string }).name, span]]);
            if (rule.guard !== undefined && rule.overloaded && !interpreter.fits(rule, captures, frame)) continue;
            return interpreter.apply({ rule, begin: 0, end: 0, reach: 0, captures, literals: [], receiver }, frame, at);
          }
          return undefined;
        } };
      }
    }
    throw new Error(`No native is made from ${String(recipe[0])}.`);
  }
  rule_value(rule: Rule): Node {
    let node = rule.value_node;
    if (node === undefined) { node = new Node(rule.at); rule.value_node = node; node.rule_of = rule; }
    return node;
  }

  native(key: string, at?: Text.Node): Native | undefined { return Natives[key]; }
  private natives_at = new WeakMap<Text.Node, { key: string; native?: Native; node?: Node }>();
  external(name: Node | undefined, frame: Node): Node | undefined {
    if (name === undefined) return undefined;
    const site = name.at, cached = site === undefined || name.place !== undefined || name.code !== undefined ? undefined : this.natives_at.get(site);
    if (cached !== undefined && cached.key === this.text(name)) {
      if (cached.node !== undefined) return cached.node;
      if (cached.native !== undefined && cached.native.arity === 0) return cached.native.fn({ interpreter: this, frame, args: [], at: site! });
    }
    const key = this.text(name), native = this.native(key, name.at);
    if (native === undefined) { this.error(`Expected method \`${key}\` to be externally defined by the runtime, but it wasn't.`, name.at); return undefined; }
    if (native.arity === 0) { if (site !== undefined && name.place === undefined && name.code === undefined) this.natives_at.set(site, { key, native }); return native.fn({ interpreter: this, frame, args: [], at: name.at! }); }
    if (site === undefined) return Object.assign(new Node(site), { fn: native });
    let by = this.externals.get(site.source);
    if (by === undefined) this.externals.set(site.source, by = new Map());
    const key_at = `${site.begin}:${site.end}:${key}`;
    let node = by.get(key_at);
    if (node === undefined) by.set(key_at, node = Object.assign(new Node(site), { fn: native }));
    if (name.place === undefined && name.code === undefined) this.natives_at.set(site, { key, native, node });
    return node;
  }

  // Passes: the entrypoint is read twice, so what it writes later is known where it is read first.
  definitions: string[] = [];
  interpret(srcs: Text.Source[]) { for (const _ of this.derive(srcs)); }
  *derive(srcs: Text.Source[]): Generator<void> {
    const derived = this.copy_of !== undefined;
    if (this.copy_of !== undefined) { this.clone_from(this.copy_of); this.copy_of = undefined; }
    this.begin_pass();
    const mine = srcs.filter(src => (!derived || this.owns(src)) && this.reads(src));
    this.pending = [];
    this.done = new Set();
    const eager = this.program?.eager;
    const boot = derived ? undefined : Boot.of(this, mine);
    this.boot = boot;
    const resume = boot?.restore() ?? { phase: 0, index: -1 };
    try {
      for (let index = 0; index < mine.length; index++) {
        const src = mine[index];
        if (resume.phase > 0 || index <= resume.index) continue;
        if (this.done.has(src)) continue;
        const reads = src.is_entrypoint || eager === undefined || eager(src);
        boot?.decided(src, reads);
        if (!reads) continue;
        this.done.add(src);
        this.pending = this.pending.filter(other => other !== src);
        this.read_source(src);
        if (src.is_entrypoint) { this.read_source(src); if (!derived) this.pending = mine.filter(other => !other.is_entrypoint && !this.done.has(other)); }
        this.after(src);
        boot?.save(0, index);
        yield;
      }
      for (let index = 0; index < mine.length; index++) {
        const src = mine[index];
        if (resume.phase > 1 || (resume.phase === 1 && index <= resume.index)) continue;
        if (src.is_entrypoint || !this.done.has(src) || (![...this.diagnostics.of(src)].some(entry => entry.message.startsWith('Unresolved')) && !this.diagnostics.files(src))) continue;
        this.read_source(src);
        boot?.save(1, index);
        yield;
      }
    } finally { this.boot = undefined; }
    this.end_pass();
  }
  boot?: Boot;
  saved_state(mine: Text.Source[]): Record<string, unknown> {
    const externals = new Map<Text.Source, Map<string, Node>>();
    for (const src of mine) { const held = this.externals.get(src); if (held !== undefined) externals.set(src, held); }
    return {
      GLOBAL: this.GLOBAL, NONE: this.NONE, EXTERNAL: this.EXTERNAL, BASE: this.BASE, made: this.made, theme: this.theme,
      version: this.version, declared: this.declared, rules_version: this.rules_version, order: this.order, rules: Rule.count,
      definitions: this.definitions, given_names: this.given_names, held_texts: this.held_texts, filtered: this.filtered, rejected: this.rejected,
      named: this.named, templates: this.templates, template: this.template, pending: this.pending, done: [...this.done], externals, operators_written: this.operators_written,
      diagnostics: this.diagnostics.items,
    };
  }
  restore_state(state: any, mine: Text.Source[]) {
    this.GLOBAL = state.GLOBAL; Node.globals.add(this.GLOBAL); Node.complete = false; this.NONE = state.NONE; this.EXTERNAL = state.EXTERNAL; this.BASE = state.BASE; this.made = state.made; this.theme = state.theme;
    this.version = state.version + 1; this.declared = state.declared; this.rules_version = state.rules_version + 1; this.order = state.order;
    Rule.count = Math.max(Rule.count, state.rules);
    this.definitions = state.definitions; this.given_names = state.given_names; this.held_texts = state.held_texts; this.filtered = state.filtered; this.rejected = state.rejected;
    this.named = state.named; this.templates = state.templates; this.template = state.template; this.pending = state.pending; this.done = new Set(state.done); this.operators_written = state.operators_written ?? new Map();
    for (const [src, held] of state.externals as Map<Text.Source, Map<string, Node>>) this.externals.set(src, held);
    for (const [src, held] of state.diagnostics as Map<Text.Source | undefined, Map<Text.Node | undefined, Diagnostic[]>>) this.diagnostics.items.set(src, held);
  }
  // A name nothing has written yet is looked for in the files not read so far, in their order.
  pending: Text.Source[] = [];
  done = new Set<Text.Source>();
  load(name: string): boolean {
    const eager = this.program?.eager !== undefined;
    const named = this.pending.some(src => src.name === `${name}.ray`);
    const reading = this.reading;
    if (!named && reading !== undefined && new RegExp(`(^|[^\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'u').test(reading.source.value.slice(reading.end + 1))) return false;
    while (this.pending.length > 0) {
      const at = eager || named ? this.pending.findIndex(src => src.name === `${name}.ray`) : 0;
      if (at < 0) return false;
      const [src] = this.pending.splice(at, 1);
      this.done.add(src);
      const depth = this.depth, running = this.running, reading = this.reading;
      this.depth = 0; this.running = [];
      try { this.diagnostics.unmuted(() => this.read_source(src)); this.after(src); }
      finally { this.depth = depth; this.running = running; this.reading = reading; }
      if (this.GLOBAL.own(name) !== undefined) return true;
    }
    return false;
  }
  read_source(src: Text.Source) {
    this.boot?.read(src);
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
  operation(found: Match, frame: Node, at: Text.Node, given?: Map<string, Node>): Node | undefined { return undefined; }
  after(src: Text.Source) {}
  reads(src: Text.Source): boolean { return true; }
  copy(): Interpreter { const copy = new (this.constructor as typeof Interpreter)(this.diagnostics); copy.copy_of = this; return copy; }
  clone_from(from: Interpreter): { node: (n: Node | undefined) => Node | undefined; rule: (r: Rule) => Rule } {
    const seen = new Map<Node, Node>();
    const rules = new Map<Rule, Rule>();
    const node = (n: Node | undefined): Node | undefined => {
      if (n === undefined) return undefined;
      const known = seen.get(n);
      if (known !== undefined) return known;
      const copy = Object.assign(Object.create(Object.getPrototypeOf(n)) as Node, n);
      copy.scoped = copy.ruled = copy.shaped = copy.watchers = copy.heading = copy.held_by = copy.reached = copy.visited = undefined;
      copy.constructed = undefined;
      copy.rule_of = copy.marked_value = undefined;
      copy.marked_names = undefined;
      seen.set(n, copy);
      copy.parent = node(n.parent);
      if (n.with) copy.with = n.with.map(x => node(x)!);
      if (n.sees) copy.sees = n.sees.map(x => node(x)!);
      if (n.names) copy.names = new Map([...n.names].map(([k, v]) => [k, node(v)!]));
      if (n.rules) copy.rules = n.rules.map(rule);
      if (n.code) copy.code = { span: n.code.span, in: node(n.code.in)! };
      if (n.place) copy.place = { ...n.place, in: node(n.place.in)! };
      if (n.value) copy.value = node(n.value);
      for (const key of Object.keys(copy) as (keyof Node)[]) if (key !== 'parent' && key !== 'value' && copy[key] instanceof Node) (copy as any)[key] = node(n[key] as Node);
      return copy;
    };
    const rule = (r: Rule): Rule => {
      const known = rules.get(r);
      if (known !== undefined) return known;
      const copy = Object.assign(Object.create(Rule.prototype), r) as Rule;
      copy.id = ++Rule.count;
      copy.fitting = undefined;
      copy.reduced = undefined;
      copy.value_node = undefined;
      rules.set(r, copy);
      if (r.value_node !== undefined) { copy.value_node = node(r.value_node)!; copy.value_node.rule_of = copy; }
      copy.closure = node(r.closure)!;
      copy.pattern = r.pattern.map(piece => piece.kind === 'capture' && (piece.within !== undefined || piece.type !== undefined) ? { ...piece, within: node(piece.within), type: node(piece.type) } : piece);
      copy.home = node(r.home);
      if (r.guard !== undefined) copy.guard = { span: r.guard.span, in: node(r.guard.in)! };
      return copy;
    };
    this.GLOBAL = node(from.GLOBAL)!;
    Node.globals.add(this.GLOBAL);
    this.single = false;
    this.NONE = node(from.NONE)!;
    this.EXTERNAL = node(from.EXTERNAL)!;
    this.BASE = node(from.BASE);
    this.made = node(from.made);
    this.theme = node(from.theme);
    this.filtered = new Map(from.filtered);
    this.operators_written = new Map(from.operators_written);
    this.held_texts = new Map([...from.held_texts].filter(([, held]) => held.value === undefined));
    this.order = from.order;
    this.given_names = new Set(from.given_names);
    this.version++;
    this.rules_version++;
    return { node, rule };
  }

  // Painting: what is read is painted by the marks on what it names, on its value, or on the rule that read it.
  serving = false
  painting(source: Text.Source): boolean { const program = this.program; return program?.serving === true && (program.eager === undefined || program.active.has(source.location)); }
  paints: Text.Node[] = []
  private unpainted = 0
  sites: Map<string, Text.Node> = new Map()
  painted_count = 0
  get painted() { return this.painted_count; }
  theme?: Node
  building?: Node
  begin_pass() { this.paints = []; this.sites = new Map(); this.read_at = new Map(); this.bodies = new Set(); this.dried = new Map(); this.dry_painted = new Map(); this.paint_index = new Map(); }
  end_pass() { this.dry_paint(); this.bodies = new Set(); this.painted_count++; }
  read_at = new Map<Text.Source, Set<number>>();
  private paint_index = new Map<Text.Source, Map<number, number>>();
  bodies = new Set<Rule>();
  dry_paint() {
    const done = new Set<string>();
    for (const rule of this.bodies) {
      const key = `${rule.body!.source.location}:${rule.body!.begin}`;
      if (done.has(key)) continue;
      done.add(key);
      const frame = new Node(rule.body);
      frame.parent = rule.closure;
      this.quietly(() => this.safely(() => this.dry(this.cursor_of(this.inner(rule.body!) ?? rule.body!), frame, 0)));
    }
    for (const source of this.read_at.keys()) {
      if (!this.painting(source)) continue;
      const cursor = new Text.Node(source);
      cursor.end = source.value.length - 1;
      this.quietly(() => this.safely(() => this.dry(cursor, this.GLOBAL, 0)));
    }
  }
  dry_match(found: Match, cursor: Text.Node, frame: Node, depth: number, painted: boolean = true) {
    if (painted && found.rule.style !== undefined) { const style = found.rule.style, at = cursor.span(found.begin, found.end - 1); for (const [from, to] of found.literals) this.dry_paint_span(at.span(from, to), () => style.style); }
    for (const piece of found.rule.pattern) {
      if (piece.kind !== 'capture' || !found.captures.has(piece.name)) continue;
      const span = found.captures.get(piece.name)!;
      if (span.end < span.begin) continue;
      if (piece.content !== undefined && painted) this.run_content(piece, span, frame);
      if (!piece.raw && !piece.operator) this.dry(this.cursor_of(span), frame, depth + 1);
    }
  }
  private dried = new Map<Text.Source, Set<number>>();
  private dry_painted = new Map<Text.Source, Set<number>>();
  dry_paint_span(span: Text.Node, style: () => string | undefined) {
    let held = this.dry_painted.get(span.source);
    if (held === undefined) this.dry_painted.set(span.source, held = new Set());
    const key = span.begin * 65536 + (span.end - span.begin);
    if (held.has(key)) return;
    held.add(key);
    this.paint(span, style);
  }
  dry(cursor: Text.Node, frame: Node, depth: number) {
    const read = this.read_at.get(cursor.source), text = cursor.source.value;
    if (depth > 32) return;
    let dried = this.dried.get(cursor.source);
    if (dried === undefined) this.dried.set(cursor.source, dried = new Set());
    const key = cursor.cursor * 65536 + (cursor.limit - cursor.cursor);
    if (dried.has(key)) return;
    dried.add(key);
    for (this.blank(cursor); !cursor.done(); this.blank(cursor)) {
      const start = cursor.cursor, end = this.statement_end(cursor, start, frame);
      const found = this.tried(() => this.best(this.heads(frame), cursor, frame, undefined, true));
      const painted = !read?.has(start);
      let receiver: Node | undefined;
      if (found !== undefined) { this.dry_match(found, cursor, frame, depth, painted); cursor.cursor = found.end; }
      else {
        const name = this.token(cursor, start);
        if (name > start && Interpreter.word.test(text[start])) {
          receiver = this.place(frame, cursor.span(start, name - 1));
          if (painted) { if (this.quietly(() => this.lookup(frame, receiver!.place!.name)) === undefined) this.dry_paint_span(receiver.at!, () => 'variable'); else { const place = receiver; this.dry_paint_span(receiver.at!, () => this.place_style(place)); } }
          cursor.cursor = name;
        }
      }
      for (let steps = 0; receiver !== undefined && steps < 16 && !cursor.done() && cursor.cursor < end; steps++) {
        const step = this.tried(() => this.best_on(receiver!, frame, cursor));
        if (step === undefined || step.end <= cursor.cursor) break;
        this.dry_match(step, cursor, frame, depth, painted);
        cursor.cursor = step.end;
      }
      cursor.cursor = Math.max(end, start + 1);
    }
  }
  paint(span: Text.Node | undefined, style: () => string | undefined) {
    if (!this.program?.serving || this.unpainted > 0 || span === undefined || span.source.location === undefined || !this.owns(span.source) || !this.painting(span.source)) return;
    const painted = span.span(span.begin, span.end);
    painted.style = style;
    let index = this.paint_index.get(span.source);
    if (index === undefined) this.paint_index.set(span.source, index = new Map());
    const key = span.begin * 65536 + (span.end - span.begin), at = index.get(key);
    if (at !== undefined) {
      const previous = this.paints[at], before = previous.style as (() => string | undefined) | undefined, depth = ((previous as { depth?: number }).depth ?? 0) + 1;
      if (before !== undefined && depth <= 4) { painted.style = () => style() ?? before(); (painted as { depth?: number }).depth = depth; }
      this.paints[at] = painted;
      return;
    }
    index.set(key, this.paints.length);
    this.paints.push(painted);
  }
  paint_place(place: Node) {
    if (!this.program?.serving) return;
    this.paint(place.at, () => this.place_style(place));
  }
  place_style(place: Node): string | undefined { const marks = (place as { marks?: Node }).marks; if (marks) return marks.style; const scope = place.place!.member ? place.place!.in : this.holder(place.place!.in, place.place!.name); const named = scope && scope?.marked_names?.get(place.place!.name); if (named) return named.style; if (place.place!.member) return undefined; const bound = scope?.own(place.place!.name); if (bound === undefined) return undefined; const local = scope !== this.GLOBAL && scope!.body !== undefined; if (bound.code !== undefined || bound.place !== undefined) return local ? 'parameter' : 'variable'; const marked = local ? undefined : bound.marked_value?.style; if (marked !== undefined) return marked; return bound.fn !== undefined || bound.rule_of !== undefined ? 'function' : 'variable'; }
  paint_rule(found: Match, at: Text.Node) {
    const style = found.rule.style;
    if (style !== undefined) for (const [from, to] of found.literals) this.paint(at.span(from, to), () => style.style);
  }
  decorate(target: Node, style: Node): Node {
    const held = target.place !== undefined || target.code !== undefined ? this.quietly(() => this.deref(target, false)) : target;
    const rule = held?.rule_of;
    if (rule !== undefined) { rule.style = style; this.paint_head(rule, style); return target; }
    if (target.place !== undefined && held?.text && held.at !== undefined) { this.paint(held.at, () => style.style); return target; }
    if (target.place !== undefined && held !== undefined && !held.none && held !== this.GLOBAL && !held.text) held.marked_value = style;
    if (target.place !== undefined) { const marked = Object.assign(new Node(target.at), { place: target.place, marks: style }); this.paint(target.at, () => style.style); return marked; }
    if (target.code !== undefined && target.value === undefined) { this.paint(target.code.span, () => style.style); return target; }
    if (target.text) { this.paint(target.at, () => style.style); return target; }
    target.marked_value = style;
    return target;
  }
  paint_head(rule: Rule, style: Node | undefined) {
    const text = rule.at.source.value;
    let from = rule.at.begin;
    for (const piece of rule.pattern) {
      if (piece.kind === 'capture') {
        if (piece.content !== undefined || piece.operator) continue;
        const at = text.indexOf(`{${piece.name}}`, from);
        if (at < 0 || at > rule.at.end) continue;
        this.paint(rule.at.span(at + 1, at + piece.name.length), () => 'parameter');
        from = at + piece.name.length + 2;
        continue;
      }
      if (piece.kind !== 'literal' || piece.text.trim() === '' || style === undefined) continue;
      const at = text.indexOf(piece.text, from);
      if (at < 0 || at > rule.at.end) return;
      this.paint(rule.at.span(at, at + piece.text.length - 1), () => style.style);
      from = at + piece.text.length;
    }
  }
  marked_place(at: Node, scope: Node) {
    const marks = (at as { marks?: Node }).marks;
    if (marks === undefined) return;
    (scope.marked_names ??= new Map()).set(at.place!.name, marks);
  }
  style(name: string): Node {
    const node = new Node();
    node.style = name;
    node.fn = this.rebuild(['style', node]);
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
  complain(level: Diagnostic['level'], message: string, at?: Text.Node) { const owner = this.reading?.source; this.diagnostics.report({ level, message, node: at, at, owner: owner !== undefined && owner !== at?.source ? owner : undefined }); }
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
