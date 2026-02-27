import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * crates.io registry adapter (Rust crates).
 *
 * API docs: https://crates.io/policies#crawling
 *
 * ~150K crates. Paginated API with 100 per page, sorted alphabetically.
 * Rate limited to 1 req/sec (enforced by platform config: 10 req / 10s).
 * Tarballs served from static.crates.io.
 *
 * Also supports a full database dump at:
 *   https://static.crates.io/db-dump.tar.gz
 * but we use the paginated API for incremental resumability.
 */

export const platform: PlatformConfig = REGISTRY_PLATFORMS['crates-io'];

const API_BASE = 'https://crates.io/api/v1';
const STATIC_BASE = 'https://static.crates.io';
const PAGE_SIZE = 100;
const CHECKPOINT_EVERY = 10; // checkpoint every N pages

interface CrateListResponse {
  crates: CrateListItem[];
  meta: {
    total: number;
    next_page?: string;
  };
}

interface CrateListItem {
  id: string;
  name: string;
  description?: string;
  homepage?: string;
  repository?: string;
  max_version?: string;
  max_stable_version?: string;
  downloads?: number;
  recent_downloads?: number;
  updated_at?: string;
  created_at?: string;
  exact_match?: boolean;
}

interface CrateDetailResponse {
  crate: CrateListItem;
  versions: Array<{
    id: number;
    crate: string;
    num: string;           // version number
    dl_path: string;
    created_at?: string;
    updated_at?: string;
    yanked: boolean;
    license?: string;
    crate_size?: number;
  }>;
}

function toPackageEntry(crate: CrateListItem, versions?: string[], license?: string): PackageEntry {
  return {
    name: crate.name,
    version: crate.max_stable_version ?? crate.max_version,
    versions,
    description: crate.description,
    homepage: crate.homepage,
    repository: crate.repository,
    license,
    downloads: crate.downloads,
    updatedAt: crate.updated_at,
    raw: crate,
  };
}

export class CratesIoAdapter implements RegistryAdapter {
  platform = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Use seek-based pagination via meta.next_page to avoid the page>200 limit.
    // Cursor is the full next_page URL (or null for start).
    const cursor = indexer.getCursor();
    let nextUrl: string | null = typeof cursor === 'string' && cursor.includes('crates')
      ? cursor
      : `${API_BASE}/crates?per_page=${PAGE_SIZE}&sort=alpha`;

    let pageNum = 0;

    while (nextUrl) {
      pageNum++;

      let response: CrateListResponse;
      try {
        response = await fetchJson<CrateListResponse>(nextUrl, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Failed at page ${pageNum}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!response.crates || response.crates.length === 0) break;

      for (const crate of response.crates) {
        const entry = toPackageEntry(crate);
        await indexer.addPackage(entry, crate);
        yield entry;
      }

      // Use the seek-based next_page URL from the API response
      const np = response.meta?.next_page;
      if (np) {
        nextUrl = np.startsWith('http') ? np : `https://crates.io${np}`;
      } else {
        nextUrl = null;
      }

      if (pageNum % CHECKPOINT_EVERY === 0 && nextUrl) {
        await indexer.checkpoint(nextUrl);
      }

      if (response.crates.length < PAGE_SIZE) break;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // crates.io supports sorting by recent updates.
    // Use seek-based pagination to avoid page>200 limit.
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const lastSync = indexer.getState().lastSync;
    let nextUrl: string | null = `${API_BASE}/crates?per_page=${PAGE_SIZE}&sort=recent-updates`;
    let pageNum = 0;

    while (nextUrl) {
      pageNum++;

      let response: CrateListResponse;
      try {
        response = await fetchJson<CrateListResponse>(nextUrl, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Incremental failed at page ${pageNum}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!response.crates || response.crates.length === 0) break;

      let foundOld = false;
      for (const crate of response.crates) {
        if (lastSync && crate.updated_at && crate.updated_at < lastSync) {
          foundOld = true;
          break;
        }
        const entry = toPackageEntry(crate);
        await indexer.addPackage(entry, crate);
        yield entry;
      }

      if (foundOld) break;
      if (response.crates.length < PAGE_SIZE) break;

      const np = response.meta?.next_page;
      if (np) {
        nextUrl = np.startsWith('http') ? np : `https://crates.io${np}`;
      } else {
        nextUrl = null;
      }

      await indexer.checkpoint(nextUrl ?? `done:${pageNum}`);
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${API_BASE}/crates/${encodeURIComponent(name)}`;
    console.log(`  [crates-io] Fetching crate ${name}...`);

    const response = await fetchJson<CrateDetailResponse>(url, indexer.httpOpts);
    const versions = response.versions
      .filter(v => !v.yanked)
      .map(v => v.num);
    const license = response.versions[0]?.license;

    const entry = toPackageEntry(response.crate, versions, license ?? undefined);
    await indexer.addPackage(entry, response);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    // Crate tarballs are at: https://static.crates.io/crates/{name}/{name}-{version}.crate
    const url = `${STATIC_BASE}/crates/${encodeURIComponent(name)}/${encodeURIComponent(name)}-${encodeURIComponent(version)}.crate`;
    const filename = `${name}-${version}.crate`;
    console.log(`  [crates-io] Downloading ${name}@${version}...`);

    await indexer.downloadVersion(url, name, version, filename);
  }
}
