import { LANGUAGE_TO_REGISTRY } from './core/registry-map.js';

const names = process.argv.slice(2);
for (const n of names) {
  if (LANGUAGE_TO_REGISTRY[n]) {
    console.log(LANGUAGE_TO_REGISTRY[n]);
    process.exit(0);
  }
}
process.exit(1);
