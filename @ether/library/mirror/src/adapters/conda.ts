import type { PlatformConfig, PackageEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { REGISTRY_PLATFORMS } from '../core/registry-map.js';
import { fetchJson } from '../core/http.js';
import type { RegistryAdapter } from './adapter.js';

/**
 * Conda package registry adapter (multi-channel).
 *
 * Conda organizes packages into channels and subdirectories:
 *   - Channels:  conda-forge, main (defaults), bioconda, etc.
 *   - Subdirs:   noarch (platform-independent), linux-64, osx-64, win-64, etc.
 *
 * Repodata endpoint (large JSON per channel/subdir):
 *   GET https://conda.anaconda.org/{channel}/{subdir}/repodata.json
 *
 * Response shape:
 *   {
 *     packages: { "name-version-build.tar.bz2": { name, version, depends, license, ... } },
 *     packages.conda: { "name-version-build.conda": { name, version, depends, license, ... } }
 *   }
 *
 * Download:
 *   GET https://conda.anaconda.org/{channel}/{subdir}/{filename}
 *
 * Cursor format: "channelIndex:subdirIndex:lastPackageName" for resumption.
 *
 * conda-forge/noarch alone has ~30K+ unique packages.
 * Full enumeration deduplicates by package name across all channels.
 */

const BASE_URL = 'https://conda.anaconda.org';

/** Channels to enumerate, ordered by priority (conda-forge is largest). */
const CHANNELS = ['conda-forge', 'main', 'bioconda'] as const;

/** Subdirectories to enumerate (start small: platform-independent + linux). */
const SUBDIRS = ['noarch', 'linux-64'] as const;

/** A single package record inside repodata.json. */
interface CondaRepodataPackage {
  name: string;
  version: string;
  build: string;
  build_number?: number;
  depends?: string[];
  license?: string;
  license_family?: string;
  md5?: string;
  sha256?: string;
  size?: number;
  subdir?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/** Top-level shape of repodata.json. */
interface CondaRepodata {
  info?: { subdir?: string };
  packages?: Record<string, CondaRepodataPackage>;
  'packages.conda'?: Record<string, CondaRepodataPackage>;
}

/** Aggregated info for a unique package name (across all filenames/versions). */
interface AggregatedPackage {
  name: string;
  versions: Set<string>;
  latestVersion: string;
  latestTimestamp: number;
  license: string | undefined;
  depends: string[] | undefined;
  channel: string;
  subdir: string;
  /** The filename of the latest version (for download). */
  latestFilename: string;
}

/**
 * Parse the cursor string into channel index, subdir index, and last package name.
 * Format: "channelIdx:subdirIdx:lastPackageName"
 */
function parseCursor(cursor: string | number | null): { channelIdx: number; subdirIdx: number; lastPackage: string | null } {
  if (cursor === null || cursor === undefined) {
    return { channelIdx: 0, subdirIdx: 0, lastPackage: null };
  }
  const str = String(cursor);
  const parts = str.split(':');
  if (parts.length < 2) {
    return { channelIdx: 0, subdirIdx: 0, lastPackage: null };
  }
  return {
    channelIdx: parseInt(parts[0], 10) || 0,
    subdirIdx: parseInt(parts[1], 10) || 0,
    lastPackage: parts.length >= 3 ? parts.slice(2).join(':') : null,
  };
}

function encodeCursor(channelIdx: number, subdirIdx: number, lastPackage: string | null): string {
  return `${channelIdx}:${subdirIdx}:${lastPackage ?? ''}`;
}

/**
 * Aggregate all filenames in a repodata response into a map of unique package names.
 * Each package name maps to its set of versions and the latest version info.
 */
function aggregateRepodata(repodata: CondaRepodata, channel: string, subdir: string): Map<string, AggregatedPackage> {
  const pkgMap = new Map<string, AggregatedPackage>();

  const processEntries = (entries: Record<string, CondaRepodataPackage> | undefined, filename: (key: string) => string) => {
    if (!entries) return;
    for (const [key, pkg] of Object.entries(entries)) {
      let agg = pkgMap.get(pkg.name);
      if (!agg) {
        agg = {
          name: pkg.name,
          versions: new Set(),
          latestVersion: pkg.version,
          latestTimestamp: pkg.timestamp ?? 0,
          license: pkg.license,
          depends: pkg.depends,
          channel,
          subdir,
          latestFilename: filename(key),
        };
        pkgMap.set(pkg.name, agg);
      }
      agg.versions.add(pkg.version);

      const ts = pkg.timestamp ?? 0;
      if (ts > agg.latestTimestamp) {
        agg.latestTimestamp = ts;
        agg.latestVersion = pkg.version;
        agg.license = pkg.license;
        agg.depends = pkg.depends;
        agg.latestFilename = filename(key);
      }
    }
  };

  processEntries(repodata.packages, (key) => key);
  processEntries(repodata['packages.conda'], (key) => key);

  return pkgMap;
}

export const platform: PlatformConfig = REGISTRY_PLATFORMS['conda'];

export class CondaAdapter implements RegistryAdapter {
  platform = REGISTRY_PLATFORMS['conda'];

  async *enumerate(indexer: Indexer): AsyncGenerator<PackageEntry> {
    await indexer.setPhase('full');
    indexer.startAutoCheckpoint();

    const cursor = parseCursor(indexer.getCursor());
    const seen = new Set<string>();
    let count = 0;

    for (let ci = cursor.channelIdx; ci < CHANNELS.length; ci++) {
      const channel = CHANNELS[ci];
      const startSubdir = ci === cursor.channelIdx ? cursor.subdirIdx : 0;

      for (let si = startSubdir; si < SUBDIRS.length; si++) {
        const subdir = SUBDIRS[si];
        const skipUntil = (ci === cursor.channelIdx && si === cursor.subdirIdx) ? cursor.lastPackage : null;

        console.error(`  [conda] Fetching repodata: ${channel}/${subdir} ...`);

        let repodata: CondaRepodata;
        try {
          repodata = await fetchJson<CondaRepodata>(
            `${BASE_URL}/${channel}/${subdir}/repodata.json`,
            { ...indexer.httpOpts, timeout: 120_000 }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [conda] Failed to fetch ${channel}/${subdir}: ${msg}, skipping.`);
          continue;
        }

        const aggregated = aggregateRepodata(repodata, channel, subdir);
        const sortedNames = [...aggregated.keys()].sort();

        let skipping = skipUntil !== null;

        for (const name of sortedNames) {
          // Resume logic: skip packages until we pass the cursor position
          if (skipping) {
            if (name <= skipUntil!) continue;
            skipping = false;
          }

          // Global deduplication: a package seen in an earlier channel/subdir is skipped
          if (seen.has(name)) continue;
          seen.add(name);

          const agg = aggregated.get(name)!;
          const versions = [...agg.versions].sort();

          const entry: PackageEntry = {
            name: agg.name,
            scope: channel,
            version: agg.latestVersion,
            versions,
            license: agg.license,
            description: agg.depends ? `depends: ${agg.depends.join(', ')}` : undefined,
            raw: {
              channel,
              subdir,
              latestFilename: agg.latestFilename,
              latestTimestamp: agg.latestTimestamp,
              versionCount: versions.length,
            },
          };

          await indexer.addPackage(entry, entry.raw);
          yield entry;

          count++;
          if (count % 500 === 0) {
            await indexer.checkpoint(encodeCursor(ci, si, name));
          }
        }

        // Finished this channel/subdir pair
        await indexer.checkpoint(encodeCursor(ci, si + 1, null));
      }
    }

    await indexer.finish();
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<PackageEntry> {
    // Conda repodata has no change feed or timestamps endpoint.
    // Re-fetch all repodata and yield only packages whose latest version
    // timestamp is newer than the last sync.
    const lastSyncStr = indexer.getState().lastSync;
    if (!lastSyncStr) {
      // No previous sync — fall back to full enumeration
      yield* this.enumerate(indexer);
      return;
    }

    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    const lastSyncMs = new Date(lastSyncStr).getTime();
    let count = 0;

    for (const channel of CHANNELS) {
      for (const subdir of SUBDIRS) {
        console.error(`  [conda] Incremental: fetching ${channel}/${subdir} ...`);

        let repodata: CondaRepodata;
        try {
          repodata = await fetchJson<CondaRepodata>(
            `${BASE_URL}/${channel}/${subdir}/repodata.json`,
            { ...indexer.httpOpts, timeout: 120_000 }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [conda] Failed to fetch ${channel}/${subdir}: ${msg}, skipping.`);
          continue;
        }

        const aggregated = aggregateRepodata(repodata, channel, subdir);

        for (const [name, agg] of aggregated) {
          // Only yield packages updated after last sync
          // Conda timestamps are in milliseconds (some are in seconds — normalize)
          const ts = agg.latestTimestamp > 1e12 ? agg.latestTimestamp : agg.latestTimestamp * 1000;
          if (ts <= lastSyncMs) continue;

          const versions = [...agg.versions].sort();

          const entry: PackageEntry = {
            name: agg.name,
            scope: channel,
            version: agg.latestVersion,
            versions,
            license: agg.license,
            description: agg.depends ? `depends: ${agg.depends.join(', ')}` : undefined,
            raw: {
              channel,
              subdir,
              latestFilename: agg.latestFilename,
              latestTimestamp: agg.latestTimestamp,
              versionCount: versions.length,
            },
          };

          await indexer.addPackage(entry, entry.raw);
          yield entry;
          count++;
        }
      }
    }

    console.error(`  [conda] Incremental: ${count} updated packages found.`);
    await indexer.finish();
  }

  async fetchPackage(indexer: Indexer, name: string, scope?: string): Promise<PackageEntry> {
    // Use channeldata.json (lightweight per-channel metadata) instead of repodata.json
    // channeldata.json has: { packages: { "name": { description, license, home, version, ... } } }
    const channels = scope ? [scope] : [...CHANNELS];

    for (const channel of channels) {
      let channeldata: { packages?: Record<string, Record<string, unknown>> };
      try {
        channeldata = await fetchJson<{ packages?: Record<string, Record<string, unknown>> }>(
          `${BASE_URL}/${channel}/channeldata.json`,
          { ...indexer.httpOpts, timeout: 60_000 }
        );
      } catch {
        continue;
      }

      const pkg = channeldata.packages?.[name];
      if (!pkg) continue;

      const version = pkg['version'] as string | undefined;
      const entry: PackageEntry = {
        name,
        scope: channel,
        version,
        description: (pkg['description'] as string) ?? undefined,
        homepage: (pkg['home'] as string) ?? undefined,
        license: (pkg['license'] as string) ?? undefined,
        raw: { channel, ...pkg },
      };

      await indexer.addPackage(entry, { channel, ...pkg });
      return entry;
    }

    throw new Error(`Conda package not found: ${name} (searched channels: ${channels.join(', ')})`);
  }

  async downloadVersion(indexer: Indexer, name: string, version: string, scope?: string): Promise<void> {
    // scope = channel (defaults to searching all channels)
    const channels = scope ? [scope] : [...CHANNELS];

    for (const channel of channels) {
      for (const subdir of SUBDIRS) {
        let repodata: CondaRepodata;
        try {
          repodata = await fetchJson<CondaRepodata>(
            `${BASE_URL}/${channel}/${subdir}/repodata.json`,
            { ...indexer.httpOpts, timeout: 120_000 }
          );
        } catch {
          continue;
        }

        // Search through both .tar.bz2 and .conda package entries
        const allEntries: [string, CondaRepodataPackage][] = [
          ...Object.entries(repodata.packages ?? {}),
          ...Object.entries(repodata['packages.conda'] ?? {}),
        ];

        // Find the matching filename for this name + version
        // Prefer .conda format over .tar.bz2 (smaller, faster)
        let matchFilename: string | null = null;
        let matchBz2: string | null = null;

        for (const [filename, pkg] of allEntries) {
          if (pkg.name === name && pkg.version === version) {
            if (filename.endsWith('.conda')) {
              matchFilename = filename;
              break; // Preferred format found
            } else {
              matchBz2 = filename;
            }
          }
        }

        const targetFilename = matchFilename ?? matchBz2;
        if (!targetFilename) continue;

        const downloadUrl = `${BASE_URL}/${channel}/${subdir}/${targetFilename}`;
        await indexer.downloadVersion(downloadUrl, name, version, targetFilename, scope ?? channel);
        return;
      }
    }

    throw new Error(
      `Conda package version not found: ${name}==${version} (searched channels: ${channels.join(', ')}, subdirs: ${[...SUBDIRS].join(', ')})`
    );
  }
}
