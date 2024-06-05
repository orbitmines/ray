import _ from 'lodash';

/**
 * NOTE:
 * - Not to be considered as a perfect mapping of JavaScript functionality - merely a practical one.
 * - Important to remember that this is just one particular mapping, there are probably 'many, ..., infinitely' others.
 */
namespace JS {
  // export type ParameterlessFunction<T = any> = () => T;
  // export type ParameterlessConstructor<T> = new () => T;
  // export type Constructor<T> = new (...args: any[]) => T;
  // export type FunctionImpl<T> = (ref: T) => T;
  export type Recursive<T> = (T | Recursive<T | T[]>)[];

  /**
   * Slightly more beautiful abstraction on top of JavaScript's proxy.
   */
  export namespace Class {
    export type Handler<T extends Instance<T>> = {
      apply?(self: T, args: any[]): any;
      construct?(self: T, args: any[]): object;
      // defineProperty?(self: T, property: string | symbol, attributes: PropertyDescriptor): boolean;
      deleteProperty?(self: T, property: string | symbol): boolean;
      get?(self: T, property: string | symbol): any;
      // getOwnPropertyDescriptor?(self: T, property: string | symbol): PropertyDescriptor | undefined;
      // getPrototypeOf?(self: T): object | null;
      has?(self: T, property: string | symbol): boolean;
      // isExtensible?(self: T): boolean;
      // ownKeys?(self: T): ArrayLike<string | symbol>;
      // preventExtensions?(self: T): boolean;
      set?(self: T, property: string | symbol, value: any): boolean;
      // setPrototypeOf?(self: T, v: object | null): boolean;
    }

    export const Handler = <T extends Instance<T>>(handler: JS.Class.Handler<T>): ProxyHandler<T> => ({
      get: (___proxy_function: any, property: string | symbol, self: T): any =>
        handler.get(___proxy_function.___instance, property),
      apply: (___proxy_function: any, thisArg: T, argArray: any[]): any =>
        handler.apply(___proxy_function.___instance, argArray), /** thisArg can be undefined. TODO: What's the use-case of us actually using it? */
      set: (___proxy_function: any, property: string | symbol, newValue: any, self: T): boolean =>
        handler.set(___proxy_function.___instance, property, newValue),
      deleteProperty: (___proxy_function: any, property: string | symbol): boolean =>
        handler.deleteProperty(___proxy_function.___instance, property),
      has(___proxy_function: any, property: string | symbol): boolean
      { return handler.has(___proxy_function.___instance, property); },
      construct(___proxy_function: any, argArray: any[], self: Function): object
      { return handler.construct(___proxy_function.___instance, argArray); },
    })

    export abstract class Instance<T extends object> {

      protected readonly _proxy: T;

      get proxy(): T { return this._proxy; }

      protected constructor(proxy: ProxyHandler<T>) {
        /**
         * Need a function here to tell the JavaScript runtime we can use it as a function & constructor.
         * Doesn't really matter, since we're just catching everything in the proxy anyway.
         */
        function ___proxy_function() { }
        ___proxy_function.___instance = this;

        this._proxy = new Proxy<T>(___proxy_function as any, proxy);
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