import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * RubyGems registry adapter (Ruby gems).
 *
 * API docs: https://guides.rubygems.org/rubygems-org-api/
 *
 * ~180K gems. Multiple enumeration strategies:
 * - Full: paginated search API (GET /api/v1/search.json?query=&page=N)
 * - Incremental: GET /api/v1/activity/latest.json (50 most recently pushed)
 *   and GET /api/v1/activity/just_updated.json (50 most recently updated)
 * - Per-gem: GET /api/v1/gems/{name}.json
 * - Versions: GET /api/v1/versions/{name}.json
 * - Tarballs: GET /gems/{name}-{version}.gem
 *
 * Rate limit: 10 req / 10s (per platform config).
 */

export const platform: PlatformConfig = REGISTRY_PLATFORMS['rubygems'];

const API_BASE = 'https://rubygems.org/api/v1';
const GEM_BASE = 'https://rubygems.org';
const SEARCH_PAGE_SIZE = 30; // RubyGems search returns 30 per page by default
const CHECKPOINT_EVERY = 10; // checkpoint every N pages

interface GemSearchItem {
  name: string;
  version?: string;
  version_downloads?: number;
  downloads?: number;
  info?: string;
  homepage_uri?: string;
  source_code_uri?: string;
  project_uri?: string;
  licenses?: string[];
}

interface GemDetail {
  name: string;
  version?: string;
  version_downloads?: number;
  downloads?: number;
  info?: string;
  homepage_uri?: string;
  source_code_uri?: string;
  project_uri?: string;
  gem_uri?: string;
  licenses?: string[];
  metadata?: Record<string, string>;
  created_at?: string;
  updated_at?: string; // not in older API responses
}

interface GemVersionInfo {
  number: string;
  created_at?: string;
  summary?: string;
  platform?: string;
  licenses?: string[];
  prerelease?: boolean;
  yanked?: boolean;
  sha?: string;
  downloads_count?: number;
}

interface ActivityItem {
  name: string;
  version?: string;
  info?: string;
  homepage_uri?: string;
  source_code_uri?: string;
  licenses?: string[];
  downloads?: number;
}

function toPackageEntry(gem: GemDetail | GemSearchItem, versions?: string[]): PackageEntry {
  return {
    name: gem.name,
    version: gem.version,
    versions,
    description: gem.info,
    homepage: gem.homepage_uri,
    repository: gem.source_code_uri,
    license: gem.licenses?.[0],
    downloads: gem.downloads,
    raw: gem,
  };
}

export class RubyGemsAdapter implements RegistryAdapter {
  platform = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Use the Bundler compact index which returns ALL gem names AND versions
    // in a single request. Format after "---" header:
    //   gem_name version1,version2,version3
    const res = await httpGet('https://index.rubygems.org/versions', {
      ...indexer.httpOpts,
      timeout: 120_000, // large file, allow extra time
    });

    if (res.status !== 200) {
      throw new Error(`RubyGems compact index returned HTTP ${res.status}`);
    }

    const lines = res.body.split('\n');
    let headerDone = false;

    // Parse all gems with their versions
    const gems: { name: string; versions: string[] }[] = [];
    for (const line of lines) {
      if (!headerDone) {
        if (line.trim() === '---') headerDone = true;
        continue;
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Format: "gem_name version1,version2,version3 checksum"
      // or just: "gem_name version1,version2"
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) continue;

      const name = trimmed.substring(0, spaceIdx);
      const rest = trimmed.substring(spaceIdx + 1);
      // Versions are comma-separated; there may be a trailing checksum after space
      const versionsStr = rest.split(' ')[0];
      const versions = versionsStr.split(',').filter(v => v.length > 0);

      gems.push({ name, versions });
    }

    const cursor = indexer.getCursor();
    const startIdx = typeof cursor === 'number' ? cursor : 0;
    let count = startIdx;

    for (let i = startIdx; i < gems.length; i++) {
      const { name, versions } = gems[i];
      const latestVersion = versions[versions.length - 1];

      const entry: PackageEntry = {
        name,
        version: latestVersion,
        versions,
        raw: { name, versions },
      };

      await indexer.addPackage(entry, { name, versions });
      yield entry;

      count++;
      if (count % 1000 === 0) {
        await indexer.checkpoint(count);
      }
    }

    await indexer.checkpoint(count);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Use the activity endpoints to get recently published/updated gems.
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const seen = new Set<string>();

    // Fetch latest published gems
    console.log('  [rubygems] Fetching latest published gems...');
    try {
      const latest = await fetchJson<ActivityItem[]>(
        `${API_BASE}/activity/latest.json`,
        indexer.httpOpts
      );
      for (const gem of latest) {
        if (seen.has(gem.name)) continue;
        seen.add(gem.name);

        // Fetch full details
        try {
          const detail = await fetchJson<GemDetail>(
            `${API_BASE}/gems/${encodeURIComponent(gem.name)}.json`,
            indexer.httpOpts
          );
          const entry = toPackageEntry(detail);
          await indexer.addPackage(entry, detail);
          yield entry;
        } catch (err) {
          console.error(`  [rubygems] Failed to fetch ${gem.name}: ${err instanceof Error ? err.message : String(err)}`);
          const entry = toPackageEntry(gem as GemSearchItem);
          await indexer.addPackage(entry);
          yield entry;
        }
      }
    } catch (err) {
      console.error(`  [rubygems] Failed to fetch latest activity: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fetch just-updated gems
    console.log('  [rubygems] Fetching just-updated gems...');
    try {
      const updated = await fetchJson<ActivityItem[]>(
        `${API_BASE}/activity/just_updated.json`,
        indexer.httpOpts
      );
      for (const gem of updated) {
        if (seen.has(gem.name)) continue;
        seen.add(gem.name);

        try {
          const detail = await fetchJson<GemDetail>(
            `${API_BASE}/gems/${encodeURIComponent(gem.name)}.json`,
            indexer.httpOpts
          );
          const entry = toPackageEntry(detail);
          await indexer.addPackage(entry, detail);
          yield entry;
        } catch (err) {
          console.error(`  [rubygems] Failed to fetch ${gem.name}: ${err instanceof Error ? err.message : String(err)}`);
          const entry = toPackageEntry(gem as GemSearchItem);
          await indexer.addPackage(entry);
          yield entry;
        }
      }
    } catch (err) {
      console.error(`  [rubygems] Failed to fetch updated activity: ${err instanceof Error ? err.message : String(err)}`);
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    console.log(`  [rubygems] Fetching gem ${name}...`);

    // Fetch gem metadata
    const gem = await fetchJson<GemDetail>(
      `${API_BASE}/gems/${encodeURIComponent(name)}.json`,
      indexer.httpOpts
    );

    // Fetch version list
    let versions: string[] | undefined;
    try {
      const versionList = await fetchJson<GemVersionInfo[]>(
        `${API_BASE}/versions/${encodeURIComponent(name)}.json`,
        indexer.httpOpts
      );
      versions = versionList
        .filter(v => !v.yanked)
        .map(v => v.number);
    } catch {
      // Version list may fail; continue with just the gem detail
    }

    const entry = toPackageEntry(gem, versions);
    await indexer.addPackage(entry, gem);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const url = `${GEM_BASE}/gems/${encodeURIComponent(name)}-${encodeURIComponent(version)}.gem`;
    const filename = `${name}-${version}.gem`;
    console.log(`  [rubygems] Downloading ${name}@${version}...`);

    await indexer.downloadVersion(url, name, version, filename);
  }
}
