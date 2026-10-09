const { Host, Code } = await import('./expression.ts');
const fs = await import('fs');
const h = new Host();
h.boot({ name: 'l', s: fs.readFileSync('../../../ray/.entrypoint.ray', 'utf8') });
for (const e of h.global.eqs) console.log(e.order, JSON.stringify(e.key), e.pieces.map((p: any) => p.lit ?? ('{' + p.cap + (p.reader ? ' ' + p.reader.s : '') + '}')).join('|'));
const t = { name: 't', s: process.argv[2] };
const r = h.parse(t, 0, t.s.length, h.global, 0);
console.log(JSON.stringify(r, (k, v) => k === 'eq' ? v.key : k === 'ctx' || k === 'text' ? undefined : v));
console.log(h.diagnostics.map((d: any) => d.message));
const u = { name: 'u', s: process.argv[3] ?? '' };
if (process.argv[3]) { h.read(u, h.global); for (const e of h.global.eqs.slice(-4)) console.log(e.order, JSON.stringify(e.key), e.pieces.map((p: any) => p.lit ?? ('{' + p.cap + (p.reader ? ' ' + p.reader.s : '') + '}')).join('|')); console.log(h.diagnostics.map((d: any) => d.message)); }
