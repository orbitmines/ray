import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Packagist package registry adapter (PHP / Composer).
 *
 * API endpoints:
 *   - Full list:     GET https://packagist.org/packages/list.json
 *   - Per-package:   GET https://packagist.org/packages/{vendor}/{name}.json
 *   - Incremental:   GET https://packagist.org/metadata/changes.json?since={timestamp}
 *
 * ~400K packages. Package names are in "vendor/name" format.
 */

const BASE = 'https://packagist.org';

interface PackagistList {
  packageNames: string[];
}

interface PackagistChanges {
  actions: PackagistChangeAction[];
  timestamp: number;
}

interface PackagistChangeAction {
  type: 'update' | 'delete' | 'resync' | 'new';
  package: string;
  time: string;
}

interface PackagistPackageResponse {
  package: PackagistPackageData;
}

interface PackagistPackageData {
  name: string;
  description?: string;
  time?: string;
  maintainers?: { name: string; avatar_url: string }[];
  versions: Record<string, PackagistVersionData>;
  type?: string;
  repository?: string;
  github_stars?: number;
  github_forks?: number;
  downloads?: { total: number; monthly: number; daily: number };
  fapiVersion?: number;
  language?: string;
}

interface PackagistVersionData {
  name: string;
  description?: string;
  version: string;
  version_normalized: string;
  license?: string[];
  homepage?: string;
  time?: string;
  dist?: {
    url: string;
    type: string;
    shasum: string;
    reference?: string;
  };
  source?: {
    url: string;
    type: string;
    reference?: string;
  };
  require?: Record<string, string>;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['packagist'];

export class PackagistAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['packagist'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Get the full package name list
    const list = await fetchJson<PackagistList>(`${BASE}/packages/list.json`, indexer.httpOpts);
    const names = list.packageNames;

    // Resume from cursor if available (index into the names array)
    const cursor = indexer.getCursor();
    let startIdx = typeof cursor === 'number' ? cursor : 0;

    for (let i = startIdx; i < names.length; i++) {
      const fullName = names[i]; // "vendor/package"

      try {
        const entry = await this.fetchSinglePackage(indexer, fullName);
        yield entry;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [packagist] Error fetching ${fullName}: ${msg}`);
      }

      if ((i + 1) % 100 === 0) {
        await indexer.checkpoint(i + 1);
      }
    }

    await indexer.checkpoint(names.length);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    // Cursor is a UNIX timestamp (seconds) for the changes feed
    const since = typeof cursor === 'number' ? cursor : 0;

    if (since === 0) {
      // No previous cursor — fall back to full enumeration
      yield* this.enumerate(indexer);
      return;
    }

    const url = `${BASE}/metadata/changes.json?since=${since}`;
    const changes = await fetchJson<PackagistChanges>(url, indexer.httpOpts);

    const seen = new Set<string>();
    let count = 0;

    for (const action of changes.actions) {
      if (action.type === 'delete') continue;
      if (seen.has(action.package)) continue;
      seen.add(action.package);

      try {
        const entry = await this.fetchSinglePackage(indexer, action.package);
        yield entry;
        count++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [packagist] Error fetching ${action.package}: ${msg}`);
      }

      if (count % 50 === 0) {
        await indexer.checkpoint(changes.timestamp);
      }
    }

    await indexer.checkpoint(changes.timestamp);
    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry> {
    // For Packagist, "scope" is the vendor prefix. Build "vendor/name" if scope provided.
    const fullName = scope ? `${scope}/${name}` : name;
    return this.fetchSinglePackage(indexer, fullName);
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void> {
    const fullName = scope ? `${scope}/${name}` : name;

    // Split vendor/name consistently with fetchSinglePackage
    const parts = fullName.split('/');
    const vendor = parts.length > 1 ? parts[0] : undefined;
    const shortName = parts.length > 1 ? parts.slice(1).join('/') : fullName;

    const url = `${BASE}/packages/${fullName}.json`;
    const data = await fetchJson<PackagistPackageResponse>(url, indexer.httpOpts);

    // Find the version in the versions map
    const versionData = data.package.versions[version]
      || data.package.versions[`v${version}`];

    if (!versionData) {
      throw new Error(`Version ${version} not found for ${fullName}`);
    }

    if (!versionData.dist?.url) {
      throw new Error(`No dist URL for ${fullName}@${version}`);
    }

    const distUrl = versionData.dist.url;
    const ext = versionData.dist.type === 'zip' ? 'zip' : 'tar.gz';
    const filename = `${shortName}-${version}.${ext}`;

    await indexer.downloadVersion(distUrl, shortName, version, filename, vendor);
  }

  // -- internal --

  private async fetchSinglePackage(indexer: Indexer, fullName: string): Promise<PackageEntry> {
    const url = `${BASE}/packages/${fullName}.json`;
    const data = await fetchJson<PackagistPackageResponse>(url, indexer.httpOpts);
    const pkg = data.package;

    const versionKeys = Object.keys(pkg.versions || {});
    // Filter out dev versions for the "latest" pick
    const stableVersions = versionKeys.filter(v => !v.includes('dev'));
    const latestVersion = stableVersions[0] || versionKeys[0];
    const latestData = latestVersion ? pkg.versions[latestVersion] : undefined;

    const parts = fullName.split('/');
    const vendor = parts[0];
    const shortName = parts.slice(1).join('/');

    const entry: PackageEntry = {
      name: shortName || fullName,
      scope: vendor,
      version: latestVersion,
      versions: versionKeys,
      description: pkg.description,
      homepage: latestData?.homepage,
      repository: pkg.repository,
      license: latestData?.license?.[0],
      downloads: pkg.downloads?.total,
      updatedAt: pkg.time,
      raw: pkg,
    };

    await indexer.addPackage(entry, pkg);
    return entry;
  }
}
