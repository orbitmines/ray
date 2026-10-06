const { Seed } = await import('./seed.ts');
const fs = await import('fs');
const s = new Seed();
const f = process.argv[2];
s.boot({ name: f, s: fs.readFileSync(f, 'utf8') });
console.log('learned', JSON.stringify(s.learned), 'rules', s.global.rules.length);
for (const d of s.diagnostics) console.log('  ', d.at.text.s.slice(0, d.at.b).split('\n').length + ':', d.message);
