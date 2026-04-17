import path from "path";
import fs from "fs";

export interface Location {
  file?: string;
  line?: number;
  col?: number;
}

export interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  phase: string;
  message: string;
  location?: Location;
}


export class Diagnostics {
  private items: Diagnostic[] = [];
  private keys = new Set<string>();
  private _cascadeSuppression = false;
  private _unresolvedNames = new Set<string>();

  constructor() {

  }

  clock = () => {
    class Clock {
      a: number; b: number;
      constructor() { this.a = performance.now(); }
      stop = () => this.b = performance.now();
      toString = () => {
        this.stop();
        return `${(this.b - this.a).toFixed(1)}ms`
      }
    }
    return new Clock();
  }

  enableCascadeSuppression() { this._cascadeSuppression = true; }

  describe = (a: any) => {

  }

  report(diag: Diagnostic) {
    const { file, line, col } = diag.location ?? {};
    const key = `${file ?? ''}:${line ?? 0}:${col ?? 0}|${diag.message}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    if (this._cascadeSuppression && diag.phase === 'resolve') {
      const nameMatch = diag.message.match(/Unresolved identifier: (.+)/);
      if (nameMatch) {
        const name = nameMatch[1];
        for (const prev of this._unresolvedNames) {
          if (name.includes(prev) && name !== prev) return;
        }
        this._unresolvedNames.add(name);
      }
    }
    this.items.push(diag);
  }

  error(phase: string, message: string, location?: Location) {
    this.report({ level: 'error', phase, message, location });
  }

  fatal(phase: string, message: string, location?: Location): never {
    this.error(phase, message, location);
    this.print();
    process.exit(1);
  }

  warning(phase: string, message: string, location?: Location) {
    this.report({ level: 'warning', phase, message, location });
  }

  info = (phase: string, message: string, location?: Location) => {
    this.report({ level: 'info', phase, message, location });
  }

  get errors() { return this.items.filter(d => d.level === 'error'); }
  get warnings() { return this.items.filter(d => d.level === 'warning'); }
  get hasErrors() { return this.items.some(d => d.level === 'error'); }
  get count() { return this.items.length; }

  static locate(source: string, pos: number): { line: number; col: number; context: string } {
    let line = 1, col = 1;
    for (let i = 0; i < pos && i < source.length; i++) {
      if (source[i] === '\n') { line++; col = 1; } else col++;
    }
    const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = source.indexOf('\n', pos);
    const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    const pointer = ' '.repeat(col - 1) + '^';
    return { line, col, context: `  ${lineText}\n  ${pointer}` };
  }

  print(label?: string) {
    const errs = this.errors, warns = this.warnings;
    if (errs.length === 0 && warns.length === 0) {
      console.error(label ? `  \x1b[90m${label}: No errors.\x1b[0m` : '  \x1b[90mNo errors.\x1b[0m');
      return;
    }
    for (const d of this.items) {
      const lbl = d.level === 'error' ? `\x1b[1;31merror\x1b[0m` : `\x1b[1;33mwarning\x1b[0m`;
      const { file, line, col } = d.location ?? {};
      if (file) console.error(`  \x1b[90m${file}:${line ?? 0}:${col ?? 0}\x1b[0m`);
      console.error(`    ${lbl}\x1b[90m[${d.phase}]\x1b[0m: ${d.message}`);
    }
    const parts: string[] = [];
    if (errs.length) parts.push(`\x1b[1;31m${errs.length} error${errs.length > 1 ? 's' : ''}\x1b[0m`);
    if (warns.length) parts.push(`\x1b[1;33m${warns.length} warning${warns.length > 1 ? 's' : ''}\x1b[0m`);
    console.error(`\n  ${parts.join(', ')}`);
  }
}

interface Backend {
  language: Language
  cli(defaultPath: string, args: { [key: string]: string[] }): void
  exec(): void
  repl(): void
  build(): void
}

export class Language implements Backend{

  language: Language = this;
  backend: Backend | undefined;

  log = new Diagnostics();


  constructor(public name: string, public version: string) {

  }

  cli = (defaultPath: string, args: { [key: string]: string[] }) => {
    const timer = this.log.clock()

    if ((args['@'] ?? []).length === 0) args['@'] = [defaultPath];
    const location = path.resolve(args['@'][0]);
    delete args['@'];

    const _eval = args['eval'] ?? []; delete args['eval'];
    if (_eval) {
      this.load(..._eval)
    } else {
      const stat = fs.statSync(location);
      if (stat.isFile()) {
        this.loadFile(location)
      } else if (stat.isDirectory()) {
        this.loadDirectory(location, { recursively: true })
      } else {
        return this.log.fatal('file system', `"${location}": not a file or directory`);
      }
    }

    this.exec()

    this.log.info('timer', `  ${timer.toString()} total`)
  }

  exec = () => {

    if (this.log.hasErrors) {
      process.exitCode = 1;
      this.log.print()
    }
  }

  repl = () => {
    if (this.backend) return this.backend.repl();

    import('readline').then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = () => {
        rl.question(`${this.name}> `, (line: string) => {
          this.log.describe(
            this.load(line.trim()).exec()
          )
          prompt();
        });
      };
      prompt();
    });
  }
  build(): void {
    if (this.backend) return this.backend.build();

    throw new Error("Method not implemented.");
  }
}

export const Ray = new Language('ether', '2026.v0.5')
  .extension('.ray')

  .cd('@ether/$/.ray')
    .loadFile('Node')
    .loadDirectory('.', { recursively: true })
  .cd('@ether')
    .load('Ether')

  .grammar()
    .dynamic()
    .case()

  .objects()
    .baseClass()

Ray.exec()
Ray.backend('llvm').repl()
Ray.backend('llvm', 'X').build()
