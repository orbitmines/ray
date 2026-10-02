import { env } from './env.ts';

export const EXTENSION = '.ray';

export namespace Global {
  export abstract class Node {
    abstract source: Source
  }
  export abstract class Source {
    location: string
    constructor(public relative_location?: string) { if (relative_location !== undefined) this.location = env.nodejs ? env.path.join(env.root, relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>
    abstract reload(): Promise<void>

    get dir() { return this.location.slice(0, this.location.lastIndexOf('/')); }
    get name() { return this.location?.slice(this.location.lastIndexOf('/') + 1) ?? ''; }
    get is_dot_project() { return this.location?.endsWith(`/.project${EXTENSION}`) ?? false; }
    get is_entrypoint() { return this.location?.endsWith(`.entrypoint${EXTENSION}`) ?? false; }
  }
}
export type Source = Text.Source;

export namespace Text {
  export function shift(before: string, after: string): { prefix: number; suffix: number; delta: number } {
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    return { prefix, suffix, delta: after.length - before.length };
  }

  export class Node extends Global.Node {

    static string(string: string) {
      const src = new Text.Source(); src.value = string;
      const node = new Text.Node(src);
      node.end = src.value.length - 1;
      return node; 
    }

    constructor(public source: Text.Source) { super(); }

    declare expression: Node
    begin_expression() {
      const expressions = this.source.expressions;
      let expression = expressions.get(this.cursor);
      if (!expression) expressions.set(this.cursor, expression = this.span(this.cursor, this.cursor));
      this.expression = expression;
    }
    end_expression() {
      this.expression.end = Math.max(this.expression.begin, this.cursor - 1);
    }

    cursor: number = 0;
    declare until?: number;
    declare from?: number;
    declare to?: number;

    declare color?: string
    declare style?: string | (() => string | undefined)
    declare of?: string
    declare defines?: string | (() => string | undefined)

    span(begin: number, end: number) {
      const span = new Node(this.source);
      span.cursor = begin;
      span.from = begin; span.to = end;
      span.expression = this.expression;
      return span;
    }

    get limit() { return this.until ?? this.source.value.length; }
    done() { return this.cursor >= this.limit; }
    peek(offset: number = 0) { const i = this.cursor + offset; return i >= 0 && i < this.limit ? this.source.value[i] : undefined; }
    advance(n: number = 1) { this.cursor += n; }
    at(literal: string) { return this.cursor + literal.length <= this.limit && this.source.value.startsWith(literal, this.cursor); }
    bounded(begin: number, until: number) {
      const cursor = this.copy();
      cursor.cursor = begin; cursor.until = until; cursor.from = cursor.to = undefined;
      return cursor;
    }

    get begin() { return this.from ?? this.cursor; }
    set begin(location: number) {
      if (this.from === undefined) this.to = this.cursor;
      this.from = location;
    }
    get end() { return this.to ?? this.cursor; }
    set end(location: number) {
      if (this.from === undefined) this.from = this.cursor;
      this.to = location;
    }

    get line(): number {
      if (this.cursor != null) return this.source.lineOf(this);
      return 1;
    }
    get col(): number {
      if (this.cursor != null) return this.source.colOf(this);
      return 1;
    }

    empty() { return this.from === undefined; }
    get string() {
      return this.empty() ? '' : this.source.value.slice(this.begin!, this.end! + 1);
    }

    copy() {
      const copy = new Node(this.source);
      copy.cursor = this.cursor;
      copy.until = this.until;
      copy.expression = this.expression;
      copy.from = this.from; copy.to = this.to;
      copy.color = this.color;
      return copy;
    }
  }
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; this.expressions = new Map(); this._newlines = undefined; }
    get loaded(): boolean { return this._value !== undefined; }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      await this.reload();
    }
    async reload(): Promise<void> {
      this.value = env.nodejs
        ? await env.fs.promises.readFile(this.location, 'utf-8')
        : await (await fetch(new URL(this.location))).text()
      this.expressions = new Map();
      this._newlines = undefined;
    }

    expressions: Map<number, Node> = new Map();

    private _newlines?: number[];
    get newlines(): number[] {
      if (this._newlines) return this._newlines;
      const arr: number[] = [];
      const s = this.value;
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) arr.push(i);
      return this._newlines = arr;
    }

    // How many newlines come before a place: the line it is on, and where the
    // line it is on begins, are both read off that one count.
    private preceding(cursor: number): number {
      const nls = this.newlines;
      let lo = 0, hi = nls.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (nls[mid] < cursor) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    lineOf(position: Node): number { return this.preceding(position.cursor ?? 0) + 1; }

    colOf(position: Node): number {
      const cursor = position.cursor ?? 0, lo = this.preceding(cursor);
      return lo === 0 ? cursor + 1 : cursor - this.newlines[lo - 1];
    }

    line(lineNo: number): Node {
      const nls = this.newlines;
      const begin = lineNo === 0 ? 0 : nls[lineNo - 1] + 1;
      const end = nls[lineNo] ?? this.value.length;
      const n = new Node(this);
      if (end > begin) { n.from = begin; n.to = end - 1; }
      else n.cursor = begin;
      return n;
    }

    get lines(): Iterable<[Node, number]> {
      const self = this, count = this.newlines.length + 1;
      return (function* () { for (let i = 0; i < count; i++) yield [self.line(i), i]; })();
    }
  }
}
