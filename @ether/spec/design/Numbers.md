# Numbers, bits and machine widths

## The question

How Ray holds numbers below zero, a number's bits at a width, base 16, bitwise operations and machine widths
(wrapping, a signed reading of bits), exactly, while machine code computes in 32 and 64 bits.

## Decided

- "No overflow. `u8 + u8` is a wider number … unless `.mod` or `.saturate` is written; wrapping belongs to a target
  language's level" (§12.1). `u8 = Binary₈`, `i8 = Binary₈.Signed`, `₂101₈`.
- "Native speed comes only from optimization levels" (§12.1); numbers are "mapped to native integers only by a removable
  level" (§21.2).
- Bitwise operations work "through the String/Binary isomorphism" (§12.1). "Leading zeros are equivalent; a fixed-width
  type keeps them when printing" (§8).

## Recommended: one design, §12.1 made precise

- **A number is exact and unbounded, and goes below zero.** `2 - 5 == -3`. (Today `2 - 5 == 0`, by N5.)
- **A width is a shape of numbers, a range:** `u32` is `0 <= . < 2^32`, `i32` is `-2^31 <= . < 2^31`, and
  `Binary₈.Signed` is two's complement, as every machine and C use.
- **Wrapping and reading bits as signed are one rule:** `.mod` into a width is `low + (n - low) % count` (floor
  modulo). With the width declared:
  - `sum: i32 = (2147483647 + 1).mod` is `-2147483648`;
  - `word: i32 = 0xfffffff8.mod` is `-8`;
  - `bits: u32 = (-8).mod` is `0xfffffff8`.

  This replaces the old proofs' `wrapped Int32`, `X86.signed` and `hex_at` with one rule.
- **Text and bits are conversions to a base:** `bits: Binary₄ = 5` writes as `0101`; `n: Binary = "1011"` is 11;
  `hex: Hexadecimal = 255` writes as `ff`.
- **Bitwise operations and shifts** are on bits: `12 ~&& 10 == 8`; a shift of a `Binary` moves binary digits (a
  shift of a decimal number would move decimal digits, so a machine's shift lifts as `* 2 ^ n`).
- **Speed stays exact.** A lifted program writes `.mod` where the machine wraps; where ranges prove no overflow, an
  equivalence removes it, back to the C source. A removable level turns `.mod` into `u32` on declared operands into a
  native 32-bit operation, and that is an exact equivalence, checked.

Confidence: high on the structure, medium on the spellings.

## Options weighed

| Option | For | Against |
|---|---|---|
| The old proofs: `Int32` fields, `wrapped` rules, a host operation per need | it ran | several designs at once; wrapping hidden in the host |
| **One design (above)** | one arithmetic; wrapping visible where it happens | signed numbers in the bootstrap; typed levels for speed |
| Bit vectors as primitives (LLVM's `iN`: `+` wraps) | lifting is trivial | `+` means two things, against "no overflow" |

## Found on main (e6bcbbb2)

None of `Number.ray`'s bits code runs yet: no number base is ever made (`"0".."2"` runs out of memory), and operators
written as values (`Number.ray`, line 21) are not read. Only `12.digits(2)` and `2 - 5 == 0` hold.

## Deliverables, each its own PR

1. The checks in `poc/needs/` respelled with declarations (NE5, 27, 40, 43 to 46). After the owner's answers.
2. Numbers below zero, floor `%` (`Number.ray`). `2 - 5 == -3`, `-7 % 3 == 2`. NE26. After the bases are made.
3. Widths `u{n}`, `i{n}` as ranges. `255 is u8`, `!(256 is u8)`, `-128 is i8`. After 2.
4. `.mod` and `.saturate` into a declared width. NE27, NE44. After 3.
5. A width's text keeps its leading zeros. NE5, NE40, NE43. After 3.
6. Bitwise operations and shifts. NE45, NE46. After operators as values are read.
7. Bitwise on signed numbers, through `.mod` into `u{n}`. After 4 and 6.
8. Exact numbers past 2^31 in the host's map (`wasm.o.ray`). `(2 ^ 40 + 1) - 2 ^ 40 == 1`.
9. The native width level: the same answers with it and without it. After 4 to 8.

## For the owner

1. May `2 - 5` answer `-3`? The floor at zero then becomes `.saturate`.
2. Is `Binary₈.Signed` two's complement (-128 to 127)?
3. Does `Binary₃₂` admit 255 (§8)? Proposed: as a value yes, as a reading exactly 32 digits.
4. "Integer parts are bounded by default" (§12.1) against "no overflow": bounded by what?
5. May the host's map hold exact numbers past 2^31, and may bitwise operations be among its externals, or must they be
   rewrites?
