// ============================================================
// EtherAPI.ts — Unified data access layer interface
// ============================================================
// Backends: DummyBackend (dev), TauriBackend (desktop/mobile), HttpBackend (web/self-hosted)

import type {
  FileEntry, Repository,
  PullRequest, InlinePR, CategoryPRSummary,
} from './DummyData.ts';

// Re-export types for consumers
export type {
  FileEntry, CompoundEntry, TreeEntry, Repository,
  PullRequest, PRStatus, FileDiff, PRCommit, PRComment,
  ActivityItem, InlinePR, CategoryPRSummary,
} from './DummyData.ts';

// ---- Interface ----

export interface EtherAPI {
  // Directory browsing
  listDirectory(path: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string | null>;

  // Repository-level access
  getRepository(user: string): Promise<Repository | null>;
  getWorld(user: string, world: string): Promise<Repository | null>;
  getReferencedUsers(user: string, world?: string | null): Promise<string[]>;
  getReferencedWorlds(user: string, world?: string | null): Promise<string[]>;

  // Pull requests
  getPullRequests(canonicalPath: string): Promise<PullRequest[]>;
  getPullRequest(canonicalPath: string, prId: number): Promise<PullRequest | null>;
  getInlinePullRequests(canonicalPath: string): Promise<InlinePR[]>;
  getOpenPRCount(canonicalPath: string): Promise<number>;
  getCategoryPRSummary(canonicalPath: string, categoryPrefix: '~' | '@'): Promise<CategoryPRSummary | null>;
  getCategoryPullRequests(canonicalPath: string, categoryPrefix: '~' | '@'): Promise<InlinePR[]>;
  createPullRequest(
    canonicalPath: string,
    title: string,
    description: string,
    sourceLabel: string,
    targetLabel: string,
    author?: string,
  ): Promise<PullRequest>;
}

// ---- Singleton + auto-detection ----

import { DummyBackend } from './backends/DummyBackend.ts';
import { TauriBackend } from './backends/TauriBackend.ts';
import { HttpBackend } from './backends/HttpBackend.ts';

let _api: EtherAPI | null = null;

export function getAPI(): EtherAPI {
  if (!_api) _api = detectBackend();
  return _api;
}

export function setAPI(api: EtherAPI): void {
  _api = api;
}

function detectBackend(): EtherAPI {
  // ?dummy query param forces DummyBackend (for testing mock data)
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dummy')) {
    return new DummyBackend();
  }

  // Tauri injects __TAURI_INTERNALS__ on the window object
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return new TauriBackend();
  }

  // HTTP backend — works for both production and dev (Vite middleware serves /**/)
  if (typeof location !== 'undefined') {
    return new HttpBackend(location.origin);
  }

  return new DummyBackend();
}
