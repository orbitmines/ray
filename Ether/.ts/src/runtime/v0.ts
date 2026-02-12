import {createContext, isToken, parse, Scope, Token, toToken} from "./parser.ts";
import fs from "fs";
import path from "node:path";
import PartialArgs = Ether.PartialArgs;

type ExternalMethod = (...args: [Node, ctx: Node]) => Node
type Encodable = string | number | boolean | void | undefined | null | symbol | Token | ExternalMethod
type Val = Node | Exclude<Encodable, symbol> | Obj | Var
type Node = Var & { [_]: Var, [Symbol.iterator](): Iterator<Node> } & { (args: Val): Node } & { [key in Exclude<string, keyof Var>]: Node } & { [key in keyof Function]: Node }
type Obj = { [key: string]: Val }

const Unknown = Symbol("unknown")
export const _ = Symbol("self")

class Var {

  //TODO Encoded clears undefined/null if something is added to the object?
  value: { encoded: Encodable, methods: Map<Node, Node> } = { encoded: Unknown, methods: new Map<Node, Node>() }

  private program?: Program

  private lazy_updates: ExternalMethod[] = []
  lazily = (call: ExternalMethod, ctx: Node): Node => { //TODO Context should come from calling lazily>
    this.lazy_updates.push((self: Node) => call(self, ctx))
    return this [_](ctx);
  }
  lazily_set = (key: Val, value: Val, ctx: Node) =>
    this.lazily((self, ctx) => self.set(key, value, ctx), ctx)
  lazily_get = (property: Val[], ctx: Node): Node => {
    const result = new Var()
    return result.lazily((self, ctx) => {
      const key = property.length === 1 ? Var.cast(property[0], ctx) : Var.array(property, ctx)

      // this.realize(ctx) // Realize where it came from

      result.program = new Program()
      result.program.ctx = self
      result.program.lazily_set('event', key, ctx)

      return ctx.None
    }, ctx)
  }
  realize = (ctx: Node): Node => {
    //TODO Do lazy updates separately when asking for .program
    this.lazy_updates.forEach(x => x(this [_](ctx), ctx))
    this.lazy_updates = []

    if (!this.program) return this [_](ctx);

    //TODO Should actually periodically update while running/stepping.
    this.value = this.program.eval().value
    this.program = undefined

    return this [_](ctx)
  }

  //TODO After grammar parse, reinterpret all the typed properties with the language itself.

  static cast = (val: Val, ctx: Node): Node => {
    if (val === undefined || val === null) return ctx.None
    if (isToken(val) || val instanceof Token) return Var.type(val, ctx)
    if (is_string(val)) return Var.string(val, ctx)
  }
  static type = (type: any, ctx: Node): Node => {
    const x = new Var()
    if (is_function(type)) type = type(createContext())
    x.value.encoded = type instanceof Token ? type : toToken(type)
    return x [_](ctx);
  }
  static string = (string: string, ctx: Node): Node => {
    const x = new Var()
    x.value.encoded = string
    return x [_](ctx);
  }
  static func = (method: ExternalMethod, ctx: Node): Node => {
    const x = new Var()
    x.value.encoded = method;
    return x [_](ctx);
  }
  static array = (entries: Val[], ctx: Node): Node => {
    let first: Node | undefined
    let current: Node

    entries.forEach(entry => {
      const next = Var.cast(entry, ctx)

      if (current) {
        current.next = next
        next.previous = current
      }

      current = next;
      if (!first) first = current;
    })

    let array = new Var() [_](ctx)
    array.next = first
    return array
  }

  get None(): Node {
    if (!(this instanceof Context))
      throw new Error('Not a context')

    const x = new Var()
    x.value.encoded = null
    return x [_](this [_]());
  }

  instance_of = (type: Node, ctx: Node) => {
    if (type.value.encoded instanceof Token) {
      const result = parse(type.value.encoded, this.as_string(ctx), { indent: 0 }) //TODO Fix initialized base value/

      //TODO Put result.scope to ctx.

      console.log(JSON.stringify(result.scope.statements.entries.filter((x: any) => x.content.properties.property_name).map((x: any) => [x.content._match, x.content.properties.property_name.map((x: any) => x._match), x.content.property_body._match]), null, 2))

      return result.success;
    } else if (is_string(type.value.encoded)) {
      return this.value.encoded === type.value.encoded
    }

    const pattern = [...this.iter(ctx).map(x => is_string(x.value.encoded) ? x.value.encoded : "*")].join('')
    console.log('pattern', pattern)

    console.log(type.value)

    throw new Error("Not implemented")
  }

  is_none = (): boolean => this.value.encoded === null || this.value.encoded === undefined

  as_boolean(ctx: Node): boolean {
    const self = this.expect_one(ctx)
    if (is_boolean(self.value.encoded)) return self.value.encoded;

    throw Error('Expected a boolean')
  }
  as_number(ctx: Node): number {
    const self = this.expect_one(ctx)
    if (is_number(self.value.encoded)) return self.value.encoded;

    throw Error('Expected a number')
  }
  as_string(ctx: Node): string {
    const self = this.expect_one(ctx)
    if (is_string(self.value.encoded)) return self.value.encoded;

    //TODO If array, which has strings in it, to String. for ( property ) for instance.

    throw Error('Expected a string')
  }

  has = (property: Node, ctx: Node): boolean => {
    for (let [key, value] of this.value.methods) {
      if (property.instance_of(key, ctx)) return true
    }
    return false;
  }

  set = (key: Val, value: Val, ctx: Node) => {
    this.realize(ctx)

    const result = Var.cast(value, ctx)
    this.value.methods.set(Var.cast(key, ctx), result)
    return result
  }
  get = (property: Node, ctx: Node): Node => {
    this.realize(ctx)

    for (let [key, value] of this.value.methods) {
      if (property.instance_of(key, ctx)) {
        if (is_function(value.value.encoded)) return value.value.encoded(property, ctx)
        return value
      }
    }

    return ctx.None
  }

  expect_one = (ctx: Node): Node => {
    const self = [...this.all(ctx)]
    if (self.length !== 1) throw new Error("Shouldn't call method for a single Var on one which defines Many.")
    return self[0]
  }

  *all(ctx: Node): Generator<Node> {
    const all = this.get(Var.string('#', ctx), ctx);
    if (all.is_none()) {
      yield this [_](ctx);
      return;
    }
    yield *all.iter(ctx)
  }

  *iter(ctx: Node): Generator<Node> {
    // TODO this.get('undirected') to support Ray
    let next;
    while (!(next = this.get(Var.string('next', ctx), ctx)).is_none()) { yield next }
  }

  [_](ctx?: Node): Node {
    if (!ctx && !(this instanceof Context)) throw new Error('ctx must be provided.')

    const node = new Proxy(class {}, {
      apply: (target: any, thisArg: any, argArray: any[]): any => this.lazily_get(["(", ...argArray, ")"], ctx),
      set: (target: any, property: string, newValue: any, receiver: any): boolean => { this[_](ctx)[property]["="](newValue); return true },
      get: (target: any, property: string | symbol, receiver: any): any => {
        if (property === _) return this;
        if (property in this) return this[property as keyof this]
        if (typeof property === 'symbol') throw new Error('Not implemented')
        return this.lazily_get([property], ctx)
      }
    })

    if (!ctx) ctx = node
    return node;
  }
}

class Context extends Var {

}

class Program extends Var {

  //TODO If imported in a directory, that context is available in a child directories. This allows us to isolate imports into separate contexts. -> Fork different versions of the context: EXTENDS ONLY APPLIES TO (->), while any other change on variable is on (<->)

  //  const x = new Var()
  // x[__].location["&="](Var.expr("IO")[__](Var.path(path)))
  // x[__].expression["="](expr.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file

  ctx: Node

  constructor(public language: string[] | undefined = undefined, public expression: string[] = []) {
    super();

    const ctx = new Context()
    this.ctx = ctx [_]()

    const initial = new Var() [_](this.ctx)[":"](this.ctx.Ray)
    initial["∙"] = this.ctx

    this [_](this.ctx).previous = initial
    initial.next = this [_](this.ctx)
  }

  partial_args = (args: PartialArgs): this => {
    return this.expr(this.expression.pop(), args);
  }

  eval = (): Node => {
    let terminal: Program[] = []
    let cursors: Program[] = [this]

    const partition = <T>(array: T[], predicate: (x: T) => boolean) => {
      const pass: T[] = [];
      const fail: T[] = [];

      for (const item of array) {
        (predicate(item) ? pass : fail).push(item);
      }

      return [pass, fail];
    };

    while (cursors.length !== 0) {
      const [done, todo] = partition(cursors, cursor => {
        const self = cursor [_](this.ctx).realize(this.ctx);
        const expanded = self.get(Var.cast('expand', this.ctx), this.ctx)
        if (!expanded.is_none()) {
          if (!(expanded[_] instanceof Program)) throw new Error('Expected a Program.')

          self.set(Var.cast('∙', this.ctx), expanded[_].eval(), this.ctx)
        } else {
          const event = cursor.get(Var.cast('event', this.ctx), this.ctx)
          if (!event.is_none()) {
            self.set(Var.cast('∙', this.ctx), self.ctx.get(event, this.ctx), this.ctx)
          } else {
            throw new Error('No expansion or event found, invalid program?')
          }
        }

        return self.get(Var.cast('next', this.ctx), this.ctx).is_none()
      });

      terminal.push(...done)
      cursors = todo
    }

    return terminal.length === 1 ? terminal[0][_](this.ctx)['∙'] : Var.array(terminal.map(x => x[_](this.ctx)['∙']), this.ctx)
  }

  expr = (expression: string, args?: PartialArgs): this => {
    console.log(expression)
    let expr = args && Object.entries(args).length !== 0 ? `(${expression})<${Object.entries(args).map(([key, value]) => `${key} = ${value.join(" & ")}`).join("\n")}>` : expression
    if (!/^(?:\P{White_Space}| |\n)*$/u.test(expr))
      throw new Error("All Unicode space separators (+ \\t), except the normal space, are illegal characters. This is for safety reasons: to ensure that text editors don't show function blocks where they shouldn't be.");

    (this.language !== undefined ? this.language : this.expression).push(expr)

    return this;
  }

  file = (path: string, args?: PartialArgs) =>
    this.expr(fs.readFileSync(path, "utf-8"), args)

  //TODO This will likely change: now we dont have information of what came from which file.
  dir = (path: string, args?: PartialArgs): this => {
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

    return this.expr(
      files(path)
        .filter(path => path.endsWith('.ray'))
        .map(path => fs.readFileSync(path, "utf-8"))
        .map(file => file.trim()) // Trim is important so that multiple files don't get attributed to a wrong class in another file
        .join('\n'),
      args
    )
  }

  // TODO This is a stupid copy, it doesn't reproduce the program state, but just reinitializes the entire expression
  copy = () => new Program([...this.language], [...this.expression])

  compose = (b: Program) => {
    if (b.language !== undefined) throw new Error('Cannot compose programs which have their language defined.')
    return new Program(this.language, [...this.expression, ...b.expression])
  }

}


namespace Language {
  export class Ray extends Program {
    constructor(private instance: Instance, public ether: string) {
      super([]);
    }

    bootstrap = (): this => {
      //TODO Blocks of comments are passed on the first thing in front of them.

      //TODO First interpret STD with bootstrap, then interpret it with itself.

      // Dynamic grammar is basically a dependent type which causes reevaluation.

      //TODO Grammar is only used for parsing the STD, then the STD is used to parse the other rules.

      //TODO After all the grammar rules are matched, match to all usual methods and superpose them into a single rule for that context.

      // TODO Comments dont consume a block/*, so they shouldn't capture this: (Not capturing it, gives it to the place where that statement was made)v -> But anything can capture a block, need to explcitely say it's not capturing it.

      // Technically there could be additional grammar rules incorrectly defined in comments here, but since we're only bootstrapping for the std, we're assuming the grammar rules defined in it don't have this issue. (In the bootstrapped version, this will be done properly)

      // this.lazily(() => {
        const grammar = Var.type((ctx: any) => {
          ctx.empty_line = ctx.regex(/[ \t]*\n/);

          const RULE_NAME = ctx.Array(ctx.not(' ', '\n')[``], '{', ctx.Expression, '}', ctx.not(' ', '\n')[``])[``]
          const RULE_ONLINE_BODY = ctx.Any(
            ctx.Array(ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1), ctx.Any(ctx.Array('(', ctx.val(' ')[``], ')').bind(ctx.parenthesis), ctx.val('=>')), ctx.statement.optional),
            ctx.Array(ctx.val(' ')[``], ctx.end)
          )
          ctx.PROPERTIES = ctx.Array(
            ctx.Array(
              ctx.Any(
                RULE_NAME.bind(ctx.property_name),
                ctx.not('\n')
              ),
              ctx.Any(' & ', ' | ').optional
            )[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.properties),
            RULE_ONLINE_BODY.bind(ctx.property_body)
          )

          ctx.statement = ctx.Array(
            ctx.empty_line[``],
            ctx.PROPERTIES.bind(ctx.content),
            ctx.Any('\n', ctx.end),

            ctx.Array(
              ctx.empty_line[``],
              ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
              ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.added),
              ctx.statement.with(
                (scope: Scope) => ({...scope, indent: scope.indent + scope.added.count})
              )
            )[``].bind(ctx.children)
          );

          ctx.Expression = ctx.statement[``].bind(ctx.statements);

          return ctx.Expression;
        }, this.ctx)


      // this.value.methods.set(Var.type((ctx: any) => ctx.Array(ctx.val('('), ctx.arbitrary, ctx.val(')')), ctx), Var.func(property => {
      //
      // }, ctx))

      // }, this.ctx)

      const bootstrap_ctx = new Context() [_]()

      console.log('instance_of', Var.string(
        this.language.join('\n')
        // '({expr: (): *}) => expr'
        // 'property{test: String}\n  body'
      , bootstrap_ctx).instance_of(grammar, bootstrap_ctx))

      return this;
    }

    include = () => this.dir(`${this.ether}/.ray`)

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

    this.versions[version] = new Language.Ray(this, this.ether).include().bootstrap()
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
    const program = load(new Program()).partial_args(args)

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
    this.programs.forEach(program => program.partial_args(args).eval())
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

/**
 * Copied from https://github.com/lodash/lodash/blob/main/dist/lodash.js
 */
export const is_boolean = (value: any): value is boolean =>
  value === true || value === false || (is_object_like(value) && base_tag(value) == '[object Boolean]');
export const is_number = (value: any): value is number => typeof value == 'number' || (is_object_like(value) && base_tag(value) == '[object Number]');
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