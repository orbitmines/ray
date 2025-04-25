export type MaybeAsync<T> = T | Promise<T>

export interface Node {
  equals: (x: any) => MaybeAsync<boolean>
}

export interface IRay<TNode extends Node, TCursor extends IRay<TNode, TCursor>> extends AsyncIterable<TNode> {
  /**
   * A list of locations our Ray is at.
   */
  selection: TCursor

  for_each: (callback: (x: TNode) => MaybeAsync<unknown>) => MaybeAsync<void>

  every: (predicate: (x: TNode) => MaybeAsync<boolean>) => MaybeAsync<boolean>
  some: (predicate: (x: TNode) => MaybeAsync<boolean>) => MaybeAsync<boolean>

  contains: (x: any) => MaybeAsync<boolean>

  filter: (predicate: (x: TNode) => MaybeAsync<boolean>) => TCursor
  map: <R>(predicate: (x: TNode) => R) => TCursor

  /**
   * Ignores duplicates after visiting the first one.
   */
  unique: () => TCursor
  /**
   * Maps the original structure to one where you find the distances at the Nodes.
   *
   * Note: This can include infinitely generating index options.
   */
  distance: () => TCursor
  /**
   * Select all nodes in this structure.
   */
  get all(): TCursor
  /**
   * Select all nodes at a specific index/range.
   */
  at: (index: number | IRange) => TCursor
  /**
   * Reverse direction starting from the selection
   */
  reverse: () => TCursor
  /**
   * A ray going both forward and backward.
   */
  bidirectional: () => TCursor
  /**
   * Deem initial and terminal cycles as part of the boundary:
   * - Each entry within a cycle is deemed a possible boundary value.
   */
  cycles_are_boundaries: () => TCursor


  is_none: () => MaybeAsync<boolean>
  is_some: () => MaybeAsync<boolean>

  push: (x: any) => TCursor
  push_front: (x: TNode) => TCursor
  push_back: (x: TNode) => TCursor

  get next(): TCursor
  has_next: () => MaybeAsync<boolean>
  get previous(): TCursor
  has_previous: () => MaybeAsync<boolean>

  get last(): TCursor
  is_last: () => MaybeAsync<boolean>
  get first(): TCursor
  is_first: () => MaybeAsync<boolean>
  get boundary(): TCursor
  on_boundary: () => MaybeAsync<boolean>

}

export class Ray implements Node, IRay<Ray, Ray> {

  __parents__: Ray[] = []
  with = (parent: Ray): Ray => { this.__parents__.push(parent); return this; }

  constructor(object: any = {}) {
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }

  private __selection__: Ray; get selection(): Ray { return this.__selection__ ??= new Ray() }; set selection(value: Ray) { this.__selection__ = value }

  for_each = async (callback: (x: Ray) => MaybeAsync<unknown>) => {
    for await (let x of this) { await callback(x) }
  }

  // TODO: What about an infinitely generating structure which we through some other finite method proof holds for this predicate?
  every = (predicate: (x: Ray) => MaybeAsync<boolean>) =>
    this.map(x => predicate(x)).filter(x => x.equals(false)).is_none()
  some = (predicate: (x: Ray) => MaybeAsync<boolean>) =>
    this.filter(predicate).is_some()
  contains = (value: any) =>
    this.some(x => x.equals(value))

  filter = Property.property<(x: Ray) => MaybeAsync<boolean>>(this, 'filter')
  map = Property.property<(x: Ray) => MaybeAsync<any>>(this, 'map')
  unique = Property.boolean(this, 'unique')
  distance = Property.boolean(this, 'distance')
  get all(): Ray { return new Ray({ selection: this }) }
  at = Property.property(this, 'at', (index: number | IRange): IRange | Ray => is_number(index) ? Range.Eq(index) : index)
  reverse = Property.boolean(this, 'reverse')
  bidirectional = Property.boolean(this, 'bidirectional')
  cycles_are_boundaries = Property.boolean(this, 'cycles_are_boundaries')

  is_none = (): MaybeAsync<boolean> => { throw new Error('Not implemented'); }
  is_some = async (): Promise<boolean> => !await this.is_none()

  equals = (x: any): MaybeAsync<boolean> => {
    throw new Error('Not implemented');
  }

  push = (x: any): Ray => { throw new Error("Method not implemented.") }
  push_front = (x: Ray): Ray => x.push(this.first)
  push_back = (x: Ray): Ray => this.last.push(x)

  get next(): Ray {
    throw new Error("Method not implemented.")
  }
  has_next = (): MaybeAsync<boolean> => this.next.is_some()
  get previous(): Ray {
    throw new Error("Method not implemented.")
  }
  has_previous = (): MaybeAsync<boolean> => this.previous.is_some()

  get last(): Ray { return this.filter(x => x.is_last()) }
  is_last = async (): Promise<boolean> => !await this.has_next()
  get first(): Ray { return this.reverse().last }
  is_first = async (): Promise<boolean> => !await this.has_previous()
  get boundary(): Ray { return this.bidirectional().filter(x => x.on_boundary()) }
  on_boundary = async (): Promise<boolean> => await this.is_first() || await this.is_last()

  async * [Symbol.asyncIterator](): AsyncGenerator<Ray> {

  }

}

export default Ray;

export namespace Property {
  export type Type<TInput, TOutput> = {
    (value: TInput): Ray
    value?: TOutput
  }
  export type Properties = {
    [P in keyof Ray]: P extends Property.Type<infer TInput, infer TOutput> ? Ray[P] : never;
  }
  export const property = <TInput = void, TOutput = TInput>(self: Ray, key: keyof Properties, setter: (value: TInput) => TOutput | Ray = (x) => x as any): Property.Type<TInput, TOutput> => {
    return (input: TInput) => {
      const output = setter(input);
      if (output instanceof Ray) return output;

      const ray = new Ray().with(self);
      (ray[key] as Property.Type<TInput, TOutput>).value = output
      return ray;
    }
  }
  export const boolean = (self: Ray, key: keyof Properties) => property(self, key, () => true)

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

  public static Eq = (x: number) => new Range({ at: x, inclusive: true }, { at: x, inclusive: true })
  public static Gt = (x: number) => new Range({ at: x, inclusive: false }, { at: Infinity, inclusive: false })
  public static Gte = (x: number) => new Range({ at: x, inclusive: true }, { at: Infinity, inclusive: false })
  public static Lt = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: false })
  public static Lte = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: true })

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