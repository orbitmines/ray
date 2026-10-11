const ether = process.env.ETHER!;
const { Program, Text } = await import(`${ether}/v0.ts/src/language3.ts`);
const fs = await import('node:fs'), path = await import('node:path');
const entry = fs.readFileSync(path.join(ether, 'ray/.entrypoint.ray2'), 'utf8'), kinds = fs.readFileSync(path.join(ether, 'v0.ts/src/js3.kinds.ray'), 'utf8');
const ops = kinds.indexOf('// What both answer'), made_of = kinds.indexOf('// What a number or text is made of'), logic = entry.indexOf('// What a value answers to `?`');
const source = new Text.Source('@ether/ray/.entrypoint.ray2');
source.value = entry.slice(0, logic) + kinds.slice(ops, made_of) + '\n' + entry.slice(logic);
const program: any = new Program(source);
await program.compile();
program.run(kinds.slice(0, ops) + '\n' + kinds.slice(made_of), { node: program.global });
const yes = program.run('true', { node: program.global }), no = program.run('false', { node: program.global }), none = program.run('None', { node: program.global });
const shown = (value: unknown) => value instanceof Program.Node ? 'node(' + value.rules.slice(0, 8).map((rule: any) => rule.head).join(', ') + ')' : JSON.stringify(value);
const read = (file: string, said: boolean) => {
  let fired = 0;
  for (const statement of program.code(fs.readFileSync(file, 'utf8')).statements) {
    if (!statement.trim() || statement.trim().startsWith('//')) continue;
    const claim = said ? /^(unless|if) (.*) \{ INFO@mark `([A-Za-z]+[0-9][0-9A-Za-z.]* [^`]*)` \}$/.exec(statement.trim()) : null;
    let value: unknown;
    try { value = program.run(claim ? claim[2] : statement, { node: program.global }); } catch (error: any) { value = 'threw ' + error?.message; }
    if (!said) continue;
    if (claim) {
      const held = claim[1] === 'unless' ? value === yes : value === no || value === none;
      if (!held) fired++;
      console.log(held ? 'ok  ' : 'FAIL', claim[3], held ? '' : '(answered ' + shown(value) + ')');
    }
    else if (process.env.SHOW) console.log('    ', statement.split('\n')[0], '=', shown(value));
  }
  return fired;
};
const library = path.join(ether, 'ray');
for (const file of fs.readdirSync(library).filter((file: string) => file.endsWith('.ray') && !file.startsWith('.'))) read(path.join(library, file), false);
let failed = 0;
for (const file of process.argv.slice(2)) failed += read(file, true);
process.exitCode = failed ? 1 : 0;
