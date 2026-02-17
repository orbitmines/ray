// ============================================================
// Repository.ts — Player page: file explorer + README rendering
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { renderMarkdown } from './Markdown.ts';
import { fileIcon } from './FileIcons.ts';
import { getRepository, getReferencedUsers, getReferencedWorlds, getWorld, resolveDirectory, resolveFiles, isCompound, flattenEntries, getOpenPRCount } from './DummyData.ts';
import type { FileEntry, CompoundEntry, TreeEntry, Repository } from './DummyData.ts';
import { createIDELayout, generateId, ensureIdCounter, injectIDEStyles } from './IDELayout.ts';
import type { IDELayoutAPI, PanelDefinition, LayoutNode, TabGroupNode, SplitNode } from './IDELayout.ts';

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

// ---- Session persistence (Session.ray.json) ----

function sessionKey(user: string): string {
  return `ether:session:${user}`;
}

function loadSession(user: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(sessionKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSession(user: string, data: Record<string, any>): void {
  localStorage.setItem(sessionKey(user), JSON.stringify(data, null, 2));
}

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

function getSessionContent(user: string): string {
  const session = loadSession(user);
  return JSON.stringify(session, null, 2);
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

    /* ---- Fork button ---- */
    .fork-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.55);
      transition: border-color 0.15s, color 0.15s;
    }
    .fork-btn:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.75); }

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
      .nav-actions .fork-btn,
      .nav-actions .star-btn,
      .nav-actions .clone-btn { gap: 4px; padding: 0 6px; }
      .nav-actions .fork-btn { margin-left: auto; }

      .action-icon-default { display: none !important; }
      .action-icon-small { display: flex !important; }
    }

    @media (max-width: 400px) {
      .iframe-overlay .overlay-label { font-size: 11px; }
      .iframe-overlay .action-btn { margin-left: 2px; }

      .repo-breadcrumb .action-btn { margin-left: 2px; }
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
        const u = localStorage.getItem('ether:name') || 'anonymous';
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
        const u = localStorage.getItem('ether:name') || 'anonymous';
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
  return (seg.length > 1 && seg[0] === '!') ? seg.slice(1) : seg;
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
    return parent + '/@' + name;
  }
  if (parentContext === '~') {
    const parent = basePath.replace(/\/~$/, '');
    return parent + '/~' + name;
  }
  return basePath + (basePath.endsWith('/') ? '' : '/') + escapePathSegment(name);
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
    <div class="file-icon">${fileIcon(entry.name, entry.isDirectory)}</div>
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

function getPrCount(canonicalPath: string): number {
  const count = getOpenPRCount(canonicalPath);
  if (count > 0) return count;
  // clonePath strips the @user/ prefix for root users — try with it
  if (!canonicalPath.startsWith('@') && currentRepoParams) {
    return getOpenPRCount(`@${currentRepoParams.user}/${canonicalPath}`);
  }
  return 0;
}

function renderActionButtons(canonicalPath: string, starPath: string): string {
  const forkCount = getForkCount(canonicalPath);

  const etherCmd = `ether clone ${canonicalPath}`;
  const gitCmd = `git clone git@ether.orbitmines.com:${canonicalPath}`;

  const starred = isStarred(starPath);
  const starSvg = starred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
  const starCls = starred ? 'star-btn starred' : 'star-btn';
  const starLabel = starred ? 'Starred' : 'Star';
  const starCount = getStarCount(starPath);

  return `<div class="popup-backdrop" data-clone-backdrop></div>
    <button class="action-btn fork-btn" style="margin-left:auto;" data-fork-toggle><span class="action-count">${forkCount}</span><span class="action-icon">${FORK_SVG}</span><span class="action-label">Fork</span></button>
    <button class="action-btn ${starCls}" data-star-toggle data-star-path="${starPath}"><span class="action-count" data-star-count>${starCount}</span><span class="action-icon">${starSvg}</span><span class="action-label">${starLabel}</span></button>
    <button class="action-btn clone-btn" data-clone-toggle><span class="action-icon action-icon-default">${CLONE_SVG}</span><span class="action-icon action-icon-small">${DOWNLOAD_SVG}</span><span class="action-label">Download</span></button>
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

// ---- Star / Favorite helpers ----

const FORKS_KEY = 'ether:forks';
const STARS_KEY = 'ether:stars';

function getStars(): string[] {
  const raw = localStorage.getItem(STARS_KEY);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

function setStars(stars: string[]): void {
  localStorage.setItem(STARS_KEY, stars.join('\n'));
}

function getStarCount(canonicalPath: string): number {
  const raw = localStorage.getItem(`ether:star-count:${canonicalPath}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function setStarCount(canonicalPath: string, count: number): void {
  localStorage.setItem(`ether:star-count:${canonicalPath}`, String(Math.max(0, count)));
}

function getForkCount(canonicalPath: string): number {
  const raw = localStorage.getItem(`ether:fork-count:${canonicalPath}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function setForkCount(canonicalPath: string, count: number): void {
  localStorage.setItem(`ether:fork-count:${canonicalPath}`, String(Math.max(0, count)));
}

function isStarred(canonicalPath: string): boolean {
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

function toggleStar(canonicalPath: string): boolean {
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

function renderBreadcrumb(displayVersion: string, items: BreadcrumbItem[], canonicalPath?: string, starPath?: string, rootLink?: { label: string; href: string }): string {
  let html = '';
  const actionHtml = canonicalPath ? renderActionButtons(canonicalPath, starPath || canonicalPath) : '';
  if (canonicalPath) {
    const prCount = getPrCount(canonicalPath);
    html += `<div class="repo-nav-row">
      <span class="nav-actions">${actionHtml}</span>
      <button class="action-btn icon-btn" title="Pull requests" data-pr-nav data-pr-path="${canonicalPath}"><span class="action-count">${prCount}</span><span class="action-icon">${PR_SVG}</span></button>
      <button class="action-btn icon-btn" title="Settings"><span class="action-icon">${SETTINGS_SVG}</span></button>
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

function findReadmes(entries: TreeEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (isCompound(entry)) {
      result.push(...findReadmes(entry.entries));
    } else if (entry.name === 'README.md' && !entry.isDirectory && entry.content) {
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
      html += fileIcon(entry.name, true);
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
        html += fileIcon(entry.name, false);
        html += `<span>${name}</span>`;
        html += `</div>`;
        html += `<div class="sidebar-dir-children${isExpanded ? '' : ' hidden'}">`;
        html += renderSidebarTree(fileChildren, href, isOnPath ? expandPath.slice(1) : [], depth + 1, childContext);
        html += `</div>`;
        html += `</div>`;
      } else {
        html += `<div class="file-view-sidebar-entry${isActive ? ' active' : ''}" style="padding-left:${pad}px" data-href="${href}">`;
        html += `<span class="sidebar-arrow-spacer"></span>`;
        html += fileIcon(entry.name, false);
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

function renderRepo(): void {
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
  const currentPlayer = localStorage.getItem('ether:name') || 'anonymous';
  loadSidebarExpanded(currentPlayer);
  let repository = effectiveWorld
    ? getWorld(effectiveWorldParent, effectiveWorld)
    : getRepository(effectiveUser);
  // Virtual repository for the current player if they don't have one yet
  if (!repository && !effectiveWorld && effectiveUser === currentPlayer) {
    repository = { user: currentPlayer, description: `@${currentPlayer}`, tree: [] };
  }
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
    const referencedUsers = getReferencedUsers(effectiveUser, effectiveWorld);
    // Inject current player if not already listed
    const users = referencedUsers.includes(currentPlayer)
      ? referencedUsers
      : [currentPlayer, ...referencedUsers];
    entries = users.map(u => ({
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
      if (!hash && treePath.length > 0 && navigateFn) {
        // Backward-compat: redirect file-in-pathname to hash-based URL
        // Augment tree root with virtual entries for resolution
        let resolveTree: TreeEntry[] = repository.tree;
        const virtuals: TreeEntry[] = [];
        const refUsers = getReferencedUsers(effectiveUser, effectiveWorld);
        if (refUsers.length > 0) {
          const userChildren: FileEntry[] = (refUsers.includes(currentPlayer) ? refUsers : [currentPlayer, ...refUsers])
            .map(u => {
              const repo = getRepository(u);
              return { name: u, isDirectory: true, modified: '', children: repo ? [...repo.tree] : [] } as FileEntry;
            });
          virtuals.push({ name: '@', isDirectory: true, modified: '', children: userChildren } as FileEntry);
        }
        const refWorlds = getReferencedWorlds(effectiveUser, effectiveWorld);
        if (refWorlds.length > 0) {
          const worldChildren: FileEntry[] = refWorlds.map(w => {
            const worldRepo = getWorld(worldParentKey, w);
            return { name: w, isDirectory: true, modified: '', children: worldRepo ? [...worldRepo.tree] : [] } as FileEntry;
          });
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
      const refUsers = getReferencedUsers(effectiveUser, effectiveWorld);
      if (refUsers.length > 0) {
        const userChildren: FileEntry[] = (refUsers.includes(currentPlayer) ? refUsers : [currentPlayer, ...refUsers])
          .map(u => {
            const repo = getRepository(u);
            return { name: u, isDirectory: true, modified: '', children: repo ? [...repo.tree] : [] } as FileEntry;
          });
        virtuals.push({ name: '@', isDirectory: true, modified: '', children: userChildren });
      }
      const refWorlds = getReferencedWorlds(effectiveUser, effectiveWorld);
      if (refWorlds.length > 0) {
        const worldChildren: FileEntry[] = refWorlds.map(w => {
          const worldRepo = getWorld(worldParentKey, w);
          return { name: w, isDirectory: true, modified: '', children: worldRepo ? [...worldRepo.tree] : [] } as FileEntry;
        });
        virtuals.push({ name: '~', isDirectory: true, modified: '', children: worldChildren });
      }
      // Inject .stars.list.ray and Session.ray.json for the current player
      if (effectiveUser === currentPlayer && !effectiveWorld) {
        const stars = getStars();
        const starsContent = stars.length > 0 ? stars.join('\n') : '';
        virtuals.push({ name: '.stars.list.ray', isDirectory: false, modified: '', content: starsContent });
        virtuals.push({ name: 'Session.ray.json', isDirectory: false, modified: '', content: getSessionContent(currentPlayer) });
      }
      entries = [...virtuals, ...entries];
    }
  }

  // ---- Hash-based file view ----
  if (hash) {
    const hashPath = hash.split('/').filter(Boolean);
    if (hashPath.length > 0) {
      const files = resolveFiles(entries, hashPath);
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
      html += renderBreadcrumb(displayVersion, breadcrumbItems, clonePath, rootStarPath, rootLink);
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
            icon: panelFiles.length > 0 ? fileIcon(name, false) : '',
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
              const children = dirEl.querySelector(':scope > .sidebar-dir-children');
              if (!children) {
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
                const u = localStorage.getItem('ether:name') || 'anonymous';
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
                const u = localStorage.getItem('ether:name') || 'anonymous';
                saveSidebarExpanded(u);
              }
            });
          });
        }

        const initialFilePanelId = 'file:' + hash;

        const sidebarPanel: PanelDefinition = {
          id: 'sidebar',
          title: 'Explorer',
          icon: FOLDER_SVG,
          closable: false,
          sticky: true,
          render: (el) => {
            el.innerHTML = renderSidebarTree(sidebarEntries, sidebarBasePath, sidebarExpandPath, 0);
            // File clicks → open as new tab
            el.querySelectorAll('[data-href]').forEach(entry => {
              entry.addEventListener('click', (e) => {
                e.preventDefault();
                const href = (entry as HTMLElement).dataset.href!;
                if (ideLayoutInstance) {
                  const prefix = sidebarBasePath.endsWith('/') ? sidebarBasePath : sidebarBasePath + '/';
                  const relPath = href.startsWith(prefix)
                    ? href.slice(prefix.length).split('/').filter(Boolean).map(unescapePathSegment)
                    : null;
                  if (relPath && relPath.length > 0) {
                    // Decompose @name/~name segments into ['@','name'] / ['~','name']
                    // so resolveFiles can traverse the virtual @ and ~ tree entries
                    const treePath: string[] = [];
                    for (const seg of relPath) {
                      if (seg.length > 1 && (seg.startsWith('@') || seg.startsWith('~'))) {
                        treePath.push(seg[0], seg.slice(1));
                      } else {
                        treePath.push(seg);
                      }
                    }
                    const resolved = resolveFiles(sidebarEntries, treePath);
                    if (resolved.length > 0) {
                      const relHash = relPath.join('/');
                      const panelId = 'file:' + relHash;
                      const name = treePath[treePath.length - 1];
                      history.replaceState(null, '', location.pathname + '#' + relHash);
                      ideLayoutInstance.openPanel(makeFilePanel(panelId, name, resolved));
                      return;
                    }
                  }
                }
                // Fallback: full navigation (directories, unresolved paths)
                if (navigateFn) navigateFn(href);
              });
            });
            bindSidebarTreeHandlers(el);
          },
        };

        const filePanel = makeFilePanel(initialFilePanelId, fileName, files);

        // Try restoring layout from session
        const currentUser = localStorage.getItem('ether:name') || 'anonymous';
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
    const iframeStarred = isStarred(canonicalPath);
    const iframeStarSvg = iframeStarred ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
    const iframeStarCls = iframeStarred ? 'star-btn starred' : 'star-btn';
    const iframeStarLabel = iframeStarred ? 'Starred' : 'Star';
    currentContainer.innerHTML = `<div class="repo-page" style="position:relative;padding:0;max-width:none;min-height:100vh;display:flex;flex-direction:column;">
      <div class="iframe-overlay">
        <span class="overlay-label">${headerLabel}</span>
        <span class="overlay-desc">${repository.description}</span>
        <button class="action-btn fork-btn" data-fork-toggle><span class="action-count">${getForkCount(canonicalPath)}</span><span class="action-icon">${FORK_SVG}</span><span class="action-label">Fork</span></button>
        <button class="action-btn ${iframeStarCls}" data-star-toggle data-star-path="${canonicalPath}"><span class="action-count" data-star-count>${getStarCount(canonicalPath)}</span><span class="action-icon">${iframeStarSvg}</span><span class="action-label">${iframeStarLabel}</span></button>
      </div>
    </div>`;

    const repoPage = currentContainer.querySelector('.repo-page') as HTMLElement;
    mountIframe(repoPage, indexRay.content!, canonicalPath);

    // Wire star button in iframe overlay
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
  html += renderBreadcrumb(displayVersion, breadcrumbItems, clonePath, rootStarPath, rootLink);

  // File listing
  if (showUsersListing) {
    const usersBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${(entries as FileEntry[]).map(entry => {
      const href = buildEntryHref(usersBase + '/@', entry.name, '@');
      return `<div class="file-row" data-href="${href}">
        <div class="file-icon">${fileIcon(entry.name, true)}</div>
        <div class="file-name">${displayEntryName(entry.name, '@')}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else if (showWorldsListing) {
    const worldsBase = buildBasePath(base, versions, path.slice(0, -1));
    html += `<div class="file-table">${(entries as FileEntry[]).map(entry => {
      const href = buildEntryHref(worldsBase + '/~', entry.name, '~');
      return `<div class="file-row" data-href="${href}">
        <div class="file-icon">${fileIcon(entry.name, true)}</div>
        <div class="file-name">${displayEntryName(entry.name, '~')}</div>
        <div class="file-modified">${entry.modified}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html += renderFileListing(entries, basePath);
  }

  // README — resolve relative links against current basePath
  const readmes = findReadmes(entries);
  if (readmes.length === 1) {
    const readmeHtml = renderMarkdown(readmes[0].content!);
    const resolvedHtml = readmeHtml.replace(/href="(?!\/|https?:|#)([^"]+)"/g, (_m, rel) =>
      `href="${buildBasePath(base, versions, [...path, ...rel.split('/').filter(Boolean)])}"`
    );
    html += `<div class="readme-section">
      <div class="readme-header">README.md</div>
      <div class="readme-body">${resolvedHtml}</div>
    </div>`;
  } else if (readmes.length > 1) {
    // Multiple READMEs — render as switchable tabs
    const allSameName = readmes.every(r => r.name === readmes[0].name);
    html += `<div class="readme-section">`;
    html += `<div class="readme-tabs">`;
    readmes.forEach((r, i) => {
      const label = allSameName ? `${r.name} (${i + 1})` : r.name;
      const activeClass = i === 0 ? ' active' : '';
      html += `<button class="readme-tab${activeClass}" data-readme-tab="${i}">${label}</button>`;
    });
    html += `</div>`;
    readmes.forEach((r, i) => {
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

export function mount(
  container: HTMLElement,
  params: { user: string; path: string[]; versions: [number, string][]; base: string; hash: string | null },
  navigate: (path: string) => void,
): void {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  currentRepoParams = params;
  navigateFn = navigate;
  renderRepo();
}

export function update(params: { user: string; path: string[]; versions: [number, string][]; base: string; hash: string | null }): void {
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

  renderRepo();
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
