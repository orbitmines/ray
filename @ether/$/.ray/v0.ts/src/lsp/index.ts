#!/usr/bin/env node
if (process.env.RAY_LSP === 'engine') {
  const [{ Ray }, { Diagnostics }, { start }] = await Promise.all([import('../language.ts'), import('../language/diagnostics.ts'), import('./server.ts')]);
  start(Ray.lsp(new Diagnostics()));
} else {
  const { start } = await import('../kernel/lsp.ts');
  await start();
}
