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

- **Records are named parts in brackets, `(symbol: 1, bits: ₂01)`, a value whose named parts are its fields** (§7.3). The
  library writes them so itself: `Ray.ray`'s `enumerate` makes `(index: …, value: …)`, and `$/Deflate.project.ray`'s
  Huffman codes `(symbol: …, bits: …)`. A map literal, `{ symbol: 1, bits: ₂01 }` (§3.2), already works on main. Brackets
  of named parts do not: inside them `a: 1` reads as a declaration (§6.1) and answers its value, so the names are lost,
  and no rule can read the brackets whole, since the kernel reads `,` as a list before any rule (§10.1). That reading is
  the kernel's to change; `enumerate`, `zip`, `sliced` and DEFLATE's codes wait on it. Its type is its shape, so a list
  of records reads and writes as bits like any other shape (`Formats.md`).
- **A shape takes what it is given the way a function does** (§7.4): `Add<prefixes, rex> := (₂00000001, operand:
  Operand<rex>)`. Given values are fixed before anything is read and are never read from bits; a shape given some of its
  values is a type of its own (`Add<p, r>`). Confidence 75%.

## Options weighed

| | For | Against |
|---|---|---|
| **Named parts in brackets, a value of fields (§7.3)** | what the library already writes | the kernel reads `,` first and `a: 1` as a declaration |
| A map literal, `{ k: v }` (§3.2) | works today | not what the library writes |
| `class<given> (…)` (the old proofs) | short across 46 x86 forms | a class form, beside `class: <…>` |
| **`Name<given> := (…)` (above)** | the form of `Ray<T = Ray>` and `f<a: 10>`; no class | the given values sit apart from the shape they condition |

## Found on main (e6bcbbb2)

- A map literal works: `{ symbol: 1, bits: `01` }.bits`. Named parts in brackets lose their names: `(index: 1, value: 2)`
  is the list `1, 2`, so `enumerate` (IT66), `zip`, `sliced` and DEFLATE's Huffman codes (DF1) fail.
- Why, and how far a rule gets (branch `core/record-fields`, local): the record rule is declared before `{list}, {other}`,
  so it never sees a `,`. Declared after it, as `Header` is, and reading what follows the first name as `Arguments`, a
  record holds every name at the top level of a file of the bootstrap: RF1 to RF4 and RF8 pass, and none of main's 737
  passing asserts is lost. In a block (`assert { … }`, a method's body, so `enumerate`'s) and in a file read with `read
  given` (`$/Deflate.project.ray`) only the first name is held, with booleans as with numbers, while a class given names
  in the same block holds them. The difference is in how the kernel reads a block's code, so it is the owner's.
- Partial arguments fail in every form.
- Named arguments to a closure work; to a class they do not: the constructor's typed hole `{arguments: Arguments}`
  rejects `left: 1, right: 2`, the call is read as a group, and the fields stay None. Making the hole untyped fixes them
  but breaks 40 other asserts, so the fix is in the kernel's reading of `Arguments`.

## Deliverables, each its own PR (`.entrypoint.ray3`)

1. Named arguments taken by any name and value. NA16 to NA18. No dependency.
2. Named parts in brackets as a value of fields: in the kernel's reading of `,` and `name: value`. NE12, and with it
   `enumerate`, `zip`, `sliced`, DEFLATE's DF1. For the owner.
3. Partial arguments: `f<a: 1>`, `f<1>`, given then called. PA1 to PA4. After 1.
4. Shapes that take given values: `Name<given> := (…)`. CG1 to CG5; NE48 (respelled to test this alone). After 3.
5. A map literal's shape as its type, `==` structural. RT1, RT2. After the owner's answer.
6. A shape given some values, used inside another (`op: Add<w>`), as an x86 instruction needs. GT1 to GT3. After 4 and
   `Formats.md`'s 3.

## For the owner

- Is a map literal's type its shape, `{ a: 1, b: 2 } is (a: Number, b: Number)`?
- Is a shape's given part declared `Name<given> := (…)`?
- Can given values also be passed in order (`Add(p, r)`)?
