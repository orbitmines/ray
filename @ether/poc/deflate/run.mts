// The strict claim runner: each `unless`/`if … { INFO@mark … }` claim holds only when its condition answers the `true` node
// (`false` or `None` for `if`), so a condition left unread fails.
const { booted, Program } = await import('./boot.mts');
const { program, statements } = await booted();
const yes = program.run('true', { node: program.global }), no = program.run('false', { node: program.global }), none = program.run('None', { node: program.global });
const shown = (value: unknown) => value instanceof Program.Node ? 'node(' + value.rules.slice(0, 8).map((rule: any) => rule.head).join(', ') + ')' : JSON.stringify(value);
let failed = 0;
for (const file of process.argv.slice(2)) for (const statement of statements(file)) {
  const claim = /^(unless|if) (.*) \{ INFO@mark `([A-Za-z]+[0-9][0-9A-Za-z.]* [^`]*)` \}$/s.exec(statement.trim());
  if (process.env.RD) { const c = program.candidates(statement.trim(), program.global, 0); console.log('>', statement.trim()); for (const r of program.readings(statement.trim(), c, false).slice(-6)) console.log('   ', r.rule.head, JSON.stringify(r.spans), r.at); }
  let value: unknown;
  program.steps = 0;
  try { value = program.run(claim ? claim[2] : statement, { node: program.global }); } catch (error: any) { value = 'threw ' + error?.message; }
  if (claim) {
    const held = claim[1] === 'unless' ? value === yes : value === no || value === none;
    if (!held) failed++;
    console.log(held ? 'ok  ' : 'FAIL', claim[3], held ? '' : '(answered ' + shown(value) + ')');
  }
  else if (process.env.SHOW) console.log('    ', statement.split('\n')[0], '=', shown(value));
}
process.exitCode = failed ? 1 : 0;
