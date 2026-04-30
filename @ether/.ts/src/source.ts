/** A piece of source code under consideration. Shared by reference across the
 *  parse-root and every Position copied from it — navigation reads through
 *  here so we don't duplicate the source string. */
export class SourceFile {
  constructor(public source: string, public file?: string) {}
  /** Lazily-computed sorted positions of `\n` chars. Used by `lineOf` /
   *  `colOf` to turn a cursor into a 1-based line/column in O(log lines).
   *  Precompute is O(source.length) once per file. */
  private _newlines?: number[];
  get newlines(): number[] {
    if (this._newlines) return this._newlines;
    const arr: number[] = [];
    const s = this.source;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) arr.push(i);
    return this._newlines = arr;
  }
  /** 1-based line for `position.cursor`. O(log lines) — binary-search the
   *  cached newline index. */
  lineOf(position: Position): number {
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
  /** 1-based column for `position.cursor`. O(log lines) via the same
   *  newline cache as `lineOf`: column = cursor − (last newline before
   *  cursor) (or cursor + 1 if no preceding newline). */
  colOf(position: Position): number {
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

/** A cursor + selection inside a SourceFile, plus the direction state and
 *  navigation primitives the parser drives. Node extends this to add
 *  program/runtime-aware bits (resolution-tracked `.next()`, value
 *  bookkeeping in `clear`/`move`, etc.). Anything that's about *where*
 *  in the source we are — and how to walk it — lives here. */
export class Position {
  cursor?: number;
  /** Packed `[b0,e0,b1,e1,…]`. Absent (length 0) when this position is
   *  a single-char anchor; first pair is the active range. */
  selection: number[] = [];
  source_file?: SourceFile;

  get source(): string { return this.source_file?.source ?? ''; }
  get file(): string | undefined { return this.source_file?.file; }

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
    if (this.source_file && this.cursor != null) return this.source_file.lineOf(this);
    return 1;
  }
  get col(): number {
    if (this.source_file && this.cursor != null) return this.source_file.colOf(this);
    return 1;
  }

  /** True iff `other` shares this position's source_file and cursor.
   *  Reference equality on `source_file` — two distinct SourceFile
   *  instances with the same path are NOT same. */
  sameCursor(other?: Position | null): boolean {
    return !!other && other.source_file === this.source_file && this.cursor === other.cursor;
  }

  protected single_char(): boolean { return this.selection.length === 0; }
  get string() {
    return this.single_char()
      ? this.source[this.cursor!]
      : this.source.slice(this.begin!, this.end! + 1);
  }

  // Lazy slots for the per-direction walkers — most Positions never touch
  // `.left` or `.right` (forward refs, method copies, lazy juxtapositions —
  // i.e. the bulk of allocations), so we only allocate the Direction
  // instance on first access. Two instances per Position max; methods live
  // on Direction's prototype, not as per-instance closures.
  protected _left?: Direction;
  protected _right?: Direction;
  get left()  { return this._left  ??= new Direction(this, -1); }
  get right() { return this._right ??= new Direction(this, 1); }

  move(cursor: number): void {
    this.cursor = cursor;
    this.selection = [];
  }

  /** Hook for AST-style sibling navigation: returns the nearest tracked
   *  Position in `sign` direction (LTR / RTL) within the same source file,
   *  or null. Default: no sibling registry — `Direction.next` returns
   *  null for plain Positions. Node overrides this with the runtime's
   *  by-position cache lookup. */
  next_neighbor(_sign: -1 | 1): Position | null { return null; }

  protected _direction: 'left-to-right' | 'right-to-left' = 'left-to-right';
  get ltr() { this._direction = 'left-to-right'; return this; }
  get rtl() { this._direction = 'right-to-left'; return this; }
  get direction() { return this._direction === 'right-to-left' ? this.left : this.right; }
  /** The opposite of `direction` — useful for "behind me" peeks that should
   *  flip when the parse swaps from LTR to RTL (e.g. checking whether the
   *  preceding char was whitespace, regardless of which way we're reading). */
  get behind() { return this._direction === 'right-to-left' ? this.right : this.left; }

  // Direction-delegating methods. These used to be `name = this.directed_delegate('name')`
  // arrow fields (one closure per method per Node — 10 closures × every Node
  // constructed). Now plain prototype methods that look up the current
  // direction object on each call. The direction lookup itself is lazy so
  // Positions that never call these still don't allocate left/right.
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

/** Walker over a Position's source in a fixed direction. Pairs (Position,
 *  sign): sign=+1 walks left-to-right, sign=-1 walks right-to-left. Two
 *  instances per Position max (lazy `_left`/`_right`). All navigation
 *  methods live on the prototype — no per-instance closure allocation.
 *  Node extends with `NodeDirection` (defined in language.ts) to add
 *  `.next()` for AST-style sibling lookup. */
export class Direction {
  constructor(public position: Position, public sign: -1 | 1) {}

  get boundary(): number {
    return this.sign === -1 ? this.position.begin! : this.position.end!;
  }

  /** Extend the position's selection by `offset` chars in this direction. */
  protected advance(offset: number = 1): void {
    if (this.sign === -1) {
      this.position.begin = this.position.begin! - offset;
    } else {
      this.position.end = this.position.end! + offset;
    }
  }

  done(): boolean {
    const next = this.boundary + this.sign;
    return next < 0 || next >= this.position.source.length;
  }

  peek(offset: number = 1): string {
    if (offset === 0) return '';
    if (offset < 0) {
      const opposite = this.sign === -1 ? this.position.right : this.position.left;
      return opposite.peek(offset * -1);
    }
    let a = this.boundary;
    let b = a + (offset * this.sign);
    const src = this.position.source;
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

  /**
   * Like `capture_while`, but the consumed run never lands in this
   * position's selection — useful for whitespace, comments, anything you
   * want the cursor to pass through without attributing to the
   * surrounding token.
   *
   * Mirrors `skip()`'s post-condition: cursor sits one past the last
   * consumed boundary so the next `capture_while`'s first push begins at
   * the next char. Selection is cleared even if zero chars matched.
   */
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
    return this.position.source.slice(a, b + 1);
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

  /** AST-style sibling navigation: nearest tracked Position in this
   *  direction. Generic — defers to `position.next_neighbor(sign)`,
   *  which Position returns null from by default (no registry); Node
   *  overrides it with the runtime's by-position cache lookup. */
  next(): Position | null { return this.position.next_neighbor(this.sign); }
}
