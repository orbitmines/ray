import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Go Module Index adapter.
 *
 * API endpoints:
 *   - Module index:   GET https://index.golang.org/index?since={timestamp}
 *     Returns JSON lines: {"Path":"...","Version":"...","Timestamp":"..."}
 *     Each batch returns up to 2000 entries. Paginate by using the last timestamp.
 *   - Version list:   GET https://proxy.golang.org/{module}/@v/list
 *   - Version info:   GET https://proxy.golang.org/{module}/@v/{version}.info
 *   - Download zip:   GET https://proxy.golang.org/{module}/@v/{version}.zip
 *
 * ~1M modules. Excellent incremental support via timestamp cursor.
 */

const INDEX_BASE = 'https://index.golang.org';
const PROXY_BASE = 'https://proxy.golang.org';

/** Each line from the module index is a JSON object. */
interface GoIndexEntry {
  Path: string;
  Version: string;
  Timestamp: string;
}

interface GoModuleInfo {
  Version: string;
  Time: string;
}

function encodeModulePath(modulePath: string): string {
  // Go module proxy uses case-encoded paths: uppercase letters become !lowercase
  // e.g., "github.com/Azure/azure-sdk" → "github.com/!azure/azure-sdk"
  return modulePath.replace(/[A-Z]/g, c => `!${c.toLowerCase()}`);
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['go'];

export class GoAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['go'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Cursor is the last timestamp we processed
    const cursor = indexer.getCursor();
    let since = typeof cursor === 'string' ? cursor : '';

    let count = 0;

    while (true) {
      const url = since
        ? `${INDEX_BASE}/index?since=${encodeURIComponent(since)}`
        : `${INDEX_BASE}/index`;

      const res = await httpGet(url, {
        ...indexer.httpOpts,
        timeout: 60_000, // index responses can be large
      });
      if (res.status !== 200) {
        throw new Error(`Go module index returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
      }

      const lines = res.body.trim().split('\n').filter(l => l.length > 0);
      if (lines.length === 0) break;

      let lastTimestamp = since;

      for (const line of lines) {
        // Each line is a JSON object: {"Path":"...","Version":"...","Timestamp":"..."}
        let parsed: GoIndexEntry;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // skip malformed lines
        }

        const modulePath = parsed.Path;
        const version = parsed.Version;
        const timestamp = parsed.Timestamp;

        if (!modulePath) continue;

        lastTimestamp = timestamp;

        const entry: PackageEntry = {
          name: modulePath,
          version,
          updatedAt: timestamp,
          raw: parsed,
        };

        await indexer.addPackage(entry, parsed);
        yield entry;
        count++;
      }

      await indexer.checkpoint(lastTimestamp);

      // If we got fewer than 2000 entries, we've reached the end
      if (lines.length < 2000) break;

      // Use last timestamp as cursor for next page
      since = lastTimestamp;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // The Go module index is inherently incremental — enumerate from the cursor
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string, _scope?: string): Promise<PackageEntry> {
    const encoded = encodeModulePath(name);

    // Fetch version list
    const listUrl = `${PROXY_BASE}/${encoded}/@v/list`;
    const listRes = await httpGet(listUrl, indexer.httpOpts);

    if (listRes.status !== 200) {
      throw new Error(`Go proxy returned HTTP ${listRes.status} for ${name}`);
    }

    const versions = listRes.body.trim().split('\n').filter(v => v.length > 0);
    const latestVersion = versions[versions.length - 1];

    // Fetch info for the latest version
    let updatedAt: string | undefined;
    if (latestVersion) {
      try {
        const infoUrl = `${PROXY_BASE}/${encoded}/@v/${encodeURIComponent(latestVersion)}.info`;
        const info = await fetchJson<GoModuleInfo>(infoUrl, indexer.httpOpts);
        updatedAt = info.Time;
      } catch {
        // Info fetch is best-effort
      }
    }

    const entry: PackageEntry = {
      name,
      version: latestVersion,
      versions,
      updatedAt,
      raw: { name, versions },
    };

    await indexer.addPackage(entry, { name, versions });
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, _scope?: string): Promise<void> {
    const encoded = encodeModulePath(name);
    const downloadUrl = `${PROXY_BASE}/${encoded}/@v/${encodeURIComponent(version)}.zip`;

    // Use the last path segment as a short name, replace / with _
    const safeName = name.replace(/\//g, '_');
    const filename = `${safeName}-${version}.zip`;

    await indexer.downloadVersion(downloadUrl, name, version, filename);
  }
}
