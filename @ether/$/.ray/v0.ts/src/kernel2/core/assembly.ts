// A text form of programs, one instruction per line (`;` starts a comment):
//
//   region main cells=3 exits=1
//     entry start
//   start:
//     set c0 #20
//     enter double in=0 args=c0 out=done:c1
//   done:
//     print c1
//     exit 0 c1
//
// Operands: `cK` a cell, `#N` an integer constant. Labels are region-local; `-` is none.
//   if c then else join   fork a,b join   join next   enter R in=0,1 args=c0,#1 out=label:cK,…   exit k o
//   set|add|sub|mul|lt|eq|superpose dst a b   print o   each dst R o   jump label

import { Assembler, Region, type Word, JUMP, IF, FORK, JOIN, ENTER, EXIT, SET, ADD, SUB, MUL, LT, EQ, SUPERPOSE, SYS, EACH, PRINT } from './program.ts';

const binary: Record<string, number> = { add: ADD, sub: SUB, mul: MUL, lt: LT, eq: EQ, superpose: SUPERPOSE };

export function assemble(text: string) {
  const a = new Assembler();
  let r: Region | undefined;
  const operand = (s: string): Word => {
    if (s.startsWith('c')) return Number(s.slice(1));
    if (s.startsWith('#')) return a.int(Number(s.slice(1)));
    throw new Error(`not an operand: ${s}`);
  };
  const cell = (s: string) => s === '-' ? -1 : Number(s.slice(1));
  const label = (s: string): Word => s === '-' ? -1 : { label: s };
  const option = (parts: string[], key: string) => (parts.find(p => p.startsWith(key + '='))?.slice(key.length + 1) ?? '').split(',').filter(x => x !== '');

  text.split('\n').forEach((line, n) => {
    const words = line.replace(/;.*/, '').trim().split(/\s+/).filter(w => w !== '');
    if (words.length === 0) return;
    const [op, ...rest] = words;
    try {
      if (op === 'region') { r = a.region(rest[0], Number(option(rest, 'cells')[0] ?? 0), Number(option(rest, 'exits')[0] ?? 1)); return; }
      if (r === undefined) throw new Error('outside a region');
      if (op.endsWith(':')) { r.label(op.slice(0, -1)); return; }
      if (op === 'entry') { r.entry(rest[0]); return; }
      if (op === 'jump') { r.op(JUMP, label(rest[0])); return; }
      if (op === 'if') { r.op(IF, operand(rest[0]), label(rest[1]), label(rest[2]), label(rest[3] ?? '-')); return; }
      if (op === 'fork') { const targets = rest[0].split(','); r.op(FORK, targets.length, ...targets.map(label), label(rest[1] ?? '-')); return; }
      if (op === 'join') { r.op(JOIN, label(rest[0])); return; }
      if (op === 'exit') { r.op(EXIT, Number(rest[0]), operand(rest[1])); return; }
      if (op === 'set') { r.op(SET, cell(rest[0]), operand(rest[1])); return; }
      if (op in binary) { r.op(binary[op], cell(rest[0]), operand(rest[1]), operand(rest[2])); return; }
      if (op === 'print') { r.op(SYS, -1, PRINT, 1, operand(rest[0])); return; }
      if (op === 'each') { r.op(EACH, cell(rest[0]), { region: rest[1] }, operand(rest[2])); return; }
      if (op === 'enter') {
        const ins = option(rest, 'in').map(Number), args = option(rest, 'args').map(operand);
        const outs = option(rest, 'out').map(o => o.split(':'));
        r.op(ENTER, { region: rest[0] }, ins.length, ...ins, args.length, ...args, outs.length, ...outs.flatMap(([l, c]) => [label(l), cell(c ?? '-')]));
        return;
      }
      throw new Error(`unknown instruction ${op}`);
    } catch (e) {
      throw new Error(`line ${n + 1}: ${(e as Error).message}`);
    }
  });
  return a.build();
}
