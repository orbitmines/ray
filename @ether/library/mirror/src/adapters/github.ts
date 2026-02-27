import type { PlatformConfig, RepoEntry, ReleaseEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { VCS_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import { repoPath } from '../core/shard.js';
import { exists } from '../core/storage.js';
import type { VCSAdapter } from './adapter.js';
import { execSync } from 'node:child_process';
import path from 'node:path';

export const platform = VCS_PLATFORMS['GitHub'];

function authHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'];
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export class GitHubAdapter implements VCSAdapter {
  platform: PlatformConfig = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<RepoEntry> {
    if (!process.env['GITHUB_TOKEN']) {
      throw new Error('GitHub adapter requires GITHUB_TOKEN env var (rate limit is 60 req/hr without token). export GITHUB_TOKEN=ghp_...');
    }

    let since = 0;
    const cursor = indexer.getCursor();
    if (cursor !== null) since = Number(cursor);

    while (true) {
      const url = `https://api.github.com/repositories?since=${since}`;
      const repos = await fetchJson<Array<Record<string, unknown>>>(url, {
        headers: { Accept: 'application/vnd.github.v3+json', ...authHeaders() },
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      if (!repos.length) break;

      for (const repo of repos) {
        const owner = (repo['owner'] as Record<string, unknown>)?.['login'] as string;
        const name = repo['name'] as string;
        if (!owner || !name) continue;

        const entry: RepoEntry = {
          owner,
          name,
          fullName: `${owner}/${name}`,
          description: (repo['description'] as string) ?? undefined,
          url: repo['html_url'] as string,
          defaultBranch: (repo['default_branch'] as string) ?? undefined,
          language: (repo['language'] as string) ?? undefined,
          raw: repo,
        };

        await indexer.addRepo(entry, repo);
        yield entry;
      }

      since = repos[repos.length - 1]!['id'] as number;
      await indexer.checkpoint(since);
    }
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<RepoEntry> {
    // GitHub /repositories only supports since=<id>, so incremental = resume from cursor
    yield* this.enumerate(indexer);
  }

  async cloneRepo(indexer: Indexer, owner: string, repo: string): Promise<void> {
    const dir = repoPath(indexer.dataRoot, this.platform.id, owner, repo);
    const gitDir = path.join(dir, 'repo.git');

    const cloneUrl = `https://github.com/${owner}/${repo}.git`;

    if (await exists(gitDir)) {
      console.log(`  Updating bare clone ${owner}/${repo}...`);
      execSync(`git -C "${gitDir}" fetch --all --prune`, { stdio: 'inherit' });
    } else {
      console.log(`  Bare cloning ${owner}/${repo}...`);
      execSync(`git clone --bare "${cloneUrl}" "${gitDir}"`, { stdio: 'inherit' });
    }

    // Fetch and save repo metadata
    await this.fetchRepo(indexer, owner, repo);
  }

  async fetchRepo(indexer: Indexer, owner: string, repo: string): Promise<RepoEntry> {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const raw = await fetchJson<Record<string, unknown>>(url, {
      headers: { Accept: 'application/vnd.github.v3+json', ...authHeaders() },
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const entry: RepoEntry = {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      description: (raw['description'] as string) ?? undefined,
      url: raw['html_url'] as string,
      defaultBranch: (raw['default_branch'] as string) ?? undefined,
      stars: raw['stargazers_count'] as number | undefined,
      language: (raw['language'] as string) ?? undefined,
      updatedAt: (raw['updated_at'] as string) ?? undefined,
      raw,
    };

    await indexer.addRepo(entry, raw);
    return entry;
  }

  async fetchReleases(indexer: Indexer, owner: string, repo: string): Promise<void> {
    let page = 1;
    while (true) {
      const url = `https://api.github.com/repos/${owner}/${repo}/releases?page=${page}&per_page=100`;
      const releases = await fetchJson<Array<Record<string, unknown>>>(url, {
        headers: { Accept: 'application/vnd.github.v3+json', ...authHeaders() },
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      if (!releases.length) break;

      for (const rel of releases) {
        const tag = rel['tag_name'] as string;
        if (!tag) continue;

        const assets = (rel['assets'] as Array<Record<string, unknown>> ?? []).map(a => ({
          name: a['name'] as string,
          url: a['browser_download_url'] as string,
          size: a['size'] as number | undefined,
        }));

        const release: ReleaseEntry = {
          tag,
          name: (rel['name'] as string) ?? undefined,
          body: (rel['body'] as string) ?? undefined,
          publishedAt: (rel['published_at'] as string) ?? undefined,
          assets,
          raw: rel,
        };

        await indexer.addRelease(owner, repo, release);

        // Download release assets
        for (const asset of assets) {
          if (asset.url && asset.name) {
            try {
              await indexer.downloadReleaseAsset(asset.url, owner, repo, tag, asset.name);
            } catch (err) {
              console.error(`  Failed to download asset ${asset.name}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
      }

      page++;
    }
  }

  async fetchRelease(indexer: Indexer, owner: string, repo: string, tag: string): Promise<void> {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
    const rel = await fetchJson<Record<string, unknown>>(url, {
      headers: { Accept: 'application/vnd.github.v3+json', ...authHeaders() },
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const assets = (rel['assets'] as Array<Record<string, unknown>> ?? []).map(a => ({
      name: a['name'] as string,
      url: a['browser_download_url'] as string,
      size: a['size'] as number | undefined,
    }));

    const release: ReleaseEntry = {
      tag,
      name: (rel['name'] as string) ?? undefined,
      body: (rel['body'] as string) ?? undefined,
      publishedAt: (rel['published_at'] as string) ?? undefined,
      assets,
      raw: rel,
    };

    await indexer.addRelease(owner, repo, release);

    for (const asset of assets) {
      if (asset.url && asset.name) {
        try {
          await indexer.downloadReleaseAsset(asset.url, owner, repo, tag, asset.name);
        } catch (err) {
          console.error(`  Failed to download asset ${asset.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
}
