import type { PlatformConfig } from './types.js';

/**
 * All known registry platforms.
 */
export const REGISTRY_PLATFORMS: Record<string, PlatformConfig> = {
  npm: {
    id: 'npm',
    name: 'npm',
    kind: 'registry',
    baseUrl: 'https://registry.npmjs.org',
    rateLimit: { requests: 100, windowMs: 60_000 },
  },
  pypi: {
    id: 'pypi',
    name: 'PyPI',
    kind: 'registry',
    baseUrl: 'https://pypi.org',
    rateLimit: { requests: 100, windowMs: 60_000 },
  },
  'crates-io': {
    id: 'crates-io',
    name: 'crates.io',
    kind: 'registry',
    baseUrl: 'https://crates.io',
    rateLimit: { requests: 10, windowMs: 10_000 },
  },
  maven: {
    id: 'maven',
    name: 'Maven Central',
    kind: 'registry',
    baseUrl: 'https://search.maven.org',
    rateLimit: { requests: 30, windowMs: 60_000 },
  },
  nuget: {
    id: 'nuget',
    name: 'NuGet',
    kind: 'registry',
    baseUrl: 'https://api.nuget.org',
    rateLimit: { requests: 100, windowMs: 60_000 },
  },
  rubygems: {
    id: 'rubygems',
    name: 'RubyGems',
    kind: 'registry',
    baseUrl: 'https://rubygems.org',
    rateLimit: { requests: 10, windowMs: 10_000 },
  },
  go: {
    id: 'go',
    name: 'Go Module Index',
    kind: 'registry',
    baseUrl: 'https://index.golang.org',
    rateLimit: { requests: 50, windowMs: 60_000 },
  },
  hackage: {
    id: 'hackage',
    name: 'Hackage',
    kind: 'registry',
    baseUrl: 'https://hackage.haskell.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  hex: {
    id: 'hex',
    name: 'Hex.pm',
    kind: 'registry',
    baseUrl: 'https://hex.pm',
    rateLimit: { requests: 100, windowMs: 60_000 },
  },
  'pub-dev': {
    id: 'pub-dev',
    name: 'pub.dev',
    kind: 'registry',
    baseUrl: 'https://pub.dev',
    rateLimit: { requests: 50, windowMs: 60_000 },
  },
  cpan: {
    id: 'cpan',
    name: 'CPAN (MetaCPAN)',
    kind: 'registry',
    baseUrl: 'https://fastapi.metacpan.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  cran: {
    id: 'cran',
    name: 'CRAN',
    kind: 'registry',
    baseUrl: 'https://cran.r-project.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  packagist: {
    id: 'packagist',
    name: 'Packagist',
    kind: 'registry',
    baseUrl: 'https://packagist.org',
    rateLimit: { requests: 50, windowMs: 60_000 },
  },
  cocoapods: {
    id: 'cocoapods',
    name: 'CocoaPods',
    kind: 'registry',
    baseUrl: 'https://cdn.cocoapods.org',
    rateLimit: { requests: 50, windowMs: 60_000 },
  },
  conda: {
    id: 'conda',
    name: 'Conda',
    kind: 'registry',
    baseUrl: 'https://conda.anaconda.org',
    rateLimit: { requests: 30, windowMs: 60_000 },
  },
  opam: {
    id: 'opam',
    name: 'opam',
    kind: 'registry',
    baseUrl: 'https://opam.ocaml.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  clojars: {
    id: 'clojars',
    name: 'Clojars',
    kind: 'registry',
    baseUrl: 'https://clojars.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  luarocks: {
    id: 'luarocks',
    name: 'LuaRocks',
    kind: 'registry',
    baseUrl: 'https://luarocks.org',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
  nimble: {
    id: 'nimble',
    name: 'Nimble',
    kind: 'registry',
    baseUrl: 'https://nimble.directory',
    rateLimit: { requests: 20, windowMs: 60_000 },
  },
};

/**
 * All known VCS platforms.
 */
export const VCS_PLATFORMS: Record<string, PlatformConfig> = {
  GitHub: {
    id: 'GitHub',
    name: 'GitHub',
    kind: 'vcs',
    baseUrl: 'https://api.github.com',
    rateLimit: { requests: 30, windowMs: 60_000 },
  },
  GitLab: {
    id: 'GitLab',
    name: 'GitLab',
    kind: 'vcs',
    baseUrl: 'https://gitlab.com/api/v4',
    rateLimit: { requests: 30, windowMs: 60_000 },
  },
  Bitbucket: {
    id: 'Bitbucket',
    name: 'Bitbucket',
    kind: 'vcs',
    baseUrl: 'https://api.bitbucket.org/2.0',
    rateLimit: { requests: 30, windowMs: 60_000 },
  },
};

/**
 * Language name → registry platform ID mapping.
 * Multiple languages can map to the same registry.
 */
export const LANGUAGE_TO_REGISTRY: Record<string, string> = {
  JavaScript: 'npm',
  TypeScript: 'npm',
  Python: 'pypi',
  Rust: 'crates-io',
  Java: 'maven',
  Kotlin: 'maven',
  Scala: 'maven',
  'C#': 'nuget',
  CSharp: 'nuget',
  'F#': 'nuget',
  FSharp: 'nuget',
  Ruby: 'rubygems',
  Go: 'go',
  Haskell: 'hackage',
  Elixir: 'hex',
  Erlang: 'hex',
  Dart: 'pub-dev',
  Perl: 'cpan',
  R: 'cran',
  PHP: 'packagist',
  Swift: 'cocoapods',
  ObjectiveC: 'cocoapods',
  Clojure: 'clojars',
  Lua: 'luarocks',
  OCaml: 'opam',
  Nim: 'nimble',
};

/**
 * Resolve a language name to its registry platform config.
 */
export function resolveRegistry(language: string): PlatformConfig | null {
  const platformId = LANGUAGE_TO_REGISTRY[language];
  if (!platformId) return null;
  return REGISTRY_PLATFORMS[platformId] ?? null;
}

/**
 * Resolve a platform ID (from either registries or VCS).
 */
export function resolvePlatform(id: string): PlatformConfig | null {
  return REGISTRY_PLATFORMS[id] ?? VCS_PLATFORMS[id] ?? null;
}

/**
 * Get all registry platform configs.
 */
export function allRegistries(): PlatformConfig[] {
  return Object.values(REGISTRY_PLATFORMS);
}

/**
 * Get all VCS platform configs.
 */
export function allVCS(): PlatformConfig[] {
  return Object.values(VCS_PLATFORMS);
}

/**
 * Get printable mapping table: language → registry.
 */
export function registryMappingTable(): { language: string; registry: string; platformId: string }[] {
  const rows: { language: string; registry: string; platformId: string }[] = [];
  const seen = new Set<string>();
  for (const [lang, platformId] of Object.entries(LANGUAGE_TO_REGISTRY)) {
    const platform = REGISTRY_PLATFORMS[platformId];
    if (!platform) continue;
    const key = `${lang}→${platformId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ language: lang, registry: platform.name, platformId });
  }
  return rows;
}
