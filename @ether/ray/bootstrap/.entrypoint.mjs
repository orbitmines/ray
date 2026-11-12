#!/usr/bin/env node
// Ether (`ether`, `ray`, `orbitmines`): the language as it compiles itself. Its latest revision, `.entrypoint.N.wasm`, is
// Expression.ray with the compiler written in it ($/Wasm/Compiled.ray, Low.ray, High.ray, compile.ray), compiled; given
// a program it writes that program as a WebAssembly module (the runtime, $/Wasm/runtime.ray, in it), which is then run.
// Each revision is written by the one before it, from those same sources: revision 0 by the interim engine that is gone
// now. This file only hosts it: it gives a revision its input and runs what it writes.
//   node .entrypoint.mjs FILE         FILE compiled by the latest revision, then run: what its main answers
//   node .entrypoint.mjs --build      the next revision, `.entrypoint.(N+1).wasm`, written by `.entrypoint.N.wasm` (N
//                                     committed first), checked to write itself the same
//   node .entrypoint.mjs --lsp        the language server, over stdio (.entrypoint.lsp.mjs)
//   node .entrypoint.mjs --test [FILE…]  the tests, the entrypoint's or the files': each passed or failed, where it is
//   node .entrypoint.mjs --test-all      the tests of every file the entrypoint includes, as one run
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { setFlagsFromString } from 'node:v8';
// (small functions, as the runtime is written in, inlined where they are called: the host's own way of what an inlining
// level of Compiler.ray would do; set before any module is compiled, for every thread)
setFlagsFromString('--experimental-wasm-inlining');

export const NAME = 'Ether';
export const ALIASES = ['ray', 'orbitmines'];
export const version = [0, '2027-01-01', 5];

export class Version {
  static letter = 'E';
  static MONTH_LETTERS = 'ABCDEFGHIJKL';
  constructor(major, year, yearsSinceRelease, month, index) { Object.assign(this, { major, year, yearsSinceRelease, month, index }); }
  get monthLetter() { return Version.MONTH_LETTERS[this.month - 1]; }
  get tail() { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }
  toString() { return `${this.major}.${Version.letter}${this.tail}`; }
  toSemver({ scheme = false } = {}) {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }
  static create(major, releaseDate, index) {
    const release = new Date(releaseDate), now = new Date();
    const months = Math.max(0, (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(major, Math.max(now.getFullYear(), release.getFullYear()), Math.floor(months / 12), months % 12 + 1, index);
  }
}

export const env = {
  get version() { return Version.create(...version); },
  // (which of its names it was called by)
  get command() {
    const named = (location) => location?.split(/[\\/]/).pop()?.replace(/\.(exe|cmd|bat|ps1|js|mjs|cjs|ts)$/i, '').toLowerCase();
    for (const candidate of [process.env.ETHER_COMMAND, named(process.argv0), named(process.execPath), named(process.argv[1])])
      if (ALIASES.includes(candidate)) return candidate;
    return NAME.toLowerCase();
  },
};

// (where the language is: the repository's @ether this is in, or the @ether bundled beside it when published)
const here = dirname(fileURLToPath(import.meta.url));
export const root = [join(here, '..', '..'), join(here, '@ether')].find((r) => existsSync(join(r, 'ray', 'bootstrap', 'Expression.ray')));
const bootstrap = (name) => join(root, 'ray', 'bootstrap', name);
const wasm = (name) => join(root, '$', 'Wasm', name);

export const revision = () => Math.max(0, ...readdirSync(bootstrap('.')).map((f) => f.match(/^\.entrypoint\.(\d+)\.wasm$/)).filter(Boolean).map((m) => +m[1]));
export const engine = () => bootstrap(`.entrypoint.${revision()}.wasm`);

// (what a revision reads: lines that are only a comment left out; Expression.ray up to where it reads its input (its tests
// after), then the compiler)
export const PAGES = 32000;
export const uncommented = (text) => text.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const reader = () => { const t = readFileSync(bootstrap('Expression.ray'), 'utf8'), end = 'ex := (level input_part 0) as Expression\n'; return t.slice(0, t.indexOf(end) + end.length); };
// (Compiler.ray's part the compiler is itself written with: from `Lowered :=` on, what writes Runtime.ray for the back end)
const lowering = () => { const t = readFileSync(bootstrap('Compiler.ray'), 'utf8'); return t.slice(t.search(/\nLowered := (class )?\{\n/) + 1); };
// (and Compiler.ray's own levels, written for the back end after Runtime.ray: from `Texts :=` up to `Lowered :=`)
const levels = () => { const t = readFileSync(bootstrap('Compiler.ray'), 'utf8'); return t.slice(t.search(/\nTexts := (class )?\{\n/) + 1, t.search(/\nLowered := (class )?\{\n/) + 1); };
export const lowered_input = () => readFileSync(bootstrap('Runtime.ray'), 'utf8') + '\n' + levels();
export const source = () => uncommented([reader(), ...['Compiled.ray', 'Low.ray', 'High.ray'].map((f) => readFileSync(wasm(f), 'utf8')), lowering(), readFileSync(wasm('compile.ray'), 'utf8')].join(''));

// (a revision, given a program: its input the header Expression reads first, the program and the runtime (each without
// its lines that are only a comment), apart by a 0;
// what it writes, from out_base on)
export const instance = async (module, memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES })) => {
  const { instance } = await WebAssembly.instantiate(module, { m: { memory } });
  return { exports: instance.exports, memory, u8: new Uint8Array(memory.buffer), i32: new Int32Array(memory.buffer) };
};
export const given = (it, program, runtime = readFileSync(wasm('runtime.ray'), 'utf8'), written = lowered_input()) => {
  const input = Buffer.from([readFileSync(wasm('header.ray'), 'utf8'), uncommented(program), uncommented(runtime), uncommented(written)].join('\0'));
  it.u8.set(input, 8388608); it.i32[4088 >> 2] = input.length;
};
export const compiled = async (module, program) => {
  const it = await instance(module);
  given(it, program);
  it.exports.main();
  return it.u8.slice(it.exports.out_base(), it.exports.out_base() + it.exports.out_length());
};
export const run = async (module) => (await instance(module)).exports.main();

// (the statements a text is read as, by the latest revision's own reader with the compiler's grammar: each its span and
// the first hole of the rule that read it, `leaf` for none; none at all when the text is not read)
export const grammar = () => { const t = readFileSync(wasm('Compiled.ray'), 'utf8'), a = t.indexOf('(Compiled.grammar).(\n') + 21; return t.slice(a, t.indexOf('\n)\n', a) + 1); };
export const statements = async () => {
  const it = await instance(readFileSync(engine()));
  given(it, '', '');
  it.exports.main();
  const text = (s) => { const b = Buffer.from(s), at = it.exports.alloc(b.length + 8); it.u8.set(b, at); return [it.exports.text(at, at + b.length), at]; };
  const span = (t) => [it.i32[(t >> 2) + 1], it.i32[(t >> 2) + 2]];
  const list = (l) => { const o = []; if (!l || it.i32[l >> 2] !== 3) return o; const d = it.i32[(l >> 2) + 3]; for (let i = 0; i < it.i32[(l >> 2) + 1]; i++) o.push(it.i32[(d >> 2) + i]); return o; };
  const g = it.exports.grammar_of(text(uncommented(grammar()))[0]);
  return (source) => {
    const [t, base] = text(source), bytes = Buffer.from(source);
    const texts = list(it.exports.cw_statement_texts(g, t)), kinds = list(it.exports.cw_statements_in(g, t));
    return texts.map((s, i) => {
      const [a, e] = span(s), k = it.exports.cw_first_member(kinds[i] ?? 0);
      const from = bytes.subarray(0, a - base).toString().length, to = bytes.subarray(0, e - base).toString().length;
      return { from, to, text: source.slice(from, to), kind: k ? Buffer.from(it.u8.subarray(...span(k))).toString() : 'leaf' };
    });
  };
};

// (the next revision: written by the latest from the sources, kept only when it writes itself the same)
export async function build() {
  const n = revision(), name = `.entrypoint.${n}.wasm`;
  const committed = execFileSync('git', ['status', '--porcelain', '--', name], { cwd: bootstrap('.') }).toString().trim() === '' && execFileSync('git', ['ls-files', '--', name], { cwd: bootstrap('.') }).toString().trim() !== '';
  if (!committed) { console.log(`${name} is not committed: commit it before building the next`); process.exitCode = 1; return; }
  const was = readFileSync(bootstrap(name)), text = source(), same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // (what the source writes, written again by what it wrote, until it writes itself: a change in what is written takes a
  // round or two to be written by itself)
  let next = await compiled(was, text);
  if (same(next, was)) { console.log(`${name} is what the source writes: nothing to build`); return; }
  for (let round = 1; ; round++) {
    const again = await compiled(next, text);
    if (same(again, next)) break;
    if (round === 3) { console.log(`revision ${n + 1} does not write itself after ${round} rounds: not kept`); process.exitCode = 1; return; }
    next = again;
  }
  writeFileSync(bootstrap(`.entrypoint.${n + 1}.wasm`), next);
  console.log(`.entrypoint.${n + 1}.wasm: ${next.length} bytes, written from revision ${n}, writes itself`);
}

// Tests (`--test [FILE…]`): the language read by Expression itself, compiled by the latest revision, given the entrypoint
// (the level read after its first statement) and the files after it. What it painted (Expression's `painted`, noted where
// it is made: each style, what it styles and what the holes took in each program it ran in) says each test's result,
// `passed` or `failed`, and where it is.
const TESTING = '0\n';
// (a whole-line comment as an empty line: each line where it is written)
const emptied = (text) => text.split('\n').map((l) => (l.trimStart().startsWith('//') ? '' : l));
// (and painted as a comment, where it is written)
const left_out = (text) => text.split('\n').flatMap((l, line) => { const column = l.length - l.trimStart().length; return l.trimStart().startsWith('//') ? [{ style: 'comment', line, column, length: l.trimEnd().length - column }] : []; });
// (the module that reads, once per revision and sources: kept beside the revision)
export const tester = async () => {
  const program = reader() + TESTING, runtime = readFileSync(wasm('runtime.ray'), 'utf8'), was = readFileSync(engine());
  const key = createHash('sha256').update(was).update(program).update(runtime).update(readFileSync(bootstrap('Runtime.ray'))).update(readFileSync(bootstrap('Compiler.ray'))).update(readFileSync(wasm('header.ray'))).digest('hex').slice(0, 12);
  const name = `.entrypoint.${revision()}.test.${key}.wasm`;
  if (existsSync(bootstrap(name))) return readFileSync(bootstrap(name));
  const module = await compiled(was, program);
  try {
    for (const f of readdirSync(bootstrap('.'))) if (/^\.entrypoint\.\d+\.test\.[0-9a-f]+\.wasm$/.test(f)) unlinkSync(bootstrap(f));
    writeFileSync(bootstrap(name), module);
  } catch { }
  return module;
};
// (what is read: the entrypoint's header and first statement, the level, the rest of it, then each file; each line where
// it is written. A file given with its text is read as that, the entrypoint too. After it, apart by a 0, each file beside
// the entrypoint, for `include @./X.ray`: its location as written, then its text (runtime `file_named`); one given is
// read there, not after the entrypoint)
export const included = () => readdirSync(bootstrap('.')).filter((f) => f.endsWith('.ray') && !f.startsWith('.entrypoint')).sort().map((f) => bootstrap(f));
export const tested = (files, texts = {}) => {
  const lines = [], at = [], entry = bootstrap('.entrypoint.ray'), of = (f) => emptied(texts[f] ?? readFileSync(f, 'utf8'));
  const add = (file, ls, from) => ls.forEach((l, i) => { lines.push(l); at.push([file, from + i + 1]); });
  const ls = of(entry), second = ls.findIndex((l, i) => i > 2 && l && !/^[\s)\]}]/.test(l)), beside = included();
  add(entry, ls.slice(0, second), 0);
  add(wasm('level.ray'), of(wasm('level.ray')), 0);
  add(entry, ls.slice(second), second);
  for (const file of files) if (resolve(file) !== entry && !beside.includes(resolve(file))) add(file, of(file), 0);
  for (const file of beside) { lines[lines.length - 1] += `\0@./${relative(bootstrap('.'), file)}`; add(file, of(file), 0); }
  return { text: lines.join('\n'), at };
};
// (the reading run: each painted style with where it is (in bytes of the input), what nothing read, and how it ended; given
// fuel, it stops after that many steps of reading, keeping what it painted until then)
export const FUEL = Number(process.env.ETHER_FUEL ?? 100000000);
// (how a reading runs (Design §17.1): `abstract`, as the editor runs a file (what never runs is run with unknowns, and painted),
// or `full`, as a test does; the editor's way is ETHER_RUN's, abstract unless it says `full`; the runtime's `abstractly`
// answers which)
export const EDITOR_RUN = process.env.ETHER_RUN === 'full' ? 'full' : 'abstract';
const B = 8388608;
// (how a reading run ended: read to its end, out of memory, out of fuel, or what stopped it)
const ended = (it, fuel, run) => { try { run(); } catch (e) { return it.i32[3924 >> 2] === 1 ? 'stopped: the reading ran out of memory' : fuel && it.i32[3896 >> 2] === 1 ? `stopped after ${fuel} steps of reading` : String(e?.message ?? e); } };
const begun = (it, fuel, run, from, step) => { const { i32 } = it; i32[3896 >> 2] = fuel; i32[3900 >> 2] = run === 'abstract' ? 1 : 0; i32[3948 >> 2] = from; i32[4080 >> 2] = step ? 1 : 0; };
// (given `step`, what is kept for afterwards held, and run a step (a test) at a time: what is painted given to it once
// everything is read, before any test runs, then as the tests end (at most every STEP_MS), until nothing is held or the
// reading stops)
const STEP_MS = Number(process.env.ETHER_STEP_MS ?? 250);
const stepping = (it, fuel, step, out, error) => {
  if (!step || error || !it.exports.entry_step) return error;
  step(out(error));
  // (a step that painted and said nothing new is not given again: how many Expression's `painted` and `reported` hold)
  const { i32 } = it, grown = () => [3968, 3972].map((w) => (i32[w >> 2] > 0 ? i32[(i32[w >> 2] >> 2) + 1] : 0)).join();
  let held = 1, last = Date.now(), given = grown();
  while (held > 0 && !error) {
    error = ended(it, fuel, () => { const v = it.exports.entry_step(); held = v & 1 ? v >> 1 : 0; });
    if (held > 0 && !error && Date.now() - last >= STEP_MS && grown() !== given) { step(out(error)); last = Date.now(); given = grown(); }
  }
  return error;
};
export const painting = async (module, text, fuel = FUEL, run = 'full', from = -1, step) => {
  const it = await instance(module), input = Buffer.from(text + '\0'), out = (e) => read_out(it, input, [[B, 0, input.length]], text, e);
  it.u8.set(input, B); it.i32[4088 >> 2] = input.length; begun(it, fuel, run, from < 0 ? 0 : B + from, step);
  return out(stepping(it, fuel, step, out, ended(it, fuel, () => it.exports.main())));
};
// (what a run painted, read out of its memory: each place in the input, or in a text the host gave after it (`regions`:
// each its address, where it is in `input`, its length))
const read_out = (it, input, regions, text, error) => {
  const { i32, u8, exports: X } = it;
  const tag = (v) => ((v & 1) || v <= 0 ? 0 : i32[v >> 2]);
  const list = (l) => { const o = []; if (tag(l) !== 3) return o; const d = i32[(l >> 2) + 3]; for (let i = 0; i < i32[(l >> 2) + 1]; i++) o.push(i32[(d >> 2) + i]); return o; };
  const words = (t) => Buffer.from(u8.subarray(i32[(t >> 2) + 1], i32[(t >> 2) + 2])).toString();
  const member = (v, name) => { for (let e = i32[(v >> 2) + 2]; e; e = i32[e >> 2]) { const k = X.name_text(i32[(e >> 2) + 1]); if (k && words(k) === name) return i32[(e >> 2) + 2]; } return 0; };
  // (a text spliced is a copy: followed back, piece by piece, to where it is in the input)
  const copies = [], cb = i32[3864 >> 2];
  for (let k = 0; cb && k < i32[3868 >> 2]; k++) copies.push(i32.subarray((cb >> 2) + k * 3, (cb >> 2) + k * 3 + 3));
  copies.sort((a, b) => a[0] - b[0]);
  const placed = (a) => { for (const [at, to, n] of regions) if (a >= at && a < at + n) return to + (a - at); return -1; };
  const inside = (a) => placed(a) >= 0;
  const origin = (a) => {
    for (let n = 0; n < 64 && !inside(a); n++) {
      let lo = 0, hi = copies.length - 1, f = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (copies[m][0] <= a) { f = m; lo = m + 1; } else hi = m - 1; }
      if (f < 0 || a >= copies[f][0] + copies[f][2]) return -1;
      a = copies[f][1] + (a - copies[f][0]);
    }
    return placed(a);
  };
  const span = (t) => { if (tag(t) !== 4) return; const a = origin(i32[(t >> 2) + 1]), e = i32[(t >> 2) + 2] > i32[(t >> 2) + 1] ? origin(i32[(t >> 2) + 2] - 1) + 1 : a; return a >= 0 && e >= a ? [a, e] : undefined; };
  // (a style is a word: a longer text (a name a reading that never ended kept growing) is none)
  const short = (t) => (tag(t) === 4 && i32[(t >> 2) + 2] - i32[(t >> 2) + 1] <= 256 ? words(t) : '');
  const styled = (s) => (tag(s) === 4 ? short(s) : tag(s) === 12 ? short(X.name_text(i32[(s >> 2) + 1])) : '');
  // (where: of the programs it ran in, the outermost whose holes took text from the input, then the nearest whose texts
  // are all in that one's; its first)
  const where = (bounds) => {
    const levels = list(bounds).map((b) => list(b).map((h) => span(member(h, 'value'))).filter(Boolean)).filter((l) => l.length);
    if (!levels.length) return;
    const outer = levels[levels.length - 1], a = Math.min(...outer.map((s) => s[0])), e = Math.max(...outer.map((s) => s[1]));
    const near = levels.find((l) => l.every((s) => s[0] >= a && s[1] <= e));
    return near.reduce((x, s) => (s[0] < x[0] ? s : x));
  };
  // (a rule shown as written, `{head} ^style => …`: in what it read where it is applied, its head's text but the holes, any
  // space in the head any amount of space there)
  const space = (c) => c === 32 || c === 9 || c === 10 || c === 13;
  const [open, close] = Buffer.from(text.slice(0, text.indexOf('\n')).trim().split(/\s+/).slice(1, 3).join(''));
  const literal = (head, read, bounds) => {
    const whole = span(read); if (!whole || tag(head) !== 4) return [];
    const holes = new Map(list(list(bounds)[0]).map((h) => [words(member(h, 'key')), span(member(h, 'value'))]));
    const h = Buffer.from(u8.subarray(i32[(head >> 2) + 1], i32[(head >> 2) + 2])), out = [], end = whole[1];
    let at = whole[0], i = 0;
    while (i < h.length) {
      if (h[i] === open) {
        let d = 0, j = i;
        do { if (h[j] === 96) j = Math.max(j, h.indexOf(96, j + 1)); else if (h[j] === open) d++; else if (h[j] === close) d--; j++; } while (j < h.length && d > 0);
        const inside = h.subarray(i + 1, j - 1).toString().trim(), quoted = /^`(.*)`$/s.exec(inside);
        i = j;
        if (quoted) { const q = Buffer.from(quoted[1]); if (!space(q[0])) while (at < end && space(input[at])) at++; if (input.subarray(at, at + q.length).equals(q)) { if (!q.every(space)) out.push([at, at + q.length]); at += q.length; continue; } return out; }
        const taken = holes.get(/^[A-Za-z_][A-Za-z0-9_]*/.exec(inside)?.[0]);
        if (!taken) return out;
        at = taken[1];
        continue;
      }
      if (space(h[i])) { while (i < h.length && space(h[i])) i++; while (at < end && space(input[at])) at++; continue; }
      if (space(input[at] ?? 0)) while (at < end && space(input[at])) at++;
      const from = at;
      while (i < h.length && h[i] !== open && !space(h[i]) && at < end && input[at] === h[i]) { i++; at++; }
      if (at > from) out.push([from, at]);
      if (i < h.length && h[i] !== open && !space(h[i])) return out;
    }
    return out;
  };
  // (what was painted, ended or not: Expression notes its `painted` first, where it is made, and it grows as it is read)
  const paints = i32[3968 >> 2];
  // (an application painted itself, `(external &) ^passed`: shown where its rule's own `^style` showed it (what it read, its
  // `input`, the same), in place of that)
  const input_of = (v) => { if (tag(v) !== 1 && tag(v) !== 10) return; for (let e = i32[(v >> 2) + 2]; e; e = i32[e >> 2]) if (i32[(e >> 2) + 1] === 47) return i32[(e >> 2) + 2]; };
  const heads = new Map();
  const entries = list(paints).flatMap((p) => {
    const [s, v, b] = list(p), style = styled(s);
    if (tag(v) === 3 && list(v).length === 2) { const at = literal(...list(v), b); heads.set(list(v)[1], at); return at.map((at) => ({ style, at })); }
    const head = heads.get(input_of(v));
    if (head) return head.map((at) => ({ style, at, over: true }));
    return [{ style, at: where(b) }];
  });
  // (a style written as a marker, `^keyword`: shown in the style it names, where it is written)
  const markers = list(paints).flatMap((p) => {
    const [s, , b] = list(p), style = styled(s);
    if (!style || tag(b) !== 3) return [];
    return list(b).flatMap((l) => list(l)).flatMap((h) => { const at = span(member(h, 'value')); if (!at) return []; let a = at[0], e = at[1]; while (a < e && input[a] <= 32) a++; while (e > a && input[e - 1] <= 32) e--; return a > 0 && input[a - 1] === 94 && input.subarray(a, e).toString() === style ? [{ style, at: [a - 1, e] }] : []; });
  });
  entries.push(...markers);
  const over = new Map(entries.filter((p) => p.over).map((p) => [`${p.at}`, p.style]));
  // (each once: a body run again paints the same again)
  // (a style that answered nothing, `^(c ? a : b)` with c neither: nothing shown)
  const painted = [...new Map(entries.filter((p) => p.style && (!over.has(`${p.at}`) || over.get(`${p.at}`) === p.style)).map(({ style, at }) => [`${style}:${at}`, { style, at }])).values()];
  const unread = [...new Map(list(i32[3860 >> 2]).map(span).filter((s) => s && s[1] > s[0]).map((s) => [s.join(':'), s])).values()];
  // (what was said, Expression's `reported`, noted second: each the `{message}` hole's entry and what the holes took)
  const said = i32[4084 >> 2] > 1 ? list(i32[3972 >> 2]).map((r) => {
    const [hole, b] = list(r), v = member(hole, 'value');
    return { message: tag(v) === 4 ? words(v).trim() : '', at: where(b) ?? span(v) };
  }) : [];
  if (i32[4068 >> 2]) for (const t of list(i32[4068 >> 2])) said.push({ message: 'ran past its budget: 200000000 steps', at: span(t) });
  return { painted, unread, said, error, input };
};
// (the editor's image (Design: the entrypoint and what it includes read once): their reading kept, its memory's pages and
// the runtime's globals, for each file read after it; none when Expression gives no way to read one more text, word 3856)
// (ETHER_IMAGE=0: each file read after the entrypoint and its includes anew)
const PAGE = 65536, images = new Map(), IMAGE = process.env.ETHER_IMAGE !== '0';
const imaged = async (module, run) => {
  const { text } = tested([]), key = createHash('sha256').update(module).update(text).update(run).digest('hex');
  if (images.has(key)) return images.get(key);
  const it = await instance(module), input = Buffer.from(text + '\0');
  it.u8.set(input, B); it.i32[4088 >> 2] = input.length; begun(it, FUEL, run, 0x7fffffff);
  let image = null;
  if (!ended(it, FUEL, () => it.exports.main()) && it.i32[3856 >> 2] && it.exports.image_out) {
    const at = it.exports.image_out(), words = new BigUint64Array(it.memory.buffer), pages = [];
    for (let p = 0; p < it.u8.length / PAGE; p++) for (let i = p * PAGE / 8; i < (p + 1) * PAGE / 8; i++) if (words[i]) { pages.push([p, it.u8.slice(p * PAGE, (p + 1) * PAGE)]); break; }
    image = { at, pages, input, text };
  }
  images.clear(); images.set(key, image);
  return image;
};
// (a file read after the image: its memory set back, then the text given to what Expression registered)
const painted_after = async (module, image, own, fuel, run, step) => {
  const memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES }), u8 = new Uint8Array(memory.buffer);
  for (const [p, bytes] of image.pages) u8.set(bytes, p * PAGE);
  const it = await instance(module, memory), X = it.exports, bytes = Buffer.from(own);
  X.image_in(image.at);
  const a = X.alloc(bytes.length + 8); it.u8.set(bytes, a);
  begun(it, fuel, run, a, step);
  const out = (e) => read_out(it, Buffer.concat([image.input, bytes]), [[B, 0, image.input.length], [a, image.input.length, bytes.length]], image.text, e);
  return out(stepping(it, fuel, step, out, ended(it, fuel, () => X.entry_given(X.text(a, a + bytes.length)))));
};
// (a place in the input, as where it is written)
const located = ({ input, at }, [a]) => {
  const before = input.subarray(0, a).toString(), line = before.split('\n').length - 1;
  return { file: at[line]?.[0], line: at[line]?.[1], column: before.length - before.lastIndexOf('\n') };
};
// (what is painted in a file, read after the entrypoint (or as it): each style, its line and column (from 0) and length, in
// the file's own characters)
const SAYING = ['fatal', 'error', 'warn', 'info'];
// (where the file begins in what is read, in bytes: its tests the only ones run (the editor's file, the first file given to
// test, and after it); the entrypoint's own, everything)
const edited = (input, at, file) => { const l = at.findIndex(([f]) => resolve(f) === resolve(file)); return l <= 0 ? -1 : Buffer.byteLength(input.split('\n').slice(0, l).join('\n')) + 1; };
// (given `step`, what is painted given to it as it goes: once read, then as its tests end)
export const paints = async (file, text, run = EDITOR_RUN, step) => {
  const module = await tester(), own = !IMAGE || [bootstrap('.entrypoint.ray'), ...included()].includes(resolve(file)) ? null : await imaged(module, run);
  let place, reading;
  if (own) {
    const lines = emptied(text).join('\n'), base = own.input.length, bytes = Buffer.from(lines);
    reading = (stepped) => painted_after(module, own, lines, FUEL, run, stepped);
    place = ([a, e]) => {
      if (a < base) return;
      const before = bytes.subarray(0, a - base).toString(), line = before.split('\n').length - 1;
      return { line, column: before.length - before.lastIndexOf('\n') - 1, length: bytes.subarray(a - base, e - base).toString().length };
    };
  } else {
    const { text: input, at } = tested([file], { [file]: text }), bytes = Buffer.from(input);
    reading = (stepped) => painting(module, input, FUEL, run, edited(input, at, file), stepped);
    // (each line's first byte, and whether it is the file's)
    const starts = [0], ours = at.map(([f]) => resolve(f) === resolve(file));
    for (let i = bytes.indexOf(10); i >= 0; i = bytes.indexOf(10, i + 1)) starts.push(i + 1);
    place = ([a, e]) => {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= a) lo = m; else hi = m - 1; }
      return ours[lo] ? { line: at[lo][1] - 1, column: bytes.subarray(starts[lo], a).toString().length, length: bytes.subarray(a, e).toString().length } : undefined;
    };
  }
  const shown_of = ({ painted, unread, said, error }) => {
    const shown = [...left_out(text), ...painted.flatMap(({ style, at: s }) => { const p = s && place(s); return p ? [{ style, ...p }] : []; })];
    // (what was said there, as severe as how its line is painted: `ERROR …` as an error, `WARN …` a warning, else an error)
    const severity = (p) => shown.filter((s) => s.line === p.line && SAYING.includes(s.style) && s.column <= p.column).sort((x, y) => y.column - x.column)[0]?.style ?? 'error';
    return { painted: shown, unread: unread.map(place).filter(Boolean), said: (said ?? []).flatMap(({ message, at: s }) => { const p = s && place(s); return p ? [{ message, ...p, severity: severity(p) }] : []; }), error };
  };
  return shown_of(await reading(step && ((r) => step(shown_of(r)))));
};
export async function test(files = []) {
  const t0 = Date.now(), { text, at } = tested(files), module = await tester();
  const run = await new Promise((done) => {
    const thread = new Worker(fileURLToPath(import.meta.url), { workerData: { tested: { module, text, from: files.length ? edited(text, at, files[0]) : -1 } }, resourceLimits: { stackSizeMb: STACK_MB } });
    const timer = setTimeout(() => { thread.terminate(); done({ painted: [], unread: [], error: `not read in ${TEST_MS} ms` }); }, TEST_MS);
    thread.on('message', (m) => { clearTimeout(timer); done(m); thread.terminate(); });
    thread.on('error', (e) => { clearTimeout(timer); done({ painted: [], unread: [], error: String(e?.message ?? e) }); });
  });
  const input = Buffer.from(text), shown = (p) => p ? `${relative(process.cwd(), p.file).startsWith('..') ? p.file : relative(process.cwd(), p.file)}:${p.line}:${p.column}` : '(not found where)';
  const ours = (p) => (files.length ? files.map((f) => resolve(f)) : [bootstrap('.entrypoint.ray')]).includes(p?.file && resolve(p.file));
  // (each test once: failed where it ever failed)
  const results = new Map();
  for (const { style, at: span } of run.painted) {
    if (style !== 'passed' && style !== 'failed') continue;
    const p = span ? located({ input, at }, span) : undefined, k = p ? `${p.file}:${p.line}:${p.column}` : '?';
    if (p && !ours(p)) continue;
    if (results.get(k)?.style !== 'failed') results.set(k, { style, p });
  }
  const warnings = run.painted.filter((x) => x.style === 'warn' && x.at && ours(located({ input, at }, x.at))).length;
  let passed = 0, failed = 0, errors = 0;
  for (const { style, p } of results.values()) {
    const line = p ? readFileSync(p.file, 'utf8').split('\n')[p.line - 1]?.trim() : '';
    if (style === 'passed') passed++; else failed++;
    console.log(`${style === 'passed' ? 'passed' : 'FAILED'}  ${shown(p)}  ${line}`);
  }
  // (a test read but never checked, `untested` still: not run, an error)
  const checked = new Set([...results.values()].map(({ p }) => p && `${p.file}:${p.line}`));
  const unchecked = new Map();
  for (const { style, at: span } of run.painted) {
    if (style !== 'untested' || !span) continue;
    const p = located({ input, at }, span);
    if (p && ours(p) && !checked.has(`${p.file}:${p.line}`)) unchecked.set(`${p.file}:${p.line}`, p);
  }
  // (but where `untested` is written: the rule a test is, not one)
  for (const p of unchecked.values()) {
    const line = readFileSync(p.file, 'utf8').split('\n')[p.line - 1]?.trim() ?? '';
    if (line.includes('^untested')) continue;
    errors++; console.log(`NOT RUN ${shown(p)}  ${line}`);
  }
  for (const span of run.unread) { const p = located({ input, at }, span); if (!ours(p)) continue; errors++; console.log(`ERROR   ${shown(p)}  Nothing reads this.`); }
  for (const { message, at: span } of run.said ?? []) { const p = span && located({ input, at }, span); if (p && !ours(p)) continue; console.log(`SAID    ${shown(p)}  ${message}`); }
  if (run.error) { errors++; console.log(`ERROR   the reading did not finish: ${run.error}`); }
  console.log(`${passed} passed, ${failed} failed${errors ? `, ${errors} errors` : ''}${warnings ? `, ${warnings} warnings in tests` : ''} (revision ${revision()}, ${Date.now() - t0} ms)`);
  if (failed || errors) process.exitCode = 1;
}
// (how long a reading of the tests may take)
const TEST_MS = Number(process.env.RAY_TEST_MS ?? 600000);
if (!isMainThread && workerData?.tested) {
  // (a test runs fully: a budget far past the editor's, ETHER_TEST_FUEL)
  const { painted, unread, said, error } = await painting(workerData.tested.module, workerData.tested.text, Number(process.env.ETHER_TEST_FUEL ?? 2000000000), 'full', workerData.tested.from);
  parentPort.postMessage({ painted, unread, said, error });
}

export const help = () => [
  `${NAME} ${env.version}`,
  `Usage: ${env.command} [options] [file]`,
  'Options:',
  '  -h, --help     Print this help and exit.',
  '      --version  Print the version number.',
  '      --lsp      Serve the language server (LSP) over stdio.',
  '      --test     Run the tests: the entrypoint\'s, or those in the files given; each passed or failed, where it is.',
  '      --test-all Run the tests of every file the entrypoint includes (Ray.ray, Number.ray, …), as one run.',
  '      --build    Write the next revision (.entrypoint.(N+1).wasm), written by the latest, checked to write itself.',
  '  -v, --verbose  Say how long compiling took.',
  '  file           Compile the file with the latest revision, then run it: what its main answers.',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  const flag = (...names) => argv.some((a) => names.includes(a));
  if (flag('-h', '--help')) return console.log(help());
  if (flag('--version')) return console.log(env.version.toSemver({ scheme: true }));
  if (flag('--lsp')) return (await import('./.entrypoint.lsp.mjs')).serve({ env, STACK_MB });
  if (flag('--build', 'build')) return build();
  if (flag('--test-all')) return test(included());
  if (flag('--test')) return test(argv.filter((a) => !a.startsWith('-')));
  const file = argv.find((a) => !a.startsWith('-'));
  if (!file) return console.log(help());
  const t0 = Date.now(), module = await compiled(readFileSync(engine()), readFileSync(file, 'utf8'));
  const answer = await run(module);
  if (flag('-v', '--verbose')) console.error(`${file}: ${module.length} bytes (revision ${revision()}, ${Date.now() - t0} ms)`);
  console.log(answer);
}

// (the stack a reading thread is given: reading no longer goes deep, so what a thread has)
export const STACK_MB = 512;
export const start = (argv = process.argv.slice(2)) => main(argv);
if (isMainThread && (import.meta.main || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href))) await start();
