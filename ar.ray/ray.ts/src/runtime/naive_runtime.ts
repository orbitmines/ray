// A list of required and expected definitions in .ray.txt.
const GLOBAL = {
  Iterable: { next: "" },
  None: "",
  Node: { "==": "(x: *) : boolean" },
  boolean: "",
  false: "",
  true: ""
}
// A list of definitions filled by the runtime
const EXTERNAL = {
  Node: { "=": "(x: T) : T" },
  caller: "",
  definer: ""
}

type Var = NODE & ({(...args: any[]): Var}) & any

abstract class NODE implements Iterable<Var> {

  constructor(public context?: Var) {}

  location?: ((key: Var) => boolean)

  get global(): Var { return !this.context ? this.__proxy__ : this.context.global }

  abstract get: (key: any, context: { caller: Var }) => Var
  abstract call: (...args: any[]) => Var
  abstract [Symbol.iterator](): Iterator<Var>

  set = (value: Var, context: { caller: Var }): void => {

  }

  get __proxy__(): any { return new Proxy(class {}, {
    apply: (_: any, thisArg: any, argArray: any[]): any => this.expr('()', ...argArray),
    set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => {
      if (property in this) (this as any)[property] = newValue;
      return false
    },
    get: (_: any, property: string | symbol, receiver: any): any => {
      if (property in this) return (this as any)[property];
      return this.expr(property)
    },
  }) }

  All = (list: Var): Var => new ITERABLE(this.__proxy__, list).__proxy__
  Many = (...list: Var[]): Var => new Many(this.__proxy__, list).__proxy__
  Generator = (list: Generator<Var>): Var => new Many(this.__proxy__, list).__proxy__

  expr = (expr: any, ...args: any[]): Var => {

  }//TODO this.context is the caller

  _eval?: Var
  eval = (options: { caller: Var }): Var => {
    if (this._eval) return this._eval;


  }

  tag?: any
  boolean = (options: { caller: Var }): boolean => {
    const v = this.eval(options)
    if (v.tag == undefined) throw new Error('No tag defined at variable.')
    if (!is_boolean(v.tag)) throw new Error('Tag was not a boolean.')
    return v.tag; //TODO Resolve expression first
  }
}

class Many extends NODE {
  constructor(context: Var, private value?: Iterable<Var>) { super(context) }

  get = (key: any) => this.map(x => x.get(key))
  call = (...args: any[]): Var => this.map(x => x(...args))

  map = (callback: (x: Var) => Var) => {
    let list = this;
    return this.Generator(function* (): Generator<Var> {
      for (let x of list) { yield callback(x) }
    }());
  }

  [Symbol.iterator](): Iterator<Var> {
    if (!this.value) throw new Error("Any subclass of Many must implement an iterator if value is not filled.")
    return this.value[Symbol.iterator]();
  }
}
class ITERABLE extends Many{
  constructor(context: Var, public variable: Var) { super(context) }

  * [Symbol.iterator](): Generator<Var> {
    let current = this.variable
    while (!this.expr(current["=="](this.global.None)).boolean({ caller: this.context })) {
      yield current
      current = current.next
    }
  }
}
class OBJECT extends NODE {

  *[Symbol.iterator](): Generator<Var> { yield this }

  call = (...args: any[]): Var => {
    return undefined;
  }

  get = (key: any, context: { caller: Var }): Var => {
    return undefined;
  }

}


const DEFAULT_context: context = {}

class Expression {
  ast: any

  constructor(public string: string, public context: context = DEFAULT_context) {
    this.ast = this.generate_ast()
  }

  protected generate_ast = () => {
    const s = [" ", "\t"]
    const delimiter = ["/", ".", ...s, "\n"]

  }

}

/**
 * Copied from https://github.com/lodash/lodash/blob/main/dist/lodash.js
 */
export const is_boolean = (value: any): value is boolean =>
  value === true || value === false || (is_object_like(value) && base_tag(value) == '[object Boolean]');
export const is_string = (value: any): value is string =>
  typeof value == 'string' || (!is_array(value) && is_object_like(value) && base_tag(value) == '[object String]');
export const is_function = (value: any): value is ((...args: any[]) => any) => {
  if (!is_object(value)) return false;

  let tag = base_tag(value);
  return tag == '[object Function]' || tag == '[object GeneratorFunction]' || tag == '[object AsyncFunction]' || tag == '[object Proxy]';
}
export const is_array = Array.isArray
export const is_object = (value: any): value is object =>
  value != null && (typeof value == 'object' || typeof value == 'function');
export const is_object_like = (value: any) =>
  value != null && typeof value == 'object';
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