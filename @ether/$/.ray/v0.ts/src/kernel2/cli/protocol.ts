// What `ray` and `rayd` say to each other: one JSON message per line over a Unix socket.

import { join } from 'node:path';
import { tmpdir } from 'node:os';

// `ether.sock` in the user's runtime directory; Windows has no Unix sockets, but a named pipe works the same way for net.
export const SOCKET = process.platform === 'win32' ? '\\\\.\\pipe\\ether' : join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'ether.sock');

export type Request = { run: string; args: number[] } | { cancel: number } | { status: true } | { stop: true };
export type Reply = { pid: number } | { out: string } | { result: string; exit: number } | { error: string; exit: number } | { status: string };

export function lines(on: (message: any) => void) {
  let buffered = '';
  return (chunk: Buffer | string) => {
    buffered += chunk.toString();
    for (let i = buffered.indexOf('\n'); i >= 0; i = buffered.indexOf('\n')) { const line = buffered.slice(0, i); buffered = buffered.slice(i + 1); if (line !== '') on(JSON.parse(line)); }
  };
}
