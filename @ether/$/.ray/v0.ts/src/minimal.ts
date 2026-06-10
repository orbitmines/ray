// The whole engine in one file — the substrate for a rewrite.
// Run: npx tsx src/minimal.ts   (from anywhere inside the repo)
//
// The architecture, complete:
//
//   1. Nodes. One class, plain fields. A node is simultaneously a span of
//      source, an object with methods (`Key = string | Node` — pattern nodes
//      are method keys, which is how grammar is type-bound), and possibly a
//      role: forward (unresolved name), slot (assignable location), bound
//      (method picked off a receiver).
//
//   2. Scanning. Nothing about concrete syntax is hardcoded — no knowledge
//      that backticks quote or brackets nest. Scanning for a terminator skips
//      spans by recursively matching whatever anchored rules are active at a
//      position (`Scan.claim`); quoting and balanced nesting emerge from the
//      rules in Node.ray (`` `{string: String}` ``, `({expr})`, ...). A
//      `String`-typed capture scans raw — the capture's type decides what
//      grammar is valid inside it. Whitespace/indentation and the
//      `{pattern} => body` shape are the only primitives.
//
//   3. Interpretation. Per statement: try rules (best match: longest, then
//      anchored, then nearest in the type chain), else known tokens, else a
//      forward. Rule bodies evaluate with captures bound in a scope node;
//      externals bottom out in TS. Recursion is cut by cycle detection
//      (same rule at same position; a body already being evaluated), never
//      unrolled.
//
//   4. The fixpoint. Files parse; rule definitions found inside regions other
//      rules consume (comments, strings) are recorded as suppressed; a rule
//      exists iff some definition survives. That's circular, so analysis
//      iterates (Jacobi — simultaneous updates, so mutual suppression
//      oscillates instead of settling on parse order); non-convergence IS the
//      "rules circularly prevent each other from existing" error. Disabled
//      rules still match as error recovery (consume, no effect) so one
//      grammar error doesn't cascade into unresolved-token noise.
//
//   5. The bootstrap. Pass 1 over Node.ray, with a single seeded rule for the
//      `{pattern} => body` shape scoped to that file alone. Node.ray must
//      re-declare the shape in-language (`external {(String.Word | ...`) for
//      every other file; the seed retires with it.

import * as fs from "node:fs";
import * as path from "node:path";
// Diagnostics are collected and rendered by the existing display layer — the
// engine below stays self-contained; display is presentation, not
// architecture. (minimal.ts has deliberately diverged from src/ray.ts since
// the byte-identical phase: errors that used to be positionless now carry
// their call sites, and the empty-declaration quirk is gone.)
import { Diagnostics } from "./diagnostics.ts";
import { Text } from "./source.ts";
// A published package carries its .ray files in this manifest (filled in at
// pack time, empty in a checkout) so directories can be enumerated without
// relying on the file system layout of an install.
import { manifest } from "./bundled.ts";

// ───────────────────────────── sources ─────────────────────────────
// Locations are repo-relative (`@ether/$/.ray/...`). They resolve against the
// current checkout when one encloses the working directory (the `@ether/$/.ray`
// marker), else against the installed package — so the same loads work in
// development and from the published tarball.

interface Source { path?: string; text: string }

const EXTENSION = '.ray';

const root = (() => {
  // a checkout: walk up from the working directory to the marker
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, '@ether/$/.ray')) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  if (fs.existsSync(path.join(dir, '@ether/$/.ray'))) return dir;
  // the installed package: its tarball ships @ether/$/.ray next to src/
  const pkg = path.resolve(import.meta.dirname, '..');
  if (fs.existsSync(path.join(pkg, '@ether/$/.ray'))) return pkg;
  // development fallback: src lives at <repo>/@ether/$/.ray/v0.ts/src
  return path.resolve(import.meta.dirname, '../../../../..');
})();

export function load_file(location: string): Source {
  const at = path.join(root, location);
  return { path: at, text: fs.readFileSync(at, 'utf-8') };
}

export function load_directory(location: string, options: { recursively?: boolean; excluded?: string } = {}): Source[] {
  // packaged: enumerate the manifest instead of the file system
  if (manifest.length) {
    const prefix = location.replace(/\/$/, '') + '/';
    return manifest
      .filter(entry => entry !== options.excluded)
      .filter(entry => entry.startsWith(prefix))
      .filter(entry => options.recursively || !entry.slice(prefix.length).includes('/'))
      .filter(entry => entry.endsWith(EXTENSION))
      .map(load_file);
  }
  const sources: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const entry_path = `${dir}/${entry.name}`;
      if (entry_path === options.excluded) continue;
      if (entry.isDirectory()) {
        // IDE integrations and versioned implementations (v0.ts) live under
        // the language definition but aren't part of it
        if (entry.name === 'ide' || (entry.name.startsWith('v') && entry.name.includes('.'))) continue;
        if (options.recursively) walk(entry_path);
      }
      else if (entry.name.endsWith(EXTENSION)) sources.push(load_file(entry_path));
    }
  };
  walk(location.replace(/\/$/, ''));
  return sources;
}

// A project is a directory parsed in full, or an entry file parsed after the
// rest of its directory.
export function load_project(location: string): Source[] {
  if (manifest.length) {
    if (!manifest.includes(location)) return load_directory(location, { recursively: true });
    const dir = location.slice(0, location.lastIndexOf('/'));
    return [...load_directory(dir, { recursively: true, excluded: location }), load_file(location)];
  }
  const stat = fs.statSync(path.join(root, location));
  if (stat.isDirectory()) return load_directory(location, { recursively: true });
  const dir = location.slice(0, location.lastIndexOf('/'));
  return [...load_directory(dir, { recursively: true, excluded: location }), load_file(location)];
}

// ───────────────────────────── nodes ─────────────────────────────

type Key = string | Node;

// One method invocation, named. `args` is the evaluated argument — or an
// empty span at the call site when there is none. `at` is where the call
// happened, for diagnostics.
interface Call {
  self: Node;
  method: Node;
  args: Node;
  at: Node;
}
type Method = (call: Call) => Node | undefined;

// What a node currently *stands for*, beyond its span. The interpreter core
// only ever creates forwards (an unresolved word) and reports the unconsumed
// ones — what assignment, indexing or calling DO with a role is decided by the
// externals (`=`, `[{property}]`, `({args})`), the runtime ends of rules the
// language itself declares.
type Role =
  | { kind: 'forward'; name: string; on: Node }   // an unresolved name, and where it would be defined
  | { kind: 'slot'; on: Node; key: Key }          // an assignable location
  | { kind: 'bound'; self: Node; method: Node };  // a method picked off a receiver

class Node {
  methods?: Map<Key, Node>;
  rules?: Rule[];
  fn?: Method;
  flags?: Set<string>;
  src?: Source;
  begin = 0;
  end = 0; // exclusive
  role?: Role;
  consumed = false;
  constructor(public sup?: Node) {}
  get text(): string { return this.src ? this.src.text.slice(this.begin, this.end) : ''; }
  get empty(): boolean { return this.end <= this.begin; }
  set(key: Key, value: Node): void { (this.methods ??= new Map()).set(key, value); }
  get(key: Key): Node | undefined { return this.methods?.get(key); }
  flag(name: string): this { (this.flags ??= new Set()).add(name); return this; }
  has_flag(name: string): boolean { return !!this.flags?.has(name); }
}

function span(src: Source, begin: number, end: number, sup?: Node): Node {
  const node = new Node(sup);
  node.src = src;
  node.begin = begin;
  node.end = Math.max(begin, end);
  return node;
}

// ─────────────────────────── diagnostics ───────────────────────────

// Adapt a span Node into the Text.Node positions the display layer reads
// (line/col, colored selections, per-file grouping, cascade dedup).
const tsources = new WeakMap<Source, Text.Source>();
function tsource(src: Source): Text.Source {
  let t = tsources.get(src);
  if (!t) tsources.set(src, t = new Text.Source(src.text, src.path));
  return t;
}
function position(at?: Node): Text.Node | undefined {
  if (!at?.src) return undefined;
  const n = new Text.Node();
  n.source = tsource(at.src);
  n.cursor = at.begin;
  if (at.end > at.begin) n.selection = [at.begin, at.end - 1];
  return n;
}

interface Issue { phase: string; message: string; at?: Node }

class Log {
  diagnostics = new Diagnostics();
  error(phase: string, message: string, at?: Node): void {
    this.diagnostics.report({ level: 'error', phase, message, node: position(at) });
  }
  info(phase: string, message: string, at?: Node): void {
    this.diagnostics.report({ level: 'info', phase, message, node: position(at) });
  }
  print(): void {
    if (this.diagnostics.hasErrors) process.exitCode = 1;
    this.diagnostics.print();
  }
}

// ─────────────────────────── patterns ───────────────────────────
// A grammar rule's pattern is literals interleaved with captures, written as
// `{...}` groups in the source. A capture's KIND is its extent — how far it
// consumes — decided here, once, so the matcher is a plain switch. Its NAME is
// its meaning: when a rule fires, `expr`/`args` captures are evaluated
// eagerly, `block` stays a lazy program (abstractly evaluated where captured),
// and `comment`/`string`/String-typed content is shadow-scanned for
// suppressed rule definitions.
//
//   {`if `}        literal      the quoted text itself (quoting isn't built
//                               in — a quote-like rule covers the content,
//                               see Scan.literal_of)
//   {x}{`)`}       until        anything up to the following literal piece
//   {comment: String}  text     raw to end of line; `String` means nothing
//                               nests inside (with a following literal it's
//                               an `until` that scans raw)
//   {block}        block        rest of the line plus deeper-indented lines
//   {expr} {args}  expression   rest of the expression — open groups continue
//                               it across lines (so do unnamed captures)
//   {name}         word         a single word

type Piece = { kind: 'literal'; text: string } | Capture;

interface Capture {
  kind: 'until' | 'text' | 'block' | 'expression' | 'word';
  name?: string;
  type?: string;
  content: string;  // the raw `{...}` content, for unnamed/complex captures
  raw: boolean;     // String-typed: scan as plain text, nothing nests inside
}

function is_literal(piece: Piece): piece is { kind: 'literal'; text: string } { return piece.kind === 'literal'; }

// What the scanners need from the active grammar at the position being read.
// A Scan is DIRECTED: it reads `sign === 1` left-to-right or `sign === -1`
// right-to-left, and every scanner below is written once against it. A
// position handed to a scanner is a HEAD — the next unread position in
// reading order; spans always come back in source order.
interface Scan {
  text: string;
  sign: 1 | -1;
  // The far edge (inclusive, in reading order) of the span the active grammar
  // claims at the head `j` — a string, a balanced group, ... — or -1. This
  // recursion is what replaces hardcoded syntax knowledge.
  claim: (j: number) => number;
  // The literal text of a `{...}` group whose content is itself a quoted
  // literal under the active grammar (e.g. {`//`} via the string rule).
  literal_of: (begin: number, end: number) => string | undefined;
  // Near characters of the active rules in reading order (first characters
  // when reading right, last when reading left) — runs of other characters
  // can be skipped in bulk, nothing starts there.
  anchors: Set<string>;
  // Indentation of the line the current expression started on (blocks extend
  // over deeper-indented lines).
  indent?: number;
  // Whether this position starts a statement — the rule-definition shape only
  // applies there.
  start?: boolean;
}

function parse_pattern(text: string, begin: number, end: number, scan: Scan): Piece[] | null {
  const pieces: Piece[] = [];
  let literal_start = begin;
  let i = begin;
  const flush_literal = (upto: number): void => {
    if (upto > literal_start) pieces.push({ kind: 'literal', text: text.slice(literal_start, upto) });
  };
  while (i < end) {
    if (text[i] !== '{') { i++; continue; }
    const close = group_end(scan, i);
    if (close === -1) return null;
    flush_literal(i);
    const content = text.slice(i + 1, close - 1);
    const quoted = scan.literal_of(i + 1, close - 1);
    if (quoted !== undefined) pieces.push({ kind: 'literal', text: quoted });
    else {
      const named = content.match(/^([A-Za-z_][\w.-]*)\s*(?::\s*([\s\S]+))?$/);
      // kind is provisional here; decided below once the following piece is known
      pieces.push({ kind: 'word', name: named?.[1], type: named?.[2], content, raw: false });
    }
    i = close;
    literal_start = i;
  }
  flush_literal(i);
  if (!pieces.length) return null;

  // Decide each capture's kind from its name/type and what follows it.
  for (let p = 0; p < pieces.length; p++) {
    const piece = pieces[p];
    if (is_literal(piece)) continue;
    piece.raw = (piece.type ?? '').startsWith('String');
    const next = pieces[p + 1];
    if (next && is_literal(next)) piece.kind = 'until';
    else if (piece.name === 'block') piece.kind = 'block';
    else if (piece.raw) piece.kind = 'text';
    else if (piece.name === 'expr' || piece.name === 'args' || piece.name === undefined) piece.kind = 'expression';
    else piece.kind = 'word';
  }
  return pieces;
}

// ─────────────────────────── scanning ───────────────────────────
// Integers over the raw text; nodes only at boundaries. Each scanner is
// written ONCE and runs in both directions, driven by the Scan's sign:
// positions in and out are heads (next unread, in reading order), `+ sign`
// steps ahead, and "the near end of a literal" is its first character
// reading right, its last reading left.

function line_end(text: string, i: number): number {
  const nl = text.indexOf('\n', i);
  return nl === -1 ? text.length : nl;
}

function line_begin(text: string, i: number): number {
  return text.lastIndexOf('\n', i - 1) + 1;
}

function indent_at(text: string, i: number): number {
  const line = text.lastIndexOf('\n', i - 1) + 1;
  let n = 0;
  while (text[line + n] === ' ') n++;
  return n;
}

// The character of `lit` a directed reader meets first.
function near(sign: 1 | -1, lit: string): string {
  return sign === 1 ? lit[0] : lit[lit.length - 1];
}

// Does `lit` (written in source order) sit at the head `j` — its near end on
// the head, the rest extending away in reading order?
function lit_at(scan: Scan, j: number, lit: string): boolean {
  if (scan.text[j] !== near(scan.sign, lit)) return false;
  if (lit.length === 1) return true;
  const begin = scan.sign === 1 ? j : j - lit.length + 1;
  return begin >= 0 && scan.text.startsWith(lit, begin);
}

// Head of the next occurrence of `lit` in reading order (-1 when absent).
// Searching on behalf of a capture spans lines, and a String-typed capture
// searches the plain text (nothing nests inside it); the bare search (used
// while parsing `{...}` pattern groups) stays on its line, with grammar
// claims hiding quoted delimiters and nested groups.
function scan_to(scan: Scan, from: number, lit: string, capture?: Capture): number {
  const { text, sign } = scan;
  const multiline = capture !== undefined;
  if (capture?.raw) {
    const k = sign === 1 ? text.indexOf(lit, from) : text.lastIndexOf(lit, from - lit.length + 1);
    if (k === -1) return -1;
    const head = sign === 1 ? k : k + lit.length - 1;
    if (!multiline) {
      const nl = sign === 1 ? text.indexOf('\n', from) : text.lastIndexOf('\n', from);
      if (nl !== -1 && (head - nl) * sign > 0) return -1;
    }
    return head;
  }
  const c0 = near(scan.sign, lit);
  let j = from;
  while (j >= 0 && j < text.length) {
    const c = text[j];
    if (c === c0 && lit_at(scan, j, lit)) return j;
    if (c === '\n' && !multiline) return -1;
    if (scan.anchors.has(c)) {
      const far = scan.claim(j);
      if (far !== -1) { j = far + sign; continue; }
    }
    j += sign;
    while (j >= 0 && j < text.length && text[j] !== c0 && text[j] !== '\n' && !scan.anchors.has(text[j])) j += sign;
  }
  return -1;
}

// End of a `{...}` group starting at j — quoted/nested braces are hidden by
// grammar claims, not by counting. (Pattern syntax reads left-to-right.)
function group_end(scan: Scan, j: number): number {
  const k = scan_to(scan, j + 1, '}');
  return k === -1 ? -1 : k + 1;
}

// Lines indented deeper than `indent`, starting at a '\n'. Blanks are
// tentative — committed only when a deeper line follows, so a block never
// trails into the gap before the next statement. (Blocks hang off the line
// below — indentation only means anything read left-to-right.)
function indented_end(text: string, at: number, indent: number): number {
  let end = at, j = at;
  while (j < text.length && text[j] === '\n') {
    let k = j + 1, spaces = 0;
    while (text[k] === ' ') { k++; spaces++; }
    if (k >= text.length) break;
    if (text[k] === '\n') { j = k; continue; }
    if (spaces <= indent) break;
    end = line_end(text, k);
    j = end;
  }
  return end;
}

// Exit head past the rest of the expression: to the line's edge, except where
// a grammar claim spans further (an open group continues the expression).
function expression_edge(scan: Scan, from: number): number {
  const { text, sign } = scan;
  let j = from;
  while (j >= 0 && j < text.length) {
    const c = text[j];
    if (c === '\n') break;
    if (scan.anchors.has(c)) {
      const far = scan.claim(j);
      if (far !== -1) { j = far + sign; continue; }
    }
    j += sign;
    while (j >= 0 && j < text.length && text[j] !== '\n' && !scan.anchors.has(text[j])) j += sign;
  }
  return j;
}

// Exit head past the word at the head `from` — a word ends at whitespace or
// wherever the grammar starts meaning something else.
function word_edge(scan: Scan, from: number): number {
  const { text, sign } = scan;
  let j = from;
  while (j >= 0 && j < text.length) {
    const c = text[j];
    if (c === ' ' || c === '\n') break;
    if (scan.anchors.has(c) && scan.claim(j) !== -1) break;
    j += sign;
  }
  return j;
}


// ─────────────────────────── matching ───────────────────────────

// A match's span and captures, in source order regardless of the direction
// it was matched in.
interface Matched { begin: number; end: number; captures: { piece: Capture; begin: number; end: number }[] }

// A successful match, with named access to its captures as span Nodes.
class Match {
  constructor(public raw: Matched, private src: Source, private sup?: Node) {}
  get end(): number { return this.raw.end; }
  capture(name: string): Node | undefined {
    const c = this.raw.captures.find(c => c.piece.name === name);
    return c && span(this.src, c.begin, c.end, this.sup);
  }
}

// Match a rule's pieces from the head `at` in the scan's direction. The
// pattern is written in source order; read the other way the pieces apply
// last-to-first, leaning on `at` as the span's final character.
function match_rule(rule: Rule, scan: Scan, at: number): Matched | null {
  const { text, sign } = scan;
  const pieces = rule.pieces;
  let i = at;
  const captures: Matched['captures'] = [];
  for (let p = 0; p < pieces.length; p++) {
    const idx = sign === 1 ? p : pieces.length - 1 - p;
    const piece = pieces[idx];
    if (is_literal(piece)) {
      if (!lit_at(scan, i, piece.text)) return null;
      i += piece.text.length * sign;
      continue;
    }
    const entry = i;
    switch (piece.kind) {
      case 'until': {
        // up to the bounding literal piece — the pattern neighbor on the
        // reading side ('until' is only assigned when one follows in source
        // order, so reading the other way it may be missing: no match)
        const bound = pieces[idx + sign];
        if (!bound || !is_literal(bound)) return null;
        const k = scan_to(scan, i, bound.text, piece);
        if (k === -1) return null;
        i = k;
        break;
      }
      case 'block':
        // a block hangs off the line below — it cannot lean backward
        if (sign === -1) return null;
        i = indented_end(text, line_end(text, i), scan.indent ?? indent_at(text, at));
        break;
      case 'text':
        i = sign === 1 ? line_end(text, i) : line_begin(text, i + 1) - 1;
        break;
      case 'expression':
        i = expression_edge(scan, i);
        break;
      case 'word':
        i = word_edge(scan, i);
        if (i === entry) return null;
        break;
    }
    captures.push(sign === 1 ? { piece, begin: entry, end: i } : { piece, begin: i + 1, end: entry + 1 });
  }
  if (i === at) return null;
  return sign === 1 ? { begin: at, end: i, captures } : { begin: i + 1, end: at + 1, captures };
}

interface Recognized { pattern_begin: number; pattern_end: number; pieces: Piece[]; body_begin: number; body_end: number; end: number }

// The `{pattern} => body` shape: at least one `{...}` group before a top-level
// `=>` on the same line; body is rest-of-line (grammar claims may extend it
// across lines) or, when empty, the deeper-indented block.
function recognize(text: string, at: number, scan: Scan): Recognized | null {
  let saw_group = false, j = at;
  for (;;) {
    const c = text[j];
    if (c === undefined || c === '\n') return null;
    if (c === '{') {
      const close = group_end(scan, j);
      if (close === -1) return null;
      saw_group = true;
      j = close;
      continue;
    }
    if (c === '=' && text[j + 1] === '>') break;
    j++;
  }
  if (!saw_group) return null;
  let pattern_end = j;
  while (pattern_end > at && text[pattern_end - 1] === ' ') pattern_end--;
  if (pattern_end === at) return null;
  const pieces = parse_pattern(text, at, pattern_end, scan);
  if (!pieces) return null;
  let b = j + 2;
  while (text[b] === ' ') b++;
  const body_end = (b >= text.length || text[b] === '\n')
    ? indented_end(text, b, indent_at(text, at))
    : expression_edge(scan, b);
  return { pattern_begin: at, pattern_end, pieces, body_begin: b, body_end, end: Math.max(j + 2, body_end) };
}

// ───────────────────────────── rules ─────────────────────────────

// A rule the runtime implements in TS. Inert until a .ray file activates it
// with `external <pattern>` — the pattern text is the contract.
interface External {
  name: string;
  match?: (rule: Rule, scan: Scan, at: number) => Matched | null;
  fire: (firing: Firing) => Node | undefined;
}

// Everything a firing rule implementation gets to see.
interface Firing {
  rule: Rule;
  match: Match;
  at: Node;          // the consumed span
  receiver?: Node;
  ip: Interpreter;
}

// One definition site of a rule. Per pass it is either seen 'live' (parsed as
// an actual definition), seen inside a region some rule consumed (that Rule
// suppresses it), or not seen at all.
interface Definition { at: Node; seen?: 'live' | Rule }

class Rule {
  definitions: Definition[] = [];
  body?: Node;
  external?: External;
  // The file this rule is visible to; undefined = everywhere (the language).
  file?: string;
  // Whether the rule currently exists, per the analysis. A rule whose only
  // definitions are suppressed doesn't.
  exists = true;
  // Errored by the analysis (circular). Still matches, as error recovery:
  // firing is a no-op, but consuming its regions keeps the one grammar error
  // from cascading into unresolved-token noise.
  disabled = false;
  // Anchored: starts with a literal — rejectable on one character, and safe to
  // use as a grammar claim (it can't match "anywhere"). Delimited: ends with a
  // literal — its extent is closed, so scanning can skip the span it claims.
  // `anchor`/`tail` are those edge literals; `edge(sign)` is whichever of the
  // two a directed reader meets first.
  readonly anchored: boolean;
  readonly delimited: boolean;
  readonly anchor?: string;
  readonly tail?: string;
  private readonly edge_chars: [string | undefined, string | undefined];
  // The scope this rule registers on, by name — nodes live one pass, the rule
  // survives them all (see Interpreter.name_of).
  constructor(public pattern: Node, public pieces: Piece[], public on: string) {
    this.anchored = pieces[0] !== undefined && is_literal(pieces[0]);
    this.delimited = pieces.length > 0 && is_literal(pieces[pieces.length - 1]);
    this.anchor = this.anchored ? (pieces[0] as { text: string }).text : undefined;
    this.tail = this.delimited ? (pieces[pieces.length - 1] as { text: string }).text : undefined;
    this.edge_chars = [this.anchor?.[0], this.tail ? this.tail[this.tail.length - 1] : undefined];
  }
  edge(sign: 1 | -1): string | undefined { return sign === 1 ? this.anchor : this.tail; }
  // the single character a directed reader rejects this rule on
  edge_char(sign: 1 | -1): string | undefined { return this.edge_chars[sign === 1 ? 0 : 1]; }
  definition(at: Node): Definition {
    let d = this.definitions.find(x => x.at.src === at.src && x.at.begin === at.begin);
    if (!d) this.definitions.push(d = { at });
    return d;
  }
}

// ─────────────────────────── grammar ───────────────────────────
// The persistent half: the ledger of every rule ever sighted, and the
// existence analysis over it. Interpreters (and their nodes) live one pass
// each; the grammar survives them all.

const GLOBAL_SCOPE = '~';

class Grammar {
  rules = new Map<string, Rule>();          // key: on + file + pattern text
  registry = new Map<string, External>();   // runtime-provided rule impls, by exact pattern text
  issues: Issue[] = [];
  new_rules = false;
  language_file?: string;

  language(src: Source): boolean { return src.path === this.language_file; }

  rule(pattern: Node, pieces: Piece[], on: string, file?: string): Rule {
    const key = `${on}::${file ?? ''}::${pattern.text.trim()}`;
    let rule = this.rules.get(key);
    if (!rule) {
      rule = new Rule(pattern, pieces, on);
      rule.external = this.registry.get(pattern.text.trim());
      rule.file = file;
      this.rules.set(key, rule);
      this.new_rules = true;
    }
    return rule;
  }

  // each pass re-derives every definition sighting from scratch
  reset(): void {
    this.new_rules = false;
    for (const rule of this.rules.values()) for (const d of rule.definitions) d.seen = undefined;
  }

  // A rule exists iff some definition survives: parsed live, or inside a
  // region whose consuming rule doesn't itself exist. That's circular, so
  // iterate — simultaneously (Jacobi), because updating in place would settle
  // a mutual suppression on whichever rule is visited first instead of
  // exposing the oscillation. Non-convergence IS the circularity error.
  // Returns whether this pass discovered new rules (the fixpoint driver's
  // continue condition).
  analyze(): boolean {
    const rules = [...this.rules.values()].filter(r => !r.disabled && r.definitions.length);
    const state = new Map<Rule, boolean>(rules.map(r => [r, true]));
    const step = (): boolean => {
      const previous = new Map(state);
      // a disabled rule still consumes its regions (error recovery), so as a
      // suppressor it counts as existing
      const exists = (r: Rule) => previous.get(r) ?? (r.disabled || r.exists);
      let changed = false;
      for (const r of rules) {
        const alive = r.definitions.some(d => d.seen === 'live' || (d.seen instanceof Rule && !exists(d.seen)));
        if (alive !== previous.get(r)) changed = true;
        state.set(r, alive);
      }
      return changed;
    };

    const limit = 2 * rules.length + 6;
    let stable = false;
    const oscillating = new Set<Rule>();
    for (let k = 0; k < limit; k++) {
      const before = new Map(state);
      if (!step()) { stable = true; break; }
      if (k >= rules.length + 2) for (const r of rules) if (state.get(r) !== before.get(r)) oscillating.add(r);
    }

    if (!stable && oscillating.size) this.report_cycles(oscillating, { state, step, limit });

    for (const r of rules) r.exists = (state.get(r) ?? true) && !r.disabled;
    return this.new_rules;
  }

  // Follow each oscillating rule's suppression edge (which oscillating rule's
  // region swallows its definition) to recover the actual cycles — any length
  // — plus the tails that hang off them. Cycle members are disabled; their
  // errors are reported once, after the final pass.
  private report_cycles(oscillating: Set<Rule>, { state, step, limit }: { state: Map<Rule, boolean>; step: () => boolean; limit: number }): void {
    const issue = (message: string, ...definitions: Definition[]) => {
      for (const d of definitions) {
        if (this.issues.some(i => i.at?.src === d.at.src && i.at.begin === d.at.begin && i.message === message)) continue;
        this.issues.push({ phase: 'grammar', message, at: d.at });
      }
    };
    const suppressed_by = (r: Rule) => r.definitions.find(d => d.seen instanceof Rule && oscillating.has(d.seen));
    const reported = new Set<Rule>();
    for (const start of oscillating) {
      if (reported.has(start)) continue;
      // walk the suppression chain until it loops back (a cycle) or reaches
      // an already-reported rule (a tail into a known cycle)
      const order = new Map<Rule, number>();
      let current: Rule | undefined = start;
      while (current && !order.has(current) && !reported.has(current)) {
        order.set(current, order.size);
        current = suppressed_by(current)?.seen as Rule | undefined;
      }
      const trail = [...order.keys()];
      const cycle = current && order.has(current) ? trail.slice(order.get(current)!) : [];
      for (const r of cycle) reported.add(r);
      if (cycle.length === 1) {
        for (const d of cycle[0].definitions) if (d.seen === cycle[0])
          issue(`Unresolved grammar rule \`${cycle[0].pattern.text}\`: its only definition is inside its own interpretation.`, d);
      } else if (cycle.length > 1) {
        const names = cycle.map(r => `\`${r.pattern.text}\``);
        const message = `The rules ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} circularly prevent each other from existing.`;
        for (const r of cycle) { const d = suppressed_by(r); if (d) issue(message, d); }
      }
      for (const r of trail) {
        if (reported.has(r)) continue;
        reported.add(r);
        const d = suppressed_by(r);
        if (d) issue(`The rule \`${r.pattern.text}\` is circularly prevented from existing (via \`${(d.seen as Rule).pattern.text}\`).`, d);
      }
    }
    for (const r of oscillating) { r.disabled = true; state.set(r, false); }
    for (let k = 0; k < limit; k++) if (!step()) break;
  }
}

// ─────────────────────────── interpreter ───────────────────────────

// A directed view over a cursor Node — the expression-walking counterpart of
// the directed Scan. sign 1 reads left-to-right, consuming `begin` upward;
// sign -1 reads right-to-left, consuming `end` downward. `head` is the next
// unread position; `cut(edge)` consumes through the far boundary of a span
// (its `end` reading right, its `begin` reading left). The cursor is itself a
// Node: it carries the source, so there is no separate "current file".
class Walk {
  readonly text: string;
  constructor(readonly cursor: Node, readonly sign: 1 | -1) { this.text = cursor.src!.text; }
  get src(): Source { return this.cursor.src!; }
  get head(): number { return this.sign === 1 ? this.cursor.begin : this.cursor.end - 1; }
  done(): boolean { return this.cursor.begin >= this.cursor.end; }
  at(offset = 0): string | undefined { return this.text[this.head + offset * this.sign]; }
  behind(offset = 1): string | undefined { return this.text[this.head - offset * this.sign]; }
  take(n = 1): void { if (this.sign === 1) this.cursor.begin += n; else this.cursor.end -= n; }
  cut(edge: number): void { if (this.sign === 1) this.cursor.begin = edge; else this.cursor.end = edge; }
  get direction(): string { return this.sign === 1 ? 'left-to-right' : 'right-to-left'; }
}

// How an expression is to be read: in which direction, at what indentation,
// and whether an unresolved result is allowed (the caller will resolve it).
// Everything defaults; direction is decided by the expression itself when
// not given (see Reader.flips).
interface Reading {
  sign?: 1 | -1;
  indent?: number;         // indentation of the line the expression started on
  forwards?: boolean;      // allow an unresolved result
}

// What best_rule found: a rule together with where it matched.
interface Found { rule: Rule; m: Matched }

// How an expression reads, decided by its exclusively-directional tokens
// before anything evaluates (see Reader.directions):
//   ltr     no right-to-left token — the default reading
//   rtl     right-to-left tokens only — read from the right end
//   both    a right-to-left prefix and a left-to-right suffix POINTING APART,
//           sharing the operand between them: `rtl X ltr` reads as both
//           (rtl X) and (X ltr)
//   mixed   directional tokens running towards each other — there is no
//           single reading: an error
type Directions =
  | { read: 'ltr' }
  | { read: 'rtl'; extent: number }
  | { read: 'both'; extent: number; before: number; after: number }
  | { read: 'mixed'; extent: number; names: string[] };

// ─── one expression, being read ───
// A Reader is a Walk that knows the grammar: it carries the running result
// and dispatches each head. At each head exactly one of these happens, tried
// in order:
//
//   space        a rule may claim the space itself (function definitions,
//                spaced calls); otherwise it just separates tokens
//   declarative  a leading keyword (`external`, `static`) takes the whole
//                line, raw (reading left-to-right only)
//   step         the longest match wins, across grammar rules AND known
//                method names (a tie goes to the rule); `callable` methods
//                take the rest of the expression as their argument
//   word         nothing known — the word becomes a forward, an unresolved
//                name that something later may define (or an error, if there
//                already is a result to call it on)
class Reader extends Walk {
  readonly ip: Interpreter;
  readonly indent: number;
  readonly forwards: boolean;
  result?: Node;
  stopped = false;          // the rest of the line was abandoned

  constructor(ip: Interpreter, cursor: Node, reading: { sign: 1 | -1; indent: number; forwards: boolean }) {
    super(cursor, reading.sign);
    this.ip = ip;
    this.indent = reading.indent;
    this.forwards = reading.forwards;
  }

  read(): Node | undefined {
    let first = true;
    while (!this.done() && !this.stopped) {
      const c = this.at();
      if (c === undefined || c === '\n') break;
      if (c === ' ') { if (!this.rule_step()) this.take(); continue; }
      if (first) {
        first = false;
        if (this.sign === 1 && this.declarative()) continue;
      }
      if (this.step()) continue;
      this.word();
    }
    if (this.result?.role?.kind === 'forward' && !this.result.consumed && !this.forwards) {
      this.result.consumed = true;
      this.ip.log.error('resolve', `Unresolved variable \`${this.result.role.name}\`.`, this.result);
    }
    return this.result;
  }

  // How this expression reads, decided before anything evaluates. Tokens
  // carrying exactly one direction flag are collected (`</` is just a
  // right-to-left one); a rule claiming the whole expression from its start
  // (a comment, a string) overrides — its content is not tokens — and a
  // cheap occurrence gate keeps every other expression free of this
  // entirely. With both kinds present, source order decides: every
  // right-to-left token before every left-to-right one points them APART
  // (they share the operand between them); any interleaving has them running
  // towards each other — no single reading.
  directions(): Directions {
    const ip = this.ip;
    const along: Directions = { read: 'ltr' };
    if (!ip.rtl_names.size || NO_RTL) return along;
    const begin = this.head;
    if (!ip.rtl_site_in(this.src, begin, line_end(this.text, begin))) return along;
    const scan = this.scan;
    const extent = expression_edge(scan, begin);
    const lead = this.best_rule();
    if (lead && lead.m.end >= extent) return along;
    const first = ip.known(scan, begin, ip.lookup());
    if (first && ip.resolve(first)?.has_flag('declarative')) return along;
    const tokens: { name: string; begin: number; end: number; rtl: boolean }[] = [];
    let i = begin;
    while (i < extent) {
      const c = this.text[i];
      if (c === ' ' || c === '\n') { i++; continue; }
      if (scan.anchors.has(c)) {
        const far = scan.claim(i);
        if (far !== -1) { i = far + 1; continue; }
      }
      const w = word_edge(scan, i);
      if (w === i) { i++; continue; }
      const name = this.text.slice(i, w);
      const m = ip.resolve(name);
      if (m?.fn && m.has_flag('right-to-left') !== m.has_flag('left-to-right'))
        tokens.push({ name, begin: i, end: w, rtl: m.has_flag('right-to-left') });
      i = w;
    }
    const rtls = tokens.filter(t => t.rtl);
    if (!rtls.length) return along;
    const ltrs = tokens.filter(t => !t.rtl);
    if (!ltrs.length) return { read: 'rtl', extent };
    const last_rtl = rtls[rtls.length - 1], first_ltr = ltrs[0];
    if (last_rtl.end <= first_ltr.begin) return { read: 'both', extent, before: first_ltr.begin, after: last_rtl.end };
    return { read: 'mixed', extent, names: [...new Set(tokens.map(t => t.name))] };
  }

  private get scan(): Scan { return this.ip.scan(this.src, this.sign); }

  private declarative(): boolean {
    const ip = this.ip;
    const keyword = ip.known(this.scan, this.head, ip.lookup());
    const target = keyword ? ip.resolve(keyword) : undefined;
    if (!target?.fn || !target.has_flag('declarative')) return false;
    const at = span(this.src, this.head, this.head + keyword!.length, ip.BASE);
    let a = at.end;
    while (this.text[a] === ' ') a++;
    const eol = line_end(this.text, a);
    this.result = ip.invoke(target, { self: ip.scope(), args: span(this.src, a, eol, ip.BASE), at }) ?? undefined;
    this.cut(eol);
    return true;
  }

  // One dispatch over everything nameable at this head: the best grammar
  // rule and the longest known method name compete on length, the rule wins
  // a tie.
  private step(): boolean {
    const found = this.best_rule();
    const name = this.known();
    if (found && name) return found.m.end - found.m.begin >= name.length ? this.rule_step(found) : this.token(name);
    if (found) return this.rule_step(found);
    if (name) return this.token(name);
    return false;
  }

  // The best rule at this head. Candidates come from the result's type chain
  // first, then the scopes — and `prefers` below is the whole disambiguation
  // story: the longest match wins; on a tie an anchored rule beats an
  // unanchored one, and then the rule from the nearest node in the chain wins
  // (the type-bound specificity that lets `({args})` on Program shadow Node's
  // function-definition rule).
  private best_rule(): Found | null {
    const ip = this.ip;
    const at = this.head, sign = this.sign;
    const scan = { ...this.scan, indent: this.indent, start: this.result === undefined && sign === 1 };
    const c = this.text[at];
    type Candidate = Found & { level: number };
    const prefers = (a: Candidate, b: Candidate | null): boolean => {
      if (!b) return true;
      const la = a.m.end - a.m.begin, lb = b.m.end - b.m.begin;
      if (la !== lb) return la > lb;
      if (a.rule.anchored !== b.rule.anchored) return a.rule.anchored;
      return a.level < b.level;
    };
    let best: Candidate | null = null;
    const seen = new Set<Rule>();
    let level = 0;
    const consider = (nodes: Iterable<Node>) => {
      for (const node of nodes) {
        for (const rule of ip.rules_on(node)) {
          if (!ip.visible(rule, this.src) || seen.has(rule)) continue;
          seen.add(rule);
          // a rule with a literal on the reading side is rejected on a single
          // character compare; statement-shaped externals read source order only
          const edge = rule.edge(sign);
          if (edge !== undefined && (rule.edge_char(sign) !== c || (edge.length > 1 && !lit_at(scan, at, edge)))) continue;
          if (rule.external?.match && sign === -1) continue;
          const m = rule.external?.match ? rule.external.match(rule, scan, at) : match_rule(rule, scan, at);
          if (m && prefers({ rule, m, level }, best)) best = { rule, m, level };
        }
        level++;
      }
    };
    if (this.result) consider(ip.chain(this.result));
    consider(ip.lookup());
    return best;
  }

  private rule_step(found = this.best_rule()): boolean {
    if (!found) return false;
    this.result = this.ip.fire(found, this.src, this.result) ?? this.result;
    this.cut(this.sign === 1 ? found.m.end : found.m.begin);
    return true;
  }

  // The longest method name at this head — from the result's type chain when
  // there is one, the scopes otherwise.
  private known(): string | null {
    const ip = this.ip;
    return ip.known(this.scan, this.head, this.result ? ip.chain(this.result) : ip.lookup());
  }

  private token(name: string): boolean {
    const ip = this.ip;
    const m = this.result ? ip.resolve_on(this.result, name)! : ip.resolve(name)!;
    const begin = this.sign === 1 ? this.head : this.head - name.length + 1;
    const at = span(this.src, begin, begin + name.length, ip.BASE);
    this.cut(this.sign === 1 ? at.end : at.begin);
    if (!m.fn) { this.result = m; return true; }
    // a method folds onto its receiver only in a direction it reads — plain
    // methods read left-to-right; the expression's anchor (no receiver yet)
    // is direction-checked only when it carries an explicit flag
    if (!this.directed(m)) {
      ip.log.error('method', this.result
        ? `Found a method \`${name}\` on \`${this.result.text}\` but it wasn't flagged as ${this.direction}.`
        : `Found a method \`${name}\` but it wasn't flagged as ${this.direction}.`, at);
      return true;
    }
    const self = this.result ?? ip.scope();
    // a `callable` method takes the rest of the expression as its argument
    const args = m.has_flag('callable') ? ip.expr(this.cursor, { forwards: this.forwards, indent: this.indent, sign: this.sign }) : undefined;
    this.result = ip.invoke(m, { self, args, at }) ?? this.result;
    return true;
  }

  private directed(m: Node): boolean {
    const rtl = m.has_flag('right-to-left'), ltr = m.has_flag('left-to-right');
    if (this.sign === 1) return ltr || !rtl;
    return rtl || (!ltr && this.result === undefined);
  }

  private word(): void {
    const exit = word_edge(this.scan, this.head);
    if (exit === this.head) { this.take(); return; }
    const [b, e] = this.sign === 1 ? [this.head, exit] : [exit + 1, this.head + 1];
    const word = span(this.src, b, e, this.ip.BASE);
    if (this.result) {
      this.ip.log.error('method', `Unresolved \`${word.text}\` on \`${this.result.text}\`.`, word);
      this.cut(this.sign === 1 ? line_end(this.text, this.head) : line_begin(this.text, this.head + 1));
      this.stopped = true;
      return;
    }
    word.role = { kind: 'forward', name: word.text, on: this.ip.scope() };
    this.result = word;
    this.cut(this.sign === 1 ? e : b);
  }
}

// One pass over the sources. Everything here — the node graph, the scopes,
// the diagnostics — is born fresh per pass and thrown away; only the grammar
// it reads from and reports to persists.
class Interpreter {
  constructor(public grammar: Grammar, public log = new Log()) {}

  // the node graph roots: `Node`/`*` is BASE, `Program` is PROGRAM, the
  // global scope chains to BASE
  BASE = new Node();
  PROGRAM = new Node(this.BASE);
  GLOBAL = new Node(this.BASE);
  classes = new Map<string, Node>([['Node', this.BASE], ['*', this.BASE], ['Program', this.PROGRAM]]);
  class_node(name: string): Node {
    let node = this.classes.get(name);
    if (!node) {
      this.classes.set(name, node = new Node(this.BASE));
      // the ledger may already carry rules scoped to this class from an
      // earlier pass — they exist as soon as their scope does
      for (const rule of this.grammar.rules.values()) if (rule.on === name) this.install(rule);
    }
    return node;
  }

  // Rules name their scope (nodes are per-pass, the ledger is not): classes
  // by their language-given name, the global scope by a marker, anything else
  // by a tag only this pass can resolve.
  private transients = new Map<string, Node>();
  name_of(node: Node): string {
    if (node === this.GLOBAL) return GLOBAL_SCOPE;
    for (const [name, cls] of this.classes) if (cls === node) return name;
    const name = `#${id(node)}`;
    this.transients.set(name, node);
    return name;
  }
  node_of(name: string): Node | undefined {
    if (name === GLOBAL_SCOPE) return this.GLOBAL;
    return this.classes.get(name) ?? this.transients.get(name);
  }

  rules_version = 0;                        // bumped by install(); keys caches

  // interpreter state
  scopes: Node[] = [this.GLOBAL];
  abstract_blocks = true;                   // evaluate every {block} where it's captured
  // names declared right-to-left so far this pass — the quick gate for the
  // up-front direction decision in expr()
  rtl_names = new Set<string>();

  language(src: Source): boolean { return this.grammar.language(src); }
  scope(): Node { return this.scopes[this.scopes.length - 1]; }
  // the only way scopes change — the epoch keys the cached scan context
  private scope_epoch = 0;
  enter(scope: Node): void { this.scopes.push(scope); this.scope_epoch++; }
  leave(): void { this.scopes.pop(); this.scope_epoch++; }

  // Every node reachable from the scope stack, innermost first — what an
  // expression start resolves against.
  *lookup(): Generator<Node> {
    const seen = new Set<Node>();
    for (let i = this.scopes.length - 1; i >= 0; i--)
      for (let n: Node | undefined = this.scopes[i]; n && !seen.has(n); n = n.sup) { seen.add(n); yield n; }
  }
  // A receiver's type chain — what a result resolves against.
  *chain(node: Node | undefined): Generator<Node> {
    const seen = new Set<Node>();
    for (let n = node; n && !seen.has(n); n = n.sup) { seen.add(n); yield n; }
  }
  // The grammar a node carries (kept in step with the pattern-keyed method
  // registration by install()).
  rules_on(node: Node): readonly Rule[] {
    return node.rules ?? NO_RULES;
  }

  visible(rule: Rule, src: Source): boolean {
    if (!(rule.exists || rule.disabled)) return false;
    return rule.file === undefined || rule.file === src.path;
  }

  // ── the grammar ledger ──

  // How far a rule declared in this source reaches: everywhere when the
  // source is the language itself, otherwise only that file.
  reach(src: Source): string | undefined {
    return this.language(src) ? undefined : src.path;
  }

  rule(pattern: Node, pieces: Piece[], on: Node): Rule {
    return this.grammar.rule(pattern, pieces, this.name_of(on), this.reach(pattern.src!));
  }

  // A definition parsed as actual code — `at` heads the `{pattern} => body`
  // statement.
  define(at: Node): Rule {
    const src = at.src!;
    const r = recognize(src.text, at.begin, this.scan(src))!;
    const pattern = span(src, r.pattern_begin, r.pattern_end);
    const rule = this.rule(pattern, r.pieces, this.scope());
    rule.definition(pattern).seen = 'live';
    if (r.body_end > r.body_begin) {
      const body = span(src, r.body_begin, r.body_end);
      if (!body.empty) rule.body = body;
    }
    this.install(rule);
    return rule;
  }

  // `external <pattern>`: activate the runtime-provided implementation under
  // the language's own pattern text.
  declare(pattern: Node, on: Node): Rule | undefined {
    const external = this.grammar.registry.get(pattern.text.trim());
    if (!external) return undefined;
    const rule = this.rule(pattern, parse_pattern(pattern.src!.text, pattern.begin, pattern.end, this.scan(pattern.src!)) ?? [], on);
    rule.external = external;
    rule.definition(pattern).seen = 'live';
    this.install(rule);
    return rule;
  }

  // Register the rule as a method on its node, keyed by the pattern node —
  // that's what makes grammar type-bound: candidates at a position are
  // whatever the chain being parsed carries.
  install(rule?: Rule): void {
    this.scans.clear();
    this.rules_version++;
    if (!rule) { for (const r of this.grammar.rules.values()) this.install(r); return; }
    if (!rule.exists && !rule.disabled) return;
    const on = this.node_of(rule.on);
    if (!on) return;  // a scope this pass hasn't created (yet)
    on.set(rule.pattern, rule.pattern);
    if (!(on.rules ??= []).includes(rule)) on.rules.push(rule);
  }

  // A fired rule consumed regions of raw text (comments, strings). Scan them
  // for rule definitions: those exist only if this rule doesn't — record the
  // suppression for the analysis.
  suppress_inside(rule: Rule, src: Source, m: Matched): void {
    for (const cap of m.captures) {
      const scannable = cap.piece.name === 'comment' || cap.piece.name === 'string' || cap.piece.raw;
      if (!scannable || cap.end <= cap.begin) continue;
      // a definition needs `=>` — one indexOf rules out almost everything
      const arrow = src.text.indexOf('=>', cap.begin);
      if (arrow === -1 || arrow >= cap.end) continue;
      let i = cap.begin;
      while (i < cap.end) {
        let a = i;
        while (a < cap.end && src.text[a] === ' ') a++;
        if (a < cap.end && src.text[a] !== '\n') {
          const r = recognize(src.text, a, this.scan(src));
          if (r && r.pattern_end <= cap.end) {
            const target = this.rule(span(src, r.pattern_begin, r.pattern_end), r.pieces, this.scope());
            const d = target.definition(span(src, r.pattern_begin, r.pattern_end));
            if (d.seen !== 'live') d.seen = rule;
            if (!target.body && r.body_end > r.body_begin) target.body = span(src, r.body_begin, r.body_end);
          }
        }
        i = line_end(src.text, i) + 1;
      }
    }
  }

  // ── the scanning context ──
  // The memo is load-bearing, not an optimization: overlapping scans re-walk
  // nested regions from every enclosing position — exponential on deeply
  // bracketed text. Keyed by position + the rule-bearing scopes; cleared on
  // any rule change.

  private scans = new Map<string, number>();
  private scan_depth = 0;
  private scan_cache?: { epoch: number; version: number; src: Source; scans: Map<1 | -1, Scan> };
  scan(src: Source, sign: 1 | -1 = 1): Scan {
    let cached = this.scan_cache;
    if (!cached || cached.epoch !== this.scope_epoch || cached.version !== this.rules_version || cached.src !== src)
      cached = this.scan_cache = { epoch: this.scope_epoch, version: this.rules_version, src, scans: new Map() };
    const hit = cached.scans.get(sign);
    if (hit) return hit;
    const anchors = new Set<string>();
    let signature = `${src.path ?? ''}${sign === 1 ? '>' : '<'}|`;
    for (const node of this.lookup()) {
      let carries_rules = false;
      for (const rule of this.rules_on(node)) {
        carries_rules = true;
        if (this.visible(rule, src) && rule.anchored && rule.delimited) anchors.add(near(sign, rule.edge(sign)!));
      }
      if (carries_rules) signature += `${id(node)}.`;
    }
    const scan: Scan = {
      text: src.text,
      sign,
      anchors,
      // the recursion nests once per open group; past the cap a position
      // simply isn't claimed — unterminated junk degrades to char-wise
      // scanning instead of overflowing
      claim: (j) => {
        if (this.scan_depth > 64) return -1;
        const key = `${signature}:${j}`;
        const hit = this.scans.get(key);
        if (hit !== undefined) return hit;
        this.scan_depth++;
        try {
          const c = src.text[j];
          let best = -1;
          for (const node of this.lookup()) {
            for (const rule of this.rules_on(node)) {
              if (!rule.anchored || !rule.delimited || !this.visible(rule, src)) continue;
              if (rule.edge_char(sign) !== c) continue;
              const m = match_rule(rule, scan, j);
              if (!m) continue;
              const far = sign === 1 ? m.end - 1 : m.begin;
              if (best === -1 || far * sign > best * sign) best = far;
            }
          }
          this.scans.set(key, best);
          return best;
        } finally { this.scan_depth--; }
      },
      // a `{...}` piece is a literal exactly when a quote-like rule (single
      // capture returned verbatim by its body) covers its whole content
      literal_of: (begin, end) => {
        const text = src.text;
        for (const node of this.lookup()) {
          for (const rule of this.rules_on(node)) {
            if (!rule.anchored || !rule.delimited || !rule.body || !this.visible(rule, src)) continue;
            const captures = rule.pieces.filter(p => !is_literal(p)) as Capture[];
            if (captures.length !== 1 || !captures[0].name || rule.body.text.trim() !== captures[0].name) continue;
            const m = match_rule(rule, scan, begin);
            if (!m || m.end !== end) continue;
            const cap = m.captures.find(c => c.piece === captures[0]);
            return cap ? text.slice(cap.begin, cap.end) : '';
          }
        }
        return undefined;
      },
    };
    cached.scans.set(sign, scan);
    return scan;
  }

  // ── parsing ──

  parse(src: Source): void {
    const saved = this.scopes;
    this.scopes = [this.GLOBAL];
    this.scope_epoch++;
    this.statements(span(src, 0, src.text.length));
    this.scopes = saved;
    this.scope_epoch++;
  }

  statements(cursor: Node, forwards = false): Node | undefined {
    const text = cursor.src!.text;
    let result: Node | undefined;
    while (cursor.begin < cursor.end) {
      while (cursor.begin < cursor.end && (text[cursor.begin] === ' ' || text[cursor.begin] === '\n')) cursor.begin++;
      if (cursor.begin >= cursor.end) break;
      const before = cursor.begin;
      const r = this.expr(cursor, { forwards });
      if (r !== undefined) result = r;
      if (cursor.begin <= before) cursor.begin = before + 1;
    }
    return result;
  }

  eval_block(block: Node | undefined, forwards = false): Node | undefined {
    if (!block || block.empty) return undefined;
    return this.statements(span(block.src!, block.begin, block.end), forwards);
  }

  // ── reading expressions ──
  // An expression is read by a Reader, in its DIRECTIONS — decided up front
  // by Reader.directions, so nothing evaluates twice.

  expr(cursor: Node, reading: Reading = {}): Node | undefined {
    const indent = reading.indent ?? indent_at(cursor.src!.text, cursor.begin);
    const forwards = reading.forwards ?? false;
    if (reading.sign !== undefined)
      return new Reader(this, cursor, { sign: reading.sign, indent, forwards }).read();
    const reader = new Reader(this, cursor, { sign: 1, indent, forwards });
    const d = reader.directions();
    if (d.read === 'ltr') return reader.read();
    const src = cursor.src!;
    const begin = cursor.begin;
    cursor.begin = d.extent;
    switch (d.read) {
      case 'rtl':
        return this.expr(span(src, begin, d.extent), { sign: -1, indent, forwards });
      case 'both': {
        // the operand between the prefix and the suffix is shared: read the
        // right-to-left half through it, then the left-to-right half from it
        const rtl = this.expr(span(src, begin, d.before), { sign: -1, indent, forwards });
        const ltr = this.expr(span(src, d.after, d.extent), { sign: 1, indent, forwards });
        return ltr ?? rtl;
      }
      case 'mixed':
        this.log.error('direction',
          `Cannot mix ${d.names.map(n => `\`${n}\``).join(', ')} in a single infix expression with mixed associativity, use parenthesis to mix them.`,
          span(src, begin, d.extent));
        return undefined;
    }
  }

  // Where right-to-left names occur in a source, computed once per source
  // (and again when a new one is declared) — the per-expression gate is a
  // binary search instead of a text scan.
  private rtl_sites = new Map<Source, { names: number; sites: number[] }>();
  rtl_site_in(src: Source, begin: number, end: number): boolean {
    let entry = this.rtl_sites.get(src);
    if (!entry || entry.names !== this.rtl_names.size) {
      const sites: number[] = [];
      for (const name of this.rtl_names) {
        for (let k = src.text.indexOf(name); k !== -1; k = src.text.indexOf(name, k + 1)) sites.push(k);
      }
      sites.sort((a, b) => a - b);
      this.rtl_sites.set(src, entry = { names: this.rtl_names.size, sites });
    }
    const sites = entry.sites;
    let lo = 0, hi = sites.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sites[mid] < begin) lo = mid + 1; else hi = mid; }
    return lo < sites.length && sites[lo] < end;
  }

  // ── firing rules ──

  // Firing is guarded by cycle detection: the same rule at the same position
  // is a guaranteed loop and returns immediately. The depth cap is a backstop;
  // when it trips, the whole current chain aborts (anything less is
  // exponential) — never the run.
  private depth = 0;
  private overflowed = false;
  private firing = new Set<string>();
  fire(found: Found, src: Source, receiver: Node | undefined): Node | undefined {
    const { rule, m } = found;
    if (this.overflowed) return undefined;
    const at = span(src, m.begin, m.end);
    const site = `${id(rule.pattern)}:${src.path ?? ''}:${at.begin}`;
    if (this.firing.has(site)) return undefined;
    if (this.depth > 64) {
      this.overflowed = true;
      this.log.error('fire', `Rule recursion exceeded at \`${rule.pattern.text}\` — refusing to evaluate deeper.`, at);
      return undefined;
    }
    this.firing.add(site);
    this.depth++;
    try {
      if (receiver?.role?.kind === 'forward') receiver.consumed = true;
      this.suppress_inside(rule, src, m);  // even recovery matches record what they consume
      if (rule.disabled) return undefined;
      if (rule.external) return rule.external.fire({ rule, match: new Match(m, src, this.BASE), at, receiver, ip: this });
      return this.evaluate(found, src, receiver);
    } finally {
      this.firing.delete(site);
      if (--this.depth === 0) this.overflowed = false;
    }
  }

  // Evaluate a rule body with its captures bound in a fresh scope. A capture's
  // KIND is its extent; its NAME is its meaning — `expr`/`args` captures are
  // evaluated eagerly wherever they appear (bounded or trailing), `block`
  // stays a lazy program but is abstractly evaluated where it's captured.
  private evaluate({ rule, m }: Found, src: Source, receiver: Node | undefined): Node | undefined {
    if (!rule.body || rule.body.empty) return undefined;
    const ctx = new Node(this.BASE);
    for (const cap of m.captures) {
      if (!cap.piece.name) continue;
      const node = span(src, cap.begin, cap.end, this.BASE);
      const value = (cap.piece.name === 'expr' || cap.piece.name === 'args')
        ? (this.eval_block(node) ?? node)
        : node;
      if (cap.piece.name === 'block') this.abstract(value);
      ctx.set(cap.piece.name, value);
    }
    if (receiver) ctx.set('this', receiver);
    return this.eval_in(ctx, rule.body);
  }

  // ── resolution ──

  // The longest method name whose near end (in the scan's reading order)
  // sits at this head, word-boundary checked on its far side for
  // alphanumeric names. Buckets keep this a walk over the names that share
  // the near character, longest first.
  known(scan: Scan, at: number, nodes: Iterable<Node>): string | null {
    const { text, sign } = scan;
    const c = text[at];
    let best: string | null = null;
    for (const node of nodes) {
      if (!node.methods) continue;
      for (const key of names_of(node.methods, c, sign)) {
        if (best !== null && key.length <= best.length) break;
        const begin = sign === 1 ? at : at - key.length + 1;
        if (key.length > 1 && (begin < 0 || !text.startsWith(key, begin))) continue;
        const far = sign === 1 ? at + key.length : begin - 1;
        if (/\w/.test(near(-sign as 1 | -1, key)) && /\w/.test(text[far] ?? '')) continue;
        best = key;
      }
    }
    return best;
  }

  // Call a method node. The argument defaults to an empty span at the call
  // site — "no argument" still has a place in the source.
  invoke(method: Node, call: { self: Node; args?: Node; at: Node }): Node | undefined {
    return method.fn!({ self: call.self, method, args: call.args ?? span(call.at.src!, call.at.begin, call.at.begin, this.BASE), at: call.at });
  }

  // Evaluate a block with `scope` entered (a class body, a rule body's
  // bindings, a program's own span).
  eval_in(scope: Node, block: Node | undefined, forwards = false): Node | undefined {
    if (!block || block.empty) return undefined;
    this.enter(scope);
    const result = this.eval_block(block, forwards);
    this.leave();
    return result;
  }

  resolve(word: string): Node | undefined {
    for (const node of this.lookup()) { const found = node.get(word); if (found) return found; }
    return undefined;
  }

  resolve_on(on: Node, key: Key): Node | undefined {
    for (const node of this.chain(on)) { const found = node.get(key); if (found) return found; }
    return undefined;
  }

  // every {block} is evaluated where it's captured (abstract interpretation) —
  // errors in never-called bodies still surface
  abstract(block: Node): void {
    if (this.abstract_blocks && !block.empty) this.evaluate_program(block);
  }

  // Evaluate an in-language program: its node spans its own body, entered as
  // the local scope (it carries `args` & friends). A body already being
  // evaluated is a recursive call — abstractly opaque: return a fresh node
  // instead of unrolling. This is evaluation machinery; what *counts* as
  // callable (bound methods, externals) is the externals' business.
  private calling = new Set<Node>();
  evaluate_program(program: Node): Node {
    if (this.calling.has(program)) return new Node();
    this.calling.add(program);
    try {
      return this.eval_in(program, program) ?? new Node();
    } finally { this.calling.delete(program); }
  }

  // `external <name>` verifies a runtime-provided method exists; `external
  // <pattern>` activates a runtime-provided rule under the language's own
  // pattern text. Leading `modifier`-flagged methods (`right-to-left`,
  // `left-associative`, ...) are not the declaration — they are applied to it.
  declare_external(raw: Node, on: Node, at: Node): Node {
    const src = raw.src!;
    let begin = raw.begin, end = raw.end;
    while (begin < end && src.text[begin] === ' ') begin++;
    while (end > begin && src.text[end - 1] === ' ') end--;
    const text = src.text.slice(begin, end);
    if (!text) { this.log.error('external', '`external` requires a declaration as its argument.', at); return raw; }
    if ('{(['.includes(text[0])) {
      const r = recognize(src.text, begin, this.scan(src));
      const pattern = r && r.pattern_end <= end ? span(src, r.pattern_begin, r.pattern_end) : span(src, begin, end);
      if (!this.declare(pattern, on))
        this.log.error('external', `Expected the rule \`${pattern.text}\` to be provided by the runtime, but it wasn't.`, pattern);
      return raw;
    }
    const words = text.split(/\s+/);
    const modifiers: Node[] = [];
    while (words.length > 1) {
      const modifier = this.resolve_on(on, words[0]) ?? this.resolve(words[0]);
      if (!modifier?.fn || !modifier.has_flag('modifier')) break;
      modifiers.push(modifier);
      words.shift();
    }
    const name = words[0].split(':')[0];
    const target = this.resolve_on(on, name) ?? this.resolve(name);
    if (!target) {
      this.log.error('external', `Expected method \`${name}\` to be externally defined by the runtime, but it wasn't.`, span(src, begin, end));
      return raw;
    }
    let declared: Node = target;
    for (const modifier of modifiers) declared = this.invoke(modifier, { self: on, args: declared, at }) ?? declared;
    if (declared.has_flag('right-to-left') && !declared.has_flag('left-to-right')) this.rtl_names.add(name);
    return raw;
  }
}

const NO_RULES: readonly Rule[] = [];
const NO_RTL = !!process.env.RAY_NO_RTL;  // disable the direction decision, for benchmarking
const NO_NAMES: readonly string[] = [];

// Per-method-map near-char buckets, names sorted longest-first — the lookup
// for "longest known name here" walks one small bucket instead of every key.
// One bucket map per reading direction (first characters reading right, last
// characters reading left). Keyed by the Map object itself and rebuilt when
// its size changes (keys are only ever added).
const buckets = new WeakMap<Map<Key, Node>, { count: number; names: [Map<string, string[]>, Map<string, string[]>] }>();
function names_of(methods: Map<Key, Node>, c: string, sign: 1 | -1): readonly string[] {
  let b = buckets.get(methods);
  if (!b || b.count !== methods.size) {
    const names: [Map<string, string[]>, Map<string, string[]>] = [new Map(), new Map()];
    for (const key of methods.keys()) {
      if (typeof key !== 'string') continue;
      for (const s of [1, -1] as const) {
        const map = names[s === 1 ? 0 : 1];
        const n = near(s, key);
        let list = map.get(n);
        if (!list) map.set(n, list = []);
        list.push(key);
      }
    }
    for (const map of names) for (const list of map.values()) list.sort((x, y) => y.length - x.length);
    buckets.set(methods, b = { count: methods.size, names });
  }
  return b.names[sign === 1 ? 0 : 1].get(c) ?? NO_NAMES;
}

let IDS = 0;
const ids = new WeakMap<Node, number>();
function id(node: Node): number { let n = ids.get(node); if (n === undefined) ids.set(node, n = ++IDS); return n; }

// ──────────────────────── externals + driver ────────────────────────

// The interpreter only records what a node *is* (its `role`); what a role
// *means* is decided here, by the externals that use it.

// iterative — slot values can be cyclic (`a = b; b = a`)
function deref(ip: Interpreter, node: Node | undefined): Node | undefined {
  const seen = new Set<Node>();
  let n = node;
  while (n?.role?.kind === 'slot' && !seen.has(n)) {
    seen.add(n);
    const found = ip.resolve_on(n.role.on, n.role.key);
    if (!found || found === n) break;
    n = found;
  }
  return n;
}

// `self = args`: a forward defines its name where it was created (class
// bodies define methods on the class); a slot assigns its location.
function assign(ip: Interpreter, { self, args, at }: Call): Node {
  const value = deref(ip, args) ?? args;
  const role = self?.role;
  if (role?.kind !== 'slot' && role?.kind !== 'forward') {
    ip.log.error('assign', 'Cannot assign here.', self ?? at);
    return value;
  }
  const on = role.on;
  const key = role.kind === 'slot' ? role.key : role.name;
  if (role.kind === 'forward') self.consumed = true;
  on.set(key, value);
  for (const [name, cls] of ip.classes) if (cls === on) {
    ip.log.info('define', `Defined \`${typeof key === 'string' ? key : key.text}\` on \`${name}\`.`, self);
    break;
  }
  return value;
}

// `callee(args)`: a bound role carries its receiver, an external runs its
// fn, anything else with a body is an in-language program.
function call(ip: Interpreter, callee: Node | undefined, args: Node, at: Node): Node {
  const bound = callee?.role?.kind === 'bound' ? callee.role : undefined;
  const method = bound ? bound.method : callee;
  const self = bound ? bound.self : callee;
  if (method?.fn) return ip.invoke(method, { self: self ?? method, args, at }) ?? new Node();
  if (method && !method.empty) return ip.evaluate_program(method);
  ip.log.error('call', 'Expected a function to call.', at);
  return new Node();
}

async function main() {
  // created before anything else — the log's clock times the whole run,
  // file loads included
  const log = new Log();
  const cd = '@ether/$/.ray';
  
  const sources = [
    load_file(`${cd}/Node.ray`),
    load_file(`${cd}/tests/direction.ray`),
    // load_file(`${cd}/tests/circular.ray`),
    // load_file(`${cd}/tests/self.ray`),
    // load_file(`${cd}/tests/string.ray`),
    // load_file(`${cd}/tests/cycle3.ray`),
    // load_file(`${cd}/tests/cycle4.ray`),
    // load_file(`${cd}/tests/tail.ray`),
    // ...load_directory('@ether/.ray3'),
    // ...load_directory('@ether/.ray2'),
  ];

  new Program(sources).run(log).print();
}

// word externals on the base class — what the language's `external <name>`
// declarations bind to; registered onto each pass's fresh interpreter
function externals(ip: Interpreter): void {
  const method = (name: string, fn: Method, ...flags: string[]): void => {
    const node = new Node(ip.BASE);
    node.fn = fn;
    for (const f of flags) node.flag(f);
    if (node.has_flag('right-to-left') && !node.has_flag('left-to-right')) ip.rtl_names.add(name);
    ip.BASE.set(name, node);
  };
  method('external', ({ self, args, at }) => ip.declare_external(args, self, at), 'declarative');
  method('static', ({ args }) => ip.eval_block(args) ?? args, 'declarative');
  method('=', call => assign(ip, call), 'callable');
  // `external **: Program` — the result is a Program, so Program's rules apply to it
  method('**', ({ self }) => { const program = deref(ip, self) ?? self; program.sup = ip.PROGRAM; return program; });
  // direction modifiers stamp which side of its receiver a method's call site
  // sits on; associativity is the same axis for now
  for (const name of ['left-to-right', 'left-associative'])
    method(name, ({ args }) => args.flag('left-to-right'), 'callable', 'modifier');
  for (const name of ['right-to-left', 'right-associative'])
    method(name, ({ args }) => args.flag('right-to-left'), 'callable', 'modifier');
  // the bare marker: right-to-left with nothing on its right — it ends an
  // expression, flips it, and transparently returns what the flipped walk read
  method('</', ({ args }) => args, 'callable', 'right-to-left');
  // the direction-fixture stand-ins emit the trace infos the fixtures expect
  method('test-middle', ({ at }) => at);
  method('test-left', ({ self, at }) => { ip.log.info('test', `test-left fired on \`${self.text}\``, at); return self; });
  method('test-right', ({ self, at }) => { ip.log.info('test', `test-right fired on \`${self.text}\``, at); return self; }, 'callable');
  method('test-assoc', ({ self, at }) => { ip.log.info('test', `test-assoc fired on \`${self.text}\``, at); return self; }, 'callable');
  method('test-bidir', ({ self, at }) => { ip.log.info('test', `test-bidir fired on \`${self.text}\``, at); return self; });
}

// rule externals — inert until a .ray file declares them with `external <pattern>`
const RULE_EXTERNALS: [string, External][] = [
  ['{`class `}{name}{block}', {
    name: 'class',
    fire({ match, ip }) {
      const name = match.capture('name')?.text.trim();
      if (!name) return undefined;
      const node = ip.class_node(name);
      ip.scope().set(name, node);
      ip.eval_in(node, match.capture('block'));
      return node;
    },
  }],
  ['{(String.Word | `{`, expr, `}`)[]}{`=>`}{body}', {
    name: 'rule-definition',
    match(rule, scan, at) {
      if (!scan.start) return null;  // a statement shape, not mid-expression
      const r = recognize(scan.text, at, scan);
      return r && { begin: at, end: r.end, captures: [] };
    },
    fire({ at, ip }) {
      ip.define(at);
      return undefined;
    },
  }],
  ['[{property}]', {
    name: 'index',
    fire({ match, at, receiver, ip }) {
      const self = receiver ?? ip.scope();
      const key_node = ip.eval_block(match.capture('property'), true);
      if (key_node?.role?.kind === 'forward') key_node.consumed = true;
      const key = key_node ? (key_node.role?.kind === 'forward' ? key_node.role.name : key_node.text) : '';
      const found = key ? ip.resolve_on(self, key) : undefined;
      const result = span(at.src!, at.begin, at.end, ip.BASE);
      if (found?.fn) { result.sup = ip.PROGRAM; result.role = { kind: 'bound', self, method: found }; }
      else result.role = { kind: 'slot', on: deref(ip, self) ?? self, key };
      return result;
    },
  }],
  ['({args})', {
    name: 'call',
    fire({ match, at, receiver, ip }) {
      const cap = match.capture('args')!;
      const args = (cap.empty ? undefined : ip.eval_block(cap)) ?? cap;
      return call(ip, receiver, args, at);
    },
  }],
];

// The driver: one grammar, interpreter passes over the sources until the
// grammar stops growing. Each pass starts from nothing and re-derives all
// semantic state by reparsing, so passes are deterministic — the last pass's
// log is the program's output.
class Program {
  grammar = new Grammar();

  constructor(public sources: Source[]) {
    this.grammar.language_file = sources[0].path;
    for (const [pattern, external] of RULE_EXTERNALS) this.grammar.registry.set(pattern, external);
    // the one hardcoded shape, seeded as a rule scoped to the language file —
    // Node.ray must re-declare it in-language, then the seed is redundant
    const seed: Source = { text: '{(String.Word | `{`, expr, `}`)[]}{`=>`}{body}' };
    this.grammar.rule(span(seed, 0, seed.text.length), [], 'Node', this.grammar.language_file);
  }

  pass(log?: Log): Interpreter {
    this.grammar.reset();
    const ip = new Interpreter(this.grammar, log);
    externals(ip);
    ip.install();
    for (const src of this.sources) ip.parse(src);
    return ip;
  }

  // fixpoint: discovery → probe (all discovered rules on, so mutual
  // suppressions collide; repeat only while new rules turn up) → final.
  // `log` becomes the final pass's (the program's output); its clock has been
  // running since the caller created it.
  run(log = new Log()): Log {
    let ip = this.pass();
    if (![...this.grammar.rules.values()].some(r => r.external?.name === 'rule-definition' && r.file === undefined))
      throw new Error(`'${this.grammar.language_file}' did not declare the grammar-rule definition rule.`);
    this.grammar.analyze();
    for (let i = 0; i < 3; i++) {
      for (const rule of this.grammar.rules.values()) if (!rule.disabled && !rule.exists) rule.exists = true;
      ip = this.pass();
      if (!this.grammar.analyze()) break;
    }
    ip = this.pass(log);
    for (const issue of this.grammar.issues) ip.log.error(issue.phase, issue.message, issue.at);
    return ip.log;
  }
}

await main();