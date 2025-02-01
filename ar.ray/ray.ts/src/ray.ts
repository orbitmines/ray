

export enum Type {
  REFERENCE = "REFERENCE", //TODO: Reference could be vertex?
  VERTEX = "VERTEX",
  INITIAL = "INITIAL",
  TERMINAL = "TERMINAL",
  // INITIAL_EXTREME,
  // TERMINAL_EXTREME,
  // WALL // TODO: Could be renamed empty?
}

// Separate class?
// class Reference extends Ray {
//   private __reverse__: boolean = false
// }

class Ray implements Iterable<Ray> {

  public __object__?: any


  private __initial__: () => Ray = () => Ray.none(); get initial(): Ray { return this.__initial__() }; set initial(x: Ray | Ray[] | (() => Ray)) {this.__initial__ = this.__getter__(x); }
  private __self__: () => Ray = () => Ray.none(); get self(): Ray { return this.__self__() }; set self(x: Ray | Ray[] | (() => Ray)) { this.__self__ = this.__getter__(x); }
  private __terminal__: () => Ray = () => Ray.none(); get terminal(): Ray { return this.__terminal__() }; set terminal(x: Ray | Ray[] | (() => Ray)) { this.__terminal__ = this.__getter__(x); }

  private __getter__ = (x: Ray | Ray[] | (() => Ray)): (() => Ray) => {
    if (is_function(x)) return x;
    let value = x instanceof Array ? Ray.iterable(x) : Ray.ref(x);
    return () => value;
  }

  constructor(object: any = {}) {
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }

  is_initial = () => this.initial.is_none()
  is_terminal = () => this.terminal.is_none()
  is_reference = () => this.is_initial() && this.is_terminal()
  is_boundary = () => xor(this.is_initial(), this.is_terminal())
  is_vertex = () => !this.is_initial() && !this.is_terminal()
  is_extreme = () => this.is_none() && this.is_boundary()
  is_wall = () => this.is_none() && !this.is_initial() && !this.is_terminal()

  private __none__?: boolean // TODO Better solutions for this
  is_none = (): boolean => this.__none__ || this.length === 0;
  is_some = () => !this.is_none()

  get type(): Type {
    if (this.is_reference()) return Type.REFERENCE;
    if (this.is_initial()) return Type.INITIAL;
    if (this.is_terminal()) return Type.TERMINAL;
    if (this.is_vertex()) return Type.VERTEX;
    // if (this.is_wall()) return Type.WALL;
    throw new Error('Should not happen')
  }

  get length(): number { return [...this].length }

  get next(): Ray { return this.at(1); }
  get current(): Ray { return this.at(0); }
  get previous(): Ray { return this.at(-1); }

  has_next = (): boolean => this.next.is_none()
  has_previous = (): boolean => this.previous.is_none()

  at = (index: number): Ray => {
    let i = 0;
    for (let current of this) {
      if (i === index) return current;
      i++;
    }
  }

  * [Symbol.iterator](): Generator<Ray> {

    // console.log(this.type)
    // TODO: Forloops bundled
    switch (this.type) {
      case Type.REFERENCE:
        yield this.self;
        break;
      case Type.VERTEX:
        yield this;
        for (let terminal of this.terminal) { yield *terminal; }

        break;
      case Type.INITIAL:
        for (let terminal of this.terminal) { yield *terminal; }

        break;
      case Type.TERMINAL:
        for (let self of this.self) {
          switch (self.type) {
            case Type.REFERENCE:
              break;
            case Type.VERTEX:
              // TODO, could also just be ignored?
              break;
            case Type.INITIAL:
            case Type.TERMINAL:
              // if (this === self) break; TODO & terminal
              yield *self;
              break;

          }
        }

        break;
    }
  }

  compose = (b: Ray): Ray => {
    // TODO Could abstract this product (to proxy?)
    if (this.is_boundary()) {
      for (let vertex of this) { vertex.compose(b) }
      return this;
    }
    if (b.is_boundary()) {
      for (let vertex of b) { this.compose(vertex) }
      return this;
    }

    if (this.type === Type.REFERENCE || b.type === Type.REFERENCE) {
      throw new Error('What to do in case of references?');
    }
    switch (this.terminal.type) {
      case Type.REFERENCE:
        // this.terminal.as_vertex()

        switch (b.initial.type) {
          case Type.REFERENCE:
            // b.initial.as_vertex()

            // this.terminal.terminal = b.initial;
            // b.initial.initial = this.terminal;

            this.terminal = b;
            b.initial = this;

            // console.log(this.terminal.is_boundary(), b.initial.is_boundary())
            // console.log(this.terminal.length, b.initial.length)

            break;
          case Type.VERTEX:
            break;
          case Type.INITIAL:
            break;
          case Type.TERMINAL:
            break;

        }

        break;
      case Type.VERTEX:
        break;
      case Type.INITIAL:
        // this.terminal.next.compose();
        break;
      case Type.TERMINAL:
        // this.terminal.previous.compose();
        break;

    }
    // this.terminal.compose(b.initial)

    return this;
  }

  as_vertex = () => {
    if (this.is_initial()) this.initial = new Ray();
    if (this.is_terminal()) this.terminal = new Ray();
  }

  static none = () => new Ray({ __none__: true })

  static ref = (x: Ray | Ray[] | (() => Ray)): Ray => new Ray({ __self__: () => x instanceof Array ? Ray.iterable(x) : x instanceof Ray ? x : x() })
  static initial = (object: any = {}) => new Ray({ self: new Ray(), terminal: new Ray(), ...object })
  static vertex = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), terminal: new Ray(), ...object })
  static terminal = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), ...object })

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
export default Ray;

// Separate function builder and functionality

const xor = (a: boolean, b: boolean) => (a && !b) || (!a && b)

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
