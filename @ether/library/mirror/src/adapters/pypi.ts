import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * PyPI package registry adapter (Python).
 *
 * API endpoints:
 *   - Simple index (JSON): GET https://pypi.org/simple/ with Accept: application/vnd.pypi.simple.v1+json
 *   - Per-package:         GET https://pypi.org/pypi/{name}/json
 *   - RSS updates:         GET https://pypi.org/rss/updates.xml
 *   - Download:            URLs found in the per-package JSON (urls array)
 *
 * ~500K packages. No proper cursor API, but the Simple Index gives a full list.
 * Incremental uses the RSS feed for recently updated packages.
 */

const BASE = 'https://pypi.org';

interface PyPISimpleIndex {
  projects: { name: string }[];
}

interface PyPIPackageJson {
  info: {
    name: string;
    version: string;
    summary?: string;
    description?: string;
    home_page?: string;
    project_url?: string;
    project_urls?: Record<string, string>;
    license?: string;
    author?: string;
    author_email?: string;
    package_url?: string;
    requires_python?: string;
    keywords?: string;
  };
  releases: Record<string, PyPIRelease[]>;
  urls: PyPIRelease[];
}

interface PyPIRelease {
  filename: string;
  url: string;
  size: number;
  digests: { md5?: string; sha256?: string };
  packagetype: string;
  python_version?: string;
  requires_python?: string;
  upload_time_iso_8601?: string;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['pypi'];

export class PyPIAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['pypi'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Fetch all package names using the JSON Simple API
    const names = await this.fetchAllNames(indexer);

    // Resume from cursor (index into names array)
    const cursor = indexer.getCursor();
    let startIdx = typeof cursor === 'number' ? cursor : 0;

    for (let i = startIdx; i < names.length; i++) {
      const name = names[i];

      try {
        const entry = await this.fetchSinglePackage(indexer, name);
        yield entry;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [pypi] Error fetching ${name}: ${msg}`);
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
    if (cursor === null || cursor === 0) {
      // No previous sync — full enumeration
      yield* this.enumerate(indexer);
      return;
    }

    // Fetch the RSS updates feed to find recently changed packages
    const rssUrl = `${BASE}/rss/updates.xml`;
    const res = await httpGet(rssUrl, indexer.httpOpts);

    if (res.status !== 200) {
      console.error(`  [pypi] RSS feed returned ${res.status}, falling back to full enumeration`);
      yield* this.enumerate(indexer);
      return;
    }

    // Parse package names from RSS XML (simple regex extraction)
    const packageNames = this.parseRssPackageNames(res.body);
    const seen = new Set<string>();
    let count = 0;

    for (const name of packageNames) {
      if (seen.has(name)) continue;
      seen.add(name);

      try {
        const entry = await this.fetchSinglePackage(indexer, name);
        yield entry;
        count++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [pypi] Error fetching ${name}: ${msg}`);
      }
    }

    // After incremental, checkpoint with the full count so next full resumes correctly
    // We keep the original cursor format (index) so full enum can skip already-indexed
    await indexer.checkpoint(cursor);
    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string, _scope?: string): Promise<PackageEntry> {
    return this.fetchSinglePackage(indexer, name);
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, _scope?: string): Promise<void> {
    const url = `${BASE}/pypi/${encodeURIComponent(name)}/json`;
    const data = await fetchJson<PyPIPackageJson>(url, indexer.httpOpts);

    // Use canonical name from API to match what fetchPackage stores
    const canonicalName = data.info.name;

    const releases = data.releases[version];
    if (!releases || releases.length === 0) {
      throw new Error(`No release files for ${canonicalName}@${version}`);
    }

    // Prefer sdist (source distribution), then bdist_wheel, then first available
    const sdist = releases.find(r => r.packagetype === 'sdist');
    const wheel = releases.find(r => r.packagetype === 'bdist_wheel');
    const chosen = sdist || wheel || releases[0];

    await indexer.downloadVersion(chosen.url, canonicalName, version, chosen.filename);
  }

  // -- internal --

  private async fetchAllNames(indexer: Indexer): Promise<string[]> {
    // Try the JSON Simple API first (PEP 691)
    try {
      const data = await fetchJson<PyPISimpleIndex>(`${BASE}/simple/`, {
        ...indexer.httpOpts,
        headers: {
          ...indexer.httpOpts.headers,
          Accept: 'application/vnd.pypi.simple.v1+json',
        },
      });
      return data.projects.map(p => p.name);
    } catch {
      // Fall back to HTML parsing
    }

    // Fallback: fetch HTML Simple Index and parse links
    const res = await httpGet(`${BASE}/simple/`, indexer.httpOpts);
    if (res.status !== 200) {
      throw new Error(`PyPI simple index returned HTTP ${res.status}`);
    }

    const names: string[] = [];
    // Extract package names from <a href="/simple/{name}/">{name}</a> links
    const linkRegex = /<a[^>]*href="\/simple\/([^/"]+)\/"[^>]*>/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(res.body)) !== null) {
      names.push(decodeURIComponent(match[1]));
    }

    return names;
  }

  private async fetchSinglePackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${BASE}/pypi/${encodeURIComponent(name)}/json`;
    const data = await fetchJson<PyPIPackageJson>(url, indexer.httpOpts);
    const info = data.info;

    const versions = Object.keys(data.releases || {});

    // Find homepage from project_urls or home_page
    let homepage = info.home_page || undefined;
    if (!homepage && info.project_urls) {
      homepage = info.project_urls['Homepage']
        || info.project_urls['Home']
        || info.project_urls['homepage']
        || Object.values(info.project_urls)[0];
    }

    // Find repository URL
    let repository: string | undefined;
    if (info.project_urls) {
      repository = info.project_urls['Source']
        || info.project_urls['Source Code']
        || info.project_urls['Repository']
        || info.project_urls['Code'];
    }

    const entry: PackageEntry = {
      name: info.name,
      version: info.version,
      versions,
      description: info.summary,
      homepage,
      repository,
      license: info.license || undefined,
      updatedAt: data.urls?.[0]?.upload_time_iso_8601,
      raw: data,
    };

    await indexer.addPackage(entry, data);
    return entry;
  }

  private parseRssPackageNames(xml: string): string[] {
    const names: string[] = [];
    // Extract from <link>https://pypi.org/project/{name}/{version}/</link>
    const linkRegex = /<link>https:\/\/pypi\.org\/project\/([^/]+)\/[^<]*<\/link>/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(xml)) !== null) {
      names.push(decodeURIComponent(match[1]));
    }
    return names;
  }
}
