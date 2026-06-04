import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  // The `@orbitmines/ray` package's main is a `.ts` file. esbuild handles TS
  // imports natively, so the only thing we need is to pull `.ts` source files
  // into the bundle when their `.js` sibling doesn't exist.
  resolveExtensions: ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
