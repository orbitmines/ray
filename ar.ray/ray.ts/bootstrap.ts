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

type EvalContext = {
  caller: Var,
  definer: Var,
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
    apply: (_: any, thisArg: any, argArray: any[]): any => this.expr('(', ...argArray, ')'),
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
  String = (string: string): Var => {

  }

  expr = (...args: any[]): Var => {
    if (args.length === 1) {
      if (is_string(args[0])) {

      } else {
        // is var
      }
    } else if (args[0] === '('){
      // args = args.slice(1, args.length - 2);
    } else {
      throw new Error()
    }
  }//TODO this.context is the caller

  _eval?: Var
  eval = (options: { caller: Var }): Var => {
    if (this._eval) return this._eval;

    //TODO Expression is a bunch of sub-expressions with .expand to another expression, each with an associated .context with them. Is that on the .ray which expands?
    //TODO So how do you define what the Ray .expands into? It's always another ray, which in turn must have the same Node's defined as the parent Ray.

    //TODO Bunch of node-refs possibly expanded to group, with the edges decorated with arbitrary structure like ( node-ref, node-ref )
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
class ITERABLE extends Many {
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


// const DEFAULT_context: context = {}
//
// class Expression {
//   ast: any
//
//   constructor(public string: string, public context: context = DEFAULT_context) {
//     this.ast = this.generate_ast()
//   }
//
//   protected generate_ast = () => {
//     const s = [" ", "\t"]
//     const delimiter = ["/", ".", ...s, "\n"]
//
//   }
//
// }
