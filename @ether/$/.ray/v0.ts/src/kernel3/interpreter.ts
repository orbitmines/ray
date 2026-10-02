import { Text, type Source } from './text.ts';
import { env } from './env.ts';
import { Diagnostics, type Diagnostic } from './diagnostics.ts';
import type { Program } from './program.ts';
import { Natives } from './natives.ts';

export type Key = string | Node
export type Args = { interpreter: Interpreter; frame: Node; self?: Node; method: Node; args: Node[]; at: Text.Node; words?: string[]; given?: Map<string, Node>; written?: () => Node | undefined }
export type Method = (args: Args) => Node | undefined;
export type Native = { arity: number; fn: Method; pure?: boolean; values?: boolean; operation?: boolean }

export type Piece =
  | { kind: 'literal'; text: string }
  | { kind: 'space' }
  | { kind: 'newline'; group?: Text.Node }
  | { kind: 'capture'; name: string; raw: boolean; optional?: boolean; runs: boolean; declared?: Node; declaration?: string; group: Text.Node; within?: Node }
  | { kind: 'operator'; name: string; filter?: string; declaration?: string; group: Text.Node; content: Text.Node }

export class Node {
  declare methods?: Map<Key, Node>

  declare fn?: Method
  declare arity?: number
  declare pure?: boolean
  declare applied?: Node[]
  declare reads?: 'token' | 'rest'

  declare pattern?: Piece[]
  declare params?: string[]
  declare written?: boolean
  declare body?: Text.Node
  declare closure?: Node
  declare inlined?: Node[]
  // What a scope can *see* is not what it is *made of*: a frame whose names
  // are reachable from here is listed apart from the values composed into it,
  // or inlining a block would compose in whatever that block could see.
  declare sees?: Node[]
  declare declared?: Node
  declare param_types?: Text.Node[]
  declare forward?: Text.Node
  declare defines?: boolean
  declare levels?: Node[]
  declare operation?: boolean

  declare parent?: Node
  declare ref?: { scope: Node; key: string; own?: boolean; member?: boolean; self?: Node; through?: Node; literal?: boolean }
  declare lazy?: { span: Text.Node; frame: Node; raw: boolean; probe?: boolean; consumed?: boolean }
  declare value?: Node
  declare literal?: boolean
  declare bytes?: Uint8Array
  declare unknown?: boolean
  declare observed?: string[]
  declare shadows?: string
  declare capture_text?: Text.Node
  declare missing?: string[]
  declare quoted?: boolean
  declare none?: boolean
  declare marks?: Node[]

  declare style?: string
  declare theme?: Map<string, string>
  declare key?: string
  declare children?: Map<string, Node>
  declare owner?: Node
  declare site?: string
  declare members?: Map<string, Node>
  declare given?: Set<string>

  constructor(public diagnostics: Diagnostics, public position?: Text.Node) {}

  get callable(): boolean { return this.fn !== undefined || this.params !== undefined; }
  declare ruled?: boolean
  declare rule_version?: number
  declare rule_keys?: Map<string, Node>
  declare apply_site?: { rule: Node; at: Text.Node; depth: number }
  declare edits?: number
  get rules(): Node[] { return this.methods ? [...this.methods.keys()].filter((x): x is Node => x instanceof Node) : []; }

  // A name is what it is bound to, or the function defined under that name.
  own(key: string): Node | undefined { return this.methods?.get(key) ?? this.named?.get(key); }
  declare outermost?: boolean
  declare named?: Map<string, Node>
  member(key: string): Node | undefined {
    const own = this.members?.get(key) ?? this.methods?.get(key);
    if (own !== undefined || (this.inlined === undefined && this.made_of === undefined)) return own;
    const seen = new Set<Node>();
    for (const scope of this.composed(seen)) {
      const found = scope !== this && scope instanceof Count ? scope.member(key) : scope.members?.get(key) ?? scope.methods?.get(key);
      if (found !== undefined) return found;
    }
  }
  // What a node is made of, as against text inlined into it: a class
  // composing another is made of it, and does not read the frame that one
  // was written in.
  declare made_of?: Node[]
  declare applied_to?: Node
  declare lexical?: Text.Node
  declare defined?: Set<string>
  *composed(seen: Set<Node>): Generator<Node> {
    const queue: Node[] = [this];
    for (let k = 0; k < queue.length; k++) {
      const scope = queue[k];
      if (seen.has(scope)) continue;
      seen.add(scope);
      yield scope;
      if (scope.made_of) queue.push(...scope.made_of);
      if (scope.inlined) queue.push(...scope.inlined);
    }
  }
  // A name is looked up in each scope, then in what that scope is made of
  // and what it sees, before the scope it sits in: text inlined here finds
  // the names of where it was written before those around where it runs.
  lookup(key: string): Node | undefined {
    let links = false;
    for (let scope: Node | undefined = this; scope && !links; scope = scope.parent) links = scope.inlined !== undefined || scope.made_of !== undefined || scope.sees !== undefined;
    if (!links) {
      for (let scope: Node | undefined = this; scope; scope = scope.parent) { const found = scope.own(key) ?? scope.members?.get(key); if (found !== undefined) return found; }
      return undefined;
    }
    const chain = new Set<Node>();
    for (let scope: Node | undefined = this; scope; scope = scope.parent) chain.add(scope);
    for (const scope of this.reading(new Set())) { const found = scope.own(key) ?? (chain.has(scope) ? scope.members?.get(key) : undefined); if (found !== undefined) return found; }
  }
  // Depth-first over the parent chain, entering what each scope is made of
  // and what it sees before its parent, without recursing on the call stack.
  // The outermost scope is where the language itself is written, so it
  // answers last: anything nearer, by any route, is nearer.
  *reading(seen: Set<Node>): Generator<Node> {
    const stack: { scope: Node | undefined; start: Node; k: number; rooted?: boolean }[] = [];
    let outermost: Node | undefined;
    if (!seen.has(this)) { seen.add(this); stack.push({ scope: this, start: this, k: -1 }); }
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.scope === undefined) { stack.pop(); continue; }
      if (top.k === -1) {
        if (top.scope !== top.start) { if (seen.has(top.scope)) { stack.pop(); continue; } seen.add(top.scope); }
        if (top.scope.outermost && top.scope !== this) { outermost = top.scope; stack.pop(); continue; }
        yield top.scope;
        top.k = 0;
      }
      const inlined = top.scope.inlined, made = top.scope.made_of, sees = top.rooted ? undefined : top.scope.sees;
      const composed = inlined?.length ?? 0, of = made?.length ?? 0, seeing = sees?.length ?? 0;
      if (top.k < composed + of + seeing) {
        const k = top.k++;
        const start = k < seeing ? sees![k] : k < seeing + composed ? inlined![k - seeing] : made![k - seeing - composed];
        // What a scope is made of answers with its own names and with what
        // it is itself made of, never with the frames it was written in or
        // reads from: a class does not see another's locals.
        const rooted = top.rooted === true || k >= seeing + composed;
        if (!seen.has(start)) { seen.add(start); stack.push({ scope: start, start, k: -1, rooted }); }
        continue;
      }
      top.scope = top.scope.parent; top.k = -1;
    }
    if (outermost !== undefined) yield outermost;
  }
  static heads = new Set<string>();
  static ruling = 0;
  static names = new Map<string, string[]>();
  static named_keys = new Set<string>();
  set(key: Key, value: Node): Node {
    (this.methods ??= new Map()).set(key, value);
    if (typeof key === 'string' && key.length > 0 && !Node.named_keys.has(key)) {
      Node.named_keys.add(key);
      let keys = Node.names.get(key[0]);
      if (keys === undefined) Node.names.set(key[0], keys = []);
      let at = 0;
      while (at < keys.length && keys[at].length >= key.length) at++;
      keys.splice(at, 0, key);
    }
    if (key instanceof Node && this.ruled !== true) { this.ruled = true; Node.ruling++; }
    if (key instanceof Node) { this.rule_version = (this.rule_version ?? 0) + 1; if (key.key !== undefined) (this.rule_keys ??= new Map()).set(key.key, key); }
    if (key instanceof Node && !value.forward && key.pattern?.length === 1 && key.pattern[0].kind === 'literal') (this.named ??= new Map()).set(key.pattern[0].text.trim(), value);
    if (key instanceof Node && !value.operation) for (const piece of key.pattern ?? []) if (piece.kind === 'literal') for (const part of piece.text.trim().split(/\s+/)) if (part) Node.heads.add(part);
    return value;
  }

  method(string: string | Text.Node, fn: Method, arity: number = 1) {
    if (!(string instanceof Text.Node) && string.includes('{')) string = Text.Node.string(string);
    const node = new Node(this.diagnostics, string instanceof Text.Node ? string : undefined);
    node.fn = fn; node.arity = arity;
    return this.set(string instanceof Text.Node ? new Node(this.diagnostics, string) : string, node);
  }


  clone(seen: Map<Node, Node> = new Map()): Node {
    const existing = seen.get(this); if (existing) return existing;
    const copy: Node = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    seen.set(this, copy);
    const all = (nodes?: Node[]) => nodes?.map(x => x.clone(seen));
    copy.parent = this.parent?.clone(seen);
    copy.closure = this.closure?.clone(seen);
    copy.inlined = this.inlined?.map(x => x.clone(seen));
    copy.made_of = this.made_of?.map(x => x.clone(seen));
    copy.sees = this.sees?.map(x => x.clone(seen));
    copy.value = this.value?.clone(seen);
    copy.applied = all(this.applied);
    if (this.ref) copy.ref = { ...this.ref, scope: this.ref.scope.clone(seen), self: this.ref.self?.clone(seen), through: undefined };
    if (this.lazy) copy.lazy = { ...this.lazy, frame: this.lazy.frame.clone(seen) };
    if (this.theme) copy.theme = new Map(this.theme);
    if (this.children) copy.children = new Map([...this.children].map(([key, child]) => [key, child.clone(seen)]));
    if (this.members) copy.members = new Map([...this.members].map(([key, child]) => [key, child.clone(seen)]));
    if (this.ruled) copy.ruled = true;
    if (this.methods) {
      copy.methods = new Map();
      for (const [key, value] of this.methods)
        copy.methods.set(key instanceof Node ? key.clone(seen) : key, value.clone(seen));
    }
    if (this.named) copy.named = new Map([...this.named].map(([key, value]) => [key, value.clone(seen)]));
    if (this instanceof Count) { const count = copy as Count; count.base = this.base.clone(seen); count.template = this.template.clone(seen); (count as any).before = undefined; }
    return copy;
  }
}

export class Count extends Node {
  constructor(diagnostics: Diagnostics, public count: bigint, public base: Node, public template: Node, public field: string) {
    super(diagnostics);
    this.made_of = [template];
  }
  succ(): Count { return new Count(this.diagnostics, this.count + 1n, this.base, this.template, this.field); }
  private before?: Node;
  member(key: string): Node | undefined {
    if (key === this.field) return this.before ??= this.count > 1n ? new Count(this.diagnostics, this.count - 1n, this.base, this.template, this.field) : this.base;
    return super.member(key);
  }
}

export type ExternalPlan = { word: Text.Node; token: Text.Node; call: Text.Node; args: Text.Node[]; end: number };
export type BodyPlan =
  | { kind: 'pass'; word: string }
  | { kind: 'name'; word: string; names: number }
  | { kind: 'native'; native: Native; words: string[]; spans: Text.Node[] }
  | { kind: 'group'; rule: Node; impl: Node; inner: Text.Node; at: Text.Node }
  | undefined;
export type Flow = { kind: 'label' | 'jump'; end: number; label: Text.Node; condition?: Text.Node };
export type Match = { begin: number; end: number; pattern: number; literals: [number, number, number][]; captures: Map<string, Text.Node>; operators: Map<string, Text.Node>; args: Text.Node[]; receiver?: Node; tight: boolean; read?: Map<string, Node>; given?: (Node | undefined)[] }
export type Found = { rule: Node; impl: Node; match: Match }
export type Head = { pattern: Text.Node[]; params?: string[]; param_names: Text.Node[]; param_types: Text.Node[]; pieces: Piece[]; spelled: string; shared: { rule?: Node; body?: Text.Node } }
export type Rules = readonly (readonly [Node, Node][])[]
export function* each(rules: Rules): Generator<[Node, Node]> { for (const segment of rules) yield* segment; }

export class Interpreter {
  static PASSES = 8;
  static DEPTH = 512;

  program?: Program
  // Whether this interpreter began the language rather than continuing one:
  // what it may read in its first pass follows from that, not from whether
  // the one before it is still held.
  readonly began: boolean;
  constructor(public diagnostics: Diagnostics, public copy_of?: Interpreter) {
    this.began = copy_of === undefined;
    if (copy_of !== undefined) { this.introductions = copy_of.introductions; }
    this.GLOBAL = this.kernel();
  }

  GLOBAL: Node
  BASE?: Node
  // What every value goes through before it is anything: the base's constructor, run once in each value.
  made?: Node
  private constructed = new WeakSet<Node>();
  private constructing = false;
  private made_names = new WeakMap<Node, Set<string>>();
  construct(value: Node) {
    const made = this.made, code = made?.lazy ?? (made?.body !== undefined ? { span: made.body, frame: made.closure ?? this.GLOBAL } : undefined);
    if (code === undefined || this.constructing || this.constructed.has(value) || value.lazy !== undefined) return;
    this.constructed.add(value);
    const sees = value.sees;
    value.sees = [...(sees ?? []), code.frame];
    this.constructing = true;
    const before = new Set<Key>(value.methods?.keys() ?? []);
    try { this.safely(() => this.array(this.cursor_of(this.inner(code.span, code.frame) ?? code.span), value)); }
    finally { value.sees = sees; this.constructing = false; }
    for (const key of value.methods?.keys() ?? []) if (typeof key === 'string' && !before.has(key)) { (value.given ??= new Set()).add(key); let names = this.made_names.get(value); if (names === undefined) this.made_names.set(value, names = new Set()); names.add(key); }
  }
  theme?: Node
  building?: Node

  EXTERNAL: Node
  NONE: Node
  RETURN: Node
  RECUR: Node
  FORWARD: Node

  frames: Map<string, Node> = new Map();
  definitions: string[] = [];

  private kernel(): Node {
    const GLOBAL = new Node(this.diagnostics);
    GLOBAL.key = 'GLOBAL';
    GLOBAL.outermost = true;
    this.EXTERNAL = GLOBAL.method('external', ({ interpreter, args: [name], at, frame }) => interpreter.external(name.position!, at, frame), 1);
    this.EXTERNAL.pure = true;
    this.NONE = Object.assign(new Node(this.diagnostics), { none: true, key: 'None' });
    this.RETURN = Object.assign(new Node(this.diagnostics, Text.Node.string('return\\')), { literal: true, key: 'return\\' });
    this.RECUR = Object.assign(new Node(this.diagnostics, Text.Node.string('recur\\')), { literal: true, key: 'recur\\' });
    this.EXTERNAL.reads = 'token';
    this.FORWARD = GLOBAL.method('forward', ({ interpreter, args: [pattern], frame }) => interpreter.forward(pattern.position!, frame), 1);
    this.FORWARD.reads = 'rest';
    return GLOBAL;
  }

  private seen = new Map<Node, Node>();
  refresh() {
    if (!this.copy_of) return;
    const seen = this.seen = new Map<Node, Node>();
    this.GLOBAL = this.copy_of.GLOBAL.clone(seen);
    this.BASE = this.copy_of.BASE?.clone(seen);
    this.theme = this.copy_of.theme?.clone(seen);
    this.EXTERNAL = this.copy_of.EXTERNAL.clone(seen);
    this.NONE = this.copy_of.NONE.clone(seen);
    this.RETURN = this.copy_of.RETURN.clone(seen);
    this.RECUR = this.copy_of.RECUR.clone(seen);
    this.FORWARD = this.copy_of.FORWARD.clone(seen);
    this.frames = new Map([...this.copy_of.frames].map(([key, frame]) => [key, frame.clone(seen)]));
    this.made = this.copy_of.made?.clone(seen);
    for (const [held, copy] of seen) {
      if (this.copy_of.constructed.has(held)) this.constructed.add(copy);
      const names = this.copy_of.made_names.get(held);
      if (names !== undefined) this.made_names.set(copy, new Set(names));
    }
    this.ids = this.copy_of.ids;
  }

  copy(): Interpreter { return new (this.constructor as typeof Interpreter)(this.diagnostics, this); }

  interpret(srcs: Text.Source[]) {
    const run = this.derive(srcs);
    for (let step = run.next(); !step.done; step = run.next());
  }
  *derive(srcs: Text.Source[]): Generator<void> {
    this.refresh();
    const inherited = new Map([this.GLOBAL, ...this.frames.values()].map(frame => [frame, new Set(frame.methods?.keys() ?? [])]));
    let previous: string | undefined, older: string | undefined;
    for (let pass = 0; pass < Interpreter.PASSES; pass++) {
      this.passing = pass;
      this.ran = new Set(); this.definitions = []; this.touched = new WeakMap(); this.spelled = new Set(); this.claims.clear(); this.pending_rewrites = [];
      Node.heads.clear();
      if (this.copy_of !== undefined) for (const frame of [this.GLOBAL, ...this.frames.values(), ...(this.BASE?.composed(new Set()) ?? [])])
        for (const [key, value] of frame.methods ?? []) if (key instanceof Node && !value.operation) for (const piece of key.pattern ?? []) if (piece.kind === 'literal') for (const part of piece.text.trim().split(/\s+/)) if (part) Node.heads.add(part);
      this.begin_pass(pass);
      srcs.forEach(src => this.diagnostics.forget(src));
      for (const location of this.copy_of?.read_order.keys() ?? []) if (!this.read_order.has(location)) this.read_order.set(location, this.read_order.size);
      srcs.forEach(src => { if (src.location !== undefined && !this.read_order.has(src.location)) this.read_order.set(src.location, this.read_order.size); });
      yield* this.read_pass(srcs);
      this.end_pass();
      this.prune(inherited);
      // Frames are fresh per application, so their numbers say nothing about
      // what was defined; the spelling does.
      const signature = [this.BASE?.key?.replace(/#\d+/g, "#"), ...[...new Set(this.definitions.map(definition => definition.replace(/#\d+/g, '#')))].sort()].join('\n');
      // A pass is read again so that what was written after it was read can
      // be read once more. Where nothing was left unread, reading it again
      // answers the same, so once is enough. Only a project derived from
      // another is settled this way: the language writes itself forwards,
      // and settles by its signature repeating.
      if (this.copy_of !== undefined && !this.unread(srcs)) break;
      if (signature === previous || signature === older) break;
      older = previous;
      previous = signature;
    }
    // What was cloned from is done with: holding it would hold every pass
    // the language has been through.
    this.copy_of = undefined;
    this.seen = new Map();
    this.derived_all(srcs);
  }
  // Whether anything in these sources was read before it was written: a
  // name with nothing behind it, or a `forward` nobody implemented.
  private unread(srcs: Text.Source[]): boolean {
    const here = new Set(srcs.map(src => src.location));
    for (const src of srcs)
      for (const entry of this.diagnostics.of(src)) {
        if (entry.level !== 'error' || !/^Unresolved |declared with `forward`/.test(entry.message)) continue;
        // A name left unread somewhere else is not read by reading these
        // again: what is filed here but written there says nothing about
        // whether this is settled.
        if (entry.at !== undefined && !here.has(entry.at.source.location)) continue;
        return true;
      }
    return false;
  }

  attach(owner: Node, key: string, value: Node): Node {
    let keys = this.touched.get(owner);
    if (!keys) this.touched.set(owner, keys = new Set());
    keys.add(key);
    (owner.members ??= new Map()).set(key, value);
    return value;
  }
  touched: WeakMap<Node, Set<Key>> = new WeakMap();
  private spelled = new Set<string>();
  // Whether a definition is new this pass: a body already defined, defined
  // again on another frame (an instance running its class), is not.
  spelled_before(value: Node): boolean { return value.body === undefined || !this.spelled.has(`${value.body.source.location}:${value.body.begin}`); }
  fresh(key: Key, value: Node): boolean {
    if (!(key instanceof Node) || value.body === undefined) return true;
    const spelled = `${value.body.source.location}:${value.body.begin}`;
    if (this.spelled.has(spelled)) return false;
    this.spelled.add(spelled);
    return true;
  }
  bind(frame: Node, key: Key, value: Node): Node {
    let keys = this.touched.get(frame);
    if (!keys) this.touched.set(frame, keys = new Set());
    keys.add(key);
    // A body already defined this pass, defined again on another frame (an
    // instance running its class), changes no cache: only a new one does.
    const fresh = this.fresh(key, value);
    // A frame whose rules were already looked up gains one: what was looked up is stale.
    const stale = this.stale_rules(frame, key);
    const ruling = key instanceof Node || frame.methods?.get(key)?.forward || value.forward;
    if (fresh && ruling) this.version++;
    else if (stale && ruling) { frame.edits = (frame.edits ?? 0) + 1; this.edit_count++; }
    if (key instanceof Node && value.body !== undefined && !value.forward) this.body_of(value.body);
    // The registry, and a site's memory of its frame, are of where rules live.
    if (fresh && key instanceof Node && frame.key !== undefined) { this.frames.set(frame.key, frame); this.registered(frame); }
    return frame.set(key, value);
  }
  version = 0;
  prune(inherited: Map<Node, Set<Key>>) {
    for (const [key, frame] of [...this.frames]) if (!this.touched.has(frame) && !inherited.has(frame)) this.frames.delete(key);
    const alive = new Set(this.frames.values());
    for (const frame of [this.GLOBAL, ...this.frames.values()]) {
      for (const [local, child] of [...(frame.children ?? [])]) if (!alive.has(child)) frame.children!.delete(local);
      const keep = this.touched.get(frame), base = inherited.get(frame);
      for (const [key, value] of [...(frame.methods ?? [])])
        if (!keep?.has(key) && !base?.has(key) && value !== this.EXTERNAL && value !== this.FORWARD) this.withdraw(frame, key);
    }
  }
  withdraw(frame: Node, key: Key) {
    if (!frame.methods?.delete(key)) return;
    if (key instanceof Node) { frame.rule_version = (frame.rule_version ?? 0) + 1; if (key.key !== undefined && frame.rule_keys?.get(key.key) === key) frame.rule_keys.delete(key.key); this.version++; }
  }
  protected _interpret(src: Text.Source) {
    return this.safely(() => this.array(new Text.Node(src), this.GLOBAL, true, true));
  }

  seeking?: { label: string; source: Text.Source; begin: number; end: number };
  jump(label: Node, condition: Node, frame: Node): Node | undefined {
    if (this.seeking !== undefined) return undefined;
    const met = this.diagnostics.muted(() => this.safely(() => this.deref(condition, false)));
    if (met === undefined || met.none) return undefined;
    const name = this.text(label);
    const found = frame.lookup(name);
    const target = found && (this.diagnostics.muted(() => this.safely(() => this.deref(found, false))) ?? found);
    if (target === this.RETURN || name === this.text(this.RETURN)) throw new Jump(name, undefined, 'end');
    if (target === this.RECUR || name === this.text(this.RECUR)) throw new Jump(name, undefined, 'begin');
    throw new Jump(name);
  }
  // A label answers the seek of the body it is written in: the same name in
  // another body run along the way (a nested loop) is that body's label.
  labelled(name: Node): Node | undefined {
    const seek = this.seeking;
    if (seek === undefined || seek.label !== this.text(name)) return undefined;
    let held: Node = name;
    for (let depth = 0; depth < 64; depth++) {
      const next = held.lazy ? held.value ?? this.reference_of(held) : held.ref ? this.bound(held) : undefined;
      if (next === undefined || next === held) break;
      held = next;
    }
    const at = held.lazy?.span ?? held.position;
    if (at === undefined || (at.source === seek.source && at.begin >= seek.begin && at.end < seek.end)) { this.seeking = undefined; this.landed = at?.begin; }
    return undefined;
  }
  again(frame: Node) { for (const value of frame.methods?.values() ?? []) if (value.lazy) value.value = undefined; }
  private landed?: number;
  private landings = new WeakMap<Text.Source, { value: string; at: Map<string, number> }>();
  landing(source: Text.Source): Map<string, number> {
    const known = this.landings.get(source);
    if (known !== undefined && known.value === source.value) return known.at;
    const at = new Map<string, number>();
    this.landings.set(source, { value: source.value, at });
    return at;
  }
  array(cursor: Text.Node, frame: Node, report: boolean = false, functional: boolean = false): Node | undefined {
    let last: Node | undefined;
    const begin = cursor.cursor;
    // A body that jumps back to an earlier point runs again, so whatever it
    // read lazily has to be read again rather than reused.
    while (true) {
      this.spaces(cursor, true);
      if (cursor.done()) return last;
      const start = cursor.cursor;
      let value: Node | undefined;
      const flow = this.flow_at(cursor, frame);
      try { value = flow !== undefined ? this.run_flow(flow, cursor, frame) : this.expr(cursor, frame); }
      catch (jump) {
        if (jump instanceof Jump && jump.kind === 'end' && jump.value === undefined) jump.value = last;
        if (!(jump instanceof Jump) || this.seeking !== undefined) throw jump;
        if (jump.kind === 'end') {
          const own = jump.site === undefined || Interpreter.within(jump.site, cursor.span(begin, cursor.limit - 1));
          if (!functional || !own) { jump.value ??= last; throw jump; }
          return jump.value ?? last;
        }
        this.looped(frame, jump.kind === 'begin' ? '' : jump.label, cursor.span(start, start));
        if (jump.kind === 'begin') { this.again(frame); cursor.cursor = begin; continue; }
        this.again(frame);
        const place = `${begin}:${cursor.limit}:${jump.label}`;
        const known = this.landing(cursor.source).get(place);
        if (known !== undefined) { cursor.cursor = known; continue; }
        if (!this.spells_label(cursor.source, begin, cursor.limit, jump.label)) { if (!report) throw jump; this.error(`No \`${jump.label}\` to jump to.`, cursor.span(start, Math.max(start, cursor.cursor - 1))); return last; }
        this.landed = undefined;
        this.seeking = { label: jump.label, source: cursor.source, begin, end: cursor.limit };
        this.diagnostics.muted(() => {
          cursor.cursor = begin;
          while (this.seeking !== undefined && !cursor.done()) {
            this.spaces(cursor, true); if (cursor.done()) break;
            const at = cursor.cursor;
            this.safely(() => { const flow = this.flow_at(cursor, frame); const seen = flow !== undefined ? this.run_flow(flow, cursor, frame) : this.expr(cursor, frame); if (seen !== undefined) this.settle(seen, false); });
            if (cursor.cursor === at) cursor.advance();
            if (this.seeking === undefined && this.landed === at) this.landing(cursor.source).set(place, cursor.cursor);
          }
        });
        if (this.seeking !== undefined) {
          this.seeking = undefined;
          if (!report) throw jump;
          this.error(`No \`${jump.label}\` to jump to.`, cursor.span(start, Math.max(start, cursor.cursor - 1)));
          return last;
        }
        continue;
      }
      if (value !== undefined && !value.unknown) {
        this.statements.push(cursor.expression);
        try { last = this.settle(value, report); } finally { this.statements.pop(); }
      }
      if (cursor.cursor === start) cursor.advance();
    }
  }
  // A statement the level knows to be a label or a jump, read once where it is written.
  flow_at(cursor: Text.Node, frame: Node): Flow | undefined { return undefined; }
  run_flow(flow: Flow, cursor: Text.Node, frame: Node): Node | undefined {
    cursor.cursor = flow.end;
    const name = Object.assign(new Node(this.diagnostics, flow.label), { literal: true });
    if (flow.kind === 'label') return this.labelled(name);
    return this.jump(name, flow.condition !== undefined ? this.lazy(flow.condition, frame, false) : this.GLOBAL, frame);
  }
  settle(value: Node | undefined, report: boolean): Node | undefined {
    if (value?.ref && value.marks?.length) {
      const held = this.bound(value);
      const bound = held?.lazy !== undefined && held.value === undefined ? held : this.resolved(value);
      if (bound && !bound.ref) this.mark_value(bound, value.marks, [value]);
      const at = value.position;
      if (at) this.paint_reference(this.reference(value.ref.scope, value.ref.key, at));
    }
    let node = value;
    for (let depth = 0; node?.ref && depth < 64; depth++) node = this.bound(node);
    if (node?.lazy) return this.force(node);
    if (node === undefined && value?.ref && report) this.deref(value);
    return value;
  }

  spaces(cursor: Text.Node, newlines: boolean = false): number {
    const start = cursor.cursor;
    for (let c = cursor.peek(); c === ' ' || c === '\t' || c === '\r' || (newlines && c === '\n'); c = cursor.peek()) cursor.advance();
    return cursor.cursor - start;
  }

  statements: Text.Node[] = [];
  *definitions_of(): Generator<[Node, Node]> {
    for (const frame of [this.GLOBAL, ...this.frames.values()]) for (const rule of frame.rules) yield [rule, frame.methods!.get(rule)!];
  }

  expr(cursor: Text.Node, frame: Node): Node | undefined {
    cursor.begin_expression();
    this.statements.push(cursor.expression);
    try { return this.statement(cursor, frame); }
    catch (e) {
      if (e instanceof RangeError && this.statements.length === 1) { this.error(`This statement nests deeper than the runtime can follow.`, cursor.expression); return undefined; }
      if (!(e instanceof Recursion) || this.statements.length > 1) throw e;
      this.error(e.cycle !== undefined ? `This never finishes: the same state repeats through ${e.cycle}.` : `\`${e.rule.position!.string}\` keeps applying itself (stopped after ${Interpreter.DEPTH} nested applications).`, e.at);
      cursor.cursor = Math.max(cursor.cursor, this.line_end(cursor, cursor.expression.begin, frame, true));
      return undefined;
    }
    finally { this.statements.pop(); }
  }
  safely<T>(fn: () => T): T | undefined {
    try { return fn(); }
    catch (e) { if (e instanceof Recursion) return undefined; throw e; }
  }
  // A definition read again where what it made is already seen (an instance
  // running its class) is not made again: what it made is bound here.
  statement(cursor: Text.Node, frame: Node): Node | undefined {
    const arrow = this.arrow(cursor, frame);
    if (arrow < 0 || this.probing) return this.statement_read(cursor, frame);
    const at = `${cursor.source.location}:${cursor.cursor}`, made = this.definitions_made.get(at);
    if (made !== undefined && made.pass === this.passing) {
      if (made.frame === frame || ![...frame.reading(new Set())].includes(made.frame)) return this.statement_read(cursor, frame);
      for (const [key, value] of made.methods) { this.bind(frame, key, value); if (typeof key === 'string') (frame.defined ??= new Set()).add(key); }
      for (const [key, value] of made.members) this.attach(frame, key, value);
      cursor.cursor = this.line_end(cursor, this.skip(cursor, arrow + 2), frame);
      cursor.end_expression();
      return this.NONE;
    }
    const methods = new Map(frame.methods ?? []), members = new Map(frame.members ?? []);
    const read = this.statement_read(cursor, frame);
    const making = {
      pass: this.passing, frame,
      methods: [...frame.methods ?? []].filter(([key, value]) => methods.get(key) !== value),
      members: [...frame.members ?? []].filter(([key, value]) => members.get(key) !== value),
    };
    this.definitions_made.set(at, making);
    for (const [key] of making.methods) if (typeof key === 'string') (frame.defined ??= new Set()).add(key);
    return read;
  }
  statement_read(cursor: Text.Node, frame: Node): Node | undefined {
    const comment = this.line_rule(cursor, cursor.cursor, frame, cursor.cursor);
    if (comment) { this.fire(comment, cursor, frame); return undefined; }
    const rule = this.grammar_rule(cursor, frame);
    if (rule !== undefined) { cursor.end_expression(); return rule; }

    const value = this.expression(cursor, frame, false);
    this.spaces(cursor);
    if (!cursor.done() && cursor.peek() !== '\n') {
      const line = this.line_rule(cursor, cursor.cursor, frame);
      if (line) this.fire(line, cursor, frame);
      else {
        const end = this.line_end(cursor, cursor.cursor, frame, false, true);
        this.error(`Unexpected \`${cursor.source.value.slice(cursor.cursor, end)}\`.`, cursor.span(cursor.cursor, Math.max(cursor.cursor, end - 1)));
        cursor.cursor = Math.max(end, cursor.cursor + 1);
      }
    }
    cursor.end_expression();
    return value;
  }

  expression(cursor: Text.Node, frame: Node, operand: boolean, receiver?: Node): Node | undefined {
    let value: Node | undefined = receiver;
    let started = receiver !== undefined;
    if (!started && !operand) {
      const led = this.lead(cursor, frame);
      if (led !== undefined) { value = led.value; started = true; }
    }

    while (true) {
      // LTR/RTL: Done through Program pattern matching
      // Precedence: Done through Program pattern matching
      // Resolve expr up to precedence level: Done through a Program Cursor expansion.
        //   if a then b else c
        //   report TRACE var comment
        //   test () => ReturnType, ReturnType{} => {}
        //   enum A | B | C {}
      // Error handling, external report.
      // Highlighting: external theme + ^[*]

      // Grammar rules - Type resolving. Allow arbitary whitespace in between pieces. { }

      // Expression[] if surrounded by literals.

      const before = cursor.cursor;
      const previous = cursor.source.value[before - 1];
      const spaced = this.spaces(cursor) > 0 || (started && (previous === ' ' || previous === '\t'));
      if (cursor.done()) break;

      if (cursor.peek() === '\n') {
        const found = started ? this.best(value, cursor, frame, { newline: true, spaced, operand }) : undefined;
        if (!found) { cursor.cursor = before; break; }
        value = this.fire(found, cursor, frame);
        continue;
      }

      if (!started) {
        const found = this.best(undefined, cursor, frame, { spaced, operand });
        const name = this.name(cursor, frame);
        if (found && (!name || found.match.end - found.match.begin >= name.length) && !(name && !operand && this.applies(name, found, cursor, frame))) {
          value = this.fire(found, cursor, frame);
          started = true;
          continue;
        }
        if (name) { value = this.reference(frame, name, cursor.span(cursor.cursor, cursor.cursor + name.length - 1)); this.paint_reference(value); cursor.advance(name.length); started = true; continue; }
        const applied = this.receiver_of(frame);
        const method = this.best(applied ?? frame, cursor, frame, { spaced, operand, self: applied === undefined });
        const plain = method?.rule.pattern!.length === 1 ? method.rule.pattern![0] : undefined;
        const word = plain?.kind === 'literal' ? plain.text.trim() : undefined;
        if (method && applied !== undefined && word !== undefined && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word) && method.match.end - method.match.begin === word.length) {
          value = this.reference(frame, word, cursor.span(cursor.cursor, cursor.cursor + word.length - 1));
          value.ref!.self = applied;
          this.paint_reference(value);
          cursor.advance(word.length);
          started = true;
          continue;
        }
        if (method) { value = this.fire(method, cursor, frame); started = true; continue; }
        const leading = this.best(undefined, cursor, frame, { spaced, operand, leading: true });
        if (leading) { value = this.fire(leading, cursor, frame); started = true; continue; }
        const token = this.token(cursor, frame);
        if (!token) { cursor.cursor = before; break; }
        value = this.reference(frame, token, cursor.span(cursor.cursor, cursor.cursor + token.length - 1));
        value.ref!.literal = true;
        this.paint_reference(value);
        cursor.advance(token.length);
        started = true;
        continue;
      }

      const reads = value?.ref && !value.marks?.length ? this.bound(value)?.reads : undefined;
      const found = this.best(value, cursor, frame, { spaced, operand, forwards: reads !== undefined });
      const read_end = reads === undefined ? -1 : (() => { const at = cursor.cursor; this.raw(cursor, reads); const end = cursor.cursor; cursor.cursor = at; return end; })();
      if (found && found.match.end > read_end && (this.declares(value, found.rule) || !(this.resolved(value)?.fn !== undefined && this.opens_call(found.rule)) || found.match.end > this.claim(cursor, this.skip(cursor, cursor.cursor), frame))) {
        const at = cursor.cursor;
        const answered = this.fire(found, cursor, frame);
        // A rule that answers nothing has not applied: what is written is
        // read again with that rule left out, and only if nothing else
        // stands there is the nothing the answer.
        if (this.resolved(answered)?.none === true && found.rule.pattern!.some(piece => piece.kind === 'operator')) {
          cursor.cursor = at;
          const instead = this.best(value, cursor, frame, { spaced, operand, forwards: reads !== undefined, besides: found.rule });
          if (instead) { value = this.fire(instead, cursor, frame); continue; }
          cursor.cursor = at;
        }
        value = answered; continue;
      }

      if (reads) { const at = cursor.cursor; value = this.call(value!, this.raw(cursor, reads), cursor.span(at, Math.max(at, cursor.cursor - 1)), frame); continue; }

      const target = this.deref(value);
      if (this.callable_of(target)) {
        const at = cursor.cursor;
        const grouped = this.claim(cursor, at, frame);
        const end = this.reading_end(cursor, at, grouped > at ? grouped : this.operand_end(cursor, at, frame), frame);
        if (end <= at) { cursor.cursor = before; break; }
        const span = cursor.span(at, end - 1);
        cursor.cursor = end;
        value = this.call(value!, this.lazy(span, frame, false), span, frame);
        continue;
      }

      if (spaced) {
        const claimed = this.claim(cursor, cursor.cursor, frame);
        if (claimed > cursor.cursor) {
          cursor.cursor = claimed;
          continue;
        }
        const token = this.token(cursor, frame);
        if (token) {
          const at = cursor.span(cursor.cursor, cursor.cursor + token.length - 1);
          cursor.advance(token.length);
          value = this.member(value!, token, at);
          this.paint_reference(value);
          continue;
        }
      }

      cursor.cursor = before;
      break;
    }
    return value;
  }

  applies(name: string, found: Found, cursor: Text.Node, frame: Node): boolean {
    const [p, begin, end] = found.match.literals[0] ?? [];
    if (p === undefined || begin !== cursor.cursor || end !== cursor.cursor + name.length - 1 || found.rule.pattern![p + 1]?.kind !== 'space') return false;
    if (!this.resolved(this.reference(frame, name, cursor.span(begin, end)))?.callable) return false;
    const at = this.skip(cursor, end + 1);
    if (at === end + 1) return false;
    const operand = this.name(cursor.bounded(at, cursor.limit), frame);
    return operand !== undefined && this.operand_end(cursor, at, frame) === at + operand.length;
  }

  error(message: string, node?: Text.Node) {
    if (this.seeking !== undefined) return;
    this.complain('error', message, node);
  }
  complain(level: Diagnostic['level'], message: string, node?: Text.Node) {
    const statement = this.statements[0];
    if (statement && node && node.source.location !== statement.source.location) return this.diagnostics.report({ level, message, node: statement, at: node });
    this.diagnostics.report({ level, message, node });
  }

  // What is composed of what changes without a rule being written, so what
  // a receiver dispatches on is remembered against how often it has.
  composing = 0;
  private dispatch = new WeakMap<Node, { chain: Rules; of: unknown; rules: Rules }>();
  edit_count = 0;
  ruleset(scope: Node): { operand: [Node, Node][]; receiver: [Node, Node][]; forwarded: [Node, Node][] } {
    const operand: [Node, Node][] = [], receiver: [Node, Node][] = [];
    for (const rule of scope.rules.reverse()) {
      const impl = scope.methods!.get(rule)!;
      if (impl.operation || impl.defines) continue;
      const leading = rule.pattern![0]?.kind === 'capture';
      const is_operand = impl.forward !== undefined || (scope === this.GLOBAL && !leading);
      if (is_operand && !(impl.forward && impl.params)) operand.push([rule, impl]);
      if (!is_operand || impl.forward) receiver.push([rule, impl]);
    }
    return { operand, receiver, forwarded: receiver.filter(([, impl]) => impl.forward !== undefined) };
  }
  // Frames whose rules were asked for without being read: they had none.
  // A frame that writes no rules of its own sees exactly what the frame
  // above it sees. Frames are made fresh for every application, so asking
  // the one that actually holds rules is what makes any answer reusable.
  rooted(frame: Node): Node {
    let held = frame, seen: Set<Node> | undefined, depth = 0;
    while (held.ruled !== true && held.parent !== undefined) {
      if (++depth > 64) { seen ??= new Set(); if (seen.has(held.parent)) break; seen.add(held); }
      held = held.parent;
    }
    return held;
  }
  read_order = new Map<string, number>();
  introductions = new Map<string, Text.Node>();
  introduced(rule: Node): Text.Node | undefined {
    if (rule.pattern === undefined || rule.position === undefined) return rule.position;
    const first = this.introductions.get(rule.pattern.map(describe).join(''));
    return first !== undefined && this.earlier(first, rule.position) ? first : rule.position;
  }
  earlier(one: Text.Node, other: Text.Node): boolean {
    if (one.source === other.source || (one.source.location !== undefined && one.source.location === other.source.location)) return one.begin <= other.begin;
    const a = one.source.location === undefined ? undefined : this.read_order.get(one.source.location);
    const b = other.source.location === undefined ? undefined : this.read_order.get(other.source.location);
    return a !== undefined && b !== undefined && a < b;
  }
  operators_in(segment: readonly [Node, Node][]): Map<string, [string, Text.Node][]> {
    const spelled = new Map<string, [string, Text.Node][]>();
    for (const [rule, impl] of segment) {
      const pieces = rule.pattern;
      if (pieces?.length !== 1 || pieces[0].kind !== 'literal' || (impl.params?.length ?? 0) === 0 || rule.position === undefined) continue;
      const text = pieces[0].text.trim();
      if (text.length === 0 || Interpreter.word.test(text[0])) continue;
      let same = spelled.get(text[0]);
      if (same === undefined) spelled.set(text[0], same = []);
      same.push([text, rule.position]);
    }
    return spelled;
  }
  operators_of(frame: Node): Map<string, [string, Text.Node][]>[] {
    const rules = this.chain(frame);
    return [...rules.receiver, ...rules.operand].map(segment => this.operators_in(segment)).filter(operators => operators.size > 0);
  }
  looser_end(cursor: Text.Node, from: number, end: number, frame: Node, declared: Text.Node): number {
    const text = cursor.source.value, operators = this.operators_of(frame);
    let j = from;
    while (j < end) {
      const claimed = this.claim(cursor, j, frame);
      if (claimed > j) { j = claimed; continue; }
      for (const segment of operators) for (const [spelling, position] of segment.get(text[j]) ?? []) {
        if (!text.startsWith(spelling, j) || !this.earlier(position, declared)) continue;
        let k = j;
        while (k > from && /\s/.test(text[k - 1])) k--;
        return k > from ? k : end;
      }
      j++;
    }
    return end;
  }
  chain(frame: Node): { operand: Rules; receiver: Rules } {
    const held = this.rooted(frame);
    return held !== frame ? this.chain(held) : this.chain_of(frame);
  }
  protected chain_of(frame: Node): { operand: Rules; receiver: Rules } {
    const scopes = new Set<Node>();
    for (let scope: Node | undefined = frame; scope; scope = scope.parent) {
      scopes.add(scope);
      // What a frame is made of brings its rules with it, not only its
      // names: a set of rules composed into a frame is what a level is, and
      // reading something with a level in reach is what applying one means.
      for (const held of scope.made_of ?? []) scopes.add(held);
    }
    const based = frame.levels === undefined ? this.based() : [];
    for (const base of based) scopes.add(base);
    const operand: [Node, Node][][] = [], receiver: [Node, Node][][] = [];
    for (const level of (frame.levels ?? []).flatMap(type => [...type.composed(new Set())])) {
      const set = this.ruleset(level), leading = set.receiver.filter(([rule]) => { const first = rule.pattern![0]; return first?.kind !== 'capture' || first.declared !== undefined; });
      if (leading.length > 0) operand.push(leading);
      if (set.receiver.length > 0) receiver.push(set.receiver);
    }
    for (const scope of scopes) {
      const set = this.ruleset(scope);
      if (set.operand.length > 0) operand.push(set.operand);
      const seen = scope === this.GLOBAL || based.includes(scope) ? set.receiver : set.forwarded;
      if (seen.length > 0) receiver.push(seen);
    }
    return { operand, receiver };
  }
  ambient(node: Node): boolean {
    for (let scope: Node | undefined = this.GLOBAL; scope; scope = scope.parent) if (scope === node) return true;
    return this.based().includes(node);
  }
  based(): Node[] { return this.BASE === undefined ? [] : [...this.BASE.composed(new Set())]; }
  declares(receiver: Node | undefined, rule: Node): boolean {
    const own = receiver && this.resolved(receiver);
    if (!own || own.lazy) return false;
    if (own.inlined === undefined && own.made_of === undefined) return !this.ambient(own) && (own.methods?.has(rule) ?? false);
    for (const from of own.composed(new Set())) if (!this.ambient(from) && from.methods?.has(rule)) return true;
    return false;
  }
  candidates(receiver: Node | undefined, frame: Node, opts: { self?: boolean } = {}): Rules {
    if (receiver === undefined) return this.chain(frame).operand;
    let own = this.resolved(receiver);
    const chain = this.chain(frame).receiver;
    if (own === undefined && receiver.ref !== undefined) {
      // A parameter is a value: read it before looking for the rules of what it holds.
      const held = this.bound(receiver);
      if (held?.lazy !== undefined && held.value === undefined && !held.lazy.raw && !this.probing) { this.diagnostics.muted(() => this.safely(() => this.deref(receiver, false))); own = this.resolved(receiver); }
      if (own === undefined) own = held?.declared;
    }
    if (own !== undefined && own.declared !== undefined && own.methods === undefined && own.inlined === undefined && own.made_of === undefined) own = own.declared;
    if (!own || own.lazy) return chain;
    if (own instanceof Count && own !== frame) own = own.template;
    const itself = own === frame && !opts.self;
    return this.dispatched(own, chain, itself);
  }
  dispatched(own: Node, chain: Rules, itself: boolean): Rules {
    if (own.inlined === undefined && own.made_of === undefined) return !own.methods || itself ? chain : [this.ruleset(own).receiver, ...chain];
    const rules: [Node, Node][][] = [];
    for (const from of own.composed(new Set())) if (from.methods && !(itself && from === own)) { const held = this.ruleset(from).receiver; if (held.length > 0) rules.push(held); }
    return rules.length > 0 ? [...rules, ...chain] : chain;
  }

  private rewriting = new Set<Node>();
  // An operator rule is ready once every word its filters read is named.
  private readiness = new WeakMap<Node, { version: number; ready: boolean }>();
  ready(rule: Node, impl: Node): boolean {
    const cached = this.readiness.get(impl);
    if (cached && cached.version === this.version) return cached.ready;
    const frame = impl.closure ?? this.GLOBAL;
    const bound = new Set<string>(rule.pattern!.flatMap(piece => piece.kind === 'capture' || piece.kind === 'operator' ? [piece.name] : []));
    const heads = new Set<string>(Node.heads);
    for (let scope: Node | undefined = frame; scope; scope = scope.parent)
      for (const other of scope.rules) for (const piece of other.pattern ?? []) if (piece.kind === 'literal') for (const part of piece.text.trim().split(/\s+/)) if (part) heads.add(part);
    let ready = true;
    for (const piece of rule.pattern!) if (piece.kind === 'operator' && piece.filter)
      for (const found of piece.filter.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) if (!bound.has(found[0]) && !heads.has(found[0]) && frame.lookup(found[0]) === undefined) ready = false;
    this.readiness.set(impl, { version: this.version, ready });
    return ready;
  }

  // When what is known about the rules in reach has to be asked again: a
  // rule changed anywhere, or what something is made of changed too.
  private rule_parts: unknown[] = [];
  private rule_n = 0;
  rules_epoch(): number {
    const parts = this.rule_parts;
    if (parts[0] !== this.version || parts[1] !== this.edit_count || parts[2] !== Node.ruling || parts[3] !== this.BASE) { this.rule_parts = [this.version, this.edit_count, Node.ruling, this.BASE]; this.rule_n++; }
    return this.rule_n;
  }
  private scope_parts: number[] = [];
  private scope_n = 0;
  scopes_epoch(): number {
    const rules = this.rules_epoch(), parts = this.scope_parts;
    if (parts[0] !== rules || parts[1] !== this.composing) { this.scope_parts = [rules, this.composing]; this.scope_n++; }
    return this.scope_n;
  }
  best(receiver: Node | undefined, cursor: Text.Node, frame: Node, opts: { newline?: boolean; spaced: boolean; operand: boolean; forwards?: boolean; self?: boolean; leading?: boolean; besides?: Node }): Found | undefined {
    return this.best_of(this.candidate_set(receiver, frame, opts), receiver, cursor, frame, opts);
  }
  candidate_set(receiver: Node | undefined, frame: Node, opts: { self?: boolean; leading?: boolean }): Rules {
    return opts.leading ? this.only(this.chain(frame).receiver, true) : opts.self ? this.only(this.candidates(receiver, frame, { self: true }), false) : this.candidates(receiver, frame);
  }
  best_of(set: Rules, receiver: Node | undefined, cursor: Text.Node, frame: Node, opts: { newline?: boolean; spaced: boolean; operand: boolean; forwards?: boolean; self?: boolean; leading?: boolean; besides?: Node }): Found | undefined {
    let best: Found | undefined;
    const ahead = cursor.source.value[this.skip(cursor, cursor.cursor)];
    for (const segment of set) for (const [rule, impl] of segment) {
      if (rule === opts.besides) continue;
      const shape = this.shaped(rule);
      if (shape.literal) continue;
      if (shape.head !== undefined && ahead !== undefined && shape.head !== ahead) continue;
      if (opts.forwards && !impl.forward) continue;
      if (!!opts.newline !== shape.newline) continue;
      // A rewrite's body is what it reduced to, and reducing it again is what
      // two rules of this shape would do to each other, so while one is
      // running none of them stands.
      // A rule that asks for an operator waits on what its pattern asks for —
      // the classes saying which operators it takes — and not on what its
      // body writes down for itself.
      if (shape.operator && (this.rewriting.size > 0 || !this.ready(rule, impl))) continue;
      const pieces = rule.pattern!;
      const leading = shape.leading;
      const match = this.match(pieces, cursor, frame, { receiver, leading, spaced: opts.spaced, operand: opts.operand, tight: opts.operand || (receiver !== undefined && !opts.spaced), params: impl.params?.length ?? 0, owned: pieces[0]?.kind === 'space' && this.declares(receiver, rule), closure: impl.closure, declared: this.introduced(rule) });
        if (!match) continue;
      const loose = shape.loose;
      const own = match.pattern - match.begin, current = best ? best.match.pattern - best.match.begin : -1;
      const length = match.end - match.begin, total = best ? best.match.end - best.match.begin : -1;
      // A rule that only asks for a space where one already is stays behind
      // a rule that spells the same ground out, but never ahead of a longer
      // reading of it.
      const tie = best !== undefined && (best.rule.pattern![0]?.kind === 'space') !== loose ? (loose ? -1 : 1) : 0;
      const sharper = best === undefined ? 0 : shape.filtered - this.shaped(best.rule).filtered;
      const real = best !== undefined && !!best.impl.forward !== !!impl.forward ? (impl.forward ? -1 : 1) : 0;
      if (real > 0 || (real === 0 && (length > total || (length === total && (sharper > 0 || (sharper === 0 && (own > current || tie > 0))))))) best = { rule, impl, match };
    }
    return best;
  }

  only(set: Rules, leading: boolean): Rules {
    const out: (readonly [Node, Node][])[] = [];
    for (const segment of set) {
      const held = leading ? segment.filter(([rule]) => rule.pattern![0]?.kind === 'capture') : segment.filter(([rule]) => { const first = rule.pattern![0]; return first?.kind !== 'capture' || first.raw; });
      if (held.length > 0) out.push(held);
    }
    return out;
  }
  // Which brackets hold parameters is not the engine's to know: the rule that
  // defines a method says so by styling that capture `^parameter`, and the
  // entrypoint declares its shape up front with `forward`.
  private words = new Map<string, string[]>();
  literal(cursor: Text.Node, j: number, literal: string): number {
    const text = cursor.source.value, limit = cursor.limit;
    let parts = this.words.get(literal);
    if (!parts) this.words.set(literal, parts = literal.split(/\s+/).filter(Boolean));
    for (let k = 0; k < parts.length; k++) {
      const part = parts[k];
      if (k > 0) while (j < limit && (text[j] === ' ' || text[j] === '\t')) j++;
      if (j + part.length > limit || !text.startsWith(part, j)) return -1;
      j += part.length;
    }
    return j;
  }
  skip(cursor: Text.Node, j: number): number {
    const text = cursor.source.value;
    while (j < cursor.limit && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) j++;
    return j;
  }

  optional(pieces: Piece[], p: number): number {
    if (pieces[p]?.kind !== 'literal') return -1;
    let k = p + 1;
    while (pieces[k]?.kind === 'space') k++;
    const inner = pieces[k];
    if (inner?.kind !== 'capture' || !inner.optional) return -1;
    let close = k + 1;
    while (pieces[close]?.kind === 'space') close++;
    return pieces[close]?.kind === 'literal' ? close : k;
  }
  match(pieces: Piece[], cursor: Text.Node, frame: Node, opts: { receiver?: Node; leading: boolean; tight: boolean; params: number; spaced?: boolean; owned?: boolean; operand?: boolean; closure?: Node; declared?: Text.Node }): Match | undefined {
    const text = cursor.source.value, limit = cursor.limit;
    let i = cursor.cursor;
    const captures = new Map<string, Text.Node>(), operators = new Map<string, Text.Node>();
    let read: Map<string, Node> | undefined;
    const literals: [number, number, number][] = [];
    let operator_rules: Rules | undefined;
    let skipped = false;
    let opened = 0;
    const first = pieces[0], last = pieces[pieces.length - 1];
    const enclosed = pieces.length >= 3 && first.kind === 'literal' && last.kind === 'literal' && first.text.trim().length > 0 && !/[\p{L}\p{N}_]/u.test(first.text.trim()[0]);
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      if (piece.kind !== 'space') skipped = false;
      // What is taken as written is taken from where it starts: a raw capture
      // neither skips the space before it nor gives back the space it ends
      // on, so a written text that is only a space is that space.
      const as_written = piece.kind === 'capture' && piece.raw && pieces[p - 1]?.kind === 'literal';
      const from = p === 0 || (p === 1 && opts.leading) || as_written ? i : this.skip(cursor, i);
      switch (piece.kind) {
        case 'literal': {
          const word = /[\p{L}\p{N}_]/u;
          let j = this.literal(cursor, from, piece.text);
          const edge = piece.text.trim();
          const hugged = pieces[p + 1]?.kind === 'capture' && (pieces[p + 1] as { declared?: Node }).declared !== undefined;
          if (j >= 0 && edge.length > 0 && ((word.test(edge[0]) && from > 0 && word.test(text[from - 1])) || (!hugged && word.test(edge[edge.length - 1]) && text[j] !== undefined && word.test(text[j])))) j = -1;
          if (j >= 0 && edge.length > 0 && !word.test(edge[edge.length - 1])) for (const longer of Node.heads) if (longer.length > edge.length && longer.startsWith(edge) && text.startsWith(longer, j - edge.length)) { j = -1; break; }
          if (j >= 0 && /^\s/.test(piece.text) && from > 0 && from === i && !/\s/.test(text[from - 1])) j = -1;
          if (j >= 0 && /\s$/.test(piece.text) && j < limit && !/\s/.test(text[j])) j = -1;
          if (j < 0) {
            const close = this.optional(pieces, p);
            if (close < 0) return;
            for (let k = p + 1; k <= close; k++) { const inner = pieces[k]; if (inner.kind === 'capture') captures.set(inner.name, cursor.span(i, i - 1)); }
            p = close;
            skipped = true;
            break;
          }
          literals.push([p, from, j - 1]); i = j; opened += Interpreter.depth(piece.text); break;
        }
        case 'space': { const j = this.skip(cursor, i); if (j === i && i < limit && text[i] !== '\n' && !skipped && !(p === 0 && opts.owned && opts.spaced)) return; i = j; break; }
        case 'newline': { if (text[from] !== '\n') return; i = from + 1; break; }
        // What is written between two operands is read the way what is
        // written inside a group is: where the pattern says what it must be,
        // the language is asked, and it stands there only where it says so.
        case 'operator': {
          // What stands between two operands is a method of what is written
          // to the left of it: `a + b` asks what `a` is for a `+`. One set
          // answers for every operator in a pattern, so `a [x] b [y] c`
          // reads both of them the way `a` reads one.
          const j = this.operator_end(cursor, from, frame, operator_rules ??= (opts.receiver !== undefined ? this.candidates(opts.receiver, frame) : this.chain(frame).receiver));
          if (j <= from) return;
          const written = cursor.span(from, j - 1);
          operators.set(piece.name, written); i = j; break;
        }
        case 'capture': {
          // A capture that stands for the receiver, spelled right against
          // what follows, admits no space between them.
          // A capture that stands for the receiver admits a space before
          // what follows exactly where the pattern writes one: `{this}<x>`
          // is spelled tight against what it takes, `{a} * one` is not.
          if (p === 0 && opts.leading && opts.receiver !== undefined) {
            const after = pieces[1];
            const gap = after === undefined || after.kind === 'space' || after.kind === 'operator' || (after.kind === 'literal' && /^\s/.test(after.text));
            if (opts.spaced && !gap) return;
            break;
          }
          let next_at = -1, upcoming_at = -1, literal_at = -1;
          for (let k = p + 1; k < pieces.length; k++) {
            const kind = pieces[k].kind;
            if (next_at < 0 && kind !== 'capture') next_at = k;
            if (upcoming_at < 0 && kind !== 'space') upcoming_at = k;
            if (literal_at < 0 && kind === 'literal') literal_at = k;
            if (next_at >= 0 && upcoming_at >= 0 && literal_at >= 0) break;
          }
          const next = next_at < 0 ? undefined : pieces[next_at];
          let end: number;
          if (p === 0 && opts.leading) {
            end = this.operand_end(cursor, from, frame);
            if (end <= from) return;
            if (piece.declared !== undefined) {
              if (piece.declared.unknown) return;
              const held = this.holds_text(piece, cursor.span(from, end - 1));
              if (held === null) return;
              (read ??= new Map()).set(piece.name, held);
            }
            captures.set(piece.name, cursor.span(from, end - 1));
            i = end;
            break;
          }
          const upcoming = upcoming_at < 0 ? undefined : pieces[upcoming_at];
          const terminator = piece.optional && upcoming?.kind !== 'capture' && literal_at >= 0 ? pieces[literal_at] : undefined;
          if (upcoming?.kind === 'capture') end = piece.raw ? this.operand_end(cursor, from, frame, true) : piece.optional ? this.claim(cursor, from, frame) : this.operand_end(cursor, from, frame);
          else if (terminator?.kind === 'literal' && this.optional(pieces, literal_at) >= 0) {
            end = this.until(cursor, from, terminator.text, frame, piece.raw, opened === 0 && !enclosed);
            if (end < 0) end = this.line_end(cursor, from, frame, piece.raw, true);
            while (!as_written && end > from && /[ \t]/.test(text[end - 1])) { end--; skipped = true; }
          }
          else if (next?.kind === 'literal') {
            end = this.until(cursor, from, next.text, frame, piece.raw, opened === 0 && !enclosed);
            while (!as_written && end > from && /[ \t]/.test(text[end - 1])) { end--; skipped = true; }
          }
          else if (next?.kind === 'newline') end = this.line_end(cursor, from, frame, piece.raw, true);
          else if (next?.kind === 'space' && pieces[next_at + 1]?.kind === 'literal') {
            end = this.until(cursor, from, (pieces[next_at + 1] as { text: string }).text, frame, piece.raw, opened === 0 && !enclosed);
            while (end > from && /[ \t]/.test(text[end - 1])) end--;
          }
          else if (next?.kind === 'space') end = this.word_end(cursor, from, frame);
          else if (next?.kind === 'operator') end = this.operand_end(cursor, from, frame);
          else if (next === undefined && p === pieces.length - 1) {
            end = (piece.raw && opts.receiver !== undefined) || opts.tight || opts.params > 0 || pieces[p - 1]?.kind === 'space' ? this.operand_end(cursor, from, frame, piece.raw) : this.line_end(cursor, from, frame, piece.raw, true);
            end = Math.max(end, this.claim(cursor, from, frame));
          }
          else return;
          if (end === from && piece.optional) { captures.set(piece.name, cursor.span(from, from - 1)); skipped = true; break; }
          if (!piece.raw && end > from) {
            const seen = text.slice(from, end).trim();
            if (seen.length > 0 && !/[\p{L}\p{N}_]/u.test(seen[0]) && Node.heads.has(seen) && !this.GLOBAL.named?.has(seen)) {
              if (!piece.optional) return;
              captures.set(piece.name, cursor.span(from, from - 1)); skipped = true; break;
            }
          }
          if (end < from || (end === from && next?.kind !== 'literal')) return;
          if (piece.declared !== undefined) {
            if (piece.declared.unknown) return;
            const held = this.holds_text(piece, cursor.span(from, end - 1));
            if (held === null) return;
            (read ??= new Map()).set(piece.name, held);
          }
          captures.set(piece.name, cursor.span(from, end - 1));
          i = end;
          break;
        }
      }
    }
    const pattern = i;
    const args: Text.Node[] = [];
    if (opts.params > 1) {
      const from = this.skip(cursor, i);
      const group = from < cursor.limit ? this.claim(cursor, from, frame) : from;
      if (group > from && this.inner(cursor.span(from, group - 1), frame) !== undefined) { args.push(cursor.span(from, group - 1)); i = group; }
    }
    if (args.length === 0) for (let k = 0; k < opts.params; k++) {
      const from = this.skip(cursor, i);
      if (from >= limit || text[from] === '\n') return;
      // An argument written against what takes it is only that argument:
      // `f(x) == y` hands `f` the `(x)`. Written after a space it is the
      // whole of what follows: `name: a - b` reads all of `a - b`.
      const hugged = opts.operand || from === i;
      // An argument written against what takes it is only what it is written
      // as: `f(x).y` hands `f` the `(x)`, and asks `.y` of the answer.
      const claimed = from === i ? this.claim(cursor, from, frame) : from;
      const spaced_end = () => { const end = this.line_end(cursor, from, frame); return opts.declared !== undefined ? this.looser_end(cursor, from, end, frame, opts.declared) : end; };
      const end = claimed > from ? claimed : k < opts.params - 1 || hugged ? this.operand_end(cursor, from, frame) : spaced_end();
      if (end <= from) return;
      // As with a capture, an argument is not a bare operator: `joined := x`
      // declares `joined`, it does not call a method of that name with `:=`.
      const seen = text.slice(from, end).trim();
      if (seen.length > 0 && !/[\p{L}\p{N}_]/u.test(seen[0]) && Node.heads.has(seen)) return;
      args.push(cursor.span(from, end - 1));
      i = end;
    }
    if (i === cursor.cursor) return;
    return { begin: cursor.cursor, end: i, pattern, literals, captures, operators, args, receiver: opts.receiver, tight: opts.tight, read };
  }

  private claims = new Map<Text.Source, { version: number; memo: Map<number, number> }>();
  private nesting = 0;
  private lexical?: { version: number; brackets: [Node, Node][]; lines: [Node, Node][]; signature: string };
  private bracketing = 0;
  get layers(): { version: number; brackets: [Node, Node][]; lines: [Node, Node][]; signature: string } {
    if (this.lexical?.version === this.version) return this.lexical;
    const brackets: [Node, Node][] = [], lines: [Node, Node][] = [];
    for (const [rule, impl] of this.ruleset(this.GLOBAL).operand) {
      const pieces = rule.pattern!;
      if (impl.forward || pieces[0]?.kind !== 'literal') continue;
      const opening = pieces[0].text.trim();
      if (pieces.length >= 3 && pieces[pieces.length - 1].kind === 'literal' && opening.length > 0 && !/[\p{L}\p{N}_]/u.test(opening[0])) brackets.push([rule, impl]);
      // A line is taken verbatim by a rule whose one capture is text (a
      // comment); a capture that is an expression makes a prefix operator.
      if (pieces.length === 2 && pieces[1].kind === 'capture' && pieces[1].raw) lines.push([rule, impl]);
    }
    const signature = brackets.map(([rule]) => rule.key).join('\n');
    if (signature !== this.lexical?.signature) this.bracketing++;
    return this.lexical = { version: this.version, brackets, lines, signature };
  }
  brackets(frame: Node): [Node, Node][] { return this.layers.brackets; }
  claim(cursor: Text.Node, j: number, frame: Node): number {
    const brackets = this.layers.brackets;
    let entry = this.claims.get(cursor.source);
    if (!entry || entry.version !== this.bracketing) this.claims.set(cursor.source, entry = { version: this.bracketing, memo: new Map() });
    let end = entry.memo.get(j);
    if (end === undefined) {
      if (this.nesting >= Interpreter.DEPTH) return j;
      entry.memo.set(j, j);
      end = j;
      this.nesting++;
      try {
        const text = cursor.source.value;
        const probe = new Text.Node(cursor.source);
        probe.cursor = j;
        for (const [rule] of brackets) {
          const first = rule.pattern![0] as { text: string };
          if (text[j] !== first.text[0]) continue;
          const match = this.match(rule.pattern!, probe, this.GLOBAL, { leading: false, tight: true, params: 0 });
          if (match && match.end > end) end = match.end;
        }
      } finally { this.nesting--; }
      entry.memo.set(j, end);
    }
    return end <= cursor.limit ? end : j;
  }
  line_rule(cursor: Text.Node, j: number, frame: Node, statement?: number): Found | undefined {
    const text = cursor.source.value;
    let probe: Text.Node | undefined;
    for (const [rule, impl] of this.layers.lines) {
      const pieces = rule.pattern!;
      if (text[j] !== (pieces[0] as { text: string }).text[0]) continue;
      if (statement !== undefined && rule.position?.source.location === cursor.source.location && text.startsWith(rule.position.string, statement)) continue;
      probe ??= cursor.bounded(j, cursor.limit);
      const match = this.match(pieces, probe, frame, { leading: false, tight: false, params: 0, closure: impl.closure });
      if (match) return { rule, impl, match };
    }
  }

  until(cursor: Text.Node, j: number, literal: string, frame: Node, raw: boolean, line: boolean = false): number {
    const limit = cursor.limit;
    while (j < limit) {
      if (line && cursor.source.value[j] === '\n' && !literal.includes('\n')) return -1;
      const k = this.literal(cursor, j, literal);
      if (k >= 0 && !(/^\s/.test(literal) && j > 0 && !/\s/.test(cursor.source.value[j - 1])) && !(/\s$/.test(literal) && k < limit && !/\s/.test(cursor.source.value[k]))) return j;
      const claimed = raw ? j : this.claim(cursor, j, frame);
      j = claimed > j ? claimed : j + 1;
    }
    return -1;
  }
  line_end(cursor: Text.Node, j: number, frame: Node, raw: boolean = false, lines: boolean = false): number {
    const text = cursor.source.value, limit = cursor.limit, start = j;
    while (j < limit && text[j] !== '\n') {
      if (lines && !raw && j > start && this.line_rule(cursor, j, frame)) break;
      const claimed = raw ? j : this.claim(cursor, j, frame);
      j = claimed > j ? claimed : j + 1;
    }
    while (j > start && (text[j - 1] === ' ' || text[j - 1] === '\t' || text[j - 1] === '\r')) j--;
    return j;
  }
  edges(frame: Node): Set<string> {
    const edges = new Set<string>();
    const add = (rule: Node) => { const first = rule.pattern!.find(x => x.kind !== 'capture'); if (first?.kind === 'literal' && !/[\p{L}\p{N}_]/u.test(first.text[0])) edges.add(first.text[0]); };
    for (let scope: Node | undefined = frame; scope; scope = scope.parent) scope.rules.forEach(add);
    this.BASE?.rules.forEach(add);
    return edges;
  }
  token_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value, limit = cursor.limit, start = j, edges = this.edges(frame);
    while (j < limit && !/\s/.test(text[j]) && (j === start || !edges.has(text[j]))) j++;
    return j;
  }
  raw_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value, limit = cursor.limit, start = j;
    // A rule that could start further along does not cut this short while a
    // longer rule still spells the same ground: `.<=` reads `<=`, not `<`,
    // and only a space breaks the two apart.
    const longest = this.longest(cursor, start, frame);
    while (j < limit && !/\s/.test(text[j]) && (j === start || j < longest || !this.starts_rule(cursor, j, frame))) j++;
    return j;
  }
  longest(cursor: Text.Node, j: number, frame: Node): number {
    // Every literal any rule spells, longest first — a rule on a type the
    // receiver has is not in this frame's chain, but `.<=` still has to read
    // `<=` rather than stop at the `=` that starts another rule.
    const text = cursor.source.value, limit = cursor.limit;
    for (const head of [...Node.heads].filter(head => head.length > 1).sort((a, b) => b.length - a.length)) if (j + head.length <= limit && text.startsWith(head, j)) return j + head.length;
    return j;
  }
  private static word = /[\p{L}\p{N}_]/u;
  begins(cursor: Text.Node, j: number, literal: string): boolean {
    const text = cursor.source.value, word = Interpreter.word;
    if (word.test(literal[0]) && j > 0 && word.test(text[j - 1])) return false;
    const end = this.literal(cursor, j, literal);
    if (end <= j) return false;
    const after = text[end];
    return !(word.test(literal[literal.length - 1]) && after !== undefined && word.test(after));
  }
  starts_rule(cursor: Text.Node, j: number, frame: Node): boolean {
    const chain = this.chain(frame);
    for (const set of [chain.receiver, chain.operand])
      for (const segment of set) for (const [rule, impl] of segment) {
        const first = rule.pattern![0];
        if (impl.forward || first?.kind !== 'literal') continue;
        if (this.begins(cursor, j, first.text)) return true;
      }
    for (const [rule] of this.brackets(frame)) {
      const last = rule.pattern![rule.pattern!.length - 1];
      if (last?.kind === 'literal' && this.begins(cursor, j, last.text)) return true;
    }
    return false;
  }
  operator_end(cursor: Text.Node, j: number, frame: Node, set?: Rules): number {
    let end = j;
    for (const segment of set ?? this.chain(frame).receiver) for (const [rule, impl] of segment) {
      const first = rule.pattern![0];
      // What stands between two operands takes the one on its right. `.` is
      // written the same way and takes nothing, so it is not one of these,
      // and a rule asking for two operators does not rewrite member access.
      if (impl.forward || first?.kind !== 'literal' || (impl.params?.length ?? 0) === 0 || rule.pattern!.some(piece => piece.kind === 'operator')) continue;
      const k = this.literal(cursor, j, first.text), edge = first.text.trim();
      if (k > end && !(Interpreter.word.test(edge[edge.length - 1] ?? '') && Interpreter.word.test(cursor.source.value[k] ?? ''))) end = k;
    }
    return end;
  }
  word_end(cursor: Text.Node, j: number, frame: Node): number {
    const text = cursor.source.value, limit = cursor.limit;
    const claimed = this.claim(cursor, j, frame);
    if (claimed > j) return claimed;
    if (this.edges(frame).has(text[j])) return j;
    while (j < limit && !/\s/.test(text[j]) && this.claim(cursor, j, frame) === j) j++;
    return j;
  }
  operand_end(cursor: Text.Node, j: number, frame: Node, raw: boolean = false): number {
    const text = cursor.source.value, limit = cursor.limit;
    if (raw) return this.raw_end(cursor, j, frame);
    while (j < limit && !/\s/.test(text[j])) {
      const claimed = this.claim(cursor, j, frame);
      j = claimed > j ? claimed : this.token_end(cursor, j, frame);
    }
    return j;
  }

  name(cursor: Text.Node, frame: Node): string | undefined {
    const text = cursor.source.value, word = Interpreter.word;
    const keys = Node.names.get(text[cursor.cursor]);
    if (keys === undefined) return undefined;
    for (const key of keys) {
      if (!cursor.at(key)) continue;
      const after = text[cursor.cursor + key.length];
      if (word.test(key[key.length - 1]) && after !== undefined && word.test(after)) continue;
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) if (scope.methods?.has(key)) return key;
    }
    return undefined;
  }
  token(cursor: Text.Node, frame: Node): string | undefined {
    const end = this.token_end(cursor, cursor.cursor, frame);
    return end > cursor.cursor ? cursor.source.value.slice(cursor.cursor, end) : undefined;
  }
  // An operand that reads what follows it as written takes that along.
  reading_end(cursor: Text.Node, at: number, end: number, frame: Node): number {
    if (end <= at) return end;
    const text = cursor.source.value, word = text.slice(at, end);
    if (!/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word)) return end;
    const reads = this.resolved(this.reference(frame, word, cursor.span(at, end - 1)))?.reads;
    if (reads === undefined) return end;
    while (end < cursor.limit && (text[end] === ' ' || text[end] === '\t')) end++;
    if (reads === 'token') { while (end < cursor.limit && !/\s/.test(text[end])) end++; }
    else { while (end < cursor.limit && text[end] !== '\n') end++; }
    return end;
  }
  raw(cursor: Text.Node, reads: 'token' | 'rest'): Node {
    this.spaces(cursor);
    const text = cursor.source.value, start = cursor.cursor;
    let end = start;
    if (reads === 'token') while (end < cursor.limit && !/\s/.test(text[end])) end++;
    else { while (end < cursor.limit && text[end] !== '\n') end++; while (end > start && /\s/.test(text[end - 1])) end--; }
    cursor.cursor = end;
    const node = new Node(this.diagnostics, cursor.span(start, end - 1));
    node.literal = true;
    return node;
  }

  cursor_of(span: Text.Node): Text.Node {
    const cursor = new Text.Node(span.source);
    cursor.cursor = span.begin; cursor.until = span.end + 1;
    return cursor;
  }
  lazy(span: Text.Node, frame: Node, raw: boolean): Node {
    const node = new Node(this.diagnostics, span);
    node.lazy = { span, frame, raw, probe: this.probing > 0 };
    return node;
  }
  reference(frame: Node, key: string, at: Text.Node): Node {
    const node = new Node(this.diagnostics, at);
    node.ref = { scope: frame, key };
    return node;
  }
  based_member(key: string): Node | undefined {
    for (const scope of this.based()) if (scope.defined?.has(key)) { const found = scope.methods?.get(key); if (found !== undefined) return found; }
  }
  bound(node: Node): Node | undefined {
    const ref = node.ref!;
    if (ref.scope.observed !== undefined && !ref.member) {
      if (ref.scope.shadows === ref.key) return ref.scope.own(ref.key);
      const at = node.position, written = ref.scope.capture_text;
      if (!ref.scope.observed.includes(ref.key) && at !== undefined && written !== undefined && Interpreter.within(at, written) && at.string === ref.key) ref.scope.observed.push(ref.key);
    }
    const found = ref.member ? ref.scope.member(ref.key) ?? this.based_member(ref.key) : ref.own ? ref.scope.own(ref.key) : ref.scope.lookup(ref.key);
    if (found !== undefined) return found;
    if (ref.self === undefined) return ref.through;
    return ref.through ??= this.get(ref.self, Object.assign(new Node(this.diagnostics, node.position), { literal: true }));
  }
  // What a node stands for once read: through references, and through what
  // a read lazy already holds, until a value.
  resolved(node: Node | undefined): Node | undefined {
    for (let depth = 0; node !== undefined && depth < 64; depth++) {
      if (node.ref) node = this.bound(node);
      else if (node.lazy) node = node.value;
      else break;
    }
    if (node?.literal) this.literal_written(node);
    return node;
  }
  deref(node: Node | undefined, report: boolean = true, read: boolean = true): Node | undefined {
    const marks: Node[] = [], sources: Node[] = [];
    for (let depth = 0; node && (node.ref || node.lazy) && depth < 64; depth++) {
      if (node.marks) { marks.push(...node.marks); sources.push(node); }
      if (node.lazy) { node = this.force(node); continue; }
      const bound = this.bound(node) ?? (read && node.ref!.literal && this.seeking === undefined ? this.literally(node) : undefined);
      if (bound === undefined && node.ref!.scope.shadows === node.ref!.key && !node.ref!.member) { node = Object.assign(this.unknown(node.position), { made_of: this.BASE === undefined ? undefined : [this.BASE] }); break; }
      if (bound === undefined && node.ref!.member && !node.ref!.scope.unknown) { node = this.NONE; break; }
      if (bound === undefined && node.ref!.scope.missing !== undefined && node.position !== undefined && Interpreter.within(node.position, node.ref!.scope.capture_text!)) {
        if (this.BASE === undefined) node.ref!.scope.missing.push(node.ref!.key);
        else { this.bind(node.ref!.scope, node.ref!.key, this.BASE); node = this.BASE; break; }
      }
      if (bound === undefined) {
        if (report && !node.ref!.scope.unknown && !(node.ref!.member && this.probing)) this.error(`Unresolved \`${node.ref!.key}\`.`, node.position); return undefined;
      }
      node = bound;
    }
    if (node && marks.length) this.mark_value(node, marks, sources);
    if (node?.literal) this.literal_written(node);
    return node;
  }
  force(node: Node): Node | undefined {
    if (node.value !== undefined || !node.lazy) return node.value;
    const { span, frame, raw } = node.lazy;
    if (this.probing && !node.lazy.probe) return new Node(this.diagnostics, span);
    if (raw) { const literal = new Node(this.diagnostics, span); literal.literal = true; return node.value = literal; }
    node.value = new Node(this.diagnostics, span);
    return node.value = this.array(this.cursor_of(span), frame);
  }
  text(node: Node | undefined, depth: number = 0): string { return node ? this.texted(node, depth) : ''; }
  private texted(node: Node, depth: number): string {
    const peeled = this.peel(node);
    const deep = peeled === undefined || peeled === node ? this.deepest(node) : undefined;
    const value = this.diagnostics.muted(() => this.safely(() => this.deref(node, false, false)));
    if (value?.literal) return value.position!.string;
    const target = deep ?? peeled ?? node;
    if (target.lazy) return target.lazy.span.string;
    if (target.ref) {
      const bound = this.bound(target);
      if (bound !== undefined && bound !== target && depth < Interpreter.DEPTH) return this.text(bound, depth + 1);
      return target.position?.string ?? target.ref.key;
    }
    return (value ?? target).position?.string ?? '';
  }
  deepest(node: Node): Node | undefined {
    let current: Node | undefined = node, last: Node | undefined;
    for (let depth = 0; current && depth < Interpreter.DEPTH; depth++) {
      let next: Node | undefined;
      if (current.ref) { last = current; next = this.bound(current); }
      else if (current.lazy) next = this.diagnostics.muted(() => this.safely(() => this.reference_of(current!)));
      if (next === undefined || next === current) break;
      current = next;
    }
    return last;
  }

  member(value: Node, key: string, at: Text.Node): Node {
    const node = new Node(this.diagnostics, at);
    node.ref = { scope: this.deref(value) ?? this.unknown(at), key, own: true };
    return node;
  }
  unknown(at?: Text.Node): Node { return Object.assign(new Node(this.diagnostics, at), { unknown: true }); }
  get(node: Node, key: Node | undefined): Node {
    if (key === undefined) return this.unknown(node?.position);
    const target = this.deref(node);
    const forced = this.deref(key, false);
    const name = forced?.literal ? forced.position!.string : this.text(key);
    if (target?.style !== undefined) return this.style(`${target.style}.${name}`);
    const method = target && this.method_of(target, name);
    if (method) return this.apply({ rule: method[0], impl: method[1], match: this.trivial(this.location(node), key.position ?? node.position!) }, this.cursor_of(key.position ?? node.position!), target, key.position ?? node.position!);
    const parameterised = target && this.method_of(target, name, { parameterised: true });
    if (parameterised) {
      const [rule, impl] = parameterised;
      const at = key.position ?? node.position!;
      const bound = new Node(this.diagnostics, at);
      bound.arity = impl.params!.length;
      bound.fn = ({ interpreter, frame, args }) => {
        if (args.length < impl.params!.length) return undefined;
        const match = { ...interpreter.trivial(target, at), args: args.map(argument => argument.lazy?.span ?? argument.position ?? at), given: args.map(argument => argument.lazy !== undefined ? undefined : argument) };
        return interpreter.apply({ rule, impl, match }, interpreter.cursor_of(at), frame, at);
      };
      return bound;
    }
    const spelled = target && this.spelled_after(target, name);
    if (spelled) {
      const [rule, impl, capture] = spelled;
      const at = key.position ?? node.position!;
      const bound = new Node(this.diagnostics, at);
      bound.arity = 1;
      bound.fn = ({ interpreter, frame, args }) => {
        const argument = args[0];
        if (argument === undefined) return undefined;
        const match = { ...interpreter.trivial(interpreter.location(node), at), captures: new Map([[capture, argument.lazy?.span ?? argument.position ?? at]]) };
        return interpreter.apply({ rule, impl, match }, interpreter.cursor_of(at), argument.lazy?.frame ?? frame, at);
      };
      return bound;
    }
    const slot = new Node(this.diagnostics, key.position);
    slot.ref = { scope: target ?? this.unknown(key.position), key: name, own: true, member: true };
    if (forced?.literal && forced.position && target) this.paint_reference(Object.assign(new Node(this.diagnostics, forced.position), { ref: slot.ref }));
    return slot;
  }
  opens_call(rule: Node): boolean {
    const pieces = rule.pattern!;
    const open = pieces[0];
    if (pieces.length < 3 || open?.kind !== 'literal') return false;
    const text = open.text.trim();
    if (text.length === 0 || /[\p{L}\p{N}_]/u.test(text[0])) return false;
    return pieces.slice(1).some(piece => piece.kind === 'literal');
  }
  calls(rule: Node): boolean {
    return this.opens_call(rule) && rule.pattern![rule.pattern!.length - 1].kind === 'literal';
  }
  call_rule(target: Node | undefined): [Node, Node] | undefined {
    if (!target) return undefined;
    const seen = new Set<Node>();
    for (const from of target.composed(seen)) {
      for (const rule of from.rules) {
        if (!this.calls(rule)) continue;
        const impl = from.methods!.get(rule)!;
        if (impl.forward) continue;
        return [rule, impl];
      }
    }
  }
  callable_of(target: Node | undefined): boolean {
    return target !== undefined && (target.callable || this.call_rule(target) !== undefined);
  }
  method_of(target: Node, name: string, opts: { parameterised?: boolean } = {}): [Node, Node] | undefined {
    const seen = new Set<Node>();
    // What every node has is on the base after what this one is made of.
    for (const from of [...target.composed(seen), ...(this.BASE?.composed(seen) ?? [])]) {
      if (from.methods === undefined) continue;
      for (const [rule, impl] of this.methods_named(from).get(name) ?? []) {
        if (impl.forward || (opts.parameterised ? !impl.params?.length : impl.params?.length)) continue;
        return [rule, impl];
      }
    }
  }
  // A name given to a scope is its own, or its receiver's: a frame met further along gave it to someone else.
  gives(scope: Node, holder: Node, key: string): boolean {
    return holder === scope || (this.made_names.get(holder)?.has(key) ?? false);
  }
  // What a rule answers when it is only looked at: something that can be read on, and called.
  stand_in(at: Text.Node): Node {
    const answer = new Node(this.diagnostics, at);
    answer.arity = 1;
    answer.fn = () => this.stand_in(at);
    return answer;
  }
  // What a rule applied to this runs inside: its place, or what unread code reads as.
  context_of(receiver: Node | undefined): Node | undefined {
    if (receiver === undefined) return undefined;
    const at = receiver.lazy !== undefined ? this.location(receiver) : receiver;
    return at.lazy !== undefined ? this.diagnostics.muted(() => this.safely(() => this.deref(at, false))) : at;
  }
  // Where a value is read from: through the names a rule was given, to the place it was written.
  location(node: Node): Node {
    let at = this.reference_of(node);
    for (let depth = 0; depth < 64; depth++) {
      if (!at.ref && at.lazy !== undefined && !at.lazy.raw) { const word = at.lazy.span.string.trim(); if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(word)) at = this.reference(at.lazy.frame, word, at.lazy.span); }
      if (!at.ref) return at;
      const key = at.ref.key;
      let holder: Node | undefined;
      for (const scope of at.ref.scope.reading(new Set())) if (scope.own(key) !== undefined) { holder = scope; break; }
      if (!holder?.given?.has(key) || !this.gives(at.ref.scope, holder, key)) return at;
      const next = this.reference_of(holder.own(key)!);
      if (next === at) return at;
      at = next;
    }
    return at;
  }

  // A rule spelled as a name and then one capture is that name, taking what it captures.
  spelled_after(target: Node, name: string): [Node, Node, string] | undefined {
    const seen = new Set<Node>(), scopes: Node[] = [];
    for (let scope: Node | undefined = target; scope !== undefined && scope !== this.GLOBAL; scope = scope.parent) scopes.push(...scope.composed(seen));
    scopes.push(...(this.BASE?.composed(seen) ?? []));
    for (const from of scopes)
      for (const rule of from.rules) {
        const [head, held] = rule.pattern!;
        if (rule.pattern!.length !== 2 || head.kind !== 'literal' || held.kind !== 'capture' || head.text !== name) continue;
        return [rule, from.methods!.get(rule)!, held.name];
      }
  }
  methods_named(scope: Node): Map<string, [Node, Node][]> {
    const by = new Map<string, [Node, Node][]>();
    for (const rule of scope.rules) {
      const pieces = rule.pattern!;
      if (pieces.length !== 1 || pieces[0].kind !== 'literal') continue;
      const name = pieces[0].text.trim();
      let same = by.get(name);
      if (same === undefined) by.set(name, same = []);
      same.push([rule, scope.methods!.get(rule)!]);
    }
    return by;
  }
  rule_keyed(frame: Node, key: string): Node | undefined {
    const held = frame.rule_keys?.get(key);
    return held !== undefined && frame.methods?.has(held) ? held : undefined;
  }
  trivial(receiver: Node, at: Text.Node): Match {
    return { begin: at.begin, end: at.end + 1, pattern: at.end + 1, literals: [], captures: new Map(), operators: new Map(), args: [], receiver, tight: true };
  }
  reference_of(node: Node): Node {
    if (!node.lazy || node.lazy.raw || node.value !== undefined) return node;
    node.lazy.consumed = true;
    const cursor = this.cursor_of(node.lazy.span);
    const value = this.expression(cursor, node.lazy.frame, false);
    this.spaces(cursor);
    return value && cursor.done() ? value : node;
  }
  assign(slot: Node, value: Node | undefined, at: Text.Node, opts: { declare?: boolean; frame?: Node } = {}): Node | undefined {
    let node = this.reference_of(slot);
    // A name written as text is declared where it is declared from.
    if (opts.frame !== undefined && node.ref === undefined && node.lazy === undefined) { const written = this.text(slot).trim(); if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(written)) node = this.reference(opts.frame, written, at); }
    const marks: Node[] = [...(node.marks ?? [])];
    for (let depth = 0; node.ref && !node.marks?.length && depth < 64; depth++) {
      // A declaration binds the name as written: it looks only through what
      // the rule was given to find that name, never into a binding elsewhere.
      // A declaration goes through code it was handed to where that code is
      // written, and stops at a place: the place is what is declared.
      if (opts.declare) {
        const key = node.ref.key;
        let holder: Node | undefined;
        for (const scope of node.ref.scope.reading(new Set())) if (scope.own(key) !== undefined) { holder = scope; break; }
        if (!holder?.given?.has(key) || !this.gives(node.ref.scope, holder, key)) break;
        const held = holder.own(key)!;
        if (held.lazy !== undefined) { const next = this.reference_of(held); if (next.ref) { node = next; marks.push(...(next.marks ?? [])); continue; } break; }
        if (held.ref !== undefined) { node = held; marks.push(...(held.marks ?? [])); }
        break;
      }
      const bound = this.bound(node);
      const next = bound && this.reference_of(bound);
      if (next?.ref) { node = next; marks.push(...(next.marks ?? [])); } else break;
    }
    const thunk = value?.lazy !== undefined && value.value === undefined && !value.lazy.raw ? value : value !== undefined ? this.unforced(value) : undefined;
    const grouped = thunk?.lazy !== undefined && thunk.value === undefined && this.inner(thunk.lazy.span, thunk.lazy.frame) !== undefined;
    const here = opts.frame !== undefined && value !== undefined && !grouped ? (value.lazy !== undefined ? this.reference_of(value) : value) : undefined;
    const result = grouped ? thunk : here !== undefined && here === opts.frame ? here : this.deref(here ?? value);
    if (node.ref) {
      const bound = this.bound(node);
      if (bound?.style !== undefined) { this.alias(bound.style, result); return result; }
      let scope = node.ref.scope;
      if (scope === this.NONE) { this.error('Cannot assign into nothing.', at); return result; }
        // A declaration binds where it is written; an assignment finds what it names.
      if (!node.ref.own && !opts.declare) {
        let owner: Node | undefined;
        for (const s of scope.reading(new Set())) if (s.own(node.ref.key) !== undefined) { owner = s; break; }
        if (owner) scope = owner;
      }
      // A name is written where it is read from. A scope reads a member of
      // its own before a binding of the same name, so one that is already a
      // member is written as one: a field given when its instance was built
      // is a member, and assigning it otherwise left the member standing.
      if (result && !result.unknown && this.seeking === undefined) {
        const owned = scope.own(node.ref.key) !== undefined, held = scope.members?.has(node.ref.key) === true;
        if (held || (node.ref.member && !owned)) this.attach(scope, node.ref.key, result);
        if (owned || !node.ref.member) this.bind(scope, node.ref.key, result);
      }

      if (marks.length) this.mark_name(scope, node.ref.key, marks);
      // Definitions are what the source says, not what a body did at runtime.
      if (!this.in_body(at)) {
        this.definitions.push(`${scope.key}.${node.ref.key}`);
        this.site_at(`${scope === this.GLOBAL ? 'GLOBAL' : scope.key}::${node.ref.key}`);
      }
      return result;
    }
    const target = this.deref(node);
    if (target?.style !== undefined) { this.alias(target.style, result); return result; }
    this.error('Cannot assign here.', at);
    return result;
  }

  call(value: Node, arg: Node, at: Text.Node, frame: Node): Node | undefined {
    if (this.probing) {
      this.force(arg);
      const known = this.diagnostics.muted(() => this.safely(() => this.deref(value, false)));
      if (!known?.pure) return new Node(this.diagnostics, at);
    }
    const target = this.deref(value);
    if (!target) return undefined;
    if (!target.fn && target.params === undefined) {
      const found = this.call_rule(target);
      const span = arg.lazy?.span ?? arg.position;
      if (found && span) {
        const capture = found[0].pattern!.find(piece => piece.kind === 'capture');
        if (capture) {
          const match: Match = { begin: at.begin, end: at.end + 1, pattern: at.end + 1, literals: [], captures: new Map([[capture.name, span]]), operators: new Map(), args: [], receiver: target, tight: true };
          return this.apply({ rule: found[0], impl: found[1], match }, this.cursor_of(at), frame, at);
        }
      }
    }
    const arity = target.fn ? (target.arity ?? 1) : Math.max(target.params?.length ?? 1, 1);
    const expected = arity - (target.applied?.length ?? 0);
    const given = [arg];
    const applied = [...(target.applied ?? []), ...given];
    if (applied.length < arity) { const partial: Node = Object.assign(Object.create(Node.prototype), target); partial.applied = applied; return partial; }
    if (target.fn) return this.seeking !== undefined && !target.pure ? undefined : target.fn({ interpreter: this, frame, self: value, method: target, args: applied, at });
    if (!target.params) { this.error(`\`${this.text(value)}\` cannot be called.`, at); return undefined; }
    const local = this.frame(frame, `call@${this.anchor(at)}`, target.closure ?? this.GLOBAL);
    local.given = new Set(target.params);
    target.params.forEach((param, k) => this.bind(local, param, applied[k]));
    return target.body ? this.unalias(this.array(this.cursor_of(target.body), local, false, true), local) : undefined;
  }

  ids = 0;
  anchor(at: Text.Node): string { return `${at.source.location}:${at.begin}`; }
  // Where a frame was applied, named only when a frame comes to hold rules:
  // a site keeps the frames rules live on, and each re-entry is its own.
  frame(owner: Node, local: string | undefined, parent: Node): Node {
    // Every application is its own frame; a site remembers only the frames rules live on.
    const frame = new Node(this.diagnostics);
    frame.key = `#${++this.ids}`;
    frame.owner = owner; frame.site = local;
    frame.parent = parent;
    return frame;
  }

  private depth = 0;
  run_captures(rule: Node, match: Match, local: Node, frame: Node) {
    for (const piece of rule.pattern!) {
      if (piece.kind !== 'capture' || !piece.runs) continue;
      const span = match.captures.get(piece.name);
      // The caller is in reach while the arguments are read, and no longer:
      // what is built here is not made of where it was built.
      const linked = span !== undefined && !(local.sees?.includes(frame) ?? false);
      if (span !== undefined) this.sees(local, frame);
      const held = local.own(piece.name);
      if (span !== undefined) this.bind(local, piece.name, Object.assign(new Node(this.diagnostics, span), { literal: true }));
      const before = new Set<Key>(local.methods?.keys() ?? []);
      this.safely(() => this.array(this.cursor_of(piece.group), local));
      for (const [key, value] of local.methods ?? []) if (typeof key === 'string' && !before.has(key)) this.attach(local, key, value);
      if (held !== undefined) this.bind(local, piece.name, held);
      if (linked && local.sees !== undefined) local.sees = local.sees.filter(x => x !== frame);
    }
  }
  fire(found: Found, cursor: Text.Node, frame: Node): Node | undefined {
    const { rule, impl, match } = found;
    const at = cursor.span(match.begin, match.end - 1);
    cursor.cursor = match.end;
    if (this.depth > Interpreter.DEPTH) throw new Recursion(rule, at);
    this.depth++;
    try { return this.apply(found, cursor, frame, at); }
    finally { this.depth--; }
  }
  // Testing only: an application that meets the state it was applied in
  // again, the same way, three times over, will meet it forever.
  static LOOPS = typeof process !== 'undefined' && process.env.RAY_LOOPS !== undefined;
  private states: { key: string; rule: Node }[] = [];
  private visited = new WeakMap<Node, { jumps: number; seen: Set<string> }>();
  looped(frame: Node | undefined, label: string, at: Text.Node) {
    if (!Interpreter.LOOPS || frame === undefined) return;
    let held = this.visited.get(frame);
    if (held === undefined) this.visited.set(frame, held = { jumps: 0, seen: new Set() });
    if (++held.jumps < 100) return;
    const seen = held.seen;
    const state = `${label}|${this.state_of(frame, 3)}`;
    if (seen.has(state)) throw new Recursion(new Node(this.diagnostics, at), at, `\`${label || 'the beginning'}\` with nothing changed`);
    seen.add(state);
  }
  private repeats({ rule, match }: Found, at: Text.Node, frame: Node) {
    const located = (span: Text.Node) => `${span.source.location}:${span.begin}:${span.end}`;
    const scene = this.state_of(frame, 2);
    const key = [rule.key, located(at), this.state_of(match.receiver, 2), ...[...match.captures.values()].map(span => span.string), ...match.args.map(span => span.string), scene].join('|');
    this.states.push({ key, rule });
    const n = this.states.length;
    for (let j = n - 2; j >= 0; j--) {
      if (this.states[j].key !== key) continue;
      const period = n - 1 - j;
      if (n < 3 * period) return;
      for (let k = 0; k < 2 * period; k++) if (this.states[n - 1 - k].key !== this.states[n - 1 - k - period].key) return;
      throw new Recursion(rule, at, this.states.slice(n - period).map(state => state.rule.key!.replace(/^#\d+::|^GLOBAL::/, '')).join(' → '));
    }
  }
  // A state is what is written where: numbers and text by what they are,
  // everything else by where it is written, so what is built afresh at the
  // same place on every pass around a loop is the same.
  private state_of(node: Node | undefined, depth: number): string {
    if (node === undefined) return '_';
    if (node.lazy !== undefined && node.value === undefined) return `L${node.lazy.span.source.location}:${node.lazy.span.begin}`;
    const value = node.ref !== undefined ? this.bound(node) : node.lazy !== undefined ? node.value : node;
    if (value === undefined) return node.ref !== undefined ? `R${node.ref.key}` : '?';
    if (value instanceof Count) return `C${value.count}`;
    if (value.literal) return `T${value.position?.string}`;
    if (value.none) return 'N';
    if (value === this.GLOBAL) return 'G';
    const at = value.position ?? value.body;
    if (at !== undefined) return `@${at.source.location}:${at.begin}`;
    if (depth === 0) return 'O';
    const parts: string[] = [];
    for (const [key, held] of value.methods ?? []) if (typeof key === 'string') parts.push(`${key}=${this.state_of(held, depth - 1)}`);
    return `{${parts.join(',')}}`;
  }

  apply(found: Found, cursor: Text.Node, frame: Node, at: Text.Node): Node | undefined {
    const watched = Interpreter.LOOPS && this.applying.length > 30;
    if (watched) this.repeats(found, at, frame);
    try { return this.applied(found, cursor, frame, at); }
    finally { if (watched) this.states.pop(); }
  }
  applied({ rule, impl, match }: Found, cursor: Text.Node, frame: Node, at: Text.Node): Node | undefined {
    const found = { rule, impl, match };
    const captures = new Map<string, Node>();
    rule.pattern!.forEach((piece, p) => {
      // What stands between two operands is bound the way what stands
      // inside a group is: `[x]` names what is written there, as `{x}` does.
      if (piece.kind === 'operator') {
        const written = match.operators.get(piece.name);
        if (written === undefined) return;
        captures.set(piece.name, this.lazy(written, frame, true));
        return;
      }
      if (piece.kind !== 'capture') return;
      const span = match.captures.get(piece.name);
      const read = piece.raw || impl.forward ? undefined : match.read?.get(piece.name);
      if (read !== undefined) captures.set(piece.name, read);
      else if (span) { const node = this.lazy(span, frame, piece.raw); captures.set(piece.name, node); }
      else if (p === 0 && match.receiver !== undefined) captures.set(piece.name, match.receiver);
    });
    this.painted_application(rule, impl, match, captures, cursor, frame, at);
    // Parameters are values, not blocks: reading them here is what lets a
    // method be called with its argument beside it rather than in brackets.
    let args = match.args.map((span, k) => { const given = match.given?.[k]; if (given !== undefined) return given; return this.lazy(span, frame, false); });
    if (this.probing) {
      captures.forEach(node => { if (!node.lazy?.raw) this.force(node); });
      args.forEach(node => this.force(node));
      if (match.receiver?.ref !== undefined) this.bound(match.receiver);
      if (impl.forward && match.receiver !== undefined) return match.receiver;
      return this.stand_in(at);
    }
    if (impl.forward) return this.pass(found, captures, args, cursor, frame, at);
    const short = this.shortcut(found, captures, args, cursor, frame, at);
    if (short !== undefined) return short.value;

    // A call site keeps one frame, so a rule that reaches itself would share
    // that frame with the reading still in progress. Each re-entry gets its
    // own instead.
    const local = this.frame(frame, undefined, impl.closure ?? this.GLOBAL);
    this.enter_frame(local, rule, at);
    // A frame is written where what made it is written.
    local.position = at;
    local.given = new Set([...captures.keys(), ...(impl.params ?? [])]);
    for (const [name, node] of captures) this.bind(local, name, node);
    if (impl.params !== undefined) while (args.length < impl.params.length) args.push(this.NONE);
    impl.params?.forEach((param, k) => {
      // What a parameter was declared to be is what its rules are, before
      // anyone reads the argument itself.
      const written = impl.param_types?.[k];
      if (written !== undefined && args[k] !== undefined) {
        const named = this.diagnostics.muted(() => this.safely(() => this.deref(this.reference(impl.closure ?? frame, written.string.trim(), written), false)));
        if (named !== undefined) args[k].declared = named;
      }
      this.bind(local, param, args[k]);
    });
    this.run_captures(rule, match, local, frame);
    local.applied_to = match.receiver;
    const into = this.context_of(match.receiver);
    if (into !== undefined) { this.construct(into); this.sees(local, into); }
    this.ran.add(rule.key!);
    this.applying.push({ rule, impl, receiver: match.receiver, local });
    try {
      if (impl.fn) return impl.fn({ interpreter: this, frame: local, self: match.receiver, method: impl, args: [...captures.values(), ...args], at });
      if (!impl.body) return undefined;
      const rewrites = rule.pattern!.some(piece => piece.kind === 'operator');
      if (rewrites) this.rewriting.add(rule);
      // What `[x]` names is not a name but the operator itself, so a body
      // that writes `a [x] b` writes what stands there: the operator is put
      // where it is written, and the body is read as that. It is read this
      // way only when the rule fires, and only where the body says `[x]`.
      const body = rewrites ? this.written_with(impl.body, rule, match) : impl.body;
      try {
        const answered = this.unalias(this.read_body(rule, impl, body, local, impl.params !== undefined), local);
        return answered;
      }
      catch (jump) {
        if (jump instanceof Jump && jump.kind === 'end' && this.seeking === undefined && impl.lexical !== undefined && jump.site !== undefined && Interpreter.within(jump.site, impl.lexical)) return jump.value;
        throw this.ends_at(jump, impl, at);
      }
      finally { if (rewrites) this.rewriting.delete(rule); }
    } finally { this.applying.pop(); this.leave_frame(local); }
  }
  private label_spans = new WeakMap<Text.Source, Map<string, number[]>>();
  // Seeking a label runs a span again until the label is read, which it can
  // only be where the label is written.
  spells_label(source: Text.Source, begin: number, end: number, label: string): boolean {
    let held = this.label_spans.get(source);
    if (held === undefined) this.label_spans.set(source, held = new Map());
    let at = held.get(label);
    if (at === undefined) {
      at = [];
      const spelled = `${label}\\`, text = source.value;
      for (let k = text.indexOf(spelled); k >= 0; k = text.indexOf(spelled, k + 1)) at.push(k);
      held.set(label, at);
    }
    for (const k of at) if (k >= begin && k < end) return true;
    return false;
  }
  protected ends_at(jump: unknown, impl: Node, at: Text.Node): unknown {
    if (impl.params === undefined && jump instanceof Jump && jump.kind === 'end' && (jump.site === undefined || Interpreter.within(jump.site, at) || Interpreter.within(jump.site, impl.body!))) jump.site = at;
    return jump;
  }
  // Where an interpreter may answer instead of reading: an application whose
  // body it need not read, the start of an expression, a body as a whole.
  shortcut(found: Found, captures: Map<string, Node>, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node): { value: Node | undefined } | undefined { return undefined; }
  *read_pass(srcs: Text.Source[]): Generator<void> { for (const src of srcs) { this._interpret(src); yield; } }
  native(key: string, at: Text.Node): Native | undefined { return this.program?.EXTERNALS[key] ?? Natives[key]; }
  lead(cursor: Text.Node, frame: Node): { value: Node | undefined } | undefined { return undefined; }
  read_body(rule: Node, impl: Node, body: Text.Node, local: Node, functional: boolean): Node | undefined { return this.array(this.cursor_of(body), local, false, functional); }
  // A body with the operators it was handed written into it.
  private written_with(body: Text.Node, rule: Node, match: Match): Text.Node {
    let text = body.string, written = false;
    for (const piece of rule.pattern!) {
      if (piece.kind !== 'operator') continue;
      const stands = match.operators.get(piece.name);
      const token = `[${piece.name}]`;
      if (stands === undefined || !text.includes(token)) continue;
      text = text.split(token).join(stands.string);
      written = true;
    }
    return written ? Text.Node.string(text) : body;
  }
  static within(inner: Text.Node, outer: Text.Node): boolean { return inner.source === outer.source && inner.begin >= outer.begin && inner.end <= outer.end; }
  unalias(result: Node | undefined, local: Node): Node | undefined {
    if (!result?.ref || result.ref.scope !== local || !local.given?.has(result.ref.key)) return result;
    const bound = local.own(result.ref.key);
    return bound;
    return this.decorate(bound, result.marks[result.marks.length - 1]);
  }

  head(rule: Node): string | undefined { const first = rule.pattern!.find(x => x.kind === 'literal'); return first?.kind === 'literal' ? first.text.trim().split(/\s+/)[0] : undefined; }

  pass(found: Found, captures: Map<string, Node>, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node): Node | undefined {
    const { rule, match } = found;
    const head = this.head(rule);
    const real = head !== undefined ? this.resolved(this.reference(frame, head, at)) : undefined;
    let decorator: Node | undefined;
    if (real?.callable && real !== found.impl) {
      decorator = real;
      for (const node of captures.values()) if (node !== match.receiver && decorator) decorator = this.call(decorator, this.lazy(node.lazy!.span, frame, true), at, frame);
    }
    if (args.length > 0) {
      const argument = args[args.length - 1];
      if (match.receiver !== undefined) this.provisional(match.receiver, argument);
      return argument;
    }
    if (match.receiver !== undefined) return decorator?.style !== undefined ? this.decorate(match.receiver, decorator) : match.receiver;
    const next = this.skip(cursor, cursor.cursor);
    if (decorator !== undefined && (next >= cursor.limit || cursor.source.value[next] === '\n' || this.best(decorator, cursor, frame, { spaced: true, operand: false }))) return decorator;
    const b = this.expression(cursor, frame, match.tight);
    return b !== undefined && decorator?.style !== undefined ? this.decorate(b, decorator) : b;
  }

  provisional(receiver: Node, argument: Node) {
    let node = this.reference_of(receiver);
    for (let depth = 0; node.ref && depth < 64; depth++) {
      const bound = this.bound(node);
      if (bound === undefined) break;
      const next = this.reference_of(bound);
      if (!next.ref) return;
      node = next;
    }
    if (!node.ref || this.bound(node) !== undefined) return;
    const value = this.deref(argument, false);
    if (value) this.bind(node.ref.scope, node.ref.key, value);
  }

  external(name: Text.Node, at: Text.Node, frame: Node): Node | undefined {
    const key = name.string;
    const native = this.native(key, name);
    if (!native) { this.error(`Expected method \`${key}\` to be externally defined by the runtime, but it wasn't.`, name); return undefined; }
    if (native.arity === 0) return native.fn({ interpreter: this, frame, args: [], method: this.EXTERNAL, at });
    const node = new Node(this.diagnostics, name);
    node.fn = native.fn; node.arity = native.arity; node.pure = native.pure;
    return node;
  }

  forward(pattern: Text.Node, frame: Node): Node {
    const pieces = this.read_head(pattern, frame).pieces;
    const key = `${frame.key}::forward ${pieces.map(describe).join('')}`;
    const rule = this.rule_keyed(frame, key) ?? Object.assign(new Node(this.diagnostics, pattern), { key });
    rule.pattern = pieces;
    const impl = new Node(this.diagnostics, pattern);
    impl.forward = pattern; impl.closure = frame;
    if (!pieces.some(x => x.kind === 'capture')) impl.params = ['argument'];
    if (this.probing) return impl;
    if (impl.params) {
      const name = this.head(rule);
      if (name !== undefined && !(frame.own(name) && !frame.own(name)!.forward)) this.bind(frame, name, impl);
    }
    this.bind(frame, rule, impl);
    this.definitions.push(key);
    return impl;
  }

  arrow(cursor: Text.Node, frame: Node): number { return this.arrow_at(cursor, frame); }
  arrow_at(cursor: Text.Node, frame: Node): number {
    const text = cursor.source.value, limit = cursor.limit, start = cursor.cursor;
    let last = -1;
    for (let j = start; j < limit && text[j] !== '\n';) {
      if (text.startsWith('=>', j) && (j === start || /\s/.test(text[j - 1])) && (j + 2 >= limit || /\s/.test(text[j + 2]))) last = j;
      if (this.line_rule(cursor, j, frame, start)) return last;
      const claimed = this.claim(cursor, j, frame);
      j = claimed > j ? claimed : j + 1;
    }
    return last;
  }

  grammar_rule(cursor: Text.Node, frame: Node): Node | undefined {
    const arrow = this.arrow(cursor, frame);
    if (arrow < 0) return undefined;
    const text = cursor.source.value, start = cursor.cursor;
    // A line some rule in reach reads is that rule's: the seed only defines
    // what nothing else matches.
    const operand = this.operand_end(cursor, start, frame);
    if (operand > start && operand < arrow) {
      const probe = this.cursor_of(cursor.span(this.skip(cursor, operand), cursor.limit - 1));
      const written = cursor.span(start, operand - 1), receiver = this.reference(frame, written.string.trim(), written);
      const written_in: (readonly [Node, Node][])[] = [];
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) written_in.push(this.ruleset(scope).receiver);
      const set = [...written_in, ...this.candidates(receiver, frame)], left: Node[] = [];
      let found: Found | undefined;
      for (let tries = 0; tries < 8; tries++) {
        found = this.diagnostics.muted(() => this.safely(() => this.best_of(set.map(segment => segment.filter(([rule]) => !left.includes(rule))), receiver, probe, frame, { spaced: true, operand: false })));
        if (found === undefined || found.match.end <= arrow || (!found.impl.defines && found.match.literals.some(([, from]) => from === arrow))) break;
        left.push(found.rule);
      }
      if (found !== undefined && !found.impl.defines && found.match.end > arrow && found.match.literals.some(([, from]) => from === arrow)) {
        let end = arrow;
        while (end > start && /\s/.test(text[end - 1])) end--;
        const earlier = this.heads_read.get(`${cursor.source.location}:${start}:${end - 1}`)?.head.shared.rule;
        if (earlier !== undefined) this.withdraw(frame, earlier);
        const answered = this.fire(found, probe, frame);
        cursor.cursor = probe.cursor;
        return answered ?? this.NONE;
      }
    }
    let lhs_end = arrow;
    while (lhs_end > start && /\s/.test(text[lhs_end - 1])) lhs_end--;
    const body_start = this.skip(cursor, arrow + 2);
    const body_end = this.line_end(cursor, body_start, frame);
    cursor.cursor = body_end;
    if (lhs_end <= start) { this.error('Expected a pattern before `=>`.', cursor.span(arrow, arrow + 1)); return new Node(this.diagnostics); }
    if (!this.probing && body_end > body_start) for (const [rule, impl] of [...(this.definers(frame)[0] ?? [])].sort(([a], [b]) => b.pattern!.length - a.pattern!.length)) {
      if (rule.position !== undefined && rule.position.source.location === cursor.source.location && rule.position.begin === start) continue;
      const pieces = rule.pattern!, last = pieces.length - 1, body = pieces[last];
      let arrow_at = last - 1;
      while (arrow_at >= 0 && pieces[arrow_at].kind === 'space') arrow_at--;
      if (body?.kind !== 'capture' || arrow_at < 1 || pieces[arrow_at].kind !== 'literal') continue;
      let head_end = arrow_at;
      while (head_end > 0 && pieces[head_end - 1].kind === 'space') head_end--;
      const head = pieces.slice(0, head_end), span = cursor.span(start, lhs_end - 1);
      let captures: Map<string, Text.Node>;
      if (head.length === 1 && head[0].kind === 'capture') captures = new Map([[head[0].name, span]]);
      else {
        const read = this.cursor_of(span), match = this.diagnostics.muted(() => this.safely(() => this.match(head, read, frame, { leading: false, tight: false, params: 0 })));
        if (match === undefined || match.end !== lhs_end) continue;
        captures = match.captures;
      }
      captures.set(body.name, cursor.span(body_start, body_end - 1));
      cursor.cursor = start;
      const answer = this.fire({ rule, impl, match: { begin: start, end: body_end, pattern: body_end, literals: [], captures, operators: new Map(), args: [], tight: false } }, cursor, frame);
      if (answer !== undefined && !this.deref(answer, false)?.none) return answer;
      cursor.cursor = body_end;
    }
    return this.define(cursor.span(start, lhs_end - 1), body_end > body_start ? cursor.span(body_start, body_end - 1) : undefined, frame, cursor.span(arrow, arrow + 1));
  }

  // The seed reads a head by its brackets only: what is written, spaces,
  // `{x}` capturing x and `[x]` an operator named x. Everything else a head
  // says is read by the language's own grammar rule.
  private definitions_made = new Map<string, { pass: number; frame: Node; methods: [Key, Node][]; members: [string, Node][] }>();
  private heads_read = new Map<string, { pass: number; frame: Node; head: Head }>();
  read_head(lhs: Text.Node, frame: Node): Head {
    const at = `${lhs.source.location}:${lhs.begin}:${lhs.end}`, known = lhs.source.location === undefined ? undefined : this.heads_read.get(at);
    if (known !== undefined && known.pass === this.passing && known.frame === frame && known.head.pattern[0].string === lhs.string) return known.head;
    const pieces = this.pieces_of(lhs, frame, []);
    const head: Head = { pattern: [lhs], param_names: [], param_types: [], pieces, spelled: pieces.map(describe).join(''), shared: known?.head.shared ?? {} };
    if (lhs.source.location !== undefined) this.heads_read.set(at, { pass: this.passing, frame, head });
    return head;
  }
  // A group written directly inside a group is that bracket, written.
  pieces_of(span: Text.Node, frame: Node, pieces: Piece[]): Piece[] {
    const text = span.source.value, end = span.end + 1;
    const written = (spelled: string) => { const last = pieces[pieces.length - 1]; if (last?.kind === 'literal') last.text += spelled; else pieces.push({ kind: 'literal', text: spelled }); };
    for (let j = span.begin; j < end;) {
      if (/\s/.test(text[j])) { while (j < end && /\s/.test(text[j])) j++; if (j < end) pieces.push({ kind: 'space' }); continue; }
      if (text[j] !== '{' && text[j] !== '[') { written(text[j]); j++; continue; }
      const close = this.group_end(text, j, end), content = span.span(j + 1, close - 2);
      let from = j + 1; while (from < close - 1 && /\s/.test(text[from])) from++;
      let to = close - 2; while (to > from && /\s/.test(text[to])) to--;
      if (close - j === 2) written(text.slice(j, close));
      else if ((text[from] === '{' || text[from] === '[') && this.group_end(text, from, close - 1) === to + 1) {
        written(text[j]);
        this.pieces_of(span.span(from, to), frame, pieces);
        written(text[close - 1]);
      }
      else if (text[j] === '{') pieces.push(this.capture(content, frame, pieces.length));
      else pieces.push({ kind: 'operator', name: content.string.trim(), group: span.span(j, close - 1), content });
      j = close;
    }
    return pieces;
  }
  define(lhs: Text.Node, body: Text.Node | undefined, frame: Node, arrow?: Text.Node, closure?: Node): Node {
    return this.register(this.read_head(lhs, frame), lhs, body, frame, arrow, closure);
  }
  register(written: Head, lhs: Text.Node, body: Text.Node | undefined, frame: Node, arrow?: Text.Node, closure?: Node): Node {
    const { pattern, params, param_names, param_types, pieces, spelled, shared } = written;
    if (pieces.length === 0) { this.error('Expected a pattern before `=>`.', lhs); return new Node(this.diagnostics, lhs); }
    const key = `${frame.key}::${spelled}${params ? `(${params.join(',')})` : ''}`;
    const rule = this.rule_keyed(frame, key) ?? shared.rule ?? Object.assign(new Node(this.diagnostics, lhs), { key });
    shared.rule ??= rule;
    if (body !== undefined) { const held = shared.body; if (held !== undefined && held.source === body.source && held.begin === body.begin && held.end === body.end) body = held; else shared.body = body; }
    rule.pattern = pieces; rule.position = lhs;
    const introduced = this.introductions.get(spelled);
    if ((params?.length ?? 0) > 0 && (introduced === undefined || this.earlier(lhs, introduced))) this.introductions.set(spelled, lhs);
    const impl = new Node(this.diagnostics, body ?? lhs);
    impl.body = body; impl.closure = closure ?? frame; impl.params = params;
    impl.param_types = param_types.length > 0 ? param_types : undefined;
    const head = body === undefined ? undefined : this.name(this.cursor_of(body), frame);
    if (head !== undefined && frame.lookup(head) === this.EXTERNAL) {
      const token = this.cursor_of(body!); token.advance(head.length);
      const native = this.native(this.raw(token, 'token').position!.string, body);
      impl.defines = native === Natives.rule; impl.operation = native?.operation;
    }
    else if (body !== undefined) impl.defines = this.calls_native(body, frame, Natives.rule);
    if (!this.probing) { const fresh = this.spelled_before(impl); this.bind(frame, rule, impl); this.definitions.push(key); if (fresh) this.site_at(`rule::${key}`, lhs); }
    if (this.probing) return impl;
    if (pieces.some(piece => piece.kind === 'operator')) this.pending_rewrites.push([rule, impl]);
    return impl;
  }

  private calling = new Map<string, { pass: number; calls: boolean }>();
  calls_native(body: Text.Node, frame: Node, native: Native): boolean {
    const key = `${body.source.location}:${body.begin}:${body.end}`, known = this.calling.get(key);
    if (known !== undefined && known.pass === this.passing) return known.calls;
    const calls = this.scans_native(body, frame, native);
    this.calling.set(key, { pass: this.passing, calls });
    return calls;
  }
  scans_native(body: Text.Node, frame: Node, native: Native): boolean {
    for (const found of body.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) {
      if (frame.lookup(found[0]) !== this.EXTERNAL) continue;
      const token = this.cursor_of(body); token.cursor = this.skip(token, body.begin + found.index! + found[0].length);
      const word = this.raw(token, 'token').position?.string;
      if (word !== undefined && this.native(word, body) === native) return true;
    }
    return false;
  }
  private definers_of = new WeakMap<Node, { version: number; rules: Rules }>();
  definers(frame: Node): Rules {
    const held = this.rooted(frame), known = this.definers_of.get(held);
    if (known !== undefined && known.version === this.version) return known.rules;
    const out: [Node, Node][] = [], seen = new Set<Node>();
    const visit = (scope: Node) => { for (const rule of scope.rules.reverse()) { const impl = scope.methods!.get(rule)!; if (impl.defines && !seen.has(rule)) { seen.add(rule); out.push([rule, impl]); } } };
    for (let scope: Node | undefined = held; scope; scope = scope.parent) { visit(scope); for (const made of scope.made_of ?? []) visit(made); }
    if (this.BASE) visit(this.BASE);
    const rules = out.length > 0 ? [out] : [];
    this.definers_of.set(held, { version: this.version, rules });
    return rules;
  }


  text_of(value: Node): string | undefined { return undefined; }
  // Defining at a name defines where that name is written, spelled after it.
  define_in(scope: Node, given: Node, held: Node, at: Text.Node): Node | undefined {
    let location = this.reference_of(scope);
    for (let depth = 0; location.ref && depth < 64; depth++) { const bound = this.bound(location); const next = bound && this.reference_of(bound); if (!next?.ref || next === location) break; location = next; }
    if (location.ref && !location.ref.member) {
      const spelled = this.deref(given, false), text = spelled === undefined || spelled.none ? undefined : spelled.literal ? spelled.position!.string : this.text_of(spelled);
      if (text === undefined) return undefined;
      const made = this.rule(Object.assign(new Node(this.diagnostics, Text.Node.string(location.ref.key + text)), { literal: true }), held, at, location.ref.scope, true);
      if (made !== undefined) for (let k = this.applying.length - 1; k >= 0 && made.lexical === undefined; k--) made.lexical = this.applying[k].local?.position;
      return made;
    }
    const into = this.deref(scope, false);
    return into === undefined || into.none ? undefined : this.rule(given, held, at, into, true);
  }
  rule(given: Node, held: Node, at: Text.Node, calling: Node, into: boolean = false): Node | undefined {
    if (!into) {
      const pattern = this.written(given), body = this.written(held);
      const lhs = pattern?.lazy?.span, written = body?.lazy?.span, frame = pattern?.lazy?.frame;
      if (lhs === undefined || written === undefined || frame === undefined) return undefined;
      pattern!.lazy!.consumed = true; body!.lazy!.consumed = true;
      const text = lhs.source.value, arrow = text.indexOf('=>', lhs.end + 1);
      return this.define(lhs, written, frame, arrow >= 0 && arrow < written.begin ? lhs.span(arrow, arrow + 1) : undefined);
    }
    const spelled = this.deref(given, false), body = this.written(held);
    const grouped = body?.lazy !== undefined ? this.inner(body.lazy.span, body.lazy.frame) : undefined;
    const text = spelled === undefined || spelled.none || spelled.literal ? undefined : this.text_of(spelled);
    const lhs = spelled?.literal ? spelled.position : text !== undefined ? Text.Node.string(text) : undefined, written = grouped ?? body?.lazy?.span;
    if (lhs === undefined || written === undefined) return undefined;
    if (body?.lazy !== undefined) body.lazy.consumed = true;
    return this.define(lhs, written, calling, undefined, grouped !== undefined ? body!.lazy!.frame : undefined);
  }



  static pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']', '`': '`' };
  static depth(text: string): number {
    let depth = 0;
    for (const c of text) { if (c !== '`' && Interpreter.pairs[c] !== undefined) depth++; else if (c !== '`' && Object.values(Interpreter.pairs).includes(c)) depth--; }
    return depth;
  }
  group_end(text: string, j: number, end: number): number {
    const pairs = Interpreter.pairs;
    const open = text[j], close = pairs[open];
    if (!close) return j;
    if (open === '`') { const q = text.indexOf('`', j + 1); return q < 0 || q >= end ? end : q + 1; }
    let depth = 0;
    for (let k = j; k < end; k++) {
      const c = text[k];
      if (c === '`') { const q = text.indexOf('`', k + 1); if (q < 0 || q >= end) return end; k = q; continue; }
      if (c === open) depth++;
      else if (c === close && --depth === 0) return k + 1;
    }
    return end;
  }
  chunks(span: Text.Node): Text.Node[] {
    if (span.empty()) return [];
    const text = span.source.value, end = span.end + 1, out: Text.Node[] = [];
    for (let j = span.begin; j < end;) {
      while (j < end && /\s/.test(text[j])) j++;
      if (j >= end) break;
      const start = j;
      while (j < end && !/\s/.test(text[j])) { const close = this.group_end(text, j, end); j = close > j ? close : j + 1; }
      out.push(span.span(start, j - 1));
    }
    return out;
  }
  tokens(span: Text.Node, frame: Node): Text.Node[] { return this.chunks(span); }
  split(span: Text.Node, separator: string): Text.Node[] {
    const text = span.source.value, parts: Text.Node[] = [];
    let from = span.begin;
    for (let j = span.begin; j <= span.end;) {
      const skip = this.group_end(text, j, span.end + 1);
      if (skip > j) { j = skip; continue; }
      if (text[j] === separator) { if (j > from) parts.push(span.span(from, j - 1)); from = j + 1; }
      j++;
    }
    if (span.end >= from) parts.push(span.span(from, span.end));
    return parts;
  }

  private passing = 0;
  literal_written(text: Node) {}
  // A capture's content is code. A bare name captures what is written there
  // as code; otherwise the name is the one the content declares or reads
  // with nothing bound to it, `literal` keeps the text unread, and what the
  // content declares the name with is what the captured text must be.
  capture(content: Text.Node, frame: Node, index: number): Piece {
    const written = content.string.trim();
    const bare: Piece = { kind: 'capture', name: written, raw: false, runs: false, group: content };
    if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(written)) return bare;
    if (written === '') return { kind: 'space' };
    let refusals = 0;
    const run = (scope: Node, probing: number) => {
      const was = this.probing, seeking = this.seeking, refused = this.diagnostics.refused;
      this.probing = probing; this.seeking = undefined; scope.capture_text = content;
      try { return this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(content), scope), true))); }
      finally { refusals = this.diagnostics.refused - refused; this.probing = was; this.seeking = seeking; this.diagnostics.refused = refused; }
    };
    const seen = this.frame(frame, 'capture', frame);
    seen.observed = [];
    run(seen, 1);
    const name = seen.observed.find(word => frame.lookup(word) === undefined) ?? seen.observed.find(word => !frame.lookup(word)?.fn);
    if (name === undefined) {
      const answered = run(this.frame(frame, 'capture', frame), 0);
      if (answered?.literal && answered.position !== undefined) {
        const text = answered.position.string;
        if (text !== '' && text.trim() === '') return text.includes('\n') ? { kind: 'newline', group: content } : { kind: 'space' };
        return { kind: 'literal', text };
      }
    }
    if (name === undefined) return { ...bare, name: `#${index}` };
    const scope = this.frame(frame, 'capture', frame);
    scope.observed = []; scope.shadows = name; scope.missing = [];
    const value = run(scope, 0);
    const held = this.diagnostics.muted(() => this.safely(() => this.deref(scope.own(name), false)));
    const undecided = scope.missing.length > 0 || (refusals > 0 && (value === undefined || value.unknown === true));
    const declared = undecided || held?.none ? this.unknown(content) : held;
    let optional = false;
    if (value !== undefined && !value.unknown) {
      const asked = this.frame(frame, 'optional', frame);
      this.bind(asked, 'held', value);
      const answer = this.diagnostics.muted(() => this.safely(() => this.resolved(this.array(this.cursor_of(Text.Node.string('None.instance_of(held)')), asked))));
      optional = answer !== undefined && !answer.none;
    }
    const runs = declared === undefined && written !== name;
    return { kind: 'capture', name, raw: scope.quoted === true, optional, runs, declared, within: frame, declaration: declared === undefined ? undefined : written, group: content };
  }
  // A capture's content, run with its name holding the text: an error means
  // the text does not hold.
  holds_text(piece: Piece & { kind: 'capture' }, span: Text.Node): Node | null {
    const closure = piece.within ?? this.GLOBAL, scope = this.frame(closure, 'capture', closure);
    this.bind(scope, piece.name, Object.assign(new Node(this.diagnostics, span), { literal: true }));
    const probing = this.probing, seeking = this.seeking, refused = this.diagnostics.refused;
    this.probing = 0; this.seeking = undefined;
    try {
      this.diagnostics.muted(() => this.safely(() => this.array(this.cursor_of(piece.group), scope)));
      if (this.diagnostics.refused !== refused) return null;
      return this.diagnostics.muted(() => this.safely(() => this.deref(scope.own(piece.name), false))) ?? null;
    }
    finally { this.probing = probing; this.seeking = seeking; this.diagnostics.refused = refused; }
  }
  // A word nothing names is read by the rules that are only a typed capture.
  literally(node: Node): Node | undefined {
    const ref = node.ref!, span = node.position;
    if (span === undefined || ref.through !== undefined) return ref.through;
    for (const [rule, impl] of each(this.chain(ref.scope).receiver)) {
      const piece = rule.pattern![0];
      if (rule.pattern!.length !== 1 || piece.kind !== 'capture' || piece.declared === undefined || piece.declared.unknown) continue;
      const value = this.holds_text(piece, span);
      if (value === null) continue;
      const match: Match = { begin: span.begin, end: span.end + 1, pattern: span.end + 1, literals: [], captures: new Map([[piece.name, span]]), operators: new Map(), args: [], tight: true, read: new Map([[piece.name, value]]) };
      const read = this.apply({ rule, impl, match }, this.cursor_of(span), ref.scope, span);
      if (read !== undefined) return ref.through = read;
    }
    return undefined;
  }
  quoted = 0;

  // What a rule's pattern says about where it could begin, read once: the
  // same questions were asked of every rule at every position.
  shaped(rule: Node) {
    const pieces = rule.pattern!;
    const leading = pieces[0]?.kind === 'capture';
    const first = pieces[leading ? 1 : 0];
    return {
      literal: pieces.length === 1 && pieces[0].kind === 'capture' && pieces[0].declared !== undefined,
      head: first?.kind === 'literal' && first.text[0] !== ' ' ? first.text[0] : undefined,
      leading,
      newline: first?.kind === 'newline',
      operator: pieces.some(piece => piece.kind === 'operator'),
      filtered: pieces.filter(piece => piece.kind === 'operator' && piece.declaration !== undefined).length,
      loose: pieces[0]?.kind === 'space',
    };
  }

  rule_head(word: string, frame: Node): Node | undefined {
    const chain = this.chain(frame);
    for (const [rule, impl] of each([...chain.operand, ...chain.receiver])) if (!impl.forward && this.head(rule) === word) return rule;
  }
  private prefixing?: { version: number; marks: Set<string> };
  // What a word written straight after it belongs to: a rule that reads a
  // word after one character reads it as that character's, not as a name of
  // its own — `.name` is a member, `^name` a style.
  get prefixes(): Set<string> {
    if (this.prefixing?.version === this.version) return this.prefixing.marks;
    const marks = new Set<string>();
    const take = (rules: [Node, Node][]) => {
      for (const [rule] of rules) {
        const pieces = rule.pattern!;
        const opening = pieces[0], after = pieces[1];
        if (opening?.kind !== 'literal' || after?.kind !== 'capture' || !after.raw) continue;
        const text = opening.text.trim();
        if (text.length === 1 && !/[\p{L}\p{N}_]/u.test(text)) marks.add(text);
      }
    };
    for (const scope of this.BASE === undefined ? [this.GLOBAL] : [this.GLOBAL, this.BASE]) {
      const set = this.ruleset(scope);
      take(set.operand);
      take(set.receiver);
    }
    this.prefixing = { version: this.version, marks };
    return marks;
  }
  protected blank = Text.Node.string('');
  owns: (src: Text.Source) => boolean = () => true;
  decorate(target: Node, style: Node): Node {
    const reference = this.reference_of(target);
    if (reference.ref) {
      const marked = new Node(this.diagnostics, reference.position);
      marked.ref = reference.ref;
      marked.marks = [...(reference.marks ?? []), style];
      return marked;
    }
    const value = this.deref(target, false);
    if (value) this.mark_value(value, [style]);
    return value ?? target;
  }
  mark_value(value: Node, styles: Node[], sources: Node[] = []) {}
  mark_name(scope: Node, key: string, styles: Node[]) {}
  style_of(value: Node): string | undefined { return undefined; }
  private ran = new Set<string>();
  private applying: { rule: Node; impl?: Node; receiver?: Node; local?: Node }[] = [];
  scope_of(node: Node): Node | undefined {
    const { scope, key, own } = node.ref!;
    if (own) return scope;
    for (let current: Node | undefined = scope; current; current = current.parent) if (current.own(key) !== undefined || current.members?.get(key) !== undefined) return current;
  }
  paint_reference(reference: Node) {}
  private bodies = new Map<Text.Source, { seen: Set<number>; list: number[]; merged?: number[] }>();
  body_of(span: Text.Node) {
    let held = this.bodies.get(span.source);
    if (held === undefined) this.bodies.set(span.source, held = { seen: new Set(), list: [] });
    const key = span.begin * 1e7 + span.end;
    if (held.seen.has(key)) return;
    held.seen.add(key);
    held.list.push(span.begin, span.end);
    held.merged = undefined;
  }
  in_body(at: Text.Node): boolean {
    const held = this.bodies.get(at.source);
    if (held === undefined) return false;
    if (held.merged === undefined) {
      const spans: [number, number][] = [];
      for (let k = 0; k < held.list.length; k += 2) spans.push([held.list[k], held.list[k + 1]]);
      spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
      const merged: number[] = [];
      for (const [begin, end] of spans) {
        if (merged.length > 0 && begin <= merged[merged.length - 1] + 1) { if (end > merged[merged.length - 1]) merged[merged.length - 1] = end; continue; }
        merged.push(begin, end);
      }
      held.merged = merged;
    }
    const spans = held.merged;
    let low = 0, high = (spans.length >> 1) - 1, found = -1;
    while (low <= high) { const mid = (low + high) >> 1; if (spans[mid << 1] <= at.begin) { found = mid; low = mid + 1; } else high = mid - 1; }
    return found >= 0 && at.end <= spans[(found << 1) + 1];
  }
  excluded(span: Text.Node, frame: Node): [number, number][] {
    const out: [number, number][] = [];
    const cursor = this.cursor_of(span);
    const text = span.source.value;
    for (let j = span.begin; j <= span.end;) {
      if (this.line_rule(cursor, j, frame)) {
        let end = text.indexOf('\n', j);
        if (end < 0 || end > span.end) end = span.end + 1;
        out.push([j, end - 1]); j = end; continue;
      }
      const raw = this.layers.brackets.find(([rule]) => (rule.pattern![0] as { text: string }).text[0] === text[j] && rule.pattern!.some(piece => piece.kind === 'capture' && piece.raw));
      if (raw) {
        const match = this.match(raw[0].pattern!, cursor.bounded(j, span.end + 1), frame, { leading: false, tight: true, params: 0 });
        if (match) { out.push([j, match.end - 1]); j = match.end; continue; }
      }
      j++;
    }
    return out;
  }
  probing = 0;
  // What the language server is told, and keeps: nothing, here.
  painted_application(rule: Node, impl: Node, match: Match, captures: Map<string, Node>, cursor: Text.Node, frame: Node, at: Text.Node) {}
  site_at(key: string, at?: Text.Node) {}
  stale_rules(frame: Node, key: Key): boolean { return false; }
  registered(frame: Node) {}
  enter_frame(frame: Node, rule: Node, at: Text.Node) {}
  leave_frame(frame: Node) {}
  begin_pass(pass: number) {}
  end_pass() {}
  derived_all(srcs: Text.Source[]) {}
  paint(span: Text.Node, style: Node | undefined, frame: Node, of?: string) {}
  record(painted: Text.Node) {}

  style(name: string): Node {
    const node = new Node(this.diagnostics);
    node.style = name; node.arity = 1;
    node.fn = ({ interpreter, args: [target] }) => interpreter.decorate(target, node);
    return node;
  }
  alias(name: string, value: Node | undefined) {}

  peel(node: Node): Node | undefined {
    let current: Node | undefined = node;
    for (let depth = 0; current && depth < 64; depth++) {
      if (current.ref) { current = this.bound(current); continue; }
      if (current.lazy && !this.inner(current.lazy.span, current.lazy.frame)) {
        const next = this.reference_of(current);
        if (!next.ref) return current;
        current = next;
        continue;
      }
      return current;
    }
    return current;
  }

  // A literal made by the runtime: a node whose text is the given string.
  literal_of(text: string, at: Text.Node): Node {
    const node = new Node(this.diagnostics, Text.Node.string(text));
    node.literal = true;
    return node;
  }
  // Where a value is written: the file it is in and where in it. Two things
  // written in one place are one thing; a thing written nowhere has no
  // location.
  inline(node: Node, frame: Node, opts: { compose?: boolean } = {}): Node | undefined {
    if (this.depth > Interpreter.DEPTH) throw new Recursion(node, node.position ?? this.statements[0]!);
    this.depth++;
    try { return this.inlined(node, frame, opts); }
    finally { this.depth--; }
  }
  private unforced(node: Node): Node | undefined {
    if (!node.ref) return undefined;
    const bound = this.bound(node);
    return bound?.lazy && !bound.lazy.raw ? bound : undefined;
  }
  private inlined(node: Node, frame: Node, opts: { compose?: boolean } = {}): Node | undefined {
    // Looking for a label means running past the statements in between; they
    // are only being read, so nothing they say should take effect.
    if (this.seeking !== undefined) return undefined;
    // A name is followed to what it holds; any other text is run as it is.
    const text = node.lazy !== undefined && !node.lazy.raw && node.value === undefined && !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(node.lazy.span.string.trim());
    const named = !text && node.lazy !== undefined && !node.lazy.raw && node.value === undefined ? this.reference(node.lazy.frame, node.lazy.span.string.trim(), node.lazy.span) : node;
    const target = text ? node : this.unforced(named) ?? this.safely(() => this.peel(node));
    if (target?.lazy?.span.empty()) return undefined;
    if (target?.lazy?.raw && opts.compose) return this.deref(target, false) ?? target;
    if (!target) { this.error(`Unresolved \`${this.text(node)}\`.`, node.position); return undefined; }
    if (target.lazy) {
      target.lazy.consumed = true;
      this.sees(frame, target.lazy.frame, true);
      const inner = this.inner(target.lazy.span, target.lazy.frame);
      const last = this.safely(() => this.array(this.cursor_of(inner ?? target.lazy!.span), frame, true));
      // Text that reads as a block is that block, inlined in turn.
      const held = last !== undefined ? this.resolved(last) ?? last : undefined;
      if (held?.written && !opts.compose) return this.run_block(held.body!, held.closure, frame);
      if (opts.compose && held !== undefined && held !== target && held.lazy === undefined && (held.methods || held.members || held instanceof Count) && !held.body) this.reads_from(frame, held, true);
      return last;
    }
    if (target.theme) { this.theme = target; return target; }
    if (target.none) { frame.none = true; return target; }
    // Composing reads from a value; only inlining runs a definition's body.
    if (target.body && !opts.compose) return this.run_block(target.body, target.closure, frame);
    if ((target.methods || target.members || target instanceof Count) && !target.body) this.reads_from(frame, target, opts.compose === true);
    return target;
  }
  // What the code running here was applied to: the receiver of the nearest application it runs in.
  receiver_of(frame: Node): Node | undefined {
    for (const scope of frame.reading(new Set())) if (scope.applied_to !== undefined) return scope.applied_to;
  }
  run_block(body: Text.Node, written: Node | undefined, frame: Node): Node | undefined {
    if (written !== undefined) this.sees(frame, written, true);
    return this.safely(() => this.array(this.cursor_of(body), frame));
  }
  // Text run here reads the names of where it was written, without this
  // frame being made of that one.
  sees(frame: Node, from: Node, first: boolean = false) {
    if (frame === from || frame === this.NONE || from === this.NONE) return;
    const sees = (frame.sees ??= []);
    if (sees.includes(from)) return;
    if (first) sees.unshift(from); else sees.push(from);
  }
  reads_from(frame: Node, from: Node, composing = false) {
    // Nothing is made of nothing, and reads from nothing.
    if (frame === from || frame === this.NONE || from === this.NONE) return;
    for (const scope of from.composed(new Set())) if (scope === frame) return;
    const held = composing ? (frame.made_of ??= []) : (frame.inlined ??= []);
    if (!held.includes(from)) { held.push(from); this.composing++; }
  }
  inner(span: Text.Node, frame: Node): Text.Node | undefined {
    const probe = this.cursor_of(span);
    for (const [rule] of this.brackets(frame)) {
      const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
      if (match && match.end === probe.limit) return [...match.captures.values()][0];
    }
  }
  // The statements a span is written as: what a newline separates, outside
  // any group. This is the order they are written in, not the order they
  // run in — a goto says that, and it is read off these.
  // A program is a span of text and the frame it was written in. What it is
  // written *as* is not built here: the first statement and what is left of
  // it are handed over, and the chain that holds them is the language's own.
  written(node: Node): Node | undefined {
    let target: Node | undefined = node;
    for (let depth = 0; target !== undefined && depth < 64; depth++) {
      if (target.ref) { target = this.bound(target); continue; }
      const lazy = target.lazy;
      if (lazy === undefined || this.inner(lazy.span, lazy.frame) !== undefined) break;
      const named = lazy.span.string.trim();
      if (this.name(this.cursor_of(lazy.span), lazy.frame) !== named || !(lazy.frame.given?.has(named) ?? false)) break;
      const next = this.reference_of(target);
      if (next === target) break;
      target = next;
    }
    return target;
  }

  pending_rewrites: [Node, Node][] = [];
}

export type Mark<T> = { mark: T; by?: string; epoch: number; except?: [Node, string][] };
export type Marks = {
  names: Map<Node, Map<string, Mark<Node>>>;
  values: WeakMap<Node, Map<string, Mark<Node>>>;
  given: Map<Node, Map<string, Mark<() => Node | undefined>>>;
  stands: Map<Node, Map<string, Mark<() => Node | undefined>>>;
  instances: WeakMap<Node, Map<string, Map<Node, Mark<Node>>>>;
};


export class Jump {
  site?: Text.Node
  constructor(public label: string, public value?: Node, public kind?: 'end' | 'begin') {}
}

export class Recursion {
  constructor(public rule: Node, public at: Text.Node, public cycle?: string) {}
}

export const describe = (piece: Piece): string => {
  switch (piece.kind) {
    case 'literal': return piece.text;
    case 'space': return '{ }';
    case 'newline': return '{\\n}';
    case 'capture': return `{${piece.raw ? 'literal ' : ''}${piece.declared !== undefined ? piece.declaration : piece.name}}`;
    case 'operator': return `[${piece.name}${piece.filter ? `: ${piece.filter}` : ''}]`;
  }
};
