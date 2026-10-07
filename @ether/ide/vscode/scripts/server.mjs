import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const extension = dirname(dirname(fileURLToPath(import.meta.url)));
const language = join(extension, '..', '..');
const implementation = join(language, 'v0.ts');
const server = join(extension, 'server');

rmSync(server, { recursive: true, force: true });
mkdirSync(server, { recursive: true });

await build({
  // the language (src/language.ts): `--lsp` serves the language server, its reader runs in a worker of the same file
  entryPoints: { language: join(implementation, 'src', 'language.ts') },
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

// The library: @ether itself, less what is not the library (this extension, the implementation, the spec, tests).
const library = language;
const skip = (name) => ['tests', 'ide', 'spec', 'avatar', 'node_modules'].includes(name) || (name.startsWith('v') && name.includes('.'));
(function copy (dir) {
  for (const name of readdirSync(dir)) {
    const from = join(dir, name);
    if (statSync(from).isDirectory()) { if (!skip(name)) copy(from); continue; }
    if (!name.endsWith('.ray')) continue;
    const to = join(server, '@ether', relative(library, from));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
})(library);
