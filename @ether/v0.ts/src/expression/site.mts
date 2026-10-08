// usage: site.mts [FILE…] — boots the language, then reads the core library, @ether/geometry, @ether/ui and the orbitmines.com site as one
// project. Prints the time, the diagnostics per file (LIMIT each), and the total.
const { Host, Ray } = await import('./expression.ts');
const fs = await import('fs'), path = await import('path');
const ether = path.resolve(import.meta.dirname, '../../..');
const site = path.resolve(ether, '../../orbitmines.com/orbitmines.com.ray');
const listed = (dir: string) => fs.readdirSync(dir).filter((f: string) => f.endsWith('.ray') && !f.startsWith('.')).map((f: string) => path.join(dir, f));
const order = fs.readFileSync(path.resolve(import.meta.dirname, 'order.txt'), 'utf8').trim().split(/\s+/).map((f: string) => path.join(ether, 'ray', f));
const library = [...order, ...listed(path.join(ether, 'ray')).filter((f: string) => !order.includes(f))];
const extra = process.argv.slice(2).map((f: string) => path.resolve(f));
// (what the TUI of the site reads: the library, geometry, the device, ANSI, time zones and fonts, the UI, then the site)
const project = ['geometry', 'device', '$/ansi', 'timezone', 'fonts', 'ui'].flatMap((d: string) => listed(path.join(ether, d)));
const files = process.env.LIBONLY ? [...library, ...extra] : [...library, ...project, ...(process.env.NOSITE ? [] : listed(site)), ...extra];
const h = new Host();
const js = new URL('./js.ray', import.meta.url).pathname, kinds = new URL('./js.kinds.ray', import.meta.url).pathname;
h.boot({ name: '.entrypoint.ray', s: fs.readFileSync(path.join(ether, 'ray/.entrypoint.ray'), 'utf8') }, { name: js, s: fs.readFileSync(js, 'utf8') }, { name: kinds, s: fs.readFileSync(kinds, 'utf8') });
const booted = h.diagnostics.length;
const scope = new Ray(h.global); scope.scope = true;
const texts = files.map((f: string) => ({ name: path.relative(ether, f), s: fs.readFileSync(f, 'utf8') }));
const t = performance.now();
try { h.project(texts, scope); } catch (e: any) { console.log('FAILED', e.message); }
console.log('read', Math.round(performance.now() - t), 'ms');
const limit = Number(process.env.LIMIT ?? 5);
for (const text of texts) {
  const ds = h.diagnostics.filter((d: any) => d.at.text === text);
  if (!ds.length) continue;
  console.log(text.name.padEnd(40), String(ds.length).padStart(4));
  for (const d of ds.slice(0, limit)) console.log('    ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 140).replace(/\n/g, '⏎'));
}
console.log('boot', booted, 'total', h.diagnostics.length);
