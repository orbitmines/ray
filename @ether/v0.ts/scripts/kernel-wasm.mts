import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { Jmp, jmp_of, module_bytes } from '../src/language.ts';

// The kernel's module written by Ray (`src/wasm.ray`, SH4) from the JMP `jmp_of` writes for `kernel.ts` (or `--source <file>`
// written as the kernel is): `--ray <file>` writes the Ray program giving the writer that JMP, a line a call, and `--bytes
// <file>` the module `module_bytes` writes for it, a byte a number; `--check <file>` holds what Ray wrote against it (run as
// `--write=<file>.wasm --value=wasm.module_written ../ray/bootstrap/.entrypoint.ray3 <a file including src/wasm.ray, then that>`).
const arg = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const file = arg('--source') ?? new URL('../src/kernel.ts', import.meta.url);
const pages = Number(arg('--pages') ?? 16);
const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText;
const fresh = () => { const p = new Jmp(); p.host('debug', 4); p.host('compiled', 4); p.host('told', 4); return p; };
const p = jmp_of(source.slice(source.indexOf('function kernel(')), fresh(), { DEBUG: 0, LOOP_LIMIT: 0 });

// (its lines as kernel-jmp.mts writes them, before targets become places: a context, a label, a statement)
const unlinked = (p as unknown as { unlinked: [number, string, string][] }).unlinked;
const targets = new Map(unlinked.map(([k, name]) => [k, name]));
const labels = new Map<number, string[]>();
for (const [name, k] of p.names) { const at = name.indexOf('.'); if (at >= 0) labels.set(k, [...labels.get(k) ?? [], name.slice(at + 1)]); }
const quoted = (x: string) => '`' + x + '`';
const calls: string[] = [], cells_at = new Map<number, string[]>();
let cells: string[] = [];
const operand = (x: number) => x >= 0 ? cells[x] : `=${p.constants[-1 - x]}`;
for (let k = 0; k < p.length; k++) {
  const [t, c, into, a, b] = p.at(k);
  for (const label of labels.get(k) ?? []) calls.push(`wj_label(${quoted(label)})`);
  if (t === -2) {
    cells = p.cells.get(k)!;
    const name = [...p.names].find(([, v]) => v === k)![0];
    cells_at.set(calls.length, cells);
    calls.push(`wj_begin(${quoted(name)}, [${cells.slice(0, a).map(quoted).join(', ')}])`);
    continue;
  }
  calls.push(`wj_statement(${[targets.get(k)!, operand(c), into < 0 ? '-' : cells[into], operand(a), operand(b)].map(quoted).join(', ')})`);
}

const ray = arg('--ray');
if (ray) writeFileSync(ray, calls.join('\n') + `\nwj_module(${pages})\n`);

// (`--parts <dir> --module <file>`: the same, in parts each read by a run of its own (`--jobs` at once), as no run holds the
// whole kernel: every part given each context by name and how many it takes, then its own contexts, about `--statements`
// lines of them (1500), its bodies written; a context of more than `--slice` statements (1500) written in slices, each a run
// given its cells, its own statements and, of the rest, what its blocks and jumps need (its labels, jumps and returns, and one
// statement skipped for each run of the others), its body's size written after them; a part of none, the sections around them)
const parts = arg('--parts');
if (parts) {
  const { spawn } = await import('node:child_process'), { mkdirSync } = await import('node:fs'), { join } = await import('node:path'), { cpus } = await import('node:os');
  const src = new URL('../src/', import.meta.url).pathname, root = new URL('../', import.meta.url).pathname;
  const size = Number(arg('--statements') ?? 1500), slice = Number(arg('--slice') ?? 1500), jobs = Number(arg('--jobs') ?? Math.min(8, Math.max(1, cpus().length >> 1)));
  mkdirSync(parts, { recursive: true });
  const begun = calls.flatMap((c, k) => c.startsWith('wj_begin(') ? [k] : []);
  const announced = begun.map(k => calls[k].replace(/^wj_begin\((`[^`]*`), \[(.*)\]\)$/, (_, name, params) => `wj_context(${name}, ${params ? params.split(', ').length : 0})`));
  const end = (j: number) => j < begun.length ? begun[j] : calls.length;
  const given = (s: number, e: number) => calls.slice(s, e).filter(c => c.startsWith('wj_statement(')).length;
  const aim = (c: string) => c.startsWith('wj_statement(') ? c.slice(14, c.indexOf('`', 14)) : undefined;
  type Group = { s: number, e: number, slices?: [number, number][] };
  const groups: Group[] = [];
  for (let first = 0; first < begun.length;) {
    if (given(begun[first], end(first + 1)) > slice) {
      const s = begun[first], e = end(first + 1), labels = new Set(calls.slice(s, e).flatMap(c => c.startsWith('wj_label(') ? [c.slice(10, -2)] : []));
      const slices: [number, number][] = [];
      let from = s + 1;
      for (let n = 0, k = s + 1; k < e; k++) {
        const a = aim(calls[k]);
        if (a === undefined) continue;
        if (++n >= slice && (labels.has(a) || a === '&.caller') && given(k + 1, e) > 0) { slices.push([from, k + 1]); from = k + 1; n = 0; }
      }
      slices.push([from, e]);
      groups.push({ s, e, slices });
      first++;
      continue;
    }
    let until = first + 1;
    while (until < begun.length && given(begun[first], end(until + 1)) <= size && given(begun[until], end(until + 1)) <= slice) until++;
    groups.push({ s: begun[first], e: end(until) });
    first = until;
  }
  // (a slice of the context from s to e: the lines from a to b, the others what its blocks need)
  const sliced = (s: number, e: number, a: number, b: number) => {
    const labels = new Set(calls.slice(s, e).flatMap(c => c.startsWith('wj_label(') ? [c.slice(10, -2)] : []));
    const lines = [calls[s], `wj_cells([${cells_at.get(s)!.map(quoted).join(', ')}])`];
    for (let k = s + 1, left = false; k < e; k++) {
      if (k === a) lines.push('wj_slice_begins(0)');
      const x = aim(calls[k]);
      if ((k >= a && k < b) || x === undefined || labels.has(x) || x === '&.caller') { lines.push(calls[k]); left = false; }
      else if (!left) { lines.push('wj_statement(`&.skipped`, `=0`, `-`, `=0`, `=0`)'); left = true; }
      if (k === b - 1) lines.push('wj_slice_ends(0)');
    }
    return lines;
  };
  const program = (name: string, lines: string[]) => { const file = join(parts, `${name}.ray`), run = join(parts, `run-${name}.ray`); writeFileSync(file, [...announced, ...lines].join('\n') + '\n'); writeFileSync(run, `include @${join(src, 'wasm.ray')}\ninclude @${file}\n`); return run; };
  const read = (run: string, out: string, value: string) => new Promise<string>(done => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/language.ts', '--threads', '1', `--write=${out}`, `--value=${value}`, '../ray/bootstrap/.entrypoint.ray3', run], { cwd: root, env: { ...process.env, RAY_NOTESTS: '1', RAY_NOCACHE: '1' } });
    let text = ''; child.stdout.on('data', d => { text += d; }); child.stderr.on('data', d => { text += d; }); child.on('close', () => done(text));
  });
  const runs = groups.flatMap(({ s, e, slices }, k) => slices ? slices.map(([a, b], i) => ({ name: `part-${k}-${i}`, lines: b - a, run: program(`part-${k}-${i}`, sliced(s, e, a, b)) })) : [{ name: `part-${k}`, lines: e - s, run: program(`part-${k}`, calls.slice(s, e)) }]);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, runs.length) }, async () => {
    while (next < runs.length) {
      const { name, lines, run } = runs[next++], text = (await read(run, join(parts, `${name}.bin`), 'wasm.written_bodies(0)')).replace(/\x1b\[[0-9;]*m/g, '');
      const wrote = text.match(/WROTE \S+ \S*\((\d+) bytes/)?.[1], fault = text.split('\n').find(l => l.startsWith('ERROR') && l.includes(parts));
      console.error(`${name} (${lines} lines): ${wrote ?? 'no'} bytes${fault ? `; ${fault.slice(0, 160)}` : ''}`);
    }
  }));
  const around = program('around', []);
  const bodies = Buffer.concat(await Promise.all(groups.map(async ({ slices }, k) => {
    if (!slices) return readFileSync(join(parts, `part-${k}.bin`));
    const body = Buffer.concat(slices.map((_, i) => readFileSync(join(parts, `part-${k}-${i}.bin`))));
    await read(around, join(parts, `part-${k}-size.bin`), `wasm.sized_as(${body.length})`);
    return Buffer.concat([readFileSync(join(parts, `part-${k}-size.bin`)), body]);
  })));
  const [head, tail] = await Promise.all([['head', `wasm.before_bodies(${pages}, ${bodies.length})`], ['tail', 'wasm.after_bodies(0)']].map(async ([name, value]) => { await read(around, join(parts, `${name}.bin`), value); return readFileSync(join(parts, `${name}.bin`)); }));
  const module = arg('--module') ?? join(parts, 'kernel.wasm');
  writeFileSync(module, Buffer.concat([head, bodies, tail]));
  console.error(`wrote ${module}: ${head.length + bodies.length + tail.length} bytes`);
}
const bytes = arg('--bytes'), check = arg('--check');
if (bytes || check) {
  const reference = [...module_bytes(p, pages)];
  if (bytes) writeFileSync(bytes, reference.join(' ') + '\n');
  if (check) {
    // (a `.wasm` as its bytes, what `--write --value=wasm.module_written` writes; else a byte a number)
    const written = check.endsWith('.wasm') ? [...readFileSync(check)] : readFileSync(check, 'utf8').split(/\s+/).filter(x => x.length).map(Number);
    const at = reference.findIndex((v, i) => written[i] !== v);
    if (at < 0 && written.length === reference.length) console.log(`the same: ${reference.length} bytes`);
    else { const k = at < 0 ? reference.length : at; console.log(`differs at byte ${k} of ${reference.length} (Ray wrote ${written.length}):\n  module_bytes: ${reference.slice(Math.max(0, k - 8), k + 16).join(' ')}\n  wasm.ray:     ${written.slice(Math.max(0, k - 8), k + 16).join(' ')}`); process.exit(1); }
  }
}
