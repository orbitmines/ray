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
      if (opts.read === false) return undefined;
      answers.set(text, null);
      const ruled = this.read_by_rules(resolved, text);
      if (ruled !== null) { answers.set(text, ruled); return ruled; }
      return null;
    }
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
