
class Def {
  key: string | string[] | ((key: Obj) => boolean)
}
class Defs {
  protected by_key: { [key: string]: Def }
  protected by_match: Def[]
  get = (key: Obj): Def | undefined => {
    if (is_string(key.value)) return this.by_key[key.value]
    for (let def of this.by_match) {
      if (is_function(def.key) && def.key(key)) return def
    }
    return undefined
  }
  set = (def: Def) => {
    if (is_string(def.key))
      this.by_key[def.key] = def
    else if (is_array(def.key))
      for (let key of def.key) { this.by_key[key] = def }
    else
      this.by_match.push(def)
  }
}
class Obj {
  value: any
  defs = new Defs()
}

const DEFAULT_CONTEXT: Context = {}

class Expression {
  ast: any

  constructor(public string: string, public context: Context = DEFAULT_CONTEXT) {
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