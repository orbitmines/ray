import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { workspace } from 'vscode';

import type { ServerOptions } from 'vscode-languageclient/node';
import { TransportKind } from 'vscode-languageclient/node';

/**
 * The three ways we can get a Ray language server running, in priority order:
 *
 *   1. `repo`     — VS Code is open inside the orbitmines/ray repo (or a fork:
 *                   anything that ships its own `@ether/$/.ray` definitions and
 *                   `@ether/.ts/src/lsp/index.ts`). Boot the server
 *                   from those workspace sources so the in-tree language
 *                   definition is what powers the editor.
 *   2. `installed`— The host has a `ray` executable on PATH whose `--version`
 *                   parses under Ether's version scheme. Use it.
 *   3. `bundled`  — Fall back to the language bundled with the extension itself:
 *                   its daemon, kernel and library under `server/`.
 */
export type BootMode = 'repo' | 'installed' | 'bundled';

export interface Boot {
  mode: BootMode;
  description: string;
  server: ServerOptions;
}

const RAY_REPO_MARKER = path.join('@ether', '$', '.ray');
const RAY_LSP_ENTRY   = path.join('@ether', '$', '.ray', 'v0.ts', 'src', 'lsp', 'index.ts');
const RAY_DAEMON_ENTRY = path.join('@ether', '$', '.ray', 'v0.ts', 'src', 'kernel4', 'language.ts');

/**
 * Walk up from `start` looking for the marker that identifies a checkout of
 * orbitmines/ray (or a fork). The marker is the language-definition directory
 * itself — present in every fork that hasn't ripped out the language.
 */
function findRayRepoRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, RAY_REPO_MARKER)) && fs.existsSync(path.join(dir, RAY_LSP_ENTRY))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** First workspace folder, or undefined when none is open. */
function workspaceRoot(): string | undefined {
  const folders = workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

/**
 * Spawn pattern for tsx 4.x: `node --import <file:///.../tsx/dist/loader.mjs>
 * <entry>` is the documented way to run a `.ts` entrypoint with tsx's loader
 * hooks. Going through cli.mjs as a script (`node tsx/dist/cli.mjs <entry>`)
 * fails in Node 22+ with `ERR_UNKNOWN_FILE_EXTENSION` because the loader
 * doesn't propagate to the child. Passing the absolute loader URL avoids
 * relying on the spawned process's cwd resolving `tsx` from node_modules.
 */
function nodeImportTsxArgs(tsxDir: string, entry: string): string[] {
  const loader = path.join(tsxDir, 'dist', 'loader.mjs');
  // --import takes a module URL/specifier; absolute paths must be file://.
  return ['--import', `file://${loader}`, entry];
}

/** Resolve `tsx` and the workspace's LSP entry; throws if either is missing. */
function repoBoot(repoRoot: string): Boot {
  const tsxPkg = require.resolve('tsx/package.json', { paths: [path.join(repoRoot, '@ether', '$', '.ray', 'v0.ts'), repoRoot] });
  const tsxDir = path.dirname(tsxPkg);
  const daemon = workspace.getConfiguration('ether').get<string>('server', 'daemon') === 'daemon' && fs.existsSync(path.join(repoRoot, RAY_DAEMON_ENTRY));
  const entry  = path.join(repoRoot, daemon ? RAY_DAEMON_ENTRY : RAY_LSP_ENTRY);

  if (!fs.existsSync(tsxDir)) throw new Error(`tsx not found near ${repoRoot} — run \`npm install\` in @ether/$/.ray/v0.ts.`);
  if (!fs.existsSync(entry))  throw new Error(`Language server entry not found at ${entry}.`);

  // In repo mode the LSP source is being actively edited — point tsx's
  // disk cache at /dev/null so a cached compile from minutes ago can't
  // shadow today's source after a window reload.
  const repoEnv = { ...process.env, TSX_CACHE_DIRECTORY: '/dev/null' };
  const run = {
    command: process.execPath,
    args: [...nodeImportTsxArgs(tsxDir, entry), ...(daemon ? ['--lsp'] : [])],
    transport: TransportKind.stdio,
    options: { cwd: repoRoot, env: repoEnv },
  };
  return {
    mode: 'repo',
    description: daemon ? `repo (${repoRoot}), served by the kernel4 daemon` : `repo (${repoRoot})`,
    server: { run, debug: { ...run, options: { ...run.options, env: { ...repoEnv, DEBUG: '1' } } } },
  };
}

/**
 * If `ray` is on PATH and its `--version` parses under any registered scheme,
 * return a boot config that spawns `ray --lsp`. The ray executable bundles the
 * language server; `--lsp` is the option that flips it into LSP mode over
 * stdio. It is only used when its `--help` lists `--lsp`.
 */
function installedBoot(): Boot | null {
  let bin: string;
  try {
    bin = cp.execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ray'], {
      encoding: 'utf-8',
    }).split(/\r?\n/)[0].trim();
  } catch { return null; }
  if (!bin) return null;

  let raw: string;
  try {
    raw = cp.execFileSync(bin, ['--version'], { encoding: 'utf-8' }).trim();
  } catch { return null; }

  // `ray --version` may print "ray 0.E2026.0D.0" — pick the first whitespace-
  // separated token in Ether's version scheme.
  const version = raw.split(/\s+/).find(t => /^\d+\.E\d{4}\.\d+[A-L]\.\d+$/.test(t));
  if (!version) return null;

  let help: string;
  try {
    help = cp.execFileSync(bin, ['--help'], { encoding: 'utf-8' });
  } catch { return null; }
  if (!/--lsp\b/.test(help)) return null;

  const run = {
    command: bin,
    args: ['--lsp'],
    transport: TransportKind.stdio,
  };
  return {
    mode: 'installed',
    description: `installed ray ${version} (${bin})`,
    server: { run, debug: run },
  };
}

/**
 * Node 22 or later to run the bundled server with: a `node` on PATH when it is new enough, otherwise VS Code's own
 * runtime (run as plain Node).
 */
function nodeRuntime(): { command: string, env: NodeJS.ProcessEnv } {
  try {
    const version = cp.execFileSync('node', ['--version'], { encoding: 'utf-8' }).trim();
    if (Number(version.replace(/^v/, '').split('.')[0]) >= 22) return { command: 'node', env: {} };
  } catch { /* no node on PATH */ }
  return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

/**
 * Last-resort: the language shipped inside the extension — the daemon bundled as `server/language.mjs`, its
 * kernel (`server/.kernel.ray`) and the library (`server/v0`), given to it as RAY_LIBRARY.
 */
function bundledBoot(extensionPath: string): Boot {
  const entry = path.join(extensionPath, 'server', 'language.mjs');
  const library = path.join(extensionPath, 'server', 'v0');
  if (!fs.existsSync(entry)) throw new Error(`Bundled Ray daemon not found at ${entry}`);

  const runtime = nodeRuntime();
  const env = { ...process.env, ...runtime.env, RAY_LIBRARY: library };
  const run = {
    command: runtime.command,
    args: [entry, '--lsp'],
    transport: TransportKind.stdio,
    options: { cwd: path.dirname(entry), env },
  };
  return {
    mode: 'bundled',
    description: `bundled language (${path.join(extensionPath, 'server')}), served by its daemon`,
    server: { run, debug: { ...run, options: { ...run.options, env: { ...env, DEBUG: '1' } } } },
  };
}

/**
 * Resolve the highest-priority Boot available given the current workspace and
 * environment. Throws only if every mode fails.
 */
export function resolveBoot(extensionPath: string): Boot {
  const ws = workspaceRoot();
  if (ws) {
    const repoRoot = findRayRepoRoot(ws);
    if (repoRoot) return repoBoot(repoRoot);
  }
  const installed = installedBoot();
  if (installed) return installed;
  return bundledBoot(extensionPath);
}
