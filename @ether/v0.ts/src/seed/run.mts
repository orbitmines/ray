const { Seed } = await import('./seed.ts');
const fs = await import('fs');
const s = new Seed();
const f = process.argv[2];
try { s.boot({ name: f, s: fs.readFileSync(f, 'utf8') }); } catch (e: any) { console.log('FAILED', e.message ?? e, e instanceof Error ? '' : JSON.stringify(e).slice(0, 200)); for (const w of e.ray ?? []) console.log('  in', w); }
console.log('learned', JSON.stringify(s.learned), 'rules', s.global.rules.length, 'bodies planned in Ray', s.planned);
for (const d of s.diagnostics) console.log('  ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message);
