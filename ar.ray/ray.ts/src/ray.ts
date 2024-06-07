import JS, {__ray__, Self} from "./JS";


// is_none = () => Object.keys(this.properties).length === 0

    // static __none__ = () => new Ray().proxy


const Ray = __ray__()
Ray.initial = Ray.none; Ray.self = Ray.none; Ray.terminal = Ray.none;



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

/**
 * JavaScript conversions
 */
// Ray.undefined = Ray.none
// Ray.null = Ray.none
// Ray.boolean = (ray: boolean) => Ray.none
// Ray.object = (ray: object) => Ray.none
// Ray.iterable = <T>(ray: Iterable<T>) => Ray.none
// // Ray.iterator = <T>(ray: Iterator<T>) => Ray.none
// // Ray.async_iterable = <T>(ray: AsyncIterable<T>) => Ray.none
// // Ray.async_iterator = <T>(ray: AsyncIterator<T>) => Ray.none
// // Ray.number = (ray: number) => Ray.none
// Ray.function = (ray: JS.Function) => Ray.none
// Ray.constructor = (ray: JS.Constructor) => Ray.none
// Ray.any = (ray: Self) => {
//    if (ray === undefined) return Ray.undefined;
//    if (ray === null) return Ray.null;
//    if (JS.is_boolean(ray)) return Ray.boolean(ray);
//    // if (JS.is_number(ray)) return Ray.number(ray);
//    if (JS.is_iterable(ray)) return Ray.iterable(ray);
//    if (JS.is_function(ray)) return Ray.function(ray);
//    if (JS.is_object(ray)) return Ray.object(ray);
//
//    throw new JS.NotImplementedError('???')
// }
// Ray.all = TODO: .all is a move to .initial (as a reference).
// Ray.cast = <T>(self: Ray): T => { throw new NotImplementedError() }

export default Ray