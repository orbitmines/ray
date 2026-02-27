import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * CRAN package registry adapter (R).
 *
 * Uses the PACKAGES DCF file:
 *   GET https://cran.r-project.org/src/contrib/PACKAGES
 *
 * The PACKAGES file is a Debian Control File (DCF) format where entries
 * are separated by blank lines. Each entry has fields like:
 *   Package: name
 *   Version: x.y.z
 *   Depends: ...
 *   License: ...
 *   Title: ...
 *   Description: ...
 *   NeedsCompilation: yes/no
 *
 * Download tarball:
 *   GET https://cran.r-project.org/src/contrib/{name}_{version}.tar.gz
 *
 * ~20K packages. No cursor-based pagination; PACKAGES file is re-parsed.
 */

const BASE_URL = 'https://cran.r-project.org';
const PACKAGES_URL = `${BASE_URL}/src/contrib/PACKAGES`;

interface CranPackage {
  Package: string;
  Version: string;
  Title?: string;
  Description?: string;
  License?: string;
  Depends?: string;
  Imports?: string;
  Suggests?: string;
  NeedsCompilation?: string;
  [key: string]: string | undefined;
}

/**
 * Parse DCF (Debian Control File) format used by CRAN's PACKAGES file.
 * Entries are separated by blank lines. Fields are Key: Value, with
 * continuation lines starting with whitespace.
 */
function parseDCF(text: string): CranPackage[] {
  const results: CranPackage[] = [];
  const blocks = text.split(/\n\s*\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const pkg: Record<string, string> = {};
    let currentKey = '';

    for (const line of trimmed.split('\n')) {
      if (/^\s/.test(line) && currentKey) {
        // Continuation line
        pkg[currentKey] += ' ' + line.trim();
      } else {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          currentKey = line.slice(0, colonIdx).trim();
          pkg[currentKey] = line.slice(colonIdx + 1).trim();
        }
      }
    }

    if (pkg['Package']) {
      results.push(pkg as CranPackage);
    }
  }

  return results;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['cran'];

export class CranAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['cran'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const res = await httpGet(PACKAGES_URL, indexer.httpOpts);
    if (res.status !== 200) {
      throw new Error(`CRAN PACKAGES returned HTTP ${res.status}`);
    }

    const packages = parseDCF(res.body);

    const cursor = indexer.getCursor();
    const startIdx = typeof cursor === 'number' ? cursor : 0;
    let count = startIdx;

    for (let i = startIdx; i < packages.length; i++) {
      const pkg = packages[i];

      const entry: PackageEntry = {
        name: pkg.Package,
        version: pkg.Version,
        description: pkg.Title || pkg.Description,
        license: pkg.License,
        raw: pkg,
      };

      await indexer.addPackage(entry, pkg);
      yield entry;

      count++;
      if (count % 500 === 0) {
        await indexer.checkpoint(count);
      }
    }

    await indexer.checkpoint(count);
    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // CRAN has no change feed. Re-parse the full PACKAGES file.
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    // Fetch the full PACKAGES file and find the named package
    const res = await httpGet(PACKAGES_URL, indexer.httpOpts);
    if (res.status !== 200) {
      throw new Error(`CRAN PACKAGES returned HTTP ${res.status}`);
    }

    const packages = parseDCF(res.body);
    const pkg = packages.find(p => p.Package === name);

    if (!pkg) {
      throw new Error(`CRAN package not found: ${name}`);
    }

    const entry: PackageEntry = {
      name: pkg.Package,
      version: pkg.Version,
      description: pkg.Title || pkg.Description,
      license: pkg.License,
      homepage: `${BASE_URL}/web/packages/${encodeURIComponent(name)}/index.html`,
      raw: pkg,
    };

    await indexer.addPackage(entry, pkg);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const filename = `${name}_${version}.tar.gz`;
    const downloadUrl = `${BASE_URL}/src/contrib/${filename}`;

    await indexer.downloadVersion(downloadUrl, name, version, filename);
  }
}
