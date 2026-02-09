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

    //TODO Superpose .terminal.∙
    return new Var()
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
  export class Ray extends Program {
    constructor(private instance: Instance, public ether: string) {
      super();

      this.external_method("external", this.external)
      this.external_method("location", this.location)
    }

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
