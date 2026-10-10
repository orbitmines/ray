# Philosophy

Aesthetically, the aim is to minimize verbosity while maximizing clarity. Finding the critical point for both.

What this tends to mean in practice, is that we want to minimize the number of languages we have (wrappers, abstraction levels) while maximizing the expressivity of the code. And that code tends to be [declaritive](https://en.wikipedia.org/wiki/Declarative_programming).

The Ray Programming Language differentiates concepts into 3 buckets: Languages, Optimizations, Look.

- **Languages**: The following concepts are all reduced to the concept of language: [Type](https://en.wikipedia.org/wiki/Type_system), pattern, grammar, [dataformat](https://en.wikipedia.org/wiki/Data_type), configs, frontend, backend, [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree), [IR](https://en.wikipedia.org/wiki/Intermediate_representation).
- **Optimizations**: [Databases](https://en.wikipedia.org/wiki/Database), [Compilers](https://en.wikipedia.org/wiki/Compiler)
- **Look**: The style in which a language is represented.

---

## Languages

Languages are typically expressed in a singular way: A type/[self modifying type](https://en.wikipedia.org/wiki/Adaptive_grammar). Instead of writing complicated parsers, we write those. They are parser, constructor and type in one:

A type:

```ray
static UTF-8 := class (sequence: (
  prefix: 1[]{length == 0..4},
  U0: Binary{length == 8 - prefix.length}{⊢0},
  (₂10, U1: Binary₆) if prefix ⊢₂11,
  (₂10, U2: Binary₆) if prefix ⊢₂111,
  (₂10, U3: Binary₆) if prefix ⊢₂1111
)[]) => {}
```

A self-modifying type:

```ray
static Ray := class (
  dynamically //TODO
) => {}
```

<!-- In a situation that the parser is too complex for a single statement -->

---

## Optimizations



---

## Look

