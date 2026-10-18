import { sources } from './bundled.ts';
import { kernel } from './kernel.ts';

export { kernel };

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

  // (a program built, `ray out.wasm`: its memory set out as it was read, what was put off run, what was said said; on this
  // worker, with its larger stack)
  if (args[0]?.endsWith('.wasm') && env.nodejs) return run_built(args[0]);
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
    const me = env.url.fileURLToPath(import.meta.url), map = env.url.fileURLToPath(new URL('./wasm.o.ray', import.meta.url)), own = env.url.fileURLToPath(new URL('./kernel.ts', import.meta.url));
    const kernel = Cache.hash(env.fs.readFileSync(me)) + (env.fs.existsSync(own) ? Cache.hash(env.fs.readFileSync(own)) : '') + (env.fs.existsSync(map) ? Cache.hash(env.fs.readFileSync(map)) : '');
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
const WORDS_KNOWN = ['caller', 'this', 'afterwards', 'report', 'erred', 'goto', 'label', '.', '&', 'type', 'include', 'read', 'next', 'members', 'static', 'undefined', 'unset', 'operated', 'admits', 'head', 'value', 'narrows', 'components', 'each', 'nonempty_of', 'listing', 'Node', 'String', 'of', 'written_as', 'named', 'written_name', 'names', 'tail', 'named_like', 'member', 'structure_as', 'output', 'arguments', 'quoted', 'repeats', 'superposes', 'readable', 'typed_name', 'header_quoted', 'pure'];
// The kernel's own map, apart from the externals: what its kinds of value are in the language (`external text` in `wasm.o.ray`).
const NOVIA = typeof process !== "undefined" && !!process.env.RAY_NOVIA;
const NOGIVEN = typeof process !== "undefined" && !!process.env.RAY_NOGIVEN;
const MAPPED_KNOWN = ['text', 'first', 'rest', 'nothing', 'given', 'taking', 'same', 'until', 'glyphs', 'count', 'truth', 'number', 'numeral', 'character', 'superposed', 'superposing', 'dotted', 'past', 'cuts', 'unescaped'];
// (what the kernel says: `L_…`)
const L = { UNREAD: 1, UNLABELLED: 2, BUDGET: 3, OOM: 4, REPORT: 5, CYCLE: 6, NOT_ON: 7, EXTERNAL: 8, DEEP: 9, STYLED: 10, HELD: 11, DEFINED: 12, VALUED: 13, SILENT: 14, PASSED: 15, MEMORY: 16, FULL: 17, OUTPUT: 18, IMPURE: 19, CARRIED: 20 };
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
        const after = at; at = step; label(`#${k}step`); if (peek() !== ')') { assignment(); while (peek() === ',') { at++; assignment(); } } at = after;
        jmp(`#${k}top`); label(`#${k}end`); scopes.pop();
        return;
      }
      if (t === 'return') { at++; jmp('set', '&.value', peek() === ';' || peek() === '}' ? 0 : assignment()); if (peek() === ';') at++; jmp('&.caller'); return; }
      if (t === 'break' || t === 'continue') { at++; if (peek() === ';') at++; const [top, end] = loops[loops.length - 1]; jmp(t === 'break' ? end : top); return; }
      assignment(); while (peek() === ',') { at++; assignment(); } if (peek() === ';') at++;
    };
    void operand;
    eat('{'); while (peek() !== '}') statement(); at++;
    jmp('set', '&.value', 0); jmp('&.caller');
  }
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
      : kind === L.NOT_ON ? `nothing in what it is read on reads \`${text(a, c)}\`` : kind === L.EXTERNAL ? `\`external ${text(a, c)}\` is no external` : kind === L.DEEP ? this.deep(a) : kind === L.VALUED ? `a left side answers a value, not a place: \`${text(a, c)}\` (a name in it is a value there: a hole of the rule reading it?)` : kind === L.FULL ? `stopped: almost all the memory there is is in use (what the threads' tests took): this test was not given more` : kind === L.MEMORY ? `took more than ${test ? 32 : 320} MB of new memory ${test ? 'in this test' : 'reading this'} (what it reads makes more and more): stopped` : kind === L.SILENT ? `this test failed and nothing said why (the kernel stopped it without saying what it could not read)` : kind === L.HELD ? `a test put off 4096 tests (each putting off more: a class whose block makes one of it, or a test in what a test makes)` : kind === L.IMPURE ? `this pure block changed what was made before it: the change is not kept` : kind === L.CARRIED ? `a pure block answers a text, a count, or a value made before it: what this one answered is let go of with it` : undefined;
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
    // (a count the kernel holds: how many it is, one less than its N_A; else its `next` counted down to None)
    const number = (n: number) => { if (n && this.w(n + 8) === 0 && this.w(n + 12) > 0) return this.w(n + 12) - 1; let k = 0; for (let m = this.member(n, 'next'); m && m !== none && k < 1 << 20; m = this.member(m, 'next')) k++; return k; };
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
