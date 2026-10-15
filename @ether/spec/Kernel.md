# What a kernel needs

Findings from running real programs on `language.ts` (a DEFLATE decoder, C and Python read into Ray, gcc's machine code
read, lifted and compiled back, x86 declared from Intel's XED; `spec/Machine.md`, `spec/Deflate.md`, `spec/Interop.md` in
PR #20), and what a kernel written anew must do so that they run. Each requirement names how to check it.

## Findings

1. **A run holds every value it touched until it ends.** A value crosses into code as a token written into text
   (`{00abcd}`) and is found again through a table from token to value. Text does not say who still needs what it names,
   so the table keeps all of them: one stream decoded by the lifted `inflate` holds 24 GB and takes 38 minutes; with the
   larger x86 declaration made from XED, the table passes what a JavaScript `Map` holds (16.7 million) after 18 of 29
   streams. It is not a leak and not JavaScript: any host keeps the same table while values are passed as text.
2. **Text is read again on every evaluation.** There is no compiled form. `f3` (`(n + 1) * x`) runs 17 times a second in
   the interpreter; the machine code Ray compiles from the same meaning runs 765 million times a second. Boot is 11 s.
3. **Mistakes answer instead of failing.** Each of these cost hours, because nothing said it went wrong:
   - a member that does not exist is a value, not an error (`X86.NotThere === None` is false); a member read on a call's
     result answered its own name as text (`X86.lea_form().iform` gave `"iform"`);
   - an unbalanced bracket leaves a class unmade, without an error;
   - a missing rule leaves a call without an answer: a run waited for hours on `ray_code`, defined in a file it did not load;
   - `a.count < b.binary.count` in a condition compares wrongly (`<` read as type arguments, as in `X86.Add<prefixes, rex>`);
   - a value that is the text of a host escape ran it: `"js" === x` (`js`, jump if sign) compiled the next line as
     JavaScript.
4. **How code groups is not what it looks like.** `3 % 8 == 0` is `3 % (8 == 0)`; `(0 - 1) as Integer` as an argument
   needs its own brackets; `,` is the loosest rule, so `class a: T, b: U` is a list.
5. **Numbers are not machine numbers.** Whole-number `-` stops at 0 (`2 - 5` is 0); host numbers are exact only to 2^53,
   which 64-bit machine code passes.
6. **Choosing among many alternatives is a search in Ray.** Reading x86 tries each of 358 forms in order, and writing one
   asked each `is` until one answered: 7 to 35 s a function, against under one with 60 hand-written forms.

## Requirements

1. **Values live as long as what holds them.** Bind a rule's holes as names in the node its right side runs in, or read
   code once into a tree whose leaves hold values; no table from token to value for a whole run.
   Check: MC10c (`poc/machine/run.sh MC10c`, all 29 streams) in one process, in memory that does not grow with the run.
2. **Code is read once.** Parse each statement once into a form that is evaluated, not matched again.
   Check: `f3` at least 10^4 calls a second; boot under a second.
3. **Fail loudly, at the place.** An unknown name or member, an unbalanced bracket, a call no rule answers, a value of the
   wrong type: an error naming the file and line, not a value.
   Check: each case of finding 3 is an error.
4. **Grouping as written.** Comparison binds looser than arithmetic; `<` opens type arguments only after a type's name;
   brackets are never needed around a conversion in an argument.
   Check: `3 % 8 == 3` is true; `f((0 - 1) as Integer, 2)` takes two arguments.
5. **Exact integers.** Arbitrary precision in the kernel (BigInt, not `Number(BigInt)`); machine widths as library types
   that wrap (`Int32`, `Natural64`), as `poc/interop/ints.ray` does.
   Check: `2 - 5 == -3`; `(2^63 - 1) + 1` wrapped `Int64` is `-2^63`.
6. **The host is reached by name only.** A host escape (`goto js`) runs where it is written, never because a value's text
   is its name.
   Check: `("js" === "js")` is true and runs no JavaScript.
7. **Declarations compile.** A class header's fixed bits become a decode table, alternatives are chosen by table, not by
   trying each; a value's class is known without asking `is`.
   Check: a function reads in under a second with the 358 XED forms (`DECLARED=X86.XedFunction`).

## How to check a kernel

The suites already exist and each claim is checked by something that is not Ray (gcc, objdump, gas, zlib, python3, native
runs): `poc/quick.sh` (about 6 minutes, each kind of claim once), then `poc/deflate/run.sh`, `poc/interop/run.sh` and
`poc/machine/run.sh MC1` to `MC10d` (with `DECLARED=X86.XedFunction` for XED's declaration). A kernel that passes them
and the checks above runs these programs.

Measured today, to beat: boot 11 s; `f3` 17 calls a second; `inflate` one stream 38 minutes and 24 GB; quick tier 6
minutes.
