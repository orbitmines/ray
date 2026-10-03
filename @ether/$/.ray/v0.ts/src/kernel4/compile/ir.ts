import type { Text } from '../text.ts';
import type { Node, Rule, Native } from '../interpreter.ts';

export type Called = { native: Native; spans: Text.Node[]; end: number };
export type Instruction =
  | { op: 'pass' }
  | { op: 'jump'; label: string; site: Text.Node; condition?: Text.Node }
  | { op: 'natives'; head: Text.Node; value: Node; calls: Called[] };
export type Statement = { end: number; rules: Rule[]; code: Instruction };
export type Unit = Map<number, Statement>;
