import fs from 'fs';
import path from 'path';

const UNKNOWN = Symbol("Unknown");

class Node {
  value: { encoded: any; methods: Map<string | Node, (key: Node) => Node> } = { encoded: UNKNOWN, methods: new Map() };

  private _thunks: ((self: Node) => void)[] | null = null;

  constructor(encoded: any = UNKNOWN) {
    this.value.encoded = encoded;
  }

  get none(): boolean { return this.value.encoded === null || this.value.encoded === undefined; }

  lazily(fn: (self: Node) => void): this {
    if (!this._thunks) this._thunks = [];
    this._thunks.push(fn);
    return this;
  }

  lazy_get = (key: string | Node): Node => new Node().lazily((self) => self.value = this.get(key).value)
  lazy_set = (value: Node): Node => this.lazily((self) => self.value = value.realize().value)
  realize(): Node {
    if (this._thunks) {
      const thunks = this._thunks;
      this._thunks = null;
      for (const fn of thunks) fn(this);
    }
    return this;
  }

  has(key: string | Node, none: boolean = true): boolean { return this.value.methods.has(key) && (!none || !this.get(key).none)  }
  get(key: string | Node): Node { this.realize(); return this.value.methods.get(key)?.(Node.cast(key)) ?? new Node(null) }
  set(val: Node): Node { this.realize(); this.value = val.value; return this; }
  // *methods(): Generator<[string | Node, (key: Node) => Node]> { yield* this.value.methods.entries(); }

  *iter(): Generator<Node> {
    let next = this.get('next');
    while (next && !next.none) { yield next; next = next.get('next'); }
  }

  // get superposed(): Iterable { return new Iterable(this, '#') }
  // get components(): Iterable { return new Iterable(this, '##') }
  // get class_components(): Iterable { return new Iterable(this, '###') }

  static cast = (x: any): Node => {
    if (x instanceof Node) return x;
    return new Node(x)
  }
}

class Iterable {
  constructor(private owner: Node, private key: string) {}

  *[Symbol.iterator](): Generator<Node> { yield* this.owner.get(this.key).iter(); }
}

class Context extends Node {
  parent: Context | null;

  constructor(parent: Context | null = null) {
    super();
    this.parent = parent;
    this.value.methods.set('local', () => this);
  }

  get(key: string | Node): Node {
    if (this.has(key, false)) return super.get(key);
    if (this.parent) return this.parent.get(key);
    return new Node(null)
  }
}

namespace bootstrap {
  const BINDING = Symbol("*");

  interface Definition {
    pattern: (string | typeof BINDING)[];
    isComment: boolean;
  }

  /** Character-level scan. Seed knowledge: {/} balance + "comment" modifier. */
  export function defs(source: string): Definition[] {
    const defs: Definition[] = [];
    let i = 0;

    const at = (s: string) => source.startsWith(s, i);
    const skip = (n = 1) => { i += n; };
    const skipLine = () => { while (i < source.length && source[i] !== '\n') skip(); };

    while (i < source.length) {
      if (source[i] === '\n') { skip(); continue; }
      if (source[i] === ' ') { skipLine(); continue; }

      let isComment = false;
      if (at('comment ')) { isComment = true; skip(8); }

      let depth = 0, seenBlock = false, text = '';
      let pattern: (string | typeof BINDING)[] = [];
      const alts: (string | typeof BINDING)[][] = [];

      const flush = () => { if (text.trim()) pattern.push(text.trim()); text = ''; };

      while (i < source.length) {
        // inside block — only track nesting
        if (depth > 0) {
          if (at('}}') && depth === 1) { pattern.push(BINDING, '}'); depth = 0; skip(2); }
          else if (source[i] === '{') { depth++; skip(); }
          else if (source[i] === '}' && --depth === 0) { pattern.push(BINDING); skip(); }
          else skip();
          continue;
        }

        if (at('{{')) {
          flush(); pattern.push('{'); seenBlock = true; depth = 1; skip(2);
        } else if (source[i] === '{') {
          flush(); seenBlock = true; depth++; skip();
        } else if (at('=>')) {
          flush(); skip(2); skipLine(); break;
        } else if (source[i] === '|' && seenBlock) {
          flush(); alts.push(pattern); pattern = []; seenBlock = false; skip();
        } else if (source[i] === '\n') {
          if (!seenBlock) { skip(); break; }
          skip();
        } else {
          text += source[i]; skip();
        }
      }

      flush();
      if (seenBlock) alts.push(pattern);
      for (const p of alts) if (p.length) defs.push({ pattern: p, isComment });
    }

    return defs;
  }
}

class Reader {
  private i = 0;
  private forwards: Map<string, { node: Node; pos: number }> = new Map();
  private defNodes: Map<ReturnType<typeof bootstrap.defs>[number], Node> = new Map();
  file?: string;

  get forwardCount() { return this.forwards.size; }

  constructor(
    private source: string,
    private definitions: ReturnType<typeof bootstrap.defs>,
    private ctx: Context,
    private diagnostics: Diagnostics = new Diagnostics(),
  ) {
    // Each definition becomes a Node that can be lazily called
    for (const def of definitions) {
      this.defNodes.set(def, new Node(def));
    }
  }

  private at(s: string) { return this.source.startsWith(s, this.i); }
  private ch() { return this.source[this.i]; }
  private skip(n = 1) { this.i += n; }
  private done() { return this.i >= this.source.length; }

  /** Measure indent of current line (assumes i is at line start or after newline) */
  private indent(): number {
    let n = 0;
    while (!this.done() && this.ch() === ' ') { n++; this.skip(); }
    return n;
  }

  /**
   * Try matching any definition pattern at current position.
   * Returns Node if matched (string content), null if comment (skipped), undefined if no match.
   */
  private tryPattern(): Node | null | undefined {
    for (const def of this.definitions) {
      const first = def.pattern[0];
      if (typeof first !== 'string' || !this.at(first)) continue;
      const startPos = this.i;
      this.skip(first.length);

      // Collect content between first and last literal in pattern
      const last = def.pattern[def.pattern.length - 1];
      let content = '';
      if (typeof last === 'string' && last !== first) {
        // different closer (e.g. /* ... *\)
        while (!this.done() && !this.at(last)) { content += this.ch(); this.skip(); }
        if (!this.done()) this.skip(last.length);
      } else if (typeof last === 'string') {
        // same opener/closer (e.g. ` ... ` or " ... ")
        while (!this.done() && !this.at(last)) { content += this.ch(); this.skip(); }
        if (!this.done()) this.skip(last.length);
      } else {
        // no closer — read to end of line
        while (!this.done() && this.ch() !== '\n') { content += this.ch(); this.skip(); }
      }

      if (def.isComment) return null; // skipped

      if (!content && typeof last === 'string') {
        const loc = Diagnostics.locate(this.source, startPos);
        this.diagnostics.error('read', `Unterminated ${JSON.stringify(first)} pattern`, this.file, loc.line, loc.col);
        return new Node(null);
      }

      // Pattern match is a method call: apply(def, content)
      return this.apply(this.defNodes.get(def)!, new Node(content));
    }
    return undefined; // no match
  }

  /** Read a plain token (non-whitespace, non-special). */
  private readToken(): string {
    let text = '';
    while (!this.done() && this.ch() !== ' ' && this.ch() !== '\n') {
      // stop at any pattern trigger
      let hit = false;
      for (const def of this.definitions) {
        const first = def.pattern[0];
        if (typeof first === 'string' && this.at(first)) { hit = true; break; }
      }
      if (hit) break;
      text += this.ch(); this.skip();
    }
    return text;
  }

  /** Resolve a name in context, or forward-declare it. */
  private resolve(name: string): Node {
    const found = this.ctx.get(name);
    if (!found.none) return found;
    // forward declare — encoded keeps the name so apply() can use it
    if (!this.forwards.has(name)) {
      this.forwards.set(name, { node: new Node(name), pos: this.i - name.length });
    }
    return this.forwards.get(name)!.node;
  }

  /** Read and evaluate a single line. Returns the result Node. */
  private readLine(): Node {
    let result: Node | null = null;

    while (!this.done() && this.ch() !== '\n') {
      if (this.ch() === ' ') { this.skip(); continue; }

      // try any definition pattern (string, comment, structural)
      const matched = this.tryPattern();
      if (matched === null) continue;    // comment — skipped
      if (matched !== undefined) {        // string or structural match
        result = result ? this.apply(result, matched) : matched;
        continue;
      }

      // plain token
      const text = this.readToken();
      if (text) {
        const resolved = this.resolve(text);
        result = result ? this.apply(result, resolved) : resolved;
      }
    }

    return result ?? new Node(null);
  }

  /** Resolve a forward declaration if it exists. */
  private resolveForward(name: string, node: Node) {
    const fwd = this.forwards.get(name);
    if (fwd) { fwd.node.set(node); this.forwards.delete(name); }
  }

  /** Apply arg to target — juxtaposition (space-as-call). */
  private apply(target: Node, arg: Node): Node {
    const enc = target.value.encoded;

    // class(name) → create class, register name in context
    if (typeof enc === 'function' && enc.__external === 'class') {
      const name = arg.value.encoded;
      const classNode = new Node('class');
      if (typeof name === 'string') {
        this.ctx.value.methods.set(name, () => classNode);
        this.resolveForward(name, classNode);
      }
      return classNode;
    }

    // something(|) → return a partial waiting for alias name
    if (typeof arg.value.encoded === 'function' && arg.value.encoded.__external === '|') {
      const alias = new Node();
      alias.value.encoded = { __alias: target };
      return alias;
    }

    // alias(name) → register name as alias for the class
    if (typeof enc === 'object' && enc !== null && '__alias' in enc) {
      const classNode = enc.__alias as Node;
      const name = arg.value.encoded;
      if (typeof name === 'string') {
        this.ctx.value.methods.set(name, () => classNode);
        this.resolveForward(name, classNode);
      }
      return classNode;
    }

    // = assignment: target is lhs name node, arg is rhs
    if (typeof enc === 'function' && enc.__external === '=') {
      // = was applied as postfix to lhs, now gets rhs
      // handled elsewhere when we have lhs context
    }

    // Default: build call node
    const call = new Node();
    call.value.methods.set('target', () => target);
    call.value.methods.set('arg', () => arg);
    call.value.encoded = 'call';
    return call;
  }

  /** Read an indented block as a function body Node. */
  private readBlock(blockIndent: number): Node {
    const sourceStart = this.i;
    const readerCtx = this.ctx;

    // Collect lines at this indent or deeper
    const lines: string[] = [];
    while (!this.done()) {
      const pos = this.i;
      if (this.ch() === '\n') { this.skip(); continue; }

      const ind = this.indent();

      // comment — skip, indent-transparent
      if (this.tryPattern() === null) continue;

      if (ind < blockIndent && !this.done() && this.ch() !== '\n') {
        // dedented — put back and stop
        this.i = pos;
        break;
      }

      // consume the line
      const lineStart = this.i;
      while (!this.done() && this.ch() !== '\n') this.skip();
      lines.push(this.source.slice(lineStart, this.i));
    }

    const blockSource = lines.join('\n');
    const block = new Node((ctx: Context) => {
      const reader = new Reader(blockSource, this.definitions, ctx);
      return reader.read();
    });
    block.value.methods.set('source', () => new Node(blockSource));
    return block;
  }

  /** Main entry: read all lines, handle indentation nesting. */
  read(): Node {
    let lastResult: Node | null = null;
    let lastIndent = 0;

    const results: Node[] = [];

    while (!this.done()) {
      if (this.ch() === '\n') { this.skip(); continue; }

      const pos = this.i;
      const indent = this.indent();

      if (this.done() || this.ch() === '\n') continue;

      // comment line — skip (only peek, don't consume non-comments)
      const savedPos = this.i;
      const peek = this.tryPattern();
      if (peek === null) continue;       // comment — skipped
      if (peek !== undefined) this.i = savedPos; // matched non-comment — rewind

      // read the line
      const result = this.readLine();
      if (this.ch() === '\n') this.skip();

      // check if next line is indented (block)
      const nextPos = this.i;
      let nextIndent = 0;
      if (!this.done()) {
        // peek ahead for indent
        const peekPos = this.i;
        while (!this.done() && this.ch() === '\n') this.skip();
        if (!this.done()) {
          nextIndent = this.indent();
          this.i = peekPos; // restore
        }
      }

      // if next line is more indented, read block and pass to result
      if (nextIndent > indent) {
        // skip to block start
        while (!this.done() && this.ch() === '\n') this.skip();
        const block = this.readBlock(nextIndent);
        // apply block as argument to result
        const withBlock = this.apply(result, block);
        results.push(withBlock);
        lastResult = withBlock;
      } else {
        results.push(result);
        lastResult = result;
      }
    }

    // return last result (sequence semantics)
    return lastResult ?? new Node(null);
  }

  /** Report unresolved forward declarations as diagnostics. */
  verify() {
    for (const [name, { pos }] of this.forwards) {
      const loc = Diagnostics.locate(this.source, pos);
      this.diagnostics.error('resolve', `Unresolved identifier: ${name}`, this.file, loc.line, loc.col);
    }
  }
}

interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  phase: string;
  message: string;
  file?: string;
  line?: number;
  col?: number;
}

class Diagnostics {
  private items: Diagnostic[] = [];
  private keys = new Set<string>();

  report(diag: Diagnostic) {
    const key = `${diag.file ?? ''}:${diag.line ?? 0}:${diag.col ?? 0}|${diag.message}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.items.push(diag);
  }

  error(phase: string, message: string, file?: string, line?: number, col?: number) {
    this.report({ level: 'error', phase, message, file, line, col });
  }

  warning(phase: string, message: string, file?: string, line?: number, col?: number) {
    this.report({ level: 'warning', phase, message, file, line, col });
  }

  get errors() { return this.items.filter(d => d.level === 'error'); }
  get warnings() { return this.items.filter(d => d.level === 'warning'); }
  get hasErrors() { return this.items.some(d => d.level === 'error'); }
  get count() { return this.items.length; }

  /** Locate a position in source for error context */
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
      if (d.file) console.error(`  \x1b[90m${d.file}:${d.line ?? 0}:${d.col ?? 0}\x1b[0m`);
      console.error(`    ${lbl}\x1b[90m[${d.phase}]\x1b[0m: ${d.message}`);
    }
    const parts: string[] = [];
    if (errs.length) parts.push(`\x1b[1;31m${errs.length} error${errs.length > 1 ? 's' : ''}\x1b[0m`);
    if (warns.length) parts.push(`\x1b[1;33m${warns.length} warning${warns.length > 1 ? 's' : ''}\x1b[0m`);
    console.error(`\n  ${parts.join(', ')}`);
  }
}

namespace Ether {
  export type PartialArgs = { [key: string]: string[] };

  const readFile = (p: string) => fs.readFileSync(p, 'utf-8');

  function step(name: string, diag: Diagnostics, fn: () => void) {
    const start = performance.now();
    try {
      fn();
      console.error(`  [${name}] ${(performance.now() - start).toFixed(1)}ms`);
    } catch (e: any) {
      console.error(`  [${name}] FAILED`);
      diag.error(name, e.stack ?? e);
    }
  }

  function discover(rayDir: string) {
    const nodeRayPath = path.join(rayDir, 'Node.ray');
    if (!fs.existsSync(nodeRayPath)) throw new Error(`Missing ${nodeRayPath}`);
    const source = readFile(nodeRayPath);
    const definitions = bootstrap.defs(source);
    console.error(` ${definitions.length} definitions from ${nodeRayPath}`);
    return { definitions, source, path: nodeRayPath };
  }

  function loadDir(rayDir: string, definitions: ReturnType<typeof bootstrap.defs>, ctx: Context, diag: Diagnostics, exclude?: Set<string>) {
    const entries = fs.readdirSync(rayDir, { withFileTypes: true });
    const files = entries.filter((e: any) => e.name.endsWith('.ray')).map((e: any) => path.join(rayDir, e.name)).filter(f => !exclude?.has(f));
    console.error(` ${files.length} .ray files in ${rayDir}`);
    const results: { file: string; result: Node; forwards: number }[] = [];
    for (const file of files) {
      const reader = new Reader(readFile(file), definitions, ctx, diag);
      reader.file = file;
      const result = reader.read();
      reader.verify();
      results.push({ file, result, forwards: reader.forwardCount });
    }
    return results;
  }

  function loadFile(filePath: string, definitions: ReturnType<typeof bootstrap.defs>, ctx: Context, diag: Diagnostics) {
    const reader = new Reader(readFile(filePath), definitions, ctx, diag);
    reader.file = filePath;
    const result = reader.read();
    reader.verify();
    return { result, forwards: reader.forwardCount };
  }

  function init(location: string, verbose: boolean, diag: Diagnostics) {
    const stat = fs.statSync(location);
    const isDir = stat.isDirectory();
    if (!isDir && !stat.isFile()) throw new Error(`"${location}": not a file or directory`);

    const rayDir = isDir
      ? path.join(location, '.ray')
      : path.join(path.dirname(path.dirname(location)), '.ray');

    let discovered!: ReturnType<typeof discover>;
    const ctx = new Context();

    // Seed externals
    const external = (name: string) => {
      const fn = Object.assign(() => new Node(null), { __external: name });
      const node = new Node(fn);
      ctx.value.methods.set(name, () => node);
      return node;
    };
    external('class');
    external('|');

    step('discover', diag, () => { discovered = discover(rayDir); });

    // Pass 1: load Node.ray to find class * | Node
    step('Node.ray', diag, () => {
      const reader = new Reader(discovered.source, discovered.definitions, ctx, diag);
      reader.file = discovered.path;
      const result = reader.read();
      reader.verify();
      if (verbose) console.error(` Node.ray: ${describe(result)} (${reader.forwardCount} forwards)`);
    });

    // Pass 2: load remaining .ray files (skip top-level Node.ray, subdirs may have their own)
    step('load .ray', diag, () => {
      for (const r of loadDir(rayDir, discovered.definitions, ctx, diag, new Set([discovered.path]))) {
        if (verbose) console.error(`      ${path.basename(r.file)}: ${describe(r.result)} (${r.forwards} forwards)`);
      }
    });

    if (diag.hasErrors) return { definitions: discovered.definitions, ctx, ok: false as const };

    const extra = isDir
      ? (fs.existsSync(path.join(location, 'Ether.ray')) ? path.join(location, 'Ether.ray') : null)
      : location;

    if (extra) {
      step(`load ${path.basename(extra)}`, diag, () => {
        const { result, forwards } = loadFile(extra, discovered.definitions, ctx, diag);
        if (verbose) console.error(`      ${describe(result)} (${forwards} forwards)`);
      });
    }

    return { definitions: discovered.definitions, ctx, ok: !diag.hasErrors as true };
  }

  export function run(defaultPath: string, args: PartialArgs = {}) {
    if ((args['@'] ?? []).length === 0) args['@'] = [defaultPath];
    const location = path.resolve(args['@'][0]);
    delete args['@'];
    const evalExprs = args['eval'] ?? []; delete args['eval'];
    const verbose = !args['quiet']; delete args['quiet'];

    const diag = new Diagnostics();
    console.error('v0.3 bootstrap:');
    const { definitions, ctx, ok } = init(location, verbose, diag);

    if (verbose) {
      printMethods(ctx, 'context');
    }

    if (ok) {
      for (const expr of evalExprs) {
        step(`eval '${expr}'`, diag, () => {
          const reader = new Reader(expr, definitions, ctx, diag);
          reader.file = '<eval>';
          console.log(describe(reader.read()));
        });
      }
    }

    diag.print('v0.3');
    if (diag.hasErrors) process.exitCode = 1;

    if (ok && args['repl']) {
      delete args['repl'];
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const prompt = () => {
          rl.question('ray> ', (line: string) => {
            if (!line || line === 'exit' || line === 'quit') { rl.close(); return; }
            const replDiag = new Diagnostics();
            const reader = new Reader(line.trim(), definitions, ctx, replDiag);
            reader.file = '<repl>';
            console.log(describe(reader.read()));
            if (replDiag.hasErrors) replDiag.print();
            prompt();
          });
        };
        prompt();
      });
    }
  }
}

/** Print all methods defined on a Node */
function printMethods(node: Node, label: string, indent = 2) {
  const prefix = ' '.repeat(indent);
  const methods = node.value.methods;
  if (methods.size === 0) {
    console.error(`${prefix}\x1b[90m${label}: (empty)\x1b[0m`);
    return;
  }
  console.error(`${prefix}\x1b[90m${label}: (${methods.size} keys)\x1b[0m`);
  for (const [key, fn] of methods) {
    const keyStr = typeof key === 'string' ? key : (key instanceof Node ? describe(key) : String(key));
    const val = fn(Node.cast(key));
    console.error(`${prefix}  ${keyStr} = ${describe(val)}`);
  }
}

/** Describe a Node for debugging */
function describe(node: Node, depth = 0): string {
  if (depth > 3) return '...';
  const enc = node.value.encoded;
  if (enc === null || enc === undefined) return 'none';
  if (enc === UNKNOWN) return '?';
  if (enc === 'call') {
    const t = describe(node.get('target'), depth + 1);
    const a = describe(node.get('arg'), depth + 1);
    return `(${t} ${a})`;
  }
  if (typeof enc === 'function') return '<fn>';
  if (typeof enc === 'object' && enc !== null && 'pattern' in enc) {
    const pat = enc.pattern.map((e: any) => typeof e === 'symbol' ? '*' : JSON.stringify(e)).join(',');
    return `def[${pat}]`;
  }
  if (typeof enc === 'string') return JSON.stringify(enc);
  return String(enc);
}

export { Node, Context, bootstrap, Reader, Diagnostics, Ether, describe };
