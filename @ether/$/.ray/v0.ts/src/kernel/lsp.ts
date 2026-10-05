import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, type InitializeResult } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { encode, position_of, runs, MODIFIERS } from '../lsp/semantics.ts';

// The language server over the kernel's reader: the entrypoint is read when it starts, an open document is read (and painted)
// whenever it changes, and the rest of the library is read a statement at a time in between, after which open documents are read again.

const TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];
const SEVERITY: Record<string, 1 | 2 | 3 | 4> = { fatal: 1, error: 1, warning: 2, info: 3, debug: 4, trace: 4 };

export async function start(io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream }): Promise<void> {
  process.env.KOPT ??= 'off';
  process.env.KLEARN ??= 'off';
  const { Reader } = await import('./host.ts');
  const library = path.resolve(import.meta.dirname, '../../../v0');
  const entrypoint = path.join(library, '.entrypoint.ray');
  const r = new Reader();
  r.active = new Set<number>();
  r.serve(true);

  const read_whole = (file: string, text: string): number => {
    const src = r.source(file, text);
    try { r.safely(() => r.read(r.span(src, 0, text.length - 1), r.GLOBAL)); } catch { r.kernel('recover'); }
    return src;
  };
  const entry_text = fs.readFileSync(entrypoint, 'utf8');
  read_whole(entrypoint, entry_text);

  const connection = io === undefined ? createConnection(ProposedFeatures.all) : createConnection(ProposedFeatures.all, io.input, io.output);
  const documents = new TextDocuments(TextDocument);
  const file_of = (uri: string): string => { try { return fileURLToPath(uri); } catch { return uri; } };
  const open = new Map<string, { src: number; text: string; version: number }>();
  const later = new Map<string, ReturnType<typeof setTimeout>>();

  const palette = theme(entry_text);
  const payload = (uris: string[]) => ({
    styles: Object.fromEntries([...palette].map(([name, color]) => [name, { color }])),
    documents: uris.flatMap(uri => { const doc = open.get(uri); return doc ? [{ uri, version: doc.version, ranges: runs(doc.text, r.painted(doc.src) as any) }] : []; }),
  });

  const check = (uri: string, text: string, version: number): void => {
    const file = file_of(uri), before = open.get(uri);
    if (before !== undefined) r.drop(before.src);
    const t = performance.now();
    const src = r.source(file, text);
    r.active!.add(src);
    try { r.safely(() => r.read(r.span(src, 0, text.length - 1), r.GLOBAL)); } catch { r.kernel('recover'); }
    try { r.safely(() => r.dry(src)); } catch { r.kernel('recover'); }
    open.set(uri, { src, text, version });
    const diagnostics = r.diagnostics_of(src).map((d: any) => ({
      severity: SEVERITY[d.level] ?? (1 as const),
      range: { start: position_of(text, d.at.begin), end: position_of(text, d.at.end + 1) },
      message: d.message,
      source: 'ray',
    }));
    connection.sendDiagnostics({ uri, diagnostics });
    connection.languages.semanticTokens.refresh();
    connection.sendNotification('ether/theme', payload([uri]));
    if (process.env.KLSP_LOG) connection.console.log(`read ${path.basename(file)} in ${Math.round(performance.now() - t)} ms`);
  };

  // While typing a document is painted dry (its rules matched against what is known, nothing run); it is read once typing stops.
  const sketch = (uri: string, text: string, version: number): void => {
    const file = file_of(uri), before = open.get(uri);
    const t = performance.now();
    const src = r.source(file, text);
    r.active!.add(src);
    try { r.safely(() => r.dry(src)); } catch { r.kernel('recover'); }
    if (before !== undefined) r.drop(before.src);
    open.set(uri, { src, text, version });
    connection.languages.semanticTokens.refresh();
    connection.sendNotification('ether/theme', payload([uri]));
    if (process.env.KLSP_LOG) connection.console.log(`painted ${path.basename(file)} in ${Math.round(performance.now() - t)} ms`);
    clearTimeout(later.get(uri));
    later.set(uri, setTimeout(() => { later.delete(uri); const live = documents.get(uri); if (live) check(uri, live.getText(), live.version); }, Number(process.env.KLSP_DELAY ?? 300)));
  };

  // The library, a statement at a time between messages; open documents are read again once it is all read.
  const pending = fs.readdirSync(library).filter(f => f.endsWith('.ray') && !f.startsWith('.')).sort().map(f => path.join(library, f));
  let reading: { src: number; pos: number; end: number } | undefined;
  const step = (): void => {
    const deadline = performance.now() + 8;
    while (performance.now() < deadline) {
      if (reading === undefined) {
        const file = pending.shift();
        if (file === undefined) {
          for (const [uri, doc] of open) { const text = documents.get(uri)?.getText() ?? doc.text; check(uri, text, doc.version); }
          return;
        }
        const text = fs.readFileSync(file, 'utf8');
        reading = { src: r.source(file, text), pos: 0, end: text.length };
      }
      try { reading.pos = r.safely(() => r.step(reading!.src, reading!.pos, reading!.end)) ?? reading.end; } catch { r.kernel('recover'); reading.pos = reading.end; }
      if (reading.pos >= reading.end) reading = undefined;
    }
    setImmediate(step);
  };

  connection.onInitialize((): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: { tokenTypes: TYPES, tokenModifiers: MODIFIERS }, full: true, range: true },
    },
    serverInfo: { name: 'ray-kernel-language-server' },
  }));
  connection.onInitialized(() => { if (process.env.KLSP_LIBRARY !== 'off') setImmediate(step); });

  const tokens = (uri: string, range?: [number, number]): { data: number[] } => {
    let doc = open.get(uri);
    if (doc === undefined) { const live = documents.get(uri); if (live) { check(uri, live.getText(), live.version); doc = open.get(uri); } }
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

  documents.onDidOpen(e => check(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidChangeContent(e => { if (open.has(e.document.uri)) sketch(e.document.uri, e.document.getText(), e.document.version); else check(e.document.uri, e.document.getText(), e.document.version); });
  documents.onDidClose(e => { const doc = open.get(e.document.uri); if (doc) { r.drop(doc.src); open.delete(e.document.uri); } });

  documents.listen(connection);
  connection.listen();
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

if (import.meta.url === String(pathToFileURL(process.argv[1] ?? '')) && process.argv.includes('--stdio')) void start();
