// ============================================================
// ChatView.ts — Reusable chat conversation view component
//
// Factory function that encapsulates: sticky header + timeline +
// input area + ALL interaction events (emoji, reactions, toolbar,
// search, scroll, drag-drop, voice, context menu, threads, reply).
// Used by both Chat.ts and PullRequests.ts — zero duplication.
// ============================================================

import { PHOSPHOR } from './CRTShell.ts';
import {
  escapeHtml, formatTime, renderUserIcon, userLink,
  renderChatMessage, msgToolbarHtml, HOVER_REACT_EMOJIS,
  openPopup, renderTimeline, renderSharedInputArea,
  getRecentEmojis, addRecentEmoji, startInlineEdit,
  setupMeButtonCapture, teardownMeButtonCapture,
  bindSharedInputEvents,
} from './ChatCommon.ts';
import type { TimelineEntry, TimelineOptions } from './ChatCommon.ts';
import type { ChatMessage, CustomEmoji, ChatAttachment } from './API.ts';
import { getCurrentPlayer } from './API.ts';
import { EMOJI_CATEGORIES } from './EmojiData.ts';
import {
  EMOJI_SVG, REPLY_SVG, PLUS_SVG, MIC_SVG,
  UPLOAD_SVG, THREAD_SVG, SCHEDULE_SVG, SCROLL_DOWN_SVG,
  SEARCH_SVG, PIN_SVG, FORWARD_SVG, BOOKMARK_SVG, TRASH_SVG,
} from './ChatIcons.ts';
import { EDIT_SVG } from './PRIcons.ts';

// ---- Types ----

export interface SendContext {
  replyToId?: number;
  threadId?: string;
  threadTitle?: string;
  attachments?: ChatAttachment[];
}

export interface ChatViewConfig {
  /** Return timeline entries (messages + system events) for the current view. */
  getEntries: () => Promise<TimelineEntry[]>;
  /** Return inner HTML for the sticky header. */
  getHeaderHtml: () => string;
  /** Extra CSS class on the sticky header (e.g. 'pr-sticky-header'). */
  headerClass?: string;
  /** Selector for the title row inside the header (for @me capture). */
  titleRowSelector?: string;
  /** Whether the input area is shown (default true). */
  inputEnabled?: boolean;
  /** Placeholder text for the input (default 'Message...'). */
  placeholder?: string;
  /** Return a saved draft for the input. */
  getDraft?: () => string;
  /** Custom emojis available. */
  emojis?: CustomEmoji[];
  /** All messages for reply-quote lookup / toolbar context. */
  getAllMessages?: () => ChatMessage[];

  /** Timeline rendering options (conversationId, userBase, etc.) */
  timelineOptions?: Omit<TimelineOptions, 'searchQuery'>;

  /** Feature toggles. */
  features?: {
    search?: boolean;
    scrollDown?: boolean;
    dragDrop?: boolean;
    voiceRecord?: boolean;
    contextMenu?: boolean;
    threads?: boolean;
    reply?: boolean;
    attachments?: boolean;
  };

  /** Called when the user sends a message. */
  onSend: (text: string, ctx: SendContext) => Promise<void>;
  /** Called on input changes (e.g. draft saving). */
  onInput?: (text: string) => void;
  /** Called when a reaction is toggled on a message. */
  onReaction: (msgId: number, emoji: string) => Promise<void>;
  /** Called after DOM is built, for page-specific event binding. */
  onBindEvents?: (container: HTMLElement) => void;
  /** Called when the view needs to re-render (e.g. after reaction toggle). */
  onRender?: () => Promise<void> | void;

  /** Extra HTML slots. */
  afterHeader?: () => string;
  afterTimeline?: () => string;
  beforeInput?: () => string;
  afterInput?: () => string;
}

export interface ChatView {
  render: () => Promise<void>;
  destroy: () => void;
  /** Access the root container element. */
  root: HTMLElement;
}

// ---- Factory ----

export function createChatView(
  root: HTMLElement,
  navigate: (path: string) => void,
  config: ChatViewConfig,
): ChatView {
  // ---- Internal state (owned by closure) ----
  let emojiPickerOpen = false;
  let emojiPickerSearch = '';
  let emojiPickerCategory = '';
  let expandedInput = false;
  let creatingThread = false;
  let threadTitleDraft = '';
  let replyToMsg: ChatMessage | null = null;
  let pendingAttachments: ChatAttachment[] = [];
  let searchOpen = false;
  let searchQuery = '';
  let popupCleanup: (() => void) | null = null;
  let scrollObserver: IntersectionObserver | null = null;
  let skipAutoScroll = false;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingStartTime = 0;
  let toolbarTarget: HTMLElement | null = null;

  const feat = config.features ?? {};
  const hasSearch = feat.search ?? false;
  const hasScrollDown = feat.scrollDown ?? true;
  const hasDragDrop = feat.dragDrop ?? false;
  const hasVoiceRecord = feat.voiceRecord ?? false;
  const hasContextMenu = feat.contextMenu ?? false;
  const hasThreads = feat.threads ?? false;
  const hasReply = feat.reply ?? false;
  const hasAttachments = feat.attachments ?? false;
  const inputEnabled = config.inputEnabled !== false;

  // ---- Helpers ----

  function preserveScroll(fn: () => Promise<void> | void): void {
    const scrollY = window.scrollY;
    skipAutoScroll = true;
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(() => window.scrollTo(0, scrollY));
    } else {
      window.scrollTo(0, scrollY);
    }
  }

  async function rerender(): Promise<void> {
    if (config.onRender) {
      await config.onRender();
    } else {
      await render();
    }
  }

  function saveDraftFromDOM(): void {
    if (!config.onInput) return;
    const inp = root.querySelector<HTMLTextAreaElement>('[data-chat-input]')
      ?? document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
    if (inp) config.onInput(inp.value);
  }

  // ---- Render ----

  async function render(): Promise<void> {
    const entries = await config.getEntries();
    const headerHtml = config.getHeaderHtml();
    const headerClass = config.headerClass || 'chat-sticky-header';

    let html = '';

    // Sticky header
    html += `<div class="${headerClass}">`;
    html += headerHtml;
    html += `</div>`;

    // After header slot
    if (config.afterHeader) html += config.afterHeader();

    // Search bar (inside header already rendered by caller, or standalone)
    // Timeline
    const allMessages = config.getAllMessages?.() ?? entries
      .filter(e => e.kind === 'message' && e.message)
      .map(e => e.message!);

    const timelineOpts: TimelineOptions = {
      ...config.timelineOptions,
      allMessages,
      searchQuery: hasSearch ? searchQuery : undefined,
    };

    html += await renderTimeline(entries, timelineOpts);

    // After timeline slot
    if (config.afterTimeline) html += config.afterTimeline();

    // Scroll down button
    if (hasScrollDown) {
      html += `<button class="chat-scroll-down" data-scroll-down>${SCROLL_DOWN_SVG}</button>`;
    }

    // Drop zone
    if (hasDragDrop) {
      html += `<div class="chat-dropzone" data-dropzone>Drop files to upload</div>`;
    }

    // Before input slot
    if (config.beforeInput) html += config.beforeInput();

    // Input area
    if (inputEnabled) {
      html += renderSharedInputArea({
        placeholder: config.placeholder || 'Message...',
        draft: config.getDraft?.() || '',
        replyTo: replyToMsg ? { author: replyToMsg.author, body: replyToMsg.body } : null,
        pendingAttachments: pendingAttachments.map(a => ({ name: a.name })),
        expandedInput,
        creatingThread: hasThreads ? creatingThread : false,
        threadTitleDraft: hasThreads ? threadTitleDraft : '',
        emojiPickerOpen,
        emojiPickerSearch,
        emojiPickerCategory,
        emojis: config.emojis,
      });
    }

    // After input slot
    if (config.afterInput) html += config.afterInput();

    root.innerHTML = html;
    bindAllEvents();
  }

  // ---- Event Binding ----

  function bindAllEvents(): void {
    const c = root;

    // Shared input events (auto-resize, mic tap tooltip) + @me button capture
    setupMeButtonCapture(c);
    bindSharedInputEvents(c);

    // ---- Input area events ----
    const input = c.querySelector<HTMLTextAreaElement>('[data-chat-input]');
    if (input) {
      // Draft saving on input
      if (config.onInput) {
        input.addEventListener('input', () => config.onInput!(input.value));
      }

      // Send on Enter
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = input.value;
          input.value = '';
          input.style.height = '18px';
          input.style.overflow = 'hidden';
          if (config.onInput) config.onInput('');
          doSend(text);
        }
      });
    }

    // Send button
    c.querySelector('[data-send-btn]')?.addEventListener('click', () => {
      const inp = c.querySelector<HTMLTextAreaElement>('[data-chat-input]');
      if (inp) {
        const text = inp.value;
        inp.value = '';
        inp.style.height = '18px';
        inp.style.overflow = 'hidden';
        if (config.onInput) config.onInput('');
        doSend(text);
      }
    });

    // Toggle expand
    c.querySelector('[data-toggle-expand]')?.addEventListener('click', () => {
      expandedInput = !expandedInput;
      c.querySelector('[data-expand-box]')?.classList.toggle('open', expandedInput);
    });

    // ---- Emoji picker (input area) ----
    c.querySelector('[data-emoji-toggle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popupCleanup) { popupCleanup(); popupCleanup = null; }
      emojiPickerOpen = !emojiPickerOpen;
      if (!emojiPickerOpen) { emojiPickerSearch = ''; emojiPickerCategory = ''; }
      saveDraftFromDOM();
      rerender();
    });

    if (emojiPickerOpen) {
      const picker = c.querySelector<HTMLElement>('[data-emoji-picker]');
      const anchor = c.querySelector<HTMLElement>('[data-emoji-toggle]');
      const inputArea = c.querySelector<HTMLElement>('.chat-input-area');

      // Bind handlers while picker is still inside c
      c.querySelector('[data-emoji-search]')?.addEventListener('input', (e) => {
        e.stopPropagation();
        emojiPickerSearch = (e.target as HTMLInputElement).value;
        emojiPickerCategory = '';
        rerender();
      });

      c.querySelectorAll<HTMLElement>('[data-emoji-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          emojiPickerCategory = tab.dataset.emojiTab || '';
          emojiPickerSearch = '';
          rerender();
        });
      });

      c.querySelectorAll<HTMLElement>('[data-insert-unicode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const emoji = btn.dataset.insertUnicode;
          const inp = c.querySelector<HTMLTextAreaElement>('[data-chat-input]')
            ?? document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
          if (inp && emoji) {
            const pos = inp.selectionStart ?? inp.value.length;
            const text = inp.value;
            inp.value = text.slice(0, pos) + emoji + text.slice(pos);
            const newPos = pos + emoji.length;
            inp.selectionStart = inp.selectionEnd = newPos;
            addRecentEmoji(emoji);
          }
        });
      });

      c.querySelectorAll<HTMLElement>('[data-insert-emoji]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = btn.dataset.insertEmoji;
          const inp = c.querySelector<HTMLTextAreaElement>('[data-chat-input]')
            ?? document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
          if (inp && name) {
            const pos = inp.selectionStart ?? inp.value.length;
            const text = inp.value;
            const insert = `:${name}:`;
            inp.value = text.slice(0, pos) + insert + text.slice(pos);
            const newPos = pos + insert.length;
            inp.selectionStart = inp.selectionEnd = newPos;
            addRecentEmoji(name);
          }
        });
      });

      // Open popup (moves picker to document.body — handlers preserved)
      if (picker && anchor) {
        if (popupCleanup) popupCleanup();
        popupCleanup = openPopup(picker, {
          anchor,
          preferAbove: true,
          ignoreCloseOn: ['[data-emoji-toggle]'],
          mobileShiftElement: inputArea ?? undefined,
          onClose: () => {
            popupCleanup = null;
            emojiPickerOpen = false;
            emojiPickerSearch = '';
            emojiPickerCategory = '';
            saveDraftFromDOM();
            rerender();
          },
        });
        picker.querySelector<HTMLInputElement>('[data-emoji-search]')?.focus();
      }
    }

    // ---- Voice recording ----
    if (hasVoiceRecord) {
      const micBtn = c.querySelector('[data-mic-btn]');
      if (micBtn) {
        let holdTimeout: ReturnType<typeof setTimeout> | null = null;
        micBtn.addEventListener('mousedown', () => {
          recordingStartTime = Date.now();
          holdTimeout = setTimeout(() => startRecording(c), 300);
        });
        micBtn.addEventListener('mouseup', () => {
          if (holdTimeout) clearTimeout(holdTimeout);
          if (Date.now() - recordingStartTime < 300) {
            const tooltip = c.querySelector('[data-voice-tooltip]');
            tooltip?.classList.add('visible');
            setTimeout(() => tooltip?.classList.remove('visible'), 2000);
          } else {
            stopRecording();
          }
        });
        micBtn.addEventListener('mouseleave', () => {
          if (holdTimeout) clearTimeout(holdTimeout);
        });
      }
    }

    // ---- Search ----
    if (hasSearch) {
      let searchMatches: HTMLElement[] = [];
      let searchCurrentIdx = -1;

      function highlightTextInMessages(query: string): void {
        c.querySelectorAll('.chat-search-highlight').forEach(el => {
          const parent = el.parentNode;
          if (parent) { parent.replaceChild(document.createTextNode(el.textContent || ''), el); parent.normalize(); }
        });
        c.querySelectorAll<HTMLElement>('.chat-msg').forEach(el => el.classList.remove('search-match', 'search-current'));
        searchMatches = [];
        searchCurrentIdx = -1;

        if (!query) {
          const countEl = c.querySelector('[data-search-count]');
          if (countEl) countEl.textContent = '';
          return;
        }

        const lowerQ = query.toLowerCase();
        c.querySelectorAll<HTMLElement>('.chat-msg .chat-msg-content').forEach(contentEl => {
          const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
          const textNodes: Text[] = [];
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

          for (const tn of textNodes) {
            const text = tn.textContent || '';
            const lower = text.toLowerCase();
            const idx = lower.indexOf(lowerQ);
            if (idx < 0) continue;

            const before = text.slice(0, idx);
            const match = text.slice(idx, idx + query.length);
            const after = text.slice(idx + query.length);

            const span = document.createElement('span');
            span.className = 'chat-search-highlight';
            span.textContent = match;

            const parent = tn.parentNode!;
            if (before) parent.insertBefore(document.createTextNode(before), tn);
            parent.insertBefore(span, tn);
            if (after) parent.insertBefore(document.createTextNode(after), tn);
            parent.removeChild(tn);
          }

          const msgEl = contentEl.closest<HTMLElement>('.chat-msg');
          if (msgEl && contentEl.querySelector('.chat-search-highlight')) {
            msgEl.classList.add('search-match');
            searchMatches.push(msgEl);
          }
        });

        const countEl = c.querySelector('[data-search-count]');
        if (countEl) countEl.textContent = searchMatches.length > 0
          ? `${searchMatches.length} match${searchMatches.length !== 1 ? 'es' : ''}`
          : 'No matches';

        if (searchMatches.length > 0) goToMatch(0);
      }

      function goToMatch(idx: number): void {
        if (searchMatches.length === 0) return;
        if (searchCurrentIdx >= 0 && searchCurrentIdx < searchMatches.length) {
          searchMatches[searchCurrentIdx].classList.remove('search-current');
          searchMatches[searchCurrentIdx].querySelectorAll('.chat-search-highlight.current').forEach(el => el.classList.remove('current'));
        }
        searchCurrentIdx = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
        const el = searchMatches[searchCurrentIdx];
        el.classList.add('search-current');
        el.querySelectorAll('.chat-search-highlight').forEach(h => h.classList.add('current'));
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });

        const countEl = c.querySelector('[data-search-count]');
        if (countEl) countEl.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
      }

      c.querySelector('[data-chat-search]')?.addEventListener('click', () => {
        searchOpen = !searchOpen;
        const bar = c.querySelector('.chat-search-bar');
        bar?.classList.toggle('open', searchOpen);
        if (searchOpen) {
          const inp = c.querySelector<HTMLInputElement>('[data-search-input]');
          inp?.focus();
          if (searchQuery) highlightTextInMessages(searchQuery);
        } else {
          highlightTextInMessages('');
        }
      });

      c.querySelector('[data-search-input]')?.addEventListener('input', (e) => {
        searchQuery = (e.target as HTMLInputElement).value;
        highlightTextInMessages(searchQuery);
      });

      c.querySelector('[data-search-input]')?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          if ((e as KeyboardEvent).shiftKey) goToMatch(searchCurrentIdx - 1);
          else goToMatch(searchCurrentIdx + 1);
        }
        if ((e as KeyboardEvent).key === 'Escape') {
          searchOpen = false; searchQuery = '';
          c.querySelector('.chat-search-bar')?.classList.remove('open');
          highlightTextInMessages('');
        }
      });

      c.querySelector('[data-search-prev]')?.addEventListener('click', () => goToMatch(searchCurrentIdx - 1));
      c.querySelector('[data-search-next]')?.addEventListener('click', () => goToMatch(searchCurrentIdx + 1));
    }

    // ---- Scroll down button ----
    if (hasScrollDown) {
      const msgList = c.querySelector<HTMLElement>('[data-msg-list]');
      const scrollBtn = c.querySelector<HTMLElement>('[data-scroll-down]');
      if (msgList && scrollBtn) {
        const sentinel = c.querySelector('[data-chat-sentinel]');
        if (sentinel) {
          scrollObserver?.disconnect();
          scrollObserver = new IntersectionObserver((entries) => {
            const visible = entries[0]?.isIntersecting;
            scrollBtn.classList.toggle('visible', !visible);
          });
          scrollObserver.observe(sentinel);
        }

        scrollBtn.addEventListener('click', () => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });

        if (skipAutoScroll) { skipAutoScroll = false; }
        else { window.scrollTo({ top: document.body.scrollHeight }); }
      }
    }

    // ---- Toolbar visibility ----
    c.addEventListener('mousemove', (e) => {
      const msgEl = (e.target as HTMLElement).closest<HTMLElement>('.chat-msg[data-msg-id]');
      if (msgEl === toolbarTarget) return;
      if (toolbarTarget) toolbarTarget.classList.remove('toolbar-visible');
      toolbarTarget = msgEl;
      if (toolbarTarget) toolbarTarget.classList.add('toolbar-visible');
    });
    c.addEventListener('mouseleave', () => {
      if (toolbarTarget) { toolbarTarget.classList.remove('toolbar-visible'); toolbarTarget = null; }
    });

    // ---- Context menu (right-click) ----
    if (hasContextMenu) {
      const QUICK_REACT_EMOJIS_CTX = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

      c.querySelectorAll<HTMLElement>('.chat-msg[data-msg-id]').forEach(el => {
        el.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          const msgId = parseInt(el.dataset.msgId || '0', 10);
          const allMsgs = config.getAllMessages?.() ?? [];
          const msg = allMsgs.find(m => m.id === msgId);
          if (!msg || msg.deleted) return;

          document.querySelector('[data-context-menu]')?.remove();
          document.querySelector('[data-quick-react]')?.remove();

          const currentUser = getCurrentPlayer();
          const menu = renderContextMenuHtml(msg, currentUser);
          c.insertAdjacentHTML('beforeend', menu);

          const menuEl = c.querySelector<HTMLElement>('[data-context-menu]')!;
          bindContextMenuEvents(c, menuEl, msg);
          openPopup(menuEl, {
            anchor: { x: e.clientX, y: e.clientY },
            preferAbove: false,
            maxWidth: 220,
            maxHeight: 500,
            onClose: () => { menuEl.remove(); },
          });
        });
      });
    }

    // ---- Long-press → quick-react bar ----
    c.querySelectorAll<HTMLElement>('.chat-msg[data-msg-id]').forEach(el => {
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      let pressTriggered = false;
      const startPress = (x: number, y: number) => {
        pressTriggered = false;
        pressTimer = setTimeout(async () => {
          pressTriggered = true;
          const msgId = parseInt(el.dataset.msgId || '0', 10);
          const allMsgs = config.getAllMessages?.() ?? [];
          const msg = allMsgs.find(m => m.id === msgId);
          if (!msg || msg.deleted) return;

          document.querySelector('[data-context-menu]')?.remove();
          document.querySelector('[data-quick-react]')?.remove();

          const currentUser = getCurrentPlayer();
          const isOwn = msg.author === currentUser;

          let bar = `<div class="chat-quick-react" data-quick-react>`;
          for (const emoji of HOVER_REACT_EMOJIS) {
            bar += `<button data-qr-emoji="${emoji}" data-qr-msg="${msgId}">${emoji}</button>`;
          }
          if (isOwn) {
            bar += `<button class="qr-edit-btn" data-qr-edit="${msgId}" title="Edit">${EDIT_SVG}</button>`;
          }
          bar += `</div>`;
          c.insertAdjacentHTML('beforeend', bar);

          const barEl = c.querySelector<HTMLElement>('[data-quick-react]')!;

          barEl.querySelectorAll<HTMLElement>('[data-qr-emoji]').forEach(btn => {
            btn.addEventListener('click', () => {
              const emojiVal = btn.dataset.qrEmoji || '';
              barEl.remove();
              preserveScroll(async () => {
                await config.onReaction(msgId, emojiVal);
                await rerender();
              });
            });
          });

          barEl.querySelector(`[data-qr-edit="${msgId}"]`)?.addEventListener('click', () => {
            barEl.remove();
            startInlineEdit(c, String(msg.id), msg.body, (newBody) => {
              if (!msg.editHistory) msg.editHistory = [];
              msg.editHistory.push({ body: msg.body, editedAt: new Date().toISOString() });
              msg.body = newBody;
              msg.editedAt = new Date().toISOString();
              rerender();
            }, () => rerender());
          });

          openPopup(barEl, {
            anchor: { x, y: el.getBoundingClientRect().top },
            preferAbove: true,
            maxWidth: isOwn ? 280 : 240,
            maxHeight: 44,
            onClose: () => { barEl.remove(); },
          });
        }, 500);
      };
      const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      el.addEventListener('mousedown', (e) => { if (e.button === 0) startPress(e.clientX, e.clientY); });
      el.addEventListener('mouseup', cancelPress);
      el.addEventListener('mouseleave', cancelPress);
      el.addEventListener('touchstart', (e) => { const t = e.touches[0]; startPress(t.clientX, t.clientY); }, { passive: true });
      el.addEventListener('touchend', cancelPress);
      el.addEventListener('touchcancel', cancelPress);
    });

    // ---- Double-click → heart reaction ----
    c.querySelectorAll<HTMLElement>('.chat-msg[data-msg-id]').forEach(el => {
      el.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('.chat-reaction-badge')) return;
        e.preventDefault();
        const msgId = parseInt(el.dataset.msgId || '0', 10);
        preserveScroll(async () => {
          await config.onReaction(msgId, '❤️');
          await rerender();
        });
      });
    });

    // ---- Hover toolbar — quick react ----
    c.querySelectorAll<HTMLElement>('[data-toolbar-react]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const emoji = btn.dataset.toolbarReact || '';
        const msgId = parseInt(btn.dataset.toolbarMsg || '0', 10);
        preserveScroll(async () => {
          await config.onReaction(msgId, emoji);
          await rerender();
        });
      });
    });

    // ---- Hover toolbar — emoji picker popup for reactions ----
    c.querySelectorAll<HTMLElement>('[data-toolbar-picker]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgId = parseInt(btn.dataset.toolbarPicker || '0', 10);

        document.querySelector('[data-quick-react]')?.remove();
        document.querySelector('[data-react-picker]')?.remove();

        let popup = `<div class="chat-emoji-picker open" data-react-picker>`;
        popup += `<div class="chat-emoji-search"><input type="text" placeholder="Search emojis..." data-react-search /></div>`;
        popup += `<div class="chat-emoji-scroll" data-react-scroll>`;
        for (const cat of EMOJI_CATEGORIES) {
          popup += `<div class="chat-emoji-section-label">${cat.label}</div>`;
          popup += `<div class="chat-emoji-grid">`;
          for (const em of cat.emojis) {
            popup += `<button class="chat-emoji-btn" data-react-pick="${em.emoji}" title="${em.name}">${em.emoji}</button>`;
          }
          popup += `</div>`;
        }
        popup += `</div></div>`;
        c.insertAdjacentHTML('beforeend', popup);

        const pickerEl = c.querySelector<HTMLElement>('[data-react-picker]')!;

        const searchInput = pickerEl.querySelector<HTMLInputElement>('[data-react-search]');
        const scrollEl = pickerEl.querySelector<HTMLElement>('[data-react-scroll]');
        searchInput?.addEventListener('input', () => {
          const q = (searchInput.value || '').toLowerCase();
          scrollEl?.querySelectorAll<HTMLElement>('.chat-emoji-btn').forEach(b => {
            const name = b.getAttribute('title') || '';
            b.style.display = (!q || name.includes(q)) ? '' : 'none';
          });
          scrollEl?.querySelectorAll<HTMLElement>('.chat-emoji-section-label').forEach(label => {
            const grid = label.nextElementSibling as HTMLElement | null;
            if (grid) {
              const hasVisible = grid.querySelector('.chat-emoji-btn:not([style*="display: none"])');
              label.style.display = hasVisible ? '' : 'none';
            }
          });
        });

        pickerEl.querySelectorAll<HTMLElement>('[data-react-pick]').forEach(pick => {
          pick.addEventListener('click', () => {
            const emoji = pick.dataset.reactPick || '';
            pickerEl.remove();
            preserveScroll(async () => {
              await config.onReaction(msgId, emoji);
              await rerender();
            });
          });
        });

        openPopup(pickerEl, {
          anchor: btn,
          preferAbove: false,
          ignoreCloseOn: ['[data-toolbar-picker]'],
          onClose: () => { pickerEl.remove(); },
        });
        searchInput?.focus();
      });
    });

    // ---- Hover toolbar — reply ----
    if (hasReply) {
      c.querySelectorAll<HTMLElement>('[data-toolbar-reply]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const msgId = parseInt(btn.dataset.toolbarReply || '0', 10);
          const allMsgs = config.getAllMessages?.() ?? [];
          const msg = allMsgs.find(m => m.id === msgId);
          if (!msg) return;
          replyToMsg = msg;
          preserveScroll(async () => {
            await rerender();
            c.querySelector<HTMLTextAreaElement>('[data-chat-input]')?.focus();
          });
        });
      });
    }

    // ---- Cancel reply ----
    c.querySelector('[data-cancel-reply]')?.addEventListener('click', () => {
      replyToMsg = null;
      rerender();
    });

    // ---- Remove attachment ----
    if (hasAttachments) {
      c.querySelectorAll<HTMLElement>('[data-remove-attach]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.removeAttach || '0', 10);
          pendingAttachments.splice(idx, 1);
          rerender();
        });
      });

      // Upload action
      c.querySelector('[data-action-upload]')?.addEventListener('click', () => triggerFileUpload());
    }

    // ---- Thread creation ----
    if (hasThreads) {
      c.querySelector('[data-action-thread]')?.addEventListener('click', () => {
        creatingThread = !creatingThread;
        rerender();
      });

      c.querySelector('[data-thread-title]')?.addEventListener('input', (e) => {
        threadTitleDraft = (e.target as HTMLInputElement).value;
      });
    }

    // ---- Scroll to replied message ----
    c.querySelectorAll<HTMLElement>('[data-scroll-to-msg]').forEach(el => {
      el.addEventListener('click', () => {
        const targetId = el.dataset.scrollToMsg;
        const target = c.querySelector<HTMLElement>(`[data-msg-id="${targetId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.background = 'rgba(255,200,0,0.08)';
          setTimeout(() => { target.style.background = ''; }, 2000);
        }
      });
    });

    // ---- Thread navigation ----
    if (hasThreads) {
      c.querySelectorAll<HTMLElement>('[data-thread-nav]').forEach(el => {
        el.addEventListener('click', () => {
          const threadId = el.dataset.threadNav;
          if (threadId) navigate(threadId);
        });
      });
    }

    // ---- Edit history ----
    c.querySelectorAll<HTMLElement>('[data-edit-history]').forEach(el => {
      el.addEventListener('click', async () => {
        const msgId = parseInt(el.dataset.editHistory || '0', 10);
        const allMsgs = config.getAllMessages?.() ?? [];
        const msg = allMsgs.find(m => m.id === msgId);
        if (!msg?.editHistory) return;

        c.querySelector('.chat-edit-history')?.remove();

        let popup = `<div class="chat-edit-history" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%)">`;
        popup += `<strong style="font-size:13px;color:rgba(255,255,255,0.5)">Edit History</strong>`;
        for (const h of msg.editHistory) {
          popup += `<div class="chat-edit-history-item"><div>${escapeHtml(h.body)}</div><div style="font-size:10px;color:rgba(255,255,255,0.2)">${formatTime(h.editedAt)}</div></div>`;
        }
        popup += `</div>`;
        c.insertAdjacentHTML('beforeend', popup);

        document.addEventListener('click', () => c.querySelector('.chat-edit-history')?.remove(), { once: true });
      });
    });

    // ---- Drag-and-drop ----
    if (hasDragDrop) {
      const dropzone = c.querySelector<HTMLElement>('[data-dropzone]');
      const msgList = c.querySelector<HTMLElement>('[data-msg-list]');
      if (dropzone && msgList) {
        const parent = dropzone.parentElement || c;
        parent.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('visible');
        });
        parent.addEventListener('dragleave', (e) => {
          if (!(e as DragEvent).relatedTarget || !parent.contains((e as DragEvent).relatedTarget as Node)) {
            dropzone.classList.remove('visible');
          }
        });
        parent.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('visible');
          const files = (e as DragEvent).dataTransfer?.files;
          if (files) {
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const reader = new FileReader();
              reader.onload = () => {
                pendingAttachments.push({
                  name: file.name,
                  type: file.type,
                  url: reader.result as string,
                  size: file.size,
                });
                rerender();
              };
              reader.readAsDataURL(file);
            }
          }
        });
      }
    }

    // ---- Reaction badges (toggle on click) ----
    c.querySelectorAll<HTMLElement>('[data-reaction-emoji]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = parseInt(btn.dataset.msgId || '0', 10);
        const emoji = btn.dataset.reactionEmoji || '';
        preserveScroll(async () => {
          await config.onReaction(msgId, emoji);
          await rerender();
        });
      });
    });

    // ---- Close remaining popups on click ----
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target?.closest('[data-react-picker]') && !target?.closest('[data-toolbar-picker]')) {
        document.querySelector('[data-react-picker]')?.remove();
      }
    }, { once: true });

    // ---- Page-specific event binding ----
    config.onBindEvents?.(c);
  }

  // ---- Send message ----

  function doSend(text: string): void {
    const trimmed = text.trim();
    if (!trimmed && pendingAttachments.length === 0) return;

    const ctx: SendContext = {};
    if (replyToMsg) ctx.replyToId = replyToMsg.id;
    if (creatingThread && threadTitleDraft) {
      ctx.threadId = crypto.randomUUID();
      ctx.threadTitle = threadTitleDraft;
    }
    if (pendingAttachments.length > 0) {
      ctx.attachments = [...pendingAttachments];
    }

    // Reset state
    replyToMsg = null;
    pendingAttachments = [];
    expandedInput = false;
    if (creatingThread && threadTitleDraft) {
      creatingThread = false;
      threadTitleDraft = '';
    }

    config.onSend(trimmed, ctx).then(() => rerender()).catch(e => console.error('send failed:', e));
  }

  // ---- Context menu ----

  function renderContextMenuHtml(msg: ChatMessage, currentUser: string): string {
    const isOwn = msg.author === currentUser;

    let html = `<div class="chat-context-menu open" data-context-menu>`;
    if (hasReply) html += `<button class="chat-context-option" data-ctx-reply="${msg.id}">${REPLY_SVG} Reply</button>`;
    html += `<button class="chat-context-option" data-ctx-react="${msg.id}">${EMOJI_SVG} React</button>`;
    html += `<button class="chat-context-option" data-ctx-pin="${msg.id}">${PIN_SVG} ${msg.pinned ? 'Unpin' : 'Pin'}</button>`;
    html += `<button class="chat-context-option" data-ctx-bookmark="${msg.id}">${BOOKMARK_SVG} Bookmark</button>`;
    html += `<button class="chat-context-option" data-ctx-copy="${msg.id}">Copy text</button>`;
    html += `<button class="chat-context-option" data-ctx-forward="${msg.id}">${FORWARD_SVG} Forward</button>`;
    if (isOwn) {
      html += `<button class="chat-context-option" data-ctx-edit="${msg.id}">${EDIT_SVG} Edit</button>`;
      html += `<button class="chat-context-option danger" data-ctx-delete="${msg.id}">${TRASH_SVG} Delete</button>`;
    }
    if (msg.editHistory && msg.editHistory.length > 0) {
      html += `<button class="chat-context-option" data-ctx-history="${msg.id}">View edit history</button>`;
    }
    html += `</div>`;
    return html;
  }

  function bindContextMenuEvents(c: HTMLElement, menuEl: HTMLElement, msg: ChatMessage): void {
    if (hasReply) {
      menuEl.querySelector(`[data-ctx-reply="${msg.id}"]`)?.addEventListener('click', () => {
        replyToMsg = msg;
        menuEl.remove();
        rerender();
      });
    }

    menuEl.querySelector(`[data-ctx-react="${msg.id}"]`)?.addEventListener('click', () => {
      menuEl.remove();
      preserveScroll(async () => {
        await config.onReaction(msg.id, '👍');
        await rerender();
      });
    });

    menuEl.querySelector(`[data-ctx-pin="${msg.id}"]`)?.addEventListener('click', () => {
      msg.pinned = !msg.pinned;
      menuEl.remove();
      rerender();
    });

    menuEl.querySelector(`[data-ctx-bookmark="${msg.id}"]`)?.addEventListener('click', () => {
      // Bookmark toggle via localStorage
      const key = 'ether:chat-bookmarks';
      const raw = localStorage.getItem(key);
      const bm: number[] = raw ? JSON.parse(raw) : [];
      const idx = bm.indexOf(msg.id);
      if (idx >= 0) bm.splice(idx, 1);
      else bm.push(msg.id);
      localStorage.setItem(key, JSON.stringify(bm));
      menuEl.remove();
    });

    menuEl.querySelector(`[data-ctx-copy="${msg.id}"]`)?.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.body);
      menuEl.remove();
    });

    menuEl.querySelector(`[data-ctx-forward="${msg.id}"]`)?.addEventListener('click', () => {
      menuEl.remove();
      // Simplified forward — just copy text
      navigator.clipboard.writeText(`Forwarded from @${msg.author}: ${msg.body}`);
    });

    menuEl.querySelector(`[data-ctx-edit="${msg.id}"]`)?.addEventListener('click', () => {
      menuEl.remove();
      startInlineEdit(c, String(msg.id), msg.body, (newBody) => {
        if (!msg.editHistory) msg.editHistory = [];
        msg.editHistory.push({ body: msg.body, editedAt: new Date().toISOString() });
        msg.body = newBody;
        msg.editedAt = new Date().toISOString();
        rerender();
      }, () => rerender());
    });

    menuEl.querySelector(`[data-ctx-delete="${msg.id}"]`)?.addEventListener('click', () => {
      msg.deleted = true;
      menuEl.remove();
      rerender();
    });

    menuEl.querySelector(`[data-ctx-history="${msg.id}"]`)?.addEventListener('click', () => {
      menuEl.remove();
      c.querySelector<HTMLElement>(`[data-edit-history="${msg.id}"]`)?.click();
    });
  }

  // ---- File upload ----

  function triggerFileUpload(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.addEventListener('change', () => {
      const files = fileInput.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          pendingAttachments.push({
            name: file.name,
            type: file.type,
            url: reader.result as string,
            size: file.size,
          });
          rerender();
        };
        reader.readAsDataURL(file);
      }
    });
    fileInput.click();
  }

  // ---- Voice recording ----

  async function startRecording(c: HTMLElement): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          // Send as voice attachment via onSend
          config.onSend('', { attachments: [{ name: 'voice-message.webm', type: 'audio/webm', url: reader.result as string, size: blob.size }] })
            .then(() => rerender())
            .catch(e => console.error('voice send failed:', e));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      c.querySelector('[data-mic-btn]')?.classList.add('recording');
    } catch {
      // Microphone not available
    }
  }

  function stopRecording(): void {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      root.querySelector('[data-mic-btn]')?.classList.remove('recording');
    }
  }

  // ---- Destroy ----

  function destroy(): void {
    teardownMeButtonCapture();
    scrollObserver?.disconnect();
    scrollObserver = null;
    if (popupCleanup) { popupCleanup(); popupCleanup = null; }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
    toolbarTarget = null;
  }

  return { render, destroy, root };
}
