# Bootstrap

How Ray comes to build its own kernel, so that a new kernel is a change to Ray, built by the kernel before it. It follows
the self-hosting notes in `Design.md` (2026-10-15: "its output (Expression compiled) becomes the default kernel";
2026-10-17: "the wasm it writes replacing language.ts reading the entrypoint") and adds what was measured on the way, the
order, and a check for each step.

## The chain

1. **Stage 0.** `language.ts` builds the first `kernel.wasm`, as it does now: `kernel()` (restricted JavaScript, integers
   over memory) read by `jmp_of`, written by `module_bytes`.
2. **Stage 1.** That kernel runs Ray's own compiler on the kernel's source and writes `kernel.wasm` again.
3. **The fixpoint.** The kernel stage 1 wrote, run on the same source, writes the same bytes. From here a new kernel is an
   edit to its source, built by the kernel before it, and `language.ts` is no longer needed to build one.

Wasm is the first target, not the last: the same compiler later writes machine code (the x86 declarations at tag
`machine-code-proof`).

## What blocks it (main at 2d77cd9d, with #34)

A call holds about 0.7 MB that is not given back, and runs about 60 times a second:

| `sp_add (a, b) => a + b`, called n times in a `while` | memory after reading | read |
|---|---|---|
| 0 (the library alone) | about 1080 MB | about 25 s |
| 100 | 1152 MB | 25.5 s |
| 300 | 1298 MB | 28.9 s |
| 1000 | stopped: "took more than 320 MB of new memory reading this" | |

A loop without calls is not the problem: 1000 and 4000 rounds read in the same time. A compiler over the kernel makes
millions of calls, and so does a reader of Ray written in Ray: both stages above, and `Expression.ray` as the kernel, wait
on this first.

## The order

Each step its own PR, each with a check that passes or fails.

| | Step | Check | State |
|---|---|---|---|
| SH1 | A call gives back what it held: `pure { … }` runs in memory of its own (`Design.md`: `pure` a checked assertion) | 100000 calls of `sp_add` in the memory of 1000 | done: #36, #37 (436 MB for 100000, 435 for 1000) |
| SH2 | Calls fast enough to compile with | at least 10^4 calls a second; `Kernel.md` requirement 2 | about 1500 now; most of the rest is `,` building argument lists |
| SH3 | A built program loads and runs | `ray.wasm` passes the same asserts as the interpreted kernel | done: #34 (744 the same) |
| SH3b | 32-bit integers in Ray (`Int32`, `Design.md`'s `i32`), as the kernel's source and the writer need | each operator as WebAssembly's i32 answers | done: #40 (IB1 to IB24) |
| SH4 | The wasm writer in Ray, each context in a `pure` block | the kernel's module from its JMP, byte for byte | |
| SH5 | The kernel's source moved out of `language.ts` into a file of its own; stage 0 unchanged | `kernel.wasm` byte-identical | done: #38 (the code section byte for byte) |
| SH6 | The kernel's language read by Ray's own reader: its constructs declared as rules, each writing its JMP | the JMP equal to `jmp_of`'s | |
| SH7 | Bytes out: `--write` of a list of numbers | the bytes written are the list | done: #39 |
| SH8 | The fixpoint | the kernel Ray wrote writes itself again, byte-identical; the library's tests pass on it as on stage 0 | |
| SH9 | The kernel rewritten as declarations, one function at a time | each rewrite keeps SH8 and the tests | |

Found on the way: `jmp_of` reads `kernel.toString()`, which is the tool's minified output (one line, `memory2`, `__name(…)`),
not the kernel's source; so the source moves to a file of its own (SH5) before Ray reads it (SH6), and Ray reads it with its
own reader rather than a port of `jmp_of`'s tokenizer. Until machine code is a target, JavaScript stays only as the runner
that loads the wasm, never in building a kernel.
