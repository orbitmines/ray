#!/usr/bin/env node
// The language server over stdio: the language as the seed reads it (src/language.ts). With a directory: the language to read.
const { lsp } = await import('../language.ts');
await lsp({ library: process.argv.slice(2).find(a => !a.startsWith('-')) });
