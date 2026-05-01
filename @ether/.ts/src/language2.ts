// Support
// Compile the runtime to another target (Implement runtime inside the language first?)
// Compile the program to another target - AST is just another target.

import { nodejs } from "./node.js.ts";
import { Source, Node, Text } from "./source.ts";
import { Standard, Version } from "./version.ts";
import { Diagnostics } from "./diagnostics.ts";
import { manifest as bundle_manifest } from "./bundled.ts";

namespace CLI { export type Args = [] | [positional: string[], args: { [key: string]: string[] }] }

interface Program<Static extends Representation<Static>> extends Representation<Static> {
  exec(...args: CLI.Args): any
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

export type Compiler<Input extends Representation<Input> = Representation<any>, Output extends Representation<Output> = Representation<any>> = (target: Output, input: Input) => Output

abstract class Representation<Static extends Representation<Static> = Representation<any>> {
  
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
    if (this.frontends.find(frontend)) return this.log.fatal(this.name, `There's already a frontend named '${frontend.name}' for '${this.name}'`);
    frontend.backends.next.set(this, compile as any);
    this.frontends.next.set(this, compile as any);
    return this;
  }

  backend<Backend extends Representation>(backend: Backend, version?: string): Backend { return this.backends.get(backend)(this,) as Backend }
  frontend<Frontend extends Representation>(frontend: Frontend): Static {
    const compiler = this.frontends.find(frontend);
    if (!compiler) return this.log.fatal(this.name, `Could not find a frontend named '${frontend.name}' for '${this.name}'`);
    
    const x = this.new();
    x.source = function*() { yield *compiler(this, frontend).source() }
    return x;
  }

  new() {
    const x = this.construct();
    x.log = this.log;
    x.frontends = this.frontends;
    x.backends = this.backends;
    return x;
  }

  // This is representing Ray's ability to superpose a bunch of files (with different locations) on a single var.
  source?(): Iterable<Source>

  // save() {}
}

export class Compilers {
  constructor(public direction: -1 | 1) {}
  next: Map<Representation, Compiler> = new Map();

  // Technically there could be many paths from a frontend or to a backend, but just ignore that for now untill we have a .ray implementation.
  find(lang: Representation): Compiler | undefined {
    for (const [end, compiler] of this.all()) {
      if (end.name === lang.name) return compiler;
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
        yield [source, (target, input) => compiler(target, source_compiler(end, input))];
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

export class String extends Representation<String> {
  protected construct(): String { return new String(this.extension) }

  static extension(...extension: string[]) { return new String(extension) }
  constructor(public extension: string[]) {
    //TODO Version is Unicode string version.
    super(extension[0], (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  }
  log: Diagnostics = new Diagnostics()

  private _sources: Array<() => Iterable<Source>> = [];

  *source(): Generator<Source> {
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
  loadDirectory(location: string, options?: { recursively?: boolean }): this {
    const self = this, recursively = options?.recursively ?? false;
    this._sources.push(function*() { yield *self.walkDir(location, recursively); });
    return this;
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
    loadDirectory: (location: string, options?: { recursively?: boolean }): String => {
      if (bundle_manifest.length === 0) return this.loadDirectory(this.bundled_resolve(location), options);
      const recursively = options?.recursively ?? false;
      const prefix = location.replace(/\/$/, '') + '/';
      for (const entry of bundle_manifest) {
        if (!entry.startsWith(prefix)) continue;
        if (!recursively && entry.indexOf('/', prefix.length) !== -1) continue;
        if (this.extension.some(ext => entry.endsWith(ext))) this.loadFile(this.bundled_resolve(entry));
      }
      return this;
    },
  };

  private bundled_resolve(location: string): string {
    if (typeof process !== 'undefined' && (process as any).versions?.node)
      return nodejs.path.resolve(nodejs.root, location);
    return new URL('../' + location, import.meta.url).href;
  }

  private *walk(location: string): Iterable<Source> {
    if (!nodejs.fs.existsSync(location)) { this.log.error('load', `Not found: ${location}`); return; }
    const stat = nodejs.fs.statSync(location);
    if (stat.isFile()) { yield new Text.Source(undefined, location); return; }
    if (stat.isDirectory()) { yield *this.walkDir(location, true); return; }
    return this.log.fatal('file system', `"${location}": not a file or directory`);
  }
  private *walkDir(dir: string, recursively: boolean): Iterable<Source> {
    if (!nodejs.fs.existsSync(dir)) { this.log.error('load', `Directory not found: ${dir}`); return; }
    for (const entry of nodejs.fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = nodejs.path.join(dir, entry.name);
      if (entry.isDirectory()) { if (recursively) yield *this.walkDir(entryPath, true); }
      else if (this.extension.some(ext => entry.name.endsWith(ext))) yield new Text.Source(undefined, entryPath);
    }
  }
}

export class Runtime extends Representation<Runtime> implements Program<Runtime>, AbstractInterpretable<Runtime>, REPLable<Runtime>, Reloadable<Runtime> {
  protected construct(): Runtime { return new Runtime() }

  log: Diagnostics = new Diagnostics()

  exec(positional?: string[], args?: { [key: string]: string[]; }) {
    throw new Error("Method not implemented.");
  }
  abstract(): Runtime {
    throw new Error("Method not implemented.");
  }
  repl(): void {
    throw new Error("Method not implemented.");
  }
  reload(next: Source | Node | Iterable<Source | Node> | Runtime): Runtime {
    throw new Error("Method not implemented.");
  }
  
}