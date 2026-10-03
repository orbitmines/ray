import type { Text } from '../text.ts';
import { Jump, type Interpreter, type Node } from '../interpreter.ts';
import type { Statement } from './ir.ts';

export type Ran = { value?: Node } | undefined;

export function evaluate(it: Interpreter, statement: Statement, cursor: Text.Node, frame: Node): Ran {
  const code = statement.code;
  switch (code.op) {
    case 'pass': return {};
    case 'jump': {
      const met = code.condition === undefined ? it.GLOBAL : it.deref(it.lazy(code.condition, frame), false);
      if (met !== undefined && !met.none) throw Object.assign(new Jump(code.label), { site: code.site, spelled: true });
      return {};
    }
    case 'natives': {
      let target = it.deref(it.place(frame, code.head), false), value: Node | undefined;
      if (target !== code.value) return undefined;
      for (const call of code.calls) {
        if (target?.fn !== call.native) return undefined;
        const args = call.spans.map((span, k) => k === 0 && call.native.raw ? it.literal(span) : it.lazy(span, frame));
        value = call.native.fn({ interpreter: it, frame, args, at: cursor.span(call.end, call.end) });
        target = value === undefined ? undefined : it.deref(value, false);
      }
      return { value };
    }
  }
}
