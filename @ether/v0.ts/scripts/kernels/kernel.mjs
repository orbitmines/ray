import { build } from 'esbuild';
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const pkg = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const ether = dirname(pkg);
export const repository = dirname(ether);
export const library = join(ether, 'ray');

export const UNABLE = 3;

export function located(name, rel) {
  for (const base of [join(pkg, 'src'), library, pkg]) if (existsSync(join(base, rel))) return join(base, rel);
  return undefined;
}

export function readingOrder(files) {
  const defines = text => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const syntax = text => text.split('\n').filter(line => /^[^A-Za-z\s/].*=>|^[A-Za-z_]+ \{[a-z]/.test(line)).length;
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []), syntax: syntax(f.text) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) {
    const waiting = p => [...needs.get(p)].filter(q => left.has(q)).length;
    const next = [...left].map(p => info.find(f => f.path === p)).sort((a, b) => waiting(a.path) - waiting(b.path) || b.syntax - a.syntax || (a.path < b.path ? -1 : 1))[0];
    order.push(next.path); left.delete(next.path);
  }
  return order;
}

export function libraryFiles() {
  const files = readdirSync(library).filter(f => f.endsWith('.ray') && !f.startsWith('.')).map(f => join(library, f));
  return readingOrder(files.map(f => ({ path: f, text: readFileSync(f, 'utf8') })));
}

function cased(dir) {
  if (existsSync(dir)) return dir;
  const parent = dirname(dir);
  if (parent === dir) return undefined;
  const at = cased(parent);
  if (at === undefined) return undefined;
  let entries = [];
  try { entries = readdirSync(at); } catch { return undefined; }
  const name = basename(dir).toLowerCase(), found = entries.find(e => e.toLowerCase() === name);
  return found === undefined ? undefined : join(at, found);
}

function dependencyDir(line) {
  const m = line.trim().match(/^@(\S+)/);
  if (m === null || m[1].includes('://')) return undefined;
  const name = m[1], candidates = name.includes('/') ? [join(repository, '@' + name)] : [join(ether, '$', name), join(repository, '@' + name)];
  return candidates.map(cased).find(dir => dir !== undefined && existsSync(join(dir, '.project.ray')));
}

function declared(dir) {
  let text = '';
  try { text = readFileSync(join(dir, '.project.ray'), 'utf8'); } catch { return []; }
  return text.split('\n').filter(line => line.trim().startsWith('@')).map(dependencyDir).filter(d => d !== undefined);
}

function projectOf(file) {
  for (let dir = dirname(resolve(file)); dir !== dirname(dir); dir = dirname(dir)) if (existsSync(join(dir, '.project.ray'))) return dir;
  return undefined;
}

function projectFiles(dir) {
  const out = [], topOnly = dir === ether;
  const walk = at => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) { if (!topOnly && !entry.name.startsWith('.') && entry.name !== 'node_modules' && !existsSync(join(full, '.project.ray'))) walk(full); continue; }
      if (entry.name.endsWith('.ray') && !entry.name.startsWith('.') && !entry.name.startsWith('entrypoint.')) out.push(full);
    }
  };
  walk(dir);
  return readingOrder(out.map(f => ({ path: f, text: readFileSync(f, 'utf8') })));
}

export function projectsBefore(file) {
  file = resolve(file);
  const project = projectOf(file);
  if (project === undefined || project === library) return [];
  const order = [], seen = new Set();
  const visit = dir => { if (seen.has(dir) || dir === library) return; seen.add(dir); for (const dep of declared(dir)) visit(dep); order.push(dir); };
  for (const dep of declared(project)) visit(dep);
  const projects = order.map(dir => ({ dir, files: projectFiles(dir) }));
  const tests = relative(ether, project).split(sep).includes('tests');
  if (!tests) projects.push({ dir: project, files: projectFiles(project).filter(f => f !== file) });
  return projects;
}

export function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

async function bundled(name, modules) {
  const entry = Object.entries(modules).map(([alias, rel]) => {
    const at = located(name, rel);
    if (at === undefined) throw new Error(`${name}: ${rel} is in none of src/, the library and v0.ts/`);
    return `export * as ${alias} from ${JSON.stringify(at)};`;
  }).join('\n');
  const dir = mkdtempSync(join(tmpdir(), `ray-${name}-`)), outfile = join(dir, `${name}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: pkg, loader: 'ts' },
    outfile, bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'error',
    plugins: [{ name: 'shipped-sources', setup: b => b.onResolve({ filter: /^\.\/bundled\.ts$/ }, () => ({ path: join(pkg, 'src/bundled.ts') })) }],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  });
  return { dir, outfile };
}

export async function serve({ name, modules, unable, read, runner }) {
  if (!isMainThread && workerData?.kernel) {
    const { outfile, file } = workerData.kernel;
    const loaded = await import(pathToFileURL(outfile).href);
    const said = [];
    const say = (line, message) => said.push(`${relative(process.cwd(), file)}:${line}: ${message.replace(/\s*\n\s*/g, ' ')}`);
    await read({ modules: loaded, file, text: readFileSync(file, 'utf8'), say });
    parentPort.postMessage({ said });
    return;
  }
  const files = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (unable !== undefined) {
    process.stderr.write(`${name}: unable to read test files: ${unable}\n`);
    process.exit(UNABLE);
  }
  if (files.length !== 1) {
    process.stderr.write(`Usage: node scripts/kernels/${name}.mjs <file.ray>\n  Reads the file after ${name}'s own entrypoint and library; prints its diagnostics as \`path:line: message\` on stderr.\n`);
    process.exit(2);
  }
  const { dir, outfile } = await bundled(name, modules);
  const file = resolve(files[0]);
  const worker = new Worker(runner, { workerData: { kernel: { outfile, file } }, resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 60), maxOldGenerationSizeMb: Number(process.env.RAY_HEAP ?? 8000) } });
  let answered = false;
  const code = await new Promise(done => {
    worker.on('message', m => { answered = true; for (const line of m.said) process.stderr.write(line + '\n'); done(m.said.length > 0 ? 1 : 0); });
    worker.on('error', e => { answered = true; process.stderr.write(`${name}: ${e?.stack ?? e}\n`); done(1); });
    worker.on('exit', c => { if (!answered) process.stderr.write(`${name}: the reader stopped without an answer (exit ${c})\n`); done(1); });
  });
  rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}
