import { readdirSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Bundle ONLY the language's `.ray` files into the package for publishing, mirroring
// the loader's skip of `ide/` and versioned implementation dirs (`v*.*`, e.g. this
// very `v0.ts`). The tarball ships them under `@ether/$/.ray`, which `nodejs.root`
// looks for at the package root in production.
const pkg = dirname(dirname(fileURLToPath(import.meta.url))); // v0.ts
process.chdir(pkg);

const SRC = '..';              // language definition root: the parent @ether/$/.ray
const DEST = '@ether/$/.ray';  // where the published package expects the definitions

const skip = (name) => name === 'ide' || (name.startsWith('v') && name.includes('.'));

rmSync(DEST, { recursive: true, force: true });
const manifest = [];
(function walk(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (skip(e.name)) continue;
      walk(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    } else if (e.name.endsWith('.ray')) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      mkdirSync(dirname(join(DEST, r)), { recursive: true });
      copyFileSync(join(dir, e.name), join(DEST, r));
      manifest.push(`${DEST}/${r}`);
    }
  }
})(SRC, '');

writeFileSync('src/bundled.ts', `export const manifest: string[] = ${JSON.stringify(manifest)};\n`);
