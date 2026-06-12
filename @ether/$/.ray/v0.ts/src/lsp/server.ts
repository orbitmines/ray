import { fileURLToPath, pathToFileURL } from 'url';
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
import { Program, type Source } from '../minimal.ts';
import { toLsp } from './diagnostics.ts';
import { encode, offset_at, MODIFIERS } from './semantics.ts';

/**
 * Boot the LSP over a minimal.ts Program.
 *
 * Editor lifecycle maps onto the session API:
 *   - parse / re-parse a document → `program.reload({ path, text })`
 *   - forget a document           → `program.reload({ path, text: '' })`
 * A reload that changes the grammar re-derives the rest of the project in the
 * background — the edited file first, then the other open documents, then
 * everything else — and live edits preempt it. `program.reloaded` fires
 * whenever any file's diagnostics are fresh; we publish straight out of the
 * per-file index on `log.diagnostics.items`.
 */
export async function start(program: Program): Promise<void> {
  const log = await program.abstract().run();
  // the legend: whatever groups the language declared on H — fixed for the
  // session once capabilities go out
  const groups = program.groups;

  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  const uriToFile = (uri: string): string => {
    try { return fileURLToPath(uri); } catch { return uri; }
  };
  // publish on the uri the client knows a file by; files we discovered
  // ourselves fall back to file://
  const uris = new Map<string, string>();
  const remember = (uri: string): string => {
    const file = uriToFile(uri);
    uris.set(file, uri);
    return file;
  };

  // semantic tokens are pulled by the client — after a reload (cross-file
  // grammar changes repaint files the client isn't editing) ask it to pull
  // again, once per burst
  let repainted: ReturnType<typeof setTimeout> | undefined;
  program.reloaded = (src: Source): void => {
    if (src.path === undefined) return;
    const uri = uris.get(src.path) ?? String(pathToFileURL(src.path));
    const diagnostics = (log.diagnostics.items.get(src.path) ?? [])
      .map(d => toLsp(d, src.path))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    connection.sendDiagnostics({ uri, diagnostics });
    clearTimeout(repainted);
    repainted = setTimeout(() => connection.languages.semanticTokens.refresh(), 150);
  };

  const reload = (uri: string, text: string): void => {
    program.reload({ path: remember(uri), text });
  };

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    // the workspace folders are the top-level project boundaries (a
    // .project.ray deeper down claims its own)
    const roots = (params.workspaceFolders ?? []).map(f => uriToFile(f.uri));
    if (params.rootUri) roots.push(uriToFile(params.rootUri));
    program.reroot([...new Set(roots)]);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        semanticTokensProvider: {
          legend: { tokenTypes: groups, tokenModifiers: MODIFIERS },
          full: true,
          range: true,
        },
      },
      serverInfo: { name: 'ray-language-server' },
    };
  });

  // served straight off the program's highlighting (the painted spans the
  // passes derive next to the diagnostics)
  const tokens = (uri: string, range?: [number, number]): { data: number[] } => {
    const path = uriToFile(uri);
    const src = program.sources.find(s => s.path === path);
    if (!src) return { data: [] };
    return { data: encode(src.text, program.highlighting.get(path) ?? [], groups, range) };
  };
  connection.languages.semanticTokens.on(params => tokens(params.textDocument.uri));
  connection.languages.semanticTokens.onRange(params => {
    const path = uriToFile(params.textDocument.uri);
    const src = program.sources.find(s => s.path === path);
    if (!src) return { data: [] };
    return tokens(params.textDocument.uri, [
      offset_at(src.text, params.range.start.line, params.range.start.character),
      offset_at(src.text, params.range.end.line, params.range.end.character),
    ]);
  });

  // Editor configuration (comments, brackets, …) — none wired yet.
  connection.onRequest('ether/languageConfiguration', () => ({}));

  // Whole-workspace initial enumeration, driven by the client's
  // `vscode.workspace.findFiles`. Read each from disk (skipping open
  // documents, which arrive via didOpen with live text) and reload as one
  // batch: every file gets direct diagnostics, and at most one background
  // cycle follows.
  connection.onRequest('ether/initialFiles', (params: { uris: string[] }) => {
    const batch: Source[] = [];
    for (const uri of params.uris ?? []) {
      if (documents.get(uri)) continue;
      const file = remember(uri);
      try { batch.push({ path: file, text: fs.readFileSync(file, 'utf-8') }); } catch { continue; }
    }
    if (batch.length) program.reload(batch);
  });

  documents.onDidOpen(e => {
    program.active.add(uriToFile(e.document.uri));
    reload(e.document.uri, e.document.getText());
  });
  documents.onDidChangeContent(e => reload(e.document.uri, e.document.getText()));
  documents.onDidClose(e => {
    // the file still exists on disk — stop prioritizing it, keep it parsed;
    // deletion comes via didChangeWatchedFiles
    program.active.delete(uriToFile(e.document.uri));
  });

  // External edits / create / delete (registered by the client via
  // `synchronize.fileEvents`).
  connection.onDidChangeWatchedFiles(params => {
    for (const change of params.changes) {
      if (change.type === FileChangeType.Deleted) {
        program.remove(uriToFile(change.uri));
        continue;
      }
      if (documents.get(change.uri)) continue;  // open documents carry live text
      const file = remember(change.uri);
      let text: string;
      try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      program.reload({ path: file, text });
    }
  });

  documents.listen(connection);
  connection.listen();
}
