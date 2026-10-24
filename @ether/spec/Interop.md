# Interop POC: one function across a language boundary, through Ray

Measured on the kernel main had before its self-hosting one (`language.ts` as of 29d86861, with this proof's changes), on branch `proposal/machine-code`, tag `machine-code-proof`: the files named here are there, not on main.

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

- **Goal.** The Ray value from A1 and A2 becomes `out/add.rs`.
- **What happens.** `rust.o.ray` declares `Rust`, a writer over the value's shape (`name`, `a`, `b`, `sum` with `left` and
  `right`, `type`). It maps a type by what it admits, not by its name: a type that admits -2147483648 and 2147483647 and
  neither number past them is `i32` (`Rust.i32`). The result is narrowed, so the sum is checked: the result type is
  `Option<i32>` and the body `left.checked_add(right)`, `None` when the narrowing fails. `io.ray`'s `written_to_file`
  writes the text. (Named `Rust`, not `Compiler.rust`: a member added to the library's `Compiler` would change its levels.)
- **Why it matters.** The writer knows Ray and Rust, never C (`rust.o.ray` does not mention `C`). Any language with a
  reader into the same shape now reaches Rust through this one file. And the Rust version is defined where the C original
  is not: the narrowing says what overflow means, so the writer cannot drop it.
- **Pass.** `./run.sh A3`: claims A3.1 to A3.4 hold (the narrowing is written `i32`, an unbounded `Number` is not, the text
  equals `expected/add.rs`, it is written to `out/add.rs`), and `out/add.rs` is byte for byte `expected/add.rs`:

```rust
pub fn add(a: i32, b: i32) -> Option<i32> { a.checked_add(b) }
```

### A4. Use it from Rust

- **Goal.** A Rust program calls the generated `add`.
- **What happens.** `./run.sh A4` writes `out/add.rs` again (A3), then builds `main.rs`, which declares
  `#[path = "out/add.rs"] mod add;`, reads `a b` pairs from stdin and prints each sum, or `out of domain` on `None`. The
  only build command is `rustc --edition 2021 main.rs -o out/main-rs`: no `-l`, no `.o`, `.a` or `.so`, no `extern "C"`,
  and gcc is not run.
- **Why it matters.** This is goal (I): using code from another language without a shared library. The C compiler is not
  on the build path or the run path.
- **Pass.** The binary holds no plain `add` symbol, defined or undefined (a C-ABI `add` is never mangled; the Rust one is
  `main::add::add`); `2 3` gives `5`; `2147483647 1` gives `out of domain`. Control: the same program linked to gcc's
  `add` through `extern "C"` and a static library holds `T add` and is flagged. (`nm -u` alone was not enough: static
  linking leaves no undefined symbol.)

### A5. Prove Track A

- **Goal.** The Rust binary and the C oracle agree.
- **What happens.** `./run.sh A5` runs S1 and A4 again, then `out/main-rs < inputs.txt > out/rust.txt` and
  `diff out/oracle.txt out/rust.txt`.
- **Pass.** The diff is empty: `5`, `0`, `-3`, `2147483647`, `-2147483648` from both. Control: the same `main.rs` over an
  `add.rs` that subtracts differs from the oracle, and `diff` fails.

## IOP5. Making the claim testable (N0 to N6)

Track A proves the pipeline runs for one function, but its reader and writer are templates and the "same value" of the
old B1 could only hold by construction (two readers with the same field names). This part replaces the old Track B
(B1 to B5) with the version that tests the claim. Track A stays as the baseline until N4 replaces it.

- **The shared shape is Ray code.** Each reader emits one Ray function in a normal form fixed here, not by either
  reader: fully bracketed, every operation's result narrowed with `as`, parameters typed. For example
  `add (a: Int32, b: Int32) => (((a + ((b * c) as Int32)) as Int32))`. Ray defines and runs it; there is no record
  vocabulary in between (Plan.md, 2026-10-06).
- **Readers are grammars** over a small integer subset: any number of parameters; C `int` and `long`, Python `int`;
  `+`, `-`, `*`, brackets, names and number literals; spacing free; C on one line or several; Python with an indented
  `return`.
- **Writers are rule sets over Ray expressions** (`Rust`, `C`) that dispatch on `+`, `-`, `*` and `as T` and recurse;
  the text is built by plain functions outside the rule set (a rule set's own rules would read its right sides).
- **Types carry their bounds.** `ints.ray` declares `Int32`, `Int64` and `Integer` (unbounded); a writer maps a type by
  its bounds, read from the type.
- **Evidence is a corpus.** `gen.py` writes N seeded random functions, each as C and as Python source with random
  spacing, line breaks and redundant brackets.

### N0. The normal form and the integer types

- **Goal.** Fix the shared shape before any reader exists.
- **The normal form.** Both readers must emit exactly this, as text:

```
function   := name " (" parameter (", " parameter)* ") => " expression
parameter  := name ": " type
expression := name | literal | "((" expression " " operator " " expression ") as " type ")"
operator   := "+" | "-" | "*"
type       := "Int32" | "Int64" | "Integer"
literal    := "1" .. "9"
```

  Every operation is bracketed and narrowed to the function's type (in the subset all parameters share one type), so an
  intermediate leaving the type answers `None` and the `None` reaches the result. Literals are 1 to 9: the literal `0`
  is the library's own number once the library is read (IOPG4).
- **What happens.** `ints.ray` declares `Int32` and `Int64` as narrowings of `Number` whose bounds are fields (`low`,
  `high`), so a writer reads them, and `Integer`, unbounded, whose `low` and `high` are `None`. `n0.ray` claims them, and
  claims hand-written normal-form functions: a sum, a nested product, a cancelling form whose result would fit but whose
  intermediate does not, and an unbounded product.
- **Pass.** `./run.sh N0`: N0.1 to N0.15 hold. Before `ints.ray`, eleven failed.

### N1. The C grammar

- **Goal.** C source becomes normal-form Ray code.
- **What happens.** `read.c.ray`. The source is first split into tokens separated by single spaces (`spaced_tokens`, a
  generic text operation in `io.ray`; the symbols it splits on, `( ) , ; + - * { }`, are given by the C reader), so
  spacing and line breaks are free. Then:
  - `CFunctionText`, a header pattern (`written_type, " ", name, " ( ", parameters, " ) { return ", body, " ; }"`), reads
    the function;
  - `CParameters` reads the parameter list (`int {name}`, `long {name}`, `{first} , {rest}`);
  - `CExpression` reads the body: `*`, then `+` and `-`, then brackets. Rule order gives precedence; the longest left
    side gives left association; `+` and `-` go on to the next reading (`goto .`) while their right side still holds a
    top-level `+` or `-`, so `a - b + c` is `((a - b) + c)`. A leaf is a name or a literal 1 to 9 (`fits_pattern`);
    anything else (`a / 2`) makes the whole function `None`.
  - The rule sets only dispatch; the text is built by plain functions beside them (a rule set's own rules would read its
    right sides).
- **Pass.** `./run.sh N1`: N1.1 to N1.9. Six variants in `n1/` read to the text beside them (`add.c`; three parameters
  with no spaces and precedence; `long`, brackets and a literal; several lines and left association; a body that is a
  name; redundant brackets); `a / 2` reads as nothing; the Ray read from `f.c`, defined with `ray_code`, runs and answers
  `None` past `Int32`.

### N2. The Python grammar

- **Goal.** Python source becomes normal-form Ray code, with Python's `int` as `Integer`.
- **What happens.** `read.python.ray`, written apart from the C reader (its own rule sets, names and structure, so that
  N3's agreement is not shared code agreeing with itself). Tokens split on `-> ( ) , : + - *`. Two header patterns, with
  and without `-> int`; parameters annotated (`a: int`) or bare; the body on the same line or indented on the next.
  Expressions as in N1 (the subsets' grammars coincide; the rules are written again).
- **Pass.** `./run.sh N2`: N2.1 to N2.9. Six variants in `n2/` (each valid Python, checked with `ast.parse`) read to the
  text beside them; `a / 2` reads as nothing; the Ray read from `f.py` runs, and past `Int32` it is exact, as Python is
  (`f(1, 65536, 65536) == 4294967297`).

### N3. The corpus, and the two readers agree (the centre)

- **Goal.** For every function in a generated corpus, the Ray code read from C equals the Ray code read from Python
  once the boundary chooses C's type, and the Ray code computes what Python computes.
- **What happens.** `gen.py` (seeded) builds a random expression tree per function (one to four parameters, `+ - *`,
  parameters and literals 1 to 9, depth up to 3, an operation at the root), and writes it as C (`int` or `long`, one
  line or several) and as Python (annotated or bare, body on the same line or indented), with random spacing and
  redundant brackets; brackets are added only where the tree needs them, so each reader must recover the tree. It also
  writes the tree's normal form, and a Ray claims file. The boundary choice (the old B2) is a parameter of the Python
  reader: `p_ray_with(source, "Int32")` reads Python at C's type; with `"Integer"` it reads Python as Python.
- **Claims per function.**
  - (a) Ray from C equals Ray from Python at C's type: the agreement.
  - (b) Ray from C equals the generator's normal form, so agreeing on something wrong would not pass.
  - (c) Ray from Python (`Integer`, defined with `ray_code`) answers what the real `python3` answers running the
    generated source, on three inputs from -50 to 50 (Ray's numbers are host floats, exact below 2^53; the 32 and 64-bit
    edges are N4's and N5's, which compare compiled programs).
- **Pass.** `./run.sh N3` (`COUNT`, `SEED`): every claim holds. Seeds 1, 2 and 3, 40 functions each: 200 of 200 each, 120
  functions in all. Control: `MUTATE=7` changes one operator in f7's Python only; exactly `N3.7.a` fails (f7's (c)
  claims still hold, the mutated Python being consistent with itself).

### N4. The Rust writer, Track A over the corpus

- **Goal.** For every corpus function, C read into Ray and written by Ray as Rust answers what gcc's C answers wherever
  C's answer is defined, and refuses exactly where it is not.
- **What happens.** `write.rust.ray`: the normal form is split at its fixed separators (`text_before`, `text_after`) and
  its parts tokenized; `RustParameters` writes `a: i32`; `RustExpression` dispatches `( ( L op R ) as T )` and recurses,
  `L.checked_add(R)?` (`sub`, `mul`), the function returning `Option<T>` with its body in `Some(…)`, literals suffixed
  with their type (`7i32`). A type maps to the Rust integer with exactly its bounds (`low`, `high` read from the type);
  `Integer` has none, so a Python function must be narrowed at the boundary before Rust can be written. `gen.py` writes
  `writes.ray` (C, then Ray, then Rust, per function) and `corpus.json` (each tree). `check.py` builds every Ray-written
  function into one `rustc` binary and every C function into one gcc binary, runs both on inputs mixing the type's edges
  (`±2^31`, `±2^63`, `65536`, `46341`, `3037000500`, …) and random values, and judges each answer against exact
  arithmetic over the tree: where Rust answers, it must equal gcc and the exact value, with no intermediate leaving the
  type; where Rust answers `None`, an intermediate must leave the type (so gcc's answer is undefined behaviour).
- **Pass.** `./run.sh N4` (`COUNT`, `SEED`, `INPUTS`). Seeds 1, 2 and 3, 40 functions and 50 inputs each: 6000 inputs,
  3032 answered and equal to gcc and exact, 2968 refused where an intermediate leaves the type, 0 wrong. Control: one
  `checked_add` turned into `checked_sub` in a Ray-written `f5.rs` gives 36 wrong.
- **Engine notes.** A Ray function's text cannot be read through a header pattern (its ` => ` makes the text a
  definition, which crashed the engine), so the writer splits it with text operations. `x[k]` with a variable `k` looks
  up the member named by `k`'s text, not its value, so types are found with `value_named`. A rule head such as
  `{name}{`:`} {type}` crashed the engine on `a: Int32`, too close to Ray's own declarations; tokenized parameters
  (`a : Int32`) with the type written in the rule (`{name} : Int32`) read.

### N5. The C writer, Track B over the corpus

- **Goal.** For every corpus function, Python read into Ray at C's type (the boundary choice) and written by Ray as C
  answers what `python3` answers wherever no intermediate leaves the type, and refuses exactly where one does.
- **What happens.** `write.c.ray`, the same shape as the Rust writer: `ToCExpression` dispatches `( ( L op R ) as T )`
  to `ray_add_int(L, R, &ok)` (`sub`, `mul`; `_long` for `Int64`), the function is `bool f(int a, …, int *result)`,
  answering `false` when any operation overflowed. Ray also writes the helpers into `checked.h`, each one gcc's
  `__builtin_*_overflow`, which always stores the wrapped value, so the written C has no undefined behaviour at all.
  A Ray string holding both `{` and `}` is read as a hole, so braces come from `to_c_open`, `to_c_close`, and newlines
  from `character_of 10` (Ray strings have no escapes). `check.py --track b` builds every Ray-written function into one
  gcc binary (`-std=c11 -O2 -Wall -Werror`) and judges each answer against `python3` running the generated `.py`.
- **Pass.** `./run.sh N5`. Seeds 1, 2 and 3, 40 functions and 50 inputs each: 6000 inputs, 2953 answered and equal to
  python3, 3047 refused where an intermediate leaves the type, 0 wrong. Control: one `ray_add_` turned into `ray_sub_` in
  a Ray-written `f5.ray.c` gives 30 wrong.

### N6. Drop-in

- **Goal.** What Ray writes can replace the original C without changing the program around it.
- **What happens.** `rust_function_c_abi` writes the C-ABI Rust of a Ray function with wrapping arithmetic (the writer's
  overflow policy, `rust_policy`, is `checked` or `wrapping`): `#[no_mangle] pub extern "C" fn f(a: i32, …) -> i32 {
  a.wrapping_add(…) }`, built as a Rust static library.
  1. S1's unchanged `oracle.c` is linked to Ray's Rust `add` (from `add.c`, through Ray) instead of to `add.c`.
  2. Over the corpus, the same C `main` is linked to Ray's Rust (only prototypes in `drop.c`) and compared with the
     original C built by `gcc -fwrapv`, on every input, overflowing ones included: with `-fwrapv` both sides define
     overflow as wrapping, so they must agree everywhere.
- **Pass.** `./run.sh N6`: (1) prints `expected/oracle.txt`; (2) seeds 1, 2 and 3, 40 functions and 50 inputs each: 6000
  of 6000 agree. Control: one `wrapping_add` turned into `wrapping_sub` in a Ray-written `f5.abi.rs` gives 50 differ.

### Limits after N6, and what lifting each takes

One small integer subset per language (`+ - *` over `int`/`long`), no control flow, no calls, and grammars that cover the
subset only. Measured on 2026-10-10: N3 over 40 functions takes 21 s (80 reads, 120 runs in Ray, the engine's boot).

- **L1 Real parsers.** Two routes. (a) Grammars written in Ray at full size: C11 is about 200 productions plus a
  preprocessor, Python's PEG grammar about 300 rules with INDENT/DEDENT tokens. That needs the engine first: working text
  operations in the library (today `split(…)[1]`, `join` and `.length` fail and the POC uses host stand-ins), rules
  without a leading literal that apply (today they do not), typed fields in header patterns (IOPG2), error positions when
  a read fails, and speed (every nested read re-reads its text through `$`; real files would be far slower than the
  corpus). (b) Read what compilers already produce, the Almanac's (1b) and LIB1: Python's own `ast` module, clang's
  `-ast-dump=json`, or LLVM IR (one reader that reaches C, C++, Rust and Swift). Recommend (b) for coverage, keeping Ray
  grammars for those formats, and (a) where a language has no such front end.
- **L2 Control flow.** The normal form becomes a Program with statements, mutable locals, `if`, loops and `return` (Ray
  has them as rules over labels and `goto`; Compiler.md's IR is that Program). Each place the languages differ is chosen
  at the boundary, as overflow was: C's truncating `/` and `%` against Python's flooring ones, C's `0`/`1` comparisons
  against Python's `bool`, truthiness, short-circuit evaluation. Equality can no longer be text: two equivalent programs
  differ in form (`for` against `while`). It needs a canonical form (structured control flow, renamed locals: U9.1's
  `==.normal`, a minimising Compiler level) or a semantic check (differential testing as now, plus bounded symbolic
  equivalence). Corpora would come from existing generators (Csmith for UB-free C, hypothesmith for Python) with bounded
  loops so every run ends.
- **L3 Calls.** Modules of functions calling each other, recursion, name resolution. Across a boundary, a calling
  convention: N6 already uses the C ABI for Rust; Python calling Ray-written C needs Ray to write the binding too (a
  CPython extension or a `ctypes` wrapper). Calls into libraries (`libc`, Python's standard library) are goal (I) for
  real: reading the library itself into Ray, with side effects modelled (IO as `external`, IO levels).
- **L4 Data beyond integers.** Floats (Python's `float` is C's `double`, close to free), `bool`, strings and their
  encodings, arrays and lists, structs and objects, `None` and null. Pointers and aliasing in C against references and a
  garbage collector in Python are goal (II), the memory model across a boundary: the hardest part, a research question,
  not plumbing.

Order: engine prerequisites (L1's list) first, then L2 with a Csmith-backed corpus, then L3, then L1 (b) to reach
real-world code, then L4.

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
  `-7`: `Number.ray` declares `zero := Number()` and `0 := zero`, so once the library is read `0` is the library's own
  number, not the host's. A design question between the library's numbers and the host's kinds, left to the author. A1.7 writes its negative numbers
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

- The shared shape both readers target is Ray code in a normal form (IOP5), not a record vocabulary and not reader
  classes compared field by field; the claim is tested over a generated corpus against gcc and python3.

## Order of work

After A5: N0, N1, N2, N3, N4, N5, then N6. (The old B1 to B5 are replaced by N2, N3 and N5.)


S0, S1, A1, A2, A3, A4, A5, B1, B2, B3, B4, B5. Track B reuses A1's Program as the comparison in B1, so it starts only after
A1 passes. C1 waits for A5 and B5.
