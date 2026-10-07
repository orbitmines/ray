// The language, as the seed reads it (src/seed/seed.ts): `@ether/ray/.reader.ray` (the reader, in Ray) and the language it hands
// over to (`.entrypoint.ray`), then the core library (`@ether/ray/*.ray`) as one project, then files each in a scope of their own
// inside the library's. What the CLI, the language server and its highlighting need: a file's diagnostics, what it wrote, and how
// it is painted. (The implementation before the seed is `language_old.ts`, kept for reference.)
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Seed, Node, Code, type Rule, type Span, type Step, type Text, type Observer } from './seed/seed.ts';

export const NAME = 'Ether' as const;
export const ALIASES = ['ray', 'orbitmines'] as const;
export const version: [major: number, releaseDate: string, index: number] = [0, '2027-01-01', 4];

export class Version {
  static readonly letter = 'E';
  static MONTH_LETTERS = 'ABCDEFGHIJKL';
  constructor(public readonly major: number, public readonly year: number, public readonly yearsSinceRelease: number, public readonly month: number, public readonly index: number) {}
  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }
  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }
  static create(major: number, releaseDate: string, index: number): Version {
    const release = new Date(releaseDate), now = new Date();
    const months = Math.max(0, (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(major, Math.max(now.getFullYear(), release.getFullYear()), Math.floor(months / 12), months % 12 + 1, index);
  }
  static get current(): Version { return Version.create(version[0], version[1], version[2]); }
}

// ---------------------------------------------------------------- where the language is
export const READER = '.reader.ray', ENTRYPOINT = '.entrypoint.ray';
// The core library (`@ether/ray`): RAY_LIBRARY, else beside this file in the repository (src/ or dist/), in the published package
// (`<package>/@ether/ray`) or in the editor extension's server (`server/@ether/ray`).
export function library_dir(given?: string): string {
  const candidates = [given, process.env.RAY_LIBRARY, path.resolve(import.meta.dirname, '../../ray'), path.resolve(import.meta.dirname, '../@ether/ray'), path.resolve(import.meta.dirname, '@ether/ray')];
  for (const dir of candidates) if (dir !== undefined && fs.existsSync(path.join(dir, READER))) return path.resolve(dir);
  throw new Error(`no language found: none of ${candidates.filter(Boolean).join(', ')} has a ${READER}`);
}

// The order the core library's files are read in (as src/seed/lib.mts reads them): a file after those defining what it uses, then
// the one with the most syntax, then by name. A host's choice, not the reader's.
export function reading_order(files: { path: string; text: string }[]): string[] {
  const defines = (text: string) => new Set([...text.matchAll(/^([A-Za-z_][\w-]*)(?:\s*<[^>\n]*>)?\s*(?:\^[\w.]+\s*)?:=/gm)].map(m => m[1]));
  const syntax = (text: string) => text.split('\n').filter(line => /^[^A-Za-z\s/].*=>|^[A-Za-z_]+ \{[a-z]/.test(line)).length;
  const info = files.map(f => ({ path: f.path, defines: defines(f.text), uses: new Set(f.text.match(/[A-Za-z_][\w]*/g) ?? []), syntax: syntax(f.text) }));
  const needs = new Map(info.map(f => [f.path, new Set(info.filter(g => g !== f && [...g.defines].some(name => f.uses.has(name) && !f.defines.has(name))).map(g => g.path))]));
  const order: string[] = [], left = new Set(info.map(f => f.path));
  while (left.size > 0) {
    const waiting = (p: string) => [...needs.get(p)!].filter(q => left.has(q)).length;
    const next = [...left].map(p => info.find(f => f.path === p)!).sort((a, b) => waiting(a.path) - waiting(b.path) || b.syntax - a.syntax || (a.path < b.path ? -1 : 1))[0];
    order.push(next.path); left.delete(next.path);
  }
  return order;
}

// ---------------------------------------------------------------- painting: what reading did, shown
// A span painted with a style (`begin`/`end` inclusive, as src/lsp/semantics.ts takes them).
export type Paint = { begin: number; end: number; style: string };
export type Said = { message: string; begin: number; end: number };

// The highlighting is the rules' own (R5.2): a rule's literals are painted with the mark written after its head (`… ^keyword`), the
// mark itself too; a capture holding a mark after its name (`{literal property ^property}`) paints what it captured with it; a
// capture's name in a head is a parameter; what a capture holds is painted by what reads it; a name read is a parameter (code a
// rule was given), a function (a rule) or a variable. Which character marks a style is not assumed: it is the first character of
// the first head the reader in Ray read a mark off (what is written after the pieces it read).
type Info = { style?: string; caps: Map<string, string>; mark?: string };
export class Painter implements Observer {
  sigil?: string;
  rules = new WeakMap<Rule, Info>();
  // what a declaration's mark marked (`name ^style := value`): values, and names where they are held
  marked = new WeakMap<object, string>();
  marked_names = new WeakMap<Node, Map<string, string>>();
  // the places of names an application with a mark is about to declare, with the mark's style
  marking = new WeakMap<Text, Map<number, string>>();
  // a method's parameters written in a head (`name (a, b: T)`), per text: read without running when the text is painted
  parameters = new Map<Text, Code[]>();
  // (while parameters are read: a name that names nothing there is a parameter)
  naming_parameters = false;
  paints = new Map<Text, Map<string, Paint & { weak: boolean }>>();
  defined_in = new Map<Text, Rule[]>();
  // the texts painted (what the host read: not the texts the seed makes of literals and names)
  texts = new Set<Text>();
  // where heads are written, per text
  heads = new Map<Text, [number, number][]>();
  seen = new WeakMap<Text, Map<number, Set<Rule>>>();
  // the styles the marks name
  styles = new Set<string>();
  constructor(public seed: Seed) {}

  // (a name's kind, `weak`, gives way to a mark painted on the same span)
  paint(text: Text, b: number, e: number, style: string, weak = false) {
    if (!this.texts.has(text)) return;
    const s = text.s;
    while (b < e && /\s/.test(s[b])) b++;
    while (e > b && /\s/.test(s[e - 1])) e--;
    if (e <= b) return;
    let m = this.paints.get(text); if (m === undefined) this.paints.set(text, m = new Map());
    const k = `${b}:${e}`, had = m.get(k);
    if (had === undefined || (had.weak && !weak)) m.set(k, { begin: b, end: e - 1, style, weak });
  }
  painted(text: Text): Paint[] { return [...this.paints.get(text)?.values() ?? []].map(({ begin, end, style }) => ({ begin, end, style })); }
  forget(text: Text) { this.paints.delete(text); this.defined_in.delete(text); this.heads.delete(text); this.texts.delete(text); this.parameters.delete(text); }

  // A rule defined: its capture names are parameters, its literals and its mark take its style.
  defined(rule: Rule, pieces?: { text: Text; b: number; e: number; cap: boolean; typed: boolean; parameters?: Code }[]) {
    const h = rule.head, text = h.text, s = text.s;
    let list = this.defined_in.get(text); if (list === undefined) this.defined_in.set(text, list = []);
    list.push(rule);
    let heads = this.heads.get(text); if (heads === undefined) this.heads.set(text, heads = []);
    heads.push([h.b, h.e]);
    const info: Info = { caps: new Map() };
    this.rules.set(rule, info);
    const open = this.seed.learned?.open, close = this.seed.learned?.close;
    if (pieces === undefined) {
      // (a rule the seed read the head of: its captures, found in order)
      let at = h.b;
      for (const p of rule.pieces) {
        if (!('cap' in p) || open === undefined) continue;
        const i = s.indexOf(open + p.cap, at);
        if (i < 0 || i >= h.e) break;
        this.paint(text, i + open.length, i + open.length + p.cap.length, 'parameter', true);
        at = i + open.length + p.cap.length;
      }
      return;
    }
    const inside = pieces.filter(p => p.text === text && p.b >= h.b && p.e <= h.e);
    // (parameters written after the head, `name (a, b) =>`, are a piece read from elsewhere: then the mark is the last word)
    const parameters = inside.length !== pieces.length;
    // (a capture ends with its brackets, after its name)
    const shut_of = (p: { e: number }) => { const i = close === undefined ? -1 : s.indexOf(close, p.e); return i < 0 || i >= h.e ? undefined : i; };
    const last = inside.reduce((m, p) => Math.max(m, p.cap ? (shut_of(p) ?? p.e - 1) + 1 : p.e), h.b);
    const rest = s.slice(last, h.e), words = rest.trim().split(/\s+/).filter(w => w.length > 0);
    const mark = parameters ? (words.length > 1 ? words[words.length - 1] : undefined) : (words.length === 1 ? words[0] : undefined);
    const style_of = (word: string | undefined) => word !== undefined && word.length > 1 && /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(word.slice(1)) && !/[\p{L}\p{N}_]/u.test(word[0]) ? word.slice(1) : undefined;
    if (mark !== undefined && style_of(mark) !== undefined) {
      if (this.sigil === undefined && !parameters) this.sigil = mark[0];
      if (mark[0] === this.sigil) {
        info.style = style_of(mark);
        this.styles.add(info.style!);
        const at = s.lastIndexOf(mark, h.e);
        if (at >= last) this.paint(text, at, at + mark.length, info.style!);
      }
    }
    for (const p of pieces) if (p.parameters !== undefined && p.parameters.text === text) {
      let list = this.parameters.get(text); if (list === undefined) this.parameters.set(text, list = []);
      list.push(p.parameters);
    }
    inside.forEach((p, i) => {
      // a capture right after a literal that ends with the mark's character holds a mark (`name ^{literal style} := value`)
      const before = inside[i - 1];
      if (p.cap && before !== undefined && !before.cap && this.sigil !== undefined && s.slice(before.b, before.e).trimEnd().endsWith(this.sigil) && s.slice(before.b, before.e).trimEnd().length === before.e - before.b) info.mark = s.slice(p.b, p.e);
    });
    for (const p of inside) {
      if (!p.cap) { if (info.style) this.paint(text, p.b, p.e, info.style); continue; }
      this.paint(text, p.b, p.e, 'parameter', true);
      // what follows a capture's name in its brackets: a mark, unless it is a type
      const shut = shut_of(p);
      if (p.typed || this.sigil === undefined || shut === undefined) continue;
      const after = s.slice(p.e, shut).trim().split(/\s+/), word = after[after.length - 1];
      const style = word[0] === this.sigil ? style_of(word) : undefined;
      if (style === undefined) continue;
      info.caps.set(s.slice(p.b, p.e), style);
      this.styles.add(style);
      const at = s.lastIndexOf(word, shut);
      if (at >= p.e) this.paint(text, at, at + word.length, style);
    }
  }

  planned(steps: Step[], frame: Node) {
    for (const st of steps) {
      if (st.kind === 'apply') this.read(st.rule, st.caps, frame, st.at, st.given);
      else if (st.kind === 'name') this.name(st.at.text, st.at.b, st.at.e, frame);
    }
  }
  applied(rule: Rule, caps: [string, Span][], frame: Node, given: [string, unknown][]) {
    // a rule with a mark among its captures: the names it declares take the mark's style (see `declared`)
    const mark = this.rules.get(rule)?.mark, held = mark === undefined ? undefined : caps.find(([n]) => n === mark)?.[1];
    if (held !== undefined) {
      const style = held.text.s.slice(held.b, held.e).trim();
      if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(style)) {
        this.styles.add(style);
        let m = this.marking.get(held.text); if (m === undefined) this.marking.set(held.text, m = new Map());
        for (const [n, sp] of caps) if (n !== mark && sp.text === held.text) m.set(sp.b * 4194304 + sp.e, style);
        // (the mark in its own style, with the character that marks it)
        let b = held.b; while (b > 0 && /\s/.test(held.text.s[b - 1])) b--;
        this.paint(held.text, held.text.s[b - 1] === this.sigil ? b - 1 : held.b, held.e, style);
      }
    }
    this.read(rule, caps, frame, undefined, given);
  }
  // A word read where `frame` reads it: what it names (a parameter, while a method's parameters are read, when it names nothing).
  name(text: Text, b: number, e: number, frame: Node) {
    const word = text.s.slice(b, e).trim();
    if (word.length === 0 || /\s/.test(word)) return;
    const kind = this.kind(frame, word);
    if (kind !== undefined) this.paint(text, b, e, kind.style, kind.weak);
    else if (this.naming_parameters) this.paint(text, b, e, 'parameter', true);
  }
  // A name declared: a parameter when it is written in a head (bound by what runs a method), else a variable.
  declared(name: Code) {
    if (!this.texts.has(name.text) || name.e <= name.b) return;
    let seen = this.seen.get(name.text); if (seen === undefined) this.seen.set(name.text, seen = new Map());
    const k = -(name.b * 4194304 + name.e) - 1;
    if (seen.has(k)) return;
    seen.set(k, new Set());
    if (/\s/.test(name.s.trim())) return;
    const key = name.s.trim(), mark = this.marking.get(name.text)?.get(name.b * 4194304 + name.e);
    const head = this.heads.get(name.text)?.some(([b, e]) => name.b >= b && name.e <= e);
    // (a name declared where a head is written: a method's parameter, bound in the frame its body is first read in)
    const style = mark ?? (head ? 'parameter' : undefined);
    if (style !== undefined) {
      let m = this.marked_names.get(name.frame); if (m === undefined) this.marked_names.set(name.frame, m = new Map());
      m.set(key, style);
      const v = name.frame.members.get(key);
      if (mark !== undefined && typeof v === 'object' && v !== null && !this.marked.has(v)) this.marked.set(v, mark);
    }
    this.paint(name.text, name.b, name.e, style ?? 'variable', mark === undefined);
  }

  // A rule that read a statement (from `at`, when known): its captures, then its literals found again between them.
  read(rule: Rule, caps: [string, Span][], frame: Node, at?: Span, given?: [string, unknown][]) {
    const first = at ?? caps.find(([, sp]) => sp.e > sp.b)?.[1], text = first?.text;
    if (text === undefined || !this.texts.has(text)) return;
    // (once per rule and place: a body run again reads the same)
    let seen = this.seen.get(text); if (seen === undefined) this.seen.set(text, seen = new Map());
    const k = first!.b * 4194304 + first!.e;
    let rules = seen.get(k); if (rules === undefined) seen.set(k, rules = new Set());
    if (rules.has(rule)) return;
    rules.add(rule);
    const s = text.s, info = this.rules.get(rule), spans = new Map(caps);
    for (const [name, sp] of caps) {
      if (sp.text !== text || sp.e <= sp.b) continue;
      const style = info?.caps.get(name);
      if (style) { this.paint(text, sp.b, sp.e, style); continue; }
      if ((sp as { raw?: boolean }).raw) continue;
      this.name(text, sp.b, sp.e, frame);
    }
    const style = info?.style;
    if (style === undefined) return;
    let cursor: number | undefined = at?.b;
    rule.pieces.forEach((p, i) => {
      if ('cap' in p) { const sp = spans.get(p.cap); cursor = sp && sp.text === text ? sp.e : undefined; return; }
      const lit = p.lit.trim();
      if (lit.length === 0) return;
      let from: number | undefined = cursor;
      if (from !== undefined) { while (from < s.length && /\s/.test(s[from])) from++; if (!s.startsWith(lit, from)) from = undefined; }
      if (from === undefined) {
        const next = rule.pieces[i + 1], sp = next !== undefined && 'cap' in next ? spans.get(next.cap) : undefined;
        if (sp && sp.text === text) { let e = sp.b; while (e > 0 && /\s/.test(s[e - 1])) e--; if (s.slice(e - lit.length, e) === lit) from = e - lit.length; }
      }
      if (from === undefined) { cursor = undefined; return; }
      this.paint(text, from, from + lit.length, style);
      cursor = from + lit.length;
    });
    // A method of a value with no word of its own before what it captures (`if := class { { }{condition} {{yes}} ^class => … }`)
    // is named by that value where it is applied: the word before its first capture, when it names the value the rule was
    // written in, takes the rule's style.
    if (given === undefined || !given.some(([, v]) => v === rule.head.frame)) return;
    const k0 = rule.pieces.findIndex(p => 'cap' in p);
    if (k0 < 0 || rule.pieces.slice(0, k0).some(p => 'lit' in p && p.lit.trim().length > 0)) return;
    const sp = spans.get((rule.pieces[k0] as { cap: string }).cap);
    if (sp === undefined || sp.text !== text) return;
    let e = sp.b; while (e > 0 && /\s/.test(s[e - 1])) e--;
    let b = e; while (b > 0 && !/\s/.test(s[b - 1])) b--;
    if (b < e && this.named(frame, s.slice(b, e)) !== undefined && this.value(frame, s.slice(b, e)) === rule.head.frame) this.paint(text, b, e, style);
  }
  value(frame: Node, word: string): unknown { for (let n: Node | undefined = frame; n; n = n.parent) if (n.members.has(word)) return n.members.get(word); return undefined; }

  // What a name read in a frame is: code a rule was given (a parameter), a rule (a function), or any other value (a variable).
  // A name a declaration with a mark declared is painted with that mark (`weak` false: over what reads it).
  kind(frame: Node, word: string): { style: string; weak: boolean } | undefined {
    for (let n: Node | undefined = frame; n; n = n.parent) if (n.members.has(word)) {
      const v = n.members.get(word), mark = this.marked_names.get(n)?.get(word) ?? (typeof v === 'object' && v !== null ? this.marked.get(v) : undefined);
      if (mark !== undefined) return { style: mark, weak: mark === 'parameter' };
      return { style: v instanceof Code ? 'parameter' : v instanceof Node && v.members.has('rule') ? 'function' : 'variable', weak: true };
    }
    return undefined;
  }
  named(frame: Node, word: string): string | undefined { return this.kind(frame, word)?.style; }

  // Bodies written in a text that were never run, read into their statements (never run) so they are painted too: the rules defined
  // there, and what their statements capture, read in the frame they were written in.
  dry(text: Text) {
    const seen = new Set<string>();
    const body = (code: Code, depth: number) => {
      const k = `${code.b}:${code.e}`;
      if (seen.has(k)) return; seen.add(k);
      let steps: Step[];
      try { steps = this.seed.steps_of(code); } catch { return; }
      if (depth >= 6) return;
      for (const st of steps) if (st.kind === 'apply') for (const [, sp] of st.caps) {
        if (sp.text !== text || sp.e <= sp.b || (sp as { raw?: boolean }).raw) continue;
        // (a name is what it names; anything else is read: by its type's rules when it has a type that reads, else where it was)
        const written = text.s.slice(sp.b, sp.e).trim();
        if (!/\s/.test(written) && this.named(code.frame, written) !== undefined) continue;
        const t = (sp as { type?: Node }).type, reads = t instanceof Node && (t.rules.length > 0 || t.members.get('rules') !== undefined);
        body(new Code(sp.text, sp.b, sp.e, reads ? t : code.frame, code.planner), depth + 1);
      }
    };
    // a method's parameters: read with the language's rules, never run; what they name that names nothing is a parameter
    this.naming_parameters = true;
    try { for (const code of this.parameters.get(text) ?? []) body(code, 0); } finally { this.naming_parameters = false; }
    for (const rule of this.defined_in.get(text) ?? []) {
      const written = this.seed.rule_nodes.get(rule)?.members.get('written');
      const code = written instanceof Node && written.members.get('code') instanceof Code ? written.members.get('code') as Code : rule.body;
      if (code.text === text && code.e > code.b) body(code, 0);
    }
  }
}

// ---------------------------------------------------------------- the host: the seed, the library, files
export class Ray {
  seed = new Seed();
  painter?: Painter;
  // the library's scope: a file is read in one of its own inside it
  scope!: Node;
  // the texts the language and the library were read from, by file
  texts = new Map<string, Text>();
  // what `io` wrote, since it was last taken
  written: string[] = [];
  timings: [string, number][] = [];
  library: string;

  // `given`: texts to read in place of the files on disk (a document being edited)
  constructor(options: { library?: string; given?: Map<string, string>; paint?: boolean } = {}) {
    this.library = library_dir(options.library);
    this.given = options.given ?? new Map();
    if (options.paint) this.seed.observer = this.painter = new Painter(this.seed);
    this.seed.output = line => { this.written.push(line); };
  }
  given: Map<string, string>;

  text(file: string): Text {
    const t = { name: file, s: this.given.get(file) ?? fs.readFileSync(file, 'utf8') };
    this.texts.set(file, t);
    this.painter?.texts.add(t);
    return t;
  }
  // A failure reading a text (an error the reader did not say where it was): said at its start.
  failed(text: Text, e: unknown) {
    const x = e as { message?: string; ray?: string[] };
    this.seed.say(`Failed: ${x?.message ?? String(e)}${x?.ray?.length ? ' (in ' + x.ray[0] + ')' : ''}`, { text, b: 0, e: Math.min(text.s.length, text.s.indexOf('\n') < 0 ? text.s.length : text.s.indexOf('\n')) });
  }

  // The reader, then the language it hands over to (beside it).
  boot(): this {
    const t0 = performance.now();
    const reader = this.text(path.join(this.library, READER));
    try { this.seed.boot(reader); } catch (e) { this.failed(reader, e); }
    const entry = path.join(this.library, ENTRYPOINT);
    if (fs.existsSync(entry) || this.given.has(entry)) { const t = this.text(entry); try { this.seed.entry(t); } catch (e) { this.failed(t, e); } }
    this.timings.push(['boot', performance.now() - t0]);
    return this;
  }
  // The core library (`@ether/ray/*.ray`, not the dotted ones) as one project, then its statements that left something said read
  // again now that all of it is (P8.8).
  read_library(settle = true): this {
    const names = fs.readdirSync(this.library).filter(f => f.endsWith('.ray') && !f.startsWith('.'));
    const files = names.map(n => ({ path: n, text: this.given.get(path.join(this.library, n)) ?? fs.readFileSync(path.join(this.library, n), 'utf8') }));
    this.scope = new Node(this.seed.global);
    for (const name of reading_order(files)) {
      const t0 = performance.now(), t = this.text(path.join(this.library, name));
      try { this.seed.read(t, 0, this.scope); } catch (e) { this.failed(t, e); }
      this.timings.push([name, performance.now() - t0]);
    }
    if (settle) { const t0 = performance.now(); try { this.seed.settle(); } catch { /* what a statement read again raised stays said where it was */ } this.timings.push(['settle', performance.now() - t0]); }
    this.scope ??= new Node(this.seed.global);
    return this;
  }
  // Whether a file is one the language or the core library was read from (a text in place of it means reading them again).
  core(file: string): boolean { const f = path.resolve(file); return this.texts.has(f) && path.dirname(f) === this.library; }

  // ------------------------------------------------ projects (P8.8), as a run lays them out: the core (above), then the projects a
  // file's project declares in its `.project.ray` (`@ether/<path>` a project of Ether, `@<name>` a language project at
  // `@ether/$/<name>`), each after those it declares, then the file's own project (not the other files of a project of tests: each
  // test is a program of its own), then the file. A project is read once, when a file first needs it, in a scope inside the
  // projects read before it: what they define, it sees.
  get ether(): string { return path.dirname(this.library); }
  get repository(): string { return path.dirname(this.ether); }
  projects = new Set<string>();
  // the innermost scope of the projects read so far (the library's, before any is)
  private chain?: Node;
  dependency_dir(line: string): string | undefined {
    const m = line.trim().match(/^@(\S+)/);
    if (m === null || m[1].includes('://')) return undefined;
    const name = m[1], candidates = name.includes('/') ? [path.join(this.repository, '@' + name)] : [path.join(this.ether, '$', name), path.join(this.repository, '@' + name)];
    return candidates.find(dir => fs.existsSync(path.join(dir, '.project.ray')));
  }
  declared(dir: string): string[] {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, '.project.ray'), 'utf8'); } catch { return []; }
    return text.split('\n').filter(line => line.trim().startsWith('@')).map(line => this.dependency_dir(line)).filter((d): d is string => d !== undefined);
  }
  // The project a file is in: the nearest directory above it with a `.project.ray` (none outside the repository).
  project_of(file: string): string | undefined {
    for (let dir = path.dirname(path.resolve(file)); dir.startsWith(this.repository + path.sep); dir = path.dirname(dir))
      if (fs.existsSync(path.join(dir, '.project.ray'))) return dir;
    return undefined;
  }
  // A project's files in reading order: its `.ray` files, and those of directories under it that are no project of their own.
  project_files(dir: string): string[] {
    const out: string[] = [], top_only = dir === this.ether;
    const walk = (at: string) => {
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        const full = path.join(at, entry.name);
        if (entry.isDirectory()) { if (!top_only && !entry.name.startsWith('.') && entry.name !== 'node_modules' && !fs.existsSync(path.join(full, '.project.ray'))) walk(full); continue; }
        if (entry.name.endsWith('.ray') && !entry.name.startsWith('.') && !entry.name.startsWith('entrypoint.')) out.push(full);
      }
    };
    walk(dir);
    return reading_order(out.map(f => ({ path: f, text: this.given.get(f) ?? fs.readFileSync(f, 'utf8') })));
  }
  // A project read (after what it declares), unless it was: its files in one scope, then its statements that left something said
  // read again.
  project(dir: string, seen = new Set<string>()) {
    if (this.projects.has(dir) || seen.has(dir) || dir === this.library) return;
    seen.add(dir);
    for (const dep of this.declared(dir)) this.project(dep, seen);
    this.projects.add(dir);
    const t0 = performance.now();
    this.chain = this.group(this.project_files(dir));
    this.timings.push([path.relative(this.repository, dir), performance.now() - t0]);
  }
  // Files read in one scope inside the projects read so far, then their statements that left something said read again.
  group(files: string[]): Node {
    const scope = new Node(this.chain ?? this.scope), waiting = this.seed.pending.length;
    for (const file of files) {
      const t = this.text(file);
      try { this.seed.read(t, 0, scope); } catch (e) { this.failed(t, e); }
    }
    const before = this.seed.pending.slice(0, waiting);
    this.seed.pending = this.seed.pending.slice(waiting);
    try { this.seed.settle(); } catch { /* said where it was */ }
    this.seed.pending = before.concat(this.seed.pending);
    return scope;
  }
  // The scope a file is read in, with what is read before it: the projects its project declares, then the other files of its
  // project (once per file: the scope is kept for its next text), unless it is a project of tests.
  private own = new Map<string, Node>();
  prepare(file: string): Node {
    file = path.resolve(file);
    const project = this.project_of(file);
    if (project === undefined || project === this.library) return this.chain ?? this.scope;
    for (const dep of this.declared(project)) this.project(dep);
    if (path.relative(this.ether, project).split(path.sep).includes('tests')) return this.chain ?? this.scope;
    const k = `${project}\0${file}`;
    let scope = this.own.get(k);
    if (scope === undefined) {
      const t0 = performance.now();
      this.own.set(k, scope = this.group(this.project_files(project).filter(f => f !== file)));
      this.timings.push([path.relative(this.repository, project) + ' (without ' + path.basename(file) + ')', performance.now() - t0]);
    }
    return scope;
  }

  // A file read in a scope of its own inside the library's: what it said, what it wrote, how it is painted. Its text is forgotten
  // after (`keep`: kept, until `forget`).
  //
  // Reading a file changes more than its own scope (`Device &+= { … }` adds to a class of a project read before it): what it
  // changed is taken back after (unless it is kept), so the next text of the same document is read where the first was, and
  // the next document is not read where an earlier one left something.
  file(file: string, s: string, keep = false, scope: Node = this.chain ?? this.scope ?? this.seed.global): { text: Text; diagnostics: Said[]; written: string[]; paints: Paint[] } {
    const text: Text = { name: path.resolve(file), s };
    this.painter?.texts.add(text);
    this.written = [];
    // (what was said about the file as a project read it is said again about this text: the seed says a thing once per place)
    for (const k of [...this.seed.said]) if (k.startsWith(text.name + '\0')) this.seed.said.delete(k);
    const members = new Map<Node, Map<string, [boolean, unknown]>>(), parents = new Map<Node, Node | undefined>(), said = this.seed.diagnostics.length;
    if (!keep) this.seed.journal = {
      member(node, key) { let m = members.get(node); if (m === undefined) members.set(node, m = new Map()); if (!m.has(key)) m.set(key, [node.members.has(key), node.members.get(key)]); },
      parent(node) { if (!parents.has(node)) parents.set(node, node.parent); },
    };
    let diagnostics: Said[], written: string[], paints: Paint[];
    try {
      try { this.seed.read(text, 0, new Node(scope)); } catch (e) { this.failed(text, e); }
      diagnostics = this.said(text); written = this.written;
      this.written = [];
      if (this.painter) {
        const before = this.seed.diagnostics.length;
        this.painter.dry(text);
        this.seed.diagnostics.length = before;
      }
      paints = this.painter?.painted(text) ?? [];
    } finally {
      this.seed.journal = undefined;
      if (!keep) {
        for (const [node, m] of members) { for (const [key, [had, value]] of m) { if (had) node.members.set(key, value); else node.members.delete(key); } node.version++; }
        for (const [node, parent] of parents) { node.parent = parent; node.version++; }
        this.seed.version++;
        // (and what it said elsewhere: a statement of the library it ran that failed)
        const elsewhere = this.seed.diagnostics.slice(said).filter(d => d.at.text !== text);
        if (elsewhere.length > 0) { const gone = new Set(elsewhere); this.seed.diagnostics = this.seed.diagnostics.filter(d => !gone.has(d)); for (const d of elsewhere) this.seed.said.delete(`${d.at.text.name}\0${d.at.b}\0${d.at.e}\0${d.message}`); }
        this.forget(text);
      }
    }
    return { text, diagnostics: diagnostics!, written: written!, paints: paints! };
  }
  forget(text: Text) { this.seed.forget(text); this.painter?.forget(text); }
  said(text: Text): Said[] { return this.seed.diagnostics.filter(d => d.at.text === text).map(d => ({ message: d.message, begin: d.at.b, end: d.at.e })); }
  // A file the language or the library was read from: what was said about it, how it is painted (its bodies never run painted dry).
  of(file: string): { text: Text; diagnostics: Said[]; paints: Paint[] } | undefined {
    const text = this.texts.get(path.resolve(file));
    if (text === undefined) return undefined;
    if (this.painter && !this.dried.has(text)) {
      this.dried.add(text);
      const before = this.seed.diagnostics.length;
      this.painter.dry(text);
      this.seed.diagnostics.length = before;
    }
    return { text, diagnostics: this.said(text), paints: this.painter?.painted(text) ?? [] };
  }
  private dried = new Set<Text>();
}

// ---------------------------------------------------------------- run in a thread with a deep stack
// The seed recurses deeply (`node --stack-size=20000` with an unlimited `ulimit -s` for its probes): what reads runs in a worker
// whose stack is large enough, whatever the process was started with.
function thread(data: object): Worker {
  const flags = process.execArgv.filter(flag => !flag.startsWith('--stack-size'));
  // (run from TypeScript: node's own compiles it, a loader's does not reach a worker)
  if (import.meta.url.endsWith('.ts')) flags.push('--experimental-transform-types', '--disable-warning=ExperimentalWarning');
  // (what the reader writes on its own goes to stderr: stdout may be the language server's)
  const w = new Worker(new URL(import.meta.url), { workerData: { ray: data }, execArgv: flags, resourceLimits: { stackSizeMb: Number(process.env.RAY_STACK ?? 20),maxOldGenerationSizeMb: Number(process.env.RAY_HEAP ?? 8000) }, stdout: true });
  w.stdout.pipe(process.stderr);
  return w;
}

// What a worker does: `run` reads files and says what they wrote and said; `lsp` reads documents as they change.
async function worker(task: { kind: 'run'; files: string[]; library?: string; verbose?: boolean } | { kind: 'lsp'; library?: string }) {
  const port = parentPort!;
  if (task.kind === 'run') {
    const ray = new Ray({ library: task.library }).boot().read_library();
    const out = (line: string) => port.postMessage({ out: line }), err = (line: string) => port.postMessage({ err: line });
    const line_of = (s: string, i: number) => s.slice(0, i).split('\n').length;
    const timed = () => { for (const [name, ms] of ray.timings.splice(0)) err(`${name.padEnd(16)} ${String(Math.round(ms)).padStart(7)} ms`); };
    if (task.verbose) { timed(); err(`${ray.seed.diagnostics.length} diagnostics in the library`); }
    let failed = false;
    for (const file of task.files) {
      // (a file of the language or the core library: as it was read there)
      const known = ray.core(file) ? ray.of(file) : undefined, scope = known ? undefined : ray.prepare(file);
      if (task.verbose) timed();
      const read = known ? { text: known.text, diagnostics: known.diagnostics, written: [] as string[] } : ray.file(file, fs.readFileSync(file, 'utf8'), false, scope);
      for (const line of read.written) out(line);
      for (const d of read.diagnostics) err(`${path.relative(process.cwd(), file)}:${line_of(read.text.s, d.begin)}: ${d.message}`);
      if (read.diagnostics.length > 0) failed = true;
    }
    port.postMessage({ exit: failed ? 1 : 0 });
    return;
  }
  // The language server's reader: the library once, then each open document's latest text in a scope of its own. A document that
  // is a file of the language or the library is read as part of it: the whole read again with its text in place of the file's.
  const docs = new Map<string, { file: string; text: string; version: number }>();
  const dirty = new Set<string>();
  let ray: Ray | undefined, scheduled: ReturnType<typeof setTimeout> | undefined;
  const given = () => {
    const out = new Map<string, string>();
    for (const doc of docs.values()) if (ray?.core(doc.file) || path.dirname(path.resolve(doc.file)) === library_dir(task.library)) {
      let disk: string | undefined; try { disk = fs.readFileSync(doc.file, 'utf8'); } catch { disk = undefined; }
      if (disk !== doc.text) out.set(path.resolve(doc.file), doc.text);
    }
    return out;
  };
  const same = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  const work = () => {
    scheduled = undefined;
    const wanted = given();
    if (ray === undefined || !same(wanted, ray.given)) {
      const t0 = performance.now();
      ray = new Ray({ library: task.library, given: wanted, paint: true }).boot().read_library();
      port.postMessage({ styles: [...ray.painter!.styles] });
      port.postMessage({ log: `read the language and its library in ${Math.round(performance.now() - t0)} ms (${ray.seed.diagnostics.length} diagnostics)` });
      for (const uri of docs.keys()) dirty.add(uri);
    }
    for (const uri of [...dirty]) {
      dirty.delete(uri);
      const doc = docs.get(uri);
      if (doc === undefined) continue;
      const t0 = performance.now();
      // (a file of a project read before is as it was read there, unless it was changed since)
      let read: { text: Text; diagnostics: Said[]; paints: Paint[] } | undefined;
      const known = ray.core(doc.file) ? ray.of(doc.file) : undefined;
      if (known !== undefined) read = known;
      else {
        let scope: Node | undefined;
        try { scope = ray.prepare(doc.file); } catch (e) { port.postMessage({ log: `reading the projects before ${doc.file} failed: ${(e as Error).stack ?? e}` }); }
        read = ray.file(doc.file, doc.text, false, scope);
      }
      port.postMessage({ checked: { uri, version: doc.version, text: read.text.s, paints: read.paints, diagnostics: read.diagnostics } });
      port.postMessage({ log: `read ${path.basename(doc.file)} v${doc.version} in ${Math.round(performance.now() - t0)} ms: ${read.diagnostics.length} diagnostics, ${read.paints.length} paints` });
    }
  };
  port.on('message', (m: { open?: { uri: string; file: string; text: string; version: number }; close?: string }) => {
    if (m.open) { docs.set(m.open.uri, { file: m.open.file, text: m.open.text, version: m.open.version }); dirty.add(m.open.uri); }
    if (m.close) docs.delete(m.close);
    if (scheduled === undefined) scheduled = setTimeout(work, Number(process.env.RAY_LSP_DELAY ?? 150));
  });
  scheduled = setTimeout(work, 0);
}

// ---------------------------------------------------------------- the language server
// The legend: the LSP's standard token types, and the styles the library's marks name that it lacks.
// The legend: the LSP's standard token types, then the styles the language's marks name that it lacks (known once the language is
// read: the server answers `initialize` then).
export const TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];

// Serve the language server over stdio (or the streams given): diagnostics, semantic tokens and the theme channel (`ether/theme`),
// from what the seed read.
export async function lsp(options: { library?: string; io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } } = {}): Promise<void> {
  // (CommonJS modules: imported from a bundle, their exports are its `default`)
  const commonjs = <T>(m: T): T => ((m as { default?: T }).default ?? m);
  const [{ createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind }, { TextDocument }, { encode, runs, position_of, MODIFIERS }] = await Promise.all([
    import('vscode-languageserver/node.js').then(commonjs), import('vscode-languageserver-textdocument').then(commonjs), import('./lsp/semantics.ts'),
  ]);
  // (over stdio unless streams are given: `--lsp` is not one of the flags the library looks for)
  const io = options.io ?? { input: process.stdin, output: process.stdout };
  const connection = createConnection(ProposedFeatures.all, io.input, io.output);
  const documents = new TextDocuments(TextDocument);
  const reader = thread({ kind: 'lsp', library: options.library });
  reader.unref();
  const file_of = (uri: string): string => { try { return fileURLToPath(uri); } catch { return uri; } };
  const checked = new Map<string, { version: number; text: string; paints: Paint[] }>();
  const painted = (paints: Paint[]) => paints as unknown as Parameters<typeof encode>[1];
  const payload = (uris: string[]) => ({
    styles: {},
    documents: uris.flatMap(uri => { const c = checked.get(uri); return c ? [{ uri, version: c.version, ranges: runs(c.text, painted(c.paints)) }] : []; }),
  });

  const legend = [...TOKEN_TYPES];
  let styled: () => void = () => {}, answered = false;
  const read = new Promise<void>(resolve => { styled = resolve; setTimeout(resolve, Number(process.env.RAY_LSP_WAIT ?? 60000)); });
  reader.on('message', (m: { checked?: { uri: string; version: number; text: string; paints: Paint[]; diagnostics: Said[] }; log?: string; styles?: string[] }) => {
    // (the legend is the client's once it was answered: a style named later is not sent as a token)
    if (m.styles !== undefined) { if (!answered) for (const style of m.styles) { const type = style.split('.')[0]; if (!legend.includes(type)) legend.push(type); } styled(); return; }
    if (m.log !== undefined) { if (process.env.RAY_LSP_LOG) connection.console.log(m.log); return; }
    const c = m.checked;
    if (c === undefined) return;
    const doc = documents.get(c.uri);
    if (doc !== undefined && doc.version > c.version) return;
    checked.set(c.uri, { version: c.version, text: c.text, paints: c.paints });
    connection.sendDiagnostics({ uri: c.uri, version: c.version, diagnostics: c.diagnostics.map(d => ({ severity: 1 as const, range: { start: position_of(c.text, d.begin), end: position_of(c.text, Math.max(d.end, d.begin + 1)) }, message: d.message, source: 'ray' })) });
    connection.languages.semanticTokens.refresh();
    connection.sendNotification('ether/theme', payload([c.uri]));
  });
  reader.on('error', e => connection.console.error(`the reader stopped: ${(e as Error).stack ?? e}`));

  const open = (uri: string, text: string, version: number) => reader.postMessage({ open: { uri, file: file_of(uri), text, version } });
  connection.onInitialize(async () => (await read, answered = true, {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: { tokenTypes: legend, tokenModifiers: MODIFIERS }, full: true, range: true },
    },
    serverInfo: { name: 'ray-language-server', version: Version.current.toString() },
  }));
  // (the paints of the text last read: a newer text is painted with them until it is read)
  const tokens = (uri: string, range?: [number, number]) => {
    const c = checked.get(uri);
    return { data: c ? encode(documents.get(uri)?.getText() ?? c.text, painted(c.paints), legend, range) : [] };
  };
  connection.languages.semanticTokens.on(params => tokens(params.textDocument.uri));
  connection.languages.semanticTokens.onRange(params => {
    const doc = documents.get(params.textDocument.uri);
    if (doc === undefined) return tokens(params.textDocument.uri);
    return tokens(params.textDocument.uri, [doc.offsetAt(params.range.start), doc.offsetAt(params.range.end)]);
  });
  connection.onRequest('ether/theme', (params: { uris?: string[] }) => payload(params?.uris ?? []));
  connection.onRequest('ether/initialFiles', (): null => null);
  documents.onDidOpen(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidChangeContent(e => open(e.document.uri, e.document.getText(), e.document.version));
  documents.onDidClose(e => { reader.postMessage({ close: e.document.uri }); checked.delete(e.document.uri); });
  documents.listen(connection);
  connection.listen();
}

// ---------------------------------------------------------------- the command line
const OPTIONS: Record<string, { alias?: string; value?: string; description: string }> = {
  help: { alias: 'h', description: 'Print this help and exit.' },
  version: { description: 'Print the version number.' },
  lsp: { value: '[language]', description: 'Serve the language server (LSP) over stdio; with the directory of the language to read (`@ether/ray`).' },
  verbose: { alias: 'v', description: 'Say how long reading the language and its library took, and how much it said.' },
};
export function help(): string {
  const rows = Object.entries(OPTIONS).map(([name, o]) => [`  ${o.alias ? `-${o.alias}, ` : '    '}--${name}${o.value ? ' ' + o.value : ''}`, o.description]);
  const width = Math.max(...rows.map(([flags]) => flags.length));
  return [`${NAME} ${Version.current}`, `Usage: ray [options] [files...]`, 'Reads each file in a scope of its own, after the language (@ether/ray) and its core library.', 'Options:', ...rows.map(([flags, d]) => `${flags.padEnd(width)}  ${d}`)].join('\n');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = new Set<string>(), files: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else if (a.startsWith('-') && a.length > 1) for (const c of a.slice(1)) flags.add(Object.entries(OPTIONS).find(([, o]) => o.alias === c)?.[0] ?? c);
    else files.push(a);
  }
  if (flags.has('version')) { console.log(Version.current.toString()); return; }
  if (flags.has('help')) { console.log(help()); return; }
  if (flags.has('lsp')) {
    // (a language directory given: read that language, e.g. `@ether/ray` of the workspace)
    const given = files[0] !== undefined && fs.existsSync(path.join(files[0], READER)) ? path.resolve(files[0]) : undefined;
    await lsp({ library: given });
    return;
  }
  if (files.length === 0) { console.log(help()); return; }
  const w = thread({ kind: 'run', files: files.map(f => path.resolve(f)), verbose: flags.has('verbose') });
  process.exitCode = await new Promise<number>(resolve => {
    w.on('message', (m: { out?: string; err?: string; exit?: number }) => {
      if (m.out !== undefined) process.stdout.write(m.out + '\n');
      if (m.err !== undefined) process.stderr.write(m.err + '\n');
      if (m.exit !== undefined) { resolve(m.exit); void w.terminate(); }
    });
    w.on('error', e => { process.stderr.write(`${(e as Error).stack ?? e}\n`); resolve(1); });
  });
}

if (!isMainThread && workerData?.ray) void worker(workerData.ray);
else if (isMainThread && process.argv[1] !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) void main();
