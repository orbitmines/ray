// Capture methods up to precedence
// Info message if a method on @ is used as a direct .; Mute with X.
// Bundle all the .ray files in a single .ray file.
// Support older versions of Node

const version: [major: number, releaseDate: string, index: number] =
               [0, '2027-01-01', 0];

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  { description: 'Print the version number.' },
  abstract: { alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    { alias: 'd', description: 'Enable the debugger and debug-level logging.' },
};

async function main([args, kwargs]: CLI.Args) {
  if (kwargs.version) return console.log(env.version.toString())
  if ((args.length === 0 && !kwargs.abstract) || kwargs.help) { console.log(CLI.help(cli)); return; }

  const diagnostics = new Diagnostics();
  await Ray.v0(diagnostics).abstract(!!kwargs.abstract).add(args.flatMap(x => env.at(x))).exec()

  if (env.nodejs && diagnostics.has_errors) process.exitCode = 1;

  diagnostics.print();
}

class Representation {

}
class Node {
  source: Source
}
class Expression {
  diagnostic: Diagnostic
}

namespace Global {
  export abstract class Source { 
    location: string
    constructor(public relative_location?: string) { this.location = env.nodejs ? env.path.join(env.root, relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>
  }
  export abstract class Program {
    constructor(public diagnostics: Diagnostics, public source: Source[]) {}

    abstractly: boolean = false;
    abstract(abstractly?: boolean): this { this.abstractly = abstractly ?? true; return this; }

    abstract exec(): Promise<Node>
  }
}

namespace Ray {
  export const EXTENSION = '.ray'

  export function v0(diagnostics: Diagnostics) { return new Program(diagnostics, env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) })) }

  class Program extends Global.Program {

    add(src: Source[]) { this.source.push(...src); return this; }
    
    exec(): Promise<Node> {
      
    }
    reload(next: Source | Node | Iterable<Source | Node>): Promise<Node> {
    }

  }
}

export type Source = Global.Source;
namespace Text {
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; }

    async load(): Promise<void> {
      if (this.value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      this.value = env.nodejs 
        ? await env.fs.promises.readFile(this.location, 'utf-8')
        : await (await fetch(new URL(this.location))).text()
    }
  }
}

namespace CLI {
  export type Args = [args: string[], kwargs: Record<string, string | true | (string | true)[]>];

  export interface Option { description?: string; value?: boolean; alias?: string; }
  export type Spec = Record<string, Option>;

  export function help(spec: Spec): string {
    const rows: [string, string][] = Object.entries(spec).map(([name, opt]) =>
      [`  ${opt.alias ? `-${opt.alias}, ` : '    '}--${name}${opt.value ? ' <value>' : ''}`, opt.description ?? '']);
    const width = Math.max(0, ... rows.map(([flags]) => flags.length));
    return [`Ether.ray ${env.version.toString()}`, 'Options:', ...rows.map(([flags, d]) => d ? `${flags.padEnd(width)}  ${d}` : flags)].join('\n');
  }
}

export interface Diagnostic {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'trace';
  node?: Node;
  message?: string;
}
export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = { trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5 };
export class Diagnostics {
  items: Map</*location:*/ string | undefined, Map<Expression, Diagnostic[]>> = new Map();

  private start = performance.now();

  constructor(public level: Diagnostic['level'] = 'info') {}

  *all(filter?: (x: Diagnostic) => boolean): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) { for (const [, elements] of arr) { for (const element of elements) { if (filter?(element) : true) yield element; } } }
  }

  is_visible(level: Diagnostic['level']): boolean { return DIAGNOSTIC_SEVERITY[level] >= DIAGNOSTIC_SEVERITY[this.level]; }

  get has_errors(): boolean { return [...this.errors].length > 0 }
  get errors() { return this.all(x => DIAGNOSTIC_SEVERITY[x.level] >= DIAGNOSTIC_SEVERITY['error'])}
  get warnings() { return this.all(x => x.level === 'warning')}

  // cascaded needs just 'which expression' ; errorregions/

  forget(src: Source | Iterable<Source>) {
    if (Symbol.iterator in src) { for (const element of src) { this.forget(element) }; return; }
    this.items.delete(src.location)
  }

  print() {
    
  }

  report(expression: Expression, entry: Diagnostic) {
    if (!this.is_visible(entry.level)) return;
    
    const location = entry.node?.source?.location;
    let expr = this.items.get(location);
    if (!expr) { expr = new Map(); this.items.set(location, expr); }
    let expr_diagnostics = expr.get(expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(expression, expr_diagnostics); }

    // Only error once per expression
    if (entry.level === 'error' && expr_diagnostics.filter(x => x.level === 'error').length > 0) return;

    expr_diagnostics.push(entry);
    
    if (entry.level === 'fatal') return this.exit();
  }

  exit(): never {
    this.print();
    if (env.nodejs) return process.exit(1);
    throw new Error('fatal diagnostic');
  }

  static c = {
    reset:     '\x1b[0m',
    gray:      '\x1b[90m',
    dark_gray: '\x1b[2;90m',
  }
  static levelColor: Record<Diagnostic['level'], string> = {
    fatal:   '\x1b[1;31m',
    error:   '\x1b[1;31m',
    warning: '\x1b[1;33m',
    info:    '\x1b[34m',
    debug:   '\x1b[32m',
    trace:   '\x1b[90m',
  }
  static theme: Record<string, string> = { namespace: '\x1b[38;2;154;134;253m', type: '\x1b[38;2;154;134;253m', class: '\x1b[38;2;154;134;253m', enum: '\x1b[38;2;154;134;253m', interface: '\x1b[38;2;154;134;253m', struct: '\x1b[38;2;154;134;253m', typeParameter: '\x1b[38;2;154;134;253m', parameter: '\x1b[38;2;196;185;254m', variable: '\x1b[38;2;196;185;254m', property: '\x1b[38;2;196;185;254m', enumMember: '\x1b[38;2;255;204;153m', event: '\x1b[38;2;154;134;253m', function: '\x1b[38;2;154;134;253m', method: '\x1b[38;2;154;134;253m', macro: '\x1b[38;2;154;134;253m', keyword: '\x1b[38;2;108;103;131m', modifier: '\x1b[38;2;108;103;131m', comment: '\x1b[38;2;108;103;131m', string: '\x1b[38;2;255;204;153m', number: '\x1b[38;2;255;204;153m', regexp: '\x1b[38;2;255;204;153m', operator: '\x1b[38;2;171;179;191m', decorator: '\x1b[38;2;255;204;153m' };
}

export class Version {
  static readonly letter = 'E';

  static MONTH_LETTERS = 'ABCDEFGHIJKL';

  constructor(
    public readonly major: number,
    public readonly year: number,
    public readonly yearsSinceRelease: number,
    public readonly month: number, // 1–12
    public readonly index: number,
  ) {}

  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }

  /** `<major>.E<tail>` — the form `parse` reads back. */
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

  /** Semver `<major>.<minor>.<patch>`; with `scheme`, re-suffixed `-E<tail>`. */
  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }

  static parse(version: string): Version {
    const m = /^(\d+)\.E(\d+)\.(\d+)([A-L])\.(\d+)$/.exec(version.trim());
    if (!m) throw new Error(`Version: cannot parse "${version}"`);
    const [, major, year, yearsSinceRelease, monthLetter, index] = m;
    return new Version(+major, +year, +yearsSinceRelease, Version.MONTH_LETTERS.indexOf(monthLetter) + 1, +index);
  }
  static tryParse(version: string): Version | null {
    try { return Version.parse(version); } catch { return null; }
  }
  static create(major: number, releaseDate: string, index: number): Version {
    const release = new Date(releaseDate);
    const now = new Date();
    const monthsTotal = Math.max(0,
      (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(
      major,
      Math.max(now.getFullYear(), release.getFullYear()),
      Math.floor(monthsTotal / 12),
      monthsTotal % 12 + 1,
      index,
    );
  }
}

export class env {
  static get nodejs(): boolean { return typeof process !== 'undefined' && (process as any).versions?.node; }
  static get is_main_entrypoint() { return env.nodejs && process.argv[1] !== undefined && import.meta.url === env.url.pathToFileURL(process.argv[1]).href }

  static cli_args(spec: CLI.Spec = {}): CLI.Args {
    const args: string[] = [];
    const kwargs: Record<string, string | true | (string | true)[]> = {};
    const add = (key: string, value: string | true): void => {
      const existing = kwargs[key];
      kwargs[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
    };
    const resolve = (name: string): [string, CLI.Option | undefined] => {
      if (spec[name]) return [name, spec[name]];
      const found = Object.entries(spec).find(([, opt]) => opt.alias === name);
      return found ? [found[0], found[1]] : [name, undefined];
    };
    const tokens = env.nodejs ? process.argv.slice(2) : [];
    let operands = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!operands && token === '--') { operands = true; continue; }
      if (operands || token === '-' || !token.startsWith('-')) { args.push(token); continue; }
      const eq = token.indexOf('=');
      const attached = eq === -1 ? undefined : token.slice(eq + 1);
      if (token.startsWith('--')) {
        const [key, opt] = resolve(eq === -1 ? token.slice(2) : token.slice(2, eq));
        add(key, attached ?? (opt?.value ? tokens[++i] ?? true : true));
      } else {
        const names = eq === -1 ? token.slice(1) : token.slice(1, eq);
        for (let j = 0; j < names.length; j++) {
          const [key, opt] = resolve(names[j]);
          if (opt?.value) { add(key, names.slice(j + 1) || attached || tokens[++i] || true); break; }
          add(key, j === names.length - 1 ? attached ?? true : true);
        }
      }
    }
    return [args, kwargs];
  }

  private static _require: NodeRequire | undefined;
  static import<T>(name: string, cached?: T | undefined): T {
    if (cached !== undefined) return cached;
    if (!env.nodejs)
      throw new Error(`Module '${name}' is only available in a Node.js environment.`);
    try {
      if (!env._require) {
        if (typeof require === 'function') env._require = require;
        else env._require = (process as any).getBuiltinModule('module').createRequire(import.meta.url);
      }
      return env._require!(name);
    } catch (e) { throw new Error(`Failed to load Node.js module '${name}': ${(e as Error).message}`); }
  }

  private static _fs: typeof import('fs') | undefined;
  private static _path: typeof import('path') | undefined;
  private static _url: typeof import('url') | undefined;
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }

  private static _manifest?: string[];
  static get manifest(): string[] {
    if (env._manifest) return env._manifest;
    try { 
      const manifest_file = './bundled.ts';
      const manifest = env.import<{ manifest: string[] }>(manifest_file).manifest; 
      if (!manifest.length) throw new Error(`Couldn't find any entries in the manifest (a file in '${manifest_file}'), this is an error on the side of the developer or you didn't create a bundle, see the original repository for how that is done.`);
      return env._manifest = manifest;
    }
    catch { return env._manifest = []; }
  }

  static variable(name: string): string | undefined {
    const value = env.nodejs ? process.env[name] : (globalThis as any)[name];
    return value === undefined || value === null ? undefined : String(value);
  }

  static file(location: string): Source { return new Text.Source(location); }
  static directory(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean }): Source[] {
    location = location.replace(/\/$/, '')
    if (!env.nodejs) {
      const prefix = location + '/';
      return env.manifest
        .filter(entry => entry.startsWith(prefix))
        .filter(entry => options.recursively || !entry.slice(prefix.length).includes('/'))
        .filter(entry => options.filter?(entry) : true)
        .map(env.file);
    }

    const locations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of env.fs.readdirSync(env.path.join(env.root, dir), { withFileTypes: true })) {
        const entry_path = `${dir}/${entry.name}`;
        if (options.filter?(entry_path) : false) continue;
        locations.push(entry_path);
        if (options.recursively && entry.isDirectory()) walk(entry_path);
      }
    };
    walk(location);
    return locations.map(env.file);
  }
  static at(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean } = {}): Source[] {
    location = location.replace(/\/$/, '')
    const is_file = env.nodejs
      ? env.fs.statSync(env.path.join(env.root, location)).isFile()
      : env.manifest.includes(location);
    return is_file ? [env.file(location)] : env.directory(location, options);
  }

  static get version() { return Version.create(version[0], version[1], version[2]) }

  private static _root?: string;
  static get root(): string {
    if (env._root) return env._root;
    const { fs, path } = env;
    const root = ['@ether', '$', '.ray']
    const language_dir = (dir: string) => path.join(dir, ...root);
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = process.cwd();
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Production: package ships @ether/$/.ray inside its tarball — root sits one dir up from src/.
    dir = path.resolve(import.meta.dirname, '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Development: src lives at <repo>/@ether/$/.ray/v0.ts/src — repo root is five dirs up.
    dir = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${root.join('/')}' directory.`)
  }
}

if (env.is_main_entrypoint) await main(env.cli_args(cli));