import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Jmp, Ray, jmp_of } from '../src/language.ts';

// The kernel's JMP as `jmp_of` writes it from `kernel.ts`, a line for each thing it does, before targets become places: what
// `kernel.ray` writes, reading the same file. `--check <file>`: that file against it, where they first differ.
// (a context `& name params`, a label `: name`, a statement `target condition into a b`: a cell by its name, a constant `=n`,
// no cell `-`; `--source <file>`: another file written as the kernel is, not checked against the kernel)
const given = process.argv.indexOf('--source');
const file = given < 0 ? new URL('../src/kernel.ts', import.meta.url) : process.argv[given + 1];
const source = transformSync(readFileSync(file, 'utf8'), { loader: 'ts' }).code;
const fresh = () => { const p = new Jmp(); p.host('debug', 4); p.host('compiled', 4); p.host('told', 4); return p; };
const p = jmp_of(source.slice(source.indexOf('function kernel(')), fresh(), { DEBUG: 0, LOOP_LIMIT: 0 });
const unlinked = (p as unknown as { unlinked: [number, string, string][] }).unlinked;
const targets = new Map(unlinked.map(([k, name]) => [k, name]));
const labels = new Map<number, string[]>();
for (const [name, k] of p.names) { const at = name.indexOf('.'); if (at >= 0) labels.set(k, [...labels.get(k) ?? [], name.slice(at + 1)]); }
const lines: string[] = [];
let cells: string[] = [];
const operand = (x: number) => x >= 0 ? cells[x] : `=${p.constants[-1 - x]}`;
for (let k = 0; k < p.length; k++) {
  const [t, c, into, a, b] = p.at(k);
  for (const label of labels.get(k) ?? []) lines.push(`: ${label}`);
  if (t === -2) { cells = p.cells.get(k)!; lines.push(['&', [...p.names].find(([, v]) => v === k)![0], ...cells.slice(0, a)].join(' ')); continue; }
  lines.push([targets.get(k), operand(c), into < 0 ? '-' : cells[into], operand(a), operand(b)].join(' '));
}

const reference = Ray.program(0), linked = (q: Jmp) => q.link().code;
const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
if (given < 0 && (!same(linked(p), linked(reference)) || !same(p.constants, reference.constants))) throw new Error('kernel.ts read by jmp_of is not the kernel Ray.program builds');

const at = process.argv.indexOf('--check');
if (at < 0) { process.stdout.write(lines.join('\n') + '\n'); process.exit(0); }
const written = readFileSync(process.argv[at + 1], 'utf8').split('\n').filter(l => l.length);
let context = '';
for (let k = 0; k < Math.max(lines.length, written.length); k++) {
  if (lines[k]?.startsWith('& ')) context = lines[k];
  if (lines[k] === written[k]) continue;
  console.log(`differs at line ${k + 1} (${context}):\n  jmp_of:     ${lines[k] ?? '(nothing)'}\n  kernel.ray: ${written[k] ?? '(nothing)'}`);
  process.exit(1);
}
console.log(`the same: ${lines.length} lines, ${lines.filter(l => l.startsWith('& ')).length} contexts`);
