// ============================================================
// Library.ts — Ether Library: The Language Index
// Vanilla TypeScript port of Library.tsx scaffold.
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { createIDELayout, generateId, injectIDEStyles } from './IDELayout.ts';
import type { IDELayoutAPI, PanelDefinition, LayoutNode } from './IDELayout.ts';

// ─── SVG Icons ──────────────────────────────────────────────────────────────

const ICON_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="8" cy="8" r="6"/></svg>`;
const ICON_CIRCLE_SM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><circle cx="8" cy="8" r="6"/></svg>`;
const ICON_DOCUMENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 1h5.5L13 4.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1v3h3L9 2z"/></svg>`;
const ICON_REPO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8zM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2z"/></svg>`;
const ICON_SETTINGS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C8.936-.019 9.111 0 9.291 0l.214.006A1 1 0 0 1 10.39.87l.372 1.01a6.05 6.05 0 0 1 1.01.585l1.063-.23a1 1 0 0 1 1.001.394 8.08 8.08 0 0 1 .779 1.352 1 1 0 0 1-.238 1.118l-.691.78a6.123 6.123 0 0 1 0 1.17l.69.782a1 1 0 0 1 .239 1.117 8.09 8.09 0 0 1-.78 1.352 1 1 0 0 1-1 .394l-1.063-.23c-.32.228-.66.426-1.01.585l-.372 1.01a1 1 0 0 1-.885.594l-.214.006c-.18 0-.356.02-.53-.031A8.154 8.154 0 0 1 8 16a8.2 8.2 0 0 1-.701-.031c-.234.051-.41.031-.59.031l-.214-.006a1 1 0 0 1-.884-.594l-.372-1.01a6.05 6.05 0 0 1-1.01-.585l-1.064.23a1 1 0 0 1-1-.394 8.09 8.09 0 0 1-.78-1.352 1 1 0 0 1 .238-1.117l.69-.783a6.123 6.123 0 0 1 0-1.17l-.69-.78A1 1 0 0 1 1.394 7.9a8.08 8.08 0 0 1 .78-1.352 1 1 0 0 1 1-.394l1.063.23c.32-.228.66-.426 1.01-.585l.372-1.01A1 1 0 0 1 6.496.194L6.709.188c.18 0 .356-.019.53.031A8.154 8.154 0 0 1 8 0zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>`;
const ICON_BRANCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6A2.5 2.5 0 0 1 3.5 6v-.628a2.25 2.25 0 1 1 1.5 0V6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM11 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM5 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 10.878a2.25 2.25 0 1 1 1.5 0V13.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.622a2.25 2.25 0 1 1 1.5 0V13.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5zM5 12a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm6 0a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"/></svg>`;
const ICON_CARET_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/></svg>`;
const ICON_ADD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="#3fb950"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/></svg>`;
const ICON_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zM12.24 2.854L3.832 11.264l-.56 1.96 1.96-.56L13.64 4.266 12.24 2.854z"/></svg>`;
const ICON_ARROW_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06z"/></svg>`;

// ─── Data Model ─────────────────────────────────────────────────────────────

type LanguageRef = string | { name: string; icon?: string };

function resolveLanguageRef(ref?: LanguageRef): { name?: string; icon?: string } {
  if (!ref) return {};
  if (typeof ref === 'string') return { name: ref };
  return ref;
}

function resolveLanguage(ref?: LanguageRef, defaultRef?: LanguageRef): { name: string; icon: string } {
  const resolved = resolveLanguageRef(ref);
  const defaults = resolveLanguageRef(defaultRef);
  return {
    name: resolved.name || defaults.name || '',
    icon: resolved.icon || defaults.icon || 'circle',
  };
}

interface Entry {
  type?: 'file' | 'library';
  name: string;
  icon?: string;
  language?: LanguageRef;
  library?: string;
  reference?: { name: string; icon?: string };
  versions?: Version[];
  snippet?: string;
}

interface Version {
  tag: string;
  language?: LanguageRef;
  children?: VersionChild[];
}

type VersionChild = Entry | LibrariesGroup;

interface LibrariesGroup {
  type: 'libraries';
  count?: number;
  entries: LibraryEntryData[];
}

interface LibraryEntryData {
  name: string;
  icon?: string;
  snippet?: string;
  reference?: { name: string; icon?: string };
}

// ─── Dataset ────────────────────────────────────────────────────────────────

const PROJECTS: Entry[] = [
  {
    name: 'Ray',
    language: { name: 'Ray', icon: 'circle' },
    versions: [
      {
        tag: 'v1.0.0',
        children: [
          {
            type: 'file',
            name: 'UUID.ray',
            icon: 'document',
            snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
          },
          {
            type: 'libraries',
            count: 10000,
            entries: [
              {
                name: 'Library',
                snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
              },
              {
                name: 'Library',
                reference: { name: 'Language' },
                snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
              },
            ],
          },
        ],
      },
      { tag: 'v1.0.0', language: 'Set Theory' },
      { tag: 'v0.9.0', language: 'Set Theory' },
      { tag: 'v0.9.0' },
    ],
  },
  {
    name: 'Set Theory',
    language: { name: 'Set Theory', icon: 'circle' },
    versions: [
      {
        tag: 'v2.0.0',
        language: 'Ray',
        children: [
          {
            type: 'library',
            name: 'set.mm',
            snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
          },
        ],
      },
      { tag: 'v2.0.0' },
      {
        tag: 'v1.0.0',
        children: [
          {
            type: 'library',
            name: 'set.mm',
            versions: [
              { tag: 'v1.0.0', language: 'Ray' },
              { tag: 'v1.0.0' },
            ],
            snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
          },
        ],
      },
      { tag: 'v1.0.0', language: 'Ray' },
    ],
  },
  {
    name: 'UUID',
    language: { name: 'UUID', icon: 'circle' },
    versions: [
      {
        tag: 'v1.0.0',
        language: 'Ray',
        children: [
          {
            type: 'file',
            name: 'UUID.ray',
            library: 'Ray',
            versions: [
              { tag: 'v1.0.0', language: 'Ray' },
              { tag: 'v1.0.0' },
            ],
            snippet: 'UUID: UUID("asadasdasdasdasdddaaaaaaaaaaaaa"',
          },
        ],
      },
      { tag: 'v1.0.0' },
      { tag: 'v0.1.0' },
    ],
  },
];

// ─── Socials ────────────────────────────────────────────────────────────────

interface SocialLink {
  name: string;
  url: string;
  label: string;
}

const SOCIALS: SocialLink[] = [
  { name: 'Discord', url: 'https://discord.orbitmines.com', label: 'discord.orbitmines.com' },
  { name: 'GitHub', url: 'https://github.com/orbitmines/ray/tree/main/Ether/library', label: 'orbitmines' },
];

// ─── Module State ───────────────────────────────────────────────────────────

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let ideLayoutInstance: IDELayoutAPI | null = null;

// Selection state
const selectedKeys = new Set<string>();
let lastSelectedKey: string | null = null;
let selectionCounter = 0;

// Per-entry version/language selection state (keyed by entry name)
const entrySelectedTag = new Map<string, string>();
const entrySelectedLang = new Map<string, string>();

// Track open dropdowns for cleanup
let activeDropdown: HTMLElement | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function iconForName(name: string): string {
  switch (name) {
    case 'circle': return ICON_CIRCLE;
    case 'document': return ICON_DOCUMENT;
    case 'git-repo': return ICON_REPO;
    case 'settings': return ICON_SETTINGS;
    default: return ICON_CIRCLE;
  }
}

function iconSmallForName(name: string): string {
  if (name === 'circle') return ICON_CIRCLE_SM;
  return ICON_CIRCLE_SM;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function entryKey(entry: Entry): string {
  if (entry.library) return `${entry.library}//${entry.name}`;
  if (entry.reference) return `${entry.name}->${entry.reference.name}`;
  return entry.name;
}

function closeActiveDropdown(): void {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

// ─── Selection Logic ────────────────────────────────────────────────────────

function handleSelect(key: string, e: MouseEvent): void {
  if (e.ctrlKey || e.metaKey) {
    if (selectedKeys.has(key)) selectedKeys.delete(key);
    else selectedKeys.add(key);
    lastSelectedKey = key;
  } else if (e.shiftKey && lastSelectedKey) {
    const allEls = Array.from(document.querySelectorAll('[data-entry-key]'));
    const allKeys = allEls.map(el => el.getAttribute('data-entry-key')!);
    const startIdx = allKeys.indexOf(lastSelectedKey);
    const endIdx = allKeys.indexOf(key);
    if (startIdx !== -1 && endIdx !== -1) {
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      for (let i = from; i <= to; i++) selectedKeys.add(allKeys[i]);
    }
  } else {
    selectedKeys.clear();
    selectedKeys.add(key);
    lastSelectedKey = key;
  }
  updateSelectionVisuals();
}

function updateSelectionVisuals(): void {
  document.querySelectorAll('.lib-selectable-entry').forEach(el => {
    const key = el.getAttribute('data-entry-key');
    if (key && selectedKeys.has(key)) {
      el.classList.add('lib-selectable-entry--selected');
    } else {
      el.classList.remove('lib-selectable-entry--selected');
    }
  });
}

// ─── Version/Language Grouping ──────────────────────────────────────────────

interface TagGroup {
  tag: string;
  langs: { name: string; icon: string }[];
}

function getTagGroups(entry: Entry): TagGroup[] {
  if (!entry.versions || entry.versions.length === 0) return [];
  const entryLang = entry.language;
  const groups: TagGroup[] = [];
  const tagMap = new Map<string, { name: string; icon: string }[]>();
  for (const v of entry.versions) {
    const lang = resolveLanguage(v.language, entryLang);
    if (!tagMap.has(v.tag)) {
      const arr: { name: string; icon: string }[] = [];
      tagMap.set(v.tag, arr);
      groups.push({ tag: v.tag, langs: arr });
    }
    const arr = tagMap.get(v.tag)!;
    if (!arr.some(l => l.name === lang.name)) {
      arr.push(lang);
    }
  }
  return groups;
}

function getSelectedVersion(entry: Entry): Version | null {
  if (!entry.versions || entry.versions.length === 0) return null;
  const entryLang = entry.language;
  const tagGroups = getTagGroups(entry);
  const storedTag = entrySelectedTag.get(entryKey(entry));
  const currentTag = (storedTag && tagGroups.some(g => g.tag === storedTag))
    ? storedTag : (tagGroups[0]?.tag || '');
  const currentGroup = tagGroups.find(g => g.tag === currentTag);
  const storedLang = entrySelectedLang.get(entryKey(entry));
  const currentLangName = (storedLang && currentGroup?.langs.some(l => l.name === storedLang))
    ? storedLang : (currentGroup?.langs[0]?.name || '');

  return entry.versions.find(v => {
    const lang = resolveLanguage(v.language, entryLang);
    return v.tag === currentTag && lang.name === currentLangName;
  }) || entry.versions[0];
}

// ─── Dropdown Component ─────────────────────────────────────────────────────

function createDropdown(anchor: HTMLElement, items: HTMLElement[]): HTMLElement {
  closeActiveDropdown();
  const dropdown = document.createElement('div');
  dropdown.className = 'lib-dropdown';

  for (const item of items) {
    dropdown.appendChild(item);
  }

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // Position relative to anchor
  const rect = anchor.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 2}px`;
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.zIndex = '10000';

  // Close on outside click (next tick)
  setTimeout(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        closeActiveDropdown();
        document.removeEventListener('mousedown', handler);
      }
    };
    document.addEventListener('mousedown', handler);
  }, 0);

  return dropdown;
}

function createDropdownItem(opts: {
  html: string;
  active?: boolean;
  onClick: () => void;
}): HTMLElement {
  const item = document.createElement('div');
  item.className = 'lib-dropdown-item' + (opts.active ? ' lib-dropdown-item--active' : '');
  item.innerHTML = opts.html;
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onClick();
    closeActiveDropdown();
  });
  return item;
}

// ─── Render: Entry Name ─────────────────────────────────────────────────────

function renderEntryName(entry: Entry): string {
  const isFile = entry.type === 'file';
  if (entry.library) {
    return `<span>${escapeHtml(entry.library)} <span class="lib-muted">//</span> ` +
      (isFile ? `<span class="lib-disabled">${escapeHtml(entry.name)}</span>` : escapeHtml(entry.name)) +
      `</span>`;
  }
  if (entry.reference) {
    return `<span class="lib-inline-row">` +
      `${escapeHtml(entry.name)} <span class="lib-muted">-&gt;</span> ` +
      `${iconSmallForName(entry.reference.icon || 'circle')} ` +
      `${escapeHtml(entry.reference.name)}</span>`;
  }
  return isFile
    ? `<span class="lib-disabled">${escapeHtml(entry.name)}</span>`
    : `<span>${escapeHtml(entry.name)}</span>`;
}

// ─── Render: Snippet ────────────────────────────────────────────────────────

function renderSnippet(text: string): string {
  return `<div class="lib-snippet">${escapeHtml(text)}</div>`;
}

// ─── Render: Library Entry (inside Libraries group) ─────────────────────────

function renderLibraryEntry(data: LibraryEntryData, openEntryFn: (entry: Entry) => void): HTMLElement {
  const icon = data.icon || 'circle';
  const entryForTab: Entry = {
    type: 'library',
    name: data.name,
    icon: icon,
    reference: data.reference,
    snippet: data.snippet,
  };
  const key = `lib-${entryKey(entryForTab)}-${++selectionCounter}`;

  const el = document.createElement('div');
  el.className = 'lib-selectable-entry';
  el.setAttribute('data-entry-key', key);

  let html = `<div class="lib-row lib-row-middle">`;
  html += iconForName(icon);
  html += `<span class="lib-entry-name">${renderEntryName(entryForTab)}</span>`;
  html += `</div>`;
  if (data.snippet) html += renderSnippet(data.snippet);

  el.innerHTML = html;
  el.addEventListener('click', (e) => {
    handleSelect(key, e);
    openEntryFn(entryForTab);
  });

  return el;
}

// ─── Render: Libraries Group ────────────────────────────────────────────────

function renderLibrariesGroup(data: LibrariesGroup, openEntryFn: (entry: Entry) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'lib-libraries-group';

  const header = document.createElement('div');
  header.className = 'lib-row lib-row-middle';
  header.innerHTML = `${ICON_REPO} <span>Libraries${data.count !== undefined
    ? ` <span class="lib-muted">(${data.count.toLocaleString()})</span>` : ''}</span>`;
  el.appendChild(header);

  const entries = document.createElement('div');
  entries.className = 'lib-indent';
  for (const entry of data.entries) {
    entries.appendChild(renderLibraryEntry(entry, openEntryFn));
  }
  el.appendChild(entries);

  return el;
}

// ─── Render: Entry View ─────────────────────────────────────────────────────

function renderEntryView(
  entry: Entry,
  openEntryFn: (entry: Entry) => void,
  opts?: { isTopLevel?: boolean; defaultLanguage?: LanguageRef }
): HTMLElement {
  const hasVersions = entry.versions && entry.versions.length > 0;
  const entryLang = entry.language || opts?.defaultLanguage;
  const isFile = entry.type === 'file';
  const isLibrary = entry.type === 'library';
  const defaultIcon = isLibrary ? 'git-repo' : 'circle';
  const icon = entry.icon || defaultIcon;
  const key = `entry-${entryKey(entry)}-${++selectionCounter}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'lib-entry-view';

  // Selectable row
  const selectable = document.createElement('div');
  selectable.className = 'lib-selectable-entry';
  selectable.setAttribute('data-entry-key', key);

  const topRow = document.createElement('div');
  topRow.className = 'lib-row lib-row-middle lib-row-between';

  if (hasVersions) {
    // Left: icon + name
    const left = document.createElement('div');
    left.className = 'lib-row lib-row-middle lib-entry-left';
    const iconSize = opts?.isTopLevel ? 16 : 14;
    left.innerHTML = `${iconForName(icon)}<span class="lib-entry-name">${
      opts?.isTopLevel ? `<h3 class="lib-entry-title">${escapeHtml(entry.name)}</h3>` : renderEntryName(entry)
    }</span>`;
    topRow.appendChild(left);

    // Right: controls (add button + version/language selectors)
    const right = document.createElement('div');
    right.className = 'lib-entry-controls';
    right.addEventListener('click', (e) => e.stopPropagation());

    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'lib-btn lib-btn-icon';
    addBtn.innerHTML = ICON_ADD;
    addBtn.title = 'Add';
    right.appendChild(addBtn);

    // Version/language column
    const selectors = document.createElement('div');
    selectors.className = 'lib-selectors';

    // Compute tag groups
    const tagGroups = getTagGroups(entry);
    const ek = entryKey(entry);
    const storedTag = entrySelectedTag.get(ek);
    const currentTag = (storedTag && tagGroups.some(g => g.tag === storedTag))
      ? storedTag : (tagGroups[0]?.tag || '');
    const currentGroup = tagGroups.find(g => g.tag === currentTag);
    const storedLang = entrySelectedLang.get(ek);
    const currentLangName = (storedLang && currentGroup?.langs.some(l => l.name === storedLang))
      ? storedLang : (currentGroup?.langs[0]?.name || '');
    const currentLang = currentGroup?.langs.find(l => l.name === currentLangName)
      || currentGroup?.langs[0]
      || { name: '', icon: 'circle' };

    // Version dropdown trigger
    const versionBtn = document.createElement('button');
    versionBtn.className = 'lib-btn lib-selector-btn';
    versionBtn.innerHTML = `${ICON_BRANCH} <span class="lib-muted">${escapeHtml(currentTag)}</span> ${ICON_CARET_DOWN}`;
    versionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const items = tagGroups.map(({ tag, langs }) => {
        const langTags = langs.map(lang => {
          const isActive = tag === currentTag && lang.name === currentLangName;
          return `<span class="lib-tag${isActive ? ' lib-tag--active' : ''}" data-lang="${escapeHtml(lang.name)}">${iconSmallForName(lang.icon)} ${escapeHtml(lang.name)}</span>`;
        }).join(' ');
        return createDropdownItem({
          html: `<div class="lib-dropdown-row">${ICON_BRANCH} <span>${escapeHtml(tag)}</span><span class="lib-dropdown-tags">${langTags}</span></div>`,
          active: tag === currentTag,
          onClick: () => {
            entrySelectedTag.set(ek, tag);
            rerenderEntry(wrapper, entry, openEntryFn, opts);
          },
        });
      });
      // Attach click handlers to individual lang tags
      for (let i = 0; i < items.length; i++) {
        const langEls = items[i].querySelectorAll('.lib-tag');
        langEls.forEach(langEl => {
          langEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const langName = langEl.getAttribute('data-lang');
            if (langName) {
              entrySelectedTag.set(ek, tagGroups[i].tag);
              entrySelectedLang.set(ek, langName);
              closeActiveDropdown();
              rerenderEntry(wrapper, entry, openEntryFn, opts);
            }
          });
        });
      }
      createDropdown(versionBtn, items);
    });
    selectors.appendChild(versionBtn);

    // Language dropdown trigger
    const langsForTag = currentGroup?.langs || [];
    const langBtn = document.createElement('button');
    langBtn.className = 'lib-btn lib-lang-btn';
    langBtn.innerHTML = `${iconSmallForName(currentLang.icon)} <span>${escapeHtml(currentLang.name)}</span> ${ICON_CARET_DOWN}`;
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const items: HTMLElement[] = [];
      // Header showing current tag
      const header = document.createElement('div');
      header.className = 'lib-dropdown-item lib-dropdown-item--header';
      header.innerHTML = `${ICON_BRANCH} <span>${escapeHtml(currentTag)}</span>`;
      items.push(header);
      // Language tags
      for (const lang of langsForTag) {
        const isActive = lang.name === currentLangName;
        items.push(createDropdownItem({
          html: `<div class="lib-dropdown-row">${iconSmallForName(lang.icon)} <span>${escapeHtml(lang.name)}</span></div>`,
          active: isActive,
          onClick: () => {
            entrySelectedLang.set(ek, lang.name);
            rerenderEntry(wrapper, entry, openEntryFn, opts);
          },
        }));
      }
      createDropdown(langBtn, items);
    });
    selectors.appendChild(langBtn);

    right.appendChild(selectors);
    topRow.appendChild(right);
  } else {
    // No versions — just icon + name
    const left = document.createElement('div');
    left.className = 'lib-row lib-row-middle lib-entry-left';
    left.innerHTML = `${iconForName(icon)}<span class="lib-entry-name">${
      opts?.isTopLevel ? `<h3 class="lib-entry-title">${escapeHtml(entry.name)}</h3>` : renderEntryName(entry)
    }</span>`;
    if (isFile) left.querySelector('svg')?.classList.add('lib-disabled');
    topRow.appendChild(left);
  }

  selectable.appendChild(topRow);
  if (entry.snippet) {
    const snippetEl = document.createElement('div');
    snippetEl.className = 'lib-snippet';
    snippetEl.textContent = entry.snippet;
    selectable.appendChild(snippetEl);
  }

  selectable.addEventListener('click', (e) => {
    handleSelect(key, e);
    openEntryFn(entry);
  });
  wrapper.appendChild(selectable);

  // Children of selected version
  const selectedVersion = getSelectedVersion(entry);
  if (selectedVersion?.children && selectedVersion.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'lib-indent';
    for (const child of selectedVersion.children) {
      if ((child as LibrariesGroup).type === 'libraries') {
        childContainer.appendChild(renderLibrariesGroup(child as LibrariesGroup, openEntryFn));
      } else {
        childContainer.appendChild(renderEntryView(child as Entry, openEntryFn, { defaultLanguage: entryLang }));
      }
    }
    wrapper.appendChild(childContainer);
  }

  return wrapper;
}

function rerenderEntry(
  wrapper: HTMLElement,
  entry: Entry,
  openEntryFn: (entry: Entry) => void,
  opts?: { isTopLevel?: boolean; defaultLanguage?: LanguageRef }
): void {
  const newEl = renderEntryView(entry, openEntryFn, opts);
  wrapper.replaceWith(newEl);
}

// ─── Render: Project List ───────────────────────────────────────────────────

function renderProjectList(projects: Entry[], openEntryFn: (entry: Entry) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lib-project-list';
  for (const project of projects) {
    container.appendChild(renderEntryView(project, openEntryFn, { isTopLevel: true }));
  }
  return container;
}

// ─── Render: Socials ────────────────────────────────────────────────────────

function renderSocials(): string {
  return `<div class="lib-socials">${SOCIALS.map(s =>
    `<a href="${escapeHtml(s.url)}" target="_blank" class="lib-social-link" title="${escapeHtml(s.label)}">${escapeHtml(s.name)}</a>`
  ).join(' ')}</div>`;
}

// ─── Render: Settings Panel ─────────────────────────────────────────────────

function renderSettingsPanel(openEntryFn: (entry: Entry) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'lib-settings-panel';

  let html = `<div class="lib-row lib-row-middle"><span class="lib-panel-icon">${ICON_SETTINGS}</span><h3>Settings</h3></div>`;

  html += `<div class="lib-settings-section">`;
  html += `<h4 class="lib-muted">Preferences</h4>`;

  html += `<div class="lib-setting-group">`;
  html += `<div class="lib-row lib-row-middle"><h4 class="lib-muted">Reference Language</h4><span class="lib-edit-icon">${ICON_EDIT}</span></div>`;
  html += `<button class="lib-btn lib-setting-value">${ICON_CIRCLE} <span>Ray <span class="lib-muted">v1.0.0</span></span></button>`;
  html += `</div>`;

  html += `<div class="lib-setting-group">`;
  html += `<div class="lib-row lib-row-middle"><h4 class="lib-muted">Universal Language</h4><span class="lib-edit-icon">${ICON_EDIT}</span></div>`;
  html += `<button class="lib-btn lib-setting-value">${ICON_CIRCLE} <span>Ray <span class="lib-muted">v1.0.0</span></span></button>`;
  html += `</div>`;

  html += `<div class="lib-divider"></div>`;
  html += `<h4 class="lib-muted">Selection</h4>`;
  html += `</div>`;

  el.innerHTML = html;

  // Append interactive project list
  const section = el.querySelector('.lib-settings-section')!;
  section.appendChild(renderProjectList(PROJECTS, openEntryFn));

  return el;
}

// ─── Render: Display Panel ──────────────────────────────────────────────────

function renderDisplayPanel(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'lib-display-panel';

  el.innerHTML = `
    <div class="lib-row lib-row-middle">
      <span class="lib-panel-icon lib-panel-icon-lg">${ICON_CIRCLE}</span>
      <h2>Ray</h2>
    </div>
    <div class="lib-display-socials">${renderSocials()}</div>
  `;

  return el;
}

// ─── Panel Factories ────────────────────────────────────────────────────────

function openEntryAsPanel(entry: Entry): void {
  if (!ideLayoutInstance) return;

  const panelId = entry.library
    ? `entry-${entry.library}-${entry.name}`
    : entry.reference
      ? `entry-${entry.name}-${entry.reference.name}`
      : `entry-${entry.name}`;

  const isLibrary = entry.type === 'library';
  const defaultIcon = isLibrary ? 'git-repo' : 'circle';

  ideLayoutInstance.openPanel({
    id: panelId,
    title: entry.name,
    icon: iconForName(entry.icon || defaultIcon),
    closable: true,
    render: (container: HTMLElement) => {
      container.appendChild(renderEntryView(entry, openEntryAsPanel, { isTopLevel: true }));
    },
  });
}

function makeProjectsPanel(): PanelDefinition {
  return {
    id: 'projects',
    title: 'Projects',
    icon: ICON_REPO,
    closable: false,
    render: (container: HTMLElement) => {
      container.appendChild(renderProjectList(PROJECTS, openEntryAsPanel));
    },
  };
}

function makeDisplayPanel(): PanelDefinition {
  return {
    id: 'display',
    title: 'Ray',
    icon: ICON_CIRCLE,
    closable: false,
    render: (container: HTMLElement) => {
      container.appendChild(renderDisplayPanel());
    },
  };
}

function makeSettingsPanel(): PanelDefinition {
  return {
    id: 'settings',
    title: 'Settings',
    icon: ICON_SETTINGS,
    closable: false,
    render: (container: HTMLElement) => {
      container.appendChild(renderSettingsPanel(openEntryAsPanel));
    },
  };
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    /* ---- Library Page ---- */
    .lib-page {
      width: 100%;
      min-height: 100vh;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      box-sizing: border-box;
    }

    .lib-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 15px;
      width: 100%;
      box-sizing: border-box;
    }
    .lib-header-left {
      flex-shrink: 0;
    }
    .lib-header-center {
      text-align: center;
    }
    .lib-header-center h1 {
      margin: 0;
      font-size: 20px;
      font-weight: bold;
      text-shadow: 0 0 4px rgba(255,255,255,0.5), 0 0 11px rgba(255,255,255,0.22);
    }

    .lib-layout-container {
      width: 100%;
      height: calc(100vh - 80px);
      max-width: 1650px;
      margin: 0 auto;
      padding-top: 10px;
      box-sizing: border-box;
    }

    /* ---- Socials ---- */
    .lib-socials {
      display: flex;
      justify-content: center;
      gap: 12px;
      padding-top: 4px;
    }
    .lib-social-link {
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 12px;
    }
    .lib-social-link:hover {
      color: ${PHOSPHOR};
    }

    /* ---- Generic Row/Flex ---- */
    .lib-row {
      display: flex;
      gap: 6px;
    }
    .lib-row-middle {
      align-items: center;
    }
    .lib-row-between {
      justify-content: space-between;
    }
    .lib-inline-row {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .lib-indent {
      padding-left: 20px;
    }

    /* ---- Text Utilities ---- */
    .lib-muted {
      color: rgba(255,255,255,0.45);
    }
    .lib-disabled {
      color: rgba(255,255,255,0.3);
    }

    /* ---- Selectable Entry ---- */
    .lib-selectable-entry {
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.1s;
    }
    .lib-selectable-entry:hover {
      background: rgba(255,255,255,0.05);
    }
    .lib-selectable-entry--selected {
      background: rgba(255,255,255,0.1);
    }

    /* ---- Entry View ---- */
    .lib-entry-view {
      margin-bottom: 2px;
    }
    .lib-entry-name {
      margin-left: 6px;
    }
    .lib-entry-title {
      margin: 0;
      font-size: 16px;
    }
    .lib-entry-left {
      flex: 1 1 auto;
      min-width: 0;
      padding-left: 6px;
    }
    .lib-entry-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    /* ---- Selectors (version/language) ---- */
    .lib-selectors {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }

    /* ---- Buttons ---- */
    .lib-btn {
      background: none;
      border: none;
      color: ${PHOSPHOR};
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      padding: 3px 6px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .lib-btn:hover {
      background: rgba(255,255,255,0.08);
    }
    .lib-btn-icon {
      padding: 2px;
    }
    .lib-selector-btn {
      font-size: 13px;
    }
    .lib-lang-btn {
      font-size: 10px;
      padding: 1px 4px;
    }
    .lib-back-btn {
      padding: 6px 10px;
      font-size: 14px;
    }

    /* ---- Snippet ---- */
    .lib-snippet {
      width: 100%;
      font-size: 12px;
      padding: 8px 10px;
      margin: 4px 0;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 4px;
      box-sizing: border-box;
      color: rgba(255,255,255,0.6);
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* ---- Dropdown ---- */
    .lib-dropdown {
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 180px;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    }
    .lib-dropdown-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.1s;
    }
    .lib-dropdown-item:hover {
      background: rgba(255,255,255,0.08);
    }
    .lib-dropdown-item--active {
      background: rgba(255,255,255,0.05);
    }
    .lib-dropdown-item--header {
      cursor: default;
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .lib-dropdown-item--header:hover {
      background: none;
    }
    .lib-dropdown-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }
    .lib-dropdown-tags {
      margin-left: auto;
      display: flex;
      gap: 4px;
    }

    /* ---- Tag (language badge inside dropdown) ---- */
    .lib-tag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      font-size: 11px;
      cursor: pointer;
      color: rgba(255,255,255,0.6);
      transition: background 0.1s, border-color 0.1s;
    }
    .lib-tag:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.3);
    }
    .lib-tag--active {
      background: rgba(100,150,255,0.15);
      border-color: rgba(100,150,255,0.4);
      color: ${PHOSPHOR};
    }

    /* ---- Settings Panel ---- */
    .lib-settings-panel {
      padding: 8px;
    }
    .lib-settings-panel h3 {
      margin: 0;
      font-size: 16px;
    }
    .lib-settings-section {
      margin-top: 12px;
    }
    .lib-settings-section h4 {
      margin: 8px 0 4px;
      font-size: 13px;
    }
    .lib-setting-group {
      margin-bottom: 8px;
    }
    .lib-setting-value {
      width: 100%;
      justify-content: flex-start;
      text-align: left;
      padding: 6px 8px;
    }
    .lib-edit-icon {
      margin-left: 8px;
      opacity: 0.4;
    }
    .lib-divider {
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 12px 0;
    }

    /* ---- Display Panel ---- */
    .lib-display-panel {
      padding: 12px;
    }
    .lib-display-panel h2 {
      margin: 0;
      font-size: 22px;
    }
    .lib-display-socials {
      padding-left: 30px;
      margin-top: 8px;
    }

    /* ---- Panel Icon ---- */
    .lib-panel-icon {
      display: inline-flex;
      margin-right: 8px;
    }
    .lib-panel-icon-lg svg {
      width: 18px;
      height: 18px;
    }

    /* ---- Project List ---- */
    .lib-project-list {
      display: flex;
      flex-direction: column;
    }

    /* ---- Libraries Group ---- */
    .lib-libraries-group {
      margin-bottom: 2px;
    }
  `;
  document.head.appendChild(styleEl);
}

// ─── Page Render ────────────────────────────────────────────────────────────

function render(): void {
  if (!currentContainer) return;
  currentContainer.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'lib-page';

  // Header
  const header = document.createElement('div');
  header.className = 'lib-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'lib-btn lib-back-btn';
  backBtn.innerHTML = ICON_ARROW_LEFT;
  backBtn.addEventListener('click', () => {
    if (navigateFn) navigateFn('/');
  });

  const center = document.createElement('div');
  center.className = 'lib-header-center';
  center.innerHTML = `<h1>Ether Library: The Language Index</h1>${renderSocials()}`;

  header.appendChild(backBtn);
  header.appendChild(center);
  // Spacer for symmetry
  const spacer = document.createElement('div');
  spacer.style.width = '40px';
  header.appendChild(spacer);

  page.appendChild(header);

  // IDE Layout container
  const layoutContainer = document.createElement('div');
  layoutContainer.className = 'lib-layout-container';
  page.appendChild(layoutContainer);

  currentContainer.appendChild(page);

  // Reset selection state
  selectedKeys.clear();
  lastSelectedKey = null;
  selectionCounter = 0;

  // Build IDE layout
  const panels: PanelDefinition[] = [
    makeProjectsPanel(),
    makeDisplayPanel(),
    makeSettingsPanel(),
  ];

  const initialLayout: LayoutNode = {
    type: 'split',
    id: generateId(),
    direction: 'horizontal',
    children: [
      { type: 'tabgroup', id: generateId(), panels: ['projects'], activeIndex: 0 },
      { type: 'tabgroup', id: generateId(), panels: ['display'], activeIndex: 0 },
      { type: 'tabgroup', id: generateId(), panels: ['settings'], activeIndex: 0 },
    ],
    sizes: [0.25, 0.50, 0.25],
  };

  ideLayoutInstance = createIDELayout(layoutContainer, {
    panels,
    initialLayout,
    onNavigate: (path) => { if (navigateFn) navigateFn(path); },
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface LibraryParams {
  user: string;
  base: string;
}

export async function mount(
  container: HTMLElement,
  params: LibraryParams,
  navigate: (path: string) => void,
): Promise<void> {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  navigateFn = navigate;
  render();
}

export async function update(params: LibraryParams): Promise<void> {
  // Currently static — no params to react to
}

export function unmount(): void {
  closeActiveDropdown();
  if (ideLayoutInstance) { ideLayoutInstance.unmount(); ideLayoutInstance = null; }
  currentContainer = null;
  navigateFn = null;
  entrySelectedTag.clear();
  entrySelectedLang.clear();
  selectedKeys.clear();
  lastSelectedKey = null;
  selectionCounter = 0;
}
