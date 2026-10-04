// Serves the browser example, cross-origin isolated (so the page gets SharedArrayBuffer and workers), bundling the
// TypeScript with esbuild on request. `node --import tsx src/kernel2/web/serve.ts [port]`, then open http://localhost:8421.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url)), port = Number(process.argv[2] ?? 8421);
const bundles: Record<string, string> = { '/dist/main.js': 'web/main.ts', '/dist/worker.js': 'runtime/worker.ts' };

async function bundle(entry: string) {
  const r = await build({ entryPoints: [root + entry], bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022', external: ['node:*'] });
  return r.outputFiles[0].text;
}

createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://x').pathname;
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  try {
    if (path in bundles) { response.setHeader('Content-Type', 'text/javascript'); response.end(await bundle(bundles[path])); return; }
    if (path.startsWith('/examples/')) { response.setHeader('Content-Type', 'text/plain'); response.end(await readFile(root + path.slice(1))); return; }
    response.setHeader('Content-Type', 'text/html'); response.end(await readFile(root + 'web/index.html'));
  } catch (e) { response.statusCode = 500; response.end(String(e)); }
}).listen(port, () => console.log(`http://localhost:${port}`));
