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
- **Pass.** `./run.sh DP1` rebuilds the corpus and `diff`s it with `manifest.txt`; the coverage line shows block kinds 0, 1
  and 2, all 29 length codes and all 30 distance codes.

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

## Engine work

What language3 needs before `Deflate.ray` runs, found by probing it on 2026-10-10 (runner `poc/deflate/run.mts`, which
reads the core library in dependency order and checks claims strictly):

- **The host's numbers lose to the library's.** `Number.ray` defines `Digit := class: String` and `0 := zero`, so once the
  library is read, `[3, 3, 2].count == 3` no longer holds: a numeral's typed hole `{digit: Digit}` reads with the
  library's `Digit`. The runner reads `js3.kinds.ray` again after the library (`KINDS_AFTER`, as `site3.mts` can), so the
  host's numerals and operators are the latest.
- **Lists.** `==` on two lists compares identity, not elements; `x{…}` on a list is a narrowing, not the list of what
  holds; `.map(. + 1)` passes `. + 1` read once, not a function. Without the library `count`, indexing and `--` work.
- **Defining `Deflate` overflows the stack.** One member does: `Stored`, whose header begins with an unnamed piece. Every
  other member defines.
- **Header forms the entrypoint has no rule for.** `class lengths: Decimal[] { … }` (fields without brackets) and headers
  with unnamed pieces, conditional groups (`(x: T) if c`) and alternatives.

How a header of bits is read and written on language3:

- **The host reads and writes bits; the declaration says what they are.** A class whose header has a piece that is not a
  plain parameter (an unnamed piece, a conditional group) is a structure. Reading one walks its pieces over a sequence of
  bits; writing one walks them over a value. Every type, narrowing, condition and default is the declaration's, read in
  Ray with the fields read so far; the host only moves bits. Nothing in the host knows DEFLATE.
- **A fixed width is a host type.** `Binary₅` reads 5 bits, most significant first; `<-Binary₅` the same 5 bits least
  significant first; `Byte` is `Binary₈`. A narrowing `{length == n}` gives a `Binary` its width; any other narrowing of
  `length` is tried at each width from 0 up.
- **A bit sequence is text of `0` and `1`** (`0b010` is `"010"`): it keeps its length, joins with `+` and compares with
  `==`, as the host already does for text.
- **Declaration changes are commits of their own, each with its reason.** A helper written in a form the engine does not
  read (a section `. + 1`, a class without brackets) is rewritten in a form it does (`x => x + 1`, `class (…) => { … }`);
  a header is changed only where it says something the engine cannot do both ways (DP4 needs every type to write what it
  reads).

## Engine gaps

A step blocked by the engine adds an entry here: the step, the probe file, its output, and what the engine would need.

- **DPG1 `Deflate.ray` does not run.** See Baseline and Engine work. Split by DP0's probes into the features behind it.

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
