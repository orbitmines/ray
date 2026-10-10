import { spawn, spawnSync } from 'child_process';
import { availableParallelism } from 'os';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const ether = dirname(pkg);
const baselinePath = join(pkg, 'score.json');

const CANARY_FIRES = 'SCORE1 the runner sees a claim fire';
const CANARY_QUIET = 'SCORE2 the runner sees a claim hold';
const canaryLines = [`unless (1 == 2) { INFO@mark \`${CANARY_FIRES}\` }`, `unless (1 == 1) { INFO@mark \`${CANARY_QUIET}\` }`];

const usage = `Usage: node scripts/score.mjs [--check] [--write] [--no-build] [--jobs N] [--timeout S] [files...]
  Runs every tests/*.ray under @ether (or the files given, relative to @ether) and scores each claim
  (\`INFO@mark \\\`ID ...\\\`\`) as passed, failed or errored.
  --check   compare with v0.ts/score.json and exit 1 when a passed claim no longer passes
  --write   write the result to v0.ts/score.json
  --out F   also write this run's result to F`;

function parseArgs(argv) {
  const options = { check: false, write: false, build: true, jobs: Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2))), timeout: 300, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') options.check = true;
    else if (a === '--write') options.write = true;
    else if (a === '--out') options.out = argv[++i];
    else if (a === '--no-build') options.build = false;
    else if (a === '--jobs') options.jobs = Number(argv[++i]);
    else if (a === '--timeout') options.timeout = Number(argv[++i]);
    else if (a === '--help' || a === '-h') { console.log(usage); process.exit(0); }
    else options.files.push(a);
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1) fail('--jobs takes a whole number of at least 1');
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) fail('--timeout takes a number of seconds above 0');
  return options;
}

function fail(message) {
  console.error(`score.mjs: ${message}`);
  process.exit(2);
}

function testFiles() {
  const found = [];
  (function walk(dir, inTests) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || (e.name.startsWith('v') && e.name.includes('.'))) continue;
        walk(join(dir, e.name), inTests || e.name === 'tests');
      } else if (inTests && e.name.endsWith('.ray') && !e.name.startsWith('.')) {
        found.push(relative(ether, join(dir, e.name)));
      }
    }
  })(ether, false);
  return found.sort();
}

const pending = { bundled: undefined, copied: [], copies: new Set(), children: new Set() };

function restoreBuild() {
  if (pending.bundled !== undefined) writeFileSync(join(pkg, 'src/bundled.ts'), pending.bundled);
  for (const f of pending.copied) rmSync(join(pkg, f), { force: true });
  pending.bundled = undefined;
  pending.copied = [];
}

function cleanup() {
  for (const pid of pending.children) { try { process.kill(-pid, 'SIGKILL'); } catch {} }
  for (const c of pending.copies) rmSync(join(ether, c), { force: true });
  restoreBuild();
}

function build() {
  pending.bundled = readFileSync(join(pkg, 'src/bundled.ts'), 'utf8');
  pending.copied = ['README.md', 'LICENSE'].filter(f => !existsSync(join(pkg, f)));
  const result = spawnSync(process.execPath, ['scripts/bundle.mjs'], { cwd: pkg, stdio: 'inherit' });
  restoreBuild();
  if (result.status !== 0) throw new Error('the bundle did not build');
}

function copyWithCanaries(rel) {
  const copy = join(dirname(rel), `.score.${basename(rel)}`);
  copyFileSync(join(ether, rel), join(ether, copy));
  const text = readFileSync(join(ether, rel), 'utf8');
  appendFileSync(join(ether, copy), (text.endsWith('\n') ? '' : '\n') + canaryLines.join('\n') + '\n');
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').length;
  return { copy, fires: lines + 1, quiet: lines + 2 };
}

function run(copy, timeout) {
  return new Promise(done => {
    const started = Date.now();
    const child = spawn(process.execPath, ['v0.ts/bin/ray.js', '-v', copy], { cwd: ether, detached: true });
    pending.children.add(child.pid);
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', d => { err += d; });
    child.stdout.on('data', () => {});
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      pending.children.delete(child.pid);
      done({ code, timedOut: signal === 'SIGKILL', seconds: (Date.now() - started) / 1000, err });
    });
  });
}

const claimPattern = /INFO@mark\s*`([^`]*)`/g;

function claimsOf(text) {
  const lines = text.split('\n');
  const claims = [];
  let floor = 0;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(claimPattern)) {
      let start = i;
      while (start > floor && !/^\s*(unless|if)\b/.test(lines[start])) start--;
      if (!/^\s*(unless|if)\b/.test(lines[start])) start = i;
      claims.push({ message: m[1], id: m[1].split(/\s+/)[0], first: start + 1, last: i + 1 });
      floor = i + 1;
    }
  });
  return claims;
}

function diagnosticsOf(err, copy) {
  const byLine = new Map();
  for (const line of err.split('\n')) {
    const m = /^(.*?\.ray):(\d+): (.*)$/.exec(line);
    if (!m || m[1] !== copy) continue;
    const n = Number(m[2]);
    if (!byLine.has(n)) byLine.set(n, []);
    byLine.get(n).push(m[3]);
  }
  return byLine;
}

function score(rel, outcome, canary) {
  const text = readFileSync(join(ether, rel), 'utf8');
  const claims = claimsOf(text);
  const byLine = diagnosticsOf(outcome.err, canary.copy);
  const messages = new Set(claims.map(c => c.message));
  const result = { claims: {}, header: 'ok', canary: 'ok' };
  if (outcome.timedOut) result.canary = 'timed out';
  else if (!(byLine.get(canary.fires) ?? []).includes(CANARY_FIRES)) result.canary = 'a claim that must fire did not';
  else if ((byLine.get(canary.quiet) ?? []).length > 0) result.canary = 'a claim that must hold fired';
  const headerLine = text.split('\n').findIndex(l => /^\s*mark\s/.test(l)) + 1;
  if (headerLine > 0 && (byLine.get(headerLine) ?? []).length > 0) result.header = byLine.get(headerLine).join('; ');
  const seen = new Map();
  for (const c of claims) {
    const here = [];
    for (let n = c.first; n <= c.last; n++) here.push(...(byLine.get(n) ?? []));
    const others = here.filter(d => !messages.has(d));
    const state = result.canary !== 'ok' ? 'errored' : others.length > 0 ? 'errored' : here.includes(c.message) ? 'failed' : 'passed';
    const nth = (seen.get(c.id) ?? 0) + 1;
    seen.set(c.id, nth);
    result.claims[nth === 1 ? c.id : `${c.id}#${nth}`] = state;
  }
  return result;
}

function totals(files) {
  const t = { files: 0, claims: 0, passed: 0, failed: 0, errored: 0, canary_failures: 0, header_errors: 0 };
  for (const f of Object.values(files)) {
    t.files++;
    if (f.canary !== 'ok') t.canary_failures++;
    if (f.header !== 'ok') t.header_errors++;
    for (const s of Object.values(f.claims)) { t.claims++; t[s]++; }
  }
  return t;
}

async function pool(items, jobs, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await work(items[i]); }
  }));
  return results;
}

function compare(baseline, current, everyFile) {
  const regressions = [], improvements = [];
  if (everyFile) {
    for (const [file, before] of Object.entries(baseline)) {
      if (file in current) continue;
      for (const [id, state] of Object.entries(before.claims)) if (state === 'passed') regressions.push(`${file} ${id}: passed -> removed with its file`);
    }
  }
  for (const [file, now] of Object.entries(current)) {
    const before = baseline[file];
    if (!before) continue;
    for (const [id, state] of Object.entries(before.claims)) {
      const after = now.claims[id];
      if (state === 'passed' && after !== 'passed') regressions.push(`${file} ${id}: passed -> ${after ?? 'removed'}`);
    }
    for (const [id, state] of Object.entries(now.claims)) {
      if (state === 'passed' && before.claims[id] !== 'passed') improvements.push(`${file} ${id}: ${before.claims[id] ?? 'new'} -> passed`);
    }
    if (before.canary === 'ok' && now.canary !== 'ok') regressions.push(`${file}: canary ${now.canary}`);
  }
  return { regressions, improvements };
}

function commit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ether, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const everyFile = options.files.length === 0;
  const files = everyFile ? testFiles() : options.files.map(f => existsSync(join(ether, f)) ? f : relative(ether, resolve(f)));
  const missing = files.filter(f => !existsSync(join(ether, f)));
  if (missing.length > 0) fail(`no such test file: ${missing.join(', ')}`);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  if (options.build) build();
  const scored = {};
  try {
    await pool(files, options.jobs, async rel => {
      let result, seconds = 0;
      try {
        const canary = copyWithCanaries(rel);
        pending.copies.add(canary.copy);
        const outcome = await run(canary.copy, options.timeout);
        rmSync(join(ether, canary.copy), { force: true });
        pending.copies.delete(canary.copy);
        seconds = outcome.seconds;
        result = score(rel, outcome, canary);
      } catch (e) {
        result = { claims: Object.fromEntries(claimsOf(readFileSync(join(ether, rel), 'utf8')).map(c => [c.id, 'errored'])), header: 'ok', canary: `the scorer failed: ${e?.message ?? e}` };
      }
      scored[rel] = result;
      const counts = Object.values(result.claims).reduce((a, s) => (a[s]++, a), { passed: 0, failed: 0, errored: 0 });
      console.log(`${rel.padEnd(44)} ${seconds.toFixed(1).padStart(6)}s  passed ${String(counts.passed).padStart(3)}  failed ${String(counts.failed).padStart(3)}  errored ${String(counts.errored).padStart(3)}${result.canary === 'ok' ? '' : `  canary: ${result.canary}`}`);
    });
  } finally {
    cleanup();
  }
  const ordered = Object.fromEntries(Object.keys(scored).sort().map(k => [k, scored[k]]));
  const t = totals(ordered);
  console.log(`\n${t.files} files, ${t.claims} claims: ${t.passed} passed, ${t.failed} failed, ${t.errored} errored; ${t.canary_failures} canary failures, ${t.header_errors} header errors`);
  let status = 0;
  if (options.check) {
    if (!existsSync(baselinePath)) { console.log('No v0.ts/score.json to compare with.'); status = 1; }
    else {
      const recorded = JSON.parse(readFileSync(baselinePath, 'utf8'));
      if (recorded.node && recorded.node.split('.')[0] !== process.version.split('.')[0]) console.log(`Warning: score.json was recorded on Node ${recorded.node}, this run is ${process.version}`);
      const { regressions, improvements } = compare(recorded.files, ordered, everyFile);
      for (const r of improvements) console.log(`improved   ${r}`);
      for (const r of regressions) console.log(`REGRESSED  ${r}`);
      if (regressions.length > 0) status = 1;
    }
  }
  if (options.out) writeFileSync(resolve(options.out), JSON.stringify({ commit: commit(), kernel: 'expression', node: process.version, totals: t, files: ordered }, null, 1) + '\n');
  if (options.write) {
    const previous = everyFile || !existsSync(baselinePath) ? {} : JSON.parse(readFileSync(baselinePath, 'utf8')).files;
    const merged = Object.fromEntries(Object.entries({ ...previous, ...ordered }).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(baselinePath, JSON.stringify({ commit: commit(), kernel: 'expression', node: process.version, totals: totals(merged), files: merged }, null, 1) + '\n');
    console.log(`Wrote ${relative(process.cwd(), baselinePath)}`);
  }
  process.exit(status);
}

await main();
