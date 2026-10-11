// Each body in the file (split at lines `---`) read as a class `Probe` alone, after the boot; says whether the class is made.
const { booted } = await import('./boot.mts');
const fs = await import('node:fs');
const { program } = await booted();
const bodies = fs.readFileSync(process.argv[2], 'utf8').split(/^---$/m).map((body: string) => body.trim()).filter(Boolean);
bodies.forEach((body: string, index: number) => {
  program.steps = 0;
  try { program.run('Probe' + index + ' := class: Language {\n  static Marker := [1, 2]\n' + body.split('\n').map((line: string) => '  ' + line).join('\n') + '\n}', { node: program.global }); } catch {}
  let made: unknown;
  try { made = program.run('Probe' + index + '.Marker.count', { node: program.global }); } catch {}
  console.log(made === 2 ? 'made    ' : 'NOT MADE', body.split('\n')[0].slice(0, 110));
});
