import { Graph, Rewriter, INT, VAR, SLOT, edge, kind, type Rule } from './kernel.ts';
import { IF, ARGS, NATIVE, NONE, GLOBAL, arities, type Native, type Catches } from './vm.ts';

// Reductions on the machine's own program graph: the same pattern → pattern rewriting as any other graph.
export function reductions(natives: Record<string, Native>): Rewriter {
  const table = Object.values(natives), index = new Map(Object.keys(natives).map((name, k) => [name, NATIVE + k]));
  const P = new Graph(arities(table));
  const v = (i: number) => edge(i, VAR), at = (op: string) => index.get(op)!;
  const args = (...xs: number[]) => xs.reduceRight((rest, x) => P.make(ARGS, x, rest), 0);
  const constant = (e: number) => kind(e) !== SLOT;
  const int = (e: number) => kind(e) === INT;
  const rules: Rule[] = [];

  if (index.has('mov')) rules.push({ lhs: P.make(at('mov'), 0, args(v(0)), v(1)), rhs: v(1) });

  rules.push({ lhs: P.make(IF, v(0), v(1), v(2)), fn: (g, [c, then, otherwise]) => constant(c) ? (c !== NONE ? then : otherwise) : undefined });

  const fold = (op: string, f: (a: number, b: number) => number) => {
    if (!index.has(op) || !index.has('mov')) return;
    rules.push({ lhs: P.make(at(op), v(0), args(v(1), v(2)), v(3)), fn: (g, [dst, a, b, next]) => int(a) && int(b) ? g.make(at('mov'), dst, g.make(ARGS, f(a, b), 0), next) : undefined });
  };
  fold('add', (a, b) => edge((a >> 3) + (b >> 3), INT));
  fold('sub', (a, b) => edge((a >> 3) - (b >> 3), INT));
  fold('lt', (a, b) => a < b ? GLOBAL : NONE);
  fold('eq', (a, b) => a === b ? GLOBAL : NONE);

  return new Rewriter(P, rules);
}

export function reduce(g: Graph, blocks: number[], natives: Record<string, Native>, catches?: Catches) {
  const rewriter = reductions(natives);
  for (const block of blocks) rewriter.normalize(g, block);
  for (const c of catches?.values() ?? []) c.handler = rewriter.normalize(g, c.handler);
}
