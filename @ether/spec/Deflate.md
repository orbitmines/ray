# DEFLATE proof: one declaration reads and writes a real format

The claim under test: a Ray class declaration of a format is its type, its parser and its writer at once, in both
directions. `$/deflate/Deflate.ray` (136 lines) declares RFC 1951 that way. Its class headers read a stream, and the
defaults on their fields (`size: <-Binary₁₆ = bytes.count`) write one. This POC makes that claim pass or fail on bytes
made by zlib, the format's reference implementation.

Every item is **Q** (needs your decision) unless it is under **Decided**. IDs `DP…`.

Why DEFLATE:

- **It is the hard case for a declarative format.** Fields are bits, packed least significant bit first. The Huffman codes
  that decode the data are themselves read from the stream before it (`Data<literals, distances>`). Copies reach back
  across blocks and may overlap what they write. The zlib and gzip wrappers end in checksums over all of the data.
- **The closest tools do not declare it.** Kaitai Struct (`process: zlib`) and Construct (`Compressed(…, "zlib")`) hand
  DEFLATE to a zlib library. DP8 checks this and compares.
- **It is on the path.** `$.png` reads through `$/zlib` and `$/deflate` (Frontend.md), and machine code, the next binary
  format (DP9, and C1 of `Interop.md` on `proposal/interop-poc`), is read by the same mechanism.

---

## Principles

- **One declaration.** Nothing in the POC reads or writes DEFLATE except `$/deflate/Deflate.ray` (and `$/zlib/Zlib.ray`,
  `$/gzip/Gzip.ray` in DP7). A wrong declaration is fixed there, one commit per fix. There is no second reader, no
  writer beside the declaration, and no TS decoder.
- **The engine is language3** (`v0.ts/src/language3.ts` with `ray/.entrypoint.ray2`), run through a strict claim runner
  like `poc/interop/run.mts`: a claim holds only when its condition answers the `true` node, so a condition the engine
  leaves unread fails. A step the engine cannot do stops, and the gap is recorded under **Engine gaps** with its probe.
- **zlib is the oracle.** python3's `zlib` makes the corpus and checks what Ray writes. A step passes on a `diff` or
  `cmp`, never on prose.

## Scope

- **In:** raw RFC 1951 streams with all three block kinds (stored, fixed, dynamic); reading, writing back what was read,
  writing new data, rejecting malformed streams; the zlib (RFC 1950) and gzip (RFC 1952) wrappers in DP7.
- **Out:** compression ratio (the writer has to be correct, not good; `parsed` is a brute-force LZ77 and stays one);
  speed as a gate (it is measured in DP8); preset dictionaries; gzip files of more than one member beyond a single
  claim.

## Layout

All POC files live in `@ether/poc/deflate/`:

| File | Role |
|---|---|
| `README.md` | The walkthrough: one section per step, in order |
| `run.sh` | `./run.sh <STEP>` runs one step, e.g. `./run.sh DP4` |
| `run.mts` | The strict claim runner; boots language3, the core library and `$/deflate` |
| `make.py` | Builds the corpus with python3's `zlib` |
| `inputs/` | Small pinned inputs, committed |
| `corpus/` | The streams `make.py` writes, committed with `manifest.txt` so the corpus does not move with the zlib version |
| `bad/` | Malformed streams for DP6, each with the bit offset where reading must stop |
| `dp0.ray` … `dp7.ray` | Claims per step |
| `out/` | What Ray reads and writes; ignored by git |

Each step in `README.md` has the five parts of Interop.md IOP2 (goal, what happens, why it matters, command, pass), and
each step is one commit.

## Baseline

Measured 2026-10-10 on main (`373672c9`), and on the `proposal/interop-poc` kernel with the same result. With
`Deflate.ray` loaded through the strict runner:

- DF1 (the Huffman example of RFC 1951 §3.2.2) answers `undefined`.
- DF3 (a stored block) throws `Maximum call stack size exceeded` at node's default stack.
- With `--stack-size=20000` node dies with a segmentation fault.

No DF claim passes. DP0 starts here.

## Steps

### DP0 Engine probes

- **Goal.** Know which features of the declaration the engine reads, one at a time.
- **What happens.** `dp0.ray` has one small claim per feature `Deflate.ray` uses, each on a toy format of a few bits, not
  on DEFLATE:
  - DP0.1 a fixed-width bit field `Binary₂`, and the same field reversed, `<-Binary₂`
  - DP0.2 a narrowed field in a header, `Binary₂{< 3}`
  - DP0.3 alternatives in a header, `(a: …) | (b: …)`
  - DP0.4 repetition `(…)[]`, with a length tied to an earlier field, `{length == size}`
  - DP0.5 a conditional piece, `(x: T) if kind == 0`
  - DP0.6 a class parameter read from earlier data, `class<code: Huffman>`, used as `Data<literals, distances>`
  - DP0.7 the byte boundary piece, `Binary{length < 8 && (at + length) % 8 == 0}`
  - DP0.8 a default that computes a field when writing, `size: <-Binary₁₆ = bytes.count`
  - DP0.9 a value written back to bits, `x as Binary`
  - DP0.10 `Language.read` and `Language.write` through `level` and `written`
- **Why it matters.** The declaration uses all ten at once, so a failure in DEFLATE does not say which one is missing.
- **Pass.** `./run.sh DP0` prints `ok` for DP0.1 to DP0.10. Each probe that fails is entered under Engine gaps before
  work on it starts.

### DP1 Oracle and corpus

- **Goal.** Fix the streams every later step is checked against.
- **What happens.** `make.py` compresses each file in `inputs/` with python3's `zlib.compressobj` as raw DEFLATE
  (`wbits=-15`), at levels 0, 1, 6 and 9 and with the strategies default, `Z_FILTERED`, `Z_HUFFMAN_ONLY`, `Z_RLE` and
  `Z_FIXED`, drops identical streams, and writes `corpus/<input>.<level>.<strategy>.deflate` and `manifest.txt` (name,
  size, SHA-256 of the stream and of its inflated bytes). It also reports coverage: which block kinds, length codes
  (257 to 285) and distance codes (0 to 29) occur.
- **Inputs.** Empty; one byte; `hello`; `ray ` 64 times (DF7); 300 equal bytes (length 258, overlapping copies); a few
  KB of English text (dynamic blocks); a few KB of random bytes (stored blocks). Large inputs, such as a copy that
  reaches 32768 back or a stored block of 65535 bytes, go in `corpus/large/`, used only in DP8 (DQ1).
- **Why it matters.** Streams Ray did not make are the only fair test of a reader. zlib's choices (block boundaries,
  code-length runs, `HCLEN` below 15) are ones the declaration never chose.
- **Pass.** `./run.sh DP1` rebuilds the corpus with python3's `zlib` and finds it equal to `manifest.txt`, and zlib inflates
  each stream to its input. Which block kinds and codes the corpus holds is what Ray reads in DP3 (a second reader to count
  them would break DP0's one declaration); the small tier holds stored, fixed and dynamic blocks.

### DP2 Read the RFC's own cases

- **Goal.** The examples the RFC gives read as the RFC says.
- **What happens.** The existing claims in `$/deflate/tests/deflate.ray`: DF1 (the code lengths of §3.2.2 give its
  codes), DF2 (the fixed codes of §3.2.6), DF3 (a stored block), DF4 (an empty fixed block), DF5 (a literal with the
  fixed codes), DF6 (a copy that overlaps what it writes).
- **Pass.** `./run.sh DP2` prints `ok` for DF1 to DF6 on the strict runner.

### DP3 Read the corpus

- **Goal.** Every stream zlib made reads to the bytes zlib inflates it to.
- **What happens.** For each corpus stream the runner reads `Deflate.read(bytes)` and writes the result to
  `out/read/<name>`.
- **Why it matters.** This is the first contact with dynamic Huffman tables, code-length runs (16, 17, 18) and copies
  across blocks.
- **Pass.** `./run.sh DP3`: for every stream, `out/read/<name>` has the inflated SHA-256 in `manifest.txt`.

### DP4 Write back what was read

- **Goal.** A stream read into Ray is written back byte for byte.
- **What happens.** For each corpus stream the runner reads a `Deflate.Stream`, writes that same value as bytes
  (`stream as Byte[]`) to `out/rewritten/<name>`, and `cmp`s it with the original.
- **Why it matters.** This is the claim. The same declaration runs the other way, with no writer code. A `Stream` holds
  every choice zlib made (block boundaries and kinds, code lengths and their run-length entries, every literal and
  copy), so writing it has to give zlib's bits back. A mismatch means the declaration drops information.
- **Known risk.** The alignment piece in `Stored` and the final padding in `Stream` are unnamed, so they are written as
  zeros. zlib writes zeros, so the corpus passes; a valid stream with other padding bits would not (DQ2).
- **Pass.** `./run.sh DP4`: `cmp` succeeds for every stream.

### DP5 Write new data

- **Goal.** Data Ray writes from nothing inflates correctly in zlib.
- **What happens.** `Deflate.write(input)` for each input, three ways: stored blocks only (`blocked`), with fixed codes,
  and with dynamic codes (`Optimizations`). Each is written to `out/written/` and inflated by python3's `zlib`.
- **Why it matters.** Here the defaults compute the fields: `LEN` and `NLEN`, `HLIT`, `HDIST`, `HCLEN`, the code-length
  code and its order. They have to agree with what follows them, which is where tools that build in both directions
  usually give up.
- **Pass.** `./run.sh DP5`: zlib inflates every written stream to its input; Ray reads its own output to the input; DF7
  and DF8 print `ok`. Sizes are recorded, not compared.

### DP6 Reject, and say where

- **Goal.** A malformed stream answers no instance, and the runner reports the bit where reading stopped.
- **What happens.** `bad/` holds hand-built streams, each zlib also rejects, each with its expected stop offset: `BTYPE`
  3; `NLEN` not the complement of `LEN`; a copy reaching before the start of the output; over-subscribed code lengths;
  incomplete code lengths (DQ5); a repeat code 16 with no length before it; a stream that ends before its final block;
  literal/length symbol 286 under the fixed codes.
- **Why it matters.** A declaration that accepts what zlib rejects is wrong in a way DP3 cannot see. And a format tool
  that only answers "no" hides its own bugs, the silent failure the strict runner exists for.
- **Pass.** `./run.sh DP6`: every bad stream answers `None`, python3's `zlib` raises on it, and the stop offset the runner
  prints equals the one in `bad/manifest.txt` (DQ3).

### DP7 Wrappers whose checksums cover everything

- **Goal.** zlib and gzip files read, write back byte for byte, and are written new, with their checksums.
- **What happens.** `make.py` also wraps the small corpus as zlib (`wbits=15`) and gzip (`gzip -n`). The DP3, DP4 and DP5
  checks run again through `$.zlib` and `$.gzip`; written gzip files are checked with `gzip -t`.
- **Why it matters.** Adler-32 and CRC-32 depend on all of the data. In the declaration they are a default,
  `adler: Binary₃₂ = adler32(inflated)`, so writing computes them, and reading checks them (`dynamically assert`). That
  answers a field that depends on everything after it with a declaration, not with writer code.
- **Pass.** `./run.sh DP7`: reads match, rewrites `cmp` equal, `gzip -t` and python3's `zlib` accept every new file, and
  DF9 prints `ok`.

### DP8 Measure and compare

- **Goal.** State the cost of one declaration, next to the tools it competes with.
- **What happens.** `README.md` gets a table for Ray, Kaitai Struct and Construct: the lines it takes to declare DEFLATE;
  whether DEFLATE is declared or handed to zlib; whether reading and writing are one declaration or two; read speed on
  `corpus/large/` next to python3's `zlib`. Each number carries the commit and date it was measured at.
- **Why it matters.** The claim is "one declaration, both ways, at this cost". The cost has to be known.
- **Pass.** Every cell is filled from a run, not from documentation, except where a tool cannot express the format, which
  the cell says. No speed gate (DQ4).

## After the proof: machine code

### DP9 Read and write x86-64 encodings

- **Goal.** The same mechanism reads gcc's output for `add` and writes it back.
- **What happens.** A declaration of the few x86-64 encodings involved (opcode, ModRM, SIB) reads gcc `-O2`'s bytes for
  `int add(int a, int b) { return a + b; }`, `8d 04 37 c3` (`lea eax, [rdi+rsi*1]`, `ret`), and writes them back.
- **Why it matters.** This is the reading step of Interop.md C1 and the first piece of the Almanac's (1b): decompiling
  the backends compilers already target. Machine code is one more binary format.
- **Not in this proof.** Built only after DP7 passes.

## Status

On 2026-10-11, on language3, through `Deflate.ray`:

- **DP0** 17 claims, **DP2** DF1 to DF6: pass.
- **DP1**: 22 streams from 7 pinned inputs (zlib 1.3.2), stored, fixed and dynamic blocks.
- **DP3**: every one of the 22 read to what zlib inflates it to (0.03 s to 91 s a stream).
- **DP4**: every one written back byte for byte from the value read, by the same declaration.
- **DP5**: DF7 and DF8 pass (`"ray " * 64`, 256 bytes, is written in 8); each input written so zlib, and Ray, read it back.
  The writer chooses stored blocks or one fixed-code block; dynamic codes (`fitted`) are not ported yet.

`./run.sh DP0` to `./run.sh DP5` in `@ether/poc/deflate` (each corpus stream in a process of its own). DP6, DP7 and DP8
are next.

Against the branch's base (`373672c9`), the language's own tests in `ray/tests/app` (control, types, grammar,
precedence, boolean, rewrite, string, ray, number) pass more claims with these changes, and lose none (measured with
`STEPS=300000`; the newer upstream main differs on its own).

## Engine work

What was fixed in language3 to get here, each found by a probe:

- **`if a > b { … }`.** The `elsif` chain rule took `>` as a block. A body is no longer code that begins with an operator
  and a space, a hole does not end in a dangling operator (`1 >`), the chain rules need the word `elsif` and are defined
  after `else`.
- **Arguments of a method read on a number or text** (`3.binary(width)` in a call) were read at the outermost node, so a
  call's own names were not seen; and after a chain passed through text (`a.binary.count < b.binary.count`), the node
  before the text was taken for where the code was written. They are read where they were written.
- **`Name<a: T>` in a header.** A hole no longer ends inside what follows a `<` written right after a word.
- **A host rule's body hole** (`plain { … }`) was run as code before the host saw it. It is given as text only.
- **Numerals** read through plain nodes (`Numeral`, `Numerals`), not classes, so the library's own `Digit` does not take
  them; `0x…` is a host number, `0b…` host bits. Lists compare by value (`alike`), repeat (`xs * n`), and have `sort_by`,
  `flatten`, `slice`, `join`, `index_of`.
- **Headers the library writes** read as classes: `class (h) { … }` without `=>`, `class byte: Byte`, a header over
  several lines, `class<code: Huffman> (…)`.

How a header of bits is read and written:

- **The host moves bits; the declaration says what they are** (`v0.ts/src/structures3.ts`). A class whose header has a
  piece that is not a parameter (an unnamed piece, a condition, a type of bits) is made by the host: its maker takes the
  named pieces, a default is a rule read when its field is first read, and the header is kept as `structure`.
  `T.bits_read(bits)` reads one, `x.binary` writes one. Every type, narrowing, condition and default is read in Ray with
  the fields read so far; nothing in the host knows DEFLATE.
- **Widths.** `Binary₅` reads 5 bits, most significant first; `<-Binary₅` least significant first; `Byte` is `Binary₈`. A
  narrowing `{length == n}` gives a `Binary` its width; any other narrowing of `length` or `at` is tried at each width.
- **Lists** read lazily: as few elements as let the rest of the header, and the list's narrowing, read.
- **Alternatives** read as a record holding every alternative's named pieces, each not read `None`; written, the first
  alternative whose named pieces the record holds.
- **A prefix code** is `Coded(table)`: read by the bits that come next, written by the symbol.
- **Bits are text of `0` and `1`** (`0b010` is `"010"`).

What `Deflate.ray` changed to run, each for a gap below: names of the enclosing class written in full
(`Deflate.LengthBases`), `Copy`'s header in brackets, `Symbol => Coded(codes)` (the original reads but cannot write),
helpers in loops and bracketed closures instead of sections and `reduce`, `65535` for `2 ^ 16 - 1`, `.first`/`.last` for
`.0`/`.1`, `&&` for chained comparisons, brackets around arithmetic compared and the code lengths' narrowing written
`(hlit + 257 + hdist + 1) == values.count`, `Stream.from(bytes)` and `written` for the `as` conversions, the stream's
narrowing `{!.empty && .last.final}`, `inflated`/`deflated` for `read`/`write`, `coded` making an `Element` (a class) for a
record of five fields, locals named apart from the library's (`stored_stream`), and `deflated` choosing between stored blocks and one fixed-code block in place of the
`Optimizations` level. `parsed` finds each match with the host's text search (`last_index_of`), the matching loop in Ray.
The dynamic writer (`fitted`, `dynamic`) is not ported yet.

## Engine gaps

A step blocked by the engine adds an entry here: the step, the probe file, its output, and what the engine would need.

- **DPG1 A class does not see the names of the class it is written in.** `Outer.Inner(1).m` with `m => k` answers `"k"`:
  an interior's outer is its parent class, not where it was written. `Deflate.ray` writes `Deflate.` before them.
- **DPG2 `x as T` is the library's.** With the library read, `"1001" as Pair` answers what one of the `as (=== T)`
  methods the library gives `Node` makes of it, not the entrypoint's `as` (`T.from`, then the header): type-directed `as`
  does not run. The reader is called as `T.bits_read(bits)`.
- **DPG3 Operators read on a value take the rest of the statement.** `3 % 8 == 0` is `3 % (8 == 0)`; arithmetic compared
  needs brackets.
- **DPG4 `,` is the loosest rule**, so a header without brackets of more than one field (`class a: T, b: U`) is read as a
  list.
- **DPG5 A name not given reads as its own text, which is true.** `None.final` is `"final"`, so a narrowing on a member
  of `None` holds; written `!.empty && …` instead.
- **DPG6 `Language.read`/`write` do not run** (`Compiler.reduced`, levels, a typed hole converting a value), and `X.read` is
  also the access keyword (`{who: Character}.read`, `Access.ray`). The proof calls `Deflate.inflated`/`deflated`.
- **DPG7 Sections and `reduce` with `.`.** `.map(. + 1)` passes a value, not a function; in `x -- f()`, `.` is not `x`.
- **DPG8 `^` is highlighting** (`2 ^ 16` is `2`), and `x.0` does not read.
- **DPG9 A method of a host number is reached through the numeral rule** (`{number: Number}` reads `half` as a member of
  `Number`), so a typed hole reads a type's method names: the library's `{uuid: UUID.String}` reads `bytes`. The runner
  places the host's rules after the library's when it reads them again.
- **DPG10 A record literal of four or more fields** gives its first field a list: `(a: 1, b: 2, c: 3, d: 4).a`.
- **DPG11 A host rule shadows a method of the same name for every value**: a host `slice({from}, {to})` for text read
  `bytes.slice(…)` on a list whole and answered nothing; the host's text operation is `substring`.

## Decided

Answers from 2026-10-10:

- This proof is the first step toward the interop vision, not a replacement for it: DP9 leads into Interop.md C1.
- DQ1 to DQ6 as recommended: a small corpus tier for DP3 to DP7 and a large one only in DP8; the padding pieces named,
  so DP4 holds for every valid stream; the bit where reading stopped reported (an engine gap until it can be); speed
  measured, not gated; incomplete Huffman codes rejected as zlib does; branched from main, interop kernel changes taken
  only when a probe needs them.
- The engine is language3, fixed until `Deflate.ray` runs on it, not a new interpreter beside it, even though that takes
  longer than a day. Kernel changes are commits of their own.

## Order of work

DP0, DP1, DP2, DP3, DP4, DP5, DP6, DP7, DP8. DP9 waits for DP7.
