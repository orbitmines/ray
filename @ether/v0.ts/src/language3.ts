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

  // A rule, as the language's entrypoint writes one first (a body, then the definer):
  //   {
  //     }
  //   =>
  // A statement whose first line ends with the definer is a rule: what is before it its head, the lines indented below it its
  // right side, what it is rewritten to. A head is read as written: a body in it is a hole (named by what is inside it; a
  // body around one, `{{name}}`, takes a body, its code, and ending a head the rest of a statement that does not end with one), an empty body (`{ }`) or a space a gap (spaces, at least one), the rest
  // literal. Text is read by every rule that reads it; the right side is run with `.` its first reading of the whole
  // statement (else its first), what is left after it read on in what the reading gave, when that is a node (`x.y`: `.y`
  // read in `x`).
  // A right side has three primitives, the rest is the entrypoint's: labels (`label\`), places among its statements; `goto`
  // a label (its name, while the code holding it is being run, the innermost first), or a value (the label written as it); and `.`, its reading, kept by the
  // reader: `goto .` goes on to the next reading of the same text (by any rule; the ones going least far first, of those
  // going as far the latest rule's last), and when there is none it does nothing. Read as a value, `.` is what it was read in
  // (`this`; in a call, what the closure was read from as a member (`r` in `r.append(x)`), else what `.` was where it was
  // written; at the top, the node being read in), and `.name` is `name` read in it. The first reading is the latest rule's of
  // those going furthest. Text read on in a value (`.y` of `x.y`, `(5)` of `f(5)`) is read in it, and then where it was
  // written (its rules below the value's); a reading's holes where they were written, and then in the value.
  // A right side is a rewrite: what it defines is defined where it was read. A hole is read once for all its uses (again
  // when the right side goes back over it): its value is written into the text as a body referring to it; in a definition's
  // head, as it was written; a body hole, as the code it is. A body read as a statement is a node: its statements are read
  // in it, the rules they define are its own (it sees the rules around it), and it is the value.
  grammar?: { open: string, close: string, definer: string };
  // (how long a reference written into text is)
  token = 0;
  // (the pairs a hole never ends inside, as it does not inside a body: learned from rules)
  opens = new Set<number>(); closes = new Set<number>(); paired = 0;
  global = new Program.Node();
  get rules() { return this.global.rules; }

  async compile() {
    const entrypoint = await this.language(), text = entrypoint.value;
    const lines = text.slice(text.indexOf('\n', text.indexOf('!language')) + 1).split('\n'), first: string[] = [];
    for (const line of lines) { if (!line.trim()) break; first.push(line.trim()); }
    if (first.length < 3) throw new Error(`The first statement of '${entrypoint.relative_location ?? ENTRYPOINT.join('/')}' does not say how a rule is written: a body ('{', its close '}'), then the definer.`);
    this.grammar = { open: first[0], close: first[first.length - 2], definer: first[first.length - 1] };
    this.token = first[0].length + 7 + first[first.length - 2].length;
    this.run(lines.slice(first.length + 1).join('\n'), { node: this.global });
    return this;
  }

  // A head: its holes, gaps (a hole named nothing) and literals, as written.
  private heads = new Map<string, Omit<Program.Rule, 'body' | 'code' | 'passes' | 'id'>>();
  rule(head: string, body: string): Program.Rule {
    let parsed = this.heads.get(head);
    if (!parsed) this.heads.set(head, parsed = this.head(head));
    // (a right side that begins by going on to the next reading: the reader goes on for it)
    const code = this.code(body);
    return { ...parsed, body, code, id: 0, passes: code.statements[0] === 'goto .' };
  }
  head(head: string): Omit<Program.Rule, 'body' | 'code' | 'passes' | 'id'> {
    const { open, close, definer } = this.grammar!, pieces: Program.Piece[] = [];
    let literal = '';
    const piece = (next?: Program.Piece) => {
      if (literal) pieces.push({ literal }), literal = '';
      if (next && !(next.hole === '' && pieces.at(-1)?.hole === '')) pieces.push(next);
    };
    for (let i = 0; i < head.length;)
      if (head.startsWith(open, i)) {
        const j = Program.closes(head, i, open, close), inside = head.slice(i + open.length, j - close.length).trim();
        // (a body around a hole, `{{name}}`: a hole taking a body, what is inside it)
        const body = inside.startsWith(open) && Program.closes(inside, 0, open, close) === inside.length;
        piece(body ? { hole: inside.slice(open.length, -close.length).trim(), body } : { hole: inside }); i = j;
      }
      else if (Program.space(head.charCodeAt(i))) { piece({ hole: '' }); while (Program.space(head.charCodeAt(i))) i++; }
      else literal += head[i++];
    piece();
    const literals = pieces.flatMap(({ literal }) => literal === undefined ? [] : [literal]);
    return {
      pieces, literals, bodies: new Set(pieces.flatMap(({ hole, body }) => body ? [hole!] : [])), head: pieces.map(({ literal, hole, body }) => literal ?? (body ? `{{${hole}}}` : `{${hole}}`)).join(''),
      holes: pieces.flatMap(({ hole }) => hole ? [hole] : []),
      defines: literals.includes(definer), last: pieces[pieces.length - 1]?.literal,
      modifies: !!pieces.at(-1)?.body && pieces.slice(0, -1).every(({ hole }) => hole === undefined || hole === ''),
      key: literals.reduce((key, literal) => literal.length > key.length ? literal : key, ''),
    };
  }
  static space(c: number) { return c === 32 || c === 10 || c === 9 || c === 13; }
  static closes(s: string, i: number, open: string, close: string): number {
    let depth = 1, j = i + open.length;
    while (j < s.length && depth > 0) if (s.startsWith(close, j)) { depth--; j += close.length; } else if (s.startsWith(open, j)) { depth++; j += open.length; } else j++;
    return j;
  }

  // Each way a rule's head reads the start of `s` (only those reading all of it when `whole`), its holes ending as near as they
  // can first: a hole neither starts nor ends with a space, nor ends inside a body, nor goes past the end of a line outside one
  // (but the last); a gap takes all the spaces there are.
  // A hole's span is kept as where it starts and ends.
  // Reading all of it with a rule whose right side only goes on, only its last reading is ever run: its holes are tried
  // ending as far as they can first, up to the first reading.
  read_by(rule: Program.Rule, s: string, whole: boolean, rank: number, out: Program.Read[]) {
    const { pieces } = rule, { open, close } = this.grammar!, { opens, closes } = this, o = open.charCodeAt(0), c = close.charCodeAt(0), n = s.length, spans: number[] = [];
    const last_only = whole && rule.passes, count = out.length;
    const step = (k: number, t: number): void => {
      if (k === pieces.length) { if (!whole || t === n) out.push({ at: t, spans: spans.slice(), rule, rank }); return; }
      const { literal, hole, body } = pieces[k];
      if (literal !== undefined) { if (s.startsWith(literal, t)) step(k + 1, t + literal.length); return; }
      if (body) {
        // (ending a head, in a statement that does not end with a body: the rest, as code)
        if (k === pieces.length - 1 && t < n && !Program.space(s.charCodeAt(t)) && !s.endsWith(close)) {
          spans.push(t, n); step(k + 1, n); spans.length -= 2;
          return;
        }
        // (a body: written code, not a value written as one)
        if (!s.startsWith(open, t) || s.charCodeAt(t + open.length) === 0xE000) return;
        const u = Program.closes(s, t, open, close), next = pieces[k + 1];
        if (next && (next.literal !== undefined ? !s.startsWith(next.literal, u) : next.hole === '' && !Program.space(s.charCodeAt(u)))) return;
        spans.push(t + open.length, u - close.length); step(k + 1, u); spans.length -= 2;
        return;
      }
      if (hole === '') { let u = t; while (Program.space(s.charCodeAt(u))) u++; if (u > t) step(k + 1, u); return; }
      if (t >= n || Program.space(s.charCodeAt(t))) return;
      const next = pieces[k + 1], last = !next, ends: number[] = [];
      for (let u = t, depth = 0; u < n;) {
        const x = s.charCodeAt(u);
        if (x === o && s.startsWith(open, u)) { depth++; u += open.length; } else if (x === c && s.startsWith(close, u)) { if (--depth < 0) break; u += close.length; }
        else if (opens.has(x)) { depth++; u++; } else if (closes.has(x)) { if (--depth < 0) break; u++; }
        else if (x === 10 && !depth && !last) break; else u++;
        if (depth > 0 || Program.space(s.charCodeAt(u - 1)) || (last && whole && u < n)) continue;
        if (last || (next.literal !== undefined ? s.startsWith(next.literal, u) : next.hole !== '' || Program.space(s.charCodeAt(u)))) ends.push(u);
      }
      for (let e = 0; e < ends.length; e++) {
        const u = ends[last_only ? ends.length - 1 - e : e];
        spans.push(t, u); step(k + 1, u); spans.length -= 2;
        if (last_only && out.length > count) return;
      }
    };
    step(0, 0);
  }

  // Code: its statements (a statement a line, the lines indented below it with it, and those while a body in it is open; as
  // indented as its first), and where its
  // labels (`label\`) are among them. Code is split once: kept here when it refers to no value, else by what holds it (a rule).
  private codes = new Map<string, Program.Code>();
  code(code: string): Program.Code {
    let split = this.codes.get(code);
    if (split) return split;
    const { open, close } = this.grammar!, statements: string[] = [], lines = code.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')), base = Math.min(...lines.map(line => line.length - line.trimStart().length));
    let depth = 0;
    for (const line of lines.map(line => line.slice(base))) {
      if (statements.length && (depth > 0 || Program.space(line.charCodeAt(0)))) statements[statements.length - 1] += '\n' + line; else statements.push(line.trimEnd());
      depth += line.split(open).length - line.split(close).length;
    }
    // (a label written with a hole, `{x}\`, is the value the hole is: gone to by `goto` that value)
    const marked = statements.flatMap((statement, k) => /^\S+\\$/.test(statement) ? [k] : []);
    const labels = new Map(marked.filter(k => !statements[k].includes(open)).map(k => [statements[k].slice(0, -1), k]));
    split = { statements, labels, marks: new Set(marked), valued: marked.filter(k => statements[k].includes(open)), templates: new Map(), helds: new Map() };
    if (!code.includes(Program.REFERS)) this.codes.set(code, split);
    return split;
  }

  // Code run: its statements in order, `goto` going to a label among them, else out to where it is found. The value: what the
  // last statement gave.
  run(written: string | Program.Code, frame: Program.Frame, except?: Program.Rule, answers = false): unknown {
    const code = typeof written === 'string' ? this.code(written) : written, { statements, labels } = code;
    if (labels.size) this.scopes.push(labels);
    this.depth++;
    let value: unknown;
    try {
      // (a right side that begins by going on: the reader has already gone on past every reading it would)
      for (let k = except?.passes && code === except.code ? 1 : 0; k < statements.length; k++) {
        const statement = statements[k];
        if (statement.endsWith('\\') && code.marks.has(k)) continue;
        if (!statement.startsWith('goto ')) {
          try { value = answers && k === statements.length - 1 ? this.valued(statement, frame, except, code) : this.evaluate(statement, frame, except, true, code); }
          catch (jump) { if (!(jump instanceof Program.Place) || jump.labels !== labels) throw jump; if (jump.at < k) frame.reading?.values.clear(); k = jump.at; }
          continue;
        }
        // (a label's name: one in scope, else one the host holds; else what the target reads as)
        const target = statement.slice('goto '.length), place = target === '.' ? undefined : this.place(target);
        const to = target === '.' ? frame.reading : place ?? (this.outside.has(target) ? target : this.evaluate(target, frame, except, true, code));
        if (to instanceof Program.Reading) { const next = to.next(); if (next) throw new Program.Again(next); continue; }
        if (!(to instanceof Program.Place)) {
          // (a value: the label written as it, else one the host holds, else nothing)
          const { reading } = frame, at = to === undefined || !reading ? undefined : code.valued.find(at => {
            const hole = this.alone(statements[at].slice(0, -1), code);
            return hole !== undefined && hole in reading.caps && this.held_value(this.shared(reading, hole)) === to;
          });
          if (at !== undefined) { if (at < k) frame.reading?.values.clear(); k = at; }
          else if (typeof to === 'string') this.outside.get(to)?.(frame);
          continue;
        }
        if (to.labels !== labels) throw to;
        if (to.at < k) frame.reading?.values.clear();
        k = to.at;
      }
    } finally { if (labels.size) this.scopes.pop(); if (--this.depth === 0) this.done_reading(); }
    return value;
  }
  // The labels the host holds: `goto report` hands it the reading (`.`), and the right side goes on.
  reports: Program.Reading[] = [];
  outside = new Map<string, (frame: Program.Frame) => void>([['report', frame => { if (frame.reading) this.reports.push(frame.reading); }]]);
  // (the rules whose right sides are running: a definition is not read by one of them)
  private running: Program.Rule[] = [];
  // (the labels of the code being run, the innermost last: a label's name read where it is is that place)
  private scopes: Map<string, number>[] = [];
  place(s: string): Program.Place | undefined {
    for (let k = this.scopes.length - 1; k >= 0; k--) { const at = this.scopes[k].get(s); if (at !== undefined) return new Program.Place(this.scopes[k], at); }
    return undefined;
  }

  // A statement: its holes (`{name}`) rewritten by the reading it is in; `.` that reading; then read by the rules (one whose
  // right side is being run doesn't read it). Else it is itself. A definition whose right side is one of the reading's holes
  // (`{name} =>` over `{value}`) makes that hole a value: read once, when it is first read, in the node the reading is in.
  evaluate(statement: string, frame: Program.Frame, except?: Program.Rule, written = true, code?: Program.Code): unknown {
    const { reading } = frame;
    if (!written || !reading) return this.read(statement.trim(), frame, except);
    // (a body hole on its own is run, as the code it is, each time; any other hole on its own is read: once)
    const alone = this.alone(statement, code);
    if (alone !== undefined && alone in reading.caps)
      return reading.rule.bodies.has(alone) ? this.run(reading.caps[alone], { node: frame.node, this: reading.self }) : this.held_value(this.shared(reading, alone));
    const text = this.substituted(statement, reading, reading.site, code);
    return this.read(text.trim(), frame, except, this.alike);
  }
  // (a statement read where a value is wanted: a rule on one line is a node holding it, one whose rules each run in a new node
  // where it is)
  valued(statement: string, frame: Program.Frame, except?: Program.Rule, code?: Program.Code, written = !!frame.reading): unknown {
    if (!this.defining(statement)) return this.evaluate(statement, frame, except, written, code);
    const node = new Program.Node(frame.site ?? frame.node);
    node.calls = true; node.self = frame.this ?? frame.node;
    const value = this.evaluate(statement, { ...frame, node }, except, written, code);
    return value === undefined ? node : value;
  }
  // (the hole a statement is, when it is one on its own line and nothing else)
  alone(statement: string, code?: Program.Code): string | undefined {
    const template = this.templated(statement, code);
    return template.length === 3 && !template[0] && !template[2] && (template[1] as Program.Hole).indent !== undefined ? (template[1] as Program.Hole).name : undefined;
  }
  // (a reading's hole, read once for every use of it, where its text was written: until the right side goes back over it)
  shared(reading: Program.Reading, name: string): Program.Held {
    let held = reading.values.get(name);
    // (read where its text was written, then in what the reading was read in; a call's, only where it was written)
    const also = reading.rule.home?.calls || reading.site === reading.receiver ? undefined : reading.receiver;
    if (!held) reading.values.set(name, held = new Program.Held(reading.caps[name], reading.site, also, reading.self));
    return held;
  }
  // (read where a value is wanted, a rule written on one line is a node holding it: one whose rules each run in a new node in
  // it)
  held_value(held: Program.Held, except?: Program.Rule): unknown {
    if (held.read) return held.value;
    held.read = true;
    return held.value = this.valued(held.text, { node: held.node, site: held.site, this: held.self }, except, undefined, false);
  }
  // (text with the definer in it, outside any body)
  defining(s: string): boolean {
    const { open, close, definer } = this.grammar!;
    for (let i = s.indexOf(definer), depth = 0, at = 0; i >= 0; i = s.indexOf(definer, i + 1)) {
      for (; at < i; at++) if (s.startsWith(open, at)) depth++; else if (s.startsWith(close, at)) depth--;
      if (!depth && Program.space(s.charCodeAt(i - 1)) && (i + definer.length === s.length || Program.space(s.charCodeAt(i + definer.length)))) return true;
    }
    return false;
  }
  // (a definition: its first line ends with the definer)
  defines(statement: string): boolean {
    const line = statement.indexOf('\n');
    return (line < 0 ? statement : statement.slice(0, line)).trimEnd().endsWith(this.grammar!.definer);
  }
  // (the hole a definition's right side is, when it is one and nothing else)
  private helds = new Map<string, string | undefined>();
  held(statement: string, code?: Program.Code): string | undefined {
    const helds = code?.helds ?? this.helds;
    if (helds.has(statement)) return helds.get(statement);
    const { open, close } = this.grammar!, line = statement.indexOf('\n');
    const body = line < 0 ? '' : statement.slice(line + 1).trim();
    const held = line >= 0 && this.defines(statement) && body.startsWith(open) && Program.closes(body, 0, open, close) === body.length
      ? body.slice(open.length, -close.length).trim() : undefined;
    if (code || !statement.includes(Program.REFERS)) helds.set(statement, held);
    return held;
  }
  private referring_text?: RegExp;
  // (text with the holes written into it as their text again (only those not read yet, when `unread`): what was written)
  source(text: string, unread = false): string {
    if (!text.includes(Program.REFERS)) return text;
    const { open, close } = this.grammar!;
    this.referring_text ??= new RegExp(`${Program.escaped(open)}${Program.REFERS}([0-9a-z]{6})${Program.escaped(close)}`, 'g');
    return text.replace(this.referring_text, (whole, id, at: number) => {
      const value = this.referred_to(parseInt(id, 36));
      if (!(value instanceof Program.Held) || (unread && value.read)) return whole;
      const written = this.source(value.text, unread), line = text.lastIndexOf('\n', at - 1) + 1, end = text.indexOf('\n', at);
      // (alone on its line: its lines indented as that line)
      if (!written.includes('\n') || text.slice(line, at).trim() || text.slice(at + whole.length, end < 0 ? text.length : end).trim()) return written;
      return Program.indented(written, '').split('\n').join('\n' + text.slice(line, at));
    });
  }
  static escaped(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  read(s: string, frame: Program.Frame, except?: Program.Rule, alike?: string): unknown {
    const { open, close, definer } = this.grammar!;
    if (s.length === this.token && s.charCodeAt(open.length) === 0xE000) return this.body(s, frame, except);
    if (s.startsWith(open) && Program.closes(s, 0, open, close) === s.length) return this.body(s, frame, except);
    if (s === '.') return frame.this ?? frame.node;
    // (a member, `.name`: `name` read in `.`)
    if (s.charCodeAt(0) === 46 && !Program.space(s.charCodeAt(1))) {
      // (a capture of the reading: its text, as written)
      if (frame.reading && s.slice(1) in frame.reading.caps) return this.source(frame.reading.caps[s.slice(1)]);
      // (read on in a value, it is `name` read in the value; else in `.`)
      // (where the text was written: read on in a value, where it was before; else here (what `site` holds here then is only
      // where else to look))
      const self = frame.on ? frame.node : frame.this ?? frame.node, written = frame.on ? frame.site ?? frame.node : frame.node;
      return this.read(s.slice(1), { node: self, site: self === written ? undefined : written, this: frame.this, from: self, on: true });
    }
    if (s.startsWith('goto ')) return this.run(s, frame, except);
    // (a definition, its first line ending with the definer, is read only by a rule whose head has the definer)
    const line = s.indexOf('\n'), defines = (line < 0 ? s : s.slice(0, line)).trimEnd().endsWith(definer);
    // (the rules' readings of all of it; else a body it begins with; else every reading: found once for text read alike, in
    // a node that sees the same heads)
    // (kept in the nearest node out that has a rule that may read it: a new node with none reads it as the one it is in)
    let kept = frame.node;
    if (!(frame.on && kept.calls)) while (kept.outer && !this.offers(kept, s, defines, except)) kept = kept.outer;
    const memo = this.memo(kept, frame.site), read_alike = alike ?? Program.alike(s);
    const key = (except ? read_alike + '\u0001' + except.id : read_alike) + (frame.on && frame.node.calls ? '\u0002' : '');
    let found = memo.get(key);
    if (!found) {
      const candidates = this.candidates(s, frame.node, defines, except, frame.site, frame.on);
      let all = this.readings(s, candidates, true), leads = 0;
      if (!all.length && !defines && s.startsWith(open)) leads = Program.closes(s, 0, open, close);
      // (`.` and then what is read on in it: `. is x`)
      else if (!all.length && !defines && s.charCodeAt(0) === 46 && Program.space(s.charCodeAt(1))) leads = -1;
      else if (!all.length) all = this.readings(s, candidates, false);
      memo.set(key, found = { all, leads });
    }
    const { all, leads } = found;
    if (leads < 0) return this.on(frame.this ?? frame.node, s.slice(1), frame, except);
    if (leads) return this.on(this.body(s.slice(0, leads), frame), s.slice(leads), frame, except);
    if (all.length) {
      let reading = new Program.Reading(all, 0, s, frame.node, frame.site ?? frame.node, frame.this ?? frame.node, true), value: unknown;
      // (a rule a node holding it calls runs in a new node where that node is (`.` in it), its last statement read where a
      // value is wanted: what the call answers; or the new node, when it gives nothing)
      const { home } = reading.rule, node = home?.calls ? new Program.Node(home.outer) : frame.node;
      // (`.` in its right side: in a call, what the closure was read from (else where it was written); read on in a value (a
      // method), the value; else as it was)
      const self = home?.calls ? frame.from ?? home.self ?? home.outer! : frame.on ? frame.node : frame.this ?? frame.node;
      for (;;) {
        this.running.push(reading.rule);
        try { value = this.run(reading.rule.code, { reading, node, this: self }, reading.rule, node !== frame.node); break; }
        catch (again) { if (!(again instanceof Program.Again) || again.reading.all !== all) throw again; reading = again.reading; }
        finally { this.running.pop(); }
      }
      if (value === undefined && node !== frame.node) value = node;
      return reading.at === s.length ? value : this.on(value, reading.after, frame, except);
    }
    // (a rule: the first line ending with the definer)
    if (defines) {
      // (made by a rule creator's right side: as written, its holes not read yet their text)
      const made = except?.defines && s.includes(Program.REFERS) ? this.source(s, true) : s, at = made.indexOf('\n');
      const head = at < 0 ? made : made.slice(0, at), rule = this.rule(head.trimEnd().slice(0, -definer.length).trim(), at < 0 ? '' : made.slice(at + 1));
      // (a head that is one hole between two literals, each a character: those balance, as a body does)
      const [a, hole, b] = rule.pieces;
      if (rule.pieces.length === 3 && a.literal?.length === 1 && hole.hole && b.literal?.length === 1 && a.literal !== b.literal && !this.opens.has(a.literal.charCodeAt(0)))
        this.opens.add(a.literal.charCodeAt(0)), this.closes.add(b.literal.charCodeAt(0)), this.paired++;
      if (made.includes(Program.REFERS)) rule.holds = this.held_by(made);
      // (a variable, its right side one value: it rewrites the rule of the nearest node that has its head; any other
      // definition is made where it is read)
      let node = frame.node;
      // (past a first `goto .`, which a rule creator writes)
      const right = (at < 0 ? '' : made.slice(at + 1).trim()).replace(/^goto \.\s+/, ''), variable = right.length === this.token && right.charCodeAt(open.length) === 0xE000;
      if (variable) for (let at: Program.Node | undefined = frame.node; at; at = at.outer) if (at.has(rule.head)) { node = at; break; }
      rule.home = node;
      node.define(rule, variable);
      return undefined;
    }
    return this.source(s);
  }
  // (what is left after a value read on: in it, when it is a node; it is text already rewritten, its holes not the reading's)
  on(value: unknown, after: string, frame: Program.Frame, except?: Program.Rule): unknown {
    const node = value instanceof Program.Reading ? value.receiver : value;
    return node instanceof Program.Node ? this.evaluate(after, { node, site: frame.site ?? frame.node, from: frame.from, this: frame.this, on: true }, undefined, false) : this.evaluate(after, frame, except, false);
  }
  // A body: a value written into text (what it refers to), else a node its statements are read in (a new one each time; any
  // rule reads them).
  body(s: string, frame: Program.Frame, except?: Program.Rule): unknown {
    const { open, close } = this.grammar!;
    if (s.startsWith(open + Program.REFERS)) {
      const value = this.referred_to(parseInt(s.slice(open.length + 1, -close.length), 36));
      // (read as the right side of the rule it is read in: not by that rule)
      return value instanceof Program.Held ? this.held_value(value, except) : value;
    }
    // (in it where its text was written)
    const node = new Program.Node(frame.site ?? frame.node);
    this.run(s.slice(open.length, -close.length), { ...frame, node, site: undefined });
    return node;
  }
  // (a value, as text: text itself; anything else a body referring to it)
  // A reference lasts while the statement it is made in is read from the top; one written into a rule's text lasts while the
  // rule (or anything else) holds what it refers to.
  private reading_now = new Map<number, object>(); private referred = new Map<number, WeakRef<object>>(); private referring = 0; private depth = 0;
  private gone = new FinalizationRegistry<number>(id => this.referred.delete(id));
  written(value: unknown): string {
    if (typeof value === 'string') return value;
    const { open, close } = this.grammar!, object = value as { refers?: number, token?: string };
    if (object.refers === undefined) this.reading_now.set(object.refers = ++this.referring, object), object.token = open + Program.REFERS + object.refers.toString(36).padStart(6, '0') + close;
    return object.token!;
  }
  referred_to(id: number): unknown { return this.reading_now.get(id) ?? this.referred.get(id)?.deref(); }
  // (a reference written into a rule's text: kept for as long as what it refers to is)
  kept(object: object) {
    const id = (object as { refers: number }).refers;
    if (this.referred.has(id)) return;
    this.referred.set(id, new WeakRef(object)); this.gone.register(object, id);
  }
  done_reading() {
    for (const [id, object] of this.reading_now) if (!this.referred.has(id)) (object as { refers?: number }).refers = undefined;
    this.reading_now.clear();
  }
  // (the values text refers to: and those the text of a hole it refers to does)
  held_by(text: string, held: object[] = []): object[] {
    for (let i = text.indexOf(Program.REFERS); i >= 0; i = text.indexOf(Program.REFERS, i + 1)) {
      const value = this.referred_to(parseInt(text.slice(i + 1, i + 7), 36)) as object | undefined;
      if (!value || held.includes(value)) continue;
      held.push(value); this.kept(value);
      if (value instanceof Program.Held) this.held_by(value.text, held);
    }
    return held;
  }


  // (what was found reading text in a node: kept while the nodes it sees have the heads they had)
  memo(node: Program.Node, site?: Program.Node): Map<string, Program.Found> {
    let heads = this.paired; for (let at: Program.Node | undefined = node; at; at = at.outer) heads += at.headed;
    if (site) for (let at: Program.Node | undefined = site; at; at = at.outer) heads += at.headed;
    const memos = site ? (node.sited ??= new WeakMap()) : undefined;
    let found = memos ? memos.get(site!) : node.found;
    if (found?.heads !== heads) { found = { heads, found: new Map() }; if (memos) memos.set(site!, found); else node.found = found; }
    return found.found;
  }
  // (text, its references all alike: they are as long as each other, so where it is read is the same)
  static alike(s: string): string { return s.includes(Program.REFERS) ? s.replace(Program.REFERENCE, Program.REFERS) : s; }

  // The rules seen from `node` that may read `s`, each with its rank (a node's own after the ones around it, the latest last):
  // one led by a literal found by that literal (one of the starts of `s`), any other by its longest literal (found going once
  // through `s`), when `s` has each of its literals.
  private looked = 0;
  candidates(s: string, node: Program.Node, defines: boolean, except?: Program.Rule, site?: Program.Node, on = false): Program.Candidate[] {
    const candidates: Program.Candidate[] = [], look = ++this.looked;
    const take = (rules: Program.Rule[], rank: number) => {
      for (const rule of rules) if (this.may_read(rule, s, defines, except)) candidates.push({ rule, rank: rank + rule.id });
    };
    // (read on in a value: its rules, then those where the text was written, below them)
    for (let at: Program.Node | undefined = node, below = 0; at || (site && !below && (below = 1, at = site)); at = at.outer) {
      if (below) { if (at!.looked === look) continue; } else at!.looked = look;
      at = at!;
      // (a closure's call: only on what is read on in it)
      if (at.calls && !(on && at === node)) continue;
      const rank = (at.depth - below * 1e3) * 1e7;
      for (const length of at.lengths.get(s[0]) ?? []) { if (length > s.length) break; const rules = at.led.get(s.slice(0, length)); if (rules) take(rules, rank); }
      if (at.bare.length) take(at.bare, rank);
      // (a few keys each looked for; many found going once through `s`)
      if (at.keys.length <= 16) { for (const keyed of at.keys) if (s.includes(keyed.key)) take(keyed.rules, rank); }
      else for (let i = 0; i < s.length; i++) for (const keyed of at.loose.get(s.charCodeAt(i)) ?? [])
        if (keyed.looked !== look && s.startsWith(keyed.key, i)) { keyed.looked = look; take(keyed.rules, rank); }
    }
    return candidates;
  }
  // (a definition is read by a rule with the definer in its head, or by a modifier (words, then a body hole: the rest, as
  // code); one written by a rule creator's right side (a rule with the definer in its head) is made as written)
  may_read(rule: Program.Rule, s: string, defines: boolean, except?: Program.Rule): boolean {
    if (rule === except || (defines && (!(rule.defines || rule.modifies) || except?.defines))) return false;
    for (const literal of rule.literals) if (!s.includes(literal)) return false;
    return true;
  }
  // (whether a node has a rule of its own that may read `s`)
  offers(node: Program.Node, s: string, defines: boolean, except?: Program.Rule): boolean {
    if (!node.rules.length || node.calls) return false;
    for (const length of node.lengths.get(s[0]) ?? []) {
      if (length > s.length) break;
      for (const rule of node.led.get(s.slice(0, length)) ?? []) if (this.may_read(rule, s, defines, except)) return true;
    }
    for (const rule of node.bare) if (this.may_read(rule, s, defines, except)) return true;
    for (const keyed of node.keys) if (s.includes(keyed.key)) for (const rule of keyed.rules) if (this.may_read(rule, s, defines, except)) return true;
    return false;
  }
  // Their readings of `s` (only those reading all of it when `whole`), the ones going least far first, of those going as far
  // the latest rule's last.
  readings(s: string, candidates: Program.Candidate[], whole: boolean): Program.Read[] {
    const all: Program.Read[] = [];
    for (const { rule, rank } of candidates) if (!whole || rule.last === undefined || s.endsWith(rule.last)) this.read_by(rule, s, whole, rank, all);
    return all.length > 1 ? all.sort((a, b) => a.at - b.at || a.rank - b.rank) : all;
  }

  // (each hole a reading took rewritten to what it took; one on a line of its own, its lines indented as that line). A statement
  // is split once into its text and its holes.
  private templates = new Map<string, Program.Template>();
  // (and when each hole is written as a reference, the text as it reads alike: the same for every value)
  private alike?: string;
  substituted(s: string, reading: Program.Reading, node: Program.Node, code?: Program.Code): string {
    const template = this.templated(s, code);
    this.alike = undefined;
    if (template.length === 1) return s;
    const defines = this.defines(s), held = defines ? this.held(s, code) : undefined;
    let out = template[0] as string, referred = true;
    for (let k = 1; k < template.length; k += 2) {
      const { name, indent, written, headed } = template[k] as Program.Hole, cap = reading.caps[name];
      // (in a definition: its head as written, its right side code (a hole not read yet in it as written), but the hole it is,
      // and one already read: the shared value)
      const text = cap === undefined ? written
        : reading.rule.bodies.has(name) ? cap
        : defines && headed ? this.source(cap)
        : defines && name !== held && !reading.values.get(name)?.read ? this.source(cap, true)
        : this.written(this.shared(reading, name));
      if (text.length !== this.token || text.charCodeAt(this.grammar!.open.length) !== 0xE000) referred = false;
      out += (indent === undefined || cap === undefined ? text : Program.indented(text, indent)) + template[k + 1];
    }
    if (referred) {
      const { open, close } = this.grammar!, alike = template as Program.Template & { alike?: string };
      this.alike = alike.alike ??= template.map((part, k) => k % 2 ? ((part as Program.Hole).indent ?? '') + open + Program.REFERS + close : Program.alike(part as string)).join('').trim();
    }
    return out;
  }
  // (kept by the code it is in, else here when it refers to no value)
  templated(s: string, code?: Program.Code): Program.Template {
    const templates = code?.templates ?? (s.includes(Program.REFERS) ? undefined : this.templates);
    let template = templates?.get(s);
    if (!template) { template = this.template(s); templates?.set(s, template); }
    return template;
  }
  template(s: string): Program.Template {
    const { open, close } = this.grammar!, template: Program.Template = [];
    let from = 0;
    for (let i = s.indexOf(open); i >= 0; i = s.indexOf(open, i)) {
      const j = Program.closes(s, i, open, close), name = s.slice(i + open.length, j - close.length).trim();
      if (!name || name.includes(open)) { i += open.length; continue; }
      const line = s.lastIndexOf('\n', i - 1) + 1, end = s.indexOf('\n', j) < 0 ? s.length : s.indexOf('\n', j);
      const whole = !s.slice(line, i).trim() && !s.slice(j, end).trim();
      template.push(s.slice(from, whole ? line : i), { name, indent: whole ? s.slice(line, i) : undefined, written: s.slice(whole ? line : i, whole ? end : j), headed: !s.slice(0, i).includes('\n') });
      from = i = whole ? end : j;
    }
    template.push(s.slice(from));
    return template;
  }
  static indented(text: string, indent: string): string {
    if (!text.includes('\n')) return indent + text.trimStart();
    const lines = text.split('\n').filter(line => line.trim()), base = Math.min(...lines.map(line => line.length - line.trimStart().length));
    return lines.map(line => indent + line.slice(base)).join('\n');
  }

  // Each file included, read by the rules: what each statement gave.
  async execute() {
    await this.compile();
    const results: unknown[] = [];
    for (const file of this.include ?? []) { const source = new Text.Source(file); await source.load(); results.push(this.run(source.value, { node: this.global })); }
    return results;
  }
}
export namespace Program {
  export type Piece = { literal?: string, hole?: string, body?: boolean };
  export type Rule = { modifies: boolean, bodies: Set<string>, head: string, pieces: Piece[], body: string, code: Code, holds?: object[], home?: Node, literals: string[], holes: string[], defines: boolean, passes: boolean, id: number, last?: string, key: string };
  export type Hole = { name: string, indent?: string, written: string, headed: boolean };
  export type Keyed = { key: string, rules: Rule[], looked: number };
  export type Candidate = { rule: Rule, rank: number };
  export type Template = (string | Hole)[];
  export type Code = { statements: string[], labels: Map<string, number>, marks: Set<number>, valued: number[], templates: Map<string, Template>, helds: Map<string, string | undefined> };
  // (`node`: where it is read; `site`: where the text was written, when it is read on in a value)
  // (`from`: what the value it is read on in was read from: `.` in a call of it; `this`: what `.` is)
  // (`on`: read on in a value, `node`)
  export type Frame = { reading?: Reading, node: Node, site?: Node, from?: Node, this?: Node, on?: boolean };
  // A node: the rules defined in it (those led by a literal by its first character), and the node it is in.
  export class Node {
    static defined = 0;
    refers?: number; token?: string;
    // (how many heads it has; what reading text in it found)
    headed = 0; found?: { heads: number, found: Map<string, Found> }; sited?: WeakMap<Node, { heads: number, found: Map<string, Found> }>;
    looked = 0;
    // (a node holding a rule read where a value is wanted: each of its rules runs in a new node in it; `self`: what `.` was
    // where it was written, what it is in a call of it not read from a value)
    calls = false; self?: Node;
    rules: Rule[] = [];
    // (led by a literal: by that literal, and the lengths those have by their first character; else by the first character of
    // its longest literal)
    led = new Map<string, Rule[]>(); lengths = new Map<string, number[]>(); loose = new Map<number, Keyed[]>(); keys: Keyed[] = []; bare: Rule[] = [];
    depth: number;
    constructor(public outer?: Node) { this.depth = outer ? outer.depth + 1 : 0; }
    has(head: string) { return this.heads.has(head); }
    // (a head defined again in the same node: the rule it had takes the new right side; a rule with holes is placed as defined
    // now, the latest (a name keeps its place))
    private heads = new Map<string, Rule>();
    define(rule: Rule, variable = false): void {
      const had = this.heads.get(rule.head);
      if (had) {
        Object.assign(had, { body: rule.body, code: rule.code, passes: rule.passes, holds: rule.holds });
        if (!variable && had.holes.length) had.id = ++Node.defined, this.headed++;
        return;
      }
      rule.id = ++Node.defined; this.headed++;
      this.heads.set(rule.head, rule);
      this.rules.push(rule);
      const first = rule.pieces[0]?.literal;
      if (first !== undefined) {
        const rules = this.led.get(first);
        if (rules) return void rules.push(rule);
        this.led.set(first, [rule]);
        const lengths = this.lengths.get(first[0]);
        if (!lengths) this.lengths.set(first[0], [first.length]);
        else if (!lengths.includes(first.length)) lengths.push(first.length), lengths.sort((a, b) => a - b);
      }
      else if (!rule.key) this.bare.push(rule);
      else {
        const keyed = this.loose.get(rule.key.charCodeAt(0)), same = keyed?.find(({ key }) => key === rule.key);
        if (same) return void same.rules.push(rule);
        const added = { key: rule.key, rules: [rule], looked: 0 };
        this.keys.push(added);
        if (keyed) keyed.push(added); else this.loose.set(rule.key.charCodeAt(0), [added]);
      }
    }
  }
  // (a hole's text, read once when it is first read)
  // (`self`: what `.` was where its text was written)
  export class Held { read = false; value: unknown; refers?: number; token?: string; constructor(public text: string, public node: Node, public site?: Node, public self?: Node) {} }
  // (the character a body referring to a value begins with: one no text is written with)
  export const REFERS = '\uE000', REFERENCE = /\uE000[0-9a-z]{6}/g;
  export type Found = { all: Read[], leads: number };
  // (a place among the statements of code being run: a label)
  export class Place { constructor(public labels: Map<string, number>, public at: number) {} }
  export class Again { constructor(public reading: Reading) {} }
  export type Read = { at: number, spans: number[], rule: Rule, rank: number };
  // A reading of text by a rule (one of `all` the ways the rules read it): what its holes took, what is after it, the next one.
  // The first is the latest rule's of those going furthest (`all` is in that order): its last reading when its right side only
  // goes on, else its first. The next one after a reading whose right side only goes on is the next one that does more.
  export class Reading {
    private read: Read;
    // (`receiver`: the node it was read in; `.` read as a value)
    // (`site`: where its text was written, where its holes are read)
    // (`self`: what `.` is where it is read: in its holes)
    constructor(public all: Read[], private index: number, private text: string, public receiver: Node, public site: Node, public self: Node, first = false) {
      if (first) {
        this.index = all.length - 1;
        const { rule, at } = all[this.index];
        if (!rule.passes) while (this.index > 0 && all[this.index - 1].rule === rule && all[this.index - 1].at === at) this.index--;
      }
      else while (this.index + 1 < all.length && all[this.index].rule.passes) this.index++;
      this.read = all[this.index];
    }
    get rule() { return this.read.rule; }
    get at() { return this.read.at; }
    get after() { return this.text.slice(this.read.at); }
    values = new Map<string, Held>();
    private captured?: Record<string, string>;
    get caps() {
      if (this.captured) return this.captured;
      const caps: Record<string, string> = {}, { spans, rule } = this.read, s = this.text;
      for (let h = 0; h < rule.holes.length; h++) {
        const t = spans[2 * h], u = spans[2 * h + 1], text = s.slice(t, u);
        // (on more than one line, its first as indented as the line it is on)
        if (!text.includes('\n')) { caps[rule.holes[h]] = text; continue; }
        const line = s.lastIndexOf('\n', t - 1) + 1;
        let i = line; while (i < t && (s[i] === ' ' || s[i] === '\t')) i++;
        caps[rule.holes[h]] = s.slice(line, i) + text;
      }
      return this.captured = caps;
    }
    next(): Reading | undefined { return this.index + 1 < this.all.length ? new Reading(this.all, this.index + 1, this.text, this.receiver, this.site, this.self) : undefined; }
  }
}

if (env.is_main_entrypoint) main();