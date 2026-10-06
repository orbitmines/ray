import type { Text } from '../text.ts';
import type { Interpreter, Match, Node, Rule } from '../interpreter.ts';
import type { Called, Unit } from './ir.ts';

export function applied(it: Interpreter, unit: Unit, start: number, found: Match, rules: Rule[]) {
  const { rule, captures } = found;
  if (rule.direct === undefined) return;
  if (rule.native === 'label') {
    const name = rule.direct.length !== 1 ? undefined : captures.get(rule.direct[0].string)?.string ?? found.receiver?.place?.name;
    if (name === undefined) return;
    unit.statements.set(start, { end: found.end, rules, code: { op: 'label', name } });
    if (!unit.labels.has(name)) unit.labels.set(name, start);
    return;
  }
  if (found.begin !== start || found.receiver !== undefined || rule.native !== 'goto' || rule.direct.length !== 2) return;
  const [target, condition] = rule.direct.map(word => word.string);
  const site = captures.get(target);
  if (site === undefined || !rule.pattern.some(piece => piece.kind === 'capture' && piece.name === target && piece.raw)) return;
  const given = captures.get(condition);
  if (given === undefined && rule.pattern.some(piece => piece.kind === 'capture' && piece.name === condition)) return;
  if (given === undefined && it.quietly(() => it.deref(it.lazy(rule.direct![1], rule.closure), false)) !== it.GLOBAL) return;
  unit.statements.set(start, { end: found.end, rules, code: { op: 'jump', label: site.string, site, condition: given } });
}

export function called(it: Interpreter, unit: Unit, start: number, end: number, calls: Called[], rules: Rule[], head: Text.Node, frame: import('../interpreter.ts').Node) {
  const value = it.quietly(() => it.deref(it.place(frame, head), false));
  if (value !== undefined && value.fn === calls[0].native) unit.statements.set(start, { end, rules, code: { op: 'natives', head, value, calls } });
}

export function named(it: Interpreter, unit: Unit, start: number, end: number, value: Node | undefined, rules: Rule[], cursor: Text.Node) {
  const place = value?.place;
  if (place === undefined || place.member || value!.at?.begin !== start || value!.at.end !== end - 1) return;
  if (!/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(cursor.source.value.slice(start, end))) return;
  unit.statements.set(start, { end, rules, code: { op: 'name' } });
}
