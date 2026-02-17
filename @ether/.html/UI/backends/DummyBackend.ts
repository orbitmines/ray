// ============================================================
// DummyBackend.ts — Wraps existing DummyData.ts in EtherAPI interface
// ============================================================
// Zero behavior change — everything keeps working with hardcoded mock data.

import type { EtherAPI } from '../EtherAPI.ts';
import type {
  FileEntry, Repository, PullRequest, InlinePR, CategoryPRSummary,
} from '../DummyData.ts';
import {
  getRepository as _getRepository,
  getWorld as _getWorld,
  getReferencedUsers as _getReferencedUsers,
  getReferencedWorlds as _getReferencedWorlds,
  getPullRequests as _getPullRequests,
  getPullRequest as _getPullRequest,
  getInlinePullRequests as _getInlinePullRequests,
  getOpenPRCount as _getOpenPRCount,
  getCategoryPRSummary as _getCategoryPRSummary,
  getCategoryPullRequests as _getCategoryPullRequests,
  createPullRequest as _createPullRequest,
} from '../DummyData.ts';

export class DummyBackend implements EtherAPI {
  async listDirectory(_path: string): Promise<FileEntry[]> {
    // DummyData doesn't have a flat directory listing — return empty
    return [];
  }

  async readFile(_path: string): Promise<string | null> {
    return null;
  }

  async getRepository(user: string): Promise<Repository | null> {
    return _getRepository(user);
  }

  async getWorld(user: string, world: string): Promise<Repository | null> {
    return _getWorld(user, world);
  }

  async getReferencedUsers(user: string, world?: string | null): Promise<string[]> {
    return _getReferencedUsers(user, world);
  }

  async getReferencedWorlds(user: string, world?: string | null): Promise<string[]> {
    return _getReferencedWorlds(user, world);
  }

  async getPullRequests(canonicalPath: string): Promise<PullRequest[]> {
    return _getPullRequests(canonicalPath);
  }

  async getPullRequest(canonicalPath: string, prId: number): Promise<PullRequest | null> {
    return _getPullRequest(canonicalPath, prId);
  }

  async getInlinePullRequests(canonicalPath: string): Promise<InlinePR[]> {
    return _getInlinePullRequests(canonicalPath);
  }

  async getOpenPRCount(canonicalPath: string): Promise<number> {
    return _getOpenPRCount(canonicalPath);
  }

  async getCategoryPRSummary(canonicalPath: string, categoryPrefix: '~' | '@'): Promise<CategoryPRSummary | null> {
    return _getCategoryPRSummary(canonicalPath, categoryPrefix);
  }

  async getCategoryPullRequests(canonicalPath: string, categoryPrefix: '~' | '@'): Promise<InlinePR[]> {
    return _getCategoryPullRequests(canonicalPath, categoryPrefix);
  }

  async createPullRequest(
    canonicalPath: string,
    title: string,
    description: string,
    sourceLabel: string,
    targetLabel: string,
    author?: string,
  ): Promise<PullRequest> {
    return _createPullRequest(canonicalPath, title, description, sourceLabel, targetLabel, author);
  }
}
