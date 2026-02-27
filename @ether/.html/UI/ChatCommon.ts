// ============================================================
// ChatCommon.ts — Shared helpers for message rendering (Chat + PullRequests)
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { renderMarkdown } from './Markdown.ts';
import { getRepository, resolveFile, getCurrentPlayer } from './API.ts';
import type { ChatMessage } from './API.ts';
import { COMMENT_SVG } from './PRIcons.ts';
import { EDIT_SVG } from './PRIcons.ts';
import { ALL_EMOJIS, EMOJI_CATEGORIES } from './EmojiData.ts';
import {
  EMOJI_SVG, REPLY_SVG, PLUS_SVG, MIC_SVG,
  UPLOAD_SVG, THREAD_SVG, SCHEDULE_SVG,
} from './ChatIcons.ts';
import type { CustomEmoji } from './API.ts';

// ---- Popup utility ----
//
// A single modular function that handles all popup lifecycle:
//   - Desktop: position fixed near anchor, clamped to viewport
//   - Mobile: full-width bottom sheet, shifts a dock element up (keyboard-style)
//   - Repositions on window resize (responsive to orientation/size changes)
//   - Click-outside-to-close
//   - Escape-to-close
//   - Returns cleanup function for manual close

export interface PopupOptions {
  /** Element or viewport point {x,y} the popup is anchored to. */
  anchor: HTMLElement | { x: number; y: number };
  /** Place popup above the anchor on desktop (default true). If false, places below. */
  preferAbove?: boolean;
  /** Max popup width on desktop in px (default 340). */
  maxWidth?: number;
  /** Max popup height on desktop in px (default 380). */
  maxHeight?: number;
  /** Viewport width at or below which mobile bottom-sheet mode activates (default 600). */
  mobileBreakpoint?: number;
  /** CSS selectors — clicks on elements matching these won't trigger close. */
  ignoreCloseOn?: string[];
  /** Called after auto-cleanup when the user clicks outside or presses Escape. */
  onClose?: () => void;
  /**
   * On mobile, this element's `bottom` style is shifted up to sit above the popup
   * (like a chat input bar sitting above a keyboard). Restored on cleanup.
   */
  mobileShiftElement?: HTMLElement;
}

/**
 * Open and manage a popup's full lifecycle.
 *
 * Usage:
 *   const close = openPopup(pickerEl, {
 *     anchor: toggleBtn,
 *     preferAbove: true,
 *     ignoreCloseOn: ['[data-emoji-toggle]'],
 *     onClose: () => { myState = false; rerender(); },
 *     mobileShiftElement: inputAreaEl,
 *   });
 *   // later, to close programmatically:
 *   close();
 */
export function openPopup(popup: HTMLElement, opts: PopupOptions): () => void {
  const {
    anchor,
    onClose,
    mobileShiftElement,
    ignoreCloseOn = [],
  } = opts;
  const maxW = opts.maxWidth ?? 340;
  const maxH = opts.maxHeight ?? 380;
  const bp = opts.mobileBreakpoint ?? 600;
  const above = opts.preferAbove !== false;

  let active = true;
  const savedBottom = mobileShiftElement ? mobileShiftElement.style.bottom : '';

  // Move the popup to document.body so position:fixed is always relative to
  // the viewport (no ancestor transform/filter/will-change containing blocks).
  // Event listeners on the popup and its children are preserved by the DOM move.
  document.body.appendChild(popup);

  // ---- Positioning ----

  const reposition = () => {
    if (!active) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (vw <= bp) {
      // Mobile: full-width bottom sheet pinned to viewport bottom
      const mobileH = Math.floor(vh * 0.45);
      popup.style.position = 'fixed';
      popup.style.left = '0';
      popup.style.right = 'auto';
      popup.style.top = `${vh - mobileH}px`;
      popup.style.bottom = 'auto';
      popup.style.width = `${vw}px`;
      popup.style.maxWidth = '';
      popup.style.maxHeight = `${mobileH}px`;
      popup.style.margin = '0';
      popup.style.borderRadius = '12px 12px 0 0';
      popup.style.zIndex = '10000';

      // Shift dock element up so it sits above the popup (keyboard-style)
      if (mobileShiftElement) {
        mobileShiftElement.style.bottom = `${mobileH}px`;
      }
      return;
    }

    // Desktop: restore mobile shift if we were previously in mobile mode
    if (mobileShiftElement) {
      mobileShiftElement.style.bottom = savedBottom;
    }

    // Resolve anchor to a viewport rect
    const rect = anchor instanceof HTMLElement
      ? anchor.getBoundingClientRect()
      : { top: anchor.y, bottom: anchor.y, left: anchor.x, right: anchor.x, width: 0, height: 0 };

    popup.style.position = 'fixed';
    popup.style.width = '';
    popup.style.maxWidth = `${maxW}px`;
    popup.style.margin = '0';
    popup.style.borderRadius = '';
    popup.style.zIndex = '10000';
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';

    // Vertical: above or below anchor, using top only (never bottom).
    // Set maxHeight first, then read actual rendered height for above-placement.
    if (above) {
      const space = rect.top - 8;
      popup.style.maxHeight = `${Math.min(maxH, space)}px`;
      const actualH = popup.getBoundingClientRect().height;
      popup.style.top = `${rect.top - actualH - 6}px`;
    } else {
      const spaceBelow = vh - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      if (spaceBelow >= Math.min(maxH, 200) || spaceBelow >= spaceAbove) {
        // Place below
        popup.style.maxHeight = `${Math.min(maxH, spaceBelow)}px`;
        popup.style.top = `${rect.bottom + 4}px`;
      } else {
        // Not enough room below — flip above
        popup.style.maxHeight = `${Math.min(maxH, spaceAbove)}px`;
        const actualH = popup.getBoundingClientRect().height;
        popup.style.top = `${rect.top - actualH - 6}px`;
      }
    }

    // Horizontal: right-align to anchor right, clamp to viewport edges
    const popupW = Math.min(maxW, vw - 8);
    let left = rect.right - popupW;
    if (left + popupW > vw - 4) left = vw - popupW - 4;
    if (left < 4) left = 4;
    popup.style.left = `${left}px`;
  };

  // ---- Cleanup ----

  const cleanup = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('resize', reposition);
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
    if (mobileShiftElement) {
      mobileShiftElement.style.bottom = savedBottom;
    }
    // Remove the popup from body (it was moved there at open time)
    if (popup.parentElement === document.body) {
      popup.remove();
    }
  };

  // ---- Auto-close handlers ----

  const handleClickOutside = (e: MouseEvent) => {
    if (!active) return;
    const target = e.target as HTMLElement;
    if (!target) return;
    if (popup.contains(target)) return;
    for (const sel of ignoreCloseOn) {
      if (target.closest(sel)) return;
    }
    cleanup();
    onClose?.();
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (!active) return;
    if (e.key === 'Escape') {
      cleanup();
      onClose?.();
    }
  };

  // ---- Activate ----

  reposition();
  window.addEventListener('resize', reposition);
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleEscape);

  return cleanup;
}

// ---- Emoji resolution ----

/** Resolve a colon-wrapped emoji name (e.g. ":fire:") to its display form (unicode or custom SVG). */
export function resolveEmoji(raw: string, customEmojis?: { name: string; svg: string }[]): string {
  // Strip colons if present
  const name = raw.replace(/^:|:$/g, '');
  // Check custom emojis first
  if (customEmojis) {
    const custom = customEmojis.find(e => e.name === name);
    if (custom) return `<span class="chat-inline-emoji" title=":${name}:">${custom.svg}</span>`;
  }
  // Check unicode emojis
  const unicode = ALL_EMOJIS.find(e => e.name === name);
  if (unicode) return unicode.emoji;
  // Already a unicode char or unrecognized — return as-is
  return raw;
}

// ---- Utilities ----

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Get the raw file URL for a user's profile picture. */
export async function getUserProfilePic(userPath: string): Promise<string | null> {
  const segments = userPath.split('/');
  const userSeg = [...segments].reverse().find(s => s.startsWith('@'));
  const user = userSeg ? userSeg.slice(1) : segments[segments.length - 1];

  const repo = await getRepository(user);
  if (!repo) return null;
  const names = ['2d-square.svg', '2d-square.png', '2d-square.jpeg'];
  for (const name of names) {
    if (resolveFile(repo.tree, ['avatar', name])) {
      return `/**/${userPath}/avatar/${name}`;
    }
  }
  return null;
}

/** Generate a deterministic color from a username string. */
function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

/** Generate a fallback avatar SVG with the user's initial on a colored circle. */
function fallbackAvatar(userPath: string): string {
  const segments = userPath.split('/');
  const userSeg = [...segments].reverse().find(s => s.startsWith('@'));
  const name = userSeg ? userSeg.slice(1) : segments[segments.length - 1];
  const initial = (name[0] || '?').toUpperCase();
  const bg = hashColor(name);
  return `<svg class="avatar-fallback" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
    <circle cx="14" cy="14" r="14" fill="${bg}"/>
    <text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="monospace" font-size="14" font-weight="bold">${initial}</text>
  </svg>`;
}

/** Render a user avatar icon — profile picture if available, otherwise generated initial avatar. */
export async function renderUserIcon(userPath: string, fallbackSvg: string, cssClass: string): Promise<string> {
  const pic = await getUserProfilePic(userPath);
  if (pic) {
    return `<div class="pr-timeline-icon ${cssClass}"><img src="${pic}" alt="${escapeHtml(userPath)}" /></div>`;
  }
  return `<div class="pr-timeline-icon ${cssClass}">${fallbackAvatar(userPath)}</div>`;
}

/** Render a clickable username link */
export function userLink(user: string): string {
  return `<a href="/@${user}" data-link class="pr-user-link">@${escapeHtml(user)}</a>`;
}

/** Compute grouping for consecutive items from the same author within a time window. */
export function computeGrouping(
  items: { author: string; createdAt: string }[],
  index: number,
  windowMs: number = 60_000,
): { isGrouped: boolean; isGroupStart: boolean } {
  const curr = items[index];
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;

  let isGrouped = false;
  if (prev && prev.author === curr.author) {
    const gap = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
    isGrouped = gap <= windowMs;
  }

  let isGroupStart = false;
  if (!isGrouped && next && next.author === curr.author) {
    const gap = new Date(next.createdAt).getTime() - new Date(curr.createdAt).getTime();
    isGroupStart = gap <= windowMs;
  }

  return { isGrouped, isGroupStart };
}

/** Auto-link patterns in message body:
 *  - @username → profile link
 *  - #{thread-title} → thread link
 *  - PR #N → PR link
 *  - :emoji: → inline custom emoji SVG */
export function autoLinkMessage(
  html: string,
  options?: {
    emojis?: { name: string; svg: string }[];
    conversationId?: string;
    userBase?: string;
  },
): string {
  // @username mentions
  html = html.replace(/@(\w[\w.-]*)/g, (match, name) => {
    return `<a href="/@${name}" data-link class="chat-mention">@${name}</a>`;
  });

  // #{thread-title} references
  if (options?.conversationId) {
    html = html.replace(/#\{([^}]+)\}/g, (_match, title) => {
      return `<a href="#" data-thread-link="${escapeHtml(title)}" class="chat-thread-link">#${escapeHtml(title)}</a>`;
    });
  }

  // PR #N
  if (options?.userBase) {
    html = html.replace(/PR #(\d+)/g, (_match, num) => {
      return `<a href="/${options.userBase}/-/pulls/${num}" data-link class="chat-pr-link">PR #${num}</a>`;
    });
  }

  // :emoji: → inline SVG
  if (options?.emojis) {
    html = html.replace(/:(\w+):/g, (_match, name) => {
      const emoji = options.emojis!.find(e => e.name === name);
      if (emoji) {
        return `<span class="chat-inline-emoji" title=":${name}:">${emoji.svg}</span>`;
      }
      return `:${name}:`;
    });
  }

  return html;
}

/** Render a single chat message with grouping support. */
export async function renderChatMessage(
  msg: ChatMessage,
  isGrouped: boolean,
  isGroupStart: boolean,
  options?: {
    emojis?: { name: string; svg: string }[];
    conversationId?: string;
    userBase?: string;
    allMessages?: ChatMessage[];
    toolbarHtml?: string;
  },
): Promise<string> {
  if (msg.deleted) {
    return `<div class="chat-msg chat-msg-deleted" data-msg-id="${msg.id}">
      <div class="chat-msg-body"><em style="color:rgba(255,255,255,0.25)">This message was deleted</em></div>
    </div>`;
  }

  const groupedClass = isGrouped ? ' grouped' : (isGroupStart ? ' group-start' : '');
  let html = `<div class="chat-msg${groupedClass}${msg.pinned ? ' pinned' : ''}" data-msg-id="${msg.id}">`;

  // Hover toolbar
  if (options?.toolbarHtml) html += options.toolbarHtml;

  // Avatar + header (not shown for grouped messages)
  if (!isGrouped) {
    html += await renderUserIcon(`@${msg.author}`, COMMENT_SVG, 'comment');
    html += `<div class="chat-msg-body">`;
    html += `<div class="chat-msg-header">`;
    html += userLink(msg.author);
    html += ` <span class="chat-msg-time">${formatTime(msg.createdAt)}`;
    if (msg.deliveryStatus) {
      const tick = msg.deliveryStatus === 'sending' ? '...' : msg.deliveryStatus === 'sent' ? '✓' : '✓✓';
      html += ` <span class="chat-delivery-status" title="${msg.deliveryStatus}">${tick}</span>`;
    }
    html += `</span>`;
    if (msg.pinned) html += ` <span class="chat-pin-badge" title="Pinned">📌</span>`;
    if (msg.editedAt) html += ` <span class="chat-edited-label" data-edit-history="${msg.id}">(edited)</span>`;
    if (msg.scheduledFor) html += ` <span class="chat-scheduled-label">Scheduled for ${formatTime(msg.scheduledFor)}</span>`;
    html += `</div>`;
  } else {
    html += `<div class="chat-msg-body">`;
  }

  // Forwarded header
  if (msg.forwardedFrom) {
    html += `<div class="chat-forwarded-header">Forwarded from ${userLink(msg.forwardedFrom.author)}</div>`;
  }

  // Reply quote
  if (msg.replyTo && options?.allMessages) {
    const parent = options.allMessages.find(m => m.id === msg.replyTo);
    if (parent) {
      const preview = parent.body.length > 120 ? parent.body.slice(0, 120) + '...' : parent.body;
      html += `<div class="chat-reply-quote" data-scroll-to-msg="${parent.id}">`;
      html += `<span class="chat-reply-author">@${escapeHtml(parent.author)}</span> `;
      html += `<span class="chat-reply-text">${escapeHtml(preview)}</span>`;
      html += `</div>`;
    }
  }

  // Thread reference
  if (msg.threadId && msg.threadTitle) {
    html += `<div class="chat-thread-ref" data-thread-nav="${msg.threadId}">🧵 <strong>${escapeHtml(msg.threadTitle)}</strong></div>`;
  }

  // Voice message
  if (msg.voiceUrl) {
    html += `<div class="chat-voice-msg">`;
    html += `<button class="chat-voice-play" data-voice-url="${escapeHtml(msg.voiceUrl)}">▶</button>`;
    html += `<div class="chat-voice-waveform"></div>`;
    if (msg.voiceTranscript) {
      html += `<details class="chat-voice-transcript"><summary>Transcript</summary><p>${escapeHtml(msg.voiceTranscript)}</p></details>`;
    }
    html += `</div>`;
  }

  // Message body (markdown rendered + auto-linked)
  if (msg.body) {
    let rendered = renderMarkdown(msg.body);
    rendered = autoLinkMessage(rendered, options);
    html += `<div class="chat-msg-content readme-body">${rendered}</div>`;
  }

  // Attachments
  if (msg.attachments && msg.attachments.length > 0) {
    html += `<div class="chat-attachments">`;
    for (const att of msg.attachments) {
      if (att.type.startsWith('image/')) {
        html += `<img src="${att.url}" alt="${escapeHtml(att.name)}" class="chat-attachment-img" />`;
      } else {
        const sizeStr = att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / 1048576).toFixed(1)} MB`;
        html += `<div class="chat-attachment-file"><span class="chat-attachment-name">${escapeHtml(att.name)}</span><span class="chat-attachment-size">${sizeStr}</span></div>`;
      }
    }
    html += `</div>`;
  }

  // Reactions
  if (msg.reactions.length > 0) {
    html += `<div class="chat-reactions">`;
    for (const r of msg.reactions) {
      const resolved = resolveEmoji(r.emoji, options?.emojis);
      const me = getCurrentPlayer();
      const reacted = r.users.includes(me) ? ' reacted' : '';
      html += `<button class="chat-reaction-badge${reacted}" data-reaction-emoji="${escapeHtml(r.emoji)}" data-msg-id="${msg.id}" title="${r.users.join(', ')}">`;
      html += `${resolved} ${r.users.length}`;
      html += `</button>`;
    }
    html += `</div>`;
  }

  html += `</div></div>`;
  return html;
}

/** Start inline editing of a message within a container. */
export function startInlineEdit(
  container: HTMLElement,
  targetId: string,
  currentBody: string,
  onSave: (newBody: string) => void,
  onCancel: () => void,
): void {
  const msgEl = container.querySelector(`[data-msg-id="${targetId}"]`);
  if (!msgEl) return;
  const contentEl = msgEl.querySelector('.chat-msg-content');
  if (!contentEl) return;

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-inline-edit-textarea';
  textarea.value = currentBody;
  contentEl.replaceWith(textarea);
  textarea.focus();

  const save = () => {
    const val = textarea.value.trim();
    if (val && val !== currentBody) onSave(val);
    else onCancel();
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') onCancel();
  });
}

/** Shared timeline CSS used by both PullRequests and Chat. */
export function getTimelineStyles(): string {
  return `
    .pr-timeline-icon {
      flex: 0 0 28px;
      width: 28px; max-width: 28px; min-width: 28px;
      height: 28px; max-height: 28px; min-height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.05);
      overflow: hidden;
      font-size: 0;
    }
    .pr-timeline-icon svg { width: 14px; height: 14px; fill: currentColor; }
    .pr-timeline-icon svg.avatar-fallback { width: 100%; height: 100%; }
    .pr-timeline-icon img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .pr-timeline-icon.commit { color: #60a5fa; }
    .pr-timeline-icon.comment { color: rgba(255,255,255,0.5); }
    .pr-timeline-icon.status { color: #fbbf24; }
    .pr-timeline-icon.merge { color: #c084fc; }
    .pr-user-link {
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      font-weight: bold;
    }
    .pr-user-link:hover { color: ${PHOSPHOR}; text-decoration: underline; }

    /* System event rows (commits, status changes, merges — injected into timeline) */
    .pr-system-event {
      display: flex; gap: 10px; padding: 4px 0;
      align-items: center;
      font-size: 13px; color: rgba(255,255,255,0.4);
    }
    .pr-system-event .pr-timeline-icon { flex: 0 0 28px; }

    /* When the @me button is captured into a sticky header */
    .me-button.in-header {
      position: relative !important;
      top: auto !important; right: auto !important;
      z-index: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      animation: none !important;
    }
  `;
}

// ---- @me button capture into sticky headers ----
//
// Any page with a sticky header can call setupMeButtonCapture(container) in
// its bindEvents() and teardownMeButtonCapture() in its unmount().
// When the header sticks, the global .me-button is reparented into the header's
// first row and given .in-header (which overrides its fixed positioning).

let _stickyObserver: IntersectionObserver | null = null;
let _meBtnOriginalParent: ParentNode | null = null;
let _meBtnOriginalNext: Node | null = null;

function _captureMeButton(stuck: boolean, titleRow: HTMLElement): void {
  const meBtn = document.querySelector<HTMLElement>('.me-button');
  if (!meBtn) return;

  if (stuck && !meBtn.classList.contains('in-header')) {
    _meBtnOriginalParent = meBtn.parentNode;
    _meBtnOriginalNext = meBtn.nextSibling;
    meBtn.classList.remove('fade-in');
    meBtn.classList.add('in-header');
    // Append inside header-actions so it sits next to the search icon
    const actions = titleRow.querySelector('.chat-header-actions');
    if (actions) actions.appendChild(meBtn);
    else titleRow.appendChild(meBtn);
  } else if (!stuck && meBtn.classList.contains('in-header')) {
    meBtn.classList.remove('in-header');
    if (_meBtnOriginalParent) {
      if (_meBtnOriginalNext) _meBtnOriginalParent.insertBefore(meBtn, _meBtnOriginalNext);
      else _meBtnOriginalParent.appendChild(meBtn);
    } else {
      document.body.appendChild(meBtn);
    }
    _meBtnOriginalParent = null;
    _meBtnOriginalNext = null;
  }
}

/**
 * Set up IntersectionObserver to capture the @me button into the sticky header.
 * Works for any page: finds the first sticky header and first title row inside it.
 * Looks for: .chat-sticky-header OR .pr-sticky-header
 * Title row: .chat-conv-title-row OR .pr-detail-title-row OR first child div
 */
export function setupMeButtonCapture(container: HTMLElement): void {
  const stickyHeader = container.querySelector<HTMLElement>('.chat-sticky-header, .pr-sticky-header');
  const titleRow = stickyHeader?.querySelector<HTMLElement>('.chat-conv-title-row, .pr-detail-title-row');
  if (!stickyHeader || !titleRow) return;

  // Sentinel div — when it scrolls out of view, header is stuck
  let sentinel = container.querySelector<HTMLElement>('.sticky-sentinel');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.className = 'sticky-sentinel';
    sentinel.style.height = '0';
    sentinel.style.overflow = 'hidden';
    stickyHeader.parentNode?.insertBefore(sentinel, stickyHeader);
  }

  if (_stickyObserver) _stickyObserver.disconnect();
  _stickyObserver = new IntersectionObserver(([entry]) => {
    _captureMeButton(!entry.isIntersecting, titleRow);
  }, { threshold: 0 });
  _stickyObserver.observe(sentinel);
}

/** Clean up the me-button capture — call in unmount(). */
export function teardownMeButtonCapture(): void {
  if (_stickyObserver) {
    _stickyObserver.disconnect();
    _stickyObserver = null;
  }
  const meBtn = document.querySelector<HTMLElement>('.me-button.in-header');
  if (meBtn) {
    meBtn.classList.remove('in-header');
    if (_meBtnOriginalParent) {
      if (_meBtnOriginalNext) _meBtnOriginalParent.insertBefore(meBtn, _meBtnOriginalNext);
      else _meBtnOriginalParent.appendChild(meBtn);
    } else {
      document.body.appendChild(meBtn);
    }
    _meBtnOriginalParent = null;
    _meBtnOriginalNext = null;
  }
}

/** Shared chat message CSS used by both Chat and PullRequests pages. */
export function getChatMessageStyles(): string {
  return `
    /* Date separator */
    .chat-date-sep {
      text-align: center; font-size: 11px;
      color: rgba(255,255,255,0.25);
      margin: 16px 0 8px;
      position: relative;
    }
    .chat-date-sep::before, .chat-date-sep::after {
      content: '';
      position: absolute; top: 50%;
      width: calc(50% - 60px);
      height: 1px;
      background: rgba(255,255,255,0.06);
    }
    .chat-date-sep::before { left: 0; }
    .chat-date-sep::after { right: 0; }

    /* Sticky date label */
    .chat-sticky-date {
      position: sticky; top: 0; z-index: 5;
      text-align: center; padding: 4px 12px;
      font-size: 11px; color: rgba(255,255,255,0.35);
      background: rgba(10,10,10,0.9);
      border-radius: 12px;
      width: fit-content; margin: 0 auto 8px;
      pointer-events: none;
    }

    /* Messages */
    .chat-msg {
      display: flex; gap: 10px; padding: 6px 0;
      position: relative;
    }
    .chat-msg.grouped { padding-left: 38px; padding-top: 0; padding-bottom: 1px; }
    .chat-msg.pinned { border-left: 2px solid rgba(255,255,255,0.15); padding-left: 12px; }
    .chat-msg-body {
      flex: 1; min-width: 0;
      overflow-wrap: break-word; word-wrap: break-word; word-break: break-word;
    }
    .chat-msg-header { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
    .chat-msg-header .pr-user-link { color: rgba(255,255,255,0.7); text-decoration: none; font-weight: bold; }
    .chat-msg-header .pr-user-link:hover { text-decoration: underline; color: ${PHOSPHOR}; }
    .chat-msg-time { color: rgba(255,255,255,0.25); font-size: 11px; }
    .chat-msg-content {
      font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.88);
      overflow-wrap: break-word; word-wrap: break-word; word-break: break-word;
    }
    .chat-msg-content p { margin: 0 0 8px 0; }
    .chat-msg-content p:last-child { margin-bottom: 0; }
    .chat-msg-content code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    .chat-msg-content pre { background: rgba(255,255,255,0.04); padding: 8px 12px; border-radius: 4px; overflow-x: auto; }
    .chat-msg.grouped .chat-msg-header { display: none; }
    .chat-msg-deleted { opacity: 0.4; }

    /* Hover toolbar */
    .chat-msg-toolbar {
      position: absolute; top: -16px; right: 0;
      display: none; align-items: center; gap: 1px;
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 2px;
      z-index: 10;
    }
    .chat-msg.toolbar-visible .chat-msg-toolbar { display: flex; }
    .chat-msg-deleted.toolbar-visible .chat-msg-toolbar { display: none; }
    .chat-msg-toolbar button {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: none; border-radius: 4px;
      cursor: pointer; font-size: 15px;
      color: rgba(255,255,255,0.4);
      transition: background 0.1s;
    }
    .chat-msg-toolbar button:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
    .chat-msg-toolbar button svg { width: 14px; height: 14px; fill: currentColor; }

    .chat-pin-badge { font-size: 12px; }
    .chat-edited-label {
      font-size: 11px; color: rgba(255,255,255,0.2); cursor: pointer;
    }
    .chat-edited-label:hover { color: rgba(255,255,255,0.4); }
    .chat-scheduled-label {
      font-size: 11px; color: rgba(255,200,100,0.5);
    }

    /* Forwarded */
    .chat-forwarded-header {
      font-size: 11px; color: rgba(255,255,255,0.3);
      margin-bottom: 4px; font-style: italic;
    }

    /* Reply quote */
    .chat-reply-quote {
      border-left: 2px solid rgba(255,255,255,0.15);
      padding: 2px 8px; margin-bottom: 4px;
      font-size: 12px; color: rgba(255,255,255,0.35);
      cursor: pointer;
    }
    .chat-reply-quote:hover { color: rgba(255,255,255,0.5); }
    .chat-reply-author { font-weight: bold; color: rgba(255,255,255,0.4); }

    /* Thread ref */
    .chat-thread-ref {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 8px; border-radius: 4px;
      background: rgba(255,255,255,0.04);
      font-size: 12px; color: rgba(255,255,255,0.5);
      cursor: pointer; margin: 4px 0;
    }
    .chat-thread-ref:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }

    /* Voice messages */
    .chat-voice-msg {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: rgba(255,255,255,0.03);
      border-radius: 6px; margin: 4px 0;
    }
    .chat-voice-play {
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,0.08); border: none;
      cursor: pointer; color: ${PHOSPHOR}; font-size: 12px;
    }
    .chat-voice-play:hover { background: rgba(255,255,255,0.15); }
    .chat-voice-waveform {
      flex: 1; height: 24px;
      background: linear-gradient(90deg,
        rgba(255,255,255,0.08) 2px, transparent 2px,
        transparent 4px, rgba(255,255,255,0.12) 4px,
        rgba(255,255,255,0.12) 6px, transparent 6px);
      background-size: 8px 100%;
      border-radius: 2px;
    }
    .chat-voice-transcript { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 4px; }
    .chat-voice-transcript summary { cursor: pointer; }
    .chat-voice-transcript p { margin: 4px 0; }

    /* Attachments */
    .chat-attachments { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0; }
    .chat-attachment-img { max-width: 300px; max-height: 200px; border-radius: 6px; cursor: pointer; }
    .chat-attachment-file {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: rgba(255,255,255,0.03);
      border-radius: 6px; font-size: 12px;
    }
    .chat-attachment-name { color: rgba(255,255,255,0.6); }
    .chat-attachment-size { color: rgba(255,255,255,0.25); }

    /* Delivery status */
    .chat-delivery-status { font-size: 10px; color: rgba(255,255,255,0.2); margin-left: 4px; }

    /* Reactions */
    .chat-reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chat-reaction-badge {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 12px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
      font-size: 12px; color: rgba(255,255,255,0.5);
      cursor: pointer;
    }
    .chat-reaction-badge.reacted { background: rgba(234,184,50,0.15); border-color: #eab832; color: #eab832; }
    .chat-reaction-badge:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); }
    .chat-reaction-badge.reacted:hover { background: rgba(234,184,50,0.25); border-color: #eab832; }

    /* Auto-linked elements */
    .chat-mention { color: #60a5fa; text-decoration: none; }
    .chat-mention:hover { text-decoration: underline; }
    .chat-thread-link { color: #c084fc; text-decoration: none; }
    .chat-thread-link:hover { text-decoration: underline; }
    .chat-pr-link { color: #4ade80; text-decoration: none; }
    .chat-pr-link:hover { text-decoration: underline; }
    .chat-inline-emoji { display: inline-block; width: 18px; height: 18px; vertical-align: text-bottom; }
    .chat-inline-emoji svg { width: 100%; height: 100%; fill: currentColor; }

    /* Context menu — positioned by openPopup() */
    .chat-context-menu {
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 4px;
      min-width: 160px;
      max-width: 220px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6);
      box-sizing: border-box;
      font-family: 'Courier New', Courier, monospace;
    }
    .chat-context-menu.open { display: block; }
    .chat-context-option {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 4px;
      font-size: 12px; color: rgba(255,255,255,0.6);
      cursor: pointer; border: none; background: none;
      width: 100%; text-align: left;
      font-family: 'Courier New', Courier, monospace;
      white-space: nowrap;
    }
    .chat-context-option:hover { background: rgba(255,255,255,0.06); color: ${PHOSPHOR}; }
    .chat-context-option svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }
    .chat-context-option.danger { color: #f87171; }
    .chat-context-option.danger:hover { background: rgba(248,113,113,0.1); }

    /* Quick-react bar — positioned by openPopup() */
    .chat-quick-react {
      display: flex; gap: 2px; align-items: center;
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 4px 6px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6);
      box-sizing: border-box;
    }
    .chat-quick-react button {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: none; border-radius: 50%;
      font-size: 18px; cursor: pointer;
      transition: transform 0.1s, background 0.1s;
    }
    .chat-quick-react button:hover { background: rgba(255,255,255,0.08); transform: scale(1.2); }
    .chat-quick-react .qr-edit-btn { color: rgba(255,255,255,0.4); margin-left: 2px; }
    .chat-quick-react .qr-edit-btn svg { width: 16px; height: 16px; fill: currentColor; }
    .chat-quick-react .qr-edit-btn:hover { color: ${PHOSPHOR}; }

    /* Inline edit */
    .chat-inline-edit-textarea {
      width: 100%; min-height: 40px; background: transparent;
      border: none; border-bottom: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7); font-family: inherit;
      font-size: 14px; line-height: 1.6; resize: vertical;
      padding: 0; outline: none;
    }

    /* Input area (sticky at bottom) */
    .chat-input-area {
      position: sticky; bottom: 0; z-index: 20;
      padding: 8px 0 6px;
      background: ${CRT_SCREEN_BG};
    }

    /* Expanded input box */
    .chat-expand-box { display: none; margin-bottom: 4px; }
    .chat-expand-box.open { display: block; }
    .chat-expand-toolbar { display: flex; gap: 4px; margin-bottom: 6px; }
    .chat-expand-action {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 4px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.45); font-size: 11px;
      cursor: pointer; font-family: inherit;
    }
    .chat-expand-action:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
    .chat-expand-action svg { width: 12px; height: 12px; fill: currentColor; }

    /* Thread creation row */
    .chat-thread-create { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    .chat-thread-create svg { width: 14px; height: 14px; fill: currentColor; color: rgba(255,255,255,0.4); }
    .chat-thread-title-input {
      flex: 1; background: transparent;
      border: none; border-bottom: 1px solid rgba(255,255,255,0.15);
      color: ${PHOSPHOR}; font-family: inherit; font-size: 13px;
      outline: none; padding: 2px 0;
    }
    .chat-thread-title-input::placeholder { color: rgba(255,255,255,0.2); }

    /* Reply preview */
    .chat-reply-preview {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; margin-bottom: 4px;
      background: rgba(255,255,255,0.03);
      border-left: 2px solid rgba(255,255,255,0.2);
      border-radius: 0 4px 4px 0;
      font-size: 12px; color: rgba(255,255,255,0.4);
    }
    .chat-reply-preview-close {
      margin-left: auto; cursor: pointer;
      color: rgba(255,255,255,0.3); background: none;
      border: none; font-size: 14px;
    }
    .chat-reply-preview-close:hover { color: rgba(255,255,255,0.6); }

    /* Attachment preview */
    .chat-attach-preview {
      display: flex; flex-wrap: wrap; gap: 8px;
      margin-bottom: 4px;
    }
    .chat-attach-item {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px; border-radius: 4px;
      background: rgba(255,255,255,0.04); font-size: 11px;
      color: rgba(255,255,255,0.5);
    }
    .chat-attach-remove {
      cursor: pointer; color: rgba(255,255,255,0.3);
      background: none; border: none; font-size: 12px;
    }
    .chat-attach-remove:hover { color: rgba(255,255,255,0.6); }

    /* Collapsed input line */
    .chat-input-line {
      display: flex; align-items: center; gap: 0;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 0 4px;
      position: relative;
    }
    .chat-input-line:focus-within { border-color: rgba(255,255,255,0.25); }
    .chat-expand-btn, .chat-mic-btn, .chat-emoji-toggle-btn {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: none; cursor: pointer;
      color: rgba(255,255,255,0.35); display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
    }
    .chat-expand-btn:hover, .chat-mic-btn:hover, .chat-emoji-toggle-btn:hover { color: rgba(255,255,255,0.7); }
    .chat-expand-btn svg, .chat-mic-btn svg, .chat-emoji-toggle-btn svg { width: 18px; height: 18px; fill: currentColor; }
    .chat-mic-btn.recording { color: #f87171; animation: chat-pulse 1s infinite; }

    /* Voice recording tooltip */
    .chat-voice-tooltip {
      position: absolute; bottom: 100%; right: 0;
      background: #0e0e0e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; padding: 6px 12px;
      font-size: 11px; color: rgba(255,255,255,0.5);
      white-space: nowrap; z-index: 50;
      display: none;
    }
    .chat-voice-tooltip.visible { display: block; }
    .chat-text-input {
      flex: 1; background: transparent;
      border: none; box-sizing: content-box;
      padding: 6px 8px; color: ${PHOSPHOR}; font-family: inherit;
      font-size: 13px; line-height: 18px; outline: none; resize: none;
      height: 18px; max-height: 150px; overflow-y: hidden;
    }
    .chat-text-input::placeholder { color: rgba(255,255,255,0.2); }

    /* Emoji picker — positioned by openPopup() */
    .chat-emoji-picker {
      background: #0e0e0e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px; padding: 0;
      display: none;
      width: 340px; max-height: 380px;
      flex-direction: column;
      box-sizing: border-box;
    }
    .chat-emoji-picker.open { display: flex; }
    .chat-emoji-search {
      padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;
    }
    .chat-emoji-search input {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px; padding: 6px 10px; color: ${PHOSPHOR};
      font-family: inherit; font-size: 12px; outline: none;
    }
    .chat-emoji-search input::placeholder { color: rgba(255,255,255,0.2); }
    .chat-emoji-search input:focus { border-color: rgba(255,255,255,0.25); }
    .chat-emoji-tabs {
      display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.08);
      padding: 0 4px; flex-shrink: 0; overflow-x: auto;
    }
    .chat-emoji-tabs::-webkit-scrollbar { display: none; }
    .chat-emoji-tab {
      padding: 6px 8px; font-size: 16px; cursor: pointer;
      background: none; border: none; border-bottom: 2px solid transparent;
      opacity: 0.4; transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .chat-emoji-tab:hover { opacity: 0.7; }
    .chat-emoji-tab.active { opacity: 1; border-bottom-color: ${PHOSPHOR}; }
    .chat-emoji-scroll {
      flex: 1; overflow-y: auto; padding: 4px 8px 8px;
    }
    .chat-emoji-scroll::-webkit-scrollbar { width: 4px; }
    .chat-emoji-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    .chat-emoji-section-label {
      font-size: 11px; color: rgba(255,255,255,0.3);
      padding: 6px 4px 4px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .chat-emoji-grid { display: flex; flex-wrap: wrap; gap: 2px; }
    .chat-emoji-btn {
      width: 34px; height: 34px; border-radius: 6px;
      background: none; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; line-height: 1;
    }
    .chat-emoji-btn:hover { background: rgba(255,255,255,0.08); }
    .chat-emoji-btn svg { width: 20px; height: 20px; fill: currentColor; }
    .chat-emoji-btn.custom-emoji { color: rgba(255,255,255,0.6); }
    .chat-emoji-btn.custom-emoji:hover { color: ${PHOSPHOR}; }
  `;
}

// ---- Message toolbar ----

export const HOVER_REACT_EMOJIS = ['❤️', '👍', '😂', '🔥'];

/** Generate the hover toolbar HTML for a chat message. */
export function msgToolbarHtml(msgId: number): string {
  let html = `<div class="chat-msg-toolbar">`;
  for (const emoji of HOVER_REACT_EMOJIS) {
    html += `<button data-toolbar-react="${emoji}" data-toolbar-msg="${msgId}" title="${emoji}">${emoji}</button>`;
  }
  html += `<button data-toolbar-picker="${msgId}" title="More reactions">${EMOJI_SVG}</button>`;
  html += `<button data-toolbar-reply="${msgId}" title="Reply">${REPLY_SVG}</button>`;
  html += `</div>`;
  return html;
}

// ============================================================
// Shared Timeline + Input — unified system for Chat & PullRequests
// ============================================================

// ---- Recent Emojis (localStorage, shared by Chat + PR) ----

const RECENT_EMOJI_KEY = 'chat-recent-emojis';
const MAX_RECENT = 32;

export function getRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EMOJI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addRecentEmoji(emoji: string): void {
  try {
    let recent = getRecentEmojis();
    recent = [emoji, ...recent.filter(e => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(recent));
  } catch { /* ignore */ }
}

// ---- Unified Timeline ----

/** A single entry in the timeline — either a chat message or an injected system event. */
export interface TimelineEntry {
  kind: 'message' | 'system';
  createdAt: string;
  message?: ChatMessage;
  /** Pre-rendered HTML for system events (commits, merges, status changes, etc.) */
  html?: string;
}

export interface TimelineOptions {
  emojis?: { name: string; svg: string }[];
  conversationId?: string;
  userBase?: string;
  allMessages?: ChatMessage[];
  searchQuery?: string;
}

/**
 * Render a unified timeline of messages and injected system events.
 * Handles date separators, message grouping (broken by system events), and search highlighting.
 * Used by both Chat and PullRequests.
 */
export async function renderTimeline(
  entries: TimelineEntry[],
  options?: TimelineOptions,
): Promise<string> {
  let html = `<div class="chat-message-list" data-msg-list>`;
  let lastDate = '';

  const allMsgs = options?.allMessages || entries
    .filter(e => e.kind === 'message' && e.message)
    .map(e => e.message!);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryDate = new Date(entry.createdAt).toDateString();

    // Date separator
    if (entryDate !== lastDate) {
      const label = formatDateLabel(entry.createdAt);
      html += `<div class="chat-date-sep" data-date="${entryDate}">${label}</div>`;
      lastDate = entryDate;
    }

    if (entry.kind === 'message' && entry.message) {
      const msg = entry.message;

      // Compute grouping — system events between messages break groups
      let isGrouped = false;
      let isGroupStart = false;

      if (i > 0) {
        const prev = entries[i - 1];
        if (prev.kind === 'message' && prev.message && prev.message.author === msg.author) {
          const gap = new Date(msg.createdAt).getTime() - new Date(prev.message.createdAt).getTime();
          isGrouped = gap <= 60_000;
        }
      }

      if (!isGrouped && i < entries.length - 1) {
        const next = entries[i + 1];
        if (next.kind === 'message' && next.message && next.message.author === msg.author) {
          const gap = new Date(next.message.createdAt).getTime() - new Date(msg.createdAt).getTime();
          isGroupStart = gap <= 60_000;
        }
      }

      let msgHtml = await renderChatMessage(msg, isGrouped, isGroupStart, {
        emojis: options?.emojis,
        conversationId: options?.conversationId,
        userBase: options?.userBase,
        allMessages: allMsgs,
        toolbarHtml: msg.deleted ? undefined : msgToolbarHtml(msg.id),
      });

      if (options?.searchQuery && msg.body.toLowerCase().includes(options.searchQuery.toLowerCase())) {
        msgHtml = msgHtml.replace('class="chat-msg', 'class="chat-msg search-match');
      }

      html += msgHtml;
    } else if (entry.kind === 'system' && entry.html) {
      html += entry.html;
    }
  }

  html += `<div class="chat-sentinel" data-chat-sentinel></div>`;
  html += `</div>`;
  return html;
}

// ---- Shared Input Area ----

export interface InputAreaState {
  placeholder?: string;
  draft?: string;
  replyTo?: { author: string; body: string } | null;
  pendingAttachments?: { name: string }[];
  expandedInput?: boolean;
  creatingThread?: boolean;
  threadTitleDraft?: string;
  emojiPickerOpen?: boolean;
  emojiPickerSearch?: string;
  emojiPickerCategory?: string;
  emojis?: CustomEmoji[];
}

/**
 * Render the unified chat input area (reply preview, attachments, expand box,
 * input pill with +/emoji/mic, emoji picker). Always renders the full set of
 * controls — every chat-like page (Chat, PullRequests, etc.) gets the same UI.
 */
export function renderSharedInputArea(state: InputAreaState): string {
  const {
    placeholder = 'Message...',
    draft = '',
    replyTo = null,
    pendingAttachments = [],
    expandedInput = false,
    creatingThread = false,
    threadTitleDraft = '',
    emojiPickerOpen = false,
    emojiPickerSearch = '',
    emojiPickerCategory = '',
    emojis = [],
  } = state;

  let html = `<div class="chat-input-area">`;

  if (replyTo) {
    html += `<div class="chat-reply-preview">`;
    html += `Replying to @${escapeHtml(replyTo.author)}: ${escapeHtml(replyTo.body.slice(0, 80))}`;
    html += `<button class="chat-reply-preview-close" data-cancel-reply>&times;</button>`;
    html += `</div>`;
  }

  if (pendingAttachments.length > 0) {
    html += `<div class="chat-attach-preview">`;
    for (let i = 0; i < pendingAttachments.length; i++) {
      html += `<div class="chat-attach-item">${escapeHtml(pendingAttachments[i].name)} <button class="chat-attach-remove" data-remove-attach="${i}">&times;</button></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="chat-expand-box${expandedInput ? ' open' : ''}" data-expand-box>`;
  html += `<div class="chat-expand-toolbar">`;
  html += `<button class="chat-expand-action" data-action-upload>${UPLOAD_SVG} Upload</button>`;
  html += `<button class="chat-expand-action" data-action-thread>${THREAD_SVG} Create thread</button>`;
  html += `<button class="chat-expand-action" data-action-schedule>${SCHEDULE_SVG} Schedule</button>`;
  html += `</div>`;

  if (creatingThread) {
    html += `<div class="chat-thread-create">`;
    html += `${THREAD_SVG}`;
    html += `<input class="chat-thread-title-input" placeholder="Thread title..." value="${escapeHtml(threadTitleDraft)}" data-thread-title />`;
    html += `</div>`;
  }

  html += `</div>`;

  html += `<div class="chat-input-line">`;
  html += `<button class="chat-expand-btn" data-toggle-expand title="More options">${PLUS_SVG}</button>`;
  html += `<textarea class="chat-text-input" rows="1" placeholder="${escapeHtml(placeholder)}" data-chat-input>${escapeHtml(draft)}</textarea>`;
  html += `<button class="chat-emoji-toggle-btn" data-emoji-toggle title="Emoji">${EMOJI_SVG}</button>`;
  html += `<button class="chat-mic-btn" data-mic-btn title="Hold to record">${MIC_SVG}</button>`;

  // Emoji picker — rendered but hidden; toggled via data-emoji-toggle
  html += `<div class="chat-emoji-picker${emojiPickerOpen ? ' open' : ''}" data-emoji-picker>`;
  if (!emojiPickerOpen) {
    html += `</div>`;
  } else {
    html += `<div class="chat-emoji-search"><input type="text" placeholder="Search emojis..." data-emoji-search value="${escapeHtml(emojiPickerSearch)}" /></div>`;

    html += `<div class="chat-emoji-tabs">`;
    const tabEntries: { id: string; icon: string }[] = [
      { id: '', icon: '🕐' },
      ...EMOJI_CATEGORIES.map(c => ({ id: c.id, icon: c.emojis[0].emoji })),
    ];
    if (emojis.length > 0) tabEntries.push({ id: 'custom', icon: '⚙️' });
    for (const tab of tabEntries) {
      const active = emojiPickerCategory === tab.id ? ' active' : '';
      const label = tab.id === '' ? 'Recent' : tab.id === 'custom' ? 'Custom' : EMOJI_CATEGORIES.find(c => c.id === tab.id)!.label;
      html += `<button class="chat-emoji-tab${active}" data-emoji-tab="${tab.id}" title="${label}">${tab.icon}</button>`;
    }
    html += `</div>`;

    html += `<div class="chat-emoji-scroll" data-emoji-scroll>`;

    const searchLower = emojiPickerSearch.toLowerCase();
    const showAll = !emojiPickerCategory && !searchLower;
    const showSearch = !!searchLower;

    if (showSearch) {
      const results = ALL_EMOJIS.filter(e => e.name.includes(searchLower) || e.emoji === searchLower);
      const customResults = emojis.filter(e => e.name.toLowerCase().includes(searchLower));
      if (results.length === 0 && customResults.length === 0) {
        html += `<div class="chat-emoji-section-label">No results</div>`;
      } else {
        html += `<div class="chat-emoji-grid">`;
        for (const e of results) {
          html += `<button class="chat-emoji-btn" data-insert-unicode="${e.emoji}" title="${e.name}">${e.emoji}</button>`;
        }
        for (const e of customResults) {
          html += `<button class="chat-emoji-btn custom-emoji" data-insert-emoji="${e.name}" title=":${e.name}:">${e.svg}</button>`;
        }
        html += `</div>`;
      }
    } else if (showAll || emojiPickerCategory === '') {
      const recent = getRecentEmojis();
      if (recent.length > 0) {
        html += `<div class="chat-emoji-section-label">Recently Used</div>`;
        html += `<div class="chat-emoji-grid">`;
        for (const emoji of recent) {
          const customMatch = emojis.find(e => e.name === emoji);
          if (customMatch) {
            html += `<button class="chat-emoji-btn custom-emoji" data-insert-emoji="${customMatch.name}" title=":${customMatch.name}:">${customMatch.svg}</button>`;
          } else {
            const entry = ALL_EMOJIS.find(e => e.emoji === emoji);
            html += `<button class="chat-emoji-btn" data-insert-unicode="${emoji}" title="${entry?.name || emoji}">${emoji}</button>`;
          }
        }
        html += `</div>`;
      }
      if (!emojiPickerCategory) {
        if (emojis.length > 0) {
          html += `<div class="chat-emoji-section-label" data-emoji-section="custom">Custom</div>`;
          html += `<div class="chat-emoji-grid">`;
          for (const e of emojis) {
            html += `<button class="chat-emoji-btn custom-emoji" data-insert-emoji="${e.name}" title=":${e.name}:">${e.svg}</button>`;
          }
          html += `</div>`;
        }
        for (const cat of EMOJI_CATEGORIES) {
          html += `<div class="chat-emoji-section-label" data-emoji-section="${cat.id}">${cat.label}</div>`;
          html += `<div class="chat-emoji-grid">`;
          for (const e of cat.emojis) {
            html += `<button class="chat-emoji-btn" data-insert-unicode="${e.emoji}" title="${e.name}">${e.emoji}</button>`;
          }
          html += `</div>`;
        }
      }
    } else if (emojiPickerCategory === 'custom') {
      html += `<div class="chat-emoji-section-label">Custom</div>`;
      html += `<div class="chat-emoji-grid">`;
      for (const e of emojis) {
        html += `<button class="chat-emoji-btn custom-emoji" data-insert-emoji="${e.name}" title=":${e.name}:">${e.svg}</button>`;
      }
      html += `</div>`;
    } else {
      const cat = EMOJI_CATEGORIES.find(c => c.id === emojiPickerCategory);
      if (cat) {
        html += `<div class="chat-emoji-section-label">${cat.label}</div>`;
        html += `<div class="chat-emoji-grid">`;
        for (const e of cat.emojis) {
          html += `<button class="chat-emoji-btn" data-insert-unicode="${e.emoji}" title="${e.name}">${e.emoji}</button>`;
        }
        html += `</div>`;
      }
    }

    html += `</div></div>`;
  }

  html += `<div class="chat-voice-tooltip" data-voice-tooltip>Hold to record</div>`;

  html += `</div>`;
  html += `</div>`;
  return html;
}

// ---- Shared Input Event Binding ----

/**
 * Bind events for the shared input area elements (auto-resize, mic tap tooltip).
 * Call from any page's bindEvents() after rendering renderSharedInputArea().
 * Page-specific handlers (e.g. Enter-to-send, expand toggle state) remain in the page.
 */
export function bindSharedInputEvents(container: HTMLElement): void {
  // Auto-resize textarea
  const input = container.querySelector<HTMLTextAreaElement>('[data-chat-input]');
  if (input) {
    input.addEventListener('input', () => {
      input.style.height = '18px';
      input.style.overflow = 'hidden';
      const sh = input.scrollHeight - 12;
      const h = Math.max(18, Math.min(sh, 150));
      input.style.height = h + 'px';
      input.style.overflow = h >= 150 ? 'auto' : 'hidden';
    });
  }

  // Mic button — tap shows tooltip, hold would start recording (page-specific)
  const micBtn = container.querySelector('[data-mic-btn]');
  if (micBtn) {
    let downTime = 0;
    micBtn.addEventListener('mousedown', () => { downTime = Date.now(); });
    micBtn.addEventListener('mouseup', () => {
      if (Date.now() - downTime < 300) {
        const tooltip = container.querySelector('[data-voice-tooltip]');
        tooltip?.classList.add('visible');
        setTimeout(() => tooltip?.classList.remove('visible'), 2000);
      }
    });
  }
}
