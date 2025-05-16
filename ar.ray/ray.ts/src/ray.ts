import {exec} from "node:child_process";

export type MaybeAsync<T> = T | Promise<T>


export namespace Query {
  export namespace Property {
    export type MappedValue<T> = T extends void ? void : T | Query.Type<Node>
    export type MappedFunction<T extends (...args: any[]) => any> = T extends (...args: infer Args) => infer Result ? (...args: { [Arg in keyof Args]: Args[Arg] extends Node ? Query.Type<Args[Arg]> : Args[Arg] }) => MaybeAsync<MappedValue<Result>> : never;
    export type MappedArgument<T> = T extends (...args: any[]) => any ? MappedFunction<T> : MappedValue<T>
    export type MappedArguments<T> =
      0 extends (1 & T) /* T = any? */ ? [MappedArgument<T>] :
        T extends void ? [] :
          T extends any[] ? { [K in keyof T]: MappedArgument<T[K]> } :
            [MappedArgument<T>]

    export type Type<TValue, TNextQuery> = {
      (...value: MappedArguments<TValue>): Query.Type<TNextQuery>
    }
  }

  export type Type<T> = {
    [P in keyof T]: T[P] extends (...args: infer Args) => infer Query ? Property.Type<Args, Query> : never
  } & {
    new (): Instance
  }

  export const instance = <T>(): Type<T> => new Instance().__proxy__ as Type<T>

  export class Instance {

    // TODO: Construct a ray instead of using __parent__ here.
    __parent__?: Instance
    __property__: string | symbol
    __value__?: any

    __get__ = (property: string | symbol): any => {
        return <TValue, TNextQuery>(...value: Property.MappedArguments<TValue>): TNextQuery => {
          const x = new Instance();
          x.__parent__ = this;
          x.__property__ = property;
          x.__value__ = value;
          return x.__proxy__ as TNextQuery;
        }
    }

    __construct__ = (...args: any[]): any => this;
    // __call__ = (...args: any[]): any => { }
    // __set__ = (property: string | symbol, value: any): boolean => {  }
    // __has__ = (property: string | symbol): boolean => {  }
    // __delete__ = (property: string | symbol): any => {  }

    get __proxy__(): any { return new Proxy(class {}, {
      // apply: (_: any, thisArg: any, argArray: any[]): any => this.__call__(...argArray),
      // set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => this.__set__(property, newValue),
      get: (_: any, property: string | symbol, receiver: any): any => this.__get__(property),
      // has: (_: any, property: string | symbol): boolean => this.__has__(property),
      construct: (_: any, argArray: any[], newTarget: Function): object => this.__construct__(...argArray),
      // deleteProperty: (_: any, property: string | symbol): boolean => this.__delete__(property)
    }) }

  }

  export class Executor<T> {

    // TODO: Rewrite to many targets used in which situation?
    rewrite = (implementations: {
      [P in keyof Query.Type<T>]?: Query.Type<T>[P] extends (...args: infer Args) => infer TNextQuery ? (self: Query.Type<T>, ...args: Args) => TNextQuery : never
    }): Executor<T> => {
      return this;
    }

    // TODO: Rewrite specific values (theorem proving)

  }
}

export enum RemoveStrategy {
  /**
   * Preserves structure around the removed selection.
   * This is akin to removing elements from an array.
   */
  PRESERVE_STRUCTURE = "PRESERVE_STRUCTURE",
  /**
   * Removes all connectivity around the selection.
   * This is akin to removing a vertex and all incoming/outgoing edges.
   *
   *   // TODO, Should only sever connections which are NOT in the selection. ?
   */
  SEVER_CONNECTIVITY = "SEVER_CONNECTIVITY"
}

export interface Pointer<TSelf extends Pointer<TSelf>> {
  every: (predicate: (x: Node) => boolean) => Node
  some: (predicate: (x: Node) => boolean) => Node
  contains: (value: any) => Node

  map: (predicate: (x: Node) => any) => TSelf
  /**
   *
   * Note: If a node is currently selected and falls outside the filter, the node will be deselected.
   */
  filter: (predicate: (x: Node) => boolean) => TSelf
  reduce: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node
  reduce_right: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node

  /**
   * @alias pop_front
   */
  shift: () => TSelf
  /**
   * @alias push_front
   */
  unshift: (...x: any[]) => TSelf
  /**
   * Set all nodes to a given value.
   */
  fill: (value: any) => TSelf
  index_of: (value: any) => Many
  /**
   * Note: that since variable lengths are possible, .length will return a number of possibilities.
   */
  length: () => Many
  /**
   * Counts the number of nodes.
   * Note: that since graph's structure allows for branching, it could be that .length.max() != .count.
   */
  count: () => Node
  max: () => Node // TODO: This number returns a node within the "number line". In a way that .gt works on it. Similarly, .first returns -Infinity.
  min: () => Node

  is_nonempty: () => Node
  is_empty: () => Node

  /**
   * Reverse direction starting from the selection
   */
  reverse: () => TSelf
  /**
   * Select all nodes at a specific index/range.
   * TODO Make sure negative index works
   * TODO (index: number | IRange): IRange | Ray => is_number(index) ? Range.Eq(index) : index
   */
  at: (index: number | IRange) => Many
  /**
   * Maps the original structure to one where you find the distances at the Nodes.
   *
   * Note: This can include infinitely generating index options.
   */
  // TODO Map_reduce here.
  distance: () => TSelf
  /**
   * Ignores duplicates after visiting the first one.
   */
  unique: () => TSelf

  /**
   * Select all nodes in this structure
   */
  all: () => Many

  next: () => Many
  previous: () => Many
  /**
   * The terminal boundaries reachable from this selection.
   * Note: if you want ALL terminals, you should use .all().last
   */
  last: () => Many
  first: () => Many
  /**
   * Note: Plus and minus are simply moving the pointer along the graph a number of steps.
   */
  plus: (value: number | IRange) => Many
  minus: (value: number | IRange) => Many

  /**
   * Note: Having a possible next value doesn't mean that the current value isn't also terminal: It can be both.
   */
  has_next: () => Node
  has_previous: () => Node

  /**
   * Change the values of all selected nodes.
   */
  set: (value: any) => TSelf
  /**
   * Remove the selection from the underlying ray.
   * TODO: Default RemoveStrategy.PRESERVE_STRUCTURE
   */
  remove: (strategy?: RemoveStrategy) => TSelf
  pop_front: () => TSelf
  pop_back: () => TSelf
  /**
   * Push a value after the selection.
   * Note: In the case of an array, this will push "the structure of an array" after the selection. NOT a list of possibilities.
   */
  push: (...x: any[]) => TSelf
  /**
   * Push a value between the current and next node.
   */
  push_after: (...x: any[]) => TSelf
  /**
   * Push a value between the previous and current node
   */
  push_before: (...x: any[]) => TSelf
  push_back: (...x: any[]) => TSelf
  push_front: (...x: any[]) => TSelf


}
export interface Node extends Pointer<Node> {
  /**
   * Equal in value (ignores structure).
   */
  equals: (value: any) => Node
  /**
   * Structurally equal (ignores value).
   */
  isomorphic: (value: any) => Node
  /**
   * Structure, and all values within that structure, are equal.
   */
  identical: (value: any) => Node

  // TODO: If-else and other language primitives
  //       If-else is simply an if branch in the _false value.
  // TODO: If-branch has a .next depending on the value, if value is a type, it's to both, if not. It goes to either the true/false branch.
  // TODO: Dynamic values here should be allowed
  if: <True, False>(_true: True, _false?: False) => (True extends Pointer<infer T> ? True : Node) | (False extends Pointer<infer T> ? False : Node)

  /**
   * Greater than: does "value" come before this node.
   * TODO: What do to with the ambiguity of starting traversing from this, or value. It's probably an either on those two.
   */
  gt: (value: any) => Node
  gte: (value: any) => Node
  lt: (value: any) => Node
  lte: (value: any) => Node

  not: () => Node
  or: (value: boolean) => Node
  and: (value: boolean) => Node
  xor: (value: boolean) => Node
  nor: (value: boolean) => Node
  nand: (value: boolean) => Node
}
export interface Many extends Pointer<Many> {}



export class Graph {

}

class Ray {}

export default Ray;

/**
 * Range
 */
export interface IRange {
  or: (b: IRange) => IRange
  // and: (b: IRange) => IRange
  all: () => boolean
  contains: (x: number) => boolean
  more: (current: number, positive?: boolean) => boolean
  invert: () => IRange
}
export type Bound = { at: number, inclusive: boolean }
export class Range implements IRange {
  constructor(
    public lower: Bound,
    public upper: Bound,
  ) {
    if (lower.at > upper.at)
      throw new Error('Lower bound is greater than upper bound');
  }

  all = () => this.lower.at === -Infinity && this.upper.at === Infinity

  contains = (x: number): boolean => {
    return (this.lower === undefined || (this.lower.inclusive ? x >= this.lower.at : x > this.lower.at))
      && (this.upper === undefined || (this.upper.inclusive ? x <= this.upper.at : x < this.upper.at));
  }

  more = (current: number, positive: boolean = true) =>
    positive ? this.upper.at > current : this.lower.at < current

  or = (b: IRange): IRange => new MultiRange([this, b])

  invert = (): IRange => {
    if (this.all()) return new Range({ at: Infinity, inclusive: false }, { at: Infinity, inclusive: false });

    const ranges = []
    if (this.lower.at === -Infinity) ranges.push(new Range({ at: this.upper.at, inclusive: !this.upper.inclusive }, { at: Infinity, inclusive: true }));
    if (this.upper.at === Infinity) ranges.push(new Range({ at: -Infinity, inclusive: true }, { at: this.lower.at, inclusive: !this.lower.inclusive }));

    return ranges.length === 1 ? ranges[0] : new MultiRange(ranges)
  }

  public static Eq = (x: number) => new Range({ at: x, inclusive: true }, { at: x, inclusive: true })
  public static Gt = (x: number) => new Range({ at: x, inclusive: false }, { at: Infinity, inclusive: false })
  public static Gte = (x: number) => new Range({ at: x, inclusive: true }, { at: Infinity, inclusive: false })
  public static Lt = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: false })
  public static Lte = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: true })

  public static Between = (lower: number, upper: number) => new Range({ at: lower, inclusive: true }, { at: upper, inclusive: true })
}
export class MultiRange implements IRange {
  constructor(public ranges: IRange[] = []) {}

  all = (): boolean =>
    this.ranges.some(range => range.all());
  contains = (x: number): boolean =>
    this.ranges.some(range => range.contains(x));
  more = (current: number, positive: boolean = true): boolean =>
    this.ranges.some(range => range.more(current, positive));
  or = (b: IRange): IRange => new MultiRange([...this.ranges, ...(b instanceof MultiRange ? (b as MultiRange).ranges : [b])])

  invert = (): IRange => { throw new Error('Not implemented') }

}
