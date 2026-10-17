# Shapes, declared

The principle the other decisions here are written in. It is `Design.md`'s own direction made the rule.

## The principle

1. **What a value is, is its shape.** A type is a pattern (§7.1) and a value is one when it has that shape (§7.3,
   structural). There is no class hierarchy (§2.1: "the kinds are structural, with no class hierarchy").
2. **Declare, then infer.** What something is is written once, where it is declared (a field, a parameter, a variable),
   and everything else is inferred (§1.2, principle 6). A conversion happens because a declared type asks for it
   (§7.5: "all conversions are implicit but only convert when forced"), not because it is cast at each use.
3. **Behaviour is rules on shapes.** "Rules are methods; patterns are types" (§4.2). What a shape does is written as
   rules that read that shape, not as methods inherited from a base.
4. **One declaration is type, reader and writer.** A shape reads a value (text or bits) by matching it, and writes it by
   running that reading backwards (§7.5). Nothing is declared twice.

## In practice

| Instead of | Write |
|---|---|
| `Square := class: Shape { … }` (inheritance) | `Square := (side: Number)` and rules that read a `Square` |
| `stream := bytes as Deflate.Stream` (a cast at the use) | `stream: Deflate.Stream = bytes` (the declaration forces the reading) |
| a class with fields as a record | a value of named parts, `(symbol: 1, bits: ₂01)`, whose type is its shape |
| `class<given> (…)` | a shape that takes what it is given, `Add<prefixes, rex> := (…)` (§7.4) |
| `x as T` everywhere | `x: T = …` where it is declared; `as` stays for where nothing declares a type |

`class` remains `Design.md`'s spelling of a shape with named fields; what is not used is `class: Parent`.

## Why

- **One mechanism.** A shape is the type, the parser, the writer and the check. A second system of classes beside it
  would say the same things twice.
- **Nothing to keep in sync.** Without base classes, nothing breaks when a parent changes.
- **Values compare by what they are.** Structural equality is what reading formats needs (bytes, fields).
- **Compiles plainly.** A shape compiles to a decoding table; there is no chain of overrides to resolve while running.

## What it costs

- **Two things with the same shape are the same type.** A temperature and a distance, both `(value: Number)`, would
  mix. The shape carries the difference: a unit (§12.2) or a fixed part.
- **Where a reading happens is less visible.** Reading a whole stream happens at an `=`. So a conversion is forced only
  at a declared type: a variable, a field, a parameter, or a method found only through a conversion (§7.5).
- **A chain needs names.** `5 as Binary₄ as String` becomes two declarations, each step named.
- **The kernel carries expected types** from declarations to where a conversion is chosen.
- **Shape checks cost more than a tag.** The compiling work (a shape to a table) is what pays for it.

## For the owner

- Should `class: Parent` and `super` stay in the language, or is Ray structural all the way down (§2.1)?
- Does a declared type force a conversion, so that `x: Binary₄ = 5` converts 5? §7.5 says conversions happen "when
  forced" but not what forces one.
