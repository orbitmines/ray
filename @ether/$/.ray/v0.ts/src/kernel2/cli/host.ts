// The host for the runtime this runs on: Deno (and compiled executables) get Web Workers and WebGPU, Node worker_threads.

import type { Host } from '../runtime/environment.ts';

export async function host(): Promise<Host> {
  if (typeof (globalThis as any).Deno !== 'undefined') return (await import('../host/web.ts')).web({ worker: new URL('../runtime/worker.ts', import.meta.url) });
  return (await import('../host/node.ts')).node();
}

// How to start the daemon: the executable itself with `--daemon` when compiled, else the runtime with this entry.
export function daemon_command(): [string, string[]] {
  const deno = (globalThis as any).Deno;
  const entry = new URL('./ether.ts', import.meta.url).pathname;
  if (deno !== undefined) return deno.build && deno.mainModule?.includes('/deno-compile-') ? [deno.execPath(), ['--daemon']] : [deno.execPath(), ['run', '-A', '--no-config', entry, '--daemon']];
  return [process.execPath, [...process.execArgv, entry, '--daemon']];
}
