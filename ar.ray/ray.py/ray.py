from __future__ import annotations
import functools
import inspect
from typing import Iterator, AsyncIterator, Union, Callable, Any, Iterable, AsyncIterable, Tuple


class Ray:
  @staticmethod
  def __new__(cls, *args, **kwargs):
    return super().__new__(cls)

  def __init__(self, *args, **kwargs) -> Ray:
    pass

  def __call__(self, *args, **kwargs):
    pass

  def __iter__(self): return self
  def __next__(self):
    pass

  def reverse(self): 
    return Ray(initial=self.terminal, self=self.self, terminal=self.initial) 
