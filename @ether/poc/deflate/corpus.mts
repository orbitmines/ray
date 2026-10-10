// DP3 (`read`): each corpus stream read by `Deflate.inflated`, its SHA-256 the one `manifest.txt` has for what zlib inflates
// it to. DP4 (`rewrite`): each stream read into a `Deflate.Stream` and that same value written back, byte for byte the stream.
const { booted } = await import('./boot.mts');
const fs = await import('node:fs'), path = await import('node:path'), crypto = await import('node:crypto');
const { program } = await booted();
const here = path.dirname(new URL(import.meta.url).pathname), corpus = path.join(here, 'corpus'), out = path.join(here, 'out', process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const g = { node: program.global }, none = program.run('None', g);
const run = (text: string) => { program.steps = 0; return program.run(text, g); };
const listed = (bytes: Uint8Array) => { const list = run('Listing.new'); for (const byte of bytes) run(program.written(list) + '.append(' + byte + ')'); return list; };
const bytes_of = (list: unknown): Uint8Array | undefined => {
  if (typeof list !== 'object' || list === null || run(program.written(list) + '.listing') !== run('true')) return undefined;
  const values: number[] = [];
  for (let at = run(program.written(list) + '.head'); at !== none && at !== undefined; at = run(program.written(at) + '.next')) values.push(run(program.written(at) + '.value') as number);
  return Uint8Array.from(values);
};
const sha = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const only = process.env.ONLY?.split(',');
let failed = 0;
for (const line of fs.readFileSync(path.join(corpus, 'manifest.txt'), 'utf8').trim().split('\n')) {
  const [name, , stream_sha, inflated_sha] = line.split(' ');
  if (only && !only.some(part => name.includes(part))) continue;
  const stream = fs.readFileSync(path.join(corpus, name)), started = performance.now();
  let got: Uint8Array | undefined, error = '';
  try {
    got = process.argv[2] === 'read' ? bytes_of(run('Deflate.inflated(' + program.written(listed(stream)) + ')')) : bytes_of(run('Deflate.Stream.from(' + program.written(listed(stream)) + ').written'));
  } catch (e: any) { error = String(e?.message).slice(0, 80); }
  const held = got !== undefined && sha(got) === (process.argv[2] === 'read' ? inflated_sha : stream_sha);
  if (got) fs.writeFileSync(path.join(out, name.replace(/\.deflate$/, process.argv[2] === 'read' ? '' : '.deflate')), got);
  if (!held) failed++;
  console.log(held ? 'ok  ' : 'FAIL', name.padEnd(32), String(Math.round(performance.now() - started)).padStart(7), 'ms', held ? '' : error || (got ? `${got.length} bytes, not the same` : 'no bytes'));
}
console.log(failed ? `${failed} failed` : `all ${process.argv[2] === 'read' ? 'read to what zlib inflates them to' : 'written back byte for byte'}`);
process.exitCode = failed ? 1 : 0;
