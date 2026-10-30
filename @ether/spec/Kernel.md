# What a kernel needs

Findings from running real programs (a DEFLATE decoder, C and Python read into Ray, gcc's machine code read, lifted and
compiled back, x86 declared from Intel's XED) on the kernel main had before its self-hosting one, branch
`proposal/machine-code`; and how each stands on the self-hosting kernel (main at f7602d0f, which loads only
`ray/bootstrap`). Each requirement names how to check it; the checks that need the full library wait until it loads.

## Findings

1. **Memory is held until the end.** Before: a table from token to value kept every value of a run (one stream decoded
   by the lifted `inflate`: 24 GB, 38 minutes). Now: values live in one heap (1 GB by default) that only grows and is given
   back when a test ends.
2. **Code is read again.** Before: `f3` (`(n + 1) * x`) ran 17 times a second. Now: about 5 calls a second, interpreted
   or built to wasm (`--build`); the bootstrap reads in about a quarter of a second. The machine code Ray compiles from the
   same meaning runs 765 million times a second.
3. **Some mistakes still answer instead of failing.** In a test, an unknown name, member or call is now an error. Still:
   - an unclosed `{` swallows what follows it without a message (an unclosed `(` is an error);
   - a top-level read of an unknown name is silently a place (as `Design.md` §10.1 decides), so a misspelling outside a
     test is not reported;
   - a value of the wrong type reports "nothing reads `empty`", not the type.
4. **Grouping.** Fixed: `3 % 8 == 3`; a conversion in an argument needs no brackets. New: arithmetic reads left to right,
   `1 + 2 * 3 == 9`.
5. **Numbers.** By design (`Number.ray`, N5) subtraction stops at 0 (`2 - 5 == 0`), and numerals of more than one digit
   do not read yet (`10`). Machine code subtracts below zero and wraps at its width.
6. **Choosing among many alternatives.** Before: reading x86 tried each of 358 forms in order. Now: cannot be checked
   until the codec and x86 load; `Design.md` §7.3 and §21.4 index rules by their first text.

## Requirements

1. **Memory given back while a run goes on**, not only when a test ends.
   Check: MC10c (`poc/machine/run.sh MC10c`, all 29 streams) in one process, in memory that does not grow with the run.
2. **Fast enough to run the proofs.** Check: `f3` at least 10^4 calls a second.
3. **Fail loudly at the place.** An unclosed bracket of any kind is an error; a wrong type names the type it expected.
   Check: the cases of finding 3.
4. **Grouping as written.** Multiplication before addition. Check: `1 + 2 * 3 == 7`.
5. **Integers below zero and at a width**, as library types (`Design.md` §12.1: `i32`, `u64`, `.mod`), and numerals of
   any length. Check: `10 - 15` is `-5` as a signed type; `(2^63 - 1) + 1` at `i64` with `.mod` is `-2^63`.
6. **Declarations compile.** A header's fixed bits chosen by table, not by trying each alternative.
   Check: a function reads in under a second with the 358 forms XED gives.

## How to check a kernel

The proofs' suites exist and each claim is checked by something that is not Ray (gcc, objdump, gas, zlib, python3, native
runs): `poc/quick.sh`, `poc/deflate/run.sh`, `poc/interop/run.sh`, `poc/machine/run.sh MC1` to `MC10d`, on branch
`proposal/machine-code`. They run on the earlier kernel today, and become the self-hosting kernel's targets as its
library grows.
