// ============================================================
// Router.ts — History API router (entry point)
// ============================================================

import * as Greetings from './Greetings.ts';
import * as Repository from './Repository.ts';
import * as PullRequests from './PullRequests.ts';

type Page = 'repository' | 'pull-requests';

// Pages where the global command bar (@/slash overlay + @me button) is active.
const COMMAND_BAR_PAGES: Set<Page> = new Set(['repository', 'pull-requests']);

let currentPage: Page | null = null;
let rootEl: HTMLElement;

// ---- Route Params ----

interface RepoParams {
  user: string;
  path: string[];
  versions: [number, string][];  // [depth, version] pairs — e.g. [[0,'latest'],[1,'v2']]
  base: string;                  // URL prefix for this player ('' for root, '/@user' for @-routes)
  hash: string | null;           // file selection from URL hash (without the '#')
}

export interface PRParams {
  user: string;
  path: string[];
  base: string;
  prAction: 'list' | 'detail' | 'new';
  prId: number | null;
  commitId: string | null;
  /** The canonical repo path for this PR context, e.g. "@ether/library" */
  repoPath: string;
}

type RouteResult =
  | { page: 'repository'; params: RepoParams }
  | { page: 'pull-requests'; params: PRParams };

// ---- Route Matching ----

const DEFAULT_USER = 'ether';

function matchRoute(pathname: string): RouteResult {
  let user = DEFAULT_USER;
  let base = '';
  let rest = pathname;

  // Extract @user prefix
  const atMatch = pathname.match(/^\/@([^/]+)(\/.*)?$/);
  if (atMatch) {
    user = atMatch[1];
    base = `/@${user}`;
    rest = atMatch[2] || '';
  }

  // Split remaining into segments, filter empty
  const segments = rest.split('/').filter(s => s);

  // Check for -/pulls namespace separator
  const dashIdx = segments.indexOf('-');
  if (dashIdx >= 0 && segments[dashIdx + 1] === 'pulls') {
    // Everything before '-' is the repo path (strip wildcards)
    const repoPathSegments = segments.slice(0, dashIdx).filter(s => s !== '*' && s !== '**');
    const pullsSegments = segments.slice(dashIdx + 2); // after 'pulls'

    const repoPath = `@${user}` + (repoPathSegments.length > 0 ? '/' + repoPathSegments.join('/') : '');

    let prAction: 'list' | 'detail' | 'new' = 'list';
    let prId: number | null = null;
    let commitId: string | null = null;

    if (pullsSegments.length === 0) {
      prAction = 'list';
    } else if (pullsSegments[0] === 'new') {
      prAction = 'new';
    } else {
      const id = parseInt(pullsSegments[0], 10);
      if (!isNaN(id)) {
        prAction = 'detail';
        prId = id;
        // Check for /commits/UUID
        if (pullsSegments[1] === 'commits' && pullsSegments[2]) {
          commitId = pullsSegments[2];
        }
      }
    }

    return {
      page: 'pull-requests',
      params: { user, path: repoPathSegments, base, prAction, prId, commitId, repoPath },
    };
  }

  // Walk segments: collect ~/version markers and build clean path
  const path: string[] = [];
  const versions: [number, string][] = [];
  let i = 0;
  while (i < segments.length) {
    if (segments[i] === '~') {
      if (i + 1 < segments.length) {
        versions.push([path.length, segments[i + 1]]);
        i += 2;
      } else {
        // Trailing ~ with no version — worlds listing marker
        path.push('~');
        i++;
      }
    } else {
      path.push(segments[i]);
      i++;
    }
  }

  return { page: 'repository', params: { user, path, versions, base, hash: null } };
}

// ---- Page Lifecycle ----

async function activatePage(route: RouteResult): Promise<void> {
  // Fast-path: same page type, just update params
  if (route.page === 'repository' && currentPage === 'repository') {
    Repository.update(route.params);
    ensureBar(route.page);
    return;
  }
  if (route.page === 'pull-requests' && currentPage === 'pull-requests') {
    PullRequests.update(route.params);
    ensureBar(route.page);
    return;
  }

  // Unmount current page
  if (currentPage === 'repository') {
    Repository.unmount();
  } else if (currentPage === 'pull-requests') {
    PullRequests.unmount();
  }

  // Tear down global bar when navigating to an unsupported page
  if (!COMMAND_BAR_PAGES.has(route.page) && Greetings.isGlobalBarActive()) {
    Greetings.teardownGlobalBar();
  }

  currentPage = route.page;

  // Mount new page
  if (route.page === 'repository') {
    rootEl.style.display = '';
    Repository.mount(rootEl, route.params, navigateTo);
  } else if (route.page === 'pull-requests') {
    rootEl.style.display = '';
    PullRequests.mount(rootEl, route.params, navigateTo);
  }

  ensureBar(route.page);
}

function ensureBar(page: Page): void {
  if (COMMAND_BAR_PAGES.has(page) && !Greetings.isFirstVisit()) {
    Greetings.ensureGlobalBar(); // no-op if already active
  }
}

// ---- Navigation ----

let lastRouteUrl = '';

export function navigateTo(path: string): void {
  lastRouteUrl = ''; // force re-evaluation
  history.pushState(null, '', path);
  handleRoute();
}

function handleRoute(): void {
  // Guard against duplicate handling (both popstate and hashchange can fire)
  const url = window.location.pathname + window.location.hash;
  if (url === lastRouteUrl) return;
  lastRouteUrl = url;
  const route = matchRoute(window.location.pathname);
  if (route.page === 'repository') {
    route.params.hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null;
  }
  activatePage(route);
}

// ---- Link Interception ----

function onLinkClick(e: MouseEvent): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//')) return;

  e.preventDefault();
  navigateTo(href);
}

// ---- Boot ----

function isHomepage(): boolean {
  const p = window.location.pathname;
  return p === '/' || p === '';
}

function boot(): void {
  rootEl = document.getElementById('root')!;

  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
  document.addEventListener('click', onLinkClick);

  handleRoute();

  // Homepage first visit: CRT onboarding overlay on top of the page
  if (isHomepage() && Greetings.isFirstVisit()) {
    Greetings.mount(); // fire-and-forget async overlay
  }
}

document.addEventListener('DOMContentLoaded', boot);
