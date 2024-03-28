from __future__ import annotations

import inspect
from typing import Iterator, AsyncIterator, Union, Callable, Any, Iterable, AsyncIterable, Tuple


# TODO: Restrictive cases:
# - TODO: Tensor as restrictive case
#
#

# TODO: Better python solution than just @ray everywhere (for typechecker) - gen for typechecker?

# TODO: match, switch, enum (like key=value), dict, keyvalue, pair, ....
# TODO: zip, tensor (are these the same as match/switch?)

# TODO: .any .all as pointer ? (TODO: This is basically close to a .traverse or .traverse & skip the first one. Traverse including the current pointer, excluding the current pointer...)

# TODO: .equivalent vs .is_equivalent ? (Could do: .equivalent. somethimg??) Basically the connection between .equivalent & .is_orbit
# TODO: That's basically the same connection of .next/.has_next/.last, .end/.boundary/.is_boundary/...

# TODO: Runtime with its read/writeonly, basically (non-/)availability of write operations. Where read operations are already also write operations from another perspective, just not the one accessible here.

def ray(func: Callable[[Any, ...], Any]) -> Ray:
    pass

class Ray2:
  def __getattr__(self, name: str) -> Any:
    print(f'__getattr__.{name}')
    pass
  def __setattr__(self, key, value) -> Any:
    print(f'__setattr__{key}={value}')
    pass

#
# "Arbitrarily partial/.../parallel/superposed" TODO? better name
# The concept is never really direct execution, and if it is, that's often more like ignorance. Basically, arbitrary lazyness. Like this we basically rephrase "output" or "halting" as "what if we assume it halts here". Inaccessible, ..., Ignorant ones turn into the inability to ask that question.
# @see "What if this wasn't the case?" https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=%22What%20if%20this%20wasn%27t%20the%20case%3F%22
#
#
# In the case of Rays, whether something is a vertex/initial/terminal is only inferred from surrounding context. And these checks only need to happen locally in order to decide how to traverse arbitrary structure (as in - I only need to check the presence of something next to me, not traverse the whole direction recursively in order to decide what to do).
# Leaves the following questions:
# - TODO: How about treating something like something which the context says it's not? (Could apply this sort of thing in some fidelity/consistency checking mechanism as a way of fuzzing the fidelity mechanism)
#
#
# "Self-referential operators & multiple abstract implementations":
# - Note that whenever you have a self-reference through operators, that requires an implementation to break this self-reference. For example ray functionality only requires initial + negative, or terminal + negative, or initial + terminal, to make all the other three.
#
#
# "Naming, ..., Grouping"
# TODO: This is basically: When to decide that perspective switches should have a different name associated with them, when they can probably be thrown in a bag with other stuff: I.e. Why is it so significantly different it should be separate?
#    - ex: TODO: Do I want to keep the is_equiv/is_composed pattern? Or simplify to one of the two?
#
#   These basically fall under naming/grouping
#     @staticmethod: Implement a function from no (or: an ignorant) perspective.
#     method(self): Implement a function from the perspective of 'this'
class Ray:
  def __init__(self, *args, **kwargs):
      # TODO: Named args in the sense, similar to class definition, in the sense that they equivalences on the existing functions. Again this thing of assign.

      pass

  # TODO: DEBUG/LISTENER/OBSERVER/WRAPPER IS A WRAPPER AROUND EVERY FIELD, callbacks. "Ignorant of how it effects, ..., doesn't effect the function."

  #
  # Basic Ray operators
  #

  # TODO: set = none;
  # TODO: Destroy the current thing, connect .initial & .terminal ? (can do just direct connection, preserves 'could have been something here') - then something like [self.initial, self, self.terminal].pop().
  # TODO: Leave behind --] [-- or connect them basically..
  @staticmethod
  @ray
  def none() -> Ray: return -Ray.some
  alloc = new = create = initialize \
    = none

  @staticmethod
  @ray
  def some() -> Ray: return -Ray.none
  self_reference \
    = some

  @ray
  def free(self): raise NotImplementedError
  destroy = clear = delete = pop = prune \
    = free

  # TODO: Like any method, .initial/.terminal could be seen as a particular section of .self, which .self itself ignores. - This should be generalizable to other things setup on .self.

  # An arbitrary Ray, defining what continuing in the reverse of this direction is equivalent to.
  @ray
  def initial(self) -> Ray: return (-self).terminal
  previous = backward = decompile = predecessor \
    = initial
  # An arbitrary Ray, defining what continuing in this direction is equivalent to.
  @ray
  def terminal(self, *args, **kwargs) -> Ray:
    print(f'{self.name}.__call__ {args} {kwargs}')
    return (
      (-self).initial
      # or (self.initial.is_boundary and self.self.is_boundary) -> Best place for this? Steps to initial=self.self & self=self.self.terminal . But then a nice variant of this generalzied to each step type.
      # TODO: If nothing works, probably like any function, that means .none: "Cannot determine what to do without context of where we are.", the thing that calls .terminal is the thing that needs to make sense of that?, Then it makes sense that a .reference calls into its .self, since it cannot find anything in its direction, it assumes it's at a boundary, and then starts traversing .self ; Needs generalization
    )
  next = __call__ = __next__ = __anext__ = forward = step = apply = run = successor \
    = map = render = compile = realize = generate \
    = terminal
  # TODo: __anext__ in python case might need addition async def setup? - How is that interpreted as operators for awaitable?
  # Todo: slightly different perspectives in cases of map/render etc..., where certain aliases of these are expected not to have alternative behaviors based on binary/ternary calls to this... ; Basically; some of these aliases are probably more appropriate as separate perspectives.
  # TODO: compile/map/cast/ ... probably fit in that separate category. Wrap to any object if translation exists (in python case inspect?). - Realize is probably similarly on another level of abstraction.
  # TODO: FILTER/WHERE/IF/... for instance - branch different effect

  # @see "Reversibility after ignoring some difference": https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=Another%20example%20of%20this%20is%20reversibility
  # @see "More accurately phrased as the assumption of Reversibility: with the potential of being violated.": https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=On%20Assumptions%20%26%20Assumption%20Violation
  @ray
  def reverse(self) -> Ray:
    return Ray(initial=self.terminal, self=self.self, terminal=self.initial)
  neg = __neg__ = __invert__ = opposite = _not = converse = negative = swap \
    = reverse # TODO ; Could also be implemented as copy - hence the __call__ on Ray() - this is the case for any sort of constructor/type.

  # An arbitrary Ray, defining what our current position is equivalent to.
  # Moving to the intersecting Ray at `.self` - as a way of going an abstraction layer (lower), and asking what's inside.
  @ray
  def self(self) -> Ray: raise NotImplementedError
  element = dereference = selected = selection = cursor = auto \
    = self # TODO: = branch?

  # TODO: Like this, ignorant vs non-ignorant? What to do here?
  #   return vertex
  # TODO: These are very close to binary ops / makes sense since some/none is a boolean.
  #       /**
  #        * Placing existing structure on a new Reference, Boundary or Vertex:
  #        */
  #         // TODO: These should allow as_vertex as zero-ary, but that means self = self_reference, not none. ?
  #         /**
  #          * Moving `self` to `.self` on an abstraction layer (higher). As a way of being able to describe `self`.
  #          *
  #          * TODO: the .reference might need two levels of abstraction higher, one to put it at the .self, another to reference that thing? (Depends a bit on the execution layer)
  #          */
  #            // TODO as_reference.as_vertex instead of as_vertex ignorant by default?
  def as_reference(self) -> Ray: return Ray(initial=Ray.none, self=self, terminal=Ray.none)
  def as_vertex(self) -> Ray: return Ray(initial=Ray.some, self=self, terminal=Ray.some)
  def as_initial(self) -> Ray: return (
    (-self).as_terminal() # TODO: These sorts of deductions should be automatic, here as an example
    or Ray(initial=Ray.none, self=self, terminal=Ray.some)
  )
  def as_terminal(self) -> Ray: return (
    (-self).as_initial() # TODO: These sorts of deductions should be automatic, here as an example
    or Ray(initial=Ray.some, self=self, terminal=Ray.none)
  )
  # TODO: Ray.vertex/initial/terminal ? places empty_initial/terminal in the expected style?

  # TODO: These might be slightly different?
  # def empty_initial(self) -> Ray: return Ray(initial=Ray.none, self=Ray.none, terminal=self)
  # def empty_terminal(self) -> Ray: return Ray(initial=self, self=Ray.none, terminal=Ray.none)

  # An arbitrary Ray, defining what continuing in this direction is equivalent to.

  # This is basically what breaks the recursive structure.
  #
  # Tries for "global coherence", practically this just means self-reference, were no change is (inconsistently) assumed...
  #
  # ---
  #
  # Another way of interpreting a possible way of implementing it, is no matter how much more detail we would like to ask, the only thing we ever see is the same structure again (if we ignore the difference of us asking about that additional structure, that's still a possible handle on some difference).
  #
  # As a way of saying/.../assuming: I only 'infinitely' assume it's only this structure, "it seems to halt here". Note that this is necessarily an assumption. No guarantee of this can be made. This is necessarily an equivalence, ..., ignorance.
  #
  # @see https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=Quite%20similarly%20to%20the%20loops%2C%20I%20could%20be%20ignorant%20of%20additional%20structure%20by%20assuming%20it%27s%20not%20there.
  # TODO: is none, ref, init terminal as global equiv check kn the structure? as generalization ; yep, is_orbit.
  #
  # Concretely, we use this as the thing which has power over the equivalence assumption we use to halt programs. - The asymmetry which allows the engine to make a distinction between each object.
  # @see https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=And%20there%20we%20have%20it%2C%20an%20infinity%2C%20loop%2C%20...%2C%20orbit%20if%20we%20ignore%20the%20difference.
  @ray
  # @alias('is_none')
  def is_orbit(a, b: Arbitrary) -> Ray: raise NotImplementedError # a.___instance === b.___instance
  __eq__ \
    = is_orbit
  # TODO: Constant as local orbit.

  # -__eq__ == __ne__
  # @ray
  # def __ne__(a, b: Arbitrary) -> Ray: raise NotImplementedError

  @ray # TODO
  def is_none(self) -> Ray: return self.is_orbit(self, self.self)

  #
  # Predefined functionality
  #

  @ray
  # TODO is_initial = return (-self).terminal().is_none ??
  def is_initial(self) -> Ray: return self.initial().is_none
  @ray
  def is_terminal(self) -> Ray: return self.terminal().is_none                    # [?-|  ]
  @ray
  def is_vertex(self) -> Ray: return self.is_initial().nor(self.is_terminal())    # [--|--]
  @ray
  def is_reference(self) -> Ray: return self.is_initial() & self.is_terminal()    # [  |  ]
  # TODO: reference = pointer ...
  # TODO: Reference maybe as an orbit at the point is the thing ignorant
  #     TODO: This is basically saying "reference as a constant"
  # TODO Could say orbit = constant, meaning this entire direction repeats??? - maybe it's slightly different
  @ray
  def is_boundary(self) -> Ray: return self.is_initial() ^ self.is_terminal()     # [?-|  ] or [  |-?]

  @ray
  def has_next(self) -> Ray: return self.next().is_some
  @ray
  def last(self) -> Ray: raise NotImplementedError # TODO: Other layer of abstraction waiting for .next step function - will hook into anything that finishes, and allows already composing stuff after .last ..
  end = result = back = output = max \
    = last

  # @see "Continuations as Equivalence (can often be done in parallel - not generally)": https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=Constructing%20Continuations%20%2D%20Continuations%20as%20Equivalence
  @ray
  # @alias('merge',
  def compose(a, b: Arbitrary) -> Ray: return a.terminal().equivalent(b.initial())
  continues_with \
    = compose

  # Equivalence as "Composition of Ray."
  #
  # NOTE:
  #  - An equivalence, is only a local equivalence, no global coherence of it can be guaranteed. And it is expensive work to edge towards global coherence.
  #  - Though changes are only applied locally, their effects can be global (Take for instance, the example of adding to one Ray, which changes the perspective of everything connected to that Ray if they were to traverse the connection).
  #
  # @see https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=On%20Equivalences%20%26%20Inconsistencies
  @ray
  def equivalent(a, b: Arbitrary) -> Ray:
    # raise NotImplementedError

    # TODO: This is close but not quite, use the shifting thing I wrote down a few days ago: (And then use something to break the self-reference) - Either on this side. compose, or outside the definitions
    # This one harder to do in parallel?
    return a.self().compose(b.self())

  # "Composing an terminal & initial boundary"
  # - TODO: Note that an orbit is reversibility. ?
  # - TODO: Could represent this abstraction in another layer what we want to accomplish while the actual search is still taking place.
  #
  # - Like with 'copy' and all concepts: Note that we're only after reversibility after ignoring some difference.
  #
  # @see "Reversibility is necessarily inconsistent": https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=Another%20example%20of%20this%20is%20reversibility
  @ray
  #@alias('modular', 'modulus',
  def orbit(a, b: Arbitrary) -> Ray:
    # - TODO: If we're only doing one end: This already assumes they are connected on the other end.
    # - TODO: should be a connection here, with is_composed ; or "reference.is_equivalent" so that you can drop one of the sides, or both.
    b.last().compose(a.first())
    a.first().compose(b.last())

    return a # TODO ?
  circle = repeats = period = infinitely \
    = orbit

  # "Applying the same thing in a different context"
  # TODO: Somewhat related to Functors?
  # TODO: .ref perspecctive: self.as_reference & self.dereference
  @ray
  def from_perspective_of(a, b):
    raise NotImplementedError
  @ray
  def perspective(self) -> Ray: raise NotImplementedError
  # TODO ; is parameters?

  #
  # If there exists an orbit between A & B anywhere on their equivalency functions - or: their .self - (except for the directions through which we're referencing them)
  #
  # Note the connection between 'is_orbit' vs 'is_equivalence'. They're essentially the same thing, but:
  #    - in the case of 'is_equivalence' we directly have access to their difference but are explicitly ignoring them - in the context in which this functionality is called.
  #    - in the case of 'is_orbit', we might need to do more complicated things to acknowledge their differences - we don't have direct access to them.
  #
  # TODO: (so dually connected, what if only one is aware??) Or basically just ; the answer in this particular instance is just if either end can find the other only once. Consistency of it defined on a more abstract level...
  #
  # a.self().traverse().is_orbit(b.self().traverse())
  # @alias('includes', 'contains') ; (slightly different variants?)
  @ray
  def is_equivalent(self) -> Ray: return self.is_composed.from_perspective_of(self.self)

  # TODO: Either is_equiv or is_composed will likely change?.
  # a.traverse().is_orbit(b.traverse()) // Basically: does there exist a single connection between the two?
  @ray
  def is_composed(self) -> Ray: return self.is_orbit.from_perspective_of(self.traverse) # Needs some ref from Ray.Function.Self.

  @staticmethod
  @ray
  def boolean() -> Ray: return Ray.none * 2
  bit \
    = boolean

  # TODO: This should accept Ray: Where 'size' is just a 'shape'
  # @alias('resize', 'size', 'structure', 'length', 'duplicate', 'copy', 'clone', 'times', 'mul', '__mul__') -> Should be generalized as any kind of structure, but with this thing repeated on it. ; use traversal or ...
  #
  # Performing a copy (realizing it) can be conceptualized as traversing the entire structure. (Where the 'entire structure' means the current instantiation of it - with many ignorances attached)
  #
  # - A problem with a copy, is that in or to be generalizable, it needs to alter all references to the thing it's copying to itself - this cannot be done with certainty.
  #    - This copy does not do that. Instead, it is ignorant of other things referencing the thing it's copying.
  # - Additionally, a copy necessarily has some non-redundancy to it:
  #
  # @see "A copy is necessarily inconsistent": https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies#:~:text=If%20I%20have%20one%20thing%20and%20I%20make%20a%20perfect%20copy
  @ray
  def size(self, b: Arbitrary) -> Ray:
     # // or
     #    // (self) => self.self.copy.reference()
     #    (self) => none().self = self.self.copy()
     #
     #      // TODO Relies heavily on the execution layer to copy initial/terminal etc... ; and an is_orbit check before calling copy again. - Then again on the execution layer it can lazily do this copy (by not evaluating (i.e.) traversing everywhere), or it first does this traversing directly.

    pass
  # size = length = no params different behavior
  # resize = structure
  mul = __mul__ = times \
    = size
  # duplicate = copy = clone = size.from_perspective_of

  @ray
  def xor(self) -> Ray: return (
    -self.xnor
  )
  __xor__ \
    = xor
  @ray # TODO: Could be 'is_equivalent' too? or is_orbit
  def xnor(self) -> Ray: return (
    -self.xor
  )
  @ray
  def nand(self) -> Ray: return (
    -self._and
  )
  @ray
  def nor(self): return (
    -self._or
  )
  @ray
  def _and(self) -> Ray: return (
    -self.nand
  )
  __and__ = \
    _and
  @ray
  def _or(self) -> Ray: return (
    -self.nor
  )
  __or__ = \
    _or

  @ray
  def add(self) -> Ray: return (
    -self.sub
  )
  __add__ \
    = add
  @ray
  def sub(self) -> Ray: return (
    -self.add
  )
  __sub__ \
    = sub

  @ray
  def radd(self) -> Ray: return -self.add.perspective
  @ray
  def pow(a, b: Arbitrary) -> Ray: raise NotImplementedError
  __pow__ \
    = pow
  @ray
  def div(a, b: Arbitrary) -> Ray: raise NotImplementedError
  __truediv__ \
    = div
  @ray
  def mod(a, b: Arbitrary) -> Ray: raise NotImplementedError
  __mod__ \
    = mod
  @ray
  def matmul(a, b: Arbitrary) -> Ray: raise NotImplementedError
  __matmul__ \
    = matmul

  @ray
  # @alias(f'push_{last.alias}')
  def push_back(a, b: Arbitrary) -> Ray: return a.last().compose(b)
  # TODO: lshift/rshift respects the .size of the ray. So it's push_back & pop front, or in certain interpretations, we might keep and not pop...
  __lshift__ \
    = push_back

  #
  # Python runtime conversions
  # ; TODO: Could have enumerated possibilities, but just ignore that for now.
  #

  # TODO: similar to next/anext, these might collapse if there's a python awaitable operator...
  def as_iterator(self) -> Iterator[Ray]: return self
  __iter__ \
    = as_iterator
  def as_async_iterator(self) -> AsyncIterator[Ray]: return self
  __aiter__ \
    = as_async_iterator

  def as_iterable(self) -> Iterable[Ray]: return self
  def as_async_iterable(self) -> AsyncIterable[Ray]: return self
  def as_string(self) -> str: raise NotImplementedError
  def as_int(self) -> int: raise NotImplementedError
  def as_list(self) -> list: raise NotImplementedError
  def as_tuple(self) -> tuple: raise NotImplementedError
  @staticmethod
  def as_javascript() -> str: raise NotImplementedError

  @staticmethod
  @ray
  def runtimes() -> Ray: raise NotImplementedError

  # TODO: Any function calls which do not return or are convertable to ray, convert as an operator.
  @staticmethod
  @ray
  def compiler() -> Ray: raise NotImplementedError

  def __get__(self, instance, owner) -> Ray:
    print(f'{self.name}.__get__ {instance} {owner}')
    return self
    # raise NotImplementedError
  def __set__(self, instance, value) -> Ray:
    print(f'{self.name}.__set__ {instance} {value}')
    return self
  assign = \
    __set__ # TODO: This thing I mentioned in my notes a while back is relevant to this: Assign in the sense of adding to existing equivalences: i.e. offering a specific implementation for a certain thing, vs the destroy of them and replacing it with something specific: i.e. removing all existing assigns and setting a single one.
  def __delete__(self, instance) -> Ray: raise NotImplementedError

  # def __str__(self) -> str: return self.as_string()
  # def __repr__(self) -> str: raise NotImplementedError
  # def __hash__(self) -> str: raise NotImplementedError
  # def __bool__(self) -> bool: raise NotImplementedError

  # def __iadd__(a, b: Arbitrary) -> Ray: return a.assign(a.add(b))
  # def __isub__(a, b: Arbitrary) -> Ray: return a.assign(a.sub(b))
  # def __imul__(a, b: Arbitrary) -> Ray: return a.assign(a.mul(b))
  # def __ipow__(a, b: Arbitrary) -> Ray: return a.assign(a.pow(b))
  # def __itruediv__(a, b: Arbitrary) -> Ray: return a.assign(a.div(b))
  # def __imatmul__(a, b: Arbitrary) -> Ray: return a.assign(a.matmul(b))
  # def __ibor__(a, b: Arbitrary) -> Ray: return a.assign(a.bor(b))

  #  TODO: Are these "GLOBAL" varibles from the perspective of the ignorant setup - or more accuarrately something which it could be made aware of.
  # TODO: WHILE = WITH = SCOPE = CONTEXT = GLOBAL = //...
  def __enter__(self) -> Ray: raise NotImplementedError
  def __exit__(self, exc_type, exc_val) -> Ray: raise NotImplementedError
  async def __aenter__(self) -> Ray: raise NotImplementedError
  async def __aexit__(self, exc_type, exc_val) -> Ray: raise NotImplementedError


  def __floordiv__(self, item): raise NotImplementedError

  # TODO: THESE ARE ALL MAPS.
  def __contains__(self, item): raise NotImplementedError
  def __delitem__(self, item): raise NotImplementedError
  def __getitem__(self, item): raise NotImplementedError
  def __setitem__(self, key, value): raise NotImplementedError
  def __pos__(self): raise NotImplementedError

  @ray
  def less_than(self) -> Ray: return (
    -self.greater_than_or_equal_to
  )
  __lt__ \
    = less_than
  @ray
  def greater_than_or_equal_to(self) -> Ray: return (
    -self.less_than
  )
  __ge__ \
    = greater_than_or_equal_to
  @ray
  def __gt__(a, b: Arbitrary) -> Ray: raise NotImplementedError
  @ray
  def __le__(a, b: Arbitrary) -> Ray: raise NotImplementedError

  #
  # Opposite aliases
  # TODO: Could just dynamically assign these - the case for any reversible thing (next/previous, initial/terminal ...) always: A.something and (-A).something
  #

  @ray
  def has_previous(self) -> Ray: return (-self).has_next
  @ray
  def first(self) -> Ray: return (-self).last
  beginning = front = min \
    = first
  @ray
  def is_some(self) -> Ray: return (-self).is_none
  @ray
  # @alias(f'push_{first.alias}')
  def push_front(self) -> Ray: return (-self).push_back
  __rshift__ \
    = push_front

  # Several ways of achieving these:
  #   -a.__add__.perspective(b)
  #   Ray(b).__add__(a)
  #   __add__ = -__add__.perspective (if python would allow for this)
  #   ; TODO could be automatic
  def __radd__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__add__(a)
  def __rsub__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__sub__(a)
  def __rmul__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__mul__(a)
  def __rpow__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__pow__(a)
  def __rtruediv__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__truediv__(a)
  def __rmatmul__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__matmul__(a)
  def __rxor__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__xor__(a)
  def __rfloordiv__(a, b: Arbitrary) -> Ray: return Ray.arbitrary(b).__floordiv__(a)

  #
  # Python runtime converters
  #

  @staticmethod
  def function(name: str, func: Callable[[Any, ...], Any]) -> Ray:
    a = Ray()
    a.name = name
    return a
  @staticmethod
  def integer(val: int) -> Ray: raise NotImplementedError
  @staticmethod
  def iterator(val: Iterator[Any]) -> Ray: raise NotImplementedError
  @staticmethod
  def iterable(val: Iterable[Any]) -> Ray: raise NotImplementedError
  @staticmethod
  def boolean(val: bool) -> Ray: raise NotImplementedError
  @staticmethod
  def string(val: str) -> Ray: raise NotImplementedError
  @staticmethod
  @ray
  def false(): return Ray.boolean(False)
  @staticmethod
  @ray
  def true(): return Ray.boolean(True)
  @staticmethod
  def obj(val: object) -> Ray: raise NotImplementedError
  @staticmethod
  def arbitrary(val: Arbitrary) -> Ray:
    if isinstance(val, bool): return Ray.boolean(val)
    if isinstance(val, int): return Ray.integer(val)
    if isinstance(val, str): return Ray.string(val)
    if isinstance(val, object): return Ray.obj(val)
    # TODO ... - Could do all through object/iterable in the case of python ...

    raise NotImplementedError

  #
  # Some functions which demonstrate control of (non-/)lazyness of functions
  # TODO: this concept should be expanded (more like ignorant function calls from certain perspectives).
  #

  @staticmethod
  # - TODO: readonly setup, where only traversal ops are allowed. Of course these are writing in some sense, but those writings aren't directly accessible from this perspective
  def readonly() -> Ray: raise NotImplementedError
  # TODO, writeonly would be?

  # Any arbitrary direction, where reversing the direction relies on some arbitrary memory mechanism
  @ray
  def memoized(self) -> Ray:
    # TODO: something along the lines of:
    # res = self.next
    # res.initial = self
    # return res
    raise NotImplementedError
  # TODO = cached
  # TODO: Better ideas what local caching looks like, (i.e. put it in some local structure to cache, this can be delayed till some useful implementation is ready)

  # print(f'{type(func)}')
  # def method(*args, **kwargs) -> Ray:
  #   return Ray()

  # return await func(self, *args, **kwargs)
  # TODO: Binary on self is (a, a) like is_orbit(a, a) ?

  # By default a = -b is -b = a
  # __set__(self, '')

for name, fn in inspect.getmembers(Ray, inspect.isfunction):
  if name.startswith('__'): continue
  print(f'{name}')
  setattr(Ray, name, Ray.function(name, fn))

# a: Callable[[Ray], Ray] = lambda self: self.is_terminal
setattr(Ray, '__mul__', Ray.function('__mul__', Ray.size))

print('----------------')
ray = Ray2()
ray.__init__ = lambda self: self

ray.__mul__ = 'test'
setattr(ray, '__mul__', lambda self: self)

# class Ray3(ray):
#   mul = times = size \
#     = ray__mul__
#   pass

print('----------------')
# Ray.__add__ = -Ray.__sub__
# Ray.__sub__ = -Ray.__add__

Arbitrary = Union[int, Ray]

# if __name__ == "__main__":
#   pass