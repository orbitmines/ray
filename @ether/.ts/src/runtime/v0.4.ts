import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════
// v0.4 — Modular Language Construction Library
// ═══════════════════════════════════════════════════════════════

const UNKNOWN = Symbol("Unknown");
const BINDING = Symbol("*");

// ─── Types ───────────────────────────────────────────────────

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

interface Module {
  name: string;
  dependencies: string[];
  install(rt: Runtime): void;
}

// ─── Node ────────────────────────────────────────────────────

class Node {
  value: { encoded: any; methods: Map<string | Node, MethodFn> } = { encoded: UNKNOWN, methods: new Map() };
  private _thunks: ((self: Node) => void)[] | null = null;

  constructor(encoded: any = UNKNOWN) {
    this.value.encoded = encoded;
  }

  get none(): boolean { return this.value.encoded === null || this.value.encoded === undefined; }

  lazily(fn: (self: Node) => void): this {
    if (!this._thunks) this._thunks = [];
    this._thunks.push(fn);
    return this;
  }

  realize(): Node {
    if (this._thunks) {
      const thunks = this._thunks;
      this._thunks = null;
      for (const fn of thunks) fn(this);
    }
    return this;
  }

  lazy_get = (key: string | Node): Node => new Node().lazily((self) => self.value = this.get(key).value);
  lazy_set = (value: Node): Node => this.lazily((self) => self.value = value.realize().value);
  lazy_call = (arg: Node, ctx?: any, reader?: any, callPos?: any): Node => {
    return new Node().lazily((self) => {
      const ret = this.realize().call(arg.realize(), ctx, reader, callPos);
      self.value = ret.realize().value;
    });
  };

  has(key: string | Node, none: boolean = true): boolean {
    return this.value.methods.has(key) && (!none || !this.get(key).none);
  }

  get(key: string | Node): Node {
    this.realize();
    return this.value.methods.get(key)?.(Node.cast(key)) ?? new Node(null);
  }

  set(val: Node): Node {
    this.realize();
    this.value = val.value;
    return this;
  }

  call = (arg: Node, ctx?: any, reader?: any, callPos?: any): Node => {
    const fn = this.method('()');
    if (fn) return fn(this, arg, ctx, reader, callPos);
    if (reader instanceof Reader) {
      reader.rt.diagnostics.error('call', `Not callable: ${describe(this)}`, reader.file);
      return new Node(null);
    }
    throw new Error(`Not callable: ${describe(this)}`);
  };

  /** Shared base class — universal methods available on all nodes */
  static PROTO: Node | null = null;

  method(name: string): MethodFn | undefined {
    return this.value.methods.get(name)
      ?? this.value.methods.get(`[null,${JSON.stringify(name)}]`)
      ?? Node.PROTO?.value.methods.get(name)
      ?? Node.PROTO?.value.methods.get(`[null,${JSON.stringify(name)}]`);
  }

  external(name: string, fn: MethodFn): this {
    this.value.methods.set(name, fn);
    return this;
  }

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

  static cast = (x: any): Node => x instanceof Node ? x : new Node(x);
}

// ─── Context ─────────────────────────────────────────────────

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
    return new Node(null);
  }
}

// ─── Diagnostics ─────────────────────────────────────────────

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
  private _cascadeSuppression = false;
  private _unresolvedNames = new Set<string>();

  enableCascadeSuppression() { this._cascadeSuppression = true; }

  report(diag: Diagnostic) {
    const key = `${diag.file ?? ''}:${diag.line ?? 0}:${diag.col ?? 0}|${diag.message}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    if (this._cascadeSuppression && diag.phase === 'resolve') {
      const nameMatch = diag.message.match(/Unresolved identifier: (.+)/);
      if (nameMatch) {
        const name = nameMatch[1];
        for (const prev of this._unresolvedNames) {
          if (name.includes(prev) && name !== prev) return;
        }
        this._unresolvedNames.add(name);
      }
    }
    this.items.push(diag);
  }

  error(phase: string, message: string, file?: string, line?: number, col?: number) {
    this.report({ level: 'error', phase, message, file, line, col });
  }

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

// ─── Reader ──────────────────────────────────────────────────

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

  constructor(rt: Runtime, source: string, ctx: Context, root?: Reader) {
    this.rt = rt;
    this.source = source;
    this.ctx = ctx;
    this.pending = root?.pending ?? [];
    this.subReaders = root?.subReaders ?? [];
    rt.emit('readerCreate', this);
  }

  get done() { return this.i >= this.source.length; }
  ch() { return this.source[this.i]; }
  skip(n = 1) { this.i += n; }
  at(s: string) { return this.source.startsWith(s, this.i); }

  indent(): number {
    let n = 0;
    while (!this.done && this.ch() === ' ') { n++; this.skip(); }
    return n;
  }

  // Source mapping
  private _lastLine = 0;
  private _lastLineStart = 0;
  private _lastScanPos = 0;

  toRootPos(pos: number): number {
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

  locate(pos: number): { line: number; col: number } {
    return Diagnostics.locate(this.rootSource ?? this.source, this.toRootPos(pos));
  }

  errorAt(pos: number, phase: string, message: string) {
    const loc = this.locate(pos);
    this.rt.diagnostics.error(phase, message, this.file, loc.line, loc.col);
  }

  setSourceMapping(rootSource: string, baseOffset: number) {
    this.rootSource = rootSource;
    this.baseOffset = baseOffset;
  }
}

// ─── Runtime ─────────────────────────────────────────────────

class Runtime {
  name: string;
  diagnostics: Diagnostics;
  context: Context;
  proto: Node | null = null;
  state: Record<string, any> = {};

  // Core operations (always available, set by modules)
  readToken: (reader: Reader) => string = () => '';
  readLine: (reader: Reader) => Node = () => new Node(null);
  read: (reader: Reader) => Node = (r) => this.readLine(r);
  resolve: (name: string, ctx: Context, reader: Reader) => Node = (name) => new Node(name);
  apply: (target: Node, arg: Node, reader: Reader, callPos?: number) => Node =
    (target, arg, reader, callPos) => target.realize().call(arg.realize(), reader.ctx, reader, callPos);
  lookupMethod: (node: Node, name: string) => MethodFn | undefined = () => undefined;

  // Optional operations (null = module not installed)
  tryPattern: ((reader: Reader) => Node | null | undefined) | null = null;
  trySplit: ((text: string, methodNode: Node, reader: Reader) => number) | null = null;
  checkProgram: ((result: Node, reader: Reader, resultPos?: number) => Node) | null = null;
  handleDirection: ((method: MethodFn, result: Node, text: string, lastArg: Node | null,
    reader: Reader, resultPos: number, tokenStart: number) => { result: Node; lastArg: Node | null } | null) | null = null;
  checkThisMethod: ((text: string, reader: Reader) => Node | null) | null = null;
  makeBlock: ((source: string, locate: any, reader: Reader) => Node) | null = null;
  scanDefinitions: ((source: string, baseOffset?: number) => Definition[]) | null = null;
  isPatternBoundary: ((reader: Reader) => boolean) | null = null;
  resolveForward: ((name: string, node: Node, reader: Reader) => void) | null = null;

  // Events
  private _hooks: Map<string, Function[]> = new Map();
  hook(event: string, fn: Function) {
    if (!this._hooks.has(event)) this._hooks.set(event, []);
    this._hooks.get(event)!.push(fn);
  }
  emit(event: string, ...args: any[]) {
    for (const fn of this._hooks.get(event) ?? []) fn(...args);
  }

  // File loader config
  _fileSteps: { type: 'file' | 'directory'; path: string }[] = [];

  constructor(name: string) {
    this.name = name;
    this.diagnostics = new Diagnostics();
    this.context = new Context();
  }

  createReader(source: string, ctx?: Context, root?: Reader): Reader {
    return new Reader(this, source, ctx ?? this.context, root);
  }

  load(source: string, file?: string): { result: Node; reader: Reader } {
    const reader = this.createReader(source);
    reader.file = file;
    const result = this.read(reader);
    this.emit('verify', reader);
    return { result, reader };
  }

  eval(expr: string): Node {
    const reader = this.createReader(expr);
    reader.file = '<eval>';
    const result = this.read(reader);
    return result;
  }

  repl(config?: { prompt?: string }): void {
    const prompt = config?.prompt ?? `${this.name}> `;
    import('readline').then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = () => {
        rl.question(prompt, (line: string) => {
          if (!line || line === 'exit' || line === 'quit') { rl.close(); return; }
          const replDiag = new Diagnostics();
          try {
            const result = this.eval(line.trim());
            console.log(describe(result));
          } catch (e: any) {
            console.error(`  Error: ${e.message}`);
          }
          ask();
        });
      };
      ask();
    });
  }

  run(location: string, args?: { eval?: string[]; repl?: boolean | string; quiet?: boolean; '@'?: string[] }) {
    const resolvedLocation = path.resolve(args?.['@']?.[0] ?? location);
    const evalExprs = args?.eval ?? [];
    const verbose = !args?.quiet;
    const stat = fs.statSync(resolvedLocation);
    const isDir = stat.isDirectory();

    const totalStart = performance.now();
    console.error(`${this.name} bootstrap:`);
    const loaded = new Set<string>();

    const baseDir = isDir ? resolvedLocation : path.dirname(resolvedLocation);

    // Execute file loader steps
    for (const step of this._fileSteps) {
      const fullPath = path.resolve(baseDir, step.path);
      if (step.type === 'file') {
        if (loaded.has(fullPath)) continue;
        if (!fs.existsSync(fullPath)) {
          this.diagnostics.error('load', `File not found: ${fullPath}`);
          continue;
        }
        loaded.add(fullPath);
        const start = performance.now();
        const source = fs.readFileSync(fullPath, 'utf-8');

        // If dynamicGrammar and no definitions yet, discover from first file
        if (this.scanDefinitions && !this.state.definitions) {
          this.state.definitions = this.scanDefinitions(source);
          console.error(` ${this.state.definitions.length} definitions from ${fullPath}`);
          for (const def of this.state.definitions) {
            const key = JSON.stringify(def.pattern);
            this.context.external(key, () => new Node(def));
          }
        }

        const reader = this.createReader(source);
        reader.file = fullPath;
        const result = this.read(reader);
        this.emit('verify', reader);

        if (verbose) {
          const fwdState = reader._state.forwards;
          const fwds = fwdState?.forwards?.size ?? 0;
          console.error(`  [${path.basename(fullPath)}] ${(performance.now() - start).toFixed(1)}ms (${fwds} forwards)`);
        }
      } else {
        // loadDirectory
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
          const reader = this.createReader(source);
          reader.file = file;
          const result = this.read(reader);
          this.emit('verify', reader);
          if (verbose) {
            const fwdState = reader._state.forwards;
            const fwds = fwdState?.forwards?.size ?? 0;
            console.error(`      ${path.basename(file)}: ${describe(result)} (${fwds} forwards)`);
          }
        }
        console.error(`  [load .ray] ${(performance.now() - start).toFixed(1)}ms`);
      }
    }

    // Load extra file if specified
    if (!isDir && !loaded.has(resolvedLocation)) {
      const start = performance.now();
      loaded.add(resolvedLocation);
      const source = fs.readFileSync(resolvedLocation, 'utf-8');
      const reader = this.createReader(source);
      reader.file = resolvedLocation;
      this.read(reader);
      this.emit('verify', reader);
      if (verbose) console.error(`  [${path.basename(resolvedLocation)}] ${(performance.now() - start).toFixed(1)}ms`);
    } else if (isDir) {
      // Look for Ether.ray or similar at top level
      const etherPath = path.join(resolvedLocation, 'Ether.ray');
      if (fs.existsSync(etherPath) && !loaded.has(etherPath)) {
        const start = performance.now();
        loaded.add(etherPath);
        const source = fs.readFileSync(etherPath, 'utf-8');
        const reader = this.createReader(source);
        reader.file = etherPath;
        this.read(reader);
        this.emit('verify', reader);
        if (verbose) console.error(`  [Ether.ray] ${(performance.now() - start).toFixed(1)}ms`);
      }
    }

    // Print methods
    if (verbose) {
      printMethods(this.context, 'context');
      if (this.state.classes) {
        for (const [name, node] of this.state.classes) {
          printMethods(node, `class ${name}`);
        }
      }
    }

    // Eval expressions
    for (const expr of evalExprs) {
      const start = performance.now();
      try {
        const result = this.eval(expr);
        console.log(describe(result));
        if (verbose) console.error(`  [eval] ${(performance.now() - start).toFixed(1)}ms`);
      } catch (e: any) {
        this.diagnostics.error('eval', e.message);
      }
    }

    // Print diagnostics
    this.diagnostics.print(this.name);
    console.error(`  ${(performance.now() - totalStart).toFixed(1)}ms total`);
    if (this.diagnostics.hasErrors) process.exitCode = 1;

    // REPL
    if (args?.repl) {
      const prompt = typeof args.repl === 'string' ? args.repl : `${this.name}> `;
      this.repl({ prompt });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Module Installation Functions
// ═══════════════════════════════════════════════════════════════

// ─── ObjectOriented ──────────────────────────────────────────

function installOO(
  rt: Runtime,
  methods: { name: string; fn: MethodFn; opts?: any }[],
  externals: { name: string; fn: MethodFn }[]
) {
  const baseClass = helpers.makeBlockReceiver(rt);
  rt.proto = baseClass;
  Node.PROTO = baseClass;

  // Protect proto's value from being replaced by lazy_set cascades.
  // Methods can still be added/removed (Map is mutable), but the value object itself is stable.
  const _protoValue = baseClass.value;
  Object.defineProperty(baseClass, 'value', {
    get() { return _protoValue; },
    set(v: any) {
      // Allow adding methods from the new value, but don't replace the value object
      if (v && v.methods) {
        for (const [k, fn] of v.methods) _protoValue.methods.set(k, fn);
      }
      // Keep encoded if it was UNKNOWN and new value has something
      if (_protoValue.encoded === UNKNOWN && v?.encoded !== UNKNOWN) {
        _protoValue.encoded = v.encoded;
      }
    },
    configurable: true,
  });

  // Register external_methods on base class
  for (const { name, fn, opts } of methods) {
    baseClass.external_method(name, fn, opts);
  }

  // Register direct externals on base class
  for (const { name, fn } of externals) {
    baseClass.external(name, fn);
  }

  // Wrap lookupMethod to check base class (PROTO) after own methods
  const prevLookup = rt.lookupMethod;
  rt.lookupMethod = (node: Node, name: string) => {
    const own = node.value.methods.get(name)
      ?? node.value.methods.get(`[null,${JSON.stringify(name)}]`);
    if (own) return own;
    // PROTO fallback
    return rt.proto!.value.methods.get(name)
      ?? rt.proto!.value.methods.get(`[null,${JSON.stringify(name)}]`)
      ?? prevLookup(node, name);
  };
}

// ─── Scope ───────────────────────────────────────────────────

function installScope(
  rt: Runtime,
  recursive: boolean,
  scopeFroms: { field: string; filter?: (method: MethodFn, partial: Node) => boolean }[],
  hasOO: boolean
) {
  rt.resolve = (name: string, ctx: Context, reader: Reader) => {
    // Walk context chain
    const found = recursive ? ctx.get(name) : (ctx.has(name, false) ? ctx.get(name) : new Node(null));
    if (!found.none) return found;
    // Fallback: check base class methods as scope (e.g., 'class')
    if (hasOO && rt.proto) {
      const m = rt.proto.method(name);
      if (m) return m(rt.proto);
    }
    // Try number literal
    if (/^-?\d+(\.\d+)?$/.test(name)) return new Node(Number(name));
    // Not found — return as string identifier (so methods like = can read the name)
    return new Node(name);
  };

  // Install .from(field, filter) — implicit self resolution
  if (scopeFroms.length > 0) {
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
}

// ─── Lazy ────────────────────────────────────────────────────

function installLazy(rt: Runtime) {
  rt.apply = (target: Node, arg: Node, reader: Reader, callPos?: number) => {
    const gen = reader._state.lazy?.generation ?? 0;
    const result = new Node().lazily((self) => {
      if (gen < (reader._state.lazy?.generation ?? 0)) return;
      const ret = target.realize().call(arg.realize(), reader.ctx, reader, callPos);
      self.value = ret.realize().value;
    });
    reader.pending.push(result);
    return result;
  };

  rt.hook('readerCreate', (reader: Reader) => {
    reader._state.lazy = { generation: reader._state.lazy?.generation ?? 0 };
  });
}

// ─── DynamicGrammar (patterns, forward refs, token splitting, reparse) ─

function installDynamicGrammar(
  rt: Runtime,
  recognizer: (source: string, baseOffset?: number) => Definition[],
  reparseConfig: { maxRounds: number } | null
) {
  rt.scanDefinitions = recognizer;

  // ── Pattern state per reader ──

  interface PatternState {
    definitions: Definition[];
    defNodes: Map<Definition, Node>;
    defsByFirstChar: Map<string, Definition[]>;
    defFirstChars: Set<string>;
    hasSourceRangeDefs: boolean;
    skippedDefs: Set<Definition> | null;
    matchedDefs: string[];
  }

  function getPatternState(reader: Reader): PatternState {
    return reader._state.patterns ??= {
      definitions: [], defNodes: new Map(), defsByFirstChar: new Map(),
      defFirstChars: new Set(), hasSourceRangeDefs: false, skippedDefs: null, matchedDefs: []
    };
  }

  // ── Forward refs state per reader ──

  interface ForwardState {
    forwards: Map<string, { node: Node; pos: number; resolved?: boolean }>;
    registeredKeys: Set<string>;
    excludeKeys: Set<string> | null;
  }

  function getForwardState(reader: Reader): ForwardState {
    return reader._state.forwards ??= { forwards: new Map(), registeredKeys: new Set(), excludeKeys: null };
  }

  // ── Reparse state per reader ──

  interface ReparseState {
    generation: number;
    grammarSnapshot: number;
    stale: boolean;
    createdBy: Reader | null;
  }

  function getReparseState(reader: Reader): ReparseState {
    return reader._state.reparse ??= { generation: 0, grammarSnapshot: 0, stale: false, createdBy: null };
  }

  // ── Reader creation hook ──

  // Shared defNodes cache
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
          const ch = first[0];
          defFirstChars.add(ch);
          let arr = defsByFirstChar.get(ch);
          if (!arr) { arr = []; defsByFirstChar.set(ch, arr); }
          arr.push(def);
        }
      }
      cached = { map, hasSourceRange, defsByFirstChar, defFirstChars };
      defNodesCache.set(defs, cached);
    }
    const ps = getPatternState(reader);
    ps.definitions = defs;
    ps.defNodes = cached.map;
    ps.hasSourceRangeDefs = cached.hasSourceRange;
    ps.defsByFirstChar = cached.defsByFirstChar;
    ps.defFirstChars = cached.defFirstChars;
  });

  // ── isPatternBoundary ──

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

  // ── computeSkippedDefs ──

  function computeSkippedDefs(reader: Reader) {
    const ps = getPatternState(reader);
    ps.skippedDefs = null;
    if (!ps.hasSourceRangeDefs) return;
    const rootPos = reader.lineOffsets ? reader.toRootPos(reader.i) : reader.baseOffset + reader.i;
    for (const def of ps.definitions) {
      if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
        (ps.skippedDefs ??= new Set()).add(def);
      }
    }
  }

  // ── tryPattern ──

  rt.tryPattern = (reader: Reader) => {
    const ps = getPatternState(reader);
    const candidates = ps.defsByFirstChar.get(reader.ch());
    if (!candidates) return undefined;

    for (const def of candidates) {
      const isDefLine = ps.skippedDefs?.has(def) ?? false;
      const first = def.pattern[0] as string;
      if (!reader.at(first)) continue;
      const startPos = reader.i;
      reader.skip(first.length);

      const last = def.pattern[def.pattern.length - 1];
      let closerFound = true;
      const lineOffsets: number[] = [];

      if (typeof last === 'string' && last !== first) {
        let depth = 0;
        lineOffsets.push(reader.toRootPos(reader.i));
        const contentStart = reader.i;
        while (!reader.done) {
          if (depth === 0 && reader.at(last)) break;
          if (reader.at(first)) { depth++; reader.skip(first.length); }
          else if (depth > 0 && reader.at(last)) { depth--; reader.skip(last.length); }
          else {
            if (reader.ch() === '\n') lineOffsets.push(reader.toRootPos(reader.i + 1));
            reader.skip();
          }
        }
        var content = reader.source.slice(contentStart, reader.i);
        if (!reader.done) reader.skip(last.length); else closerFound = false;
      } else if (typeof last === 'string') {
        const contentStart = reader.i;
        while (!reader.done && !reader.at(last)) reader.skip();
        var content = reader.source.slice(contentStart, reader.i);
        if (!reader.done) reader.skip(last.length); else closerFound = false;
      } else {
        const contentStart = reader.i;
        while (!reader.done && reader.ch() !== '\n') reader.skip();
        var content = reader.source.slice(contentStart, reader.i);
      }

      if (def.isComment) return null;

      if (!closerFound) {
        // Backtrack — this wasn't a valid pattern match
        reader.i = startPos;
        continue;
      }

      const defKey = JSON.stringify(def.pattern);
      ps.matchedDefs.push(defKey);

      if (isDefLine) {
        const thisNode = reader.ctx.get('this');
        if (!thisNode.none) {
          const method = thisNode.value.methods.get(defKey);
          if (method) return method(thisNode);
        }
        return ps.defNodes.get(def) ?? new Node(def);
      }

      const isCodeBlock = typeof last === 'string' && last !== first;
      const arg = isCodeBlock
        ? rt.makeBlock!(content, lineOffsets.length > 1
          ? { lineOffsets, blockIndent: 0 }
          : { offset: lineOffsets[0] ?? reader.toRootPos(startPos + first.length) }, reader)
        : new Node(content);
      return rt.apply(ps.defNodes.get(def)!, arg, reader);
    }
    return undefined;
  };

  // ── makeBlock ──

  rt.makeBlock = (blockSource: string, locate: any, parentReader: Reader) => {
    const ps = getPatternState(parentReader);
    const rootSrc = parentReader.rootSource ?? parentReader.source;
    const block = new Node((ctx: Context) => {
      const reader = rt.createReader(blockSource, ctx, parentReader);
      reader.file = parentReader.file;
      reader.rootSource = rootSrc;
      const rs = getReparseState(reader);
      rs.createdBy = parentReader;
      if ('offset' in locate) {
        reader.baseOffset = locate.offset;
        if (getPatternState(reader).hasSourceRangeDefs) {
          const blockEnd = locate.offset + blockSource.length;
          let overlaps = false;
          for (const def of ps.definitions) {
            if (def.sourceRange && def.sourceRange[0] < blockEnd && def.sourceRange[1] > locate.offset) {
              overlaps = true; break;
            }
          }
          if (!overlaps) getPatternState(reader).hasSourceRangeDefs = false;
        }
      } else {
        reader.lineOffsets = locate.lineOffsets;
        reader.blockIndent = locate.blockIndent;
      }
      parentReader.subReaders.push(reader);
      const result = rt.read(reader);
      takeGrammarSnapshot(reader);
      return result;
    });
    block.external('expression', () => new Node(blockSource));
    block.external('__rootSource', () => new Node(rootSrc));
    if ('offset' in locate) block.external('__sourceOffset', () => new Node(locate.offset));
    return block;
  };

  // ── Token splitting ──

  rt.trySplit = (text: string, methodNode: Node, reader: Reader) => {
    if (text.length <= 1) return -1;
    const isSplitCandidate = (m: MethodFn | undefined): m is MethodFn =>
      m !== undefined && m.__splitCandidate === true;
    const lookupM = (n: Node, name: string) => rt.lookupMethod(n, name);

    // Phase 1: longest resolving prefix
    let splitAt = -1;
    for (let i = text.length - 1; i >= 1; i--) {
      const suffix = text.slice(i);
      if (isSplitCandidate(lookupM(methodNode, suffix))) {
        if (!reader.ctx.get(text.slice(0, i)).none) { splitAt = i; break; }
        if (splitAt === -1) splitAt = i;
      }
    }
    // Phase 2: longest method suffix
    if (splitAt === -1) {
      for (let i = 1; i < text.length; i++) {
        if (isSplitCandidate(lookupM(methodNode, text.slice(i)))) { splitAt = i; break; }
      }
    }
    // Phase 3: outside-in single-char method splitting
    if (splitAt === -1) {
      const len = text.length;
      for (let offset = 0; offset < Math.ceil(len / 2); offset++) {
        if (lookupM(methodNode, text[offset])) { splitAt = 1; break; }
        const ri = len - 1 - offset;
        if (ri > offset && lookupM(methodNode, text[ri])) { splitAt = 1; break; }
      }
    }
    return splitAt;
  };

  // ── Forward refs: wrap resolve ──

  const prevResolve = rt.resolve;
  rt.resolve = (name: string, ctx: Context, reader: Reader) => {
    const fs = getForwardState(reader);
    if (fs.excludeKeys?.has(name)) {
      if (!fs.forwards.has(name)) {
        fs.forwards.set(name, { node: new Node(name), pos: reader.i - name.length });
      }
      return fs.forwards.get(name)!.node;
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
    // Try number literal before creating forward
    if (/^-?\d+(\.\d+)?$/.test(name)) return new Node(Number(name));
    // Create forward ref
    if (!fs.forwards.has(name)) {
      fs.forwards.set(name, { node: new Node(name), pos: reader.i - name.length });
    }
    return fs.forwards.get(name)!.node;
  };

  rt.resolveForward = (name: string, node: Node, reader: Reader) => {
    const fs = getForwardState(reader);
    const fwd = fs.forwards.get(name);
    if (fwd) { fwd.node.set(node); fwd.resolved = true; }
  };

  // ── Grammar snapshot ──

  function takeGrammarSnapshot(reader: Reader) {
    let count = rt.proto?.value.methods.size ?? 0;
    const thisNode = reader.ctx.get('this');
    if (!thisNode.none) count += thisNode.value.methods.size;
    getReparseState(reader).grammarSnapshot = count;
  }

  // ── checkProgram (generic: any method with __args === 'Program') ──

  rt.checkProgram = (result: Node, reader: Reader, resultPos?: number) => {
    const fn = result.method('()');
    if (fn?.__args === 'Program' && !reader.done && reader.ch() !== '\n') {
      // Capture rest of line as block
      while (!reader.done && reader.ch() === ' ') reader.skip();
      const start = reader.i;
      while (!reader.done && reader.ch() !== '\n') reader.skip();
      const blockSource = reader.source.slice(start, reader.i);
      const block = rt.makeBlock!(blockSource, { offset: reader.toRootPos(start) }, reader);
      return rt.apply(result, block, reader, resultPos);
    }
    return result;
  };

  // ── Reparse + verify ──

  if (reparseConfig) {
    rt.hook('readerCreate', (reader: Reader) => {
      getReparseState(reader);
    });

    function needsReparse(reader: Reader): boolean {
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
        for (let i = 1; i < name.length; i++) {
          const suffix = name.slice(i);
          const m = rt.proto?.method(suffix) ?? (!thisNode.none ? thisNode.method(suffix) : undefined);
          if (m && m.__splitCandidate) return true;
        }
      }
      return false;
    }

    function doReparse(reader: Reader) {
      const rs = getReparseState(reader);
      const ls = reader._state.lazy;
      if (ls) ls.generation = (ls.generation ?? 0) + 1;
      rs.generation = (rs.generation ?? 0) + 1;

      const thisNode = reader.ctx.get('this');
      const canSplit = (name: string) => {
        if (name.length <= 1) return false;
        for (let i = 1; i < name.length; i++) {
          const suffix = name.slice(i);
          const m = rt.proto?.method(suffix) ?? (!thisNode.none ? thisNode.method(suffix) : undefined);
          if (m && m.__splitCandidate) return true;
        }
        return false;
      };

      const fs = getForwardState(reader);
      for (const [name] of fs.forwards) {
        if (canSplit(name)) {
          if (!thisNode.none) thisNode.value.methods.delete(name);
          reader.ctx.value.methods.delete(name);
        }
      }
      for (const key of fs.registeredKeys) {
        if (canSplit(key)) {
          if (!thisNode.none) thisNode.value.methods.delete(key);
          reader.ctx.value.methods.delete(key);
          fs.registeredKeys.delete(key);
        }
      }

      const staleSet = new Set<Reader>([reader]);
      for (const sub of reader.subReaders) {
        if (!getReparseState(sub).stale && getReparseState(sub).createdBy && staleSet.has(getReparseState(sub).createdBy!)) {
          getReparseState(sub).stale = true;
          staleSet.add(sub);
        }
      }

      reader.i = 0;
      reader._lastLine = 0; reader._lastLineStart = 0; reader._lastScanPos = 0;
      fs.forwards.clear();
      getPatternState(reader).matchedDefs = [];
      rt.read(reader);
      takeGrammarSnapshot(reader);
    }

    rt.hook('verify', (reader: Reader) => {
      const maxRounds = reparseConfig.maxRounds;
      let startIdx = 0;

      for (let round = 0; ; round++) {
        for (let i = startIdx; i < reader.pending.length; i++) {
          let prevLen = reader.pending.length;
          reader.pending[i].realize();
          while (reader.pending.length > prevLen) {
            const newStart = prevLen;
            prevLen = reader.pending.length;
            for (let j = newStart; j < prevLen; j++) reader.pending[j].realize();
          }
        }
        startIdx = reader.pending.length;

        let reparsed = 0;
        for (let i = 0; i < reader.subReaders.length; i++) {
          const sub = reader.subReaders[i];
          if (getReparseState(sub).stale) continue;
          if (needsReparse(sub)) {
            doReparse(sub);
            reparsed++;
          }
        }
        if (!reparsed) break;
        if (round > maxRounds) {
          rt.diagnostics.error('verify', `Re-parse fixpoint did not converge after ${maxRounds} rounds`);
          break;
        }
      }

      // Report unresolved forwards
      const reportForwards = (r: Reader) => {
        if (getReparseState(r).stale) return;
        const fs = getForwardState(r);
        for (const [name, { pos, resolved }] of fs.forwards) {
          if (resolved) continue;
          const loc = r.locate(pos);
          rt.diagnostics.error('resolve', `Unresolved identifier: ${name}`, r.file, loc.line, loc.col);
        }
      };
      reportForwards(reader);
      for (const sub of reader.subReaders) reportForwards(sub);
    });
  } else {
    // No reparse, but still realize pending and report forwards
    rt.hook('verify', (reader: Reader) => {
      for (let i = 0; i < reader.pending.length; i++) reader.pending[i].realize();
      const fs = getForwardState(reader);
      for (const [name, { pos, resolved }] of fs.forwards) {
        if (resolved) continue;
        const loc = reader.locate(pos);
        rt.diagnostics.error('resolve', `Unresolved identifier: ${name}`, reader.file, loc.line, loc.col);
      }
      for (const sub of reader.subReaders) {
        if (getReparseState(sub).stale) continue;
        const subFs = getForwardState(sub);
        for (const [name, { pos, resolved }] of subFs.forwards) {
          if (resolved) continue;
          const loc = sub.locate(pos);
          rt.diagnostics.error('resolve', `Unresolved identifier: ${name}`, sub.file, loc.line, loc.col);
        }
      }
    });
  }
}

// ─── Reader Module (readToken, readLine, read) ───────────────

function installReader(rt: Runtime, lang: {
  _splitConfig: Record<string, string> | null;
  _blocks: { type: 'indented' | 'delimited'; open?: string; close?: string }[];
  _direction: 'ltr' | 'rtl';
  _associativity: 'left' | 'right';
}) {
  // ── readToken ──
  const sepChars = new Set<string>();
  const sepTypes = new Map<string, string>();
  if (lang._splitConfig) {
    for (const [type, char] of Object.entries(lang._splitConfig)) {
      sepChars.add(char);
      sepTypes.set(char, type);
    }
  } else {
    sepChars.add(' ');
    sepChars.add('\n');
  }

  rt.readToken = (reader: Reader) => {
    const start = reader.i;
    while (!reader.done && !sepChars.has(reader.ch())) {
      // Only stop at pattern boundary AFTER reading at least one char
      // (prevents infinite loop when pattern backtracks at a boundary char)
      if (reader.i > start && rt.isPatternBoundary?.(reader)) break;
      reader.skip();
    }
    return reader.source.slice(start, reader.i);
  };

  // ── Direction handling ──

  rt.handleDirection = (method: MethodFn, result: Node, text: string, lastArg: Node | null,
    reader: Reader, resultPos: number, tokenStart: number): { result: Node; lastArg: Node | null } | null => {

    if (!method.__rightToLeft) return null;

    if (method.__directionSwitch) {
      // Direction switch (like </): re-evaluate preceding tokens RTL
      while (!reader.done && reader.ch() === ' ') reader.skip();
      let startNode: Node;
      if (reader.done || reader.ch() === '\n') {
        startNode = reader.ctx.get('this');
      } else {
        const argToken = rt.readToken(reader);
        startNode = argToken ? rt.resolve(argToken, reader.ctx, reader) : reader.ctx.get('this');
      }
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
        if (wm) { rtlResult = wm(rtlResult, new Node(word), reader.ctx, reader); }
        else { const resolved = rt.resolve(word, reader.ctx, reader); rtlResult = rt.apply(rtlResult, resolved, reader, resultPos); }
      }
      return { result: rtlResult, lastArg: null };
    }

    const target = lastArg ?? result;
    if (method.__leftAssociative) {
      // Left-associative: read one token/pattern as body
      while (!reader.done && reader.ch() === ' ') reader.skip();
      let body: Node | null = null;
      if (rt.tryPattern) {
        const bodyMatch = rt.tryPattern(reader);
        if (bodyMatch !== undefined && bodyMatch !== null) body = bodyMatch;
      }
      if (!body) {
        const bodyToken = rt.readToken(reader);
        if (bodyToken) body = rt.resolve(bodyToken, reader.ctx, reader);
      }
      if (body) {
        const partial = method(body, new Node(text), reader.ctx, reader);
        return { result: rt.apply(partial, target, reader, tokenStart), lastArg: null };
      }
    } else {
      // Right-associative (default): capture rest of line as body
      while (!reader.done && reader.ch() === ' ') reader.skip();
      const start = reader.i;
      while (!reader.done && reader.ch() !== '\n') reader.skip();
      const bodySource = reader.source.slice(start, reader.i);
      if (bodySource && rt.makeBlock) {
        const body = rt.makeBlock(bodySource, { offset: reader.toRootPos(start) }, reader);
        const partial = method(body, new Node(text), reader.ctx, reader);
        return { result: rt.apply(partial, target, reader, tokenStart), lastArg: null };
      }
    }
    return null;
  };

  // ── readLine ──

  rt.readLine = (reader: Reader) => {
    const hasDG = !!rt.tryPattern;
    if (hasDG) {
      // Compute skipped defs
      const ps = reader._state.patterns;
      if (ps) {
        ps.skippedDefs = null;
        if (ps.hasSourceRangeDefs) {
          const rootPos = reader.lineOffsets ? reader.toRootPos(reader.i) : reader.baseOffset + reader.i;
          for (const def of ps.definitions) {
            if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
              (ps.skippedDefs ??= new Set()).add(def);
            }
          }
        }
      }
    }

    let result: Node | null = null;
    let resultPos = reader.i;
    let lastArg: Node | null = null;

    while (!reader.done && reader.ch() !== '\n') {
      if (reader.ch() === ' ') { reader.skip(); continue; }
      const tokenStart = reader.i;

      // 1. Try pattern
      if (hasDG) {
        const matched = rt.tryPattern!(reader);
        if (matched === null) continue;
        if (matched !== undefined) {
          if (result) { lastArg = matched; result = rt.apply(result, matched, reader, resultPos); }
          else { result = matched; resultPos = tokenStart; lastArg = null; }
          if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
          continue;
        }
      }

      // 2. Read token
      const text = rt.readToken(reader);
      if (!text) continue;

      // 3. Check method on result
      if (result !== null) {
        const method = rt.lookupMethod(result, text);
        if (method) {
          if (rt.handleDirection) {
            const dirResult = rt.handleDirection(method, result, text, lastArg, reader, resultPos, tokenStart);
            if (dirResult) { result = dirResult.result; lastArg = dirResult.lastArg; continue; }
          }
          result = method(result, new Node(text), reader.ctx, reader);
          if (rt.checkProgram) result = rt.checkProgram(result, reader, tokenStart);
          lastArg = null;
          continue;
        }
      }

      // 4. Check implicit self (.from('this') etc.)
      if (result === null && rt.checkThisMethod) {
        const thisResult = rt.checkThisMethod(text, reader);
        if (thisResult) {
          result = thisResult;
          resultPos = tokenStart;
          lastArg = null;
          if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
          continue;
        }
      }

      // 5. Try direct context resolution (before split)
      const ctxResult = reader.ctx.get(text);
      if (!ctxResult.none) {
        const resolved = rt.resolve(text, reader.ctx, reader);
        if (result) { lastArg = resolved; result = rt.apply(result, resolved, reader, resultPos); }
        else { result = resolved; resultPos = tokenStart; lastArg = null; }
        if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
        continue;
      }

      // 6. Try token splitting (dynamic grammar only)
      if (rt.trySplit && text.length > 1) {
        const methodNode = result ?? rt.proto;
        if (methodNode) {
          const splitAt = rt.trySplit(text, methodNode, reader);
          if (splitAt !== -1) {
            reader.i -= (text.length - splitAt);
            const prefix = text.slice(0, splitAt);
            const resolved = rt.resolve(prefix, reader.ctx, reader);
            if (result) { lastArg = resolved; result = rt.apply(result, resolved, reader, resultPos); }
            else { result = resolved; resultPos = tokenStart; lastArg = null; }
            if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
            continue;
          }
        }
      }

      // 7. Forward ref / fallback resolve
      const resolved = rt.resolve(text, reader.ctx, reader);
      if (result) { lastArg = resolved; result = rt.apply(result, resolved, reader, resultPos); }
      else { result = resolved; resultPos = tokenStart; lastArg = null; }
      if (rt.checkProgram) result = rt.checkProgram(result, reader, resultPos);
    }

    return result ?? new Node(null);
  };

  // ── read (multi-line) ──

  const hasIndentation = lang._blocks.some(b => b.type === 'indented');

  rt.read = (reader: Reader) => {
    // Fast path: single-line
    if (reader.source.indexOf('\n') === -1) {
      return rt.readLine(reader);
    }

    let lastResult: Node | null = null;
    const results: Node[] = [];

    while (!reader.done) {
      if (reader.ch() === '\n') { reader.skip(); continue; }

      const pos = reader.i;
      const indent = reader.indent();
      if (reader.done || reader.ch() === '\n') continue;

      // Compute skipped defs for pattern peeking
      if (rt.tryPattern) {
        const ps = reader._state.patterns;
        if (ps) {
          ps.skippedDefs = null;
          if (ps.hasSourceRangeDefs) {
            const rootPos = reader.lineOffsets ? reader.toRootPos(reader.i) : reader.baseOffset + reader.i;
            for (const def of ps.definitions) {
              if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
                (ps.skippedDefs ??= new Set()).add(def);
              }
            }
          }
        }
        const savedPos = reader.i;
        const peek = rt.tryPattern(reader);
        if (peek === null) continue;
        if (peek !== undefined) reader.i = savedPos;
      }

      const result = rt.readLine(reader);
      if (reader.ch() === '\n') reader.skip();

      // Check for indented block following this line
      if (hasIndentation) {
        let nextIndent = 0;
        if (!reader.done) {
          const peekPos = reader.i;
          while (!reader.done && reader.ch() === '\n') reader.skip();
          if (!reader.done) {
            nextIndent = reader.indent();
            reader.i = peekPos;
          }
        }

        if (nextIndent > indent) {
          while (!reader.done && reader.ch() === '\n') reader.skip();
          const block = readBlock(reader, nextIndent);
          const withBlock = rt.apply(result, block, reader);
          results.push(withBlock);
          lastResult = withBlock;
          continue;
        }
      }

      results.push(result);
      lastResult = result;
    }

    return lastResult ?? new Node(null);
  };

  // ── readBlock (indentation) ──

  function readBlock(reader: Reader, blockIndent: number): Node {
    const lines: string[] = [];
    const lineOffsets: number[] = [];

    while (!reader.done) {
      const pos = reader.i;
      if (reader.ch() === '\n') { reader.skip(); continue; }

      const ind = reader.indent();

      // Compute skipped defs + peek
      if (rt.tryPattern) {
        const ps = reader._state.patterns;
        if (ps) {
          ps.skippedDefs = null;
          if (ps.hasSourceRangeDefs) {
            const rootPos = reader.lineOffsets ? reader.toRootPos(reader.i) : reader.baseOffset + reader.i;
            for (const def of ps.definitions) {
              if (def.sourceRange && rootPos >= def.sourceRange[0] && rootPos < def.sourceRange[1]) {
                (ps.skippedDefs ??= new Set()).add(def);
              }
            }
          }
        }
        const savedPos = reader.i;
        const peek = rt.tryPattern(reader);
        if (peek === null) continue;
        if (peek !== undefined) reader.i = savedPos;
      }

      if (ind < blockIndent && !reader.done && reader.ch() !== '\n') {
        reader.i = pos;
        break;
      }

      lineOffsets.push(reader.toRootPos(pos));
      const relIndent = ' '.repeat(Math.max(0, ind - blockIndent));
      const contentStart = reader.i;
      while (!reader.done && reader.ch() !== '\n') reader.skip();
      lines.push(relIndent + reader.source.slice(contentStart, reader.i));
    }

    return rt.makeBlock!(lines.join('\n'), { lineOffsets, blockIndent }, reader);
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers Namespace
// ═══════════════════════════════════════════════════════════════

namespace helpers {
  /** Create a node that receives block bodies, discovers inner defs, evaluates in child scope */
  export function makeBlockReceiver(rt: Runtime): Node {
    return new Node().external('()', (self: Node, arg: Node, ctx: Context, reader: Reader) => {
      if (typeof arg.value.encoded === 'function' && arg.value.methods.has('expression')) {
        const isOwnNode = self.value.methods.has('()');
        const target = isOwnNode ? self : new Node(self.value.encoded);

        const bodySource = arg.get('expression').value.encoded;
        if (typeof bodySource === 'string' && rt.scanDefinitions) {
          const bodyOffset = arg.get('__sourceOffset')?.value.encoded;
          for (const def of rt.scanDefinitions(bodySource, typeof bodyOffset === 'number' ? bodyOffset : 0)) {
            const defKey = JSON.stringify(def.pattern);
            if (!target.value.methods.has(defKey)) {
              target.external(defKey, () => new Node(def));
            }
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

  /** Create a modifier method function for a given modifier name */
  export function modifier(name: string): MethodFn {
    return (self: Node, blockArg: Node, modCtx: Context, reader: Reader) => {
      return applyModifier(name, blockArg, modCtx, reader, reader.rt);
    };
  }

  /** Apply a modifier flag to a method found via sub-reader evaluation */
  export function applyModifier(mod: string, blockArg: Node, modCtx: Context, reader: Reader, rt: Runtime): Node {
    const thisNode = modCtx.get('this');
    if (thisNode.none) return blockArg;

    const expr = blockArg.get('expression')?.value.encoded;
    if (typeof expr !== 'string') return blockArg;

    const bodyCtx = new Context(modCtx);
    bodyCtx.external('this', () => thisNode);
    const subReader = rt.createReader(expr, bodyCtx, reader);
    subReader.file = reader.file;
    subReader.pending = reader.pending;
    subReader.subReaders = reader.subReaders;
    reader.subReaders.push(subReader);

    // During reparse, exclude parent's registered keys
    const parentFs = reader._state.forwards;
    if (parentFs?.registeredKeys) {
      const subFs = subReader._state.forwards ??= { forwards: new Map(), registeredKeys: new Set(), excludeKeys: null };
      subFs.excludeKeys = parentFs.registeredKeys;
    }

    const rootSrc = blockArg.get('__rootSource')?.value.encoded;
    const srcOffset = blockArg.get('__sourceOffset')?.value.encoded;
    if (typeof rootSrc === 'string' && typeof srcOffset === 'number') {
      subReader.setSourceMapping(rootSrc, srcOffset);
    }

    const methodsBefore = new Set(thisNode.value.methods.keys());
    const result = rt.read(subReader);

    // Find the method key
    const subFs = subReader._state.forwards;
    let key = subFs?.forwards ? (function() {
      for (const [k] of subFs.forwards) return k;
      return null;
    })() : null;

    const subPs = subReader._state.patterns;
    if (!key && subPs?.matchedDefs?.length) key = subPs.matchedDefs[0];
    if (!key) {
      for (const k of thisNode.value.methods.keys()) {
        if (!methodsBefore.has(k)) { key = k as string; break; }
      }
    }

    const pendingMods: string[] = (modCtx as any).__pendingModifiers ?? [];
    const allModifiers = [mod, ...pendingMods];

    if (key) {
      let newlyRegistered = false;
      if (!thisNode.value.methods.has(key)) {
        thisNode.external(key as string, () => result);
        if (subFs?.forwards) {
          const fwd = subFs.forwards.get(key);
          if (fwd) { fwd.node.set(result); fwd.resolved = true; }
        }
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
          let isRealExternal = false;
          for (const check of [thisNode.value.methods.get(key), rt.proto?.value.methods.get(key as string)]) {
            if (!check) continue;
            const probe = check(Node.cast(key));
            const enc = probe.value.encoded;
            if (!(enc && typeof enc === 'object' && 'pattern' in enc && Array.isArray(enc.pattern))) {
              isRealExternal = true; break;
            }
          }
          if (!isRealExternal) {
            rt.diagnostics.error('external', `Expected externally defined method '${key}'`, reader.file);
          }
        } else if (method && (m === 'left-to-right')) {
          method.__leftToRight = true;
          propagateFlag(thisNode, subFs, methodsBefore, key as string, '__leftToRight', result);
        } else if (method && (m === 'right-to-left')) {
          method.__rightToLeft = true;
          propagateFlag(thisNode, subFs, methodsBefore, key as string, '__rightToLeft', result);
        } else if (method && (m === 'left-associative')) {
          method.__leftAssociative = true;
          propagateFlag(thisNode, subFs, methodsBefore, key as string, '__leftAssociative', result);
        } else if (method && (m === 'right-associative')) {
          method.__rightAssociative = true;
          propagateFlag(thisNode, subFs, methodsBefore, key as string, '__rightAssociative', result);
        }
      }
    } else if (mod === 'left-to-right' || mod === 'right-to-left' || mod === 'left-associative' || mod === 'right-associative') {
      (bodyCtx as any).__pendingModifiers = [...pendingMods, mod];
    }

    return result;
  }

  function propagateFlag(thisNode: Node, subFs: any, methodsBefore: Set<any>, key: string, flag: string, result: Node) {
    if (subFs?.forwards) {
      for (const [name, { resolved }] of subFs.forwards) {
        if (name !== key && resolved) {
          if (!thisNode.value.methods.has(name)) thisNode.external(name, () => result);
          const m = thisNode.value.methods.get(name);
          if (m) (m as any)[flag] = true;
        }
      }
    }
    for (const k of thisNode.value.methods.keys()) {
      if (k !== key && !methodsBefore.has(k)) {
        const m = thisNode.value.methods.get(k);
        if (m) (m as any)[flag] = true;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Language Builder
// ═══════════════════════════════════════════════════════════════

// ─── Builder Interfaces (TypeScript autocomplete) ────────────

interface LanguageApi {
  objectOriented(): ObjectOrientedApi & LanguageApi;
  scope(): ScopeApi & LanguageApi;
  diagnostics(): DiagnosticsApi & LanguageApi;
  reader(): ReaderApi & LanguageApi;
  lazy(): LanguageApi;
  defaults(): DefaultsApi & LanguageApi;
  fileLoader(): FileLoaderApi & LanguageApi;
  build(config?: BuildConfig): Runtime;
}

interface ObjectOrientedApi {
  baseClass(): BaseClassApi & LanguageApi;
}

interface BaseClassApi {
  externalMethod(name: string, fn: MethodFn, opts?: { args?: 'Program'; initializer?: boolean }): BaseClassApi & LanguageApi;
  external(name: string, fn: MethodFn): BaseClassApi & LanguageApi;
}

interface ScopeApi {
  fromContext(): FromContextApi & ScopeApi & LanguageApi;
  from(field: string, filter?: (method: MethodFn, partial: Node) => boolean): ScopeApi & LanguageApi;
}

interface FromContextApi {
  recursively(): ScopeApi & LanguageApi;
}

interface DiagnosticsApi {
  sourceMapping(): DiagnosticsApi & LanguageApi;
  cascadeSuppression(): DiagnosticsApi & LanguageApi;
}

interface ReaderApi {
  split(config: Record<string, string>): ReaderApi & LanguageApi;
  dynamicGrammar(recognizer: (source: string, baseOffset?: number) => Definition[]): DynamicGrammarApi & ReaderApi & LanguageApi;
  block(): BlockApi & ReaderApi & LanguageApi;
}

interface DynamicGrammarApi {
  reparse(config?: { maxRounds?: number }): ReaderApi & LanguageApi;
}

interface BlockApi {
  indented(): ReaderApi & LanguageApi;
  delimited(open: string, close: string): ReaderApi & LanguageApi;
}

interface DefaultsApi {
  direction(dir: 'ltr' | 'rtl'): DefaultsApi & LanguageApi;
  associativity(assoc: 'left' | 'right'): DefaultsApi & LanguageApi;
}

interface FileLoaderApi {
  loadFile(path: string): FileLoaderApi & LanguageApi;
  loadDirectory(path: string): FileLoaderApi & LanguageApi;
}

interface BuildConfig {
  repl?: boolean | string;
  eval?: string[];
}

// ─── Language Class ──────────────────────────────────────────

class Language {
  private _name: string;

  // ObjectOriented state
  private _oo = false;
  private _baseClassMethods: { name: string; fn: MethodFn; opts?: any }[] = [];
  private _baseClassExternals: { name: string; fn: MethodFn }[] = [];
  private _contextMethods: { name: string; fn: MethodFn; opts?: any }[] = [];

  // Scope state
  private _scopeFromContext = false;
  private _scopeRecursive = false;
  private _scopeFrom: { field: string; filter?: (m: MethodFn, p: Node) => boolean }[] = [];

  // Diagnostics state
  private _hasDiagnostics = false;
  private _sourceMapping = false;
  private _cascadeSuppression = false;

  // Reader state
  private _hasReader = false;
  _splitConfig: Record<string, string> | null = null;
  private _dynamicGrammarFn: ((source: string, baseOffset?: number) => Definition[]) | null = null;
  private _reparseConfig: { maxRounds: number } | null = null;
  _blocks: { type: 'indented' | 'delimited'; open?: string; close?: string }[] = [];

  // Lazy
  private _isLazy = false;

  // Defaults
  _direction: 'ltr' | 'rtl' = 'ltr';
  _associativity: 'left' | 'right' = 'left';

  // FileLoader
  private _fileSteps: { type: 'file' | 'directory'; path: string }[] = [];

  constructor(name: string) { this._name = name; }

  static create(name: string): LanguageApi { return new Language(name) as any; }

  // ObjectOriented
  objectOriented() { this._oo = true; return this as any; }
  baseClass() { return this as any; }
  externalMethod(name: string, fn: MethodFn, opts?: any) {
    this._baseClassMethods.push({ name, fn, opts });
    return this as any;
  }
  external(name: string, fn: MethodFn) {
    this._baseClassExternals.push({ name, fn });
    return this as any;
  }
  contextMethod(name: string, fn: MethodFn, opts?: any) {
    this._contextMethods.push({ name, fn, opts });
    return this as any;
  }

  // Scope
  scope() { return this as any; }
  fromContext() { this._scopeFromContext = true; return this as any; }
  recursively() { this._scopeRecursive = true; return this as any; }
  from(field: string, filter?: any) { this._scopeFrom.push({ field, filter }); return this as any; }

  // Diagnostics
  diagnostics() { this._hasDiagnostics = true; return this as any; }
  sourceMapping() { this._sourceMapping = true; return this as any; }
  cascadeSuppression() { this._cascadeSuppression = true; return this as any; }

  // Reader
  reader() { this._hasReader = true; return this as any; }
  split(config: Record<string, string>) { this._splitConfig = config; this._hasReader = true; return this as any; }
  dynamicGrammar(recognizer: (source: string, baseOffset?: number) => Definition[]) {
    this._dynamicGrammarFn = recognizer; this._hasReader = true; return this as any;
  }
  reparse(config?: { maxRounds?: number }) {
    this._reparseConfig = { maxRounds: config?.maxRounds ?? 10 };
    return this as any;
  }
  block() { return this as any; }
  indented() { this._blocks.push({ type: 'indented' }); return this as any; }
  delimited(open: string, close: string) { this._blocks.push({ type: 'delimited', open, close }); return this as any; }

  // Lazy
  lazy() { this._isLazy = true; return this as any; }

  // Defaults
  defaults() { return this as any; }
  direction(dir: 'ltr' | 'rtl') { this._direction = dir; return this as any; }
  associativity(assoc: 'left' | 'right') { this._associativity = assoc; return this as any; }

  // FileLoader
  fileLoader() { return this as any; }
  loadFile(p: string) { this._fileSteps.push({ type: 'file', path: p }); return this as any; }
  loadDirectory(p: string) { this._fileSteps.push({ type: 'directory', path: p }); return this as any; }

  // Build
  build(config?: BuildConfig): Runtime {
    const rt = new Runtime(this._name);

    // 1. Diagnostics
    if (this._cascadeSuppression) rt.diagnostics.enableCascadeSuppression();

    // 2. ObjectOriented (base class + method lookup)
    if (this._oo) installOO(rt, this._baseClassMethods, this._baseClassExternals);

    // 2b. Context methods (like 'class' — on context, not base class, to avoid value-sharing issues with lazy eval)
    for (const { name, fn, opts } of this._contextMethods) {
      rt.context.external_method(name, fn, opts);
    }

    // 3. Scope
    if (this._scopeFromContext || this._scopeFrom.length > 0) {
      installScope(rt, this._scopeRecursive, this._scopeFrom, this._oo);
    }

    // 4. Lazy (before reader, so apply is set)
    if (this._isLazy) installLazy(rt);

    // 5. Dynamic grammar (patterns, forward refs, token splitting, reparse)
    if (this._dynamicGrammarFn) {
      installDynamicGrammar(rt, this._dynamicGrammarFn, this._reparseConfig);
    }

    // 6. Reader (readToken, readLine, read)
    if (this._hasReader || this._splitConfig) {
      installReader(rt, this);
    }

    // 7. File loader steps
    rt._fileSteps = [...this._fileSteps];

    // 8. Auto-run repl/eval from build config
    if (config?.repl) {
      const prompt = typeof config.repl === 'string' ? config.repl : `${this._name}> `;
      // Deferred: repl runs after build returns
      setTimeout(() => rt.repl({ prompt }), 0);
    }
    if (config?.eval) {
      for (const expr of config.eval) {
        console.log(describe(rt.eval(expr)));
      }
    }

    return rt;
  }
}

// ═══════════════════════════════════════════════════════════════
// Ray Language Composition
// ═══════════════════════════════════════════════════════════════

/** Ray's pattern recognition (bootstrap.defs from v0.3) */
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

const Ray = Language.create('Ray')
  .objectOriented()
    .baseClass()
      // ── Assignment ──
      .externalMethod('=', (self: Node, rhs: Node, ctx: Context, reader: Reader) => {
        if (typeof self.value.encoded === 'string') {
          const name = self.value.encoded;
          const thisNode = ctx.get('this');
          if (!thisNode.none) thisNode.external(name, () => self);
          else ctx.external(name, () => self);
          reader.rt.resolveForward?.(name, self, reader);
        }
        return self.lazy_set(rhs);
      })
      // ── Aliasing ──
      .externalMethod('|', (self: Node, nameArg: Node, ctx: Context, reader: Reader) => {
        const name = nameArg.value.encoded;
        if (typeof name === 'string') {
          ctx.external(name, () => self);
          reader.rt.resolveForward?.(name, self, reader);
          const classes = reader.rt.state.classes;
          if (classes) {
            for (const [, cls] of classes) {
              if (cls === self || cls.value.methods === self.value.methods) { classes.set(name, cls); break; }
            }
          }
        }
        return self;
      })
      // ── Class (on context to avoid lazy value-sharing with proto) ──
      .contextMethod('class', (_self: Node, arg: Node, ctx: Context, reader: Reader) => {
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
              const newClass = helpers.makeBlockReceiver(rt);
              const argName = typeof name === 'string' ? name : null;
              if (argName) {
                ctx.external(argName, () => newClass);
                rt.resolveForward?.(argName, newClass, reader);
                classes?.set(argName, newClass);
              }
              newClass.external('()', (_self: Node, bodyArg: Node, bodyCtx: Context, bodyReader: Reader) => {
                const ctorCtx = new Context(ctx);
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

        // Constructor not available yet — return a placeholder class.
        // The reparse loop will re-evaluate once class = { ... } defines it.
        const newClass = helpers.makeBlockReceiver(rt);
        const argName = typeof name === 'string' ? name : null;
        if (argName) {
          ctx.external(argName, () => newClass);
          rt.resolveForward?.(argName, newClass, reader);
          classes?.set(argName, newClass);
        }
        return newClass;
      })
      // ── Modifiers ──
      .externalMethod('external', helpers.modifier('external'), { args: 'Program' })
      .externalMethod('initializer', helpers.modifier('initializer'), { args: 'Program' })
      .externalMethod('left-to-right', helpers.modifier('left-to-right'), { args: 'Program' })
      .externalMethod('right-to-left', helpers.modifier('right-to-left'), { args: 'Program' })
      .externalMethod('left-associative', helpers.modifier('left-associative'), { args: 'Program' })
      .externalMethod('right-associative', helpers.modifier('right-associative'), { args: 'Program' })
      // ── Call pattern ({args: *}) ──
      .external('["(",null,")"]', (self: Node) => {
        const callFn: MethodFn = (_: Node, arg: Node, ctx?: any, reader?: any, callPos?: any) =>
          self.lazy_call(arg, ctx, reader, callPos);
        return new Node().external('()', callFn);
      })
      // ── Index pattern [{property: *}] ──
      .external('["[",null,"]"]', (self: Node) => {
        return new Node().lazily((result) => {
          const prop = self.realize().get('property');
          result.value = prop.value;
        });
      })
      // ── RTL preference operator ──
      .external('</', Object.assign(((self: Node) => self) as MethodFn, { __rightToLeft: true, __directionSwitch: true }))
  .scope()
    .fromContext().recursively()
    .from('this', (_method: MethodFn, partial: Node) => partial.method('()')?.__args === 'Program')
  .diagnostics()
    .sourceMapping()
    .cascadeSuppression()
  .reader()
    .split({ statement: '\n', juxtaposition: ' ' })
    .dynamicGrammar(rayPatternRecognition)
      .reparse({ maxRounds: 10 })
    .block().indented()
  .lazy()
  .defaults()
    .direction('ltr')
    .associativity('left')
  .fileLoader()
    .loadFile('.ray3/Node.ray')
    .loadDirectory('.ray3')
  .build() as Runtime;

// Initialize Ray's classes tracking
Ray.state.classes = new Map<string, Node>();
Ray.state.classes.set('*', Ray.proto!);

// ═══════════════════════════════════════════════════════════════
// Test Language — Calc (demonstrates base class with custom grammar)
// ═══════════════════════════════════════════════════════════════

function buildCalc(): Runtime { return (Language.create('Calc')
  .objectOriented()
    .baseClass()
      .externalMethod('+', (self: Node, rhs: Node) =>
        new Node(Number(self.realize().value.encoded) + Number(rhs.realize().value.encoded)))
      .externalMethod('-', (self: Node, rhs: Node) =>
        new Node(Number(self.realize().value.encoded) - Number(rhs.realize().value.encoded)))
      .externalMethod('*', (self: Node, rhs: Node) =>
        new Node(Number(self.realize().value.encoded) * Number(rhs.realize().value.encoded)))
      .externalMethod('/', (self: Node, rhs: Node) =>
        new Node(Number(self.realize().value.encoded) / Number(rhs.realize().value.encoded)))
      .externalMethod('=', (self: Node, rhs: Node, ctx: Context) => {
        const name = self.value.encoded;
        if (typeof name === 'string') ctx.external(name, () => rhs.realize());
        return rhs;
      })
  .scope()
    .fromContext().recursively()
  .diagnostics()
  .reader()
    .split({ statement: '\n', juxtaposition: ' ' })
  .defaults()
    .direction('ltr')
  .build()) as Runtime; }

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export { Node, Context, Reader, Runtime, Language, Diagnostics, Ray, buildCalc, helpers, describe, BINDING };
