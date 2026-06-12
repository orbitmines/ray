import type { Painted } from '../minimal.ts';

// The modifiers the LSP standardizes — a style's dotted tail
// (`variable.readonly`) maps onto these bits.
export const MODIFIERS = [
  'declaration', 'definition', 'readonly', 'static', 'deprecated',
  'abstract', 'async', 'modification', 'documentation', 'defaultLibrary',
];

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
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1);
  const line_of = (offset: number): number => {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo;
  };

  interface Seg { char: number; len: number; type: number; mods: number }
  const rows = new Map<number, Seg[]>();
  for (const p of painted) {
    if (range && (p.end <= range[0] || p.begin >= range[1])) continue;
    const path = p.style.split('.');
    const type = types.get(path[0]);
    if (type === undefined) continue;
    let mods = 0;
    for (const m of path.slice(1)) { const b = bits.get(m); if (b !== undefined) mods |= 1 << b; }
    let begin = Math.max(0, p.begin);
    const end = Math.min(p.end, text.length);
    while (begin < end) {
      const line = line_of(begin);
      const stop = Math.min(end, (lines[line + 1] ?? text.length + 1) - 1);
      if (stop > begin) {
        let row = rows.get(line);
        if (!row) rows.set(line, row = []);
        row.push({ char: begin - lines[line], len: stop - begin, type, mods });
      }
      begin = lines[line + 1] ?? end;
    }
  }

  const all: (Seg & { line: number })[] = [];
  for (const [line, row] of rows) {
    row.sort((a, b) => a.len - b.len);
    const taken: [number, number][] = [];
    for (const seg of row) {
      let parts: [number, number][] = [[seg.char, seg.char + seg.len]];
      for (const [b, e] of taken) {
        const next: [number, number][] = [];
        for (const [pb, pe] of parts) {
          if (e <= pb || b >= pe) { next.push([pb, pe]); continue; }
          if (pb < b) next.push([pb, b]);
          if (e < pe) next.push([e, pe]);
        }
        parts = next;
      }
      for (const [pb, pe] of parts) {
        all.push({ line, char: pb, len: pe - pb, type: seg.type, mods: seg.mods });
        taken.push([pb, pe]);
      }
    }
  }
  all.sort((a, b) => a.line - b.line || a.char - b.char);

  const data: number[] = [];
  let pl = 0, pc = 0;
  for (const s of all) {
    data.push(s.line - pl, s.line === pl ? s.char - pc : s.char, s.len, s.type, s.mods);
    pl = s.line; pc = s.char;
  }
  return data;
}
