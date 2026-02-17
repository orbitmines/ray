// ============================================================
// TauriBackend.ts — Tauri IPC backend (desktop + mobile)
// ============================================================
// Calls Rust commands via window.__TAURI_INTERNALS__.invoke().
// No @tauri-apps/api dependency needed.

import type { EtherAPI } from '../EtherAPI.ts';
import type {
  FileEntry, Repository, PullRequest, InlinePR, CategoryPRSummary,
} from '../DummyData.ts';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
    };
  }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI_INTERNALS__;
  if (!tauri) return Promise.reject(new Error('Tauri IPC not available'));
  return tauri.invoke<T>(cmd, args);
}

interface DirEntry {
  name: string;
  is_directory: boolean;
  size: number | null;
}

export class TauriBackend implements EtherAPI {
  async listDirectory(path: string): Promise<FileEntry[]> {
    const entries = await invoke<DirEntry[]>('list_directory', { path });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.is_directory,
      modified: '',
    }));
  }

  async readFile(path: string): Promise<string | null> {
    try {
      return await invoke<string>('read_file', { path });
    } catch {
      return null;
    }
  }

  async getRepository(user: string): Promise<Repository | null> {
    const exists = await invoke<boolean>('file_exists', { path: '' });
    if (!exists) return null;
    const entries = await this.listDirectory('');
    return {
      user,
      description: `@${user}`,
      tree: entries,
    };
  }

  async getWorld(user: string, world: string): Promise<Repository | null> {
    // Worlds are stored as directories — check if the path exists
    const worldPath = `~${world}`;
    const exists = await invoke<boolean>('file_exists', { path: worldPath });
    if (!exists) return null;
    const entries = await this.listDirectory(worldPath);
    return {
      user: world,
      description: `#${world}`,
      tree: entries,
    };
  }

  async getReferencedUsers(_user: string, _world?: string | null): Promise<string[]> {
    // TODO: scan filesystem for @-prefixed directories or metadata
    return [];
  }

  async getReferencedWorlds(_user: string, _world?: string | null): Promise<string[]> {
    // TODO: scan filesystem for ~-prefixed directories or metadata
    return [];
  }

  async getPullRequests(_canonicalPath: string): Promise<PullRequest[]> {
    // TODO: read from .ether/%/pull-requests/ directory
    return [];
  }

  async getPullRequest(_canonicalPath: string, _prId: number): Promise<PullRequest | null> {
    // TODO: read specific PR file from .ether/%/pull-requests/{id}.ray
    return null;
  }

  async getInlinePullRequests(_canonicalPath: string): Promise<InlinePR[]> {
    return [];
  }

  async getOpenPRCount(_canonicalPath: string): Promise<number> {
    return 0;
  }

  async getCategoryPRSummary(_canonicalPath: string, _categoryPrefix: '~' | '@'): Promise<CategoryPRSummary | null> {
    return null;
  }

  async getCategoryPullRequests(_canonicalPath: string, _categoryPrefix: '~' | '@'): Promise<InlinePR[]> {
    return [];
  }

  async createPullRequest(
    _canonicalPath: string,
    _title: string,
    _description: string,
    _sourceLabel: string,
    _targetLabel: string,
    _author?: string,
  ): Promise<PullRequest> {
    throw new Error('createPullRequest not yet implemented for TauriBackend');
  }
}
