import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Nimble package registry adapter (Nim).
 *
 * Nimble's package list is a single JSON file hosted on GitHub:
 *   https://raw.githubusercontent.com/nim-lang/packages/master/packages.json
 *
 * The dataset is small (~2K packages), so full enumeration re-downloads
 * the entire list each time. There is no cursor-based pagination.
 */

const PACKAGES_URL = 'https://raw.githubusercontent.com/nim-lang/packages/master/packages.json';

interface NimblePackage {
  name: string;
  url: string;
  method: string;
  description?: string;
  license?: string;
  tags?: string[];
  web?: string;
  alias?: string;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['nimble'];

export class NimbleAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['nimble'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const packages = await fetchJson<NimblePackage[]>(PACKAGES_URL, indexer.httpOpts);

    let count = 0;
    for (const pkg of packages) {
      // Skip aliases — they point to other packages
      if (pkg.alias) continue;

      const entry: PackageEntry = {
        name: pkg.name,
        description: pkg.description,
        homepage: pkg.web || pkg.url,
        repository: pkg.url,
        license: pkg.license,
        raw: pkg,
      };

      await indexer.addPackage(entry, pkg);
      yield entry;

      count++;
      if (count % 200 === 0) {
        await indexer.checkpoint(count);
      }
    }

    await indexer.checkpoint(count);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Small dataset — full re-enumeration is the incremental strategy
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const packages = await fetchJson<NimblePackage[]>(PACKAGES_URL, indexer.httpOpts);
    const pkg = packages.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (!pkg) {
      throw new Error(`Nimble package not found: ${name}`);
    }

    const entry: PackageEntry = {
      name: pkg.name,
      description: pkg.description,
      homepage: pkg.web || pkg.url,
      repository: pkg.url,
      license: pkg.license,
      raw: pkg,
    };

    await indexer.addPackage(entry, pkg);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    // Nimble packages are hosted in git repos — no tarball downloads.
    // Save the metadata as the "download" artifact.
    const packages = await fetchJson<NimblePackage[]>(PACKAGES_URL, indexer.httpOpts);
    const pkg = packages.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (!pkg) {
      throw new Error(`Nimble package not found: ${name}`);
    }

    await indexer.addVersion(name, version, {
      name: pkg.name,
      version,
      url: pkg.url,
      method: pkg.method,
      description: pkg.description,
      license: pkg.license,
    });
  }
}
