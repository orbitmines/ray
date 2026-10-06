import * as fs from 'fs';
import * as path from 'path';
import { reading_order } from './host.ts';
import { os_project } from './runtime.ts';

// What is read before a file, as the host lays it out (not the reader): the core (`@ether/ray`, its entrypoint first), the project of
// the platform's operating system, then the projects a file's project declares
// in its `.project.ray` (`@ether/<path>` a project of Ether, `@<name>` a language project at `@ether/$/<name>`), each after those it
// declares, then the file's own project, then the file.

export const LIBRARY = process.env.RAY_LIBRARY ? path.resolve(process.env.RAY_LIBRARY) : path.resolve(import.meta.dirname, '../../../ray');
export const ENTRYPOINT = path.join(LIBRARY, '.entrypoint.ray');
export const ETHER = path.dirname(LIBRARY);
const REPOSITORY = path.dirname(ETHER);

export type Group = { project: string; files: string[] };

// A dependency line as a directory: `@ether/…` under the repository, `@name` a language project; anything else (URLs, versions of
// projects not here) is not a directory here.
export function dependency_dir(line: string): string | undefined {
  const m = line.trim().match(/^@(\S+)/);
  if (m === undefined || m === null) return undefined;
  const name = m[1];
  if (name.includes('://')) return undefined;
  const candidates = name.includes('/') ? [path.join(REPOSITORY, '@' + name)] : [path.join(ETHER, '$', name), path.join(REPOSITORY, '@' + name)];
  return candidates.find(dir => fs.existsSync(path.join(dir, '.project.ray')));
}
export function declared(dir: string): { dirs: string[]; missing: string[] } {
  let text = '';
  try { text = fs.readFileSync(path.join(dir, '.project.ray'), 'utf8'); } catch { return { dirs: [], missing: [] }; }
  const dirs: string[] = [], missing: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('@')) continue;
    const at = dependency_dir(line);
    if (at === undefined) missing.push(line.trim()); else dirs.push(at);
  }
  return { dirs, missing };
}
// The project a file is in: the nearest directory above it with a `.project.ray`.
export function project_of(file: string): string | undefined {
  for (let dir = path.dirname(path.resolve(file)); dir.startsWith(REPOSITORY) && dir !== REPOSITORY; dir = path.dirname(dir))
    if (fs.existsSync(path.join(dir, '.project.ray'))) return dir;
  return undefined;
}
// A project's files in reading order: its `.ray` files, and those of directories under it that are no project of their own.
export function project_files(dir: string, top_only = false): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) { if (!top_only && !entry.name.startsWith('.') && !fs.existsSync(path.join(full, '.project.ray'))) walk(full); continue; }
      if (entry.name.endsWith('.ray') && !entry.name.startsWith('.') && !entry.name.startsWith('entrypoint.')) out.push(full);
    }
  };
  walk(dir);
  return reading_order(out.map(f => ({ path: f, text: fs.readFileSync(f, 'utf8') })));
}
const os_dir = (platform?: string) => { const p = os_project(platform); return p === undefined ? undefined : path.join(REPOSITORY, p); };

// Read before anything else: the core, the operating system's project, and (for whoever serves Ether, the language server) Ether's own
// files; a file of another project reads Ether's only when its project declares `@ether` or is Ether.
export function core(platform?: string, ether = true): Group[] {
  const groups: Group[] = [{ project: LIBRARY, files: project_files(LIBRARY, true) }];
  const os = os_dir(platform);
  if (os !== undefined && fs.existsSync(os)) groups.push({ project: os, files: project_files(os) });
  if (ether && fs.existsSync(path.join(ETHER, '.project.ray')) && ETHER !== LIBRARY) groups.push({ project: ETHER, files: project_files(ETHER, true) });
  return groups;
}
// The projects a project declares, each after the ones it declares (each once), not counting what the core already reads.
export function closure(dir: string, skip: Set<string>, missing: string[] = []): Group[] {
  const out: Group[] = [], seen = new Set(skip);
  const visit = (at: string, own: boolean) => {
    if (seen.has(at)) return;
    seen.add(at);
    const d = declared(at);
    missing.push(...d.missing.map(m => `${path.relative(REPOSITORY, at)}: ${m}`));
    for (const dep of d.dirs) visit(dep, false);
    if (!own) out.push({ project: at, files: project_files(at, at === ETHER) });
  };
  visit(dir, true);
  return out;
}
// Everything read before a file, in order: the file's own project last, without the file — and without the other files of a project
// of tests (each test file is a program of its own). `also` are dependency lines read as if the file's project declared them.
export function plan(file: string, platform?: string, also: string[] = []): { groups: Group[]; missing: string[] } {
  const project = project_of(file), groups = core(platform, project === ETHER), missing: string[] = [];
  const skip = new Set(groups.map(g => g.project));
  for (const line of also) {
    const dir = dependency_dir(line);
    if (dir === undefined) { missing.push(`--with: ${line}`); continue; }
    const more = closure(dir, skip, missing);
    if (!skip.has(dir)) more.push({ project: dir, files: project_files(dir, dir === ETHER) });
    for (const g of more) { groups.push(g); skip.add(g.project); }
  }
  if (project !== undefined && !skip.has(project)) {
    groups.push(...closure(project, skip, missing));
    const tests = path.relative(ETHER, project).split(path.sep).includes('tests');
    if (!tests) groups.push({ project, files: project_files(project, project === ETHER).filter(f => f !== path.resolve(file)) });
  }
  return { groups, missing };
}
