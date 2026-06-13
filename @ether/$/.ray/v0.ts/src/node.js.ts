export class env {
  private static _fs: typeof import('fs') | undefined;
  private static _path: typeof import('path') | undefined;
  private static _url: typeof import('url') | undefined;
  private static _require: NodeRequire | undefined;

  static import<T>(name: string, cached: T | undefined): T {
    if (cached !== undefined) return cached;
    if (!env.nodejs)
      throw new Error(`Module '${name}' is only available in a Node.js environment.`);
    try {
      // CJS (and tsx ESM, which injects a module-scoped `require`): use it
      // directly. Pure ESM has no `require` — synthesize one via
      // process.getBuiltinModule('module').createRequire, which is
      // synchronous and node-builtin (no module specifier for the bundler
      // to choke on).
      if (!env._require) {
        if (typeof require === 'function') env._require = require;
        else env._require = (process as any).getBuiltinModule('module').createRequire(import.meta.url);
      }
      return env._require!(name);
    } catch (e) { throw new Error(`Failed to load Node.js module '${name}': ${(e as Error).message}`); }
  }

  static get nodejs(): boolean { return typeof process !== 'undefined' && (process as any).versions?.node }
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }

  static variable(name: string): string | undefined {
    const value = env.nodejs ? process.env[name] : (globalThis as any)[name];
    return value === undefined || value === null ? undefined : String(value);
  }

  private static _root?: string;
  static get root(): string {
    if (env._root) return env._root;
    const { fs, path } = env;
    const language_dir = (dir: string) => path.join(dir, '@ether', '$', '.ray');
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = process.cwd();
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Production: package ships @ether/$/.ray inside its tarball — root sits one dir up from src/.
    const pkg = path.resolve(import.meta.dirname, '..');
    if (fs.existsSync(language_dir(pkg))) return env._root = pkg;
    // Development: src lives at <repo>/@ether/$/.ray/v0.ts/src — repo root is five dirs up.
    return env._root = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
  }
}
