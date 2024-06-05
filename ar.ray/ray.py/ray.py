from __future__ import annotations
import functools
import inspect
from typing import Iterator, AsyncIterator, Union, Callable, Any, Iterable, AsyncIterable, Tuple


def __ray__(*GLOBAL_ARGS, **GLOBAL_KWARGS):
  class Ray:
    @staticmethod
    def __new__(cls, *args, **kwargs):
      return super().__new__(cls)

    def __init__(self, *args, **kwargs) -> Ray:
      pass

    # def initial(self) -> Ray: raise NotImplementedError
    # def self(self) -> Ray: raise NotImplementedError
    # def terminal(self) -> Ray: raise NotImplementedError

    @staticmethod
    def none() -> Ray: raise NotImplementedError
    @staticmethod
    def boolean() -> Ray: return (Ray.none * 2).orbit

    @staticmethod
    def function(func: Callable[[Any, ...], Any]):
      return Ray()

    pass

  for name, fn in inspect.getmembers(Ray, inspect.isfunction):
    if name == '__new__' or name == '__init__' or name == 'function': continue

  return Ray

Ray = __ray__()