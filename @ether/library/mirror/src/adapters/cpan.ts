import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';
import { gunzipSync } from 'node:zlib';

/**
 * CPAN (MetaCPAN) package registry adapter (Perl).
 *
 * Enumeration uses the 02packages.details.txt.gz index file:
 *   GET https://cpan.metacpan.org/modules/02packages.details.txt.gz
 * This is a gzipped DCF-like file listing all modules → distribution mappings.
 *
 * Per-distribution metadata:
 *   GET https://fastapi.metacpan.org/v1/release/{distribution}
 *
 * Download tarball:
 *   GET https://cpan.metacpan.org/authors/id/{author_path}/{dist}-{version}.tar.gz
 *
 * ~40K distributions.
 */

const API_BASE = 'https://fastapi.metacpan.org/v1';
const DOWNLOAD_BASE = 'https://cpan.metacpan.org';

interface MetaCPANRelease {
  name: string;
  distribution: string;
  version: string;
  version_numified?: number;
  author: string;
  date?: string;
  abstract?: string;
  license?: string[];
  download_url?: string;
  status?: string;
  resources?: {
    homepage?: string;
    repository?: { url?: string; web?: string };
  };
  metadata?: unknown;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['cpan'];

export class CpanAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['cpan'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    // Use 02packages.details.txt.gz — a reliable static index of all CPAN modules.
    // This avoids the Elasticsearch scroll API which can return HTTP 500.
    const indexUrl = `${DOWNLOAD_BASE}/modules/02packages.details.txt.gz`;
    const res = await fetch(indexUrl, {
      headers: { 'User-Agent': 'ether-mirror/0.1' },
    });
    if (!res.ok) throw new Error(`CPAN 02packages.details.txt.gz returned HTTP ${res.status}`);

    const compressed = Buffer.from(await res.arrayBuffer());
    const text = gunzipSync(compressed).toString('utf-8');

    // Parse: skip header (everything before first blank line), then data lines.
    // Format: "Module::Name    version    A/AU/AUTHOR/Dist-1.23.tar.gz"
    const lines = text.split('\n');
    let headerDone = false;

    // Group by distribution path to deduplicate (many modules → one distribution)
    const distMap = new Map<string, { distPath: string; version?: string }>();

    for (const line of lines) {
      if (!headerDone) {
        if (line.trim() === '') headerDone = true;
        continue;
      }

      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      const version = parts[1] === 'undef' ? undefined : parts[1];
      const distPath = parts[2];

      if (!distMap.has(distPath)) {
        distMap.set(distPath, { distPath, version });
      }
    }

    const dists = [...distMap.values()];
    const cursor = indexer.getCursor();
    const startIdx = typeof cursor === 'number' ? cursor : 0;
    let count = 0;

    for (let i = startIdx; i < dists.length; i++) {
      const dist = dists[i];
      const filename = dist.distPath.split('/').pop() || '';
      const base = filename.replace(/\.(tar\.gz|tgz|zip|tar\.bz2)$/i, '');
      // Split "Dist-Name-1.23" into name + version
      const vMatch = base.match(/^(.+?)[-.](\d[\d._]*\w*)$/);
      const distName = vMatch ? vMatch[1] : base;
      const version = vMatch ? vMatch[2] : dist.version;

      const entry: PackageEntry = {
        name: distName,
        version,
        raw: {
          distPath: dist.distPath,
          downloadUrl: `${DOWNLOAD_BASE}/authors/id/${dist.distPath}`,
        },
      };

      await indexer.addPackage(entry, entry.raw);
      yield entry;

      count++;
      if (count % 1000 === 0) {
        await indexer.checkpoint(startIdx + count);
      }
    }

    await indexer.checkpoint(startIdx + count);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // 02packages is small (~12MB compressed) — just re-enumerate fully.
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const url = `${API_BASE}/release/${encodeURIComponent(name)}`;
    const data = await fetchJson<MetaCPANRelease>(url, indexer.httpOpts);

    const entry = this.releaseToEntry(data);
    await indexer.addPackage(entry, data);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    // Fetch the release to get the download URL and author
    const url = `${API_BASE}/release/${encodeURIComponent(name)}`;
    let data: MetaCPANRelease;

    try {
      data = await fetchJson<MetaCPANRelease>(url, indexer.httpOpts);
    } catch {
      // Try with versioned name: distribution-version
      const versionedUrl = `${API_BASE}/release/${encodeURIComponent(`${name}-${version}`)}`;
      data = await fetchJson<MetaCPANRelease>(versionedUrl, indexer.httpOpts);
    }

    if (data.download_url) {
      const filename = data.download_url.split('/').pop() || `${name}-${version}.tar.gz`;
      await indexer.downloadVersion(data.download_url, name, version, filename);
    } else {
      // Construct download URL from author path
      // CPAN author paths: first letter / first two letters / full author
      // e.g., JOHNDOE → J/JO/JOHNDOE
      const author = data.author;
      const authorPath = `${author[0]}/${author.slice(0, 2)}/${author}`;
      const filename = `${data.name}.tar.gz`;
      const downloadUrl = `${DOWNLOAD_BASE}/authors/id/${authorPath}/${filename}`;
      await indexer.downloadVersion(downloadUrl, name, version, filename);
    }
  }

  private releaseToEntry(rel: MetaCPANRelease): PackageEntry {
    return {
      name: rel.distribution,
      version: rel.version,
      description: rel.abstract,
      homepage: rel.resources?.homepage,
      repository: rel.resources?.repository?.url || rel.resources?.repository?.web,
      license: rel.license?.join(', '),
      updatedAt: rel.date,
      raw: rel,
    };
  }
}
