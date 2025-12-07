//TODO = removes anything from the previous value from the object (so we need to know the origin of the things that set the vars)
//TODO Keys are encoded on Edges on the Ray node definition.

// The v0 runtime is a specification runtime, without any optimizations.


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

class Context {
  static file = (path: string) => new Context({ path, x: fs.readFileSync(path, "utf-8") });

  constructor(object: any = {}) {
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }

  path: string
  get name() { let path = this.path.split('/'); return path[path.length - 1].replaceAll(/\.ray\.txt$/g, "") }
  x: Token[]
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
class Instance {

  static DIR = "../.."

  static run = (args: RuntimeArgs = runtime_args({
    '@': [Instance.DIR]
  })) => {
    if (args['@'].length !== 1) throw new Error('In order to run multiple instances, for now run them in separate terminals.')

    const path = args['@'][0]
    const stat = fs.statSync(path)

    delete args['@']

    //TODO Always load ETHER executable with ENTRYPOINT = Context.file
    if (stat.isFile())
      return new Instance(`${Instance.DIR}/.ray.txt`).eval(args, Context.file(path))
    else if (stat.isDirectory())
      return new Instance(`${path}/.ray.txt`).eval(args, Context.file(`${Instance.DIR}/Ether.ray.txt`))
    else
      throw new Error('Unknown Ether instance directory or file.')
  }

  constructor(public dir: string) {
    this.eval({}, ...files(dir)
      .filter(file => file.endsWith('.ray.txt'))
      .map(file => Context.file(file))
    )
  }

  //TODO Check if types match, and use "" if a string.
  eval = (args: RuntimeArgs, ...files: Context[]) => {
    console.log(files)

    const s = [" ", "\t"]
    const DELIMITER = ["/", ".", ...s, ";", "\n"]

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

type RuntimeArgs = { [key: string]: string[] }
const runtime_args = (result: RuntimeArgs = {}) => {
  const args = process.argv.slice(2);
  let using_default_entrypoint = true;

  const add = (key: string, expression: string) => {
    if (key == '@' && using_default_entrypoint) {
      result['@'] = []
      using_default_entrypoint = false;
    }

    if (key in result) result[key].push(expression);
    else result[key] = [expression];
  };

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];

    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, value] = arg.slice(2).split("=");
      add(key, value);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (args[i + 1] && !args[i + 1].startsWith("-"))
        add(key, args[++i]);
      else
        add(key, "true");
    } else if (arg.startsWith("-")) {
    } else {
      add('@', arg)
    }
  }

  return result;
}

Instance.run()