from __future__ import annotations
import inspect
from typing import Iterator, AsyncIterator, Union, Callable, Any, Iterable, AsyncIterable, Tuple

# GLOBAL_ARGS & GLOBAL_KWARGS can be phrased as ignorant context? - TODO: Similar to enter_exit contexts. Or contexts far away we don't yet, or dont know how to get access to.
def __ray__(*GLOBAL_ARGS, **GLOBAL_KWARGS):

  def alias(func: Callable[[Any, ...], Any]):
    pass

  class Ray:
    def initial(self) -> Ray: raise NotImplementedError
    def self(self) -> Ray: raise NotImplementedError
    def terminal(self) -> Ray: raise NotImplementedError

    def __init__(self, *args, **kwargs) -> Ray:
      print('Ray.__init__')
      pass
    def __getattr__(self, name: str) -> Ray:
      print(f'Ray.__getattr__.{name}')
      pass
    def __setattr__(self, key, value) -> Ray:
      print(f'Ray.__setattr__{key}={value}')
      pass
    def __get__(self, instance, owner) -> Ray:
      print(f'{self.name}.__get__ {instance} {owner}')
      return self
    def __set__(self, instance, value) -> Ray:
      print(f'{self.name}.__set__ {instance} {value}')
      return self
    def __delete__(self, instance) -> Ray: raise NotImplementedError

    def is_initial(self) -> Ray: return self.initial().is_none
    def is_terminal(self) -> Ray: return self.terminal().is_none
    def is_vertex(self) -> Ray: return self.is_initial().nor(self.is_terminal())
    def is_reference(self) -> Ray: return self.is_initial() & self.is_terminal()

    def is_boundary(self) -> Ray: return self.is_initial() ^ self.is_terminal()
    def is_extreme(self) -> Ray: return self.is_boundary() & self.self().is_none

    def orbit(self) -> Ray:
      pass

    # def free(self): raise NotImplementedError

    @staticmethod
    def function(func: Callable[[Any, ...], Any]) -> Ray:
      a = Ray()
      return a

    def reverse(self) -> Ray:
      return Ray(initial=self.terminal, self=self.self, terminal=self.initial)

    def as_string(self) -> str: raise NotImplementedError
    def as_int(self) -> int: raise NotImplementedError
    def as_list(self) -> list: raise NotImplementedError
    def as_tuple(self) -> tuple: raise NotImplementedError
    def as_iterable(self) -> Iterable[Ray]: return self
    def as_async_iterable(self) -> AsyncIterable[Ray]: return self
    def __iter__(self) -> Iterator[Ray]: return self
    def __aiter__(self) -> AsyncIterator[Ray]: return self

    def __enter__(self) -> Ray: raise NotImplementedError
    def __exit__(self, exc_type, exc_val) -> Ray: raise NotImplementedError
    async def __aenter__(self) -> Ray: raise NotImplementedError
    async def __aexit__(self, exc_type, exc_val) -> Ray: raise NotImplementedError

    # TODO: THESE ARE ALL MAPS.
    def __contains__(self, item): raise NotImplementedError
    def __delitem__(self, item): raise NotImplementedError
    def __getitem__(self, item): raise NotImplementedError
    def __setitem__(self, key, value): raise NotImplementedError
    def __pos__(self): raise NotImplementedError

    def __str__(self) -> str: raise NotImplementedError
    def __repr__(self) -> str: raise NotImplementedError
    def __hash__(self) -> str: raise NotImplementedError
    def __bool__(self) -> bool: raise NotImplementedError

    def __mod__(self) -> Ray: raise NotImplementedError
    def __matmul__(self) -> Ray: raise NotImplementedError
    def __floordiv__(self) -> Ray: raise NotImplementedError

    def __ne__(self, **kwargs) -> Ray: raise NotImplementedError
    def __lt__(self) -> Ray: raise NotImplementedError
    def __ge__(self) -> Ray: raise NotImplementedError
    def __gt__(self) -> Ray: raise NotImplementedError
    def __le__(self) -> Ray: raise NotImplementedError

    def __radd__(self) -> Ray: raise NotImplementedError
    def __rsub__(self) -> Ray: raise NotImplementedError
    def __rmul__(self) -> Ray: raise NotImplementedError
    def __rpow__(self) -> Ray: raise NotImplementedError
    def __rtruediv__(self) -> Ray: raise NotImplementedError
    def __rmatmul__(self) -> Ray: raise NotImplementedError
    def __rfloordiv__(self) -> Ray: raise NotImplementedError

    def __iadd__(self) -> Ray: raise NotImplementedError
    def __isub__(self) -> Ray: raise NotImplementedError
    def __imul__(self) -> Ray: raise NotImplementedError
    def __ipow__(self) -> Ray: raise NotImplementedError
    def __itruediv__(self) -> Ray: raise NotImplementedError
    def __imatmul__(self) -> Ray: raise NotImplementedError
    def __ifloordiv__(self) -> Ray: raise NotImplementedError

    @staticmethod
    def boolean() -> Ray: return (Ray.none * 2).orbit


  # TODO
  def method(func: Callable[[Any, ...], Any]) -> Ray:
    # print(f'{type(func)}')
    # def method(*args, **kwargs) -> Ray:  #   return Ray()
    # return await func(self, *args, **kwargs)  # TODO: Binary on self is (a, a) like is_orbit(a, a) ?

    # By default a = -b is -b = a
    # __set__(self, '')
    pass

  # TODO, wraps in @ray
  for name, fn in inspect.getmembers(Ray, inspect.isfunction):
    pass
    # if name.startswith('__'): continue
    # print(f'inspect.{name}')
    # setattr(Ray, name, Ray.function(name, fn))
    # setattr(Ray, '__mul__', Ray.function('__mul__', Ray.size))
    # ray.__init__ = lambda self: self
    # a: Callable[[Ray], Ray] = lambda self: self.is_terminal
    # setattr(ray, '__mul__', lambda self: self)
    #

    # TODO: Map the radd, rsub, rmul, rpow, ....
    # Several ways of achieving these:
    #   -a.__add__.perspective(b)  #   Ray(b).__add__(a)  #   __add__ = -__add__.perspective (if python would allow for this)  #   ; TODO could be automatic

  # Ray.__eq__ = -Ray.__ne__
  # (Ray.__eq__ & Ray.__ne__).orbit
  # [
  #   (Ray.initial, Ray.terminal),
  #   (Ray.__eq__, Ray.__ne__),
  #   (Ray.__or__, Ray.__nor__),
  #   (Ray.__xor__, Ray.__xnor__),
  #   (Ray.__and__, Ray.__nand__),
  #   (Ray.__add__, Ray.__sub__),
  #   (Ray.__pow__, Ray.__truediv__),
  #   (Ray.__lt__, Ray.__ge__),
  #   (Ray.__gt__, Ray.__le__),
  #   (Ray.__gt__, Ray.__le__),
  #   (Ray.is_some, Ray.is_none),
  #   (Ray.push_back, Ray.push_front),
  #   (Ray.has_previous, Ray.has_next),
  #   (Ray.first, Ray.last),
  # ].all.orbit

  Ray.a = lambda self, b: print(b)
  Ray.__eq__ = lambda self, b: print(b)

  # Ray.__add__ = -Ray.__sub__
  # Ray.__sub__ = -Ray.__add__
  return Ray

Ray = __ray__([1,2,3])

if __name__ == "__main__":
  Ray().a([4, 5, 6])
  @Ray.function
  def a():
    print('b')
  a.a([6, 7, 8])
  print(a == 'b')