import fs from 'node:fs/promises';
import path from 'node:path';
import type { SyncState } from './types.js';

function statePath(stateRoot: string, platform: string): string {
  return path.join(stateRoot, `${platform}.json`);
}

export function defaultState(platform: string): SyncState {
  return {
    platform,
    cursor: null,
    lastSync: null,
    phase: 'idle',
    totalIndexed: 0,
    lastError: null,
  };
}

export async function loadState(stateRoot: string, platform: string): Promise<SyncState> {
  const p = statePath(stateRoot, platform);
  try {
    const data = await fs.readFile(p, 'utf-8');
    return JSON.parse(data) as SyncState;
  } catch {
    return defaultState(platform);
  }
}

export async function saveState(stateRoot: string, platform: string, state: SyncState): Promise<void> {
  const p = statePath(stateRoot, platform);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2) + '\n');
}

export async function resetState(stateRoot: string, platform: string): Promise<void> {
  await saveState(stateRoot, platform, defaultState(platform));
}
