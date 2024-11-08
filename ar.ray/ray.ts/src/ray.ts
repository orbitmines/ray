
// () => Ray[]

export type Ray = {
  [TProperty in keyof Instance]: Ray;
} & {
  __object__: any;
  __instance__: Instance;
  readonly [n: number]: any;
  (...args: any[]): any;
  new (...args: any[]): any;
} & Iterable<Ray> & AsyncIterable<Ray>

class Instance implements Iterable<Ray>, AsyncIterable<Ray> {

  // Usually inaccessible, yet additional structure
  __object__: any
  // Each Ray with a separate causal history
  // Can have a history, but no current value
  // TODO: Memorization through causal history
  history: Ray
  // Superposed type??
  type: Ray
  //
  equivalences: Ray
  // Unrealized functions which could be applied to this Ray
  // How is this different from additional structure on .self? This as unrealized, .self as realized?
  // TODO: Should this contain .initial & .terminal as functions? Or should this be
  // TODO: Separated into another class
  functions: Ray
  // Iterate over possible representations: Matching is_equivalent/is_isomorphic
  representations: Ray

  get initial(): Ray { return this.__get__('initial') }
  // self: Ray
  get terminal(): Ray { return this.__get__('terminal') }

  constructor(...args: any[]) {
    if (args.length === 0) return;

    // TODO: args.slice(1) is instantiated from this position
    const object = { ...args[0] }
    Object.keys(object).forEach(key => this.__set__(key, object[key]));
  }

  static __new__ = (...args: any[]): Ray => new Instance(...args).__proxy__

  __call__ = (...args: any[]): any => {
    if (is_function(this.__object__)) return this.__object__(...args)
  }

  // A copy traverses the entire structure
  // TODO: Send left/right copy simultaneously, and cancel each-other out
  __copy__ = (...args: any[]): any => {
    return Instance.__new__(...args)
  }

  __set__ = (property: string | symbol, value: any): boolean => {
    if (property in this)
      return (this as any)[property] = value;

    return true;
  }
  __get__ = (property: string | symbol): any => {
    if (property === "__instance__") return this;
    if (property === Symbol.iterator || property === Symbol.asyncIterator || property === "__object__") return (this as any)[property]
    if (is_string(property) && !Number.isNaN(Number.parseInt(property))) return this.at(Number.parseInt(property))
    if (property === 'initial' || property === 'terminal') return Instance.__new__()

    return Instance.__new__({ __object__: (this as any)[property] });
  }
  __has__ = (property: string | symbol): boolean => {
    return false;
  }
  __delete__ = (property: string | symbol): any => {
    return false;
  }

  *[Symbol.iterator](): Iterator<Ray> {
  }
  async *[Symbol.asyncIterator](): AsyncIterator<Ray> {
  }

  // Capturing: What is the essence of a difference?
  // TODO: Any function, needs a traversal strategy:
  //  How do I search through the space of equivalences:
  //  Not just that something is the same, but how? why?
  // TODO: New variant of  - When there exists a connection between the two .self?
  is_equivalent = (b: Ray): boolean => {
    if (this === b.__instance__) return true;



    return false;
  }
  // TODO: What's the difference between is_equivalent and is_isomorphic
  is_isomorphic = (b: Ray): boolean => { return false; }
  is_composed = (b: Ray) => this.all().contains(b)
  // "Draw a line between anything and say 'what if they're the same'"
  // TODO: Better interpretation of "Add to compose with .self"
  equivalent = (b: Ray): Ray => { return undefined; }
  compose = (b: Ray): Ray => this.terminal.equivalent(b.initial)

  contains = (b: Ray): Ray => { return undefined; }

  // Collapse entire ray to a point
  all = (): Ray => { return undefined; }

  previous = (): Ray => { return undefined; }
  next = (): Ray => { return undefined; }

  has_previous = (): boolean => this.initial().is_some()
  has_next = (): Ray => this.terminal().is_some()

  has_boundary = (): boolean => { return false; }

  orbit = () => this.last().compose(this.first())
  push_front = (b: Ray): Ray => b.compose(this.first())
  push_back = (b: Ray): Ray => this.last().compose(b)

  is_none = (): Ray => { return this.boolean(false) }
  is_some = (): Ray => this.is_none().not()

  and = (b: Ray): Ray => { return undefined; }
  or = (b: Ray): Ray => { return undefined; }
  not = (): Ray => { return undefined; }
  xor = (b: Ray): Ray => this.and(b.not()).or(this.not().and(b))
  nor = (b: Ray): Ray => (this.or(b)).not()

  is_initial = () => this.initial.is_none()
  is_terminal = () => this.terminal.is_none()
  is_reference = () => this.is_initial().and(this.is_terminal())
  is_boundary = () => this.is_initial().xor(this.is_terminal())
  is_vertex = () => this.is_initial().nor(this.is_terminal())
  is_extreme = () => this.is_none().and(this.is_boundary())
  is_wall = () => this.is_none().and(this.is_initial().not()).and(this.is_terminal().not())


  at = (steps: number): Ray => {
    console.log(steps)
    return undefined;
  }
  first = (): Ray => { return undefined; }
  last = (): Ray => { return undefined; }
  boundary = (): Ray => { return undefined; }

  // static unknown: Ray = new Ray(Symbol("unknown"))
  // static none: Ray = new Ray(Symbol("none"))

  boolean = (x: boolean) => this.any(x)
  string = (x: string) => this.iterable(x)
  iterable = <T>(x: Iterable<T>) => this.iterator(x[Symbol.iterator]());
  iterator = <T>(x: Iterator<T>) => {
    return Instance.__new__()
  }
  function = (x: (...args: any[]) => any) => {

  }
  reversible_function = (initial: (...args: any[]) => any, terminal: (...args: any[]) => any) => {

  }
  variable = () => {
    // TODO: Implement simple getter/setter structure
  }
  object = (x: object) => {}
  any = (x: any) => Instance.__new__({ __object__: x })

  // toString = (): string => {
  //   return "";
  // }

  get __proxy__(): Ray { return new Proxy(class {}, {
    apply: (_: any, thisArg: any, argArray: any[]): any => this.__call__(...argArray),
    set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => this.__set__(property, newValue),
    get: (_: any, property: string | symbol, receiver: any): any => this.__get__(property),
    has: (_: any, property: string | symbol): boolean => this.__has__(property),
    construct: (_: any, argArray: any[], newTarget: Function): object => this.__copy__(...argArray),
    deleteProperty: (_: any, property: string | symbol): boolean => this.__delete__(property)
  }) }
}

// TODO Copy from lodash - remove as a dependency.
import _ from "lodash";
export const is_string = (_object: any): _object is string => _.isString(_object)
export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
export const is_number = (_object: any): _object is number => _.isNumber(_object);
export const is_object = (_object: any): _object is object => _.isObject(_object);
export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
export const is_array = <T = any>(_object: any): _object is T[] => _.isArray(_object);
export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check
export const is_error = (_object: any): _object is Error => _.isError(_object);
export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object);

export default Instance.__new__();
