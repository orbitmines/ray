import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const extension = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = join(extension, '..', '..', '..');

writeFileSync(join(extension, 'README.md'), readFileSync(join(repository, 'README.md'), 'utf8').replaceAll('./docs/header.svg)', './docs/header.svg.png)'));
