// ============================================================
// Chat.ts — Full chat page: hub, conversations, threads, input
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import {
  getUserChats, getChatConversation, getOrCreateChatConversation,
  getChatThread, getCustomEmojis, getUserStatus,
  getCurrentPlayer, setUserStatus,
} from './API.ts';
import type {
  ChatConversation, ChatMessage, ChatThread,
  ChatAttachment, UserStatus,
} from './API.ts';
import type { ChatParams } from './Router.ts';
import {
  escapeHtml, formatTime,
  getUserProfilePic, userLink,
  getTimelineStyles, getChatMessageStyles,
  setupMeButtonCapture, teardownMeButtonCapture,
} from './ChatCommon.ts';
import type { TimelineEntry } from './ChatCommon.ts';
import { createChatView } from './ChatView.ts';
import type { ChatView, SendContext } from './ChatView.ts';
import {
  CHAT_SVG, PLUS_SVG,
  PIN_SVG, BOOKMARK_SVG,
  SEARCH_SVG,
  STATUS_ONLINE_SVG, STATUS_AWAY_SVG, STATUS_DND_SVG, STATUS_INVISIBLE_SVG,
} from './ChatIcons.ts';
import { ARROW_LEFT_SVG, COMMENT_SVG } from './PRIcons.ts';

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let currentParams: ChatParams | null = null;
let sidebarOpen = false;
let statusPickerOpen = false;
let currentHubFilter: 'all' | 'dms' | 'groups' | 'archived' = 'all';
let renderInFlight = false;
let chatView: ChatView | null = null;

// ---- Styles ----

function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = getTimelineStyles() + `
    .chat-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px 0;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      min-height: 100vh;
      box-sizing: border-box;
    }
    .chat-page .repo-header {
      display: flex; align-items: baseline; gap: 8px;
      font-size: 22px; margin-bottom: 8px;
      text-shadow: 0 0 4px rgba(255,255,255,0.5), 0 0 11px rgba(255,255,255,0.22);
    }
    .chat-page .repo-header .user { color: rgba(255,255,255,0.55); }
    .chat-page .repo-header .sep { color: rgba(255,255,255,0.25); }
    .chat-page .repo-header .repo-name { color: ${PHOSPHOR}; font-weight: bold; }
    .chat-page .repo-header a { color: inherit; text-decoration: none; }
    .chat-page .repo-header a:hover { text-decoration: underline; }
    .chat-back-link {
      display: inline-flex; align-items: center; gap: 6px;
      color: rgba(255,255,255,0.5); text-decoration: none;
      font-size: 13px; margin-bottom: 16px; cursor: pointer;
    }
    .chat-back-link:hover { color: ${PHOSPHOR}; }
    .chat-back-link svg { width: 16px; height: 16px; fill: currentColor; }

    /* ---- Hub ---- */
    .chat-hub-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .chat-hub-status {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.1);
      background: none;
      color: rgba(255,255,255,0.5);
      font-family: inherit;
      font-size: 12px;
      position: relative;
    }
    .chat-hub-status:hover { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.7); }
    .chat-hub-status svg { width: 10px; height: 10px; }
    .chat-status-picker {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 4px;
      z-index: 100;
      min-width: 140px;
      display: none;
    }
    .chat-status-picker.open { display: block; }
    .chat-status-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }
    .chat-status-option:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
    .chat-status-option svg { width: 10px; height: 10px; }

    .chat-new-group-btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 26px; padding: 0 10px; border-radius: 6px;
      font-family: inherit; font-size: 12px; cursor: pointer;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.65); transition: background 0.15s, color 0.15s;
    }
    .chat-new-group-btn:hover { background: rgba(255,255,255,0.12); color: ${PHOSPHOR}; }
    .chat-new-group-btn svg { width: 14px; height: 14px; fill: currentColor; }

    /* Hub filter tabs */
    .chat-filter-tabs {
      display: flex; gap: 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 0;
    }
    .chat-filter-tab {
      padding: 10px 18px; font-size: 13px; color: rgba(255,255,255,0.4);
      cursor: pointer; border: none; background: none;
      border-bottom: 2px solid transparent; font-family: inherit;
    }
    .chat-filter-tab:hover { color: rgba(255,255,255,0.65); }
    .chat-filter-tab.active { color: ${PHOSPHOR}; border-bottom-color: ${PHOSPHOR}; }

    /* Conversation rows */
    .chat-conv-list {
      border: 1px solid rgba(255,255,255,0.1);
      border-top: none;
      border-radius: 0 0 6px 6px;
    }
    .chat-conv-row {
      display: flex; align-items: center; padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: pointer; transition: background 0.1s; gap: 12px;
      text-decoration: none; color: inherit;
    }
    .chat-conv-row:last-child { border-bottom: none; }
    .chat-conv-row:hover { background: rgba(255,255,255,0.04); }
    .chat-conv-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.05);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; overflow: hidden; position: relative;
    }
    .chat-conv-avatar svg { width: 18px; height: 18px; fill: currentColor; color: rgba(255,255,255,0.4); }
    .chat-conv-avatar img { width: 36px; height: 36px; object-fit: cover; border-radius: 50%; }
    .chat-conv-status-dot {
      position: absolute; bottom: 0; right: 0;
      width: 10px; height: 10px; border-radius: 50%;
      border: 2px solid #0a0a0a;
    }
    .chat-conv-body { flex: 1; min-width: 0; }
    .chat-conv-name { font-size: 14px; font-weight: bold; color: rgba(255,255,255,0.85); }
    .chat-conv-row:hover .chat-conv-name { color: ${PHOSPHOR}; }
    .chat-conv-preview {
      font-size: 12px; color: rgba(255,255,255,0.35);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chat-conv-meta { flex-shrink: 0; text-align: right; }
    .chat-conv-time { font-size: 11px; color: rgba(255,255,255,0.3); }
    .chat-unread-badge {
      display: inline-block; background: rgba(255,255,255,0.08);
      padding: 1px 7px; border-radius: 10px; font-size: 11px;
      color: rgba(255,255,255,0.65); margin-top: 4px;
    }
    .chat-saved-row { opacity: 0.7; }
    .chat-saved-row:hover { opacity: 1; }

    /* ---- Conversation View — matches PR detail layout ---- */
    .chat-conv-page { position: relative; }
    .chat-conv-title-row {
      display: flex; align-items: center; gap: 10px;
    }
    .chat-conv-title {
      font-size: 24px; font-weight: bold; color: ${PHOSPHOR};
      text-shadow: 0 0 4px rgba(255,255,255,0.5), 0 0 11px rgba(255,255,255,0.22);
    }
    .chat-conv-meta-row {
      font-size: 13px; color: rgba(255,255,255,0.35);
      display: flex; align-items: center; gap: 8px;
    }
    .chat-conv-meta-row a { color: rgba(255,255,255,0.5); text-decoration: none; }
    .chat-conv-meta-row a:hover { color: ${PHOSPHOR}; text-decoration: underline; }
    .chat-header-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
    .chat-header-btn {
      width: 28px; height: 28px; border-radius: 4px;
      border: none; background: none; cursor: pointer;
      color: rgba(255,255,255,0.35); padding: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .chat-header-btn:hover { color: rgba(255,255,255,0.7); }
    .chat-header-btn svg { width: 16px; height: 16px; fill: currentColor; }

    /* Sticky header */
    .chat-sticky-header {
      position: sticky; top: 0; z-index: 15;
      background: ${CRT_SCREEN_BG};
      padding: 12px 0;
    }
    /* .me-button.in-header is in getTimelineStyles() (shared) */

    /* Search bar — inline in header-actions next to the search icon */
    .chat-search-bar {
      display: none; align-items: center; gap: 4px;
    }
    .chat-search-bar.open { display: flex; }
    .chat-search-input {
      width: 180px; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
      padding: 4px 12px; color: ${PHOSPHOR}; font-family: inherit;
      font-size: 12px; outline: none;
    }
    .chat-search-input:focus { border-color: rgba(255,255,255,0.25); }
    .chat-search-nav {
      width: 22px; height: 22px; border: none; background: none;
      cursor: pointer; color: rgba(255,255,255,0.35); padding: 0;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px;
    }
    .chat-search-nav:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.06); }
    .chat-search-nav svg { width: 12px; height: 12px; fill: currentColor; }
    .chat-search-count { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; }
    .chat-search-highlight { background: rgba(234,184,50,0.3); border-radius: 2px; }
    .chat-search-highlight.current { background: rgba(234,184,50,0.6); }

    /* Pinned bar */
    .chat-pinned-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
      font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 16px;
    }
    .chat-pinned-bar:hover { background: rgba(255,255,255,0.04); }
    .chat-pinned-bar svg { width: 14px; height: 14px; fill: currentColor; }

    /* Message timeline */
    .chat-message-list { margin-bottom: 0; }

    /* Date separator + message styles from ChatCommon */
    ` + getChatMessageStyles() + `

    /* Typing indicator */
    .chat-typing {
      padding: 4px 0;
      font-size: 12px; color: rgba(255,255,255,0.25);
      min-height: 20px;
    }
    .chat-typing-dots { display: inline-flex; gap: 3px; }
    .chat-typing-dots span {
      width: 4px; height: 4px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      animation: chat-pulse 1.4s infinite;
    }
    .chat-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .chat-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes chat-pulse { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }

    /* Scroll down button — sits above the sticky input */
    .chat-scroll-down {
      position: sticky; bottom: 72px;
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
      cursor: pointer; display: none;
      align-items: center; justify-content: center;
      z-index: 21; color: rgba(255,255,255,0.5);
      margin-left: auto; margin-bottom: -36px;
    }
    .chat-scroll-down.visible { display: flex; }
    .chat-scroll-down:hover { background: rgba(255,255,255,0.15); color: ${PHOSPHOR}; }
    .chat-scroll-down svg { width: 20px; height: 20px; fill: currentColor; }

    /* Expand box, thread create styles are in getChatMessageStyles() (shared) */

    /* Autocomplete dropdown */
    .chat-autocomplete {
      position: absolute; bottom: 100%; left: 0; right: 0;
      background: #0e0e0e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; max-height: 200px; overflow-y: auto;
      display: none; z-index: 50;
    }
    .chat-autocomplete.open { display: block; }
    .chat-autocomplete-item {
      padding: 8px 12px; font-size: 12px;
      color: rgba(255,255,255,0.5); cursor: pointer;
    }
    .chat-autocomplete-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
    .chat-autocomplete-item.active { background: rgba(255,255,255,0.08); color: ${PHOSPHOR}; }

    /* .chat-voice-tooltip is in getChatMessageStyles() (shared) */

    /* Drag-drop overlay */
    .chat-dropzone {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,200,80,0.08);
      border: 2px dashed rgba(0,200,80,0.4);
      display: none; align-items: center; justify-content: center;
      font-size: 16px; color: rgba(0,200,80,0.6);
      border-radius: 0;
    }
    .chat-dropzone.visible { display: flex; }

    /* Sidebar */
    .chat-sidebar {
      position: fixed; right: 0; top: 0; bottom: 0;
      width: 300px; background: #0a0a0a;
      border-left: 1px solid rgba(255,255,255,0.1);
      z-index: 150; transform: translateX(100%);
      transition: transform 0.2s; overflow-y: auto;
      padding: 16px;
    }
    .chat-sidebar.open { transform: translateX(0); }
    .chat-sidebar-close {
      float: right; background: none; border: none;
      cursor: pointer; color: rgba(255,255,255,0.4);
      font-size: 18px;
    }
    .chat-sidebar-close:hover { color: ${PHOSPHOR}; }
    .chat-sidebar-section { margin-top: 16px; }
    .chat-sidebar-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.25); margin-bottom: 8px; }
    .chat-sidebar-participant {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 0; font-size: 13px;
    }

    /* Edit history popup */
    .chat-edit-history {
      position: absolute; z-index: 100;
      background: #0e0e0e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; padding: 12px; max-width: 400px;
      max-height: 300px; overflow-y: auto;
    }
    .chat-edit-history-item {
      padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 12px; color: rgba(255,255,255,0.4);
    }
    .chat-edit-history-item:last-child { border-bottom: none; }

    /* Search highlight */
    .chat-msg.search-match { background: rgba(255,200,0,0.06); border-radius: 4px; }
    .chat-msg.search-current { background: rgba(255,200,0,0.12); }

    @media (max-width: 768px) {
      .chat-sidebar { width: 100%; }
      .chat-page { padding: 16px 16px 0; }
      .chat-conv-title { font-size: 20px; }
      /* Dissolve wrappers so all items become direct flex children of sticky-header */
      .chat-sticky-header {
        display: flex; flex-wrap: wrap; align-items: center; column-gap: 10px;
      }
      .chat-conv-title-row { display: contents; }
      .chat-header-actions { display: contents; }
      /* Order: title + icons on row 1, meta on row 2, search bar on row 3 */
      .chat-conv-title { order: 1; }
      .chat-header-btn { order: 2; margin-left: auto; }
      .me-button.in-header { order: 3; }
      .chat-conv-meta-row { order: 4; width: 100%; }
      .chat-search-bar.open { order: 5; width: 100%; margin-top: 6px; }
      .chat-search-bar .chat-search-input { flex: 1; width: auto; }
    }
  `;
  document.head.appendChild(styleEl);
}

// ---- Helper functions ----

function statusDotSvg(status: UserStatus): string {
  switch (status) {
    case 'online': return STATUS_ONLINE_SVG;
    case 'away': return STATUS_AWAY_SVG;
    case 'dnd': return STATUS_DND_SVG;
    case 'invisible': return STATUS_INVISIBLE_SVG;
    default: return STATUS_ONLINE_SVG;
  }
}

function statusColor(status: UserStatus): string {
  switch (status) {
    case 'online': return '#4ade80';
    case 'away': return '#fbbf24';
    case 'dnd': return '#f87171';
    case 'invisible': return 'rgba(255,255,255,0.2)';
    default: return '#4ade80';
  }
}

function getLastRead(convId: string): number {
  const raw = localStorage.getItem(`ether:chat-lastread:${convId}`);
  return raw ? parseInt(raw, 10) : 0;
}

function setLastRead(convId: string): void {
  localStorage.setItem(`ether:chat-lastread:${convId}`, String(Date.now()));
}

function getUnreadCount(conv: ChatConversation): number {
  const lastRead = getLastRead(conv.id);
  if (!lastRead) return conv.messages.length > 0 ? conv.messages.length : 0;
  return conv.messages.filter(m => new Date(m.createdAt).getTime() > lastRead).length;
}

function getDraft(convId: string): string {
  return localStorage.getItem(`ether:chat-draft:${convId}`) || '';
}

function saveDraft(convId: string, text: string): void {
  if (text) localStorage.setItem(`ether:chat-draft:${convId}`, text);
  else localStorage.removeItem(`ether:chat-draft:${convId}`);
}

function getBookmarks(): number[] {
  const raw = localStorage.getItem('ether:chat-bookmarks');
  return raw ? JSON.parse(raw) : [];
}

function setBookmarks(ids: number[]): void {
  localStorage.setItem('ether:chat-bookmarks', JSON.stringify(ids));
}

function toggleBookmark(msgId: number): boolean {
  const bm = getBookmarks();
  const idx = bm.indexOf(msgId);
  if (idx >= 0) { bm.splice(idx, 1); setBookmarks(bm); return false; }
  bm.push(msgId);
  setBookmarks(bm);
  return true;
}

function getConversationName(conv: ChatConversation, currentUser: string): string {
  if (conv.groupName) return conv.groupName;
  if (conv.isGroup) return conv.worldId || 'Group Chat';
  const other = conv.participants.find(p => p !== currentUser);
  return other ? `@${other}` : 'Chat';
}

function buildChatUrl(user: string, conv: ChatConversation): string {
  if (conv.isGroup && conv.worldId) {
    return `/@${user}/chat/~/${conv.worldId}`;
  }
  const other = conv.participants.find(p => p !== user);
  return `/@${user}/chat/~/@${other || user}`;
}

// ---- Render: Hub ----

async function renderChatHub(params: ChatParams): Promise<string> {
  const currentUser = params.user || getCurrentPlayer();
  const convs = await getUserChats(currentUser);
  const myStatus = await getUserStatus(currentUser);
  const bookmarks = getBookmarks();

  let html = `<div class="chat-page">`;

  // Breadcrumb header
  html += `<div class="repo-header"><a href="/@${escapeHtml(currentUser)}" class="user">@${escapeHtml(currentUser)}</a><span class="sep">/</span><span class="repo-name">chat</span></div>`;

  // Header with status
  html += `<div class="chat-hub-header">`;
  html += `<button class="chat-new-group-btn" data-new-group>${PLUS_SVG} New Group</button>`;
  html += `<button class="chat-hub-status" data-status-toggle>`;
  html += `${statusDotSvg(myStatus)} ${myStatus}`;
  html += `<div class="chat-status-picker${statusPickerOpen ? ' open' : ''}" data-status-picker>`;
  for (const s of ['online', 'away', 'dnd', 'invisible'] as UserStatus[]) {
    html += `<button class="chat-status-option" data-set-status="${s}">${statusDotSvg(s)} ${s}</button>`;
  }
  html += `</div></button>`;
  html += `</div>`;

  // Filter tabs
  html += `<div class="chat-filter-tabs">`;
  for (const tab of ['all', 'dms', 'groups', 'archived'] as const) {
    html += `<button class="chat-filter-tab${currentHubFilter === tab ? ' active' : ''}" data-hub-filter="${tab}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>`;
  }
  html += `</div>`;

  // Saved messages row
  if (bookmarks.length > 0) {
    html += `<div class="chat-conv-list">`;
    html += `<div class="chat-conv-row chat-saved-row" data-saved-messages>`;
    html += `<div class="chat-conv-avatar">${BOOKMARK_SVG}</div>`;
    html += `<div class="chat-conv-body"><div class="chat-conv-name">Saved Messages</div><div class="chat-conv-preview">${bookmarks.length} bookmarked message${bookmarks.length !== 1 ? 's' : ''}</div></div>`;
    html += `</div>`;
    html += `</div>`;
  }

  // Conversation list
  html += `<div class="chat-conv-list">`;

  const filtered = convs.filter(c => {
    if (currentHubFilter === 'dms') return !c.isGroup && !c.archived;
    if (currentHubFilter === 'groups') return c.isGroup && !c.archived;
    if (currentHubFilter === 'archived') return c.archived;
    return !c.archived;
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  for (const conv of filtered) {
    const name = getConversationName(conv, currentUser);
    const lastMsg = conv.messages[conv.messages.length - 1];
    const preview = lastMsg ? `${lastMsg.author}: ${lastMsg.body.slice(0, 60)}` : 'No messages yet';
    const time = lastMsg ? formatTime(lastMsg.createdAt) : '';
    const unread = getUnreadCount(conv);
    const isMuted = conv.mutedBy?.includes(currentUser);
    const url = buildChatUrl(currentUser, conv);

    // Get avatar
    let avatarHtml: string;
    if (conv.isGroup) {
      avatarHtml = CHAT_SVG;
    } else {
      const other = conv.participants.find(p => p !== currentUser) || currentUser;
      const pic = await getUserProfilePic(`@${other}`);
      avatarHtml = pic ? `<img src="${pic}" alt="@${other}" />` : COMMENT_SVG;
    }

    // Get status for DMs
    let statusDot = '';
    if (!conv.isGroup) {
      const other = conv.participants.find(p => p !== currentUser) || currentUser;
      const otherStatus = await getUserStatus(other);
      statusDot = `<div class="chat-conv-status-dot" style="background:${statusColor(otherStatus)}"></div>`;
    }

    html += `<a href="${url}" data-link class="chat-conv-row" data-conv-id="${conv.id}">`;
    html += `<div class="chat-conv-avatar">${avatarHtml}${statusDot}</div>`;
    html += `<div class="chat-conv-body">`;
    html += `<div class="chat-conv-name">${escapeHtml(name)}${isMuted ? ' <span style="color:rgba(255,255,255,0.2)">(muted)</span>' : ''}</div>`;
    html += `<div class="chat-conv-preview">${escapeHtml(preview)}</div>`;
    html += `</div>`;
    html += `<div class="chat-conv-meta">`;
    html += `<div class="chat-conv-time">${time}</div>`;
    if (unread > 0 && !isMuted) html += `<div class="chat-unread-badge">${unread}</div>`;
    html += `</div></a>`;
  }

  if (filtered.length === 0) {
    html += `<div style="padding:40px;text-align:center;color:rgba(255,255,255,0.25)">No conversations yet</div>`;
  }

  html += `</div></div>`;
  return html;
}

// ---- Render: Conversation (via ChatView) ----

async function renderConversationView(params: ChatParams): Promise<void> {
  if (!currentContainer) return;
  const currentUser = params.user || getCurrentPlayer();
  const conv = await getChatConversation(params.conversationId) ||
    await getOrCreateChatConversation(params.conversationId, params.targetUser ? [currentUser, params.targetUser] : [currentUser]);
  const emojis = await getCustomEmojis(currentUser);
  const name = params.targetUser ? `@${params.targetUser}` : getConversationName(conv, currentUser);

  // Mark as read
  setLastRead(conv.id);

  const pinnedMsgs = conv.messages.filter(m => m.pinned);
  const participants = conv.participants.length;

  // Build wrapper HTML around the ChatView
  let wrapper = `<div class="chat-page"><div class="chat-conv-page">`;
  wrapper += `<div class="repo-header"><a href="/@${escapeHtml(currentUser)}" class="user">@${escapeHtml(currentUser)}</a><span class="sep">/</span><a href="/@${escapeHtml(currentUser)}/chat" class="repo-name">chat</a></div>`;
  wrapper += `<a class="chat-back-link" data-chat-back>${ARROW_LEFT_SVG} Back to chat</a>`;
  wrapper += `<div data-chatview-root></div>`;
  wrapper += renderSidebar(conv, currentUser);
  wrapper += `</div></div>`;
  currentContainer.innerHTML = wrapper;

  const viewRoot = currentContainer.querySelector<HTMLElement>('[data-chatview-root]')!;

  chatView?.destroy();
  chatView = createChatView(viewRoot, navigateFn!, {
    getEntries: async () => {
      const c = await getChatConversation(params.conversationId) ||
        await getOrCreateChatConversation(params.conversationId, params.targetUser ? [currentUser, params.targetUser] : [currentUser]);
      return c.messages.map(msg => ({
        kind: 'message' as const,
        createdAt: msg.createdAt,
        message: msg,
      }));
    },
    getHeaderHtml: () => {
      let h = `<div class="chat-conv-title-row">`;
      h += `<span class="chat-conv-title" data-open-sidebar>${escapeHtml(name)}</span>`;
      h += `<div class="chat-header-actions">`;
      h += `<div class="chat-search-bar">`;
      h += `<input class="chat-search-input" placeholder="Search..." value="" data-search-input />`;
      h += `<button class="chat-search-nav" data-search-prev title="Previous">&#9650;</button>`;
      h += `<button class="chat-search-nav" data-search-next title="Next">&#9660;</button>`;
      h += `<span class="chat-search-count" data-search-count></span>`;
      h += `</div>`;
      h += `<button class="chat-header-btn" data-chat-search title="Search">${SEARCH_SVG}</button>`;
      h += `</div></div>`;
      h += `<div class="chat-conv-meta-row">`;
      if (params.targetUser) {
        h += `Conversation with <a href="/@${escapeHtml(params.targetUser)}">@${escapeHtml(params.targetUser)}</a>`;
      } else if (conv.isGroup) {
        h += `${participants} participant${participants !== 1 ? 's' : ''}`;
      }
      h += `</div>`;
      return h;
    },
    headerClass: 'chat-sticky-header',
    placeholder: 'Message...',
    getDraft: () => getDraft(conv.id),
    emojis,
    getAllMessages: () => conv.messages,
    timelineOptions: {
      emojis,
      conversationId: conv.id,
      userBase: `@${currentUser}`,
    },
    features: {
      search: true,
      scrollDown: true,
      dragDrop: true,
      voiceRecord: true,
      contextMenu: true,
      threads: true,
      reply: true,
      attachments: true,
    },
    onSend: async (text, ctx) => sendMessage(text, ctx),
    onInput: (text) => saveDraft(conv.id, text),
    onReaction: async (msgId, emoji) => toggleChatReaction(conv, msgId, emoji),
    onRender: () => chatView?.render(),
    afterHeader: () => {
      const pinned = conv.messages.filter(m => m.pinned);
      return pinned.length > 0
        ? `<div class="chat-pinned-bar" data-show-pinned>${PIN_SVG} ${pinned.length} pinned message${pinned.length !== 1 ? 's' : ''}</div>`
        : '';
    },
    afterTimeline: () => `<div class="chat-typing" data-typing-indicator></div>`,
    onBindEvents: (c) => {
      // Back button
      c.closest('.chat-conv-page')?.querySelector('[data-chat-back]')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateFn?.(`/@${currentUser}/chat`);
      });

      // Open sidebar
      c.querySelector('[data-open-sidebar]')?.addEventListener('click', () => {
        sidebarOpen = true;
        currentContainer?.querySelector('[data-sidebar]')?.classList.add('open');
      });

      // Sidebar events
      bindSidebarEvents(currentContainer!, conv, currentUser);

      // Thread navigation (convert thread ID to full URL)
      c.querySelectorAll<HTMLElement>('[data-thread-nav]').forEach(el => {
        const origHandler = el.onclick;
        el.addEventListener('click', () => {
          const threadId = el.dataset.threadNav;
          if (threadId && currentParams) {
            const base = currentParams.base || `/@${currentParams.user}`;
            const target = currentParams.targetUser ? `@${currentParams.targetUser}` : currentParams.worldId || '';
            navigateFn?.(`${base}/chat/~/${target}/~${threadId}`);
          }
        });
      });
    },
  });
  await chatView.render();
}

// ---- Render: Thread (via ChatView) ----

async function renderThreadView(params: ChatParams): Promise<void> {
  if (!currentContainer) return;
  const currentUser = params.user || getCurrentPlayer();
  const thread = await getChatThread(params.conversationId, params.threadId!);
  const emojis = await getCustomEmojis(currentUser);

  if (!thread) {
    currentContainer.innerHTML = `<div class="chat-page"><div class="chat-conv-page"><a class="chat-back-link" data-chat-back>${ARROW_LEFT_SVG} Back</a><div class="chat-conv-title">Thread not found</div></div></div>`;
    currentContainer.querySelector('[data-chat-back]')?.addEventListener('click', (e) => {
      e.preventDefault();
      const base = params.base || `/@${params.user}`;
      const target = params.targetUser ? `@${params.targetUser}` : params.worldId || '';
      navigateFn?.(`${base}/chat/~/${target}`);
    });
    return;
  }

  let wrapper = `<div class="chat-page"><div class="chat-conv-page">`;
  wrapper += `<div class="repo-header"><a href="/@${escapeHtml(currentUser)}" class="user">@${escapeHtml(currentUser)}</a><span class="sep">/</span><a href="/@${escapeHtml(currentUser)}/chat" class="repo-name">chat</a></div>`;
  wrapper += `<a class="chat-back-link" data-chat-back>${ARROW_LEFT_SVG} Back to conversation</a>`;
  wrapper += `<div data-chatview-root></div>`;
  wrapper += `</div></div>`;
  currentContainer.innerHTML = wrapper;

  const viewRoot = currentContainer.querySelector<HTMLElement>('[data-chatview-root]')!;
  const conv = await getChatConversation(params.conversationId);

  chatView?.destroy();
  chatView = createChatView(viewRoot, navigateFn!, {
    getEntries: async () => {
      const t = await getChatThread(params.conversationId, params.threadId!);
      return (t?.messages ?? []).map(msg => ({
        kind: 'message' as const,
        createdAt: msg.createdAt,
        message: msg,
      }));
    },
    getHeaderHtml: () => {
      let h = `<div class="chat-conv-title-row"><span class="chat-conv-title">Thread: ${escapeHtml(thread.title)}</span></div>`;
      h += `<div class="chat-conv-meta-row">Started by <a href="/@${escapeHtml(thread.createdBy)}">@${escapeHtml(thread.createdBy)}</a> · ${formatTime(thread.createdAt)}</div>`;
      return h;
    },
    headerClass: 'chat-sticky-header',
    placeholder: 'Message...',
    getDraft: () => conv ? getDraft(conv.id) : '',
    emojis,
    getAllMessages: () => thread.messages,
    timelineOptions: {
      emojis,
      conversationId: params.conversationId,
      userBase: `@${currentUser}`,
    },
    features: {
      search: false,
      scrollDown: true,
      contextMenu: true,
      reply: true,
      attachments: true,
    },
    onSend: async (text, ctx) => sendMessage(text, ctx),
    onInput: (text) => { if (conv) saveDraft(conv.id, text); },
    onReaction: async (msgId, emoji) => {
      const msg = thread.messages.find(m => m.id === msgId);
      if (msg) toggleReactionOnMsg(msg, emoji);
    },
    onRender: () => chatView?.render(),
    afterTimeline: () => `<div class="chat-typing" data-typing-indicator></div>`,
    onBindEvents: (c) => {
      // Back button
      c.closest('.chat-conv-page')?.querySelector('[data-chat-back]')?.addEventListener('click', (e) => {
        e.preventDefault();
        const base = params.base || `/@${params.user}`;
        const target = params.targetUser ? `@${params.targetUser}` : params.worldId || '';
        navigateFn?.(`${base}/chat/~/${target}`);
      });
    },
  });
  await chatView.render();
}

// ---- Reaction helpers ----

function toggleReactionOnMsg(msg: ChatMessage, emoji: string): void {
  const user = getCurrentPlayer();
  const existing = msg.reactions.find(r => r.emoji === emoji);
  if (existing) {
    const idx = existing.users.indexOf(user);
    if (idx >= 0) existing.users.splice(idx, 1);
    else existing.users.push(user);
    if (existing.users.length === 0) msg.reactions.splice(msg.reactions.indexOf(existing), 1);
  } else {
    msg.reactions.push({ emoji, users: [user] });
  }
}

async function toggleChatReaction(conv: ChatConversation, msgId: number, emoji: string): Promise<void> {
  const msg = conv.messages.find(m => m.id === msgId);
  if (msg) toggleReactionOnMsg(msg, emoji);
}

// ---- Sidebar events ----

function bindSidebarEvents(container: HTMLElement, conv: ChatConversation, currentUser: string): void {
  container.querySelector('[data-close-sidebar]')?.addEventListener('click', () => {
    sidebarOpen = false;
    container.querySelector('[data-sidebar]')?.classList.remove('open');
  });

  container.querySelector('[data-mute-toggle]')?.addEventListener('click', async () => {
    if (!conv.mutedBy) conv.mutedBy = [];
    const idx = conv.mutedBy.indexOf(currentUser);
    if (idx >= 0) conv.mutedBy.splice(idx, 1);
    else conv.mutedBy.push(currentUser);
    chatView?.render();
  });

  container.querySelector('[data-archive-toggle]')?.addEventListener('click', async () => {
    conv.archived = !conv.archived;
    chatView?.render();
  });
}

// ---- Render: Sidebar ----

function renderSidebar(conv: ChatConversation, currentUser: string): string {
  let html = `<div class="chat-sidebar${sidebarOpen ? ' open' : ''}" data-sidebar>`;
  html += `<button class="chat-sidebar-close" data-close-sidebar>&times;</button>`;

  if (conv.isGroup) {
    html += `<h3 style="margin-top:0">${escapeHtml(conv.groupName || conv.worldId || 'Group Chat')}</h3>`;
    html += `<div class="chat-sidebar-section">`;
    html += `<div class="chat-sidebar-label">Participants (${conv.participants.length})</div>`;
    for (const p of conv.participants) {
      html += `<div class="chat-sidebar-participant"><a href="/@${p}" data-link>${userLink(p)}</a></div>`;
    }
    html += `</div>`;
  } else {
    const other = conv.participants.find(p => p !== currentUser) || currentUser;
    html += `<h3 style="margin-top:0">@${escapeHtml(other)}</h3>`;
    html += `<div class="chat-sidebar-section"><a href="/@${other}" data-link style="color:rgba(255,255,255,0.5);font-size:13px;">View profile</a></div>`;
  }

  // Quick actions
  html += `<div class="chat-sidebar-section">`;
  html += `<div class="chat-sidebar-label">Actions</div>`;
  const isMuted = conv.mutedBy?.includes(currentUser);
  html += `<button class="chat-context-option" data-mute-toggle>${isMuted ? 'Unmute' : 'Mute'} conversation</button>`;
  html += `<button class="chat-context-option" data-archive-toggle>${conv.archived ? 'Unarchive' : 'Archive'} conversation</button>`;
  html += `</div>`;

  html += `</div>`;
  return html;
}

// renderContextMenu removed — now in ChatView

// ---- Main render ----

async function render(): Promise<void> {
  if (!currentContainer || !currentParams) return;
  if (renderInFlight) return;  // guard against overlapping renders
  renderInFlight = true;

  try {
    switch (currentParams.chatAction) {
      case 'hub': {
        chatView?.destroy();
        chatView = null;
        const html = await renderChatHub(currentParams);
        currentContainer.innerHTML = html;
        bindHubEvents();
        break;
      }
      case 'conversation':
        await renderConversationView(currentParams);
        break;
      case 'thread':
        await renderThreadView(currentParams);
        break;
      default: {
        chatView?.destroy();
        chatView = null;
        const html = await renderChatHub(currentParams);
        currentContainer.innerHTML = html;
        bindHubEvents();
      }
    }
  } finally {
    renderInFlight = false;
  }
}

// ---- Hub Event Binding ----

function bindHubEvents(): void {
  if (!currentContainer || !currentParams) return;
  const c = currentContainer;

  // @me button capture for hub (no sticky header, but setup anyway for consistency)
  setupMeButtonCapture(c);

  // Hub filter tabs
  c.querySelectorAll<HTMLElement>('[data-hub-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentHubFilter = btn.dataset.hubFilter as typeof currentHubFilter;
      render();
    });
  });

  // Status toggle
  c.querySelector('[data-status-toggle]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    statusPickerOpen = !statusPickerOpen;
    const picker = c.querySelector('[data-status-picker]');
    picker?.classList.toggle('open', statusPickerOpen);
  });

  // Set status
  c.querySelectorAll<HTMLElement>('[data-set-status]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const status = btn.dataset.setStatus as UserStatus;
      setUserStatus(getCurrentPlayer(), status);
      statusPickerOpen = false;
      render();
    });
  });

  // New group
  c.querySelector('[data-new-group]')?.addEventListener('click', () => {
    const user = getCurrentPlayer();
    const worldName = `group-${crypto.randomUUID().slice(0, 8)}`;
    navigateFn?.(`/@${user}/chat/~/${worldName}`);
  });

  // Close status picker on click anywhere
  document.addEventListener('click', () => {
    if (statusPickerOpen) { statusPickerOpen = false; c.querySelector('[data-status-picker]')?.classList.remove('open'); }
  }, { once: true });
}

// ---- Message sending ----

async function sendMessage(text: string, ctx?: SendContext): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed && (!ctx?.attachments || ctx.attachments.length === 0)) return;
  if (!currentParams) return;

  const user = currentParams.user || getCurrentPlayer();

  // Check for slash commands
  if (trimmed.startsWith('/')) {
    const handled = handleSlashCommand(trimmed, user);
    if (handled) return;
  }

  const conv = await getChatConversation(currentParams.conversationId) ||
    await getOrCreateChatConversation(currentParams.conversationId, currentParams.targetUser ? [user, currentParams.targetUser] : [user]);

  const msg: ChatMessage = {
    id: Date.now(),
    author: user,
    body: trimmed,
    createdAt: new Date().toISOString(),
    reactions: [],
    deliveryStatus: 'sending',
    replyTo: ctx?.replyToId,
    attachments: ctx?.attachments && ctx.attachments.length > 0 ? [...ctx.attachments] : undefined,
  };

  // Thread creation
  if (ctx?.threadId && ctx?.threadTitle) {
    const thread: ChatThread = {
      id: ctx.threadId,
      title: ctx.threadTitle,
      createdBy: user,
      createdAt: new Date().toISOString(),
      messages: [msg],
    };
    conv.threads.push(thread);
    msg.threadId = ctx.threadId;
    msg.threadTitle = ctx.threadTitle;
  }

  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();

  // Simulate delivery — update DOM directly instead of full re-render
  const msgId = msg.id;
  setTimeout(() => {
    msg.deliveryStatus = 'sent';
    const el = currentContainer?.querySelector(`[data-msg-id="${msgId}"] .chat-delivery-status`)
      ?? chatView?.root.querySelector(`[data-msg-id="${msgId}"] .chat-delivery-status`);
    if (el) { el.textContent = '✓'; el.setAttribute('title', 'sent'); }
  }, 300);
  setTimeout(() => {
    msg.deliveryStatus = 'delivered';
    const el = currentContainer?.querySelector(`[data-msg-id="${msgId}"] .chat-delivery-status`)
      ?? chatView?.root.querySelector(`[data-msg-id="${msgId}"] .chat-delivery-status`);
    if (el) { el.textContent = '✓✓'; el.setAttribute('title', 'delivered'); }
  }, 1000);

  // Simulate typing indicator from "other"
  const other = conv.participants.find(p => p !== user);
  if (other) {
    setTimeout(() => {
      const indicator = currentContainer?.querySelector('[data-typing-indicator]')
        ?? chatView?.root.querySelector('[data-typing-indicator]');
      if (indicator) {
        indicator.innerHTML = `${other} is typing <span class="chat-typing-dots"><span></span><span></span><span></span></span>`;
        setTimeout(() => { if (indicator) indicator.innerHTML = ''; }, 3000);
      }
    }, 1500);
  }
}

function handleSlashCommand(text: string, user: string): boolean {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/upload':
      // Upload is now handled by ChatView
      return true;
    case '/thread':
      // Thread creation is now handled by ChatView
      return true;
    case '/schedule': {
      // /schedule 5m message or /schedule ISO message
      const timeArg = parts[1];
      const msgBody = parts.slice(2).join(' ');
      if (timeArg && msgBody) {
        let scheduledFor: string;
        if (timeArg.match(/^\d+m$/)) {
          scheduledFor = new Date(Date.now() + parseInt(timeArg) * 60000).toISOString();
        } else {
          scheduledFor = new Date(timeArg).toISOString();
        }
        getChatConversation(currentParams!.conversationId).then(conv => {
          if (!conv) return;
          conv.messages.push({
            id: Date.now(),
            author: user,
            body: msgBody,
            createdAt: new Date().toISOString(),
            reactions: [],
            deliveryStatus: 'sending',
            scheduledFor,
          });
          conv.updatedAt = new Date().toISOString();
          chatView?.render();
        });
      }
      return true;
    }
    case '/status': {
      const status = parts[1] as UserStatus;
      if (['online', 'away', 'dnd', 'invisible'].includes(status)) {
        setUserStatus(user, status);
      }
      return true;
    }
    case '/mute':
      getChatConversation(currentParams!.conversationId).then(conv => {
        if (!conv) return;
        if (!conv.mutedBy) conv.mutedBy = [];
        if (!conv.mutedBy.includes(user)) conv.mutedBy.push(user);
        chatView?.render();
      });
      return true;
    case '/unmute':
      getChatConversation(currentParams!.conversationId).then(conv => {
        if (!conv) return;
        if (conv.mutedBy) {
          const idx = conv.mutedBy.indexOf(user);
          if (idx >= 0) conv.mutedBy.splice(idx, 1);
        }
        chatView?.render();
      });
      return true;
    case '/archive':
      getChatConversation(currentParams!.conversationId).then(conv => {
        if (!conv) return;
        conv.archived = true;
        navigateFn?.(`/@${user}/chat`);
      });
      return true;
    case '/export': {
      const format = parts[1]?.toLowerCase();
      if (format === 'md' || format === 'json') exportConversation(format);
      return true;
    }
    case '/pin':
      // Pin is now handled via context menu in ChatView
      return true;
    default:
      return false;
  }
}

// triggerFileUpload, startRecording, stopRecording, sendVoiceMessage removed — now in ChatView

// ---- Export ----

function exportConversation(format: 'md' | 'json'): void {
  getChatConversation(currentParams!.conversationId).then(conv => {
    if (!conv) return;

    let content: string;
    let filename: string;
    let mime: string;

    if (format === 'md') {
      content = `# Chat: ${getConversationName(conv, getCurrentPlayer())}\n\n`;
      for (const msg of conv.messages) {
        if (msg.deleted) continue;
        content += `**@${msg.author}** — ${new Date(msg.createdAt).toLocaleString()}\n\n${msg.body}\n\n---\n\n`;
      }
      filename = `chat-${conv.id}.md`;
      mime = 'text/markdown';
    } else {
      content = JSON.stringify(conv, null, 2);
      filename = `chat-${conv.id}.json`;
      mime = 'application/json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ---- Public API (mount/update/unmount) ----

export async function mount(
  container: HTMLElement,
  params: ChatParams,
  navigate: (path: string) => void,
): Promise<void> {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  currentParams = params;
  navigateFn = navigate;
  sidebarOpen = false;
  await render();
}

export async function update(params: ChatParams): Promise<void> {
  currentParams = params;
  sidebarOpen = false;
  await render();
}

export function unmount(): void {
  teardownMeButtonCapture();
  chatView?.destroy();
  chatView = null;
  currentContainer = null;
  currentParams = null;
}
