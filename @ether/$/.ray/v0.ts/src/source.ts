import { env } from "./node.js.ts";

namespace Global {
  export interface Source {
    location?: string
    load(): Promise<void>
    // save(): void
  }
  export interface Node {
    source: Source;
  }
}
export type Source = Global.Source;
export type Node = Global.Node;

export namespace Text {
  export class Source implements Global.Source {
    
    constructor(private _value?: string, public location?: string) {}

    get value(): string {
      if (this._value === undefined)
        throw new Error(`Source '${this.location ?? ''}' not loaded — call await source.load() first.`);
      return this._value;
    }
    set value(value: string) { this._value = value; }

    async load(): Promise<void> {
      if (this._value !== undefined) return;   // already have a value (e.g. in-memory String.add)
      if (!this.location) throw new Error('Source has neither value nor location.');
      let url: URL | undefined;
      try { url = new URL(this.location); } catch {}
      this._value = url
        ? await (await fetch(url)).text()
        : await env.fs.promises.readFile(this.location, 'utf-8');
    }

    static readonly EMPTY = new Source('');

    private _newlines?: number[];
    get newlines(): number[] {
      if (this._newlines) return this._newlines;
      const arr: number[] = [];
      const s = this.value;
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) arr.push(i);
      return this._newlines = arr;
    }

    lineOf(position: Text.Node): number {
      const cursor = position.cursor ?? 0;
      const nls = this.newlines;
      let lo = 0, hi = nls.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (nls[mid] < cursor) lo = mid + 1;
        else hi = mid;
      }
      return lo + 1;
    }

    colOf(position: Text.Node): number {
      const cursor = position.cursor ?? 0;
      const nls = this.newlines;
      let lo = 0, hi = nls.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (nls[mid] < cursor) lo = mid + 1;
        else hi = mid;
      }
      return lo === 0 ? cursor + 1 : cursor - nls[lo - 1];
    }

    /** A node spanning line `lineNo` (0-based): the line's content with an
     *  inclusive `end` (like every other node), or an empty node at the line
     *  start for a blank line. So `.string` is the line text, sans newline. */
    line(lineNo: number): Text.Node {
      const nls = this.newlines;
      const begin = lineNo === 0 ? 0 : nls[lineNo - 1] + 1;
      const end = nls[lineNo] ?? this.value.length;   // newline / EOF, exclusive
      const n = new Node();
      n.source = this;
      if (end > begin) n.selection = [begin, end - 1];
      else n.cursor = begin;
      return n;
    }

    /** Each line as a node (see `line`) paired with its 0-based index, so
     *  `for (const [line, i] of source.lines)` mirrors `Array.map`'s (item, index). */
    get lines(): Iterable<[Text.Node, number]> {
      const self = this, count = this.newlines.length + 1;
      return (function* () { for (let i = 0; i < count; i++) yield [self.line(i), i]; })();
    }
  }

  export class Node implements Global.Node {
    cursor?: number;
    selection: number[] = [];
    source: Text.Source = Text.Source.EMPTY;
    /** Render style for this node — an ANSI color when the diagnostic renderer
     *  paints it; undefined when unstyled. */
    color?: string;

    get file(): string | undefined { return this.source.location; }

    get begin() { return this.selection.length > 0 ? this.selection[0] : this.cursor; }
    set begin(location: number) {
      if (this.selection.length > 0) { this.selection[0] = location; }
      else { this.selection.push(location, this.cursor!); }
    }
    get end() {
      const len = this.selection.length;
      return len > 0 ? this.selection[len - 1] : this.cursor;
    }
    set end(location: number) {
      const len = this.selection.length;
      if (len > 0) { this.selection[len - 1] = location; }
      else { this.selection.push(this.cursor!, location); }
    }

    get line(): number {
      if (this.cursor != null) return this.source.lineOf(this);
      return 1;
    }
    get col(): number {
      if (this.cursor != null) return this.source.colOf(this);
      return 1;
    }

    sameCursor(other?: Text.Node | null): boolean {
      return !!other && other.source === this.source && this.cursor === other.cursor;
    }

    empty() { return this.selection.length === 0; }
    get string() {
      return this.empty() ? '' : this.source.value.slice(this.begin!, this.end! + 1);
    }

    /** The node's ranges, inclusive ends. `selection` is packed [b0,e0,b1,e1,…];
     *  an empty node is the single degenerate range at its cursor. */
    get ranges(): { begin: number; end: number }[] {
      if (this.selection.length === 0) return [{ begin: this.cursor!, end: this.cursor! }];
      const out: { begin: number; end: number }[] = [];
      for (let i = 0; i < this.selection.length; i += 2) out.push({ begin: this.selection[i], end: this.selection[i + 1] });
      return out;
    }

    /** This node split into one single-range node per range — contiguous pieces
     *  that can be ordered and styled independently. Each shares the source and
     *  inherits this node's color. */
    get segments(): Text.Node[] {
      return this.ranges.map(r => {
        const n = new Node();
        n.source = this.source;
        n.color = this.color;
        n.selection = [r.begin, r.end];
        return n;
      });
    }


    protected _left?: Direction;
    protected _right?: Direction;
    get left()  { return this._left  ??= new Direction(this, -1); }
    get right() { return this._right ??= new Direction(this, 1); }

    move(cursor: number): void {
      this.cursor = cursor;
      this.selection = [];
    }

    next_neighbor(_sign: -1 | 1): Text.Node | null { return null; }

    protected _direction: 'left-to-right' | 'right-to-left' = 'left-to-right';
    get ltr() { this._direction = 'left-to-right'; return this; }
    get rtl() { this._direction = 'right-to-left'; return this; }
    get direction() { return this._direction === 'right-to-left' ? this.left : this.right; }
    get behind() { return this._direction === 'right-to-left' ? this.right : this.left; }

    done(): boolean                                    { return this.direction.done(); }
    get head()                                         { return this.direction.head; }
    peek(offset: number = 1): string                   { return this.direction.peek(offset); }
    capture(char: string)                              { return this.direction.capture(char); }
    capture_n(n: number)                               { return this.direction.capture_n(n); }
    capture_while(pred: (ch: Direction) => boolean)    { return this.direction.capture_while(pred); }
    capture_whitespace()                               { return this.direction.capture_whitespace(); }
    capture_line()                                     { return this.direction.capture_line(); }
    skip_while(pred: (ch: Direction) => boolean)       { return this.direction.skip_while(pred); }
    upto(char: string)                                 { return this.direction.upto(char); }
    until(char: string)                                { return this.direction.until(char); }
    goto(char: string)                                 { return this.direction.goto(char); }
    skip()                                             { return this.direction.skip(); }
  }

  export class Direction {
    constructor(public position: Text.Node, public sign: -1 | 1) {}

    get boundary(): number {
      return this.sign === -1 ? this.position.begin! : this.position.end!;
    }

    get head(): number {
      return this.position.empty() ? this.position.cursor! : this.boundary + this.sign;
    }

    protected advance(offset: number = 1): void {
      if (this.sign === -1) {
        this.position.begin = (this.position.empty() ? this.position.cursor! : this.position.begin! - 1) - (offset - 1);
      } else {
        this.position.end = (this.position.empty() ? this.position.cursor! : this.position.end! + 1) + (offset - 1);
      }
    }

    done(): boolean {
      const h = this.head;
      return h < 0 || h >= this.position.source.value.length;
    }

    peek(offset: number = 1): string {
      if (offset === 0) return '';
      if (offset < 0) {
        const opposite = this.sign === -1 ? this.position.right : this.position.left;
        return opposite.peek(offset * -1);
      }
      let a = this.head;
      let b = a + ((offset - 1) * this.sign);
      const src = this.position.source.value;
      if (offset === 1) return a < 0 || a >= src.length ? '' : src[a];
      if (b < a) { [a, b] = [b, a]; }
      return src.slice(Math.max(a, 0), Math.min(b + 1, src.length));
    }

    at(s: string): boolean { return this.peek(s.length) === s; }

    capture(char: string): boolean {
      if (this.done() || this.peek() !== char) return false;
      this.advance();
      return true;
    }
    capture_n(n: number) {
      this.advance(n)
      //TODO CHeck for whether in range.
    }

    capture_while(pred: (ch: Direction) => boolean): string {
      const start = this.head;
      let n = 0;
      while (!this.done() && pred(this)) { n++; this.advance(); }
      if (n === 0) return '';
      let a = start, b = this.boundary;
      if (b < a) { [a, b] = [b, a]; }
      return this.position.source.value.slice(a, b + 1);
    }

    skip_while(pred: (ch: Direction) => boolean): number {
      this.skip();
      const n = this.capture_while(pred).length;
      this.skip();
      return n;
    }

    capture_whitespace(): number { return this.capture_while(ch => ch.peek() === ' ').length; }

    capture_line(): string {
      let a = this.boundary;
      this.capture_while(ch => ch.peek() !== '\n');
      let b = this.boundary;
      if (a === b) return '';
      if (b < a) { [a, b] = [b, a]; }
      return this.position.source.value.slice(a, b + 1);
    }

    capture_indent(): number {
      if (this.sign === -1) throw new Error('capture_indent not supported for rtl.');
      this.capture('\n');
      return this.capture_whitespace();
    }

    upto(_char: string): string { return ''; }
    until(_char: string): string {
      // const opens  = sign === 1 ? '([{' : ')]}';
      // const closes = sign === 1 ? ')]}' : '([{';
      // const depth: string[] = [];
      // const before = this.boundary;
      //
      // while (!this.done()) {
      //   const ch = this.peek();
      //   if (depth.length === 0 && ch === _char) break;
      //   const open = opens.indexOf(ch);
      //   if (open !== -1) depth.push(closes[open]);
      //   else if (depth.length > 0 && ch === depth[depth.length - 1]) depth.pop();
      //   this.advance();
      // }
      //
      // return this.position.source.slice(before, this.boundary);
      return '';
    }
    goto(_char: string): string { return ''; }

    skip(): void {
      if (this.position.empty()) return;
      this.position.move(this.boundary + this.sign);
    }

    next(): Text.Node | null { return this.position.next_neighbor(this.sign); }
  }

}
