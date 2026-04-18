import path from "path";
import fs from "fs";

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

  fatal(phase: string, message: string, location?: Location): never {
    this.error(phase, message, location);
    this.print();
    process.exit(1);
  }
  error = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'error', phase, message, location });
  warning = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'warning', phase, message, location });
  info = (phase: string, message: string, location?: Location) =>
    this.report({ level: 'info', phase, message, location });

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
  log: Diagnostics;

  load(location: string | string[]): this
  loadFile(location: string): this
  loadDirectory(location: string, options: { recursively?: boolean }): this
  add(...source: string[]): this

  cli(location: string[], args: { [key: string]: string[] }): void
  exec(): void
  repl(): void
  build(): void
}

export class Runtime implements Backend {

  constructor(public language: Language) {}
  log = new Diagnostics();

  load = (location: string | string[]): this => {
    if (is_array(location)) { location.forEach(this.load); return this; }

    const stat = fs.statSync(location);
    if (stat.isFile()) {
      this.loadFile(location)
    } else if (stat.isDirectory()) {
      this.loadDirectory(location, { recursively: true })
    } else {
      return this.log.fatal('file system', `"${location}": not a file or directory`);
    }
    return this;
  }
  loadFile = (location: string): this => {
    return this;
  }
  loadDirectory = (location: string, options: { recursively?: boolean }): this => {
    return this;
  }
  add = (...source: string[]): this => {
    return this;
  }

  cli = (location: string[], args: { [key: string]: string[] }) => {
    const timer = this.log.clock()

    const _eval = args['eval'] ?? []; delete args['eval'];
    if (_eval) { this.add(..._eval) } else { this.load(location) }

    this.exec()

    this.log.info('timer', `  ${timer.toString()} total`)
  }

  exec = (): Node => {

    if (this.log.hasErrors) {
      process.exitCode = 1;
      this.log.print()
    }
  }

  repl = () => {
    import('readline').then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = () => {
        rl.question(`${this.language.name}> `, (line: string) => {
          this.log.describe(
            this.load(line.trim()).exec()
          )
          prompt()
        });
      };
      prompt()
    })
  }
  build(): void {
    throw new Error("Method not implemented.");
  }
}

export class Language implements Backend {

  language: Language = this;
  backend: Backend = new Runtime(this);
  get log() { return this.backend.log; }

  private _extension: string[]
  extension = (...extension: string[]): this => { this._extension.push(...extension); return this }

  steps: (() => void)[]
  step = <K extends { [K in keyof Backend]: Backend[K] extends (...args: any[]) => any ? K : never }[keyof Backend]>(method: K) => {
    return (...args: Backend[K] extends (...args: infer A) => any ? A : never) => {
      this.steps.push(() => (this.backend[method] as (...args: any[]) => any)(...args));
      return this;
    };
  }
  delegate = <K extends keyof Backend>(method: K) => (...args: Backend[K] extends (...args: infer A) => any ? A : never) => (this.backend[method] as (...args: any[]) => any)(...args);

  constructor(public name: string, public version: string) {

  }

  cd = (dir: string, fn: (language: Language) => void): this => {
    fn(new Proxy(class {}, {
      get: (target, property) => {
        if (is_string(property) && ['load', 'loadFile', 'loadDirectory'].includes(property))
          return (...args: any[])=> (this as any)[property](...args.map(x => is_string(x) ? `${dir}/${x}` : x));

        return (this as any)[property]
      }
    }) as any as Language)
    return this;
  }

  grammar = (grammar: (grammar: Grammar) => Grammar): this => this;

  load = this.step('loadFile')
  loadFile = this.step('loadFile')
  loadDirectory = this.step('loadDirectory')
  add = this.step('add')

  cli = this.delegate('cli')
  exec = this.delegate('exec')
  repl = this.delegate('repl')
  build = this.delegate('build')
}

export class Node {
  constructor(public _super?: Node) {
  }
}

export type Location = {
  file?: string;
  line?: number;
  col?: number;
  index: number
}

export class PotentialNode {
  public _begin?: Location; public cursor: Location; public _end?: Location
  get begin() { return this._begin ?? this.cursor; }
  get end() { return this._end ?? this.cursor; }

  constructor(public reader: Reader) {}

  private direction = (direction: -1 | 1) => {
    const boundary = () => direction === -1 ? this.begin : this.end;

    const move = (offset: number = 1) => {
      if (direction === -1) {
        this._begin = { index: this.begin.index - offset }
      } else {
        this._end = { index: this.end.index + offset }
      }
    }

    move.done = () => {
      const next = boundary().index + direction;
      return next < 0 || next >=  this.reader.source.length;
    };

    move.peak = (offset: number = 1): string => {
      if (offset === 0) return '';
      if (offset < 0) return this.direction(direction === -1 ? 1 : -1).peak(offset * -1)

      let a = boundary().index;
      let b = a + (offset * direction);
      if (offset == 1) return this.reader.source[b];

      if (b < a) { [a, b] = [b, a] }
      return this.reader.source.slice(a, b + 1)
    }
    move.at = (s: string): boolean => move.peak(s.length) === s;
    move.capture = (char: string): boolean => {
      if (move.done() || move.peak() !== char) return false;
      move();
      return true;
    }
    move.capture_while = (pred: (ch: string) => boolean): number => {
      let n = 0;
      while (!move.done() && pred(move.peak())) { n++; move(); }
      return n;
    }
    move.capture_whitespace = (): number => move.capture_while(ch => ch === ' ');
    move.capture_line = (): string => {
      let a = boundary().index;
      move.capture_while(ch => ch !== '\n');
      let b = boundary().index;

      if (a === b) return '';
      if (b < a) { [a, b] = [b, a] }
      return this.reader.source.slice(a, b + 1)
    }
    move.capture_indent = (): number => {
      if (direction === -1) { return this.fatal('rtl', 'capture_indent not supported for rtl.') } // TODO EOL whitespace if -1
      move.capture('\n');
      return move.capture_whitespace();
    }
    move.capture_until = (char: string): string => {
      // const opens  = direction === 1 ? '([{' : ')]}';
      // const closes = direction === 1 ? ')]}' : '([{';
      // const depth: string[] = [];
      // const before = boundary().index;
      //
      // while (!done()) {
      //   const ch = move.peak();
      //   if (depth.length === 0 && ch === char) break;
      //   const open = opens.indexOf(ch);
      //   if (open !== -1) depth.push(closes[open]);
      //   else if (depth.length > 0 && ch === depth[depth.length - 1]) depth.pop();
      //   move();
      // }
      //
      // return slice(before, boundary().index);
    }
    move.skip = () => this.move({ index: boundary().index + (1 * direction) })

    return move;
  }

  left = this.direction(-1)
  move = (cursor: Location) => { this.cursor = cursor; this._begin = this._end = undefined  }
  right = this.direction(1)

  ltr = () => {}
  rtl = () => {}
  left_associative = () => {}
  right_associative = () => {}

  get done() { return this.end.index >= this.reader.source.length; }

  private single_char = () => this._begin == undefined && this._end == undefined;
  get string() { return this.single_char() ? this.reader.source[this.cursor.index] : this.reader.source.slice(this.begin.index, this.end.index + 1); }

  error = (phase: string, message: string) => this.reader.language.log.error(phase, message, this.begin)
  warning = (phase: string, message: string) => this.reader.language.log.warning(phase, message, this.begin)
  info = (phase: string, message: string) => this.reader.language.log.info(phase, message, this.begin)
  fatal = (phase: string, message: string) => this.reader.language.log.fatal(phase, message, this.begin)

}
//  scope = () => {}
//  allowForwardRef = () => {}
export class Grammar extends Cursor {
  constructor(public parent?: Grammar) {
    super();
  }


}

class Reader {
  source: string;
  cursor: PotentialNode = new PotentialNode(this)

  constructor(public language: Language) {
  }


}

export const Ray = new Language('ether', 'E.2026v0.D0')
  .extension('.ray')

  .grammar(_ => _
    .dynamic()
    .pass(_ => _
      .base(_ => _
        .external_method()
      )

      .cd('@ether/$/.ray', _ => _.loadFile('Node'))
    )
    .pass(_ => _


      .cd('@ether/$/.ray', _ => _.loadDirectory('.', { recursively: true }))
      .cd('@ether', _ => _.load('Ether'))
    )
  //.external_method()
  )
  .base()
    .external_method()
    .external_method()
    .external_method()
  .context()//.base()
    .external_method('local')
//.external_method()


Ray.exec()
Ray.backend('llvm').repl()
Ray.backend('llvm', 'X').build()


/**
 * Copied from https://github.com/lodash/lodash/blob/main/dist/lodash.js
 */
export const is_boolean = (value: any): value is boolean =>
  value === true || value === false || (is_object_like(value) && base_tag(value) == '[object Boolean]');
export const is_number = (value: any): value is number => typeof value == 'number' || (is_object_like(value) && base_tag(value) == '[object Number]');
export const is_string = (value: any): value is string =>
  typeof value == 'string' || (!is_array(value) && is_object_like(value) && base_tag(value) == '[object String]');
export const is_function = (value: any): value is ((...args: any[]) => any) => {
  if (!is_object(value)) return false;

  let tag = base_tag(value);
  return tag == '[object Function]' || tag == '[object GeneratorFunction]' || tag == '[object AsyncFunction]' || tag == '[object Proxy]';
}
export const is_array = Array.isArray
export const is_object = (value: any): value is object =>
  value != null && (typeof value == 'object' || typeof value == 'function');
export const is_object_like = (value: any) =>
  value != null && typeof value == 'object';
export const base_tag = (value: any) => {
  if (value == null) return value === undefined ? '[object Undefined]' : '[object Null]';

  return (Symbol.toStringTag && Symbol.toStringTag in Object(value)) ? raw_tag(value) : to_string(value);
}
export const raw_tag = (value: any) => {
  let isOwn = Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag),
    tag = value[Symbol.toStringTag];

  let unmasked;
  try {
    value[Symbol.toStringTag] = undefined;
    unmasked = true;
  } catch (e) {}

  let result = to_string(value);
  if (unmasked) {
    if (isOwn) {
      value[Symbol.toStringTag] = tag;
    } else {
      delete value[Symbol.toStringTag];
    }
  }
  return result;
}
export const to_string = (value: any): String => Object.prototype.toString.call(value);