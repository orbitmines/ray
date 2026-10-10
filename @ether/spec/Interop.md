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

- **Goal.** Show the engine reads text through a class pattern.
- **What happens.** `poc/interop/s0.ray` declares `Sum := class (left, " + ", right) => { }`, reads `"a + b" as Sum`, and
  claims its `left` is `"a"`, its `right` is `"b"`, and that `"a - b" as Sum` is nothing. `run.mts` boots language3 as
  `site3.mts` does (`.entrypoint.ray2`, `js3.kinds.ray`, the core library) and evaluates each claim's condition itself: a
  claim holds only when its condition answers the `true` node (`false` or `None` for an `if` claim), so a condition the
  engine leaves unread fails instead of passing.
- **Why it matters.** Every reader in this POC is a class pattern. If this does not work, nothing below does.
- **Pass.** `./run.sh S0` prints `ok` for S0.0 to S0.3 and exits 0. On the kernel before IOPG1 it prints `FAIL` for S0.1
  and S0.2.

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

- **Goal.** `add.c` becomes a Ray value, and Ray runs it.
- **What happens.** `io.ray` gives Ray the file's text (`text_of_file "add.c"`, a host rule: reading a file is the host's
  job). `c.ray` holds two classes whose headers are the C subset, `C.Function` (`"int ", name, "(int ", a, ", int ", b,
  ") { return ", body, "; }"`) and `C.Sum` (`left, " + ", right`). `text as C.Function` reads the function; its `sum` reads
  the body as a `C.Sum`; its `call (x, y)` runs it: each operand that names a parameter takes that argument, and the two
  are added in Ray.
- **Why it matters.** This is the moment C stops being C. From here on the function is a Ray value, and anything that can
  write a Ray value can carry it into another language.
- **Pass.** `./run.sh A1`: claims A1.1 to A1.7 hold (name `add`, parameters `a` and `b`, the body's operands, `call(2, 3)
  == 5`, `call(-7, 4) == -3`). With `add.c` changed to `a * b`, A1.4 to A1.7 fail.

### A2. The boundary type

- **Goal.** Make the meaning of C's `int` explicit in what A1 read.
- **What happens.** On x86-64 with gcc, `int` is 32 bits, so `c.ray` gives the read function the type
  `C.int := Number{(. >= (1 - 2147483649)) && (. <= 2147483647)}` (the narrowing `Number{-2^31 <= . < 2^31}`; this engine
  reads `^` as highlighting and `-2147483648` as text, IOPG4, so the bounds are written out). `call` takes only arguments
  of that type and answers `None` when the sum leaves it. Overflowing it is undefined behaviour in C, so the C original
  has no defined answer there; the Ray function now has one, and it is the one every writer must keep (A3's `Option`, B3's
  `bool`).
- **Why it matters.** The width is part of what the function means. A translation that drops it (writing an unbounded
  integer in the target) would be a different function that happens to agree on small inputs.
- **Consequence for Track A.** Out-of-range sums are left out of `inputs.txt`: the oracle has no defined answer there, so
  there is nothing to compare against.
- **Pass.** `./run.sh A2`: claims A2.1 to A2.10 hold. The type is `C.int`; 2147483647 and -2147483648 are ints, one past
  either is not; sums up to either bound are answered; a sum past either bound, or an argument that is no int, answers
  `None`. Before the type was added, A2.1, A2.2, A2.4, A2.7 and A2.8 failed.

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

- **IOP7.1 The printed form of a Program.** Answered by building A1: the read function is the Ray value itself (a
  `C.Function` instance), and A1 passes on claims about it, not on printed text.
- **IOP7.2 A name for the 32-bit narrowing.** The spec writes `Number{-2^31 <= . < 2^31}` everywhere because no
  fixed-width integer type exists in `@ether/ray`. Recommend: keep the narrowing in the POC and leave naming to
  Numbers.md.
- **IOP7.3 Python type hints.** `add.py` carries hints so the reader has types to read; Python itself does not enforce
  them. Recommend: keep the hints, and say so in B1. A hint-free reader would type `a` and `b` as `*` and need B2 to narrow
  them further.

## Engine gaps

A step blocked by the engine adds an entry here: the step, the probe file, its output, and what the engine would need.

- **IOPG1 S0: a class pattern does not read a string. Resolved 2026-10-10.**
  - **Was.** `"a + b" as Sum` answered no instance on language3, the shipped kernel, and the kernel before the 2026-10-09
    rewrite: `as` fell back to `T.from(x)`, which answers `None`, and no class read its header as a pattern.
  - **Now, kernel (`language3.ts`).** A hole is quoted text (spaces included) when the literal before it ends with a quote
    and the literal after it begins with the same quote, not only when they are the quote alone (`quoting`), so
    `("{written}") gets …` reads `(" + ") gets …`. `goto js` gets `$.whole(text, node)`: whether the node's own rules read
    the text whole (the check a typed hole makes, `structural`).
  - **Now, host (`js3.kinds.ray`).** `node reads_text text`: the text read in the node when its own rules read it whole,
    else `None` (text that is no pattern is never run as code). `headed {{header}}`: a header of literals and untyped
    fields defines its reading rule where it is read, `{left} + {right} => ["{left}", "{right}"]` (literal `{` and `}`
    written as `` {`{`} ``); any other header defines nothing.
  - **Now, language (`.entrypoint.ray2`).** A literal parameter takes no argument (`("{written}") gets {value}` answers
    `false`), so `Sum("u", "v")` gives `right == "v"`. Each class with fields has a `text_reader` node and `text_read (x)`,
    which installs the header's rule in `text_reader` when first used and makes the instance from what it read; `as`
    answers `T.from(x) ?? T.text_read(x)`. The rule lives in `text_reader`, not the class, so an instance's own methods are
    not read by it (`joined => left + right` stays `"ab"`), and the instance is made outside it.
  - **Claims.** `types.ray` HD17 to HD20, and `poc/interop/s0.ray`. On the strict runner HD17, HD18, HD20 and S0.1, S0.2
    fail before and pass after.
  - **Tried and dropped.** The rule in the class itself: the class's methods were read by it (`left + right` became a new
    instance). Installing the rule when each class is defined: reading the header statement for every library class
    changed how units read (`1B == 8b` left unread). Typed fields in the rule head: the same.
- **IOPG2 Typed fields in a header pattern.** `class (local: Email.Local, "@", domain: Email.Domain)` and HD8
  (`tagged_of #21` through `{written: Tagged}`) still do not read: a typed hole reads with the type's own rules, and the
  header's rule is in `text_reader`. The POC does without them (A1 reads the body untyped, then `as Sum`). Needs a decision:
  where a typed hole finds a class's pattern.
- **IOPG3 Unnamed type pieces.** `UUID`'s header `(Hexadecimal₈, "-", Hexadecimal₄, …)` names no fields; `headed` takes
  only lowercase names as fields, so such a header defines nothing yet.

- **IOPG4 The literal `0` with the library loaded.** `0 - 7` answers NaN and `-7` stays text, while `2 - 9` answers
  `-7`: with the core library read, `0` is the library's value, not the host's number. A1.7 writes its negative numbers
  as differences of non-zero numbers.

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
