# Self-hosting

How Ray comes to compile itself: the language as written, the interpreter that runs it, and the levels that take what it
runs down to WebAssembly. The decisions are the user's (2026-10-18, Design.md §21.3); where this file says more than
they decided, it says so (*proposed*).

## 1. What there is

- Three things, and nothing else:
  1. **The language**: Expression.ray and the library, as written.
  2. **The interpreter**: language.ts as it is now. It is the seed, like a compiler's first binary.
  3. **Levels**: rewrite rules from a Program to a Program, and from a Program to WebAssembly's bytes (Design §20.1: a
     level is a scope of rules).
- There is no reader beside the language. Expression is the reader (Philosophy). Reading text is what Expression's
  `Statements` does when it runs, a program like any other.
- Every complexity lives in the rewrite rules: speed, how values are held, how a pattern is matched, how a call is
  dispatched. Each rule says how one kind of program or pattern goes down to WebAssembly, and each is removable.
- A value is held the way the backend encodes it. A String is its UTF-8 bytes in memory, and the language defines a
  String over those bytes. So there is nothing to convert and nothing to stand in for: no kernel map of externals in
  place of definitions (`wasm.o.ray` goes, §6).
- One compiler, two uses:
  - **Ahead of time, in one go.** What is read at build is read and run there; nothing is left of reading in the
    output, only the program compiled. The core library is built this way, and it is the fast interpreter for the
    rest.
  - **At run time (JIT).** Code that only arrives while running (a user's program, `text as T` of a text read at run
    time) is read by Expression, itself compiled, and its Program goes through the same rules.

## 2. Reading is running

- `text as T`: T reads the text position by position, in order, in the node being made, the fields before a position
  already bound.
  - A position is a written text (matched), a place `x: T` (declared there, its span read by T), or code.
  - **Code among the positions is a self-modifying type.** It recognizes the text as any position does; its
    statements define members of what is being read, so what is read next changes (Expression's `GRAMMAR_RULE_DEF`,
    then `statements: (…)`). When the read statements are executed, `()` is called. Whether that is at compile time
    or at run time is only when `()` is called. Nothing marks a position as code: its type does.
- **In order.** A header is read in order. Reading out of order, or at once (`concurrently` in Expression's
  `Statement`), is allowed only as an optimization, where it answers the same.
- **Dependent.** It reads first, then knows. A position's type may depend on what was read before it:
  `CAPTURE.map{== \s}(`LHS`)` is evaluated after CAPTURE read `{ }`, so it is `{LHS}`; in `(open: String, \s, close:
  open)`, `close` is what `open` took. So what a class reads is not worked out when the class is defined; `is` and
  `as` are answered by reading what they are given.
- **Splitting is the methods'.** What counts as where a word ends is what the rules read: any piece of text can be
  used for anything. There is no fixed class of "word characters" that decides what a rule may read.
- `source as Expression`: BOOTSTRAPPER reads the first line; the code position after it defines `Node`, `Program`,
  `global`, `Statement`, `Statements` and names what is read next; `Statements(global)` reads each statement by the
  longest rule that reads it. What it reads is a Program (statements as vertices, gotos as edges, Design §20.1), and
  `(source as Expression)()` runs it.
- The interpreter does exactly this, step by step. The compiler does exactly this in fewer steps.

## 3. Characters

- A String is a String of characters. By default a character is a grapheme cluster (what a reader sees as one).
- For now a character is the scalar one UTF-8 unit decodes to. `String.Scalars` is that String: a String like the
  other, its methods not repeated, only what its characters are differs. The library uses it until the default is
  grapheme clusters.
- What a UTF-8 unit is, is a type (Unicode.ray's `UTF-8`, a structure over bits). It is in String.ray, under
  `Unicode`, while the bootstrap needs it; Unicode.ray adds the rest (its tables) to the same class.
- `.next` follows from that definition: a String's next character is the next unit that type reads. It is not
  written by hand.

## 4. Values, as the backend holds them

All of these are rewrite rules in the Wasm level (*proposed*, beyond what is decided above):

- **String**: `(ptr, len)` into linear memory, UTF-8. `.next` decodes, by the UTF-8 type compiled.
- **Number** (a Ray chain of bits): a Number known to fit in 32 or 64 bits is an `i32`/`i64`; past that, a list of words.
  `Binary₃₂.Signed`, a 32-bit integer that wraps (`.mod`), is the language's own; under `@wasm` its operators are
  `i32.add`, `i32.shl`, … Each rule answers what the language's definition answers.
- **Char**: an `i32` scalar. A character class (`Char.Letter`) is a range check, or a table made at build.
- **Node**: an instance in memory. A class whose fields are known has fixed offsets, so a member read is a load;
  otherwise a member is looked up by name, as the interpreter does.
- **Closures**: a function index and an environment, called through a table.
- **Booleans and None**: `i32`; None is 0.

## 5. The compiler: `Program as Program{O: @wasm}`

The Wasm level writes the binary format directly; WAT is a conversion away (another level, a printer). It is the project
`$/Wasm.project.ray` (`@wasm`, as `Ether.entrypoint.ray`'s `Program{O: @wasm.(level)}` names it): the format as a type,
whose header reads and writes a module, and the two levels, each a set of `{shape} => …` rules into those types.

- **`@wasm.none`**, complete and naive, as Expression.ray sketches it:
  - a rule is a function;
  - its statements are a loop over where it is (`$at`), each a case of a `br_table`;
  - `external goto` sets where it is next when its condition holds;
  - `external .` makes a node; `external &` is what applied it;
  - an applied statement is a call of the function of the rule that read it.
  - Every statement is still read when it runs, so this level is correct for anything. Code read at run time runs
    here first.
- **`@wasm.default`**, the optimizations, each a rule (*proposed*):
  - **Staging, which takes reading out of the output.** A statement whose text is known at build is replaced by the
    rule that reads it, applied, its holes bound. What `()` made at build is kept as the module's memory image. What
    nothing reads at run time is left out, so a program that reads no text while running holds no Expression.
  - **Representations** (§4).
  - **Dispatch.** A call whose receiver's class is known is a direct call. A small rule is inlined: `if`, `while` and
    `unless` are classes, and inlined they are WebAssembly's `if` and `loop` (Design §20.3, goto → `if`/`while`).
  - **Parameters.** A call of known arity binds its parameters as locals, not through `(place) := value`.
  - **Patterns**, for text read at run time:
    - a written text is a compare of bytes;
    - a character class is a range check;
    - `T[]` is a loop;
    - alternatives are a switch on the first byte, the longest kept;
    - a dependent position compares with what was read before it.
    - What the interpreter's head matcher and cuts know goes here, as rules.
  - **Memory.** Nodes that don't outlive a call are locals or on a stack; the rest are in regions freed with what
    made them. `pure { }` (a checked assertion, Design) comes later, with checking a whole program.
- **At run time (JIT)** (*proposed*):
  - Expression (compiled) reads the new text, and the Wasm level (compiled) writes its bytes.
  - These are made a module sharing memory and the function table.
  - It runs at `none` first; what is applied often is rewritten at `default`.
  - A rewrite that relied on something taken back runs on from the last commit that didn't (Design §20.1).
  - This needs one import from the host, making a module of bytes: a new external, to be approved.
- **The interpreter is the oracle.** One suite runs interpreted, at `none` and at `default`, and says the same at each.
  A rewrite that changes an answer is wrong, not fast. Each can be left out by name, so a difference is one rule.

## 6. Bootstrap: the compiler compiled first

Interpreting Expression over the whole library is too slow (about 1,500 rule applications per element of a list), so
only a small part ever runs slowly.

1. **Stage 0.** The seed reads the entrypoint, the library, Expression.ray and the Wasm level (written in Ray).
   Expression.ray's tests pass on it, among them a three-line language read and run.
2. **Stage 1.** `--build --level=none` (Design §21.4), the seed writing each rule as a function: W0, which runs (#34).
   W0 is still the interpreter, compiled shallowly.
3. **Stage 2.** W0 runs the Wasm level at `default` over the library's Program: W1. In W1 everything read at build
   was read there.
4. **The fixpoint.** W1 builds the library again, byte for byte W1. From there, the seed is only needed to make W1
   from nothing, and the builder written in TypeScript can go.
5. Then the JIT, and each optimization on its own, measured with the suite at the three levels.

So the Wasm level is written in the plain part of the language (bytes, lists, small numbers, rules), to keep what
stage 2 needs small while W0 is still slow. The writer's check: it writes the kernel's own module byte for byte (§7,
step 5).

What goes, in the end:
- `wasm.o.ray`: each entry is either the language's own definition, compiled, or a rule in the Wasm level.
- The seed's stand-ins for definitions (`given`, `taking`, `same`, `until`, `past`, `int32`): they stay in the seed
  until the fixpoint.

## 7. Order of work

Each step with the check that says it is done.

1. **Calls and memory.**
   - A call of several parameters binds them in the kernel (#36), each value where it was written (#43, about 371 KB
     to 8 KB for a call of four).
     - Check: the library answers alike on every line with and without it, at an unlimited budget (`RAY_NOPARTS`,
       `RAY_NOCAP`). Done for #43 (with #42). Not yet for #36's one parameter: without it the library needs more than
       the 2 GB there is.
   - What a call holds is given back.
     - Check: 100000 calls of `sp_add (a, b) => a + b` in the memory of 1000. Measured at #34: about 0.7 MB a call,
       and 1000 calls stop at the per-statement cap.
   - Every stage after this makes millions of calls.
     - Check: at least 10^4 calls a second (about 1500 at #34).
2. **Numbers.**
   - `Binary₃₂.Signed` in the language, replacing the kernel's `external int32` (#40's tests kept).
     - Check: IB1 to IB24 by the language's rules, the map left out.
   - The numeral classes defined at all: Number.ray's `Named.for` is over the per-statement memory, so none exists.
     - Check: ``2147483647.digits == `2147483647` ``. Today a numeral of ten digits is not read: the map counts at most
       nine, and `"123456789" is Decimal.String` is false outside Number.ray's own tests.
3. **Characters** (§3):
   - the UTF-8 type in String.ray;
   - `String.Scalars`, used by the library;
   - `.next`.
4. **Headers** (§2):
   - read in order, dependent (EX8);
   - code as a self-modifying type;
   - Expression's own test;
   - the three-line language.
5. **The module writer** in Ray (bytes, `--write`, #39): one function, written, made a module, runs. It is `$/Wasm.project.ray`:
   the format as a type, written by its header (§5).
   - Check: from the kernel's JMP (written by Ray, `kernel.ray`), the kernel's module, byte for byte `module_bytes`'.
   - Done before it: the kernel's source in a file of its own (#38, the code section byte for byte), `--write` of a
     list of numbers as bytes (#39), a built program loads and runs (#34), and the kernel's language read by Ray
     (#41: `scripts/kernel-ray.mts`, then `scripts/kernel-jmp.mts --check`, all 45,117 lines and 523 contexts the same as `jmp_of`'s
     on 2026-10-19).
6. **`@wasm.none`** in Ray: what the seed's `--build --level=none` writes, for the same rules.
   - Check: byte for byte the seed's, and the library's asserts as interpreted.
7. **`@wasm.default`**: representations, then staging, each with the suite at the three levels.
8. **The fixpoint.**
   - Check: W1 builds W1 byte for byte, and the library's tests pass on it as on the seed.
9. **The JIT.**

## 8. Found on the way

- `jmp_of` reads `kernel.toString()`, the tool's output (esbuild: one line, shadowing locals renamed `kept2`, `0 && x`
  folded), not the source. The reference the kernel read by Ray is held against is `jmp_of` over TypeScript's output of
  `kernel.ts`, its types and comments taken away; it differs from the kernel running only in `ev_` and `rule_`, by
  esbuild's folding.
- `jmp_of` compiled only the first value of a `for` step and of a statement with commas (`if (c) a, b;` ran `b` always):
  999 of the kernel's statements were missing (aa59af6b).
- `kernel.ts` was edited where Ray could not read what TypeScript ignores, the code unchanged: comments with a bracket
  left open or a quote opened by `\`, a comment indented less than its block, blocks begun mid-line with their lines
  below, two `/* … */` comments made line comments.
- Ray reads the kernel in ranges of functions, each in a process of its own: one process of all of them needs more than
  2 GB. The largest function, `apply`, takes about 1.5 GB alone.
- A value made inside a method read as what the method runs on (a method's own node is made of its receiver, and the
  reader went from a node's rules to its parent's): `(1 | 2).listing` was true inside a list's method. Fixed in #42.
  With it, RR54, RR55, RR57 and RR81 run, and fail on what a list's `all` holds (its values, §3's `.next` not yet on a
  list).
- A comment that `kernel.ray` reads otherwise than TypeScript does stops it at that function, and every range after it
  writes nothing: a two-line comment whose second line had `while` in it (`guards`, 2026-10-19). Kept to one line. The
  language read every comment line with `while` in it as `{body} while {condition}` (a loop), and a comment in a class
  could run for ever: a comment is no longer guarded (`guards` in `kernel.ts`).
- Reading the full `$/Wasm.project.ray` takes more memory than the seed has (over 1.5 GB, one statement): the kernel only
  frees memory at the end of a test, so what reading a definition makes stays. About 1 MB per enum member with fields; a
  91-member enum alone 300 MB when it was read left to right (`|` and `&` are now read nearest: either way the same).
  Each part reads on its own (`i32`'s 77 ops in a class with the real `MemArg`, `U32`, `LEB`, under 120 MB).
- A field named `type` goes round the language's own `{x}: {type}` rule (a hole's name met by the code spliced into it):
  the Wasm project's fields are named for what they are (`index`, `storage`, `composite`, `value`, …).
- `X.String` as a type (Number.ray:388) is hidden by the numeral class's instance `String => this as String`; without that
  member, `{digits: Decimal.String} => Decimal(integer: digits)` reads numerals as Decimal objects, not counts (9 tests).
- `x: T = code` reads the code's value, not its text by T (`r: Ranged2 = 3-8`, ZZ1–5): the line is read by
  `{place} = {value}` (declared after `{name}: {type} = {value}`, so looser). `RAY_EXPLAIN=file:line` says which rule read a
  statement.
- Hex numerals (`0x0C`) were read by nothing outside Number.ray's own block; the kernel's map reads them as counts.
- `2 ^ 32 > 0` fails: past 2^31 the seed's counts are wrong.
- Debugging a grammar: `RAY_TRACE=file:line` traces the statement there. Every rule applied while it is read is said,
  nested by depth, with its head, the text it reads, the node it is read on (`on #…`) and what it answers (`= …`).
  Repeated lines are folded (`×N`).
  - `RAY_TRACE_DEPTH` (24) and `RAY_TRACE_MAX` (3000 lines) bound it.
  - `RAY_TRACE_NONE=1` also says each span nothing reads.
  - `RAY_TRACE_HIDE=<regex>` leaves out rules by head, with what they apply (`'^(String|\.|this)$'`).
  It works in rule bodies and test files, where `RAY_EXPLAIN` does not. With it:
  - a conversion written in a class, `as (=== T) => …`, is defined on a node of its own (a head with brackets is a
    method's, read in its own node), not on the class: no class's conversion applies to its instances;
  - `this as 10 as String` (Number.ray:213) reads as `this as (10 as String)`: `as {target}` takes the rest of the line.
- A list given to a function among other arguments is spread into them: `member_given(list, name, v)` names nothing.
- `==` between two types is true for any two (Ray.ray:5 on two values with nothing held: `String+ == \s`).
