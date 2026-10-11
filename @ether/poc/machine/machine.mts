// Each corpus function's bytes read by `$/x86/X86.ray`. MC2 (`rewrite`): written back, byte for byte its bytes. MC3
// (`assembly`): its text, line for line objdump's. MC4 (`lift`): the Ray function it lifts to, defined and run on the N3
// inputs, answers what the C source computes. `lift` also writes each lifted function to `out/lifted/`. MC5 (`rust`): the
// Rust the interop writer writes from it, with the C ABI, to `out/rust/`.
const { booted } = await import('../deflate/boot.mts');
const fs = await import('node:fs'), path = await import('node:path');
const { program } = await booted();
const here = path.dirname(new URL(import.meta.url).pathname), corpus = path.join(here, 'corpus'), mode = process.argv[2];
const g = { node: program.global }, none = program.run('None', g);
const run = (text: string) => { program.steps = 0; return program.run(text, g); };
const listed = (bytes: Uint8Array) => { const list = run('Listing.new'); for (const byte of bytes) run(program.written(list) + '.append(' + byte + ')'); return list; };
const values_of = (list: unknown): unknown[] | undefined => {
  if (typeof list !== 'object' || list === null || run(program.written(list) + '.listing') !== run('true')) return undefined;
  const values: unknown[] = [];
  for (let at = run(program.written(list) + '.head'); at !== none && at !== undefined; at = run(program.written(at) + '.next')) values.push(run(program.written(at) + '.value'));
  return values;
};
const ray_number = (value: number) => value > 0 ? String(value) : '(1 - ' + (1 - value) + ')';
type Tree = string | [string, Tree, Tree];
const computed = (tree: Tree, values: Record<string, number>): number => {
  if (typeof tree === 'string') return tree in values ? values[tree] : Number(tree);
  const [operator, left, right] = tree, a = computed(left, values), b = computed(right, values);
  return operator === '+' ? a + b : operator === '-' ? a - b : a * b;
};
const functions: { name: string, type: string, parameters: string[], tree: Tree }[] = JSON.parse(fs.readFileSync(path.join(corpus, 'corpus.json'), 'utf8'));
const [from, to] = (process.env.RANGE ?? '1-' + functions.length).split('-').map(Number);
const out = path.join(here, 'out', 'lifted'), rusts = path.join(here, 'out', 'rust');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(rusts, { recursive: true });
let failed = 0, seed = 1;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const function_ of functions.slice(from - 1, to)) {
  const { name } = function_, bytes = fs.readFileSync(path.join(corpus, name + '.bin')), started = performance.now();
  let held = false, said = '';
  try {
    const read = run('X86.Function.from(' + program.written(listed(bytes)) + ')');
    if (mode === 'rewrite') {
      const written = values_of(run(program.written(read) + '.written'));
      held = !!written && Buffer.from(written as number[]).equals(bytes);
      said = written ? `${written.length} bytes, not the same` : 'not read';
    } else if (mode === 'assembly') {
      const lines = values_of(run(program.written(read) + '.assembly')), expected = fs.readFileSync(path.join(corpus, name + '.s'), 'utf8').trim().split('\n');
      held = !!lines && lines.join('\n') === expected.join('\n');
      said = lines ? (lines as string[]).find((line, index) => line !== expected[index]) + ' | objdump: ' + expected.find((line, index) => line !== (lines as string[])[index]) : 'not read';
    } else if (mode === 'rust') {
      const lifted = run('X86.lift(' + program.written(read) + ', "' + name + '", [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '], ' + (function_.type === 'long' ? 64 : 32) + ')');
      const rust = typeof lifted === 'string' ? run('rust_function_c_abi(' + JSON.stringify(lifted) + ')') : undefined;
      held = typeof rust === 'string';
      if (held) fs.writeFileSync(path.join(rusts, name + '.rs'), rust + '\n');
      said = typeof lifted === 'string' ? 'no Rust for ' + lifted : 'not lifted';
    } else if (mode === 'lift') {
      const width = function_.type === 'long' ? 64 : 32;
      const lifted = run('X86.lift(' + program.written(read) + ', "' + name + '", [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '], ' + width + ')');
      if (typeof lifted !== 'string') said = 'not lifted';
      else {
        fs.writeFileSync(path.join(out, name + '.ray'), lifted + '\n');
        run(lifted);
        const wrong: string[] = [];
        for (let i = 0; i < 3; i++) {
          const values = Object.fromEntries(function_.parameters.map(p => [p, Math.floor(random() * 101) - 50]));
          const answer = run(name + '(' + function_.parameters.map(p => ray_number(values[p])).join(', ') + ')'), expected = computed(function_.tree, values);
          if (answer !== expected) wrong.push(`${name}(${function_.parameters.map(p => values[p]).join(', ')}) = ${JSON.stringify(answer)}, C: ${expected}`);
        }
        held = !wrong.length;
        said = wrong.join('; ');
      }
    }
  } catch (error: any) { said = 'threw ' + String(error?.message).slice(0, 80); }
  if (!held) failed++;
  console.log(held ? 'ok  ' : 'FAIL', name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
}
process.exitCode = failed ? 1 : 0;
