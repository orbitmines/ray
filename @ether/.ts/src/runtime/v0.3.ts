import fs from 'fs';
import path from 'path';

const UNKNOWN = Symbol("Unknown");

type MethodFn = ((...args: any[]) => Node) & { __args?: 'Program'; __initializer?: boolean; __splitCandidate?: boolean; __rightToLeft?: boolean; __leftAssociative?: boolean; __rightAssociative?: boolean };

//TODO applyModifier Shouldnt be this, should be: get property from .location of the result
//TODO global should be < Node.
//TODO should __rootSource use location to mark line info
//TODO = | assign, should be single key with that type + also the arbitrary key patterns aren't put properly on key now?

class Node {
  value: { encoded: any; methods: Map<string | Node, MethodFn> } = { encoded: UNKNOWN, methods: new Map() };

  private _thunks: ((self: Node) => void)[] | null = null;

  /** Shared prototype — universal methods (|, =, etc.) available on all nodes */
  static PROTO: Node | null = null;

  constructor(encoded: any = UNKNOWN) {
    this.value.encoded = encoded;
  }

  get none(): boolean { return this.value.encoded === null || this.value.encoded === undefined; }

  lazily(fn: (self: Node) => void): this {
    if (!this._thunks) this._thunks = [];
    this._thunks.push(fn);
    return this;
  }

  lazy_get = (key: string | Node): Node => new Node().lazily((self) => self.value = this.get(key).value)
  lazy_set = (value: Node): Node => this.lazily((self) => self.value = value.realize().value)

  /** Call this node's () method with arg. Halts via diagnostics.fatal if not callable. */
  call = (arg: Node, ctx?: any, reader?: any, callPos?: any): Node => {
    const fn = this.method('()');
    if (fn) return fn(this, arg, ctx, reader, callPos);
    if (reader instanceof Reader) reader.diagnostics.fatal('call', `Not callable: ${describe(this)}`);
    throw new Error(`Not callable: ${describe(this)}`);
  }

  /** Lazy call: always returns a deferred node that calls .call() when realized. */
  lazy_call = (arg: Node, ctx?: any, reader?: any, callPos?: any): Node => {
    return new Node().lazily((self) => {
      const ret = this.realize().call(arg.realize(), ctx, reader, callPos);
      self.value = ret.realize().value; // realize return value too (may be a pending lazy node)
    });
  }
  realize(): Node {
    if (this._thunks) {
      const thunks = this._thunks;
      this._thunks = null;
      for (const fn of thunks) fn(this);
    }
    return this;
  }

  has(key: string | Node, none: boolean = true): boolean { return this.value.methods.has(key) && (!none || !this.get(key).none)  }
  get(key: string | Node): Node { this.realize(); return this.value.methods.get(key)?.(Node.cast(key)) ?? new Node(null) }
  set(val: Node): Node { this.realize(); this.value = val.value; return this; }

  /** Look up a method by name, checking own methods then PROTO */
  method(name: string): MethodFn | undefined {
    const suffixKey = `[null,${JSON.stringify(name)}]`;
    return this.value.methods.get(name)
      ?? this.value.methods.get(suffixKey)
      ?? Node.PROTO?.value.methods.get(name)
      ?? Node.PROTO?.value.methods.get(suffixKey);
  }

  /** Register an external method on this node */
  external(name: string, fn: MethodFn): this {
    this.value.methods.set(name, fn);
    return this;
  }

  /** Register a method that auto-wraps into a partial: name(self) → partial, partial()(arg, ctx, reader) → fn(self, arg, ctx, reader) */
  external_method(name: string, fn: MethodFn, opts?: { args?: 'Program'; initializer?: boolean }): this {
    const methodFn: MethodFn = (self: Node) => {
      const callFn: MethodFn = (_: Node, ...args: any[]) => fn(self, ...args);
      if (opts?.args) callFn.__args = opts.args;
      return new Node(name).external('()', callFn);
    };
    if (opts?.initializer) methodFn.__initializer = true;
    return this.external(name, methodFn);
  }

  *iter(): Generator<Node> {
    let next = this.get('next');
    while (next && !next.none) { yield next; next = next.get('next'); }
  }

  static cast = (x: any): Node => {
    if (x instanceof Node) return x;
    return new Node(x)
  }
}

class Iterable {
  constructor(private owner: Node, private key: string) {}

  *[Symbol.iterator](): Generator<Node> { yield* this.owner.get(this.key).iter(); }
}

class Context extends Node {
  parent: Context | null;

  constructor(parent: Context | null = null) {
    super();
    this.parent = parent;
    this.external('local', () => this);
  }

  get(key: string | Node): Node {
    if (this.has(key, false)) return super.get(key);
    if (this.parent) return this.parent.get(key);
    return new Node(null)
  }
}

namespace bootstrap {
  const BINDING = Symbol("*");

  interface Definition {
    pattern: (string | typeof BINDING)[];
    isComment: boolean;
    /** Byte range [start, end) in root source where this definition was found — tryPattern skips self */
    sourceRange?: [number, number];
  }

  /** Character-level scan. Seed knowledge: {/} balance + "comment"/"external" modifiers.
   *  @param baseOffset — added to sourceRange positions (for class bodies that are substrings of root source) */
  export function defs(source: string, baseOffset = 0): Definition[] {
    const defs: Definition[] = [];
    let i = 0;

    const at = (s: string) => source.startsWith(s, i);
    const skip = (n = 1) => { i += n; };
    const skipLine = () => { while (i < source.length && source[i] !== '\n') skip(); };

    while (i < source.length) {
      if (source[i] === '\n') { skip(); continue; }

      const lineStart = i;
      const indented = source[i] === ' ';
      let lineIndent = 0;
      while (i < source.length && source[i] === ' ') { lineIndent++; skip(); }
      if (i >= source.length || source[i] === '\n') continue;

      let isComment = false;
      let isExternal = false;
      if (at('comment ')) { isComment = true; skip(8); }
      else if (at('external ')) { isExternal = true; skip(9); }
      if (at('right-to-left ')) { skip(14); }
      if (at('left-associative ')) { skip(17); }
      if (at('right-associative ')) { skip(18); }

      let depth = 0, seenBlock = false, hasArrow = false, afterBlockClose = false, text = '';
      let pattern: (string | typeof BINDING)[] = [];
      const alts: (string | typeof BINDING)[][] = [];

      const flush = () => { if (text.trim()) pattern.push(text.trim()); text = ''; };

      while (i < source.length) {
        if (depth > 0) {
          if (at('}}') && depth === 1) { pattern.push(BINDING, '}'); depth = 0; afterBlockClose = true; skip(2); }
          else if (source[i] === '{') { depth++; skip(); }
          else if (source[i] === '}' && --depth === 0) { pattern.push(BINDING); afterBlockClose = true; skip(); }
          else skip();
          continue;
        }

        if (at('{{')) {
          afterBlockClose = false; flush(); pattern.push('{'); seenBlock = true; depth = 1; skip(2);
        } else if (source[i] === '{') {
          afterBlockClose = false; flush(); seenBlock = true; depth++; skip();
        } else if (source[i] === ' ' && afterBlockClose) {
          // Space after block-adjacent text: flush suffix, then check what follows
          flush(); afterBlockClose = false;
          // Peek ahead: if '|' follows, continue for alternation; otherwise body follows
          let peek = i + 1;
          while (peek < source.length && source[peek] === ' ') peek++;
          if (peek < source.length && source[peek] === '|') {
            skip(); // just skip the space, continue processing
          } else {
            hasArrow = true; skipLine(); break;
          }
        } else if (at('=>') && (i === 0 || source[i - 1] === ' ' || source[i - 1] === '\n')) {
          hasArrow = true; text = ''; skip(2); skipLine(); break;
        } else if (source[i] === '|' && seenBlock) {
          afterBlockClose = false; flush(); alts.push(pattern); pattern = []; seenBlock = false; skip();
        } else if (source[i] === '\n') {
          afterBlockClose = false;
          if (!seenBlock || depth === 0) {
            // Check for multi-line body: next line more deeply indented → implicit arrow
            if (seenBlock && !hasArrow) {
              let j = i + 1, nextIndent = 0;
              while (j < source.length && source[j] === ' ') { nextIndent++; j++; }
              if (nextIndent > lineIndent && j < source.length && source[j] !== '\n') {
                hasArrow = true;
                // Skip body lines (all lines more deeply indented than current)
                skip(); // skip the newline
                while (i < source.length) {
                  let bodyStart = i, bodyIndent = 0;
                  while (i < source.length && source[i] === ' ') { bodyIndent++; skip(); }
                  if (bodyIndent <= lineIndent || i >= source.length || source[i] === '\n') { i = bodyStart; break; }
                  skipLine();
                  if (i < source.length && source[i] === '\n') skip();
                }
              }
            }
            flush(); skip(); break;
          }
          skip();
        } else {
          text += source[i]; skip();
        }
      }

      if (!hasArrow) flush();
      if (seenBlock && (hasArrow || isExternal)) alts.push(pattern);
      for (const p of alts) {
        if (!p.length) continue;
        // Indented non-external: only keep structural patterns
        if (indented && !isExternal) {
          const first = p[0], last = p[p.length - 1];
          // Delimiter pairs: short opener ≠ closer (e.g., < BINDING >)
          if (typeof first === 'string' && first.length <= 2 && typeof last === 'string' && first !== last) { /* ok */ }
          // Suffix patterns: binding + short literal (e.g., BINDING =>)
          else if (first === BINDING && typeof last === 'string' && last.length <= 2) { /* ok */ }
          else continue;
        }
        defs.push({ pattern: p, isComment, sourceRange: [baseOffset + lineStart, baseOffset + i] as [number, number] });
      }
    }

    return defs;
  }
}

class Reader {
  private i = 0;
  private forwards: Map<string, { node: Node; pos: number; resolved?: boolean }> = new Map();
  private defNodes!: Map<ReturnType<typeof bootstrap.defs>[number], Node>;
  /** All lazy results from apply(), realized during verify(). Shared across sub-readers. */
  pending!: Node[];
  /** Sub-readers created during block evaluation, verified when parent verifies. Shared. */
  subReaders!: Reader[];
  file?: string;
  /** Original full source for error location mapping */
  private rootSource?: string;
  /** Offset of this.source within rootSource (single-line blocks) */
  private baseOffset = 0;
  /** Per-line mapping: root-source position of each line start (before indent) + blockIndent */
  private lineOffsets?: number[];
  private blockIndent = 0;
  /** Generation counter — incremented on re-parse, old lazy_calls become no-ops */
  private generation = 0;
  /** Grammar snapshot: method count at last parse, used to detect real changes */
  private grammarSnapshot = 0;
  /** Set to true when the creating reader has been re-parsed, making this sub-reader obsolete */
  private stale = false;
  /** The reader whose makeBlock created this sub-reader */
  private createdBy: Reader | null = null;
  /** Definition pattern keys matched during read (for modifier key detection) */
  private matchedDefs: string[] = [];
  /** Definitions to skip on the current line (precomputed per-line to avoid per-char sourceRange checks) */
  private skippedDefs: Set<ReturnType<typeof bootstrap.defs>[number]> | null = null;
  /** Fast flag: true if any definition has a sourceRange (computed once at construction) */
  private _hasSourceRangeDefs = false;
  /** Method keys registered on `this` during this reader's evaluation (for cleanup on reparse) */
  private registeredKeys: Set<string> = new Set();
  /** Keys to exclude from resolution (treat as forwards) — prevents self-resolution during reparse */
  private excludeKeys: Set<string> | null = null;
  /** Lookup: first char → definitions starting with that char (precomputed, shared) */
  private _defsByFirstChar!: Map<string, ReturnType<typeof bootstrap.defs>[number][]>;
  /** Set of all chars that can start a definition pattern (for fast readToken skip) */
  private _defFirstChars!: Set<string>;

  get forwardCount() { return this.forwards.size; }
  get defs() { return this.definitions; }
  /** The first forward-referenced identifier (method key for modifiers) */
  get firstForwardKey(): string | null {
    for (const [key] of this.forwards) return key;
    return null;
  }
  /** The first matched definition pattern key (for pattern-based modifier bodies) */
  get firstMatchedDef(): string | null {
    return this.matchedDefs[0] ?? null;
  }

  /** Track a method key registered on `this` by this reader's evaluation */
  trackRegisteredKey(key: string) { this.registeredKeys.add(key); }
  /** Get keys registered by this reader (for passing to sub-readers as excludeKeys) */
  getRegisteredKeys(): Set<string> { return this.registeredKeys; }
  /** Set keys to exclude from resolution (treat as forwards instead).
   *  Takes a reference — keys added later to the Set will be excluded too. */
  setExcludeKeys(keys: Set<string>) { this.excludeKeys = keys; }

  /** Configure source mapping so errors report correct positions in the root file */
  setSourceMapping(rootSource: string, baseOffset: number) {
    this.rootSource = rootSource;
    this.baseOffset = baseOffset;
  }

  /** Shared defNodes cache — computed once per definitions array, reused by all readers */
  private static _defNodesCache = new WeakMap<ReturnType<typeof bootstrap.defs>, { map: Map<ReturnType<typeof bootstrap.defs>[number], Node>, hasSourceRange: boolean, defsByFirstChar: Map<string, ReturnType<typeof bootstrap.defs>[number][]>, defFirstChars: Set<string> }>();

  constructor(
    private source: string,
    private definitions: ReturnType<typeof bootstrap.defs>,
    private ctx: Context,
    public diagnostics: Diagnostics = new Diagnostics(),
  ) {
    this.pending = [];
    this.subReaders = [];
    let cached = Reader._defNodesCache.get(definitions);
    if (!cached) {
      const map = new Map<ReturnType<typeof bootstrap.defs>[number], Node>();
      let hasSourceRange = false;
      const defsByFirstChar = new Map<string, ReturnType<typeof bootstrap.defs>[number][]>();
      const defFirstChars = new Set<string>();
      for (const def of definitions) {
        map.set(def, new Node(def));
        if (def.sourceRange) hasSourceRange = true;
        const first = def.pattern[0];
        if (typeof first === 'string' && first.length > 0) {
          const ch = first[0];
          defFirstChars.add(ch);
          let arr = defsByFirstChar.get(ch);
          if (!arr) { arr = []; defsByFirstChar.set(ch, arr); }
          arr.push(def);
        }
      }
      cached = { map, hasSourceRange, defsByFirstChar, defFirstChars };
      Reader._defNodesCache.set(definitions, cached);
    }
    this.defNodes = cached.map;
    this._hasSourceRangeDefs = cached.hasSourceRange;
    this._defsByFirstChar = cached.defsByFirstChar;
    this._defFirstChars = cached.defFirstChars;
  }

  /** Snapshot the current grammar state (method counts on relevant nodes) */
  private takeGrammarSnapshot() {
    let count = Node.PROTO?.value.methods.size ?? 0;
    const thisNode = this.ctx.get('this');
    if (!thisNode.none) count += thisNode.value.methods.size;
    this.grammarSnapshot = count;
  }

  /** Check if this reader should be re-parsed: grammar changed AND any forward could now resolve or split */
  needsReparse(): boolean {
    if (this.stale) return false;
    if (this.forwards.size === 0) return false;
    // Quick check: did the grammar change since last parse?
    let count = Node.PROTO?.value.methods.size ?? 0;
    const thisNode = this.ctx.get('this');
    if (!thisNode.none) count += thisNode.value.methods.size;
    if (count <= this.grammarSnapshot) return false;
    for (const [name, { resolved }] of this.forwards) {
      if (resolved) continue;
      // Check if forward can now be resolved directly
      if (Node.PROTO?.method(name)) return true;
      if (!thisNode.none && thisNode.method(name)) return true;
      if (!this.ctx.get(name).none) return true;
      // Check if forward can be split (suffix is a __splitCandidate method)
      for (let i = 1; i < name.length; i++) {
        const suffix = name.slice(i);
        const m = Node.PROTO?.method(suffix) ?? (!thisNode.none ? thisNode.method(suffix) : undefined);
        if (m && m.__splitCandidate) return true;
      }
    }
    return false;
  }

  /** Re-parse this reader with updated grammar. Old lazy_calls become no-ops via generation check. */
  reparse() {
    this.generation++;
    const thisNode = this.ctx.get('this');
    // Clean up compound names (forwards + registered keys) that can now be split.
    // Only compound names are cleaned — single-char keys stay to avoid cascading reparses.
    const canSplit = (name: string) => {
      if (name.length <= 1) return false;
      for (let i = 1; i < name.length; i++) {
        const suffix = name.slice(i);
        const m = Node.PROTO?.method(suffix) ?? (!thisNode.none ? thisNode.method(suffix) : undefined);
        if (m && m.__splitCandidate) return true;
      }
      return false;
    };
    for (const [name] of this.forwards) {
      if (canSplit(name)) {
        if (!thisNode.none) thisNode.value.methods.delete(name);
        this.ctx.value.methods.delete(name);
      }
    }
    for (const key of this.registeredKeys) {
      if (canSplit(key)) {
        if (!thisNode.none) thisNode.value.methods.delete(key);
        this.ctx.value.methods.delete(key);
        this.registeredKeys.delete(key);
      }
    }
    // Mark sub-readers spawned by our old lazy_calls as stale (transitively)
    const staleSet = new Set<Reader>([this]);
    for (const sub of this.subReaders) {
      if (!sub.stale && sub.createdBy && staleSet.has(sub.createdBy)) {
        sub.stale = true;
        staleSet.add(sub);
      }
    }
    this.i = 0;
    this._lastLine = 0; this._lastLineStart = 0; this._lastScanPos = 0;
    this.forwards.clear();
    this.matchedDefs = [];
    this.read();
    this.takeGrammarSnapshot();
  }

  private at(s: string) { return this.source.startsWith(s, this.i); }
  private ch() { return this.source[this.i]; }
  private skip(n = 1) { this.i += n; }
  private done() { return this.i >= this.source.length; }

  /** Cached state for toRootPos incremental line scanning */
  private _lastLine = 0;
  private _lastLineStart = 0;
  private _lastScanPos = 0;

  /** Translate a position in this reader's source to an absolute position in the root source */
  private toRootPos(pos: number): number {
    if (this.lineOffsets) {
      let { _lastLine: line, _lastLineStart: lineStart, _lastScanPos: scanFrom } = this;
      if (pos < scanFrom) { line = 0; lineStart = 0; scanFrom = 0; }
      for (let i = scanFrom; i < pos && i < this.source.length; i++) {
        if (this.source[i] === '\n') { line++; lineStart = i + 1; }
      }
      this._lastLine = line; this._lastLineStart = lineStart; this._lastScanPos = pos;
      const rootLinePos = this.lineOffsets[line] ?? this.lineOffsets[0];
      return rootLinePos + (pos - lineStart) + this.blockIndent;
    }
    return this.baseOffset + pos;
  }

  /** Locate a position in this reader's source, mapping back to root source for correct line:col */
  locate(pos: number): { line: number; col: number } {
    return Diagnostics.locate(this.rootSource ?? this.source, this.toRootPos(pos));
  }

  private indent(): number {
    let n = 0;
    while (!this.done() && this.ch() === ' ') { n++; this.skip(); }
    return n;
  }

  private tryPattern(): Node | null | undefined {
    const candidates = this._defsByFirstChar.get(this.ch());
    if (!candidates) return undefined;
    for (const def of candidates) {
      const isDefLine = this.skippedDefs?.has(def) ?? false;
      if (isDefLine) {
        // On a definition line: still match the pattern structure,
        // but resolve to the registered method on `this` instead of calling defNode
      } else {
        // Normal usage: skip if in skippedDefs (other defs)
      }
      const first = def.pattern[0] as string;
      if (!this.at(first)) continue;
      const startPos = this.i;
      this.skip(first.length);

      const last = def.pattern[def.pattern.length - 1];
      let closerFound = true;
      const lineOffsets: number[] = []; // per-line root positions for multiline code blocks
      if (typeof last === 'string' && last !== first) {
        let depth = 0;
        lineOffsets.push(this.toRootPos(this.i)); // first line starts here
        const contentStart = this.i;
        while (!this.done()) {
          if (depth === 0 && this.at(last)) break;
          if (this.at(first)) { depth++; this.skip(first.length); }
          else if (depth > 0 && this.at(last)) { depth--; this.skip(last.length); }
          else {
            if (this.ch() === '\n') lineOffsets.push(this.toRootPos(this.i + 1));
            this.skip();
          }
        }
        var content = this.source.slice(contentStart, this.i);
        if (!this.done()) this.skip(last.length); else closerFound = false;
      } else if (typeof last === 'string') {
        const contentStart = this.i;
        while (!this.done() && !this.at(last)) this.skip();
        var content = this.source.slice(contentStart, this.i);
        if (!this.done()) this.skip(last.length); else closerFound = false;
      } else {
        const contentStart = this.i;
        while (!this.done() && this.ch() !== '\n') this.skip();
        var content = this.source.slice(contentStart, this.i);
      }

      if (def.isComment) return null;

      if (!closerFound) {
        const loc = this.locate(startPos);
        this.diagnostics.error('read', `Unterminated ${JSON.stringify(first)} pattern`, this.file, loc.line, loc.col);
        return new Node(null);
      }

      const defKey = JSON.stringify(def.pattern);
      this.matchedDefs.push(defKey);

      if (isDefLine) {
        // Definition line: resolve as the registered pattern method on `this`.
        // The pattern was already registered by bootstrap.defs() discovery in makeClassNode.
        const thisNode = this.ctx.get('this');
        if (!thisNode.none) {
          const method = thisNode.value.methods.get(defKey);
          if (method) return method(thisNode);
        }
        return this.defNodes.get(def) ?? new Node(def);
      }

      // Normal usage: wrap content as block/string and call the defNode
      const isCodeBlock = typeof last === 'string' && last !== first;
      const arg = isCodeBlock
        ? this.makeBlock(content, lineOffsets.length > 1
            ? { lineOffsets, blockIndent: 0 }
            : { offset: lineOffsets[0] ?? this.toRootPos(startPos + first.length) })
        : new Node(content);
      return this.apply(this.defNodes.get(def)!, arg);
    }
    return undefined;
  }

  private readToken(): string {
    const start = this.i;
    while (!this.done() && this.ch() !== ' ' && this.ch() !== '\n') {
      if (this._defFirstChars.has(this.ch())) {
        const candidates = this._defsByFirstChar.get(this.ch())!;
        let hit = false;
        for (const def of candidates) {
          if (!this.at(def.pattern[0] as string)) continue;
          if (this.skippedDefs?.has(def)) continue;
          hit = true; break;
        }
        if (hit) break;
      }
      this.skip();
    }
    return this.source.slice(start, this.i);
  }

  private resolve(name: string): Node {
    // During reparse, skip keys that this reader previously registered (prevent self-resolution)
    if (this.excludeKeys?.has(name)) {
      if (!this.forwards.has(name)) {
        this.forwards.set(name, { node: new Node(name), pos: this.i - name.length });
      }
      return this.forwards.get(name)!.node;
    }
    const found = this.ctx.get(name);
    if (!found.none) {
      // Wrap non-string nodes to preserve the token name for methods like =
      // without corrupting the original shared node.
      if (typeof found.value.encoded !== 'string') {
        const wrapper = new Node(name);
        wrapper.value.methods = found.value.methods;
        return wrapper;
      }
      return found;
    }
    if (!this.forwards.has(name)) {
      this.forwards.set(name, { node: new Node(name), pos: this.i - name.length });
    }
    return this.forwards.get(name)!.node;
  }

  resolveForward(name: string, node: Node) {
    const fwd = this.forwards.get(name);
    if (fwd) { fwd.node.set(node); fwd.resolved = true; }
  }

  /** Report an error at a specific source position */
  errorAt(pos: number, phase: string, message: string) {
    const loc = this.locate(pos);
    this.diagnostics.error(phase, message, this.file, loc.line, loc.col);
  }

  /** Lazy apply: defers the call, tracks result for realization in verify() */
  private apply(target: Node, arg: Node, callPos?: number): Node {
    const gen = this.generation;
    const reader = this;
    const result = new Node().lazily((self) => {
      if (gen < reader.generation) return; // Stale after re-parse — skip
      const ret = target.realize().call(arg.realize(), reader.ctx, reader, callPos);
      self.value = ret.realize().value;
    });
    this.pending.push(result);
    return result;
  }

  /** Check if a node's () method expects a Program (consumes rest of line as block) */
  private expectsProgram(node: Node): boolean {
    const fn = node.method('()');
    return fn?.__args === 'Program';
  }

  /** Create a block node that spawns a sub-reader when evaluated */
  private makeBlock(blockSource: string, locate: { offset: number } | { lineOffsets: number[]; blockIndent: number }): Node {
    const { definitions, diagnostics, file } = this;
    const rootSrc = this.rootSource ?? this.source;
    const parentPending = this.pending;
    const parentSubReaders = this.subReaders;
    const creator = this;
    const block = new Node((ctx: Context) => {
      const reader = new Reader(blockSource, definitions, ctx, diagnostics);
      reader.file = file;
      reader.rootSource = rootSrc;
      reader.createdBy = creator;
      if ('offset' in locate) {
        reader.baseOffset = locate.offset;
        // Pre-check: disable sourceRange checks if this block doesn't overlap any definition
        if (reader._hasSourceRangeDefs) {
          const blockEnd = locate.offset + blockSource.length;
          let overlaps = false;
          for (const def of definitions) {
            if (def.sourceRange && def.sourceRange[0] < blockEnd && def.sourceRange[1] > locate.offset) {
              overlaps = true; break;
            }
          }
          if (!overlaps) reader._hasSourceRangeDefs = false;
        }
      }
      else { reader.lineOffsets = locate.lineOffsets; reader.blockIndent = locate.blockIndent; }
      reader.pending = parentPending;
      reader.subReaders = parentSubReaders;
      parentSubReaders.push(reader);
      const result = reader.read();
      reader.takeGrammarSnapshot();
      return result;
    });
    block.external('expression', () => new Node(blockSource));
    block.external('__rootSource', () => new Node(rootSrc));
    if ('offset' in locate) block.external('__sourceOffset', () => new Node(locate.offset));
    return block;
  }

  private captureRestAsBlock(): Node {
    while (!this.done() && this.ch() === ' ') this.skip();
    const start = this.i;
    while (!this.done() && this.ch() !== '\n') this.skip();
    return this.makeBlock(this.source.slice(start, this.i), { offset: this.toRootPos(start) });
  }

  /** If result expects a Program, capture the rest of the line as a block and call it */
  private checkProgram(result: Node, callPos?: number): Node {
    if (this.expectsProgram(result) && !this.done() && this.ch() !== '\n') {
      return this.apply(result, this.captureRestAsBlock(), callPos);
    }
    return result;
  }

  /** Precompute which definitions to skip at current position (definition lines shouldn't parse with own syntax) */
  private computeSkippedDefs(): void {
    this.skippedDefs = null;
    // Fast path: if no definitions have sourceRange, skip entirely
    if (!this._hasSourceRangeDefs) return;
    const rootPos = this.lineOffsets ? this.toRootPos(this.i) : this.baseOffset + this.i;
    for (const def of this.definitions) {
      if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
        (this.skippedDefs ??= new Set()).add(def);
      }
    }
  }

  /** Read and evaluate a single line */
  private readLine(): Node {
    this.computeSkippedDefs();
    let result: Node | null = null;
    let resultPos = this.i;
    let lastArg: Node | null = null; // Track last juxtaposed arg for right-to-left methods

    while (!this.done() && this.ch() !== '\n') {
      if (this.ch() === ' ') { this.skip(); continue; }

      const tokenStart = this.i;

      const matched = this.tryPattern();
      if (matched === null) continue;
      if (matched !== undefined) {
        if (result) { lastArg = matched; result = this.apply(result, matched, resultPos); }
        else { result = matched; resultPos = tokenStart; lastArg = null; }
        result = this.checkProgram(result, resultPos);
        continue;
      }

      const text = this.readToken();
      if (!text) continue;

      // Check if token name is a method on current result (direct or PROTO)
      if (result !== null) {
        const method = result.method(text);
        if (method) {
          if (method.__rightToLeft) {
            const target = lastArg ?? result;
            if (method.__leftAssociative) {
              // Left-associative: read one token/pattern as body, chain via lastArg
              while (!this.done() && this.ch() === ' ') this.skip();
              let body: Node | null = null;
              const bodyMatch = this.tryPattern();
              if (bodyMatch !== undefined && bodyMatch !== null) {
                body = bodyMatch;
              } else if (bodyMatch !== null) {
                const bodyToken = this.readToken();
                if (bodyToken) body = this.resolve(bodyToken);
              }
              if (body) {
                const partial = method(body, new Node(text), this.ctx, this);
                result = this.apply(partial, target, tokenStart);
                lastArg = null; // left-associative: next rtl op chains on result
              }
            } else {
              // Right-associative (default): capture rest of line as body
              const body = this.captureRestAsBlock();
              if (body) {
                const partial = method(body, new Node(text), this.ctx, this);
                result = this.apply(partial, target!, tokenStart);
                lastArg = null;
              }
            }
            continue;
          }
          result = method(result, new Node(text), this.ctx, this);
          result = this.checkProgram(result, tokenStart);
          lastArg = null;
          continue;
        }
      }

      // Check this.method() for modifiers (methods expecting Program) as first token in class body
      if (result === null) {
        const thisNode = this.ctx.get('this');
        if (!thisNode.none) {
          const method = thisNode.method(text);
          if (method) {
            const partial = method(thisNode);
            if (partial.method('()')?.__args === 'Program') {
              result = partial;
              resultPos = tokenStart;
              result = this.checkProgram(result, resultPos);
              lastArg = null;
              continue;
            }
          }
        }
      }

      // Try full token as variable first (longest match)
      if (!this.ctx.get(text).none) {
        const resolved = this.resolve(text);
        if (result) { lastArg = resolved; result = this.apply(result, resolved, resultPos); }
        else { result = resolved; resultPos = tokenStart; lastArg = null; }
        result = this.checkProgram(result, resultPos);
        continue;
      }

      // Full token doesn't resolve — try splitting at method boundaries.
      // Only split at methods marked __splitCandidate (newly-registered initializer methods like `:`).
      // Pre-existing methods (like `=`) and non-initializer methods (like `==`) are NOT split points.
      const methodNode = result ?? Node.PROTO;
      if (methodNode && text.length > 1) {
        let splitAt = -1;
        const isSplitCandidate = (m: MethodFn | undefined): m is MethodFn =>
          m !== undefined && m.__splitCandidate === true;
        // Phase 1: longest resolving prefix (iterate from end)
        for (let i = text.length - 1; i >= 1; i--) {
          const suffix = text.slice(i);
          if (isSplitCandidate(methodNode.method(suffix))) {
            if (!this.ctx.get(text.slice(0, i)).none) { splitAt = i; break; }
            if (splitAt === -1) splitAt = i; // remember first (= longest prefix) fallback
          }
        }
        // Phase 2: if no resolving prefix found, prefer longest method suffix
        if (splitAt === -1) {
          for (let i = 1; i < text.length; i++) {
            if (isSplitCandidate(methodNode.method(text.slice(i)))) { splitAt = i; break; }
          }
        }
        if (splitAt !== -1) {
          // Rewind reader to the suffix, return only the prefix
          this.i -= (text.length - splitAt);
          const prefix = text.slice(0, splitAt);
          const resolved = this.resolve(prefix);
          if (result) { lastArg = resolved; result = this.apply(result, resolved, resultPos); }
          else { result = resolved; resultPos = tokenStart; lastArg = null; }
          result = this.checkProgram(result, resultPos);
          continue;
        }
      }

      // No split found — forward-reference the full token
      const resolved = this.resolve(text);
      if (result) { lastArg = resolved; result = this.apply(result, resolved, resultPos); }
      else { result = resolved; resultPos = tokenStart; lastArg = null; }
      result = this.checkProgram(result, resultPos);
    }

    return result ?? new Node(null);
  }



  private readBlock(blockIndent: number): Node {
    const lines: string[] = [];
    const lineOffsets: number[] = [];
    while (!this.done()) {
      const pos = this.i;
      if (this.ch() === '\n') { this.skip(); continue; }

      const ind = this.indent();

      this.computeSkippedDefs();
      const savedPos = this.i;
      const peek = this.tryPattern();
      if (peek === null) continue;
      if (peek !== undefined) this.i = savedPos;

      if (ind < blockIndent && !this.done() && this.ch() !== '\n') {
        this.i = pos;
        break;
      }

      lineOffsets.push(this.toRootPos(pos));
      const relIndent = ' '.repeat(Math.max(0, ind - blockIndent));
      const contentStart = this.i;
      while (!this.done() && this.ch() !== '\n') this.skip();
      lines.push(relIndent + this.source.slice(contentStart, this.i));
    }

    return this.makeBlock(lines.join('\n'), { lineOffsets, blockIndent });
  }

  read(): Node {
    // Fast path: single-line source — skip indent/block logic entirely
    if (this.source.indexOf('\n') === -1) {
      this.computeSkippedDefs();
      return this.readLine();
    }

    let lastResult: Node | null = null;
    const results: Node[] = [];

    while (!this.done()) {
      if (this.ch() === '\n') { this.skip(); continue; }

      const pos = this.i;
      const indent = this.indent();

      if (this.done() || this.ch() === '\n') continue;

      this.computeSkippedDefs();
      const savedPos = this.i;
      const peek = this.tryPattern();
      if (peek === null) continue;
      if (peek !== undefined) this.i = savedPos;

      const result = this.readLine();
      if (this.ch() === '\n') this.skip();

      let nextIndent = 0;
      if (!this.done()) {
        const peekPos = this.i;
        while (!this.done() && this.ch() === '\n') this.skip();
        if (!this.done()) {
          nextIndent = this.indent();
          this.i = peekPos;
        }
      }

      if (nextIndent > indent) {
        while (!this.done() && this.ch() === '\n') this.skip();
        const block = this.readBlock(nextIndent);
        const withBlock = this.apply(result, block);
        results.push(withBlock);
        lastResult = withBlock;
      } else {
        results.push(result);
        lastResult = result;
      }
    }

    return lastResult ?? new Node(null);
  }

  verify() {
    // Fixpoint loop: realize → check grammar changes → re-parse affected sub-readers → repeat
    let startIdx = 0;
    for (let round = 0; ; round++) {
      // Realize pending lazy results starting from where we left off
      for (let i = startIdx; i < this.pending.length; i++) {
        let prevLen = this.pending.length;
        this.pending[i].realize();
        while (this.pending.length > prevLen) {
          const newStart = prevLen;
          prevLen = this.pending.length;
          for (let j = newStart; j < prevLen; j++) this.pending[j].realize();
        }
      }
      startIdx = this.pending.length;

      // Check sub-readers: if grammar changed (new methods that could split their forwards), re-parse
      let reparsed = 0;
      for (let i = 0; i < this.subReaders.length; i++) {
        const sub = this.subReaders[i];
        if (sub.stale) continue;
        if (sub.needsReparse()) {
          sub.reparse();
          reparsed++;
        }
      }
      if (!reparsed) break;
      if (round > 10) { this.diagnostics.error('verify', 'Re-parse fixpoint did not converge after 10 rounds'); break; }
    }

    // Check unresolved forwards — own and all sub-readers created during realization
    for (const [name, { pos, resolved }] of this.forwards) {
      if (resolved) continue;
      const loc = this.locate(pos);
      this.diagnostics.error('resolve', `Unresolved identifier: ${name}`, this.file, loc.line, loc.col);
    }
    for (let i = 0; i < this.subReaders.length; i++) {
      const sub = this.subReaders[i];
      if (sub.stale) continue;
      for (const [name, { pos, resolved }] of sub.forwards) {
        if (resolved) continue;
        const loc = sub.locate(pos);
        this.diagnostics.error('resolve', `Unresolved identifier: ${name}`, sub.file, loc.line, loc.col);
      }
    }
  }
}

interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  phase: string;
  message: string;
  file?: string;
  line?: number;
  col?: number;
}

class Diagnostics {
  private items: Diagnostic[] = [];
  private keys = new Set<string>();

  report(diag: Diagnostic) {
    const key = `${diag.file ?? ''}:${diag.line ?? 0}:${diag.col ?? 0}|${diag.message}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.items.push(diag);
  }

  error(phase: string, message: string, file?: string, line?: number, col?: number) {
    this.report({ level: 'error', phase, message, file, line, col });
  }

  /** Report error and halt the program immediately */
  fatal(phase: string, message: string, file?: string, line?: number, col?: number): never {
    this.error(phase, message, file, line, col);
    this.print();
    process.exit(1);
  }

  warning(phase: string, message: string, file?: string, line?: number, col?: number) {
    this.report({ level: 'warning', phase, message, file, line, col });
  }

  get errors() { return this.items.filter(d => d.level === 'error'); }
  get warnings() { return this.items.filter(d => d.level === 'warning'); }
  get hasErrors() { return this.items.some(d => d.level === 'error'); }
  get count() { return this.items.length; }

  static locate(source: string, pos: number): { line: number; col: number; context: string } {
    let line = 1, col = 1;
    for (let i = 0; i < pos && i < source.length; i++) {
      if (source[i] === '\n') { line++; col = 1; } else col++;
    }
    const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = source.indexOf('\n', pos);
    const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    const pointer = ' '.repeat(col - 1) + '^';
    return { line, col, context: `  ${lineText}\n  ${pointer}` };
  }

  print(label?: string) {
    const errs = this.errors, warns = this.warnings;
    if (errs.length === 0 && warns.length === 0) {
      console.error(label ? `  \x1b[90m${label}: No errors.\x1b[0m` : '  \x1b[90mNo errors.\x1b[0m');
      return;
    }
    for (const d of this.items) {
      const lbl = d.level === 'error' ? `\x1b[1;31merror\x1b[0m` : `\x1b[1;33mwarning\x1b[0m`;
      if (d.file) console.error(`  \x1b[90m${d.file}:${d.line ?? 0}:${d.col ?? 0}\x1b[0m`);
      console.error(`    ${lbl}\x1b[90m[${d.phase}]\x1b[0m: ${d.message}`);
    }
    const parts: string[] = [];
    if (errs.length) parts.push(`\x1b[1;31m${errs.length} error${errs.length > 1 ? 's' : ''}\x1b[0m`);
    if (warns.length) parts.push(`\x1b[1;33m${warns.length} warning${warns.length > 1 ? 's' : ''}\x1b[0m`);
    console.error(`\n  ${parts.join(', ')}`);
  }
}

namespace Ether {
  export type PartialArgs = { [key: string]: string[] };

  const readFile = (p: string) => fs.readFileSync(p, 'utf-8');

  function step(name: string, diag: Diagnostics, fn: () => void) {
    const start = performance.now();
    try {
      fn();
      console.error(`  [${name}] ${(performance.now() - start).toFixed(1)}ms`);
    } catch (e: any) {
      console.error(`  [${name}] FAILED`);
      diag.error(name, e.stack ?? e);
    }
  }

  function discover(rayDir: string) {
    const nodeRayPath = path.join(rayDir, 'Node.ray');
    if (!fs.existsSync(nodeRayPath)) throw new Error(`Missing ${nodeRayPath}`);
    const source = readFile(nodeRayPath);
    const definitions = bootstrap.defs(source);
    console.error(` ${definitions.length} definitions from ${nodeRayPath}`);
    return { definitions, source, path: nodeRayPath };
  }

  function loadDir(rayDir: string, definitions: ReturnType<typeof bootstrap.defs>, ctx: Context, diag: Diagnostics, exclude?: Set<string>) {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ray') && !exclude?.has(full)) files.push(full);
      }
    };
    walk(rayDir);
    console.error(` ${files.length} .ray files in ${rayDir}`);
    const results: { file: string; result: Node; forwards: number }[] = [];
    for (const file of files) {
      const reader = new Reader(readFile(file), definitions, ctx, diag);
      reader.file = file;
      const result = reader.read();
      reader.verify();
      results.push({ file, result, forwards: reader.forwardCount });
    }
    return results;
  }

  function loadFile(filePath: string, definitions: ReturnType<typeof bootstrap.defs>, ctx: Context, diag: Diagnostics) {
    const reader = new Reader(readFile(filePath), definitions, ctx, diag);
    reader.file = filePath;
    const result = reader.read();
    reader.verify();
    return { result, forwards: reader.forwardCount };
  }

  /** Create a class node with a () method that handles receiving a body block */
  function makeClassNode(): Node {
    return new Node().external('()', (self: Node, arg: Node, ctx: Context, reader: Reader) => {
      // Block → discover defs from source, evaluate body with class as scope
      if (typeof arg.value.encoded === 'function' && arg.value.methods.has('expression')) {
        // If self has its own (), it's a class node — modify in place.
        // Otherwise (PROTO fallthrough from shared defNode), create a new result node.
        const isOwnNode = self.value.methods.has('()');
        const target = isOwnNode ? self : new Node(self.value.encoded);

        const bodySource = arg.get('expression').value.encoded;
        if (typeof bodySource === 'string') {
          const bodyOffset = arg.get('__sourceOffset')?.value.encoded;
          for (const def of bootstrap.defs(bodySource, typeof bodyOffset === 'number' ? bodyOffset : 0)) {
            const defKey = JSON.stringify(def.pattern);
            // Don't overwrite existing external implementations with pattern defs
            if (!target.value.methods.has(defKey)) {
              target.external(defKey, () => new Node(def));
            }
          }
        }
        const bodyCtx = new Context(ctx);
        bodyCtx.external('this', () => target);
        arg.value.encoded(bodyCtx);

        // Store original block as __constructor (for class = { ... } handling)
        if (!isOwnNode) target.external('__constructor', () => arg);

        return target;
      }
      // Not a block — pass through (preserves name/identity for modifiers etc.)
      return self;
    });
  }

  function init(location: string, verbose: boolean, diag: Diagnostics) {
    const stat = fs.statSync(location);
    const isDir = stat.isDirectory();
    if (!isDir && !stat.isFile()) throw new Error(`"${location}": not a file or directory`);

    const rayDir = isDir
      ? path.join(location, '.ray')
      : path.join(path.dirname(path.dirname(location)), '.ray');

    let discovered!: ReturnType<typeof discover>;
    const ctx = new Context();

    // --- The * class (Node) is the prototype for all nodes ---
    const starClass = makeClassNode();
    Node.PROTO = starClass;

    // | method: lhs | name → register name as alias for lhs
    Node.PROTO.external_method('|', (self: Node, nameArg: Node, ctx: Context, reader: Reader) => {
      const name = nameArg.value.encoded;
      if (typeof name === 'string') {
        ctx.external(name, () => self);
        reader.resolveForward(name, self);
        // Track alias in classes map (for error messages etc.)
        for (const [, cls] of classes) {
          if (cls === self || cls.value.methods === self.value.methods) { classes.set(name, cls); break; }
        }
      }
      return self;
    });

    // = method: lhs = rhs → register name, resolve forward, lazy_set
    // NOTE: __initializer is set dynamically by the `initializer` modifier from Node.ray,
    // not hardcoded here. The pre-registration in makeClassNode handles read-time availability.
    Node.PROTO.external_method('=', (self: Node, rhs: Node, assignCtx: Context, reader: Reader) => {
      if (typeof self.value.encoded === 'string') {
        const name = self.value.encoded;
        const thisNode = assignCtx.get('this');
        if (!thisNode.none) thisNode.external(name, () => self);
        else assignCtx.external(name, () => self);
        reader.resolveForward(name, self);
      }
      return self.lazy_set(rhs);
    });

    // --- Seed callables in context ---
    const classes = new Map<string, Node>();
    classes.set('*', starClass);

    // class — bootstrap: class(*) returns the star class. Defers to Node.ray's `class = { ... }` once defined.
    ctx.external_method('class', (_self: Node, arg: Node, callCtx: Context, reader: Reader, callPos?: number) => {
      const name = arg.value.encoded;
      if (typeof name === 'string' && name === '*') {
        callCtx.external('*', () => starClass);
        reader.resolveForward('*', starClass);
        return starClass;
      }
      // Defer to Node.ray's class constructor if defined on *
      const classFn = starClass.method('class');
      if (classFn) {
        const classBlock = classFn(starClass, arg, callCtx, reader, callPos).realize();
        // Check for stored constructor block (from class = { ... })
        const ctorGetter = classBlock.value.methods.get('__constructor');
        if (ctorGetter) {
          const ctorBlock = ctorGetter(Node.cast('__constructor'));
          if (typeof ctorBlock.value.encoded === 'function') {
            const newClass = makeClassNode();
            const argName = typeof name === 'string' ? name : null;
            if (argName) {
              callCtx.external(argName, () => newClass);
              reader.resolveForward(argName, newClass);
              classes.set(argName, newClass);
            }
            // Override () on newClass: channel body through the constructor
            newClass.external('()', (_self: Node, bodyArg: Node, bodyCtx: Context, bodyReader: Reader) => {
              const ctorCtx = new Context(callCtx);
              ctorCtx.external('name', () => arg);
              ctorCtx.external('def', () => bodyArg);
              ctorCtx.external('this', () => newClass);
              ctorBlock.value.encoded(ctorCtx);
              return newClass;
            });
            return newClass;
          }
        }
        return classBlock;
      }
      const argName = typeof name === 'string' ? name : describe(arg);
      if (callPos !== undefined) reader.errorAt(callPos, 'resolve', `external class used for non-bootstrap: ${argName}. 'class *' should have a class = { ... } definition.`);
      else reader.diagnostics.error('resolve', `external class used for non-bootstrap: ${argName}. 'class *' should have a class = { ... } definition.`, reader.file);
      return arg;
    });

    /** Find the name of a node by checking the classes map, or "global" if not a class */
    function nodeName(node: Node): string {
      let found: string | null = null;
      for (const [name, cls] of classes) {
        if (cls === node || cls.value.methods === node.value.methods) {
          found = name;
          if (name !== '*') return name; // prefer non-wildcard alias
        }
      }
      return found ?? 'global';
    }

    /** Apply a modifier flag to a method on this.
     *  Evaluates the body in the class context (so definitions land on the class),
     *  uses the first forward ref as the method key, applies the modifier flag. */
    function applyModifier(modifier: string, blockArg: Node, modCtx: Context, reader: Reader, callPos?: number): Node {
      const thisNode = modCtx.get('this');
      if (thisNode.none) return blockArg;

      // Evaluate the body — create sub-reader directly for access to forwards.
      // Use a child context so inner assignments don't leak onto the class.
      const expr = blockArg.get('expression')?.value.encoded;
      if (typeof expr !== 'string') return blockArg;

      const bodyCtx = new Context(modCtx);
      bodyCtx.external('this', () => thisNode);
      const subReader = new Reader(expr, reader.defs, bodyCtx, reader.diagnostics);
      subReader.file = reader.file;
      subReader.pending = reader.pending;
      subReader.subReaders = reader.subReaders;
      reader.subReaders.push(subReader);
      // During reparse, exclude keys that the parent reader previously registered
      // so the sub-reader treats them as forwards (prevents self-resolution)
      subReader.setExcludeKeys(reader.getRegisteredKeys());
      // Set source mapping so errors report correct line:col in the root file
      const rootSrc = blockArg.get('__rootSource')?.value.encoded;
      const srcOffset = blockArg.get('__sourceOffset')?.value.encoded;
      if (typeof rootSrc === 'string' && typeof srcOffset === 'number') {
        subReader.setSourceMapping(rootSrc, srcOffset);
      }
      const methodsBefore = new Set(thisNode.value.methods.keys());
      const result = subReader.read();

      // The method key: first forward ref (e.g., ":" from ": | ∊ | ∈ ..."),
      // or first matched definition pattern key (e.g., '["(",null,")"]' from "({args: *})").
      let key = subReader.firstForwardKey ?? subReader.firstMatchedDef;
      // For nested modifiers: find newly added methods
      if (!key) {
        for (const k of thisNode.value.methods.keys()) {
          if (!methodsBefore.has(k)) { key = k; break; }
        }
      }
      // Collect all modifiers to apply: this one + any pending from outer modifiers
      const pendingMods: string[] = (modCtx as any).__pendingModifiers ?? [];
      const allModifiers = [modifier, ...pendingMods];

      if (key) {
        // Register the method on this so it's available for reparse splitting
        const node = result;
        let newlyRegistered = false;
        if (!thisNode.value.methods.has(key)) {
          thisNode.external(key, () => node);
          subReader.resolveForward(key, node);
          newlyRegistered = true;
        }
        // Track on parent reader so reparse can clean up
        reader.trackRegisteredKey(key);

        // Apply all modifier flags (own + pending from outer modifiers)
        const method = thisNode.value.methods.get(key);
        for (const mod of allModifiers) {
          if (method && mod === 'initializer') {
            method.__initializer = true;
            if (newlyRegistered) method.__splitCandidate = true;
          } else if (mod === 'external') {
            let isRealExternal = false;
            const ownMethod = thisNode.value.methods.get(key);
            const protoMethod = Node.PROTO?.value.methods.get(key);
            for (const m of [ownMethod, protoMethod]) {
              if (!m) continue;
              const probe = m(Node.cast(key));
              const enc = probe.value.encoded;
              if (!(enc && typeof enc === 'object' && 'pattern' in enc && Array.isArray(enc.pattern))) {
                isRealExternal = true; break;
              }
            }
            if (!isRealExternal) {
              if (callPos !== undefined) reader.errorAt(callPos, 'external', `Expected externally defined method '${key}' on ${nodeName(thisNode)}`);
              else reader.diagnostics.error('external', `Expected externally defined method '${key}' on ${nodeName(thisNode)}`, reader.file);
            }
          } else if (method && mod === 'right-to-left') {
            method.__rightToLeft = true;
            // Also propagate to aliases (from | in the body)
            for (const [name, { resolved }] of subReader.forwards) {
              if (name !== key && resolved) {
                if (!thisNode.value.methods.has(name)) {
                  thisNode.external(name, () => node);
                }
                const aliasMethod = thisNode.value.methods.get(name);
                if (aliasMethod) aliasMethod.__rightToLeft = true;
              }
            }
            for (const k of thisNode.value.methods.keys()) {
              if (k !== key && !methodsBefore.has(k)) {
                const aliasMethod = thisNode.value.methods.get(k);
                if (aliasMethod) aliasMethod.__rightToLeft = true;
              }
            }
          } else if (method && mod === 'left-associative') {
            method.__leftAssociative = true;
            for (const [name, { resolved }] of subReader.forwards) {
              if (name !== key && resolved) {
                if (!thisNode.value.methods.has(name)) {
                  thisNode.external(name, () => node);
                }
                const aliasMethod = thisNode.value.methods.get(name);
                if (aliasMethod) aliasMethod.__leftAssociative = true;
              }
            }
            for (const k of thisNode.value.methods.keys()) {
              if (k !== key && !methodsBefore.has(k)) {
                const aliasMethod = thisNode.value.methods.get(k);
                if (aliasMethod) aliasMethod.__leftAssociative = true;
              }
            }
          } else if (method && mod === 'right-associative') {
            method.__rightAssociative = true;
            for (const [name, { resolved }] of subReader.forwards) {
              if (name !== key && resolved) {
                if (!thisNode.value.methods.has(name)) {
                  thisNode.external(name, () => node);
                }
                const aliasMethod = thisNode.value.methods.get(name);
                if (aliasMethod) aliasMethod.__rightAssociative = true;
              }
            }
            for (const k of thisNode.value.methods.keys()) {
              if (k !== key && !methodsBefore.has(k)) {
                const aliasMethod = thisNode.value.methods.get(k);
                if (aliasMethod) aliasMethod.__rightAssociative = true;
              }
            }
          }
        }
      } else if (modifier === 'right-to-left' || modifier === 'left-associative' || modifier === 'right-associative') {
        // Key not found — inner modifier is deferred (lazy). Store our modifier
        // on the bodyCtx so the inner modifier applies it when it eventually runs.
        (bodyCtx as any).__pendingModifiers = [...pendingMods, modifier];
      }

      return result;
    }

    // external — marks method as externally defined
    starClass.external_method('external', (_self: Node, blockArg: Node, extCtx: Context, reader: Reader, callPos?: number) => {
      return applyModifier('external', blockArg, extCtx, reader, callPos);
    }, { args: 'Program' });

    // initializer — marks method as initializer (declares LHS as variable)
    starClass.external_method('initializer', (_self: Node, blockArg: Node, initCtx: Context, reader: Reader, callPos?: number) => {
      return applyModifier('initializer', blockArg, initCtx, reader, callPos);
    }, { args: 'Program' });

    // right-to-left — marks method as right-to-left (reverses invocation direction)
    starClass.external_method('right-to-left', (_self: Node, blockArg: Node, rtlCtx: Context, reader: Reader, callPos?: number) => {
      return applyModifier('right-to-left', blockArg, rtlCtx, reader, callPos);
    }, { args: 'Program' });

    // left-associative — marks method as left-associative (reads one token at a time, chains)
    starClass.external_method('left-associative', (_self: Node, blockArg: Node, laCtx: Context, reader: Reader, callPos?: number) => {
      return applyModifier('left-associative', blockArg, laCtx, reader, callPos);
    }, { args: 'Program' });

    // right-associative — marks method as right-associative (captures rest of line as body)
    starClass.external_method('right-associative', (_self: Node, blockArg: Node, raCtx: Context, reader: Reader, callPos?: number) => {
      return applyModifier('right-associative', blockArg, raCtx, reader, callPos);
    }, { args: 'Program' });

    // external ({args: *}) — call: lazily calls self with args
    Node.PROTO.external('["(",null,")"]', (self: Node) => {
      const callFn: MethodFn = (_: Node, arg: Node, ctx?: any, reader?: any, callPos?: any) => self.lazy_call(arg, ctx, reader, callPos);
      return new Node().external('()', callFn);
    });

    // external [{property: *}] — get: lazily gets property from self
    Node.PROTO.external('["[",null,"]"]', (self: Node) => {
      return new Node().lazily((result) => {
        const prop = self.realize().get('property');
        result.value = prop.value;
      });
    });

    step('discover', diag, () => {
      discovered = discover(rayDir);
      // Register global definitions (strings, comments, delimiters) in context
      for (const def of discovered.definitions) {
        const key = JSON.stringify(def.pattern);
        ctx.external(key, () => new Node(def));
      }
    });

    // Pass 1: load Node.ray to find class * | Node
    step('Node.ray', diag, () => {
      const reader = new Reader(discovered.source, discovered.definitions, ctx, diag);
      reader.file = discovered.path;
      const result = reader.read();
      reader.verify();
      if (verbose) console.error(` Node.ray: ${describe(result)} (${reader.forwardCount} forwards)`);
    });

    // Pass 2: load remaining .ray files (skip top-level Node.ray)
    step('load .ray', diag, () => {
      for (const r of loadDir(rayDir, discovered.definitions, ctx, diag, new Set([discovered.path]))) {
        if (verbose) console.error(`      ${path.basename(r.file)}: ${describe(r.result)} (${r.forwards} forwards)`);
      }
    });

    if (diag.hasErrors) return { definitions: discovered.definitions, ctx, classes, ok: false as const };

    const extra = isDir
      ? (fs.existsSync(path.join(location, 'Ether.ray')) ? path.join(location, 'Ether.ray') : null)
      : location;

    if (extra) {
      step(`load ${path.basename(extra)}`, diag, () => {
        const { result, forwards } = loadFile(extra, discovered.definitions, ctx, diag);
        if (verbose) console.error(`      ${describe(result)} (${forwards} forwards)`);
      });
    }

    return { definitions: discovered.definitions, ctx, classes, ok: !diag.hasErrors as true };
  }

  export function run(defaultPath: string, args: PartialArgs = {}) {
    if ((args['@'] ?? []).length === 0) args['@'] = [defaultPath];
    const location = path.resolve(args['@'][0]);
    delete args['@'];
    const evalExprs = args['eval'] ?? []; delete args['eval'];
    const verbose = !args['quiet']; delete args['quiet'];

    const diag = new Diagnostics();
    const totalStart = performance.now();
    console.error('v0.3 bootstrap:');
    const { definitions, ctx, classes, ok } = init(location, verbose, diag);

    if (verbose) {
      printMethods(ctx, 'context');
      for (const [name, node] of classes) {
        printMethods(node, `class ${name}`);
      }
    }

    if (ok) {
      for (const expr of evalExprs) {
        step(`eval '${expr}'`, diag, () => {
          const reader = new Reader(expr, definitions, ctx, diag);
          reader.file = '<eval>';
          console.log(describe(reader.read()));
        });
      }
    }

    diag.print('v0.3');
    console.error(`  ${(performance.now() - totalStart).toFixed(1)}ms total`);
    if (diag.hasErrors) process.exitCode = 1;

    if (ok && args['repl']) {
      delete args['repl'];
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const prompt = () => {
          rl.question('ray> ', (line: string) => {
            if (!line || line === 'exit' || line === 'quit') { rl.close(); return; }
            const replDiag = new Diagnostics();
            const reader = new Reader(line.trim(), definitions, ctx, replDiag);
            reader.file = '<repl>';
            console.log(describe(reader.read()));
            if (replDiag.hasErrors) replDiag.print();
            prompt();
          });
        };
        prompt();
      });
    }
  }
}

/** Print all methods defined on a Node */
function printMethods(node: Node, label: string, indent = 2) {
  const prefix = ' '.repeat(indent);
  const methods = node.value.methods;
  const internal = new Set(['()', 'local']);
  const visible = [...methods].filter(([k]) => typeof k !== 'string' || !internal.has(k));
  if (visible.length === 0) {
    console.error(`${prefix}\x1b[90m${label}: (empty)\x1b[0m`);
    return;
  }
  console.error(`${prefix}\x1b[90m${label}: (${visible.length} keys)\x1b[0m`);
  for (const [key, fn] of visible) {
    const keyStr = typeof key === 'string' ? key : (key instanceof Node ? describe(key) : String(key));
    const val = fn(Node.cast(key));
    console.error(`${prefix}  ${keyStr} = ${describe(val)}`);
  }
}

/** Describe a Node for debugging */
function describe(node: Node, depth = 0): string {
  if (depth > 3) return '...';
  const enc = node.value.encoded;
  if (enc === null || enc === undefined) return 'none';
  if (enc === UNKNOWN) {
    if (node.value.methods.size > 0) {
      const keys = [...node.value.methods.keys()].filter(k => k !== '()' && k !== 'local');
      return keys.length ? `{${keys.join(', ')}}` : '<node>';
    }
    return '?';
  }
  if (typeof enc === 'function') return '<fn>';
  if (typeof enc === 'object' && enc !== null && '__external' in enc) {
    return `external[${enc.pattern ?? enc.name}]`;
  }
  if (typeof enc === 'object' && enc !== null && 'pattern' in enc && Array.isArray(enc.pattern)) {
    const pat = enc.pattern.map((e: any) => typeof e === 'symbol' ? '*' : JSON.stringify(e)).join(',');
    return `def[${pat}]`;
  }
  if (typeof enc === 'string') return JSON.stringify(enc);
  return String(enc);
}

export { Node, Context, bootstrap, Reader, Diagnostics, Ether, describe };
