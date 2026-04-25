import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { workspace } from 'vscode';
import { Version } from '@orbitmines/ray';

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
 *   3. `bundled`  — Fall back to the @orbitmines/ray module bundled with the
 *                   extension itself.
 */
export type BootMode = 'repo' | 'installed' | 'bundled';

export interface Boot {
  mode: BootMode;
  description: string;
  server: ServerOptions;
}

const RAY_REPO_MARKER = path.join('@ether', '$', '.ray');
const RAY_LSP_ENTRY   = path.join('@ether', '.ts', 'src', 'lsp', 'index.ts');

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
  const tsxPkg = require.resolve('tsx/package.json', { paths: [path.join(repoRoot, '@ether', '.ts'), repoRoot] });
  const tsxDir = path.dirname(tsxPkg);
  const entry  = path.join(repoRoot, RAY_LSP_ENTRY);

  if (!fs.existsSync(tsxDir)) throw new Error(`tsx not found near ${repoRoot} — run \`npm install\` in @ether/.ts.`);
  if (!fs.existsSync(entry))  throw new Error(`Language server entry not found at ${entry}.`);

  const run = {
    command: process.execPath,
    args: nodeImportTsxArgs(tsxDir, entry),
    transport: TransportKind.stdio,
    options: { cwd: repoRoot },
  };
  return {
    mode: 'repo',
    description: `repo (${repoRoot})`,
    server: { run, debug: { ...run, options: { ...run.options, env: { ...process.env, DEBUG: '1' } } } },
  };
}

/**
 * If `ray` is on PATH and its `--version` parses under any registered scheme,
 * return a boot config that spawns `ray language-server`. The subcommand name
 * isn't promised by the executable yet — when it lands, this is where it
 * plugs in. We do NOT validate the subcommand exists here; `LanguageClient`
 * will surface a startup error if it doesn't.
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
  // separated token that parses as a Version.
  const version = raw.split(/\s+/).map(t => Version.tryParse(t)).find(v => v !== null) ?? null;
  if (!version) return null;

  const run = {
    command: bin,
    args: ['language-server'],
    transport: TransportKind.stdio,
  };
  return {
    mode: 'installed',
    description: `installed ray ${version.toString()} (${bin})`,
    server: { run, debug: run },
  };
}

/** Last-resort: the @orbitmines/ray module shipped with the extension. */
function bundledBoot(extensionPath: string): Boot {
  const tsxPkg = require.resolve('tsx/package.json', { paths: [extensionPath] });
  const tsxDir = path.dirname(tsxPkg);
  const rayPkg = require.resolve('@orbitmines/ray/package.json', { paths: [extensionPath] });
  const entry  = path.join(path.dirname(rayPkg), 'src', 'lsp', 'index.ts');

  if (!fs.existsSync(tsxDir)) throw new Error(`tsx not found near ${extensionPath}`);
  if (!fs.existsSync(entry))  throw new Error(`Bundled Ray LSP entry not found at ${entry}`);

  const run = {
    command: process.execPath,
    args: nodeImportTsxArgs(tsxDir, entry),
    transport: TransportKind.stdio,
  };
  return {
    mode: 'bundled',
    description: `bundled @orbitmines/ray`,
    server: { run, debug: { ...run, options: { env: { ...process.env, DEBUG: '1' } } } },
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
