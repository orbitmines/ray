# kernel2

A small runtime for programs laid out once in memory and run by many cursors: superposed entries and exits, forks that join
again (where what differs superposes), processes in a long-lived environment, workers, and lanes on a GPU.

## Layers

| directory  | what                                                                                           | platform        |
|------------|------------------------------------------------------------------------------------------------|-----------------|
| `core/`    | words, program images, the memory map, cursor queues, the machine, the worker loop              | none (port this) |
| `gpu/`     | lanes: one region on many inputs; `lanes.ts` on the CPU, `webgpu.ts` + `shader.ts` on a GPU     | WebGPU          |
| `runtime/` | the environment (processes, system calls, GPU dispatch) and a worker's entry                    | through a Host  |
| `host/`    | what a platform gives: threads, shared memory, waiting — `node.ts`, `web.ts` (browsers, Deno)   | per platform    |
| `cli/`     | `ether`: the client, and with `--daemon` the daemon keeping one environment warm (`ether.sock`) | Node, Deno      |
| `web/`     | the browser example and a server that makes the page cross-origin isolated                      | browser         |

`core/` uses nothing but an `Int32Array` and `Atomics`: every structure is words at addresses, every reference an address.
That is what carries over to Rust or Java: the same layout in a `Vec<i32>` / `int[]` (atomics over the same words),
the same functions. `gpu/shader.ts` carries over as it is (WGSL runs under wgpu).

## Memory

One `Int32Array`, shared by every thread (`core/memory.ts`):

```
control | injection queue | queue per worker | system-call ring per worker | processes | heap (images, arenas) →
```

A program image (`core/program.ts`) is copied into the heap once and only read. A process gets an arena in the heap; its
states, activations, groups and superpositions are allocated there (one atomic add) and freed with the arena.

## Running

```sh
node --import tsx src/kernel2/test.ts                 # every example, on one thread and on 4 workers
deno run -A src/kernel2/test.ts                       # the same on Web Workers, `each` on the GPU
node --import tsx src/kernel2/cli/ether.ts src/kernel2/examples/superpose.k2   # starts the daemon the first time
node --import tsx src/kernel2/cli/ether.ts --status | --stop
deno run -A --no-config src/kernel2/cli/ether.ts src/kernel2/examples/each.k2   # the same on Deno (workers, WebGPU)
node --import tsx src/kernel2/web/serve.ts            # http://localhost:8421 (?run=each)
```

## One executable per OS

From `src/kernel2`, on any machine (Deno cross-compiles; nothing needs installing where it runs):

```sh
deno compile -A --no-check --no-config --include runtime/worker.ts --output ether cli/ether.ts
deno compile … --target x86_64-pc-windows-msvc   # also x86_64-apple-darwin, aarch64-apple-darwin,
                                                 # x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu
```

`--no-config` keeps the project's package.json (and node_modules) out of the executable. The daemon listens on
`$XDG_RUNTIME_DIR/ether.sock` (the temp directory when unset; `\\.\pipe\ether` on Windows).

## Programs

`core/assembly.ts` reads a text form (see `examples/`); `core/program.ts` builds the same images from code
(`Assembler`), for a front end to target.

## What to change first

- `core/machine.ts` `binary`: what natives do with superpositions (here: every pair of components).
- `core/machine.ts` `resolve`: what a merged cell is when branches differ (here: their superposition; NOTHING is skipped).
- `core/machine.ts` `collapse`: what an activation does with its exits (here: all taken exits go on, superposed per exit).
- `core/worker.ts` `QUANTUM`, and the order cursors are taken in (newest first on a worker, oldest first when stealing).
- `runtime/environment.ts` `each`: when lanes go to the GPU (here: 64 or more, and only regions `gpu/lanes.ts` accepts).
