// ============================================================
// HttpBackend.ts — HTTP backend for web + self-hosted servers
// ============================================================
// Uses the /**/ URL convention to access the Ether/ filesystem.
// - /**/path/to/dir  → JSON directory listing
// - /**/path/to/file → raw file content

import type { EtherAPI } from '../EtherAPI.ts';
import type {
  FileEntry, Repository, PullRequest, InlinePR, CategoryPRSummary,
} from '../DummyData.ts';

export class HttpBackend implements EtherAPI {
  constructor(private baseUrl: string) {}

  /** Encode a logical path for use in a fetch URL, encoding each segment individually. */
  private encodePath(path: string): string {
    if (!path) return '';
    return path.split('/').map(s => encodeURIComponent(s)).join('/');
  }

  async listDirectory(path: string): Promise<FileEntry[]> {
    const url = `${this.baseUrl}/**/${this.encodePath(path)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const entries: { name: string; isDirectory: boolean; size?: number }[] = await resp.json();
      return entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory,
        modified: '',
      }));
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<string | null> {
    const url = `${this.baseUrl}/**/${this.encodePath(path)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      return null;
    }
  }

  async getRepository(user: string): Promise<Repository | null> {
    let entries = await this.listDirectory(`@${user}`);
    // Fall back to root listing (.ether/) for the local player
    if (entries.length === 0) {
      entries = await this.listDirectory('');
    }
    if (entries.length === 0) return null;
    return {
      user,
      description: `@${user}`,
      tree: entries,
    };
  }

  async getWorld(user: string, world: string): Promise<Repository | null> {
    const entries = await this.listDirectory(`@${user}/~${world}`);
    if (entries.length === 0) return null;
    return {
      user: world,
      description: `#${world}`,
      tree: entries,
    };
  }

  async getReferencedUsers(_user: string, _world?: string | null): Promise<string[]> {
    // TODO: fetch from a metadata endpoint or scan directory
    return [];
  }

  async getReferencedWorlds(_user: string, _world?: string | null): Promise<string[]> {
    // TODO: fetch from a metadata endpoint or scan directory
    return [];
  }

  async getPullRequests(_canonicalPath: string): Promise<PullRequest[]> {
    // TODO: fetch from API endpoint
    return [];
  }

  async getPullRequest(_canonicalPath: string, _prId: number): Promise<PullRequest | null> {
    // TODO: fetch from API endpoint
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
    throw new Error('createPullRequest not yet implemented for HttpBackend');
  }
}
