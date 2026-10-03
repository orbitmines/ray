import { Text } from './text.ts';
import { env } from './env.ts';
import { Interpreter, Node, Jump, type Native, type Diagnostic } from './interpreter.ts';

// What the runtime gives the language: each `external NAME` is one of these.
const identity: Native = { arity: 1, fn: ({ args: [node] }) => node };
export const Natives: Record<string, Native> = {
  'forward': { arity: 0, fn: (): Node => Object.assign(new Node(), { fn: { arity: 1, raw: true, fn: (): Node | undefined => undefined } }) },
  'define': { arity: 3, fn: ({ interpreter, args: [scope, pattern, body], at }) => interpreter.define_in(scope, pattern, body, at) },
  'rule': { arity: 2, fn: ({ interpreter, frame, args: [pattern, body], at }) => interpreter.rule_from(pattern, body, at, frame) },
  '.': { arity: 0, fn: ({ frame }) => frame.stands ?? frame },
  'global': { arity: 0, fn: ({ interpreter }) => interpreter.GLOBAL },
  'none': { arity: 0, fn: ({ interpreter }) => interpreter.NONE },
  'get': { arity: 2, fn: ({ interpreter, args: [node, key] }) => interpreter.get(node, interpreter.deref(key, false) ?? key) },
  'assign': { arity: 2, fn: ({ interpreter, args: [slot, value] }) => interpreter.assign(slot, value) },
  'declare': { arity: 2, fn: ({ interpreter, frame, args: [slot, value] }) => interpreter.declare(slot, value, frame) },
  // Whether a name is the scope's own: what `:` types rather than declares.
  'own': { arity: 1, fn: ({ interpreter, args: [node] }) => {
    const at = interpreter.location(node);
    if (at?.place === undefined) return interpreter.NONE;
    const held = at.place.member ? at.place.in.own(at.place.name) : at.place.in.own(at.place.name);
    return held !== undefined ? interpreter.GLOBAL : interpreter.NONE;
  } },
  'goto': { arity: 2, fn: ({ interpreter, args: [label, condition] }) => {
    const met = interpreter.deref(condition, false);
    if (met === undefined || met.none) return undefined;
    const spelled = interpreter.deref(label, false) ?? label;
    throw Object.assign(new Jump(interpreter.text(spelled)), { site: spelled.at, spelled: true });
  } },
  'label': { arity: 1, fn: () => undefined },
  'base': { arity: 2, fn: ({ interpreter, args: [node, made] }) => { const target = interpreter.deref(node); if (target) { interpreter.BASE = target; interpreter.made = made; interpreter.version++; } return target; } },
  'where': { arity: 1, fn: ({ interpreter, args: [node], at }) => located(interpreter, node, at) },
  'inline': { arity: 1, fn: ({ interpreter, frame, args: [node] }) => interpreter.inline(node, frame) },
  'bits': { arity: 2, fn: ({ interpreter, frame, args: [node, each], at }) => {
    for (const bit of [...bytes_of(interpreter, node)].flatMap(byte => byte.toString(2).padStart(8, '0').split(''))) {
      const call = interpreter.deref(each);
      const taken = call?.fn?.fn({ interpreter, frame, args: [interpreter.literal_of(bit)], at });
      if (interpreter.deref(taken, false)?.none) break;
    }
    return interpreter.NONE;
  } },
  'time': { arity: 0, fn: ({ interpreter }) => interpreter.literal_of(String(process.hrtime.bigint())) },
  'random': { arity: 0, fn: ({ interpreter }) => env.import<typeof import('crypto')>('crypto').randomInt(2) === 1 ? interpreter.GLOBAL : interpreter.NONE },
  'first': { arity: 1, fn: ({ interpreter, args: [node] }) => first_statement(interpreter, node) },
  'rest': { arity: 1, fn: ({ interpreter, args: [node] }) => rest_of(interpreter, node) },
  'io': { arity: 2, fn: ({ interpreter, args: [location, content] }) => { const given = interpreter.quietly(() => interpreter.deref(content, false)); return io(interpreter, spelling(interpreter, location), given === undefined || given.none ? undefined : spelling(interpreter, content)); } },
  'os': { arity: 1, fn: ({ interpreter, args: [name] }) => { const key = spelling(interpreter, name); const value = key === 'platform' ? process.platform : key === 'architecture' ? process.arch : process.env[key]; return value === undefined ? interpreter.NONE : interpreter.literal_of(value); } },
  'extend': { arity: 2, fn: ({ interpreter, args: [target, node] }) => { const into = interpreter.deref(target); return into ? interpreter.inline(node, into, true) : undefined; } },
  'literal': { arity: 1, fn: ({ interpreter, frame, args: [node] }) => { frame.raw = true; return interpreter.quietly(() => interpreter.deref(node, false)) ?? node; } },
  'unordered': identity,
  'theme': { arity: 2, fn: ({ interpreter, args: [name, block] }) => theme_of(interpreter, name, block) },
  'report': { arity: 3, fn: ({ interpreter, args: [level, variable, comment], at }) => report(interpreter, level, variable, comment, at) },
  '^': { arity: 1, fn: ({ interpreter, args: [name] }) => interpreter.style(interpreter.text(interpreter.quietly(() => interpreter.deref(name, false)) ?? name)) },
  '**': { arity: 1, fn: ({ interpreter, args: [node] }) => program_of(interpreter, node) },
  '=': identity,
};
function read_of(interpreter: Interpreter, bytes: Uint8Array): Node {
  const node = interpreter.literal_of(new TextDecoder().decode(bytes));
  node.bytes = bytes;
  return node;
}
export function bytes_of(interpreter: Interpreter, node: Node): Uint8Array {
  const value = interpreter.quietly(() => interpreter.deref(node, false));
  if (value?.bytes !== undefined) return value.bytes;
  const held = value !== undefined && !value.text ? bits_held(interpreter, value) : undefined;
  if (held !== undefined) return held;
  return new TextEncoder().encode(interpreter.text(value ?? node));
}
function spelling(interpreter: Interpreter, node: Node): string { return new TextDecoder().decode(bytes_of(interpreter, node)); }
function bits_held(interpreter: Interpreter, value: Node): Uint8Array | undefined {
  const read = (of: Node, key: string) => { const held = interpreter.member(of, key); return held === undefined ? undefined : interpreter.quietly(() => interpreter.deref(held, false)); };
  let link = read(value, 'head');
  if (link === undefined || link.none) return undefined;
  const bytes: number[] = [];
  let byte = 0, count = 0;
  while (link !== undefined && !link.none) {
    const bit = read(link, 'value');
    byte = byte * 2 + (bit === undefined || bit.none ? 0 : 1);
    if (++count === 8) { bytes.push(byte); byte = 0; count = 0; }
    link = read(link, 'next');
  }
  return count === 0 ? Uint8Array.from(bytes) : undefined;
}
function io(interpreter: Interpreter, location: string, content: string | undefined): Node {
  const fs = env.fs;
  if (location === 'stdin') return read_of(interpreter, fs.readFileSync(0));
  if (location === 'stdout' || location === 'stderr') { (location === 'stdout' ? process.stdout : process.stderr).write(content ?? ''); return interpreter.NONE; }
  if (content === undefined) return fs.existsSync(location) ? read_of(interpreter, fs.readFileSync(location)) : interpreter.NONE;
  fs.writeFileSync(location, content);
  return interpreter.NONE;
}
function located(interpreter: Interpreter, node: Node, at: Text.Node): Node {
  const value = interpreter.deref(node);
  const position = value?.code?.span ?? value?.at;
  if (position === undefined || position.source.location === undefined) return interpreter.NONE;
  return interpreter.literal_of(`${position.source.location}:${position.begin}`, at);
}
function report(interpreter: Interpreter, level: Node | undefined, variable: Node | undefined, comment: Node | undefined, at: Text.Node): Node | undefined {
  const levels: Record<string, Diagnostic['level']> = { FATAL: 'fatal', ERROR: 'error', WARN: 'warning', INFO: 'info', DEBUG: 'debug', TRACE: 'trace' };
  const target = variable && interpreter.quietly(() => interpreter.deref(variable, false));
  const node = interpreter.written(variable)?.code?.span ?? target?.at ?? variable?.at ?? comment?.at ?? at;
  const said = comment && (interpreter.quietly(() => interpreter.deref(comment, false)) ?? comment);
  interpreter.complain((level !== undefined ? levels[interpreter.text(interpreter.deref(level, false) ?? level)] : undefined) ?? 'error', said ? interpreter.text(said) : '', node);
  return comment;
}
function theme_of(interpreter: Interpreter, name: Node, block: Node): Node {
  const theme = new Node();
  theme.theme = new Map();
  const previous = interpreter.building;
  interpreter.building = theme;
  const frame = new Node(); frame.parent = interpreter.GLOBAL;
  interpreter.inline(block, frame);
  interpreter.building = previous;
  interpreter.theme = theme;
  return theme;
}
export function statements_of(interpreter: Interpreter, span: Text.Node): Text.Node[] {
  const text = span.source.value;
  const inner = interpreter.inner(span) ?? span;
  const out: Text.Node[] = [];
  const cursor = interpreter.cursor_of(inner);
  for (let j = inner.begin; j <= inner.end;) {
    while (j <= inner.end && /\s/.test(text[j])) j++;
    if (j > inner.end) break;
    let end = j;
    while (end <= inner.end && text[end] !== '\n') { const k = interpreter.group_end(text, end, inner.end + 1); end = k > end ? k : end + 1; }
    let last = end - 1;
    while (last >= j && /\s/.test(text[last])) last--;
    if (last >= j) out.push(cursor.span(j, last));
    j = end + 1;
  }
  return out;
}
function program(interpreter: Interpreter, span: Text.Node, frame: Node): Node {
  return Object.assign(new Node(span), { code: { span, in: frame }, program: true });
}
function first_statement(interpreter: Interpreter, node: Node): Node {
  const held = interpreter.deref(node);
  if (held?.code === undefined) return interpreter.NONE;
  const [one] = statements_of(interpreter, held.code.span);
  return one === undefined ? interpreter.NONE : program(interpreter, one, held.code.in);
}
function rest_of(interpreter: Interpreter, node: Node): Node {
  const held = interpreter.deref(node);
  if (held?.code === undefined) return interpreter.NONE;
  const made = statements_of(interpreter, held.code.span);
  if (made.length <= 1) return interpreter.NONE;
  return program(interpreter, made[1].span(made[1].begin, made[made.length - 1].end), held.code.in);
}
function program_of(interpreter: Interpreter, node: Node): Node | undefined {
  let target: Node | undefined = node;
  for (let depth = 0; depth < 64 && target !== undefined; depth++) {
    if (target.program) return target;
    if (target.code !== undefined) {
      const word = target.code.span.string.trim();
      if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word)) { const held = interpreter.lookup(target.code.in, word); if (held !== undefined) { target = held; continue; } }
      return program(interpreter, interpreter.inner(target.code.span) ?? target.code.span, target.code.in);
    }
    if (target.place !== undefined) { target = interpreter.bound(target); continue; }
    return target;
  }
  return target;
}
