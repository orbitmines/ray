

export enum Type {
  REFERENCE, //TODO: Reference could be vertex?
  VERTEX,
  INITIAL,
  TERMINAL,
  // INITIAL_EXTREME,
  // TERMINAL_EXTREME,
  // WALL // TODO: Could be renamed empty?
}

class Ray implements Iterable<Ray> {

  public __object__?: any

  private __initial__: () => Ray = () => Ray.none(); get initial(): Ray { return this.__initial__() }; set initial(x: Ray | Ray[] | (() => Ray)) { this.__initial__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }
  private __self__: () => Ray = () => Ray.none(); get self(): Ray { return this.__self__() }; set self(x: Ray | Ray[] | (() => Ray)) { this.__self__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }
  private __terminal__: () => Ray = () => Ray.none(); get terminal(): Ray { return this.__terminal__() }; set terminal(x: Ray | Ray[] | (() => Ray)) { this.__terminal__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }

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
  is_none = (): boolean => this.__none__ || this.length.max === 0;
  is_some = () => !this.is_none()

  get type(): Type {
    if (this.is_reference()) return Type.REFERENCE;
    if (this.is_initial()) return Type.INITIAL;
    if (this.is_terminal()) return Type.TERMINAL;
    if (this.is_vertex()) return Type.VERTEX;
    // if (this.is_wall()) return Type.WALL;
    throw new Error('Should not happen')
  }

  get reverse(): Ray {

  }

  get length(): Ray { return this.distance(this.last) }
  get max(): number {}
  get min(): number {}

  * all(): Generator<Ray> {
    // const initial = this.reverse[Symbol.iterator]();
    // const terminal = this.next[Symbol.iterator]();
    //
    // while (true) {
    //   const a = initial.next()
    //   const b = terminal.next()
    //
    //   if (!a.done) yield a.value;
    //   if (!b.done) yield b.value;
    //
    //   if (a.done && b.done) break;
    // }
    yield *this.reverse.next; yield *this
  }

  // TODO: Detect and exclude cycles
  get first(): Ray { return this.reverse.last }
  get last(): Ray {
    // TODO: Returns terminal boundaries
  }
  get boundary(): Ray {
    // TODO : Merge first & last
  }

  get next(): Ray { return this.at(1); }
  get current(): Ray { return this.at(0); }
  get previous(): Ray { return this.at(-1); }

  has_next = (): boolean => this.next.is_none()
  has_previous = (): boolean => this.previous.is_none()

  at = (index: number): Ray => {
    // if (index === Number.NEGATIVE_INFINITY) return this.first;
    // if (index === Number.POSITIVE_INFINITY) return this.last;
  }

  distance = (b: Ray): Ray => {
    // TODO Should this return distance in the direction the ray is pointing in? yes?
    // let distance = 0;
    // for (const a of this) {
    //   if (a.equals(b)) return distance;
    //   distance++;
    // }

  }

  isomorphic = (b: Ray): boolean => {

  }
  equals = (b: Ray): boolean => {
    // for (let A of this.self.all()) {
    //   for (let B of b.self.all()) {
    //     if (!A.isomorphic(B)) return false;
    //   }
    // }
    // return true;
  }

  * [Symbol.iterator](): Generator<Ray> {

  }

  push_front = (b: Ray): Ray => b.compose(this.first)
  push_back = (b: Ray): Ray => this.last.compose(b)

  compose = (b: Ray): Ray => {

  }

  static none = () => new Ray({ __none__: true })

  static ref = (x: Ray | Ray[] | (() => Ray)): Ray => new Ray({ __self__: () => x instanceof Array ? Ray.iterable(x) : x instanceof Ray ? x : x() })
  static initial = (object: any = {}) => new Ray({ self: new Ray(), terminal: new Ray(), ...object })
  static vertex = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), terminal: new Ray(), ...object })
  static terminal = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), ...object })

  static number = (number: number, options = { base: 10 }) => {

  }
  static boolean = (boolean: boolean) => Ray.number(boolean ? 1 : 0, { base: 2 })
  static iterable = <T>(x: Iterable<T>) => this.iterator(x[Symbol.iterator]());
  static iterator = <T>(x: Iterator<T>) => {
    const next = (previous?: Ray): Ray => {
      const { done, value } = x.next();

      const current = done ? Ray.terminal() : Ray.vertex({ __object__: value });
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
