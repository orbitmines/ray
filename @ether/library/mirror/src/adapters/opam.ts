import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * opam package registry adapter (OCaml).
 *
 * opam.ocaml.org has NO public REST/JSON API. Package data lives in the
 * GitHub repository: https://github.com/ocaml/opam-repository
 *
 * Strategy:
 *   - enumerate():       Use GitHub Git Trees API to list all package directories
 *                        under packages/. Two calls: one to get the root tree SHA,
 *                        then one to get the packages/ subtree entries.
 *   - fetchPackage():    Use GitHub Contents API to list version directories for
 *                        a package, then fetch each version's opam file from
 *                        raw.githubusercontent.com.
 *   - downloadVersion(): Fetch the raw opam file for a specific version from
 *                        raw.githubusercontent.com.
 *
 * ~4K+ packages. Unauthenticated GitHub API allows 60 req/hr; set GITHUB_TOKEN
 * env var for 5000 req/hr.
 */

const REPO_OWNER = 'ocaml';
const REPO_NAME = 'opam-repository';
const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';

/** A single entry from the GitHub Git Trees API response. */
interface GitTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

/** GitHub Git Trees API response. */
interface GitTreeResponse {
  sha: string;
  url: string;
  tree: GitTreeEntry[];
  truncated: boolean;
}

/** GitHub Contents API directory entry. */
interface GithubContentsEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  url: string;
}

/**
 * Build GitHub API request headers, optionally including auth.
 */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Simple parser for opam file fields.
 * Extracts key fields from the opam file format.
 */
function parseOpamFile(content: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  // Match simple string fields: key: "value"
  const stringFieldRe = /^(\w[\w-]*):\s*"([^"]*)"\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = stringFieldRe.exec(content)) !== null) {
    result[m[1]] = m[2];
  }

  // Match list fields: key: [ "val1" "val2" ]
  const listFieldRe = /^(\w[\w-]*):\s*\[([^\]]*)\]/gm;
  while ((m = listFieldRe.exec(content)) !== null) {
    const items: string[] = [];
    const itemRe = /"([^"]*)"/g;
    let im: RegExpExecArray | null;
    while ((im = itemRe.exec(m[2])) !== null) {
      items.push(im[1]);
    }
    if (items.length > 0) {
      result[m[1]] = items;
    }
  }

  return result;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['opam'];

export class OpamAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['opam'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    if (!process.env['GITHUB_TOKEN']) {
      throw new Error('opam adapter requires GITHUB_TOKEN env var (GitHub API rate limit is 60 req/hr without token). export GITHUB_TOKEN=ghp_...');
    }

    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const ghHeaders = githubHeaders();
    const httpOpts = {
      ...indexer.httpOpts,
      headers: { ...ghHeaders, ...indexer.httpOpts.headers },
    };

    // Step 1: Get the root tree SHA for the default branch (master)
    const rootTree = await fetchJson<GitTreeResponse>(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/master`,
      httpOpts,
    );

    // Step 2: Find the "packages" directory entry in the root tree
    const packagesEntry = rootTree.tree.find(e => e.path === 'packages' && e.type === 'tree');
    if (!packagesEntry) {
      throw new Error('Could not find "packages" directory in opam-repository root tree');
    }

    // Step 3: Get the packages/ subtree — each child is a package name directory
    const packagesTree = await fetchJson<GitTreeResponse>(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${packagesEntry.sha}`,
      httpOpts,
    );

    // Sort by name for deterministic ordering
    const packageDirs = packagesTree.tree
      .filter(e => e.type === 'tree')
      .sort((a, b) => a.path.localeCompare(b.path));

    const cursor = indexer.getCursor();
    const startIdx = typeof cursor === 'number' ? cursor : 0;
    let count = startIdx;

    for (let i = startIdx; i < packageDirs.length; i++) {
      const dir = packageDirs[i];
      const name = dir.path;

      const entry: PackageEntry = {
        name,
        raw: { name, sha: dir.sha },
      };

      await indexer.addPackage(entry, { name, sha: dir.sha });
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
    // opam-repository is small enough for full re-enumeration
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string): Promise<PackageEntry> {
    const ghHeaders = githubHeaders();
    const httpOpts = {
      ...indexer.httpOpts,
      headers: { ...ghHeaders, ...indexer.httpOpts.headers },
    };

    // List version directories: packages/{name}/ contains dirs like {name}.{version}
    const contents = await fetchJson<GithubContentsEntry[]>(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/packages/${encodeURIComponent(name)}`,
      httpOpts,
    );

    const versionDirs = contents
      .filter(e => e.type === 'dir')
      .map(e => e.name);

    // Extract version strings from directory names: "{name}.{version}" → "{version}"
    const prefix = `${name}.`;
    const versions = versionDirs
      .filter(d => d.startsWith(prefix))
      .map(d => d.slice(prefix.length))
      .sort();

    const latestVersion = versions[versions.length - 1];

    // Fetch the opam file for the latest version to get metadata
    let description: string | undefined;
    let homepage: string | undefined;
    let repository: string | undefined;
    let license: string | undefined;

    if (latestVersion) {
      const opamUrl = `${GITHUB_RAW}/${REPO_OWNER}/${REPO_NAME}/master/packages/${name}/${name}.${latestVersion}/opam`;
      const opamRes = await httpGet(opamUrl, httpOpts);
      if (opamRes.status === 200) {
        const parsed = parseOpamFile(opamRes.body);
        description = (typeof parsed['synopsis'] === 'string' ? parsed['synopsis'] : undefined)
          || (typeof parsed['description'] === 'string' ? parsed['description'] : undefined);
        const homepageVal = parsed['homepage'];
        homepage = Array.isArray(homepageVal) ? homepageVal[0] : (typeof homepageVal === 'string' ? homepageVal : undefined);
        const devRepo = parsed['dev-repo'];
        repository = typeof devRepo === 'string' ? devRepo : undefined;
        const licenseVal = parsed['license'];
        license = typeof licenseVal === 'string' ? licenseVal : (Array.isArray(licenseVal) ? licenseVal[0] : undefined);
      }
    }

    const entry: PackageEntry = {
      name,
      versions,
      version: latestVersion,
      description,
      homepage,
      repository,
      license,
      raw: { name, versions, versionDirs },
    };

    await indexer.addPackage(entry, { name, versions, versionDirs });
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string): Promise<void> {
    const ghHeaders = githubHeaders();
    const httpOpts = {
      ...indexer.httpOpts,
      headers: { ...ghHeaders, ...indexer.httpOpts.headers },
    };

    // Fetch the opam file for this specific version
    const opamUrl = `${GITHUB_RAW}/${REPO_OWNER}/${REPO_NAME}/master/packages/${name}/${name}.${version}/opam`;
    const opamRes = await httpGet(opamUrl, httpOpts);

    if (opamRes.status !== 200) {
      throw new Error(`Failed to fetch opam file for ${name}.${version}: HTTP ${opamRes.status}`);
    }

    const parsed = parseOpamFile(opamRes.body);

    await indexer.addVersion(name, version, {
      name,
      version,
      opamFileContent: opamRes.body,
      synopsis: parsed['synopsis'],
      description: parsed['description'],
      license: parsed['license'],
      homepage: parsed['homepage'],
      authors: parsed['authors'],
      maintainer: parsed['maintainer'],
      depends: parsed['depends'],
      'dev-repo': parsed['dev-repo'],
    });
  }
}
