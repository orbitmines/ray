// [ENGINE=x.wasm] node test/all.mjs [FUZZ]: the native engine (its latest revision, or ENGINE) against the reading model, event by event: the assembler, the
// small languages, .entrypoint.ray3, .entrypoint.ray3 followed by each library file and project, then FUZZ random setups
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';
const here = (p) => fileURLToPath(new URL(p, import.meta.url)), ether = here('../../../');
const dir = mkdtempSync(join(tmpdir(), 'ray-parity-')), files = [here('../bootstrap.ray')];
const header = '!language   { }   {LHS} => {RHS}\n\n';
const small = {
  hello: '{LHS} => {RHS} => x\nhello => external .\nhello', twice: '{LHS} => {RHS} => x\nhello => external .\nhello\nhello',
  caller: '{LHS} => {RHS} => x\nhello => external &\nhello', hole: '{LHS} => {RHS} => x\nsay {x} => external .\nsay hi\nsay there',
  calls: '{LHS} => {RHS} => x\na => external .\nb => a\nb\na', nested: '{lhs} => {rhs} => {\n  {lhs} => {rhs}\n}\nouter =>\n  inner => external .\n  inner\nouter',
};
for (const [n, b] of Object.entries(small)) { writeFileSync(join(dir, n + '.ray'), header + b); files.push(join(dir, n + '.ray')); }
writeFileSync(join(dir, 'brackets.ray'), '!language   ( )   (LHS) := (RHS)\n\n(LHS) := (RHS) := x\nmake := external .\nmake'); files.push(join(dir, 'brackets.ray'));
const entry = join(ether, 'ray/bootstrap/.entrypoint.ray3'); files.push(entry);
const library = [...readdirSync(join(ether, 'ray/bootstrap')).filter((f) => f.endsWith('.ray') && !f.startsWith('.')).map((f) => join(ether, 'ray/bootstrap', f)), ...readdirSync(join(ether, '$')).filter((f) => f.endsWith('.project.ray')).map((f) => join(ether, '$', f))];
for (const f of library) { const n = join(dir, 'with-' + f.split('/').pop()); writeFileSync(n, Buffer.concat([readFileSync(entry), Buffer.from('\n\n'), readFileSync(f)])); files.push(n); }
let failed = false;
const run = (script, args) => { try { process.stdout.write(execFileSync(process.execPath, ['--max-old-space-size=6000', here(script), ...args], { env: { ...process.env, EVCAP: '200000' }, maxBuffer: 1 << 26 }).toString().split('\n').filter((l) => l && !l.startsWith('SAME')).map((l) => l + '\n').join('')); } catch (e) { failed = true; process.stdout.write(String(e.stdout ?? e)); } };
const { engine } = await import('../../../ray/bootstrap/.entrypoint.mjs');
const eng = process.env.ENGINE ?? engine();
run('parity.mjs', [eng, ...files]);
console.log(`${files.length} files read`);
run('fuzz.mjs', [eng, process.argv[2] ?? '500', '1']);
process.exit(failed ? 1 : 0);
