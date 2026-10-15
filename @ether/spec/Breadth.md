# Breadth: every machine and every bytecode, sustainably

**Why.** Ray's aim is that programs in any language meet in one meaning without anyone rewriting them: Ray reads what
their compilers and interpreters already produce (machine code, bytecode) and writes it out again, as Ray or as another
language. That only holds if Ray reads every target, and a target written by hand does not scale (x86 is the first one
made from its vendor's own description instead, Intel's XED). This is how to cover all of them that way, and keep them
right as vendors and compilers change.

Two words used throughout. A **corpus** (plural *corpora*) is a fixed set of example programs, compiled by a real
compiler, whose bytes and outputs are pinned. The **ladder** is the sequence of checks run over a corpus, each against a
tool that is not Ray: the compiler's bytes, the disassembler's text, a native run.

The ladder runs on branch `proposal/machine-code` (tag `machine-code-proof`), on the kernel main had before its
self-hosting one (`Machine.md`).

## The problem

`$/x86/X86.ray` is written by hand: about 1100 lines for the part of x86-64 gcc emitted for 200 small functions and one
`inflate`. x86-64 has thousands of encodings, A64 about as many, and every CPython release changes its bytecode. Writing
each by hand, and fixing each by hand when a corpus finds a new form, is work that grows with every target and never ends:
it is the opposite of universal.

## What is already there

Two lines of work, each with half of what is needed.

- **Declarations from the vendors' own descriptions** (branch `asm`, `$/.asm/`): readers for Intel's XED records,
  Arm's ASL pseudocode, the Sail model of RISC-V, `riscv-opcodes`, Ghidra's SLEIGH, and ELF; what an instruction does
  translated into one form for all of them, a program whose only control is the conditional goto; the vendors'
  descriptions fetched at pinned versions (`external.sh`), not kept in the repository.
- **The ladder that says a declaration is right** (this branch, `poc/machine`): for a corpus a compiler made, each step
  checked against an oracle that is not Ray. Bytes read and written back (the compiler's bytes), text printed (the
  disassembler's text), meaning lifted and run (the compiler's object, run natively), compiled back through Ray and run
  natively, read back and lifted again; and a real program (`inflate`) through all of it.

Neither is enough alone: declarations without the ladder are believed, not shown; the ladder over hand-written
declarations does not scale.

## The design

1. **No instruction is written by hand.** Each target's declaration is made by Ray from the vendor's machine-readable
   description at a pinned version: XED for x86, Arm's A64 release (ASL and its XML) for AArch64, Sail and
   `riscv-opcodes` for RISC-V, the WebAssembly spec for Wasm, CPython's own `Python/bytecodes.c` (a description of every
   opcode, its stack effect and its body) and `Lib/opcode.py` for Python bytecode, the JVM specification's tables for
   class files. A new vendor release is a new pin and a new run, not new code.
2. **One meaning for all of them.** What an instruction does is the shared goto program (registers a file, memory bytes,
   flags values, control a conditional goto). The lift into readable Ray functions (`lift_flow`, `lift_called`) and the
   lowering back (`compiled_flow`, `laid_out_program`) work on that form, not on one instruction set. Then "two machines,
   one meaning" is a check, not a claim: the same C, compiled for x86-64 and for AArch64, lifts to programs that answer
   alike.
3. **One ladder, every target.** The steps of `Machine.md` (MC1 to MC10) become target-independent: a target supplies a
   compiler, a disassembler and a way to run its code; the corpora, the harness and the comparisons are shared.

   | Target | Kind | Compiler | Text oracle | Run oracle |
   |---|---|---|---|---|
   | x86-64 | processor | gcc, clang | objdump, llvm-mc | native |
   | AArch64 | processor | aarch64-linux-gnu-gcc, clang | aarch64 objdump | qemu-aarch64 |
   | RISC-V | processor | riscv64 gcc, clang | riscv64 objdump | qemu-riscv64 |
   | Wasm | virtual machine | clang `--target=wasm32` | wasm-objdump | a Wasm engine |
   | CPython bytecode | interpreter | `python3 -m py_compile` | `dis` | the same `python3` |

   CPython is there on purpose: an interpreter's bytecode, not a processor, so the same ladder covers interpreted
   languages; and CPython describes its bytecode in C (`Python/bytecodes.c`), which Ray already reads (point 5).

4. **Corpora made, not collected.** Templates and random programs (as `make.py`, `flow.py`, `memory.py` do), compiled at
   several optimisation levels, pinned by hash; a real program per target (`inflate`, then larger) as the end of each
   ladder. Every form a compiler emits that a declaration does not read is found by a corpus, and fixed in the reader of
   the vendor's description, so it is fixed for every instruction like it.
5. **Through itself.** Where a description is code in a language Ray reads, Ray reads it with that reader: CPython's
   `bytecodes.c` is C, read by the interop C reader, so Python's bytecode is declared by Ray reading CPython's own
   definition. A Python release is then a pin, and Python meets C through what each emits.
6. **Speed by compiling, checked by interpreting.** The interpreter is the meaning; corpora are run natively, Ray's lowering
   writing the machine code, and checked against the interpreter on small inputs. A faster kernel shortens the checks,
   it does not change them.
7. **Change triggers runs.** Each target's ladder runs when its reader, its pin or the shared lift changes (path-triggered
   CI); a scheduled run only watches the vendors for new releases.

## Order

1. x86-64 from XED instead of `X86.ray`: the ladder exists, so it shows at once what XED's reader reads and what it
   misses (the 659 forms of `inflate` are a first acceptance list). `X86.ray` stays as the oracle's oracle until XED's
   declaration passes every step it passes. Done for encodings and text (`Machine.md`, "The same ladder on a declaration Ray
   made from XED"): Ray reads XED's records into 358 forms, and the ladder passes on them; what each instruction class
   does is still written by hand (about 130 lines, per class not per encoding) until SLEIGH's semantics are read.
2. AArch64 from Arm's release, the same corpus compiled by aarch64 gcc, run by qemu: the first "two machines, one meaning".
3. CPython bytecode from `bytecodes.c` through the C reader: the first interpreted target, and the first declared through
   itself.
4. RISC-V (Sail) and Wasm, each a pin and a ladder.

## What it needs from the kernel

The goto programs of a real program run long: a run must not hold every value it wrote into text until it ends
(`Machine.md`, "What a kernel needs"), and the vendor descriptions are large (XED's records took twenty minutes to read):
reading one once into a tree, not text read again, is what makes either feasible.
