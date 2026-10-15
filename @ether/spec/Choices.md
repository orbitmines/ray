# Language choices

What the DEFLATE, interop and machine code proofs (PR #20) need from the language that `Design.md` leaves open. Statics
made on first read and kept (§9.1), an assert in a body tested once (§9.1, §21.5), `==` structural (§8), `*` repeating
(§11) and fixed-width bits (§12.1) are decided there and need nothing here.

## C1 Names of the machine integers

- **What.** The proofs use `Int8` to `Int64`, `Natural8` to `Natural64`, `(… wrapped Int32)` and `((a - b) as Int32)`
  (exact, `None` outside the type). `Design.md` §12.1 has no overflow in `Number`, wrapping at a target's level, `.mod` and
  `.saturate`, and `u8 = Binary₈`, `i8 = Binary₈.Signed`.
- **Proposed.** The proofs move to §12.1's names (`i32`, `u64`, `.mod`), and a signed `-` comes in the bootstrap (today
  `2 - 5 == 0`), since machine code subtracts below zero everywhere.

## C2 `x as T` falling back to reading

- **What.** In the proofs, `x as T` is `x` when it is a `T`; else `T.from(x)`; else `x` read by `T`'s pattern (text); else
  by `T`'s header (bits). That is how `bytes as Deflate.Stream` reads a stream with no parser written. The bootstrap has
  `(. is type) ? . : type.from(.)` (`.entrypoint.ray3`); §7.3 and §7.5 describe reading text by a structure.
- **Proposed.** `as` reads by the type's pattern or header when it has one and no `from`, so a declaration is its own
  parser and writer. Only for a class with a pattern or a header, so a failing `as` costs nothing elsewhere.

## C3 Binary formats as class headers

- **What.** The proofs declare formats as class headers read and written as bits by one codec (`structures3.ts`):
  `<-Byte{== 8}`, `<-Binary₃`, conditional groups, alternatives, generics (`class<P> (…)`). x86 (also made from Intel's XED)
  and DEFLATE rest on it. §7.1 writes UTF-8 the same way in its own notation (`Binary{length == …}`, `(…) if prefix ⊢₂11`).
- **Proposed.** One notation: the proofs move to §7.1's. Open: whether the codec is in the kernel or a library it loads
  (§13.2 keeps compressors out of the core; a codec is not one), and that a decoder is compiled from a header into a table,
  not searched (`Kernel.md`, requirement 7).

## Noted, not choices

- An assert put off until everything is read sees final values (in a loop, the last pass); a check for every pass is
  written `ensure` or `dynamically`. Worth one line in `Design.md`.
- `2 === 2` is true on the bootstrap (digits are single globals), where §8 says it is false.
