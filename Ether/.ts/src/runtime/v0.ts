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

const o = Symbol("self");
const get = Symbol("get");
const partial_args = Symbol("partial_args");

type Val = {
  none?: boolean
  //TODO Dynamically allocate conditional methods
  get methods(): Map<Var, Var>
}
class Var {
  value: Val = { methods: new Map<Var, Var>() }
  dependants: Var[] //TODO dynamically. or implement in the language: override = of all mentioned vars dependencies.

  static cast = (val: SupportedValue): Var => {
    if (is_symbol(val)) val = val.toString()

    if (is_string(val)) {
      if (val.includes(" ")) val = Var.expr(val)
      else val = Var.string(val)
    } else if (is_function(val)) val = Var.func(val)

    return val;
  }
  static string = (string: string): Var => {
    //TODO
    return new Var()
  }
  static path = (path: string): Var => {
    //TODO
    return new Var()
  }
  static map = (map: Map<Var, Var>): Var => {
    //TODO
    return new Var()
  }
  static expr = (expression: string): Var => {
    //TODO
    return new Var()
  }
  static func = (func: ExternalMethod): Var => {
    //TODO
    return new Var()
  }
  static array = (...array: SupportedValue[]): Var => {
    //TODO
    return new Var()
  }

  @external("* | methods")
  methods() { return Var.map(this.value.methods) }

  @external("= | assign")
  assign(x: SupportedValue) {
    this.value = Var.cast(x).value
    // TODO Update location
    // TODO Update version control if present

    // TODO If assign is called on None, then set in .methods (Set .methods in location)
  }

  eval = (): Var => this.real['**']()[o]

  none = (): boolean => this.value.none

  digit = (): number => {
    let i = 0

    let current: Var = this
    while(!(current = current.real.previous[o]).none()) { i += 1 }

    return i;
  }

  boolean = (): boolean => this.real['as'](Var.expr('boolean'))[0][o].digit() == 1
  string = (): string => {
    if (this.real['=='].instance_of(Var.expr('String'))[o].boolean()) throw new Error('Variable is not of type String.')

    let string = "";

    let char: Var = this.real['as'](Var.expr('String'))
    while (!(char = char.real.next[o]).none()) {
      //TODO Decide how to encode chars.
    }

    return string;
  }

  instance_of = (type: SupportedValue): boolean => {
    //TODO Flag == & instance_of methods
    return false;
  }

  get lazy() { return new Proxy(class {}, {
    apply: (_: any, thisArg: any, argArray: any[]): any => this.lazy[get](Var.array("(", ...argArray, ")")),
    set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => {
      return true
    },
    get: (_: any, property: string | symbol, receiver: any): any => {
      const getter = (property: SupportedValue) => {
        //TODO
        return new Var().lazy
      }

      if (property == o) return this
      if (property == get) return getter
      if (property == partial_args) return (args?: PartialArgs) => args ? this.lazy[`<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>`]() : this

      return getter(property)
    }
  })}

  get real() { return new Proxy(class {}, {
    apply: (_: any, thisArg: any, argArray: any[]): any => this.real[get](Var.array("(", ...argArray, ")")),
    set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => {
      return true
    },
    get: (_: any, property: string | symbol, receiver: any): any => {
      const getter = (property: SupportedValue) => {
        //TODO Keep updating ** while evaluating for (args)

        //TODO Store if not yet loaded global
        let variable = Var.cast(property)

        for (let [key, value] of this.value.methods) {
          if (variable.instance_of(key)) return value.real;
        }

        return Var.expr("None").real //TODO Location of None
      }

      if (property == o) return this
      if (property == get) return getter
      if (property == partial_args) return (args?: PartialArgs) => args ? this.real[`<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>`]() : this

      return getter(property)
    }
  })}

  private external_method = (key: string | Var, value: string | Var | ExternalMethod) =>
    this.value.methods.set(Var.cast(key), Var.cast(value))

}

const latest = Symbol("latest");
class Context extends Var {
  //TODO Location of context

  @external()
  local() { return this; }

  has_method = (x: SupportedValue): boolean => {
    //TODO
    return false;
  }

}
namespace Language {
  export class Ray extends Context {
    constructor(private instance: Instance, public ether: string) {
      super();
    }

    //@external
    assign(version: SupportedValue) {
      super.assign(this.instance.load(Var.cast(version).string()))
      //TODO Update objects, defined in child contexts.
    }

    @external()
    external(x: SupportedValue, ctx: Context) {
      // TODO Get caller and check from there if it has
      if (!ctx.has_method(x)) throw new Error(`Expected externally defined method '${Var.cast(x).string()}' in ${ctx.real.name[o].string()}`)

      return ctx.lazy[get](x)
    }

    @external()
    location() { return Var.expr("IO").lazy(Var.path(this.ether)) }

  }
}
class Program extends Var {
  version: Language.Ray
  //TODO When version is set append programs
  //TODO Add Program to the version's program as a branch.

  constructor() {
    super();
    this.lazy[":"](Var.expr("Program"))
  }

  copy = (): Program => {
    //TODO
    return this;
  }

  eval = (): Var => {
    //TODO

    const s = [" ", "\t"]
    const DELIMITER = ["/", ".", ...s, ";", "\n"]


    return new Var()
  }
}
class ProgramLoader {
  program: Program = new Program()

  private expr = (path: string, expr: string) => {
    const x = new Var()

    x.lazy.location["&="](Var.expr("IO").lazy(Var.path(path)))
    x.lazy.expression["="](expr.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file

    return x;
  }

  dir = (path: string, args?: PartialArgs): this => {
    this.program.lazy.push_back(
      files(path)
        .filter(path => path.endsWith('.ray'))
        .map(path => this.expr(path, fs.readFileSync(path, "utf-8")))
        .map(x => x.lazy)
        .reduce((acc: any | undefined, x: any) => acc ? acc["push_back"](x) : x)
        .all.collapse[partial_args](args)
    )

    return this;
  }
  file = (path: string, args?: PartialArgs): this => {
    this.expr(path, fs.readFileSync(path, "utf-8")).lazy[partial_args](args)
    return this;
  }
}
class Instance {
  constructor(public ether: string) {
  }

  versions: { [key: string]: Language.Ray } = {}
  unbound_programs: Program[] = []
  programs: Program[] = []

  load = (version: string = "latest"): Language.Ray => {
    if (version != "latest") throw new Error("Versioning of Language not yet supported")

    let ray: Language.Ray;

    //TODO It's a Program with context: Context
    const program = new Program()
    //TODO Intermediately load objects when needed in this program, and run everything in front which needs to run in front.

    this.versions[version] = ray
    return ray;
  }

  bind = (program: Program, versions: string[]) => {
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      program = (i == 0 ? program : program.copy())
      program.version = this.versions[version] ?? this.load(version)
      this.programs.push(program);
    }
  }

  //TODO Also branch off existing program states
  branch = (load: (loader: ProgramLoader) => ProgramLoader, args: PartialArgs = {}): this => {
    const program = load(new ProgramLoader()).program.lazy[partial_args](args)[o]

    if (args["global"] && args["global"].length > 0) {
      this.bind(program, args["global"]);
    } else {
      this.unbound_programs.push(program)
    }

    return this;
  }

  eval = (args: PartialArgs) => {
    this.unbound_programs.forEach(program => this.bind(program, args["global"] ?? ["latest"]))
    this.unbound_programs = []

    this.programs.forEach(program => program.lazy[partial_args](args)[o].eval())
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
      return new Instance(default_path).branch(x => x.dir(`${default_path}/.ray`).file(location)).eval(args)
    else if (stat.isDirectory())
      return new Instance(location).branch(x => x.dir(`${location}/.ray`).file(`${location}/Ether.ray`)).eval(args)
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