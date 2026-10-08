// The language, as the expression reader reads it (src/expression/expression.ts): `@ether/ray/.entrypoint.ray` (the language, its
// first statement saying how equivalences are added) with this interpreter's mapping (`src/expression/js.ray`), then the core library
// (`@ether/ray/*.ray`) as one project, then files each in a scope of their own inside the library's. What the CLI and the language
// server need: a file's diagnostics, what it wrote. (The seed's reading of it is in git history, and `language_old.ts`.)
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Host, Ray as Node, type Text } from './expression/expression.ts';

export const NAME = 'Ether' as const;
export const ALIASES = ['ray', 'orbitmines'] as const;
export const version: [major: number, releaseDate: string, index: number] = [0, '2027-01-01', 4];

export class Version {
  static readonly letter = 'E';
  static MONTH_LETTERS = 'ABCDEFGHIJKL';
  constructor(public readonly major: number, public readonly year: number, public readonly yearsSinceRelease: number, public readonly month: number, public readonly index: number) {}
  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }
  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }
  static create(major: number, releaseDate: string, index: number): Version {
    const release = new Date(releaseDate), now = new Date();
    const months = Math.max(0, (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(major, Math.max(now.getFullYear(), release.getFullYear()), Math.floor(months / 12), months % 12 + 1, index);
  }
  static get current(): Version { return Version.create(version[0], version[1], version[2]); }
}

// ---------------------------------------------------------------- where the language is
export const READER = '.entrypoint.ray';
// this interpreter's mapping of the language to its host (JS)
export const MAPPING = path.resolve(import.meta.dirname, 'expression/js.ray');
// The core library (`@ether/ray`): RAY_LIBRARY, else beside this file in the repository (src/ or dist/), in the published package
// (`<package>/@ether/ray`) or in the editor extension's server (`server/@ether/ray`).
export function library_dir(given?: string): string {
  const candidates = [given, process.env.RAY_LIBRARY, path.resolve(import.meta.dirname, '../../ray'), path.resolve(import.meta.dirname, '../@ether/ray'), path.resolve(import.meta.dirname, '@ether/ray')];
  for (const dir of candidates) if (dir !== undefined && fs.existsSync(path.join(dir, READER))) return path.resolve(dir);
  throw new Error(`no language found: none of ${candidates.filter(Boolean).join(', ')} has a ${READER}`);
}

// The order the core library's files are read in (as src/expression/lib.mts reads them): a file after those defining what it uses, then
// the one with the most syntax, then by name. A host's choice, not the reader's.
export function reading_order(files: { path: string; text: string }[]): string[] {
  const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const syntax = (text: string) => text.split('\n').filter(line => /^[^A-Za-z\s/].*=>|^[A-Za-z_]+ \{[a-z]/.test(line)).length;
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []), syntax: syntax(f.text) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order: string[] = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) {
    const waiting = (p: string) => [...needs.get(p)!].filter(q => left.has(q)).length;
    const next = [...left].map(p => info.find(f => f.path === p)!).sort((a, b) => waiting(a.path) - waiting(b.path) || b.syntax - a.syntax || (a.path < b.path ? -1 : 1))[0];
    order.push(next.path); left.delete(next.path);
  }
  return order;
}

// ---------------------------------------------------------------- what reading said
// A span painted with a style (`begin`/`end` inclusive, as src/lsp/semantics.ts takes them).
export type Paint = { begin: number; end: number; style: string };
export type Said = { message: string; begin: number; end: number };

// ---------------------------------------------------------------- the host: the expression reader, the library, files
export class Ray {
  host = new Host();
  // the library's scope: a file is read in one of its own inside it
  scope!: Node;
  // the texts the language and the library were read from, by file
  texts = new Map<string, Text>();
  // what was written to `@me/instance`, since it was last taken
  written: string[] = [];
  timings: [string, number][] = [];
  library: string;

  // `given`: texts to read in place of the files on disk (a document being edited)
  constructor(options: { library?: string; given?: Map<string, string>; paint?: boolean } = {}) {
    this.library = library_dir(options.library);
    this.given = options.given ?? new Map();
    this.host.output = line => { this.written.push(line); };
  }
  given: Map<string, string>;

  text(file: string): Text {
    const t = { name: file, s: this.given.get(file) ?? fs.readFileSync(file, 'utf8') };
    this.texts.set(file, t);
    return t;
  }
  // A failure reading a text (an error the reader did not say where it was): said at its start.
  failed(text: Text, e: unknown) {
    const x = e as { message?: string };
    this.host.say(`Failed: ${x?.message ?? String(e)}`, text, 0, Math.min(text.s.length, text.s.indexOf('\n') < 0 ? text.s.length : text.s.indexOf('\n')));
  }
  // texts read as one, in a scope inside `parent`
  project(texts: Text[], parent: Node): Node {
    const scope = new Node(parent); scope.scope = true;
    try { this.host.project(texts, scope); } catch (e) { if (texts[0]) this.failed(texts[0], e); }
    return scope;
  }

  // The language, with this interpreter's mapping; where what is written to the instance is said (`@me/instance`).
  boot(): this {
    const t0 = performance.now();
    const language = this.text(path.join(this.library, READER)), mapping = { name: MAPPING, s: fs.readFileSync(MAPPING, 'utf8') };
    try { this.host.boot(language, mapping); } catch (e) { this.failed(language, e); }
    this.scope = this.project([{ name: 'interpreter', s: '@me/instance = {x} => @show x' }], this.host.global);
    this.timings.push(['boot', performance.now() - t0]);
    return this;
  }
  // The core library (`@ether/ray/*.ray`, not the dotted ones) as one project (what a statement leaves unresolved is read again
  // once all of it is).
  read_library(): this {
    const t0 = performance.now();
    const names = fs.readdirSync(this.library).filter(f => f.endsWith('.ray') && !f.startsWith('.'));
    const files = names.map(n => ({ path: n, text: this.given.get(path.join(this.library, n)) ?? fs.readFileSync(path.join(this.library, n), 'utf8') }));
    this.scope = this.project(reading_order(files).map(name => this.text(path.join(this.library, name))), this.scope ?? this.host.global);
    this.timings.push(['library', performance.now() - t0]);
    return this;
  }
  // Whether a file is one the language or the core library was read from (a text in place of it means reading them again).
  core(file: string): boolean { const f = path.resolve(file); return this.texts.has(f) && path.dirname(f) === this.library; }

  // ------------------------------------------------ projects (P8.8), as a run lays them out: the core (above), then the projects a
  // file's project declares in its `.project.ray` (`@ether/<path>` a project of Ether, `@<name>` a language project at
  // `@ether/$/<name>`), each after those it declares, then the file's own project (not the other files of a project of tests: each
  // test is a program of its own), then the file. A project is read once, when a file first needs it, in a scope inside the
  // projects read before it: what they define, it sees.
  get ether(): string { return path.dirname(this.library); }
  get repository(): string { return path.dirname(this.ether); }
  projects = new Set<string>();
  dependency_dir(line: string): string | undefined {
    const m = line.trim().match(/^@(\S+)/);
    if (m === null || m[1].includes('://')) return undefined;
    const name = m[1], candidates = name.includes('/') ? [path.join(this.repository, '@' + name)] : [path.join(this.ether, '$', name), path.join(this.repository, '@' + name)];
    // (names are mapped ignoring case: `@ether/UI` is `@ether/ui`)
    return candidates.map(dir => cased(dir)).find((dir): dir is string => dir !== undefined && fs.existsSync(path.join(dir, '.project.ray')));
  }
  declared(dir: string): string[] {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, '.project.ray'), 'utf8'); } catch { return []; }
    return text.split('\n').filter(line => line.trim().startsWith('@')).map(line => this.dependency_dir(line)).filter((d): d is string => d !== undefined);
  }
  // The project a file is in: the nearest directory above it with a `.project.ray`.
  project_of(file: string): string | undefined {
    for (let dir = path.dirname(path.resolve(file)); dir !== path.dirname(dir); dir = path.dirname(dir))
      if (fs.existsSync(path.join(dir, '.project.ray'))) return dir;
    return undefined;
  }
  // A project's files in reading order: its `.ray` files, and those of directories under it that are no project of their own.
  project_files(dir: string): string[] {
    const out: string[] = [], top_only = dir === this.ether;
    const walk = (at: string) => {
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        const full = path.join(at, entry.name);
        if (entry.isDirectory()) { if (!top_only && !entry.name.startsWith('.') && entry.name !== 'node_modules' && !fs.existsSync(path.join(full, '.project.ray'))) walk(full); continue; }
        if (entry.name.endsWith('.ray') && !entry.name.startsWith('.') && !entry.name.startsWith('entrypoint.')) out.push(full);
      }
    };
    walk(dir);
    return reading_order(out.map(f => ({ path: f, text: this.given.get(f) ?? fs.readFileSync(f, 'utf8') })));
  }
  // The projects a project needs, each after those it needs (its own last when it is no project of tests).
  needed(project: string, own: boolean): string[] {
    const order: string[] = [], seen = new Set<string>();
    const visit = (dir: string) => { if (seen.has(dir) || dir === this.library) return; seen.add(dir); for (const dep of this.declared(dir)) visit(dep); order.push(dir); };
    for (const dep of this.declared(project)) visit(dep);
    if (own && !seen.has(project)) order.push(project);
    return order;
  }
  // Files read as one project in a scope inside `parent`.
  group(files: string[], parent: Node): Node { return this.project(files.map(f => this.text(f)), parent); }
  // The scope a file is read in, with what is read before it: the projects its project needs, each in a scope inside the ones before
  // it, then the other files of its project (unless it is a project of tests).
  private chains = new Map<string, Node>();
  prepare(file: string): Node {
    file = path.resolve(file);
    const project = this.project_of(file);
    if (project === undefined || project === this.library) return this.scope;
    const tests = path.relative(this.ether, project).split(path.sep).includes('tests');
    let scope = this.scope, key = '';
    for (const dir of this.needed(project, false)) {
      key += '\0' + dir;
      let next = this.chains.get(key);
      if (next === undefined) {
        const t0 = performance.now();
        this.chains.set(key, next = this.group(this.project_files(dir), scope));
        this.projects.add(dir);
        this.timings.push([path.relative(this.repository, dir), performance.now() - t0]);
      }
      scope = next;
    }
    if (tests) return scope;
    key += '\0' + project + '\0' + file;
    let own = this.chains.get(key);
    if (own === undefined) {
      const t0 = performance.now();
      this.chains.set(key, own = this.group(this.project_files(project).filter(f => f !== file), scope));
      this.timings.push([path.relative(this.repository, project) + ' (without ' + path.basename(file) + ')', performance.now() - t0]);
    }
    return own;
  }

  // A file read in a scope of its own inside the library's (or `scope`): what it said, what it wrote.
  file(file: string, s: string, _keep = false, scope: Node = this.scope ?? this.host.global): { text: Text; diagnostics: Said[]; written: string[]; paints: Paint[] } {
    const text: Text = { name: path.resolve(file), s };
    this.written = [];
    // (what was said about the file as a project read it is said again about this text: the host says a thing once per place)
    for (const k of [...this.host.said]) if (k.startsWith(text.name + '\0')) this.host.said.delete(k);
    this.project([text], scope);
    const written = this.written; this.written = [];
    return { text, diagnostics: this.said(text), written, paints: [] };
  }
  said(text: Text): Said[] { return this.host.diagnostics.filter(d => d.at.text === text).map(d => ({ message: d.message, begin: d.at.b, end: d.at.e })); }
  // A file the language or the library was read from: what was said about it.
  of(file: string): { text: Text; diagnostics: Said[]; paints: Paint[] } | undefined {
    const text = this.texts.get(path.resolve(file));
    return text === undefined ? undefined : { text, diagnostics: this.said(text), paints: [] };
  }
  // (no theme yet: highlighting is the language's own, R5.2)
  theme(): { name: string; colors: Record<string, string> } | undefined { return undefined; }
}

// What a style is shown as in a theme's table: followed through the styles it names to one the table does not name (a colour, as
// CSS writes one); a style the table does not name is shown as the one before its last `.`.
export function shown_as(table: Map<string, string>, name: string, seen = new Set<string>()): string | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const next = table.get(name);
  if (next !== undefined) return table.has(next) ? shown_as(table, next, seen) : /^#[0-9A-Fa-f]{3,8}$/.test(next) ? next : shown_as(table, next, seen);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? shown_as(table, name.slice(0, dot), seen) : undefined;
}

// The readings a file can be read in: the language and its library alone (a file of the library, a test of it, a file of no
// project), or with the projects a file's project needs. A project adds to the library's classes (`Node &+= { … }`): what one file
// needs another must not see, so each set of projects needed is read on its own, the least recently used dropped past `keep`.
export class Readings {
  rays = new Map<string, Ray>();
  constructor(public options: { library?: string; given?: Map<string, string>; paint?: boolean } = {}, public keep = Number(process.env.RAY_READINGS ?? 3)) {}
  get base(): Ray { return this.get(''); }
  key(file: string): string {
    const base = this.base, project = base.project_of(file);
    return project === undefined || project === base.library ? '' : base.needed(project, false).join('\0');
  }
  get(key: string): Ray {
    let ray = this.rays.get(key);
    if (ray !== undefined) { this.rays.delete(key); this.rays.set(key, ray); return ray; }
    ray = new Ray(this.options).boot().read_library();
    this.rays.set(key, ray);
    for (const k of this.rays.keys()) { if (this.rays.size <= this.keep) break; if (k !== '' && k !== key) this.rays.delete(k); }
    return ray;
  }
  for(file: string): Ray { return this.get(this.key(file)); }
  has(file: string): boolean { return [...this.rays.values()].some(r => r.texts.has(path.resolve(file))); }
}

// ---------------------------------------------------------------- run in a thread with a deep stack
// The reader recurses deeply (`node --stack-size=20000` with an unlimited `ulimit -s` for its probes): what reads runs in a worker
// whose stack is large enough, whatever the process was started with.
function thread(data: object): Worker {
  const flags = process.execArgv.filter(flag => !flag.startsWith('--stack-size'));
  // (run from TypeScript: node's own compiles it, a loader's does not reach a worker)
  if (import.meta.url.endsWith('.ts')) flags.push('--experimental-transform-types', '--disable-warning=ExperimentalWarning');
  // (what the reader writes on its own goes to stderr: stdout may be the language server's)
  const w = new Worker(new URL(import.meta.url), { workerData: { ray: data }, execArgv: flags, resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 60),maxOldGenerationSizeMb: Number(process.env.RAY_HEAP ?? 8000) }, stdout: true });
  w.stdout.pipe(process.stderr);
  return w;
}

// What a worker does: `run` reads files and says what they wrote and said; `lsp` reads documents as they change.
async function worker(task: { kind: 'run'; files: string[]; library?: string; verbose?: boolean } | { kind: 'lsp'; library?: string }) {
  const port = parentPort!;
  if (task.kind === 'run') {
    const readings = new Readings({ library: task.library }), first = readings.base;
    const out = (line: string) => port.postMessage({ out: line }), err = (line: string) => port.postMessage({ err: line });
    const line_of = (s: string, i: number) => s.slice(0, i).split('\n').length;
    const timed = (ray: Ray) => { for (const [name, ms] of ray.timings.splice(0)) err(`${name.padEnd(16)} ${String(Math.round(ms)).padStart(7)} ms`); };
    if (task.verbose) { timed(first); err(`${first.host.diagnostics.length} diagnostics in the library`); }
    let failed = false;
    for (const file of task.files) {
      // (a file of the language or the core library: as it was read there)
      const ray = readings.for(file), known = ray.core(file) ? ray.of(file) : undefined, scope = known ? undefined : ray.prepare(file);
      if (task.verbose) timed(ray);
      const read = known ? { text: known.text, diagnostics: known.diagnostics, written: [] as string[] } : ray.file(file, fs.readFileSync(file, 'utf8'), false, scope);
      for (const line of read.written) out(line);
      for (const d of read.diagnostics) err(`${path.relative(process.cwd(), file)}:${line_of(read.text.s, d.begin)}: ${d.message}`);
      if (read.diagnostics.length > 0) failed = true;
    }
    port.postMessage({ exit: failed ? 1 : 0 });
    return;
  }
  // The language server's reader: the library once, then each open document's latest text in a scope of its own. A document that
  // is a file of the language or the library is read as part of it: the whole read again with its text in place of the file's.
  const docs = new Map<string, { file: string; text: string; version: number }>();
  const dirty = new Set<string>();
  let readings: Readings | undefined, scheduled: ReturnType<typeof setTimeout> | undefined;
  const given = () => {
    const out = new Map<string, string>();
    for (const doc of docs.values()) if (path.dirname(path.resolve(doc.file)) === library_dir(task.library)) {
      let disk: string | undefined; try { disk = fs.readFileSync(doc.file, 'utf8'); } catch { disk = undefined; }
      if (disk !== doc.text) out.set(path.resolve(doc.file), doc.text);
    }
    return out;
  };
  const same = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  const work = () => {
    scheduled = undefined;
    const wanted = given();
    if (readings === undefined || !same(wanted, readings.options.given ?? new Map())) {
      const t0 = performance.now();
      readings = new Readings({ library: task.library, given: wanted, paint: true });
      const base = readings.base;
      port.postMessage({ styles: [], theme: base.theme() });
      port.postMessage({ log: `read the language and its library in ${Math.round(performance.now() - t0)} ms (${base.host.diagnostics.length} diagnostics)` });
      for (const uri of docs.keys()) dirty.add(uri);
    }
    for (const uri of [...dirty]) {
      dirty.delete(uri);
      const doc = docs.get(uri);
      if (doc === undefined) continue;
      const t0 = performance.now();
      // (a file of a project read before is as it was read there, unless it was changed since)
      let read: { text: Text; diagnostics: Said[]; paints: Paint[] } | undefined;
      const ray = readings.for(doc.file), known = ray.core(doc.file) ? ray.of(doc.file) : undefined;
      if (known !== undefined) read = known;
      else {
        let scope: Node | undefined;
        try { scope = ray.prepare(doc.file); } catch (e) { port.postMessage({ log: `reading the projects before ${doc.file} failed: ${(e as Error).stack ?? e}` }); }
        read = ray.file(doc.file, doc.text, false, scope);
      }
      port.postMessage({ checked: { uri, version: doc.version, text: read.text.s, paints: read.paints, diagnostics: read.diagnostics } });
      port.postMessage({ log: `read ${path.basename(doc.file)} v${doc.version} in ${Math.round(performance.now() - t0)} ms: ${read.diagnostics.length} diagnostics, ${read.paints.length} paints` });
    }
  };
  port.on('message', (m: { open?: { uri: string; file: string; text: string; version: number }; close?: string; changed?: string[] }) => {
    if (m.open) { docs.set(m.open.uri, { file: m.open.file, text: m.open.text, version: m.open.version }); dirty.add(m.open.uri); }
    if (m.close) docs.delete(m.close);
    // files changed on disk (not as an open document's text): what read them is read again, the language and its library and the
    // projects read since, once; then every open document
    if (m.changed && readings !== undefined && m.changed.some(f => readings!.has(f) || path.dirname(path.resolve(f)) === library_dir(task.library))) {
      port.postMessage({ log: `changed on disk: ${m.changed.map(f => path.basename(f)).join(', ')}; reading again` });
      readings = undefined;
    }
    if (m.changed) for (const uri of docs.keys()) dirty.add(uri);
    if (scheduled === undefined) scheduled = setTimeout(work, Number(process.env.RAY_LSP_DELAY ?? 150));
  });
  scheduled = setTimeout(work, 0);
}

// ---------------------------------------------------------------- the language server
// The legend: the LSP's standard token types, and the styles the library's marks name that it lacks.
// The legend: the LSP's standard token types, then the styles the language's marks name that it lacks (known once the language is
// read: the server answers `initialize` then).
export const TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];

// Serve the language server over stdio (or the streams given): diagnostics, semantic tokens and the theme channel (`ether/theme`),
// from what the reader read.
export async function lsp(options: { library?: string; io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } } = {}): Promise<void> {
  // (CommonJS modules: imported from a bundle, their exports are its `default`)
  const commonjs = <T>(m: T): T => ((m as { default?: T }).default ?? m);
  const [{ createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, DidChangeWatchedFilesNotification }, { TextDocument }, { encode, runs, position_of, MODIFIERS }] = await Promise.all([
    import('vscode-languageserver/node.js').then(commonjs), import('vscode-languageserver-textdocument').then(commonjs), import('./lsp/semantics.ts'),
  ]);
  // (over stdio unless streams are given: `--lsp` is not one of the flags the library looks for)
  const io = options.io ?? { input: process.stdin, output: process.stdout };
  const connection = createConnection(ProposedFeatures.all, io.input, io.output);
  const documents = new TextDocuments(TextDocument);
  const reader = thread({ kind: 'lsp', library: options.library });
  reader.unref();
  const file_of = (uri: string): string => { try { return fileURLToPath(uri); } catch { return uri; } };
  const checked = new Map<string, { version: number; text: string; paints: Paint[] }>();
  const painted = (paints: Paint[]) => paints as unknown as Parameters<typeof encode>[1];
  let theme: { name: string; colors: Record<string, string> } | undefined;
  // the theme channel: how each style is shown (the language's theme), and each document's styled runs
  const payload = (uris: string[]) => {
    const documents = uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, painted(c.paints)) }] : []; });
    const styles: Record<string, { color: string }> = {};
    if (theme !== undefined) {
      const table = new Map(Object.entries(theme.colors));
      for (const [name, color] of table) styles[name] = { color };
      for (const doc of documents) for (const { style } of doc.ranges) if (styles[style] === undefined) { const color = shown_as(table, style); if (color) styles[style] = { color }; }
    }
    return { styles, documents };
  };

  const legend = [...TOKEN_TYPES];
  let styled: () => void = () => {}, answered = false;
  const read = new Promise<void>(resolve => { styled = resolve; setTimeout(resolve, Number(process.env.RAY_LSP_WAIT ?? 60000)); });
  reader.on('message', (m: { checked?: { uri: string; version: number; text: string; paints: Paint[]; diagnostics: Said[] }; log?: string; styles?: string[]; theme?: { name: string; colors: Record<string, string> } }) => {
    if (m.theme !== undefined || m.styles !== undefined) { theme = m.theme; connection.sendNotification('ether/theme', payload([...checked.keys()])); }
    // (the legend is the client's once it was answered: a style named later is not sent as a token)
    if (m.styles !== undefined) { if (!answered) for (const style of m.styles) { const type = style.split('.')[0]; if (!legend.includes(type)) legend.push(type); } styled(); return; }
    if (m.log !== undefined) { if (process.env.RAY_LSP_LOG) connection.console.log(m.log); return; }
    const c = m.checked;
    if (c === undefined) return;
    const doc = documents.get(c.uri);
    if (doc !== undefined && doc.version > c.version) return;
    checked.set(c.uri, { version: c.version, text: c.text, paints: c.paints });
    connection.sendDiagnostics({ uri: c.uri, version: c.version, diagnostics: c.diagnostics.map(d => ({ severity: 1 as const, range: { start: position_of(c.text, d.begin), end: position_of(c.text, Math.max(d.end, d.begin + 1)) }, message: d.message, source: 'ray' })) });
    connection.languages.semanticTokens.refresh();
    connection.sendNotification('ether/theme', payload([c.uri]));
  });
  reader.on('error', e => connection.console.error(`the reader stopped: ${(e as Error).stack ?? e}`));

  const open = (uri: string, text: string, version: number) => reader.postMessage({ open: { uri, file: file_of(uri), text, version } });
  connection.onInitialize(async () => (await read, answered = true, {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: { tokenTypes: legend, tokenModifiers: MODIFIERS }, full: true, range: true },
    },
    serverInfo: { name: 'ray-language-server', version: Version.current.toString() },
  }));
  // (the paints of the text last read: a newer text is painted with them until it is read)
  const tokens = (uri: string, range?: [number, number]) => {
    const c = checked.get(uri);
    return { data: c ? encode(documents.get(uri)?.getText() ?? c.text, painted(c.paints), legend, range) : [] };
  };
  connection.languages.semanticTokens.on(params => tokens(params.textDocument.uri));
  connection.languages.semanticTokens.onRange(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return tokens(params.textDocument.uri);
    return tokens(params.textDocument.uri, [doc.offsetAt(params.range.start), doc.offsetAt(params.range.end)]);
  });
  connection.onRequest('ether/theme', (params: { uris?: string[] }) => payload(params?.uris ?? []));
  connection.onRequest('ether/initialFiles', (): null => null);
  documents.onDidOpen(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidChangeContent(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidClose(e => { reader.postMessage({ close: e.document.uri }); checked.delete(e.document.uri); });
  // Files changed outside the editor (another program, a checkout): told by the client where it watches files, and seen by watching
  // the directories of the language and its projects; the reader reads again what read them.
  let changes = new Set<string>(), told: ReturnType<typeof setTimeout> | undefined;
  const changed = (file: string) => {
    if (!file.endsWith('.ray')) return;
    changes.add(path.resolve(file));
    clearTimeout(told);
    told = setTimeout(() => { const files = [...changes]; changes = new Set(); reader.postMessage({ changed: files }); }, Number(process.env.RAY_LSP_WATCH_DELAY ?? 200));
  };
  connection.onDidChangeWatchedFiles(params => { for (const change of params.changes) changed(file_of(change.uri)); });
  connection.onInitialized(() => {
    void connection.client.register(DidChangeWatchedFilesNotification.type, { watchers: [{ globPattern: "**/*.ray" }] }).catch((): undefined => undefined);
  });
  const watchers: fs.FSWatcher[] = [];
  const watch = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.isFile() && e.name.endsWith('.ray'))) try { const w = fs.watch(dir, (_, name) => { if (name) changed(path.join(dir, name.toString())); }); w.unref(); watchers.push(w); } catch { /* not watched */ }
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') watch(path.join(dir, e.name));
  };
  try { if (process.env.RAY_LSP_WATCH !== 'off') watch(path.dirname(library_dir(options.library))); } catch { /* no language found: the reader says so */ }
  documents.listen(connection);
  connection.listen();
}

// ---------------------------------------------------------------- the command line
const OPTIONS: Record<string, { alias?: string; value?: string; description: string }> = {
  help: { alias: 'h', description: 'Print this help and exit.' },
  version: { description: 'Print the version number.' },
  lsp: { value: '[language]', description: 'Serve the language server (LSP) over stdio; with the directory of the language to read (`@ether/ray`).' },
  verbose: { alias: 'v', description: 'Say how long reading the language and its library took, and how much it said.' },
};
// A path as it is on disk, each part matched ignoring case where it is not spelled the same (nothing when there is none).
function cased(dir: string): string | undefined {
  if (fs.existsSync(dir)) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return undefined;
  const at = cased(parent);
  if (at === undefined) return undefined;
  let entries: string[] = [];
  try { entries = fs.readdirSync(at); } catch { return undefined; }
  const name = path.basename(dir).toLowerCase(), found = entries.find(e => e.toLowerCase() === name);
  return found === undefined ? undefined : path.join(at, found);
}
export function help(): string {
  const rows = Object.entries(OPTIONS).map(([name, o]) => [`  ${o.alias ? `-${o.alias}, ` : '    '}--${name}${o.value ? ' ' + o.value : ''}`, o.description]);
  const width = Math.max(...rows.map(([flags]) => flags.length));
  return [`${NAME} ${Version.current}`, `Usage: ray [options] [files...]`, 'Reads each file in a scope of its own, after the language (@ether/ray) and its core library.', 'Options:', ...rows.map(([flags, d]) => `${flags.padEnd(width)}  ${d}`)].join('\n');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = new Set<string>(), files: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else if (a.startsWith('-') && a.length > 1) for (const c of a.slice(1)) flags.add(Object.entries(OPTIONS).find(([, o]) => o.alias === c)?.[0] ?? c);
    else files.push(a);
  }
  if (flags.has('version')) { console.log(Version.current.toString()); return; }
  if (flags.has('help')) { console.log(help()); return; }
  if (flags.has('lsp')) {
    // (a language directory given: read that language, e.g. `@ether/ray` of the workspace)
    const given = files[0] !== undefined && fs.existsSync(path.join(files[0], READER)) ? path.resolve(files[0]) : undefined;
    await lsp({ library: given });
    return;
  }
  if (files.length === 0) { console.log(help()); return; }
  const w = thread({ kind: 'run', files: files.map(f => path.resolve(f)), verbose: flags.has('verbose') });
  process.exitCode = await new Promise<number>(resolve => {
    w.on('message', (m: { out?: string; err?: string; exit?: number }) => {
      if (m.out !== undefined) process.stdout.write(m.out + '\n');
      if (m.err !== undefined) process.stderr.write(m.err + '\n');
      if (m.exit !== undefined) { resolve(m.exit); void w.terminate(); }
    });
    w.on('error', e => { process.stderr.write(`${(e as Error).stack ?? e}\n`); resolve(1); });
  });
}

if (!isMainThread && workerData?.ray) void worker(workerData.ray);
else if (isMainThread && process.argv[1] !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) void main();
