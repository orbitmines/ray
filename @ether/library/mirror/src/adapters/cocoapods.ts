import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * CocoaPods registry adapter (Swift/Objective-C pods).
 *
 * ~100K pods. Uses two data sources:
 * 1. CDN: https://cdn.cocoapods.org/all_pods.txt for full pod listing
 * 2. Trunk API: https://trunk.cocoapods.org/api/v1/pods/{name} for metadata
 *
 * CDN uses md5-based sharding for podspec files:
 *   Specs/{md5[0]}/{md5[1]}/{md5[2]}/{name}/{version}/{name}.podspec.json
 *
 * Pods don't have direct tarballs -- they reference source git repos.
 * For downloadVersion we save the podspec JSON as version metadata.
 */

export const platform: PlatformConfig = REGISTRY_PLATFORMS['cocoapods'];

const CDN_BASE = 'https://cdn.cocoapods.org';
const TRUNK_API = 'https://trunk.cocoapods.org/api/v1';
const CHECKPOINT_EVERY = 500; // checkpoint every N pods processed

interface TrunkPodResponse {
  name?: string;
  versions?: Array<{
    name: string; // this is the version string
    created_at?: string;
  }>;
  owners?: Array<{ name?: string; email?: string }>;
}

interface CdnPodspec {
  name?: string;
  version?: string;
  summary?: string;
  description?: string;
  homepage?: string;
  license?: string | { type?: string };
  source?: {
    git?: string;
    http?: string;
    tag?: string;
  };
  authors?: Record<string, string> | string;
  platforms?: Record<string, string>;
}

/**
 * Compute md5 hex of a string and return the first 3 characters
 * as individual shard path components.
 */
async function md5Shard(name: string): Promise<{ s1: string; s2: string; s3: string }> {
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('md5').update(name).digest('hex');
  return {
    s1: hash[0],
    s2: hash[1],
    s3: hash[2],
  };
}

function toPackageEntry(name: string, trunk?: TrunkPodResponse, spec?: CdnPodspec): PackageEntry {
  const versions = trunk?.versions?.map(v => v.name);
  const latestVersion = versions?.[versions.length - 1];
  const license = spec?.license
    ? typeof spec.license === 'string' ? spec.license : spec.license.type
    : undefined;

  return {
    name,
    version: latestVersion,
    versions,
    description: spec?.summary ?? spec?.description,
    homepage: spec?.homepage,
    repository: spec?.source?.git,
    license,
    updatedAt: trunk?.versions?.[trunk.versions.length - 1]?.created_at,
    raw: { trunk, spec },
  };
}

export class CocoaPodsAdapter implements RegistryAdapter {
  platform = platform;

  /**
   * Fetch the full list of pod names from CDN.
   */
  private async fetchAllPodNames(indexer: Indexer): Promise<string[]> {
    const url = `${CDN_BASE}/all_pods.txt`;
    console.log('  [cocoapods] Fetching all_pods.txt...');

    const response = await httpGet(url, indexer.httpOpts);
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} fetching all_pods.txt`);
    }

    return response.body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Fetch pod metadata from the Trunk API.
   */
  private async fetchTrunkMeta(indexer: Indexer, name: string): Promise<TrunkPodResponse | null> {
    try {
      return await fetchJson<TrunkPodResponse>(
        `${TRUNK_API}/pods/${encodeURIComponent(name)}`,
        indexer.httpOpts
      );
    } catch {
      return null;
    }
  }

  /**
   * Fetch a podspec JSON from CDN using md5 shard path.
   */
  private async fetchPodspec(indexer: Indexer, name: string, version: string): Promise<CdnPodspec | null> {
    const { s1, s2, s3 } = await md5Shard(name);
    const url = `${CDN_BASE}/Specs/${s1}/${s2}/${s3}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/${encodeURIComponent(name)}.podspec.json`;

    try {
      return await fetchJson<CdnPodspec>(url, indexer.httpOpts);
    } catch {
      return null;
    }
  }

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const allPods = await this.fetchAllPodNames(indexer);
    console.log(`  [cocoapods] Found ${allPods.length} pods`);

    // Resume from cursor (index into sorted pod list)
    const cursor = indexer.getCursor();
    let startIdx = typeof cursor === 'number' ? cursor : 0;

    for (let i = startIdx; i < allPods.length; i++) {
      const podName = allPods[i];

      // Fetch metadata from Trunk API
      const trunk = await this.fetchTrunkMeta(indexer, podName);

      // Try to fetch the latest podspec from CDN for richer metadata
      let spec: CdnPodspec | null = null;
      const latestVersion = trunk?.versions?.[trunk.versions.length - 1]?.name;
      if (latestVersion) {
        spec = await this.fetchPodspec(indexer, podName, latestVersion);
      }

      const entry = toPackageEntry(podName, trunk ?? undefined, spec ?? undefined);
      await indexer.addPackage(entry, { trunk, spec });
      yield entry;

      if ((i + 1) % CHECKPOINT_EVERY === 0) {
        console.log(`  [cocoapods] Progress: ${i + 1}/${allPods.length}`);
        await indexer.checkpoint(i + 1);
      }
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // CocoaPods CDN provides deprecated_pods.txt and all_pods_versions_*.txt
    // For incremental, we re-fetch the full pod list and compare with
    // what we have. Alternatively, we could check the CDN changelog,
    // but the simplest approach is to re-enumerate since the list fetch is fast.
    //
    // For large-scale incremental, compare all_pods.txt line count with
    // our totalIndexed and only process new entries.
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const allPods = await this.fetchAllPodNames(indexer);
    const totalIndexed = indexer.getState().totalIndexed;

    if (allPods.length <= totalIndexed) {
      console.log('  [cocoapods] No new pods detected');
      await indexer.finish();
      return;
    }

    // Process pods from where we left off (assumes sorted/appended)
    console.log(`  [cocoapods] ${allPods.length - totalIndexed} potentially new pods`);

    for (let i = totalIndexed; i < allPods.length; i++) {
      const podName = allPods[i];
      const trunk = await this.fetchTrunkMeta(indexer, podName);

      let spec: CdnPodspec | null = null;
      const latestVersion = trunk?.versions?.[trunk.versions.length - 1]?.name;
      if (latestVersion) {
        spec = await this.fetchPodspec(indexer, podName, latestVersion);
      }

      const entry = toPackageEntry(podName, trunk ?? undefined, spec ?? undefined);
      await indexer.addPackage(entry, { trunk, spec });
      yield entry;

      if ((i + 1) % CHECKPOINT_EVERY === 0) {
        await indexer.checkpoint(i + 1);
      }
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    console.log(`  [cocoapods] Fetching package ${name}...`);

    const trunk = await this.fetchTrunkMeta(indexer, name);
    if (!trunk) {
      throw new Error(`Pod "${name}" not found on Trunk API`);
    }

    let spec: CdnPodspec | null = null;
    const latestVersion = trunk.versions?.[trunk.versions.length - 1]?.name;
    if (latestVersion) {
      spec = await this.fetchPodspec(indexer, name, latestVersion);
    }

    const entry = toPackageEntry(name, trunk, spec ?? undefined);
    await indexer.addPackage(entry, { trunk, spec });
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    // CocoaPods doesn't serve direct tarballs -- pods reference source git repos.
    // We save the podspec JSON as version metadata instead.
    console.log(`  [cocoapods] Saving podspec for ${name}@${version}...`);

    const spec = await this.fetchPodspec(indexer, name, version);
    if (spec) {
      await indexer.addVersion(name, version, spec);
    } else {
      // Fallback: fetch from Trunk API and save version info
      const trunk = await this.fetchTrunkMeta(indexer, name);
      const versionInfo = trunk?.versions?.find(v => v.name === version);
      if (versionInfo) {
        await indexer.addVersion(name, version, versionInfo);
      } else {
        throw new Error(`Version ${version} not found for pod "${name}"`);
      }
    }
  }
}
