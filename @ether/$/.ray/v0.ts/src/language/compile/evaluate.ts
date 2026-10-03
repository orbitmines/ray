import type { Text } from '../text.ts';
import type { Interpreter, Node, NameGuard } from '../interpreter.ts';
import { Natives } from '../natives.ts';
import type { Called, Statement } from './ir.ts';

export type Ran = { value?: Node; jump?: { label: string; site: Text.Node } } | undefined;

export function evaluate(it: Interpreter, statement: Statement, cursor: Text.Node, frame: Node): Ran {
  const code = statement.code;
  switch (code.op) {
    case 'label': return {};
    case 'jump': {
      const met = code.condition === undefined ? it.GLOBAL : it.deref(it.lazy(code.condition, frame), false);
      return met !== undefined && !met.none ? { jump: { label: code.label, site: code.site } } : {};
    }
    case 'natives': {
      let target = it.deref(it.place(frame, (code as { stable?: Text.Node }).stable ??= it.stable(code.head)), false), value: Node | undefined;
      if (target !== code.value) return undefined;
      for (const call of code.calls) {
        if (target?.fn !== call.native) return undefined;
        const args = call.spans.map((span, k) => k === 0 && call.native.raw ? it.literal(span) : word(it, call, k, span, frame) ?? it.lazy(span, frame));
        value = call.native.fn({ interpreter: it, frame, args, at: call.at });
        target = value === undefined ? undefined : it.deref(value, false);
      }
      return { value };
    }
    case 'name': {
      return it.only_a_name(cursor, frame, statement.rules, statement as { guard?: NameGuard }) ? { value: it.place(frame, (statement as { span?: Text.Node }).span ??= it.stable(cursor.span(cursor.cursor, statement.end - 1))) } : undefined;
    }
  }
}


let placed: Set<unknown> | undefined;
const identifier = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
type Words = { words?: (Text.Node | null)[]; guards?: { guard?: NameGuard }[] };
function word(it: Interpreter, call: Called & Words, k: number, span: Text.Node, frame: Node): Node | undefined {
  if (!(placed ??= new Set([Natives.declare, Natives.assign, Natives.own, Natives.get, Natives.goto, Natives.label])).has(call.native)) return undefined;
  const cursors = (call.words ??= []);
  let cursor = cursors[k];
  if (cursor === undefined) cursors[k] = cursor = identifier.test(span.string) ? it.cursor_of(it.stable(span)) : null;
  if (cursor === null) return undefined;
  cursor.cursor = span.begin;
  const held = ((call.guards ??= [])[k] ??= {});
  return it.only_a_name(cursor, frame, it.heads(frame), held) ? it.place(frame, span) : undefined;
}
