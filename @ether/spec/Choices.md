# Language choices

What the core needs so that the DEFLATE, interop and machine code proofs (tag `machine-code-proof`) can come back, where
`Design.md` leaves it open. Each choice is its own document in `design/`: what is decided, the options weighed, a
recommendation with how sure it is, deliverables as small PRs, and questions for the owner. Where `Design.md` decides,
it wins; these fill gaps.

All of them are written in one principle, `design/Shapes.md`: what a value is, is its shape; it is declared once and the
rest inferred; behaviour is rules on shapes, not inheritance.

| Choice | Recommended | Sure | Unblocks |
|---|---|---|---|
| [Shapes](design/Shapes.md) | declared shapes, no class hierarchy; a declared type forces a conversion | high | the style of all below |
| [Conversions](design/Conversions.md) | a declared type converts a value: itself, its `from`, its shape reading it, one conversion at a time | medium-high | NE25, NE47 |
| [Numbers](design/Numbers.md) | exact numbers below zero; widths as ranges; `.mod` for wrapping and signed bits; bits as a base | high, spellings medium | NE5, NE26, NE27, NE40, NE43 to NE46 |
| [Formats](design/Formats.md) | a format is a shape over bits, read by the text matcher; an index, then a table, for speed | high, index medium | NE47, NE48, DEFLATE's streams, x86 |
| [Reading](design/Reading.md) | text read through declared shapes; no regex in the core; foreign syntax as shapes | high, style medium | NE23 to NE25 |
| [Records](design/Records.md) | records are map literals (§3.2, works today); `Name<given> := (…)` for given values | decided; 75% | NE12 (green), NE48 |

## Where to start

Some first steps serve several choices, and none needs an answer from the owner:

1. **Named arguments by any name and value** (`Records.md`, 1): records and given values both stand on it.
2. **The matcher on `first` and `rest` again** (`Reading.md`, 1): it fixes the restore's regression in reading text by a
   shape, which `Formats.md` and `Conversions.md` both wait on.
3. **Reading text by a shape** (`Formats.md`, 1), then **a conversion found is answered** (`Conversions.md`, 1).

After those, each document's list goes on in its own order.

## For the owner

1. Is Ray structural all the way down, or do `class: Parent` and `super` stay? (`Shapes.md`)
2. Does a declared type force a conversion, `x: Binary₄ = 5`? (`Shapes.md`, `Conversions.md`)
3. Does a failing conversion raise an error or answer None? (`Conversions.md`)
4. May `2 - 5` answer `-3`? (`Numbers.md`)
5. Is `Binary₈.Signed` two's complement? (`Numbers.md`)
6. What bounds "integer parts are bounded by default", against "no overflow"? (`Numbers.md`)
7. May the host's map hold exact numbers past 2^31, and bitwise operations as externals? (`Numbers.md`)
8. Does `<-T` in a shape mean look-behind (§4.2) or read right to left (§13.1)? (`Formats.md`)
9. Does a value read keep the bits it was read from? (`Formats.md`)
10. Is a text read by a set of rules done in the language or in the kernel? (`Reading.md`)
11. Regular expressions only as `$.regex`? (`Reading.md`)
12. Is a map literal's type its shape, and is a given part declared `Name<given> := (…)`?
    (`Records.md`)
