import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * pub.dev registry adapter (Dart/Flutter packages).
 *
 * API docs: https://pub.dev/help/api
 *
 * ~50K packages. Paginated API with `nextUrl` field for cursor-based pagination.
 * Archives served as tar.gz from pub.dev.
 */

export const platform: PlatformConfig = REGISTRY_PLATFORMS['pub-dev'];

const API_BASE = 'https://pub.dev/api';
const CHECKPOINT_EVERY = 10; // checkpoint every N pages

interface PubPackageListItem {
  name: string;
}

interface PubPackageListResponse {
  packages: PubPackageListItem[];
  nextUrl?: string;
}

interface PubPackageDetail {
  name: string;
  latest?: {
    version: string;
    pubspec?: {
      name?: string;
      description?: string;
      homepage?: string;
      repository?: string;
      version?: string;
    };
    archive_url?: string;
  };
  versions?: Array<{
    version: string;
    archive_url?: string;
    published?: string;
  }>;
}

function toPackageEntry(pkg: PubPackageDetail): PackageEntry {
  return {
    name: pkg.name,
    version: pkg.latest?.version,
    versions: pkg.versions?.map(v => v.version),
    description: pkg.latest?.pubspec?.description,
    homepage: pkg.latest?.pubspec?.homepage,
    repository: pkg.latest?.pubspec?.repository,
    updatedAt: pkg.versions?.[0]?.published,
    raw: pkg,
  };
}

function toBasicEntry(item: PubPackageListItem): PackageEntry {
  return {
    name: item.name,
  };
}

export class PubDevAdapter implements RegistryAdapter {
  platform = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Resume from cursor (nextUrl or page number)
    const cursor = indexer.getCursor();
    let nextUrl: string | null = typeof cursor === 'string' && cursor.startsWith('http')
      ? cursor
      : `${API_BASE}/packages?page=${typeof cursor === 'number' ? cursor : 1}`;

    let pageNum = 0;

    while (nextUrl) {
      console.log(`  [pub-dev] Fetching ${nextUrl}...`);
      pageNum++;

      let response: PubPackageListResponse;
      try {
        response = await fetchJson<PubPackageListResponse>(nextUrl, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Failed at ${nextUrl}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!response.packages || response.packages.length === 0) break;

      for (const item of response.packages) {
        // Fetch full package details for each listed package
        try {
          const detail = await fetchJson<PubPackageDetail>(
            `${API_BASE}/packages/${encodeURIComponent(item.name)}`,
            indexer.httpOpts
          );
          const entry = toPackageEntry(detail);
          await indexer.addPackage(entry, detail);
          yield entry;
        } catch (err) {
          // Log and continue on individual package failures
          console.error(`  [pub-dev] Failed to fetch ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
          const entry = toBasicEntry(item);
          await indexer.addPackage(entry);
          yield entry;
        }
      }

      if (pageNum % CHECKPOINT_EVERY === 0) {
        await indexer.checkpoint(response.nextUrl ?? pageNum);
      }

      nextUrl = response.nextUrl ?? null;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // pub.dev doesn't have a dedicated "changed since" endpoint.
    // We paginate from page 1 (default sort is by most recently updated)
    // and stop when we encounter packages older than our last sync.
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const lastSync = indexer.getState().lastSync;
    let page = 1;

    while (true) {
      const url = `${API_BASE}/packages?page=${page}`;
      console.log(`  [pub-dev] Incremental page ${page}...`);

      let response: PubPackageListResponse;
      try {
        response = await fetchJson<PubPackageListResponse>(url, indexer.httpOpts);
      } catch (err) {
        await indexer.setError(`Incremental failed at page ${page}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }

      if (!response.packages || response.packages.length === 0) break;

      let foundOld = false;
      for (const item of response.packages) {
        try {
          const detail = await fetchJson<PubPackageDetail>(
            `${API_BASE}/packages/${encodeURIComponent(item.name)}`,
            indexer.httpOpts
          );
          // Check if this package is older than our last sync
          const latestPublished = detail.versions?.[0]?.published;
          if (lastSync && latestPublished && latestPublished < lastSync) {
            foundOld = true;
            break;
          }
          const entry = toPackageEntry(detail);
          await indexer.addPackage(entry, detail);
          yield entry;
        } catch (err) {
          console.error(`  [pub-dev] Failed to fetch ${item.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (foundOld) break;
      if (!response.nextUrl) break;

      page++;
      await indexer.checkpoint(page);
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${API_BASE}/packages/${encodeURIComponent(name)}`;
    console.log(`  [pub-dev] Fetching package ${name}...`);

    const pkg = await fetchJson<PubPackageDetail>(url, indexer.httpOpts);
    const entry = toPackageEntry(pkg);
    await indexer.addPackage(entry, pkg);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const url = `https://pub.dev/api/archives/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}.tar.gz`;
    const filename = `${name}-${version}.tar.gz`;
    console.log(`  [pub-dev] Downloading ${name}@${version}...`);

    await indexer.downloadVersion(url, name, version, filename);
  }
}
