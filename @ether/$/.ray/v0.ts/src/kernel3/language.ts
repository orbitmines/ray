export const NAME = 'Ether' as const
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 1];

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    { alias: 'd', description: 'Enable the debugger and debug-level logging.' },
  daemon:   { alias: 'D', value: () => env.socket, optional: true, description: `Run as the background daemon, on a socket` },
};

async function main([args, kwargs]: CLI.Args = CLI.args()) {
  if (kwargs.daemon) return await daemon(env.secure(kwargs.daemon as string));
  if (kwargs.version) return console.log(env.version.toString());
  if ((args.length === 0 && !kwargs.abstract) || kwargs.help) { console.log(CLI.help()); return; }

  const diagnostics = new Diagnostics();
  await Ray.v0(diagnostics).abstract(!!kwargs.abstract).add(args.flatMap(x => env.at(x))).exec()

  if (env.nodejs && diagnostics.has_errors) process.exitCode = 1;
  diagnostics.print();
}

async function daemon(socket: string) {
  
}

export namespace CLI {
  export type Args = [args: string[], kwargs: Record<string, string | true | (string | true)[]>];

  export interface Option { description?: string; value?: boolean | (() => string); optional?: boolean; alias?: string; }
  export type Spec = Record<string, Option>;

  export function preset(opt: CLI.Option | undefined): string | true { return typeof opt?.value === 'function' ? opt.value() : true; }

  export function fallback(opt: CLI.Option): string {
    if (typeof opt.value !== 'function') return '';
    try { return ` (default: ${opt.value()})`; } catch { return ''; }
  }

  export function help(spec: CLI.Spec = cli): string {
    const rows: [string, string][] = Object.entries(spec).map(([name, opt]) =>
      [`  ${opt.alias ? `-${opt.alias}, ` : '    '}--${name}${opt.value ? opt.optional ? '[=<value>]' : ' <value>' : ''}`, (opt.description ?? '') + CLI.fallback(opt)]);
    const width = Math.max(0, ... rows.map(([flags]) => flags.length));
    return [`${NAME} ${env.version.toString()}`, 'Options:', ...rows.map(([flags, d]) => d ? `${flags.padEnd(width)}  ${d}` : flags)].join('\n');
  }

  export function args(spec: CLI.Spec = cli): CLI.Args {
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
        add(key, attached ?? (opt?.value && !opt.optional ? tokens[++i] ?? true : CLI.preset(opt)));
      } else {
        const names = eq === -1 ? token.slice(1) : token.slice(1, eq);
        for (let j = 0; j < names.length; j++) {
          const [key, opt] = resolve(names[j]);
          if (opt?.value) { add(key, names.slice(j + 1) || attached || (opt.optional ? CLI.preset(opt) : tokens[++i] || true)); break; }
          add(key, j === names.length - 1 ? attached ?? true : true);
        }
      }
    }
    return [args, kwargs];
  }
}

export class Version {
  static readonly letter = 'E';

  static MONTH_LETTERS = 'ABCDEFGHIJKL';

  constructor(public readonly major: number, public readonly year: number, public readonly yearsSinceRelease: number, public readonly month: number, public readonly index: number) {}

  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }

  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
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

  static get is_main_entrypoint(): boolean {
    if ((import.meta as any).main) return true;
    return env.nodejs && process.argv[1] !== undefined && import.meta.url === env.url.pathToFileURL(process.argv[1]).href;
  }

  static readonly aliases = ['ray', 'orbitmines'] as const;
  static get command(): typeof NAME | typeof env.aliases[number] {
    if (!env.nodejs) return NAME;
    const named = (location?: string) => location?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1|js|mjs|cjs|ts)$/i, '').toLowerCase();
    for (const candidate of [process.env.ETHER_COMMAND, named(process.argv0), named(process.execPath), named(process.argv[1])])
      if (env.aliases.includes(candidate as any)) return candidate as typeof env.aliases[number];
    return NAME;
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
  private static _os: typeof import('os') | undefined;
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }
  static get os(): typeof import('os') { return env._os ??= env.import('os', env._os); }

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

  static file(location: string): Text.Source { return new Text.Source(location); }
  static directory(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean }): Text.Source[] {
    location = location.replace(/\/$/, '')
    if (!env.nodejs) {
      const prefix = location + '/';
      return env.manifest
        .filter(entry => entry.startsWith(prefix))
        .filter(entry => options.recursively || !entry.slice(prefix.length).includes('/'))
        .filter(entry => options.filter ? options.filter(entry) : true)
        .map(env.file);
    }

    const locations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of env.fs.readdirSync(env.path.join(env.root, dir), { withFileTypes: true })) {
        const entry_path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { if (options.recursively) walk(entry_path); continue; }
        if (options.filter && !options.filter(entry_path)) continue;
        locations.push(entry_path);
      }
    };
    walk(location);
    return locations.map(env.file);
  }
  static at(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean } = {}): Text.Source[] {
    location = location.replace(/\/$/, '')
    const is_file = env.nodejs
      ? env.fs.statSync(env.path.join(env.root, location)).isFile()
      : env.manifest.includes(location);
    return is_file ? [env.file(location)] : env.directory(location, options);
  }

  static get version() { return Version.create(version[0], version[1], version[2]) }

  private static _socket?: string;
  static get socket(): string {
    if (env._socket) return env._socket;
    if (!env.nodejs) throw new Error(`The ${NAME} daemon's socket only exists on a system (Node.js, Deno), not in a browser.`);
    if (process.env.ETHER_SOCKET) return env._socket = process.env.ETHER_SOCKET;
    const { os, path } = env, user = os.userInfo();
    if (process.platform === 'win32') return env._socket = `\\\\.\\pipe\\ether-${user.username}`;
    const dir = process.env.XDG_RUNTIME_DIR || path.join(os.tmpdir(), `ether-${user.uid}`);
    return env._socket = path.join(dir, 'ether.sock');
  }

  static secure(socket: string): string {
    if (socket !== env.socket || process.env.ETHER_SOCKET || process.platform === 'win32') return socket;
    const { fs, path } = env, dir = path.dirname(socket);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0)
      throw new Error(`'${dir}' isn't a directory private to you (owned by you, mode 700); refusing to put the ${NAME} socket there.`);
    return socket;
  }

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
    dir = path.resolve(import.meta.dirname, '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Development: src lives at <repo>/@ether/$/.ray/v0.ts/src — repo root is five dirs up.
    dir = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${root.join('/')}' directory.`)
  }
}

if (env.is_main_entrypoint) { main(); }

enum Op { GOTO,  }

class Program {
  graph: Uint32Array

  constructor(code: string) {
    
  }


}
