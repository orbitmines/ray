/**
 * Dynamic terminal pretty-printer for parallel mirror operations.
 * Zero external dependencies — ANSI escape codes via process.stdout.write.
 *
 * TTY mode: cursor-up-and-overwrite rendering at 80ms intervals.
 * Non-TTY mode: line-by-line logging with [platform] prefixes.
 */

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

// ANSI escape helpers
const ESC = '\x1b[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const ERASE_LINE = `${ESC}2K`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const RED = `${ESC}31m`;
const GRAY = `${ESC}90m`;

type TaskStatus = 'waiting' | 'running' | 'done' | 'error';

interface TaskState {
  id: string;
  label: string;
  status: TaskStatus;
  count: number;
  current: string;
  error: string;
  startTime: number;
  elapsed: number; // ms, set on completion
}

export interface DisplayOptions {
  header: string;
  concurrency: number;
  ids: string[];
  labels: Record<string, string>;
}

export class Display {
  private tasks: Map<string, TaskState> = new Map();
  private order: string[]; // preserves insertion order for rendering
  private header: string;
  private concurrency: number;
  private isTTY: boolean;
  private renderInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private linesWritten = 0;
  private startTime = 0;

  // Console intercept
  private origLog: typeof console.log;
  private origError: typeof console.error;
  private origWarn: typeof console.warn;
  private interceptedLines: string[] = [];

  constructor(opts: DisplayOptions) {
    this.header = opts.header;
    this.concurrency = opts.concurrency;
    this.isTTY = process.stdout.isTTY === true;
    this.order = [...opts.ids];
    this.origLog = console.log;
    this.origError = console.error;
    this.origWarn = console.warn;

    for (const id of opts.ids) {
      this.tasks.set(id, {
        id,
        label: opts.labels[id] ?? id,
        status: 'waiting',
        count: 0,
        current: '',
        error: '',
        startTime: 0,
        elapsed: 0,
      });
    }
  }

  start(): void {
    this.startTime = Date.now();

    if (!this.isTTY) {
      this.logLine(`${this.header}`);
      return;
    }

    // Hide cursor
    process.stdout.write(HIDE_CURSOR);

    // Intercept console.log/error/warn to suppress adapter noise
    console.log = (...args: unknown[]) => {
      this.interceptedLines.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      this.interceptedLines.push(args.map(String).join(' '));
    };
    console.warn = (...args: unknown[]) => {
      this.interceptedLines.push(args.map(String).join(' '));
    };

    // Start render loop
    this.renderInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);

    // Clean exit on SIGINT
    process.on('SIGINT', () => {
      this.stop();
      process.exit(130);
    });

    // Initial render
    this.render();
  }

  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'running';
    task.startTime = Date.now();

    if (!this.isTTY) {
      this.logLine(`[${task.label}] Syncing...`);
    }
  }

  updateProgress(id: string, count: number, current: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.count = count;
    task.current = current;
  }

  completeTask(id: string, count: number): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'done';
    task.count = count;
    task.elapsed = Date.now() - task.startTime;
    task.current = '';

    if (!this.isTTY) {
      this.logLine(`[${task.label}] Done — ${this.fmtCount(count)} (${this.fmtTime(task.elapsed)})`);
    }
  }

  failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'error';
    task.error = error;
    task.elapsed = Date.now() - task.startTime;
    task.current = '';

    if (!this.isTTY) {
      this.logLine(`[${task.label}] Error: ${error}`);
    }
  }

  stop(): void {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    if (this.isTTY) {
      // Final render
      this.render();

      // Restore console
      console.log = this.origLog;
      console.error = this.origError;
      console.warn = this.origWarn;

      // Show cursor
      process.stdout.write(SHOW_CURSOR);

      // Print summary below
      this.origLog('');
    }

    // Print final summary
    const done = [...this.tasks.values()].filter(t => t.status === 'done');
    const errors = [...this.tasks.values()].filter(t => t.status === 'error');
    const total = this.tasks.size;
    const elapsed = this.fmtTime(Date.now() - this.startTime);

    if (this.isTTY) {
      this.origLog(`${done.length}/${total} completed in ${elapsed}${errors.length ? `, ${RED}${errors.length} error(s)${RESET}` : ''}`);
    } else {
      this.logLine(`${done.length}/${total} completed in ${elapsed}${errors.length ? `, ${errors.length} error(s)` : ''}`);
    }

    if (errors.length) {
      for (const e of errors) {
        if (this.isTTY) {
          this.origLog(`  ${RED}${e.label}: ${e.error}${RESET}`);
        } else {
          this.logLine(`  ${e.label}: ${e.error}`);
        }
      }
    }
  }

  // -- Private --

  private render(): void {
    const spinner = SPINNER_FRAMES[this.spinnerFrame];
    const lines: string[] = [];

    // Header
    const doneCount = [...this.tasks.values()].filter(t => t.status === 'done').length;
    const errCount = [...this.tasks.values()].filter(t => t.status === 'error').length;
    const runningCount = [...this.tasks.values()].filter(t => t.status === 'running').length;

    if (doneCount + errCount < this.tasks.size) {
      lines.push(`${CYAN}${spinner}${RESET} ${BOLD}${this.header}${RESET}`);
    } else {
      lines.push(`${GREEN}✓${RESET} ${BOLD}${this.header}${RESET}`);
    }
    lines.push('');

    // Determine how many lines we can show
    const termRows = process.stdout.rows || 40;
    // Reserve: header(1) + blank(1) + footer(1) + blank(1) + buffer(2)
    const maxTaskLines = Math.max(4, termRows - 6);

    // Build task lines
    const taskLines: string[] = [];
    const maxLabel = Math.max(...[...this.tasks.values()].map(t => t.label.length), 6);
    let waitingCount = 0;

    for (const id of this.order) {
      const task = this.tasks.get(id)!;

      switch (task.status) {
        case 'waiting':
          waitingCount++;
          // Only show waiting tasks if we have room
          if (taskLines.length < maxTaskLines - 2) { // leave room for collapsed + footer
            taskLines.push(`  ${GRAY}○ ${task.label.padEnd(maxLabel)}${RESET}  ${DIM}Waiting...${RESET}`);
          }
          break;
        case 'running': {
          const countStr = this.fmtCount(task.count);
          const currentStr = task.current ? ` — ${task.current}` : '';
          taskLines.push(`  ${CYAN}${spinner} ${task.label.padEnd(maxLabel)}${RESET}  ${countStr}${currentStr}`);
          break;
        }
        case 'done': {
          const timeStr = this.fmtTime(task.elapsed);
          taskLines.push(`  ${GREEN}✓ ${task.label.padEnd(maxLabel)}${RESET}  Done — ${this.fmtCount(task.count)} (${timeStr})`);
          break;
        }
        case 'error':
          taskLines.push(`  ${RED}✗ ${task.label.padEnd(maxLabel)}${RESET}  ${RED}Error: ${this.truncate(task.error, 60)}${RESET}`);
          break;
      }
    }

    // If we overflowed on waiting tasks, collapse
    if (taskLines.length > maxTaskLines) {
      // Remove excess waiting lines from the end
      const overflow = taskLines.length - maxTaskLines + 1; // +1 for the collapse line
      // Find and remove waiting lines from the bottom
      let removed = 0;
      for (let i = taskLines.length - 1; i >= 0 && removed < overflow; i--) {
        if (taskLines[i].includes('Waiting...')) {
          taskLines.splice(i, 1);
          removed++;
        }
      }
      if (waitingCount > 0) {
        const hiddenWaiting = waitingCount - (taskLines.filter(l => l.includes('Waiting...')).length);
        if (hiddenWaiting > 0) {
          taskLines.push(`  ${DIM}...${hiddenWaiting} waiting${RESET}`);
        }
      }
    }

    lines.push(...taskLines);

    // Footer
    lines.push('');
    const footerParts: string[] = [];
    if (doneCount > 0) footerParts.push(`${GREEN}${doneCount}${RESET} completed`);
    if (runningCount > 0) footerParts.push(`${CYAN}${runningCount}${RESET} running`);
    if (errCount > 0) footerParts.push(`${RED}${errCount}${RESET} error${errCount > 1 ? 's' : ''}`);
    if (waitingCount > 0) footerParts.push(`${DIM}${waitingCount} waiting${RESET}`);
    lines.push(`  ${footerParts.join(', ')}`);

    // Build output: move cursor up, erase+write each line
    let output = '';

    // Move cursor up to overwrite previous frame
    if (this.linesWritten > 0) {
      output += `${ESC}${this.linesWritten}A`;
    }

    for (const line of lines) {
      output += `${ERASE_LINE}${line}\n`;
    }

    // Clear any leftover lines from previous frame if it was taller
    if (lines.length < this.linesWritten) {
      for (let i = 0; i < this.linesWritten - lines.length; i++) {
        output += `${ERASE_LINE}\n`;
      }
      // Move cursor back up for the extra cleared lines
      output += `${ESC}${this.linesWritten - lines.length}A`;
    }

    this.linesWritten = lines.length;
    process.stdout.write(output);
  }

  private logLine(msg: string): void {
    this.origLog(msg);
  }

  private fmtCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return String(n);
  }

  private fmtTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    if (m < 60) return `${m}m${rem}s`;
    const h = Math.floor(m / 60);
    return `${h}h${m % 60}m`;
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}
