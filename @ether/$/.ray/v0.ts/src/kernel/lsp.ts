import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, type InitializeResult } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { encode, position_of, runs, MODIFIERS } from '../lsp/semantics.ts';

// The language server over the kernel's reader, in two readers. The editor's paints every edit at once: only the statements it
// touched, matched dry against the entrypoint, the rest keeps its paints. A worker's reads: the library a statement at a time, and
// each document once typing stops (again when the library is all read); what it read replaces the editor's paints and diagnostics.

const TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];
const SEVERITY: Record<string, 1 | 2 | 3 | 4> = { fatal: 1, error: 1, warning: 2, info: 3, debug: 4, trace: 4 };
const LIBRARY = process.env.RAY_LIBRARY ? path.resolve(process.env.RAY_LIBRARY) : path.resolve(import.meta.dirname, '../../../v0'), ENTRYPOINT = path.join(LIBRARY, '.entrypoint.ray');

type Check = { uri: string; file: string; text: string; version: number };
type Checked = { uri: string; version: number; paints: { begin: number; end: number; style: string }[]; diagnostics: { level: string; message: string; begin: number; end: number }[] };

async function reader(read_entrypoint = true) {
  process.env.KOPT ??= 'off';
  process.env.KLEARN ??= 'off';
  const { Reader } = await import('./host.ts');
  const r = new Reader();
  r.active = new Set<number>();
  r.serve(true);
  if (!read_entrypoint) return r;
  const text = fs.readFileSync(ENTRYPOINT, 'utf8'), src = r.source(ENTRYPOINT, text);
  r.read_all(src, text.length);
  r.settle(src, text.length, true);
  return r;
}

export async function start(io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream }): Promise<void> {
  const r = await reader();
  const worker = new Worker(new URL(import.meta.url), { workerData: { ray_reader: true }, execArgv: [...process.execArgv.filter(flag => !flag.startsWith('--stack-size')), ...(import.meta.url.endsWith('.ts') ? ['--experimental-transform-types', '--disable-warning=ExperimentalWarning'] : [])], resourceLimits: { stackSizeMb: 256 } });
  worker.unref();

  const connection = io === undefined ? createConnection(ProposedFeatures.all) : createConnection(ProposedFeatures.all, io.input, io.output);
  const documents = new TextDocuments(TextDocument);
  const file_of = (uri: string): string => { try { return fileURLToPath(uri); } catch { return uri; } };
  const open = new Map<string, { src: number; text: string; version: number }>();
  const later = new Map<string, ReturnType<typeof setTimeout>>();

  const palette = theme(fs.readFileSync(ENTRYPOINT, 'utf8'));
  const payload = (uris: string[]) => ({
    styles: Object.fromEntries([...palette].map(([name, color]) => [name, { color }])),
    documents: uris.flatMap(uri => { const doc = open.get(uri); return doc ? [{ uri, version: doc.version, ranges: runs(doc.text, r.painted(doc.src) as any) }] : []; }),
  });
  const repaint = (uri: string) => { connection.languages.semanticTokens.refresh(); connection.sendNotification('ether/theme', payload([uri])); };

  worker.on('message', (m: Checked) => {
    const doc = open.get(m.uri);
    if (doc === undefined || doc.version !== m.version) return;
    r.adopt(doc.src, m.paints);
    connection.sendDiagnostics({ uri: m.uri, diagnostics: m.diagnostics.map(d => ({ severity: SEVERITY[d.level] ?? (1 as const), range: { start: position_of(doc.text, d.begin), end: position_of(doc.text, d.end + 1) }, message: d.message, source: 'ray' })) });
    repaint(m.uri);
  });

  const sketch = (uri: string, text: string, version: number, delay = Number(process.env.KLSP_DELAY ?? 300)): void => {
    const file = file_of(uri), before = open.get(uri);
    const t = performance.now();
    const src = r.source(file, text);
    r.active!.add(src);
    try { r.safely(() => before === undefined ? r.dry(src) : r.redry(before.src, src, before.text, text)); } catch { r.kernel('recover'); }
    if (before !== undefined) r.drop(before.src);
    open.set(uri, { src, text, version });
    repaint(uri);
    if (process.env.KLSP_LOG) connection.console.log(`painted ${path.basename(file)} in ${Math.round(performance.now() - t)} ms`);
    clearTimeout(later.get(uri));
    later.set(uri, setTimeout(() => { later.delete(uri); const doc = open.get(uri); if (doc) worker.postMessage({ uri, file, text: doc.text, version: doc.version } satisfies Check); }, delay));
  };

  connection.onInitialize((): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: { tokenTypes: TYPES, tokenModifiers: MODIFIERS }, full: true, range: true },
    },
    serverInfo: { name: 'ray-kernel-language-server' },
  }));
  connection.onInitialized(() => { if (process.env.KLSP_LIBRARY !== 'off') worker.postMessage({ library: true }); });

  const tokens = (uri: string, range?: [number, number]): { data: number[] } => {
    let doc = open.get(uri);
    if (doc === undefined) { const live = documents.get(uri); if (live) { sketch(uri, live.getText(), live.version, 0); doc = open.get(uri); } }
    if (doc === undefined) return { data: [] };
    return { data: encode(doc.text, r.painted(doc.src) as any, TYPES, range) };
  };
  connection.languages.semanticTokens.on(params => tokens(params.textDocument.uri));
  connection.languages.semanticTokens.onRange(params => {
    const doc = open.get(params.textDocument.uri);
    if (doc === undefined) return tokens(params.textDocument.uri);
    const at = (p: { line: number; character: number }) => { let o = 0; for (let k = 0; k < p.line; k++) { const nl = doc.text.indexOf('\n', o); if (nl < 0) return doc.text.length; o = nl + 1; } return Math.min(o + p.character, doc.text.length); };
    return tokens(params.textDocument.uri, [at(params.range.start), at(params.range.end)]);
  });
  connection.onRequest('ether/theme', (params: { uris?: string[] }) => payload(params?.uris ?? []));
  connection.onRequest('ether/initialFiles', (): null => null);

  documents.onDidOpen(e => sketch(e.document.uri, e.document.getText(), e.document.version, 0));
  documents.onDidChangeContent(e => sketch(e.document.uri, e.document.getText(), e.document.version, open.has(e.document.uri) ? undefined : 0));
  documents.onDidClose(e => { worker.postMessage({ close: e.document.uri }); const doc = open.get(e.document.uri); if (doc) { r.drop(doc.src); open.delete(e.document.uri); } });

  documents.listen(connection);
  connection.listen();
}

// The worker: one statement at a time, a document asked for before the library, a newer text of a document in place of the older.
// The entrypoint is the language: a text of it is read by a reader of its own.
const trace = (line: string) => { if (process.env.KLSP_TRACE) fs.appendFileSync(process.env.KLSP_TRACE, `${new Date().toISOString().slice(14, 23)} ${line}`); };
async function read_in_worker() {
  const library_reader = await reader(), { Reader, reading_order } = await import('./host.ts');
  const fresh = (): typeof library_reader => { const r = new Reader(); r.active = new Set<number>(); r.serve(true); return r; };
  const port = parentPort!;
  const docs = new Map<string, Check>(), asked: string[] = [];
  const library: string[] = [], read_files: { src: number; text: string }[] = [];
  let reading: { check?: Check; r: Awaited<ReturnType<typeof reader>>; src: number; pos: number; text: string; before?: ReturnType<Awaited<ReturnType<typeof reader>>['snapshot']> } | undefined, parked: typeof reading, busy = false;
  const done = (x: NonNullable<typeof reading>) => { if (x.before !== undefined) x.r.restore(x.before); else x.r.drop(x.src); };
  const work = (): void => {
    const deadline = performance.now() + 20;
    while (performance.now() < deadline) {
      if (reading?.check !== undefined && docs.get(reading.check.uri) !== reading.check) { done(reading); reading = undefined; }
      if (reading !== undefined && reading.check === undefined && asked.length > 0) { parked = reading; reading = undefined; }
      if (reading === undefined && asked.length === 0 && parked !== undefined) { reading = parked; parked = undefined; }
      if (reading === undefined) {
        const uri = asked.shift();
        if (uri !== undefined) {
          const check = docs.get(uri);
          if (check === undefined) continue;
          const r = check.file === ENTRYPOINT ? fresh() : library_reader, before = r === library_reader ? r.snapshot() : undefined;
          const src = r.source(check.file, check.text);
          r.active!.add(src);
          reading = { check, r, src, pos: 0, text: check.text, before };
        } else {
          const file = library.shift();
          if (process.env.KLSP_TRACE) trace(`worker: library ${file}\n`);
          if (file === undefined) { busy = false; return; }
          const text = fs.readFileSync(file, 'utf8');
          reading = { r: library_reader, src: library_reader.source(file, text), pos: 0, text };
        }
      }
      const { src, text, r } = reading;
      r.serve(reading.check !== undefined);
      const at = reading.pos, t0 = performance.now();
      reading.pos = r.step_on(src, at, text.length);
      if (process.env.KLSP_TRACE && performance.now() - t0 > Number(process.env.KLSP_TRACE_MS ?? 200)) trace(`worker: ${Math.round(performance.now() - t0)} ms at ${path.basename(reading?.check?.file ?? '')}${reading?.check ? '' : 'library'} ${at} ${JSON.stringify(text.slice(at, at + 50))}\n`);
      if (reading.pos < text.length) continue;
      if (reading.check !== undefined && r !== library_reader) r.settle(src, text.length, true);
      if (reading.check === undefined) {
        read_files.push(reading);
        if (library.length === 0) {
          for (const file of read_files) { const t0 = performance.now(); const again = library_reader.settle(file.src, file.text.length); trace(`worker: settled ${file.src} again=${again} ${Math.round(performance.now() - t0)} ms\n`); }
          for (const uri of docs.keys()) if (!asked.includes(uri)) asked.push(uri);
        }
      }
      const check = reading.check, finished = reading;
      reading = undefined;
      if (check === undefined) continue;
      const d0 = performance.now();
      try { r.safely(() => r.dry(src)); } catch { r.kernel('recover'); }
      if (process.env.KLSP_TRACE) trace(`worker: checked ${path.basename(check.file)} v${check.version}, dry ${Math.round(performance.now() - d0)} ms\n`);
      port.postMessage({ uri: check.uri, version: check.version, paints: r.painted(src), diagnostics: r.diagnostics_of(src).map((d: any) => ({ level: d.level, message: d.message, begin: d.at.begin, end: d.at.end })) } satisfies Checked);
      done(finished);
    }
    setImmediate(work);
  };
  const kick = () => { if (!busy) { busy = true; setImmediate(work); } };
  port.on('message', (m: Check | { close: string } | { library: true }) => {
    if ('close' in m) { docs.delete(m.close); return; }
    if ('library' in m) { const files = fs.readdirSync(LIBRARY).filter(f => f.endsWith('.ray') && !f.startsWith('.')).map(f => path.join(LIBRARY, f)); library.push(...reading_order(files.map(f => ({ path: f, text: fs.readFileSync(f, 'utf8') })))); kick(); return; }
    docs.set(m.uri, m);
    if (!asked.includes(m.uri)) asked.push(m.uri);
    kick();
  });
}

// The colors of the language's theme, as its entrypoint writes them: `^name = ^ #RRGGBB` or `^name = ^other`.
function theme(text: string): Map<string, string> {
  const table = new Map<string, string>();
  const at = text.indexOf(':= theme');
  if (at < 0) return table;
  for (const line of text.slice(at, text.indexOf('\n}', at)).split('\n')) {
    const m = line.match(/^\s*\^([\w.]+)\s*=\s*\^\s*(#[0-9A-Fa-f]{3,8}|[\w.]+)\s*$/);
    if (m) table.set(m[1], m[2]);
  }
  const resolve = (name: string, seen = new Set<string>()): string | undefined => {
    if (name.startsWith('#')) return name;
    if (seen.has(name)) return undefined;
    seen.add(name);
    const next = table.get(name);
    if (next !== undefined) return resolve(next, seen);
    const dot = name.lastIndexOf('.');
    return dot > 0 ? resolve(name.slice(0, dot), seen) : undefined;
  };
  const out = new Map<string, string>();
  for (const name of table.keys()) { const color = resolve(name); if (color) out.set(name, color); }
  return out;
}

if (!isMainThread && workerData?.ray_reader) void read_in_worker();
else if (import.meta.url === String(pathToFileURL(process.argv[1] ?? '')) && process.argv.includes('--stdio')) void start();
