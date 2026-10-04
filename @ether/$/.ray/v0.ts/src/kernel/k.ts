import { Graph, INT, SLOT, edge } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, BLOCK, CELL, NATIVE, NONE, GLOBAL, arities, type Native, type Catches } from './vm.ts';

// The kernel language, written the way Ray is: functions `name (params) => ( … )` over cells, compiled to the graph the machine runs.
//
//   fib (n) => (
//     if n < 2 { return n }
//     return fib(n - 1) + fib(n - 2)
//   )
//
// Statements: `x := e`, `x = e`, `e`, `if e { … } elsif e { … } else { … }`, `while e { … }`, `goto L`, `goto L if e`, `L\`, `return e`.
// Expressions: numbers, `None`, `global`, "strings" (interned), names (cells, or a function as a value), `f(args)`, `external name args…`,
// `… catch e { … }` after a call statement: what the call throws lands in `e` and the block runs instead.
// `!e`, `-e`, `* / %`, `+ -`, `< <= > >= == !=`, `and`, `or` (the last two do not read their right side when the left decides).
// `return a, b, c` answers more than one value; `x, y, z := f(…)` takes them.
// Records: `Rule := { pieces, closure, … }` names the fields of a record in memory (field names are unique); `Rule` is its size,
// `x.closure` reads a field and `x.closure = v` writes it; `x[i]` and `x[i] = v` index; 'c' is a character's code.

type Expr = { kind: 'load'; of: Expr; field?: string; at?: Expr } | { kind: 'int'; value: number } | { kind: 'none' } | { kind: 'true' } | { kind: 'string'; value: string } | { kind: 'name'; name: string } | { kind: 'call'; name: string; args: Expr[] } | { kind: 'and' | 'or'; left: Expr; right: Expr };
type Caught = { name: string; body: Stmt[] };
type Stmt =
  | { kind: 'set'; name: string; value: Expr; caught?: Caught }
  | { kind: 'do'; value: Expr; caught?: Caught }
  | { kind: 'store'; target: Expr & { kind: 'load' }; value: Expr }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] }
  | { kind: 'while'; cond: Expr; body: Stmt[] }
  | { kind: 'goto'; label: string; cond?: Expr }
  | { kind: 'label'; name: string }
  | { kind: 'return'; value?: Expr; more?: Expr[] }
  | { kind: 'results'; names: string[]; value: Expr; caught?: Caught };
type Fn = { name: string; params: string[]; body: Stmt[] };

function tokens(source: string): string[] {
  return source.replace(/\/\/[^\n]*/g, '').match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'|[A-Za-z_][A-Za-z0-9_]*\\?|\d+|:=|=>|==|!=|<=|>=|[-+*\/%<>!{}()\[\]=,;.\n]/g) ?? [];
}

const binary: Record<string, [number, string]> = { 'or': [1, 'or'], 'and': [2, 'and'], '==': [3, 'eq'], '!=': [3, 'ne'], '<': [3, 'lt'], '<=': [3, 'le'], '>': [3, 'gt'], '>=': [3, 'ge'], '+': [4, 'add'], '-': [4, 'sub'], '*': [5, 'mul'], '/': [5, 'div'], '%': [5, 'mod'] };

export type Records = Map<string, string[]>;

export function parse(source: string, records: Records = new Map()): Fn[] {
  const t = tokens(source);
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const expect = (x: string) => { if (t[i] !== x) throw new Error(`expected ${x} at token ${i} (${t[i]}), after ${t.slice(Math.max(0, i - 12), i).join(' ')}`); i++; };
  const lines = () => { while (t[i] === '\n' || t[i] === ';') i++; };
  const ends = (x: string | undefined) => x === undefined || x === '\n' || x === ';' || x === ')' || x === ']' || x === ',' || x === '{' || x === '}' || x === 'if' || x === '=' || x === 'catch' || binary[x] !== undefined;
  const atom = (): Expr => {
    let e = primary();
    for (;;) {
      if (peek() === '.') { next(); e = { kind: 'load', of: e, field: next() }; continue; }
      if (peek() === '[') { next(); const at = expr(); expect(']'); e = { kind: 'load', of: e, at }; continue; }
      return e;
    }
  };
  const primary = (): Expr => {
    const x = next();
    if (x.startsWith("'")) return { kind: 'int', value: JSON.parse('"' + x.slice(1, -1).replace(/"/g, '\\"') + '"').charCodeAt(0) };
    if (x === '(') { const e = expr(); expect(')'); return e; }
    if (x === '!') return { kind: 'call', name: 'not', args: [atom()] };
    if (x === '-') { const e = atom(); return e.kind === 'int' ? { kind: 'int', value: -e.value } : { kind: 'call', name: 'sub', args: [{ kind: 'int', value: 0 }, e] }; }
    if (/^\d+$/.test(x)) return { kind: 'int', value: Number(x) };
    if (x.startsWith('"')) return { kind: 'string', value: JSON.parse(x) };
    if (x === 'external') {
      const name = next(), args: Expr[] = [];
      while (!ends(peek())) args.push(atom());
      return { kind: 'call', name, args };
    }
    if (peek() === '(') {
      next();
      const args: Expr[] = [];
      while (peek() !== ')') { args.push(expr()); if (peek() === ',') next(); }
      next();
      return { kind: 'call', name: x, args };
    }
    if (x === 'None') return { kind: 'none' };
    if (x === 'global') return { kind: 'true' };
    if (x === undefined || !/^[A-Za-z_]/.test(x)) throw new Error(`unexpected ${x} at token ${i - 1}, after ${t.slice(Math.max(0, i - 12), i - 1).join(' ')}`);
    return { kind: 'name', name: x };
  };
  const expr = (level = 1): Expr => {
    let left = atom();
    for (;;) {
      const op = binary[peek()];
      if (op === undefined || op[0] < level) return left;
      next();
      lines();
      const right = expr(op[0] + 1);
      left = op[1] === 'and' || op[1] === 'or' ? { kind: op[1], left, right } : { kind: 'call', name: op[1], args: [left, right] };
    }
  };
  const block = (): Stmt[] => {
    expect('{');
    const out: Stmt[] = [];
    for (lines(); peek() !== '}'; lines()) out.push(stmt());
    next();
    return out;
  };
  const conditional = (): Stmt => {
    const cond = expr(), then = block();
    let otherwise: Stmt[] = [];
    if (peek() === 'elsif') { next(); otherwise = [conditional()]; }
    else if (peek() === 'else') { next(); otherwise = block(); }
    return { kind: 'if', cond, then, else: otherwise };
  };
  const caught = (): Caught | undefined => { if (peek() !== 'catch') return undefined; next(); const name = next(); return { name, body: block() }; };
  const stmt = (): Stmt => {
    const x = peek();
    if (x === 'return') {
      next();
      if (ends(peek()) && peek() !== '-' && peek() !== '!') return { kind: 'return' };
      const value = expr(), more: Expr[] = [];
      while (peek() === ',') { next(); more.push(expr()); }
      return { kind: 'return', value, more };
    }
    if (t[i + 1] === ',' && /^[A-Za-z_]/.test(x)) {
      const names: string[] = [];
      while (true) { names.push(next()); if (peek() !== ',') break; next(); }
      if (peek() !== ':=' && peek() !== '=') throw new Error(`expected := after ${names.join(', ')}`);
      next();
      const value = expr();
      return { kind: 'results', names, value, caught: caught() };
    }
    if (x === 'goto') { next(); const label = next(); if (peek() === 'if') { next(); return { kind: 'goto', label, cond: expr() }; } return { kind: 'goto', label }; }
    if (x === 'while') { next(); const cond = expr(); return { kind: 'while', cond, body: block() }; }
    if (x === 'if') { next(); return conditional(); }
    if (x.endsWith('\\')) { next(); return { kind: 'label', name: x.slice(0, -1) }; }
    if (t[i + 1] === ':=' || t[i + 1] === '=') { next(); next(); const value = expr(); return { kind: 'set', name: x, value, caught: caught() }; }
    const value = expr();
    if (peek() === '=' && value.kind === 'load') { next(); return { kind: 'store', target: value, value: expr() }; }
    return { kind: 'do', value, caught: caught() };
  };
  const out: Fn[] = [];
  for (lines(); i < t.length; lines()) {
    if (t[i + 1] === ':=') {
      const name = next(), fields: string[] = [];
      next(); expect('{'); lines();
      while (peek() !== '}') { fields.push(next()); if (peek() === ',') next(); lines(); }
      next();
      records.set(name, fields);
      continue;
    }
    const name = next(), params: string[] = [];
    expect('(');
    while (peek() !== ')') { params.push(next()); if (peek() === ',') next(); }
    next();
    expect('=>');
    expect('(');
    const body: Stmt[] = [];
    for (lines(); peek() !== ')'; lines()) body.push(stmt());
    next();
    out.push({ name, params, body });
  }
  return out;
}

export type Program = { graph: Graph; blocks: Map<string, number>; natives: Native[]; names: string[]; catches: Catches; arity: Map<number, number>; fields: Map<string, number> };

// Compiles functions to blocks: one cell per parameter, local and temporary; statements chained through `next`.
export function compile(source: string, natives: Record<string, Native>, opts: { graph?: Graph; intern?: (s: string) => number; catches?: Catches; constants?: Record<string, number> } = {}): Program {
  const catches: Catches = opts.catches ?? new Map(), constants = opts.constants ?? {};
  const records: Records = new Map(), fields = new Map<string, number>();
  const fns = parse(source, records);
  for (const [record, names] of records) names.forEach((field, k) => { if (fields.has(field)) throw new Error(`field ${field} of ${record} is already a field`); fields.set(field, k); });
  const table = Object.values(natives), index = new Map(Object.keys(natives).map((name, k) => [name, k]));
  const g = opts.graph ?? new Graph(arities(table), 1 << 12);
  const names: string[] = [];
  const intern = opts.intern ?? ((s: string) => { let k = names.indexOf(s); if (k < 0) { k = names.length; names.push(s); } return k; });
  const blocks = new Map<string, number>(), arity = new Map<number, number>();
  const twice = fns.filter((fn, k) => fns.findIndex(other => other.name === fn.name) !== k).map(fn => fn.name);
  if (twice.length > 0) throw new Error(`defined twice: ${twice.join(", ")}`);
  const both = fns.filter(fn => index.has(fn.name)).map(fn => fn.name);
  if (both.length > 0) throw new Error(`both a function and a native: ${both.join(", ")}`);
  for (const fn of fns) { blocks.set(fn.name, g.make(BLOCK)); arity.set(blocks.get(fn.name)!, fn.params.length); }
  const list = (xs: number[]) => xs.reduceRight((rest, x) => g.make(ARGS, x, rest), 0);
  const link = (from: number, to: number) => { g.heap[(from >> 3) * 4 + (g.tag(from) === IF ? 3 : g.tag(from) === JUMP ? 1 : 3)] = to; };
  for (const fn of fns) {
    const cells = new Map<string, number>(), order: number[] = [];
    const cell = (name: string) => { let c = cells.get(name); if (c === undefined) { c = (g.make(CELL, NONE) & ~7) | SLOT; cells.set(name, c); order.push(c); } return c; };
    for (const p of fn.params) cell(p);
    let temps = 0;
    const labels = new Map<string, number>(), fixups: [number, string][] = [];
    let first = 0, tail = 0;
    const emit = (node: number) => { if (first === 0) first = node; if (tail !== 0) link(tail, node); tail = g.tag(node) === JUMP || g.tag(node) === RETURN ? 0 : node; return node; };
    const pending: number[] = [];
    const place = (node: number) => { for (const p of pending.splice(0)) link(p, node); return emit(node); };
    const value = (e: Expr): number => {
      if (e.kind === 'int') return edge(e.value, INT);
      if (e.kind === 'none') return NONE;
      if (e.kind === 'true') return GLOBAL;
      if (e.kind === 'string') return edge(intern(e.value), INT);
      if (e.kind === 'name') return cells.has(e.name) ? cell(e.name) : blocks.has(e.name) ? blocks.get(e.name)! : records.has(e.name) ? edge(records.get(e.name)!.length, INT) : constants[e.name] ?? cell(e.name);
      const dst = cell(`$${temps++}`);
      into(e, dst);
      return dst;
    };
    const offset = (e: Expr & { kind: 'load' }) => {
      if (e.at !== undefined) return value(e.at);
      const k = fields.get(e.field!);
      if (k === undefined) throw new Error(`no field ${e.field} in ${fn.name}`);
      return edge(k, INT);
    };
    const native = (name: string) => { const k = index.get(name); if (k === undefined) throw new Error(`no native ${name}`); return NATIVE + k; };
    const into = (e: Expr, dst: number) => {
      if (e.kind === 'call') return call(e, dst);
      if (e.kind === 'load') { const of = value(e.of), at = offset(e); place(g.make(native('load'), dst, list([of, at]), 0)); return; }
      if (e.kind === 'and') {
        into(e.left, dst);
        const start = nop(), branch = place(g.make(IF, dst, start, 0));
        tail = start;
        into(e.right, dst);
        const exit = tail;
        tail = branch;
        pending.push(exit);
        return;
      }
      if (e.kind === 'or') {
        into(e.left, dst);
        const skip = nop();
        place(g.make(IF, dst, skip, 0));
        into(e.right, dst);
        pending.push(skip);
        return;
      }
      place(g.make(NATIVE + index.get('mov')!, dst, list([value(e)]), 0));
    };
    const call = (e: Expr & { kind: 'call' }, dst: number): number => {
      const args = e.args.map(value);
      if (blocks.has(e.name)) return place(g.make(CALL, dst, list([blocks.get(e.name)!, ...args]), 0));
      const k = index.get(e.name);
      if (k === undefined) throw new Error(`unknown function or native ${e.name} in ${fn.name}`);
      return place(g.make(NATIVE + k, dst, list(args), 0));
    };
    const guarded = (e: Expr, dst: number, caught: Caught, then?: () => void) => {
      if (e.kind !== 'call') throw new Error(`only a call can catch, in ${fn.name}`);
      const node = call(e, dst);
      then?.();
      const joined = tail, start = nop();
      catches.set(node, { handler: start, cell: cell(caught.name) });
      tail = start;
      statements(caught.body);
      const exit = tail;
      tail = joined;
      if (exit !== 0) pending.push(exit);
    };
    const assign = (name: string, e: Expr) => {
      if (e.kind === 'call') return call(e, cell(name));
      place(g.make(NATIVE + index.get('mov')!, cell(name), list([value(e)]), 0));
    };
    const statements = (body: Stmt[]) => { for (const s of body) statement(s); };
    const statement = (s: Stmt) => {
      if (s.kind === 'store') { const of = value(s.target.of), at = offset(s.target), v = value(s.value); place(g.make(native('store'), 0, list([of, at, v]), 0)); return; }
      if (s.kind === 'set') return s.caught !== undefined ? guarded(s.value, cell(s.name), s.caught) : assign(s.name, s.value);
      if (s.kind === 'do') { if (s.caught !== undefined) guarded(s.value, 0, s.caught); else if (s.value.kind === 'call') call(s.value, 0); else into(s.value, 0); return; }
      if (s.kind === 'return') {
        const first = s.value === undefined ? NONE : value(s.value);
        (s.more ?? []).forEach((e, k) => { const v = value(e); place(g.make(native('result_put'), 0, list([edge(k + 1, INT), v]), 0)); });
        place(g.make(RETURN, first));
        return;
      }
      if (s.kind === 'results') {
        const rest = () => s.names.slice(1).forEach((name, k) => place(g.make(native('result_get'), cell(name), list([edge(k + 1, INT)]), 0)));
        if (s.caught !== undefined) return guarded(s.value, cell(s.names[0]), s.caught, rest);
        into(s.value, cell(s.names[0]));
        rest();
        return;
      }
      if (s.kind === 'label') { const here = nop(); labels.set(s.name, here); place(here); return; }
      if (s.kind === 'goto') {
        if (s.cond === undefined) { const j = place(g.make(JUMP, 0)); fixups.push([j, s.label]); return; }
        const c = value(s.cond), branch = place(g.make(IF, c, 0, 0));
        fixups.push([branch, s.label]);
        return;
      }
      if (s.kind === 'if') {
        const c = value(s.cond), branch = place(g.make(IF, c, 0, 0));
        const start = nop();
        g.heap[(branch >> 3) * 4 + 2] = start;
        tail = start;
        statements(s.then);
        const exits = pending.splice(0);
        if (tail !== 0) exits.push(tail);
        tail = branch;
        statements(s.else);
        pending.push(...exits);
        return;
      }
      const top = place(nop());
      const c = value(s.cond), branch = place(g.make(IF, c, 0, 0));
      const start = nop();
      g.heap[(branch >> 3) * 4 + 2] = start;
      tail = start;
      statements(s.body);
      place(g.make(JUMP, top));
      tail = branch;
    };
    const nop = () => g.make(NATIVE + index.get('mov')!, 0, list([NONE]), 0);
    statements(fn.body);
    place(g.make(RETURN, NONE));
    for (const [node, label] of fixups) {
      const to = labels.get(label);
      if (to === undefined) throw new Error(`no label ${label} in ${fn.name}`);
      if (g.tag(node) === JUMP) g.heap[(node >> 3) * 4 + 1] = to; else g.heap[(node >> 3) * 4 + 2] = to;
    }
    const b = blocks.get(fn.name)!;
    g.heap[(b >> 3) * 4 + 1] = list(order);
    g.heap[(b >> 3) * 4 + 2] = first;
  }
  return { graph: g, blocks, natives: table, names, catches, arity, fields };
}
