import { Text } from './text.ts';
import { Interpreter, Node, type Rule, type Match, type Native, type Piece } from './interpreter.ts';

type Capture = Piece & { kind: 'capture' };
type Entry = { method: string; receiver: Capture; operand?: Capture; rule: Rule; native?: string };
type Operand = { self: Node; other?: Node; rule: Rule; written: () => Node | undefined };
type Operation = (level: Levelled, operand: Operand) => Node | undefined;

// A number the interpreter holds as a count: `count` links of `field` above `base`, made like `template`.
export class Count extends Node {
  private before?: Node;
  constructor(public count: bigint, public base: Node, public template: Node, public field: string) {
    super(template.at);
    this.with = [template];
  }
  succ(): Count { return new Count(this.count + 1n, this.base, this.template, this.field); }
  own(name: string): Node | undefined {
    if (name === this.field) return this.before ??= this.count > 1n ? new Count(this.count - 1n, this.base, this.template, this.field) : this.base;
    return super.own(name);
  }
}

// The interpreter's own level: rules about operations on values of a type, `{a: T} op {b: T} => external js.…`,
// read from the interpreter's file once the language has a `Compiler.default` for it to add to.
export class Levelled extends Interpreter {
  level?: { source: Node; entries: Map<string, Entry[]> };
  private markers = new Map<Node, string>();
  private bypassing = new Set<Rule>();
  private levelled = false;

  native(key: string, at?: Text.Node): Native | undefined {
    const own = super.native(key, at);
    if (own !== undefined || at === undefined || !this.program?.by_interpreter(at.source) || !(key in Operations || key.startsWith('js.'))) return own;
    return { arity: 0, fn: () => { const marker = new Node(at); this.markers.set(marker, key); return marker; } };
  }
  reads(src: Text.Source): boolean { return !this.program?.by_interpreter(src); }
  after(src: Text.Source) {
    if (this.levelled || this.default_level() === undefined) { if (this.level === undefined) this.settle(); return; }
    this.levelled = true;
    for (const own of this.program?.interpreted ?? []) if (this.owns(own)) this.read_source(own);
    this.settle();
  }
  default_level(): Node | undefined {
    const compiler = this.quietly(() => this.deref(this.lookup(this.GLOBAL, 'Compiler'), false));
    const held = compiler === undefined || compiler.none ? undefined : this.member(compiler, 'default');
    const block = held === undefined ? undefined : this.quietly(() => this.deref(held, false));
    return block === undefined || block.none ? undefined : block;
  }
  settle() {
    const block = this.default_level();
    if (block === undefined || block === this.level?.source) return;
    const scope = new Node();
    scope.parent = this.GLOBAL;
    this.quietly(() => this.safely(() => this.inline(block, scope)));
    const entries = new Map<string, Entry[]>();
    for (const rule of scope.rules ?? []) {
      const pieces = rule.pattern.filter(piece => piece.kind !== 'gap');
      const [receiver, spelled, operand] = pieces;
      if (receiver?.kind !== 'capture' || spelled?.kind !== 'literal' || rule.body === undefined) continue;
      if (pieces.length !== (operand === undefined ? 2 : 3) || (operand !== undefined && operand.kind !== 'capture')) continue;
      const text = spelled.text.trim(), method = text.length > 1 && !Interpreter.word.test(text[0]) && Interpreter.word.test(text[1]) ? text.slice(1) : text;
      const answer = this.quietly(() => this.safely(() => this.read(this.cursor_of(rule.body!), scope)));
      const held = answer === undefined ? undefined : this.quietly(() => this.deref(answer, false));
      const native = held === undefined ? undefined : this.markers.get(held);
      if (native !== undefined && !(native in Operations)) continue;
      const entry: Entry = { method, receiver, operand: operand as Capture | undefined, rule, native };
      entries.set(method, [...(entries.get(method) ?? []), entry]);
    }
    this.level = { source: block, entries };
  }
  type_of(piece: Capture): Node | undefined {
    if (piece.undecided && piece.decided !== this.declared) this.decide(piece);
    if (!piece.typed || piece.type === undefined) return undefined;
    const type = this.quietly(() => this.deref(piece.type, false));
    return type === undefined || type.none ? undefined : type;
  }
  carries(value: Node, rule: Rule): boolean { return this.rules_on(value instanceof Count ? value.template : value).includes(rule); }

  operation(found: Match, frame: Node, at: Text.Node): Node | undefined {
    const { rule, receiver, captures } = found;
    if (this.level === undefined || rule.body === undefined || receiver === undefined || this.bypassing.has(rule)) return undefined;
    const first = rule.pattern[0];
    if (first?.kind !== 'literal') return undefined;
    const entries = this.level.entries.get(first.text.trim());
    if (entries === undefined) return undefined;
    const taking = rule.pattern.find((piece): piece is Capture => piece.kind === 'capture');
    for (const entry of entries) {
      if ((entry.operand !== undefined) !== (taking !== undefined)) continue;
      const type = this.type_of(entry.receiver);
      if (type === undefined || rule.home !== type) continue;
      const self = this.deref(receiver, false);
      if (self === undefined || self.none || !this.carries(self, rule)) continue;
      let other: Node | undefined;
      if (taking !== undefined) {
        const span = captures.get(taking.name);
        other = span === undefined ? undefined : this.deref(this.lazy(span, frame), false);
        if (other === undefined || other.none || !this.carries(other, rule)) continue;
      }
      const written = () => { this.bypassing.add(rule); try { return this.apply(found, frame, at); } finally { this.bypassing.delete(rule); } };
      const answered = entry.native !== undefined ? Operations[entry.native](this, { self, other, rule, written }) : this.rewritten(entry, self, other);
      if (answered !== undefined) return answered;
    }
    return undefined;
  }
  rewritten(entry: Entry, self: Node, other: Node | undefined): Node | undefined {
    const local = new Node(entry.rule.at);
    local.parent = entry.rule.closure;
    local.set(entry.receiver.name, self);
    if (entry.operand !== undefined && other !== undefined) local.set(entry.operand.name, other);
    return this.read(this.cursor_of(entry.rule.body!), local);
  }

  // Numbers: a count, or a value whose field links down to the base, or digits selected on a base.
  private numerals = new WeakMap<Node, bigint | null>();
  field(of: Node | undefined, key: string): Node | undefined {
    if (of === undefined || of.none) return undefined;
    const held = this.member(of, key);
    return held === undefined ? undefined : this.quietly(() => this.safely(() => this.deref(held, false)));
  }
  links(chain: Node | undefined): Node[] | undefined {
    if (chain === undefined || chain.none) return undefined;
    const out: Node[] = [];
    for (let link = this.field(chain, 'head'), walked = 0; link !== undefined && !link.none && walked < 1 << 20; link = this.field(link, 'next'), walked++) {
      const value = this.field(link, 'value');
      if (value === undefined) return undefined;
      out.push(value);
    }
    return out;
  }
  numeral(value: Node): bigint | undefined {
    const known = this.numerals.get(value);
    if (known !== undefined) return known ?? undefined;
    let answer: bigint | null = null;
    const chain = this.field(value, 'integer');
    const selections = chain?.text ? undefined : this.links(chain);
    const along = (link: Node, key: string): bigint | undefined => {
      let n = 0n;
      for (let at: Node | undefined = link, walked = 0; walked < 4096; walked++) {
        const held = this.field(at, key);
        if (held === undefined || held.none) return n;
        n++; at = held;
      }
      return undefined;
    };
    if (selections !== undefined && selections.length > 0) {
      const before = along(selections[0], 'previous'), after = along(selections[0], 'next');
      const base = before === undefined || after === undefined ? undefined : before + after + 1n;
      let total = 0n;
      for (const selection of selections) {
        const digit = along(selection, 'previous');
        if (digit === undefined || base === undefined) { total = -1n; break; }
        total = total * base + digit;
      }
      if (total >= 0n) answer = total;
    }
    this.numerals.set(value, answer);
    return answer ?? undefined;
  }
  counted(value: Node | undefined, like: Count, rule: Rule): bigint | undefined {
    let n = 0n;
    for (let at = value, walked = 0; at !== undefined && walked < 1 << 20; walked++) {
      if (at instanceof Count) {
        if (at.field !== like.field || !this.carries(at, rule)) return undefined;
        n += at.count; at = at.base; continue;
      }
      const held = this.numeral(at);
      if (held !== undefined) return n + held;
      if (!this.carries(at, rule)) return undefined;
      const next = this.field(at, like.field);
      if (next === undefined || next.none) return n;
      n++; at = next;
    }
    return undefined;
  }
  counted_as(like: Count, n: bigint): Node { return n === 0n ? like.base : new Count(n, like.base, like.template, like.field); }
  unit(): Count | undefined { const one = this.number(1); return one instanceof Count ? one : undefined; }
  number(n: number | bigint): Node | undefined {
    const zero = this.quietly(() => this.deref(this.lookup(this.GLOBAL, 'zero'), false));
    if (zero === undefined || zero.none) return undefined;
    return BigInt(n) === 0n ? zero : new Count(BigInt(n), zero, zero, 'next');
  }
  truth(held: boolean): Node | undefined { return this.quietly(() => this.deref(this.lookup(this.GLOBAL, held ? 'true' : 'false'), false)); }
  succ(operand: Operand): Node | undefined {
    const { self, rule, written } = operand;
    if (self instanceof Count && this.carries(self, rule)) return self.succ();
    const answer = written(), made = answer === undefined ? undefined : this.deref(answer, false);
    if (made === undefined || made instanceof Count || !this.carries(made, rule)) return answer ?? this.NONE;
    for (const key of made.names?.keys() ?? []) {
      if (this.field(made, key) !== self) continue;
      return new Count(1n, self, made, key);
    }
    return answer ?? this.NONE;
  }
  operands(operand: Operand): { like: Count; a: bigint; b: bigint } | undefined {
    const { self, other, rule } = operand;
    if (other === undefined) return undefined;
    const like = self instanceof Count ? self : other instanceof Count ? other : this.unit();
    if (like === undefined || !this.carries(like, rule)) return undefined;
    const a = this.counted(self, like, rule), b = this.counted(other, like, rule);
    return a === undefined || b === undefined ? undefined : { like, a, b };
  }
  unary(operand: Operand, answer: (n: bigint, like: Count) => Node | undefined): Node | undefined {
    const like = operand.self instanceof Count ? operand.self : this.unit();
    if (like === undefined) return undefined;
    const n = this.counted(operand.self, like, operand.rule);
    return n === undefined ? undefined : answer(n, like);
  }

  // Text: a written literal is its characters; a String is a chain of Characters, each a chain of octet bits.
  bit(value: Node): number | undefined {
    if (value instanceof Count) return value.count > 0n ? 1 : 0;
    if (value.none) return 0;
    const numeral = this.numeral(value);
    if (numeral !== undefined) return numeral > 0n ? 1 : 0;
    const next = this.field(value, 'next');
    return next === undefined || next.none ? 0 : 1;
  }
  octets(character: Node | undefined): number[] | undefined {
    if (character === undefined) return undefined;
    if (character.text && character.at !== undefined && [...character.at.string].length === 1) return [...new TextEncoder().encode(character.at.string)];
    const point = character instanceof Count ? character.count : this.numeral(character);
    if (point !== undefined && point <= 0x10ffffn) return [...new TextEncoder().encode(String.fromCodePoint(Number(point)))];
    const bits = this.links(this.field(character, 'octets'));
    if (bits === undefined || bits.length === 0 || bits.length % 8 !== 0) return undefined;
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = i; j < i + 8; j++) { const b = this.bit(bits[j]); if (b === undefined) return undefined; byte = byte * 2 + b; }
      bytes.push(byte);
    }
    return bytes;
  }
  characters(string: Node | undefined): number[][] | undefined {
    if (string === undefined) return undefined;
    if (string.text && string.at !== undefined) return [...string.at.string].map(character => [...new TextEncoder().encode(character)]);
    const held = this.links(string);
    if (held === undefined) return undefined;
    const out: number[][] = [];
    for (const character of held) { const bytes = this.octets(character); if (bytes === undefined) return undefined; out.push(bytes); }
    return out;
  }
  chained(values: Node[]): Node | undefined {
    const frame = new Node();
    frame.parent = this.GLOBAL;
    const held = this.quietly(() => this.safely(() => this.deref(this.read(this.cursor_of(Text.Node.string('chain None')), frame), false)));
    if (held === undefined) return undefined;
    frame.set('held', held);
    const append = Text.Node.string('held &= next');
    for (const value of values) { frame.set('next', value); this.quietly(() => this.safely(() => this.read(this.cursor_of(append), frame))); }
    return held;
  }
}

const binary = (op: (a: bigint, b: bigint) => bigint | undefined): Operation => (level, operand) => {
  const held = level.operands(operand);
  if (held === undefined) return undefined;
  const n = op(held.a, held.b);
  return n === undefined ? operand.self : level.counted_as(held.like, n);
};
const compare = (op: (a: bigint, b: bigint) => boolean): Operation => (level, operand) => {
  const held = level.operands(operand);
  return held === undefined ? undefined : level.truth(op(held.a, held.b));
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
const character = (answer: (level: Levelled, mine: number[], theirs?: number[]) => Node | undefined): Operation => (level, { self, other }) => {
  const mine = level.octets(self);
  if (mine === undefined) return undefined;
  if (other === undefined) return answer(level, mine);
  const theirs = level.octets(other);
  return theirs === undefined ? undefined : answer(level, mine, theirs);
};
const predicate = (holds: (b: number[]) => boolean) => character((level, b) => level.truth(holds(b)));
const string = (answer: (level: Levelled, mine: number[][], theirs?: number[][]) => Node | undefined): Operation => (level, { self, other }) => {
  const mine = level.characters(self);
  if (mine === undefined) return undefined;
  if (other === undefined) return answer(level, mine);
  const theirs = level.characters(other);
  return theirs === undefined ? undefined : answer(level, mine, theirs);
};

// What the interpreter answers for an operation its level names: `js.number.+` is the host's addition on counts.
export const Operations: Record<string, Operation> = {
  'js.number.succ': (level, operand) => level.succ(operand),
  'js.number.+': binary((x, y) => x + y),
  'js.number.-': binary((x, y) => x > y ? x - y : 0n),
  'js.number.*': binary((x, y) => x * y),
  'js.number./': binary((x, y) => y === 0n ? 0n : x / y),
  'js.number.%': binary((x, y) => y === 0n ? undefined : x % y),
  'js.number.pred': (level, operand) => level.unary(operand, (n, like) => n === 0n ? level.NONE : level.counted_as(like, n - 1n)),
  'js.number.is_zero': (level, operand) => level.unary(operand, n => level.truth(n === 0n)),
  'js.number.nonzero': (level, operand) => level.unary(operand, n => level.truth(n !== 0n)),
  'js.number.<': compare((x, y) => x < y),
  'js.number.==': compare((x, y) => x === y),
  'js.character.==': character((level, a, b) => level.truth(same(a, b!))),
  'js.character.width': character((level, b) => level.number(width(b))),
  'js.character.octets': character((level, b) => level.chained(b.flatMap(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(shift => level.number((byte >> shift) & 1)!)))),
  'js.character.codepoint': character((level, b) => level.number(codepoint(b))),
  'js.character.is_ascii': predicate(ascii),
  'js.character.lower_case': predicate(lower),
  'js.character.upper_case': predicate(upper),
  'js.character.letter': predicate(b => lower(b) || upper(b)),
  'js.character.digit': predicate(digit),
  'js.character.blank': predicate(blank),
  'js.character.is_underscore': predicate(underscore),
  'js.character.word': predicate(b => lower(b) || upper(b) || digit(b) || underscore(b)),
  'js.character.digit_value': character((level, b) => digit(b) ? level.number(tail(b, 4)) : lower(b) || upper(b) ? level.number(tail(b, 3) + 9) : level.NONE),
  'js.string.==': string((level, a, b) => level.truth(a.length === b!.length && a.every((x, i) => same(x, b![i])))),
  'js.string.count': string((level, a) => level.number(a.length)),
  'js.string.length': string((level, a) => level.number(a.length)),
  'js.string.empty': string((level, a) => level.truth(a.length === 0)),
  'js.string.nonempty': string((level, a) => level.truth(a.length > 0)),
  'js.string.is_numeric': string((level, a) => level.truth(a.length > 0 && a.every(digit))),
  'js.string.starts_with': string((level, a, b) => level.truth(b!.length <= a.length && b!.every((x, i) => same(x, a[i])))),
  'js.string.ends_with': string((level, a, b) => level.truth(b!.length <= a.length && b!.every((x, i) => same(x, a[a.length - b!.length + i])))),
  'js.string.contains': string((level, a, b) => level.truth(b!.length === 0 || index_of(a, b!) >= 0)),
  'js.string.index_of': string((level, a, b) => { const i = a.length === 0 ? -1 : index_of(a, b!); return i < 0 ? level.NONE : level.number(i); }),
};
