import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const SHIPPED = 'expression';
const UNABLE = 'the kernel cannot read test files';

const usage = `Usage: node scripts/contest.mjs [--kernels a,b,...] [--results DIR] [--jobs N] [--timeout S] [files...]
  Scores every kernel on the same test files (scripts/score.mjs --kernel K --out DIR/K.json), then prints a table
  and names the winner by passed claims. A file whose canaries fail counts no passed claims.
  --kernels  the kernels to score (default: ${SHIPPED} and every runner in scripts/kernels/)
  --results  where each kernel's score, its log and contest.json go (default: ${join(tmpdir(), 'ray-contest')})
  --shipped  a score of the shipped kernel on this same tree (score.mjs --out), used instead of scoring it again`;

function parseArgs(argv) {
  const options = { kernels: undefined, results: join(tmpdir(), 'ray-contest'), passed: [], files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kernels') options.kernels = argv[++i].split(',').filter(Boolean);
    else if (a === '--results') options.results = resolve(argv[++i]);
    else if (a === '--shipped') options.shipped = resolve(argv[++i]);
    else if (a === '--jobs' || a === '--timeout') options.passed.push(a, argv[++i]);
    else if (a === '--help' || a === '-h') { console.log(usage); process.exit(0); }
    else options.files.push(resolve(a));
  }
  return options;
}

function kernels() {
  const runners = readdirSync(join(pkg, 'scripts/kernels')).filter(f => f.endsWith('.mjs') && f !== 'kernel.mjs').map(f => f.slice(0, -'.mjs'.length)).sort();
  return [SHIPPED, ...runners];
}

function score(kernel, options) {
  const out = join(options.results, `${kernel}.json`), log = join(options.results, `${kernel}.log`);
  for (const stale of [out, log, join(options.results, `${kernel}.todo.md`)]) rmSync(stale, { force: true });
  const args = ['scripts/score.mjs', '--kernel', kernel, '--out', out, ...options.passed, ...options.files];
  return new Promise(done => {
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: pkg, stdio: ['ignore', 'pipe', 'pipe'] });
    const written = createWriteStream(log);
    child.stdout.pipe(written, { end: false });
    child.stderr.pipe(written, { end: false });
    child.on('close', code => { written.end(); done({ code, seconds: (Date.now() - started) / 1000, out, log }); });
  });
}

function summary(kernel, run) {
  if (!existsSync(run.out)) return { kernel, status: `the scorer failed (exit ${run.code}, see ${run.log})`, files: 0, read: 0, passed: 0, failed: 0, errored: 0, canary_failures: 0, seconds: run.seconds };
  const { files } = JSON.parse(readFileSync(run.out, 'utf8'));
  const row = { kernel, status: 'scored', files: 0, read: 0, passed: 0, failed: 0, errored: 0, canary_failures: 0, unable: 0, seconds: run.seconds };
  for (const f of Object.values(files)) {
    row.files++;
    if (f.canary === UNABLE) row.unable++;
    if (f.canary !== 'ok') { row.canary_failures++; row.errored += Object.keys(f.claims).length; continue; }
    row.read++;
    for (const state of Object.values(f.claims)) row[state]++;
  }
  if (row.files > 0 && row.unable === row.files) row.status = 'unable to read test files';
  delete row.unable;
  return row;
}

function table(rows) {
  const header = ['kernel', 'files read', 'passed', 'failed', 'errored', 'canary failures', 'wall time', 'status'];
  const cells = rows.map(r => [r.kernel, `${r.read}/${r.files}`, String(r.passed), String(r.failed), String(r.errored), String(r.canary_failures), `${Math.round(r.seconds)}s`, r.status]);
  const widths = header.map((h, i) => Math.max(h.length, ...cells.map(c => c[i].length)));
  const line = c => c.map((x, i) => i === 0 || i === c.length - 1 ? x.padEnd(widths[i]) : x.padStart(widths[i])).join('  ').trimEnd();
  return [line(header), line(widths.map(w => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

function winner(rows) {
  const shipped = rows.find(r => r.kernel === SHIPPED);
  if (shipped && shipped.status !== 'scored') return { kernel: undefined, why: `the shipped kernel (${SHIPPED}) was not scored: ${shipped.status}` };
  const best = Math.max(...rows.map(r => r.passed));
  const leaders = rows.filter(r => r.passed === best);
  if (leaders.some(r => r.kernel === SHIPPED)) return { kernel: SHIPPED, why: leaders.length > 1 ? `ties with ${leaders.filter(r => r.kernel !== SHIPPED).map(r => r.kernel).join(', ')} at ${best} passed claims; a kernel ships only when it beats the shipped one` : `${best} passed claims` };
  if (leaders.length > 1) return { kernel: undefined, why: `${leaders.map(r => r.kernel).join(', ')} tie at ${best} passed claims` };
  return { kernel: leaders[0].kernel, why: `${best} passed claims, more than the shipped kernel (${rows.find(r => r.kernel === SHIPPED)?.passed ?? 'not scored'})` };
}

function groupBy(list, key) {
  const groups = new Map();
  for (const item of list) {
    if (!groups.has(key(item))) groups.set(key(item), []);
    groups.get(key(item)).push(item);
  }
  return groups;
}

function passedIn(run) {
  if (!existsSync(run.out)) return new Map();
  const passed = new Map();
  for (const [file, f] of Object.entries(JSON.parse(readFileSync(run.out, 'utf8')).files)) {
    const states = new Map(Object.entries(f.claims).map(([id, state]) => [id, f.canary === 'ok' ? state : `errored (canary: ${f.canary})`]));
    passed.set(file, states);
  }
  return passed;
}

function todo(kernel, shipped, challenger) {
  const missing = [], ahead = [];
  for (const [file, states] of shipped) {
    const theirs = challenger.get(file) ?? new Map();
    for (const [id, state] of states) {
      const mine = theirs.get(id) ?? 'not scored';
      if (state === 'passed' && mine !== 'passed') missing.push({ file, id, mine });
      if (state !== 'passed' && mine === 'passed') ahead.push({ file, id, state });
    }
  }
  const byFile = list => [...groupBy(list, c => c.file)].map(([file, claims]) => `- \`${file}\`: ${claims.map(c => `${c.id} (${c.mine ?? `shipped: ${c.state}`})`).join(', ')}`);
  return [
    `# ${kernel}: what it needs to ship`,
    '',
    `${missing.length} claims pass on the shipped kernel (${SHIPPED}) and not on ${kernel}; ${ahead.length} pass on ${kernel} and not on the shipped kernel. A kernel ships when it passes more claims than the shipped one (Verification.md V3.1).`,
    '',
    `## Passing on ${SHIPPED}, not on ${kernel}`,
    '',
    ...(missing.length ? byFile(missing) : ['None.']),
    '',
    `## Passing on ${kernel}, not on ${SHIPPED}`,
    '',
    ...(ahead.length ? byFile(ahead) : ['None.']),
    '',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contestants = options.kernels ?? kernels();
  mkdirSync(options.results, { recursive: true });
  const rows = [], runs = new Map();
  for (const kernel of contestants) {
    const reused = kernel === SHIPPED && options.shipped;
    console.log(reused ? `reusing ${options.shipped} for ${kernel}` : `scoring ${kernel} ...`);
    const run = reused ? { code: 0, seconds: 0, out: options.shipped, log: options.shipped } : await score(kernel, options);
    runs.set(kernel, run);
    const row = summary(kernel, run);
    rows.push(row);
    console.log(`  ${row.passed} passed, ${row.failed} failed, ${row.errored} errored, ${row.read}/${row.files} files read, ${Math.round(row.seconds)}s: ${row.status}`);
  }
  if (runs.has(SHIPPED)) {
    const shipped = passedIn(runs.get(SHIPPED));
    for (const [kernel, run] of runs) if (kernel !== SHIPPED) writeFileSync(join(options.results, `${kernel}.todo.md`), todo(kernel, shipped, passedIn(run)));
  }
  const won = winner(rows);
  console.log(`\n${table(rows)}\n`);
  console.log(won.kernel ? `Winner: ${won.kernel} (${won.why})` : `No winner: ${won.why}`);
  writeFileSync(join(options.results, 'contest.json'), JSON.stringify({ shipped: SHIPPED, winner: won.kernel ?? null, why: won.why, kernels: rows }, null, 1) + '\n');
  console.log(`Results in ${options.results}`);
  if (rows.some(r => r.kernel === SHIPPED && r.status !== 'scored')) process.exit(1);
}

await main();
