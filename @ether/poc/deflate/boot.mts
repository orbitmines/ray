// language3 as `site3.mts` boots it: the entrypoint with the host's operators where its logic begins, the host's kinds, the
// core library in the order it needs itself, the host's rules again after it (`KINDS_AFTER`), then the files in `LOAD`.
const ether = process.env.ETHER!;
const { Program, Text } = await import(`${ether}/v0.ts/src/language3.ts`);
const fs = await import('node:fs'), path = await import('node:path');

export { Program };
export const booted = async () => {
  const entry = fs.readFileSync(path.join(ether, 'ray/.entrypoint.ray2'), 'utf8'), kinds = fs.readFileSync(path.join(ether, 'v0.ts/src/js3.kinds.ray'), 'utf8');
  const ops = kinds.indexOf('// What both answer'), made_of = kinds.indexOf('// What a number or text is made of'), logic = entry.indexOf('// What a value answers to `?`');
  const source = new Text.Source('@ether/ray/.entrypoint.ray2');
  source.value = entry.slice(0, logic) + kinds.slice(ops, made_of) + '\n' + entry.slice(logic);
  const program: any = new Program(source);
  await program.compile();
  program.run(kinds.slice(0, ops) + '\n' + kinds.slice(made_of), { node: program.global });
  if (process.env.STEPS) { const read = program.read, limit = Number(process.env.STEPS); program.read = function (...args: unknown[]) { if (++program.steps > limit) throw new Error('ran away at ' + String(args[0]).slice(0, 80)); return read.apply(this, args); }; program.steps = 0; }
  const statements = (file: string) => program.code(fs.readFileSync(file, 'utf8')).statements.filter((statement: string) => statement.trim() && !statement.trim().startsWith('//') && !/^@[\w./-]+$/.test(statement.trim()));
  const quietly = (file: string) => { for (const statement of statements(file)) { program.steps = 0; try { program.run(statement, { node: program.global }); } catch (error: any) { if (process.env.DEBUG) console.error('threw reading', statement.split('\n')[0].slice(0, 80), '|', String(error?.message).slice(0, 300)); } } };
  const reading_order = (files: string[]): string[] => {
    const texts = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
    const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
    const info = files.map(file => ({ file, defines: defines(texts.get(file)!), uses: new Set(texts.get(file)!.match(/[A-Za-z_][\w]*/g) ?? []) }));
    const needs = new Map(info.map(f => [f.file, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.file))]));
    const order: string[] = [], left = new Set(files);
    while (left.size > 0) { const waiting = (file: string) => [...needs.get(file)!].filter(other => left.has(other)).length; const next = [...left].sort((a, b) => waiting(a) - waiting(b) || (a < b ? -1 : 1))[0]; order.push(next); left.delete(next); }
    return order;
  };
  const library = path.join(ether, 'ray');
  if (!process.env.NOLIB) for (const file of reading_order(fs.readdirSync(library).filter((file: string) => file.endsWith('.ray') && !file.startsWith('.')).map((file: string) => path.join(library, file)))) quietly(file);
  if (process.env.KINDS_AFTER) for (const statement of program.code(kinds).statements) {
    const head = statement.split('\n')[0];
    if (!/=>\s*$/.test(head) || head.includes('{{')) continue;
    program.run(statement, { node: program.global });
    const rule = program.global.rules.find((rule: any) => rule.head === program.head(head.trimEnd().slice(0, -2).trim()).head);
    if (rule) { rule.id = ++Program.Node.defined; program.global.headed++; }
  }
  for (const file of (process.env.LOAD ?? '').split(',').filter(Boolean)) quietly(path.resolve(ether, file));
  return { program, statements };
};
