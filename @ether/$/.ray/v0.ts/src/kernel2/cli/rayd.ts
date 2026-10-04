// The daemon: one environment kept warm across invocations of `ray`. Programs are laid out once (by the hash of their
// source); every run is a process in the same environment. Exits after a while without processes.

import { createServer, type Socket } from 'node:net';
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Environment } from '../runtime/environment.ts';
import { host } from './host.ts';
import { assemble } from '../core/assembly.ts';
import { int } from '../core/word.ts';
import { SOCKET, lines, type Request, type Reply } from './protocol.ts';

const IDLE = 10 * 60 * 1000;
process.title = 'ether';
const env = new Environment(await host());
const running = new Map<number, string>();
let timer: ReturnType<typeof setTimeout> | undefined;
const idle = () => { clearTimeout(timer); if (running.size === 0) timer = setTimeout(stop, IDLE); };

function stop() { server.close(); if (process.platform !== 'win32') rmSync(SOCKET, { force: true }); env.stop(); process.exit(0); }

function handle(request: Request, socket: Socket) {
  const send = (reply: Reply) => { if (!socket.destroyed) socket.write(JSON.stringify(reply) + '\n'); };
  if ('stop' in request) return stop();
  if ('status' in request) return send({ status: [...running].map(([pid, file]) => `${pid} ${file}`).join('\n') || 'no processes' });
  if ('cancel' in request) return env.cancel(request.cancel);
  let program;
  try {
    const source = readFileSync(request.run, 'utf8');
    program = env.load(createHash('sha256').update(source).digest('hex'), assemble(source));
  } catch (e) { return send({ error: (e as Error).message, exit: 1 }); }
  const run = env.run(program, 'main', request.args.map(int), { out: out => send({ out }) });
  running.set(run.id, request.run);
  idle();
  send({ pid: run.id });
  socket.on('close', () => env.cancel(run.id));
  run.done.then(values => {
    running.delete(run.id);
    idle();
    send({ result: values.map(v => env.show(v)).join(' | '), exit: 0 });
  });
}

if (process.platform !== 'win32') rmSync(SOCKET, { force: true });
const server = createServer(socket => socket.on('data', lines(r => handle(r, socket))));
server.listen(SOCKET, idle);
