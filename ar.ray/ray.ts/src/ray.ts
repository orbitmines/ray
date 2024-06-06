import JS from "./JS";

export class NotImplementedError extends Error {}

type Any = {
    /** Ray is a constructor */
    new (...other: JS.Recursive<Any>): Any,
  }
  /** JavaScript runtime conversions. */
  & Symbol
  & any

const __ray__ = () => {
  class Ray extends JS.Class.Instance<Any> {

    properties: { [key: string | symbol]: Ray } = {}

    constructor(proxy: ProxyHandler<Ray>) {
      super(proxy);
    }

    static none = () => new Ray(PROXY_HANDLER).proxy

  }

  const PROXY_HANDLER: ProxyHandler<Ray> = JS.Class.Handler<Any>({
    /** ray.property */ get: (self: Ray, property: string | symbol): any => {
      if (String(property) === 'prototype') return Ray.prototype
      if (String(property) === 'none') return Ray.none

      if (property in self.properties) return self.properties[property]

      self.proxy[property] = Ray.none()
      return self.properties[property]
    },
    /** ray.property = something; */ set: (self: Ray, property: string | symbol, value: any): boolean => {
      // TODO .o func: Generalization of set, accepts also an object { [key: string | symbol]: any }, sets each property to that object
      // .initial.o( etc..., chain arbitrary funcs like this

      self.properties[property] = value
      return true
    },

    /** ray() is called. */ apply: (self: Ray, args: any[]): any => {
      // TODO: Determine traversal if nothing in .terminal could go at .self.
      return self.proxy.terminal
    },
    /** new ray() */ construct: (self: Ray, args: any[]): Ray => {
      // TODO: Should be copy
      return Ray.none();
    },

    /** property in ray; */ has: (self: Ray, property: string | symbol): boolean => {
      return property in self.properties
    },
    /** delete ray.property; */ deleteProperty: (self: Ray, property: string | symbol): boolean => {
      throw new NotImplementedError();
    },

  });

  return Ray.none();
}

const Ray = __ray__()

Ray.initial = Ray.none; Ray.self = Ray.none; Ray.terminal = Ray.none

// This {1 -> self/self.self , & 2 -> a, b} could be generalized
Ray.is_none = (self: Any) => self.is_orbit(self.self)
Ray.is_orbit = (self: Any, other: Any) => self === other

Ray.is_initial = (self: Any) => self.initial.is_none
/* */ Ray.as_initial = (self: Any) => Ray.initial({ self })
Ray.is_terminal = (self: Any) => self.terminal.is_none
/* */ Ray.as_terminal = (self: Any) => Ray.terminal({ self })
Ray.is_vertex = (self: Any) => self.is_initial.nor(self.is_terminal)
/* */ Ray.as_vertex = (self: Any) => Ray.vertex({ self })
Ray.is_reference = (self: Any) => self.is_initial.and(self.is_terminal)
/* */ Ray.as_reference = (self: Any) => Ray.reference({ self })
Ray.is_boundary = (self: Any) => self.is_initial.xor(self.is_terminal)
Ray.is_extreme = (self: Any) => self.self.is_none.and(self.is_boundary)
Ray.is_wall = (self: Any) => self.self.is_none.and(self.initial.is_some).and(self.terminal.is_some)
Ray.reverse = (self: Any) => new self({ initial: self.terminal, self, terminal: self.initial })

// Ray.initial.reverse = Ray.terminal
// Ray.none.reverse = Ray.some

export default Ray