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

- **Records are decided: they are map literals.** `{ symbol: 1, bits: ₂01 }.bits` is `₂01`; "the own key wins over Node's
  member of that name: `{ count: 3 }.count` is 3" (§3.2). This works on main today, four keys and in a list included. The
  old proofs' `(symbol: 1, bits: …)` was their spelling: `,` binds loosest of all (§10.1), so brackets of named parts are
  a list first, and no rule is meant to read them as one value. A map literal's type is its shape, so a list of them
  still reads and writes as bits like any other shape (`Formats.md`).
- **A shape takes what it is given the way a function does** (§7.4): `Add<prefixes, rex> := (₂00000001, operand:
  Operand<rex>)`. Given values are fixed before anything is read and are never read from bits; a shape given some of its
  values is a type of its own (`Add<p, r>`). Confidence 75%.

## Options weighed

| | For | Against |
|---|---|---|
| **A record as a map literal, `{ k: v }` (§3.2)** | decided; works today; its type is its shape | none found |
| Named parts in brackets (the old proofs) | short | a list first by §10.1 |
| `class<given> (…)` (the old proofs) | short across 46 x86 forms | a class form, beside `class: <…>` |
| **`Name<given> := (…)` (above)** | the form of `Ray<T = Ray>` and `f<a: 10>`; no class | the given values sit apart from the shape they condition |

## Found on main (e6bcbbb2)

- A map literal works: `{ symbol: 1, bits: `01` }.bits`, four keys, in a list. Named parts in brackets are a list of
  two or more, as §10.1 has it.
- Partial arguments fail in every form.
- Named arguments are fragile: `Pair(left: true, right: false)` holds, but `Pair(left: 1, right: 2)` (any number given
  by name), two named booleans in another shape, and a named argument mixed with one in order all fail. Both items here
  depend on this.

## Deliverables, each its own PR (`.entrypoint.ray3`)

1. Named arguments taken by any name and value. NA16 to NA18. No dependency.
2. None for records: NE12 is respelled as a map literal and passes (#29).
3. Partial arguments: `f<a: 1>`, `f<1>`, given then called. PA1 to PA4. After 1.
4. Shapes that take given values: `Name<given> := (…)`. CG1 to CG5; NE48 (respelled to test this alone). After 3.
5. A map literal's shape as its type, `==` structural. RT1, RT2. After the owner's answer.
6. A shape given some values, used inside another (`op: Add<w>`), as an x86 instruction needs. GT1 to GT3. After 4 and
   `Formats.md`'s 3.

## For the owner

- Is a map literal's type its shape, `{ a: 1, b: 2 } is (a: Number, b: Number)`?
- Is a shape's given part declared `Name<given> := (…)`?
- Can given values also be passed in order (`Add(p, r)`)?
