import { fileURLToPath } from 'url';
import * as fs from 'fs';
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  FileChangeType,
  type InitializeParams,
  type InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Language, Runtime, Program } from '../language.ts';
import { toLsp } from './diagnostics.ts';

/**
 * Boot the LSP for a configured Language.
 *
 * Lifecycle:
 *   - At startup: run pass 0 (syntax/base/context, the `.abstract(fn => …)`
 *     handler) and flip the runtime into abstract interpretation so verify()
 *     never executes encoded fn bodies.
 *   - Initial enumeration is driven by the client (`ether/initialFiles`):
 *     VS Code's `workspace.findFiles` is faster and respects user excludes,
 *     so we don't crawl the filesystem ourselves.
 *   - On document/file change: re-parse the touched file plus whatever
 *     `affectedBy(uri)` reports — a stub returning [] today, where cross-
 *     file dependency tracking will plug in once symbols can resolve across
 *     files.
 */
export function start(language: Language): void {
  const runtime = language.backend as Runtime;

  // Make `fatal` non-fatal: we don't want a single bad parse to take the
  // server down. Throw instead, which the per-file validate catches.
  class FatalParse extends Error {}
  runtime.log.exit = (() => { throw new FatalParse('fatal diagnostic'); }) as any;

  // Run the bootstrap pass (registers token handler, BASE/CTX methods, AND
  // the language's `.abstract(fn => …)` handler). Later passes load the std
  // lib from disk; the workspace crawl handled by the client supersedes
  // that.
  if (language.passes.length > 0) {
    for (const step of language.passes[0].steps) step();
  }

  // Editor diagnostics must not execute user code: encoded fns can do file
  // IO, mutate the runtime, or shell out. Flip the runtime into abstract
  // interpretation — same lazy-realization shape, but routed through
  // `runtime.abstract_interpretation.call` so encoded bodies never run.
  runtime.abstract();

  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  /** Map of document URI → Program created for the most recent parse. */
  const programs = new Map<string, Program>();
  /** Source text per URI — used when `documents` doesn't have the file open. */
  const sources = new Map<string, string>();

  const uriToFile = (uri: string): string => {
    try { return fileURLToPath(uri); } catch { return uri; }
  };

  /** Drop our cached program + source for a URI. */
  const dropFile = (uri: string) => {
    const prev = programs.get(uri);
    if (prev) {
      const idx = runtime.programs.indexOf(prev);
      if (idx !== -1) runtime.programs.splice(idx, 1);
    }
    programs.delete(uri);
    sources.delete(uri);
  };

  /** Parse a single file, store its program. */
  const parseFile = (uri: string, text: string): Program | null => {
    dropFile(uri);
    sources.set(uri, text);
    const file = uriToFile(uri);
    try { runtime.parse(text, file); }
    catch (e) { if (!(e instanceof FatalParse)) throw e; }
    const program = runtime.programs[runtime.programs.length - 1] ?? null;
    if (program) programs.set(uri, program);
    return program;
  };

  /** Realize deferred work via abstract interpretation. */
  const verifyFile = (uri: string): void => {
    const program = programs.get(uri);
    if (!program) return;
    try { program.verify(); }
    catch (e) { if (!(e instanceof FatalParse)) throw e; }
  };

  /** Convert a program's diagnostics into LSP form and publish on the URI. */
  const publishFile = (uri: string): void => {
    const program = programs.get(uri);
    const file = uriToFile(uri);
    const diags = (program?.diagnostics ?? [])
      .map(d => toLsp(d, file))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    connection.sendDiagnostics({ uri, diagnostics: diags });
  };

  /**
   * Return the URIs whose diagnostics may change as a result of `uri`'s
   * source changing. Stub for now — once symbols resolve across files, this
   * returns the dependents (any file with a forward-ref that changes status,
   * or whose binding the change broke). Until then no file affects another,
   * so [] is correct.
   */
  const affectedBy = (_uri: string): string[] => [];

  /** Parse + verify + publish each URI (de-duplicated). */
  const revalidate = (uris: Iterable<string>): void => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const uri of uris) {
      if (seen.has(uri)) continue;
      const text = sources.get(uri);
      if (text === undefined) continue;
      seen.add(uri);
      order.push(uri);
      parseFile(uri, text);
    }
    for (const uri of order) verifyFile(uri);
    for (const uri of order) publishFile(uri);
  };

  connection.onInitialize((_params: InitializeParams): InitializeResult => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Full },
    serverInfo: { name: `${language.name}-language-server`, version: language.version },
  }));

  // Custom request: hand the Language's editor configuration to the client.
  connection.onRequest('ether/languageConfiguration', () => language._configuration ?? {});

  /**
   * Custom request from the client: a list of all language files in the
   * workspace, enumerated via `vscode.workspace.findFiles`. We read each
   * from disk (skipping ones already managed as open documents — those
   * arrive via didOpen with the in-memory text, which may differ from disk).
   */
  connection.onRequest('ether/initialFiles', (params: { uris: string[] }) => {
    const touched: string[] = [];
    for (const uri of params.uris ?? []) {
      if (documents.get(uri)) continue;     // open in editor: handled by didOpen
      if (programs.has(uri)) continue;      // already loaded
      const file = uriToFile(uri);
      let text: string;
      try { text = fs.readFileSync(file, 'utf-8'); }
      catch { continue; }
      parseFile(uri, text);
      touched.push(uri);
    }
    for (const uri of touched) verifyFile(uri);
    for (const uri of touched) publishFile(uri);
  });

  documents.onDidOpen(e => {
    sources.set(e.document.uri, e.document.getText());
    revalidate([e.document.uri, ...affectedBy(e.document.uri)]);
  });
  documents.onDidChangeContent(e => {
    sources.set(e.document.uri, e.document.getText());
    revalidate([e.document.uri, ...affectedBy(e.document.uri)]);
  });
  documents.onDidClose(_e => {
    // Keep the program: file still exists on disk and other files may
    // (eventually) depend on its definitions. didChangeWatchedFiles is the
    // signal for actual deletion.
  });

  // External edits / file create / delete (registered by the client via
  // `synchronize.fileEvents`). We re-read from disk because the document is
  // typically not open in the editor.
  connection.onDidChangeWatchedFiles(params => {
    const touched = new Set<string>();
    for (const change of params.changes) {
      if (change.type === FileChangeType.Deleted) {
        for (const dep of affectedBy(change.uri)) touched.add(dep);
        dropFile(change.uri);
        connection.sendDiagnostics({ uri: change.uri, diagnostics: [] });
        continue;
      }
      const file = uriToFile(change.uri);
      let text: string;
      try { text = fs.readFileSync(file, 'utf-8'); }
      catch { continue; }
      sources.set(change.uri, text);
      touched.add(change.uri);
      for (const dep of affectedBy(change.uri)) touched.add(dep);
    }
    revalidate(touched);
  });

  documents.listen(connection);
  connection.listen();
}
