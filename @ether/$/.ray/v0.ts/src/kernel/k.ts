import { Graph, INT, SLOT, edge } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, BLOCK, CELL, NATIVE, NONE, GLOBAL, arities, type Native, type Catches } from './vm.ts';

// The kernel language, written the way Ray is: functions `name (params) => ( … )` over cells, compiled to the graph the machine runs.
//
//   fib (n) => (
//     if n < 2 { return n }
//     return fib(n - 1) + fib(n - 2)
//   )
//
// Statements: `x := e`, `x = e`, `e`, `if e { … } elsif e { … } else { … }`, `while e { … }`, `xs for x => { … }`, `goto L`, `goto L if e`, `L\`, `return e`.
// `xs for x => { … }` walks what `each_first(xs)` starts and `each_next(xs, at)` continues until NIL, `x` being `each_value(xs, at)`.
// Expressions: numbers, `None`, `global`, "strings" (interned), names (cells, or a function as a value), `f(args)`, `external name args…`,
// `… catch e { … }` after a call statement: what the call throws lands in `e` and the block runs instead.
// `!e`, `-e`, `* / %`, `+ -`, `< <= > >= == !=`, `and`, `or` (the last two do not read their right side when the left decides).
// `return a, b, c` answers more than one value; `x, y, z := f(…)` takes them.
// Records: `Rule := { pieces, closure, … }` names the fields of a record in memory (field names are unique); `Rule` is its size,
// `x.closure` reads a field and `x.closure = v` writes it; `x[i]` and `x[i] = v` index; 'c' is a character's code.

type Expr = { kind: 'load'; of: Expr; field?: string; at?: Expr; args?: Expr[] } | { kind: 'int'; value: number } | { kind: 'none' } | { kind: 'true' } | { kind: 'string'; value: string } | { kind: 'name'; name: string } | { kind: 'call'; name: string; args: Expr[]; named?: [string, Expr][] } | { kind: 'and' | 'or'; left: Expr; right: Expr } | { kind: 'pick'; cond: Expr; yes: Expr; no: Expr };
type Caught = { name: string; body: Stmt[]; always?: boolean };
type Stmt =
  | { kind: 'set'; name: string; value: Expr; caught?: Caught }
  | { kind: 'do'; value: Expr; caught?: Caught }
  | { kind: 'store'; target: Expr & { kind: 'load' }; value: Expr }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] }
  | { kind: 'while'; cond: Expr; body: Stmt[] }
  | { kind: 'for'; of: Expr; name: string; body: Stmt[] }
  | { kind: 'goto'; label: string; cond?: Expr }
  | { kind: 'label'; name: string }
  | { kind: 'return'; value?: Expr; more?: Expr[] }
  | { kind: 'results'; names: string[]; value: Expr; caught?: Caught };
type Fn = { name: string; params: string[]; body: Stmt[] };

function tokens(source: string): string[] {
  return source.replace(/\/\/[^\n]*/g, '').match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'|[A-Za-z_][A-Za-z0-9_]*\\?|\d+|:=|=>|==|!=|<=|>=|[-+*\/%<>!{}()\[\]=,;.:?\n]/g) ?? [];
}

const binary: Record<string, [number, string]> = { 'or': [1, 'or'], 'and': [2, 'and'], 'in': [3, 'in'], '==': [3, 'eq'], '!=': [3, 'ne'], '<': [3, 'lt'], '<=': [3, 'le'], '>': [3, 'gt'], '>=': [3, 'ge'], '+': [4, 'add'], '-': [4, 'sub'], '*': [5, 'mul'], '/': [5, 'div'], '%': [5, 'mod'] };

// A record's fields by where they lie in it (a hole where no field does); its length is its size.
export type Records = Map<string, string[]>;
// A class: its fields in order, each with what it starts as, and the class it extends lazily (`Name.ext := class { … }`).
export type Class = { name: string; fields: { name: string; initial?: Expr }[]; of?: string };

export function parse(source: string, records: Records = new Map(), classes: Class[] = []): Fn[] {
  const t = tokens(source);
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const expect = (x: string) => { if (t[i] !== x) throw new Error(`expected ${x} at token ${i} (${t[i]}), after ${t.slice(Math.max(0, i - 12), i).join(' ')}`); i++; };
  const lines = () => { while (t[i] === '\n' || t[i] === ';') i++; };
  const ends = (x: string | undefined) => x === undefined || x === '\n' || x === ';' || x === ')' || x === ']' || x === ',' || x === '{' || x === '}' || x === 'if' || x === '=' || x === 'catch' || x === 'always' || x === 'for' || x === '?' || x === ':' || binary[x] !== undefined;
  const atom = (): Expr => {
    let e = primary();
    for (;;) {
      if (peek() === '.') { next(); const field = next(); e = { kind: 'load', of: e, field }; if (peek() === '(' ) { e.args = arguments_(); } continue; }
      if (peek() === '[') { next(); const at = expr(); expect(']'); e = { kind: 'load', of: e, at }; continue; }
      return e;
    }
  };
  const arguments_ = (named?: [string, Expr][]): Expr[] => {
    expect('(');
    const args: Expr[] = [];
    for (lines(); peek() !== ')'; lines()) {
      if (named !== undefined && t[i + 1] === ':' ) { const name = next(); next(); named.push([name, expr()]); } else args.push(expr());
      if (peek() === ',') next();
    }
    next();
    return args;
  };
  const primary = (): Expr => {
    if (peek() === '.') { next(); return { kind: 'load', of: { kind: 'name', name: 'this' }, field: next() }; }
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
    if (peek() === '(') { const named: [string, Expr][] = []; const args = arguments_(named); return { kind: 'call', name: x, args, ...(named.length > 0 ? { named } : {}) }; }
    if (x === 'None') return { kind: 'none' };
    if (x === 'global') return { kind: 'true' };
    if (x === undefined || !/^[A-Za-z_]/.test(x)) throw new Error(`unexpected ${x} at token ${i - 1}, after ${t.slice(Math.max(0, i - 12), i - 1).join(' ')}`);
    return { kind: 'name', name: x };
  };
  const expr = (level = 1): Expr => {
    const e = operand(level);
    if (level > 1 || peek() !== '?') return e;
    next();
    const yes = expr();
    expect(':');
    return { kind: 'pick', cond: e, yes, no: expr() };
  };
  const operand = (level: number): Expr => {
    let left = atom();
    for (;;) {
      const op = binary[peek()];
      if (op === undefined || op[0] < level) return left;
      next();
      lines();
      const right = operand(op[0] + 1);
      left = op[1] === 'and' || op[1] === 'or' ? { kind: op[1], left, right } : op[1] === 'in' ? { kind: 'call', name: 'list_has', args: [right, left] } : { kind: 'call', name: op[1], args: [left, right] };
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
  // `… catch e { … }` runs instead when the call raises; `… always { … }` runs after it either way (and raises again).
  const caught = (): Caught | undefined => {
    if (peek() === 'always') { next(); return { name: `$raised${i}`, body: block(), always: true }; }
    if (peek() !== 'catch') return undefined;
    next();
    const name = next();
    return { name, body: block() };
  };
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
    if (peek() === 'for') { next(); const name = next(); expect('=>'); return { kind: 'for', of: value, name, body: block() }; }
    if (peek() === '=' && value.kind === 'load') { next(); return { kind: 'store', target: value, value: expr() }; }
    return { kind: 'do', value, caught: caught() };
  };
  const out: Fn[] = [];
  // `( statements )`, or one expression answered.
  // `( statements )` up to the end of the line, else one expression answered.
  const body = (): Stmt[] => {
    const at = i, answer = (): Stmt[] => { i = at; return [{ kind: 'return', value: expr() }]; };
    if (peek() !== '(') return answer();
    next();
    const stmts: Stmt[] = [];
    try { for (lines(); peek() !== ')'; lines()) stmts.push(stmt()); next(); } catch { return answer(); }
    return [undefined, '\n', '}', ','].includes(peek()) ? stmts : answer();
  };
  const fn = (name: string, self: string[]): Fn => {
    const params = [...self];
    if (peek() === '(') { next(); while (peek() !== ')') { params.push(next()); if (peek() === ',') next(); } next(); }
    expect('=>');
    return { name, params, body: body() };
  };
  for (lines(); i < t.length; lines()) {
    if (t[i + 1] === ':=' || (t[i + 1] === '.' && t[i + 3] === ':=')) {
      const name = next(), of = peek() === '.' ? (next(), name) : undefined, own = of === undefined ? name : next();
      next();
      const fields: Class['fields'] = [];
      if (peek() === 'class') next();
      expect('{'); lines();
      while (peek() !== '}') {
        const field = next();
        if (peek() === '(' || peek() === '=>') out.push(fn(field, ['this']));
        else if (peek() === ':') { next(); fields.push({ name: field, initial: expr() }); }
        else fields.push({ name: field });
        if (peek() === ',') next();
        lines();
      }
      next();
      classes.push({ name: own, fields, ...(of !== undefined ? { of } : {}) });
      continue;
    }
    out.push(fn(next(), []));
  }
  return out;
}

// Where each field lies: one place per field name, the same in every class that has it, no two fields of a class in one place;
// names met first take the first places.
export function lay(classes: Class[]): { fields: Map<string, number>; records: Records } {
  const fields = new Map<string, number>(), records: Records = new Map(), beside = new Map<string, Set<string>>();
  for (const c of classes) for (const f of c.fields) { const set = beside.get(f.name) ?? new Set<string>(); for (const g of c.fields) if (g !== f) set.add(g.name); beside.set(f.name, set); }
  for (const c of classes) for (const f of c.fields) {
    if (fields.has(f.name)) continue;
    const taken = new Set([...beside.get(f.name)!].map(g => fields.get(g)).filter(k => k !== undefined));
    let k = 0;
    while (taken.has(k)) k++;
    fields.set(f.name, k);
  }
  for (const c of classes) { const laid: string[] = []; for (const f of c.fields) laid[fields.get(f.name)!] = f.name; records.set(c.name, Array.from(laid, x => x ?? '')); }
  return { fields, records };
}

export type Program = { graph: Graph; blocks: Map<string, number>; fresh: Map<string, number>; classes: Class[]; natives: Native[]; names: string[]; catches: Catches; arity: Map<number, number>; fields: Map<string, number>; records: Records };

// Compiles functions to blocks: one cell per parameter, local and temporary; statements chained through `next`.
export function compile(source: string, natives: Record<string, Native>, opts: { graph?: Graph; intern?: (s: string) => number; catches?: Catches; constants?: Record<string, number>; laid?: (fields: Map<string, number>, records: Records) => void; known?: { blocks: Map<string, number>; arity: Map<number, number>; fields: Map<string, number>; classes: Class[] } } = {}): Program {
  const catches: Catches = opts.catches ?? new Map(), constants = opts.constants ?? {};
  const classes: Class[] = [...(opts.known?.classes ?? [])];
  const fns = parse(source, new Map(), classes);
  const { fields, records } = opts.known !== undefined ? { fields: opts.known.fields, records: new Map() as Records } : lay(classes);
  const known = new Map(classes.map(c => [c.name, c])), family = new Map<string, Class>();
  for (const c of classes) for (const f of c.fields) {
    const other = family.get(f.name);
    if (other !== undefined && [other.name, other.of, c.name, c.of].some(x => x === 'Value')) throw new Error(`${f.name} is a field of ${other.name} and of ${c.name}; a value's fields are its own`);
    family.set(f.name, c);
  }
  const functions = new Set(fns.map(f => f.name));
  opts.laid?.(fields, records);
  const table = Object.values(natives), index = new Map(Object.keys(natives).map((name, k) => [name, k]));
  const g = opts.graph ?? new Graph(arities(table), 1 << 12);
  const names: string[] = [];
  const intern = opts.intern ?? ((s: string) => { let k = names.indexOf(s); if (k < 0) { k = names.length; names.push(s); } return edge(k, INT); });
  const blocks = new Map<string, number>(opts.known?.blocks ?? []), arity = new Map<number, number>(opts.known?.arity ?? []), fresh = new Map<string, number>();
  const twice = fns.filter((fn, k) => fns.findIndex(other => other.name === fn.name) !== k).map(fn => fn.name);
  if (twice.length > 0) throw new Error(`defined twice: ${twice.join(", ")}`);
  const both = fns.filter(fn => index.has(fn.name)).map(fn => fn.name);
  if (both.length > 0) throw new Error(`both a function and a native: ${both.join(", ")}`);
  for (const fn of fns) { blocks.set(fn.name, g.make(BLOCK)); fresh.set(fn.name, blocks.get(fn.name)!); arity.set(blocks.get(fn.name)!, fn.params.length); }
  const list = (xs: number[]) => xs.reduceRight((rest, x) => g.make(ARGS, x, rest), 0);
  const link = (from: number, to: number) => { g.heap[(from >> 3) * 4 + (g.tag(from) === IF ? 3 : g.tag(from) === JUMP ? 1 : 3)] = to; };
  // The class of values (laid out by `node(tag, Value)`), and the functions that see its fields as they lie.
  const values = classes.find(c => c.name === 'Value')?.name ?? '', inside = new Set(['side_of', 'info', 'more', 'more_seen', 'value']);
  for (const fn of fns) {
    const cells = new Map<string, number>(), order: number[] = [];
    const cell = (name: string) => { let c = cells.get(name); if (c === undefined) { c = (g.make(CELL, NONE) & ~7) | SLOT; cells.set(name, c); order.push(c); } return c; };
    for (const p of fn.params) cell(p);
    let temps = 0, loops = 0;
    const labels = new Map<string, number>(), fixups: [number, string][] = [];
    let first = 0, tail = 0;
    const emit = (node: number) => { if (first === 0) first = node; if (tail !== 0) link(tail, node); tail = g.tag(node) === JUMP || g.tag(node) === RETURN ? 0 : node; return node; };
    const pending: number[] = [];
    const place = (node: number) => { for (const p of pending.splice(0)) link(p, node); return emit(node); };
    const value = (e: Expr): number => {
      if (e.kind === 'int') return edge(e.value, INT);
      if (e.kind === 'none') return NONE;
      if (e.kind === 'true') return GLOBAL;
      if (e.kind === 'string') return intern(e.value);
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
    // A value's fields are read through what is known about it, and its lazy fields through what it lives beside.
    const holder = (e: Expr & { kind: 'load' }, how: 'read' | 'write'): Expr => {
      const c = e.field === undefined ? undefined : family.get(e.field);
      if (c === undefined || (c.name !== values && c.of !== values) || inside.has(fn.name) || c.fields.findIndex(f => f.name === e.field) < 3 && c.name === values) return e.of;
      const side: Expr = { kind: 'call', name: how === 'read' ? 'side_of' : 'info', args: [e.of] };
      return c.of === values ? { kind: 'call', name: how === 'read' ? 'more_seen' : 'more', args: [side] } : side;
    };
    const native = (name: string) => { const k = index.get(name); if (k === undefined) throw new Error(`no native ${name}`); return NATIVE + k; };
    const into = (e: Expr, dst: number) => {
      if (e.kind === 'call') return call(e, dst);
      if (e.kind === 'load') {
        if (e.field !== undefined && (e.args !== undefined || !fields.has(e.field))) return call({ kind: 'call', name: e.field, args: [e.of, ...(e.args ?? [])] }, dst);
        const of = value(holder(e, 'read')), at = offset(e);
        place(g.make(native('load'), dst, list([of, at]), 0));
        return;
      }
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
      if (e.kind === 'pick') {
        const c = value(e.cond), branch = place(g.make(IF, c, 0, 0)), start = nop();
        g.heap[(branch >> 3) * 4 + 2] = start;
        tail = start;
        into(e.yes, dst);
        const exit = tail;
        tail = branch;
        into(e.no, dst);
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
      const c = known.get(e.name);
      if (c !== undefined) {
        const given = new Map(e.named ?? []);
        const size = edge(records.get(c.name)!.length, INT);
        place(e.args.length > 0 ? g.make(native('node'), dst, list([value(e.args[0]), size]), 0) : g.make(native('make'), dst, list([size]), 0));
        for (const f of c.fields) { const v = given.get(f.name) ?? f.initial; if (v !== undefined) place(g.make(native('store'), 0, list([dst, edge(fields.get(f.name)!, INT), value(v)]), 0)); }
        return dst;
      }
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
      statements(caught.always ? [...caught.body, { kind: 'do', value: { kind: 'call', name: 'rethrow', args: [{ kind: 'name', name: caught.name }] } }] : caught.body);
      const exit = tail;
      tail = joined;
      if (exit !== 0) pending.push(exit);
      if (caught.always) statements(caught.body);
    };
    const assign = (name: string, e: Expr) => {
      if (e.kind === 'call') return call(e, cell(name));
      place(g.make(NATIVE + index.get('mov')!, cell(name), list([value(e)]), 0));
    };
    const statements = (body: Stmt[]) => { for (const s of body) statement(s); };
    const statement = (s: Stmt) => {
      if (s.kind === 'store') { const of = value(holder(s.target, 'write')), at = offset(s.target), v = value(s.value); place(g.make(native('store'), 0, list([of, at, v]), 0)); return; }
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
      if (s.kind === 'for') {
        const n = loops++, xs = `$xs${n}`, at = `$at${n}`, name = (x: string): Expr => ({ kind: 'name', name: x });
        statement({ kind: 'set', name: xs, value: s.of });
        statement({ kind: 'set', name: at, value: { kind: 'call', name: 'each_first', args: [name(xs)] } });
        statement({ kind: 'while', cond: { kind: 'call', name: 'ne', args: [name(at), name('NIL')] }, body: [
          { kind: 'set', name: s.name, value: { kind: 'call', name: 'each_value', args: [name(xs), name(at)] } },
          ...s.body,
          { kind: 'set', name: at, value: { kind: 'call', name: 'each_next', args: [name(xs), name(at)] } },
        ] });
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
  return { graph: g, blocks, fresh, natives: table, names, catches, arity, fields, records, classes };
}
