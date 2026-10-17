# Reading other languages' text

## The question

How a Ray program reads C, Python or assembly text into values: how a set of rules is applied to a text, whether a
regular expression belongs in Ray, how a shape reads text into its fields, and the smallest set of operations that lets a
reader for a whole language be written as declarations.

## Decided

- Types "are parser, constructor and type in one" (`Philosophy.md`); the Almanac makes pattern, type and grammar one.
- "Reading text by one works the same way as destructuring … the matcher is language-side" (§7.3); `{x: T}` "matches a
  span that T's own rules read whole" (§4.2).
- "No record vocabulary between a format and Ray" (§15.2). Regular expressions come through the Library Project (§24).
  The host knows no syntax (§21.1).

## Recommended

- **A text meets a declared shape, and is read** (`Conversions.md`): `expression: CExpression = text`. A set of rules
  is a shape too: a text declared as one is read by its rules. There is no `reads_text`.
- **No regular expressions in the core.** `^[a-z][0-9]$` is the shape `(Lower, Digit)`, with `Lower := "a".."z"`.
  Foreign regular expressions come in as `$.regex` and are read into shapes.
- **Write a foreign language's syntax as shapes**, its precedence by their structure:
  `Sum := (left: CExpression, Blank, "+", Blank, right: Product)`. Its meaning is a conversion to a program
  (`as (=== Program)`), so a reader answers values, not Ray source to evaluate (no `ray_code`). Only a shape also writes
  the text back, which is "one declaration is type, parser and writer".
- **The smallest set:** the text operations `first`, `rest`, `until`, `same`; shapes built of text, `,`, `|`, `[]`, `?`,
  `name: T`, `T{p}`, `⊢ ⊣` and `..`; and one matcher that answers what each name read, used by `is`, `:=`, `~=` and
  declared types alike.

Confidence: high on reading through declared shapes and on no regex in the core; medium on syntax as shapes being the
house style.

## Options weighed

| Option | For | Against |
|---|---|---|
| Host words (the old proofs: `reads_text`, `fits_pattern`, `ray_code`) | it ran | each word a host function, against §21.1; readers produce text to evaluate, not values; a regex has no writer |
| Reading through `is` and declared types, rules as they are | no new words | rules read one way only |
| **Syntax as shapes, meaning as conversions (above)** | reads and writes; values, not source | a house style to agree on; precedence by structure takes care to write |

## Found on main (e6bcbbb2)

- A shape reading text into its fields worked before the library restore (8e2736b7) and fails now, for three reasons:
  - the restored `String.ray` writes `starts_with`, `after` and `before` through `~=`, whose matcher calls them back,
    without end;
  - the list's `until` hides the text's own `until`;
  - `count` and `empty` go through a broken `reduce` (Appendix A).
- Joining two texts with `+` fails, but by design: §5.1 joins texts with `,` and `as String`. The check (NE20) is
  respelled, not the core.

## Deliverables, each its own PR

1. The matcher on `first` and `rest` again, and the text's `until` no longer hidden (`String.ray`). S62 to S62f, TL1,
   TL3, TY36 to TY41, HD8; NE25 with the `reduce` fix.
2. One matcher for all four uses (`.entrypoint.ray3`, `Node.ray`): the entrypoint's three text readers and `read_within`
   become one. Keeps NE25. After 1.
3. The checks respelled: NE20 with `,`, NE23 as `(Lower, Digit)`, NE24 as a declared shape. After the owner's answer.
4. A text read by a set of rules declared as its type. NE24. After 2.
5. Ranges of characters as shapes: `"a".."z"`, `Letter`, `Digit`. NE23. After 2 and ranges on Ordered (Appendix A).
6. Later, with the interop proof: its C and Python readers as shapes, and their host words gone.

## For the owner

- Is a text read by a set of rules done in the language, with the kernel's typed-hole check only as a speed-up (an
  external to approve), or in the kernel?
- Regular expressions only as `$.regex`?
