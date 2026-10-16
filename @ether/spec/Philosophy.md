# Philosophy

Aesthetically, the aim is to minimize verbosity while maximizing clarity. Finding the critical point for both.

What this tends to mean in practice, is that we want to minimize the number of languages we have (wrappers, abstraction levels) - often achieved by letting ideas compose -, while maximizing the expressivity of the code. And that code tends to be [declaritive](https://en.wikipedia.org/wiki/Declarative_programming).

The Ray Programming Language differentiates concepts into 3 buckets: Languages, Optimizations, Look.

- **Languages**: The following concepts are all reduced to the concept of language: [Type](https://en.wikipedia.org/wiki/Type_system), pattern, grammar, [dataformat](https://en.wikipedia.org/wiki/Data_type), configs, frontend, backend, [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree), [IR](https://en.wikipedia.org/wiki/Intermediate_representation).
- **Optimizations**: [Databases](https://en.wikipedia.org/wiki/Database), [Compilers](https://en.wikipedia.org/wiki/Compiler), [Memory management](https://en.wikipedia.org/wiki/Memory_management)
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

In a situation that the parser (or rather the semantics) is too complex for a single statement, we define rewrite rules (just functions/methods) between concepts. *(This is often because a language tends to be convoluted for good reason; with many concepts being primitives; often for optimization purposes; look at hardware for instance.)*

Take for instance this sample of the `WebAssembly` definition:

```ray
TODO
```

---

## Optimizations

Thinking about the concepts; databases, memory management and compilers as 'merely' optimizations is a useful model. Optimizing; Or more generally, minimizing certain parameters. This is more properly phrased as a story of trade-offs. Every decision having a cost in some realm, while optimizing in another. The perspective of Ray is: You typically don't want to consider optimizations, but when you do, you want to be able to have full control.

- Optimizations are necessary.

- Optimizations increase complexity tremendously.

- Optimizations are considered always something that needs to be improved over time. This requires constant pushing on finding better ways of doing things. Absent of that, decay is the likely outcome.

- Optimizations tend to be separated from their specification. In the sense that optimizing for clarity (specification) is likely not the best way for implementing any algorithm; optimizing for resource usage.

- For @ether, it is likely that we want to incensitise people to find optimizations which can easily be switched on/off. A goal of the project is finding a good way to do so. When trade-offs are neccessarily a part of the story, how does one reward losing in one realm, and not in another.

---

## Look

"Look" is an abstraction level above what a language is. It is not the user interface itself; because that is just merely another language. It is the general style in which that interface represents itself. It could almost qualify under this overgeneralized notion of a language, but I separate it out because it is sufficiently different to me.

- 
- 
- 
- 
