// ============================================================
// Repository.ts — Player page: file explorer + README rendering
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { renderMarkdown } from './Markdown.ts';
import { fileIcon } from './FileIcons.ts';
import { getRepository, getReferencedUsers, getReferencedWorlds, getWorld, resolveDirectory } from './DummyData.ts';
import type { FileEntry, Repository } from './DummyData.ts';

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let iframeCleanup: (() => void) | null = null;

// Current state
let currentRepoParams: { user: string; path: string[]; versions: [number, string][]; base: string } | null = null;

function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    .repo-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      min-height: 100vh;
    }

    .repo-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 22px;
      margin-bottom: 8px;
      text-shadow:
        0 0 4px rgba(255,255,255,0.5),
        0 0 11px rgba(255,255,255,0.22);
    }
    .repo-header .user { color: rgba(255,255,255,0.55); }
    .repo-header .sep { color: rgba(255,255,255,0.25); }
    .repo-header .repo-name { color: ${PHOSPHOR}; font-weight: bold; }

    .repo-header a {
      color: inherit;
      text-decoration: none;
    }
    .repo-header a:hover { text-decoration: underline; }

    .repo-description {
      color: rgba(255,255,255,0.4);
      font-size: 14px;
      margin-bottom: 24px;
    }

    .repo-breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      margin-bottom: 16px;
      color: rgba(255,255,255,0.45);
      position: relative;
    }
    .repo-breadcrumb a {
      color: rgba(255,255,255,0.65);
      text-decoration: none;
      cursor: pointer;
    }
    .repo-breadcrumb a:hover { color: ${PHOSPHOR}; text-decoration: underline; }
    .repo-breadcrumb .sep { margin: 0 2px; }

    .version-badge {
      display: inline-block;
      font-size: 12px;
      padding: 2px 8px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      color: rgba(255,255,255,0.5);
      margin-left: 4px;
    }

    .file-table {
      width: 100%;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 32px;
    }

    .file-row {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: pointer;
      transition: background 0.1s;
    }
    .file-row:last-child { border-bottom: none; }
    .file-row:hover { background: rgba(255,255,255,0.04); }

    .file-icon {
      flex: 0 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 10px;
    }
    .file-icon svg { display: block; }

    .file-name {
      flex: 1;
      font-size: 14px;
      color: rgba(255,255,255,0.85);
    }
    .file-row:hover .file-name { color: ${PHOSPHOR}; }

    .file-modified {
      font-size: 12px;
      color: rgba(255,255,255,0.25);
      white-space: nowrap;
    }

    .readme-section {
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      overflow: hidden;
    }

    .readme-header {
      padding: 10px 16px;
      font-size: 13px;
      font-weight: bold;
      color: rgba(255,255,255,0.6);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.02);
    }

    .readme-body {
      padding: 24px 32px;
      font-size: 14px;
      line-height: 1.7;
      color: rgba(255,255,255,0.8);
    }

    .readme-body h1 {
      font-size: 28px;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      color: ${PHOSPHOR};
      text-shadow: 0 0 6px rgba(255,255,255,0.3);
    }
    .readme-body h2 {
      font-size: 22px;
      margin: 28px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      color: ${PHOSPHOR};
    }
    .readme-body h3 {
      font-size: 18px;
      margin: 24px 0 8px 0;
      color: ${PHOSPHOR};
    }
    .readme-body h4, .readme-body h5, .readme-body h6 {
      font-size: 15px;
      margin: 20px 0 6px 0;
      color: rgba(255,255,255,0.9);
    }

    .readme-body p { margin: 0 0 12px 0; }

    .readme-body a {
      color: #7db8e0;
      text-decoration: none;
    }
    .readme-body a:hover { text-decoration: underline; }

    .readme-body code {
      background: rgba(255,255,255,0.08);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }

    .readme-body pre {
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      margin: 0 0 16px 0;
    }
    .readme-body pre code {
      background: none;
      padding: 0;
      font-size: 13px;
      color: rgba(255,255,255,0.75);
    }

    .readme-body blockquote {
      border-left: 3px solid rgba(255,255,255,0.15);
      margin: 0 0 12px 0;
      padding: 4px 16px;
      color: rgba(255,255,255,0.55);
    }

    .readme-body ul, .readme-body ol {
      margin: 0 0 12px 0;
      padding-left: 24px;
    }
    .readme-body li { margin-bottom: 4px; }
    .readme-body li.task-item {
      list-style: none;
      margin-left: -24px;
    }
    .readme-body li.task-item input {
      margin-right: 6px;
      accent-color: ${PHOSPHOR};
    }

    .readme-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 16px 0;
    }
    .readme-body th, .readme-body td {
      border: 1px solid rgba(255,255,255,0.1);
      padding: 6px 12px;
      font-size: 13px;
    }
    .readme-body th {
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.7);
    }

    .readme-body hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 20px 0;
    }

    .readme-body del { color: rgba(255,255,255,0.35); }

    .readme-body img {
      max-width: 100%;
      margin: 8px 0;
    }

    .readme-body strong {
      color: ${PHOSPHOR};
    }
    .readme-body em {
      color: rgba(255,255,255,0.9);
      font-style: italic;
    }

    .repo-404 {
      text-align: center;
      padding: 80px 20px;
      color: rgba(255,255,255,0.4);
      font-size: 18px;
    }
    .repo-404 .code {
      font-size: 64px;
      color: rgba(255,255,255,0.12);
      margin-bottom: 16px;
    }

    /* ---- Clone / Download button ---- */
    .clone-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #00c850;
      border: 1px solid #00c850;
      border-radius: 6px;
      color: #0a0a0a;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      padding: 3px 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .clone-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
      flex-shrink: 0;
    }
    .clone-btn:hover {
      background: #00da58;
      border-color: #00da58;
    }

    /* ---- Popup (reusable) ---- */
    .popup {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: fit-content;
      max-width: 100%;
      z-index: 100;
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,255,255,0.03);
      font-family: 'Courier New', Courier, monospace;
      display: none;
    }
    .popup.open { display: block; }
    .popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99;
      display: none;
    }
    .popup-backdrop.open { display: block; }

    .popup-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .popup-row:last-child { margin-bottom: 0; }

    .popup-row-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
    .popup-row-icon img,
    .popup-row-icon svg {
      width: 22px;
      height: 22px;
    }
    .popup-row-icon svg { fill: rgba(255,255,255,0.4); }

    .popup-code {
      flex: 1;
      min-width: 0;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      word-break: break-all;
      overflow-wrap: anywhere;
    }

    .copy-btn {
      flex-shrink: 0;
      background: none;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      padding: 5px 7px;
      cursor: pointer;
      color: rgba(255,255,255,0.4);
      transition: color 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
    }
    .copy-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .copy-btn:hover {
      color: ${PHOSPHOR};
      border-color: rgba(255,255,255,0.25);
    }
    .copy-btn.copied {
      color: ${PHOSPHOR};
      border-color: ${PHOSPHOR};
    }
  `;
  document.head.appendChild(styleEl);
}

// ---- Helpers ----

function bindClickHandlers(): void {
  if (!currentContainer || !navigateFn) return;

  currentContainer.querySelectorAll('[data-href]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateFn!((el as HTMLElement).dataset.href!);
    });
  });

  currentContainer.querySelectorAll('[data-link]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateFn!((link as HTMLAnchorElement).getAttribute('href')!);
    });
  });

  // Clone popup
  const toggle = currentContainer.querySelector('[data-clone-toggle]') as HTMLElement | null;
  const popup = currentContainer.querySelector('[data-clone-popup]') as HTMLElement | null;
  const backdrop = currentContainer.querySelector('[data-clone-backdrop]') as HTMLElement | null;
  if (toggle && popup && backdrop) {
    const close = () => { popup.classList.remove('open'); backdrop.classList.remove('open'); };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = popup.classList.toggle('open');
      backdrop.classList.toggle('open', open);
    });
    backdrop.addEventListener('click', close);
  }

  currentContainer.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = (btn as HTMLElement).dataset.copy!;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      });
    });
  });
}

// ---- Path Helpers ----

/** Build a URL path, inserting ~/version markers at the correct depths.
 *  Only includes markers whose depth <= target path length. */
function buildBasePath(base: string, versions: [number, string][], path: string[]): string {
  const relevant = versions.filter(([d]) => d <= path.length)
    .sort((a, b) => a[0] - b[0]);

  if (relevant.length === 0) {
    // Implicit versioning — bare path
    return (base || '') + (path.length > 0 ? '/' + path.join('/') : '');
  }

  let result = base || '';
  let pathIdx = 0;
  let verIdx = 0;

  while (pathIdx < path.length || verIdx < relevant.length) {
    if (verIdx < relevant.length && relevant[verIdx][0] === pathIdx) {
      result += '/~/' + relevant[verIdx][1];
      verIdx++;
    } else if (pathIdx < path.length) {
      result += '/' + path[pathIdx];
      pathIdx++;
    } else {
      break;
    }
  }

  return result;
}

// ---- Repository File View ----

function renderFileListing(entries: FileEntry[], basePath: string): string {
  const dirs = entries.filter(e => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => !e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = [...dirs, ...files];

  return `<div class="file-table">${sorted.map(entry => {
    const href = basePath + (basePath.endsWith('/') ? '' : '/') + entry.name;
    const displayName = entry.name === '@' ? '@{: String}' : entry.name === '~' ? '#{: String}' : entry.name;
    return `<div class="file-row" data-href="${href}">
      <div class="file-icon">${fileIcon(entry.name, entry.isDirectory)}</div>
      <div class="file-name">${displayName}</div>
      <div class="file-modified">${entry.modified}</div>
    </div>`;
  }).join('')}</div>`;
}

interface BreadcrumbItem { label: string; href: string | null; }

const CLONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 512L128 512L128 288L176 288L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L352 464L352 512zM288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352C224 387.3 252.7 416 288 416z"/></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z"/></svg>`;
const GIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M280.3 222.4L201 222.4C161 211.9 70.5 214.6 70.5 297.2C70.5 327.3 85.5 348.4 105.5 358.2C80.4 381.2 68.5 392 68.5 407.4C68.5 418.4 73 428.5 86.4 434.2C72.1 447.6 64 457.3 64 475.6C64 507.7 92 526.4 165.6 526.4C236.4 526.4 277.4 500 277.4 453.2C277.4 394.5 232.2 396.7 125.8 390.2L139.2 368.6C166.5 376.2 257.9 378.6 257.9 300.7C257.9 282 250.2 269 242.9 259.6L280.3 256.8L280.3 222.3zM216.9 464.3C216.9 496.4 112 496.4 112 466.7C112 458.6 117.3 451.7 122.6 445.2C200.3 450.5 216.9 448.6 216.9 464.3zM166.1 329.7C113.3 329.7 115.6 258.5 167.3 258.5C216.8 258.5 218.1 329.7 166.1 329.7zM299.4 430.2L299.4 398.1C326.1 394.4 326.6 396.1 326.6 387.1L326.6 267.6C326.6 259.1 324.5 260.2 299.4 251.3L303.9 218.4L388.1 218.4L388.1 387.1C388.1 393.6 388.5 394.4 394.6 395.2L415.3 398L415.3 430.1L299.4 430.1zM351.9 185.9C328.7 185.9 315.3 172.5 315.3 149.3C315.3 126.1 328.7 113.5 351.9 113.5C375.5 113.5 388.9 126.1 388.9 149.3C388.9 172.5 375.5 185.9 351.9 185.9zM576 414.5C558.5 423 532.9 430.8 509.7 430.8C461.3 430.8 443 411.3 443 365.3L443 258.8C443 253.4 444 254.7 411.3 254.7L411.3 218.5C447.1 214.4 461.3 196.5 465.8 152.2L504.4 152.2C504.4 218 503.1 214 507.7 214L565 214L565 254.6L504.4 254.6L504.4 351.7C504.4 358.6 499.5 403.1 565 378.5L576 414.3z"/></svg>`;

function renderClonePopup(canonicalPath: string): string {
  const etherCmd = `ether clone ${canonicalPath}`;
  const gitCmd = `git clone git@ether.orbitmines.com:${canonicalPath}`;
  return `<div class="popup-backdrop" data-clone-backdrop></div>
    <button class="clone-btn" style="margin-left:auto;" data-clone-toggle>${CLONE_SVG} Download</button>
    <div class="popup" data-clone-popup>
      <div class="popup-row">
        <div class="popup-row-icon"><img src="/images/E.svg" alt="Ether"></div>
        <div class="popup-code">${etherCmd}</div>
        <button class="copy-btn" data-copy="${etherCmd}">${COPY_SVG}</button>
      </div>
      <div class="popup-row">
        <div class="popup-row-icon">${GIT_SVG}</div>
        <div class="popup-code">${gitCmd}</div>
        <button class="copy-btn" data-copy="${gitCmd}">${COPY_SVG}</button>
      </div>
    </div>`;
}

function renderBreadcrumb(displayVersion: string, items: BreadcrumbItem[], canonicalPath?: string): string {
  let html = `<div class="repo-breadcrumb">
    <span class="version-badge">${displayVersion}</span>`;

  for (const item of items) {
    html += `<span class="sep">/</span>`;
    if (item.href) {
      html += `<a href="${item.href}" data-link>${item.label}</a>`;
    } else {
      html += `<span>${item.label}</span>`;
    }
  }

  if (canonicalPath) {
    html += renderClonePopup(canonicalPath);
  }

  html += `</div>`;
  return html;
}

function renderHeaderChain(
  chain: { label: string; pathEnd: number }[],
  base: string, versions: [number, string][], path: string[],
): string {
  let html = `<div class="repo-header">`;
  chain.forEach((item, idx) => {
    if (idx > 0) html += `<span class="sep">/</span>`;
    const isLast = idx === chain.length - 1;
    const cls = isLast ? 'repo-name' : 'user';
    if (item.pathEnd >= 0) {
      const href = buildBasePath(base, versions, path.slice(0, item.pathEnd)) || '/';
      html += `<a href="${href}" data-link class="${cls}">${item.label}</a>`;
    } else {
      html += `<span class="${cls}">${item.label}</span>`;
    }
  });
  html += `</div>`;
  return html;
}

function buildCanonicalPath(user: string, world: string | null, treePath: string[]): string {
  let p = `@${user}`;
  if (world) p += `/#${world}`;
  if (treePath.length > 0) p += '/' + treePath.join('/');
  return p;
}

function mountIframe(container: HTMLElement, jsContent: string, canonicalPath: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts');
  iframe.src = '/sandbox.html';
  iframe.style.cssText = 'width: 100%; border: none; border-radius: 6px; background: #0a0a0a; min-height: 300px; flex-grow: 1;';

  let iframeReady = false;

  const sendInit = (includeScript: boolean) => {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'ether:init',
      user: localStorage.getItem('ether:name') || 'anonymous',
      repo: canonicalPath,
      ...(includeScript ? { script: jsContent } : {}),
    }, '*');
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return;
    const data = e.data;
    if (!data || !data.type) return;

    if (data.type === 'ether:ready') {
      iframeReady = true;
      sendInit(true);
    } else if (data.type === 'ether:storage') {
      const nsKey = `ray:${canonicalPath}:${data.key}`;
      let value: string | null = null;
      if (data.action === 'get') {
        value = localStorage.getItem(nsKey);
      } else if (data.action === 'set') {
        localStorage.setItem(nsKey, data.value);
      } else if (data.action === 'remove') {
        localStorage.removeItem(nsKey);
      }
      iframe.contentWindow!.postMessage({
        type: 'ether:storage:response',
        id: data.id,
        value: value,
      }, '*');
    }
  };

  const onCharacter = () => {
    if (iframeReady) sendInit(false);
  };

  window.addEventListener('message', onMessage);
  window.addEventListener('ether:character', onCharacter);
  container.appendChild(iframe);

  iframeCleanup = () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('ether:character', onCharacter);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  return iframe;
}

function renderRepo(): void {
  if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }
  if (!currentContainer || !currentRepoParams) return;
  const { user, path, versions, base } = currentRepoParams;

  // ---- Process @/~ references to resolve effective user/world and tree path ----
  let effectiveUser = user;
  let effectiveWorld: string | null = null;
  let effectiveWorldParent = user;  // resolved parent key for getWorld lookup
  let worldParentKey = user;        // tracks current context for next nested world
  let treePath: string[] = [];
  let treePathStart = 0;
  let userPathEnd = 0;
  let showUsersListing = false;
  let showWorldsListing = false;
  let hasWildcard = false;

  // Header chain: collect context switches for title breadcrumb
  // Hide implicit @user when the path immediately enters a world (~name or ~)
  const firstNonWild = path.find(s => s !== '*');
  const startsWithWorld = firstNonWild !== undefined && (firstNonWild === '~' || firstNonWild.startsWith('~'));
  const headerChain: { label: string; pathEnd: number }[] =
    (base || !startsWithWorld) ? [{ label: `@${user}`, pathEnd: 0 }] : [];

  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (seg === '*') {
      // Wildcard — kept in path for URL generation, skip for tree resolution
      hasWildcard = true;
      if (headerChain.length > 0) headerChain[headerChain.length - 1].pathEnd = i + 1;
      if (treePath.length === 0) {
        treePathStart = i + 1;
        userPathEnd = i + 1;
      }
      continue;
    } else if (seg === '@') {
      if (i === path.length - 1) {
        showUsersListing = true;
      } else {
        effectiveUser = path[i + 1];
        effectiveWorld = null;
        worldParentKey = effectiveUser;
        treePath = [];
        treePathStart = i + 2;
        userPathEnd = i + 2;
        headerChain.push({ label: `@${effectiveUser}`, pathEnd: i + 2 });
        i++; // skip user name segment
      }
    } else if (seg.startsWith('@')) {
      effectiveUser = seg.slice(1);
      effectiveWorld = null;
      worldParentKey = effectiveUser;
      treePath = [];
      treePathStart = i + 1;
      userPathEnd = i + 1;
      headerChain.push({ label: `@${effectiveUser}`, pathEnd: i + 1 });
    } else if (seg === '~') {
      if (i === path.length - 1) {
        showWorldsListing = true;
      }
    } else if (seg.startsWith('~')) {
      const parentKey = worldParentKey;  // save before updating
      effectiveWorld = seg.slice(1);
      treePath = [];
      treePathStart = i + 1;
      headerChain.push({ label: `#${effectiveWorld}`, pathEnd: i + 1 });
      worldParentKey = effectiveWorld;  // nested worlds look up under this one
      effectiveWorldParent = parentKey; // for resolving this world
    } else {
      treePath.push(seg);
    }
  }

  // Add project or listing label to the header chain
  if (showUsersListing) {
    headerChain.push({ label: '@{: String}', pathEnd: -1 });
  } else if (showWorldsListing) {
    headerChain.push({ label: '#{: String}', pathEnd: -1 });
  } else if (treePath.length > 0) {
    headerChain.push({ label: treePath[0], pathEnd: treePathStart + 1 });
  }

  // ---- Resolve data ----
  const repository = effectiveWorld
    ? getWorld(effectiveWorldParent, effectiveWorld)
    : getRepository(effectiveUser);
  if (!repository) {
    const target = effectiveWorld
      ? `#${effectiveWorld} in @${effectiveUser}`
      : `@${effectiveUser}`;
    currentContainer.innerHTML = `<div class="repo-page">
      <div class="repo-404">
        <div class="code">404</div>
        ${target} not found
      </div>
    </div>`;
    return;
  }

  let entries: FileEntry[];

  if (showUsersListing) {
    // Show referenced users as directory entries
    entries = getReferencedUsers(effectiveUser, effectiveWorld).map(u => ({
      name: u, isDirectory: true, modified: '',
    }));
  } else if (showWorldsListing) {
    // Show referenced worlds as directory entries
    entries = getReferencedWorlds(effectiveUser, effectiveWorld).map(w => ({
      name: w, isDirectory: true, modified: '',
    }));
  } else {
    const resolved = treePath.length > 0
      ? resolveDirectory(repository.tree, treePath)
      : repository.tree;

    if (!resolved) {
      currentContainer.innerHTML = `<div class="repo-page">
        <div class="repo-404">
          <div class="code">404</div>
          Path not found in @${effectiveUser}
        </div>
      </div>`;
      return;
    }

    entries = resolved;

    // At tree root, inject virtual @/~ entries if there are referenced users/worlds
    if (treePath.length === 0) {
      const virtuals: FileEntry[] = [];
      if (getReferencedUsers(effectiveUser, effectiveWorld).length > 0)
        virtuals.push({ name: '@', isDirectory: true, modified: '' });
      if (getReferencedWorlds(effectiveUser, effectiveWorld).length > 0)
        virtuals.push({ name: '~', isDirectory: true, modified: '' });
      entries = [...virtuals, ...entries];
    }
  }

  // ---- Check for index.ray.js (sandboxed iframe mode) ----
  const indexRay = !showUsersListing && !showWorldsListing && !hasWildcard
    ? entries.find(e => e.name === 'index.ray.js' && !e.isDirectory && e.content)
    : null;

  if (indexRay) {
    if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }

    const canonicalPath = buildCanonicalPath(effectiveUser, effectiveWorld, treePath);

    // Build the header label from the chain
    const headerLabel = headerChain.map(item => item.label).join(' / ');

    // Full-viewport iframe with overlay badge in bottom-right
    currentContainer.innerHTML = `<div class="repo-page" style="position:relative;padding:0;max-width:none;min-height:100vh;display:flex;flex-direction:column;">
      <div style="
        position:fixed;
        bottom:0;
        right:0;
        background:rgba(0,0,0,0.55);
        color:rgba(255,255,255,0.65);
        font-family:'Courier New',Courier,monospace;
        font-size:13px;
        padding:6px 14px;
        border-top-left-radius:8px;
        z-index:10;
        pointer-events:none;
        backdrop-filter:blur(6px);
        -webkit-backdrop-filter:blur(6px);
      ">
        <span style="color:rgba(255,255,255,0.85);">${headerLabel}</span>
        <span style="margin-left:8px;color:rgba(255,255,255,0.4);font-size:12px;">${repository.description}</span>
      </div>
    </div>`;

    const repoPage = currentContainer.querySelector('.repo-page') as HTMLElement;
    mountIframe(repoPage, indexRay.content!, canonicalPath);
    return;
  }

  // ---- Build URLs ----
  const basePath = buildBasePath(base, versions, path);
  const displayVersion = versions.length > 0 ? versions[versions.length - 1][1] : 'latest';

  let html = `<div class="repo-page">`;

  // Header: chain of context switches, parents muted, last item bright
  html += renderHeaderChain(headerChain, base, versions, path);
  html += `<div class="repo-description">${repository.description}</div>`;

  // Breadcrumb: version badge + sub-path within project (treePath[1:])
  const subPath = treePath.slice(1);
  const breadcrumbItems: BreadcrumbItem[] = subPath.map((seg, i) => ({
    label: seg,
    href: i < subPath.length - 1
      ? buildBasePath(base, versions, path.slice(0, treePathStart + 1 + i + 1))
      : null,
  }));
  let clonePath = buildCanonicalPath(effectiveUser, effectiveWorld, treePath);
  if (showWorldsListing) clonePath += '/#';
  else if (showUsersListing) clonePath += '/@';
  // Strip implicit @user prefix when not explicit in URL, keep if top-level root
  if (!base) {
    const prefix = `@${user}/`;
    if (clonePath.startsWith(prefix)) {
      clonePath = clonePath.slice(prefix.length);
    }
  }
  html += renderBreadcrumb(displayVersion, breadcrumbItems, clonePath);

  // File listing
  if (showUsersListing) {
    const usersBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${entries.map(entry => {
      const href = usersBase + '/@' + entry.name;
      return `<div class="file-row" data-href="${href}">
        <div class="file-icon">${fileIcon(entry.name, true)}</div>
        <div class="file-name">@${entry.name}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else if (showWorldsListing) {
    const worldsBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${entries.map(entry => {
      const href = worldsBase + '/~' + entry.name;
      return `<div class="file-row" data-href="${href}">
        <div class="file-icon">${fileIcon(entry.name, true)}</div>
        <div class="file-name">#${entry.name}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html += renderFileListing(entries, basePath);
  }

  // README — resolve relative links against current basePath
  const readme = entries.find(e => e.name === 'README.md' && !e.isDirectory);
  if (readme && readme.content) {
    const readmeHtml = renderMarkdown(readme.content);
    const resolvedHtml = readmeHtml.replace(/href="(?!\/|https?:|#)([^"]+)"/g, (_m, rel) =>
      `href="${buildBasePath(base, versions, [...path, ...rel.split('/').filter(Boolean)])}"`
    );
    html += `<div class="readme-section">
      <div class="readme-header">README.md</div>
      <div class="readme-body">${resolvedHtml}</div>
    </div>`;
  }

  html += `</div>`;
  currentContainer.innerHTML = html;
  bindClickHandlers();
}

// ---- Public API ----

export function mount(
  container: HTMLElement,
  params: { user: string; path: string[]; versions: [number, string][]; base: string },
  navigate: (path: string) => void,
): void {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  currentRepoParams = params;
  navigateFn = navigate;
  renderRepo();
}

export function update(params: { user: string; path: string[]; versions: [number, string][]; base: string }): void {
  currentRepoParams = params;
  renderRepo();
}

export function unmount(): void {
  if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }
  if (currentContainer) {
    currentContainer.innerHTML = '';
    currentContainer = null;
  }
  currentRepoParams = null;
  navigateFn = null;
}
