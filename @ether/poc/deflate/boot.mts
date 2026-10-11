// The language as the host's `Library` boots it (the entrypoint, the host's kinds, the core library in the order it needs
// itself), then the host's rules again as the latest (`KINDS_AFTER`), then the files in `LOAD`. Tests (`assert`) are put off.
const ether = process.env.ETHER!;
const { Program, Library } = await import(`${ether}/v0.ts/src/language.ts`);
const fs = await import('node:fs'), path = await import('node:path');

export { Program };
export const booted = async () => {
  const library: any = new Library({ root: path.dirname(ether) });
  await library.boot();
  const program: any = library.program;
  if (process.env.STEPS) { const read = program.read, limit = Number(process.env.STEPS); program.read = function (...args: unknown[]) { if (++program.steps > limit) throw new Error('ran away at ' + String(args[0]).slice(0, 80)); return read.apply(this, args); }; program.steps = 0; }
  const statements = (file: string) => program.code(fs.readFileSync(file, 'utf8')).statements.filter((statement: string) => statement.trim() && !statement.trim().startsWith('//') && !/^@[\w./-]+$/.test(statement.trim()));
  const quietly = (file: string) => { for (const statement of statements(file)) { program.steps = 0; try { program.run(statement, { node: program.global }); } catch (error: any) { if (process.env.DEBUG) console.error('threw reading', statement.split('\n')[0].slice(0, 80), '|', String(error?.message).slice(0, 300)); } } };
  const kinds = fs.readFileSync(path.join(ether, 'v0.ts/src/js.kinds.ray'), 'utf8');
  if (process.env.KINDS_AFTER) for (const statement of program.code(kinds).statements) {
    const head = statement.split('\n')[0];
    if (!/=>\s*$/.test(head) || head.includes('{{')) continue;
    program.run(statement, { node: program.global });
    const rule = program.global.rules.find((rule: any) => rule.head === program.head(head.trimEnd().slice(0, -2).trim()).head);
    if (rule) { rule.id = ++Program.Node.defined; program.global.headed++; }
  }
  for (const file of (process.env.LOAD ?? '').split(',').filter(Boolean)) quietly(path.resolve(ether, file));
  return { program, statements, library };
};
