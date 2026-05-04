// Support
// Compile the runtime to another target (Implement runtime inside the language first?)
// Compile the program to another target - AST is just another target.

import { nodejs } from "./node.js.ts";
import { Source, Node, Text } from "./source.ts";
import { Standard, Version } from "./version.ts";
import { Diagnostic, Diagnostics, Instrumentable, InstrumentationCtx, instrumented, uninstrumented } from "./diagnostics.ts";
import { manifest as bundle_manifest } from "./bundled.ts";
import { is_function } from "./lodash.ts";

namespace CLI { export type Args = [] | [positional: string[], args: { [key: string]: string[] }] }

interface Program<Static extends Representation<Static>> extends Representation<Static> {
  exec(...args: CLI.Args): Promise<Node>
}
interface REPLable<Static extends Representation<Static>> extends Program<Static> {
  repl(): void
}
interface AbstractInterpretable<Static extends Representation<Static>> extends Program<Static> {
  abstract(): Static
}
interface Reloadable<Static extends Representation<Static>> extends Representation<Static> {
  reload(next: Static | Source | Node | Iterable<Source | Node>): Static
}

export type Compiler<Input extends Representation<Input> = Representation<any>, Output extends Representation<Output> = Representation<any>> = (target: Output, input: Input) => Promise<Output>

abstract class Representation<Static extends Representation<Static> = Representation<any>, TSource extends Source = Source> {
  
  versions: Map<Version, Static> = new Map()
  get version(): Version { return [...this.versions].find(([, v]) => v === this.self)![0]; }

  constructor(public name?: string, version?: Version) {
    if (version) this.versions.set(version, this.self);
  }

  log: Diagnostics

  get self(): Static { return this as any as Static }
  protected abstract construct(): Static

  // This is a Ray with a compiler on each edge. (Which is the implicit conversion as (X), in Ray) -> Should be called that on Ray too.
  frontends: Compilers = new Compilers(-1); /* <- . -> */ backends: Compilers = new Compilers(1)

  register_frontend<Frontend extends Representation<Frontend>>(frontend: Frontend, compile: Compiler<Frontend, Static>): this {
    if (this.frontends.find(x => x.name === frontend.name)) return this.log.fatal(this.name, `There's already a frontend named '${frontend.name}' for '${this.name}'`);
    frontend.backends.next.set(this, compile as any);
    this.frontends.next.set(frontend, compile as any);
    return this;
  }

  backend<Backend extends Representation>(backend: Backend, version?: string): Backend { return this.backends.find_repr(x => x.name === backend.name) as Backend }
  frontend<Frontend extends Representation>(frontend: Frontend): Static {
    const compiler = this.frontends.find(x => x.name === frontend.name);
    if (!compiler) return this.log.fatal(this.name, `Could not find a frontend named '${frontend.name}' for '${this.name}'`);
    
    const x = this.new();
    x.all = async function*() { yield *(await compiler(this, frontend)).all() }
    return x;
  }

  new() {
    const x = this.construct();
    x.name = this.name;
    x.log = this.log;
    x.frontends = this.frontends;
    x.backends = this.backends;
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
      if (bundle_manifest.length === 0) return this.loadDirectory(this.bundled_resolve(location), options);
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
    if (nodejs.enabled) return nodejs.path.resolve(nodejs.root, location);
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
      if (entry.isDirectory()) { if (options.recursive) yield *this.walkDir(entryPath, options); }
      else if (this.extension.some(ext => entry.name.endsWith(ext))) yield new Text.Source(undefined, entryPath);
    }
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

  nodes: AST.Node[] = []

  abstract_interpretation: { enabled?: boolean, call?: (fn: AST.Node) => AST.Node } = {}
  interpreter?(_: AST.Node): AST.Node | undefined

  override new(): Runtime {
    const x = super.new() as Runtime;
    // `abstract_interpretation.call` is language-level setup; the `enabled`
    // flag is per-execution and stays whatever the fresh copy decides.
    x.abstract_interpretation = { call: this.abstract_interpretation.call };
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

    const x = new AST.Node(this, source ?? this.EXTERNALLY_DEFINED)
    this.nodes.push(x);
    return x; 
  }

  protected source(): Iterable<AST.Node> { return this.nodes; }

  async exec(positional?: string[], args?: { [key: string]: string[]; }): Promise<AST.Node> {
    //TODO Support superposed input.
    let result = this.BASE.None;
    for await (const node of this.all() as AsyncGenerator<AST.Node>) { result = node; }
    return this.log.fatal('test', 'test')
    return result;
  }
  abstract = (call_abstractly?: (fn: Node) => Node): this => {
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
  reload(next: Source | Node | Iterable<Source | Node> | Runtime): Runtime {
    throw new Error("Method not implemented.");
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
    options: { [key: string]: string } = EMPTY_OPTIONS
    private methods: Map<Key, Node> = EMPTY_METHODS

    set(key: Key, method: Node) {
      if (this.methods === EMPTY_METHODS) this.methods = new Map();
      this.methods.set(key, method)
    }
    get(key: Key) { return this.methods.get(key); }
    has(key: Key) { return this.methods.has(key); }
    keys() { return this.methods.keys() }

    // conflict(ref: Node){}
  }

  @instrumented('trace', { recursive: true })
  export class Node extends Text.Node implements Source, Instrumentable {

    private value: Value = new Value()
    with(key: string, value?: string): this {
      if (this.value.options === EMPTY_OPTIONS) this.value.options = {};
      this.value.options[key] = value ?? 'true';
      this.debug('options', `${key} = ${this.value.options[key]}`)
      return this;
    }
    enabled(key: string): boolean { return !!this.value.options[key]; }

    constructor(program: Runtime, source: Text.Source = program.EXTERNALLY_DEFINED, public _super: Node = program.BASE) {
      super()
      this.program = program;
      this.source = source;
      this.cursor = -1;
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
      let cursor: AST.Node | undefined = this;
      //  const past = (): boolean => direction === 'right-to-left' ? this.begin <= rangeStart : this.end >= rangeEnd;
      // program.runtime._expression!.iterate(this, past, false);
      //       while (!cursor.direction.done() && (!past || !past())) handle(node);
      while (!cursor.direction.done()) cursor = this.program.interpreter(cursor);
      // return this.log.fatal(this.program.name, "Node isn't a root node, so refusing to parse from here.");
    }

    private impl(encoded: any): this { this.value.encoded = encoded; return this; }
    get New() { return new Node(this.program) }
    get None() { return this.New.impl(null) }

    get is_unknown() { return this.value.encoded === UNKNOWN }
    get is_none() { return this.value.encoded === undefined || this.value.encoded === null }

    override move(cursor: number): void {
      super.move(cursor);
      this.clear();
    }

    copy(): Node {
      const copy = this.New;
      copy.source = this.source
      copy.thunks = this.thunks ? [...this.thunks] : null
      copy.value = this.value; // TODO Now is a ref to the same value.
      copy.cursor = this.cursor
      copy.selection = this.selection.slice()
      copy._direction = this._direction
      return copy;
    }
    clear(): void {
      this.thunks = [] //TODO Maybe move thunks into .value?
      this.value = new Value()
    }

    private thunks: ((self: Node) => void)[] | null = null;
    lazily(fn: (self: Node) => void): this { if (!this.thunks) this.thunks = []; this.thunks.push(fn); return this; }
    realize(): Node {
      if (this.thunks) {
        const t = this.thunks;
        this.thunks = null;
        for (const fn of t) fn(this);
      }
      return this;
    }

    get(key: Key): Node { return this.New.lazily((self) => self.value = this.eager.get(key).value); }
    set(value: Node): Node { return this.lazily((self) => self.eager.set(value)); }
    call(args?: Node): Node {
      args ??= this.None;

    // if (args.source !== Text.Source.EMPTY) {
      // next.source = args.source;
      // if (args.cursor != null) next.cursor = args.cursor;
      // if (args.selection.length) next.selection = args.selection.slice();
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
    private _eager: any;
    get eager() {
      if (this._eager) return this._eager;

      const self = this;
      class Eager {
        has(key: Key): boolean { self.realize(); return self.value.has(key); }
        get(key: Key): Node | undefined { self.realize(); return self.value.get(key); }
        set(val: Node): Node { self.realize(); self.value = val.value; return self; }
        call(args?: Node) {
          args ??= self.None
          
          let fn: Node = self;
          if (self.program.abstract_interpretation.enabled)
            fn = self.program.abstract_interpretation.call(self)
  
          fn.realize()
          if (!is_function(fn.value.encoded)) {
            return fn.error('call', `Expected a function to call.`)
          }
  
          return fn.value.encoded(fn.value.encoded._class, self, args)
        }
      }
      return this._eager = new Eager();
    }
    // Eagerly get from this object, including inhertiance.
    private _methods: any
    get methods() {
      if (this._methods) return this._methods;

      const self = this;
      class Methods {

        all(): Set<Key> {
          const keys = new Set<Key>(self.value.keys());
          if (self._super) for (const k of self._super.methods.all()) keys.add(k);
          return keys;
        }
        has(key: Key): boolean { return !self.methods.resolve(key).none }
        resolve(key: Key): Node {
          if (self.eager.has(key)) {
            // const bound = self.eager.get(key)!.copy();
            // bound.value.self = self;
            return self.eager.get(key);
          }
          if (self._super) return self._super.methods.resolve(key);
          return self.None;
        }
        defines(key: Key): Node | null {
          if (self.eager.has(key)) return self;
          if (self._super) return self._super.methods.defines(key);
          return null;
        }
      }

      return this._methods = new Methods()
    }
    
    method(key: Key, fn: Method): Node {
      const method = this.New;

      (fn as EncodedMethod)._class = this;
      method.value.encoded = fn as EncodedMethod// ? fn : UNRESOLVED;

      this.value.set(key, method)

      return method;
    }

  }
}