# Machine code proof: what a compiler emits, read into Ray and written as another language

The Almanac's (1b): instead of a backend per compiler, read the backends compilers already target, "where assembly is
just valid syntax in the new language", then bring the low level up by program equivalences. And (1c): through that, a
function written in one language is used from another. This proof joins the two branches before it:

- `Deflate.md` (`proposal/deflate-proof`): one class declaration reads and writes a real binary format, both ways.
- `Interop.md` (`proposal/interop-poc`): C and Python source read to one normal form in Ray; Rust and C written from it.

Here the C source is not read at all. gcc compiles the interop corpus; Ray reads gcc's x86-64 bytes with a declaration
of the instructions; each instruction's meaning lifts the function to the interop normal form; the Rust writer writes it;
and the Rust matches the machine code gcc made, input for input.

Every item is **Q** (needs your decision) unless it is under **Decided**. IDs `MC…`.

Why machine code, and why this way:

- **It is universal without adoption.** Every language gcc or clang compiles reaches x86-64; a declaration of what it
  emits reaches all of them at once, and nobody has to write Ray.
- **The instruction set is a binary format.** REX, opcode, ModRM, SIB, displacement and immediate are fields of bits,
  the same mechanism as DEFLATE's headers. Each instruction is one class: its encoding (header), its assembly text, and
  its meaning.
- **The corpus is already there.** `poc/interop/gen.py` writes seeded C functions over `+ - *`; gcc -O2 compiles 200 of
  them to 14 encodings (`ret`, `imul` two forms, `lea`, `sub`, `add` three forms, `mov` three forms, `xor`, `neg`,
  `not`, `shl`), each with an optional REX prefix.

---

## Principles

- **One declaration.** `$/x86/X86.ray` is the only thing that reads, writes, prints or gives meaning to x86-64. No
  disassembler library, no TS decoder.
- **The engine is language3** as `Deflate.md` leaves it; a step it cannot do stops, and the gap is recorded.
- **Ray is the IR** (Plan.md, 2026-10-06). The lift is Ray code in the interop normal form, defined and run by Ray.
- **Oracles are the tools that made the code.** gcc makes the corpus; objdump checks decoding; the native object, linked
  into a harness, checks meaning. A step passes on a `diff` or `cmp`.

## Scope

- **In:** the encodings gcc -O2 emits for the interop corpus, both directions; the System V calling convention for up
  to four integer arguments (`rdi`, `rsi`, `rdx`, `rcx`); 32- and 64-bit operations with their wrapping, zero-extending
  and sign-extending rules; the lift to the normal form; Rust written from the lift.
- **Out:** control flow, memory, calls, flags as values, floating point, anything gcc does not emit for the corpus. The
  signature (how many parameters, `int` or `long`) is given, as a header file or debug information gives it to a linker:
  machine code alone does not hold it.

## Layout

All POC files live in `@ether/poc/machine/`:

| File | Role |
|---|---|
| `run.sh` | `./run.sh <STEP>` runs one step |
| `make.py` | Compiles the corpus with gcc, cuts each function's bytes out of the object, records objdump's text |
| `corpus/` | Each function's bytes, its objdump text, `manifest.txt`; committed, so the corpus does not move with gcc |
| `mc0.ray` … | Claims per step |
| `out/` | What Ray reads, lifts and writes; ignored by git |

## Steps

### MC0 Ground

- **Goal.** One branch with both proofs, both still passing.
- **What happens.** `proposal/machine-code` is `proposal/deflate-proof` with `proposal/interop-poc` merged in. The
  conflicts are the `js` host's `$` (both added to it) and `as` (one falls back to reading bits, the other to reading
  text; it now tries `from`, then text, then bits).
- **Pass.** DP0, DP2 and a dynamic DP3 stream; N0 to N4 and N6.

### MC1 Oracle and corpus

- **Goal.** Fixed machine code to read, and what it means natively.
- **What happens.** `make.py` runs `gen.py` (seed 1), compiles each function with `gcc -O2 -fwrapv` (wrapping, as
  N6), cuts its bytes out of the object, and records objdump's Intel text for it.
- **Pass.** `./run.sh MC1`: recompiling gives the committed bytes, or says which gcc moved.

### MC2 Read and write back

- **Goal.** The declaration is a decoder and an encoder.
- **What happens.** `X86.ray` declares the 14 encodings over the bits of each byte, least significant first, as x86
  stores its integers. Each function's bytes are read into instructions and written back.
- **Pass.** `./run.sh MC2`: every function written back byte for byte.

### MC3 Assembly text

- **Goal.** The instruction's text is part of its declaration.
- **What happens.** Each instruction read writes its Intel text (`lea eax, [rdi+rsi*2+0x5]`).
- **Pass.** `./run.sh MC3`: Ray's text equals objdump's for every instruction in the corpus.

### MC4 Lift

- **Goal.** Machine code becomes the function it computes, in the interop normal form.
- **What happens.** Each instruction's meaning updates the registers, which hold Ray expressions over the parameters.
  `ret` gives `eax` (`int`) or `rax` (`long`). Every operation is narrowed to its width with `wrapped` (the machine
  wraps, unlike `as`, which answers `None` outside the type); a 32-bit result read as 64 bits is zero-extended.
  `f1 (a: Int32, b: Int32) => ((a + ((b * 3) wrapped Int32)) wrapped Int32)`.
- **Pass.** `./run.sh MC4`: each lifted function, defined in Ray, answers what python3 computes on the N3 inputs (small,
  so no operation wraps), the same as the function read from the C source.

### MC5 Rust from machine code

- **Goal.** (1c) without the source: gcc's output for C becomes Rust that does what it does.
- **What happens.** The interop Rust writer, given `wrapped` (`wrapping_add`, …), writes each lifted function with the
  C ABI. `check.py` links gcc's object and Ray's Rust into the same harness.
- **Pass.** `./run.sh MC5`: on 30 inputs per function, half at the edges of the type, the Rust Ray wrote from the
  machine code and the machine code gcc made print the same.

### MC6 Assembly is Ray syntax

- **Goal.** The Almanac's "assembly is just valid syntax in the new language".
- **What happens.** `X86.Assembly` is a rule set whose heads are the instructions as objdump writes them
  (`lea {a: X86.Register},[{m: X86.Memory}]`), so `X86.Assembly reading { lea eax,[rdi+rsi*1] }` is Ray code that answers
  an `X86.Instruction`; `X86.Register` and `X86.Memory` read the operands. Each rule chooses the encoding gcc chooses: a
  SIB byte only for an index, no base, or rsp/r12 as base; the shortest displacement; the 8-bit immediate when it fits,
  else `05` for the accumulator; `B8+r` into 32 bits, `C7 /0` into 64. The function is then written by the same headers
  that read it in MC2.
- **Pass.** `./run.sh MC6`: every function's text assembles to gcc's bytes.

## After this proof

- **A second instruction set.** The same corpus through `aarch64-linux-gnu-gcc`, lifted by an `AArch64.ray`, gives the
  same functions: two machines, one meaning.
- **The interpreted side.** CPython compiles to bytecode in `.pyc` files (marshal, then opcodes): one more binary format.
  Read it the same way, and Python meets C through what each compiler emits, with no grammar of either.
- **Control flow.** Jumps become labels and `goto`, which Ray has; equivalence then needs more than evaluation
  (Interop.md L2).

## Status

MC0 to MC6 pass (`./run.sh MC1` … `MC6` in `@ether/poc/machine`; 25 functions per process), also after merging main.

- **MC0**: on the merged branch, S0 to N6 and DP0, DP2, DP3, DP4 pass.
- **MC1**: 200 functions, from 3 to 32 bytes, pinned in `corpus/manifest.txt` (gcc 16.2.1).
- **MC2**: all 200 read into instructions and written back byte for byte.
- **MC3**: all 200: Ray's text is objdump's, line for line.
- **MC4**: all 200 lift to Ray functions that answer what the C source computes on 3 inputs each. gcc does not keep the
  source's shape: `2-b-(b + rate) + (rate + 7 + (rate - 8))` arrives as `rate - 2b + 1`, and
  `a - (n - n) + ((x * n + (x - a)))` as `(n + 1) * x` (`lea eax,[rdi+0x1]`, `imul eax,edx`); the lift reads what the
  machine does, not what was written.
- **MC5**: 6000 inputs (30 per function, half at the edges of the type): the C-ABI Rust Ray wrote from the machine code,
  linked into one C harness, prints what gcc's own objects print on all 6000. No C source and no C grammar is on that
  path; `f3` becomes `n.wrapping_add(1i32).wrapping_mul(x)`.

- **MC6**: all 200: objdump's text, each line read as Ray code in `X86.Assembly`, is written as the bytes gcc made. Ray's
  declaration is now an assembler and a disassembler of what gcc emits, both checked against gcc and objdump.

Each function reads, prints, lifts or assembles in under a second.

## Engine work

- **The merge.** `as` tries `T.from(x)`, then the text a header reads (interop), then the bits it reads (DEFLATE).
- **One boot for both proofs.** The interop runner read the core library in directory order. Once `dangling` (DEFLATE)
  let `Program.ray`'s `Program &+= { … from: *? … }` read before `Program` was defined, its fields landed in the global
  scope, and `from: *?` answered its argument for every `T.from(x)`, so every `x as T` did too. It now boots as
  `poc/deflate/boot.mts` does: the library in the order it needs itself.
- **Headers of text stay plain.** A header with quoted pieces (`CFunctionText`) is read as text, not as bits; a header is
  of bits when a type in it, or what it lists or may be, is a class of bits.
- **Alternatives of classes.** `operation: X86.Imul<rex> | … | X86.Ret<rex>` reads the first that fits and writes the one
  the value `is`.
- **The host** gains `hexadecimal`, as it has `binary`.
- **`wrapped`** (`poc/machine/wrapping.ray`): `x wrapped T` is x brought into T's bounds modulo their size, the machine's
  arithmetic, where `x as T` answers None outside them. The Rust writer writes it as `wrapping_add`, `as i32`,
  `as u32 as i64`.

## Merging main (7398a7e5)

Main moved the language to `language.ts` and `js.kinds.ray`, the library's tests into the library as `assert` lines, and
`$/deflate/Deflate.ray` to `$/Deflate.project.ray`; the POC now boots through main's `Library`. Five things main does
broke the proofs, each fixed in a commit of its own:

- **A static class was made when first read** (lazy statics). Made from inside another reading, a second such class in the
  same class loops in `&+=` (on main alone too: `Outer.P2(1, 2)` overflows after `Outer.P1`). Classes are made where they
  are written again; other static values stay lazy, so `static plane := Space(…)` in `Space` still works.
- **`if … elsif … else` always took the `else`** (on main alone too). The plain `if … else` rule, defined after the chain,
  read the chain's first body as part of its condition; the chain rules are now defined after it.
- **`Roman.ray`'s conversion at the top level set every `from`.** `(x: S) as (=== T) => …` defines `from` where it is
  written, so written outside `Roman` it replaced the default `from`, and every `x as T` answered Roman's normalizer. It is
  now inside the class, which is where the rule's own comment says it goes.
- **Arguments spread only when made by `,`.** Fields read from text are now given as `read.spreading`.
- **Two branches defined `!x` and the elsif chain differently;** main's are kept.

Then the slowdown. Profiles put it in the pattern matcher, which was called 10 times as often for the same stream: the Ray
code did more, not the engine. Counted reads of one warm read of `hello.txt.1.default` (9 594 before the merge):

| | Reads | Time |
|---|---|---|
| merged | 351 602 | 2.9 s |
| a lazy static keeps its value (it was made again on every read: `{name} = kept` did not stick) | 197 410 | 1.6 s |
| a static list written out is made where it is, once (read unqualified in a method, the kept value was not found) | 59 564 | 0.6 s |

A block read again (`link := { … }` in every `append`, a list's body in every `Listing.new`) also no longer reads its tests
again, as an instance already did not; that saves the cold reads. `ray.txt.1.huffman` now reads in 47 s (17 s before the
merge, 157 s merged), `text.txt.1.fixed` in 41 s (9 s, 51 s); of those, about 11 s in each process is the fixed code
tables, now made when first read instead of when the library loads. What is left is spread out: lists cost more (each also
holds `spread`), `,` makes a list of every argument list, `is` walks superclasses with a lazy default, every text literal is
read through `unescaped`, every `if` tries the `elsif` chain first.

What is still off:

- **Main's engine is still about 3 times slower** on DEFLATE than before the merge.
- **The full library test run (`--test`) runs out of memory** after about 18 minutes, on main and on this branch alike;
  `poc/library-tests.mts` runs it in-process, since the CLI's worker needs Node's `--experimental-transform-types`, which
  Node 26 no longer has.

## Engine gaps

- **MCG1 A class's statics are not in scope while its block is read.** `X86.Rex` does not resolve until `X86 :=` is done,
  so a header whose bits come only through sibling classes would be read as plain. `X86.Instruction` and `X86.Function`
  are defined after `X86`.
- **MCG2 An unbalanced bracket says nothing.** One `)` too many in one method left the whole class unmade, silently,
  and whether the file read alternated with how many statics came after it. Errors with positions are needed (Interop.md
  L1 asks for them too).
- **MCG4 A closure written as a later argument takes the whole argument list as its parameters:** `g(3, (y) => y + 1)`
  reads as one closure `(3, (y)) => …`. Bracketed, `g(3, ((y) => y + 1))`, it is one argument (before the merge too).
- **MCG5 A closure written in a rule's right side does not see the rule's holes when it is called elsewhere;** they are
  bound to locals first (`x := a`).
- **MCG6 The digit `1` taken by a hole is not the number 1** (`*1` in `[rax+rax*1+0x1]` read as the word `scale`, where
  `*2` reads 2); the scale is taken as its text.
- **MCG3 `return` in a rule's right side returns from the function that called the rule.** `wrapped` written with
  `(return value) if …` made every lifted function answer its first wrapped value.

## Decided

- **This proof comes before DP7 and DP8.** The zlib and gzip wrappers and the comparison with Kaitai Struct and
  Construct serve binary-format tooling; this serves interop, which is the goal. They stay in `Deflate.md`.
- **Branch.** `proposal/machine-code`, from `proposal/deflate-proof` with `proposal/interop-poc` merged in; nothing is
  committed into either.

## Order of work

MC0 to MC6 in order, one commit each, kernel changes as commits of their own.
