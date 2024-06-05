import JS from "./JS";

export class NotImplementedError extends Error {}

export type Ray = {
    /** Ray is a constructor - TODO: Copy? */
    new (...other: JS.Recursive<Ray>): Ray,
  }
  /** JavaScript runtime conversions. */
  & Symbol
  & any

//   /** Preconfigured functions defined for Rays. */
//     & {
//   -readonly [TKey in keyof typeof Ray.Function.All]: typeof Ray.Function.All[TKey] extends Ray.Any
//       ? Ray.Any
//       : never;
// }

// /** Storage/Movement operations which need to be implemented. */
// & { [TKey in keyof Ray.Op.Impl<Ray.Any>]: Ray.Any }


const __ray__ = (): Ray => {
  class Ray extends JS.Class.Instance<Ray> {
    constructor(proxy: ProxyHandler<Ray>) {
      super(proxy);
    }

    static initial = () => throw new NotImplementedError()
    static self = () => throw new NotImplementedError()
    static terminal = () => throw new NotImplementedError()

    static none = () => throw new NotImplementedError()
  }

  const PROXY_HANDLER: ProxyHandler<Ray> = JS.Class.Handler<Ray>({
    /** ray.property */ get: (self: Ray, property: string | symbol): any => {
      if (String(property) === 'prototype') { return Ray.prototype }

      /** Use any field on {Ray.Instance}, which we want to delegate to, first. */
      // if (['___instance'].includes(String(property))) { return (self.proxy as any)[property]; }

      /** Otherwise, switch to functions defined on {Ray.Functions}  */
      // const func = Ray.Function.Get(property as any);
      // if (func) { return func.as_method({ self, property }); }

      // if (property === Symbol.toPrimitive)
      //   return (hint: string) => { return 100; }; // TODO: Can be used to setup label generation through javascript objects if we want to ? + allow search on this
      // throw new NotImplementedError(``);

      /** Not implemented. */
      throw new NotImplementedError(`Ray: Called property '${String(property)}' on Ray, which has not been implemented.`);
    },
    /** ray.property = something; */ set: (self: Ray, property: string | symbol, value: any): boolean => {
      throw new NotImplementedError(`Ray: Could not set '${String(property)}'`);
    },

    /** ray() is called. */ apply: (self: Ray, args: any[]): any => {
      throw new NotImplementedError(`Ray: Could not apply .terminal`);
    },
    /** new ray() */ construct: (self: Ray, args: any[]): Ray => {
      const copy = new Ray(PROXY_HANDLER);

      // TODO: Should be copy
      return copy.proxy;
    },

    /** property in ray; */ has: (self: Ray, property: string | symbol): boolean => {
      throw new NotImplementedError(`Ray: Has ${String(property)}`);
    },
    /** delete ray.property; */ deleteProperty: (self: Ray, property: string | symbol): boolean => {
      throw new NotImplementedError();
    },

  });

  return new Ray(PROXY_HANDLER).proxy;
}

export default __ray__()
