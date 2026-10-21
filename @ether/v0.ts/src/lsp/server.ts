// The language server over stdio: JSON-RPC, each message after a `Content-Length` header. A document, as it changes, is read
// on a thread of its own (with the language read first: from the editor when it is open there), so the server answers while
// it reads, and a reading that never ends holds up nothing: an edit stops it and reads again. What it is painted as is sent
// as soon as it is read, its tests `untested`; then its tests run, on threads of their own, and as each is done it is painted
// `passed` or `failed` (sent as it changes); what was said is sent as diagnostics, read and then tested. Paints go out as
// semantic tokens and on the theme channel (`ether/theme`), with the language's theme.
import { NAME, Ray, memory, env, position_of, offset_at, encode, runs, shown_as, TOKEN_TYPES, MODIFIERS } from '../language.ts';

type Paint = { begin: number, end: number, style: string };
type Said = [at: number, message: string, style?: string][];
// (what a reading thread sends: read, still being tested, tested; or it could not be read)
type Report =
  | { kind: 'read', s: number, e: number, paints: Paint[], said: Said, theme?: { name: string, colors: Record<string, string> } }
  | { kind: 'testing', paints: Paint[] }
  | { kind: 'tested', paints: Paint[], said: Said }
  | { kind: 'failed', error: string };

const ROLE = env.nodejs && !env.worker_threads.isMainThread ? env.worker_threads.workerData?.lsp : undefined;
// (how often a document being tested is painted again, and on how many threads its tests run)
const EVERY = Number(process.env.RAY_LSP_EVERY ?? 400), THREADS = Math.max(1, Number(process.env.RAY_LSP_THREADS ?? 1));

// A thread of this file: reading a document (`reader`), or running its tests (`tester`), in the memory the reader made.
function thread(role: string, data: object): import('worker_threads').Worker {
  // (named as the kernel's own threads are, `thread` and `main`: language.ts, read on it, then runs no `main` of its own)
  const file = env.url.fileURLToPath(import.meta.url), workerData = { lsp: role, daemon: NAME, thread: NAME, main: [[], {}], ...data };
  const options = { env: process.env, execArgv: process.execArgv.filter(flag => !flag.startsWith('--stack-size')), resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 192) } };
  // (a Node without `--experimental-transform-types` runs the source through tsx: a thread that registers it, then reads this file)
  if (!process.allowedNodeEnvironmentFlags.has('--experimental-transform-types'))
    return new env.worker_threads.Worker(new URL(`data:text/javascript,${encodeURIComponent(env.through_tsx)}`), { ...options, workerData: { ...workerData, kernel: env.url.pathToFileURL(file).href, tsx: import.meta.resolve('tsx/esm/api') } });
  return new env.worker_threads.Worker(file, { ...options, workerData, execArgv: [...options.execArgv, '--experimental-transform-types', '--disable-warning=ExperimentalWarning'] });
}

// The reading thread: the language, then the document (another document: what the language includes read, open documents as
// the editor has them, the document among them where it is one, else after them on its own; the language's own tests not run).
async function reader(job: { language: string, file: string, text: string, entry: string, texts: [string, string][] }) {
  const parent = env.worker_threads.parentPort!, post = (report: Report) => parent.postMessage(report);
  const heap = memory(Ray.LSP_MEMORY), ray = new Ray(), encoder = new TextEncoder();
  Ray.printing = false; ray.init(heap);
  let [s, e] = ray.file(encoder.encode(job.file === job.language ? job.text : job.entry), job.language);
  if (job.file !== job.language) {
    ray.untested();
    const spans = ray.included([], false, new Map(job.texts));
    // (what the language includes is the language too: its tests not run, only the document's)
    if (spans.has(job.file)) [s, e] = spans.get(job.file)!;
    else { ray.untested(); [s, e] = ray.alone(encoder.encode(job.text), job.file); }
  } else ray.included();
  post({ kind: 'read', s, e, paints: ray.paints(s, e), said: [...ray.listen()], theme: ray.theme() });
  // (its tests only once every document is painted: told so)
  await new Promise<void>(resolve => { parent.ref(); parent.once('message', (m: string) => { if (m === 'test') { parent.unref(); resolve(); } }); });
  // (its tests, on their own threads, in this memory; painted again while they run)
  const said: Said = [...ray.listen()];
  const testers = Array.from({ length: THREADS }, () => thread('tester', { heap }));
  const done = Promise.all(testers.map(t => new Promise<void>(resolve => {
    t.on('message', (m: Said) => said.push(...m));
    t.on('error', (x: Error) => { said.push([0, `a test thread crashed: ${x.message}`]); resolve(); });
    t.on('exit', () => resolve());
  })));
  let last = '';
  const repaint = () => { const paints = ray.paints(s, e), now = JSON.stringify(paints); if (now !== last) { last = now; post({ kind: 'testing', paints }); } };
  const timer = setInterval(repaint, EVERY);
  await done; clearInterval(timer);
  post({ kind: 'tested', paints: ray.paints(s, e), said });
}

// A test thread: what was put off, taken while there are any; what it said sent back.
function tester(job: { heap: WebAssembly.Memory }) {
  const ray = new Ray();
  Ray.printing = false; ray.init(job.heap);
  ray.tests();
  env.worker_threads.parentPort!.postMessage([...ray.listen()]);
}

// (the port held open by what language.ts waits on as a kernel thread: not what keeps this thread alive)
// (and what it waits for, the kernel's buffers, never sent: not listened for, so a message to this thread is this file's)
if (ROLE) { env.worker_threads.parentPort!.removeAllListeners('message'); env.worker_threads.parentPort!.unref(); }
if (ROLE === 'reader') reader(env.worker_threads.workerData).catch((x: Error) => env.worker_threads.parentPort!.postMessage({ kind: 'failed', error: x.stack ?? String(x) }));
else if (ROLE === 'tester') { try { tester(env.worker_threads.workerData); } catch (x) { env.worker_threads.parentPort!.postMessage([[0, `a test thread failed: ${(x as Error).stack ?? x}`]]); } }

export async function serve(language: string, io: { input: NodeJS.ReadableStream, output: NodeJS.WritableStream } = { input: process.stdin, output: process.stdout }): Promise<void> {
  const send = (message: object) => { const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8'); io.output.write(`Content-Length: ${body.length}\r\n\r\n`); io.output.write(body); };
  const notify = (method: string, params: unknown) => send({ method, params });
  const log = (message: string) => notify('window/logMessage', { type: 4, message });
  const file_of = (uri: string): string => { try { return env.url.fileURLToPath(uri); } catch { return uri; } };
  const documents = new Map<string, { text: string, version: number }>();
  // (what each document was last painted as and said, and the reading of it under way)
  const checked = new Map<string, { version: number, text: string, paints: Paint[] }>();
  const dirty = new Set<string>();
  const reading = new Map<string, { worker: import('worker_threads').Worker, version: number, read: boolean, testing: boolean }>();
  // (painting first, tests after: a document's tests begin once every document being read has been painted, and edits waiting)
  const release = () => {
    if (dirty.size || [...reading.values()].some(r => !r.read)) return;
    for (const r of reading.values()) if (!r.testing) { r.testing = true; r.worker.postMessage('test'); }
  };
  let shown: { name: string, colors: Record<string, string> } | undefined, refreshes = false, asked = 0;

  const payload = (uris: string[]) => {
    const docs = uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, c.paints) }] : []; });
    const styles: Record<string, { color: string }> = {};
    if (shown) {
      const table = new Map(Object.entries(shown.colors));
      for (const [name] of table) { const color = shown_as(table, name); if (color) styles[name] = { color }; }
      for (const doc of docs) for (const { style } of doc.ranges) if (!styles[style]) { const color = shown_as(table, style); if (color) styles[style] = { color }; }
    }
    return { styles, documents: docs };
  };
  const painted = (uri: string) => { if (refreshes) send({ id: `refresh${++asked}`, method: 'workspace/semanticTokens/refresh' }); notify('ether/theme', payload([uri])); };

  // Read a document again: the reading of it under way stopped, a new one begun.
  const check = (uri: string) => {
    const doc = documents.get(uri); if (!doc) return;
    reading.get(uri)?.worker.terminate();
    const t0 = performance.now(), file = file_of(uri), version = doc.version, text = doc.text;
    const entry = [...documents].find(([u]) => file_of(u) === language)?.[1].text ?? env.fs.readFileSync(language, 'utf-8');
    const worker = thread('reader', { language, file, text, entry, texts: [...documents].map(([u, d]) => [file_of(u), d.text]) });
    reading.set(uri, { worker, version, read: false, testing: false });
    // (offsets in the text the editor has: bytes to characters)
    const bytes = new TextEncoder().encode(text), at = new Int32Array(bytes.length + 1);
    for (let i = 0, c = 0; i <= bytes.length; i++) { at[i] = c; if (i < bytes.length && (bytes[i] & 0xC0) !== 0x80) c += bytes[i] >= 0xF0 ? 2 : 1; }
    const char = (b: number) => at[Math.max(0, Math.min(bytes.length, b))];
    let s = 0, e = 0;
    const current = () => reading.get(uri)?.worker === worker && documents.get(uri)?.version === version;
    // (the frames painted are refilled while the tests run: what was read keeps its paints, and each test the style it last
    // had, `untested` until it has another)
    const TESTED = new Set(['untested', 'passed', 'failed']), read: Paint[] = [], tested = new Map<string, Paint>();
    const paint = (paints: Paint[], first = false) => {
      if (first) read.push(...paints.filter(p => !TESTED.has(p.style)));
      const covered = (q: Paint) => [...tested.values()].some(p => p.style !== 'untested' && p.begin <= q.begin && q.end <= p.end);
      for (const p of paints) if (TESTED.has(p.style) && (first || p.style !== 'untested' || !tested.has(`${p.begin}:${p.end}`)) && !(p.style === 'untested' && covered(p))) {
        // (a test's result, where it was untested: no longer untested)
        if (p.style !== 'untested') for (const [k, q] of tested) if (q.style === 'untested' && (q.begin <= p.begin && p.end <= q.end || p.begin <= q.begin && q.end <= p.end)) tested.delete(k);
        tested.set(`${p.begin}:${p.end}`, p);
      }
      checked.set(uri, { version, text, paints: [...read, ...tested.values()].map(p => ({ begin: char(p.begin), end: char(p.end), style: p.style })) }); painted(uri);
    };
    // (and what is said of no place, out of memory: at the document's start, so no reading fails unseen)
    const outside = (x: number, message: string) => !(x >= s && x <= e) && (x === 0 || message.startsWith('out of memory') || message.startsWith('the kernel said more') || message.startsWith('a test thread'));
    const diagnose = (said: Said) => {
      const seen = new Set<string>();
      const diagnostics = said.filter(([x, message]) => (x >= s && x <= e) || outside(x, message)).flatMap(([x, message]) => {
        const o = outside(x, message) ? 0 : char(x - s), key = `${o}:${message}`;
        if (seen.has(key)) return []; seen.add(key);
        return [{ severity: 1, range: { start: position_of(text, o), end: position_of(text, o + 1) }, message, source: 'ray' }];
      });
      notify('textDocument/publishDiagnostics', { uri, version, diagnostics });
      return diagnostics.length;
    };
    worker.on('message', (report: Report) => {
      if (!current()) return;
      if (report.kind === 'read') {
        s = report.s; e = report.e; shown = report.theme ?? shown;
        paint(report.paints, true);
        log(`read ${env.path.basename(file)} v${version} in ${Math.round(performance.now() - t0)} ms: ${diagnose(report.said)} said`);
        reading.get(uri)!.read = true; release();
      } else if (report.kind === 'testing') paint(report.paints);
      else if (report.kind === 'tested') {
        paint(report.paints);
        log(`tested ${env.path.basename(file)} v${version} in ${Math.round(performance.now() - t0)} ms: ${diagnose(report.said)} said`);
      } else log(`reading ${env.path.basename(file)} v${version} failed: ${report.error}`);
    });
    worker.on('error', (x: Error) => { if (current()) log(`reading ${env.path.basename(file)} v${version} crashed: ${x.stack ?? x}`); });
    worker.on('exit', () => { if (reading.get(uri)?.worker === worker) reading.delete(uri); release(); });
  };

  // (an edit waits a little for the next, then the document is read again; the language changed: every document is)
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const work = () => { scheduled = undefined; for (const uri of [...dirty]) { dirty.delete(uri); try { check(uri); } catch (x) { log(`reading ${uri} failed: ${(x as Error).stack ?? x}`); } } };
  const open = (uri: string, text: string, version: number) => {
    documents.set(uri, { text, version }); dirty.add(uri);
    if (file_of(uri) === language) for (const other of documents.keys()) dirty.add(other);
    if (scheduled !== undefined) clearTimeout(scheduled);
    scheduled = setTimeout(work, Number(process.env.RAY_LSP_DELAY ?? 100));
  };
  const tokens = (uri: string, range?: [number, number]) => { const c = checked.get(uri); return { data: c ? encode(documents.get(uri)?.text ?? c.text, c.paints, TOKEN_TYPES, range) : [] }; };
  type Params = Record<string, any>;
  const requests: Record<string, (params: Params) => unknown> = {
    'initialize': params => {
      refreshes = !!params?.capabilities?.workspace?.semanticTokens?.refreshSupport;
      return { capabilities: { textDocumentSync: 1, semanticTokensProvider: { legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: MODIFIERS }, full: true, range: true } }, serverInfo: { name: 'ray-language-server', version: env.version.toString() } };
    },
    'shutdown': () => { for (const { worker } of reading.values()) worker.terminate(); return null; },
    'textDocument/semanticTokens/full': params => tokens(params.textDocument.uri),
    'textDocument/semanticTokens/range': params => {
      const doc = documents.get(params.textDocument.uri), { start, end } = params.range;
      return doc ? tokens(params.textDocument.uri, [offset_at(doc.text, start.line, start.character), offset_at(doc.text, end.line, end.character)]) : tokens(params.textDocument.uri);
    },
    'ether/theme': params => payload(params?.uris ?? []),
    'ether/initialFiles': () => null,
  };
  const notifications: Record<string, (params: Params) => void> = {
    'exit': () => process.exit(0),
    'textDocument/didOpen': ({ textDocument: d }) => open(d.uri, d.text, d.version),
    'textDocument/didChange': ({ textDocument: d, contentChanges }) => open(d.uri, contentChanges[contentChanges.length - 1].text, d.version),
    'textDocument/didClose': ({ textDocument: d }) => { reading.get(d.uri)?.worker.terminate(); reading.delete(d.uri); documents.delete(d.uri); checked.delete(d.uri); },
  };
  const received = (m: { id?: number | string, method?: string, params?: Params }) => {
    if (m.method === undefined) return;   // (an answer to what was asked: nothing waits for it)
    if (m.id === undefined) { try { notifications[m.method]?.(m.params ?? {}); } catch (e) { log(`${m.method} failed: ${(e as Error).stack ?? e}`); } return; }
    const handle = requests[m.method];
    if (!handle) return send({ id: m.id, error: { code: -32601, message: `no method '${m.method}'` } });
    try { send({ id: m.id, result: handle(m.params ?? {}) ?? null }); }
    catch (e) { send({ id: m.id, error: { code: -32603, message: String((e as Error).message ?? e) } }); }
  };
  let pending = Buffer.alloc(0);
  io.input.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const header = pending.indexOf('\r\n\r\n');
      if (header < 0) return;
      const length = Number(/Content-Length: *(\d+)/i.exec(pending.subarray(0, header).toString('ascii'))?.[1]);
      if (pending.length < header + 4 + length) return;
      const body = pending.subarray(header + 4, header + 4 + length).toString('utf8');
      pending = pending.subarray(header + 4 + length);
      try { received(JSON.parse(body)); } catch (e) { log(`a message could not be read: ${(e as Error).message}`); }
    }
  });
}
