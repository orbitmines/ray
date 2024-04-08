from ray import Ray, ray

print('test')

# Target first implementation

@Ray.function
def test() -> Ray:
  a = Ray.none; b = Ray.none
  a, b = Ray.none * 2
  a, b = Ray.boolean
  *a, b = Ray.boolean
  a, *b = Ray.boolean
  a, *between, b = Ray.boolean
  b, none = -Ray.boolean
  b, a = -Ray.boolean.orbit
  a, b = --Ray.boolean.orbit
  b, a = ---Ray.boolean.orbit
  a, b = --Ray.boolean

  # TODO: Normal way of talking about a boolean, or probably any concept, is that this is always with .orbit on it. And without .orbit it's probably a weird case. We assume modularity of booleans.

  # TODO: This is only if Ray.boolean is .orbit, otherwise reverse would be different.

# Compile the function to javascript
print(test.as_javascript())
# Compile the Compiler (i.e. Ray functionality) to javascript
compiler = (
  Ray.compiler
  or test.compiler
  or Ray.compiler.compiler
)
print(Ray.as_javascript())

# test.runtimes.javascript()
test.run(lambda ray: ray)
# Ray.runtime(lambda ray: ray).run(test)

# TODO These also the same:
# Ray(
#   initial = lambda ray: ray,
#   self = lambda ray: ray,
#   terminal = lambda ray: ray,
#   is_orbit = lambda ray: ray
# )
# class Object(Ray):
#   @property
#   def initial(self) -> Ray: raise NotImplementedError
#   @property
#   def self(self) -> Ray: raise NotImplementedError
#   @property
#   def terminal(self) -> Ray: raise NotImplementedError
#
# ray = Ray()
# ray.initial = lambda ray:
# ...
#
#
# Then copy is simple:
# ray.copy() / Ray(ray) / sometimes even ray()
#


test.compile(lambda ray: ray)
Ray.compile(lambda ray: ray)

# test.compile(python).run(python)

# Hence the difference between add/sub and a normal boolean. Is context. What add/sub is applied to; i.e. what effects it has.
# These should be the same
# def add(self) -> Ray: return -self.sub
# def sub(self) -> Ray: return -self.add
# def add(a, b: Arbitrary) -> Ray: return (-self.sub)(b)
# def sub(a, b: Arbitrary) -> Ray: return (-self.add)(b)
# add = -sub
# sub = -add
# [add, sub].orbit

# TODO: Message: "Cannot run, need more implementations, for example these:"

# TODO: Could just randomly start generating possible combinations of logical gates (or any methods on Ray), which if the runtime has an explanation for (or in the debug mode just to listen), you can hook into that and create an implementation. In the case of python made something along the lines of an interpreter which gives you one, asks to write one in python...

































