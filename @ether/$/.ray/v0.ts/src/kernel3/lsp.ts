import { Text } from './text.ts';
import { Interpreter, Node, type Match } from './interpreter.ts';

export class Served extends Interpreter {
  paints: Text.Node[] = [];
  painted = 0;
  sites: Map<string, Text.Node> = new Map();
  palette?: { theme?: Node; colors: Map<string, string> };

  override site_at(key: string, at?: Text.Node) { if (at !== undefined) this.sites.set(key, at); }
  override begin_pass() { this.paints = []; this.sites = new Map(); }
  override end_pass() { this.painted++; }

  override paint(span: Text.Node, style: Node | undefined, frame: Node, of?: string) {
    if (!this.program?.serving || !this.owns(span.source) || style === undefined) return;
    const painted = span.span(span.begin, span.end);
    painted.style = () => style.style;
    painted.of = of;
    this.paints.push(painted);
  }
  override painted_application(rule: Node, impl: Node, match: Match, captures: Map<string, Node>, cursor: Text.Node, frame: Node) {
    const style = this.values.get(impl)?.at(-1);
    if (style !== undefined) for (const [, from, to] of match.literals) this.paint(cursor.span(from, to), style, frame, rule.key);
  }
  override style_of(value: Node): string | undefined { return this.values.get(value)?.at(-1)?.style; }
  names = new WeakMap<Node, Map<string, Node>>();
  values = new WeakMap<Node, Node[]>();
  mark_of(reference: Node): Node | undefined {
    const scope = this.scope_of(reference) ?? reference.ref!.scope;
    const key = reference.ref!.key;
    const named = reference.ref!.member ? undefined : this.names.get(scope)?.get(key);
    if (named !== undefined) return named;
    const value = this.diagnostics.muted(() => this.safely(() => this.resolved(reference)));
    const marked = value === undefined ? undefined : this.values.get(value)?.at(-1) ?? value.marks?.at(-1);
    return marked;
  }
  override paint_reference(reference: Node) {
    if (!this.program?.serving || reference.position === undefined) return;
    const at = reference.position;
    if (!this.owns(at.source)) return;
    const painted = at.span(at.begin, at.end);
    painted.style = () => (reference.marks?.at(-1) ?? this.mark_of(reference))?.style;
    this.paints.push(painted);
  }
  override mark_value(value: Node, styles: Node[]) {
    const at = value.literal ? value.position : value.lazy !== undefined && value.value === undefined ? value.lazy.span : undefined;
    if (at !== undefined) this.paint(at, styles.at(-1), this.GLOBAL);
    if (this.probing) return;
    let marks = this.values.get(value);
    if (marks === undefined) this.values.set(value, marks = []);
    for (const style of styles) if (!marks.some(mark => mark.style === style.style)) marks.push(style);
  }
  override mark_name(scope: Node, key: string, styles: Node[]) {
    let names = this.names.get(scope);
    if (names === undefined) this.names.set(scope, names = new Map());
    if (styles.length) names.set(key, styles.at(-1)!);
  }
  override alias(name: string, value: Node | undefined) {
    if (value?.style === undefined) return;
    const table = this.building ?? (this.theme ??= Object.assign(new Node(this.diagnostics), { theme: new Map<string, string>() }));
    table.theme!.set(name, value.style);
    this.palette = undefined;
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
