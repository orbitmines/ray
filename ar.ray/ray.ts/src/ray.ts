
export type MaybeAsync<T> = T | Promise<T>



export class FunctionBuilder {

}


// TODO: TRAVERSAL
//      - Program strategy: which branches to take first.
//        + Program stepping.
//      - Cycle detection & merger
//      - Intermediate results while others are still pending.
//      - Support yielding initial/terminals as well. (intermediates which are still looking)
//      -
export class Traverser {

  // TODO: Nothing selected but underlying structure. .first snaps to first (looped initial possible).
  // TODO: Can include disconnected pieces. Also should include a disconnected piece without an initial. and so no qualifier to .first.

  // TODO: What does .all().is_last() mean?
  // TODO: Separate Ray and "Ray Part"? .next in Ray vs .next in "Ray Part"

  // TODO: .next should be for each possible entry of terminal values. filter(x => x.is_last()) should also be for each possible selection, not the selection as a whole
  // TODO: What to do if there are non-uniques in here, or is it always .unique ?
  // states: AsyncIterable<State>
  // TODO: Remember that we're at a terminal? Not that .next again returns the first element
  // TODO: Filter should be applied to state.
  // state: Ray


}

export class Function {

}

export class Graph {

  // TODO: PRESERVING ALL STRUCTURES AND HISTORIES
  //       How? Preserving both the original structure, and the rewritten graph.
  //       -> Ambiguous rewrites etc..
  //       -> Partial, without necessarily checking the entire graph.
  //            (what happens when a second rewrite is given, which a pending first rewrite might still cancel):
  //            (possible) Additional ambiguity of order of rewrite. What if invariant and doesn't matter?
  //
  // TODO: Split the graph at the differences?. Add/remove
  //       OR better: Give the ray from which we want to access this, which contains the remove/non-removed history.
  //
  // TODO: Requires knowledge of what operation can effect what.



  // TODO: Rewrite with checking structure at nodes, or ignored. (Basically only looking at between structure)
  // rewrite: (lhs: Graph, rhs: Graph)
  // dpo, spo, cartesion product, tensor product, union, disjoint union etc...
  // compose matching domain/codomain

  // TODO: History of rewrites as ray

  // TODO: You want to be able to select X number of sub-graphs of a larger graph. Those subgraphs being selected how? Like: all the matches.
  // TODO: Already the case?: -> Select needs to be more intelligent: both initials/terminals as vertex selected. "Entire subgraphs"
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

export enum PushStrategy {
  /**
   * Push a value as a possible continuation. (Ignores the next node)
   */
  POSSIBLE_CONTINUATION = "POSSIBLE_CONTINUATION",
  /**
   * Push a value between the current and next node.
   */
  AFTER_CURRENT = "AFTER_CURRENT",
}

export class ConversionError extends Error {}




export namespace QueryProperty {

  export type MappedValue<T> = T | Node
  export type MappedFunction<T extends (...args: any[]) => any> = T extends (...args: infer Args) => infer Result ? (...args: { [Arg in keyof Args]: Args[Arg] }) => MaybeAsync<MappedValue<Result>> : never;
  export type MappedArgument<T> = T extends (...args: any[]) => any ? MappedFunction<T> : MappedValue<T>
  export type MappedArguments<T> = T extends any[] ? { [K in keyof T]: MappedArgument<T[K]> } : [MappedArgument<T>]

  export type Type<TValue = any, TSelf = any, TNextQuery = any> = {
    __self__: TSelf,
    __name__: keyof QueryProperty.Of<TSelf>,
    // TODO: "Any input can be a Node", cause we cast it to TValue, but how?
    // (...value: TValue extends any[] ? [...TValue | Node[]] : [TValue | Node]): TNextQuery
    (...value: MappedArguments<TValue>): TNextQuery
    value?: MappedArguments<TValue>
  }
  export type Of<TSelf> = {
    [P in keyof TSelf]: P extends QueryProperty.Type<infer TValue, infer TOutput, infer TNextQuery> ? TSelf[P] : never;
  }

}

export abstract class Query<TSelf extends Query<TSelf>> {

  /**
   *
   */
  __parent__?: Query<any>
  __select__?: string
  __property__?: keyof QueryProperty.Of<TSelf>

  protected property = <TValue = void, TOutput = TValue>(
    self: TSelf,
    name: keyof QueryProperty.Of<TSelf>
  ): QueryProperty.Type<TValue, TSelf, TSelf> => {

    const property = (...input: QueryProperty.MappedArguments<TValue>): TSelf => {
      const x: TSelf = new (Object.getPrototypeOf(this).constructor)();
      x.__parent__ = self;
      x.__property__ = name;
      (x[name] as QueryProperty.Type<TValue, TSelf, TSelf>).value = input

      return x;
    }
    property.__self__ = self;
    property.__name__ = name;
    return property;
  }

  protected select = <TNextQuery>(
    self: TSelf,
    name: keyof QueryProperty.Of<TSelf>,
    constructor: new () => TNextQuery
  ): QueryProperty.Type<void, TSelf, TNextQuery> => {
    const property = (): TNextQuery => {
      const x = new constructor() as any; // TODO Remove as any how?
      x.__parent__ = self;
      x.__select__ = name;

      return x;
    }
    property.__self__ = self;
    property.__name__ = name;
    return property;
  }

}

// TODO: Every method for Ray is also for Node? or: Ray/Cursor
// Nonoverlapping: is_last, equals/identical
// Different: join
// "Filter" not for Node?

export interface INode {}

export class Node extends Query<Node> implements INode {

  // TODO: There exists a Node which is "nothing selected of some structure": If nothing is selected. .equals is the same as .identical. Because [1, 2, 3] = [1, 2, 3]
  // TODO: Intermediate partial equality how?
  /**
   * Equal in value (ignores structure).
   */
  equals = this.property(this, 'equals')
  /**
   * Structurally equal (ignores value).
   */
  isomorphic = this.property(this, 'isomorphic')
  /**
   * Two rays are identical if there's no possible distinction between the "values and structure".
   *
   * Note: two different instantiations of the same array, say: new Ray(1, 2, 3) and new Ray(1, 2, 3) are in fact
   *       identical. From the perspective of JavaScript, you would say: No, they are two different entities, so they
   *       cannot be identical. But we're not considering JavaScripts perspective here. We're assuming only knowledge
   *       from the rays themselves. And they CANNOT see a difference between the two. You need additional structure on
   *       either ray to make that distinction. (This, for example, could be a label to the JavaScript object ID, which
   *       is what allows us to make that distinction in JavaScript.)
   */
  identical = (x: any) => this.equals(x).and(this.isomorphic(x))

  gt = this.property<number>(this, 'or')
  gte = this.property<number>(this, 'gte')
  lt = this.property<number>(this, 'lt')
  lte = this.property<number>(this, 'lte')

  not = this.property(this, 'not')
  or = this.property<boolean>(this, 'or')
  and = this.property<boolean>(this, 'and')
  xor = this.property<boolean>(this, 'xor')
  nor = this.property<boolean>(this, 'nor')
  nand = this.property<boolean>(this, 'nand')

}
export class Cursor extends Query<Cursor> implements INode {
  b = () => {}
}

export class Selection<TNode extends INode> extends Query<Selection<TNode>> {

  // TODO .some goes to a node.
  
  filter = this.property<(x: TNode) => boolean>(this, 'filter')

  nodes = this.select(this, 'nodes', Selection<Node>)

}

export class Ray {
  constructor(...args: any[]) {
  }
}

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

/**
 * Copied from https://github.com/lodash/lodash/blob/main/dist/lodash.js
 */
export const is_string = (value: any): value is string =>
  typeof value == 'string' || (!is_array(value) && is_object_like(value) && base_tag(value) == '[object String]');
export const is_boolean = (value: any): value is boolean =>
  value === true || value === false || (is_object_like(value) && base_tag(value) == '[object Boolean]');
export const is_number = (value: any): value is number =>
  typeof value == 'number' || (is_object_like(value) && base_tag(value) == '[object Number]');
export const is_object = (value: any): value is object =>
  value != null && (typeof value == 'object' || typeof value == 'function');
export const is_object_like = (value: any) =>
  value != null && typeof value == 'object';
export const is_iterable = <T = any>(value: any): value is Iterable<T> =>
  Symbol.iterator in Object(value) && is_function(value[Symbol.iterator]);
export const is_async_iterable = <T = any>(value: any): value is AsyncIterable<T> =>
  Symbol.asyncIterator in Object(value) && is_function(value[Symbol.asyncIterator]);
export const is_array = Array.isArray
export const is_function = (value: any): value is ((...args: any[]) => any) => {
  if (!is_object(value)) return false;

  let tag = base_tag(value);
  return tag == '[object Function]' || tag == '[object GeneratorFunction]' || tag == '[object AsyncFunction]' || tag == '[object Proxy]';
}
export const base_tag = (value: any) => {
  if (value == null) return value === undefined ? '[object Undefined]' : '[object Null]';

  return (Symbol.toStringTag && Symbol.toStringTag in Object(value)) ? raw_tag(value) : to_string(value);
}
export const raw_tag = (value: any) => {
  let isOwn = Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag),
    tag = value[Symbol.toStringTag];

  let unmasked;
  try {
    value[Symbol.toStringTag] = undefined;
    unmasked = true;
  } catch (e) {}

  let result = to_string(value);
  if (unmasked) {
    if (isOwn) {
      value[Symbol.toStringTag] = tag;
    } else {
      delete value[Symbol.toStringTag];
    }
  }
  return result;
}
export const to_string = (value: any): String => Object.prototype.toString.call(value);