import MappedResult = QueryProperty.MappedResult;
import MappedFunction = QueryProperty.MappedFunction;

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

  export type MappedValue<T> = T extends void ? void : T | Node
  export type MappedFunction<T extends (...args: any[]) => any> = T extends (...args: infer Args) => infer Result ? (...args: { [Arg in keyof Args]: Args[Arg] }) => MaybeAsync<MappedValue<Result>> : never;
  export type MappedArgument<T> = T extends (...args: any[]) => any ? MappedFunction<T> : MappedValue<T>
  export type MappedArguments<T> =
    0 extends (1 & T) /* T = any? */ ? [MappedArgument<T>] :
      T extends void ? [] :
        T extends any[] ? { [K in keyof T]: MappedArgument<T[K]> } :
          [MappedArgument<T>]

  export type Type<TValue = any, TSelf = any, TNextQuery = any> = {
    __self__: TSelf,
    __name__: keyof QueryProperty.Of<TSelf>,
    // TODO: "Any input can be a Node", cause we cast it to TValue, but how?
    // (...value: TValue extends any[] ? [...TValue | Node[]] : [TValue | Node]): TNextQuery
    (...value: MappedArguments<TValue>): TNextQuery
    value?: MappedArguments<TValue>
    cast: <TQuery extends IQuery>(constructor: new () => TQuery) => Type<TValue, TSelf, TQuery>
  }
  export type Of<TSelf> = {
    [P in keyof TSelf]: P extends QueryProperty.Type<infer TValue, infer TOutput, infer TNextQuery> ? TSelf[P] : never;
  }

}

// TODO: This class can be cleaned up a bit
export interface IQuery {
  __parent__?: IQuery
}
export abstract class Query<TSelf extends Query<TSelf>> implements IQuery {

  /**
   *
   */
  __parent__?: IQuery
  __select__?: string
  __property__?: keyof QueryProperty.Of<TSelf>

  protected property = <TValue = void>(
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
    property.cast = <TQuery extends IQuery>(constructor: new () => TQuery): QueryProperty.Type<TValue, TSelf, TQuery> => {
      const cast_property = (...input: QueryProperty.MappedArguments<TValue>): TQuery => {
        const x: TSelf = property(...input);
        const casted = new constructor();
        casted.__parent__ = x;

        return casted;
      }
      cast_property.__self__ = self;
      cast_property.__name__ = name;
      cast_property.cast = <TQuery>(constructor: new () => TQuery): QueryProperty.Type<TValue, TSelf, TQuery> => { throw new Error('Cannot recast') }
      return cast_property;
    }
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
    property.cast = <TQuery>(constructor: new () => TQuery): QueryProperty.Type<void, TSelf, TQuery> => { throw new Error('No point in casting a select') }
    return property;
  }

}

// TODO:
export abstract class Selection<TNode extends Selection<TNode>> extends Query<TNode> {

  this = () => this as any as TNode

  // TODO: What about an infinitely generating structure which we through some other finite method proof holds for this predicate?
  // TODO: .every on a node's location. Should it start traversing from there, yes?
  every = (predicate: MappedFunction<(x: Node) => boolean>) =>
    this.map(x => predicate(x)).filter(x => x.equals(false)).is_empty()
  some = (predicate: MappedFunction<(x: Node) => boolean>) =>
    this.filter(predicate).is_nonempty()
  contains = (value: any) =>
    this.some(x => x.equals(value))
  map = this.property<(x: Node) => any>(this.this(), 'map')
  filter = this.property<(x: Node) => boolean>(this.this(), 'filter').cast(Ray)

  nodes = this.select<Node>(this.this(), 'nodes', Node)


  /**
   * Set all nodes within this ray to a given value.
   */
  fill = (value: any) =>
    this.all().set(value)

  unshift = (...xs: any[]) => this.push_front(...xs);
  pop_front = () =>
    this.first.remove()
  pop_back = () =>
    this.last.remove()
  /**
   * @alias pop_front
   */
  shift = this.pop_front
  // TODO index_of vs steps used to get there. -1, 1, 1, -1 etc..
  // TODO: Could merge the lengths into branches. so [-5, +3] | [-5, -2] to [-5, -3 | -2]
  // TODO: Now doesnt look for negative indexes.
  index_of = (value: any) =>
    this.filter(x => x.equals(value)).distance().all().unique()
  // TODO: Needs a +1 and sum over distances, abs for the negative steps.
  /**
   * Note: that since variable lengths are possible, .length will return a number of possibilities.
   */
  get length() { return this.distance().filter(x => x.is_last()).map(async x => await x.to_number() + 1).all().unique() }
  /**
   * Counts the number of nodes.
   * Note: that since a ray's structure allows for branching, it could be that .length.max() != .count.
   */
  count = () => new Node().from(async () =>
    await this.length.max().equals(Infinity).to_boolean() ? new Node(Infinity) : this.reduce(async (acc) => await acc.to_number() + 1, 0))

  is_nonempty = () => this.is_empty().not()
  is_empty = () => this.reduce(async (acc, current, cancel) => { cancel(); return false; }, true)
  max = () => this.reduce(async (acc, current, cancel) => {
    if (acc.equals(Infinity)) return cancel(); // Stop reducing if already reached infinity.
    return await acc.gt(current).to_boolean() ? acc : current;
  }, undefined)
  min = () => this.reduce(async (acc, current, cancel) => {
    if (acc.equals(-Infinity)) return cancel(); // Stop reducing if already reached -infinity.
    return await acc.lt(current).to_boolean() ? acc : current; // TODO: Move these conditionals into a property?
  }, undefined)

  // TODO: Way to get index from the ray. With a default .distance function applied somewhere?
  // TODO: Allow for intermediate result. -> Halting problem
  // TODO: Checks for uniqueness, only once per location: TODO: What would a reduce look like that doesn't do this (could be useful for intermediate results)
  // TODO: The order in which things appear can vary based on what strategy is used in the traverser. Can be influenceced by using things like .all
  reduce = this.property<[(accumulator: Node, current: Node, cancel: () => void) => void | any, initial_value: any]>(this.this(), 'reduce').cast(Node)
  reduce_right = (callback: (accumulator: Node, current: Node, cancel: () => void) => void | any, initial_value: any) => this.reverse().reduce(callback, initial_value)

  /**
   * Applies successive transformation and returns the result.
   *
   * TODO: Could figure out what can be done in parallel and what can't.
   */
  apply = this.property<Query<any>[]>(this.this(), 'apply')
  /**
   * Reverse direction starting from the selection
   */
  reverse = this.property<void>(this.this(), 'reverse')
  /**
   * Select all nodes at a specific index/range.
   * TODO Make sure negative index works
   * TODO (index: number | IRange): IRange | Ray => is_number(index) ? Range.Eq(index) : index
   */
  at = this.property<number | IRange>(this.this(), 'at').cast(Ray)

  /**
   * Change the values of all selected nodes.
   */
  set = this.property<any>(this.this(), 'set')
  /**
   * Remove the selection from the underlying ray.
   * TODO: Default RemoveStrategy.PRESERVE_STRUCTURE
   */
  remove = this.property<void | RemoveStrategy>(this.this(), 'remove')

  __push__ = this.property<[any[], PushStrategy]>(this.this(), '__push__')
  /**
   * Push a value after the selection.
   * Note: In the case of an array, this will push "the structure of an array" after the selection. NOT a list of possibilities.
   */
  push = (...x: any[]) => this.__push__(x, PushStrategy.POSSIBLE_CONTINUATION)

  /**
   * Push a value between the current and next node.
   */
  push_after = (...x: any[]) => this.__push__(x, PushStrategy.AFTER_CURRENT)
  /**
   * Push a value between the previous and current node
   */
  push_before = (...x: any[]) => this.reverse().push_after(...x)

  /**
   * Push a value to the end of the ray.
   */
  push_back = (...x: any[]) => this.last.push(...x)
  /**
   * Push a value to the beginning of the ray.
   * TODO: In the case of an array, push_front(A, B, C) will push [A, B, C] in front of [D, E, F] making [A, B, C, D, E, F].
   */
  push_front = (...x: any[]) => new Node(...x).push_back(this.first)


  /**
   * Select all nodes in this structure
   */
  all = this.property<void>(this.this(), 'all').cast(Ray)


  // TODO: Should return Ray?. Many possibilities here.
  get next() { return this.at(1) }
  get previous() { return this.at(-1) }

  /**
   * The terminal boundaries reachable from this selection.
   * Note: if you want ALL terminals, you should use .all().last
   * TODO: This doesnt work, and should you want terminals reachable from this selection??
   */
  get last() { return this.filter(x => x.is_last()) }
  get first() { return this.reverse().last }

}

export class Node extends Selection<Node> {

  constructor(...args: any[]) {
    super()
    if (args.length !== 0) this.__parent__ = new Node().from(() => Node.converter(args));
  }

  // TODO: There exists a Node which is "nothing selected of some structure": If nothing is selected. .equals is the same as .identical. Because [1, 2, 3] = [1, 2, 3]
  // TODO: Intermediate partial equality how?
  /**
   * Equal in value (ignores structure).
   */
  equals = this.property<any>(this, 'equals')
  /**
   * Structurally equal (ignores value).
   */
  isomorphic = this.property<any>(this, 'isomorphic')
  /**
   * Two rays are identical if there's no possible distinction between the "values and structure".
   *
   * TODO: Slight rephrasing of this
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

  has_next = () => this.next.is_some()
  has_previous = () => this.previous.is_some()

  // Todo: any terminals
  is_last = () => this.has_next().not()
  is_first = () => this.has_previous().not()

  // TODO: Throw if not number
  to_number = (): MaybeAsync<undefined | number> => {
    throw new Error('Not implemented');
    // throw new ConversionError('Not a number')
  }
  to_boolean = (): MaybeAsync<undefined | boolean> => {
    throw new Error('Not implemented');
  }
  to_array = <R>(predicate: (x: Ray) => MaybeAsync<R>): MaybeAsync<R[]> => {
    throw new Error('Not implemented');
  }
  // to_function = (): MaybeAsync<(...args: unknown[]) => unknown> => {
  //   throw new Error('Not implemented');  // }
  to_object = (): MaybeAsync<object> => {
    throw new Error('Not implemented');
  }
  cast = <T>(constructor: new () => T): MaybeAsync<T> => {
    throw new Error('Not implemented');
  }
  to_string = (): MaybeAsync<string> => {
    throw new Error('Not implemented');
  }

  /**
   * Sometimes it's necessary to do an async call to construct a Node. By using this you can hide the promise.
   */
  from = (getter: () => MaybeAsync<Node>): this => {
    if (this.__parent__ !== undefined) throw new Error('Can only use .from on an uninitialized Node.');
    (this.from as any).value = getter
    return this;
  }

  /**
   * Converts any JavaScript value to a ray.
   */
  static converter: (x: any) => Node = x => {
    // if (x instanceof Array) {
    //   if (x.length === 0) return new Ray()
    //   if (x.length === 1) x = x[0]
    // }
    //
    // if (x instanceof Ray) return x;

    throw new Error('Not implemented')
  }
}
export class Ray extends Selection<Ray> {

  // selection = this.select<Ray>(this.this(), 'selection', Ray)

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