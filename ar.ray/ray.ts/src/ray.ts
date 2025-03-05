

export enum Type {
  REFERENCE = "REFERENCE", //TODO: Reference could be vertex?
  VERTEX = "VERTEX",
  INITIAL = "INITIAL",
  TERMINAL = "TERMINAL",
  // INITIAL_EXTREME,
  // TERMINAL_EXTREME,
  // WALL // TODO: Could be renamed empty?
}

export type AnyOf<T> = T | T[] | (() => T | T[])
export type Any = undefined | AnyOf<Ray> | AnyOf<State>
export type MaybeAsync<T> = T | Promise<T>

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
  constructor(public ranges: IRange[] = []) {
  }

  all = (): boolean =>
    this.ranges.some(range => range.all());
  contains = (x: number): boolean =>
    this.ranges.some(range => range.contains(x));
  more = (current: number, positive: boolean = true): boolean =>
    this.ranges.some(range => range.more(current, positive));
  or = (b: IRange): IRange => new MultiRange([...this.ranges, ...(b instanceof MultiRange ? (b as MultiRange).ranges : [b])])

}

// TODO: Could be merged back into Ray
export class Program {

  tasks: ((value?: unknown) => void)[] = []

  constructor() {
  }

  next = () => {
    if (this.i >= this.max || this.tasks.length === 0) {
      this.done()
      return;
    }

    this.tasks.pop()()

    this.i++;
  }
  done: (value?: unknown) => void; // TODO: Could reject pending promises on done, is that necessary or can we just leave them be? Or is there some other way in javascript to dispense of them

  i: number = 0;
  max: number = 0;
  step = async (entrypoint: () => Promise<any>, i: number) => {
    this.i = 0; this.max = i;

    const done = new Promise(resolve => this.done = resolve);

    entrypoint()
    this.next()

    await done;
  }

  wait = (object?: {

  }) => {
    const task = new Promise((resolve, reject) => {
      this.tasks.push(resolve)
    })

    this.next()

    // await this.exec(async () => {})
    return task;
  }

}

export class AlteredIterable<T, R = T> implements AsyncIterable<R> {

  public x: AsyncIterable<T>
  constructor(x: Iterable<T> | AsyncIterable<T>, public program: Program = new Program()) {
    async function * to_async_iterable<T>(iterable: Iterable<T>): AsyncGenerator<T> {
        for (let x of iterable) { yield x }
    }
    this.x = is_async_iterable(x) ? x : to_async_iterable(x)
  }

  private __map__?: (x: T) => R
  map = <R2>(map: (x: R) => R2): AlteredIterable<R, R2> => {
    const iterable = new AlteredIterable<R, R2>(this[Symbol.asyncIterator](), this.program);
    iterable.__map__ = map;
    return iterable;
  }

  private __filter__?: (x: R) => boolean
  filter = (predicate: (x: R) => boolean): AlteredIterable<R> => {
    const iterable = new AlteredIterable<R>(this[Symbol.asyncIterator](), this.program);
    iterable.__filter__ = predicate;
    return iterable;
  }

  async * [Symbol.asyncIterator](): AsyncGenerator<R> {
    const iterator = this.x[Symbol.asyncIterator]();

    while (true) {
      await this.program.wait()

      let { done, value } = await iterator.next();
      if (done) break;

      value = this.__map__ ? this.__map__(value) : value

      if (this.__filter__ && !this.__filter__(value)) continue;

      yield value;
    }
  }

}

class Ray implements AsyncIterable<Ray> {

  public __state__: () => State; get state(): State { return this.__state__() }; set state(x: Any) {
    // this.__state__ = ((x: Any): (() => State) => {
    //   if (x === undefined) return State.none;
    //   if (is_function(x)) return () => {
    //     let value = x();
    //     if (value instanceof Array) return // TODO
    //     return value instanceof State ? value : value.state
    //   };
    //   let value = x instanceof Array ? Ray.iterable(x) : Ray.ref(x);
    //   return () => value;
    // })(x)
  }
  
  constructor(x: Any = undefined, object: any = {}) {
    this.state = x;
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }


  // TODO: Clone vs replacing references to this new one?
  clone = (object: Partial<Ray> = {}): Ray => {
    return new Ray(this.state, {
      ...Object.fromEntries(['__filter__', '__map__', '__reverse__'].map(key => [key, (this as any)[key]])),
      ...object
    })
  }

  // TODO: map where each change in sequence effects the next one, vs map where we expect the initial structure to be the same
  // TODO: How does .map effect .self/.terminal/.initial
  public __map__: ((x: Ray) => any)[] = []
  map = <T>(predicate: (x: Ray) => T): Ray => this.clone({ __map__: [...this.__map__, predicate] })

  // If the starting Ray is a vertex, which is excluded, it acts like an initial.
  public __filter__: ((x: Ray) => MaybeAsync<boolean>)[] = []
  filter = (predicate: (x: Ray) => MaybeAsync<boolean>): Ray => this.clone({ __filter__: [...this.__filter__, predicate] })

  public __reverse__: boolean = false
  get reverse(): Ray { return this.clone({ __reverse__: !this.__reverse__ })}

  public __at__?: IRange
  at = (index: number | IRange): Ray => {
    if (is_number(index)) {
      if (index === Infinity) return this.terminal_boundary;
      if (index < 0) return this.reverse.at(index * -1);

      index = Range.Eq(index)
    }

    if (this.__at__ === undefined) { return this.clone({ __at__: index })}

    // this.__at__ = this.__at__.or(index)
    throw new Error(`Not sure yet whether to allow multi-chaining .at or what else to do with it`);
    return this;
  }

  // TODO: Functions that alter structure like .flatten/.flat_map, what else?

  // TODO Distance/Index mapping
  // TODO: join/pop/shift/sort/max/min or similar alterations

  // get initial(): Ray { return this.__reverse__ ? this.state.terminal : this.state.initial }; set initial(x: Any) { this.__reverse__ ? this.state.terminal = x : this.state.initial = x; }
  // get self(): Ray { return this.state.self }; set self(x: Any) { this.state.self = x; }
  // get terminal(): Ray { return this.__reverse__ ? this.state.initial : this.state.terminal }; set terminal(x: Any) { this.__reverse__ ? this.state.initial = x : this.state.terminal = x; }

  // is_initial = async () => this.initial.is_none()
  // is_terminal = async () => this.terminal.is_none()
  // is_reference = async () => await this.is_initial() && await this.is_terminal()
  // is_empty_reference = async () => await this.is_reference() && await this.self.is_none()
  // is_boundary = async () => xor(await this.is_initial(), await this.is_terminal())
  // is_vertex = async () => !await this.is_initial() && !await this.is_terminal()
  // is_extreme = async () => await this.is_none() && await this.is_boundary()
  // is_wall = async () => await this.is_none() && !await this.is_initial() && !await this.is_terminal()
  //
  // is_none = async () => this.state.__none__ || this.max_length === 0;
  // is_some = async () => !await this.is_none();

  // type = async (): Promise<Type> => {
  //   if (await this.is_reference()) return Type.REFERENCE;
  //   if (await this.is_initial()) return Type.INITIAL;
  //   if (await this.is_terminal()) return Type.TERMINAL;
  //   if (await this.is_vertex()) return Type.VERTEX;
  //   // if (this.is_wall()) return Type.WALL;
  //   throw new Error('Should not happen')
  // }

  // TODO: At each step, the intermediate iterator result which gets returned, might be expanded on later, when deemed it has changed, when would you want to know about that change mid-iteration?
  // TODO: What about traversing and mapping the entire structure including terminal/initial structure?
  async * traverse({
    strategy,
    history,
  }: { strategy?: (x: Ray) => Iterable<Ray | Ray[]>, history?: Ray } = {}) {
    const { __filter__, __map__ } = this;

    function * found(unfiltered: Iterable<Ray>) {
      // TODO history.contains() ; Only needs a 'have I been here flag'

      let x = new AlteredIterable(unfiltered)
      // TODO: This doesnt work, filter.map.filter is different
      __filter__.forEach(filter => x = x.filter(filter))
      __map__.forEach(map => x = x.map(map))


    }
    throw new Error('Not implemented')

    // TODO: History in case of .bidirectional after a .filter is?

    // TODO: Traversal should support yielding initial/terminals as well

    // TODO: Program.step here with metadata

    // TODO Instantly yield intermediate results by returning an iterable of which the next values are still pending.
    // TODO: Returned iterable result can also be infinitely generating


    // TODO: Map maps .self values of each vertex.
    // TODO: Map replaces either original structure or within the altered (filtered/mapped) structure?

    // TODO: Allow for additional operations on .traverse/.last like .push_back, where we have pending for non-found values of .last yet
  }

  // TODO: Rename to push? And composing for function initials?
  compose = (b: Ray): Ray => {
    // TODO: Alterations on original structure or on altered or on copy ..


    // if (this.is_boundary()) return this.map(x => x.compose(b))
    // if (b.is_boundary()) return b.map(x => this.compose(x)) //TODO should return x.
    throw new Error('Not implemented')
  }

  some = (predicate: (x: Ray) => boolean) => this.filter(predicate).has_next()
  every = (predicate: (x: Ray) => boolean) => !this.map(x => predicate(x)).filter(x => x.equals(false)).has_next()

  for_each = async (callback: (x: Ray) => unknown) => {
    for await (let x of this) { callback(x) }
  }

  // TODO: Index of/Distance function can be circular ; multiple/generating indexes as an answer
  // TODO: Indexes relative to what? The original structure probably, or the applied filter? Or which filter?
  // TODO: Might never give a result because of filter and infinitely generating terminal.
  // TODO: Depending on how the program steps, this might not be in ascending order.
  // TODO: Distance is possibly a sequence of index steps, as [-5, +3] != [-2] (not in every case) - take .bidirectional for example. (Or can be thought of as a list of binary values for left/right)
  distance = (): Ray => { throw new Error('Not implemented') }
  index_of = (b: any) => this.filter(x => x.equals(b)).distance()
  get length() { return this.filter(x => x.is_last()).distance() }

  contains = async (b: any) => this.some(x => x.equals(b))

  equals = (b: any): boolean => {
    throw new Error('Not implemented')

    if (b instanceof Ray) {}
  }

  async * [Symbol.asyncIterator](): AsyncGenerator<Ray> {
    function * strategy(x: Ray) { yield x.terminal; }
    yield * this.traverse({ strategy })
  }

  // TODO: Change strategy as a result of this function being applied.
  // TODO: Bidirectional opens up the problem that something can be -5, then + 3 steps ahead, yet not show up as the initial -2. How should this be handled?
  get bidirectional(): Ray {

    // function * strategy(x: Ray) { yield [x.initial, x.terminal]; }
    // yield * this.traverse({ strategy })
  }

  get next(): Ray { return this.at(1); }
  get current(): Ray { return this.at(0); }
  get previous(): Ray { return this.at(-1); }

  has_next = async () => this.next.is_none()
  has_previous = async () => this.previous.is_none()

  // TODO: When would you use a variant of first/last which includes terminal/initial cycle states?
  is_last = async () => !await this.has_next()
  is_first = async () => !await this.has_previous()
  get last(): Ray { return this.filter(x => x.is_last()) }
  get first(): Ray { return this.reverse.last }

  // is_on_boundary = async () => await this.is_first() || await this.is_last()
  // get boundary(): Ray {
  //   return this.bidirectional
  //     .filter(x => x.is_on_boundary())
  //     .map(x => x.is_first() ? Ray.initial({ terminal: x }) : Ray.terminal({ initial: x }))
  // }

  // TODO" Ray.terminal should automatically be linked to the provided 'initial' (should respect reverse)
  get terminal_boundary(): Ray { return this.last.map(x => Ray.terminal({ initial: x })) }
  get initial_boundary(): Ray { return this.reverse.terminal_boundary }

  // TODO: Push-back list of possibilities vs list to follow after
  push_front = (b: Ray): Ray => b.compose(this.first)
  push_back = (b: Ray): Ray => this.last.compose(b)

  in_orbit = (): boolean => {
    throw new Error('Not implemented')
  }

  static ref = (self: Any): Ray => new Ray(new State({ self }))

  static initial = (object: any = {}) => new Ray(new State({ self: State.none(), terminal: State.none(), ...object }))
  static vertex = (object: any = {}) => new Ray(new State({ initial: State.none(), self: State.none(), terminal: State.none(), ...object }))
  static terminal = (object: any = {}) => new Ray(new State({ initial: State.none(), self: State.none(), ...object }))
  
  // TODO: .iterable conversion should be automatic, and additional functionality of string & other objects
  // TODO: Could be added automatically.
  static string = (string: string) => Ray.iterable(string)
  static iterable = <T>(x: Iterable<T>) => this.iterator(x[Symbol.iterator]());
  static iterator = <T>(x: Iterator<T>) => {
    const next = (previous?: Ray): Ray => {
      const { done, value } = x.next();

      const current = done ? Ray.terminal({ initial: previous }) : Ray.vertex({ __object__: value, initial: previous });
      previous.terminal = current

      if (done) return current

      current.terminal = () => next(current)

      return current
    }

    const iterator = Ray.initial({ terminal: () => next(iterator) });

    return iterator;
  }
}

class State {

  public __object__?: any

  // TODO public visitors: State

  private __initial__: Ray = new Ray(); get initial(): Ray { return this.__initial__ }; set initial(x: Any) { this.__initial__ = new Ray(x); }
  private __self__: Ray = new Ray(); get self(): Ray { return this.__self__ }; set self(x: Any) { this.__self__ = new Ray(x); }
  private __terminal__: Ray = new Ray(); get terminal(): Ray { return this.__terminal__ }; set terminal(x: Any) { this.__terminal__ = new Ray(x); }

  constructor(object: any = {}) {
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }
  
  public __none__?: boolean // TODO Better solutions for this


  static none = () => new State({ __none__: true })

}
export default State;

const xor = (a: boolean, b: boolean) => (a && !b) || (!a && b)

// TODO Copy from lodash - remove as a dependency.
import _ from "lodash";
export const is_string = (_object: any): _object is string => _.isString(_object)
export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
export const is_number = (_object: any): _object is number => _.isNumber(_object);
export const is_object = (_object: any): _object is object => _.isObject(_object);
export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
export const is_arState = <T = any>(_object: any): _object is T[] => _.isArray(_object);
export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check
export const is_error = (_object: any): _object is Error => _.isError(_object);
export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object);
