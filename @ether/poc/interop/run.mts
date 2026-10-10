const ether = process.env.ETHER!;
const { Readings } = await import(`${ether}/v0.ts/src/language.ts`);
const fs = await import('node:fs');
const readings = new Readings({});
for (const file of process.argv.slice(2)) {
  const ray = readings.for(file), scope = ray.prepare(file);
  const read = ray.file(file, fs.readFileSync(file, 'utf8'), false, scope);
  for (const line of read.written) console.log(line);
  for (const d of read.diagnostics) console.log(`${read.text.s.slice(0, d.begin).split('\n').length}: ${d.message}`);
}
