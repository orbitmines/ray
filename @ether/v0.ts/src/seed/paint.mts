// usage: paint.mts FILE.ray — reads the language and its library as the language server does (src/language.ts), then the file (a
// library file: as read there), and prints what it said (DIAGNOSTICS=1) and each painted span with its style. PAINT=0: unpainted,
// TIMINGS=1: per file. Run as lib.mts is (ulimit -s unlimited; node --stack-size=20000 --import <tsx loader> paint.mts FILE).
const { Ray } = await import('../language.ts');
const fs = await import('fs'), path = await import('path');
const file = path.resolve(process.argv[2]);
const t0 = performance.now();
const ray = new Ray({ paint: process.env.PAINT !== '0' }).boot().read_library();
const read = (ray.core(file) ? ray.of(file) : undefined) ?? ray.file(file, fs.readFileSync(file, 'utf8'), !!process.env.THEME, ray.prepare(file));
const s = read.text.s, line = (i: number) => s.slice(0, i).split('\n').length;
if (process.env.TIMINGS) for (const [name, ms] of ray.timings) console.log(name.padEnd(16), String(Math.round(ms)).padStart(7), 'ms');
console.log('read in', Math.round(performance.now() - t0), 'ms;', read.diagnostics.length, 'diagnostics,', read.paints.length, 'paints');
if (process.env.DIAGNOSTICS) for (const d of read.diagnostics) console.log('  ', line(d.begin) + ':', d.message);
const by: Record<string, number> = {};
for (const p of read.paints) by[p.style] = (by[p.style] ?? 0) + 1;
console.log(JSON.stringify(by));
for (const p of [...read.paints].sort((a, b) => a.begin - b.begin || b.end - a.end)) console.log(`${line(p.begin)}:${p.begin - s.lastIndexOf('\n', p.begin - 1) - 1}`.padEnd(8), p.style.padEnd(12), JSON.stringify(s.slice(p.begin, p.end + 1)));
if (process.env.THEME) console.log('THEME', JSON.stringify(ray.theme()));
