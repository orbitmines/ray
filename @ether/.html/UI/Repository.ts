// ============================================================
// Repository.ts — Player page: file explorer + README rendering
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { renderMarkdown } from './Markdown.ts';
import { fileIcon, accessIcon, accessSvg, fileOrEncryptedIcon } from './FileIcons.ts';
import { getAPI, getRepository, getReferencedUsers, getReferencedWorlds, getWorld, resolveDirectory, resolveFile, resolveFiles, isCompound, flattenEntries, getOpenPRCount, getCurrentPlayer, getStars, toggleStar, isStarred, getStarCount, setStarCount, isFollowing, toggleFollow, getFollowerCount, setFollowerCount, loadSession, saveSession, getSessionContent } from './API.ts';
import type { FileEntry, CompoundEntry, TreeEntry, Repository } from './API.ts';
import { createIDELayout, generateId, ensureIdCounter, injectIDEStyles } from './IDELayout.ts';
import type { IDELayoutAPI, PanelDefinition, LayoutNode, TabGroupNode, SplitNode } from './IDELayout.ts';
import { EDIT_SVG } from './PRIcons.ts';

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let iframeCleanup: (() => void) | null = null;
let virtualScrollCleanup: (() => void) | null = null;
let ideLayoutInstance: IDELayoutAPI | null = null;
let currentFileViewEntries: TreeEntry[] | null = null;     // entries used in current file-view (for hash fast path)
let currentFileViewBasePath: string | null = null;          // sidebar base path for current file-view
let currentMakeFilePanel: ((panelId: string, name: string, files: FileEntry[]) => PanelDefinition) | null = null;
const sidebarExpanded = new Set<string>();  // tracks manually expanded/collapsed dirs

function loadSidebarExpanded(user: string): void {
  const session = loadSession(user);
  sidebarExpanded.clear();
  if (Array.isArray(session.sidebarExpanded)) {
    for (const key of session.sidebarExpanded) sidebarExpanded.add(key);
  }
}

function saveSidebarExpanded(user: string): void {
  const session = loadSession(user);
  session.sidebarExpanded = [...sidebarExpanded];
  saveSession(user, session);
}


// ---- IDE layout session helpers ----

function collectPanelIds(node: LayoutNode): string[] {
  if (node.type === 'tabgroup') return [...node.panels];
  const ids: string[] = [];
  for (const child of node.children) ids.push(...collectPanelIds(child));
  return ids;
}

/** Strip panels from saved layout that are not in validIds. Returns null if empty. */
function filterLayoutPanels(node: LayoutNode, validIds: Set<string>): LayoutNode | null {
  if (node.type === 'tabgroup') {
    const filtered = node.panels.filter(id => validIds.has(id));
    if (filtered.length === 0) return null;
    return { ...node, panels: filtered, activeIndex: Math.min(node.activeIndex, filtered.length - 1) };
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const result = filterLayoutPanels(node.children[i], validIds);
    if (result) { children.push(result); sizes.push(node.sizes[i]); }
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const sizeSum = sizes.reduce((a, b) => a + b, 0);
  return { ...node, children, sizes: sizes.map(s => s / sizeSum) };
}

/** Find the max numeric suffix from ide-N IDs in a layout tree */
function maxIdInLayout(node: LayoutNode): number {
  let max = 0;
  const m = node.id.match(/^ide-(\d+)$/);
  if (m) max = Math.max(max, parseInt(m[1], 10));
  if (node.type === 'split') {
    for (const child of node.children) max = Math.max(max, maxIdInLayout(child));
  }
  return max;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function saveIDESession(user: string, sidebarBasePath: string): void {
  if (!ideLayoutInstance) return;
  // Debounce to avoid thrashing localStorage during rapid resize
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!ideLayoutInstance) return;
    const session = loadSession(user);
    session.ideLayout = ideLayoutInstance.getLayout();
    session.ideLayoutBase = sidebarBasePath;
    saveSession(user, session);
  }, 300);
}

// File viewer constants
const LINE_HEIGHT = 20;
const VIRTUAL_THRESHOLD = 500;
const BUFFER_LINES = 50;

// Current state
let currentRepoParams: { user: string; path: string[]; versions: [number, string][]; base: string; hash: string | null } | null = null;

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
      box-sizing: border-box;
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

    .repo-nav-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 2px;
      margin-bottom: 6px;
      position: relative;
    }
    .nav-actions { display: none; }
    .breadcrumb-actions { display: contents; }

    .repo-breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      margin-bottom: 16px;
      color: rgba(255,255,255,0.45);
      position: relative;
    }
    .repo-breadcrumb a, .repo-breadcrumb span, .repo-breadcrumb .version-badge {
      flex-shrink: 0;
      white-space: nowrap;
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

    .file-access {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 1px;
      margin-right: 6px;
    }
    .file-access svg { display: block; }

    /* Access badge tooltip */
    .access-badge {
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .access-badge > svg { display: block; }
    .access-tooltip {
      display: none;
      position: fixed;
      font-family: 'Courier New', Courier, monospace;
      background: #111111;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 6px 10px;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1.4;
      color: rgba(255,255,255,0.85);
      z-index: 2147483647;
      pointer-events: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      gap: 6px;
      align-items: baseline;
    }
    .access-tooltip.visible { display: flex; }
    .access-tooltip-label { font-weight: 600; }
    .access-tooltip-desc { color: rgba(255,255,255,0.5); }
    .access-tooltip-link {
      color: ${PHOSPHOR};
      text-decoration: none;
      cursor: pointer;
    }
    .access-tooltip-link:hover { text-decoration: underline; }
    .access-tooltip-input {
      background: transparent;
      border: none;
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: 600;
      color: inherit;
      padding: 0;
      margin: 0;
      width: 100%;
      min-width: 80px;
    }

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

    /* ---- Compound groups ---- */
    .compound-group {
      border-left: 2px solid rgba(255,255,255,0.08);
    }
    .compound-and { border-color: rgba(255,255,255,0.12); }
    .compound-or { border-color: rgba(0,200,80,0.3); }
    .compound-count {
      font-size: 12px;
      color: rgba(255,255,255,0.35);
      margin-left: 4px;
    }

    /* ---- README tabs ---- */
    .readme-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.02);
    }
    .readme-tab {
      padding: 8px 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      background: none;
      border-bottom: 2px solid transparent;
      font-family: inherit;
    }
    .readme-tab:hover { color: rgba(255,255,255,0.6); }
    .readme-tab.active { color: ${PHOSPHOR}; border-bottom-color: ${PHOSPHOR}; }
    .readme-body.hidden { display: none; }

    /* ---- Action buttons (shared) ---- */
    .action-btn {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 26px;
      box-sizing: border-box;
      border-radius: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      padding: 0 10px;
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      margin-left: 4px;
    }
    .action-btn .action-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .action-btn .action-icon svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
      display: block;
    }
    .action-btn .action-label {
      display: flex;
      align-items: center;
      height: 100%;
    }
    .action-icon-small { display: none !important; }
    .action-count {
      font-weight: bold;
    }

    /* ---- Star button ---- */
    .star-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.55);
      transition: border-color 0.15s, color 0.15s;
    }
    .star-btn:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.75); }
    .star-btn.starred { color: #f5a623; border-color: #f5a623; }
    .star-btn.starred:hover { color: #f7b84e; border-color: #f7b84e; }

    .follow-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.55);
      transition: border-color 0.15s, color 0.15s;
    }
    .follow-btn:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.75); }
    .follow-btn.following { color: ${PHOSPHOR}; border-color: ${PHOSPHOR}; }
    .follow-btn.following:hover { color: ${PHOSPHOR}; border-color: ${PHOSPHOR}; opacity: 0.85; }

    /* ---- Icon-only buttons (PR, Settings) ---- */
    .icon-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      color: rgba(255,255,255,0.5);
      padding: 0 6px;
    }
    .icon-btn:hover {
      color: rgba(255,255,255,0.85);
      border-bottom-color: rgba(255,255,255,0.3);
    }

    /* ---- Clone / Download button ---- */
    .clone-btn {
      background: #00c850;
      border: 1px solid #00c850;
      color: #0a0a0a;
      transition: background 0.15s, border-color 0.15s;
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

    /* ---- Popup ether block (clone + fork in one block) ---- */
    .popup-ether-block {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .popup-ether-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      align-self: center;
    }
    .popup-ether-icon img {
      width: 22px;
      height: 22px;
    }
    .popup-ether-lines {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .popup-ether-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .popup-play-btn {
      flex-shrink: 0;
      background: #00c850;
      border: 1px solid #00c850;
      border-radius: 4px;
      padding: 5px 7px;
      cursor: pointer;
      color: #0a0a0a;
      transition: background 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
    }
    .popup-play-btn:hover {
      background: #00da58;
      border-color: #00da58;
    }
    .popup-play-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .popup-fork-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: rgba(255,255,255,0.4);
    }
    .popup-fork-icon svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .popup-fork-prefix {
      color: rgba(255,255,255,0.35);
      font-size: 12px;
      white-space: nowrap;
    }
    .popup-fork-input {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      padding: 2px 4px;
      min-width: 0;
    }
    .popup-fork-input:focus {
      border-bottom-color: ${PHOSPHOR};
      color: rgba(255,255,255,0.9);
    }
    .popup-fork-suffix {
      flex-shrink: 0;
      color: rgba(255,255,255,0.35);
      font-size: 12px;
      white-space: nowrap;
    }

    /* ---- File view mode: page extends to edges ---- */
    .repo-page.file-view-mode {
      max-width: none;
      padding-right: 0;
      padding-bottom: 0;
      display: flex;
      flex-direction: column;
    }
    .ide-layout-mount {
      flex: 1 0 0;
    }
    .file-view-top {
      max-width: none;
      padding-right: 24px;
    }

    /* ---- File viewer (sidebar entries used inside IDE layout panels) ---- */
    .file-view-sidebar-entry {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      gap: 6px;
      transition: background 0.1s;
    }
    .file-view-sidebar-entry:hover { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); }
    .file-view-sidebar-entry.active { background: rgba(255,255,255,0.06); color: ${PHOSPHOR}; }
    .file-view-sidebar-entry svg { flex-shrink: 0; }
    .sidebar-dir-header {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      gap: 6px;
      transition: background 0.1s;
    }
    .sidebar-dir-header:hover { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); }
    .sidebar-dir-header svg { flex-shrink: 0; }
    .sidebar-arrow {
      flex-shrink: 0;
      width: 14px;
      text-align: center;
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      line-height: 1;
    }
    .sidebar-arrow-spacer {
      flex-shrink: 0;
      width: 14px;
    }
    .sidebar-dir-children.hidden { display: none; }
    .file-view-content {
      flex: 1;
      min-width: 0;
    }
    .file-view-body.hidden { display: none; }
    .file-view-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: ${CRT_SCREEN_BG};
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .file-view-header .line-count {
      font-size: 12px;
      color: rgba(255,255,255,0.3);
    }
    .file-view-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: ${CRT_SCREEN_BG};
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .file-view-tab {
      padding: 8px 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      background: none;
      border-bottom: 2px solid transparent;
      font-family: inherit;
    }
    .file-view-tab:hover { color: rgba(255,255,255,0.6); }
    .file-view-tab.active { color: ${PHOSPHOR}; border-bottom-color: ${PHOSPHOR}; }
    .file-view-scroll-container {
      position: relative;
      tab-size: 4;
    }
    .file-view-virtual-spacer {
      width: 100%;
    }
    .file-view-lines.virtual {
      position: absolute;
      left: 0;
      right: 0;
    }
    .file-line {
      display: flex;
      height: ${LINE_HEIGHT}px;
      line-height: ${LINE_HEIGHT}px;
    }
    .file-line-number {
      flex: 0 0 60px;
      text-align: right;
      padding-right: 16px;
      color: rgba(255,255,255,0.2);
      font-size: 13px;
      font-family: 'Courier New', Courier, monospace;
      user-select: none;
      -webkit-user-select: none;
    }
    .file-line-text {
      flex: 1;
      white-space: pre;
      font-size: 13px;
      font-family: 'Courier New', Courier, monospace;
      color: rgba(255,255,255,0.75);
      overflow-x: hidden;
    }
    .file-no-content {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: rgba(255,255,255,0.25);
      font-size: 14px;
      padding: 40px;
    }
    .file-view-body.hidden { display: none; }

    /* ---- Iframe overlay bar ---- */
    .iframe-overlay {
      position: fixed;
      bottom: 0;
      right: 0;
      background: rgba(0,0,0,0.55);
      color: rgba(255,255,255,0.65);
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      padding: 6px 14px;
      border-top-left-radius: 8px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 10px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .iframe-overlay .popup {
      top: auto;
      bottom: calc(100% + 6px);
      right: 0;
    }
    .iframe-overlay .overlay-label {
      color: rgba(255,255,255,0.85);
      pointer-events: none;
      white-space: nowrap;
    }
    .iframe-overlay .overlay-desc {
      color: rgba(255,255,255,0.4);
      font-size: 12px;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    @media (max-width: 640px) {
      .iframe-overlay {
        left: 0;
        border-top-left-radius: 0;
        justify-content: flex-end;
        gap: 6px;
        padding: 6px 10px;
      }
      .iframe-overlay .overlay-desc { display: none; }
      .iframe-overlay .action-btn .action-label { display: none; }
      .iframe-overlay .action-btn { gap: 4px; padding: 0 6px; }

      .repo-breadcrumb { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
      .repo-breadcrumb::-webkit-scrollbar { display: none; }
      .breadcrumb-actions { display: none !important; }
      .nav-actions { display: contents; }
      .nav-actions .action-btn .action-label { display: none; }
      .nav-actions .star-btn,
      .nav-actions .follow-btn,
      .nav-actions .clone-btn { gap: 4px; padding: 0 6px; }

      .action-icon-default { display: none !important; }
      .action-icon-small { display: flex !important; }
    }

    @media (max-width: 400px) {
      .iframe-overlay .overlay-label { font-size: 11px; }
      .iframe-overlay .action-btn { margin-left: 2px; }

      .repo-breadcrumb .action-btn { margin-left: 2px; }
    }

    /* ---- Profile Page ---- */
    .profile-layout {
      display: flex;
      gap: 32px;
      margin-top: 8px;
    }
    .profile-readme {
      flex: 1 1 60%;
      min-width: 0;
    }
    .profile-card {
      flex: 0 0 300px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: visible;
    }
    .profile-card .popup {
      max-width: none;
      right: 0;
    }
    .profile-avatar-wrap {
      align-self: center;
      margin-bottom: 12px;
    }
    .profile-avatar {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid rgba(255,255,255,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.04);
      position: relative;
      cursor: default;
    }
    .profile-avatar img, .profile-avatar svg {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .profile-avatar-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s;
      pointer-events: none;
    }
    .profile-avatar-overlay svg {
      width: 24px;
      height: 24px;
      fill: rgba(255,255,255,0.7);
    }
    .profile-avatar.editable { cursor: pointer; }
    .profile-avatar.editable:hover .profile-avatar-overlay { opacity: 1; }

    .profile-name-row {
      display: flex;
      align-items: center;
      gap: 0;
      line-height: 28px;
    }
    .profile-display-name {
      font-size: 20px;
      font-weight: bold;
      color: ${PHOSPHOR};
      line-height: 28px;
      cursor: default;
    }
    .profile-name-row .profile-hover-edit {
      opacity: 0;
      transition: opacity 0.15s;
      margin-left: 6px;
      flex-shrink: 0;
    }
    .profile-name-row:hover .profile-hover-edit { opacity: 1; }
    .profile-hover-edit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      border: none;
      background: none;
      cursor: pointer;
      color: rgba(255,255,255,0.3);
      padding: 0;
      transition: color 0.15s;
    }
    .profile-hover-edit:hover { color: rgba(255,255,255,0.7); }
    .profile-hover-edit svg { width: 14px; height: 14px; fill: currentColor; }
    .profile-display-name-input {
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 20px;
      font-weight: bold;
      color: ${PHOSPHOR};
      padding: 0 0 2px 0;
      width: 200px;
      line-height: 28px;
    }
    .profile-username-row {
      display: flex;
      align-items: center;
      gap: 0;
      height: 20px;
    }
    .profile-username-row .profile-hover-edit {
      opacity: 0;
      transition: opacity 0.15s;
      margin-left: 2px;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }
    .profile-username-row .profile-hover-edit svg { width: 10px; height: 10px; }
    .profile-username-row:hover .profile-hover-edit { opacity: 1; }
    .profile-username-row .version-badge {
      margin-left: 4px;
    }
    .profile-username {
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      cursor: default;
    }
    .profile-username.editable { cursor: text; }
    .profile-username-input {
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      background: none;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      outline: none;
      font-family: inherit;
      padding: 0;
      width: 100%;
    }

    .profile-card .repo-nav-row {
      margin-top: 8px;
    }
    .profile-names {
      width: 100%;
      margin-top: 16px;
    }
    .profile-names-header {
      font-size: 12px;
      color: rgba(255,255,255,0.3);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .profile-name-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 0;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      position: relative;
    }
    .profile-name-drag {
      flex: 0 0 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      color: rgba(255,255,255,0.15);
      opacity: 0;
      transition: opacity 0.15s;
      font-size: 11px;
      user-select: none;
      -webkit-user-select: none;
    }
    .profile-name-item:hover .profile-name-drag { opacity: 1; }
    .profile-name-drag:active { cursor: grabbing; }
    .profile-name-drag svg { width: 10px; height: 14px; fill: currentColor; }
    .profile-name-item.dragging {
      opacity: 0.4;
    }
    .profile-name-item.drag-over-top {
      box-shadow: 0 -1px 0 0 rgba(255,255,255,0.3);
    }
    .profile-name-item.drag-over-bottom {
      box-shadow: 0 1px 0 0 rgba(255,255,255,0.3);
    }
    .profile-name-icon {
      flex: 0 0 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 20px;
    }
    .profile-name-icon svg {
      width: 16px;
      height: 16px;
      fill: rgba(255,255,255,0.5);
    }
    .profile-name-platform {
      color: rgba(255,255,255,0.35);
      font-size: 13px;
    }
    .profile-name-value {
      color: rgba(255,255,255,0.7);
    }
    .profile-name-value a {
      color: #7db8e0;
      text-decoration: none;
    }
    .profile-name-value a:hover { text-decoration: underline; }

    .profile-name-remove {
      margin-left: auto;
      background: none;
      border: none;
      color: rgba(255,255,255,0.2);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .profile-name-item:hover .profile-name-remove { opacity: 1; }
    .profile-name-remove:hover { color: #f87171; }

    .profile-name-field {
      background: transparent;
      border: none;
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.35);
      padding: 0;
      width: 90px;
      caret-color: rgba(255,255,255,0.5);
    }
    .profile-name-field:focus {
      color: rgba(255,255,255,0.6);
    }
    .profile-name-field-value {
      background: transparent;
      border: none;
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      padding: 0;
      width: 120px;
      caret-color: ${PHOSPHOR};
    }
    .profile-name-field-value:focus {
      color: rgba(255,255,255,0.9);
    }
    .profile-name-field-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .profile-name-field-ghost {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.15);
      white-space: pre;
      line-height: normal;
    }

    .profile-name-item.mode-email [data-name-value-wrap] { display: none; }
    .profile-name-item.mode-world [data-name-platform-wrap],
    .profile-name-item.mode-email [data-name-platform-wrap] { flex: 1; }
    .profile-name-item.mode-world .profile-name-field,
    .profile-name-item.mode-email .profile-name-field { width: 100%; }

    .profile-name-item {
      flex-wrap: wrap;
    }
    .profile-name-value {
      min-width: 0;
      word-break: break-word;
    }
    .profile-name-field-wrap {
      min-width: 0;
    }

    /* World path display — multi-line with indent */
    .profile-name-world-path {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .profile-name-path-line {
      line-height: 1.4;
      white-space: nowrap;
    }
    .profile-name-path-line a {
      color: #7db8e0;
      text-decoration: none;
    }
    .profile-name-path-line a:hover { text-decoration: underline; }

    /* Autocomplete dropdown — inline, flows below like paragraph continuation */
    .profile-name-dropdown {
      flex-basis: 100%;
      order: 99;
      display: none;
      margin-top: 2px;
    }
    .profile-name-dropdown.active { display: block; }
    .profile-name-dropdown-item {
      padding: 1px 0;
      font-size: 13px;
      font-family: 'Courier New', Courier, monospace;
      color: rgba(255,255,255,0.25);
      cursor: pointer;
      white-space: nowrap;
    }
    .profile-name-dropdown-item.selected {
      color: rgba(255,255,255,0.6);
    }
    .profile-name-dropdown-item:hover {
      color: rgba(255,255,255,0.5);
    }

    @media (max-width: 700px) {
      .profile-layout {
        flex-direction: column-reverse;
      }
      .profile-card {
        flex: none;
        width: 100%;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

// ---- Helpers ----

// Shared tooltip element on document.body — escapes all stacking contexts
let accessTooltipEl: HTMLElement | null = null;
let accessTooltipBadge: Element | null = null;
let accessTooltipEditing = false;
let accessGroupContext = '';  // e.g. "@ether" or "#genesis" — set per render

const ACCESS_TOOLTIP_DATA: Record<string, { label: string; color: string; desc: string }> = {
  public:   { label: '@public', color: 'rgba(255,255,255,0.5)', desc: 'Visible to everyone' },
  local:    { label: '@local', color: '#f87171', desc: 'Only on your local machine' },
  private:  { label: '@private', color: '#fb923c', desc: 'Any machine hosting your character, includes <a class="access-tooltip-link" data-access-link href="/@ether">@ether</a>' },
  npc:      { label: '@npc', color: 'rgba(255,255,255,0.5)', desc: 'Only visible to NPCs' },
  player:   { label: '@player', color: 'rgba(255,255,255,0.5)', desc: 'Only visible to players' },
  everyone: { label: '', color: '#fb923c', desc: '' },  // dynamic — built in showAccessTooltip
};

function resolveAccessLevel(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === '@local' || v === 'local') return 'local';
  if (v === '@public' || v === 'public') return 'public';
  if (v === '@private' || v === 'private') return 'private';
  if (v === '@npc' || v === 'npc') return 'npc';
  if (v === '@player' || v === 'player') return 'player';
  if (v.endsWith('.@everyone') || v === '@everyone') return 'everyone';
  return 'everyone';  // arbitrary group references use group icon
}

function accessValueForLevel(level: string): string {
  switch (level) {
    case 'local': return '@local';
    case 'private': return '@private';
    case 'npc': return '@npc';
    case 'player': return '@player';
    case 'everyone': return (accessGroupContext || '@public') + '.@everyone';
    default: return '@public';
  }
}

function colorForLevel(level: string): string {
  return (ACCESS_TOOLTIP_DATA[level] || ACCESS_TOOLTIP_DATA.public).color;
}

function ensureAccessTooltip(): HTMLElement {
  if (!accessTooltipEl) {
    accessTooltipEl = document.createElement('div');
    accessTooltipEl.className = 'access-tooltip';
    document.body.appendChild(accessTooltipEl);
    // Link clicks inside the tooltip navigate via SPA router
    accessTooltipEl.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('[data-access-link]') as HTMLAnchorElement | null;
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        hideAccessTooltip();
        const href = link.getAttribute('href');
        if (href && navigateFn) navigateFn(href);
      }
    });
  }
  return accessTooltipEl;
}

function positionTooltip(badge: Element): void {
  const tip = ensureAccessTooltip();
  const rect = badge.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let top = rect.top - tipRect.height - 6;
  let left = rect.right - 4;
  if (left + tipRect.width > window.innerWidth - 8) {
    left = rect.left - tipRect.width + 4;
  }
  if (left < 8) left = 8;
  if (top < 8) top = rect.bottom + 6;
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}

function showAccessTooltipDisplay(badge: Element): void {
  if (accessTooltipEditing) return;
  const level = (badge as HTMLElement).dataset.access || 'public';
  const customValue = (badge as HTMLElement).dataset.accessValue;
  const data = ACCESS_TOOLTIP_DATA[level] || ACCESS_TOOLTIP_DATA.public;
  const tip = ensureAccessTooltip();
  let label: string;
  let desc: string;
  if (customValue) {
    label = customValue;
    desc = 'Custom access group';
  } else if (level === 'everyone') {
    const ctx = accessGroupContext || '@public';
    label = ctx + '.@everyone';
    desc = 'Everyone in ' + ctx;
  } else {
    label = data.label;
    desc = data.desc;
  }
  tip.innerHTML = `<span class="access-tooltip-label" style="color:${data.color}">${label}</span> <span class="access-tooltip-desc">${desc}</span>`;
  tip.classList.add('visible');
  accessTooltipBadge = badge;
  positionTooltip(badge);
}

function showAccessTooltipEdit(badge: Element): void {
  const badgeEl = badge as HTMLElement;
  const level = badgeEl.dataset.access || 'public';
  const currentValue = badgeEl.dataset.accessValue || accessValueForLevel(level);
  const color = colorForLevel(level);
  const tip = ensureAccessTooltip();
  accessTooltipEditing = true;
  accessTooltipBadge = badge;

  tip.innerHTML = `<input class="access-tooltip-input" style="color:${color}" value="" />`;
  tip.classList.add('visible');
  const input = tip.querySelector('input')!;
  input.value = currentValue;
  positionTooltip(badge);
  input.focus();
  input.select();

  function commit() {
    if (!accessTooltipEditing) return;
    const raw = input.value.trim();
    if (raw) {
      const newLevel = resolveAccessLevel(raw);
      const newColor = colorForLevel(newLevel);
      badgeEl.dataset.access = newLevel;
      // Store custom value for non-standard entries; clear for standard ones
      const standard = accessValueForLevel(newLevel);
      if (raw.toLowerCase() === standard.toLowerCase()) {
        delete badgeEl.dataset.accessValue;
      } else {
        badgeEl.dataset.accessValue = raw;
      }
      // Swap SVG icon
      const svgEl = badgeEl.querySelector('svg');
      if (svgEl) {
        const tmp = document.createElement('span');
        tmp.innerHTML = accessSvg(newLevel);
        const newSvg = tmp.querySelector('svg');
        if (newSvg) badgeEl.replaceChild(newSvg, svgEl);
      }
      input.style.color = newColor;
    }
    hideAccessTooltip();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); hideAccessTooltip(); }
  });
  input.addEventListener('blur', () => {
    // Small delay so click-outside dismiss doesn't race
    setTimeout(commit, 100);
  });
}

function hideAccessTooltip(): void {
  accessTooltipEditing = false;
  if (accessTooltipEl) accessTooltipEl.classList.remove('visible');
  accessTooltipBadge = null;
}

function bindAccessBadges(root: HTMLElement): void {
  root.querySelectorAll('.access-badge').forEach(badge => {
    // Desktop hover — display mode only
    badge.addEventListener('mouseenter', () => {
      if (!accessTooltipEditing) showAccessTooltipDisplay(badge);
    });
    badge.addEventListener('mouseleave', () => {
      if (!accessTooltipEditing) hideAccessTooltip();
    });
    // Click — enter edit mode
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (accessTooltipEditing && accessTooltipBadge === badge) return;  // already editing this one
      hideAccessTooltip();
      showAccessTooltipEdit(badge);
    });
  });
}

// Dismiss tooltip on outside click (unless clicking inside the tooltip itself)
document.addEventListener('click', (e) => {
  if (accessTooltipEl && accessTooltipEl.contains(e.target as Node)) return;
  hideAccessTooltip();
});

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

  // Access badge tooltips — tap to toggle on mobile, link clicks navigate
  bindAccessBadges(currentContainer);

  // Star toggle (sync all copies)
  const starBtns = currentContainer.querySelectorAll('[data-star-toggle]') as NodeListOf<HTMLButtonElement>;
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.starPath!;
      const nowStarred = toggleStar(path);
      const count = getStarCount(path) + (nowStarred ? 1 : -1);
      setStarCount(path, count);
      const cls = nowStarred ? 'action-btn star-btn starred' : 'action-btn star-btn';
      const inner = `<span class="action-count" data-star-count>${Math.max(0, count)}</span><span class="action-icon">${nowStarred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</span><span class="action-label">${nowStarred ? 'Starred' : 'Star'}</span>`;
      starBtns.forEach(b => { b.className = cls; b.innerHTML = inner; });
    });
  });

  // Follow toggle (sync all copies)
  const followBtns = currentContainer.querySelectorAll('[data-follow-toggle]') as NodeListOf<HTMLButtonElement>;
  followBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const user = btn.dataset.followUser!;
      const nowFollowing = toggleFollow(user);
      const count = getFollowerCount(user) + (nowFollowing ? 1 : -1);
      setFollowerCount(user, count);
      const cls = nowFollowing ? 'action-btn follow-btn following' : 'action-btn follow-btn';
      const label = nowFollowing ? 'Following' : 'Follow';
      const inner = `<span class="action-count" data-follower-count>${Math.max(0, count)}</span><span class="action-icon">${nowFollowing ? FOLLOWING_SVG : FOLLOW_SVG}</span><span class="action-label">${label}</span>`;
      followBtns.forEach(b => { b.className = cls; b.innerHTML = inner; });
    });
  });

  // Clone popup — each toggle button opens the popup within its own actions container.
  // On mobile nav-actions is visible (breadcrumb-actions is hidden), so each needs its own binding.
  currentContainer.querySelectorAll('[data-clone-toggle]').forEach(toggle => {
    const actionsParent = toggle.closest('.nav-actions, .breadcrumb-actions, .repo-breadcrumb');
    if (!actionsParent) return;
    const popup = actionsParent.querySelector('[data-clone-popup]') as HTMLElement | null;
    const backdrop = actionsParent.querySelector('[data-clone-backdrop]') as HTMLElement | null;
    if (!popup || !backdrop) return;
    const close = () => { popup.classList.remove('open'); backdrop.classList.remove('open'); };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = popup.classList.toggle('open');
      backdrop.classList.toggle('open', open);
    });
    backdrop.addEventListener('click', close);
  });

  // README tab switching
  currentContainer.querySelectorAll('[data-readme-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = (tab as HTMLElement).dataset.readmeTab!;
      // Deactivate all tabs
      currentContainer!.querySelectorAll('[data-readme-tab]').forEach(t => t.classList.remove('active'));
      // Hide all bodies
      currentContainer!.querySelectorAll('[data-readme-body]').forEach(b => b.classList.add('hidden'));
      // Activate clicked tab and show its content
      tab.classList.add('active');
      const body = currentContainer!.querySelector(`[data-readme-body="${idx}"]`);
      if (body) body.classList.remove('hidden');
    });
  });

  // Sidebar directory toggle (expand/collapse)
  currentContainer.querySelectorAll('[data-sidebar-toggle]').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const dirEl = toggle.closest('.sidebar-dir')!;
      const children = dirEl.querySelector(':scope > .sidebar-dir-children');
      if (!children) {
        // No children to toggle — navigate to the directory instead
        const href = (toggle as HTMLElement).dataset.sidebarHref;
        if (href && navigateFn) navigateFn(href);
        return;
      }
      const isExpanded = !children.classList.contains('hidden');
      children.classList.toggle('hidden');
      const arrow = toggle.querySelector('.sidebar-arrow');
      if (arrow) arrow.textContent = isExpanded ? '▸' : '▾';
      const key = (toggle as HTMLElement).dataset.sidebarKey;
      if (key) {
        if (isExpanded) sidebarExpanded.delete(key); else sidebarExpanded.add(key);
        const u = getCurrentPlayer();
        saveSidebarExpanded(u);
      }
    });
  });

  // File-with-children arrow toggle (expand/collapse without navigating)
  currentContainer.querySelectorAll('[data-sidebar-toggle-arrow]').forEach(arrow => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const dirEl = arrow.closest('.sidebar-dir')!;
      const children = dirEl.querySelector(':scope > .sidebar-dir-children');
      if (!children) return;
      const isExpanded = !children.classList.contains('hidden');
      children.classList.toggle('hidden');
      arrow.textContent = isExpanded ? '▸' : '▾';
      const key = (arrow as HTMLElement).dataset.sidebarKey;
      if (key) {
        if (isExpanded) sidebarExpanded.delete(key); else sidebarExpanded.add(key);
        const u = getCurrentPlayer();
        saveSidebarExpanded(u);
      }
    });
  });

  // File viewer tab switching
  currentContainer.querySelectorAll('[data-file-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = (tab as HTMLElement).dataset.fileTab!;
      // Deactivate all tabs
      currentContainer!.querySelectorAll('[data-file-tab]').forEach(t => t.classList.remove('active'));
      // Hide all bodies
      currentContainer!.querySelectorAll('[data-file-body]').forEach(b => b.classList.add('hidden'));
      // Activate clicked tab and show its body
      tab.classList.add('active');
      const body = currentContainer!.querySelector(`[data-file-body="${idx}"]`);
      if (body) body.classList.remove('hidden');
      // Re-init virtual scroll for the now-visible tab
      const scrollEl = body?.querySelector('[data-virtual-scroll]') as HTMLElement | null;
      if (scrollEl) {
        // Parse files from the DOM won't work — we need to re-trigger initVirtualScroll
        // Dispatch a scroll event to force re-render of virtual lines
        scrollEl.dispatchEvent(new Event('scroll'));
      }
    });
  });

  currentContainer.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = (btn as HTMLElement).dataset.copy!;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      });
    });
  });

  // PR button navigation
  currentContainer.querySelectorAll('[data-pr-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!navigateFn || !currentRepoParams) return;
      const base = currentRepoParams.base || '';
      const cleanPath = currentRepoParams.path.filter(s => s !== '*' && s !== '**');
      const pathPart = cleanPath.length > 0 ? '/' + cleanPath.join('/') : '';
      navigateFn(`${base}${pathPart}/-/pulls`);
    });
  });

  // Settings button navigation → navigate to .ether/Usage.ray
  currentContainer.querySelectorAll('[data-settings-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!navigateFn || !currentRepoParams) return;
      const base = currentRepoParams.base || '';
      const cleanPath = currentRepoParams.path.filter(s => s !== '*' && s !== '**');
      const pathPart = cleanPath.length > 0 ? '/' + cleanPath.join('/') : '';
      navigateFn(`${base}${pathPart}/.ether/Usage.ray`);
    });
  });
}

// ---- Path Helpers ----

/** Build a URL path, inserting ~/version markers at the correct depths.
 *  Only includes markers whose depth <= target path length. */
/** Encode a single path segment for safe use in a URL (handles #, %, ?, etc.). */
function encodeSegment(seg: string): string {
  return encodeURIComponent(seg);
}

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

// ---- Display name helper ----
// parentContext: null = normal, '@' = inside @{: String}, '~' = inside #{: String}
type ParentContext = '@' | '~' | null;

// Segments that have special routing meaning and need escaping.
// We use '!' as an escape prefix: @annotations → !@annotations in the URL.
// This prevents Router.ts from interpreting it as a user-switch/world-switch/etc.
// (Backslash doesn't work — browsers convert \ to / in URLs.
//  Percent-encoding doesn't work for - and ~ — they're unreserved per RFC 3986
//  so browsers normalize %2D→- and %7E→~ when typed in the URL bar.)
function needsPathEscaping(name: string): boolean {
  if (name.length === 0) return false;
  const ch = name[0];
  if (name === '@' || name === '~') return false; // navigation entries, not directories
  if (ch === '@' || ch === '~') return true;      // directory names starting with @/~
  if (name === '*' || name === '**' || name === '-') return true; // exact-match special
  if (ch === '!') return true;                   // escape the escape prefix itself
  return false;
}

function escapePathSegment(name: string): string {
  return needsPathEscaping(name) ? '!' + name : name;
}

function unescapePathSegment(seg: string): string {
  const stripped = (seg.length > 1 && seg[0] === '!') ? seg.slice(1) : seg;
  try { return decodeURIComponent(stripped); } catch { return stripped; }
}

function displayEntryName(name: string, parentContext: ParentContext = null): string {
  if (name === '@') return '@{: String}';
  if (name === '~') return '#{: String}';
  if (parentContext === '@') return `@${name}`;
  if (parentContext === '~') return `#${name}`;
  return name;
}

/** Build href for an entry. Children of @ get /@name, children of ~ get /~name (no extra separator). */
function buildEntryHref(basePath: string, name: string, parentContext: ParentContext = null): string {
  if (parentContext === '@') {
    // basePath ends with /@ — strip it and append /@name
    const parent = basePath.replace(/\/@$/, '');
    return parent + '/@' + encodeSegment(name);
  }
  if (parentContext === '~') {
    const parent = basePath.replace(/\/~$/, '');
    return parent + '/~' + encodeSegment(name);
  }
  // Navigation entries (@, ~) stay raw in the URL — the Router recognises them as special
  if (name === '@' || name === '~') {
    return basePath + (basePath.endsWith('/') ? '' : '/') + name;
  }
  return basePath + (basePath.endsWith('/') ? '' : '/') + encodeSegment(escapePathSegment(name));
}

// ---- Hash-relative path helper ----

function computeRelativeHash(sidebarBase: string, fullHref: string): string {
  const prefix = sidebarBase.endsWith('/') ? sidebarBase : sidebarBase + '/';
  if (fullHref.startsWith(prefix)) return fullHref.slice(prefix.length);
  return fullHref;
}

// ---- Repository File View ----

function renderFileRow(entry: FileEntry, basePath: string, compoundSize?: number, parentContext: ParentContext = null): string {
  const href = entry.isDirectory
    ? buildEntryHref(basePath, entry.name, parentContext)
    : basePath + '#' + entry.name;  // files use hash
  const displayName = displayEntryName(entry.name, parentContext);
  const countBadge = compoundSize ? ` <span class="compound-count">(${compoundSize})</span>` : '';
  return `<div class="file-row" data-href="${href}">
    <div class="file-access">${accessIcon(entry)}</div>
    <div class="file-icon">${fileOrEncryptedIcon(entry)}</div>
    <div class="file-name">${displayName}${countBadge}</div>
    <div class="file-modified">${entry.modified}</div>
  </div>`;
}

function renderCompoundEntry(compound: CompoundEntry, basePath: string): string {
  const count = flattenEntries(compound.entries).length;
  if (compound.op === '|') {
    // OR: show only the first entry with the count badge
    const first = compound.entries[0];
    if (isCompound(first)) return renderCompoundEntry(first, basePath);
    return renderFileRow(first, basePath, count);
  }
  const parts = compound.entries.map(entry => {
    if (isCompound(entry)) return renderCompoundEntry(entry, basePath);
    return renderFileRow(entry, basePath, count);
  }).join('');
  return `<div class="compound-group compound-and">${parts}</div>`;
}

function firstLeaf(entry: TreeEntry): FileEntry | null {
  if (!isCompound(entry)) return entry;
  for (const child of entry.entries) {
    const leaf = firstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function renderFileListing(entries: TreeEntry[], basePath: string): string {
  const sortKey = (entry: TreeEntry): { isDir: boolean; name: string } => {
    if (isCompound(entry)) {
      const leaf = firstLeaf(entry);
      return leaf ? { isDir: leaf.isDirectory, name: leaf.name } : { isDir: false, name: '' };
    }
    return { isDir: entry.isDirectory, name: entry.name };
  };

  const sorted = [...entries].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka.isDir !== kb.isDir) return ka.isDir ? -1 : 1;
    return ka.name.localeCompare(kb.name);
  });

  return `<div class="file-table">${sorted.map(entry => {
    if (isCompound(entry)) return renderCompoundEntry(entry, basePath);
    return renderFileRow(entry, basePath);
  }).join('')}</div>`;
}

interface BreadcrumbItem { label: string; href: string | null; }

const CLONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 512L128 512L128 288L176 288L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L352 464L352 512zM288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352C224 387.3 252.7 416 288 416z"/></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z"/></svg>`;
const GIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M280.3 222.4L201 222.4C161 211.9 70.5 214.6 70.5 297.2C70.5 327.3 85.5 348.4 105.5 358.2C80.4 381.2 68.5 392 68.5 407.4C68.5 418.4 73 428.5 86.4 434.2C72.1 447.6 64 457.3 64 475.6C64 507.7 92 526.4 165.6 526.4C236.4 526.4 277.4 500 277.4 453.2C277.4 394.5 232.2 396.7 125.8 390.2L139.2 368.6C166.5 376.2 257.9 378.6 257.9 300.7C257.9 282 250.2 269 242.9 259.6L280.3 256.8L280.3 222.3zM216.9 464.3C216.9 496.4 112 496.4 112 466.7C112 458.6 117.3 451.7 122.6 445.2C200.3 450.5 216.9 448.6 216.9 464.3zM166.1 329.7C113.3 329.7 115.6 258.5 167.3 258.5C216.8 258.5 218.1 329.7 166.1 329.7zM299.4 430.2L299.4 398.1C326.1 394.4 326.6 396.1 326.6 387.1L326.6 267.6C326.6 259.1 324.5 260.2 299.4 251.3L303.9 218.4L388.1 218.4L388.1 387.1C388.1 393.6 388.5 394.4 394.6 395.2L415.3 398L415.3 430.1L299.4 430.1zM351.9 185.9C328.7 185.9 315.3 172.5 315.3 149.3C315.3 126.1 328.7 113.5 351.9 113.5C375.5 113.5 388.9 126.1 388.9 149.3C388.9 172.5 375.5 185.9 351.9 185.9zM576 414.5C558.5 423 532.9 430.8 509.7 430.8C461.3 430.8 443 411.3 443 365.3L443 258.8C443 253.4 444 254.7 411.3 254.7L411.3 218.5C447.1 214.4 461.3 196.5 465.8 152.2L504.4 152.2C504.4 218 503.1 214 507.7 214L565 214L565 254.6L504.4 254.6L504.4 351.7C504.4 358.6 499.5 403.1 565 378.5L576 414.3z"/></svg>`;
const STAR_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 30L400 220L600 240L450 380L490 580L320 490L150 580L190 380L40 240L240 220Z"/></svg>`;
const STAR_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 30L400 220L600 240L450 380L490 580L320 490L150 580L190 380L40 240L240 220Z" fill="none" stroke="currentColor" stroke-width="30"/></svg>`;
const PR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M392 88C392 78.3 386.2 69.5 377.2 65.8C368.2 62.1 357.9 64.2 351 71L295 127C285.6 136.4 285.6 151.6 295 160.9L351 216.9C357.9 223.8 368.2 225.8 377.2 222.1C386.2 218.4 392 209.7 392 200L392 176L416 176C433.7 176 448 190.3 448 208L448 422.7C419.7 435 400 463.2 400 496C400 540.2 435.8 576 480 576C524.2 576 560 540.2 560 496C560 463.2 540.3 435 512 422.7L512 208C512 155 469 112 416 112L392 112L392 88zM136 144C136 130.7 146.7 120 160 120C173.3 120 184 130.7 184 144C184 157.3 173.3 168 160 168C146.7 168 136 157.3 136 144zM192 217.3C220.3 205 240 176.8 240 144C240 99.8 204.2 64 160 64C115.8 64 80 99.8 80 144C80 176.8 99.7 205 128 217.3L128 422.6C99.7 434.9 80 463.1 80 495.9C80 540.1 115.8 575.9 160 575.9C204.2 575.9 240 540.1 240 495.9C240 463.1 220.3 434.9 192 422.6L192 217.3zM136 496C136 482.7 146.7 472 160 472C173.3 472 184 482.7 184 496C184 509.3 173.3 520 160 520C146.7 520 136 509.3 136 496zM480 472C493.3 472 504 482.7 504 496C504 509.3 493.3 520 480 520C466.7 520 456 509.3 456 496C456 482.7 466.7 472 480 472z"/></svg>`;
const SETTINGS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/></svg>`;
const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 306.7L246.6 265.3C234.1 252.8 213.8 252.8 201.3 265.3C188.8 277.8 188.8 298.1 201.3 310.6L297.3 406.6C309.8 419.1 330.1 419.1 342.6 406.6L438.6 310.6C451.1 298.1 451.1 277.8 438.6 265.3C426.1 252.8 405.8 252.8 393.3 265.3L352 306.7L352 96zM160 384C124.7 384 96 412.7 96 448L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 448C544 412.7 515.3 384 480 384L433.1 384L376.5 440.6C345.3 471.8 294.6 471.8 263.4 440.6L206.9 384L160 384zM464 440C477.3 440 488 450.7 488 464C488 477.3 477.3 488 464 488C450.7 488 440 477.3 440 464C440 450.7 450.7 440 464 440z"/></svg>`;
const FORK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M176 168C189.3 168 200 157.3 200 144C200 130.7 189.3 120 176 120C162.7 120 152 130.7 152 144C152 157.3 162.7 168 176 168zM256 144C256 176.8 236.3 205 208 217.3L208 240C208 266.5 229.5 288 256 288L384 288C410.5 288 432 266.5 432 240L432 217.3C403.7 205 384 176.8 384 144C384 99.8 419.8 64 464 64C508.2 64 544 99.8 544 144C544 176.8 524.3 205 496 217.3L496 240C496 301.9 445.9 352 384 352L352 352L352 422.7C380.3 435 400 463.2 400 496C400 540.2 364.2 576 320 576C275.8 576 240 540.2 240 496C240 463.2 259.7 435 288 422.7L288 352L256 352C194.1 352 144 301.9 144 240L144 217.3C115.7 205 96 176.8 96 144C96 99.8 131.8 64 176 64C220.2 64 256 99.8 256 144zM464 168C477.3 168 488 157.3 488 144C488 130.7 477.3 120 464 120C450.7 120 440 130.7 440 144C440 157.3 450.7 168 464 168zM344 496C344 482.7 333.3 472 320 472C306.7 472 296 482.7 296 496C296 509.3 306.7 520 320 520C333.3 520 344 509.3 344 496z"/></svg>`;
const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/></svg>`;

async function getPrCount(canonicalPath: string): Promise<number> {
  const count = await getOpenPRCount(canonicalPath);
  if (count > 0) return count;
  // clonePath strips the @user/ prefix for root users — try with it
  if (!canonicalPath.startsWith('@') && currentRepoParams) {
    return await getOpenPRCount(`@${currentRepoParams.user}/${canonicalPath}`);
  }
  return 0;
}

function renderClonePopup(canonicalPath: string): string {
  const etherCmd = `ether clone ${canonicalPath}`;
  const gitCmd = `git clone git@ether.orbitmines.com:${canonicalPath}`;

  const slashIdx = canonicalPath.indexOf('/');
  const forkUser = `@${getCurrentPlayer()}/`;
  const forkRepoName = slashIdx >= 0 ? canonicalPath.slice(slashIdx + 1) : canonicalPath;
  const forkPlaceholder = canonicalPath.startsWith('@ether') ? canonicalPath : `@ether/${forkRepoName}`;

  return `<div class="popup" data-clone-popup>
      <div class="popup-ether-block">
        <div class="popup-ether-icon"><img src="/images/avatar/2d-square.svg" alt="Ether"></div>
        <div class="popup-ether-lines">
          <div class="popup-ether-line">
            <div class="popup-code">${etherCmd}</div>
            <button class="copy-btn" data-copy="${etherCmd}">${COPY_SVG}</button>
            <button class="popup-play-btn" title="Run">${PLAY_SVG}</button>
          </div>
          <div class="popup-ether-line">
            <span class="popup-fork-icon">${FORK_SVG}</span>
            <span class="popup-fork-prefix">${forkUser}</span>
            <input class="popup-fork-input" placeholder="${forkPlaceholder}" data-fork-rename /><span class="popup-fork-suffix">% @me</span>
          </div>
        </div>
      </div>
      <div class="popup-row" style="margin-top:12px;">
        <div class="popup-row-icon">${GIT_SVG}</div>
        <div class="popup-code">${gitCmd}</div>
        <button class="copy-btn" data-copy="${gitCmd}">${COPY_SVG}</button>
      </div>
    </div>`;
}

function renderActionButtons(canonicalPath: string, starPath: string, followUser?: string): string {
  let primaryBtn: string;
  if (followUser) {
    const followed = isFollowing(followUser);
    const followSvg = followed ? FOLLOWING_SVG : FOLLOW_SVG;
    const followCls = followed ? 'follow-btn following' : 'follow-btn';
    const followLabel = followed ? 'Following' : 'Follow';
    const followerCount = getFollowerCount(followUser);
    primaryBtn = `<button class="action-btn ${followCls}" data-follow-toggle data-follow-user="${followUser}"><span class="action-count" data-follower-count>${followerCount}</span><span class="action-icon">${followSvg}</span><span class="action-label">${followLabel}</span></button>`;
  } else {
    const starred = isStarred(starPath);
    const starSvg = starred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
    const starCls = starred ? 'star-btn starred' : 'star-btn';
    const starLabel = starred ? 'Starred' : 'Star';
    const starCount = getStarCount(starPath);
    primaryBtn = `<button class="action-btn ${starCls}" data-star-toggle data-star-path="${starPath}"><span class="action-count" data-star-count>${starCount}</span><span class="action-icon">${starSvg}</span><span class="action-label">${starLabel}</span></button>`;
  }

  return `<div class="popup-backdrop" data-clone-backdrop></div>
    <span style="margin-left:auto;"></span>
    ${primaryBtn}
    <button class="action-btn clone-btn" data-clone-toggle><span class="action-icon action-icon-default">${CLONE_SVG}</span><span class="action-icon action-icon-small">${DOWNLOAD_SVG}</span><span class="action-label">Download</span></button>
    ${renderClonePopup(canonicalPath)}`;
}

/** Build a URL path sliced to `end`, preserving any wildcards from the remainder of `fullPath`. */
function buildPathPreservingWildcards(base: string, versions: [number, string][], fullPath: string[], end: number): string {
  const sliced = fullPath.slice(0, end);
  for (const seg of fullPath.slice(end)) {
    if (seg === '*' || seg === '**') sliced.push(seg);
  }
  return buildBasePath(base, versions, sliced);
}

function buildBreadcrumbItems(
  treePath: string[],
  headerChain: { label: string; pathEnd: number }[],
  base: string, versions: [number, string][], path: string[], treePathStart: number,
  repoTree?: TreeEntry[],
): { rootLink?: { label: string; href: string }; items: BreadcrumbItem[] } {
  if (treePath.length === 0) return { items: [] };

  // Check if treePath[0] is a top-level directory in the repo tree
  const isTopDir = repoTree
    ? flattenEntries(repoTree).some(e => e.name === treePath[0] && e.isDirectory)
    : true;

  if (!isTopDir && treePath.length === 1) {
    // Top-level file — use the user/world as root link, file as item
    const parentEntry = headerChain.length >= 2
      ? headerChain[headerChain.length - 2]
      : headerChain[headerChain.length - 1];
    const rootLabel = parentEntry?.label || '';
    const rootHref = buildPathPreservingWildcards(base, versions, path, treePathStart);
    return {
      rootLink: { label: rootLabel, href: rootHref },
      items: [{ label: treePath[0], href: null }],
    };
  }

  const rootLabel = treePath[0] || headerChain[headerChain.length - 1]?.label || '';
  const rootHref = buildPathPreservingWildcards(base, versions, path, treePathStart + 1);
  const subPath = treePath.slice(1);
  const items: BreadcrumbItem[] = subPath.map((seg, i) => ({
    label: seg,
    href: i < subPath.length - 1
      ? buildPathPreservingWildcards(base, versions, path, treePathStart + 1 + i + 1)
      : null,
  }));
  return { rootLink: { label: rootLabel, href: rootHref }, items };
}

/** Modular action row: star + download + PR count + settings.
 *  Renders both the mobile nav-row and the breadcrumb bar with actions — identical to the regular page. */
async function renderActionRow(canonicalPath: string, starPath: string, followUser?: string): Promise<string> {
  const actionHtml = renderActionButtons(canonicalPath, starPath, followUser);
  const prCount = await getPrCount(canonicalPath);
  return `<div class="repo-nav-row">
    <span class="nav-actions">${actionHtml}</span>
    <button class="action-btn icon-btn" title="Pull requests" data-pr-nav data-pr-path="${canonicalPath}"><span class="action-count">${prCount}</span><span class="action-icon">${PR_SVG}</span></button>
    <button class="action-btn icon-btn" title="Settings" data-settings-nav><span class="action-icon">${SETTINGS_SVG}</span></button>
  </div>
  <div class="repo-breadcrumb">
    <span class="breadcrumb-actions">${actionHtml}</span>
  </div>`;
}

const FOLLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C213.2 64 128 149.2 128 256C128 306.4 148.8 352 182.4 384C124.8 416 80 476.8 64 544L128 544C147.2 467.2 217.6 416 304 416L336 416C417.6 416 489.6 467.2 512 544L576 544C558.4 476.8 515.2 416 457.6 384C491.2 352 512 306.4 512 256C512 149.2 426.8 64 320 64zM320 352C220.8 352 192 306.4 192 256C192 185.6 249.6 128 320 128C390.4 128 448 185.6 448 256C448 326.4 390.4 352 320 352z" fill="currentColor"/><path d="M528 192L528 128L480 128L480 192L416 192L416 240L480 240L480 304L528 304L528 240L592 240L592 192L528 192z" fill="currentColor"/></svg>`;
const FOLLOWING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C213.2 64 128 149.2 128 256C128 306.4 148.8 352 182.4 384C124.8 416 80 476.8 64 544L128 544C147.2 467.2 217.6 416 304 416L336 416C417.6 416 489.6 467.2 512 544L576 544C558.4 476.8 515.2 416 457.6 384C491.2 352 512 306.4 512 256C512 149.2 426.8 64 320 64zM320 352C220.8 352 192 306.4 192 256C192 185.6 249.6 128 320 128C390.4 128 448 185.6 448 256C448 326.4 390.4 352 320 352z" fill="currentColor"/><path d="M444 196L484 236L540 180L564 204L484 284L420 220z" fill="currentColor"/></svg>`;

async function renderBreadcrumb(displayVersion: string, items: BreadcrumbItem[], canonicalPath?: string, starPath?: string, rootLink?: { label: string; href: string }, followUser?: string): Promise<string> {
  let html = '';
  const actionHtml = canonicalPath ? renderActionButtons(canonicalPath, starPath || canonicalPath, followUser) : '';
  if (canonicalPath) {
    const prCount = await getPrCount(canonicalPath);
    html += `<div class="repo-nav-row">
      <span class="nav-actions">${actionHtml}</span>
      <button class="action-btn icon-btn" title="Pull requests" data-pr-nav data-pr-path="${canonicalPath}"><span class="action-count">${prCount}</span><span class="action-icon">${PR_SVG}</span></button>
      <button class="action-btn icon-btn" title="Settings" data-settings-nav><span class="action-icon">${SETTINGS_SVG}</span></button>
    </div>`;
  }
  html += `<div class="repo-breadcrumb">`;
  if (rootLink) {
    html += `<a href="${rootLink.href}" data-link style="color:rgba(255,255,255,0.65);text-decoration:none;">${rootLink.label}</a>`;
  }
  html += `<span class="version-badge">${displayVersion}</span>`;

  for (const item of items) {
    html += `<span class="sep">/</span>`;
    if (item.href) {
      html += `<a href="${item.href}" data-link>${item.label}</a>`;
    } else {
      html += `<span>${item.label}</span>`;
    }
  }

  if (canonicalPath) {
    html += `<span class="breadcrumb-actions">${actionHtml}</span>`;
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
      const href = buildPathPreservingWildcards(base, versions, path, item.pathEnd) || '/';
      html += `<a href="${href}" data-link class="${cls}">${item.label}</a>`;
    } else {
      html += `<span class="${cls}">${item.label}</span>`;
    }
  });
  html += `</div>`;
  return html;
}

/** Compute the star path: the first top-level directory (library) if treePath[0] is one, otherwise the user/world root. */
function buildRootStarPath(
  repository: { tree: TreeEntry[] },
  effectiveUser: string, effectiveWorld: string | null, treePath: string[],
  user: string, base: string,
): string {
  // If treePath[0] is a top-level directory in the repo tree, star that library
  if (treePath.length > 0) {
    const flat = flattenEntries(repository.tree);
    const isTopDir = flat.some(e => e.name === treePath[0] && e.isDirectory);
    if (isTopDir) {
      let p = buildCanonicalPath(effectiveUser, effectiveWorld, treePath.slice(0, 1));
      if (!base) {
        const prefix = `@${user}/`;
        if (p.startsWith(prefix)) p = p.slice(prefix.length);
      }
      return p;
    }
  }
  // Otherwise star the user/world root
  let p = buildCanonicalPath(effectiveUser, effectiveWorld, []);
  if (!base) {
    const prefix = `@${user}/`;
    if (p.startsWith(prefix)) p = p.slice(prefix.length);
  }
  return p;
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
      user: getCurrentPlayer(),
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
    } else if (data.type === 'ether:fetch') {
      fetch(data.url, data.options || {})
        .then(resp => resp.text().then(body => {
          iframe.contentWindow!.postMessage({
            type: 'ether:fetch:response',
            id: data.id,
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            body: body,
          }, '*');
        }))
        .catch(err => {
          iframe.contentWindow!.postMessage({
            type: 'ether:fetch:response',
            id: data.id,
            error: err.message || String(err),
          }, '*');
        });
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

function findReadmes(entries: TreeEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (isCompound(entry)) {
      result.push(...findReadmes(entry.entries));
    } else if (entry.name === 'README.md' && !entry.isDirectory) {
      result.push(entry);
    }
  }
  return result;
}

// ---- File Viewer ----

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderLine(lineNum: number, text: string): string {
  const display = text === '' ? ' ' : escapeHtml(text);
  return `<div class="file-line"><span class="file-line-number">${lineNum}</span><span class="file-line-text">${display}</span></div>`;
}

function renderFileViewContent(files: FileEntry[]): string {
  let html = '';

  // Tabs if multiple files (superposed)
  if (files.length > 1) {
    html += `<div class="file-view-tabs">`;
    files.forEach((f, i) => {
      const label = files.every(ff => ff.name === files[0].name)
        ? `${f.name} (${i + 1})`
        : f.name;
      const active = i === 0 ? ' active' : '';
      html += `<button class="file-view-tab${active}" data-file-tab="${i}">${label}</button>`;
    });
    html += `</div>`;
  }

  // Content pane for each file
  files.forEach((file, i) => {
    const hidden = i === 0 ? '' : ' hidden';
    html += `<div class="file-view-body${hidden}" data-file-body="${i}">`;

    if (!file.content) {
      html += `<div class="file-view-header"><span>${escapeHtml(file.name)}</span></div>`;
      html += `<div class="file-no-content">No content available</div>`;
    } else {
      // Count lines cheaply without splitting the whole string
      let lineCount = 1;
      for (let ci = 0; ci < file.content.length; ci++) {
        if (file.content.charCodeAt(ci) === 10) lineCount++;
      }
      html += `<div class="file-view-header"><span>${escapeHtml(file.name)}</span><span class="line-count">${lineCount} lines</span></div>`;

      if (lineCount <= VIRTUAL_THRESHOLD) {
        // Small file — split and render all lines directly
        const lines = file.content.split('\n');
        html += `<div class="file-view-scroll-container">`;
        html += `<div class="file-view-lines">`;
        lines.forEach((line, li) => {
          html += renderLine(li + 1, line);
        });
        html += `</div></div>`;
      } else {
        // Large file — virtual scroll (content processed incrementally in initVirtualScroll)
        const totalHeight = lineCount * LINE_HEIGHT;
        html += `<div class="file-view-scroll-container" data-virtual-scroll data-line-count="${lineCount}" data-file-index="${i}">`;
        html += `<div class="file-view-virtual-spacer" style="height:${totalHeight}px;"></div>`;
        html += `<div class="file-view-lines virtual"></div>`;
        html += `</div>`;
      }
    }

    html += `</div>`;
  });

  return html;
}

function renderSidebarTree(entries: TreeEntry[], basePath: string, expandPath: string[], depth: number, parentContext: ParentContext = null): string {
  const flat = flattenEntries(entries);
  const sorted = [...flat].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const seen = new Set<string>();
  const deduped = sorted.filter(e => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });

  const pad = 8 + depth * 16;
  let html = '';
  for (const entry of deduped) {
    const href = buildEntryHref(basePath, entry.name, parentContext);
    const name = escapeHtml(displayEntryName(entry.name, parentContext));
    // Determine context for children of this entry
    const childContext: ParentContext = entry.name === '@' ? '@' : entry.name === '~' ? '~' : null;
    if (entry.isDirectory) {
      const isOnPath = expandPath.length > 0 && expandPath[0] === entry.name;
      if (isOnPath) sidebarExpanded.add(href);
      const isExpanded = sidebarExpanded.has(href);
      const children = entry.children || [];
      html += `<div class="sidebar-dir${isExpanded ? ' expanded' : ''}">`;
      html += `<div class="sidebar-dir-header" style="padding-left:${pad}px" data-sidebar-toggle data-sidebar-href="${href}" data-sidebar-key="${href}">`;
      html += `<span class="sidebar-arrow">${isExpanded ? '▾' : '▸'}</span>`;
      html += accessIcon(entry);
      html += fileOrEncryptedIcon({ name: entry.name, isDirectory: true, encrypted: entry.encrypted });
      html += `<span>${name}</span>`;
      html += `</div>`;
      if (children.length > 0) {
        html += `<div class="sidebar-dir-children${isExpanded ? '' : ' hidden'}">`;
        html += renderSidebarTree(children, href, isOnPath ? expandPath.slice(1) : [], depth + 1, childContext);
        html += `</div>`;
      }
      html += `</div>`;
    } else {
      const isOnPath = expandPath.length > 0 && expandPath[0] === entry.name;
      const isActive = isOnPath && expandPath.length === 1;
      const fileChildren = entry.children || [];
      if (fileChildren.length > 0) {
        // File with children — expandable like a directory, but navigates as a file
        if (isOnPath) sidebarExpanded.add(href);
        const isExpanded = sidebarExpanded.has(href);
        html += `<div class="sidebar-dir${isExpanded ? ' expanded' : ''}">`;
        html += `<div class="file-view-sidebar-entry${isActive ? ' active' : ''}" style="padding-left:${pad}px" data-href="${href}">`;
        html += `<span class="sidebar-arrow" data-sidebar-toggle-arrow data-sidebar-key="${href}">${isExpanded ? '▾' : '▸'}</span>`;
        html += accessIcon(entry);
        html += fileOrEncryptedIcon(entry);
        html += `<span>${name}</span>`;
        html += `</div>`;
        html += `<div class="sidebar-dir-children${isExpanded ? '' : ' hidden'}">`;
        html += renderSidebarTree(fileChildren, href, isOnPath ? expandPath.slice(1) : [], depth + 1, childContext);
        html += `</div>`;
        html += `</div>`;
      } else {
        html += `<div class="file-view-sidebar-entry${isActive ? ' active' : ''}" style="padding-left:${pad}px" data-href="${href}">`;
        html += `<span class="sidebar-arrow-spacer"></span>`;
        html += accessIcon(entry);
        html += fileOrEncryptedIcon(entry);
        html += `<span>${name}</span>`;
        html += `</div>`;
      }
    }
  }
  return html;
}

function initVirtualScroll(container: HTMLElement, files: FileEntry[]): void {
  if (virtualScrollCleanup) { virtualScrollCleanup(); virtualScrollCleanup = null; }

  const scrollContainers = container.querySelectorAll<HTMLElement>('[data-virtual-scroll]');
  if (scrollContainers.length === 0) return;

  const cleanups: (() => void)[] = [];

  scrollContainers.forEach(scrollEl => {
    const lineCount = parseInt(scrollEl.dataset.lineCount || '0', 10);
    const fileIdx = parseInt(scrollEl.dataset.fileIndex || '0', 10);
    const file = files[fileIdx];
    if (!file || !file.content) return;

    const content = file.content;
    const linesContainer = scrollEl.querySelector('.file-view-lines') as HTMLElement;
    if (!linesContainer) return;

    // Line offset index: offsets[i] = char index where line i starts.
    // Built incrementally — first batch sync, rest in RAF chunks.
    const offsets: number[] = [0];
    let indexPos = 0;
    let indexComplete = false;
    let cancelled = false;

    // Index enough lines for the initial viewport + buffer synchronously
    const INITIAL_INDEX = BUFFER_LINES * 2 + 100;
    for (let n = 0; n < INITIAL_INDEX && indexPos < content.length; n++) {
      const nl = content.indexOf('\n', indexPos);
      if (nl === -1) { indexPos = content.length; break; }
      offsets.push(nl + 1);
      indexPos = nl + 1;
    }

    if (indexPos >= content.length) {
      indexComplete = true;
    } else {
      // Continue building the index in background RAF chunks (~8ms budget each)
      const buildChunk = () => {
        if (cancelled) return;
        const deadline = performance.now() + 8;
        while (indexPos < content.length && performance.now() < deadline) {
          const nl = content.indexOf('\n', indexPos);
          if (nl === -1) { indexPos = content.length; break; }
          offsets.push(nl + 1);
          indexPos = nl + 1;
        }
        if (indexPos >= content.length) {
          indexComplete = true;
        } else {
          requestAnimationFrame(buildChunk);
        }
      };
      requestAnimationFrame(buildChunk);
    }

    function getLine(i: number): string {
      if (i < 0 || i >= offsets.length) return '';
      const start = offsets[i];
      const end = i + 1 < offsets.length ? offsets[i + 1] - 1 : content.length;
      return content.substring(start, end);
    }

    let ticking = false;
    let lastScrollParent: HTMLElement | null = null;

    // Find nearest scrollable ancestor (overflow-y: auto/scroll)
    function findScrollParent(el: HTMLElement): HTMLElement | null {
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        const { overflowY } = getComputedStyle(p);
        if (overflowY === 'auto' || overflowY === 'scroll') return p;
        p = p.parentElement;
      }
      return null;
    }

    const updateVisibleLines = () => {
      const rect = scrollEl.getBoundingClientRect();
      // Detect scroll context: if inside an overflow-y container, use its bounds
      const sp = findScrollParent(scrollEl);

      // Re-attach direct scroll listener if scroll parent changed (e.g. after rearrangement)
      if (sp !== lastScrollParent) {
        if (lastScrollParent) lastScrollParent.removeEventListener('scroll', scheduleUpdate);
        if (sp) sp.addEventListener('scroll', scheduleUpdate, { passive: true });
        lastScrollParent = sp;
      }

      let scrollTop: number;
      let viewHeight: number;
      if (sp) {
        const spRect = sp.getBoundingClientRect();
        scrollTop = Math.max(0, spRect.top - rect.top);
        viewHeight = sp.clientHeight;
      } else {
        scrollTop = Math.max(0, -rect.top);
        viewHeight = window.innerHeight;
      }

      const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - BUFFER_LINES);
      const maxLine = indexComplete ? lineCount : offsets.length;
      const endLine = Math.min(maxLine, Math.ceil((scrollTop + viewHeight) / LINE_HEIGHT) + BUFFER_LINES);

      let html = '';
      for (let i = startLine; i < endLine; i++) {
        html += renderLine(i + 1, getLine(i));
      }

      linesContainer.style.top = `${startLine * LINE_HEIGHT}px`;
      linesContainer.innerHTML = html;
    };

    const scheduleUpdate = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          updateVisibleLines();
          ticking = false;
        });
      }
    };

    // Listen to page scroll (always needed for last/unconstrained panels)
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    // Also attach to current scroll parent if inside an overflow container
    const initialSP = findScrollParent(scrollEl);
    if (initialSP) {
      initialSP.addEventListener('scroll', scheduleUpdate, { passive: true });
      lastScrollParent = initialSP;
    }
    // Render the initial viewport immediately
    updateVisibleLines();

    cleanups.push(() => {
      cancelled = true;
      window.removeEventListener('scroll', scheduleUpdate);
      if (lastScrollParent) lastScrollParent.removeEventListener('scroll', scheduleUpdate);
    });
  });

  virtualScrollCleanup = () => {
    cleanups.forEach(fn => fn());
  };
}

// ---- Profile Page Helpers ----

interface ProfileSocial {
  platform: string;
  username: string;
}

interface ProfileData {
  displayName: string;
  socials: ProfileSocial[];
}

function loadProfile(user: string): ProfileData {
  try {
    const raw = localStorage.getItem(`ether:profile:${user}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { displayName: '', socials: [] };
}

function saveProfile(user: string, data: ProfileData): void {
  localStorage.setItem(`ether:profile:${user}`, JSON.stringify(data));
}

const SOCIAL_PLATFORMS: { id: string; label: string; svg: string; urlPrefix?: string }[] = [
  { id: 'github', label: 'GitHub', urlPrefix: 'https://github.com/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>` },
  { id: 'twitter', label: 'Twitter/X', urlPrefix: 'https://x.com/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
  { id: 'discord', label: 'Discord', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>` },
  { id: 'youtube', label: 'YouTube', urlPrefix: 'https://youtube.com/@', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
  { id: 'twitch', label: 'Twitch', urlPrefix: 'https://twitch.tv/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>` },
  { id: 'linkedin', label: 'LinkedIn', urlPrefix: 'https://linkedin.com/in/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>` },
  { id: 'instagram', label: 'Instagram', urlPrefix: 'https://instagram.com/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>` },
  { id: 'reddit', label: 'Reddit', urlPrefix: 'https://reddit.com/u/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.342.342 0 00-.461 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.206-.095z"/></svg>` },
  { id: 'mastodon', label: 'Mastodon', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 00.023-.043v-1.809a.052.052 0 00-.02-.041.053.053 0 00-.046-.01 20.282 20.282 0 01-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 01-.319-1.433.053.053 0 01.066-.054 19.648 19.648 0 004.581.536h.427c1.565 0 3.163-.09 4.694-.337C18.09 17.764 20 15.846 20 12.32v-.046c0-.09 0-3.58-.002-3.96-.002-.58.35-4.094-2.73-5zm-4.186 8.143h-2.217V8.108c0-1.065-.467-1.605-1.4-1.605-1.032 0-1.549.641-1.549 1.908v2.836H11.7V8.41c0-1.267-.517-1.908-1.549-1.908-.934 0-1.4.54-1.4 1.605v5.348H6.534V7.89c0-1.065.273-1.912.823-2.54.567-.628 1.308-.95 2.228-.95 1.065 0 1.872.409 2.405 1.228L12 5.96l.009-.332c.533-.819 1.34-1.228 2.405-1.228.92 0 1.66.322 2.228.95.55.628.823 1.475.823 2.54v5.566z"/></svg>` },
  { id: 'bluesky', label: 'Bluesky', urlPrefix: 'https://bsky.app/profile/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.6 3.494 6.216 3.065-4.593.737-8.564 2.527-3.408 7.792 5.684 5.013 7.475-.819 8.568-3.727.163-.434.244-.65.244-.476 0-.174.082.042.244.476 1.093 2.908 2.884 8.74 8.568 3.727 5.156-5.265 1.185-7.055-3.408-7.792 2.616.429 5.431-.438 6.216-3.065.246-.828.624-5.79.624-6.48 0-.687-.139-1.859-.902-2.202-.66-.3-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>` },
  { id: 'telegram', label: 'Telegram', urlPrefix: 'https://t.me/', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
  { id: 'website', label: 'Website', svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>` },
];

function getSocialUrl(platform: string, username: string): string | null {
  const p = SOCIAL_PLATFORMS.find(s => s.id === platform);
  if (!p || !p.urlPrefix) return null;
  return p.urlPrefix + username;
}

function getSocialSvg(platform: string): string {
  const p = SOCIAL_PLATFORMS.find(s => s.id === platform);
  return p ? p.svg : SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1].svg;
}

function getSocialLabel(platform: string): string {
  const p = SOCIAL_PLATFORMS.find(s => s.id === platform);
  return p ? p.label : platform;
}

const EMAIL_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
const WORLD_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;

/** Detect name entry mode: 'platform' (@...), 'world' (#...), or 'email' (anything else) */
function nameEntryMode(platform: string): 'platform' | 'world' | 'email' {
  if (platform.startsWith('#')) return 'world';
  if (!platform || platform.startsWith('@')) return 'platform';
  // Known social platform IDs are platform mode
  if (SOCIAL_PLATFORMS.some(p => p.id === platform)) return 'platform';
  // Contains @ → email address
  if (platform.includes('@')) return 'email';
  // Unknown single word → treat as custom platform
  return 'platform';
}

const DRAG_HANDLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 14"><circle cx="3" cy="2" r="1.2" fill="currentColor"/><circle cx="7" cy="2" r="1.2" fill="currentColor"/><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="3" cy="12" r="1.2" fill="currentColor"/><circle cx="7" cy="12" r="1.2" fill="currentColor"/></svg>`;

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="30" fill="rgba(255,255,255,0.06)"/>
<circle cx="32" cy="24" r="10" fill="rgba(255,255,255,0.15)"/>
<ellipse cx="32" cy="48" rx="16" ry="12" fill="rgba(255,255,255,0.15)"/>
</svg>`;

async function getProfileAvatarUrl(user: string): Promise<string | null> {
  const repo = await getRepository(user);
  if (!repo) return null;
  const names = ['2d-square.svg', '2d-square.png', '2d-square.jpeg'];
  for (const name of names) {
    if (resolveFile(repo.tree, ['avatar', name])) {
      return `/**/@${user}/avatar/${name}`;
    }
  }
  return null;
}

/** Find the best-matching platform ID for a partial input string. */
function matchPlatform(input: string): { id: string; label: string } | null {
  const val = input.toLowerCase();
  if (!val) return null;
  for (const p of SOCIAL_PLATFORMS) {
    if (p.label.toLowerCase().startsWith(val) || p.id.startsWith(val)) {
      return { id: p.id, label: p.label };
    }
  }
  return null;
}

function renderProfileNames(socials: ProfileSocial[], isOwner: boolean): string {
  if (socials.length === 0 && !isOwner) return '';
  let html = `<div class="profile-names" data-profile-names>`;
  html += `<div class="profile-names-header">Names</div>`;
  for (let i = 0; i < socials.length; i++) {
    const s = socials[i];
    html += renderNameItem(s, i, isOwner);
  }
  if (isOwner) {
    // Empty row for adding new entry
    html += renderNameItem(null, socials.length, true);
  }
  html += `</div>`;
  return html;
}

function renderNameItem(social: ProfileSocial | null, index: number, isOwner: boolean): string {
  const platform = social ? social.platform : '';
  const username = social ? social.username : '';
  const mode = nameEntryMode(platform);

  // Determine icon and display values per mode
  let svg = '';
  let displayPlatform = '';
  let displayUsername = '';

  if (mode === 'world') {
    svg = WORLD_SVG;
    displayPlatform = platform; // #worldname or #world.#nested
    displayUsername = username ? `@${username}` : '';
  } else if (mode === 'email') {
    svg = EMAIL_SVG;
    displayPlatform = platform; // full email
    displayUsername = '';
  } else {
    const platformLabel = platform ? getSocialLabel(platform) : '';
    svg = platform ? getSocialSvg(platform) : '';
    displayPlatform = platform ? `@${platformLabel}` : '';
    displayUsername = username ? `@${username}` : '';
  }

  if (!isOwner) {
    // Read-only display
    if (mode === 'world') {
      // Multi-line world path display: #genesis.@alice → indented lines
      const segments = platform.split('.');
      let pathHtml = '';
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const indent = s > 0 ? ` style="padding-left: ${s * 12}px"` : '';
        // Make @player segments linkable
        if (seg.startsWith('@')) {
          const playerName = seg.slice(1);
          pathHtml += `<span class="profile-name-path-line"${indent}><a href="/@${escapeHtml(playerName)}">${escapeHtml(seg)}</a></span>`;
        } else if (seg.startsWith('#') && s > 0) {
          // Nested world — link to parent world context
          pathHtml += `<span class="profile-name-path-line"${indent}>${escapeHtml(seg)}</span>`;
        } else {
          pathHtml += `<span class="profile-name-path-line"${indent}>${escapeHtml(seg)}</span>`;
        }
      }
      // Add username as final indented line if present
      if (username) {
        const uIndent = ` style="padding-left: ${segments.length * 12}px"`;
        pathHtml += `<span class="profile-name-path-line"${uIndent}><a href="/@${escapeHtml(username)}">@${escapeHtml(username)}</a></span>`;
      }
      return `<div class="profile-name-item" data-name-index="${index}">
        <span class="profile-name-icon">${svg}</span>
        <span class="profile-name-value profile-name-world-path">${pathHtml}</span>
      </div>`;
    }
    if (mode === 'email') {
      return `<div class="profile-name-item" data-name-index="${index}">
        <span class="profile-name-icon">${svg}</span>
        <span class="profile-name-value"><a href="mailto:${escapeHtml(platform)}">${escapeHtml(platform)}</a></span>
      </div>`;
    }
    const url = social ? getSocialUrl(social.platform, social.username) : null;
    const usernameHtml = url
      ? `<a href="${url}" target="_blank" rel="noopener">@${escapeHtml(username)}</a>`
      : `@${escapeHtml(username)}`;
    return `<div class="profile-name-item" data-name-index="${index}">
      <span class="profile-name-icon">${svg}</span>
      <span class="profile-name-platform">${escapeHtml(displayPlatform)}</span>
      <span class="profile-name-value">${usernameHtml}</span>
    </div>`;
  }

  // Editable row
  const isEmpty = !platform && !username;
  const modeClass = mode !== 'platform' && platform ? ` mode-${mode}` : '';
  const dragHandle = social
    ? `<span class="profile-name-drag" data-name-drag="${index}">${DRAG_HANDLE_SVG}</span>`
    : `<span class="profile-name-drag" style="visibility:hidden">${DRAG_HANDLE_SVG}</span>`;

  const inputValue = isEmpty ? '' : escapeHtml(displayPlatform);
  const usernameValue = displayUsername ? escapeHtml(displayUsername) : '';
  const placeholder = mode === 'world' ? '#world' : mode === 'email' ? 'email' : '@platform';

  return `<div class="profile-name-item${modeClass}" data-name-index="${index}" data-name-platform="${escapeHtml(platform)}" data-name-username="${escapeHtml(username)}">
    ${dragHandle}
    <span class="profile-name-icon" data-name-icon>${svg}</span>
    <span class="profile-name-field-wrap" data-name-platform-wrap>
      <input class="profile-name-field" data-name-platform-input value="${inputValue}" placeholder="${placeholder}" spellcheck="false" />
      <span class="profile-name-field-ghost" data-name-platform-ghost></span>
    </span>
    <span class="profile-name-field-wrap" data-name-value-wrap>
      <input class="profile-name-field-value" data-name-value-input value="${usernameValue}" placeholder="@username" spellcheck="false" />
      <span class="profile-name-field-ghost" data-name-value-ghost></span>
    </span>
    ${social ? `<button class="profile-name-remove" data-name-remove="${index}" title="Remove">&times;</button>` : ''}
    <div class="profile-name-dropdown" data-name-dropdown></div>
  </div>`;
}

async function renderProfilePage(
  effectiveUser: string,
  repository: { tree: TreeEntry[]; description: string },
  headerChain: { label: string; pathEnd: number }[],
  base: string, versions: [number, string][], path: string[],
  clonePath: string, rootStarPath: string,
): Promise<string> {
  const currentPlayer = getCurrentPlayer();
  const isOwner = effectiveUser === currentPlayer;
  const profile = loadProfile(effectiveUser);
  const displayName = profile.displayName || effectiveUser;

  // Avatar
  const avatarUrl = await getProfileAvatarUrl(effectiveUser);
  const avatarContent = avatarUrl
    ? `<img src="${avatarUrl}" alt="@${escapeHtml(effectiveUser)}">`
    : DEFAULT_AVATAR_SVG;

  // README
  const readmes = findReadmes(repository.tree);
  for (const readme of readmes) {
    if (!readme.content) {
      const apiPath = `@${effectiveUser}/${readme.name}`;
      const fetched = await getAPI().readFile(apiPath);
      if (fetched !== null) readme.content = fetched;
    }
  }
  const readmesWithContent = readmes.filter(r => r.content);

  let readmeHtml = '';
  if (readmesWithContent.length >= 1) {
    const content = renderMarkdown(readmesWithContent[0].content!);
    const resolvedContent = content.replace(/href="(?!\/|https?:|#)([^"]+)"/g, (_m, rel) =>
      `href="${buildBasePath(base, versions, [...path, ...rel.split('/').filter(Boolean)])}"`
    );
    readmeHtml = `<div class="readme-section">
      <div class="readme-header">README.md</div>
      <div class="readme-body">${resolvedContent}</div>
    </div>`;
  }

  // Build page
  const displayVersion = versions.length > 0 ? versions[versions.length - 1][1] : 'latest';
  let html = `<div class="repo-page">`;
  html += renderHeaderChain(headerChain, base, versions, path);
  html += `<div class="repo-description">${escapeHtml(repository.description)}</div>`;

  html += `<div class="profile-layout">`;

  // Left: README
  html += `<div class="profile-readme">${readmeHtml}</div>`;

  // Right: Profile card
  html += `<div class="profile-card" data-profile-card data-profile-user="${escapeHtml(effectiveUser)}">`;
  html += `<div class="profile-avatar-wrap"><div class="profile-avatar${isOwner ? ' editable' : ''}" data-profile-avatar>
    ${avatarContent}
    ${isOwner ? `<div class="profile-avatar-overlay">${EDIT_SVG}</div>` : ''}
  </div></div>`;
  html += `<div class="profile-name-row">
    <span class="profile-display-name" data-profile-name>${escapeHtml(displayName)}</span>
    ${isOwner ? `<button class="profile-hover-edit" data-profile-name-edit title="Edit name">${EDIT_SVG}</button>` : ''}
  </div>`;
  html += `<div class="profile-username-row">
    <span class="profile-username" data-profile-username>@${escapeHtml(effectiveUser)}</span>
    ${isOwner ? `<button class="profile-hover-edit" data-profile-username-edit title="Edit username">${EDIT_SVG}</button>` : ''}
    <span class="version-badge">${displayVersion}</span>
  </div>`;
  html += await renderActionRow(clonePath, rootStarPath, effectiveUser);
  html += renderProfileNames(profile.socials, isOwner);
  html += `</div>`;

  html += `</div>`; // .profile-layout
  html += `</div>`; // .repo-page
  return html;
}

function reRenderNames(card: HTMLElement, container: HTMLElement, user: string): void {
  const profile = loadProfile(user);
  const namesContainer = card.querySelector('[data-profile-names]');
  if (namesContainer) {
    namesContainer.outerHTML = renderProfileNames(profile.socials, true);
    bindProfileNameHandlers(card, container, user);
  }
}

/** Fetch autocomplete options for world path input. Supports nested paths like #world.@player */
async function fetchWorldDropdown(user: string, inputValue: string): Promise<{display: string; fullValue: string}[]> {
  if (!inputValue.startsWith('#')) return [];

  const parts = inputValue.split('.');
  const current = parts[parts.length - 1];
  const completedParts = parts.slice(0, -1);
  const prefix = completedParts.length > 0 ? completedParts.join('.') + '.' : '';

  // Find deepest world context from completed segments
  let parentWorld: string | null = null;
  for (let i = completedParts.length - 1; i >= 0; i--) {
    if (completedParts[i].startsWith('#')) {
      parentWorld = completedParts[i].slice(1);
      break;
    }
  }

  const results: {display: string; fullValue: string}[] = [];
  const isPlayerFilter = current.startsWith('@');
  const showAll = current === '' && completedParts.length > 0;
  const filter = current.replace(/^[#@]/, '').toLowerCase();

  // Show worlds (#)
  if (!isPlayerFilter || showAll) {
    const worlds = await getReferencedWorlds(user, parentWorld);
    for (const w of worlds) {
      if (!filter || w.toLowerCase().startsWith(filter)) {
        results.push({ display: `#${w}`, fullValue: `${prefix}#${w}` });
      }
    }
    // Also fetch @ether worlds if user is different
    if (user !== 'ether') {
      const etherWorlds = await getReferencedWorlds('ether', parentWorld);
      for (const w of etherWorlds) {
        if (!worlds.includes(w) && (!filter || w.toLowerCase().startsWith(filter))) {
          results.push({ display: `#${w}`, fullValue: `${prefix}#${w}` });
        }
      }
    }
  }

  // Show players (@) — only within a world context
  if (parentWorld && (isPlayerFilter || showAll)) {
    const users = await getReferencedUsers(user, parentWorld);
    for (const u of users) {
      if (!filter || u.toLowerCase().startsWith(filter)) {
        results.push({ display: `@${u}`, fullValue: `${prefix}@${u}` });
      }
    }
  }

  return results;
}

function bindProfileNameHandlers(card: HTMLElement, container: HTMLElement, user: string): void {
  // Platform field — mode-aware: @platform (autocomplete), #world (dropdown), or email
  card.querySelectorAll('[data-name-platform-input]').forEach(inputEl => {
    const input = inputEl as HTMLInputElement;
    const item = input.closest('.profile-name-item') as HTMLElement;
    if (!item) return;
    const ghostEl = item.querySelector('[data-name-platform-ghost]') as HTMLElement | null;
    const iconEl = item.querySelector('[data-name-icon]') as HTMLElement | null;
    const dropdownEl = item.querySelector('[data-name-dropdown]') as HTMLElement | null; // shared dropdown in name-item

    let currentCompletions: {display: string; fullValue: string}[] = [];
    let selectedIdx = -1;
    let completionGen = 0;

    const getMode = () => nameEntryMode(input.value);

    const updateMode = () => {
      const mode = getMode();
      item.classList.remove('mode-world', 'mode-email');
      if (mode === 'world') item.classList.add('mode-world');
      else if (mode === 'email') item.classList.add('mode-email');
    };

    const updateGhost = () => {
      if (!ghostEl) return;
      const mode = getMode();
      if (mode === 'world') return; // world ghost handled separately
      if (mode !== 'platform') { ghostEl.textContent = ''; return; }
      const val = input.value.replace(/^@/, '');
      const match = matchPlatform(val);
      if (match && val.length > 0) {
        ghostEl.innerHTML = `<span style="visibility:hidden">@${escapeHtml(val)}</span><span>${escapeHtml(match.label.slice(val.length))}</span>`;
      } else {
        ghostEl.textContent = '';
      }
    };

    const updateWorldGhost = () => {
      if (!ghostEl) return;
      const sel = selectedIdx >= 0 ? currentCompletions[selectedIdx] : currentCompletions[0];
      if (sel) {
        const typed = input.value;
        if (sel.fullValue.startsWith(typed) && sel.fullValue.length > typed.length) {
          ghostEl.innerHTML = `<span style="visibility:hidden">${escapeHtml(typed)}</span><span>${escapeHtml(sel.fullValue.slice(typed.length))}</span>`;
          return;
        }
      }
      ghostEl.textContent = '';
    };

    const renderDropdown = () => {
      if (!dropdownEl) return;
      if (currentCompletions.length === 0) {
        dropdownEl.classList.remove('active');
        dropdownEl.innerHTML = '';
        return;
      }
      // Align dropdown with the platform input's horizontal position
      const platformWrap = item.querySelector('[data-name-platform-wrap]') as HTMLElement | null;
      if (platformWrap) {
        dropdownEl.style.paddingLeft = `${platformWrap.offsetLeft}px`;
      }
      dropdownEl.classList.add('active');
      dropdownEl.innerHTML = currentCompletions.map((c, i) =>
        `<div class="profile-name-dropdown-item${i === selectedIdx ? ' selected' : ''}" data-completion-idx="${i}">${escapeHtml(c.display)}</div>`
      ).join('');
    };

    const hideDropdown = () => {
      if (dropdownEl) {
        dropdownEl.classList.remove('active');
        dropdownEl.innerHTML = '';
      }
      currentCompletions = [];
      selectedIdx = -1;
    };

    const selectCompletion = (idx: number) => {
      if (idx >= 0 && idx < currentCompletions.length) {
        input.value = currentCompletions[idx].fullValue;
        hideDropdown();
        updateMode();
        updateIcon();
        if (ghostEl) ghostEl.textContent = '';
        // After selecting a world, auto-focus the username field
        if (getMode() === 'world') {
          const usernameInput = item.querySelector('[data-name-value-input]') as HTMLInputElement | null;
          if (usernameInput) {
            usernameInput.focus();
            return;
          }
        }
        input.focus();
      }
    };

    const updateWorldCompletions = async () => {
      if (getMode() !== 'world') {
        hideDropdown();
        return;
      }
      const gen = ++completionGen;
      const results = await fetchWorldDropdown(user, input.value);
      if (gen !== completionGen) return; // stale
      currentCompletions = results;
      selectedIdx = results.length > 0 ? 0 : -1;
      renderDropdown();
      updateWorldGhost();
    };

    const updateIcon = () => {
      if (!iconEl) return;
      const mode = getMode();
      if (mode === 'world') { iconEl.innerHTML = WORLD_SVG; return; }
      if (mode === 'email') { iconEl.innerHTML = EMAIL_SVG; return; }
      const val = input.value.replace(/^@/, '');
      const match = matchPlatform(val);
      iconEl.innerHTML = match ? getSocialSvg(match.id) : '';
    };

    // Dropdown mouse interaction
    if (dropdownEl) {
      dropdownEl.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('[data-completion-idx]') as HTMLElement;
        if (target) {
          e.preventDefault(); // prevent blur
          selectCompletion(parseInt(target.dataset.completionIdx || '0', 10));
        }
      });
    }

    input.addEventListener('input', () => {
      updateMode();
      const mode = getMode();
      if (mode === 'world') {
        updateWorldCompletions();
      } else {
        hideDropdown();
        updateGhost();
      }
      updateIcon();
    });

    input.addEventListener('keydown', (e) => {
      const mode = getMode();

      // World mode — dropdown keyboard navigation
      if (mode === 'world' && currentCompletions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIdx = Math.min(selectedIdx + 1, currentCompletions.length - 1);
          renderDropdown();
          updateWorldGhost();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIdx = Math.max(selectedIdx - 1, 0);
          renderDropdown();
          updateWorldGhost();
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          if (selectedIdx >= 0) {
            e.preventDefault();
            selectCompletion(selectedIdx);
            return;
          }
        }
        if (e.key === 'Escape') {
          hideDropdown();
          if (ghostEl) ghostEl.textContent = '';
          return;
        }
      }

      // Platform mode — Tab to accept ghost completion
      if (e.key === 'Tab' && mode === 'platform') {
        const val = input.value.replace(/^@/, '');
        const match = matchPlatform(val);
        if (match && val.length > 0 && val.toLowerCase() !== match.label.toLowerCase()) {
          e.preventDefault();
          input.value = '@' + match.label;
          updateGhost();
          updateIcon();
        }
      }

      // Allow backspace to clear @ or # (enables mode switching)
      // No prevention — user can freely delete prefix to switch modes
    });

    input.addEventListener('focus', () => {
      if (!input.value) input.value = '@';
      updateMode();
      updateGhost();
      if (getMode() === 'world') updateWorldCompletions();
    });

    input.addEventListener('blur', () => {
      hideDropdown();

      const idx = parseInt(item.dataset.nameIndex || '0', 10);
      const mode = getMode();
      const rawValue = input.value.trim();

      if (mode === 'world') {
        const worldName = rawValue;
        if (!worldName || worldName === '#') { if (ghostEl) ghostEl.textContent = ''; input.value = ''; updateMode(); return; }
        // Preserve existing username — only update the platform (world path)
        const valueInput = item.querySelector('[data-name-value-input]') as HTMLInputElement | null;
        const existingUsername = valueInput ? valueInput.value.replace(/^@/, '').trim() : '';
        const profile = loadProfile(user);
        if (idx < profile.socials.length) {
          profile.socials[idx].platform = worldName;
          if (existingUsername) profile.socials[idx].username = existingUsername;
          saveProfile(user, profile);
        } else if (worldName) {
          profile.socials.push({ platform: worldName, username: existingUsername });
          saveProfile(user, profile);
          if (existingUsername) reRenderNames(card, container, user);
        }
      } else if (mode === 'email') {
        if (!rawValue) { if (ghostEl) ghostEl.textContent = ''; input.value = ''; updateMode(); return; }
        const profile = loadProfile(user);
        if (idx < profile.socials.length) {
          profile.socials[idx].platform = rawValue;
          profile.socials[idx].username = '';
          saveProfile(user, profile);
        } else {
          profile.socials.push({ platform: rawValue, username: '' });
          saveProfile(user, profile);
          reRenderNames(card, container, user);
        }
      } else {
        // Platform mode
        const rawPlatform = rawValue.replace(/^@/, '').trim();
        const valueInput = item.querySelector('[data-name-value-input]') as HTMLInputElement | null;
        const rawUsername = valueInput ? valueInput.value.replace(/^@/, '').trim() : '';

        if (!rawPlatform && !rawUsername) {
          if (ghostEl) ghostEl.textContent = '';
          input.value = '';
          return;
        }

        const match = matchPlatform(rawPlatform);
        const platformId = match ? match.id : rawPlatform.toLowerCase();

        const profile = loadProfile(user);
        if (idx < profile.socials.length) {
          profile.socials[idx].platform = platformId;
          saveProfile(user, profile);
        } else if (rawPlatform && rawUsername) {
          profile.socials.push({ platform: platformId, username: rawUsername });
          saveProfile(user, profile);
          reRenderNames(card, container, user);
        }
      }
      updateIcon();
      if (ghostEl) ghostEl.textContent = '';
    });

    // Init
    updateMode();
    updateGhost();
    updateIcon();
  });

  // Username field — with world-context autocomplete
  card.querySelectorAll('[data-name-value-input]').forEach(inputEl => {
    const input = inputEl as HTMLInputElement;
    const item = input.closest('.profile-name-item') as HTMLElement;
    if (!item) return;
    const ghostEl = item.querySelector('[data-name-value-ghost]') as HTMLElement | null;
    const dropdownEl = item.querySelector('[data-name-dropdown]') as HTMLElement | null;
    const platformInput = item.querySelector('[data-name-platform-input]') as HTMLInputElement | null;

    let userCompletions: {display: string; value: string}[] = [];
    let userSelectedIdx = -1;
    let userCompletionGen = 0;

    /** Get the deepest world name from the platform field for context */
    const getWorldContext = (): string | null => {
      if (!platformInput) return null;
      if (!nameEntryMode(platformInput.value).startsWith('w')) return null;
      const parts = platformInput.value.split('.');
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].startsWith('#') && parts[i].length > 1) return parts[i].slice(1);
      }
      return null;
    };

    const isWorldMode = () => platformInput ? nameEntryMode(platformInput.value) === 'world' : false;

    const renderUserDropdown = () => {
      if (!dropdownEl) return;
      if (userCompletions.length === 0) {
        dropdownEl.classList.remove('active');
        dropdownEl.innerHTML = '';
        return;
      }
      // Align dropdown with the username input's horizontal position
      const valueWrap = item.querySelector('[data-name-value-wrap]') as HTMLElement | null;
      if (valueWrap) {
        dropdownEl.style.paddingLeft = `${valueWrap.offsetLeft}px`;
      }
      dropdownEl.classList.add('active');
      dropdownEl.innerHTML = userCompletions.map((c, i) =>
        `<div class="profile-name-dropdown-item${i === userSelectedIdx ? ' selected' : ''}" data-ucompletion-idx="${i}">${escapeHtml(c.display)}</div>`
      ).join('');
    };

    const hideUserDropdown = () => {
      if (dropdownEl) {
        dropdownEl.classList.remove('active');
        dropdownEl.innerHTML = '';
      }
      userCompletions = [];
      userSelectedIdx = -1;
    };

    const selectUserCompletion = (idx: number) => {
      if (idx >= 0 && idx < userCompletions.length) {
        input.value = '@' + userCompletions[idx].value;
        hideUserDropdown();
        if (ghostEl) ghostEl.textContent = '';
        input.focus();
      }
    };

    const updateUserGhost = () => {
      if (!ghostEl) return;
      const sel = userSelectedIdx >= 0 ? userCompletions[userSelectedIdx] : userCompletions[0];
      if (sel) {
        const typed = input.value.replace(/^@/, '');
        if (sel.value.toLowerCase().startsWith(typed.toLowerCase()) && sel.value.length > typed.length) {
          ghostEl.innerHTML = `<span style="visibility:hidden">@${escapeHtml(typed)}</span><span>${escapeHtml(sel.value.slice(typed.length))}</span>`;
          return;
        }
      }
      ghostEl.textContent = '';
    };

    const updateUserCompletions = async () => {
      const world = getWorldContext();
      if (!world) { hideUserDropdown(); if (ghostEl) ghostEl.textContent = ''; return; }
      const gen = ++userCompletionGen;
      const filter = input.value.replace(/^@/, '').toLowerCase();
      const users = await getReferencedUsers(user, world);
      if (gen !== userCompletionGen) return;
      userCompletions = users
        .filter(u => !filter || u.toLowerCase().startsWith(filter))
        .map(u => ({ display: `@${u}`, value: u }));
      userSelectedIdx = userCompletions.length > 0 ? 0 : -1;
      renderUserDropdown();
      updateUserGhost();
    };

    // Dropdown click
    if (dropdownEl) {
      dropdownEl.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('[data-ucompletion-idx]') as HTMLElement;
        if (target) {
          e.preventDefault();
          selectUserCompletion(parseInt(target.dataset.ucompletionIdx || '0', 10));
        }
      });
    }

    input.addEventListener('input', () => {
      if (!input.value.startsWith('@') && input.value.length > 0) {
        input.value = '@' + input.value;
      }
      if (isWorldMode()) {
        updateUserCompletions();
      } else {
        hideUserDropdown();
        if (ghostEl) ghostEl.textContent = '';
      }
    });

    input.addEventListener('keydown', (e) => {
      // World mode user autocomplete navigation
      if (isWorldMode() && userCompletions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          userSelectedIdx = Math.min(userSelectedIdx + 1, userCompletions.length - 1);
          renderUserDropdown();
          updateUserGhost();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          userSelectedIdx = Math.max(userSelectedIdx - 1, 0);
          renderUserDropdown();
          updateUserGhost();
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          if (userSelectedIdx >= 0) {
            e.preventDefault();
            selectUserCompletion(userSelectedIdx);
            return;
          }
        }
        if (e.key === 'Escape') {
          hideUserDropdown();
          if (ghostEl) ghostEl.textContent = '';
          return;
        }
      }
    });

    input.addEventListener('focus', () => {
      if (!input.value) input.value = '@';
      if (isWorldMode()) updateUserCompletions();
    });

    input.addEventListener('blur', () => {
      hideUserDropdown();
      if (ghostEl) ghostEl.textContent = '';

      const idx = parseInt(item.dataset.nameIndex || '0', 10);
      const rawUsername = input.value.replace(/^@/, '').trim();
      const rawPlatform = platformInput ? platformInput.value.replace(/^@/, '').trim() : '';

      if (!rawPlatform && !rawUsername) {
        input.value = '';
        return;
      }

      const platMode = platformInput ? nameEntryMode(platformInput.value) : 'platform';
      const platformId = platMode === 'world' ? rawPlatform : (matchPlatform(rawPlatform)?.id || rawPlatform.toLowerCase());

      const profile = loadProfile(user);
      if (idx < profile.socials.length) {
        profile.socials[idx].username = rawUsername;
        saveProfile(user, profile);
      } else if (rawPlatform && rawUsername) {
        profile.socials.push({ platform: platformId, username: rawUsername });
        saveProfile(user, profile);
        reRenderNames(card, container, user);
      }
    });
  });

  // Remove buttons
  card.querySelectorAll('[data-name-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt((btn as HTMLElement).dataset.nameRemove || '0', 10);
      const profile = loadProfile(user);
      profile.socials.splice(idx, 1);
      saveProfile(user, profile);
      reRenderNames(card, container, user);
    });
  });

  // Drag-and-drop reorder
  let dragSrcIdx = -1;
  const nameItems = Array.from(card.querySelectorAll('.profile-name-item[data-name-index]')) as HTMLElement[];
  const socialsCount = loadProfile(user).socials.length;

  nameItems.forEach(item => {
    const idx = parseInt(item.dataset.nameIndex || '0', 10);
    const handle = item.querySelector('[data-name-drag]') as HTMLElement | null;
    if (!handle || idx >= socialsCount) return;

    // Make the item itself draggable when drag starts from handle
    handle.addEventListener('mousedown', () => { item.setAttribute('draggable', 'true'); });
    item.addEventListener('dragstart', (e) => {
      const ev = e as DragEvent;
      dragSrcIdx = idx;
      item.classList.add('dragging');
      ev.dataTransfer!.effectAllowed = 'move';
      ev.dataTransfer!.setData('text/plain', String(idx));
      // Use a minimal drag image so inputs don't interfere
      const ghost = item.cloneNode(true) as HTMLElement;
      ghost.style.position = 'absolute';
      ghost.style.top = '-1000px';
      document.body.appendChild(ghost);
      ev.dataTransfer!.setDragImage(ghost, 0, 0);
      requestAnimationFrame(() => ghost.remove());
    });
    item.addEventListener('dragend', () => {
      item.setAttribute('draggable', 'false');
      item.classList.remove('dragging');
      nameItems.forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
      dragSrcIdx = -1;
    });
  });

  nameItems.forEach(item => {
    const idx = parseInt(item.dataset.nameIndex || '0', 10);
    if (idx >= socialsCount) return;
    let dragOverCounter = 0;

    item.addEventListener('dragover', (e) => {
      const ev = e as DragEvent;
      if (dragSrcIdx < 0 || dragSrcIdx === idx) return;
      ev.preventDefault();
      ev.dataTransfer!.dropEffect = 'move';
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      item.classList.remove('drag-over-top', 'drag-over-bottom');
      item.classList.add(ev.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
    });

    item.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragOverCounter++;
    });

    item.addEventListener('dragleave', () => {
      dragOverCounter--;
      if (dragOverCounter <= 0) {
        dragOverCounter = 0;
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    item.addEventListener('drop', (e) => {
      const ev = e as DragEvent;
      ev.preventDefault();
      dragOverCounter = 0;
      item.classList.remove('drag-over-top', 'drag-over-bottom');
      if (dragSrcIdx < 0 || dragSrcIdx === idx) return;

      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dropBefore = ev.clientY < midY;

      const prof = loadProfile(user);
      const [moved] = prof.socials.splice(dragSrcIdx, 1);
      // Calculate insert position after removal
      let insertIdx = dropBefore ? idx : idx + 1;
      if (dragSrcIdx < insertIdx) insertIdx--;
      prof.socials.splice(insertIdx, 0, moved);
      saveProfile(user, prof);
      dragSrcIdx = -1;
      reRenderNames(card, container, user);
    });
  });
}

function bindProfileHandlers(container: HTMLElement): void {
  const card = container.querySelector('[data-profile-card]') as HTMLElement | null;
  if (!card) return;
  const user = card.dataset.profileUser || '';
  const currentPlayer = getCurrentPlayer();
  if (user !== currentPlayer) return;

  // Display name editing — click the name or the edit icon
  const editBtn = card.querySelector('[data-profile-name-edit]');
  const nameEl = card.querySelector('[data-profile-name]') as HTMLElement | null;
  if (nameEl) {
    const startEdit = () => {
      if (nameEl.querySelector('input')) return;
      const current = nameEl.textContent || '';
      const input = document.createElement('input');
      input.className = 'profile-display-name-input';
      input.value = current;
      nameEl.textContent = '';
      nameEl.appendChild(input);
      if (editBtn) (editBtn as HTMLElement).style.display = 'none';
      input.focus();
      input.select();

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const val = input.value.trim();
        const profile = loadProfile(user);
        profile.displayName = val;
        saveProfile(user, profile);
        nameEl.textContent = val || user;
        if (editBtn) (editBtn as HTMLElement).style.display = '';
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); nameEl.textContent = current; if (editBtn) (editBtn as HTMLElement).style.display = ''; }
      });
      input.addEventListener('blur', () => setTimeout(commit, 100));
    };
    nameEl.style.cursor = 'text';
    nameEl.addEventListener('click', startEdit);
    if (editBtn) editBtn.addEventListener('click', startEdit);
  }

  // Username editing — click the username or the edit icon
  const usernameEditBtn = card.querySelector('[data-profile-username-edit]');
  const usernameEl = card.querySelector('[data-profile-username]') as HTMLElement | null;
  if (usernameEl) {
    const startUsernameEdit = () => {
      if (usernameEl.querySelector('input')) return;
      const currentName = user;
      const input = document.createElement('input');
      input.className = 'profile-username-input';
      input.value = '@' + currentName;
      usernameEl.textContent = '';
      usernameEl.appendChild(input);
      if (usernameEditBtn) (usernameEditBtn as HTMLElement).style.display = 'none';
      input.focus();
      // Place cursor at end
      input.setSelectionRange(input.value.length, input.value.length);

      input.addEventListener('input', () => {
        if (!input.value.startsWith('@') && input.value.length > 0) {
          input.value = '@' + input.value;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value === '@') e.preventDefault();
      });

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const newName = input.value.replace(/^@/, '').trim();
        if (newName && newName !== currentName) {
          localStorage.setItem('ether:name', newName);
          // Migrate profile data to new username
          const profile = loadProfile(currentName);
          saveProfile(newName, profile);
          usernameEl.textContent = '@' + newName;
          if (usernameEditBtn) (usernameEditBtn as HTMLElement).style.display = '';
          // If on root (/), stay on root and re-render; otherwise navigate to new user URL
          const base = currentRepoParams?.base || '';
          if (!base) {
            renderRepo();
          } else if (navigateFn) {
            navigateFn(`/@${newName}`);
          }
        } else {
          usernameEl.textContent = '@' + currentName;
          if (usernameEditBtn) (usernameEditBtn as HTMLElement).style.display = '';
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); usernameEl.textContent = '@' + currentName; if (usernameEditBtn) (usernameEditBtn as HTMLElement).style.display = ''; }
      });
      input.addEventListener('blur', () => setTimeout(commit, 100));
    };
    usernameEl.classList.add('editable');
    usernameEl.addEventListener('click', startUsernameEdit);
    if (usernameEditBtn) usernameEditBtn.addEventListener('click', startUsernameEdit);
  }

  // Names section
  bindProfileNameHandlers(card, container, user);
}

async function renderRepo(): Promise<void> {
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  if (ideLayoutInstance) { ideLayoutInstance.unmount(); ideLayoutInstance = null; }
  currentFileViewEntries = null;
  currentFileViewBasePath = null;
  currentMakeFilePanel = null;
  if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }
  if (virtualScrollCleanup) { virtualScrollCleanup(); virtualScrollCleanup = null; }
  if (!currentContainer || !currentRepoParams) return;
  const { user, path, versions, base, hash } = currentRepoParams;

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
  const firstNonWild = path.find(s => s !== '*' && s !== '**');
  const startsWithWorld = firstNonWild !== undefined && (firstNonWild === '~' || firstNonWild.startsWith('~'));
  const headerChain: { label: string; pathEnd: number }[] =
    (base || !startsWithWorld) ? [{ label: `@${user}`, pathEnd: 0 }] : [];

  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (seg === '*' || seg === '**') {
      // Wildcard — kept in path for URL generation, skip for tree resolution
      hasWildcard = true;
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
      treePath.push(unescapePathSegment(seg));
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
  const currentPlayer = getCurrentPlayer();
  loadSidebarExpanded(currentPlayer);
  let repository = effectiveWorld
    ? await getWorld(effectiveWorldParent, effectiveWorld)
    : await getRepository(effectiveUser);
  // Virtual repository for the current player if they don't have one yet
  if (!repository && !effectiveWorld && effectiveUser === currentPlayer) {
    repository = { user: currentPlayer, description: `@${currentPlayer}`, tree: [] };
  }
  accessGroupContext = effectiveWorld ? '#' + effectiveWorld : '@' + effectiveUser;

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

  let entries: TreeEntry[];

  if (showUsersListing) {
    // Show referenced users as directory entries
    const referencedUsers = await getReferencedUsers(effectiveUser, effectiveWorld);
    // Inject current player if not already listed
    const users = referencedUsers.includes(currentPlayer)
      ? referencedUsers
      : [currentPlayer, ...referencedUsers];
    entries = users.map(u => ({
      name: u, isDirectory: true, modified: '',
    }));
  } else if (showWorldsListing) {
    // Show referenced worlds as directory entries
    entries = (await getReferencedWorlds(effectiveUser, effectiveWorld)).map(w => ({
      name: w, isDirectory: true, modified: '',
    }));
  } else {
    let resolved = treePath.length > 0
      ? resolveDirectory(repository.tree, treePath)
      : repository.tree;

    // If local tree resolution failed, try fetching the subdirectory from the API
    if (!resolved && treePath.length > 0) {
      const apiPath = effectiveWorld
        ? `@${effectiveWorldParent}/~${effectiveWorld}/${treePath.join('/')}`
        : `@${effectiveUser}/${treePath.join('/')}`;
      const fetched = await getAPI().listDirectory(apiPath);
      if (fetched.length > 0) resolved = fetched;
    }

    if (!resolved) {
      if (!hash && treePath.length > 0 && navigateFn) {
        // Backward-compat: redirect file-in-pathname to hash-based URL
        // Augment tree root with virtual entries for resolution
        let resolveTree: TreeEntry[] = repository.tree;
        const virtuals: TreeEntry[] = [];
        const refUsers = await getReferencedUsers(effectiveUser, effectiveWorld);
        if (refUsers.length > 0) {
          const userChildren: FileEntry[] = await Promise.all(
            (refUsers.includes(currentPlayer) ? refUsers : [currentPlayer, ...refUsers])
              .map(async u => {
                const repo = await getRepository(u);
                return { name: u, isDirectory: true, modified: '', children: repo ? [...repo.tree] : [] } as FileEntry;
              })
          );
          virtuals.push({ name: '@', isDirectory: true, modified: '', children: userChildren } as FileEntry);
        }
        const refWorlds = await getReferencedWorlds(effectiveUser, effectiveWorld);
        if (refWorlds.length > 0) {
          const worldChildren: FileEntry[] = await Promise.all(refWorlds.map(async w => {
            const worldRepo = await getWorld(worldParentKey, w);
            return { name: w, isDirectory: true, modified: '', children: worldRepo ? [...worldRepo.tree] : [] } as FileEntry;
          }));
          virtuals.push({ name: '~', isDirectory: true, modified: '', children: worldChildren } as FileEntry);
        }
        if (effectiveUser === currentPlayer && !effectiveWorld) {
          const stars = getStars();
          virtuals.push({ name: '.stars.list.ray', isDirectory: false, modified: '', content: stars.length > 0 ? stars.join('\n') : '' } as FileEntry);
          virtuals.push({ name: 'Session.ray.json', isDirectory: false, modified: '', content: getSessionContent(currentPlayer) } as FileEntry);
        }
        if (virtuals.length > 0) resolveTree = [...virtuals, ...repository.tree];

        const files = resolveFiles(resolveTree, treePath);
        if (files.length > 0) {
          // Find deepest directory prefix in treePath
          let dirDepth = treePath.length - 1;
          while (dirDepth > 0 && !resolveDirectory(resolveTree, treePath.slice(0, dirDepth))) {
            dirDepth--;
          }
          const dirPart = treePath.slice(0, dirDepth);
          const filePart = treePath.slice(dirDepth);
          const parentUrl = buildBasePath(base, versions, [...path.slice(0, treePathStart), ...dirPart]);
          navigateFn(parentUrl + '#' + filePart.join('/'));
          return;
        }
      }
      // 404 — directory not found
      currentContainer.innerHTML = `<div class="repo-page">
        <div class="repo-404">
          <div class="code">404</div>
          Path not found
        </div>
      </div>`;
      return;
    }

    entries = resolved;

    // At tree root, inject virtual @/~ entries if there are referenced users/worlds
    if (treePath.length === 0) {
      const virtuals: FileEntry[] = [];
      const refUsers = await getReferencedUsers(effectiveUser, effectiveWorld);
      if (refUsers.length > 0) {
        const userChildren: FileEntry[] = await Promise.all(
          (refUsers.includes(currentPlayer) ? refUsers : [currentPlayer, ...refUsers])
            .map(async u => {
              const repo = await getRepository(u);
              return { name: u, isDirectory: true, modified: '', children: repo ? [...repo.tree] : [] } as FileEntry;
            })
        );
        virtuals.push({ name: '@', isDirectory: true, modified: '', children: userChildren });
      }
      const refWorlds = await getReferencedWorlds(effectiveUser, effectiveWorld);
      if (refWorlds.length > 0) {
        const worldChildren: FileEntry[] = await Promise.all(refWorlds.map(async w => {
          const worldRepo = await getWorld(worldParentKey, w);
          return { name: w, isDirectory: true, modified: '', children: worldRepo ? [...worldRepo.tree] : [] } as FileEntry;
        }));
        virtuals.push({ name: '~', isDirectory: true, modified: '', children: worldChildren });
      }
      // Inject .stars.list.ray and Session.ray.json for the current player
      if (effectiveUser === currentPlayer && !effectiveWorld) {
        const stars = getStars();
        const starsContent = stars.length > 0 ? stars.join('\n') : '';
        virtuals.push({ name: '.stars.list.ray', isDirectory: false, modified: '', content: starsContent });
        virtuals.push({ name: 'Session.ray.json', isDirectory: false, modified: '', content: getSessionContent(currentPlayer) });
      }
      const virtualNames = new Set(virtuals.map(v => v.name));
      entries = [...virtuals, ...entries.filter(e => !virtualNames.has(e.name))];
    }
  }

  // ---- Hash-based file view ----
  if (hash) {
    const hashPath = hash.split('/').filter(Boolean);
    if (hashPath.length > 0) {
      let files = resolveFiles(entries, hashPath);
      // If local tree has no content (HttpBackend flat listing) or resolution failed, fetch from API
      const needsFetch = files.length === 0 || files.every(f => f.content === undefined);
      if (needsFetch) {
        const apiFilePath = effectiveWorld
          ? `@${effectiveWorldParent}/~${effectiveWorld}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${hashPath.join('/')}`
          : `@${effectiveUser}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${hashPath.join('/')}`;
        const content = await getAPI().readFile(apiFilePath);
        if (content !== null) {
          const name = hashPath[hashPath.length - 1];
          files = [{ name, isDirectory: false, modified: '', content }];
        }
      }
      const basePath = buildBasePath(base, versions, path);
      const displayVersion = versions.length > 0 ? versions[versions.length - 1][1] : 'latest';

      let clonePath = buildCanonicalPath(effectiveUser, effectiveWorld, [...treePath, ...hashPath]);
      if (!base) {
        const prefix = `@${user}/`;
        if (clonePath.startsWith(prefix)) clonePath = clonePath.slice(prefix.length);
      }

      const sidebarEntries = entries;
      const sidebarBasePath = basePath;
      const sidebarExpandPath = hashPath;

      let html = `<div class="repo-page file-view-mode">`;
      html += `<div class="file-view-top">`;
      html += renderHeaderChain(headerChain, base, versions, path);
      html += `<div class="repo-description">${repository.description}</div>`;

      const { rootLink, items: breadcrumbItems } = buildBreadcrumbItems(treePath, headerChain, base, versions, path, treePathStart, repository.tree);
      const rootStarPath = buildRootStarPath(repository, effectiveUser, effectiveWorld, treePath, user, base);
      html += await renderBreadcrumb(displayVersion, breadcrumbItems, clonePath, rootStarPath, rootLink, !effectiveWorld && treePath.length === 0 ? effectiveUser : undefined);
      html += `</div>`;

      html += `<div class="ide-layout-mount"></div>`;
      html += `</div>`;
      currentContainer.innerHTML = html;
      bindClickHandlers();

      // Mount IDE layout into the placeholder
      const layoutMount = currentContainer.querySelector('.ide-layout-mount') as HTMLElement;
      if (layoutMount) {
        const FOLDER_SVG = fileIcon('folder', true);
        const fileName = hashPath[hashPath.length - 1] || '';

        // Helper: create a file panel definition from resolved files
        function makeFilePanel(panelId: string, name: string, panelFiles: FileEntry[]): PanelDefinition {
          return {
            id: panelId,
            title: name || '404',
            icon: panelFiles.length > 0
              ? accessIcon(panelFiles[0]) + fileOrEncryptedIcon({ name, isDirectory: false, encrypted: panelFiles[0].encrypted })
              : '',
            closable: true,
            render: (el) => {
              if (panelFiles.length > 0) {
                el.innerHTML = `<div class="file-view-content">${renderFileViewContent(panelFiles)}</div>`;
                el.querySelectorAll('[data-file-tab]').forEach(tab => {
                  tab.addEventListener('click', () => {
                    const idx = (tab as HTMLElement).dataset.fileTab!;
                    el.querySelectorAll('[data-file-tab]').forEach(t => t.classList.remove('active'));
                    el.querySelectorAll('[data-file-body]').forEach(b => b.classList.add('hidden'));
                    tab.classList.add('active');
                    const body = el.querySelector(`[data-file-body="${idx}"]`);
                    if (body) body.classList.remove('hidden');
                    const scrollEl = body?.querySelector('[data-virtual-scroll]') as HTMLElement | null;
                    if (scrollEl) scrollEl.dispatchEvent(new Event('scroll'));
                  });
                });
                initVirtualScroll(el, panelFiles);
                return () => {
                  if (virtualScrollCleanup) { virtualScrollCleanup(); virtualScrollCleanup = null; }
                };
              } else {
                el.innerHTML = `<div class="file-view-content">
                  <div class="file-view-header"><span>${escapeHtml(name)}</span></div>
                  <div class="file-no-content"><div style="text-align:center"><div class="code" style="font-size:48px;color:rgba(255,255,255,0.12);margin-bottom:12px;">404</div><div>Path not found</div></div></div>
                </div>`;
              }
            },
          };
        }

        // Bind sidebar tree expand/collapse handlers
        function bindSidebarTreeHandlers(el: HTMLElement): void {
          el.querySelectorAll('[data-sidebar-toggle]').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const dirEl = toggle.closest('.sidebar-dir')!;
              let children = dirEl.querySelector(':scope > .sidebar-dir-children');
              if (!children) {
                // No children rendered yet — fetch from API and inject
                const href = (toggle as HTMLElement).dataset.sidebarHref;
                if (!href) return;
                const prefix = sidebarBasePath.endsWith('/') ? sidebarBasePath : sidebarBasePath + '/';
                const relPathEncoded = href.startsWith(prefix)
                  ? href.slice(prefix.length)
                  : null;
                if (relPathEncoded === null) {
                  if (navigateFn) navigateFn(href);
                  return;
                }
                // Decode relPath — href segments are URL-encoded, API paths should be decoded
                const relPath = relPathEncoded.split('/').map(s => { try { return decodeURIComponent(s); } catch { return s; } }).join('/');
                // Build API path from the sidebar href
                const apiSubPath = effectiveWorld
                  ? `@${effectiveWorldParent}/~${effectiveWorld}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${relPath}`
                  : `@${effectiveUser}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${relPath}`;
                void (async () => {
                  const fetched = await getAPI().listDirectory(apiSubPath);
                  // Create the children container (empty or populated)
                  const childrenDiv = document.createElement('div');
                  childrenDiv.className = 'sidebar-dir-children';
                  const depth = parseInt((toggle as HTMLElement).style.paddingLeft || '8', 10);
                  const childDepth = Math.round((depth - 8) / 16) + 1;
                  childrenDiv.innerHTML = fetched.length > 0
                    ? renderSidebarTree(fetched, href, [], childDepth)
                    : '';
                  dirEl.appendChild(childrenDiv);
                  // Update arrow — remove caret if empty
                  const arrow = toggle.querySelector('.sidebar-arrow');
                  if (fetched.length === 0) {
                    if (arrow) arrow.textContent = '';
                  } else {
                    if (arrow) arrow.textContent = '▾';
                  }
                  const key = (toggle as HTMLElement).dataset.sidebarKey;
                  if (key) {
                    sidebarExpanded.add(key);
                    saveSidebarExpanded(getCurrentPlayer());
                  }
                  // Bind handlers on the new children
                  bindSidebarTreeHandlers(childrenDiv);
                  bindSidebarFileHandlers(childrenDiv);
                  bindAccessBadges(childrenDiv);
                })();
                return;
              }
              const isExpanded = !children.classList.contains('hidden');
              children.classList.toggle('hidden');
              const arrow = toggle.querySelector('.sidebar-arrow');
              if (arrow) arrow.textContent = isExpanded ? '▸' : '▾';
              const key = (toggle as HTMLElement).dataset.sidebarKey;
              if (key) {
                if (isExpanded) sidebarExpanded.delete(key); else sidebarExpanded.add(key);
                const u = getCurrentPlayer();
                saveSidebarExpanded(u);
              }
            });
          });
          el.querySelectorAll('[data-sidebar-toggle-arrow]').forEach(arrow => {
            arrow.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const dirEl = arrow.closest('.sidebar-dir')!;
              const children = dirEl.querySelector(':scope > .sidebar-dir-children');
              if (!children) return;
              const isExpanded = !children.classList.contains('hidden');
              children.classList.toggle('hidden');
              arrow.textContent = isExpanded ? '▸' : '▾';
              const key = (arrow as HTMLElement).dataset.sidebarKey;
              if (key) {
                if (isExpanded) sidebarExpanded.delete(key); else sidebarExpanded.add(key);
                const u = getCurrentPlayer();
                saveSidebarExpanded(u);
              }
            });
          });
        }

        // File clicks → open as new tab (or fetch file content from API)
        function bindSidebarFileHandlers(el: HTMLElement): void {
          el.querySelectorAll('[data-href]').forEach(entry => {
            entry.addEventListener('click', (e) => {
              e.preventDefault();
              const href = (entry as HTMLElement).dataset.href!;
              if (ideLayoutInstance) {
                const prefix = sidebarBasePath.endsWith('/') ? sidebarBasePath : sidebarBasePath + '/';
                const relPath = href.startsWith(prefix)
                  ? href.slice(prefix.length).split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } }).map(unescapePathSegment)
                  : null;
                if (relPath && relPath.length > 0) {
                  // Decompose @name/~name segments into ['@','name'] / ['~','name']
                  // so resolveFiles can traverse the virtual @ and ~ tree entries
                  const fileTreePath: string[] = [];
                  for (const seg of relPath) {
                    if (seg.length > 1 && (seg.startsWith('@') || seg.startsWith('~'))) {
                      fileTreePath.push(seg[0], seg.slice(1));
                    } else {
                      fileTreePath.push(seg);
                    }
                  }
                  const resolved = resolveFiles(sidebarEntries, fileTreePath);
                  if (resolved.length > 0 && resolved.some(f => f.content !== undefined)) {
                    const relHash = relPath.map(encodeURIComponent).join('/');
                    const panelId = 'file:' + relHash;
                    const name = fileTreePath[fileTreePath.length - 1];
                    history.replaceState(null, '', location.pathname + '#' + relHash);
                    ideLayoutInstance.openPanel(makeFilePanel(panelId, name, resolved));
                    return;
                  }
                  // File not in local tree or has no content — fetch from API
                  const apiFilePath = effectiveWorld
                    ? `@${effectiveWorldParent}/~${effectiveWorld}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${relPath.join('/')}`
                    : `@${effectiveUser}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${relPath.join('/')}`;
                  void (async () => {
                    const content = await getAPI().readFile(apiFilePath);
                    if (content !== null) {
                      const name = relPath[relPath.length - 1];
                      const relHash = relPath.map(encodeURIComponent).join('/');
                      const panelId = 'file:' + relHash;
                      const fileEntry: FileEntry = { name, isDirectory: false, modified: '', content };
                      history.replaceState(null, '', location.pathname + '#' + relHash);
                      ideLayoutInstance!.openPanel(makeFilePanel(panelId, name, [fileEntry]));
                    } else if (navigateFn) {
                      navigateFn(href);
                    }
                  })();
                  return;
                }
              }
              // Fallback: full navigation (directories, unresolved paths)
              if (navigateFn) navigateFn(href);
            });
          });
        }

        const initialFilePanelId = 'file:' + hash;

        const sidebarTitle = treePath[0] || (effectiveWorld ? '#' + effectiveWorld : '@' + effectiveUser);
        const sidebarRootEntry = treePath.length > 0
          ? flattenEntries(repository.tree).find(e => e.name === treePath[0])
          : undefined;
        const sidebarPanel: PanelDefinition = {
          id: 'sidebar',
          title: sidebarTitle,
          icon: accessIcon(sidebarRootEntry || {}) + FOLDER_SVG,
          closable: false,
          sticky: true,
          render: (el) => {
            el.innerHTML = renderSidebarTree(sidebarEntries, sidebarBasePath, sidebarExpandPath, 0);
            bindSidebarFileHandlers(el);
            bindSidebarTreeHandlers(el);
            bindAccessBadges(el);
          },
        };

        const filePanel = makeFilePanel(initialFilePanelId, fileName, files);

        // Try restoring layout from session
        const currentUser = getCurrentPlayer();
        const session = loadSession(currentUser);
        let initialLayout: LayoutNode;
        const allPanels: PanelDefinition[] = [sidebarPanel, filePanel];

        if (session.ideLayout && session.ideLayoutBase === sidebarBasePath) {
          // Restore saved layout — resolve extra file panels from saved IDs
          const savedLayout = session.ideLayout as LayoutNode;
          const savedPanelIds = collectPanelIds(savedLayout);
          const validIds = new Set<string>(['sidebar', initialFilePanelId]);

          for (const pid of savedPanelIds) {
            if (pid === 'sidebar' || pid === initialFilePanelId) continue;
            if (pid.startsWith('file:')) {
              const hashRel = pid.slice(5);
              const relPath = hashRel.split('/').filter(Boolean);
              if (relPath.length > 0) {
                const resolved = resolveFiles(sidebarEntries, relPath);
                if (resolved.length > 0) {
                  const name = relPath[relPath.length - 1];
                  allPanels.push(makeFilePanel(pid, name, resolved));
                  validIds.add(pid);
                }
              }
            }
          }

          const filtered = filterLayoutPanels(savedLayout, validIds);
          if (filtered) {
            initialLayout = filtered;
            ensureIdCounter(maxIdInLayout(initialLayout));
          } else {
            const sidebarGroupId = generateId();
            const fileGroupId = generateId();
            initialLayout = {
              type: 'split', id: generateId(), direction: 'horizontal',
              children: [
                { type: 'tabgroup', id: sidebarGroupId, panels: ['sidebar'], activeIndex: 0 },
                { type: 'tabgroup', id: fileGroupId, panels: [initialFilePanelId], activeIndex: 0 },
              ],
              sizes: [0.2, 0.8],
            };
          }
        } else {
          const sidebarGroupId = generateId();
          const fileGroupId = generateId();
          initialLayout = {
            type: 'split', id: generateId(), direction: 'horizontal',
            children: [
              { type: 'tabgroup', id: sidebarGroupId, panels: ['sidebar'], activeIndex: 0 },
              { type: 'tabgroup', id: fileGroupId, panels: [initialFilePanelId], activeIndex: 0 },
            ],
            sizes: [0.2, 0.8],
          };
        }

        ideLayoutInstance = createIDELayout(layoutMount, {
          panels: allPanels,
          initialLayout,
          onNavigate: navigateFn || undefined,
          onActiveTabChange: (panelId) => {
            if (panelId.startsWith('file:')) {
              const relHash = panelId.slice(5);
              const target = location.pathname + '#' + relHash;
              if (location.pathname + location.hash !== target) {
                history.replaceState(null, '', target);
              }
            }
            saveIDESession(currentUser, sidebarBasePath);
          },
          onLayoutChange: () => {
            saveIDESession(currentUser, sidebarBasePath);
            // Re-trigger virtual scroll after layout changes (panels may have moved to new scroll context)
            requestAnimationFrame(() => window.dispatchEvent(new Event('scroll')));
          },
        });
        // Store for hash fast-path in update()
        currentFileViewEntries = sidebarEntries;
        currentFileViewBasePath = sidebarBasePath;
        currentMakeFilePanel = makeFilePanel;
      }
      return;
    }
  }

  // ---- Check for index.ray.js (sandboxed iframe mode) ----
  const flat = flattenEntries(entries);
  const indexRay = !showUsersListing && !showWorldsListing && !hasWildcard
    ? flat.find(e => e.name === 'index.ray.js' && !e.isDirectory && e.content)
    : null;

  if (indexRay) {
    if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }

    const canonicalPath = buildCanonicalPath(effectiveUser, effectiveWorld, treePath);

    // Build the header label from the chain
    const headerLabel = headerChain.map(item => item.label).join(' / ');

    // Full-viewport iframe with overlay badge in bottom-right
    const isPlayerIframe = !effectiveWorld && treePath.length === 0;
    let iframePrimaryBtn: string;
    if (isPlayerIframe) {
      const iframeFollowed = isFollowing(effectiveUser);
      const iframeFollowSvg = iframeFollowed ? FOLLOWING_SVG : FOLLOW_SVG;
      const iframeFollowCls = iframeFollowed ? 'follow-btn following' : 'follow-btn';
      const iframeFollowLabel = iframeFollowed ? 'Following' : 'Follow';
      const iframeFollowerCount = getFollowerCount(effectiveUser);
      iframePrimaryBtn = `<button class="action-btn ${iframeFollowCls}" data-follow-toggle data-follow-user="${effectiveUser}"><span class="action-count" data-follower-count>${iframeFollowerCount}</span><span class="action-icon">${iframeFollowSvg}</span><span class="action-label">${iframeFollowLabel}</span></button>`;
    } else {
      const iframeStarred = isStarred(canonicalPath);
      const iframeStarSvg = iframeStarred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
      const iframeStarCls = iframeStarred ? 'star-btn starred' : 'star-btn';
      const iframeStarLabel = iframeStarred ? 'Starred' : 'Star';
      iframePrimaryBtn = `<button class="action-btn ${iframeStarCls}" data-star-toggle data-star-path="${canonicalPath}"><span class="action-count" data-star-count>${getStarCount(canonicalPath)}</span><span class="action-icon">${iframeStarSvg}</span><span class="action-label">${iframeStarLabel}</span></button>`;
    }
    currentContainer.innerHTML = `<div class="repo-page" style="position:relative;padding:0;max-width:none;min-height:100vh;display:flex;flex-direction:column;">
      <div class="iframe-overlay">
        <span class="overlay-label">${headerLabel}</span>
        <span class="overlay-desc">${repository.description}</span>
        ${iframePrimaryBtn}
        <button class="action-btn clone-btn" data-clone-toggle><span class="action-icon action-icon-default">${CLONE_SVG}</span><span class="action-icon action-icon-small">${DOWNLOAD_SVG}</span><span class="action-label">Download</span></button>
        <div class="popup-backdrop" data-clone-backdrop></div>
        ${renderClonePopup(canonicalPath)}
      </div>
    </div>`;

    const repoPage = currentContainer.querySelector('.repo-page') as HTMLElement;
    mountIframe(repoPage, indexRay.content!, canonicalPath);

    // Wire primary button (follow or star) in iframe overlay
    const iframeFollowBtn = currentContainer.querySelector('[data-follow-toggle]') as HTMLButtonElement | null;
    if (iframeFollowBtn) {
      iframeFollowBtn.addEventListener('click', () => {
        const u = iframeFollowBtn.dataset.followUser!;
        const nowFollowing = toggleFollow(u);
        const count = getFollowerCount(u) + (nowFollowing ? 1 : -1);
        setFollowerCount(u, count);
        iframeFollowBtn.className = nowFollowing ? 'action-btn follow-btn following' : 'action-btn follow-btn';
        const label = nowFollowing ? 'Following' : 'Follow';
        iframeFollowBtn.innerHTML = `<span class="action-count" data-follower-count>${Math.max(0, count)}</span><span class="action-icon">${nowFollowing ? FOLLOWING_SVG : FOLLOW_SVG}</span><span class="action-label">${label}</span>`;
      });
    }
    const iframeStarBtn = currentContainer.querySelector('[data-star-toggle]') as HTMLButtonElement | null;
    if (iframeStarBtn) {
      iframeStarBtn.addEventListener('click', () => {
        const p = iframeStarBtn.dataset.starPath!;
        const nowStarred = toggleStar(p);
        const count = getStarCount(p) + (nowStarred ? 1 : -1);
        setStarCount(p, count);
        iframeStarBtn.className = nowStarred ? 'action-btn star-btn starred' : 'action-btn star-btn';
        iframeStarBtn.innerHTML = `<span class="action-count" data-star-count>${Math.max(0, count)}</span><span class="action-icon">${nowStarred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</span><span class="action-label">${nowStarred ? 'Starred' : 'Star'}</span>`;
      });
    }

    // Wire clone popup in iframe overlay
    const overlay = currentContainer.querySelector('.iframe-overlay');
    if (overlay) {
      const cloneToggle = overlay.querySelector('[data-clone-toggle]');
      const popup = overlay.querySelector('[data-clone-popup]') as HTMLElement | null;
      const backdrop = overlay.querySelector('[data-clone-backdrop]') as HTMLElement | null;
      if (cloneToggle && popup && backdrop) {
        const close = () => { popup.classList.remove('open'); backdrop.classList.remove('open'); };
        cloneToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = popup.classList.toggle('open');
          backdrop.classList.toggle('open', open);
        });
        backdrop.addEventListener('click', close);
      }
      // Copy buttons
      overlay.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = (btn as HTMLElement).dataset.copy!;
          navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
          });
        });
      });
    }
    return;
  }

  // ---- Profile page: user root without custom index.ray.js ----
  if (treePath.length === 0 && !hasWildcard && !showUsersListing && !showWorldsListing && !effectiveWorld && !indexRay) {
    let profileClonePath = buildCanonicalPath(effectiveUser, null, []);
    if (!base) {
      const prefix = `@${user}/`;
      if (profileClonePath.startsWith(prefix)) profileClonePath = profileClonePath.slice(prefix.length);
    }
    const profileStarPath = buildRootStarPath(repository, effectiveUser, null, [], user, base);
    const profileHtml = await renderProfilePage(
      effectiveUser, repository, headerChain, base, versions, path,
      profileClonePath, profileStarPath,
    );
    currentContainer.innerHTML = profileHtml;
    bindClickHandlers();
    bindProfileHandlers(currentContainer);
    return;
  }

  // ---- Build URLs ----
  const basePath = buildBasePath(base, versions, path);
  const displayVersion = versions.length > 0 ? versions[versions.length - 1][1] : 'latest';

  let html = `<div class="repo-page">`;

  // Compute clone/star path early so it's available for star row
  let clonePath = buildCanonicalPath(effectiveUser, effectiveWorld, treePath);
  // Strip implicit @user prefix when not explicit in URL, keep if top-level root
  if (!base) {
    const prefix = `@${user}/`;
    if (clonePath.startsWith(prefix)) {
      clonePath = clonePath.slice(prefix.length);
    }
  }

  // Header: chain of context switches, parents muted, last item bright
  html += renderHeaderChain(headerChain, base, versions, path);
  html += `<div class="repo-description">${repository.description}</div>`;

  const { rootLink, items: breadcrumbItems } = buildBreadcrumbItems(treePath, headerChain, base, versions, path, treePathStart, repository.tree);
  const rootStarPath = buildRootStarPath(repository, effectiveUser, effectiveWorld, treePath, user, base);
  html += await renderBreadcrumb(displayVersion, breadcrumbItems, clonePath, rootStarPath, rootLink, !effectiveWorld && treePath.length === 0 ? effectiveUser : undefined);

  // File listing
  if (showUsersListing) {
    const usersBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${(entries as FileEntry[]).map(entry => {
      const href = buildEntryHref(usersBase + '/@', entry.name, '@');
      return `<div class="file-row" data-href="${href}">
        <div class="file-access">${accessIcon(entry)}</div>
        <div class="file-icon">${fileOrEncryptedIcon(entry)}</div>
        <div class="file-name">${displayEntryName(entry.name, '@')}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else if (showWorldsListing) {
    const worldsBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${(entries as FileEntry[]).map(entry => {
      const href = buildEntryHref(worldsBase + '/~', entry.name, '~');
      return `<div class="file-row" data-href="${href}">
        <div class="file-access">${accessIcon(entry)}</div>
        <div class="file-icon">${fileOrEncryptedIcon(entry)}</div>
        <div class="file-name">${displayEntryName(entry.name, '~')}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html += renderFileListing(entries, basePath);
  }

  // README — resolve relative links against current basePath
  const readmes = findReadmes(entries);
  // Fetch content for READMEs that lack inline content (e.g. HttpBackend flat listings)
  for (const readme of readmes) {
    if (!readme.content) {
      const apiPath = effectiveWorld
        ? `@${effectiveWorldParent}/~${effectiveWorld}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${readme.name}`
        : `@${effectiveUser}/${treePath.length > 0 ? treePath.join('/') + '/' : ''}${readme.name}`;
      const fetched = await getAPI().readFile(apiPath);
      if (fetched !== null) readme.content = fetched;
    }
  }
  const readmesWithContent = readmes.filter(r => r.content);
  if (readmesWithContent.length === 1) {
    const readmeHtml = renderMarkdown(readmesWithContent[0].content!);
    const resolvedHtml = readmeHtml.replace(/href="(?!\/|https?:|#)([^"]+)"/g, (_m, rel) =>
      `href="${buildBasePath(base, versions, [...path, ...rel.split('/').filter(Boolean)])}"`
    );
    html += `<div class="readme-section">
      <div class="readme-header">README.md</div>
      <div class="readme-body">${resolvedHtml}</div>
    </div>`;
  } else if (readmesWithContent.length > 1) {
    // Multiple READMEs — render as switchable tabs
    const allSameName = readmesWithContent.every(r => r.name === readmesWithContent[0].name);
    html += `<div class="readme-section">`;
    html += `<div class="readme-tabs">`;
    readmesWithContent.forEach((r, i) => {
      const label = allSameName ? `${r.name} (${i + 1})` : r.name;
      const activeClass = i === 0 ? ' active' : '';
      html += `<button class="readme-tab${activeClass}" data-readme-tab="${i}">${label}</button>`;
    });
    html += `</div>`;
    readmesWithContent.forEach((r, i) => {
      const readmeHtml = renderMarkdown(r.content!);
      const resolvedHtml = readmeHtml.replace(/href="(?!\/|https?:|#)([^"]+)"/g, (_m, rel) =>
        `href="${buildBasePath(base, versions, [...path, ...rel.split('/').filter(Boolean)])}"`
      );
      const hiddenClass = i === 0 ? '' : ' hidden';
      html += `<div class="readme-body${hiddenClass}" data-readme-body="${i}">${resolvedHtml}</div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  currentContainer.innerHTML = html;
  bindClickHandlers();
}

// ---- Public API ----

export async function mount(
  container: HTMLElement,
  params: { user: string; path: string[]; versions: [number, string][]; base: string; hash: string | null },
  navigate: (path: string) => void,
): Promise<void> {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  currentRepoParams = params;
  navigateFn = navigate;
  await renderRepo();
}

export async function update(params: { user: string; path: string[]; versions: [number, string][]; base: string; hash: string | null }): Promise<void> {
  const prev = currentRepoParams;
  currentRepoParams = params;

  // Fast path: only hash changed while IDE layout is active
  if (prev && ideLayoutInstance && currentFileViewEntries && currentMakeFilePanel &&
      params.user === prev.user &&
      params.base === prev.base &&
      params.hash !== prev.hash &&
      params.path.length === prev.path.length &&
      params.path.every((s, i) => s === prev.path[i]) &&
      params.versions.length === prev.versions.length &&
      params.versions.every(([d, v], i) => d === prev.versions[i][0] && v === prev.versions[i][1])) {
    if (params.hash) {
      const hashPath = params.hash.split('/').filter(Boolean);
      if (hashPath.length > 0) {
        const files = resolveFiles(currentFileViewEntries, hashPath);
        const relHash = params.hash;
        const panelId = 'file:' + relHash;
        const name = hashPath[hashPath.length - 1];
        ideLayoutInstance.openPanel(currentMakeFilePanel(panelId, name, files));
        return;
      }
    }
    // Hash cleared — fall through to full re-render (back to directory listing)
  }

  await renderRepo();
}

export function unmount(): void {
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  if (ideLayoutInstance) { ideLayoutInstance.unmount(); ideLayoutInstance = null; }
  if (iframeCleanup) { iframeCleanup(); iframeCleanup = null; }
  if (virtualScrollCleanup) { virtualScrollCleanup(); virtualScrollCleanup = null; }
  sidebarExpanded.clear();
  if (currentContainer) {
    currentContainer.innerHTML = '';
    currentContainer = null;
  }
  currentRepoParams = null;
  currentFileViewEntries = null;
  currentFileViewBasePath = null;
  currentMakeFilePanel = null;
  navigateFn = null;
}
