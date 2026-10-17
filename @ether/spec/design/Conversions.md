# Conversions: what a declared type does with a value that is not one yet

## The question

`stream: Deflate.Stream = bytes`: the value is bytes, the declared type is a stream. What happens, when, and what does
it cost when it fails?

## Decided

- One `as (type)`; "all conversions are implicit but only convert when forced" (§7.5).
- A shape declared by a pattern "prints by running its reader backwards" (§7.5); reading by a structure "works the same
  way as destructuring" and checks are quiet (§7.3).
- Reading is done through conversions already: `as Block[]` (§13.1), `source as Expression` (§20.1), `"XIV" as Number`
  (§12.4), and "`T.from(text)`, by `as`" (§21.5).
- Ranking ordered conversion routes was dropped in favour of superposing (Appendix C).

## Recommended

A value meets a declared type `T` (a variable, a field, a parameter; `as T` where nothing is declared). It becomes:

1. itself, if it is a `T`;
2. else what `T` declares it makes of such a value (`from`);
3. else, if the value is written (a text or bits), what `T`'s shape reads of it, whole;
4. else the same, one conversion of the value at a time, lazily; two at the same distance are both kept (§7.5);
5. else it fails.

Reading by a shape (step 3) happens only toward a type that is asked for by name. It is never followed for `==`, for a
method found by conversion, or for `as *`: so `2 == "2"` stays false, and a failing conversion costs one reading, only
for a type that has a shape to read by. Text and bits are read by the same matching (`Formats.md`, `Reading.md`).

Confidence: medium-high that reading belongs with conversions, medium on the exact steps.

## Options weighed

| Option | For | Against |
|---|---|---|
| Try `from`, then text, then bits, in order (the old proofs) | everything converts for free | up to three readings for every failing conversion; an ordered route (dropped, Appendix C); a digit text is ambiguous between characters and bits |
| The shape is `T`'s default `from` (main today) | one reader | no bits, no conversions in between, failures inconsistent |
| Readers as edges everywhere in the graph | most uniform | `2 == "2"`; every lookup on a text tries every shape |
| A separate `read` | explicit | contradicts §21.5 and the examples above; type and parser used apart |
| **The steps above** | one reading, only where asked; one rule | the kernel must carry the declared type to the conversion |

## Found on main (e6bcbbb2)

- A shape with nothing in its header accepts any value (`Qa() as Qc` makes a `Qc`), through an implicit field.
- `5 as Pt` raises an error, while a text `Pt` cannot read answers None.
- `is` misses a declared conversion to a subtype.
- `as` can answer the value itself when it is a `T` only through a conversion.

## Deliverables, each its own PR (`ray/bootstrap/.entrypoint.ray3`)

1. A conversion found is answered, and `is` follows a declared conversion. Asserts AS1, AS2.
2. A shape with nothing to read reads nothing. AS3. After 1.
3. Reading only a written value (text, bits), quietly. AS4 to AS6. After 2.
4. One reading serves as both the check and the result. AS7; turns NE25 green with `Reading.md`'s first fix. After 3.
5. One conversion of the value, then reading. AS8. After 4.
6. A declared type forces the steps above (variables, fields, parameters). After 5 and the owner's answer.

## For the owner

- Does a failing conversion raise an error (§1.2: "failures are errors") or answer None, as main does today?
- Does a declared type force the conversion (`x: Binary₄ = 5`)? See `Shapes.md`.
- Is `"7"` read as the number 7 or as the character's code? Depends on whether `"7"` is a character (Appendix A).
