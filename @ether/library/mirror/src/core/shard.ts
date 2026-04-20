import path from 'node:path';

/**
 * Shard a name into a directory path.
 * Max 5 levels: first char with @ prefix, then groups of 2.
 *
 * "Alice"           → "@A/li/ce"
 * "torvalds"        → "@t/or/va/ld/s"
 * "AliceAliceAlice" → "@A/li/ce/Al/iceAlice"
 */
export function shardUser(name: string): string {
  if (!name) return '@_';
  const parts: string[] = [];
  parts.push('@' + name[0]);
  let rest = name.slice(1);
  for (let i = 0; i < 4 && rest.length > 0; i++) {
    parts.push(rest.slice(0, 2));
    rest = rest.slice(2);
  }
  if (rest.length > 0) {
    parts[parts.length - 1] += rest;
  }
  return parts.join('/');
}

/**
 * Shard a package/repo name (no @ prefix on first segment).
 *
 * "express"  → "e/xp/re/ss"
 * "requests" → "r/eq/ue/st/s"
 * "flask"    → "f/la/sk"
 */
export function shardName(name: string): string {
  if (!name) return '_';
  const parts: string[] = [];
  parts.push(name[0]);
  let rest = name.slice(1);
  for (let i = 0; i < 4 && rest.length > 0; i++) {
    parts.push(rest.slice(0, 2));
    rest = rest.slice(2);
  }
  if (rest.length > 0) {
    parts[parts.length - 1] += rest;
  }
  return parts.join('/');
}

/**
 * Get the storage path for a package.
 *
 * With scope (user exists): shard the scope, package name flat.
 *   .ether/@/@npm/@/@a/ng/ul/ar/core/
 *
 * Without scope (no user): shard the package name.
 *   .ether/@/@pypi/r/eq/ue/st/s/
 */
export function packagePath(dataRoot: string, platform: string, name: string, scope?: string): string {
  const platformDir = path.join(dataRoot, '@' + platform);
  if (scope) {
    const bareScope = scope.startsWith('@') ? scope.slice(1) : scope;
    return path.join(platformDir, '@', shardUser(bareScope), name);
  }
  return path.join(platformDir, shardName(name));
}

/**
 * Get the storage path for a VCS repo.
 * Shard the owner, repo name flat.
 *
 *   .ether/@/@GitHub/@/@t/or/va/ld/s/linux/
 */
export function repoPath(dataRoot: string, platform: string, owner: string, repo: string): string {
  const platformDir = path.join(dataRoot, '@' + platform);
  return path.join(platformDir, '@', shardUser(owner), repo);
}
