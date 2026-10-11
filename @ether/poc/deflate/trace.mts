const { booted } = await import('./boot.mts');
const { program } = await booted();
const seen: string[] = [], read = program.read;
program.read = function (...args: unknown[]) { seen.push(String(args[0]).replace(/\s+/g, ' ').slice(0, 120)); if (seen.length > 400000) seen.shift(); return read.apply(this, args); };
try { program.run(process.argv[2], { node: program.global }); console.log('no error'); } catch (error: any) {
  console.log(String(error?.message));
  if (process.env.IS_LINES) { const shown = new Set<string>(); for (const text of seen) if (text.includes(process.env.IS_LINES) && !shown.has(text)) { shown.add(text); if (shown.size <= 25) console.log('   ', text); } }
  const counts = new Map<string, number>();
  for (const text of seen) counts.set(text, (counts.get(text) ?? 0) + 1);
  for (const [text, count] of [...counts].filter(([text]) => !process.env.LONG || text.length > Number(process.env.LONG)).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(count).padStart(5), text);
}
