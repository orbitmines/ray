import type { PlatformConfig, RepoEntry, ReleaseEntry } from '../core/types.js';
import type { Indexer } from '../core/indexer.js';
import { VCS_PLATFORMS } from '../core/registry-map.js';
import { fetchJson, httpGet } from '../core/http.js';
import { repoPath } from '../core/shard.js';
import { exists } from '../core/storage.js';
import type { VCSAdapter } from './adapter.js';
import { execSync } from 'node:child_process';
import path from 'node:path';

export const platform = VCS_PLATFORMS['GitLab'];

function authHeaders(): Record<string, string> {
  const token = process.env['GITLAB_TOKEN'];
  if (token) return { 'PRIVATE-TOKEN': token };
  return {};
}

export class GitLabAdapter implements VCSAdapter {
  platform: PlatformConfig = platform;

  async *enumerate(indexer: Indexer): AsyncGenerator<RepoEntry> {
    let idAfter = 0;
    const cursor = indexer.getCursor();
    if (cursor !== null) idAfter = Number(cursor);

    while (true) {
      const url = `https://gitlab.com/api/v4/projects?per_page=100&order_by=id&sort=asc&id_after=${idAfter}`;
      const projects = await fetchJson<Array<Record<string, unknown>>>(url, {
        headers: authHeaders(),
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      if (!projects.length) break;

      for (const proj of projects) {
        const pathWithNs = proj['path_with_namespace'] as string;
        if (!pathWithNs) continue;
        const parts = pathWithNs.split('/');
        const owner = parts.slice(0, -1).join('/');
        const name = parts[parts.length - 1]!;

        const entry: RepoEntry = {
          owner,
          name,
          fullName: pathWithNs,
          description: (proj['description'] as string) ?? undefined,
          url: proj['web_url'] as string,
          defaultBranch: (proj['default_branch'] as string) ?? undefined,
          stars: proj['star_count'] as number | undefined,
          updatedAt: (proj['last_activity_at'] as string) ?? undefined,
          raw: proj,
        };

        await indexer.addRepo(entry, proj);
        yield entry;
      }

      idAfter = projects[projects.length - 1]!['id'] as number;
      await indexer.checkpoint(idAfter);
    }
  }

  async *enumerateIncremental(indexer: Indexer): AsyncGenerator<RepoEntry> {
    // GitLab keyset pagination with id_after resumes naturally
    yield* this.enumerate(indexer);
  }

  async cloneRepo(indexer: Indexer, owner: string, repo: string): Promise<void> {
    const dir = repoPath(indexer.dataRoot, this.platform.id, owner, repo);
    const gitDir = path.join(dir, 'repo.git');
    const cloneUrl = `https://gitlab.com/${owner}/${repo}.git`;

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
    const encoded = encodeURIComponent(`${owner}/${repo}`);
    const url = `https://gitlab.com/api/v4/projects/${encoded}`;
    const raw = await fetchJson<Record<string, unknown>>(url, {
      headers: authHeaders(),
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const entry: RepoEntry = {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      description: (raw['description'] as string) ?? undefined,
      url: raw['web_url'] as string,
      defaultBranch: (raw['default_branch'] as string) ?? undefined,
      stars: raw['star_count'] as number | undefined,
      updatedAt: (raw['last_activity_at'] as string) ?? undefined,
      raw,
    };

    await indexer.addRepo(entry, raw);
    return entry;
  }

  async fetchReleases(indexer: Indexer, owner: string, repo: string): Promise<void> {
    const encoded = encodeURIComponent(`${owner}/${repo}`);
    let page = 1;

    while (true) {
      const url = `https://gitlab.com/api/v4/projects/${encoded}/releases?page=${page}&per_page=100`;
      const releases = await fetchJson<Array<Record<string, unknown>>>(url, {
        headers: authHeaders(),
        rateLimiter: indexer.httpOpts.rateLimiter,
      });

      if (!releases.length) break;

      for (const rel of releases) {
        const tag = rel['tag_name'] as string;
        if (!tag) continue;

        const links = (rel['assets'] as Record<string, unknown>)?.['links'] as Array<Record<string, unknown>> ?? [];
        const sources = (rel['assets'] as Record<string, unknown>)?.['sources'] as Array<Record<string, unknown>> ?? [];

        const assets = [
          ...links.map(l => ({
            name: l['name'] as string,
            url: l['direct_asset_url'] as string ?? l['url'] as string,
          })),
          ...sources.map(s => ({
            name: `source.${s['format'] as string}`,
            url: s['url'] as string,
          })),
        ];

        const release: ReleaseEntry = {
          tag,
          name: (rel['name'] as string) ?? undefined,
          body: (rel['description'] as string) ?? undefined,
          publishedAt: (rel['released_at'] as string) ?? undefined,
          assets,
          raw: rel,
        };

        await indexer.addRelease(owner, repo, release);

        for (const asset of assets) {
          if (asset.url && asset.name) {
            try {
              await indexer.downloadReleaseAsset(asset.url, owner, repo, tag, asset.name);
            } catch (err) {
              console.error(`  Failed to download ${asset.name}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
      }

      page++;
    }
  }

  async fetchRelease(indexer: Indexer, owner: string, repo: string, tag: string): Promise<void> {
    const encoded = encodeURIComponent(`${owner}/${repo}`);
    const url = `https://gitlab.com/api/v4/projects/${encoded}/releases/${encodeURIComponent(tag)}`;
    const rel = await fetchJson<Record<string, unknown>>(url, {
      headers: authHeaders(),
      rateLimiter: indexer.httpOpts.rateLimiter,
    });

    const links = (rel['assets'] as Record<string, unknown>)?.['links'] as Array<Record<string, unknown>> ?? [];
    const sources = (rel['assets'] as Record<string, unknown>)?.['sources'] as Array<Record<string, unknown>> ?? [];

    const assets = [
      ...links.map(l => ({
        name: l['name'] as string,
        url: l['direct_asset_url'] as string ?? l['url'] as string,
      })),
      ...sources.map(s => ({
        name: `source.${s['format'] as string}`,
        url: s['url'] as string,
      })),
    ];

    const release: ReleaseEntry = {
      tag,
      name: (rel['name'] as string) ?? undefined,
      body: (rel['description'] as string) ?? undefined,
      publishedAt: (rel['released_at'] as string) ?? undefined,
      assets,
      raw: rel,
    };

    await indexer.addRelease(owner, repo, release);

    for (const asset of assets) {
      if (asset.url && asset.name) {
        try {
          await indexer.downloadReleaseAsset(asset.url, owner, repo, tag, asset.name);
        } catch (err) {
          console.error(`  Failed to download ${asset.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
}
