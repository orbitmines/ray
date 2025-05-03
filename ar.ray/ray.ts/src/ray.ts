import rayTs from "../index";

export type MaybeAsync<T> = T | Promise<T>

export interface Node {
  equals: (x: any) => MaybeAsync<boolean>
}

export interface IRay<TNode> extends AsyncIterable<TNode> {

  for_each: (callback: (x: TNode) => MaybeAsync<unknown>) => MaybeAsync<unknown>
  every: (predicate: (x: TNode) => MaybeAsync<boolean>) => MaybeAsync<boolean>
  some: (predicate: (x: TNode) => MaybeAsync<boolean>) => MaybeAsync<boolean>
  contains: (value: any) => MaybeAsync<boolean>
  /**
   * Set all nodes within this ray to a given value.
   */
  fill: (value: any) => IRay<TNode>
  join: (value: any) => IRay<TNode>
  unshift: (...values: any[]) => IRay<TNode>
  /**
   * Mapping which only contains the specified index/range.
   */
  slice: (index: number | IRange) => IRay<TNode>
  pop_back: () => IRay<TNode>
  pop_front: () => IRay<TNode>
  /**
   * @alias pop_front
   */
  shift: () => IRay<TNode>
  index_of: (value: any) => IRay<TNode>
  
  get length(): IRay<TNode>

  filter: (predicate: (x: TNode) => MaybeAsync<boolean>) => IRay<TNode>
  /**
   * Opposite of filter.
   */
  exclude: (predicate: (x: TNode) => MaybeAsync<boolean>) => IRay<TNode>
  map: <R>(predicate: (x: TNode) => R) => IRay<TNode>
  /**
   * Ignores duplicates after visiting the first one.
   */
  unique: () => IRay<TNode>
  /**
   * Maps the original structure to one where you find the distances at the Nodes.
   *
   * Note: This can include infinitely generating index options.
   */
  distance: () => IRay<TNode>
  /**
   * Select all nodes in this structure.
   */
  all: () => IRay<TNode>
  /**
   * Select all nodes at a specific index/range.
   */
  at: (index: number | IRange) => IRay<TNode>
  /**
   * Reverse direction starting from the selection
   */
  reverse: () => IRay<TNode>
  /**
   * A ray going both forward and backward.
   */
  bidirectional: () => IRay<TNode>
  /**
   * Change the values of all selected nodes.
   */
  set: (value: any) => IRay<TNode>

  is_none: () => MaybeAsync<boolean>
  is_some: () => MaybeAsync<boolean>

  /**
   * Remove the selection from the underlying ray. (This preserves the surrounding structure)
   * The original structure only severs the connections to removed structure. (The removed part retains in structure)
   * Returns the removed structure.
   */
  remove: () => IRay<TNode>

  /**
   * Push a value as a possible continuation. (Ignores the next node)
   */
  push: (x: any) => IRay<TNode>
  /**
   * Push a value between the current and next node.
   * TODO: Better name?
   */
  push_after: (x: any) => IRay<TNode>
  push_front: (x: TNode) => IRay<TNode>
  push_back: (x: TNode) => IRay<TNode>

  /**
   *
   * Note: If there are multiple things selected, the ones without a 'next' node are discarded. With a terminal loop,
   * one can keep terminal boundaries in the selection.
   */
  get next(): IRay<TNode>
  has_next: () => MaybeAsync<boolean>
  get previous(): IRay<TNode>
  has_previous: () => MaybeAsync<boolean>

  get last(): IRay<TNode>
  is_last: () => MaybeAsync<boolean>
  get first(): IRay<TNode>
  is_first: () => MaybeAsync<boolean>
  get boundary(): IRay<TNode>
  on_boundary: () => MaybeAsync<boolean>

  isomorphic: (x: IRay<TNode>) => MaybeAsync<boolean>

  to_number: () => MaybeAsync<number>

}

export class FunctionBuilder {

}

export class State {

}

export class Traverser {

}

export class Graph {

}

export class Cursor {
  selection: Ray[] = []
}

export class Ray implements Node, IRay<Ray> {

  for_each = async (callback: (x: Ray) => MaybeAsync<unknown>) =>
    await callback(this.all())
  // TODO: What about an infinitely generating structure which we through some other finite method proof holds for this predicate?
  every = (predicate: (x: Ray) => MaybeAsync<boolean>) =>
    this.map(x => predicate(x)).filter(x => x.equals(false)).is_none()
  some = (predicate: (x: Ray) => MaybeAsync<boolean>) =>
    this.filter(predicate).is_some()
  contains = (value: any) =>
    this.some(x => x.equals(value))
  fill = (value: any) =>
    this.all().set(value)
  // TODO: Make sure this works for branching possibilities (no duplicate inserted values)
  // TODO: Make sure this works for different levels of description say ABCDEF/[ABC][DEF] then push between C-D.
  join = (value: any) =>
    this.all().exclude(x => x.is_last()).push_after(value)
  unshift = (...xs: any[]) => {
    xs.reverse().forEach(x => this.push_front(x));
    return this;
  }
  slice = (index: number | IRange) => {
    this.at((is_number(index) ? Range.Eq(index) : index).invert()).remove()
    return this;
  }
  pop_front = () =>
    this.first.remove()
  pop_back = () =>
    this.last.remove()
  shift = this.pop_front
  // TODO: Could merge the lengths into branches. so [-5, +3] | [-5, -2] to [-5, -3 | -2]
  index_of = (value: any) =>
    this.filter(x => x.equals(value)).distance().all().unique()

  // TODO: Needs a +1 and sum over distances, abs for the negative steps.
  get length() { return this.distance().filter(x => x.is_last()).map(async x => await x.to_number() + 1).all().unique() }

  filter = Property.property<(x: Ray) => MaybeAsync<boolean>>(this, 'filter')
  exclude = Property.property<(x: Ray) => MaybeAsync<boolean>>(this, 'exclude')
  map = Property.property<(x: Ray) => MaybeAsync<any>>(this, 'map')
  unique = Property.boolean(this, 'unique')
  distance = Property.boolean(this, 'distance')
  // TODO for each with multiple cursors filters with .unique (as looping through must not include the same one twice)
  all = Property.boolean(this, 'all')
  at = Property.property(this, 'at', (index: number | IRange): IRange | Ray => is_number(index) ? Range.Eq(index) : index)
  reverse = Property.boolean(this, 'reverse')
  bidirectional = Property.boolean(this, 'bidirectional')
  set = Property.property<any>(this, 'set')

  is_none = (): MaybeAsync<boolean> => { throw new Error('Not implemented'); }
  is_some = async (): Promise<boolean> => !await this.is_none()

  // TODO, Should only sever connections which are NOT in the selection.
  remove = (): Ray => { throw new Error("Method not implemented.") }

  push = (x: any): Ray => { throw new Error("Method not implemented.") }
  push_after = (x: any): Ray => { throw new Error("Method not implemented.") }
  push_front = (x: Ray): Ray => x.push(this.first)
  push_back = (x: Ray): Ray => this.last.push(x)

  get next(): Ray { return this.at(1) }
  has_next = (): MaybeAsync<boolean> => this.next.is_some()
  get previous(): Ray { return this.at(-1) }
  has_previous = (): MaybeAsync<boolean> => this.previous.is_some()

  get last(): Ray { return this.filter(x => x.is_last()) }
  is_last = async (): Promise<boolean> => !await this.has_next()
  get first(): Ray { return this.reverse().last }
  is_first = async (): Promise<boolean> => !await this.has_previous()
  get boundary(): Ray { return this.bidirectional().filter(x => x.on_boundary()) }
  on_boundary = async (): Promise<boolean> => await this.is_first() || await this.is_last()

  async * [Symbol.asyncIterator](): AsyncGenerator<Ray> {

  }

  // TODO: Equals in multicursor means any one of the cursors are equal.
  equals = (x: any): MaybeAsync<boolean> => {
    throw new Error('Not implemented');
  }
  isomorphic = (x: any): MaybeAsync<boolean> => {
    // TODO: Equals ignores the structure, and goes directly into self. Isomorphic doesnt
    throw new Error('Not implemented');
  }

  // TODO: Throw if not number
  to_number = (): MaybeAsync<number> => {
    throw new Error('Not implemented');
  }

  /**
   *
   */

  __parent__?: Ray
  with = (parent: Ray): Ray => { this.__parent__ = parent; return this; }

  /**
   *
   */
  static any = (x: any): Ray => {

  }
}

export default Ray;

export namespace Property {
  export type Type<TInput, TOutput> = {
    __self__: Ray,
    __name__: keyof Properties,
    (value: TInput): Ray
    value?: TOutput
  }
  export type Properties = {
    [P in keyof Ray]: P extends Property.Type<infer TInput, infer TOutput> ? Ray[P] : never;
  }
  export const property = <TInput = void, TOutput = TInput>(self: Ray, name: keyof Properties, setter: (value: TInput) => TOutput | Ray = (x) => x as any): Property.Type<TInput, TOutput> => {
    const property = (input: TInput) => {
      const output = setter(input);
      if (output instanceof Ray) return output;

      const ray = new Ray().with(self);
      (ray[name] as Property.Type<TInput, TOutput>).value = output
      return ray;
    }
    property.__self__ = self;
    property.__name__ = name;
    return property;
  }
  export const boolean = (self: Ray, key: keyof Properties) => property(self, key, () => true)

  export const is = (property: Property.Type<any, any>): boolean => !!value(property)
  export const modular_is = (property: Property.Type<any, any>): any => {
    let value = false;
    while (property !== undefined) {
      if (property.value) value = !value;

      property = property.__self__.__parent__[property.__name__] as Property.Type<any, any>
    }
    return value;
  }
  export const value = (property: Property.Type<any, any>): any => {
    while (property !== undefined) {
      if (property.value) return property.value;

      property = property.__self__.__parent__[property.__name__] as Property.Type<any, any>
    }
    return undefined;
  }

}

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