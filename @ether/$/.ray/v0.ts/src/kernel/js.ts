import { Graph, SLOT } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, NATIVE, NONE, GLOBAL, forms, plain, type Native, type Catches } from './vm.ts';

export type Compiled = Map<number, (M: unknown, ...args: number[]) => number>;

// The machine's program graph written out as JavaScript: a function per block, its cells as locals, its gotos as cases.
export function javascript(g: Graph, blocks: Map<string, number>, natives: Native[], catches: Catches, arity: Map<number, number>, existing: Compiled = new Map(), learning = true): Compiled {
  const h = g.heap, N = NONE, G = GLOBAL;
  const list = (l: number) => { const xs: number[] = []; for (; l !== 0 && h[(l >> 3) * 4] === ARGS; l = h[(l >> 3) * 4 + 2]) xs.push(h[(l >> 3) * 4 + 1]); return xs; };
  const tag = (e: number) => h[(e >> 3) * 4], child = (e: number, i: number) => h[(e >> 3) * 4 + 1 + i];
  const inline = learning ? forms : plain;

  const name = new Map<number, string>();
  let k = 0;
  for (const b of blocks.values()) name.set(b, `f${k++}`);
  const fns: string[] = [], outside = new Set<number>();
  for (const [title, b] of blocks) {
    const cells = list(child(b, 0)), slot = new Map<number, string>();
    cells.forEach((c, i) => slot.set(c >> 3, `c${i}`));
    const value = (e: number) => (e & 7) === SLOT ? slot.get(e >> 3)! : String(e);
    const params = arity.get(b) ?? 0;
    const start = child(b, 1);
    const preds = new Map<number, number>(), labels = new Set<number>([start]);
    const seen = new Set<number>(), todo = [start];
    const edge = (from: number, to: number) => { if (to === 0) return; preds.set(to, (preds.get(to) ?? 0) + 1); todo.push(to); };
    while (todo.length > 0) {
      const e = todo.pop()!;
      if (e === 0 || seen.has(e)) continue;
      seen.add(e);
      const t = tag(e), c = catches.get(e);
      if (c !== undefined) { labels.add(c.handler); edge(e, c.handler); }
      if (t === JUMP) { labels.add(child(e, 0)); edge(e, child(e, 0)); }
      else if (t === IF) { labels.add(child(e, 1)); edge(e, child(e, 1)); edge(e, child(e, 2)); }
      else if (t === RETURN) { }
      else edge(e, child(e, 2));
    }
    for (const [e, n] of preds) if (n > 1) labels.add(e);
    const number = new Map<number, number>();
    for (const e of labels) number.set(e, number.size);
    const out: string[] = [];
    const go = (e: number) => e === 0 ? `return ${N};` : `pc = ${number.get(e)}; continue;`;
    const done = new Set<number>();
    const chain = (e: number) => {
      out.push(`case ${number.get(e)}:`);
      for (let first = true; ; first = false) {
        if (e === 0) { out.push(`return ${N};`); return; }
        if (!first && labels.has(e)) { out.push(go(e)); return; }
        done.add(e);
        const t = tag(e);
        if (t === JUMP) { out.push(go(child(e, 0))); return; }
        if (t === RETURN) { out.push(`return ${value(child(e, 0))};`); return; }
        if (t === IF) { out.push(`if (${value(child(e, 0))} !== ${N}) { ${go(child(e, 1))} }`); e = child(e, 2); continue; }
        out.push(...step(e));
        e = child(e, 2);
      }
    };
    // One call or native: its statement, guarded by its catch when it has one (the handler going on as `handler` says).
    const step = (e: number, handler?: (to: number) => string): string[] => {
        const t = tag(e), dst = child(e, 0), args = list(child(e, 1));
        let call: string;
        if (t === CALL) {
          const [callee, ...rest] = args, n = arity.get(callee) ?? rest.length;
          const passed = Array.from({ length: n }, (_, i) => i < rest.length ? value(rest[i]) : String(N));
          if (!name.has(callee)) { name.set(callee, `e${callee >> 3}`); outside.add(callee); }
          call = `${name.get(callee)}(M${passed.map(x => ', ' + x).join('')})`;
        } else {
          const native = natives[t - NATIVE], form = inline.get(native);
          call = form !== undefined ? form(args.map(value)) : `n${t - NATIVE}(M${args.map(x => ', ' + value(x)).join('')})`;
        }
        const statement = dst === 0 ? `${call};` : `${value(dst)} = ${call};`;
        const c = catches.get(e);
        if (c !== undefined) return [`try { ${statement} } catch (x) { ${value(c.cell)} = M.box(x); ${(handler ?? go)(c.handler)} }`];
        return [statement];
    };
    // A block is written structured: nested ifs, each loop (a back edge to its header) as a labelled `for (;;)` left by `break` to its
    // one exit and gone round by `continue`; a shared tail is written again where it is met, while that stays small. Else as cases.
    const succ = (e: number): number[] => { const t = tag(e), c = catches.get(e), out: number[] = c !== undefined ? [c.handler] : []; if (t === JUMP) out.push(child(e, 0)); else if (t === IF) out.push(child(e, 1), child(e, 2)); else if (t !== RETURN) out.push(child(e, 2)); return out.filter(x => x !== 0); };
    const loops = new Map<number, { id: number; body: Set<number>; exit?: number }>();
    let structured = true;
    {
      const on = new Set<number>(), visited = new Set<number>(), backs: [number, number][] = [], preds = new Map<number, number[]>();
      const dfs = (e: number) => { visited.add(e); on.add(e); for (const t of succ(e)) { (preds.get(t) ?? preds.set(t, []).get(t)!).push(e); if (on.has(t)) backs.push([e, t]); else if (!visited.has(t)) dfs(t); } on.delete(e); };
      dfs(start);
      for (const [from, header] of backs) {
        const loop = loops.get(header) ?? { id: loops.size, body: new Set<number>([header]) };
        loops.set(header, loop);
        const todo = [from];
        while (todo.length > 0) { const x = todo.pop()!; if (loop.body.has(x)) continue; loop.body.add(x); for (const p of preds.get(x) ?? []) todo.push(p); }
      }
      for (const [header, loop] of loops) {
        const out = (x: number) => succ(x).filter(t => !loop.body.has(t));
        let at = header;
        while (out(at).length === 0 && succ(at).length === 1 && loop.body.has(succ(at)[0]) && succ(at)[0] !== header) at = succ(at)[0];
        loop.exit = out(at)[0];
      }
    }
    // Where the paths from a node all meet again (its immediate post-dominator; -1 is past the end).
    const meet = new Map<number, number>();
    {
      const nodes: number[] = [], seen2 = new Set<number>(), todo2 = [start];
      while (todo2.length > 0) { const x = todo2.pop()!; if (x === 0 || seen2.has(x)) continue; seen2.add(x); nodes.push(x); todo2.push(...succ(x)); }
      const after = (x: number) => { const t = tag(x), next = t === RETURN ? [] : t === JUMP ? [child(x, 0)] : t === IF ? [child(x, 1), child(x, 2)] : [child(x, 2)]; const c = catches.get(x); const all = c !== undefined ? [...next, c.handler] : next; return all.map(y => y === 0 ? -1 : y).concat(all.length === 0 ? [-1] : []); };
      const pdom = new Map<number, Set<number>>([[-1, new Set([-1])]]);
      const every = new Set<number>([-1, ...nodes]);
      for (const x of nodes) pdom.set(x, new Set(every));
      for (let changed = true; changed;) {
        changed = false;
        for (const x of nodes) {
          let common: Set<number> | undefined;
          for (const y of after(x)) { const p = pdom.get(y)!; common = common === undefined ? new Set(p) : new Set([...common].filter(z => p.has(z))); }
          const next = new Set(common ?? []); next.add(x);
          if (next.size !== pdom.get(x)!.size) { pdom.set(x, next); changed = true; }
        }
      }
      for (const x of nodes) { let best = -1, size = -1; for (const p of pdom.get(x)!) if (p !== x && pdom.get(p)!.size > size) { size = pdom.get(p)!.size; best = p; } meet.set(x, best); }
    }
    let budget = 600, flags = 0;
    const across = (t: number, stack: number[]): string | undefined => {
      for (let i = stack.length - 1; i >= 0; i--) if (t === stack[i]) return `continue L${loops.get(t)!.id};`;
      if (stack.length > 0 && !loops.get(stack[stack.length - 1])!.body.has(t)) {
        for (let i = stack.length - 1; i >= 0; i--) if (loops.get(stack[i])!.exit === t) return `break L${loops.get(stack[i])!.id};`;
      }
      return undefined;
    };
    const tree = (e: number, stack: number[], opened = false, stop = -2): string => {
      const lines: string[] = [];
      const go_to = (t: number): boolean => { if (t === stop) return true; const jump = t === 0 ? undefined : across(t, stack); if (jump !== undefined) { lines.push(jump); return true; } e = t; opened = false; return false; };
      for (;;) {
        if (--budget < 0) throw budget;
        if (e === stop) break;
        if (e === 0) { lines.push(`return ${N};`); break; }
        const loop = loops.get(e);
        if (loop !== undefined && !opened && !stack.includes(e)) {
          lines.push(`L${loop.id}: for (;;) { ${tree(e, [...stack, e], true)} }`);
          if (loop.exit === undefined) break;
          if (go_to(loop.exit)) break;
          continue;
        }
        opened = false;
        const t = tag(e);
        if (t === JUMP) { if (go_to(child(e, 0))) break; continue; }
        if (t === RETURN) { lines.push(`return ${value(child(e, 0))};`); break; }
        if (t === IF) {
          const yes = child(e, 1), no = child(e, 2), join = meet.get(e) ?? -1, inner = stack.length > 0 ? loops.get(stack[stack.length - 1])! : undefined;
          const joins = join > 0 && (join === stop || (inner === undefined || inner.body.has(join)) && !loops.has(join));
          const branch = (t: number) => t === 0 ? `return ${N};` : t === join && joins ? '' : across(t, stack) ?? tree(t, stack, false, joins ? join : stop);
          if (joins) { lines.push(`if (${value(child(e, 0))} !== ${N}) { ${branch(yes)} } else { ${branch(no)} }`); e = join; opened = false; continue; }
          lines.push(`if (${value(child(e, 0))} !== ${N}) { ${branch(yes)} }`);
          if (go_to(no)) break;
          continue;
        }
        const join = meet.get(e) ?? -1, inner = stack.length > 0 ? loops.get(stack[stack.length - 1])! : undefined;
        const joins = catches.has(e) && join > 0 && (join === stop || (inner === undefined || inner.body.has(join)) && !loops.has(join));
        const flag = `k${flags++}`;
        if (joins) lines.push(`let ${flag} = false;`);
        lines.push(...step(e, to => (to === join && joins ? '' : across(to, stack) ?? tree(to, stack, false, joins ? join : stop)) + (joins ? ` ${flag} = true;` : '')));
        if (joins) { if (child(e, 2) !== join) lines.push(`if (!${flag}) { ${tree(child(e, 2), stack, false, join)} }`); e = join; opened = false; continue; }
        if (go_to(child(e, 2))) break;
      }
      return lines.join('\n');
    };
    let straight: string | undefined;
    if (structured) { try { straight = tree(start, []); } catch { straight = undefined; } }
    if (straight === undefined) for (const e of labels) if (!done.has(e)) chain(e);
    const locals = cells.slice(params).map((_, i) => `c${params + i} = ${N}`);
    const at = name.get(b)!.slice(1), ps = cells.slice(0, params).map((_, i) => `c${i}`), passed = ps.map(x => ', ' + x).join('');
    fns.push(`// ${title}
function p${at}(M${passed}) {
  ${locals.length > 0 ? `let ${locals.join(', ')};` : ''}
  ${process.env.KCOUNT ? `globalThis.__C[${JSON.stringify(title)}] = (globalThis.__C[${JSON.stringify(title)}] ?? 0) + 1;` : ''}
  ${straight !== undefined ? straight : `let pc = 0;
  for (;;) switch (pc) {
${out.join('\n')}
  }`}
}
${learning ? `function f${at}(M${passed}) {
  const Q = M.Q;
  if (Q.state === undefined || Q.state[${at}] !== 0) return p${at}(M${passed});
  const A = Q.args;${ps.map((x, i) => ` A[${i}] = ${x};`).join('')}
  const h = Q.reduce(${at}, ${params});
  if (h !== undefined) {
    if (Q.check) { const R = Array.from(M.R.subarray(1, 4)), w = p${at}(M${passed}); if (w !== h || R.some((x, i) => i < Q.results[${at}] && x !== M.R[i + 1])) Q.mismatch(${at}, [${ps.join(', ')}], h, w, R, Array.from(M.R.subarray(1, 4))); }
    return h;
  }
  const l = Q.learn(${at}, ${params});
  let v;
  try { v = p${at}(M${passed}); } catch (x) { Q.failed(l); throw x; }
  return Q.learned(l, v);
}` : `const f${at} = p${at};`}`);
  }
  const source = `${natives.map((_, i) => `const n${i} = N[${i}];`).join('\n')}
${[...outside].map(b => `const e${b >> 3} = X.get(${b});`).join('\n')}
${fns.join('\n')}
return [${[...blocks.values()].map(b => name.get(b)).join(', ')}];`;
  if (process.env.KJS) (process.getBuiltinModule('fs') as typeof import('fs'))[existing.size === 0 ? 'writeFileSync' : 'appendFileSync'](process.env.KJS, source);
  if (process.env.KCOUNT && !(globalThis as any).__C) { (globalThis as any).__C = {}; process.on('exit', () => { const c = (globalThis as any).__C; console.error(Object.entries(c).sort((a: any, b: any) => b[1] - a[1]).slice(0, Number(process.env.KCOUNT)).map(([k, v]) => `${v}\t${k}`).join('\n')); }); }
  const made = new Function('N', 'X', source)(natives, existing) as ((M: unknown, ...args: number[]) => number)[];
  const compiled: Compiled = new Map();
  [...blocks.values()].forEach((b, i) => compiled.set(b, made[i]));
  return compiled;
}
