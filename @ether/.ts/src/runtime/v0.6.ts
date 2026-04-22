import fs from 'fs';
import path from 'path';

const UNKNOWN = Symbol("Unknown");
const BINDING = Symbol("*");

type MethodFn = ((...args: any[]) => Node) & {
  __args?: 'Program';
  __initializer?: boolean;
  __splitCandidate?: boolean;
  __leftToRight?: boolean;
  __rightToLeft?: boolean;
  __leftAssociative?: boolean;
  __rightAssociative?: boolean;
  __directionSwitch?: boolean;
};

interface Definition {
  pattern: (string | typeof BINDING)[];
  isComment: boolean;
  sourceRange?: [number, number];
}

// ═══════════════════════════════════════════════════════════════
// Node
// ═══════════════════════════════════════════════════════════════

class Node {
  // method(name: string): MethodFn | undefined {
  //   return this.value.methods.get(name)
  //     ?? this.value.methods.get(`[null,${JSON.stringify(name)}]`)
  //     ?? Node.PROTO?.value.methods.get(name)
  //     ?? Node.PROTO?.value.methods.get(`[null,${JSON.stringify(name)}]`);
  // }

  // external_method(name: string, fn: MethodFn, opts?: { args?: 'Program'; initializer?: boolean }): this {
  //   const methodFn: MethodFn = (self: Node) => {
  //     const callFn: MethodFn = (_: Node, ...args: any[]) => fn(self, ...args);
  //     if (opts?.args) callFn.__args = opts.args;
  //     return new Node(name).external('()', callFn);
  //   };
  //   if (opts?.initializer) methodFn.__initializer = true;
  //   return this.external(name, methodFn);
  // }

  // *iter(): Generator<Node> { let n = this.get('next'); while (n && !n.none) { yield n; n = n.get('next'); } }
  static cast = (x: any): Node => x instanceof Node ? x : new Node(x);
}

// ═══════════════════════════════════════════════════════════════
// Reader
// ═══════════════════════════════════════════════════════════════

class Reader {
  rt: Runtime;
  source: string;
  i: number = 0;
  ctx: Context;
  file?: string;
  pending: Node[];
  subReaders: Reader[];
  rootSource?: string;
  baseOffset: number = 0;
  lineOffsets?: number[];
  blockIndent: number = 0;
  _state: Record<string, any> = {};
  _lastLine = 0; _lastLineStart = 0; _lastScanPos = 0;

  constructor(rt: Runtime, source: string, ctx: Context, root?: Reader) {
    this.rt = rt; this.source = source; this.ctx = ctx;
    this.pending = root?.pending ?? []; this.subReaders = root?.subReaders ?? [];
    rt.emit('readerCreate', this);
  }
}

function reader_toRootPos(r: Reader, pos: number): number {
  if (r.lineOffsets) {
    let { _lastLine: line, _lastLineStart: lineStart, _lastScanPos: scanFrom } = r;
    if (pos < scanFrom) { line = 0; lineStart = 0; scanFrom = 0; }
    for (let i = scanFrom; i < pos && i < r.source.length; i++) {
      if (r.source[i] === '\n') { line++; lineStart = i + 1; }
    }
    r._lastLine = line; r._lastLineStart = lineStart; r._lastScanPos = pos;
    return (r.lineOffsets[line] ?? r.lineOffsets[0]) + (pos - lineStart) + r.blockIndent;
  }
  return r.baseOffset + pos;
}

function reader_locate(r: Reader, pos: number): { line: number; col: number } {
  return diagnostics_locate(r.rootSource ?? r.source, reader_toRootPos(r, pos));
}

function reader_setSourceMapping(r: Reader, rootSource: string, baseOffset: number) {
  r.rootSource = rootSource;
  r.baseOffset = baseOffset;
}

// ═══════════════════════════════════════════════════════════════
// Runtime
// ═══════════════════════════════════════════════════════════════

class Runtime {
  name: string;
  diagnostics: Diagnostics;
  context: Context;
  proto: Node | null = null;
  state: Record<string, any> = {};

  apply: (target: Node, arg: Node, reader: Reader, callPos?: number) => Node =
    (target, arg, reader, callPos) => target.realize().call(arg.realize(), reader.ctx, reader, callPos);

  private _hooks: Map<string, Function[]> = new Map();
  hook(event: string, fn: Function) { if (!this._hooks.has(event)) this._hooks.set(event, []); this._hooks.get(event)!.push(fn); }
  emit(event: string, ...args: any[]) { for (const fn of this._hooks.get(event) ?? []) fn(...args); }

  _fileSteps: { type: 'file' | 'directory'; path: string }[] = [];

  constructor(name: string) { this.name = name; this.diagnostics = diagnostics_create(); this.context = new Context(); }
  createReader(source: string, ctx?: Context, root?: Reader): Reader { return new Reader(this, source, ctx ?? this.context, root); }
}

function runtime_load(rt: Runtime, source: string, file?: string): { result: Node; reader: Reader } {
  const reader = rt.createReader(source); reader.file = file;
  const result = rt.read(reader); rt.emit('verify', reader);
  return { result, reader };
}

function runtime_run_loadFile(rt: Runtime, fullPath: string, loaded: Set<string>, verbose: boolean) {
  if (loaded.has(fullPath)) return;
  if (!fs.existsSync(fullPath)) { rt.diagnostics.error('load', `File not found: ${fullPath}`); return; }
  loaded.add(fullPath);
  const start = performance.now();
  const source = fs.readFileSync(fullPath, 'utf-8');

  if (rt.scanDefinitions && !rt.state.definitions) {
    rt.state.definitions = rt.scanDefinitions(source);
    console.error(` ${rt.state.definitions.length} definitions from ${fullPath}`);
    for (const def of rt.state.definitions) rt.context.external(JSON.stringify(def.pattern), () => new Node(def));
  }

  const reader = rt.createReader(source); reader.file = fullPath;
  rt.read(reader); rt.emit('verify', reader);
  if (verbose) {
    const fwds = reader._state.forwards?.forwards?.size ?? 0;
    console.error(`  [${path.basename(fullPath)}] ${(performance.now() - start).toFixed(1)}ms (${fwds} forwards)`);
  }
}

function runtime_run_loadDirectory(rt: Runtime, fullPath: string, loaded: Set<string>, verbose: boolean) {
  const start = performance.now();
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ray') && !loaded.has(full)) files.push(full);
    }
  };
  walk(fullPath);
  console.error(` ${files.length} .ray files in ${fullPath}`);
  for (const file of files) {
    loaded.add(file);
    const source = fs.readFileSync(file, 'utf-8');
    const reader = rt.createReader(source); reader.file = file;
    rt.read(reader); rt.emit('verify', reader);
    if (verbose) {
      const fwds = reader._state.forwards?.forwards?.size ?? 0;
      console.error(`      ${path.basename(file)}: (${fwds} forwards)`);
    }
  }
  console.error(`  [load .ray] ${(performance.now() - start).toFixed(1)}ms`);
}

function runtime_run_loadExtra(rt: Runtime, location: string, isDir: boolean, loaded: Set<string>, verbose: boolean) {
  if (!isDir && !loaded.has(location)) {
    const start = performance.now(); loaded.add(location);
    const reader = rt.createReader(fs.readFileSync(location, 'utf-8')); reader.file = location;
    rt.read(reader); rt.emit('verify', reader);
    if (verbose) console.error(`  [${path.basename(location)}] ${(performance.now() - start).toFixed(1)}ms`);
  } else if (isDir) {
    const etherPath = path.join(location, 'Ether.ray');
    if (fs.existsSync(etherPath) && !loaded.has(etherPath)) {
      const start = performance.now(); loaded.add(etherPath);
      const reader = rt.createReader(fs.readFileSync(etherPath, 'utf-8')); reader.file = etherPath;
      rt.read(reader); rt.emit('verify', reader);
      if (verbose) console.error(`  [Ether.ray] ${(performance.now() - start).toFixed(1)}ms`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Install: Object-Oriented
//   Sets up Node.PROTO, protects its value, wraps lookupMethod.
// ═══════════════════════════════════════════════════════════════

function installOO(rt: Runtime, methods: { name: string; fn: MethodFn; opts?: any }[], externals: { name: string; fn: MethodFn }[]) {
  const baseClass = makeBlockReceiver(rt);
  rt.proto = baseClass;
  Node.PROTO = baseClass;
  protectProtoValue(baseClass);
  for (const { name, fn, opts } of methods) baseClass.external_method(name, fn, opts);
  for (const { name, fn } of externals) baseClass.external(name, fn);
  installMethodLookup(rt);
}

function installMethodLookup(rt: Runtime) {
  const prevLookup = rt.lookupMethod;
  rt.lookupMethod = (node: Node, name: string) => {
    const own = node.value.methods.get(name) ?? node.value.methods.get(`[null,${JSON.stringify(name)}]`);
    if (own) return own;
    return rt.proto!.value.methods.get(name) ?? rt.proto!.value.methods.get(`[null,${JSON.stringify(name)}]`) ?? prevLookup(node, name);
  };
}

// ═══════════════════════════════════════════════════════════════
// Install: Scope
//   Configures rt.resolve (context chain + number literals)
//   and rt.checkThisMethod (implicit self for methods).
// ═══════════════════════════════════════════════════════════════

function installScope(rt: Runtime, recursive: boolean, scopeFroms: { field: string; filter?: (method: MethodFn, partial: Node) => boolean }[], hasOO: boolean) {
  installResolve(rt, recursive, hasOO);
  if (scopeFroms.length > 0) installCheckThisMethod(rt, scopeFroms);
}

function installResolve(rt: Runtime, recursive: boolean, hasOO: boolean) {
  rt.resolve = (name: string, ctx: Context, reader: Reader) => {
    const found = recursive ? ctx.get(name) : (ctx.has(name, false) ? ctx.get(name) : new Node(null));
    if (!found.none) return found;
    if (hasOO && rt.proto) { const m = rt.proto.method(name); if (m) return m(rt.proto); }
    if (/^-?\d+(\.\d+)?$/.test(name)) return new Node(Number(name));
    return new Node(name);
  };
}

function installCheckThisMethod(rt: Runtime, scopeFroms: { field: string; filter?: (method: MethodFn, partial: Node) => boolean }[]) {
  rt.checkThisMethod = (text: string, reader: Reader) => {
    for (const { field, filter } of scopeFroms) {
      const target = reader.ctx.get(field);
      if (target.none) continue;
      const method = rt.lookupMethod(target, text);
      if (!method) continue;
      const partial = method(target);
      if (filter && !filter(method, partial)) continue;
      return partial;
    }
    return null;
  };
}

// ═══════════════════════════════════════════════════════════════
// Install: Lazy
//   Wraps rt.apply to defer calls. Tracks generation per reader.
// ═══════════════════════════════════════════════════════════════

function installLazy(rt: Runtime) {
  rt.apply = (target: Node, arg: Node, reader: Reader, callPos?: number) => {
    const gen = reader._state.lazy?.generation ?? 0;
    const result = new Node().lazily((self) => {
      if (gen < (reader._state.lazy?.generation ?? 0)) return;
      self.value = target.realize().call(arg.realize(), reader.ctx, reader, callPos).realize().value;
    });
    reader.pending.push(result);
    return result;
  };
  rt.hook('readerCreate', (reader: Reader) => {
    reader._state.lazy = { generation: reader._state.lazy?.generation ?? 0 };
  });
}

// ═══════════════════════════════════════════════════════════════
// Per-reader state accessors (used by dynamic grammar pieces)
// ═══════════════════════════════════════════════════════════════

interface PatternState {
  definitions: Definition[];
  defNodes: Map<Definition, Node>;
  defsByFirstChar: Map<string, Definition[]>;
  defFirstChars: Set<string>;
  hasSourceRangeDefs: boolean;
  skippedDefs: Set<Definition> | null;
  matchedDefs: string[];
}

interface ForwardState {
  forwards: Map<string, { node: Node; pos: number; resolved?: boolean }>;
  registeredKeys: Set<string>;
  excludeKeys: Set<string> | null;
}

interface ReparseState {
  generation: number;
  grammarSnapshot: number;
  stale: boolean;
  createdBy: Reader | null;
}

function getPatternState(reader: Reader): PatternState {
  return reader._state.patterns ??= {
    definitions: [], defNodes: new Map(), defsByFirstChar: new Map(),
    defFirstChars: new Set(), hasSourceRangeDefs: false, skippedDefs: null, matchedDefs: []
  };
}

function getForwardState(reader: Reader): ForwardState {
  return reader._state.forwards ??= { forwards: new Map(), registeredKeys: new Set(), excludeKeys: null };
}

function getReparseState(reader: Reader): ReparseState {
  return reader._state.reparse ??= { generation: 0, grammarSnapshot: 0, stale: false, createdBy: null };
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — populate pattern state on reader create
// ═══════════════════════════════════════════════════════════════

function installPatternStateInit(rt: Runtime) {
  const defNodesCache = new WeakMap<Definition[], {
    map: Map<Definition, Node>; hasSourceRange: boolean;
    defsByFirstChar: Map<string, Definition[]>; defFirstChars: Set<string>;
  }>();

  rt.hook('readerCreate', (reader: Reader) => {
    const defs: Definition[] = rt.state.definitions ?? [];
    let cached = defNodesCache.get(defs);
    if (!cached) {
      const map = new Map<Definition, Node>();
      let hasSourceRange = false;
      const defsByFirstChar = new Map<string, Definition[]>();
      const defFirstChars = new Set<string>();
      for (const def of defs) {
        map.set(def, new Node(def));
        if (def.sourceRange) hasSourceRange = true;
        const first = def.pattern[0];
        if (typeof first === 'string' && first.length > 0) {
          const ch = first[0]; defFirstChars.add(ch);
          let arr = defsByFirstChar.get(ch); if (!arr) { arr = []; defsByFirstChar.set(ch, arr); }
          arr.push(def);
        }
      }
      cached = { map, hasSourceRange, defsByFirstChar, defFirstChars };
      defNodesCache.set(defs, cached);
    }
    const ps = getPatternState(reader);
    ps.definitions = defs; ps.defNodes = cached.map;
    ps.hasSourceRangeDefs = cached.hasSourceRange;
    ps.defsByFirstChar = cached.defsByFirstChar; ps.defFirstChars = cached.defFirstChars;
  });
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — pattern boundary
//   Tells readToken when to stop: current char starts a definition.
// ═══════════════════════════════════════════════════════════════

function installPatternBoundary(rt: Runtime) {
  rt.isPatternBoundary = (reader: Reader) => {
    const ps = getPatternState(reader);
    if (!ps.defFirstChars.has(reader.ch())) return false;
    const candidates = ps.defsByFirstChar.get(reader.ch());
    if (!candidates) return false;
    for (const def of candidates) {
      if (ps.skippedDefs?.has(def)) continue;
      if (reader.at(def.pattern[0] as string)) return true;
    }
    return false;
  };
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — compute skipped defs
//   On definition lines, skip the definition's own pattern.
// ═══════════════════════════════════════════════════════════════

function computeSkippedDefs(reader: Reader) {
  const ps = getPatternState(reader);
  ps.skippedDefs = null;
  if (!ps.hasSourceRangeDefs) return;
  const rootPos = reader.lineOffsets ? reader_toRootPos(reader, reader.i) : reader.baseOffset + reader.i;
  for (const def of ps.definitions) {
    if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
      (ps.skippedDefs ??= new Set()).add(def);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — tryPattern
//   Matches {opener}content{closer} patterns against definitions.
//   Returns: Node (matched), null (comment, skip), undefined (no match).
// ═══════════════════════════════════════════════════════════════

function installTryPattern(rt: Runtime) {
  rt.tryPattern = (reader: Reader) => {
    const ps = getPatternState(reader);
    const candidates = ps.defsByFirstChar.get(reader.ch());
    if (!candidates) return undefined;

    for (const def of candidates) {
      const result = tryMatchOnePattern(rt, reader, ps, def);
      if (result !== undefined) return result;
    }
    return undefined;
  };
}

function tryMatchOnePattern(rt: Runtime, reader: Reader, ps: PatternState, def: Definition): Node | null | undefined {
  const isDefLine = ps.skippedDefs?.has(def) ?? false;
  const first = def.pattern[0] as string;
  if (!reader.at(first)) return undefined;
  const startPos = reader.i;
  reader.skip(first.length);

  const last = def.pattern[def.pattern.length - 1];
  const { content, closerFound, lineOffsets } = consumePatternContent(reader, first, last);

  if (def.isComment) return null;
  if (!closerFound) { reader.i = startPos; return undefined; }

  const defKey = JSON.stringify(def.pattern);
  ps.matchedDefs.push(defKey);

  if (isDefLine) return resolveDefLinePattern(reader, ps, def, defKey);

  const isCodeBlock = typeof last === 'string' && last !== first;
  const arg = isCodeBlock
    ? rt.makeBlock!(content, lineOffsets.length > 1
      ? { lineOffsets, blockIndent: 0 }
      : { offset: lineOffsets[0] ?? reader_toRootPos(reader, startPos + first.length) }, reader)
    : new Node(content);
  return rt.apply(ps.defNodes.get(def)!, arg, reader);
}

function consumePatternContent(reader: Reader, first: string, last: string | typeof BINDING): { content: string; closerFound: boolean; lineOffsets: number[] } {
  const lineOffsets: number[] = [];
  let closerFound = true;
  let content: string;

  if (typeof last === 'string' && last !== first) {
    // Paired delimiters with depth tracking
    let depth = 0;
    lineOffsets.push(reader_toRootPos(reader, reader.i));
    const contentStart = reader.i;
    while (!reader.done) {
      if (depth === 0 && reader.at(last)) break;
      if (reader.at(first)) { depth++; reader.skip(first.length); }
      else if (depth > 0 && reader.at(last)) { depth--; reader.skip(last.length); }
      else { if (reader.ch() === '\n') lineOffsets.push(reader_toRootPos(reader, reader.i + 1)); reader.skip(); }
    }
    content = reader.source.slice(contentStart, reader.i);
    if (!reader.done) reader.skip(last.length); else closerFound = false;
  } else if (typeof last === 'string') {
    // Same opener/closer (quotes)
    const contentStart = reader.i;
    while (!reader.done && !reader.at(last)) reader.skip();
    content = reader.source.slice(contentStart, reader.i);
    if (!reader.done) reader.skip(last.length); else closerFound = false;
  } else {
    // No closer: capture to end of line
    const contentStart = reader.i;
    while (!reader.done && reader.ch() !== '\n') reader.skip();
    content = reader.source.slice(contentStart, reader.i);
  }

  return { content, closerFound, lineOffsets };
}

function resolveDefLinePattern(reader: Reader, ps: PatternState, def: Definition, defKey: string): Node {
  const thisNode = reader.ctx.get('this');
  if (!thisNode.none) {
    const method = thisNode.value.methods.get(defKey);
    if (method) return method(thisNode);
  }
  return ps.defNodes.get(def) ?? new Node(def);
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — makeBlock
//   Creates a Node whose encoded is a function(ctx) that spawns
//   a sub-reader and evaluates the block source.
// ═══════════════════════════════════════════════════════════════

function installMakeBlock(rt: Runtime) {
  rt.makeBlock = (blockSource: string, locate: any, parentReader: Reader) => {
    const ps = getPatternState(parentReader);
    const rootSrc = parentReader.rootSource ?? parentReader.source;
    const block = new Node((ctx: Context) => {
      const reader = rt.createReader(blockSource, ctx, parentReader);
      reader.file = parentReader.file;
      reader.rootSource = rootSrc;
      getReparseState(reader).createdBy = parentReader;
      setupBlockSourceMapping(reader, locate, ps, blockSource);
      parentReader.subReaders.push(reader);
      const result = rt.read(reader);
      takeGrammarSnapshot(rt, reader);
      return result;
    });
    block.external('expression', () => new Node(blockSource));
    block.external('__rootSource', () => new Node(rootSrc));
    if ('offset' in locate) block.external('__sourceOffset', () => new Node(locate.offset));
    return block;
  };
}

function setupBlockSourceMapping(reader: Reader, locate: any, ps: PatternState, blockSource: string) {
  if ('offset' in locate) {
    reader.baseOffset = locate.offset;
    if (getPatternState(reader).hasSourceRangeDefs) {
      const blockEnd = locate.offset + blockSource.length;
      let overlaps = false;
      for (const def of ps.definitions) {
        if (def.sourceRange && def.sourceRange[0] < blockEnd && def.sourceRange[1] > locate.offset) { overlaps = true; break; }
      }
      if (!overlaps) getPatternState(reader).hasSourceRangeDefs = false;
    }
  } else {
    reader.lineOffsets = locate.lineOffsets;
    reader.blockIndent = locate.blockIndent;
  }
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — token splitting
//   Splits compound tokens like "foo:" into "foo" + ":"
//   when ":" is a __splitCandidate method.
//
//   Phase 1: longest resolving prefix (scan from end)
//   Phase 2: longest method suffix (scan from start)
//   Phase 3: outside-in single-char method detection
// ═══════════════════════════════════════════════════════════════

function installTokenSplitting(rt: Runtime) {
  rt.trySplit = (text: string, methodNode: Node, reader: Reader) => {
    if (text.length <= 1) return -1;
    let splitAt: number;
    splitAt = trySplit_longestResolvingPrefix(text, methodNode, reader, rt);
    if (splitAt !== -1) return splitAt;
    splitAt = trySplit_longestMethodSuffix(text, methodNode, rt);
    if (splitAt !== -1) return splitAt;
    splitAt = trySplit_outsideInSingleChar(text, methodNode, rt);
    return splitAt;
  };
}

function trySplit_longestResolvingPrefix(text: string, methodNode: Node, reader: Reader, rt: Runtime): number {
  for (let i = text.length - 1; i >= 1; i--) {
    const suffix = text.slice(i);
    const m = rt.lookupMethod(methodNode, suffix);
    if (m && m.__splitCandidate) {
      if (!reader.ctx.get(text.slice(0, i)).none) return i;
      return i; // first fallback
    }
  }
  return -1;
}

function trySplit_longestMethodSuffix(text: string, methodNode: Node, rt: Runtime): number {
  for (let i = 1; i < text.length; i++) {
    const m = rt.lookupMethod(methodNode, text.slice(i));
    if (m && m.__splitCandidate) return i;
  }
  return -1;
}

function trySplit_outsideInSingleChar(text: string, methodNode: Node, rt: Runtime): number {
  const len = text.length;
  for (let offset = 0; offset < Math.ceil(len / 2); offset++) {
    if (rt.lookupMethod(methodNode, text[offset])) return 1;
    const ri = len - 1 - offset;
    if (ri > offset && rt.lookupMethod(methodNode, text[ri])) return 1;
  }
  return -1;
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — forward refs
//   Wraps rt.resolve: if name not found, creates a forward ref
//   node that gets patched later when the name is defined.
// ═══════════════════════════════════════════════════════════════

function installForwardRefs(rt: Runtime) {
  const prevResolve = rt.resolve;

  rt.resolve = (name: string, ctx: Context, reader: Reader) => {
    const fs = getForwardState(reader);

    // Excluded keys (from parent's registered keys during reparse)
    if (fs.excludeKeys?.has(name)) {
      return getOrCreateForward(fs, name, reader);
    }

    const found = prevResolve(name, ctx, reader);
    if (!found.none) {
      // Wrap non-string nodes to preserve token name for methods like =
      if (typeof found.value.encoded !== 'string') {
        const wrapper = new Node(name);
        wrapper.value.methods = found.value.methods;
        return wrapper;
      }
      return found;
    }

    if (/^-?\d+(\.\d+)?$/.test(name)) return new Node(Number(name));
    return getOrCreateForward(fs, name, reader);
  };

  rt.resolveForward = (name: string, node: Node, reader: Reader) => {
    const fwd = getForwardState(reader).forwards.get(name);
    if (fwd) { fwd.node.set(node); fwd.resolved = true; }
  };
}

function getOrCreateForward(fs: ForwardState, name: string, reader: Reader): Node {
  if (!fs.forwards.has(name)) {
    fs.forwards.set(name, { node: new Node(name), pos: reader.i - name.length });
  }
  return fs.forwards.get(name)!.node;
}

// ═══════════════════════════════════════════════════════════════
// Install: Dynamic Grammar — checkProgram
//   If a node's () method has __args === 'Program', capture
//   the rest of the line as a block and apply it.
// ═══════════════════════════════════════════════════════════════

function installCheckProgram(rt: Runtime) {
  rt.checkProgram = (result: Node, reader: Reader, resultPos?: number) => {
    const fn = result.method('()');
    if (fn?.__args === 'Program' && !reader.done && reader.ch() !== '\n') {
      while (!reader.done && reader.ch() === ' ') reader.skip();
      const start = reader.i;
      while (!reader.done && reader.ch() !== '\n') reader.skip();
      const blockSource = reader.source.slice(start, reader.i);
      const block = rt.makeBlock!(blockSource, { offset: reader_toRootPos(reader, start) }, reader);
      return rt.apply(result, block, reader, resultPos);
    }
    return result;
  };
}

// ═══════════════════════════════════════════════════════════════
// Grammar snapshot
// ═══════════════════════════════════════════════════════════════

function takeGrammarSnapshot(rt: Runtime, reader: Reader) {
  let count = rt.proto?.value.methods.size ?? 0;
  const thisNode = reader.ctx.get('this');
  if (!thisNode.none) count += thisNode.value.methods.size;
  getReparseState(reader).grammarSnapshot = count;
}

// ═══════════════════════════════════════════════════════════════
// Install: Reparse loop
//   After all lazy nodes are realized, check if any sub-reader's
//   forwards can now resolve (grammar grew). If so, re-parse it.
// ═══════════════════════════════════════════════════════════════

function installReparseVerify(rt: Runtime, maxRounds: number) {
  rt.hook('readerCreate', (reader: Reader) => { getReparseState(reader); });

  rt.hook('verify', (reader: Reader) => {
    let startIdx = 0;
    for (let round = 0; ; round++) {
      realizePending(reader, startIdx);
      startIdx = reader.pending.length;

      let reparsed = 0;
      for (const sub of reader.subReaders) {
        if (getReparseState(sub).stale) continue;
        if (needsReparse(rt, sub)) { doReparse(rt, sub); reparsed++; }
      }
      if (!reparsed) break;
      if (round > maxRounds) { rt.diagnostics.error('verify', `Re-parse fixpoint did not converge after ${maxRounds} rounds`); break; }
    }
    reportUnresolvedForwards(rt, reader);
  });
}

function installSimpleVerify(rt: Runtime) {
  rt.hook('verify', (reader: Reader) => {
    for (let i = 0; i < reader.pending.length; i++) reader.pending[i].realize();
    reportUnresolvedForwards(rt, reader);
  });
}

function realizePending(reader: Reader, startIdx: number) {
  for (let i = startIdx; i < reader.pending.length; i++) {
    let prevLen = reader.pending.length;
    reader.pending[i].realize();
    while (reader.pending.length > prevLen) {
      const newStart = prevLen; prevLen = reader.pending.length;
      for (let j = newStart; j < prevLen; j++) reader.pending[j].realize();
    }
  }
}

function needsReparse(rt: Runtime, reader: Reader): boolean {
  const rs = getReparseState(reader);
  if (rs.stale) return false;
  const fs = getForwardState(reader);
  if (fs.forwards.size === 0) return false;
  let count = rt.proto?.value.methods.size ?? 0;
  const thisNode = reader.ctx.get('this');
  if (!thisNode.none) count += thisNode.value.methods.size;
  if (count <= rs.grammarSnapshot) return false;
  for (const [name, { resolved }] of fs.forwards) {
    if (resolved) continue;
    if (rt.proto?.method(name)) return true;
    if (!thisNode.none && thisNode.method(name)) return true;
    if (!reader.ctx.get(name).none) return true;
    if (canSplitName(rt, name, thisNode)) return true;
  }
  return false;
}

function canSplitName(rt: Runtime, name: string, thisNode: Node): boolean {
  if (name.length <= 1) return false;
  for (let i = 1; i < name.length; i++) {
    const suffix = name.slice(i);
    const m = rt.proto?.method(suffix) ?? (!thisNode.none ? thisNode.method(suffix) : undefined);
    if (m && m.__splitCandidate) return true;
  }
  return false;
}

function doReparse(rt: Runtime, reader: Reader) {
  const rs = getReparseState(reader);
  const ls = reader._state.lazy;
  if (ls) ls.generation = (ls.generation ?? 0) + 1;
  rs.generation = (rs.generation ?? 0) + 1;

  const thisNode = reader.ctx.get('this');
  const fs = getForwardState(reader);

  // Clean up compound names that can now be split
  for (const [name] of fs.forwards) {
    if (canSplitName(rt, name, thisNode)) {
      if (!thisNode.none) thisNode.value.methods.delete(name);
      reader.ctx.value.methods.delete(name);
    }
  }
  for (const key of fs.registeredKeys) {
    if (canSplitName(rt, key, thisNode)) {
      if (!thisNode.none) thisNode.value.methods.delete(key);
      reader.ctx.value.methods.delete(key);
      fs.registeredKeys.delete(key);
    }
  }

  // Mark child sub-readers as stale
  const staleSet = new Set<Reader>([reader]);
  for (const sub of reader.subReaders) {
    if (!getReparseState(sub).stale && getReparseState(sub).createdBy && staleSet.has(getReparseState(sub).createdBy!)) {
      getReparseState(sub).stale = true; staleSet.add(sub);
    }
  }

  reader.i = 0;
  reader._lastLine = 0; reader._lastLineStart = 0; reader._lastScanPos = 0;
  fs.forwards.clear();
  getPatternState(reader).matchedDefs = [];
  rt.read(reader);
  takeGrammarSnapshot(rt, reader);
}

function reportUnresolvedForwards(rt: Runtime, reader: Reader) {
  const report = (r: Reader) => {
    if (getReparseState(r).stale) return;
    for (const [name, { pos, resolved }] of getForwardState(r).forwards) {
      if (resolved) continue;
      const loc = reader_locate(r, pos);
      rt.diagnostics.error('resolve', `Unresolved identifier: ${name}`, r.file, loc.line, loc.col);
    }
  };
  report(reader);
  for (const sub of reader.subReaders) report(sub);
}

// ═══════════════════════════════════════════════════════════════
// Compose: installDynamicGrammar
//   Wires all the above pieces together.
// ═══════════════════════════════════════════════════════════════

function installDynamicGrammar(rt: Runtime, recognizer: (source: string, baseOffset?: number) => Definition[], reparseConfig: { maxRounds: number } | null) {
  rt.scanDefinitions = recognizer;
  installPatternStateInit(rt);
  installPatternBoundary(rt);
  installTryPattern(rt);
  installMakeBlock(rt);
  installTokenSplitting(rt);
  installForwardRefs(rt);
  installCheckProgram(rt);
  if (reparseConfig) installReparseVerify(rt, reparseConfig.maxRounds);
  else installSimpleVerify(rt);
}

// ═══════════════════════════════════════════════════════════════
// Install: readToken
//   Reads a whitespace-delimited token, stopping at pattern boundaries.
// ═══════════════════════════════════════════════════════════════

function installReadToken(rt: Runtime, splitConfig: Record<string, string> | null) {
  const sepChars = new Set<string>();
  if (splitConfig) { for (const char of Object.values(splitConfig)) sepChars.add(char); }
  else { sepChars.add(' '); sepChars.add('\n'); }

  rt.readToken = (reader: Reader) => {
    const start = reader.i;
    while (!reader.done && !sepChars.has(reader.ch())) {
      if (reader.i > start && rt.isPatternBoundary?.(reader)) break;
      reader.skip();
    }
    return reader.source.slice(start, reader.i);
  };
}

// ═══════════════════════════════════════════════════════════════
// Install: handleDirection
//   Dispatches RTL methods. Three modes:
//     - directionSwitch (</): re-evaluate preceding tokens backwards
//     - leftAssociative: read one token as body, chain
//     - rightAssociative: capture rest of line as body
// ═══════════════════════════════════════════════════════════════

function installHandleDirection(rt: Runtime) {
  rt.handleDirection = (method, result, text, lastArg, reader, resultPos, tokenStart) => {
    if (!method.__rightToLeft) return null;
    if (method.__directionSwitch) return handleDirectionSwitch(rt, result, reader, resultPos, tokenStart);
    const target = lastArg ?? result;
    if (method.__leftAssociative) return handleLeftAssociativeRTL(rt, method, text, target, reader, tokenStart);
    return handleRightAssociativeRTL(rt, method, text, target, reader, tokenStart);
  };
}

function handleDirectionSwitch(rt: Runtime, result: Node, reader: Reader, resultPos: number, tokenStart: number): { result: Node; lastArg: Node | null } {
  while (!reader.done && reader.ch() === ' ') reader.skip();
  let startNode: Node;
  if (reader.done || reader.ch() === '\n') { startNode = reader.ctx.get('this'); }
  else { const t = rt.readToken(reader); startNode = t ? rt.resolve(t, reader.ctx, reader) : reader.ctx.get('this'); }

  const exprSource = reader.source.slice(resultPos, tokenStart).trimEnd();
  let rtlResult = startNode;
  let p = exprSource.length;
  while (p > 0) {
    while (p > 0 && exprSource[p - 1] === ' ') p--;
    if (p <= 0) break;
    const ch = exprSource[p - 1];
    const m = rt.lookupMethod(rtlResult, ch);
    if (m) { rtlResult = m(rtlResult, new Node(ch), reader.ctx, reader); p--; continue; }
    const wordEnd = p;
    while (p > 0 && exprSource[p - 1] !== ' ') p--;
    const word = exprSource.slice(p, wordEnd);
    const wm = rt.lookupMethod(rtlResult, word);
    if (wm) rtlResult = wm(rtlResult, new Node(word), reader.ctx, reader);
    else rtlResult = rt.apply(rtlResult, rt.resolve(word, reader.ctx, reader), reader, resultPos);
  }
  return { result: rtlResult, lastArg: null };
}

function handleLeftAssociativeRTL(rt: Runtime, method: MethodFn, text: string, target: Node, reader: Reader, tokenStart: number): { result: Node; lastArg: Node | null } | null {
  while (!reader.done && reader.ch() === ' ') reader.skip();
  let body: Node | null = null;
  if (rt.tryPattern) {
    const m = rt.tryPattern(reader);
    if (m !== undefined && m !== null) body = m;
  }
  if (!body) { const t = rt.readToken(reader); if (t) body = rt.resolve(t, reader.ctx, reader); }
  if (body) {
    const partial = method(body, new Node(text), reader.ctx, reader);
    return { result: rt.apply(partial, target, reader, tokenStart), lastArg: null };
  }
  return null;
}

function handleRightAssociativeRTL(rt: Runtime, method: MethodFn, text: string, target: Node, reader: Reader, tokenStart: number): { result: Node; lastArg: Node | null } | null {
  while (!reader.done && reader.ch() === ' ') reader.skip();
  const start = reader.i;
  while (!reader.done && reader.ch() !== '\n') reader.skip();
  const bodySource = reader.source.slice(start, reader.i);
  if (bodySource && rt.makeBlock) {
    const body = rt.makeBlock(bodySource, { offset: reader_toRootPos(reader, start) }, reader);
    const partial = method(body, new Node(text), reader.ctx, reader);
    return { result: rt.apply(partial, target, reader, tokenStart), lastArg: null };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Install: readLine
//   Reads one line. Tries each token against these steps in order:
//     1. tryPattern          — definition pattern match
//     2. readToken           — whitespace-delimited word
//     3. tryMethodOnResult   — is this word a method on the current result?
//     4. tryImplicitSelf     — is this word a method on `this`?
//     5. tryContextResolve   — does the context have this name?
//     6. tryTokenSplit       — can we split "foo:" into "foo" + ":"?
//     7. forwardRef          — create/reuse a forward reference
// ═══════════════════════════════════════════════════════════════

function installReadLine(rt: Runtime) {
  rt.readLine = (reader: Reader) => {
    if (rt.tryPattern) computeSkippedDefs(reader);

    let result: Node | null = null;
    let resultPos = reader.i;
    let lastArg: Node | null = null;

    while (!reader.done && reader.ch() !== '\n') {
      if (reader.ch() === ' ') { reader.skip(); continue; }
      const tokenStart = reader.i;

      // Step 1: pattern
      const patternResult = readLine_tryPattern(rt, reader);
      if (patternResult === null) continue; // comment
      if (patternResult !== undefined) {
        ({ result, resultPos, lastArg } = readLine_applyOrSet(rt, result, resultPos, lastArg, patternResult, tokenStart, reader));
        continue;
      }

      // Step 2: token
      const text = rt.readToken(reader);
      if (!text) continue;

      // Step 3: method on result
      if (result !== null) {
        const stepped = readLine_tryMethodOnResult(rt, result, text, lastArg, reader, resultPos, tokenStart);
        if (stepped !== undefined) { result = stepped.result; lastArg = stepped.lastArg; continue; }
      }

      // Step 4: implicit self
      if (result === null) {
        const selfResult = readLine_tryImplicitSelf(rt, text, reader);
        if (selfResult !== undefined) {
          result = selfResult; resultPos = tokenStart; lastArg = null;
          if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
          continue;
        }
      }

      // Step 5: context
      if (!reader.ctx.get(text).none) {
        const resolved = rt.resolve(text, reader.ctx, reader);
        ({ result, resultPos, lastArg } = readLine_applyOrSet(rt, result, resultPos, lastArg, resolved, tokenStart, reader));
        continue;
      }

      // Step 6: token split
      const splitResult = readLine_tryTokenSplit(rt, result, text, reader, resultPos, tokenStart);
      if (splitResult !== undefined) { result = splitResult.result; resultPos = splitResult.resultPos; lastArg = splitResult.lastArg; continue; }

      // Step 7: forward ref
      const resolved = rt.resolve(text, reader.ctx, reader);
      ({ result, resultPos, lastArg } = readLine_applyOrSet(rt, result, resultPos, lastArg, resolved, tokenStart, reader));
    }

    return result ?? new Node(null);
  };
}

function readLine_tryPattern(rt: Runtime, reader: Reader): Node | null | undefined {
  if (!rt.tryPattern) return undefined;
  return rt.tryPattern(reader);
}

function readLine_applyOrSet(rt: Runtime, result: Node | null, resultPos: number, lastArg: Node | null, value: Node, tokenStart: number, reader: Reader) {
  if (result) {
    lastArg = value;
    result = rt.apply(result, value, reader, resultPos);
  } else {
    result = value; resultPos = tokenStart; lastArg = null;
  }
  if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
  return { result, resultPos, lastArg };
}

function readLine_tryMethodOnResult(rt: Runtime, result: Node, text: string, lastArg: Node | null, reader: Reader, resultPos: number, tokenStart: number): { result: Node; lastArg: Node | null } | undefined {
  const method = rt.lookupMethod(result, text);
  if (!method) return undefined;
  if (rt.handleDirection) {
    const dirResult = rt.handleDirection(method, result, text, lastArg, reader, resultPos, tokenStart);
    if (dirResult) return dirResult;
  }
  let newResult = method(result, new Node(text), reader.ctx, reader);
  if (rt.checkProgram) newResult = rt.checkProgram(newResult, reader, tokenStart);
  return { result: newResult, lastArg: null };
}

function readLine_tryImplicitSelf(rt: Runtime, text: string, reader: Reader): Node | undefined {
  if (!rt.checkThisMethod) return undefined;
  const r = rt.checkThisMethod(text, reader);
  return r ?? undefined;
}

function readLine_tryTokenSplit(rt: Runtime, result: Node | null, text: string, reader: Reader, resultPos: number, tokenStart: number): { result: Node; resultPos: number; lastArg: Node | null } | undefined {
  if (!rt.trySplit || text.length <= 1) return undefined;
  const methodNode = result ?? rt.proto;
  if (!methodNode) return undefined;
  const splitAt = rt.trySplit(text, methodNode, reader);
  if (splitAt === -1) return undefined;
  reader.i -= (text.length - splitAt);
  const prefix = text.slice(0, splitAt);
  const resolved = rt.resolve(prefix, reader.ctx, reader);
  if (result) {
    let r = rt.apply(result, resolved, reader, resultPos);
    if (rt.checkProgram) r = rt.checkProgram(r, reader, resultPos);
    return { result: r, resultPos, lastArg: resolved };
  } else {
    let r: Node = resolved;
    if (rt.checkProgram) r = rt.checkProgram(r, reader, tokenStart);
    return { result: r, resultPos: tokenStart, lastArg: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// Install: read (multi-line)
//   Iterates lines. After each line, peeks at next indent to
//   detect indented blocks.
// ═══════════════════════════════════════════════════════════════

function installRead(rt: Runtime, hasIndentation: boolean) {
  rt.read = (reader: Reader) => {
    // Fast path: single line
    if (reader.source.indexOf('\n') === -1) return rt.readLine(reader);

    let lastResult: Node | null = null;
    while (!reader.done) {
      if (reader.ch() === '\n') { reader.skip(); continue; }

      const pos = reader.i;
      const indent = reader.indent();
      if (reader.done || reader.ch() === '\n') continue;

      // Peek for comment lines
      if (rt.tryPattern) {
        computeSkippedDefs(reader);
        const savedPos = reader.i;
        const peek = rt.tryPattern(reader);
        if (peek === null) continue;
        if (peek !== undefined) reader.i = savedPos;
      }

      const result = rt.readLine(reader);
      if (reader.ch() === '\n') reader.skip();

      if (hasIndentation) {
        const block = read_tryIndentedBlock(rt, reader, indent);
        if (block) { lastResult = rt.apply(result, block, reader); continue; }
      }

      lastResult = result;
    }
    return lastResult ?? new Node(null);
  };
}

function read_tryIndentedBlock(rt: Runtime, reader: Reader, currentIndent: number): Node | null {
  if (reader.done) return null;
  const peekPos = reader.i;
  while (!reader.done && reader.ch() === '\n') reader.skip();
  let nextIndent = 0;
  if (!reader.done) { nextIndent = reader.indent(); reader.i = peekPos; }
  else { reader.i = peekPos; return null; }
  if (nextIndent <= currentIndent) { reader.i = peekPos; return null; }
  while (!reader.done && reader.ch() === '\n') reader.skip();
  return readBlock(rt, reader, nextIndent);
}

// ═══════════════════════════════════════════════════════════════
// readBlock
//   Captures lines at blockIndent or deeper, returns a block node.
// ═══════════════════════════════════════════════════════════════

function readBlock(rt: Runtime, reader: Reader, blockIndent: number): Node {
  const lines: string[] = [];
  const lineOffsets: number[] = [];

  while (!reader.done) {
    const pos = reader.i;
    if (reader.ch() === '\n') { reader.skip(); continue; }
    const ind = reader.indent();

    if (rt.tryPattern) {
      computeSkippedDefs(reader);
      const savedPos = reader.i;
      const peek = rt.tryPattern(reader);
      if (peek === null) continue;
      if (peek !== undefined) reader.i = savedPos;
    }

    if (ind < blockIndent && !reader.done && reader.ch() !== '\n') { reader.i = pos; break; }

    lineOffsets.push(reader_toRootPos(reader, pos));
    const relIndent = ' '.repeat(Math.max(0, ind - blockIndent));
    const contentStart = reader.i;
    while (!reader.done && reader.ch() !== '\n') reader.skip();
    lines.push(relIndent + reader.source.slice(contentStart, reader.i));
  }

  return rt.makeBlock!(lines.join('\n'), { lineOffsets, blockIndent }, reader);
}

// ═══════════════════════════════════════════════════════════════
// Compose: installReader
//   Wires readToken + handleDirection + readLine + read together.
// ═══════════════════════════════════════════════════════════════

function installReader(rt: Runtime, lang: { _splitConfig: Record<string, string> | null; _blocks: { type: 'indented' | 'delimited' }[]; _direction: 'ltr' | 'rtl'; _associativity: 'left' | 'right' }) {
  installReadToken(rt, lang._splitConfig);
  installHandleDirection(rt);
  installReadLine(rt);
  installRead(rt, lang._blocks.some(b => b.type === 'indented'));
}

// ═══════════════════════════════════════════════════════════════
// makeBlockReceiver
//   Creates a node that receives block bodies:
//   discovers inner defs, evaluates in child scope.
// ═══════════════════════════════════════════════════════════════

function makeBlockReceiver(rt: Runtime): Node {
  return new Node().external('()', (self: Node, arg: Node, ctx: Context, reader: Reader) => {
    if (typeof arg.value.encoded === 'function' && arg.value.methods.has('expression')) {
      const isOwnNode = self.value.methods.has('()');
      const target = isOwnNode ? self : new Node(self.value.encoded);

      const bodySource = arg.get('expression').value.encoded;
      if (typeof bodySource === 'string' && rt.scanDefinitions) {
        const bodyOffset = arg.get('__sourceOffset')?.value.encoded;
        for (const def of rt.scanDefinitions(bodySource, typeof bodyOffset === 'number' ? bodyOffset : 0)) {
          const defKey = JSON.stringify(def.pattern);
          if (!target.value.methods.has(defKey)) target.external(defKey, () => new Node(def));
        }
      }
      const bodyCtx = new Context(ctx);
      bodyCtx.external('this', () => target);
      arg.value.encoded(bodyCtx);
      if (!isOwnNode) target.external('__constructor', () => arg);
      return target;
    }
    return self;
  });
}

// ═══════════════════════════════════════════════════════════════
// applyModifier
//   Evaluates a modifier body (e.g. `initializer : | ∊`) in
//   a sub-reader, finds the method key, applies flags.
// ═══════════════════════════════════════════════════════════════

function modifier(name: string): MethodFn {
  return (self: Node, blockArg: Node, modCtx: Context, reader: Reader) => {
    return applyModifier(name, blockArg, modCtx, reader, reader.rt);
  };
}

function applyModifier(mod: string, blockArg: Node, modCtx: Context, reader: Reader, rt: Runtime): Node {
  const thisNode = modCtx.get('this');
  if (thisNode.none) return blockArg;
  const expr = blockArg.get('expression')?.value.encoded;
  if (typeof expr !== 'string') return blockArg;

  const subReader = applyModifier_createSubReader(rt, expr, modCtx, reader, blockArg, thisNode);
  const methodsBefore = new Set(thisNode.value.methods.keys());
  const result = rt.read(subReader);
  const key = applyModifier_findKey(subReader, thisNode, methodsBefore);

  const pendingMods: string[] = (modCtx as any).__pendingModifiers ?? [];
  const allModifiers = [mod, ...pendingMods];

  if (key) {
    applyModifier_registerAndFlag(rt, thisNode, key, result, subReader, reader, methodsBefore, allModifiers);
  } else if (mod === 'left-to-right' || mod === 'right-to-left' || mod === 'left-associative' || mod === 'right-associative') {
    const bodyCtx = subReader.ctx;
    (bodyCtx as any).__pendingModifiers = [...pendingMods, mod];
  }

  return result;
}

function applyModifier_createSubReader(rt: Runtime, expr: string, modCtx: Context, reader: Reader, blockArg: Node, thisNode: Node): Reader {
  const bodyCtx = new Context(modCtx);
  bodyCtx.external('this', () => thisNode);
  const subReader = rt.createReader(expr, bodyCtx, reader);
  subReader.file = reader.file;
  subReader.pending = reader.pending;
  subReader.subReaders = reader.subReaders;
  reader.subReaders.push(subReader);

  const parentFs = reader._state.forwards;
  if (parentFs?.registeredKeys) {
    const subFs = subReader._state.forwards ??= { forwards: new Map(), registeredKeys: new Set(), excludeKeys: null };
    subFs.excludeKeys = parentFs.registeredKeys;
  }

  const rootSrc = blockArg.get('__rootSource')?.value.encoded;
  const srcOffset = blockArg.get('__sourceOffset')?.value.encoded;
  if (typeof rootSrc === 'string' && typeof srcOffset === 'number') reader_setSourceMapping(subReader, rootSrc, srcOffset);

  return subReader;
}

function applyModifier_findKey(subReader: Reader, thisNode: Node, methodsBefore: Set<string | Node>): string | null {
  const subFs = subReader._state.forwards;
  let key: string | null = null;
  if (subFs?.forwards) { for (const [k] of subFs.forwards) { key = k; break; } }
  const subPs = subReader._state.patterns;
  if (!key && subPs?.matchedDefs?.length) key = subPs.matchedDefs[0];
  if (!key) { for (const k of thisNode.value.methods.keys()) { if (!methodsBefore.has(k)) { key = k as string; break; } } }
  return key;
}

function applyModifier_registerAndFlag(rt: Runtime, thisNode: Node, key: string, result: Node, subReader: Reader, reader: Reader, methodsBefore: Set<string | Node>, allModifiers: string[]) {
  let newlyRegistered = false;
  if (!thisNode.value.methods.has(key)) {
    thisNode.external(key, () => result);
    const subFs = subReader._state.forwards;
    if (subFs?.forwards) { const fwd = subFs.forwards.get(key); if (fwd) { fwd.node.set(result); fwd.resolved = true; } }
    newlyRegistered = true;
  }
  if (reader._state.forwards) {
    reader._state.forwards.registeredKeys ??= new Set();
    reader._state.forwards.registeredKeys.add(key);
  }

  const method = thisNode.value.methods.get(key);
  for (const m of allModifiers) {
    if (method && m === 'initializer') {
      method.__initializer = true;
      if (newlyRegistered) method.__splitCandidate = true;
    } else if (m === 'external') {
      applyModifier_checkExternal(rt, thisNode, key, reader);
    } else if (method && (m === 'left-to-right')) {
      method.__leftToRight = true;
      propagateFlag(thisNode, subReader._state.forwards, methodsBefore, key, '__leftToRight', result);
    } else if (method && (m === 'right-to-left')) {
      method.__rightToLeft = true;
      propagateFlag(thisNode, subReader._state.forwards, methodsBefore, key, '__rightToLeft', result);
    } else if (method && (m === 'left-associative')) {
      method.__leftAssociative = true;
      propagateFlag(thisNode, subReader._state.forwards, methodsBefore, key, '__leftAssociative', result);
    } else if (method && (m === 'right-associative')) {
      method.__rightAssociative = true;
      propagateFlag(thisNode, subReader._state.forwards, methodsBefore, key, '__rightAssociative', result);
    }
  }
}

function applyModifier_checkExternal(rt: Runtime, thisNode: Node, key: string, reader: Reader) {
  let isRealExternal = false;
  for (const check of [thisNode.value.methods.get(key), rt.proto?.value.methods.get(key)]) {
    if (!check) continue;
    const probe = check(Node.cast(key));
    const enc = probe.value.encoded;
    if (!(enc && typeof enc === 'object' && 'pattern' in enc && Array.isArray(enc.pattern))) { isRealExternal = true; break; }
  }
  if (!isRealExternal) rt.diagnostics.error('external', `Expected externally defined method '${key}'`, reader.file);
}

function propagateFlag(thisNode: Node, subFs: any, methodsBefore: Set<any>, key: string, flag: string, result: Node) {
  if (subFs?.forwards) {
    for (const [name, { resolved }] of subFs.forwards) {
      if (name !== key && resolved) {
        if (!thisNode.value.methods.has(name)) thisNode.external(name, () => result);
        const m = thisNode.value.methods.get(name); if (m) (m as any)[flag] = true;
      }
    }
  }
  for (const k of thisNode.value.methods.keys()) {
    if (k !== key && !methodsBefore.has(k)) { const m = thisNode.value.methods.get(k); if (m) (m as any)[flag] = true; }
  }
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

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
  if (typeof enc === 'object' && enc !== null && '__external' in enc) return `external[${enc.pattern ?? enc.name}]`;
  if (typeof enc === 'object' && enc !== null && 'pattern' in enc && Array.isArray(enc.pattern)) {
    return `def[${enc.pattern.map((e: any) => typeof e === 'symbol' ? '*' : JSON.stringify(e)).join(',')}]`;
  }
  if (typeof enc === 'string') return JSON.stringify(enc);
  return String(enc);
}

function printMethods(node: Node, label: string, indent = 2) {
  const prefix = ' '.repeat(indent);
  const internal = new Set(['()', 'local']);
  const visible = [...node.value.methods].filter(([k]) => typeof k !== 'string' || !internal.has(k));
  if (visible.length === 0) { console.error(`${prefix}\x1b[90m${label}: (empty)\x1b[0m`); return; }
  console.error(`${prefix}\x1b[90m${label}: (${visible.length} keys)\x1b[0m`);
  for (const [key, fn] of visible) {
    const keyStr = typeof key === 'string' ? key : (key instanceof Node ? describe(key) : String(key));
    console.error(`${prefix}  ${keyStr} = ${describe(fn(Node.cast(key)))}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Ray pattern recognition
//   Pure function: source → Definition[].
//   Scans for {}-delimited patterns, comments, modifiers.
// ═══════════════════════════════════════════════════════════════

function rayPatternRecognition(source: string, baseOffset = 0): Definition[] {
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
    if (at('left-to-right ')) { skip(14); }
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

      if (at('{{')) { afterBlockClose = false; flush(); pattern.push('{'); seenBlock = true; depth = 1; skip(2); }
      else if (source[i] === '{') { afterBlockClose = false; flush(); seenBlock = true; depth++; skip(); }
      else if (source[i] === ' ' && afterBlockClose) {
        flush(); afterBlockClose = false;
        let peek = i + 1;
        while (peek < source.length && source[peek] === ' ') peek++;
        if (peek < source.length && source[peek] === '|') { skip(); }
        else { hasArrow = true; skipLine(); break; }
      } else if (at('=>') && (i === 0 || source[i - 1] === ' ' || source[i - 1] === '\n')) {
        hasArrow = true; text = ''; skip(2); skipLine(); break;
      } else if (source[i] === '|' && seenBlock) {
        afterBlockClose = false; flush(); alts.push(pattern); pattern = []; seenBlock = false; skip();
      } else if (source[i] === '\n') {
        afterBlockClose = false;
        if (!seenBlock || depth === 0) {
          if (seenBlock && !hasArrow) {
            let j = i + 1, nextIndent = 0;
            while (j < source.length && source[j] === ' ') { nextIndent++; j++; }
            if (nextIndent > lineIndent && j < source.length && source[j] !== '\n') {
              hasArrow = true;
              skip();
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
      } else { text += source[i]; skip(); }
    }

    if (!hasArrow) flush();
    if (seenBlock && (hasArrow || isExternal)) alts.push(pattern);
    for (const p of alts) {
      if (!p.length) continue;
      if (indented && !isExternal) {
        const first = p[0], last = p[p.length - 1];
        if (typeof first === 'string' && first.length <= 2 && typeof last === 'string' && first !== last) { /* ok */ }
        else if (first === BINDING && typeof last === 'string' && last.length <= 2) { /* ok */ }
        else continue;
      }
      defs.push({ pattern: p, isComment, sourceRange: [baseOffset + lineStart, baseOffset + i] as [number, number] });
    }
  }

  return defs;
}

// ═══════════════════════════════════════════════════════════════
// Ray language composition
// ═══════════════════════════════════════════════════════════════

function ray_assign(self: Node, rhs: Node, ctx: Context, reader: Reader): Node {
  if (typeof self.value.encoded === 'string') {
    const name = self.value.encoded;
    const thisNode = ctx.get('this');
    if (!thisNode.none) thisNode.external(name, () => self);
    else ctx.external(name, () => self);
    reader.rt.resolveForward?.(name, self, reader);
  }
  return self.lazy_set(rhs);
}

function ray_alias(self: Node, nameArg: Node, ctx: Context, reader: Reader): Node {
  const name = nameArg.value.encoded;
  if (typeof name === 'string') {
    ctx.external(name, () => self);
    reader.rt.resolveForward?.(name, self, reader);
    const classes = reader.rt.state.classes;
    if (classes) { for (const [, cls] of classes) { if (cls === self || cls.value.methods === self.value.methods) { classes.set(name, cls); break; } } }
  }
  return self;
}

function ray_class(_self: Node, arg: Node, ctx: Context, reader: Reader): Node {
  const rt = reader.rt;
  const name = arg.value.encoded;
  const classes = rt.state.classes;

  if (typeof name === 'string' && name === '*') {
    ctx.external('*', () => rt.proto!);
    rt.resolveForward?.('*', rt.proto!, reader);
    return rt.proto!;
  }

  const classFn = rt.proto!.method('class');
  if (classFn) {
    const classBlock = classFn(rt.proto!, arg, ctx, reader).realize();
    const ctorGetter = classBlock.value.methods.get('__constructor');
    if (ctorGetter) {
      const ctorBlock = ctorGetter(Node.cast('__constructor'));
      if (typeof ctorBlock.value.encoded === 'function') {
        const newClass = makeBlockReceiver(rt);
        const argName = typeof name === 'string' ? name : null;
        if (argName) { ctx.external(argName, () => newClass); rt.resolveForward?.(argName, newClass, reader); classes?.set(argName, newClass); }
        newClass.external('()', (_s: Node, bodyArg: Node, bodyCtx: Context) => {
          const ctorCtx = new Context(ctx);
          ctorCtx.external('name', () => arg); ctorCtx.external('def', () => bodyArg); ctorCtx.external('this', () => newClass);
          ctorBlock.value.encoded(ctorCtx);
          return newClass;
        });
        return newClass;
      }
    }
    return classBlock;
  }

  const newClass = makeBlockReceiver(rt);
  const argName = typeof name === 'string' ? name : null;
  if (argName) { ctx.external(argName, () => newClass); rt.resolveForward?.(argName, newClass, reader); classes?.set(argName, newClass); }
  return newClass;
}

function ray_callPattern(self: Node): Node {
  const callFn: MethodFn = (_: Node, arg: Node, ctx?: any, reader?: any, callPos?: any) => self.lazy_call(arg, ctx, reader, callPos);
  return new Node().external('()', callFn);
}

function ray_indexPattern(self: Node): Node {
  return new Node().lazily((result) => { result.value = self.realize().get('property').value; });
}

const ray_rtlPreference: MethodFn = Object.assign(((self: Node) => self) as MethodFn, { __rightToLeft: true, __directionSwitch: true });

const Ray = Language.create('Ray')
  .objectOriented()
    .baseClass()
      .externalMethod('=', ray_assign)
      .externalMethod('|', ray_alias)
      .contextMethod('class', ray_class)
      .externalMethod('external', modifier('external'), { args: 'Program' })
      .externalMethod('initializer', modifier('initializer'), { args: 'Program' })
      .externalMethod('left-to-right', modifier('left-to-right'), { args: 'Program' })
      .externalMethod('right-to-left', modifier('right-to-left'), { args: 'Program' })
      .externalMethod('left-associative', modifier('left-associative'), { args: 'Program' })
      .externalMethod('right-associative', modifier('right-associative'), { args: 'Program' })
      .external('["(",null,")"]', ray_callPattern)
      .external('["[",null,"]"]', ray_indexPattern)
      .external('</', ray_rtlPreference)
  .scope()
    .fromContext().recursively()
    .from('this', (_m: MethodFn, p: Node) => p.method('()')?.__args === 'Program')
  .diagnostics().sourceMapping().cascadeSuppression()
  .reader()
    .split({ statement: '\n', juxtaposition: ' ' })
    .dynamicGrammar(rayPatternRecognition).reparse({ maxRounds: 10 })
    .block().indented()
  .lazy()
  .defaults().direction('ltr').associativity('left')
  .fileLoader().loadFile('.ray3/Node.ray').loadDirectory('.ray3')
  .build() as Runtime;

Ray.state.classes = new Map<string, Node>();
Ray.state.classes.set('*', Ray.proto!);

// ═══════════════════════════════════════════════════════════════
// Calc (test language)
// ═══════════════════════════════════════════════════════════════

function buildCalc(): Runtime { return (Language.create('Calc')
  .objectOriented().baseClass()
    .externalMethod('+', (self: Node, rhs: Node) => new Node(Number(self.realize().value.encoded) + Number(rhs.realize().value.encoded)))
    .externalMethod('-', (self: Node, rhs: Node) => new Node(Number(self.realize().value.encoded) - Number(rhs.realize().value.encoded)))
    .externalMethod('*', (self: Node, rhs: Node) => new Node(Number(self.realize().value.encoded) * Number(rhs.realize().value.encoded)))
    .externalMethod('/', (self: Node, rhs: Node) => new Node(Number(self.realize().value.encoded) / Number(rhs.realize().value.encoded)))
    .externalMethod('=', (self: Node, rhs: Node, ctx: Context) => { if (typeof self.value.encoded === 'string') ctx.external(self.value.encoded, () => rhs.realize()); return rhs; })
  .scope().fromContext().recursively()
  .diagnostics()
  .reader().split({ statement: '\n', juxtaposition: ' ' })
  .defaults().direction('ltr')
  .build()) as Runtime; }
