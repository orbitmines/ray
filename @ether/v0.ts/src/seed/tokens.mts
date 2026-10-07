// usage: tokens.mts OUT FILE.ray… — the semantic tokens the language server sends for each file (read as it reads them, in one
// reading of the language and its library), decoded one per line (`line char length type text`) into OUT/<dir>_<name>.tok.
// Run as lib.mts is (ulimit -s unlimited; node --stack-size=20000 --import <tsx loader> tokens.mts OUT FILES…).
const { Readings, TOKEN_TYPES } = await import('../language.ts');
const { encode } = await import('../lsp/semantics.ts');
const fs = await import('fs'), path = await import('path');
const [out, ...files] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const readings = new Readings({ paint: process.env.PAINT !== '0' }, 2), base = readings.base;
console.log('library', Math.round(process.memoryUsage().heapUsed / 1048576), 'MB heap');
const legend = [...TOKEN_TYPES];
for (const style of base.painter?.styles ?? []) { const type = style.split('.')[0]; if (!legend.includes(type)) legend.push(type); }
for (const f of files) {
  const file = path.resolve(f), s = fs.readFileSync(file, 'utf8');
  const ray = readings.for(file), read = (ray.core(file) ? ray.of(file) : undefined) ?? ray.file(file, s, false, ray.prepare(file));
  const data = encode(read.text.s, read.paints as any, legend), lines = read.text.s.split('\n'), dump: string[] = [];
  let line = 0, ch = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i]; ch = data[i] === 0 ? ch + data[i + 1] : data[i + 1];
    dump.push(`${line + 1}\t${ch}\t${data[i + 2]}\t${legend[data[i + 3]]}\t${lines[line].slice(ch, ch + data[i + 2])}`);
  }
  fs.writeFileSync(path.join(out, file.split('/').slice(-2).join('_') + '.tok'), dump.join('\n') + '\n');
  console.log(path.basename(file), data.length / 5, 'tokens,', read.diagnostics.length, 'diagnostics,', Math.round(process.memoryUsage().heapUsed / 1048576), 'MB heap');
}
