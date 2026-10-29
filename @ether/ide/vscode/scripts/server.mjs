import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const extension = dirname(dirname(fileURLToPath(import.meta.url)));
const library = join(extension, '..', '..');
const host = join(library, 'ray', 'bootstrap');
const server = join(extension, 'server');

rmSync(server, { recursive: true, force: true });
mkdirSync(server, { recursive: true });

// the host (`.entrypoint.mjs`: `--lsp` serves the language server), as it is: it reads the language beside it, from
// `server/@ether`
copyFileSync(join(host, '.entrypoint.mjs'), join(server, '.entrypoint.mjs'));
// the language server, with what it is written on (vscode-languageserver) in it; its reading thread is the same file
await build({
  entryPoints: { '.entrypoint.lsp': join(host, '.entrypoint.lsp.mjs') },
  outdir: server,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['./.entrypoint.mjs'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});

// The library: @ether itself, less what is not the library (this extension, the spec, tests), with the latest revision
// beside Expression.ray, where the host looks for it.
const { revision } = await import(join(host, '.entrypoint.mjs'));
const latest = `.entrypoint.${revision()}.wasm`;
const skip = (dir, name) => ['tests', 'ide', 'spec', 'avatar', 'node_modules'].includes(name) || (dir === host && ['bin', 'scripts', '@ether'].includes(name)) || /^v\d+\./.test(name);
(function copy (dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!skip(dir, entry.name)) copy(join(dir, entry.name)); continue; }
    if (!(entry.name.endsWith('.ray') || (dir === host && entry.name === latest))) continue;
    const to = join(server, '@ether', relative(library, join(dir, entry.name)));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(dir, entry.name), to);
  }
})(library);
