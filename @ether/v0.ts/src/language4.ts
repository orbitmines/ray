import { sources } from './bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const EXTENSION = '.ray';
export const ENTRYPOINT = ['@ether', 'ray', `.entrypoint${EXTENSION}`]
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 4];

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { value: false, alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    {             description: 'Enable the debugger and debug-level logging.' },
//   daemon:   { alias: 'd', value: () => env.socket, optional: true, description: `Run as the background daemon, on a socket; with files` },
//   attach:   { alias: 'a', value: true, optional: true, description: `Attach to a job's output (the latest without an id)` },
//   list:     { alias: 'l', description: `List the daemon's jobs.` },
//   stop:     { value: true, description: 'Stop a job.' },
//   rm:       { value: true, optional: true, description: 'Remove a finished job and its output (all finished jobs without an id).' },
  // TODO --ephemeral: the client's command line is still visible to the same user in `ps` while it runs; the daemon's (and its workers') memory can be swapped to disk (no mlock/VirtualLock);
  //      ephemeral jobs of a daemon that was replaced by a newer build can't be listed or stopped any more (its socket is gone); environment variables are never persisted, which a future `continue` would need to revisit.
//   lsp:      { description: 'Serve the language server (LSP) over stdio, through the daemon; for a project, which when it is a !language project is the language read.' },
//   ephemeral: {           description:`Keep nothing on disk: the output is only streamed, and the job's record is removed when it ends.` },
//   verbose:  { alias: 'v', description: 'Say what was read before the file, and how long it took.' },
};


export async function main([args, kwargs]: CLI.Args = CLI.args()) {
  if (kwargs.version) return console.log(env.version.toString());
  if (kwargs.help) { console.log(CLI.help()); return; }
  if (args.length === 0 && !kwargs.abstract) { console.log(CLI.help()); return; }

  return await new Program(new Text.Source(args[0]), ...args.slice(1))
    .abstract(!!kwargs.abstract)
    .execute();
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
    return [`${NAME} ${env.version.toString()}`, `Usage: ${env.command.toLowerCase()} [options] [entrypoint] [include...]`, 'Options:', ...rows.map(([flags, d]) => d ? `${flags.padEnd(width)}  ${d}` : flags)].join('\n');
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
          if (opt?.value) {
            const rest = names.slice(j + 1);
            if (opt.optional && rest !== '' && [...rest].every(name => resolve(name)[1] !== undefined)) { add(key, CLI.preset(opt)); continue; }
            add(key, rest || attached || (opt.optional ? CLI.preset(opt) : tokens[++i] || true));
            break;
          }
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

  static get command(): typeof NAME | typeof ALIASES[number] {
    if (!env.nodejs) return NAME;
    const named = (location?: string) => location?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1|js|mjs|cjs|ts)$/i, '').toLowerCase();
    for (const candidate of [process.env.ETHER_COMMAND, named(process.argv0), named(process.execPath), named(process.argv[1])])
      if (ALIASES.includes(candidate as any)) return candidate as typeof ALIASES[number];
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
  private static _net: typeof import('net') | undefined;
  private static _child_process: typeof import('child_process') | undefined;
  private static _worker_threads: typeof import('worker_threads') | undefined;
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }
  static get os(): typeof import('os') { return env._os ??= env.import('os', env._os); }
  static get net(): typeof import('net') { return env._net ??= env.import('net', env._net); }
  static get child_process(): typeof import('child_process') { return env._child_process ??= env.import('child_process', env._child_process); }
  static get worker_threads(): typeof import('worker_threads') { return env._worker_threads ??= env.import('worker_threads', env._worker_threads); }

  static thread(data: object = {}, variables: Record<string, string> = {}): import('worker_threads').Worker {
    const file = env.url.fileURLToPath(import.meta.url), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
    return new env.worker_threads.Worker(file, {
      workerData: { daemon: NAME, ...data },
      env: { ...process.env, ...variables },
      execArgv: typescript ? [...process.execArgv.filter(flag => !flag.startsWith('--stack-size')), '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
      resourceLimits: { stackSizeMb: 256 },
    });
  }

  static get worker(): boolean {
    if (env.nodejs) return !env.worker_threads.isMainThread && env.worker_threads.workerData?.daemon === NAME;
    return env.scope === 'worker';
  }

  static get scope(): 'node' | 'page' | 'worker' | 'daemon' | 'shared' {
    if (env.nodejs) return 'node';
    const scope = globalThis as any;
    if (typeof scope.WorkerGlobalScope === 'undefined') return 'page';
    if (scope.name === `${NAME} worker`) return 'worker';
    if (scope.name !== `${NAME} daemon`) return 'page';
    return typeof scope.SharedWorkerGlobalScope !== 'undefined' && scope instanceof scope.SharedWorkerGlobalScope ? 'shared' : 'daemon';
  }

  static get sources(): Record<string, string> { return sources; }
  static get manifest(): string[] { return Object.keys(sources); }

  static get version() { return Version.create(version[0], version[1], version[2]) }

  static get cache(): string {
    const { os, path } = env;
    if (process.platform === 'win32') return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches');
    return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  }

  static get build(): string {
    const modified = (file: string) => { try { return env.fs.statSync(file).mtimeMs; } catch { return 0; } };
    const source = env.url.fileURLToPath(import.meta.url);
    return [env.version.toString(), source, modified(source), process.execPath, modified(process.execPath)].join(' ');
  }

  private static _socket?: string;
  static get socket(): string {
    if (env._socket) return env._socket;
    if (!env.nodejs) throw new Error(`The ${NAME} daemon's socket only exists on a system (Node.js, Deno), not in a browser.`);
    const { os, path } = env, user = os.userInfo();
    if (process.platform === 'win32') return env._socket = `\\\\.\\pipe\\ether-${user.username}`;
    const dir = process.env.XDG_RUNTIME_DIR || path.join(os.tmpdir(), `ether-${user.uid}`);
    return env._socket = path.join(dir, 'ether.sock');
  }

  static root(cwd: string = process.cwd()): string {
    const { fs, path } = env;
    const language_dir = (dir: string) => path.join(dir, ...ENTRYPOINT);
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = cwd;
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return dir;
    dir = import.meta.dirname;
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${ENTRYPOINT.join('/')}' directory.`)
  }

}

export namespace Global {
  export abstract class Node {
    abstract source: Source
  }
  export abstract class Source {
    location: string
    constructor(public relative_location?: string) { if (relative_location !== undefined) this.location = env.nodejs ? env.path.join(env.root(), relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>
    abstract reload(): Promise<void>
    abstract is_language_entrypoint: boolean

    get dir() { return this.location.slice(0, this.location.lastIndexOf('/')); }
  }
}
export namespace Text {
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; }
    get loaded(): boolean { return this._value !== undefined; }
    get is_language_entrypoint(): boolean { 
      if (!this.loaded) return false;
      const end = this.value.indexOf('\n'); const first_line = end < 0 ? this.value : this.value.slice(0, end);
      return first_line.includes('!language'); 
    }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      await this.reload();
    }
    async reload(): Promise<void> {
      this.value = sources[this.relative_location] 
        ? sources[this.relative_location] // Try bundled first
        : env.nodejs
          ? await env.fs.promises.readFile(this.location, 'utf-8')
          : await (await fetch(new URL(this.location))).text()
    }
  }
}

enum Op { GOTO, LABEL, "." }

export class Program {
  graph: Uint32Array
  
  include: string[]
  constructor(public entrypoint: Global.Source, ...include: string[]) { this.include = include; }

  async language(): Promise<Text.Source> {
    const entrypoint = this.entrypoint as Text.Source;
    // (given nothing, no value and no location (`-n` without a file): the language's own)
    if (!entrypoint.loaded && entrypoint.location) await entrypoint.load();
    if (entrypoint.is_language_entrypoint) return entrypoint;

    const language = new Text.Source(ENTRYPOINT.join('/') + '2');
    await language.load();
    if (entrypoint.relative_location) this.include = [entrypoint.relative_location, ...this.include];
    return this.entrypoint = language;
  }

  abstractly: boolean = false;
  abstract(abstractly?: boolean): this { this.abstractly = abstractly ?? true; return this; }

  // A rule, as the language's entrypoint writes one first:
  //   {
  //     }
  //   =>
  // A body (opening `{`, its inside indented, closing `}`), then the definer: every later statement written that way, `X => Y`,
  // is a rule, `X` what it reads and `Y` (the lines after the definer, up to an empty line) what that is read as. Text is read one
  // character at a time; where a body opens, its inside is read the same way, from the top, until it closes.
  grammar?: { open: string, close: string, definer: string, end: string, from: number };
  rules: Program.Rule[] = [];

  async compile() {
    const entrypoint = await this.language(), text = entrypoint.value, end = '\n';
    // (read from after the `!language` mark)
    const from = entrypoint.is_language_entrypoint ? text.indexOf(end, text.indexOf('!language')) + 1 : 0;
    const blank = text.indexOf(end + end, from), lines = text.slice(from, blank < 0 ? text.length : blank).split(end).map(line => line.trim()).filter(line => line);
    const [open, close, definer] = [lines[0], lines[lines.length - 2], lines[lines.length - 1]];
    if (lines.length < 3 || !open || !close || !definer) throw new Error(`The first statement of '${entrypoint.relative_location ?? ENTRYPOINT.join('/')}' does not say how a rule is written: a body ('{', its close '}'), then the definer.`);
    this.grammar = { open, close, definer, end, from: blank < 0 ? text.length : blank };
    return this;
  }

  // Text read from `at`, one character at a time: a run of characters is one piece; where a body opens, its inside is read the
  // same way (back to the top) up to where it closes, as one piece. To the end, or (`inside`) to the close of the body read.
  read(s: string, at = 0, inside = false): [Program.Piece[], number] {
    const { open, close } = this.grammar!, pieces: Program.Piece[] = [];
    let from = at;
    for (; at < s.length; at++) {
      if (inside && s.startsWith(close, at)) break;
      if (!s.startsWith(open, at)) continue;
      if (at > from) pieces.push({ literal: s.slice(from, at) });
      const [body, to] = this.read(s, at + open.length, true);
      pieces.push({ body, text: s.slice(at + open.length, to) });
      at = to + close.length - 1; from = at + 1;
    }
    if (at > from) pieces.push({ literal: s.slice(from, at) });
    return [pieces, at];
  }

  // The statements after the first, up to each empty line: a rule where the definer is written outside its bodies, what is
  // before it its head (a body in it a hole, the rest literal), what is after it the right side.
  parse(): Program.Rule[] {
    const { definer, end, from } = this.grammar!, text = (this.entrypoint as Text.Source).value.slice(from);
    for (const statement of text.split(end + end).map(statement => statement.trim()).filter(statement => statement)) {
      // (the definer, outside the bodies)
      let at = -1;
      for (let i = 0, depth = 0; i < statement.length && at < 0; i++)
        if (statement.startsWith(this.grammar!.open, i)) depth++; else if (statement.startsWith(this.grammar!.close, i)) depth--; else if (depth === 0 && statement.startsWith(definer, i)) at = i;
      if (at < 0) continue;
      const head = statement.slice(0, at).trim();
      // (a head's literal text, a piece per word; each body, a hole)
      const pieces = this.read(head)[0].flatMap<Program.Piece>(piece => 'literal' in piece ? piece.literal.split(/\s+/).filter(word => word).map(literal => ({ literal })) : [piece]);
      this.rules.push({ head, pieces, rhs: statement.slice(at + definer.length).trim() });
    }
    return this.rules;
  }

  // A text read by the rules: the first whose head reads it whole, and what its holes took.
  find(text: string): { rule: Program.Rule, captured: Record<string, string> } | undefined {
    const s = text.trim(), out: string[] = [];
    const { open, close } = this.grammar!;
    for (const rule of this.rules) if (Program.match(rule.pieces, s, open, close, out)) {
      const captured: Record<string, string> = {};
      for (let k = 0, c = 0; k < rule.pieces.length; k++) { const piece = rule.pieces[k]; if ('body' in piece) captured[piece.text.trim()] = out[c++]; }
      return { rule, captured };
    }
    return undefined;
  }

  // A text read by a rule's head from `t`: its literal words in order (spaces around them optional), each hole whatever is up to
  // where the rest reads (each place the word after it is written, the nearest first; else to the end, or each place), never
  // ending inside a body. What each hole took is pushed onto `out`.
  static match(pieces: Program.Piece[], s: string, open: string, close: string, out: string[], k = 0, t = 0): boolean {
    for (let c = s.charCodeAt(t); c === 32 || c === 10; c = s.charCodeAt(++t));
    if (k === pieces.length) return t === s.length;
    const piece = pieces[k];
    if ('literal' in piece) return s.startsWith(piece.literal, t) && Program.match(pieces, s, open, close, out, k + 1, t + piece.literal.length);
    const next = pieces[k + 1], after = next === undefined ? '' : 'literal' in next ? next.literal : undefined, n = out.length;
    let depth = 0, scanned = t;
    for (let u = after === '' ? s.length : after === undefined ? t + 1 : s.indexOf(after, t + 1); u > t; u = after === '' ? -1 : after === undefined ? (u < s.length ? u + 1 : -1) : s.indexOf(after, u + 1)) {
      // (not ending inside a body: the bodies between where it starts and `u` all closed)
      for (; scanned < u; scanned++) if (s.startsWith(open, scanned)) depth++; else if (s.startsWith(close, scanned)) depth--;
      if (depth !== 0) continue;
      out.push(s.slice(t, u).trim());
      if (Program.match(pieces, s, open, close, out, k + 1, u)) return true;
      out.length = n;
    }
    return false;
  }

  async execute() {
    await this.compile();
    return this.parse();
  }

}
export namespace Program {
  export type Piece = { literal: string } | { body: Piece[], text: string };
  export type Rule = { head: string, pieces: Piece[], rhs: string };
}

if (env.is_main_entrypoint) main();