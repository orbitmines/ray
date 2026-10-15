# Language choices

What the DEFLATE, interop and machine code proofs (PR #20) needed from the language that main does not do today. Each is a
choice for the language, whichever kernel runs it, not a fix: what it is, why the proofs need it, the alternative, and a
recommendation. Decided ones move to `Design.md`.

| # | Choice | Recommended |
|---|---|---|
| C1 | Machine integers | library types over exact integers |
| C2 | `==` on lists | by what they hold |
| C3 | `x as T` | `T.from`, then `T`'s pattern, then `T`'s header |
| C4 | Binary formats | class headers read and written as bits |
| C5 | Statics | made on first read, kept by the kernel |
| C6 | An assert in a block read again | tested once |
| C7 | Bits where their length counts | text, `"010"` |
| C8 | `*` on text and lists | repeats |

## C1 Machine integers

- **What.** `Int8` to `Int64` and `Natural8` to `Natural64` as library classes: `((a - b) as Int32)` is exact and `None` outside
  the type, `(… wrapped Int32)` wraps. Under them, exact integers of any size.
- **Why.** Machine code computes in fixed widths that wrap. Today whole-number `-` stops at 0 (`2 - 5` is 0) and numbers are
  exact only to 2^53, which 64-bit code passes.
- **Else.** Signed integers in `Number` itself; or host doubles, as now.
- **Recommended.** Exact integers in the kernel (`2 - 5 == -3`, BigInt), widths as library types (`poc/interop/ints.ray`).

## C2 `==` on lists

- **What.** Two lists are equal when their values are, in order; `===` stays identity.
- **Why.** Every codec claim compares byte lists (`bytes == [0x1f, 0x8b]`).
- **Else.** Identity only, with a `same_values` method.
- **Recommended.** By values. Cost: `==` of two objects asks whether both are lists; a kernel can answer that without a read.

## C3 `x as T`

- **What.** `x as T` is `x` when it is a `T`; else `T.from(x)`; else `x` read by `T`'s pattern (text); else by `T`'s
  header (bits). This is how `bytes as Deflate.Stream` reads a stream.
- **Why.** One declaration is the type, the parser and the writer: no separate `parse` per format.
- **Else.** Only `T.from`; reading by a separate `T.read`.
- **Recommended.** Keep, only for a class that has a pattern or a header, so a failing `as` costs nothing more elsewhere.

## C4 Binary formats as class headers

- **What.** `class (fields) {…}` with widths (`<-Byte{== 8}`, `<-Binary₃`), conditional groups, alternatives and generics
  (`class<P> (…)`), read and written as bits by one codec.
- **Why.** It is what reading compiler output rests on (Almanac 1b): x86 (also made from Intel's XED), DEFLATE, ELF next.
- **Else.** A parser per format, written as code.
- **Recommended.** Adopt the syntax. Open: whether the codec is in the kernel or a library it loads, and that a decoder is
  compiled from the header (a table), not searched (`Kernel.md`, requirement 7).

## C5 Statics

- **What.** `static x := …` is made when first read and kept.
- **Why.** Tables (`X86.Registers`, DEFLATE's code lengths) were made again on every read.
- **Else.** Made when the class is made (eager).
- **Recommended.** The kernel keeps a static's value itself. Today it is kept under a name (`x_kept`) a program could collide
  with, and an initialiser that answers `None` is run again.

## C6 An assert in a block read again

- **What.** A block read a second time (an instance, a loop body) does not run its asserts again.
- **Why.** A list of 200 appends ran its tests 200 times.
- **Else.** An assert is a check on every pass.
- **Recommended.** An assert in a declaration is tested once; a check meant for every pass is written as one (`dynamically
  assert`, as `WebSocket.ray` does).

## C7 Bits where their length counts

- **What.** `0b101` is the number 5, as on main; a code whose length matters (a Huffman code `010`) is written as text.
- **Why.** `0b010` and `0b10` are the same number but different codes.
- **Else.** A `Bits` value of its own, with a length.
- **Recommended.** As now; a `Bits` type later if text proves awkward.

## C8 `*` on text and lists

- **What.** `"ab" * 2 == "abab"`, `[0] * 3 == [0, 0, 0]`.
- **Why.** Padding and fixed-size buffers (`[0] * 256`) in the codec and the tests.
- **Else.** A `repeated(n)` method only.
- **Recommended.** Keep.

## Not choices

What main's tests found when these were tried (17 asserts that pass on main fail with them) is in `Machine.md`, "For main to
decide"; those are fixes, made in the PRs that bring each choice. What a kernel must do regardless (fail loudly, read code
once, values released when unreachable, grouping as written) is in `Kernel.md`.
