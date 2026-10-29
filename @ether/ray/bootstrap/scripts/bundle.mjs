// The package's @ether: the language's `.ray` files (not ide/, spec/, avatar/, node_modules/, or this package's own copy),
// with the latest revision beside Expression.ray, mirroring the repository, where `.entrypoint.mjs` looks for it when
// published; README.md and LICENSE from the repository root. `--clean` removes them again (after packing).
import { readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const library = join(pkg, '..', '..');
const DEST = join(pkg, '@ether');

rmSync(DEST, { recursive: true, force: true });
for (const file of ['README.md', 'LICENSE']) rmSync(join(pkg, file), { force: true });
if (process.argv.includes('--clean')) process.exit(0);

const skip = (dir, name) => ['ide', 'spec', 'avatar', 'node_modules'].includes(name) || (dir === pkg && ['bin', 'scripts'].includes(name)) || join(dir, name) === DEST || /^v\d+\./.test(name);
const { revision } = await import(join(pkg, '.entrypoint.mjs'));
const latest = `.entrypoint.${revision()}.wasm`;
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!skip(dir, e.name)) walk(join(dir, e.name)); continue; }
    if (!(e.name.endsWith('.ray') || (dir === pkg && e.name === latest))) continue;
    const to = join(DEST, relative(library, join(dir, e.name)));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(dir, e.name), to);
  }
})(library);
for (const file of ['README.md', 'LICENSE']) copyFileSync(join(library, '..', file), join(pkg, file));
