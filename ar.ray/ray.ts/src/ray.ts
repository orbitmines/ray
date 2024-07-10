import _ from "lodash";

export type Function<T = any> = (...args: any[]) => T;
export type Dictionary<T = any> = { [key: string | symbol]: T }

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

class Ray {

  /**
   * Context Handling
   * Consistency/coherence assumptions of surrounding context.
   * - TODO: Can be better. enter/exit functionality (dynamic) etc..=
   */
    protected __GLOBAL_CONTEXT__?: Ray = undefined
    protected readonly __properties__: Dictionary<Ray> = {}
    get properties(): any { return {...(this.__GLOBAL_CONTEXT__?.properties ?? {}), ...this.__properties__ }}

  /** JavaScript Proxy */
    private constructor({ __GLOBAL_CONTEXT__ = undefined }: { __GLOBAL_CONTEXT__?: any } = {}) {
      this.__GLOBAL_CONTEXT__ = __GLOBAL_CONTEXT__

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
        construct: (__proxy_function__: any, argArray: any[], self: Function): object => __proxy_function__.__instance__.__class__.__new__(
          { __GLOBAL_CONTEXT__: __proxy_function__.__instance__, __object__: argArray }
        ),
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

    protected readonly __proxy__: any;
    get proxy() { return this.__proxy__ }

    __has__ = (property: string | symbol): boolean => property in this.properties
    __delete__ = (property: string | symbol): boolean => delete this.properties[property]
    __set__ = (property: string | symbol, value: any): boolean => {
      // this.__properties__[property] = new Property(value)
      return true
    }
    __get__ = (property: string | symbol): any => {
      if (String(property) === 'prototype') return Ray.prototype
      if (property in this.proxy) return this.properties[property]

      // this.__set__(property, this.__class__.none)
      return this.__get__(property)
    }

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
}


const __ray__ = new Ray()

export default __ray__;