import type { PackageEntry } from './core/types.js';
import { Indexer } from './core/indexer.js';
import { RateLimiter } from './core/rate-limit.js';
import { Display } from './core/display.js';
import { resolvePlatform } from './core/registry-map.js';
import {
  getRegistryAdapter, getVCSAdapter,
  allRegistryAdapterIds, allVCSAdapterIds,
} from './adapters/adapter.js';
import type { RegistryAdapter } from './adapters/adapter.js';

interface DailyResult {
  id: string;
  ok: boolean;
  error?: string;
  count?: number;
}

async function runOneDaily(
  mode: 'registry' | 'vcs',
  id: string,
  dataRoot: string,
  databaseRoot: string,
  stateRoot: string,
  display: Display,
): Promise<DailyResult> {
  try {
    const platform = resolvePlatform(id);
    const indexer = await Indexer.create(id, dataRoot, databaseRoot, stateRoot);
    if (platform?.rateLimit) {
      indexer.httpOpts.rateLimiter = new RateLimiter(platform.rateLimit.requests, platform.rateLimit.windowMs);
    }
    indexer.onProgress = (count, current) => display.updateProgress(id, count, current);

    await indexer.setPhase('incremental');
    indexer.startAutoCheckpoint();

    let count = 0;
    if (mode === 'registry') {
      const adapter = await getRegistryAdapter(id);
      if (!adapter) return { id, ok: false, error: 'No adapter found' };
      for await (const entry of adapter.enumerateIncremental(indexer)) {
        count++;
        await downloadAllVersionsDaily(adapter, indexer, entry);
      }
    } else {
      const adapter = await getVCSAdapter(id);
      if (!adapter) return { id, ok: false, error: 'No adapter found' };
      for await (const entry of adapter.enumerateIncremental(indexer)) {
        count++;
        try {
          await adapter.cloneRepo(indexer, entry.owner, entry.name);
        } catch {
          // Clone failure is non-fatal — metadata was already saved
        }
        try {
          await adapter.fetchReleases(indexer, entry.owner, entry.name);
        } catch {
          // Release fetch failure is non-fatal
        }
      }
    }

    await indexer.finish();
    return { id, ok: true, count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id, ok: false, error: msg };
  }
}

/**
 * Daily incremental update for all registries and VCS platforms.
 * Uses Display for dynamic progress rendering.
 */
export async function runDaily(dataRoot: string, databaseRoot: string, stateRoot: string, concurrency = 8): Promise<void> {
  const registryIds = allRegistryAdapterIds();
  const vcsIds = allVCSAdapterIds();

  const allIds = [
    ...registryIds.map(id => ({ id, mode: 'registry' as const })),
    ...vcsIds.map(id => ({ id, mode: 'vcs' as const })),
  ];
  const ids = allIds.map(x => x.id);
  const modeMap = new Map(allIds.map(x => [x.id, x.mode]));

  const labels: Record<string, string> = {};
  for (const id of ids) {
    const p = resolvePlatform(id);
    labels[id] = p?.name ?? id;
  }

  const display = new Display({
    header: `Daily incremental: ${registryIds.length} registries + ${vcsIds.length} VCS (${concurrency} concurrent)`,
    concurrency,
    ids,
    labels,
  });
  display.start();

  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < ids.length) {
      const i = idx++;
      const id = ids[i];
      display.startTask(id);
      const result = await runOneDaily(modeMap.get(id)!, id, dataRoot, databaseRoot, stateRoot, display);
      if (result.ok) {
        display.completeTask(id, result.count ?? 0);
      } else {
        display.failTask(id, result.error ?? 'Unknown error');
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
  await Promise.all(workers);

  display.stop();
}

/**
 * Download ALL versions for a package. If enumerate didn't provide the version
 * list, calls fetchPackage() to get it. Falls back to just the known version.
 */
async function downloadAllVersionsDaily(
  adapter: RegistryAdapter,
  indexer: Indexer,
  entry: PackageEntry,
): Promise<void> {
  let versions = entry.versions;

  if (!versions?.length) {
    if (entry.version) {
      try {
        const full = await adapter.fetchPackage(indexer, entry.name, entry.scope);
        versions = full.versions;
      } catch {
        // Fall back to single version
      }
    }
    if (!versions?.length && entry.version) {
      versions = [entry.version];
    }
  }

  if (!versions?.length) return;

  for (const v of versions) {
    try {
      await adapter.downloadVersion(indexer, entry.name, v, entry.scope);
    } catch {
      // Non-fatal
    }
  }
}
