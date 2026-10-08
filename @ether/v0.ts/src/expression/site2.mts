// usage: site2.mts [EXPRESSION…] — reads the site as the CLI and the LSP do (the language, its library, the projects the site's
// `.project.ray` needs, the site's files), then reads each expression given in the site's scope, printing its value and what it
// said. With no expressions: the site's TUI run.
const { Ray } = await import('../language.ts');
const { Code } = await import('./expression.ts');
const fs = await import('fs'), path = await import('path');
const site = path.resolve(import.meta.dirname, '../../../../../orbitmines.com/orbitmines.com.ray/index.ray');
const ray = new Ray({});
let t = performance.now();
ray.boot().read_library();
const scope = ray.prepare(site);
const text = { name: site, s: fs.readFileSync(site, 'utf8') }, here = ray.project([text], scope), read = { diagnostics: ray.host.diagnostics.filter(d => d.at.text === text) };
for (const [name, ms] of ray.timings) console.error(name.padEnd(40), Math.round(ms), 'ms');
console.error('read', Math.round(performance.now() - t), 'ms,', ray.host.diagnostics.length, 'diagnostics;', read.diagnostics.length, 'in index.ray');
if (process.env.DIAGS) for (const d of ray.host.diagnostics.filter(d => !d.at.text.name.includes('/ray/') || process.env.DIAGS === 'all')) console.error('   ', path.relative(path.dirname(site), d.at.text.name) + ':' + d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 150));
const asked = process.argv.slice(2);
for (const x of asked.length ? asked : ['Program(code: { orbitmines.com }).run(@me/device/terminal)']) {
  const seen = ray.host.diagnostics.length, text = { name: 'asked', s: x };
  t = performance.now();
  let v: unknown; try { v = ray.host.walk(new Code(text, 0, x.length, here)); } catch (e: any) { console.log('FAILED', e.message); }
  console.log('>', x, '=', typeof v === 'string' ? JSON.stringify(v) : ray.host.show(v), `(${Math.round(performance.now() - t)} ms)`);
  for (const line of ray.written.splice(0)) console.log(line);
  for (const d of ray.host.diagnostics.slice(seen)) console.log('   ', d.at.text.name.split('/').slice(-2).join('/') + ':' + d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message.slice(0, 150));
}
