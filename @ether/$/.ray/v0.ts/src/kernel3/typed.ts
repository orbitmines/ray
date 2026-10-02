import { Text } from './text.ts';
import { Interpreter, Node, each, type Piece, type Match } from './interpreter.ts';

// What a type says about what is written: a capture `{x: T}` stands where
// `T`'s reader accepts the text, a class with a structure reads its written
// form, and an unread word is read by the literal rules in reach.
export class Typed extends Interpreter {
  override typed(type: string, span: Text.Node, closure: Node, opts: { read?: boolean; rules?: boolean } = {}): Node | null | undefined {
    const answer = this.typed_of(type, span, closure, opts);
    if (answer === undefined) this.undecided++;
    return answer;
  }
  typed_of(type: string, span: Text.Node, closure: Node, opts: { read?: boolean; rules?: boolean } = {}): Node | null | undefined {
    if (this.passing === 0 && this.began) return null;
    const known_type = this.typings.get(closure)?.get(type);
    if (known_type === null) return null;
    if (known_type !== undefined && known_type !== this.NONE) {
      const answers = this.readings.get(known_type);
      if (answers?.has(span.string)) return answers.get(span.string) ?? null;
    }
    const reader = this.marked(closure, 'reader');
    const probing = this.probing, seeking = this.seeking;
    this.probing = 0; this.seeking = undefined;
    try {
      let types = this.typings.get(closure);
      if (!types) this.typings.set(closure, types = new Map());
      let resolved = types.get(type);
      if (resolved === null) return null;
      if (resolved === this.NONE) return undefined;
      if (resolved === undefined) {
        types.set(type, null);
        resolved = this.declared(type, closure);
        if (resolved === undefined || resolved.unknown || resolved.none) { types.set(type, this.NONE); return undefined; }
        types.set(type, resolved);
      }
      let answers = this.readings.get(resolved);
      if (!answers) this.readings.set(resolved, answers = new Map());
      const text = span.string;
      const known = answers.get(text);
      if (known !== undefined || answers.has(text)) return known ?? null;
      const place = resolved.position !== undefined ? `${resolved.position.source.location}:${resolved.position.begin}:${type}` : undefined;
      const refused = place !== undefined ? this.refusals.get(place) : undefined;
      if (refused?.has(text)) { answers.set(text, null); return null; }
      if (opts.read === false) return undefined;
      answers.set(text, null);
      const ruled = this.read_by_rules(resolved, text);
      if (ruled !== null) { answers.set(text, ruled); return ruled; }
      answers.delete(text);
      if (opts.rules) return null;
      const structured = this.read_structure(resolved, span, closure);
      if (structured !== undefined) { answers.set(text, structured); return structured; }
      const method = reader === undefined ? undefined : this.method_of(resolved, reader, { parameterised: true });
      if (!method) { answers.set(text, null); return null; }
      answers.set(text, null);
      const at = Text.Node.string(text);
      const literal = Object.assign(new Node(this.diagnostics, at), { literal: true });
      const match: Match = { ...this.trivial(resolved, at), args: [at], given: [literal] };
      const recorded = this.definitions.length;
      const value = this.diagnostics.muted(() => this.safely(() => this.deref(this.apply({ rule: method[0], impl: method[1], match }, this.cursor_of(at), closure, at), false)));
      this.definitions.length = recorded;
      const answer = value === undefined || value.none || value.unknown ? null : value;
      answers.set(text, answer);
      if (answer === null && place !== undefined && this.passing >= 2) { let kept = this.refusals.get(place); if (kept === undefined) this.refusals.set(place, kept = new Set()); kept.add(text); }
      return answer;
    } catch (e) { if (e instanceof RangeError) return undefined; throw e; }
    finally { this.probing = probing; this.seeking = seeking; }
  }
  read_by_rules(type: Node, text: string): Node | null {
    const frame = new Node(this.diagnostics); frame.key = `#${++this.ids}`; frame.levels = [type];
    const before = this.diagnostics.refused;
    const value = this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(Text.Node.string(text)), frame), false)));
    const clean = this.diagnostics.refused === before;
    this.diagnostics.refused = before;
    return clean && value !== undefined && !value.none && !value.unknown ? value : null;
  }
  override structured(type: string, closure: Node): boolean {
    if (this.typings.get(closure)?.get(type) === undefined) this.typed(type, this.blank, closure, { read: false });
    const resolved = this.typings.get(closure)?.get(type);
    return resolved !== undefined && resolved !== null && resolved !== this.NONE && this.structure_of(resolved, closure) !== undefined;
  }
  structure_of(type: Node, closure: Node): { pieces: Piece[]; closure: Node } | undefined {
    const name = this.marked(closure, 'structure'), between = this.marked(closure, 'separator'), annotates = this.marked(closure, 'annotation');
    if (name === undefined || between === undefined || annotates === undefined) return undefined;
    const held = this.diagnostics.muted(() => this.safely(() => this.deref(this.get(type, this.literal_of(name, this.blank)), false)));
    if (held?.body === undefined) return undefined;
    const written = held.closure ?? closure, pieces: Piece[] = [];
    for (const part of this.split(held.body, between)) {
      const spelled = part.string.trim();
      if (spelled.length === 0) continue;
      const colon = spelled.indexOf(annotates);
      if (colon > 0) { pieces.push({ kind: 'capture', name: spelled.slice(0, colon).trim(), raw: false, modifiers: [], styles: [], type: spelled.slice(colon + annotates.length).trim(), declaration: spelled, group: part }); continue; }
      const value = this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(part), written), false)));
      if (!value?.literal) return undefined;
      pieces.push({ kind: 'literal', text: value.position!.string });
    }
    return pieces.some(piece => piece.kind === 'capture') ? { pieces, closure: written } : undefined;
  }
  override read_structure(type: Node, span: Text.Node, closure: Node): Node | null | undefined {
    const read = this.read_structured(type, span, closure);
    if (read === undefined) return undefined;
    if (read === null) return null;
    return read.end === span.string.length ? read.value : null;
  }
  override read_structured(type: Node, span: Text.Node, closure: Node): { end: number; value: Node } | null | undefined {
    const structure = this.structure_of(type, closure);
    if (structure === undefined) return undefined;
    const brackets = this.grouping(closure), between = this.marked(closure, 'separator'), annotates = this.marked(closure, 'annotation');
    if (brackets === undefined || between === undefined || annotates === undefined) return undefined;
    const at = Text.Node.string(span.string), cursor = this.cursor_of(at);
    const match = this.match(structure.pieces, cursor, structure.closure, { leading: false, tight: true, params: 0, closure: structure.closure });
    if (match === undefined) return null;
    const fields: [string, Node][] = [];
    for (const piece of structure.pieces) {
      if (piece.kind !== 'capture') continue;
      const captured = match.captures.get(piece.name);
      const value = match.read?.get(piece.name) ?? (captured === undefined ? undefined : this.typed(piece.declaration!, captured, structure.closure));
      if (value === undefined || value === null) return null;
      fields.push([piece.name, value]);
    }
    const value = this.construct(type, fields, closure);
    return value === undefined ? null : { end: match.end - cursor.cursor, value };
  }
  construct(type: Node, fields: [string, Node][], closure: Node): Node | undefined {
    const brackets = this.grouping(closure), between = this.marked(closure, 'separator'), annotates = this.marked(closure, 'annotation');
    if (brackets === undefined || between === undefined || annotates === undefined) return undefined;
    const frame = this.frame(this.GLOBAL, 'structure', this.GLOBAL);
    const given = fields.map(([name, value], k) => { this.bind(frame, `_${k + 1}`, value); return `${name}${annotates} _${k + 1}`; });
    this.bind(frame, '_0', type);
    const built = Text.Node.string(`_0${brackets[0]}${given.join(`${between} `)}${brackets[1]}`);
    const value = this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(built), frame, true), false)));
    return value === undefined || value.none ? undefined : value;
  }
  override built_from(type: Node, list: Node, closure: Node): Node | undefined {
    const structure = this.structure_of(type, closure);
    if (structure === undefined) return undefined;
    const read = (of: Node, key: string) => { const held = of.own(key) ?? of.members?.get(key); return held === undefined ? undefined : this.diagnostics.muted(() => this.safely(() => this.deref(held, false))); };
    let link = read(list, 'head');
    const fields: [string, Node][] = [];
    for (const piece of structure.pieces) {
      if (link === undefined || link.none) return undefined;
      const value = read(link, 'value');
      if (piece.kind === 'capture') { if (value === undefined) return undefined; fields.push([piece.name, value]); }
      else if (piece.kind === 'literal' && (!value?.literal || value.position!.string !== piece.text)) return undefined;
      link = read(link, 'next');
    }
    if (link !== undefined && !link.none) return undefined;
    return this.construct(type, fields, closure);
  }
  literal_rule(rule: Node): boolean {
    const pieces = rule.pattern!;
    return pieces.length === 1 && pieces[0].kind === 'capture' && pieces[0].type !== undefined;
  }
  override literally(node: Node, opts: { read?: boolean } = {}): Node | undefined {
    const ref = node.ref!, span = node.position;
    if (span === undefined) return undefined;
    if (ref.through !== undefined) return ref.through;
    for (const [rule, impl] of each(this.chain(ref.scope).receiver)) {
      if (!this.literal_rule(rule)) continue;
      const piece = rule.pattern![0] as Piece & { kind: 'capture' };
      const value = this.typed(piece.declaration!, span, impl.closure ?? this.GLOBAL, opts);
      if (value === null || value === undefined) continue;
      const match: Match = { begin: span.begin, end: span.end + 1, pattern: span.end + 1, literals: [], captures: new Map([[piece.name, span]]), operators: new Map(), args: [], tight: true, read: new Map([[piece.name, value]]) };
      const read = this.apply({ rule, impl, match }, this.cursor_of(span), ref.scope, span);
      if (read !== undefined) return ref.through = read;
    }
    return undefined;
  }
  override typed_end(piece: Piece & { kind: 'capture' }, cursor: Text.Node, from: number, end: number, frame: Node, closure: Node, split: boolean = false): { end: number; value?: Node } | undefined {
    if (this.structured(piece.declaration!, closure)) {
      const resolved = this.typings.get(closure)!.get(piece.declaration!)!;
      const line = Math.max(end, this.line_end(cursor, from, frame));
      const read = this.read_structured(resolved, cursor.span(from, line - 1), closure);
      return read === undefined || read === null ? undefined : { end: from + read.end, value: read.value };
    }
    const word = this.token_end(cursor, from, frame);
    if (word <= from || word > end) return undefined;
    const first = this.typed(piece.declaration!, cursor.span(from, word - 1), closure);
    if (first === null) {
      if (!split) return undefined;
      for (let k = word - 1; k > from; k--) {
        const part = this.typed(piece.declaration!, cursor.span(from, k - 1), closure, { rules: true });
        if (part !== null) return { end: k, value: part ?? undefined };
      }
      return undefined;
    }
    if (end > word) {
      const longer = this.typed(piece.declaration!, cursor.span(from, end - 1), closure);
      if (longer !== null) return { end, value: longer ?? undefined };
    }
    return { end: word, value: first ?? undefined };
  }

}
