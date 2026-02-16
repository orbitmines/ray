// ============================================================
// Greetings.ts — Onboarding overlay + global command bar for Ether
// mount() = CRT intro overlay (homepage first visit only)
// ensureGlobalBar() = @me button + @/slash listener (all pages)
// ============================================================

import {
  PHOSPHOR,
  CRT_SCREEN_BG,
  delay,
  fadeOutElement,
  typeText,
  injectCRTStyles,
  createCRT,
  turnOnScreen,
  dissolveCRT,
} from './CRTShell.ts';

// ---- localStorage Helpers ----

export function isFirstVisit(): boolean {
  try {
    return !localStorage.getItem('ether:visited');
  } catch {
    return true;
  }
}

function markVisited(): void {
  try {
    localStorage.setItem('ether:visited', '1');
  } catch {}
}

function getStoredNames(): string[] {
  try {
    const raw = localStorage.getItem('ether:names');
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem('ether:name');
    if (old) {
      const names = [old];
      localStorage.setItem('ether:names', JSON.stringify(names));
      return names;
    }
    return [];
  } catch {
    return [];
  }
}

function getStoredName(): string | null {
  const names = getStoredNames();
  return names.length > 0 ? names[names.length - 1] : null;
}

function storeName(name: string): void {
  try {
    const names = getStoredNames();
    const idx = names.indexOf(name);
    if (idx >= 0) names.splice(idx, 1);
    names.push(name);
    localStorage.setItem('ether:names', JSON.stringify(names));
    localStorage.setItem('ether:name', name);
    window.dispatchEvent(new CustomEvent('ether:character', { detail: name }));
  } catch {}
}

// ---- Global Bar Elements (persist across page navigations) ----
// The @me button, its styles, and the interaction listener survive page
// transitions. Router.ts controls teardown via teardownGlobalBar().

const globalElements: HTMLElement[] = [];
let globalBarStyleEl: HTMLStyleElement | null = null;
let cleanupInteraction: (() => void) | null = null;

function trackGlobal<T extends HTMLElement>(el: T): T {
  globalElements.push(el);
  return el;
}

// ---- Global Bar Styles ----
// @me button is global. Command bar overlay styles are scoped to
// .command-overlay so they never leak into repo/user pages.

function injectGlobalBarStyles(): void {
  if (globalBarStyleEl) return;
  const s = document.createElement('style');
  globalBarStyleEl = s;
  s.textContent = `
    /* ---- @me button (global) ---- */
    .me-button {
      position: fixed;
      top: 18px;
      right: 22px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      color: ${PHOSPHOR};
      text-shadow:
        0 0 4px rgba(255,255,255,0.5),
        0 0 11px rgba(255,255,255,0.22);
      cursor: pointer;
      z-index: 1000;
      user-select: none;
      background: none;
      border: none;
      padding: 6px 10px;
      white-space: pre;
    }

    @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
    .fade-in  { animation: fadeIn 0.6s ease-in forwards; }

    /* ---- Command bar overlay (scoped to .command-overlay) ---- */
    .command-overlay .terminal-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 90%;
      max-height: 100%;
      overflow: hidden;
      touch-action: none;
    }

    .command-overlay .t {
      color: ${PHOSPHOR};
      text-shadow:
        0 0 4px rgba(255,255,255,0.5),
        0 0 11px rgba(255,255,255,0.22),
        -0.4px 0 rgba(255,80,80,0.07),
        0.4px 0 rgba(80,80,255,0.07);
    }

    .command-overlay .t-muted {
      color: rgba(255,255,255,0.35);
      text-shadow: none;
    }

    @keyframes cursorPulse {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .command-overlay .cursor {
      display: inline-block;
      width: 0.55em;
      height: 1em;
      background: ${PHOSPHOR};
      box-shadow: 0 0 8px rgba(255,255,255,0.5);
      position: relative;
      top: 0.22em;
      animation: cursorPulse 1s step-end infinite;
    }

    .command-overlay .input-row {
      display: flex;
      align-items: baseline;
      font-family: 'Courier New', Courier, monospace;
      font-size: 18px;
      line-height: 1.8;
      white-space: pre;
    }

    .command-overlay .hint {
      margin-top: 14px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.3);
    }

    .command-overlay .hidden-input {
      position: fixed;
      left: -9999px;
      top: 0;
      width: 200px;
      height: 40px;
      font-size: 16px;
      opacity: 0;
      border: none;
      padding: 0;
    }

    .command-overlay .history-container {
      display: flex;
      flex-direction: column;
      height: 70vh;
    }

    .command-overlay .history-above,
    .command-overlay .history-below {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .command-overlay .history-above::-webkit-scrollbar,
    .command-overlay .history-below::-webkit-scrollbar { width: 4px; }
    .command-overlay .history-above::-webkit-scrollbar-track,
    .command-overlay .history-below::-webkit-scrollbar-track { background: transparent; }
    .command-overlay .history-above::-webkit-scrollbar-thumb,
    .command-overlay .history-below::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .command-overlay .history-above {
      justify-content: flex-end;
    }

    .command-overlay .history-entry {
      display: flex;
      align-items: baseline;
      font-family: 'Courier New', Courier, monospace;
      font-size: 18px;
      line-height: 1.8;
      white-space: pre;
      color: rgba(255,255,255,0.35);
      text-shadow: none;
      cursor: pointer;
      transition: color 0.15s;
      flex-shrink: 0;
    }
    .command-overlay .history-entry:hover {
      color: rgba(255,255,255,0.55);
    }

    .command-overlay .history-spacer {
      visibility: hidden;
    }
  `;
  document.head.appendChild(s);
  trackGlobal(s);
}

// ---- Centered Overlay (.command-overlay scoped) ----

function createCenteredOverlay(): { wrapper: HTMLElement; content: HTMLElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'command-overlay';
  wrapper.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;background:rgba(10,10,10,0.85);opacity:0;transition:opacity 0.35s ease-in;overflow:hidden;touch-action:none;`;

  const content = document.createElement('div');
  content.className = 'terminal-content';
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  // Force reflow then fade in
  wrapper.offsetHeight;
  wrapper.style.opacity = '1';

  return { wrapper, content };
}

async function fadeOutOverlay(wrapper: HTMLElement): Promise<void> {
  wrapper.style.transition = 'opacity 0.3s ease-out';
  wrapper.style.opacity = '0';
  await delay(300);
  wrapper.remove();
}

// ---- Phase: Intro (Ether glitch only) ----

async function introPhase(content: HTMLElement): Promise<void> {
  const w1 = document.createElement('div');
  content.appendChild(w1);
  const etherSpan = await typeText(w1, 'Ether', { speed: 130, large: true });
  await delay(1000);

  const logo = document.createElement('img');
  logo.src = 'images/Ether.svg';
  logo.className = 'ether-logo';
  logo.draggable = false;
  logo.style.width = etherSpan.offsetWidth + 'px';

  etherSpan.classList.add('glitch-shake');
  await delay(150);

  etherSpan.style.display = 'none';
  w1.appendChild(logo);
  logo.classList.add('glitch-shake');
  await delay(60);

  logo.classList.remove('glitch-shake');
  await delay(250);

  logo.classList.add('glitch-shake');
  await delay(120);
  logo.remove();
  etherSpan.style.display = '';
  await delay(60);

  etherSpan.classList.remove('glitch-shake');
  await delay(600);
  await fadeOutElement(w1);
  await delay(350);
}

// ---- Phase: Name Input (with typewriter prompt) ----

async function nameInputPhase(content: HTMLElement): Promise<{ name: string; row: HTMLElement }> {
  const row = document.createElement('div');
  row.className = 'input-row';
  content.appendChild(row);

  const promptSpan = document.createElement('span');
  promptSpan.className = 't';
  row.appendChild(promptSpan);

  const promptText = '@me = @';
  for (let i = 0; i < promptText.length; i++) {
    promptSpan.textContent += promptText[i];
    await delay(48 + Math.random() * 22);
  }

  const placeholder = document.createElement('span');
  placeholder.className = 't-muted';
  row.appendChild(placeholder);

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  row.appendChild(cursor);

  const placeholderText = '[Your Avatar Name]';
  for (let i = 0; i < placeholderText.length; i++) {
    placeholder.textContent += placeholderText[i];
    await delay(30 + Math.random() * 18);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 't';
  row.insertBefore(nameSpan, placeholder);
  row.insertBefore(cursor, placeholder);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Press enter to be anonymous.';
  content.appendChild(hint);

  const name = (await waitForNameInput(content, nameSpan, placeholder, hint, cursor, '')) ?? 'anonymous';

  return { name, row };
}

// ---- Quick Name Input (instant prompt, pre-filled, for re-edit) ----

async function nameInputQuick(content: HTMLElement, currentName: string): Promise<{ name: string; row: HTMLElement } | null> {
  const row = document.createElement('div');
  row.className = 'input-row';
  content.appendChild(row);

  const promptSpan = document.createElement('span');
  promptSpan.className = 't';
  row.appendChild(promptSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 't';
  nameSpan.textContent = currentName === 'anonymous' ? '@' : `@${currentName}`;
  row.appendChild(nameSpan);

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  row.appendChild(cursor);

  // Type the prompt in front — the @ is already shown as part of the name
  const promptText = '@me = ';
  for (let i = 0; i < promptText.length; i++) {
    promptSpan.textContent += promptText[i];
    await delay(48 + Math.random() * 22);
  }

  // Silently move the @ from nameSpan into promptSpan so input syncs correctly
  promptSpan.textContent += '@';
  const prefill = currentName === 'anonymous' ? '' : currentName;
  nameSpan.textContent = prefill;

  const name = await waitForNameInput(content, nameSpan, null, null, cursor, prefill, currentName);
  if (name === null) return null;

  return { name, row };
}

// ---- Shared: hidden input + Enter/Escape + history navigation ----

async function waitForNameInput(
  content: HTMLElement,
  nameSpan: HTMLElement,
  placeholder: HTMLElement | null,
  hint: HTMLElement | null,
  cursor: HTMLElement,
  prefill: string,
  excludeFromHistory?: string,
): Promise<string | null> {
  const row = nameSpan.closest('.input-row') as HTMLElement;

  // -- History UI --
  const allNames = getStoredNames();
  const history = allNames
    .filter(n => n !== (excludeFromHistory ?? ''))
    .reverse(); // most recent first

  let aboveDiv: HTMLElement | null = null;
  let belowDiv: HTMLElement | null = null;
  let historyContainer: HTMLElement | null = null;

  function makeHistoryEntry(name: string, empty = false): HTMLElement {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    const spacer = document.createElement('span');
    spacer.className = 'history-spacer';
    spacer.textContent = '@me = ';
    entry.appendChild(spacer);
    const textSpan = document.createElement('span');
    if (!empty) textSpan.textContent = `@${name}`;
    entry.appendChild(textSpan);
    entry.dataset.name = name;
    return entry;
  }

  async function typeInHistoryEntry(entry: HTMLElement, name: string): Promise<void> {
    const textSpan = entry.lastElementChild as HTMLElement;
    const text = `@${name}`;
    for (let i = 0; i < text.length; i++) {
      textSpan.textContent += text[i];
      await delay(25 + Math.random() * 15);
    }
  }

  if (history.length > 0) {
    historyContainer = document.createElement('div');
    historyContainer.className = 'history-container';

    // Measure the longest possible row for stable centering.
    // Wrap sizer in .command-overlay so scoped styles apply.
    const sizerWrap = document.createElement('div');
    sizerWrap.className = 'command-overlay';
    sizerWrap.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    const sizer = document.createElement('div');
    sizer.className = 'input-row';
    const longestName = [prefill, ...history].reduce((a, b) => a.length > b.length ? a : b, '');
    const sizerText = document.createElement('span');
    sizerText.className = 't';
    sizerText.textContent = `@me = @${longestName}`;
    sizer.appendChild(sizerText);
    const sizerCursor = document.createElement('span');
    sizerCursor.className = 'cursor';
    sizer.appendChild(sizerCursor);
    sizerWrap.appendChild(sizer);
    document.body.appendChild(sizerWrap);
    historyContainer.style.minWidth = sizer.offsetWidth + 'px';
    sizerWrap.remove();

    aboveDiv = document.createElement('div');
    aboveDiv.className = 'history-above';

    belowDiv = document.createElement('div');
    belowDiv.className = 'history-below';

    historyContainer.appendChild(aboveDiv);
    // Move the row into the container (stays centered between above/below)
    content.insertBefore(historyContainer, row);
    row.style.flexShrink = '0';
    historyContainer.appendChild(row);
    historyContainer.appendChild(belowDiv);

    for (const name of history) {
      const entry = makeHistoryEntry(name, true);
      belowDiv.appendChild(entry);
      typeInHistoryEntry(entry, name); // fire-and-forget, all type in parallel
    }
  }

  // -- Hidden input --
  const hiddenInput = document.createElement('input');
  hiddenInput.className = 'hidden-input';
  hiddenInput.type = 'text';
  hiddenInput.autocomplete = 'off';
  hiddenInput.autocapitalize = 'off';
  hiddenInput.spellcheck = false;
  hiddenInput.value = prefill;
  content.appendChild(hiddenInput);
  hiddenInput.focus();

  function refocus(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.history-above') || t.closest('.history-below')) return;
    hiddenInput.focus();
  }
  document.addEventListener('click', refocus);
  document.addEventListener('touchstart', refocus, { passive: true });

  // -- History state --
  let historyPos = -1; // -1 = typing new text
  let savedTypedText = prefill;

  function setInputValue(val: string) {
    hiddenInput.value = val;
    nameSpan.textContent = val;
    if (placeholder) placeholder.style.display = val ? 'none' : '';
    if (hint) hint.style.display = val ? 'none' : '';
  }

  // Navigate deeper into history (entries move from below to above)
  function navigateDeeper() {
    if (!belowDiv || !aboveDiv) return;
    if (historyPos >= history.length - 1) return;

    if (historyPos === -1) {
      savedTypedText = hiddenInput.value;
      if (savedTypedText) {
        aboveDiv.appendChild(makeHistoryEntry(savedTypedText));
      }
    } else {
      aboveDiv.appendChild(makeHistoryEntry(history[historyPos]));
    }

    historyPos++;

    const first = belowDiv.firstElementChild;
    if (first) first.remove();

    setInputValue(history[historyPos]);
  }

  // Navigate shallower (entries move from above back to below)
  function navigateShallower() {
    if (!belowDiv || !aboveDiv) return;
    if (historyPos <= -1) return;

    belowDiv.insertBefore(makeHistoryEntry(history[historyPos]), belowDiv.firstChild);

    historyPos--;

    const last = aboveDiv.lastElementChild;
    if (last) last.remove();

    if (historyPos === -1) {
      setInputValue(savedTypedText);
    } else {
      setInputValue(history[historyPos]);
    }
  }

  // -- Input sync --
  hiddenInput.addEventListener('input', () => {
    const val = hiddenInput.value;
    nameSpan.textContent = val;
    if (placeholder) placeholder.style.display = val ? 'none' : '';
    if (hint) hint.style.display = val ? 'none' : '';
  });

  // -- Tap to select history entry --
  function onHistoryClick(e: Event) {
    const target = (e.target as HTMLElement).closest('.history-entry') as HTMLElement | null;
    if (!target) return;
    const name = target.dataset.name!;
    setInputValue(name);
    hiddenInput.focus();
  }
  let touchCleanup: (() => void) | null = null;
  if (historyContainer) {
    historyContainer.addEventListener('click', onHistoryClick);

    // -- Swipe / scroll wheel to navigate history --
    let touchStartY = 0;
    let touchAccum = 0;
    const SWIPE_THRESHOLD = 40;

    function onTouchStart(e: TouchEvent) {
      touchStartY = e.touches[0].clientY;
      touchAccum = 0;
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const dy = touchStartY - e.touches[0].clientY;
      const prev = touchAccum;
      touchAccum = dy;
      const prevStep = Math.floor(prev / SWIPE_THRESHOLD);
      const curStep = Math.floor(touchAccum / SWIPE_THRESHOLD);
      if (curStep > prevStep) {
        navigateDeeper();
        hiddenInput.focus();
      } else if (curStep < prevStep) {
        navigateShallower();
        hiddenInput.focus();
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY > 0) {
        navigateDeeper();
      } else if (e.deltaY < 0) {
        navigateShallower();
      }
      hiddenInput.focus();
    }
    historyContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    historyContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });
    touchCleanup = () => {
      historyContainer!.removeEventListener('touchstart', onTouchStart);
      historyContainer!.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('wheel', onWheel);
    };
  }

  // -- Wait for Enter or Escape --
  const escaped = await new Promise<boolean>((resolve) => {
    function onMouseDown(e: MouseEvent) {
      if (e.button === 1) {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', onMouseDown);
        resolve(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', onMouseDown);
        resolve(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', onMouseDown);
        resolve(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateDeeper();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateShallower();
      }
    }
    hiddenInput.addEventListener('keydown', onKeyDown);
  });

  // Capture value before cleanup removes input
  const finalValue = hiddenInput.value.trim();

  // -- Cleanup --
  document.removeEventListener('click', refocus);
  document.removeEventListener('touchstart', refocus);
  if (historyContainer) {
    if (touchCleanup) touchCleanup();
    historyContainer.removeEventListener('click', onHistoryClick);
    row.style.flexShrink = '';
    content.insertBefore(row, historyContainer);
    historyContainer.remove();
  }
  cursor.remove();
  if (placeholder) placeholder.remove();
  if (hint) hint.remove();
  hiddenInput.remove();

  if (escaped) return null;

  if (!finalValue) nameSpan.textContent = 'anonymous';
  return finalValue || 'anonymous';
}

// ---- Instant Name Input (no typewriter, for command bar @me= transition) ----

async function nameInputInstant(
  content: HTMLElement,
  currentName: string,
): Promise<{ name: string } | null> {
  const row = document.createElement('div');
  row.className = 'input-row';
  content.appendChild(row);

  const promptSpan = document.createElement('span');
  promptSpan.className = 't';
  promptSpan.textContent = '@me = @';
  row.appendChild(promptSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 't';
  nameSpan.textContent = currentName === 'anonymous' ? '' : currentName;
  row.appendChild(nameSpan);

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  row.appendChild(cursor);

  const prefill = currentName === 'anonymous' ? '' : currentName;
  const name = await waitForNameInput(content, nameSpan, null, null, cursor, prefill, currentName);
  if (name === null) return null;

  return { name };
}

// ---- Command Bar: Global @/slash Input Overlay ----

async function openCommandBar(
  initialText: string,
  currentName: string,
): Promise<{ type: 'navigate' | 'name' | 'cancel'; value: string }> {
  const { wrapper, content } = createCenteredOverlay();

  const row = document.createElement('div');
  row.className = 'input-row';
  content.appendChild(row);

  const textSpan = document.createElement('span');
  textSpan.className = 't';
  textSpan.textContent = initialText;
  row.appendChild(textSpan);

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  row.appendChild(cursor);

  const hiddenInput = document.createElement('input');
  hiddenInput.className = 'hidden-input';
  hiddenInput.type = 'text';
  hiddenInput.autocomplete = 'off';
  hiddenInput.autocapitalize = 'off';
  hiddenInput.spellcheck = false;
  hiddenInput.value = initialText;
  content.appendChild(hiddenInput);
  hiddenInput.focus();
  hiddenInput.setSelectionRange(initialText.length, initialText.length);

  function refocus(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.history-above') || t.closest('.history-below')) return;
    hiddenInput.focus();
  }
  document.addEventListener('click', refocus);
  document.addEventListener('touchstart', refocus, { passive: true });

  const ME_PATTERN = /^@me\s*=\s*/i;

  const result = await new Promise<{ type: 'navigate' | 'name' | 'cancel'; value: string }>((resolve) => {
    let nameEditActive = false;

    function onInput() {
      const val = hiddenInput.value;
      textSpan.textContent = val;

      if (!nameEditActive && ME_PATTERN.test(val)) {
        nameEditActive = true;
        hiddenInput.removeEventListener('keydown', onKeyDown);
        hiddenInput.removeEventListener('input', onInput);
        document.removeEventListener('click', refocus);
        document.removeEventListener('touchstart', refocus);
        textSpan.remove();
        cursor.remove();
        hiddenInput.remove();
        row.remove();

        nameInputInstant(content, currentName).then((nameResult) => {
          if (nameResult) {
            resolve({ type: 'name', value: nameResult.name });
          } else {
            resolve({ type: 'cancel', value: '' });
          }
        });
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        hiddenInput.removeEventListener('input', onInput);
        resolve({ type: 'navigate', value: hiddenInput.value });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        hiddenInput.removeEventListener('input', onInput);
        resolve({ type: 'cancel', value: '' });
      }
    }

    hiddenInput.addEventListener('input', onInput);
    hiddenInput.addEventListener('keydown', onKeyDown);
  });

  document.removeEventListener('click', refocus);
  document.removeEventListener('touchstart', refocus);
  await fadeOutOverlay(wrapper);

  return result;
}

// ---- FLIP Animation: source element → top-right button ----

async function animateMeToCorner(sourceEl: HTMLElement, name: string): Promise<HTMLElement> {
  const sourceRect = sourceEl.getBoundingClientRect();

  const btn = trackGlobal(document.createElement('button'));
  btn.className = 'me-button';
  btn.textContent = `@${name}`;
  document.body.appendChild(btn);

  const btnRect = btn.getBoundingClientRect();

  const dx = sourceRect.left - btnRect.left;
  const dy = sourceRect.top - btnRect.top;

  btn.style.transform = `translate(${dx}px, ${dy}px)`;
  btn.style.transition = 'none';

  sourceEl.style.visibility = 'hidden';

  // Force reflow
  btn.offsetHeight;

  btn.style.transition = 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
  btn.style.transform = 'translate(0, 0)';

  await delay(850);

  btn.style.transition = '';
  btn.style.transform = '';
  sourceEl.remove();

  return btn;
}

// ---- Animate button from top-right to screen center ----

async function animateButtonToCenter(btn: HTMLElement): Promise<void> {
  const btnRect = btn.getBoundingClientRect();
  const cx = window.innerWidth / 2 - btnRect.width / 2;
  const cy = window.innerHeight / 2 - btnRect.height / 2;
  const dx = cx - btnRect.left;
  const dy = cy - btnRect.top;

  btn.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
  btn.style.transform = `translate(${dx}px, ${dy}px)`;

  await delay(650);
}

// ---- Show @me button in top-right ----

function showMeButton(name: string): HTMLElement {
  const btn = trackGlobal(document.createElement('button'));
  btn.className = 'me-button fade-in';
  btn.textContent = `@${name}`;
  document.body.appendChild(btn);
  return btn;
}

// ---- Interaction: click button or global @/slash key ----

function installInteraction(btn: HTMLElement, currentName: string): () => void {
  let active = true;

  async function onBtnClick() {
    if (!active) return;
    deactivate();

    await animateButtonToCenter(btn);
    btn.remove();

    const { wrapper, content } = createCenteredOverlay();
    const result = await nameInputQuick(content, currentName);

    if (result) {
      storeName(result.name);
      currentName = result.name;
      const [newBtn] = await Promise.all([
        animateMeToCorner(result.row, result.name),
        fadeOutOverlay(wrapper),
      ]);
      cleanupInteraction = installInteraction(newBtn, currentName);
    } else {
      // Escape — recreate button in corner
      await fadeOutOverlay(wrapper);
      const newBtn = showMeButton(currentName);
      cleanupInteraction = installInteraction(newBtn, currentName);
    }
  }

  function onGlobalKeyDown(e: KeyboardEvent) {
    if (!active) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) return;

    if (e.key === '@' || e.key === '/') {
      e.preventDefault();
      handleCommandBar(e.key);
    }
  }

  async function handleCommandBar(initialText: string) {
    deactivate();

    const result = await openCommandBar(initialText, currentName);

    if (result.type === 'navigate') {
      const path = result.value.startsWith('/') ? result.value : '/' + result.value;
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
      // Reactivate — the global bar persists across page transitions.
      // If teardownGlobalBar() was called during navigation, btn is
      // disconnected and activate() becomes a no-op.
      activate();
      return;
    }

    if (result.type === 'name') {
      storeName(result.value);
      currentName = result.value;
      btn.textContent = `@${result.value}`;
    }

    activate();
  }

  function activate() {
    if (!btn.isConnected) return;
    active = true;
    btn.addEventListener('click', onBtnClick, { once: true });
    document.addEventListener('keydown', onGlobalKeyDown);
  }

  function deactivate() {
    active = false;
    btn.removeEventListener('click', onBtnClick);
    document.removeEventListener('keydown', onGlobalKeyDown);
  }

  activate();

  return deactivate;
}

// ---- Public API ----

/** CRT intro overlay (homepage first visit only). */
export async function mount(): Promise<void> {
  const crtStyle = injectCRTStyles();
  injectGlobalBarStyles();

  const crt = createCRT();

  // CRT now covers the page — safe to hide it
  const page = document.getElementById('root');
  if (page) page.style.opacity = '0';

  await delay(700);
  await turnOnScreen(crt.screen);
  await delay(500);

  dissolveCRT(crt);
  await introPhase(crt.content);

  // Intro done — fade the CRT background to semi-transparent so the
  // page shows through dimly during the name input.
  crt.crt.style.transition = 'background 1s ease-out';
  crt.crt.style.background = 'rgba(10,10,10,0.85)';
  crt.screen.style.transition = 'background 1s ease-out';
  crt.screen.style.background = 'transparent';
  if (page) {
    page.style.transition = 'opacity 1s ease-in';
    page.style.opacity = '1';
  }

  const { name, row } = await nameInputPhase(crt.content);

  storeName(name);
  markVisited();

  // --- Simultaneous: CRT fades away + name button flies to corner ---

  // 1. Measure the row while it's still inside the CRT
  const sourceRect = row.getBoundingClientRect();

  const btn = trackGlobal(document.createElement('button'));
  btn.className = 'me-button';
  btn.textContent = `@${name}`;
  document.body.appendChild(btn);

  const btnRect = btn.getBoundingClientRect();
  const dx = sourceRect.left - btnRect.left;
  const dy = sourceRect.top - btnRect.top;

  btn.style.transform = `translate(${dx}px, ${dy}px)`;
  btn.style.transition = 'none';
  row.style.visibility = 'hidden';

  // 2. Force reflow so the browser commits btn at offset position
  btn.offsetHeight;

  // 3. Fade out CRT overlay + animate button simultaneously
  crt.crt.style.transition = 'opacity 0.8s ease-out';
  crt.crt.style.opacity = '0';
  btn.style.transition = 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
  btn.style.transform = 'translate(0, 0)';

  await delay(850);

  // 4. Clean up
  crt.crt.remove();
  if (crtStyle) crtStyle.remove();
  document.body.style.background = '';
  document.body.style.transition = '';
  btn.style.transition = '';
  btn.style.transform = '';
  row.remove();
  if (page) {
    page.style.transition = '';
    page.style.opacity = '';
  }

  cleanupInteraction = installInteraction(btn, name);
}

/** Set up @me button + command bar on any page (returning visitors). */
export function ensureGlobalBar(): void {
  if (isGlobalBarActive()) return;
  const storedName = getStoredName();
  if (!storedName) return;
  injectGlobalBarStyles();
  const btn = showMeButton(storedName);
  cleanupInteraction = installInteraction(btn, storedName);
}

/** Remove global bar entirely (button + listener + styles). */
export function teardownGlobalBar(): void {
  if (cleanupInteraction) { cleanupInteraction(); cleanupInteraction = null; }
  for (const el of globalElements) {
    el.remove();
  }
  globalElements.length = 0;
  globalBarStyleEl = null;
}

export function isGlobalBarActive(): boolean {
  return cleanupInteraction !== null;
}
