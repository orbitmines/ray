// ============================================================
// API.ts — Centralized data access facade
// ============================================================
// All consumers import from here instead of DummyData.ts directly.
//
// Every data access wrapper is async and routes through getAPI(),
// which auto-detects the backend (Dummy, Tauri, or Http).

// ---- A) Type re-exports ----
export type { FileEntry, CompoundEntry, TreeEntry, Repository } from './DummyData.ts';
export type { PullRequest, PRStatus, FileDiff, PRCommit, PRComment, ActivityItem, InlinePR, CategoryPRSummary } from './DummyData.ts';

// ---- B) Pure utility re-exports (never become API calls) ----
export { isCompound, flattenEntries, resolveDirectory, resolveFile, resolveFiles } from './DummyData.ts';

// ---- C) EtherAPI — the async data access layer ----
export { getAPI, setAPI } from './EtherAPI.ts';
export type { EtherAPI } from './EtherAPI.ts';

// ---- D) Async data access wrappers (route through getAPI()) ----

import { getAPI } from './EtherAPI.ts';
import type { Repository, InlinePR, CategoryPRSummary, PullRequest } from './DummyData.ts';

export async function getRepository(user: string): Promise<Repository | null> {
  return getAPI().getRepository(user);
}

export async function getWorld(user: string, world: string): Promise<Repository | null> {
  return getAPI().getWorld(user, world);
}

export async function getReferencedUsers(user: string, world?: string | null): Promise<string[]> {
  const users = await getAPI().getReferencedUsers(user, world);
  // At the top level (no world context), always include @ether so /@ether is navigable
  if (!world && !users.includes('ether')) users.push('ether');
  return users;
}

export async function getReferencedWorlds(user: string, world?: string | null): Promise<string[]> {
  return getAPI().getReferencedWorlds(user, world);
}

export async function getOpenPRCount(canonicalPath: string): Promise<number> {
  return getAPI().getOpenPRCount(canonicalPath);
}

export async function getInlinePullRequests(canonicalPath: string): Promise<InlinePR[]> {
  return getAPI().getInlinePullRequests(canonicalPath);
}

export async function getCategoryPRSummary(path: string, prefix: '~' | '@'): Promise<CategoryPRSummary | null> {
  return getAPI().getCategoryPRSummary(path, prefix);
}

export async function getCategoryPullRequests(path: string, prefix: '~' | '@'): Promise<InlinePR[]> {
  return getAPI().getCategoryPullRequests(path, prefix);
}

export async function getPullRequest(path: string, id: number): Promise<PullRequest | null> {
  return getAPI().getPullRequest(path, id);
}

export async function createPullRequest(
  canonicalPath: string,
  title: string,
  description: string,
  sourceLabel: string,
  targetLabel: string,
  author?: string,
): Promise<PullRequest> {
  return getAPI().createPullRequest(canonicalPath, title, description, sourceLabel, targetLabel, author || getCurrentPlayer());
}

// ---- E) LocalStorage state ----

// -- Player identity --

export function getCurrentPlayer(): string {
  return localStorage.getItem('ether:name') || 'anonymous';
}

export function getDefaultUser(): string {
  return getCurrentPlayer();
}

// -- Stars --

const STARS_KEY = 'ether:stars';

function setStars(stars: string[]): void {
  localStorage.setItem(STARS_KEY, stars.join('\n'));
}

export function getStars(): string[] {
  const raw = localStorage.getItem(STARS_KEY);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

export function getStarCount(canonicalPath: string): number {
  const raw = localStorage.getItem(`ether:star-count:${canonicalPath}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function setStarCount(canonicalPath: string, count: number): void {
  localStorage.setItem(`ether:star-count:${canonicalPath}`, String(Math.max(0, count)));
}

export function isStarred(canonicalPath: string): boolean {
  const stars = getStars();
  if (stars.includes(canonicalPath)) return true;
  // Parent match — but NOT for worlds (#), players (@), or top-level libraries
  const parts = canonicalPath.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const parent = parts.slice(0, i).join('/');
    const child = parts[i];
    // Stop cascade at world/player/top-level-library boundaries
    if (child.startsWith('@') || child.startsWith('#') || child.startsWith('~')) break;
    // First real directory after @user or @user/#world = top-level library, needs own star
    if (i === 1 || parts[i - 1].startsWith('@') || parts[i - 1].startsWith('#') || parts[i - 1].startsWith('~')) break;
    if (stars.includes(parent)) return true;
  }
  return false;
}

export function toggleStar(canonicalPath: string): boolean {
  const stars = getStars();
  const idx = stars.indexOf(canonicalPath);
  if (idx >= 0) {
    stars.splice(idx, 1);
    setStars(stars);
    return false;
  } else {
    stars.push(canonicalPath);
    setStars(stars);
    return true;
  }
}

// -- Follows --

export function getFollowerCount(user: string): number {
  const raw = localStorage.getItem(`ether:follower-count:${user}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function setFollowerCount(user: string, count: number): void {
  localStorage.setItem(`ether:follower-count:${user}`, String(Math.max(0, count)));
}

export function isFollowing(user: string): boolean {
  const raw = localStorage.getItem('ether:following');
  const list = raw ? raw.split('\n').filter(Boolean) : [];
  return list.includes(user);
}

export function toggleFollow(user: string): boolean {
  const raw = localStorage.getItem('ether:following');
  const list = raw ? raw.split('\n').filter(Boolean) : [];
  const idx = list.indexOf(user);
  if (idx >= 0) {
    list.splice(idx, 1);
    localStorage.setItem('ether:following', list.join('\n'));
    return false;
  } else {
    list.push(user);
    localStorage.setItem('ether:following', list.join('\n'));
    return true;
  }
}

// -- Forks --

export function getForkCount(canonicalPath: string): number {
  const raw = localStorage.getItem(`ether:fork-count:${canonicalPath}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function setForkCount(canonicalPath: string, count: number): void {
  localStorage.setItem(`ether:fork-count:${canonicalPath}`, String(Math.max(0, count)));
}

// -- Sessions --

function sessionKey(user: string): string {
  return `ether:session:${user}`;
}

export function loadSession(user: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(sessionKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveSession(user: string, data: Record<string, any>): void {
  localStorage.setItem(sessionKey(user), JSON.stringify(data, null, 2));
}

export function getSessionContent(user: string): string {
  const session = loadSession(user);
  return JSON.stringify(session, null, 2);
}
