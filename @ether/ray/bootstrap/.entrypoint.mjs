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
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Worker, isMainThread, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

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

// (what a revision reads: lines that are only a comment left out; Expression.ray up to where its parser is set (its tests
// after), then the compiler)
export const PAGES = 32000;
export const uncommented = (text) => text.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const reader = () => { const t = readFileSync(bootstrap('Expression.ray'), 'utf8'), end = 'level set_parser (parser)\n'; return t.slice(0, t.indexOf(end) + end.length); };
export const source = () => uncommented([reader(), ...['Compiled.ray', 'Low.ray', 'High.ray', 'compile.ray'].map((f) => readFileSync(wasm(f), 'utf8'))].join(''));

// (a revision, given a program: its input the header Expression reads first, the program and the runtime, apart by a 0;
// what it writes, from out_base on)
export const instance = async (module) => {
  const memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES });
  const { instance } = await WebAssembly.instantiate(module, { m: { memory } });
  return { exports: instance.exports, memory, u8: new Uint8Array(memory.buffer), i32: new Int32Array(memory.buffer) };
};
export const given = (it, program, runtime = readFileSync(wasm('runtime.ray'), 'utf8')) => {
  const input = Buffer.from([readFileSync(wasm('header.ray'), 'utf8'), uncommented(program), runtime].join('\0'));
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
  const was = readFileSync(bootstrap(name)), text = source();
  const next = await compiled(was, text);
  if (next.length === was.length && next.every((x, i) => x === was[i])) { console.log(`${name} is what the source writes: nothing to build`); return; }
  const again = await compiled(next, text);
  if (again.length !== next.length || again.some((x, i) => x !== next[i])) { console.log(`revision ${n + 1} does not write itself: not kept`); process.exitCode = 1; return; }
  writeFileSync(bootstrap(`.entrypoint.${n + 1}.wasm`), next);
  console.log(`.entrypoint.${n + 1}.wasm: ${next.length} bytes, written by revision ${n}, writes itself`);
}

export const help = () => [
  `${NAME} ${env.version}`,
  `Usage: ${env.command} [options] [file]`,
  'Options:',
  '  -h, --help     Print this help and exit.',
  '      --version  Print the version number.',
  '      --lsp      Serve the language server (LSP) over stdio.',
  '      --build    Write the next revision (.entrypoint.(N+1).wasm), written by the latest, checked to write itself.',
  '  -v, --verbose  Say how long compiling took.',
  '  file           Compile the file with the latest revision, then run it: what its main answers.',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  const flag = (...names) => argv.some((a) => names.includes(a));
  if (flag('-h', '--help')) return console.log(help());
  if (flag('--version')) return console.log(env.version.toSemver({ scheme: true }));
  if (flag('--lsp')) return (await import('./.entrypoint.lsp.mjs')).serve();
  if (flag('--build', 'build')) return build();
  const file = argv.find((a) => !a.startsWith('-'));
  if (!file) return console.log(help());
  const t0 = Date.now(), module = await compiled(readFileSync(engine()), readFileSync(file, 'utf8'));
  const answer = await run(module);
  if (flag('-v', '--verbose')) console.error(`${file}: ${module.length} bytes (revision ${revision()}, ${Date.now() - t0} ms)`);
  console.log(answer);
}

// (its reading goes deep: under Node it runs in a thread with room for it; Deno is given it as a V8 flag when compiled)
export const STACK_MB = 512;
export async function start(argv = process.argv.slice(2)) {
  if (typeof Deno !== 'undefined' || !isMainThread || argv.includes('--lsp')) return main(argv);
  await new Promise((done) => new Worker(fileURLToPath(import.meta.url), { workerData: { ether: argv }, resourceLimits: { stackSizeMb: STACK_MB } })
    .on('error', (e) => { console.error(e); process.exitCode = 1; }).on('exit', (code) => { if (code) process.exitCode = code; done(); }));
}
if (!isMainThread && workerData?.ether) await main(workerData.ether);
else if (import.meta.main || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) await start();
