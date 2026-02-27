import fs from 'node:fs/promises';
import path from 'node:path';
import type { PackageEntry, RepoEntry, ReleaseEntry, SyncState, DatabaseIndex } from './types.js';
import { loadState, saveState } from './state.js';
import { savePackageMeta, saveApiResponse, saveVersionMeta, versionTarballPath, saveRepoMeta, saveRepoApiResponse, saveReleaseMeta, releaseAssetPath } from './storage.js';
import { downloadFile } from './http.js';
import type { HttpOptions } from './http.js';

/**
 * THE shared module all adapters use.
 * Handles state persistence, file storage, and progress tracking.
 */
export class Indexer {
  readonly platform: string;
  readonly dataRoot: string;
  readonly databaseRoot: string;
  readonly stateRoot: string;
  private state: SyncState;
  private dirty = false;
  private checkpointInterval: ReturnType<typeof setInterval> | null = null;
  httpOpts: HttpOptions = {};
  onProgress: ((count: number, current: string) => void) | null = null;

  private constructor(
    platform: string,
    dataRoot: string,
    databaseRoot: string,
    stateRoot: string,
    state: SyncState
  ) {
    this.platform = platform;
    this.dataRoot = dataRoot;
    this.databaseRoot = databaseRoot;
    this.stateRoot = stateRoot;
    this.state = state;
  }

  static async create(platform: string, dataRoot: string, databaseRoot: string, stateRoot: string): Promise<Indexer> {
    const state = await loadState(stateRoot, platform);
    return new Indexer(platform, dataRoot, databaseRoot, stateRoot, state);
  }

  getState(): SyncState {
    return { ...this.state };
  }

  getCursor(): string | number | null {
    return this.state.cursor;
  }

  // -- Package operations --

  async addPackage(entry: PackageEntry, rawApiResponse?: unknown): Promise<void> {
    await savePackageMeta(this.dataRoot, this.platform, entry, entry.scope);
    if (rawApiResponse !== undefined) {
      await saveApiResponse(this.dataRoot, this.platform, entry.name, rawApiResponse, entry.scope);
    }
    this.state.totalIndexed++;
    this.dirty = true;
    this.onProgress?.(this.state.totalIndexed, entry.scope ? `${entry.scope}/${entry.name}` : entry.name);
  }

  async addVersion(pkg: string, version: string, meta: unknown, scope?: string): Promise<void> {
    await saveVersionMeta(this.dataRoot, this.platform, pkg, version, meta, scope);
  }

  async downloadVersion(
    url: string, pkg: string, version: string, filename: string, scope?: string
  ): Promise<number> {
    const dest = versionTarballPath(this.dataRoot, this.platform, pkg, version, filename, scope);
    return downloadFile(url, dest, this.httpOpts);
  }

  // -- Repo operations --

  async addRepo(entry: RepoEntry, rawApiResponse?: unknown): Promise<void> {
    await saveRepoMeta(this.dataRoot, this.platform, entry.owner, entry.name, entry);
    if (rawApiResponse !== undefined) {
      await saveRepoApiResponse(this.dataRoot, this.platform, entry.owner, entry.name, rawApiResponse);
    }
    this.state.totalIndexed++;
    this.dirty = true;
    this.onProgress?.(this.state.totalIndexed, `${entry.owner}/${entry.name}`);
  }

  async addRelease(owner: string, repo: string, release: ReleaseEntry): Promise<void> {
    await saveReleaseMeta(this.dataRoot, this.platform, owner, repo, release);
  }

  async downloadReleaseAsset(
    url: string, owner: string, repo: string, tag: string, filename: string
  ): Promise<number> {
    const dest = releaseAssetPath(this.dataRoot, this.platform, owner, repo, tag, filename);
    return downloadFile(url, dest, this.httpOpts);
  }

  // -- State management --

  async checkpoint(cursor: string | number): Promise<void> {
    this.state.cursor = cursor;
    this.state.lastSync = new Date().toISOString();
    this.dirty = false;
    await saveState(this.stateRoot, this.platform, this.state);
  }

  async setPhase(phase: SyncState['phase']): Promise<void> {
    this.state.phase = phase;
    await saveState(this.stateRoot, this.platform, this.state);
  }

  async setError(error: string | null): Promise<void> {
    this.state.lastError = error;
    await saveState(this.stateRoot, this.platform, this.state);
  }

  async finish(): Promise<void> {
    this.state.phase = 'idle';
    this.state.lastSync = new Date().toISOString();
    this.state.lastError = null;
    await saveState(this.stateRoot, this.platform, this.state);
    await this.writeDatabaseIndex();
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
  }

  /**
   * Start periodic auto-checkpointing (every N seconds).
   */
  startAutoCheckpoint(intervalMs = 30_000): void {
    if (this.checkpointInterval) return;
    this.checkpointInterval = setInterval(async () => {
      if (this.dirty && this.state.cursor !== null) {
        await saveState(this.stateRoot, this.platform, this.state);
        this.dirty = false;
      }
    }, intervalMs);
  }

  /**
   * Write the Database/<platform>/index.json summary.
   */
  async writeDatabaseIndex(): Promise<void> {
    const indexDir = path.join(this.databaseRoot, this.platform);
    await fs.mkdir(indexDir, { recursive: true });
    const index: DatabaseIndex = {
      platform: this.platform,
      kind: 'registry', // overridden by VCS adapters
      totalPackages: this.state.totalIndexed,
      lastSync: this.state.lastSync,
      cursor: this.state.cursor,
    };
    await fs.writeFile(path.join(indexDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  }
}
