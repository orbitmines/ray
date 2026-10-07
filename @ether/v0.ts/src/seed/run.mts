// usage: run.mts ENTRYPOINT [FILE…] — boots the entrypoint once, then reads each file in a scope of its own, printing what
// each says under its name (`== FILE`), its diagnostics after it.
const { Seed } = await import('./seed.ts');
const fs = await import('fs');
const s = new Seed();
const failed = (e: any) => { if (process.env.SEED_STACK) console.log(e.stack); console.log('FAILED', e.message ?? e, e instanceof Error ? '' : JSON.stringify(e).slice(0, 200)); for (const w of e.ray ?? []) console.log('  in', w); };
let seen = 0;
const said = () => { for (const d of s.diagnostics.slice(seen)) console.log('  ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message); seen = s.diagnostics.length; };
const f = process.argv[2];
try { s.boot({ name: f, s: fs.readFileSync(f, 'utf8') }); } catch (e: any) { failed(e); }
// the reader hands over to the language: .entrypoint.ray beside it
const entry = f.replace(/\.reader\.ray$/, '.entrypoint.ray');
if (entry !== f && fs.existsSync(entry)) try { s.entry({ name: entry, s: fs.readFileSync(entry, 'utf8') }); } catch (e: any) { failed(e); }
said();
for (const g of process.argv.slice(3)) {
  console.log('==', g.split('/').pop());
  try { s.file({ name: g, s: fs.readFileSync(g, 'utf8') }); } catch (e: any) { failed(e); }
  said();
}
if (process.env.SEED_TIME) console.log('done at', Math.round(performance.now()), 'ms');
console.log('learned', JSON.stringify(s.learned), 'rules', s.global.rules.length, 'bodies planned in Ray', s.planned);
