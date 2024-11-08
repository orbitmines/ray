
export type Ref = Ray
// export type Ref = () => Ray

class Ray implements Iterable<Ray>, AsyncIterable<Ray> {

  // Usually inaccessible, yet additional structure
  __object__: any
  // Each Ray with a separate causal history
  // Can have a history, but no current value
  // TODO: Memorization through causal history
  history: Ref
  // Superposed type??
  type: Ref
  // Unrealized functions which could be applied to this Ray
  // How is this different from additional structure on .self? This as unrealized, .self as realized?
  // TODO: Should this contain .initial & .terminal as functions? Or should this be
  // TODO: Separated into another class
  functions: Ref
  // Iterate over possible representations: Matching is_equivalent/is_isomorphic
  representations: Ref

  initial: Ref
  self: Ref
  terminal: Ref

  constructor(...args: any[]) {
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
    if (this === b) return true;



    return false;
  }
  // TODO: What's the difference between is_equivalent and is_isomorphic
  is_isomorphic = (b: Ray): boolean => { return false; }
  is_composed = (b: Ray) => this.all().contains(b)
  // TODO: Better interpretation of "Add to compose with .self"
  equivalent = (b: Ray): Ray => { return undefined; }
  compose = (b: Ray): Ray => this.terminal.equivalent(b.initial)

  contains = (b: Ray): Ray => { return undefined; }

  // Collapse entire ray to a point
  all = (): Ray => { return undefined; }

  previous = (): Ray => { return undefined; }
  next = (): Ray => { return undefined; }

  push_front = (b: Ray): Ray => b.compose(this.first())
  push_back = (b: Ray): Ray => this.last().compose(b)

  first = (): Ray => { return undefined; }
  last = (): Ray => { return undefined; }
  boundary = (): Ray => { return undefined; }

  // A copy traverses the entire structure
  // TODO: Send left/right copy simultaneously, and cancel each-other out
  copy = (): Ray => { return undefined; }

  static unknown: Ray = new Ray(Symbol("unknown"))
  static none: Ray = new Ray(Symbol("none"))

  static string = (x: string) => Ray.iterable(x)
  static iterable = <T>(x: Iterable<T>) => Ray.iterator(x[Symbol.iterator]());
  static iterator = <T>(x: Iterator<T>) => {

  }
  static function = (x: (...args: any[]) => any) => {

  }
  static variable = () => {
    // TODO: Implement simple getter/setter structure
  }
  static object = (x: object) => {}


  // static any = (x: any) => {}
  

}

export default Ray;
