import type { PlatformConfig, PackageEntry, RepoEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';

/**
 * Interface for package registry adapters (npm, PyPI, crates.io, etc.)
 */
export interface RegistryAdapter {
  platform: PlatformConfig;

  /**
   * Full enumeration: yield every package from the registry.
   * Adapters should call indexer.checkpoint() periodically with their cursor.
   * Resumes from indexer.getCursor() if non-null.
   */
  enumerate(indexer: Indexer): AsyncGenerator<PackageEntry>;

  /**
   * Incremental update: yield only packages changed since last sync.
   * Uses indexer.getCursor() to determine where to start.
   */
  enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry>;

  /**
   * Fetch a single package's metadata.
   */
  fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry>;

  /**
   * Download a specific version's tarball/archive.
   */
  downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void>;
}

/**
 * Interface for VCS platform adapters (GitHub, GitLab, Bitbucket).
 */
export interface VCSAdapter {
  platform: PlatformConfig;

  /**
   * Enumerate all repositories. Yields repo entries.
   * Resumes from indexer.getCursor().
   */
  enumerate(indexer: Indexer): AsyncGenerator<RepoEntry>;

  /**
   * Incremental update: yield repos created/updated since last sync.
   */
  enumerateIncremental(indexer: Indexer): AsyncGenerator<RepoEntry>;

  /**
   * Clone a single repo (git clone --bare) or update (git fetch) if exists.
   * Also fetches releases.
   */
  cloneRepo(indexer: Indexer, owner: string, repo: string): Promise<void>;

  /**
   * Fetch metadata only for a repo (no git clone).
   */
  fetchRepo(indexer: Indexer, owner: string, repo: string): Promise<RepoEntry>;

  /**
   * Fetch all releases/tags + download assets.
   */
  fetchReleases(indexer: Indexer, owner: string, repo: string): Promise<void>;

  /**
   * Fetch a single release by tag.
   */
  fetchRelease(indexer: Indexer, owner: string, repo: string, tag: string): Promise<void>;
}

/**
 * Registry of all adapters, keyed by platform ID.
 */
const registryAdapters = new Map<string, () => Promise<RegistryAdapter>>();
const vcsAdapters = new Map<string, () => Promise<VCSAdapter>>();

export function registerRegistryAdapter(platformId: string, factory: () => Promise<RegistryAdapter>): void {
  registryAdapters.set(platformId, factory);
}

export function registerVCSAdapter(platformId: string, factory: () => Promise<VCSAdapter>): void {
  vcsAdapters.set(platformId, factory);
}

export async function getRegistryAdapter(platformId: string): Promise<RegistryAdapter | null> {
  const factory = registryAdapters.get(platformId);
  if (!factory) return null;
  return factory();
}

export async function getVCSAdapter(platformId: string): Promise<VCSAdapter | null> {
  const factory = vcsAdapters.get(platformId);
  if (!factory) return null;
  return factory();
}

export function allRegistryAdapterIds(): string[] {
  return [...registryAdapters.keys()];
}

export function allVCSAdapterIds(): string[] {
  return [...vcsAdapters.keys()];
}
