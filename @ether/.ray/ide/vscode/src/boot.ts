import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { workspace } from 'vscode';

import type { ServerOptions } from 'vscode-languageclient/node';
import { TransportKind } from 'vscode-languageclient/node';

/**
 * The ways we can get a Ray language server running, in priority order. Both go through the daemon:
 *
 *   1. `installed`— The host has a `ray` executable on PATH whose `--version` parses under Ether's version scheme and
 *                   whose `--help` lists `--lsp`. Use it.
 *   2. `bundled`  — Fall back to the language bundled with the extension itself: its daemon, kernel and library under
 *                   `server/`.
 *
 * When the workspace holds a language definition (a `!language` project, e.g. `@ether/.ray/v0/ray` in a checkout of
 * orbitmines/ray), its directory is given to `--lsp`, and the daemon reads that language instead of its own.
 */
export type BootMode = 'installed' | 'bundled';

export interface Boot {
  mode: BootMode;
  description: string;
  server: ServerOptions;
}

const LANGUAGE_DIRECTORY = path.join('@ether', '.ray', 'v0', 'ray');

function isLanguage(dir: string): boolean {
  try { return fs.readFileSync(path.join(dir, '.project.ray'), 'utf-8').split('\n')[0].includes('!language'); } catch { return false; }
}

/** The language definition the workspace holds: the workspace itself, or `@ether/.ray/v0/ray` in it or above it. */
function findLanguage(start: string): string | null {
  if (isLanguage(start)) return start;
  let dir = start;
  while (true) {
    if (isLanguage(path.join(dir, LANGUAGE_DIRECTORY))) return path.join(dir, LANGUAGE_DIRECTORY);
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
 * If `ray` is on PATH and its `--version` parses under any registered scheme,
 * return a boot config that spawns `ray --lsp`. The ray executable bundles the
 * language server; `--lsp` is the option that flips it into LSP mode over
 * stdio. It is only used when its `--help` lists `--lsp`.
 */
function installedBoot(language: string | null): Boot | null {
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
    args: ['--lsp', ...(language ? [language] : [])],
    transport: TransportKind.stdio,
    options: { cwd: workspaceRoot() },
  };
  return {
    mode: 'installed',
    description: `installed ray ${version} (${bin})${language ? `, reading the language in ${language}` : ''}`,
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
 * kernel (`server/.kernel.ray`) and the library (`server/v0`), whose core (`server/v0/ray`) is given to it as RAY_LIBRARY.
 */
function bundledBoot(extensionPath: string, language: string | null): Boot {
  const entry = path.join(extensionPath, 'server', 'language.mjs');
  const library = path.join(extensionPath, 'server', 'v0', 'ray');
  if (!fs.existsSync(entry)) throw new Error(`Bundled Ray daemon not found at ${entry}`);

  const runtime = nodeRuntime();
  const env = { ...process.env, ...runtime.env, RAY_LIBRARY: library };
  const run = {
    command: runtime.command,
    args: [entry, '--lsp', ...(language ? [language] : [])],
    transport: TransportKind.stdio,
    options: { cwd: workspaceRoot() ?? path.dirname(entry), env },
  };
  return {
    mode: 'bundled',
    description: `bundled language (${path.join(extensionPath, 'server')}), served by its daemon${language ? `, reading the language in ${language}` : ''}`,
    server: { run, debug: { ...run, options: { ...run.options, env: { ...env, DEBUG: '1' } } } },
  };
}

/**
 * Resolve the highest-priority Boot available given the current workspace and
 * environment. Throws only if every mode fails.
 */
export function resolveBoot(extensionPath: string): Boot {
  const ws = workspaceRoot();
  const language = ws ? findLanguage(ws) : null;
  return installedBoot(language) ?? bundledBoot(extensionPath, language);
}
