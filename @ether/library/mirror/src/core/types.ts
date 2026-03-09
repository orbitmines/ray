export interface PlatformConfig {
  id: string;
  name: string;
  kind: 'registry' | 'vcs';
  baseUrl: string;
  rateLimit?: { requests: number; windowMs: number };
}

export interface PackageEntry {
  name: string;
  scope?: string;           // e.g. "@angular" for npm scoped packages
  version?: string;
  versions?: string[];
  description?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  downloads?: number;
  updatedAt?: string;
  raw?: unknown;            // raw API response fragment
}

export interface RepoEntry {
  owner: string;
  name: string;
  fullName: string;         // "owner/name"
  description?: string;
  url: string;
  defaultBranch?: string;
  stars?: number;
  language?: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface ReleaseEntry {
  tag: string;
  name?: string;
  body?: string;
  publishedAt?: string;
  assets?: { name: string; url: string; size?: number }[];
  raw?: unknown;
}

export interface SyncState {
  platform: string;
  cursor: string | number | null;
  lastSync: string | null;
  phase: 'idle' | 'full' | 'incremental';
  totalIndexed: number;
  lastError: string | null;
}

export interface DatabaseIndex {
  platform: string;
  kind: 'registry' | 'vcs';
  totalPackages: number;
  lastSync: string | null;
  cursor: string | number | null;
}
