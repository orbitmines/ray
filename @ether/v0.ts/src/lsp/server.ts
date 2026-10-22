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
  | { kind: 'language', key: string, memory: SharedArrayBuffer, handled: number, files: string[] }
  | { kind: 'read', s: number, e: number, paints: Paint[], said: Said, theme?: { name: string, colors: Record<string, string> } }
  | { kind: 'testing', paints: Paint[] }
  | { kind: 'tested', paints: Paint[], said: Said }
  | { kind: 'failed', error: string };

const ROLE = env.nodejs && !env.worker_threads.isMainThread ? env.worker_threads.workerData?.lsp : undefined;
// (how often a document being tested is painted again, and on how many threads its tests run)
const EVERY = Number(process.env.RAY_LSP_EVERY ?? 150), THREADS = Math.max(1, Number(process.env.RAY_LSP_THREADS ?? 1));

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

// What is painted, as language.ts's `paints` reads it (each statement's literal text in its rule's style, each hole's take in
// the hole's, a frame given a style), its style only a name: a style member that is no text spans whatever memory its two ends
// do, at worst hundreds of MB. (The kernel's layout, as language.ts has it.)
const STYLED = 10, F = { RULE: 28, START: 40, END: 44, TAKES: 56 }, TAKE = 36, R = { HOLES: 12, PARTS: 28, HEAD: 32, PART: 96 }, PART = 24, N = { A: 12, B: 16 }, HOLE = 2;
const styler = (ray: Ray) => (node: number): string => ray.style_of(node);
function painted(ray: Ray, s: number, e: number): Paint[] {
  const out: Paint[] = [], style = styler(ray), u8 = new Uint8Array(ray.heap.buffer), w = (at: number) => ray.w(at);
  const part = (rule: number, hole: number) => { for (let k = 0, q = rule + R.PART; k < w(rule + R.PARTS); k++, q += PART) if ((w(q) & 15) === HOLE && w(q + 12) === hole) return q; return 0; };
  for (const frame of ray.frames) {
    const fs = w(frame + F.START), fe = w(frame + F.END), rule = w(frame + F.RULE);
    if (fs < s || fe > e || !rule) continue;
    const whole = style(frame), head = style(w(rule + R.HEAD)), takes = Array.from({ length: w(rule + R.HOLES) }, (_, i) => frame + F.TAKES + TAKE * i);
    if (whole) out.push({ begin: fs - s, end: fe - 1 - s, style: whole });
    if (head) for (let at = fs; at < fe; at++) { const inside = takes.some(t => w(t) <= at && at < w(t + 4)); if (!inside && u8[at] > 32) out.push({ begin: at - s, end: at - s, style: head }); }
    takes.forEach((t, i) => { const q = part(rule, i), hole = q ? style(w(q + 20)) : ''; if (hole && w(t) >= s && w(t + 4) <= e) out.push({ begin: w(t) - s, end: w(t + 4) - 1 - s, style: hole }); });
  }
  return out;
}
// (the tests among what is painted: each frame whose rule's head is `untested`, a test written there; as each is run, its frame
// is given what it found)
function tests_in(ray: Ray, s: number, e: number): { frame: number, begin: number, end: number }[] {
  const style = styler(ray);
  return ray.frames.flatMap(frame => {
    const fs = ray.w(frame + F.START), fe = ray.w(frame + F.END), rule = ray.w(frame + F.RULE);
    return fs >= s && fe <= e && rule && style(ray.w(rule + R.HEAD)) === 'untested' ? [{ frame, begin: fs - s, end: fe - 1 - s }] : [];
  });
}

// (where a statement begins after `from` ends: at the end of its line, past the brackets it opens; strings and comments
// skipped)
function statement_end(text: string, from: number): number {
  let depth = 0, quote = '';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === '`') quote = c;
    else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; if (depth <= 0) return i - 1; }
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '\n' && depth <= 0) return i - 1;
  }
  return text.length - 1;
}
// (a colour `share` of the way toward another: `#rgb` or `#rrggbb`)
function mixed(from: string | undefined, to: string | undefined, share: number): string | undefined {
  const rgb = (c: string) => { const h = c.slice(1), full = h.length === 3 ? [...h].map(x => x + x).join('') : h.slice(0, 6); return [0, 2, 4].map(k => parseInt(full.slice(k, k + 2), 16)); };
  if (!from || !to) return from ?? to;
  const [a, b] = [rgb(from), rgb(to)];
  return '#' + a.map((x, k) => Math.round(x + (b[k] - x) * share).toString(16).padStart(2, '0')).join('');
}

// The reading thread: the language, then the document (another document: what the language includes read, open documents as
// the editor has them, the document among them where it is one, else after them on its own; the language's own tests not run).
type Snapshot = { key: string, memory: SharedArrayBuffer, handled: number, files: string[] };
// (painting on for this thread: what tests make, and each whole-line comment, painted too)
const paint_all = (ray: Ray) => (ray as { paint_tests?: () => void }).paint_tests?.();
async function reader(job: { language: string, file: string, text: string, entry: string, texts: [string, string][], key: string, snapshot?: Snapshot }) {
  const parent = env.worker_threads.parentPort!, post = (report: Report) => parent.postMessage(report);
  const heap = memory(Ray.LSP_MEMORY), ray = new Ray(), encoder = new TextEncoder();
  const trace = (what: string) => { if (process.env.RAY_LSP_TRACE) env.fs.writeSync(2, `LSP ${what} at ${Math.round(performance.now())} ms, ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB\n`); };
  Ray.printing = false;
  let s = 0, e = 0;
  // (the language as it was read before: its memory as it was then, and how much of what it asked was done; read on it, only
  // the document)
  if (job.snapshot) {
    new Uint8Array(heap.buffer).set(new Uint8Array(job.snapshot.memory));
    ray.init(heap); paint_all(ray); (ray as unknown as { handled: number }).handled = job.snapshot.handled; trace('language as it was read');
    ray.untested(); [s, e] = ray.alone(encoder.encode(job.text), job.file);
  } else {
    ray.init(heap); paint_all(ray); trace('init');
    [s, e] = ray.file(encoder.encode(job.file === job.language ? job.text : job.entry), job.language);
    trace('entry read');
    if (job.file !== job.language) {
      ray.untested();
      const spans = ray.included([], false, new Map(job.texts));
      // (what the language includes is the language too: its tests not run, only the document's)
      if (spans.has(job.file)) { [s, e] = spans.get(job.file)!; own_tests(heap, s, e); }
      else {
        // (the language read: its memory kept, for the next document to be read on)
        const end = Atomics.load(new Int32Array(heap.buffer), 0), memory = new SharedArrayBuffer(end);
        new Uint8Array(memory).set(new Uint8Array(heap.buffer, 0, end));
        post({ kind: 'language', key: job.key, memory, handled: (ray as unknown as { handled: number }).handled, files: [...spans.keys()] }); trace(`language kept (${Math.round(end / 1048576)} MB)`);
        ray.untested(); [s, e] = ray.alone(encoder.encode(job.text), job.file);
      }
    } else ray.included();
  }
  trace(`document read (${e - s} bytes)`);
  const paints = painted(ray, s, e); trace(`painted (${paints.length} paints${process.env.RAY_LSP_TRACE ? `, the kernel paints ${ray.paints(s, e).length}` : ""})`);
  const said = [...ray.listen()]; trace(`said (${said.length})`);
  // (and what nothing ran, read without running: under what was)
  const unrun = ray.dry_paints(s, e); ray.listen(); paints.unshift(...unrun); trace(`read without running (${unrun.length} paints)`);
  post({ kind: 'read', s, e, paints, said, theme: ray.theme() }); trace('posted');
  // (its tests only once every document is painted: told so)
  await new Promise<void>(resolve => { parent.ref(); parent.once('message', (m: string) => { if (m === 'test') { parent.unref(); resolve(); } }); });
  // (its tests, on their own threads, in this memory; painted again while they run)
  const testers = Array.from({ length: THREADS }, () => thread('tester', { heap, s, e }));
  const done = Promise.all(testers.map(t => new Promise<void>(resolve => {
    t.on('message', (m: { said?: Said, paints?: Paint[] }) => {
      if (m.said) said.push(...m.said);
      for (const p of m.paints ?? []) found.set(`${p.begin}:${p.end}:${p.style}`, p);
      if (m.paints) repaint();
    });
    t.on('error', (x: Error) => { said.push([0, `a test thread crashed: ${x.message}`]); resolve(); });
    t.on('exit', () => resolve());
  })));
  // (each test as it is done: its frame's style read again and again, sent as it changes)
  const tests = tests_in(ray, s, e), style = styler(ray), found = new Map<number | string, Paint>();
  let last = '';
  const repaint = () => {
    for (const t of tests) if (!found.has(t.frame)) { const now = style(t.frame); if (now === 'passed' || now === 'failed') found.set(t.frame, { begin: t.begin, end: t.end, style: now }); }
    const paints = [...unrun, ...painted(ray, s, e), ...found.values()], now = JSON.stringify(paints);
    if (now !== last) { last = now; post({ kind: 'testing', paints }); }
  };
  const timer = setInterval(repaint, EVERY);
  await done; clearInterval(timer); repaint();
  post({ kind: 'tested', paints: [...unrun, ...painted(ray, s, e), ...found.values()], said });
}

// (of what was put off, only what was put off in [s, e]: a file of the language puts off its tests among the language's own;
// one that follows another (`+ 8`) kept with it)
function own_tests(heap: WebAssembly.Memory, s: number, e: number) {
  const i32 = new Int32Array(heap.buffer), w = (at: number) => i32[at >> 2], AFTER = 72, HEAD = 76, TAIL = 80, CAP = 84, ENTRY = 28;
  const head = w(HEAD), tail = Math.min(w(TAIL), w(CAP));
  let to = head, kept = false;
  for (let k = head; k < tail; k++) {
    const from = w(AFTER) + ENTRY * k, f = w(from), follows = w(from + 8);
    if (!follows) kept = !!f && w(f + F.START) >= s && w(f + F.START) < e;
    if (!kept) continue;
    const at = w(AFTER) + ENTRY * to;
    if (at !== from) i32.copyWithin(at >> 2, from >> 2, (from + ENTRY) >> 2);
    to++;
  }
  i32[TAIL >> 2] = to;
}

// A test thread: what was put off, taken while there are any; what it said sent back.
function tester(job: { heap: WebAssembly.Memory, s: number, e: number }) {
  const ray = new Ray(), parent = env.worker_threads.parentPort!;
  // (a frame given what its test found, as the kernel tells of it (L.STYLED): a test inside a test too, whose frame is gone
  // once its test is done; sent at once)
  // (and each frame a test makes of a rule shown in a style (c = 1): its paints, gathered and sent every so often)
  const tell = ray.tell.bind(ray), sent = new Set<string>();
  let gathered: Paint[] = [];
  const flush = () => { if (gathered.length) { parent.postMessage({ paints: gathered }); gathered = []; } };
  const every = setInterval(flush, EVERY);
  ray.tell = (said_at: number, kind: number, a: number, c: number) => {
    if (kind === STYLED && c === 1) {
      for (const p of ray.frame_paints(a, job.s, job.e)) { const k = `${p.begin}:${p.end}:${p.style}`; if (!sent.has(k)) { sent.add(k); gathered.push(p); } }
      return 0;
    }
    if (kind === STYLED && a) {
      const style = styler(ray)(a), fs = ray.w(a + F.START), fe = ray.w(a + F.END);
      if ((style === 'passed' || style === 'failed') && fs >= job.s && fe <= job.e) parent.postMessage({ paints: [{ begin: fs - job.s, end: fe - 1 - job.s, style }] });
    }
    return tell(said_at, kind, a, c);
  };
  const trace = (what: string) => { if (process.env.RAY_LSP_TRACE) env.fs.writeSync(2, `LSP tester ${what} at ${Math.round(performance.now())} ms, ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB\n`); };
  Ray.printing = false; ray.init(job.heap); paint_all(ray); trace('init');
  ray.tests(); trace(`tested (${ray.listen().length} said)`);
  clearInterval(every); flush();
  parent.postMessage({ said: [...ray.listen()] });
}

// (the port held open by what language.ts waits on as a kernel thread: not what keeps this thread alive)
// (and what it waits for, the kernel's buffers, never sent: not listened for, so a message to this thread is this file's)
if (ROLE) { env.worker_threads.parentPort!.removeAllListeners('message'); env.worker_threads.parentPort!.unref(); }
if (ROLE === 'reader') reader(env.worker_threads.workerData).catch((x: Error) => env.worker_threads.parentPort!.postMessage({ kind: 'failed', error: x.stack ?? String(x) }));
else if (ROLE === 'tester') { try { tester(env.worker_threads.workerData); } catch (x) { env.worker_threads.parentPort!.postMessage({ said: [[0, `a test thread failed: ${(x as Error).stack ?? x}`]] }); } }

// The language as read, kept on disk (`~/.cache/ray/lsp`) for the next server: while the kernel and every file it read are as
// they were then (their hashes), read back instead of reading the language again.
const hash = (bytes: Uint8Array | string) => (env.import('crypto') as typeof import('crypto')).createHash('sha1').update(bytes).digest('hex');
const KERNEL = ['../language.ts', '../kernel.ts', '../wasm.o.ray'].map(f => env.url.fileURLToPath(new URL(f, import.meta.url)));
const cached = (language: string) => env.path.join(env.os.homedir(), '.cache', 'ray', 'lsp', hash(language));
const hashes = (files: string[]) => files.map(f => { try { return hash(env.fs.readFileSync(f)); } catch { return ''; } });
function keep(language: string, snapshot: Snapshot) {
  try {
    const dir = cached(language); env.fs.mkdirSync(dir, { recursive: true });
    env.fs.writeFileSync(env.path.join(dir, 'memory'), new Uint8Array(snapshot.memory));
    const read = [language, ...KERNEL, ...snapshot.files];
    env.fs.writeFileSync(env.path.join(dir, 'kept.json'), JSON.stringify({ handled: snapshot.handled, files: snapshot.files, read, hashes: hashes(read) }));
  } catch { /* (not kept: read again next time) */ }
}
function kept(language: string): Snapshot | undefined {
  try {
    const dir = cached(language), meta = JSON.parse(env.fs.readFileSync(env.path.join(dir, 'kept.json'), 'utf-8'));
    if (hashes(meta.read).join() !== meta.hashes.join()) return undefined;
    const bytes = env.fs.readFileSync(env.path.join(dir, 'memory')), memory = new SharedArrayBuffer(bytes.length);
    new Uint8Array(memory).set(bytes);
    return { key: '', memory, handled: meta.handled, files: meta.files };
  } catch { return undefined; }
}

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
  // (the language read, kept for every document read on it: while its entrypoint is as it was, and none of the files it read
  // is open and changed)
  let snapshot: Snapshot | undefined = kept(language);
  const language_key = () => [...documents].find(([u]) => file_of(u) === language)?.[1].text ?? '';
  // (a file the language includes too: read again on it, as any other document)
  const usable = (file: string) => snapshot && snapshot.key === language_key() && file !== language ? snapshot : undefined;

  const payload = (uris: string[]) => {
    const docs = uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, c.paints) }] : []; });
    const styles: Record<string, { color: string }> = {};
    if (shown) {
      const table = new Map(Object.entries(shown.colors));
      for (const [name] of table) { const color = shown_as(table, name); if (color) styles[name] = { color }; }
      // (a style muted, `muted:<style>`: its colour taken `muting` of the way toward `muted`'s)
      const toward = shown_as(table, 'muted'), share = Number.parseFloat(table.get('muting') ?? '50') / 100;
      const colour = (style: string) => style.startsWith('muted:') ? mixed(shown_as(table, style.slice(6)) ?? toward, toward, share) : shown_as(table, style);
      for (const doc of docs) for (const { style } of doc.ranges) if (!styles[style]) { const color = colour(style); if (color) styles[style] = { color }; }
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
    const worker = thread('reader', { language, file, text, entry, texts: [...documents].map(([u, d]) => [file_of(u), d.text]), key: language_key(), snapshot: usable(file) });
    reading.set(uri, { worker, version, read: false, testing: false });
    // (offsets in the text the editor has: bytes to characters)
    const bytes = new TextEncoder().encode(text), at = new Int32Array(bytes.length + 1);
    for (let i = 0, c = 0; i <= bytes.length; i++) { at[i] = c; if (i < bytes.length && (bytes[i] & 0xC0) !== 0x80) c += bytes[i] >= 0xF0 ? 2 : 1; }
    const char = (b: number) => at[Math.max(0, Math.min(bytes.length, b))];
    let s = 0, e = 0;
    const current = () => reading.get(uri)?.worker === worker && documents.get(uri)?.version === version;
    // A test as the theme shows it: `assert` itself as what it found (`untested` until it is run, then `passed` or `failed`),
    // what is written after it in its own colours, muted. (The frames painted are refilled while the tests run: what was read
    // keeps its paints; a test's result is the style its whole frame is given, kept once given.)
    const TESTED = new Set(['untested', 'passed', 'failed']), read: Paint[] = [], once = new Set<string>(), heads: Paint[] = [], results = new Map<string, Paint>();
    const paint = (paints: Paint[], first = false) => {
      if (first) heads.push(...paints.filter(p => p.style === 'untested'));
      // (what was read, and what the tests read as they run: kept, each once)
      for (const p of paints) if (!TESTED.has(p.style)) { const k = `${p.begin}:${p.end}:${p.style}`; if (!once.has(k)) { once.add(k); read.push(p); } }
      for (const p of paints) if (p.style === 'passed' || p.style === 'failed') results.set(`${p.begin}:${p.end}`, p);
      const chars = (p: Paint) => ({ begin: char(p.begin), end: char(p.end), style: p.style });
      // (`assert`, a character at a time: the words they make, each to the end of its statement)
      const words: { begin: number, end: number, style: string, rest: number }[] = [];
      for (const h of heads.map(chars).sort((a, b) => a.begin - b.begin)) {
        const last = words[words.length - 1];
        if (last && h.begin <= last.end + 1) last.end = Math.max(last.end, h.end); else words.push({ ...h, rest: 0 });
      }
      for (const w of words) {
        w.rest = statement_end(text, w.end + 1);
        const result = [...results.values()].map(chars).find(r => r.begin <= w.begin && w.end <= r.end);
        if (result) w.style = result.style;
      }
      const muted = (p: Paint) => words.some(w => w.end < p.begin && p.end <= w.rest);
      // (the word itself only what its test found)
      const on_word = (p: Paint) => words.some(w => p.begin <= w.end && w.begin <= p.end && p.end - p.begin <= w.end - w.begin);
      const out = [...words.map(w => ({ begin: w.begin, end: w.end, style: w.style })), ...read.map(chars).filter(p => !on_word(p)).map(p => muted(p) ? { ...p, style: 'muted:' + p.style } : p)];
      checked.set(uri, { version, text, paints: out }); painted(uri);
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
      if (report.kind === 'language') { if (report.key === language_key()) { snapshot = report; if (report.key === '') keep(language, report); } return; }
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
    // (a file the language read, changed: the language read again)
    if (snapshot?.files.includes(file_of(uri)) && (documents.get(uri)?.text ?? (() => { try { return env.fs.readFileSync(file_of(uri), 'utf-8'); } catch { return undefined; } })()) !== text) snapshot = undefined;
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
