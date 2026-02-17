// ============================================================
// CRTShell.ts — Reusable CRT monitor shell: DOM, styles, animations
// No dependencies. Pure DOM + CSS.
// ============================================================

export const PHOSPHOR = '#ffffff';
export const CRT_SCREEN_BG = '#0a0a0a';

// ---- Utilities ----

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fadeOutElement(el: HTMLElement): Promise<void> {
  el.classList.add('fade-out');
  await delay(450);
  el.remove();
}

// ---- CRT Interface ----

export interface CRT {
  crt: HTMLElement;
  screen: HTMLElement;
  scanlines: HTMLElement;
  vignette: HTMLElement;
  terminal: HTMLElement;
  content: HTMLElement;
}

// ---- Style Injection ----

export function injectCRTStyles(): HTMLStyleElement {
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
      background: ${CRT_SCREEN_BG};
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
      transition: opacity 1.5s ease-out;
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
      transition: opacity 1.5s ease-out;
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
      color: rgba(255,255,255,0.35);
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
      color: rgba(255,255,255,0.3);
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
  `;
  document.head.appendChild(s);
  return s;
}

// ---- CRT DOM ----

export function createCRT(): CRT {
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

  return { crt, screen, scanlines, vignette, terminal, content };
}

// ---- CRT Turn-On ----

export async function turnOnScreen(screen: HTMLElement): Promise<void> {
  screen.style.opacity = '1';
  screen.style.animation =
    'turnOn 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards';

  await delay(1700);

  screen.style.animation = '';
  screen.style.opacity = '';
  screen.style.clipPath = '';
  screen.style.filter = '';
  screen.classList.add('on');
}

// ---- CRT Dissolve ----

export async function dissolveCRT(crt: CRT): Promise<void> {
  const { scanlines, vignette, screen } = crt;

  // Fade out scanlines and vignette
  scanlines.style.opacity = '0';
  vignette.style.opacity = '0';

  // Transition border-radius to 0
  screen.style.transition = 'border-radius 1.5s ease-out, background 1.5s ease-out, box-shadow 1.5s ease-out';
  screen.style.borderRadius = '0';

  // Stop flicker/glow — override with static state
  screen.classList.remove('on');
  screen.style.opacity = '1';
  screen.style.animation = 'none';
  screen.style.boxShadow = 'none';

  // Unify backgrounds to the screen's center color
  screen.style.background = CRT_SCREEN_BG;
  crt.crt.style.transition = 'background 1.5s ease-out';
  crt.crt.style.background = CRT_SCREEN_BG;
  document.body.style.transition = 'background 1.5s ease-out';
  document.body.style.background = CRT_SCREEN_BG;

  // Wait for transitions to complete
  await delay(2000);

  // Clean up scanline/vignette elements
  scanlines.remove();
  vignette.remove();
}

// ---- Typewriter ----

export async function typeText(
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
