import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const ether = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const usage = `Usage: node scripts/corpus.mjs [--fetch] [manifests...]
  Checks every tests/corpus/corpus.json under @ether (or the manifests given, relative to @ether): each file it lists
  is present with its size and SHA-256, and the directory holds no file it does not list.
  --fetch   download a listed file that is missing from its "source" URL first (a file present is never replaced)`;

export function manifests() {
  const found = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (!e.isDirectory() || e.name === 'node_modules' || full === join(ether, 'v0.ts')) continue;
      if (e.name === 'corpus' && existsSync(join(full, 'corpus.json'))) found.push(relative(ether, join(full, 'corpus.json')));
      else walk(full);
    }
  })(ether);
  return found.sort();
}

export function entries(manifest) {
  return JSON.parse(readFileSync(join(ether, manifest), 'utf8')).files;
}

export function pinned(manifest, entry) {
  const bytes = readFileSync(join(ether, dirname(manifest), entry.file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== entry.size || sha256 !== entry.sha256) throw new Error(`${join(dirname(manifest), entry.file)}: ${bytes.length} bytes, sha256 ${sha256}; the manifest pins ${entry.size} bytes, sha256 ${entry.sha256}`);
  return bytes;
}

async function fetched(manifest, entry) {
  if (!entry.source) throw new Error(`${join(dirname(manifest), entry.file)} is missing and has no source URL; remake it with: ${entry.made}`);
  const response = await fetch(entry.source);
  if (!response.ok) throw new Error(`${entry.source}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.sha256) throw new Error(`${entry.source} now serves sha256 ${sha256}, not the pinned ${entry.sha256}; nothing was written`);
  writeFileSync(join(ether, dirname(manifest), entry.file), bytes);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const fetching = args.includes('--fetch');
  const given = args.filter(a => !a.startsWith('--'));
  const problems = [];
  let files = 0;
  for (const manifest of given.length > 0 ? given : manifests()) {
    const listed = entries(manifest);
    const names = new Set(listed.map(e => e.file));
    for (const entry of listed) {
      try {
        if (!existsSync(join(ether, dirname(manifest), entry.file))) {
          if (!fetching) throw new Error(`${join(dirname(manifest), entry.file)} is missing (--fetch downloads it from ${entry.source ?? 'nowhere: it has no source URL'})`);
          await fetched(manifest, entry);
        }
        pinned(manifest, entry);
        files++;
      } catch (e) { problems.push(e.message); }
    }
    for (const name of readdirSync(join(ether, dirname(manifest)))) if (name !== 'corpus.json' && !names.has(name)) problems.push(`${join(dirname(manifest), name)} is not in its manifest`);
    console.log(`${manifest.padEnd(44)} ${listed.length} files`);
  }
  for (const p of problems) console.log(`FAILED  ${p}`);
  console.log(`\n${files} files match their manifests${problems.length > 0 ? `, ${problems.length} problems` : ''}`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
