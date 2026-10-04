import type { Text } from '../text.ts';
import { Jump, type Interpreter, type Node, type Rule } from '../interpreter.ts';
import type { Variant } from './graph.ts';
import type { Statement, Unit } from './ir.ts';
import { evaluate } from './evaluate.ts';

// A rule's body reduced on its own side: one instruction per statement, run as indices instead of re-read.
export type Op =
  | { op: 'label'; start: number; end: number; rules: Rule[] }
  | { op: 'jump'; start: number; end: number; rules: Rule[]; statement: Statement }
  | { op: 'natives' | 'name'; start: number; end: number; rules: Rule[]; statement: Statement }
  | { op: 'step'; start: number };
export type Body = { span: Text.Node; ops: Op[]; at: Map<number, number>; unit: Unit; graph: Map<number, Variant[]>; steps: number; known?: number };

export function reduce(it: Interpreter, span: Text.Node, unit: Unit, graph: Map<number, Variant[]>): Body {
  const ops: Op[] = [], at = new Map<number, number>();
  const cursor = it.cursor_of(span);
  let steps = 0;
  for (;;) {
    it.blank(cursor);
    if (cursor.done()) break;
    const start = cursor.cursor, statement = unit.statements.get(start);
    at.set(start, ops.length);
    if (statement === undefined) { ops.push({ op: 'step', start }); steps++; }
    else if (statement.code.op === 'label') ops.push({ op: 'label', start, end: statement.end, rules: statement.rules });
    else if (statement.code.op === 'jump') ops.push({ op: 'jump', start, end: statement.end, rules: statement.rules, statement });
    else ops.push({ op: statement.code.op, start, end: statement.end, rules: statement.rules, statement });
    const end = it.statement_end(cursor, start, it.GLOBAL);
    cursor.cursor = end > start ? end : start + 1;
  }
  return { span, ops, at, unit, graph, steps };
}

// The evaluator back end: the reference a port follows; the JS back end does the same with the statements unrolled.
export function run(it: Interpreter, body: Body, cursor: Text.Node, frame: Node): Node | undefined {
  const begin = cursor.cursor, mark = it.forced.length, ops = body.ops;
  let last: Node | undefined, pc = 0;
  for (;;) {
    it.blank(cursor);
    if (cursor.done()) return last;
    const start = cursor.cursor;
    const index = ops[pc]?.start === start ? pc : body.at.get(start);
    if (index === undefined) return it.read_on(cursor, frame, begin, mark, last);
    const op = ops[index];
    let ran: { value?: Node; jump?: { label: string; site: Text.Node } } | undefined;
    try {
      if (op.op === 'step') ran = it.step(cursor, frame, start, body.graph, body.unit);
      else {
        const rules = it.heads(frame);
        if (op.rules !== rules && it.print(op.rules) !== it.print(rules)) return it.read_on(cursor, frame, begin, mark, last);
        if (op.op === 'label') { cursor.cursor = op.end; ran = {}; }
        else {
          ran = evaluate(it, op.statement, cursor, frame);
          if (ran === undefined) return it.read_on(cursor, frame, begin, mark, last);
          cursor.cursor = op.end;
        }
      }
    } catch (jump) {
      if (!(jump instanceof Jump)) throw jump;
      const to = it.label_at(cursor, begin, jump.label, frame);
      if (to === undefined) { jump.value ??= last; throw jump; }
      if (jump.value !== undefined) last = jump.value;
      if (to < start) it.unforce(mark);
      cursor.cursor = to;
      pc = body.at.get(to) ?? -1;
      continue;
    }
    if (ran.value !== undefined) last = ran.value;
    if (ran.jump !== undefined) {
      const to = it.label_at(cursor, begin, ran.jump.label, frame);
      if (to === undefined) throw Object.assign(new Jump(ran.jump.label, last), { site: ran.jump.site, spelled: true });
      if (to < start) it.unforce(mark);
      cursor.cursor = to;
      pc = body.at.get(to) ?? -1;
      continue;
    }
    pc = index + 1;
  }
}
