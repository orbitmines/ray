// ============================================================
// Greetings.ts — Old CRT monitor onboarding sequence for Ether
// No dependencies. Pure DOM + CSS.
// ============================================================

const PHOSPHOR = '#ffffff';

const CLASS_GROUPS: { label: string; files: string[] }[] = [
  {
    label: 'Science & Engineering',
    files: ['Programming', 'Hacking', '3D_Modeling', 'Mathematics', 'Physics', 'Biology', 'Chemistry', 'Astronomy', 'Cosmology'],
  },
  // {
  //   label: 'Creative',
  //   files: ['Animating', 'Drawing', 'Music'],
  // },
];

function fileToLabel(file: string): string {
  return file.replace(/_/g, ' ');
}

// ---- Utilities ----

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Style Injection ----

function injectStyles(): void {
  const s = document.createElement('style');
  s.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      overflow: hidden;
      font-family: 'Courier New', Courier, monospace;
    }

    /* ---- CRT Shell ---- */
    .crt {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050505;
    }

    .crt-screen {
      position: relative;
      width: 100%;
      height: 100%;
      background: #0a0a0a;
      border-radius: 14px;
      overflow: hidden;
      opacity: 0;
    }

    /* Scanlines */
    .crt-scanlines {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.06) 0px,
        rgba(0, 0, 0, 0.06) 1px,
        transparent 1px,
        transparent 3px
      );
      pointer-events: none;
      z-index: 100;
    }

    /* Vignette for CRT curvature illusion */
    .crt-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        ellipse at center,
        transparent 55%,
        rgba(0, 0, 0, 0.55) 100%
      );
      pointer-events: none;
      z-index: 101;
    }

    /* Steady-state flicker + ambient glow */
    @keyframes flicker {
      0%   { opacity: 0.985; }
      4%   { opacity: 0.965; }
      8%   { opacity: 0.995; }
      12%  { opacity: 0.975; }
      50%  { opacity: 0.98; }
      100% { opacity: 0.985; }
    }
    @keyframes glow {
      0%, 100% {
        box-shadow: 0 0 30px rgba(255,255,255,0.04),
                    inset 0 0 80px rgba(0,0,0,0.4);
      }
      50% {
        box-shadow: 0 0 50px rgba(255,255,255,0.08),
                    inset 0 0 80px rgba(0,0,0,0.4);
      }
    }
    .crt-screen.on {
      opacity: 1;
      animation: flicker 0.13s infinite, glow 5s ease-in-out infinite;
    }

    /* Turn-on keyframes (applied via JS style.animation) */
    @keyframes turnOn {
      0% {
        clip-path: inset(50% 50% 50% 50%);
        filter: brightness(10) saturate(0);
      }
      8% {
        clip-path: inset(49.7% 20% 49.7% 20%);
        filter: brightness(8) saturate(0);
      }
      22% {
        clip-path: inset(49% 2% 49% 2%);
        filter: brightness(4) saturate(0.2);
      }
      48% {
        clip-path: inset(12% 0% 12% 0%);
        filter: brightness(2) saturate(0.6);
      }
      72% {
        clip-path: inset(2% 0% 2% 0%);
        filter: brightness(1.35) saturate(0.9);
      }
      90% {
        clip-path: inset(0% 0% 0% 0%);
        filter: brightness(1.1) saturate(1);
      }
      100% {
        clip-path: inset(0% 0% 0% 0%);
        filter: brightness(1) saturate(1);
      }
    }

    /* ---- Terminal ---- */
    .terminal {
      position: relative;
      z-index: 50;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
    }

    .terminal-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 90%;
      overflow: visible;
    }

    /* Text with phosphor glow + subtle chromatic aberration */
    .t {
      color: ${PHOSPHOR};
      text-shadow:
        0 0 4px rgba(255,255,255,0.5),
        0 0 11px rgba(255,255,255,0.22),
        -0.4px 0 rgba(255,80,80,0.07),
        0.4px 0 rgba(80,80,255,0.07);
    }

    .t-large {
      font-size: 52px;
      letter-spacing: 14px;
      font-weight: bold;
    }

    .t-muted {
      color: rgba(255,255,255,0.2);
      text-shadow: none;
    }

    /* Cursor */
    @keyframes cursorPulse {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .cursor {
      display: inline-block;
      width: 0.55em;
      height: 1em;
      background: ${PHOSPHOR};
      box-shadow: 0 0 8px rgba(255,255,255,0.5);
      position: relative;
      top: 0.22em;
      animation: cursorPulse 1s step-end infinite;
    }

    /* Fade animations */
    @keyframes fadeOut { to { opacity: 0; } }
    @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
    .fade-out { animation: fadeOut 0.4s ease-out forwards; }
    .fade-in  { animation: fadeIn 0.6s ease-in forwards; }

    /* ---- Input ---- */
    .input-row {
      display: flex;
      align-items: baseline;
      font-size: 18px;
      line-height: 1.8;
      white-space: pre;
    }

    .hint {
      margin-top: 14px;
      font-size: 13px;
      color: rgba(255,255,255,0.16);
    }

    .hidden-input {
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

    /* Glitch shake */
    @keyframes glitchShake {
      0%  { transform: translate(0, 0) skewX(0); clip-path: inset(0); }
      8%  { transform: translate(-18px, 8px) skewX(-8deg); }
      16% { transform: translate(22px, -6px) skewX(10deg); clip-path: inset(10% 0 30% 0); }
      24% { transform: translate(-14px, -12px) skewX(-5deg); clip-path: inset(0); }
      32% { transform: translate(25px, 5px) skewX(12deg); }
      40% { transform: translate(-20px, 10px) skewX(-10deg); clip-path: inset(40% 0 10% 0); }
      48% { transform: translate(16px, -14px) skewX(7deg); clip-path: inset(0); }
      56% { transform: translate(-24px, 6px) skewX(-12deg); }
      64% { transform: translate(20px, -10px) skewX(8deg); clip-path: inset(20% 0 20% 0); }
      72% { transform: translate(-12px, 12px) skewX(-6deg); clip-path: inset(0); }
      80% { transform: translate(22px, -8px) skewX(10deg); }
      88% { transform: translate(-18px, 7px) skewX(-8deg); clip-path: inset(50% 0 5% 0); }
      100%{ transform: translate(14px, -5px) skewX(6deg); clip-path: inset(0); }
    }
    .glitch-shake {
      animation: glitchShake 0.08s linear infinite;
    }

    .ether-logo {
      display: block;
    }

    /* ---- Class Selection ---- */
    .class-header {
      margin-top: 32px;
      font-size: 18px;
      line-height: 1.8;
    }

    .class-sections {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 18px;
      max-width: 90vw;
    }

    .class-section {
      width: 100%;
    }

    .group-label {
      font-size: 11px;
      color: rgba(255,255,255,0.25);
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 8px;
      padding-left: 2px;
    }

    .class-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      width: 100%;
      margin-bottom: 12px;
      justify-content: center;
    }

    .class-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 14px 4px 10px;
      width: 96px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 3px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
      background: transparent;
      user-select: none;
    }
    @media (hover: hover) {
      .class-card:hover {
        border-color: rgba(255,255,255,0.45);
        background: rgba(255,255,255,0.035);
        box-shadow: 0 0 14px rgba(255,255,255,0.1);
      }
    }
    .class-card.selected {
      border-color: ${PHOSPHOR};
      background: rgba(255,255,255,0.07);
      box-shadow: 0 0 22px rgba(255,255,255,0.18);
    }

    .class-card img {
      width: 38px;
      height: 38px;
      opacity: 0.5;
      filter: drop-shadow(0 0 3px rgba(255,255,255,0.25));
      transition: opacity 0.15s, filter 0.15s;
    }
    @media (hover: hover) {
      .class-card:hover img {
        opacity: 0.85;
        filter: drop-shadow(0 0 6px rgba(255,255,255,0.45));
      }
    }
    .class-card.selected img {
      opacity: 1;
      filter: drop-shadow(0 0 8px rgba(255,255,255,0.55));
    }

    .class-label {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      text-align: center;
      text-shadow: 0 0 3px rgba(255,255,255,0.15);
      line-height: 1.2;
      transition: color 0.15s;
    }
    @media (hover: hover) {
      .class-card:hover .class-label { color: rgba(255,255,255,0.75); }
    }
    .class-card.selected .class-label { color: ${PHOSPHOR}; }

    .start-btn {
      margin-top: 24px;
      padding: 10px 40px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      color: ${PHOSPHOR};
      background: transparent;
      border: none;
      cursor: pointer;
      text-shadow: 0 0 4px rgba(255,255,255,0.4);
      transition: box-shadow 0.15s, background 0.15s;
    }
    .start-btn:hover {
      box-shadow: 0 0 14px rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.04);
    }

    .class-card.focused {
      border-color: rgba(255,255,255,0.45);
      background: rgba(255,255,255,0.035);
      box-shadow: 0 0 14px rgba(255,255,255,0.1);
    }
  `;
  document.head.appendChild(s);
}

// ---- CRT DOM ----

interface CRT {
  crt: HTMLElement;
  screen: HTMLElement;
  terminal: HTMLElement;
  content: HTMLElement;
}

function createCRT(): CRT {
  const crt = document.createElement('div');
  crt.className = 'crt';

  const screen = document.createElement('div');
  screen.className = 'crt-screen';

  const scanlines = document.createElement('div');
  scanlines.className = 'crt-scanlines';

  const vignette = document.createElement('div');
  vignette.className = 'crt-vignette';

  const terminal = document.createElement('div');
  terminal.className = 'terminal';

  const content = document.createElement('div');
  content.className = 'terminal-content';

  terminal.appendChild(content);
  screen.appendChild(terminal);
  screen.appendChild(scanlines);
  screen.appendChild(vignette);
  crt.appendChild(screen);
  document.body.appendChild(crt);

  return { crt, screen, terminal, content };
}

// ---- CRT Turn-On ----

async function turnOnScreen(screen: HTMLElement): Promise<void> {
  // Start the turn-on: set opacity to 1 and play the animation
  screen.style.opacity = '1';
  screen.style.animation =
    'turnOn 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards';

  await delay(1700);

  // Lock in the final state, switch to steady-state effects
  screen.style.animation = '';
  screen.style.opacity = '';
  screen.style.clipPath = '';
  screen.style.filter = '';
  screen.classList.add('on');
}

// ---- Typewriter ----

async function typeText(
  parent: HTMLElement,
  text: string,
  opts: { speed?: number; large?: boolean } = {},
): Promise<HTMLElement> {
  const span = document.createElement('span');
  span.className = 't';
  if (opts.large) span.classList.add('t-large');
  parent.appendChild(span);

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  parent.appendChild(cursor);

  const speed = opts.speed ?? 60;

  for (let i = 0; i < text.length; i++) {
    span.textContent += text[i];
    await delay(speed + Math.random() * 30 - 10);
  }

  cursor.remove();
  return span;
}

async function fadeOutElement(el: HTMLElement): Promise<void> {
  el.classList.add('fade-out');
  await delay(450);
  el.remove();
}

// ---- Phase: Intro Messages ----

async function introPhase(content: HTMLElement): Promise<void> {
  // "Ether"
  const w1 = document.createElement('div');
  content.appendChild(w1);
  const etherSpan = await typeText(w1, 'Ether', { speed: 130, large: true });
  await delay(1000);

  // Preload logo, match text width
  const logo = document.createElement('img');
  logo.src = 'images/Ether.svg';
  logo.className = 'ether-logo';
  logo.draggable = false;
  logo.style.width = etherSpan.offsetWidth + 'px';

  // Text starts shaking
  etherSpan.classList.add('glitch-shake');
  await delay(150);

  // Hard cut to logo (still shaking)
  etherSpan.style.display = 'none';
  w1.appendChild(logo);
  logo.classList.add('glitch-shake');
  await delay(60);

  // Logo settles
  logo.classList.remove('glitch-shake');
  await delay(250);

  // Logo starts shaking, cuts back to text
  logo.classList.add('glitch-shake');
  await delay(120);
  logo.remove();
  etherSpan.style.display = '';
  // text still has shake class
  await delay(60);

  // Text settles
  etherSpan.classList.remove('glitch-shake');
  await delay(600);
  await fadeOutElement(w1);
  await delay(350);

  // "No player found..."
  const w2 = document.createElement('div');
  content.appendChild(w2);
  await typeText(w2, 'No player found...', { speed: 50 });
  await delay(1600);
  await fadeOutElement(w2);
  await delay(350);

  // "Initiating a new avatar..."
  const w3 = document.createElement('div');
  content.appendChild(w3);
  await typeText(w3, 'Initiating a new avatar...', { speed: 42 });
  await delay(1600);
  await fadeOutElement(w3);
  await delay(500);
}

// ---- Phase: Name Input ----

async function nameInputPhase(content: HTMLElement): Promise<{ name: string; row: HTMLElement; nameSpan: HTMLElement }> {
  const row = document.createElement('div');
  row.className = 'input-row';
  content.appendChild(row);

  // Type the prompt: @me = @ether.@
  const promptSpan = document.createElement('span');
  promptSpan.className = 't';
  row.appendChild(promptSpan);

  const promptText = '@me = @';
  for (let i = 0; i < promptText.length; i++) {
    promptSpan.textContent += promptText[i];
    await delay(48 + Math.random() * 22);
  }

  // Type the muted placeholder one character at a time
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

  // Rearrange: insert nameSpan + cursor before placeholder
  const nameSpan = document.createElement('span');
  nameSpan.className = 't';
  row.insertBefore(nameSpan, placeholder);
  row.insertBefore(cursor, placeholder);

  // "Press enter to be anonymous."
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Press enter to be anonymous.';
  content.appendChild(hint);

  // Hidden input for mobile keyboard support
  const hiddenInput = document.createElement('input');
  hiddenInput.className = 'hidden-input';
  hiddenInput.type = 'text';
  hiddenInput.autocomplete = 'off';
  hiddenInput.autocapitalize = 'off';
  hiddenInput.spellcheck = false;
  content.appendChild(hiddenInput);
  hiddenInput.focus();

  function refocus() { hiddenInput.focus(); }
  document.addEventListener('click', refocus);
  document.addEventListener('touchstart', refocus);

  function sync() {
    const val = hiddenInput.value;
    nameSpan.textContent = val;
    placeholder.style.display = val ? 'none' : '';
    hint.style.display = val ? 'none' : '';
  }

  hiddenInput.addEventListener('input', sync);

  // Wait for Enter to proceed (but keep name editable after)
  await new Promise<void>((resolve) => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        resolve();
      }
    }
    hiddenInput.addEventListener('keydown', onKeyDown);
  });

  // Confirm name
  document.removeEventListener('click', refocus);
  document.removeEventListener('touchstart', refocus);
  cursor.remove();
  placeholder.remove();
  if (!hiddenInput.value.trim()) nameSpan.textContent = 'anonymous';
  hint.remove();
  hiddenInput.remove();

  return { name: hiddenInput.value.trim() || 'anonymous', row, nameSpan };
}

// Re-enter name editing (called when clicking the name row)
async function reEditName(
  row: HTMLElement,
  nameSpan: HTMLElement,
  content: HTMLElement,
): Promise<string> {
  const cursor = document.createElement('span');
  cursor.className = 'cursor';

  const hiddenInput = document.createElement('input');
  hiddenInput.className = 'hidden-input';
  hiddenInput.type = 'text';
  hiddenInput.autocomplete = 'off';
  hiddenInput.autocapitalize = 'off';
  hiddenInput.spellcheck = false;
  hiddenInput.value = nameSpan.textContent === 'anonymous' ? '' : nameSpan.textContent!;
  content.appendChild(hiddenInput);

  nameSpan.textContent = hiddenInput.value;
  row.appendChild(cursor);
  hiddenInput.focus();

  function refocus() { hiddenInput.focus(); }
  document.addEventListener('click', refocus);
  document.addEventListener('touchstart', refocus);

  hiddenInput.addEventListener('input', () => {
    nameSpan.textContent = hiddenInput.value;
  });

  await new Promise<void>((resolve) => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hiddenInput.removeEventListener('keydown', onKeyDown);
        resolve();
      }
    }
    hiddenInput.addEventListener('keydown', onKeyDown);
  });

  document.removeEventListener('click', refocus);
  document.removeEventListener('touchstart', refocus);
  cursor.remove();
  hiddenInput.remove();
  if (!hiddenInput.value.trim()) nameSpan.textContent = 'anonymous';

  return hiddenInput.value.trim() || 'anonymous';
}

// ---- Phase: Class Selection ----

async function classSelectPhase(
  content: HTMLElement,
  nameRow: HTMLElement,
  previousSelected?: Set<string>,
  skipAnim?: boolean,
): Promise<{ result: 'done'; classes: string[] } | { result: 'edit-name'; selected: Set<string> }> {
  // Type header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'class-header';
  content.appendChild(headerDiv);

  const headerSpan = document.createElement('span');
  headerSpan.className = 't';
  headerDiv.appendChild(headerSpan);

  const headerText = '@me Class =';
  if (skipAnim) {
    headerSpan.textContent = headerText;
  } else {
    await delay(350);
    for (let i = 0; i < headerText.length; i++) {
      headerSpan.textContent += headerText[i];
      await delay(48 + Math.random() * 22);
    }
    await delay(300);
  }

  // Build grouped class cards
  const wrapper = document.createElement('div');
  wrapper.className = 'class-sections fade-in';
  content.appendChild(wrapper);

  for (const group of CLASS_GROUPS) {
    const section = document.createElement('div');
    section.className = 'class-section';

    const label = document.createElement('div');
    label.className = 'group-label t-muted';
    label.textContent = group.label;
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'class-grid';

    for (const file of group.files) {
      const card = document.createElement('div');
      card.className = 'class-card';
      card.dataset.file = file;

      const img = document.createElement('img');
      img.src = `icons/${file}.svg`;
      img.alt = fileToLabel(file);
      img.draggable = false;
      card.appendChild(img);

      const cardLabel = document.createElement('div');
      cardLabel.className = 'class-label';
      cardLabel.textContent = fileToLabel(file);
      card.appendChild(cardLabel);

      grid.appendChild(card);
    }

    section.appendChild(grid);
    wrapper.appendChild(section);
  }

  // Start button (hidden until a selection is made)
  const startBtn = document.createElement('button');
  startBtn.className = 'start-btn';
  startBtn.textContent = 'Ready';
  startBtn.style.display = 'none';
  content.appendChild(startBtn);

  // Scroll into view
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Collect all cards in DOM order for keyboard nav
  const allCards = Array.from(wrapper.querySelectorAll('.class-card')) as HTMLElement[];

  // Multi-select handling
  const selected = new Set<string>();
  let focusIdx = -1;

  // Restore previous selections
  if (previousSelected) {
    for (const card of allCards) {
      if (previousSelected.has(card.dataset.file!)) {
        selected.add(card.dataset.file!);
        card.classList.add('selected');
      }
    }
    startBtn.style.display = selected.size > 0 ? '' : 'none';
  }

  function setFocus(idx: number) {
    if (focusIdx >= 0 && focusIdx < allCards.length)
      allCards[focusIdx].classList.remove('focused');
    focusIdx = idx;
    if (focusIdx >= 0 && focusIdx < allCards.length) {
      allCards[focusIdx].classList.add('focused');
      allCards[focusIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function toggleCard(card: HTMLElement) {
    const file = card.dataset.file!;
    if (selected.has(file)) {
      selected.delete(file);
      card.classList.remove('selected');
    } else {
      selected.add(file);
      card.classList.add('selected');
    }
    startBtn.style.display = selected.size > 0 ? '' : 'none';
  }

  // Make name row clickable during class selection
  nameRow.style.cursor = 'pointer';

  return new Promise((resolve) => {
    function cleanup() {
      wrapper.removeEventListener('click', onClick);
      startBtn.removeEventListener('click', onStart);
      document.removeEventListener('keydown', onKey);
      nameRow.removeEventListener('click', onNameClick);
      nameRow.style.cursor = '';
      headerDiv.remove();
      wrapper.remove();
      startBtn.remove();
    }

    function finish() {
      cleanup();
      resolve({ result: 'done', classes: [...selected] });
    }

    function onNameClick() {
      cleanup();
      resolve({ result: 'edit-name', selected: new Set(selected) });
    }

    let lastToggleTime = 0;

    function onClick(e: Event) {
      // Debounce to prevent double-firing from touch + click
      const now = Date.now();
      if (now - lastToggleTime < 300) return;
      lastToggleTime = now;

      const card = (e.target as HTMLElement).closest(
        '.class-card',
      ) as HTMLElement | null;
      if (!card) return;

      // Clear any keyboard focus highlight
      if (focusIdx >= 0 && focusIdx < allCards.length)
        allCards[focusIdx].classList.remove('focused');
      focusIdx = -1;
      toggleCard(card);
    }

    function onStart() {
      if (selected.size > 0) finish();
    }

    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();

      // Navigation
      if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        setFocus(focusIdx < 0 ? 0 : Math.min(focusIdx + 1, allCards.length - 1));
        return;
      }
      if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        setFocus(focusIdx < 0 ? 0 : Math.max(focusIdx - 1, 0));
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        e.preventDefault();
        if (focusIdx < 0) { setFocus(0); return; }
        const cur = allCards[focusIdx].getBoundingClientRect();
        const cx = cur.left + cur.width / 2;
        let best = -1, bestDy = Infinity, bestDx = Infinity;
        for (let i = 0; i < allCards.length; i++) {
          if (i === focusIdx) continue;
          const r = allCards[i].getBoundingClientRect();
          const dy = (r.top + r.height / 2) - (cur.top + cur.height / 2);
          if (dy < 10) continue;
          const dx = Math.abs((r.left + r.width / 2) - cx);
          if (dy < bestDy || (dy === bestDy && dx < bestDx)) {
            best = i; bestDy = dy; bestDx = dx;
          }
        }
        if (best >= 0) setFocus(best);
        return;
      }
      if (key === 'arrowup' || key === 'w') {
        e.preventDefault();
        if (focusIdx < 0) { setFocus(0); return; }
        const cur = allCards[focusIdx].getBoundingClientRect();
        const cx = cur.left + cur.width / 2;
        let best = -1, bestDy = Infinity, bestDx = Infinity;
        for (let i = 0; i < allCards.length; i++) {
          if (i === focusIdx) continue;
          const r = allCards[i].getBoundingClientRect();
          const dy = (cur.top + cur.height / 2) - (r.top + r.height / 2);
          if (dy < 10) continue;
          const dx = Math.abs((r.left + r.width / 2) - cx);
          if (dy < bestDy || (dy === bestDy && dx < bestDx)) {
            best = i; bestDy = dy; bestDx = dx;
          }
        }
        if (best >= 0) setFocus(best);
        return;
      }

      // Toggle focused card with space
      if (key === ' ') {
        e.preventDefault();
        if (focusIdx >= 0) toggleCard(allCards[focusIdx]);
        return;
      }

      // Enter to start
      if (key === 'enter' && selected.size > 0) {
        e.preventDefault();
        finish();
      }
    }

    wrapper.addEventListener('click', onClick);
    startBtn.addEventListener('click', onStart);
    document.addEventListener('keydown', onKey);
    nameRow.addEventListener('click', onNameClick);
  });
}

// ---- Main Flow ----

async function greetings(): Promise<void> {
  injectStyles();
  const { screen, content } = createCRT();

  // Pause, then power on the CRT
  await delay(700);
  await turnOnScreen(screen);
  await delay(500);

  // Intro sequence
  await introPhase(content);

  // Name input
  const { name: initialName, row: nameRow, nameSpan } = await nameInputPhase(content);
  let name = initialName;
  let previousSelected: Set<string> | undefined;
  let skipAnim = false;

  // Class selection loop (allows going back to edit name)
  while (true) {
    await delay(350);
    const result = await classSelectPhase(content, nameRow, previousSelected, skipAnim);
    if (result.result === 'done') {
      const labels = result.classes.map(fileToLabel);
      console.log(`[Ether] Avatar: ${name}, Classes: ${labels.join(', ')}`);
      break;
    }
    // User clicked name row — save selections, go back to name editing
    previousSelected = result.selected;
    name = await reEditName(nameRow, nameSpan, content);
    skipAnim = true;
  }
}

// ---- Boot ----

document.addEventListener('DOMContentLoaded', greetings);
