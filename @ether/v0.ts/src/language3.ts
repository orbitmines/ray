import { sources } from './bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const EXTENSION = '.ray';
export const ENTRYPOINT = `../../ray/.entrypoint${EXTENSION}3`;
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 4];

export const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { value: false, alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    {             description: 'Debug the kernel: a crash, running out of memory or a runaway says what was being read (memory checked on the js target); --debug=trace says every step, --debug=cost each statement taking long or much memory.' },
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
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 16) },
    });
    return new env.worker_threads.Worker(file, {
      workerData: { daemon: NAME, ...data },
      env: { ...process.env, ...variables },
      execArgv: typescript ? [...process.execArgv.filter(flag => !flag.startsWith('--stack-size')), '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
      resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 16) },
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
  static get threads() { return env.nodejs ? env.os.availableParallelism() : navigator.hardwareConcurrency ?? 1; }
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

  const language = new Program(args.length > 0 ? new Text.Source(args[0]) : undefined,)
    .abstract(!!kwargs.abstract)
    .target(String(kwargs.target ?? env.target))
    .parallel(Math.max(1, Number(kwargs.threads ?? env.threads)));

  let localRunner: Promise<void> | undefined;

  try {
    const start = performance.now();

    // If no workers were created, consume tasks on this thread.
    if (language.workers.length === 0) {
      localRunner = language.queue.run(async (id) => {
        await Program.frontend.compile(language.files, id);
      });

      // A persistent runner stops when language.close() stops the queue.
      void localRunner.catch((error) => {
        console.error("Local queue failed:", error);
        process.exitCode = 1;
      });
    }

    // Register the entrypoint and all explicitly supplied files.
    await language[".entrypoint"]();
    await language.queue.join();
    const loaded = performance.now();

    // What the language asks to read (its own files, then what it was given), read.
    await language.reads(args.slice(1));
    const read = performance.now();

    // Then the tests, on every thread (each takes them from the queue the kernel keeps while there are any); and, all done,
    // what was said, once.
    Ray.ordered(language.files);
    await language.queue.submit(Array(Math.max(1, language.workers.length)).fill(TESTS));
    await language.queue.join();
    const tested = performance.now(), host = new Ray();
    host.init(language.files.buffer.values.heap); host.files_ = language.files;
    let errors = 0, warnings = 0;
    for (const [at, message, style] of host.listen()) {
      const warning = style === 'warn' || style === 'info' || style === 'debug';
      if (warning) warnings++; else errors++;
      say(`${warning ? `${ansi.orange}WARNING${ansi.reset}` : `${ansi.indianRed}ERROR${ansi.reset}  `} ${host.where(at)}: ${message}`);
    }
    say(`${ansi.indianRed}ERROR${ansi.reset} ${ansi.darkGray}(${errors})${ansi.reset} ${ansi.orange}WARNING${ansi.reset} ${ansi.darkGray}(${warnings})${ansi.reset} ${ansi.green}PASS${ansi.reset} ${ansi.darkGray}(${host.w(PASSED)})${ansi.reset}`);

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
      console.error("Worker queue failed:", error);
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
    ray.init(env.target === 'wasm' ? memory(1 << 28) : new Parallel.Memory(1 << 28, false, 1 << 28));
    const entry = [...documents].find(([u]) => file_of(u) === language)?.[1].text ?? env.fs.readFileSync(language, 'utf-8');
    let [s, e] = ray.file(encoder.encode(file === language ? doc.text : entry), language);
    // (another document: its own tests, not the language's)
    if (file !== language) { ray.untested(); [s, e] = ray.file(encoder.encode(doc.text), file); }
    ray.tests();
    // (offsets in the text the editor has: bytes to characters)
    const bytes = encoder.encode(doc.text), at = new Int32Array(bytes.length + 1);
    for (let i = 0, c = 0; i <= bytes.length; i++) { at[i] = c; if (i < bytes.length && (bytes[i] & 0xC0) !== 0x80) c += bytes[i] >= 0xF0 ? 2 : 1; }
    const char = (b: number) => at[Math.max(0, Math.min(bytes.length, b))];
    const paints = ray.paints(s, e).map(p => ({ begin: char(p.begin), end: char(p.end), style: p.style }));
    const diagnostics = ray.listen().filter(([x]) => x >= s && x <= e).map(([x, message]) => ({ severity: 1, range: { start: position_of(doc.text, char(x - s)), end: position_of(doc.text, char(x - s) + 1) }, message, source: 'ray' }));
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
  { name: 'cas', arity: 3, wasm: op(0xFE, 0x48, 2, 0) },
];

type Operand = string | number;   // a cell by its name, or a constant

export class Jmp {
  code: number[] = [];
  constants = [1];
  // (what the host does for it, called as a context is: `into = host(the cells from a on)`; a wasm import)
  hosts: { name: string, arity: number }[] = [];
  host(name: string, arity: number) { this.hosts.push({ name, arity }); }
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

const [UNREACHABLE, BLOCK, LOOP, IF, END, BR, BR_IF, RETURN, CALL, DROP, GET, SET, CONST, VOID, I32] =
  [0x00, 0x02, 0x03, 0x04, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x1a, 0x20, 0x21, 0x41, 0x40, 0x7f];
const uleb = (n: number): number[] => n < 0x80 ? [n] : [(n & 0x7f) | 0x80, ...uleb(n >>> 7)];
const sleb = (n: number): number[] => { const b = n & 0x7f, rest = n >> 7; return (rest === 0 && !(b & 0x40)) || (rest === -1 && (b & 0x40)) ? [b] : [b | 0x80, ...sleb(rest)]; };
const vec = (xs: number[][]) => [...uleb(xs.length), ...xs.flat()];
const section = (id: number, body: number[]) => [id, ...uleb(body.length), ...body];
const text = (s: string) => vec([...s].map(c => [c.charCodeAt(0)]));

// A module of the program's contexts, each exported by name. Its memory is shared, so threads can run it together.
export function compile(p: Jmp, pages: number): WebAssembly.Module {
  p.link();
  const entries = [...p.cells.keys()].sort((a, b) => a - b), params = entries.map(e => p.code[5 * e + 3]), types = [...new Set([...params, ...p.hosts.map(h => h.arity)])];
  const label = new Map([...p.names].map(([n, k]) => [k, n])), h = p.hosts.length;
  return new WebAssembly.Module(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec(types.map(n => [0x60, ...vec(Array(n).fill([I32])), ...vec([[I32]])]))),
    ...section(2, vec([...p.hosts.map(x => [...text('h'), ...text(x.name), 0x00, ...uleb(types.indexOf(x.arity))]), [...text('m'), ...text('memory'), 0x02, 0x03, ...uleb(pages), ...uleb(pages)]])),
    ...section(3, vec(params.map(n => uleb(types.indexOf(n))))),
    ...section(7, vec(entries.map((e, i) => [...text(label.get(e)!), 0x00, ...uleb(h + i)]))),
    ...section(10, vec(entries.map((e, i) => {
      let b: number[];
      try { b = context(p, e, entries[i + 1] ?? p.length, entries); } catch (x) { throw new Error(`${label.get(e)}: ${(x as Error).message}`); }
      return [...uleb(b.length), ...b];
    }))),
    // (the names of its functions, so a trace says where it was)
    ...section(0, [...text('name'), ...(names => [1, ...uleb(names.length), ...names])(vec([...p.hosts.map((x, i) => [...uleb(i), ...text(x.name)]), ...entries.map((e, i) => [...uleb(h + i), ...text(label.get(e)!)])]))]),
  ]));
}

// Straight-line code, then the jumps that end it.
type Block = { code: number[]; jumps: [when: number[] | null, to: number][] };

// A context's statements, from its `&` to the next. Blocks begin where a jump lands and after a jump.
function context(p: Jmp, entry: number, end: number, entries: number[]): number[] {
  const get = (x: number) => x >= 0 ? [GET, ...uleb(x)] : [CONST, ...sleb(p.constants[-1 - x])];
  const constant = (x: number) => x < 0 ? p.constants[-1 - x] : undefined;
  const starts = new Set([entry + 1]);
  for (let k = entry + 1; k < end; k++) {
    const t = p.code[5 * k];
    if (t >= 0 && p.code[5 * t] !== AMP) {
      if (t <= entry || t >= end) throw new Error(`statement ${k} jumps out of its context`);
      starts.add(t); starts.add(k + 1);
    } else if (t === CALLER) starts.add(k + 1);
  }
  const order = [...starts].filter(k => k < end).sort((a, b) => a - b), block = new Map(order.map((k, i) => [k, i]));
  const blocks: Block[] = order.map(() => ({ code: [], jumps: [] }));
  let b = blocks[0];
  for (let k = entry + 1; k < end; k++) {
    if (block.has(k)) b = blocks[block.get(k)!];
    const [t, c, into, x, y] = p.at(k), fixed = constant(c);
    if (fixed === 0) continue;
    const when = (code: number[]) => fixed !== undefined ? code : [...get(c), IF, VOID, ...code, END];
    const put = into >= 0 ? [SET, ...uleb(into)] : [DROP];
    if (t === CALLER) b.code.push(...when([...get(p.code[5 * entry + 3]), RETURN]));
    else if (t >= 0 && p.code[5 * t] === AMP) b.code.push(...when([...Array.from({ length: p.code[5 * t + 3] }, (_, i) => get(x + i)).flat(), CALL, ...uleb(p.hosts.length + entries.indexOf(t)), ...put]));
    else if (t >= 0) b.jumps.push([fixed !== undefined ? null : get(c), block.get(t)!]);
    else if (-3 - t >= NATIVES.length) { const h = -3 - t - NATIVES.length; b.code.push(...when([...Array.from({ length: p.hosts[h].arity }, (_, i) => get(x + i)).flat(), CALL, ...uleb(h), ...put])); }
    else { const n = NATIVES[-3 - t]; b.code.push(...when([...n.wasm((n.arity === 3 ? [x, x + 1, x + 2] : [x, y].slice(0, n.arity)).map(get)), ...(n.value === false ? [] : put)])); }
  }
  const locals = p.cells.get(entry)!.length - p.code[5 * entry + 3];
  return [...vec([[...uleb(locals), I32]]), ...structure(blocks), UNREACHABLE, END];
}

// Loops and blocks that nest: a loop from a block to the last jump back to it, a block from the first jump forward to a
// block until it. A block that crosses another begins earlier; a jump into the middle of a loop does not nest.
function structure(blocks: Block[]): number[] {
  type Scope = { from: number; to: number; loop: boolean; target: number };
  const scopes: Scope[] = [];
  blocks.forEach((_, target) => {
    const from = blocks.flatMap((b, k) => b.jumps.some(([, to]) => to === target) ? [k] : []);
    const back = from.filter(k => k >= target), forward = from.filter(k => k < target - 1);
    if (back.length > 0) scopes.push({ from: target, to: Math.max(...back) + 1, loop: true, target });
    if (forward.length > 0) scopes.push({ from: Math.min(...forward), to: target, loop: false, target });
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const a of scopes) for (const b of scopes) if (a.from < b.from && b.from < a.to && a.to < b.to) {
      if (b.loop) throw new Error('a jump into the middle of a loop');
      b.from = a.from; changed = true;
    }
  }
  const open: Scope[] = [], code: number[] = [];
  blocks.forEach((b, k) => {
    for (const s of scopes.filter(s => s.from === k).sort((x, y) => y.to - x.to || +y.loop - +x.loop)) { code.push(s.loop ? LOOP : BLOCK, VOID); open.push(s); }
    code.push(...b.code);
    for (const [when, to] of b.jumps) if (to !== k + 1) {
      const depth = open.length - 1 - open.findIndex(s => s.target === to && s.loop === to <= k);
      code.push(...(when === null ? [BR] : [...when, BR_IF]), ...uleb(depth));
    }
    while (open.length > 0 && open[open.length - 1].to === k + 1) { code.push(END); open.pop(); }
  });
  return code;
}

export const memory = (bytes: number) => { const pages = Math.max(1, Math.ceil(bytes / 65536)); return new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true }); };
// (a program run in memory of its own: compiled where there is WebAssembly with shared memory, else run as JavaScript)
type Hosts = Record<string, (...args: number[]) => number>;
export function runs_in(p: Jmp, bytes: number, hosts: Hosts = {}): { buffer: ArrayBufferLike, exports: Record<string, (...args: number[]) => number> } {
  if (env.target === 'wasm') { const m = memory(bytes); return { buffer: m.buffer, exports: instance(compile(p, m.buffer.byteLength / 65536), m, hosts) }; }
  const buffer = new ArrayBuffer(Math.max(1, Math.ceil(bytes / 65536)) * 65536);
  return { buffer, exports: interpret(p, buffer, hosts) };
}
export const instance = (module: WebAssembly.Module, memory: WebAssembly.Memory, hosts: Hosts = {}) =>
  new WebAssembly.Instance(module, { m: { memory }, h: hosts }).exports as Record<string, (...args: number[]) => number>;

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
  compile(ray: Ray) { return instance(compile(ray.jmp, ray.heap.buffer.byteLength / 65536), ray.heap as WebAssembly.Memory, ray.hosts); }
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
const ENTRYPOINT_END = 204, HEAP = 0, OPEN = 4, OPEN_LENGTH = 8, CLOSE = 12, CLOSE_LENGTH = 16, BOOTED = 20, GLOBAL = 24, ENTRYPOINT_FILE = 28, ENTRYPOINT_START = 32, SEPARATOR = 36, SEPARATOR_LENGTH = 40, CLASSES = 44, PAIRS = 48, FRAMES = 52;
const WORDS = 56, LOG = 60, LOG_N = 64, LOG_CAP = 68, AFTER = 72, AFTER_HEAD = 76, AFTER_TAIL = 80, AFTER_CAP = 84, FAIL_FAST = 120, MEMO = 124, MEMO_MASK = 128, FILES = 132, FILES_N = 136, PEND = 140, PHASE = 144, READS = 164, READS_N = 168, READS_CAP = 172, LIST = 92, LIST_N = 96, LIST_CAP = 100, LIMIT = 104, TRASH = 112, BUDGET = 116, START = 256;
// (a task that is no file: the tests)
const TESTS = 0x7FFFFFF0, SETTLE = 0x7FFFFFF1, NEXT = 148, DONE = 152, ANY = 156, INCL = 176, LAZY = 180, LAZY_CAP = 188, PASSED = 192;
// (the words the host knows, in the kernel's order: `W_…`)
const WORDS_KNOWN = ['caller', 'this', 'afterwards', 'report', 'erred', 'goto', 'label', '.', '&', 'type', 'include', 'read'];
// (what the kernel says: `L_…`)
const L = { UNREAD: 1, UNLABELLED: 2, BUDGET: 3, OOM: 4, REPORT: 5, CYCLE: 6, NOT_ON: 7, EXTERNAL: 8, DEEP: 9, STYLED: 10, HELD: 11, DEFINED: 12 };
// (what the kernel tells the host with --debug: D_… in it)
const Debug = { STATEMENT: 1, STATEMENT_END: 2, APPLY: 3, APPLY_END: 4, DEFINE: 5, OOM: 6, BLOCK: 7, BLOCK_END: 8, TEST: 9, TEST_END: 10, FAULT: 11 };
const N = { LAST: 0, BASE: 4, IS: 8, A: 12, B: 16, PARENT: 20, ALSO: 24 }, NODE = 28;
const F = { RULE: 28, CALLER: 32, THIS: 36, START: 40, END: 44, CLOSURE: 48, RECEIVER: 52, TAKES: 56 }, TAKE = 28;
const T = { START: 0, END: 4, VIS: 8, ORIGIN: 12, THIS: 16, VALUE: 20, STATE: 24 };
const R = { PREV: 0, KIND: 4, MASK: 8, HOLES: 12, BS: 16, BE: 20, CLOSURE: 24, PARTS: 28, HEAD: 32, FLAGS: 36, OWNER: 40, BODY: 44, SKIP: 48, INL_S: 52, INL_E: 56, INL_F: 60, PART: 64 }, PART = 24;
const enum Kind { RULE, DEFINE, EXTERNAL, VALUE }
const enum Part { LITERAL, SPACE, HOLE }
const enum Is { NODE, TEXT, PLACE, HEAD, HOLE, FRAME }
// (which rules a reading asks: one with the separator in it, only definitions; on a value, only methods (led by text); in a hole, only what has holes)
const enum Want { DEFINES = 1, LED = 2, HOLES = 4, DEAD = 8, METHOD = 16, READER = 32 }
const SCRATCH = 1024, HUG = 16, WORD = 32;
type Exports = Record<string, (...args: number[]) => number>;
// (written at once: a thread's console is written later, and a thread may be stopped before)
const say = (text: string) => env.nodejs ? env.fs.writeSync(1, text + '\n') : console.log(text);

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
const BUILTINS: Record<string, string> = { w: 'i32', set: 'i32=', b: 'u8', setb: 'u8=', aload: 'aload', astore: 'astore', xadd: 'xadd', cas: 'cas', clz: 'clz', ctz: 'ctz' };
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
      if (peek() === '(') {
        at++; const args: Operand[] = []; while (peek() !== ')') { args.push(assignment()); if (peek() === ',') at++; } eat(')');
        const native = BUILTINS[t];
        if (native) {
          const out = native === 'i32=' || native === 'u8=' || native === 'astore' ? undefined : fresh();
          if (native === 'cas') { const cells = args.map(a => { const c = fresh(); jmp('set', c, a); return c; }); jmp('cas', out, cells[0]); }
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
      if (t === '{') { at++; while (peek() !== '}') statement(); at++; return; }
      if (t === ';') { at++; return; }
      if (t === 'let' || t === 'const' || t === 'var') { at++; for (;;) { const name = next(); if (peek() === ':') { at++; next(); } if (peek() === '=') { at++; jmp('set', name, assignment()); } else jmp('set', name, 0); if (peek() !== ',') break; at++; } if (peek() === ';') at++; return; }
      if (t === 'if') {
        at++; eat('('); const c = assignment(); eat(')'); const k = fresh();
        if (typeof c === 'number') { if (!c) jmp(`#${k}else`); } else { jmp('not', '$t', c); when('$t', `#${k}else`); }
        statement();
        if (peek() === 'else') { at++; jmp(`#${k}end`); label(`#${k}else`); statement(); label(`#${k}end`); } else label(`#${k}else`);
        return;
      }
      if (t === 'while') {
        at++; const k = fresh(); label(`#${k}top`); eat('('); const c = assignment(); eat(')');
        jmp('not', '$t', c); when('$t', `#${k}end`); loops.push([`#${k}top`, `#${k}end`]); statement(); loops.pop(); jmp(`#${k}top`); label(`#${k}end`);
        return;
      }
      if (t === 'do') {
        at++; const k = fresh(); label(`#${k}top`); loops.push([`#${k}next`, `#${k}end`]); statement(); loops.pop();
        eat('while'); eat('('); label(`#${k}next`); const c = assignment(); eat(')'); if (peek() === ';') at++; when(c, `#${k}top`); label(`#${k}end`);
        return;
      }
      if (t === 'for') {
        at++; eat('('); const k = fresh();
        if (peek() !== ';') statement(); else at++;
        label(`#${k}top`); if (peek() !== ';') { const c = assignment(); jmp('not', '$t', c); when('$t', `#${k}end`); } eat(';');
        const step = at; let d = 0; while (d > 0 || peek() !== ')') { const x = next(); if (x === '(') d++; if (x === ')') d--; } eat(')');
        loops.push([`#${k}step`, `#${k}end`]); statement(); loops.pop();
        const after = at; at = step; label(`#${k}step`); if (peek() !== ')') assignment(); at = after;
        jmp(`#${k}top`); label(`#${k}end`);
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
  const w = DEBUG ? (a: number) => (outside(a, 4), i32[a >> 2]) : (a: number) => i32[a >> 2], set = DEBUG ? (a: number, v: number) => { outside(a, 4); i32[a >> 2] = v; } : (a: number, v: number) => { i32[a >> 2] = v; };
  const b = DEBUG ? (a: number) => (outside(a, 1), u8[a]) : (a: number) => u8[a], setb = DEBUG ? (a: number, v: number) => { outside(a, 1); u8[a] = v; } : (a: number, v: number) => { u8[a] = v; };
  const aload = (a: number) => Atomics.load(i32, a >> 2), astore = (a: number, v: number) => { Atomics.store(i32, a >> 2, v); }, xadd = (a: number, v: number) => Atomics.add(i32, a >> 2, v), cas = (a: number, o: number, n: number) => Atomics.compareExchange(i32, a >> 2, o, n);
  const clz = (x: number) => Math.clz32(x), ctz = (x: number) => x === 0 ? 32 : 31 - Math.clz32(x & -x);
  void astore; void clz; void ctz; void setb;

  // (the words every thread shares)
  const HEAP = 0, OPEN = 4, OPEN_LENGTH = 8, CLOSE = 12, CLOSE_LENGTH = 16, GLOBAL = 24, SEPARATOR = 36, SEPARATOR_LENGTH = 40, CLASSES = 44, PAIRS = 48, FRAMES = 52;
  const WORDS = 56, LOG = 60, LOG_N = 64, LOG_CAP = 68, AFTER = 72, AFTER_HEAD = 76, AFTER_TAIL = 80, AFTER_CAP = 84, ACTIVE = 88, LIST = 92, LIST_N = 96, LIST_CAP = 100, LIMIT = 104, OOM = 108, TRASH = 112, BUDGET = 116, FAIL_FAST = 120, MEMO = 124, MEMO_MASK = 128, PEND = 140, PEND_N = 136, PHASE = 144, NEXT = 148, DONE = 152, ANY = 156, ROUND = 160, FINAL = 0x7FFFFFFF, READS = 164, READS_N = 168, READS_CAP = 172, LAZY = 180, LAZY_N = 184, LAZY_CAP = 188, PASSED = 192, FAILED = 196;
  // (this thread's words: given, a constant of what is compiled for it)
  const THREAD = thread | 0, CHUNK = 1 << 16;
  // (a thread's words)
  const T_CHUNK = 52, T_CHUNK_END = 56, T_SLOT = 60, T_SLOT_END = 64, T_HELD = 68, T_HELD_N = 72, T_SCRATCH = 0, T_JUMP_S = 4, T_JUMP_N = 8, T_JUMP_V = 12, T_HOLE = 16, T_TESTING = 20, T_BUDGET = 24, T_SAID = 28, T_FAULT = 32, T_ON = 36, T_A = 40, T_B = 44, T_ERRED = 48, T_DEPTH = 76, T_SH = 80, T_SH_N = 84, T_MARK = 88, T_MARK_LO = 92, T_MARK_HI = 96, T_ROOT = 100, T_ISO = 104, T_QUIET = 108, T_DECLS = 112, T_DECLS_N = 116, T_HOLE_A = 120, T_HOLE_B = 124, T_DECL = 128, T_PLACE_IN = 132, T_INL_S = 136, T_INL_E = 140, T_INL_F = 144, SHADOWS = 1024, TYPINGS = 1, DECLS = 64;
  // (the words the host knows, at WORDS: where each is and how long)
  const W_CALLER = 0, W_THIS = 1, W_AFTERWARDS = 2, W_REPORT = 3, W_ERRED = 4, W_GOTO = 5, W_LABEL = 6, W_DOT = 7, W_AMP = 8, W_TYPE = 9, W_INCLUDE = 10, W_READ = 11;
  // (records)
  const N_LAST = 0, N_BASE = 4, N_IS = 8, N_A = 12, N_B = 16, N_PARENT = 20, N_ALSO = 24, NODE = 28;
  const F_RULE = 28, F_CALLER = 32, F_THIS = 36, F_START = 40, F_END = 44, F_CLOSURE = 48, F_RECEIVER = 52, F_TAKES = 56, TAKE = 28;
  const T_START = 0, T_END = 4, T_VIS = 8, T_ORIGIN = 12, T_THIS = 16, T_VALUE = 20, T_STATE = 24;
  const R_PREV = 0, R_KIND = 4, R_MASK = 8, R_HOLES = 12, R_BS = 16, R_BE = 20, R_CLOSURE = 24, R_PARTS = 28, R_HEAD = 32, R_FLAGS = 36, R_OWNER = 40, R_BODY = 44, R_SKIP = 48, R_INL_S = 52, R_INL_E = 56, R_INL_F = 60, R_PART = 64, PART = 24, SKIPS = 33;
  const RULE = 0, DEFINE = 1, EXTERNAL = 2, VALUE = 3;
  const LITERAL = 0, SPACE = 1, HOLE = 2, HUG = 16, WORD = 32;
  // (IS_CALLED: in a left side, a place and the brackets after it, `f (x)`: its head (N_A to N_B), the place (N_PARENT))
  const IS_NODE = 0, IS_TEXT = 1, IS_PLACE = 2, IS_HEAD = 3, IS_HOLE = 4, IS_FRAME = 5, IS_CALLED = 6, ROOT = 1;
  // (READER: a head that is one hole, `{x: T}`, what reads a T)
  // (LEFT, wanted of a reading only: it is a left side, a word nothing reads before what is read on it is declared there)
  const DEFINES = 1, LED = 2, HOLES = 4, DEAD = 8, METHOD = 16, READER = 32, LEFT = 64;
  // (a reading: [kind, start, end, a, c, d])
  const K_EMPTY = 0, K_UNREAD = 1, K_LATER = 2, K_RULE = 3, K_REF = 4, K_NAME = 5, K_HELD = 6, K_ON = 7, READ = 24;
  // (a body: [count, ...steps: [kind, start, end, a, c, d]])
  const S_READ = 0, S_LABEL = 1, S_LABELLED = 2, S_GOTO = 3, S_TO = 4, STEP = 24;
  // (what is said: [at, kind, a, c])
  // (what the host is told, with --debug: a statement read and done, a rule applied and done, one defined, memory out)
  const D_STATEMENT = 1, D_STATEMENT_END = 2, D_APPLY = 3, D_APPLY_END = 4, D_DEFINE = 5, D_OOM = 6, D_BLOCK = 7, D_BLOCK_END = 8, D_TEST = 9, D_TEST_END = 10, D_FAULT = 11;
  const L_UNREAD = 1, L_UNLABELLED = 2, L_BUDGET = 3, L_OOM = 4, L_REPORT = 5, L_CYCLE = 6, L_NOT_ON = 7, L_EXTERNAL = 8, L_DEEP = 9, L_STYLED = 10, L_HELD = 11, L_DEFINED = 12, HELD = 4096, DEPTH = 400;
  const SCRATCH = 1024;

  // ---- memory

  // Allocated: its words zero. (Past the limit: a place nothing reads, and said once.)
  // (each thread from chunks of its own, so threads don't wait on one another)
  function alloc(n: number): number {
    n = (n + 3) & -4;
    let at = w(THREAD + T_CHUNK);
    if (at + n > w(THREAD + T_CHUNK_END)) {
      const size = n > CHUNK ? n : CHUNK;
      at = xadd(HEAP, size);
      if (at + size > w(LIMIT)) { if (DEBUG) debug(D_OOM, n, 0, 0); if (!xadd(OOM, 1)) log(0, L_OOM, 0, 0); return w(TRASH); }
      set(THREAD + T_CHUNK_END, at + size);
    }
    set(THREAD + T_CHUNK, at + n);
    return at;
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
      set(tk + T_START, w(caps + 8 * i)); set(tk + T_END, w(caps + 8 * i + 4)); set(tk + T_VIS, w(rule + R_PART + PART * part(rule, i) + 16)); set(tk + T_ORIGIN, names); set(tk + T_THIS, written);
    }
    if (rule) {
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
    if (w(THREAD + T_QUIET)) return;
    const k = xadd(LOG_N, 1);
    if (k < w(LOG_CAP)) { const e = w(LOG) + 16 * k; set(e, at); set(e + 4, kind); set(e + 8, a); set(e + 12, c); }
  }
  function say(t: number, at: number, kind: number, a: number, c: number) { log(at, kind, a, c); set(t + T_SAID, w(t + T_SAID) + 1); }
  // (going to a label, or stopped: what was run returns, until what has the label, or the statement)
  function stopped(t: number) { return w(t + T_JUMP_N) || w(t + T_FAULT) || w(OOM); }
  // (the text from s to e one of the words the host knows?)
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
    if (w(OPEN_LENGTH) === 1 && w(CLOSE_LENGTH) === 1) { const k = b(w(PAIRS) + b(at)); return k ? k + 8 : 0; }
    let l = w(OPEN_LENGTH);
    if (at + l <= end && same(at, w(OPEN), l)) return l * 8 + 5;
    l = w(CLOSE_LENGTH);
    if (at + l <= end && same(at, w(CLOSE), l)) return l * 8 + 6;
    const k = b(w(PAIRS) + b(at));
    return k ? k + 8 : 0;
  }
  // Past what opens at `at`: to after what closes it (what opens inside it, past that too), or a quote's text.
  function past(at: number, end: number): number {
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
  function line(at: number, end: number) {
    let from = at; while (b(from - 1) !== 10 && b(from - 1) !== 0) from--;
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
  // Do the characters at a and c belong apart (a literal begins or ends between them)? Each character has a kind: a space (0),
  // one of a word (1), one of an operator (2), or one on its own (3: a bracket, a quote, a comma).
  function apart(a: number, c: number) { const t = w(CLASSES), x = b(t + b(a)), y = b(t + b(c)); return x !== y || x === 0 || x === 3 ? 1 : 0; }
  // From `at` to `end`, what the type's own rules read whole?
  function typed(at: number, end: number, type: number, s: number): number {
    // (a text: itself)
    if (w(type + N_IS) === IS_TEXT) return trimmed(w(type + N_A), w(type + N_B) - w(type + N_A), at, end) ? 1 : 0;
    // (by its own rules with holes: what it holds under a name is no reading of it)
    const sc = s + SCRATCH;
    if (read(at, end, latest(type), w(type + N_BASE), HOLES, METHOD, sc) !== end) return 0;
    // (and what it reads it as: one whose body is a hole of its own is the text; any other, a value (a narrowing's, when what
    // it narrows to holds), read here without saying anything: one that says something, or is none, is no reading)
    const rule = w(sc + 512), holes = w(rule + R_HOLES);
    if (named(rule, w(rule + R_BS), w(rule + R_BE)) >= 0 || ref(rule, 0, w(rule + R_BS), w(rule + R_BE), 1)) return 1;
    // (a check that needs checks of what it is checking, again and again: no reading)
    const quiet = w(THREAD + T_QUIET);
    if (quiet >= TYPINGS) return 0;
    const caps = alloc(8 * holes);
    for (let i = 0; i < holes; i++) { set(caps + 8 * i, w(sc + 516 + 12 * i)); set(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
    const said = w(THREAD + T_SAID), hole = w(THREAD + T_HOLE), fault = w(THREAD + T_FAULT), jump = w(THREAD + T_JUMP_N);
    set(THREAD + T_QUIET, quiet + 1); set(THREAD + T_HOLE, 0); set(THREAD + T_FAULT, 0); set(THREAD + T_JUMP_N, 0);
    const v = apply(THREAD, rule, caps, frame(0, 0, type, at, end, 0, 0, type, type), 0, type, at, end, type, type);
    const ok = v && w(THREAD + T_SAID) === said && !w(THREAD + T_FAULT) && !w(THREAD + T_JUMP_N) ? 1 : 0;
    set(THREAD + T_QUIET, quiet); set(THREAD + T_SAID, said); set(THREAD + T_HOLE, hole); set(THREAD + T_FAULT, fault); set(THREAD + T_JUMP_N, jump);
    return ok;
  }

  // Rule r's head from part k, at `at`: where it ends (-1: it doesn't match), each hole's span at s. A hole ends the nearest the
  // rest matches, nothing open in it (and, typed, what its type reads whole); the last one at the end of the line.
  function match(r: number, k: number, at: number, end: number, s: number): number {
    const n = w(r + R_PARTS);
    while (k < n) {
      const q = r + R_PART + PART * k, kind = w(q) & 15, hug = w(q) & HUG, a = w(q + 4), len = w(q + 8), type = w(q + 16);
      if (type === 1) return -1;
      if (kind === LITERAL) {
        if (at + len > end || !same(at, a, len) || !apart(at - 1, at)) return -1;
        at += len;
        if (at < end && !apart(at - 1, at)) return -1;
        k++; continue;
      }
      // (a space, and in what continues a statement, a newline)
      if (kind === SPACE) { const from = at; while (at < end && b(at) <= 32) at++; if (at === from && hug) return -1; k++; continue; }
      const cap = s + 12 * w(q + 12);
      k++;
      if (k === n) {
        // (the last: to the end of the line; written against text, not beginning with a space, and none in it outside brackets
        // (`.{member}` of `.me() == p` is `me()`, what follows read on what it answers); a word, of a word's characters)
        if (hug && b(at) <= 32) return -1;
        let p = line(at, end);
        if (hug) { let q = at; while (q < p && b(q) > 32) q = (bracket(q, p) & 3) === 1 ? past(q, p) : q + 1; if (q < p) p = q; }
        while (p > at && b(p - 1) <= 32) p--;
        if (p <= at) return -1;
        if (w(q) & WORD) for (let x = at; x < p; x++) if (b(w(CLASSES) + b(x)) !== 1) return -1;
        if (type && !typed(at, p, type, s)) return -1;
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
        // (typed: what its type reads, too)
        if (type && !typed(at, p, type, s)) return -1;
        const e: number = match(r, k, p, end, s);
        if (e < 0) return -1;
        set(cap, at); set(cap + 4, p);
        return e;
      }
      for (let p = at; p < end;) {
        if (p > at && apart(p - 1, p) && (!type || typed(at, p, type, s))) {
          const e: number = match(r, k, p, end, s);
          if (e >= 0) { set(cap, at); set(cap + 4, p); return e; }
        }
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

  // A statement at `at`, read with the rules from `vis` on (to `stop`), the ones `want` asks for and not `refuse`: where it ends
  // (-1: none reads it). Of the rules that read the whole line, a definition first, then one led by text, then the latest
  // (declaration order is precedence: what is declared last binds loosest); it goes at s + 512, its holes' spans after it. Past a
  // node's own rules: what it is also made of (and what that sees), then its parent's.
  function read(at: number, end: number, vis: number, stop: number, want: number, refuse: number, s: number): number {
    let best = 0, longest = -1, ends = -1, backs = 0;
    const out = s + 512, has = bytes(at, end), led = 1 + (b(at) & 31), back = s + 800;
    for (let r = vis; r && r !== stop;) {
      // (a node's rules, from r: the ones led by a hole, then the ones led by text that begins as this does; each in the
      // order they were declared, the last first)
      let x = r;
      for (let pass = 0; pass < 2; pass++) {
        x = r;
        while (x && x !== stop && !(w(x + R_FLAGS) & DEAD)) {
          const f = w(x + R_FLAGS), tb = w(x + R_SKIP);
          if (kind_of(x) === (pass ? led : 0) && (f & want) === want && !(f & refuse) && !(w(x + R_MASK) & ~has) && (f & LED ? b(at) === b(w(x + R_PART + 4)) : written(x, at, end))) {
            let e = match(x, 0, at, end, s);
            if (e >= 0) {
              while (e < end && b(e) <= 32) e++;
              const score = (f & 1) * 2 + ((f >> 1) & 1);
              if (e >= end && score > longest) {
                best = x; longest = score; ends = e;
                const h = w(x + R_HOLES) * 12;
                for (let i = 0; i < h; i += 4) set(out + 4 + i, w(s + i));
              }
            }
          }
          x = tb ? w(tb + 4 * (pass ? led : 0)) : w(x);
        }
      }
      // (past its rules (x, where they end): what it is also made of (and what that sees, and so on), then its parent's)
      if (!x || x === stop) break;
      r = w(x);
      if (!r) {
        const o = w(x + R_OWNER);
        if (o && w(o + N_ALSO) && backs < 48) { set(back + 4 * backs, w(o + N_PARENT)); backs++; r = latest(w(o + N_ALSO)); continue; }
        let p = o ? w(o + N_PARENT) : 0;
        while (!p && backs) { backs--; p = w(back + 4 * backs); }
        if (!p) break;
        r = latest(p);
      }
    }
    set(out, best);
    return ends;
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
    // (what a hole being declared reads, the names in it: no reader reads them)
    if (w(t + T_HOLE)) refuse |= READER;
    // (read once: the same text, with the same rules and names, is the same reading; not one in a frame, nor one nothing read)
    const flags = want | refuse << 8 | on << 16, framed = s < e && w(self + N_IS) === IS_FRAME;
    let slot = 0;
    if (!framed && w(MEMO) && !w(THREAD + T_SH_N)) {
      for (let h = (s * 31 + vis * 17 + rule * 13 + e) & w(MEMO_MASK), n = 0; n < 32; n++, h = (h + 1) & w(MEMO_MASK)) {
        const m = w(MEMO) + 32 * h, at = aload(m);
        if (!at) { slot = m; break; }
        if (at === s && w(m + 4) === e && w(m + 8) === vis && w(m + 12) === rule && w(m + 16) === closure && w(m + 20) === flags && w(m + 24) === stop) { const kept = aload(m + 28); if (kept) return kept; break; }
      }
    }
    const r = remembered(t, s, e, rule, closure, vis, self, want, stop, refuse, on);
    if (slot && w(r) !== K_UNREAD && cas(slot, 0, s) === 0) { set(slot + 4, e); set(slot + 8, vis); set(slot + 12, rule); set(slot + 16, closure); set(slot + 20, flags); set(slot + 24, stop); astore(slot + 28, r); }
    return r;
  }
  function remembered(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, want: number, stop: number, refuse: number, on: number): number {
    const r = alloc(READ), left = want & LEFT;
    want &= ~LEFT;
    set(r + 4, s); set(r + 8, e);
    if (s >= e) { set(r, K_EMPTY); return r; }
    // (read in a frame: what it holds: its takes as text, its caller, its this)
    if (w(self + N_IS) === IS_FRAME) {
      const ns = b(s) === 46 ? s + 1 : s;
      let h = -3;
      if (word(ns, e, W_CALLER)) h = -1; else if (word(ns, e, W_THIS)) h = -2; else if (w(self + F_RULE)) { const i = named(w(self + F_RULE), ns, e); if (i >= 0) h = i; }
      if (h !== -3) { set(r, K_HELD); set(r + 12, h); return r; }
    }
    // (in what a body inlined, `{{x}}`: the names of where that was written)
    // (its own holes first, the parameters of the rule it is in; then that one's names)
    let names = 0;
    if (rule && w(rule + R_INL_F) && s >= w(rule + R_INL_S) && e <= w(rule + R_INL_E) && !ref(rule, 0, s, e, 1) && !ref(rule, 0, s, e, 0)) { names = w(rule + R_INL_F); rule = w(names + F_RULE); closure = w(names + F_CLOSURE); }
    let x = ref(rule, closure, s, e, 1);
    if (x) { set(r, K_REF); set(r + 12, (x - 1) >> 16); set(r + 16, (x - 1) & 0xFFFF); set(r + 20, names); return r; }
    x = ref(rule, closure, s, e, 0);
    if (x) { set(r, K_NAME); set(r + 12, (x - 1) >> 16); set(r + 16, (x - 1) & 0xFFFF); set(r + 20, names); return r; }
    const sc = w(t + T_SCRATCH);
    const end = read(s, e, vis, stop, want | (!refuse && defines(s, e) ? DEFINES : 0), refuse | (on ? 0 : METHOD), sc);
    if (end >= 0) {
      const found = w(sc + 512), holes = w(found + R_HOLES), caps = alloc(8 * holes);
      for (let i = 0; i < holes; i++) { set(caps + 8 * i, w(sc + 516 + 12 * i)); set(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
      set(r, K_RULE); set(r + 12, found); set(r + 16, caps); return r;
    }
    set(r, K_UNREAD);
    if (want & HOLES) return r;
    // (a value, then the rest read on it: the first place what follows is read whole on a value (led by text) and what is before
    // it reads: `x.f(1)` is `f(1)` read in x; what follows begins with an operator or a bracket, or after a space)
    for (let p = s; p < e;) {
      if (p > s && b(p) > 32 && (b(w(CLASSES) + b(p)) !== 1 || b(p - 1) <= 32) && read(p, e, vis, stop, LED | (defines(p, e) ? DEFINES : 0), 0, sc) >= 0) {
        const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0);
        if ((w(o) !== K_UNREAD || (left && worded(s, p))) && w(o) !== K_EMPTY) { set(r, K_ON); set(r + 12, o); set(r + 16, p); set(r + 20, e); return r; }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    return r;
  }

  // ---- running

  // What a reading answers. `names` is the frame whose names it was written with, `f` the one it is run in, `self` what it is
  // read in, `on` what it is read on (`.`, `this`), `written` where its text is (where what its holes take is read); `value`:
  // wanted as a value (text nothing reads is a place).
  function ev(t: number, r: number, names: number, f: number, self: number, value: number, written: number, on: number): number {
    const k = w(r);
    if (k === K_EMPTY) return 0;
    if (k === K_LATER) return ev(t, reading(t, w(r + 4), w(r + 8), w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0), names, f, self, value, self, self);
    if ((k === K_NAME || k === K_REF) && w(r + 20)) names = w(r + 20);
    if (k === K_NAME) return valued(t, take(names, w(r + 12), w(r + 16)));
    // (`{x}`: its code, read where it is used (its type said what it matched, not where it is read))
    if (k === K_REF) {
      const tk = follow(take(names, w(r + 12), w(r + 16)), 0);
      // (in a left side, a hole's code spliced where it is used, one word: declared, a place there (`.{member}`'s member))
      if (w(t + T_DECL) && worded(w(tk), w(tk + 4))) return placed(t, w(tk), w(tk + 4), self);
      return block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, self, 0, value, 1, self); }
    if (k === K_HELD) {
      const h = w(r + 12);
      if (h === -1) return w(self + F_CALLER);
      // (`this`: what it was read on; else what it is read in, and in a method, a node made there is what that is read on)
      if (h === -2) { const th = w(self + F_THIS), rc = w(self + F_RECEIVER); return rc !== th ? rc : (w(th + N_ALSO) || th); }
      const tk = follow(self + F_TAKES + TAKE * h, 0);
      return node(IS_TEXT, w(tk), w(tk + 4), w(GLOBAL), 0);
    }
    if (k === K_RULE) return apply(t, w(r + 12), w(r + 16), names, f, self, w(r + 4), w(r + 8), written, on);
    if (k === K_ON) return onto(t, r, names, f, self, value, written);
    const s = w(r + 4), e = w(r + 8);
    if (!value) { say(t, s, L_UNREAD, s, e); return 0; }
    // (in a hole: the hole; in a test, an error: the test failed; else a place, named by the text, here)
    const hole = w(t + T_HOLE);
    if (hole) {
      if (!w(hole + N_A)) { set(hole + N_A, s); set(hole + N_B, e); declare(t, hole, s, e); return hole; }
      if (trimmed(w(hole + N_A), w(hole + N_B) - w(hole + N_A), s, e)) return hole;
      // (another name in it: one of its own, `{a, b}` two holes)
      const other = node(IS_HOLE, s, e, w(hole + N_PARENT), 0);
      declare(t, other, s, e);
      return other;
    }
    // (in a test, an error; but in a node a rule is making (`external .`, while it runs), a place: a name it is given, it has)
    if (w(t + T_TESTING) && !making(self)) { say(t, s, L_UNREAD, s, e); if (w(FAIL_FAST)) { jump(t, W_ERRED, 0); set(t + T_ERRED, 1); return 0; } }
    const place = node(IS_PLACE, s, e, self, 0), named_ = alloc(R_PART + PART);
    set(named_ + R_KIND, VALUE); set(named_ + R_MASK, bytes(s, e)); set(named_ + R_BS, place); set(named_ + R_PARTS, 1); set(named_ + R_FLAGS, LED);
    set(named_ + R_HEAD, node(IS_HEAD, s, e, self, 0)); set(named_ + R_OWNER, self); set(named_ + R_PART + 4, s); set(named_ + R_PART + 8, e - s);
    link(self, named_);
    return place;
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
  function worded(s: number, e: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e) return 0; for (let i = s; i < e; i++) if (b(w(CLASSES) + b(i)) !== 1) return 0; return 1; }
  // (a name declared where it is read: a place there, by that name)
  function placed(t: number, s: number, e: number, self: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; return node(IS_PLACE, s, e, self, 0); }
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
    if (older(self)) { const sh = shadow(self); if (sh) { set(rule + R_PREV, w(sh + 4)); skips(rule); set(sh + 4, rule); return; } }
    for (;;) { const last = w(self + N_LAST); set(rule + R_PREV, last); skips(rule); if (cas(self + N_LAST, last, rule) === last) return; }
  }
  // (a rule's kind, as a reading looks for it: led by a hole (0), or by text, by which of 32 kinds its first character is)
  function kind_of(r: number) { return w(r + R_FLAGS) & LED ? 1 + (b(w(r + R_PART + 4)) & 31) : 0; }
  // (for each kind, the next rule of it after this one, the rules before it: so a reading passes over the ones it can't be)
  function skips(r: number) {
    const p = w(r + R_PREV);
    let tb = w(r + R_SKIP);
    if (!tb) { tb = alloc(4 * SKIPS); set(r + R_SKIP, tb); }
    const pt = p && !(w(p + R_FLAGS) & DEAD) ? w(p + R_SKIP) : 0;
    if (!pt) { for (let k = 0; k < SKIPS; k++) set(tb + 4 * k, p); return; }
    for (let k = 0; k < SKIPS; k++) set(tb + 4 * k, w(pt + 4 * k));
    set(tb + 4 * kind_of(p), p);
  }
  // A test's own: what it writes in a node made before it is a shadow of that node's rules, seen in that test (and the ones it
  // holds) only, so that it changes nothing another test reads (the test's own frame is its own).
  function older(n: number) {
    if (!w(THREAD + T_ISO) || n === w(THREAD + T_ROOT) || n >= w(THREAD + T_MARK)) return 0;
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
    set(sh + 12 * k, n); set(sh + 12 * k + 4, w(n + N_LAST)); set(sh + 12 * k + 8, w(n + N_LAST)); set(THREAD + T_SH_N, k + 1);
    return sh + 12 * k;
  }
  // (isolated from here on: what is made from now is its own, what was made before it shadows)
  function isolate(t: number, root: number) { set(t + T_MARK, aload(HEAP)); set(t + T_MARK_LO, w(t + T_CHUNK)); set(t + T_MARK_HI, w(t + T_CHUNK_END)); set(t + T_SH_N, 0); set(t + T_ROOT, root); set(t + T_ISO, 1); }
  // A value, then the rest read on it: what that answers (and, at T_ON, the value). (What is read on a member, `x.f(y)`, is read
  // on what `f` is with x as `this`.)
  function onto(t: number, r: number, names: number, f: number, self: number, value: number, written: number): number {
    const p = w(r + 12);
    let on = 0, receiver = self;
    // (what the rest is read on: a value, in a left side too, `x` of `x.m`)
    const declaring = w(t + T_DECL);
    // (in a left side, brackets after it, `f (x)`, `x.m (y)`: it declared, a place, and they its head)
    const rs = skip(w(r + 16), w(r + 20));
    if (declaring && rs < w(r + 20) && (bracket(rs, w(r + 20)) & 3) === 1 && bracket(rs, w(r + 20)) !== 5 + 8 * w(OPEN_LENGTH) && past(rs, w(r + 20)) >= w(r + 20)) {
      const ps = w(p + 4), pe = w(p + 8);
      const place = worded(ps, pe) ? placed(t, ps, pe, self) : ev(t, p, names, f, self, 1, written, self);
      if (place && w(place + N_IS) === IS_PLACE) return node(IS_CALLED, rs, w(r + 20), place, 0);
    }
    set(t + T_DECL, 0);
    if (w(p) === K_ON) { on = onto(t, p, names, f, self, 1, written); receiver = w(t + T_ON); }
    else on = ev(t, p, names, f, self, 1, written, self);
    set(t + T_DECL, declaring);
    if (stopped(t)) return 0;
    if (!on) on = w(GLOBAL);
    const rest = reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, LED, 0, 0, 1);
    if (w(rest) !== K_UNREAD) { const v: number = ev(t, rest, names, f, on, value, written, receiver); set(t + T_ON, on); return v; }
    say(t, w(r + 16), L_NOT_ON, w(r + 16), w(r + 20));
    set(t + T_ON, on);
    return 0;
  }
  // Code read (in `self`; in brackets, what is inside them): each statement, the last one's value.
  function block(t: number, s: number, e: number, names: number, f: number, self: number, vis: number, value: number, brackets: number, written: number): number {
    if (brackets) { code(t, s, e); s = w(t + T_A); e = w(t + T_B); }
    // (read in what it reads, too deep: a hole whose code is read as itself)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (DEBUG && !w(t + T_FAULT)) debug(D_FAULT, L_DEEP, s, e); set(t + T_FAULT, L_DEEP); return 0; }
    set(t + T_DEPTH, depth + 1);
    if (DEBUG) debug(D_BLOCK, s, e, 0);
    let answer = 0;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), last = skip(ln, e) >= e ? 1 : 0;
      answer = ev(t, reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), vis ? latest(vis) : latest(self), self, 0, vis ? w(vis + N_BASE) : 0, 0, 0), names, f, self, value & last, written, self);
      if (stopped(t)) { set(t + T_DEPTH, depth); if (DEBUG) debug(D_BLOCK_END, s, e, 0); return 0; }
      at = ln;
    }
    set(t + T_DEPTH, depth);
    if (DEBUG) debug(D_BLOCK_END, s, e, 0);
    return answer;
  }

  // A rule applied: a frame for what its holes took (written with `names`, run from `f`, in `self`).
  function apply(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const kind = w(rule + R_KIND);
    if (kind === VALUE) return w(rule + R_BS);
    if (kind === EXTERNAL) {
      const a = skip(w(caps), w(caps + 4));
      let z = w(caps + 4); while (z > a && b(z - 1) <= 32) z--;
      let m = a; while (m < z && b(m) > 32) m++;
      const rest = skip(m, z);
      if (word(a, m, W_DOT)) { const th = w(names + F_THIS), rc = w(names + F_RECEIVER), n = node(IS_NODE, 0, names, th, rc !== th ? rc : 0); set(names + F_THIS, n); return n; }
      if (word(a, m, W_AMP)) return names;
      if (word(a, m, W_GOTO)) { go(t, rest, z - rest, f, 0); return 0; }
      if (word(a, m, W_INCLUDE) || word(a, m, W_READ)) { files(word(a, m, W_INCLUDE) ? 1 : 2, rest, z, names); return 0; }
      if (!word(a, m, W_LABEL)) say(t, s, L_EXTERNAL, a, m);
      return 0;
    }
    const budget = w(t + T_BUDGET) - 1;
    set(t + T_BUDGET, budget);
    if (budget < 0) { if (DEBUG && !w(t + T_FAULT)) debug(D_FAULT, L_BUDGET, s, e); set(t + T_FAULT, L_BUDGET); return 0; }
    // (out of memory: nothing more is made)
    if (w(OOM)) return 0;
    const applied = frame(rule, f, self, s, e, caps, names, written, on);
    if (kind === DEFINE) { if (DEBUG) debug(D_APPLY, s, e, rule); const d = define(t, applied); if (DEBUG) debug(D_APPLY_END, s, e, rule); return d; }
    // (applied in what it applies, too deep: what it reads reads itself)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (DEBUG && !w(t + T_FAULT)) debug(D_FAULT, L_DEEP, s, e); set(t + T_FAULT, L_DEEP); return 0; }
    set(t + T_DEPTH, depth + 1);
    if (DEBUG) debug(D_APPLY, s, e, rule);
    const answer = exec(t, applied, body(t, rule), 0);
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
    let root = f; while (root && !(w(root + N_A) & ROOT)) root = w(root + F_CALLER);
    const rule = w(f + F_RULE), tk = rule && w(rule + R_HOLES) ? follow(f + F_TAKES, 0) : 0;
    say(t, w((root || f) + F_START), L_REPORT, tk ? w(tk) : 0, tk ? w(tk + 4) : 0);
    // (and the rule that said it, whose style says how much it matters)
    if (rule) log(w((root || f) + F_START), L_STYLED, w(rule + R_HEAD), 0);
  }
  // (the last of a body's labels written as the text from s, n long: where it is, or -1)
  function labelled(bd: number, s: number, n: number) {
    for (let k = w(bd) - 1; k >= 0; k--) { const st = bd + 4 + STEP * k; if (w(st) === S_LABEL && w(st + 16) === n && same(w(st + 12), s, n)) return k; }
    return -1;
  }
  // A body run: its statements one after another, a label jumped to where it is (one written as a value, where what is gone to
  // is that value). Going to `afterwards`: the rest put off (a test).
  function exec(t: number, f: number, bd: number, from: number): number {
    let answer = 0;
    const n = w(bd);
    for (let pc = from; pc < n;) {
      const st = bd + 4 + STEP * pc, kind = w(st), self = w(f + F_THIS);
      if (kind === S_LABEL || kind === S_LABELLED) { pc++; continue; }
      if (kind === S_GOTO) {
        const to = labelled(bd, w(st + 12), w(st + 16));
        if (to >= 0) { pc = to; continue; }
        if (word(w(st + 12), w(st + 12) + w(st + 16), W_AFTERWARDS)) { defer(f, pc + 1); return 0; }
        go(t, w(st + 12), w(st + 16), f, answer);
      } else if (kind === S_TO) {
        const target = of(t, w(st + 12), f, self);
        if (stopped(t)) return 0;
        let to = pc + 1;
        for (let j = 0; j < n; j++) { const o = bd + 4 + STEP * j; if (w(o) === S_LABELLED && of(t, w(o + 12), f, self) === target) { to = j; break; } }
        pc = to; continue;
      } else answer = ev(t, w(st + 12), f, f, self, pc === n - 1 ? 1 : 0, self, self);
      if (w(t + T_FAULT) || w(OOM)) return 0;
      const jn = w(t + T_JUMP_N);
      if (jn) {
        const js = w(t + T_JUMP_S), to = labelled(bd, js, jn);
        if (to >= 0) { pc = to; if (w(t + T_JUMP_V)) answer = w(t + T_JUMP_V); set(t + T_JUMP_N, 0); continue; }
        if (word(js, js + jn, W_AFTERWARDS)) { set(t + T_JUMP_N, 0); defer(f, pc + 1); return 0; }
        return 0;
      }
      pc++;
    }
    return answer;
  }
  // (a label written as a value, or where to go: what the hole took, as a value)
  function of(t: number, r: number, f: number, self: number): number { return w(r) === K_REF || w(r) === K_NAME ? valued(t, take(f, w(r + 12), w(r + 16))) : ev(t, r, f, f, self, 1, self, self); }
  // (put off: the rest of a frame's body, from a step; in a test, held until that test is done, so it is run after it)
  function defer(f: number, from: number) {
    if (w(THREAD + T_TESTING)) {
      if (!w(THREAD + T_HELD)) set(THREAD + T_HELD, alloc(8 * HELD));
      const n = w(THREAD + T_HELD_N);
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
    const s = w(rule + R_BS), e = w(rule + R_BE), closure = w(rule + R_CLOSURE), vis = w(rule + R_PREV), self = w(GLOBAL);
    // (read for every test alike: none's shadows)
    const shadows = w(THREAD + T_SH_N);
    set(THREAD + T_SH_N, 0);
    let lines = 1; for (let i = s; i < e; i++) if (b(i) === 10) lines++;
    bd = alloc(4 + STEP * lines);
    let n = 0;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), r = reading(t, at, ln, rule, closure, vis, self, 0, 0, 0, 0), st = bd + 4 + STEP * n;
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
      set(st, S_READ); set(st + 12, r);
    }
    set(bd, n);
    set(THREAD + T_SH_N, shadows);
    cas(rule + R_BODY, 0, bd);
    return w(rule + R_BODY);
  }

  // ---- defining

  // The primitive: `rules[lhs] := rhs`, in what it is read in; the head read with the rules there, the body what the right hole
  // took (code, with the names of where it was written). A head defined again there is that rule, given this body.
  function define(t: number, f: number): number {
    let self = w(f + F_THIS);
    const hd = follow(f + F_TAKES, 0), bd = follow(f + F_TAKES + TAKE, 0);
    set(THREAD + T_PLACE_IN, 0);
    spliced(hd);
    // (a head that declared a name somewhere, `x.m`: defined there)
    if (w(THREAD + T_PLACE_IN)) self = w(THREAD + T_PLACE_IN);
    let hs = w(THREAD + T_A), he = w(THREAD + T_B);
    // (a head that is neither a pattern (it has no holes) nor a name: an expression, read as a left side: the name it declares,
    // where it declares it (`x.m`: m, in x); one that declares nothing (`[]`, `.`) is the text it is)
    if (!pattern(hs, he, 0) && !worded(hs, he)) {
      const o = w(hd + T_ORIGIN), declaring = w(t + T_DECL);
      set(t + T_DECL, 1);
      const v = ev(t, reading(t, hs, he, o ? w(o + F_RULE) : 0, o ? w(o + F_CLOSURE) : 0, latest(self), self, LEFT, 0, 0, 0), o || frame(0, 0, self, hs, he, 0, 0, self, self), f, self, 1, self, self);
      set(t + T_DECL, declaring);
      if (v && w(v + N_IS) === IS_PLACE && w(v + N_A) && w(v + N_B) > w(v + N_A)) { hs = w(v + N_A); he = w(v + N_B); if (w(v + N_PARENT)) self = w(v + N_PARENT); }
      set(t + T_FAULT, 0); set(t + T_JUMP_N, 0);
      // (a place and its head, `f (x)`: the place given what `(x) => body` is, a closure)
      if (v && w(v + N_IS) === IS_CALLED) return called(t, v, bd, w(hd + T_ORIGIN), self);
    }
    inlined(bd);
    if (DEBUG) debug(D_DEFINE, hs, he, self);
    const inl_s = w(THREAD + T_INL_S), inl_e = w(THREAD + T_INL_E), inl_f = w(THREAD + T_INL_F);
    const r = rule_(t, self, hs, he, w(THREAD + T_A), w(THREAD + T_B), w(bd + T_ORIGIN), w(hd + T_ORIGIN));
    set(r + R_INL_S, inl_s); set(r + R_INL_E, inl_e); set(r + R_INL_F, inl_f);
    log(w(hd), L_DEFINED, w(hd), w(hd + 4));
    return w(r + R_HEAD);
  }
  // (a place called with its head, `f (x) => body`: `(x) => body` read where it was written, its body with the names of where
  // that was (the text made of both: the head's part read with the head's names, the body's with the body's), and the place
  // given what it answers)
  function called(t: number, v: number, bd: number, names: number, self: number): number {
    const hs = w(v + N_A), he = w(v + N_B), place = w(v + N_PARENT), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    const n = (he - hs) + 1 + sn + 3 + (be - bs) + 1, text = alloc(n);
    let at = text;
    for (let i = hs; i < he; i++) setb(at++, b(i));
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    // (the body, in brackets: one block, its value its last statement's)
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    // (what it is read with: a rule of no holes whose names are the head's, the body's span the body's)
    const rule = alloc(R_PART); set(rule + R_CLOSURE, names); set(rule + R_INL_S, body); set(rule + R_INL_E, body_end); set(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const value = ev(t, reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0), fr, fr, self, 1, self, self);
    if (!value || stopped(t)) return 0;
    return bound(w(place + N_A), w(place + N_B), w(place + N_PARENT) || self, value);
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
  function inlined(bd: number) {
    const s = w(bd), e = w(bd + 4), o = w(bd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    set(THREAD + T_A, s); set(THREAD + T_B, e); set(THREAD + T_INL_S, 0); set(THREAD + T_INL_E, 0); set(THREAD + T_INL_F, 0);
    if (!o || !w(o + F_RULE)) return;
    let n = 0, any = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s; at < e;) {
        // (`{{x}}`: a hole's brackets around `{x}`, a hole of it)
        let x = 0;
        if (bracket(at, e) === hole && bracket(at + open, e) === hole) {
          const inner = past(at + open, e);
          if (past(at, e) === inner + close) x = ref(w(o + F_RULE), w(o + F_CLOSURE), at + 2 * open, inner - close, 0);
        }
        if (x) {
          const tk = follow(take(o, (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
          // (code written in brackets, `{ … }`: what is inside them, as a rule's body is)
          code(THREAD, w(tk), w(tk + 4)); const ca = w(THREAD + T_A), cz = w(THREAD + T_B);
          // (what it took keeps the names of where it was written: what is read in it is read with them)
          if (pass && !w(THREAD + T_INL_F)) { set(THREAD + T_INL_S, out + n); set(THREAD + T_INL_E, out + n + cz - ca); set(THREAD + T_INL_F, w(tk + T_ORIGIN)); }
          for (let i = ca; i < cz; i++) { if (pass) setb(out + n, b(i)); n++; }
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
  function spliced(hd: number) {
    const s = w(hd), e = w(hd + 4), o = w(hd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    set(THREAD + T_A, s); set(THREAD + T_B, e);
    if (!o || !w(o + F_RULE)) return;
    // (what each took, found once (pass 0), then written (pass 1))
    const SUBS = 32, subs = alloc(8 * SUBS);
    let n = 0, any = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s, depth = 0, k = 0; at < e;) {
        const x = bracket(at, e) === hole ? ref(w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0) : 0;
        if (x) {
          let a = 0, z = 0;
          if (pass) { a = w(subs + 8 * k); z = w(subs + 8 * k + 4); }
          else {
            const tk = follow(take(o, (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
            a = skip(w(tk), w(tk + 4)); z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
            // (one that took code, not a name: what it answers, when that is a name (a place, what a rule was named, a text));
            // but in brackets, part of what is read as a whole (`({lhs} => {rhs}).style`): as written
            let name = 1; for (let i = a; i < z; i++) if (b(w(CLASSES) + b(i)) !== 1) name = 0;
            // (one that took a pattern, `{x} + {y}` (holes of none of where it was written): a head, as written)
            if (!name && !depth && !pattern(a, z, w(tk + T_ORIGIN))) {
              // (read as a left side: what it declares; what it runs defines with places of its own, not this one's)
              const declaring = w(THREAD + T_DECL), into = w(THREAD + T_PLACE_IN); set(THREAD + T_DECL, 1);
              const v = valued(THREAD, take(o, (x - 1) >> 16, (x - 1) & 0xFFFF)), is = v ? w(v + N_IS) : -1;
              set(THREAD + T_DECL, declaring); set(THREAD + T_PLACE_IN, into);
              if (is === IS_PLACE || is === IS_HEAD || is === IS_TEXT) { a = w(v + N_A); z = w(v + N_B); }
              if (is === IS_PLACE && w(v + N_PARENT)) set(THREAD + T_PLACE_IN, w(v + N_PARENT));
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
      if (!pass) { out = alloc(n); n = 0; }
      else { set(THREAD + T_A, out); set(THREAD + T_B, out + n); }
    }
  }
  function rule_(t: number, self: number, hs: number, he: number, bs: number, be: number, closure: number, names: number): number {
    const r = head(t, hs, he, latest(self), names);
    // (a body written in brackets is what is inside them; one that is `{name}`, a hole of its own, is that hole's code)
    if (!ref(r, 0, bs, be, 1)) { code(t, bs, be); bs = w(t + T_A); be = w(t + T_B); }
    for (let o = latest(self); o && o !== w(self + N_BASE) && !older(self); o = w(o)) {
      if (w(o + R_KIND) !== RULE || (w(o + R_FLAGS) & DEAD) || !alike(o, r)) continue;
      // (one with holes: that rule given this one's parts and body, for what read it already; and this one placed last, binding
      // loosest)
      if (w(o + R_HOLES)) {
        for (let i = 0; i < PART * w(r + R_PARTS); i += 4) set(o + R_PART + i, w(r + R_PART + i));
        set(o + R_MASK, w(r + R_MASK));
        set(o + R_BS, bs); set(o + R_BE, be); set(o + R_CLOSURE, closure); set(o + R_HEAD, w(r + R_HEAD)); set(o + R_BODY, 0);
        break;
      }
      set(o + R_BS, bs); set(o + R_BE, be); set(o + R_CLOSURE, closure); set(o + R_BODY, 0);
      return o;
    }
    set(r + R_OWNER, self); set(r + R_BS, bs); set(r + R_BE, be); set(r + R_CLOSURE, closure);
    link(self, r);
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
    let hole = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) {
      const q = rule + R_PART + PART * k;
      if (w(q) !== HOLE) continue;
      const a = w(q + 4), z = a + w(q + 8), nd = node(IS_HOLE, 0, 0, owner(vis), 0);
      // (read with the names of where it is written: `{x: a}` in a rule's body, its `a`)
      const r = vis ? reading(t, a, z, names ? w(names + F_RULE) : 0, names ? w(names + F_CLOSURE) : 0, vis, nd, HOLES, 0, DEFINES | READER, 0) : 0;
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
      set(q + 12, hole); hole++; set(q + 16, type && type !== nd && w(type + N_IS) !== IS_HOLE ? type : 0); set(q + 20, nd);
      // (a type nothing reads yet, `{x: T}` before T is there: none yet, the rule reads nothing until it is)
      if (type === nd || (type && w(type + N_IS) === IS_HOLE)) { set(q + 16, 1); const k = xadd(LAZY_N, 1), l = w(LAZY) + 24 * k; if (k < w(LAZY_CAP)) { set(l, q); set(l + 4, r); set(l + 8, a); set(l + 12, z); set(l + 16, vis); set(l + 20, names); } }
    }
    set(rule + R_HOLES, hole);
    const n = w(rule + R_PARTS), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    // (one whose head is one hole: a reader, not read in a hole, which names what it holds)
    let flags = (n > 0 && w(led) === LITERAL ? LED : 0) | (hole > 0 ? HOLES : 0) | (method ? METHOD : 0) | (n === 1 && (w(led) & 15) === HOLE ? READER : 0);
    for (let k = 0; k < n; k++) { const q = rule + R_PART + PART * k; if (w(q) === LITERAL && w(q + 8) === sn && sn && same(w(q + 4), sep, sn)) flags |= DEFINES; }
    set(rule + R_FLAGS, flags);
    // (a head that is one hole between two characters makes them a pair, as the brackets are: a hole never ends inside one)
    if (n === 3 && w(led) === LITERAL && w(led + PART) === HOLE && w(led + 2 * PART) === LITERAL && w(led + 8) === 1 && w(led + 2 * PART + 8) === 1) {
      const o = b(w(led + 4)), c = b(w(led + 2 * PART + 4)), pairs = w(PAIRS);
      // (characters on their own only, the brackets and quotes: an operator, `.{x}?`, is no pair)
      if (!b(pairs + o) && !b(pairs + c) && b(w(CLASSES) + o) === 3 && b(w(CLASSES) + c) === 3) { if (o === c) setb(pairs + o, 3); else { setb(pairs + o, 1); setb(pairs + c, 2); } }
    }
    // (a hole written against text takes no space, `{x}: {type}` (`:` binds the nearest); the last one, none it begins with
    // (`.{member}`); one inside a pair, any)
    for (let k = 0; k < n; k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== HOLE) continue;
      const before = k > 0 && (w(q - PART) & 15) === LITERAL, after = k < n - 1 && (w(q + PART) & 15) === LITERAL, pairs = w(PAIRS);
      const o = before ? b(w(q - PART + 4) + w(q - PART + 8) - 1) : 0, c = after ? b(w(q + PART + 4)) : 0;
      const enclosed = before && after && ((b(pairs + o) === 1 && b(pairs + c) === 2) || (o === c && b(pairs + o) === 3));
      // (not against what separates, `,` `;` (on its own, no pair): `{list}, {other}`'s list may hold spaces)
      const separates = (before ? b(w(CLASSES) + o) === 3 && !b(pairs + o) : 1) && (after ? b(w(CLASSES) + c) === 3 && !b(pairs + c) : 1);
      if ((before || after) && !enclosed && !separates) set(q, HOLE | HUG);
    }
    // (a head that is one hole takes a word, of a word's characters only: anything else it would read whole is everything)
    if (n === 1 && (w(led) & 15) === HOLE && !w(led + 16)) set(led, HOLE | HUG | WORD);
    // (and a space between two holes is one: two holes never touch)
    for (let k = 1; k < n - 1; k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === SPACE && (w(q - PART) & 15) === HOLE && (w(q + PART) & 15) === HOLE) set(q, SPACE | HUG); }
    set(rule + R_HEAD, node(IS_HEAD, s, e, vis ? owner(vis) : 0, 0));
    let m = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === LITERAL) m |= bytes(w(q + 4), w(q + 4) + w(q + 8)); }
    set(rule + R_MASK, m);
    return rule;
  }
  // (a jump or a stop left where it can go nowhere: said, and done with)
  function caught(t: number, at: number) {
    if (w(t + T_JUMP_N)) { if (!word(w(t + T_JUMP_S), w(t + T_JUMP_S) + w(t + T_JUMP_N), W_ERRED)) say(t, at, L_UNLABELLED, w(t + T_JUMP_S), w(t + T_JUMP_N)); set(t + T_JUMP_N, 0); }
    if (w(t + T_FAULT)) { say(t, at, w(t + T_FAULT), 0, 0); set(t + T_FAULT, 0); }
  }

  // What a node holds under a name (the text at s, n long): its own rule written as that name, applied.
  function member(t: number, nd: number, s: number, n: number): number {
    if (w(t + T_BUDGET) < 1000) set(t + T_BUDGET, w(BUDGET));
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
  function valued(t: number, tk: number): number {
    let state = aload(tk + T_STATE);
    // (one made before what is isolated, not yet known: known here only, as it is here)
    if (state !== 2 && older(tk)) { const o = follow(tk, 1), origin = w(o + T_ORIGIN); return block(t, w(o), w(o + 4), origin, origin, w(o + T_THIS), w(o + T_VIS), 1, 0, w(o + T_THIS)); }
    for (let n = 0; (state & 1) && (state & -2) !== THREAD && n < 100000000; n++) state = aload(tk + T_STATE);
    if (state === 2) return w(tk + T_VALUE);
    if (state & 1) { say(t, w(tk), L_CYCLE, 0, 0); return 0; }
    astore(tk + T_STATE, THREAD | 1);
    const o = follow(tk, 1), origin = w(o + T_ORIGIN), v = block(t, w(o), w(o + 4), origin, origin, w(o + T_THIS), w(o + T_VIS), 1, 0, w(o + T_THIS));
    if (stopped(t)) { astore(tk + T_STATE, 0); return 0; }
    set(tk + T_VALUE, v); astore(tk + T_STATE, 2);
    return v;
  }
  // (a take whose code is `{name}` (as a value, also `name`): what that hole took)
  function follow(tk: number, bare: number): number {
    for (let n = 0; n < 1000; n++) {
      const origin = w(tk + T_ORIGIN);
      if (!origin) return tk;
      let x = ref(w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x && bare) x = ref(w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return tk;
      tk = take(origin, (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return tk;
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
      const nd = node(IS_HOLE, 0, 0, owner(w(l + 16)), 0), outer = w(t + T_HOLE);
      set(t + T_HOLE, nd);
      ev(t, r, w(l + 20) || frame(0, 0, nd, w(l + 8), w(l + 12), 0, 0, nd, nd), 0, nd, 1, nd, nd);
      set(t + T_HOLE, outer);
      set(t + T_FAULT, 0); set(t + T_JUMP_N, 0);
      const type = member(t, nd, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4));
      if (type && type !== nd) { set(q + 16, type); set(l, 0); }
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
        let r = top, count = 1; while (w(r + R_PREV) !== was) { r = w(r + R_PREV); count++; }
        set(r + R_PREV, w(nd + N_LAST)); set(nd + N_LAST, top); changed = 1;
        // (what each of them passes over, again: from the first of them, now after the others)
        const order = alloc(4 * count);
        r = top; for (let i = count - 1; i >= 0; i--) { set(order + 4 * i, r); r = w(r + R_PREV); }
        for (let i = 0; i < count; i++) skips(w(order + 4 * i));
      }
      set(p + 16, 0);
    }
    // (what was read once was read without them)
    if (changed && w(MEMO)) for (let i = 0; i <= w(MEMO_MASK); i++) set(w(MEMO) + 32 * i, 0);
  }
  function statement(t: number, at: number, ln: number, top: number, scope: number, unread: number): number {
    const r = reading(t, at, ln, 0, 0, latest(scope), scope, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) return 0;
    const before = latest(scope), f = frame(0, top, scope, at, ln, 0, 0, scope, scope);
    set(f + N_A, ROOT); set(t + T_BUDGET, w(BUDGET));
    if (DEBUG) debug(D_STATEMENT, at, ln, 0);
    ev(t, r, f, f, scope, 0, scope, scope);
    if (DEBUG) debug(D_STATEMENT_END, at, ln, 0);
    caught(t, at);
    if (latest(scope) !== before) for (let i = 0; i < w(unread);) {
      if (statement(t, w(unread + 4 + 8 * i), w(unread + 8 + 8 * i), top, scope, unread)) {
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
        isolate(t, 0);
        test(t, w(w(AFTER) + 12 * k), w(w(AFTER) + 12 * k + 4));
        // (what it put off, the tests written in it: here, after it, in the order written (they share what it made))
        for (let i = 0; i < w(t + T_HELD_N) && i < HELD; i++) test(t, w(w(t + T_HELD) + 8 * i), w(w(t + T_HELD) + 8 * i + 4));
        set(t + T_HELD_N, 0); set(t + T_SH_N, 0); set(t + T_ISO, 0);
      }
      xadd(ACTIVE, -1);
    }
  }
  function test(t: number, f: number, from: number) {
    const bd = body(t, w(f + F_RULE)), said = w(t + T_SAID);
    set(f + N_A, w(f + N_A) | ROOT); set(t + T_BUDGET, w(BUDGET)); set(t + T_TESTING, 1); set(t + T_ERRED, 0); set(t + T_ROOT, f);
    if (DEBUG) debug(D_TEST, w(f + F_START), w(f + F_END), w(f + F_RULE));
    exec(t, f, bd, from);
    if (DEBUG) debug(D_TEST_END, w(f + F_START), w(f + F_END), w(f + F_RULE));
    caught(t, w(f + F_START));
    if (w(t + T_SAID) > said && !w(t + T_ERRED)) { const er = labelled(bd, w(w(WORDS) + 8 * W_ERRED), w(w(WORDS) + 8 * W_ERRED + 4)); if (er >= 0) { exec(t, f, bd, er); caught(t, w(f + F_START)); } }
    // (it passed when it said nothing)
    xadd(w(t + T_SAID) > said || w(t + T_ERRED) ? FAILED : PASSED, 1);
    set(t + T_TESTING, 0);
  }

  return { same, bracket, past, skip, line, apart, typed, match, read, parts, reading, ev, block, apply, head, rule_, member, valued, follow, run, tests, settle, node, frame, alloc, code, isolate };
}

// A reading: of a statement, what reads it. A rule (its holes' spans), a hole's code read here (`{name}`), what a hole took
// (`name`), what a frame read as a node holds, a value and the rest read on it, or nothing.

// One per thread: the kernel (compiled to WebAssembly, or as JavaScript) over the memory every thread shares, and this thread's
// words. The host reads the header and the files in, and says what the kernel said; everything else the kernel does.
export class Ray extends Language<FileStore> {
  jmp!: Jmp;
  heap!: { buffer: ArrayBufferLike };
  hosts: Record<string, (...args: number[]) => number> = {};
  said: [at: number, message: string, style?: string][] = [];
  x!: Exports; private i32!: Int32Array; private u8!: Uint8Array; t = 0;
  files_?: FileStore; private named_: string[] = [];
  private heard = new Set<string>(); private told = 0;
  static readonly MEMORY = Number(typeof process !== 'undefined' && process.env.RAY_MEMORY || 1 << 30);
  static readonly BUDGET = Number(typeof process !== 'undefined' && process.env.RAY_BUDGET || 10000);

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
    this.t = this.alloc(256); this.set(this.t, this.alloc(64 * SCRATCH));
    const p = new Jmp(); p.host('debug', 4); this.hosts.debug = (kind, a, b, c) => this.debugged(kind, a, b, c);
    this.jmp = jmp_of(kernel.toString(), p, { THREAD: this.t, DEBUG: this.debugging ? 1 : 0 });
    this.x = this.backend.compile(this) as Exports;
    // (`--debug`: a crash says what the kernel was reading)
    if (this.debugging) this.x = Object.fromEntries(Object.entries(this.x).map(([name, f]) => [name, typeof f !== 'function' ? f : (...args: number[]) => {
      try { return f(...args); } catch (e) { if (!(e as { told?: 1 }).told) { (e as { told?: 1 }).told = 1; console.error(this.crashed(e as Error)); } throw e; }
    }])) as unknown as Exports;
    if (first) {
      this.set(LIMIT, this.u8.length - (1 << 16)); this.set(TRASH, this.u8.length - (1 << 16)); this.set(BUDGET, Ray.BUDGET); this.set(FAIL_FAST, typeof process !== 'undefined' && process.env.RAY_FAIL_FAST === '0' ? 0 : 1);
      const area = (at: number, capacity: number, cap: number, size: number) => { this.set(at, this.alloc(cap * size)); this.set(capacity, cap); };
      area(LOG, LOG_CAP, 1 << 16, 16); area(AFTER, AFTER_CAP, 1 << 16, 12); area(LIST, LIST_CAP, 1 << 21, 4); this.set(FILES, this.alloc(12 * 4096)); this.set(PEND, this.alloc(20 * 4096)); area(READS, READS_CAP, 4096, 16); this.set(INCL, this.alloc(8 * 4096)); area(LAZY, LAZY_CAP, 1 << 14, 24);
      if (!(typeof process !== 'undefined' && process.env.RAY_MEMO === '0')) { this.set(MEMO, this.alloc(32 << 18)); this.set(MEMO_MASK, (1 << 18) - 1); }
      this.set(PAIRS, this.alloc(256));
      // (a character's kind: 0 a space, 1 of a word, 2 of an operator, 3 one on its own)
      const at = this.alloc(256); for (let c = 0; c < 256; c++) this.u8[at + c] = c <= 32 ? 0 : /[A-Za-z0-9_]/.test(String.fromCharCode(c)) || c >= 128 ? 1 : /[(){}\[\]"'`,;]/.test(String.fromCharCode(c)) ? 3 : 2;
      this.set(CLASSES, at);
      // (the words the host knows: what a frame holds, its labels, the externals)
      const words = this.alloc(8 * WORDS_KNOWN.length);
      WORDS_KNOWN.forEach((word, i) => { const [s, e] = this.string(word); this.set(words + 8 * i, s); this.set(words + 8 * i + 4, e - s); });
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
    const first = bytes.indexOf(10);
    if (new TextDecoder().decode(bytes.subarray(0, first < 0 ? bytes.length : first)).startsWith('!language ')) this.boot(s, e, id);
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
  // (the order the files were given in, what each wrote merged by: by where they are, however soon each was read)
  static ordered(files: FileStore) {
    const i32 = new Int32Array(files.buffer.values.heap.buffer), w = (a: number) => i32[a >> 2], ks: [string, number][] = [];
    for (let k = 0; k < Atomics.load(i32, FILES_N >> 2); k++) { const id = w(w(FILES) + 12 * k + 8); if (id >= 0 && w(w(PEND) + 20 * k + 8)) ks.push([files.getPath(id), k]); }
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
  included(given: [string, Uint8Array][] = [], only = false) {
    const done = new Set<string>();
    for (;;) {
      const asked = Ray.requests(this.heap, this.handled);
      if (!asked.length) return;
      for (const { kind, text, at, scope } of asked) {
        this.handled++;
        if (text === 'given' && only) this.untested();
        const list: [string, Uint8Array][] = text === 'given' ? given : Ray.located(text, this.path_of(at)).map(p => [p, env.fs.readFileSync(p)]);
        for (const [path, bytes] of list) if (!done.has(path)) { done.add(path); this.file(bytes, path, kind, scope); }
        this.x.settle(this.t, 0);
        for (const at of [PHASE, NEXT, DONE, ANY]) this.set(at, 0);
      }
    }
  }
  // What was put off until everything was read (the tests): this thread takes them while there are any.
  tests() { this.x.tests(this.t); }
  // (what was put off, not run: another document's tests)
  untested() { Atomics.store(this.i32, AFTER_HEAD >> 2, Atomics.load(this.i32, AFTER_TAIL >> 2)); }

  // What the kernel said (since it was last asked), as messages: once each place and message.
  listen(): [number, string, string?][] {
    const n = Math.min(Atomics.load(this.i32, LOG_N >> 2), this.w(LOG_CAP));
    for (; this.told < n; this.told++) {
      const e = this.w(LOG) + 16 * this.told, [at, kind, a, c] = [0, 4, 8, 12].map(k => this.w(e + k));
      const text = (s: number, e: number) => this.text(s, e).trim();
      const message = kind === L.UNREAD ? `nothing reads \`${text(a, c)}\`` : kind === L.UNLABELLED ? `nothing is labelled \`${text(a, a + c)}\`` : kind === L.BUDGET ? `ran past ${Ray.BUDGET} rules (reading this)`
        : kind === L.OOM ? `out of memory (${this.u8.length} bytes)` : kind === L.REPORT ? (a ? text(a, c) : 'error') : kind === L.CYCLE ? 'what this is read as needs itself'
        : kind === L.NOT_ON ? `nothing in what it is read on reads \`${text(a, c)}\`` : kind === L.EXTERNAL ? `\`external ${text(a, c)}\` is no external` : kind === L.DEEP ? `rules applied 400 deep (what this reads reads itself)` : kind === L.HELD ? `a test put off 4096 tests (each putting off more: a class whose block makes one of it, or a test in what a test makes)` : undefined;
      if (kind === L.STYLED) { const style = this.member(a, 'style'), last = this.said[this.said.length - 1]; if (style && last && last[0] === at) last[2] = this.text(this.w(style + 12), this.w(style + 16)).trim(); continue; }
      if (kind === L.DEFINED) { if (kwargs.verbose) say(`${ansi.green}DEFINED${ansi.reset} ${text(a, c)} ${ansi.darkGray}(${this.where(a)})${ansi.reset}`); continue; }
      if (message !== undefined) this.say(at, message);
    }
    return this.said;
  }
  say(at: number, message: string) { const key = `${at}:${message}`; if (this.heard.has(key)) return; this.heard.add(key); this.said.push([at, message]); }

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
  // runaway, it is said, innermost first. `--debug=trace`: each step said as it is taken; `--debug=cost`: each statement that
  // takes long or much memory. (Without it, the kernel is compiled without any of this.)
  get debugging(): string | false {
    const d = kwargs.debug ?? (env.nodejs ? process.env.RAY_DEBUG : undefined);
    return d === undefined || d === '0' || d === false ? false : d === true || d === '1' ? 'on' : String(d);
  }
  private stack: [kind: number, a: number, b: number, c: number, heap: number, time: number][] = [];
  static readonly DEBUG_DEPTH = 4000;
  debugged(kind: number, a: number, b: number, c: number): number {
    const mode = this.debugging, heap = this.w(HEAP);
    if (kind === Debug.OOM) throw new RangeError(`out of memory: ${a} bytes wanted, ${(heap / 1048576).toFixed(0)} MB in use`);
    // (a fault (too deep, too long): what it was doing, said once, and it goes on)
    if (kind === Debug.FAULT) { say(this.crashed(new Error(a === L.DEEP ? 'rules applied too deep' : a === L.UNLABELLED ? `a value's reading jumped out of it, to \`${this.snippet(b, c)}\`` : 'ran past its budget'), false)); return 0; }
    if (kind === Debug.DEFINE) { if (mode === 'trace') say(`${this.indent(this.stack.length)}${ansi.green}DEFINE${ansi.reset} ${this.snippet(a, b)} ${ansi.darkGray}in ${this.node_of(c)}${ansi.reset}`); return 0; }
    if (kind % 2 === 1) {
      this.stack.push([kind, a, b, c, heap, performance.now()]);
      if (mode === 'trace') say(`${this.indent(this.stack.length - 1)}${this.step(kind, a, b, c)}`);
      if (this.stack.length > Ray.DEBUG_DEPTH) throw new RangeError(`the kernel went ${Ray.DEBUG_DEPTH} steps deep (each reading, rule or hole's code inside the one before)`);
      return 0;
    }
    // (done: the step it began; one that took long or much said, with --debug=cost)
    let k = this.stack.length - 1; while (k >= 0 && this.stack[k][0] !== kind - 1) k--;
    if (k < 0) return 0;
    const [, sa, sb, sc, h0, t0] = this.stack[k]; this.stack.length = k;
    if (mode === 'cost' && kind === Debug.STATEMENT_END) {
      const mb = (heap - h0) / 1048576, ms = performance.now() - t0;
      if (mb > 4 || ms > 20) say(`${ansi.orange}COST${ansi.reset} ${ms.toFixed(1)} ms, ${mb.toFixed(1)} MB: ${this.step(kind - 1, sa, sb, sc)}`);
    }
    return 0;
  }
  // (a node, said: what it is, and the text it stands for)
  node_of(n: number) { if (n < 0) return `(${n})`; const is = this.w(n + 8), kinds = ['node', 'text', 'place', 'head', 'hole', 'frame', 'called']; return `${kinds[is] ?? `is ${is}`} ${n}${is >= 1 && is <= 4 ? ` \`${this.snippet(this.w(n + 12), this.w(n + 16), 40)}\`` : ''}${n === this.w(GLOBAL) ? ' (global)' : ''}`; }
  // (how deep a step is: as far in as 16, then said)
  private indent(depth: number) { return `${ansi.darkGray}${String(depth).padStart(3)}${ansi.reset} ${'  '.repeat(Math.min(depth, 16))}`; }
  // (one step, said: where, and what)
  private step(kind: number, a: number, b: number, c: number) {
    const at = `${ansi.darkGray}${this.where(a)}${ansi.reset}`;
    if (kind === Debug.STATEMENT) return `${ansi.green}READ${ansi.reset} ${at} ${this.snippet(a, b)}`;
    if (kind === Debug.TEST) return `${ansi.orange}TEST${ansi.reset} ${at} ${this.snippet(a, b)}`;
    if (kind === Debug.APPLY) return `${ansi.orange}APPLY${ansi.reset} ${this.head_of(c)} ${ansi.darkGray}to${ansi.reset} ${at} ${this.snippet(a, b)}`;
    return `${ansi.darkGray}CODE${ansi.reset} ${at} ${this.snippet(a, b)}`;
  }
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
    if (at + n > this.u8.length) throw new RangeError(`out of memory (${this.u8.length} bytes)`);
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
    if (!found && this.w(ENTRYPOINT_END)) return `(made, at ${at})`;
    const before = this.text(s, at).split('\n');
    return `${id < 0 ? this.named_[-id - 1] ?? '?' : this.files_?.getPath(id) ?? id}:${before.length}:${before[before.length - 1].length + 1}`;
  }
}

export class Program {
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

    this.buffer = new Parallel.Buffer<MemoryLayout>(values);
    this.files = new FileStore(this.buffer);
    this.queue = new Parallel.Queue(
      queueCapacity,
      shared,
      values.queue.buffer,
    );

    if (!shared) return this;

    for (let i = 0; i < threads; i++) {
      const worker = env.Worker({ thread: NAME, main: [args, kwargs] });
      this.workers.push(worker);

      const ready = new Promise<void>((resolve, reject) => {
        worker.onMessage((message: unknown) => {
          if (message === "ready") resolve();
          else reject(new Error("Unexpected worker initialization response."));
        });
      });

      this.workerReady.push(ready);

      worker.postMessage({
        buffers: this.buffer.pack(),
        target: this.backend.name,
      });
    }

    return this;
  }

  async add(...include: (string | Text.Source)[]): Promise<void> {
    if (!this.files || !this.queue)
      throw new Error("Call program.parallel() before adding files.");

    // Do not queue work until all workers have initialized their shared memory.
    await Promise.all(this.workerReady);

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
  async reads(given: string[]): Promise<void> {
    const heap = this.files.buffer.values.heap, i32 = new Int32Array(heap.buffer);
    for (let handled = 0; ;) {
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
