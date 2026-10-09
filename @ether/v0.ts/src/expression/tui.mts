// usage: tui.mts [EXPRESSION…] — reads what the TUI of the site reads (as site.mts), then reads each expression given in that
// scope, printing its value (and what it said). With no expressions: the site's TUI run.
const { Host, Ray } = await import('./expression.ts');
const fs = await import('fs'), path = await import('path');
const ether = path.resolve(import.meta.dirname, '../../..');
const site = path.resolve(ether, '../../orbitmines.com/orbitmines.com.ray');
const listed = (dir: string) => fs.readdirSync(dir).filter((f: string) => f.endsWith('.ray') && !f.startsWith('.')).map((f: string) => path.join(dir, f));
const order = fs.readFileSync(path.resolve(import.meta.dirname, 'order.txt'), 'utf8').trim().split(/\s+/).map((f: string) => path.join(ether, 'ray', f));
const library = [...order, ...listed(path.join(ether, 'ray')).filter((f: string) => !order.includes(f))];
// (the web renderer is not what the terminal runs)
const project = ['geometry', 'device', '$/ansi', 'timezone', 'fonts', 'ui'].flatMap((d: string) => listed(path.join(ether, d))).filter((f: string) => !f.endsWith('/HTML.ray'));
const files = [...library, ...project, ...(process.env.NOSITE ? [] : listed(site))];
const h = new Host();
const js = new URL('./js.ray', import.meta.url).pathname, kinds = new URL('./js.kinds.ray', import.meta.url).pathname;
h.boot({ name: '.entrypoint.ray', s: fs.readFileSync(path.join(ether, 'ray/.entrypoint.ray'), 'utf8') }, { name: js, s: fs.readFileSync(js, 'utf8') }, { name: kinds, s: fs.readFileSync(kinds, 'utf8') });
const scope = new Ray(h.global); scope.scope = true;
// (this interpreter's output: what is written to the instance, as near as the library's own rules)
h.project([{ name: 'interpreter', s: '@me/instance = {x} => @show x' }], scope);
let t = performance.now();
h.project(files.map((f: string) => ({ name: path.relative(ether, f), s: fs.readFileSync(f, 'utf8') })), scope);
console.error('read', Math.round(performance.now() - t), 'ms,', h.diagnostics.length, 'diagnostics');
const asked = process.argv.slice(2);
for (const x of asked.length ? asked : ['Program(code: { orbitmines.com }).run(@me/instance)']) {
  const seen = h.diagnostics.length, text = { name: 'asked', s: x };
  t = performance.now();
  let v: unknown; try { v = h.walk(new (await import('./expression.ts')).Code(text, 0, x.length, scope)); } catch (e: any) { console.log('FAILED', e.message); }
  console.log('>', x, '=', typeof v === 'string' ? JSON.stringify(v) : h.show(v), `(${Math.round(performance.now() - t)} ms)`);
  for (const d of h.diagnostics.slice(seen)) console.log('   ', d.at.text.name + ':' + d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 150));
}
