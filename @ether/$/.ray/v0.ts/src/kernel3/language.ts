export const NAME = 'Ether' as const
export const ALIASES = ['ray', 'orbitmines'] as const;
export const ROOT = ['@ether', '$', '.ray']
export const version:
  [major: number, releaseDate: string, index: number] =
  [0, '2027-01-01', 2];

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

  if (!env.nodejs) { await run(new Project(), [args, kwargs], { out: async text => console.log(text), err: async text => console.error(text) }); return; }
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
  const { net, fs, os, worker_threads } = env, pipe = Daemon.pipe(socket), build = env.build;
  if (await Daemon.connect(socket).then(connection => (connection.destroy(), true), () => false))
    throw new Error(`${NAME}'s daemon is already running on '${socket}'.`);
  if (!pipe) fs.rmSync(socket, { force: true });

  process.title = `${NAME.toLowerCase()} --daemon`;
  process.chdir(env.path.parse(process.cwd()).root);
  Daemon.Store.recover();
  Daemon.Store.retain();

  type Worker = import('worker_threads').Worker;
  type Send = (type: Daemon.Frame, payload?: string | Uint8Array) => Promise<void>;
  type Job = { meta: Daemon.Meta; request: Daemon.Run; project: Project; log: Daemon.Log; worker?: Worker; owner?: Send; viewers: Set<Send> };

  const jobs = new Map<number, Job>(), waiting: Job[] = [], spare = new Map<Worker, ReturnType<typeof setTimeout>>(), dead = new WeakSet<Worker>();
  const limit = os.availableParallelism?.() ?? os.cpus().length;
  let running = 0, timer: ReturnType<typeof setTimeout> | undefined, ticker: ReturnType<typeof setInterval> | undefined, retired = false;

  const live = () => [...jobs.values()].map(job => job.meta);
  const active = () => running > 0 || waiting.length > 0;
  const settle = () => { if (retired && !active()) process.exit(0); };
  const idle = () => { clearTimeout(timer); if (!active()) timer = setTimeout(retire, config.daemon.idle); };
  const retire = () => {
    if (retired) return;
    retired = true;
    clearTimeout(timer);
    server.close();
    if (!pipe) fs.rmSync(socket, { force: true });
    settle();
  };

  const flush = (job: Job) => {
    if (Daemon.Store.stopping(job.meta.id)) job.project.stop();
    job.meta.steps = job.project.steps;
    job.meta.memory = job.project.memory;
    job.meta.stopped = job.project.stopped || undefined;
    if (!job.meta.ephemeral) Daemon.Store.save(job.meta);
  };
  const tick = () => {
    if (jobs.size === 0) { clearInterval(ticker); ticker = undefined; return; }
    for (const job of jobs.values()) flush(job);
  };

  const output = (job: Job, type: Daemon.Frame, data: Uint8Array): Promise<void> => {
    if (job.log.write(type, data)) Daemon.Store.retain(live());
    return Promise.all([job.owner, ...job.viewers].map(send => send?.(type, data))).then(() => {});
  };

  const finish = (job: Job, exit: number) => {
    if (job.meta.exit !== undefined) return;
    job.meta.exit = exit;
    job.meta.ended = Date.now();
    job.log.close();
    flush(job);
    for (const send of [job.owner, ...job.viewers]) send?.(Daemon.Frame.EXIT, String(exit));
    jobs.delete(job.meta.id);
    if (job.worker !== undefined) {
      running--;
      const worker = job.worker;
      if (!dead.has(worker)) spare.set(worker, setTimeout(() => { spare.delete(worker); worker.terminate(); }, config.daemon.worker_idle));
    }
    Daemon.Store.retain(live());
    schedule();
    idle();
    settle();
  };

  const spawn = (): Worker => {
    const file = env.url.fileURLToPath(import.meta.url), typescript = (globalThis as any).Deno === undefined && /\.[cm]?ts$/.test(file);
    const worker = new worker_threads.Worker(file, {
      workerData: { daemon: NAME },
      execArgv: typescript ? [...process.execArgv, '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : undefined,
    });
    let failure = '';
    worker.on('message', (message: Daemon.Message) => {
      const job = jobs.get(message.job);
      if (job === undefined) return;
      if ('exit' in message) return finish(job, message.exit);
      output(job, message.type, typeof message.data === 'string' ? Buffer.from(message.data) : message.data).then(() => worker.postMessage({ ack: message.ack }));
    });
    worker.on('error', error => { failure = `${error.stack ?? error}\n`; });
    worker.on('exit', () => {
      dead.add(worker);
      clearTimeout(spare.get(worker));
      spare.delete(worker);
      for (const job of jobs.values()) if (job.worker === worker && job.meta.exit === undefined) {
        output(job, Daemon.Frame.ERR, Buffer.from(failure || `${NAME}'s worker for job ${job.meta.id} exited.\n`));
        finish(job, 1);
      }
    });
    return worker;
  };

  const acquire = (): Worker => {
    for (const [worker, expiry] of spare) { clearTimeout(expiry); spare.delete(worker); return worker; }
    return spawn();
  };

  const schedule = () => {
    while (running < limit && waiting.length > 0) {
      const job = waiting.shift()!;
      if (job.project.stopped || Daemon.Store.stopping(job.meta.id)) { job.project.stop(); finish(job, 130); continue; }
      running++;
      clearTimeout(timer);
      job.meta.began = Date.now();
      if (!job.meta.ephemeral) Daemon.Store.save(job.meta);
      job.worker = acquire();
      job.worker.postMessage({ job: job.meta.id, request: job.request, shared: job.project.shared });
    }
    ticker ??= setInterval(tick, config.jobs.flush);
  };

  const server = net.createServer(connection => {
    const owned = new Set<Job>(), viewing = new Set<Job>();
    const send: Send = (type, payload = '') => connection.destroyed ? Promise.resolve() : drained(connection, Daemon.write(connection, type, payload));
    connection.on('error', () => {}).on('close', () => {
      for (const job of owned) if (job.meta.exit === undefined) { job.owner = undefined; job.project.stop(); }
      for (const job of viewing) job.viewers.delete(send);
    }).on('data', Daemon.frames((type, payload) => {
      if (type !== Daemon.Frame.REQUEST) return;
      const request: Daemon.Request = JSON.parse(payload.toString());
      if (request.kind === 'ephemeral') {
        send(Daemon.Frame.OUT, JSON.stringify([...jobs.values()].filter(job => job.meta.ephemeral).map(job => job.meta)));
        return void send(Daemon.Frame.EXIT, '0');
      }
      if (request.kind === 'stop') {
        const job = jobs.get(request.job);
        if (job === undefined || !job.meta.ephemeral) return void send(Daemon.Frame.EXIT, '1');
        job.project.stop();
        return void send(Daemon.Frame.EXIT, '0');
      }
      if (retired || request.build !== build) { send(Daemon.Frame.STALE); return retire(); }
      const meta = Daemon.Store.create(request.command, request.cwd, request.ephemeral);
      const job: Job = { meta, request, project: new Project(request.cwd, request.variables), log: new Daemon.Log(meta), viewers: new Set() };
      jobs.set(meta.id, job);
      if (request.detached && request.attach && request.ephemeral) { send(Daemon.Frame.ACCEPTED, String(meta.id)); viewing.add(job); job.viewers.add(send); }
      else if (request.detached) send(Daemon.Frame.ACCEPTED, String(meta.id)).then(() => connection.end());
      else { owned.add(job); job.owner = send; }
      waiting.push(job);
      schedule();
    }));
  });
  server.listen(socket, idle);
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

  export namespace Store {
    export function root(): string {
      const root = env.path.join(env.cache, NAME.toLowerCase(), 'jobs');
      env.fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      return root;
    }
    export function directory(id: number): string { return env.path.join(root(), String(id)); }
    export function segment(id: number, index: number): string { return env.path.join(directory(id), `${String(index).padStart(4, '0')}.log`); }

    export function create(command: string[], cwd: string, ephemeral: boolean): Meta {
      const { fs, path } = env, counter = path.join(root(), 'next');
      let id = Math.max(Number(fs.readFileSync(counter, { encoding: 'utf8', flag: 'a+' })) || 1, ...ids().map(id => id + 1));
      fs.writeFileSync(counter, String(id + 1));
      const meta: Meta = { id, command, cwd, daemon: process.pid, created: Date.now(), steps: 0, memory: 0, written: 0, size: 0, first: 1, last: 1, ephemeral: ephemeral || undefined };
      if (ephemeral) return meta;
      fs.mkdirSync(directory(id), { mode: 0o700 });
      save(meta);
      return meta;
    }

    export function ids(): number[] {
      return env.fs.readdirSync(root()).filter(name => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b);
    }
    export function read(id: number): Meta | undefined {
      try { return JSON.parse(env.fs.readFileSync(env.path.join(directory(id), 'job.json'), 'utf8')); } catch { return undefined; }
    }
    export function all(): Meta[] { return ids().map(read).filter((meta): meta is Meta => meta !== undefined); }
    export function save(meta: Meta): void {
      const file = env.path.join(directory(meta.id), 'job.json');
      try { env.fs.writeFileSync(file + '.tmp', JSON.stringify(meta)); env.fs.renameSync(file + '.tmp', file); } catch {}
    }
    export function remove(id: number): void { env.fs.rmSync(directory(id), { recursive: true, force: true }); }
    export function stopping(id: number): boolean { return env.fs.existsSync(env.path.join(directory(id), 'stop')); }

    export function alive(pid: number): boolean {
      try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
    }
    export function state(meta: Meta): State {
      if (meta.ended !== undefined) return meta.lost ? 'lost' : meta.stopped ? 'stopped' : 'done';
      if (!alive(meta.daemon)) return 'lost';
      if (meta.stopped || stopping(meta.id)) return 'stopping';
      return meta.began === undefined ? 'queued' : 'running';
    }
    export function active(meta: Meta): boolean { return ['queued', 'running', 'stopping'].includes(state(meta)); }

    export function recover(): void {
      for (const meta of all()) if (meta.ended === undefined && !alive(meta.daemon)) { meta.lost = true; meta.ended = Date.now(); save(meta); }
    }

    export function budget(): number {
      try { const stat = env.fs.statfsSync(root()); return Math.min(config.jobs.budget, stat.bavail * stat.bsize * config.jobs.share); } catch { return config.jobs.budget; }
    }

    export function retain(live: Meta[] = []): void {
      const now = Date.now(), metas = new Map(all().map(meta => [meta.id, meta]));
      for (const meta of live) metas.set(meta.id, meta);
      const drop = (meta: Meta) => { remove(meta.id); metas.delete(meta.id); };
      const finished = () => [...metas.values()].filter(meta => meta.ended !== undefined).sort((a, b) => a.ended! - b.ended!);

      for (const meta of finished()) if (now - meta.ended! > config.jobs.retention) drop(meta);
      const kept = finished();
      for (const meta of kept.slice(0, Math.max(0, kept.length - config.jobs.keep))) drop(meta);

      const limit = budget();
      let total = [...metas.values()].reduce((sum, meta) => sum + meta.size, 0);
      for (const meta of finished()) { if (total <= limit) break; total -= meta.size; drop(meta); }
      while (total > limit) {
        const largest = live.filter(meta => metas.has(meta.id) && meta.first < meta.last).sort((a, b) => b.size - a.size)[0];
        if (largest === undefined) break;
        const file = segment(largest.id, largest.first);
        let size = 0;
        try { size = env.fs.statSync(file).size; env.fs.unlinkSync(file); } catch {}
        largest.first++;
        largest.size -= size;
        total -= size;
        save(largest);
      }
    }
  }

  export class Log {
    private fd: number;
    private bytes = 0;

    constructor(private readonly meta: Meta) { this.fd = meta.ephemeral ? -1 : this.open(); }

    private open(): number { return env.fs.openSync(Store.segment(this.meta.id, this.meta.last), 'a', 0o600); }

    write(type: Frame, data: Uint8Array): boolean {
      this.meta.written += data.length;
      if (this.meta.ephemeral) return false;
      let rotated = false;
      for (let at = 0; at === 0 || at < data.length; at += config.frame) {
        const piece = data.subarray(at, at + config.frame);
        if (this.bytes >= config.jobs.segment) {
          env.fs.closeSync(this.fd);
          this.meta.last++;
          this.fd = this.open();
          this.bytes = 0;
          rotated = true;
        }
        const frame = Buffer.concat([header(type, piece.length), piece]);
        env.fs.writeSync(this.fd, frame);
        this.bytes += frame.length;
        this.meta.size += frame.length;
      }
      return rotated;
    }

    close(): void { if (!this.meta.ephemeral) env.fs.closeSync(this.fd); }
  }

  export function worker(): void {
    const port = env.worker_threads.parentPort!, waiting = new Map<number, () => void>();
    let acks = 0;
    const post = (job: number, type: Frame.OUT | Frame.ERR, data: string | Uint8Array) => new Promise<void>(resolve => {
      const ack = ++acks;
      waiting.set(ack, resolve);
      port.postMessage({ job, type, data, ack } satisfies Message);
    });
    port.on('message', async (message: { ack: number } | { job: number; request: Run; shared: ArrayBufferLike }) => {
      if ('ack' in message) { waiting.get(message.ack)?.(); waiting.delete(message.ack); return; }
      const { job, request, shared } = message;
      let exit = 1;
      try {
        exit = await run(new Project(request.cwd, request.variables, shared), request.argv, { out: data => post(job, Frame.OUT, data), err: data => post(job, Frame.ERR, data) });
      } catch (e) {
        await post(job, Frame.ERR, `${(e as Error).stack ?? e}\n`);
      }
      port.postMessage({ job, exit } satisfies Message);
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
    const now = Date.now(), metas = [...Store.all(), ...await ephemeral(socket)].map(meta => ({ meta, state: Store.state(meta) }));
    const rank = (state: State) => ['running', 'stopping', 'queued'].includes(state) ? 0 : 1;
    metas.sort((a, b) => rank(a.state) - rank(b.state) || a.meta.id - b.meta.id);
    return table(metas.map(({ meta, state }) => [
      String(meta.id), state, clock(meta.created), meta.began === undefined ? '-' : duration((meta.ended ?? now) - meta.began),
      count(meta.steps), bytes(meta.memory), bytes(meta.written), meta.exit === undefined ? '-' : String(meta.exit),
      home(meta.cwd), meta.command.join(' '),
    ]));
  }

  export async function stop(id: number, socket: string): Promise<number> {
    const meta = Store.read(id);
    if (meta === undefined) {
      if ((await query(socket, { kind: 'stop', job: id }))?.exit === 0) return 0;
      process.stderr.write(`There is no job ${id}; see --list.\n`);
      return 1;
    }
    if (!Store.active(meta)) { process.stderr.write(`Job ${id} has already ended.\n`); return 1; }
    env.fs.writeFileSync(env.path.join(Store.directory(id), 'stop'), '');
    return 0;
  }

  export function remove(id?: number): number {
    if (id === undefined) {
      for (const meta of Store.all()) if (!Store.active(meta)) Store.remove(meta.id);
      return 0;
    }
    const meta = Store.read(id);
    if (meta === undefined) { process.stderr.write(`There is no job ${id}; see --list.\n`); return 1; }
    if (Store.active(meta)) { process.stderr.write(`Job ${id} is still ${Store.state(meta)}; --stop it first.\n`); return 1; }
    Store.remove(id);
    return 0;
  }

  export async function attach(id: number | undefined, socket: string): Promise<number> {
    const { fs } = env, hidden = await ephemeral(socket);
    id ??= Math.max(-1, ...Store.ids(), ...hidden.map(meta => meta.id));
    if (hidden.some(meta => meta.id === id)) { process.stderr.write(`Job ${id} is ephemeral: its output is only streamed to the client that started it.\n`); return 1; }
    let meta = Store.read(id);
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
        try { fd = fs.openSync(Store.segment(id, index), 'r'); }
        catch {
          meta = Store.read(id) ?? meta;
          if (index < meta.first) { skipped(); index = meta.first; position = 0; continue; }
          if (!Store.active(meta)) break;
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
      const latest = Store.read(id) ?? meta;
      if (index < latest.last) { fs.closeSync(fd); fd = undefined; index++; position = 0; continue; }
      if (!Store.active(latest) && fs.readSync(fd, buffer, 0, 1, position) === 0) { meta = latest; break; }
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

  function header(type: Frame, length: number): Buffer {
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

  static get worker(): boolean { return env.nodejs && !env.worker_threads.isMainThread && env.worker_threads.workerData?.daemon === NAME; }

  private static _manifest?: string[];
  static get manifest(): string[] {
    if (env._manifest) return env._manifest;
    try { 
      const manifest_file = './bundled.ts';
      const manifest = env.import<{ manifest: string[] }>(manifest_file).manifest; 
      if (!manifest.length) throw new Error(`Couldn't find any entries in the manifest (a file in '${manifest_file}'), this is an error on the side of the developer or you didn't create a bundle, see the original repository for how that is done.`);
      return env._manifest = manifest;
    }
    catch { return env._manifest = []; }
  }

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

if (env.worker) Daemon.worker();
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
