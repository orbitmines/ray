// usage: lib.mts [FILE.ray…] [-- TEST.ray…] — boots @ether/ray/.reader.ray, then reads the core library (@ether/ray/*.ray, or the files given)
// as one project, in the old host's reading order (a probe's choice, not the host's). Per file: ms, diagnostics; then the
// first diagnostics of each (LIMIT, default 8).
const { Seed } = await import('./seed.ts');
const fs = await import('fs'), path = await import('path');
const dir = path.resolve(import.meta.dirname, '../../../ray');
const reading_order = (files: { path: string; text: string }[]): string[] => {
  const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const syntax = (text: string) => text.split('\n').filter(line => /^[^A-Za-z\s/].*=>|^[A-Za-z_]+ \{[a-z]/.test(line)).length;
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []), syntax: syntax(f.text) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order: string[] = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) {
    const waiting = (p: string) => [...needs.get(p)!].filter(q => left.has(q)).length;
    const next = [...left].map(p => info.find(f => f.path === p)!).sort((a, b) => waiting(a.path) - waiting(b.path) || b.syntax - a.syntax || (a.path < b.path ? -1 : 1))[0];
    order.push(next.path); left.delete(next.path);
  }
  return order;
};
const dash = process.argv.indexOf('--');
const given = process.argv.slice(2, dash < 0 ? undefined : dash), tests = dash < 0 ? [] : process.argv.slice(dash + 1);
const names = given.length ? given : fs.readdirSync(dir).filter(f => f.endsWith('.ray') && !f.startsWith('.'));
const files = names.map(n => ({ path: n, text: fs.readFileSync(path.resolve(dir, n), 'utf8') }));
const order = given.length ? given : reading_order(files);
const s = new Seed();
let t = performance.now();
const failed = (e: any) => { console.log('FAILED', e.message ?? e); for (const w of (e.ray ?? []).slice(0, 6)) console.log('  in', w); };
try { s.boot({ name: '.reader.ray', s: fs.readFileSync(path.resolve(dir, '.reader.ray'), 'utf8') }); } catch (e) { failed(e); }
console.log('boot', Math.round(performance.now() - t), 'ms', s.diagnostics.length, 'diagnostics');
const limit = Number(process.env.LIMIT ?? 8);
let seen = s.diagnostics.length;
const texts = order.map(p => ({ name: p, s: files.find(f => f.path === p)!.text }));
const scope = new (s.global.constructor as any)(s.global);
for (const text of texts) {
  t = performance.now();
  try { s.read(text, 0, scope); } catch (e) { failed(e); }
  const ds = s.diagnostics.slice(seen); seen = s.diagnostics.length;
  if (process.env.SEED_CALLS) console.log('  forced', (s as any).forced, 'compiles', (s as any).compiles, 'planned', (s as any).recompiles);
  console.log(text.name.padEnd(16), String(Math.round(performance.now() - t)).padStart(7), 'ms', String(ds.length).padStart(4), 'diagnostics');
  for (const d of ds.slice(0, limit)) console.log('    ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message);
}
// the statements that left something said, read again now that the whole library is
t = performance.now();
const pending = s.pending.length, before = s.diagnostics.length;
if (process.env.SEED_HANG_SETTLE) s.hang_reset();
if (process.env.SETTLE !== '0') s.settle();
seen = s.diagnostics.length;
console.log('settled', pending, 'statements in', Math.round(performance.now() - t), 'ms:', before, '->', s.diagnostics.length, 'diagnostics');
if (process.env.SETTLED) for (const d of s.diagnostics.slice(0, limit)) console.log('    ', d.at.text.name, d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message);
s.hang_reset();
// each test in a scope of its own under the library's: what it says, then its diagnostics
for (const test of tests) {
  t = performance.now();
  try { s.read({ name: test, s: fs.readFileSync(test, 'utf8') }, 0, new (s.global.constructor as any)(scope)); } catch (e) { failed(e); }
  const ds = s.diagnostics.slice(seen); seen = s.diagnostics.length;
  console.log('==', path.basename(test).padEnd(13), String(Math.round(performance.now() - t)).padStart(7), 'ms', String(ds.length).padStart(4), 'diagnostics');
  for (const d of ds.slice(0, limit)) console.log('    ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message);
}
