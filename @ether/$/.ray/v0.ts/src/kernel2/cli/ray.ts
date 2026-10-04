// `ray program.k2 [integer arguments…]`: runs a program in the daemon (started when it is not running yet), shows what
// it prints, then what it answered. `ray --status`, `ray --stop`.

import { connect, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { SOCKET, lines, type Reply } from './protocol.ts';
import { daemon_command } from './host.ts';

const open = () => new Promise<Socket>((ok, fail) => { const s = connect(SOCKET); s.once('connect', () => ok(s)); s.once('error', fail); });

async function daemon(): Promise<Socket> {
  try { return await open(); } catch {}
  const [command, args] = daemon_command();
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 200; i++) { await new Promise(r => setTimeout(r, 25)); try { return await open(); } catch {} }
  throw new Error('rayd did not start');
}

const [first, ...rest] = process.argv.slice(2).filter(a => a !== '--daemon');
if (first === undefined) { console.error('usage: ray <program.k2> [integers…] | --status | --stop'); process.exit(2); }
const socket = await daemon();
let pid = -1;
socket.on('data', lines((reply: Reply) => {
  if ('pid' in reply) pid = reply.pid;
  if ('out' in reply) process.stdout.write(reply.out);
  if ('status' in reply) { console.log(reply.status); process.exit(0); }
  if ('error' in reply) { console.error(reply.error); process.exit(reply.exit); }
  if ('result' in reply) { console.log('=> ' + reply.result); process.exit(reply.exit); }
}));
process.on('SIGINT', () => { if (pid >= 0) socket.write(JSON.stringify({ cancel: pid }) + '\n'); process.exit(130); });
if (first === '--status') socket.write(JSON.stringify({ status: true }) + '\n');
else if (first === '--stop') { socket.write(JSON.stringify({ stop: true }) + '\n'); socket.end(); }
else socket.write(JSON.stringify({ run: resolve(first), args: rest.map(Number) }) + '\n');
