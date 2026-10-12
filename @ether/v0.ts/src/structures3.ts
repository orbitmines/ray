// A class header read as a structure of bits: its pieces walked over a sequence of bits to read a value, or over a value to
// write its bits. What each piece is (its type, narrowing, condition, default) is the header's, read in Ray with the fields
// read so far; this only moves bits. Bits are text of `0` and `1`.

type Ray = ((text: string) => unknown) & { written: (value: unknown) => string };
// (a value as code: text quoted, as the kernel writes text as itself)
const code = ($: Ray, value: unknown) => typeof value === 'string' ? (value.includes('"') ? '`' + value + '`' : '"' + value + '"') : $.written(value);
type Type = {
  text: string, reversed?: boolean, width?: number, variable?: boolean, base?: string, generics?: string[],
  list?: Type, group?: Piece[], alternatives?: Type[], narrowings: string[], boolean?: boolean,
};
type Piece = { name?: string, type?: Type, default?: string, condition?: string, group?: Piece[] };
type Header = { pieces: Piece[], parameters: string, plain: boolean };
type Read = { value: unknown, at: number };
type Then = (value: unknown, at: number) => Read | null;

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

export class Structures {
  // (the furthest bit the last read reached: where reading a value that is not one stopped)
  reached = 0;
  private headers = new Map<string, Header>();
  private codings = new WeakMap<object, Coding>();

  // (the pieces of a header, split where a comma is outside every bracket)
  static split(text: string, separator: string): string[] {
    const parts: string[] = [], open: string[] = [];
    let start = 0, quote = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
      if (c === '"' || c === '`') quote = c;
      else if ('([{'.includes(c) || (c === '<' && /[\p{L}\p{N}_]/u.test(text[i - 1] ?? '') && text[i + 1] !== '-' && text[i + 1] !== '=')) open.push(c);
      else if (')]}'.includes(c) || (c === '>' && open.at(-1) === '<')) open.pop();
      else if (!open.length && text.startsWith(separator, i)) { parts.push(text.slice(start, i).trim()); start = i + separator.length; i += separator.length - 1; }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(part => part.length);
  }
  static closing(text: string, at: number): number {
    const open = text[at], close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0;
    for (let i = at; i < text.length; i++) { if (text[i] === open) depth++; else if (text[i] === close && --depth === 0) return i; }
    return -1;
  }
  static opening(text: string, end: number): number {
    const close = text[end], open = close === ')' ? '(' : close === ']' ? '[' : '{';
    let depth = 0;
    for (let i = end; i >= 0; i--) { if (text[i] === close) depth++; else if (text[i] === open && --depth === 0) return i; }
    return -1;
  }

  // (a header of bits: one with a piece that is not named, a condition, or a type of bits in it; any other is plain, its
  // pieces its maker's parameters as written)
  header(text: string): Header {
    let header = this.headers.get(text);
    if (header) return header;
    const written = text.split('\n').filter(line => !line.trim().startsWith('//')).join('\n').trim();
    const pieces = Structures.split(written, ',').map(piece => this.piece(piece));
    const plain = pieces.every(piece => Structures.quoted(piece) || (piece.name !== undefined && !piece.group && !/\b(Binary|Byte)|<-/.test(piece.type?.text ?? '')));
    header = { pieces, plain, parameters: plain ? written : Structures.named(pieces).map(piece => piece.name).join(', ') };
    this.headers.set(text, header);
    return header;
  }
  // (text written between quotes, a piece of a header of text)
  static quoted(piece: Piece): boolean { return piece.name === undefined && !piece.group && /^(["`])[\s\S]*\1$/.test(piece.type?.text ?? ''); }
  // (plain, and no piece's type, or what it lists or may be, a class whose header is of bits)
  plain($: Ray, text: string): boolean {
    const header = this.header(text);
    if (!header.plain) return false;
    const of_bits = (type: Type | undefined): boolean => {
      if (!type) return false;
      if (type.list) return of_bits(type.list);
      if (type.alternatives) return type.alternatives.some(of_bits);
      const base = type.base;
      if (!base || !/^[\p{Lu}][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)*$/u.test(base)) return false;
      return [base, base.split('.').at(-1)!].some(name => { const structure = $(name + '.structure'); return !!structure && typeof structure === 'object' && 'pieces' in structure; });
    };
    return !header.pieces.some(piece => of_bits(piece.type));
  }
  static names(type: Type): string[] { return type.group ? Structures.named(type.group).map(piece => piece.name!) : []; }
  static named(pieces: Piece[]): Piece[] { return pieces.flatMap(piece => piece.group ? Structures.named(piece.group) : piece.name === undefined ? [] : [piece]); }
  // (the maker's definition: in a header of bits, a default is a rule read when its field is first read, unless given)
  instance(fields: string, block: string, written: (value: unknown) => string): string[] {
    const header = this.header(fields), lines = block.split('\n'), base = Math.min(...lines.filter(line => line.trim()).map(line => line.length - line.trimStart().length));
    const defaults = Structures.named(header.pieces).filter(piece => piece.default !== undefined)
      .map(piece => `\n  (goto given_${piece.name}) unless ${piece.name} === None\n  ${piece.name} =>\n    ${piece.default}\n  given_${piece.name}\\`).join('');
    const maker = `instance := (${Structures.named(header.pieces).map(piece => piece.name).join(', ')}) =>\n  of := instance\n  (here of) instanced {\n${lines.map(line => '    ' + line.slice(base)).join('\n')}\n  }${defaults}\n  of := instance`;
    return [maker, `structure := ${written(header)}`];
  }
  piece(text: string): Piece & { written?: string } {
    if (text.startsWith('(')) {
      const close = Structures.closing(text, 0), guard = close > 0 ? /^\s+if\s+([\s\S]+)$/.exec(text.slice(close + 1)) : null;
      if (guard) return { group: Structures.split(text.slice(1, close), ',').map(piece => this.piece(piece)), condition: guard[1].trim() };
    }
    const name = /^([\p{L}_][\p{L}\p{N}_]*)(\s*:\s+|\s*=\s+|$)/u.exec(text);
    if (!name || (name[2].trim() === '' && name[0] !== text)) return { type: this.type(text) };
    const rest = text.slice(name[0].length), assigned = name[2].trim() === '=';
    if (assigned) return { name: name[1], default: rest.trim(), written: text };
    const parts = Structures.split(rest, ' = ');
    return { name: name[1], type: rest ? this.type(parts[0]) : undefined, default: parts.length > 1 ? parts.slice(1).join(' = ') : undefined, written: parts.length > 1 ? `${name[1]}: ${parts[0]} = ${parts.slice(1).join(' = ')}` : text };
  }
  type(written: string): Type {
    let text = written.trim();
    const type: Type = { text, narrowings: [] };
    const alternatives = Structures.split(text, ' | ');
    if (alternatives.length > 1) return { ...type, alternatives: alternatives.map(alternative => this.type(alternative)) };
    const as = /\s+as\s+boolean$/.exec(text);
    if (as) { type.boolean = true; text = text.slice(0, as.index).trim(); }
    for (;;) {
      if (text.endsWith('}')) { const at = Structures.opening(text, text.length - 1); if (at > 0) { type.narrowings.unshift(text.slice(at + 1, -1).trim()); text = text.slice(0, at).trim(); continue; } }
      break;
    }
    if (text.endsWith('[]')) { type.list = this.type(text.slice(0, -2)); return type; }
    if (text.startsWith('(') && Structures.closing(text, 0) === text.length - 1) {
      const inner = text.slice(1, -1).trim(), parts = Structures.split(inner, ',');
      if (parts.length > 1 || /^[\p{L}_][\p{L}\p{N}_]*\s*:\s/u.test(inner)) { type.group = parts.map(part => this.piece(part)); return type; }
      const inside = this.type(inner);
      return { ...inside, narrowings: [...inside.narrowings, ...type.narrowings], boolean: inside.boolean || type.boolean };
    }
    if (text.startsWith('<-')) { type.reversed = true; text = text.slice(2).trim(); if (text.startsWith('(')) { const inside = this.type(text); return { ...inside, reversed: true, narrowings: [...inside.narrowings, ...type.narrowings] }; } }
    const fixed = /^(Binary|Byte)([₀-₉]*)$/.exec(text);
    if (fixed) {
      const count = fixed[2] ? Number([...fixed[2]].map(digit => SUBSCRIPTS.indexOf(digit)).join('')) : undefined;
      if (fixed[1] === 'Byte') type.width = 8 * (count ?? 1); else if (count === undefined) type.variable = true; else type.width = count;
      return type;
    }
    const generic = /^([\s\S]+?)<([\s\S]+)>$/.exec(text);
    if (generic && !generic[1].includes(' ')) { type.base = generic[1]; type.generics = Structures.split(generic[2], ','); return type; }
    type.base = text;
    return type;
  }

  coding(table: object, $: Ray): Coding {
    let coding = this.codings.get(table);
    if (!coding) this.codings.set(table, coding = new Coding(listed($, table).map(entry => ({ symbol: $($.written(entry) + '.symbol') as number, bits: $($.written(entry) + '.bits') as string }))));
    return coding;
  }

  read($: Ray, maker: unknown, bits: string): unknown {
    if (typeof bits !== 'string' || !/^[01]*$/.test(bits) || typeof maker !== 'object' || maker === null) return $('None');
    const header = $($.written(maker) + '.structure');
    if (!header || typeof header !== 'object' || !('pieces' in header)) return $('None');
    const reading = new Reading(this, $, bits);
    // (a value is all of the bits it is read from: a reading that leaves some is not one)
    const read = reading.structure(maker, [], 0, header as Header, (value, at) => at === bits.length ? { value, at } : null);
    this.reached = reading.furthest;
    return read ? read.value : $('None');
  }
  write($: Ray, value: unknown): string | undefined {
    const writing = new Writing(this, $);
    return writing.structure(value, 0) ? writing.out.join('') : undefined;
  }
}

// A prefix code: a table of symbols and their bits, read by the bits that come next, written by the symbol.
export class Coding {
  private by_bits = new Map<string, number>(); private by_symbol = new Map<number, string>(); longest = 0;
  constructor(entries: { symbol: number, bits: string }[]) {
    for (const { symbol, bits } of entries) { this.by_bits.set(bits, symbol); this.by_symbol.set(symbol, bits); this.longest = Math.max(this.longest, bits.length); }
  }
  read(bits: string, at: number): Read | null {
    for (let width = 1; width <= this.longest && at + width <= bits.length; width++) {
      const symbol = this.by_bits.get(bits.slice(at, at + width));
      if (symbol !== undefined) return { value: symbol, at: at + width };
    }
    return null;
  }
  bits(symbol: number): string | undefined { return this.by_symbol.get(symbol); }
}

function listed($: Ray, list: unknown): unknown[] {
  const values: unknown[] = [], none = $('None');
  for (let at = $($.written(list) + '.head'); at !== none && at !== undefined; at = $($.written(at) + '.next')) values.push($($.written(at) + '.value'));
  return values;
}
function truthy($: Ray, value: unknown): boolean { return value !== undefined && value !== $('None') && value !== $('false'); }
function unsigned(bits: string, reversed?: boolean): number {
  const read = reversed ? [...bits].reverse().join('') : bits;
  return read.length ? parseInt(read, 2) : 0;
}
function bits_of(value: number, width: number, reversed?: boolean): string {
  const written = width ? value.toString(2).padStart(width, '0').slice(-width) : '';
  return reversed ? [...written].reverse().join('') : written;
}

// What both directions share: reading Ray in a scope (an instance, a record being made), with `.`, `length` and `at` given.
class Scoped {
  // (a record's scope, made in a structure's: what is read in it that names none of its fields is the same for the structure)
  private homes = new WeakMap<object, { home: unknown, names: Set<string> }>(); private made_in = new WeakMap<object, Map<string, { maker: unknown, header?: Header, coding?: Coding }>>();
  constructor(protected structures: Structures, protected $: Ray) {}
  in(scope: unknown, text: string): unknown { return this.$(this.$.written(scope) + ' reading {\n' + text + '\n}'); }
  set(scope: unknown, name: string, value: unknown) { this.in(scope, `${name} = ${code(this.$, value)}`); }
  child(scope: unknown): unknown { return this.in(scope, '{ }'); }
  given(scope: unknown, length: number, at: number): unknown {
    const child = this.child(scope);
    this.in(child, `length := ${length}\nat := ${at}`);
    return child;
  }
  // (a narrowing read with `.` the value; one beginning with an operator, `{< 256}`, of `.`; one of where the value is,
  // `length` (its bits, or values) and `at` (the bit it begins at), read where those are)
  holds(scope: unknown, narrowing: string, value: unknown, length: number, at: number): boolean {
    const exact = /^==\s*([\s\S]+)$/.exec(narrowing);
    if (exact && typeof value === 'number') return this.in(scope, exact[1]) === value;
    const held = /\b(length|at)\b/.test(narrowing) ? this.in(this.given(scope, length, at), narrowing)
      : this.in(scope, `(${this.$.written(value)}) with {\n${/^[<>=!]/.test(narrowing) ? '. ' + narrowing : narrowing}\n}`);
    return truthy(this.$, held);
  }
  // (a narrowing that fixes `length`, `length == n`: n; else none)
  fixed_length(scope: unknown, narrowings: string[]): number | undefined {
    for (const narrowing of narrowings) { const fixed = /^length\s*==\s*([\s\S]+)$/.exec(narrowing); if (fixed) return this.in(scope, fixed[1]) as number; }
    return undefined;
  }
  // (a narrowing that fixes the value, `== v`: v; else none)
  exact(scope: unknown, narrowings: string[]): unknown {
    for (const narrowing of narrowings) { const exact = /^==\s*([\s\S]+)$/.exec(narrowing); if (exact) return this.in(scope, exact[1]); }
    return undefined;
  }
  record_scope(scope: unknown, names: string[]): unknown {
    const record = this.child(scope), outer = this.homes.get(scope as object);
    this.homes.set(record as object, { home: outer ? outer.home : scope, names: new Set([...names, ...(outer?.names ?? [])]) });
    return record;
  }
  made(scope: unknown, base: string): { maker: unknown, header?: Header, coding?: Coding } {
    const record = this.homes.get(scope as object), words = base.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [];
    const home = record && !words.some(word => record.names.has(word)) ? record.home : scope;
    let known = this.made_in.get(home as object);
    if (!known) this.made_in.set(home as object, known = new Map());
    const had = known.get(base);
    if (had) return had;
    const made = this.making(home, base);
    known.set(base, made);
    return made;
  }
  making(scope: unknown, base: string): { maker: unknown, header?: Header, coding?: Coding } {
    const maker = this.in(scope, base);
    if (maker instanceof Object && (maker as { coding?: unknown }).constructor === Coding) return { maker, coding: maker as Coding };
    const header = this.$(this.$.written(maker) + '.structure');
    return { maker, header: header && typeof header === 'object' && 'pieces' in (header as object) ? header as Header : undefined };
  }
  // (a record of the named pieces read, the scope they were read in, each one not read None: of every alternative, so what one
  // does not hold reads as None)
  record(scope: unknown, names: string[], values: Map<string, unknown>): unknown {
    if (!names.length) return this.$('None');
    const missing = names.filter(name => !values.has(name));
    if (missing.length) this.in(scope, missing.map(name => `${name} := None`).join('\n'));
    return scope;
  }

}

class Reading extends Scoped {
  furthest = 0;
  constructor(structures: Structures, $: Ray, private bits: string) { super(structures, $); }
  reach(at: number) { if (at > this.furthest) this.furthest = at; }

  structure(maker: unknown, given: unknown[], at: number, header: Header | undefined, then: Then): Read | null {
    header ??= this.$(this.$.written(maker) + '.structure') as Header;
    const made = this.$(this.$.written(maker) + '(' + given.map(value => code(this.$, value)).join(', ') + ')');
    return this.pieces(header.pieces.slice(given.length), 0, at, made, undefined, after => then(made, after));
  }
  pieces(pieces: Piece[], k: number, at: number, scope: unknown, values: Map<string, unknown> | undefined, then: (at: number) => Read | null): Read | null {
    if (k === pieces.length) return then(at);
    const piece = pieces[k];
    if (piece.group) {
      if (piece.condition !== undefined && !truthy(this.$, this.in(scope, piece.condition))) return this.pieces(pieces, k + 1, at, scope, values, then);
      return this.pieces([...piece.group, ...pieces.slice(k + 1)], 0, at, scope, values, then);
    }
    if (!piece.type) return this.pieces(pieces, k + 1, at, scope, values, then);
    return this.type(piece.type, at, scope, (value, after) => {
      if (piece.name) { if (values) { values.set(piece.name, value); this.in(scope, `${piece.name} := ${code(this.$, value)}`); } else this.set(scope, piece.name, value); }
      return this.pieces(pieces, k + 1, after, scope, values, then);
    });
  }
  type(type: Type, at: number, scope: unknown, then: Then, names?: string[]): Read | null {
    if (type.alternatives) { const all = type.alternatives.flatMap(alternative => Structures.names(alternative)); for (const alternative of type.alternatives) { const read = this.type(alternative, at, scope, then, all); if (read) return read; } return null; }
    const narrowed: Then = type.narrowings.length || type.boolean ? (value, after) => {
      for (const narrowing of type.narrowings) if (!this.holds(scope, narrowing, value, typeof value === 'number' || typeof value === 'string' ? after - at : this.$(this.$.written(value) + '.count') as number, at)) return null;
      return then(type.boolean ? this.$(value ? 'true' : 'false') : value, after);
    } : then;
    if (type.width !== undefined && at + type.width <= this.bits.length) this.reach(at + type.width);
    if (type.width !== undefined) return at + type.width <= this.bits.length ? narrowed(unsigned(this.bits.slice(at, at + type.width), type.reversed), at + type.width) : null;
    if (type.variable) {
      const fixed = this.fixed_length(scope, type.narrowings);
      if (fixed !== undefined && at + fixed <= this.bits.length) this.reach(at + fixed);
      if (fixed !== undefined) return at + fixed <= this.bits.length ? then(unsigned(this.bits.slice(at, at + fixed), type.reversed), at + fixed) : null;
      for (let width = 0; width <= 64 && at + width <= this.bits.length; width++) {
        const value = unsigned(this.bits.slice(at, at + width), type.reversed);
        if (type.narrowings.every(narrowing => this.holds(scope, narrowing, value, width, at))) { const read = then(value, at + width); if (read) return read; }
      }
      return null;
    }
    if (type.list) return this.list(type, at, scope, then);
    if (type.group) {
      const record = this.record_scope(scope, Structures.names(type)), values = new Map<string, unknown>();
      return this.pieces(type.group, 0, at, record, values, after => narrowed(this.record(record, names ?? Structures.names(type), values), after));
    }
    const { maker, header, coding } = this.made(scope, type.base!);
    if (coding) { const read = coding.read(this.bits, at); if (read) this.reach(read.at); return read ? narrowed(read.value, read.at) : null; }
    if (!header) return null;
    const given = (type.generics ?? []).map(generic => this.in(scope, generic));
    return this.structure(maker, given, at, header, narrowed);
  }
  list(type: Type, at: number, scope: unknown, then: Then): Read | null {
    const made = this.$('Listing.new'), fixed = this.fixed_length(scope, type.narrowings);
    const rest = type.narrowings.filter(narrowing => !/^length\s*==/.test(narrowing));
    for (let count = 0, after = at; ; count++) {
      if (fixed === undefined || count === fixed) {
        if (rest.every(narrowing => this.holds(scope, narrowing, made, count, at))) { const read = then(made, after); if (read) return read; }
        if (fixed !== undefined) return null;
      }
      const element = this.type(type.list!, after, scope, (value, next) => ({ value, at: next }));
      if (!element || element.at === after) return null;
      this.$(this.$.written(made) + '.append(' + code(this.$, element.value) + ')');
      after = element.at;
    }
  }
}

class Writing extends Scoped {
  out: string[] = []; private length = 0;
  emit(bits: string) { this.out.push(bits); this.length += bits.length; }

  structure(value: unknown, given: number, header?: Header): boolean {
    header ??= this.$(this.$.written(value) + '.of.structure') as Header;
    if (!header || typeof header !== 'object') return false;
    return this.pieces(header.pieces.slice(given), value, value);
  }
  field(scope: unknown, record: unknown, piece: Piece): unknown {
    let value = this.$(this.$.written(record) + '.' + piece.name);
    if (!truthy(this.$, value) && value !== this.$('false') && piece.default !== undefined) { value = this.in(scope, piece.default); if (record === scope) this.set(scope, piece.name!, value); }
    return value;
  }
  pieces(pieces: Piece[], scope: unknown, record: unknown): boolean {
    for (const piece of pieces) {
      if (piece.group) {
        if (piece.condition !== undefined && !truthy(this.$, this.in(scope, piece.condition))) continue;
        if (!this.pieces(piece.group, scope, record)) return false;
        continue;
      }
      if (!piece.type) continue;
      const value = piece.name ? this.field(scope, record, piece) : undefined;
      if (!this.type(piece.type, value, scope)) return false;
    }
    return true;
  }
  type(type: Type, value: unknown, scope: unknown): boolean {
    if (type.alternatives) {
      for (const alternative of type.alternatives) if (this.fits(alternative, value, scope)) return this.type(alternative, value, scope);
      return false;
    }
    if (value === this.$('None')) value = undefined;
    if (value === undefined) value = this.exact(scope, type.narrowings);
    if (type.boolean) value = value === this.$('true') ? 1 : 0;
    if (type.width !== undefined) { this.emit(bits_of((value ?? 0) as number, type.width, type.reversed)); return true; }
    if (type.variable) {
      let width = this.fixed_length(scope, type.narrowings);
      for (let tried = 0; width === undefined && tried <= 64; tried++) if (type.narrowings.every(narrowing => this.holds(scope, narrowing, value ?? 0, tried, this.length))) width = tried;
      if (width === undefined) return false;
      this.emit(bits_of((value ?? 0) as number, width, type.reversed));
      return true;
    }
    if (type.list) { for (const element of listed(this.$, value)) if (!this.type(type.list, element, scope)) return false; return true; }
    if (type.group) {
      const record = this.record_scope(scope, Structures.names(type));
      const walk = (pieces: Piece[]) => { for (const piece of pieces) if (piece.name) this.in(record, `${piece.name} := ${code(this.$, this.$(this.$.written(value) + '.' + piece.name))}`); else if (piece.group) walk(piece.group); };
      walk(type.group);
      return this.pieces(type.group, record, value);
    }
    const { header, coding } = this.made(scope, type.base!);
    if (coding) { const bits = coding.bits(value as number); if (bits === undefined) return false; this.emit(bits); return true; }
    if (!header) return false;
    return this.structure(value, (type.generics ?? []).length, header);
  }
  // (the alternative a value was read as: the class it is one of; for a record, the one whose named pieces it holds)
  fits(type: Type, value: unknown, scope: unknown): boolean {
    if (!type.group) return type.base === undefined || typeof value !== 'object' || this.in(scope, `(${this.$.written(value)}) is ${type.base}`) === this.$('true');
    const names: string[] = [];
    const walk = (pieces: Piece[]) => { for (const piece of pieces) if (piece.name) names.push(piece.name); else if (piece.group) walk(piece.group); };
    walk(type.group);
    return names.every(name => truthy(this.$, this.$(this.$.written(value) + '.' + name)) || this.$(this.$.written(value) + '.' + name) === 0);
  }
}
