import path from 'node:path';
import type { PackageEntry } from './core/types.js';
import { Indexer } from './core/indexer.js';
import { RateLimiter } from './core/rate-limit.js';
import { loadState } from './core/state.js';
import { Display } from './core/display.js';
import {
  REGISTRY_PLATFORMS, VCS_PLATFORMS,
  LANGUAGE_TO_REGISTRY,
  allRegistries, allVCS,
  registryMappingTable, resolvePlatform,
} from './core/registry-map.js';
import {
  getRegistryAdapter, getVCSAdapter,
  allRegistryAdapterIds, allVCSAdapterIds,
} from './adapters/adapter.js';

// Register all adapters
import './adapters/register.js';

// -- Path configuration --
// All paths are relative to the repo root (4 levels up from this file's dir)
const MIRROR_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(MIRROR_DIR, '..', '..', '..', '..');
const DATA_ROOT = path.join(REPO_ROOT, '.ether', '@');
const DATABASE_ROOT = path.join(REPO_ROOT, '@ether', 'library', 'Database');
const STATE_ROOT = path.join(REPO_ROOT, '.ether', 'mirror-state');

async function createIndexer(platformId: string): Promise<Indexer> {
  const platform = resolvePlatform(platformId);
  const indexer = await Indexer.create(platformId, DATA_ROOT, DATABASE_ROOT, STATE_ROOT);
  if (platform?.rateLimit) {
    indexer.httpOpts.rateLimiter = new RateLimiter(platform.rateLimit.requests, platform.rateLimit.windowMs);
  }
  return indexer;
}

/** Build a label map: platform ID → human-readable name */
function buildLabels(ids: string[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const id of ids) {
    const p = resolvePlatform(id);
    labels[id] = p?.name ?? id;
  }
  return labels;
}

// -- Parallel execution with Display --

interface ParallelResult {
  id: string;
  ok: boolean;
  error?: string;
  count?: number;
}

/**
 * Run a task for each platform ID concurrently with a Display.
 */
async function runParallel(
  ids: string[],
  taskFn: (id: string, display: Display) => Promise<ParallelResult>,
  header: string,
  concurrency = 8,
): Promise<void> {
  const display = new Display({
    header,
    concurrency,
    ids,
    labels: buildLabels(ids),
  });
  display.start();

  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < ids.length) {
      const i = idx++;
      const id = ids[i];
      display.startTask(id);
      const result = await taskFn(id, display);
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

interface RunOneOpts {
  display?: Display;
  download?: boolean;
}

/**
 * Run a single platform sync/update, wiring indexer.onProgress to the display.
 * When download=true, downloads ALL version tarballs for each package.
 * If enumerate didn't provide version list, calls fetchPackage() to get it.
 */
async function runOne(
  mode: 'registry-sync' | 'registry-update' | 'vcs-sync',
  platformId: string,
  opts: RunOneOpts = {},
): Promise<ParallelResult> {
  const { display, download } = opts;
  try {
    if (mode === 'registry-sync' || mode === 'registry-update') {
      const adapter = await getRegistryAdapter(platformId);
      if (!adapter) return { id: platformId, ok: false, error: 'No adapter found' };
      const indexer = await createIndexer(platformId);
      if (display) {
        indexer.onProgress = (count, current) => display.updateProgress(platformId, count, current);
      }
      const isIncremental = mode === 'registry-update';
      let count = 0;
      const gen = isIncremental
        ? adapter.enumerateIncremental(indexer)
        : adapter.enumerate(indexer);
      for await (const entry of gen) {
        count++;
        if (download) {
          await downloadAllVersions(adapter, indexer, entry);
        }
      }
      return { id: platformId, ok: true, count };
    } else {
      const adapter = await getVCSAdapter(platformId);
      if (!adapter) return { id: platformId, ok: false, error: 'No adapter found' };
      const indexer = await createIndexer(platformId);
      if (display) {
        indexer.onProgress = (count, current) => display.updateProgress(platformId, count, current);
      }
      await indexer.setPhase('full');
      indexer.startAutoCheckpoint();
      let count = 0;
      for await (const entry of adapter.enumerate(indexer)) {
        count++;
        if (download) {
          // Clone the repo + fetch releases
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
      return { id: platformId, ok: true, count };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { id: platformId, ok: false, error: msg };
  }
}

/**
 * Download ALL versions for a package entry.
 * If entry.versions is available, downloads each one.
 * If only entry.version is set, calls fetchPackage() to get the full list.
 * If neither, skips downloads for this entry.
 */
async function downloadAllVersions(
  adapter: { downloadVersion: (indexer: Indexer, name: string, version: string, scope?: string) => Promise<void>; fetchPackage: (indexer: Indexer, name: string, scope?: string) => Promise<PackageEntry> },
  indexer: Indexer,
  entry: PackageEntry,
): Promise<void> {
  let versions = entry.versions;

  // If enumerate didn't provide a version list, try fetchPackage to get it
  if (!versions?.length) {
    if (entry.version) {
      // Try to get the full version list via fetchPackage
      try {
        const full = await adapter.fetchPackage(indexer, entry.name, entry.scope);
        versions = full.versions;
      } catch {
        // fetchPackage failed — fall back to the single known version
      }
    }
    // Still no versions list? Use the single version if available
    if (!versions?.length && entry.version) {
      versions = [entry.version];
    }
  }

  if (!versions?.length) return;

  for (const v of versions) {
    try {
      await adapter.downloadVersion(indexer, entry.name, v, entry.scope);
    } catch {
      // Download failure is non-fatal — metadata was already saved
    }
  }
}

// -- Commands --

async function cmdLanguageSync(platformId: string, dryRun = false, download = true): Promise<void> {
  const adapter = await getRegistryAdapter(platformId);
  if (!adapter) {
    console.error(`No adapter found for registry: ${platformId}`);
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Syncing ${adapter.platform.name}${download ? ' (with downloads)' : ''}...`);
  if (indexer.getCursor()) {
    console.log(`  Resuming from cursor: ${indexer.getCursor()}`);
  }

  let count = 0;
  let dlCount = 0;
  try {
    for await (const entry of adapter.enumerate(indexer)) {
      count++;
      if (dryRun) {
        console.log(`  [dry-run] ${entry.scope ? entry.scope + '/' : ''}${entry.name}`);
      }
      if (download && !dryRun) {
        await downloadAllVersions(adapter, indexer, entry);
        dlCount += entry.versions?.length ?? (entry.version ? 1 : 0);
      }
      if (count % 1000 === 0) {
        console.log(`  ${count} packages indexed, ${dlCount} versions downloaded...`);
      }
    }
    console.log(`Done. ${count} packages indexed, ${dlCount} versions downloaded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await indexer.setError(msg);
    console.error(`Error during sync: ${msg}`);
    process.exit(1);
  }
}

async function cmdLanguageSyncAll(concurrency = 8, download = true): Promise<void> {
  const ids = allRegistryAdapterIds();
  await runParallel(
    ids,
    (id, display) => runOne('registry-sync', id, { display, download }),
    `Syncing ${ids.length} registries (${concurrency} concurrent)`,
    concurrency,
  );
}

async function cmdLanguageUpdate(platformId: string, download = true): Promise<void> {
  const adapter = await getRegistryAdapter(platformId);
  if (!adapter) {
    console.error(`No adapter found for registry: ${platformId}`);
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Incremental update for ${adapter.platform.name}${download ? ' (with downloads)' : ''}...`);

  let count = 0;
  let dlCount = 0;
  try {
    for await (const entry of adapter.enumerateIncremental(indexer)) {
      count++;
      if (download) {
        await downloadAllVersions(adapter, indexer, entry);
        dlCount += entry.versions?.length ?? (entry.version ? 1 : 0);
      }
      if (count % 100 === 0) {
        console.log(`  ${count} packages updated, ${dlCount} versions downloaded...`);
      }
    }
    console.log(`Done. ${count} packages updated, ${dlCount} versions downloaded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await indexer.setError(msg);
    console.error(`Error during update: ${msg}`);
    process.exit(1);
  }
}

async function cmdLanguageUpdateAll(concurrency = 8, download = true): Promise<void> {
  const ids = allRegistryAdapterIds();
  await runParallel(
    ids,
    (id, display) => runOne('registry-update', id, { display, download }),
    `Updating ${ids.length} registries (${concurrency} concurrent)`,
    concurrency,
  );
}

async function cmdLanguageFetch(platformId: string, name: string, opts: { version?: string; scope?: string; allVersions?: boolean }): Promise<void> {
  const adapter = await getRegistryAdapter(platformId);
  if (!adapter) {
    console.error(`No adapter found for registry: ${platformId}`);
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Fetching ${opts.scope ? opts.scope + '/' : ''}${name} from ${adapter.platform.name}...`);

  try {
    const entry = await adapter.fetchPackage(indexer, name, opts.scope);
    console.log(`  Name: ${entry.name}`);
    if (entry.description) console.log(`  Description: ${entry.description}`);
    if (entry.versions) console.log(`  Versions: ${entry.versions.length}`);
    if (entry.license) console.log(`  License: ${entry.license}`);

    // Use canonical name/scope from the entry for downloads to ensure path consistency
    const dlName = entry.name;
    const dlScope = entry.scope ?? opts.scope;

    if (opts.allVersions && entry.versions?.length) {
      // Download every version
      console.log(`  Downloading all ${entry.versions.length} versions...`);
      let done = 0;
      for (const v of entry.versions) {
        try {
          await adapter.downloadVersion(indexer, dlName, v, dlScope);
          done++;
          if (done % 10 === 0) console.log(`    ${done}/${entry.versions.length}...`);
        } catch (err) {
          const dlMsg = err instanceof Error ? err.message : String(err);
          console.error(`    ${v}: ${dlMsg}`);
        }
      }
      console.log(`  Downloaded ${done}/${entry.versions.length} versions.`);
    } else {
      // Download specific version, or latest
      const dlVersion = opts.version ?? entry.version;
      if (dlVersion) {
        console.log(`  Downloading version ${dlVersion}...`);
        try {
          await adapter.downloadVersion(indexer, dlName, dlVersion, dlScope);
          console.log(`  Downloaded.`);
        } catch (err) {
          const dlMsg = err instanceof Error ? err.message : String(err);
          console.error(`  Download failed: ${dlMsg}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

async function cmdLanguageStatus(platformId?: string): Promise<void> {
  if (platformId) {
    const state = await loadState(STATE_ROOT, platformId);
    const platform = resolvePlatform(platformId);
    console.log(`${platform?.name ?? platformId}:`);
    console.log(`  Phase:      ${state.phase}`);
    console.log(`  Cursor:     ${state.cursor ?? '(none)'}`);
    console.log(`  Indexed:    ${state.totalIndexed}`);
    console.log(`  Last sync:  ${state.lastSync ?? 'never'}`);
    console.log(`  Last error: ${state.lastError ?? '(none)'}`);
    return;
  }

  // Show all registries
  console.log('Registry mirror status:\n');
  for (const p of allRegistries()) {
    const state = await loadState(STATE_ROOT, p.id);
    const status = state.lastSync ? `${state.totalIndexed} pkgs, last ${state.lastSync}` : 'not synced';
    console.log(`  ${p.name.padEnd(20)} ${status}`);
  }
}

async function cmdLanguagePlatforms(): Promise<void> {
  console.log('Language → Registry mapping:\n');
  const table = registryMappingTable();
  const maxLang = Math.max(...table.map(r => r.language.length), 10);
  const maxReg = Math.max(...table.map(r => r.registry.length), 10);

  console.log(`  ${'Language'.padEnd(maxLang)}  ${'Registry'.padEnd(maxReg)}  Platform ID`);
  console.log(`  ${'─'.repeat(maxLang)}  ${'─'.repeat(maxReg)}  ${'─'.repeat(15)}`);
  for (const row of table) {
    console.log(`  ${row.language.padEnd(maxLang)}  ${row.registry.padEnd(maxReg)}  ${row.platformId}`);
  }
}

async function cmdDatabaseSync(platformId: string, download = true): Promise<void> {
  const adapter = await getVCSAdapter(platformId);
  if (!adapter) {
    console.error(`No VCS adapter found for: ${platformId}`);
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Syncing ${adapter.platform.name} repositories${download ? ' (with cloning)' : ''}...`);
  if (indexer.getCursor()) {
    console.log(`  Resuming from cursor: ${indexer.getCursor()}`);
  }
  await indexer.setPhase('full');
  indexer.startAutoCheckpoint();

  let count = 0;
  let cloned = 0;
  try {
    for await (const entry of adapter.enumerate(indexer)) {
      count++;
      if (download) {
        try {
          await adapter.cloneRepo(indexer, entry.owner, entry.name);
          cloned++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Clone failed for ${entry.owner}/${entry.name}: ${msg}`);
        }
        try {
          await adapter.fetchReleases(indexer, entry.owner, entry.name);
        } catch {
          // Release fetch failure is non-fatal
        }
      }
      if (count % 100 === 0) {
        console.log(`  ${count} repos indexed, ${cloned} cloned...`);
      }
    }
    await indexer.finish();
    console.log(`Done. ${count} repos indexed, ${cloned} cloned.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await indexer.setError(msg);
    console.error(`Error during sync: ${msg}`);
    process.exit(1);
  }
}

async function cmdDatabaseClone(platformId: string, ownerRepo: string, releaseTag?: string): Promise<void> {
  const adapter = await getVCSAdapter(platformId);
  if (!adapter) {
    console.error(`No VCS adapter found for: ${platformId}`);
    process.exit(1);
  }
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) {
    console.error('Usage: database-clone <platform> <owner/repo>');
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Cloning ${owner}/${repo} from ${adapter.platform.name}...`);

  try {
    await adapter.cloneRepo(indexer, owner, repo);
    console.log('Clone complete.');

    if (releaseTag) {
      console.log(`Fetching release ${releaseTag}...`);
      await adapter.fetchRelease(indexer, owner, repo, releaseTag);
    } else {
      console.log('Fetching releases...');
      await adapter.fetchReleases(indexer, owner, repo);
    }
    console.log('Done.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

async function cmdDatabaseFetch(platformId: string, ownerRepo: string, releaseTag?: string): Promise<void> {
  const adapter = await getVCSAdapter(platformId);
  if (!adapter) {
    console.error(`No VCS adapter found for: ${platformId}`);
    process.exit(1);
  }
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) {
    console.error('Usage: database-fetch <platform> <owner/repo>');
    process.exit(1);
  }
  const indexer = await createIndexer(platformId);
  console.log(`Fetching metadata for ${owner}/${repo} from ${adapter.platform.name}...`);

  try {
    const entry = await adapter.fetchRepo(indexer, owner, repo);
    console.log(`  Name: ${entry.fullName}`);
    if (entry.description) console.log(`  Description: ${entry.description}`);
    if (entry.language) console.log(`  Language: ${entry.language}`);
    if (entry.stars !== undefined) console.log(`  Stars: ${entry.stars}`);

    if (releaseTag) {
      console.log(`Fetching release ${releaseTag}...`);
      await adapter.fetchRelease(indexer, owner, repo, releaseTag);
    }
    console.log('Done.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

async function cmdDatabaseStatus(platformId?: string): Promise<void> {
  if (platformId) {
    const state = await loadState(STATE_ROOT, platformId);
    const platform = resolvePlatform(platformId);
    console.log(`${platform?.name ?? platformId}:`);
    console.log(`  Phase:      ${state.phase}`);
    console.log(`  Cursor:     ${state.cursor ?? '(none)'}`);
    console.log(`  Indexed:    ${state.totalIndexed}`);
    console.log(`  Last sync:  ${state.lastSync ?? 'never'}`);
    console.log(`  Last error: ${state.lastError ?? '(none)'}`);
    return;
  }

  console.log('VCS mirror status:\n');
  for (const p of allVCS()) {
    const state = await loadState(STATE_ROOT, p.id);
    const status = state.lastSync ? `${state.totalIndexed} repos, last ${state.lastSync}` : 'not synced';
    console.log(`  ${p.name.padEnd(20)} ${status}`);
  }
}

async function cmdDatabaseSyncAll(concurrency = 8, download = true): Promise<void> {
  const ids = allVCSAdapterIds();
  await runParallel(
    ids,
    (id, display) => runOne('vcs-sync', id, { display, download }),
    `Syncing ${ids.length} VCS platforms (${concurrency} concurrent)`,
    concurrency,
  );
}

async function cmdMirrorAll(concurrency = 8, download = true): Promise<void> {
  const registryIds = allRegistryAdapterIds();
  const vcsIds = allVCSAdapterIds();
  const allIds = [
    ...registryIds.map(id => ({ id, mode: 'registry-sync' as const })),
    ...vcsIds.map(id => ({ id, mode: 'vcs-sync' as const })),
  ];
  const ids = allIds.map(x => x.id);
  const modeMap = new Map(allIds.map(x => [x.id, x.mode]));

  await runParallel(
    ids,
    (id, display) => runOne(modeMap.get(id)!, id, { display, download }),
    `Mirroring ${ids.length} platforms (${registryIds.length} registries + ${vcsIds.length} VCS, ${concurrency} concurrent)`,
    concurrency,
  );
}

async function cmdDaily(concurrency = 8, download = true): Promise<void> {
  const registryIds = allRegistryAdapterIds();
  const vcsIds = allVCSAdapterIds();
  const allIds = [
    ...registryIds.map(id => ({ id, mode: 'registry-update' as const })),
    ...vcsIds.map(id => ({ id, mode: 'vcs-sync' as const })),
  ];
  const ids = allIds.map(x => x.id);
  const modeMap = new Map(allIds.map(x => [x.id, x.mode]));

  await runParallel(
    ids,
    (id, display) => runOne(modeMap.get(id)!, id, { display, download }),
    `Daily incremental: ${registryIds.length} registries + ${vcsIds.length} VCS (${concurrency} concurrent)`,
    concurrency,
  );
}

// -- Argument parsing --

function parseArgs(args: string[]): { command: string; positional: string[]; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!command && !arg.startsWith('-')) {
      command = arg;
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[arg.slice(2)] = args[i + 1];
        i++;
      } else {
        flags[arg.slice(2)] = true;
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

// -- Main --

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { command, positional, flags } = parseArgs(args);
  const dryRun = flags['dry-run'] === true;
  const download = flags['no-download'] !== true;
  const concurrency = typeof flags['concurrency'] === 'string' ? parseInt(flags['concurrency'], 10) : 8;

  switch (command) {
    case 'language-sync':
      if (flags['all'] || positional[0] === 'all') {
        await cmdLanguageSyncAll(concurrency, download);
      } else {
        const id = positional[0];
        if (!id) { console.error('Usage: language-sync <platform-id|all>'); process.exit(1); }
        await cmdLanguageSync(id, dryRun, download);
      }
      break;

    case 'language-update':
      if (flags['all'] || positional[0] === 'all') {
        await cmdLanguageUpdateAll(concurrency, download);
      } else {
        const id = positional[0];
        if (!id) { console.error('Usage: language-update <platform-id|all>'); process.exit(1); }
        await cmdLanguageUpdate(id, download);
      }
      break;

    case 'language-fetch': {
      const id = positional[0];
      const name = positional[1];
      if (!id || !name) { console.error('Usage: language-fetch <platform-id> <package> [--version V] [--scope S] [--all-versions]'); process.exit(1); }
      await cmdLanguageFetch(id, name, {
        version: flags['version'] as string | undefined,
        scope: flags['scope'] as string | undefined,
        allVersions: flags['all-versions'] === true,
      });
      break;
    }

    case 'language-status':
      await cmdLanguageStatus(positional[0]);
      break;

    case 'language-platforms':
      await cmdLanguagePlatforms();
      break;

    case 'language-sync-all':
      await cmdLanguageSyncAll(concurrency, download);
      break;

    case 'database-sync':
      if (flags['all'] || positional[0] === 'all') {
        await cmdDatabaseSyncAll(concurrency, download);
      } else {
        const id = positional[0];
        if (!id) { console.error('Usage: database-sync <platform-id|all>'); process.exit(1); }
        await cmdDatabaseSync(id, download);
      }
      break;

    case 'database-update':
      if (flags['all'] || positional[0] === 'all') {
        await cmdDatabaseSyncAll(concurrency, download);
      } else {
        const id = positional[0];
        if (!id) { console.error('Usage: database-update <platform-id|all>'); process.exit(1); }
        await cmdDatabaseSync(id, download);
      }
      break;

    case 'database-clone': {
      const id = positional[0];
      const ownerRepo = positional[1];
      if (!id || !ownerRepo) { console.error('Usage: database-clone <platform-id> <owner/repo>'); process.exit(1); }
      await cmdDatabaseClone(id, ownerRepo, flags['release'] as string | undefined);
      break;
    }

    case 'database-fetch': {
      const id = positional[0];
      const ownerRepo = positional[1];
      if (!id || !ownerRepo) { console.error('Usage: database-fetch <platform-id> <owner/repo>'); process.exit(1); }
      await cmdDatabaseFetch(id, ownerRepo, flags['release'] as string | undefined);
      break;
    }

    case 'database-status':
      await cmdDatabaseStatus(positional[0]);
      break;

    case 'mirror-all':
      await cmdMirrorAll(concurrency, download);
      break;

    case 'daily':
      await cmdDaily(concurrency, download);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(`ether mirror CLI

Language registry commands:
  language-sync <platform-id> [--dry-run]  Full sync a registry
  language-sync all [--concurrency N]      Sync all registries in parallel
  language-update <platform-id>            Incremental update
  language-update all [--concurrency N]    Update all registries in parallel
  language-fetch <platform-id> <pkg> [--version V] [--scope S] [--all-versions]  Fetch package + download
  language-status [platform-id]            Show sync status
  language-platforms                       List language→registry mapping

VCS commands:
  database-sync <platform-id>              Sync VCS platform
  database-sync all [--concurrency N]      Sync all VCS in parallel
  database-update <platform-id>            Incremental update
  database-clone <platform-id> <owner/repo> [--release tag]  Clone repo (bare)
  database-fetch <platform-id> <owner/repo> [--release tag]  Fetch metadata only
  database-status [platform-id]            Show VCS status

Orchestration:
  mirror-all [--concurrency N]             Mirror EVERYTHING in parallel (default: 8)
  daily [--concurrency N]                  Daily incremental (all platforms, parallel)

Global flags:
  --concurrency N                          Max concurrent tasks (default: 8)
  --no-download                            Skip tarball/archive downloads (metadata only)
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
