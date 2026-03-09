import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { httpGet } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * LuaRocks package registry adapter (Lua).
 *
 * LuaRocks has no JSON API. Data is sourced from the Lua manifest file:
 *   - Manifest:  GET https://luarocks.org/manifest
 *     Returns a Lua table with `repository = { ["pkg"] = { ["ver"] = { ... } } }`
 *   - Download:  https://luarocks.org/manifests/root/{name}-{version}.src.rock
 *
 * ~5K packages. The manifest is fetched once and parsed with regex.
 */

const MANIFEST_URL = 'https://luarocks.org/manifest';
const DOWNLOAD_BASE = 'https://luarocks.org/manifests/root';

/**
 * Parsed package from the Lua manifest.
 */
interface ManifestPackage {
  name: string;
  versions: string[];
}

/**
 * Parse the LuaRocks manifest (Lua table format) to extract package names and versions.
 *
 * The manifest looks like:
 *   repository = {
 *      ["15puzzle.nvim"] = {
 *         ["1.4.0-1"] = {
 *            { arch = "rockspec" }, { arch = "src" }
 *         },
 *         ["1.3.0-1"] = { ... },
 *      },
 *      ["luasocket"] = { ... },
 *   }
 *
 * We extract everything between `repository = {` and its closing `}`,
 * then pull out top-level `["name"]` keys and their nested `["version"]` keys.
 */
function parseManifest(text: string): ManifestPackage[] {
  // Find the repository block
  const repoStart = text.indexOf('repository = {');
  if (repoStart === -1) return [];

  // We'll parse the block by tracking brace depth from the opening `{`
  const startBrace = text.indexOf('{', repoStart);
  if (startBrace === -1) return [];

  const packages: ManifestPackage[] = [];

  // Use regex to find top-level package entries and their version sub-keys.
  // We scan line by line inside the repository block, tracking brace depth.
  let depth = 0;
  let currentPkg: string | null = null;
  let currentVersions: string[] = [];
  let pkgDepth = 0;

  // Pattern for a key like: ["package-name"] = { OR bare: package_name = {
  const pkgKeyRe = /^\s*(?:\["([^"]+)"\]|([a-zA-Z_][a-zA-Z0-9_]*))\s*=\s*\{/;
  // Pattern for closing brace (possibly with comma)
  const closeBraceRe = /^\s*\}/;

  const lines = text.slice(startBrace).split('\n');

  for (const line of lines) {
    // Count braces on this line (outside of strings for simplicity;
    // manifest keys don't contain braces so this is safe)
    const openCount = (line.match(/\{/g) || []).length;
    const closeCount = (line.match(/\}/g) || []).length;

    if (depth === 1 && currentPkg === null) {
      // At top level of repository — look for package key
      const pkgMatch = pkgKeyRe.exec(line);
      if (pkgMatch) {
        currentPkg = pkgMatch[1] ?? pkgMatch[2]; // quoted or bare name
        currentVersions = [];
        pkgDepth = depth; // depth before this line's braces
      }
    } else if (depth === 2 && currentPkg !== null) {
      // Inside a package — look for version keys
      const verMatch = pkgKeyRe.exec(line);
      if (verMatch) {
        currentVersions.push(verMatch[1] ?? verMatch[2]);
      }
    }

    depth += openCount - closeCount;

    // When we return to depth 1, the current package block has closed
    if (currentPkg !== null && depth <= 1) {
      packages.push({ name: currentPkg, versions: currentVersions });
      currentPkg = null;
      currentVersions = [];
    }

    // If depth drops to 0, we've exited the repository block
    if (depth <= 0) break;
  }

  return packages;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['luarocks'];

export class LuaRocksAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['luarocks'];

  /**
   * Cached parsed manifest (avoids re-fetching within a session).
   */
  private manifestCache: ManifestPackage[] | null = null;

  private async getManifest(indexer: Indexer): Promise<ManifestPackage[]> {
    if (this.manifestCache) return this.manifestCache;

    const res = await httpGet(MANIFEST_URL, indexer.httpOpts);
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status} fetching LuaRocks manifest: ${res.body.slice(0, 200)}`);
    }

    this.manifestCache = parseManifest(res.body);
    return this.manifestCache;
  }

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const packages = await this.getManifest(indexer);

    const cursor = indexer.getCursor();
    const startIndex = typeof cursor === 'number' ? cursor : 0;

    for (let i = startIndex; i < packages.length; i++) {
      const pkg = packages[i];
      const latestVersion = pkg.versions.length > 0 ? pkg.versions[0] : undefined;

      const entry: PackageEntry = {
        name: pkg.name,
        version: latestVersion,
        versions: pkg.versions,
        raw: { name: pkg.name, versions: pkg.versions },
      };

      await indexer.addPackage(entry, { name: pkg.name, versions: pkg.versions });
      yield entry;

      // Checkpoint every 500 packages
      if ((i + 1) % 500 === 0) {
        await indexer.checkpoint(i + 1);
      }
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // LuaRocks has no change feed — re-enumerate from scratch
    // Clear manifest cache so we fetch a fresh copy
    this.manifestCache = null;
    yield* this.enumerate(indexer);
  }

  async fetchPackage(indexer: Indexer, name: string, _scope?: string): Promise<PackageEntry> {
    const packages = await this.getManifest(indexer);

    const pkg = packages.find(p => p.name === name);
    if (!pkg) {
      throw new Error(`Package "${name}" not found in LuaRocks manifest`);
    }

    const latestVersion = pkg.versions.length > 0 ? pkg.versions[0] : undefined;

    const entry: PackageEntry = {
      name: pkg.name,
      version: latestVersion,
      versions: pkg.versions,
      raw: { name: pkg.name, versions: pkg.versions },
    };

    await indexer.addPackage(entry, { name: pkg.name, versions: pkg.versions });
    return entry;
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, _scope?: string): Promise<void> {
    const filename = `${name}-${version}.src.rock`;
    const downloadUrl = `${DOWNLOAD_BASE}/${filename}`;

    await indexer.downloadVersion(downloadUrl, name, version, filename);
  }
}
