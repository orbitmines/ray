// usage: site3.mts [EXPRESSION…] — reads, on language3: .entrypoint.ray2 + js3.kinds.ray, the core library, the @ether projects the
// site needs (dependencies first), the site's files (index.ray last); per file: ms, threw, unread; then each expression (default:
// the site's TUI run) with what it reported and wrote.
const { Program, Text } = await import('/home/fs/Documents/github.com/orbitmines/ray/@ether/v0.ts/src/language3.ts');
const fs = await import('node:fs'), path = await import('node:path');
const ether = '/home/fs/Documents/github.com/orbitmines/ray/@ether', site = '/home/fs/Documents/github.com/orbitmines/orbitmines.com/orbitmines.com.ray';
const reading_order = (files: { path: string; text: string }[]): string[] => {
  const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order: string[] = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) { const waiting = (p: string) => [...needs.get(p)!].filter(q => left.has(q)).length; const next = [...left].sort((a, b) => waiting(a) - waiting(b) || (a < b ? -1 : 1))[0]; order.push(next); left.delete(next); }
  return order;
};
const ray_files = (dir: string) => fs.readdirSync(dir).filter((f: string) => f.endsWith('.ray') && !f.startsWith('.') && !f.startsWith('entrypoint.')).map((f: string) => path.join(dir, f));
const dir_of = (name: string) => { if (name === '@ether') return ether; const sub = name.slice('@ether/'.length).toLowerCase(); const d = path.join(ether, sub); return fs.existsSync(d) ? d : undefined; };
const projects: string[] = [], seen = new Set<string>();
const visit = (dir: string) => { if (seen.has(dir)) return; seen.add(dir); const pf = path.join(dir, '.project.ray'); const deps = fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8').split('\n').map((l: string) => l.trim()).filter((l: string) => l.startsWith('@ether')) : []; for (const d of deps) { const dd = dir_of(d); if (dd) visit(dd); } projects.push(dir); };
for (const d of fs.readFileSync(path.join(site, '.project.ray'), 'utf8').split('\n').map((l: string) => l.trim()).filter((l: string) => l.startsWith('@ether'))) { const dd = dir_of(d); if (dd) visit(dd); }
const p: any = new Program(new Text.Source('@ether/ray/.entrypoint.ray2')); await p.compile();
const kinds = () => p.run(fs.readFileSync('/home/fs/Documents/github.com/orbitmines/ray/@ether/v0.ts/src/js3.kinds.ray', 'utf8'), { node: p.global });
kinds();
const STEPS = Number(process.env.STEPS ?? 300000), LIMIT = Number(process.env.LIMIT ?? 4);
const rd = p.read; let steps = 0, unread: string[] = [];
let cyc_depth = 0, cyc_shown = 0; const cyc_stk: string[] = [];
const short = (l: string) => l.slice(0, 300).replace(/\{\uE000[^}]*\}/g, (m: string) => '⟨' + m.slice(2, 8) + '⟩').replace(/\s+/g, ' ').slice(0, 150);
const prof = new Map<string, number>(); (globalThis as any).prof = prof;
p.read = function (s: string, f: any, x?: any, a?: any) { if (process.env.PROF) { const k = String(p.source(s.length > 200 ? s.slice(0, 200) : s)).replace(/\s+/g, ' ').slice(0, 70); prof.set(k, (prof.get(k) ?? 0) + 1); } if (process.env.CYC) { cyc_stk.push(s); if (++cyc_depth === 250 && !cyc_shown++) { console.log('CYCLE'); for (const l of cyc_stk.slice(-Number(process.env.LINES_ ?? 30))) console.log('    ', short(l)); } } try { if (++steps > STEPS) { if (process.env.CYC && !cyc_shown++) { console.log('RUNAWAY'); for (const l of cyc_stk.slice(-Number(process.env.LINES_ ?? 30))) console.log('    ', short(l)); } throw new Error('ran away at ' + JSON.stringify(String(p.source(s)).slice(0, 60))); } const v = rd.call(this, s, f, x, a); if (typeof v === 'string' && !s.startsWith('"') && !s.startsWith('`') && v === p.source(s) && /[A-Za-z]/.test(v)) unread.push(v); return v; } finally { if (process.env.CYC) { cyc_depth--; cyc_stk.pop(); } } };
const read_file = (file: string, text: string) => {
  const t0 = performance.now(), threw: string[] = []; let unreadn = 0; const before = p.reports.length;
  const sts: string[] = p.code(text).statements;
  for (const st of sts) { if (!st.trim() || st.trim().startsWith('//')) continue; steps = 0; cyc_shown = 0; unread = []; let whole: unknown; try { whole = p.run(st, { node: p.global }); } catch (e: any) { threw.push(st.split('\n')[0].slice(0, 70) + '  ⟶ ' + String(e?.message ?? e).slice(0, 70)); } if (typeof whole === 'string' && whole.trim() === String(p.source(st)).trim()) { unreadn++; if (process.env.UNREAD && file.includes(process.env.UNREAD) && unreadn <= Number(process.env.N ?? 6)) console.log('     unread', JSON.stringify(st.slice(0, 90)), ''); } }
  if (!process.env.Q || threw.length) console.log(path.relative('/home/fs/Documents/github.com/orbitmines', file).padEnd(52), String(Math.round(performance.now() - t0)).padStart(6), 'ms', String(sts.length).padStart(4), 'st', String(threw.length).padStart(3), 'threw', String(p.reports.length - before).padStart(3), 'reports', String(unreadn).padStart(4), 'unread');
  for (const x of threw.slice(0, LIMIT)) console.log('     threw', x);
};
const group = (files: string[]) => { const texts = files.map(f => ({ path: f, text: fs.readFileSync(f, 'utf8') })); for (const f of reading_order(texts)) read_file(f, texts.find(t => t.path === f)!.text); };
const T0 = performance.now();
group(ray_files(path.join(ether, 'ray')));
if (process.env.KINDS_AFTER) kinds();
console.log('-- core library', Math.round(performance.now() - T0), 'ms');
const only = process.env.ONLY?.split(',');
for (const dir of projects.filter(d => !only || only.includes(path.relative(ether, d) || '@ether'))) { const t = performance.now(); group(ray_files(dir)); console.log('-- project', path.relative(ether, dir) || '@ether', Math.round(performance.now() - t), 'ms'); }
if (!process.env.NOSITE) { const own = ray_files(site); group(own.filter(f => !f.endsWith('/index.ray'))); read_file(path.join(site, 'index.ray'), fs.readFileSync(path.join(site, 'index.ray'), 'utf8')); }
if (process.env.PROF) { console.log([...prof].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => String(n).padStart(8) + '  ' + k).join('\n')); }
console.log('-- read everything', Math.round(performance.now() - T0), 'ms');
const asked = process.argv.slice(2);
if (process.env.JSX) console.log('JSX', await (new Function('p', 'Program', 'return (async () => { ' + process.env.JSX + ' })()'))(p, Program));
for (const x of asked.length ? asked : ['Program(code: { orbitmines.com }).run(@me/instance)']) {
  if (process.env.RD) { const c = p.candidates(x, p.global, p.outermost(x) ? 2 : 0, undefined); console.log('> readings', JSON.stringify(x)); for (const r of p.readings(x, c, true).slice(-8)) console.log('   ', r.rule.head, JSON.stringify(r.spans), r.rule.home === p.global ? 'global' : 'node'); continue; }
  const before = p.reports.length, t = performance.now(); steps = 0; let v: unknown;
  try { v = p.run(x, { node: p.global }); } catch (e: any) { v = 'THREW ' + String(e?.message ?? e).slice(0, 200); }
  console.log('>', JSON.stringify(x).slice(0, 70), '=', v instanceof Program.Node ? 'node(' + v.rules.slice(0, 10).map((r: any) => r.head).join(',') + ')' : JSON.stringify(v)?.slice(0, 300), `(${Math.round(performance.now() - t)} ms)`);
  for (const r of p.reports.slice(before)) console.log('    report:', String(p.source(r.caps?.message ?? '')).slice(0, 150));
}
