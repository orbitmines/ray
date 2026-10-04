import type { Text } from '../text.ts';
import { Jump, type Interpreter, type Node, type Rule } from '../interpreter.ts';
import type { Variant } from './graph.ts';
import type { Statement, Unit } from './ir.ts';
import { evaluate } from './evaluate.ts';

// A rule's body reduced on its own side: one instruction per statement, run as indices instead of re-read.
// A statement recorded as a label, a jump, a native chain or a name runs as that; any other is one step of the reader.
export type Op =
  | { op: 'label'; start: number; end: number; next: number; rules: Rule[] }
  | { op: 'jump' | 'natives' | 'name'; start: number; end: number; next: number; rules: Rule[]; statement: Statement }
  | { op: 'step'; start: number };
export type Body = { span: Text.Node; ops: Op[]; at: Map<number, number>; unit: Unit; graph: Map<number, Variant[]> };

export function reduce(it: Interpreter, span: Text.Node, unit: Unit, graph: Map<number, Variant[]>): Body {
  const ops: Op[] = [], at = new Map<number, number>();
  const cursor = it.cursor_of(span);
  for (;;) {
    it.blank(cursor);
    if (cursor.done()) break;
    const start = cursor.cursor, statement = unit.statements.get(start);
    at.set(start, ops.length);
    if (statement === undefined) ops.push({ op: 'step', start });
    else if (statement.code.op === 'label') ops.push({ op: 'label', start, end: statement.end, next: -1, rules: statement.rules });
    else ops.push({ op: statement.code.op, start, end: statement.end, next: -1, rules: statement.rules, statement });
    const end = it.statement_end(cursor, start, it.GLOBAL);
    cursor.cursor = end > start ? end : start + 1;
  }
  for (const op of ops) {
    if (op.op === 'step') continue;
    cursor.cursor = op.end;
    it.blank(cursor);
    op.next = cursor.done() ? ops.length : at.get(cursor.cursor) ?? -1;
  }
  return { span, ops, at, unit, graph };
}

// The evaluator back end, and the reference a port follows.
export function run(it: Interpreter, body: Body, cursor: Text.Node, frame: Node): Node | undefined {
  const begin = cursor.cursor, mark = it.forced.length, ops = body.ops, count = ops.length;
  let last: Node | undefined, index = count > 0 && ops[0].start === begin ? 0 : -1, rules: Rule[] | undefined, layout = -1;
  if (index < 0) { it.blank(cursor); if (cursor.done()) return undefined; index = body.at.get(cursor.cursor) ?? -1; }
  for (;;) {
    if (index === count) { cursor.cursor = cursor.limit; return last; }
    if (index < 0) return it.read_on(cursor, frame, begin, mark, last);
    const op = ops[index], start = op.start;
    cursor.cursor = start;
    let ran: { value?: Node; jump?: { label: string; site: Text.Node } } | undefined;
    try {
      if (op.op === 'step') {
        const variants = body.graph.get(start);
        const only = variants !== undefined && variants.length === 1 && variants[0].valid && body.unit.statements.get(start) === undefined ? variants[0] : undefined;
        const direct = only?.compiled === undefined ? undefined : only.compiled(it, cursor, frame);
        if (direct === undefined || direct === 'missed') { cursor.cursor = start; ran = it.step(cursor, frame, start, body.graph, body.unit); }
        else if ('diverged' in direct) { ran = { value: it.statement(cursor, frame, direct.diverged) }; if (cursor.cursor === start) cursor.advance(); }
        else { ran = { value: direct.value }; if (cursor.cursor === start) cursor.advance(); }
        layout = -1;
      } else {
        if (layout !== (frame.layout ?? 0) || rules === undefined) { rules = it.heads(frame); layout = frame.layout ?? 0; }
        if (op.rules !== rules && it.print(op.rules) !== it.print(rules)) return it.read_on(cursor, frame, begin, mark, last);
        if (op.op === 'label') ran = undefined;
        else {
          ran = evaluate(it, op.statement, cursor, frame);
          if (ran === undefined) return it.read_on(cursor, frame, begin, mark, last);
        }
        cursor.cursor = op.end;
      }
    } catch (jump) {
      if (!(jump instanceof Jump)) throw jump;
      const to = it.label_at(cursor, begin, jump.label, frame);
      if (to === undefined) { jump.value ??= last; throw jump; }
      if (jump.value !== undefined) last = jump.value;
      if (to < start) it.unforce(mark);
      cursor.cursor = to;
      index = body.at.get(to) ?? -1;
      continue;
    }
    if (ran !== undefined) {
      if (ran.value !== undefined) last = ran.value;
      if (ran.jump !== undefined) {
        const to = it.label_at(cursor, begin, ran.jump.label, frame);
        if (to === undefined) throw Object.assign(new Jump(ran.jump.label, last), { site: ran.jump.site, spelled: true });
        if (to < start) it.unforce(mark);
        cursor.cursor = to;
        index = body.at.get(to) ?? -1;
        continue;
      }
    }
    if (op.op !== 'step') { index = op.next; continue; }
    it.blank(cursor);
    if (cursor.done()) return last;
    index = body.at.get(cursor.cursor) ?? -1;
  }
}
