import { Text } from './text.ts';
import { env } from './env.ts';
import { Interpreter, Node, Count, type Native, type Diagnostic } from './interpreter.ts';

// What the runtime gives the language: each `external NAME` is one of these.
const identity: Native = { arity: 1, fn: ({ args: [node] }) => node };
export const Natives: Record<string, Native> = {
  'external': { arity: 0, fn: ({ interpreter }) => interpreter.EXTERNAL },
  'forward': { arity: 0, fn: ({ interpreter }) => interpreter.FORWARD },
  'define': { arity: 3, fn: ({ interpreter, args: [scope, pattern, body], at }) => interpreter.define_in(scope, pattern, body, at) },
  'rule': { arity: 2, fn: ({ interpreter, frame, args: [pattern, body], at }) => interpreter.rule(pattern, body, at, frame) },
  'GRAMMAR_RULE': { arity: 0, fn: ({ interpreter, at }) => Object.assign(new Node(interpreter.diagnostics, at), { key: 'GRAMMAR_RULE' }) },
  '.': { arity: 0, fn: ({ frame }) => frame },
  'global': { arity: 0, fn: ({ interpreter }) => interpreter.GLOBAL },
  'get': { arity: 2, pure: true, values: true, fn: ({ interpreter, args: [node, key] }) => interpreter.get(node, key) },
  'assign': { arity: 2, fn: ({ interpreter, args: [slot, value], at }) => interpreter.assign(slot, value, at) },
  'declare': { arity: 2, fn: ({ interpreter, args: [slot, value], at }) => interpreter.assign(slot, value, at, { declare: true }) },
  // Whether a name is the scope's own (or already a value): what `:` types rather than declares.
  'own': { arity: 1, pure: true, fn: ({ interpreter, args: [node] }) => {
    // The name as written, followed through what it is bound to while that
    // is itself a name.
    const written = node.lazy?.frame;
    let cur: Node | undefined = node.lazy !== undefined ? interpreter.reference(node.lazy.frame, node.lazy.span.string.trim(), node.lazy.span) : node;
    for (let depth = 0; cur?.ref !== undefined && depth < 64; depth++) { const held = interpreter.bound(cur); if (held?.ref !== undefined) cur = held; else break; }
    if (cur === undefined || cur.unknown || cur.ref?.scope.unknown) return interpreter.NONE;
    // A name is held where it is written: what is only visible from further
    // out is not this one's, so writing it down here writes a new name down.
    // A name reached through another answers about where that one lives.
    const scope = cur.ref === undefined ? undefined : written !== undefined && cur.ref.key === node.lazy?.span.string.trim() ? written : cur.ref.scope;
    return scope === undefined || scope.own(cur.ref!.key) !== undefined || scope.members?.get(cur.ref!.key) !== undefined ? interpreter.GLOBAL : interpreter.NONE;
  } },
  'goto': { arity: 2, values: true, fn: ({ interpreter, frame, args: [label, condition] }) => interpreter.jump(label, condition, frame) },
  'none': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.NONE },
  'return\\': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.RETURN },
  'recur\\': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.RECUR },
  'label': { arity: 1, pure: true, values: true, fn: ({ interpreter, args: [name] }) => interpreter.labelled(name) },
  'base': { arity: 1, fn: ({ interpreter, args: [node] }) => { const target = interpreter.deref(node); if (target) interpreter.BASE = target; return target; } },
  // Where a thing is written, and whether two texts are the same text: the
  // machine answering about its own, as `bits` answers about its bytes.
  'where': { arity: 1, fn: ({ interpreter, args: [node], at }) => located(interpreter, node, at) },
  'alike': { arity: 2, fn: ({ interpreter, args: [left, right] }) => { const a = interpreter.deref(left) ?? left, b = interpreter.deref(right) ?? right; return a.none || b.none ? interpreter.NONE : interpreter.text(a) === interpreter.text(b) ? interpreter.GLOBAL : interpreter.NONE; } },
  'inline': { arity: 1, fn: ({ interpreter, frame, args: [node] }) => interpreter.inline(node, frame) },
  // What crosses from the machine into the language is a literal: `bits` reads
  // one as its bytes, and the rest are read that way language-side.
  'bits': { arity: 2, fn: ({ interpreter, frame, args: [node, each], at }) => { for (const bit of [...bytes_of(interpreter, node)].flatMap(byte => byte.toString(2).padStart(8, '0').split(''))) { const taken = interpreter.call(each, interpreter.lazy(Text.Node.string(bit), frame, false), at, frame); if (interpreter.deref(taken, false)?.none) break; } return interpreter.NONE; } },
  'time': { arity: 0, fn: ({ interpreter, at }) => interpreter.literal_of(String(process.hrtime.bigint()), at) },
  // One bit from the machine, as this language spells a bit: it is there or
  // it is not. Handed over as a written `0` or `1` it could not be read at
  // all, since a written literal has no equality of its own.
  'random': { arity: 0, fn: ({ interpreter }) => env.import<typeof import('crypto')>('crypto').randomInt(2) === 1 ? interpreter.GLOBAL : interpreter.NONE },
  // The first statement a program is written as, and what is left of it: the
  // chain that holds them is written in the language, not here.
  'first': { arity: 1, fn: ({ interpreter, args: [node] }) => first_statement(interpreter, node) },
  'rest': { arity: 1, fn: ({ interpreter, args: [node] }) => rest_of(interpreter, node) },
  'io': { arity: 2, fn: ({ interpreter, args: [location, content], at }) => { const given = interpreter.diagnostics.muted(() => interpreter.safely(() => interpreter.deref(content, false))); return io(interpreter, spelling(interpreter, location), given === undefined || given.none ? undefined : spelling(interpreter, content), at); } },
  'os': { arity: 1, fn: ({ interpreter, args: [name], at }) => { const key = spelling(interpreter, name); const value = key === 'platform' ? process.platform : key === 'architecture' ? process.arch : process.env[key]; return value === undefined ? interpreter.NONE : interpreter.literal_of(value, at); } },
  'extend': { arity: 2, fn: ({ interpreter, args: [target, node] }) => { const into = interpreter.deref(target); return into ? interpreter.inline(node, into, { compose: true }) : undefined; } },
  'literal': { arity: 1, fn: ({ args: [node] }) => node },
  'unordered': { arity: 1, fn: ({ args: [node] }) => node },
  'theme': { arity: 2, fn: ({ interpreter, args: [name, block], at }) => theme_of(interpreter, name, block, at) },
  'report': { arity: 3, fn: ({ interpreter, args: [level, variable, comment], at }) => report(interpreter, level, variable, comment, at) },
  '^': { arity: 1, fn: ({ interpreter, args: [name] }) => interpreter.style(interpreter.text(name)) },
  '**': { arity: 1, fn: ({ interpreter, args: [node] }) => program_of(interpreter, node) },
  '=': identity,
  'left-to-right': identity,
  'right-to-left': identity,
  '</': identity,
  'call': identity,
};
function read_of(interpreter: Interpreter, bytes: Uint8Array, at: Text.Node): Node {
  const node = interpreter.literal_of(new TextDecoder().decode(bytes), at);
  node.bytes = bytes;
  return node;
}
export function bytes_of(interpreter: Interpreter, node: Node): Uint8Array {
  const written = interpreter.text(node);
  const value = interpreter.diagnostics.muted(() => interpreter.safely(() => interpreter.deref(node, false, false)));
  if (value?.bytes !== undefined) return value.bytes;
  const read = value === undefined || value.literal ? undefined : interpreter.diagnostics.muted(() => interpreter.safely(() => interpreter.deref(node, false)));
  const held = read !== undefined && !read.literal ? bits_held(interpreter, read) : undefined;
  if (held !== undefined) return held;
  return new TextEncoder().encode(written);
}
function spelling(interpreter: Interpreter, node: Node): string {
  return new TextDecoder().decode(bytes_of(interpreter, node));
}
function bits_held(interpreter: Interpreter, value: Node): Uint8Array | undefined {
  const read = (of: Node, key: string) => { const held = of.own(key) ?? of.members?.get(key); return held === undefined ? undefined : interpreter.diagnostics.muted(() => interpreter.safely(() => interpreter.deref(held, false))); };
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
function io(interpreter: Interpreter, location: string, content: string | undefined, at: Text.Node): Node {
  const fs = env.fs;
  if (location === 'stdin') return read_of(interpreter, fs.readFileSync(0), at);
  if (location === 'stdout' || location === 'stderr') { (location === 'stdout' ? process.stdout : process.stderr).write(content ?? ''); return interpreter.NONE; }
  if (content === undefined) return fs.existsSync(location) ? read_of(interpreter, fs.readFileSync(location), at) : interpreter.NONE;
  fs.writeFileSync(location, content);
  return interpreter.NONE;
}
function located(interpreter: Interpreter, node: Node, at: Text.Node): Node {
  const value = interpreter.deref(node);
  if (value?.key?.startsWith('#') && !value.literal) return interpreter.literal_of(value.key, at);
  const position = value?.position ?? value?.body ?? value?.lazy?.span;
  if (position === undefined || position.source.location === undefined) return interpreter.NONE;
  return interpreter.literal_of(`${position.source.location}:${position.begin}`, at);
}
function report(interpreter: Interpreter, level: Node | undefined, variable: Node | undefined, comment: Node | undefined, at?: Text.Node): Node | undefined {
  const levels: Record<string, Diagnostic['level']> = { FATAL: 'fatal', ERROR: 'error', WARN: 'warning', INFO: 'info', DEBUG: 'debug', TRACE: 'trace' };
  const target = variable && interpreter.resolved(variable);
  const node = target?.position ?? variable?.position ?? comment?.position ?? at;
  if (node) interpreter.complain((level !== undefined ? levels[interpreter.text(level)] : undefined) ?? 'error', comment ? interpreter.text(comment) : '', node);
  return comment;
}
function theme_of(interpreter: Interpreter, name: Node, block: Node, at: Text.Node): Node {
  const theme = new Node(interpreter.diagnostics, at);
  theme.theme = new Map(); theme.key = interpreter.text(name);
  const previous = interpreter.building;
  interpreter.building = theme;
  interpreter.inline(block, interpreter.frame(interpreter.GLOBAL, `theme@${interpreter.anchor(at)}`, interpreter.GLOBAL));
  interpreter.building = previous;
  return theme;
}
export function statements_of(interpreter: Interpreter, span: Text.Node): Text.Node[] {
  let text = span.source.value, end = span.end + 1;
  // A span that is one group all the way through is read as what the group
  // holds: what is written between the brackets is the statements.
  let from = span.begin;
  while (from < end) {
    let first = from; while (first < end && /\s/.test(text[first])) first++;
    const close = interpreter.group_end(text, first, end);
    if (close <= first || close < end) break;
    let last = close - 2; while (last > first && /\s/.test(text[last])) last--;
    if (last <= first) break;
    from = first + 1; end = last + 1; span = span.span(from, end - 1);
  }
  const out: Text.Node[] = [];
  let begin = -1;
  const close_at = (j: number) => { const k = interpreter.group_end(text, j, end); return k > j ? k : -1; };
  for (let j = from; j < end;) {
    if (text[j] === '\n') {
      if (begin >= 0) { let last = j - 1; while (last >= begin && /\s/.test(text[last])) last--; if (last >= begin) out.push(span.span(begin, last)); }
      begin = -1; j++; continue;
    }
    const grouped = close_at(j);
    if (grouped > 0) { if (begin < 0) begin = j; j = grouped; continue; }
    if (begin < 0 && !/\s/.test(text[j])) begin = j;
    j++;
  }
  if (begin >= 0) { let last = end - 1; while (last >= begin && /\s/.test(text[last])) last--; if (last >= begin) out.push(span.span(begin, last)); }
  return out;
}
function written_as(interpreter: Interpreter, span: Text.Node, frame: Node): Node {
  const one = new Node(interpreter.diagnostics, span);
  one.body = span; one.closure = frame; one.params = [];
  return one;
}
function first_statement(interpreter: Interpreter, node: Node): Node {
  const program = interpreter.deref(node);
  const span = program?.body;
  if (span === undefined) return interpreter.NONE;
  const [one] = statements_of(interpreter, span);
  return one === undefined ? interpreter.NONE : written_as(interpreter, one, program!.closure ?? interpreter.GLOBAL);
}
function rest_of(interpreter: Interpreter, node: Node): Node {
  const program = interpreter.deref(node);
  const span = program?.body;
  if (span === undefined) return interpreter.NONE;
  const made = statements_of(interpreter, span);
  if (made.length <= 1) return interpreter.NONE;
  // From the second statement to where the last one ends: what closed the
  // group is not a statement, and carrying it would make one of it.
  return written_as(interpreter, span.span(made[1].begin, made[made.length - 1].end), program!.closure ?? interpreter.GLOBAL);
}
function program_of(interpreter: Interpreter, node: Node): Node | undefined {
  const target = interpreter.written(node);
  if (!target?.lazy) return interpreter.deref(node);
  target.lazy.consumed = true;
  const inner = interpreter.inner(target.lazy.span, target.lazy.frame) ?? target.lazy.span;
  const made = written_as(interpreter, inner, target.lazy.frame);
  made.written = true;
  return made;
}
