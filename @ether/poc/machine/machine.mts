// Each corpus function's bytes read by `$/x86/X86.ray`. MC2 (`rewrite`): written back, byte for byte its bytes. MC3
// (`assembly`): its text, line for line objdump's. MC4 (`lift`): the Ray function it lifts to, defined and run on the N3
// inputs, answers what the C source computes. `lift` also writes each lifted function to `out/lifted/`. MC5 (`rust`): the
// Rust the interop writer writes from it, with the C ABI, to `out/rust/`. MC6 (`assemble`): objdump's text read as Ray code,
// each line in `X86.Assembly`, and written: byte for byte the bytes gcc made. MC7 (`compile`): the C source read into Ray and
// written as machine code through `X86.ray`, to `out/compiled/`; (`inverse`, with `BYTES=out/compiled`): those bytes read
// back and lifted, the very function the C source was read to (`as` the machine's `wrapped`).
const { booted } = await import('../deflate/boot.mts');
const fs = await import('node:fs'), path = await import('node:path');
const { program } = await booted();
const here = path.dirname(new URL(import.meta.url).pathname), corpus = path.join(here, process.env.CORPUS ?? 'corpus'), modes = process.argv[2].split(',');
const g = { node: program.global }, none = program.run('None', g);
const run = (text: string) => { program.steps = 0; return program.run(text, g); };
const listed = (bytes: Uint8Array) => { const list = run('Listing.new'); for (const byte of bytes) run(program.written(list) + '.append(' + byte + ')'); return list; };
const values_of = (list: unknown): unknown[] | undefined => {
  if (typeof list !== 'object' || list === null || run(program.written(list) + '.listing') !== run('true')) return undefined;
  const values: unknown[] = [];
  for (let at = run(program.written(list) + '.head'); at !== none && at !== undefined; at = run(program.written(at) + '.next')) values.push(run(program.written(at) + '.value'));
  return values;
};
const ray_number = (value: number) => value > 0 ? String(value) : '((1 - ' + (1 - value) + ') as Integer)';
type Tree = string | [string, Tree, Tree];
const computed = (tree: Tree, values: Record<string, number>): number => {
  if (typeof tree === 'string') return tree in values ? values[tree] : Number(tree);
  const [operator, left, right] = tree, a = computed(left, values), b = computed(right, values);
  return operator === '+' ? a + b : operator === '-' ? a - b : a * b;
};
const functions: { name: string, type: string, parameters: string[], tree: Tree }[] = JSON.parse(fs.readFileSync(path.join(corpus, 'corpus.json'), 'utf8'));
const [from, to] = (process.env.RANGE ?? '1-' + functions.length).split('-').map(Number);
const out = path.join(here, 'out', 'lifted'), rusts = path.join(here, 'out', 'rust'), compiled = path.join(here, 'out', 'compiled');
fs.mkdirSync(compiled, { recursive: true });
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(rusts, { recursive: true });
let failed = 0, seed = 1;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const mode of modes) for (const function_ of functions.slice(from - 1, to)) {
  const { name } = function_, bytes = fs.readFileSync(path.join(process.env.BYTES ? path.resolve(process.env.BYTES) : corpus, name + '.bin')), started = performance.now();
  let held = false, said = '';
  try {
    if (mode === 'compile') {
      const ray = run('c_ray(' + JSON.stringify(fs.readFileSync(path.join(corpus, name + '.c'), 'utf8')) + ')');
      const lines = typeof ray === 'string' ? values_of(run('X86.compiled(' + JSON.stringify(ray.slice(ray.indexOf(') => ') + 5)) + ', ' + (function_.type === 'long' ? 64 : 32) + ', [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '])')) as string[] | undefined : undefined;
      let written: number[] | undefined;
      if (lines) {
        lines.forEach((line, index) => run('assembled_' + index + ' := X86.Assembly reading {\n  ' + line + '\n}'));
        run('function_assembled := X86.Function([' + lines.map((_, index) => 'assembled_' + index).join(', ') + '])');
        written = values_of(run('function_assembled.written')) as number[] | undefined;
      }
      held = !!written && written.length > 0;
      if (held) { fs.writeFileSync(path.join(compiled, name + '.bin'), Buffer.from(written!)); fs.writeFileSync(path.join(compiled, name + '.s'), lines!.join('\n') + '\n'); }
      said = typeof ray !== 'string' ? 'not read from C' : lines ? 'not assembled' : 'not lowered: ' + ray;
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(written?.length ?? '-').padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
    if (mode === 'inverse') {
      const ray = run('c_ray(' + JSON.stringify(fs.readFileSync(path.join(corpus, name + '.c'), 'utf8')) + ')');
      const read = run('X86.Function.from(' + program.written(listed(bytes)) + ')');
      const lifted = run('X86.lift(' + program.written(read) + ', "' + name + '", [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '], ' + (function_.type === 'long' ? 64 : 32) + ')');
      const expected = typeof ray === 'string' ? ray.replaceAll(' as Int', ' wrapped Int') : undefined;
      held = typeof lifted === 'string' && lifted === expected;
      said = `lifted ${lifted} | from C ${expected}`;
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
    if (mode === 'compile_flow') {
      const read = run('X86.Function.from(' + program.written(listed(bytes)) + ')');
      const compiled_function = run('X86.compiled_flow(' + program.written(read) + ', [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '], ' + (function_.type === 'long' ? 64 : 32) + ')');
      const written = compiled_function && typeof compiled_function === 'object' ? values_of(run(program.written(compiled_function) + '.written')) as number[] | undefined : undefined;
      held = !!written && written.length > 0;
      const into = process.env.CORPUS === 'corpus_memory' ? 'compiled_memory' : 'compiled_flow';
      if (held) { fs.mkdirSync(path.join(here, 'out', into), { recursive: true }); fs.writeFileSync(path.join(here, 'out', into, name + '.bin'), Buffer.from(written!)); }
      said = 'not compiled';
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(written?.length ?? '-').padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
    if (mode === 'memory_flow') {
      const read = run('X86.Function.from(' + program.written(listed(bytes)) + ')');
      const lifted = run('X86.lift_memory_flow(' + program.written(read) + ', "' + name + '", ["p", "n", "k"], 64)');
      const wrong: string[] = [];
      if (typeof lifted !== 'string') said = 'not lifted';
      else {
        fs.writeFileSync(path.join(out, name + '.memory.ray'), lifted + '\n');
        run(lifted);
        const size = ({ 'int': 4, 'long': 8, 'unsigned char': 1 } as Record<string, number>)[function_.element], signed = function_.element !== 'unsigned char';
        const asked = fs.readFileSync(path.join(corpus, 'inputs.txt'), 'utf8').trim().split('\n'), answers = fs.readFileSync(path.join(corpus, 'expected.txt'), 'utf8').trim().split('\n');
        asked.forEach((line, index) => {
          const [called, n, k, ...values] = line.split(' ');
          if (called !== name) return;
          const memory = new Array(192).fill(0);
          values.forEach((v, i) => { let x = BigInt.asUintN(8 * size, BigInt(v)); for (let b = 0; b < size; b++) { memory[64 + i * size + b] = Number(x & 255n); x >>= 8n; } });
          run('memory_' + index + ' := [' + memory.join(', ') + ']');
          const answer = run(name + '(memory_' + index + ', 64, ' + ray_number(Number(n)) + ', ' + ray_number(Number(k)) + ')');
          const after = String(run('memory_' + index + '.join(",")')).split(',').map(Number);
          const array = values.map((_, i) => { let x = 0n; for (let b = size - 1; b >= 0; b--) x = (x << 8n) | BigInt(after[64 + i * size + b]); return String(signed ? BigInt.asIntN(8 * size, x) : x); });
          const shown = String(answer) + ' |' + array.map(v => ' ' + v).join('');
          if (shown !== answers[index]) wrong.push(`${line} = ${typeof answer === 'object' ? 'a node' : shown}, gcc: ${answers[index]}`);
        });
        held = !wrong.length;
        said = wrong.slice(0, 3).join('; ');
      }
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
    if (mode === 'flow') {
      const read = run('X86.Function.from(' + program.written(listed(bytes)) + ')');
      const lifted = run('X86.lift_flow(' + program.written(read) + ', "' + name + '", [' + function_.parameters.map(p => '"' + p + '"').join(', ') + '], ' + (function_.type === 'long' ? 64 : 32) + ')');
      const wrong: string[] = [];
      if (typeof lifted !== 'string') said = 'not lifted';
      else {
        fs.writeFileSync(path.join(out, name + '.flow.ray'), lifted + '\n');
        run(lifted);
        const asked = fs.readFileSync(path.join(corpus, 'inputs.txt'), 'utf8').trim().split('\n'), answers = fs.readFileSync(path.join(corpus, 'expected.txt'), 'utf8').trim().split('\n');
        asked.forEach((line, index) => {
          const [called, ...values] = line.split(' ');
          if (called !== name) return;
          const answer = run(name + '(' + values.map(v => ray_number(Number(v))).join(', ') + ')');
          if (String(answer) !== answers[index]) wrong.push(`${name}(${values.join(', ')}) = ${typeof answer === 'object' ? 'a node' : String(answer)}, gcc: ${answers[index]}`);
        });
        held = !wrong.length;
        said = wrong.join('; ');
      }
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
    if (mode === 'assemble') {
      const lines = fs.readFileSync(path.join(corpus, name + '.s'), 'utf8').trim().split('\n');
      lines.forEach((line, index) => run('assembled_' + index + ' := X86.Assembly reading {\n  ' + line + '\n}'));
      run('function_assembled := X86.Function([' + lines.map((_, index) => 'assembled_' + index).join(', ') + '])');
      const written = values_of(run('function_assembled.written'));
      held = !!written && Buffer.from(written as number[]).equals(bytes);
      said = written ? `${Buffer.from(written as number[]).toString('hex')}, gcc: ${bytes.toString('hex')}` : 'not written';
      if (!held) failed++;
      console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
      continue;
    }
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
  console.log(held ? 'ok  ' : 'FAIL', mode.padEnd(8), name.padEnd(5), String(bytes.length).padStart(3), 'bytes', String(Math.round(performance.now() - started)).padStart(6), 'ms', held ? '' : said);
}
process.exitCode = failed ? 1 : 0;
