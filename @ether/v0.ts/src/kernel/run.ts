import * as fs from 'fs';
import * as path from 'path';
import { ENTRYPOINT, plan } from './projects.ts';

// Running a file with the kernel's reader: the entrypoint (read twice: what it defines late is used early), what the file needs read
// before it (projects.ts), then the file; what it says is its diagnostics. Its streams are the caller's.

export type Out = { out(text: string): unknown; err(text: string): unknown };
export type Options = { platform?: string; settle?: boolean; verbose?: boolean; with?: string[] };

const shown = (at: string) => { const rel = path.relative(process.cwd(), at); return rel.startsWith('..') ? at : rel; };
const line_col = (text: string, at: number) => { const before = text.slice(0, at), line = before.split('\n').length; return `${line}:${at - before.lastIndexOf('\n')}`; };

export async function run(file: string, io: Out, options: Options = {}): Promise<number> {
  process.env.KOPT ??= 'off';
  process.env.KLEARN ??= 'off';
  const { Reader } = await import('./host.ts');
  const r = new Reader();
  r.runtime.streams.set('stdout', { write: text => { io.out(text); } });
  r.runtime.streams.set('stderr', { write: text => { io.err(text); } });
  for (const ui of ['window', 'dom']) r.runtime.streams.set(ui, { ...r.runtime.streams.get(ui), write: text => { io.out(text); } });
  const texts = new Map<number, { file: string; text: string }>();
  const t0 = performance.now();
  const read = (at: string) => {
    const text = fs.readFileSync(at, 'utf8'), src = r.source(at, text), a = performance.now(), before = r.diagnostics.length;
    texts.set(src, { file: at, text });
    r.read_all(src, text.length);
    if (options.verbose) io.err(`read ${shown(at)} ${Math.round(performance.now() - a)} ms, ${r.diagnostics.length - before} diagnostics\n`);
    return src;
  };
  const entry = read(ENTRYPOINT);
  r.settle(entry, texts.get(entry)!.text.length, true);
  const target = path.resolve(file), { groups, missing } = plan(target, options.platform, options.with);
  for (const m of missing) io.err(`not here: ${m}\n`);
  const library: number[] = [];
  for (const group of groups) for (const f of group.files) library.push(read(f));
  if (options.settle) for (const src of library) r.settle(src, texts.get(src)!.text.length);
  const src = read(target);
  r.settle(src, texts.get(src)!.text.length);
  const said = r.diagnostics_of(src);
  for (const d of said.sort((a, b) => (a.at?.begin ?? 0) - (b.at?.begin ?? 0)))
    await io.out(`${shown(target)}:${line_col(texts.get(src)!.text, d.at?.begin ?? 0)} ${d.level} ${d.message.replace(/\n/g, ' ')}\n`);
  const elsewhere = r.diagnostics.length - said.length;
  if (options.verbose) io.err(`${groups.reduce((n, g) => n + g.files.length, 0)} files before it (${groups.map(g => path.basename(g.project)).join(', ')}), ${elsewhere} diagnostics in them, ${Math.round(performance.now() - t0)} ms\n`);
  return said.some(d => d.level === 'error' || d.level === 'fatal') ? 1 : 0;
}
