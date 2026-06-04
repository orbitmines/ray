// Public API surface of @orbitmines/ray. Anything a downstream consumer
// (the VS Code extension, etc.) needs to import goes through here.
//
// Note: the language server (src/language_server/) is intentionally NOT
// re-exported. It runs in its own subprocess (launched via the `bin` entry
// or `tsx`), and its dependencies — vscode-languageserver — should never end
// up in a consuming process's bundle.
export * from './src/version.ts';
export * from './src/language.ts';
