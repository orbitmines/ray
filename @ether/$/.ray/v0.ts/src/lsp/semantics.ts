import type { Painted } from '../minimal.ts';

// The modifiers the LSP standardizes — a style's dotted tail
// (`variable.readonly`) maps onto these bits.
export const MODIFIERS = [
  'declaration', 'definition', 'readonly', 'static', 'deprecated',
  'abstract', 'async', 'modification', 'documentation', 'defaultLibrary',
];

export function position_of(text: string, offset: number): { line: number; character: number } {
  let line = 0, start = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) if (text[i] === '\n') { line++; start = i + 1; }
  return { line, character: end - start };
}

export function offset_at(text: string, line: number, character: number): number {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) return text.length;
    offset = nl + 1;
  }
  return Math.min(offset + character, text.length);
}

// Delta-encode painted spans into LSP semantic-token data, against the
// program's declared groups as the legend. Spans overlap by design — a rule
// paints what it owns, pieces repaint inside it — so per line the smaller
// span wins. Multi-line spans split per line (clients don't reliably render
// multiline tokens), and styles the legend doesn't know (`#`-colors, groups
// declared after boot) simply don't transport yet.
export function encode(text: string, painted: Painted[], groups: string[], range?: [number, number]): number[] {
  const types = new Map(groups.map((g, i) => [g, i] as const));
  const bits = new Map(MODIFIERS.map((m, i) => [m, i] as const));

  // paint each char's token (type << 10 | mods), widest span first so the
  // smaller span wins where they overlap — same as the terminal renderer
  const cells = new Int32Array(text.length).fill(-1);
  const spans = painted
    .filter(p => types.has(p.style.split('.')[0]) && !(range && (p.end! + 1 <= range[0] || p.begin! >= range[1])))
    .sort((a, b) => (b.end! - b.begin!) - (a.end! - a.begin!));
  for (const p of spans) {
    const path = p.style.split('.');
    let cell = types.get(path[0])! << 10;
    for (const m of path.slice(1)) { const b = bits.get(m); if (b !== undefined) cell |= 1 << b; }
    for (let k = Math.max(p.begin!, 0); k <= Math.min(p.end!, text.length - 1); k++) cells[k] = cell;
  }

  // coalesce equal cells into per-line runs, delta-encoded; tokens never cross
  // a newline
  const data: number[] = [];
  let pl = 0, pc = 0, line = 0, col = 0, start = 0, run = -1;
  const flush = () => {
    if (run < 0) return;
    data.push(line - pl, line === pl ? start - pc : start, col - start, run >> 10, run & 1023);
    pl = line; pc = start; run = -1;
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { flush(); line++; col = 0; continue; }
    const cell = cells[i];
    if (cell !== run) { flush(); start = col; run = cell; }
    col++;
  }
  flush();
  return data;
}
