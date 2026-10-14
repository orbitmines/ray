import { sources } from './bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const EXTENSION = '.ray';
export const ENTRYPOINT = ['..', '..', '..', '@ether', 'ray', `.entrypoint${EXTENSION}`]
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 4];

export const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { value: false, alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    {             description: 'Enable the debugger and debug-level logging.' },
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

  static thread(data: object = {}, variables: Record<string, string> = {}): import('worker_threads').Worker {
    const file = env.url.fileURLToPath(import.meta.url), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
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
    await language.add(...args.slice(1));

    const loaded = performance.now();

    // Wait until every submitted file has finished parsing.
    await language.queue.join();

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

      const finished = performance.now();
      console.error(
        `#${language.files.count || 1} @ ${(loc / 1000).toFixed(1)}k LOC ` +
        `(--threads ${language.workers.length || 1}) ` +
        `LOAD ${(loaded - start).toFixed(1)} ms (${(loc / (loaded - start)).toFixed(1)}k/s) ` +
        `COMPILE ${(finished - loaded).toFixed(1)} ms (${(loc / (finished - loaded)).toFixed(1)}k/s)`,
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
export async function lsp() {
  
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

export abstract class Language<Frontend> {
  get name() { return Object.entries(Program.backends).find(x => x[1] === this)[0]; }

  abstract compile(program: Frontend, id: number): Promise<void>

  // abstract tree(id: number): {
  //   starts: ArrayLike<number>;
  //   indents: ArrayLike<number>;
  //   parents: ArrayLike<number>;
  // };
}

export class Wasm extends Language<Ray> {
  async compile(program: Ray, id: number): Promise<void> {
    
  }

  // protected memory(bytes: number) { const memory = jmp.memory(bytes); return { memory, module: jmp.compile(jmp.lines(), memory.buffer.byteLength / 65536) }; }
  // protected instance({ memory, module }: { memory: WebAssembly.Memory, module: WebAssembly.Module }) { return { bytes: new Uint8Array(memory.buffer), lines: jmp.instance(module, memory).lines }; }
}
export class Js extends Language<Ray> {
  async compile(program: Ray, id: number): Promise<void> {
    
  }
}

enum Op { GOTO, LABEL, ".", "&" }

import {
  Expression,
  Signal,
  ReactiveMap,
  type ConcurrentScheduler,
  immediateScheduler,
} from "./expression.ts";

export class Ray extends Language<FileStore> {
  async compile(program: FileStore, id: number): Promise<void> {
    const location = program.getPath(id);
    if (!!kwargs.verbose) { console.log(`${ansi.darkGray}PARSING${ansi.reset} ${ansi.darkGray}${location}${ansi.reset}`)}

    class Program {
      buffer: Parallel.Memory;
      
    }

    // const scheduler: ConcurrentScheduler = {
    //   schedule: (work) => yourConcurrentScheduler(work),
    // };

    if (!location.endsWith('entrypoint.ray3')) return;

    const expression = new Expression({
      scheduler: immediateScheduler,
      externals: {
        log: (_context, args) => console.log(...args),
      },
    });

    expression.global.addRule({
      key: "print {value}",
      run: (_context, statement) => {
        console.log(statement.captures.value);
      },
    });

    const source = new Signal("print hello");

    const compiled = expression.compile(source);

    // The IR contains only JMP opcodes.
    console.log(compiled.ir.value.instructions);

    // Execute the current compiled program.
    await compiled.run();

    // Updating the source causes parsing and IR regeneration.
    source.value = "print world";
    await compiled.run();

  }
}

export class Program {
  static backends: Record<string, Language<Ray>> = { wasm: new Wasm(), js: new Js(),};
  static frontend: Language<FileStore> = new Ray();

  constructor(public entrypoint?: Global.Source) {}

  cursors: pointer[] = [];

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
        if (!!kwargs.verbose) { console.log(`${ansi.orange}SKIPPED${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
        return;
      }

      if (!!kwargs.verbose) { console.log(`${ansi.darkGray}LOADING${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
      await src.load();
      
      // Double-check if loading took long.
      if (this.files.getFileId(src.location) !== undefined) {
        if (!!kwargs.verbose) { console.log(`${ansi.orange}SKIPPED${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
        return;
      }

      const id = this.files.add(src.location, src.value);

      await this.queue.submit([id]);

      if (!!kwargs.verbose) { console.log(`${ansi.green}LOADED ${ansi.reset} ${ansi.darkGray}${src.location}${ansi.reset}`)}
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

  async ".entrypoint"() {
    const src = this.entrypoint as Text.Source | undefined;

    if (src) {
      if (!src.loaded && src.location &&!(await src.is_directory())) await src.load();    
      if (src.is_language_entrypoint) return src;
    }

    await this.add(new Text.Source(ENTRYPOINT.join("/") + "3"));
    if (src) await this.add(src.location);
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

export type pointer = number;

export class Rule {
  pointer: pointer;


}

export class Node {
  pointer: pointer;

  get() {}
  has() {}
  // candidates(start: ): Iterable<Rule> {}
}

export class Context {
  pointer: pointer

  up() { return this; }
  down(pointer: Node) { return this; }

}

entrypoint();