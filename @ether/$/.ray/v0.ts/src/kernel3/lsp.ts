import { Text } from './text.ts';
import { Analysed } from './analysis.ts';
import { Node, type Piece, type Match, type Shape, type Group } from './interpreter.ts';

export class Served extends Analysed {
  paints: Text.Node[] = [];
  painted = 0;
  sites: Map<string, Text.Node> = new Map();
  palette?: { theme?: Node; colors: Map<string, string> };

  override site_at(key: string, at?: Text.Node) { if (at !== undefined) this.sites.set(key, at); }
  override begin_pass() { this.paints = []; this.sites = new Map(); }
  override end_pass() { this.painted++; }

  style_name(token: Text.Node | Node | undefined): string | undefined {
    if (token === undefined) return undefined;
    if (token instanceof Node) return token.style;
    return token.string.replace(/^\^\s*/, '').trim() || undefined;
  }
  override paint(span: Text.Node, decorator: Text.Node | Node | undefined | (() => (Text.Node | Node)[]), frame: Node, of?: string, opts: { lexical?: boolean } = {}) {
    if (!this.program?.serving || !this.owns(span.source) || (!opts.lexical && !this.probing && this.in_body(span))) return;
    const token = typeof decorator === 'function' ? decorator().at(-1) : decorator;
    if (token === undefined) return;
    const painted = span.span(span.begin, span.end);
    painted.style = () => this.style_name(token);
    painted.of = of;
    this.paints.push(painted);
  }
  styled(token: Text.Node | undefined, frame: Node, captures?: Map<string, Node>): Node | undefined {
    if (token === undefined) return undefined;
    const scope = new Node(this.diagnostics); scope.parent = frame;
    for (const [name, value] of captures ?? []) this.bind(scope, name, value);
    const node = new Node(this.diagnostics, token);
    let style: string | undefined | null = null;
    Object.defineProperty(node, 'style', { get: () => style !== null ? style : (style = this.diagnostics.muted(() => this.safely(() => this.resolved(this.array(this.cursor_of(token), scope))))?.style) });
    return node;
  }
  override painted_application(rule: Node, impl: Node, match: Match, captures: Map<string, Node>, cursor: Text.Node, frame: Node) {
    if (!this.program?.serving) return;
    const closure = impl.closure ?? frame;
    const decorator = this.styled(impl.decorators?.at(-1), closure, captures);
    for (const [p, from, to] of match.literals) {
      const piece = rule.pattern![p];
      this.paint(cursor.span(from, to), this.styled(piece.kind === 'literal' ? piece.styles?.at(-1) : undefined, closure, captures) ?? decorator, frame, rule.key);
    }
    for (const piece of rule.pattern!) {
      if (piece.kind !== 'capture' || piece.styles.length === 0) continue;
      const span = match.captures.get(piece.name);
      if (span !== undefined && span.end >= span.begin) this.paint(span, this.styled(piece.styles.at(-1), closure, captures), frame, rule.key);
    }
  }
  paint_words(span: Text.Node, scope: Node) {
    const text = span.source.value;
    for (const found of span.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*|[^\s\p{L}\p{N}_(){}\[\]`,.]+/gu)) {
      const at = span.begin + found.index!;
      if (this.prefixes.has(text[at - 1])) continue;
      const reference = this.reference(scope, found[0], span.span(at, at + found[0].length - 1));
      if (this.diagnostics.muted(() => this.safely(() => this.resolved(reference))) !== undefined) this.paint_reference(reference, true);
    }
  }
  paint_group(content: Text.Node, scope: Node, of: string, shape?: Shape, opts: { operator?: boolean; group?: Group } = {}) {
    const tokens = this.tokens(content, scope);
    const decorators = tokens.filter(token => this.decorates(token, scope));
    const annotates = this.marked(scope, 'annotation'), opens = this.grouping(scope)?.[0];
    const grouped = (t: string) => opens !== undefined && t.startsWith(opens);
    const words: Text.Node[] = [], types: Text.Node[] = [];
    for (const token of tokens) {
      if (decorators.includes(token)) continue;
      const t = token.string;
      if (types.length > 0) { types.push(token); continue; }
      const colon = annotates === undefined || grouped(t) || t.startsWith('`') ? -1 : t.indexOf(annotates);
      if (colon < 0) { words.push(token); continue; }
      if (colon > 0) words.push(token.span(token.begin, token.begin + colon - 1));
      types.push(token.span(token.begin + colon + annotates!.length, token.end));
    }
    const last = words.at(-1);
    const name = last && !grouped(last.string) ? words.pop() : undefined;
    if (!name && last) types.unshift(words.pop()!);
    for (const word of words) this.paint_words(word, scope);
    if (name) {
      const t = name.string;
      if (/^`[^`]*`$/.test(t)) { if (t.length > 2) for (const decorator of decorators) this.paint(name.span(name.begin + 1, name.end - 1), this.styled(decorator, scope), scope, of, { lexical: true }); }
      else if (/^[\p{L}_]/u.test(t)) {
        const reference = this.reference(scope, t, name);
        if (this.diagnostics.muted(() => this.safely(() => this.resolved(reference))) !== undefined) this.paint_reference(reference, true);
        else {
          if (shape) for (const style of opts.group?.content ?? []) this.paint(name, this.styled(style, shape.frame), shape.frame, of, { lexical: true });
          for (const decorator of decorators) this.paint(name, this.styled(decorator, scope), scope, of, { lexical: true });
        }
      }
    }
    if (!opts.operator) for (const type of types) if (!type.empty() && type.begin <= type.end) this.probe(type, scope, { report: true });
  }
  override paint_definition(chunks: Text.Node[], decorators: Text.Node[], scope: Node, of: string, opts: { arrow?: Text.Node; params?: Text.Node[]; types?: Text.Node[]; pieces?: Piece[] } = {}) {
    if (!this.program?.serving) return;
    const shape = this.shape(scope.parent ?? scope);
    const paint = (span: Text.Node, style: Text.Node, frame: Node) => this.paint(span, this.styled(style, frame), frame, of, { lexical: true });
    if (shape && opts.arrow) for (const style of shape.arrow) paint(opts.arrow, style, shape.frame);
    for (const name of opts.params ?? []) this.paint_reference(this.reference(scope, name.string, name), true);
    for (const type of opts.types ?? []) this.probe(type, scope, { report: true });
    const operators = new Set((opts.pieces ?? []).flatMap(piece => piece.kind === 'operator' ? [piece.group.begin] : []));
    for (const chunk of chunks) {
      const text = chunk.source.value, end = chunk.end + 1;
      let run = -1;
      const flush = (j: number) => {
        if (run < 0) return;
        const span = chunk.span(run, j - 1);
        if (shape) for (const style of shape.text) paint(span, style, shape.frame);
        for (const decorator of decorators) paint(span, decorator, scope);
        this.paint_words(span, scope);
        run = -1;
      };
      for (let j = chunk.begin; j < end;) {
        if (shape?.groups.has(text[j]) || operators.has(j)) {
          flush(j);
          const close = this.group_end(text, j, end);
          const group = shape?.groups.get(text[j]);
          if (shape && group) {
            for (const style of group.open) paint(chunk.span(j, j), style, shape.frame);
            for (const style of group.close) paint(chunk.span(close - 1, close - 1), style, shape.frame);
          }
          if (close - 2 >= j + 1) this.paint_group(chunk.span(j + 1, close - 2), scope, of, shape, { operator: operators.has(j), group });
          j = close;
          continue;
        }
        if (run < 0) run = j;
        j++;
      }
      flush(end);
    }
  }
  fallback(styles: (Node | undefined)[]): Node {
    const node = new Node(this.diagnostics);
    Object.defineProperty(node, 'style', { get: () => { for (let k = styles.length - 1; k >= 0; k--) { const style = styles[k]?.style; if (style) return style; } return undefined; } });
    return node;
  }
  override definition_scope(frame: Node, rule: Node, impl: Node): Node {
    const scope = super.definition_scope(frame, rule, impl);
    if (!this.program?.serving) return scope;
    const shape = this.shape(frame);
    const declare = (name: string, tokens: Text.Node[], group?: Group) => this.mark_name(scope, name, [this.fallback([...(group?.content ?? []).map(token => this.styled(token, shape!.frame)), ...tokens.map(token => this.styled(token, scope))])]);
    for (const piece of rule.pattern!) if (piece.kind === 'capture' || piece.kind === 'operator') declare(piece.name, piece.kind === 'capture' ? piece.styles : [], shape?.groups.get(piece.kind === 'operator' ? '[' : '{'));
    impl.params?.forEach((name, k) => declare(name, impl.param_styles?.[k] ?? [], shape?.groups.get('{')));
    return scope;
  }
  given = new WeakMap<Node, Map<string, Node>>();
  stands = new WeakMap<Node, Map<string, Node>>();
  instances = new WeakMap<Node, Map<string, Set<Node>>>();
  override mark_given(body: Text.Node, given: Set<string>, frame: Node) {
    const inner = this.inner(body, frame) ?? body;
    const text = inner.source.value;
    for (let j = inner.begin; j <= inner.end;) {
      let end = text.indexOf('\n', j);
      if (end < 0 || end > inner.end + 1) end = inner.end + 1;
      const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
      if (chunks.length >= 2 && given.has(chunks[0].string) && this.decorates(chunks[1], frame)) {
        const table = chunks.length === 2 ? this.stands : this.given;
        let marks = table.get(frame);
        if (marks === undefined) table.set(frame, marks = new Map());
        marks.set(chunks[0].string, this.styled(chunks[1], frame)!);
      }
      j = end + 1;
    }
  }
  override mark_instance(receiver: Node | undefined, closure: Node) {
    if (!receiver?.ref || closure === this.GLOBAL) return;
    const scope = this.scope_of(receiver) ?? receiver.ref.scope;
    let table = this.instances.get(scope);
    if (table === undefined) this.instances.set(scope, table = new Map());
    let closures = table.get(receiver.ref.key);
    if (closures === undefined) table.set(receiver.ref.key, closures = new Set());
    closures.add(closure);
  }
  stands_for(closure: Node, name: string): Node | undefined {
    for (let scope: Node | undefined = closure; scope; scope = scope.parent) { const style = this.stands.get(scope)?.get(name); if (style) return style; }
  }
  names = new WeakMap<Node, Map<string, Node>>();
  values = new WeakMap<Node, Node[]>();
  mark_of(reference: Node): Node | undefined {
    const scope = this.scope_of(reference) ?? reference.ref!.scope;
    const key = reference.ref!.key;
    const named = reference.ref!.member ? undefined : this.names.get(scope)?.get(key);
    if (named !== undefined) return named;
    if (scope.given?.has(key)) {
      for (let closure = scope.parent; closure; closure = closure.parent) { const given = this.given.get(closure)?.get(key); if (given) return given; }
      return undefined;
    }
    const value = this.diagnostics.muted(() => this.safely(() => this.resolved(reference)));
    const marked = value === undefined ? undefined : this.values.get(value)?.at(-1) ?? value.marks?.at(-1);
    if (marked !== undefined) return marked;
    for (const closure of this.instances.get(scope)?.get(key) ?? []) { const style = this.stands_for(closure, 'this'); if (style) return style; }
  }
  override paint_reference(reference: Node, lexical: boolean = false) {
    if (!this.program?.serving || reference.position === undefined) return;
    const at = reference.position;
    if (!this.owns(at.source) || (!lexical && !this.probing && this.in_body(at))) return;
    const painted = at.span(at.begin, at.end);
    painted.style = () => this.style_name(reference.marks?.at(-1) ?? this.mark_of(reference));
    this.paints.push(painted);
  }
  override mark_value(value: Node, styles: Node[]) {
    let marks = this.values.get(value);
    if (marks === undefined) this.values.set(value, marks = []);
    for (const style of styles) if (!marks.some(mark => mark.style === style.style)) marks.push(style);
  }
  override mark_name(scope: Node, key: string, styles: Node[]) {
    let names = this.names.get(scope);
    if (names === undefined) this.names.set(scope, names = new Map());
    if (styles.length) names.set(key, styles.at(-1)!);
  }
  override probe_body(body: Text.Node, scope: Node) {
    if (!this.program?.serving || !this.owns(body.source)) return super.probe_body(body, scope);
    const frame = scope.parent!, text = body.source.value;
    const inner = this.inner(body, frame) ?? body;
    const declared = new Set<number>();
    for (let j = inner.begin; j <= inner.end;) {
      let end = text.indexOf('\n', j);
      if (end < 0 || end > inner.end + 1) end = inner.end + 1;
      const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
      if (chunks.length > 2 && /^[\p{L}_]/u.test(chunks[0].string) && this.decorates(chunks[1], frame)) {
        const name = chunks[0].string;
        if (!scope.own(name)) scope.set(name, this.placeholder());
        if (!scope.given?.has(name)) this.mark_name(scope, name, [this.styled(chunks[1], frame)!]);
        declared.add(chunks[0].begin);
        this.paint_reference(this.reference(scope, name, chunks[0]), true);
      }
      j = end + 1;
    }
    super.probe_body(body, scope);
    const skip = this.excluded(body, frame);
    for (const found of body.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) {
      const at = body.begin + found.index!, word = found[0];
      if (skip.some(([b, e]) => at >= b && at <= e) || this.prefixes.has(text[at - 1]) || declared.has(at)) continue;
      const span = body.span(at, at + word.length - 1);
      if (scope.lookup(word) !== undefined) { this.paint_reference(this.reference(scope, word, span), true); continue; }
      for (const [rule, impl] of [...this.chain(scope).operand, ...this.chain(scope).receiver].flat()) {
        if (impl.forward || this.head(rule) !== word) continue;
        this.paint(span, this.styled(impl.decorators?.at(-1), impl.closure ?? scope), scope, rule.key, { lexical: true });
        break;
      }
    }
  }

  colors(): Map<string, string> {
    if (this.palette && this.palette.theme === this.theme) return this.palette.colors;
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
    this.palette = { theme: this.theme, colors: out };
    return out;
  }
  color(name: string | undefined): string | undefined {
    if (name === undefined) return undefined;
    if (name.startsWith('#')) return name;
    const colors = this.colors();
    for (let n = name; n; n = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : '') { const color = colors.get(n); if (color) return color; }
  }

  feedback(src: Text.Source) {
    this.diagnostics.forget(src);
    this.paints = this.paints.filter(paint => paint.source.location !== src.location);
    this._interpret(src);
    this.analyze(src.location);
    this.painted++;
  }
  async interpret_async(srcs: Text.Source[], alive: () => boolean): Promise<boolean> {
    const run = this.derive(srcs);
    for (let step = run.next(); !step.done; step = run.next()) {
      await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
      if (!alive()) return false;
    }
    return true;
  }
}
