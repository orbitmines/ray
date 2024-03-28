deferred to js

```ts

  export type Any =
    {
      /** Ray is a constructor - TODO: Copy? */
      new (...other: JS.Recursive<Ray.Any>): Ray.Any,
    }
    /** JavaScript runtime conversions. */
      & Symbol

    & Pick<Ray.Instance, '___instance' | 'on' | 'debug'>

    /** Preconfigured functions defined for Rays. */
    & {
      -readonly [TKey in keyof typeof Ray.Function.All]: typeof Ray.Function.All[TKey] extends Ray.Any
        ? Ray.Any
        : never;
    }

    /** Storage/Movement operations which need to be implemented. */
    & { [TKey in keyof Ray.Op.Impl<Ray.Any>]: Ray.Any }

    /**
   * Move to a JavaScript object, which will handle any complexity of existing JavaScript objects, and allows one to abstract any values contained in the {vertex} to the usual JavaScript interface. - More usual to how one thinks about functions, ..., properties.
   */
  get any(): { [key: string | symbol]: Ray.Any } & any { return this.self.proxy(); }
  get ___any(): { [key: string | symbol]: Ray.Any } & any { return this.proxy(); }
  
  /**
 * Used for chaining JavaScript-provided properties
 *
 * TODO: DOESNT FOLLOW .ANY PATTERN?
 */
o = (object: { [key: string | symbol]: any }): Ray.Any => {
  _.keys(object).forEach(key => this.proxy()[key] = object[key]); // TODO: Can be prettier, TODO: map to Ray equivalents and add to vertices..
  return this;
}

// All these are dirty
o2 = ({ initial, vertex, terminal }: any): Ray.Any => {
  if (initial) this.initial.o(initial);
  if (vertex) this.o(vertex);
  if (terminal) this.terminal.o(terminal);

  return this;
}
  
as_string = (): string => this.as_array().map(ref => ref.any.js).join(','); // TODO: PROPER

as_number = this.as_int;

```