# Records and given values

## The question

Two pieces of core syntax the proofs use. A record: a value of named parts, `(symbol: 1, bits: ₂01)`, as DEFLATE's
Huffman table builds a list of them. Given values: a shape that depends on values given to it rather than read, as an x86
encoding depends on the prefixes read before it.

## Decided

- "Generics are partial arguments that remember what they were given: `Ray<T = Ray>`, `f<a: 'A'>`" (§7.4), and
  `f<a: 10>` (§10.1). A width is not a given value: `Binary₈` is `Binary{length == 8}` (§7.4).
- `(a: T, b: U)` "are values, a Ray of parts", and "named parts become fields" (§7.3); `x: T` sets the value to `T`
  (§6.1); `obj["name"]` selects by key (§2.4).
- Open: a record literal (the word appears only as something to avoid, §1.2 and Appendix C), and how a shape declares
  what it is given.

## Recommended

- **A record is a value of named parts, and its type is its shape.** `(symbol: 1, bits: ₂01)` is a value;
  `(symbol: Number, bits: Binary)` is the shape it has. No class is declared for it. Because a record's type is a shape,
  a list of them reads and writes as bits like any other shape (`Formats.md`). Confidence 65%: §7.3 points here, and
  `Design.md` names no record literal.
- **A shape takes what it is given the way a function does** (§7.4): `Add<prefixes, rex> := (₂00000001, operand:
  Operand<rex>)`. Given values are fixed before anything is read and are never read from bits; a shape given some of its
  values is a type of its own (`Add<p, r>`). Confidence 75%.

## Options weighed

| | For | Against |
|---|---|---|
| A record as a fresh scope of its fields (the old proofs) | cheap | a second meaning of `(…)`, beside call arguments; a value no type describes |
| **A record as a value whose type is its shape** | nothing new; reads and writes as bits for free | needs `Design.md` to say so |
| No record literal, a declared shape per use | works today | NE12 stays red; ceremony for one-off values |
| `class<given> (…)` (the old proofs) | short across 46 x86 forms | a class form, beside `class: <…>` |
| **`Name<given> := (…)` (above)** | the form of `Ray<T = Ray>` and `f<a: 10>`; no class | the given values sit apart from the shape they condition |

## Found on main (e6bcbbb2)

- A record of one part works (`(symbol: true).symbol`); with two or more, `,` splits it into a list first.
- Partial arguments fail in every form.
- Named arguments are fragile: `Pair(left: true, right: false)` holds, but `Pair(left: 1, right: 2)` (any number given
  by name), two named booleans in another shape, and a named argument mixed with one in order all fail. Both items here
  depend on this.

## Deliverables, each its own PR (`.entrypoint.ray3`)

1. Named arguments taken by any name and value. NA16 to NA18. No dependency.
2. The record literal: named parts in brackets make a value of them. RE1 to RE7 (two and four parts, in a list, one part,
   a call stays a call, a mix stays a list). NE12. No dependency.
3. Partial arguments: `f<a: 1>`, `f<1>`, given then called. PA1 to PA4. After 1.
4. Shapes that take given values: `Name<given> := (…)`. CG1 to CG5; NE48 (respelled to test this alone). After 3.
5. A record's shape as its type, `==` structural. RT1, RT2. After 2 and the owner's answer.
6. A shape given some values, used inside another (`op: Add<w>`), as an x86 instruction needs. GT1 to GT3. After 4 and
   `Formats.md`'s 3.

## For the owner

- Is `(a: 1, b: 2)` a value whose type is the shape `(a: Number, b: Number)`?
- Is a shape's given part declared `Name<given> := (…)`?
- Can given values also be passed in order (`Add(p, r)`)?
