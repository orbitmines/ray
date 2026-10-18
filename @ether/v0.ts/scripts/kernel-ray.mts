import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The kernel's JMP, written by Ray reading `kernel.ts` (`kernel.ray`): its functions in ranges of about `--lines` lines (250),
// each range read by a run of its own (every run reads the kernel's constants, then writes its range's functions), `--jobs`
// of them at once; their lines one after another, as one run reading it all writes them. `scripts/kernel-jmp.mts --check`
// holds them against `jmp_of`'s.
const option = (name: string, otherwise: number) => { const at = process.argv.indexOf(name); return at < 0 ? otherwise : Number(process.argv[at + 1]); };
const budget = option('--lines', 250), jobs = option('--jobs', Math.min(8, Math.max(1, cpus().length >> 1)));
const src = fileURLToPath(new URL('../src/', import.meta.url)), root = fileURLToPath(new URL('../', import.meta.url));
const lines = readFileSync(join(src, 'kernel.ts'), 'utf8').split('\n');
const starts = lines.flatMap((line, k) => /^  function \w+\(/.test(line) ? [k] : []);
const end = (k: number) => k + 1 < starts.length ? starts[k + 1] : lines.length;
const ranges: [number, number][] = [];
for (let first = 0; first < starts.length;) {
  let until = first + 1;
  while (until < starts.length && end(until) - starts[first] <= budget) until++;
  ranges.push([first, until]);
  first = until;
}

const dir = mkdtempSync(join(tmpdir(), 'kernel-ray-'));
const runs = ranges.map(([from, until], k) => {
  writeFileSync(join(dir, `range-${k}.ray`), `kjs.from = ${from}\nkjs.until = ${until}\n`);
  const run = join(dir, `run-${k}.ray`);
  writeFileSync(run, [join(src, 'kernel.ray'), join(dir, `range-${k}.ray`), join(src, 'kernel.read.ray')].map(f => `include @${f}`).join('\n') + '\n');
  return run;
});

const log = /(DEFINED |ERROR |WARN |MEMORY |FAULT |PASS |INFO |SAID |CRASH |LOOP |READING |\(node:|\(Use `node)/;
const jmp = /^(& \S.*|: \S+|\S+ \S+ \S+ \S+ \S+)$/;
const written = (text: string) => {
  const out: string[] = [], said: string[] = [];
  let carry = '';
  for (const raw of text.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    if (raw.includes('src/kernel.ts:') && raw.startsWith('ERROR')) said.push(raw);
    if (!carry && (/^\s/.test(raw) || raw === '')) continue;
    const at = raw.search(log);
    if (at === 0) continue;
    const line = carry + (at > 0 ? raw.slice(0, at) : raw);
    if (at > 0) { carry = line; continue; }
    carry = '';
    if (jmp.test(line)) out.push(line);
  }
  return { out, said };
};
const read = (run: string) => new Promise<string>(done => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/language.ts', '--threads', '1', '../ray/bootstrap/.entrypoint.ray3', run], { cwd: root, env: { ...process.env, RAY_NOTESTS: '1', RAY_NOCACHE: '1', RAY_STATEMENT_MB: process.env.RAY_STATEMENT_MB ?? '1400' } });
  let text = '';
  child.stdout.on('data', d => { text += d; });
  child.stderr.on('data', d => { text += d; });
  child.on('close', () => done(text));
});

const results: string[][] = new Array(runs.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, runs.length) }, async () => {
  while (next < runs.length) {
    const k = next++, { out, said } = written(await read(runs[k]));
    results[k] = out;
    process.stderr.write(`functions ${ranges[k][0]} to ${ranges[k][1] - 1}: ${out.filter(l => l.startsWith('& ')).length} written${said.length ? `, ${said.length} not read: ${said[0].slice(0, 160)}` : ''}\n`);
  }
}));
process.stdout.write(results.flat().join('\n') + '\n');
