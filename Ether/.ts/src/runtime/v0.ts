// The v0 runtime is a specification runtime, without any optimizations.

// What happens when conflicting versions are used, check backwards/forwards compatibility
//   If conflict -> optimistically assume reinterpretation of each Lazy Program: Variable for each separate context.
// Different evaluation groups; if something else introduces new syntax, I dont want it to effect other groups; only those which import it
//
// Function variable from context. So create a new context for each function and assign '&'.


import PartialArgs = Ether.PartialArgs;

import fs from 'fs'
import path from "node:path";

type ExternalMethod = (...args: [Val, ctx: Context]) => Val | void

type Val = string | symbol | Var | ExternalMethod

namespace Symbols {
  export const self = Symbol("self");
  export const get = Symbol("*");
  export const partial_args = Symbol("<>");
  export const all = Symbol("#");
  export const evaluate = Symbol("eval");
  export const execute = Symbol("execute");
}
const _ = (property?: "*" | "<>" | "()" | "#" | ">>"): symbol => {
  if (property === undefined) return Symbols.self;
  if (property === "*") return Symbols.get;
  if (property === "()") return Symbols.evaluate;
  if (property === "#") return Symbols.all;
  if (property === ">>") return Symbols.execute;
  return Symbols.partial_args;
}
const __ = _()

// v0 Assumes termination when it shouldn't, and instead we'd want a NPC to decide which branches to explore and how.
const incorrectly_assume_termination = (x: Generator<Var>): Var[] => [...x];

type NODE = {
  none?: boolean
  //TODO Dynamically allocate conditional methods
  get methods(): Map<Var, Var>
}

class Var {
  value: NODE = { methods: new Map<Var, Var>() }
  encoded_string?: string
  func?: Var

  dependants: Var[] //TODO dynamically. or implement in the language: override = of all mentioned vars dependencies.

  static cast = (val: Val): Var => {
    if (is_symbol(val)) val = val.toString()

    if (is_string(val)) {
      if (val.includes(" ")) val = Var.expr(val)
      else val = Var.string(val)
    } else if (is_function(val)) val = Var.func(val)

    return val;
  }
  static string = (value: string): Var => {
    const x = Var.array(...[...value]
      .map(ch => {
        const codepoint = ch.codePointAt(0)
        const char = codepoint.toString(2).padStart(24, "0").split("").map(x => Number(x))

        const x = Var.array(...char.map(digit => Var.digit(digit, 2)))
        x.encoded_string = ch;
        console.log('-->', x.encoded_string)
        return x;
      })
    )//[__][":"](Var.expr("String"))[__]
    x.encoded_string = value
    return x;
  }
  static digit = (digit: number, base: number): Ray => {
    if (digit > base || digit < 0) throw new Error(`Digit is 0 < . < ${base}`)
    if (base < 2) throw new Error(`Base is >= 2`)

    let integer = new Ray()
    let selected: Ray = integer
    for (let i = 0; i < base - 1; i++) {
      integer = integer.push_ray()

      if (digit === i + 1)
        selected = integer;
    }

    const cursor = new Ray()
    cursor[__]["&+="](selected)
    return cursor
  }
  static array = (...entries: Val[]): Ray => {
    let first: Ray | undefined
    let current: Ray

    entries.forEach(entry => {
      let next: Ray;
      if (entry instanceof Ray) {
        next = entry
      } else {
        next = new Ray()
        next[__]["&+="](entry)
      }
      if (entry instanceof Var)
        next.encoded_string = entry.encoded_string

      // console.log('--->', next.encoded_string)

      if (current) current.push_ray(next)

      current = next;
      if (!first) first = current;
    })

    let array = new Ray()
    array[__].next = first;

    return array
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
    const x = new Var()
    if (expression === "None")
      x.value.none = true
    return x;
  }
  static func = (func: ExternalMethod): Var => {
    const x = new Var()
    x.call = func
    return x;
  }

  private initialized: boolean = false
  private program?: Var
  call?: ExternalMethod

  constructor(private initialize?: () => void) {
    this.external_method("* | methods", () => Var.map(this.value.methods))
    this.external_method("** | program", () => this.program)
    this.external_method("= | assign", this.assign)
  }

  assign(x: Val) {
    console.log('Assigned', x)
    this.value = Var.cast(x).value
    // TODO Update location
    // TODO Update version control if present

    // TODO If assign is called on None, then set in .methods (Set .methods in location)
  }

  none = (): boolean => this[_("()")].value.none

  digit = (): number => {
    let i = 0

    let current = this[__]
    while(!(current = current.previous)[__].none()) { i += 1 }

    return i;
  }

  boolean = (): boolean => this[__]['as'](Var.expr('boolean'))[0][__].digit() == 1
  string = (): string => {
    if (this[__]['=='].instance_of(Var.expr('String'))[__].boolean()) throw new Error('Variable is not of type String.')

    let string = "";

    let char = this[__]['as'](Var.expr('String'))
    while (!(char = char.next)[__].none()) {
      //TODO Decide how to encode chars.
    }

    return string;
  }

  matches = (...pattern: Val[]): boolean => {
    if (this.encoded_string) return false;

    console.log('Checking if matches', ...pattern)
    let current = this.get('next')
    current[_("()")]
    current = current.get('next')
    for (const part of pattern) {
      current[_("()")]

      if (Var.cast(part).encoded_string === '{*}') continue;
      console.log(current, 'instanceof', part)
      if (!current.instance_of(part)) return false;

      current = current.get('next')
    }
    return true;
  }

  instance_of = (type: Val): boolean => {
    type = Var.cast(type)

    console.log('instance_of', this.encoded_string, type.encoded_string)

    if (this.encoded_string && type.encoded_string)
      return this.encoded_string == type.encoded_string

    return false;
    throw new Error('Not yet implemented')

    // this[_("()")]
    // type[_("()")]


    return false;
  }

  get = (property: Val): Var => {
    property = Var.cast(property)

    this[_("()")]

    console.log('is func', property.call !== undefined)
    if (property.matches('(', '{*}', ')')) {
      if (!this.call) throw new Error('Variable is not callable')
      const x = this.call(property.get('next').get('next'), new Context()) //TODO Context
      return x ? Var.cast(x) : new Var() //TODO Void
    }

    for (let [key, value] of this.value.methods) {
      if (property.instance_of(key)) return value
    }

    return Var.expr("None") //TODO Location of None
  }


  // Iterate over all
  *[_("#")](): Generator<Var> {
    if (this.get('#').none()) {
      yield this;
      return;
    }

    const found: Var[] = []
    const find = (x: Var) => {
      if (x.none()) return false;
      if (found.includes(x)) return false;
      found.push(x);
      return x;
    }

    for (let x of this.get('#').get('undirected').get('next')[_('#')]()) {
      if (find(x)) yield x;
    }
  }
  // Execute program
  get [_(">>")]() {
    this[_("()")]
    console.log(this)

    let terminal: Var[] = []
    let cursors: Var[] = [this]
    while (cursors.length !== 0) {
      console.log('next')
      const [done, todo] = partition(cursors, cursor => cursor.get('next').none())
      terminal.push(...done)
      console.log(todo.length)

      //TODO Define logic which determines how to step (a possibly infinitely generating program with each .next)

      //TODO Hierarchy if events still need to see if a parent has a next defined

      cursors = todo.flatMap(cursor => {
        let reduced: Var[] = [cursor]
        while (reduced.some(cursor => !cursor.get('expand').none())) {
          reduced = reduced.flatMap(cursor => cursor.get('expand').none() ? cursor : incorrectly_assume_termination(cursor.get('expand')[_("#")]()))
        }
        console.log('reduced', reduced.length)

        return reduced.flatMap(cursor => {
          const x = cursor.get('previous').get('∙')
          const result = cursor.get('∙')

          result.value = x.get(cursor.func).value

          console.log('Execute', cursor.func)

          const next = cursor.get('next')
          console.log('next is', [...next[_("#")]()])
          return incorrectly_assume_termination(next[_("#")]())
        })
      })
      console.log('after', cursors.length)
    }
    console.log('done,', terminal.length, 'branch(es)')

    //TODO return alters control-flow and jumps to the thing which calls >> ?

    // eval = (): Var => {
    //   //TODO
    //
    //   const s = [" ", "\t"]
    //   const DELIMITER = ["/", ".", ...s, ";", "\n"]
    //
    //
    //   return new Var()
    // }
    //

    //TODO Superpose .terminal.∙
    return new Var()
  }
  // Evaluate lazy variable
  get [_("()")](): Var {
    if (!this.initialized && this.initialize) this.initialize()
    this.initialized = true

    if (!this.program) return this;

    //TODO Should actually periodically update while running/stepping.
    this.value = this.program[_(">>")].value
    this.program = undefined

    return this;
  }
  // Lazy property getter
  [_("*")](...property: Val[]) {
    //TODO

    if (this.initialized)
      throw new Error('Lazyily updating object after initialization is not allowed by the runtime itself.')

    const _super = this.initialize;
    this.initialize = () => {
      if (_super) _super()

      //TODO
      if (property.length === 1) {
        this.value.methods.set(Var.cast(property[0]), result)
      }
    }

    // console.log('lazily getting', ...property)
    const result = new Var(() => {
      //TODO
      result.program = new Var()
      result.program.value.methods.set(Var.cast('next'), new Var())
      console.log('lazy func', property.length === 3)
      result.program.func = property.length === 1 ? Var.cast(property[0]) : Var.array(...property)
    })

    return result[__]
  }
  [_("<>")](args?: PartialArgs) { return args && Object.entries(args).length !== 0 ? this[__][`<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>`]() : this }
  get [__]() { return new Proxy(class {}, {
    apply: (target: any, thisArg: any, argArray: any[]): any => this[_("*")]("(", ...argArray, ")"),
    set: (target: any, property: string | symbol, newValue: any, receiver: any): boolean => { this[__][property]["="](newValue); return true },
    get: (target: any, property: string | symbol, receiver: any): any => {
      if (property == __) return this
      if (is_symbol(property)) return this[property]

      return this[_("*")](property)
    }
  })}

  on_initialization = (call: () => void) => {
    const _super = this.initialize;
    this.initialize = () => {
      if (_super) _super()
      call()
    }
  }

  protected external_method = (key: string | Var, value: string | Var | ExternalMethod) => {
    this.on_initialization(() => this.value.methods.set(Var.cast(key), Var.cast(value)))
  }

}

class Ray extends Var {
  constructor() {
    super();
    this[__][":"](Var.expr("Ray"))
  }

  push_ray = (next: Ray = new Ray()) => {
    //next[__]["&+="](Var.cast(x)) //TODO How to indicate I want the right component

    next[__].previous = this
    this[__].next = next

    return next
  }
}

const latest = Symbol("latest");
class Context extends Var {
  //TODO Location of context

  constructor() {
    super();

    this.external_method("local", () => this)
  }

  has_method = (x: Val): boolean => {
    //TODO
    return false;
  }

}
namespace Language {
  export class Ray extends Context {
    constructor(private instance: Instance, public ether: string) {
      super();

      this.external_method("external", this.external)
      this.external_method("location", this.location)
    }

    //@external
    assign(version: Val) {
      super.assign(this.instance.load(Var.cast(version).string()))
      //TODO Update objects, defined in child contexts.
    }

    external(x: Val, ctx: Context) {
      // TODO Get caller and check from there if it has
      if (!ctx.has_method(x)) throw new Error(`Expected externally defined method '${Var.cast(x).string()}' in ${ctx[__].name[__].string()}`)

      return ctx[_("*")](x)
    }

    location() { return Var.expr("IO")[__](Var.path(this.ether)) }

  }
}
class Program extends Var {
  version: Language.Ray
  //TODO When version is set append programs
  //TODO Add Program to the version's program as a branch.

  constructor() {
    super();
    this[__][":"](Var.expr("Program"))
  }

  copy = (): Program => {
    //TODO
    return this;
  }

}
class ProgramLoader {
  program: Program = new Program()

  private expr = (path: string, expr: string) => {
    const x = new Var()

    x[__].location["&="](Var.expr("IO")[__](Var.path(path)))
    x[__].expression["="](expr.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file

    return x;
  }

  dir = (path: string, args?: PartialArgs): this => {
    this.program[__].push_back(
      files(path)
        .filter(path => path.endsWith('.ray'))
        .map(path => this.expr(path, fs.readFileSync(path, "utf-8")))
        .map(x => x[__])
        .reduce((acc: any | undefined, x: any) => acc ? acc.push_back(x) : x)
        .all.collapse[_("<>")](args)
    )

    return this;
  }
  file = (path: string, args?: PartialArgs): this => {
    this.expr(path, fs.readFileSync(path, "utf-8"))[__][_("<>")](args)
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
    const program = load(new ProgramLoader()).program[_("<>")](args)[__]

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

    Var.string('test_string')[__]("A")[_("()")]
    // this.programs.forEach(program => program[_("<>")](args)[_(">>")])
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

const partition = <T>(array: T[], predicate: (x: T) => boolean) => {
  const pass: T[] = [];
  const fail: T[] = [];

  for (const item of array) {
    (predicate(item) ? pass : fail).push(item);
  }

  return [pass, fail];
};