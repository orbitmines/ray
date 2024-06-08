import _ from "lodash";

export type Fn<T = any> = (...args: any[]) => T;
export type Constructor<T = any> = new (...args: any[]) => T;
export type Recursive<T> = (T | Recursive<T | T[]>)[];

// TODO Copy from lodash - remove as a dependency.
export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
export const is_number = (_object: any): _object is number => _.isNumber(_object);
export const is_object = (_object: any): _object is object => _.isObject(_object);
export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
export const is_array = <T = any>(_object: any): _object is T[] => _.isArray(_object);
export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check
export const is_error = (_object: any): _object is Error => _.isError(_object);
export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object);

/**
 *
 *
 */
export const __ray__ = (
  // Consistency/coherence assumptions of surrounding context. - TODO: Can be better. enter/exit functionality (dynamic) etc..
  GLOBAL_CONTEXT: any = undefined
) => {
  class Ray {

    protected __object__: any;

    protected readonly __proxy__: any;
    get proxy() { return this.__proxy__ }


    protected readonly __properties__: { [key: string | symbol]: Ray } = {}
    get properties(): any { return {...(GLOBAL_CONTEXT?.properties ?? {}), ...this.__properties__ }}
    // get properties(): any { return {...this.__properties__} }

    constructor() {
      // Need a function here to tell the JavaScript runtime we can use it as a function & constructor. Doesn't really matter, since we're just catching everything in the proxy anyway.
      function __proxy_function__() { throw new Error("Should never be called") }
      __proxy_function__.__instance__ = this;

      // Wrap the confusing JavaScript proxy into a more useful one.
      this.__proxy__ = new Proxy<Ray>(__proxy_function__ as any, {
        get: (__proxy_function__: any, property: string | symbol, self: Ray): any => __proxy_function__.__instance__.__get__(property),
        apply: (__proxy_function__: any, thisArg: Ray, argArray: any[]): any => __proxy_function__.__instance__.__call__(argArray),
        set: (__proxy_function__: any, property: string | symbol, newValue: any, self: Ray): boolean => __proxy_function__.__instance__.__set__(property, newValue),
        deleteProperty: (__proxy_function__: any, property: string | symbol): boolean => __proxy_function__.__instance__.__delete__(property),
        has: (__proxy_function__: any, property: string | symbol): boolean => __proxy_function__.__instance__.__has__(property),
        construct: (__proxy_function__: any, argArray: any[], self: Function): object => Ray.__new__(argArray),
        // TODO
        // defineProperty?(self: T, property: string | symbol, attributes: PropertyDescriptor): boolean;
        // getOwnPropertyDescriptor?(self: T, property: string | symbol): PropertyDescriptor | undefined;
        // getPrototypeOf?(self: T): object | null;
        // isExtensible?(self: T): boolean;
        // ownKeys?(self: T): ArrayLike<string | symbol>;
        // preventExtensions?(self: T): boolean;
        // setPrototypeOf?(self: T, v: object | null): boolean;
      });
    }

    __enter__ = () => { throw new Error() }
    __exit__ = () => { throw new Error() }

    static __new__ = (args: any[] = []): any => {
      const ray = __ray__(GLOBAL_CONTEXT ?? this);
      ray.__object__ = args;

      // TODO: Instantiate .args at .self

      return ray.proxy;
    }

    __has__ = (property: string | symbol): boolean => property in this.properties
    __delete__ = (property: string | symbol): boolean => delete this.properties[property]
    __set__ = (property: string | symbol, value: any): boolean => {
      this.__properties__[property] = Ray.any(value)
      return true
    }
    __get__ = (property: string | symbol): any => {
      if (String(property) === 'prototype') return Ray.prototype
      if (property in this.proxy) return this.properties[property]

      this.__set__(property, this.properties.none)
      return this.__get__(property)
    }

    // instance.self = self.proxy.any(args)
    __call__ = (args: any[] = []): any => {
      // /** ray() is called. */
      // if (args.length === 0) { return this.proxy.terminal }
      // /** ray(a, b, ...) is called. */
      // if (args.length !== 1) { throw new Error() }
      //
      // /** ray(a) is called. */
      // const arg = args[0]
      //
      // if (is_function(arg)) {
      //   if (arg.length === 0) {
      //     return arg()
      //   } else if (arg.length === 1) {
      //     // Ray.something = (self: Self) => {}
      //     // return arg(this);
      //     console.log(arg(arg))
      //     throw new Error()
      //   } else {
      //     throw new Error()
      //   }
      // }
      // const __call__ = this.__new__(args)
      // __call__.initial = this.proxy.self;
      // __call__.self = this.proxy.terminal;
      // __call__.terminal =

      throw new Error()
    }

    // TODO: Copy from lodash - remove as a dependency.
    static any = (ray: any): any => {
      if (ray === undefined) return Ray.undefined;
      if (ray === null) return Ray.null;
      if (ray instanceof Ray || ray.prototype === Ray.prototype) return ray;
      // if (is_function(ray)) return Ray.function(ray)
      // if (_.isBoolean(ray)) return Ray.boolean(ray);
      //
      //     // if (JS.is_number(ray)) return Ray.number(ray);
      //     if (JS.is_iterable(ray)) return Ray.iterable(ray);
      //     if (JS.is_function(ray)) return Ray.function(ray);
      //     if (JS.is_object(ray)) return Ray.object(ray);
      //

      console.log('Unsupported type', ray)
      return Ray.none;
    }

    is_none = (self = this.proxy) => self.self === undefined

    static none = new Ray()
    static initial = Ray.none; static self = Ray.none; static terminal = Ray.none;

    static undefined = Ray.none; static null = Ray.none;

     // /** Define `Ray.function` first, then immediately, it gets called with itself - to define itself in terms of a Ray. */
    // static function = (fn: Fn) => {
    //   if (!is_function(fn)) return Ray.none
    //
    //   const ray = Ray.__new__();
    //   ray.terminal = () => {
    //     // const input = ray.terminal.terminal;
    //     // const output = fn(input)
    //     // input.terminal = output;
    //     // return output;
    //     throw new Error()
    //   };
    //   return ray
    // }

    // static boolean = (ray: boolean) => Ray.none; static true = Ray.none; static false = Ray.none;
    // Ray.object = (ray: object) => Ray.none
    // Ray.iterable = <T>(ray: Iterable<T>) => Ray.none
    // // Ray.iterator = <T>(ray: Iterator<T>) => Ray.none
    // // Ray.async_iterable = <T>(ray: AsyncIterable<T>) => Ray.none
    // // Ray.async_iterator = <T>(ray: AsyncIterator<T>) => Ray.none
    // // Ray.number = (ray: number) => Ray.none
    // Ray.constructor = (ray: JS.Constructor) => Ray.none
  }

  const ray = new Ray();

  // Set all the methods defined on `Ray` through `__set__`. As if we used `Ray.something = something`

  [...Object.keys(Ray), ...Object.keys(ray)]
    .filter(name => !name.startsWith('__'))
    .forEach(name => {
      // @ts-ignore
      ray.__set__(name, Ray[name] ?? ray[name])
    });

  return ray;
}



// This {1 -> self/self.self , & 2 -> a, b} could be generalized (is_none, is_orbit, ..)
// Ray.is_none = (self: Self) => self.is_orbit(self.self)
// Ray.is_orbit = (self: Self, other: Self) => self === other
// // TODO: These likely change or merge, generalize ; perspective switch. ;
// //   They are "is_" -> Does there exist a connection between their `.self`'s ; or basically is there an orbit (so bi-directional), and one-way would be?
// //   composed: a.traverse().is_orbit(b.traverse()) // Basically: does there exist a single connection between the two?
// //   equivalent: a.self().traverse().is_orbit(b.self().traverse())
// // #    - in the case of 'is_equivalence' we directly have access to their difference but are explicitly ignoring them - in the context in which this functionality is called.
// // #    - in the case of 'is_orbit', we might need to do more complicated things to acknowledge their differences - we don't have direct access to them.
// // one could be aware, not the other. Or if we can find a single connection, or what if we want to explore more?
// Ray.compose = (a: Self, b: Self) => a.terminal.equivalent(b.initial)
// // TODO: .is_equivalent & is_orbit are 0, 1, n perspective?
// Ray.equivalent = (a: Self, b: Self) => a.self.compose(b.self)
//
//

// Ray.is_initial = (self: Self) => self.initial.is_none
// Ray.is_terminal = (self: Self) => self.terminal.is_none

// Ray.is_vertex = (self: Self) => self.is_initial.nor(self.is_terminal)
// Ray.is_reference = (self: Self) => self.is_initial.and(self.is_terminal)
// Ray.is_boundary = (self: Self) => self.is_initial.xor(self.is_terminal)

// Ray.is_extreme = (self: Ray) => self.self.is_none.and(self.is_boundary)
// Ray.is_wall = (self: Ray) => self.self.is_none.and(self.initial.is_some).and(self.terminal.is_some)
// Ray.reverse = (self: Ray) => new self({ initial: self.terminal, self, terminal: self.initial })
//   TODO: Reversible, or two functions cancel each other.
//   TODO: Reversible Iterator: Memoized .next (- reversible through memory)

// // TODO { self }, for .reference.as_initial, if it's just .as_initial, we need to break it apart
// /* */ Ray.as_initial = (self: Ray) => Ray.initial({ self })
// /* */ Ray.as_vertex = (self: Ray) => Ray.vertex({ self })
// /* */ Ray.as_terminal = (self: Ray) => Ray.terminal({ self })
// /* */ Ray.as_reference = (self: Ray) => Ray.reference({ self })

// Ray.initial.reverse = Ray.terminal
// Ray.none.reverse = Ray.some

// Ray.all = TODO: .all is a move to .initial (as a reference).
// Ray.cast = <T>(self: Ray): T => { throw new NotImplementedError() }
