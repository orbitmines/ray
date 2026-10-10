# Interop POC: one function across a language boundary, through Ray

The smallest proof of the Almanac's claim that languages interoperate before applications do (U13.1): a function written
in one language is read into Ray, and Ray writes it for another language, which then uses it without the first
language's compiler, runtime or library on the run path. Two tracks:

- **Track A, compiled to compiled:** C to Rust.
- **Track B, interpreted to compiled:** Python to C.

Every item is **Q** (needs your decision) unless it is under **Decided**. IDs `IOP…`.

Principle (Plan.md, 2026-10-06): Ray itself is the IR. A reader turns source text straight into a Ray `Program`; a writer
is a rule set over that Program, in the style of `v0.ts/javascript.o.ray`. There are no AST records, no instruction
enums, no intermediate format between a language and Ray.

---

## IOP0. Scope

- **One function, three languages.** Every step uses `add(a, b) = a + b`. The example stays fixed so the only thing that
  changes is the language around it.
- **In:** reading a two-rule subset of C and of Python; writing a two-rule subset of Rust and of C; a differential check
  per track.
- **Out:** anything beyond `add`; real C or Python grammars; linking; calling conventions; a shared runtime; the binary
  path (IOP5), which comes after the MVP.
- **The engine is the v0 engine.** Readers and writers are `.ray` files run by `@ether/v0.ts`. When the engine cannot
  do a step, the step stops and the gap is recorded under **Engine gaps** with the probe that shows it. No TS stand-ins.

## IOP1. Layout

All POC files live in `@ether/poc/interop/`:

| File | Role |
|---|---|
| `README.md` | The walkthrough: one section per step, in order |
| `run.sh` | `./run.sh <STEP>` runs one step, e.g. `./run.sh A3` |
| `add.c` | Track A source; also the oracle (S1) |
| `add.py` | Track B source; also its oracle (B5) |
| `c.ray` | Reader: the C subset into a Ray Program |
| `python.ray` | Reader: the Python subset into a Ray Program |
| `rust.o.ray` | Writer: `Compiler.rust` |
| `c.o.ray` | Writer: `Compiler.c` |
| `main.rs` | Rust caller of the generated `add` |
| `main.c` | C caller of the generated `add` |
| `oracle.c` | C caller of the hand-written `add.c` (S1) |
| `oracle.py` | Python caller of `add.py` (B5) |
| `inputs.txt` | In-domain inputs, one `a b` pair per line |
| `inputs.overflow.txt` | Track B only: pairs whose sum leaves the 32-bit range |
| `out/` | Generated files and binaries; ignored by git |

The readers stay inside the POC and not in `$/c` or `$/python`: a two-rule subset does not get to claim the name of a
language.

## IOP2. Every step has the same shape

Each step in `README.md` has five parts, and each step is one commit:

1. **Goal.** One sentence.
2. **What happens.** The mechanism, in plain words.
3. **Why it matters.** Which interop goal it shows, (I) to (IV) from U13.1, or which assumption it removes.
4. **Command.** One `./run.sh <STEP>` line.
5. **Pass.** The exact expected output, or the check that compares it. A step passes only when the command's output
   matches; a claim in prose never passes a step.

## IOP3. Ground

### S0. Engine probe

- **Goal.** Show the v0 engine can read text through a class pattern and print a value.
- **What happens.** A `.ray` file declares a class whose header is a pattern (as `IP.ray` does with
  `({segments.join(".")})`), reads `"2 + 3"` with it, and prints the two operand names it captured.
- **Why it matters.** Every reader in this POC is a class pattern. If this does not work, nothing below does.
- **Pass.** Prints `2` and `3`. Otherwise: record under Engine gaps and stop.

### S1. Oracle

- **Goal.** Fix the truth that every later step is compared against.
- **What happens.** gcc compiles the hand-written `add.c` with `oracle.c`, which reads `inputs.txt` and prints one sum per
  line into `out/oracle.txt`.
- **Why it matters.** "Interoperates" means "gives the same answers". An oracle makes that a diff, not an opinion.

`add.c`:

```c
int add(int a, int b) { return a + b; }
```

`inputs.txt`:

```
2 3
0 0
-7 4
2147483646 1
-2147483648 0
```

- **Pass.** `out/oracle.txt` is `5`, `0`, `-3`, `2147483647`, `-2147483648`, one per line.

## IOP4. Track A: C to Rust

### A1. Read C into Ray

- **Goal.** `add.c` becomes a Ray Program.
- **What happens.** `c.ray` holds two patterns: a function header `int NAME(int A, int B) { return EXPR; }` and an
  expression `NAME + NAME`. Reading `add.c` with them gives a Program; the step prints it.
- **Why it matters.** This is the moment C stops being C. From here on the function is a Ray value, and anything that can
  write a Ray value can carry it into another language.
- **Pass.** The printed Program is the target form below (exact text fixed when A1 is built; see IOP7.1).

```ray
add (a: Number{-2^31 <= . < 2^31}, b: Number{-2^31 <= . < 2^31}): Number{-2^31 <= . < 2^31} => a + b
```

### A2. The boundary type

- **Goal.** Make the meaning of C's `int` explicit in the Program.
- **What happens.** Nothing new runs; the step explains the types A1 produced. On x86-64 with gcc, `int` is 32 bits, so
  each parameter and the result are the narrowing `Number{-2^31 <= . < 2^31}`. Overflowing it is undefined behaviour in C,
  so the C original has no defined answer outside that range.
- **Why it matters.** The width is part of what the function means. A translation that drops it (writing an unbounded
  integer in the target) would be a different function that happens to agree on small inputs.
- **Consequence for Track A.** Out-of-range sums are left out of `inputs.txt`: the oracle has no defined answer there, so
  there is nothing to compare against.
- **Pass.** `./run.sh A2` prints the three types from the Program and they are the narrowing above.

### A3. Write Rust

- **Goal.** The Program becomes `out/add.rs`.
- **What happens.** `rust.o.ray` declares `Compiler.rust`, a rule set like `Compiler.javascript`: one rule for the
  function header, one for `{a} + {b}`, and one mapping the 32-bit narrowing to `i32`. The result is narrowed too, so the
  sum is checked: a narrowed result becomes an `Option`, `None` when the narrowing fails.
- **Why it matters.** The writer knows Ray and Rust, never C. Any language with a reader into the same Program now reaches
  Rust through this one file. And the Rust version is defined where the C original is not: the narrowing in the Program
  says what overflow means, so the writer cannot drop it.
- **Pass.** `out/add.rs` is exactly:

```rust
pub fn add(a: i32, b: i32) -> Option<i32> { a.checked_add(b) }
```

### A4. Use it from Rust

- **Goal.** A Rust program calls the generated `add`.
- **What happens.** `main.rs` declares `mod add;`, reads `inputs.txt` and prints one sum per line, or `out of domain` on
  `None` (never reached on `inputs.txt`, see A2). rustc builds it with
  `out/add.rs`. No C object, no static or shared library, and no `extern "C"` is involved.
- **Why it matters.** This is goal (I): using code from another language without a shared library. The C compiler is not
  on the build path or the run path.
- **Pass.** The step's only build command is `rustc main.rs -o out/main-rs` (with `main.rs` pulling in
  `#[path = "out/add.rs"] mod add;`): no `-l`, no `.o`, `.a` or `.so` argument, and gcc is not run in this step.

### A5. Prove Track A

- **Goal.** The Rust binary and the C oracle agree.
- **What happens.** `out/main-rs < inputs.txt > out/rust.txt`, then `diff out/oracle.txt out/rust.txt`.
- **Pass.** The diff is empty.

## IOP5. Track B: Python to C

### B1. Read Python into Ray, and meet Track A

- **Goal.** `add.py` becomes a Ray Program, and that Program equals A1's.
- **What happens.** `python.ray` holds two patterns: `def NAME(A: int, B: int) -> int:` followed by an indented
  `return EXPR`, and `NAME + NAME`. Reading `add.py` gives a Program, which the step compares with A1's using `==`.

`add.py`:

```python
def add(a: int, b: int) -> int:
    return a + b
```

- **Why it matters.** This is the centre of the POC. Two languages with nothing in common at run time, one compiled and
  one interpreted, produce the same Ray value. From that point it no longer matters which language the function came
  from.
- **The types differ before B2.** Python's `int` is unbounded, so B1's Program reads `a: Number`, and `==` with A1 is
  false until B2 narrows it. The step prints both Programs and the result of `==` before and after B2.
- **Pass.** Before B2: `false`. After B2: `true`.

### B2. Choose the semantics at the boundary

- **Goal.** Decide, explicitly, what Python's unbounded `int` becomes in C.
- **What happens.** The boundary narrows parameters and result to `Number{-2^31 <= . < 2^31}`. The narrowing on the result
  is a condition the C side has to check, and C has no exceptions, so a failure becomes part of the interface.
- **Why it matters.** This is goal (II) in miniature: across a boundary, one side's semantics is chosen, here C's 32-bit
  integers with an explicit failure instead of Python's big integers. The choice is written in the Program, not hidden in
  the writer.
- **Pass.** `./run.sh B2` prints the narrowed Program, and B1's `==` with A1 is `true`.

### B3. Write C

- **Goal.** The narrowed Program becomes `out/add.c`.
- **What happens.** `c.o.ray` declares `Compiler.c`. A narrowed result becomes an out-parameter and a `bool` that is
  `false` when the narrowing fails, the C counterpart of A3's `Option`. gcc's `__builtin_add_overflow` checks it.
- **Pass.** `out/add.c` is exactly:

```c
#include <stdbool.h>
bool add(int a, int b, int *result) { return !__builtin_add_overflow(a, b, result); }
```

### B4. Use it from C

- **Goal.** A C program calls the generated `add`.
- **What happens.** `main.c` reads pairs from stdin and prints the sum, or `out of domain` when `add` returns `false`.
  gcc builds it with `out/add.c`.
- **Why it matters.** The interpreted original is gone from the run path: no python3, no libpython, no embedding.
- **Pass.** `ldd out/main-c | grep -c python` prints `0`.

### B5. Prove Track B

- **Goal.** The C binary and Python agree wherever both are defined, and disagree visibly where they are not.
- **What happens.** `oracle.py` imports `add.py` and prints one sum per line. Both run over both input files.
- **Pass.**
  - On `inputs.txt`: `diff` of the python3 output and the C output is empty.
  - On `inputs.overflow.txt` (`2147483647 1`, `-2147483648 -1`): python3 prints `2147483648` and `-2147483649`; the C
    binary prints `out of domain` twice. This is the B2 choice working, so it is the expected result, not a mismatch.

## IOP6. After the MVP: the binary path

### C1. Read machine code

- **Goal.** Read gcc's output for `add` and arrive at the same Program as A1.
- **What happens.** `gcc -O2 -c add.c` gives `lea eax, [rdi+rsi]` then `ret`. A reader for those two x86-64 instructions
  and the System V convention (first two integer arguments in `edi`, `esi`; result in `eax`) produces a Program, which is
  compared with A1's.
- **Why it matters.** This is the Almanac's path (1b) and LIB1: decompiling the backends compilers already target, instead
  of writing a backend per compiler.
- **Not in the MVP.** Built only after A5 and B5 pass.

## IOP7. Open

- **IOP7.1 The printed form of a Program.** A1's pass needs exact text. Recommend: whatever the engine prints for a
  function value today, frozen in `README.md` at the commit that makes A1 pass.
- **IOP7.2 A name for the 32-bit narrowing.** The spec writes `Number{-2^31 <= . < 2^31}` everywhere because no
  fixed-width integer type exists in `@ether/ray`. Recommend: keep the narrowing in the POC and leave naming to
  Numbers.md.
- **IOP7.3 Python type hints.** `add.py` carries hints so the reader has types to read; Python itself does not enforce
  them. Recommend: keep the hints, and say so in B1. A hint-free reader would type `a` and `b` as `*` and need B2 to narrow
  them further.

## Engine gaps

Empty. A step blocked by the engine adds an entry here: the step, the probe file, its output, and what the engine would
need.

## Decided

Answers from 2026-10-10:

- The POC goes through Ray: readers into a Ray Program, writers out of it. Not a plain FFI demo.
- Track A is C to Rust, Track B is Python to C.
- The MVP reads source. Reading gcc's output is IOP6, after the MVP.
- Readers and writers are `.ray` on the v0 engine; engine gaps are recorded, not worked around in TS.
- B1's `==` between the two Programs is the centre of the POC.
- Overflow is guarded explicitly, never wrapped: a narrowed result is checked by every writer (`Option` in Rust, a `bool`
  and an out-parameter in C), because equal Programs must mean the same thing in every target.

## Order of work

S0, S1, A1, A2, A3, A4, A5, B1, B2, B3, B4, B5. Track B reuses A1's Program as the comparison in B1, so it starts only after
A1 passes. C1 waits for A5 and B5.
