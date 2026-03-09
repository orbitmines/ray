import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Hackage package registry adapter (Haskell).
 *
 * API endpoints:
 *   - Package list: GET https://hackage.haskell.org/packages/ (Accept: application/json)
 *       Returns JSON array of objects: { packageName: string }
 *   - Per-package:  GET https://hackage.haskell.org/package/{name}.json
 *       Returns JSON with version info
 *   - Download:     GET https://hackage.haskell.org/package/{name}-{version}/{name}-{version}.tar.gz
 *
 * ~18K packages. No cursor-based pagination; the full list is small enough
 * for complete re-enumeration.
 */

const BASE_URL = 'https://hackage.haskell.org';

interface HackagePackageListItem {
  packageName: string;
}

/** Hackage package JSON: keys are version strings, values are status/revision info. */
type HackagePackageVersions = Record<string, {
  'normal-version'?: unknown[];
  'deprecated-version'?: unknown[];
}>;

export const platform: PlatformConfig = REGISTRY_PLATFORMS['hackage'];

export class HackageAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['hackage'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Fetch full package name list (Accept: application/json MUST come last to override)
    const res = await httpGet(`${BASE_URL}/packages/`, {
      ...indexer.httpOpts,
      headers: { ...indexer.httpOpts.headers, Accept: 'application/json' },
    });

    if (res.status !== 200) {
      throw new Error(`Hackage package list returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }

    let packages: HackagePackageListItem[];
    try {
      packages = res.json<HackagePackageListItem[]>();
    } catch {
      throw new Error(`Hackage returned non-JSON response (${res.body.slice(0, 100)}...)`);
    }

    if (!Array.isArray(packages) || packages.length === 0) {
      throw new Error(`Hackage returned empty or invalid package list`);
    }

    const cursor = indexer.getCursor();
    const startIdx = typeof cursor === 'number' ? cursor : 0;
    let count = startIdx;

    for (let i = startIdx; i < packages.length; i++) {
      const { packageName } = packages[i];

      // Fetch version info per package (~18K packages, feasible)
      let versions: string[] | undefined;
      let latestVersion: string | undefined;
      try {
        const versionData = await fetchJson<HackagePackageVersions>(
          `${BASE_URL}/package/${encodeURIComponent(packageName)}.json`,
          indexer.httpOpts,
        );
        versions = Object.keys(versionData);
        latestVersion = versions[versions.length - 1];
      } catch {
        // Version fetch failed — continue with just the name
      }

      const entry: PackageEntry = {
        name: packageName,
        version: latestVersion,
        versions,
        raw: packages[i],
      };

      await indexer.addPackage(entry, packages[i]);
      yield entry;

      count++;
      if (count % 500 === 0) {
        await indexer.checkpoint(count);
      }
    }

    await indexer.checkpoint(count);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Hackage has no change feed. Re-enumerate the full list.
    // For incremental, we just re-run full since 18K names is small.
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${BASE_URL}/package/${encodeURIComponent(name)}.json`;
    const data = await fetchJson<HackagePackageVersions>(url, indexer.httpOpts);

    const versions = Object.keys(data);
    const latestVersion = versions[versions.length - 1];

    const entry: PackageEntry = {
      name,
      versions,
      version: latestVersion,
      raw: data,
    };

    await indexer.addPackage(entry, data);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const filename = `${name}-${version}.tar.gz`;
    const downloadUrl = `${BASE_URL}/package/${encodeURIComponent(name)}-${version}/${filename}`;

    await indexer.downloadVersion(downloadUrl, name, version, filename);
  }
}
