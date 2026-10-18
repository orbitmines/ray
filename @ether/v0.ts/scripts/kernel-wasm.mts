import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { Jmp, jmp_of, module_bytes } from '../src/language.ts';

// The kernel's module as `module_bytes` writes it from `jmp_of`'s JMP of `kernel.ts` (as `kernel-jmp.mts` reads it): what
// `module.ray` writes, from what `kernel.ray` reads of the same file. `--check <file>`: that file against it, where they first
// differ (the section, and in the code section the function); `--write <file>`: it, written. (`--source <file>`: another file
// written as the kernel is; `--pages n`: the memory it imports, 32768 pages.)
const option = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const file = option('--source') ?? new URL('../src/kernel.ts', import.meta.url), pages = Number(option('--pages') ?? 32768);
const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText;
const p = new Jmp(); p.host('debug', 4); p.host('compiled', 4); p.host('told', 4);
jmp_of(source.slice(source.indexOf('function kernel(')), p, { DEBUG: 0, LOOP_LIMIT: 0 });
const reference = module_bytes(p, pages);
const names = [...p.names].filter(([n]) => !n.includes('.')).sort((x, y) => x[1] - y[1]).map(([n]) => n);

const written = option('--write');
if (written) writeFileSync(written, reference);
const checked = option('--check');
if (!checked) { if (!written) console.log(`${reference.length} bytes, ${names.length} contexts`); process.exit(0); }

// (where a byte is: its section, and in the code section the function it is in)
const uleb = (b: Uint8Array, at: number): [number, number] => { let n = 0, shift = 0; for (;;) { const x = b[at++]; n |= (x & 0x7f) << shift; shift += 7; if (!(x & 0x80)) return [n >>> 0, at]; } };
const where = (b: Uint8Array, offset: number) => {
  for (let at = 8; at < b.length;) {
    const id = b[at], [size, body] = uleb(b, at + 1);
    if (offset < body + size) {
      if (id !== 10 || offset < body) return `section ${id}`;
      let [count, f] = uleb(b, body);
      for (let k = 0; k < count; k++) { const [n, start] = uleb(b, f); if (offset < start + n) return `function ${names[k]} (byte ${offset - start} of ${n})`; f = start + n; }
      return 'section 10';
    }
    at = body + size;
  }
  return 'past the end';
};
const ours = new Uint8Array(readFileSync(checked));
let k = 0;
while (k < ours.length && k < reference.length && ours[k] === reference[k]) k++;
if (k === ours.length && k === reference.length) {
  new WebAssembly.Module(ours);
  console.log(`the same: ${reference.length} bytes, ${names.length} contexts; a module`);
  // (`--call name --with 1,2`: one of its functions run, in memory of its own, the host's answering nothing)
  const called = option('--call');
  if (called) {
    const given = (option('--with') ?? '').split(',').filter(x => x).map(Number);
    const memory = new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true }), thread = new WebAssembly.Global({ value: 'i32', mutable: false }, 0);
    const h = { debug: () => 0, compiled: () => 0, told: () => 0 };
    const exports = new WebAssembly.Instance(new WebAssembly.Module(ours), { h, m: { memory, thread } }).exports as Record<string, (...x: number[]) => number>;
    console.log(`${called}(${given.join(', ')}) = ${exports[called](...given)}`);
  }
  process.exit(0);
}
console.log(`differs at byte ${k} of ${reference.length} (${ours.length} written), in ${where(reference, k)}: module_bytes ${[...reference.slice(k, k + 12)].join(' ')}, module.ray ${[...ours.slice(k, k + 12)].join(' ')}`);
process.exit(1);
