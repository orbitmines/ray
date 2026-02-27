import fs from 'node:fs/promises';
import path from 'node:path';
import { packagePath, repoPath } from './shard.js';
import type { PackageEntry, RepoEntry, ReleaseEntry } from './types.js';

/**
 * Save package metadata JSON.
 */
export async function savePackageMeta(
  dataRoot: string, platform: string, pkg: PackageEntry, scope?: string
): Promise<void> {
  const dir = packagePath(dataRoot, platform, pkg.name, scope);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Save raw API response verbatim.
 */
export async function saveApiResponse(
  dataRoot: string, platform: string, name: string, raw: unknown, scope?: string
): Promise<void> {
  const dir = packagePath(dataRoot, platform, name, scope);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'api-response.json'), JSON.stringify(raw, null, 2) + '\n');
}

/**
 * Save version-specific metadata.
 */
export async function saveVersionMeta(
  dataRoot: string, platform: string, name: string,
  version: string, meta: unknown, scope?: string
): Promise<void> {
  const dir = path.join(packagePath(dataRoot, platform, name, scope), 'versions');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${version}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
}

/**
 * Get the path where a version tarball should be stored.
 */
export function versionTarballPath(
  dataRoot: string, platform: string, name: string,
  version: string, filename: string, scope?: string
): string {
  return path.join(packagePath(dataRoot, platform, name, scope), 'versions', filename);
}

/**
 * Save repo metadata.
 */
export async function saveRepoMeta(
  dataRoot: string, platform: string, owner: string, repo: string, entry: RepoEntry
): Promise<void> {
  const dir = repoPath(dataRoot, platform, owner, repo);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(entry, null, 2) + '\n');
}

/**
 * Save raw API response for a repo.
 */
export async function saveRepoApiResponse(
  dataRoot: string, platform: string, owner: string, repo: string, raw: unknown
): Promise<void> {
  const dir = repoPath(dataRoot, platform, owner, repo);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'api-response.json'), JSON.stringify(raw, null, 2) + '\n');
}

/**
 * Save release metadata.
 */
export async function saveReleaseMeta(
  dataRoot: string, platform: string, owner: string, repo: string, release: ReleaseEntry
): Promise<void> {
  const dir = path.join(repoPath(dataRoot, platform, owner, repo), 'releases');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${release.tag}.json`), JSON.stringify(release, null, 2) + '\n');
}

/**
 * Get the path for a release asset download.
 */
export function releaseAssetPath(
  dataRoot: string, platform: string, owner: string, repo: string,
  tag: string, filename: string
): string {
  return path.join(repoPath(dataRoot, platform, owner, repo), 'releases', filename);
}

/**
 * Check if a file exists.
 */
export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
