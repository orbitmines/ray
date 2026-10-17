# Binary formats: a shape over bits, read and written by the same matching as text

## The question

How Ray declares a binary format (a DEFLATE stream, an x86 instruction, later ELF, Wasm, bytecode) so that one
declaration is its type, its reader and its writer: which notation, where the reading lives, how a decoder of hundreds of
alternatives gets fast, and how writing back stays byte for byte.

## Decided

- "Types are patterns" (§7.1): `|`, `,`, a literal "reads exactly itself", `T[]`; UTF-8 is written as a shape with
  `Binary{length == …}` and `(…) if prefix ⊢₂11`.
- Reading by a structure "works the same way as destructuring … the matcher is language-side" (§7.3); "no per-kind
  matchers" (§1.2).
- `Binary₃₂ = Binary₈[]₄` (§7.4). "Little-endian reads them right-to-left" (§13.1). A shape "prints by running its
  reader backwards" (§7.5).
- The host "never hardcodes words, spellings" (§21.1). Speed comes from "an index of first characters" and "compiled
  walks as a Compiler level" (§21.4). No compressors in the core, but UTF-8 is (§13.2).

## Recommended

- **One notation, §7.1's.** A format is a declared shape:
  `Block := (final: Bit, kind: Binary₂, …)`. A fixed part is a literal (`₂10001001`) or a narrowing
  (`Byte{== 0x89}`). Alternatives are `|`: an x86 instruction is `Add | Sub | …`, each encoding its own shape.
- **No codec.** Bits are a sequence of digits (`Byte[]` flattens to them). A shape matches them exactly as it matches
  text, with the same matcher, in the bootstrap, which needs it for UTF-8 anyway. DEFLATE and x86 stay library projects.
- **Bit order is declared once,** as a shape over the bytes, never in the host: DEFLATE reads each byte from its last
  bit; x86 reads bytes as Intel writes them, so a ModRM byte is `(mod: Binary₂, reg: Binary₃, rm: Binary₃)` in that
  order. (The old proofs reversed every byte and so listed x86's fields backwards.)
- **A Huffman code is a shape built of rules**, one per code (`bits => symbol`), joined by `|`, from fields read before
  it (§7.4).
- **Byte for byte by construction:**
  - a value read keeps the bits it was read from, so an unchanged value writes them back;
  - a part that is neither named nor fixed is an error where the format is declared;
  - a new value is written by running the reading backwards, then read again and compared;
  - bits that read two ways are flagged.
- **Fast by an index, then a table.** The kernel's index of first characters (§21.4) widens to fixed leading digits:
  one lookup finds the one alternative of 358 that can start here. Later a Compiler level makes it a jump table
  (`br_table` in Wasm). Each claims to give the same readings as matching without it.

Confidence: high on notation and place, medium on the index.

## Options weighed

| Option | For | Against |
|---|---|---|
| A host codec (the old proofs, `structures3.ts`) | proven: DEFLATE, 358 XED forms byte for byte | reads syntax in TypeScript, against §21.1; a second matcher; its speed was a TypeScript special case |
| A codec rewritten in Ray | clean host | still a second matcher: every fix made twice |
| **The text matcher reading bits, plus an index (above)** | one matcher; UTF-8 tests it first; text and bits share every fix | slow until the index and the compiled level exist |

## Found on main (e6bcbbb2)

Reading by a shape fails today for text too (DS3 in `String.ray`, and a `Date` probe), so bits wait on that fix, and both
get it at once.

## Deliverables, each its own PR

1. Reading text by a shape (`.entrypoint.ray3`). DS3, `(d: Date = "2026-10").month == 10`. No dependency.
2. `Binary₄` reads exactly 4 digits as their number (`Number.ray`). `"1011"` as `Binary₄` is 11. Feeds NE40. After 1.
3. A span read from its other end (`Ray.ray`), once the owner answers the notation. NE47. After 2.
4. Writing by running the reading backwards, and the error for unnamed parts. After 3.
5. Literals, `(…) if`, `|`, lengths from fields read before: §7.1's UTF-8 read and written back. After 4.
6. Shapes given fields read before them; a shape of rules (a Huffman code). NE48. After 5 and `Records.md`.
7. The index on fixed leading digits (kernel, generic). 256 alternatives read in budget; same readings with and
   without it. After 5.
8. DEFLATE back, in this notation: its RFC cases, then its 22 streams. After 6 and 7.
9. x86 back, its 358 forms generated from XED again, read and written byte for byte. After 7 and `Numbers.md`.
10. The compiled level: the same readings, timed against the old 0.03 to 91 s a stream. After 8.

## For the owner

- In a shape, does `<-T` mean look-behind (§4.2) or "read right to left" (§13.1)?
- Does a value read keep the bits it was read from?
- How is byte alignment written: with a position, or with the `Byte` boundaries still there in the flattened bits?
