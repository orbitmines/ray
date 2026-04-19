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

  passes: { steps: (() => void)[] }[] = [{ steps: [] }]
  get current_pass() { return this.passes[this.passes.length - 1] }
  step = <K extends { [K in keyof Backend]: Backend[K] extends (...args: any[]) => any ? K : never }[keyof Backend]>(method: K) => {
    return (...args: Backend[K] extends (...args: infer A) => any ? A : never) => {
      this.current_pass.steps.push(() => (this.backend[method] as (...args: any[]) => any)(...args));
      return this;
    };
  }
  pass = (fn: (language: this) => this) => {
    if (this.current_pass.steps.length > 0)
      this.passes.push({ steps: [] })

    fn(this)
    this.passes.push({ steps: [] })
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

  load = this.step('loadFile')
  loadFile = this.step('loadFile')
  loadDirectory = this.step('loadDirectory')
  add = this.step('add')

  cli = this.delegate('cli')
  exec = this.delegate('exec')
  repl = this.delegate('repl')
  build = this.delegate('build')
}

const UNKNOWN = Symbol("Unknown")
type Method = (ctx: Node, self: Node, args?: Node) => Node
type ResolvedMethod = (args?: Node) => Node | undefined
type Key = string | Node
export class Node {
  value: { encoded: any; methods: Map<Key, Method> } = { encoded: UNKNOWN, methods: new Map() };

  private _thunks: ((self: Node) => void)[] | null = null;
  lazily(fn: (self: Node) => void): this { if (!this._thunks) this._thunks = []; this._thunks.push(fn); return this; }
  realize(): Node {
    if (this._thunks) { const t = this._thunks; this._thunks = null; for (const fn of t) fn(this); }
    return this;
  }
  lazy_get = (ctx: Node, key: Key): Node => new Node().lazily((self) => self.value = this.get(key)(ctx, this).value);
  lazy_set = (value: Node): Node => this.lazily((self) => self.value = value.realize().value);
  lazy_call = (ctx: Node, args: Node): Node => new Node().lazily((self) => self.value = this.call(ctx, args).value);

  constructor(public _super?: Node, encoded: any = UNKNOWN) { this.value.encoded = encoded; }

  get unknown(): boolean { return this.value.encoded === UNKNOWN; }
  get none(): boolean { return this.value.encoded === null || this.value.encoded === undefined; }

  //TODO has/get should pattern match if key is Node
  has = (ctx: Node, key: Key): boolean => { return this.value.methods.has(key) && !this.resolve(ctx, key)().none; }
  get = (key: Key): Method | undefined => { this.realize(); return this.value.methods.get(key); }
  set = (val: Node): Node => { this.realize(); this.value = val.value; return this; }
  call = (ctx: Node, args: Node) => {
    this.realize()
    if (!is_function(this.value.encoded)) throw new Error("Not callable.")
    return this.value.encoded(ctx, this, args)
  }

  resolve = (ctx: Node, key: Key): ResolvedMethod => {
    if (this.has(ctx, key)) return (...args) => this.get(key)(ctx, this, ...args)
    if (this._super) return this._super.resolve(ctx, key);
    return () => new Node(null, null)
  }

  external_method = (key: Key, fn: Method): this => {
    this.value.methods.set(key, fn);
    return this;
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
      if (offset == 1) return b < 0 || b >= this.reader.source.length ? '' : this.reader.source[b];

      if (b < a) { [a, b] = [b, a] }
      return this.reader.source.slice(Math.max(a, 0), Math.min(b + 1, this.reader.source.length))
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
    move.upto = (char: string) => {}
    move.until = (char: string): string => {
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

  freeze = () => {
    //TODO Freeze these tokens from reparsing. But do something with them
  }
  comment = () => {
    //TODO Set as comment, skippable for others. peak/etc skip over comments
  }

  private single_char = () => this._begin == undefined && this._end == undefined;
  get string() { return this.single_char() ? this.reader.source[this.cursor.index] : this.reader.source.slice(this.begin.index, this.end.index + 1); }

  error = (phase: string, message: string) => this.reader.language.log.error(phase, message, this.begin)
  warning = (phase: string, message: string) => this.reader.language.log.warning(phase, message, this.begin)
  info = (phase: string, message: string) => this.reader.language.log.info(phase, message, this.begin)
  fatal = (phase: string, message: string) => this.reader.language.log.fatal(phase, message, this.begin)

}

class Grammar {

}

//  scope = () => {}
//  allowForwardRef = () => {}

class Reader {
  source: string;
  cursor: PotentialNode = new PotentialNode(this)

  constructor(public language: Language) {
  }


}

export const Ray = new Language('ether', 'E.2026v0.D0')
  .extension('.ray')

  .token(_ => _
    .left.syntax(_.methods.filter(x => x.rtl))
    .right.syntax(_.methods.filter(x => x.ltr))
  )

  //.external_method()
  .base()
    .external_method()
    .external_method()
    .external_method()
  .context()//.base()
  .external_method('local') // => this
  //.external_method()

  .pass(_ => _
    .cd('@ether/$/.ray', _ => _.loadFile('Node'))

    .syntax(_ => {
      // const PATTERNED_RULE = E( E(E, '{', E.reinterpet(AT_PASS_2), '}', E).length('>=', 1).freeze(), E.until('=>'), E.block())
      E.patterned_rule = (node: Node) => E(E, '{', E.reinterpet('std'), '}', E).length('>=', 1).bind('pattern').freeze().until('=>').block()
        // E.block = E.any(E.block(), E.block('{', '}')) for the languages that want to set things
        // inner .freeze is overridden by .reinterpret,

        .interpret(_ => node.external_method(_.pattern.string, FORWARD_REF))
        // .freeze on rule pattern part, not the body.
        // .buffer on .interpret means buffer effect for next pass.


      E(
        [E.goto(E.patterned_rule(_.context()))],
        E.upto('class *').upto('\n').block(_ =>
          [E.goto(E.patterned_rule(_.base()))]
        )
      ).repeats()
    })

    .base(_ => _
      .external_method()
    )
  )
  .pass(_ => _
    E.ref('std')

    .cd('@ether/$/.ray', _ => _.loadDirectory('.', { recursively: true }))
    .cd('@ether', _ => _.load('Ether'))
  )


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