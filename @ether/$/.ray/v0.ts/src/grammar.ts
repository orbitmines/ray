// Grammar rules are Node-keyed methods: a rule's pattern is an AST.Node
// registered as a method key on the class node it belongs to (that's why
// `Key = string | Node`), so the grammar valid at any position is whatever the
// type chain of the node being parsed exposes.
//
// Nothing about concrete syntax is hardcoded here — the scanner doesn't know
// that backticks quote or that brackets nest. That knowledge follows
// recursively from the active rules themselves (`` `{string: String}` ``,
// `({expr})`, `[{expr}]`, `{`{`}{expr}{`}`}` in Node.ray): scanning for a
// terminating literal skips spans by recursively matching whatever anchored
// rules are active at that position (the `inner` callback of `Scan`).
// `String`-typed captures scan raw — the capture's type decides what grammar
// is valid inside it. The only primitives are whitespace/indentation structure
// and the `{pattern} => body` shape, which the language re-declares as an
// external so it stops being special.
//
// Three parts:
//   1. piece parsing + matching + the `{pattern} => body` recognizer
//      (integers over the raw source; AST.Node spans only at boundaries);
//   2. the Rule ledger — definitions seen live vs. suppressed per pass;
//   3. the existence analysis: a rule defined only inside a region another
//      rule interprets away (comment, string) may be suppressed, possibly
//      circularly, which `analyze()` surfaces as compiler errors.

import { AST, Runtime } from "./language.ts";

export interface Piece {
  node: AST.Node;
  literal?: string;
  name?: string;
  type?: string;
  raw?: string;
}

export interface Scan {
  // Extent of whatever active rule matches at `at` (recursion into the live
  // grammar) — null when no anchored rule matches there. Pure: must not fire
  // rule bodies or record applications. The cursor passed in is a reused
  // scratch — read its position, don't retain it.
  inner?: (at: AST.Node) => AST.Node | null;
  // When a `{...}` piece's content is itself a quoted literal under the active
  // grammar (e.g. {`//`} via the string rule), its literal text — else undefined.
  literal_of?: (content: AST.Node) => string | undefined;
  // First characters of the active anchored rules — derived from the grammar,
  // not hardcoded. Scanners bulk-skip runs of characters not in this set
  // (nothing can start there), consulting `inner` only at anchor characters.
  anchors?: Set<string>;
  // Indentation of the line the current expression started on ({block}
  // captures extend over deeper-indented lines).
  indent?: number;
  // Whether the position is the start of a statement — unanchored statement
  // rules (the rule-definition shape) only apply there.
  start?: boolean;
}

// A sub-span node of `of`'s source; `end` inclusive, `end < begin` is an empty
// node sitting at `begin`.
export const sub = (of: AST.Node, begin: number, end: number): AST.Node => {
  const node = new AST.Node(of.program, of.source);
  node.cursor = begin;
  if (end >= begin) node.selection = [begin, end];
  return node;
};

export const cursor_at = (of: AST.Node, at: number): AST.Node => {
  const node = new AST.Node(of.program, of.source);
  node.cursor = at;
  return node;
};

export const indent_at = (src: string, i: number): number => {
  const line = src.lastIndexOf('\n', i - 1) + 1;
  let n = 0;
  while (src[line + n] === ' ') n++;
  return n;
};

const line_end = (src: string, i: number): number => {
  const nl = src.indexOf('\n', i);
  return nl === -1 ? src.length : nl;
};

// One scratch cursor per scanning loop (not per character): the inner
// callback only reads the position, so the probe is safely reused.
interface Scratch { probe?: AST.Node }

// End (exclusive) of whatever the active grammar claims at `j`, or -1.
const inner_at = (src: string, j: number, opts: Scan, scratch: Scratch, like: AST.Node): number => {
  if (!opts.inner) return -1;
  const probe = scratch.probe ??= cursor_at(like, j);
  probe.cursor = j;
  if (probe.selection.length) probe.selection = [];
  const m = opts.inner(probe);
  if (!m || m.empty() || m.end! < j) return -1;
  return m.end! + 1;
};

// Index of the next occurrence of `lit` (-1 when absent), skipping spans the
// active grammar claims (strings, groups — and through them, balanced
// nesting). Characters that can't start the terminator or any active rule are
// skipped in bulk; only anchor characters pay for the grammar recursion.
const scan_to = (src: string, from: number, lit: string, opts: Scan, scratch: Scratch, like: AST.Node,
                 raw: boolean, multiline: boolean): number => {
  if (raw) {
    const k = src.indexOf(lit, from);
    if (k === -1) return -1;
    if (!multiline) { const nl = src.indexOf('\n', from); if (nl !== -1 && nl < k) return -1; }
    return k;
  }
  const first = lit[0];
  const anchors = opts.anchors;
  let j = from;
  while (j < src.length) {
    const c = src[j];
    if (c === first && (lit.length === 1 || src.startsWith(lit, j))) return j;
    if (c === '\n' && !multiline) return -1;
    if (!anchors || anchors.has(c)) {
      const e = inner_at(src, j, opts, scratch, like);
      if (e > j) { j = e; continue; }
    }
    j++;
    if (anchors) while (j < src.length && src[j] !== first && src[j] !== '\n' && !anchors.has(src[j])) j++;
  }
  return -1;
};

// End (exclusive) of a `{...}` group starting at `j`. Quoted/nested braces
// inside are hidden by `inner` matches (the string rule, the brace-group
// rule), not by counting.
const brace_end = (src: string, j: number, opts: Scan, scratch: Scratch, like: AST.Node): number => {
  const k = scan_to(src, j + 1, '}', opts, scratch, like, false, false);
  return k === -1 ? -1 : k + 1;
};

// Extend past `at` (sitting before a '\n') over lines indented deeper than
// `indent`. Blank lines don't end the block but stay tentative — they're only
// committed when a deeper line follows, so a match never trails into the gap
// between itself and the next statement. Returns the exclusive end.
const indented_end = (src: string, at: number, indent: number): number => {
  let end = at;
  let j = at;
  while (j < src.length && src[j] === '\n') {
    let k = j + 1;
    let spaces = 0;
    while (src[k] === ' ') { k++; spaces++; }
    if (k >= src.length) break;
    if (src[k] === '\n') { j = k; continue; }
    if (spaces <= indent) break;
    end = line_end(src, k);
    j = end;
  }
  return end;
};

// The rest of an expression: to end of line, except where an inner rule match
// spans further (an open group continues the expression below).
const expression_end = (src: string, from: number, opts: Scan, scratch: Scratch, like: AST.Node): number => {
  const anchors = opts.anchors;
  let j = from;
  while (j < src.length) {
    const c = src[j];
    if (c === '\n') break;
    if (!anchors || anchors.has(c)) {
      const e = inner_at(src, j, opts, scratch, like);
      if (e > j) { j = e; continue; }
    }
    j++;
    if (anchors) while (j < src.length && src[j] !== '\n' && !anchors.has(src[j])) j++;
  }
  return j;
};

// A word ends at whitespace or wherever the active grammar starts meaning
// something else (a rule anchors there). Returns the exclusive end.
const word_end = (src: string, from: number, opts: Scan, scratch: Scratch, like: AST.Node): number => {
  const anchors = opts.anchors;
  let j = from;
  while (j < src.length) {
    const c = src[j];
    if (c === ' ' || c === '\n') break;
    if ((!anchors || anchors.has(c)) && inner_at(src, j, opts, scratch, like) > j) break;
    j++;
  }
  return j;
};

export const capture_word = (_: AST.Node, opts: Scan = {}): string => {
  const src = _.source.value;
  const start = _.head;
  const j = word_end(src, start, opts, {}, _);
  if (j > start) _.end = j - 1;
  return src.slice(start, j);
};

export const parse_pieces = (pattern: AST.Node, opts: Scan = {}): Piece[] | null => {
  const src = pattern.source.value;
  const stop = pattern.end! + 1;
  const scratch: Scratch = {};
  const pieces: Piece[] = [];
  let lit_at = pattern.begin!;
  let i = pattern.begin!;
  const flush = (upto: number) => { if (upto > lit_at) pieces.push({ node: sub(pattern, lit_at, upto - 1), literal: src.slice(lit_at, upto) }); };
  while (i < stop) {
    if (src[i] === '{') {
      const close = brace_end(src, i, opts, scratch, pattern);
      if (close === -1) return null;
      flush(i);
      const node = sub(pattern, i, close - 1);
      const content = sub(pattern, i + 1, close - 2);
      const literal = opts.literal_of?.(content);
      if (literal !== undefined) pieces.push({ node, literal });
      else {
        const named = content.string.match(/^([A-Za-z_][\w.-]*)\s*(?::\s*([\s\S]+))?$/);
        if (named) pieces.push({ node, name: named[1], type: named[2], raw: content.string });
        else pieces.push({ node, raw: content.string });
      }
      i = close;
      lit_at = i;
    } else i++;
  }
  flush(i);
  return pieces.length ? pieces : null;
};

export class Match {
  captures: { piece: Piece; node: AST.Node }[] = [];
  constructor(public rule: Rule, public at: AST.Node) {}
  capture(name: string): AST.Node | undefined {
    return this.captures.find(c => c.piece.name === name)?.node;
  }
}

// Capture extents: bounded by the next literal piece (multi-line — inner rule
// matches hide nested/quoted occurrences); a trailing `String`-typed capture
// runs raw to end of line; a trailing `block` takes the rest of the line plus
// the deeper-indented lines below; anything else is a single word. The
// capture's type decides what grammar is valid inside it: `String` is raw text
// (ends at the first terminator, nothing nests); an untyped capture scans
// grammar-aware (active rules hide quoted/nested spans).
export const match = (rule: Rule, at: AST.Node, opts: Scan = {}): Match | null => {
  const src = at.source.value;
  const scratch: Scratch = {};
  const start = at.head;
  let i = start;
  let caps: { piece: Piece; begin: number; end: number }[] | null = null;
  for (let p = 0; p < rule.pieces.length; p++) {
    const piece = rule.pieces[p];
    const lit = piece.literal;
    if (lit !== undefined) {
      if (src[i] !== lit[0] || (lit.length > 1 && !src.startsWith(lit, i))) return null;
      i += lit.length;
      continue;
    }
    const next = rule.pieces[p + 1];
    const begin = i;
    const raw = (piece.type ?? '').startsWith('String');
    if (next?.literal !== undefined) {
      const k = scan_to(src, i, next.literal, opts, scratch, at, raw, true);
      if (k === -1) return null;
      i = k;
    } else if (piece.name === 'block') {
      i = indented_end(src, line_end(src, i), opts.indent ?? indent_at(src, start));
    } else if (raw) {
      i = line_end(src, i);
    } else if (piece.name === 'expr' || piece.name === 'args' || (piece.name === undefined && piece.raw !== undefined)) {
      i = expression_end(src, i, opts, scratch, at);
    } else {
      i = word_end(src, i, opts, scratch, at);
      if (i === begin) return null;
    }
    (caps ??= []).push({ piece, begin, end: i });
  }
  const m = new Match(rule, sub(at, start, i - 1));
  if (caps) for (const c of caps) m.captures.push({ piece: c.piece, node: sub(at, c.begin, c.end - 1) });
  return m;
};

export interface Recognized {
  pattern: AST.Node;
  pieces: Piece[];
  body: AST.Node;
  at: AST.Node;
}

// The `{pattern} => body` shape: at least one `{...}` group before a top-level
// `=>` on the same line. The body is the rest of the line — extended across
// lines wherever an inner rule match spans them (open groups) — or, when the
// line ends at `=>`, the deeper-indented block below.
export const recognize = (at: AST.Node, opts: Scan = {}): Recognized | null => {
  const src = at.source.value;
  const scratch: Scratch = {};
  const start = at.head;
  let saw_group = false;
  let j = start;
  for (;;) {
    const c = src[j];
    if (c === undefined || c === '\n') return null;
    if (c === '{') {
      const close = brace_end(src, j, opts, scratch, at);
      if (close === -1) return null;
      saw_group = true;
      j = close;
      continue;
    }
    if (c === '=' && src[j + 1] === '>') break;
    j++;
  }
  if (!saw_group) return null;
  let pat_end = j;
  while (pat_end > start && src[pat_end - 1] === ' ') pat_end--;
  if (pat_end === start) return null;
  const pattern = sub(at, start, pat_end - 1);
  const pieces = parse_pieces(pattern, opts);
  if (!pieces) return null;

  let b = j + 2;
  while (src[b] === ' ') b++;
  const bend = (b >= src.length || src[b] === '\n')
    ? indented_end(src, b, indent_at(src, start))
    : expression_end(src, b, opts, scratch, at);
  const body = sub(at, b, bend - 1);
  return { pattern, pieces, body, at: sub(at, start, Math.max(j + 2, bend) - 1) };
};

let GID = 0;
export const gid = (node: AST.Node): number => ((node as any).__gid ??= ++GID);
const RULE = Symbol('rule');
export const rule_of = (pattern: AST.Node): Rule | undefined => (pattern as any)[RULE];

export interface External {
  name: string;
  match?: (rule: Rule, at: AST.Node, opts: Scan) => Match | null;
  fire: (fire: Fire) => AST.Node | undefined;
}

export interface Fire {
  rule: Rule;
  match: Match;
  receiver?: AST.Node;
  engine: any;
}

export interface Def {
  node: AST.Node;
  body?: AST.Node;
  // Per-pass: 'live' when parsed as an actual definition, the suppressing Rule
  // when only found inside a region that rule consumed, undefined when unseen.
  seen?: 'live' | Rule;
}

export class Rule {
  definitions: Def[] = [];
  body?: AST.Node;
  external?: External;
  language = false;
  file?: string;
  exists = true;
  disabled = false;
  constructor(public grammar: Grammar, public pattern: AST.Node, public pieces: Piece[], public on: AST.Node) {
    (pattern as any)[RULE] = this;
  }
  get anchored(): boolean { return this.pieces[0]?.literal !== undefined; }
  get delimited(): boolean { return this.pieces[this.pieces.length - 1]?.literal !== undefined; }
  def(node: AST.Node): Def {
    let d = this.definitions.find(x => x.node.file === node.file && x.node.begin === node.begin);
    if (!d) this.definitions.push(d = { node });
    return d;
  }
}

export interface Issue { level: 'error'; phase: string; message: string; node: AST.Node }

export class Grammar {
  rules = new Map<string, Rule>();
  // External rule implementations the runtime offers, keyed by the exact
  // pattern text a .ray file must use to declare them. Nothing activates
  // until the language declares it.
  registry = new Map<string, External>();
  issues: Issue[] = [];
  new_rules = false;
  // Notified whenever the installed rule set changes — anything caching scan
  // results invalidates on it.
  changed?: () => void;

  constructor(public program: Runtime, public fire: (rule: Rule) => AST.Method) {}

  static key(on: AST.Node, pattern: string, file?: string): string {
    return `${gid(on)}::${file ?? ''}::${pattern.trim()}`;
  }

  provide(pattern: string, external: External): void { this.registry.set(pattern.trim(), external); }

  rule(pattern: AST.Node, pieces: Piece[], on: AST.Node, opts: { file?: string; language?: boolean } = {}): Rule {
    const file = opts.language ? undefined : opts.file;
    const key = Grammar.key(on, pattern.string, file);
    let rule = this.rules.get(key);
    if (!rule) {
      rule = new Rule(this, pattern, pieces, on);
      rule.external = this.registry.get(pattern.string.trim());
      rule.language = !!opts.language;
      rule.file = file;
      this.rules.set(key, rule);
      this.new_rules = true;
    }
    return rule;
  }

  define(recognized: { pattern: AST.Node; pieces: Piece[]; body?: AST.Node }, on: AST.Node,
         opts: { file?: string; language?: boolean } = {}): Rule {
    const rule = this.rule(recognized.pattern, recognized.pieces, on, opts);
    const d = rule.def(recognized.pattern);
    d.seen = 'live';
    if (recognized.body && !recognized.body.empty()) { d.body = recognized.body; rule.body = d.body; }
    this.install(rule);
    return rule;
  }

  declare(pattern: AST.Node, on: AST.Node, opts: Scan & { file?: string; language?: boolean } = {}): Rule | undefined {
    const external = this.registry.get(pattern.string.trim());
    if (!external) return undefined;
    const pieces = parse_pieces(pattern, opts) ?? [];
    const rule = this.rule(pattern, pieces, on, opts);
    rule.external = external;
    rule.def(pattern).seen = 'live';
    this.install(rule);
    return rule;
  }

  // Disabled rules stay installed: the engine matches them for error recovery
  // (consume without effect) so their grammar error doesn't cascade into
  // unresolved-token noise.
  install(rule?: Rule): void {
    this.changed?.();
    if (!rule) { for (const r of this.rules.values()) this.install(r); return; }
    if (!rule.exists && !rule.disabled) return;
    rule.on.method(rule.pattern, this.fire(rule));
  }

  // Record a fired rule application; shadow-scan its raw-text captures
  // (comments, strings — content that never gets interpreted) for rule
  // definitions, which this rule then suppresses.
  applied(rule: Rule, m: Match, opts: Scan & { on: AST.Node; file?: string }): void {
    for (const cap of m.captures) {
      const scannable = cap.piece.name === 'comment' || cap.piece.name === 'string' || (cap.piece.type ?? '').startsWith('String');
      if (!scannable || cap.node.empty()) continue;
      // A definition needs `=>` — one indexOf rules out the overwhelming
      // majority of captured text before any line scanning.
      const src = cap.node.source.value;
      const arrow = src.indexOf('=>', cap.node.begin!);
      if (arrow === -1 || arrow > cap.node.end!) continue;
      let i = cap.node.begin!;
      while (i <= cap.node.end!) {
        let a = i;
        while (a <= cap.node.end! && src[a] === ' ') a++;
        if (a <= cap.node.end! && src[a] !== '\n') {
          const r = recognize(cursor_at(cap.node, a), opts);
          if (r && r.pattern.end! <= cap.node.end!) {
            const target = this.rule(r.pattern, r.pieces, opts.on, { file: opts.file });
            const d = target.def(r.pattern);
            if (d.seen !== 'live') d.seen = rule;
            if (!d.body && r.body && !r.body.empty()) d.body = r.body;
            if (!target.body && d.body) target.body = d.body;
          }
        }
        i = line_end(src, i) + 1;
      }
    }
  }

  begin_pass(): void {
    this.new_rules = false;
    for (const rule of this.rules.values()) for (const d of rule.definitions) d.seen = undefined;
  }

  // Force every non-disabled rule active for a probe pass, so mutually
  // suppressing definitions actually collide instead of settling on whichever
  // happened to parse first.
  probe(): void {
    for (const rule of this.rules.values()) {
      if (rule.disabled || rule.exists) continue;
      rule.exists = true;
      this.install(rule);
    }
  }

  // A rule exists when some definition of it survives: parsed live, or inside
  // a region whose consuming rule doesn't itself exist. That's circular, so
  // iterate; a non-converging iteration is exactly the "rules prevent each
  // other from existing" error (self-loop: defined only inside itself).
  analyze(): { changed: boolean; discovered: boolean } {
    const list = [...this.rules.values()].filter(r => !r.disabled && r.definitions.length);
    const state = new Map<Rule, boolean>(list.map(r => [r, true]));
    // Jacobi-style step (every rule recomputed from the previous state): an
    // in-place update would settle a mutual suppression on whichever rule the
    // iteration visits first instead of exposing the oscillation. A disabled
    // rule still consumes its regions (error recovery), so as a *suppressor*
    // it counts as existing.
    const step = (): boolean => {
      const prev = new Map(state);
      const exists = (r: Rule): boolean => prev.get(r) ?? (r.disabled || r.exists);
      let changed = false;
      for (const r of list) {
        const v = r.definitions.some(d => d.seen === 'live' || (d.seen instanceof Rule && !exists(d.seen)));
        if (v !== prev.get(r)) changed = true;
        state.set(r, v);
      }
      return changed;
    };

    const limit = 2 * list.length + 6;
    let stable = false;
    const toggled = new Set<Rule>();
    for (let k = 0; k < limit; k++) {
      const before = new Map(state);
      if (!step()) { stable = true; break; }
      if (k >= list.length + 2) for (const r of list) if (state.get(r) !== before.get(r)) toggled.add(r);
    }

    if (!stable && toggled.size) {
      const issue = (message: string, ...defs: Def[]) => {
        for (const d of defs) {
          const k = `${d.node.file ?? ''}:${d.node.begin}|${message}`;
          if (this.issues.some(i => `${i.node.file ?? ''}:${i.node.begin}|${i.message}` === k)) continue;
          this.issues.push({ level: 'error', phase: 'grammar', message, node: d.node });
        }
      };
      // Follow each oscillating rule's suppression edge (which oscillating
      // rule's region swallows its definition) to recover the actual cycles —
      // any length — plus the tails that hang off them.
      const next = (r: Rule): { rule: Rule; def: Def } | undefined => {
        for (const d of r.definitions) if (d.seen instanceof Rule && toggled.has(d.seen)) return { rule: d.seen, def: d };
        return undefined;
      };
      const reported = new Set<Rule>();
      for (const start of toggled) {
        if (reported.has(start)) continue;
        const path: Rule[] = [];
        const index = new Map<Rule, number>();
        let cur: Rule | undefined = start;
        while (cur && !index.has(cur) && !reported.has(cur)) {
          index.set(cur, path.length);
          path.push(cur);
          cur = next(cur)?.rule;
        }
        const cycle = cur && index.has(cur) ? path.slice(index.get(cur)!) : [];
        for (const r of cycle) reported.add(r);
        if (cycle.length === 1) {
          for (const d of cycle[0].definitions) if (d.seen === cycle[0])
            issue(`Unresolved grammar rule \`${cycle[0].pattern.string}\`: its only definition is inside its own interpretation.`, d);
        } else if (cycle.length > 1) {
          const names = cycle.map(r => `\`${r.pattern.string}\``);
          const message = `The rules ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} circularly prevent each other from existing.`;
          for (const r of cycle) { const edge = next(r); if (edge) issue(message, edge.def); }
        }
        for (const r of path) {
          if (reported.has(r)) continue;
          reported.add(r);
          const edge = next(r);
          if (edge) issue(`The rule \`${r.pattern.string}\` is circularly prevented from existing (via \`${edge.rule.pattern.string}\`).`, edge.def);
        }
      }
      for (const r of toggled) { r.disabled = true; state.set(r, false); }
      for (let k = 0; k < limit; k++) if (!step()) break;
    }

    let changed = false;
    for (const r of list) {
      const v = (state.get(r) ?? true) && !r.disabled;
      if (r.exists !== v) {
        r.exists = v;
        if (v) this.install(r);
        changed = true;
      }
    }
    return { changed: changed || this.new_rules, discovered: this.new_rules };
  }

  report(): void {
    for (const issue of this.issues)
      this.program.log.report({ level: issue.level, phase: issue.phase, message: issue.message, node: issue.node });
  }
}
