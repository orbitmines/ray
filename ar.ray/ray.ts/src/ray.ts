

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

class Ray implements Iterable<Ray> {

  public __state__: () => State; get state(): State { return this.__state__() }; set state(x: Any) {
    this.__state__ = ((x: Any): (() => State) => {
      if (x === undefined) return State.none;
      if (is_function(x)) return () => {
        let value = x();
        if (value instanceof Array) return // TODO
        return value instanceof State ? value : value.state
      };
      let value = x instanceof Array ? State.iterable(x) : State.ref(x);
      return () => value;
    })(x)
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
  public __map__: ((x: Ray) => any)[] = []
  map = <T>(predicate: (x: Ray) => T): Ray => this.clone({ __map__: [...this.__map__, predicate] })

  // If the starting Ray is a vertex, which is excluded, it acts like an initial.
  public __filter__: ((x: Ray) => boolean)[] = []
  filter = (predicate: (x: Ray) => boolean): Ray => this.clone({ __filter__: [...this.__filter__, predicate] })

  public __reverse__: boolean = false
  get reverse(): Ray { return this.clone({ __reverse__: !this.__reverse__ })}
  
  get initial(): Ray { return this.state.initial }; set initial(x: Any) { this.state.initial = x; }
  get self(): Ray { return this.state.self }; set self(x: Any) { this.state.self = x; }
  get terminal(): Ray { return this.state.terminal }; set terminal(x: Any) { this.state.terminal = x; }

  get type(): Type {
    if (this.is_reference()) return Type.REFERENCE;
    if (this.is_initial()) return Type.INITIAL;
    if (this.is_terminal()) return Type.TERMINAL;
    if (this.is_vertex()) return Type.VERTEX;
    // if (this.is_wall()) return Type.WALL;
    throw new Error('Should not happen')
  }

  is_initial = () => this.initial.is_none()
  is_terminal = () => this.terminal.is_none()
  is_reference = () => this.is_initial() && this.is_terminal()
  is_empty_reference = () => this.is_reference() && this.self.is_none()
  is_boundary = () => xor(this.is_initial(), this.is_terminal())
  is_vertex = () => !this.is_initial() && !this.is_terminal()
  is_extreme = () => this.is_none() && this.is_boundary()
  is_wall = () => this.is_none() && !this.is_initial() && !this.is_terminal()

  is_none = (): boolean => this.state.__none__ || this.max_length === 0;
  is_some = () => !this.is_none();

  // TODO: At each step, the intermediate iterator result which gets returned, might be expanded on later, when deemed it has changed, when would you want to know about that change mid-iteration?
  // TODO: What about traversing and mapping the entire structure including terminal/initial structure?
  * traverse({
    strategy,
    traverser
  }: { strategy?: (x: Ray) => Iterable<Ray | Ray[]>, traverser?: Ray } = {}) {
    throw new Error('Not implemented')

    // TODO: Map maps .self values of each vertex.

    // TODO: Allow for additional operations on .traverse/.last like .push_back, where we have pending for non-found values of .last yet
  }

  compose = (b: Ray): Ray => {
    // if (this.is_boundary()) return this.map(x => x.compose(b))
    // if (b.is_boundary()) return b.map(x => this.compose(x)) //TODO should return x.
    throw new Error('Not implemented')
  }

  * [Symbol.iterator](): Generator<Ray> {
    function * strategy(x: Ray) { yield x.terminal; }
    yield * this.traverse({ strategy })
  }
  * collapse(): Generator<Ray> {
    function * strategy(x: Ray) { yield [x.initial, x.terminal]; }
    yield * this.traverse({ strategy })
  }
  
  at = (index: number): Ray => {
    if (index === Number.POSITIVE_INFINITY) return this.terminal_boundary;
    if (index < 0) return this.reverse.at(index * -1);
    
    let i = 0;
    for (let current of this) {
      if (i === index) return current;
      i++;
    }
    
    return new Ray()
  }

  get next(): Ray { return this.at(1); }
  get current(): Ray { return this.at(0); }
  get previous(): Ray { return this.at(-1); }

  has_next = (): boolean => this.next.is_none()
  has_previous = (): boolean => this.previous.is_none()

  // TODO: When would you use a variant of first/last which includes terminal/initial cycle states?
  get last(): Ray {
    throw new Error('Not implemented')

    return new Ray()
      .filter(x => !x.has_next())
  }
  get first(): Ray { return this.reverse.last }

  get terminal_boundary(): Ray {
    return this.last.map(x => { throw new Error('Not implemented') })
  }
  get initial_boundary(): Ray { return this.reverse.terminal_boundary }

  push_front = (b: Ray): Ray => b.compose(this.first)
  push_back = (b: Ray): Ray => this.last.compose(b)

  in_orbit = (): boolean => {
    throw new Error('Not implemented')
  }

  // TODO: FIX FOR; Doesn't account for infinitely generating terminals, same problem as the halting problem
  get max_length(): number { return this.in_orbit() ? Number.POSITIVE_INFINITY : [...this].length }

  static initial = (object: any = {}) => new Ray(new State({ self: State.none(), terminal: State.none(), ...object }))
  static vertex = (object: any = {}) => new Ray(new State({ initial: State.none(), self: State.none(), terminal: State.none(), ...object }))
  static terminal = (object: any = {}) => new Ray(new State({ initial: State.none(), self: State.none(), ...object }))

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

  static ref = (x: State | State[] | (() => State)): State => new State({ __self__: () => x instanceof Array ? State.iterable(x) : x instanceof State ? x : x() })

  // TODO: .iterable conversion should be automatic, and additional functionality of string & other objects
  // TODO: Could be added automatically.
  static string = (string: string) => State.iterable(string)
  static iterable = <T>(x: Iterable<T>) => this.iterator(x[Symbol.iterator]());
  static iterator = <T>(x: Iterator<T>) => {
    const next = (previous?: State): State => {
      const { done, value } = x.next();

      const current = done ? State.terminal({ initial: previous }) : State.vertex({ __object__: value, initial: previous });
      previous.terminal = current

      if (done) return current

      current.terminal = () => next(current)

      return current
    }

    const iterator = State.initial({ terminal: () => next(iterator) });

    return iterator;
  }
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
