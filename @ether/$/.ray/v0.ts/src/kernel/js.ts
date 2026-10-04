import { Graph, SLOT } from './kernel.ts';
import { JUMP, IF, RETURN, CALL, ARGS, NATIVE, NONE, GLOBAL, basics, memory, graph, type Native, type Catches } from './vm.ts';

export type Compiled = Map<number, (M: unknown, ...args: number[]) => number>;

// The machine's program graph written out as JavaScript: a function per block, its cells as locals, its gotos as cases.
export function javascript(g: Graph, blocks: Map<string, number>, natives: Native[], catches: Catches, arity: Map<number, number>, existing: Compiled = new Map()): Compiled {
  const h = g.heap, N = NONE, G = GLOBAL;
  const list = (l: number) => { const xs: number[] = []; for (; l !== 0 && h[(l >> 3) * 4] === ARGS; l = h[(l >> 3) * 4 + 2]) xs.push(h[(l >> 3) * 4 + 1]); return xs; };
  const tag = (e: number) => h[(e >> 3) * 4], child = (e: number, i: number) => h[(e >> 3) * 4 + 1 + i];
  const inline = new Map<Native, (a: string[]) => string>([
    [basics.mov, ([a]) => a],
    [basics.add, ([a, b]) => `(${a} + ${b} - 1)`],
    [basics.sub, ([a, b]) => `(${a} - ${b} + 1)`],
    [basics.lt, ([a, b]) => `(${a} < ${b} ? ${G} : ${N})`],
    [basics.le, ([a, b]) => `(${a} <= ${b} ? ${G} : ${N})`],
    [basics.gt, ([a, b]) => `(${a} > ${b} ? ${G} : ${N})`],
    [basics.ge, ([a, b]) => `(${a} >= ${b} ? ${G} : ${N})`],
    [basics.eq, ([a, b]) => `(${a} === ${b} ? ${G} : ${N})`],
    [basics.ne, ([a, b]) => `(${a} !== ${b} ? ${G} : ${N})`],
    [basics.not, ([a]) => `(${a} === ${N} ? ${G} : ${N})`],
    [basics.has, ([a, b]) => `(((${a} >> 3) & (${b} >> 3)) !== 0 ? ${G} : ${N})`],
    [basics.max, ([a, b]) => `(${a} > ${b} ? ${a} : ${b})`],
    [basics.hash, ([a]) => `((((Math.imul(${a}, 0x9e3779b1) >>> 7) & 0xffffff) << 3) | 1)`],
    [basics.mod, ([a, b]) => `((((${a} >> 3) % (${b} >> 3)) << 3) | 1)`],
    [basics.mul, ([a, b]) => `((((${a} >> 3) * (${b} >> 3)) << 3) | 1)`],
    [memory.result_put, ([k, v]) => `(M.R[${k} >> 3] = ${v}, ${N})`],
    [memory.result_get, ([k]) => `M.R[${k} >> 3]`],
    [graph.node_tag, ([e]) => `((${e} & 7) === 0 && ${e} !== 0 ? (M.graph.heap[(${e} >> 3) * 4] << 3) | 1 : -7)`],
    [graph.node_child, ([e, i]) => `M.graph.heap[(${e} >> 3) * 4 + 1 + (${i} >> 3)]`],
    [graph.node_set, ([e, i, v]) => `(M.graph.heap[(${e} >> 3) * 4 + 1 + (${i} >> 3)] = ${v}, ${N})`],
    [graph.node_index, ([e]) => `(((${e} >> 3) << 3) | 1)`],
    [memory.load, ([p, k]) => `M.H[(${p} >> 3) + (${k} >> 3)]`],
    [memory.store, ([p, k, v]) => `(M.H[(${p} >> 3) + (${k} >> 3)] = ${v}, ${N})`],
  ]);
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
    fns.push(`// ${title}
function ${name.get(b)}(M${cells.slice(0, params).map((_, i) => `, c${i}`).join('')}) {
  ${locals.length > 0 ? `let ${locals.join(', ')};` : ''}
  let pc = 0;
  for (;;) switch (pc) {
${out.join('\n')}
  }
}`);
  }
  const source = `${natives.map((_, i) => `const n${i} = N[${i}];`).join('\n')}
${[...outside].map(b => `const e${b >> 3} = X.get(${b});`).join('\n')}
${fns.join('\n')}
return [${[...blocks.values()].map(b => name.get(b)).join(', ')}];`;
  if (process.env.KJS) (process.getBuiltinModule('fs') as typeof import('fs'))[existing.size === 0 ? 'writeFileSync' : 'appendFileSync'](process.env.KJS, source);
  const made = new Function('N', 'X', source)(natives, existing) as ((M: unknown, ...args: number[]) => number)[];
  const compiled: Compiled = new Map();
  [...blocks.values()].forEach((b, i) => compiled.set(b, made[i]));
  return compiled;
}
