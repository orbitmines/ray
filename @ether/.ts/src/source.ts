import { nodejs } from "./node.js.ts";

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
        : await nodejs.fs.promises.readFile(this.location, 'utf-8');
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
  }

  export class Node implements Global.Node {
    cursor?: number;
    selection: number[] = [];
    source: Text.Source = Text.Source.EMPTY;

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

    protected single_char(): boolean { return this.selection.length === 0; }
    get string() {
      return this.single_char()
        ? this.source.value[this.cursor!]
        : this.source.value.slice(this.begin!, this.end! + 1);
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

    done(): boolean                                          { return this.direction.done(); }
    capture(char: string): this                              { this.direction.capture(char); return this; }
    capture_while(pred: (ch: string) => boolean): this       { this.direction.capture_while(pred); return this; }
    capture_whitespace(): this                               { this.direction.capture_whitespace(); return this; }
    capture_line(): this                                     { this.direction.capture_line(); return this; }
    skip_while(pred: (ch: string) => boolean): this          { this.direction.skip_while(pred); return this; }
    upto(char: string): this                                 { this.direction.upto(char); return this; }
    until(char: string): this                                { this.direction.until(char); return this; }
    goto(char: string): this                                 { this.direction.goto(char); return this; }
    skip(): this                                             { this.direction.skip(); return this; }
  }

  export class Direction {
    constructor(public position: Text.Node, public sign: -1 | 1) {}

    get boundary(): number {
      return this.sign === -1 ? this.position.begin! : this.position.end!;
    }

    protected advance(offset: number = 1): void {
      if (this.sign === -1) {
        this.position.begin = this.position.begin! - offset;
      } else {
        this.position.end = this.position.end! + offset;
      }
    }

    done(): boolean {
      const next = this.boundary + this.sign;
      return next < 0 || next >= this.position.source.value.length;
    }

    peek(offset: number = 1): string {
      if (offset === 0) return '';
      if (offset < 0) {
        const opposite = this.sign === -1 ? this.position.right : this.position.left;
        return opposite.peek(offset * -1);
      }
      let a = this.boundary;
      let b = a + (offset * this.sign);
      const src = this.position.source.value;
      if (offset === 1) return b < 0 || b >= src.length ? '' : src[b];
      if (b < a) { [a, b] = [b, a]; }
      return src.slice(Math.max(a, 0), Math.min(b + 1, src.length));
    }

    at(s: string): boolean { return this.peek(s.length) === s; }

    capture(char: string): boolean {
      if (this.done() || this.peek() !== char) return false;
      this.advance();
      return true;
    }

    capture_while(pred: (ch: string) => boolean): number {
      let n = 0;
      while (!this.done() && pred(this.peek())) { n++; this.advance(); }
      return n;
    }

    skip_while(pred: (ch: string) => boolean): number {
      let n = 0;
      while (!this.done() && pred(this.peek())) { n++; this.advance(); }
      this.position.cursor = this.boundary + this.sign;
      this.position.selection = [];
      return n;
    }

    capture_whitespace(): number { return this.capture_while(ch => ch === ' '); }

    capture_line(): string {
      let a = this.boundary;
      this.capture_while(ch => ch !== '\n');
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

    skip(): void { this.position.move(this.boundary + this.sign); }

    next(): Text.Node | null { return this.position.next_neighbor(this.sign); }
  }

}
