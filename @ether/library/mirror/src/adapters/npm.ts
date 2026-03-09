import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * npm package registry adapter (JavaScript / TypeScript).
 *
 * API endpoints:
 *   - CouchDB changes feed: GET https://replicate.npmjs.com/_changes?since={seq}&limit=1000&include_docs=true
 *     Returns { results: [{seq, id, doc, changes}], last_seq, pending }
 *   - Per-package (full):   GET https://registry.npmjs.org/{name}
 *   - Per-package (version):GET https://registry.npmjs.org/{name}/{version}
 *   - Scoped package:       GET https://registry.npmjs.org/@{scope}%2F{name}
 *   - Download tarball:     GET https://registry.npmjs.org/{name}/-/{name}-{version}.tgz
 *     Scoped:               GET https://registry.npmjs.org/@{scope}/{name}/-/{name}-{version}.tgz
 *
 * ~3M packages. The CouchDB changes feed is the canonical enumeration mechanism.
 * Cursor: seq number from _changes feed. Perfect for incremental.
 */

const CHANGES_URL = 'https://replicate.npmjs.com/_changes';
const REGISTRY_URL = 'https://registry.npmjs.org';
const CHANGES_LIMIT = 500;

interface CouchDBChanges {
  results: CouchDBChange[];
  last_seq: string | number;
  pending?: number;
}

interface CouchDBChange {
  seq: string | number;
  id: string;
  changes: { rev: string }[];
  deleted?: boolean;
  doc?: NpmPackageDoc;
}

interface NpmPackageDoc {
  _id: string;
  _rev: string;
  name: string;
  description?: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, NpmVersionData>;
  time?: Record<string, string>;
  homepage?: string;
  repository?: { type?: string; url?: string } | string;
  license?: string | { type?: string };
  readme?: string;
}

interface NpmVersionData {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  license?: string | { type?: string };
  repository?: { type?: string; url?: string } | string;
  dist?: {
    tarball: string;
    shasum?: string;
    integrity?: string;
  };
}

function parseScope(name: string): { scope?: string; shortName: string } {
  if (name.startsWith('@')) {
    const slashIdx = name.indexOf('/');
    if (slashIdx !== -1) {
      return {
        scope: name.substring(0, slashIdx),    // "@angular"
        shortName: name.substring(slashIdx + 1), // "core"
      };
    }
  }
  return { shortName: name };
}

function extractLicense(license: string | { type?: string } | undefined): string | undefined {
  if (!license) return undefined;
  if (typeof license === 'string') return license;
  return license.type;
}

function extractRepoUrl(repo: { type?: string; url?: string } | string | undefined): string | undefined {
  if (!repo) return undefined;
  if (typeof repo === 'string') return repo;
  return repo.url;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['npm'];

export class NpmAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['npm'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    let since: string | number = cursor !== null ? cursor : 0;
    let count = 0;

    while (true) {
      // replicate.npmjs.com blocks include_docs=true, so we fetch IDs
      // from the changes feed and then get each doc from the registry.
      const url = `${CHANGES_URL}?since=${encodeURIComponent(String(since))}&limit=${CHANGES_LIMIT}`;
      const data = await fetchJson<CouchDBChanges>(url, indexer.httpOpts);

      if (!data.results || data.results.length === 0) break;

      for (const change of data.results) {
        if (change.id.startsWith('_design/')) continue;
        if (change.deleted) continue;

        try {
          const doc = await this.fetchDoc(change.id, indexer);
          if (!doc || !doc.name) continue;

          const entry = this.docToEntry(doc);
          await indexer.addPackage(entry, doc);
          yield entry;
          count++;
        } catch {
          // Package may have been deleted or is inaccessible — skip
          continue;
        }
      }

      since = data.last_seq;
      await indexer.checkpoint(since);

      if (data.pending !== undefined && data.pending === 0) break;
      if (data.results.length < CHANGES_LIMIT) break;
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // The CouchDB changes feed is inherently incremental.
    // enumerate() already resumes from cursor.
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry> {
    const fullName = scope ? `${scope}/${name}` : name;
    const encodedName = fullName.startsWith('@')
      ? fullName.replace('/', '%2F')
      : encodeURIComponent(fullName);

    const url = `${REGISTRY_URL}/${encodedName}`;
    const doc = await fetchJson<NpmPackageDoc>(url, indexer.httpOpts);

    const entry = this.docToEntry(doc);
    await indexer.addPackage(entry, doc);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void> {
    // Parse scope from name if not provided separately (e.g., "@angular/core" → scope="@angular", name="core")
    let effectiveScope = scope;
    let effectiveName = name;
    if (!effectiveScope && name.startsWith('@')) {
      const parsed = parseScope(name);
      if (parsed.scope) {
        effectiveScope = parsed.scope;
        effectiveName = parsed.shortName;
      }
    }

    const fullName = effectiveScope ? `${effectiveScope}/${effectiveName}` : effectiveName;

    // Fetch the package document to get the exact tarball URL
    const encodedName = fullName.startsWith('@')
      ? fullName.replace('/', '%2F')
      : encodeURIComponent(fullName);

    const url = `${REGISTRY_URL}/${encodedName}`;
    const doc = await fetchJson<NpmPackageDoc>(url, indexer.httpOpts);

    const versionData = doc.versions?.[version];
    if (!versionData) {
      throw new Error(`Version ${version} not found for ${fullName}`);
    }

    const tarballUrl = versionData.dist?.tarball;
    if (!tarballUrl) {
      const tgzName = `${effectiveName}-${version}.tgz`;
      const prefix = effectiveScope ? `${effectiveScope}/${effectiveName}` : effectiveName;
      const fallbackUrl = `${REGISTRY_URL}/${prefix}/-/${tgzName}`;
      await indexer.downloadVersion(fallbackUrl, effectiveName, version, tgzName, effectiveScope || undefined);
      return;
    }

    const filename = `${effectiveName}-${version}.tgz`;
    await indexer.downloadVersion(tarballUrl, effectiveName, version, filename, effectiveScope || undefined);
  }

  // -- internal --

  private async fetchDoc(name: string, indexer: Indexer): Promise<NpmPackageDoc> {
    const encodedName = name.startsWith('@')
      ? name.replace('/', '%2F')
      : encodeURIComponent(name);
    return fetchJson<NpmPackageDoc>(`${REGISTRY_URL}/${encodedName}`, indexer.httpOpts);
  }

  private docToEntry(doc: NpmPackageDoc): PackageEntry {
    const { scope, shortName } = parseScope(doc.name);
    const distTags = doc['dist-tags'] || {};
    const latestVersion = distTags['latest'];
    const versions = Object.keys(doc.versions || {});

    // Get metadata from the latest version if available
    const latestData = latestVersion ? doc.versions?.[latestVersion] : undefined;

    // Find the most recent update time
    let updatedAt: string | undefined;
    if (doc.time) {
      const modified = doc.time['modified'];
      if (modified) updatedAt = modified;
    }

    return {
      name: scope ? shortName : doc.name,
      scope: scope || undefined,
      version: latestVersion,
      versions,
      description: doc.description || latestData?.description,
      homepage: doc.homepage || latestData?.homepage,
      repository: extractRepoUrl(doc.repository || latestData?.repository),
      license: extractLicense(doc.license || latestData?.license),
      updatedAt,
      raw: doc,
    };
  }
}
