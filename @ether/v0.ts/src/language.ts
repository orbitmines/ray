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
  test:     { alias: 't', description: 'Read the files (else the whole library), then run their tests (what was put off until everything was read).' },
  lsp:      {             description: 'Serve the language server (LSP) over stdio.' },
  verbose:  { alias: 'v', description: 'Say how long reading took, and what was said that is not a warning.' },
//   daemon:   { alias: 'd', value: () => env.socket, optional: true, description: `Run as the background daemon, on a socket; with files` },
//   attach:   { alias: 'a', value: true, optional: true, description: `Attach to a job's output (the latest without an id)` },
//   list:     { alias: 'l', description: `List the daemon's jobs.` },
//   stop:     { value: true, description: 'Stop a job.' },
//   rm:       { value: true, optional: true, description: 'Remove a finished job and its output (all finished jobs without an id).' },
  // TODO --ephemeral: the client's command line is still visible to the same user in `ps` while it runs; the daemon's (and its workers') memory can be swapped to disk (no mlock/VirtualLock);
  //      ephemeral jobs of a daemon that was replaced by a newer build can't be listed or stopped any more (its socket is gone); environment variables are never persisted, which a future `continue` would need to revisit.
//   ephemeral: {           description:`Keep nothing on disk: the output is only streamed, and the job's record is removed when it ends.` },
};


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

  static through_tsx = `const { workerData } = await import('node:worker_threads'); (await import(workerData.tsx)).register(); await import(workerData.kernel);`;
  static thread(data: object = {}, variables: Record<string, string> = {}): import('worker_threads').Worker {
    const file = env.url.fileURLToPath(import.meta.url), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
    // (a Node without `--experimental-transform-types` (26 on) runs the source through tsx: a thread that registers it, then
    // reads this file)
    if (typescript && !process.allowedNodeEnvironmentFlags.has('--experimental-transform-types')) return new env.worker_threads.Worker(new URL(`data:text/javascript,${encodeURIComponent(env.through_tsx)}`), {
      workerData: { daemon: NAME, ...data, kernel: import.meta.url, tsx: import.meta.resolve('tsx/esm/api') },
      env: { ...process.env, ...variables },
      execArgv: process.execArgv.filter(flag => !flag.startsWith('--stack-size')),
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 16) },
    });
    return new env.worker_threads.Worker(file, {
      workerData: { daemon: NAME, ...data },
      env: { ...process.env, ...variables },
      execArgv: typescript ? [...process.execArgv.filter(flag => !flag.startsWith('--stack-size')), '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 16) },
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

enum Op { GOTO, LABEL, ".", "&" }

// (a test that ran out of time or memory: nothing catches it, every later reading of the test throws it too)
export class Exhausted extends Error { }
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
  // (quotes: a head that is one hole between the same character twice, `"{text}"`)
  quotes = new Set<string>(); quoted = new Set<number>(); closers = new Map<string, string>(); paired_in = new Map<string, Program.Node>(); paired_by = new Map<string, string>();
  typed?: { between: string, check?: { value: string, type: string, code: string, home: Program.Node } };
  compiling = false;
  // (what else is written in a hole around its name, learned the same way: marks after it, prefixes before it)
  marks: string[] = []; prefixes: string[] = [];
  plain(name: string): string {
    for (const prefix of this.prefixes) if (name.startsWith(prefix)) name = name.slice(prefix.length);
    for (const mark of this.marks) { const at = name.indexOf(mark); if (at > 0) name = name.slice(0, at); }
    return name.trim();
  }
  // (what a mark in it names: `{name ^style}`, the style)
  marked(name: string): string | undefined {
    for (const mark of this.marks) { const at = name.indexOf(mark); if (at > 0) return name.slice(at + mark.length).trim() || undefined; }
    return undefined;
  }
  global = new Program.Node();
  get rules() { return this.global.rules; }

  async compile() {
    const entrypoint = await this.language(), text = entrypoint.value;
    const lines = text.slice(text.indexOf('\n', text.indexOf('!language')) + 1).split('\n'), first: string[] = [];
    for (const line of lines) { if (!line.trim()) break; first.push(line.trim()); }
    if (first.length < 3) throw new Error(`The first statement of '${entrypoint.relative_location ?? ENTRYPOINT.join('/')}' does not say how a rule is written: a body ('{', its close '}'), then the definer.`);
    this.grammar = { open: first[0], close: first[first.length - 2], definer: first[first.length - 1] };
    this.token = first[0].length + 7 + first[first.length - 2].length;
    // (the host's own kinds: its operators read where the language reads them, `goto kinds`, the rest after it)
    const kinds = await Program.host_kinds(), operators = kinds.indexOf('// What both answer'), rest = kinds.indexOf('// What a number or text is made of');
    this.kinds = { operators: kinds.slice(operators, rest), rest: kinds.slice(0, operators) + '\n' + kinds.slice(rest) };
    this.compiling = true;
    try { this.run(lines.slice(first.length + 1).join('\n'), { node: this.global }); } finally { this.compiling = false; }
    this.run(this.kinds.rest, { node: this.global });
    return this;
  }
  static async host_kinds(): Promise<string> {
    const at = new URL('./js.kinds.ray', import.meta.url);
    return env.nodejs ? env.fs.readFileSync(env.url.fileURLToPath(at), 'utf8') : await (await fetch(at)).text();
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
    const { open, close, definer } = this.grammar!, pieces: Program.Piece[] = [], types: [string, string][] = [];
    let literal = '';
    const piece = (next?: Program.Piece) => {
      if (literal) pieces.push({ literal }), literal = '';
      if (next && !(next.hole === '' && pieces.at(-1)?.hole === '')) pieces.push(next);
    };
    for (let i = 0; i < head.length;)
      if (head.startsWith(open, i)) {
        const j = this.closes_quoted(head, i); let inside = head.slice(i + open.length, j - close.length).trim();
        // (a hole written as quoted text, `` {`{`} ``: that text, literally)
        if (inside.length >= 2 && inside[0] === inside[inside.length - 1] && this.quotes.has(inside[0])) { literal += inside.slice(1, -1); i = j; continue; }
        // (a body around a hole, `{{name}}`: a hole taking a body, what is inside it)
        const body = inside.startsWith(open) && Program.closes(inside, 0, open, close) === inside.length;
        // (a typed hole, `{name: T}`: the hole `name`, of the type written; what separates them, learned (see `typed`))
        const style = body ? this.marked(inside.slice(open.length, -close.length)) : this.marked(inside);
        if (!body) inside = this.plain(inside);
        const between = this.typed?.between, typed = body || !between ? -1 : inside.indexOf(between);
        if (typed > 0) types.push([inside.slice(0, typed).trim(), inside.slice(typed + between!.length).trim()]);
        piece({ ...body ? { hole: this.plain(inside.slice(open.length, -close.length).trim()), body } : typed > 0 ? { hole: inside.slice(0, typed).trim(), written: inside, type: inside.slice(typed + between!.length).trim() } : { hole: inside }, ...style ? { style } : {} }); i = j;
      }
      else if (Program.space(head.charCodeAt(i))) { piece({ hole: '' }); while (Program.space(head.charCodeAt(i))) i++; }
      else literal += head[i++];
    piece();
    const literals = pieces.flatMap(({ literal }) => literal === undefined ? [] : [literal]);
    return {
      pieces, literals, types, bodies: new Set(pieces.flatMap(({ hole, body }) => body ? [hole!] : [])), head: pieces.map(({ literal, hole, body, written }) => literal ?? (body ? `{{${hole}}}` : `{${written ?? hole}}`)).join(''),
      holes: pieces.flatMap(({ hole }) => hole ? [hole] : []),
      defines: literals.includes(definer), last: pieces[pieces.length - 1]?.literal,
      braced: !!pieces.at(-1)?.body && literals.length === 0,
      modifies: !!pieces.at(-1)?.body && literals.length > 0 && pieces.slice(0, -1).every(({ hole }) => hole === undefined || hole === ''),
      key: literals.reduce((key, literal) => literal.length > key.length ? literal : key, ''),
    };
  }
  // (where a hole opened at `i` closes: what is quoted in it, as one)
  closes_quoted(s: string, i: number): number {
    const { open, close } = this.grammar!;
    let depth = 1, j = i + open.length;
    while (j < s.length && depth > 0) {
      if (this.quoted.has(s.charCodeAt(j))) { const q = Program.quote_end(s, j, s[j]); j = q < 0 ? s.length : q + 1; }
      else if (s.startsWith(close, j)) { depth--; j += close.length; } else if (s.startsWith(open, j)) { depth++; j += open.length; } else j++;
    }
    return j;
  }
  // (where what is quoted from `i` ends: the next same quote, one after `\` is part of the text)
  static quote_end(s: string, i: number, quote: string): number {
    for (let j = i + 1; j < s.length; j++) { if (s.charCodeAt(j) === 92) j++; else if (s.startsWith(quote, j)) return j; }
    return -1;
  }
  static within(node: Program.Node | undefined, outer: Program.Node): boolean {
    for (let at = node; at; at = at.outer) if (at === outer) return true;
    return !node;
  }
  // (nor one ending in an operator inside a longer one: `..` does not read the start of `..<`)
  static operator(s: string, i: number): boolean { return i >= 0 && i < s.length && '<>=!~|&+-*/%^?:.'.includes(s[i]); }
  static word(s: string, i: number): boolean { return i >= 0 && i < s.length && /[\p{L}\p{N}_]/u.test(s[i]); }
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
  // (a typed hole's type: read where its rule is, once it is a node; else none (`null`))
  // (one not a node yet: read again only at the next statement read from the top (reading a type can itself define things))
  private statements = 0;
  private types = new WeakMap<Program.Rule, (Program.Node | number | undefined)[]>(); private typing = new Set<Program.Rule>();
  type_of(rule: Program.Rule, k: number): Program.Node | undefined | null {
    let types = this.types.get(rule);
    if (!types) this.types.set(rule, types = []);
    const known = types[k];
    if (known instanceof Program.Node) return known;
    // (while a type is read, no typed hole reads anything: a type is a name, read without them)
    if (known === this.statements || this.typing.size) return null;
    this.typing.add(rule);
    // (a type that is a closure, a class's maker: the node it was made in, the class)
    // (a rule with no literal: where its node is, as its right side is read)
    const home = rule.home && !rule.literals.length && rule.home.outer ? rule.home.outer : rule.home ?? this.global;
    try { let value = this.read(rule.pieces[k].type!, { node: home }); const read = value; while (value instanceof Program.Node && value.calls && value.outer) value = value.outer; if (value instanceof Program.Node) { if (read !== value) this.type_values.set(value, read); return types[k] = value; } types[k] = this.statements; return null; }
    catch (e) { if (e instanceof Exhausted) throw e; types[k] = this.statements; return null; } finally { this.typing.delete(rule); }
  }
  // (whether a type's own rules read text whole: its rules matched, nothing read)
  private structures = new WeakMap<Program.Node, { headed: number, read: Map<string, boolean> }>();
  // (the characters a type's own rules can begin with: a literal's first, a typed hole's type's; an untyped hole, anything
  // (`null`))
  private firsts = new WeakMap<Program.Node, { headed: number, set: Set<number> | null }>();
  firsts_of(type: Program.Node, seen = new Set<Program.Node>()): Set<number> | null {
    const known = this.firsts.get(type);
    if (known && known.headed === type.headed) return known.set;
    if (seen.has(type)) return new Set();
    seen.add(type);
    let set: Set<number> | null = new Set();
    for (const rule of type.rules) {
      const first = rule.pieces[0];
      if (first?.literal !== undefined) { set.add(first.literal.charCodeAt(0)); continue; }
      const typed = first?.type !== undefined && !first.body ? this.type_of(rule, 0) : undefined;
      if (typed === null) continue;
      const inner = typed ? this.firsts_of(typed, seen) : null;
      if (inner === null) { set = null; break; }
      for (const c of inner) set.add(c);
    }
    this.firsts.set(type, { headed: type.headed, set });
    return set;
  }
  structural(s: string, type: Program.Node): boolean {
    let known = this.structures.get(type);
    if (!known || known.headed !== type.headed) this.structures.set(type, known = { headed: type.headed, read: new Map() });
    const had = known.read.get(s);
    if (had !== undefined) return had;
    known.read.set(s, false);
    // (not a method there (`m (…) =>`, a name given a closure): what it holds is not how a T is written)
    const named = (rule: Program.Rule) => {
      const statements = rule.code.statements.map(x => x.trim()).filter(x => x), body = statements[statements.length - 1] ?? '', { open, close } = this.grammar!;
      if (rule.holes.length || statements.length !== (rule.passes ? 2 : 1) || body.length !== this.token || body.charCodeAt(open.length) !== 0xE000) return false;
      const held = this.referred_to(parseInt(body.slice(open.length + 1, -close.length), 36)), value = held instanceof Program.Held ? held.value : held;
      return value instanceof Program.Node && value.calls;
    };
    const candidates: Program.Candidate[] = [], take = (rules: Program.Rule[]) => { for (const rule of rules) if (!rule.called && !named(rule) && this.may_read(rule, s, false)) candidates.push({ rule, rank: rule.id }); };
    for (const length of type.lengths.get(s[0]) ?? []) { if (length > s.length) break; const rules = type.led.get(s.slice(0, length)); if (rules) take(rules); }
    if (type.bare.length) take(type.bare);
    for (const keyed of type.keys) if (s.includes(keyed.key)) take(keyed.rules);
    const read = candidates.length > 0 && this.readings(s, candidates, true).length > 0;
    known.read.set(s, read);
    return read;
  }
  // (a value written into text, taken by a typed hole: the entrypoint's check answers something for it and the type; once a value)
  private dispatching?: string;
  // (a type that is a closure, a class's maker: what was read, for the check)
  private type_values = new WeakMap<Program.Node, unknown>();
  private accepted = new WeakMap<Program.Node, { objects: WeakMap<object, boolean>, values: Map<unknown, boolean> }>();
  // (the types deciding what they take: while one does, it takes nothing more (its check reading what it is asked about again))
  private accepting = new Set<Program.Node>();
  accepts(s: string, type: Program.Node): boolean {
    const check = this.typed?.check;
    if (!check || this.accepting.has(type)) return false;
    this.accepting.add(type);
    try { return this.accepting_now(s, type, check); } finally { this.accepting.delete(type); }
  }
  private accepting_now(s: string, type: Program.Node, check: NonNullable<NonNullable<Program['typed']>['check']>): boolean {
    const value = this.body(s, { node: this.global });
    let known = this.accepted.get(type);
    if (!known) this.accepted.set(type, known = { objects: new WeakMap(), values: new Map() });
    const kept = typeof value === 'object' && value !== null ? known.objects : known.values, had = kept.get(value as object);
    if (had !== undefined) return had;
    kept.set(value as object, false);
    const { open, close } = this.grammar!;
    const code = check.code.split(open + check.value + close).join(s).split(open + check.type + close).join(this.written(this.type_values.get(type) ?? type));
    let taken = false;
    try { taken = this.run(code, { node: check.home }) !== undefined; } catch (e) { if (e instanceof Exhausted) throw e; taken = false; }
    kept.set(value as object, taken);
    return taken;
  }
  // (whether a head's hole is written inside a pair its literals open, `({x})`: then it goes on past the end of a line, as what is
  // inside the pair does)
  private enclosures = new WeakMap<Program.Rule, boolean[]>();
  enclosed(rule: Program.Rule, k: number): boolean {
    let known = this.enclosures.get(rule);
    if (!known) {
      known = []; let depth = 0;
      for (const piece of rule.pieces) { known.push(depth > 0); for (const c of piece.literal ?? '') { const x = c.charCodeAt(0); if (this.opens.has(x)) depth++; else if (this.closes.has(x)) depth--; } }
      this.enclosures.set(rule, known);
    }
    return known[k];
  }
  read_by(rule: Program.Rule, s: string, whole: boolean, rank: number, out: Program.Read[]) {
    const { pieces } = rule, { open, close } = this.grammar!, { opens, closes, quoted } = this, o = open.charCodeAt(0), c = close.charCodeAt(0), n = s.length, spans: number[] = [];
    const last_only = whole && rule.passes, count = out.length;
    // (the body holes taking code not written as a block, on the way to where it is)
    const unbraced = new Set<number>();
    const step = (k: number, t: number): void => { at(k, t); unbraced.delete(k); };
    const at = (k: number, t: number): void => {
      if (k === pieces.length) { if (!whole || t === n) out.push({ at: t, spans: spans.slice(), rule, rank, ...unbraced.size ? { loose: true } : {} }); return; }
      const { literal, hole, body } = pieces[k];
      // (a head ending in a word does not end inside one: `focus` does not read the start of `focused`)
      // (nor does a body bracket in it begin a value written into text)
      if (literal !== undefined) { if (s.startsWith(literal, t) && !(literal.endsWith(open) && s.charCodeAt(t + literal.length) === 0xE000) && !(k === pieces.length - 1 && ((Program.word(literal, literal.length - 1) && Program.word(s, t + literal.length)) || (Program.operator(literal, literal.length - 1) && Program.operator(s, t + literal.length))))) step(k + 1, t + literal.length); return; }
      if (body) {
        // (ending a head with words in it, the rest not one body: the rest, as code)
        // (after words: `static x`, `x with y = 1`; not after another hole, `enum {{names}} {{block}}`)
        const after_words = pieces[k - 1]?.literal !== undefined || (pieces[k - 1]?.hole === '' && pieces[k - 2]?.literal !== undefined);
        if (rule.literals.length && k === pieces.length - 1 && after_words && t < n && !Program.space(s.charCodeAt(t)) && !(s.startsWith(open, t) && Program.closes(s, t, open, close) === n)) {
          spans.push(t, n); step(k + 1, n); spans.length -= 2;
          return;
        }
        // (a body: written code, not a value written as one; not written in brackets, before what follows: as a hole is)
        if (s.startsWith(open, t) && s.charCodeAt(t + open.length) !== 0xE000) {
          const u = Program.closes(s, t, open, close), next = pieces[k + 1];
          if (next && (next.literal !== undefined ? !s.startsWith(next.literal, u) : next.hole === '' && !Program.space(s.charCodeAt(u)))) return;
          spans.push(t + open.length, u - close.length); step(k + 1, u); spans.length -= 2;
          return;
        }
        const following = pieces[k + 1];
        if (!following || (following.literal === undefined && following.hole !== '')) return;
        unbraced.add(k);
      }
      if (hole === '') { let u = t; while (Program.space(s.charCodeAt(u))) u++; if (u > t) step(k + 1, u); return; }
      const next = pieces[k + 1], last = !next, ends: number[] = [], enclosed = this.enclosed(rule, k);
      // (between a quote and the same quote: what is quoted, as written (spaces too))
      const quote = pieces[k - 1]?.literal;
      if (quote !== undefined && quote === next?.literal && this.quotes.has(quote) && pieces[k].type === undefined) {
        const u = Program.quote_end(s, t - 1, quote);
        if (u > t) { spans.push(t, u); step(k + 1, u); spans.length -= 2; }
        return;
      }
      if (t >= n || Program.space(s.charCodeAt(t))) return;
      // (a typed hole: a span its type's own rules read whole; a type that is not a node, none)
      const typed = pieces[k].type === undefined ? undefined : this.type_of(rule, k);
      if (typed === null) return;
      // (what its type's rules can begin with: anything else, not one)
      // (a value given to a level: taken whole, when it is of the type)
      if (typed && this.dispatching === s && s.startsWith(open, t) && s.charCodeAt(t + open.length) === 0xE000) {
        const u = t + this.token;
        if (last ? (!whole || u === n) : next.literal !== undefined ? s.startsWith(next.literal, u) : next.hole === '' ? Program.space(s.charCodeAt(u)) : true)
          if (this.accepts(s.slice(t, u), typed)) { spans.push(t, u); step(k + 1, u); spans.length -= 2; }
        return;
      }
      if (typed) { const firsts = this.firsts_of(typed); if (firsts && !firsts.has(s.charCodeAt(t))) return; }
      // (between a quote and the same quote: up to the next one)
      const before = pieces[k - 1]?.literal;
      if (before !== undefined && before === next?.literal && this.quotes.has(before)) {
        const u = Program.quote_end(s, t - 1, before);
        if (u > t && (!typed || this.structural(s.slice(t, u), typed))) { spans.push(t, u); step(k + 1, u); spans.length -= 2; }
        return;
      }
      // (an operator's operand, `+ {other}`: not past an operator written as one and declared with it or after it (binding as
      // loosely, or looser): `1 + 2 == 3` is `(1 + 2) == 3`, `10 - 2 - 3` is `(10 - 2) - 3`; the rest read on what it gives)
      const looser = last ? this.looser(rule) : undefined;
      for (let u = t, depth = 0; u < n;) {
        const x = s.charCodeAt(u);
        if (looser && !depth && u > t && Program.space(s.charCodeAt(u - 1)) && looser.some(l => s.startsWith(l, u) && Program.space(s.charCodeAt(u + l.length)))) break;
        if (x === o && s.startsWith(open, u)) { depth++; u += open.length; } else if (x === c && s.startsWith(close, u)) { if (--depth < 0) break; u += close.length; }
        else if (opens.has(x)) { depth++; u++; } else if (closes.has(x)) { if (--depth < 0) break; u++; }
        // (what is quoted: as one)
        else if (quoted.has(x)) { const q = Program.quote_end(s, u, s[u]); u = q < 0 ? n : q + 1; }
        else if (x === 10 && !depth && !last && !enclosed) break; else u++;
        if (depth > 0 || Program.space(s.charCodeAt(u - 1)) || (last && whole && u < n)) continue;
        if (last || (next.literal !== undefined ? s.startsWith(next.literal, u) : next.hole !== '' || Program.space(s.charCodeAt(u)))) ends.push(u);
      }
      for (let e = 0; e < ends.length; e++) {
        const u = ends[last_only ? ends.length - 1 - e : e];
        if (typed && !this.structural(s.slice(t, u), typed)) continue;
        spans.push(t, u); step(k + 1, u); spans.length -= 2;
        if (last_only && out.length > count) return;
      }
    };
    step(0, 0);
    // (code is a block: where the rule reads the text with each body a block, not where it does without)
    const mine = out.slice(count);
    if (mine.some(read => read.loose) && mine.some(read => !read.loose)) out.splice(count, out.length - count, ...mine.filter(read => !read.loose));
  }

  // (an operator's rule, `+ {other}` (a sign, then one hole): the signs of those written as it is, in its node or the outermost,
  // declared with it or after it)
  private loosers = new WeakMap<Program.Rule, { n: number, signs?: string[] }>();
  looser(rule: Program.Rule): string[] | undefined {
    const operator = (r: Program.Rule) => { const [sign, space, hole] = r.pieces; return r.pieces.length === 3 && sign.literal !== undefined && /^[^\p{L}\p{N}_\s.()\[\]{}"`,]+$/u.test(sign.literal) && space.hole === '' && !!hole.hole && !hole.body; };
    if (!operator(rule) || !rule.home) return undefined;
    let root = rule.home; while (root.outer) root = root.outer;
    const n = rule.home.rules.length + root.rules.length, known = this.loosers.get(rule);
    if (known && known.n === n) return known.signs;
    const signs = [...new Set([...rule.home.rules, ...(root === rule.home ? [] : root.rules)].filter(r => r.id >= rule.id && operator(r)).map(r => r.pieces[0].literal!))];
    this.loosers.set(rule, { n, signs: signs.length ? signs : undefined });
    return signs.length ? signs : undefined;
  }

  // Code: its statements (a statement a line, the lines indented below it with it, and those while a body in it is open; as
  // indented as its first), and where its
  // labels (`label\`) are among them. Code is split once: kept here when it refers to no value, else by what holds it (a rule).
  private codes = new Map<string, Program.Code>();
  // (how much a line opens: bodies and the pairs learned, `( )`, `[ ]`; what is quoted, nothing)
  joined(statement: string): string {
    const { open, close } = this.grammar!, { opens, closes, quoted } = this, within: string[] = [];
    let out = '';
    for (let i = 0; i < statement.length; i++) {
      const x = statement.charCodeAt(i), c = statement[i];
      if (statement.startsWith(open, i)) { within.push(open); out += open; i += open.length - 1; continue; }
      if (statement.startsWith(close, i)) { within.pop(); out += close; i += close.length - 1; continue; }
      if (opens.has(x)) within.push(c);
      else if (closes.has(x)) within.pop();
      else if (quoted.has(x)) { const q = Program.quote_end(statement, i, c); if (q < 0) return out + statement.slice(i); out += statement.slice(i, q + 1); i = q; continue; }
      else if (c === '\n' && within.length && within[within.length - 1] !== open) {
        let j = i + 1; while (j < statement.length && Program.space(statement.charCodeAt(j))) j++;
        const comment = out.lastIndexOf(' //'); if (comment >= 0 && !out.slice(comment).includes('\n')) out = out.slice(0, comment);
        out = out.trimEnd(); if (!out.endsWith('(') && !out.endsWith('[') && statement[j] !== ')' && statement[j] !== ']') out += ' ';
        i = j - 1; continue;
      }
      out += c;
    }
    return out;
  }
  nesting(line: string): number {
    const { open, close } = this.grammar!, { opens, closes, quoted } = this;
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      const x = line.charCodeAt(i);
      if (line.startsWith(open, i) || opens.has(x)) depth++;
      else if (line.startsWith(close, i) || closes.has(x)) depth--;
      else if (quoted.has(x)) { const q = Program.quote_end(line, i, line[i]); if (q < 0) break; i = q; }
    }
    return depth;
  }
  code(code: string): Program.Code {
    let split = this.codes.get(code);
    if (split) return split;
    const { open, close } = this.grammar!, statements: string[] = [], lines = code.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')), base = Math.min(...lines.map(line => line.length - line.trimStart().length));
    let depth = 0;
    for (const line of lines.map(line => line.slice(base))) {
      if (statements.length && (depth > 0 || Program.space(line.charCodeAt(0)))) statements[statements.length - 1] += '\n' + line; else statements.push(line.trimEnd());
      depth += this.nesting(line);
    }
    // (lines broken inside a bracket that is not a block's, `f(x =>` … `)`: one line there, as where they break means nothing)
    for (let k = 0; k < statements.length; k++) if (statements[k].includes('\n')) statements[k] = this.joined(statements[k]);
    // (a label written with a hole, `{x}\`, is the value the hole is: gone to by `goto` that value)
    const marked = statements.flatMap((statement, k) => /^\S+\\$/.test(statement) ? [k] : []);
    const labels = new Map(marked.filter(k => !statements[k].includes(open)).map(k => [statements[k].slice(0, -1), k]));
    // (the last statement that is not a label: what a call answers)
    let answering = statements.length - 1; while (answering > 0 && marked.includes(answering)) answering--;
    split = { statements, labels, marks: new Set(marked), answering, valued: marked.filter(k => statements[k].includes(open)), templates: new Map(), helds: new Map() };
    if (!code.includes(Program.REFERS)) this.codes.set(code, split);
    return split;
  }

  // Code run: its statements in order, `goto` going to a label among them, else out to where it is found. The value: what the
  // last statement gave.
  run(written: string | Program.Code, frame: Program.Frame, except?: Program.Rule, answers = false): unknown {
    const code = typeof written === 'string' ? this.code(written) : written, { statements, labels } = code;
    if (labels.size) this.scopes.push(labels);
    // (its labels named before it runs (not a rule's right side's): see `labelled`)
    if (labels.size && !except) for (const [name, k] of labels) this.labelled(name, code, k, frame);
    if (this.depth++ === 0) this.statements++;
    let value: unknown;
    try {
      // (a right side that begins by going on: the reader has already gone on past every reading it would)
      for (let k = except?.passes && code === except.code ? 1 : 0; k < statements.length; k++) {
        const statement = statements[k];
        if (statement.endsWith('\\') && code.marks.has(k)) continue;
        if (!statement.startsWith('goto ')) {
          // (while a rule checks its typed holes, it reads nothing)
          const checks = except?.checked && code === except.code && k >= except.checked[0] && k < except.checked[1];
          if (checks) this.checking.add(except!);
          try { value = answers && k === code.answering ? this.valued(statement, frame, except, code) : this.evaluate(statement, frame, except, true, code); }
          catch (jump) { if (!(jump instanceof Program.Place) || jump.labels !== labels) throw jump; if (jump.at < k) frame.reading?.values.clear(); k = jump.at; if (jump.carries) value = jump.value; }
          finally { if (checks) this.checking.delete(except!); }
          continue;
        }
        // (a label's name: one in scope, else one the host holds; else what the target reads as)
        const target = statement.slice('goto '.length), place = target === '.' ? undefined : this.place(target);
        const to = target === '.' ? frame.reading ?? frame.writer : place ?? (this.outside.has(target) ? target : this.evaluate(target, frame, except, true, code));
        if (to instanceof Program.Reading) { const next = to.next(); if (next) throw new Program.Again(next); throw new Program.Again(undefined, to.all); }
        if (!(to instanceof Program.Place)) {
          // (a value: the label written as it, else one the host holds, else nothing)
          const { reading } = frame, at = to === undefined || !reading ? undefined : code.valued.find(at => {
            const hole = this.alone(statements[at].slice(0, -1), code);
            return hole !== undefined && hole in reading.caps && this.held_value(this.shared(reading, hole)) === to;
          });
          if (at !== undefined) { if (at < k) frame.reading?.values.clear(); k = at; }
          // (one the host holds: what it answers, the code's answer, the code done; `js` nothing: on past its line)
          else if (typeof to === 'string') {
            // (one that goes to a label of this code (`$('goto x')` in JS): there)
            let answer: unknown;
            try { answer = this.outside.get(to)?.(frame, statements[k + 1], { statements: statements.slice(k + 1), except }); }
            catch (jump) { if (!(jump instanceof Program.Place) || jump.labels !== labels) throw jump; if (jump.at < k) frame.reading?.values.clear(); k = jump.at; continue; }
            if (answer !== undefined) { value = answer; break; }
            if (this.consuming.has(to)) k++;
          }
          continue;
        }
        // (gone to out of this code: it carries what this code gave so far)
        if (to.labels !== labels) { to.carries = true; to.value = value; throw to; }
        if (to.at < k) frame.reading?.values.clear();
        k = to.at;
      }
    } finally { if (labels.size) this.scopes.pop(); if (--this.depth === 0) this.done_reading(); }
    return value;
  }
  // (a body hole's code as a closure: once for the reading)
  private codes_of = new WeakMap<Program.Reading, Map<string, unknown>>();
  code_of(reading: Program.Reading, name: string): unknown {
    let made = this.codes_of.get(reading);
    if (!made) this.codes_of.set(reading, made = new Map());
    if (made.has(name)) return made.get(name);
    const pair = [...this.paired_by.keys()][0], code = reading.caps[name];
    const closure = this.valued(pair + this.closers.get(pair) + ' ' + this.grammar!.definer + '\n' + Program.indented(code, '  '), { node: reading.site, this: reading.self, writer: reading.from });
    made.set(name, closure);
    return closure;
  }
  // (a label in code that is not a rule's right side, a word: that name, where it is read, a closure of the statement that follows
  // it: `Index\` read as `Index` runs from there)
  labelled(name: string, code: Program.Code, k: number, frame: Program.Frame) {
    const node = frame.into ?? frame.node, pair = [...this.paired_by.keys()][0];
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) || !pair || node.has(name)) return;
    const following = code.statements.slice(k + 1, k + 2).filter((_, i) => !code.marks.has(k + 1 + i));
    if (!following.length) return;
    const closure = this.valued(pair + this.closers.get(pair) + ' ' + this.grammar!.definer + '\n' + Program.indented(following.join('\n'), '  '), { node, this: frame.this });
    if (!(closure instanceof Program.Node)) return;
    const rule = this.rule(name, this.written(closure)); rule.holds = [closure]; this.kept(closure);
    rule.home = node; node.define(rule, true);
  }
  // (whether a rule's right side writes a name itself, not as a hole (`{name}`): the hole's name read as what it took)
  private written_names = new WeakMap<Program.Rule, Set<string>>();
  writes(rule: Program.Rule, name: string): boolean {
    let names = this.written_names.get(rule);
    if (!names) { const { open, close } = this.grammar!; this.written_names.set(rule, names = new Set(rule.body.replace(new RegExp(`${Program.escaped(open)}[^${Program.escaped(open + close)}]*${Program.escaped(close)}`, 'g'), ' ').match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])); }
    return names.has(name);
  }
  // (a rule's holes, each a rule reading its name: what it took where it is read)
  private captured = new WeakMap<Program.Rule, Program.Rule[]>();
  private provenance = new WeakMap<Program.Reading, Program.Reading | null>();
  written_in(writer: Program.Reading): Program.Reading | undefined {
    let found = this.provenance.get(writer);
    if (found === undefined) {
      found = null;
      const text = (writer as unknown as { text: string }).text.trim();
      if (text && !text.includes(Program.REFERS)) for (let w = writer.from, n = 0; w && n < 32; w = w.from, n++) if (w.rule.body.includes(text)) { found = w; break; }
      this.provenance.set(writer, found);
    }
    return found ?? undefined;
  }
  captures(rule: Program.Rule): Program.Rule[] {
    let captures = this.captured.get(rule);
    if (!captures) this.captured.set(rule, captures = rule.holes.map(hole => Object.assign(this.rule(hole, ''), { id: ++Program.Node.defined, capture: hole })));
    return captures;
  }
  // The programs running: one for each rewrite (a rule applied; a block; the outermost), each knowing the one it was read in
  // (`below`); its node made when `&` is read in it, with `caller` (read on it alone) that one's. `dynamic`: those made, in the
  // order they run in.
  // made, outermost first.
  private programs: Program.Running[] = [{ at: 0 }]; private dynamic: Program.Node[] = [];
  private ats = new WeakMap<Program.Node, number>();
  program(top = this.programs[this.programs.length - 1]): Program.Node {
    if (top.node) return top.node;
    let root = this.global!; while (root.outer) root = root.outer;
    const node = top.node = new Program.Node(root);
    this.ats.set(node, top.at);
    // (in the order they run in)
    let i = this.dynamic.length; while (i > 0 && this.ats.get(this.dynamic[i - 1])! > top.at) i--;
    this.dynamic.splice(i, 0, node);
    // (`caller`: `&` read where it was read)
    if (top.below) {
      const held = new Program.Held('&', root); held.program = top.below;
      const rule = this.rule('caller', this.written(held)); rule.own = true; rule.holds = [held];
      rule.home = node; node.define(rule, true);
    }
    return node;
  }
  begun(): Program.Running { const below = this.programs[this.programs.length - 1], running = { at: this.programs.length, below }; this.programs.push(running); return running; }
  ended() {
    const { node } = this.programs.pop()!;
    if (node) this.dynamic.splice(this.dynamic.lastIndexOf(node), 1);
  }
  // (what is read alike reads the same only under the same programs, with the same rules)
  private program_ids = new WeakMap<Program.Node, number>(); private programs_made = 0;
  running_programs(): string {
    if (!this.dynamic.length) return '';
    let key = '\u0003';
    for (const node of this.dynamic) { let id = this.program_ids.get(node); if (id === undefined) this.program_ids.set(node, id = ++this.programs_made); key += id + ':' + node.headed + ','; }
    return key;
  }
  // The labels the host holds: `goto report` hands it the reading (`.`), and the right side goes on.
  reports: Program.Reading[] = [];
  // (where what is read is in a text being read, when that is asked: see `Painter`)
  painter?: Painter;
  // (the host's own kinds of value: their operators (read where the language says, `goto kinds`), and the rest (after it))
  kinds?: { operators: string, rest: string };
  outside = new Map<string, (frame: Program.Frame, next?: string, rest?: { statements: string[], except?: Program.Rule }) => unknown>([
    ['report', frame => { if (frame.reading) this.reports.push(frame.reading); return undefined; }],
    // (`goto defined`: the next statement a name (or a hole, its text): the lookup's first layer only, the node read in when
    // the name is defined there, else nothing)
    ['defined', (frame, next) => {
      let name = next!.trim();
      const { open, close } = this.grammar!, hole = name.startsWith(open) && name.endsWith(close) ? name.slice(open.length, -close.length) : undefined;
      if (hole !== undefined && frame.reading && hole in frame.reading.caps) name = this.source(frame.reading.caps[hole]).trim();
      const node = frame.into ?? frame.node;
      return node.has(name) ? node : undefined;
    }],
    // (`goto js`: the next statement is JS, what it answers the code's answer: `self` is `.`, each hole its value, `$(text)`
    // the text read here, `$.text(name)` a hole's text. Only for the host's own kinds of value (`js3.kinds.ray`): what the library will write itself.)
    // (`goto declaring`: the next statement is a head; a statement a rule with it reads first declares (as one with the
    // definer does): read once, for a class)
    ['declaring', (frame, next) => { this.declaring.add(this.head(next!.trim()).head); return undefined; }],
    // (`goto independent`: the same, for a statement never read again in an instance)
    ['independent', (frame, next) => { this.independent.add(this.head(next!.trim()).head); return undefined; }],
    // (`goto afterwards`: the rest of the code run after everything is read, where it is now, when the host defers it (reading
    // abstractly: tests); else now)
    ['afterwards', (frame, next, rest) => {
      if (!this.deferring) return undefined;
      this.deferred.push({ code: rest!.statements.join('\n'), frame, except: rest!.except, written: frame.reading?.text });
      return null;
    }],
    // (`goto instanced`: the next statement is a hole holding code, `{code}`; each of its statements that does not declare,
    // read in `.` (an instance: its class's block again, what is not the class's))
    ['instanced', (frame, next) => {
      const { open, close } = this.grammar!, name = next!.trim().slice(open.length, -close.length), reading = frame.reading!;
      const target = frame.this ?? frame.node;
      if (!(target instanceof Program.Node)) return undefined;
      const code = this.source(reading.caps[name]);
      for (const statement of this.code(code).statements) {
        const s = statement.trim();
        if (!s || this.defining(s)) continue;
        const all = this.readings(s, this.candidates(s, target, 0), true);
        if (all.length && this.declaring.has(all[all.length - 1].rule.head)) continue;
        if (all.length && this.independent.has(all[all.length - 1].rule.head)) continue;
        this.run(s, { node: target, this: target });
      }
      return target;
    }],
    // (`goto styled`: the next statement names a style (or a hole, its text); the rule defined last is shown in it)
    ['styled', (frame, next) => {
      let style = next!.trim();
      const { open, close } = this.grammar!, hole = style.startsWith(open) && style.endsWith(close) ? style.slice(open.length, -close.length) : undefined;
      if (hole !== undefined && frame.reading && hole in frame.reading.caps) style = this.source(frame.reading.caps[hole]).trim();
      if (Program.Node.last) { Program.Node.last.style = style; for (const literal of Program.Node.last.literals) { const l = literal.trim(), word = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(l), sign = /^[^\p{L}\p{N}_\s]+$/u.test(l);
        // (a word shown as a word is (a keyword, a name), a sign as a sign is (an operator, punctuation); what a rule is given by default, only when nothing else said)
        if (!l || !(word || sign) || (word !== ['keyword', 'function', 'variable', 'class', 'property', 'type', 'parameter', 'method'].includes(style)) || (style === 'function' && this.literal_styles.has(l)) || (/^[()\[\]{},]+$/.test(l) && style !== 'punctuation')) continue;
        this.literal_styles.set(l, style); } }
      return undefined;
    }],
    // (`goto here`: the node the code is read in (past nodes that hold nothing, made for a rewrite))
    ['here', frame => { let node = frame.node; while (node.outer && !node.rules.length && !node.includes.length) node = node.outer; return node; }],
    // (`goto kinds`: what the host's own kinds of value answer (their operators) read here)
    ['kinds', frame => { if (this.kinds) this.run(this.kinds.operators, { node: frame.into ?? frame.node }); return undefined; }],
    ['js', (frame, next) => {
      // (only the holes the code names are read: the others are code it leaves to what follows it (`{yes}`, `{no}`), read only there)
      const { reading } = frame, names = reading ? reading.rule.holes.filter(name => new RegExp(`(^|[^\\w$])${name.replace(/[^\w$]/g, '\\$&')}($|[^\\w$])`).test(next!)) : [];
      const key = names.join(',') + '\n' + next!;
      let compiled = this.compiled.get(key);
      if (!compiled) this.compiled.set(key, compiled = new Function('self', '$', ...names, `return (${next});`) as (...args: unknown[]) => unknown);
      const $ = Object.assign((text: string) => this.read(text, frame), { text: (name: string) => this.source(reading!.caps[name]) });
      return compiled(frame.this ?? frame.node, $, ...names.map(name => this.held_value(this.shared(reading!, name))));
    }],
  ]);
  // (each literal of a rule with a style, the style: what a piece of text written so is shown as when nothing reads it)
  literal_styles = new Map<string, string>();
  // (the labels the host holds that take the statement after them)
  consuming = new Set(['js', 'defined', 'declaring', 'independent', 'instanced', 'styled']);
  private compiled = new Map<string, (...args: unknown[]) => unknown>();
  declaring = new Set<string>(); independent = new Set<string>();
  // (what runs after everything is read, while the host defers it: see `afterwards`)
  deferring = true; deferred: { code: string, frame: Program.Frame, except?: Program.Rule, file?: string, written?: string }[] = [];
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
    // (a value as a statement of its own in a block: given to the node it is read in)
    if (!written || !reading) { const t = statement.trim(); return this.read(t, t.length === this.token && !frame.on ? { ...frame, given: true } : frame, except); }
    // (a body hole on its own is run, as the code it is, each time; any other hole on its own is read: once)
    const alone = this.alone(statement, code);
    if (alone !== undefined && alone in reading.caps)
      // (code read in a value: what it does not find there, found where it was written)
      // (and its writer the reading whose code it was written in)
      return reading.rule.bodies.has(alone) ? this.run(reading.caps[alone], { node: reading.receiver, this: frame.this ?? reading.self, into: frame.into, also: reading.site !== frame.node ? reading.site : undefined, writer: reading.from }) : this.held_value(this.shared(reading, alone));
    let text = this.substituted(statement, reading, reading.site, code).trim();
    // (a definition's head is read as written: the code its holes took, so the rules reading a head (a style after it) see it)
    if (text.includes(Program.REFERS) && this.defining(text)) {
      // (a head put together from several holes, as the modifiers' `{operator} {rest} => {body}`, is the code they took as written, read as a whole; a head with words of its own, or one hole (a name), keeps its holes)
      const nl = text.indexOf('\n'), line = nl < 0 ? text : text.slice(0, nl), at = this.outermost_at(line), head = at < 0 ? '' : line.slice(0, at);
      const each = new RegExp(`${Program.escaped(this.grammar!.open)}${Program.REFERS}[0-9a-z]{6}${Program.escaped(this.grammar!.close)}`, 'g');
      if (head && (head.match(each)?.length ?? 0) > 1 && !head.replace(each, '').trim()) text = this.source(line, true) + (nl < 0 ? '' : text.slice(nl));
    }
    return this.read(text, frame, except, this.alike);
  }
  // (a statement read where a value is wanted: a rule on one line is a node holding it, one whose rules each run in a new node
  // where it is)
  valued(statement: string, frame: Program.Frame, except?: Program.Rule, code?: Program.Code, written = !!frame.reading): unknown {
    if (!this.defining(statement)) return this.evaluate(statement, frame, except, written, code);
    // (one whose head is a word, `x => …`: a closure of that one parameter, as `(x) => …` (the first pair learned) is)
    // (its right side on the lines below too, `xs.map(x =>` … `)`)
    const word = /^[\p{L}_][\p{L}\p{N}_]*(?= =>(?: |\n))/u.exec(statement), pair = [...this.paired_by.keys()][0];
    if (word && pair) statement = pair + word[0] + this.closers.get(pair) + statement.slice(word[0].length);
    const node = new Program.Node(frame.site ?? frame.node);
    node.calls = true; node.self = frame.this ?? frame.node;
    const value = this.evaluate(statement, { ...frame, node, into: undefined }, except, written, code);
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
    // (read on in a value, a hole it begins with is what follows the `.`: read in the value first (`x.a ?? b`: `a` is x's))
    const also = reading.rule.home?.calls || reading.site === reading.receiver ? undefined : reading.receiver;
    // (a typed hole: what it took read in its type, then where it was written)
    const k = reading.rule.pieces.findIndex(piece => piece.hole === name), typed = k >= 0 && reading.rule.pieces[k].type !== undefined ? this.type_of(reading.rule, k) : undefined;
    if (!held && typed) { reading.values.set(name, held = new Program.Held(reading.caps[name], typed, reading.site, reading.self)); held.typed = true; }
    if (!held) reading.values.set(name, held = also && reading.leading === name
      ? new Program.Held(reading.caps[name], also, reading.site, reading.self) : new Program.Held(reading.caps[name], reading.site, also ?? reading.also, reading.self));
    // (a call's arguments are code inlined into it: what they define is the call's)
    if (held.into === undefined) held.into = reading.into;
    // (read in the program its text was written in: the one the rule was read in)
    held.program ??= reading.program; held.from ??= reading.from;
    return held;
  }
  // (read where a value is wanted, a rule written on one line is a node holding it: one whose rules each run in a new node in
  // it)
  held_value(held: Program.Held, except?: Program.Rule): unknown {
    if (held.read) return held.value;
    held.read = true;
    // (in the program its text was written in)
    if (held.program) this.programs.push(held.program);
    // (a value written into text: that value)
    const { open } = this.grammar!, t = held.text.trim();
    if (t.length === this.token && t.charCodeAt(open.length) === 0xE000) { try { return held.value = this.body(t, { node: held.node }, except); } finally { if (held.program) this.programs.pop(); } }
    // (read as the code it was written in: `.x` there, its capture)
    try { return held.value = this.valued(held.text, { node: held.node, also: held.site, this: held.self, into: held.into, writer: held.typed ? undefined : held.from }, except, undefined, false); }
    finally { if (held.program) this.programs.pop(); }
  }
  // (a definition: its first line ends with the definer, or has one outside every bracket and quote)
  defining(s: string): boolean {
    const line = s.indexOf('\n');
    return this.defines(s) || this.outermost(line < 0 ? s : s.slice(0, line));
  }

  private definitions = new Map<string, number>();
  // (the definer outside every bracket and quote: binding loosest of all, the line is a definition)
  outermost(s: string): boolean { return this.outermost_at(s) >= 0; }
  outermost_at(s: string, last = false): number {
    let found = -1;
    const { open, close, definer } = this.grammar!, { opens, closes, quoted } = this;
    for (let i = 0, depth = 0; i < s.length; i++) {
      const x = s.charCodeAt(i);
      if (s.startsWith(open, i) || opens.has(x)) depth++;
      else if (s.startsWith(close, i) || closes.has(x)) depth--;
      else if (quoted.has(x)) { const q = Program.quote_end(s, i, s[i]); if (q < 0) return -1; i = q; }
      else if (!depth && s.startsWith(definer, i) && (Program.space(s.charCodeAt(i - 1)) || i === 0) && (i + definer.length === s.length || Program.space(s.charCodeAt(i + definer.length)))) { if (!last) return i; found = i; }
    }
    return found;
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
  // (a reference written where a name goes, to a value that is text (read): that text, `x[k] := v` defining `k`'s text)
  named(text: string): string {
    if (!text.includes(Program.REFERS)) return text;
    const { open, close } = this.grammar!;
    this.referring_text ??= new RegExp(`${Program.escaped(open)}${Program.REFERS}([0-9a-z]{6})${Program.escaped(close)}`, 'g');
    return text.replace(this.referring_text, (whole, id) => this.text_of(parseInt(id, 36)) ?? whole);
  }
  text_of(id: number): string | undefined {
    const { open, close } = this.grammar!;
    let value = this.referred_to(id);
    for (let i = 0; i < 32 && value instanceof Program.Held; i++) {
      if (value.read) { value = value.value; break; }
      const t = value.text.trim();
      if (t.length !== this.token || t.charCodeAt(open.length) !== 0xE000) return undefined;
      value = this.referred_to(parseInt(t.slice(open.length + 1, -close.length), 36));
    }
    return typeof value === 'string' ? value : undefined;
  }
  source(text: string, unread = false): string {
    if (!text.includes(Program.REFERS)) return text;
    const { open, close } = this.grammar!;
    this.referring_text ??= new RegExp(`${Program.escaped(open)}${Program.REFERS}([0-9a-z]{6})${Program.escaped(close)}`, 'g');
    return text.replace(this.referring_text, (whole, id, at: number) => {
      const value = this.referred_to(parseInt(id, 36));
      if (!(value instanceof Program.Held) || (unread && value.read)) return whole;
      const written = this.source(value.text, unread), line = text.lastIndexOf('\n', at - 1) + 1, end = text.indexOf('\n', at);
      // (alone on its line: its lines indented as that line)
      if (!written.includes('\n')) return written;
      if (text.slice(line, at).trim() || text.slice(at + whole.length, end < 0 ? text.length : end).trim()) return Program.continued(written, text.slice(line, at));
      return Program.indented(written, '').split('\n').join('\n' + text.slice(line, at));
    });
  }
  static escaped(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // (a statement beginning with a member, `.a == 1 && .b == 2`, that a rule beginning with a hole reads whole, what it takes first more
  // than a member (`{a} && {b}`, `.a == 1`): read by it, not as one member and what follows read on that)
  private operated(s: string, frame: Program.Frame, except?: Program.Rule): boolean {
    if (!s.includes(' ') || frame.on) return false;
    let known = this.operated_memo.get(s);
    if (known === undefined) {
      const all = this.readings(s, this.candidates(s, frame.node, 0, except), true);
      // (the reading it is read by first: the latest rule's, of its readings the one whose holes end nearest)
      let first = all.length - 1; while (first > 0 && all[first - 1].rule === all[first].rule) first--;
      const read = all[first];
      known = !!read && !!read.rule.pieces[0]?.hole && read.spans[0] === 0 && read.spans[1] < s.length && read.rule.literals.length > 0 && s.slice(0, read.spans[1]).trim().includes(' ');
      if (this.operated_memo.size > 100000) this.operated_memo.clear();
      this.operated_memo.set(s, known);
    }
    return known;
  }
  private operated_memo = new Map<string, boolean>();
  private defining_dot(s: string): boolean {
    const line = s.indexOf('\n'), first = line < 0 ? s : s.slice(0, line);
    const ending = first.trimEnd(), { definer } = this.grammar!;
    return (ending.endsWith(definer) && this.outermost_at(ending, true) === ending.length - definer.length) || this.outermost(first);
  }
  // (how many more readings a test may take, when it is limited: past it, it ran too long)
  budget?: number;
  // (when a test must be done by (`performance.now()`), and the heap it may grow by (MB, checked every 1024 readings))
  deadline?: number; limit_ms = 0; heap_from = 0; heap_mb = 512; private counted = 0;
  read(s: string, frame: Program.Frame, except?: Program.Rule, alike?: string): unknown {
    if (this.budget !== undefined && --this.budget < 0) throw new Exhausted('ran too long');
    if (this.deadline !== undefined) {
      if (performance.now() > this.deadline) throw new Exhausted(`ran longer than ${this.limit_ms} ms`);
      if ((++this.counted & 1023) === 0 && process.memoryUsage().heapUsed > this.heap_from + this.heap_mb * 1048576) { this.deadline = 0; throw new Exhausted(`used more than ${this.heap_mb} MB`); }
    }
    const { open, close, definer } = this.grammar!;
    // (a value written alone: itself; as a statement of its own in a node (not the outermost) with rules that have no literal (a
    // level), what those read it as, if any does)
    const alone = s.length === this.token && s.charCodeAt(open.length) === 0xE000;
    if (alone && process.env.LOGALONE) console.log("ALONE", !!frame.given, !!frame.on, frame.this instanceof Program.Node ? (frame.this as any).rules.slice(0,3).map((r: any) => r.head).join(",") : typeof frame.this, frame.this === frame.node, frame.node.bare.length, frame.node.rules.slice(0,3).map(r => r.head).join(","));
    // (a block read in a level (`level reading { value }`) from where it is written: given to `.`, the level)
    if (alone && frame.given && !frame.on && frame.this instanceof Program.Node && frame.this !== frame.node && !frame.node.bare.length && frame.this.bare.length && frame.this.outer && !frame.this.calls)
      return this.read(s, { ...frame, node: frame.this }, except, alike);
    // (a node given as a statement of its own to a node that is not a level (`x &+= node`, `code including level`): its rules seen
    // in it, as its own (a closure's: in each call of it))
    if (alone && frame.given && !frame.on && (frame.node.calls || this.dynamic.includes(frame.node) || !frame.node.bare.length)) {
      const value = this.body(s, frame, except);
      // (a running program is not a level: `&.caller` is that program)
      // (one with no rules yet, given to a node that is neither a call nor a program (where it is an answer, `true`): its rules
      // when it has them, `x &+= { written_in }` before what is written there is read)
      if (!(value instanceof Program.Node) || value === frame.node || this.ats.has(value) || (!value.rules.length && (frame.node.calls || this.dynamic.includes(frame.node) || !value.outer))) return value;
      if (process.env.LOGINC) console.log('INCLUDE', value.rules.slice(0, 4).map(r => r.head).join(','), '<-', String(this.source(frame.reading?.text ?? frame.writer?.text ?? '')).slice(0, 80));
      if (!frame.node.includes.includes(value)) frame.node.includes.push(value), frame.node.headed++;
      return frame.node;
    }
    if (alone && (!frame.given || frame.on || !frame.node.bare.length || !frame.node.outer)) return this.body(s, frame, except);
    // (a body: a block; read on a value, what the value's rules read it as first (`x{ … }`))
    const braced = !alone && s.startsWith(open) && Program.closes(s, 0, open, close) === s.length;
    if (braced && !frame.on) return this.body(s, frame, except);
    if (s === '.') return frame.this ?? frame.node;
    // (`&`: the program running: a node everything run in it sees, gone when the scope it is of ends)
    if (s === '&') return this.program();
    // (a hole's name, read in its rule's right side: a rule reading it, what it took)
    const writer = frame.on ? undefined : frame.reading ?? frame.writer;
    // (a member, `.name`: `name` read in `.`; not a definition written so, `.{name} => …`: a rule reading members)
    if (!frame.dotted && s.charCodeAt(0) === 46 && !Program.space(s.charCodeAt(1)) && s.charCodeAt(1) !== 46 && !this.defining_dot(s) && !this.operated(s, frame, except)) {
      // (a member named by a value that is text: that name)
      if (s.length === this.token + 1 && s.charCodeAt(open.length + 1) === 0xE000) { const name = this.text_of(parseInt(s.slice(open.length + 2, -close.length), 36)); if (name !== undefined) s = '.' + name; }
      // (a capture of the reading: its text, as written)
      if (!frame.on && writer && s.slice(1) in writer.caps) return this.source(writer.caps[s.slice(1)]);
      // (read on in a value, it is `name` read in the value; else in `.`)
      // (where the text was written: read on in a value, where it was before; else here (what `site` holds here then is only
      // where else to look))
      const self = frame.on ? frame.node : 'receiver' in frame ? frame.receiver : frame.this ?? frame.node, written = frame.on ? frame.site ?? frame.node : frame.node;
      // (a value that is not a node (text) has no names of its own: its names are the outermost node's (Node's), `.` the value)
      // (and what it is made of has (`of`, as the host's kinds say: `Number`'s own `gcd (other)`), when they do not read it)
      if (!(self instanceof Program.Node)) {
        let root = frame.node; while (root.outer) root = root.outer;
        const name = s.slice(1), named = this.read(name, { node: root, from: self, this: self, writer: frame.reading ?? frame.writer });
        if (!(typeof named === 'string' && named === this.source(name))) return named;
        const kind = this.read('of.interior', { node: root, from: self, this: self });
        return kind instanceof Program.Node ? this.read(name, { node: kind, site: written, from: self, this: frame.this, on: true, writer: frame.reading ?? frame.writer }) : named;
      }
      // (a name it does not have: what its own rule for any member, `.{x} =>`, makes of it (None's: None), not what is named
      // where the text was written)
      const any = !!self.outer && self.rules.some(rule => rule.home === self && rule.pieces.length === 2 && rule.pieces[0].literal === '.' && rule.pieces[1].hole);
      const name = s.slice(1), member = this.read(name, { node: self, site: self === written || any ? undefined : written, this: frame.this, from: self, on: true, writer: frame.reading ?? frame.writer });
      if (member !== name || !any) return member;
      return this.read(s, { node: self, this: frame.this, from: self, on: true, dotted: true, writer: frame.reading ?? frame.writer });
    }
    if (s.startsWith('goto ')) return this.run(s, frame, except);
    // (a definition, its first line ending with the definer, is read only by a rule whose head has the definer)
    let defines = this.definitions.get(s);
    if (defines === undefined) {
      const line = s.indexOf('\n'), first = line < 0 ? s : s.slice(0, line);
      if (this.definitions.size > 100000) this.definitions.clear();
      // (the definer ending it outside every bracket: `xs.map(x =>` going on below is a closure in an argument, not a definition)
      const ending = first.trimEnd();
      this.definitions.set(s, defines = ending.endsWith(definer) && this.outermost_at(ending, true) === ending.length - definer.length ? 1 : this.outermost(first) ? 2 : 0);
    }
    // (the rules' readings of all of it; else a body it begins with; else every reading: found once for text read alike, in
    // a node that sees the same heads)
    // (kept in the nearest node out that has a rule that may read it: a new node with none reads it as the one it is in)
    let kept = frame.node;
    if (!(frame.on && kept.calls)) while (kept.outer && !this.offers(kept, s, defines, except)) kept = kept.outer;
    const below = frame.site ?? frame.also, memo = this.memo(kept, below), read_alike = alike ?? Program.alike(s);
    const key = (except ? read_alike + '\u0001' + except.id : read_alike) + (frame.on ? frame.node.calls ? '\u0002' : '\u0006' : '') + this.running_programs() + (writer?.rule.holes.length ? '\u0004' + writer.rule.id : '') + (this.checking.size ? '\u0005' + [...this.checking].map(rule => rule.id).join(',') : '');
    let found = alone ? undefined : memo.get(key);
    if (braced && found && !found.whole) return this.body(s, frame, except);
    if (!found) {
      // (a value written alone: only the node's own rules with no literal)
      const candidates = alone ? frame.node.bare.filter(rule => rule !== except && !rule.capture).map(rule => ({ rule, rank: rule.id })) : this.candidates(s, frame.node, defines, except, below, frame.on, writer);
      // (a value given to a level: the first of its rules, in the order written, that takes it)
      let all: Program.Read[] = [], leads = 0;
      if (alone) { const was = this.dispatching; this.dispatching = s; try { for (const candidate of candidates) if ((all = this.readings(s, [candidate], true)).length) break; } finally { this.dispatching = was; } }
      else all = this.readings(s, candidates, true);
      // (a definition: its head ends at the definer ending its first line, no hole going past it; a modifier's takes the rest)
      if (defines && all.length) {
        // (one written on a line, its definer the first outside every bracket)
        // (its head ends at the definer ending its first line, when that is outside every bracket; else at the first one outside them)
        const line = s.indexOf('\n'), first_line = (line < 0 ? s : s.slice(0, line)).trimEnd(), last = this.outermost_at(first_line, true);
        const at = last >= 0 && last + definer.length === first_line.length ? last : this.outermost_at(first_line), end = at >= 0 ? at + definer.length : first_line.length, start = end - definer.length;
        // (a modifier's: the definition its body takes, a head before the definer in it)
        all = all.filter(read => { if (read.rule.modifies) { const from = read.spans[read.spans.length - 2]; return from < start && !!s.slice(from, start).trim(); } for (let i = 0; i < read.spans.length; i += 2) if (read.spans[i] < end && read.spans[i + 1] > start) return false; return true; });
      }
      // (a body it begins with: a block, read on in (on a value, what its rules read first))
      if (!all.length && !defines && s.startsWith(open) && !(frame.on && this.readings(s, candidates, false).length)) leads = Program.closes(s, 0, open, close);
      // (`.` and then what is read on in it: `. is x`)
      else if (!all.length && !defines && s.charCodeAt(0) === 46 && Program.space(s.charCodeAt(1))) leads = -1;
      // (`&` and then what is read on in it: `& &+= { … }`, `&.caller`)
      else if (!all.length && !defines && s.charCodeAt(0) === 38 && (Program.space(s.charCodeAt(1)) || s.charCodeAt(1) === 46)) leads = -2;
      const whole = all.length > 0;
      if ((alone || braced) && !whole) return this.body(s, frame, except);
      if (!all.length && !leads) all = this.readings(s, candidates, false);
      found = { all, leads, whole };
      if (!alone) memo.set(key, found);
    }
    let { all } = found; const { leads } = found;
    // (a typed hole's rule running: not read again (its readings kept for the text as they were found))
    if (this.running.length && all.some(read => !read.rule.literals.length && read.rule.types.length && this.running.includes(read.rule))) all = all.filter(read => !(!read.rule.literals.length && read.rule.types.length && this.running.includes(read.rule)));
    if (leads === -2) return this.on(this.program(), s.slice(1), frame, except);
    if (leads < 0) return this.on(frame.this ?? frame.node, s.slice(1), frame, except);
    if (leads) return this.on(this.body(s.slice(0, leads), frame), s.slice(leads), frame, except);
    if (all.length) {
      let reading = new Program.Reading(all, 0, s, frame.node, frame.site ?? frame.node, frame.this ?? frame.node, true), value: unknown;
      // (where else what its holes read is looked for: where its text was written, when it is read in another node)
      reading.also = frame.also;
      // (the lowest reading tried: going on past all those above, the next is below it)
      let lowest = reading.position;
      reading.from = frame.reading ?? frame.writer;
      this.painter?.locate(reading);
      if (reading.rule.capture !== undefined) {
        // (a body hole's: the code it took, a closure (made where it was written), not run)
        const owner = this.captures(writer!.rule).includes(reading.rule) ? writer! : this.written_in(writer!)!;
        const value = owner.rule.bodies.has(reading.rule.capture) ? this.code_of(owner, reading.rule.capture) : this.held_value(this.shared(owner, reading.rule.capture));
        return reading.at === s.length ? value : this.on(value, reading.after, frame, except);
      }
      // (a rule a node holding it calls runs in a new node where that node is (`.` in it), its last statement read where a
      // value is wanted: what the call answers; or the new node, when it gives nothing)
      // (a rule with no literal in its head reading text in its node (a level's `{x: T} => …`): its right side read where that
      // node is, so it does not read what is in it)
      const { home } = reading.rule, calls = !!home?.calls, outside = !calls && !frame.on && frame.node === home && !!home?.outer && !reading.rule.literals.length;
      // (`.` in its right side: in a call, what the closure was read from (else where it was written); read on in a value (a
      // method), the value; else as it was)
      const self = home?.calls ? frame.from ?? this.through(frame.this, home.outer) ?? this.kind_through(frame.this, home.outer) ?? home.self ?? home.outer! : outside ? home!.outer! : frame.on ? ('receiver' in frame ? frame.receiver : frame.node) : 'receiver' in frame ? frame.receiver : frame.this ?? frame.node;
      // (a method called on what was made in its class, `x.m(…)`, runs in it: what it reads, its own first, then the class's)
      // (a named method (no holes) read on a value: in a node of its own in the value, so what it defines is not the value's)
      // (a call (`(…) =>`) of a node that is not a closure: in a node of its own in it, as a closure's call is)
      const node = calls ? new Program.Node(this.through(self, home!.outer) ?? home!.outer) : outside ? home!.outer! : (frame.on && !reading.rule.holes.length) || reading.rule.called ? new Program.Node(frame.node) : frame.node;
      if (calls && home!.includes.length) node.includes = home!.includes;
      // (a rewrite: a program of its own, read in the one running)
      reading.program = this.programs[this.programs.length - 1]; this.begun();
      try { for (;;) {
        this.running.push(reading.rule);
        reading.into = home?.calls ? node : frame.into;
        try { value = this.run(reading.rule.code, { reading, node, this: self, into: home?.calls ? undefined : frame.into, from: !home?.calls && frame.on && frame.node.calls ? frame.from : undefined }, reading.rule, calls); break; }
        catch (again) {
          if (!(again instanceof Program.Again) || (again.reading ? again.reading.all : again.all) !== all) throw again;
          // (none left reading all of it: those reading less of it)
          // (each in turn, the furthest first)
          if (!again.reading) {
            // (the ones below it (rules defined before), then those reading less of it)
            let at = lowest - 1;
            if (at < 0) {
              if (!found.whole || all === found.shorter) return undefined;
              at = (found.shorter ??= this.readings(s, this.candidates(s, frame.node, defines, except, below, frame.on, writer), false).filter(read => read.at < s.length)).length - 1;
              if (at < 0) return undefined;
              all = found.shorter;
            }
            again.reading = new Program.Reading(all, at, s, frame.node, frame.site ?? frame.node, frame.this ?? frame.node, false, true);
          }
          again.reading.program = reading.program; again.reading.from = reading.from; again.reading.also = reading.also; reading = again.reading;
          if (!again.all && reading.all === all) lowest = Math.min(lowest, reading.position); else lowest = reading.position;
        }
        finally { this.running.pop(); }
      } } finally { this.ended(); }
      if (value === undefined && calls) value = node;
      this.painter?.paint(reading);
      // (a method read on a value answers what it gave; nothing, nothing)
      return reading.at === s.length ? value : this.on(value, reading.after, frame, except);
    }
    // (a rule: the first line ending with the definer)
    if (defines) {
      // (made by a rule creator's right side: as written, its holes not read yet their text)
      const made = except?.defines && s.includes(Program.REFERS) ? this.source(s, true) : s, at = made.indexOf('\n');
      const head = this.named(at < 0 ? made : made.slice(0, at)), rule = this.rule(head.trimEnd().slice(0, -definer.length).trim(), at < 0 ? '' : made.slice(at + 1));
      // (a head that is one hole between two literals, each a character: those balance, as a body does)
      // (a head that is one hole, written as two of the holes its right side has with something between them (`{name: type}`):
      // a typed hole, what separates them learned; what a rule with typed holes begins with, those two its hole and type)
      // A later one (`{name ^style}`) is a mark: the hole is `name`, what follows it the right side's (`^`, a method answering
      // what it is on); one written as one of them after a word (`{literal name}`), a prefix: the hole is `name`.
      // (one written as a typed hole again, `{value: type}`, its right side using both: what a typed hole checks a value written
      // into text (a reference) by, taken when that answers something)
      const [only] = rule.pieces, { open: o, close: c } = this.grammar!;
      if (this.compiling && rule.pieces.length === 1 && only.type !== undefined && !this.typed!.check && rule.body.includes(o + only.hole + c) && rule.body.includes(o + only.type + c)) {
        this.typed!.check = { value: only.hole!, type: only.type, code: rule.body, home: frame.into ?? frame.node };
        return undefined;
      }
      if (this.compiling && rule.pieces.length === 1 && rule.pieces[0].hole && !rule.pieces[0].body && rule.pieces[0].type === undefined) {
        const written = rule.pieces[0].hole, used = [...rule.body.matchAll(new RegExp(`${Program.escaped(open)}([^${Program.escaped(open + close)}]+)${Program.escaped(close)}`, 'g'))].map(m => m[1]);
        for (const name of used) for (const type of used) if (name !== type && written.length > name.length + type.length && written.startsWith(name) && written.endsWith(type)) {
          const between = written.slice(name.length, -type.length);
          if (!this.typed) this.typed = { between }; else if (!this.marks.includes(between)) this.marks.push(between);
          return undefined;
        }
        for (const name of used) {
          const before = written.slice(0, -name.length);
          if (written.length > name.length && written.endsWith(name) && Program.space(before.charCodeAt(before.length - 1)) && !/\s/.test(before.trim())) {
            if (!this.prefixes.includes(before)) this.prefixes.push(before);
            return undefined;
          }
        }
      }
      const [a, hole, b] = rule.pieces;
      // (a head that is one hole between a pair learned already, `({args}) =>`, `x[k]`, other than the one that made the pair:
      // a call, read only on what holds it; and one that is the pair alone, `() =>`, other than one made where the pair was)
      const node = frame.into ?? frame.node;
      if (rule.pieces.length === 3 && a.literal?.length === 1 && hole.hole && b.literal?.length === 1 && a.literal !== b.literal && this.opens.has(a.literal.charCodeAt(0)) && this.closes.has(b.literal.charCodeAt(0)))
        rule.called = this.paired_by.get(a.literal) !== rule.head;
      else if (rule.pieces.length === 1 && a.literal?.length === 2 && this.opens.has(a.literal.charCodeAt(0)) && this.closes.has(a.literal.charCodeAt(1)))
        rule.called = this.paired_in.get(a.literal[0]) !== node;
      // (pairs and quotes are the language's: learned from the entrypoint, not from what is written in it (`.{x}?`))
      else if (this.compiling && rule.pieces.length === 3 && a.literal?.length === 1 && hole.hole && b.literal?.length === 1 && a.literal !== b.literal && !this.opens.has(a.literal.charCodeAt(0)))
        this.opens.add(a.literal.charCodeAt(0)), this.closes.add(b.literal.charCodeAt(0)), this.paired_in.set(a.literal, node), this.paired_by.set(a.literal, rule.head), this.closers.set(a.literal, b.literal!), this.paired++;
      else if (this.compiling && rule.pieces.length === 3 && a.literal?.length === 1 && hole.hole && a.literal === b.literal && !this.quotes.has(a.literal))
        this.quotes.add(a.literal), this.quoted.add(a.literal.charCodeAt(0)), this.paired++;
      if (made.includes(Program.REFERS)) rule.holds = this.held_by(made);
      // (a variable, its right side one value: it rewrites the rule of the nearest node that has its head; any other
      // definition is made where it is read)
      let at_node = node;
      // (past a first `goto .`, which a rule creator writes)
      const right = (at < 0 ? '' : made.slice(at + 1).trim()).replace(/^goto \.\s+/, ''), variable = right.length === this.token && right.charCodeAt(open.length) === 0xE000;
      if (variable) for (let at: Program.Node | undefined = node; at; at = at.outer) if (at.has(rule.head)) { at_node = at; break; }
      rule.home = at_node;
      at_node.define(rule, variable);
      return undefined;
    }
    if (process.env.RAY_WHY && !this.deferring && (frame.receiver !== undefined || frame.on) && /^[^\p{L}\p{N}_.\s]/u.test(s)) env.fs.writeSync(2, `UNREAD ${JSON.stringify(s.slice(0, 60))} receiver=${typeof frame.receiver}:${String(frame.receiver).slice(0, 20)} on=${frame.on} from=${frame.reading?.text?.slice?.(0, 50) ?? '-'} rule=${frame.reading?.rule.head.slice(0, 40)}\n`);
    return this.source(s);
  }
  // (what is left after a value read on: in it, when it is a node; it is text already rewritten, its holes not the reading's)
  // (a method called on its own, `b()` in another of the class's: on what `.` is, when that is made in the class)
  through(self: unknown, made?: Program.Node): Program.Node | undefined {
    if (!(self instanceof Program.Node) || !made) return undefined;
    // (made in the class itself (through nodes holding nothing): a method; not a closure made in a call)
    let at: Program.Node | undefined = made;
    while (at && !at.rules.length && at.outer) at = at.outer;
    if (!at || !at.outer) return undefined;
    for (let on: Program.Node | undefined = self; on && on.outer; on = on.outer) if (on === at) return self;
    return undefined;
  }
  // (a value that is not a node (a number): itself, when what it is made of (`of`, as the host's kinds say) is the class)
  kind_through(self: unknown, made?: Program.Node): unknown {
    if (self instanceof Program.Node || self === undefined || self === null || !made) return undefined;
    let at: Program.Node | undefined = made;
    while (at && !at.rules.length && at.outer) at = at.outer;
    let root = made; while (root.outer) root = root.outer;
    const kind = this.read('of.interior', { node: root, from: self, this: self });
    for (let on: Program.Node | undefined = kind instanceof Program.Node ? kind : undefined; on; on = on.outer) if (on === at || on === made) return self;
    return undefined;
  }
  on(value: unknown, after: string, frame: Program.Frame, except?: Program.Rule): unknown {
    const node = value instanceof Program.Reading ? value.receiver : value;
    // (after a closure, what its own rules do not read, not a member (`.x`) nor a call: its argument, `0..<3` as `0..<(3)`)
    const pair = [...this.paired_by.keys()][0], rest = after.trim();
    if (node instanceof Program.Node && node.calls && pair && rest && !rest.startsWith('.') && !rest.startsWith(pair) && !this.readings(rest, this.candidates(rest, node, 0, undefined, undefined, true), false).length) after = pair + rest + this.closers.get(pair);
    // (in a value that is not a node (text): what is read on in it is read here, `.` the value)
    const writer = frame.reading ?? frame.writer;
    // (`.` in a closure called in it: that value, as `x.f()` gives it; reading on a closure calls it: `.` as it was; a member
    // read on one, `.` that closure)
    // (a body after a value that is not a node (`text{c => …}`): read as on the outermost node (Node's), `.` the value)
    if (!(node instanceof Program.Node) && rest.startsWith(this.grammar!.open)) { let root = frame.node; while (root.outer) root = root.outer; return this.evaluate(after, { node: root, from: node, this: node, receiver: node, on: true, writer }, undefined, false); }
    return node instanceof Program.Node ? this.evaluate(after, { node, site: frame.site ?? frame.node, from: node.calls && after.charCodeAt(0) !== 46 ? frame.from : node, this: frame.this, on: true, writer }, undefined, false)
      : this.evaluate(after, { node: frame.node, site: frame.site, also: frame.also, from: node, this: frame.this, receiver: node, writer }, except, false);
  }
  // A body: a value written into text (what it refers to), else a node its statements are read in (a new one each time; any
  // rule reads them).
  body(s: string, frame: Program.Frame, except?: Program.Rule): unknown {
    const { open, close } = this.grammar!;
    if (s.startsWith(open + Program.REFERS)) {
      const value = this.referred_to(parseInt(s.slice(open.length + 1, -close.length), 36));
      // (read as the right side of the rule it is read in: not by that rule (but a closure's call, which may recur))
      return value instanceof Program.Held ? this.held_value(value, except?.home?.calls ? undefined : except) : value;
    }
    // (in it where its text was written)
    const node = new Program.Node(frame.site ?? frame.node);
    // (a block: a program of its own)
    this.begun();
    try { this.run(s.slice(open.length, -close.length), { ...frame, node, site: undefined, into: undefined }); } finally { this.ended(); }
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
  // (a rule's head with its holes' names left out: two heads written alike)
  static shape(rule: Program.Rule): string { return rule.shape ??= rule.pieces.map(({ literal, hole, body }) => literal ?? (body ? '{{}}' : hole ? '{_}' : '{}')).join(''); }
  static alike(s: string): string { return s.includes(Program.REFERS) ? s.replace(Program.REFERENCE, Program.REFERS) : s; }

  // The rules seen from `node` that may read `s`, each with its rank (a node's own after the ones around it, the latest last):
  // one led by a literal found by that literal (one of the starts of `s`), any other by its longest literal (found going once
  // through `s`), when `s` has each of its literals.
  private looked = 0;
  candidates(s: string, node: Program.Node, defines: boolean | number, except?: Program.Rule, site?: Program.Node, on = false, writer?: Program.Reading): Program.Candidate[] {
    const candidates: Program.Candidate[] = [], look = ++this.looked;
    // (a call, only on a value read on: not the text where it is written)
    const take = (rules: Program.Rule[], rank: number, calls = on) => {
      // (a rule with no literal (a typed hole's) does not read again while its right side runs: what it checks read anew is not it)
      for (const rule of rules) if ((calls || !rule.called) && !(!rule.literals.length && rule.types.length && this.running.includes(rule)) && this.may_read(rule, s, defines, except)) candidates.push({ rule, rank: rank + rule.id });
    };
    // (in a rule's right side, its holes' names: above all)
    // (only a name its right side writes (outside a hole): one in text handed to it is the writer's of that text)
    if (writer && !defines) for (const rule of this.captures(writer.rule)) if (s.startsWith(rule.head) && this.writes(writer.rule, rule.head)) candidates.push({ rule, rank: 3e10 + rule.id });
    // (and when the text it read was written in another rule's right side, handed on to it (a record's rest): that one's, below)
    const outer = writer && !defines ? this.written_in(writer) : undefined;
    if (outer) for (const rule of this.captures(outer.rule)) if (s.startsWith(rule.head)) candidates.push({ rule, rank: 2.9e10 + rule.id });
    // (the programs running, the innermost first: above any node's; one written as a rule in scope is, takes its place (just
    // above it): `&`'s `=` binds as `=` does)
    for (let i = this.dynamic.length - 1; i >= 0; i--) {
      const at = this.dynamic[i], rank = (1e3 + i) * 1e7;
      // (its own (`caller`): only read on it, below)
      if (at === node && on) continue;
      // (a level it includes reads its code, not the right sides written in the level)
      for (const from of [at, ...at.includes.filter(level => !(writer && Program.within(writer.rule.home, level)))]) {
        for (const length of from.lengths.get(s[0]) ?? []) { if (length > s.length) break; const rules = from.led.get(s.slice(0, length)); if (rules) take(rules.filter(rule => !rule.own), rank); }
        if (from.bare.length) take(from.bare, rank);
        for (const keyed of from.keys) if (s.includes(keyed.key)) take(keyed.rules, rank);
      }
    }
    const programs = this.dynamic.length ? candidates.length : 0;
    let handed: boolean | undefined;
    // (read on in a value: its rules, then those where the text was written, below them)
    for (let at: Program.Node | undefined = node, below = 0; at || (site && !below && (below = 1, at = site)); at = at.outer) {
      if (below) { if (at!.looked === look) continue; } else at!.looked = look;
      at = at!;
      // (a closure's call: only on what is read on in it)
      if (at.calls && !(on && at === node)) continue;
      const rank = (at.depth - below * 1e3) * 1e7;
      // (the levels it includes: above its own rules, reading what is written in it (not a right side written in the level))
      // (text handed to that right side, not written in it (a default given to `gets`), reads as where it was written)
      for (const level of at.includes) if (!below && !(writer && (handed ??= !writer.rule.body.includes(s.trim())) === false && (Program.within(writer.rule.home, level) || !Program.within(writer.rule.home, at.outer ?? at)))) {
        for (const length of level.lengths.get(s[0]) ?? []) { if (length > s.length) break; const rules = level.led.get(s.slice(0, length)); if (rules) take(rules, rank + 5e6); }
        if (level.bare.length) take(level.bare, rank + 5e6);
        for (const keyed of level.keys) if (s.includes(keyed.key)) take(keyed.rules, rank + 5e6);
      }
      for (const length of at.lengths.get(s[0]) ?? []) { if (length > s.length) break; const rules = at.led.get(s.slice(0, length)); if (rules) take(rules, rank, on && !below); }
      // (a rule with no literal is not a method (but one that is a body, `x{ … }`, read only on its node's values): not read on its
      // node; and it reads a rule's right side only when that rule was written in its node)
      // (and read on a closure, those of where it was written are not its: only its own and the outermost's)
      if (at.bare.length && !(on && node.calls && at !== node && at.outer)) take(on && at === node && !below ? at.bare.filter(rule => rule.braced) : writer && !Program.within(writer.rule.home, at) ? [] : below ? at.bare.filter(rule => !rule.braced) : at.bare, rank, on && !below);
      // (a few keys each looked for; many found going once through `s`)
      if (at.keys.length <= 16) { for (const keyed of at.keys) if (s.includes(keyed.key)) take(keyed.rules, rank); }
      else for (let i = 0; i < s.length; i++) for (const keyed of at.loose.get(s.charCodeAt(i)) ?? [])
        if (keyed.looked !== look && s.startsWith(keyed.key, i)) { keyed.looked = look; take(keyed.rules, rank); }
    }
    for (let d = 0; d < programs; d++) {
      const shape = Program.shape(candidates[d].rule);
      let rank = -Infinity;
      for (let l = programs; l < candidates.length; l++) if (candidates[l].rank > rank && Program.shape(candidates[l].rule) === shape) rank = candidates[l].rank;
      if (rank > -Infinity) candidates[d].rank = rank + 0.5;
    }
    return candidates;
  }
  // (a definition is read by a rule with the definer in its head, or by a modifier (words, then a body hole: the rest, as
  // code); one written by a rule creator's right side (a rule with the definer in its head) is made as written)
  private checking = new Set<Program.Rule>();
  may_read(rule: Program.Rule, s: string, defines: boolean | number, except?: Program.Rule): boolean {
    if (this.checking.size && this.checking.has(rule)) return false;
    if (rule === except || (defines && (!(rule.defines || rule.modifies) || (defines === 1 && except?.defines)))) return false;
    for (const literal of rule.literals) if (!s.includes(literal)) return false;
    // (a head ending in a body, without words: a body written, so its bracket in the text)
    if (rule.braced && !s.includes(this.grammar!.open)) return false;
    return true;
  }
  // (whether a node has a rule of its own that may read `s`)
  offers(node: Program.Node, s: string, defines: boolean | number, except?: Program.Rule): boolean {
    // (one including a level: what is read in it is its own)
    if (node.includes.length) return true;
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
      // and one already read (in the head too): the shared value)
      const text = cap === undefined ? written
        : reading.rule.bodies.has(name) ? (cap.includes('\n') ? cap : cap.trim())
        : defines && headed && !reading.values.get(name)?.read ? this.source(this.named(cap))
        : defines && name !== held && !reading.values.get(name)?.read ? this.source(cap, true)
        : this.written(this.shared(reading, name));
      if (text.length !== this.token || text.charCodeAt(this.grammar!.open.length) !== 0xE000) referred = false;
      // (one written within a line, on more than one: its other lines as indented, from that line's, as they were from its first)
      out += (cap === undefined ? text : indent !== undefined ? Program.indented(text, indent) : text.includes('\n') ? Program.continued(text, out.slice(out.lastIndexOf('\n') + 1)) : text) + template[k + 1];
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
  static continued(text: string, line: string, open = '{'): string {
    // (inside a bracket the line opens, its lines one: where they break means nothing there (none breaking in a block))
    let depth = 0; for (const c of line) depth += c === '(' || c === '[' ? 1 : c === ')' || c === ']' ? -1 : 0;
    if (depth > 0) { let braces = 0, joinable = true; for (const c of text) { if (c === open) braces++; else if (c === '}') braces--; else if (c === '\n' && braces > 0) { joinable = false; break; } } if (joinable) return text.trim().split('\n').map(part => part.trim()).join(' '); }
    const at = line.length - line.trimStart().length, [first, ...rest] = text.split('\n'), base = first.length - first.trimStart().length;
    if (at === base) return text.trimStart();
    return [first.trimStart(), ...rest.map(next => { const own = next.length - next.trimStart().length; return ' '.repeat(Math.max(0, at + own - base)) + next.trimStart(); })].join('\n');
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
  // (`written`: a typed hole as written, its type part of the head)
  export type Piece = { literal?: string, hole?: string, body?: boolean, written?: string, type?: string, style?: string };
  export type Rule = { style?: string, braced?: boolean, called?: boolean, checked?: [number, number], capture?: string, types: [string, string][], own?: boolean, shape?: string, modifies: boolean, bodies: Set<string>, head: string, pieces: Piece[], body: string, code: Code, holds?: object[], home?: Node, literals: string[], holes: string[], defines: boolean, passes: boolean, id: number, last?: string, key: string };
  export type Hole = { name: string, indent?: string, written: string, headed: boolean };
  export type Keyed = { key: string, rules: Rule[], looked: number };
  export type Candidate = { rule: Rule, rank: number };
  export type Template = (string | Hole)[];
  export type Code = { statements: string[], labels: Map<string, number>, marks: Set<number>, answering: number, valued: number[], templates: Map<string, Template>, helds: Map<string, string | undefined> };
  // (`node`: where it is read; `site`: where the text was written, when it is read on in a value)
  // (`from`: what the value it is read on in was read from: `.` in a call of it; `this`: what `.` is)
  // (`on`: read on in a value, `node`)
  // (`site`: where the text was written, when it is read on in a value; `also`: where else to look, below where it is read)
  // (`into`: where what is read defines goes, when not where it is read: a call's arguments, code inlined into the call)
  export type Running = { at: number, node?: Node, below?: Running };
  // (`writer`: the reading whose code the text is in, when it is not read as that reading's (a hole's text, what is read on))
  // (`receiver`: a value not a node read on: what a rule read on it has as `.`, not what is written there)
  // (`given`: a value read as a statement of its own)
  export type Frame = { given?: boolean, dotted?: boolean, receiver?: unknown, writer?: Reading, reading?: Reading, node: Node, site?: Node, also?: Node, into?: Node, from?: unknown, this?: unknown, on?: boolean };
  // A node: the rules defined in it (those led by a literal by its first character), and the node it is in.
  export class Node {
    static defined = 0;
    refers?: number; token?: string;
    // (how many heads it has; what reading text in it found)
    headed = 0; found?: { heads: number, found: Map<string, Found> }; sited?: WeakMap<Node, { heads: number, found: Map<string, Found> }>;
    looked = 0;
    // (a node holding a rule read where a value is wanted: each of its rules runs in a new node in it; `self`: what `.` was
    // where it was written, what it is in a call of it not read from a value)
    calls = false; self?: unknown;
    rules: Rule[] = [];
    // (a running program's: the nodes whose rules it sees as its own (its levels))
    includes: Node[] = [];
    // (led by a literal: by that literal, and the lengths those have by their first character; else by the first character of
    // its longest literal)
    led = new Map<string, Rule[]>(); lengths = new Map<string, number[]>(); loose = new Map<number, Keyed[]>(); keys: Keyed[] = []; bare: Rule[] = [];
    depth: number;
    constructor(public outer?: Node) { this.depth = outer ? outer.depth + 1 : 0; }
    has(head: string) { return this.heads.has(head); }
    // (a head defined again in the same node: the rule it had takes the new right side; a rule is placed as defined now, the
    // latest (a variable keeps its place))
    private heads = new Map<string, Rule>();
    static last?: Rule;
    define(rule: Rule, variable = false): void {
      const had = this.heads.get(rule.head);
      Node.last = had ?? rule;
      if (had) {
        Object.assign(had, { body: rule.body, code: rule.code, passes: rule.passes, holds: rule.holds });
        if (!variable) had.id = ++Node.defined, this.headed++;
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
  // (`typed`: a typed hole's, read in its type by its own rules)
  export class Held { typed = false; read = false; value: unknown; refers?: number; token?: string; into?: Node; program?: Running; from?: Reading; constructor(public text: string, public node: Node, public site?: Node, public self?: unknown) {} }
  // (the character a body referring to a value begins with: one no text is written with)
  export const REFERS = '\uE000', REFERENCE = /\uE000[0-9a-z]{6}/g;
  export type Found = { all: Read[], leads: number, whole?: boolean, shorter?: Read[] };
  // (a place among the statements of code being run: a label)
  export class Place { carries = false; value: unknown; constructor(public labels: Map<string, number>, public at: number) {} }
  // (going on to the next reading; none left (`all` those): the shorter ones)
  export class Again { constructor(public reading?: Reading, public all?: Read[]) {} }
  export type Read = { at: number, spans: number[], rule: Rule, rank: number, loose?: boolean };
  // A reading of text by a rule (one of `all` the ways the rules read it): what its holes took, what is after it, the next one.
  // The first is the latest rule's of those going furthest (`all` is in that order): its last reading when its right side only
  // goes on, else its first. The next one after a reading whose right side only goes on is the next one that does more.
  export class Reading {
    private read: Read;
    // (`receiver`: the node it was read in; `.` read as a value)
    // (`site`: where its text was written, where its holes are read)
    // (`self`: what `.` is where it is read: in its holes)
    constructor(public all: Read[], private index: number, public text: string, public receiver: Node, public site: Node, public self: unknown, first = false, exact = false) {
      if (exact) this.exact = true;
      else if (first) {
        this.index = all.length - 1;
        const { rule, at } = all[this.index];
        if (!rule.passes) while (this.index > 0 && all[this.index - 1].rule === rule && all[this.index - 1].at === at) this.index--;
      }
      else while (this.index + 1 < all.length && all[this.index].rule.passes) this.index++;
      this.read = all[this.index];
    }
    get rule() { return this.read.rule; }
    get spans() { return this.read.spans; }
    get position() { return this.index; }
    // (one of the shorter readings, tried in turn: nothing next but the next shorter)
    private exact = false;
    get at() { return this.read.at; }
    get after() { return this.text.slice(this.read.at); }
    // (the hole it begins with)
    get leading(): string | undefined { return this.read.spans[0] === 0 ? this.read.rule.holes[0] : undefined; }
    values = new Map<string, Held>();
    // (a call's: the node it runs in; any other's, where what it read defines goes (a call's arguments, through it))
    into?: Node;
    // (the program it was read in; the reading whose code it was written in)
    program?: Running; from?: Reading; also?: Node;
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
    next(): Reading | undefined { return !this.exact && this.index + 1 < this.all.length ? new Reading(this.all, this.index + 1, this.text, this.receiver, this.site, this.self) : undefined; }
  }
}

// ---------------------------------------------------------------- what reading a text said, and where
// (`begin`/`end` inclusive for a paint, as `lsp/semantics.ts` takes them; a diagnostic's end exclusive)
export type Paint = { begin: number, end: number, style: string };
export type Diagnostic = { file: string, begin: number, end: number, message: string, severity: 1 | 2 | 3 | 4, around?: string };

// Where what is read is in a text being read (a statement of it, `begin` to `end`): a reading's text looked for after where the
// reading it was read in is; what its rule's style and its holes' styles paint there.
export class Painter {
  declare paint_whole: (at: number | undefined, text: string, rule: Program.Rule) => void;
  paints: Paint[] = [];
  private at = new WeakMap<Program.Reading, number>();
  begin = 0; end = 0;
  constructor(public text: string, public program?: Program) {}
  locate(reading: Program.Reading) {
    let t = reading.text;
    // (a value written into it: where its text was written)
    if (t && t.includes(Program.REFERS) && this.program) t = this.program.source(t);
    if (!t || t.includes(Program.REFERS)) return;
    const from = reading.from ? this.at.get(reading.from) : undefined;
    let i = this.text.indexOf(t, from ?? this.begin);
    if (i < 0 || i + t.length > this.end) i = this.text.indexOf(t, this.begin);
    if (i >= 0 && i + t.length <= this.end) { this.at.set(reading, i); this.defined.set(reading, Program.Node.defined); }
  }
  private defined = new WeakMap<Program.Reading, number>();
  paint(reading: Program.Reading) {
    const at = this.at.get(reading), { rule, spans } = reading;
    // (a rule it defined, named by one of its holes (`x := 1`, `f (a) => …`): that hole shown as the rule is)
    const made = Program.Node.last;
    if (at !== undefined && made?.style && (this.defined.get(reading) ?? Infinity) < made.id) {
      let h = 0;
      for (const piece of rule.pieces) if (piece.hole) { const b = spans[2 * h], e = spans[2 * h + 1]; h++; if (reading.text.slice(b, e).trim() === made.head.trim() && e > b) this.paints.push({ begin: at + b, end: at + e - 1, style: made.style }); }
    }
    // (a member, `.x`: its `.` shown as it is)
    if (at !== undefined && rule.style && !rule.holes.length && this.text[at - 1] === '.' && rule.pieces.length === 1) this.paints.push({ begin: at - 1, end: at - 1, style: rule.style });
    const text = reading.text.includes(Program.REFERS) && this.program ? this.program.source(reading.text) : reading.text;
    if (text !== reading.text) return this.paint_whole(at, text, rule);
    if (at === undefined || (!rule.style && !rule.pieces.some(piece => piece.style))) return;
    // (a rule with no literal: its style is what it read)
    if (rule.style && !rule.pieces.some(piece => piece.literal !== undefined)) { if (reading.at > 0) this.paints.push({ begin: at, end: at + reading.at - 1, style: rule.style }); return; }
    let cursor = 0, h = 0;
    for (const piece of rule.pieces) {
      if (piece.literal !== undefined) {
        const i = text.indexOf(piece.literal, cursor);
        if (i < 0 || i >= reading.at) break;
        if (rule.style) this.paints.push({ begin: at + i, end: at + i + piece.literal.length - 1, style: rule.style });
        cursor = i + piece.literal.length;
      }
      else if (piece.hole) {
        const b = spans[2 * h], e = spans[2 * h + 1]; h++;
        if (piece.style && e > b) this.paints.push({ begin: at + b, end: at + e - 1, style: piece.style });
        cursor = e;
      }
    }
  }
}

// (a reading of text holding values written into it: its literals, found in order, in the text as written)
Painter.prototype.paint_whole = function (this: Painter, at: number | undefined, text: string, rule: Program.Rule) {
  if (at === undefined || !rule.style) return;
  let cursor = 0;
  for (const piece of rule.pieces) if (piece.literal !== undefined && piece.literal.trim()) {
    const i = text.indexOf(piece.literal, cursor);
    if (i < 0) break;
    this.paints.push({ begin: at + i, end: at + i + piece.literal.length - 1, style: rule.style });
    cursor = i + piece.literal.length;
  }
};
// The severity a diagnostic's rule is shown with (its style, the language's: `ERROR {message} ^error`), as the LSP numbers them.
const SEVERITIES: Record<string, 1 | 2 | 3 | 4> = { fatal: 1, error: 1, warn: 2, info: 3, debug: 4, trace: 4 };

// ---------------------------------------------------------------- the library: the language, its core library, projects
// Projects (P8.8): `@ether/<path>` a directory holding `<Name>.project.ray`, `@<name>` a language project, `@ether/$/<Name>.project.ray`;
// what a project needs, the lines it begins with that name others (`@…`); its tests beside it, `<Name>.test.ray` (needing it, and
// what its own first lines name). A directory with a `.project.ray` (an app, a site) is a project of the files in it, needing what
// that names. Each is read once, after what it needs, in the library's node: a file read on its own (a document, a test), in a
// node of its own inside it.
// (what a file uses, for the order files are read in: not its comments, nor its tests (`assert …`: read after everything))
const Library_read = (text: string) => { const out: string[] = []; let skip = -1; for (const line of text.split('\n')) { const at = line.length - line.trimStart().length; if (skip >= 0 && line.trim() && at > skip) continue; skip = -1; if (/^\s*assert\b/.test(line)) { skip = at; continue; } out.push(line.replace(/(^|\s)\/\/.*$/, '')); } return out.join('\n'); };
// What a statement of a file said, painted and put off (its tests) when it was read; a test, where its assert is and what it found.
type Test = { code: string, frame: Program.Frame, except?: Program.Rule, file: string, begin: number, end: number, outcome?: Diagnostic[], dropped?: boolean, paints?: Paint[] };
type Statement = { statement: string, begin: number, end: number, diagnostics: Diagnostic[], paints: Paint[], tests: Test[] };
export class Library {
  program: Program;
  root: string; ether: string; core: string;
  diagnostics = new Map<string, Diagnostic[]>();
  // (how many readings a test may take: `RAY_TEST_STEPS`; none, unlimited)
  budget = process.env.RAY_TEST_STEPS ? Number(process.env.RAY_TEST_STEPS) : undefined;
  texts = new Map<string, string>();
  read = new Set<string>();
  timings: [string, number][] = [];
  written: string[] = [];
  constructor(public options: { root?: string, painting?: boolean } = {}) {
    this.root = options.root ?? env.root();
    this.ether = env.path.join(this.root, '@ether'); this.core = env.path.join(this.ether, 'ray');
  }
  async boot(): Promise<this> {
    const t0 = performance.now();
    this.program = new Program(new Text.Source(ENTRYPOINT.join('/') + '2'));
    await this.program.compile();
    this.timings.push(['the language', performance.now() - t0]);
    this.entrypoint_tests();
    const t1 = performance.now();
    for (const file of Library.reading_order(this.files_of(this.core))) { const t = performance.now(); this.file(file); this.timings.push(['  ' + env.path.basename(file), performance.now() - t]); if (process.env.RAY_PROGRESS) env.fs.writeSync(2, `${env.path.basename(file).padEnd(24)} ${Math.round(performance.now() - t)} ms  heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB\n`); }
    this.program.run(this.program.kinds!.rest, { node: this.program.global });
    this.timings.push(['the core library', performance.now() - t1]);
    return this;
  }

  // The tests the entrypoint itself holds (put off while it was read): tests like any other, located in it.
  entrypoint_tests() {
    const p = this.program, file = env.path.join(this.core, ENTRYPOINT[2] + '2'), text = this.text(file), spans = Library.asserts(text, 0, text.length), used = new Map<string, number>();
    this.texts.set(file, text);
    const tests: Test[] = p.deferred.splice(0).map(d => {
      const written = String(p.source(d.written ?? d.code)).trim();
      let at = written ? text.indexOf(written, (used.get(written) ?? -1) + 1) : -1;
      if (at < 0 && written) at = text.indexOf(written);
      if (at >= 0) used.set(written, at);
      const span = at >= 0 ? spans.find(([b, e]) => b <= at && at < e) ?? [at, at + written.length] : [0, 0];
      return { ...d, file, begin: span[0], end: span[1] };
    });
    this.reads.set(file, [{ statement: '', begin: 0, end: text.length, diagnostics: [], paints: [], tests }]);
  }

  // The order a project's files are read in: a file after those defining what it uses, then by name. (A host's choice.)
  static reading_order(files: { path: string, text: string }[]): string[] {
    const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
    const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(Library_read(f.text).match(/[A-Za-z_][\w]*/g) ?? []) }));
    const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
    const order: string[] = [], left = new Set(info.map(f => f.path));
    while (left.size > 0) { const waiting = (p: string) => [...needs.get(p)!].filter(q => left.has(q)).length; const next = [...left].sort((a, b) => waiting(a) - waiting(b) || (a < b ? -1 : 1))[0]; order.push(next); left.delete(next); }
    return order;
  }
  text(file: string): string { return this.texts.get(file) ?? env.fs.readFileSync(file, 'utf8'); }
  // (the `.ray` files of a directory that are no project file, test or entrypoint)
  files_of(dir: string): { path: string, text: string }[] {
    return env.fs.readdirSync(dir).filter(f => f.endsWith(EXTENSION) && !f.startsWith('.') && !f.startsWith('entrypoint.') && !f.endsWith('.project' + EXTENSION) && !f.endsWith('.test' + EXTENSION))
      .map(f => env.path.join(dir, f)).map(f => ({ path: f, text: this.text(f) }));
  }
  // What a project file or a test begins with: the projects it needs (`@…` lines).
  needs(text: string): string[] {
    const out: string[] = [];
    for (const line of text.split('\n')) { const t = line.trim(); if (!t || t.startsWith('//')) continue; if (!/^@[^\s:]+$/.test(t) || t.includes('://')) break; out.push(t); }
    return out;
  }
  // Where a project named so is: its project file (or a directory with a `.project.ray`); names matched ignoring case.
  where(name: string): string | undefined {
    const { fs, path } = env, find = (dir: string, wanted: string) => { try { return fs.readdirSync(dir).find(f => f.toLowerCase() === wanted.toLowerCase()); } catch { return undefined; } };
    const project_file = (dir: string) => { try { return fs.readdirSync(dir).find(f => f.endsWith('.project' + EXTENSION) && !f.startsWith('.')); } catch { return undefined; } };
    if (name === '@ether') return fs.existsSync(path.join(this.ether, '.project' + EXTENSION)) ? this.ether : undefined;
    if (name.startsWith('@ether/')) {
      let dir = this.ether;
      for (const part of name.slice('@ether/'.length).split('/')) { const found = find(dir, part); if (!found) return undefined; dir = path.join(dir, found); }
      const file = project_file(dir);
      return file ? path.join(dir, file) : fs.existsSync(path.join(dir, '.project' + EXTENSION)) ? dir : undefined;
    }
    const languages = path.join(this.ether, '$'), file = find(languages, name.slice(1) + '.project' + EXTENSION);
    return file ? path.join(languages, file) : undefined;
  }
  // The project a file is in: a project file is its own; else the nearest `<Name>.project.ray` beside it, or directory above with a `.project.ray`.
  project_of(file: string): string | undefined {
    const { fs, path } = env;
    if (file.endsWith('.project' + EXTENSION)) return file;
    const beside = fs.readdirSync(path.dirname(file)).find(f => f.endsWith('.project' + EXTENSION) && !f.startsWith('.'));
    if (beside && !file.endsWith('.test' + EXTENSION)) return path.join(path.dirname(file), beside);
    for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) if (fs.existsSync(path.join(dir, '.project' + EXTENSION))) return dir;
    return undefined;
  }
  // A project read (once), after what it needs.
  project(at: string, seen = new Set<string>()) {
    if (this.read.has(at) || seen.has(at) || at === this.core) return;
    seen.add(at);
    const { fs, path } = env, directory = fs.statSync(at).isDirectory();
    const needs = directory ? this.needs(fs.readFileSync(path.join(at, '.project' + EXTENSION), 'utf8')) : this.needs(this.text(at));
    for (const name of needs) { const dep = this.where(name); if (dep) this.project(dep, seen); }
    this.read.add(at);
    const t0 = performance.now();
    if (directory) for (const file of Library.reading_order(this.files_of(at))) this.file(file);
    else this.file(at);
    this.timings.push([path.relative(this.root, at), performance.now() - t0]);
  }
  // What a file needs read before it: its project (or, a test, what it names, its project first).
  prepare(file: string) {
    const { path } = env;
    if (path.dirname(file) === this.core) return;
    if (file.endsWith('.test' + EXTENSION)) {
      const project = this.project_of(file.slice(0, -('.test' + EXTENSION).length) + '.project' + EXTENSION);
      if (project && env.fs.existsSync(project)) this.project(project);
      for (const name of this.needs(this.text(file))) { const dep = this.where(name); if (dep) this.project(dep); }
      return;
    }
    const project = this.project_of(file);
    if (project && !(env.fs.statSync(project).isDirectory())) return this.project(project);
    if (project) { for (const name of this.needs(env.fs.readFileSync(path.join(project, '.project' + EXTENSION), 'utf8'))) { const dep = this.where(name); if (dep) this.project(dep); } }
  }

  // A file read, statement by statement, in `node` (the library's): what each said, where; what is painted, when painting. Read
  // again (`again`, an edit), a statement written as it was is not read again: what it said, painted and put off, kept (moved with
  // it); only those written otherwise are read.
  file(file: string, text = this.text(file), node: Program.Node = this.program.global, again = false): Diagnostic[] {
    const p = this.program, painter = this.options.painting ? new Painter(text, p) : undefined, was = this.texts.get(file) ?? '';
    this.texts.set(file, text);
    // (where it was edited: what is the same before and after; a place outside that, where it is now)
    let pre = 0; while (pre < was.length && pre < text.length && was[pre] === text[pre]) pre++;
    let suf = 0; while (suf < was.length - pre && suf < text.length - pre && was[was.length - 1 - suf] === text[text.length - 1 - suf]) suf++;
    const now = (at: number) => at < pre ? at : at >= was.length - suf ? at + text.length - was.length : -1;
    const kept_in = <T extends { begin: number, end: number }>(xs: T[]) => xs.flatMap(x => { const b = now(x.begin), e = now(x.end); return b < 0 || e < 0 ? [] : [{ ...x, begin: b, end: e }]; });
    const before_reads = again ? this.reads.get(file) ?? [] : [], kept = new Map<string, Statement[]>();
    for (const r of before_reads) kept.set(r.statement, [...kept.get(r.statement) ?? [], r]);
    if (!again) for (const r of this.reads.get(file) ?? []) for (const t of r.tests) t.dropped = true;
    const reads: Statement[] = [];
    let cursor = 0, changed = false;
    for (const statement of p.code(text).statements) {
      if (!statement.trim()) continue;
      const first = statement.trimStart().split('\n')[0].trim(), found = first ? text.indexOf(first, cursor) : -1, begin = found < 0 ? cursor : found;
      // (where it ends: as long as it is, when it is written as read; else where its last line is (not a line like it inside it))
      const whole = statement.trim(), last = statement.trimEnd().split('\n').pop()!.trim();
      // (not as written, comments left out: its lines found one after another, each after the one before)
      let last_at = -1;
      if (text.startsWith(whole, begin)) last_at = begin + whole.length - last.length;
      else if (last) { let at = begin; for (const line of whole.split('\n')) { const l = line.trim(); if (!l) continue; const i = text.indexOf(l, at); if (i < 0) continue; at = i + l.length; last_at = i; } if (last_at >= 0) last_at = at - last.length; }
      const end = last_at < 0 ? begin + first.length : last_at + last.length;
      cursor = end;
      // (its needs, the project's head: not read)
      if (/^@[^\s:]+$/.test(statement.trim()) && !text.slice(0, begin).split('\n').some(line => line.trim() && !line.trim().startsWith('//') && !/^@[^\s:]+$/.test(line.trim()))) continue;
      const same = kept.get(statement)?.shift();
      if (same) {
        const by = begin - same.begin, moved = <T extends { begin: number, end: number }>(x: T): T => ({ ...x, begin: x.begin + by, end: x.end + by });
        same.diagnostics = same.diagnostics.map(moved); same.paints = same.paints.map(moved);
        for (const t of same.tests) { t.begin += by; t.end += by; t.paints = t.paints?.map(moved); }
        same.begin = begin; same.end = end; reads.push(same);
        continue;
      }
      // (written otherwise only in its tests: its tests read again, nothing else)
      const bare = Library_read(statement), like = again ? [...kept.values()].flat().find(o => o.tests.length && Library_read(o.statement) === bare) : undefined;
      if (like) {
        kept.set(like.statement, kept.get(like.statement)!.filter(o => o !== like));
        const read: Statement = { statement, begin, end, diagnostics: kept_in(like.diagnostics), paints: kept_in(like.paints), tests: [] };
        // (a test kept: one written outside what was edited)
        const old = like.tests.map(t => ({ ...t, begin: t.end < pre || t.begin >= was.length - suf ? now(t.begin) : -1, end: now(t.end) })), sample = like.tests[0].frame.reading;
        for (const [b, e] of Library.asserts(text, begin, end)) {
          const same_test = old.find(t => t.begin === b && t.end === e);
          if (same_test) { read.tests.push(Object.assign(like.tests[old.indexOf(same_test)], { begin: b, end: e, paints: kept_in(same_test.paints ?? []) })); continue; }
          const deferred = p.deferred.length, before = p.reports.length;
          if (painter) { painter.paints = []; painter.begin = b; painter.end = e; p.painter = painter; }
          try { p.run(text.slice(b, e), { node: sample?.receiver ?? node, this: sample?.self }); }
          catch (x) { read.diagnostics.push(this.said(file, text, b, e, `Failed: ${(x as Error)?.message ?? x}`, 1)); }
          finally { p.painter = undefined; }
          for (const report of p.reports.slice(before)) read.diagnostics.push(this.reported(report, file, text, b, e));
          p.reports.length = before;
          if (painter) read.paints.push(...painter.paints);
          for (const d of p.deferred.splice(deferred)) read.tests.push({ ...d, file, begin: b, end: e });
        }
        for (const t of like.tests) if (!read.tests.includes(t)) t.dropped = true;
        reads.push(read);
        continue;
      }
      if (!/^\s*assert\b/.test(statement)) changed = true;
      const read: Statement = { statement, begin, end, diagnostics: [], paints: [], tests: [] }, out = read.diagnostics, before = p.reports.length, deferred = p.deferred.length;
      if (painter) { painter.paints = []; painter.begin = begin; painter.end = end; p.painter = painter; }
      let value: unknown;
      try { value = p.run(statement, { node }); }
      catch (e) { out.push(this.said(file, text, begin, end, `Failed: ${(e as Error)?.message ?? e}`, 1)); }
      finally { p.painter = undefined; }
      for (const report of p.reports.slice(before)) out.push(this.reported(report, file, text, begin, end));
      p.reports.length = before;
      if (typeof value === 'string' && value.trim() === p.source(statement).trim() && /[A-Za-z]/.test(value)) out.push(this.said(file, text, begin, end, 'Nothing reads this.', 3));
      if (painter) read.paints = painter.paints;
      // (the tests it put off: the asserts written in it, in order)
      const spans = Library.asserts(text, begin, end), put = p.deferred.splice(deferred);
      // (each where its code is written: one in a loop's body is put off once each time round)
      const used = new Map<string, number>(); const located = (code: string, k: number) => { const written = String(p.source(code)).trim(), at0 = written ? text.indexOf(written, Math.max(begin, (used.get(written) ?? -1) + 1)) : -1, at = at0 >= 0 || !written ? at0 : text.indexOf(written, begin); if (at >= 0) used.set(written, at); return at >= 0 && at < end ? spans.find(([b, e]) => b <= at && at < e) ?? [at, at + written.length] as [number, number] : spans[k]; };
      put.forEach((d, k) => { const span = located(d.written ?? d.code, k); read.tests.push({ ...d, file, begin: span?.[0] ?? begin, end: span?.[1] ?? end }); });
      reads.push(read);
    }
    for (const rest of kept.values()) for (const r of rest) for (const t of r.tests) t.dropped = true;
    // (a definition read again: what the tests found may have changed)
    if (changed) for (const r of reads) for (const t of r.tests) t.outcome = undefined;
    this.reads.set(file, reads);
    const diagnostics = reads.flatMap(r => r.diagnostics);
    this.diagnostics.set(file, diagnostics);
    if (painter) { const painted = [...reads.flatMap(r => r.paints), ...Library.comments(text)]; this.paints.set(file, [...painted, ...this.unread(text, painted)]); }
    return diagnostics;
  }
  // What nothing read paints (code not run while reading: a rule's right side): each piece of it shown as what the rules would read
  // it as first (matched, nothing run); a word nothing reads, a name (`variable`); anything else, `punctuation`.
  private styles = new Map<string, string>();
  unread(text: string, painted: Paint[]): Paint[] {
    const p = this.program, cells = new Uint8Array(text.length), out: Paint[] = [];
    for (const x of painted) for (let k = Math.max(0, x.begin); k <= Math.min(x.end, text.length - 1); k++) cells[k] = 1;
    const style = (piece: string, word: boolean) => {
      let found = this.styles.get(piece);
      if (found === undefined) {
        let read: string | undefined = p.literal_styles.get(piece);
        if (!read) try { const all = p.readings(piece, p.candidates(piece, p.global, 0), true); for (let k = all.length - 1; k >= 0 && !read; k--) read = all[k].rule.style; } catch { }
        this.styles.set(piece, found = read ?? (word ? 'variable' : 'punctuation'));
      }
      return found;
    };
    for (const m of text.matchAll(/"(?:[^"\\\n]|\\.)*"|`[^`\n]*`|[\p{L}\p{N}_]+(?:\.[\p{N}]+)?|[()\[\]{},]|[^\s\p{L}\p{N}_"`()\[\]{},]+/gu)) {
      const b = m.index!, e = b + m[0].length - 1;
      let free = true; for (let k = b; k <= e; k++) if (cells[k]) { free = false; break; }
      if (!free) continue;
      out.push({ begin: b, end: e, style: style(m[0], /^[\p{L}\p{N}_]/u.test(m[0])) });
    }
    return out;
  }
  reads = new Map<string, Statement[]>();
  // (the asserts written in a text between two places, each from `assert` to the end of what it holds: not one inside another)
  static asserts(text: string, begin: number, end: number): [number, number][] {
    const out: [number, number][] = [], lines = text.slice(0, end).split('\n');
    let o = 0, open = -1, start = 0, indent = 0, depth = 0;
    for (const line of lines) {
      const at = line.length - line.trimStart().length, bare = line.replace(/"(?:[^"\\]|\\.)*"|`[^`]*`/g, '""').replace(/(^|\s)\/\/.*$/, '');
      if (open >= 0) {
        if (depth > 0 || (line.trim() && at > indent) || (line.trim() && at === indent && /^[)\]}]/.test(line.trim()))) { depth += (bare.match(/[([{]/g) ?? []).length - (bare.match(/[)\]}]/g) ?? []).length; open = o + line.length; o += line.length + 1; continue; }
        out.push([start, open]); open = -1;
      }
      if (o >= begin && /^\s*assert\b/.test(line)) { start = o + at; indent = at; open = o + line.length; depth = (bare.match(/[([{]/g) ?? []).length - (bare.match(/[)\]}]/g) ?? []).length; }
      o += line.length + 1;
    }
    if (open >= 0) out.push([start, open]);
    return out;
  }
  // What a file's tests show: what is painted inside an `assert` as it is, in the state of the test (`failed`, `passed`, not run
  // `untested`: `keyword.failed`, the theme says how that is shown); what is not painted in it, the state.
  tested_paints(file: string): Paint[] {
    const style = (t: Test) => t.outcome === undefined ? 'untested' : t.outcome.length ? 'failed' : 'passed';
    const tests = (this.reads.get(file) ?? []).flatMap(r => r.tests).filter(t => !t.dropped);
    const spans = Library.asserts(this.texts.get(file) ?? '', 0, (this.texts.get(file) ?? '').length);
    // (`assert` itself: the state; what follows it: as it is painted, muted (`.muted`))
    const text = this.texts.get(file) ?? '';
    const shown = spans.map(([begin, end]) => { const word = text.slice(begin).match(/^\w+/)?.[0].length ?? 0; return { begin, end: end - 1, word: begin + word - 1, style: style(tests.find(t => t.begin === begin) ?? ({} as Test)) }; });
    const within = (x: Paint) => shown.find(s => x.begin >= s.begin && x.end <= s.end);
    const painted = [...this.paints.get(file) ?? [], ...tests.flatMap(t => t.paints ?? [])].filter(x => !shown.some(s => x.begin >= s.begin && x.end <= s.word));
    return [...shown.map(s => ({ begin: s.begin, end: s.word, style: s.style })), ...painted.map(x => within(x) ? { ...x, style: x.style + '.muted' } : x)];
  }
  paints = new Map<string, Paint[]>();
  // (comments are the host's: what it does not read)
  static comments(text: string): Paint[] {
    const out: Paint[] = []; let o = 0;
    for (const line of text.split('\n')) { const m = line.match(/(^|\s)\/\/.*$/); if (m) { const b = o + m.index! + m[1].length; out.push({ begin: b, end: o + line.length - 1, style: 'comment' }); } o += line.length + 1; }
    return out;
  }
  // A report: where the reading it was made in (or one it was read in) was read from the statement.
  reported(report: Program.Reading, file: string, text: string, begin: number, end: number): Diagnostic {
    const p = this.program, statement = text.slice(begin, end);
    let b = begin, e = end;
    for (let r: Program.Reading | undefined = report; r; r = r.from) { const t = r.text?.trim(); if (!t || t.includes(Program.REFERS)) continue; const i = statement.indexOf(t); if (i >= 0) { b = begin + i; e = b + t.length; break; } }
    const caps = report.caps, message = 'message' in caps ? p.source(caps.message) : p.source(report.text);
    return this.said(file, text, b, e, message.replace(/^`(.*)`$/s, '$1'), SEVERITIES[report.rule.style ?? 'error'] ?? 1);
  }
  // A diagnostic, and what is written around it: the comments above the statement it is in, and the line, with the comment next to it.
  said(file: string, text: string, begin: number, end: number, message: string, severity: 1 | 2 | 3 | 4): Diagnostic {
    const lines = text.split('\n'), line = text.slice(0, begin).split('\n').length - 1, around: string[] = [];
    for (let k = line - 1; k >= 0 && lines[k].trim().startsWith('//'); k--) around.unshift(lines[k]);
    around.push(lines[line]);
    return { file, begin, end, message, severity, around: around.join('\n') };
  }
  // What was put off while reading (tests): run, what each said; a file's (those not run since what they read was read again), or every
  // one. `until`: stop when it answers true (something else to do), the rest run later.
  test(file?: string, until?: () => boolean, each?: (test: Test, outcome: Diagnostic[]) => void): Diagnostic[] {
    const p = this.program, out: Diagnostic[] = [];
    const tests = file !== undefined ? (this.reads.get(file) ?? []).flatMap(r => r.tests) : [...this.reads.values()].flat().flatMap(r => r.tests);
    p.deferring = false;
    let stopped = false;
    try {
      for (const t of tests) {
        if (t.dropped) continue;
        if (t.outcome === undefined) {
          if (until?.()) { stopped = true; break; }
          const said: Diagnostic[] = [], before = p.reports.length, text = this.texts.get(t.file) ?? '';
          const painter = this.options.painting ? Object.assign(new Painter(text, p), { begin: t.begin, end: t.end }) : undefined;
          p.painter = painter;
          p.budget = this.budget; p.limit_ms = Number(process.env.RAY_TEST_MS ?? 1000); p.heap_mb = Number(process.env.RAY_TEST_MB ?? 512); p.heap_from = process.memoryUsage().heapUsed; p.deadline = performance.now() + p.limit_ms;
          try { p.run(t.code, t.frame, t.except); }
          catch (e) { said.push(this.said(t.file, text, t.begin, t.end, `Failed: ${(e as Error)?.message ?? e}`, 1)); }
          finally { p.painter = undefined; p.budget = undefined; p.deadline = undefined; }
          if (painter) t.paints = painter.paints;
          for (const report of p.reports.slice(before)) said.push(this.reported(report, t.file, text, t.begin, t.end));
          p.reports.length = before;
          t.outcome = said;
          each?.(t, said);
        }
        out.push(...t.outcome);
      }
      // (what was put off outside a file's reading)
      if (file === undefined && !stopped) for (const { code, frame, except } of p.deferred.splice(0)) {
        const before = p.reports.length;
        try { p.run(code, frame, except); } catch { }
        for (const report of p.reports.slice(before)) { const at = this.located(report); if (at) out.push(this.reported(report, at.file, at.text, at.begin, at.end)); }
        p.reports.length = before;
      }
    } finally { p.deferring = true; }
    return out;
  }
  // (the file and place a reading's text, or one it was read in, is written at)
  located(reading?: Program.Reading): { file: string, text: string, begin: number, end: number } | undefined {
    for (let r = reading; r; r = r.from) {
      const t = r.text?.trim();
      if (!t || t.includes(Program.REFERS) || t.length < 3) continue;
      for (const [file, text] of this.texts) { const i = text.indexOf(t); if (i >= 0) return { file, text, begin: i, end: i + t.length }; }
    }
    return undefined;
  }
  // Every test of the library: its core's, each project's and the tests beside them.
  tests(): string[] {
    const { fs, path } = env, out: string[] = [];
    const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.') || ['node_modules', 'ide', 'spec', 'avatar'].includes(e.name) || /^v\d/.test(e.name)) continue; const full = path.join(dir, e.name); if (e.isDirectory()) walk(full); else if (e.name.endsWith('.project' + EXTENSION) || e.name.endsWith('.test' + EXTENSION)) out.push(full); } };
    walk(this.ether);
    return [this.ether, ...out.sort()];
  }
}

// ---------------------------------------------------------------- the command line
export async function main([args, kwargs]: CLI.Args = CLI.args()) {
  if (kwargs.version) return console.log(env.version.toString());
  if (kwargs.help) { console.log(CLI.help()); return; }
  if (kwargs.lsp) return await lsp();
  if (args.length === 0 && !kwargs.test) { console.log(CLI.help()); return; }
  if (!env.worker && env.nodejs) {
    // (the reader recurses deeply: it runs in a thread with a stack large enough)
    const worker = env.thread({ main: [args, kwargs] });
    process.exitCode = await new Promise<number>(resolve => { worker.on('message', (m: { exit?: number }) => { if (m.exit !== undefined) resolve(m.exit); }); worker.on('error', e => { console.error(e); resolve(1); }); worker.on('exit', code => resolve(code)); });
    return;
  }
  if (kwargs.test) env.fs.writeSync(2, 'reading the core library…\n');
  const library = await new Library().boot(), { path } = env, all: Diagnostic[] = [];
  if (kwargs.verbose) for (const [name, ms] of library.timings.splice(0)) console.error(`${name.padEnd(40)} ${String(Math.round(ms)).padStart(7)} ms`);
  const files = (args.length ? args : library.tests()).map(f => path.resolve(f));
  if (kwargs.verbose) console.error(`reading ${files.length}: ${files.map(f => path.relative(library.root, f)).join(' ')}`);
  // (the tests of the files given; given none, of every file read)
  // (a test reported as it finishes: its comments above, its code, and what it found)
  const counts = { passed: 0, failed: 0, warnings: 0 }, reported = new Set<Diagnostic>();
  const report = (t: Test, outcome: Diagnostic[]) => {
    const text = library.text(t.file), lines = text.split('\n'), first = text.slice(0, t.begin).split('\n').length - 1;
    // (the code shown goes on while the lines are indented past the test's own, or close a bracket at its level)
    const indent = (l: string) => l.length - l.trimStart().length; let last = first;
    for (let k = first + 1; k < lines.length; k++) { if (!lines[k].trim()) continue; if (indent(lines[k]) > indent(lines[first]) || (indent(lines[k]) === indent(lines[first]) && /^[)\]}]/.test(lines[k].trim()))) last = k; else break; }
    last = Math.max(last, text.slice(0, Math.max(t.begin, t.end - 1)).split('\n').length - 1);
    const above: string[] = []; for (let k = first - 1; k >= 0 && lines[k].trim().startsWith('//'); k--) above.unshift(lines[k]);
    t.paints = undefined; (t as { frame?: Program.Frame }).frame = undefined;
    const failed = outcome.some(d => d.severity === 1); counts[failed ? 'failed' : 'passed']++; counts.warnings += outcome.filter(d => d.severity === 2).length;
    const block = [...above, ...lines.slice(first, last + 1)].map(l => '    | ' + l).join('\n');
    const messages = outcome.filter(d => d.severity <= 2).map(d => { reported.add(d); return `    ${['', 'error', 'warning'][d.severity]}: ${d.message}`; }).join('\n');
    env.fs.writeSync(2, `${failed ? 'FAIL' : 'ok  '} ${path.relative(process.cwd(), t.file)}:${first + 1}${process.env.RAY_PROGRESS ? `  heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB` : ''}\n${block}\n${messages ? messages + '\n' : ''}`);
  };
  // (one test per call, the event loop turned between: what a `WeakRef` was made of is kept until the job ends, so a run in one job keeps everything every test made)
  const seen = new Set<Diagnostic>(), tested = new Set<string>();
  const run_tests = async (file?: string) => { for (;;) {
    let ran = false;
    const outcome = library.test(file, () => { const stop = ran; ran = true; return stop; }, report);
    if (!ran) { for (const d of outcome) if (!seen.has(d)) { seen.add(d); all.push(d); } break; }
    await new Promise<void>(resolve => setImmediate(resolve));
  } };
  // (the tests of every file read so far and not yet tested, one at a time as they finish)
  const run_read = async () => { if (kwargs.test) for (const file of [...library.reads.keys()]) if (!tested.has(file) && (!args.length || files.includes(file))) { tested.add(file); await run_tests(file); } };
  for (const file of files) {
    if (kwargs.test) env.fs.writeSync(2, `reading ${path.relative(process.cwd(), file)}…\n`);
    if (env.fs.statSync(file).isDirectory()) { library.project(file); if (args.length) await run_read(); continue; }
    library.prepare(file);
    if (!library.diagnostics.has(file)) library.file(file, library.text(file), path.dirname(file) === library.core || file.endsWith('.project' + EXTENSION) ? library.program.global : new Program.Node(library.program.global));
    // (given files: each one's tests as soon as it is read; given none, every file is read first: tests run in between leave
    // what they did to what is read after them)
    if (args.length) await run_read();
    if (process.env.RAY_PROGRESS) env.fs.writeSync(2, `read ${path.relative(library.root, file)}  heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB\n`);
  }
  if (kwargs.verbose) for (const [name, ms] of library.timings.splice(0)) console.error(`${name.padEnd(40)} ${String(Math.round(ms)).padStart(7)} ms`);
  await run_read();
  for (const [, ds] of library.diagnostics) all.push(...ds);
  // (what was put off outside any file's reading)
  if (kwargs.test && !args.length) await run_tests(undefined);
  const shown = all.filter(d => d.severity <= (kwargs.verbose ? 3 : 2) && (args.length === 0 || files.includes(d.file) || kwargs.test) && !reported.has(d));
  for (const d of shown) {
    const line = d.file ? library.text(d.file).slice(0, d.begin).split('\n').length : 0;
    console.error(`${d.file ? path.relative(process.cwd(), d.file) : '?'}:${line}: ${['', 'error', 'warning', 'info', 'hint'][d.severity]}: ${d.message}${d.around ? '\n' + d.around.split('\n').map(l => '    | ' + l).join('\n') : ''}`);
  }
  if (kwargs.test) console.error(`${counts.passed} passed, ${counts.failed} failed, ${counts.warnings} warnings in tests, ${shown.filter(d => d.severity === 1).length} errors in reading`);
  const exit = shown.some(d => d.severity === 1) || counts.failed > 0 ? 1 : 0;
  if (env.worker) env.worker_threads.parentPort!.postMessage({ exit }); else process.exitCode = exit;
}

// ---------------------------------------------------------------- the language server
// Diagnostics, semantic tokens and the theme channel (`ether/theme`: how each style is shown, the language's theme, and each
// document's styled runs), from what the reader read: the library once (in a thread), then each document as it changes, in a node
// of its own (a file of the library or a project: read again where it was).
export const TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];

// What a style is shown as in a theme's table: followed through the styles it names to a colour; one the table does not name is shown
// as the one before its last `.`.
export function shown_as(table: Map<string, string>, name: string, seen = new Set<string>()): string | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const next = table.get(name);
  if (next !== undefined) return /^#[0-9A-Fa-f]{3,8}$/.test(next) ? next : shown_as(table, next, seen);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? shown_as(table, name.slice(0, dot), seen) : undefined;
}

// A style muted (`keyword.muted`: what is written in a test): its colour taken toward the theme's `^muted` by its `^muting` (`50%`).
export function muted(table: Map<string, string>, style: string): string | undefined {
  if (!style.endsWith('.muted')) return undefined;
  const base = shown_as(table, style.slice(0, -'.muted'.length)), toward = shown_as(table, 'muted'), amount = parseFloat(table.get('muting') ?? '50') / 100;
  if (!base || !toward) return base;
  const rgb = (c: string) => { const h = c.slice(1); const x = h.length <= 4 ? [...h.slice(0, 3)].map(d => d + d).join('') : h.slice(0, 6); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
  const [a, b] = [rgb(base), rgb(toward)];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}

// The language's theme: what `Theme.current` is (a name, and each style what it is shown as: another style, or a colour).
export function theme(program: Program): { name: string, colors: Record<string, string> } | undefined {
  let value: unknown;
  try { value = program.run('Theme.current', { node: program.global }); } catch { return undefined; }
  if (!(value instanceof Program.Node)) return undefined;
  const read = (s: string) => { try { return program.run(s, { node: value as Program.Node, this: value }); } catch { return undefined; } };
  const name = read('name'), styles = read('styles');
  if (!(styles instanceof Program.Node)) return undefined;
  const colors: Record<string, string> = {}, none = program.run('None', { node: program.global });
  const of = (node: unknown, name: string) => node instanceof Program.Node ? program.run(name, { node, this: node }) : undefined;
  for (let at = of(styles, 'head'), n = 0; at instanceof Program.Node && at !== none && n < 10000; at = of(at, 'next'), n++) {
    const pair = of(at, 'value'), style = of(pair, 'first'), shown = of(pair, 'last');
    if (typeof style === 'string' && typeof shown === 'string') colors[style.trim()] = shown.trim();
  }
  return { name: typeof name === 'string' ? name : 'theme', colors };
}

// The language server's two readers: one reads each document as it changes and says so at once (`read`); the other reads it too and
// runs its tests (`test`), saying so as they finish. (A test runs as long as it runs: an edit is not kept waiting for it.)
async function lsp_worker(role: 'read' | 'test') {
  const port = env.worker_threads.parentPort!, { path } = env;
  const t0 = performance.now();
  const library = await new Library({ painting: true }).boot();
  port.postMessage({ log: `${role}: the language and its core library read in ${Math.round(performance.now() - t0)} ms` });
  if (role === 'read') port.postMessage({ theme: theme(library.program) ?? null });
  const docs = new Map<string, { file: string, text: string, version: number }>(), dirty = new Set<string>();
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  // (each document read as it changes (only what changed in it); what it says sent at once, then again as its tests are run, a
  // few at a time, giving way to an edit)
  const nodes = new Map<string, Program.Node>(), testing = new Set<string>();
  const send = (uri: string, doc: { file: string, text: string, version: number }, file: string) => {
    const tests = (library.reads.get(file) ?? []).flatMap(r => r.tests).filter(t => !t.dropped && t.outcome).flatMap(t => t.outcome!);
    const diagnostics = [...library.diagnostics.get(file) ?? [], ...tests];
    port.postMessage({ checked: { uri, version: doc.version, text: doc.text, paints: library.tested_paints(file), diagnostics, tested: role === 'test' } });
    return diagnostics.length;
  };
  const work = () => {
    scheduled = undefined;
    for (const uri of [...dirty]) {
      dirty.delete(uri);
      const doc = docs.get(uri);
      if (!doc) continue;
      const t1 = performance.now(), file = path.resolve(doc.file);
      try { library.prepare(file); } catch (e) { port.postMessage({ log: `reading what ${file} needs failed: ${(e as Error).stack ?? e}` }); }
      const own = path.dirname(file) === library.core || file.endsWith('.project' + EXTENSION);
      // (a file read as part of the library, unchanged: as it was read there)
      if (!(own && library.texts.get(file) === doc.text && library.reads.has(file))) {
        let node = own ? library.program.global : nodes.get(file);
        if (!node) nodes.set(file, node = new Program.Node(library.program.global));
        library.file(file, doc.text, node, library.reads.has(file));
      }
      const n = send(uri, doc, file);
      port.postMessage({ log: `read ${path.basename(file)} v${doc.version} in ${Math.round(performance.now() - t1)} ms: ${n} diagnostics` });
      if (role === 'test') testing.add(uri);
    }
    if (testing.size) setTimeout(test, 0);
  };
  const test = () => {
    for (const uri of [...testing]) {
      if (dirty.size) return;
      const doc = docs.get(uri);
      if (!doc) { testing.delete(uri); continue; }
      const file = path.resolve(doc.file), t1 = performance.now(), deadline = t1 + 50;
      library.test(file, () => performance.now() > deadline || dirty.size > 0);
      const left = (library.reads.get(file) ?? []).flatMap(r => r.tests).filter(t => !t.dropped && !t.outcome).length;
      send(uri, doc, file);
      if (left === 0) { testing.delete(uri); port.postMessage({ log: `tested ${path.basename(file)} v${doc.version}` }); }
    }
    if (testing.size && !dirty.size) setTimeout(test, 0);
  };
  port.on('message', (m: { open?: { uri: string, file: string, text: string, version: number }, close?: string }) => {
    if (m.open) { docs.set(m.open.uri, m.open); dirty.add(m.open.uri); }
    if (m.close) docs.delete(m.close);
    if (scheduled === undefined) scheduled = setTimeout(work, Number(process.env.RAY_LSP_DELAY ?? 50));
  });
  port.postMessage({ ready: true });
}

export async function lsp(options: { io?: { input: NodeJS.ReadableStream, output: NodeJS.WritableStream } } = {}): Promise<void> {
  const commonjs = <T>(m: T): T => ((m as { default?: T }).default ?? m);
  const [{ createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind }, { TextDocument }, { encode, runs, position_of, MODIFIERS }] = await Promise.all([
    import('vscode-languageserver/node.js').then(commonjs), import('vscode-languageserver-textdocument').then(commonjs), import('./lsp/semantics.ts'),
  ]);
  const io = options.io ?? { input: process.stdin, output: process.stdout };
  const connection = createConnection(ProposedFeatures.all, io.input, io.output), documents = new TextDocuments(TextDocument);
  const reader = env.thread({ lsp: 'read' }), tester = env.thread({ lsp: 'test' });
  reader.unref(); tester.unref();
  const file_of = (uri: string): string => { try { return env.url.fileURLToPath(uri); } catch { return uri; } };
  const checked = new Map<string, { version: number, text: string, paints: Paint[] }>();
  const painted = (paints: Paint[]) => paints as unknown as Parameters<typeof encode>[1];
  let shown: { name: string, colors: Record<string, string> } | undefined;
  const payload = (uris: string[]) => {
    const docs = uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, painted(c.paints)) }] : []; });
    const styles: Record<string, { color: string }> = {};
    if (shown) {
      const table = new Map(Object.entries(shown.colors));
      for (const [name] of table) { const color = shown_as(table, name); if (color) styles[name] = { color }; }
      for (const doc of docs) for (const { style } of doc.ranges) if (!styles[style]) { const color = muted(table, style) ?? shown_as(table, style); if (color) styles[style] = { color }; }
    }
    return { styles, documents: docs };
  };
  // (what was said about a version of a document: the reader's, until the tester's (with what its tests found) for that version)
  const said = new Map<string, { version: number, tested: boolean }>();
  const heard = (m: { checked?: { uri: string, version: number, text: string, paints: Paint[], diagnostics: Diagnostic[], tested?: boolean }, log?: string, theme?: { name: string, colors: Record<string, string> } | null }) => {
    if (m.theme !== undefined) { shown = m.theme ?? undefined; connection.sendNotification('ether/theme', payload([...checked.keys()])); return; }
    if (m.log !== undefined) { connection.console.log(m.log); return; }
    const c = m.checked;
    if (!c) return;
    const doc = documents.get(c.uri), before = said.get(c.uri);
    if (doc && doc.version > c.version) return;
    if (before && (before.version > c.version || (before.version === c.version && before.tested && !c.tested))) return;
    said.set(c.uri, { version: c.version, tested: !!c.tested });
    checked.set(c.uri, { version: c.version, text: c.text, paints: c.paints });
    connection.sendDiagnostics({ uri: c.uri, version: c.version, diagnostics: c.diagnostics.map(d => ({ severity: d.severity, range: { start: position_of(c.text, d.begin), end: position_of(c.text, Math.max(d.end, d.begin + 1)) }, message: d.around ? `${d.message}\n${d.around}` : d.message, source: 'ray' })) });
    connection.languages.semanticTokens.refresh();
    connection.sendNotification('ether/theme', payload([c.uri]));
  };
  reader.on('message', heard); tester.on('message', heard);
  reader.on('error', e => connection.console.error(`the reader stopped: ${(e as Error).stack ?? e}`));
  tester.on('error', e => connection.console.error(`the tester stopped: ${(e as Error).stack ?? e}`));
  const open = (uri: string, text: string, version: number) => { for (const w of [reader, tester]) w.postMessage({ open: { uri, file: file_of(uri), text, version } }); };
  connection.onInitialize(() => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Full, semanticTokensProvider: { legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: MODIFIERS }, full: true, range: true } },
    serverInfo: { name: 'ray-language-server', version: env.version.toString() },
  }));
  const tokens = (uri: string, range?: [number, number]) => { const c = checked.get(uri); return { data: c ? encode(documents.get(uri)?.getText() ?? c.text, painted(c.paints), TOKEN_TYPES, range) : [] }; };
  connection.languages.semanticTokens.on(params => tokens(params.textDocument.uri));
  connection.languages.semanticTokens.onRange(params => { const doc = documents.get(params.textDocument.uri); return doc ? tokens(params.textDocument.uri, [doc.offsetAt(params.range.start), doc.offsetAt(params.range.end)]) : tokens(params.textDocument.uri); });
  connection.onRequest('ether/theme', (params: { uris?: string[] }) => payload(params?.uris ?? []));
  connection.onRequest('ether/initialFiles', (): null => null);
  documents.onDidOpen(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidChangeContent(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidClose(e => { for (const w of [reader, tester]) w.postMessage({ close: e.document.uri }); checked.delete(e.document.uri); said.delete(e.document.uri); });
  documents.listen(connection);
  connection.listen();
}

if (env.worker && env.worker_threads.workerData?.lsp) void lsp_worker(env.worker_threads.workerData.lsp === 'test' ? 'test' : 'read');
else if (env.worker && env.worker_threads.workerData?.main) void main(env.worker_threads.workerData.main);
else if (env.is_main_entrypoint) void main();
