import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * NuGet package registry adapter (C# / F# / .NET).
 *
 * API endpoints (NuGet V3):
 *   - Service index:  GET https://api.nuget.org/v3/index.json
 *   - Catalog index:  GET https://api.nuget.org/v3/catalog0/index.json
 *   - Catalog page:   GET {catalogPageUrl}
 *   - Registration:   GET https://api.nuget.org/v3/registration5-gz-semver2/{id}/index.json
 *   - Download:       GET https://api.nuget.org/v3-flatcontainer/{id}/{version}/{id}.{version}.nupkg
 *
 * ~400K packages. Uses the catalog for full/incremental enumeration.
 */

const CATALOG_INDEX = 'https://api.nuget.org/v3/catalog0/index.json';
const REGISTRATION_BASE = 'https://api.nuget.org/v3/registration5-gz-semver2';
const FLAT_CONTAINER = 'https://api.nuget.org/v3-flatcontainer';

interface CatalogIndex {
  commitTimeStamp: string;
  count: number;
  items: CatalogPage[];
}

interface CatalogPage {
  '@id': string;
  commitTimeStamp: string;
  count: number;
  items?: CatalogLeaf[];
}

interface CatalogLeaf {
  '@id': string;
  '@type': string;
  commitTimeStamp: string;
  'nuget:id': string;
  'nuget:version': string;
}

interface CatalogPageDetail {
  '@id': string;
  commitTimeStamp: string;
  count: number;
  items: CatalogLeaf[];
}

interface RegistrationIndex {
  count: number;
  items: RegistrationPage[];
}

interface RegistrationPage {
  '@id': string;
  count: number;
  lower: string;
  upper: string;
  items?: RegistrationLeaf[];
}

interface RegistrationLeaf {
  catalogEntry: {
    '@id': string;
    id: string;
    version: string;
    description?: string;
    authors?: string;
    licenseExpression?: string;
    licenseUrl?: string;
    projectUrl?: string;
    listed?: boolean;
    published?: string;
    summary?: string;
    tags?: string[];
    totalDownloads?: number;
  };
  packageContent?: string;
}

/**
 * Cursor format: "pageIndex:commitTimeStamp"
 * pageIndex = last fully processed catalog page index
 * commitTimeStamp = for filtering within a page during incremental
 */
function parseCursor(cursor: string | number | null): { pageIndex: number; commitTime: string | null } {
  if (cursor === null) return { pageIndex: 0, commitTime: null };
  const s = String(cursor);
  const sep = s.indexOf(':');
  if (sep === -1) {
    return { pageIndex: parseInt(s, 10) || 0, commitTime: null };
  }
  return {
    pageIndex: parseInt(s.substring(0, sep), 10) || 0,
    commitTime: s.substring(sep + 1) || null,
  };
}

function encodeCursor(pageIndex: number, commitTime: string): string {
  return `${pageIndex}:${commitTime}`;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['nuget'];

export class NuGetAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['nuget'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const catalog = await fetchJson<CatalogIndex>(CATALOG_INDEX, indexer.httpOpts);
    const pages = catalog.items;

    // Sort pages by commitTimeStamp ascending
    pages.sort((a, b) => a.commitTimeStamp.localeCompare(b.commitTimeStamp));

    const { pageIndex: startPage } = parseCursor(indexer.getCursor());

    // Track packages we've already yielded to deduplicate across pages
    const seen = new Set<string>();
    let count = 0;

    for (let i = startPage; i < pages.length; i++) {
      const page = pages[i];
      let items = page.items;

      // If items aren't inlined, fetch the page
      if (!items || items.length === 0) {
        const pageDetail = await fetchJson<CatalogPageDetail>(page['@id'], indexer.httpOpts);
        items = pageDetail.items;
      }

      for (const leaf of items) {
        // Only process PackageDetails (not PackageDelete)
        const leafType = leaf['@type'];
        if (typeof leafType === 'string' && leafType.includes('PackageDelete')) continue;

        const id = leaf['nuget:id'];
        const version = leaf['nuget:version'];
        const lowerName = id.toLowerCase();

        if (seen.has(lowerName)) continue;
        seen.add(lowerName);

        const entry: PackageEntry = {
          name: id,
          version,
          updatedAt: leaf.commitTimeStamp,
          raw: leaf,
        };

        await indexer.addPackage(entry, leaf);
        yield entry;
        count++;
      }

      await indexer.checkpoint(encodeCursor(i + 1, page.commitTimeStamp));
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    const { pageIndex, commitTime } = parseCursor(cursor);

    if (!commitTime) {
      // No previous timestamp — fall back to full
      yield* this.enumerate(indexer);
      return;
    }

    const catalog = await fetchJson<CatalogIndex>(CATALOG_INDEX, indexer.httpOpts);
    const pages = catalog.items;
    pages.sort((a, b) => a.commitTimeStamp.localeCompare(b.commitTimeStamp));

    // Find pages with commitTimeStamp > our saved commitTime
    const startIdx = pages.findIndex(p => p.commitTimeStamp > commitTime);
    if (startIdx === -1) {
      // Nothing new
      await indexer.finish();
      return;
    }

    const seen = new Set<string>();
    let lastCommit = commitTime;

    for (let i = startIdx; i < pages.length; i++) {
      const page = pages[i];
      let items = page.items;

      if (!items || items.length === 0) {
        const pageDetail = await fetchJson<CatalogPageDetail>(page['@id'], indexer.httpOpts);
        items = pageDetail.items;
      }

      for (const leaf of items) {
        // Only items newer than our commit time
        if (leaf.commitTimeStamp <= commitTime) continue;

        const leafType = leaf['@type'];
        if (typeof leafType === 'string' && leafType.includes('PackageDelete')) continue;

        const id = leaf['nuget:id'];
        const lowerName = id.toLowerCase();

        if (seen.has(lowerName)) continue;
        seen.add(lowerName);

        const entry: PackageEntry = {
          name: id,
          version: leaf['nuget:version'],
          updatedAt: leaf.commitTimeStamp,
          raw: leaf,
        };

        await indexer.addPackage(entry, leaf);
        yield entry;
      }

      lastCommit = page.commitTimeStamp;
      await indexer.checkpoint(encodeCursor(i + 1, lastCommit));
    }

    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string, _scope?: string): Promise<PackageEntry> {
    const lowerId = name.toLowerCase();
    const url = `${REGISTRATION_BASE}/${lowerId}/index.json`;
    const regIndex = await fetchJson<RegistrationIndex>(url, indexer.httpOpts);

    const allVersions: string[] = [];
    let description: string | undefined;
    let license: string | undefined;
    let homepage: string | undefined;
    let downloads: number | undefined;
    let latestVersion: string | undefined;

    for (const page of regIndex.items) {
      let leaves = page.items;

      // If items not inlined, fetch the page
      if (!leaves || leaves.length === 0) {
        const pageData = await fetchJson<RegistrationPage & { items: RegistrationLeaf[] }>(
          page['@id'], indexer.httpOpts
        );
        leaves = pageData.items;
      }

      for (const leaf of leaves) {
        const ce = leaf.catalogEntry;
        if (ce.listed === false) continue;

        allVersions.push(ce.version);
        latestVersion = ce.version;
        description = ce.description || description;
        license = ce.licenseExpression || license;
        homepage = ce.projectUrl || homepage;
        if (ce.totalDownloads !== undefined) downloads = ce.totalDownloads;
      }
    }

    const entry: PackageEntry = {
      name,
      version: latestVersion,
      versions: allVersions,
      description,
      homepage,
      license,
      downloads,
      raw: regIndex,
    };

    await indexer.addPackage(entry, regIndex);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, _scope?: string): Promise<void> {
    const lowerId = name.toLowerCase();
    const lowerVersion = version.toLowerCase();
    const downloadUrl = `${FLAT_CONTAINER}/${lowerId}/${lowerVersion}/${lowerId}.${lowerVersion}.nupkg`;
    const filename = `${lowerId}.${lowerVersion}.nupkg`;

    await indexer.downloadVersion(downloadUrl, name, version, filename);
  }
}
