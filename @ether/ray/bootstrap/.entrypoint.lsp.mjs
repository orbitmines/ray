// The language server, over stdio (`ether --lsp`): each document read as the latest revision reads a program, by the
// compiler's grammar, into its statements (each its span and the first hole of the rule that read it). From those: an
// error where a text is not read at all, the definitions in it (`x := …`, `f (x) => …`, and what a block holds), and
// each statement painted by how it was read. Reading goes deep and its memory only grows: it is done on a thread of its
// own, with room for it, made again every so often, and after a reading that read nothing.
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// (a whole-line comment as spaces: the reader is given code, each place where the editor has it)
const blanked = (text) => text.split('\n').map((l) => (l.trimStart().startsWith('//') ? ' '.repeat(l.length) : l)).join('\n');

// The reading thread: the latest revision's reader, asked one text at a time.
if (!isMainThread && workerData?.lsp === 'reader') {
  const { statements } = await import('./.entrypoint.mjs');
  const parse = await statements();
  parentPort.on('message', ({ id, text }) => {
    try { parentPort.postMessage({ id, statements: parse(blanked(text)) }); }
    catch (e) { parentPort.postMessage({ id, error: String(e?.stack ?? e) }); }
  });
  parentPort.postMessage({ ready: true });
}

// (how many readings a thread does before it is made again, and how long one may take)
const READINGS = Number(process.env.ETHER_LSP_READINGS ?? 40), PATIENCE = Number(process.env.ETHER_LSP_PATIENCE ?? 20000);

// The reader, from the server's side: a reading at a time, in order; the thread made again when it has read enough, read
// nothing, failed, or takes too long.
class Reader {
  constructor(log, stack) { this.log = log; this.stack = stack; this.queue = []; this.thread = undefined; this.readings = 0; this.busy = false; }
  async start() {
    this.thread = new Worker(fileURLToPath(import.meta.url), { workerData: { lsp: 'reader' }, resourceLimits: { stackSizeMb: this.stack } });
    this.readings = 0;
    this.ready = new Promise((resolve, reject) => {
      this.thread.on('message', (m) => { if (m.ready) resolve(); else this.answered?.(m); });
      this.thread.on('error', (e) => { this.log(`the reader failed: ${e?.stack ?? e}`); reject(e); this.failed?.(e); });
      this.thread.on('exit', () => { this.thread = undefined; });
    });
    return this.ready;
  }
  restart() { this.thread?.terminate(); this.thread = undefined; }
  read(text) { return new Promise((resolve) => { this.queue.push({ text, resolve }); this.next(); }); }
  async next() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const { text, resolve } = this.queue.shift();
    let answer;
    try {
      if (!this.thread || this.readings >= READINGS) { this.restart(); await this.start(); }
      this.readings++;
      answer = await new Promise((done) => {
        const timer = setTimeout(() => { done({ error: `not read in ${PATIENCE} ms` }); this.restart(); }, PATIENCE);
        this.answered = (m) => { clearTimeout(timer); done(m); };
        this.failed = (e) => { clearTimeout(timer); done({ error: String(e?.message ?? e) }); };
        this.thread.postMessage({ id: this.readings, text });
      });
    } catch (e) { answer = { error: String(e?.message ?? e) }; this.restart(); }
    // (a text read as nothing leaves the reader unable to read the next: made again)
    if (!answer.statements?.length && text.trim()) this.restart();
    this.busy = false;
    resolve(answer);
    this.next();
  }
}

// What is painted, by the LSP's token types: a statement's head by the rule that read it; and in it, comments, texts and
// numerals as they are written.
export const TOKEN_TYPES = ['comment', 'string', 'number', 'keyword', 'variable', 'function', 'property', 'operator'];
export const TOKEN_MODIFIERS = ['declaration', 'definition', 'readonly', 'static'];
const HEADS = {
  def_name: ['variable', 1], typed_name: ['variable', 1], field_name: ['property', 1], optional_name: ['property', 1],
  rule_head: ['function', 1], static_of: ['function', 1 | 8], set_place: ['variable', 0],
  call_of: ['function', 0], called_of: ['function', 0], juxtaposed: ['function', 0], level_request: ['keyword', 0],
  member_from: ['property', 0], this_member: ['property', 0], member_on: ['property', 0],
};
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
// (where a statement's own name is: the word it is led by, after `static`, or, after `.`, the name of a member)
function head(statement) {
  let at = 0;
  const skip = () => { while (at < statement.text.length && /\s/.test(statement.text[at])) at++; };
  skip();
  if (statement.text.startsWith('static ', at)) { at += 7; skip(); }
  if (statement.text[at] === '.') at++;
  WORD.lastIndex = at;
  const word = WORD.exec(statement.text);
  return word ? { from: statement.from + at, to: statement.from + at + word[0].length, name: word[0] } : undefined;
}
// (comments, texts and numerals, as written: a text in quotes or backticks, `\` keeping the next as it is)
function lexical(text, from, to, out) {
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { let e = i; while (e < to && text[e] !== '\n') e++; out.push([i, e, 'comment', 0]); i = e; }
    else if (c === '"' || c === '`') { let e = i + 1; while (e < to && text[e] !== c && text[e] !== '\n') e += text[e] === '\\' ? 2 : 1; out.push([i, Math.min(e + 1, to), 'string', 0]); i = e; }
    else if (/[0-9]/.test(c) && !/[A-Za-z_0-9]/.test(text[i - 1] ?? '')) { let e = i; while (e < to && /[0-9a-fA-Fx]/.test(text[e])) e++; out.push([i, e, 'number', 0]); i = e - 1; }
  }
}
// (spans, the smaller in a larger dropped, as the LSP's relative tokens, a line at a time)
function encoded(text, spans) {
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [];
  for (const s of spans) if (!kept.length || s[0] >= kept[kept.length - 1][1]) kept.push(s);
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1);
  const line_of = (at) => { let lo = 0, hi = lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lines[m] <= at) lo = m; else hi = m - 1; } return lo; };
  const data = [];
  let pl = 0, pc = 0;
  for (const [from, to, type, modifiers] of kept) {
    for (let a = from; a < to;) {
      const line = line_of(a), end = Math.min(to, line + 1 < lines.length ? lines[line + 1] - 1 : text.length);
      if (end > a) { const c = a - lines[line]; data.push(line - pl, line === pl ? c - pc : c, end - a, TOKEN_TYPES.indexOf(type), modifiers); pl = line; pc = c; }
      a = end + 1;
    }
  }
  return data;
}

// What a document holds: its statements, as read, and what is defined in each block it defines, to a depth.
const DEPTH = 2;
const balanced_block = (text) => { const t = text.trim(); return t.startsWith('{') && t.endsWith('}'); };
// (what a definition defines: after its `:=` or its `=>`, outside brackets and texts)
function body_at(text) {
  let depth = 0, quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && (text.startsWith(':=', i) || text.startsWith('=>', i))) return i + 2;
  }
  return -1;
}

// (given what the host is: its version and the stack its reading needs; not imported here, the host is still starting
// while it serves)
export async function serve({ env, STACK_MB = 512 } = {}) {
  const { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind, DiagnosticSeverity, SymbolKind } = await import('vscode-languageserver/node.js');
  const { TextDocument } = await import('vscode-languageserver-textdocument');
  const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout), documents = new TextDocuments(TextDocument);
  const log = (message) => connection.console.log(message);
  const reader = new Reader(log, STACK_MB);
  // (what each document was read as, at its version)
  const read = new Map();

  // A document read: its statements, and each block's that a definition holds, there in the document.
  const reading = async (text) => {
    const answer = await reader.read(text);
    if (answer.error) return { error: answer.error, statements: [] };
    return { statements: answer.statements };
  };
  const symbols_in = async (text, base, depth) => {
    const { statements } = await reading(text), out = [];
    for (const s of statements) {
      if (!['def_name', 'rule_head', 'static_of', 'typed_name'].includes(s.kind)) continue;
      const name = head(s); if (!name) continue;
      const body = body_at(s.text), symbol = { name: name.name, kind: s.kind === 'def_name' || s.kind === 'typed_name' ? 'variable' : 'function', from: base + s.from, to: base + s.to, at: [base + name.from, base + name.to], children: [] };
      if (body >= 0 && depth < DEPTH && balanced_block(s.text.slice(body))) {
        const inner = s.text.slice(body), open = inner.indexOf('{') + 1, close = inner.lastIndexOf('}');
        symbol.children = await symbols_in(inner.slice(open, close), base + s.from + body + open, depth + 1);
        if (symbol.children.length && symbol.kind === 'variable') symbol.kind = 'namespace';
      }
      out.push(symbol);
    }
    return out;
  };
  const check = async (document) => {
    const text = document.getText(), version = document.version, t0 = Date.now();
    const { statements, error } = await reading(text);
    if (documents.get(document.uri)?.version !== version) return;
    const code = blanked(text).trim();
    const diagnostics = [];
    if (error) diagnostics.push({ severity: DiagnosticSeverity.Error, range: { start: document.positionAt(0), end: document.positionAt(0) }, message: `not read: ${error.split('\n')[0]}`, source: 'ether' });
    else if (code && !statements.length) diagnostics.push({ severity: DiagnosticSeverity.Error, range: { start: document.positionAt(0), end: document.positionAt(Math.min(text.length, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'))) }, message: 'not read: no reading of the language reads this text as statements', source: 'ether' });
    read.set(document.uri, { version, text, statements });
    connection.sendDiagnostics({ uri: document.uri, version, diagnostics });
    log(`read ${document.uri.split('/').pop()} v${version}: ${statements.length} statements in ${Date.now() - t0} ms`);
    connection.languages.semanticTokens.refresh?.();
  };
  const waiting = new Map();
  const later = (document) => { clearTimeout(waiting.get(document.uri)); waiting.set(document.uri, setTimeout(() => { waiting.delete(document.uri); check(document).catch((e) => log(`reading ${document.uri} failed: ${e?.stack ?? e}`)); }, Number(process.env.ETHER_LSP_DELAY ?? 150))); };

  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentSymbolProvider: true,
      semanticTokensProvider: { legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS }, full: true },
    },
    serverInfo: { name: 'ether-language-server', version: env?.version?.toString() },
  }));
  documents.onDidOpen(({ document }) => later(document));
  documents.onDidChangeContent(({ document }) => later(document));
  documents.onDidClose(({ document }) => { read.delete(document.uri); connection.sendDiagnostics({ uri: document.uri, diagnostics: [] }); });

  connection.languages.semanticTokens.on(({ textDocument }) => {
    const document = documents.get(textDocument.uri), r = read.get(textDocument.uri);
    if (!document) return { data: [] };
    const text = document.getText(), spans = [];
    for (const s of r && r.text === text ? r.statements : []) {
      const by = HEADS[s.kind], name = by && head(s);
      if (name) spans.push([name.from, name.to, by[0], by[1]]);
    }
    lexical(text, 0, text.length, spans);
    return { data: encoded(text, spans) };
  });
  connection.onDocumentSymbol(async ({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (!document) return [];
    const range = (a, e) => ({ start: document.positionAt(a), end: document.positionAt(e) });
    const shown = (s) => ({ name: s.name, kind: SymbolKind[s.kind === 'namespace' ? 'Namespace' : s.kind === 'function' ? 'Function' : 'Variable'], range: range(s.from, s.to), selectionRange: range(...s.at), children: s.children.map(shown) });
    return (await symbols_in(document.getText(), 0, 0)).map(shown);
  });
  // (what the editor asks of an Ether server besides: nothing more yet)
  connection.onRequest('ether/initialFiles', () => null);
  connection.onRequest('ether/theme', () => ({ styles: {}, documents: [] }));
  connection.onRequest('ether/languageConfiguration', () => ({
    comments: { lineComment: '//' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '"', close: '"', notIn: ['string'] }, { open: '`', close: '`', notIn: ['string'] }],
    surroundingPairs: [['{', '}'], ['[', ']'], ['(', ')'], ['"', '"'], ['`', '`']],
  }));
  connection.onShutdown(() => reader.restart());

  documents.listen(connection);
  connection.listen();
}
