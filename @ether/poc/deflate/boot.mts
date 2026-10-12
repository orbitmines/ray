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
  // (what reading would leave unsaid: a statement whose brackets do not balance (the rest of it is read as something else),
  // a name defined twice in one block (the later replaces the earlier, whatever its parameters))
  const checked = (file: string) => {
    const text = fs.readFileSync(file, 'utf8'), lines = text.split('\n'), said = (line: number, message: string) => console.error(`${path.relative(ether, file)}:${line + 1}: ${message}`);
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }, open: { c: string, line: number }[] = [];
    lines.forEach((line, n) => {
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) { if (c === '\\') i++; else if (c === '"') quoted = false; continue; }
        if (c === '"') quoted = true;
        else if (c === '/' && line[i + 1] === '/') break;
        else if (c === '`') { const end = line.indexOf('`', i + 1); if (end > i) i = end; }
        else if ('([{'.includes(c)) open.push({ c, line: n });
        else if (c in pairs) {
          if (open.length && open[open.length - 1].c === pairs[c]) { open.pop(); continue; }
          const last = open[open.length - 1];
          said(last ? last.line : n, last ? `\`${last.c}\` not closed: line ${n + 1} closes with \`${c}\`` : `\`${c}\` closes nothing open`);
          const k = open.map(o => o.c).lastIndexOf(pairs[c]); if (k >= 0) open.length = k;
        }
      }
      const next = lines.slice(n + 1).find(l => l.trim() && !l.trim().startsWith('//'));
      if (open.length && next !== undefined && !/^\s/.test(next) && !/^[)\]}]/.test(next)) { said(open[0].line, `\`${open[0].c}\` not closed before the next statement`); open.length = 0; }
    });
    const defined = new Map<string, number>(), parents: number[] = [];
    lines.forEach((line, n) => {
      if (!line.trim() || line.trim().startsWith('//')) return;
      const indent = line.length - line.trimStart().length;
      while (parents.length && (lines[parents[parents.length - 1]].length - lines[parents[parents.length - 1]].trimStart().length) >= indent) parents.pop();
      const head = /^\s*(?:static\s+)?([A-Za-z_]\w*)\s*(\([^{}()]*\))?\s*(:=|=>)/.exec(line);
      if (head && (head[2] !== undefined || head[3] === '=>')) {
        const key = (parents[parents.length - 1] ?? -1) + ' ' + head[1], first = defined.get(key);
        if (first !== undefined && lines[first].trim().split(/=>|:=/)[0].trim() !== line.trim().split(/=>|:=/)[0].trim()) said(n, `\`${head[1]}\` defined again (first at line ${first + 1}): this one replaces it`);
        else defined.set(key, n);
      }
      parents.push(n);
    });
  };
  const quietly = (file: string) => { checked(file); for (const statement of statements(file)) { program.steps = 0; try { program.run(statement, { node: program.global }); } catch (error: any) { if (process.env.DEBUG) console.error('threw reading', statement.split('\n')[0].slice(0, 80), '|', String(error?.message).slice(0, 300)); } } };
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
