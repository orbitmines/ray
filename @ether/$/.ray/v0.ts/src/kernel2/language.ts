import { sources } from '../bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const ROOT = ['@ether', '$', '.ray']
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 3];

export const config = {
  daemon: {
    idle: 10 * 60 * 1000,
    worker_idle: 60 * 1000,
  },
  jobs: {
    flush: 1000,
    poll: 50,
    keep: 100,
    retention: 7 * 24 * 60 * 60 * 1000,
    budget: 2 * 1024 ** 3,
    share: 0.1,
    segment: 64 * 1024 ** 2,
    memory: 64 * 1024 ** 2,
  },
  memory: {
    shared: true,
    words: 1 << 24,
    arena: 1 << 19,
    processes: 16,
    queue: 1 << 14,
    ring: 1 << 10,
    quantum: 10_000,
    slice: 10,
    gpu: 64,
  },
  frame: 64 * 1024,
};

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  {             description: 'Print the version number.' },
  abstract: { alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    {             description: 'Enable the debugger and debug-level logging.' },
  daemon:   { alias: 'd', value: () => env.socket, optional: true, description: `Run as the background daemon, on a socket; with files` },
  attach:   { alias: 'a', value: true, optional: true, description: `Attach to a job's output (the latest without an id)` },
  list:     { alias: 'l', description: `List the daemon's jobs.` },
  stop:     { value: true, description: 'Stop a job.' },
  rm:       { value: true, optional: true, description: 'Remove a finished job and its output (all finished jobs without an id).' },
  // TODO --ephemeral: the client's command line is still visible to the same user in `ps` while it runs; the daemon's (and its workers') memory can be swapped to disk (no mlock/VirtualLock);
  //      ephemeral jobs of a daemon that was replaced by a newer build can't be listed or stopped any more (its socket is gone); environment variables are never persisted, which a future `continue` would need to revisit.
  ephemeral: {           description:`Keep nothing on disk: the output is only streamed, and the job's record is removed when it ends.` },
};

export async function main([args, kwargs]: CLI.Args = CLI.args()) {
  if (kwargs.version) return console.log(env.version.toString());
  if (kwargs.help) { console.log(CLI.help()); return; }

  const socket = typeof kwargs.daemon === 'string' ? kwargs.daemon : env.nodejs ? env.socket : '';
  const detached = kwargs.daemon !== undefined && args.length > 0;
  if (kwargs.list) { process.stdout.write(await Daemon.list(socket)); return; }
  if (kwargs.attach && !detached) { process.exitCode = await Daemon.attach(Daemon.job(kwargs.attach, args), socket); return; }
  if (kwargs.stop) {
    const job = Daemon.job(kwargs.stop, args);
    if (job === undefined) throw new Error(`--stop needs a job id; see --list.`);
    process.exitCode = await Daemon.stop(job, socket);
    return;
  }
  if (kwargs.rm) { process.exitCode = Daemon.remove(Daemon.job(kwargs.rm, args)); return; }

  if (kwargs.daemon && !detached) return await daemon(env.secure(socket));
  if (args.length === 0 && !kwargs.abstract) { console.log(CLI.help()); return; }

  for (const stream of [process.stdout, process.stderr]) stream.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(141); throw error; });
  if (!env.nodejs) { await new Jobs(env.host).run([args, kwargs], { out: async data => console.log(typeof data === 'string' ? data : Jobs.text(data)), err: async data => console.error(typeof data === 'string' ? data : Jobs.text(data)) }); return; }
  const request: Daemon.Run = { kind: 'run', argv: [args, kwargs], command: [env.command.toLowerCase(), ...process.argv.slice(2)], cwd: process.cwd(), variables: process.env, build: env.build, detached, attach: !!kwargs.attach, ephemeral: !!kwargs.ephemeral };
  for (let attempt = 0; attempt < 2; attempt++) {
    const connection = await Daemon.start(socket).catch((): undefined => undefined);
    if (!connection) break;
    const exit = await Daemon.request(connection, request, socket);
    if (exit !== undefined) { process.exitCode = exit; return; }
  }
  if (detached) throw new Error(`${NAME}'s daemon couldn't be started on '${socket}'.`);
  const jobs = new Jobs(env.host);
  process.exitCode = await jobs.run([args, kwargs], {
    out: data => drained(process.stdout, process.stdout.write(data)),
    err: data => drained(process.stderr, process.stderr.write(data)),
  });
  jobs.close();
}

export interface IO { out(data: string | Uint8Array): Promise<void>; err(data: string | Uint8Array): Promise<void>; }

export function drained(stream: NodeJS.EventEmitter & { destroyed?: boolean }, written: boolean): Promise<void> {
  if (written || stream.destroyed) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { stream.off('drain', done); stream.off('close', done); resolve(); };
    stream.on('drain', done);
    stream.on('close', done);
  });
}

async function daemon(socket: string) {
  const { net, fs } = env, pipe = Daemon.pipe(socket), build = env.build;
  if (await Daemon.connect(socket).then(connection => (connection.destroy(), true), () => false))
    throw new Error(`${NAME}'s daemon is already running on '${socket}'.`);
  if (!pipe) fs.rmSync(socket, { force: true });

  process.title = `${NAME.toLowerCase()} --daemon`;
  process.chdir(env.path.parse(process.cwd()).root);

  let timer: ReturnType<typeof setTimeout> | undefined, retired = false;
  const settle = () => { if (retired && !jobs.active) process.exit(0); };
  const retire = () => {
    if (retired) return;
    retired = true;
    clearTimeout(timer);
    server.close();
    if (!pipe) fs.rmSync(socket, { force: true });
    settle();
  };
  const jobs = new Jobs(env.host, {
    busy: () => clearTimeout(timer),
    idle: () => { clearTimeout(timer); timer = setTimeout(retire, config.daemon.idle); settle(); },
  });

  const server = net.createServer(connection => {
    const owned = new Set<number>(), watching = new Set<number>();
    const send: Jobs.Send = (type, payload = '') => connection.destroyed ? Promise.resolve() : drained(connection, Daemon.write(connection, type, payload));
    connection.on('error', () => {}).on('close', () => {
      for (const id of owned) jobs.disown(id);
      for (const id of watching) jobs.unwatch(id, send);
    }).on('data', Daemon.frames((type, payload) => {
      if (type !== Daemon.Frame.REQUEST) return;
      const request: Daemon.Request = JSON.parse(payload.toString());
      if (request.kind === 'ephemeral') {
        send(Daemon.Frame.OUT, JSON.stringify(jobs.ephemeral.all()));
        return void send(Daemon.Frame.EXIT, '0');
      }
      if (request.kind === 'stop') return void send(Daemon.Frame.EXIT, jobs.stop(request.job) ? '0' : '1');
      if (retired || request.build !== build) { send(Daemon.Frame.STALE); return retire(); }
      if (request.detached && request.attach && request.ephemeral) {
        const meta = jobs.submit(request, { viewer: send });
        watching.add(meta.id);
        return void send(Daemon.Frame.ACCEPTED, String(meta.id));
      }
      if (request.detached) {
        const meta = jobs.submit(request);
        return void send(Daemon.Frame.ACCEPTED, String(meta.id)).then(() => connection.end());
      }
      owned.add(jobs.submit(request, { owner: send }).id);
    }));
  });
  server.listen(socket, () => { timer = setTimeout(retire, config.daemon.idle); });
}

export class Jobs {
  readonly ephemeral = new Memory();
  private readonly jobs = new Map<number, Jobs.Job>();
  private readonly waiting: Jobs.Job[] = [];
  private running = 0;
  private ticker?: ReturnType<typeof setInterval>;
  private shared?: Environment;

  constructor(readonly host: Host, private readonly events: { busy?(): void; idle?(): void } = {}) {
    host.store.recover();
    host.store.retain();
  }

  get active(): boolean { return this.running > 0 || this.waiting.length > 0; }

  private store(meta: Daemon.Meta): Store { return meta.ephemeral ? this.ephemeral : this.host.store; }
  private live(): Daemon.Meta[] { return [...this.jobs.values()].filter(job => !job.meta.ephemeral).map(job => job.meta); }
  private environment(): Environment { return config.memory.shared ? this.shared ??= new Environment(this.host) : new Environment(this.host); }

  submit(request: Daemon.Run, options: { owner?: Jobs.Send; viewer?: Jobs.Send } = {}): Daemon.Meta {
    const meta: Daemon.Meta = {
      id: this.host.store.next(), command: request.command, cwd: request.cwd, daemon: this.host.pid, created: Date.now(),
      steps: 0, memory: 0, written: 0, size: 0, first: 1, last: 1, ephemeral: request.ephemeral || undefined,
    };
    const store = this.store(meta);
    store.save(meta);
    const job: Jobs.Job = { meta, request, project: new Project(request.cwd, request.variables), log: store.log(meta), owner: options.owner, viewers: new Set(options.viewer ? [options.viewer] : []) };
    this.jobs.set(meta.id, job);
    this.waiting.push(job);
    this.events.busy?.();
    this.schedule();
    return meta;
  }

  run(argv: CLI.Args, io: IO, options: Partial<Daemon.Run> = {}): Promise<number> {
    return new Promise(resolve => {
      const owner: Jobs.Send = (type, payload = '') => {
        if (type === Daemon.Frame.EXIT) { resolve(Number(typeof payload === 'string' ? payload : Jobs.text(payload))); return Promise.resolve(); }
        return type === Daemon.Frame.ERR ? io.err(payload) : io.out(payload);
      };
      this.submit({
        kind: 'run', argv, command: [NAME.toLowerCase(), ...argv[0]], cwd: env.nodejs ? process.cwd() : '', variables: env.nodejs ? { ...process.env } : {},
        build: '', detached: false, attach: false, ephemeral: false, ...options,
      }, { owner });
    });
  }

  stop(id: number): boolean {
    const job = this.jobs.get(id);
    job?.project.stop();
    return job !== undefined;
  }

  disown(id: number): void {
    const job = this.jobs.get(id);
    if (job === undefined) return;
    job.owner = undefined;
    job.project.stop();
  }

  watch(id: number, send: Jobs.Send): boolean {
    const job = this.jobs.get(id), meta = job?.meta ?? this.host.store.read(id);
    if (meta === undefined) return false;
    if (meta.first > 1) send(Daemon.Frame.ERR, `[${NAME}: the start of job ${id}'s output is no longer kept]\n`);
    for (const [type, data] of this.store(meta).replay(meta)) send(type, data);
    if (job !== undefined) job.viewers.add(send);
    else send(Daemon.Frame.EXIT, String(meta.exit ?? 1));
    return true;
  }

  unwatch(id: number, send: Jobs.Send): void { this.jobs.get(id)?.viewers.delete(send); }

  list(): Daemon.Meta[] {
    const live = new Map([...this.jobs.values()].map(job => [job.meta.id, { ...job.meta, steps: job.project.steps, memory: job.project.memory }]));
    return [...this.host.store.all(), ...this.ephemeral.all()].map(meta => live.get(meta.id) ?? meta);
  }

  close(): void {
    this.shared?.stop();
    this.shared = undefined;
  }

  private flush(job: Jobs.Job): void {
    if (this.store(job.meta).stopping(job.meta.id)) job.project.stop();
    job.meta.steps = job.project.steps;
    job.meta.memory = job.project.memory;
    job.meta.stopped = job.project.stopped || undefined;
    this.store(job.meta).save(job.meta);
  }

  private output(job: Jobs.Job, type: Daemon.Frame, data: string | Uint8Array): Promise<void> {
    if (job.log.write(type, Jobs.bytes(data))) this.host.store.retain(this.live());
    return Promise.all([job.owner, ...job.viewers].map(send => send?.(type, data))).then(() => {});
  }

  private finish(job: Jobs.Job, exit: number): void {
    if (job.meta.exit !== undefined) return;
    job.meta.exit = exit;
    job.meta.ended = Date.now();
    job.log.close();
    this.flush(job);
    for (const send of [job.owner, ...job.viewers]) send?.(Daemon.Frame.EXIT, String(exit));
    this.jobs.delete(job.meta.id);
    if (job.meta.ephemeral) this.ephemeral.remove(job.meta.id);
    if (job.meta.began !== undefined) this.running--;
    if (job.environment !== undefined && job.environment !== this.shared) job.environment.stop();
    this.host.store.retain(this.live());
    this.schedule();
    if (!this.active) this.events.idle?.();
  }

  private start(job: Jobs.Job): void {
    let program: Program;
    try { program = Program.compile(job.project, job.request.argv[0]); }
    catch (e) { this.output(job, Daemon.Frame.ERR, `${(e as Error).message}\n`); return this.finish(job, 1); }
    const environment = job.environment = this.environment();
    environment.start(program, 'main', job.project, {
      out: text => { this.output(job, Daemon.Frame.OUT, text); },
      err: text => { this.output(job, Daemon.Frame.ERR, text); },
    }).then(result => {
      if (result.status === 'done' && result.shown !== '') this.output(job, Daemon.Frame.OUT, `=> ${result.shown}\n`);
      this.finish(job, result.status === 'done' ? 0 : result.status === 'cancelled' ? 130 : 1);
    }, error => {
      this.output(job, Daemon.Frame.ERR, `${(error as Error).stack ?? error}\n`);
      this.finish(job, 1);
    });
  }

  private schedule(): void {
    while (this.running < config.memory.processes && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      if (job.project.stopped || this.store(job.meta).stopping(job.meta.id)) { job.project.stop(); this.finish(job, 130); continue; }
      this.running++;
      job.meta.began = Date.now();
      this.store(job.meta).save(job.meta);
      this.start(job);
    }
    if (this.jobs.size > 0) this.ticker ??= setInterval(() => {
      if (this.jobs.size === 0) { clearInterval(this.ticker); this.ticker = undefined; return; }
      for (const job of this.jobs.values()) this.flush(job);
    }, config.jobs.flush);
  }
}

export namespace Jobs {
  export type Send = (type: Daemon.Frame, payload?: string | Uint8Array) => Promise<void>;
  export type Job = { meta: Daemon.Meta; request: Daemon.Run; project: Project; log: Log; environment?: Environment; owner?: Send; viewers: Set<Send> };

  const encoder = new TextEncoder(), decoder = new TextDecoder();
  export function bytes(data: string | Uint8Array): Uint8Array { return typeof data === 'string' ? encoder.encode(data) : data; }
  export function text(data: Uint8Array): string { return decoder.decode(data); }
}

export interface Port { post(message: unknown): void; listen(handler: (message: any) => void): void; }
export interface Thread { post(message: unknown): void; terminate(): void; }
export interface Listener { message(message: { process: number; error: string }): void; exit(failure: string): void; }

export interface Host {
  readonly pid: number;
  readonly threads: number;
  readonly store: Store;
  memory(words: number): Int32Array;
  spawn(listener: Listener): Thread;
}

export namespace Host {
  export function node(): Host {
    return {
      pid: process.pid,
      threads: env.os.availableParallelism?.() ?? env.os.cpus().length,
      store: new Disk(),
      memory: words => new Int32Array(new SharedArrayBuffer(4 * words)),
      spawn(listener) {
        const file = env.url.fileURLToPath(import.meta.url), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
        const worker = new env.worker_threads.Worker(file, {
          workerData: { daemon: NAME },
          execArgv: typescript ? [...process.execArgv, '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
        });
        let failure = '';
        worker.on('message', message => listener.message(message));
        worker.on('error', error => { failure = `${error.stack ?? error}\n`; });
        worker.on('exit', () => listener.exit(failure));
        return { post: message => worker.postMessage(message), terminate: () => { worker.terminate(); } };
      },
    };
  }

  export function web(): Host {
    const isolated = (globalThis as any).crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined' && typeof Worker !== 'undefined';
    return {
      pid: 0,
      threads: isolated ? (globalThis as any).navigator?.hardwareConcurrency ?? 2 : 0,
      store: new Memory(),
      memory: words => new Int32Array(isolated ? new SharedArrayBuffer(4 * words) : new ArrayBuffer(4 * words)),
      spawn(listener) {
        const worker = new Worker(import.meta.url, { type: 'module', name: `${NAME} worker` });
        worker.onmessage = event => listener.message(event.data);
        worker.onerror = event => { event.preventDefault(); worker.terminate(); listener.exit(`${event.message}\n`); };
        return { post: message => worker.postMessage(message), terminate: () => worker.terminate() };
      },
    };
  }
}

export namespace Browser {
  export type Request = Daemon.Request | { kind: 'list' } | { kind: 'attach'; job?: number } | { kind: 'rm'; job?: number };
  export type Listed = Daemon.Meta & { state: Daemon.State };

  let jobs: Jobs | undefined;

  export function serve(port: Port): void {
    const host = jobs ??= new Jobs(env.host);
    port.listen(({ id, request }: { id: number; request: Request }) => {
      const send: Jobs.Send = async (type, payload = '') => port.post({ id, type, payload });
      const fail = (message: string) => { send(Daemon.Frame.ERR, `${message}\n`); send(Daemon.Frame.EXIT, '1'); };
      if (request.kind === 'run') {
        if (!request.detached) return void host.submit(request, { owner: send });
        const meta = host.submit(request, request.attach ? { viewer: send } : {});
        return void send(Daemon.Frame.ACCEPTED, String(meta.id));
      }
      if (request.kind === 'list' || request.kind === 'ephemeral') {
        send(Daemon.Frame.OUT, JSON.stringify(host.list().map(meta => ({ ...meta, state: Daemon.state(meta, host.host.store) }))));
        return void send(Daemon.Frame.EXIT, '0');
      }
      if (request.kind === 'stop') return void send(Daemon.Frame.EXIT, host.stop(request.job) ? '0' : '1');
      if (request.kind === 'attach') {
        const job = request.job ?? Math.max(-1, ...host.list().map(meta => meta.id));
        if (!host.watch(job, send)) fail(job === -1 ? 'There are no jobs.' : `There is no job ${job}.`);
        return;
      }
      const finished = host.list().filter(meta => !Daemon.active(meta, host.host.store) && (request.job === undefined || meta.id === request.job));
      if (request.job !== undefined && finished.length === 0) return fail(`There is no finished job ${request.job}.`);
      for (const meta of finished) host.host.store.remove(meta.id);
      send(Daemon.Frame.EXIT, '0');
    });
  }

  export function shared(): void {
    (globalThis as any).onconnect = (event: MessageEvent) => {
      const port = event.ports[0];
      serve({ post: message => port.postMessage(message), listen: handler => { port.onmessage = message => handler(message.data); } });
    };
  }
}

export class Client {
  private requests = 0;
  private readonly handlers = new Map<number, (type: Daemon.Frame, payload: string | Uint8Array) => void>();

  constructor(private readonly port: Port, readonly daemon: boolean) {
    port.listen(({ id, type, payload }: { id: number; type: Daemon.Frame; payload: string | Uint8Array }) => this.handlers.get(id)?.(type, payload));
  }

  static page(options: { daemon?: boolean } = {}): Client {
    const name = `${NAME} daemon`, scope = globalThis as any;
    if (options.daemon && typeof scope.SharedWorker !== 'undefined') {
      const shared = new scope.SharedWorker(import.meta.url, { type: 'module', name, extendedLifetime: true });
      return new Client({ post: message => shared.port.postMessage(message), listen: handler => { shared.port.onmessage = (event: MessageEvent) => handler(event.data); } }, true);
    }
    const worker = new Worker(import.meta.url, { type: 'module', name });
    return new Client({ post: message => worker.postMessage(message), listen: handler => { worker.onmessage = event => handler(event.data); } }, false);
  }

  private request<T>(request: Browser.Request, on: (type: Daemon.Frame, payload: string | Uint8Array, done: (value: T) => void) => void): Promise<T> {
    const id = ++this.requests;
    return new Promise<T>(resolve => {
      this.handlers.set(id, (type, payload) => on(type, payload, value => { this.handlers.delete(id); resolve(value); }));
      this.port.post({ id, request });
    });
  }

  private static text(payload: string | Uint8Array): string { return typeof payload === 'string' ? payload : Jobs.text(payload); }

  private stream(io: IO): (type: Daemon.Frame, payload: string | Uint8Array, done: (exit: number) => void) => void {
    return (type, payload, done) => {
      if (type === Daemon.Frame.OUT) io.out(payload);
      if (type === Daemon.Frame.ERR) io.err(payload);
      if (type === Daemon.Frame.EXIT) done(Number(Client.text(payload)));
    };
  }

  run(argv: CLI.Args, io: IO, options: { detached?: boolean; attach?: boolean; ephemeral?: boolean; variables?: Record<string, string | undefined> } = {}): Promise<number> {
    const detached = options.detached ?? this.daemon, attach = options.attach ?? true;
    const request: Daemon.Run = {
      kind: 'run', argv, command: [NAME.toLowerCase(), ...argv[0]], cwd: '', variables: options.variables ?? {}, build: '',
      detached, attach, ephemeral: !!options.ephemeral,
    };
    const stream = this.stream(io);
    return this.request<number>(request, (type, payload, done) => {
      if (type !== Daemon.Frame.ACCEPTED) return stream(type, payload, done);
      if (!attach) done(Number(Client.text(payload)));
    });
  }

  list(): Promise<Browser.Listed[]> {
    let listed: Browser.Listed[] = [];
    return this.request({ kind: 'list' }, (type, payload, done) => {
      if (type === Daemon.Frame.OUT) listed = JSON.parse(Client.text(payload));
      if (type === Daemon.Frame.EXIT) done(listed);
    });
  }

  stop(job: number): Promise<boolean> {
    return this.request({ kind: 'stop', job }, (type, payload, done) => { if (type === Daemon.Frame.EXIT) done(Client.text(payload) === '0'); });
  }

  attach(job: number | undefined, io: IO): Promise<number> { return this.request({ kind: 'attach', job }, this.stream(io)); }

  remove(job?: number): Promise<number> {
    return this.request({ kind: 'rm', job }, (type, payload, done) => { if (type === Daemon.Frame.EXIT) done(Number(Client.text(payload))); });
  }
}

export interface Log { write(type: Daemon.Frame, data: Uint8Array): boolean; close(): void; }

export interface Store {
  next(): number;
  save(meta: Daemon.Meta): void;
  read(id: number): Daemon.Meta | undefined;
  all(): Daemon.Meta[];
  ids(): number[];
  remove(id: number): void;
  stopping(id: number): boolean;
  alive(meta: Daemon.Meta): boolean;
  log(meta: Daemon.Meta): Log;
  replay(meta: Daemon.Meta): Iterable<[Daemon.Frame, Uint8Array]>;
  recover(): void;
  retain(live?: Daemon.Meta[]): void;
}

export class Memory implements Store {
  private readonly metas = new Map<number, Daemon.Meta>();
  private readonly outputs = new Map<number, [Daemon.Frame, Uint8Array][]>();
  private counter = 1;

  next(): number { return this.counter++; }
  save(meta: Daemon.Meta): void { this.metas.set(meta.id, meta); }
  read(id: number): Daemon.Meta | undefined { return this.metas.get(id); }
  all(): Daemon.Meta[] { return [...this.metas.values()]; }
  ids(): number[] { return [...this.metas.keys()].sort((a, b) => a - b); }
  remove(id: number): void { this.metas.delete(id); this.outputs.delete(id); }
  stopping(): boolean { return false; }
  alive(): boolean { return true; }
  replay(meta: Daemon.Meta): Iterable<[Daemon.Frame, Uint8Array]> { return this.outputs.get(meta.id) ?? []; }
  recover(): void {}

  log(meta: Daemon.Meta): Log {
    const output: [Daemon.Frame, Uint8Array][] = [];
    if (!meta.ephemeral) this.outputs.set(meta.id, output);
    return {
      write: (type, data) => {
        meta.written += data.length;
        if (meta.ephemeral) return false;
        output.push([type, data.slice()]);
        meta.size += data.length;
        return meta.size > config.jobs.memory;
      },
      close: () => {},
    };
  }

  retain(live: Daemon.Meta[] = []): void {
    const now = Date.now(), finished = () => this.all().filter(meta => meta.ended !== undefined).sort((a, b) => a.ended! - b.ended!);
    for (const meta of finished()) if (now - meta.ended! > config.jobs.retention) this.remove(meta.id);
    const kept = finished();
    for (const meta of kept.slice(0, Math.max(0, kept.length - config.jobs.keep))) this.remove(meta.id);
    let total = this.all().reduce((sum, meta) => sum + meta.size, 0);
    for (const meta of finished()) { if (total <= config.jobs.memory) break; total -= meta.size; this.remove(meta.id); }
    for (const meta of live) {
      const output = this.outputs.get(meta.id);
      while (output !== undefined && total > config.jobs.memory && output.length > 1) {
        const [, data] = output.shift()!;
        meta.size -= data.length;
        meta.first++;
        total -= data.length;
      }
    }
  }
}

export class Disk implements Store {
  root(): string {
    const root = env.path.join(env.cache, NAME.toLowerCase(), 'jobs');
    env.fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    return root;
  }
  directory(id: number): string { return env.path.join(this.root(), String(id)); }
  segment(id: number, index: number): string { return env.path.join(this.directory(id), `${String(index).padStart(4, '0')}.log`); }

  next(): number {
    const { fs, path } = env, counter = path.join(this.root(), 'next');
    const id = Math.max(Number(fs.readFileSync(counter, { encoding: 'utf8', flag: 'a+' })) || 1, ...this.ids().map(id => id + 1));
    fs.writeFileSync(counter, String(id + 1));
    return id;
  }

  ids(): number[] {
    return env.fs.readdirSync(this.root()).filter(name => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b);
  }
  read(id: number): Daemon.Meta | undefined {
    try { return JSON.parse(env.fs.readFileSync(env.path.join(this.directory(id), 'job.json'), 'utf8')); } catch { return undefined; }
  }
  all(): Daemon.Meta[] { return this.ids().map(id => this.read(id)).filter((meta): meta is Daemon.Meta => meta !== undefined); }
  save(meta: Daemon.Meta): void {
    const file = env.path.join(this.directory(meta.id), 'job.json');
    try {
      env.fs.mkdirSync(this.directory(meta.id), { recursive: true, mode: 0o700 });
      env.fs.writeFileSync(file + '.tmp', JSON.stringify(meta));
      env.fs.renameSync(file + '.tmp', file);
    } catch {}
  }
  remove(id: number): void { env.fs.rmSync(this.directory(id), { recursive: true, force: true }); }
  stopping(id: number): boolean { return env.fs.existsSync(env.path.join(this.directory(id), 'stop')); }

  alive(meta: Daemon.Meta): boolean {
    try { process.kill(meta.daemon, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
  }

  recover(): void {
    for (const meta of this.all()) if (meta.ended === undefined && !this.alive(meta)) { meta.lost = true; meta.ended = Date.now(); this.save(meta); }
  }

  budget(): number {
    try { const stat = env.fs.statfsSync(this.root()); return Math.min(config.jobs.budget, stat.bavail * stat.bsize * config.jobs.share); } catch { return config.jobs.budget; }
  }

  retain(live: Daemon.Meta[] = []): void {
    const now = Date.now(), metas = new Map(this.all().map(meta => [meta.id, meta]));
    for (const meta of live) metas.set(meta.id, meta);
    const drop = (meta: Daemon.Meta) => { this.remove(meta.id); metas.delete(meta.id); };
    const finished = () => [...metas.values()].filter(meta => meta.ended !== undefined).sort((a, b) => a.ended! - b.ended!);

    for (const meta of finished()) if (now - meta.ended! > config.jobs.retention) drop(meta);
    const kept = finished();
    for (const meta of kept.slice(0, Math.max(0, kept.length - config.jobs.keep))) drop(meta);

    const limit = this.budget();
    let total = [...metas.values()].reduce((sum, meta) => sum + meta.size, 0);
    for (const meta of finished()) { if (total <= limit) break; total -= meta.size; drop(meta); }
    while (total > limit) {
      const largest = live.filter(meta => metas.has(meta.id) && meta.first < meta.last).sort((a, b) => b.size - a.size)[0];
      if (largest === undefined) break;
      const file = this.segment(largest.id, largest.first);
      let size = 0;
      try { size = env.fs.statSync(file).size; env.fs.unlinkSync(file); } catch {}
      largest.first++;
      largest.size -= size;
      total -= size;
      this.save(largest);
    }
  }

  log(meta: Daemon.Meta): Log {
    const open = () => env.fs.openSync(this.segment(meta.id, meta.last), 'a', 0o600);
    let fd = open(), bytes = 0;
    return {
      write: (type, data) => {
        meta.written += data.length;
        let rotated = false;
        for (let at = 0; at === 0 || at < data.length; at += config.frame) {
          const piece = data.subarray(at, at + config.frame);
          if (bytes >= config.jobs.segment) {
            env.fs.closeSync(fd);
            meta.last++;
            fd = open();
            bytes = 0;
            rotated = true;
          }
          const frame = Buffer.concat([Daemon.header(type, piece.length), piece]);
          env.fs.writeSync(fd, frame);
          bytes += frame.length;
          meta.size += frame.length;
        }
        return rotated;
      },
      close: () => env.fs.closeSync(fd),
    };
  }

  *replay(meta: Daemon.Meta): Iterable<[Daemon.Frame, Uint8Array]> {
    const frames: [Daemon.Frame, Uint8Array][] = [], parse = Daemon.frames((type, payload) => frames.push([type, payload]));
    for (let index = meta.first; index <= meta.last; index++) {
      try { parse(env.fs.readFileSync(this.segment(meta.id, index))); } catch { continue; }
      yield* frames.splice(0);
    }
  }
}

export namespace Daemon {
  export type Run = { kind: 'run'; argv: CLI.Args; command: string[]; cwd: string; variables: Record<string, string | undefined>; build: string; detached: boolean; attach: boolean; ephemeral: boolean };
  export type Request = Run | { kind: 'ephemeral' } | { kind: 'stop'; job: number };
  export enum Frame { REQUEST, OUT, ERR, EXIT, STALE, ACCEPTED }
  export type Meta = {
    id: number; command: string[]; cwd: string; daemon: number; created: number; began?: number; ended?: number; exit?: number; stopped?: boolean; lost?: boolean; ephemeral?: boolean;
    steps: number; memory: number; written: number; size: number; first: number; last: number;
  };
  export type State = 'queued' | 'running' | 'stopping' | 'stopped' | 'done' | 'lost';

  export function state(meta: Meta, store: Store = env.host.store): State {
    if (meta.ended !== undefined) return meta.lost ? 'lost' : meta.stopped ? 'stopped' : 'done';
    if (!store.alive(meta)) return 'lost';
    if (meta.stopped || store.stopping(meta.id)) return 'stopping';
    return meta.began === undefined ? 'queued' : 'running';
  }
  export function active(meta: Meta, store: Store = env.host.store): boolean { return ['queued', 'running', 'stopping'].includes(state(meta, store)); }

  export function worker(port: Port): void {
    port.listen(({ memory, layout, id }: { memory: SharedArrayBuffer; layout: Layout.Plan; id: number }) =>
      Workers.work(new Int32Array(memory), layout, id, (process, error) => port.post({ process, error })));
  }

  export function job(value: string | true | (string | true)[], args: string[]): number | undefined {
    const given = Array.isArray(value) ? value.at(-1) : value;
    const id = given === true ? args[0] : given;
    if (id === undefined) return undefined;
    if (!/^\d+$/.test(id)) throw new Error(`'${id}' isn't a job id; see --list.`);
    return Number(id);
  }

  export async function query(socket: string, message: Request): Promise<{ exit: number; out: Buffer } | undefined> {
    const connection = await connect(socket).catch((): undefined => undefined);
    if (connection === undefined) return undefined;
    return new Promise(resolve => {
      const out: Buffer[] = [];
      connection.on('error', () => resolve(undefined)).on('close', () => resolve(undefined)).on('data', frames((type, payload) => {
        if (type === Frame.OUT) out.push(payload);
        if (type === Frame.EXIT) { connection.end(); resolve({ exit: Number(payload.toString()), out: Buffer.concat(out) }); }
      }));
      write(connection, Frame.REQUEST, JSON.stringify(message));
    });
  }

  export async function ephemeral(socket: string): Promise<Meta[]> {
    const reply = await query(socket, { kind: 'ephemeral' });
    return reply === undefined ? [] : JSON.parse(reply.out.toString());
  }

  export async function list(socket: string): Promise<string> {
    const now = Date.now(), metas = [...env.host.store.all(), ...await ephemeral(socket)].map(meta => ({ meta, state: state(meta) }));
    const rank = (state: State) => ['running', 'stopping', 'queued'].includes(state) ? 0 : 1;
    metas.sort((a, b) => rank(a.state) - rank(b.state) || a.meta.id - b.meta.id);
    return table(metas.map(({ meta, state }) => [
      String(meta.id), state, clock(meta.created), meta.began === undefined ? '-' : duration((meta.ended ?? now) - meta.began),
      count(meta.steps), bytes(meta.memory), bytes(meta.written), meta.exit === undefined ? '-' : String(meta.exit),
      home(meta.cwd), meta.command.join(' '),
    ]));
  }

  export async function stop(id: number, socket: string): Promise<number> {
    const disk = env.host.store as Disk, meta = disk.read(id);
    if (meta === undefined) {
      if ((await query(socket, { kind: 'stop', job: id }))?.exit === 0) return 0;
      process.stderr.write(`There is no job ${id}; see --list.\n`);
      return 1;
    }
    if (!active(meta)) { process.stderr.write(`Job ${id} has already ended.\n`); return 1; }
    env.fs.writeFileSync(env.path.join(disk.directory(id), 'stop'), '');
    return 0;
  }

  export function remove(id?: number): number {
    const store = env.host.store;
    if (id === undefined) {
      for (const meta of store.all()) if (!active(meta)) store.remove(meta.id);
      return 0;
    }
    const meta = store.read(id);
    if (meta === undefined) { process.stderr.write(`There is no job ${id}; see --list.\n`); return 1; }
    if (active(meta)) { process.stderr.write(`Job ${id} is still ${state(meta)}; --stop it first.\n`); return 1; }
    store.remove(id);
    return 0;
  }

  export async function attach(id: number | undefined, socket: string): Promise<number> {
    const { fs } = env, disk = env.host.store as Disk, hidden = await ephemeral(socket);
    id ??= Math.max(-1, ...disk.ids(), ...hidden.map(meta => meta.id));
    if (hidden.some(meta => meta.id === id)) { process.stderr.write(`Job ${id} is ephemeral: its output is only streamed to the client that started it.\n`); return 1; }
    let meta = disk.read(id);
    if (meta === undefined) { process.stderr.write(id === -1 ? `There are no jobs.\n` : `There is no job ${id}; see --list.\n`); return 1; }

    let waiting: Promise<void> | undefined;
    const forward = (stream: NodeJS.WriteStream, payload: Buffer) => { if (!stream.write(payload)) waiting = drained(stream, false); };
    const parse = frames((type, payload) => forward(type === Frame.ERR ? process.stderr : process.stdout, payload));
    const skipped = () => process.stderr.write(`[${NAME}: the start of job ${id}'s output is no longer kept]\n`);

    if (meta.first > 1) skipped();
    let index = meta.first, position = 0, fd: number | undefined;
    const buffer = Buffer.allocUnsafe(config.frame);
    while (true) {
      if (fd === undefined) {
        try { fd = fs.openSync(disk.segment(id, index), 'r'); }
        catch {
          meta = disk.read(id) ?? meta;
          if (index < meta.first) { skipped(); index = meta.first; position = 0; continue; }
          if (!active(meta)) break;
          await new Promise(resolve => setTimeout(resolve, config.jobs.poll));
          continue;
        }
      }
      const read = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (read > 0) {
        position += read;
        parse(Buffer.from(buffer.subarray(0, read)));
        if (waiting) { await waiting; waiting = undefined; }
        continue;
      }
      const latest = disk.read(id) ?? meta;
      if (index < latest.last) { fs.closeSync(fd); fd = undefined; index++; position = 0; continue; }
      if (!active(latest) && fs.readSync(fd, buffer, 0, 1, position) === 0) { meta = latest; break; }
      await new Promise(resolve => setTimeout(resolve, config.jobs.poll));
    }
    if (fd !== undefined) fs.closeSync(fd);
    return meta.exit ?? 1;
  }

  export function table(rows: string[][]): string {
    const head = ['ID', 'STATE', 'STARTED', 'ELAPSED', 'STEPS', 'MEM', 'OUTPUT', 'EXIT', 'CWD', 'COMMAND'], right = new Set([0, 3, 4, 5, 6, 7]);
    const widths = head.map((title, column) => Math.max(title.length, ...rows.map(row => row[column].length)));
    return [head, ...rows].map(row => row.map((cell, column) =>
      column === row.length - 1 ? cell : right.has(column) ? cell.padStart(widths[column]) : cell.padEnd(widths[column])).join('  ')).join('\n') + '\n';
  }

  export function clock(time: number): string {
    const date = new Date(time), today = new Date().toDateString() === date.toDateString(), two = (n: number) => String(n).padStart(2, '0');
    return today ? `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}` : date.toLocaleDateString('en', { month: 'short', day: '2-digit' });
  }

  export function duration(ms: number): string {
    const seconds = ms / 1000, minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
  }

  const scaled = (n: number, base: number, units: string[]) => {
    if (!n) return '-';
    let unit = 0;
    while (n >= base && unit < units.length - 1) { n /= base; unit++; }
    return `${n >= 10 || unit === 0 ? Math.round(n) : n.toFixed(1)}${units[unit]}`;
  };
  export function count(n: number): string { return scaled(n, 1000, ['', 'K', 'M', 'G', 'T']); }
  export function bytes(n: number): string { return scaled(n, 1024, ['B', 'K', 'M', 'G', 'T']); }

  export function home(location: string): string {
    const home = env.os.homedir();
    return location === home || location.startsWith(home + env.path.sep) ? '~' + location.slice(home.length) : location;
  }

  export function pipe(socket: string): boolean { return /^\\\\[.?]\\pipe\\/i.test(socket); }

  export function connect(socket: string = env.socket): Promise<import('net').Socket> {
    return new Promise((resolve, reject) => {
      const connection = env.net.connect(socket);
      connection.once('connect', () => resolve(connection));
      connection.once('error', reject);
    });
  }

  export function header(type: Frame, length: number): Buffer {
    const header = Buffer.allocUnsafe(5);
    header.writeUInt8(type, 0);
    header.writeUInt32LE(length, 1);
    return header;
  }

  export function write(connection: import('net').Socket, type: Frame, payload: string | Uint8Array): boolean {
    const bytes = typeof payload === 'string' ? Buffer.from(payload) : Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    let written = true;
    for (let at = 0; at === 0 || at < bytes.length; at += config.frame) {
      const piece = bytes.subarray(at, at + config.frame);
      connection.write(header(type, piece.length));
      written = connection.write(piece);
    }
    return written;
  }

  export function frames(on: (type: Frame, payload: Buffer) => void): (chunk: Buffer) => void {
    let head = Buffer.alloc(0), payload: Buffer | undefined, filled = 0, type = Frame.REQUEST;
    return chunk => {
      while (chunk.length > 0) {
        if (payload === undefined) {
          const needed = 5 - head.length;
          head = Buffer.concat([head, chunk.subarray(0, needed)]);
          chunk = chunk.subarray(needed);
          if (head.length < 5) return;
          type = head.readUInt8(0);
          payload = Buffer.allocUnsafe(head.readUInt32LE(1));
          head = Buffer.alloc(0);
          filled = 0;
        }
        const copied = chunk.copy(payload, filled);
        filled += copied;
        chunk = chunk.subarray(copied);
        if (filled === payload.length) { const done = payload; payload = undefined; on(type, done); }
      }
    };
  }

  export function command(socket: string): [string, string[]] {
    const deno = (globalThis as any).Deno;
    if (deno !== undefined) return deno.mainModule.includes('/deno-compile-')
      ? [deno.execPath(), [`--daemon=${socket}`]]
      : [deno.execPath(), ['run', '-A', '--no-config', env.url.fileURLToPath(deno.mainModule), `--daemon=${socket}`]];
    return [process.execPath, [...process.execArgv, process.argv[1], `--daemon=${socket}`]];
  }

  export async function start(socket: string = env.socket): Promise<import('net').Socket> {
    try { return await connect(socket); } catch {}
    env.secure(socket);
    const [executable, args] = command(socket);
    env.child_process.spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 200; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      try { return await connect(socket); } catch {}
    }
    throw new Error(`${NAME}'s daemon didn't start on '${socket}'.`);
  }

  export function request(connection: import('net').Socket, message: Run, socket: string): Promise<number | undefined> {
    return new Promise(resolve => {
      let exited = false;
      const forward = (stream: NodeJS.WriteStream, payload: Buffer) => {
        if (stream.write(payload)) return;
        connection.pause();
        stream.once('drain', () => connection.resume());
      };
      connection.on('data', frames((type, payload) => {
        if (type === Frame.OUT) forward(process.stdout, payload);
        if (type === Frame.ERR) forward(process.stderr, payload);
        if (type === Frame.EXIT) { exited = true; connection.end(); resolve(Number(payload.toString())); }
        if (type === Frame.STALE) { exited = true; connection.destroy(); resolve(undefined); }
        if (type === Frame.ACCEPTED && message.attach && message.ephemeral) process.stderr.write(`[job ${payload}]\n`);
        else if (type === Frame.ACCEPTED) {
          exited = true;
          connection.end();
          if (!message.attach) {
            process.stdout.write(`${payload}\n`);
            if (message.ephemeral) process.stderr.write(`Job ${payload} is ephemeral and detached: its output isn't kept anywhere.\n`);
            return resolve(0);
          }
          process.stderr.write(`[job ${payload}]\n`);
          attach(Number(payload.toString()), socket).then(resolve);
        }
      }));
      connection.once('close', () => {
        if (!exited) { process.stderr.write(`${NAME}'s daemon closed the connection before it finished.\n`); resolve(1); }
      });
      write(connection, Frame.REQUEST, JSON.stringify(message));
    });
  }
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
    return [`${NAME} ${env.version.toString()}`, `Usage: ${env.command.toLowerCase()} [options] [files...]`, 'Options:', ...rows.map(([flags, d]) => d ? `${flags.padEnd(width)}  ${d}` : flags)].join('\n');
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

  static get port(): Port {
    if (env.nodejs) {
      const parent = env.worker_threads.parentPort!;
      return { post: message => parent.postMessage(message), listen: handler => { parent.on('message', handler); } };
    }
    const scope = globalThis as any;
    return { post: message => scope.postMessage(message), listen: handler => { scope.onmessage = (event: MessageEvent) => handler(event.data); } };
  }

  private static _host?: Host;
  static get host(): Host { return env._host ??= env.nodejs ? Host.node() : Host.web(); }

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

  static secure(socket: string): string {
    if (Daemon.pipe(socket)) return socket;
    const { fs, path } = env;
    socket = path.resolve(socket);
    const dir = path.dirname(socket);
    if (process.platform === 'win32') { fs.mkdirSync(dir, { recursive: true }); return socket; }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir), uid = process.getuid!();
    if (socket === env.socket) {
      if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077) !== 0)
        throw new Error(`'${dir}' isn't a directory private to you (owned by you, mode 700); refusing to put the ${NAME} socket there.`);
    } else if ((stat.mode & 0o022) !== 0) {
      console.warn(`warning: '${dir}' is writable by other users; the ${NAME} socket is only as safe as its own permissions there.`);
    }
    const existing = fs.lstatSync(socket, { throwIfNoEntry: false });
    if (existing !== undefined && (existing.isSymbolicLink() || !existing.isSocket() || existing.uid !== uid))
      throw new Error(`'${socket}' is already there and isn't a socket of yours; refusing to replace it.`);
    return socket;
  }

  static root(cwd: string): string {
    const { fs, path } = env;
    const language_dir = (dir: string) => path.join(dir, ...ROOT);
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = cwd;
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return dir;
    dir = import.meta.dirname;
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${ROOT.join('/')}' directory.`)
  }

}

export class Project {
  private _cwd?: string;
  private environment?: Environment;
  private process = -1;
  private stopping = false;
  private counters = { steps: 0, memory: 0, cursors: 0 };

  constructor(public readonly from: string = env.nodejs ? process.cwd() : '', public readonly variables: Record<string, string | undefined> = env.nodejs ? { ...process.env } : {}) {}

  bind(environment: Environment, process: number): void {
    this.environment = environment;
    this.process = process;
    if (this.stopping) environment.cancel(process);
  }
  unbind(counters: { steps: number; memory: number; cursors: number }): void {
    this.counters = counters;
    this.environment = undefined;
    this.process = -1;
  }

  get stopped(): boolean { return this.stopping; }
  stop(): void { this.stopping = true; this.environment?.cancel(this.process); }

  get steps(): number { return this.environment ? this.environment.m[this.process + Layout.STEPS] : this.counters.steps; }
  get memory(): number { return this.environment ? 4 * (this.environment.m[this.process + Layout.NEXT] - this.environment.m[this.process + Layout.ARENA]) : this.counters.memory; }
  get cursors(): number { return this.environment ? this.environment.m[this.process + Layout.LIVE] : this.counters.cursors; }

  get cwd(): string { return this._cwd ??= env.root(this.from); }

  location(location: string): string {
    location = location.replace(/\/$/, '');
    return env.nodejs ? env.path.relative(this.cwd, env.path.resolve(this.from, location)) : location;
  }

  read(location: string): string {
    if (env.nodejs) return env.fs.readFileSync(env.path.join(this.cwd, location), 'utf8');
    if (location in env.sources) return env.sources[location];
    throw new Error(`'${location}' isn't one of the sources bundled with ${NAME} (src/bundled.ts, written by scripts/bundle.mjs).`);
  }

  file(location: string): Text.Source { return new Text.Source(location); }
  directory(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean }): Text.Source[] {
    location = location.replace(/\/$/, '')
    if (!env.nodejs) {
      const prefix = location + '/';
      return env.manifest
        .filter(entry => entry.startsWith(prefix))
        .filter(entry => options.recursively || !entry.slice(prefix.length).includes('/'))
        .filter(entry => options.filter ? options.filter(entry) : true)
        .map(entry => this.file(entry));
    }

    const locations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of env.fs.readdirSync(env.path.join(this.cwd, dir), { withFileTypes: true })) {
        const entry_path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { if (options.recursively) walk(entry_path); continue; }
        if (options.filter && !options.filter(entry_path)) continue;
        locations.push(entry_path);
      }
    };
    walk(location);
    return locations.map(entry => this.file(entry));
  }
  at(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean } = {}): Text.Source[] {
    location = this.location(location);
    const is_file = env.nodejs
      ? env.fs.statSync(env.path.join(this.cwd, location)).isFile()
      : env.manifest.includes(location);
    return is_file ? [this.file(location)] : this.directory(location, options);
  }


}

export namespace Word {
  export const INT = 0, REF = 1, SPECIAL = 2;

  export const int = (n: number) => n << 2;
  export const integer = (w: number) => w >> 2;
  export const ref = (address: number) => (address << 2) | REF;
  export const address = (w: number) => w >> 2;
  export const kind = (w: number) => w & 3;

  export const NOTHING = (0 << 2) | SPECIAL;
  export const UNRESOLVED = (1 << 2) | SPECIAL;

  export const truthy = (w: number) => w !== int(0) && w !== NOTHING;
}

export namespace Layout {
  export const WAKE = 0, SERVE = 1, HEAP = 2, STOP = 3, CONTROL = 8;
  export const TOP = 0, BOTTOM = 1, SLOTS = 2, CURSOR = 4;
  export const HEAD = 0, TAIL = 1;
  export const CODE = 0, PROCESS = 1, PC = 2, STATE = 3, DST = 4, ARGC = 5, GENERATION_OF = 6, ARGS = 7, MAX_ARGS = 4, REQUEST = ARGS + MAX_ARGS;
  export const STATUS = 0, LIVE = 1, RESULT = 2, ARENA = 3, NEXT = 4, END = 5, STEPS = 6, GENERATION = 7, PROCESS_SIZE = 8;
  export const FREE = 0, RUNNING = 1, CANCELLED = 2, DONE = 3;
  export const FINISHED = -1, EACH_CALL = -2;

  export type Plan = {
    words: number; workers: number; queue: number; ring: number; processes: number;
    injection: number; queues: number[]; rings: number[]; epochs: number; table: number; heap: number;
  };

  export function plan(options: { workers: number; words: number }): Plan {
    const { queue, ring, processes } = config.memory;
    let at = CONTROL;
    const injection = at; at += SLOTS + CURSOR * queue;
    const queues: number[] = [];
    for (let w = 0; w < options.workers; w++) { queues.push(at); at += SLOTS + CURSOR * queue; }
    const rings: number[] = [];
    for (let w = 0; w < options.workers; w++) { rings.push(at); at += 2 + ring * REQUEST; }
    const epochs = at; at += options.workers;
    const table = at; at += processes * PROCESS_SIZE;
    if (at >= options.words) throw new Error('memory too small for its layout');
    return { words: options.words, workers: options.workers, queue, ring, processes, injection, queues, rings, epochs, table, heap: at };
  }

  export const process_at = (plan: Plan, id: number) => plan.table + id * PROCESS_SIZE;

  export function alloc(m: Int32Array, process: number, words: number): number {
    const at = Atomics.add(m, process + NEXT, words);
    if (at + words > m[process + END]) throw new Error(`process arena full (${m[process + END] - m[process + ARENA]} words)`);
    return at;
  }

  export function heap(m: Int32Array, words: number): number {
    const at = m[HEAP];
    if (at + words > m.length) throw new Error('memory full');
    m[HEAP] = at + words;
    return at;
  }
}

const L = Layout;

export namespace Queue {
  export function add(m: Int32Array, q: number, capacity: number, pc: number, state: number, process: number, generation: number) {
    const b = m[q + L.BOTTOM], t = Atomics.load(m, q + L.TOP);
    if (b - t >= capacity) throw new Error('cursor queue full');
    const at = q + L.SLOTS + L.CURSOR * (b % capacity);
    m[at] = pc; m[at + 1] = state; m[at + 2] = process; m[at + 3] = generation;
    Atomics.store(m, q + L.BOTTOM, b + 1);
  }

  export function take(m: Int32Array, q: number, capacity: number, got: Int32Array): boolean {
    const b = Atomics.sub(m, q + L.BOTTOM, 1) - 1;
    const t = Atomics.load(m, q + L.TOP);
    if (t > b) { Atomics.store(m, q + L.BOTTOM, t); return false; }
    const at = q + L.SLOTS + L.CURSOR * (b % capacity);
    got.set(m.subarray(at, at + L.CURSOR));
    if (t === b) {
      const won = Atomics.compareExchange(m, q + L.TOP, t, t + 1) === t;
      Atomics.store(m, q + L.BOTTOM, t + 1);
      return won;
    }
    return true;
  }

  export function steal(m: Int32Array, q: number, capacity: number, got: Int32Array): boolean {
    const t = Atomics.load(m, q + L.TOP), b = Atomics.load(m, q + L.BOTTOM);
    if (t >= b) return false;
    const at = q + L.SLOTS + L.CURSOR * (t % capacity);
    const cursor = m.slice(at, at + L.CURSOR);
    if (Atomics.compareExchange(m, q + L.TOP, t, t + 1) !== t) return false;
    got.set(cursor);
    return true;
  }
}

export class Program {
  constructor(readonly key: string, readonly image: Int32Array, readonly regions: Map<string, number>) {}

  static compile(project: Project, files: string[]): Program {
    const text = files.map(file => {
      const location = project.location(file);
      if (!location.endsWith('.k2')) throw new Error(`'${file}': ${NAME} has no front end for this kind of file yet; Program.compile is where one goes (only .k2 assembly is read).`);
      return project.read(location);
    }).join('\n');
    const built = Program.assemble(text);
    return new Program(Program.hash(text), built.image, built.regions);
  }

  static hash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
  }
}

export namespace Program {
  export const MAGIC = 0x4b32, LENGTH = 1, REGIONS = 2, TABLE = 3;
  export const N = 0, E = 1, X = 2, ENTRIES = 3;

  export const JUMP = 1, IF = 2, FORK = 3, JOIN = 4, ENTER = 5, EXIT = 6, SET = 7,
    ADD = 8, SUB = 9, MUL = 10, LT = 11, EQ = 12, SUPERPOSE = 13, SYS = 14, EACH = 15;

  export const PRINT = 1;

  export function size(m: Int32Array, pc: number): number {
    switch (m[pc]) {
      case JUMP: case JOIN: return 2;
      case IF: return 5;
      case FORK: return 3 + m[pc + 1];
      case ENTER: { const ins = m[pc + 2], argc = m[pc + 3 + ins], outs = m[pc + 4 + ins + argc]; return 5 + ins + argc + 2 * outs; }
      case EXIT: case SET: return 3;
      case ADD: case SUB: case MUL: case LT: case EQ: case SUPERPOSE: return 4;
      case SYS: return 4 + m[pc + 3];
      case EACH: return 4;
    }
    throw new Error(`not an instruction: ${m[pc]} at ${pc}`);
  }

  export const region_at = (image: Int32Array, index: number) => image[TABLE + index];

  export type Word = number | { label: string } | { region: string } | { constant: number };

  export class Region {
    code: Word[] = [];
    labels = new Map<string, number>();
    entries: string[] = [];
    constructor(public name: string, public cells: number, public exits: number) {}
    entry(label: string) { this.entries.push(label); return this; }
    label(name: string) { this.labels.set(name, this.code.length); return this; }
    op(...words: Word[]) { this.code.push(...words); return this; }
  }

  export class Assembler {
    regions: Region[] = [];

    region(name: string, cells: number, exits = 1) { const r = new Region(name, cells, exits); this.regions.push(r); return r; }

    int(n: number): Word { return { constant: Word.int(n) }; }

    build(): { image: Int32Array; regions: Map<string, number> } {
      const index = new Map(this.regions.map((r, i) => [r.name, i]));
      const constants = new Map<number, number>();
      let at = TABLE + this.regions.length;
      for (const r of this.regions) for (const w of r.code) if (typeof w === 'object' && 'constant' in w && !constants.has(w.constant)) constants.set(w.constant, at++);
      const starts: number[] = [];
      for (const r of this.regions) { starts.push(at); at += ENTRIES + r.entries.length + r.code.length; }
      const image = new Int32Array(at);
      image[0] = MAGIC; image[LENGTH] = at; image[REGIONS] = this.regions.length;
      this.regions.forEach((_, i) => image[TABLE + i] = starts[i]);
      for (const [value, address] of constants) image[address] = value;
      this.regions.forEach((r, i) => {
        const base = starts[i], code = base + ENTRIES + r.entries.length;
        const label = (name: string) => { const pc = r.labels.get(name); if (pc === undefined) throw new Error(`no label ${name} in ${r.name}`); return code + pc; };
        image[base + N] = r.cells; image[base + E] = r.entries.length; image[base + X] = r.exits;
        r.entries.forEach((l, k) => image[base + ENTRIES + k] = label(l));
        r.code.forEach((w, k) => {
          image[code + k] = typeof w === 'number' ? w
            : 'label' in w ? label(w.label)
            : 'region' in w ? (index.get(w.region) ?? (() => { throw new Error(`no region ${w.region}`); })())
            : -constants.get(w.constant)! - 1;
        });
      });
      return { image, regions: index };
    }
  }

  const binary: Record<string, number> = { add: ADD, sub: SUB, mul: MUL, lt: LT, eq: EQ, superpose: SUPERPOSE };

  export function assemble(text: string): { image: Int32Array; regions: Map<string, number> } {
    const a = new Assembler();
    let r: Region | undefined;
    const operand = (s: string): Word => {
      if (s.startsWith('c')) return Number(s.slice(1));
      if (s.startsWith('#')) return a.int(Number(s.slice(1)));
      throw new Error(`not an operand: ${s}`);
    };
    const cell = (s: string) => s === '-' ? -1 : Number(s.slice(1));
    const label = (s: string): Word => s === '-' ? -1 : { label: s };
    const option = (parts: string[], key: string) => (parts.find(p => p.startsWith(key + '='))?.slice(key.length + 1) ?? '').split(',').filter(x => x !== '');

    text.split('\n').forEach((line, n) => {
      const words = line.replace(/;.*/, '').trim().split(/\s+/).filter(w => w !== '');
      if (words.length === 0) return;
      const [op, ...rest] = words;
      try {
        if (op === 'region') { r = a.region(rest[0], Number(option(rest, 'cells')[0] ?? 0), Number(option(rest, 'exits')[0] ?? 1)); return; }
        if (r === undefined) throw new Error('outside a region');
        if (op.endsWith(':')) { r.label(op.slice(0, -1)); return; }
        if (op === 'entry') { r.entry(rest[0]); return; }
        if (op === 'jump') { r.op(JUMP, label(rest[0])); return; }
        if (op === 'if') { r.op(IF, operand(rest[0]), label(rest[1]), label(rest[2]), label(rest[3] ?? '-')); return; }
        if (op === 'fork') { const targets = rest[0].split(','); r.op(FORK, targets.length, ...targets.map(label), label(rest[1] ?? '-')); return; }
        if (op === 'join') { r.op(JOIN, label(rest[0])); return; }
        if (op === 'exit') { r.op(EXIT, Number(rest[0]), operand(rest[1])); return; }
        if (op === 'set') { r.op(SET, cell(rest[0]), operand(rest[1])); return; }
        if (op in binary) { r.op(binary[op], cell(rest[0]), operand(rest[1]), operand(rest[2])); return; }
        if (op === 'print') { r.op(SYS, -1, PRINT, 1, operand(rest[0])); return; }
        if (op === 'each') { r.op(EACH, cell(rest[0]), { region: rest[1] }, operand(rest[2])); return; }
        if (op === 'enter') {
          const ins = option(rest, 'in').map(Number), args = option(rest, 'args').map(operand);
          const outs = option(rest, 'out').map(o => o.split(':'));
          r.op(ENTER, { region: rest[0] }, ins.length, ...ins, args.length, ...args, outs.length, ...outs.flatMap(([l, c]) => [label(l), cell(c ?? '-')]));
          return;
        }
        throw new Error(`unknown instruction ${op}`);
      } catch (e) {
        throw new Error(`line ${n + 1}: ${(e as Error).message}`);
      }
    });
    return a.build();
  }
}

const { int, kind, address, ref, REF, NOTHING, UNRESOLVED, truthy } = Word;
const { JUMP, IF, FORK, JOIN, ENTER, EXIT, SET, ADD, SUB, MUL, LT, EQ, SUPERPOSE, SYS, EACH } = Program;

const BASE = 0, REGION = 1, ACT = 2, GROUP = 3, SOURCES = 4, OWNER = 5, GEN = 6, SH = 7;
const PENDING = 0, PARENT = 1, SITE = 2, LOG = 3, AH = 4, MAX_LOG = 256;
const REMAINING = 0, ARRIVED = 1, AFTER = 2, OUTER = 3, GH = 4, MAX_GROUP = 64;
const GONE = 0, YIELDED = 1, PARKED = 2;

export class Machine {
  pc = 0;
  state = 0;

  constructor(public m: Int32Array, public layout: Layout.Plan, public queue: number, public ring: number) {}

  spawn(pc: number, state: number) {
    Queue.add(this.m, this.queue, this.layout.queue, pc, state, this.m[state + OWNER], this.m[state + GEN]);
    Atomics.add(this.m, L.WAKE, 1);
    Atomics.notify(this.m, L.WAKE, 1);
  }

  get(state: number, o: number): number {
    const m = this.m;
    if (o < 0) return m[m[state + BASE] - o - 1];
    const at = state + SH + o;
    if (m[at] === UNRESOLVED) m[at] = this.resolve(state, o);
    return m[at];
  }

  set(state: number, o: number, v: number) { if (o >= 0) this.m[state + SH + o] = v; }

  resolve(state: number, k: number): number {
    const m = this.m, sources = m[state + SOURCES], values: number[] = [];
    for (let i = 0; i < m[sources]; i++) {
      const v = this.get(m[sources + 1 + i], k);
      if (v !== NOTHING) values.push(v);
    }
    return this.superpose(m[state + OWNER], values);
  }

  components(v: number): number[] {
    if (kind(v) !== REF) return [v];
    const at = address(v), n = this.m[at];
    return Array.from(this.m.subarray(at + 1, at + 1 + n));
  }

  superpose(process: number, values: number[]): number {
    const all: number[] = [];
    for (const v of values) for (const c of this.components(v)) if (!all.includes(c)) all.push(c);
    if (all.length === 0) return NOTHING;
    if (all.length === 1) return all[0];
    const at = L.alloc(this.m, process, 1 + all.length);
    this.m[at] = all.length;
    this.m.set(all, at + 1);
    return ref(at);
  }

  region_of(base: number, index: number) { return base + this.m[base + Program.TABLE + index]; }

  make_state(process: number, base: number, region: number, act: number): number {
    const m = this.m, n = m[region + Program.N], s = L.alloc(m, process, SH + n);
    m[s + BASE] = base; m[s + REGION] = region; m[s + ACT] = act; m[s + GROUP] = 0; m[s + SOURCES] = 0; m[s + OWNER] = process; m[s + GEN] = m[process + L.GENERATION];
    m.fill(NOTHING, s + SH, s + SH + n);
    return s;
  }

  copy(state: number): number {
    const m = this.m, n = m[m[state + REGION] + Program.N];
    const s = this.make_state(m[state + OWNER], m[state + BASE], m[state + REGION], m[state + ACT]);
    m[s + GROUP] = m[state + GROUP];
    for (let k = 0; k < n; k++) m[s + SH + k] = this.get(state, k);
    return s;
  }

  activation(process: number, parent: number, site: number): number {
    const a = L.alloc(this.m, process, AH + 2 * MAX_LOG);
    this.m[a + PENDING] = 0; this.m[a + PARENT] = parent; this.m[a + SITE] = site; this.m[a + LOG] = 0;
    return a;
  }

  fork(state: number, targets: number[], next: number): number {
    const m = this.m, g = L.alloc(m, m[state + OWNER], GH + MAX_GROUP);
    m[g + REMAINING] = targets.length; m[g + ARRIVED] = 0; m[g + AFTER] = next; m[g + OUTER] = m[state + GROUP];
    Atomics.add(m, m[state + ACT] + PENDING, targets.length - 1);
    for (let i = targets.length - 1; i >= 1; i--) { const s = this.copy(state); m[s + GROUP] = g; this.spawn(targets[i], s); }
    m[state + GROUP] = g;
    return targets[0];
  }

  arrive(state: number): number {
    const m = this.m, g = m[state + GROUP];
    if (g === 0) return state;
    const i = Atomics.add(m, g + ARRIVED, 1);
    if (i >= MAX_GROUP) throw new Error('too many branches at one join');
    Atomics.store(m, g + GH + i, state);
    if (Atomics.sub(m, g + REMAINING, 1) !== 1) return 0;
    return this.merge(g);
  }

  leave(state: number) {
    const m = this.m;
    for (let g = m[state + GROUP]; g !== 0; g = m[g + OUTER]) {
      if (Atomics.sub(m, g + REMAINING, 1) !== 1) return;
      if (Atomics.load(m, g + ARRIVED) > 0) { const merged = this.merge(g); this.spawn(m[g + AFTER], merged); return; }
    }
  }

  merge(g: number): number {
    const m = this.m, n = Atomics.load(m, g + ARRIVED), first = m[g + GH];
    Atomics.sub(m, m[first + ACT] + PENDING, n - 1);
    if (n === 1) { m[first + GROUP] = m[g + OUTER]; return first; }
    const s = this.make_state(m[first + OWNER], m[first + BASE], m[first + REGION], m[first + ACT]);
    const sources = L.alloc(m, m[first + OWNER], 1 + n);
    m[sources] = n;
    for (let i = 0; i < n; i++) m[sources + 1 + i] = m[g + GH + i];
    m[s + SOURCES] = sources; m[s + GROUP] = m[g + OUTER];
    m.fill(UNRESOLVED, s + SH, s + SH + m[m[first + REGION] + Program.N]);
    return s;
  }

  enter(state: number, site: number): number {
    const m = this.m, base = m[state + BASE], process = m[state + OWNER];
    const callee = this.region_of(base, m[site + 1]), ins = m[site + 2], argc = m[site + 3 + ins];
    const act = this.activation(process, state, site), s = this.make_state(process, base, callee, act);
    for (let k = 0; k < argc; k++) this.set(s, k, this.get(state, m[site + 4 + ins + k]));
    m[act + PENDING] = ins;
    for (let i = ins - 1; i >= 1; i--) this.spawn(base + m[callee + Program.ENTRIES + m[site + 3 + i]], this.copy(s));
    this.state = s;
    return base + m[callee + Program.ENTRIES + m[site + 3]];
  }

  exit(state: number, k: number, v: number) {
    const m = this.m, act = m[state + ACT], i = Atomics.add(m, act + LOG, 1);
    if (i >= MAX_LOG) throw new Error('too many exits from one activation');
    m[act + AH + 2 * i] = k; m[act + AH + 2 * i + 1] = v;
    this.end(state);
  }

  end(state: number) {
    this.leave(state);
    const act = this.m[state + ACT];
    if (Atomics.sub(this.m, act + PENDING, 1) === 1) this.collapse(act, this.m[state + GEN]);
  }

  collapse(act: number, generation: number) {
    const m = this.m, parent = m[act + PARENT], site = m[act + SITE], n = m[act + LOG];
    const reached = new Map<number, number[]>();
    for (let i = 0; i < n; i++) { const k = m[act + AH + 2 * i]; (reached.get(k) ?? reached.set(k, []).get(k)!).push(m[act + AH + 2 * i + 1]); }
    if (parent === 0) { this.finished(act, generation, [...reached.values()].flat()); return; }
    const base = m[parent + BASE], ins = m[site + 2], argc = m[site + 3 + ins], outs = m[site + 4 + ins + argc], table = site + 5 + ins + argc;
    const taken = [...reached.keys()].filter(k => k < outs).sort((a, b) => a - b);
    if (taken.length === 0) { this.end(parent); return; }
    Atomics.add(m, m[parent + ACT] + PENDING, taken.length - 1);
    if (m[parent + GROUP] !== 0) Atomics.add(m, m[parent + GROUP] + REMAINING, taken.length - 1);
    taken.forEach((k, i) => {
      const s = i === 0 ? parent : this.copy(parent);
      this.set(s, m[table + 2 * k + 1], this.superpose(m[parent + OWNER], reached.get(k)!));
      this.spawn(base + m[table + 2 * k], s);
    });
  }

  finished(act: number, generation: number, values: number[]) {
    const m = this.m, process = m[act + SITE];
    m[process + L.RESULT] = this.superpose(process, values);
    this.request(L.FINISHED, process, 0, 0, -1, [], generation);
  }

  request(code: number, process: number, pc: number, state: number, dst: number, args: number[], generation = this.m[state + GEN]) {
    const m = this.m, ring = this.ring, tail = m[ring + L.TAIL];
    while (tail - Atomics.load(m, ring + L.HEAD) >= this.layout.ring) Atomics.wait(m, L.SERVE, Atomics.load(m, L.SERVE), 1);
    const at = ring + 2 + (tail % this.layout.ring) * L.REQUEST;
    m[at + L.CODE] = code; m[at + L.PROCESS] = process; m[at + L.PC] = pc; m[at + L.STATE] = state; m[at + L.DST] = dst; m[at + L.ARGC] = args.length; m[at + L.GENERATION_OF] = generation;
    for (let i = 0; i < Math.min(args.length, L.MAX_ARGS); i++) m[at + L.ARGS + i] = args[i];
    Atomics.store(m, ring + L.TAIL, tail + 1);
    Atomics.add(m, L.SERVE, 1);
    Atomics.notify(m, L.SERVE);
  }

  binary(process: number, op: number, a: number, b: number): number {
    const f = (x: number, y: number) => x === NOTHING || y === NOTHING ? NOTHING
      : op === ADD ? x + y : op === SUB ? x - y : op === MUL ? int((x >> 2) * (y >> 2)) : op === LT ? int(x < y ? 1 : 0) : int(x === y ? 1 : 0);
    if (kind(a) !== REF && kind(b) !== REF) return f(a, b);
    const out: number[] = [];
    for (const x of this.components(a)) for (const y of this.components(b)) out.push(f(x, y));
    return this.superpose(process, out);
  }

  run(pc: number, state: number, budget: number): number {
    const m = this.m, process = m[state + OWNER], start = budget;
    const counted = (result: number) => { Atomics.add(m, process + L.STEPS, start - budget + (result === YIELDED ? 0 : 1)); return result; };
    for (; budget > 0; budget--) {
      const base = m[state + BASE];
      switch (m[pc]) {
        case JUMP: pc = base + m[pc + 1]; continue;
        case IF: {
          const c = this.get(state, m[pc + 1]), ways = new Set(this.components(c).map(truthy));
          if (ways.size === 1) { pc = base + m[pc + (ways.has(true) ? 2 : 3)]; continue; }
          pc = this.fork(state, [base + m[pc + 2], base + m[pc + 3]], base + m[pc + 4]);
          continue;
        }
        case FORK: {
          const n = m[pc + 1], targets = Array.from({ length: n }, (_, i) => base + m[pc + 2 + i]);
          pc = this.fork(state, targets, base + m[pc + 2 + n]);
          continue;
        }
        case JOIN: {
          const merged = this.arrive(state);
          if (merged === 0) return counted(GONE);
          state = merged; pc = base + m[pc + 1];
          continue;
        }
        case ENTER: pc = this.enter(state, pc); state = this.state; continue;
        case EXIT: this.exit(state, m[pc + 1], this.get(state, m[pc + 2])); return counted(GONE);
        case SET: this.set(state, m[pc + 1], this.get(state, m[pc + 2])); pc += 3; continue;
        case ADD: case SUB: case MUL: case LT: case EQ:
          this.set(state, m[pc + 1], this.binary(m[state + OWNER], m[pc], this.get(state, m[pc + 2]), this.get(state, m[pc + 3]))); pc += 4; continue;
        case SUPERPOSE: this.set(state, m[pc + 1], this.superpose(m[state + OWNER], [this.get(state, m[pc + 2]), this.get(state, m[pc + 3])])); pc += 4; continue;
        case SYS: {
          const argc = m[pc + 3], args = Array.from({ length: argc }, (_, i) => this.get(state, m[pc + 4 + i]));
          this.request(m[pc + 2], m[state + OWNER], pc + Program.size(m, pc), state, m[pc + 1], args);
          return counted(PARKED);
        }
        case EACH:
          this.request(L.EACH_CALL, m[state + OWNER], pc + 4, state, m[pc + 1], [this.region_of(base, m[pc + 2]), this.get(state, m[pc + 3])]);
          return counted(PARKED);
        default: throw new Error(`not an instruction: ${m[pc]} at ${pc}`);
      }
    }
    this.pc = pc; this.state = state;
    return counted(YIELDED);
  }
}

export namespace Workers {
  export type Report = (process: number, error: string) => void;

  export function work(m: Int32Array, layout: Layout.Plan, id: number, report: Report) {
    const machine = new Machine(m, layout, layout.queues[id], layout.rings[id]), got = new Int32Array(L.CURSOR);
    const others = layout.queues.filter((_, w) => w !== id), epoch = layout.epochs + id;
    for (let count = 0; ; count++) {
      if (Atomics.load(m, L.STOP) !== 0) return;
      const awake = Atomics.load(m, L.WAKE);
      const found = Queue.take(m, layout.queues[id], layout.queue, got) || Queue.steal(m, layout.injection, layout.queue, got) || others.some(q => Queue.steal(m, q, layout.queue, got));
      if (!found) { Atomics.wait(m, L.WAKE, awake, 1000); continue; }
      Atomics.store(m, epoch, (count << 1) | 1);
      cursor(machine, got, layout.queues[id], report);
      Atomics.store(m, epoch, (count + 1) << 1);
    }
  }

  export function pump(machine: Machine, until: number, serve: () => void, report: Report): boolean {
    const { m, layout } = machine, got = new Int32Array(L.CURSOR);
    while (Queue.take(m, machine.queue, layout.queue, got)) {
      cursor(machine, got, machine.queue, report);
      serve();
      if (performance.now() >= until) return true;
    }
    serve();
    return false;
  }

  function cursor(machine: Machine, [pc, state, process, generation]: Int32Array, queue: number, report: Report) {
    const m = machine.m;
    if (m[process + L.STATUS] !== L.RUNNING || m[process + L.GENERATION] !== generation) return;
    try {
      if (machine.run(pc, state, config.memory.quantum) === YIELDED) Queue.add(m, queue, machine.layout.queue, machine.pc, machine.state, process, generation);
    } catch (e) {
      report(process, `${(e as Error).stack ?? e}\n`);
    }
  }
}

export namespace Lanes {
  export const MAX_CELLS = 32, BUDGET = 1 << 20;

  const operations = new Set([JUMP, IF, EXIT, SET, ADD, SUB, MUL, LT, EQ]);

  export function eligible(image: Int32Array, region: number): boolean {
    if (image[region + Program.N] > MAX_CELLS) return false;
    const seen = new Set<number>(), todo = [image[region + Program.ENTRIES]];
    while (todo.length > 0) {
      const pc = todo.pop()!;
      if (seen.has(pc)) continue;
      seen.add(pc);
      const op = image[pc];
      if (!operations.has(op)) return false;
      if (op === JUMP) todo.push(image[pc + 1]);
      else if (op === IF) todo.push(image[pc + 2], image[pc + 3]);
      else if (op !== EXIT) todo.push(pc + Program.size(image, pc));
    }
    return true;
  }

  export function run(image: Int32Array, region: number, inputs: Int32Array): Int32Array {
    const out = new Int32Array(2 * inputs.length), cells = new Int32Array(MAX_CELLS);
    for (let lane = 0; lane < inputs.length; lane++) {
      cells.fill(NOTHING); cells[0] = inputs[lane];
      const get = (o: number) => o < 0 ? image[-o - 1] : cells[o];
      let pc = image[region + Program.ENTRIES];
      out[2 * lane] = -1;
      for (let step = 0; step < BUDGET; step++) {
        const op = image[pc];
        if (op === JUMP) { pc = image[pc + 1]; continue; }
        if (op === IF) { pc = truthy(get(image[pc + 1])) ? image[pc + 2] : image[pc + 3]; continue; }
        if (op === EXIT) { out[2 * lane] = image[pc + 1]; out[2 * lane + 1] = get(image[pc + 2]); break; }
        if (op === SET) { cells[image[pc + 1]] = get(image[pc + 2]); pc += 3; continue; }
        const a = get(image[pc + 2]), b = get(image[pc + 3]);
        cells[image[pc + 1]] = op === ADD ? a + b : op === SUB ? a - b : op === MUL ? int((a >> 2) * (b >> 2)) : op === LT ? int(a < b ? 1 : 0) : int(a === b ? 1 : 0);
        pc += 4;
      }
    }
    return out;
  }

  export const shader = /* wgsl */ `
struct Params { region: i32, lanes: i32, budget: i32, unused: i32 }

@group(0) @binding(0) var<storage, read> image: array<i32>;
@group(0) @binding(1) var<storage, read> inputs: array<i32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<i32>;
@group(0) @binding(3) var<uniform> params: Params;

var<private> cells: array<i32, 32>;

fn operand(o: i32) -> i32 {
  if (o < 0) { return image[-o - 1]; }
  return cells[o];
}

fn truthy(w: i32) -> bool { return w != 0 && w != 2; }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let lane = i32(id.x);
  if (lane >= params.lanes) { return; }
  for (var k = 0; k < 32; k++) { cells[k] = 2; }
  cells[0] = inputs[lane];
  var pc = image[params.region + 3];
  outputs[2 * lane] = -1;
  for (var step = 0; step < params.budget; step++) {
    let op = image[pc];
    switch op {
      case 1: { pc = image[pc + 1]; }
      case 2: { if (truthy(operand(image[pc + 1]))) { pc = image[pc + 2]; } else { pc = image[pc + 3]; } }
      case 6: { outputs[2 * lane] = image[pc + 1]; outputs[2 * lane + 1] = operand(image[pc + 2]); return; }
      case 7: { cells[image[pc + 1]] = operand(image[pc + 2]); pc += 3; }
      case 8: { cells[image[pc + 1]] = operand(image[pc + 2]) + operand(image[pc + 3]); pc += 4; }
      case 9: { cells[image[pc + 1]] = operand(image[pc + 2]) - operand(image[pc + 3]); pc += 4; }
      case 10: { cells[image[pc + 1]] = ((operand(image[pc + 2]) >> 2u) * (operand(image[pc + 3]) >> 2u)) << 2u; pc += 4; }
      case 11: { cells[image[pc + 1]] = select(0, 4, operand(image[pc + 2]) < operand(image[pc + 3])); pc += 4; }
      case 12: { cells[image[pc + 1]] = select(0, 4, operand(image[pc + 2]) == operand(image[pc + 3])); pc += 4; }
      default: { outputs[2 * lane] = -2; return; }
    }
  }
}
`;
}

export class Gpu {
  private images = new Map<Int32Array, any>();

  private constructor(private device: any, private pipeline: any) {}

  static async create(): Promise<Gpu | undefined> {
    const gpu = (globalThis as any).navigator?.gpu;
    const adapter = await gpu?.requestAdapter();
    if (adapter === undefined || adapter === null) return undefined;
    const device = await adapter.requestDevice();
    const module = device.createShaderModule({ code: Lanes.shader });
    const errors = (await module.getCompilationInfo()).messages.filter((m: any) => m.type === 'error');
    if (errors.length > 0) throw new Error('lanes shader: ' + errors.map((m: any) => `${m.lineNum}: ${m.message}`).join('; '));
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    return new Gpu(device, pipeline);
  }

  private buffer(data: Int32Array, usage: number) {
    const b = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage, mappedAtCreation: true });
    new Int32Array(b.getMappedRange()).set(data);
    b.unmap();
    return b;
  }

  async lanes(image: Int32Array, region: number, inputs: Int32Array): Promise<Int32Array> {
    const d = this.device, U = (globalThis as any).GPUBufferUsage;
    let program = this.images.get(image);
    if (program === undefined) this.images.set(image, program = this.buffer(image, U.STORAGE));
    const input = this.buffer(inputs, U.STORAGE);
    const bytes = 8 * inputs.length;
    const output = d.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_SRC });
    const read = d.createBuffer({ size: bytes, usage: U.MAP_READ | U.COPY_DST });
    const params = this.buffer(new Int32Array([region, inputs.length, Lanes.BUDGET, 0]), U.UNIFORM);
    const group = d.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [program, input, output, params].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(inputs.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(output, 0, read, 0, bytes);
    d.queue.submit([encoder.finish()]);
    await read.mapAsync((globalThis as any).GPUMapMode.READ);
    const out = new Int32Array(read.getMappedRange().slice(0));
    read.unmap();
    for (const b of [input, output, read, params]) b.destroy();
    return out;
  }
}

export class Environment {
  readonly m: Int32Array;
  readonly layout: Layout.Plan;
  readonly machine: Machine;
  private readonly bases = new Map<string, { program: Program; base: number }>();
  private readonly running = new Map<number, { project: Project; io: Environment.IO; resolve: (result: Environment.Result) => void; arena: number }>();
  private readonly arenas: number[] = [];
  private readonly retiring: { process: number; arena: number; epochs: number[] }[] = [];
  private readonly threads: Thread[] = [];
  private serving = false;
  private gpu?: Promise<Gpu | undefined>;

  constructor(readonly host: Host) {
    this.m = host.memory(config.memory.words);
    this.layout = Layout.plan({ workers: Math.max(1, host.threads), words: config.memory.words });
    this.m[L.HEAP] = this.layout.heap;
    this.machine = new Machine(this.m, this.layout, this.layout.injection, this.layout.rings[0]);
  }

  private workers(): void {
    while (this.threads.length < this.host.threads) {
      const id = this.threads.length;
      const thread = this.host.spawn({
        message: ({ process, error }) => this.fail(process, error),
        exit: failure => { for (const process of [...this.running.keys()]) this.fail(process, failure || `${NAME}'s worker ${id} exited.\n`); },
      });
      thread.post({ memory: this.m.buffer, layout: this.layout, id });
      this.threads.push(thread);
    }
  }

  load(program: Program): number {
    const known = this.bases.get(program.key);
    if (known !== undefined) return known.base;
    const base = L.heap(this.m, program.image.length);
    this.m.set(program.image, base);
    this.bases.set(program.key, { program, base });
    return base;
  }

  start(program: Program, region: string, project: Project, io: Environment.IO): Promise<Environment.Result> {
    this.release();
    const m = this.m, slot = [...Array(this.layout.processes).keys()].find(i => m[L.process_at(this.layout, i) + L.STATUS] === L.FREE);
    if (slot === undefined) throw new Error('no free process');
    const index = program.regions.get(region);
    if (index === undefined) throw new Error(`no region ${region}`);
    this.workers();
    const base = this.load(program), process = L.process_at(this.layout, slot), arena = this.arenas.pop() ?? L.heap(m, config.memory.arena);
    m[process + L.GENERATION]++;
    m[process + L.STATUS] = L.RUNNING; m[process + L.LIVE] = 0; m[process + L.RESULT] = NOTHING; m[process + L.STEPS] = 0;
    m[process + L.ARENA] = arena; m[process + L.NEXT] = arena; m[process + L.END] = arena + config.memory.arena;
    const at = base + Program.region_at(program.image, index);
    const act = this.machine.activation(process, 0, process), state = this.machine.make_state(process, base, at, act);
    const entries = m[at + Program.E];
    m[act + PENDING] = entries;
    const done = new Promise<Environment.Result>(resolve => this.running.set(process, { project, io, resolve, arena }));
    project.bind(this, process);
    for (let e = 0; e < entries; e++) this.ready(base + m[at + Program.ENTRIES + e], e === 0 ? state : this.machine.copy(state));
    this.serve();
    return done;
  }

  cancel(process: number): void {
    if (!this.running.has(process)) return;
    this.m[process + L.STATUS] = L.CANCELLED;
    this.finish(process, 'cancelled', []);
  }

  private fail(process: number, error: string): void {
    const running = this.running.get(process);
    if (running === undefined) return;
    running.io.err(error);
    this.m[process + L.STATUS] = L.CANCELLED;
    this.finish(process, 'failed', []);
  }

  private finish(process: number, status: Environment.Result['status'], values: number[]): void {
    const running = this.running.get(process);
    if (running === undefined) return;
    const m = this.m, counters = { steps: m[process + L.STEPS], memory: 4 * (m[process + L.NEXT] - m[process + L.ARENA]), cursors: 0 };
    const shown = values.map(v => this.show(v)).join(' | ');
    this.running.delete(process);
    m[process + L.STATUS] = L.DONE;
    this.retiring.push({ process, arena: running.arena, epochs: this.threads.map((_, id) => Atomics.load(m, this.layout.epochs + id)) });
    this.release();
    running.project.unbind(counters);
    running.resolve({ status, values, shown, ...counters });
  }

  private release(): void {
    const m = this.m;
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const { process, arena, epochs } = this.retiring[i];
      const quiet = epochs.every((seen, id) => { const now = Atomics.load(m, this.layout.epochs + id); return now !== seen || (now & 1) === 0; });
      if (!quiet) continue;
      this.retiring.splice(i, 1);
      this.arenas.push(arena);
      m[process + L.STATUS] = L.FREE;
    }
  }

  private ready(pc: number, state: number): void {
    Queue.add(this.m, this.layout.injection, this.layout.queue, pc, state, this.m[state + OWNER], this.m[state + GEN]);
    Atomics.add(this.m, L.WAKE, 1);
    Atomics.notify(this.m, L.WAKE);
  }

  private async serve(): Promise<void> {
    if (this.serving) return;
    this.serving = true;
    const report: Workers.Report = (process, error) => this.fail(process, error);
    while (this.running.size > 0) {
      if (this.host.threads === 0) {
        const busy = Workers.pump(this.machine, performance.now() + config.memory.slice, () => this.answer(), report);
        await new Promise(resolve => setTimeout(resolve, busy ? 0 : 1));
        continue;
      }
      const seen = Atomics.load(this.m, L.SERVE);
      this.answer();
      this.release();
      if (this.running.size > 0) await this.idle(seen);
    }
    this.serving = false;
  }

  private async idle(seen: number): Promise<void> {
    const wait = (Atomics as any).waitAsync;
    const result = wait !== undefined && typeof SharedArrayBuffer !== 'undefined' && this.m.buffer instanceof SharedArrayBuffer ? wait(this.m, L.SERVE, seen, 100) : { async: true, value: undefined };
    if (!result.async) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([result.value, new Promise(resolve => timer = setTimeout(resolve, result.value === undefined ? 1 : 100))]);
    clearTimeout(timer);
  }

  private answer(): void {
    const m = this.m;
    for (const ring of this.layout.rings) {
      for (let head = m[ring + L.HEAD]; head < Atomics.load(m, ring + L.TAIL); head++) {
        const at = ring + 2 + (head % this.layout.ring) * L.REQUEST, code = m[at + L.CODE], process = m[at + L.PROCESS];
        const args = Array.from(m.subarray(at + L.ARGS, at + L.ARGS + m[at + L.ARGC]));
        const pc = m[at + L.PC], state = m[at + L.STATE], dst = m[at + L.DST], current = m[at + L.GENERATION_OF] === m[process + L.GENERATION];
        Atomics.store(m, ring + L.HEAD, head + 1);
        if (!current) continue;
        if (code === L.FINISHED) { if (this.running.has(process)) this.finish(process, 'done', this.machine.components(m[process + L.RESULT])); continue; }
        if (m[process + L.STATUS] !== L.RUNNING) continue;
        if (code === Program.PRINT) { this.running.get(process)?.io.out(this.show(args[0]) + '\n'); this.resume(pc, state, dst, args[0]); continue; }
        if (code === L.EACH_CALL) { this.each(process, m[at + L.GENERATION_OF], pc, state, dst, args[0], args[1]); continue; }
        this.fail(process, `unknown system call ${code}\n`);
      }
    }
  }

  private resume(pc: number, state: number, dst: number, value: number): void {
    if (dst >= 0) this.m[state + SH + dst] = value;
    this.ready(pc, state);
  }

  private async each(process: number, generation: number, pc: number, state: number, dst: number, region: number, value: number): Promise<void> {
    const loaded = [...this.bases.values()].find(({ program, base }) => region >= base && region < base + program.image.length);
    if (loaded === undefined) return this.fail(process, `each: no program holds region ${region}\n`);
    const inputs = Int32Array.from(this.machine.components(value)), at = region - loaded.base;
    if (!Lanes.eligible(loaded.program.image, at)) return this.fail(process, 'each: the region does not run as lanes (calls, forks or system calls)\n');
    const gpu = inputs.length >= config.memory.gpu ? await (this.gpu ??= Gpu.create().catch((): undefined => undefined)) : undefined;
    const out = gpu !== undefined ? await gpu.lanes(loaded.program.image, at, inputs) : Lanes.run(loaded.program.image, at, inputs);
    if (this.m[process + L.STATUS] !== L.RUNNING || this.m[process + L.GENERATION] !== generation) return;
    const values: number[] = [];
    for (let lane = 0; lane < inputs.length; lane++) if (out[2 * lane] >= 0) values.push(out[2 * lane + 1]);
    this.resume(pc, state, dst, this.machine.superpose(process, values));
    this.serve();
  }

  show(v: number): string {
    if (kind(v) === REF) return this.machine.components(v).map(c => this.show(c)).join(' | ');
    if (kind(v) === Word.SPECIAL) return v === NOTHING ? 'nothing' : 'unresolved';
    return String(Word.integer(v));
  }

  stop(): void {
    Atomics.store(this.m, L.STOP, 1);
    Atomics.notify(this.m, L.WAKE);
    for (const thread of this.threads) thread.terminate();
  }
}

export namespace Environment {
  export type IO = { out(text: string): void; err(text: string): void };
  export type Result = { status: 'done' | 'cancelled' | 'failed'; values: number[]; shown: string; steps: number; memory: number; cursors: number };
}

if (env.worker) Daemon.worker(env.port);
else if (env.scope === 'daemon') Browser.serve(env.port);
else if (env.scope === 'shared') Browser.shared();
else if (env.is_main_entrypoint) main();
