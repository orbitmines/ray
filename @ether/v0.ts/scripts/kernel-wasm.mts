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
const calls: string[] = [];
let cells: string[] = [];
const operand = (x: number) => x >= 0 ? cells[x] : `=${p.constants[-1 - x]}`;
for (let k = 0; k < p.length; k++) {
  const [t, c, into, a, b] = p.at(k);
  for (const label of labels.get(k) ?? []) calls.push(`wj_label(${quoted(label)})`);
  if (t === -2) {
    cells = p.cells.get(k)!;
    const name = [...p.names].find(([, v]) => v === k)![0];
    calls.push(`wj_begin(${quoted(name)}, [${cells.slice(0, a).map(quoted).join(', ')}])`);
    continue;
  }
  calls.push(`wj_statement(${[targets.get(k)!, operand(c), into < 0 ? '-' : cells[into], operand(a), operand(b)].map(quoted).join(', ')})`);
}

const ray = arg('--ray');
if (ray) writeFileSync(ray, calls.join('\n') + `\nwj_module(${pages})\n`);
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
