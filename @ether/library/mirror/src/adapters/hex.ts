import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Hex.pm registry adapter (Elixir/Erlang packages).
 *
 * API docs: https://github.com/hexpm/hexpm/blob/main/guides/api.md
 *
 * ~14K packages. Paginated API, 100 per page, sorted by name.
 * Tarballs served from repo.hex.pm.
 */

export const platform: PlatformConfig = REGISTRY_PLATFORMS['hex'];

const API_BASE = 'https://hex.pm/api';
const REPO_BASE = 'https://repo.hex.pm';
const PAGE_SIZE = 100;
const CHECKPOINT_EVERY = 5; // checkpoint every N pages

interface HexPackageListItem {
  name: string;
  meta?: {
    description?: string;
    licenses?: string[];
    links?: Record<string, string>;
  };
  releases?: Array<{ version: string }>;
  downloads?: { all?: number };
  updated_at?: string;
  url?: string;
}

interface HexPackageDetail {
  name: string;
  meta?: {
    description?: string;
    licenses?: string[];
    links?: Record<string, string>;
  };
  releases?: Array<{
    version: string;
    url?: string;
    inserted_at?: string;
  }>;
  downloads?: { all?: number };
  updated_at?: string;
  url?: string;
}

function toPackageEntry(pkg: HexPackageListItem | HexPackageDetail): PackageEntry {
  const versions = pkg.releases?.map(r => r.version);
  return {
    name: pkg.name,
    version: versions?.[0], // latest version (releases are ordered newest-first)
    versions,
    description: pkg.meta?.description,
    license: pkg.meta?.licenses?.[0],
    homepage: pkg.meta?.links?.['GitHub'] ?? pkg.meta?.links?.['Homepage'],
    repository: pkg.meta?.links?.['GitHub'],
    downloads: pkg.downloads?.all,
    updatedAt: pkg.updated_at,
    raw: pkg,
  };
}

export class HexAdapter implements RegistryAdapter {
  platform = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Resume from cursor (page number)
    const cursor = indexer.getCursor();
    let page = typeof cursor === 'number' ? cursor : 1;

    while (true) {
      const url = `${API_BASE}/packages?page=${page}&per_page=${PAGE_SIZE}&sort=name`;
      console.log(`  [hex] Fetching page ${page}...`);

      let packages: HexPackageListItem[];
      try {
        packages = await fetchJson<HexPackageListItem[]>(url, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Failed at page ${page}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!packages || packages.length === 0) {
        break; // No more pages
      }

      for (const pkg of packages) {
        const entry = toPackageEntry(pkg);
        await indexer.addPackage(entry, pkg);
        yield entry;
      }

      if (page % CHECKPOINT_EVERY === 0) {
        await indexer.checkpoint(page);
      }

      // If we got fewer than PAGE_SIZE results, this is the last page
      if (packages.length < PAGE_SIZE) {
        break;
      }

      page++;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Hex doesn't have a dedicated incremental endpoint.
    // We re-enumerate from page 1 sorted by updated_at desc and stop
    // when we see packages older than our last sync.
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const lastSync = indexer.getState().lastSync;
    let page = 1;

    while (true) {
      const url = `${API_BASE}/packages?page=${page}&per_page=${PAGE_SIZE}&sort=updated_at`;
      console.log(`  [hex] Incremental page ${page}...`);

      let packages: HexPackageListItem[];
      try {
        packages = await fetchJson<HexPackageListItem[]>(url, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Incremental failed at page ${page}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!packages || packages.length === 0) break;

      let foundOld = false;
      for (const pkg of packages) {
        // If we have a lastSync and this package hasn't been updated since, stop
        if (lastSync && pkg.updated_at && pkg.updated_at < lastSync) {
          foundOld = true;
          break;
        }
        const entry = toPackageEntry(pkg);
        await indexer.addPackage(entry, pkg);
        yield entry;
      }

      if (foundOld) break;
      if (packages.length < PAGE_SIZE) break;

      page++;
      await indexer.checkpoint(page);
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${API_BASE}/packages/${encodeURIComponent(name)}`;
    console.log(`  [hex] Fetching package ${name}...`);

    const pkg = await fetchJson<HexPackageDetail>(url, indexer.httpOpts);
    const entry = toPackageEntry(pkg);
    await indexer.addPackage(entry, pkg);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const url = `${REPO_BASE}/tarballs/${encodeURIComponent(name)}-${encodeURIComponent(version)}.tar`;
    const filename = `${name}-${version}.tar`;
    console.log(`  [hex] Downloading ${name}@${version}...`);

    await indexer.downloadVersion(url, name, version, filename);
  }
}
