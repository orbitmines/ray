
type ExternalMethod = (...args: [Val, ctx: Node]) => Val | void
type Encodable = string | number | boolean | void | undefined | null | symbol
type Val = Node | Expr | Exclude<Encodable, symbol> | Obj | Var | ExternalMethod
type Node = Var & { [_]: Var } & { [key in Exclude<string, keyof Var>]: Node }
type Obj = { [key: string]: Val }

const Unknown = Symbol("unknown")
const _ = Symbol("self")

class Var {
  value: { encoded: Encodable, methods: Map<Var, Var> } = { encoded: Unknown, methods: new Map<Var, Var>() }

  static cast = (val: Val, ctx: Node): Var => {
    if (val === undefined || val === null) return ctx.None
  }
  static expr = (statement: (ctx: Node) => Val | void): Expr => ({ parse: (ctx: Node) => statement(ctx) })
  
  Any = (...x: Val[] | [(ctx: Node) => Val[]]): Node => {

  }
  Array = (...x: Val[] | [(ctx: Node) => Val[]]): Node => {

  }
  constrain = (lhs: (node: Node) => Node, operator: '<=' | '<' | '>=' | '>' | '==', rhs: Val): Node => {}
  // <key: value>
  with = (obj: { [key: string]: Val }): Node => {}
  get optional(): Node {}

  //TODO [] / [``] defined here

  val = (val: Val): Node => Var.cast(val, this[_])[_]

  bind = (location: Node): Node => {
    // Variable is set = , the type is just type information on the location.
  }

  get end(): Node { return this[_]["⊣"] }

  get as_boolean(): boolean {
    if (is_boolean(this.value.encoded)) return this.value.encoded;

    throw Error('Expected a boolean')
  }
  get as_number(): number {
    if (is_number(this.value.encoded)) return this.value.encoded;

    throw Error('Expected a number')
  }
  get as_string(): string {
    if (is_string(this.value.encoded)) return this.value.encoded;

    throw Error('Expected a string')
  }

  get [_](): Node {
    return undefined
  }
}

interface Expr {
  parse: (ctx: Node) => Val
}
class Expression implements Expr {
  parse = (ctx: Node): Val => {
    return undefined;
  }

  //TODO Whatever is used to dynamically parse should get new syntax in the language for this pattern matching dynamically reassigning
  //TODO After change, what we just parsed is skipped.
  // Dynamic grammar is basically a dependent type which causes reevaluation.

  grammar: Expr = Var.expr((ctx: Node) => {
    ctx.empty_lines = ctx.Array(ctx.val(' ')[``],'\n')[``]
    ctx.statement = ctx.Array((ctx: Node) => [
      ctx.empty_lines,
      ctx["*"].bind(ctx.content),
      ctx.Any('\n', ctx.end),
      ctx.Array((ctx: Node) => [
        ctx.empty_lines,
        ctx.val(' ')[``].constrain(x => x.length, '==', ctx.indent),
        ctx.val(' ')[``].constrain(x => x.length, '>=', 1).bind(ctx.added_indent),
        ctx.expression.with({ indent: ctx.indent.as_number + ctx.added_indent.as_number })
      ])[``].bind(ctx.block)
    ])
    ctx.expression = ctx.statement[``]
  })
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