// (booted as `poc/deflate/boot.mts` boots language3: the core library read in the order it needs itself)
const { booted, Program } = await import('../deflate/boot.mts');
const fs = await import('node:fs');
const { program } = await booted();
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
let failed = 0;
for (const file of process.argv.slice(2)) failed += read(file, true);
process.exitCode = failed ? 1 : 0;
