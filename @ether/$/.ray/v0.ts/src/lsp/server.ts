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
import { Runtime } from '../language.ts';
import { Text } from '../source.ts';
import { toLsp } from './diagnostics.ts';

/**
 * Boot the LSP for an already-configured runtime (base/context methods +
 * interpreter, e.g. the program produced by the Ray frontend compiler).
 *
 * Editor lifecycle maps onto the runtime API:
 *   - parse / re-parse a document → `runtime.reload(new Text.Source(text, file))`
 *   - forget a document          → `runtime.reload(new Text.Source('', file))`
 * Diagnostics self-identify their file via `node.file`, so we publish straight
 * out of the per-file index on `runtime.log.items`.
 */
export async function start(language: Runtime): Promise<void> {
  language.abstract();
  await language.exec();
  const runtime = language.compiled ?? language;

  // A single bad parse must not take the server down: make `fatal` throw rather
  // than exit, and swallow it per-document.
  class FatalParse extends Error {}
  runtime.log.exit = (() => { throw new FatalParse('fatal diagnostic'); }) as any;

  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  const uriToFile = (uri: string): string => {
    try { return fileURLToPath(uri); } catch { return uri; }
  };

  /** (Re)parse a document into the runtime. */
  const parseFile = (uri: string, text: string): void => {
    try { runtime.reload(new Text.Source(text, uriToFile(uri))); }
    catch (e) { if (!(e instanceof FatalParse)) throw e; }
  };

  /** Forget a document — reload an empty source at its location. */
  const dropFile = (uri: string): void => {
    try { runtime.reload(new Text.Source('', uriToFile(uri))); }
    catch (e) { if (!(e instanceof FatalParse)) throw e; }
  };

  /** Publish this file's diagnostics on its URI. */
  const publishFile = (uri: string): void => {
    const file = uriToFile(uri);
    const diags = (runtime.log.items.get(file) ?? [])
      .map(d => toLsp(d, file))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    connection.sendDiagnostics({ uri, diagnostics: diags });
  };

  connection.onInitialize((_params: InitializeParams): InitializeResult => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Full },
    serverInfo: { name: `${runtime.name.toLowerCase() ?? 'ray'}-language-server` },
  }));

  // Editor configuration (comments, brackets, …) — none wired yet.
  connection.onRequest('ether/languageConfiguration', () => ({}));

  // Whole-workspace initial enumeration, driven by the client's
  // `vscode.workspace.findFiles`. Read each from disk (skipping open documents,
  // which arrive via didOpen with live text).
  connection.onRequest('ether/initialFiles', (params: { uris: string[] }) => {
    const touched: string[] = [];
    for (const uri of params.uris ?? []) {
      if (documents.get(uri)) continue;
      const file = uriToFile(uri);
      let text: string;
      try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      parseFile(uri, text);
      touched.push(uri);
    }
    for (const uri of touched) publishFile(uri);
  });

  documents.onDidOpen(e => { parseFile(e.document.uri, e.document.getText()); publishFile(e.document.uri); });
  documents.onDidChangeContent(e => { parseFile(e.document.uri, e.document.getText()); publishFile(e.document.uri); });
  documents.onDidClose(_e => {
    // Keep the document parsed: the file still exists on disk; deletion comes via
    // didChangeWatchedFiles.
  });

  // External edits / create / delete (registered by the client via
  // `synchronize.fileEvents`).
  connection.onDidChangeWatchedFiles(params => {
    for (const change of params.changes) {
      if (change.type === FileChangeType.Deleted) {
        dropFile(change.uri);
        connection.sendDiagnostics({ uri: change.uri, diagnostics: [] });
        continue;
      }
      const file = uriToFile(change.uri);
      let text: string;
      try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      parseFile(change.uri, text);
      publishFile(change.uri);
    }
  });

  documents.listen(connection);
  connection.listen();
}
