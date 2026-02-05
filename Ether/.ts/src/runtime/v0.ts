// The v0 runtime is a specification runtime, without any optimizations.

// What happens when conflicting versions are used, check backwards/forwards compatibility
//   If conflict -> optimistically assume reinterpretation of each Lazy Program: Variable for each separate context.
// Different evaluation groups; if something else introduces new syntax, I dont want it to effect other groups; only those which import it
//
// Function variable from context. So create a new context for each function and assign '&'.


import PartialArgs = Ether.PartialArgs;

import fs from 'fs'
import path from "node:path";
import {Token} from "./refactor3.ts";


// v0 Assumes termination when it shouldn't, and instead we'd want a NPC to decide which branches to explore and how.
const incorrectly_assume_termination = (x: Generator<Var>): Var[] => [...x];

//TODO Dynamically allocate conditional methods

export class Var {
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
  static ref = (ref: () => Var): Var => {
    const x = new Var()
    x.on_initialization(() => x.value = ref().value)
    return x;
  }
  static any = (...val: Val[]): Var => {
    // reduce(|)
  }

  static arbitrary = () => Var.expr("*")
  static end = () => Var.expr("⊣") //TODO Should be from context.

  // TODO If array, and has inside, include the methods from the variables names inside.


  private initialized: boolean = false
  private initialize?: () => void
  private program?: Var
  call?: ExternalMethod
  constructor(external_methods: { [key: string]: ExternalMethod } = {}) {
    external_methods = {
      "* | methods": () => Var.map(this.value.methods),
      "** | program": () => this.program,
      "= | assign": this.assign,
      ...external_methods
    }

    Object.entries(external_methods).forEach(([name, method]) => this.external_method(name, method))
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
    // TODO If this.get('#"), map

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

      //TODO Carry over context from previous context if it's a expanded func

      //TODO Using in an array, changes the selected location, so it is a new variable. But still linked to the old variable.

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
      throw new Error('Lazily updating object after initialization is not allowed by the runtime itself.')

    const _super = this.initialize;
    this.initialize = () => {
      if (_super) _super()

      //TODO
      if (property.length === 1) {
        this.value.methods.set(Var.cast(property[0]), result)
      }
    }

    // console.log('lazily getting', ...property)
    const result = new Var()
    result.on_initialization(() => {
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

  push_ray = (next: Ray = new Ray()) => {
    //next[__]["&+="](Var.cast(x)) //TODO How to indicate I want the right component

    next[__].previous = this
    this[__].next = next

    return next
  }
}

class Ray extends Var {
  constructor() {
    super();
    this[__][":"](Var.expr("Ray"))
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

class Expression {

  constructor(public string: string, rules: Token) {
    this.grammar.rules = rules
  }

  parse = () => {
    let candidates;
    while ((candidates = this.candidates).length !== 0) {
      const primary = candidates.filter(x => x.maybe_defines_grammar)

      // Match to primary candidates for grammar rewrites
      // Interpret grammar rules, one by one, reevaluating if a previous one changed it. (Don't allow loops?)
      // Interpret the things from Node
      // Then execute each function separately

      Token.array(
        Token.loop(Token.string(' ')),
        Token.regex(/[^ ]*/).bind('substring'),
        Token.loop(Token.array(
          Token.optional(Token.any(
            // TODO Also includes other tokens

          )),
          Token.array(Token.string('{'), Token.ref(() => this.grammar.expression).bind('expression'), Token.string('}')),
          Token.regex(/[^ ]*/).bind('substring'),
        )),

        Token.any(
          Token.array(Token.string(' '), Token.string('('), Token.loop(Token.string(' ')), Token.string(')'), Token.arbitrary()),
          Token.array(Token.string('=>'), Token.arbitrary()),
        )
      )

    }
  }

  reevaluate = () => {}

  get candidates(): any {}

  grammar: any = {
    // statement: Token.array(
    //   Token.loop(Token.regex(/ *\n/)),
    //   Token.ref(() => this.grammar.rules).bind('content'),
    //   Token.any(Token.string('\n'), Token.end()),
    //   Token.loop(
    //     Token.array(
    //       Token.loop(Token.regex(/ *\n/)),
    //       Token.times(Token.string(' ')).exactly('indent'),
    //       Token.times(Token.string(' ')).atLeast(1).bind('added'),
    //       Token.withParams(
    //         (ctx, bindings) => ({ indent: ctx.params.indent + bindings.added.count }),
    //         Token.ref(() => this.grammar.expression)
    //       )
    //     )
    //   ).bind('children')
    // ),
    // expression: Token.loop(Token.ref(() => this.grammar.statement)).bind('statements')

    statement: Var.array(

      Var.array(Var.string(' ').loop, '\n').loop,
      Var.ref(() => this.grammar.rules).bind('content'),
      Var.any('\n', Var.end()),
      Var.array(
        Var.array(Var.string(' ').loop, '\n').loop,
        Var.string(' ').loop.length('==', ctx.indent),
        Var.string(' ').loop.length('>=', 1).bind('added'),
        Var.ref(() => this.grammar.expression).with(() => ({ indent: ctx.params.indent + bindings.added.count }))
      ).loop.bind('children')
    ),
    expression: Var.ref(() => this.grammar.statement).loop.bind('statements')
  }
}

class Program extends Var {

  //TODO If imported in a directory, that context is available in a child directories. This allows us to isolate imports into separate contexts. -> Fork different versions of the context: EXTENDS ONLY APPLIES TO (->), while any other change on variable is on (<->)

  //  const x = new Var()
  // x[__].location["&="](Var.expr("IO")[__](Var.path(path)))
  // x[__].expression["="](expr.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file

  context = new Context()

  constructor(public expression: string[] = []) {
    super();

    const initial = new Ray()
    initial[__]["∙"] = this.context

    this[__].previous = initial
    initial[__].next = this
  }

  [_("<>")](args: PartialArgs): this {
    return this.expr(this.expression.pop(), args);
  }

  expr = (expression: string, args?: PartialArgs): this => {
    console.log(expression)
    let expr = args && Object.entries(args).length !== 0 ? `(${expression})<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>` : expression
    if (!/^(?:\P{White_Space}| |\n)*$/u.test(expr))
      throw new Error("All Unicode space separators (+ \\t), except the normal space, are illegal characters. This is for safety reasons: to ensure that text editors don't show function blocks where they shouldn't be.")

    this.expression.push(expr)

    return this;
  }

  file = (path: string, args?: PartialArgs) =>
    this.expr(fs.readFileSync(path, "utf-8"), args)

  //TODO This will likely change: now we dont have information of what came from which file.
  dir = (path: string, args?: PartialArgs): this => {
    return this.expr(
      files(path)
        .filter(path => path.endsWith('.ray'))
        .map(path => fs.readFileSync(path, "utf-8"))
        .map(file => file.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file
        .join('\n'),
      args
    )
  }

  // This is a stupid copy, it doesn't reproduce the program state, but just reinitializes the entire expression
  copy = () => new Program([...this.expression])

  compose = (b: Program) => new Program([...this.expression, ...b.expression])

}
namespace Language {
  export class Ray extends Program {
    constructor(private instance: Instance, public ether: string) {
      super();

      this.external_method("external", this.external)
      this.external_method("location", this.location)
    }

    include = () => this.dir(`${this.ether}/.ray`)

    //@external
    assign(version: Val) {
      //TODO Assigning changes the graph from one language to another. branches at that new language.
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

class Instance {
  constructor(public ether: string) {
  }

  //TODO Single Program, then branched with different versions, then branched with different programs.
  // TODO Single Program per language version. Many programs through #.
  versions: { [key: string]: Program } = {}
  unbound_programs: Program[] = []
  programs: Program[] = []

  load = (version: string = "latest"): Program => {
    if (version != "latest") throw new Error("Versioning of Language not yet supported")

    this.versions[version] = new Language.Ray(this, this.ether).include()
    return this.versions[version];
  }

  bind = (program: Program, versions: string[]) => {
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      const std = (this.versions[version] ?? this.load(version)).copy()
      program = (i == 0 ? program : program.copy())

      // const step = new Ray()
      // step[__]["expand"] = program
      // std.push_ray(step)

      this.programs.push(std.compose(program));
    }
  }

  //TODO Also branch off existing program states
  branch = (load: (loader: Program) => Program, args: PartialArgs = {}): this => {
    const program = load(new Program())[_("<>")](args)

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

    // Var.string('test_string')[__]("A")[_("()")]
    this.programs.forEach(program => program[_("<>")](args)[_(">>")])
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
      return new Instance(default_path).branch(x => x.file(location)).eval(args)
    else if (stat.isDirectory())
      return new Instance(location).branch(x => x.file(`${location}/Ether.ray`)).eval(args)
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

const partition = <T>(array: T[], predicate: (x: T) => boolean) => {
  const pass: T[] = [];
  const fail: T[] = [];

  for (const item of array) {
    (predicate(item) ? pass : fail).push(item);
  }

  return [pass, fail];
};


// Allow forward dependent type, the thing which matched first and then satisfies all conditions gets matched.

// Allow A, Graph{count == 100}, B // to mean arbitrary connectivity of count 100, but every path leads from A to B.

// Generally allow styling/style classes to be applied to your property. ; later also things like sub/super etc..

//   [1, 2, 3]
//     method // Is this an array of [1, 2, 3] -> Default to Array, and if () or => use function.
