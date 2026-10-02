import { Text } from './text.ts';
import { bytes_of, statements_of } from './natives.ts';
import { Served } from './lsp.ts';
import { Interpreter, Node, Count, type Piece, type Native, type Method, type Found, type Match } from './interpreter.ts';

export type Operation = { method: string; receiver?: Piece & { kind: 'capture' }; operand?: Piece & { kind: 'capture' }; given?: number; impl: Node; scope: Node; native?: Node };

// The interpreter's own level: rules about operations on values of a type,
// `{a: T} op {b: T} => …`, answered by its primitives or by what the body
// rewrites them to. The level is read from its own file, as soon as the
// language has a `Compiler.default` to add to.
export class Levelled extends Served {
  optimizations?: { level: Node; scope: Node; entries: Map<string, Operation[]> };
  protected bypassed = new Set<Node>();
  reading_of(text: string): Node | undefined {
    return this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(Text.Node.string(text)), this.GLOBAL), false)));
  }
  protected levelled?: number;
  settle_level() {
    this.diagnostics.muted(() => this.safely(() => {
      const ours = this.levelled === this.passing;
      if ((ours || !(this.touched.get(this.GLOBAL)?.has('O') ?? false)) && this.deref(this.array(this.cursor_of(Text.Node.string('Compiler.default')), this.GLOBAL), false) !== undefined) {
        this.array(this.cursor_of(Text.Node.string('O := Compiler.default')), this.GLOBAL);
        this.levelled = this.passing;
      }
      const level = this.deref(this.reference(this.GLOBAL, 'O', this.blank), false);
      if (level !== undefined && level !== this.optimizations?.level) this.optimize(level, this.GLOBAL);
    }));
  }
  // A level is rules about operations: `{a: T} op {b: T} => …` stands for
  // applying `op` to values of `T`, answered by the interpreter's own
  // primitive or by what the body rewrites it to.
  optimize(level: Node | undefined, frame: Node): Node | undefined {
    const block = this.deref(level);
    if (block === undefined) return undefined;
    const scope = this.frame(frame, 'optimizations', block.closure ?? frame);
    if (block.body !== undefined) this.diagnostics.muted(() => this.safely(() => this.array(this.cursor_of(this.inner(block.body!, scope) ?? block.body!), scope)));
    else this.inline(block, scope);
    const entries = new Map<string, Operation[]>();
    for (const rule of scope.rules) {
      const impl = scope.methods!.get(rule)!, pieces = rule.pattern!;
      if (impl.body !== undefined && pieces[0]?.kind === 'literal' && pieces.length > 1 && pieces.slice(1).every(piece => piece.kind === 'capture' && piece.type === undefined)) {
        const head = this.name(this.cursor_of(impl.body), scope);
        const native = head !== undefined && scope.lookup(head) === this.EXTERNAL ? this.deref(this.array(this.cursor_of(impl.body), scope), false) : undefined;
        if (native?.fn === undefined) continue;
        const method = pieces[0].text.trim();
        let same = entries.get(method);
        if (same === undefined) entries.set(method, same = []);
        same.push({ method, given: pieces.length - 1, impl, scope, native });
        continue;
      }
      if (impl.body === undefined || pieces[0]?.kind !== 'capture' || pieces[0].type === undefined || pieces[1]?.kind !== 'literal') continue;
      const operand = pieces[2]?.kind === 'capture' && pieces[2].type !== undefined ? pieces[2] : undefined;
      if (pieces.length !== (operand === undefined ? 2 : 3)) continue;
      const spelled = pieces[1].text.trim(), method = spelled.length > 1 && !Interpreter.word.test(spelled[0]) && Interpreter.word.test(spelled[1]) ? spelled.slice(1) : spelled;
      const head = this.name(this.cursor_of(impl.body), scope);
      const native = head !== undefined && scope.lookup(head) === this.EXTERNAL ? this.deref(this.array(this.cursor_of(impl.body), scope), false) : undefined;
      const entry: Operation = { method, receiver: pieces[0], operand, impl, scope, native: native?.fn !== undefined ? native : undefined };
      let same = entries.get(method);
      if (same === undefined) entries.set(method, same = []);
      same.push(entry);
    }
    this.optimizations = { level: block, scope, entries };
    return block;
  }
  protected typed_as = new WeakMap<Node, Map<string, { version: number; template?: Node }>>();
  template_for(type: string, declaration: string, scope: Node): Node | null | undefined {
    let held = this.typed_as.get(scope);
    if (held === undefined) this.typed_as.set(scope, held = new Map());
    const known = held.get(type);
    if (known !== undefined && known.version === this.version) return known.template;
    const resolved = Interpreter.word.test(type[0]) && !type.includes('.') && scope.lookup(type) === undefined ? undefined : this.declared(declaration, scope);
    if (resolved !== undefined && this.building.has(resolved)) return null;
    const template = resolved === undefined || resolved.none ? undefined : this.template_of(resolved, scope);
    held.set(type, { version: this.version, template });
    return template;
  }
  protected building = new Set<Node>();
  operation(rule: Node, impl: Node, receiver: Node | undefined, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node, found: Found): Node | undefined {
    const pieces = rule.pattern!;
    if (pieces.length !== 1 || pieces[0].kind !== 'literal' || this.bypassed.has(impl)) return undefined;
    const entries = this.optimizations!.entries.get(pieces[0].text.trim());
    if (entries === undefined) return undefined;
    for (const entry of entries) {
      if (entry.given !== undefined) {
        if (impl.closure !== this.GLOBAL || (impl.params?.length ?? 0) !== entry.given || args.length !== entry.given) continue;
        this.applying.push({ rule, impl, receiver, local: frame });
        let answered: Node | undefined;
        try { answered = entry.native!.fn!({ interpreter: this, frame, method: impl, args, at }); }
        finally { this.applying.pop(); }
        if (answered !== undefined) { this.ran.add(rule.key!); return answered; }
        continue;
      }
      if (receiver === undefined) continue;
      if ((entry.operand === undefined) !== ((impl.params?.length ?? 0) === 0) || (entry.operand !== undefined && impl.params!.length !== 1)) continue;
      const template = this.template_for(entry.receiver!.type!, entry.receiver!.declaration!, entry.scope);
      if (template === undefined || (template !== null && !this.carries(template, impl, { own: true })) || (template === null && entry.native === undefined)) continue;
      const argument = args[0] ?? this.NONE;
      if (entry.operand !== undefined) {
        const value = this.deref(argument, false);
        if (value === undefined || !(value instanceof Count ? this.carries(value.template, impl) : this.carries(value, impl))) continue;
      }
      this.applying.push({ rule, impl, receiver, local: frame });
      let answered: Node | undefined;
      try {
        if (entry.native !== undefined) {
          const written = () => { this.bypassed.add(impl); try { return this.apply(found, cursor, frame, at); } finally { this.bypassed.delete(impl); } };
          answered = entry.native.fn!({ interpreter: this, frame, self: receiver, method: impl, args: entry.operand === undefined ? [] : [argument], at, written, given: template === null ? new Map() : new Map([['template', template]]) });
        } else {
          const local = this.frame(frame, 'operation', entry.scope.parent ?? this.GLOBAL);
          local.given = new Set([entry.receiver!.name, ...(entry.operand === undefined ? [] : [entry.operand.name])]);
          this.bind(local, entry.receiver!.name, receiver!);
          if (entry.operand !== undefined) this.bind(local, entry.operand.name, argument);
          answered = this.unalias(this.array(this.cursor_of(entry.impl.body!), local, false, true), local);
        }
      }
      finally { this.applying.pop(); }
      if (answered !== undefined) { this.ran.add(rule.key!); return answered; }
    }
    return undefined;
  }
  protected templates = new WeakMap<Node, Node | null>();
  template_of(type: Node, closure: Node): Node | undefined {
    let held = this.templates.get(type);
    if (held === undefined) {
      this.building.add(type);
      try { held = this.construct(type, [], closure) ?? null; }
      finally { this.building.delete(type); }
      this.templates.set(type, held);
    }
    return held ?? undefined;
  }
  protected carried = new WeakMap<Node, Set<string>>();
  protected owned = new WeakMap<Node, Set<string>>();
  carries(template: Node, method: Node, opts: { own?: boolean } = {}): boolean {
    const at = (body: Text.Node) => `${body.source.location}:${body.begin}:${body.end}`;
    const store = opts.own ? this.owned : this.carried;
    let bodies = store.get(template);
    if (bodies === undefined) {
      store.set(template, bodies = new Set());
      for (const from of opts.own ? [template] : template.composed(new Set())) for (const impl of from.methods?.values() ?? []) if (impl.body !== undefined) bodies.add(at(impl.body));
    }
    return method.body !== undefined && bodies.has(at(method.body));
  }
  protected numerals = new WeakMap<Node, bigint | null>();
  numeral(value: Node): bigint | undefined {
    const known = this.numerals.get(value);
    if (known !== undefined) return known ?? undefined;
    let answer: bigint | null = null;
    const integer = value.members?.get('integer') ?? value.own('integer');
    const chain = integer && this.diagnostics.muted(() => this.safely(() => this.deref(integer, false)));
    const head = chain && !chain.none ? chain.members?.get('head') ?? chain.own('head') : undefined;
    if (head !== undefined) {
      const selections = this.links(chain!);
      const position = (link: Node): bigint | undefined => {
        let n = 0n;
        for (let at: Node | undefined = link, walked = 0; walked < 4096; walked++) {
          const before = at.members?.get('previous') ?? at.own('previous');
          const held = before && this.deref(before, false);
          if (held === undefined || held.none) return n;
          n++; at = held;
        }
        return undefined;
      };
      const radix = (link: Node): bigint | undefined => {
        let n = 1n;
        for (let at: Node | undefined = link, walked = 0; walked < 4096; walked++) {
          const after = at.members?.get('next') ?? at.own('next');
          const held = after && this.deref(after, false);
          if (held === undefined || held.none) break;
          n++; at = held;
        }
        const back = position(link);
        return back === undefined ? undefined : n + back;
      };
      if (selections !== undefined && selections.length > 0) {
        const base = radix(selections[0]);
        let total = 0n;
        for (const selection of selections) {
          const digit = position(selection);
          if (digit === undefined || base === undefined) { total = -1n; break; }
          total = total * base + digit;
        }
        if (total >= 0n) answer = total;
      }
    }
    this.numerals.set(value, answer);
    return answer ?? undefined;
  }
  counted(value: Node | undefined, like: Count, method: Node): bigint | undefined {
    let n = 0n;
    for (let at = value && this.deref(value, false), walked = 0; at !== undefined && walked < 1 << 20; walked++) {
      if (!(at instanceof Count)) { const held = this.numeral(at); if (held !== undefined) return n + held; }
      if (at instanceof Count) {
        if (at.field !== like.field || !this.carries(at.template, method)) return undefined;
        n += at.count; at = at.base; continue;
      }
      if (!this.carries(at, method)) return undefined;
      const next = at.member(like.field);
      if (next === undefined) return n;
      const held = this.deref(next, false);
      if (held === undefined || held.none) return n;
      n++; at = held;
    }
    return undefined;
  }
  protected operands(self: Node | undefined, other: Node, method: Node): { like: Count; a: bigint; b: bigint; mine: Node; theirs: Node } | undefined {
    const mine = self && this.deref(self, false), theirs = this.deref(other, false);
    if (mine === undefined || theirs === undefined) return undefined;
    const like = mine instanceof Count ? mine : theirs instanceof Count ? theirs : this.unit();
    if (like === undefined || !this.carries(like.template, method)) return undefined;
    const a = this.counted(mine, like, method), b = this.counted(theirs, like, method);
    return a === undefined || b === undefined ? undefined : { like, a, b, mine, theirs };
  }
  counted_as(like: Count, n: bigint): Node {
    return n === 0n ? like.base : new Count(this.diagnostics, n, like.base, like.template, like.field);
  }
  // What `succ` makes of a value, held as a count: the first time it is
  // applied as written, and the field its answer links back through is what
  // counts from then on.
  count_succ(self: Node | undefined, method: Node, template: Node | undefined, written: () => Node | undefined): Node | undefined {
    const receiver = self && this.deref(self, false);
    if (receiver === undefined) return undefined;
    if (receiver instanceof Count && this.carries(receiver.template, method)) return receiver.succ();
    const answer = written(), made = answer && this.deref(answer, false);
    if (made === undefined || made instanceof Count || !this.carries(made, method)) return answer ?? this.NONE;
    const keys = [...(made.members?.keys() ?? []), ...[...(made.methods?.keys() ?? [])].filter((key): key is string => typeof key === 'string')];
    for (const key of keys) {
      const held = made.member(key), value = held && this.diagnostics.muted(() => this.safely(() => this.deref(held, false)));
      if (value === receiver) {
        return new Count(this.diagnostics, 1n, receiver, template ?? made, key);
      }
    }
    return answer ?? this.NONE;
  }
  count_binary(self: Node | undefined, other: Node | undefined, method: Node, op: (a: bigint, b: bigint) => bigint | undefined): Node | undefined {
    if (other === undefined) return undefined;
    const held = this.operands(self, other, method);
    if (held === undefined) return undefined;
    const n = op(held.a, held.b);
    return n === undefined ? held.mine : this.counted_as(held.like, n);
  }
  count_compare(self: Node | undefined, other: Node | undefined, method: Node, op: (a: bigint, b: bigint) => boolean): Node | undefined {
    if (other === undefined) return undefined;
    const held = this.operands(self, other, method);
    return held === undefined ? undefined : this.truth(op(held.a, held.b));
  }
  operator(fn: Method): Node { const node = new Node(this.diagnostics); node.fn = fn; node.arity = 1; return node; }
  protected field(of: Node, key: string): Node | undefined {
    return this.diagnostics.muted(() => this.safely(() => this.deref(of.own(key) ?? of.members?.get(key) ?? this.get(of, this.literal_of(key, this.blank)), false)));
  }
  protected links(chain: Node | undefined): Node[] | undefined {
    if (chain === undefined || chain.none) return undefined;
    const out: Node[] = [];
    for (let link = this.field(chain, 'head'); link !== undefined && !link.none; link = this.field(link, 'next')) {
      const value = this.field(link, 'value');
      if (value === undefined) return undefined;
      out.push(value);
    }
    return out;
  }
  protected bit(value: Node): number | undefined {
    if (value instanceof Count) return value.count > 0n ? 1 : 0;
    if (value.none) return 0;
    const next = this.field(value, 'next');
    return next === undefined || next.none ? 0 : 1;
  }
  octets(character: Node | undefined): number[] | undefined {
    const value = character && this.deref(character, false);
    const bits = value && this.links(this.field(value, 'octets'));
    if (bits === undefined || bits.length === 0 || bits.length % 8 !== 0) return undefined;
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = i; j < i + 8; j++) { const b = this.bit(bits[j]); if (b === undefined) return undefined; byte = byte * 2 + b; }
      bytes.push(byte);
    }
    return bytes;
  }
  characters(string: Node | undefined, method: Node): number[][] | undefined {
    const value = string && this.deref(string, false);
    if (value === undefined || !this.carries(value, method)) return undefined;
    const held = this.links(value);
    if (held === undefined) return undefined;
    const out: number[][] = [];
    for (const character of held) { const bytes = this.octets(character); if (bytes === undefined) return undefined; out.push(bytes); }
    return out;
  }
  chained(values: Node[]): Node | undefined {
    const frame = this.frame(this.GLOBAL, 'chain_of', this.GLOBAL);
    const held = this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(Text.Node.string('chain None')), frame), false)));
    if (held === undefined) return undefined;
    this.bind(frame, 'held', held);
    const append = Text.Node.string('held &= next');
    for (const value of values) { this.bind(frame, 'next', value); this.diagnostics.muted(() => this.safely(() => this.array(this.cursor_of(append), frame))); }
    return held;
  }
  holds_bit(value: Node): boolean | undefined {
    if (value instanceof Count) return value.count > 0n;
    if (value.none) return false;
    const holds = this.field(value, 'holds');
    if (holds !== undefined) return !holds.none;
    const next = this.field(value, 'next');
    return next !== undefined && !next.none;
  }
  bytes_of_bits(chain: Node): Uint8Array | undefined {
    const bits = this.links(chain);
    if (bits === undefined) return undefined;
    if (bits.length % 8 !== 0) {
      const pieces = bits.map(piece => bytes_of(this, piece));
      const joined = new Uint8Array(pieces.reduce((n, piece) => n + piece.length, 0));
      let at = 0;
      for (const piece of pieces) { joined.set(piece, at); at += piece.length; }
      return joined;
    }
    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bits.length; i++) { const bit = this.holds_bit(bits[i]); if (bit === undefined) return undefined; if (bit) bytes[i >> 3] |= 1 << (7 - (i & 7)); }
    return bytes;
  }
  code_points(source: Node | undefined): Node | undefined {
    const held = source && this.deref(source, false);
    if (held === undefined || held.none) return undefined;
    const chained = held.own('head') !== undefined || held.members?.get('head') !== undefined;
    const bytes = chained ? this.bytes_of_bits(held) : bytes_of(this, held);
    if (bytes === undefined) return undefined;
    const points: Node[] = [];
    for (const character of new TextDecoder().decode(bytes)) {
      const point = this.number(character.codePointAt(0)!);
      if (point === undefined) return undefined;
      points.push(point);
    }
    return this.chained(points);
  }
  evaluated(text: string, bindings: Record<string, Node>): Node | undefined {
    const frame = this.frame(this.GLOBAL, 'evaluated', this.GLOBAL);
    for (const [name, value] of Object.entries(bindings)) this.bind(frame, name, value);
    return this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(Text.Node.string(text)), frame), false)));
  }
  protected own_field(of: Node, key: string): Node | undefined {
    const held = of.member(key);
    return held === undefined ? undefined : this.diagnostics.muted(() => this.safely(() => this.deref(held, false)));
  }
  protected classes_reached(node: Node, seen: Set<Node> = new Set()): Node[] {
    if (seen.has(node)) return [];
    seen.add(node);
    const reached = [node];
    const components = this.own_field(node, 'components');
    const hierarchy = components === undefined || components.none ? undefined : this.own_field(components, 'hierarchy');
    for (const parent of this.links(hierarchy) ?? []) if (!parent.none) reached.push(...this.classes_reached(parent, seen));
    return reached;
  }
  protected statements_read = new WeakMap<Text.Node, string[]>();
  protected statements_written(node: Node): string[] {
    const written = this.evaluated('held.written_as', { held: node });
    const span = written === undefined || written.none ? undefined : written.body;
    if (span === undefined) return [];
    let known = this.statements_read.get(span);
    if (known === undefined) this.statements_read.set(span, known = statements_of(this, span).map(statement => statement.string));
    return known;
  }
  protected placements = new Map<string, { pass: number; answer: Node }>();
  declared_in(holder: Node | undefined, spelled: Node | undefined): Node | undefined {
    const held = holder && this.deref(holder, false), named = spelled && this.deref(spelled, false);
    if (held === undefined || named === undefined) return undefined;
    if (held.none || named.none) return this.NONE;
    const chained = named.own('head') !== undefined || named.members?.get('head') !== undefined;
    const bytes = chained ? this.bytes_of_bits(named) : bytes_of(this, named);
    if (bytes === undefined) return undefined;
    const text = new TextDecoder().decode(bytes);
    const written = this.evaluated('held.written_as', { held });
    const key = written?.body === undefined ? undefined : `${written.body.source.location}:${written.body.begin}:${written.body.end}\u0000${text}`;
    const kept = key === undefined ? undefined : this.placements.get(key);
    if (kept !== undefined && kept.pass === this.passing) return kept.answer;
    const visit: Node[] = [held];
    const modifiers = (this.links(this.evaluated('Modifier.spellings', {})) ?? []).flatMap(link => { const written = this.deref(link, false); const bytes = written === undefined ? undefined : bytes_of(this, written); return bytes === undefined ? [] : [`${new TextDecoder().decode(bytes)} `]; });
    const declares = (statement: string) => [text, ...modifiers.map(modifier => `${modifier}${text}`)].some(head => statement.startsWith(`${head} `) && statement.length > head.length + 1);
    let answer: Node = this.NONE;
    for (let k = 0; k < visit.length && k < 4096; k++) {
      const at = this.statements_written(visit[k]).findIndex(declares);
      if (at >= 0) {
        const nth = this.number(k), written_at = this.number(at);
        if (nth === undefined || written_at === undefined) return undefined;
        answer = this.evaluated('Placement(nth_class: nth, written_at: written_at)', { nth, written_at }) ?? this.NONE;
        break;
      }
      visit.push(...(this.links(this.evaluated('held.components.hierarchy', { held: visit[k] })) ?? []).filter(node => !node.none));
    }
    if (key !== undefined && answer !== this.NONE) this.placements.set(key, { pass: this.passing, answer });
    return answer;
  }
  structurally(value: Node | undefined, type: Node | undefined): Node | undefined {
    const held = value && this.deref(value, false), wanted = type && this.deref(type, false);
    if (held === undefined || wanted === undefined || held.none || wanted.none) return undefined;
    const required: string[] = [];
    for (const kind of this.classes_reached(wanted)) for (const statement of this.statements_written(kind)) {
      const end = statement.search(/[ (:?]/);
      if (end < 0) continue;
      const head = statement.slice(0, end);
      if (statement[end] === ':' || statement.startsWith(`${head} => TODO`)) required.push(head);
    }
    const declaring = this.classes_reached(held).map(kind => this.statements_written(kind));
    for (const head of required) if (!declaring.some(statements => statements.some(statement => statement.startsWith(`${head} `) || statement.startsWith(`${head}(`)))) return this.NONE;
    return this.GLOBAL;
  }
  protected readings_held = new Map<string, { version: number; node?: Node }>();
  read_once(text: string): Node | undefined {
    const held = this.readings_held.get(text);
    if (held !== undefined && held.version === this.version) return held.node;
    const node = this.reading_of(text);
    this.readings_held.set(text, { version: this.version, node });
    return node;
  }
  truth(held: boolean): Node | undefined { return this.read_once(held ? 'true' : 'false'); }
  unit(): Count | undefined {
    const one = this.number(1);
    return one instanceof Count ? one : undefined;
  }
  count_unary(self: Node | undefined, method: Node, answer: (n: bigint, like: Count) => Node | undefined): Node | undefined {
    const value = self && this.deref(self, false), like = value instanceof Count ? value : this.unit();
    if (value === undefined || like === undefined) return undefined;
    const n = this.counted(value, like, method);
    return n === undefined ? undefined : answer(n, like);
  }
  number(n: number): Node | undefined {
    const zero = this.read_once('zero');
    if (zero === undefined || zero.none) return undefined;
    return n === 0 ? zero : new Count(this.diagnostics, BigInt(n), zero, zero, 'next');
  }


  override *read_pass(srcs: Text.Source[]): Generator<void> {
    const interpreted = srcs.filter(src => this.program?.by_interpreter(src) ?? false);
    if (!this.began && this.optimizations === undefined) this.settle_level();
    let early = interpreted.length === 0;
    const level = early ? undefined : this.reading_of('Compiler.default');
    for (const [k, src] of srcs.entries()) {
      if (early && interpreted.includes(src)) continue;
      this._interpret(src);
      if (!early && !interpreted.includes(src) && (this.reading_of('Compiler.default') ?? level) !== level) { early = true; for (const own of interpreted) this._interpret(own); this.settle_level(); }
      if (src.is_dot_project || k === srcs.length - 1) this.settle_level();
      yield;
    }
  }
  override native(key: string, at: Text.Node): Native | undefined {
    return super.native(key, at) ?? (this.program?.by_interpreter(at.source) ? interpreted(key) : undefined);
  }
  override shortcut(found: Found, captures: Map<string, Node>, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node): { value: Node | undefined } | undefined {
    const { rule, impl, match } = found;
    if (this.optimizations === undefined || impl.fn !== undefined || impl.body === undefined || this.seeking !== undefined) return undefined;
    const answered = this.operation(rule, impl, match.receiver, impl.params !== undefined && impl.params.length > 1 && args.length === 1 ? this.positions(args[0], impl.params.length) : args, cursor, frame, at, found);
    return answered === undefined ? undefined : { value: answered };
  }
}

type Module = { [name: string]: Native | Module };
const binary = (op: (a: bigint, b: bigint) => bigint | undefined): Native => ({ arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, args: [b], method }) => interpreter.count_binary(self, b, method, op)) });
const unary = (answer: (n: bigint, like: Count, level: Levelled) => Node | undefined): Native => ({ arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, method }) => (interpreter as Levelled).count_unary(self, method, (n, like) => answer(n, like, interpreter as Levelled))) });
const compare = (op: (a: bigint, b: bigint) => boolean): Native => ({ arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, args: [b], method }) => (interpreter as Levelled).count_compare(self, b, method, op)) });
// What the interpreter answers for an operation its level names, by where it
// is: `js.number.+` is the host's addition on numbers held as counts.
export const Interpreted: Module = {
  js: {
    number: {
      succ: { arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, method, written, given }) => interpreter.count_succ(self, method, given!.get('template'), written!)) },
      '+': binary((x, y) => x + y),
      '-': binary((x, y) => x > y ? x - y : 0n),
      '*': binary((x, y) => x * y),
      '/': binary((x, y) => y === 0n ? 0n : x / y),
      '%': binary((x, y) => y === 0n ? undefined : x % y),
      pred: unary((n, like, level) => n === 0n ? level.NONE : level.counted_as(like, n - 1n)),
      is_zero: unary((n, like, level) => level.truth(n === 0n)),
      nonzero: unary((n, like, level) => level.truth(n !== 0n)),
      '<': compare((x, y) => x < y),
      '==': compare((x, y) => x === y),
    },
  },
};
const tail = (bytes: number[], from: number) => { let n = 0; for (let i = from; i < bytes.length * 8; i++) n = n * 2 + ((bytes[i >> 3] >> (7 - (i & 7))) & 1); return n; };
const at = (bytes: number[], i: number) => i < bytes.length * 8 && ((bytes[i >> 3] >> (7 - (i & 7))) & 1) === 1;
const width = (bytes: number[]) => !at(bytes, 0) ? 1 : !at(bytes, 2) ? 2 : !at(bytes, 3) ? 3 : 4;
const codepoint = (bytes: number[]) => { const w = width(bytes); let n = 0, skip = w === 1 ? 1 : w + 1; for (let i = 0; i < bytes.length * 8; i++) { const p = i & 7; if (p === 0 && i > 0) skip = 2; if (p >= skip) n = n * 2 + (at(bytes, i) ? 1 : 0); } return n; };
const ascii = (b: number[]) => !at(b, 0);
const lower = (b: number[]) => ascii(b) && at(b, 1) && at(b, 2) && tail(b, 3) > 0 && tail(b, 3) < 27;
const upper = (b: number[]) => ascii(b) && at(b, 1) && !at(b, 2) && tail(b, 3) > 0 && tail(b, 3) < 27;
const digit = (b: number[]) => ascii(b) && !at(b, 1) && at(b, 2) && at(b, 3) && tail(b, 4) < 10;
const underscore = (b: number[]) => { if (!ascii(b) || !at(b, 1) || at(b, 2)) return false; for (let i = 3; i < b.length * 8; i++) if (!at(b, i)) return false; return true; };
const blank = (b: number[]) => ascii(b) && !at(b, 1) && ((at(b, 2) && !at(b, 3) && tail(b, 4) === 0) || (!at(b, 2) && !at(b, 3) && tail(b, 4) > 8 && tail(b, 4) < 14));
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const index_of = (mine: number[][], theirs: number[][]) => { for (let i = 0; i < mine.length; i++) { let j = 0; while (j < theirs.length && i + j < mine.length && same(mine[i + j], theirs[j])) j++; if (j === theirs.length) return i; } return -1; };
type Answer = (interpreter: Levelled, mine: number[], theirs?: number[]) => Node | undefined;
const character = (answer: Answer): Native => ({ arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, args: [other] }) => {
  const level = interpreter as Levelled, mine = level.octets(self);
  if (mine === undefined) return undefined;
  if (other === undefined) return answer(level, mine);
  const theirs = level.octets(other);
  return theirs === undefined ? undefined : answer(level, mine, theirs);
}) });
const predicate = (holds: (b: number[]) => boolean) => character((level, b) => level.truth(holds(b)));
type Answers = (interpreter: Levelled, mine: number[][], theirs?: number[][]) => Node | undefined;
const string = (answer: Answers): Native => ({ arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, self, args: [other], method }) => {
  const level = interpreter as Levelled, mine = level.characters(self, method);
  if (mine === undefined) return undefined;
  if (other === undefined) return answer(level, mine);
  const theirs = level.characters(other, method);
  return theirs === undefined ? undefined : answer(level, mine, theirs);
}) });
Interpreted.js = {
  ...(Interpreted.js as Module),
  character: {
    '==': character((level, a, b) => level.truth(same(a, b!))),
    width: character((level, b) => level.number(width(b))),
    codepoint: character((level, b) => level.number(codepoint(b))),
    is_ascii: predicate(ascii),
    lower_case: predicate(lower),
    upper_case: predicate(upper),
    letter: predicate(b => lower(b) || upper(b)),
    digit: predicate(digit),
    blank: predicate(blank),
    is_underscore: predicate(underscore),
    word: predicate(b => lower(b) || upper(b) || digit(b) || underscore(b)),
    digit_value: character((level, b) => digit(b) ? level.number(tail(b, 4)) : lower(b) || upper(b) ? level.number(tail(b, 3) + 9) : level.NONE),
  },
  type: {
    declared_in: { arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, args: [holder, spelled] }) => (interpreter as Levelled).declared_in(holder, spelled)) },
    structurally: { arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, args: [value, type] }) => (interpreter as Levelled).structurally(value, type)) },
  },
  text: {
    code_points: { arity: 0, fn: ({ interpreter }) => interpreter.operator(({ interpreter, args: [source] }) => (interpreter as Levelled).code_points(source)) },
  },
  string: {
    '==': string((level, a, b) => level.truth(a.length === b!.length && a.every((x, i) => same(x, b![i])))),
    count: string((level, a) => level.number(a.length)),
    length: string((level, a) => level.number(a.length)),
    empty: string((level, a) => level.truth(a.length === 0)),
    nonempty: string((level, a) => level.truth(a.length > 0)),
    is_numeric: string((level, a) => level.truth(a.length > 0 && a.every(digit))),
    starts_with: string((level, a, b) => level.truth(b!.length <= a.length && b!.every((x, i) => same(x, a[i])))),
    ends_with: string((level, a, b) => level.truth(b!.length <= a.length && b!.every((x, i) => same(x, a[a.length - b!.length + i])))),
    contains: string((level, a, b) => level.truth(b!.length === 0 || index_of(a, b!) >= 0)),
    index_of: string((level, a, b) => { const i = a.length === 0 ? -1 : index_of(a, b!); return i < 0 ? level.NONE : level.number(i); }),
  },
};
export function interpreted(key: string): Native | undefined {
  let at: Native | Module | undefined = Interpreted;
  for (const part of key.split('.')) { if (at === undefined || 'fn' in at) return undefined; at = (at as Module)[part]; }
  return at !== undefined && 'fn' in at ? { ...at as Native, operation: true } : undefined;
}
