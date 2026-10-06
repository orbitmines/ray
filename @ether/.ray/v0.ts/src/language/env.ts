import { Text } from './text.ts';

export const version: [major: number, releaseDate: string, index: number] =
               [0, '2027-01-01', 1];

export namespace CLI {
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

  /** `<major>.E<tail>` */
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

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

  private static _root?: string;
  static get root(): string {
    if (env._root) return env._root;
    const { fs, path } = env;
    const root = ['@ether', '.ray']
    const language_dir = (dir: string) => path.join(dir, ...root);
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = process.cwd();
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Production: package ships @ether/.ray inside its tarball — root sits one dir up from src/.
    dir = path.resolve(import.meta.dirname, '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Development: src lives at <repo>/@ether/.ray/v0.ts/src — repo root is five dirs up.
    dir = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${root.join('/')}' directory.`)
  }
}

