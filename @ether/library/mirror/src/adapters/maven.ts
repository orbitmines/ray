import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Maven Central registry adapter (Java / Kotlin / Scala).
 *
 * API endpoints:
 *   - Search (all artifacts):  GET https://search.maven.org/solrsearch/select?q=*:*&rows=200&start={offset}&wt=json
 *   - Search (specific):       GET https://search.maven.org/solrsearch/select?q=g:{groupId}+AND+a:{artifactId}&core=gav&rows=200&wt=json
 *   - Download JAR:            GET https://repo1.maven.org/maven2/{groupPath}/{artifactId}/{version}/{artifactId}-{version}.jar
 *     Where groupPath = groupId with dots replaced by /
 *
 * ~10M artifacts. Rate limiting is important — Maven Central will block aggressive crawlers.
 * Cursor: start offset for pagination.
 */

const SEARCH_BASE = 'https://search.maven.org/solrsearch/select';
const REPO_BASE = 'https://repo1.maven.org/maven2';
const PAGE_SIZE = 200;

interface SolrSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: SolrDoc[];
  };
}

interface SolrDoc {
  id: string;           // "groupId:artifactId:version" or "groupId:artifactId"
  g: string;            // groupId
  a: string;            // artifactId
  v?: string;           // version (latest for core search, specific for gav search)
  latestVersion?: string;
  p?: string;           // packaging type (jar, pom, war, etc.)
  timestamp?: number;   // last modified timestamp in ms
  ec?: string[];        // available file extensions
  repositoryId?: string;
  text?: string[];
  versionCount?: number;
  tags?: string[];
}

interface SolrGavResponse {
  response: {
    numFound: number;
    start: number;
    docs: SolrGavDoc[];
  };
}

interface SolrGavDoc {
  id: string;
  g: string;
  a: string;
  v: string;
  p?: string;
  timestamp?: number;
  ec?: string[];
  tags?: string[];
}

function groupIdToPath(groupId: string): string {
  return groupId.replace(/\./g, '/');
}

/**
 * Small delay to avoid hammering the search API.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['maven'];

export class MavenAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['maven'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    let start = typeof cursor === 'number' ? cursor : 0;

    // First request to learn total count
    const firstUrl = `${SEARCH_BASE}?q=*:*&rows=${PAGE_SIZE}&start=${start}&wt=json`;
    const firstPage = await fetchJson<SolrSearchResponse>(firstUrl, indexer.httpOpts);
    const total = firstPage.response.numFound;
    let count = 0;

    // Process the first page
    for (const doc of firstPage.response.docs) {
      const entry = this.docToEntry(doc);
      await indexer.addPackage(entry, doc);
      yield entry;
      count++;
    }

    start += firstPage.response.docs.length;
    await indexer.checkpoint(start);

    // Continue paginating
    while (start < total) {
      // Be conservative with rate limiting
      await delay(500);

      const url = `${SEARCH_BASE}?q=*:*&rows=${PAGE_SIZE}&start=${start}&wt=json`;

      let page: SolrSearchResponse;
      try {
        page = await fetchJson<SolrSearchResponse>(url, indexer.httpOpts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [maven] Error at offset ${start}: ${msg}`);
        // Wait longer and retry once
        await delay(5000);
        page = await fetchJson<SolrSearchResponse>(url, indexer.httpOpts);
      }

      if (!page.response.docs || page.response.docs.length === 0) break;

      for (const doc of page.response.docs) {
        const entry = this.docToEntry(doc);
        await indexer.addPackage(entry, doc);
        yield entry;
        count++;
      }

      start += page.response.docs.length;
      await indexer.checkpoint(start);
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const cursor = indexer.getCursor();
    if (cursor === null) {
      yield* this.enumerate(indexer);
      return;
    }

    // Maven Central search API can sort by timestamp to find recently updated artifacts.
    // We query for artifacts modified since our last sync using timestamp sort.
    const lastOffset = typeof cursor === 'number' ? cursor : 0;

    // Use a timestamp-based query: sort by timestamp descending, fetch recent changes
    // We'll paginate through all artifacts sorted by modification time
    let start = 0;
    const seen = new Set<string>();

    while (true) {
      await delay(500);

      const url = `${SEARCH_BASE}?q=*:*&rows=${PAGE_SIZE}&start=${start}&sort=timestamp+desc&wt=json`;
      let page: SolrSearchResponse;

      try {
        page = await fetchJson<SolrSearchResponse>(url, indexer.httpOpts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [maven] Incremental error at offset ${start}: ${msg}`);
        break;
      }

      if (!page.response.docs || page.response.docs.length === 0) break;

      let allOld = true;

      for (const doc of page.response.docs) {
        const key = `${doc.g}:${doc.a}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const entry = this.docToEntry(doc);
        await indexer.addPackage(entry, doc);
        yield entry;
        allOld = false;
      }

      start += page.response.docs.length;

      // Stop after processing a reasonable number of recent changes
      // or if the batch appears to have no new content
      if (allOld || start >= 10000) break;
    }

    // Keep the previous offset cursor so full enumeration can resume
    await indexer.checkpoint(lastOffset);
    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry> {
    // name = artifactId, scope = groupId
    const groupId = scope;
    const artifactId = name;

    if (!groupId) {
      // Search by artifactId alone
      const url = `${SEARCH_BASE}?q=a:${encodeURIComponent(artifactId)}&rows=1&wt=json`;
      const data = await fetchJson<SolrSearchResponse>(url, indexer.httpOpts);

      if (!data.response.docs || data.response.docs.length === 0) {
        throw new Error(`Maven artifact not found: ${artifactId}`);
      }

      const doc = data.response.docs[0];
      const entry = this.docToEntry(doc);
      await indexer.addPackage(entry, doc);
      return entry;
    }

    // Search by both groupId and artifactId, using GAV core for version listing
    const url = `${SEARCH_BASE}?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&core=gav&rows=${PAGE_SIZE}&wt=json`;
    const data = await fetchJson<SolrGavResponse>(url, indexer.httpOpts);

    if (!data.response.docs || data.response.docs.length === 0) {
      throw new Error(`Maven artifact not found: ${groupId}:${artifactId}`);
    }

    const versions = data.response.docs.map(d => d.v);
    const latest = data.response.docs[0];

    const entry: PackageEntry = {
      name: artifactId,
      scope: groupId,
      version: latest.v,
      versions,
      updatedAt: latest.timestamp ? new Date(latest.timestamp).toISOString() : undefined,
      raw: data.response.docs,
    };

    await indexer.addPackage(entry, data.response.docs);
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void> {
    if (!scope) {
      throw new Error(`Maven downloads require a groupId (scope). Use: downloadVersion(indexer, artifactId, version, groupId)`);
    }

    const groupId = scope;
    const artifactId = name;
    const groupPath = groupIdToPath(groupId);

    // Try JAR first, fall back to POM
    const jarFilename = `${artifactId}-${version}.jar`;
    const jarUrl = `${REPO_BASE}/${groupPath}/${artifactId}/${version}/${jarFilename}`;

    try {
      await indexer.downloadVersion(jarUrl, name, version, jarFilename, scope);
    } catch {
      // JAR might not exist (e.g., POM-only artifacts). Try POM.
      const pomFilename = `${artifactId}-${version}.pom`;
      const pomUrl = `${REPO_BASE}/${groupPath}/${artifactId}/${version}/${pomFilename}`;
      await indexer.downloadVersion(pomUrl, name, version, pomFilename, scope);
    }
  }

  // -- internal --

  private docToEntry(doc: SolrDoc): PackageEntry {
    const latestVersion = doc.latestVersion || doc.v;

    return {
      name: doc.a,
      scope: doc.g,
      version: latestVersion,
      updatedAt: doc.timestamp ? new Date(doc.timestamp).toISOString() : undefined,
      raw: doc,
    };
  }
}
