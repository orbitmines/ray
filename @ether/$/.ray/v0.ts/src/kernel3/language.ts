import { sources } from '../bundled.ts';

export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const ROOT = ['@ether', '$', '.ray']
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 4];

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
  process.exitCode = await run(new Project(), [args, kwargs], {
    out: text => drained(process.stdout, process.stdout.write(text)),
    err: text => drained(process.stderr, process.stderr.write(text)),
  });
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

export async function run(program: Project, [args, kwargs]: CLI.Args, io: IO): Promise<number> {
  const diagnostics = new Diagnostics();
  await Ray.v0(diagnostics).abstract(!!kwargs.abstract).add(args.flatMap(x => program.at(x))).exec()

  await diagnostics.print(io);
  return diagnostics.has_errors ? 1 : 0;
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
  private readonly spare = new Map<Thread, ReturnType<typeof setTimeout>>();
  private readonly dead = new WeakSet<Thread>();
  private running = 0;
  private ticker?: ReturnType<typeof setInterval>;

  constructor(readonly host: Host, private readonly events: { busy?(): void; idle?(): void } = {}) {
    host.store.recover();
    host.store.retain();
  }

  get active(): boolean { return this.running > 0 || this.waiting.length > 0; }

  private store(meta: Daemon.Meta): Store { return meta.ephemeral ? this.ephemeral : this.host.store; }
  private live(): Daemon.Meta[] { return [...this.jobs.values()].filter(job => !job.meta.ephemeral).map(job => job.meta); }

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

  list(): Daemon.Meta[] { return [...this.host.store.all(), ...this.ephemeral.all()]; }

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
    if (job.thread !== undefined) {
      this.running--;
      const thread = job.thread;
      if (!this.dead.has(thread)) this.spare.set(thread, setTimeout(() => { this.spare.delete(thread); thread.terminate(); }, config.daemon.worker_idle));
    }
    this.host.store.retain(this.live());
    this.schedule();
    if (!this.active) this.events.idle?.();
  }

  private spawn(): Thread {
    let thread: Thread;
    thread = this.host.spawn({
      message: (message: Daemon.Message) => {
        const job = this.jobs.get(message.job);
        if (job === undefined) return;
        if ('exit' in message) return this.finish(job, message.exit);
        this.output(job, message.type, message.data).then(() => thread.post({ ack: message.ack }));
      },
      exit: failure => {
        this.dead.add(thread);
        clearTimeout(this.spare.get(thread));
        this.spare.delete(thread);
        for (const job of this.jobs.values()) if (job.thread === thread && job.meta.exit === undefined) {
          this.output(job, Daemon.Frame.ERR, failure || `${NAME}'s worker for job ${job.meta.id} exited.\n`);
          this.finish(job, 1);
        }
      },
    });
    return thread;
  }

  private acquire(): Thread {
    for (const [thread, expiry] of this.spare) { clearTimeout(expiry); this.spare.delete(thread); return thread; }
    return this.spawn();
  }

  private schedule(): void {
    while (this.running < Math.max(1, this.host.threads) && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      if (job.project.stopped || this.store(job.meta).stopping(job.meta.id)) { job.project.stop(); this.finish(job, 130); continue; }
      this.running++;
      job.meta.began = Date.now();
      this.store(job.meta).save(job.meta);
      job.thread = this.acquire();
      job.thread.post({ job: job.meta.id, request: job.request, shared: job.project.shared });
    }
    if (this.jobs.size > 0) this.ticker ??= setInterval(() => {
      if (this.jobs.size === 0) { clearInterval(this.ticker); this.ticker = undefined; return; }
      for (const job of this.jobs.values()) this.flush(job);
    }, config.jobs.flush);
  }
}

export namespace Jobs {
  export type Send = (type: Daemon.Frame, payload?: string | Uint8Array) => Promise<void>;
  export type Job = { meta: Daemon.Meta; request: Daemon.Run; project: Project; log: Log; thread?: Thread; owner?: Send; viewers: Set<Send> };

  const encoder = new TextEncoder(), decoder = new TextDecoder();
  export function bytes(data: string | Uint8Array): Uint8Array { return typeof data === 'string' ? encoder.encode(data) : data; }
  export function text(data: Uint8Array): string { return decoder.decode(data); }
}

export interface Port { post(message: unknown): void; listen(handler: (message: any) => void): void; }
export interface Thread { post(message: unknown): void; terminate(): void; }
export interface Listener { message(message: Daemon.Message): void; exit(failure: string): void; }

export interface Host {
  readonly pid: number;
  readonly threads: number;
  readonly store: Store;
  spawn(listener: Listener): Thread;
}

export namespace Host {
  export function node(): Host {
    return {
      pid: process.pid,
      threads: env.os.availableParallelism?.() ?? env.os.cpus().length,
      store: new Disk(),
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
      spawn(listener) {
        if (!isolated) return local(listener);
        const worker = new Worker(import.meta.url, { type: 'module', name: `${NAME} worker` });
        worker.onmessage = event => listener.message(event.data);
        worker.onerror = event => { event.preventDefault(); worker.terminate(); listener.exit(`${event.message}\n`); };
        return { post: message => worker.postMessage(message), terminate: () => worker.terminate() };
      },
    };
  }

  export function local(listener: Listener): Thread {
    let handler: ((message: any) => void) | undefined;
    Daemon.worker({ post: message => queueMicrotask(() => listener.message(message as Daemon.Message)), listen: listen => { handler = listen; } });
    return { post: message => queueMicrotask(() => handler?.(message)), terminate: () => {} };
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
  export type Message = { job: number; type: Frame.OUT | Frame.ERR; data: string | Uint8Array; ack: number } | { job: number; exit: number };
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
    const waiting = new Map<number, () => void>();
    let acks = 0;
    const post = (job: number, type: Frame.OUT | Frame.ERR, data: string | Uint8Array) => new Promise<void>(resolve => {
      const ack = ++acks;
      waiting.set(ack, resolve);
      port.post({ job, type, data, ack } satisfies Message);
    });
    port.listen(async (message: { ack: number } | { job: number; request: Run; shared: ArrayBufferLike }) => {
      if ('ack' in message) { waiting.get(message.ack)?.(); waiting.delete(message.ack); return; }
      const { job, request, shared } = message;
      let exit = 1;
      try {
        exit = await run(new Project(request.cwd, request.variables, shared), request.argv, { out: data => post(job, Frame.OUT, data), err: data => post(job, Frame.ERR, data) });
      } catch (e) {
        await post(job, Frame.ERR, `${(e as Error).stack ?? e}\n`);
      }
      port.post({ job, exit } satisfies Message);
    });
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

if (env.worker) Daemon.worker(env.port);
else if (env.scope === 'daemon') Browser.serve(env.port);
else if (env.scope === 'shared') Browser.shared();
else if (env.is_main_entrypoint) main();

enum Op { GOTO,  }

export class Project {
  private _cwd?: string;

  private readonly flags: Int32Array;
  private readonly counters: Float64Array;

  constructor(public readonly from: string = env.nodejs ? process.cwd() : '', public readonly variables: Record<string, string | undefined> = env.nodejs ? { ...process.env } : {}, public readonly shared: ArrayBufferLike = Project.shared()) {
    this.flags = new Int32Array(shared, 0, 1);
    this.counters = new Float64Array(shared, 8, 3);
  }

  static shared(): ArrayBufferLike { return typeof SharedArrayBuffer === 'undefined' ? new ArrayBuffer(32) : new SharedArrayBuffer(32); }

  get stopped(): boolean { return Atomics.load(this.flags, 0) === 1; }
  stop(): void { Atomics.store(this.flags, 0, 1); }

  get steps(): number { return this.counters[0]; }
  set steps(steps: number) { this.counters[0] = steps; }
  get memory(): number { return this.counters[1]; }
  set memory(bytes: number) { this.counters[1] = bytes; }
  get cursors(): number { return this.counters[2]; }
  set cursors(cursors: number) { this.counters[2] = cursors; }

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

export class Program {
  graph: Uint32Array
  
}
