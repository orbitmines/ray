import type { PlatformConfig, RepoEntry, ReleaseEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { VCS_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import { repoPath } from '../core/shard.js';
import { exists } from '../core/storage.js';
import type { VCSAdapter } from './adapter.js';
import { execSync } from 'node:child_process';
import path from 'node:path';

export const platform = VCS_PLATFORMS['Bitbucket'];

function authHeaders(): Record<string, string> {
  const user = process.env['BITBUCKET_USER'];
  const pass = process.env['BITBUCKET_APP_PASSWORD'];
  if (user && pass) {
    return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
  }
  return {};
}

export class BitbucketAdapter implements VCSAdapter {
  platform: PlatformConfig = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<RepoEntry> {
    // Bitbucket uses next URL pagination
    let url: string | null = 'https://api.bitbucket.org/2.0/repositories?pagelen=100&fields=next,values.full_name,values.name,values.description,values.links.html.href,values.mainbranch.name,values.language,values.updated_on,values.owner.display_name';
    const cursor = indexer.getCursor();
    if (cursor !== null && typeof cursor === 'string' && cursor.startsWith('http')) {
      url = cursor;
    }

    let count = 0;
    while (url) {
      const data = await fetchJson<Record<string, unknown>>(url, {
        headers: authHeaders(),
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      const values = data['values'] as Array<Record<string, unknown>> ?? [];
      if (!values.length) break;

      for (const repo of values) {
        const fullName = repo['full_name'] as string;
        if (!fullName) continue;
        const [owner, name] = fullName.split('/');
        if (!owner || !name) continue;

        const entry: RepoEntry = {
          owner,
          name,
          fullName,
          description: (repo['description'] as string) ?? undefined,
          url: (repo['links'] as Record<string, unknown>)?.['html'] as string ??
               ((repo['links'] as Record<string, unknown>)?.['html'] as Record<string, unknown>)?.['href'] as string ?? '',
          defaultBranch: (repo['mainbranch'] as Record<string, unknown>)?.['name'] as string ?? undefined,
          language: (repo['language'] as string) ?? undefined,
          updatedAt: (repo['updated_on'] as string) ?? undefined,
          raw: repo,
        };

        await indexer.addRepo(entry, repo);
        yield entry;
        count++;
      }

      const nextUrl = data['next'] as string | undefined;
      if (nextUrl) {
        url = nextUrl;
        await indexer.checkpoint(nextUrl);
      } else {
        url = null;
      }

      if (count % 1000 === 0) {
        console.log(`  ${count} Bitbucket repos enumerated...`);
      }
    }
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<RepoEntry> {
    // Bitbucket uses next URL; incremental = resume from cursor
    yield* this.enumerate(indexer);
  }

  async cloneRepo(indexer: Indexer, owner: string, repo: string): Promise<void> {
    const dir = repoPath(indexer.dataRoot, this.platform.id, owner, repo);
    const gitDir = path.join(dir, 'repo.git');
    const cloneUrl = `https://bitbucket.org/${owner}/${repo}.git`;

    if (await exists(gitDir)) {
      console.log(`  Updating bare clone ${owner}/${repo}...`);
      execSync(`git -C "${gitDir}" fetch --all --prune`, { stdio: 'inherit' });
    } else {
      console.log(`  Bare cloning ${owner}/${repo}...`);
      execSync(`git clone --bare "${cloneUrl}" "${gitDir}"`, { stdio: 'inherit' });
    }

    await this.fetchRepo(indexer, owner, repo);
  }

  async fetchRepo(indexer: Indexer, owner: string, repo: string): Promise<RepoEntry> {
    const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`;
    const raw = await fetchJson<Record<string, unknown>>(url, {
      headers: authHeaders(),
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const entry: RepoEntry = {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      description: (raw['description'] as string) ?? undefined,
      url: ((raw['links'] as Record<string, unknown>)?.['html'] as Record<string, unknown>)?.['href'] as string ?? '',
      defaultBranch: (raw['mainbranch'] as Record<string, unknown>)?.['name'] as string ?? undefined,
      language: (raw['language'] as string) ?? undefined,
      updatedAt: (raw['updated_on'] as string) ?? undefined,
      raw,
    };

    await indexer.addRepo(entry, raw);
    return entry;
  }

  async fetchReleases(indexer: Indexer, owner: string, repo: string): Promise<void> {
    // Bitbucket doesn't have "releases" like GitHub/GitLab, but has tags + downloads
    // Fetch tags
    let url: string | null = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/tags?pagelen=100`;

    while (url) {
      const tagData: Record<string, unknown> = await fetchJson<Record<string, unknown>>(url, {
        headers: authHeaders(),
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      const values = tagData['values'] as Array<Record<string, unknown>> ?? [];
      for (const tag of values) {
        const tagName = tag['name'] as string;
        if (!tagName) continue;

        const release: ReleaseEntry = {
          tag: tagName,
          name: tagName,
          publishedAt: (tag['date'] as string) ?? (tag['target'] as Record<string, unknown>)?.['date'] as string ?? undefined,
          raw: tag,
        };

        await indexer.addRelease(owner, repo, release);
      }

      url = tagData['next'] as string | null ?? null;
    }

    // Fetch downloads (if any)
    try {
      let dlUrl: string | null = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/downloads?pagelen=100`;
      while (dlUrl) {
        const dlData: Record<string, unknown> = await fetchJson<Record<string, unknown>>(dlUrl, {
          headers: authHeaders(),
          rateLimiter: indexer.httpOpts.rateLimiter,
        });

        const dlValues = dlData['values'] as Array<Record<string, unknown>> ?? [];
        for (const dl of dlValues) {
          const dlName = dl['name'] as string;
          const link = ((dl['links'] as Record<string, unknown>)?.['self'] as Record<string, unknown>)?.['href'] as string;
          if (dlName && link) {
            try {
              await indexer.downloadReleaseAsset(link, owner, repo, 'downloads', dlName);
            } catch (err) {
              console.error(`  Failed to download ${dlName}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }

        dlUrl = dlData['next'] as string | null ?? null;
      }
    } catch {
      // Downloads may not be enabled for this repo
    }
  }

  async fetchRelease(indexer: Indexer, owner: string, repo: string, tag: string): Promise<void> {
    const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/tags/${encodeURIComponent(tag)}`;
    const raw = await fetchJson<Record<string, unknown>>(url, {
      headers: authHeaders(),
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const release: ReleaseEntry = {
      tag,
      name: tag,
      publishedAt: (raw['date'] as string) ?? (raw['target'] as Record<string, unknown>)?.['date'] as string ?? undefined,
      raw,
    };

    await indexer.addRelease(owner, repo, release);
  }
}
