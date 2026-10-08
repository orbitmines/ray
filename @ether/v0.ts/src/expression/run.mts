// usage: run.mts LANGUAGE [FILE…] — reads the language (its first statement teaches the host) and this interpreter's js.ray, then each file in a scope of
// its own, printing what each says under its name (`== FILE`), its diagnostics after it.
const { Host, Ray } = await import('./expression.ts');
const fs = await import('fs');
const h = new Host();
if (!process.env.EXPR_NOCOMPILE) { try { (await import('./compile.ts')).accelerate(h); } catch {} }
let seen = 0;
const said = () => { for (const d of h.diagnostics.slice(seen)) console.log('  ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message); seen = h.diagnostics.length; };
const t0 = performance.now();
const f = process.argv[2];
// (what this interpreter maps the language's values to, read once the first statement has taught it how equivalences are added)
const js = new URL('./js.ray', import.meta.url).pathname, kinds = new URL('./js.kinds.ray', import.meta.url).pathname;
try { h.boot({ name: f, s: fs.readFileSync(f, 'utf8') }, { name: js, s: fs.readFileSync(js, 'utf8') }, { name: kinds, s: fs.readFileSync(kinds, 'utf8') }); } catch (e: any) { console.log('FAILED', e.stack); }
said();
if (process.env.EXPR_TIME) console.log('booted in', Math.round(performance.now() - t0), 'ms');
for (const g of process.argv.slice(3)) {
  console.log('==', g.split('/').pop());
  const scope = new Ray(h.global); scope.scope = true;
  try { h.read({ name: g, s: fs.readFileSync(g, 'utf8') }, scope); } catch (e: any) { console.log('FAILED', e.stack); }
  said();
}
if (process.env.EXPR_TIME) console.log('done in', Math.round(performance.now() - t0), 'ms');
