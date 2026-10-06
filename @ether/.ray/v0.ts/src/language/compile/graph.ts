import type { Text } from '../text.ts';
import type { Interpreter, Match, Native, Node, Rule } from '../interpreter.ts';

export type Event =
  | { k: 'heads'; frame?: Node; parent?: Node; sees?: Node[]; print?: object }
  | { k: 'declared'; declared: number }
  | { k: 'named' | 'whole'; end: number; owned: object; on: object }
  | { k: 'self'; mine?: object; rules?: object; on?: object }
  | { k: 'unbound'; name: string; unbound: boolean }
  | { k: 'fire'; match: Match; receiver: 'none' | 'self' | 'value'; occurrence: number; at?: number }
  | { k: 'place'; end: number }
  | { k: 'break' }
  | { k: 'call' | 'raw'; fn: Native }
  | { k: 'reader' | 'target'; fn: Native | undefined }
  | { k: 'on'; mine: object; rules: object; on: object }
  | { k: 'unexpected' };

export type Variant = { events: Event[]; valid: boolean; runs?: number; compiled?: Compiled };
export type Replayed = { value: Node | undefined } | { diverged: Node | undefined } | 'missed';
export type Compiled = (it: Interpreter, cursor: Text.Node, frame: Node) => Replayed;

export function replay(it: Interpreter, variant: Variant, cursor: Text.Node, frame: Node): Replayed {
  if (variant.compiled !== undefined) return variant.compiled(it, cursor, frame);
  if ((variant.runs = (variant.runs ?? 0) + 1) >= 16) variant.compiled = compile(variant.events);
  return evaluate(it, variant.events, cursor, frame);
}

export function heads_like(it: Interpreter, frame: Node, event: { frame?: Node; parent?: Node; sees?: Node[]; print?: object }): boolean {
  if (event.frame !== undefined) return frame === event.frame;
  if (event.print === undefined ? frame.rules?.length : !frame.rules?.length || it.print(frame.rules) !== event.print) return false;
  if (frame.parent !== event.parent && !it.like(frame.parent, event.parent)) return false;
  const sees = frame.sees, expected = event.sees;
  if (expected === undefined) return sees === undefined || sees.length === 0;
  if (sees === undefined || sees.length !== expected.length) return false;
  for (let n = 0; n < sees.length; n++) if (sees[n] !== expected[n] && !it.like(sees[n], expected[n])) return false;
  return true;
}

function same_sees(sees: Node[] | undefined, expected: Node[] | undefined): boolean {
  if (expected === undefined) return sees === undefined || sees.length === 0;
  if (sees === undefined || sees.length !== expected.length) return false;
  for (let n = 0; n < sees.length; n++) if (sees[n] !== expected[n]) return false;
  return true;
}

function evaluate(it: Interpreter, events: Event[], cursor: Text.Node, frame: Node): Replayed {
  const text = cursor.source.value, start = cursor.cursor;
  let value: Node | undefined, acted = false, self: Node | undefined, place: Node | undefined;
  for (let e = 0; e < events.length; e++) {
    const event = events[e];
    if (acted && (event.k === 'heads' ? value !== undefined : (event.k === 'call' || event.k === 'raw' || event.k === 'reader' || event.k === 'on' || event.k === 'target') && value === undefined)) return acted ? { diverged: value } : 'missed';
    switch (event.k) {
      case 'heads':
        if (!heads_like(it, frame, event)) return acted ? { diverged: value } : 'missed';
        break;
      case 'named': case 'whole': {
        const at = it.place(frame, cursor.span(start, event.end - 1));
        if (!it.tried(() => { const shape = it.shape(at); return it.print(shape.rules) === event.owned && it.print(shape.on) === event.on; })) return acted ? { diverged: value } : 'missed';
        if (event.k === 'named' || place === undefined) place = at;
        break;
      }
      case 'self': {
        self = it.holding_at(cursor.source, start)?.found.receiver ?? (frame === it.GLOBAL || frame.bare ? undefined : frame);
        if ((self === undefined) !== (event.mine === undefined)) return acted ? { diverged: value } : 'missed';
        if (self !== undefined) {
          const shape = it.shape(self);
          if (it.print(shape.mine) !== event.mine || it.print(shape.rules) !== event.rules || it.print(shape.on) !== event.on) return acted ? { diverged: value } : 'missed';
        }
        break;
      }
      case 'declared':
        if (it.declared !== event.declared) return acted ? { diverged: value } : 'missed';
        break;
      case 'unbound':
        if ((it.quietly(() => it.lookup(frame, event.name)) === undefined) !== event.unbound) return acted ? { diverged: value } : 'missed';
        break;
      case 'fire': {
        const receiver = event.receiver === 'self' ? self : event.receiver === 'value' ? value : undefined;
        const match = it.resolve(event.match, event.receiver, event.occurrence, frame, receiver);
        if (match === undefined) return acted ? { diverged: value } : 'missed';
        acted = true;
        if (event.at !== undefined) { cursor.cursor = event.at; it.fire(match, cursor, frame); }
        else value = it.fire(match, cursor, frame);
        break;
      }
      case 'place': {
        const at = place !== undefined && place.at!.end === event.end - 1 ? place : it.place(frame, cursor.span(start, event.end - 1));
        it.paint_place(at);
        cursor.cursor = event.end;
        value = at;
        acted = true;
        break;
      }
      case 'break': return { value };
      case 'call': case 'raw': {
        const reader = it.deref(value, false);
        if (reader?.fn !== event.fn) return acted ? { diverged: value } : 'missed';
        acted = true;
        if (event.k === 'raw') cursor.cursor = it.spaces(cursor, cursor.cursor);
        value = it.call(reader!, cursor, frame);
        break;
      }
      case 'reader': {
        const reader = it.deref(value, false);
        if (reader?.fn !== event.fn) return acted ? { diverged: value } : 'missed';
        break;
      }
      case 'on': {
        const shape = it.shape(value!);
        if (it.print(shape.mine) !== event.mine || it.print(shape.rules) !== event.rules || it.print(shape.on) !== event.on) return acted ? { diverged: value } : 'missed';
        break;
      }
      case 'target': {
        const target = it.deref(value);
        if (target?.fn !== event.fn) return acted ? { diverged: value } : 'missed';
        if (target?.fn !== undefined && target.fn.arity > 0) { acted = true; cursor.cursor = it.spaces(cursor, cursor.cursor); value = it.call(target, cursor, frame); }
        break;
      }
      case 'unexpected': {
        const at = it.spaces(cursor, cursor.cursor), end = it.statement_end(cursor, at, frame);
        it.error(`Unexpected \`${text.slice(at, end)}\`.`, cursor.span(at, Math.max(at, end - 1)));
        cursor.cursor = end;
        return { value };
      }
    }
  }
  return { value };
}

function compile(events: Event[]): Compiled {
  const C: unknown[] = [];
  const k = (x: unknown) => { C.push(x); return `C[${C.length - 1}]`; };
  const out: string[] = ['const start = cursor.cursor; let value, self, place, shape, reader, target, tv, ts;'];
  let acted = false, returned = false;
  const miss = () => acted ? 'return { diverged: value };' : "return 'missed';";
  for (const event of events) {
    if (acted && event.k === 'heads') out.push(`if (value !== undefined) ${miss()}`);
    if (acted && (event.k === 'call' || event.k === 'raw' || event.k === 'reader' || event.k === 'on' || event.k === 'target')) out.push(`if (value === undefined) ${miss()}`);
    switch (event.k) {
      case 'heads':
        out.push(`if (!heads_like(it, frame, ${k(event)})) ${miss()}`);
        break;
      case 'named': case 'whole': {
        out.push(`{ const at = ${k(undefined)} ??= it.stable(cursor.span(start, ${event.end - 1})); if (!it.tried(() => { const s = it.shape_of(it.deref_name(frame, at)); return it.print(s.rules) === ${k(event.owned)} && it.print(s.on) === ${k(event.on)}; })) ${miss()} ${event.k === 'named' ? 'place = at;' : 'if (place === undefined) place = at;'} }`);
        break;
      }
      case 'self':
        out.push(`self = it.holding_at(cursor.source, start)?.found.receiver ?? (frame === it.GLOBAL || frame.bare ? undefined : frame);`);
        if (event.mine === undefined) out.push(`if (self !== undefined) ${miss()}`);
        else out.push(`if (self === undefined) ${miss()} ts = [self.place !== undefined || self.code !== undefined ? it.deref(self, false) : self]; shape = it.shape_of(ts[0]); if (it.print(shape.mine) !== ${k(event.mine)} || it.print(shape.rules) !== ${k(event.rules)} || it.print(shape.on) !== ${k(event.on)}) ${miss()}`);
        break;
      case 'declared': out.push(`if (it.declared !== ${event.declared}) ${miss()}`); break;
      case 'unbound': out.push(`if ((it.quietly(() => it.lookup(frame, ${JSON.stringify(event.name)})) === undefined) !== ${event.unbound}) ${miss()}`); break;
      case 'fire': {
        const match = k(event.match);
        const t = event.receiver === 'self' ? 'ts' : event.receiver === 'value' ? '(tv ??= [it.deref(value, false)])' : 'undefined';
        const span = `(${k(undefined)} ??= cursor.span(${event.match.begin}, ${event.match.end - 1}))`;
        out.push(`{ const m = it.resolve(${match}, '${event.receiver}', ${event.occurrence}, frame, ${event.receiver === 'self' ? 'self' : event.receiver === 'value' ? 'value' : 'undefined'}, ${t}); if (m === undefined) ${miss()} ${event.at !== undefined ? `cursor.cursor = ${event.at}; it.fire(m, cursor, frame, ${t}, ${span});` : `value = it.fire(m, cursor, frame, ${t}, ${span}); tv = undefined;`} }`);
        acted = true;
        break;
      }
      case 'place':
        out.push(`{ const at = it.place(frame, place !== undefined && place.end === ${event.end - 1} ? place : ${k(undefined)} ??= it.stable(cursor.span(start, ${event.end - 1}))); it.paint_place(at); cursor.cursor = ${event.end}; value = at; tv = undefined; }`);
        acted = true;
        break;
      case 'break': out.push('return { value };'); returned = true; break;
      case 'call': case 'raw':
        out.push(`reader = (tv ??= [it.deref(value, false)])[0]; if (reader?.fn !== ${k(event.fn)}) ${miss()}`);
        acted = true;
        out.push(`${event.k === 'raw' ? 'cursor.cursor = it.spaces(cursor, cursor.cursor); ' : ''}value = it.call(reader, cursor, frame); tv = undefined;`);
        break;
      case 'reader': out.push(`reader = (tv ??= [it.deref(value, false)])[0]; if (reader?.fn !== ${k(event.fn)}) ${miss()}`); break;
      case 'on': out.push(`shape = it.shape_of((tv ??= [it.deref(value, false)])[0]); if (it.print(shape.mine) !== ${k(event.mine)} || it.print(shape.rules) !== ${k(event.rules)} || it.print(shape.on) !== ${k(event.on)}) ${miss()}`); break;
      case 'target':
        out.push(`target = it.deref(value); if (target?.fn !== ${k(event.fn)}) ${miss()}`);
        if (event.fn !== undefined && event.fn.arity > 0) { out.push('cursor.cursor = it.spaces(cursor, cursor.cursor); value = it.call(target, cursor, frame); tv = undefined;'); acted = true; }
        break;
      case 'unexpected':
        out.push('{ const at = it.spaces(cursor, cursor.cursor), end = it.statement_end(cursor, at, frame); it.error(`Unexpected \\`${cursor.source.value.slice(at, end)}\\`.`, cursor.span(at, Math.max(at, end - 1))); cursor.cursor = end; return { value }; }');
        returned = true;
        break;
    }
    if (returned) break;
  }
  if (!returned) out.push('return { value };');
  return new Function('C', 'heads_like', `return (it, cursor, frame) => { ${out.join('\n')} };`)(C, heads_like) as Compiled;
}
