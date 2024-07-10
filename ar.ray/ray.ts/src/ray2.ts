import _ from "lodash";
import {Dictionary, Function, is_boolean, is_function, is_iterable, is_number, is_object} from "./ray";

export type Recursive<T> = (T | Recursive<T | T[]>)[];

class Ray {

  /** Reflection */
  get __class__() { return Ray; }
  get __methods__() { return [...this.__static_methods__, ...this.__class_methods__]; }
  get __static_methods__() { return Object.keys(this.__class__) }
  get __class_methods__() { return Object.keys(this) }
  __method__ = (name: string) => (this.__class__ as any)[name] ?? (this as any)[name];

  /** Instantiation */
  static __new__ = (args: any[] = [], kwargs: Dictionary = {}): any => {
    let {
      __GLOBAL_CONTEXT__ = undefined, __object__ = undefined
    } = kwargs;

    throw new Error()
  }

  is_none = (self = this.proxy.self) => !('self' in self.self)
  is_initial = (self = this.proxy.self) => self.initial.is_none
  is_terminal = (self = this.proxy.self) => self.terminal.is_none

  is_vertex = (self = this.proxy.self) => self.is_initial.nor(self.is_terminal)
  is_reference = (self = this.proxy.self) => self.is_initial.and(self.is_terminal)
  is_boundary = (self = this.proxy.self) => self.is_initial.xor(self.is_terminal)

  is_extreme = (self = this.proxy.self) => self.is_none.and(self.is_boundary)
  is_wall = (self = this.proxy.self) => self.is_none.and(self.initial.is_some).and(self.terminal.is_some)

  reverse = (self = this.proxy.self) => new self({ initial: self.terminal, self, terminal: self.initial })
  compose = (a = this.proxy.self, b: any) => a.terminal.equivalent(b.initial)

  static none = new Ray()
  static initial = Ray.none; static self = Ray.none; static terminal = Ray.none;

  static undefined = Ray.none; static null = Ray.none;
  static boolean = (ray: boolean) => Ray.none; static true = Ray.none; static false = Ray.none;
  static object = (ray: object) => Ray.none
  static iterable = <T>(ray: Iterable<T>) => Ray.none
  static iterator = <T>(ray: Iterator<T>) => Ray.none
  static async_iterable = <T>(ray: AsyncIterable<T>) => Ray.none
  static async_iterator = <T>(ray: AsyncIterator<T>) => Ray.none
  static number = (ray: number) => Ray.none
  static function = (ray: Function) => {
    if (!is_function(ray)) return Ray.none

    // const ray = Ray.__new__();
    // ray.terminal = () => {
    //   // const input = ray.terminal.terminal;
    //   // const output = fn(input)
    //   // input.terminal = output;
    //   // return output;
    //   throw new Error()
    // };
    // return ray
    return Ray.none
  }

  static any = (ray: any) => {
    if (ray === undefined) return Ray.undefined;
    else if (ray === null) return Ray.null;
    else if (ray instanceof Ray || ray.prototype === Ray.prototype) return new ray() // This is a copy
    else if (is_function(ray)) return Ray.function(ray)
    else if (is_boolean(ray)) return Ray.boolean(ray)
    else if (is_number(ray)) return Ray.number(ray)
    else if (is_iterable(ray)) return Ray.iterable(ray)
    else if (is_object(ray)) return Ray.object(ray)
    else throw new Error("Not implemented")
  }
}

class Ray {

  __call__ = (args: any[] = [], kwargs: Dictionary): any => {
    // console.log('a', Ray.__new__().terminal)
    // return this.proxy.terminal

    // /** ray() is called. */
    // if (args.length === 0) return this.proxy.terminal
    // /** ray(a, b, ...) is called. */
    // if (args.length !== 1) { throw new Error() }
    //
    // /** ray(a) is called. */
    // if (is_function(args[0])) {
    //   const fn = args[0]
    //
    //   if (fn.length === 0) {
    //     return fn()
    //   } else if (fn.length === 1) {
    //     // Ray.something = (self: Self) => {}
    //     // return arg(this);
    //     console.log(fn(fn))
    //     throw new Error()
    //   } else {
    //     throw new Error()
    //   }
    // }
    // const __call__ = this.__new__(args)
    // __call__.initial = this.proxy.self;
    // __call__.self = this.proxy.terminal;
    // __call__.terminal =

    throw new Error('No __call__')
  }


  protected __INCLUDED_CONTEXT__: boolean = false;
  __enter__ = () => { this.__INCLUDED_CONTEXT__ = true }
  __exit__ = () => { this.__INCLUDED_CONTEXT__ = false }
  with = (fn: Function) => {
    this.__enter__()
    fn()
    this.__exit__()
  }

  __assign__ = (args: any[] = [], kwargs: Dictionary = {}) => {
    let {
      __GLOBAL_CONTEXT__ = undefined,
      __DEBUG__ = true,
      ...dictionary
    } = kwargs;

    if (__DEBUG__) {
      const __debug__ = (name: string, method: Function) => {
        return (...args: any) => {
          console.log(name, args)
          return method(...args)
        };
      }
      // __ray__.__static_methods__.forEach(name => {
      //   // @ts-ignore
      //   __ray__.__class__[name] = __debug__(name, __ray__.__method__(name));
      // });
      this.__class_methods__.forEach(name => {
        // @ts-ignore
        if (is_function(this[name]))
          // @ts-ignore
          this[name] = __debug__(name, this.__method__(name));
      })
    }

    // Set all the methods defined on `Ray` through `__set__`. As if we used `Ray.something = something`
    this.__methods__
      .filter(name => !name.startsWith('__'))
      .forEach(method => {
        const is_static = this.__static_methods__.includes(method)
        // Pass all methods through __set__, turning all functions into a Ray.
        this.__set__(method, this.__method__(method))
      });



    // Instantiate reversible.
    // const ray = this.proxy;
    // ray.initial.reverse = ray.terminal
    // ray.none.reverse = ray.some

    //   TODO: Reversible, or two functions cancel each other.
    //   TODO: Reversible Iterator: Memoized .next (- reversible through memory)

    // TODO: Instantiate .args at .self
  }

  static __new__ = (args: any[] = [], kwargs: Dictionary = {}): any => {
    let {
      __GLOBAL_CONTEXT__ = undefined, __object__ = undefined,
      initial = Ray.none, self = Ray.none, terminal = Ray.none
    } = kwargs;

    // Map different __object__ values.

    __object__ = as_ray()

    // If we've already got a Ray, just return that.
    if (__object__ instanceof Ray || __object__.prototype === Ray.prototype)
      return __object__

    const __ray__ = new Ray({ __GLOBAL_CONTEXT__ });
    __ray__.__assign__(args, kwargs)

    return __ray__.proxy;
  }

  equivalent = (self = this.proxy, b = Ray.none) => {
    // TODO: Should return 'this.proxy'
    return (new self({ initial: self.self, self, terminal: b.self })).self
  }

  // traverse = self.as_extreme

  // /** Define `Ray.function` first, then immediately, it gets called with itself - to define itself in terms of a Ray. */


   // static constructor = (ray: JS.Constructor) => Ray.none

}

Ray.__NONE__.__assign__()
export default Ray.__NONE__.proxy;

// This {1 -> self/self.self , & 2 -> a, b} could be generalized (is_none, is_orbit, ..)
// Ray.is_none = (self: Self) => self.is_orbit(self.self)
// Ray.is_orbit = (self: Self, other: Self) => self === other
// // TODO: These likely change or merge, generalize ; perspective switch. ;
// //   They are "is_" -> Does there exist a connection between their `.self`'s ; or basically is there an orbit (so bi-directional), and one-way would be?
// //   composed: a.traverse().is_orbit(b.traverse()) // Basically: does there exist a single connection between the two?
// //   equivalent: a.self().traverse().is_orbit(b.self().traverse())
// // #    - in the case of 'is_equivalence' we directly have access to their difference but are explicitly ignoring them - in the context in which this functionality is called.
// // #    - in the case of 'is_orbit', we might need to do more complicated things to acknowledge their differences - we don't have direct access to them.

// // TODO: .is_equivalent & is_orbit are 0, 1, n perspective?


// // TODO { self }, for .reference.as_initial, if it's just .as_initial, we need to break it apart
// /* */ Ray.as_initial = (self: Ray) => Ray.initial({ self })
// /* */ Ray.as_vertex = (self: Ray) => Ray.vertex({ self })
// /* */ Ray.as_terminal = (self: Ray) => Ray.terminal({ self })
// /* */ Ray.as_reference = (self: Ray) => Ray.reference({ self })

// Ray.all = TODO: .all is a move to .initial (as a reference).
// Ray.cast = <T>(self: Ray): T => { throw new NotImplementedError() }
