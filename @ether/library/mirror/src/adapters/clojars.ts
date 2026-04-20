import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Clojars package registry adapter (Clojure).
 *
 * Uses the Clojars JSON API:
 *   - Paginated list: GET https://clojars.org/api/artifacts?page={n}
 *     Returns JSON array of artifact objects per page
 *   - Per-package:    GET https://clojars.org/api/artifacts/{group}/{name}
 *     Returns JSON with version details
 *   - Download JAR:   https://clojars.org/repo/{group-path}/{name}/{version}/{name}-{version}.jar
 *
 * ~30K packages. Paginated by page number.
 */

const API_BASE = 'https://clojars.org';

interface ClojarsArtifact {
  jar_name: string;
  group_name: string;
  description?: string;
  homepage?: string;
  version: string;
  created?: string;
  downloads?: number;
}

interface ClojarsArtifactDetail {
  jar_name: string;
  group_name: string;
  description?: string;
  homepage?: string;
  url?: string;
  scm?: { url?: string; tag?: string };
  licenses?: string[];
  recent_versions?: { version: string; downloads?: number; created?: string }[];
  downloads?: number;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['clojars'];

export class ClojarsAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['clojars'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    let page = typeof cursor === 'number' ? cursor : 1;
    let count = 0;

    while (true) {
      const url = `${API_BASE}/api/artifacts?page=${page}`;
      let artifacts: ClojarsArtifact[];

      try {
        artifacts = await fetchJson<ClojarsArtifact[]>(url, indexer.httpOpts);
      } catch {
        break;
      }

      if (!artifacts || artifacts.length === 0) break;

      for (const artifact of artifacts) {
        const name = artifact.group_name === artifact.jar_name
          ? artifact.jar_name
          : `${artifact.group_name}/${artifact.jar_name}`;

        const entry: PackageEntry = {
          name: artifact.jar_name,
          scope: artifact.group_name !== artifact.jar_name ? artifact.group_name : undefined,
          version: artifact.version,
          description: artifact.description,
          homepage: artifact.homepage,
          downloads: artifact.downloads,
          updatedAt: artifact.created,
          raw: artifact,
        };

        await indexer.addPackage(entry, artifact);
        yield entry;
        count++;
      }

      await indexer.checkpoint(page);
      page++;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Clojars has no dedicated change feed. Re-enumerate fully.
    // Could be optimized by checking page 1 for recently updated artifacts,
    // but for 30K this is manageable.
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry> {
    const group = scope || name;
    const url = `${API_BASE}/api/artifacts/${encodeURIComponent(group)}/${encodeURIComponent(name)}`;
    const data = await fetchJson<ClojarsArtifactDetail>(url, indexer.httpOpts);

    const versions = data.recent_versions?.map(v => v.version);

    const entry: PackageEntry = {
      name: data.jar_name,
      scope: data.group_name !== data.jar_name ? data.group_name : undefined,
      versions,
      version: versions?.[0],
      description: data.description,
      homepage: data.homepage || data.url,
      repository: data.scm?.url,
      license: data.licenses?.join(', '),
      downloads: data.downloads,
      raw: data,
    };

    await indexer.addPackage(entry, data);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void> {
    const group = scope || name;
    // Maven-style group path: dots → slashes
    const groupPath = group.replace(/\./g, '/');
    const filename = `${name}-${version}.jar`;
    const downloadUrl = `${API_BASE}/repo/${groupPath}/${encodeURIComponent(name)}/${version}/${filename}`;

    await indexer.downloadVersion(downloadUrl, name, version, filename, scope);
  }
}
