import { build } from 'esbuild';
import { cpSync, copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const extension = dirname(dirname(fileURLToPath(import.meta.url)));
const language = join(extension, '..', '..');
const implementation = join(language, 'v0.ts');
const server = join(extension, 'server');

rmSync(server, { recursive: true, force: true });
mkdirSync(server, { recursive: true });

await build({
  entryPoints: { language: join(implementation, 'src', 'kernel4', 'language.ts'), lsp: join(implementation, 'src', 'kernel', 'lsp.ts') },
  outdir: server,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});

copyFileSync(join(implementation, 'src', 'kernel', '.kernel.ray'), join(server, '.kernel.ray'));

const library = join(language, 'v0');
(function copy (dir) {
  for (const name of readdirSync(dir)) {
    const from = join(dir, name);
    if (statSync(from).isDirectory()) { if (name !== 'tests') copy(from); continue; }
    if (!name.endsWith('.ray')) continue;
    const to = join(server, 'v0', relative(library, from));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
})(library);
