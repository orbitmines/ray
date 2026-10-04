import { Graph, SLOT } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, NATIVE, NONE, GLOBAL, forms, type Native, type Catches } from './vm.ts';

export type Compiled = Map<number, (M: unknown, ...args: number[]) => number>;

// The machine's program graph written out as JavaScript: a function per block, its cells as locals, its gotos as cases.
export function javascript(g: Graph, blocks: Map<string, number>, natives: Native[], catches: Catches, arity: Map<number, number>, existing: Compiled = new Map()): Compiled {
  const h = g.heap, N = NONE, G = GLOBAL;
  const list = (l: number) => { const xs: number[] = []; for (; l !== 0 && h[(l >> 3) * 4] === ARGS; l = h[(l >> 3) * 4 + 2]) xs.push(h[(l >> 3) * 4 + 1]); return xs; };
  const tag = (e: number) => h[(e >> 3) * 4], child = (e: number, i: number) => h[(e >> 3) * 4 + 1 + i];
  const inline = forms;

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
        const dst = child(e, 0), args = list(child(e, 1));
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
        if (c !== undefined) out.push(`try { ${statement} } catch (x) { ${value(c.cell)} = M.box(x); ${go(c.handler)} }`);
        else out.push(statement);
        e = child(e, 2);
      }
    };
    for (const e of labels) if (!done.has(e)) chain(e);
    const locals = cells.slice(params).map((_, i) => `c${params + i} = ${N}`);
    const at = name.get(b)!.slice(1), ps = cells.slice(0, params).map((_, i) => `c${i}`), passed = ps.map(x => ', ' + x).join('');
    fns.push(`// ${title}
function p${at}(M${passed}) {
  ${locals.length > 0 ? `let ${locals.join(', ')};` : ''}
  ${process.env.KCOUNT ? `globalThis.__C[${JSON.stringify(title)}] = (globalThis.__C[${JSON.stringify(title)}] ?? 0) + 1;` : ''}
  let pc = 0;
  for (;;) switch (pc) {
${out.join('\n')}
  }
}
function f${at}(M${passed}) {
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
}`);
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
