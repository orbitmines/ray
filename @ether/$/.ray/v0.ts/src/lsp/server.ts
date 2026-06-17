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
import { Ray, type Source } from '../minimal4.ts';
import { toLsp } from './diagnostics.ts';
import { encode, offset_at, position_of, MODIFIERS } from './semantics.ts';
import * as features from './features.ts';

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
export async function start(program: Ray.Program): Promise<void> {
  await program.abstract().exec();
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

  // semantic tokens are pulled by the client — after a reload ask it to pull
  // again. Throttled, NOT debounced: a burst of `reloaded` (the background
  // re-derive touches every file) must not keep pushing the refresh back, or
  // the painting only lands once the whole cycle finishes. Fire promptly after
  // the first, then re-arm.
  let repainted: ReturnType<typeof setTimeout> | undefined;
  program.reloaded = (src: Source): void => {
    if (src.path === undefined) return;
    const uri = uris.get(src.path) ?? String(pathToFileURL(src.path));
    const bucket = program.diagnostics.items.get(src as any);
    const diagnostics = (bucket ? [...bucket.values()].flat() : [])
      .map(d => toLsp(d, src.path!))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    connection.sendDiagnostics({ uri, diagnostics });
    if (!repainted) repainted = setTimeout(() => { repainted = undefined; connection.languages.semanticTokens.refresh(); }, 30);
  };

  const reload = (uri: string, text: string): void => {
    program.reload(Ray.source(remember(uri), text));
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
        foldingRangeProvider: true,
        documentSymbolProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentHighlightProvider: true,
        renameProvider: true,
        hoverProvider: true,
        selectionRangeProvider: true,
        completionProvider: { triggerCharacters: ['.'] },
      },
      serverInfo: { name: 'ray-language-server' },
    };
  });

  // every feature reads the same two things: a source's text and positions
  const source = (uri: string): Source | undefined => {
    const path = uriToFile(uri);
    return program.sources.find(s => s.path === path);
  };
  const where = (uri: string, position: { line: number; character: number }): { src: Source; offset: number } | undefined => {
    const src = source(uri);
    return src && { src, offset: offset_at(src.text, position.line, position.character) };
  };
  const range = (text: string, begin: number, end: number) => ({ start: position_of(text, begin), end: position_of(text, end) });
  const locate = (span: features.Span) => {
    const text = program.sources.find(s => s.path === span.path)?.text ?? '';
    return { uri: uris.get(span.path) ?? String(pathToFileURL(span.path)), range: range(text, span.begin, span.end) };
  };

  connection.onFoldingRanges(params => {
    const src = source(params.textDocument.uri);
    if (!src) return [];
    return features.foldings(src.text, features.configuration(program).comments?.lineComment)
      .map(f => ({ startLine: f.start, endLine: f.end }));
  });

  connection.onDocumentSymbol(params => {
    const src = source(params.textDocument.uri);
    if (!src?.path) return [];
    return features.symbols(program, src.path).map(s => ({
      name: s.name || '…',
      kind: s.rule ? 12 /* Function */ : 7 /* Property */,
      range: range(src.text, s.begin, s.end),
      selectionRange: range(src.text, s.begin, Math.min(s.end, line_end(src.text, s.begin))),
    }));
  });

  connection.onDefinition(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at?.src.path) return [];
    return features.definition(program, at.src.path, at.offset).map(locate);
  });

  connection.onReferences(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at?.src.path) return [];
    return features.references(program, at.src.path, at.offset).map(locate);
  });

  connection.onDocumentHighlight(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at?.src.path) return [];
    return features.references(program, at.src.path, at.offset)
      .filter(s => s.path === at.src.path)
      .map(s => ({ range: range(at.src.text, s.begin, s.end) }));
  });

  connection.onRenameRequest(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at?.src.path) return null;
    const changes: Record<string, { range: ReturnType<typeof range>; newText: string }[]> = {};
    for (const s of features.references(program, at.src.path, at.offset)) {
      const loc = locate(s);
      (changes[loc.uri] ??= []).push({ range: loc.range, newText: params.newName });
    }
    return { changes };
  });

  connection.onHover(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at?.src.path) return null;
    const contents = features.hover(program, at.src.path, at.offset);
    return contents !== undefined ? { contents: { kind: 'markdown', value: contents } } : null;
  });

  connection.onSelectionRanges(params => {
    const src = source(params.textDocument.uri);
    if (!src) return [];
    return params.positions.map(position => {
      const offset = offset_at(src.text, position.line, position.character);
      const chain = features.selections(src.text, offset, src.path ? features.word_at(program, src.path, offset) : undefined);
      let parent: any;
      for (const s of chain.reverse()) parent = { range: range(src.text, s.begin, s.end), parent };
      return parent ?? { range: range(src.text, offset, offset) };
    });
  });

  connection.onCompletion(params => {
    const at = where(params.textDocument.uri, params.position);
    if (!at) return [];
    // after `H.` (or any chain dot): the groups; otherwise everything defined
    const dotted = at.src.text[at.offset - 1] === '.';
    if (dotted) return program.groups.map(g => ({ label: g, kind: 20 /* EnumMember */ }));
    const names = new Set<string>();
    for (const [key] of program.engine.sites()) names.add(key.slice(key.indexOf('::') + 2));
    return [...names].map(name => ({ label: name, kind: 2 /* Method */ }));
  });

  const line_end = (text: string, i: number): number => {
    const nl = text.indexOf('\n', i);
    return nl === -1 ? text.length : nl;
  };

  // served straight off the program's highlighting (the painted spans the
  // passes derive next to the diagnostics)
  const tokens = (uri: string, range?: [number, number]): { data: number[] } => {
    const path = uriToFile(uri);
    let src = program.sources.find(s => s.path === path);
    // the client auto-requests tokens on open, which can beat the didOpen that
    // loads the file — so if it isn't painted yet, load it from the open
    // document and paint it now (direct feedback is synchronous), no white flash
    if (!src) {
      const doc = documents.get(uri);
      if (doc) { program.reload(Ray.source(path, doc.getText())); src = program.sources.find(s => s.path === path); }
    }
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

  // Editor configuration — derived from the grammar itself: pair rules make
  // brackets and quotes, the comment rule makes toggle-comment work, and the
  // lexical layer rides along for the client to materialize (the editor's
  // native bracket machinery only respects comments/strings it can tokenize).
  connection.onRequest('ether/languageConfiguration', () => ({
    ...features.configuration(program),
    grammar: features.lexical(program),
  }));

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
      try { batch.push(Ray.source(file, fs.readFileSync(file, 'utf-8'))); } catch { continue; }
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
      program.reload(Ray.source(file, text));
    }
  });

  documents.listen(connection);
  connection.listen();
}
