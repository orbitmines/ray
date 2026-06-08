// Support
// Compile the runtime to another target (Implement runtime inside the language first?)
// Compile the program to another target - AST is just another target.

import { nodejs } from "./node.js.ts";
import { Source, Node, Text } from "./source.ts";
import { Standard, Version } from "./version.ts";
import { Diagnostic, Diagnostics, Instrumentable, InstrumentationCtx, instrumented, uninstrumented } from "./diagnostics.ts";
import { manifest as bundle_manifest } from "./bundled.ts";
import { is_function, is_string } from "./lodash.ts";
import { stringify } from "querystring";

namespace CLI { export type Args = [] | [positional: string[], args: { [key: string]: string[] }] }

export interface Program<Static extends Representation<Static>> extends Representation<Static> {
  exec(...args: CLI.Args): Promise<Node>
}
export interface REPLable<Static extends Representation<Static>> extends Program<Static> {
  repl(): void
}
export interface AbstractInterpretable<Static extends Representation<Static>> extends Program<Static> {
  abstract(): Static
}
export interface Reloadable<Static extends Representation<Static>> extends Representation<Static> {
  reload(next: Static | Source | Node | Iterable<Source | Node>): Static
}

export interface Distributable {
  list(): Iterable<Distributable>
  ready(): String | undefined

}
export interface Dependant {
  dependencies: Distributable[]
}
export interface Installable extends Distributable {
// Distributable is the frontend the backend is. It's a frontend/backend chain on the CLASS, not on an instance!
// Dependencies are again a frontend/backend chain on the class.
// 

  // os is backend to the installable/downloadable.
  // each specific version has many possible backends?
  // frontends are the package managers? backends are the CLI?
  // then the CLI has as a frontend String which feeds the source files into it
  //platform similarly is also just a representation (installable for specific platform) -> 
  load(): Promise<void>
  install(): Promise<void>
}
export interface Downloadable extends Distributable {
  download(): Promise<String>
}
export interface Buildable extends Downloadable {
  build(...args: CLI.Args): Promise<void>
}


export type Compiler<Input extends Representation<Input> = Representation<any>, Output extends Representation<Output> = Representation<any>> = (target: Output, input: Input) => Promise<Output>

export abstract class Representation<Static extends Representation<Static> = Representation<any>, TSource extends Source = Source> {
  
  versions: Map<Version, Static> = new Map()
  get version(): Version { return [...this.versions].find(([, v]) => v === this.self)![0]; }

  constructor(public name?: string, version?: Version) {
    if (version) this.versions.set(version, this.self);
  }

  log: Diagnostics

  get self(): Static { return this as any as Static }
  protected abstract construct(): Static

  // The class node this instance specializes; a class node points at itself.
  // `repr.class.register_backend(...)` targets the shared menu; instances get
  // their own edges (see new()), so a selected version carries exactly its own.
  _class: Representation = this;
  get class(): this { return this._class as this; }

  // This is a Ray with a compiler on each edge. (Which is the implicit conversion as (X), in Ray) -> Should be called that on Ray too.
  frontends: Compilers = new Compilers(-1); /* <- . -> */ backends: Compilers = new Compilers(1)

  // The program a `frontend(...)` wrapper produced once its compiler ran (via
  // `all()`/`exec()`). Lets callers reach the configured runtime the wrapper
  // built — e.g. the LSP, which then drives it through `reload(...)`.
  compiled?: Static


  register_frontend<Frontend extends Representation<Frontend>>(frontend: Frontend, compile: Compiler<Frontend, Static>): this {
    if (this.frontends.find(x => x.name === frontend.name)) return this.log.fatal(this.name, `There's already a frontend named '${frontend.name}' for '${this.name}'`);
    frontend.backends.next.set(this, compile as any);
    this.frontends.next.set(frontend, compile as any);
    return this;
  }

  register_backend<Backend extends Representation<Backend>>(backend: Backend, compile: Compiler<Static, Backend>): this {
    if (this.backends.find(x => x.name === backend.name)) return this.log.fatal(this.name, `There's already a backend named '${backend.name}' for '${this.name}'`);
    backend.frontends.next.set(this, compile as any);
    this.backends.next.set(backend, compile as any);
    return this;
  }

  backend<Backend extends Representation>(backend: Backend, version?: string): Backend { return this.backends.find_repr(x => x.name === backend.name) as Backend }
  frontend<Frontend extends Representation>(frontend: Frontend): Static {
    const compiler = this.frontends.find(x => x.name === frontend.name);
    if (!compiler) return this.log.fatal(this.name, `Could not find a frontend named '${frontend.name}' for '${this.name}'`);
    
    const x = this.new();
    x.all = async function*() { yield *(x.compiled ??= (await compiler(this, frontend)) as Static).all() }
    return x;
  }

  new() {
    const x = this.construct();
    x.name = this.name;
    x.log = this.log;
    // Instances point at the class node but get their OWN empty edge maps, so a
    // selected version's backends are exactly the ones resolved for it — not a
    // shared reference to the class menu. select() materializes them.
    x._class = this._class;
    x.frontends = new Compilers(-1);
    x.backends = new Compilers(1);
    return x;
  }

  // This is representing Ray's ability to superpose a bunch of files (with different locations) on a single var.
  protected source?(): Iterable<TSource>
  async *all(): AsyncGenerator<TSource> {
    if (!this.source) return;
    for (const source of this.source()) { await source.load(); yield source; }
  }

  // save() {}
}

export class Compilers {
  constructor(public direction: -1 | 1) {}
  next: Map<Representation, Compiler> = new Map();

  // Technically there could be many paths from a frontend or to a backend, but just ignore that for now untill we have a .ray implementation.
  find(predicate: (x: Representation) => boolean): Compiler | undefined {
    for (const [end, compiler] of this.all()) {
      if (predicate(end)) return compiler;
    }
    return undefined;
  }
  find_repr(predicate: (x: Representation) => boolean): Representation {
    for (const [end, compiler] of this.all()) {
      if (predicate(end)) return end;
    }
    return undefined;
  }
  *all(): Generator<[Representation, Compiler]> {
    const seen = new Set<Representation>();
    for (const [end, compiler] of this.next) {
      if (seen.has(end)) continue;
      seen.add(end);
      yield [end, compiler];

      const next = this.direction === -1 ? end.frontends : end.backends;
      for (const [source, source_compiler] of next.all()) {
        if (seen.has(source)) continue;
        seen.add(source);
        yield [source, async (target, input) => compiler(target, await source_compiler(end, input))];
      }
    }
  }
}

// TODO(language): unfinished `export class` removed so the module parses.
// abstract class Language extends Representation<Language> {

//   constructor(public name: string, version: Version) {
//     super(undefined, version)
//   }
//   abstract get log(): Diagnostics

//   // reload(next: Language | Source | Node | Iterable<Source | Node>): Language { return this.log.fatal(this.name, 'Not hot reloadable.'); }
//   // abstract(): Language { return this.log.fatal(this.name, 'Not abstract interpretable.'); }
//   // exec(positional: string[], args: { [key: string]: string[]; }) { return this.log.fatal(this.name, 'Not executable.'); }
//   source(): Generator<Source> { return this.log.fatal(this.name, 'Source code not accessible.'); }

//   // repl(): void { return this.log.fatal(this.name, 'Not REPL\'able.'); }
// }

export class String extends Representation<String, Text.Source> {
  protected construct(): String { return new String(this.extension) }

  static extension(...extension: string[]) { return new String(extension) }
  constructor(public extension: string[]) {
    //TODO Version is Unicode string version.
    super(extension[0], (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  }
  log: Diagnostics = new Diagnostics()

  private _sources: Array<() => Iterable<Text.Source>> = [];

  *source(): Generator<Text.Source> {
    for (const producer of this._sources) yield *producer();
  }

  load(location: string | string[]): this {
    if (Array.isArray(location)) { for (const l of location) this.load(l); return this; }
    const self = this;
    this._sources.push(function*() { yield *self.walk(location); });
    return this;
  }
  loadFile(location: string): this {
    this._sources.push(function*() { yield new Text.Source(undefined, location); });
    return this;
  }
  loadDirectory(location: string, options: { recursively?: boolean, excluded?: string } = {}): this {
    const self = this;
    this._sources.push(function*() { yield *self.walkDir(location, { recursive: options.recursively ?? false, excluded: options.excluded }); });
    return this;
  }
  loadProject(location: string): this {
    const { fs, path } = nodejs;
    if (!fs.existsSync(location)) { this.log.error('load', `Not found: ${location}`); return this; }
    const stat = fs.statSync(location);
    if (stat.isDirectory()) return this.loadDirectory(location, { recursively: true });
    if (stat.isFile()) return this.loadDirectory(path.dirname(location), { recursively: true, excluded: location }).loadFile(location);
    return this.log.fatal('file system', `"${location}": not a file or directory`);
  }
  add(...source: string[]): this {
    for (const text of source) this._sources.push(function*() { yield new Text.Source(text); });
    return this;
  }

  bundled = {
    load: (location: string | string[]): String => this.load(
      Array.isArray(location) ? location.map(l => this.bundled_resolve(l)) : this.bundled_resolve(location)
    ),
    loadFile: (location: string): String => this.loadFile(this.bundled_resolve(location)),
    loadDirectory: (location: string, options: { recursively?: boolean, excluded?: string } = {}): String => {
      if (bundle_manifest.length === 0) return this.loadDirectory(this.bundled_resolve(location), {
        ...options,
        // resolve `excluded` like `location` so walkDir's absolute entryPath comparison matches
        excluded: options.excluded ? this.bundled_resolve(options.excluded) : undefined,
      });
      const recursively = options.recursively ?? false;
      const prefix = location.replace(/\/$/, '') + '/';
      for (const entry of bundle_manifest) {
        if (entry === options.excluded) continue;
        if (!entry.startsWith(prefix)) continue;
        if (!recursively && entry.indexOf('/', prefix.length) !== -1) continue;
        if (this.extension.some(ext => entry.endsWith(ext))) this.loadFile(this.bundled_resolve(entry));
      }
      return this;
    },
    loadProject: (location: string): String => {
      if (bundle_manifest.length === 0) return this.loadProject(this.bundled_resolve(location));
      if (!bundle_manifest.includes(location)) return this.bundled.loadDirectory(location, { recursively: true });
      const slash = location.lastIndexOf('/');
      const dir = slash === -1 ? '' : location.slice(0, slash);
      return this.bundled.loadDirectory(dir, { recursively: true, excluded: location }).bundled.loadFile(location);
    },
  };

  private bundled_resolve(location: string): string {
    if (nodejs.enabled) {
      // An `@ether/$/.ray` marker in the working directory means we're in a checkout
      // of the language repo (same marker `boot.ts` uses to pick repo mode) — use its
      // in-tree definition rather than the packaged copy, so IDE extensions work
      // against the development version.
      const cwd = process.cwd();
      if (nodejs.fs.existsSync(nodejs.path.resolve(cwd, '@ether/$/.ray')))
        return nodejs.path.resolve(cwd, location);
      return nodejs.path.resolve(nodejs.root, location);
    }
    return new URL('../' + location, import.meta.url).href;
  }

  private *walk(location: string): Iterable<Text.Source> {
    if (!nodejs.fs.existsSync(location)) { this.log.error('load', `Not found: ${location}`); return; }
    const stat = nodejs.fs.statSync(location);
    if (stat.isFile()) { yield new Text.Source(undefined, location); return; }
    if (stat.isDirectory()) { yield *this.walkDir(location, { recursive: true }); return; }
    return this.log.fatal('file system', `"${location}": not a file or directory`);
  }
  private *walkDir(dir: string, options: { recursive?: boolean, excluded?: string } = {}): Iterable<Text.Source> {
    if (!nodejs.fs.existsSync(dir)) { this.log.error('load', `Directory not found: ${dir}`); return; }
    for (const entry of nodejs.fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = nodejs.path.join(dir, entry.name);
      if (entryPath === options.excluded) continue;
      if (entry.isDirectory()) {
        // Skip IDE integrations and versioned implementation dirs (e.g. `v0.ts`) —
        // they live under the language definition but aren't part of it, and walking
        // them would descend into their `node_modules`.
        if (entry.name === 'ide' || (entry.name.startsWith('v') && entry.name.includes('.'))) continue;
        if (options.recursive) yield *this.walkDir(entryPath, options);
      }
      else if (this.extension.some(ext => entry.name.endsWith(ext))) yield new Text.Source(undefined, entryPath);
    }
  }
}

export class Phase {
  constructor(public program: Runtime, public name: string) {}
  nodes: AST.Node[] = []

  add(source?: Text.Source): AST.Node {
    const x = new AST.Node(this.program, source ?? this.program.EXTERNALLY_DEFINED)
    x.phase = this;
    this.nodes.push(x);
    return x;
  }

  sources(): Iterable<AST.Node> { return this.nodes; }

  async reparse(): Promise<void> {
    for (const node of this.nodes) { await node.load(); node.realize(); }
  }
}

export class Runtime extends Representation<Runtime> implements InstrumentationCtx, Program<Runtime>, AbstractInterpretable<Runtime>, REPLable<Runtime>, Reloadable<Runtime> {
  protected construct(): Runtime { return new Runtime() }

  log: Diagnostics = new Diagnostics()
  stack: Diagnostic[] = [];

  EXTERNALLY_DEFINED = new Text.Source('')

  BASE: AST.Node = new AST.Node(this, this.EXTERNALLY_DEFINED, null)
  CTX: AST.Node = new AST.Node(this, this.EXTERNALLY_DEFINED, this.BASE)
  GLOBAL: AST.Node = new AST.Node(this, this.EXTERNALLY_DEFINED, this.CTX)
  PROGRAM: AST.Node = new AST.Node(this, this.EXTERNALLY_DEFINED, this.BASE)

  classes: Map<string, AST.Node> = new Map()
  class_node(name: string): AST.Node {
    let node = this.classes.get(name);
    if (!node) this.classes.set(name, node =
      name === 'Program' ? this.PROGRAM :
      name === 'Node' || name === '*' ? this.BASE :
      new AST.Node(this, this.EXTERNALLY_DEFINED, this.BASE));
    return node;
  }

  phases: Map<string, Phase> = new Map()
  current?: Phase
  scopes: (AST.Node | undefined)[] = []

  phase(name: string): Phase {
    let phase = this.phases.get(name);
    if (!phase) this.phases.set(name, phase = new Phase(this, name));
    return phase;
  }
  get latest_phase(): Phase {
    let latest: Phase | undefined;
    for (const phase of this.phases.values()) latest = phase;
    return latest ?? this.phase('input');
  }
  get nodes(): AST.Node[] { return [...this.phases.values()].flatMap(p => p.nodes); }

  abstract_interpretation: { enabled?: boolean, call?: (fn: AST.Node) => AST.Node } = {}
  interpreter?(_: AST.Node): AST.Node | undefined

  override new(): Runtime {
    const x = super.new() as Runtime;
    x.abstract_interpretation = { enabled: this.abstract_interpretation.enabled, call: this.abstract_interpretation.call };
    x.interpreter = this.interpreter;
    return x;
  }

  base(fn: (x: AST.Node) => void): this { fn(this.BASE); return this; }
  context(fn: (x: AST.Node) => void): this { fn(this.CTX); return this; }
 
  async add(nodes: AsyncGenerator<Text.Source>) {
    for await (const source of nodes) { this.addNode(source) }
  }
  addNode(source?: Text.Source): AST.Node {
    const interpreter = this.interpreter;
    if (!interpreter) return this.log.fatal(this.name, `No interpreter setup for the '${this.name}' runtime.`);

    return this.latest_phase.add(source);
  }

  override async *all(): AsyncGenerator<AST.Node> {
    for (const phase of this.phases.values()) {
      this.current = phase;
      for (const node of phase.sources()) { await node.load(); yield node; }
    }
  }

  async exec(positional?: string[], args?: { [key: string]: string[]; }): Promise<AST.Node> {
    //TODO Support superposed input.
    let result = this.BASE.None;
    for await (const program of this.all() as AsyncGenerator<AST.Node>) {
      result = program.realize()
    }
    return result;
  }

  print(): void {
    if (this.log.hasErrors) process.exitCode = 1; //TODO Allow non-terminating execs
    this.log.print();
  }
  abstract = (call_abstractly?: (fn: AST.Node) => AST.Node): this => {
    if (call_abstractly) { 
      this.abstract_interpretation.call = call_abstractly;
    } else {
      if (!this.abstract_interpretation.call) return this.log.fatal(this.name, `Tried to .abstract() interpret '${this.name}', but it has not implemented abstract interpretation.`);
      this.abstract_interpretation.enabled = true 
    }
    return this;
  }
  repl(): void {
    if (!nodejs.enabled) return this.log.fatal(this.name, 'REPL requires a Node.js environment.');

    let compiler = this.frontends.find(x => x instanceof String)
    if (!compiler) return this.log.fatal(this.name, 'REPL requires a frontend which accepts a string.');

    let cursor = new AST.Node(this, new Text.Source(''))

    import('readline').then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = () => {
        rl.question(`${this.name}> `, (line: string) => {
          cursor.source.value = `${cursor.source.value}\n`
          cursor.move(cursor.source.value.length)
          cursor.source.value = `${cursor.source.value}${line.trim()}`
          cursor.end = cursor.source.value.length - 1;

          this.reload(cursor)
          //TODO Print result.

          prompt()
        });
      };
      prompt()
    })
  }
  reload(next: Source | Node | Iterable<Source | Node> | Runtime | Phase): Runtime {
    if (!this.abstract_interpretation.enabled) return this.log.fatal('reload', 'Currently only abstract interpretation is hot-reloadable.')

    // Naieve reload of just a single file.
    const one = (item: any): void => {
      let node: AST.Node;
      if (item instanceof AST.Node) {
        node = item;
      } else {
        const source = item as Text.Source;
        let phase = this.latest_phase;
        if (source.location !== undefined)
          for (const p of this.phases.values()) {
            if (p.nodes.some(n => n.source.location === source.location)) phase = p;
            p.nodes = p.nodes.filter(n => n.source.location !== source.location);
          }
        this.log.delete(source);
        node = phase.add(source);
      }
      node.load();
      node.realize();
    };

    if (next instanceof Runtime) { /* re-running a whole runtime: nothing to do yet */ }
    else if (next instanceof Phase) { void next.reparse(); }
    else if (next instanceof AST.Node || next instanceof Text.Source) one(next);
    else for (const item of next as Iterable<Source | Node>) one(item);

    return this;
  }
  
}

export namespace AST {
  const UNKNOWN = Symbol("Unknown")
  const UNRESOLVED = Symbol("Unresolved")

  type Key = string | Node
  export type Method = (_class: Node, method: Node, args?: Node) => Node
  export type EncodedMethod = Method & { _class: Node }
  
  const EMPTY_METHODS: Map<Key, Node> = new Map();
  const EMPTY_OPTIONS: { [key: string]: string } = {};
  class Value {
    encoded: EncodedMethod | Symbol | undefined | null = UNKNOWN
    options: { [key: string]: Key } = EMPTY_OPTIONS
    thunks: ((self: Node) => void)[] | null = null;
    private methods: Map<Key, Node> = EMPTY_METHODS

    set(key: Key, method: Node) {
      if (this.methods === EMPTY_METHODS) this.methods = new Map();
      this.methods.set(key, method)
    }
    get(key: Key) { return this.methods.get(key); }
    has(key: Key) { return this.methods.has(key); }
    keys() { return this.methods.keys() }
    get count() { return this.methods.size }

    // conflict(ref: Node){}
  }

  @instrumented('trace', { recursive: true })
  export class Node extends Text.Node implements Source, Instrumentable {

    static describe(key: Key): string {
      if (is_string(key)) return key;
      return key.string ?? "{}"
    }

    value: Value = new Value()
    phase?: Phase;
    _index?: Map<string, string[]>;
    with(key: string, value?: string): this {
      if (this.value.options === EMPTY_OPTIONS) this.value.options = {};
      this.value.options[key] = value ?? 'true';
      this.debug('options', `${key} = ${this.value.options[key]}`)
      return this;
    }
    enabled(key: string, value?: string): boolean { return value ? this.value.options[key] === value : !!this.value.options[key]; }

    constructor(program: Runtime, source: Text.Source = program.EXTERNALLY_DEFINED, public _super: Node = program.BASE) {
      super()
      this.program = program;
      this.source = source;
      this.cursor = 0; // at the first character, nothing selected yet
    }

    @uninstrumented
    public program: Runtime

    @uninstrumented
    get log() { return this.program.log; }
    @uninstrumented
    private _report(level: Diagnostic['level'], phase: string, message: string): void { this.log.report({ level, phase, message, node: this.copy() }); }
    @uninstrumented
    fatal(phase: string, message: string): never { this._report('fatal', phase, message); return this.log.exit() }
    @uninstrumented
    error(phase: string, message: string): Node {
      this._report('error', phase, message);
      const x = this.New.impl(() => x)
      return x;
    }
    @uninstrumented
    warning(phase: string, message: string): void { this._report('warning', phase, message); }
    @uninstrumented
    info(phase: string, message: string): void { this._report('info', phase, message); }
    @uninstrumented
    debug(phase: string, message: string): void { this._report('debug', phase, message); }
    @uninstrumented
    trace(phase: string, message: string): void { this._report('trace', phase, message); }

    get __instrumentation(): InstrumentationCtx | undefined { return this.program; }
    get position(): Text.Node { return this; }
    get location() { return `${this.source.location ? `${this.source.location}:` : ''}${this.line}:${this.col}` }

    async load(): Promise<void> {
      if (this.phase) this.program.current = this.phase;
      let cursor: AST.Node | undefined = this;
      //  const past = (): boolean => direction === 'right-to-left' ? this.begin <= rangeStart : this.end >= rangeEnd;
      // program.runtime._expression!.iterate(this, past, false);
      //       while (!cursor.direction.done() && (!past || !past())) handle(node);
      const result = this.program.interpreter(cursor);
      this.value = result.value;
      this.before = result.before;
      // return this.log.fatal(this.program.name, "Node isn't a root node, so refusing to parse from here.");
    }

    private impl(encoded: any): this { this.value.encoded = encoded; return this; }
    get New() { return new Node(this.program) }
    get None() { return this.New.impl(null) }

    get is_unknown() { return this.value.encoded === UNKNOWN }
    get is_none() { return this.value.encoded === undefined || this.value.encoded === null }

    // `this` is sequenced after `before` (a `;`); realizing runs the chain first.
    before?: Node;

    override move(cursor: number): void {
      this.before = this.copy();
      super.move(cursor);
      this.clear();
    }

    begin_expression(): void {
      this.program.scopes.push(this.before);
      this.before = undefined;
    }
    end_expression(): Node {
      const body = this.New;
      body.before = this.before;
      this.before = this.program.scopes.pop();
      return body;
    }

    copy(): Node {
      const copy = this.New;
      copy.source = this.source
      copy.phase = this.phase
      copy.value = this.value; // TODO Now is a ref to the same value (thunks included).
      copy.before = this.before
      copy.cursor = this.cursor
      copy.selection = this.selection.slice()
      copy._direction = this._direction
      return copy;
    }
    clear(): void {
      this.value = new Value()
      this._index = undefined;
    }

    lazily(fn: (self: Node) => void): this { if (!this.value.thunks) this.value.thunks = []; this.value.thunks.push(fn); return this; }
    realize(): Node {
      const pending: Node[] = [];
      for (let node: Node | undefined = this; node; ) { pending.push(node); const before = node.before; node.before = undefined; node = before; }
      while (pending.length) {
        const node = pending.pop()!;
        while (node.value.thunks) {
          const thunks = node.value.thunks;
          node.value.thunks = null;
          for (const fn of thunks) fn(node);
        }
      }
      return this;
    }

    get(key: Key): Node { return this.New.lazily((self) => self.value = this.methods.resolve(key).value); }
    set(value: Node): Node { return this.lazily((self) => self.eager.set(value)); }
    call(args?: Node): Node {
      args ??= this.None;

    // if (args.source !== Text.Source.EMPTY) {
      // next.source = args.source;
      // if (args.cursor != null) next.cursor = args.cursor;
      // if (args.selection.length) next.rselection = args.selection.slice();
    // }
      // if (out.source !== Text.Source.EMPTY) self.source = out.source;
      // if (out.cursor != null) self.cursor = out.cursor;
      // if (out.selection.length) self.selection = out.selection.slice();

      return this.New.lazily((self) => {
        const out = this.eager.call(args);
        self.value = out.value;
      });
    }

    // Eagerly get from this object directly, without any inheritance.
    private _eager?: Eager;
    get eager(): Eager { return this._eager ??= new Eager(this); }
    // Eagerly get from this object, including inhertiance.
    private _methods?: Methods;
    get methods(): Methods { return this._methods ??= new Methods(this); }
    
    method(key: Key, fn: Method): Node {
      const method = this.New;

      (fn as EncodedMethod)._class = this;
      method.value.encoded = fn as EncodedMethod// ? fn : UNRESOLVED;

      this.value.set(key, method)
      this._index = undefined;

      return method;
    }

  }

  // Eagerly get from a node directly, without any inheritance. Hoisted (one class,
  // node passed in) so we don't mint a class per node on first `.eager` access.
  class Eager {
    constructor(private self: Node) {}
    has(key: Key): boolean { const self = this.self; self.realize(); return self.value.has(key); }
    get(key: Key): Node {
      const self = this.self;
      self.realize();
      if (!self.value.has(key)) return self.error('eager.get', `Unresolved variable \`${Node.describe(key)}\` in ${Node.describe(self)}.`)
      return self.value.get(key)!;
    }
    set(val: Node): Node { const self = this.self; self.realize(); self.value = val.value; return self; }
    call(args?: Node): Node {
      const self = this.self;
      args ??= self.None

      let fn: Node = self;
      if (self.program.abstract_interpretation.enabled)
        fn = self.program.abstract_interpretation.call(self)

      fn.realize()
      if (!is_function(fn.value.encoded)) {
        return fn.error('call', `Expected a function to call.`)
      }

      return (fn.value.encoded as EncodedMethod)((fn.value.encoded as EncodedMethod)._class, self, args)
    }
  }

  // Eagerly get from a node, including inheritance. Hoisted for the same reason as Eager.
  class Methods {
    constructor(private self: Node) {}

    all(): Set<Key> {
      const self = this.self;
      const keys = new Set<Key>(self.value.keys());
      if (self._super) for (const k of self._super.methods.all()) keys.add(k);
      return keys;
    }
    rules(): [Node, Node][] {
      const out: [Node, Node][] = [];
      for (let node: Node | undefined = this.self; node; node = node._super)
        for (const key of node.value.keys())
          if (!is_string(key)) out.push([key, node.value.get(key)!]);
      //TODO Doesnt account superposed or overridden values here.
      return out;
    }
    // Prefix index (first char -> keys, longest-first) for token capture.
    // A node with no methods of its own shares its super's index verbatim, so
    // the transient result/cursor nodes reuse the stable scope index instead of
    // rebuilding it per token. Cached on the owning node; invalidated by method().
    index(): Map<string, string[]> {
      const self = this.self;
      if (self.value.count === 0 && self._super) return self._super.methods.index();
      if (self._index) return self._index;
      const idx = new Map<string, string[]>();
      for (const key of self.methods.all()) {
        if (!is_string(key)) continue; // Node keys are grammar-rule patterns, matched via methods.rules()
        const prefix = key.slice(0, 1); // shorter names key on themselves
        let bucket = idx.get(prefix);
        if (!bucket) idx.set(prefix, bucket = []);
        bucket.push(key);
      }
      for (const bucket of idx.values()) bucket.sort((a, b) => b.length - a.length); // longest-first
      return self._index = idx;
    }
    has(key: Key): boolean { return !!this.self.methods.defines(key) }
    resolve(key: Key): Node {
      let node: Node | undefined = this.self;
      while (node) {
        if (node.eager.has(key)) return node.eager.get(key);
        node = node._super;
      }
      return this.self.eager.get(key);
    }
    defines(key: Key): Node | null {
      const self = this.self;
      if (self.eager.has(key)) return self;
      if (self._super) return self._super.methods.defines(key);
      return null;
    }
  }
}