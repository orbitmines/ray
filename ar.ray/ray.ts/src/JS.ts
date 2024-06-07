import _ from 'lodash';


/**
 * Can't overload things like '-=', unless we use a number as an intermediate step. Could do that as a label to get that functionality in? Or just ignore it.
 */
export type Self = {
    new(...other: JS.Recursive<Self>): Self,
  }
  /** JavaScript runtime conversions. */
  & Symbol
  & any

export const __ray__ = (): Self => {
  class Ray extends JS.Class.Instance<Ray> {
    __new__ = (args: any[] = []): Ray => {
      console.log('__new__', args)
      return new Ray().proxy;
    } // TODO Copy __properties__ and wrap each in a new function
    // instance.self = self.proxy.any(args)
    __call__ = (args: any[] = []): Ray => {
      // throw new JS.NotImplementedError()
      return this
    }
  }

  return new Ray().proxy;
}

/**
 * NOTE:
 * - Not to be considered as a perfect mapping of JavaScript functionality - merely a practical one.
 * - Important to remember that this is just one particular mapping, there are probably 'many, ..., infinitely' others.
 */
namespace JS {
  export class NotImplementedError extends Error {
  }

  // export type ParameterlessFunction<T = any> = () => T;
  // export type ParameterlessConstructor<T> = new () => T;
  // export type Constructor<T> = new (...args: any[]) => T;
  // export type FunctionImpl<T> = (ref: T) => T;
  export type Function<T = any> = (...args: any[]) => T;
  export type Constructor<T = any> = new (...args: any[]) => T;
  export type Recursive<T> = (T | Recursive<T | T[]>)[];

  /**
   * Slightly more beautiful abstraction on top of JavaScript's proxy.
   */
  export namespace Class {

    export const Handler = <T extends Instance<T>>(): ProxyHandler<T> => ({
      get: (__proxy_function__: any, property: string | symbol, self: T): any =>
        __proxy_function__.__instance__.__get__(property),
      apply: (__proxy_function__: any, thisArg: T, argArray: any[]): any =>
        __proxy_function__.__instance__.__call__(argArray),
      /** thisArg can be undefined. TODO: What's the use-case of us actually using it? */
      set: (__proxy_function__: any, property: string | symbol, newValue: any, self: T): boolean =>
        __proxy_function__.__instance__.__set__(property, newValue),
      deleteProperty: (__proxy_function__: any, property: string | symbol): boolean =>
        __proxy_function__.__instance__.__delete__(property),
      has(__proxy_function__: any, property: string | symbol): boolean {
        return __proxy_function__.__instance__.__has__(property)
      },
      construct(__proxy_function__: any, argArray: any[], self: Function): object {
        return __proxy_function__.__instance__.__new__(argArray)
      },
    })

    export abstract class Instance<T extends Instance<T>> {

      // defineProperty?(self: T, property: string | symbol, attributes: PropertyDescriptor): boolean;
      // getOwnPropertyDescriptor?(self: T, property: string | symbol): PropertyDescriptor | undefined;
      // getPrototypeOf?(self: T): object | null;
      // isExtensible?(self: T): boolean;
      // ownKeys?(self: T): ArrayLike<string | symbol>;
      // preventExtensions?(self: T): boolean;
      // setPrototypeOf?(self: T, v: object | null): boolean;

      private readonly __proxy__: T;
      private readonly __properties__: { [key: string | symbol]: T } = {}

      get proxy(): T {
        return this.__proxy__;
      }

      constructor() {
        /**
         * Need a function here to tell the JavaScript runtime we can use it as a function & constructor.
         * Doesn't really matter, since we're just catching everything in the proxy anyway.
         */
        function __proxy_function__() {
        }

        __proxy_function__.__instance__ = this;

        this.__proxy__ = new Proxy<T>(__proxy_function__ as any, Handler());
      }

      /** new ray() */ abstract __new__(args?: any[]): T;

      /** ray() is called. */ abstract __call__(args?: any[]): T;

      /** ray.property */ __get__ = (property: string | symbol): any => {
        if (String(property) === 'prototype') return Instance.prototype

        if (property in this.__properties__) return this.__properties__[property]

        // this.__properties__[property] = this.__new__
        return this.__properties__[property]
      }
      /** ray.property = something; */ __set__ = (property: string | symbol, value: any): boolean => {
        if (value instanceof Instance) {
          value = value.__new__().proxy
        } else if (value.prototype === Instance.prototype) {
          value = new value()
        }
        //   value = self.proxy.any(value) // TODO: This is not pretty through something else?

        this.__properties__[property] = value
        return true
      }

      /** property in ray; */ __has__ = (property: string | symbol): boolean => {
        return property in this.__properties__
      }
      /** delete ray.property; */ __delete__ = (property: string | symbol): boolean => {
        return delete this.__properties__[property]
      }
    }
  }

  /**
   * JavaScript runtime type checks
   *
   * TODO: Copy from lodash - remove as a dependency.
   */
  export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
  export const is_number = (_object: any): _object is number => _.isNumber(_object);
  export const is_object = (_object: any): _object is object => _.isObject(_object);
  export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
  export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
  export const is_array = <T = any>(_object: any): _object is T[] => _.isArray(_object);
  export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check

  export const is_error = (_object: any): _object is Error => _.isError(_object);
  export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object);
}

export default JS