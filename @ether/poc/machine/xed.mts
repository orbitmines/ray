// `$/x86/X86.xed.ray` made by Ray from Intel's XED: `Xed.declared_in` reads `xed-isa.txt` (fetched by `external.sh` into
// `.ether/external/xed`, at its pin) a hundred records at a time, each in a run of its own, and `Xed.declaration` writes
// the forms of the instructions it is asked for.
const { booted } = await import('../deflate/boot.mts');
const fs = await import('node:fs'), path = await import('node:path');
const { program } = await booted();
const ether = process.env.ETHER!, isa = path.resolve(ether, '..', '.ether', 'external', 'xed', 'datafiles', 'xed-isa.txt');
const g = { node: program.global }, run = (text: string) => { program.steps = 0; return program.run(text, g); };
const started = performance.now();
const blocks = Number(run('Xed.block_count(' + JSON.stringify(isa) + ')'));
run('xed_classes := []');
run('xed_entries := []');
run('xed_left_out := 0');
for (let from = 0; from < blocks; from += 100) {
  run('xed_part := Xed.declared_in(' + JSON.stringify(isa) + ', ' + from + ', 100)');
  run('xed_classes.joined(xed_part.classes)');
  run('xed_entries.joined(xed_part.entries)');
  run('xed_left_out = xed_left_out + xed_part.left_out');
  await new Promise(resolve => setImmediate(resolve));
  console.log('  read', Math.min(from + 100, blocks), 'of', blocks, 'blocks,', Number(run('xed_classes.count')), 'forms so far');
}
const text = run('Xed.declaration(xed_classes, xed_entries, xed_left_out)');
if (typeof text !== 'string') { console.error('not made:', String(text).slice(0, 200)); process.exit(1); }
const made = path.join(ether, '$', 'x86', 'X86.xed.ray');
fs.writeFileSync(made + '.new', text);
fs.renameSync(made + '.new', made);
console.log('X86.xed.ray:', text.split('\n')[1], Math.round((performance.now() - started) / 1000), 's');
