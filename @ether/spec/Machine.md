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

### MC7 Ray compiles through its own declaration of the machine

- **Goal.** The speed the interpreter cannot give, from Ray itself: Ray code written as machine code by `X86.ray`, the
  declaration that reads it, and checked by reading it back.
- **What happens.** A rule set over the interop normal form (`X86.Shape` and `X86.lowered`, the reverse of MC4's lift) chooses
  instructions for each function: its parameters in `edi`, `esi`, `edx`, `ecx` (`rdi`, … for `long`), each operation
  into a register, the result in `eax` or `rax`, then `ret`. It writes them as `X86.Assembly` lines, which are Ray code;
  MC6's declaration writes them as bytes. A C harness copies the bytes into executable memory and calls them.
- **Checked twice.** The bytes run natively agree with gcc's objects on the MC5 inputs; and the same bytes, read by
  `X86.ray` and lifted (MC2 to MC4), give a function that answers what the C source computes. The compiler is not
  trusted: the declaration that wrote the code reads it back.
- **Pass.** `./run.sh MC7`: all 200 functions, both checks.
- **Why it matters.** Native code runs about 10⁸ operations a second where the interpreter reads about 10⁵ times a second.
  With control flow in `X86.ray` (`cmp`, `jcc`, `jmp`) the same lowering reaches loops, then DEFLATE's decoder, then the
  kernel itself: Ray's rule matching written in Ray and compiled through `X86.ray`, the Almanac's "compile the compiler
  into a new version".

### MC8 Branches and loops, both directions

- **Goal.** What MC7 does for arithmetic, for control flow: nothing real is straight-line.
- **MC8a Corpus.** `flow.py` writes small functions from templates (a choice, two choices, a loop counting down to a
  bound, a loop summing up to one) over `int` and `long`, with the arithmetic of `gen.py` inside them; gcc compiles them
  as in MC1; gcc's objects run on inputs small enough that every loop is short, and what they print is the oracle.
- **MC8b The declaration.** `X86.ray` gains what gcc emits for them: `cmp` and `test` (registers and immediates), `and`,
  the conditional moves, the conditional jumps and `jmp` (8- and 32-bit offsets), and the `nop`s gcc pads loop heads with
  (with the `66` and `2e` prefixes). Pass: every flow function written back byte for byte, and its text objdump's (jump
  targets as offsets in the function, without objdump's `<name+offset>`).
- **MC8c The lift.** Registers become variables, the flags the last comparison (`cmp`, `test`, or the result an operation
  set), each condition a comparison of those at the width it was made at, a jump a `goto` to a label at its target, `ret`
  a `return`: Ray's own labels and `goto`. Pass: each lifted function, run by the interpreter, prints what gcc's object
  prints on the same inputs.
- **MC8d Through itself.** The lifted program lowered back to x86-64 by `X86.ray` (each statement, each `goto` a jump),
  written, run natively: it prints what gcc's object prints; and its bytes, read and lifted again, run the same.
- **Why it matters.** With branches and loops the lowering reaches real programs; then memory, then DEFLATE's decoder
  compiled through `X86.ray`.

### MC9 Memory

- **Goal.** Data: what any real program, an `inflate` among them, reads and writes through pointers.
- **MC9a Corpus.** `memory.py` writes small functions over arrays from templates (sum, count, find, copy, reverse, a
  histogram), over `int`, `long` and `unsigned char`; gcc compiles them; gcc's objects run on arrays small enough that every
  loop is short, and what they print (results and arrays after) is the oracle.
- **MC9b The declaration.** Loads and stores (`mov` to and from memory, `movzx`, `movsx`), arithmetic and `cmp` with a memory
  operand, and whatever else gcc emits for them: read, written back, printed as objdump does.
- **MC9c The lift.** Memory becomes a Ray list of bytes; a pointer an index into it; a load or store of a width its bytes
  little-endian. The lifted function, given the same arrays laid out in that memory, prints what gcc's object prints.
- **MC9d Through itself.** The lifted program written as machine code again, run natively on the same arrays, and lifted
  again.

### MC10 A real program

- **Goal.** A whole program, not a corpus of small ones: a DEFLATE decoder (`poc/machine/inflate/inflate.c`, written for
  this, RFC 1951), compiled by gcc, read, lifted and compiled again through `X86.ray`, decoding the DEFLATE proof's corpus.
  Its tables are made by code into the state it is given, so its machine code is one `.text` of 4615 bytes with no
  relocation: five functions (`bits`, `construct`, `decode`, `codes`, `inflate`; gcc inlined the rest), calls among them,
  a stack, words and bytes in memory.
- **MC10a Oracle.** gcc's object, linked into `main.c`, decodes the 22 streams as zlib wrote them and rejects the 7 bad
  ones (`make.py --check`, bytes pinned in `manifest.txt`).
- **MC10b The declaration.** Every instruction read, written back byte for byte, printed as objdump does: the operand
  size prefix (16-bit words), shifts by `cl` and arithmetic ones, `or`, `and`, 32-bit immediates, immediates stored and
  compared in memory, word loads sign- and zero-extended, `push`, `pop`, `call`, `movabs`.
- **MC10c The lift.** Each function a Ray function of the argument registers and its stack pointer (`at_4e0_called (memory,
  a0, …, a5, stack)`), memory shared; a call a Ray call that answers rax; a jump to another function's start a tail call.
  The lifted program, run by Ray on the same memory, decodes the streams as gcc's object does.
- **MC10d Through itself.** The lifted program compiled to machine code by `X86.ray`, run natively on the whole corpus.

## After this proof

- **A second instruction set.** The same corpus through `aarch64-linux-gnu-gcc`, lifted by an `AArch64.ray`, gives the
  same functions: two machines, one meaning.
- **The interpreted side.** CPython compiles to bytecode in `.pyc` files (marshal, then opcodes): one more binary format.
  Read it the same way, and Python meets C through what each compiler emits, with no grammar of either.
- **Equivalence beyond evaluation.** MC8 and MC9 compare on inputs; that a lifted program is the function for every input
  needs more than evaluation (Interop.md L2).

## Status

MC0 to MC10 pass (`./run.sh MC1` … `MC10d` in `@ether/poc/machine`; 25 functions per process), also after merging main.

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

- **MC7**: all 200: each function's C, read into Ray by the interop reader, lowered by `X86.lowered` and written
  by `X86.ray` (7 008 bytes in all), runs natively and agrees with gcc's objects on all 6000 inputs; and those bytes, read
  back and lifted, give exactly the function the C was read to (text for text, `as` read as the machine's `wrapped`).
  `f3` runs 17 times a second in the interpreter and 765 million times a second as the machine code Ray wrote for it:
  about 4.5 × 10⁷, from the same meaning, checked by the declaration that wrote it.

- **MC8a**: 60 flow functions (choices, two choices, loops down and up, over `int` and `long`), pinned with what gcc's
  objects print on 180 inputs.
- **MC8b**: all 60 read and written back byte for byte, and printed as objdump prints them: `cmp`, `test` (also of an
  8-bit register), `and`, `shr`, the conditional moves, short conditional jumps and `jmp` (each target where the next
  instruction begins plus its offset), and gcc's padding `nop`s with their `66` and `2e` prefixes. A value read from bits
  is now all of them: a function is not its bytes up to the first `ret`.
- **MC8c**: all 60 lifted to Ray with their branches and loops, as Ray's own labels and `goto`, print what gcc's objects
  print on every input. Each instruction's existing `lifted` gives the arithmetic (registers named after the variables
  `r0` to `r15`), so nothing of it is written twice; the flags are two variables; a condition compares them.
- **MC8d**: the lifted programs written back as machine code by `X86.ray` (variables in their registers, flags in r10 and
  r11, the deeper side of an operation first so two more registers suffice, `movsxd` for a 32-bit wrap, jumps with 32-bit
  offsets laid out in two passes, each line assembled by reading it in `X86.Assembly`): all 60 (10002 bytes) agree
  natively with gcc's objects on all 180 inputs, and read back and lifted again, print the same.
- **MC9a**: 60 functions over arrays (sum, count, find, largest, add, prefix sums, reverse; of `int`, `long`,
  `unsigned char`), compiled by gcc without vectorizing (`-fno-tree-vectorize`: vector instructions are a later step), and
  what their objects print, results and arrays after, on 180 inputs.
- **MC9b**: all 60 read, written back byte for byte, printed as objdump does: loads, stores, `add` to and from memory,
  `cmp` with memory, `movzx`, `movsxd` from memory, `setcc`, byte registers (`ah` to `bh` without REX, `spl` to `dil` with).
- **MC9c**: all 60 lifted, memory a Ray list of bytes (`poc/interop/memory.ray`), a pointer an index into it, a value of
  more bytes little-endian, print what gcc's objects print, arrays after included.
- **MC9d**: all 60 written back as machine code by `X86.ray` (11407 bytes): a load or store of an address x86 computes
  itself (base, index scaled by 1, 2, 4 or 8, small displacement) is one instruction, as gcc writes it; the flags and what an
  expression needs on the way are registers the program does not name. They agree natively with gcc's objects on all 180
  inputs, arrays after included, and read back and lifted again, print the same.
- **MC10a**: gcc's object of `inflate.c` (4615 bytes, pinned) decodes all 22 streams as zlib wrote them and rejects all 7
  bad ones.
- **MC10b**: all 4615 bytes read as one function, written back byte for byte, printed as objdump prints them.
- **MC10c**: read and lifted function by function, the lifted program, run by Ray on one memory, decodes all 22 streams as
  zlib wrote them and rejects all 7 bad ones. It is slow and large: from 11 s (a stored stream) to 38 minutes and 24 GB
  (`text.txt.1.huffman`), since every value written into text in a run is held until a rule or the run ends (see "What
  a kernel needs").
- **MC10d**: the lifted program compiled back by `X86.ray` (42 606 bytes, nine times gcc's: flags kept in two places
  below the stack, each statement's registers on the way borrowed and given back, calls `call`, tail calls `jmp`; each
  line assembled is printed back and compared with what it was written as) decodes all 22 streams natively as zlib wrote
  them and rejects all 7 bad ones. It takes 72 us a decode of `text.txt.1.huffman` where gcc's takes 8.4, and Ray's
  interpreter 38 minutes.

Each function reads, prints, lifts or assembles in under a second.

## The same ladder on a declaration Ray made from XED

The first step of `Breadth.md`: x86-64 read from Intel's own description instead of written by hand. `$/x86/Xed.ray`
reads XED's records (`datafiles/xed-isa.txt`, fetched at a pin into `.ether/external/xed`, not kept in the repository)
and writes `$/x86/X86.xed.ray`: 358 forms of the 39 instruction classes gcc's integer code uses (each condition of `j`,
`cmov` and `set` one), every encoding, operand kind and objdump spelling from the records. 69 forms are left out, each for
what the declaration does not have yet (`not64` 56, a displacement only 4, `prefetch` 3, REX2 2, `lock` 2, F3 refining 1,
a 16-bit immediate 1). The whole file is made in about two minutes (`poc/machine/xed.mts`), a hundred records per run.

What is still written by hand is per kind of operand and per instruction class, not per encoding: a printer of operands
(about 50 lines), what each class does (`X86.meant`, `X86.meant_lifted`: about 130 lines, the same goto program the hand
forms lift to, so both declarations lift alike), and one assembler for every form (about 200 lines). XED says how an
instruction is encoded and what its operands are, not what it does: that part comes from a description of semantics
(Ghidra's SLEIGH for x86) in a later step.

The ladder runs on it unchanged: `DECLARED=X86.XedFunction LOAD_EXTRA='$/x86/X86.xed.ray' ./run.sh MC…`.

| Step | XED's declaration |
|---|---|
| MC1, MC8a, MC9a, MC10a | pass (the corpora and their oracles do not depend on a declaration) |
| MC2, MC3 | all 200 read, written back byte for byte, printed as objdump does |
| MC4 | all 200 lifted answer what the C source computes |
| MC5 | all 200 written as Rust agree with gcc's objects on all 6000 inputs |
| MC6 | all 200: objdump's text assembled into XED's forms is gcc's bytes |
| MC7 | all 200 compiled from C (7 008 bytes) agree natively on all 6000 inputs, and lift back to the function the C was read to |
| MC8b, MC8c | all 60 flow functions read, printed, lifted; they print what gcc's objects print |
| MC8d | all 60 compiled back (8 480 bytes) agree natively on all 180 inputs, and lift back to the same |
| MC9b, MC9c | all 60 memory functions read, printed, lifted; they print what gcc's objects print, arrays after included |
| MC9d | all 60 compiled back (11 428 bytes) agree natively on all 180 inputs, arrays after included, and lift back to the same |
| MC10b | `inflate`, 4615 bytes, read, written back byte for byte, printed as objdump does |
| MC10c | the lifted program, run by Ray, decodes all 22 streams as gcc's object does and rejects all 7 bad ones, in two processes (42 and 147 minutes): in one, the kernel's maps overflow after 18 streams (`Map maximum size exceeded`) |
| MC10d | the lifted `inflate` compiled back (42 606 bytes, as with the hand forms) decodes all 22 streams natively and rejects all 7 bad ones |

How a line of text is assembled into XED's forms (`X86.xed_assembled`): every form of its mnemonic whose operand kinds fit
the operands is made; one is kept when it prints back as the line and its bits, read again by the codec, read as it (the
text alone let a 32-bit form take REX.W and print the same); of those, the shortest, as an assembler takes it. Where two
forms of one length print alike, the one gas takes is data (`X86.Taken`: gas's multi-byte `nop` is `0F 1F`, binutils
`opcodes/i386-opc.tbl`), not a rule. Assembled this way, 61 of the 65 instruction shapes in `inflate` are gcc's bytes;
the other 4 are padding `nop`s of a 32-bit zero displacement, which objdump prints as the 8-bit one (`+0x0`): the text does
not say which, and gas writes them from `.p2align`, not from text. The lowering never writes them.

Two declarations, one meaning: `inflate` lifted through XED's declaration and through the hand forms gives the same
program but for 101 of its 2 565 lines, each the same value written another way: a zero as `0` where the hand forms
write `((1 - 1) wrapped Int32)`, a value wrapped where they leave it as it is (`and`, a value stored, of which `store`
takes the low bytes anyway), and `neg`'s flags as `0` against the value where they keep the result against `0`. MC10c and
MC10d show the two programs decode alike.

What it took besides the declaration:

- **Speed.** Reading tries the forms in order; a class whose leading bits are fixed (`<-Byte{== 137}`) is now skipped
  where the bits differ (`Reading.may_start`), and writing finds an alternative by the value's class instead of asking each
  of 358 `is` (`Writing.type`): a line assembles in about a second, not ten. With the skipped bits kept per header (they
  were kept per type, filled in a scope where no header is found, so nothing was skipped), a function reads in 0.3 to
  1.1 s, against under one with the hand forms.
- **A kernel bug.** `a === b` goes to `a` as a label, so a value that was the text of a host goto ran it: `"js"` (jump if
  sign) ran `goto js`, compiling the next line as JavaScript. A host goto now runs only where it is named.
- **Lifts the hand forms already made.** `neg` as `0 - x` with the constant written as the lift writes one, a constant shift
  as a product or quotient, a 32-bit immediate signed, `lea` as its address: the lowering and the Rust writer take only
  what the hand forms lift to.


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
- **`wrapped`** (now in `poc/interop/ints.ray`): `x wrapped T` is x brought into T's bounds modulo their size, the machine's
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
- **DEFLATE's writer (DF8) wrote stored blocks only.** Three causes. Sibling statics written unqualified in a static method
  (`Data(…)` in `fixed`) no longer resolve, and `Entry` is now also a class in `Node.ray`: every such use in
  `Deflate.project.ray` is written in full (DPG1). Named arguments are now declarations whose value is read lazily where
  it is read, so `Element(literal: value.byte)` read later by the codec gave a node: the writer's makers are called with
  their arguments in order instead. And a record written got a fresh scope each time, so `literals.Symbol` was looked up
  again for every element, checking `literals: Huffman` and its 288 lengths each time: written records now have the
  home scope read ones have.

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

## Merging main again (29d86861)

Main now reads `-` of two whole numbers as none below zero (`3 - 5` is 0) and `/` as whole division; signed numbers are
`Decimal.Signed` (`(-2).negative`), and a negative written alone (`-256`) does not yet read as a number. Everything here
that computes with negatives in Ray stops being right: the interop normal form's `a - b` on `Int32` (N3), `X86.signed` and
the immediates and displacements it prints (MC3), the lift run on inputs (MC4). What runs as compiled code is unaffected
(N4, MC5, MC7: the arithmetic there is Rust's or the machine's).

Decided: an integer type carries its own arithmetic (`poc/interop/ints.ray`). `Int32`, `Int64`, `Natural32` and `Integer`
each have bounds and bits; rules for `((a - b) as T)` and `((a - b) wrapped T)` compute the operation exactly and with a
sign (host `added`, `subtracted`, `multiplied`, on BigInt), then hold it to T: `None` outside T for `as`, back into T modulo
2 to its bits for `wrapped` (host `wrapped_into`). The normal form already says whose arithmetic each operation is; values
stay plain numbers. A negative is written in the same form, `((1 - 34) as Integer)`, as the lift's constants already were
(`((1 - 10) wrapped Int64)`). The writers map a type by its bits. `wrapping.ray` is gone into `ints.ray`.

## Why it is slow, and what that means

Measured on this branch: booting the language takes about 11 s; one read (matching text against rules) about 10 µs; a warm
read of a 5-byte DEFLATE stream takes about 60 000 reads, some 12 000 per byte, so about 100 bytes a second, where zlib
does hundreds of megabytes. Writing 512 random bytes runs past 12 GB. Machine code is cheaper only because its functions
are small (under a second each).

Where it goes:

- **Everything is read again as text.** There is no compiled form: each evaluation matches its text against the rules in
  scope. Values cross between Ray and the host as references written into text (`{00abcd}`) and are read back; the codec
  builds Ray text for every field, narrowing and default (`(value) with { … }`) and reads it.
- **Data is made of Ray nodes.** A list link is a block read on every `append` (its rules defined anew); `,` makes such a
  list for every argument list. One output byte costs tens of nodes.
- **What is lazy is read again.** Named arguments are read where they are read, typed parameters are checked with `is`
  walking superclasses, `static` values were made again on every read until this branch kept them.
- **Memory is not given back** within a process, so every corpus case runs in a process of its own and pays the boot.

What it means for the goal. The goal needs the one declaration to be the meaning (type, grammar, parser, writer) and needs
compiler output at real sizes to run through it: whole programs, libraries. The interpreter is four to six orders of
magnitude short of that, and tuning it (caching readings, host lists, compiling the codec's expressions once) buys one or
two. So the interpreter should stay the reference semantics, run on small cases, and speed should come from what the
interop path already does: Ray writing another language. The writers that turn a lifted function into Rust can turn a
declaration into a decoder and encoder in Rust or JS: `X86.ray`'s headers into a function from bytes to instructions and
back, then DEFLATE's. The generated code runs the corpora; a differential check keeps it equal to the interpreter on the
fast tier. That is the Almanac's (1c) applied to Ray's own declarations, "compile the compiler into a new version", and it
is the machinery the rest of interop needs anyway.

How the proofs run meanwhile: `poc/quick.sh` runs each kind of claim of the three proofs on a few cases in seven processes
(about 3 minutes); the full corpora (`deflate/run.sh`, `interop/run.sh`, `machine/run.sh`) run only before a step is called
done.

## What a kernel needs to run these proofs

For a kernel written anew: what `language.ts`, `js.kinds.ray` and `structures3.ts` give the three proofs today, beyond main.

- **Reading.** A hole does not end in an operator after a space (`1 >`); code given to a body hole does not begin with an
  operator and a space (`if a > b { … }`); a hole does not end inside `Name<…>` (a `<` after a word); a hole between two
  quotes may sit inside longer literals.
- **Where names are read.** A member read on a value that is not a node (text, a number) reads its holes where it was
  written (`3.binary(width)` in a call); where else to look (`also`) carries on through a chain (`x.count + y`); a block
  read again does not read its tests again.
- **The host's `$`** has `written` (a value as code), `host` (the codec) and `whole` (whether a node's rules read a text
  whole); a body hole is given to `goto js` as nothing, its text by `$.text`.
- **The codec** (`structures3.ts`): a class header read and written as bits (fixed and variable widths, reversed, lists,
  alternatives of records and of classes, conditions, generics, defaults, prefix codes, where reading stopped), exposed as
  `plain`, `instance_defined`, `bits_read`, `binary`, `Coded`.
- **Host kinds:** `bytes`, `latin1`, `code_at`, `substring`, `last_index_of`, `binary(width)`, `hexadecimal`,
  `signed_hexadecimal(width)`, `reversed`, `unsigned`, `pieces(size)`, `tally(size)`, `maximum`, `reads_text`, `headed`;
  `added`, `subtracted`, `multiplied`, `wrapped_into` (exact signed integers); `*` repeating text and lists; `==` and `!=`
  of two lists by `alike`; `byte_at`, `anded`, `ored`, `xored`, `shifted_left`, `shifted_right`, `unsigned_below`;
  memory as bytes (`memory_sized`, `memory_byte`, `memory_placed`).
- **Memory.** A run does not keep what it no longer reaches: no reading keeps the ways it was not read, and no lookup of
  values written into text keeps them for the whole of a run. Today a value written into text is found by its id through
  `reading_now` (strong, until the outermost run ends) and `referred` (a `WeakRef`, which keeps it until the job ends):
  one fixed-Huffman decode by the lifted `inflate` writes 3.8 million values into text, and holds 2.5 GB at its end.
  It is not a leak (all of it goes when the run ends) but what holding values as text makes: a value is written into code
  as a token and the text read again, and text says nothing of who still needs what it names, so the table from token to
  value keeps all of them. Letting a rule's hole values go when its right side is done keeps `reading_now` under what one
  `Map` holds (16.7 million: `text.txt` reached it), but not the memory. Another host language would keep the same table.
  What frees it: a rule's holes bound as names in the node its right side runs in, or its text read once into a tree whose
  leaves hold the values; then a value lives as long as what holds it, in any language, and text is not read again for
  every call (most of the 17 calls a second).

Measured against today's kernel (to beat): boot 11 s; `f3` 17 calls a second; a warm 5-byte DEFLATE read 60 000 reads; the
quick tier (`poc/quick.sh`) about 6 minutes.

## Engine gaps

- **MCG1 A class's statics are not in scope while its block is read.** `X86.Rex` does not resolve until `X86 :=` is done,
  so a header whose bits come only through sibling classes would be read as plain. `X86.Instruction` and `X86.Function`
  are defined after `X86`.
- **MCG2 An unbalanced bracket says nothing.** One `)` too many in one method left the whole class unmade, silently,
  and whether the file read alternated with how many statics came after it. Errors with positions are needed (Interop.md
  L1 asks for them too); loading names the bracket and its line now (see MCG11).
- **MCG4 A closure written as a later argument takes the whole argument list as its parameters:** `g(3, (y) => y + 1)`
  reads as one closure `(3, (y)) => …`. Bracketed, `g(3, ((y) => y + 1))`, it is one argument (before the merge too).
- **MCG5 A closure written in a rule's right side does not see the rule's holes when it is called elsewhere;** they are
  bound to locals first (`x := a`).
- **MCG6 The digit `1` taken by a hole is not the number 1** (`*1` in `[rax+rax*1+0x1]` read as the word `scale`, where
  `*2` reads 2); the scale is taken as its text.
- **MCG7 A named argument is read where it is read, not where it was given:** `f(x: e)` keeps `e`, so a value made with
  it and read later elsewhere (the codec) reads `e` again there; values the codec reads are made with arguments in order.
- **MCG8 Main's `filter` overflows the stack** (`[1, 2, 3].filter((x) => x == 2)`, on main alone too): prefixes are counted
  with a loop. **`is` can run away** through `descends`' lazy `depth` default: instructions answer `assembly_after` instead
  of being asked what they are.
- **MCG9 `list[i] = value` did nothing, silently** (it kept `value` under the key `i`, which `list[i]` does not read).
  Fixed: on a list with a number, `[]=` places the value (`placed`). Memory is the host's bytes now (`memory_sized`,
  `memory_byte`, `memory_placed`), read and written in one step; what a load and a store mean stays in `memory.ray`.
- **MCG10 A word no rule reads is text, silently**: with `io.ray` not loaded, `lifted text_after opening` is the text
  `"text_after opening"`, and a function lifted with it was `m1 (memory, text_after opening`. An unread word could say so.
- **MCG11 A second `static` of a name replaces the first, silently, whatever its arity**: a new `addressed (text)` took the
  place of `addressed (registers, operand, rex)`, and every `lea` lifted to nothing (no line, no error), so Ray's machine
  code for it ran off into memory it never set. (`name (params) =>` is `name := (params) => …`: a variable, so this is
  what it means.) Said now: loading a file names a name defined twice in one block, and a bracket that does not
  balance before the next statement (MCG2), with their lines (`poc/deflate/boot.mts`).
- **MCG12 Memory grew 1 GB a function, and every run ran out.** Two causes. A reading kept every way its text was read
  (`all`, thousands of them), and readings are kept as where values were written: once its right side is done, a reading
  keeps only its own (`settled`). And what a `WeakRef` is made of is kept until the job ends, every value referred to in a
  run: the harnesses turn the event loop between functions, as the kernel's tests already do. With a bounded cache of
  structural reads, a process stays at about 130 MB over 25 functions (it reached 8 GB in 8).
- **MCG3 `return` in a rule's right side returns from the function that called the rule.** `wrapped` written with
  `(return value) if …` made every lifted function answer its first wrapped value.

## Decided

- **This proof comes before DP7 and DP8.** The zlib and gzip wrappers and the comparison with Kaitai Struct and
  Construct serve binary-format tooling; this serves interop, which is the goal. They stay in `Deflate.md`.
- **Branch.** `proposal/machine-code`, from `proposal/deflate-proof` with `proposal/interop-poc` merged in; nothing is
  committed into either.

## For main to decide

What this branch changes in the language, beyond fixes: each is a choice for the language, not for one proof, so it is
for main (and a new kernel) to make. For each: what it is, why the proofs need it, what else it could be, what this branch
recommends.

- **Integers with their own arithmetic** (`poc/interop/ints.ray`). Main's whole-number `-` stops at 0 (`2 - 5` is 0);
  machine integers wrap. Here `((a - b) as Int32)` is exact and `None` outside the type, `(… wrapped Int32)` wraps, and
  negatives are written `((1 - 34) as Integer)`. Else: signed integers in `Number` itself. Recommended: integer types as
  library classes over exact host operations, as here, with exact integers in the kernel (BigInt values, not
  `Number(BigInt)`: today exactness ends at 2^53, which 64-bit machine code passes).
- **List `==` by what the lists hold** (`js.kinds.ray`, through `alike`). The codec compares byte lists. Here every `==`
  of two objects asks whether they are lists, and two lists are equal when their values are. Recommended: structural
  `==` for lists, identity `===` as is.
- **`as` falls back to reading** (`.entrypoint.ray2`): `x as T` tries `T.from`, then reading text by `T`'s pattern
  (`text_read`), then bits by its header (`bits_read`): how `bytes as Deflate.Stream` reads a stream. Every failing `as`
  now costs two more readings. Recommended: keep, only for a class that has a header or a pattern.
- **Class headers** (`class (fields) {…}`, `class<P> (…)`, `<-Byte{== 8}`, conditional groups, alternatives, generics):
  the syntax binary formats are declared in, read and written by `structures3.ts`. Recommended: adopt; it is what (1b)
  rests on. Where the codec lives (in the kernel, or a library the kernel loads) is open.
- **Statics** (`static x := …`): made lazily and kept (`{name}_kept`), eagerly for a class or a list literal. The eager test
  is a text prefix (`begins "class"`), and `{name}_kept` is a name a program can collide with. Recommended: the kernel
  keeps a static's value itself, made on first read.
- **An assert in a block read again runs once** (`again()`): it made a list of 200 appends read its tests 200 times; it
  also means an assert in a loop body checks only the first pass. Recommended: decide what an assert in a block is (a
  declaration tested once, or a check every pass); this branch assumes the first.
- **`0b101` is a number** again, as on main (N44); a code's bits, where its length counts, are written as text (`"010"`, DF1,
  DF2). **`*` repeats text and lists** (`"ab" * 2`, `[0] * 3`), and with list `==` by values it is what fails IT71.
  Recommended: repetition kept, IT71 looked at with it.
- **A value read on reads its holes where it was written** (`3.binary(width)` in a call; `language.ts`): narrowed to the
  outermost node's rules, so a kind's own methods (`gcd`) read as on main.
- **`xs[n] = v` places the value** (PR #24, standing on its own).

What main's own tests say of this branch (Node 22, against main at 29d86861): 1115 passed, 1236 failed, 229 errors in
reading, where main has 1112, 1223 and 241. By each assert's id, 41 pass here that fail on main, and 17 fail here that
pass on main (there were 41). Found by putting back main's version of one change at a time: 19 came from a hole not
ending in an operator after a space (now only before a body, `if a > b { … }`, what it was for), 5 from a value read
on reading its holes where it was written (now only the outermost node's own rules, with arguments). Left, and where
from: `TY63`, `IT33`, `TI3`, `TI5`, `TI6`, `UN3`, `W17` fail when a class asks `plain {…}` of its header while it is
made, wherever it asks (in its block, or the rule's), why not found (the shape that would not: the kernel's codec
choosing the maker as the class is made, not a library rule asking in text); `PRJ25`, `PRJ33` from a variable's value
kept in its rule; `IT71` from the operators' bodies (`*` and `==`); `N44` (`0b101 == 5`, though `0b101` reads as 5 alone),
`N122`, `TI52`, `HS5`, `HS9`, `UN49`, `HT12` from no one change alone.

## Order of work

MC0 to MC7 in order, one commit each, kernel changes as commits of their own.
