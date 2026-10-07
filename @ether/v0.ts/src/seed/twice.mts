// usage: twice.mts FILE.ray — reads a file as the language server does, twice (an editor's two versions of it), and prints what
// each reading said and how much it painted: the two should agree.
const { Ray } = await import('../language.ts');
const fs = await import('fs'), path = await import('path');
const file = path.resolve(process.argv[2]), s = fs.readFileSync(file, 'utf8');
const ray = new Ray({ paint: true }).boot().read_library();
for (const version of [1, 2, 3]) {
  const read = ray.file(file, version === 1 ? s : s + '\n'.repeat(version - 1), false, ray.prepare(file));
  console.log('version', version, read.diagnostics.length, 'diagnostics,', read.paints.length, 'paints');
}
