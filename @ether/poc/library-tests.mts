// The library's tests as `language.ts --test` runs them, in this process (its worker needs Node's own TypeScript): every
// test file read, then what was put off run; each failure printed, then how many failed.
const ether = process.env.ETHER!;
const { Library, Program, EXTENSION } = await import(`${ether}/v0.ts/src/language.ts`);
const path = await import('node:path'), fs = await import('node:fs');
const library: any = await new Library({ root: path.dirname(ether) }).boot();
const files: string[] = library.tests().map((file: string) => path.resolve(file));
for (const file of files) {
  if (fs.statSync(file).isDirectory()) { library.project(file); continue; }
  library.prepare(file);
  if (!library.diagnostics.has(file)) library.file(file, library.text(file), path.dirname(file) === library.core || file.endsWith('.project' + EXTENSION) ? library.program.global : new Program.Node(library.program.global));
}
const all: any[] = [];
for (const [, said] of library.diagnostics) all.push(...said);
all.push(...library.test());
const failed = all.filter(said => said.severity === 1);
for (const said of failed) console.log(`${said.file ? path.relative(ether, said.file) : '?'}: ${String(said.message).slice(0, 160)} | ${String(said.around ?? '').split('\n').filter((line: string) => line.trim().startsWith('//')).pop()?.trim() ?? ''}`);
console.log(`${files.length} files, ${failed.length} failed`);
