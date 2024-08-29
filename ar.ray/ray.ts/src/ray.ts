import _ from "lodash";

export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object); 

// TODO: Many, Between, Branching
export const one_or_many = <T>(...__self__: T[]): T => new Proxy(class {}, {
  get: (__: any, property: string | symbol, proxy: any): any => {
    const values = __self__.map(self => (self as any)[property]);

    if (!values.every(is_function))
      return values;

    return (...args: any[]) => {
      return __self__.map(self => (self as any)[property](...args))
    }
  }
})

class Graph {
  
}

class Ray implements Iterable<Ray> {

  initial: any
  terminal: any
  
  __self__: any[]

  constructor(...args: any[]) {
    this.__self__ = args;
  }

  __call__ = (...args: any[]): any => {

  }
  __get__ = (property: string | symbol): any => {
    if (property === 'prototype') return Ray.prototype;
    if ((this as any)[property]) return (this as any)[property];
  }
  __set__ = (property: string | symbol, value: any): boolean => {
    (this as any)[property] = value;
    return true;
  }
  __delete__ = (property: string | symbol): boolean => {
    return delete (this as any)[property]
  }

  is_none = (): boolean => this.self.self === this.self;
  is_some = (): boolean => !this.is_none()
  is_initial = (): boolean => this.initial.is_none()
  is_terminal = (): boolean => this.terminal.is_none()

  copy = (...args: any[]): any => {
    const copy = new Ray(...args);
    return copy.self;
  }

  // reverse = (): any => new this.self().set({ initial: this.terminal, terminal: this.initial })

  equivalent = (b: Ray) => {}

  compose = (b: Ray) => {

  }

  get last(): Ray { return this.self }
  get first(): Ray { return this.self }

  *[Symbol.iterator](): Iterator<any> {
    yield this.self;
  }

  map = <U>(callbackfn: (value: any, index: number, array: any[]) => U): U[] => {
    return [...this].map(callbackfn)
  }

  orbit = () => this.last.compose(this.first)

  push_back = (b: Ray) => this.last.compose(b);
  push_front = (b: Ray) => b.compose(this.first);

  get self(): any {
    return new Proxy(Ray, {
      get: (target: any, p: string | symbol, receiver: any): any => this.__get__(p),
      set: (target: any, p: string | symbol, newValue: any, receiver: any): boolean => this.__set__(p, newValue),
      deleteProperty: (target: any, p: string | symbol): boolean => this.__delete__(p),
      construct: (target: any, argArray: any[], newTarget: Function): object => this.copy(...argArray),
      apply: (target: any, thisArg: any, argArray: any[]): any => this.__call__(...argArray),
    });
  }

  get all() { 
    return new Proxy(this.self, {
      get: (self: Ray, property: string | symbol, proxy: any) => {
        return this.map(element => element[property]);
      },
      set: (self: Ray, property: string | symbol, newValue: any, proxy: any): boolean => {
        for (const element of self) { 
          element[property] = is_function(newValue) ? newValue(element[property]) : newValue; 
        }
        return true;
      },
      deleteProperty: (self: Ray, property: string | symbol): boolean => {
        for (const element of self) { delete element[property]; }
        return true;
      }
    }) 
  }

  set = (object: { [key: string | symbol]: any }): Ray => {
    _.keys(object).forEach(key => this.self[key] = object[key]);
    return this;
  }

}

export default new Ray().self;
