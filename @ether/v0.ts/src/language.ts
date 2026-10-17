import { sources } from './bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const EXTENSION = '.ray';
export const ENTRYPOINT = `../../ray/bootstrap/.entrypoint${EXTENSION}3`;
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 4];

export const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { value: false, alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    {             description: 'Debug the kernel: a crash, running out of memory or a runaway says what was being read (memory checked on the js target); a loop or recursion going round without end (the kernel\'s own loops, and the same steps of the language repeating) is said and stopped; --debug=trace says every step (--debug=trace:<file:line> only within the statement or test there), --debug=cost each statement taking long or much memory, --debug=tests each test as it begins.' },
  level:    { value: () => '', description: 'With --build: what the program is compiled to (`Program{O: @wasm.…}`): `default` (its rules\' bodies each a function, and optimized), `none` (each a function calling the runtime, the declarative setup), `kernel` (none: the kernel runs what it read).' },
  build:    { value: () => '', description: 'Read the files, then write the program built as WebAssembly to this file (the kernel, and its memory as read): run it with `ray <file>.wasm`, which runs what was put off (the tests) without reading again.' },
  test:     { alias: 't', description: 'Read the files (else the whole library), then run their tests (what was put off until everything was read).' },
  lsp:      {             description: 'Serve the language server (LSP) over stdio.' },
  verbose:  { alias: 'v', description: 'Say how long reading took, and what was said that is not a warning.' },
  threads:  {             value: () => env.threads, description: 'How many threads to use for interpreting/compiling.' },
  target:   {             value: () => env.target, description: 'Which backend: javascript/wasm.' },
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
  export type Args = [args: string[], kwargs: Record<string, string | true | number | (string | true | number)[]>];

  export interface Option { description?: string; value?: boolean | (() => string | number); optional?: boolean; alias?: string; }
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

const ansi = {
  darkGray:  "\x1b[38;5;240m",
  indianRed: "\x1b[38;5;167m",
  orange:    "\x1b[38;5;208m",
  green:     "\x1b[38;5;34m",
  reset:     "\x1b[0m",
};
// (the line a run ends with: each kind of what was said that was said at all, its count in its colour)
const summary = (errors: number, warnings: number, passed: number) =>
  [[errors, ansi.indianRed, 'ERROR'], [warnings, ansi.orange, 'WARNING'], [passed, ansi.green, 'PASS']]
    .filter(([n]) => n as number > 0).map(([n, colour, kind]) => `${colour}${kind}${ansi.reset} ${ansi.darkGray}(${ansi.reset}${colour}${n}${ansi.reset}${ansi.darkGray})${ansi.reset}`).join(' ') || `${ansi.darkGray}nothing said${ansi.reset}`;

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
  private static _fs_promises: typeof import('fs/promises') | undefined;
  private static _path: typeof import('path') | undefined;
  private static _url: typeof import('url') | undefined;
  private static _os: typeof import('os') | undefined;
  private static _net: typeof import('net') | undefined;
  private static _child_process: typeof import('child_process') | undefined;
  private static _worker_threads: typeof import('worker_threads') | undefined;
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get fs_promises(): typeof import('fs/promises') { return env._fs_promises ??= env.import('fs/promises', env._fs_promises); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }
  static get os(): typeof import('os') { return env._os ??= env.import('os', env._os); }
  static get net(): typeof import('net') { return env._net ??= env.import('net', env._net); }
  static get child_process(): typeof import('child_process') { return env._child_process ??= env.import('child_process', env._child_process); }
  static get worker_threads(): typeof import('worker_threads') { return env._worker_threads ??= env.import('worker_threads', env._worker_threads); }

  static through_tsx = `const { workerData } = await import('node:worker_threads'); (await import(workerData.tsx)).register(); await import(workerData.kernel);`;
  static thread(data: object = {}, variables: Record<string, string> = {}): import('worker_threads').Worker {
    const file = env.transpiled(env.url.fileURLToPath(import.meta.url)), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
    // (a Node without `--experimental-transform-types` (26 on) runs the source through tsx: a thread that registers it, then
    // reads this file)
    if (typescript && !process.allowedNodeEnvironmentFlags.has('--experimental-transform-types')) return new env.worker_threads.Worker(new URL(`data:text/javascript,${encodeURIComponent(env.through_tsx)}`), {
      workerData: { daemon: NAME, ...data, kernel: env.url.pathToFileURL(file).href, tsx: import.meta.resolve('tsx/esm/api') },
      env: { ...process.env, ...variables },
      execArgv: process.execArgv.filter(flag => !flag.startsWith('--stack-size')),
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 192) },
    });
    return new env.worker_threads.Worker(file, {
      workerData: { daemon: NAME, ...data },
      env: { ...process.env, ...variables },
      execArgv: typescript ? [...process.execArgv.filter(flag => !flag.startsWith('--stack-size')), '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 192) },
    });
  }

  // (this file as JavaScript, made once (each thread would otherwise make it again): its types taken out, beside what it
  // imports; the file itself where that can't be done)
  private static _transpiled?: string;
  static transpiled(file: string): string {
    if (env._transpiled || !/\.ts$/.test(file)) return env._transpiled ?? file;
    try {
      const strip = (env.import('module', undefined) as any).stripTypeScriptTypes as ((code: string, options: object) => string) | undefined;
      if (!strip) return env._transpiled = file;
      const stat = env.fs.statSync(file), dir = env.path.join(env.os.tmpdir(), `${NAME.toLowerCase()}-${process.getuid?.() ?? 0}`, `${stat.size}-${Math.floor(stat.mtimeMs)}`);
      const out = env.path.join(dir, env.path.basename(file).replace(/\.ts$/, '.mjs'));
      if (!env.fs.existsSync(out)) {
        // (an older one: no longer this file)
        for (const old of env.fs.existsSync(env.path.dirname(dir)) ? env.fs.readdirSync(env.path.dirname(dir)) : []) env.fs.rmSync(env.path.join(env.path.dirname(dir), old), { recursive: true, force: true });
        env.fs.mkdirSync(dir, { recursive: true });
        // (where it is, as the file it was made from: what it finds beside itself, it finds there)
        const quiet = (source: string) => { const warn = process.emitWarning; process.emitWarning = () => {}; try { return strip(source, { mode: 'transform' }); } finally { process.emitWarning = warn; } };
        const js = (source: string) => quiet(source).replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.mjs$2').replace(/\bimport\.meta\.url\b/g, JSON.stringify(env.url.pathToFileURL(file).href));
        for (const imported of env.fs.readFileSync(file, 'utf-8').matchAll(/from\s+['"]\.\/([^'"]+)\.ts['"]/g)) env.fs.writeFileSync(env.path.join(dir, `${imported[1]}.mjs`), js(env.fs.readFileSync(env.path.join(env.path.dirname(file), `${imported[1]}.ts`), 'utf-8')));
        env.fs.writeFileSync(`${out}.${process.pid}`, js(env.fs.readFileSync(file, 'utf-8')));
        env.fs.renameSync(`${out}.${process.pid}`, out);
      }
      return env._transpiled = out;
    } catch { return env._transpiled = file; }
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

  static get sources(): Record<string, string> { return sources ?? {}; }
  static get manifest(): string[] { return Object.keys(sources); }

  static get version() { return Version.create(version[0], version[1], version[2]) }

  static wasm(module: WebAssembly.Module, { memory }: { memory: number }): { exports: Record<string, (...args: number[]) => number>, memory: WebAssembly.Memory } {
    if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly is not supported in this environment.');
    if (this.worker_threads.workerData?.env?.wasm) return this.worker_threads.workerData?.env?.wasm;

    const pages = Math.max(1, Math.ceil(memory / 65536));
    const m = new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true })
    return {
      exports: new WebAssembly.Instance(module, { m: { m } }).exports as Record<string, (...args: number[]) => number>,
      memory: m,
    }
  }
  // (the wasm backend's memory is shared, so it needs SharedArrayBuffer too)
  static get target(): 'wasm' | 'js' { return typeof WebAssembly === 'undefined' || typeof SharedArrayBuffer === 'undefined' ? 'js' : 'wasm'; }

  static get parallel(): boolean {
    if (typeof SharedArrayBuffer === "undefined") return false;

    try {
      const buffer = new SharedArrayBuffer(8, { maxByteLength: 16 });

      if (!buffer.growable || typeof buffer.grow !== "function") return false;
    } catch {
      return false;
    }

    return this.threads > 1;
  }
  // (at most 8: past that the threads wait on each other more than they work, and each holds what its test needs at once)
  static get threads() { return Math.min(8, env.nodejs ? env.os.availableParallelism() : navigator.hardwareConcurrency ?? 1); }
  static Worker(workerData = {}) {
    if (env.nodejs) {
      const worker = env.thread(workerData);
      return { postMessage(message: any) { worker.postMessage(message) }, onMessage(callback: (message: any) => void) { worker.on("message", callback); }, terminate() { void worker.terminate(); } }
    }

    const worker = new Worker(new URL(import.meta.url), {
      type: "module",
      name: `${NAME} worker`,
    });
    return { postMessage(message: any) { worker.postMessage(message) }, onMessage(callback: (message: any) => void) { worker.addEventListener('message', (event: any) => callback(event.data)); }, terminate() { worker.terminate(); } }
  }
}

export namespace Global {
  export abstract class Node {
    abstract source: Source
  }
  export abstract class Source {
    location: string
    constructor(public relative_location?: string) { if (relative_location !== undefined) this.location = env.nodejs ? env.path.resolve(process.cwd(), relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>
    abstract reload(): Promise<void>
    abstract is_language_entrypoint: boolean

    get dir() { return this.location.slice(0, this.location.lastIndexOf('/')); }
  }
}
export namespace Text {
  export class Source extends Global.Source {
    static async *all(relative_location: string): AsyncGenerator<Text.Source> {
      if (env.manifest.length > 0) {
        for (const path of env.manifest) {
          if (path.startsWith(relative_location.endsWith('/') ? relative_location : relative_location + '/'))
            yield new Text.Source(path);
        }
      } else if (env.nodejs) {
        const location = env.path.resolve(process.cwd(), relative_location);

        const stat = await env.fs_promises.stat(location);
        if (stat.isDirectory()) {
          async function* all(location: string): AsyncGenerator<Text.Source> {
            for (const entry of await env.fs_promises.readdir(location, { withFileTypes: true })) {
              const path = env.path.resolve(location, entry.name);

              // (not what is kept beside a library: hidden directories, packages)
              if (entry.isDirectory()) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                yield *all(path);
              } else if (entry.isFile()) {
                if (path.endsWith(EXTENSION))
                  yield new Text.Source(env.path.relative(process.cwd(), path));
              }
            }
          }

          yield *all(location);
        } else if (stat.isFile()) {
          if (relative_location.endsWith(EXTENSION))
            yield new Text.Source(relative_location);
        }
      } else {
        throw new Error('Cannot iterate directories over HTTP.');
      }
    }

    private _value: Uint8Array; get value(): Uint8Array { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = new TextEncoder().encode(value); }
    get loaded(): boolean { return this._value !== undefined; }

    async is_directory(): Promise<boolean> {
      if (!this.relative_location) return false;
      if (env.manifest.length > 0) { const dir = this.relative_location.replace(/\/?$/, '/'); return env.manifest.some(path => path.startsWith(dir)); }
      if (!env.nodejs) return false;
      try { return (await env.fs_promises.stat(this.location)).isDirectory(); } catch { return false; }
    }
    get is_language_entrypoint(): boolean { 
      if (!this.loaded) return false;
      const value = new TextDecoder().decode(this.value);
      const end = value.indexOf('\n'); const first_line = end < 0 ? value : value.slice(0, end);
      return first_line.includes('!language'); 
    }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      await this.reload();
    }
    async reload(): Promise<void> {
      this.value = env.sources[this.relative_location] 
        ? env.sources[this.relative_location] // Try bundled first
        : env.nodejs
          ? await env.fs.promises.readFile(this.location, 'utf-8')
          : await (await fetch(new URL(this.location))).text()
    }
  }
}

let [args, kwargs]: CLI.Args = CLI.args()

export async function main() {
  if (kwargs.version) return console.log(env.version.toString());
  if (kwargs.help) { console.log(CLI.help()); return; }
  if (kwargs.lsp) return await lsp();
  // (asked nothing: the help; given no files: the language itself, its entrypoint's directory)
  if (args.length === 0 && Object.keys(kwargs).length === 0) { console.log(CLI.help()); return; }
  // (a program built, `ray out.wasm`: its memory set out as it was read, what was put off run, what was said said)
  if (args[0]?.endsWith('.wasm') && env.nodejs) return run_built(args[0]);
  // Run the main program on a worker with a larger stack.
  if (!env.worker && env.nodejs) {
    const worker = env.thread({ main: [args, kwargs] });

    process.exitCode = await new Promise<number>((resolve) => {
      worker.on("message", (m: { exit?: number }) => {
        if (m.exit !== undefined)
          resolve(m.exit);
      });

      worker.on("error", (e: Error) => {
        console.error(e);
        resolve(1);
      });

      worker.on("exit", (code: number) => resolve(code));
    });

    return;
  }

  // (read before, every file the same as then and the kernel too: what was read, from disk, and its tests run on it)
  const cache = env.nodejs && !process.env.RAY_NOCACHE && !kwargs.build && !kwargs.write && (!kwargs.debug || process.env.RAY_CACHE_DEBUG) && !kwargs.lsp ? Cache.of(args) : undefined;
  // (what is still as it was: the steps of reading before the first file that changed, put back before any thread starts)
  const kept = cache ? cache.valid() : 0, steps = cache ? cache.steps.length : 0;
  if (cache) { process.env.RAY_SAID_DIR = cache.dir; if (kept) Program.preload = (values) => cache.restore(values, kept); }
  const language = new Program(args.length > 0 ? new Text.Source(args[0]) : undefined,)
    .abstract(!!kwargs.abstract)
    .target(String(kwargs.target ?? env.target))
    .parallel(Math.max(1, Number(kwargs.threads ?? env.threads)));

  let localRunner: Promise<void> | undefined;

  try {
    const start = performance.now();
    if (typeof process !== 'undefined' && process.env.RAY_TIMES) console.error(`TIMES start at ${start.toFixed(1)} ms`);

    // If no workers were created, consume tasks on this thread.
    if (language.workers.length === 0) {
      localRunner = language.queue.run(async (id) => {
        await Program.frontend.compile(language.files, id);
      });

      // A persistent runner stops when language.close() stops the queue.
      // (one that fails, the kernel not compiling: said, and the run ends; what waits on the queue would wait forever)
      void localRunner.catch((error) => {
        if (out_of_memory(error)) process.exit(1);
        console.error("Local queue failed:", error);
        process.exit(1);
      });
    }

    // (read before, every file the same as then and the kernel too: in memory again as it was, not read)

    if (cache) cache.attach(language, kept);
    if (kept && kwargs.verbose) say(`${ansi.darkGray}CACHED ${kept} of ${steps} steps of reading, as they were (${cache!.dir})${ansi.reset}`);
    // Register the entrypoint and all explicitly supplied files.
    if (!kept) { cache?.begin(0); await language[".entrypoint"](); await language.queue.join(); cache?.step(language, 0, 0); }
    const loaded = performance.now();

    // What the language asks to read (its own files, then what it was given), read.
    await language.reads(args.slice(1), kept ? cache!.steps[kept - 1].handled : 0, cache ? (handled) => { const i = cache.steps.length; cache.step(language, i, handled); cache.begin(i + 1); } : undefined, cache ? () => cache.begin(cache.steps.length) : undefined);
    const read = performance.now();
    // (`--write=out.wasm --value=name`: what a name answers, a list of numbers, written as bytes (the host writes them))
    if (kwargs.write) {
      const heap = language.files.buffer.values.heap, ray = Program.frontend as unknown as Ray; ray.init(heap);
      const bytes = ray.bytes_of(String(kwargs.value ?? 'output'));
      env.fs.writeFileSync(String(kwargs.write), bytes);
      say(`${ansi.green}WROTE${ansi.reset} ${kwargs.write} ${ansi.darkGray}(${bytes.length} bytes, what ${kwargs.value ?? 'output'} answers)${ansi.reset}`);
      return;
    }
    // (`--build`: the program as read, built, written; nothing run)
    if (kwargs.build) {
      Ray.ordered(language.files);
      const heap = language.files.buffer.values.heap, u8 = new Uint8Array(heap.buffer), i32 = new Int32Array(heap.buffer), pages = heap.buffer.byteLength / 65536;
      const ray = Program.frontend as unknown as Ray; ray.init(heap); ray.prepared();
      // (at a level: `none`, each rule's body a function calling the runtime; `default` (`@wasm`), and optimized; `kernel`,
      // the kernel alone running what it read)
      const level = String(kwargs.level ?? 'default'), rules = level === 'kernel' ? [] : ray.bodied();
      rules.forEach((r, k) => { i32[(r + R.FN) >> 2] = k + 1; });
      const program = rules.length ? compiled_module(i32, pages, rules, (bd, s, n) => ray.x.labelled(bd, s, n), level) : undefined;
      const paths = Array.from({ length: language.files.count }, (_, id) => language.files.getPath(id));
      const out = built(Ray.program(0), pages, u8, Atomics.load(i32, HEAP >> 2), { memory: heap.buffer.byteLength, paths, named: ray.named(), level, compiled: rules.length }, program);
      env.fs.writeFileSync(String(kwargs.build), out);
      say(`${ansi.green}BUILT${ansi.reset} ${kwargs.build} ${ansi.darkGray}(${(out.length / 1048576).toFixed(1)} MB, read in ${(read - loaded).toFixed(0)} ms, ${rules.length} rules compiled at ${level}, ${compiled_module.direct} statements applied directly)${ansi.reset}`);
      return;
    }

    // (and kept: what was read, for the next run with every file the same)
    // (what is said from here on is the tests': not kept)
    Atomics.store(new Int32Array(language.files.buffer.values.heap.buffer), 356 >> 2, 1);
    // Then the tests, on every thread (each takes them from the queue the kernel keeps while there are any); and, all done,
    // what was said, once.
    Ray.ordered(language.files);
    if (kwargs.debug || process.env.RAY_MEM) { const i32 = new Int32Array(language.files.buffer.values.heap.buffer); say(`${ansi.darkGray}MEMORY ${(Atomics.load(i32, HEAP >> 2) / 1048576).toFixed(0)} MB used when read${ansi.reset}`); }
    // (what is said is printed as it is said, by the thread saying it; the host here, the totals)
    const host = new Ray();
    host.init(language.files.buffer.values.heap); host.files_ = language.files;
    host.listen();
    // (`RAY_NOTESTS=1`: read, not tested)
    if (!process.env.RAY_NOTESTS) { await language.queue.submit(Array(Math.max(1, language.workers.length)).fill(TESTS)); await language.queue.join(); }
    const tested = performance.now();
    host.listen();
    const errors = Atomics.load(host.i32, 336 >> 2), warnings = Atomics.load(host.i32, 340 >> 2);
    // (`--debug`: what the kernel counted)
    if (kwargs.debug) say(`${ansi.darkGray}COUNTED ${host.counted()}${ansi.reset}`);
    // (`--debug`: the memory the run took, of what it has)
    if (kwargs.debug || process.env.RAY_MEM) say(`${ansi.darkGray}MEMORY ${(Atomics.load(host.i32, HEAP >> 2) / 1048576).toFixed(0)} MB used of ${(host.u8.length / 1048576).toFixed(0)} MB${ansi.reset}`);
    say(summary(errors, warnings, host.w(PASSED)));

    if (kwargs.verbose) {
      const loc = (() => {
        let lines = 0;

        for (let id = 0; id < language.files.count; id++) {
          const bytes = language.files.getBytes(id);

          for (let i = 0; i < bytes.length; i++)
            if (bytes[i] === 10) lines++;

          if (bytes.length > 0 && bytes[bytes.length - 1] !== 10)
            lines++;
        }

        return lines;
      })();

      console.error(
        `#${language.files.count || 1} @ ${(loc / 1000).toFixed(1)}k LOC ` +
        `(--threads ${language.workers.length || 1}, ${String(kwargs.target ?? env.target)}) ` +
        `LOAD ${(loaded - start).toFixed(1)} ms ` +
        `READ ${(read - loaded).toFixed(1)} ms (${(loc / (read - loaded)).toFixed(1)}k/s) ` +
        `TEST ${(tested - read).toFixed(1)} ms`,
      );
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    language.close();
  }

  if (env.worker && env.nodejs) {
    env.worker_threads.parentPort!.postMessage({
      exit: process.exitCode ?? 0,
    });
  }
}
// What was read, kept on disk (in `~/.cache/ray`, the latest command and kernel only): its files, each by what it held then; one
// of them changed (edited), read again and kept again.
class Cache {
  static readonly BUFFERS = ['source', 'metadata', 'paths', 'index', 'fileState'] as const;
  static readonly PAGE = 1 << 14;
  steps: { files: [string, string][], handled: number, end: number, sizes: number[] }[] = [];
  private previous?: Uint8Array; private known = 0; private files = 0; private language?: Program;
  constructor(readonly dir: string, readonly key: string) {}
  static hash(bytes: Uint8Array | string) { return (env.import('crypto') as typeof import('crypto')).createHash('sha1').update(bytes).digest('hex'); }
  static of(args: string[]) {
    const me = env.url.fileURLToPath(import.meta.url), map = env.url.fileURLToPath(new URL('./wasm.o.ray', import.meta.url));
    const kernel = Cache.hash(env.fs.readFileSync(me)) + (env.fs.existsSync(map) ? Cache.hash(env.fs.readFileSync(map)) : '');
    const read_with = Object.fromEntries(Object.entries(kwargs).filter(([k]) => k !== 'threads' && k !== 'verbose'));
    // (one entry: of another command or kernel, its steps not kept (their files written over))
    const cache = new Cache(env.path.join(env.os.homedir(), '.cache', 'ray'), Cache.hash(JSON.stringify([process.cwd(), args, read_with, kernel])));
    try { const kept = JSON.parse(env.fs.readFileSync(env.path.join(cache.dir, 'steps.json'), 'utf8')); cache.steps = kept.key === cache.key ? kept.steps : []; } catch { cache.steps = []; }
    return cache;
  }
  private at(name: string) { return env.path.join(this.dir, name); }
  // (how many steps, from the first, read only files that are as they were)
  valid(): number {
    let k = 0;
    for (const step of this.steps) {
      if (!step.files.every(([at, hash]) => env.fs.existsSync(at) && Cache.hash(env.fs.readFileSync(at)) === hash) || !env.fs.existsSync(this.at(`step-${k}.pages`))) break;
      k++;
    }
    return k;
  }
  // (memory as it was after the first k steps: each step's pages, in order; the host's of the files as after the last; what each said)
  restore(values: MemoryLayout, k: number) {
    const u8 = new Uint8Array(values.heap.buffer);
    for (let i = 0; i < k; i++) {
      const pages = env.fs.readFileSync(this.at(`step-${i}.pages`)), view = new DataView(pages.buffer, pages.byteOffset, pages.byteLength);
      for (let at = 0; at < pages.length; at += 4 + Cache.PAGE) u8.set(pages.subarray(at + 4, at + 4 + Cache.PAGE), view.getUint32(at, true) * Cache.PAGE);
      const said = this.at(`said-${i}.txt`); if (env.fs.existsSync(said)) env.fs.writeSync(1, env.fs.readFileSync(said));
    }
    const step = this.steps[k - 1], buffers = env.fs.readFileSync(this.at(`step-${k - 1}.buffers`));
    let from = 0;
    Cache.BUFFERS.forEach((name, i) => { const m = values[name] as Parallel.Memory; m.ensureCapacity(step.sizes[i]); new Uint8Array(m.buffer as ArrayBuffer, 0, step.sizes[i]).set(buffers.subarray(from, from + step.sizes[i])); from += step.sizes[i]; });
  }
  // (from here: what memory is now, to tell what each step after changes)
  attach(language: Program, k: number) {
    this.language = language; this.steps = this.steps.slice(0, k);
    for (const f of env.fs.existsSync(this.dir) ? env.fs.readdirSync(this.dir) : []) { const m = /^(?:step|said)-(\d+)\./.exec(f); if (m && Number(m[1]) >= k) env.fs.rmSync(this.at(f), { force: true }); }
    env.fs.mkdirSync(this.dir, { recursive: true });
    const heap = new Uint8Array(language.files.buffer.values.heap.buffer);
    this.previous = new Uint8Array(heap.length);
    this.known = k ? this.steps[k - 1].end : 0;
    this.previous.set(heap.subarray(0, this.known));
    this.files = language.files.count;
  }
  // (what is said from here on, said in step i)
  begin(i: number) { if (this.language) Atomics.store(new Int32Array(this.language.files.buffer.values.heap.buffer), 360 >> 2, i); }
  // (step i read: the pages it changed, the host's of the files, the files it read and what they held)
  step(language: Program, i: number, handled: number) {
    try {
      const values = language.files.buffer.values, heap = new Uint8Array(values.heap.buffer), h32 = new Int32Array(values.heap.buffer);
      const end = Atomics.load(h32, HEAP >> 2), prev = this.previous!, p32 = new Int32Array(prev.buffer), P = Cache.PAGE, W = P >> 2;
      const changed: number[] = [];
      for (let page = 0; page * P < end; page++) {
        if (page * P >= this.known) { changed.push(page); continue; }
        for (let w = page * W, z = w + W; w < z; w++) if (h32[w] !== p32[w]) { changed.push(page); break; }
      }
      const out = new Uint8Array(changed.length * (4 + P)), view = new DataView(out.buffer);
      changed.forEach((page, k) => { view.setUint32(k * (4 + P), page, true); out.set(heap.subarray(page * P, page * P + P), k * (4 + P) + 4); prev.set(heap.subarray(page * P, page * P + P), page * P); });
      this.known = end;
      env.fs.writeFileSync(this.at(`step-${i}.pages`), out);
      const sizes = Cache.BUFFERS.map(k => (values[k] as Parallel.Memory).byteLength), buffers = new Uint8Array(sizes.reduce((a, b) => a + b, 0));
      let from = 0; Cache.BUFFERS.forEach((k, j) => { buffers.set(new Uint8Array((values[k] as Parallel.Memory).buffer as ArrayBuffer, 0, sizes[j]), from); from += sizes[j]; });
      env.fs.writeFileSync(this.at(`step-${i}.buffers`), buffers);
      const files: [string, string][] = [];
      for (let id = this.files; id < language.files.count; id++) { const at = language.files.getPath(id); if (typeof at === 'string' && env.fs.existsSync(at)) files.push([at, Cache.hash(env.fs.readFileSync(at))]); }
      this.files = language.files.count;
      this.steps[i] = { files, handled, end, sizes };
      env.fs.writeFileSync(this.at('steps.json'), JSON.stringify({ key: this.key, steps: this.steps }));
    } catch (error) { say(`${ansi.orange}WARNING${ansi.reset} what was read was not kept: ${(error as Error).message}`); }
  }
}
export function run_built(path: string) {
  const bytes = env.fs.readFileSync(path), module = new WebAssembly.Module(bytes);
  const section = (name: string) => new Uint8Array(WebAssembly.Module.customSections(module, name)[0]);
  const meta = JSON.parse(new TextDecoder().decode(section('ray'))) as { memory: number, paths: string[], named: string[] };
  const heap = memory(meta.memory), u8 = new Uint8Array(heap.buffer), image = new Uint8Array(process.getBuiltinModule('zlib').inflateRawSync(section('ray.image.z'))), view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  for (let at = 0; at < image.length;) { const to = view.getUint32(at, true), n = view.getUint32(at + 4, true); u8.set(image.subarray(at + 8, at + 8 + n), to); at += 8 + n; }
  const ray = new Ray(); ray.prebuilt = module; ray.init(heap); ray.files_ = { getPath: (id: number) => meta.paths[id] } as unknown as FileStore; ray.name(meta.named);
  // (the program compiled: its functions, on this kernel)
  const program = WebAssembly.Module.customSections(module, 'ray.program')[0];
  if (program) {
    const k = ray.x, imports = { k: Object.fromEntries(['ev', 'latest', 'making', 'reading', 'owned', 'again', 'defer', 'go', 'word', 'exec', 'labelled', 'apply', 'could'].map(n => [n, k[n]])), m: { memory: heap } };
    const ex = new WebAssembly.Instance(new WebAssembly.Module(program), imports).exports as Record<string, (t: number, f: number, from: number) => number>;
    ray.compiled_ = Array.from({ length: (meta as { compiled?: number }).compiled ?? 0 }, (_, i) => ex[`r${i + 1}`]);
    // (`--verbose`: how often each ran)
    if (kwargs.verbose) { const counts = new Int32Array(ray.compiled_.length); ray.compiled_ = ray.compiled_.map((fn, i) => (t: number, f: number, from: number) => (counts[i]++, fn(t, f, from))); process.on('exit', () => console.error(`COMPILED ${counts.reduce((a, b) => a + b, 0)} calls of ${counts.filter(x => x).length} of ${counts.length} compiled rules`)); }
  }
  // (built again, from itself: what it holds compiled at the level asked, `ray none.wasm --build=x.wasm --level=default`)
  if (kwargs.build) {
    const i32 = new Int32Array(heap.buffer), level = String(kwargs.level ?? 'default'), rules = level === 'kernel' ? [] : ray.bodied();
    rules.forEach((r, k) => { i32[(r + R.FN) >> 2] = k + 1; });
    const pages = heap.buffer.byteLength / 65536, program = rules.length ? compiled_module(i32, pages, rules, (bd, s, n) => ray.x.labelled(bd, s, n), level) : undefined;
    const out = built(Ray.program(0), pages, u8, Atomics.load(i32, HEAP >> 2), { ...meta, level, compiled: rules.length }, program);
    env.fs.writeFileSync(String(kwargs.build), out);
    say(`${ansi.green}BUILT${ansi.reset} ${kwargs.build} ${ansi.darkGray}(${(out.length / 1048576).toFixed(1)} MB, from ${path}, ${rules.length} rules compiled at ${level})${ansi.reset}`);
    return;
  }
  const start = performance.now();
  ray.tests();
  ray.listen();
  const errors = Atomics.load(ray.i32, 336 >> 2), warnings = Atomics.load(ray.i32, 340 >> 2);
  say(summary(errors, warnings, ray.w(PASSED)));
  if (kwargs.verbose) console.error(`TEST ${(performance.now() - start).toFixed(1)} ms`);
}
export async function entrypoint() {
  function thread(
    message: {
      buffers: Record<string, unknown>;
      target: string;
    },
    ready: () => void,
  ): void {
    if (!message?.buffers) {
      throw new Error("Worker initialization failed: buffers were not provided.");
    }

    for (const [key, module] of (message as { modules?: [string, WebAssembly.Module][] }).modules ?? []) Wasm.compiled.set(key, module);
    const raw = message.buffers as Record<string, unknown>;
    const values: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (
        value instanceof ArrayBuffer ||
        (typeof SharedArrayBuffer !== "undefined" &&
          value instanceof SharedArrayBuffer)
      ) {
        values[key] = new Parallel.Memory(
          value.byteLength,
          true,
          1 << 30,
          value,
        );
      } else {
        values[key] = value;
      }
    }

    const buffer = new Parallel.Buffer<MemoryLayout>(
      values as unknown as MemoryLayout,
    );

    const files = new FileStore(buffer);
    const queueMemory = buffer.values.queue;

    const queue = new Parallel.Queue(
      buffer.values.queueCapacity,
      true,
      queueMemory.buffer,
    );

    // (the kernel compiled for this thread before any work: a thread is ready when it can run)
    (Program.frontend as Ray).init(buffer.values.heap);
    ready();

    void queue.run(async (id: number) => {
      await Program.frontend.compile(files, id);
    }).catch((error) => {
      // (one thread failed: what the others wait on never comes; the run ends, said as failed (written at once: a thread's
      // console is the main thread's, later), rather than waiting forever)
      if (out_of_memory(error)) process.kill(process.pid, 'SIGTERM');
      if (env.nodejs) { env.fs.writeSync(2, `Worker queue failed: ${(error as Error)?.stack ?? error}\nERROR   a thread of the kernel crashed (above); the run is stopped\n`); process.kill(process.pid, 'SIGTERM'); }
      else console.error("Worker queue failed:", error);
    });
}
  if (env.nodejs && env.worker && env.worker_threads.workerData?.thread === NAME) {
    args = env.worker_threads.workerData.main[0];
    kwargs = env.worker_threads.workerData.main[1];
    
    const parent = env.worker_threads.parentPort!;

    parent.once("message", (message: { buffers: Record<string, unknown>; target: string; }) => {
      thread(message, () => parent.postMessage("ready"));
    });
  } else if (!env.nodejs && env.scope === "worker") {
    (globalThis as any).addEventListener("message", (event: any) => {
        thread(event.data, () => {
          (globalThis as any).postMessage("ready");
        });
    }, { once: true });
  } else if (env.nodejs && env.worker && env.worker_threads.workerData?.main) {
    args = env.worker_threads.workerData.main[0];
    kwargs = env.worker_threads.workerData.main[1];
    void main();
  } else if (env.is_main_entrypoint) {
    void main();
  }
}
// The language server over stdio: JSON-RPC, each message after a `Content-Length` header. A document, as it changes, is read
// (with the language read first: from the editor when it is open there), its tests run; what was said is sent as diagnostics,
// what was painted as semantic tokens and on the theme channel (`ether/theme`), with the language's theme.
export async function lsp(io: { input: NodeJS.ReadableStream, output: NodeJS.WritableStream } = { input: process.stdin, output: process.stdout }): Promise<void> {
  const send = (message: object) => { const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8'); io.output.write(`Content-Length: ${body.length}\r\n\r\n`); io.output.write(body); };
  const notify = (method: string, params: unknown) => send({ method, params });
  const log = (message: string) => notify('window/logMessage', { type: 4, message });
  const language = args[0] && env.fs.existsSync(env.path.join(args[0], `.entrypoint${EXTENSION}3`)) ? env.path.join(args[0], `.entrypoint${EXTENSION}3`) : env.url.fileURLToPath(new URL(ENTRYPOINT, import.meta.url));
  const file_of = (uri: string): string => { try { return env.url.fileURLToPath(uri); } catch { return uri; } };
  const documents = new Map<string, { text: string, version: number }>();
  const checked = new Map<string, { version: number, text: string, paints: Paint[] }>();
  let shown: { name: string, colors: Record<string, string> } | undefined, refreshes = false, asked = 0, scheduled: ReturnType<typeof setTimeout> | undefined;
  const dirty = new Set<string>();
  const check = (uri: string) => {
    const doc = documents.get(uri); if (!doc) return;
    const t0 = performance.now(), file = file_of(uri), ray = new Ray(), encoder = new TextEncoder();
    // (as much memory as a run of the library on one thread needs, with room: 1 GB)
    Ray.printing = false; ray.init(env.target === 'wasm' ? memory(Ray.LSP_MEMORY) : new Parallel.Memory(Ray.LSP_MEMORY, false, Ray.LSP_MEMORY));
    const entry = [...documents].find(([u]) => file_of(u) === language)?.[1].text ?? env.fs.readFileSync(language, 'utf-8');
    let [s, e] = ray.file(encoder.encode(file === language ? doc.text : entry), language);
    // (another document: the language's own tests not run; what the language includes read (open documents as the editor has
    // them), the document among them where it is one, else after them, on its own)
    if (file !== language) {
      ray.untested();
      const texts = new Map([...documents].map(([u, d]) => [file_of(u), d.text] as [string, string]));
      const spans = ray.included([], false, texts);
      [s, e] = spans.get(file) ?? ray.alone(encoder.encode(doc.text), file);
    } else ray.included();
    ray.tests();
    // (offsets in the text the editor has: bytes to characters)
    const bytes = encoder.encode(doc.text), at = new Int32Array(bytes.length + 1);
    for (let i = 0, c = 0; i <= bytes.length; i++) { at[i] = c; if (i < bytes.length && (bytes[i] & 0xC0) !== 0x80) c += bytes[i] >= 0xF0 ? 2 : 1; }
    const char = (b: number) => at[Math.max(0, Math.min(bytes.length, b))];
    const paints = ray.paints(s, e).map(p => ({ begin: char(p.begin), end: char(p.end), style: p.style }));
    // (and what is said of no place, out of memory: at the document's start, so no reading fails unseen)
    const outside = (x: number, message: string) => !(x >= s && x <= e) && (x === 0 || message.startsWith('out of memory') || message.startsWith('the kernel said more'));
    const diagnostics = ray.listen().filter(([x, message]) => (x >= s && x <= e) || outside(x, message)).map(([x, message]) => { const o = outside(x, message) ? 0 : char(x - s); return { severity: 1, range: { start: position_of(doc.text, o), end: position_of(doc.text, o + 1) }, message, source: 'ray' }; });
    shown = ray.theme() ?? shown;
    checked.set(uri, { version: doc.version, text: doc.text, paints });
    notify('textDocument/publishDiagnostics', { uri, version: doc.version, diagnostics });
    if (refreshes) send({ id: `refresh${++asked}`, method: 'workspace/semanticTokens/refresh' });
    notify('ether/theme', payload([uri]));
    log(`read ${env.path.basename(file)} v${doc.version} in ${Math.round(performance.now() - t0)} ms: ${diagnostics.length} said`);
  };
  const work = () => { scheduled = undefined; for (const uri of [...dirty]) { dirty.delete(uri); try { check(uri); } catch (x) { log(`reading ${uri} failed: ${(x as Error).stack ?? x}`); } } };
  const payload = (uris: string[]) => {
    const docs = uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, c.paints) }] : []; });
    const styles: Record<string, { color: string }> = {};
    if (shown) {
      const table = new Map(Object.entries(shown.colors));
      for (const [name] of table) { const color = shown_as(table, name); if (color) styles[name] = { color }; }
      for (const doc of docs) for (const { style } of doc.ranges) if (!styles[style]) { const color = shown_as(table, style); if (color) styles[style] = { color }; }
    }
    return { styles, documents: docs };
  };
  const open = (uri: string, text: string, version: number) => {
    documents.set(uri, { text, version }); dirty.add(uri);
    // (the language changed: every document is read again)
    if (file_of(uri) === language) for (const other of documents.keys()) dirty.add(other);
    if (scheduled === undefined) scheduled = setTimeout(work, Number(process.env.RAY_LSP_DELAY ?? 100));
  };
  const tokens = (uri: string, range?: [number, number]) => { const c = checked.get(uri); return { data: c ? encode(documents.get(uri)?.text ?? c.text, c.paints, TOKEN_TYPES, range) : [] }; };
  type Params = Record<string, any>;
  const requests: Record<string, (params: Params) => unknown> = {
    'initialize': params => {
      refreshes = !!params?.capabilities?.workspace?.semanticTokens?.refreshSupport;
      return { capabilities: { textDocumentSync: 1, semanticTokensProvider: { legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: MODIFIERS }, full: true, range: true } }, serverInfo: { name: 'ray-language-server', version: env.version.toString() } };
    },
    'shutdown': () => null,
    'textDocument/semanticTokens/full': params => tokens(params.textDocument.uri),
    'textDocument/semanticTokens/range': params => {
      const doc = documents.get(params.textDocument.uri), { start, end } = params.range;
      return doc ? tokens(params.textDocument.uri, [offset_at(doc.text, start.line, start.character), offset_at(doc.text, end.line, end.character)]) : tokens(params.textDocument.uri);
    },
    'ether/theme': params => payload(params?.uris ?? []),
    'ether/initialFiles': () => null,
  };
  const notifications: Record<string, (params: Params) => void> = {
    'exit': () => process.exit(0),
    'textDocument/didOpen': ({ textDocument: d }) => open(d.uri, d.text, d.version),
    'textDocument/didChange': ({ textDocument: d, contentChanges }) => open(d.uri, contentChanges[contentChanges.length - 1].text, d.version),
    'textDocument/didClose': ({ textDocument: d }) => { documents.delete(d.uri); checked.delete(d.uri); },
  };
  const received = (m: { id?: number | string, method?: string, params?: Params }) => {
    if (m.method === undefined) return;   // (an answer to what was asked: nothing waits for it)
    if (m.id === undefined) { try { notifications[m.method]?.(m.params ?? {}); } catch (e) { log(`${m.method} failed: ${(e as Error).stack ?? e}`); } return; }
    const handle = requests[m.method];
    if (!handle) return send({ id: m.id, error: { code: -32601, message: `no method '${m.method}'` } });
    try { send({ id: m.id, result: handle(m.params ?? {}) ?? null }); }
    catch (e) { send({ id: m.id, error: { code: -32603, message: String((e as Error).message ?? e) } }); }
  };
  let pending = Buffer.alloc(0);
  io.input.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const header = pending.indexOf('\r\n\r\n');
      if (header < 0) return;
      const length = Number(/Content-Length: *(\d+)/i.exec(pending.subarray(0, header).toString('ascii'))?.[1]);
      if (pending.length < header + 4 + length) return;
      const body = pending.subarray(header + 4, header + 4 + length).toString('utf8');
      pending = pending.subarray(header + 4 + length);
      try { received(JSON.parse(body)); } catch (e) { log(`a message could not be read: ${(e as Error).message}`); }
    }
  });
}

// What a document is painted as, for the editor: each span's style (`begin`/`end` inclusive), as semantic tokens (delta-encoded,
// against the styles the editor is told of), and as styled runs (the theme channel). Spans overlap: per character the smaller wins.
type Paint = { begin: number, end: number, style: string };
export const TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];
export const MODIFIERS = ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'];
// What a style is shown as in a theme's table: followed through the styles it names to a colour; one the table does not name is
// shown as the one before its last `.`.
export function shown_as(table: Map<string, string>, name: string, seen = new Set<string>()): string | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const next = table.get(name);
  if (next !== undefined) return /^#[0-9A-Fa-f]{3,8}$/.test(next) ? next : shown_as(table, next, seen);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? shown_as(table, name.slice(0, dot), seen) : undefined;
}
export function position_of(text: string, offset: number): { line: number, character: number } {
  let line = 0, start = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) if (text[i] === '\n') { line++; start = i + 1; }
  return { line, character: end - start };
}
export function offset_at(text: string, line: number, character: number): number {
  let offset = 0;
  for (let i = 0; i < line; i++) { const nl = text.indexOf('\n', offset); if (nl === -1) return text.length; offset = nl + 1; }
  return Math.min(offset + character, text.length);
}
export function encode(text: string, painted: Paint[], groups: string[], range?: [number, number]): number[] {
  const types = new Map(groups.map((g, i) => [g, i] as const)), bits = new Map(MODIFIERS.map((m, i) => [m, i] as const));
  const cells = new Int32Array(text.length).fill(-1);
  const spans = painted.filter(p => types.has(p.style.split('.')[0]) && !(range && (p.end + 1 <= range[0] || p.begin >= range[1]))).sort((a, b) => (b.end - b.begin) - (a.end - a.begin));
  for (const p of spans) {
    const path = p.style.split('.');
    let cell = types.get(path[0])! << 10;
    for (const m of path.slice(1)) { const b = bits.get(m); if (b !== undefined) cell |= 1 << b; }
    for (let k = Math.max(p.begin, 0); k <= Math.min(p.end, text.length - 1); k++) cells[k] = cell;
  }
  const data: number[] = [];
  let pl = 0, pc = 0, line = 0, col = 0, start = 0, run = -1;
  const flush = () => { if (run < 0) return; data.push(line - pl, line === pl ? start - pc : start, col - start, run >> 10, run & 1023); pl = line; pc = start; run = -1; };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { flush(); line++; col = 0; continue; }
    if (cells[i] !== run) { flush(); start = col; run = cells[i]; }
    col++;
  }
  flush();
  return data;
}
type Run = { style: string, range: { start: { line: number, character: number }, end: { line: number, character: number } } };
export function runs(text: string, painted: Paint[]): Run[] {
  const cells: (string | undefined)[] = new Array(text.length).fill(undefined);
  for (const p of painted.filter(p => p.style).sort((a, b) => (b.end - b.begin) - (a.end - a.begin)))
    for (let k = Math.max(p.begin, 0); k <= Math.min(p.end, text.length - 1); k++) cells[k] = p.style;
  const out: Run[] = [];
  let line = 0, col = 0, start = 0, run: string | undefined;
  const flush = () => { if (run !== undefined && col > start) out.push({ style: run, range: { start: { line, character: start }, end: { line, character: col } } }); run = undefined; };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { flush(); line++; col = 0; start = 0; continue; }
    if (cells[i] !== run) { flush(); run = cells[i]; start = col; }
    col++;
  }
  flush();
  return out;
}

export type BufferLike = ArrayBuffer | SharedArrayBuffer;

const enum QueueState {
  HEAD = 0,
  TAIL = 1,
  COUNT = 2,
  PENDING = 3,
  STOP = 4,
  LOCK = 5,
  SIZE = 6,
}

export const FileState = {
  LOCK: 0,
  COUNT: 1,
  SOURCE_USED: 2,
  PATH_USED: 3,
  SIZE: 4,
} as const;

export interface FileRecord {
  offset: number;
  length: number;
  pathOffset: number;
  pathLength: number;
}

export interface Codec<T> {
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
  readonly size?: number;
}

export namespace Parallel {
 
  export function createArrayBuffer(
    size: number,
    maximum: number,
    shared: boolean,
  ): BufferLike {
    if (shared) {
      if (typeof SharedArrayBuffer === "undefined") {
        throw new Error("SharedArrayBuffer is not available.");
      }
      return new SharedArrayBuffer(size, { maxByteLength: maximum });
    }

    return new ArrayBuffer(size, { maxByteLength: maximum });
  }

  export class Memory {
    private current: BufferLike;

    constructor(
      size = 1024,
      readonly shared = env.parallel,
      private readonly maximum = 1 << 30,
      backing?: BufferLike,
    ) {
      this.current = backing ?? createArrayBuffer(size, maximum, shared);

      if (this.current.byteLength > maximum) {
        throw new RangeError("Buffer exceeds maximum capacity");
      }
    }

    get buffer(): BufferLike {
      return this.current;
    }

    get byteLength(): number {
      return this.current.byteLength;
    }

    ensureCapacity(required: number): void {
      if (!Number.isSafeInteger(required) || required < 0) {
        throw new RangeError("Invalid requested capacity");
      }

      if (required <= this.byteLength) return;

      if (required > this.maximum) {
        throw new RangeError("Buffer capacity exceeded");
      }

      const size = Math.min(
        this.maximum,
        Math.max(required, this.byteLength * 2, 16),
      );

      if (this.current instanceof SharedArrayBuffer) {
        if (typeof this.current.grow !== "function") {
          throw new Error("SharedArrayBuffer is not growable");
        }
        this.current.grow(size);
        return;
      }

      if (typeof this.current.resize === "function") {
        this.current.resize(size);
        return;
      }

      const next = new ArrayBuffer(size);
      new Uint8Array(next).set(new Uint8Array(this.current));
      this.current = next;
    }

    bytes(offset = 0, length?: number): Uint8Array {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > this.byteLength
      ) {
        throw new RangeError("Invalid byte offset");
      }

      if (length === undefined) {
        return new Uint8Array(this.current, offset);
      }

      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        offset + length > this.byteLength
      ) {
        throw new RangeError("Invalid byte length");
      }

      return new Uint8Array(this.current, offset, length);
    }

    ints(offset = 0, length?: number): Int32Array {
      if (
        offset % 4 !== 0 ||
        offset < 0 ||
        offset > this.byteLength
      ) {
        throw new RangeError("Invalid Int32 offset");
      }

      if (length === undefined) {
        return new Int32Array(this.current, offset);
      }

      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        offset + length * 4 > this.byteLength
      ) {
        throw new RangeError("Invalid Int32 length");
      }

      return new Int32Array(this.current, offset, length);
    }
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  export const codecs = {
    bytes: {
      encode: (value: Uint8Array) => value,
      decode: (value: Uint8Array) => value,
    } satisfies Codec<Uint8Array>,

    string: {
      encode: (value: string) => encoder.encode(value),
      decode: (value: Uint8Array) => decoder.decode(value),
    } satisfies Codec<string>,

    json<T>(): Codec<T> {
      return {
        encode: (value) => encoder.encode(JSON.stringify(value)),
        decode: (bytes) => JSON.parse(decoder.decode(bytes)) as T,
      };
    },
  };

  export class Store<T> {
    constructor(
      readonly memory: Memory,
      readonly codec: Codec<T>,
    ) {}

    write(offset: number, value: T): number {
      const bytes = this.codec.encode(value);
      this.memory.ensureCapacity(offset + bytes.byteLength);
      this.memory.bytes(offset, bytes.byteLength).set(bytes);
      return bytes.byteLength;
    }

    read(offset: number, length: number): T {
      return this.codec.decode(this.memory.bytes(offset, length));
    }

    bytes(offset: number, length: number): Uint8Array {
      return this.memory.bytes(offset, length);
    }

    ensureCapacity(required: number): void {
      this.memory.ensureCapacity(required);
    }
  }

  export class StructArray<T> {
    constructor(
      readonly memory: Memory,
      readonly codec: Codec<T>,
    ) {
      if (!Number.isSafeInteger(codec.size) || codec.size! <= 0) {
        throw new RangeError("StructArray requires a fixed-size codec");
      }
    }

    get width(): number {
      return this.codec.size!;
    }

    get capacity(): number {
      return Math.floor(this.memory.byteLength / this.width);
    }

    ensureCapacity(count: number): void {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new RangeError("Invalid record count");
      }
      this.memory.ensureCapacity(count * this.width);
    }

    get(id: number): T {
      this.checkId(id);
      const offset = id * this.width;

      if (offset + this.width > this.memory.byteLength) {
        throw new RangeError("Record is outside the allocated memory");
      }

      return this.codec.decode(this.memory.bytes(offset, this.width));
    }

    set(id: number, value: T): void {
      this.checkId(id);

      const bytes = this.codec.encode(value);
      if (bytes.byteLength !== this.width) {
        throw new RangeError("Record codec returned an incorrect size");
      }

      const offset = id * this.width;
      this.memory.ensureCapacity(offset + this.width);
      this.memory.bytes(offset, this.width).set(bytes);
    }

    private checkId(id: number): void {
      if (!Number.isSafeInteger(id) || id < 0) {
        throw new RangeError("Invalid record ID");
      }
    }
  }

  export class HashMap {
    constructor(
      readonly memory: Memory,
      readonly keyOf: (value: number) => Uint8Array,
      readonly maximumBytes = 1 << 30,
    ) {
      if (maximumBytes < 8) {
        throw new RangeError("HashMap maximum must be at least 8 bytes");
      }

      if (memory.byteLength < 8) memory.ensureCapacity(8);

      const capacity = this.capacity;
      if ((capacity & (capacity - 1)) !== 0) {
        throw new RangeError("HashMap capacity must be a power of two");
      }
    }

    get capacity(): number {
      return this.memory.byteLength / 4;
    }

    get(key: Uint8Array): number | undefined {
      const slot = this.find(key);
      return slot.found ? slot.value : undefined;
    }

    has(key: Uint8Array): boolean {
      return this.find(key).found;
    }

    set(key: Uint8Array, value: number): void {
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value >= 0x7fffffff
      ) {
        throw new RangeError("Map values must be non-negative Int32 values");
      }

      let slot = this.find(key);
      if (slot.found) {
        this.memory.ints()[slot.slot] = value + 1;
        return;
      }

      this.ensureSlots(this.size + 1);
      slot = this.find(key);
      this.memory.ints()[slot.slot] = value + 1;
    }

    delete(key: Uint8Array): boolean {
      const result = this.find(key);
      if (!result.found) return false;

      const table = this.memory.ints();
      table[result.slot] = 0;

      // Reinsert the following probe cluster.
      let slot = (result.slot + 1) & (table.length - 1);

      while (table[slot] !== 0) {
        const value = table[slot] - 1;
        table[slot] = 0;
        this.insert(value);
        slot = (slot + 1) & (this.memory.ints().length - 1);
      }

      return true;
    }

    clear(): void {
      this.memory.ints().fill(0);
    }

    get size(): number {
      let count = 0;
      for (const value of this.memory.ints()) {
        if (value !== 0) count++;
      }
      return count;
    }

    private ensureSlots(entries: number): void {
      let slots = this.capacity;

      while (entries * 2 >= slots) slots *= 2;

      const required = slots * 4;
      if (required > this.maximumBytes) {
        throw new RangeError("HashMap maximum capacity exceeded");
      }

      if (required <= this.memory.byteLength) return;

      const existing: number[] = [];
      for (const encoded of this.memory.ints()) {
        if (encoded !== 0) existing.push(encoded - 1);
      }

      this.memory.ensureCapacity(required);
      this.memory.bytes().fill(0);

      for (const value of existing) this.insert(value);
    }

    private insert(value: number): void {
      const key = this.keyOf(value);
      const table = this.memory.ints();
      const mask = table.length - 1;
      let slot = Parallel.HashMap.hashBytes(key) & mask;

      for (let i = 0; i < table.length; i++) {
        const encoded = table[slot];

        if (encoded === 0) {
          table[slot] = value + 1;
          return;
        }

        if (
          Parallel.HashMap.equalBytes(
            this.keyOf(encoded - 1),
            key,
          )
        ) {
          table[slot] = value + 1;
          return;
        }

        slot = (slot + 1) & mask;
      }

      throw new Error("HashMap is full");
    }

    private find(
      key: Uint8Array,
    ): { slot: number; found: boolean; value: number } {
      const table = this.memory.ints();
      const mask = table.length - 1;
      let slot = Parallel.HashMap.hashBytes(key) & mask;

      for (let i = 0; i < table.length; i++) {
        const encoded = table[slot];

        if (encoded === 0) {
          return { slot, found: false, value: -1 };
        }

        const value = encoded - 1;

        if (
          Parallel.HashMap.equalBytes(this.keyOf(value), key)
        ) {
          return { slot, found: true, value };
        }

        slot = (slot + 1) & mask;
      }

      throw new Error("HashMap is full");
    }

    static hashBytes(bytes: Uint8Array): number {
      let hash = 0x811c9dc5;

      for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
      }

      return hash >>> 0;
    }

    static equalBytes(a: Uint8Array, b: Uint8Array): boolean {
      if (a.length !== b.length) return false;

      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }

      return true;
    }
  }

  export class Map<K, V extends number> {
    readonly map: HashMap;

    constructor(
      readonly memory: Memory,
      readonly maximumBytes: number,
      readonly codec: Codec<K>,
      readonly keyOf: (value: V) => K,
    ) {
      this.map = new HashMap(
        memory,
        (value) => codec.encode(keyOf(value as V)),
        maximumBytes,
      );
    }

    get(key: K): V | undefined {
      return this.map.get(this.codec.encode(key)) as V | undefined;
    }

    has(key: K): boolean {
      return this.map.has(this.codec.encode(key));
    }

    set(key: K, value: V): void {
      this.map.set(this.codec.encode(key), value);
    }

    delete(key: K): boolean {
      return this.map.delete(this.codec.encode(key));
    }

    clear(): void {
      this.map.clear();
    }
  }

  export class Queue {
    private readonly state: Int32Array;
    private readonly tasks: Int32Array;

    constructor(
      capacity = 256,
      shared = env.parallel,
      buffer?: BufferLike,
    ) {
      if (!Number.isSafeInteger(capacity) || capacity <= 0) {
        throw new RangeError("Invalid queue capacity");
      }

      const bytes = (QueueState.SIZE + capacity) * 4;
      buffer ??= createArrayBuffer(bytes, bytes, shared);

      if (buffer.byteLength < bytes) {
        throw new RangeError("Queue buffer is too small");
      }

      this.state = new Int32Array(buffer, 0, QueueState.SIZE);
      this.tasks = new Int32Array(buffer, QueueState.SIZE * 4, capacity);
    }

    private lock(): void {
      while (
        Atomics.compareExchange(this.state, QueueState.LOCK, 0, 1) !== 0
      ) {}
    }

    private unlock(): void {
      Atomics.store(this.state, QueueState.LOCK, 0);
      Atomics.notify(this.state, QueueState.LOCK, 1);
    }

    async submit(ids: number[]): Promise<void> {
      for (const id of ids) {
        if (!Number.isSafeInteger(id) || id < 0) {
          throw new RangeError(`Invalid task ID: ${id}`);
        }

        for (;;) {
          if (Atomics.load(this.state, QueueState.STOP)) {
            throw new Error("Queue stopped");
          }

          this.lock();
          let inserted = false;

          try {
            if (Atomics.load(this.state, QueueState.COUNT) < this.tasks.length) {
              const tail = Atomics.load(this.state, QueueState.TAIL);
              this.tasks[tail] = id;

              Atomics.store(
                this.state,
                QueueState.TAIL,
                (tail + 1) % this.tasks.length,
              );

              Atomics.add(this.state, QueueState.COUNT, 1);
              Atomics.add(this.state, QueueState.PENDING, 1);
              inserted = true;
            }
          } finally {
            this.unlock();
          }

          if (inserted) break;

          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    take(): number | undefined {
      this.lock();

      try {
        if (Atomics.load(this.state, QueueState.COUNT) === 0) {
          return undefined;
        }

        const head = Atomics.load(this.state, QueueState.HEAD);
        const id = this.tasks[head];

        Atomics.store(
          this.state,
          QueueState.HEAD,
          (head + 1) % this.tasks.length,
        );

        Atomics.sub(this.state, QueueState.COUNT, 1);
        return id;
      } finally {
        this.unlock();
      }
    }

    done(): void {
      const previous = Atomics.sub(this.state, QueueState.PENDING, 1);

      if (previous <= 0) {
        Atomics.add(this.state, QueueState.PENDING, 1);
        throw new Error("Unexpected task completion");
      }

      Atomics.notify(this.state, QueueState.PENDING);
    }

    async join(): Promise<void> {
      while (Atomics.load(this.state, QueueState.PENDING) !== 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    async run(process: (id: number) => void | Promise<void>): Promise<void> {
      while (!Atomics.load(this.state, QueueState.STOP)) {
        const id = this.take();

        if (id === undefined) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          continue;
        }

        try {
          await process(id);
        } finally {
          this.done();
        }
      }
    }

    stop(): void {
      Atomics.store(this.state, QueueState.STOP, 1);
      Atomics.notify(this.state, QueueState.STOP);
    }
  }

  /**
   * Generic memory-layout container.
   * Only Memory instances and raw buffers are serialized.
   */
  export class Buffer<T> {
    constructor(readonly values: T) {}

    pack(): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(this.values)) {
        result[key] = value instanceof Memory ? value.buffer : value;
      }

      return result;
    }

    unpack(shared = true, maximum = 1 << 30): T {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(this.values)) {
        if (
          value instanceof ArrayBuffer ||
          (typeof SharedArrayBuffer !== "undefined" &&
            value instanceof SharedArrayBuffer)
        ) {
          result[key] = new Memory(
            value.byteLength,
            shared,
            maximum,
            value,
          );
        } else {
          result[key] = value;
        }
      }

      return result as T;
    }
  }
}

export const FileRecordCodec: Codec<FileRecord> = {
  size: 16,

  encode(value) {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    view.setInt32(0, value.offset, true);
    view.setInt32(4, value.length, true);
    view.setInt32(8, value.pathOffset, true);
    view.setInt32(12, value.pathLength, true);

    return new Uint8Array(buffer);
  },

  decode(bytes) {
    if (bytes.byteLength !== 16) {
      throw new RangeError("Invalid FileRecord size");
    }

    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    return {
      offset: view.getInt32(0, true),
      length: view.getInt32(4, true),
      pathOffset: view.getInt32(8, true),
      pathLength: view.getInt32(12, true),
    };
  },
};

export interface MemoryLayout {
  heap: { buffer: ArrayBufferLike };   // (what Ray reads and makes: a WebAssembly.Memory where there is WebAssembly)
  source: Parallel.Memory;
  metadata: Parallel.Memory;
  paths: Parallel.Memory;
  index: Parallel.Memory;
  fileState: Parallel.Memory;
  queue: Parallel.Memory;
  queueCapacity: number;
  maximum: number;
}

export class FileStore {
  readonly source: Parallel.Store<Uint8Array>;
  readonly metadata: Parallel.StructArray<FileRecord>;
  readonly paths: Parallel.Store<string>;
  readonly index: Parallel.Map<string, number>;

  constructor(readonly buffer: Parallel.Buffer<MemoryLayout>) {
    const values = buffer.values;

    this.source = new Parallel.Store(values.source, Parallel.codecs.bytes);
    this.metadata = new Parallel.StructArray(values.metadata, FileRecordCodec);
    this.paths = new Parallel.Store(values.paths, Parallel.codecs.string);

    this.index = new Parallel.Map(
      values.index,
      values.maximum,
      Parallel.codecs.string,
      (id) => {
        const record = this.metadata.get(id);
        return this.paths.read(record.pathOffset, record.pathLength);
      },
    );
  }

  get count(): number {
    return Atomics.load(
      this.buffer.values.fileState.ints(),
      FileState.COUNT,
    );
  }

  includes(path: string): boolean {
    return this.index.has(this.normalize(path));
  }

  getFileId(path: string): number | undefined {
    return this.index.get(this.normalize(path));
  }

  getPath(id: number): string {
    const record = this.getRecord(id);
    return this.paths.read(record.pathOffset, record.pathLength);
  }

  getBytes(id: number): Uint8Array {
    const record = this.getRecord(id);
    return this.source.read(record.offset, record.length);
  }

  getText(id: number): string {
    return new TextDecoder().decode(this.getBytes(id));
  }

  add(path: string, content: string | Uint8Array): number {
    path = this.normalize(path);

    const bytes = typeof content === "string"
      ? new TextEncoder().encode(content)
      : content;

    const state = this.buffer.values.fileState.ints();

    this.lock(state);

    try {
      const existing = this.index.get(path);
      if (existing !== undefined) return existing;

      const id = Atomics.load(state, FileState.COUNT);
      const sourceOffset = Atomics.load(state, FileState.SOURCE_USED);
      const pathOffset = Atomics.load(state, FileState.PATH_USED);

      this.source.write(sourceOffset, bytes);
      const pathLength = this.paths.write(pathOffset, path);

      this.metadata.set(id, {
        offset: sourceOffset,
        length: bytes.byteLength,
        pathOffset,
        pathLength,
      });

      this.index.set(path, id);

      Atomics.store(
        state,
        FileState.SOURCE_USED,
        sourceOffset + bytes.byteLength,
      );

      Atomics.store(
        state,
        FileState.PATH_USED,
        pathOffset + pathLength,
      );

      Atomics.store(state, FileState.COUNT, id + 1);
      return id;
    } finally {
      this.unlock(state);
    }
  }

  private getRecord(id: number): FileRecord {
    if (!Number.isSafeInteger(id) || id < 0 || id >= this.count) {
      throw new RangeError(`Invalid file ID: ${id}`);
    }

    return this.metadata.get(id);
  }

  private normalize(path: string): string {
    return path.replace(/\\/g, "/");
  }

  private lock(state: Int32Array): void {
    while (
      Atomics.compareExchange(state, FileState.LOCK, 0, 1) !== 0
    ) {}
  }

  private unlock(state: Int32Array): void {
    Atomics.store(state, FileState.LOCK, 0);
    Atomics.notify(state, FileState.LOCK, 1);
  }
}

// ---------------------------------------------------------------- JMP: one instruction, compiled to WebAssembly (or run as JavaScript)

export const CALLER = -1, AMP = -2, ALWAYS = -1;   // ALWAYS: the constant 1, every program's first

type Native = { name: string; arity: number; wasm: (args: number[][]) => number[]; value?: false };
const op = (...code: number[]) => (args: number[][]) => [...args.flat(), ...code];
// The 16 bytes at p compared with c: a bit for each.
const sixteen = (test: number) => ([p, c]: number[][]) => [...p, 0xfd, 0x00, 0, 0, ...c, 0xfd, 0x0f, 0xfd, test, 0xfd, 0x64];
export const NATIVES: Native[] = [
  ...Object.entries({ '==': 0x46, '!=': 0x47, '<': 0x48, '>': 0x4a, '<=': 0x4c, '>=': 0x4e, '+': 0x6a, '-': 0x6b, '*': 0x6c,
    '/': 0x6d, '%': 0x6f, '&': 0x71, '|': 0x72, '^': 0x73, '<<': 0x74, '>>': 0x75, '>>>': 0x76 }).map(([name, code]) => ({ name, arity: 2, wasm: op(code) })),
  { name: 'set', arity: 1, wasm: op() },
  { name: 'not', arity: 1, wasm: op(0x45) },
  { name: 'clz', arity: 1, wasm: op(0x67) },
  { name: 'ctz', arity: 1, wasm: op(0x68) },
  { name: 'popcnt', arity: 1, wasm: op(0x69) },
  { name: 'u8', arity: 1, wasm: op(0x2d, 0, 0) },                    // memory: a byte
  { name: 'u16', arity: 1, wasm: op(0x2f, 1, 0) },                   // two
  { name: 'i32', arity: 1, wasm: op(0x28, 2, 0) },                   // memory: four
  { name: 'u8=', arity: 2, wasm: op(0x3a, 0, 0), value: false },
  { name: 'i32=', arity: 2, wasm: op(0x36, 2, 0), value: false },
  { name: 'match16', arity: 2, wasm: sixteen(0x23) },
  { name: 'differ16', arity: 2, wasm: sixteen(0x24) },
  // (atomics, for what threads share: a load, a store, an add answering what was there, a compare-and-swap (of the 3 cells
  // from a: where, expected, given) answering what was there)
  { name: 'aload', arity: 1, wasm: op(0xFE, 0x10, 2, 0) },
  { name: 'astore', arity: 2, wasm: op(0xFE, 0x17, 2, 0), value: false },
  { name: 'xadd', arity: 2, wasm: op(0xFE, 0x1E, 2, 0) },
  { name: 'fill', arity: 3, wasm: op(0xFC, 0x0B, 0x00), value: false },      // memory: n bytes from a, each v
  { name: 'cas', arity: 3, wasm: op(0xFE, 0x48, 2, 0) },
  // (the thread's words, where they are: an instance's own (so one module serves every thread))
  { name: 'thread', arity: 0, wasm: () => [0x23, 0] },
];

type Operand = string | number;   // a cell by its name, or a constant

export class Jmp {
  code: number[] = [];
  constants = [1];
  // (what the host does for it, called as a context is: `into = host(the cells from a on)`; a wasm import)
  hosts: { name: string, arity: number }[] = [];
  host(name: string, arity: number) { this.hosts.push({ name, arity }); }
  // (compiled to be debugged: each loop, as it was written (`read`: `while (x && x !== stop …`), by its number)
  loops: string[] = [];
  names = new Map<string, number>();       // a context, or `context.label` → its statement
  cells = new Map<number, string[]>();     // a `&` statement → its cells' names
  private context = '';
  private unlinked: [statement: number, target: string, context: string][] = [];

  get length() { return this.code.length / 5; }
  at(k: number) { return this.code.slice(5 * k, 5 * k + 5); }

  // `&`: a context begins. Its cells are its parameters, `&.value`, then whatever its statements name.
  begin(name: string, ...params: string[]) {
    this.context = name;
    this.names.set(name, this.length);
    this.cells.set(this.length, [...params, '&.value']);
    this.code.push(AMP, ALWAYS, -1, params.length, 0);
  }
  label(name: string) { this.names.set(`${this.context}.${name}`, this.length); }
  jmp(target: string, into?: string, a: Operand = 0, b: Operand = 0) { this.jmpIf(1, target, into, a, b); }
  jmpIf(condition: Operand, target: string, into?: string, a: Operand = 0, b: Operand = 0) {
    this.unlinked.push([this.length, target, this.context]);
    this.code.push(0, this.operand(condition), into === undefined ? -1 : this.operand(into), this.operand(a), this.operand(b));
  }
  private operand(x: Operand) {
    const list: (string | number)[] = typeof x === 'number' ? this.constants : this.cells.get(this.names.get(this.context)!)!;
    const k = list.indexOf(x), at = k < 0 ? list.push(x) - 1 : k;
    return typeof x === 'number' ? -1 - at : at;
  }

  // Target names to statements: a label of the context, else a context, else a native, else &.caller. (A label named as a
  // context or a host is is an error: a jump there would not go where it reads.)
  link() {
    for (const name of this.names.keys()) { const at = name.indexOf('.'); if (at < 0) continue; const label = name.slice(at + 1);
      if (this.names.has(label) && !label.includes('.') || this.hosts.some(h => h.name === label)) throw new Error(`the label \`${name}\` is named as a context or host is`); }
    for (const [k, name, context] of this.unlinked) {
      const at = this.names.get(`${context}.${name}`) ?? this.names.get(name), h = this.hosts.findIndex(x => x.name === name);
      const n = h >= 0 ? NATIVES.length + h : NATIVES.findIndex(x => x.name === name);
      if (at === undefined && n < 0 && name !== '&.caller') throw new Error(`statement ${k}: nothing is named \`${name}\``);
      this.code[5 * k] = at ?? (n >= 0 ? -3 - n : CALLER);
    }
    this.unlinked = [];
    return this;
  }

  // Statements put in before statement k; every jump still reaches the statement it reached.
  insert(k: number, ...statements: number[][]) {
    const moved = (t: number) => t >= k ? t + statements.length : t;
    this.code.splice(5 * k, 0, ...statements.flat());
    for (let i = 0; i < this.code.length; i += 5) if (this.code[i] >= 0) this.code[i] = moved(this.code[i]);
    this.names = new Map([...this.names].map(([n, t]) => [n, moved(t)]));
    this.cells = new Map([...this.cells].map(([t, c]) => [moved(t), c]));
  }

  // A statement a line: JMP target(operands) → into, if condition.
  toString() {
    const label = new Map([...this.names].map(([n, k]) => [k, n.split('.').pop()!])), out: string[] = [];
    let cells: string[] = [];
    const v = (x: number) => x >= 0 ? cells[x] : `${this.constants[-1 - x]}`;
    for (let k = 0; k < this.length; k++) {
      const [t, c, into, a, b] = this.at(k);
      if (t === AMP) { cells = this.cells.get(k)!; out.push(`${k}: & ${label.get(k)}(${cells.slice(0, a).join(', ')})`); continue; }
      if (label.has(k)) out.push(`    ${label.get(k)}\\`);
      const host = t < 0 && -3 - t >= NATIVES.length ? this.hosts[-3 - t - NATIVES.length] : undefined;
      const args = t === CALLER ? [] : t >= 0 ? (this.code[5 * t] === AMP ? cells.slice(a, a + this.code[5 * t + 3]) : []) : host ? cells.slice(a, a + host.arity) : [a, b].slice(0, NATIVES[-3 - t].arity).map(v);
      const name = t === CALLER ? '&.caller' : t >= 0 ? label.get(t) ?? t : host ? host.name : NATIVES[-3 - t].name;
      out.push(`${k}:   JMP ${name}${args.length > 0 ? `(${args.join(', ')})` : ''}${into >= 0 ? ` → ${cells[into]}` : ''}${c === ALWAYS ? '' : ` if ${v(c)}`}`);
    }
    return out.join('\n');
  }
}

// ---- WebAssembly ----

const ELSE = 0x05;
const [UNREACHABLE, BLOCK, LOOP, IF, END, BR, BR_IF, RETURN, CALL, DROP, GET, SET, CONST, VOID, I32] =
  [0x00, 0x02, 0x03, 0x04, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x1a, 0x20, 0x21, 0x41, 0x40, 0x7f];
const uleb = (n: number): number[] => n < 0x80 ? [n] : [(n & 0x7f) | 0x80, ...uleb(n >>> 7)];
const sleb = (n: number): number[] => { const b = n & 0x7f, rest = n >> 7; return (rest === 0 && !(b & 0x40)) || (rest === -1 && (b & 0x40)) ? [b] : [b | 0x80, ...sleb(rest)]; };
const vec = (xs: number[][]) => [...uleb(xs.length), ...xs.flat()];
const section = (id: number, body: number[]) => [id, ...uleb(body.length), ...body];
const text = (s: string) => vec([...s].map(c => [c.charCodeAt(0)]));

// A module of the program's contexts, each exported by name. Its memory is shared, so threads can run it together.
export function compile(p: Jmp, pages: number): WebAssembly.Module {
  const t0 = performance.now(), bytes = module_bytes(p, pages), t1 = performance.now(), module = new WebAssembly.Module(bytes);
  if (typeof process !== 'undefined' && process.env.RAY_TIMES) console.error(`TIMES wasm bytes ${bytes.length}, made in ${(t1 - t0).toFixed(1)} ms, compiled by the engine in ${(performance.now() - t1).toFixed(1)} ms`);
  return module;
}
// (the kernel's module, as bytes: what `compile` makes, and what `--build` writes, with sections of its own after it)
export function module_bytes(p: Jmp, pages: number): Uint8Array {
  const t0 = performance.now();
  p.link();
  if (typeof process !== 'undefined' && process.env.RAY_TIMES) console.error(`TIMES link ${(performance.now() - t0).toFixed(1)} ms`);
  const entries = [...p.cells.keys()].sort((a, b) => a - b), params = entries.map(e => p.code[5 * e + 3]), types = [...new Set([...params, ...p.hosts.map(h => h.arity)])];
  const label = new Map([...p.names].map(([n, k]) => [k, n])), h = p.hosts.length;
  const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec(types.map(n => [0x60, ...vec(Array(n).fill([I32])), ...vec([[I32]])]))),
    ...section(2, vec([...p.hosts.map(x => [...text('h'), ...text(x.name), 0x00, ...uleb(types.indexOf(x.arity))]), [...text('m'), ...text('memory'), 0x02, 0x03, ...uleb(pages), ...uleb(pages)], [...text('m'), ...text('thread'), 0x03, I32, 0x00]])),
    ...section(3, vec(params.map(n => uleb(types.indexOf(n))))),
    ...section(7, vec(entries.map((e, i) => [...text(label.get(e)!), 0x00, ...uleb(h + i)]))),
    ...(() => {
      const index = new Map(entries.map((e, i) => [e, i])), body: number[] = [];
      put_uleb(body, entries.length);
      entries.forEach((e, i) => {
        let b: number[];
        try { b = context(p, e, entries[i + 1] ?? p.length, index); } catch (x) { throw new Error(`${label.get(e)}: ${(x as Error).message}`); }
        put_uleb(body, b.length); put(body, b);
      });
      const out = [10]; put_uleb(out, body.length); put(out, body);
      return out;
    })(),
    // (the names of its functions, so a trace says where it was)
    ...section(0, [...text('name'), ...(names => [1, ...uleb(names.length), ...names])(vec([...p.hosts.map((x, i) => [...uleb(i), ...text(x.name)]), ...entries.map((e, i) => [...uleb(h + i), ...text(label.get(e)!)])]))]),
  ]);
  return bytes;
}
// A program compiled (`Program{O: @wasm.none}`, Expression.ray's `Wasm.none`): each rule's body a function of its own, given
// what applies it (its frame): its statements a loop on where it is (`$at`), each a case of `br_table`; a goto set where it
// goes next (found once, here), the rest a call of the runtime (the kernel: `ev`, what reads a statement). It answers what
// the kernel's `exec` answers, step for step. (`@wasm`, `@wasm.default`: the same, and every optimization after it.)
compiled_module.direct = 0;
export function compiled_module(i32: Int32Array, pages: number, rules: number[], labelled: (bd: number, s: number, n: number) => number, level: string): Uint8Array {
  const S = { READ: 0, LABEL: 1, LABELLED: 2, GOTO: 3, TO: 4 }, STEP = 24, T = { FAULT: 32, JUMP_S: 4, JUMP_N: 8, JUMP_V: 12, HOLE: 16, DECL: 128, LEXV: 164 }, K_RULE = 3, optimized = level !== 'none', F = { RULE: 28, THIS: 36, CLOSURE: 48 }, N_BASE = 4, OOM = 108, W_AFTERWARDS = 2;
  const w = (a: number) => i32[a >> 2];
  // (the kernel's, imported: name, how many it takes)
  const kernel: [string, number][] = [['ev', 8], ['latest', 1], ['making', 1], ['reading', 11], ['owned', 2], ['again', 1], ['defer', 2], ['go', 5], ['word', 3], ['exec', 4], ['labelled', 3], ['apply', 10], ['could', 3]];
  const K = Object.fromEntries(kernel.map(([n], i) => [n, i])), types = [...new Set([...kernel.map(([, a]) => a), 3])];
  const LOCALS = { t: 0, f: 1, from: 2, pc: 3, answer: 4, self: 5, r: 6, js: 7, jn: 8, to: 9, r2: 10 };
  const get = (l: number) => [GET, ...uleb(l)], put_ = (l: number) => [SET, ...uleb(l)], c = (n: number) => [CONST, ...sleb(n)];
  const load = (addr: number[]) => [...addr, 0x28, 2, 0], at = (l: number, off: number) => load([...get(l), ...c(off), 0x6a]), mem = (a: number) => load(c(a));
  const call = (n: string) => [CALL, ...uleb(K[n])];
  const bodies = rules.map(rule => {
    const bd = w(rule + 44), n = w(bd), o: number[] = [];
    // (pc from where it is asked to begin)
    o.push(...get(LOCALS.from), ...put_(LOCALS.pc));
    o.push(LOOP, VOID);                                   // $top
    o.push(BLOCK, VOID);                                  // $end (past the last)
    for (let i = n - 1; i >= 0; i--) o.push(BLOCK, VOID);  // $c0 … $c(n-1)
    o.push(...get(LOCALS.pc), 0x0e, ...uleb(n), ...Array.from({ length: n }, (_, i) => uleb(i)).flat(), ...uleb(n));
    for (let i = 0; i < n; i++) {
      o.push(END);                                        // the case of step i: depth to $top is (n - 1 - i) + 1
      const top = n - i, st = bd + 4 + STEP * i, kind = w(st);
      const next = (d: number) => [...c(i + 1), ...put_(LOCALS.pc), BR, ...uleb(top + d)];
      // (what follows a statement: stopped, or gone to a label, else the next)
      const tail = (d: number) => [
        ...load([...get(LOCALS.t), ...c(T.FAULT), 0x6a]), ...mem(OOM), 0x72, IF, VOID, ...c(0), RETURN, END,
        ...at(LOCALS.t, T.JUMP_N), ...put_(LOCALS.jn), ...get(LOCALS.jn), IF, VOID,
          ...at(LOCALS.t, T.JUMP_S), ...put_(LOCALS.js), ...c(bd), ...get(LOCALS.js), ...get(LOCALS.jn), ...call('labelled'), ...put_(LOCALS.to),
          ...get(LOCALS.to), ...c(0), 0x4e, IF, VOID,
            ...get(LOCALS.to), ...c(i), 0x4c, IF, VOID, ...get(LOCALS.f), ...call('again'), DROP, END,
            ...get(LOCALS.to), ...put_(LOCALS.pc),
            ...at(LOCALS.t, T.JUMP_V), IF, VOID, ...at(LOCALS.t, T.JUMP_V), ...put_(LOCALS.answer), END,
            ...get(LOCALS.t), ...c(T.JUMP_N), 0x6a, ...c(0), 0x36, 2, 0,
            BR, ...uleb(top + d + 2),
          END,
          ...get(LOCALS.js), ...get(LOCALS.js), ...get(LOCALS.jn), 0x6a, ...c(W_AFTERWARDS), ...call('word'), IF, VOID,
            ...get(LOCALS.t), ...c(T.JUMP_N), 0x6a, ...c(0), 0x36, 2, 0, ...get(LOCALS.f), ...c(i + 1), ...call('defer'), DROP, ...c(0), RETURN,
          END,
          ...c(0), RETURN,
        END,
        ...next(d)];
      if (kind === S.LABEL || kind === S.LABELLED) { o.push(...next(0)); continue; }
      if (kind === S.TO) { o.push(...get(LOCALS.t), ...get(LOCALS.f), ...c(bd), ...c(i), ...call('exec'), RETURN); continue; }
      if (kind === S.GOTO) {
        const to = labelled(bd, w(st + 12), w(st + 16));
        if (to >= 0) { if (to <= i) o.push(...get(LOCALS.f), ...call('again'), DROP); o.push(...c(to), ...put_(LOCALS.pc), BR, ...uleb(top)); continue; }
        o.push(...c(w(st + 12)), ...c(w(st + 12) + w(st + 16)), ...c(W_AFTERWARDS), ...call('word'), IF, VOID, ...get(LOCALS.f), ...c(i + 1), ...call('defer'), DROP, ...c(0), RETURN, END);
        o.push(...get(LOCALS.t), ...c(w(st + 12)), ...c(w(st + 16)), ...get(LOCALS.f), ...get(LOCALS.answer), ...call('go'), DROP, ...tail(0));
        continue;
      }
      // (a statement read: what reads it, and, in a node this body is making, what its earlier statements defined there first)
      o.push(...at(LOCALS.f, F.THIS), ...put_(LOCALS.self), ...mem(st + 12), ...put_(LOCALS.r));
      o.push(...get(LOCALS.self), ...call('latest'), ...at(LOCALS.self, N_BASE), 0x47, IF, VOID,
        ...get(LOCALS.self), ...call('making'), ...get(LOCALS.self), ...mem(st + 4), ...mem(st + 8), ...call('could'), 0x71, IF, VOID,
          ...get(LOCALS.t), ...mem(st + 4), ...mem(st + 8), ...at(LOCALS.f, F.RULE), ...at(LOCALS.f, F.CLOSURE), ...get(LOCALS.self), ...call('latest'), ...get(LOCALS.self), ...c(0), ...c(0), ...c(0), ...c(0), ...call('reading'), ...put_(LOCALS.r2),
          ...get(LOCALS.r2), ...get(LOCALS.self), ...call('owned'), IF, VOID, ...get(LOCALS.r2), ...put_(LOCALS.r), END,
        END, END);
      const evaluated = [...get(LOCALS.t), ...get(LOCALS.r), ...get(LOCALS.f), ...get(LOCALS.f), ...get(LOCALS.self), ...c(i === n - 1 ? 1 : 0), ...get(LOCALS.self), ...get(LOCALS.self), ...call('ev'), ...put_(LOCALS.answer)];
      // (optimized: a statement a rule reads, read as written (the same reading, not read again here) where no hole is being
      // declared and no left side read: that rule applied, as `ev` would, without asking what reads it)
      const r0 = w(st + 12);
      if (optimized && w(r0) === K_RULE) {
        compiled_module.direct++;
        o.push(...get(LOCALS.r), ...c(r0), 0x46, ...at(LOCALS.t, T.HOLE), 0x45, 0x71, ...at(LOCALS.t, T.DECL), 0x45, 0x71, IF, VOID,
          ...get(LOCALS.t), ...c(T.LEXV), 0x6a, ...c(w(r0 + 20)), 0x36, 2, 0,
          ...get(LOCALS.t), ...c(w(r0 + 12)), ...c(w(r0 + 16)), ...get(LOCALS.f), ...get(LOCALS.f), ...get(LOCALS.self), ...c(w(r0 + 4)), ...c(w(r0 + 8)), ...get(LOCALS.self), ...get(LOCALS.self), ...call('apply'), ...put_(LOCALS.answer),
        ELSE, ...evaluated, END);
      } else o.push(...evaluated);
      o.push(...tail(0));
    }
    o.push(END);                                          // $end: past the last step
    o.push(...get(LOCALS.answer), RETURN, END);           // $top
    o.push(...c(0), END);                                 // (unreachable answer; the function's end)
    const locals = vec([[...uleb(8), I32]]);
    const fn = [...locals, ...o];
    return [...uleb(fn.length), ...fn];
  });
  void level;
  return new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec(types.map(n => [0x60, ...vec(Array(n).fill([I32])), ...vec([[I32]])]))),
    ...section(2, vec([...kernel.map(([name, a]) => [...text('k'), ...text(name), 0x00, ...uleb(types.indexOf(a))]), [...text('m'), ...text('memory'), 0x02, 0x03, ...uleb(pages), ...uleb(pages)]])),
    ...section(3, vec(rules.map(() => uleb(types.indexOf(3))))),
    ...section(7, vec(rules.map((_, i) => [...text(`r${i + 1}`), 0x00, ...uleb(kernel.length + i)]))),
    ...section(10, [...uleb(bodies.length), ...bodies.flat()]),
  ]);
}
// A program built: the kernel's module, then what the kernel's memory held once the program was read (`ray.image`: each
// stretch that is not zero, at where it is) and what that memory needs to say where things are (`ray`: its size, the files'
// paths). Run, the memory is set out as it was, and what was put off (the tests) runs from there: read once, at build.
export function built(p: Jmp, pages: number, heap: Uint8Array, end: number, meta: object, program?: Uint8Array): Uint8Array {
  const code = module_bytes(p, pages), parts: Uint8Array[] = [code];
  const custom = (name: string, payload: Uint8Array) => { const head: number[] = [0]; const n = text(name); put_uleb(head, n.length + payload.length); put(head, n); parts.push(new Uint8Array(head), payload); };
  custom('ray', new TextEncoder().encode(JSON.stringify(meta)));
  // (and the program compiled: its rules' bodies, each a function, run on the kernel)
  if (program) custom('ray.program', program);
  const runs: number[] = []; let size = 0;
  for (let i = 0; i < end;) { while (i < end && heap[i] === 0) i++; if (i >= end) break; let j = i, zeros = 0; while (j < end && zeros < 256) { zeros = heap[j] === 0 ? zeros + 1 : 0; j++; } j -= zeros; runs.push(i, j); size += 8 + (j - i); i = j; }
  const image = new Uint8Array(size), view = new DataView(image.buffer); let at = 0;
  for (let k = 0; k < runs.length; k += 2) { view.setUint32(at, runs[k], true); view.setUint32(at + 4, runs[k + 1] - runs[k], true); image.set(heap.subarray(runs[k], runs[k + 1]), at + 8); at += 8 + runs[k + 1] - runs[k]; }
  custom('ray.image.z', process.getBuiltinModule('zlib').deflateRawSync(image, { level: 1 }));
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

// Straight-line code, then the jumps that end it.
type Block = { code: number[]; jumps: [when: number[] | null, to: number][] };

// (bytes written onto the end of `o`: a number as LEB128, unsigned and signed; `xs` one after another)
const put_uleb = (o: number[], n: number) => { while (n >= 0x80) { o.push((n & 0x7f) | 0x80); n >>>= 7; } o.push(n); };
const put_sleb = (o: number[], n: number) => { for (;;) { const b = n & 0x7f; n >>= 7; if ((n === 0 && !(b & 0x40)) || (n === -1 && (b & 0x40))) { o.push(b); return; } o.push(b | 0x80); } };
const put = (o: number[], xs: number[]) => { for (let i = 0; i < xs.length; i++) o.push(xs[i]); };
// A context's statements, from its `&` to the next. Blocks begin where a jump lands and after a jump.
function context(p: Jmp, entry: number, end: number, index: Map<number, number>): number[] {
  const code = p.code, constants = p.constants;
  const get = (o: number[], x: number) => { if (x >= 0) { o.push(GET); put_uleb(o, x); } else { o.push(CONST); put_sleb(o, constants[-1 - x]); } };
  const got = (x: number) => { const o: number[] = []; get(o, x); return o; };
  const starts = new Set([entry + 1]);
  for (let k = entry + 1; k < end; k++) {
    const t = code[5 * k];
    if (t >= 0 && code[5 * t] !== AMP) {
      if (t <= entry || t >= end) throw new Error(`statement ${k} jumps out of its context`);
      starts.add(t); starts.add(k + 1);
    } else if (t === CALLER) starts.add(k + 1);
  }
  const order = [...starts].filter(k => k < end).sort((a, b) => a - b), block = new Map(order.map((k, i) => [k, i]));
  const blocks: Block[] = order.map(() => ({ code: [], jumps: [] }));
  let b = blocks[0];
  for (let k = entry + 1; k < end; k++) {
    const at = block.get(k);
    if (at !== undefined) b = blocks[at];
    const t = code[5 * k], c = code[5 * k + 1], into = code[5 * k + 2], x = code[5 * k + 3], y = code[5 * k + 4], fixed = c < 0 ? constants[-1 - c] : undefined;
    if (fixed === 0) continue;
    if (t >= 0 && code[5 * t] !== AMP) { b.jumps.push([fixed !== undefined ? null : got(c), block.get(t)!]); continue; }
    const o = b.code, native = t < 0 && t !== CALLER && -3 - t < NATIVES.length ? NATIVES[-3 - t] : undefined;
    // (one that holds only when its condition does: inside an `if`)
    if (fixed === undefined) { get(o, c); o.push(IF, VOID); }
    if (t === CALLER) { get(o, code[5 * entry + 3]); o.push(RETURN); }
    else if (t >= 0) { for (let i = 0; i < code[5 * t + 3]; i++) get(o, x + i); o.push(CALL); put_uleb(o, p.hosts.length + index.get(t)!); }
    else if (!native) { const h = -3 - t - NATIVES.length; for (let i = 0; i < p.hosts[h].arity; i++) get(o, x + i); o.push(CALL); put_uleb(o, h); }
    else put(o, native.wasm((native.arity === 3 ? [x, x + 1, x + 2] : [x, y].slice(0, native.arity)).map(got)));
    // (what it answers, kept in its cell or dropped)
    if (t !== CALLER && !(native && native.value === false)) { if (into >= 0) { o.push(SET); put_uleb(o, into); } else o.push(DROP); }
    if (fixed === undefined) o.push(END);
  }
  const out: number[] = [1];
  put_uleb(out, p.cells.get(entry)!.length - code[5 * entry + 3]); out.push(I32);
  structure(blocks, out); out.push(UNREACHABLE, END);
  return out;
}

// Loops and blocks that nest: a loop from a block to the last jump back to it, a block from the first jump forward to a
// block until it. A block that crosses another begins earlier; a jump into the middle of a loop does not nest.
function structure(blocks: Block[], code: number[]) {
  type Scope = { from: number; to: number; loop: boolean; target: number };
  const scopes: Scope[] = [], into: number[][] = blocks.map(() => []);
  blocks.forEach((b, k) => { for (const [, to] of b.jumps) into[to].push(k); });
  blocks.forEach((_, target) => {
    let back = -1, forward = Infinity;
    for (const k of into[target]) { if (k >= target) back = Math.max(back, k); else if (k < target - 1) forward = Math.min(forward, k); }
    if (back >= 0) scopes.push({ from: target, to: back + 1, loop: true, target });
    if (forward < Infinity) scopes.push({ from: forward, to: target, loop: false, target });
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const a of scopes) for (const b of scopes) if (a.from < b.from && b.from < a.to && a.to < b.to) {
      if (b.loop) throw new Error('a jump into the middle of a loop');
      b.from = a.from; changed = true;
    }
  }
  const opening: Scope[][] = blocks.map(() => []);
  for (const s of scopes) opening[s.from].push(s);
  const open: Scope[] = [];
  blocks.forEach((b, k) => {
    for (const s of opening[k].sort((x, y) => y.to - x.to || +y.loop - +x.loop)) { code.push(s.loop ? LOOP : BLOCK, VOID); open.push(s); }
    put(code, b.code);
    for (const [when, to] of b.jumps) if (to !== k + 1) {
      let at = -1;
      for (let i = 0; i < open.length; i++) if (open[i].target === to && open[i].loop === to <= k) { at = i; break; }
      if (when === null) code.push(BR); else { put(code, when); code.push(BR_IF); }
      put_uleb(code, open.length - 1 - at);
    }
    while (open.length > 0 && open[open.length - 1].to === k + 1) { code.push(END); open.pop(); }
  });
}

export const memory = (bytes: number) => { const pages = Math.max(1, Math.ceil(bytes / 65536)); return new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true }); };
// (a program run in memory of its own: compiled where there is WebAssembly with shared memory, else run as JavaScript)
type Hosts = Record<string, (...args: number[]) => number>;
export function runs_in(p: Jmp, bytes: number, hosts: Hosts = {}): { buffer: ArrayBufferLike, exports: Record<string, (...args: number[]) => number> } {
  if (env.target === 'wasm') { const m = memory(bytes); return { buffer: m.buffer, exports: instance(compile(p, m.buffer.byteLength / 65536), m, hosts) }; }
  const buffer = new ArrayBuffer(Math.max(1, Math.ceil(bytes / 65536)) * 65536);
  return { buffer, exports: interpret(p, buffer, hosts) };
}
export const instance = (module: WebAssembly.Module, memory: WebAssembly.Memory, hosts: Hosts = {}, thread = 0) =>
  new WebAssembly.Instance(module, { m: { memory, thread: new WebAssembly.Global({ value: 'i32', mutable: false }, thread) }, h: hosts }).exports as Record<string, (...args: number[]) => number>;

// ---- JavaScript ----

// The same program run without WebAssembly, on the bytes of `buffer`: each context exported by name, as `instance` does.
const JS: Record<string, (a: number, b: number, bytes: Uint8Array, view: DataView, c: number, i32: Int32Array) => number> = {
  '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b), '<': (a, b) => +(a < b), '>': (a, b) => +(a > b),
  '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b), '+': (a, b) => (a + b) | 0, '-': (a, b) => (a - b) | 0,
  '*': (a, b) => Math.imul(a, b), '/': (a, b) => (a / b) | 0, '%': (a, b) => (a % b) | 0, '&': (a, b) => a & b,
  '|': (a, b) => a | b, '^': (a, b) => a ^ b, '<<': (a, b) => a << b, '>>': (a, b) => a >> b, '>>>': (a, b) => (a >>> b) | 0,
  'set': a => a, 'not': a => +(a === 0), 'clz': a => Math.clz32(a), 'ctz': a => a === 0 ? 32 : 31 - Math.clz32(a & -a),
  'popcnt': a => { let n = 0; for (a >>>= 0; a; a &= a - 1) n++; return n; },
  'u8': (a, _, bytes) => bytes[a], 'u16': (a, _, __, view) => view.getUint16(a, true), 'i32': (a, _, __, view) => view.getInt32(a, true),
  'u8=': (a, b, bytes) => (bytes[a] = b, 0), 'i32=': (a, b, _, view) => (view.setInt32(a, b, true), 0),
  'match16': (p, c, bytes) => { let bits = 0; for (let i = 0; i < 16; i++) if (bytes[p + i] === (c & 255)) bits |= 1 << i; return bits; },
  'differ16': (p, c, bytes) => { let bits = 0; for (let i = 0; i < 16; i++) if (bytes[p + i] !== (c & 255)) bits |= 1 << i; return bits; },
  'aload': (a, _, __, ___, ____, i32) => Atomics.load(i32, a >> 2), 'astore': (a, b, _, __, ___, i32) => (Atomics.store(i32, a >> 2, b), 0),
  'xadd': (a, b, _, __, ___, i32) => Atomics.add(i32, a >> 2, b), 'cas': (a, b, _, __, c, i32) => Atomics.compareExchange(i32, a >> 2, b, c),
  'fill': (a, b, bytes, _, c) => (bytes.fill(b & 255, a, a + c), 0),
  'thread': () => 0,
};
export function interpret(p: Jmp, buffer: ArrayBufferLike, hosts: Hosts = {}): Record<string, (...args: number[]) => number> {
  p.link();
  const code = p.code, constants = p.constants, bytes = new Uint8Array(buffer), view = new DataView(buffer), i32 = new Int32Array(buffer);
  const natives = NATIVES.map(n => JS[n.name]), called = p.hosts.map(h => hosts[h.name]);
  // (`RAY_STEPS`: how many statements it may run, each call; past that it says where it was)
  const limit = typeof process !== 'undefined' && process.env.RAY_STEPS ? Number(process.env.RAY_STEPS) : 0;
  const named = new Map([...p.names].map(([n, k]) => [k, n]));
  const run = (entry: number, args: number[]): number => {
    const cells = new Int32Array(p.cells.get(entry)!.length), value = code[5 * entry + 3];
    cells.set(args);
    const get = (x: number) => x >= 0 ? cells[x] : constants[-1 - x];
    for (let k = entry + 1, steps = 0; ;) {
      if (limit && ++steps > limit) throw new Error(`${named.get(entry)} ran past ${limit} statements, at ${k}: ${[...p.names].filter(([, at]) => at <= k && at > entry).map(([n]) => n).pop() ?? ''}, cells ${p.cells.get(entry)!.map((name, i) => name + '=' + cells[i]).join(' ')}`);
      const t = code[5 * k], c = code[5 * k + 1], into = code[5 * k + 2], x = code[5 * k + 3], y = code[5 * k + 4];
      if (get(c) === 0) { k++; continue; }
      if (t === CALLER) return cells[value];
      if (t >= 0 && code[5 * t] === AMP) { const r = run(t, Array.from(cells.subarray(x, x + code[5 * t + 3]))); if (into >= 0) cells[into] = r; k++; }
      else if (t >= 0) k = t;
      else if (-3 - t >= natives.length) { const h = -3 - t - natives.length, r = called[h](...cells.subarray(x, x + p.hosts[h].arity)); if (into >= 0) cells[into] = r; k++; }
      else {
        let r: number;
        try { r = NATIVES[-3 - t].arity === 3 ? natives[-3 - t](cells[x], cells[x + 1], bytes, view, cells[x + 2], i32) : natives[-3 - t](get(x), get(y), bytes, view, 0, i32); }
        catch (e) { throw new Error(`${named.get(entry)} at ${k} (${[...p.names].filter(([, at]) => at <= k && at > entry).map(([n]) => n).pop() ?? ''}): ${NATIVES[-3 - t].name}(${get(x)}, ${get(y)}): ${(e as Error).message}; cells ${p.cells.get(entry)!.map((name, i) => name + '=' + cells[i]).join(' ')}`); }
        if (into >= 0 && NATIVES[-3 - t].value !== false) cells[into] = r; k++;
      }
    }
  };
  const label = new Map([...p.names].map(([n, k]) => [k, n]));
  return Object.fromEntries([...p.cells.keys()].map(e => [label.get(e)!, (...args: number[]) => run(e, args)]));
}

export abstract class Language<Frontend> {
  get name() { return Object.entries(Program.backends).find(x => x[1] === this)[0]; }

  abstract compile(program: Frontend, id?: number): unknown
}

// A backend runs the frontend's JMP program on the memory every thread shares: compiled to WebAssembly, or as JavaScript.
export class Wasm extends Language<Ray> {
  // (compiled once for every thread of a process: each instance knows its thread)
  static compiled = new Map<string, WebAssembly.Module>();
  static module(pages: number, debug: number): WebAssembly.Module {
    const key = `${pages}:${debug}`;
    let module = Wasm.compiled.get(key);
    if (!module) { const t0 = performance.now(), p = Ray.program(debug), t1 = performance.now(); module = compile(p, pages); Wasm.compiled.set(key, module); if (typeof process !== 'undefined' && process.env.RAY_TIMES) console.error(`TIMES kernel to JMP ${(t1 - t0).toFixed(1)} ms, JMP to wasm ${(performance.now() - t1).toFixed(1)} ms`); }
    return module;
  }
  compile(ray: Ray) {
    return instance(Wasm.module(ray.heap.buffer.byteLength / 65536, ray.debugging ? 1 : 0), ray.heap as WebAssembly.Memory, ray.hosts, ray.t);
  }
}
export class Js extends Language<Ray> {
  compile(ray: Ray) { return kernel(ray.heap.buffer, ray.t, ray.debugging ? 1 : 0, ray.hosts) as unknown as Record<string, (...args: number[]) => number>; }
}

// ---------------------------------------------------------------- Ray: .ray text → JMP (compiler.sketch.ray)

// Memory, in bytes: words every thread shares, then what is allocated. Everything is a record of words:
//   a node   [last, base, is, a, b, parent, also]   (its rules: `last` and the ones before it, `prev` by `prev`, its own down to
//                                              `base` (a rule of none, where it ends); then, made in a method, those of what that
//                                              is read on (`also`); then its parent's, as they are then; `a`, `b`: its text)
//   a frame  [...node, rule, caller, this, start, end, closure, receiver, ...takes]   (a rule's application; read as a node:
//                                          its takes, its caller, and what it is read on, `this`)
//   a take   [start, end, read with, written in, this there, value, state]  (what a hole took: code, read when it is used)
//   a rule   [prev, kind, key length, holes, body start, body end, closure, parts, head, flags, owner, body, ...parts]
//   a part   [kind, a, b, hole, type, node]   (literal: the text at a, b long; space: any amount; hole: its name, its index,
//                                              its type (a span it takes is one the type's own rules read whole), its node)
const ENTRYPOINT_END = 204, TMEMO = 208, TMEMO_MASK = 212, BEGINS = 200, HEAP = 0, OPEN = 4, OPEN_LENGTH = 8, CLOSE = 12, CLOSE_LENGTH = 16, BOOTED = 20, GLOBAL = 24, ENTRYPOINT_FILE = 28, ENTRYPOINT_START = 32, SEPARATOR = 36, SEPARATOR_LENGTH = 40, CLASSES = 44, PAIRS = 48, FRAMES = 52;
const WORDS = 56, LOG = 60, LOG_N = 64, LOG_CAP = 68, AFTER = 72, AFTER_HEAD = 76, AFTER_TAIL = 80, AFTER_CAP = 84, FAIL_FAST = 120, MEMO = 124, MEMO_MASK = 128, FILES = 132, FILES_N = 136, PEND = 140, PHASE = 144, READS = 164, READS_N = 168, READS_CAP = 172, LIST = 92, LIST_N = 96, LIST_CAP = 100, LIMIT = 104, TRASH = 112, BUDGET = 116, RULES = 256, RULES_N = 260, RULES_CAP = 264, OWN = 268, START = 512;
// (a task that is no file: the tests)
const TESTS = 0x7FFFFFF0, SETTLE = 0x7FFFFFF1, NEXT = 148, DONE = 152, ANY = 156, INCL = 176, LAZY = 180, LAZY_CAP = 188, PASSED = 192;
// (the words the host knows, in the kernel's order: `W_…`)
const WORDS_KNOWN = ['caller', 'this', 'afterwards', 'report', 'erred', 'goto', 'label', '.', '&', 'type', 'include', 'read', 'next', 'members', 'static', 'undefined', 'unset', 'operated', 'admits', 'head', 'value', 'narrows', 'components', 'each', 'nonempty_of', 'listing', 'Node', 'String', 'of', 'written_as', 'named', 'written_name', 'names', 'tail', 'named_like', 'member', 'structure_as', 'output', 'arguments', 'quoted'];
// The kernel's own map, apart from the externals: what its kinds of value are in the language (`external text` in `wasm.o.ray`).
const NOVIA = typeof process !== "undefined" && !!process.env.RAY_NOVIA;
const NOGIVEN = typeof process !== "undefined" && !!process.env.RAY_NOGIVEN;
const MAPPED_KNOWN = ['text', 'first', 'rest', 'nothing', 'given', 'taking', 'same', 'until', 'glyphs', 'count', 'truth', 'number', 'numeral', 'character', 'superposed', 'superposing', 'dotted', 'past', 'cuts', 'unescaped'];
// (what the kernel says: `L_…`)
const L = { UNREAD: 1, UNLABELLED: 2, BUDGET: 3, OOM: 4, REPORT: 5, CYCLE: 6, NOT_ON: 7, EXTERNAL: 8, DEEP: 9, STYLED: 10, HELD: 11, DEFINED: 12, VALUED: 13, SILENT: 14, PASSED: 15, MEMORY: 16, FULL: 17, OUTPUT: 18 };
// (what the kernel tells the host with --debug: D_… in it)
const Debug = { STATEMENT: 1, STATEMENT_END: 2, APPLY: 3, APPLY_END: 4, DEFINE: 5, OOM: 6, BLOCK: 7, BLOCK_END: 8, TEST: 9, TEST_END: 10, FAULT: 11, SAID: 12, TYPE: 13, TYPE_END: 14, LOOP: 16, SETTLED: 18, READING: 20, RESULT: 22, FREE: 32 };
const N = { LAST: 0, BASE: 4, IS: 8, A: 12, B: 16, PARENT: 20, ALSO: 24 }, NODE = 28;
const F = { RULE: 28, CALLER: 32, THIS: 36, START: 40, END: 44, CLOSURE: 48, RECEIVER: 52, TAKES: 56 }, TAKE = 32;
const T = { START: 0, END: 4, VIS: 8, ORIGIN: 12, THIS: 16, VALUE: 20, STATE: 24 };
const R = { PREV: 0, KIND: 4, MASK: 8, HOLES: 12, BS: 16, BE: 20, CLOSURE: 24, PARTS: 28, HEAD: 32, FLAGS: 36, OWNER: 40, BODY: 44, SKIP: 48, INL_S: 52, INL_E: 56, INL_F: 60, BODY_: 44, FN: 88, PART: 96 }, PART = 24;
const enum Kind { RULE, DEFINE, EXTERNAL, VALUE }
const enum Part { LITERAL, SPACE, HOLE }
const enum Is { NODE, TEXT, PLACE, HEAD, HOLE, FRAME }
// (which rules a reading asks: one with the separator in it, only definitions; on a value, only methods (led by text); in a hole, only what has holes)
const enum Want { DEFINES = 1, LED = 2, HOLES = 4, DEAD = 8, METHOD = 16, READER = 32 }
const SCRATCH = 1024, HUG = 16, WORD = 32;
type Exports = Record<string, (...args: number[]) => number>;
// (written at once: a thread's console is written later, and a thread may be stopped before)
const say = (text: string) => env.nodejs ? env.fs.writeSync(1, text + '\n') : console.log(text);
// (memory ran out (the kernel's own allowance did not stop it first): said as an error, not a crash; the run ends, what was
// in memory then is no longer to be trusted)
const out_of_memory = (error: unknown) => {
  if (!(error instanceof RangeError) || !/out of memory/.test(error.message)) return false;
  say(`${ansi.indianRed}ERROR${ansi.reset}   ${error.message.replace(/^out of memory/, 'ran out of memory')}: the run is stopped (a statement or test that keeps making more is stopped at 320 MB, a test at 32 MB; this was all of them together)`);
  return true;
};

// Statements written with the one instruction. A call puts its arguments in cells of their own, one after another.
function builder(p: Jmp) {
  let n = 0;
  const jmp = p.jmp.bind(p), when = p.jmpIf.bind(p), label = p.label.bind(p);
  const call = (name: string, into: string | undefined, ...args: Operand[]) => { const k = n++; args.forEach((a, i) => jmp('set', `${name}#${k}#${i}`, a)); jmp(name, into, `${name}#${k}#0`); };
  const get = (into: string, at: Operand, offset: number) => { jmp('+', '@', at, offset); jmp('i32', into, '@'); };
  const put = (at: Operand, offset: number, value: Operand) => { jmp('+', '@', at, offset); jmp('i32=', undefined, '@', value); };
  const ret = (value: Operand) => { jmp('set', '&.value', value); jmp('&.caller'); };
  return { jmp, when, label, call, get, put, ret };
}

// ---------------------------------------------------------------- The kernel: written once in JavaScript, compiled to JMP

// A program written as JavaScript functions of 32-bit integers over the memory (no objects, strings or closures), run as it
// is, or compiled here to JMP (and from there to WebAssembly). Its source is the kernel's own: `const` numbers are constants,
// each `function` a context; what it calls that is not one of them is the memory and atomics (`BUILTINS`, JMP natives).
const BUILTINS: Record<string, string> = { w: 'i32', set: 'i32=', b: 'u8', setb: 'u8=', aload: 'aload', astore: 'astore', xadd: 'xadd', cas: 'cas', fill: 'fill', clz: 'clz', ctz: 'ctz' };
const BINARY: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/', '%': '%', '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>', '>>>': '>>>', '==': '==', '===': '==', '!=': '!=', '!==': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>='], ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '%']];
export function jmp_of(source: string, p = new Jmp(), given: Record<string, number> = {}): Jmp {
  const tokens = (source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|0x[0-9a-fA-F]+|\d+(?:e\d+)?|[A-Za-z_$][\w$]*|>>>=|>>>|===|!==|<<=|>>=|[-+*/%&|^<>!=]=|&&|\|\||\+\+|--|<<|>>|=>|\S/g) ?? []).filter(t => !t.startsWith('//') && !t.startsWith('/*'));
  const consts = new Map<string, number>(Object.entries(given)), functions = new Set<string>();
  let at = 0;
  const peek = (k = 0) => tokens[at + k], next = () => tokens[at++], eat = (t: string) => { if (tokens[at] !== t) throw new Error(`kernel: expected \`${t}\`, not \`${tokens[at]}\` (${tokens.slice(at - 8, at + 4).join(' ')})`); at++; };
  const skip = () => { for (let d = 0; at < tokens.length;) { const t = next(); if ('({['.includes(t)) d++; else if (')}]'.includes(t)) d--; else if (d === 0 && (t === ';' || t === ',')) return t; if (d < 0) { at--; return; } } };
  // (a constant expression: numbers, constants, operators)
  const constant = (from: number, to: number): number | undefined => {
    // (one number or one constant, as it is; else the expression worked out)
    if (to === from + 1) { const t = tokens[from]; if (consts.has(t)) return consts.get(t); if (/^(?:0x[0-9a-fA-F]+|\d+)$/.test(t)) return Number(t) | 0; }
    const text = tokens.slice(from, to).map(t => consts.has(t) ? String(consts.get(t)) : t).join(' ');
    return /^[\d\s+\-*/%&|^<>()~x0-9a-fA-F]+$/.test(text) ? (Function(`return (${text}) | 0`)() as number) : undefined;
  };
  // Find the functions first (a call may name one defined after it), the constants as they come.
  // (its body: the first `{` after its parameters, which may have one, `hosts = {}`)
  let close = tokens.indexOf('('); for (let d = 0; ; close++) { if (tokens[close] === '(') d++; if (tokens[close] === ')' && !--d) break; }
  const body = tokens.indexOf('{', close); at = body + 1;
  const starts: number[] = [];
  for (let guard = 0; at < tokens.length && peek() !== 'return'; ) {
    if (++guard > 1e6) throw new Error(`kernel: stuck at ${tokens.slice(at - 12, at + 12).join(' ')}`);
    if (peek() === 'function') { at++; const name = next(); functions.add(name); starts.push(at - 2); eat('('); let d = 1; while (d) { const t = next(); if (t === '(') d++; if (t === ')') d--; } eat('{'); for (let d = 1; d;) { const t = next(); if (t === '{') d++; if (t === '}') d--; } continue; }
    if (peek() === 'const' || peek() === 'let') { at++; for (;;) { const name = next(); if (peek() === ':') { at++; next(); } eat('='); const from = at, end = skip(), v = constant(from, at - (end ? 1 : 0)); if (v !== undefined && !(name in BUILTINS) && !(name in given)) consts.set(name, v); if (end !== ',') break; } continue; }
    skip();
  }
  for (const start of starts) { at = start + 1; const name = next(); if (!(name in BUILTINS)) func(name); }
  return p;

  function func(name: string) {
    const params: string[] = [];
    eat('('); while (peek() !== ')') { params.push(next()); if (peek() === ':') { at++; next(); } if (peek() === ',') at++; } eat(')');
    if (peek() === ':') { at++; next(); }
    const { jmp, when, label, call } = builder(p);
    let n = 0;
    const fresh = () => `$${n++}`, loops: [string, string][] = [];
    // (compiled to be debugged: each loop counts its rounds, from where it begins; one that goes round more than a limit
    // without ending tells the host which one it is (`debug(16, loop, rounds, 0)`), and goes on counting from nothing)
    const LOOPS = given.DEBUG ? (given.LOOP_LIMIT || 10000000) : 0;
    const guard = (k: string, at0: number) => {
      if (!LOOPS) return;
      const id = p.loops.length; p.loops.push(`${name}: ${tokens.slice(at0, at0 + 14).join(' ')}`);
      return id;
    };
    const round = (k: string, id: number | undefined) => {
      if (id === undefined) return;
      jmp('+', `$loop${k}`, `$loop${k}`, 1); jmp('>', '$t', `$loop${k}`, LOOPS); jmp('not', '$t', '$t'); when('$t', `#${k}round`);
      call('debug', undefined, 16, id, `$loop${k}`, 0); jmp('set', `$loop${k}`, 0); label(`#${k}round`);
    };
    // (a function's cells are its own, not its blocks': a name declared again inside a block where it is already declared is
    // the same cell, and would overwrite it; refused, by name)
    const scopes: Set<string>[] = [new Set(params)];
    const declare = (x: string) => { if (scopes.some(sc => sc.has(x))) throw new Error(`kernel: \`${x}\` in \`${name}\` is declared where one already is (a block's names are its function's cells): name it apart`); scopes[scopes.length - 1].add(x); };
    p.begin(name, ...params);
    const operand = (x: Operand) => x;
    // (an expression: what it answers, a cell or a constant)
    const expression = (): Operand => conditional();
    const conditional = (): Operand => {
      const c = binary(0);
      if (peek() !== '?') return c;
      at++; const out = fresh(), no = fresh(), done = fresh();
      when(c, `#${no}y`); jmp(`#${no}`);
      label(`#${no}y`); jmp('set', out, assignment()); jmp(`#${done}`);
      eat(':'); label(`#${no}`); jmp('set', out, assignment()); label(`#${done}`);
      return out;
    };
    const binary = (level: number): Operand => {
      if (level === LEVELS.length) return unary();
      let left = binary(level + 1);
      while (LEVELS[level].includes(peek())) {
        const op = next();
        if (op === '&&' || op === '||') {
          // (as JavaScript's: what decides is what it answers)
          const out = fresh(), done = fresh();
          jmp('set', out, left);
          if (op === '&&') { jmp('not', '$t', out); when('$t', `#${done}`); } else when(out, `#${done}`);
          jmp('set', out, binary(level + 1)); label(`#${done}`); left = out; continue;
        }
        const right = binary(level + 1);
        if (typeof left === 'number' && typeof right === 'number') { left = Function(`return (${left} ${op} ${right}) | 0`)(); continue; }
        const out = fresh(); jmp(BINARY[op], out, left, right); left = out;
      }
      return left;
    };
    const unary = (): Operand => {
      const t = peek();
      if (t === '!') { at++; const x = unary(), out = fresh(); jmp('not', out, x); return out; }
      if (t === '-') { at++; const x = unary(); if (typeof x === 'number') return -x | 0; const out = fresh(); jmp('-', out, 0, x); return out; }
      if (t === '~') { at++; const x = unary(); const out = fresh(); jmp('^', out, x, -1); return out; }
      if (t === '+') { at++; return unary(); }
      if (t === '++' || t === '--') { at++; const x = next(); jmp(t === '++' ? '+' : '-', x, x, 1); return x; }
      return postfix();
    };
    const postfix = (): Operand => {
      const t = next();
      if (t === '(') { const x = assignment(); eat(')'); return x; }
      if (/^\d|^0x/.test(t)) return Number(t) | 0;
      if (t === 'true') return 1; if (t === 'false') return 0;
      if (consts.has(t)) return consts.get(t)!;
      // (the thread's words: what the instance was given)
      if (t === 'THREAD') { const out = fresh(); jmp('thread', out); return out; }
      if (peek() === '(') {
        at++; const args: Operand[] = []; while (peek() !== ')') { args.push(assignment()); if (peek() === ',') at++; } eat(')');
        const native = BUILTINS[t];
        if (native) {
          const out = native === 'i32=' || native === 'u8=' || native === 'astore' || native === 'fill' ? undefined : fresh();
          if (native === 'cas' || native === 'fill') { const cells = args.map(a => { const c = fresh(); jmp('set', c, a); return c; }); jmp(native, out, cells[0]); }
          else jmp(native, out, ...args as [Operand, Operand]);
          return out ?? 0;
        }
        if (!functions.has(t) && !p.hosts.some(h => h.name === t)) throw new Error(`kernel: \`${t}\` is no function of it`);
        const out = fresh(); call(t, out, ...args); return out;
      }
      if (peek() === '++' || peek() === '--') { const was = fresh(); jmp('set', was, t); jmp(next() === '++' ? '+' : '-', t, t, 1); return was; }
      return t;
    };
    const assignment = (): Operand => {
      if (/^[A-Za-z_$]/.test(peek() ?? '') && !consts.has(peek()) && peek(1) !== undefined && /^([-+*/%&|^]|<<|>>|>>>)?=$/.test(peek(1))) {
        const name = next(), op = next(), x = assignment();
        if (op === '=') jmp('set', name, x); else jmp(BINARY[op.slice(0, -1)], name, name, x);
        return name;
      }
      return expression();
    };
    const statement = (): void => {
      const t = peek();
      if (t === '{') { at++; scopes.push(new Set()); while (peek() !== '}') statement(); scopes.pop(); at++; return; }
      if (t === ';') { at++; return; }
      if (t === 'let' || t === 'const' || t === 'var') { at++; for (;;) { const name = next(); declare(name); if (peek() === ':') { at++; next(); } if (peek() === '=') { at++; jmp('set', name, assignment()); } else jmp('set', name, 0); if (peek() !== ',') break; at++; } if (peek() === ';') at++; return; }
      if (t === 'if') {
        at++; eat('('); const c = assignment(); eat(')'); const k = fresh();
        if (typeof c === 'number') { if (!c) jmp(`#${k}else`); } else { jmp('not', '$t', c); when('$t', `#${k}else`); }
        statement();
        if (peek() === 'else') { at++; jmp(`#${k}end`); label(`#${k}else`); statement(); label(`#${k}end`); } else label(`#${k}else`);
        return;
      }
      if (t === 'while') {
        const id = guard('', at); at++; const k = fresh(); if (id !== undefined) jmp('set', `$loop${k}`, 0); label(`#${k}top`); round(k, id); eat('('); const c = assignment(); eat(')');
        jmp('not', '$t', c); when('$t', `#${k}end`); loops.push([`#${k}top`, `#${k}end`]); statement(); loops.pop(); jmp(`#${k}top`); label(`#${k}end`);
        return;
      }
      if (t === 'do') {
        const id = guard('', at); at++; const k = fresh(); if (id !== undefined) jmp('set', `$loop${k}`, 0); label(`#${k}top`); round(k, id); loops.push([`#${k}next`, `#${k}end`]); statement(); loops.pop();
        eat('while'); eat('('); label(`#${k}next`); const c = assignment(); eat(')'); if (peek() === ';') at++; when(c, `#${k}top`); label(`#${k}end`);
        return;
      }
      if (t === 'for') {
        const id = guard('', at); at++; eat('('); const k = fresh(); scopes.push(new Set());
        if (peek() !== ';') statement(); else at++;
        if (id !== undefined) jmp('set', `$loop${k}`, 0); label(`#${k}top`); round(k, id); if (peek() !== ';') { const c = assignment(); jmp('not', '$t', c); when('$t', `#${k}end`); } eat(';');
        const step = at; let d = 0; while (d > 0 || peek() !== ')') { const x = next(); if (x === '(') d++; if (x === ')') d--; } eat(')');
        loops.push([`#${k}step`, `#${k}end`]); statement(); loops.pop();
        const after = at; at = step; label(`#${k}step`); if (peek() !== ')') assignment(); at = after;
        jmp(`#${k}top`); label(`#${k}end`); scopes.pop();
        return;
      }
      if (t === 'return') { at++; jmp('set', '&.value', peek() === ';' || peek() === '}' ? 0 : assignment()); if (peek() === ';') at++; jmp('&.caller'); return; }
      if (t === 'break' || t === 'continue') { at++; if (peek() === ';') at++; const [top, end] = loops[loops.length - 1]; jmp(t === 'break' ? end : top); return; }
      assignment(); if (peek() === ';') at++;
    };
    void operand;
    eat('{'); while (peek() !== '}') statement(); at++;
    jmp('set', '&.value', 0); jmp('&.caller');
  }
}

// The kernel: the reader and what runs what it reads, over the memory every thread shares (layouts above). Each function takes
// and answers 32-bit integers; `w`/`set` a word, `b`/`setb` a byte, and the atomics. `t` is a thread's own words (`T_…`).
export function kernel(memory: ArrayBufferLike, thread = 0, debugging = 0, hosts: Hosts = {}) {
  const i32 = new Int32Array(memory), u8 = new Uint8Array(memory);
  // (`--debug`: what it reads and writes checked to be in the memory; and the host told what it is doing, `debug(…)`)
  const DEBUG = debugging | 0, outside = (a: number, n: number) => { if (!(a >= 0 && a + n <= u8.length)) throw new RangeError(`the kernel read or wrote outside the memory, at ${a}`); };
  const debug = (kind: number, a: number, b: number, c: number) => hosts.debug ? hosts.debug(kind, a, b, c) : 0;
  // (built: a rule's body as a function of its own (`Program{O: @wasm.none}`), run by the host's table: what it answers)
  const compiled = (fn: number, t: number, f: number, from: number) => hosts.compiled ? hosts.compiled(fn, t, f, from) : 0;
  // (what is said, told the host as it is said: it says it, no more is kept)
  const told = (at: number, kind: number, a: number, c: number) => hosts.told ? hosts.told(at, kind, a, c) : 0;
  const w = DEBUG ? (a: number) => (outside(a, 4), i32[a >> 2]) : (a: number) => i32[a >> 2], set = DEBUG ? (a: number, v: number) => { outside(a, 4); i32[a >> 2] = v; } : (a: number, v: number) => { i32[a >> 2] = v; };
  const b = DEBUG ? (a: number) => (outside(a, 1), u8[a]) : (a: number) => u8[a], setb = DEBUG ? (a: number, v: number) => { outside(a, 1); u8[a] = v; } : (a: number, v: number) => { u8[a] = v; };
  const aload = (a: number) => Atomics.load(i32, a >> 2), astore = (a: number, v: number) => { Atomics.store(i32, a >> 2, v); }, xadd = (a: number, v: number) => Atomics.add(i32, a >> 2, v), fill = (a: number, v: number, n: number) => { u8.fill(v, a, a + n); }, cas = (a: number, o: number, n: number) => Atomics.compareExchange(i32, a >> 2, o, n);
  const clz = (x: number) => Math.clz32(x), ctz = (x: number) => x === 0 ? 32 : 31 - Math.clz32(x & -x);
  void astore; void clz; void ctz; void setb;

  // (the words every thread shares)
  const HEAP = 0, OPEN = 4, OPEN_LENGTH = 8, CLOSE = 12, CLOSE_LENGTH = 16, GLOBAL = 24, SEPARATOR = 36, SEPARATOR_LENGTH = 40, CLASSES = 44, PAIRS = 48, FRAMES = 52;
  const WORDS = 56, LOG = 60, LOG_N = 64, LOG_CAP = 68, AFTER = 72, AFTER_HEAD = 76, AFTER_TAIL = 80, AFTER_CAP = 84, ACTIVE = 88, LIST = 92, LIST_N = 96, LIST_CAP = 100, LIMIT = 104, OOM = 108, TRASH = 112, BUDGET = 116, FAIL_FAST = 120, MEMO = 124, MEMO_MASK = 128, PEND = 140, PEND_N = 136, PHASE = 144, NEXT = 148, DONE = 152, ANY = 156, ROUND = 160, FINAL = 0x7FFFFFFF, READS = 164, READS_N = 168, READS_CAP = 172, LAZY = 180, LAZY_N = 184, LAZY_CAP = 188, PASSED = 192, FAILED = 196, TMEMO = 208, TMEMO_MASK = 212, BEGINS = 200, BEGINS_N = 4096, COUNTS = 216, MEMO_ENTRY = 60, TMEMO_ENTRY = 40, FILES_N = 136, CLOSES = 220, PAIRS_GEN = 224, KINDS = 228, MAPPED = 232, NOTHING = 236, TEXTS = 252, RULES = 256, RULES_N = 260, RULES_CAP = 264, OWN = 268, TOKEN_N = 272;
  // (what --debug counts, at COUNTS: the host says them)
  const K_READ = 0, K_NODE = 1, K_VISIT = 2, K_HOLE_LED = 3, K_MATCH = 4, K_READING = 5, K_AFRESH = 6, K_TYPED = 7, K_APPLY = 8, K_FRAMED = 9, K_SHADOWED = 10;
  function count(k: number) { xadd(w(COUNTS) + 4 * k, 1); }
  // (this thread's words: given, a constant of what is compiled for it)
  const THREAD = thread | 0, CHUNK = 1 << 16;
  // (a thread's words)
  const T_CHUNK = 52, T_CHUNK_END = 56, T_SLOT = 60, T_SLOT_END = 64, T_HELD = 68, T_HELD_N = 72, T_SCRATCH = 0, T_JUMP_S = 4, T_JUMP_N = 8, T_JUMP_V = 12, T_HOLE = 16, T_TESTING = 20, T_BUDGET = 24, T_SAID = 28, T_FAULT = 32, T_ON = 36, T_A = 40, T_B = 44, T_ERRED = 48, T_DEPTH = 76, T_SH = 80, T_SH_N = 84, T_MARK = 88, T_MARK_LO = 92, T_MARK_HI = 96, T_ROOT = 100, T_ISO = 104, T_QUIET = 108, T_DECLS = 112, T_DECLS_N = 116, T_HOLE_A = 120, T_HOLE_B = 124, T_DECL = 128, T_PLACE_IN = 132, T_INL_S = 136, T_INL_E = 140, T_INL_F = 144, T_TYP = 148, T_TYP_N = 152, T_REFF = 156, T_CUT = 160, T_LEXV = 164, T_SHGEN = 168, T_CS = 172, T_CE = 176, T_CT = 180, T_RAN = 184, T_SCRATCH_END = 188, T_BODY = 192, T_ONE = 196, T_MEMBER = 200, T_BODIES = 204, T_BODIES_N = 208, T_FALLBACK = 212, T_REG = 216, T_REG_N = 220, T_WROTE = 224, T_WROTE_N = 228, T_FREE = 232, T_FREE_N = 236, T_REG_SLOT = 240, T_REG_SLOTEND = 244, T_REG_LAZY = 248, T_REG_AT = 252, T_SKIP = 256, T_NAMED = 260, T_LS = 264, T_LE = 268, T_WRITER_SELF = 272, T_LB = 276, T_WRITER = 280, T_TV = 284, T_TVS = 288, T_TVE = 292, T_MEMBER_S = 296, T_MEMBER_E = 300, T_ALL_S = 304, T_ALL_E = 308, T_TOKEN = 312, T_HERE = 316, T_IN2_S = 320, T_IN2_E = 324, T_IN2_F = 328, T_DEFIN = 332, T_OMEMO = 336, T_QBUDGET = 340, T_UNALIGNED = 344, T_WRITTEN_IN = 348, T_CHECKS = 352, CHECKS = 30, T_STACK = 480, T_DEEPC = 484, T_GIVEN = 488, T_GIVEN_N = 492, T_ALT = 496, T_BEGUN = 500, T_BEGUN_N = 504, T_GREW = 508, T_FREE_TAKEN = 512, T_SKIPS = 516, T_SKIPS_N = 520, T_NAMING = 524, T_NAMING_N = 528, GROWN = 15 << 25, TEST_GROWN = 1 << 25, GIVEN_N = 16, OMEMO_MASK = (1 << 14) - 1, LEFTS = 64, TYPS = 64, SHADOWS = 1024, TYPINGS = 1, DECLS = 64, BEGUN = 40;
  // (the words the host knows, at WORDS: where each is and how long)
  const W_CALLER = 0, W_THIS = 1, W_AFTERWARDS = 2, W_REPORT = 3, W_ERRED = 4, W_GOTO = 5, W_LABEL = 6, W_DOT = 7, W_AMP = 8, W_TYPE = 9, W_INCLUDE = 10, W_READ = 11, W_NEXT = 12, W_MEMBERS = 13, W_STATIC = 14, W_UNDEFINED = 15, W_UNSET = 16, W_OPERATED = 17, W_ADMITS = 18, W_HEAD = 19, W_VALUE = 20, W_NARROWS = 21, W_COMPONENTS = 22, W_EACH = 23, W_NONEMPTY = 24, W_LISTING = 25, W_NODE_NAME = 26, W_STRING_NAME = 27, W_OF = 28, W_WRITTEN_AS = 29, W_NAMED = 30, W_WRITTEN_NAME = 31, W_NAMES = 32, W_TAIL = 33, W_NAMED_LIKE = 34, W_MEMBER = 35, W_STRUCTURE_AS = 36, W_OUTPUT = 37, W_ARGUMENTS = 38, W_QUOTED = 39, ARGV_SLOT = 24, M_TEXT = 0, M_FIRST = 1, M_REST = 2, M_NOTHING = 3, M_GIVEN = 4, M_TAKING = 5, M_SAME = 6, M_UNTIL = 7, M_GLYPHS = 8, M_COUNT = 9, M_TRUTH = 10, M_NUMBER = 11, M_NUMERAL = 12, M_CHARACTER = 13, M_SUPERPOSED = 14, M_SUPERPOSING = 15, M_DOTTED = 16, M_PAST = 17, M_CUTS = 18, M_UNESCAPED = 19, M_SPAN = 20;
  // (records)
  const N_LAST = 0, N_BASE = 4, N_IS = 8, N_A = 12, N_B = 16, N_PARENT = 20, N_ALSO = 24, NODE = 28;
  const F_RULE = 28, F_CALLER = 32, F_THIS = 36, F_START = 40, F_END = 44, F_CLOSURE = 48, F_RECEIVER = 52, F_TAKES = 56, TAKE = 32;
  // (T_LEX: the rules visible where it was taken, what its code is read with where it was written)
  const T_START = 0, T_END = 4, T_VIS = 8, T_ORIGIN = 12, T_THIS = 16, T_VALUE = 20, T_STATE = 24, T_LEX = 28;
  const R_PREV = 0, R_KIND = 4, R_MASK = 8, R_HOLES = 12, R_BS = 16, R_BE = 20, R_CLOSURE = 24, R_PARTS = 28, R_HEAD = 32, R_FLAGS = 36, R_OWNER = 40, R_BODY = 44, R_SKIP = 48, R_INL_S = 52, R_INL_E = 56, R_INL_F = 60, R_ALL_S = 64, R_ALL_E = 68, R_STAMP = 72, R_IN2_S = 76, R_IN2_E = 80, R_IN2_F = 84, R_FN = 88, R_SIG = 92, R_PART = 96, PART = 24, SKIPS = 130, SEQ_AT = 130, KIND_AT = 131, MANY = 12;
  const RULE = 0, DEFINE = 1, EXTERNAL = 2, VALUE = 3;
  const LITERAL = 0, SPACE = 1, HOLE = 2, HUG = 16, WORD = 32, VALUED_HOLE = 64, OPER = 128;
  // (IS_CALLED: in a left side, a place and the brackets after it, `f (x)`: its head (N_A to N_B), the place (N_PARENT))
  // (IS_APPLIED: in a left side, a closure and a name after it, no brackets, `xs.for x`: what the head reads up to the name (N_A
  // to N_B), the name's end (N_PARENT))
  const IS_NODE = 0, IS_TEXT = 1, IS_PLACE = 2, IS_HEAD = 3, IS_HOLE = 4, IS_FRAME = 5, IS_CALLED = 6, IS_APPLIED = 7, ROOT = 1;
  // (READER: a head of holes only, `{x: T}`, `{first: T}{rest: T[]}`, what reads a T; not a method's, `{this}{argument}`,
  // which reads on a value)
  // (LEFT, wanted of a reading only: it is a left side, a word nothing reads before what is read on it is declared there)
  // (TYPE_READER, refused only: a READER of a node other than the language's)
  const DEFINES = 1, LED = 2, HOLES = 4, DEAD = 8, METHOD = 16, READER = 32, LEFT = 64, TYPE_READER = 128, GIVES = 1024, TAKES = 2048, OWNS = 4096, GLYPHS = 16384, NUMERAL = 32768, SUPERPOSING = 65536, REFUSES = 131072, MEMBER = 262144, STATIC = 524288, CALLS = 1048576, CUTS = 2097152, MEMBERS_MARK = 99, GLYPHED = 288, GLYPHED_N = 4096, NUMBERS = 276, TRUE_ = 280, FALSE_ = 284, NUMERAL_AT = 296, NUMBER_OPS = 304, CHARS = 312, COUNTED = 320, SUPER_NODE = 324, SUPERPOSING_AT = 328, POOL = 344, POOL_N = 348, POOL_LOCK = 352, POOL_BYTES = 364, POOL_CAP = 1 << 15;
  // (a reading: [kind, start, end, a, c, d])
  const K_EMPTY = 0, K_UNREAD = 1, K_LATER = 2, K_RULE = 3, K_REF = 4, K_NAME = 5, K_HELD = 6, K_ON = 7, READ = 32;
  // (a body: [count, ...steps: [kind, start, end, a, c, d]])
  const S_READ = 0, S_LABEL = 1, S_LABELLED = 2, S_GOTO = 3, S_TO = 4, STEP = 24;
  // (what is said: [at, kind, a, c])
  // (what the host is told, with --debug: a statement read and done, a rule applied and done, one defined, memory out)
  const D_STATEMENT = 1, D_STATEMENT_END = 2, D_APPLY = 3, D_APPLY_END = 4, D_DEFINE = 5, D_OOM = 6, D_BLOCK = 7, D_BLOCK_END = 8, D_TEST = 9, D_TEST_END = 10, D_FAULT = 11, D_SAID = 12, D_TYPE = 13, D_TYPE_END = 14, D_RESULT = 22, D_SETTLED = 18, D_READING = 20, D_KEY = 30, D_FREE = 32;
  const L_UNREAD = 1, L_UNLABELLED = 2, L_BUDGET = 3, L_OOM = 4, L_REPORT = 5, L_CYCLE = 6, L_NOT_ON = 7, L_EXTERNAL = 8, L_DEEP = 9, L_STYLED = 10, L_HELD = 11, L_DEFINED = 12, L_VALUED = 13, L_SILENT = 14, L_PASSED = 15, L_MEMORY = 16, L_FULL = 17, L_OUTPUT = 18, HELD = 4096, DEPTH = 2000, REGION = 4096, WROTE = 1 << 16, BODIES = 1024;
  const SCRATCH = 1024;

  // ---- memory

  // Allocated: its words zero. (Past the limit: a place nothing reads, and said once.)
  // (each thread from chunks of its own, so threads don't wait on one another)
  // (what the threads share of the memory tests let go of: taken and given under a lock, the last ones tried first)
  function locked() { for (let k = 0; k < 1 << 30; k++) if (cas(POOL_LOCK, 0, 1) === 0) return; }
  function pooled(n: number): number {
    locked(); let at = 0; const pn = w(POOL_N);
    for (let i = pn - 1; i >= 0 && i >= pn - 32; i--) if (w(w(POOL) + 8 * i + 4) >= n) { at = w(w(POOL) + 8 * i); set(THREAD + T_FREE_TAKEN, w(w(POOL) + 8 * i + 4)); xadd(POOL_BYTES, -w(w(POOL) + 8 * i + 4)); set(w(POOL) + 8 * i, w(w(POOL) + 8 * (pn - 1))); set(w(POOL) + 8 * i + 4, w(w(POOL) + 8 * (pn - 1) + 4)); set(POOL_N, pn - 1); break; }
    astore(POOL_LOCK, 0); return at;
  }
  function pool(a: number, n: number): number {
    locked(); const pn = w(POOL_N); let ok = 0;
    if (pn < POOL_CAP) { set(w(POOL) + 8 * pn, a); set(w(POOL) + 8 * pn + 4, n); set(POOL_N, pn + 1); xadd(POOL_BYTES, n); ok = 1; }
    astore(POOL_LOCK, 0); return ok;
  }
  // (String.ray's `Escape`: what `\c` stands for, by c; none, -1)
  function escape_of(c: number): number {
    return c === 48 ? 0 : c === 97 ? 7 : c === 98 ? 8 : c === 116 ? 9 : c === 110 ? 10 : c === 102 ? 12 : c === 114 ? 13 : c === 101 ? 27 : c === 92 || c === 34 || c === 123 ? c : -1;
  }
  function hex_digit(c: number): number { return c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1; }
  function alloc(n: number): number {
    n = (n + 3) & -4;
    if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1108, n, 0);
    let at = w(THREAD + T_CHUNK);
    if (at + n > w(THREAD + T_CHUNK_END)) {
      let size = n > CHUNK ? n : CHUNK;
      // (what one statement may take that is new: past that it is stopped, said (what it reads makes more and more), not
      // all the memory there is taken)
      // (a test less: every thread runs one, all of them in the same memory; past it, asked again with each new chunk, so
      // what stops it is not undone by what it was in)
      const grew = w(THREAD + T_GREW) + size, allowed = w(THREAD + T_TESTING) ? TEST_GROWN : GROWN;
      if (grew > allowed) { if (DEBUG && w(THREAD + T_FAULT) !== L_MEMORY) debug(D_FAULT, 1098, w(THREAD + T_DEPTH), 0); set(THREAD + T_FAULT, L_MEMORY); }
      // (and a test, when what is left of all the memory is less than one test may take: stopped too)
      // (what is free: past where the memory is used, and what tests let go of, shared)
      // (kept free past that: twice what one may take, what this one asks, and a little for each thread running a test (each may
      // take more before it asks again))
      if (w(THREAD + T_TESTING) && w(LIMIT) - aload(HEAP) + aload(POOL_BYTES) < 2 * allowed + size + aload(ACTIVE) * (CHUNK << 4) && w(THREAD + T_FAULT) !== L_MEMORY) set(THREAD + T_FAULT, L_FULL);
      // (and a statement read, when what is left is less than one may take: stopped, the run not)
      if (!w(THREAD + T_TESTING) && w(LIMIT) - aload(HEAP) + aload(POOL_BYTES) < allowed + size && w(THREAD + T_FAULT) !== L_MEMORY) set(THREAD + T_FAULT, L_FULL);
      // (one a test let go of, big enough; else a new one)
      const fl = w(THREAD + T_FREE), fn = w(THREAD + T_FREE_N);
      at = 0;
      // (debugging: none taken again, so what still keeps one is seen)
      for (let i = fn - 1; i >= 0 && i >= fn - 8; i--) if (w(fl + 8 * i + 4) >= n) { at = w(fl + 8 * i); size = w(fl + 8 * i + 4); set(fl + 8 * i, w(fl + 8 * (fn - 1))); set(fl + 8 * i + 4, w(fl + 8 * (fn - 1) + 4)); set(THREAD + T_FREE_N, fn - 1); break; }
      // (else one any thread's test let go of, from what they share)
      if (!at && w(POOL)) { at = pooled(n); if (at) size = w(THREAD + T_FREE_TAKEN); }
      // (in a test, a new one on pages of its own: whose it is, by its pages)
      if (!at && w(THREAD + T_REG_AT)) { size = (size + 65535) & -65536; for (let k = 0; k < 1 << 20; k++) { const h = aload(HEAP), a = (h + 65535) & -65536; if (cas(HEAP, h, a + size) === h) { at = a; break; } } if (DEBUG) { debug(D_FAULT, 1093, 4, size); debug(D_FAULT, 1093, size > 65536 ? 5 : 6, size); debug(D_FAULT, 1093, 7 + (w(THREAD + T_FREE_N) > 0 ? 1 : 0), n); } if ((at < 0 || at > w(LIMIT) - size)) { if (DEBUG) debug(D_OOM, n, 0, 0); if (!xadd(OOM, 1)) log(0, L_OOM, 0, 0); return w(TRASH); } }
      if (!at) {
        at = xadd(HEAP, size);
        if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1093, 1, size);
        if ((at < 0 || at > w(LIMIT) - size)) { if (DEBUG) debug(D_OOM, n, 0, 0); if (!xadd(OOM, 1)) log(0, L_OOM, 0, 0); return w(TRASH); }
      }
      set(THREAD + T_GREW, w(THREAD + T_GREW) + size);
      // (in a test: one of its own, let go of when it is done)
      const rg = w(THREAD + T_REG), rn = w(THREAD + T_REG_N);
      if (w(THREAD + T_REG_AT) && rn < REGION) { set(rg + 8 * rn, at); set(rg + 8 * rn + 4, size); set(THREAD + T_REG_N, rn + 1); if (!(at & 65535)) for (let pg = at >>> 16; pg < (at + size) >>> 16; pg++) set(w(OWN) + 4 * pg, w(THREAD + T_TOKEN)); else set(THREAD + T_UNALIGNED, 1); }
      set(THREAD + T_CHUNK_END, at + size);
    }
    set(THREAD + T_CHUNK, at + n);
    if (DEBUG) for (let p = at; p < at + n; p += 4) { if (w(p) !== 0 && w(p) !== -1) debug(D_FAULT, 93, p, w(p)); set(p, 0); }
    return at;
  }
  // (a slot of what is kept for all (read once, checked once, how a type begins) written in a test: emptied when it is done)
  function wrote(slot: number) { if (!w(THREAD + T_REG_AT)) return; const n = w(THREAD + T_WROTE_N); if (n < WROTE) { set(w(THREAD + T_WROTE) + 4 * n, slot); set(THREAD + T_WROTE_N, n + 1); } else set(THREAD + T_WROTE_N, WROTE + 1); }
  // (made in this test's own memory)
  function in_region(n: number): number {
    const rg = w(THREAD + T_REG);
    if (!w(THREAD + T_REG_AT)) return 0;
    if (n >= w(THREAD + T_REG_AT) && n < w(THREAD + T_MARK_HI)) return 1;
    // (on pages it took: by whose they are; else, one it took that is not on its own pages)
    if (n > 0 && w(w(OWN) + 4 * (n >>> 16)) === w(THREAD + T_TOKEN)) return 1;
    if (w(THREAD + T_UNALIGNED)) for (let i = 0; i < w(THREAD + T_REG_N) && i < REGION; i++) if ((w(rg + 8 * i) & 65535) && n >= w(rg + 8 * i) && n < w(rg + 8 * i) + w(rg + 8 * i + 4)) return 1;
    return 0;
  }
  // (let go of by a test that is done, and not taken again since: nothing may still keep it)
  function freed(n: number): number {
    const fl = w(THREAD + T_FREE);
    for (let i = 0; i < w(THREAD + T_FREE_N) && i < REGION; i++) if (n >= w(fl + 8 * i) && n < w(fl + 8 * i) + w(fl + 8 * i + 4)) return 1;
    return 0;
  }
  // A test's own memory: from where allocation is when it begins, what it takes after; let go of when it (and what it held) is
  // done, but for what it gave the frame it is (a value of no holes, its style: made again, kept). What was kept for all from
  // it (read once, checked once, its frames painted) is forgotten with it.
  function region_begin(t: number, f: number) {
    if (!w(t + T_REG)) { set(t + T_FREE, alloc(8 * REGION)); set(t + T_WROTE, alloc(4 * WROTE)); set(t + T_REG, alloc(8 * REGION)); set(t + T_BODIES, alloc(8 * BODIES)); if (w(MEMO)) set(t + T_OMEMO, alloc(MEMO_ENTRY * (OMEMO_MASK + 1))); }
    if (!w(t + T_HELD)) set(t + T_HELD, alloc(8 * HELD));
    if (!w(t + T_TYP)) set(t + T_TYP, alloc(12 * TYPS));
    if (!w(t + T_DECLS)) set(t + T_DECLS, alloc(12 * DECLS));
    if (!w(t + T_SH)) set(t + T_SH, alloc(12 * SHADOWS));
    if (!w(t + T_LS)) set(t + T_LS, alloc(8 * LEFTS));
    set(t + T_REG_N, 0); set(t + T_WROTE_N, 0); set(t + T_UNALIGNED, 0); set(t + T_REG_AT, w(t + T_CHUNK)); set(t + T_TOKEN, xadd(TOKEN_N, 1) + 1);
    set(t + T_REG_SLOT, w(t + T_SLOT)); set(t + T_REG_SLOTEND, w(t + T_SLOT_END)); set(t + T_REG_LAZY, aload(LAZY_N));
    return w(f + N_LAST);
  }
  function region_end(t: number, f: number, rules: number) {
    // (what it gave its frame: each value of no holes read now, its text kept)
    const keep = w(t + T_SCRATCH_END) - 256; let kn = 0;
    for (let o = w(f + N_LAST); o && o !== rules && kn < 8; o = w(o)) {
      if (w(o + R_HOLES) || !w(o + R_HEAD)) continue;
      const hd = w(o + R_HEAD), v = apply(t, o, 0, f, 0, f, w(hd + N_A), w(hd + N_B), f, f);
      if (v && w(v + N_IS) === IS_TEXT && !in_region(w(v + N_A))) { set(keep + 16 * kn, w(hd + N_A)); set(keep + 16 * kn + 4, w(hd + N_B)); set(keep + 16 * kn + 8, w(v + N_A)); set(keep + 16 * kn + 12, w(v + N_B)); kn++; }
    }
    const kept = keep;
    set(f + N_LAST, rules);
    // (forgotten: what was kept for all from it, its frames, the types it put off)
    const wn = w(t + T_WROTE_N);
    if (wn > WROTE) { for (let i = 0; i <= OMEMO_MASK && w(t + T_OMEMO); i++) astore(w(t + T_OMEMO) + MEMO_ENTRY * i, 0); for (let i = 0; i <= w(TMEMO_MASK) && w(TMEMO); i++) astore(w(TMEMO) + TMEMO_ENTRY * i, 0); for (let i = 0; i < BEGINS_N; i++) astore(w(BEGINS) + 44 * i, 0); }
    else for (let i = 0; i < wn; i++) astore(w(w(t + T_WROTE) + 4 * i), 0);
    if (DEBUG && wn > WROTE) debug(D_FAULT, 94, w(f + F_START), w(f + F_END));
    // (what lies outside every chunk it took is not its own: asked first)
    let lo = w(t + T_REG_AT), hi = w(t + T_MARK_HI);
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) { const a = w(w(t + T_REG) + 8 * i), e = a + w(w(t + T_REG) + 8 * i + 4); if (a < lo) lo = a; if (e > hi) hi = e; }
    for (let k = w(t + T_REG_SLOT); k < w(t + T_SLOT) && k < w(LIST_CAP); k++) { const v = w(w(LIST) + 4 * k); if (v >= lo && v < hi && in_region(v)) set(w(LIST) + 4 * k, 0); }
    for (let i = w(t + T_REG_LAZY); i < aload(LAZY_N) && i < w(LAZY_CAP); i++) { const l = w(LAZY) + 24 * i, v = w(l); if (v >= lo && v < hi && in_region(v)) set(l, 0); }
    // (let go of: its chunks free for what comes after, allocation where it was)
    const rg = w(t + T_REG), fl = w(t + T_FREE);
    if (DEBUG) { let held = 0; for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) held += w(rg + 8 * i + 4); if (held > 50 << 20) debug(D_FAULT, 1094, w(f + F_START), held >> 20); }
    // (to what every thread shares, so one thread's large test is not memory only it can use again; full, its own)

    // (debugging: what it let go of unreadable until it is allocated again, so what still keeps it is seen)
    // (and as new: what is allocated is all zero)
    const was = DEBUG ? -1 : 0;
    if (DEBUG) { debug(D_FREE, w(t + T_REG_AT), w(t + T_MARK_HI), f); for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) debug(D_FREE, w(rg + 8 * i), w(rg + 8 * i) + w(rg + 8 * i + 4), f); }
    if (w(t + T_MARK_HI) > w(t + T_REG_AT)) fill(w(t + T_REG_AT), was, w(t + T_MARK_HI) - w(t + T_REG_AT));
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) fill(w(rg + 8 * i), was, w(rg + 8 * i + 4));
    // (given back once cleared: what another thread takes is all zero)
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) { if (w(POOL) && pool(w(rg + 8 * i), w(rg + 8 * i + 4))) continue; const fn = w(t + T_FREE_N); if (fn < REGION) { set(fl + 8 * fn, w(rg + 8 * i)); set(fl + 8 * fn + 4, w(rg + 8 * i + 4)); set(t + T_FREE_N, fn + 1); } }
    if (w(t + T_BODIES_N)) { for (let i = 0; i < 2 * BODIES; i++) set(w(t + T_BODIES) + 4 * i, 0); set(t + T_BODIES_N, 0); }
    set(t + T_REG_N, 0);
    set(t + T_CHUNK, w(t + T_REG_AT)); set(t + T_CHUNK_END, w(t + T_MARK_HI));
    set(t + T_REG_AT, 0);
    // (and what it gave its frame, made again here)
    for (let i = 0; i < kn; i++) {
      const hs = w(kept + 16 * i), he = w(kept + 16 * i + 4), value = node(IS_TEXT, w(kept + 16 * i + 8), w(kept + 16 * i + 12), w(TEXTS) || w(GLOBAL), 0), named_ = alloc(R_PART + PART);
      set(named_ + R_KIND, VALUE); set(named_ + R_MASK, bytes(hs, he)); set(named_ + R_BS, value); set(named_ + R_PARTS, 1); set(named_ + R_FLAGS, LED);
      set(named_ + R_HEAD, node(IS_HEAD, hs, he, f, 0)); set(named_ + R_OWNER, f); set(named_ + R_PART, LITERAL); set(named_ + R_PART + 4, skip(hs, he)); let z = he; while (z > hs && b(z - 1) <= 32) z--; set(named_ + R_PART + 8, z - skip(hs, he));
      link(f, named_);
    }
    set(t + T_SLOT, w(t + T_REG_SLOT)); set(t + T_SLOT_END, w(t + T_REG_SLOTEND));
  }
  function node(is: number, a: number, c: number, parent: number, also: number): number {
    const n = alloc(NODE), anchor = alloc(R_PART);
    set(anchor + R_FLAGS, DEAD); set(anchor + R_OWNER, n);
    set(n + N_LAST, anchor); set(n + N_BASE, anchor); set(n + N_IS, is); set(n + N_A, a); set(n + N_B, c); set(n + N_PARENT, parent); set(n + N_ALSO, also);
    return n;
  }
  // (the node a rule is in)
  function owner(rule: number) { return rule ? w(rule + R_OWNER) : w(GLOBAL); }
  // A rule's application: what its holes took (`caps`: start, end each), written with `names` (its takes read where `written`).
  function frame(rule: number, caller: number, self: number, s: number, e: number, caps: number, names: number, written: number, on: number): number {
    const holes = rule ? w(rule + R_HOLES) : 0, f = alloc(F_TAKES + TAKE * holes), seen = w(FRAMES) ? w(w(FRAMES) + N_BASE) : 0;
    set(f + N_LAST, seen); set(f + N_BASE, seen); set(f + N_IS, IS_FRAME); set(f + N_PARENT, w(FRAMES));
    set(f + F_RULE, rule); set(f + F_CALLER, caller); set(f + F_THIS, self); set(f + F_START, s); set(f + F_END, e); set(f + F_CLOSURE, rule ? w(rule + R_CLOSURE) : 0); set(f + F_RECEIVER, on);
    for (let i = 0; i < holes; i++) {
      const tk = f + F_TAKES + TAKE * i;
      // (a part of a typed hole's text another rule took (`,` in `{arguments: Arguments}`): read by that type too)
      const tv = w(THREAD + T_TV), vis = w(rule + R_PART + PART * part(rule, i) + 16) || (tv && w(rule + R_OWNER) !== tv && w(caps + 8 * i) >= w(THREAD + T_TVS) && w(caps + 8 * i + 4) <= w(THREAD + T_TVE) ? tv : 0);
      set(tk + T_START, w(caps + 8 * i)); set(tk + T_END, w(caps + 8 * i + 4)); set(tk + T_VIS, vis); set(tk + T_ORIGIN, names); set(tk + T_THIS, written); set(tk + T_LEX, w(THREAD + T_LEXV));
    }
    // (listed, for what is painted; not a test's own, forgotten when it is done)
    if (rule && !w(THREAD + T_REG_AT)) {
      let k = w(THREAD + T_SLOT);
      if (k >= w(THREAD + T_SLOT_END)) { k = xadd(LIST_N, 256); set(THREAD + T_SLOT_END, k + 256); }
      set(THREAD + T_SLOT, k + 1);
      if (k < w(LIST_CAP)) set(w(LIST) + 4 * k, f);
    }
    return f;
  }
  function part(rule: number, hole: number) { for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && w(q + 12) === hole) return k; } return 0; }
  // Said: where, what kind, about what.
  function log(at: number, kind: number, a: number, c: number) {
    // (quiet, a check: nothing said; but memory running out is said wherever it happens)
    if (w(THREAD + T_QUIET) && kind !== L_OOM) return;
    told(at, kind, a, c);
  }
  function say(t: number, at: number, kind: number, a: number, c: number) {
    if (DEBUG) { debug(D_SAID, kind, a, c); debug(D_FAULT, 1091, at, w(t + T_DEPTH)); } log(at, kind, a, c); set(t + T_SAID, w(t + T_SAID) + 1);
  }
  // (too deep: the rules applied last, the fewest that repeat (the same rule again, each `period` deep), outermost first,
  // each its head and where it was applied; kept (not in what a test lets go of) to be said with the fault)
  // (a rule the map says superposes, `{f}({argument: Superposed})`, applied: its typed holes' values (read once, kept in their
  // takes), each asked as the kernel answers `superposed`; one superposed, its body (-1); none, what is read there without it,
  // given those values (not read again: a call in a call in a call is read once, not twice at each))
  function superposing(t: number, rule: number, applied: number): number {
    // (in a left side: what the rules before it read there, nothing read)
    const gs = w(t + T_GIVEN), g0 = w(t + T_GIVEN_N), asks = !w(t + T_DECL) && w(SUPER_NODE);
    let any = 0, h = 0;
    for (let k = 0, n = asks ? w(rule + R_PARTS) : 0; k < n; k++) {
      const q = rule + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      if (w(q + 16)) {
        // (read as code, not by its type: the type is asked of what it answers)
        const tk = applied + F_TAKES + TAKE * h; set(tk + T_VIS, 0); const v = valued(t, tk);
        if (stopped(t)) { set(t + T_GIVEN_N, g0); return 0; }
        if (v && superposed_node(v, 0)) any = 1;
        const gn = w(t + T_GIVEN_N);
        if (gs && gn < GIVEN_N) { const x = gs + 16 * gn; set(x, skip(w(tk), w(tk + 4))); set(x + 4, trim_end(w(tk), w(tk + 4))); set(x + 8, w(tk + T_ORIGIN)); set(x + 12, v); set(t + T_GIVEN_N, gn + 1); }
      }
      h++;
    }
    if (any) { set(t + T_GIVEN_N, g0); return -1; }
    // (none: what reads it without it, given what was read (the register emptied by who reads that))
    set(t + T_ALT, 1); return 0;
  }
  // (a method applied, its typed holes each asked of what they took, as written where they were (once, now, not at every
  // reading that tries it): one not of its type, refused)
  function refused(t: number, rule: number, applied: number, written: number): number {
    if (w(t + T_DECL)) return 0;
    let h = 0;
    for (let k = 0, n = w(rule + R_PARTS); k < n; k++) {
      const q = rule + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      const type = w(q + 16);
      if (type > 1) {
        const tk = follow(applied + F_TAKES + TAKE * h, 1), sc = w(t + T_SCRATCH), wv = w(t + T_WRITTEN_IN);
        if (sc + 3 * SCRATCH > w(t + T_SCRATCH_END)) return 0;
        set(t + T_SCRATCH, sc + SCRATCH); set(t + T_WRITTEN_IN, written);
        const ok = typed_(w(tk), w(tk + 4), type, sc);
        set(t + T_SCRATCH, sc); set(t + T_WRITTEN_IN, wv);
        if (!ok) return 1;
      }
      h++;
    }
    return 0;
  }
  // (a take of a span a superposing rule read, there: that value)
  function given(tk: number): number {
    const gs = w(THREAD + T_GIVEN), n = w(THREAD + T_GIVEN_N); if (!n) return 0;
    const a = skip(w(tk), w(tk + 4)), z = trim_end(w(tk), w(tk + 4)), o = w(tk + T_ORIGIN);
    for (let i = n - 1; i >= 0; i--) { const x = gs + 16 * i; if (w(x) === a && w(x + 4) === z && w(x + 8) === o) return w(x + 12); }
    return 0;
  }
  // (nothing read it: said, or, too deep, which rules went round)
  function unread(t: number, s: number, e: number) {
    if (w(t + T_FAULT) !== L_DEEP) return say(t, s, L_UNREAD, s, e);
    say(t, s, L_DEEP, w(t + T_DEEPC), 0);
  }
  function deep(t: number, depth: number) {
    const st = w(t + T_STACK); set(t + T_DEEPC, 0); if (!st) return;
    // (from the deepest: entry i at top - 8 i; a rule by its head (the same rule made again, in another frame, is the same))
    // (the deepest few may be on their way out of it: looked past, up to 256 of them)
    let top = st + 8 * (depth - 1), period = 0;
    for (let o = 0; o <= 256 && !period && o < depth; o++) {
      const at = st + 8 * (depth - 1 - o), room = depth - o;
      for (let p = 1; 3 * p <= room - 1 && p <= 300 && !period; p++) {
        let ok = 1;
        for (let i = 0; i < 3 * p && ok; i++) if (!same_step(at - 8 * i, at - 8 * (i + p))) ok = 0;
        if (ok) { period = p; top = at; }
      }
    }
    // (and where it began: the first that is not the cycle, below it, what entered it)
    let into = 0;
    if (period) { const room = (top - st) / 8 + 1; let i = period; while (i < room && same_step(top - 8 * i, top - 8 * (i - period))) { i++; } if (i < room) into = top - 8 * i; }
    // (no rules again and again: the ones most often on the way down, how often)
    const n = period ? period : 64, buf = xadd(HEAP, 16 + 16 * (n + 1));
    if (buf < 0 || buf >= w(LIMIT) - 16 - 16 * (n + 1)) return;
    set(buf, n); set(buf + 4, period); set(buf + 8, into ? 1 : 0); set(buf + 12, depth);
    for (let i = 0; i <= n; i++) { const q = buf + 16 + 16 * i; set(q, 0); set(q + 4, 0); set(q + 8, 0); set(q + 12, 0); }
    if (period) for (let i = 0; i <= n; i++) {
      let x = into; if (i < n) x = top - 8 * (n - 1 - i);
      if (!x) continue;
      const q = buf + 16 + 16 * i, r = w(x), hd = r ? w(r + R_HEAD) : 0;
      set(q, hd ? w(hd + N_A) : 0); set(q + 4, hd ? w(hd + N_B) : 0); set(q + 8, w(x + 4)); set(q + 12, 1);
    }
    else for (let d = 0; d < depth; d++) {
      const x = st + 8 * d, r = w(x); if (!r) continue;
      const hd = w(r + R_HEAD); if (!hd) continue;
      let k = 0; while (k < n && w(buf + 16 + 16 * k + 12) && w(buf + 16 + 16 * k) !== w(hd + N_A)) { k++; }
      if (k < n && w(buf + 16 + 16 * k + 12)) { set(buf + 16 + 16 * k + 12, w(buf + 16 + 16 * k + 12) + 1); continue; }
      // (a new one: in a free place, else in place of the least often seen, when that was seen once)
      let at = -1; for (let j = 0; j < n && at < 0; j++) { if (!w(buf + 16 + 16 * j + 12)) at = j; }
      if (at < 0) for (let j = 0; j < n && at < 0; j++) { if (w(buf + 16 + 16 * j + 12) === 1) at = j; }
      if (at < 0) continue;
      const q = buf + 16 + 16 * at; set(q, w(hd + N_A)); set(q + 4, w(hd + N_B)); set(q + 8, w(x + 4)); set(q + 12, 1);
    }
    // (with --debug, all of the way down, kept too: said with `RAY_DEEP`)
    if (DEBUG) { const all = xadd(HEAP, 4 + 12 * depth); if (all >= 0 && all < w(LIMIT) - 4 - 12 * depth) { set(all, depth); for (let d = 0; d < depth; d++) { const x = st + 8 * d, r = w(x), hd = r ? w(r + R_HEAD) : 0, q = all + 4 + 12 * d; set(q, hd ? w(hd + N_A) : 0); set(q + 4, hd ? w(hd + N_B) : 0); set(q + 8, w(x + 4)); } debug(D_FAULT, 1089, all, 0); } }
    set(t + T_DEEPC, buf);
  }
  function same_step(x: number, y: number): number {
    const r = w(x), q = w(y);
    if (!r || !q) return !r && !q && w(x + 4) === w(y + 4) ? 1 : 0;
    const h = w(r + R_HEAD), k = w(q + R_HEAD);
    return r === q || (h && k && w(h + N_A) === w(k + N_A)) ? 1 : 0;
  }
  // (going to a label, or stopped: what was run returns, until what has the label, or the statement)
  function stopped(t: number) { return w(t + T_JUMP_N) || w(t + T_FAULT) || w(OOM); }
  // (the text from s to e one of the words the host knows?)
  function mapped(s: number, e: number, k: number) { const n = w(w(MAPPED) + 8 * k + 4); return e - s === n && same(s, w(w(MAPPED) + 8 * k), n); }
  function word(s: number, e: number, k: number) { const n = w(w(WORDS) + 8 * k + 4); return e - s === n && same(s, w(w(WORDS) + 8 * k), n); }
  // (the text from a, n long, and from s to e, the same, each without the space around it?)
  function trimmed(a: number, n: number, s: number, e: number) {
    let z = a + n; while (a < z && b(a) <= 32) a++; while (z > a && b(z - 1) <= 32) z--;
    while (s < e && b(s) <= 32) s++; while (e > s && b(e - 1) <= 32) e--;
    return z - a === e - s && same(a, s, e - s);
  }

  // ---- reading

  // The n bytes at a and at c the same?
  function same(a: number, c: number, n: number) { for (let i = 0; i < n; i++) if (b(a + i) !== b(c + i)) return 0; return 1; }
  // At `at`: an opening bracket (1), a closing one (2), a quote (3), neither (0); 4 more for the header's; and 8 times how long
  // it is. The brackets are the header's, and the pairs rules taught (a head that is one hole between two characters).
  function bracket(at: number, end: number) {
    // (one byte each, the header's are in the table too: 5 and 6)
    // (one escaped, `\"`, `\{` (after an odd number of `\`), as within quotes: opens and closes nothing)
    if (w(OPEN_LENGTH) === 1 && w(CLOSE_LENGTH) === 1) { const k = b(w(PAIRS) + b(at)); return !k || (b(at - 1) === 92 && escaped(at)) ? 0 : k + 8; }
    let l = w(OPEN_LENGTH);
    if (at + l <= end && same(at, w(OPEN), l)) return l * 8 + 5;
    l = w(CLOSE_LENGTH);
    if (at + l <= end && same(at, w(CLOSE), l)) return l * 8 + 6;
    const k = b(w(PAIRS) + b(at));
    return !k || (b(at - 1) === 92 && escaped(at)) ? 0 : k + 8;
  }
  function escaped(at: number): number { let n = 0; while (b(at - 1 - n) === 92) n++; return n & 1; }
  // Past what opens at `at`: to after what closes it (what opens inside it, past that too), or a quote's text.
  function past(at: number, end: number): number {
    // (where it closes, read once for each place of a file: as far as the file goes, then no further than `end`)
    const t = w(OPEN_LENGTH) === 1 && w(CLOSE_LENGTH) === 1 ? closes(at) : 0;
    if (!t) return closing(at, end);
    const v = w(t + 4 * at);
    if (v && ((v >> 24) & 127) === (w(PAIRS_GEN) & 127)) { const r = at + (v & 0xFFFFFF) - 1; return r < end ? r : end; }
    const r = closing(at, w(THREAD + T_CE));
    if (r - at < 0xFFFFFE) set(t + 4 * at, ((w(PAIRS_GEN) & 127) << 24) | (r - at + 1));
    return r < end ? r : end;
  }
  // (the file `at` is in: its table of where what opens at each place closes, less its start)
  function closes(at: number): number {
    if (at >= w(THREAD + T_CS) && at < w(THREAD + T_CE)) return w(THREAD + T_CT);
    const d = w(CLOSES);
    for (let k = 0; d && k < aload(FILES_N); k++) {
      const q = d + 12 * k;
      if (w(q) <= at && at < w(q + 4) && w(q + 8)) { set(THREAD + T_CS, w(q)); set(THREAD + T_CE, w(q + 4)); set(THREAD + T_CT, w(q + 8) - 4 * w(q)); return w(THREAD + T_CT); }
    }
    return 0;
  }
  function closing(at: number, end: number): number {
    const k = bracket(at, end);
    if ((k & 3) === 3) {
      const q = b(at);
      for (let p = at + 1; p < end;) { const c = b(p); if (c === 92) p += 2; else if (c === q) return p + 1; else p++; }
      return end;
    }
    for (let p = at + (k >> 3); p < end;) {
      const c = bracket(p, end);
      if ((c & 3) === 2) return p + (c >> 3);
      if (c & 3) p = past(p, end); else p++;
    }
    return end;
  }
  // Past the whitespace (and the newlines).
  function skip(at: number, end: number) { while (at < end && b(at) <= 32) at++; return at; }
  // The end of the line: its newline, not one inside brackets.
  // (a line indented deeper than the one the statement begins on continues it: `x := 5` then `  + 3`, a body on the lines
  // under `=>`; blank lines between them too)
  // (a statement's line: on to the next line no deeper than it; how deep it is, the line it begins on, in code made (not
  // written in a file, `{{body}}` of a closure) only as far back as that code begins, `lo`)
  function line(at: number, end: number, lo = 0) {
    let from = at; while (b(from - 1) !== 10 && b(from - 1) !== 0 && from > lo) from--;
    let indent = 0; while (b(from + indent) === 32) indent++;
    while (at < end) {
      const k = bracket(at, end);
      if ((k & 3) === 2) at += k >> 3;
      else if (k & 3) at = past(at, end);
      else if (b(at) === 10) {
        let next = at + 1;
        for (;;) { let q = next, n = 0; while (q < end && b(q) === 32) { q++; n++; } if (q < end && b(q) === 10) { next = q + 1; continue; } if (q >= end || n <= indent) return at; break; }
        at = next;
      }
      else at++;
    }
    return at;
  }
  // (whether p is in a file read, not in code made from one)
  function in_file(p: number): number { for (let k = 0; k < aload(FILES_N); k++) { const f = w(FILES) + 12 * k; if (p >= w(f) && p < w(f + 4)) return 1; } return 0; }
  // Do the characters at a and c belong apart (a literal begins or ends between them)? Each character has a kind: a space (0),
  // one of a word (1), one of an operator (2), or one on its own (3: a bracket, a quote, a comma).
  // (and a member after an operator, `x#.count`, `!.done`: a `.` before a word begins one, apart from what is before it
  // unless that is a `.` too (`..9`))
  // (a member named by an operator, `x.#`: a `.` on its own is apart from what follows it, as it is before a word)
  // (and `?` after `*`, `*?`: anything, or nothing (`forward: *?`, Stepped's), `*` then `x?`)
  function apart(a: number, c: number) { const t = w(CLASSES), x = b(t + b(a)), y = b(t + b(c)); return x !== y || x === 0 || x === 3 || (b(c) === 63 && b(a) === 42) || (b(c) === 46 && b(a) !== 46 && b(t + b(c + 1)) === 1) || (b(a) === 46 && b(c) !== 46 && b(a - 1) !== 46) ? 1 : 0; }
  // From `at` to `end`, what the type's own rules read whole?
  // (a rule whose typed hole is being checked is not tried again within the check: what the check reads is read without it
  // (`{f}({argument: Superposed})`, tried on every call, the calls in its argument not again), no re-entry)
  function typed(r: number, at: number, end: number, type: number, s: number): number {
    if (DEBUG && w(248)) { const h = w(248) + 8 * ((r >> 3) & 4095); set(h, r); set(h + 4, w(h + 4) + 1); }
    const n = w(THREAD + T_CHECKS); if (n < CHECKS) set(THREAD + T_CHECKS + 4 + 4 * n, r); set(THREAD + T_CHECKS, n + 1);
    const ok = typed_(at, end, type, s);
    set(THREAD + T_CHECKS, n); return ok;
  }
  function checking_rule(x: number): number { const n = w(THREAD + T_CHECKS); for (let i = 0; i < n && i < CHECKS; i++) if (w(THREAD + T_CHECKS + 4 + 4 * i) === x) return 1; return 0; }
  function typed_(at: number, end: number, type: number, s: number): number {
    // (a text: itself)
    if (w(type + N_IS) === IS_TEXT) return trimmed(w(type + N_A), w(type + N_B) - w(type + N_A), at, end) ? 1 : 0;
    // (what everything is, the language itself (`Node := .`): anything; reading it would try every rule there is)
    if (type === w(GLOBAL)) return 1;
    // (accelerated, `glyphs` in the kernel's map: a list of characters as a type (`Decimal_glyph[]`), each character one of
    // its element's, read whole by the kernel (an acceleration: the same with it and without))
    const gl = glyphs_of(type); if (gl) return glyph_read(gl, at, end);
    // (what none of its rules begins as, and no name of a value of it: none)
    if (!begins(type, b(at), 0) && !worded(at, end)) return 0;
    // (the same text checked against the same type while that is being checked (a type whose rules have holes of it, read at
    // the same place), or checks this deep: no reading)
    if (!w(THREAD + T_TYP)) set(THREAD + T_TYP, alloc(12 * TYPS));
    const ty = w(THREAD + T_TYP), tn = w(THREAD + T_TYP_N);
    if (tn >= TYPS) { set(THREAD + T_CUT, 1); return 0; }
    if (DEBUG && tn === 16) debug(D_FAULT, 98, at, end);
    // (the same text checked as the same type while it is being checked: not one, as far as that check goes (no re-entry:
    // `this` checked as `Subscript.String`, what that asks reads `this` again))
    for (let i = 0; i < tn; i++) if (w(ty + 12 * i) === at && w(ty + 12 * i + 4) === end && w(ty + 12 * i + 8) === type) { set(THREAD + T_CUT, 1); return 0; }
    // (checked once: the same text against the same type, its rules and the language's as they are, as quietly, under the same
    // shadows, is the same answer; not one a cycle cut short, nor one that ran something to answer: what it ran is the answer)
    let slot = 0;
    const memo = w(TMEMO), last = latest(type), glob = latest(w(GLOBAL)), quiet = w(THREAD + T_QUIET) >= TYPINGS ? 1 : 0;
    // (in a test: its own, this thread's, as the readings it keeps are)
    const sh = w(THREAD + T_SH_N) ? w(THREAD + T_SH) : w(THREAD + T_REG_AT) ? THREAD | 1 : 0, gen = sh ? w(THREAD + T_SHGEN) : 0, shn = w(THREAD + T_SH_N);
    if (memo) for (let h = mix(at * 31 + end * 17 + type * 13 + gen) & w(TMEMO_MASK), n = 0; n < 16; n++, h = (h + 1) & w(TMEMO_MASK)) {
      const m = memo + TMEMO_ENTRY * h, k = aload(m);
      if (!k) { slot = m; break; }
      if (k === at && w(m + 4) === end && w(m + 8) === type && w(m + 12) === last && w(m + 20) === glob && w(m + 24) === quiet && w(m + 28) === sh && w(m + 32) === gen && w(m + 36) === shn) { const kept = aload(m + 16); if (kept) { if (DEBUG) count(15); return kept - 1; } break; }
    }
    set(ty + 12 * tn, at); set(ty + 12 * tn + 4, end); set(ty + 12 * tn + 8, type); set(THREAD + T_TYP_N, tn + 1);
    const cut = w(THREAD + T_CUT), ran = w(THREAD + T_RAN); set(THREAD + T_CUT, 0); set(THREAD + T_RAN, 0);
    if (DEBUG) { debug(D_TYPE, at, end, type); count(K_TYPED); if (w(244)) { const h = w(244) + 8 * ((type >> 3) & 4095); set(h, type); set(h + 4, w(h + 4) + 1); } }
    const ok = checked(at, end, type, s);
    if (DEBUG) debug(D_TYPE_END, at, end, ok);
    const was_cut = w(THREAD + T_CUT), was_run = w(THREAD + T_RAN); set(THREAD + T_CUT, cut | was_cut); set(THREAD + T_RAN, ran | was_run);
    set(THREAD + T_TYP_N, tn);
    if (DEBUG) { if (was_run) count(11); else if (was_cut) count(12); else count(13); if (ok) count(14); }
    if (slot && !w(THREAD + T_REG_AT) && !was_cut && !was_run && cas(slot, 0, at) === 0) { wrote(slot); set(slot + 4, end); set(slot + 8, type); set(slot + 12, last); set(slot + 20, glob); set(slot + 24, quiet); set(slot + 28, sh); set(slot + 32, gen); set(slot + 36, shn); astore(slot + 16, ok + 1); }
    return ok;
  }
  // (the type `{element}[]` made, marked: the characters its element is one of, each a text of one byte, `"0" | "1"`; one it
  // is not (a character of more bytes, a value of another kind), not marked: read by its rules)
  function glyphed(t: number, made: number, applied: number) {
    if (w(THREAD + T_REG_AT) || w(made + N_IS) !== IS_NODE || (w(FAIL_FAST) & 256)) return;
    const element = valued(t, applied + F_TAKES); if (!element) return;
    const mask = alloc(32); for (let i = 0; i < 8; i++) set(mask + 4 * i, 0);
    if (!glyph_set(element, mask, 0)) return;
    for (let h = (made >> 2) & (GLYPHED_N - 1), n = 0; n < 16; n++, h = (h + 1) & (GLYPHED_N - 1)) {
      const m = w(GLYPHED) + 16 * h;
      if (cas(m, 0, made) === 0 || aload(m) === made) { set(m + 4, latest(made)); set(m + 8, mask); return; }
    }
  }
  // (what a value of the element is: a text of one byte, that byte; a superposition, each of its rules a hole of a type alone
  // whose body is that hole (`{value: a} => value`), what each type is; anything else, no set)
  function glyph_set(x: number, mask: number, depth: number): number {
    if (depth > BEGUN) return 0;
    if (w(x + N_IS) === IS_TEXT) { const a = w(x + N_A), z = w(x + N_B); if (z - a !== 1 || b(a) <= 32) return 0; set(mask + 4 * (b(a) >> 5), w(mask + 4 * (b(a) >> 5)) | (1 << (b(a) & 31))); return 1; }
    if (w(x + N_IS) !== IS_NODE) return 0;
    let n = 0;
    for (let o = latest(x), k = 0; o && o !== w(x + N_BASE) && k < 4096; o = w(o), k++) {
      if (w(o + R_KIND) !== RULE || (w(o + R_FLAGS) & DEAD)) continue;
      if (!(w(o + R_FLAGS) & HOLES)) continue;
      if (w(o + R_PARTS) !== 1 || (w(o + R_PART) & 15) !== HOLE || named(o, w(o + R_BS), w(o + R_BE)) !== 0) return 0;
      const ty = w(o + R_PART + 16); if (ty <= 1 || !glyph_set(ty, mask, depth + 1)) return 0;
      n++;
    }
    return n;
  }
  function glyphs_of(type: number): number {
    if (!w(GLYPHED) || w(type + N_IS) !== IS_NODE) return 0;
    for (let h = (type >> 2) & (GLYPHED_N - 1), n = 0; n < 16; n++, h = (h + 1) & (GLYPHED_N - 1)) {
      const m = w(GLYPHED) + 16 * h, k = aload(m);
      if (!k) return 0;
      if (k === type) return w(m + 4) === latest(type) ? w(m + 8) : 0;
    }
    return 0;
  }
  // What the kernel can tell of a value and a type, as `is` answers it (the language's `is_itself`): 1 it is, 0 it is not, -1
  // not known (the language's rules then). A text against a written text, String, Node, `T+`, `T[]`, a list of types read in
  // order, a superposition of them; itself; Node.
  function admits(t: number, v: number, ty: number, depth: number): number {
    if (!v || !ty || depth > 12 || stopped(t)) return -1;
    if (v === ty || ty === known_class(t, 22, W_NODE_NAME)) return 1;
    if (w(v + N_IS) !== IS_TEXT) return -1;
    // (a class written as a structure: by what it is written as, kept when it was defined (`structure_as`))
    const sa = w(ty + N_IS) === IS_NODE ? member_seen(t, ty, w(w(WORDS) + 8 * W_STRUCTURE_AS), w(w(WORDS) + 8 * W_STRUCTURE_AS + 4), ty, 0) : 0;
    return text_admits(t, w(v + N_A), w(v + N_B), sa && sa !== w(NOTHING) ? sa : ty, depth);
  }
  // (a class the language names, found once: Node, String)
  function known_class(t: number, slot: number, k: number): number {
    const at = w(MAPPED) + 8 * slot; if (w(at)) return w(at);
    const g = w(GLOBAL); if (!g) return 0;
    const found = member(t, g, w(w(WORDS) + 8 * k), w(w(WORDS) + 8 * k + 4)); if (found) set(at, found);
    return found;
  }
  // (what a node holds under a name, its own or what it is made of: none, 0)
  function held(t: number, nd: number, k: number, depth: number): number {
    if (!nd || depth > 3 || w(nd + N_IS) !== IS_NODE) return 0;
    const v = member(t, nd, w(w(WORDS) + 8 * k), w(w(WORDS) + 8 * k + 4));
    return v ? v : held(t, w(nd + N_ALSO), k, depth + 1);
  }
  function text_admits(t: number, s: number, e: number, ty: number, depth: number): number {
    if (depth > 12 || stopped(t)) return -1;
    if (w(ty + N_IS) === IS_TEXT) { const n = w(ty + N_B) - w(ty + N_A); return e - s === n && same(s, w(ty + N_A), n) ? 1 : 0; }
    if (w(ty + N_IS) !== IS_NODE) return -1;
    if (ty === known_class(t, 23, W_STRING_NAME) || ty === known_class(t, 22, W_NODE_NAME)) return 1;
    // (`T+`: not empty, a T)
    const base = held(t, ty, W_NONEMPTY, 0); if (base) return e === s ? 0 : text_admits(t, s, e, base, depth + 1);
    // (`T[]` of characters: each one of them, at least one)
    const gl = glyphs_of(ty); if (gl) { if (e === s) return 0; for (let p = s; p < e; p++) { const c = b(p); if (!((w(gl + 4 * (c >> 5)) >>> (c & 31)) & 1)) return 0; } return 1; }
    // (`T[]`: Ts one after another, at least one)
    const each = held(t, ty, W_EACH, 0); if (each) return e === s ? 0 : text_steps(t, s, e, each, 0, depth);
    // (a list of types: each in its turn, a written text where it is, any other a span of at least one character)
    if (held(t, ty, W_LISTING, 0) === w(TRUE_)) return text_steps(t, s, e, 0, held(t, ty, W_HEAD, 0), depth);
    // (one of a superposition's components)
    const cs = held(t, ty, W_COMPONENTS, 0);
    if (cs) { let unknown = 0; for (let at = held(t, cs, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 256; at = held(t, at, W_NEXT, 0), k++) { const r = text_admits(t, s, e, held(t, at, W_VALUE, 0), depth + 1); if (r === 1) return 1; if (r < 0) unknown = 1; } return unknown ? -1 : 0; }
    return -1;
  }
  // (a span read as one type again and again (each), or as a list of types in turn (from its first link): which ends it can
  // reach, each a position after the one before)
  function text_steps(t: number, s: number, e: number, each: number, link: number, depth: number): number {
    const n = e - s; if (n > 4096) return -1;
    let reach = alloc(n + 1); for (let i = 0; i <= n; i++) setb(reach + i, i === 0 ? 1 : 0);
    let unknown = 0;
    for (let step = 0; step < 4096; step++) {
      const ty = each ? each : (link && link !== w(NOTHING) ? held(t, link, W_VALUE, 0) : 0);
      if (!each && !(link && link !== w(NOTHING))) break;
      if (!ty) return -1;
      const next = alloc(n + 1); for (let i = 0; i <= n; i++) setb(next + i, 0);
      let any = 0;
      for (let i = 0; i <= n; i++) {
        if (!b(reach + i)) continue;
        if (!each && w(ty + N_IS) === IS_TEXT) { const m = w(ty + N_B) - w(ty + N_A); if (i + m <= n && same(s + i, w(ty + N_A), m)) { setb(next + i + m, 1); any = 1; } continue; }
        for (let j = i + 1; j <= n; j++) { const r = text_admits(t, s + i, s + j, ty, depth + 1); if (r === 1) { setb(next + j, 1); any = 1; } else if (r < 0) unknown = 1; }
      }
      if (each) { if (b(next + n)) return 1; if (!any) return unknown ? -1 : 0; let grew = 0; for (let i = 0; i <= n; i++) if (b(next + i) && !b(reach + i)) { setb(reach + i, 1); grew = 1; } if (!grew) return unknown ? -1 : 0; continue; }
      reach = next; link = held(t, link, W_NEXT, 0);
      if (!any) return unknown ? -1 : 0;
    }
    return b(reach + n) ? 1 : (unknown ? -1 : 0);
  }
  // (the name a hole of the frame's rule (the text from s to e) is written as: `a`, `a: T`, `a = v`; else 0)
  function hole_name(fr: number, s: number, e: number): number {
    if (!fr || w(fr + N_IS) !== IS_FRAME || !w(fr + F_RULE) || e <= s) return 0;
    const h = named(w(fr + F_RULE), s, e); if (h < 0) return 0;
    const o = follow(fr + F_TAKES + TAKE * h, 1); let cs = skip(w(o), w(o + 4)), ce = w(o + 4); while (ce > cs && b(ce - 1) <= 32) ce--;
    let we = cs; while (we < ce && b(w(CLASSES) + b(we)) === 1) we++;
    if (we === cs || (b(cs) >= 48 && b(cs) <= 57)) return 0;
    let after = we; while (after < ce && b(after) <= 32) after++;
    const fits = after === ce || (b(after) === 58 && b(after + 1) !== 58 && b(after + 1) !== 61) || (b(after) === 61 && b(after + 1) !== 61 && b(after + 1) !== 62);
    return fits ? node(IS_TEXT, cs, we, w(TEXTS) || w(GLOBAL), 0) : 0;
  }
  // (a span as a place reads it, the language's `type_fits` (`is`, or `as`): of a structure class, what it is written as
  // (its `written_as`, which `as` asks before it destructures))
  function span_fits(t: number, s: number, e: number, ty: number): number {
    const r = text_admits(t, s, e, ty, 0); if (r === 1 || w(ty + N_IS) !== IS_NODE) return r;
    // (marked once, when the class is defined: `structure_as`, what it is written as)
    const wa = held(t, ty, W_STRUCTURE_AS, 0); if (!wa || wa === w(NOTHING)) return r;
    return text_admits(t, s, e, wa, 0);
  }
  // (of a list of types from a link and a text, `{at} first_cut_in {text}`: what is left after the first type's span, the nearest
  // after which the rest reads, as the language's loop finds it; none, nothing; not known, 0)
  function cut_of(t: number, link: number, x: number): number {
    if (!link || link === w(NOTHING) || !x || w(x + N_IS) !== IS_TEXT) return 0;
    const s = w(x + N_A), e = w(x + N_B), n = e - s; if (n > 2048) return 0;
    const types = alloc(4 * 65); let k = 0;
    for (let at = link; at && at !== w(NOTHING) && k < 64; at = held(t, at, W_NEXT, 0)) { const ty = held(t, at, W_VALUE, 0); if (!ty) return 0; set(types + 4 * k++, ty); }
    if (k >= 64 || stopped(t)) return 0;
    // (reads[i][p], from the last type back: 1 the types from i read the text from p, 0 they do not, 2 not known)
    const reads = alloc((k + 1) * (n + 1));
    for (let p = 0; p <= n; p++) setb(reads + k * (n + 1) + p, p === n ? 1 : 0);
    for (let i = k - 1; i >= 0; i--) {
      const ty = w(types + 4 * i), row = reads + i * (n + 1), next = reads + (i + 1) * (n + 1);
      for (let p = 0; p <= n; p++) {
        let r = 0;
        if (w(ty + N_IS) === IS_TEXT) { const m = w(ty + N_B) - w(ty + N_A); r = p + m <= n && same(s + p, w(ty + N_A), m) ? b(next + p + m) : 0; }
        else for (let q = p + 1; q <= n && r !== 1; q++) { const rest = b(next + q); if (!rest) continue; const f = span_fits(t, s + p, s + q, ty); if (f < 0) r = 2; else if (f === 1) { if (rest === 1) r = 1; else r = 2; } }
        setb(row + p, r);
      }
    }
    // (the first type, as the loop tries it: the shortest span after which the rest reads; one not known before it, not known)
    const first = w(types), rest = reads + n + 1;
    if (w(first + N_IS) === IS_TEXT) { const m = w(first + N_B) - w(first + N_A); if (m < 1 || m > n || !same(s, w(first + N_A), m)) return w(NOTHING); const r = b(rest + m); return r === 1 ? node(IS_TEXT, s + m, e, w(TEXTS) || w(GLOBAL), 0) : r === 2 ? 0 : w(NOTHING); }
    for (let q = 1; q <= n; q++) { const r = b(rest + q); if (!r) continue; const f = span_fits(t, s, s + q, first); if (f < 0 || (f === 1 && r === 2)) return 0; if (f === 1) return node(IS_TEXT, s + q, e, w(TEXTS) || w(GLOBAL), 0); }
    return w(NOTHING);
  }
  // (what the type's rules read: one of the characters, then, after any space, one again, to the end, spaces after it)
  function glyph_read(mask: number, at: number, end: number): number {
    while (end > at && b(end - 1) <= 32) end--;
    if (at >= end) return 0;
    for (let p = at; p < end; p++) { const c = b(p); if (c <= 32) { if (p === at) return 0; continue; } if (!((w(mask + 4 * (c >> 5)) >>> (c & 31)) & 1)) return 0; }
    return 1;
  }
  // What a value of a type can begin with: the characters its own rules with holes begin with, a hole there what its type
  // does (an untyped one, anything). Derived from its rules, kept with the last of them (one more, derived again).
  function begins(type: number, c: number, depth: number): number {
    if (w(type + N_IS) === IS_TEXT) { const a = skip(w(type + N_A), w(type + N_B)); return a >= w(type + N_B) || b(a) === c ? 1 : 0; }
    if (type === w(GLOBAL) || depth > BEGUN || !w(BEGINS)) return 1;
    const mask = begun(type, depth);
    return (w(mask + 4 * (c >> 5)) >>> (c & 31)) & 1;
  }
  // (all it can begin with, at once: a mask of 256 bits, one per character; a hole's type's mask added to it whole)
  // (the rules what is being read now reads without: each one whose other reading this is)
  // (a rule whose body is one of its holes: what it reads, passed through)
  // (a rule that is its first word and then a hole, `as {target}`, `static {statement}`: what follows that word, read as
  // its operand; not one written with more of its own text after it, `as (=== {type})`)
  function operand_led(x: number): number { const n = w(x + R_PARTS); let k = 1; while (k < n && (w(x + R_PART + PART * k) & 15) === SPACE) k++; return k < n && (w(x + R_PART + PART * k) & 15) === HOLE ? 1 : 0; }
  function passes(x: number): number {
    if (w(x + R_KIND) !== RULE) return 0;
    // (by its text, not read here: its body, written, one of its holes' names, bare or in brackets)
    let bs = skip(w(x + R_BS), w(x + R_BE)), be = trim_end(w(x + R_BS), w(x + R_BE));
    if (be - bs > 2 && same(bs, w(OPEN), w(OPEN_LENGTH)) && same(be - w(CLOSE_LENGTH), w(CLOSE), w(CLOSE_LENGTH))) { bs += w(OPEN_LENGTH); be -= w(CLOSE_LENGTH); }
    for (let k = 0, n = w(x + R_PARTS); k < n; k++) {
      const q = x + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      const a = w(q + 4); let z = a; while (z < a + w(q + 8) && b(w(CLASSES) + b(z)) === 1) z++;
      if (z > a && be - bs === z - a && same(bs, a, z - a)) return 1;
    }
    return 0;
  }
  function skips_key(): number { const n = w(THREAD + T_SKIPS_N), bs = w(THREAD + T_SKIPS); let k = 0; for (let i = 0; i < n && i < 32; i++) k = mix(k * 31 + w(bs + 4 * i)) | 0; return n ? k | 1 : 0; }
  function skipped_rule(x: number): number { const n = w(THREAD + T_SKIPS_N), bs = w(THREAD + T_SKIPS); for (let i = 0; i < n && i < 32; i++) if (w(bs + 4 * i) === x) return 1; return 0; }
  function begun_now(x: number): number { const n = w(THREAD + T_BEGUN_N), bs = w(THREAD + T_BEGUN); for (let i = 0; i < n && i < 64 && bs; i++) if (w(bs + 4 * i) === x) return 1; return 0; }
  function begun(type: number, depth: number): number {
    const last = latest(type);
    let slot = 0, h = (type >> 2) & (BEGINS_N - 1);
    for (let n = 0; n < 8; n++, h = (h + 1) & (BEGINS_N - 1)) {
      const m = w(BEGINS) + 44 * h, k = aload(m);
      if (k === type && w(m + 4) === last) return m + 8;
      if (!k || k === type) { slot = m; break; }
    }
    // (derived: into a mask of 256 bits)
    const mask = alloc(32);
    for (let i = 0; i < 8; i++) set(mask + 4 * i, 0);
    for (let o = last, n = 0; o && o !== w(type + N_BASE) && n < 4096; o = w(o), n++) {
      const f = w(o + R_FLAGS);
      if (!(f & HOLES) || (f & (METHOD | DEAD)) || w(o + R_KIND) !== RULE) continue;
      const q = o + R_PART, kind = w(q) & 15;
      if (kind === LITERAL) { const x = b(w(q + 4)); set(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      const ty = kind === HOLE ? w(q + 16) : 0;
      // (one whose type is not read yet reads nothing yet; one of this type begins as the others do; a word, with a character
      // of a word; one of no type, anything)
      if (ty === 1 || (ty === type && kind === HOLE)) continue;
      if (!ty && kind === HOLE && (w(q) & WORD)) { for (let x = 0; x < 256; x++) if (b(w(CLASSES) + x) === 1) set(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      if (!ty) { for (let i = 0; i < 8; i++) set(mask + 4 * i, -1); break; }
      if (w(ty + N_IS) === IS_TEXT) { const a = skip(w(ty + N_A), w(ty + N_B)); if (a >= w(ty + N_B)) { for (let i = 0; i < 8; i++) set(mask + 4 * i, -1); break; } const x = b(a); set(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      // (as deep as a superposition of many is written, `"0" | "1" | … | "9"`, each one deeper)
      if (ty === w(GLOBAL) || depth >= BEGUN || begun_now(ty)) { for (let i = 0; i < 8; i++) set(mask + 4 * i, -1); break; }
      // (one being derived, its rules' types of it (String's reader typed a narrowing of String): anything, no re-entry)
      const bn = w(THREAD + T_BEGUN_N), bs = w(THREAD + T_BEGUN); if (bs && bn < 64) set(bs + 4 * bn, type); set(THREAD + T_BEGUN_N, bn + 1);
      const sub = begun(ty, depth + 1);
      set(THREAD + T_BEGUN_N, bn);
      for (let i = 0; i < 8; i++) set(mask + 4 * i, w(mask + 4 * i) | w(sub + 4 * i));
    }
    if (slot && !w(THREAD + T_REG_AT) && cas(slot, aload(slot), type) !== -1) { wrote(slot); set(slot + 4, last); for (let i = 0; i < 8; i++) set(slot + 8 + 4 * i, w(mask + 4 * i)); }
    return mask;
  }
  // (a type no rule of which reads it, a value, `{a: false | true}`: a name of that value, read where everything is, is one)
  function named_as(at: number, end: number, type: number, sc: number): number {
    if (!worded(at, end)) return 0;
    if (w(THREAD + T_QUIET) >= TYPINGS) return 0;
    if (read(at, end, latest(w(GLOBAL)), 0, 0, HOLES | METHOD, sc) < 0) return 0;
    const rule = w(sc + 512);
    if (w(rule + R_KIND) === VALUE) return w(rule + R_BS) === type ? 1 : 0;
    const quiet = w(THREAD + T_QUIET), said = w(THREAD + T_SAID), hole = w(THREAD + T_HOLE), fault = w(THREAD + T_FAULT), jump = w(THREAD + T_JUMP_N);
    set(THREAD + T_QUIET, quiet + 1); set(THREAD + T_HOLE, 0);
    const g = w(GLOBAL), v = apply(THREAD, rule, 0, frame(0, 0, g, at, end, 0, 0, g, g), 0, g, at, end, g, g);
    set(THREAD + T_QUIET, quiet); set(THREAD + T_SAID, said); set(THREAD + T_HOLE, hole); set(THREAD + T_FAULT, fault || (w(THREAD + T_FAULT) === L_DEEP || w(THREAD + T_FAULT) === L_MEMORY || w(THREAD + T_FAULT) === L_FULL ? w(THREAD + T_FAULT) : 0)); set(THREAD + T_JUMP_N, jump);
    return v && v === type ? 1 : 0;
  }
  function checked(at: number, end: number, type: number, s: number): number {
    const was = w(THREAD + T_SCRATCH);
    if (s + 3 * SCRATCH > w(THREAD + T_SCRATCH_END)) { set(THREAD + T_CUT, 1); return 0; }
    // (what it reads, past what the reading checking it holds; and what that reads in turn, past that)
    set(THREAD + T_SCRATCH, s + 2 * SCRATCH);
    const ok = checking(at, end, type, s + SCRATCH);
    set(THREAD + T_SCRATCH, was);
    return ok;
  }
  function checking(at: number, end: number, type: number, sc: number): number {
    // (what reads it in the language binding looser than the type's own rules (declared after them, `,` in `true, false` as
    // Arguments): its parts, each of the type)
    const last = latest(type);
    if (last && last !== w(type + N_BASE) && read(at, end, latest(w(GLOBAL)), 0, HOLES, METHOD | SUPERPOSING, sc) === end) {
      const g = w(sc + 512), gh = w(g + R_HOLES);
      // (not one that takes it whole, a reader of it (`{digits: Decimal_glyphs}`): that is no reading of it in parts)
      const whole = gh === 1 && skip(w(sc + 516), w(sc + 520)) === skip(at, end) && w(sc + 520) >= end;
      if (gh && !whole && w(g + R_OWNER) !== type && declared_at(g) > declared_at(last)) {
        const parts = alloc(8 * gh); for (let i = 0; i < gh; i++) { set(parts + 8 * i, w(sc + 516 + 12 * i)); set(parts + 8 * i + 4, w(sc + 520 + 12 * i)); }
        for (let i = 0; i < gh; i++) if (!typed_(w(parts + 8 * i), w(parts + 8 * i + 4), type, sc + SCRATCH)) return 0;
        return 1;
      }
    }
    // (by its own rules with holes: what it holds under a name is no reading of it; none of which begins as it does, none reads it)
    if (!begins(type, b(at), 0) || read(at, end, latest(type), w(type + N_BASE), HOLES, METHOD, sc) !== end) return named_as(at, end, type, sc);
    // (and what it reads it as: one whose body is a hole of its own is the text; any other, a value (a narrowing's, when what
    // it narrows to holds), read here without saying anything: one that says something, or is none, is no reading)
    const rule = w(sc + 512), holes = w(rule + R_HOLES);
    if (named(rule, w(rule + R_BS), w(rule + R_BE)) >= 0 || ref(rule, 0, w(rule + R_BS), w(rule + R_BE), 1)) return 1;
    // (a check inside what a check runs: its rules reading it is the answer (what it reads it as is not run again, and again))
    const quiet = w(THREAD + T_QUIET);
    // (inside a check, a reading by one of its rules is the answer; but a rule that is one hole alone reads anything, so
    // that it reads says nothing: what it answers is asked, one check deeper (`"0" | "1"`, a list read as a type); deeper
    // still, no reading)
    // (one hole of no type, or of one reading anything, `{value: narrowed}` of a narrowing of Node)
    // (or one hole of a type, a narrowing's (`{value: narrowed}`): that its type reads it says nothing of its condition)
    const anything = w(rule + R_PARTS) === 1 && (w(rule + R_PART) & 15) === HOLE;
    if (quiet >= TYPINGS && !anything) return 1;
    if (quiet >= TYPINGS + 2) return 0;
    const caps = alloc(8 * holes);
    for (let i = 0; i < holes; i++) { set(caps + 8 * i, w(sc + 516 + 12 * i)); set(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
    const said = w(THREAD + T_SAID), hole = w(THREAD + T_HOLE), fault = w(THREAD + T_FAULT), jump = w(THREAD + T_JUMP_N);
    set(THREAD + T_QUIET, quiet + 1); set(THREAD + T_HOLE, 0); set(THREAD + T_FAULT, 0); set(THREAD + T_JUMP_N, 0);
    // (what it took read where it is written: `f(x: other)`'s `other` the caller's)
    const wv = w(THREAD + T_WRITTEN_IN), written = wv && w(wv + N_IS) === IS_NODE ? wv : type;
    const v = apply(THREAD, rule, caps, frame(0, 0, type, at, end, 0, 0, written, type), 0, type, at, end, written, type);
    // (and what went too deep in it, too deep for what checks it too: kept)
    const ok = v && w(THREAD + T_SAID) === said && !w(THREAD + T_FAULT) && !w(THREAD + T_JUMP_N) ? 1 : 0;
    set(THREAD + T_QUIET, quiet); set(THREAD + T_SAID, said); set(THREAD + T_HOLE, hole); set(THREAD + T_FAULT, fault || (w(THREAD + T_FAULT) === L_DEEP || w(THREAD + T_FAULT) === L_MEMORY || w(THREAD + T_FAULT) === L_FULL ? w(THREAD + T_FAULT) : 0)); set(THREAD + T_JUMP_N, jump);
    return ok;
  }

  // Rule r's head from part k, at `at`: where it ends (-1: it doesn't match), each hole's span at s. A hole ends the nearest the
  // rest matches, nothing open in it (and, typed, what its type reads whole); the last one at the end of the line.
  function match(r: number, k: number, at: number, end: number, s: number): number {
    const n = w(r + R_PARTS);
    while (k < n) {
      // (a rule the map says superposes (`{f}({argument: Superposed})`): its type asked of the value, when it is applied)
      const q = r + R_PART + PART * k, kind = w(q) & 15, hug = w(q) & HUG, a = w(q + 4), len = w(q + 8), type = (w(r + R_FLAGS) & (SUPERPOSING | REFUSES)) ? 0 : w(q + 16);
      if (type === 1) return -1;
      if (kind === LITERAL) {
        if (at + len > end || !same(at, a, len) || !apart(at - 1, at)) return -1;
        // (in a body, a hole of its rule by its name, `{key}`, is that hole: no text written in a head reads its brackets)
        if (w(THREAD + T_BODY) && same(a, w(OPEN), w(OPEN_LENGTH)) && bracket(at, end) === w(OPEN_LENGTH) * 8 + 5 && ref(w(THREAD + T_BODY), 0, at, past(at, end), 1)) return -1;
        at += len;
        // (but against text of its own written right after it, `{operator}=` with `+` in it: one word, `+=`)
        if (at < end && !apart(at - 1, at) && !(k + 1 < n && (w(r + R_PART + PART * (k + 1)) & 15) === LITERAL)) return -1;
        k++; continue;
      }
      // (a space, and in what continues a statement, a newline)
      // (no space where one is written before a hole, at brackets right after a word: those are the word's, `static{2 <= .}`
      // is no `static {statement}`; brackets written in the head, `some (predicate)`, read `some(…)`)
      if (kind === SPACE) { const from = at; while (at < end && b(at) <= 32) at++; if (at === from && (hug || (at < end && (b(at) === 40 || b(at) === 91 || b(at) === 123) && b(w(CLASSES) + b(at - 1)) === 1 && k + 1 < n && (w(r + R_PART + PART * (k + 1)) & 15) === HOLE))) return -1;
        k++; continue; }
      const cap = s + 12 * w(q + 12);
      if (w(q) & VALUED_HOLE) { let o = at; while (o < end && b(w(CLASSES) + b(o)) === 2) o++; if (o > at && (o >= end || b(o) <= 32)) return -1; if (o === at && keyword_led(at, end)) return -1; }
      k++;
      if (k === n) {
        // (the last: to the end of the line; written against text, not beginning with a space, and none in it outside brackets
        // (`.{member}` of `.me() == p` is `me()`, what follows read on what it answers); a word, of a word's characters)
        if (hug && b(at) <= 32) return -1;
        let p = line(at, end);
        if (hug) { let u = at; while (u < p && b(u) > 32) u = (bracket(u, p) & 3) === 1 ? past(u, p) : u + 1; if (u < p) p = u; }
        while (p > at && b(p - 1) <= 32) p--;
        if (p <= at) return -1;
        if (w(q) & WORD) for (let x = at; x < p; x++) if (b(w(CLASSES) + b(x)) !== 1) return -1;
        if (w(q) & OPER) for (let x = at; x < p; x++) if (b(w(CLASSES) + b(x)) !== 2) return -1;
        if (type && !typed(r, at, p, type, s)) return -1;
        set(cap, at); set(cap + 4, p);
        return p;
      }
      // (after what opens a pair, the hole all there is before what closes it: what is inside it, up to that)
      if (k >= 2 && (w(r + R_PART + PART * (k - 2)) & 15) === LITERAL && (bracket(at - 1, end) & 1) && (w(r + R_PART + PART * k) & 15) === LITERAL && (bracket(w(r + R_PART + PART * k + 4), w(r + R_PART + PART * k + 4) + w(r + R_PART + PART * k + 8)) & 3) >= 2) {
        let p = past(at - 1, end);
        const c = bracket(p - 1, end);
        if ((c & 3) !== 2 && (c & 3) !== 3) return -1;
        p -= c >> 3;
        if (p <= at) return -1;
        // (typed: what its type reads, too; when nothing after it is typed, asked once the rest reads)
        const later = type && !untyped(r, k);
        if (later && !typed(r, at, p, type, s)) return -1;
        const e: number = match(r, k, p, end, s);
        if (e < 0 || (type && !later && !typed(r, at, p, type, s))) return -1;
        set(cap, at); set(cap + 4, p);
        return e;
      }
      // (an operator hole, `[x]`: the operator there, all of it, and no more)
      if (w(q) & OPER) { let oe = at; while (oe < end && b(w(CLASSES) + b(oe)) === 2) oe++; if (oe === at) return -1; const e: number = match(r, k, oe, end, s); if (e >= 0) { set(cap, at); set(cap + 4, oe); return e; } return -1; }
      const later = type && !untyped(r, k);
      // (before brackets written against it, `{f}(…)`: never ending in an operator, `(on).(code)` is no call of `(on).`)
      const nq = r + R_PART + PART * k, called = (w(nq) & 15) === LITERAL && (b(w(nq + 4)) === 40 || b(w(nq + 4)) === 91) ? 1 : 0;
      // (an untyped hole never ends inside a word; a typed one ends where its type reads (`{first: Digit}{rest: Digit[]}` of `10`))
      // (nor inside a choice, ` ? … : ` written apart, but for a rule of one, `{condition} ? {yes} : {no}`: `c ? a, b : d` is
      // the choice of `a, b`; written as a statement, not in brackets, its second holds the rest too, `c ? [] : x, rest`; in
      // brackets a `,` after it is the next item, `f(sign: c ? None : "-", integer)`)
      const chooses = choice_led(r, k), listed_by = comma_led(r, k);
      // (a hole between two texts of their own that open and close, `/* {comment} */`: none ends inside one in it, nested)
      const nests = nested_pair(r, k); let nest = 0;
      for (let p = at; p < end;) {
        if (nests) { const oq = w(r + R_PART), cq = w(r + R_PART + PART * (w(r + R_PARTS) - 1)); if (same(p, w(oq + 4), w(oq + 8))) { nest++; p += w(oq + 8); continue; } if (nest > 0 && same(p, w(cq + 4), w(cq + 8))) { nest--; p += w(cq + 8); continue; } }
        if (p > at && (type || apart(p - 1, p)) && !(called && b(w(CLASSES) + b(p - 1)) === 2) && (!later || (starts(r, k, p, end) && typed(r, at, p, type, s)))) {
          const e: number = match(r, k, p, end, s);
          if (e >= 0 && (!type || later || typed(r, at, p, type, s))) { set(cap, at); set(cap + 4, p); return e; }
        }
        if (!chooses && p > at && b(p) === 63 && b(p - 1) <= 32 && p + 1 < end && b(p + 1) <= 32) { if (listed_by && !enclosed(at)) return -1; const ce = choice_end(p, end); if (ce > 0) { p = ce; continue; } }
        const c = bracket(p, end);
        if ((c & 3) === 2) return -1;
        if (c & 1) { p = past(p, end); continue; }
        if (hug && b(p) <= 32) return -1;
        p++;
      }
      return -1;
    }
    return at;
  }

  // (whether rule r's next text from part k is a choice's own, `?` or `:` (`{condition} ? {yes} : {no}`))
  function choice_led(r: number, k: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) { const q = r + R_PART + PART * k, kind = w(q) & 15; if (kind === SPACE) continue; if (kind === LITERAL) return b(w(q + 4)) === 63 || b(w(q + 4)) === 58 ? 1 : 0; return 0; }
    return 0;
  }
  // (whether rule r is two texts of their own around the hole before part k, `/*`, `*/` (two characters or more, not the same):
  // a pair, nested)
  function nested_pair(r: number, k: number): number {
    const n = w(r + R_PARTS); if (n < 3) return 0;
    const oq = r + R_PART, cq = r + R_PART + PART * (n - 1);
    if ((w(oq) & 15) !== LITERAL || (w(cq) & 15) !== LITERAL || w(oq + 8) < 2 || w(cq + 8) < 2) return 0;
    if (w(oq + 8) === w(cq + 8) && same(w(oq + 4), w(cq + 4), w(oq + 8))) return 0;
    let holes = 0; for (let i = 1; i < n - 1; i++) { const kind = w(r + R_PART + PART * i) & 15; if (kind === HOLE) holes++; else if (kind !== SPACE) return 0; }
    return holes === 1 ? 1 : 0;
  }
  // (whether rule r's next text from part k is `,`, what makes a list (`{list}, {other}`))
  function comma_led(r: number, k: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) { const q = r + R_PART + PART * k, kind = w(q) & 15; if (kind === SPACE) continue; if (kind === LITERAL) return b(w(q + 4)) === 44 ? 1 : 0; return 0; }
    return 0;
  }
  // (whether what is read from at is what brackets hold, `(` or `[` before it: items, which `,` separates)
  function enclosed(at: number): number { let q = at - 1; while (q > 0 && b(q) <= 32 && b(q) !== 10) q--; return b(q) === 40 || b(q) === 91 ? 1 : 0; }
  // (from a choice's ` ? ` at p: just past its ` : `, choices in it counted, brackets skipped; none, 0)
  function choice_end(p: number, end: number): number {
    let depth = 1;
    for (let q = p + 1; q < end;) {
      const c = bracket(q, end);
      if ((c & 3) === 2) return 0;
      if (c & 1) { q = past(q, end); continue; }
      if (b(q - 1) <= 32 && q + 1 < end && b(q + 1) <= 32) { if (b(q) === 63) depth++; else if (b(q) === 58) { depth--; if (depth === 0) return q + 1; } }
      if (b(q) === 10) return 0;
      q++;
    }
    return 0;
  }
  // (can rule r's parts from k begin at p: a space skipped, text as written, a typed hole how its type begins)
  function starts(r: number, k: number, p: number, end: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) {
      const q = r + R_PART + PART * k, kind = w(q) & 15;
      if (kind === SPACE) { while (p < end && b(p) <= 32) p++; continue; }
      if (p >= end) return 0;
      if (kind === LITERAL) return same(p, w(q + 4), 1);
      // (one whose type is not read yet reads nothing yet)
      return w(q + 16) === 1 ? 0 : w(q + 16) ? begins(w(q + 16), b(p), 0) : 1;
    }
    return 1;
  }
  // (rule r's parts from k: none typed, reading them asks nothing of a type)
  function untyped(r: number, k: number): number { for (let n = w(r + R_PARTS); k < n; k++) if ((w(r + R_PART + PART * k) & 15) === HOLE && w(r + R_PART + PART * k + 16)) return 0; return 1; }
  // A statement at `at`, read with the rules from `vis` on (to `stop`), the ones `want` asks for and not `refuse`: where it ends
  // (-1: none reads it). Of the rules that read the whole line, a definition first, then one led by text, then the latest
  // (declaration order is precedence: what is declared last binds loosest); it goes at s + 512, its holes' spans after it. Past a
  // node's own rules: what it is also made of (and what that sees), then its parent's.
  function read(at: number, end: number, vis: number, stop: number, want: number, refuse: number, s: number): number {
    if (DEBUG) count(K_READ);
    let best = 0, longest = -1, ends = -1, backs = 0, deferred = 0, weak = 0, group = 0, found_in = 0, found_seq = 0;
    const out = s + 512, has = bytes(at, end), led = 1 + (b(at) & 63), back = s + 800;
    // (a comment after it, `//` after a space, outside brackets and quotes: a rule with `//` in its head that reads it first
    // (what is before it then read alone): no hole takes a comment, `true // a ?= b` is no `?=`)
    let commented = 0;
    for (let p = at + 1; p + 1 < end;) { const c = b(p); if (c === 47 && b(p + 1) === 47 && b(p - 1) <= 32) { commented = 1; break; } if (c === 40 || c === 91 || c === 123 || c === 34 || c === 96 || c === 39) { const q = past(p, end); p = q > p ? q : p + 1; } else p++; }
    let lo = 0, hi = 0, kinds = 0, refused = 0, best_fit = 0;
    // (a name defined more than once, with parameters and without (`min (b) =>`, `min =>`): by what is given, brackets after it
    // or none)
    let calling = 0; { let q = end; while (b(q) === 32) q++; calling = b(q) === 40 ? 1 : 0; }
    let cyc_mark = 0, cyc_n = 0, cyc_backs = 0;
    for (let r = vis; r && r !== stop;) {
      if (DEBUG) count(K_NODE);
      // (--debug: a reading that has walked very far, what it sees asked whether it goes round (a node made of, or in, what is
      // made of or in it): said, with the node, not gone round forever)
      if (DEBUG && ++cyc_n > 1048576) {
        if (!cyc_mark) { cyc_mark = 1; const c = cycle_of(owner(vis), 0); if (c) { debug(D_FAULT, 86 + 1000, c, 0); return -1; } cyc_mark = r; cyc_backs = backs; }
        // (and the same rules again, where the walk was, a chain of them spliced into itself)
        else if (r === cyc_mark && backs === cyc_backs) { debug(D_FAULT, 86 + 1001, w(r + R_OWNER), r); return -1; }
        else if ((cyc_n & (cyc_n - 1)) === 0) { cyc_mark = r; cyc_backs = backs; }
      }
      // (a node's rules, from r: the ones led by a hole, then the ones led by text that begins as this does; each in the
      // order they were declared, the last first)
      let x = r;
      // (wanting one led by text: none led by a hole is)
      for (let pass = want & LED ? 1 : 0; pass < 2; pass++) {
        group++;
        // (led by a hole: of a node with many, by the kind of the first text in its head, of the kinds this text has (none: any
        // text), else all of them; led by text, by how it begins. Of a kind, as declared, the last first: across kinds, the one
        // declared last of them)
        const tr = w(r + R_SKIP), many = !pass && tr && w(tr + 4 * SEQ_AT) > MANY ? 1 : 0;
        // (the kinds of character the text has, once)
        if (many && !kinds) { kinds = 1; for (let p = at, kt = w(KINDS), cl = w(CLASSES); p < end;) { if (b(cl + b(p)) === 1) { const c = worded_kind(p, end); hi |= 1 << (c - 32); while (p < end && b(cl + b(p)) === 1) p++; continue; } const c = b(kt + b(p)); if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); p++; } }
        let m = many ? lo : 0, mh = many ? hi : 0, k = many ? -1 : 64;
        for (;;) {
        const kind = k === 64 ? (pass ? led : 0) : k < 0 ? 129 : 65 + k;
        // (from the first of that kind)
        x = many && w(tr + 4 * KIND_AT) !== kind ? w(tr + 4 * kind) : r;
        while (x && x !== stop && !(w(x + R_FLAGS) & DEAD)) {
          if (DEBUG && freed(x)) { debug(D_FAULT, 95, at, end); return -1; }
          const f = w(x + R_FLAGS), tb = w(x + R_SKIP), kx = tb ? w(tb + 4 * KIND_AT) : kind_of(x);
          if (DEBUG) { count(K_VISIT); if (!pass) { count(K_HOLE_LED); if (w(240)) { const o = w(x + R_OWNER), h = w(240) + 8 * ((o >> 3) & 4095); set(h, o); set(h + 4, w(h + 4) + 1); } } }
          if (DEBUG && (w(FAIL_FAST) & 64) && b(at) === 46) { const hd = w(x + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === 9 && b(w(hd + N_A)) === 46 && b(w(hd + N_A) + 1) === 123 && b(w(hd + N_A) + 2) === 109) debug(D_FAULT, 79, ((kind ? kx === kind : kx >= 65) ? 1 : 0) | (x !== w(THREAD + T_SKIP) ? 2 : 0) | ((f & want) === want ? 4 : 0) | (!(f & refuse) ? 8 : 0) | (!(w(x + R_MASK) & ~has) ? 16 : 0) | ((f & LED ? b(at) === b(w(x + R_PART + 4)) : written(x, at, end)) ? 32 : 0) | (match(x, 0, at, end, s) >= 0 ? 64 : 0), match(x, 0, at, end, s) - end); }
          // (not the one rule that never reads itself here, `T_SKIP`)
          if ((kind ? kx === kind : kx >= 65) && x !== w(THREAD + T_SKIP) && (!w(THREAD + T_SKIPS_N) || !skipped_rule(x)) && !(w(THREAD + T_NAMING) === at && (w(x + R_PART) & 15) === LITERAL && w(x + R_PART + 8) === w(THREAD + T_NAMING_N) && same(w(x + R_PART + 4), at, w(THREAD + T_NAMING_N)) && !passes(x) && operand_led(x) && (!DEBUG || debug(D_FAULT, 1097, at, x) || 1)) && (f & want) === want && !(f & refuse) && !((refuse & TYPE_READER) && (f & READER) && w(x + R_OWNER) !== w(GLOBAL)) && !(w(x + R_MASK) & ~has) && (f & LED ? b(at) === b(w(x + R_PART + 4)) : written(x, at, end))) {
            if (DEBUG) count(K_MATCH);
            // (the numeral the kernel's map names, on digits in ten: what it reads, without asking its type (which is made of
            // numbers it reads: `Decimal.String` is `"0".."9"`))
            let e = -1;
            // (and on a text of other characters each one byte, none: its digits are `"0".."9"`)
            if ((w(x + R_FLAGS) & NUMERAL) && numeral_of(at, end) >= 0) { set(s, at); set(s + 4, end); e = end; } else if ((w(x + R_FLAGS) & NUMERAL) && ascii(at, end)) e = -1; else e = match(x, 0, at, end, s);
            // (a bare name, not read on a value: never a member's (a word-led rule of a node holding members))
            if (e >= 0 && (refuse & MEMBER) && (f & LED) && !(f & STATIC) && b(w(CLASSES) + b(w(x + R_PART + 4))) === 1 && w(x + R_OWNER) && w(w(w(x + R_OWNER) + N_BASE) + R_KIND) === MEMBERS_MARK) { refused = 1; e = -1; }
            if (e >= 0) {
              while (e < end && b(e) <= 32) e++;
              // (a definition first, then one led by text, then a method led by a hole (`{this}{argument}`, after `{this}(…)`))
              const score = (f & 1) * 4 + (f & LED ? 2 : f & METHOD ? 1 : 0);
              // (a name given a place, what nothing defined yet: one defined further out reads it instead)
              const placed_ = w(x + R_KIND) === VALUE && w(w(x + R_BS) + N_IS) === IS_PLACE ? 1 : 0;
              const seq = tb ? w(tb + 4 * SEQ_AT) : 0;
              // (one led by text but declared before one led by a hole whose word leads statements too, `return n if n == 0`:
              // the one declared later binds looser, `{guarded} if {condition}` guarding `return n`)
              // (and on a line with a comment after it, a rule with `//` in its head first: no other's hole takes the comment)
              const over = best && e >= end ? (commented && comments(x) && !comments(best) ? 1 : commented && comments(best) && !comments(x) ? -1 : guards(x, best) ? 1 : guards(best, x) ? -1 : 0) : 0;
              const fit = ((f & CALLS) ? 1 : 0) === calling ? 1 : 0;
              if (e >= end && over >= 0 && (over > 0 || score > longest || (score === longest && ((weak && !placed_) || (found_in === group && (fit !== best_fit ? fit > best_fit : seq > found_seq)))))) {
                best = x; longest = score; ends = e; weak = placed_; found_in = group; found_seq = seq; best_fit = fit;
                const h = w(x + R_HOLES) * 12;
                for (let i = 0; i < h; i += 4) set(out + 4 + i, w(s + i));
              }
            }
          }
          if (DEBUG) { const nx = tb && kind ? w(tb + 4 * kind) : w(x); if (nx && w(nx + R_FLAGS) === -1) { const hd = w(x + R_HEAD); debug(D_FAULT, 95, hd ? w(hd + N_A) : at, hd ? w(hd + N_B) : end); return -1; } }
          x = tb && kind ? w(tb + 4 * kind) : w(x);
        }
        if (m) { k = ctz(m); m &= m - 1; } else if (mh) { k = 32 + ctz(mh); mh &= mh - 1; } else break;
        }
      }
      // (past its rules (x, where they end): what it is also made of (and what that sees, and so on), then its parent's)
      if (!x || x === stop) break;
      r = w(x);
      if (!r) {
        const o = w(x + R_OWNER);
        if (o && w(o + N_ALSO) && backs < 48) { set(back + 4 * backs, w(o + N_PARENT)); backs++; r = latest(w(o + N_ALSO)); continue; }
        let p = o ? w(o + N_PARENT) : 0;
        // (what everything is in, the language itself, after every component still to see: a component's way out is not
        // past the rest of what the value is made of (`X &+= Y`: X's own class body before the language's))
        if (p === w(GLOBAL) && backs) { deferred = p; p = 0; }
        while (!p && backs) { backs--; p = w(back + 4 * backs); if (p === w(GLOBAL) && backs) { deferred = p; p = 0; } }
        if (!p) p = deferred, deferred = 0;
        if (!p) break;
        r = latest(p);
      }
    }
    if (DEBUG && refused && !best) debug(D_FAULT, 1113, at, end);
    set(out, best);
    return ends;
  }
  // (a node made by `|` or `&`: its own, or what it is made of short of Node, holding `superposes`, `conjoins` or `conjoined`)
  function superposed_node(x: number, depth: number): number {
    if (!x || depth > 6 || x === w(GLOBAL) || x === w(SUPER_NODE) || w(x + N_IS) !== IS_NODE) return 0;
    for (let r = latest(x); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) {
      const hd = w(r + R_HEAD); if (!hd || w(r + R_HOLES)) continue;
      const a = w(hd + N_A), n = w(hd + N_B) - a;
      if ((n === 10 && same(a, w(w(MAPPED) + 8 * M_SUPERPOSED), 9) && b(a + 9) === 115) || (n === 8 && b(a + 0) === 99 && b(a + 1) === 111 && b(a + 2) === 110 && b(a + 3) === 106 && b(a + 4) === 111 && b(a + 5) === 105 && b(a + 6) === 110 && b(a + 7) === 115) || (n === 9 && b(a + 0) === 99 && b(a + 1) === 111 && b(a + 2) === 110 && b(a + 3) === 106 && b(a + 4) === 111 && b(a + 5) === 105 && b(a + 6) === 110 && b(a + 7) === 101 && b(a + 8) === 100)) { if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1106, a, a + n); return 1; }
    }
    // (what it is made of, as Node.ray's rule reads it on the value; not where it is written, what it is in)
    return superposed_node(w(x + N_ALSO), depth + 1) || (made_link(x) ? superposed_node(w(x + N_PARENT), depth + 1) : 0);
  }
  // (a link of components, `X &+= Y` again: its parent is what X was made of before, not where it is)
  function made_link(x: number): number { return w(x + N_IS) === IS_NODE && !w(x + N_A) && !w(x + N_B) && latest(x) === w(x + N_BASE) && w(x + N_ALSO) ? 1 : 0; }
  // (of what s is made of, in the order it is seen, the first whose own or what it is made of holds o's rules: that one when it
  // is a value (not a class: a class defines its `of`), its methods run on it; else none, they run on s)
  function valued_component(s: number, o: number): number {
    let c = w(s + N_ALSO);
    for (let n = 0; c && n < 16; n++) {
      // (a link of components, `X &+= Y` more than once: the last added (its own also), then the ones before (its parent))
      const link = w(c + N_IS) === IS_NODE && !w(c + N_A) && !w(c + N_B) && latest(c) === w(c + N_BASE) && w(c + N_ALSO);
      const v = link ? w(c + N_ALSO) : c;
      if (reaches(v, o, 0)) return classed(v) ? 0 : v;
      c = link ? w(c + N_PARENT) : 0;
    }
    return 0;
  }
  // (a node on a cycle of what nodes are made of and in, from v: one met again while it is being walked; else 0. With --debug
  // only: each node's mark, its depth on the path being walked, in the scratch after the reading's)
  function cycle_of(v: number, depth: number): number {
    if (!v || depth > 1024 || v === w(GLOBAL) || w(v + N_IS) !== IS_NODE) return 0;
    const path = w(THREAD + T_SCRATCH) + 4096;
    for (let i = 0; i < depth; i++) if (w(path + 4 * i) === v) return v;
    set(path + 4 * depth, v);
    return cycle_of(w(v + N_ALSO), depth + 1) || cycle_of(w(v + N_PARENT), depth + 1);
  }
  // (whether the text from at begins with a word that leads a rule taking more after it, `checked {type}`, `is {type}`: no
  // value of its own, what juxtaposition (`n T`) takes is not one)
  function keyword_led(at: number, end: number): number {
    let o = at; while (o < end && b(w(CLASSES) + b(o)) === 1) o++;
    if (o === at || o >= end || b(o) > 32) return 0;
    for (let r = latest(w(GLOBAL)), k = 0; r && !(w(r + R_FLAGS) & DEAD) && k < 1 << 16; r = w(r), k++) {
      if (w(r + R_PARTS) < 2 || !w(r + R_HOLES) || (w(r + R_PART) & 15) !== LITERAL) continue;
      if (w(r + R_PART + 8) === o - at && same(w(r + R_PART + 4), at, o - at)) return 1;
    }
    return 0;
  }
  // (whether v is, or is made of, o (what it is made of, and what that is made of in turn; a link of components, both))
  // (the rule a node sees by a name (from s, n long): its own, else what it is made of sees (the last it was made of first), else
  // what it is in; not the language's own; none, 0)
  function rule_seen(t: number, nd: number, s: number, n: number, depth: number): number {
    if (!nd || depth > 64 || nd === w(GLOBAL) || w(nd + N_IS) !== IS_NODE) return 0;
    for (let r = latest(nd); r && r !== w(nd + N_BASE); r = w(r)) {
      const hd = w(r + R_HEAD);
      if (!w(r + R_HOLES) && hd && trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, s + n)) return r;
    }
    return rule_seen(t, w(nd + N_ALSO), s, n, depth + 1) || rule_seen(t, w(nd + N_PARENT), s, n, depth + 1);
  }
  // (what a node answers under a name, read on another (on): that rule, applied; none, 0)
  function member_seen(t: number, nd: number, s: number, n: number, on: number, depth: number): number {
    const r = rule_seen(t, nd, s, n, depth), hd = r ? w(r + R_HEAD) : 0;
    return r ? apply(t, r, 0, frame(0, 0, on, 0, 0, 0, 0, on, on), 0, on, w(hd + N_A), w(hd + N_B), on, on) : 0;
  }
  function made_of_deep(v: number, o: number, depth: number): number {
    if (!v || depth > 64 || v === w(GLOBAL)) return 0;
    if (v === o) return 1;
    const link = w(v + N_IS) === IS_NODE && !w(v + N_A) && !w(v + N_B) && latest(v) === w(v + N_BASE) && w(v + N_ALSO);
    return made_of_deep(w(v + N_ALSO), o, depth + 1) || (link ? made_of_deep(w(v + N_PARENT), o, depth + 1) : 0);
  }
  function reaches(v: number, o: number, depth: number): number {
    if (!v || depth > 8 || v === w(GLOBAL)) return 0;
    if (v === o) return 1;
    return reaches(w(v + N_ALSO), o, depth + 1) || reaches(w(v + N_PARENT), o, depth + 1);
  }
  // (a class: what defines `of` itself, the class its instances are of (its own rules: an instance sees its class's `of`))
  function classed(v: number): number {
    if (w(v + N_IS) !== IS_NODE || w(v + N_A) !== 0) return 0;
    for (let r = latest(v); r && r !== w(v + N_BASE) && !(w(r + R_FLAGS) & DEAD); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 2 && b(w(hd + N_A)) === 111 && b(w(hd + N_A) + 1) === 102) return 1; }
    return 0;
  }
  // (each character one byte)
  function ascii(a: number, z: number): number { for (let i = a; i < z; i++) if (b(i) >= 128) return 0; return 1; }
  // (where what ends at p began: a text in quotes, `"b"`, or what brackets enclose, `(x)`, `[x]`; p, none)
  function token_start(s: number, p: number): number {
    const c = b(p - 1);
    if (c === 34 || c === 96) { for (let q = p - 2; q >= s; q--) if (b(q) === c) return q; return p; }
    if (c === 41 || c === 93) { const o = c === 41 ? 40 : 91; let d = 0; for (let q = p - 1; q >= s; q--) { if (b(q) === c) d++; else if (b(q) === o && --d === 0) return q; } return p; }
    return p;
  }
  // (rule r's head has `//` written in it: a comment's)
  function comments(r: number): number { for (let k = 0; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) === LITERAL && w(q + 8) >= 2 && b(w(q + 4)) === 47 && b(w(q + 4) + 1) === 47) return 1; } return 0; }
  // (rule h, led by a hole, then a word that leads statements of its own (`if`, `unless`), declared after rule l, led by text:
  // h binds looser, around what l reads (declaration order); a word leading none (`reads_closed`) or an operator does not)
  function guards(h: number, l: number): number {
    const fh = w(h + R_FLAGS), fl = w(l + R_FLAGS);
    if ((fh & (LED | METHOD | 1)) || !(fl & LED) || (fl & 1) || declared_at(h) <= declared_at(l) || (w(h + R_PART) & 15) !== HOLE) return 0;
    let k = 1; if ((w(h + R_PART + PART) & 15) === SPACE) k++;
    if (k >= w(h + R_PARTS)) return 0;
    const q = h + R_PART + PART * k, a = w(q + 4), n = w(q + 8);
    if ((w(q) & 15) !== LITERAL) return 0;
    for (let i = 0; i < n; i++) if (b(w(CLASSES) + b(a + i)) !== 1) return 0;
    // (a word that leads a rule led by text, where the language is)
    for (let r = latest(w(GLOBAL)); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) if ((w(r + R_FLAGS) & LED) && w(r + R_PART + 8) === n && same(w(r + R_PART + 4), a, n) && (w(r + R_PARTS) === 1 || (w(r + R_PART + PART) & 15) === SPACE)) return 1;
    return 0;
  }
  // Counts: a Number the kernel holds as how many links it is (N_A, one more; a node otherwise has none there).
  function counted(c: number): number { return node(IS_NODE, c + 1, 0, w(COUNTED) || w(NUMBERS), 0); }
  // (how many a Number is: a count's; one written by the language, `Number(next: x)`, its own `next` counted on, down to None;
  // anything else (not made of Number, or too long), -1)
  function count_of(t: number, x: number, names: number, f: number): number {
    let c = 0;
    for (let n = 0; n < 64; n++) {
      if (!x || w(x + N_IS) !== IS_NODE) return -1;
      if (w(x + N_A) > 0) return w(x + N_A) - 1 + c;
      if (!numbered_node(x, 0)) return -1;
      // (its own `next`, what it was given, read)
      let own = 0;
      for (let r = latest(x); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 4 && same(w(hd + N_A), w(w(WORDS) + 8 * W_NEXT), 4)) { own = r; break; } }
      // (none of its own, and none it is made of or in either (`Number()`): its `next` reads nothing, it is zero after c)
      if (!own) return nexted(x, 0) ? -1 : c;
      const hd = w(own + R_HEAD), v = apply(t, own, 0, names, f, x, w(hd + N_A), w(hd + N_B), x, 0);
      if (stopped(t)) return -1;
      if (!v || v === w(NOTHING)) return c;
      c++; x = v;
    }
    return -1;
  }
  // (whether a `next` (of no holes) is defined in what x is, is made of or is in, short of the global scope)
  function nexted(x: number, depth: number): number {
    if (!x || depth > 8 || x === w(GLOBAL)) return 0;
    for (let r = latest(x); r && r !== w(x + N_BASE); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 4 && same(w(hd + N_A), w(w(WORDS) + 8 * W_NEXT), 4)) return 1; }
    return nexted(w(x + N_ALSO), depth + 1) || nexted(w(x + N_PARENT), depth + 1);
  }
  // (made of Number: through what it is in and made of, near)
  function numbered_node(x: number, depth: number): number {
    if (!x || depth > 8 || x === w(GLOBAL)) return 0;
    if (x === w(NUMBERS)) return 1;
    return numbered_node(w(x + N_ALSO), depth + 1) || numbered_node(w(x + N_PARENT), depth + 1);
  }
  function numeral_of(a: number, z: number): number {
    a = skip(a, z); while (z > a && b(z - 1) <= 32) z--;
    if (a >= z || z - a > 9) return -1;
    let c = 0; for (let i = a; i < z; i++) { const d = b(i) - 48; if (d < 0 || d > 9) return -1; c = c * 10 + d; }
    return c;
  }
  // (rule r, Number's own, one of those the kernel's map names (`number succ == < + …`): the name's first character (`succ`:
  // `s`, `==`: `=`); else 0)
  function number_op(r: number): number {
    if (!w(NUMBER_OPS) || !r) return 0;
    const hd = w(r + R_HEAD); if (!hd) return 0;
    const ha = w(hd + N_A), hn = w(hd + N_B) - ha, l = w(NUMBER_OPS), le = l + w(NUMBER_OPS + 4);
    // (the one equality, Node's: answered so too, on counts (and texts, by their characters))
    if (w(r + R_OWNER) === w(SUPER_NODE) && w(SUPER_NODE) && hn === 2 && b(ha) === 61 && b(ha + 1) === 61) return 61;
    if (w(r + R_OWNER) !== w(NUMBERS)) return 0;
    for (let p = l; p < le;) { while (p < le && b(p) <= 32) p++; let q = p; while (q < le && b(q) > 32) q++; if (q - p === hn && same(p, ha, hn)) return b(ha); p = q; }
    return 0;
  }
  // (what an operator answers on two counts, as the language's rules do; -1, nothing it answers)
  function number_answer(op: number, cx: number, cy: number): number {
    if (op === 43) return cx + cy < 0x7FFFFFFE ? counted(cx + cy) : -1;
    if (op === 45) return counted(cx > cy ? cx - cy : 0);
    if (op === 42) return cy === 0 || cx <= 0x7FFFFFFE / cy ? counted(cx * cy) : -1;
    if (op === 47) return counted(cy === 0 || cx < cy ? 0 : (cx / cy) | 0);
    if (op === 37) return counted(cy === 0 || cx < cy ? cx : cx % cy);
    if (op === 60) return w(TRUE_) && w(FALSE_) ? (cx < cy ? w(TRUE_) : w(FALSE_)) : -1;
    if (op === 61) return w(TRUE_) && w(FALSE_) ? (cx === cy ? w(TRUE_) : w(FALSE_)) : -1;
    return -1;
  }
  // (the characters from `at` to `end`, as bits: which of 32 kinds each is)
  function bytes(at: number, end: number) { let m = 0; for (; at < end; at++) m |= 1 << (b(at) & 31); return m; }
  // (one led by a hole: its texts written from `at` to `end`, one after another, or it can't read it)
  function written(r: number, at: number, end: number) {
    for (let k = 0; k < w(r + R_PARTS); k++) {
      const q = r + R_PART + PART * k;
      if ((w(q) & 15) !== LITERAL) continue;
      const a = w(q + 4), n = w(q + 8), c = b(a);
      let p = at;
      while (p + n <= end && !(b(p) === c && same(p, a, n))) p++;
      if (p + n > end) return 0;
      at = p + n;
    }
    return 1;
  }
  // A head written from `at` to `end`, into rule `out`'s parts: literal text, spaces, holes. Its holes, how many.
  function parts(at: number, end: number, out: number) {
    let k = 0, h = 0;
    const hole = w(OPEN_LENGTH) * 8 + 5;
    while (at < end) {
      const q = out + R_PART + PART * k;
      k++; set(q + 16, 0); set(q + 20, 0);
      if (bracket(at, end) === hole) {
        const e = past(at, end);
        // (one with nothing in it: the space it holds, there)
        if (skip(at + w(OPEN_LENGTH), e - w(CLOSE_LENGTH)) >= e - w(CLOSE_LENGTH)) { set(q, SPACE | HUG); at = e; continue; }
        set(q, HOLE); at += w(OPEN_LENGTH); set(q + 4, at); set(q + 8, e - w(CLOSE_LENGTH) - at); set(q + 12, h); h++;
        at = e; continue;
      }
      if (b(at) <= 32) { set(q, SPACE); while (at < end && b(at) <= 32) at++; continue; }
      set(q, LITERAL); set(q + 4, at);
      at++;
      while (at < end && b(at) > 32 && bracket(at, end) !== hole) at++;
      set(q + 8, at - w(q + 4));
    }
    set(out + R_PARTS, k); set(out + R_HOLES, h);
    return h;
  }

  // The separator (`=>`) in it, nothing open around it: only a rule with it in its head reads it (a definition).
  function defines(s: number, e: number) {
    const sep = w(SEPARATOR), n = w(SEPARATOR_LENGTH);
    for (let at = s; at < e;) { if (at + n <= e && same(at, sep, n)) return 1; at = bracket(at, e) & 1 ? past(at, e) : at + 1; }
    return 0;
  }
  // `{name}` (or, `bracketed` 0, `name`) written from s to e: the hole it names, (how many frames out << 16 | which) + 1; or 0.
  function ref(rule: number, f: number, s: number, e: number, bracketed: number) {
    while (e > s && b(e - 1) <= 32) e--; while (s < e && b(s) <= 32) s++;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH);
    if (bracketed) { if (e - s <= open + close || bracket(s, e) !== 5 + 8 * open || past(s, e) !== e) return 0; s += open; e -= close; }
    for (let depth = 0; rule; depth++) {
      const i = named(rule, s, e);
      if (i >= 0) return (depth << 16 | i) + 1;
      rule = f ? w(f + F_RULE) : 0; f = f ? w(f + F_CLOSURE) : 0;
    }
    return 0;
  }
  // (as ref, for what `names` (a frame of `rule`) reads: in what its rule inlined (`{{x}}`), the rule's own holes, then the names
  // of where that was written; the frame to take from at T_REFF)
  function refer(names: number, rule: number, closure: number, s: number, e: number, bracketed: number) {
    while (e > s && b(e - 1) <= 32) e--; while (s < e && b(s) <= 32) s++;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH);
    let a = s, z = e;
    if (bracketed) { if (e - s <= open + close || bracket(s, e) !== 5 + 8 * open || past(s, e) !== e) return 0; a += open; z -= close; }
    let base = names, depth = 0;
    for (let n = 0; rule && n < 256; n++) {
      if (DEBUG && (w(rule + R_PARTS) < 0 || w(rule + R_PARTS) > 64 || (w(rule + R_PARTS) && (w(rule + R_PART + 4) < 0 || w(rule + R_PART + 8) < 0 || w(rule + R_PART + 8) > 1 << 20)))) { debug(D_FAULT, 1100, base, rule); return 0; }
      const i = named(rule, a, z);
      if (i >= 0) { set(THREAD + T_REFF, base); return (depth << 16 | i) + 1; }
      // (written in what this rule inlined: on from where that was written)
      if (w(rule + R_INL_F) && s >= w(rule + R_INL_S) && e <= w(rule + R_INL_E)) { if (DEBUG && w(w(rule + R_INL_F) + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, w(rule + R_INL_F), rule); return 0; } base = w(rule + R_INL_F); depth = 0; rule = w(base + F_RULE); closure = w(base + F_CLOSURE); continue; }
      if (w(rule + R_IN2_F) && s >= w(rule + R_IN2_S) && e <= w(rule + R_IN2_E)) { if (DEBUG && w(w(rule + R_IN2_F) + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, w(rule + R_IN2_F), rule); return 0; } base = w(rule + R_IN2_F); depth = 0; rule = w(base + F_RULE); closure = w(base + F_CLOSURE); continue; }
      if (DEBUG && closure && w(closure + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, closure, rule); return 0; }
      rule = closure ? w(closure + F_RULE) : 0; closure = closure ? w(closure + F_CLOSURE) : 0; depth++;
    }
    return 0;
  }
  // (the hole of `rule` written as the text from s to e: which, or -1)
  function named(rule: number, s: number, e: number) {
    for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && trimmed(w(q + 4), w(q + 8), s, e)) return w(q + 12); }
    return -1;
  }
  // Text taken as code: in brackets, what is inside them (at T_A, T_B).
  function code(t: number, s: number, e: number) {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    if (bracket(s, e) === 5 + 8 * w(OPEN_LENGTH) && past(s, e) === e) { s += w(OPEN_LENGTH); e -= w(CLOSE_LENGTH); }
    set(t + T_A, s); set(t + T_B, e);
  }

  // Text from s to e read (`Statements`'s statement): with the names of `rule` (and the frames it was defined in, from
  // `closure`), with the rules from `vis` on (to `stop`), in `self`; `on`: what follows a value, read on it.
  function reading(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, want: number, stop: number, refuse: number, on: number): number {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    if (DEBUG) count(K_READING);
    // (what a hole being declared reads, the names in it: no reader reads them)
    if (w(t + T_HOLE)) refuse |= READER;
    // (read once: the same text, with the same rules and names, is the same reading; not one in a frame, nor one nothing read)
    // (read in a check, quietly: what it checks in turn is not read (TYPINGS), so a reading of its own)
    const flags = want | refuse << 8 | on << 16 | (w(THREAD + T_QUIET) >= TYPINGS ? 1 << 24 : 0), framed = s < e && w(self + N_IS) === IS_FRAME;
    // (what is visible from a node with no rules of its own, nor made of anything: what its parent sees; read once for all such)
    for (let n = 0; n < 16 && vis && (w(vis + R_FLAGS) & DEAD) && vis !== stop; n++) {
      const o = w(vis + R_OWNER);
      if (!o || w(o + N_ALSO) || !w(o + N_PARENT) || w(o + N_IS) === IS_FRAME) break;
      vis = latest(w(o + N_PARENT));
    }
    let slot = 0, gslot = 0;
    // (with shadows, a test's or a file's own: read once in that one, by where it began)
    // (under shadows, a test's or a file's own: read once while they are as they are)
    // (exactly: these shadows (whose, as changed how often, how many), none: 0)
    // (in a test: its own, this thread's (another's may read it; what it keeps is its own memory))
    const sh = w(THREAD + T_REG_AT) ? 0 : w(THREAD + T_SH_N) ? w(THREAD + T_SH) : 0, gen = sh ? w(THREAD + T_SHGEN) : 0, shn = sh ? w(THREAD + T_SH_N) : 0;
    // (and as what it sees is: the last rule of every node it sees past the first, as they are now)
    // (in a frame with no rules of its own: what it reads there is what its rule names, and what it sees; read once for all of
    // that rule's frames that see the same)
    const bare = framed && latest(self) === w(self + N_BASE) ? 1 : 0;
    // (not while a rule is kept from reading itself: that reading is its own)
    // (in a test: what it made itself kept as what it is written as, the rest as itself)
    const reg = w(THREAD + T_REG_AT) ? 1 : 0, keeps = (!framed || bare) && w(MEMO) && !w(THREAD + T_SKIP), at_ = reg ? kept_as(vis) : vis, named_by = bare ? (reg ? kept_as(w(self + F_RULE)) : w(self + F_RULE)) | 1 : 0;
    // (read without some rules, the other reading of one: kept as one of those, by which rules it is without)
    const sees = keeps ? seen(vis, stop, t) : 0, names_k = reg ? names_as(rule, closure) : rule, closure_k = (reg ? 0 : closure) ^ skips_key();
    // (in a test: what it kept, in this thread's own table, first (what other threads keep never changes what it finds), then
    // what was kept for all before the tests)
    if (keeps) {
      const own = w(THREAD + T_REG_AT) ? w(THREAD + T_OMEMO) : 0, h0 = mix(s * 31 + at_ * 17 + names_k * 13 + e + gen * 7 + sees + named_by * 3);
      for (let pass = own ? 0 : 1; pass < 2; pass++) {
        const tab = pass ? w(MEMO) : own, mask = pass ? w(MEMO_MASK) : OMEMO_MASK;
        for (let h = h0 & mask, n = 0; n < 32; n++, h = (h + 1) & mask) {
          const m = tab + MEMO_ENTRY * h, at = aload(m);
          if (!at) { if (pass ? !own : 1) slot = m; if (pass) gslot = m; break; }
          if (at === s && w(m + 4) === e && w(m + 8) === at_ && w(m + 12) === names_k && w(m + 16) === closure_k && w(m + 20) === flags && w(m + 24) === stop && w(m + 32) === sh && w(m + 36) === gen && w(m + 40) === shn && w(m + 44) === sees && w(m + 48) === named_by) { const kept = aload(m + 28); if (kept && (w(t + T_BUDGET) < w(m + 52) || w(t + T_QBUDGET) < w(m + 56))) break; if (kept) { set(t + T_BUDGET, w(t + T_BUDGET) - w(m + 52)); set(t + T_QBUDGET, w(t + T_QBUDGET) - w(m + 56)); if (DEBUG && (w(FAIL_FAST) & 4)) { const fresh = remembered(t, s, e, rule, closure, vis, self, want, stop, refuse, on); if (!alike_reading(fresh, kept)) { debug(D_FAULT, 88, s, e); debug(D_FAULT, 82, w(kept) * 1000 + w(fresh), w(kept + 12) === w(fresh + 12) ? 1 : 0); for (let i = 0; i < 2; i++) { const x = i ? fresh : kept; if (w(x) === K_RULE) { const hd = w(w(x + 12) + R_HEAD), ow = w(w(x + 12) + R_OWNER); if (hd) debug(D_FAULT, i ? 84 : 85, w(hd + N_A), w(hd + N_B)); debug(D_FAULT, 83, ow * 10 + w(w(x + 12) + R_KIND), in_region(w(x + 12)) ? 1 : 0); } } } if (w(kept) !== w(fresh)) debug(D_FAULT, 86, s, e); } return reg ? relit(kept, vis) : kept; } break; }
        }
      }
    }
    if (DEBUG) { count(K_AFRESH); if (framed && !bare) count(K_FRAMED); else if (w(THREAD + T_SH_N)) count(K_SHADOWED); }
    // (not one a cycle cut short: read as far as that check went, it is not the reading)
    const cut = w(THREAD + T_CUT); set(THREAD + T_CUT, 0);
    // (and what reading it cost, the rules it applied: what reading it again, kept, costs too, so a test may apply as much with
    // what was kept as without it, whoever kept it)
    const b0 = w(t + T_BUDGET), q0 = w(t + T_QBUDGET);
    const r = remembered(t, s, e, rule, closure, vis, self, want, stop, refuse, on);
    const spent = b0 - w(t + T_BUDGET), qspent = q0 - w(t + T_QBUDGET);
    if (DEBUG) debug(D_READING, s, e, r);
    const was_cut = w(THREAD + T_CUT); set(THREAD + T_CUT, cut | was_cut);
    // (in a test too: what it kept is forgotten when it is done)
    // (what is kept for all is never forgotten: it holds nothing a test lets go of, and another thread may be writing it)
  // (in a test, one holding nothing of the test's own: kept for all, a copy where nothing lets go of it (another test reads
    // the same text the same way); one holding the test's own, not kept)
    if (DEBUG && keeps && w(r) !== K_UNREAD && !was_cut && (!reg || lasting(r))) { debug(D_KEY, s, e, at_); debug(D_KEY + 1, names_k, sees, named_by); debug(D_KEY + 2, flags, stop, closure_k); }
    if (reg) { slot = 0; if (gslot && !(w(FAIL_FAST) & 16) && !was_cut && w(r) !== K_UNREAD && lasting(r)) { const p = lasted(r); if (p && cas(gslot, 0, s) === 0) { set(gslot + 4, e); set(gslot + 8, at_); set(gslot + 12, names_k); set(gslot + 16, closure_k); set(gslot + 20, flags); set(gslot + 24, stop); set(gslot + 32, sh); set(gslot + 36, gen); set(gslot + 40, shn); set(gslot + 44, sees); set(gslot + 48, named_by); set(gslot + 52, spent); set(gslot + 56, qspent); astore(gslot + 28, p); } } }
    if (slot && !was_cut && w(r) !== K_UNREAD && cas(slot, 0, s) === 0) { wrote(slot); set(slot + 4, e); set(slot + 8, at_); set(slot + 12, names_k); set(slot + 16, closure_k); set(slot + 20, flags); set(slot + 24, stop); set(slot + 32, sh); set(slot + 36, gen); set(slot + 40, shn); set(slot + 44, sees); set(slot + 48, named_by); set(slot + 52, spent); set(slot + 56, qspent); astore(slot + 28, r); }
    return r;
  }
  // (a number's bits, mixed: so that numbers near one another are not near in a table)
  function mix(x: number): number { x = (x ^ (x >> 16)) * 0x45d9f3b | 0; x = (x ^ (x >> 16)) * 0x45d9f3b | 0; return x ^ (x >> 16); }
  // (what a reading from `vis` sees, as one number: the last rule of each node it goes on to, as read() goes)
  function seen(vis: number, stop: number, t: number): number {
    let h = 0, backs = 0, deferred = 0, o = vis ? w(vis + R_OWNER) : 0, prev_seen = vis;
    const back = w(t + T_SCRATCH);
    for (let n = 0; o && n < 64; n++) {
      if (w(o + N_ALSO) && backs < 48) { set(back + 4 * backs, w(o + N_PARENT)); backs++; o = w(o + N_ALSO); }
      else { o = w(o + N_PARENT); if (o === w(GLOBAL) && backs) { deferred = o; o = 0; } while (!o && backs) { backs--; o = w(back + 4 * backs); if (o === w(GLOBAL) && backs) { deferred = o; o = 0; } } if (!o) o = deferred, deferred = 0; }
      if (!o) break;
      if (DEBUG && w(o + N_IS) === -1) { debug(D_FAULT, 92, prev_seen, o); return h; }
      prev_seen = o;
      const l = latest(o);
      if (l === stop) break;
      h = mix(h + kept_as(l));
    }
    return h;
  }
  // (what follows a value, read on it, in this reading's scratch: what that reads in turn, further on)
  // (the reading of an operator and what it takes, by declaration order: [reading of what is before p, p])
  function precedence(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, stop: number, on: number, sc: number, cut_only: number): number {
    const s0 = skip(s, e), cl = w(CLASSES);
    let o1 = s0; while (o1 < e && b(cl + b(o1)) === 2) o1++;
    if (o1 === s0 || o1 >= e || b(o1) > 32) return 0;
    const r1 = op_rule(t, s0, o1, on, sc); if (!r1) return 0;
    let cut = 0;
    for (let p = o1; p < e;) {
      if (b(p) > 32 && b(p - 1) <= 32 && b(cl + b(p)) === 2) {
        let q = p; while (q < e && b(cl + b(q)) === 2) q++;
        if (q < e && b(q) <= 32) {
          const rk = op_rule(t, p, q, on, sc);
          // (any operator the value reads, wherever it was written (`==` of Node's, `+` of Number's): by when it was declared)
          if (!rk) return 0;
          // (the same operator again, `1 < 2 < 3`: not where a rule of the value's reads all of it, a chain (`chainable`))
          if (declared_at(rk) <= declared_at(r1)) { if (q - p === o1 - s0 && same(p, s0, q - p) && chained(t, s0, e, r1, on, sc)) return 0; cut = p; break; }
        }
        p = q; continue;
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    if (cut_only && !cut) return 0;
    const at = cut || o1, left = reading(t, s, cut ? cut : o1, rule, closure, vis, self, 0, stop, 0, 1);
    if (w(left) === K_UNREAD || w(left) === K_EMPTY) return 0;
    const pr = alloc(8); set(pr, left); set(pr + 4, at); return pr;
  }
  // (whether a rule of on's other than r reads all from a to z, led by the operator: a chain, `< {middle} < {last}`)
  function chained(t: number, a: number, z: number, r: number, on: number, sc: number): number {
    set(t + T_SCRATCH, sc + SCRATCH);
    const end = read(a, z, latest(on), 0, LED, 0, sc), found = w(sc + 512);
    set(t + T_SCRATCH, sc);
    return end === z && found && found !== r && w(found + R_PARTS) >= 4 ? 1 : 0;
  }
  function op_rule(t: number, a: number, z: number, on: number, sc: number): number {
    set(t + T_SCRATCH, sc + SCRATCH);
    const end = read(a, z, latest(on), 0, LED, 0, sc);
    set(t + T_SCRATCH, sc);
    return end === z ? w(sc + 512) : 0;
  }
  function on_read(p: number, e: number, vis: number, stop: number, t: number, sc: number): number {
    set(t + T_SCRATCH, sc + SCRATCH);
    let end = read(p, e, vis, stop, LED | (defines(p, e) ? DEFINES : 0), 0, sc);
    // (or a reader the language has, a literal of its own (`{digits: Decimal_glyph[]}`, `13`))
    if (end < 0 && b(w(CLASSES) + b(p)) === 1) { end = read(p, e, latest(w(GLOBAL)), 0, READER, METHOD, sc); if (end >= 0 && w(w(sc + 512) + R_OWNER) !== w(GLOBAL)) end = -1; }
    set(t + T_SCRATCH, sc);
    return end;
  }
  function remembered(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, want: number, stop: number, refuse: number, on: number): number {
    // (and what is read within a left side being declared, `twice (x)` of `static twice (x) => …`: one too)
    const r = alloc(READ), left = (want & LEFT) || (w(t + T_DECL) && lefts() && in_left(s, e)) ? 1 : 0;
    want &= ~LEFT;
    set(r + 4, s); set(r + 8, e);
    if (s >= e) { set(r, K_EMPTY); return r; }
    // (read in a frame: what it holds: its takes as text, its caller, its this)
    // (not text read on a value, what follows it: that value's own to read (`<` given `this`, called without brackets))
    if (w(self + N_IS) === IS_FRAME && !on) {
      const ns = b(s) === 46 ? s + 1 : s;
      let h = -3;
      if (word(ns, e, W_CALLER)) h = -1; else if (word(ns, e, W_THIS)) h = -2; else if (w(self + F_RULE)) { const i = named(w(self + F_RULE), ns, e); if (i >= 0) h = i; }
      if (h !== -3) { set(r, K_HELD); set(r + 12, h); return r; }
    }
    // (in what a body inlined, `{{x}}`: the names of where that was written)
    // (in what a rule inlined: its own holes first, the parameters of the rule it is in; then the names where that was written)
    let x = refer(0, rule, closure, s, e, 1);
    if (x) { set(r, K_REF); set(r + 12, (x - 1) >> 16); set(r + 16, (x - 1) & 0xFFFF); set(r + 20, w(THREAD + T_REFF)); return r; }
    x = refer(0, rule, closure, s, e, 0);
    if (x) { set(r, K_NAME); set(r + 12, (x - 1) >> 16); set(r + 16, (x - 1) & 0xFFFF); set(r + 20, w(THREAD + T_REFF)); return r; }
    // (`this` written in a rule's body, no hole of it named so: that application's first argument, what it was read on,
    // wherever the code is read (a value given as an argument, read in the callee, is the caller's `this`))
    if (rule && !on && word(s, e, W_THIS)) { set(r, K_HELD); set(r + 12, -4); return r; }
    // (its scratch, the next free: what it reads, and what reading it reads in turn, further on)
    const sc = w(t + T_SCRATCH);
    if (sc + 3 * SCRATCH > w(t + T_SCRATCH_END)) { if (DEBUG) debug(D_FAULT, 97, s, e); if (!w(t + T_FAULT)) deep(t, w(t + T_DEPTH)); set(t + T_FAULT, L_DEEP); set(r, K_UNREAD); return r; }
    set(t + T_SCRATCH, sc + SCRATCH);
    // (a reader, a head that is one hole, reads only where a type's own rules read (a typed hole's value, read by them alone:
    // `stop`), and where a type is checked: anywhere else it would read everything)
    // (a reader in a type, a head that is one hole there, reads only where that type's own rules read (`stop`) and where it is
    // checked: anywhere else it would read everything in it; one in the language itself is a literal (`{digits: Decimal.String}`))
    // (read as part of a rule's body: its holes' names are its holes)
    if (DEBUG && (w(FAIL_FAST) & 64) && b(skip(s, e)) === 46) debug(D_FAULT, 81, s, e);
    // (an operator read on a value, and another of the value's after it that binds as loose or looser, `+ 12 == 24` on 12: what
    // the first takes ends there, whatever reads it whole (`+ {other}`))
    if (on && self && self !== w(GLOBAL) && w(self + N_IS) !== IS_FRAME && !left && !(w(FAIL_FAST) & 2048) && b(w(CLASSES) + b(s)) === 2) { const pr = precedence(t, s, e, rule, closure, vis, self, stop, self, sc, 1); if (stopped(t)) { set(t + T_SCRATCH, sc); set(r, K_UNREAD); return r; } if (pr) { set(t + T_SCRATCH, sc); set(r, K_ON); set(r + 12, w(pr)); set(r + 16, w(pr + 4)); set(r + 20, e); return r; } }
    const body_of = w(t + T_BODY); set(t + T_BODY, rule);
    // (in a left side, a name (a word, or an operator) and then its parameters in brackets alone, `f (x)`, `as (base: T)`,
    // `* (times: Number)`: that name being declared, not read by a rule that is it and an operand (`as {target}` is not applied to define `as`); but by one
    // that passes what follows through, a modifier (`static {statement} => {statement}`), or one of its own form (`as (=== T)`))
    const naming = w(t + T_NAMING), naming_n = w(t + T_NAMING_N);
    if (left && !on) { let o = skip(s, e); const a0 = o, z = trim_end(s, e), cl = w(CLASSES), kind0 = b(cl + b(o)); while (o < z && b(cl + b(o)) === kind0 && (kind0 === 1 || kind0 === 2)) o++; let p = o; while (p < z && b(p) === 32) p++; if (o > a0 && p > o && p < z && (bracket(p, z) & 3) === 1 && bracket(p, z) !== 5 + 8 * w(OPEN_LENGTH) && past(p, z) >= z) { let q = p + 1; while (q < z && b(q) === 32) q++; if (b(q) === b(z - 1) || b(cl + b(q)) === 1) { set(t + T_NAMING, a0); set(t + T_NAMING_N, o - a0); } }
      // (or, in a rule's body, one of its holes, `as {type} =>`: the name declared with what that hole took)
      else if (o > a0 && p > o && p < z && rule && bracket(p, z) === 5 + 8 * w(OPEN_LENGTH) && past(p, z) >= z && ref(rule, 0, p, z, 1)) { set(t + T_NAMING, a0); set(t + T_NAMING_N, o - a0); } }
    // (a member read, `x.name`: the name read in x is x's (its text, or written right after a `.`, wherever it is read))
    const sa = skip(s, e), member_read = (w(t + T_MEMBER) && s >= w(t + T_MEMBER_S) && s < w(t + T_MEMBER_E)) || (sa > 1 && b(sa - 1) === 46 && b(sa - 2) !== 46) ? 1 : 0;
    const end = read(s, e, vis, stop, want | (!refuse && defines(s, e) ? DEFINES : 0), refuse | (stop ? 0 : TYPE_READER) | (on ? 0 : METHOD) | (on || left || member_read ? 0 : MEMBER), sc);
    set(t + T_NAMING, naming); set(t + T_NAMING_N, naming_n);
    set(t + T_BODY, body_of);
    if (end >= 0) {
      const found = w(sc + 512), holes = w(found + R_HOLES), caps = alloc(8 * holes);
      for (let i = 0; i < holes; i++) { set(caps + 8 * i, w(sc + 516 + 12 * i)); set(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
      set(t + T_SCRATCH, sc);
      // (found in a component that is a value, `e` of a vertex `e + Ray`: run on that value)
      const so = vis ? w(vis + R_OWNER) : 0;
      set(r, K_RULE); set(r + 12, found); set(r + 16, caps); set(r + 20, vis); set(r + 24, !NOVIA && so && w(found + R_OWNER) !== so && w(so + N_ALSO) ? valued_component(so, w(found + R_OWNER)) : 0); set(r + 28, 0);
      // (a rule the map says superposes: what reads it without that rule, read alike, kept with it; the one taken when what
      // it is applied to is not superposed; none, the text unread here (read again when it runs, a parameter declared
      // by then, `f(x)` in `(f) => f(x)`; a name bare in a method's body, `holds(value)`, read on what it runs on))
      if (w(found + R_FLAGS) & (SUPERPOSING | REFUSES)) { if (DEBUG) debug(D_FAULT, 1093, 9, 1); const sn = w(t + T_SKIPS_N); if (sn >= 32 || !w(t + T_SKIPS)) { set(r, K_UNREAD); return r; } set(w(t + T_SKIPS) + 4 * sn, found); set(t + T_SKIPS_N, sn + 1); const h0 = DEBUG ? aload(HEAP) + w(t + T_CHUNK) : 0; const alt = remembered(t, s, e, rule, closure, vis, self, want | (left ? LEFT : 0), stop, refuse, on); if (DEBUG) debug(D_FAULT, 1093, 12, aload(HEAP) + w(t + T_CHUNK) - h0); set(t + T_SKIPS_N, sn); if (w(alt) === K_UNREAD) { set(r, K_UNREAD); return r; } set(r + 28, alt); }
      return r;
    }
    set(t + T_SCRATCH, sc);
    set(r, K_UNREAD);
    if (DEBUG && (w(FAIL_FAST) & 64) && b(skip(s, e)) === 46) { debug(D_FAULT, 81, s, e); debug(D_FAULT, 80, vis, stop); }
    if (want & HOLES) return r;
    // (an operator read on a value, then what it takes, `== 2 * 2 + 2` on 6: up to the next operator of the same value's that
    // binds as loose or looser, the one declared before it or itself (of two, the one declared later binds tighter); none, all
    // of what follows (`==` takes `2 * 2 + 2`))
    if (on && self && self !== w(GLOBAL) && w(self + N_IS) !== IS_FRAME && !left && !(w(FAIL_FAST) & 2048)) { const pr = precedence(t, s, e, rule, closure, vis, self, stop, self, sc, 0); if (pr) { set(r, K_ON); set(r + 12, w(pr)); set(r + 16, w(pr + 4)); set(r + 20, e); return r; } }
    // (a value and an operator after it, after a space, `6 == 2 * 2 + 2`: the operator and what follows read on the value, so
    // what the operator takes is by its precedence among the value's (above), not each operator on what is before it)
    if (!left && b(w(CLASSES) + b(skip(s, e))) !== 2) for (let p = s + 1; p < e;) {
      if (b(p) > 32 && b(p - 1) <= 32 && b(w(CLASSES) + b(p)) === 2) {
        let q = p; while (q < e && b(w(CLASSES) + b(q)) === 2) q++;
        if (q < e && b(q) <= 32 && worded(skip(s, p), trim_end(s, p))) { const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0); if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { set(r, K_ON); set(r + 12, o); set(r + 16, p); set(r + 20, e); return r; } }
        break;
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (a value, then the rest read on it: the first place what follows is read whole on a value (led by text) and what is before
    // it reads: `x.f(1)` is `f(1)` read in x; what follows begins with an operator or a bracket, or after a space or an
    // operator (`..9` is `9` read on what `..` is))
    for (let p = s; p < e;) {
      if (p > s && b(p) > 32 && (b(w(CLASSES) + b(p)) !== 1 || b(p - 1) <= 32 || b(w(CLASSES) + b(p - 1)) === 2) && on_read(p, e, vis, stop, t, sc) >= 0) {
        // (a member right after a word is that word's, `x == other.pred`: what follows is read from that word, after a space,
        // on what is before it (`other.pred` given to `==`), when that reads)
        // (and brackets right after a word are that word's, a call, `1 + gcd(other)`: what is before the word, the value)
        // (or right after a text or what brackets close, `"a" < "b".first`: that text's, those brackets')
        if ((b(p) === 46 || (bracket(p, e) & 3) === 1) && p > s && (b(w(CLASSES) + b(p - 1)) === 1 || token_start(s, p) < p)) {
          let q = p; if (b(w(CLASSES) + b(p - 1)) === 1) { while (q > s && b(w(CLASSES) + b(q - 1)) === 1) q--; } else q = token_start(s, p);
          if (q > s && b(q - 1) <= 32) { const o2 = reading(t, s, q, rule, closure, vis, self, 0, stop, 0, 0); if (w(o2) !== K_UNREAD && w(o2) !== K_EMPTY) { set(r, K_ON); set(r + 12, o2); set(r + 16, q); set(r + 20, e); return r; } }
        }
        const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0);
        if ((w(o) !== K_UNREAD || (left && (worded(s, p) || operated(s, p)))) && w(o) !== K_EMPTY) { set(r, K_ON); set(r + 12, o); set(r + 16, p); set(r + 20, e); return r; }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (none, read on a value: an operator after a space, or what follows an operator it begins with (`.m == v` on x, `+ part` on a
    // number: the operator's argument): what follows read on
    // that value when it runs (the member's value, the operator's closure), which is not what it is read on here)
    for (let p = s + 1; p < e;) {
      if (on && b(p) > 32 && b(p - 1) <= 32 && !left && (b(w(CLASSES) + b(p)) === 2 || operated(s, p))) {
        const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0);
        if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { set(r, K_ON); set(r + 12, o); set(r + 16, p); set(r + 20, e); return r; }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    return r;
  }

  // ---- running

  // What a reading answers. `names` is the frame whose names it was written with, `f` the one it is run in, `self` what it is
  // read in, `on` what it is read on (`.`, `this`), `written` where its text is (where what its holes take is read); `value`:
  // wanted as a value (text nothing reads is a place).
  // (a reading's value, with what it is read in kept while it is: a type a hole in it checks reads what the hole takes there
  // too, `f(x: other)`'s `other` the caller's)
  function ev(t: number, r: number, names: number, f: number, self: number, value: number, written: number, on: number): number {
    const was = w(t + T_WRITTEN_IN); set(t + T_WRITTEN_IN, self);
    const v = ev_(t, r, names, f, self, value, written, on);
    set(t + T_WRITTEN_IN, was); return v;
  }
  function ev_(t: number, r: number, names: number, f: number, self: number, value: number, written: number, on: number): number {
    const k = w(r);
    if (k === K_EMPTY) return 0;
    // (in a hole being declared, a word it begins with: its name, whatever else that word names (`{power: T}` with a `power`))
    const hl = w(t + T_HOLE);
    if (hl && !w(hl + N_A) && (k === K_RULE || k === K_NAME || k === K_REF) && w(r + 4) === skip(w(t + T_HOLE_A), w(t + T_HOLE_B)) && worded(w(r + 4), w(r + 8))) {
      let e = w(r + 8); while (e > w(r + 4) && b(e - 1) <= 32) e--;
      set(hl + N_A, w(r + 4)); set(hl + N_B, e); declare(t, hl, w(r + 4), e); return hl;
    }
    // (what nothing in it reads: read where its rule was written, that frame's node (a method a class block written in a call
    // defines, `wrapped (tag) => class: this { says => tag }`: the call's `tag`))
    if (k === K_LATER) { let rr = reading(t, w(r + 4), w(r + 8), w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0); const cf = w(names + F_CLOSURE), ct = cf && w(cf + N_IS) === IS_FRAME ? w(cf + F_THIS) : 0; if (w(rr) === K_UNREAD && ct && ct !== self && w(ct + N_IS) === IS_NODE) { const r2 = reading(t, w(r + 4), w(r + 8), w(names + F_RULE), w(names + F_CLOSURE), latest(ct), ct, 0, 0, 0, 0); if (w(r2) !== K_UNREAD) rr = r2; } return ev(t, rr, names, f, self, value, self, self); }
    if ((k === K_NAME || k === K_REF) && w(r + 20)) names = w(r + 20);
    if (DEBUG && k === K_NAME) { let fq = names; for (let d = 0; d <= w(r + 12); d++) { if (!fq || w(fq + N_IS) !== IS_FRAME) { debug(D_FAULT, 1103, w(r + 4), w(r + 8)); debug(D_FAULT, 1104, d, w(r + 20) ? 1 : 0); return 0; } if (d < w(r + 12)) fq = w(fq + F_CLOSURE); } if (w(fq + F_RULE) && w(r + 16) >= w(w(fq + F_RULE) + R_HOLES)) { debug(D_FAULT, 1103, w(r + 4), w(r + 8)); debug(D_FAULT, 1105, w(fq + F_RULE), w(r + 16)); return 0; } }
    if (k === K_NAME) return valued(t, take(w(r + 20) || names, w(r + 12), w(r + 16)));
    // (`{x}`: its code, read where it is used (its type said what it matched, not where it is read))
    if (k === K_REF) {
      const direct = take(names, w(r + 12), w(r + 16)), tk = follow(direct, 0);
      // (in a left side, a hole's code spliced where it is used, one word: declared, a place there (`.{member}`'s member); one
      // given through another's hole (`(on).{key}`, `x[name] := …`) whose word answers a text: that text the name)
      // (declared where `.` is: read on nothing, in a method's node, what that was read on (`.head := link` in `xs.append(v)`))
      // (only a member, a hole of a rule led by `.`: a name written bare is the call's own, `made := …` (each call its own))
      const into = w(names + F_RECEIVER) === w(names + F_THIS) && run_node(self) && dotted(w(names + F_RULE)) ? w(self + N_ALSO) : self;
      // (a text is a value: nothing is declared in it; a frame holds what its rule took, its caller and its this: those are read
      // (`"inner".unescaped`, `(external &).text`))
      const fixed = w(into + N_IS) === IS_TEXT || (w(into + N_IS) === IS_FRAME && held_in(into, w(tk), w(tk + 4)));
      // (read in a rule's body, of a left side's text: part of it)
      if (!w(t + T_DECL) && in_left(w(tk), w(tk + 4))) { set(t + T_DECL, 1); const v = ev(t, r, names, f, self, value, written, on); set(t + T_DECL, 0); return v; }
      if (w(t + T_DECL) && fixed) { set(t + T_DECL, 0); const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, into, 0, value, 1, w(tk + T_THIS) || into, 0); set(t + T_DECL, 1); return v; }
      // (or code that is one word of the left side, wherever the rule mentions it (`,`'s `list === declared`): a name declared
      // here, not a visible one's value (`(type, depth) := …` with a `type` visible))
      const of_left = !lefts() || left_along(direct) || in_left(w(r + 4), w(r + 8)) || (worded(w(tk), w(tk + 4)) && in_left(w(tk), w(tk + 4)));
      // (not of the left side being read (a member a rule's body reads, `,`'s `.spreading`): read as a value)
      if (w(t + T_DECL) && !of_left) { set(t + T_DECL, 0); const v = ev(t, r, names, f, self, value, written, on); set(t + T_DECL, 1); return v; }
      if (w(t + T_DECL) && worded(w(tk), w(tk + 4)) && of_left) {
        if (tk !== direct) { set(t + T_DECL, 0); const v = valued(t, tk); set(t + T_DECL, 1); if (v && w(v + N_IS) === IS_TEXT && worded(w(v + N_A), w(v + N_B))) return placed(t, w(v + N_A), w(v + N_B), into); }
        return placed(t, w(tk), w(tk + 4), into);
      }
      // (not one word: what it answers, a text, the name declared (`(on).{key}` given `"inner"`))
      if (w(t + T_DECL) && !worded(w(tk), w(tk + 4))) {
        // (the left side, from here: this code's text)
        const pushed = push_left(w(tk), w(tk + 4));
        const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, self, 0, value, 1, self, self === w(tk + T_THIS) ? w(tk + T_LEX) : 0);
        set(t + T_LE, pushed);
        return v && w(v + N_IS) === IS_TEXT && worded(w(v + N_A), w(v + N_B)) ? placed(t, w(v + N_A), w(v + N_B), into) : v;
      }
      // (all of it read here, the code a whole (`.({code})`, `{`{`}{block}{`}`}`, `{body}`); but a rule that is only its last
      // hole written against its text (`.{member} => {member}`): the rest of a line, what is read on a value in it keeps where
      // the line was written (`.for((x) => …)`: the closure where the line is), the rest read in what `.` is)
      const whole = !w(r + 12) && rest_of_line(w(names + F_RULE), w(r + 16)) ? 0 : 1;
      if (whole) { const wr = w(t + T_WRITER), ws = w(t + T_WRITER_SELF), th = w(tk + T_THIS); set(t + T_WRITER, th && th !== self && w(th + N_IS) === IS_NODE ? th : 0); set(t + T_WRITER_SELF, self); const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, self, 0, value, 1, self, self === w(tk + T_THIS) ? w(tk + T_LEX) : 0); set(t + T_WRITER, wr); set(t + T_WRITER_SELF, ws); return v; }
      const member = w(t + T_MEMBER), ms = w(t + T_MEMBER_S), me = w(t + T_MEMBER_E); set(t + T_MEMBER, into); set(t + T_MEMBER_S, w(tk)); set(t + T_MEMBER_E, w(tk + 4));
      const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, into, 0, value, 1, w(tk + T_THIS) || into, into === w(tk + T_THIS) ? w(tk + T_LEX) : 0);
      set(t + T_MEMBER, member); set(t + T_MEMBER_S, ms); set(t + T_MEMBER_E, me);
      return v; }
    if (k === K_HELD) {
      const h = w(r + 12);
      if (h === -1) return w(self + F_CALLER);
      // (`this`: what it was read on; else what it is read in, and in a method, a node made there is what that is read on)
      // (but a class called, `x.C(…)`: the class (what it makes is of it), not x)
      if (h === -2) { const th = w(self + F_THIS), rc = w(self + F_RECEIVER), it = run_node(th) ? w(th + N_ALSO) : th; return rc !== th && !classed(it) ? rc : it; }
      if (h === -4) { const fr = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? names : 0; if (!fr) return self; const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER), it = run_node(th) ? w(th + N_ALSO) : th; return rc !== th && !classed(it) ? rc : it; }
      const tk = follow(self + F_TAKES + TAKE * h, 0);
      // (a text: in what the kernel's map says texts are (its rules read on it), else in what everything is)
      return node(IS_TEXT, w(tk), w(tk + 4), w(TEXTS) || w(GLOBAL), 0);
    }
    // (in a left side read as a value, a name a visible value has: that one, where it is (`({name}) => value`, `=`'s head))
    // (and an operator's name, `#` of `# => …`: the name, not what the rule it is answers)
    if (k === K_RULE && w(t + T_DECL) && w(t + T_ONE) === w(r + 4) && !w(w(r + 12) + R_HOLES) && (worded(w(r + 4), w(r + 8)) || operated(w(r + 4), w(r + 8)))) { set(t + T_ONE, 0); return placed(t, w(r + 4), w(r + 8), w(t + T_HERE) ? (w(t + T_DEFIN) || self) : w(w(r + 12) + R_OWNER)); }
    if (k === K_RULE && w(r + 28)) {
      // (a superposing rule, with what reads it without it: applied, asking; not superposed, that other, given the values read)
      set(t + T_LEXV, w(r + 20)); const via = w(r + 24), g0 = w(t + T_GIVEN_N), alt = w(t + T_ALT);
      set(t + T_ALT, w(r + 12));
      const v = apply(t, w(r + 12), w(r + 16), names, f, via || self, w(r + 4), w(r + 8), written, via || on);
      const other = w(t + T_ALT) === 1; set(t + T_ALT, alt);
      if (!other) { set(t + T_GIVEN_N, g0); return v; }
      const v2 = ev_(t, w(r + 28), names, f, self, value, written, on);
      set(t + T_GIVEN_N, g0); return v2;
    }
    if (k === K_RULE) { set(t + T_LEXV, w(r + 20)); const via = w(r + 24); return apply(t, w(r + 12), w(r + 16), names, f, via || self, w(r + 4), w(r + 8), written, via || on); }
    if (k === K_ON) return onto(t, r, names, f, self, value, written);
    const s = w(r + 4), e = w(r + 8);
    // (nothing read it as written: when it runs, what follows an operator read on the value it follows, its own methods
    // reading it (`6 == 6`, `"0".."9"`: what no rule in scope could), the first place one begins after what reads)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !defines(s, e)) for (let p = s; p < e;) {
      if (p > s && b(w(CLASSES) + b(p)) === 2 && b(w(CLASSES) + b(p - 1)) !== 2) {
        const o = reading(t, s, p, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
        if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { const r2 = alloc(READ); set(r2, K_ON); set(r2 + 4, s); set(r2 + 8, e); set(r2 + 12, o); set(r2 + 16, p); set(r2 + 20, e); return onto(t, r2, names, f, self, value, written); }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (a member that is not there, a name written bare in a method's body that nothing reads, the method run on a value
    // (`next` of `is_zero => next === None`, made `Number()`): None (§5, a missing member reads as None))
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && worded(s, e)) { const th = (self && self !== w(GLOBAL) && !making(self) && (w(self + N_IS) === IS_NODE || w(self + N_IS) === IS_TEXT) && w(names + N_IS) === IS_FRAME && w(names + F_RULE) && w(w(names + F_RULE) + R_HOLES) ? self : 0) || held_this(names) || (names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? w(names + F_THIS) : 0); if (th && th !== w(GLOBAL) && (w(th + N_IS) === IS_NODE || w(th + N_IS) === IS_TEXT)) return w(NOTHING); }
    // (an operator missing a side, as a value nothing reads (Node.ray: a section, `xs.map(+ 1)`, `.some(== 8)`, `reduce(+)`):
    // the function of what it misses, `(left) => left + 1`; the operator alone, of both, `(left, right) => left + right`
    // (`!` alone, of one); not `-` written against a digit, a number)
    if (k === K_UNREAD && value && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && w(t + T_FAULT) !== L_DEEP) { const sv = sectioned(t, s, e, names, self); if (sv) return sv; }
    // (unread because what read it went too deep (it read itself, again and again): that, not that nothing reads it)
    if (!value) { unread(t, s, e); return 0; }
    // (in a hole: the hole, where a name is declared in it (at its start, or after a `,`: `{a, b}`); in a test, an error: the
    // test failed; else a place, named by the text, here)
    const hole = w(t + T_HOLE);
    if (hole && naming(t, s)) {
      if (!w(hole + N_A)) { set(hole + N_A, s); set(hole + N_B, e); declare(t, hole, s, e); return hole; }
      if (trimmed(w(hole + N_A), w(hole + N_B) - w(hole + N_A), s, e)) return hole;
      // (another name in it: one of its own, `{a, b}` two holes)
      const other = node(IS_HOLE, s, e, w(hole + N_PARENT), 0);
      declare(t, other, s, e);
      return other;
    }
    // (in a test, an error; but in a node a rule is making (`external .`, while it runs), a place: a name it is given, it has)
    // (while a left side is read, a name nothing reads is what it declares: no error)
    if (w(t + T_TESTING) && !making(self) && !w(t + T_DECL) && !w(t + T_LE)) { unread(t, s, e); if ((w(FAIL_FAST) & 1)) { jump(t, W_ERRED, 0); if (!w(THREAD + T_QUIET)) set(t + T_ERRED, 1); return 0; } }
    // (a left side's: where what it declares is defined, the node a call runs in (not where its parameters were written))
    let here = w(t + T_DECL) && w(t + T_DEFIN) ? w(t + T_DEFIN) : self;
    // (a name nothing reads yet, read bare in what holds members (a class's block before the class has its name, `Ray()` in
    // Ray's): a place where that is written, not a member of it (§21.3))
    if (0 && !w(t + T_DECL) && !making(self)) for (let up = 0; here && w(here + N_IS) === IS_NODE && w(w(here + N_BASE) + R_KIND) === MEMBERS_MARK && w(here + N_PARENT) && up < 64; up++) here = w(here + N_PARENT);
    const place = place_of(s, e, here), named_ = alloc(R_PART + PART);
    if (DEBUG) debug(D_FAULT, 1107, s, e);
    // (what a definition's head declares, about to be defined (`! => …`): no rule of a place left beside the one it defines)
    if (w(t + T_DECL) && w(t + T_DEFIN)) return place;
    set(named_ + R_KIND, VALUE); set(named_ + R_MASK, bytes(s, e)); set(named_ + R_BS, place); set(named_ + R_PARTS, 1); set(named_ + R_FLAGS, LED);
    set(named_ + R_HEAD, node(IS_HEAD, s, e, here, 0)); set(named_ + R_OWNER, here); set(named_ + R_PART + 4, s); set(named_ + R_PART + 8, e - s);
    link(here, named_);
    return place;
  }
  // (the text at s, in the hole being declared, where it declares a name: its start, or after a `,` there)
  function naming(t: number, s: number): number {
    const a = skip(w(t + T_HOLE_A), w(t + T_HOLE_B));
    if (s === a) return 1;
    let p = s; while (p > a && b(p - 1) <= 32) p--;
    return p > a && b(p - 1) === 44 ? 1 : 0;
  }
  // (a rule of the node's own that could read the text from s to e: what the reader asks of each before it matches (the bytes
  // it needs, the text it begins with); none, and what reads the text is what read it before)
  function could(n: number, s: number, e: number): number {
    if (w(FAIL_FAST) & 32) return 1;
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    const has = bytes(s, e);
    for (let x = latest(n), k = 0; x && x !== w(n + N_BASE) && k < 4096; x = w(x), k++) {
      const f = w(x + R_FLAGS);
      if (f & DEAD) return 1;
      if (!(w(x + R_MASK) & ~has) && (f & LED ? b(s) === b(w(x + R_PART + 4)) : written(x, s, e))) return 1;
    }
    return 0;
  }
  function making(n: number) { const by = w(n + N_B); return w(n + N_IS) === IS_NODE && by && w(by + N_IS) === IS_FRAME && !w(by + N_B) ? 1 : 0; }
  // (the text from s to e has a hole in it)
  function holed(s: number, e: number) { const hole = 5 + 8 * w(OPEN_LENGTH); for (let i = s; i < e; i++) if (bracket(i, e) === hole) return 1; return 0; }
  // (the text from s to e a pattern: a hole in it, not in brackets (`{x} + {y}`; `({x} => {y}).style` is code), that is none
  // of the holes of what it was written in, `names`)
  // (a group that is all of it, `({x})`, `[{x}]`, a pattern too; and what is quoted is not in brackets)
  function pattern(s: number, e: number, names: number) {
    const hole = 5 + 8 * w(OPEN_LENGTH);
    while (e > s && b(e - 1) <= 32) e--;
    for (let i = s; i < e;) {
      const k = bracket(i, e);
      if (k === hole) { if (!names || !w(names + F_RULE) || !ref(w(names + F_RULE), w(names + F_CLOSURE), i, past(i, e), 1)) return 1; i = past(i, e); continue; }
      if ((k & 3) === 1) { const p = past(i, e); if (p >= e && holed(i, p)) return 1; i = p; continue; }
      i++;
    }
    return 0;
  }
  // (the text from s to e one word, the space around it aside)
  // (a rule led by a word and more after it, `checked {type}`)
  function word_headed(r: number): number { return r && w(r + R_PARTS) > 1 && w(r + R_HOLES) && (w(r + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(r + R_PART + 4))) === 1 ? 1 : 0; }
  // (a parameter written without brackets: a word, else a word given a default or a type, `acc = 0`, `x: T`)
  function parameter_led(s: number, e: number) {
    if (worded(s, e)) return 1;
    let i = s; while (i < e && b(w(CLASSES) + b(i)) === 1) i++;
    if (i === s || i >= e || b(i) !== 32) return 0;
    while (i < e && b(i) === 32) i++;
    return i + 1 < e && ((b(i) === 61 && b(i + 1) === 32) || (b(i) === 58 && b(i + 1) === 32)) ? 1 : 0;
  }
  function worded(s: number, e: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e) return 0; for (let i = s; i < e; i++) if (b(w(CLASSES) + b(i)) !== 1) return 0; return 1; }
  // (a name declared where it is read: a place there, by that name)
  // (a place: a name given nothing yet, in self; read on, it answers what any value does, not what self has (where it is named,
  // kept by it))
  function place_of(s: number, e: number, self: number) { const p = node(IS_PLACE, s, e, w(GLOBAL) || self, 0); set(w(p + N_BASE) + R_CLOSURE, self); set(THREAD + T_NAMED, w(THREAD + T_NAMED) + 1); return p; }
  function place_in(p: number) { return w(w(p + N_BASE) + R_CLOSURE) || w(p + N_PARENT); }
  function placed(t: number, s: number, e: number, self: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; return place_of(s, e, self); }
  // (what a hole's content reads names: each, where it is written, and how far what made it reaches (`x: T`))
  function declare(t: number, n: number, s: number, e: number) {
    if (!w(t + T_DECLS)) set(t + T_DECLS, alloc(12 * DECLS));
    const k = w(t + T_DECLS_N);
    if (k < DECLS) { const d = w(t + T_DECLS) + 12 * k; set(d, n); set(d + 4, s); set(d + 8, e); set(t + T_DECLS_N, k + 1); }
  }
  function extend(t: number, n: number, s: number, e: number) {
    if (s < w(t + T_HOLE_A) || e > w(t + T_HOLE_B)) return;
    for (let k = 0; k < w(t + T_DECLS_N); k++) { const d = w(t + T_DECLS) + 12 * k; if (w(d) === n) { if (s < w(d + 4)) set(d + 4, s); if (e > w(d + 8)) set(d + 8, e); } }
  }
  // (to one of the words the host knows, as a label)
  function jump(t: number, k: number, v: number) { set(t + T_JUMP_S, w(w(WORDS) + 8 * k)); set(t + T_JUMP_N, w(w(WORDS) + 8 * k + 4)); set(t + T_JUMP_V, v); }
  // (a rule made the last of a node's own: what read the node before still does)
  function link(self: number, rule: number) {
    // (when it was declared, among all: what binds looser is declared after)
    set(rule + R_STAMP, xadd(w(MAPPED) + 8 * M_SPAN + 8, 1) + 1);
    // (an operator defined again in the same node (`+ {other}`, accelerated in the kernel's map): it binds as the one before it
    // led by it, where that was declared)
    const q0 = rule + R_PART;
    if ((w(q0) & 15) === LITERAL && b(w(CLASSES) + b(w(q0 + 4))) === 2) {
      const oa = w(q0 + 4), on_ = w(q0 + 8);
      for (let o = latest(self), k = 0; o && !(w(o + R_FLAGS) & DEAD) && k < 4096; o = w(o), k++) { const q = o + R_PART; if ((w(q) & 15) === LITERAL && w(q + 8) === on_ && same(w(q + 4), oa, on_) && (w(o + R_PARTS) < 3 || (w(o + R_PART + 2 * PART) & 15) !== LITERAL)) { set(rule + R_STAMP, w(o + R_STAMP)); break; } }
    }
    if (older(self)) { const sh = shadow(self); if (sh) { set(rule + R_PREV, w(sh + 4)); signed(self, rule); skips(rule); set(sh + 4, rule); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1); return; } }
    if (DEBUG && w(THREAD + T_REG_AT) && in_region(rule) && !in_region(self) && self !== w(THREAD + T_ROOT)) { const hd = w(rule + R_HEAD); debug(D_FAULT, 96, hd ? w(hd + N_A) : w(rule + R_BS), hd ? w(hd + N_B) : w(rule + R_BE)); }
    for (;;) { const last = w(self + N_LAST); set(rule + R_PREV, last); signed(self, rule); skips(rule); if (cas(self + N_LAST, last, rule) === last) return; }
  }
  // (a node's rules as far as this one, as one number: what their heads are written as, each in turn (a reading of the same
  // text, with the same rules written the same way before it, is the same reading: what a test made, another call made too))
  function signed(self: number, rule: number) {
    const pv = w(rule + R_PREV), hd = w(rule + R_HEAD), a = hd ? w(hd + N_A) : w(rule + R_BS), z = hd ? w(hd + N_B) : w(rule + R_BE);
    let h = mix(w(rule + R_KIND) * 7 + (w(rule + R_FLAGS) & ~DEAD) * 13 + w(rule + R_HOLES) * 3 + (z - a));
    if (hd) for (let i = a; i < z && i < a + 64; i++) h = mix(h + b(i));
    // (one a test writes on what was made before it (a shadow): signed with where it is, what it follows itself, not what that is
    // written as (two numbers made alike, a shadow on each, are two))
    set(rule + R_SIG, mix((pv && w(pv + R_OWNER) === self ? (w(THREAD + T_REG_AT) && !in_region(pv) ? pv : w(pv + R_SIG)) : w(THREAD + T_REG_AT) && !in_region(self) ? self : 0x51ed270b) + h));
  }
  // (what a reading keeps of where it is: what was made before the test, itself; the test's own, what it is written as)
  function kept_as(x: number): number { return x && w(THREAD + T_REG_AT) && in_region(x) ? w(x + R_SIG) ^ 0x6a09e667 : x; }
  // (the names a reading reads (a rule's holes, and the frames it was made in): the test's own, as written, and where its
  // inlined text was)
  function names_as(rule: number, closure: number): number {
    let h = 0x3c6ef372;
    for (let n = 0; n < 16 && (rule || closure); n++) {
      if (rule && !in_region(rule) && (!closure || !in_region(closure))) return mix(h + rule * 31 + closure);
      h = mix(h + (rule ? w(rule + R_SIG) + w(rule + R_INL_S) * 31 + w(rule + R_IN2_S) * 17 : 7));
      rule = closure ? w(closure + F_RULE) : 0; closure = closure ? w(closure + F_CLOSURE) : 0;
    }
    return h;
  }
  // (a reading that holds nothing of the test's own: it can be kept for all; what it read in, rebound where it is read again)
  function lasting(r: number): number {
    const k = w(r);
    if (k === K_RULE) return !in_region(w(r + 12)) && !w(r + 24) && (!w(r + 28) || lasting(w(r + 28))) ? 1 : 0;
    if (k === K_ON) return lasting(w(r + 12));
    if (k === K_REF || k === K_NAME) return !w(r + 20) || !in_region(w(r + 20)) ? 1 : 0;
    return k === K_EMPTY || k === K_HELD ? 1 : 0;
  }
  // (two readings the same: what reads, what each hole took)
  function alike_reading(a: number, c: number): number {
    if (w(a) !== w(c) || w(a + 4) !== w(c + 4) || w(a + 8) !== w(c + 8)) return 0;
    const k = w(a);
    if (k === K_ON) return alike_reading(w(a + 12), w(c + 12)) && w(a + 16) === w(c + 16) && w(a + 20) === w(c + 20) ? 1 : 0;
    if (k === K_RULE) { if (w(a + 12) !== w(c + 12)) return 0; for (let i = 0; i < 2 * w(w(a + 12) + R_HOLES); i++) if (w(w(a + 16) + 4 * i) !== w(w(c + 16) + 4 * i)) return 0; return 1; }
    if (k === K_REF || k === K_NAME) return w(a + 12) === w(c + 12) && w(a + 16) === w(c + 16) ? 1 : 0;
    if (k === K_HELD) return w(a + 12) === w(c + 12) ? 1 : 0;
    return 1;
  }
  function relit(r: number, vis: number): number {
    const k = w(r);
    if (k === K_ON) { const p = relit(w(r + 12), vis); if (p === w(r + 12)) return r; const c = alloc(READ); for (let i = 0; i < READ; i += 4) set(c + i, w(r + i)); set(c + 12, p); return c; }
    if (k !== K_RULE || w(r + 20) === vis) return r;
    const c = alloc(READ); for (let i = 0; i < READ; i += 4) set(c + i, w(r + i)); set(c + 20, vis); return c;
  }
  // (a reading copied where nothing lets go of it: what it took, and what it holds, too)
  function lasted(r: number): number {
    const k = w(r), c = xadd(HEAP, READ);
    if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1093, 3, READ);
    if (c < 0 || c > w(LIMIT) - READ) return 0;
    for (let i = 0; i < READ; i += 4) set(c + i, w(r + i));
    if (k === K_ON) { const p = lasted(w(r + 12)); if (!p) return 0; set(c + 12, p); }
    if (k === K_RULE) {
      const holes = w(w(r + 12) + R_HOLES), caps = w(r + 16);
      if (caps && holes) { const q = xadd(HEAP, 8 * holes); if (q < 0 || q > w(LIMIT) - 8 * holes) return 0; for (let i = 0; i < 2 * holes; i++) set(q + 4 * i, w(caps + 4 * i)); set(c + 16, q); }
      set(c + 20, 0);
      if (w(r + 28)) { const a = lasted(w(r + 28)); if (!a) return 0; set(c + 28, a); }
    }
    return c;
  }
  // (a rule's kind, as a reading looks for it: led by a hole (0), or by text, by which of 32 kinds its first character is)
  // (one led by a hole, by the first text in its head: 65 on, by which of 64 kinds its first character is (KINDS); none, 129)
  function kind_of(r: number) {
    if (w(r + R_FLAGS) & LED) return 1 + (b(w(r + R_PART + 4)) & 63);
    for (let k = 1; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) === LITERAL && w(q + 8) > 0) return 65 + (b(w(CLASSES) + b(w(q + 4))) === 1 ? worded_kind(w(q + 4), w(q + 4) + w(q + 8)) : b(w(KINDS) + b(w(q + 4)))); }
    return 129;
  }
  // (a word, from p: of 31 kinds, by its characters (the kind its first text is, of a head whose first text is a word))
  function worded_kind(p: number, end: number) { let h = 0; for (const cl = w(CLASSES); p < end && b(cl + b(p)) === 1; p++) h = (h * 31 + b(p)) % 1000003; return 32 + h % 31; }
  // (for each kind, the next rule of it after this one, the rules before it: so a reading passes over the ones it can't be)
  function skips(r: number) {
    const p = w(r + R_PREV);
    let tb = w(r + R_SKIP);
    if (!tb) { tb = alloc(4 * (SKIPS + 2)); set(r + R_SKIP, tb); }
    set(tb + 4 * KIND_AT, kind_of(r));
    const pt = p && !(w(p + R_FLAGS) & DEAD) ? w(p + R_SKIP) : 0;
    // (and where it was declared among the node's own: one after the one before it)
    set(tb + 4 * SEQ_AT, pt ? w(pt + 4 * SEQ_AT) + 1 : 1);
    if (!pt) { for (let k = 0; k < SKIPS; k++) set(tb + 4 * k, p); return; }
    for (let k = 0; k < SKIPS; k++) set(tb + 4 * k, w(pt + 4 * k));
    set(tb + 4 * w(pt + 4 * KIND_AT), p);
  }
  // A test's own: what it writes in a node made before it is a shadow of that node's rules, seen in that test (and the ones it
  // holds) only, so that it changes nothing another test reads (the test's own frame is its own).
  function older(n: number) {
    if (!w(THREAD + T_ISO) || n === w(THREAD + T_ROOT) || n >= w(THREAD + T_MARK) || in_region(n)) return 0;
    return n >= w(THREAD + T_MARK_LO) && n < w(THREAD + T_MARK_HI) ? 0 : 1;
  }
  // (a node's rules, the last of them: a test's shadow of them, where it has one)
  function latest(n: number) {
    const k = w(THREAD + T_SH_N);
    if (k) { const sh = w(THREAD + T_SH); for (let i = 0; i < k; i++) if (w(sh + 12 * i) === n) return w(sh + 12 * i + 4); }
    return w(n + N_LAST);
  }
  function shadow(n: number) {
    const k = w(THREAD + T_SH_N);
    if (!w(THREAD + T_SH)) set(THREAD + T_SH, alloc(12 * SHADOWS));
    const sh = w(THREAD + T_SH);
    for (let i = 0; i < k; i++) if (w(sh + 12 * i) === n) return sh + 12 * i;
    if (k >= SHADOWS) return 0;
    set(sh + 12 * k, n); set(sh + 12 * k + 4, w(n + N_LAST)); set(sh + 12 * k + 8, w(n + N_LAST)); set(THREAD + T_SH_N, k + 1); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1);
    return sh + 12 * k;
  }
  // (isolated from here on: what is made from now is its own, what was made before it shadows)
  function isolate(t: number, root: number) { set(t + T_SHGEN, w(t + T_SHGEN) + 1); set(t + T_MARK, aload(HEAP)); set(t + T_MARK_LO, w(t + T_CHUNK)); set(t + T_MARK_HI, w(t + T_CHUNK_END)); set(t + T_SH_N, 0); set(t + T_ROOT, root); set(t + T_ISO, 1); }
  // A value, then the rest read on it: what that answers (and, at T_ON, the value). (What is read on a member, `x.f(y)`, is read
  // on what `f` is with x as `this`.)
  // (a node with a method led by a hole of its own (a closure's `{this}{argument}`))
  function methods_of(n: number): number { for (let o = latest(n), k = 0; o && o !== w(n + N_BASE) && k < 64; o = w(o), k++) if ((w(o + R_FLAGS) & (METHOD | LED | DEAD)) === METHOD) return 1; return 0; }
  // (what `this` is in an application: what it is read on (its receiver), else what its own node is made of, else its node)
  function held_this(fr: number): number { if (!fr || w(fr + N_IS) !== IS_FRAME || !w(fr + F_RULE) || !(w(w(fr + F_RULE) + R_FLAGS) & METHOD)) return 0; const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER); return rc !== th ? rc : run_node(th) ? w(th + N_ALSO) : th; }
  // (a value code is read in that is not what the application runs on (nor its own node, nor what that is made of))
  function another(fr: number, self: number): number {
    if (!self || w(self + N_IS) === IS_FRAME || !fr || w(fr + N_IS) !== IS_FRAME) return 0;
    const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER);
    if (self === th || self === rc || self === w(GLOBAL)) return 0;
    if (th && w(th + N_IS) === IS_NODE && w(th + N_ALSO) === self) return 0;
    if (rc && w(rc + N_IS) === IS_NODE && w(rc + N_ALSO) === self) return 0;
    if (w(self + N_IS) === IS_NODE && (w(self + N_PARENT) === th || w(self + N_PARENT) === rc)) return 0;
    return 1;
  }
  // (the name from s to e read on th: the same rule)
  function on_this(t: number, th: number, s: number, e: number, rule: number): number { if (w(rule + R_OWNER) === w(GLOBAL)) return 0; const r = reading(t, s, e, 0, 0, latest(th), th, 0, 0, 0, 0); return w(r) === K_RULE && w(r + 12) === rule ? 1 : 0; }
  function trim_end(s: number, e: number): number { while (e > s && b(e - 1) <= 32) e--; return e; }
  function onto(t: number, r: number, names: number, f: number, self: number, value: number, written: number): number {
    const p = w(r + 12);
    let on = 0, receiver = self;
    // (what the rest is read on: a value, in a left side too, `x` of `x.m`)
    const decl_in = w(t + T_DECL), declaring = decl_in;
    // (in a left side, brackets after it, `f (x)`, `x.m (y)`: it declared, a place, and they its head)
    const rs = skip(w(r + 16), w(r + 20));
    if (declaring && (!lefts() || in_left(rs, w(r + 20))) && rs < w(r + 20) && (bracket(rs, w(r + 20)) & 3) === 1 && bracket(rs, w(r + 20)) !== 5 + 8 * w(OPEN_LENGTH) && past(rs, w(r + 20)) >= w(r + 20)) {
      const ps = w(p + 4), pe = w(p + 8);
      const place = worded(ps, pe) || operated(ps, pe) ? placed(t, ps, pe, self) : ev(t, p, names, f, self, 1, written, self);
      if (place && w(place + N_IS) === IS_PLACE) return node(IS_CALLED, rs, w(r + 20), place, 0);
    }
    // (what the rest is read on, a value: no part of a left side, `(value).this`)
    set(t + T_DECL, 0); const lb = w(t + T_LB); set(t + T_LB, w(t + T_LE));
    if (w(p) === K_ON) { on = onto(t, p, names, f, self, 1, written); receiver = w(t + T_ON); }
    // (a value read where it is written, not as a member of another (`f(5)`, `body(x)`): what follows is read on it alone)
    // (the member a `.{member}` reads, `x.f(y)`'s `f`: what follows is read on it as x's)
    else {
      const member = w(t + T_MEMBER) === self; on = ev(t, p, names, f, self, 1, written, self); if (!member && written === self) receiver = on;
      // (a name written bare in a method's body that is a member of what the method runs on, `gcd(other)` in `lcm`: read on
      // that, as `this.gcd(other)` is)
      if (!member && on && w(on + N_IS) === IS_NODE && w(p) === K_RULE && worded(w(p + 4), w(p + 8))) { const th = held_this(names); if (th && th !== w(GLOBAL) && th !== on && w(th + N_IS) !== IS_FRAME && on_this(t, th, w(p + 4), w(p + 8), w(p + 12))) receiver = th; }
    }
    set(t + T_DECL, declaring); set(t + T_LB, lb);
    if (stopped(t)) { set(t + T_DECL, decl_in); return 0; }
    // (in a left side, a closure and a name after it, `xs.for x`: not called here; the `=>` behind it makes the rest of the line
    // its argument, `xs.for(x => body)`)
    if (declaring && on && w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && in_left(rs, w(r + 20)) && worded(rs, w(r + 20)) && methods_of(on)) { set(t + T_DECL, decl_in); return node(IS_APPLIED, w(r + 4), rs, w(r + 20), 0); }
    // (nothing: what the kernel's nothing is (`None`, by the kernel's map), else the language)
    if (!on) on = w(NOTHING) || w(GLOBAL);
    // (one of Number's own operators the kernel's map names, read on what it counts, what it takes counted too: answered by the
    // kernel, as the language's rule answers)
    // (or read as the operator after the value, then what it takes on what that answers, `((12 + 12) ==)(24)`: the operator's
    // rule, read on the value again (kept))
    let nrule = w(p) === K_RULE ? w(p + 12) : 0, nself = self;
    if (w(NUMBER_OPS) && w(p) === K_ON && rs < w(r + 20) && receiver && receiver !== self) { const o = reading(t, w(p + 16), w(p + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(receiver), receiver, LED, 0, 0, 1); if (w(o) === K_RULE) { nrule = w(o + 12); nself = receiver; } }
    if (w(NUMBER_OPS) && nrule && rs < w(r + 20) && number_op(nrule) === 61 && nself && w(nself + N_IS) === IS_TEXT) { const y = block(t, rs, w(r + 20), names, f, written, 0, 1, 0, written, 0); if (stopped(t)) { set(t + T_DECL, decl_in); return 0; } if (y && w(y + N_IS) === IS_TEXT && w(TRUE_)) { const n = w(nself + N_B) - w(nself + N_A); set(t + T_ON, on); set(t + T_DECL, decl_in); return n === w(y + N_B) - w(y + N_A) && same(w(nself + N_A), w(y + N_A), n) ? w(TRUE_) : w(FALSE_); } }
    if (w(NUMBER_OPS) && nrule && rs < w(r + 20)) { const op = number_op(nrule); if (op && op !== 115) { const cx = count_of(t, nself, names, f); if (cx >= 0) { const y = block(t, rs, w(r + 20), names, f, written, 0, 1, 0, written, 0); if (stopped(t)) { set(t + T_DECL, decl_in); return 0; } const cy = count_of(t, y, names, f); if (cy >= 0) { const v = number_answer(op, cx, cy); if (v >= 0) { set(t + T_ON, on); set(t + T_DECL, decl_in); return v; } } } } }
    // (an argument after it, not an operator, a member or brackets: its own methods led by a hole first (a closure's
    // `{this}{argument}`: `f x`, `..9`, `.."9"`); then what is led by text (`(…)`, its `{this}(…)`); the language's own,
    // `{this}{rest}`, only when none of those reads)
    // (but a word that leads a rule of more than itself, `checked {type}`, `is {type}`: that rule, not an argument (a closure
    // called on `checked (T)`))
    const kw = w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && rs < w(r + 20) && b(w(CLASSES) + b(rs)) === 1 && methods_of(on) ? reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, LED, 0, 0, 1) : 0;
    let rest = kw && w(kw) === K_RULE && word_headed(w(kw + 12)) ? kw : 0;
    if (!rest) rest = w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && rs < w(r + 20) && b(w(CLASSES) + b(rs)) !== 2 && (bracket(rs, w(r + 20)) & 3) !== 1 && methods_of(on) ? reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, METHOD, w(on + N_BASE), 0, 1) : 0;
    if (!rest || w(rest) !== K_RULE) rest = reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, LED, 0, 0, 1);
    // (a rule never reads itself: what its own body reads on a value that reads as that rule (`as * => ((this as *), …)`),
    // read with the rules before it)
    // (and when several rules share that body (made by one rule, `as (=== T)` written twice), the one running reads the ones
    // before it)
    // (and on the very value it runs on, `this as *` in a conversion of a class another's conversion reached: the ones before it
    // too, wherever they are written)
    const itself = on === w(names + F_THIS) || on === w(names + F_RECEIVER);
    // (not in what it inlined, `{{body}}` (a closure's own code, its calls of itself: recursion))
    const running = w(rest) === K_RULE && w(names + F_RULE) && in_body(w(names + F_RULE), w(r + 16)) && !inlined_at(w(names + F_RULE), w(r + 16)) && ((itself && w(names + F_RULE) === w(rest + 12)) || ((itself || (w(w(rest + 12) + R_OWNER) === w(w(names + F_RULE) + R_OWNER) && w(rest + 12) !== w(names + F_RULE))) && alike(w(rest + 12), w(names + F_RULE)))) ? w(names + F_RULE) : 0;
    // (on another value it is the rule itself, called again: recursion, `pred!` in `!`)
    if (w(rest) === K_RULE && (running || (itself && in_body(w(rest + 12), w(r + 16)) && !inlined_at(w(rest + 12), w(r + 16)))) && w((running || w(rest + 12)) + R_PREV)) { const skipped = w(t + T_SKIP); set(t + T_SKIP, running || w(rest + 12)); const again = reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), w((running || w(rest + 12)) + R_PREV), on, LED, 0, 0, 1); set(t + T_SKIP, skipped); if (DEBUG && w(again) === K_UNREAD) debug(D_FAULT, 91, w(r + 16), w(r + 20)); if (w(again) !== K_UNREAD) rest = again; }
    let nm = names, wr = written, rs2 = w(r + 16), re2 = w(r + 20);
    // (what is read on it a hole's code, `{rest}`: that code, read on it where it was written)
    if (w(rest) === K_REF) {
      const tk = follow(take(w(rest + 20) || names, w(rest + 12), w(rest + 16)), 0);
      nm = w(tk + T_ORIGIN) || names; wr = w(tk + T_THIS) || written; rs2 = w(tk); re2 = w(tk + 4);
      rest = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, LED, 0, 0, 1);
    }
    // (what no rule led by text reads on it: a method led by a hole may, the language's own (`{this}{rest}`: through what it
    // converts to); not within one)
    let fell = 0;
    // (read only by what everything has (`1`, global), on a value with methods (a closure, `==` of `gcd(other) == 1`): its
    // argument; RB2) (but not what an operator leads, `.member`: a member is not an argument, CL19)
    if (w(rest) === K_RULE && w(w(rest + 12) + R_OWNER) === w(GLOBAL) && on !== w(GLOBAL) && b(w(CLASSES) + b(rs2)) !== 2 && !word_headed(w(rest + 12)) && methods_of(on)) { const m = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, METHOD, 0, 0, 1); if (w(m) === K_RULE) rest = m; }
    if (w(rest) === K_UNREAD && !w(t + T_FALLBACK)) { rest = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, METHOD, 0, 0, 1); fell = w(rest) === K_RULE ? 1 : 0; }
    if (w(rest) !== K_UNREAD) {
      // (a method of a value it is made of, `+` of the 3 in a vertex `3 + Ray`: what it runs on, that value)
      const via = w(rest) === K_RULE ? w(rest + 24) : 0; if (via) { on = via; receiver = via; }
      const fb = w(t + T_FALLBACK); if (fell) set(t + T_FALLBACK, 1);
      const v: number = ev(t, rest, nm, f, on, value, wr, receiver);
      set(t + T_FALLBACK, fb); set(t + T_ON, on); set(t + T_DECL, decl_in);
      return v;
    }
    // (a member that is not there, of a value: None (§5, a missing member reads as None))
    if (on !== w(GLOBAL) && (w(on + N_IS) === IS_NODE || w(on + N_IS) === IS_TEXT) && worded(skip(rs2, re2), trim_end(rs2, re2)) && !w(t + T_DECL) && b(skip(rs2, re2) - 1) === 46) { set(t + T_ON, on); set(t + T_DECL, decl_in); return w(NOTHING); }
    // (an operator written against what follows it, `-other` in a method (`-` bare, a member of `this`): read right-to-left,
    // that value's own operator, `(other).-`)
    // (through a hole's code, `{this}{rest}`: the operator written before where it was taken)
    if (value && !w(t + T_DECL) && b(w(CLASSES) + b(rs2)) === 1) { let a = rs2; while (a > 0 && b(w(CLASSES) + b(a - 1)) === 2 && b(a - 1) !== 46) a--; if (a < rs2 && (a === 0 || b(a - 1) <= 32 || b(a - 1) === 40 || b(a - 1) === 44)) { const v = prefixed(t, a, rs2, trim_end(rs2, re2), nm, wr || self); if (v) { set(t + T_ON, on); set(t + T_DECL, decl_in); return v; } } }
    // (said where what is read was written: a hole's code (`{rest}` of the language's own), where it was taken)
    if (DEBUG) debug(D_FAULT, 1111, w(r + 4), re2);
    say(t, rs2, L_NOT_ON, rs2, re2);
    set(t + T_ON, on); set(t + T_DECL, decl_in);
    return 0;
  }
  // Code read (in `self`; in brackets, what is inside them): each statement, the last one's value.
  function block(t: number, s: number, e: number, names: number, f: number, self: number, vis: number, value: number, brackets: number, written: number, lex: number): number {
    if (brackets) { code(t, s, e); s = w(t + T_A); e = w(t + T_B); }
    // (read in what it reads, too deep: a hole whose code is read as itself)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (!w(t + T_FAULT)) { if (DEBUG) debug(D_FAULT, L_DEEP, s, e); deep(t, depth); } set(t + T_FAULT, L_DEEP); return 0; }
    if (w(t + T_STACK)) { set(w(t + T_STACK) + 8 * depth, 0); set(w(t + T_STACK) + 8 * depth + 4, s); }
    set(t + T_DEPTH, depth + 1);
    // (code read in a value it was not written in, `x.( … )`: where it was written, for what x does not read; its own only)
    // (and its arguments, read in x too: where it was written, for what x does not read (`2.(1 + y)`, y the caller's))
    const writer = w(t + T_WRITER) && (w(t + T_WRITER_SELF) === self) ? w(t + T_WRITER) : 0;
    if (DEBUG) debug(D_BLOCK, s, e, self);
    let answer = 0;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), last = skip(ln, e) >= e ? 1 : 0;
      // (a typed hole's code: read by its type's own rules; what none of them reads (a value of it, by its name), where it was written)
      let r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), vis ? latest(vis) : latest(self), self, 0, vis ? w(vis + N_BASE) : 0, 0, 0);
      // (what reads it where it is written binding looser than the type's own (declared after it, `,`): that first, its parts
      // then read by the type; not a reader, a head of one hole (`{numeral: Digits}`: it would read itself))
      if (vis && w(r) === K_RULE) { const r2 = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0); if (w(r2) === K_RULE && w(r2 + 12) !== w(r + 12) && !(w(w(r2 + 12) + R_FLAGS) & READER) && declared_at(w(r2 + 12)) > declared_at(w(r + 12))) r = r2; }
      if (vis && w(r) === K_UNREAD) r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
      // (code read in a value it was not written in, `x.( … )`: what x does not read, read where it was written)
      if (w(r) === K_UNREAD && writer && writer !== self) r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(writer), writer, 0, 0, 0, 0);
      // (a member that is not there, read as one, `x.missing`: nothing (§5))
      if (w(r) === K_UNREAD && w(t + T_MEMBER) && at >= w(t + T_MEMBER_S) && at < w(t + T_MEMBER_E) && worded(at, ln) && !w(t + T_DECL) && self !== w(GLOBAL)) { answer = w(NOTHING); at = ln; continue; }
      // (a rule never reads itself: code written in a rule's own body that reads as that rule (`String => this as String`,
      // its `String`), read with the rules before it)
      // (only while that rule is what is read: a closure it made, called later, reads it again (recursion))
      // (and only on the value it runs on: read in another one, `inner.f` in `f`, it is that one's, called again (recursion))
      if (w(r) === K_RULE && in_body(w(r + 12), at) && w(w(r + 12) + R_PREV) && w(names + F_RULE) === w(r + 12) && !another(names, self)) { const again = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), w(w(r + 12) + R_PREV), self, 0, 0, 0, 0); if (w(again) !== K_UNREAD) r = again; }
      const grew0 = DEBUG ? w(t + T_GREW) : 0;
      answer = ev(t, r, names, f, self, value & last, written, self);
      if (DEBUG && w(t + T_GREW) - grew0 > 8 << 20) debug(D_FAULT, 1096, at, (w(t + T_GREW) - grew0) >> 20);
      if (stopped(t)) { set(t + T_DEPTH, depth); if (DEBUG) debug(D_BLOCK_END, s, e, 0); return 0; }
      at = ln;
    }
    set(t + T_DEPTH, depth);
    if (DEBUG) debug(D_BLOCK_END, s, e, answer);
    return answer;
  }

  // (accelerated, `taking` in the kernel's map: one parameter, a name, given one value, not by name: that name defined where
  // the call runs, its body the call's `passed` (what `({written_parameters}) := passed` defines); anything else, the body)
  function spans(rule: number) {
    const at = w(MAPPED) + 8 * M_SPAN, bs = w(rule + R_BS), be = w(rule + R_BE), word = w(rule + R_PART + PART * (w(rule + R_PARTS) - 1) + 4);
    // (the last hole's name in its body, written last: what the parameters are given)
    let he = word; while (b(w(CLASSES) + b(he)) === 1) he++;
    const hs = word, n = he - hs;
    for (let i = be - n; i >= bs; i--) if (same(i, hs, n) && (i === bs || b(w(CLASSES) + b(i - 1)) !== 1) && (i + n >= be || b(w(CLASSES) + b(i + n)) !== 1)) { set(at, i); set(at + 4, i + n); return; }
  }
  function took(t: number, f: number, self: number): number {
    const at = w(MAPPED) + 8 * M_SPAN, ps = w(at), pe = w(at + 4);
    if (!ps) return 0;
    const pt = f + F_TAKES, s = skip(w(pt), w(pt + 4)); let e = w(pt + 4); while (e > s && b(e - 1) <= 32) e--;
    if (!worded(s, e) || follow(pt, 1) !== pt) return 0;
    // (one value, not given by name: no `,` or `:` outside brackets in what was passed)
    const at_ = follow(f + F_TAKES + TAKE, 1), z = w(at_ + 4);
    let i = w(at_);
    while (i < z) { if (bracket(i, z) & 1) i = past(i, z); else { if (b(i) === 44 || b(i) === 58) return 0; i++; } }
    const v = valued(t, f + F_TAKES + TAKE);
    if (stopped(t)) return 0;
    if (!v || w(v + N_IS) === IS_PLACE) return 0;
    // (where the language's `({written_parameters}) := passed` defines it: the parameter read as a left side, as it does,
    // the place that answers; one that is no place, the language's body)
    const src = follow(pt, 1), declaring = w(t + T_DECL), pushed = push_left(w(src), w(src + 4));
    const defin = w(t + T_DEFIN); set(t + T_DECL, 1); set(t + T_DEFIN, self); const pv = valued(t, pt); set(t + T_DECL, declaring); set(t + T_LE, pushed); set(t + T_DEFIN, defin);
    if (stopped(t) || !pv || w(pv + N_IS) !== IS_PLACE || !place_in(pv)) return 0;
    const into = place_in(pv);
    const r = rule_(t, into, s, e, ps, pe, f, f);
    if (w(FAIL_FAST) & 2) log(s, L_DEFINED, s, e); set(t + T_NAMED, w(t + T_NAMED) + 1);
    if (DEBUG) debug(D_DEFINE, s, e, into);
    return w(r + R_HEAD);
  }
  // (a rule composing what its holes take: two or more, the text between them characters each on its own (`,`), no operator
  // and no bracket or quote)
  function composes(rule: number): number {
    if (w(rule + R_HOLES) < 2) return 0;
    let lit = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== LITERAL) continue;
      for (let i = 0; i < w(q + 8); i++) { const c = b(w(q + 4) + i); if (c <= 32) continue; if (b(w(CLASSES) + c) !== 3 || c === 40 || c === 41 || c === 91 || c === 93 || c === 123 || c === 125 || c === 34 || c === 39 || c === 96) return 0; lit = 1; }
    }
    return lit;
  }
  // (when a rule was declared, the order rules bind in: what was linked after binds looser)
  function declared_at(rule: number): number { return w(rule + R_STAMP); }
  // A rule applied: a frame for what its holes took (written with `names`, run from `f`, in `self`).
  function apply(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const kind = w(rule + R_KIND), lex = w(t + T_LEXV);
    set(t + T_LEXV, 0);
    if (kind === VALUE) return w(rule + R_BS);
    if (kind === EXTERNAL) {
      const a = skip(w(caps), w(caps + 4));
      let z = w(caps + 4); while (z > a && b(z - 1) <= 32) z--;
      let m = a; while (m < z && b(m) > 32) m++;
      const rest = skip(m, z);
      // (`external . v`: v one of the components of what it is read in (made of it too, the last added seen first, then what
      // it was made of before))
      if (word(a, m, W_DOT) && rest < z) {
        const th = self, v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (DEBUG && v && th && w(THREAD + T_REG_AT) && in_region(v) && !in_region(th)) debug(D_FAULT, 96, rest, z);
        // (never made of what is made of it: a cycle what it sees would go round without end; said with --debug)
        if (v && th && v !== th && made_of_deep(v, th, 0)) { if (DEBUG) debug(D_FAULT, 87, th, v); return th; }
        // (nor is what everything is in, the language itself, made of anything: what it sees would come back to it)
        if (v && th === w(GLOBAL)) { if (DEBUG) debug(D_FAULT, 87 + 1001, rest, z); say(t, rest, L_VALUED, rest, z); return th; }
        if (v && th && v !== th) { set(th + N_ALSO, w(th + N_ALSO) ? node(IS_NODE, 0, 0, w(th + N_ALSO), v) : v); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1); }
        // (what it answers: the component (the language keeps what a node was made of with it)
        return v || th;
      }
      // (a node of its own, in what it is read in, made of what it is read on: called bare in a method's own node (`gcd(other)`
      // in `lcm`), what that method is read on)
      if (word(a, m, W_DOT)) { const th = w(names + F_THIS), rc = w(names + F_RECEIVER), n = node(IS_NODE, 0, names, th, rc !== th ? (run_node(rc) ? w(rc + N_ALSO) : rc) : 0); if (DEBUG && w(THREAD + T_REG_AT) && !in_region(names)) debug(D_FAULT, 96, a, z); set(names + F_THIS, n); if (rc === th) set(names + F_RECEIVER, n); return n; }
      if (word(a, m, W_AMP)) return names;
      // (`external members`: what the node it is read in holds are its members, a class's or a value's: a bare name never
      // reads them, `.name` does (§21.3))
      // (`external static code`: what the code defines where it is read is static, the class's own: a bare name reads it)
      if (word(a, m, W_STATIC) && rest < z) { const before = latest(self), v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); for (let r = latest(self), k = 0; r && r !== before && !(w(r + R_FLAGS) & DEAD) && k < 4096; r = w(r), k++) set(r + R_FLAGS, w(r + R_FLAGS) | STATIC); return v; }
      // (`external undefined v`: whether v is a name nothing defines (a place, its name still read as it); said where it is
      // written, `nothing reads`)
      if (word(a, m, W_UNDEFINED) && rest < z) { const v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!v || w(v + N_IS) !== IS_PLACE || !place_in(v) || w(v + N_A) >= w(v + N_B)) return w(FALSE_); const scope = place_in(v), r = reading(t, w(v + N_A), w(v + N_B), 0, 0, latest(scope), scope, 0, 0, 0, 0); if (w(r) === K_RULE && !(w(w(r + 12) + R_KIND) === VALUE && w(w(r + 12) + R_BS) === v)) return w(FALSE_); say(t, w(v + N_A), L_UNREAD, w(v + N_A), w(v + N_B)); return w(TRUE_); }
      // (`external unset v`: whether v is a name given no value yet, a place)
      // (`external unset v t`: v a name given no value yet, a place: given t, where it is named)
      if (word(a, m, W_UNSET) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; const v = block(t, rest, q, names, f, self, 0, 1, 0, self, 0); if (!v || w(v + N_IS) !== IS_PLACE || q >= z) return v && w(v + N_IS) === IS_PLACE ? w(TRUE_) : w(FALSE_); const given = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0); if (given && w(v + N_A) < w(v + N_B)) bound(w(v + N_A), w(v + N_B), place_in(v) || self, given); return given; }
      // (`external operated v`: whether the text v is only an operator's characters, `+`, `..<`)
      // (`external named x`: the name a hole's code is written as (`a`, `a: T`, `a = v`), its place's; else nothing)
      if (word(a, m, W_NAMED) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; return hole_name(names, rest, q) || w(NOTHING); }
      // (`external names L a b`: the list L, its first link given the name hole a is written as, its last the one of b (`_`,
      // neither); `external named_like L at`: L's last link given the name the link at has)
      if ((word(a, m, W_NAMES) || word(a, m, W_NAMED_LIKE)) && rest < z) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const list = block(t, rest, q, names, f, self, 0, 1, 0, self, 0); if (!list || stopped(t)) return list;
        let q2 = skip(q, z), e2 = q2; while (e2 < z && b(e2) > 32) e2++;
        const wn = w(w(WORDS) + 8 * W_WRITTEN_NAME), wz = wn + w(w(WORDS) + 8 * W_WRITTEN_NAME + 4);
        if (word(a, m, W_NAMED_LIKE)) { const from = block(t, q2, e2, names, f, self, 0, 1, 0, self, 0), was = from && w(from + N_IS) === IS_NODE ? held(t, from, W_WRITTEN_NAME, 0) : 0; if (was && was !== w(NOTHING)) { const lk = held(t, list, W_TAIL, 0); if (lk && lk !== w(NOTHING)) bound(wn, wz, lk, was); } return list; }
        let q3 = skip(e2, z), e3 = q3; while (e3 < z && b(e3) > 32) e3++;
        const first = hole_name(names, q2, e2), last_ = hole_name(names, q3, e3);
        if (first) { const l1 = held(t, list, W_HEAD, 0); if (l1 && l1 !== w(NOTHING)) bound(wn, wz, l1, first); }
        if (last_) { const l2 = held(t, list, W_TAIL, 0); if (l2 && l2 !== w(NOTHING)) bound(wn, wz, l2, last_); }
        return list;
      }
      // (`external admits v t`: whether v is a t, where the kernel can tell (as `is` answers it); not known, nothing)
      if (word(a, m, W_ADMITS) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; const v = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), ty = q < z ? block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0) : 0; const k = ty ? admits(t, v, ty, 0) : -1; return k === 1 ? w(TRUE_) : k === 0 ? w(FALSE_) : w(NOTHING); }
      if (word(a, m, W_OPERATED) && rest < z) { const v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); return v && w(v + N_IS) === IS_TEXT && operated(w(v + N_A), w(v + N_B)) ? w(TRUE_) : w(FALSE_); }
      // (`external member x name`: what x answers under the name a text holds (x's own, else what it is made of); none,
      // nothing. `external member x name value`: x given that value under that name, the value)
      if (word(a, m, W_MEMBER) && rest < z) {
        let mq = rest; while (mq < z && b(mq) > 32) mq++;
        let mr = skip(mq, z); while (mr < z && b(mr) > 32) mr++;
        const mx = block(t, rest, mq, names, f, self, 0, 1, 0, self, 0), mk = mq < z ? block(t, skip(mq, z), mr, names, f, self, 0, 1, 0, self, 0) : 0;
        if (!mx || !mk || w(mk + N_IS) !== IS_TEXT || w(mk + N_A) >= w(mk + N_B)) return w(NOTHING);
        if (skip(mr, z) < z) {
          const mv = block(t, skip(mr, z), z, names, f, self, 0, 1, 0, self, 0);
          if (w(mx + N_IS) !== IS_NODE) return w(NOTHING);
          bound(w(mk + N_A), w(mk + N_B), mx, mv);
          return mv;
        }
        // (the rule x sees by that name (its own, then what it is made of): not one of the language's own, applied on x)
        return member_seen(t, mx, w(mk + N_A), w(mk + N_B) - w(mk + N_A), mx, 0) || w(NOTHING);
      }
      // (`external output x`: the text x, written out as it is (where the host writes: its standard output); a list of texts,
      // each in turn)
      if (word(a, m, W_OUTPUT) && rest < z) {
        const ov = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (ov && w(ov + N_IS) === IS_TEXT) told(w(ov + N_A), L_OUTPUT, w(ov + N_A), w(ov + N_B));
        else if (ov && w(ov + N_IS) === IS_NODE) for (let ol = held(t, ov, W_HEAD, 0), ok = 0; ol && ol !== w(NOTHING) && ok < 1 << 16; ol = held(t, ol, W_NEXT, 0), ok++) { const oe = held(t, ol, W_VALUE, 0); if (oe && w(oe + N_IS) === IS_TEXT) told(w(oe + N_A), L_OUTPUT, w(oe + N_A), w(oe + N_B)); }
        return ov || w(NOTHING);
      }
      // (`external quoted x`: whether the text x holds a text written in it (a `"` or a backtick))
      if (word(a, m, W_QUOTED) && rest < z) { const qv = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!qv || w(qv + N_IS) !== IS_TEXT) return w(FALSE_); for (let qp = w(qv + N_A); qp < w(qv + N_B); qp++) if (b(qp) === 34 || b(qp) === 96) return w(TRUE_); return w(FALSE_); }
      // (`external arguments`: what the program was called with, one text, each argument ended by `\0` (as the OS holds them))
      if (word(a, m, W_ARGUMENTS)) { const av = w(MAPPED) + 8 * ARGV_SLOT; return node(IS_TEXT, w(av), w(av) + w(av + 4), w(TEXTS) || w(GLOBAL), 0); }
      if (word(a, m, W_MEMBERS)) { const n = names && w(names + N_IS) === IS_FRAME ? w(names + F_THIS) : self; if (n && n !== w(GLOBAL)) set(w(n + N_BASE) + R_KIND, MEMBERS_MARK); return n; }
      if (word(a, m, W_GOTO)) { go(t, rest, z - rest, f, 0); return 0; }
      if (word(a, m, W_INCLUDE) || word(a, m, W_READ)) { files(word(a, m, W_INCLUDE) ? 1 : 2, rest, z, names); return 0; }
      // (the kernel's own map: `text`, what it is read in is what every text the kernel holds is made of)
      if (mapped(a, m, M_TEXT)) { set(TEXTS, w(f + F_THIS)); return 0; }
      // (`given `{given} given {value}``: that rule, what it was given a head (one name defined): that head, what its own body
      // answers (an acceleration: the same with it and without))
      if (mapped(a, m, M_GIVEN) || mapped(a, m, M_TAKING) || mapped(a, m, M_GLYPHS) || mapped(a, m, M_SUPERPOSING) || mapped(a, m, M_CUTS)) { const flag = mapped(a, m, M_GIVEN) ? GIVES : mapped(a, m, M_GLYPHS) ? GLYPHS : mapped(a, m, M_SUPERPOSING) ? SUPERPOSING : mapped(a, m, M_CUTS) ? CUTS : TAKES; let q = rest, y = z; if (b(q) === 96 && b(y - 1) === 96 && y - q > 1) { q++; y--; } if (flag === SUPERPOSING) { const at_ = w(SUPERPOSING_AT) ? SUPERPOSING_AT + 8 : SUPERPOSING_AT; set(at_, q); set(at_ + 4, y - q); } for (let o = latest(w(GLOBAL)), k = 0; o && k < 1 << 20; o = w(o), k++) { const hd = w(o + R_HEAD); if (w(o + R_KIND) === RULE && hd && w(hd + N_B) - w(hd + N_A) === y - q && same(q, w(hd + N_A), y - q)) { set(o + R_FLAGS, w(o + R_FLAGS) | flag); if (flag === TAKES) spans(o); break; } } return 0; }
      // (`count`: what it is read in, Number, is what every count the kernel holds is made of; `truth t f`: what it answers as true
      // and as false)
      if (mapped(a, m, M_COUNT)) { set(COUNTED, w(f + F_THIS)); return 0; }
      // (`character`: what it is read in, Char, is what a text's characters are: a count, its code point)
      if (mapped(a, m, M_CHARACTER)) { set(CHARS, w(f + F_THIS)); return 0; }
      // (`superposed`, read in Node: its rule `superposed`, answered by the kernel: made by `|` or `&` (a node of its own with
      // `superposes`, `conjoins` or `conjoined`, short of Node's), as that rule answers, without a call)
      if (mapped(a, m, M_SUPERPOSED)) { set(SUPER_NODE, w(f + F_THIS)); return 0; }
      if (mapped(a, m, M_TRUTH)) { let q = rest; while (q < z && b(q) > 32) q++; set(TRUE_, block(t, rest, q, names, f, self, 0, 1, 0, self, 0)); set(FALSE_, block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0)); return 0; }
      // (`numeral `{head}``: that rule, a numeral: the count its hole's digits (in ten) write, the same as its body answers)
      if (mapped(a, m, M_NUMERAL)) { let q = rest, y = z; if (b(q) === 96 && b(y - 1) === 96 && y - q > 1) { q++; y--; } for (let o = latest(w(GLOBAL)), k = 0; o && k < 1 << 20; o = w(o), k++) { const hd = w(o + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === y - q && same(q, w(hd + N_A), y - q)) set(o + R_FLAGS, w(o + R_FLAGS) | NUMERAL); } set(NUMERAL_AT, q); set(NUMERAL_AT + 4, y - q); return 0; }
      // (`number op a b`: of two counts (or Numbers written one after another down to zero), what op answers, as the language's
      // rules do; of anything else, nothing (the language's rule then))
      if (mapped(a, m, M_NUMBER)) { let o = rest; while (o < z && b(o) > 32) o++; if (o - rest === 4 && same(rest, w(w(WORDS) + 8 * W_NEXT), 4)) { const x = block(t, skip(o, z), z, names, f, self, 0, 1, 0, self, 0), c = stopped(t) ? -1 : count_of(t, x, names, f); return c > 0 ? counted(c - 1) : w(NOTHING); } set(NUMBERS, w(f + F_THIS)); set(NUMBER_OPS, rest); set(NUMBER_OPS + 4, z - rest); return 0; }
      // (`nothing v`: v is what the kernel's nothing is, read on)
      if (mapped(a, m, M_NOTHING)) { set(NOTHING, rest < z ? block(t, rest, z, names, f, self, 0, 1, 0, self, 0) : w(f + F_THIS)); return 0; }
      // (`same a b`: two texts of the same characters (bytes): the first; else nothing (a text's characters are what the
      // kernel holds; the language compares them structurally from here))
      // (`until a b`: of a text, what is before where b (a rest of it) begins; else nothing)
      if (mapped(a, m, M_UNTIL)) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        if (!x || !y || w(x + N_IS) !== IS_TEXT || w(y + N_IS) !== IS_TEXT || w(y + N_A) < w(x + N_A) || w(y + N_A) > w(x + N_B)) return w(NOTHING);
        return node(IS_TEXT, w(x + N_A), w(y + N_A), w(TEXTS) || w(GLOBAL), 0);
      }
      // (`unescaped x`: of a text, each escape in it what it stands for, as String.ray's `Escape` answers (`\0`, `\n`, …, and
      // `\x41`, `\u263A`, `\u{263A}` by code point, written as UTF-8); none in it, the text itself)
      if (mapped(a, m, M_UNESCAPED)) {
        const u_x = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (!u_x || w(u_x + N_IS) !== IS_TEXT) return u_x || w(NOTHING);
        const u_xs = w(u_x + N_A), u_xe = w(u_x + N_B);
        let u_p = u_xs; while (u_p < u_xe && b(u_p) !== 92) u_p++;
        if (u_p === u_xe) return u_x;
        const u_out = alloc(4 * (u_xe - u_xs) + 4); let u_o = u_out;
        for (u_p = u_xs; u_p < u_xe; u_p++) {
          const u_c = b(u_p);
          if (u_c !== 92 || u_p + 1 >= u_xe) { setb(u_o++, u_c); continue; }
          const u_e = b(u_p + 1), u_simple = escape_of(u_e);
          if (u_simple >= 0) { setb(u_o++, u_simple); u_p++; continue; }
          if (u_e === 120 || u_e === 117 || u_e === 85) {
            let u_q = u_p + 2, u_cp = 0, u_k = 0; const u_braced = u_e !== 120 && b(u_q) === 123, u_width = u_braced ? 6 : u_e === 120 ? 2 : u_e === 117 ? 4 : 6;
            if (u_braced) u_q++;
            while (u_q < u_xe && u_k < u_width && hex_digit(b(u_q)) >= 0) { u_cp = u_cp * 16 + hex_digit(b(u_q)); u_q++; u_k++; }
            if (u_braced ? (u_k > 0 && b(u_q) === 125) : u_k === u_width) {
              if (u_braced) u_q++;
              if (u_cp < 128) setb(u_o++, u_cp);
              else if (u_cp < 2048) { setb(u_o++, 192 | u_cp >> 6); setb(u_o++, 128 | u_cp & 63); }
              else if (u_cp < 65536) { setb(u_o++, 224 | u_cp >> 12); setb(u_o++, 128 | u_cp >> 6 & 63); setb(u_o++, 128 | u_cp & 63); }
              else { setb(u_o++, 240 | u_cp >> 18); setb(u_o++, 128 | u_cp >> 12 & 63); setb(u_o++, 128 | u_cp >> 6 & 63); setb(u_o++, 128 | u_cp & 63); }
              u_p = u_q - 1; continue;
            }
          }
          setb(u_o++, u_c);
        }
        return node(IS_TEXT, u_out, u_o, w(TEXTS) || w(GLOBAL), 0);
      }
      // (`past a b`: of a text beginning with another, what follows that beginning; else nothing)
      if (mapped(a, m, M_PAST)) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        if (!x || !y || w(x + N_IS) !== IS_TEXT || w(y + N_IS) !== IS_TEXT) return w(NOTHING);
        const n = w(y + N_B) - w(y + N_A);
        if (w(x + N_B) - w(x + N_A) < n || !same(w(x + N_A), w(y + N_A), n)) return w(NOTHING);
        return node(IS_TEXT, w(x + N_A) + n, w(x + N_B), w(TEXTS) || w(GLOBAL), 0);
      }
      // (`dotted x`: of a text, whether a `.` is in it on its own (not after a name or what closes, nor before a name, `.`
      // or `{`; not in quotes): the language's `bare_dot`, answered by the kernel)
      if (mapped(a, m, M_DOTTED)) {
        const x = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (!x || w(x + N_IS) !== IS_TEXT) return w(FALSE_);
        const xs = w(x + N_A), xe = w(x + N_B), cl = w(CLASSES);
        let quote = 0;
        for (let p = xs; p < xe; p++) {
          const c = b(p);
          if (quote) { if (c === quote) quote = 0; continue; }
          if (c === 34 || c === 96) { quote = c; continue; }
          if (c !== 46) continue;
          const pc = p > xs ? b(p - 1) : 32, nc = p + 1 < xe ? b(p + 1) : 32;
          const after = p > xs && (b(cl + pc) === 1 || pc === 41 || pc === 93 || pc === 34 || pc === 96 || pc === 46);
          const before = p + 1 < xe && (b(cl + nc) === 1 || nc === 46 || nc === 123);
          if (!after && !before) return w(TRUE_);
        }
        return w(FALSE_);
      }
      if (mapped(a, m, M_SAME)) {
        // (the two written after it, each read where it is written: `external same this other`)
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        // (a place, a name being declared, is the name it is: `(part).name.same_characters(place)` in destructuring)
        const xi = x ? w(x + N_IS) : -1, yi = y ? w(y + N_IS) : -1;
        if ((xi !== IS_TEXT && xi !== IS_PLACE && xi !== IS_HEAD) || (yi !== IS_TEXT && yi !== IS_PLACE && yi !== IS_HEAD)) return w(NOTHING);
        const n = w(x + N_B) - w(x + N_A);
        return n === w(y + N_B) - w(y + N_A) && same(w(x + N_A), w(y + N_A), n) ? x : w(NOTHING);
      }
      // (`first`, `rest` of a text: its first character (as UTF-8 writes it), the text after it; of no text, nothing)
      if (mapped(a, m, M_FIRST) || mapped(a, m, M_REST)) {
        const th = w(names + F_THIS), rc = w(names + F_RECEIVER), x = rc && w(rc + N_IS) === IS_TEXT ? rc : th;
        if (!x || w(x + N_IS) !== IS_TEXT) return 0;
        // (of a text of no characters: none)
        if (w(x + N_A) >= w(x + N_B)) return w(NOTHING);
        const xa = w(x + N_A), xb = w(x + N_B), c = b(xa), n = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cut = xa + n < xb ? xa + n : xb;
        if (mapped(a, m, M_FIRST) && w(CHARS)) { let cp = c < 0x80 ? c : c < 0xE0 ? c & 31 : c < 0xF0 ? c & 15 : c & 7; for (let i = 1; i < n && xa + i < xb; i++) cp = cp << 6 | (b(xa + i) & 63); return node(IS_NODE, cp + 1, 0, w(CHARS), 0); }
        return mapped(a, m, M_FIRST) ? node(IS_TEXT, xa, cut, w(TEXTS) || w(GLOBAL), 0) : node(IS_TEXT, cut, xb, w(TEXTS) || w(GLOBAL), 0);
      }
      if (!word(a, m, W_LABEL)) say(t, s, L_EXTERNAL, a, m);
      return 0;
    }
    if (DEBUG) count(K_APPLY);
    // (applied in a check, read quietly: of an allowance of its own, ten times as much (what a check costs depends on what was
    // checked once already, kept: what a test may apply does not))
    const quietly = w(THREAD + T_QUIET) >= TYPINGS, budget = quietly ? w(t + T_QBUDGET) - 1 : w(t + T_BUDGET) - 1;
    set(t + (quietly ? T_QBUDGET : T_BUDGET), budget); set(THREAD + T_RAN, 1);
    if (budget < 0) { if (DEBUG && !w(t + T_FAULT)) debug(D_FAULT, L_BUDGET, s, e); set(t + T_FAULT, L_BUDGET); return 0; }
    // (out of memory: nothing more is made)
    if (w(OOM)) return 0;
    set(t + T_LEXV, lex);
    const applied = frame(rule, f, self, s, e, caps, names, written, on);
    set(t + T_LEXV, 0);
    // (a left side being read, a rule composing parts of it (its head holes apart by a character on its own, `{a}, {b}`): each
    // part read as a left side first, a word a name declared here, whatever its body then reads them as (`,`'s `list ===
    // declared`, a visible `type` not its value: GN3); a rule of an operator (`{x}: {type}`, `{x} ^{style}`) reads its own)
    if (w(t + T_DECL) && lefts() && in_left(s, e) && kind !== DEFINE && !(w(rule + R_FLAGS) & METHOD) && composes(rule)) for (let i = 0; i < w(rule + R_HOLES); i++) {
      const tk = applied + F_TAKES + TAKE * i, a = skip(w(tk), w(tk + 4)); let z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
      if (a >= z || !in_left(a, z)) continue;
      if (worded(a, z)) { const into = w(names + F_RECEIVER) === w(names + F_THIS) && run_node(self) && dotted(rule) ? w(self + N_ALSO) : self; set(tk + T_VALUE, placed(t, a, z, into)); astore(tk + T_STATE, 3); }
      else { valued(t, tk); if (stopped(t)) return 0; }
    }
    // (a name with a type, `{x}: {type}` read in a left side (`(count: Number)`, `named: "p"`): the name declared here, as
    // a word of a composed left side is, not a visible one's place (a list's `count`); its type a value)
    if (w(t + T_DECL) && lefts() && in_left(s, e) && kind !== DEFINE && !(w(rule + R_FLAGS) & METHOD) && w(rule + R_PARTS) >= 2 && (w(rule + R_PART) & 15) === HOLE && w(rule + R_PART + PART) === LITERAL && b(w(rule + R_PART + PART + 4)) === 58) {
      const tk = applied + F_TAKES, a = skip(w(tk), w(tk + 4)); let z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
      if (a < z && in_left(a, z) && worded(a, z) && !aload(tk + T_STATE)) { set(tk + T_VALUE, placed(t, a, z, self)); astore(tk + T_STATE, 3); }
    }
    if ((w(rule + R_FLAGS) & TAKES) && !w(t + T_DECL)) { const d = took(t, applied, self); if (d) return d; }
    if ((w(rule + R_FLAGS) & REFUSES) && w(t + T_ALT) === rule) { set(t + T_ALT, 0); if (DEBUG) debug(D_FAULT, 1093, 10, 1); if (refused(t, rule, applied, written)) { if (DEBUG) debug(D_FAULT, 1093, 11, 1); set(t + T_ALT, 1); return 0; } }
    if ((w(rule + R_FLAGS) & SUPERPOSING) && w(t + T_ALT) === rule) { set(t + T_ALT, 0); const d = superposing(t, rule, applied); if (d !== -1) return d; }
    if (w(rule + R_FLAGS) & GIVES) { const g = valued(t, applied + F_TAKES); if (stopped(t)) return 0; if (g && w(g + N_IS) === IS_HEAD) return g; }
    // (the map's `cuts`: of a list of types and a text, the kernel's cut where it can tell; else the language's loop)
    if ((w(rule + R_FLAGS) & CUTS) && !w(t + T_DECL) && w(rule + R_HOLES) === 2) { const l = valued(t, applied + F_TAKES), x = valued(t, applied + F_TAKES + TAKE); if (stopped(t)) return 0; const c = cut_of(t, l, x); if (c) return c; }
    // (a numeral the map names whose head was made again, its type read later: named by its head as written)
    if (w(NUMERAL_AT) && !(w(rule + R_FLAGS) & NUMERAL)) { const hd = w(rule + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === w(NUMERAL_AT + 4) && same(w(hd + N_A), w(NUMERAL_AT), w(NUMERAL_AT + 4))) set(rule + R_FLAGS, w(rule + R_FLAGS) | NUMERAL); }
    if (w(SUPER_NODE) && w(rule + R_OWNER) === w(SUPER_NODE) && !w(rule + R_HOLES)) { const hd = w(rule + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === 10 && same(w(hd + N_A), w(w(MAPPED) + 8 * M_SUPERPOSED), 10)) return superposed_node(self, 0) ? w(TRUE_) : w(FALSE_); }
    if ((w(rule + R_FLAGS) & NUMERAL) && w(COUNTED)) { const c = numeral_of(w(caps), w(caps + 4)); if (c >= 0) return counted(c); }
    // (Number's `succ`, on a count: the one after it)
    if (w(NUMBER_OPS) && w(rule + R_OWNER) === w(NUMBERS) && number_op(rule) === 115) { const c = count_of(t, self, names, f); if (c >= 0 && c < 0x7FFFFFFE) return counted(c + 1); }
    if (kind === DEFINE) { if (DEBUG) debug(D_APPLY, s, e, rule); const d = define(t, applied); if (DEBUG) debug(D_APPLY_END, s, e, rule); return d; }
    // (applied in what it applies, too deep: what it reads reads itself; which rules, again and again, kept to be said)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (!w(t + T_FAULT)) { if (DEBUG) debug(D_FAULT, L_DEEP, s, e); deep(t, depth); } set(t + T_FAULT, L_DEEP); return 0; }
    if (w(t + T_STACK)) { set(w(t + T_STACK) + 8 * depth, rule); set(w(t + T_STACK) + 8 * depth + 4, s); }
    set(t + T_DEPTH, depth + 1);
    // (a rule whose body is one statement, `({grouped}) => grouped`, a name given a value, `.{member} => {member}`: that
    // statement read in its frame as the body would, its body not run as one)
    if (!w(t + T_DECL) && kind === RULE && !w(rule + R_FN) && !(w(rule + R_FLAGS) & (GIVES | TAKES | OWNS | GLYPHS | NUMERAL | SUPERPOSING | REFUSES))) {
      const bd = body(t, rule), me = w(applied + F_THIS);
      const rd = w(bd) === 1 && w(bd + 4) === S_READ ? w(bd + 4 + 12) : 0;
      // (one of its holes, or one of what it was written in: what it took, whatever node is being made)
      if (rd && (w(rd) === K_NAME || !(latest(me) !== w(me + N_BASE) && making(me)))) {
        let answer = w(rd) === K_NAME ? valued(t, take(w(rd + 20) || applied, w(rd + 12), w(rd + 16))) : ev(t, rd, applied, applied, me, 1, me, me);
        if (w(t + T_FAULT) || w(OOM)) answer = 0;
        else if (w(t + T_JUMP_N)) { if (word(w(t + T_JUMP_S), w(t + T_JUMP_S) + w(t + T_JUMP_N), W_AFTERWARDS)) { set(t + T_JUMP_N, 0); defer(applied, 1); } answer = 0; }
        set(applied + N_B, 1);
        if (w(t + T_HOLE) && answer && w(answer + N_IS) === IS_HOLE) extend(t, answer, s, e);
        set(t + T_DEPTH, depth);
        return answer;
      }
    }
    if (DEBUG) debug(D_APPLY, s, e, rule);
    // (a method's body, a call's (`x.f(…)`), is no part of a left side it is read in: names in it are read, not declared)
    // (a rule's body is no part of a left side it is read in (what it composes, `,`, `( )`, is: its holes, by their text))
    // (a method's body, a call's, is no part of a left side it is read in)
    const bd_ = body(t, rule), decl = w(t + T_DECL);
    // (one composing what is written in the left side, its holes' code there (`a, b`, `x[k]`): its body a value, its holes the
    // left side's by their text)
    let composing = 0;
    if (decl && lefts() && !(w(bd_) === 1 && w(bd_ + 4 + 12) && w(w(bd_ + 4 + 12)) === K_REF) && w(rule + R_HOLES)) {
      composing = 1;
      for (let i = 0; i < w(rule + R_HOLES) && composing; i++) { const tk = follow(applied + F_TAKES + TAKE * i, 1); if (!in_left(w(tk), w(tk + 4))) composing = 0; }
    }
    // (nor is the body of a keyword's, `as {target}`, which computes what it answers: only one passing what follows it
    // through, a modifier (`static {statement}`), keeps it a left side)
    if (decl && ((w(rule + R_FLAGS) & METHOD) || composing || ((w(rule + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(rule + R_PART + 4))) === 1 && !passes(rule)))) set(t + T_DECL, 0);
    // (a body giving names values of its own, not a closure's (it makes its own node): a node of its own, in where the rule is
    // written, made of what it is read in (what it gives is this run's; `.x := …` is still a member of `.`))
    if ((w(rule + R_FLAGS) & OWNS) && !(w(rule + R_FLAGS) & METHOD) && self && self !== w(GLOBAL) && (w(self + N_IS) === IS_NODE || w(self + N_IS) === IS_TEXT)) { const rc = w(applied + F_RECEIVER), n = node(IS_NODE, 0, applied, w(rule + R_OWNER) || self, self); set(applied + F_THIS, n); set(applied + F_RECEIVER, rc && rc !== self ? rc : n); }
    const answer = ran(t, applied, rule, bd_, 0);
    if ((w(rule + R_FLAGS) & GLYPHS) && answer && !stopped(t)) glyphed(t, answer, applied);
    set(t + T_DECL, decl);
    if (DEBUG) debug(D_APPLY_END, s, e, rule);
    set(applied + N_B, 1);
    if (w(t + T_HOLE) && answer && w(answer + N_IS) === IS_HOLE) extend(t, answer, s, e);
    set(t + T_DEPTH, depth);
    return answer;
  }
  // `goto name`, read where it is not in a body that has the label: to the frame running that body (`afterwards`: the rest of
  // this one put off until everything is read; `report`: what it says, said).
  function go(t: number, s: number, n: number, f: number, v: number) {
    if (word(s, s + n, W_REPORT)) { report(t, f); return; }
    set(t + T_JUMP_S, s); set(t + T_JUMP_N, n); set(t + T_JUMP_V, v);
  }
  // Files, where the text from s to e says (a hole written there: what it took): to be read by the host when what is being
  // read now is (`include`: here, in what this is read in; `read`: each in a scope of its own), in the order asked.
  function files(kind: number, s: number, e: number, names: number) {
    const x = names ? ref(w(names + F_RULE), w(names + F_CLOSURE), s, e, 1) : 0;
    if (x) { const tk = follow(take(names, (x - 1) >> 16, (x - 1) & 0xFFFF), 0); s = w(tk); e = w(tk + 4); }
    const k = xadd(READS_N, 1), q = w(READS) + 16 * k;
    if (k < w(READS_CAP)) { set(q, kind); set(q + 4, s); set(q + 8, e); set(q + 12, names ? w(names + F_THIS) : w(GLOBAL)); }
  }
  function report(t: number, f: number) {
    // (in a test, said where the test is: what applied it may lead elsewhere, a closure's callers to where it was written)
    let root = f; if (w(t + T_TESTING) && w(t + T_ROOT)) root = w(t + T_ROOT); else while (root && !(w(root + N_A) & ROOT)) root = w(root + F_CALLER);
    const rule = w(f + F_RULE), tk = rule && w(rule + R_HOLES) ? follow(f + F_TAKES, 0) : 0;
    // (the rule that says it, whose style says how much it matters: told first, then what it says)
    if (rule) log(w((root || f) + F_START), L_STYLED, w(rule + R_HEAD), 0);
    say(t, w((root || f) + F_START), L_REPORT, tk ? w(tk) : 0, tk ? w(tk + 4) : 0);
  }
  // (the last of a body's labels written as the text from s, n long: where it is, or -1)
  function labelled(bd: number, s: number, n: number) {
    for (let k = w(bd) - 1; k >= 0; k--) { const st = bd + 4 + STEP * k; if (w(st) === S_LABEL && w(st + 16) === n && same(w(st + 12), s, n)) return k; }
    return -1;
  }
  // A body run: its statements one after another, a label jumped to where it is (one written as a value, where what is gone to
  // is that value). Going to `afterwards`: the rest put off (a test).
  // (a body run: built, its rule's own function, when it is that body; else read step by step)
  function ran(t: number, f: number, rule: number, bd: number, from: number): number {
    const fn = rule ? w(rule + R_FN) : 0;
    return fn && w(rule + R_BODY) === bd ? compiled(fn, t, f, from) : exec(t, f, bd, from);
  }
  function exec(t: number, f: number, bd: number, from: number): number {
    let answer = 0;
    const n = w(bd);
    for (let pc = from; pc < n;) {
      const st = bd + 4 + STEP * pc, kind = w(st), self = w(f + F_THIS);
      if (kind === S_LABEL || kind === S_LABELLED) { pc++; continue; }
      if (kind === S_GOTO) {
        const to = labelled(bd, w(st + 12), w(st + 16));
        if (to >= 0) { if (to <= pc) again(f); pc = to; continue; }
        if (word(w(st + 12), w(st + 12) + w(st + 16), W_AFTERWARDS)) { defer(f, pc + 1); return 0; }
        go(t, w(st + 12), w(st + 16), f, answer);
      } else if (kind === S_TO) {
        const target = of(t, w(st + 12), f, self);
        if (stopped(t)) return 0;
        let to = pc + 1;
        for (let j = 0; j < n; j++) { const o = bd + 4 + STEP * j; if (w(o) === S_LABELLED && of(t, w(o + 12), f, self) === target) { to = j; break; } }
        pc = to; continue;
      } else {
        // (in a node this body is making (`external .`), what its earlier statements defined there: read again with them first)
        let r = w(st + 12);
        if (latest(self) !== w(self + N_BASE) && making(self) && could(self, w(st + 4), w(st + 8))) { const again = reading(t, w(st + 4), w(st + 8), w(f + F_RULE), w(f + F_CLOSURE), latest(self), self, 0, 0, 0, 0); if (owned(again, self)) r = again; }
        answer = ev(t, r, f, f, self, pc === n - 1 ? 1 : 0, self, self);
      }
      if (w(t + T_FAULT) || w(OOM)) return 0;
      const jn = w(t + T_JUMP_N);
      if (jn) {
        const js = w(t + T_JUMP_S), to = labelled(bd, js, jn);
        if (to >= 0) { if (to <= pc) again(f); pc = to; if (w(t + T_JUMP_V)) answer = w(t + T_JUMP_V); set(t + T_JUMP_N, 0); continue; }
        if (word(js, js + jn, W_AFTERWARDS)) { set(t + T_JUMP_N, 0); defer(f, pc + 1); return 0; }
        return 0;
      }
      pc++;
    }
    return answer;
  }
  // (a jump back in a body, a loop: what its holes took is read again, as it is now (`while c { … }` asks c each time))
  function again(f: number) {
    const rule = w(f + F_RULE), n = rule ? w(rule + R_HOLES) : 0;
    for (let i = 0; i < n; i++) { const tk = f + F_TAKES + TAKE * i; if (aload(tk + T_STATE) === 2) astore(tk + T_STATE, 0); }
  }
  // (a reading by a rule of that node, or a value read by one and the rest on it, `made &+= { … }`)
  function owned(r: number, self: number): number {
    for (let n = 0; n < 64 && w(r) === K_ON; n++) r = w(r + 12);
    return w(r) === K_RULE && w(w(r + 12) + R_OWNER) === self ? 1 : 0;
  }
  // (a label written as a value, or where to go: what the hole took, as a value)
  function of(t: number, r: number, f: number, self: number): number { return w(r) === K_REF || w(r) === K_NAME ? valued(t, take(w(r + 20) || f, w(r + 12), w(r + 16))) : ev(t, r, f, f, self, 1, self, self); }
  // (put off: the rest of a frame's body, from a step; in a test, held until that test is done, so it is run after it)
  function defer(f: number, from: number) {
    // (in a check, read quietly for its answer: nothing is put off, what it would run is not part of the answer)
    if (w(THREAD + T_QUIET)) { set(THREAD + T_RAN, 1); return; }
    if (w(THREAD + T_TESTING)) {
      if (!w(THREAD + T_HELD)) set(THREAD + T_HELD, alloc(8 * HELD));
      const n = w(THREAD + T_HELD_N);
      // (one written where this test or one it holds is, the same again (a body read again in the test, its tests in it): run
      // already)
      const at = w(f + F_START), root = w(THREAD + T_ROOT);
      if (root && w(root + F_START) === at && w(root + F_RULE) === w(f + F_RULE)) return;
      // (a test written in a test: run where it is written, in order with what is around it (what follows does not change what
      // it saw); its own, what it says not the outer one's)
      if (1) {
        if (!w(THREAD + T_HELD)) set(THREAD + T_HELD, alloc(8 * HELD));
        const hn = w(THREAD + T_HELD_N);
        for (let i = 0; i < hn && i < HELD; i++) { const h = w(w(THREAD + T_HELD) + 8 * i), hf = w(w(THREAD + T_HELD) + 8 * i + 4); if (w(h + F_START) === at && w(h + F_RULE) === w(f + F_RULE) && (hf === from || hf === -1 - from)) return; }
        // (kept as run, not to be run again after: one written where it is, the same again, run once)
        if (hn < HELD) { set(w(THREAD + T_HELD) + 8 * hn, f); set(w(THREAD + T_HELD) + 8 * hn + 4, -1 - from); set(THREAD + T_HELD_N, hn + 1); }
        const erred = w(THREAD + T_ERRED), said = w(THREAD + T_SAID), budget = w(THREAD + T_BUDGET), qbudget = w(THREAD + T_QBUDGET), grew = w(THREAD + T_GREW); test(THREAD, f, from); set(THREAD + T_TESTING, 1); set(THREAD + T_ROOT, root); set(THREAD + T_ERRED, erred); set(THREAD + T_SAID, said); set(THREAD + T_BUDGET, budget); set(THREAD + T_QBUDGET, qbudget); set(THREAD + T_GREW, grew); return; }
      for (let i = 0; i < n && i < HELD; i++) { const h = w(w(THREAD + T_HELD) + 8 * i); if (w(h + F_START) === at && w(h + F_RULE) === w(f + F_RULE) && w(w(THREAD + T_HELD) + 8 * i + 4) === from) return; }
      if (n < HELD) { set(w(THREAD + T_HELD) + 8 * n, f); set(w(THREAD + T_HELD) + 8 * n + 4, from); set(THREAD + T_HELD_N, n + 1); }
      // (a test that puts off tests that put off tests, without end: said once, where the first of them is, and no more held)
      else if (n === HELD) { say(THREAD, w(f + F_START), L_HELD, 0, 0); set(THREAD + T_HELD_N, n + 1); }
      return;
    }
    // (put off one after another in one block (not a file's own scope): one after another, by whichever thread runs the first)
    const k = xadd(AFTER_TAIL, 1), e = w(AFTER) + 12 * k, prev = e - 12, self = w(f + F_THIS);
    if (k < w(AFTER_CAP)) { set(e, f); set(e + 4, from); set(e + 8, k > 0 && w(prev) && w(w(prev) + F_THIS) === self && !w(self + N_A) ? 1 : 0); }
  }
  // A rule's body, read once: with the rules before it (a rule never reads itself) and its holes' names; what none reads, read
  // when it runs (`dynamically`: with what is there then). (Any thread may read it; the first to finish gives it.)
  function body(t: number, rule: number): number {
    let bd = w(rule + R_BODY);
    if (bd) return bd;
    // (read in a test, of a rule made before it: kept by this thread alone, until the test is done (the memory it is in is let go
    // of then, and another thread could be reading it))
    const mine = w(t + T_REG_AT) && !in_region(rule) ? w(t + T_BODIES) + 8 * ((rule >> 3) & (BODIES - 1)) : 0;
    if (mine) for (let i = 0; i < BODIES; i++) { const q = w(t + T_BODIES) + 8 * (((rule >> 3) + i) & (BODIES - 1)); if (w(q) === rule) return w(q + 4); if (!w(q)) break; }
    const s = w(rule + R_BS), e = w(rule + R_BE), closure = w(rule + R_CLOSURE), vis = w(rule + R_PREV), self = w(GLOBAL);
    // (read for every test alike: none's shadows)
    const shadows = w(THREAD + T_SH_N);
    set(THREAD + T_SH_N, 0);
    let lines = 1; for (let i = s; i < e; i++) if (b(i) === 10) lines++;
    if (DEBUG) debug(D_FAULT, 1090, s, e);
    bd = alloc(4 + STEP * lines);
    let n = 0, given = 0, placing = 0;
    // (the names a line before it begins by giving a value, `made := …`: a line mentioning one is read when it runs (it may be
    // the body's own then, not the one visible where it is written))
    const givens = alloc(8 * 32), cl = w(CLASSES);
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), r = reading(t, at, ln, rule, closure, vis, self, 0, 0, 0, 0), st = bd + 4 + STEP * n;
      let mentions = 0;
      for (let p = at; p < ln && given && !mentions;) {
        if (b(cl + b(p)) !== 1) { p++; continue; }
        let q = p; while (q < ln && b(cl + b(q)) === 1) q++;
        if (p === at || b(p - 1) !== 46) for (let i = 0; i < given; i++) if (w(givens + 8 * i + 4) - w(givens + 8 * i) === q - p && same(p, w(givens + 8 * i), q - p)) { mentions = 1; break; }
        p = q;
      }
      { let q = at; while (q < ln && b(cl + b(q)) === 1) q++; let o = q; while (o < ln && b(o) === 32) o++;
        if (q > at && o > q && o < ln && b(cl + b(o)) === 2 && b(o) !== 46 && given < 32) { set(givens + 8 * given, at); set(givens + 8 * given + 4, q); given++; } }
      at = ln; n++;
      set(st + 4, w(r + 4)); set(st + 8, w(r + 8));
      if (w(r) === K_RULE && w(w(r + 12) + R_KIND) === EXTERNAL) {
        const caps = w(r + 16), ns = skip(w(caps), w(caps + 4));
        let ts = ns; while (ts < w(caps + 4) && b(ts) > 32) ts++;
        const target = reading(t, ts, w(caps + 4), rule, closure, vis, self, 0, 0, 0, 0), dynamic = w(target) === K_REF;
        if (word(ns, ts, W_LABEL) || word(ns, ts, W_GOTO)) {
          const label = word(ns, ts, W_LABEL);
          if (dynamic) { set(st, label ? S_LABELLED : S_TO); set(st + 12, target); }
          else { set(st, label ? S_LABEL : S_GOTO); set(st + 12, w(target + 4)); set(st + 16, w(target + 8) - w(target + 4)); }
          continue;
        }
      }
      if (w(r) === K_UNREAD) set(r, K_LATER);
      else if (mentions && !(w(FAIL_FAST) & 128) && w(r) !== K_EMPTY) { const later = alloc(READ); set(later, K_LATER); set(later + 4, w(st + 4)); set(later + 8, w(st + 8)); set(st, S_READ); set(st + 12, later); continue; }
      set(st, S_READ); set(st + 12, r);
    }
    set(bd, n);
    // (a body that gives names values of its own: run in a node of its own, each time (what it gives is that run's))
    if ((given || placing) && !(w(FAIL_FAST) & 128) && !(w(rule + R_FLAGS) & OWNS)) set(rule + R_FLAGS, w(rule + R_FLAGS) | OWNS);
    set(THREAD + T_SH_N, shadows);
    if (mine) { if (w(t + T_BODIES_N) < BODIES / 2) { let q = mine; for (let i = 1; w(q) && i < BODIES; i++) q = w(t + T_BODIES) + 8 * (((rule >> 3) + i) & (BODIES - 1)); set(q, rule); set(q + 4, bd); set(t + T_BODIES_N, w(t + T_BODIES_N) + 1); } }
    else { cas(rule + R_BODY, 0, bd); bd = w(rule + R_BODY); }
    return bd;
  }

  // ---- defining

  // The primitive: `rules[lhs] := rhs`, in what it is read in; the head read with the rules there, the body what the right hole
  // took (code, with the names of where it was written). A head defined again there is that rule, given this body.
  function define(t: number, f: number): number {
    let self = w(f + F_THIS);
    const hd = follow(f + F_TAKES, 0), bd = follow(f + F_TAKES + TAKE, 0);
    // (a head that is neither a pattern (holes of its own) nor a name: an expression, read as a left side, as it is written (what
    // it has of the holes of where it was written read there, `({lhs} => {rhs}).style`): the name it declares, where it declares
    // it (`x.m`: m, in x); one that declares nothing (`[]`, `.`) is the text it is. A pattern: what those holes took in it.)
    // (whether it is one, by what its holes took in it: `{operator} {rest}` taking `==` and `{other}` is a pattern, `({lhs} =>
    // {rhs}).style` is not)
    const o = w(hd + T_ORIGIN);
    set(THREAD + T_PLACE_IN, 0);
    // (a head of holes only: read as the text they took)
    const raw = raw_head(hd), rs = raw ? w(THREAD + T_A) : w(hd), re = raw ? w(THREAD + T_B) : w(hd + 4);
    if (!raw) spliced(hd);
    // (a head that declared a name somewhere, `x.m`: defined there)
    if (w(THREAD + T_PLACE_IN)) self = w(THREAD + T_PLACE_IN);
    let hs = w(THREAD + T_A), he = w(THREAD + T_B);
    // (a word and `=>` written as an argument, after `(` or `,`, `xs.map(x => x * 2)`: a closure of that one parameter, as
    // `(x) => x * 2` (§9 `[1, 2, 3] for x => …`); not a rule defined in the scope the call is in) (the word written there, not
    // one a hole took: `{name} => value` naming `in` of `(in?: Linked)`; nor in `x.( … )`, code read in x: a definition there)
    if (!raw && parameter_led(skip(hs, he), trim_end(hs, he)) && hops(f + F_TAKES) <= 1) { let q = skip(hs, he) - 1; while (q > 0 && b(q) <= 32 && b(q) !== 10) q--; if ((b(q) === 40 && !(q > 0 && b(q - 1) === 46)) || b(q) === 44) return lambda(t, skip(hs, he), trim_end(hs, he), bd, o, self); }
    // (--debug: a head that is a hole of the rule it was written in, read where it can not see that rule's holes: `(name)` of
    // `(name) := value` in `=`'s body, defined as the text `(name)`)
    // (a head that is a hole of the rule it is written in, `(place)` of `(place) := value`, read where that rule's holes are not
    // seen: never defined as the text it is (every later `(place)` would read it), said instead)
    if (raw && o && w(o + F_RULE) && b(hs) === 40 && b(he - 1) === 41 && named(w(o + F_RULE), hs + 1, he - 1) >= 0) { if (DEBUG) debug(D_FAULT, 77, hs, he); say(t, hs, L_VALUED, hs, he); return 0; }
    // (a head that is a list written, `[x: Symbolic]`, `[at: Integer]`, no hole of its own: the text it is, declaring nothing
    // (open: `[x]` an operator hole, §A))
    const listed_head = b(hs) === 91 && past(hs, he) >= he;
    // (one of words only, `as Decimal` (`as (=== Decimal)`'s), `static Inner`: read quietly, what it names may not be yet
    // (`Decimal`, read in the map before Number.ray made it))
    let words = 0; { const a = skip(hs, he), z = trim_end(hs, he); words = a < z && b(w(CLASSES) + b(a)) === 1 ? 1 : 0; for (let i = a; i < z && words; i++) if (b(w(CLASSES) + b(i)) !== 1 && !(b(i) === 32 && i > a && b(i - 1) !== 32)) words = 0; if (words && worded(a, z)) words = 0; }
    // (one whose first word is no definition of that word alone (`as` of `as static => …`, Signed's: read, it declared
    // `static` the class itself; `static` of `static Signed := …` is one, what declares in the class): those words, as written)
    if (words) { const a = skip(hs, he); let m = a; while (m < he && b(w(CLASSES) + b(m)) === 1) m++; const sc = w(t + T_SCRATCH); set(t + T_SCRATCH, sc + SCRATCH); const end = read(a, m, latest(self), 0, 0, 0, sc), found = w(sc + 512); set(t + T_SCRATCH, sc); if (!(end === m && found && w(found + R_PARTS) === 1 && (w(found + R_PART) & 15) === LITERAL && !(w(found + R_FLAGS) & CALLS))) words = 2; }
    // (a member written with what it answers, a word, `: `, then a type led by a word, `paths: Path{.bounded: bounded} =>
    // [this]`: that word (the type's braces no hole of the head, the type not read where the member is defined); led by a
    // hole, `class: {parent} …`, a pattern)
    if (!raw && words !== 2) { const a = skip(hs, he); let m = a; while (m < he && b(w(CLASSES) + b(m)) === 1) m++; if (m > a && m + 2 < he && b(m) === 58 && b(m + 1) === 32 && b(w(CLASSES) + b(skip(m + 1, he))) === 1) { hs = a; he = m; words = 2; } }
    const expression = !pattern(hs, he, 0) && !worded(hs, he) && !listed_head && words !== 2;
    if (DEBUG && words === 1 && expression) debug(D_FAULT, 1112, hs, he);
    if (expression) {
      // (read as written; what declares nothing defined as what its holes took in it, `== (other)`)
      const declaring = w(t + T_DECL), named = w(t + T_NAMED), pushed = push_left(rs, re), defin = w(t + T_DEFIN);
      set(t + T_DECL, 1); set(t + T_DEFIN, self);
      const quiet = w(THREAD + T_QUIET), said = w(t + T_SAID); if (words) set(THREAD + T_QUIET, quiet + 1);
      const v = ev(t, reading(t, rs, re, raw ? 0 : o ? w(o + F_RULE) : 0, raw ? 0 : o ? w(o + F_CLOSURE) : 0, latest(self), self, LEFT, 0, 0, 0), raw ? frame(0, 0, self, rs, re, 0, 0, self, self) : o || frame(0, 0, self, w(hd), w(hd + 4), 0, 0, self, self), f, self, 1, self, self);
      set(t + T_DECL, declaring); set(t + T_LE, pushed); set(t + T_DEFIN, defin);
      if (words) { set(THREAD + T_QUIET, quiet); set(t + T_SAID, said); }
      // (a place, or the head of what was just declared (`b = 0`, a default): its name, where it is named)
      if (v && w(v + N_IS) === IS_PLACE && w(v + N_A) && w(v + N_B) > w(v + N_A)) { hs = w(v + N_A); he = w(v + N_B); if (place_in(v)) self = place_in(v); }
      else if (v && w(v + N_IS) === IS_HEAD && place_in(v) && worded(w(v + N_A), w(v + N_B))) { hs = w(v + N_A); he = w(v + N_B); self = place_in(v); }
      // (a left side made of names (`a, b = 0`, the places and heads it made reading it), not one name: it, for what each takes)
      else if (v && w(t + T_NAMED) - named > 0 && w(v + N_IS) === IS_NODE) { set(t + T_FAULT, 0); set(t + T_JUMP_N, 0); return v; }
      // (a left side in brackets that answered a value, not a place (`(name)` naming a hole that is a value there): reported, it
      // declares nothing)
      else if (v && w(v + N_IS) === IS_NODE && b(skip(rs, re)) === 40 && bracket(skip(rs, re), re) & 1) { const at = o && w(o + N_IS) === IS_FRAME ? o : 0; say(t, at ? w(at + F_START) : rs, L_VALUED, at ? w(at + F_START) : rs, at ? w(at + F_END) : re); if (DEBUG) debug(D_FAULT, 82, v, (in_region(v) ? 1 : 0) + (older(v) ? 2 : 0)); }
      // (a name in brackets, `(place)`, that read as nothing (a hole whose text is no left side, `initial | (internal …) : T`):
      // never defined as the text it is, which every later `(place)` would read; said instead)
      else if (!v && b(skip(rs, re)) === 40 && bracket(skip(rs, re), re) & 1 && worded(skip(rs, re) + 1, trim_end(rs, re) - 1)) { if (DEBUG) debug(D_FAULT, 77, hs, he); say(t, rs, L_VALUED, rs, re); set(t + T_FAULT, 0); set(t + T_JUMP_N, 0); return 0; }
      set(t + T_FAULT, 0); set(t + T_JUMP_N, 0);
      // (a place and its head, `f (x)`: the place given what `(x) => body` is, a closure)
      if (v && w(v + N_IS) === IS_CALLED) return called(t, v, bd, w(hd + T_ORIGIN), self);
      if (v && w(v + N_IS) === IS_APPLIED) return applied(t, v, bd, w(hd + T_ORIGIN), self);
    }
    inlined(bd);
    if (DEBUG) debug(D_DEFINE, hs, he, self);
    const inl_s = w(THREAD + T_INL_S), inl_e = w(THREAD + T_INL_E), inl_f = w(THREAD + T_INL_F), in2_s = w(THREAD + T_IN2_S), in2_e = w(THREAD + T_IN2_E), in2_f = w(THREAD + T_IN2_F), all_s = w(THREAD + T_ALL_S), all_e = w(THREAD + T_ALL_E);
    const r = rule_(t, self, hs, he, w(THREAD + T_A), w(THREAD + T_B), w(bd + T_ORIGIN), w(hd + T_ORIGIN));
    set(r + R_INL_S, inl_s); set(r + R_INL_E, inl_e); set(r + R_INL_F, inl_f); set(r + R_IN2_S, in2_s); set(r + R_IN2_E, in2_e); set(r + R_IN2_F, in2_f); set(r + R_ALL_S, all_s); set(r + R_ALL_E, all_e);
    if (w(FAIL_FAST) & 2) log(w(hd), L_DEFINED, w(hd), w(hd + 4));
    set(t + T_NAMED, w(t + T_NAMED) + 1);
    return w(r + R_HEAD);
  }
  // (a place called with its head, `f (x) => body`: `(x) => body` read where it was written, its body with the names of where
  // that was (the text made of both: the head's part read with the head's names, the body's with the body's), and the place
  // given what it answers)
  // (a closure and a name, `xs.for x => body`: what the head read up to the name, called with `x => body`, a closure, the text
  // made of both as `called` makes it)
  function applied(t: number, v: number, bd: number, names: number, self: number): number {
    const hs = w(v + N_A), ps = w(v + N_B), pe = w(v + N_PARENT), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    const text = alloc((pe - hs) + 2 + sn + 3 + ol + (be - bs) + cl + 1);
    let at = text;
    for (let i = hs; i < ps; i++) setb(at++, b(i));
    setb(at++, 40); for (let i = ps; i < pe; i++) setb(at++, b(i));
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    setb(at++, 41);
    const rule = alloc(R_PART); set(rule + R_CLOSURE, names); set(rule + R_INL_S, body); set(rule + R_INL_E, body_end); set(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const r = reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { say(t, hs, L_NOT_ON, hs, pe); return 0; }
    return ev(t, r, fr, fr, self, 1, self, self);
  }
  // (an operator missing a side, from s to e, read as the closure of what it misses: none when it is not one)
  // (its sides named `section_left`, `section_right`)
  function section_side(at: number, right: number): number { setb(at++, 115); setb(at++, 101); setb(at++, 99); setb(at++, 116); setb(at++, 105); setb(at++, 111); setb(at++, 110); setb(at++, 95); if (right) { setb(at++, 114); setb(at++, 105); setb(at++, 103); setb(at++, 104); setb(at++, 116); } else { setb(at++, 108); setb(at++, 101); setb(at++, 102); setb(at++, 116); } return at; }
  function sectioned(t: number, s: number, e: number, names: number, self: number): number {
    const a = skip(s, e), z = trim_end(s, e), cl = w(CLASSES);
    if (a >= z || b(cl + b(a)) !== 2 || b(a) === 46) return 0;
    let o = a; while (o < z && b(cl + b(o)) === 2) o++;
    if (o < z && b(a) === 45 && o === a + 1 && b(o) >= 48 && b(o) <= 57) return 0;
    // (nor an operator written against a name, `-other`, `!done`: that operator on it)
    if (o < z && b(o) > 32 && b(cl + b(o)) === 1 && !(b(o) >= 48 && b(o) <= 57)) return prefixed(t, a, o, z, names, self);
    const alone = o >= z ? 1 : 0, unary = alone && o === a + 1 && b(a) === 33 ? 1 : 0;
    const sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    const text = alloc(64 + 2 * (z - a) + sn);
    let at = text;
    // (an operator alone, `|`: `.|`, the operator of what it is given, on `.` (`reduce(|)`, `(left) => left | .`))
    setb(at++, 40); at = section_side(at, 0);
    setb(at++, 41); setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    if (unary) { setb(at++, 33); at = section_side(at, 0); }
    else {
      at = section_side(at, 0); setb(at++, 32);
      for (let i = a; i < z; i++) setb(at++, b(i));
      if (alone) { setb(at++, 32); setb(at++, 46); }
    }
    const r = reading(t, text, at, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY) return 0;
    return ev(t, r, names, names, self, 1, self, self);
  }
  // (an operator written against what follows it, nothing reading it, `-other`: read right-to-left, that operator, a member
  // of what follows (`right-to-left - => …`), `(other).-`)
  function prefixed(t: number, a: number, o: number, z: number, names: number, self: number): number {
    const text = alloc(8 + (z - a)); let at = text;
    setb(at++, 40); for (let i = o; i < z; i++) setb(at++, b(i)); setb(at++, 41); setb(at++, 46); for (let i = a; i < o; i++) setb(at++, b(i));
    const r = reading(t, text, at, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY) return 0;
    return ev(t, r, names, names, self, 1, self, self);
  }
  // (`x => body` as a value: read as `(x) => {body}`)
  function lambda(t: number, ps: number, pe: number, bd: number, names: number, self: number): number {
    if (DEBUG) debug(D_FAULT, 1109, ps, pe);
    const sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    const text = alloc((pe - ps) + 4 + sn + ol + (be - bs) + cl + 1);
    let at = text;
    setb(at++, 40); for (let i = ps; i < pe; i++) setb(at++, b(i)); setb(at++, 41);
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    const rule = alloc(R_PART); set(rule + R_CLOSURE, names); set(rule + R_INL_S, body); set(rule + R_INL_E, body_end); set(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const r = reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { say(t, ps, L_NOT_ON, ps, pe); return 0; }
    return ev(t, r, fr, fr, self, 1, self, self);
  }
  function called(t: number, v: number, bd: number, names: number, self: number): number {
    const hs = w(v + N_A), he = w(v + N_B), place = w(v + N_PARENT), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    // (after a 0: a beginning of its own, how deep its lines are its own)
    // (the body on a line of its own, as deep as the line it began on: lines below it deeper still continue it, `=> true` with
    // `? …` below)
    let deep = 0; { let p = bs; while (p > 0 && b(p - 1) !== 10 && b(p - 1) !== 0) p--; while (b(p + deep) === 32 && p + deep < bs) deep++; }
    const n = (he - hs) + 1 + sn + 3 + (be - bs) + 1 + 1 + deep, text = alloc(n + 4) + 4; set(text - 4, 0);
    let at = text;
    for (let i = hs; i < he; i++) setb(at++, b(i));
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    // (the body, in brackets: one block, its value its last statement's)
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    setb(at++, 10); for (let i = 0; i < deep; i++) setb(at++, 32);
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    // (what it is read with: a rule of no holes whose names are the head's, the body's span the body's)
    const rule = alloc(R_PART); set(rule + R_CLOSURE, names); set(rule + R_INL_S, body); set(rule + R_INL_E, body_end); set(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const value = ev(t, reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0), fr, fr, self, 1, self, self);
    if (!value || stopped(t)) return 0;
    // (written bare, `f (x) =>`: the name this node's own, not one visible where it is (a class's `from (x)`, the language's
    // `from` untouched); written on a value, `x.f (y) =>`, that value's)
    const bare = skip(hs, he) === skip(w(place + N_A), w(place + N_B));
    const named = bound(w(place + N_A), w(place + N_B), bare ? self : (place_in(place) || self), value);
    // (the rule naming it is a method's, called with what follows it: `f (x) =>` beside `f =>`, each by what is given)
    const nr = latest(bare ? self : (place_in(place) || self)); if (nr && w(nr + R_HEAD) === named) set(nr + R_FLAGS, w(nr + R_FLAGS) | CALLS);
    return named;
  }
  // (a name, from s to e, given a value in a node: a rule there answering it)
  function bound(s: number, e: number, self: number, value: number): number {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    const named_ = alloc(R_PART + PART), hd = node(IS_HEAD, s, e, self, 0);
    set(named_ + R_KIND, VALUE); set(named_ + R_MASK, bytes(s, e)); set(named_ + R_BS, value); set(named_ + R_PARTS, 1); set(named_ + R_FLAGS, LED);
    set(named_ + R_HEAD, hd); set(named_ + R_OWNER, self); set(named_ + R_PART + 4, s); set(named_ + R_PART + 8, e - s);
    link(self, named_);
    return hd;
  }
  // (a body written in a body, `{{x}}` in it one of that body's holes: the code it took, written there, unread; at T_A, T_B)
  // (where the text a take took was written: its origin; a copy that origin read (a closure literal made of a body), on to
  // where that text was)
  function written_from(tk: number, a: number, z: number): number {
    let fo = w(tk + T_ORIGIN);
    for (let n = 0; fo && n < 16; n++) {
      const r = w(fo + F_RULE);
      if (r && w(r + R_INL_F) && a >= w(r + R_INL_S) && z <= w(r + R_INL_E)) fo = w(r + R_INL_F);
      else if (r && w(r + R_IN2_F) && a >= w(r + R_IN2_S) && z <= w(r + R_IN2_E)) fo = w(r + R_IN2_F);
      else break;
    }
    return fo;
  }
  function inlined(bd: number) {
    const s = w(bd), e = w(bd + 4), o = w(bd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    set(THREAD + T_A, s); set(THREAD + T_B, e); set(THREAD + T_INL_S, 0); set(THREAD + T_INL_E, 0); set(THREAD + T_INL_F, 0); set(THREAD + T_IN2_S, 0); set(THREAD + T_IN2_E, 0); set(THREAD + T_IN2_F, 0); set(THREAD + T_ALL_S, 0); set(THREAD + T_ALL_E, 0);
    if (!o || !w(o + F_RULE)) return;
    let n = 0, any = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s; at < e;) {
        // (`{{x}}`: a hole's brackets around `{x}`, a hole of it)
        let x = 0;
        if (bracket(at, e) === hole && bracket(at + open, e) === hole) {
          const inner = past(at + open, e);
          if (past(at, e) === inner + close) x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + 2 * open, inner - close, 0);
        }
        if (x) {
          const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
          // (code written in brackets, `{ … }`: what is inside them, as a rule's body is)
          code(THREAD, w(tk), w(tk + 4)); const ca = w(THREAD + T_A), cz = w(THREAD + T_B);
          // (its lines indented as where it is inlined: each as far in past that as it was past the least of them)
          let ind = 0; for (let i = at; i > s && b(i - 1) === 32; i--) ind++;
          let least = 1 << 30;
          for (let i = ca; i < cz; i++) if (b(i) === 10) { let k = 0; while (i + 1 + k < cz && b(i + 1 + k) === 32) k++; if (i + 1 + k < cz && b(i + 1 + k) !== 10 && k < least) least = k; }
          if (least === 1 << 30) least = 0;
          // (and its first line's, when it begins a line of its own: lines below it deeper than that continue it)
          { let p = ca, k = 0; while (p > 0 && b(p - 1) === 32) { p--; k++; } if ((b(p - 1) === 10 || b(p - 1) === 0) && k < least) least = k; }
          // (and, not written in brackets, beginning after other text, `=> true` of `f (x) => true`: the line it begins on's)
          if (b(skip(w(tk), w(tk + 4))) !== 123) { let p = ca; while (p > 0 && b(p - 1) !== 10 && b(p - 1) !== 0) p--; let k = 0; while (p + k < ca && b(p + k) === 32) k++; if (p + k < ca && k < least) least = k; }
          // (what it took keeps the names of where it was written: what is read in it is read with them)
          const from = out + n;
          for (let i = ca; i < cz; i++) {
            if (pass) setb(out + n, b(i)); n++;
            if (b(i) === 10) { for (let k = 0; k < least && i + 1 < cz && b(i + 1) === 32; k++) i++; for (let k = 0; k < ind; k++) { if (pass) setb(out + n, 32); n++; } }
          }
          // (with the names of where it was written: a copy read already, where that was; the first, and the one after it, each
          // its own (`({{parameters}}) …{{body}}`, a closure's parameters and its body))
          if (pass) {
            const fo = written_from(tk, ca, cz);
            if (!w(THREAD + T_INL_F)) { set(THREAD + T_INL_S, from); set(THREAD + T_INL_E, out + n); set(THREAD + T_INL_F, fo); }
            else if (!w(THREAD + T_IN2_F)) { set(THREAD + T_IN2_S, from); set(THREAD + T_IN2_E, out + n); set(THREAD + T_IN2_F, fo); }
          }
          if (pass) { if (!w(THREAD + T_ALL_S)) set(THREAD + T_ALL_S, from); set(THREAD + T_ALL_E, out + n); }
          at = past(at, e); any = 1;
          continue;
        }
        if (pass) setb(out + n, b(at));
        n++; at++;
      }
      if (!any) return;
      if (!pass) { out = alloc(n); n = 0; }
      else { set(THREAD + T_A, out); set(THREAD + T_B, out + n); }
    }
  }
  // (a head written in a body, its holes named as that body's: what they took in their place, `{operator} {rest}` the text
  // they took; at T_A, T_B)
  // (a head made only of holes of where it was written, `{operator} {rest}`: what they took, as written, one text; else 0)
  function raw_head(hd: number): number {
    const s = w(hd), e = w(hd + 4), o = w(hd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    if (!o || !w(o + F_RULE)) return 0;
    let refs = 0, n = 0;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      if (bracket(at, e) !== hole) return 0;
      const x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0);
      if (!x) return 0;
      const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
      n += w(tk + 4) - w(tk) + 1; refs++; at = past(at, e);
    }
    if (refs < 2) return 0;
    const text = alloc(n + 1); let out = text;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0);
      const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
      if (out > text) setb(out++, 32);
      for (let i = w(tk); i < w(tk + 4); i++) setb(out++, b(i));
      at = past(at, e);
    }
    set(THREAD + T_A, text); set(THREAD + T_B, out);
    return 1;
  }
  function spliced(hd: number) {
    const s = w(hd), e = w(hd + 4), o = w(hd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    set(THREAD + T_A, s); set(THREAD + T_B, e);
    if (!o || !w(o + F_RULE)) return;
    // (what each took, found once (pass 0), then written (pass 1))
    const SUBS = 32, subs = alloc(8 * SUBS);
    let n = 0, any = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s, depth = 0, k = 0; at < e;) {
        const x = bracket(at, e) === hole ? refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0) : 0, from = w(THREAD + T_REFF);
        if (x) {
          let a = 0, z = 0;
          if (pass) { a = w(subs + 8 * k); z = w(subs + 8 * k + 4); }
          else {
            const tk = follow(take(from, (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
            a = skip(w(tk), w(tk + 4)); z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
            // (one that took code, not a name: what it answers, when that is a name (a place, what a rule was named, a text));
            // but in brackets, part of what is read as a whole (`({lhs} => {rhs}).style`): as written
            // (an operator, `+` of `compounds +`, the same: as written, no left side (read as one, it declared itself a place in
            // what the rule ran on, and `global.({name} += …)` was defined there))
            let name = 1, op = a < z ? 1 : 0; for (let i = a; i < z; i++) { if (b(w(CLASSES) + b(i)) !== 1) name = 0; if (b(w(CLASSES) + b(i)) !== 2) op = 0; }
            if (op) name = 1;
            // (one that took a pattern, `{x} + {y}` (holes of none of where it was written): a head, as written)
            if (!name && !depth && !pattern(a, z, w(tk + T_ORIGIN))) {
              // (read as a left side: what it declares; what it runs defines with places of its own, not this one's)
              const declaring = w(THREAD + T_DECL), into = w(THREAD + T_PLACE_IN), pushed = push_left(w(tk), w(tk + 4)); set(THREAD + T_DECL, 1);
              const v = valued(THREAD, take(from, (x - 1) >> 16, (x - 1) & 0xFFFF)), is = v ? w(v + N_IS) : -1;
              set(THREAD + T_DECL, declaring); set(THREAD + T_PLACE_IN, into); set(THREAD + T_LE, pushed);
              if (is === IS_PLACE || is === IS_HEAD || is === IS_TEXT) { a = w(v + N_A); z = w(v + N_B); }
              // (else, a name in a group, `(name)`, that names a hole: that hole's code, as written (`=`'s `(name) :=` of
              // `x.type`))
              else if ((bracket(a, z) & 3) === 1 && past(a, z) === z) {
                const og = w(tk + T_ORIGIN), i = skip(a + 1, z - 1); let j = z - 1; while (j > i && b(j - 1) <= 32) j--;
                const y = og && worded(i, j) ? refer(og, w(og + F_RULE), w(og + F_CLOSURE), i, j, 0) : 0;
                if (y) { const t2 = follow(take(w(THREAD + T_REFF), (y - 1) >> 16, (y - 1) & 0xFFFF), 0); a = skip(w(t2), w(t2 + 4)); z = w(t2 + 4); while (z > a && b(z - 1) <= 32) z--; }
              }
              if (is === IS_PLACE && place_in(v)) set(THREAD + T_PLACE_IN, place_in(v));
            }
            if (k < SUBS) { set(subs + 8 * k, a); set(subs + 8 * k + 4, z); }
          }
          for (let i = a; i < z; i++) { if (pass) setb(out + n, b(i)); n++; }
          at = past(at, e); any = 1; k++;
          continue;
        }
        const c = bracket(at, e) & 3;
        if (c === 1) depth++; else if (c === 2 && depth > 0) depth--;
        if (pass) setb(out + n, b(at));
        n++; at++;
      }
      if (!any) return;
      // (made after a 0, a beginning of its own: how deep its first line is, its own, not what was made before it)
      if (!pass) { out = alloc(n + 4) + 4; set(out - 4, 0); n = 0; }
      else { set(THREAD + T_A, out); set(THREAD + T_B, out + n); }
    }
  }
  // (an operator hole, `[x]` alone between a head's spaces (`{a} [x] {b}`): a hole an operator alone fills (`{x: Operator}`),
  // and `[x]` in the body that operator, spliced (`a [x] b`))
  function operator_holes(hs: number, he: number, bs: number, be: number): number {
    let found = 0;
    for (let p = hs; p < he; p++) {
      if (b(p) !== 91 || !(p === hs || b(p - 1) <= 32)) continue;
      let q = p + 1; while (q < he && b(w(CLASSES) + b(q)) === 1) q++;
      if (q === p + 1 || q >= he || b(q) !== 93 || !(q + 1 >= he || b(q + 1) <= 32)) continue;
      found = 1; break;
    }
    if (!found) return 0;
    const out = alloc(4 * (he - hs) + 64 + 4 * (be - bs) + 64 + 8) + 4; set(out - 4, 0);
    let at = out;
    const names = alloc(72), lens = alloc(64); let nn = 0;
    for (let p = hs; p < he;) {
      if (b(p) === 91 && (p === hs || b(p - 1) <= 32)) {
        let q = p + 1; while (q < he && b(w(CLASSES) + b(q)) === 1) q++;
        if (q > p + 1 && q < he && b(q) === 93 && (q + 1 >= he || b(q + 1) <= 32)) {
          if (nn < 16) { set(names + 4 * nn, p + 1); set(lens + 4 * nn, q - p - 1); nn++; }
          setb(at++, 123); for (let i = p + 1; i < q; i++) setb(at++, b(i));
          setb(at++, 125); p = q + 1; continue;
        }
      }
      setb(at++, b(p)); p++;
    }
    const he2 = at; setb(at++, 0); const bs2 = at;
    for (let p = bs; p < be;) {
      let hit = 0;
      if (b(p) === 91) for (let k = 0; k < nn; k++) { const s0 = w(names + 4 * k), n0 = w(lens + 4 * k); if (p + n0 + 1 < be && b(p + n0 + 1) === 93 && same(p + 1, s0, n0)) { setb(at++, 32); setb(at++, 123); for (let i = 0; i < n0; i++) setb(at++, b(s0 + i)); setb(at++, 125); setb(at++, 32); p += n0 + 2; hit = 1; break; } }
      if (!hit) { setb(at++, b(p)); p++; }
    }
    const spans = alloc(24); set(spans, out); set(spans + 4, he2); set(spans + 8, bs2); set(spans + 12, at); set(spans + 16, names); set(spans + 20, nn); set(names + 64, lens);
    return spans;
  }
  function rule_(t: number, self: number, hs: number, he: number, bs: number, be: number, closure: number, names: number): number {
    // (off: `{a: Superposed} [x] {b}` matches nearly every binary expression, its typed hole asked at each, or (superposing)
    // each read twice, nested: the suite times out)
    const spans = 0 && operator_holes(hs, he, bs, be); if (spans) { hs = w(spans); he = w(spans + 4); bs = w(spans + 8); be = w(spans + 12); }
    const r = head(t, hs, he, latest(self), names);
    // (its operator holes: what fills one, only an operator's characters)
    if (spans) { const nm = w(spans + 16), ln = w(nm + 64); for (let k = 0; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue; for (let j = 0; j < w(spans + 20); j++) { const a0 = skip(w(q + 4), w(q + 4) + w(q + 8)); let z0 = w(q + 4) + w(q + 8); while (z0 > a0 && b(z0 - 1) <= 32) z0--; if (z0 - a0 === w(ln + 4 * j) && same(a0, w(nm + 4 * j), z0 - a0)) set(q, w(q) | OPER); } } }
    // (a body written in brackets is what is inside them; one that is `{name}`, a hole of its own, is that hole's code)
    if (!ref(r, 0, bs, be, 1)) { code(t, bs, be); bs = w(t + T_A); be = w(t + T_B); }
    // (in a node made before the test it is in: of its rules, only the test's own (what it made there), defined again in place)
    const old_ = older(self);
    for (let o = latest(self); o && o !== w(self + N_BASE) && (!old_ || in_region(o)); o = w(o)) {
      if (w(o + R_KIND) !== RULE || (w(o + R_FLAGS) & DEAD) || !alike(o, r)) continue;
      // (one with holes: that rule given this one's parts and body, for what read it already; and this one placed last, binding
      // loosest)
      if (w(o + R_HOLES)) {
        for (let i = 0; i < PART * w(r + R_PARTS); i += 4) set(o + R_PART + i, w(r + R_PART + i));
        // (a hole's type not read yet, to be read into this one's parts now)
        for (let i = 0; i < w(LAZY_N) && i < w(LAZY_CAP); i++) { const l = w(LAZY) + 24 * i, q = w(l); if (q >= r + R_PART && q < r + R_PART + PART * w(r + R_PARTS)) set(l, o + (q - r)); }
        set(o + R_MASK, w(r + R_MASK));
        set(o + R_BS, bs); set(o + R_BE, be); set(o + R_CLOSURE, closure); set(o + R_HEAD, w(r + R_HEAD)); set(o + R_BODY, 0);
        break;
      }
      set(o + R_BS, bs); set(o + R_BE, be); set(o + R_CLOSURE, closure); set(o + R_BODY, 0);
      return o;
    }
    set(r + R_OWNER, self); set(r + R_BS, bs); set(r + R_BE, be); set(r + R_CLOSURE, closure);
    link(self, r);
    // (one made while the files are read, not in a test: listed, its body read at build)
    if (!w(THREAD + T_REG_AT)) { const k = xadd(RULES_N, 1); if (k < w(RULES_CAP)) set(w(RULES) + 4 * k, r); }
    return r;
  }
  // (the names a hole's content (a to z, in the head s to e) read from `from` on, each not another's type: when there are
  // several, the head written again with a hole for each, the text between them as it was (at T_A, T_B); else 0)
  function separate(t: number, from: number, s: number, e: number, a: number, z: number): number {
    const list = w(t + T_DECLS), n = w(t + T_DECLS_N), W = w(w(WORDS) + 8 * W_TYPE), WN = w(w(WORDS) + 8 * W_TYPE + 4);
    let count = 0;
    // (written in it: what the rules applied there read, elsewhere, is not)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (w(d + 4) < a || w(d + 8) > z) set(d, 0); }
    // (one inside another, `{x: T, y}` read as `x: (T, y)`: the outer one)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (!w(d)) continue; for (let j = from; j < n; j++) { const o = list + 12 * j; if (j !== k && w(o) && w(o) !== w(d) && w(o + 4) <= w(d + 4) && w(d + 8) <= w(o + 8)) { set(d, 0); break; } } }
    // (the same name read twice, once)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (!w(d)) continue; for (let j = from; j < k; j++) if (w(list + 12 * j) === w(d)) { set(d, 0); break; } }
    for (let k = from; k < n; k++) {
      const d = list + 12 * k;
      if (!w(d)) continue;
      for (let j = from; j < n; j++) if (j !== k && w(list + 12 * j) && member(t, w(list + 12 * j), W, WN) === w(d)) { set(d, 0); break; }
      if (w(d)) count++;
    }
    if (count < 2) return 0;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), out = alloc((e - s) + count * (open + close) + 8);
    let o = 0, at = a;
    for (let i = s; i < a - open; i++) { setb(out + o, b(i)); o++; }
    for (;;) {
      // (the next of them, by where it is written)
      let next = 0;
      for (let k = from; k < n; k++) { const d = list + 12 * k; if (w(d) && w(d + 4) >= at && (!next || w(d + 4) < w(next + 4))) next = d; }
      if (!next) break;
      for (let i = at; i < w(next + 4); i++) { setb(out + o, b(i)); o++; }
      for (let i = 0; i < open; i++) { setb(out + o, b(w(OPEN) + i)); o++; }
      for (let i = w(next + 4); i < w(next + 8); i++) { setb(out + o, b(i)); o++; }
      for (let i = 0; i < close; i++) { setb(out + o, b(w(CLOSE) + i)); o++; }
      at = w(next + 8);
    }
    for (let i = at; i < z; i++) { setb(out + o, b(i)); o++; }
    for (let i = z + close; i < e; i++) { setb(out + o, b(i)); o++; }
    // (written the same: nothing to separate)
    if (o === e - s && same(out, s, o)) return 0;
    set(t + T_A, out); set(t + T_B, out + o);
    return 1;
  }
  // (the same head: its text and where its holes are, whatever they are named)
  function alike(a: number, c: number) {
    if ((w(a + R_FLAGS) & METHOD) !== (w(c + R_FLAGS) & METHOD) || w(a + R_PARTS) !== w(c + R_PARTS)) return 0;
    for (let k = 0; k < w(a + R_PARTS); k++) {
      const p = a + R_PART + PART * k, q = c + R_PART + PART * k;
      if ((w(p) & 15) !== (w(q) & 15)) return 0;
      // (a hole of another type, `{x: T}`: another rule)
      if ((w(p) & 15) === HOLE && w(p + 16) !== w(q + 16)) return 0;
      if ((w(p) & 15) === LITERAL && (w(p + 8) !== w(q + 8) || !same(w(p + 4), w(q + 4), w(p + 8)))) return 0;
    }
    return 1;
  }
  // A head compiled (read with the rules from `vis` on): literal text, spaces and holes. A hole's text is read as code, in a node
  // that is the hole (`{x: T}`: `{x}: {type}` gives it its type); text it reads as is a literal (`{\`=>\`}`).
  function head(t: number, s: number, e: number, vis: number, names: number): number {
    const rule = alloc(R_PART + PART * (e - s > 1 ? e - s : 1)), led = rule + R_PART;
    // (out of memory: a rule of nothing, what reads it stopping)
    if (rule === w(TRASH)) { set(rule + R_PARTS, 0); set(rule + R_HOLES, 0); set(rule + R_FLAGS, 0); return rule; }
    set(rule + R_PREV, vis); parts(s, e, rule);
    // (led by the hole `this`, `{this}…`: a method, read only on a value, what is after it)
    let method = 0;
    // (led by a space, `{ }…`: the same, what follows a value after a space)
    if (w(rule + R_PARTS) > 1 && (w(led) & 15) === SPACE) {
      method = 1;
      const n = w(rule + R_PARTS) - 1;
      for (let i = 0; i < PART * n; i += 4) set(led + i, w(led + PART + i));
      set(rule + R_PARTS, n);
      // (what follows a value after a space, `3 boolean`, is a value: never an operator and what it takes, `== 8`)
      if ((w(led) & 15) === HOLE) set(led, w(led) | VALUED_HOLE);
    }
    if (w(rule + R_PARTS) > 1 && w(led) === HOLE) {
      let a = w(led + 4), z = a + w(led + 8); while (a < z && b(a) <= 32) a++; while (z > a && b(z - 1) <= 32) z--;
      if (word(a, z, W_THIS)) {
        method = 1;
        const n = w(rule + R_PARTS) - 1;
        for (let i = 0; i < PART * n; i += 4) set(led + i, w(led + PART + i));
        set(rule + R_PARTS, n);
      }
    }
    // (led by a symbol and written in a node, not everywhere (`[{{selection}}]`, `.. (last)` of Iterable's): a method of the
    // value it follows, not what reads the same text written alone in that node (`[1, 2, 3]` there)
    if (!method && w(rule + R_PARTS) > 1 && w(led) === LITERAL && owner(vis) !== w(GLOBAL) && (b(w(CLASSES) + b(w(led + 4))) === 2 || b(w(led + 4)) === 91)) method = 1;
    let hole = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== HOLE) continue;
      const a = w(q + 4), z = a + w(q + 8), nd = node(IS_HOLE, 0, 0, owner(vis), 0);
      // (a hole of code, `{{x: T}}`: its name and type are those of what its braces hold, `x: T`)
      let ra = a, rz = z; { let p = a, y = z; while (p < y && b(p) <= 32) p++; while (y > p && b(y - 1) <= 32) y--; if (b(p) === 123 && b(y - 1) === 125 && past(p, y) >= y) { ra = p + 1; rz = y - 1; } }
      // (read with the names of where it is written: `{x: a}` in a rule's body, its `a`)
      const r = vis ? reading(t, ra, rz, names ? w(names + F_RULE) : 0, names ? w(names + F_CLOSURE) : 0, vis, nd, HOLES, 0, DEFINES | READER, 0) : 0;
      let value = 0;
      if (r && w(r) === K_RULE) {
        const outer = w(t + T_HOLE), decls = w(t + T_DECLS_N), oa = w(t + T_HOLE_A), ob = w(t + T_HOLE_B);
        set(t + T_HOLE, nd); set(t + T_HOLE_A, a); set(t + T_HOLE_B, z);
        value = ev(t, r, names || (w(GLOBAL) ? frame(0, 0, nd, a, z, 0, 0, nd, nd) : 0), 0, nd, 1, nd, nd);
        set(t + T_HOLE, outer); set(t + T_HOLE_A, oa); set(t + T_HOLE_B, ob);
        caught(t, a);
        // (it read several names, `{a, b}` (not one's type, `{x: T}`): a hole for each, what is between them as written)
        const several = separate(t, decls, s, e, a, z);
        set(t + T_DECLS_N, decls);
        if (several) return head(t, w(t + T_A), w(t + T_B), vis, names);
      }
      if (value && value !== nd && w(value + N_IS) === IS_TEXT) { set(q, LITERAL); set(q + 4, w(value + N_A)); set(q + 8, w(value + N_B) - w(value + N_A)); continue; }
      if (w(nd + N_A)) { set(q + 4, w(nd + N_A)); set(q + 8, w(nd + N_B) - w(nd + N_A)); }
      else { set(nd + N_A, a); set(nd + N_B, z); }
      const type = r && w(r) === K_RULE ? member(t, nd, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4)) : 0;
      // (a type that is a hole, or a name nothing defines yet (a place), or nothing (a member of what is not there yet,
      // `Subscript.String` before `Subscript`): not yet a type, it reads nothing yet (not: anything))
      const pending = type === nd || (type && (w(type + N_IS) === IS_HOLE || w(type + N_IS) === IS_PLACE || type === w(NOTHING)));
      if (DEBUG && !type) { for (let x = a; x < z; x++) if (b(x) === 58) { debug(D_FAULT, 79, a, z); debug(D_FAULT, 78, r ? w(r) : -1, r && w(r) === K_RULE ? w(w(r + 12) + R_BS) : 0); break; } }
      set(q + 12, hole); hole++; set(q + 16, type && !pending ? type : 0); set(q + 20, nd);
      // (a type nothing reads yet, `{x: T}` before T is there: none yet, the rule reads nothing until it is)
      if (pending) { if (DEBUG) debug(D_DEFINE, a, z, type || 1); set(q + 16, 1); const lz = xadd(LAZY_N, 1), l = w(LAZY) + 24 * lz; if (lz < w(LAZY_CAP)) { set(l, q); set(l + 4, r); set(l + 8, a); set(l + 12, z); set(l + 16, vis); set(l + 20, names); } }
    }
    set(rule + R_HOLES, hole);
    const n = w(rule + R_PARTS), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    // (one whose head is one hole: a reader, not read in a hole, which names what it holds)
    let literal = 0; for (let k = 0; k < n; k++) if ((w(rule + R_PART + PART * k) & 15) === LITERAL) literal = 1;
    let flags = (n > 0 && w(led) === LITERAL ? LED : 0) | (hole > 0 ? HOLES : 0) | (method ? METHOD : 0) | (hole > 0 && !literal && !method ? READER : 0);
    for (let k = 0; k < n; k++) { const q = rule + R_PART + PART * k; if (w(q) === LITERAL && w(q + 8) === sn && sn && same(w(q + 4), sep, sn)) flags |= DEFINES; }
    set(rule + R_FLAGS, flags);
    // (a head that is one hole between two characters makes them a pair, as the brackets are: a hole never ends inside one)
    if (n === 3 && w(led) === LITERAL && w(led + PART) === HOLE && w(led + 2 * PART) === LITERAL && w(led + 8) === 1 && w(led + 2 * PART + 8) === 1) {
      const o = b(w(led + 4)), c = b(w(led + 2 * PART + 4)), pairs = w(PAIRS);
      // (characters on their own only, the brackets and quotes: an operator, `.{x}?`, is no pair)
      if (!b(pairs + o) && !b(pairs + c) && b(w(CLASSES) + o) === 3 && b(w(CLASSES) + c) === 3) { if (o === c) setb(pairs + o, 3); else { setb(pairs + o, 1); setb(pairs + c, 2); } set(PAIRS_GEN, w(PAIRS_GEN) + 1); }
    }
    // (a hole written against text takes no space, `{x}: {type}` (`:` binds the nearest); the last one, none it begins with
    // (`.{member}`); one inside a pair, any)
    for (let k = 0; k < n; k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== HOLE) continue;
      const before = k > 0 && (w(q - PART) & 15) === LITERAL, after = k < n - 1 && (w(q + PART) & 15) === LITERAL, pairs = w(PAIRS);
      const o = before ? b(w(q - PART + 4) + w(q - PART + 8) - 1) : 0, c = after ? b(w(q + PART + 4)) : 0;
      // (or between `<` and `>` written in the head, `class: <{generics}>(…)`: what is between them, any)
      const enclosed = before && after && ((b(pairs + o) === 1 && b(pairs + c) === 2) || (o === c && b(pairs + o) === 3) || (o === 60 && c === 62));
      // (not against what separates, `,` `;` (on its own, no pair): `{list}, {other}`'s list may hold spaces)
      const separates = (before ? b(w(CLASSES) + o) === 3 && !b(pairs + o) : 1) && (after ? b(w(CLASSES) + c) === 3 && !b(pairs + c) : 1);
      if ((before || after) && !enclosed && !separates) set(q, HOLE | HUG);
    }
    // (a head that is one hole takes a word, of a word's characters only: anything else it would read whole is everything)
    // (a method's, `{this}{rest}`: what follows the value it is read on)
    if (n === 1 && (w(led) & 15) === HOLE && !w(led + 16) && !method) set(led, HOLE | HUG | WORD);
    // (and a space between two holes is one: two holes never touch)
    for (let k = 1; k < n - 1; k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === SPACE && (w(q - PART) & 15) === HOLE && (w(q + PART) & 15) === HOLE) set(q, SPACE | HUG); }
    // (its head: read on, what any value answers (not what the node it is defined in has); where it is defined, kept by it)
    const head_ = node(IS_HEAD, s, e, w(GLOBAL) || (vis ? owner(vis) : 0), 0); set(w(head_ + N_BASE) + R_CLOSURE, vis ? owner(vis) : 0);
    set(rule + R_HEAD, head_);
    // (a numeral, as the kernel's map names it (`numeral `{head}``, read before the rule is): flagged when it is defined)
    if (w(NUMERAL_AT) && e - s === w(NUMERAL_AT + 4) && same(s, w(NUMERAL_AT), e - s)) set(rule + R_FLAGS, w(rule + R_FLAGS) | NUMERAL);
    // (one superposing, as the map names it (`superposing `{head}``, read before the library defines it): flagged so too)
    if ((w(SUPERPOSING_AT) && e - s === w(SUPERPOSING_AT + 4) && same(s, w(SUPERPOSING_AT), e - s)) || (w(SUPERPOSING_AT + 8) && e - s === w(SUPERPOSING_AT + 12) && same(s, w(SUPERPOSING_AT + 8), e - s))) set(rule + R_FLAGS, w(rule + R_FLAGS) | SUPERPOSING);
    // (a method, named first, whose parameters have types, `as (base: Number.Base)`: those are part of its pattern, asked once, of what it is
    // applied to; not one of them, it does not apply (what reads the text without it does))
    if ((w(rule + R_FLAGS) & METHOD) && !(w(rule + R_FLAGS) & SUPERPOSING) && (w(rule + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(rule + R_PART + 4))) === 1) for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && w(q + 16)) { set(rule + R_FLAGS, w(rule + R_FLAGS) | REFUSES); break; } }
    let m = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === LITERAL) m |= bytes(w(q + 4), w(q + 4) + w(q + 8)); }
    set(rule + R_MASK, m);
    return rule;
  }
  // (a jump or a stop left where it can go nowhere: said, and done with)
  function caught(t: number, at: number) {
    if (w(t + T_JUMP_N)) { if (!word(w(t + T_JUMP_S), w(t + T_JUMP_S) + w(t + T_JUMP_N), W_ERRED)) say(t, at, L_UNLABELLED, w(t + T_JUMP_S), w(t + T_JUMP_N)); set(t + T_JUMP_N, 0); }
    if (w(t + T_FAULT)) { say(t, at, w(t + T_FAULT), w(t + T_FAULT) === L_DEEP ? w(t + T_DEEPC) : 0, 0); set(t + T_FAULT, 0); }
  }

  // What a node holds under a name (the text at s, n long): its own rule written as that name, applied.
  function member(t: number, nd: number, s: number, n: number): number {
    if (w(t + T_BUDGET) < 1000) set(t + T_BUDGET, w(BUDGET));
    if (w(t + T_QBUDGET) < 1000) set(t + T_QBUDGET, 10 * w(BUDGET));
    for (let r = latest(nd); r && r !== w(nd + N_BASE); r = w(r)) {
      const hd = w(r + R_HEAD);
      if (w(r + R_HOLES) || !hd || !trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, s + n)) continue;
      return apply(t, r, 0, w(GLOBAL) ? frame(0, 0, nd, 0, 0, 0, 0, nd, nd) : 0, 0, nd, w(hd + N_A), w(hd + N_B), nd, nd);
    }
    return 0;
  }
  // A take's value: its code read where it was written, once. (What a reference took is read again, for this one: `while c
  // { … }` asks its condition each time.)
  // (being read: by which thread, odd; another waits for it, this one needs itself)
  // (a place a take answered: its name read again where it was named, now (defined since, its value; else the place))
  function resolved(t: number, tk: number): number {
    const v = w(tk + T_VALUE);
    if (!v || w(v + N_IS) !== IS_PLACE || !place_in(v) || w(v + N_A) >= w(v + N_B)) return v;
    // (only where its code is that name, a name read before it is defined: a place given along under another name is the place)
    const o = follow(tk, 1); if (!trimmed(w(v + N_A), w(v + N_B) - w(v + N_A), w(o), w(o + 4))) return v;
    const scope = place_in(v), r = reading(t, w(v + N_A), w(v + N_B), 0, 0, latest(scope), scope, 0, 0, 0, 0);
    if (w(r) !== K_RULE || (w(w(r + 12) + R_KIND) === VALUE && w(w(r + 12) + R_BS) === v)) return v;
    // (while it is: the place (what was defined from it, read on, reads it again))
    astore(tk + T_STATE, 3);
    const fr = frame(0, 0, scope, w(v + N_A), w(v + N_B), 0, 0, scope, scope), now = ev(t, r, fr, fr, scope, 1, scope, scope);
    astore(tk + T_STATE, 2);
    // (kept, but not by a take made before a test, of what the test made: it is let go of with the test)
    if (now && w(now + N_IS) !== IS_PLACE && !older(tk) && (!w(THREAD + T_REG_AT) || in_region(tk) || !in_region(now))) set(tk + T_VALUE, now);
    return now || v;
  }
  // (a hole's code written in the left side being read (its text inside it): read as part of it, wherever it is used)
  // (the texts of the left side being read: each code it read as part of it (T_LS spans, T_LE of them, from T_LB: a value read
  // in it, a receiver, reads none of them))
  function in_left(s: number, e: number): number {
    const at = w(THREAD + T_LS);
    for (let i = w(THREAD + T_LB); at && i < w(THREAD + T_LE); i++) if (s >= w(at + 8 * i) && e <= w(at + 8 * i + 4)) return 1;
    return 0;
  }
  function lefts() { return w(THREAD + T_LE) > w(THREAD + T_LB) ? 1 : 0; }
  function push_left(s: number, e: number): number {
    if (!w(THREAD + T_LS)) set(THREAD + T_LS, alloc(8 * LEFTS));
    const n = w(THREAD + T_LE); if (n < LEFTS) { set(w(THREAD + T_LS) + 8 * n, s); set(w(THREAD + T_LS) + 8 * n + 4, e); set(THREAD + T_LE, n + 1); }
    return n;
  }
  function valued(t: number, tk: number): number {
    let state = aload(tk + T_STATE);
    if (state === 2) return resolved(t, tk);
    if (state === 3) return w(tk + T_VALUE);
    if (!state && w(t + T_GIVEN_N) && !NOGIVEN) { const g = given(tk); if (g) { set(tk + T_VALUE, g); astore(tk + T_STATE, 3); return g; } }
    // (a take of what another took, `{x}` or `x`: that one's value, read once where it was written, kept there (and here))
    const source = follow(tk, 1);
    // (one word, read as a left side through what refers to it (`(name)` given `seen`): which one, so that what it names,
    // visible, is where it is; not a value read in a left side directly, `arguments = None`'s `None`)
    if (source !== tk) {
      const one = w(t + T_ONE);
      const here = w(t + T_HERE);
      // (a word given by reference, `(name)` (`=`): the visible one's place; given as code spliced here, `({written_parameters})`
      // (a call's parameters): declared here)
      if (w(t + T_DECL) && (worded(w(source), w(source + 4)) || operated(w(source), w(source + 4)))) { const ta = skip(w(tk), w(tk + 4)); let tz = w(tk + 4); while (tz > ta && b(tz - 1) <= 32) tz--; set(t + T_ONE, skip(w(source), w(source + 4))); set(t + T_HERE, bracket(ta, tz) === 5 + 8 * w(OPEN_LENGTH) && past(ta, tz) === tz ? 1 : 0); }
      const v = valued(t, source);
      set(t + T_ONE, one); set(t + T_HERE, here);
      if (aload(source + T_STATE) === 2 && !older(tk)) { set(tk + T_VALUE, v); astore(tk + T_STATE, 2); }
      return v;
    }
    // (one made before what is isolated, not yet known: known here only, as it is here)
    if (state !== 2 && older(tk)) { const o = follow(tk, 1), origin = w(o + T_ORIGIN); return block(t, w(o), w(o + 4), origin, origin, w(o + T_THIS), w(o + T_VIS), 1, 0, w(o + T_THIS), w(o + T_LEX)); }
    for (let n = 0; (state & 1) && (state & -2) !== THREAD && n < 100000000; n++) state = aload(tk + T_STATE);
    if (state === 2) return resolved(t, tk);
    if (state & 1) { if (DEBUG) debug(D_FAULT, 97, w(tk), w(tk + 4)); say(t, w(tk), L_CYCLE, 0, 0); return 0; }
    astore(tk + T_STATE, THREAD | 1);
    // (one typed by a text reads only that text: its value is the text)
    const o = follow(tk, 1), origin = w(o + T_ORIGIN), ty = w(o + T_VIS), left = in_left(w(o), w(o + 4)), decl_was = w(t + T_DECL), one_was = w(t + T_ONE);
    // (its own text, a word of the left side (`(x) := …`, a call's `(other)`): declared here, not where a visible one is (`=`
    // asks for that: its name is code its caller wrote, above))
    const here_was = w(t + T_HERE);
    if (left) { set(t + T_DECL, 1); if (worded(w(o), w(o + 4)) || operated(w(o), w(o + 4))) { set(t + T_ONE, skip(w(o), w(o + 4))); set(t + T_HERE, (w(FAIL_FAST) & 8) ? 0 : 1); } }
    // (code read as a left side: the left side, from here, its text)
    const pushed = w(t + T_LE); if (w(t + T_DECL)) push_left(w(o), w(o + 4));
    const tv = w(t + T_TV), tvs = w(t + T_TVS), tve = w(t + T_TVE);
    if (ty > 1 && w(ty + N_IS) !== IS_TEXT) { set(t + T_TV, ty); set(t + T_TVS, w(o)); set(t + T_TVE, w(o + 4)); }
    const v = ty > 1 && w(ty + N_IS) === IS_TEXT ? ty : block(t, w(o), w(o + 4), origin, origin, w(o + T_THIS), ty, 1, 0, w(o + T_THIS), w(o + T_LEX));
    set(t + T_TV, tv); set(t + T_TVS, tvs); set(t + T_TVE, tve);
    set(t + T_LE, pushed);
    if (left) { set(t + T_DECL, decl_was); set(t + T_ONE, one_was); set(t + T_HERE, here_was); }
    if (stopped(t)) { astore(tk + T_STATE, 0); return 0; }
    // (a place, a name nothing defines yet: not kept, read again when it may be)
    // (a place, a name nothing defines yet: kept as the place, its name read again where it was named when asked (`resolved`))
    set(tk + T_VALUE, v); astore(tk + T_STATE, 2);
    return v;
  }
  // (a take whose code is `{name}` (as a value, also `name`): what that hole took)
  // (some code along a take's references, `{x}` to what x took and so on, written in the left side being read)
  function left_along(tk: number): number {
    for (let n = 0; n < 64; n++) {
      if (in_left(w(tk), w(tk + 4))) return 1;
      const origin = w(tk + T_ORIGIN); if (!origin) return 0;
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return 0;
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return 0;
  }
  // (how many takes of other rules' holes a take goes through to the text it is: what `follow` walks)
  function hops(tk: number): number {
    let n = 0;
    for (; n < 8; n++) {
      const origin = w(tk + T_ORIGIN);
      if (!origin || w(origin + N_IS) !== IS_FRAME) return n;
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return n;
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return n;
  }
  function follow(tk: number, bare: number): number {
    for (let n = 0; n < 1000; n++) {
      const origin = w(tk + T_ORIGIN);
      if (!origin) return tk;
      if (DEBUG && w(origin + N_IS) !== IS_FRAME) { debug(D_FAULT, 1102, w(tk), w(tk + 4)); return tk; }
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x && bare) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return tk;
      if (DEBUG) { let fq = w(THREAD + T_REFF); const dd = (x - 1) >> 16, ii = (x - 1) & 0xFFFF; for (let d = 0; d < dd && fq; d++) fq = w(fq + F_CLOSURE); if (!fq || w(fq + N_IS) !== IS_FRAME || ii >= w(w(fq + F_RULE) + R_HOLES)) { debug(D_FAULT, 1103, w(tk), w(tk + 4)); debug(D_FAULT, 1104, dd, w(THREAD + T_REFF) === origin ? 0 : 1); if (fq && w(fq + N_IS) === IS_FRAME) debug(D_FAULT, 1105, w(fq + F_RULE), ii); return tk; } }
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return tk;
  }
  // (what a frame holds by this name: its caller, its this, one of its rule's holes)
  function held_in(fr: number, s: number, e: number): number { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; return word(s, e, W_CALLER) || word(s, e, W_THIS) || (w(fr + F_RULE) && named(w(fr + F_RULE), s, e) >= 0) ? 1 : 0; }
  // (a node a method made to run in (`external .` in a frame of a rule led by `{this}`), made of what it was read on)
  // (a rule led by `.`, `.{member}`: what it declares is a member of what `.` is)
  function dotted(rule: number): number { return rule && (w(rule + R_FLAGS) & LED) && b(w(rule + R_PART + 4)) === 46 ? 1 : 0; }
  function run_node(n: number): number { const mk = w(n + N_IS) === IS_NODE && w(n + N_ALSO) ? w(n + N_B) : 0; return mk > 1 && w(mk + N_IS) === IS_FRAME && w(mk + F_RULE) && (w(w(mk + F_RULE) + R_FLAGS) & (METHOD | OWNS)) ? 1 : 0; }
  // (at written in rule r's own body)
  function in_body(r: number, at: number): number { return w(r + R_BS) <= at && at < w(r + R_BE) ? 1 : 0; }
  function inlined_at(r: number, at: number): number { return w(r + R_ALL_S) && w(r + R_ALL_S) <= at && at < w(r + R_ALL_E) ? 1 : 0; }
  // (the text from s to e an operator's name, only characters of an operator: `==`, `..` (what a method of it is named by))
  function operated(s: number, e: number): number { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e) return 0; for (let i = s; i < e; i++) if (b(w(CLASSES) + b(i)) !== 2) return 0; return 1; }
  // (rule r: text, then its hole i written against it, the last of its head, and its body that hole alone (`.{member} =>
  // {member}`))
  function rest_of_line(r: number, i: number): number {
    if (!r) return 0;
    const k = part(r, i), n = w(r + R_PARTS), q = r + R_PART + PART * k;
    if (k !== n - 1 || k < 1 || (w(r + R_PART + PART * (k - 1)) & 15) !== LITERAL || !(w(q) & HUG)) return 0;
    return ref(r, 0, w(r + R_BS), w(r + R_BE), 1) === i + 1 ? 1 : 0;
  }
  function take(f: number, depth: number, i: number) { for (let d = 0; d < depth; d++) f = w(f + F_CLOSURE); return f + F_TAKES + TAKE * i; }

  // ---- files and tests

  // A file's statements (`Statements(file, dynamically scope.last)`): each read with its scope's rules as they are then. What
  // none reads is read again when the scope gains a rule. (The language's own file, `k` < 0: as it goes, and what is left is
  // said. Another, read beside the others: with the language and its own rules only, what it writes in the language's a shadow
  // of it; what is left is read again once every file is read, with what each file wrote, in the order they were given.)
  function run(t: number, s: number, e: number, top: number, k: number, order: number) {
    const scope = w(top + F_THIS);
    let lines = 1; for (let i = s; i < e; i++) if (b(i) === 10) lines++;
    const unread = alloc(4 + 8 * lines);
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e);
      if (!statement(t, at, ln, top, scope, unread)) { const n = w(unread); set(unread + 4 + 8 * n, at); set(unread + 8 + 8 * n, ln); set(unread, n + 1); }
      at = ln;
    }
    if (k < 0) { said(t, unread); return; }
    const p = w(PEND) + 20 * k;
    set(p, order); set(p + 4, top); set(p + 8, unread);
    kept(t, p);
  }
  // (what is left unread, said)
  function said(t: number, unread: number) { for (let i = 0; i < w(unread); i++) say(t, w(unread + 4 + 8 * i), L_UNREAD, w(unread + 4 + 8 * i), w(unread + 8 + 8 * i)); }
  // (a file's shadows, kept until they are merged)
  function kept(t: number, p: number) {
    const n = w(t + T_SH_N), sh = alloc(12 * n + 4);
    for (let i = 0; i < 12 * n; i += 4) set(sh + i, w(w(t + T_SH) + i));
    set(p + 12, sh); set(p + 16, n); set(t + T_SH_N, 0); set(t + T_ISO, 0);
  }
  // Every file read: what each wrote in the language, given to it in the order the files were given (their shadows made its
  // own); then what is left unread in each, read again (any thread, each file); until a round reads nothing, and what is left is
  // said. (Every thread does its part; one merges.)
  function settle(t: number, last: number) {
    for (;;) {
      const phase = aload(PHASE), n = aload(PEND_N);
      if (phase === FINAL) return;
      if (phase & 1) continue;
      if (phase >= 2) {
        const i = xadd(NEXT, 1);
        if (i < n) {
          const p = w(PEND) + 20 * i, unread = w(p + 8), before = unread ? w(unread) : 0;
          if (before) {
            isolate(t, 0);
            for (let j = 0; j < w(unread);) {
              if (statement(t, w(unread + 4 + 8 * j), w(unread + 8 + 8 * j), w(p + 4), w(w(p + 4) + F_THIS), unread)) {
                if (DEBUG) debug(D_SETTLED, w(unread + 4 + 8 * j), w(unread + 8 + 8 * j), w(unread) - 1);
                const m = w(unread) - 1;
                for (let x = j; x < m; x++) { set(unread + 4 + 8 * x, w(unread + 12 + 8 * x)); set(unread + 8 + 8 * x, w(unread + 16 + 8 * x)); }
                set(unread, m);
              } else j++;
            }
            if (w(unread) < before) astore(ANY, 1);
          }
          if (unread) kept(t, p);
          xadd(DONE, 1);
          continue;
        }
        if (aload(DONE) < n) continue;
      }
      if (cas(PHASE, phase, phase + 1) !== phase) continue;
      merged(n);
      typing(t, 0);
      let left = 0;
      for (let i = 0; i < n; i++) if (w(w(PEND) + 20 * i + 8)) left += w(w(w(PEND) + 20 * i + 8));
      if (left && (phase === 0 || aload(ANY))) { astore(ANY, 0); astore(DONE, 0); astore(NEXT, 0); astore(PHASE, phase + 2); continue; }
      for (let i = 0; i < n; i++) if (w(w(PEND) + 20 * i + 8)) { said(t, w(w(PEND) + 20 * i + 8)); set(w(PEND) + 20 * i + 8, 0); }
      if (last) typing(t, 1);
      astore(PHASE, FINAL);
      return;
    }
  }
  // (the types holes were given that nothing read yet, read again: the ones there now, given; at the end, the rest said)
  function typing(t: number, last: number) {
    for (let i = 0; i < w(LAZY_N) && i < w(LAZY_CAP); i++) {
      const l = w(LAZY) + 24 * i, q = w(l), r = w(l + 4);
      if (!q || w(q + 16) !== 1) continue;
      const nd = node(IS_HOLE, 0, 0, owner(w(l + 16)), 0), outer = w(t + T_HOLE), oa = w(t + T_HOLE_A), ob = w(t + T_HOLE_B);
      // (each with a budget of its own: not what the thread that settles did before left (which thread it is is not the
      // language's: a constructor's `{arguments: Arguments}` stayed untyped on some runs))
      set(t + T_BUDGET, w(BUDGET)); set(t + T_QBUDGET, 10 * w(BUDGET)); set(t + T_GREW, 0);
      set(t + T_HOLE, nd); set(t + T_HOLE_A, w(l + 8)); set(t + T_HOLE_B, w(l + 12));
      ev(t, r, w(l + 20) || frame(0, 0, nd, w(l + 8), w(l + 12), 0, 0, nd, nd), 0, nd, 1, nd, nd);
      set(t + T_HOLE, outer); set(t + T_HOLE_A, oa); set(t + T_HOLE_B, ob);
      set(t + T_FAULT, 0); set(t + T_JUMP_N, 0);
      const type = member(t, nd, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4));
      if (type && type !== nd && w(type + N_IS) !== IS_PLACE && w(type + N_IS) !== IS_HOLE) { set(q + 16, type); set(l, 0); }
      else if (last) { say(t, w(l + 8), L_UNREAD, w(l + 8), w(l + 12)); set(l, 0); }
    }
  }
  // (the files' shadows, each file's in turn, by the order they were given: made the nodes' own)
  function merged(n: number) {
    let done = -1, changed = 0;
    for (let c = 0; c < n; c++) {
      let next = 0x7FFFFFFF, at = -1;
      for (let i = 0; i < n; i++) { const o = w(w(PEND) + 20 * i); if (o > done && o < next) { next = o; at = i; } }
      if (at < 0) break;
      done = next;
      const p = w(PEND) + 20 * at, sh = w(p + 12);
      for (let j = 0; j < w(p + 16); j++) {
        const nd = w(sh + 12 * j), top = w(sh + 12 * j + 4), was = w(sh + 12 * j + 8);
        if (top === was) continue;
        // (what a file put on the node, down to where it began; not there (that chain changed since): nothing to put back,
        // said with --debug)
        let r = top, count = 1; while (r && w(r + R_PREV) !== was && count < 1 << 20) { r = w(r + R_PREV); count++; }
        if (!r || w(r + R_PREV) !== was) { if (DEBUG) debug(D_FAULT, 1092, nd, top); continue; }
        set(r + R_PREV, w(nd + N_LAST)); set(nd + N_LAST, top); changed = 1;
        // (what each of them passes over, again: from the first of them, now after the others)
        const order = alloc(4 * count);
        r = top; for (let i = count - 1; i >= 0; i--) { set(order + 4 * i, r); r = w(r + R_PREV); }
        for (let i = 0; i < count; i++) skips(w(order + 4 * i));
      }
      set(p + 16, 0);
    }
    // (what was read once was read without them)
    if (changed && w(MEMO)) for (let i = 0; i <= w(MEMO_MASK); i++) set(w(MEMO) + MEMO_ENTRY * i, 0);
  }
  // (how many rules a statement may apply: as many per line of it as one line may, a long block more than a line)
  function budgeted(s: number, e: number) { let n = 1; for (let i = s; i < e && n < 20; i++) if (b(i) === 10) n++; return w(BUDGET) * n; }
  function statement(t: number, at: number, ln: number, top: number, scope: number, unread: number): number {
    if (DEBUG) debug(D_STATEMENT, at, ln, 0);
    // (its budget its own, reading it too: not what the statement this thread read before left (which thread reads it is
    // not the language's))
    set(t + T_BUDGET, budgeted(at, ln)); set(t + T_QBUDGET, 10 * budgeted(at, ln)); set(t + T_GREW, 0);
    const r = reading(t, at, ln, 0, 0, latest(scope), scope, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { if (DEBUG) debug(D_STATEMENT_END, at, ln, 0); return 0; }
    const before = latest(scope), f = frame(0, top, scope, at, ln, 0, 0, scope, scope);
    set(f + N_A, ROOT); set(t + T_BUDGET, budgeted(at, ln)); set(t + T_QBUDGET, 10 * budgeted(at, ln)); set(t + T_GREW, 0);
    ev(t, r, f, f, scope, 0, scope, scope);
    if (DEBUG) { debug(D_STATEMENT_END, at, ln, 0); if (w(t + T_GREW) > 8 << 20) debug(D_FAULT, 1096, at, w(t + T_GREW) >> 20); }
    caught(t, at);
    // (what nothing read, read again: when a rule the scope gained since has its texts written in it, one after another)
    const now = latest(scope);
    if (now !== before) for (let i = 0; i < w(unread);) {
      const us = w(unread + 4 + 8 * i), ue = w(unread + 8 + 8 * i), has = bytes(us, ue);
      let could = 0, seen = 0;
      for (let o = now; o && o !== before && !could; o = w(o), seen++) if (seen > 4096 || (!(w(o + R_MASK) & ~has) && (w(o + R_KIND) !== RULE || written(o, us, ue)))) could = 1;
      if (!could) { i++; continue; }
      if (statement(t, us, ue, top, scope, unread)) {
        const n = w(unread) - 1;
        for (let j = i; j < n; j++) { set(unread + 4 + 8 * j, w(unread + 12 + 8 * j)); set(unread + 8 + 8 * j, w(unread + 16 + 8 * j)); }
        set(unread, n);
      } else i++;
    }
    return 1;
  }
  // What was put off until everything was read (`external goto afterwards`: the tests), taken by any thread, each from where it
  // stopped. A name it reads that nothing defines is said, and the test failed (it goes on at its label `erred`); so does one
  // that said anything.
  function tests(t: number) {
    settle(t, 1);
    for (;;) {
      // (none left, and none being run that could put off more: done)
      const h = aload(AFTER_HEAD);
      if (h >= aload(AFTER_TAIL) || h >= w(AFTER_CAP)) { if (!aload(ACTIVE) && aload(AFTER_HEAD) >= aload(AFTER_TAIL)) return 0; continue; }
      xadd(ACTIVE, 1);
      if (cas(AFTER_HEAD, h, h + 1) !== h) { xadd(ACTIVE, -1); continue; }
      // (one that follows another is run by the thread that runs that one)
      for (let k = h; k < w(AFTER_CAP) && (k === h ? !w(w(AFTER) + 12 * k + 8) : w(w(AFTER) + 12 * k + 8)) && k < aload(AFTER_TAIL); k++) {
        // (what was made before it, it shadows; what it makes is its own)
        // (in memory of its own, let go of when it and what it held are done: an assert answers whether it held)
        const tf = w(w(AFTER) + 12 * k), rules = region_begin(t, tf);
        isolate(t, 0);
        test(t, tf, w(w(AFTER) + 12 * k + 4));
        // (what it put off, the tests written in it: here, after it, in the order written (they share what it made))
        for (let i = 0; i < w(t + T_HELD_N) && i < HELD; i++) if (w(w(t + T_HELD) + 8 * i + 4) >= 0) test(t, w(w(t + T_HELD) + 8 * i), w(w(t + T_HELD) + 8 * i + 4));
        set(t + T_HELD_N, 0);
        region_end(t, tf, rules);
        set(t + T_SH_N, 0); set(t + T_ISO, 0);
      }
      xadd(ACTIVE, -1);
    }
  }
  function test(t: number, f: number, from: number) {
    const bd = body(t, w(f + F_RULE)), said = w(t + T_SAID);
    set(f + N_A, w(f + N_A) | ROOT); set(t + T_BUDGET, w(BUDGET)); set(t + T_QBUDGET, 10 * w(BUDGET)); set(t + T_GREW, 0); set(t + T_TESTING, 1); set(t + T_ERRED, 0); set(t + T_ROOT, f);
    if (DEBUG && w(THREAD + T_QUIET)) debug(D_FAULT, 90, w(f + F_START), w(f + F_END));
    // (`RAY_ONLY=…` with --debug: a test it does not name, not run)
    if (DEBUG && debug(D_TEST, w(f + F_START), w(f + F_END), w(f + F_RULE)) === 1) { set(t + T_TESTING, 0); return; }
    ran(t, f, w(f + F_RULE), bd, from);
    if (DEBUG) debug(D_TEST_END, w(f + F_START), w(f + F_END), w(f + F_RULE));
    caught(t, w(f + F_START));
    if (w(t + T_SAID) > said && !w(t + T_ERRED)) { const er = labelled(bd, w(w(WORDS) + 8 * W_ERRED), w(w(WORDS) + 8 * W_ERRED + 4)); if (er >= 0) { ran(t, f, w(f + F_RULE), bd, er); caught(t, w(f + F_START)); } }
    // (a test that failed and said nothing of why: said, so no failure goes unexplained)
    if (w(t + T_ERRED) && !(w(t + T_SAID) > said)) say(t, w(f + F_START), L_SILENT, 0, 0);
    // (it passed when it said nothing; and not when memory ran out: what stopped it is no answer)
    const failed = w(t + T_SAID) > said || w(t + T_ERRED) || w(OOM) ? 1 : 0;
    xadd(failed ? FAILED : PASSED, 1);
    // (passed: told, what it asserted)
    if (!failed) log(w(f + F_START), L_PASSED, w(f + F_START), w(f + F_END));
    if (DEBUG) debug(D_RESULT, w(f + F_START), w(f + F_END), failed);
    set(t + T_TESTING, 0);
  }

  // Built: every rule made while the files were read, its body read now (read once, at build: what a test would read again).
  function prepared(t: number) {
    for (let k = 0; k < w(RULES_N) && k < w(RULES_CAP); k++) { const r = w(w(RULES) + 4 * k); if (w(r + R_KIND) === RULE && !(w(r + R_FLAGS) & DEAD) && w(r + R_BS) < w(r + R_BE)) body(t, r); }
  }

  return { prepared, begins, same, bracket, past, skip, line, apart, typed: typed_, match, read, parts, reading, ev, block, apply, head, rule_, member, valued, follow, run, tests, settle, node, frame, alloc, code, isolate };
}

// A reading: of a statement, what reads it. A rule (its holes' spans), a hole's code read here (`{name}`), what a hole took
// (`name`), what a frame read as a node holds, a value and the rest read on it, or nothing.

// One per thread: the kernel (compiled to WebAssembly, or as JavaScript) over the memory every thread shares, and this thread's
// words. The host reads the header and the files in, and says what the kernel said; everything else the kernel does.
export class Ray extends Language<FileStore> {
  heap!: { buffer: ArrayBufferLike };
  hosts: Record<string, (...args: number[]) => number> = {};
  said: [at: number, message: string, style?: string][] = [];
  x!: Exports; private i32!: Int32Array; private u8!: Uint8Array; t = 0;
  files_?: FileStore; private named_: string[] = []; prebuilt?: WebAssembly.Module;
  // (built at a level: each compiled rule's function, by its number (`R_FN` - 1))
  compiled_: ((t: number, f: number, from: number) => number)[] = [];
  named() { return this.named_; } name(named: string[]) { this.named_ = named; }
  private heard = new Set<string>(); private told = 0;
  static readonly LSP_MEMORY = Number(typeof process !== 'undefined' && process.env.RAY_LSP_MEMORY || 2 ** 30);
  static readonly MEMORY = Number(typeof process !== 'undefined' && process.env.RAY_MEMORY || 2 ** 31);
  static readonly BUDGET = Number(typeof process !== 'undefined' && process.env.RAY_BUDGET || 1000000);

  // A file: read where the language is (the entrypoint), else in a scope of its own inside it. (`TESTS`: what was put off.)
  compile(files: FileStore, id: number): void {
    this.init(files.buffer.values.heap); this.files_ = files;
    if (id === TESTS) return this.tests();
    if (id === SETTLE) { this.x.settle(this.t, 0); return; }
    const bytes = files.getBytes(id);
    if (kwargs.verbose) say(`${ansi.darkGray}READING${ansi.reset} ${ansi.darkGray}${files.getPath(id)}${ansi.reset}`);
    this.file(bytes, id);
  }
  // (the memory set out once, by whichever thread is first; this thread's words)
  init(heap: { buffer: ArrayBufferLike }) {
    if (this.x) return;
    this.heap = heap; this.i32 = new Int32Array(heap.buffer); this.u8 = new Uint8Array(heap.buffer);
    const first = Atomics.compareExchange(this.i32, HEAP >> 2, 0, START) === 0;
    // (this thread's words; the kernel compiled for it)
    this.t = this.alloc(1024); this.set(this.t, this.alloc(512 * SCRATCH)); this.set(this.t + 188, this.w(this.t) + 512 * SCRATCH); this.set(this.t + 480, this.alloc(8 * 8192)); this.set(this.t + 488, this.alloc(16 * 16)); this.set(this.t + 500, this.alloc(4 * 64)); this.set(this.t + 516, this.alloc(4 * 32));
    this.hosts.debug = (kind, a, b, c) => this.debugged(kind, a, b, c);
    this.hosts.compiled = (fn, t, f, from) => this.compiled_[fn - 1](t, f, from);
    this.hosts.told = (at, kind, a, c) => { this.tell(at, kind, a, c); return 0; };
    this.x = (this.prebuilt ? instance(this.prebuilt, this.heap as WebAssembly.Memory, this.hosts, this.t) : this.backend.compile(this)) as Exports;
    // (`--debug`: a crash says what the kernel was reading)
    if (this.debugging) this.x = Object.fromEntries(Object.entries(this.x).map(([name, f]) => [name, typeof f !== 'function' ? f : (...args: number[]) => {
      try { return f(...args); } catch (e) { if (!(e as { told?: 1 }).told) { (e as { told?: 1 }).told = 1; console.error(this.crashed(e as Error)); } throw e; }
    }])) as unknown as Exports;
    if (first) {
      this.set(LIMIT, this.u8.length - (1 << 22)); this.set(TRASH, this.u8.length - (1 << 22)); this.set(BUDGET, Ray.BUDGET); this.set(FAIL_FAST, (typeof process !== 'undefined' && process.env.RAY_FAIL_FAST === '0' ? 0 : 1) | (kwargs.debug && kwargs.debug !== "tests" ? 2 : 0) | (process.env.RAY_OLDONE ? 8 : 0) | (process.env.RAY_MEMO_CHECK ? 4 : 0) | (process.env.RAY_NOSHARE ? 16 : 0) | (process.env.RAY_NOCOULD ? 32 : 0) | (process.env.RAY_CHAIN ? 64 : 0) | (process.env.RAY_NOOWNS ? 128 : 0) | (process.env.RAY_NOGLYPHS ? 256 : 0) | (process.env.RAY_NOPREC ? 2048 : 0));
      const area = (at: number, capacity: number, cap: number, size: number) => { this.set(at, this.alloc(cap * size)); this.set(capacity, cap); };
      area(RULES, RULES_CAP, 1 << 18, 4); this.set(344, this.alloc(8 * (1 << 15))); this.set(OWN, this.alloc(4 * (this.u8.length >>> 16))); area(AFTER, AFTER_CAP, 1 << 16, 12); area(LIST, LIST_CAP, 1 << 21, 4); this.set(FILES, this.alloc(12 * 4096)); this.set(PEND, this.alloc(20 * 4096)); area(READS, READS_CAP, 4096, 16); this.set(INCL, this.alloc(8 * 4096)); area(LAZY, LAZY_CAP, 1 << 14, 24); this.set(BEGINS, this.alloc(44 * 4096)); this.set(288, this.alloc(16 * 4096)); this.set(216, this.alloc(4 * 64)); if (this.debugging) { this.set(240, this.alloc(8 * 4096)); this.set(244, this.alloc(8 * 4096)); this.set(248, this.alloc(8 * 4096)); } this.set(220, this.alloc(12 * 4096));
      if (!(typeof process !== 'undefined' && process.env.RAY_MEMO === '0')) { this.set(MEMO, this.alloc(60 << 20)); this.set(MEMO_MASK, (1 << 20) - 1); if (process.env.RAY_TMEMO !== '0') { this.set(TMEMO, this.alloc(40 << 16)); this.set(TMEMO_MASK, (1 << 16) - 1); } }
      this.set(PAIRS, this.alloc(256));
      // (a character's kind: 0 a space, 1 of a word, 2 of an operator, 3 one on its own)
      const at = this.alloc(256); for (let c = 0; c < 256; c++) this.u8[at + c] = c <= 32 ? 0 : /[A-Za-z0-9_]/.test(String.fromCharCode(c)) || c >= 128 ? 1 : /[(){}\[\]"'`,;]/.test(String.fromCharCode(c)) ? 3 : 2;
      this.set(CLASSES, at);
      // (and of 64 kinds, as a head's first text is kept by: each character not of a word its own, those of a word by their bits)
      const kinds = this.alloc(256); let punct = 0; for (let c = 0; c < 256; c++) this.u8[kinds + c] = c <= 32 ? 63 : this.u8[at + c] === 1 ? 32 + (c & 31) : punct < 32 ? punct++ : 31;
      this.set(228, kinds);
      // (the words the host knows: what a frame holds, its labels, the externals)
      const words = this.alloc(8 * WORDS_KNOWN.length);
      WORDS_KNOWN.forEach((word, i) => { const [s, e] = this.string(word); this.set(words + 8 * i, s); this.set(words + 8 * i + 4, e - s); });
      const map = this.alloc(8 * (MAPPED_KNOWN.length + 6));
      MAPPED_KNOWN.forEach((word, i) => { const [s, e] = this.string(word); this.set(map + 8 * i, s); this.set(map + 8 * i + 4, e - s); });
      // (what the program was called with, for `external arguments`: each argument ended by `\0`; after the words, in a slot of its own)
      { const [s, e] = this.string(env.nodejs ? process.argv.slice(2).map(arg => arg + '\0').join('') : ''); this.set(map + 8 * 24, s); this.set(map + 8 * 24 + 4, e - s); }
      this.set(232, map);
      Atomics.store(this.i32, WORDS >> 2, words);
    } else while (!Atomics.load(this.i32, WORDS >> 2)) Atomics.wait(this.i32, WORDS >> 2, 0, 10);
  }
  file(bytes: Uint8Array, id: number | string, kind = 0, scope = 0): [number, number] {
    const s = this.alloc(bytes.length + 2) + 1, e = s + bytes.length;
    this.u8.set(bytes, s);
    // (where each file is, for every thread: [start, end, id]; one named by text, by its index here, negative)
    const k = Atomics.add(this.i32, FILES_N >> 2, 1), entry = this.w(FILES) + 12 * k;
    if (typeof id === 'string') this.named_.push(id);
    [s, e, typeof id === 'number' ? id : -this.named_.length].forEach((v, i) => this.set(entry + 4 * i, v));
    // (and where what opens in it closes, read once: as yet, nowhere)
    const closes = this.w(220) + 12 * k; this.set(closes, s); this.set(closes + 4, e); this.set(closes + 8, this.alloc(4 * (bytes.length + 2)));
    const first = bytes.indexOf(10);
    if (new TextDecoder().decode(bytes.subarray(0, first < 0 ? bytes.length : first)).startsWith('!language ')) {
      this.boot(s, e, id);
      // (then the kernel's own map, what its kinds of value are in the language: the same for every backend, which run one kernel)
      if (env.nodejs) { const map = env.url.fileURLToPath(new URL('./wasm.o.ray', import.meta.url)); if (env.fs.existsSync(map)) this.file(env.fs.readFileSync(map), map); }
    }
    else {
      while (!Atomics.load(this.i32, BOOTED >> 2)) Atomics.wait(this.i32, BOOTED >> 2, 0, 100);
      // (one included: in what it was included in; else in a scope of its own)
      if (!kind && typeof id === 'number') [kind, scope] = [this.w(this.w(INCL) + 8 * id), this.w(this.w(INCL) + 8 * id + 4)];
      this.x.isolate(this.t, 0);
      const node = kind === 1 && scope ? scope : this.x.node(Is.NODE, 1, 0, this.w(GLOBAL), 0);
      this.x.run(this.t, s, e, this.x.frame(0, 0, node, s, e, 0, 0, node, node), k, typeof id === 'number' ? id + 1 : (1 << 20) + this.named_.length);
    }
    return [s, e];
  }
  get backend(): Language<Ray> { return Program.backends[String(kwargs.target ?? (env.nodejs && process.env.RAY_TARGET) ?? env.target)] ?? Program.backends.js; }

  // The header (`!language`, the brackets: two texts a space apart, the template a rule is written in), then the first
  // statement, read by inference: the template whose left side is the template again. Its left side is how a rule is
  // defined (the primitive, `rules[lhs] := rhs`), and it is defined that way itself, with its right side as its body.
  boot(s: number, e: number, id: number | string) {
    try {
      const newline = this.u8.indexOf(10, s), header = newline < 0 || newline > e ? e : newline, [, open, close, template] = /^!language\s+(\S+) (\S+)\s+(.*?)\s*$/.exec(this.text(s, header)) ?? [];
      if (!template) return this.say(s, 'expected a header like `!language { } {LHS} => {RHS}`');
      const hole = template.slice(template.indexOf(open), template.indexOf(close) + close.length), rest = template.slice(template.indexOf(close) + close.length);
      const [o, oe] = this.string(open), [c, ce] = this.string(close), [sp, se] = this.string(rest.slice(0, rest.indexOf(open)).trim());
      [[OPEN, o], [OPEN_LENGTH, oe - o], [CLOSE, c], [CLOSE_LENGTH, ce - c], [SEPARATOR, sp], [SEPARATOR_LENGTH, se - sp], [ENTRYPOINT_FILE, typeof id === 'number' ? id : -1], [ENTRYPOINT_START, s], [ENTRYPOINT_END, e]].forEach(([at, v]) => this.set(at, v));
      if (oe - o === 1 && ce - c === 1) { this.u8[this.w(PAIRS) + this.u8[o]] = 5; this.u8[this.w(PAIRS) + this.u8[c]] = 6; }
      const global = this.x.node(Is.NODE, 1, 0, 0, 0), external = this.x.head(this.t, ...this.string(`external ${open}rule${close}`), this.w(global));
      [[R.KIND, Kind.EXTERNAL], [R.OWNER, global]].forEach(([at, v]) => this.set(external + at, v)); this.set(global, external); this.set(GLOBAL, global);
      this.set(FRAMES, this.x.node(Is.NODE, 0, 0, global, 0));
      const inferred = this.x.head(this.t, ...this.string(template.replace(hole, template)), 0), scratch = this.w(this.t);
      const at = this.x.skip(header, e), end = this.x.read(at, this.x.line(at, e), inferred, 0, 0, 0, scratch);
      if (end < 0 || this.w(scratch + 512) !== inferred) return this.say(at, `the first statement must define how a rule is defined: \`${template.replace(hole, template)}\``);
      const [ls, , le, bs, be] = [0, 1, 4, 6, 7].map(i => this.w(scratch + 516 + 4 * i)), primitive = this.x.head(this.t, ls, le, external);
      [[R.KIND, Kind.DEFINE], [R.OWNER, global]].forEach(([at, v]) => this.set(primitive + at, v)); this.set(global, primitive);
      const top = this.x.frame(0, 0, global, s, e, 0, 0, global, global);
      this.x.rule_(this.t, global, ls, le, bs, be, top);
      this.x.run(this.t, end, e, top, -1, 0);
    } finally { Atomics.store(this.i32, BOOTED >> 2, 1); Atomics.notify(this.i32, BOOTED >> 2); }
  }
  // (the order the files were given in, what each wrote merged by: by where they are, however soon each was read; every file
  // read, also one merged already, so no two share one)
  static ordered(files: FileStore) {
    const i32 = new Int32Array(files.buffer.values.heap.buffer), w = (a: number) => i32[a >> 2], ks: [string, number][] = [];
    for (let k = 0; k < Atomics.load(i32, FILES_N >> 2); k++) { const id = w(w(FILES) + 12 * k + 8); if (id >= 0 && w(w(PEND) + 20 * k + 4)) ks.push([files.getPath(id), k]); }
    ks.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).forEach(([, k], i) => { i32[(w(PEND) + 20 * k) >> 2] = i + 1; });
  }
  // What the files read asked for (`external include`, `external read`), in the order asked: each read, then settled (what
  // each wrote, given to what it was read in), before the next. Where it says `given`: what the host was given.
  static requests(heap: { buffer: ArrayBufferLike }, from: number): { kind: number, text: string, at: number, scope: number }[] {
    const i32 = new Int32Array(heap.buffer), u8 = new Uint8Array(heap.buffer), out = [];
    for (let i = from; i < Math.min(Atomics.load(i32, READS_N >> 2), i32[READS_CAP >> 2]); i++) {
      const q = i32[READS >> 2] + 16 * i, [kind, s, e, scope] = [0, 4, 8, 12].map(o => i32[(q + o) >> 2]);
      out.push({ kind, text: new TextDecoder().decode(u8.slice(s, e)).trim(), at: s, scope });
    }
    return out;
  }
  // (a location, `@./*.ray`, beside the file it is written in: the files it names, in order; `*` names no hidden one)
  static located(text: string, from: string): string[] {
    const path = env.path.resolve(env.path.dirname(from), text.replace(/^@/, '')), dir = env.path.dirname(path), name = env.path.basename(path);
    if (!name.includes('*')) return env.fs.existsSync(path) && env.fs.statSync(path).isFile() ? [path] : [];
    const pattern = new RegExp(`^${name.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    return (env.fs.existsSync(dir) ? env.fs.readdirSync(dir) : []).filter(f => pattern.test(f) && (name.startsWith('.') || !f.startsWith('.')) && env.fs.statSync(env.path.join(dir, f)).isFile()).sort().map(f => env.path.join(dir, f));
  }
  // (the file the text at `at` is in)
  path_of(at: number, files?: FileStore): string {
    for (let k = 0; k < Atomics.load(this.i32, FILES_N >> 2); k++) { const entry = this.w(FILES) + 12 * k; if (this.w(entry) <= at && at <= this.w(entry + 4)) { const id = this.w(entry + 8); return id >= 0 ? (files ?? this.files_)!.getPath(id) : this.named_[-id - 1]; } }
    return '';
  }
  // (on this thread: each asked for, read and settled; `given` read with `only` first, when it says so (another document's
  // tests, not the language's))
  private handled = 0;
  included(given: [string, Uint8Array][] = [], only = false, texts?: Map<string, string>): Map<string, [number, number]> {
    const done = new Set<string>(), spans = new Map<string, [number, number]>();
    for (;;) {
      const asked = Ray.requests(this.heap, this.handled);
      if (!asked.length) return spans;
      for (const { kind, text, at, scope } of asked) {
        this.handled++;
        if (this.debugging === 'settle') say(`${ansi.green}ASKED${ansi.reset} ${kind === 1 ? 'include' : 'read'} ${text} ${ansi.darkGray}(${this.where(at)})${ansi.reset}`);
        if (text === 'given' && only) this.untested();
        // (a file open in an editor: as it is there, not as it is on disk)
        const list: [string, Uint8Array][] = text === 'given' ? given : Ray.located(text, this.path_of(at)).map(p => [p, texts?.has(p) ? new TextEncoder().encode(texts.get(p)!) : env.fs.readFileSync(p)]);
        for (const [path, bytes] of list) if (!done.has(path)) { done.add(path); spans.set(path, this.file(bytes, path, kind, scope)); }
        this.x.settle(this.t, 0);
        for (const at of [PHASE, NEXT, DONE, ANY]) this.set(at, 0);
      }
    }
  }
  // What was put off until everything was read (the tests): this thread takes them while there are any.
  tests() { this.x.tests(this.t); }
  // (a file read on its own, after the rest: settled as an include is)
  alone(bytes: Uint8Array, path: string): [number, number] {
    const span = this.file(bytes, path);
    this.x.settle(this.t, 0);
    for (const at of [PHASE, NEXT, DONE, ANY]) this.set(at, 0);
    return span;
  }
  // (built: the bodies of the rules read, before what was put off)
  prepared() { this.x.prepared(this.t); }
  // (built: the rules made while the files were read whose bodies are read, in the order made)
  bodied(): number[] {
    const out: number[] = [], list = this.w(256), n = Math.min(this.w(260), this.w(264));
    for (let k = 0; k < n; k++) { const r = this.w(list + 4 * k); if (this.w(r + R.KIND) === 0 && this.w(r + R.BODY_) && !(this.w(r + R.FLAGS) & 8)) out.push(r); }
    return out;
  }
  // (what was put off, not run: another document's tests)
  untested() { Atomics.store(this.i32, AFTER_HEAD >> 2, Atomics.load(this.i32, AFTER_TAIL >> 2)); }

  // (too deep: the rules that went round, each its head and where it was applied)
  private deep(c: number): string {
    if (!c) return `rules applied 2000 deep (what this reads reads itself)`;
    const n = this.w(c), period = this.w(c + 4), into = this.w(c + 8), depth = this.w(c + 12), one = (i: number) => {
      const q = c + 16 + 16 * i, a = this.w(q), z = this.w(q + 4), s = this.w(q + 8);
      const head = a ? `\`${this.text(a, z).trim().replace(/\s+/g, ' ').slice(0, 60)}\`` : 'a block';
      return `${head} at ${this.where(s)}${s ? ` on \`${this.text(s, s + 40).split('\n')[0].trim()}\`` : ''}`;
    };
    if (period) {
      const steps = Array.from({ length: Math.min(n, 24) }, (_, i) => one(i)); if (n > 24) steps.push(`… (${n - 24} more)`);
      return `rules applied ${depth} deep, going round ${period === 1 ? 'one rule' : `${period} rules`}:${into ? `\n    (entered by ${one(n)})` : ''}\n    ${steps.join('\n  → ')}\n  → (again)`;
    }
    const most = Array.from({ length: n }, (_, i) => i).filter(i => this.w(c + 16 + 16 * i + 12)).sort((x, y) => this.w(c + 16 + 16 * y + 12) - this.w(c + 16 + 16 * x + 12));
    return `rules applied ${depth} deep, no rules going round; the most applied on the way down:\n    ${most.slice(0, 10).map(i => `${this.w(c + 16 + 16 * i + 12)}× ${one(i)}`).join('\n    ')}`;
  }
  // What the kernel says, as it says it: printed (the command line), or kept for who asks (the editor), once each place and
  // message. Counted where every thread counts: errors and warnings (the header's 336, 340), passes (the kernel's own).
  static printing = true;
  private styled: [number, string] | undefined;
  listen(): [number, string, string?][] {
    if (this.w(108) && !this.heard.has('oom')) { this.heard.add('oom'); this.emit(0, `out of memory (${this.u8.length} bytes): what is said after this may be garbage`); }
    return this.said;
  }
  tell(said_at: number, kind: number, a: number, c: number) {
    // (about text the reader made, in a test: said where the test is)
    const t = this.t, test = this.w(t + 20) && this.w(t + 100) ? this.w(this.w(t + 100) + 40) : 0;
    const made = this.where(said_at).startsWith('(made'), at = made && test ? test : said_at;
    const text = (s: number, e: number) => this.text(s, e).trim();
    if (kind === L.STYLED) { const style = this.member(a, 'style'); if (style) this.styled = [at, this.text(this.w(style + 12), this.w(style + 16)).trim()]; return; }
    if (kind === L.DEFINED) { if (kwargs.debug) say(`${ansi.darkGray}DEFINED ${text(a, c)} (${this.where(a)})${ansi.reset}`); return; }
    if (kind === L.PASSED) return this.emit(at, this.snippet(a, c, 100), 'pass');
    if (kind === L.OUTPUT) { const out = this.text(a, c); if (env.nodejs) process.stdout.write(out); else console.log(out); return; }
    const message = kind === L.UNREAD ? `nothing reads \`${text(a, c)}\`` : kind === L.UNLABELLED ? `nothing is labelled \`${text(a, a + c)}\`` : kind === L.BUDGET ? `ran past ${Ray.BUDGET} rules (reading this)`
      : kind === L.OOM ? `out of memory (${this.u8.length} bytes)` : kind === L.REPORT ? (a ? text(a, c) : 'error') : kind === L.CYCLE ? 'what this is read as needs itself'
      : kind === L.NOT_ON ? `nothing in what it is read on reads \`${text(a, c)}\`` : kind === L.EXTERNAL ? `\`external ${text(a, c)}\` is no external` : kind === L.DEEP ? this.deep(a) : kind === L.VALUED ? `a left side answers a value, not a place: \`${text(a, c)}\` (a name in it is a value there: a hole of the rule reading it?)` : kind === L.FULL ? `stopped: almost all the memory there is is in use (what the threads' tests took): this test was not given more` : kind === L.MEMORY ? `took more than ${test ? 32 : 320} MB of new memory ${test ? 'in this test' : 'reading this'} (what it reads makes more and more): stopped` : kind === L.SILENT ? `this test failed and nothing said why (the kernel stopped it without saying what it could not read)` : kind === L.HELD ? `a test put off 4096 tests (each putting off more: a class whose block makes one of it, or a test in what a test makes)` : undefined;
    if (message === undefined) return;
    const style = this.styled && this.styled[0] === at ? this.styled[1] : undefined; this.styled = undefined;
    this.emit(at, message, style);
  }
  emit(at: number, message: string, style?: string) {
    const said = Ray.saying(this, at, message, style); if (said === undefined) return;
    const key = style === 'pass' ? `pass:${at}` : this.where(at).startsWith('(made') ? `made:${message}` : `${at}:${message}`;
    if (this.heard.has(key)) return; this.heard.add(key);
    if (!Ray.printing) { this.said.push([at, message, style]); return; }
    if (style !== 'pass') Atomics.add(this.i32, (style === 'warn' || style === 'info' || style === 'debug' ? 340 : 336) >> 2, 1);
    say(said);
    // (said while the files are read, kept with what was read: said again when that is taken from disk)
    if (!Atomics.load(this.i32, 356 >> 2) && process.env.RAY_SAID_DIR) env.fs.appendFileSync(env.path.join(process.env.RAY_SAID_DIR, `said-${Atomics.load(this.i32, 360 >> 2)}.txt`), said + '\n');
  }
  static saying(ray: Ray, at: number, message: string, style?: string): string | undefined {
    if (style === 'pass') return `${ansi.green}PASS${ansi.reset}    ${ray.where(at)}: ${ansi.green}${message}${ansi.reset}`;
    const warning = style === 'warn' || style === 'info' || style === 'debug';
    return `${warning ? `${ansi.orange}WARNING${ansi.reset}` : `${ansi.indianRed}ERROR${ansi.reset}  `} ${ray.where(at)}: ${message}`;
  }
  // (once each place and message; one about a copy the reader made (no place in a file), once each message)
  say(at: number, message: string) { this.emit(at, message); }

  // What a name answers, read where everything is: a list of numbers (a Ray: `head`, each link's `value` and `next`), each a
  // successor chain (`next` until none), as bytes.
  bytes_of(name: string): Uint8Array {
    // (this thread's allowance: what a written module needs, more than a statement's (RAY_WRITE_BUDGET))
    const budget = Number(process.env.RAY_WRITE_BUDGET || 100000000); this.set(this.t + 24, budget); this.set(this.t + 340, budget);
    const [s, e] = this.string(name), global = this.w(GLOBAL), top = this.x.frame(0, 0, global, s, e, 0, 0, global, global);
    const list = this.x.ev(this.t, this.x.reading(this.t, s, e, 0, 0, this.w(global), global, 0, 0, 0, 0), top, top, global, 1, global, global);
    const none = this.w(236), out: number[] = []; // (the kernel's nothing, `None`)
    const number = (n: number) => { let k = 0; for (let m = this.member(n, 'next'); m && m !== none && k < 1 << 20; m = this.member(m, 'next')) k++; return k; };
    for (let at = list ? this.member(list, 'head') : 0, i = 0; at && at !== none && i < 1 << 24; at = this.member(at, 'next'), i++) out.push(number(this.member(at, 'value')) & 255);
    return Uint8Array.from(out);
  }
  // What a node holds under a name.
  member(node: number, name: string): number { const [s, e] = this.string(name); return node ? this.x.member(this.t, node, s, e - s) : 0; }
  // The language's theme: what `Theme.current` is (a name, and each style what it is shown as: another style, or a colour).
  theme(): { name: string, colors: Record<string, string> } | undefined {
    const [s, e] = this.string('Theme.current'), global = this.w(GLOBAL), top = this.x.frame(0, 0, global, s, e, 0, 0, global, global);
    const current = this.x.ev(this.t, this.x.reading(this.t, s, e, 0, 0, this.w(global), global, 0, 0, 0, 0), top, top, global, 1, global, global), text = (v: number) => v ? this.text(this.w(v + N.A), this.w(v + N.B)).trim() : '';
    if (!current || this.w(current + N.IS) !== Is.NODE) return;
    const colors: Record<string, string> = {};
    for (let at = this.member(this.member(current, 'styles'), 'head'), n = 0; at && n < 10000; at = this.member(at, 'next'), n++) {
      const entry = this.member(at, 'value');
      if (!entry || this.w(entry + N.IS) !== Is.FRAME) break;
      const [style, shown] = [0, 1].map(i => { const t = entry + F.TAKES + TAKE * i; return this.text(this.w(t), this.w(t + 4)).trim(); });
      colors[style] = shown;
    }
    return { name: text(this.member(current, 'name')) || 'theme', colors };
  }
  // The applications the kernel made (of rules), in the order made.
  get frames(): number[] { const n = Math.min(Atomics.load(this.i32, LIST_N >> 2), this.w(LIST_CAP)), list = this.w(LIST); return Array.from({ length: n }, (_, i) => this.w(list + 4 * i)).filter(f => f); }
  // What is painted: each statement's literal text in its rule's style, each hole's take in the hole's, a frame given a style
  // (`& ^style`), all of it.
  paints(s: number, e: number): { begin: number, end: number, style: string }[] {
    const out: { begin: number, end: number, style: string }[] = [], style = (node: number) => { const v = node ? this.member(node, 'style') : 0; return v ? this.text(this.w(v + N.A), this.w(v + N.B)).trim() : ''; };
    const part = (rule: number, hole: number) => { for (let k = 0, q = rule + R.PART; k < this.w(rule + R.PARTS); k++, q += PART) if ((this.w(q) & 15) === Part.HOLE && this.w(q + 12) === hole) return q; return 0; };
    for (const frame of this.frames) {
      const [fs, fe] = [this.w(frame + F.START), this.w(frame + F.END)], rule = this.w(frame + F.RULE);
      if (fs < s || fe > e || !rule) continue;
      const whole = style(frame), head = style(this.w(rule + R.HEAD)), takes = Array.from({ length: this.w(rule + R.HOLES) }, (_, i) => frame + F.TAKES + TAKE * i);
      if (whole) out.push({ begin: fs - s, end: fe - 1 - s, style: whole });
      if (head) for (let at = fs; at < fe; at++) { const inside = takes.some(t => this.w(t) <= at && at < this.w(t + 4)); if (!inside && this.u8[at] > 32) out.push({ begin: at - s, end: at - s, style: head }); }
      takes.forEach((t, i) => { const q = part(rule, i), hole = q ? style(this.w(q + 20)) : ''; if (hole && this.w(t) >= s && this.w(t + 4) <= e) out.push({ begin: this.w(t) - s, end: this.w(t + 4) - 1 - s, style: hole }); });
    }
    return out;
  }

  // ---- Debugging: `--debug` (or RAY_DEBUG=1). What the kernel is doing, kept as a stack: on a crash, out of memory, or a
  // runaway, it is said, innermost first. `--debug=trace`: each step said as it is taken (`--debug=trace:<file:line>`: within
  // the statement or test there); `--debug=cost`: each statement that takes long or much memory. (Without it, the kernel is compiled without any of this.)
  get debugging(): string | false {
    const d = kwargs.debug ?? (env.nodejs ? process.env.RAY_DEBUG : undefined);
    return d === undefined || d === '0' || d === false ? false : d === true || d === '1' ? 'on' : String(d);
  }
  private stack: [kind: number, a: number, b: number, c: number, heap: number, time: number, applied: number][] = [];
  static readonly COST_MS = Number(typeof process !== 'undefined' && process.env.RAY_COST_MS || 20); static readonly COST_MB = Number(typeof process !== 'undefined' && process.env.RAY_COST_MB || 4);
  static readonly DEBUG_DEPTH = 12000; static readonly DEBUG_SAID = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_SAID || 20); private said_n = 0; private faults = new Map<string, number>();
  private traced_from = -1; private steps = 0; private testing_n = 0;
  // (a runaway, `--debug`: the last steps begun (what kind, where, how deep), and when the same few of them go round again and
  // again (at one depth, a loop; deeper each round, a recursion), for long, it is said what goes round and the run stopped
  // (`RAY_DEBUG_LOOP=n`: after n steps of it, 2000000; `RAY_DEBUG_LOOPS=go`: said, not stopped))
  static readonly RING = 1 << 14; static readonly LOOP_STEPS = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_LOOP || 2000000);
  static readonly LOOPS_GO = typeof process !== 'undefined' && process.env.RAY_DEBUG_LOOPS === 'go';
  private ring = new Int32Array(5 * Ray.RING); private ring_n = 0; private cycle = { period: 0, depth: 0, key: 0, since: 0 }; private said_loops = new Set<string>();
  // (one statement read again and again, or one test run again and again, each within its budget: what is read again (what
  // none read, when its scope gains a rule, without end), said at RAY_DEBUG_AGAIN times (200), and stopped)
  static readonly AGAIN = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_AGAIN || 200);
  private again = new Map<number, number>();
  private remember(kind: number, a: number, b: number, c: number) {
    if (!this.stack.length && (kind === Debug.STATEMENT || kind === Debug.TEST)) {
      const k = kind * 0x10000000 + a, n = (this.again.get(k) ?? 0) + 1; this.again.set(k, n);
      if (n === Ray.AGAIN || (Ray.LOOPS_GO && n > Ray.AGAIN && String(n).replace(/0/g, '') === '1')) {
        const message = `this ${kind === Debug.TEST ? 'test was run' : 'statement was read'} ${n} times (RAY_DEBUG_AGAIN): ${this.step(kind, a, b, c)}`;
        if (Ray.LOOPS_GO) say(`${ansi.indianRed}LOOP${ansi.reset} ${message}`); else throw new RangeError(`went round without end: ${message}`);
      }
    }
    const k = 5 * (this.ring_n & (Ray.RING - 1));
    this.ring[k] = kind; this.ring[k + 1] = a; this.ring[k + 2] = b; this.ring[k + 3] = c; this.ring[k + 4] = this.stack.length;
    if ((++this.ring_n & 4095) === 0) this.cycled();
    this.progress(kind, a, b, c);
  }
  // (no progress, in general: within one statement or test, a window of steps (RAY_DEBUG_WINDOW, 1000000) that reads nothing
  // it had not read in the windows before it, window after window: it goes round what it read (a loop not quite the same
  // each round, a recursion cut short and begun again). Said with what it reads most, then stopped (or, `go`, said once).)
  static readonly WINDOW = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_WINDOW || 1000000);
  static readonly STATEMENT_STEPS = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_STATEMENT || 20000000);
  private top = -1; private top_steps = 0; private visited = new Map<number, number>(); private hot = new Map<number, number[]>(); private window_new = 0; private stale = 0;
  private progress(kind: number, a: number, b: number, c: number) {
    const top = this.stack.length ? this.stack[0][1] * 16 + this.stack[0][0] : -1;
    if (top !== this.top) { this.top = top; this.top_steps = 0; this.visited.clear(); this.hot.clear(); this.window_new = 0; this.stale = 0; }
    const key = (Math.imul(kind, 0x9E3779B1) ^ Math.imul(a, 0x85EBCA77) ^ Math.imul(b, 0xC2B2AE3D)) | 0;
    if (!this.visited.has(key)) { this.visited.set(key, this.top_steps); this.window_new++; }
    { const h = kind * 0x10000000 + a, o = this.hot.get(h); if (o) o[0]++; else this.hot.set(h, [1, kind, a, b, c]); }
    if (++this.top_steps % Ray.WINDOW) return;
    // (a window that read nothing new; three in a row (the first to settle, two to be sure): going round. Or, whatever it
    // reads, one statement past RAY_DEBUG_STATEMENT steps (20000000): too long for one)
    const long = this.top_steps >= Ray.STATEMENT_STEPS;
    if (this.window_new === 0) this.stale++; else this.stale = 0;
    this.window_new = 0;
    if (this.stale < 3 && !long) { this.hot.clear(); return; }
    const most = [...this.hot.values()].sort((x, y) => y[0] - x[0]).slice(0, 16).map(([n, k, x, y, z]) => `  ${String(n).padStart(8)}× ${this.step(k, x, y, z)}`);
    const what = `${this.top_steps} steps into this ${this.stack[0]?.[0] === Debug.TEST ? 'test' : 'statement'}, ${this.stale >= 3 ? `the last ${2 * Ray.WINDOW} reading nothing it had not read (${this.visited.size} places, all read before)` : `past ${Ray.STATEMENT_STEPS} (RAY_DEBUG_STATEMENT), still reading new places (${this.visited.size} so far)`}; read most in the last ${Ray.WINDOW}:\n${most.join('\n')}`;
    this.stale = 0; this.hot.clear();
    if (Ray.LOOPS_GO) { const said = String(this.top); if (!this.said_loops.has(said)) { this.said_loops.add(said); say(`${ansi.indianRed}LOOP${ansi.reset} going round, ${what}\n${this.crashed(new Error('going round'), false)}`); } return; }
    throw new RangeError(`went round without end: ${what}\n`);
  }
  // (the steps of the last 8192 begun: the shortest round that all of them repeat, with what it is deeper each round)
  private cycled() {
    const n = this.ring_n, W = 8192, M = Ray.RING - 1, r = this.ring, at = (i: number) => 5 * (i & M);
    if (n < W) return;
    let period = 0, depth = 0;
    for (let p = 1; p <= 2048 && !period; p++) {
      const d = r[at(n - 1) + 4] - r[at(n - 1 - p) + 4];
      let ok = true;
      for (let i = n - W + p; i < n && ok; i++) { const x = at(i), y = at(i - p); if (r[x] !== r[y] || r[x + 1] !== r[y + 1] || r[x + 2] !== r[y + 2] || r[x + 4] - r[y + 4] !== d) ok = false; }
      if (ok) { period = p; depth = d; }
    }
    if (!period) { this.cycle.period = 0; return; }
    // (the same round as before, at its least place: how long it has gone round)
    let key = 0; for (let i = n - period; i < n; i++) key = (Math.imul(key, 31) + r[at(i) + 1] * 7 + r[at(i)]) | 0;
    let least = 0x7FFFFFFF; for (let i = n - period; i < n; i++) least = Math.min(least, r[at(i) + 1]); key ^= least;
    if (this.cycle.period !== period || this.cycle.key !== key || this.cycle.depth !== depth) { this.cycle = { period, depth, key, since: n - W }; return; }
    const long = n - this.cycle.since;
    if (long < Ray.LOOP_STEPS) return;
    const steps: string[] = [], seen = new Set<string>();
    for (let i = n - period; i < n; i++) { const x = at(i), line = `${this.indent(r[x + 4] - r[at(n - period) + 4])}${this.step(r[x], r[x + 1], r[x + 2], r[x + 3])}`; if (!seen.has(line)) { seen.add(line); steps.push(line); } if (steps.length >= 24) { steps.push('  …'); break; } }
    const what = `${depth > 0 ? `a recursion: ${period} steps going ${depth} deeper each round` : depth < 0 ? `${period} steps going ${-depth} out each round` : `a loop: the same ${period} steps`}, ${long} steps of them so far (RAY_DEBUG_LOOP=${Ray.LOOP_STEPS})`;
    const said = `${period}:${key}`;
    this.cycle.since = n;
    if (Ray.LOOPS_GO) { if (!this.said_loops.has(said)) { this.said_loops.add(said); say(`${ansi.indianRed}LOOP${ansi.reset} ${what}; round:\n${steps.join('\n')}\n${this.crashed(new Error('going round'), false)}`); } return; }
    throw new RangeError(`went round without end, ${what}; what goes round:\n${steps.join('\n')}\n`);
  }
  // (`RAY_DEBUG_STEPS=n`: a run that has not ended after n steps (a runaway that no budget catches) says where it is, as a crash)
  static readonly IC_STATS = typeof process !== 'undefined' && !!process.env.RAY_IC; static ic = new Map<string, string>(); static ic_same = 0; static ic_differ = 0; static ic_all = 0; static ic_said = false; static ic_d = new Map<string, number>();
  static readonly PROFILE = typeof process !== 'undefined' && !!process.env.RAY_PROFILE; static profiled = new Map<number, number>(); static profile_said = false; static profile_n = 0;
  static readonly DEBUG_STEPS = Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_STEPS || 0);
  debugged(kind: number, a: number, b: number, c: number): number {
    const heap = this.w(HEAP);
    if (Ray.DEBUG_STEPS && kind % 2 === 1 && ++this.steps > Ray.DEBUG_STEPS) { this.steps = -1e15; throw new RangeError(`ran past ${Ray.DEBUG_STEPS} steps (RAY_DEBUG_STEPS)`); }
    // (read at last, when what it is in gained a rule: `--debug=settle`, said, with how many are left unread there)
    if (kind === Debug.SETTLED) { if (this.debugging === 'settle') say(`${ansi.green}SETTLED${ansi.reset} ${this.where(a)} ${this.snippet(a, b)} ${ansi.darkGray}(${c} left there)${ansi.reset}`); return 0; }
    // (one of the kernel's own loops gone round past its limit without ending: which one, and what was being read)
    if (kind === Debug.LOOP) {
      const loop = Ray.program(1).loops[a] ?? `loop ${a}`, message = `the kernel's loop went round ${b} times without ending, ${loop}`;
      // (the loops a thread waits in for the others (the next test, the next phase): as long as what they run, not endless)
      if (/^(tests|settle): for \( ; ; \)/.test(loop)) return 0;
      if (Ray.LOOPS_GO) { say(this.crashed(new Error(message), false).replace('FAULT', 'LOOP')); return 0; }
      throw new RangeError(message);
    }
    // (`RAY_ONLY=<text>[,<text>…]` with --debug: only the tests whose place or text holds one of them run)
    if (kind === Debug.TEST && process.env.RAY_ONLY) { let z = b; while (z < this.u8.length && this.u8[z] !== 10 && this.u8[z] !== 0) z++; const named = `${this.where(a)} ${this.snippet(a, z, 400)}`; if (this.snippet(a, z, 400).startsWith('assert') && !process.env.RAY_ONLY.split(',').some(x => named.includes(x))) return 1; }
    if (kind % 2 === 1) this.remember(kind, a, b, c);
    // (`RAY_PROFILE=1` with --debug: rules applied, counted by rule, said at the end)
    // (with RAY_ONLY, what the tests it names apply only)
    if (kind === Debug.TEST) this.testing_n = (this.testing_n ?? 0) + 1; else if (kind === Debug.TEST_END) this.testing_n = (this.testing_n ?? 1) - 1;
    if (Ray.PROFILE && kind === Debug.APPLY && (!process.env.RAY_ONLY || this.testing_n)) { const m = Ray.profiled, key = process.env.RAY_PROFILE === 'at' ? -1 - a : c; m.set(key, (m.get(key) ?? 0) + 1); if (process.env.RAY_PROFILE_N && ++Ray.profile_n === Number(process.env.RAY_PROFILE_N)) process.exit(124); if (!Ray.profile_said) { Ray.profile_said = true; process.on('SIGTERM', () => process.exit(124)); setTimeout(() => process.exit(124), 1000 * Number(process.env.RAY_PROFILE_AT ?? 25)).unref(); process.on('exit', () => { const rows = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40), all = [...m.values()].reduce((x, y) => x + y, 0); env.fs.writeSync(2, `\n` + `PROFILE ${all} applications`); for (const [r, n] of rows) { if (r < 0) { env.fs.writeSync(2, `\n` + `PROFILE ${String(n).padStart(8)} ${(100 * n / all).toFixed(1).padStart(5)}% ${this.where(-1 - r)} ${this.snippet(-1 - r, -1 - r + 60, 60)}`); continue; } const hd = this.w(r + 32); env.fs.writeSync(2, `\n` + `PROFILE ${String(n).padStart(8)} ${(100 * n / all).toFixed(1).padStart(5)}% ${hd ? this.snippet(this.w(hd + 12), this.w(hd + 16), 50) : '?'} (${this.where(hd ? this.w(hd + 12) : this.w(r + 16))})`); } }); } }
    // (`--debug=tests`: each test said as it begins)
    if (kind === Debug.SAID && this.debugging === 'tests') say(`${ansi.indianRed}SAID${ansi.reset} ${a} ${this.where(b)} ${this.snippet(b, c, 60)}`);
    // (the test as written, its comment after it too: what names it)
    if (kind === Debug.RESULT && this.debugging === 'tests') { let z = b; while (z < this.u8.length && this.u8[z] !== 10 && this.u8[z] !== 0) z++; say(`${c ? ansi.indianRed + 'FAILED' : ansi.green + 'PASSED'}${ansi.reset} ${this.where(a)} ${this.snippet(a, z, 60)}`); return; }
    if (kind === Debug.RESULT) return;
    // (`RAY_WATCH=<address>` with --debug: what is there when a test lets go of it, and which test)
    if (kind === Debug.FREE) { const at = Number(process.env.RAY_WATCH ?? 0); if (at && at >= a && at < b) say(`${ansi.indianRed}LET GO${ansi.reset} ${this.node_of(at)}${this.w(at + 8) === 5 ? ` (a frame: \`${this.snippet(this.w(at + 40), this.w(at + 44), 60)}\`)` : ''}, parent ${this.node_of(this.w(at + 20))}, made of ${this.node_of(this.w(at + 24))}, by the test in ${this.node_of(c)} \`${this.snippet(this.w(c + 40), this.w(c + 44), 60)}\``); return 0; }
    if (kind === Debug.TEST && this.debugging === 'tests') say(`${ansi.green}TEST${ansi.reset} ${this.where(a)} ${this.snippet(a, b, 60)}`);
    // (`--debug=trace:<where>`: said step by step only within the statement or test read at that place, `Number.ray:211:3`)
    let mode = this.debugging;
    if (typeof mode === 'string' && mode.startsWith('trace:')) {
      if (this.traced_from < 0 && (kind === Debug.STATEMENT || kind === Debug.TEST) && this.where(a).endsWith(mode.slice(6))) this.traced_from = this.stack.length;
      mode = this.traced_from >= 0 ? 'trace' : 'on';
    }
    if (kind === Debug.OOM) throw new RangeError(`out of memory: ${a} bytes wanted, ${(heap / 1048576).toFixed(0)} MB in use`);
    // (a fault (too deep, too long): what it was doing, said once, and it goes on)
    // (`RAY_BODY=<text>` with --debug: a body read into steps, holding that text, said as it is)
    if (kind === Debug.FAULT && a === 1090) { if (process.env.RAY_BODY && new TextDecoder().decode(this.u8.slice(b, c)).includes(process.env.RAY_BODY)) say(`BODY ${JSON.stringify(new TextDecoder().decode(this.u8.slice(b, c)))}`); return 0; }
    if (kind === Debug.FAULT && (a === 85 || a === 84)) { say(`  ${a === 85 ? 'kept ' : 'fresh'} rule ${this.where(b)} ${this.snippet(b, c)}`); return 0; }
    // (`RAY_DEEP=1`: all of the way down to where it went too deep, each rule (or block), where it was applied; a run of the same
    // ones again said once, how many times)
    // (`RAY_SAYSTACK=<text>`: what is said with that text in it, the rules applied down to where it is said)
    if (kind === Debug.FAULT && a === 1098) { if (process.env.RAY_RUNAWAY) { const st = this.w(this.t + 480); say(`RUNAWAY ${b} deep:`); let last = ''; for (let d = 0; d < b && d < 6000; d++) { const r = this.w(st + 8 * d), at = this.w(st + 8 * d + 4), hd = r ? this.w(r + 76) : 0; const row = `${hd ? this.text(this.w(hd + 12), Math.min(this.w(hd + 16), this.w(hd + 12) + 50)).trim().replace(/\s+/g, ' ') : 'block'} ${at > 0 && at < this.u8.length ? this.where(at) + ' ' + this.text(at, at + 40).split('\n')[0].trim() : ''}`; if (row !== last) say(`RUNAWAY ${String(d).padStart(4)} ${row}`); last = row; } } return 0; }
    if (kind === Debug.FAULT && a === 1097) { if (process.env.RAY_NAMING) { say(`NAMING ${this.where(b)} ${this.snippet(b, b + 60, 50)} not read by ${this.head_of(c)}`); const st = this.w(this.t + 480), depth = this.w(this.t + 76); for (let d = Math.max(0, depth - 25); d < depth; d++) { const r = this.w(st + 8 * d), at = this.w(st + 8 * d + 4), hd = r ? this.w(r + 76) : 0; say(`NAMING   ${d} ${hd ? this.text(this.w(hd + 12), Math.min(this.w(hd + 16), this.w(hd + 12) + 60)).trim().replace(/\s+/g, ' ') : 'block'} ${at > 0 && at < this.u8.length ? this.where(at) : ''}`); } } return 0; }
    if (kind === Debug.FAULT && a === 1096) { say(`${ansi.orange}MEMORY${ansi.reset} a statement took ${c} MB: ${this.where(b)} ${this.snippet(b, b + 80, 60)}`); return 0; }
    if (kind === Debug.FAULT && a === 1094) { say(`${ansi.orange}MEMORY${ansi.reset} a test held ${c} MB: ${this.where(b)} ${this.snippet(b, b + 80, 60)}`); return 0; }
    if (kind === Debug.FAULT && a === 1093) { const m = (Ray as any).kept_by ??= new Map<number, number>(); m.set(b, (m.get(b) ?? 0) + c); if (!(Ray as any).kept_said) { (Ray as any).kept_said = true; process.on('exit', () => env.fs.writeSync(2, `\nKEPT ${[...m].map(([k, v]) => `${['', 'new chunk', 'said text', 'reading kept', 'test pages', 'of them big', 'of them one chunk', 'asked with none free', 'asked with some free (none fit)', 'readings without one (count)', 'refusable applied (count)', 'refused (count)', 'by readings without one'][k]} ${k >= 9 ? v : (v / 1048576).toFixed(1) + ' MB'}`).join(', ')}\n`)); } return 0; }
    if (kind === Debug.FAULT && a === 1092) { say(`${ansi.indianRed}FAULT${ansi.reset} a file's own rules on node ${b} no longer reach where they began (top ${c}): not put back`); return 0; }
    if (kind === Debug.FAULT && a === 1102 && process.env.RAY_JSSTACK) say(String(new Error('js stack').stack).split('\n').slice(0, 30).join('\n'));
    if (kind === Debug.FAULT && a === 1113) { if (process.env.RAY_MEMBERS) say(`MEMBER \`${this.text(b, c)}\` at ${this.where(b)}`); return 0; }
    if (kind === Debug.FAULT && a === 1112) { if (process.env.RAY_WORDS) say(`WORDS \`${this.text(b, c)}\` at ${this.where(b)}`); return 0; }
    if (kind === Debug.FAULT && a === 1111) { if (process.env.RAY_NOTON) say(`NOTON \`${this.text(b, c)}\` at ${this.where(b)}`); return 0; }
    if (kind === Debug.FAULT && a === 1109) { if (process.env.RAY_LAMBDA) say(`LAMBDA \`${this.text(b, c)}\` at ${this.where(b)}: ${this.text(b, b + 60).split('\n')[0]}`); return 0; }
    if (kind === Debug.FAULT && a === 1108) { if (process.env.RAY_ALLOCS) { const m = (Ray as any).allocs ??= new Map<number, number>(); m.set(b, (m.get(b) ?? 0) + 1); if (!(Ray as any).allocs_said) { (Ray as any).allocs_said = true; process.on('exit', () => { const rows = [...m.entries()].sort((x, y) => y[0] * y[1] - x[0] * x[1]).slice(0, 25), all = [...m.entries()].reduce((z, [k, v]) => z + k * v, 0); env.fs.writeSync(2, `\nALLOCS ${(all / 1048576).toFixed(1)} MB in tests`); for (const [k, v] of rows) env.fs.writeSync(2, `\nALLOCS ${String(k).padStart(8)} bytes × ${String(v).padStart(9)} = ${(k * v / 1048576).toFixed(1).padStart(7)} MB`); }); } } return 0; }
    if (kind === Debug.FAULT && a === 1107) { const want = process.env.RAY_PLACE; if (want && this.text(b, c).trim() === want) { const st = this.w(this.t + 480), n = this.w(this.t + 76); say(`PLACE \`${want}\` made at ${this.where(b)} ${n} deep:`); for (let d = 0; d < n && d < 60; d++) { const at = this.w(st + 8 * d + 4); say(`PLACE ${String(d).padStart(4)} ${at > 0 && at < this.u8.length ? this.where(at) + ' ' + this.text(at, at + 60).split('\n')[0].trim() : ''}`); } } return 0; }
    if (kind === Debug.FAULT && a === 1091) { const want = process.env.RAY_SAYSTACK; if (want && this.text(b, b + 80).includes(want)) { const st = this.w(this.t + 480); say(`SAYSTACK ${this.where(b)} ${c} deep:`); for (let d = 0; d < c && d < 6000; d++) { const r = this.w(st + 8 * d), at = this.w(st + 8 * d + 4), hd = r ? this.w(r + 76) : 0; const ok = (x: number) => x > 0 && x < this.u8.length; say(`SAYSTACK ${String(d).padStart(4)} ${hd && ok(this.w(hd + 12)) ? '`' + this.text(this.w(hd + 12), Math.min(this.w(hd + 16), this.w(hd + 12) + 200)).trim().replace(/\s+/g, ' ').slice(0, 50) + '`' : 'block'} ${ok(at) ? this.where(at) + ' ' + this.text(at, at + 50).split('\n')[0].trim() : ''}`); } } return 0; }
    if (kind === Debug.FAULT && a === 1089) { if (process.env.RAY_DEEP) { const n = this.w(b), rows: string[] = []; for (let d = 0; d < n; d++) { const q = b + 4 + 12 * d, x = this.w(q), z = this.w(q + 4), at = this.w(q + 8); rows.push(`${x ? `\`${this.text(x, z).trim().replace(/\s+/g, ' ').slice(0, 50)}\`${process.env.RAY_DEEP === '2' ? ` (${this.where(x)})` : ''}` : 'block'} ${this.where(at)} ${at ? this.text(at, at + 50).split('\n')[0].trim() : ''}`); } let last = '', k = 0; say(`DEEP ${n}:`); for (const [i, row] of rows.entries()) { if (row === last) { k++; continue; } if (k) say(`DEEP   (×${k + 1})`); k = 0; last = row; say(`DEEP ${String(i).padStart(4)} ${row}`); } if (k) say(`DEEP   (×${k + 1})`); } return 0; }
    if (kind === Debug.FAULT && a === 82) { say(`  kinds kept ${Math.floor(b / 1000)} fresh ${b % 1000}, same rule ${c}`); return 0; }
    if (kind === Debug.FAULT && a === 83) { say(`    owner node ${Math.floor(b / 10)} kind ${b % 10}${c ? ' (the test\'s own)' : ''}`); return 0; }
    if (kind === Debug.FAULT && a === 79) { say(`MEMBER-RULE visited for \`${(Ray as any).chain_text ?? ''}\`: checks ${b.toString(2)} (1 kind, 2 skip, 4 want, 8 refuse, 16 mask, 32 lead, 64 match) ends at end${c >= 0 ? '+' : ''}${c}`); return 0; }
    if (kind === Debug.FAULT && (a === 81 || a === 80)) {
      if (a === 81) { (Ray as any).chain_text = this.snippet(b, c, 40); return 0; }
      const owners: string[] = []; let x = b, n = 0, found = 0, last = -1;
      while (x && x !== c && n < 20000) { const o = this.w(x + 40), hd = this.w(x + 32); if (o !== last) { owners.push(`${o}${o === this.w(GLOBAL) ? '(global)' : ''}`); last = o; } if (hd && this.snippet(this.w(hd + 12), this.w(hd + 16)) === '.{member}') found = 1; x = this.w(x); n++; }
      say(`CHAIN \`${(Ray as any).chain_text}\` from ${b}: ${n} rules, owners ${owners.slice(0, 12).join(' > ')}${owners.length > 12 ? ' …' : ''}, .{member} ${found ? 'seen' : 'NOT seen'}`);
      return 0;
    }
    if (kind === Debug.FAULT) {
      // (the same fault again, where it was: counted, said again at powers of ten)
      const key = `${a}:${b}:${c}:${this.stack.length}`, n = (this.faults.get(key) ?? 0) + 1; this.faults.set(key, n);
      if (n > 1 && String(n).replace(/0/g, '') !== '1') return 0;
      if (n > 1) { say(`${ansi.indianRed}FAULT${ansi.reset} the same, ${n} times: ${ansi.darkGray}${this.where(b)}${ansi.reset} ${this.snippet(b, c)}`); return 0; }
      if (!this.stack.length) { say(`${ansi.indianRed}FAULT${ansi.reset} ${a === L.DEEP ? 'rules applied too deep' : 'ran past its budget'}, applying ${ansi.darkGray}${this.where(b)}${ansi.reset} ${this.snippet(b, c)} (outside any step: reading what was put off, or a type)`); return 0; }
      say(this.crashed(new Error(a === L.DEEP ? 'rules applied too deep' : a === L.UNLABELLED ? `a value's reading jumped out of it, to \`${this.snippet(b, c)}\`` : a === 99 ? `a value read as nothing: \`${this.snippet(b, c)}\`` : a === 79 ? `a hole written with a type gave none: \`${this.snippet(b, c)}\`` : a === 78 ? `(its reading: kind ${b}, rule body at ${c ? this.where(c) : '-'})` : a === 98 ? `a type checked in its own check, 16 deep: \`${this.snippet(b, c)}\`` : a === 97 ? `a value needed while it is being read: \`${this.snippet(b, c)}\`` : a === 77 ? `a head that is a hole of the rule it is written in, read without that rule's holes (defined as the text it is): \`${this.snippet(b, c)}\`` : a === 95 ? `a rule a test made, read after the test let go of it, kept by: \`${this.snippet(b, c)}\`` : a === 94 ? `a test kept more than it can forget (the body of a rule made before it, read in it, kept): \`${this.snippet(b, c)}\`` : a === 91 ? `what a rule's body reads on a value as that rule, read with the rules before it, reads nothing: \`${this.snippet(b, c)}\`` : a === 93 ? `memory a test let go of, written after (at ${b}: ${c}), allocated again` : a === 88 ? `a reading kept for this text is not what reads it here: \`${this.snippet(b, c)}\`` : a === 85 ? `kept: \`${this.snippet(b, c)}\`` : a === 84 ? `fresh: \`${this.snippet(b, c)}\`` : a === 86 ? `a reading kept for this text is of another kind than the one reading it here: \`${this.snippet(b, c)}\`` : a === 90 ? `a test begun quiet (what said nothing while a type was checked did not end it): what it says is not said: \`${this.snippet(b, c)}\`` : a === 89 ? `CHECK written in ${this.node_of(b)} type ${this.node_of(c)}` : a === 87 ? `a value made of what is made of it (\`X &+= Y\`, Y already made of X): ${this.node_of(b)} not made of ${this.node_of(c)} (what it sees would go round)` : a === 1088 ? `what everything is in made of a value (\`X &+= Y\` with X the language's own scope): \`${this.snippet(b, c)}\`` : a === 1087 ? `what a reading sees goes round: the rules of ${this.node_of(b)} lead back to themselves (a chain of rules spliced into itself), from \`${this.w(c + 32) ? this.snippet(this.w(this.w(c + 32) + 12), this.w(this.w(c + 32) + 16), 60) : '?'}\`` : a === 1086 ? `what a reading sees goes round: the rules of ${this.node_of(b)} came back again (a node made of, or in, itself)` : a === 1103 ? `a name read in a frame that is not there: \`${this.snippet(b, c)}\` at ${this.where(b)}` : a === 1105 ? `(hole ${c} of a rule of ${this.w(b + 12)} holes, \`${this.w(b + 32) ? this.snippet(this.w(this.w(b + 32) + 12), this.w(this.w(b + 32) + 16), 60) : '?'}\` at ${this.w(b + 32) ? this.where(this.w(this.w(b + 32) + 12)) : '?'})` : a === 1104 ? `(at ${b} closures up; written in what a rule inlined: ${c})` : a === 1106 ? `superposed by \`${this.snippet(b, c)}\` at ${this.where(b)}` : a === 1102 ? `a hole's take whose frame is no frame (taken: \`${this.snippet(b, c)}\` at ${this.where(b)})` : a === 1101 ? `a closure that is no frame (${this.node_of(b)}), on from the rule at ${this.w(c + 32) ? this.where(this.w(this.w(c + 32) + 12)) : c} \`${this.w(c + 32) ? this.snippet(this.w(this.w(c + 32) + 12), this.w(this.w(c + 32) + 16), 60) : ''}\` (${c}, inlined ${this.where(this.w(c + 52))} \`${this.snippet(this.w(c + 52), this.w(c + 56), 60)}\`)` : a === 1100 ? `a rule a test let go of (${c}), read for the name of a hole from ${b}: ${this.node_of(b)}${this.w(b + 8) === 5 ? ` (a frame: \`${this.snippet(this.w(b + 40), this.w(b + 44), 60)}\`)` : ''}` : a === 92 ? `a node a test let go of (${c}), still seen from ${this.node_of(b)}${this.w(b + 8) === 5 ? ` (a frame: \`${this.snippet(this.w(b + 40), this.w(b + 44), 60)}\`)` : ''} (its ${this.w(b + 20) === c ? 'parent' : this.w(b + 24) === c ? 'made of' : 'next seen'}; its parent ${this.node_of(this.w(b + 20))}, made of ${this.node_of(this.w(b + 24))}, this ${this.w(b + 8) === 5 ? this.node_of(this.w(b + 36)) : '-'})` : a === 96 ? `a test's own memory kept by something made before it (let go of when the test is done): \`${this.snippet(b, c)}\`` : 'ran past its budget'), false)); return 0;
    }
    // (an error said: where it was being read, the first few)
    if (kind === Debug.SAID) { if (a === L.UNREAD && this.said_n++ < Ray.DEBUG_SAID) say(this.crashed(new Error(`nothing reads \`${this.snippet(b, c)}\``), false).replace('FAULT', 'SAID')); return 0; }
    // (a reading made, in a trace: the text, and what read it)
    if (kind >= 30 && kind <= 32) { if (Ray.IC_STATS) { const K = Ray as any; if (kind === 30) { K.kcur = [a, b, c]; } else if (kind === 31) K.kcur.push(a, b, c); else { K.kcur.push(a, b, c); const key = `${K.kcur[0]}:${K.kcur[1]}`, was = (K.klast ??= new Map()).get(key); if (was) { const names = ['s', 'e', 'at', 'names', 'sees', 'named_by', 'flags', 'stop', 'closure']; (K.kdiff ??= {}); let any = 0; for (let i = 2; i < 9; i++) if (was[i] !== K.kcur[i]) { K.kdiff[names[i]] = (K.kdiff[names[i]] ?? 0) + 1; any = 1; if (i === 4) { const pk = `${this.where(K.kcur[0])} \`${this.snippet(K.kcur[0], K.kcur[1], 40)}\``; (K.kplace ??= new Map()).set(pk, (K.kplace.get(pk) ?? 0) + 1); } } if (!any) K.ksame = (K.ksame ?? 0) + 1; K.kn = (K.kn ?? 0) + 1; } K.klast.set(key, K.kcur); if (!K.ksaid) { K.ksaid = 1; process.on('exit', () => { console.error(`KEYS repeated ${K.kn}, identical ${K.ksame}: ${JSON.stringify(K.kdiff)}`); for (const [k, n] of [...(K.kplace ?? new Map())].sort((x: any, y: any) => y[1] - x[1]).slice(0, 15)) console.error(`KSEES ${n} ${k}`); }); } } } return 0; }
    if (kind === Debug.READING && Ray.IC_STATS) { const head = (r: number) => { const hd = this.w(r + 32); return hd ? this.text(this.w(hd + 12), this.w(hd + 16)) : `@${r}`; }, sub = (r: number): string => { const k = this.w(r); return k === 3 ? `R(${head(this.w(r + 12))})` : k === 7 ? `ON(${sub(this.w(r + 12))})` : k === 4 || k === 5 ? `${k}:${this.w(r + 12)}:${this.w(r + 16)}` : `${k}`; }; const k = this.w(c), id = sub(c), key = `${a}:${b}`, m = Ray.ic, was = m.get(key); if (was === undefined) m.set(key, id); else if (was === id) Ray.ic_same++; else { Ray.ic_differ++; const dk = `${this.where(a)} \`${this.snippet(a, b, 30)}\` ${was} vs ${id}`.slice(0, 220); Ray.ic_d.set(dk, (Ray.ic_d.get(dk) ?? 0) + 1); } Ray.ic_all++; if (!Ray.ic_said) { Ray.ic_said = true; process.on('exit', () => { console.error(`IC ${Ray.ic_all} readings at ${m.size} places: again the same ${Ray.ic_same}, otherwise ${Ray.ic_differ}`); for (const [k, n] of [...Ray.ic_d].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.error(`ICD ${n} ${k}`); }); } }
    if (kind === Debug.READING) { if (mode === 'trace') { const k = this.w(c), kinds = ['empty', 'unread', 'later', 'rule', 'hole', 'name', 'held', 'on'], hd = k === 3 ? this.w(this.w(c + 12) + 32) : 0; say(`${this.indent(this.stack.length)}${ansi.darkGray}READING \`${this.snippet(a, b, 50)}\` as ${kinds[k] ?? k}${hd ? ` \`${this.snippet(this.w(hd + 12), this.w(hd + 16), 40)}\`` : k === 7 ? ` \`${this.snippet(this.w(this.w(c + 12) + 4), this.w(this.w(c + 12) + 8), 30)}\` then \`${this.snippet(this.w(c + 16), this.w(c + 20), 30)}\`` : ''}${ansi.reset}`); } return 0; }
    if (kind === Debug.DEFINE && process.env.RAY_PROBE_DEFINE && this.snippet(a, b) === process.env.RAY_PROBE_DEFINE && (process.env.RAY_PROBE_ALL || !(this as any).probed)) { (this as any).probed = 1; if (process.env.RAY_PROBE_ALL) say(`PROBE in ${this.node_of(c)}`); say(this.crashed(new Error(`PROBE defined ${this.snippet(a, b)}`), false)); }
    if (kind === Debug.DEFINE) { if (mode === 'trace') say(`${this.indent(this.stack.length)}${ansi.green}DEFINE${ansi.reset} ${this.snippet(a, b)} ${ansi.darkGray}in ${this.node_of(c)}${ansi.reset}`); return 0; }
    if (kind % 2 === 1) {
      this.stack.push([kind, a, b, c, heap, performance.now(), this.applied()]);
      if (mode === 'trace') say(`${this.indent(this.stack.length - 1)}${this.step(kind, a, b, c)}`);
      if (this.stack.length > Ray.DEBUG_DEPTH) throw new RangeError(`the kernel went ${Ray.DEBUG_DEPTH} steps deep (each reading, rule or hole's code inside the one before)`);
      return 0;
    }
    // (done: the step it began; one that took long or much said, with --debug=cost)
    let k = this.stack.length - 1; while (k >= 0 && this.stack[k][0] !== kind - 1) k--;
    if (k < 0) return 0;
    const [, sa, sb, sc, h0, t0, n0] = this.stack[k]; this.stack.length = k;
    if (k <= this.traced_from) { if (mode === 'trace') say(`${this.indent(k)}${ansi.darkGray}(${this.applied() - n0} applications)${ansi.reset}`); this.traced_from = -1; }
    if (mode === 'trace' && kind === Debug.TYPE_END) say(`${this.indent(k)}${ansi.darkGray}= ${c ? 'yes' : 'no'}${ansi.reset}`);
    if (mode === 'trace' && kind === Debug.BLOCK_END) say(`${this.indent(k)}${ansi.darkGray}= ${c ? this.node_of(c) : 'nothing'}${ansi.reset}`);
    if (mode === 'cost' && (kind === Debug.STATEMENT_END || kind === Debug.TEST_END)) {
      const mb = (heap - h0) / 1048576, ms = performance.now() - t0;
      if (mb > Ray.COST_MB || ms > Ray.COST_MS) say(`${ansi.orange}COST${ansi.reset} ${ms.toFixed(1)} ms, ${mb.toFixed(1)} MB, ${this.applied() - n0} applications: ${this.step(kind - 1, sa, sb, sc)}`);
    }
    return 0;
  }
  // (a node, said: what it is, and the text it stands for)
  node_of(n: number) { if (n <= 1) return `(${n})`; const is = this.w(n + 8), kinds = ['node', 'text', 'place', 'head', 'hole', 'frame', 'called']; return `${kinds[is] ?? `is ${is}`} ${n}${is >= 1 && is <= 4 ? ` \`${this.snippet(this.w(n + 12), this.w(n + 16), 40)}\`` : ''}${n === this.w(GLOBAL) ? ' (global)' : ''}`; }
  // (how deep a step is: as far in as 16, then said)
  private indent(depth: number) { return `${ansi.darkGray}${env.nodejs && !env.worker_threads.isMainThread ? `T${env.worker_threads.threadId} ` : ''}${String(depth).padStart(3)}${ansi.reset} ${'  '.repeat(Math.min(depth, 16))}`; }
  // (one step, said: where, and what)
  private step(kind: number, a: number, b: number, c: number) {
    const at = `${ansi.darkGray}${this.where(a)}${ansi.reset}`;
    if (kind === Debug.STATEMENT) return `${ansi.green}READ${ansi.reset} ${at} ${this.snippet(a, b)}`;
    if (kind === Debug.TYPE) return `${ansi.darkGray}TYPE${ansi.reset} ${at} ${this.snippet(a, b)} ${ansi.darkGray}as ${this.node_of(c)}${ansi.reset}`;
    if (kind === Debug.TEST) return `${ansi.orange}TEST${ansi.reset} ${at} ${this.snippet(a, b)}`;
    if (kind === Debug.APPLY) { const h = c ? this.w(c + 32) : 0; return `${ansi.orange}APPLY${ansi.reset} ${this.head_of(c)}${h ? ` ${ansi.darkGray}(${this.where(this.w(h + 12)).replace(/^.*\//, '')}, in ${this.node_of(this.w(c + 40))})${ansi.reset}` : ''} ${ansi.darkGray}to${ansi.reset} ${at} ${this.snippet(a, b)}`; }
    return `${ansi.darkGray}CODE${ansi.reset} ${at} ${this.snippet(a, b)} ${ansi.darkGray}in ${this.node_of(c)}${ansi.reset}`;
  }
  static jmps = new Map<number, Jmp>();
  // (the kernel as JMP, once per process)
  static program(debug: number): Jmp {
    let jmp = Ray.jmps.get(debug);
    if (!jmp) { const p = new Jmp(); p.host('debug', 4); p.host('compiled', 4); p.host('told', 4); jmp = jmp_of(kernel.toString(), p, { DEBUG: debug, LOOP_LIMIT: Number(typeof process !== 'undefined' && process.env.RAY_DEBUG_KERNEL_LOOP || 0) }); Ray.jmps.set(debug, jmp); }
    return jmp;
  }
  static readonly COUNTED = ["read()", "nodes walked", "rules visited", "of them led by a hole", "matched", "readings", "read afresh", "type checks", "applications", "in a frame", "under shadows", "checks that ran", "checks cut", "checks kept", "checks yes", "check hits"];
  // (rules applied so far, counted when debugging)
  private applied() { const c = this.w(216); return c ? this.w(c + 4 * 8) : 0; }
  counted() { const c = this.w(216); return c ? Ray.COUNTED.map((n, i) => `${n} ${this.w(c + 4 * i)}`).join(', ') : ''; }
  // (a node's own rules, latest first, by their heads: what it reads)
  rules(node: number) { const out: string[] = []; for (let o = this.w(node), base = this.w(node + 4); o && o !== base && out.length < 200; o = this.w(o)) out.push(`${this.head_of(o)} ${ansi.darkGray}(kind ${this.w(o + 4)}, flags ${this.w(o + 36)}, at ${this.where(this.w(this.w(o + 32) + 12))})${ansi.reset}`); return out; }
  // (a rule's parts: each literal as written, each hole with its type (a node: what it holds, its own rules; 1: not read yet))
  parts_of(rule: number) {
    const out: string[] = [];
    for (let k = 0; k < this.w(rule + 28); k++) {
      const q = rule + R.PART + 24 * k, kind = this.w(q) & 15, text = this.text(this.w(q + 4), this.w(q + 4) + this.w(q + 8)), type = this.w(q + 16);
      out.push(kind === 0 ? `\`${text}\`` : kind === 1 ? '(space)' : `{${text}${type === 1 ? ': (not read yet)' : type ? `: node ${type} is ${this.w(type + 8)}, ${this.rules(type).length} rules` : ''}}${this.w(q) & 32 ? ' (a word)' : ''}`);
    }
    return out.join(' ');
  }
  // (a node's rules whose heads have `text` in them, from it out: what it sees)
  find(node: number, text: string) { const out: string[] = []; for (let o = this.w(node); o && out.length < 50; o = this.w(o)) if (this.w(o + 32) && this.head_of(o).includes(text)) out.push(`${this.head_of(o)}  ${this.parts_of(o)}`); return out; }
  // (a rule, by its head as written)
  head_of(rule: number) { const head = rule ? this.w(rule + 32) : 0; return head ? `\`${this.snippet(this.w(head + 12), this.w(head + 16), 60)}\`` : `(rule ${rule})`; }
  snippet(s: number, e: number, n = 80) { if (!(s >= 0 && e >= s && e <= this.u8.length)) return `(${s}..${e})`; const x = this.text(s, Math.min(e, s + 4 * n)).replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; }
  // (a crash: what it was, and what the kernel was doing, innermost first, the same step repeated said once)
  crashed(e: Error, crash = true) {
    const lines = [`${ansi.indianRed}${crash ? 'CRASH' : 'FAULT'}${ansi.reset} ${e.message}, ${this.stack.length} steps deep, ${(this.w(HEAP) / 1048576).toFixed(0)} MB in use:`];
    // (deep: the rules that go round, once each (the shortest round the innermost applications repeat), and where it began)
    const applied = this.stack.filter(x => x[0] === Debug.APPLY).map(x => x[3]);
    if (applied.length > 100) {
      const tail = applied.slice(-200);
      for (let period = 1; period <= 60; period++) {
        let ok = true; for (let i = period; i < tail.length && ok; i++) if (tail[i] !== tail[i - period]) ok = false;
        if (!ok) continue;
        const round = tail.slice(-period), first = this.stack.find(x => x[0] === Debug.APPLY && round.includes(x[3]));
        lines.push(`  ${ansi.indianRed}ROUND${ansi.reset} of ${period} rule${period > 1 ? 's' : ''}, again and again:`);
        for (const rule of round) { const h = rule ? this.w(rule + 32) : 0; lines.push(`    ${this.head_of(rule)} ${ansi.darkGray}(${h ? this.where(this.w(h + 12)).replace(/^.*\//, '') : '?'}, in ${rule ? this.node_of(this.w(rule + 40)) : '?'})${ansi.reset}`); }
        if (first) lines.push(`  ${ansi.darkGray}first entered:${ansi.reset} ${this.step(first[0], first[1], first[2], first[3])}`);
        break;
      }
    }
    let shown = 0;
    for (let k = this.stack.length - 1; k >= 0 && shown < 40; shown++) {
      let j = k; while (j > 0 && this.stack[j - 1][0] === this.stack[k][0] && this.stack[j - 1][1] === this.stack[k][1] && this.stack[j - 1][3] === this.stack[k][3]) j--;
      const [kind, a, b, c] = this.stack[k];
      lines.push(`  ${this.step(kind, a, b, c)}${k - j > 0 ? ` ${ansi.darkGray}(×${k - j + 1})${ansi.reset}` : ''}`);
      k = j - 1;
    }
    // (and where it began: the outermost steps)
    if (shown >= 40) { lines.push(`  …`); for (let k = Math.min(5, this.stack.length) - 1; k >= 0; k--) { const [kind, a, b, c] = this.stack[k]; lines.push(`  ${this.step(kind, a, b, c)}`); } }
    if (crash) this.stack.length = 0;
    return lines.join('\n');
  }
  alloc(n: number): number {
    const at = Atomics.add(this.i32, HEAP >> 2, (n + 3) & ~3);
    // (past the end, or past 2 GB where the kernel's addresses turn negative: out of memory, said so)
    if (at < 0 || at + n > this.u8.length) throw new RangeError(`out of memory (${this.u8.length} bytes, all of it in use)`);
    return at;
  }
  string(text: string): [number, number] { const bytes = new TextEncoder().encode(text), at = this.alloc(bytes.length); this.u8.set(bytes, at); return [at, at + bytes.length]; }
  text(s: number, e: number) { return new TextDecoder().decode(this.u8.slice(s, e)); }
  w(at: number) { return this.i32[at >> 2]; }
  private set(at: number, value: number) { this.i32[at >> 2] = value; }
  where(at: number) {
    let [s, id] = [this.w(ENTRYPOINT_START), this.w(ENTRYPOINT_FILE)], found = at >= s && at <= this.w(ENTRYPOINT_END);
    for (let k = 0; k < Atomics.load(this.i32, FILES_N >> 2); k++) { const entry = this.w(FILES) + 12 * k; if (this.w(entry) <= at && at <= this.w(entry + 4)) { [s, id] = [this.w(entry), this.w(entry + 8)]; found = true; } }
    // (text the kernel made, a body with another's code in it: in no file)
    if (!found && this.w(ENTRYPOINT_END)) return typeof process !== 'undefined' && process.env.RAY_MADE ? `(made, at ${at}: ${JSON.stringify(this.text(Math.max(0, at - 80), at))} ^ ${JSON.stringify(this.text(at, at + 80))})` : `(made, at ${at})`;
    const before = this.text(s, at).split('\n');
    return `${id < 0 ? this.named_[-id - 1] ?? '?' : this.files_?.getPath(id) ?? id}:${before.length}:${before[before.length - 1].length + 1}`;
  }
}

export class Program {
  static preload?: (values: MemoryLayout) => void;
  static backends: Record<string, Language<Ray>> = { wasm: new Wasm(), js: new Js(),};
  static frontend: Language<FileStore> = new Ray();

  constructor(public entrypoint?: Global.Source) {}

  backend: Language<Ray> = Program.backends[env.target];
  target(target: string): this {
    const backend = Program.backends[target];
    if (!backend) throw new Error(`The chosen backend '${target}' doesn't exist.`);
    this.backend = backend;
    return this;
  }

  abstractly = false;
  abstract(abstractly?: boolean): this { this.abstractly = abstractly ?? true; return this; }

  workers: any[] = [];
  private workerReady: Promise<void>[] = [];

  buffer!: Parallel.Buffer<MemoryLayout>;
  files: FileStore;
  queue!: Parallel.Queue;

  parallel(threads = env.threads): this {
    if (this.buffer) {
      throw new Error("Program.parallel() has already been initialized.");
    }

    const shared = env.parallel && threads > 1;
    const maximum = 1 << 30;
    const queueCapacity = 256;

    const values: MemoryLayout = {
      heap: typeof WebAssembly !== 'undefined' && typeof SharedArrayBuffer !== 'undefined' ? memory(Ray.MEMORY) : new Parallel.Memory(Ray.MEMORY, shared, Ray.MEMORY),
      source: new Parallel.Memory(4096, shared, maximum),
      metadata: new Parallel.Memory(4096, shared, maximum),
      paths: new Parallel.Memory(4096, shared, maximum),
      index: new Parallel.Memory(512 * 4, shared, maximum),
      fileState: new Parallel.Memory(
        FileState.SIZE * 4,
        shared,
        FileState.SIZE * 4,
      ),
      queue: new Parallel.Memory(
        (QueueState.SIZE + queueCapacity) * 4,
        shared,
        (QueueState.SIZE + queueCapacity) * 4,
      ),
      queueCapacity,
      maximum,
    };
    // (what was read before, put back before any thread starts: what they take is after it)
    if (Program.preload) Program.preload(values);

    this.buffer = new Parallel.Buffer<MemoryLayout>(values);
    this.files = new FileStore(this.buffer);
    this.queue = new Parallel.Queue(
      queueCapacity,
      shared,
      values.queue.buffer,
    );

    if (!shared) return this;

    // (the threads started first (each loading the language takes as long as compiling it), then the kernel compiled once,
    // here, while they do: each thread instantiates it)
    for (let i = 0; i < threads; i++) {
      const worker = env.Worker({ thread: NAME, main: [args, kwargs] });
      this.workers.push(worker);
      this.workerReady.push(new Promise<void>((resolve, reject) => {
        worker.onMessage((message: unknown) => {
          if (message === "ready") resolve();
          else reject(new Error("Unexpected worker initialization response."));
        });
      }));
    }
    if (this.backend instanceof Wasm) Wasm.module(values.heap.buffer.byteLength / 65536, (Program.frontend as Ray).debugging ? 1 : 0);
    for (const worker of this.workers) worker.postMessage({ buffers: this.buffer.pack(), target: this.backend.name, modules: [...Wasm.compiled] });

    return this;
  }

  async add(...include: (string | Text.Source)[]): Promise<void> {
    if (!this.files || !this.queue)
      throw new Error("Call program.parallel() before adding files.");

    // Do not queue work until all workers have initialized their shared memory.
    await Promise.all(this.workerReady);
    if (typeof process !== 'undefined' && process.env.RAY_TIMES) console.error(`TIMES workers ready at ${performance.now().toFixed(1)} ms`);

    const add = async (src: Text.Source): Promise<void> => {
      if (this.files.getFileId(src.location) !== undefined) {
        if (!!kwargs.verbose) { say(`${ansi.orange}SKIPPED${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
        return;
      }

      if (!!kwargs.verbose) { say(`${ansi.darkGray}LOADING${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
      await src.load();
      
      // Double-check if loading took long.
      if (this.files.getFileId(src.location) !== undefined) {
        if (!!kwargs.verbose) { say(`${ansi.orange}SKIPPED${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
        return;
      }

      const id = this.files.add(src.location, src.value);

      await this.queue.submit([id]);

      if (!!kwargs.verbose) { say(`${ansi.green}LOADED ${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
    };

    for (const item of include) {
      if (item instanceof Text.Source) {
        await add(item);
      } else {
        for await (const src of Text.Source.all(item)) {
          await add(src);
        }
      }
    }
  }

  // What the files read ask for (`external include`, `external read`), in the order asked: each group read by every thread,
  // then settled, before the next; `given` is what the host was given.
  // (from what was handled already, `start`; each request handled, told `after`, what it read done)
  async reads(given: string[], start = 0, after?: (handled: number) => void, before?: () => void): Promise<void> {
    const heap = this.files.buffer.values.heap, i32 = new Int32Array(heap.buffer);
    before?.();
    for (let handled = start; ;) {
      const asked = Ray.requests(heap, handled);
      if (!asked.length) return;
      for (const { kind, text, at, scope } of asked) {
        handled++;
        const sources: Text.Source[] = [];
        if (text === 'given') { for (const g of given) { if ((await env.fs_promises.stat(env.path.resolve(process.cwd(), g))).isDirectory()) { for await (const src of Text.Source.all(g)) sources.push(src); } else sources.push(new Text.Source(g)); } }
        else { const from = (() => { for (let k = 0; k < Atomics.load(i32, FILES_N >> 2); k++) { const entry = i32[FILES >> 2] + 12 * k; if (i32[entry >> 2] <= at && at <= i32[(entry + 4) >> 2]) return this.files.getPath(i32[(entry + 8) >> 2]); } return ''; })(); for (const path of Ray.located(text, from)) sources.push(new Text.Source(path)); }
        const ids: number[] = [];
        for (const src of sources) {
          if (this.files.getFileId(src.location) !== undefined) continue;
          await src.load();
          if (this.files.getFileId(src.location) !== undefined) continue;
          const id = this.files.add(src.location, src.value);
          i32[(i32[INCL >> 2] + 8 * id) >> 2] = kind; i32[(i32[INCL >> 2] + 8 * id + 4) >> 2] = scope;
          if (!!kwargs.verbose) say(`${ansi.darkGray}LOADING${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`);
          ids.push(id);
        }
        await this.queue.submit(ids); await this.queue.join();
        Ray.ordered(this.files);
        await this.queue.submit(Array(Math.max(1, this.workers.length)).fill(SETTLE)); await this.queue.join();
        for (const g of [PHASE, NEXT, DONE, ANY]) Atomics.store(i32, g >> 2, 0);
        after?.(handled);
      }
    }
  }

  async ".entrypoint"() {
    const src = this.entrypoint as Text.Source | undefined;

    if (src && !src.loaded && src.location && !(await src.is_directory())) await src.load();
    // (given a language's entrypoint, that one; else Ray's)
    if (!src?.is_language_entrypoint) await this.add(new Text.Source(env.nodejs ? env.path.relative(process.cwd(), env.url.fileURLToPath(new URL(ENTRYPOINT, import.meta.url))) : ENTRYPOINT));
    if (src) await this.add(src.is_language_entrypoint ? src : src.location);
  }

  // get entrypoint(): pointer {
  //   // TODO: Return the entrypoint's file pointer.
  //   throw new Error("Program.entrypoint is not implemented yet.");
  // }

  // get labels(): Iterable<pointer> {
  //   // TODO: Enumerate label pointers.
  //   return [];
  // }

  close(): void {
    this.queue?.stop();

    for (const worker of this.workers)
      worker.terminate();

    this.workers = [];
    this.workerReady = [];
  }
}

entrypoint();
