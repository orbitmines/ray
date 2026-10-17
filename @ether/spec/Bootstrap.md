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

| | Step | Check |
|---|---|---|
| SH1 | A call gives back what it held | 1000, then 100000 calls of `sp_add` in the memory of 100; `Kernel.md` requirement 1 |
| SH2 | Calls fast enough to compile with | at least 10^4 calls a second; `Kernel.md` requirement 2 |
| SH3 | A built program loads and runs | #34: `ray.wasm` passes the same 744 asserts as the interpreted kernel |
| SH4 | The wasm writer in Ray: the binary format declared, one declaration reading and writing it | `kernel.wasm` read and written back byte for byte |
| SH5 | The kernel's source read by Ray into JMP, as `jmp_of` does | the JMP program equal to `jmp_of`'s, so SH4 writes the same `kernel.wasm` |
| SH6 | The kernel's source in a file of its own, outside `language.ts` | stage 1 writes `kernel.wasm` byte-identical to stage 0's |
| SH7 | The fixpoint | the kernel stage 1 wrote writes itself again, byte-identical; the library's tests pass on it as on stage 0 |
| SH8 | The kernel rewritten as declarations, one function at a time | each rewrite keeps SH7 and the tests |

SH4 and SH5 are the "Wasm level" and the reader of `Design.md`'s note, written for the kernel's source. Until SH8 the
kernel's source keeps the form it has now; SH8 is where it becomes Ray in style as well as in who builds it.
