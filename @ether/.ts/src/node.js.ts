let _fs: typeof import('fs') | undefined;
let _path: typeof import('path') | undefined;
let _require: NodeRequire | undefined;

function load<T>(name: string, cached: T | undefined): T {
  if (cached !== undefined) return cached;
  if (!nodejs.enabled)
    throw new Error(`Module '${name}' is only available in a Node.js environment.`);
  try {
    // CJS (and tsx ESM, which injects a module-scoped `require`): use it
    // directly. Pure ESM has no `require` — synthesize one via
    // process.getBuiltinModule('module').createRequire, which is
    // synchronous and node-builtin (no module specifier for the bundler
    // to choke on).
    if (!_require) {
      if (typeof require === 'function') _require = require;
      else _require = (process as any).getBuiltinModule('module').createRequire(import.meta.url);
    }
    return _require!(name);
  } catch (e) { throw new Error(`Failed to load Node.js module '${name}': ${(e as Error).message}`); }
}

export class nodejs {
  static get enabled(): boolean { return typeof process !== 'undefined' && (process as any).versions?.node }
  static get fs(): typeof import('fs') { return _fs ??= load('fs', _fs); }
  static get path(): typeof import('path') { return _path ??= load('path', _path); }

  private static _root?: string;
  static get root(): string {
    if (nodejs._root) return nodejs._root;
    const { fs, path } = nodejs;
    // Production: package ships @ether/$/.ray inside its tarball — root sits one dir up from src/.
    const pkg = path.resolve(import.meta.dirname, '..');
    if (fs.existsSync(path.join(pkg, '@ether', '$', '.ray'))) return nodejs._root = pkg;
    // Development: src lives at <repo>/@ether/.ts/src — repo root is three dirs up.
    return nodejs._root = path.resolve(import.meta.dirname, '..', '..', '..');
  }
}
