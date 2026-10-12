import { sources } from './bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const EXTENSION = '.ray';
export const ENTRYPOINT = ['@ether', 'ray', `.entrypoint${EXTENSION}`]
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
    static async *all(relative_location: string): AsyncGenerator<Text.Source> {
      if (env.manifest.length > 0) {
        for (const path of env.manifest) {
          if (path.startsWith(relative_location.endsWith('/') ? relative_location : relative_location + '/'))
            yield new Text.Source(path);
        }
      } else if (env.nodejs) {
        const location = env.path.join(env.root(), relative_location);

        const stat = await env.fs_promises.stat(location);
        if (stat.isDirectory()) {
          async function* all(location: string): AsyncGenerator<Text.Source> {
            for (const entry of await env.fs_promises.readdir(location, { withFileTypes: true })) {
              const path = env.path.join(location, entry.name);

              // (not what is kept beside a library: hidden directories, packages)
              if (entry.isDirectory()) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                yield *all(path);
              } else if (entry.isFile()) {
                yield new Text.Source(env.path.relative(env.root(), path));
              }
            }
          }

          yield *all(location);
        } else if (stat.isFile()) {
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

export async function main([args, kwargs]: CLI.Args = CLI.args()) {
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

  const files = env.nodejs
    ? args.map((f: string) =>
        env.path.relative(
          env.root(),
          env.path.resolve(f),
        ),
      )
    : args;

  const entrypoint =
    files[0] ?? ENTRYPOINT.join("/") + "2";

  const threads = Math.max(
    1,
    Number(kwargs.threads ?? env.threads),
  );

  const language = new Program(
    new Text.Source(entrypoint),
  )
    .abstract(!!kwargs.abstract)
    .target(String(kwargs.target ?? env.target))
    .parallel(threads);

  let localRunner: Promise<void> | undefined;

  try {
    const start = performance.now();

    // If no workers were created, consume tasks on this thread.
    if (language.workers.length === 0) {
      localRunner = language.queue.run(async (id) => {
        await language.backend.read(language.files, id);
      });

      // A persistent runner stops when language.close() stops the queue.
      void localRunner.catch((error) => {
        console.error("Local queue failed:", error);
        process.exitCode = 1;
      });
    }

    // Register the entrypoint and all explicitly supplied files.
    await language.add(
      entrypoint,
      ...files.slice(1),
    );

    const loaded = performance.now();

    // Wait until every submitted file has finished parsing.
    await language.queue.join();

    if (kwargs.verbose) {
      console.error(
        `processed ${files.length || 1} input(s), ` +
        `on ${language.workers.length || 1} thread(s): ` +
        `loading ${(loaded - start).toFixed(1)} ms, ` +
        `processing ${(performance.now() - loaded).toFixed(1)} ms`,
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
export async function lsp() {
  
}

// Each file keeps room to grow when edited, and ends in newlines.
const SLACK = 4096, PAD = 16;

export abstract class Backend {
  get name() { return Object.entries(Program.backends).find(x => x[1] === this)[0]; }

  abstract compile(program: Program): void

  abstract read(files: FileStore, id: number): Promise<void>;

  abstract tree(id: number): {
    starts: ArrayLike<number>;
    indents: ArrayLike<number>;
    parents: ArrayLike<number>;
  };
}

export class Wasm extends Backend {
  compile(program: Program): void {
    
  }

  async read(files: FileStore, id: number): Promise<void> {
    
  }
  // protected memory(bytes: number) { const memory = jmp.memory(bytes); return { memory, module: jmp.compile(jmp.lines(), memory.buffer.byteLength / 65536) }; }
  // protected instance({ memory, module }: { memory: WebAssembly.Memory, module: WebAssembly.Module }) { return { bytes: new Uint8Array(memory.buffer), lines: jmp.instance(module, memory).lines }; }
}
export class Js extends Backend {
  compile(program: Program): void {
    
  }
  async read(files: FileStore, id: number): Promise<void> {
    
  }
  // protected memory(bytes: number) { return { buffer: typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes) }; }
  // protected instance({ buffer }: { buffer: ArrayBufferLike }) { return { bytes: new Uint8Array(buffer), lines: jmp.interpret(jmp.lines(), buffer).lines }; }
}


export type BufferLike = ArrayBuffer | SharedArrayBuffer;

const enum FileState {
  LOCK = 0,
  COUNT = 1,
  SOURCE_USED = 2,
  PATH_USED = 3,
  SIZE = 4,
}

const enum FileMeta {
  OFFSET = 0,
  LENGTH = 1,
  PATH_OFFSET = 2,
  PATH_LENGTH = 3,
  SIZE = 4,
}

const enum QueueState {
  HEAD = 0,
  TAIL = 1,
  COUNT = 2,
  PENDING = 3,
  STOP = 4,
  LOCK = 5,
  SIZE = 6,
}

function createSharedBuffer(size: number, maximum: number): SharedArrayBuffer {
  return new SharedArrayBuffer(size, { maxByteLength: maximum });
}

export class Memory {
  private readonly nativeGrow: boolean;
  private current: BufferLike;

  constructor(
    size = 1024,
    readonly shared = env.parallel,
    private readonly maximum = 1 << 30,
    backing?: BufferLike,
  ) {
    this.nativeGrow = this.shared;

    this.current = backing ?? (
      this.shared
        ? createSharedBuffer(size, maximum)
        : new ArrayBuffer(size)
    );

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

    if (this.nativeGrow) {
      (this.current as SharedArrayBuffer).grow(size);
      return;
    }

    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.current));
    this.current = next;
  }

  bytes(offset = 0, length?: number): Uint8Array {
    if (offset < 0 || offset > this.byteLength) {
      throw new RangeError("Invalid byte offset");
    }

    if (length === undefined) {
      return new Uint8Array(this.current, offset);
    }

    if (length < 0 || offset + length > this.byteLength) {
      throw new RangeError("Invalid byte length");
    }

    return new Uint8Array(this.current, offset, length);
  }

  ints(offset = 0, length?: number): Int32Array {
    if (offset % 4 !== 0 || offset < 0 || offset > this.byteLength) {
      throw new RangeError("Invalid Int32 offset");
    }

    if (length === undefined) {
      return new Int32Array(this.current, offset);
    }

    if (length < 0 || offset + length * 4 > this.byteLength) {
      throw new RangeError("Invalid Int32 length");
    }

    return new Int32Array(this.current, offset, length);
  }
}

export interface MemoryBuffers {
  source: SharedArrayBuffer;
  metadata: SharedArrayBuffer;
  paths: SharedArrayBuffer;
  index: SharedArrayBuffer;
  fileState: SharedArrayBuffer;
  queue: SharedArrayBuffer;
  queueCapacity: number;
  maximum: number;
}

export class FileStore {
  readonly source: Memory;
  readonly metadata: Memory;
  readonly paths: Memory;
  readonly index: Memory;

  private readonly state: Int32Array;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  private readonly maxFiles: number;
  private readonly maxPathBytes: number;
  private readonly maxIndexSlots: number;

  constructor(
    buffers: MemoryBuffers,
    shared = true,
  ) {
    this.source   = new Memory(buffers.source.byteLength, shared, buffers.maximum, buffers.source);
    this.metadata = new Memory(buffers.metadata.byteLength, shared, buffers.maximum, buffers.metadata);
    this.paths = new Memory(
      buffers.paths.byteLength,
      shared,
      buffers.maximum,
      buffers.paths,
    );

    this.index = new Memory(
      buffers.index.byteLength,
      shared,
      buffers.maximum,
      buffers.index,
    );

    this.state = new Int32Array(buffers.fileState);

    this.maxFiles = Math.floor(buffers.maximum / (FileMeta.SIZE * 4));
    this.maxPathBytes = buffers.maximum;
    this.maxIndexSlots = Math.floor(buffers.maximum / 4);
  }

  private lock(): void {
    while (Atomics.compareExchange(this.state, FileState.LOCK, 0, 1) !== 0) {
      // All file mutations and index lookups are serialized.
    }
  }

  private unlock(): void {
    Atomics.store(this.state, FileState.LOCK, 0);
    Atomics.notify(this.state, FileState.LOCK, 1);
  }

  private normalize(path: string): string {
    const absolute = path.startsWith("/") || path.startsWith("\\");
    const parts: string[] = [];

    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;

      if (part === ".." && parts.length && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (part !== ".." || !absolute) {
        parts.push(part);
      }
    }

    const joined = parts.join("/");
    return absolute ? `/${joined}` : joined || ".";
  }

  private record(id: number): Int32Array {
    return this.metadata.ints(id * FileMeta.SIZE * 4, FileMeta.SIZE);
  }

  private pathBytes(id: number): Uint8Array {
    const meta = this.record(id);

    return this.paths.bytes(
      meta[FileMeta.PATH_OFFSET],
      meta[FileMeta.PATH_LENGTH],
    );
  }

  private hash(bytes: Uint8Array): number {
    let h = 0x811c9dc5;

    for (const byte of bytes) {
      h = Math.imul(h ^ byte, 0x01000193);
    }

    return h >>> 0;
  }

  private findSlot(bytes: Uint8Array): { slot: number; id?: number } {
    const table = this.index.ints();
    const mask = table.length - 1;
    let slot = this.hash(bytes) & mask;

    for (let i = 0; i < table.length; i++) {
      const value = table[slot];

      if (value === 0) return { slot };

      const id = value - 1;
      const existing = this.pathBytes(id);

      if (
        existing.length === bytes.length &&
        existing.every((byte, index) => byte === bytes[index])
      ) {
        return { slot, id };
      }

      slot = (slot + 1) & mask;
    }

    throw new RangeError("Path index is full");
  }

  private insertIntoIndex(id: number, bytes: Uint8Array): void {
    const table = this.index.ints();
    const mask = table.length - 1;
    let slot = this.hash(bytes) & mask;

    while (table[slot] !== 0) {
      slot = (slot + 1) & mask;
    }

    table[slot] = id + 1;
  }

  private rebuildIndex(requiredFiles: number): void {
    const currentSlots = this.index.byteLength / 4;

    if (requiredFiles * 2 < currentSlots) return;

    const nextSlots = currentSlots * 2;

    if (nextSlots > this.maxIndexSlots) {
      throw new RangeError("Maximum path index capacity exceeded");
    }

    this.index.ensureCapacity(nextSlots * 4);

    const table = this.index.ints();
    table.fill(0);

    const count = Atomics.load(this.state, FileState.COUNT);

    for (let id = 0; id < count; id++) {
      this.insertIntoIndex(id, this.pathBytes(id));
    }
  }

  add(path: string, content: Uint8Array): number {
    const normalized = this.normalize(path);
    const encodedPath = this.encoder.encode(normalized);

    this.lock();

    try {
      const found = this.findSlot(encodedPath);

      if (found.id !== undefined) {
        throw new Error(`File already exists: ${normalized}`);
      }

      const id = Atomics.load(this.state, FileState.COUNT);

      if (id >= this.maxFiles) {
        throw new RangeError("Maximum file count exceeded");
      }

      const sourceOffset = Atomics.load(this.state, FileState.SOURCE_USED);
      const pathOffset = Atomics.load(this.state, FileState.PATH_USED);

      if (pathOffset + encodedPath.length > this.maxPathBytes) {
        throw new RangeError("Maximum path storage exceeded");
      }

      this.source.ensureCapacity(sourceOffset + content.length);
      this.metadata.ensureCapacity((id + 1) * FileMeta.SIZE * 4);
      this.paths.ensureCapacity(pathOffset + encodedPath.length);

      this.rebuildIndex(id + 1);

      this.source.bytes(sourceOffset, content.length).set(content);
      this.paths.bytes(pathOffset, encodedPath.length).set(encodedPath);

      const meta = this.record(id);
      meta[FileMeta.OFFSET] = sourceOffset;
      meta[FileMeta.LENGTH] = content.length;
      meta[FileMeta.PATH_OFFSET] = pathOffset;
      meta[FileMeta.PATH_LENGTH] = encodedPath.length;

      const slot = this.findSlot(encodedPath).slot;
      this.index.ints()[slot] = id + 1;

      Atomics.store(
        this.state,
        FileState.SOURCE_USED,
        sourceOffset + content.length,
      );

      Atomics.store(
        this.state,
        FileState.PATH_USED,
        pathOffset + encodedPath.length,
      );

      // Publish only after content, path and metadata are written.
      Atomics.store(this.state, FileState.COUNT, id + 1);

      return id;
    } finally {
      this.unlock();
    }
  }

  get count(): number {
    return Atomics.load(this.state, FileState.COUNT);
  }

  getFileId(path: string): number | undefined {
    const encodedPath = this.encoder.encode(this.normalize(path));

    this.lock();

    try {
      return this.findSlot(encodedPath).id;
    } finally {
      this.unlock();
    }
  }

  includes(path: string): boolean {
    return this.getFileId(path) !== undefined;
  }

  private getMeta(id: number): Int32Array {
    if (!Number.isInteger(id) || id < 0 || id >= this.count) {
      throw new RangeError(`Unknown file ID: ${id}`);
    }

    return this.record(id);
  }

  getBytes(id: number): Uint8Array {
    const meta = this.getMeta(id);

    return this.source.bytes().subarray(
      meta[FileMeta.OFFSET],
      meta[FileMeta.OFFSET] + meta[FileMeta.LENGTH],
    );
  }

  getText(id: number): string {
    return this.decoder.decode(this.getBytes(id));
  }

  getPath(id: number): string {
    return this.decoder.decode(this.pathBytes(id));
  }
}

export class Queue {
  private readonly state: Int32Array;
  private readonly tasks: Int32Array;

  constructor(
    capacity = 256,
    buffer?: SharedArrayBuffer,
  ) {
    const bytes = (QueueState.SIZE + capacity) * 4;
    buffer ??= createSharedBuffer(bytes, bytes);

    if (buffer.byteLength < bytes) {
      throw new RangeError("Queue buffer is too small");
    }

    this.state = new Int32Array(buffer, 0, QueueState.SIZE);
    this.tasks = new Int32Array(
      buffer,
      QueueState.SIZE * 4,
      capacity,
    );
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
      if (!Number.isInteger(id) || id < 0) {
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

        await new Promise<void>(resolve => setTimeout(resolve, 0));
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
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  async run(
    process: (id: number) => void | Promise<void>,
  ): Promise<void> {
    while (!Atomics.load(this.state, QueueState.STOP)) {
      const id = this.take();

      if (id === undefined) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
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
export class Program {
  static backends: Record<string, Backend> = {
    wasm: new Wasm(),
    js: new Js(),
  };

  constructor(public entrypoint: Global.Source) {}

  backend: Backend = Program.backends[env.target];

  workers: any[] = [];
  private workerReady: Promise<void>[] = [];

  buffers!: MemoryBuffers;
  files!: FileStore;
  queue!: Queue;

  cursors: pointer[] = [];
  abstractly = false;

  target(target: string): this {
    const backend = Program.backends[target];

    if (!backend)
      throw new Error(`The chosen backend '${target}' doesn't exist.`);

    this.backend = backend;
    return this;
  }

  abstract(abstractly?: boolean): this {
    this.abstractly = abstractly ?? true;
    return this;
  }

  parallel(threads = env.threads): this {
    if (this.buffers) throw new Error("Program.parallel() has already been initialized.");

    const sourceSize = 4096;
    const queueCapacity = 256;
    const maximum = 1 << 30;

    this.buffers = {
      source: createSharedBuffer(sourceSize, maximum),
      metadata: createSharedBuffer(4096, maximum),
      paths: createSharedBuffer(4096, maximum),
      index: createSharedBuffer(512 * 4, maximum),
      fileState: createSharedBuffer(
        FileState.SIZE * 4,
        FileState.SIZE * 4,
      ),
      queue: createSharedBuffer(
        (QueueState.SIZE + queueCapacity) * 4,
        (QueueState.SIZE + queueCapacity) * 4,
      ),
      queueCapacity,
      maximum,
    };

    this.files = new FileStore(this.buffers);
    this.queue = new Queue(
      this.buffers.queueCapacity,
      this.buffers.queue,
    );

    // No worker threads in a non-parallel environment.
    if (!env.parallel || threads <= 1)
      return this;

    for (let i = 0; i < threads; i++) {
      const worker = env.Worker({ thread: NAME });
      this.workers.push(worker);

      // Register the listener BEFORE sending the initialization message.
      const ready = new Promise<void>((resolve, reject) => {
        worker.onMessage((message: unknown) => {
          if (message === "ready") {
            resolve();
          } else {
            reject(new Error("Unexpected worker initialization response."),);
          }
        });
      });

      this.workerReady.push(ready);
      worker.postMessage({
        buffers: this.buffers,
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

    const addSource = async (src: Text.Source): Promise<void> => {
      await src.load();

      if (!src.location)
        throw new Error("Cannot add a source without a location.");

      // The lookup must use the shared FileStore index, not a local Map.
      if (this.files.getFileId(src.location) !== undefined)
        return;

      const id = this.files.add(src.location, src.value);

      await this.queue.submit([id]);
    };

    for (const item of include) {
      if (item instanceof Text.Source) {
        await addSource(item);
      } else {
        for await (const src of Text.Source.all(item)) {
          await addSource(src);
        }
      }
    }
  }

  async ".entrypoint"() {
    const src = this.entrypoint as Text.Source;

    if (
      !src.loaded &&
      src.location &&
      !(await src.is_directory())
    ) {
      await src.load();
    }

    if (src.is_language_entrypoint)
      return src;

    await this.add(
      new Text.Source(ENTRYPOINT.join("/") + "2"),
      src,
    );

    return src;
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

enum Op { GOTO, LABEL, ".", "&" }

export function thread(
  message: {
    buffers: MemoryBuffers;
    target: string;
  },
  ready: () => void,
): void {
  if (!message?.buffers) {
    throw new Error(
      "Worker initialization failed: MemoryBuffers were not provided.",
    );
  }

  const files = new FileStore(message.buffers);
  const queue = new Queue(
    message.buffers.queueCapacity,
    message.buffers.queue,
  );

  const backend = Program.backends[message.target];

  if (!backend) {
    throw new Error(
      `Unknown backend '${message.target}'.`,
    );
  }

  ready();

  void queue.run(async (id: number) => {
    await backend.read(files, id);
  }).catch((error) => {
    console.error("Worker queue failed:", error);
  });
}

if (
  env.nodejs &&
  env.worker &&
  env.worker_threads.workerData?.thread === NAME
) {
  const parent = env.worker_threads.parentPort!;

  parent.once("message", (message: {
    buffers: MemoryBuffers;
    target: string;
  }) => {
    thread(message, () => parent.postMessage("ready"));
  });
} else if (!env.nodejs && env.scope === "worker") {
  (globalThis as any).addEventListener(
    "message",
    (event: any) => {
      thread(event.data, () => {
        (globalThis as any).postMessage("ready");
      });
    },
    { once: true },
  );
} else if (
  env.nodejs &&
  env.worker &&
  env.worker_threads.workerData?.main
) {
  void main(env.worker_threads.workerData.main);
} else if (env.is_main_entrypoint) {
  void main();
}