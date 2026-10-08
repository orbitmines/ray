// usage: lib.mts [FILE.ray…] — boots the language (.entrypoint.ray with this interpreter's js.ray), then reads the core library
// (@ether/ray/*.ray, or the files given) as one project, in the seed's reading order. Per file: ms, diagnostics; then the first of
// each (LIMIT, default 8).
const { Host, Ray } = await import('./expression.ts');
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
const given = process.argv.slice(2);
const names = given.length ? given : fs.readdirSync(dir).filter((f: string) => f.endsWith('.ray') && !f.startsWith('.'));
const files = names.map((n: string) => ({ path: n, text: fs.readFileSync(path.resolve(dir, n), 'utf8') }));
const order = given.length ? given : reading_order(files);
const h = new Host();
let t = performance.now();
const js = new URL('./js.ray', import.meta.url).pathname;
try { h.boot({ name: '.entrypoint.ray', s: fs.readFileSync(path.resolve(dir, '.entrypoint.ray'), 'utf8') }, { name: js, s: fs.readFileSync(js, 'utf8') }); } catch (e: any) { console.log('FAILED', e.message); }
console.log('boot', Math.round(performance.now() - t), 'ms', h.diagnostics.length, 'diagnostics');
const limit = Number(process.env.LIMIT ?? 8);
let seen = h.diagnostics.length;
const scope = new Ray(h.global); scope.scope = true;
t = performance.now();
const texts = order.map((p: string) => ({ name: p, s: files.find((f: any) => f.path === p)!.text }));
try { h.project(texts, scope); } catch (e: any) { console.log('FAILED', e.message); }
console.log('library', Math.round(performance.now() - t), 'ms');
for (const text of texts) {
  const ds = h.diagnostics.filter((d: any) => d.at.text === text);
  console.log(text.name.padEnd(16), String(ds.length).padStart(4), 'diagnostics');
  for (const d of ds.slice(0, limit)) console.log('    ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 150));
}
const elsewhere = h.diagnostics.slice(seen).filter((d: any) => !texts.includes(d.at.text));
if (elsewhere.length) { console.log('elsewhere', elsewhere.length); for (const d of elsewhere.slice(0, limit)) console.log('    ', d.at.text.name.split('/').pop() + ':' + d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 150)); }
console.log('total', h.diagnostics.length);
