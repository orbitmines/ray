// What the host gives the language beside the reader: the platform's `external`s (io, os, time, random, network, where). Host
// configuration, not reading: the kernel only asks the host for a native it does not know. Which OS project a program uses is
// the program's to declare (`@ether/os/linux`, …); nothing is read beside the core undeclared.

export function host_platform(): string {
  const p = (globalThis as any).process;
  return p?.versions?.node !== undefined || (globalThis as any).Deno !== undefined ? p.platform : 'browser';
}

// How the host sees the reader's values: text and elements of an argument, and answers made of text, records, None and true.
export interface Values {
  NONE: number; TRUE: number; UNDEF: number;
  text(v: number): string | undefined;
  elements(v: number): number[];
  answer(text: string): number;
  record(fields: Record<string, number>, text?: string): number;
  located(v: number): string | undefined;
  raw?(v: number): unknown;
}

// A stream is written and read like stdin/stdout; `window` and `dom` are where a UI's frontend reads and writes, by default the
// terminal's (a host showing the UI elsewhere sets its own).
export type Stream = { read?: () => string | undefined; write?: (text: string) => void };
type Node = typeof import('fs');

const binary = (text: string) => [...text].every(c => c.charCodeAt(0) < 256) ? Buffer.from(text, 'latin1') : Buffer.from(text, 'utf8');

export class Runtime {
  streams = new Map<string, Stream>();
  private net?: Network;
  constructor(private v: Values) {
    const fs = node('fs');
    if (fs === undefined) return;
    const stdin: Stream = { read: () => read_fd(fs, 0) }, stdout: Stream = { write: text => { fs.writeSync(1, text); } };
    this.streams.set('stdin', stdin); this.streams.set('stdout', stdout); this.streams.set('stderr', { write: text => { fs.writeSync(2, text); } });
    for (const ui of ['window', 'dom']) this.streams.set(ui, { read: stdin.read, write: stdout.write });
  }

  // Name and arity of each external: arguments are read up to the arity, so `external os property` and `external os `remove` x` are one.
  natives: Record<string, number> = { io: 2, os: 2, time: 0, random: 0, network: 2, where: 1 };

  call(name: string, args: number[]): number {
    const { v } = this;
    switch (name) {
      case 'io': return this.io(args[0], args[1]);
      case 'os': return this.os(v.text(args[0]) ?? '', args[1]);
      case 'time': return this.time();
      case 'random': return node('crypto')!.randomInt(2) === 1 ? v.TRUE : v.NONE;
      case 'network': return this.network(v.text(args[0]) ?? '', args[1]);
      case 'where': { const at = v.located(args[0]); return at === undefined ? v.NONE : v.answer(at); }
    }
    return v.UNDEF;
  }

  // `external io location content`: a stream (stdin, stdout, stderr, window, dom, a connection) or a file; read when content is None.
  private io(at: number, content: number): number {
    const { v } = this, location = v.text(at) ?? '';
    const written = content === v.UNDEF ? undefined : v.text(content);
    if (location === '') return v.NONE;
    const stream = this.streams.get(location);
    if (stream !== undefined) {
      if (written === undefined) { const read = stream.read?.(); return read === undefined ? v.NONE : v.answer(read); }
      stream.write?.(written);
      return v.NONE;
    }
    if (this.net?.has(location)) {
      if (written === undefined) { const read = this.net.ask({ op: 'receive', id: location }); return read.bytes === undefined ? v.NONE : v.answer(Buffer.from(read.bytes).toString('latin1')); }
      this.net.ask({ op: 'send', id: location, bytes: binary(written) });
      return v.NONE;
    }
    const fs = node('fs'), path = node('path');
    if (fs === undefined || path === undefined) return v.NONE;
    if (written === undefined) {
      try { return fs.statSync(location).isDirectory() ? v.answer(fs.readdirSync(location).join('\n')) : v.answer(fs.readFileSync(location, 'utf8')); } catch { return v.NONE; }
    }
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, written);
    return v.NONE;
  }

  // `external os property`, `external os `remove` location`, `external os `open` location`, `external os `icu` (function, arguments)`,
  // `external os `mac_address``.
  private os(key: string, arg: number): number {
    const { v } = this, p = (globalThis as any).process;
    switch (key) {
      case 'remove': { const at = v.text(arg); if (at !== undefined) node('fs')?.rmSync(at, { recursive: true, force: true }); return v.NONE; }
      case 'open': {
        const at = v.text(arg), cp = node('child_process');
        if (at === undefined || cp === undefined) return v.NONE;
        const [command, args] = p.platform === 'win32' ? ['cmd', ['/c', 'start', '""', at]] : [p.platform === 'darwin' ? 'open' : 'xdg-open', [at]];
        try { cp.spawn(command, args, { detached: true, stdio: 'ignore' }).unref(); } catch {}
        return v.NONE;
      }
      case 'icu': { const [fn, rest] = v.elements(arg); return this.icu(v.text(fn) ?? '', rest === undefined ? [] : v.elements(rest)); }
      case 'mac_address': {
        const found = Object.values(node('os')?.networkInterfaces() ?? {}).flat().find(i => i !== undefined && !i.internal && i.mac !== '00:00:00:00:00:00');
        return found === undefined ? v.NONE : v.answer(found.mac);
      }
      case 'platform': return v.answer(host_platform());
      case 'architecture': return p?.arch !== undefined ? v.answer(p.arch) : v.NONE;
    }
    const value = p?.env?.[key];
    return value === undefined ? v.NONE : v.answer(value);
  }

  // The time since 1970 in nanoseconds, with `.resolution`: the nanoseconds two readings can be apart and still read the same.
  private time(): number {
    const perf = globalThis.performance, origin = BigInt(Math.round(perf.timeOrigin * 1000)) * 1000n;
    const ns = origin + BigInt(Math.round(perf.now() * 1e6)), resolution = host_platform() === 'browser' ? 100000 : 1000;
    return this.v.record({ resolution: this.v.answer(String(resolution)) }, String(ns));
  }

  // `external network `tcp` (address, bytes)`: the bytes sent, what came back until the other side stopped; `udp` the first datagram
  // back; `tls` (address, offered): (connection: a stream for `external io`, protocol: what ALPN agreed on); `connected`.
  private network(key: string, arg: number): number {
    const { v } = this;
    if (key === 'connected') return Object.values(node('os')?.networkInterfaces() ?? {}).flat().some(i => i !== undefined && !i.internal) ? v.TRUE : v.NONE;
    if (key !== 'tcp' && key !== 'udp' && key !== 'tls') return v.UNDEF;
    const [address, second] = v.elements(arg), to = v.text(address);
    if (to === undefined || second === undefined) return v.NONE;
    this.net ??= new Network();
    if (key === 'tls') {
      const offered = v.elements(second).map(x => v.text(x)).filter((x): x is string => x !== undefined);
      if ((globalThis as any).process?.env?.RAY_RUNTIME_DEBUG) console.error('tls offered', offered);
      const r = this.net.ask({ op: 'tls', address: to, offered });
      if (r.id === undefined) return v.NONE;
      return v.record({ connection: v.answer(r.id), protocol: r.protocol ? v.answer(r.protocol) : v.NONE });
    }
    const r = this.net.ask({ op: key, address: to, bytes: binary(v.text(second) ?? '') });
    return r.bytes === undefined ? v.NONE : v.answer(Buffer.from(r.bytes).toString('latin1'));
  }

  // ICU's ucal API as far as OS.Windows.ICU calls it, answered by the ICU the host carries (ECMA-402 Intl).
  private calendars = new Map<string, { zone: string; ms: number }>();
  private icu(fn: string, args: number[]): number {
    const { v } = this, t = (k: number) => args[k] === undefined ? undefined : v.text(args[k]);
    const parts = (zone: string, ms: number, style: 'longOffset' | 'short') => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style }).formatToParts(ms).find(p => p.type === 'timeZoneName')?.value ?? '';
    const offset = (zone: string, ms: number) => { const m = parts(zone, ms, 'longOffset').match(/GMT([+-])(\d\d):(\d\d)/); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600000 + Number(m[3]) * 60000) : 0; };
    const standard = (zone: string, ms: number) => Math.min(offset(zone, ms - 182 * 86400000), offset(zone, ms + 182 * 86400000));
    const cal = this.calendars.get(t(0) ?? '');
    switch (fn) {
      case 'ucal_getTimeZoneIDForWindowsID': return v.NONE;
      case 'ucal_open': { try { new Intl.DateTimeFormat('en-US', { timeZone: t(0) }); } catch { return v.NONE; } const id = `ucal:${this.calendars.size + 1}`; this.calendars.set(id, { zone: t(0)!, ms: Date.now() }); return v.answer(id); }
      case 'ucal_setMillis': if (cal) cal.ms = Number(t(1)); return v.NONE;
      case 'ucal_close': this.calendars.delete(t(0) ?? ''); return v.NONE;
      case 'ucal_inDaylightTime': return cal && offset(cal.zone, cal.ms) > standard(cal.zone, cal.ms) ? v.TRUE : v.NONE;
      case 'ucal_get': {
        if (!cal) return v.NONE;
        const std = standard(cal.zone, cal.ms);
        return v.answer(String(t(1) === 'UCAL_ZONE_OFFSET' ? std : t(1) === 'UCAL_DST_OFFSET' ? offset(cal.zone, cal.ms) - std : 0));
      }
      case 'ucal_getTimeZoneDisplayName': return cal ? v.answer(parts(cal.zone, cal.ms, 'short')) : v.NONE;
    }
    return v.UNDEF;
  }
}

type Builtins = { fs: typeof import('fs'); path: typeof import('path'); os: typeof import('os'); crypto: typeof import('crypto'); child_process: typeof import('child_process'); worker_threads: typeof import('worker_threads') };
function node<K extends keyof Builtins>(name: K): Builtins[K] | undefined {
  try { return (globalThis as any).process?.getBuiltinModule?.(name); } catch { return undefined; }
}
function read_fd(fs: Node, fd: number): string | undefined {
  const buffer = Buffer.alloc(1 << 16);
  for (;;) {
    try { const n = fs.readSync(fd, buffer, 0, buffer.length, null); return n === 0 ? undefined : buffer.subarray(0, n).toString('utf8'); }
    catch (e: any) { if (e?.code === 'EAGAIN') { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); continue; } if (e?.code === 'EOF') return undefined; throw e; }
  }
}

// The reader runs to the end of a statement without waiting, so the sockets live in a worker the reader waits on.
type Answer = { bytes?: Uint8Array; id?: string; protocol?: string | false; error?: string };
class Network {
  private worker: import('worker_threads').Worker;
  private ids = new Set<string>();
  private signal = new Int32Array(new SharedArrayBuffer(4));
  constructor() {
    const wt = node('worker_threads')!;
    this.worker = new wt.Worker(WORKER, { eval: true, workerData: { signal: this.signal } });
    this.worker.unref();
  }
  has(id: string) { return this.ids.has(id); }
  ask(message: object): Answer {
    const wt = node('worker_threads')!, { port1, port2 } = new wt.MessageChannel();
    Atomics.store(this.signal, 0, 0);
    this.worker.postMessage({ ...message, port: port2 }, [port2]);
    Atomics.wait(this.signal, 0, 0, 30000);
    const answer: Answer = wt.receiveMessageOnPort(port1)?.message ?? { error: 'timeout' };
    port1.close();
    if (answer.error !== undefined && (globalThis as any).process?.env?.RAY_RUNTIME_DEBUG) console.error('network:', (message as any).op, answer.error);
    if (answer.id !== undefined) this.ids.add(answer.id);
    return answer;
  }
}
const WORKER = `
const { workerData, parentPort } = require('worker_threads'), net = require('net'), tls = require('tls'), dgram = require('dgram');
const signal = workerData.signal, connections = new Map();
let next = 0;
const split = (address) => { const at = address.lastIndexOf(':'); return [address.slice(0, at).replace(/^\\[|\\]$/g, ''), Number(address.slice(at + 1))]; };
const answer = (port, value) => { port.postMessage(value); Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); };
const collect = (socket, port, idle) => {
  const chunks = [];
  let timer = setTimeout(() => socket.destroy(), idle), done = false;
  const finish = (value) => { if (done) return; done = true; clearTimeout(timer); answer(port, value); };
  socket.on('data', (c) => { chunks.push(c); clearTimeout(timer); timer = setTimeout(() => socket.destroy(), idle); });
  socket.on('error', (e) => finish(chunks.length ? { bytes: Buffer.concat(chunks) } : { error: e.message }));
  socket.on('close', () => finish({ bytes: Buffer.concat(chunks) }));
};
parentPort.on('message', (m) => {
  const port = m.port;
  try {
    if (m.op === 'tcp') {
      const [host, p] = split(m.address), socket = net.connect(p, host, () => { socket.write(Buffer.from(m.bytes)); socket.end(); });
      collect(socket, port, 2000);
    } else if (m.op === 'udp') {
      const [host, p] = split(m.address), socket = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4');
      const timer = setTimeout(() => { socket.close(); answer(port, {}); }, 5000);
      socket.on('message', (b) => { clearTimeout(timer); socket.close(); answer(port, { bytes: b }); });
      socket.on('error', (e) => { clearTimeout(timer); socket.close(); answer(port, { error: e.message }); });
      socket.send(Buffer.from(m.bytes), p, host);
    } else if (m.op === 'tls') {
      const [host, p] = split(m.address), id = 'tls:' + (++next), held = { chunks: [], waiting: [], closed: false };
      const socket = tls.connect({ host, port: p, servername: net.isIP(host) ? undefined : host, ALPNProtocols: m.offered, minVersion: 'TLSv1.3', rejectUnauthorized: process.env.RAY_TLS_INSECURE !== '1' }, () => { connections.set(id, held); answer(port, { id, protocol: socket.alpnProtocol }); });
      held.socket = socket;
      const flush = () => { while (held.waiting.length && (held.chunks.length || held.closed)) { const w = held.waiting.shift(); clearTimeout(w.timer); answer(w.port, held.chunks.length ? { bytes: Buffer.concat(held.chunks.splice(0)) } : {}); } };
      socket.on('data', (c) => { held.chunks.push(c); flush(); });
      socket.on('close', () => { held.closed = true; flush(); });
      socket.on('error', (e) => { if (!connections.has(id)) answer(port, { error: e.message }); });
    } else if (m.op === 'send') {
      const held = connections.get(m.id);
      if (!held || held.closed) answer(port, { error: 'closed' }); else held.socket.write(Buffer.from(m.bytes), () => answer(port, {}));
    } else if (m.op === 'receive') {
      const held = connections.get(m.id);
      if (!held) return answer(port, {});
      const w = { port, timer: setTimeout(() => { held.waiting.splice(held.waiting.indexOf(w), 1); answer(port, {}); }, 10000) };
      held.waiting.push(w);
      if (held.chunks.length || held.closed) { const f = held.waiting; while (f.length) { const x = f.shift(); clearTimeout(x.timer); answer(x.port, held.chunks.length ? { bytes: Buffer.concat(held.chunks.splice(0)) } : {}); } }
    } else answer(port, { error: 'unknown ' + m.op });
  } catch (e) { answer(port, { error: String(e && e.message || e) }); }
});
`;
