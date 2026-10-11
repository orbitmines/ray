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
- **What happens.** objdump's text is read by the same declarations and written as bytes.
- **Pass.** `./run.sh MC6`: every function's text assembles to gcc's bytes.

## After this proof

- **A second instruction set.** The same corpus through `aarch64-linux-gnu-gcc`, lifted by an `AArch64.ray`, gives the
  same functions: two machines, one meaning.
- **The interpreted side.** CPython compiles to bytecode in `.pyc` files (marshal, then opcodes): one more binary format.
  Read it the same way, and Python meets C through what each compiler emits, with no grammar of either.
- **Control flow.** Jumps become labels and `goto`, which Ray has; equivalence then needs more than evaluation
  (Interop.md L2).

## Status

MC0 in progress.

## Decided

- **This proof comes before DP7 and DP8.** The zlib and gzip wrappers and the comparison with Kaitai Struct and
  Construct serve binary-format tooling; this serves interop, which is the goal. They stay in `Deflate.md`.
- **Branch.** `proposal/machine-code`, from `proposal/deflate-proof` with `proposal/interop-poc` merged in; nothing is
  committed into either.

## Order of work

MC0 to MC5 in order, one commit each, kernel changes as commits of their own; MC6 after MC5.
