// A program image: laid out once, read by every cursor, never written.
//
//   image:   MAGIC  LENGTH  REGIONS  region[REGIONS] | constants … | regions …
//   region:  N (cells)  E (entries)  X (exits) | entry[E] | code …
//
// Every address in an image is relative to the image's start, so an image can be loaded anywhere.
// An operand is a cell of the cursor's state (o >= 0) or a constant of the image (o < 0: the word at -o - 1).
//
//   JUMP to                      IF c then else join          FORK n target… join          JOIN next
//   ENTER callee nIn entry… argc operand… nOut (cont dst)…    EXIT k operand
//   SET dst o                    ADD | SUB | MUL | LT | EQ | SUPERPOSE dst a b
//   SYS dst code argc operand…   (the outside world: the cursor waits for the environment)
//   EACH dst callee o            (callee on every component of o; possibly on the GPU)
//
// `join` and `dst` are -1 when there is none. `callee` is a region's index.

import { int } from './word.ts';

export const MAGIC = 0x4b32, LENGTH = 1, REGIONS = 2, TABLE = 3;
export const N = 0, E = 1, X = 2, ENTRIES = 3;

export const JUMP = 1, IF = 2, FORK = 3, JOIN = 4, ENTER = 5, EXIT = 6, SET = 7,
  ADD = 8, SUB = 9, MUL = 10, LT = 11, EQ = 12, SUPERPOSE = 13, SYS = 14, EACH = 15;

export const PRINT = 1;

export const names: Record<number, string> = { [JUMP]: 'jump', [IF]: 'if', [FORK]: 'fork', [JOIN]: 'join', [ENTER]: 'enter', [EXIT]: 'exit', [SET]: 'set', [ADD]: 'add', [SUB]: 'sub', [MUL]: 'mul', [LT]: 'lt', [EQ]: 'eq', [SUPERPOSE]: 'superpose', [SYS]: 'sys', [EACH]: 'each' };

// How many words the instruction at pc takes.
export function size(m: Int32Array, pc: number): number {
  switch (m[pc]) {
    case JUMP: case JOIN: return 2;
    case IF: return 5;
    case FORK: return 3 + m[pc + 1];
    case ENTER: { const ins = m[pc + 2], argc = m[pc + 3 + ins], outs = m[pc + 4 + ins + argc]; return 5 + ins + argc + 2 * outs; }
    case EXIT: case SET: return 3;
    case ADD: case SUB: case MUL: case LT: case EQ: case SUPERPOSE: return 4;
    case SYS: return 4 + m[pc + 3];
    case EACH: return 4;
  }
  throw new Error(`not an instruction: ${m[pc]} at ${pc}`);
}

export const region_at = (image: Int32Array, index: number) => image[TABLE + index];

// ---------------------------------------------------------------- building an image
// Words of an instruction while building: a number as it is, or a reference resolved when the image is built.
export type Word = number | { label: string } | { region: string } | { constant: number };

export class Region {
  code: Word[] = [];
  labels = new Map<string, number>();
  entries: string[] = [];
  constructor(public name: string, public cells: number, public exits: number) {}
  entry(label: string) { this.entries.push(label); return this; }
  label(name: string) { this.labels.set(name, this.code.length); return this; }
  op(...words: Word[]) { this.code.push(...words); return this; }
}

export class Assembler {
  regions: Region[] = [];
  constants: number[] = [];

  region(name: string, cells: number, exits = 1) { const r = new Region(name, cells, exits); this.regions.push(r); return r; }

  // A constant operand holding the integer n.
  int(n: number): Word { return { constant: int(n) }; }

  build(): { image: Int32Array; regions: Map<string, number> } {
    const index = new Map(this.regions.map((r, i) => [r.name, i]));
    const constants = new Map<number, number>();
    let at = TABLE + this.regions.length;
    for (const r of this.regions) for (const w of r.code) if (typeof w === 'object' && 'constant' in w && !constants.has(w.constant)) constants.set(w.constant, at++);
    const starts: number[] = [];
    for (const r of this.regions) { starts.push(at); at += ENTRIES + r.entries.length + r.code.length; }
    const image = new Int32Array(at);
    image[0] = MAGIC; image[LENGTH] = at; image[REGIONS] = this.regions.length;
    this.regions.forEach((_, i) => image[TABLE + i] = starts[i]);
    for (const [value, address] of constants) image[address] = value;
    this.regions.forEach((r, i) => {
      const base = starts[i], code = base + ENTRIES + r.entries.length;
      const label = (name: string) => { const pc = r.labels.get(name); if (pc === undefined) throw new Error(`no label ${name} in ${r.name}`); return code + pc; };
      image[base + N] = r.cells; image[base + E] = r.entries.length; image[base + X] = r.exits;
      r.entries.forEach((l, k) => image[base + ENTRIES + k] = label(l));
      r.code.forEach((w, k) => {
        image[code + k] = typeof w === 'number' ? w
          : 'label' in w ? label(w.label)
          : 'region' in w ? (index.get(w.region) ?? (() => { throw new Error(`no region ${w.region}`); })())
          : -constants.get(w.constant)! - 1;
      });
    });
    return { image, regions: index };
  }
}
