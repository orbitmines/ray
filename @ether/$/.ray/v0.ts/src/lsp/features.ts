import type { Ray, Painted } from '../minimal2.ts';
type Program = Ray.Program;

// LSP features, as queries over the program's public surface — the grammar's
// rules and definition sites, and the painted spans (the grammar's own
// reading of every file).

export interface Span { path: string; begin: number; end: number }

// What the grammar says about the editor's behavior: a rule of one capture
// between two quoted literals is a pair — a raw capture makes a quote
// (nothing nests inside it), the rest are brackets — and an anchored rule
// whose raw capture has no body is a line comment.
export function configuration(program: Program): {
  comments?: { lineComment: string };
  brackets: [string, string][];
  quotes: [string, string][];
  autoClosingPairs: { open: string; close: string; notIn?: string[] }[];
  surroundingPairs: [string, string][];
} {
  const brackets: [string, string][] = [];
  const quotes: [string, string][] = [];
  let lineComment: string | undefined;
  const seen = new Set<string>();
  for (const rule of program.engine.rules.values()) {
    if (!rule.exists || rule.disabled) continue;
    const p = rule.pieces;
    if (p.length === 3 && p[0].kind === 'literal' && p[1].kind !== 'literal' && p[2].kind === 'literal') {
      const key = `${p[0].text}\0${p[2].text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (p[1].raw ? quotes : brackets).push([p[0].text, p[2].text]);
    } else if (p.length === 2 && p[0].kind === 'literal' && p[1].kind !== 'literal' && p[1].raw && (!rule.body || rule.body.empty)) {
      lineComment ??= p[0].text;
    }
  }
  return {
    comments: lineComment !== undefined ? { lineComment } : undefined,
    brackets,
    quotes,
    autoClosingPairs: [
      ...brackets.map(([open, close]) => ({ open, close })),
      ...quotes.map(([open, close]) => ({ open, close, notIn: ['string'] })),
    ],
    surroundingPairs: [
      ...brackets, ...quotes
    ],
  };
}

// The lexical layer, from the same rules: the editor's native bracket
// machinery skips comments and strings only when its tokenizer marks them —
// this IS that tokenizer, derived and served whole; the client materializes
// it where the editor expects a file.
export function lexical(program: Program): { scopeName: string; patterns: object[] } {
  const { comments, quotes } = configuration(program);
  // tokens are ARBITRARY text — every character encodes as a hex escape,
  // read literally, so nothing here knows the regex format's specials
  const literal = (text: string) => [...text].map(c => `\\x{${c.codePointAt(0)!.toString(16)}}`).join('');
  const patterns: object[] = [];
  if (comments?.lineComment !== undefined)
    patterns.push({ name: 'comment.line.ray', match: `${literal(comments.lineComment)}.*$` });
  for (const [open, close] of quotes)
    patterns.push({ name: 'string.quoted.ray', begin: literal(open), end: literal(close) });
  return { scopeName: 'source.ray', patterns };
}

// The file's definitions, for an outline: ledgered class definitions and the
// grammar rules defined there.
export function symbols(program: Program, path: string): { name: string; begin: number; end: number; rule: boolean }[] {
  const out: { name: string; begin: number; end: number; rule: boolean }[] = [];
  for (const [key, site] of program.engine.sites())
    if (site.src.path === path && site.end)
      out.push({ name: key.replace('::', '.'), begin: site.begin, end: site.end, rule: false });
  for (const rule of program.engine.rules.values())
    for (const d of rule.definitions)
      if (d.at.src?.path === path && d.seen === 'live')
        out.push({ name: rule.pattern.text.trim().slice(0, 48), begin: d.at.begin, end: d.at.end, rule: true });
  return out.sort((a, b) => a.begin - b.begin);
}

// The smallest painted span at a position — the grammar's reading of what
// sits there.
export function word_at(program: Program, path: string, offset: number): Painted | undefined {
  let best: Painted | undefined;
  for (const s of program.highlighting.get(path) ?? [])
    if (s.style !== '' && s.begin! <= offset && offset <= s.end! && (!best || s.end! - s.begin! < best.end! - best.begin!)) best = s;
  return best;
}

// The rule whose match owns the position — the smallest attributed span.
export function rule_at(program: Program, path: string, offset: number): string | undefined {
  let best: Painted | undefined;
  for (const s of program.highlighting.get(path) ?? [])
    if (s.of !== undefined && s.begin! <= offset && offset <= s.end! && (!best || s.end! - s.begin! < best.end! - best.begin!)) best = s;
  return best?.of;
}

// A rule's references: everywhere it matched, one region per match —
// overlapping records of the same match merge. The lens count and the
// references menu are this same list.
export function rule_references(program: Program, key: string): Span[] {
  const out: Span[] = [];
  for (const [file, spans] of program.highlighting) {
    const mine = spans.filter(s => s.of === key && s.style === '').sort((a, b) => a.begin! - b.begin! || b.end! - a.end!);
    let current: Span | undefined;
    for (const s of mine) {
      if (current && s.begin! <= current.end) current.end = Math.max(current.end, s.end! + 1);
      else out.push(current = { path: file, begin: s.begin!, end: s.end! + 1 });
    }
  }
  return out;
}

const text_of = (program: Program, path: string): string | undefined =>
  program.sources.find(s => s.path === path)?.text;

// Where what sits at the position is defined: inside a rule's definition,
// every sighting of that rule; on a word, its ledgered definition sites.
export function definition(program: Program, path: string, offset: number): Span[] {
  const out: Span[] = [];
  // a span some rule's match painted — `{`, `]`, a quote — goes to that
  // rule's definitions
  const key = rule_at(program, path, offset);
  const claimed = key !== undefined ? program.engine.rules.get(key) : undefined;
  if (claimed) {
    for (const o of claimed.definitions)
      if (o.at.src?.path !== undefined) out.push({ path: o.at.src.path, begin: o.at.begin, end: o.at.end });
    if (out.length) return out;
  }
  for (const rule of program.engine.rules.values())
    for (const d of rule.definitions)
      if (d.at.src?.path === path && d.at.begin <= offset && offset < d.at.end) {
        for (const o of rule.definitions)
          if (o.at.src?.path !== undefined) out.push({ path: o.at.src.path, begin: o.at.begin, end: o.at.end });
        return out;
      }
  const text = text_of(program, path);
  const w = text !== undefined ? word_at(program, path, offset) : undefined;
  if (text === undefined || !w) return out;
  const word = text.slice(w.begin!, w.end! + 1);
  for (const [key, site] of program.engine.sites())
    if (site.end && site.src.path !== undefined && key.slice(key.indexOf('::') + 2) === word)
      out.push({ path: site.src.path, begin: site.begin, end: site.end });
  return out;
}

// References at a position: inside a rule's definition (its pattern, braces
// included) or inside one of its matches, the rule's matches; on a word,
// every span the grammar read as that word, across the project.
export function references(program: Program, path: string, offset: number): Span[] {
  for (const [key, rule] of program.engine.rules)
    for (const d of rule.definitions)
      if (d.at.src?.path === path && d.at.begin <= offset && offset < d.at.end)
        return rule_references(program, key);
  const key = rule_at(program, path, offset);
  const text = text_of(program, path);
  const w = text !== undefined ? word_at(program, path, offset) : undefined;
  if (!w && key !== undefined) return rule_references(program, key);
  if (text === undefined || !w) return [];
  const word = text.slice(w.begin!, w.end! + 1);
  const out: Span[] = [];
  const dedup = new Set<string>();
  for (const [file, spans] of program.highlighting) {
    const other = text_of(program, file);
    if (other === undefined) continue;
    for (const s of spans) {
      if (s.style === '' || s.end! - s.begin! + 1 !== word.length || other.slice(s.begin!, s.end! + 1) !== word) continue;
      const dkey = `${file}:${s.begin}`;
      if (dedup.has(dkey)) continue;
      dedup.add(dkey);
      out.push({ path: file, begin: s.begin!, end: s.end! + 1 });
    }
  }
  return out;
}

// What to say about a position: the rule defined there — its pattern, style
// and sighting count — or a word's defining statement.
export function hover(program: Program, path: string, offset: number): string | undefined {
  const about = (rule: { pattern: { text: string }; body?: { empty: boolean; text: string }; style?: string; definitions: unknown[] }): string => {
    const body = rule.body && !rule.body.empty ? ` => ${rule.body.text.trim().split('\n')[0]}` : ' =>';
    const style = rule.style !== undefined ? `\n\nstyled \`${rule.style}\`` : '';
    const n = rule.definitions.length;
    return `\`\`\`ray\n${rule.pattern.text.trim()}${body}\n\`\`\`${style}\n\n${n} sighting${n === 1 ? '' : 's'}`;
  };
  const key = rule_at(program, path, offset);
  const claimed = key !== undefined ? program.engine.rules.get(key) : undefined;
  if (claimed) return about(claimed);
  for (const rule of program.engine.rules.values())
    for (const d of rule.definitions)
      if (d.at.src?.path === path && d.at.begin <= offset && offset < d.at.end)
        return about(rule);
  const text = text_of(program, path);
  const w = text !== undefined ? word_at(program, path, offset) : undefined;
  if (text === undefined || !w) return undefined;
  const word = text.slice(w.begin!, w.end! + 1);
  for (const [key, site] of program.engine.sites())
    if (site.end && key.slice(key.indexOf('::') + 2) === word)
      return `\`\`\`ray\n${site.src.text.slice(site.begin, site.end).split('\n')[0]}\n\`\`\`\n\non \`${key.slice(0, key.indexOf('::'))}\``;
  return undefined;
}

// Foldable regions: indentation blocks, and runs of line comments.
export function foldings(text: string, lineComment?: string): { start: number; end: number }[] {
  const lines = text.split('\n');
  const indents = lines.map(l => (l.trim() === '' ? -1 : l.length - l.trimStart().length));
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (indents[i] < 0) continue;
    let j = i + 1, last = i;
    while (j < lines.length && (indents[j] < 0 || indents[j] > indents[i])) {
      if (indents[j] > indents[i]) last = j;
      j++;
    }
    if (last > i) out.push({ start: i, end: last });
  }
  if (lineComment !== undefined) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trimStart().startsWith(lineComment)) continue;
      let j = i;
      while (j + 1 < lines.length && lines[j + 1].trimStart().startsWith(lineComment)) j++;
      if (j > i) out.push({ start: i, end: j });
      i = j;
    }
  }
  return out;
}

// Expanding selections: the word at the position, its line, its indentation
// block, the file.
export function selections(text: string, offset: number, word?: Painted): { begin: number; end: number }[] {
  const out: { begin: number; end: number }[] = [];
  if (word) out.push({ begin: word.begin!, end: word.end! + 1 });
  const bol = text.lastIndexOf('\n', offset - 1) + 1;
  const eol = text.indexOf('\n', offset);
  out.push({ begin: bol, end: eol === -1 ? text.length : eol });
  // the enclosing indentation block: up to the nearest shallower line on
  // both sides
  const lines = text.split('\n');
  let line = 0, pos = 0;
  for (; pos + lines[line].length < offset && line < lines.length - 1; line++) pos += lines[line].length + 1;
  const indent = lines[line].length - lines[line].trimStart().length;
  let first = line, last = line;
  while (first > 0 && (lines[first - 1].trim() === '' || lines[first - 1].length - lines[first - 1].trimStart().length >= indent)) first--;
  while (last < lines.length - 1 && (lines[last + 1].trim() === '' || lines[last + 1].length - lines[last + 1].trimStart().length >= indent)) last++;
  let begin = 0;
  for (let i = 0; i < first; i++) begin += lines[i].length + 1;
  let end = begin;
  for (let i = first; i <= last; i++) end += lines[i].length + 1;
  out.push({ begin, end: Math.min(end - 1, text.length) });
  out.push({ begin: 0, end: text.length });
  return out;
}
