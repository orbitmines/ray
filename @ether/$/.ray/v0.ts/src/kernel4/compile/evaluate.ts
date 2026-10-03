import type { Text } from '../text.ts';
import type { Interpreter, Node } from '../interpreter.ts';
import type { Statement } from './ir.ts';

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
      let target = it.deref(it.place(frame, code.head), false), value: Node | undefined;
      if (target !== code.value) return undefined;
      for (const call of code.calls) {
        if (target?.fn !== call.native) return undefined;
        const args = call.spans.map((span, k) => k === 0 && call.native.raw ? it.literal(span) : it.lazy(span, frame));
        value = call.native.fn({ interpreter: it, frame, args, at: call.at });
        target = value === undefined ? undefined : it.deref(value, false);
      }
      return { value };
    }
  }
}
