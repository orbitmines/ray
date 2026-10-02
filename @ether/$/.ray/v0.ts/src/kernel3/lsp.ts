import { Text, EXTENSION } from './text.ts';
import { Analysed } from './analysis.ts';
import { Interpreter, Node, Count, each, describe, type Piece, type Match, type Mark, type Marks, type Group, type Shape } from './interpreter.ts';

// What the language server needs on top of reading: what each span is
// painted as and what it defines, the marks that decide it, the theme's
// colors, and keeping it all in place while a source is edited.
export class Served extends Analysed {
  paints: Text.Node[] = [];
  painted = 0;
  marks: Marks = Served.marks();
  sites: Map<string, Text.Node> = new Map();
  override site_at(key: string, at?: Text.Node) { const span = at ?? this.site_of(); if (span !== undefined) this.sites.set(key, span); }
  override begin_pass(pass: number) {
    this.painting = [];
    this.marking = this.copy_of !== undefined ? this.inherited() : pass === 0 && !this.began ? this.marking : Served.marks();
    this.referenced = new Map(); this.verbatim = new Map(); this.sites = new Map();
  }
  override end_pass() { this.painting = this.unretired(); }
  paint_name(token: Text.Node, frame: Node) {
    const probe = this.cursor_of(token);
    const name = this.name(probe, frame);
    if (name !== undefined) this.paint_reference(this.reference(frame, name, token.span(token.begin, token.begin + name.length - 1)));
  }
  paint_words(span: Text.Node, scope: Node) {
    const text = span.source.value;
    for (const found of span.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*|[^\s\p{L}\p{N}_(){}\[\]`,.]+/gu)) {
      const at = span.begin + found.index!;
      if (this.prefixes.has(text[at - 1])) continue;
      const reference = this.reference(scope, found[0], span.span(at, at + found[0].length - 1));
      if (this.resolved(reference) !== undefined) this.paint_reference(reference, true);
    }
  }
  paint_group(content: Text.Node, scope: Node, of: string, shape?: Shape, opts: { operator?: boolean; group?: Group } = {}) {
    const tokens = this.tokens(content, scope);
    const decorators = tokens.filter(token => this.decorates(token, scope));
    decorators.forEach(token => this.paint_decorator(token, scope));
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
    const last = words[words.length - 1];
    const name = last && !grouped(last.string) ? words.pop() : undefined;
    if (!name && last) types.unshift(words.pop()!);
    for (const word of words) this.paint_words(word, scope);
    if (name) {
      const t = name.string;
      if (/^`[^`]*`$/.test(t)) {
        this.sample(name, scope);
        if (t.length > 2) for (const decorator of decorators) this.paint(name.span(name.begin + 1, name.end - 1), decorator, scope, of);
      } else if (/^[\p{L}_]/u.test(t)) {
        const reference = this.reference(scope, t, name);
        if (this.resolved(reference) !== undefined) this.paint_reference(reference, true);
        else {
          if (shape) for (const style of opts.group?.content ?? []) this.paint(name, style, shape.frame, of);
          for (const decorator of decorators) this.paint(name, decorator, scope, of);
        }
      }
    }
    if (!opts.operator) for (const type of types) if (!type.empty() && type.begin <= type.end) this.paint_type(type, scope, of);
  }
  paint_type(span: Text.Node, scope: Node, of: string) {
    this.probe(span, scope, { report: true });
  }
  paint_rule(word: string, span: Text.Node, scope: Node) {
    if (this.raw_argument(span, scope)) return;
    const spans = this.verbatim.get(span.source.location ?? '');
    if (spans !== undefined) for (const [begin, end] of spans) if (span.begin >= begin && span.end <= end) return;
    for (const [rule, impl] of each([...this.chain(scope).operand, ...this.chain(scope).receiver])) {
      if (impl.forward || this.head(rule) !== word) continue;
      const painted = span.span(span.begin, span.end);
      painted.of = rule.key;
      painted.defines = `rule::${rule.key}`;
      painted.style = () => {
        const current = (impl.closure ?? this.GLOBAL).methods?.get(rule) ?? impl;
        for (let k = (current.decorators?.length ?? 0) - 1; k >= 0; k--) {
          const style = this.safely(() => this.style_of(current.decorators![k], impl.closure ?? scope))?.style;
          if (style) return style;
        }
        return undefined;
      };
      this.record(painted);
      return;
    }
  }
  raw_argument(span: Text.Node, scope: Node): boolean {
    const text = span.source.value;
    let j = span.begin - 1;
    while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
    const end = j;
    while (j >= 0 && /[\p{L}\p{N}_-]/u.test(text[j])) j--;
    const word = text.slice(j + 1, end + 1);
    return word.length > 0 && scope.lookup(word)?.reads !== undefined;
  }
  unretired(): Text.Node[] {
    const recorded = this.recorded;
    if (recorded?.of !== this.painting || recorded.retired.size === 0) return this.painting;
    const kept = this.painting.filter(painted => !recorded.retired.has(painted));
    this.recorded = { of: kept, at: recorded.at, retired: new Set() };
    return kept;
  }
  recorded?: { of: Text.Node[]; at: Map<string, Text.Node>; retired: Set<Text.Node> };
  mark_of(node: Node, definition: boolean = false): Node | undefined {
    const scope = this.scope_of(node) ?? node.ref!.scope;
    const key = node.ref!.key;
    const mark = node.ref!.member ? undefined : this.live(this.marks.names.get(scope)?.get(key));
    if (mark) return mark;
    if (scope.given?.has(key)) {
      for (let closure = scope.parent; closure; closure = closure.parent) {
        const given = this.live(this.marks.given.get(closure)?.get(key));
        if (given) return given();
      }
      return undefined;
    }
    if (!definition) {
      const value = this.resolved(node);
      let under = value;
      while (under instanceof Count) under = this.resolved(under.base);
      for (const entry of [...((under && this.marks.values.get(under))?.values() ?? [])].reverse()) {
        if (entry.except?.some(([owner, name]) => owner === scope && name === key)) continue;
        const mark = this.live(entry);
        if (mark) return mark;
      }
    }
    for (const entry of this.marks.instances.get(scope)?.get(key)?.values() ?? []) {
      const closure = this.live(entry);
      const style = closure && this.stands_for(closure, 'this');
      if (style) return style;
    }
    return undefined;
  }
  stands_for(closure: Node, name: string): Node | undefined {
    for (let scope: Node | undefined = closure; scope; scope = scope.parent) {
      const style = this.live(this.marks.stands.get(scope)?.get(name));
      if (style) return style();
    }
    return undefined;
  }
  binding(node: Node): string | undefined {
    const scope = this.scope_of(node) ?? node.ref!.scope;
    return `${scope === this.GLOBAL ? 'GLOBAL' : scope.key}::${node.ref!.key}`;
  }
  entry<T>(mark: T): Mark<T> { return { mark, by: this.statements[0]?.source.location, epoch: this.epoch }; }
  live<T>(entry: Mark<T> | undefined): T | undefined {
    return entry && (entry.by === undefined || entry.epoch >= (this.stale.get(entry.by) ?? 0)) ? entry.mark : undefined;
  }
  inherited(): Marks {
    const marks = Served.marks(), source = this.copy_of!.marks;
    for (const [scope, entries] of source.names) { const of = this.seen.get(scope); if (of) marks.names.set(of, new Map(entries)); }
    return marks;
  }
  style_of(token: Text.Node, frame: Node): Node | undefined {
    this.quiet++;
    try { return this.diagnostics.muted(() => this.style_at(token, frame)); }
    finally { this.quiet--; }
  }
  style_at(token: Text.Node, frame: Node): Node | undefined {
    const probe = this.cursor_of(token);
    for (const [rule, impl] of each(this.candidates(undefined, frame))) {
      if (!impl.forward || !rule.pattern!.some(x => x.kind === 'capture')) continue;
      const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
      if (!match || match.end < probe.limit) continue;
      const head = this.head(rule);
      const real = head !== undefined ? this.resolved(this.reference(frame, head, token)) : undefined;
      if (!real?.callable) return undefined;
      let style: Node | undefined = real;
      for (const piece of rule.pattern!) {
        const span = piece.kind === 'capture' ? match.captures.get(piece.name) : undefined;
        if (span && style) style = this.call(style, this.lazy(span, frame, true), token, frame);
      }
      return style;
    }
    const name = this.name(probe, frame);
    const head = name !== undefined ? this.resolved(this.reference(frame, name, token)) : undefined;
    const rest = token.begin + (name?.length ?? 0);
    if (head?.fn && rest <= token.end && this.claim(probe, rest, frame) === token.end + 1) {
      const inner = this.inner(token.span(rest, token.end), frame);
      const argument = inner && this.deref(this.lazy(inner, frame, false), false);
      const styled = argument && this.call(head, argument, token, frame);
      return styled?.style !== undefined ? styled : undefined;
    }
    const value = this.resolved(this.expression(probe, frame, !/\s/.test(token.string)));
    return value?.style !== undefined ? value : undefined;
  }
  lazy_style(token: Text.Node, frame: Node): Node {
    const node = new Node(this.diagnostics, token);
    Object.defineProperty(node, 'style', { get: () => this.safely(() => this.style_of(token, frame))?.style });
    return node;
  }
  fallback(styles: Node[]): Node {
    const node = new Node(this.diagnostics);
    Object.defineProperty(node, 'style', { get: () => { for (let k = styles.length - 1; k >= 0; k--) { const style = styles[k].style; if (style) return style; } return undefined; } });
    return node;
  }
  sample(token: Text.Node, frame: Node) {
    this.diagnostics.muted(() => this.safely(() => this.expression(this.cursor_of(token), frame, true)));
  }
  forwarded(token: Text.Node, frame: Node): boolean {
    const probe = this.cursor_of(token);
    return this.candidates(undefined, frame).some(segment => segment.some(([rule, impl]) => {
      if (!impl.forward || !rule.pattern!.some(x => x.kind === 'capture')) return false;
      const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
      return match !== undefined && match.end >= probe.limit;
    }));
  }
  site(token: Text.Node, frame: Node) {
    if (!this.forwarded(token, frame)) return;
    this.diagnostics.muted(() => this.safely(() => this.expression(this.cursor_of(token), frame, true)));
  }
  colors(): Map<string, string> {
    if (this.palette && this.palette.theme === this.theme) return this.palette.colors;
    const table = this.theme?.theme ?? new Map<string, string>();
    const out = new Map<string, string>();
    const resolve = (name: string, seen: Set<string> = new Set()): string | undefined => {
      if (name.startsWith('#')) return name;
      if (seen.has(name)) return undefined;
      seen.add(name);
      const next = table.get(name);
      if (next !== undefined) return resolve(next, seen);
      const dot = name.lastIndexOf('.');
      return dot > 0 ? resolve(name.slice(0, dot), seen) : undefined;
    };
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
  palette?: { theme?: Node; colors: Map<string, string> };
  reanchor(location: string, before: string, after: string) {
    const { prefix, suffix, delta } = Text.shift(before, after);
    if (delta === 0) return;
    const pattern = new RegExp(`(${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:)(\\d+)$`);
    for (const owner of [this.GLOBAL, ...this.frames.values()]) {
      if (!owner.children) continue;
      const moved = new Map<string, Node>();
      for (const [key, frame] of owner.children) {
        const found = key.match(pattern);
        const offset = found ? Number(found[2]) : undefined;
        const shifted = offset === undefined ? undefined : offset < prefix ? offset : offset >= before.length - suffix ? offset + delta : undefined;
        moved.set(shifted === undefined ? key : key.replace(pattern, `$1${shifted}`), frame);
      }
      owner.children = moved;
    }
  }
  feedback(src: Text.Source) {
    this.diagnostics.forget(src);
    const keep = (paint: Text.Node) => paint.by !== undefined ? paint.by !== src.location : paint.source.location !== src.location;
    this.paints = this.painting = this.paints.filter(keep);
    this.marking = this.marks;
    this.stale.set(src.location, ++this.epoch);
    this.referenced = new Map([...this.referenced].filter(([, painted]) => keep(painted)));
    this.sited = new Map([...this.sited].filter(([, by]) => by !== src.location));
    for (const source of [...this.claims.keys()]) if (source.location === src.location) this.claims.delete(source);
    this.pending_rewrites = this.pending_rewrites.filter(([rule]) => rule.position?.source.location !== src.location);
    this.forwards = this.forwards.filter(rule => rule.position?.source.location !== src.location);
    this.deferred = this.deferred.filter(node => node.lazy!.span.source.location !== src.location);
    this._interpret(src);
    this.analyze(src.location);
    this.painted++;
  }
  async interpret_async(srcs: Text.Source[], alive: () => boolean): Promise<boolean> {
    const run = this.derive(srcs);
    for (let step = run.next(); !step.done; step = run.next()) {
      await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
      if (!alive()) { this.painting = this.paints; this.marking = this.marks; return false; }
    }
    return true;
  }
  derived = new Map<string, string>();
  edits = new WeakMap<Text.Source, { prefix: number; suffix: number; delta: number } | null>();
  referenced = new Map<string, Text.Node>();
  verbatim = new Map<string, Map<number, number>>();
  epoch = 0;
  stale = new Map<string, number>();
  decorators_of(rule: Node, impl: Node): () => Text.Node[] { return () => this.current(rule, impl).decorators ?? []; }
  param_styles_of(rule: Node, impl: Node, k: number): () => Text.Node[] { return () => this.current(rule, impl).param_styles?.[k] ?? []; }
  piece_styles(rule: Node, p: number): () => Text.Node[] {
    return () => { const piece = rule.pattern![p]; return piece?.kind === 'capture' ? piece.styles : piece?.kind === 'literal' ? piece.styles ?? [] : []; };
  }
  current(rule: Node, impl: Node): Node { return (impl.closure ?? this.GLOBAL).methods?.get(rule) ?? impl; }
  paint_decorator(token: Text.Node, scope: Node) {
    this.site(token, scope);
    this.paint_name(token, scope);
    const name = this.name(this.cursor_of(token), scope);
    const rest = name === undefined ? undefined : token.span(token.begin + name.length, token.end);
    if (rest && rest.begin <= rest.end && /^[\s(]/.test(rest.string)) this.paint_words(rest, scope);
  }
  site_of(): Text.Node | undefined {
    for (let k = this.statements.length - 1; k >= 0; k--) if (!this.in_body(this.statements[k])) return this.statements[k];
    return this.statements[0];
  }
  painting: Text.Node[] = this.paints;
  marking = this.marks;
  static marks(): Marks { return { names: new Map(), values: new WeakMap(), given: new Map(), stands: new Map(), instances: new WeakMap() }; }
  override paint(span: Text.Node, decorator: Text.Node | Node | undefined | (() => (Text.Node | Node)[]), frame: Node, of?: string, opts: { head?: boolean; role?: string } = {}) {
    if (!this.program?.serving) return;
    if (!this.owns(span.source) || (!this.probing && this.in_body(span))) return;
    const painted = span.span(span.begin, span.end);
    painted.of = of;
    painted.head = opts.head;
    painted.role = opts.role;
    if (decorator === undefined) { painted.style = ''; this.record(painted); return; }
    const resolve = (token: Text.Node | Node) => (token instanceof Node ? token : this.safely(() => this.style_of(token, frame)))?.style;
    painted.style = typeof decorator !== 'function' ? () => resolve(decorator) : () => {
      const tokens = decorator();
      for (let k = tokens.length - 1; k >= 0; k--) { const style = resolve(tokens[k]); if (style) return style; }
      return undefined;
    };
    this.record(painted);
  }
  override paint_reference(reference: Node, lexical: boolean = false, definition: boolean = false) {
    if (!this.program?.serving) return;
    const at = reference.position;
    if (!at || !this.owns(at.source)) return;
    if (!lexical && !this.probing && this.in_body(at)) return;
    const key = `${at.source.location}:${at.begin}:${at.end}`;
    const style = () => this.mark_of(reference, definition)?.style;
    const existing = this.referenced.get(key);
    if (existing) { if (lexical) existing.style = style; return; }
    const painted = at.span(at.begin, at.end);
    painted.style = style;
    painted.defines = () => this.binding(reference);
    this.referenced.set(key, painted);
    this.record(painted);
  }
  override paint_head(rule: Node, match: Match, cursor: Text.Node, frame: Node) {
    const first = match.literals[0];
    if (!first) return;
    const [p, begin, end] = first;
    const head = (rule.pattern![p] as { text: string }).text.trim();
    if (!head || /\s/.test(head) || frame.lookup(head) === undefined) return;
    const at = cursor.source.value.indexOf(head, begin);
    if (at < 0 || at + head.length - 1 > end) return;
    this.paint_reference(this.reference(frame, head, cursor.span(at, at + head.length - 1)));
  }
  override paint_definition(chunks: Text.Node[], decorators: Text.Node[], scope: Node, of: string, opts: { arrow?: Text.Node; params?: Text.Node[]; types?: Text.Node[]; styles?: Text.Node[]; pieces?: Piece[] } = {}) {
    if (!this.program?.serving) return;
    const shape = this.shape(scope.parent ?? scope);
    if (shape && opts.arrow) for (const style of shape.arrow) this.paint(opts.arrow, style, shape.frame, of);
    for (const decorator of [...decorators, ...(opts.styles ?? [])]) this.paint_decorator(decorator, scope);
    for (const name of opts.params ?? []) this.paint_reference(this.reference(scope, name.string, name), true);
    for (const type of opts.types ?? []) this.paint_type(type, scope, of);
    const operators = new Set((opts.pieces ?? []).flatMap(piece => piece.kind === 'operator' ? [piece.group.begin] : []));
    for (const chunk of chunks) {
      const text = chunk.source.value, end = chunk.end + 1;
      let run = -1;
      const flush = (j: number) => {
        if (run < 0) return;
        const span = chunk.span(run, j - 1);
        if (shape) for (const style of shape.text) this.paint(span, style, shape.frame, of);
        for (const decorator of decorators) this.paint(span, decorator, scope, of);
        this.paint_words(span, scope);
        run = -1;
      };
      for (let j = chunk.begin; j < end;) {
        // What groups a pattern is what the grammar rule writes down: the
        // openings it spells, and the operator groups already found.
        if (shape?.groups.has(text[j]) || operators.has(j)) {
          flush(j);
          const close = this.group_end(text, j, end);
          const group = shape?.groups.get(text[j]);
          if (shape && group) {
            for (const style of group.open) this.paint(chunk.span(j, j), style, shape.frame, of);
            for (const style of group.close) this.paint(chunk.span(close - 1, close - 1), style, shape.frame, of);
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
  override record(painted: Text.Node) {
    if (!this.program?.serving) return;
    if (this.quiet) return;
    painted.by = this.statements[0]?.source.location;
    if (painted.role !== undefined) {
      if (this.recorded?.of !== this.painting) this.recorded = { of: this.painting, at: new Map(), retired: new Set() };
      const key = `${painted.source.location}:${painted.begin}:${painted.end}:${painted.head}:${painted.role}:${painted.of?.replace(/#\d+/g, '#')}`;
      const before = this.recorded.at.get(key);
      if (before !== undefined && before !== painted) { before.style = before.defines = undefined; this.recorded.retired.add(before); }
      this.recorded.at.set(key, painted);
      if (this.recorded.retired.size > 4096 && this.recorded.retired.size * 2 > this.painting.length) this.painting = this.unretired();
    }
    this.painting.push(painted);
  }
  override mark_value(value: Node, styles: Node[], sources: Node[] = []) {
    let marks = this.marking.values.get(value);
    if (!marks) this.marking.values.set(value, marks = new Map());
    const except = sources.flatMap(source => source.ref ? [[this.scope_of(source) ?? source.ref.scope, source.ref.key] as [Node, string]] : []);
    for (const style of styles) if (!this.live(marks.get(style.style!))) marks.set(style.style!, { ...this.entry(style), except });
  }
  override mark_name(scope: Node, key: string, styles: Node[]) {
    let marks = this.marking.names.get(scope);
    if (!marks) this.marking.names.set(scope, marks = new Map());
    marks.set(key, this.entry(styles[styles.length - 1]));
  }
  override mark_instance(receiver: Node | undefined, closure: Node) {
    if (!receiver?.ref || closure === this.GLOBAL) return;
    const scope = this.scope_of(receiver) ?? receiver.ref.scope;
    let table = this.marking.instances.get(scope);
    if (!table) this.marking.instances.set(scope, table = new Map());
    let closures = table.get(receiver.ref.key);
    if (!closures) table.set(receiver.ref.key, closures = new Map());
    closures.set(closure, this.entry(closure));
  }
  override mark_given(body: Text.Node, given: Set<string>, frame: Node) {
    const inner = this.inner(body, frame) ?? body;
    const text = inner.source.value;
    for (let j = inner.begin; j <= inner.end;) {
      let end = text.indexOf('\n', j);
      if (end < 0 || end > inner.end + 1) end = inner.end + 1;
      const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
      if (chunks.length >= 2 && given.has(chunks[0].string) && this.decorates(chunks[1], frame)) {
        const decorator = chunks[1];
        const table = chunks.length === 2 ? this.marking.stands : this.marking.given;
        let marks = table.get(frame);
        if (!marks) table.set(frame, marks = new Map());
        marks.set(chunks[0].string, this.entry(() => this.safely(() => this.style_of(decorator, frame))));
      }
      j = end + 1;
    }
  }
  override alias(name: string, value: Node | undefined) {
    if (value?.style === undefined) return;
    const statement = this.site_of();
    if (statement) this.sites.set(`theme::${name}`, statement);
    const table = this.building ?? (this.theme ??= Object.assign(new Node(this.diagnostics), { theme: new Map<string, string>() }));
    table.theme!.set(name, value.style);
    this.palette = undefined;
  }
  override anchor(at: Text.Node): string {
    const source = at.source, base = this.derived.get(source.location);
    let edit = this.edits.get(source);
    if (edit === undefined) {
      const now = source.value;
      edit = null;
      if (base !== undefined && base !== now) edit = Text.shift(base, now);
      this.edits.set(source, edit);
    }
    if (!edit || at.begin < edit.prefix) return `${source.location}:${at.begin}`;
    if (at.begin >= source.value.length - edit.suffix) return `${source.location}:${at.begin - edit.delta}`;
    return `${source.location}:~${at.begin}`;
  }
  override painted_application(rule: Node, impl: Node, match: Match, captures: Map<string, Node>, cursor: Text.Node, frame: Node, at: Text.Node) {
    if (!this.program?.serving) return;
    if (impl.defines) return;
    this.paint(at, undefined, frame, rule.key, { role: 'application' });
    this.paint_head(rule, match, cursor, frame);
    const styling = new Node(this.diagnostics);
    styling.parent = impl.closure ?? frame;
    styling.given = new Set(captures.keys());
    for (const [name, node] of captures) styling.set(name, node);
    const heads = match.literals.map(([, b, e]) => cursor.span(b, e));
    const owned = [...heads, ...rule.pattern!.flatMap(piece => piece.kind === 'capture' && piece.raw && match.captures.has(piece.name) ? [match.captures.get(piece.name)!] : [])];
    for (const piece of rule.pattern!) {
      if (piece.kind !== 'capture' || !piece.raw) continue;
      const span = match.captures.get(piece.name);
      if (!span || span.empty()) continue;
      const location = span.source.location ?? '';
      let spans = this.verbatim.get(location);
      if (!spans) this.verbatim.set(location, spans = new Map());
      if ((spans.get(span.begin) ?? -1) < span.end) spans.set(span.begin, span.end);
    }
    for (const span of owned) this.paint(span, this.decorators_of(rule, impl), styling, rule.key, { head: heads.includes(span), role: 'decorators' });
    for (const [p, b, e] of match.literals) this.paint(cursor.span(b, e), this.piece_styles(rule, p), styling, rule.key, { head: true, role: `literal ${p}` });
    rule.pattern!.forEach((piece, p) => {
      if (piece.kind !== 'capture') return;
      const span = match.captures.get(piece.name) ?? (p === 0 ? match.receiver?.position : undefined);
      if (span) this.paint(span, this.piece_styles(rule, p), styling, rule.key, { role: `capture ${p}` });
    });
    match.args.forEach((span, k) => this.paint(span, this.param_styles_of(rule, impl, k), styling, rule.key, { role: `argument ${k}` }));
  }
  override painted_forward(pattern: Text.Node, frame: Node, rule: Node, impl: Node, pieces: Piece[], key: string) {
    if (!this.program?.serving) return;
    const painting = this.probing > 0 || (this.owns(pattern.source) && !this.in_body(pattern) && this.first_site(pattern));
    if (painting) this.paint_definition(this.chunks(pattern), [], this.definition_scope(frame, rule, impl), key, { pieces });
    const head = pieces[0]?.kind === 'literal' ? pieces[0].text.trim() : '';
    const at = head ? pattern.source.value.indexOf(head, pattern.begin) : -1;
    if (painting && at >= 0 && at <= pattern.end) {
      const span = pattern.span(at, at + head.length - 1);
      if (!/\s/.test(head) && pieces.some(piece => piece.kind === 'capture') ? frame.lookup(head) !== undefined : /^[\p{L}_]/u.test(head)) this.paint_reference(this.reference(frame, head, span), true);
      else if (!pieces.some(piece => piece.kind === 'capture')) {
        const painted = span.span(span.begin, span.end);
        painted.of = key;
        painted.style = () => {
          for (const [rule, impl] of each([...this.chain(frame).receiver, ...this.chain(frame).operand])) {
            if (impl.forward || this.head(rule) !== head || !impl.decorators?.length) continue;
            return this.safely(() => this.style_of(impl.decorators![0], impl.closure ?? frame))?.style;
          }
        };
        if (this.owns(span.source)) this.record(painted);
      }
    }
  }
  override probe_body(body: Text.Node, scope: Node) {
    const frame = scope.parent!;
    const inner = this.inner(body, frame) ?? body;
    const text = inner.source.value;
    const declared: Text.Node[] = [];
    for (let j = inner.begin; j <= inner.end;) {
      let end = text.indexOf('\n', j);
      if (end < 0 || end > inner.end + 1) end = inner.end + 1;
      const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
      if (chunks.length >= 2 && /^[\p{L}_]/u.test(chunks[0].string) && this.decorates(chunks[1], frame)) {
        const name = chunks[0].string;
        if (chunks.length > 2 && !scope.own(name)) scope.set(name, this.placeholder());
        if (chunks.length > 2 && !scope.given?.has(name)) this.mark_name(scope, name, [this.lazy_style(chunks[1], frame)]);
        declared.push(chunks[0]);
      }
      j = end + 1;
    }
    for (const token of declared) this.paint_reference(this.reference(scope, token.string, token), true, true);
    super.probe_body(body, scope);
    const skip = this.excluded(body, frame);
    const outside = (at: number) => !skip.some(([b, e]) => at >= b && at <= e);
    const definitions = new Set(declared.map(token => token.begin));
    for (const found of body.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) {
      const at = body.begin + found.index!, word = found[0];
      if (!outside(at) || this.prefixes.has(text[at - 1]) || definitions.has(at)) continue;
      const span = body.span(at, at + word.length - 1);
      if (scope.lookup(word) === undefined) { this.paint_rule(word, span, scope); continue; }
      this.paint_reference(this.reference(scope, word, span), true);
    }
  }
  override definition_scope(frame: Node, rule: Node, impl: Node): Node {
    const scope = super.definition_scope(frame, rule, impl);
    const named = rule.pattern!.flatMap(piece => piece.kind === 'capture' || piece.kind === 'operator' ? [piece] : []);
    const shape = this.shape(frame);
    const declare = (name: string, tokens: Text.Node[], group?: Group) => this.mark_name(scope, name, [this.fallback([...(group?.content ?? []).map(token => this.lazy_style(token, shape!.frame)), ...tokens.map(token => this.lazy_style(token, scope))])]);
    for (const piece of named) declare(piece.name, piece.kind === 'capture' ? piece.styles : [], shape?.groups.get(piece.kind === 'operator' ? '[' : '{'));
    impl.params?.forEach((name, k) => declare(name, impl.param_styles?.[k] ?? [], shape?.groups.get('{')));
    return scope;
  }
  override derived_all(srcs: Text.Source[]) {
    this.painted++;
    this.paints = this.painting = this.unretired();
    this.marks = this.marking;
    this.stale = new Map();
    for (const src of srcs) {
      const before = this.derived.get(src.location);
      if (before !== undefined && before !== src.value) this.reanchor(src.location, before, src.value);
      this.derived.set(src.location, src.value);
    }
  }
  override registered(frame: Node) {
    const site = frame.site ?? (frame.apply_site !== undefined ? this.site_name(frame.apply_site) : undefined);
    if (frame.owner !== undefined && site !== undefined) (frame.owner.children ??= new Map()).set(site, frame);
  }
  override enter_frame(frame: Node, rule: Node, at: Text.Node) { frame.apply_site = this.applied_at(rule, at); }
  override leave_frame(frame: Node) { this.left(frame.apply_site); }
  entering = new WeakMap<Node, WeakMap<Text.Source, Map<number, number>>>();
  applied_at(rule: Node, at: Text.Node): { rule: Node; at: Text.Node; depth: number } {
    let by = this.entering.get(rule);
    if (by === undefined) this.entering.set(rule, by = new WeakMap());
    let at_source = by.get(at.source);
    if (at_source === undefined) by.set(at.source, at_source = new Map());
    const depth = at_source.get(at.begin) ?? 0;
    at_source.set(at.begin, depth + 1);
    return { rule, at, depth };
  }
  left(applied: { rule: Node; at: Text.Node; depth: number } | undefined) {
    if (applied === undefined) return;
    const by = this.entering.get(applied.rule)?.get(applied.at.source), held = by?.get(applied.at.begin) ?? 1;
    if (held <= 1) by?.delete(applied.at.begin); else by!.set(applied.at.begin, held - 1);
  }
  site_name(applied: { rule: Node; at: Text.Node; depth: number }): string {
    const site = `${applied.rule.key}@${this.anchor(applied.at)}`;
    return applied.depth > 0 ? `${site}#${applied.depth}` : site;
  }

}
