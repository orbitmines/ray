// Support
// Compile the runtime to another target (Implement runtime inside the language first?)
// Compile the program to another target - AST is just another target.

import { Source, Node } from "./source.ts";
import { Standard, Version } from "./version.ts";
import { Diagnostics } from "./diagnostics.ts";

namespace CLI { export type Args = [positional: string[], args: { [key: string]: string[] }] }

abstract class Program<Static extends Program<Static>> {
  versions: Map<Version, Static> = new Map()
  get version(): Version { return [...this.versions].find(([, v]) => v === this.self)![0]; }

  constructor(public language: Language | undefined, version: Version) {
    this.versions.set(version, this.self);
  }

  get self(): Static { return this as any as Static }
  get log(): Diagnostics { return this.language.log }

  backend(backend: Language, version?: string): Static { return this.language.backends[backend](this) }
  
  abstract source(): Generator<Source>
  abstract exec(...args: CLI.Args): any
  abstract abstract(): Static
  abstract reload(next: Static | Source | Node | Iterable<Source | Node>): Static
  // save() {}
}

export type Compiler<Input extends Program<Input> = Program<any>, Output extends Program<Output> = Program<any>> = (target: Language, input: Input) => Output

abstract class Language extends Program<Language> {

  constructor(public name: string, version: Version) {
    super(undefined, version)
  }
  language = this;
  abstract get log(): Diagnostics

  // This is a Ray with a compiler on each edge.
  frontends: Map<Language, Compiler> = new Map(); /* <- . -> */ backends: Map<Language, Compiler> = new Map()

  frontend(frontend: Language, compile: Compiler): this {
    frontend.backends.set(this, compile);
    this.frontends.set(this, compile);
    return this;
  }

  reload(next: Language | Source | Node | Iterable<Source | Node>): Language { return this.log.fatal(this.name, 'Not hot reloadable.'); }
  abstract(): Language { return this.log.fatal(this.name, 'Not abstract interpretable.'); }
  exec(positional: string[], args: { [key: string]: string[]; }) { return this.log.fatal(this.name, 'Not executable.'); }
  source(): Generator<Source> { return this.log.fatal(this.name, 'Source code not accessible.'); }

  repl(): void { return this.log.fatal(this.name, 'Not REPL\'able.'); }
}

export const Text = class A extends Language {
  static extension(...extension: string[]) { return new Text(extension) }
  constructor(public extension: string | string[]) {
    //TODO Version is Unicode string version.
    super('String', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  }
  log: Diagnostics = new Diagnostics()
}

export class Runtime extends Language {
  log: Diagnostics = new Diagnostics()
}