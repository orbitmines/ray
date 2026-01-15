// The v0 runtime is a specification runtime, without any optimizations.

// What happens when conflicting versions are used, check backwards/forwards compatibility
//   If conflict -> optimistically assume reinterpretation of each Lazy Program: Variable for each separate context.
// Different evaluation groups; if something else introduces new syntax, I dont want it to effect other groups; only those which import it
//
// Function variable from context. So create a new context for each function and assign '&'.


import PartialArgs = Ether.PartialArgs;

abstract class ICursor<T> {
  abstract previous?: ICursor<T>
  abstract next?: ICursor<T>
  abstract x: T

  get first() { return this.boundary(x => x.previous); }
  get last() { return this.boundary(x => x.next); }
  boundary = (next: (x: ICursor<T>) => ICursor<T>): ICursor<T> => {
    let current: ICursor<T> = this;
    while (next(current) != undefined) { current = next(current); }
    return current;
  }

  filter = (filter: (x: T) => boolean) => new FilteredCursor(this, filter);
}
class Cursor<T> extends ICursor<T> {
  // static from_iterable = <T>(iterable: Iterable<T>): Cursor<T> => {
  //
  // }

  previous?: ICursor<T>
  next?: ICursor<T>
  constructor(public x: T) { super(); }
}
class FilteredCursor<T> extends ICursor<T> {
  constructor(public unfiltered: ICursor<T>, private _filter: (x: T) => boolean) { super(); }

  get previous() { return this.get_next(x => x.previous) }
  get next() { return this.get_next(x => x.next) }
  private get_next = (next: (x: ICursor<T>) => ICursor<T>): ICursor<T> | undefined => {
    let current: ICursor<T> = this;
    while (next(current) != undefined) {
      if (this._filter(next(current).x)) return new FilteredCursor(next(current), this._filter)
      current = next(current)
    }
    return undefined;
  }

  get x() { return this.unfiltered.x }
}

type Token = string
class Expression extends Cursor<Token> {

  split = (...delimiter: Token[]) => {

  }

  to_string = () => {
    let current: ICursor<Token> = this;
    let string = current.x;
    while (current.next) { string += current.next.x; current = current.next }
    return string;
  }
}

import fs from 'fs'
import path from "node:path";

type ExternalMethod = (...args: [SupportedValue, ctx: Context]) => SupportedValue | void

// Work with properties.
const external = <T extends ExternalMethod>(key?: SupportedValue) => {
  return function (
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value!;

    const existing = target.constructor.prototype.constructor;

    target.constructor.prototype.constructor = function (...args: any[]) {
      existing.apply(this, args);

      this.external_method(key ?? propertyKey, Var.func(method.bind(this)));
    };
  };
}

type SupportedValue = string | symbol | Var | ExternalMethod

const self = Symbol("self");
const evaluate = Symbol("evaluate");
const partial_args = Symbol("partial_args");

type Val = {
  //TODO Dynamically allocate conditional methods
  get methods(): Map<Var, Var>
}
class Var {
  value: Val = { methods: new Map<Var, Var>() }

  static cast = (val: SupportedValue): Var => {
    if (is_symbol(val)) val = val.toString()

    if (is_string(val)) {
      if (val.includes(" ")) val = Var.expr(val)
      else val = Var.string(val)
    } else if (is_function(val)) val = Var.func(val)

    return val;
  }
  static string = (string: string): Var => {}
  static path = (path: string): Var => {}
  static map = (map: Map<Var, Var>): Var => {}
  static expr = (expression: string): Var => {}
  static func = (func: ExternalMethod): Var => {}

  @external("* | methods")
  methods() { return Var.map(this.value.methods) }

  @external("= | assign")
  assign(x: SupportedValue) {
    this.value = Var.cast(x).value
    // TODO Update location
    // TODO Update version control if present

    // TODO If assign is called on None, then set in .methods (Set .methods in location)
  }

  [evaluate] = (): boolean => {

  }

  string = (): string => {}

  instance_of = (type: SupportedValue): boolean => {
    //TODO Flag == & instance_of methods
  }

  //TODO Store if not yet loaded global
  retrieve(property: SupportedValue) {
    property = Var.cast(property)

    for (let [key, value] of this.value.methods) {
      if (property.instance_of(key)) return value;
    }

    return Var.expr("None") //TODO Location of None
  }

  get self(): any { return new Proxy(class {}, {
    // apply: (_: any, thisArg: any, argArray: any[]): any => this.expr('(', ...argArray, ')'),
    set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => {
      this.retrieve(property).assign(newValue)
      return true
    },
    get: (_: any, property: string | symbol, receiver: any): any => {
      if (property == self) return this
      if (property == evaluate) return this[evaluate]()
      if (property == partial_args) return (args: PartialArgs) => this.self[`<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>`]()
      return this.retrieve(property).self
    }
  }) }

  do = (call: (x: any) => void) => {
    call(this.self) //TODO Set value?
    return this;
  }
  call = (call: (x: any) => any) => {
    return call(this.self)[self]
  }

  private external_method = (key: string | Var, value: string | Var | ExternalMethod) =>
    this.value.methods.set(Var.cast(key), Var.cast(value))

}

const latest = Symbol("latest");
class Context extends Var {
  //TODO Location of context

  @external()
  local() { return this; }

  has_method = (x: SupportedValue): boolean => {}

}
namespace Language {
  export class Ray extends Context {
    constructor(private instance: Instance, public ether: string) {
      super();
    }

    //@external
    assign(version: SupportedValue) {
      super.assign(this.instance.load(version))
      //TODO Update objects, defined in child contexts.
    }

    @external()
    external(x: SupportedValue, ctx: Context) {
      // TODO Get caller and check from there if it has
      if (!ctx.has_method(x)) throw new Error(`Expected externally defined method '${Var.cast(x).string()}' in ${ctx.retrieve('name').string()}`)

      return ctx.retrieve(x)
    }

    @external()
    location() { return Var.expr("IO").self(Var.path(this.ether)) }

  }
}
class Program extends Var {
  constructor() {
    super();
    this.self[":"](Var.expr("Program"))
  }
}
class Instance extends Var {
  constructor(public ether: string) {
    super();
  }

  versions: Map<Var, Language.Ray> = new Map()

  load = (version: SupportedValue = "latest"): Language.Ray => {
    if (version != "latest") throw new Error("Versioning of Language not yet supported")

    let ray: Language.Ray;

    this.versions.set(Var.cast(version), ray)
    return ray;
  }

  eval = (args: PartialArgs, ) => {
    this.load(args["global"][0] ?? "latest")
  }

}

class Instance {

  program: Var = new Var().call(x => x[":"]("Program"))
  get global() { return this.program.self["∙"] }

  constructor(public args?: PartialArgs) {
  }

  private expr = (path: string, expr: string) => new Var().do(x => {
    x.location["&="](this.global["IO"](Var.path(path)))
    x.expression["="](expr.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file
  })

  group = () => {

  }

  dir = (path: string, args?: PartialArgs): this => {
    this.program.call(x => x.push_back(
      files(path)
        .filter(path => path.endsWith('.ray'))
        .map(path => this.expr(path, fs.readFileSync(path, "utf-8")))
        .reduce((acc: Var | undefined, x) => acc ? acc.self["push_back"](x) : x)
        .self.all.collapse[partial_args](args)
    ))

    return this;
  }
  file = (path: string, args?: PartialArgs): this => {
    this.expr(path, fs.readFileSync(path, "utf-8")).self[partial_args](args)
    return this;
  }

  eval = () => {
    const program = this.program.self[partial_args](this.args)[self]

    // PartialArg types need to match

    const s = [" ", "\t"]
    const DELIMITER = ["/", ".", ...s, ";", "\n"]

  }
}

export namespace Ether {
  export type PartialArgs = { [key: string]: string[] }

  export const run = (default_path: string, args: PartialArgs) => {
    if ((args['@'] ?? []).length == 0) args['@'] = [default_path]
    if (args['@'].length !== 1) throw new Error('In order to run multiple instances, for now run them in separate terminals.')

    default_path = path.resolve(default_path)

    const location = path.resolve(args['@'][0])
    const stat = fs.statSync(location)

    delete args['@']

    if (stat.isFile())
      return new Instance(args).dir(`${default_path}/.ray`).file(location).eval()
    else if (stat.isDirectory())
      return new Instance(args).dir(`${location}/.ray`).file(`${location}/Ether.ray`).eval()
    else
      throw new Error(`"${location}": Unknown Ether instance directory or Ray file.`)
  }
}

const files = (path: string) => {
  let results: string[] = [];

  for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
    const next_path = path.concat('/', entry.name);

    if (entry.isDirectory())
      results = results.concat(files(next_path));
    else
      results.push(next_path);
  }

  return results;
}

/**
 * Copied from https://github.com/lodash/lodash/blob/main/dist/lodash.js
 */
export const is_boolean = (value: any): value is boolean =>
  value === true || value === false || (is_object_like(value) && base_tag(value) == '[object Boolean]');
export const is_symbol = (value: any): value is Symbol => typeof value === "symbol" //TODO lodash says?
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