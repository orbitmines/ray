# Compiler (kernel4): read once, compile, run native

Status: design, 2026-10-03. Owner: the engine session. Bar for every step: `k4/all.sh` identical and the paint dumps identical.

## Why

The interpreter reads text every time it runs it. Each statement goes through:

- rule selection (`best`, `match`, `claim`);
- name resolution (`lookup` walks frames);
- application (`apply` builds a frame with captures as lazy code);
- dereferencing chains (place → binding → lazy → forced value).

This is correct but slow: the entrypoint alone is ~310 ms, and the target is under 50 ms. The language has no control flow of its own below `goto` and labels. `if`, `while`, `:=`, `===` are rules whose bodies are statements, labels and jumps over natives. So once a body has been read, it is a control-flow graph of native operations and rule applications, and that graph can be compiled.

## Shape

```
text ──interpreter (first read)──▶ decisions ──recorder──▶ IR ──passes──▶ IR ──back end──▶ run
                                                            ▲                              │
                                                            └──── guard failed: deopt ─────┘
```

1. **Interpreter.** Unchanged in meaning. It reads, decides and applies, and exposes what it decided.
2. **Recorder (front end).** Turns a unit's decisions into IR. A unit is a span read in a frame: a rule body, a block, a file. Every decision that depended on run-time state becomes a `guard` instruction.
3. **IR (portable).** A control-flow graph of blocks of instructions. It contains nothing from JS and nothing from the language's vocabulary.
4. **Passes.** IR → IR, each removing work while keeping meaning.
5. **Back ends.**
   - *Evaluator:* runs IR. This is the reference implementation and the template for ports.
   - *JS code generator:* `new Function`, blocks as a `switch (pc)` loop, natives called directly.

   A port to another language is another back end plus that language's natives. The recorder, the IR and the passes are shared.

## IR

A unit is a list of blocks. A block is a list of instructions ending in a jump, a branch, a return or a fall-through. Values live in registers. Frames are values.

| Instruction | Meaning |
|---|---|
| `frame` | the unit's frame (what `external .` answers) |
| `name r ← frame, "x", site` | the place `x` in a frame (not resolved yet) |
| `lookup r ← frame, "x", site` | resolve a name as `lookup` does |
| `slot r ← frame, "x"` | read a binding known to be held by that frame (the pass `slots` proves it) |
| `lazy r ← span, frame` | code not read yet (a capture) |
| `literal r ← span` | written text |
| `deref r ← r` | place/code → value, as `deref` |
| `native r ← NAME, args…` | call a native |
| `apply r ← rule, captures…, receiver?` | apply a rule: the generic slow path |
| `enter rule, captures…, receiver?` | apply a rule whose body is compiled: a new frame, and running entry pushed |
| `leave` | the end of an entered body |
| `guard kind, r, expected → deopt(position)` | a decision's precondition |
| `jump L` / `branch r, L` / `label L` | control flow: labels and gotos lowered |
| `raise label, site` | a jump that leaves the unit (lexical return) |
| `return r` | the unit's value |

Guard kinds are exactly the facts the interpreter's choices depend on:

- `rules`: the rule list in scope;
- `receiver`: the rules a value answers to;
- `bound`: whether a name is bound;
- `native`: whether a value is a native, and which;
- `epoch`: rules or declarations changed.

On a failed guard the unit hands back to the interpreter at the statement where the guard was recorded. The interpreter reads on from there, and the recorder records again (at most N variants per position).

## Recorder

The interpreter already records per unit (kernel4 since e72dd1f, a4aa07b, dff0933):

- labels;
- jumps (`goto` with or without a condition);
- statements that are a chain of native calls;
- rules whose body is one of their captures.

The recorder generalizes this:

- every statement becomes instructions;
- every decision becomes a guard plus the action it chose;
- a statement it can't express stays `apply` (generic), so coverage grows without changing meaning.

## Passes (where the speed comes from)

1. **Lower control flow.** `label` and `goto`/`goto … if` statements become CFG edges. (This is done by the step replay today.)
2. **Natives.** A statement that is `external NAME args` becomes `native`, with no reading. (Done today.)
3. **Inline static rules.** When a rule's body is compiled and its application is guarded only by `rules`/`receiver`, the body is entered without building the generic application. Frames are built only as far as the body can observe them: a frame is a value (`external .`), so it is still made. The running entry is kept only when the body reads given names through it.
4. **Slots.** A name declared (`:=`) in the unit's own frame, or a capture of the entered rule, is read with `slot` instead of a scope walk. The guard is `epoch`.
5. **Inline caches.** Receiver dispatch (`.member`, `x op y`) is guarded by the receiver's rule list. A hit costs one identity compare.
6. **Dead guards.** A guard that is implied by an earlier one in the same block is dropped.

## Back ends

- **Evaluator** (`compile/evaluate.ts`): a loop over blocks. It is the reference and must give the interpreter's exact diagnostics and values.
- **JS** (`compile/js.ts`): generates `function (rt, frame, …)` with registers as JS locals, natives as direct calls through `rt.natives`, and guards as `if (…) return rt.deopt(pc)`.

## What was measured (2026-10-03)

- Entrypoint load: 800 → ~300 ms with:
  - `:=`'s short path;
  - cached readings;
  - control flow and native chains replayed per unit;
  - pass-through rules.
- Replaying a statement's *reading* (keeping the interpreter's frames, lookups and dereferences) gains nothing. The guards cost what selection costs, because both pay for name resolution, receiver rule lists and the running stack. Tried three times; reverted each time.
- 50 ms means ~1.5 µs per statement for ~20k statements and ~8k applications per load. A frame walk, a dereference chain or a frame allocation already costs that.

So the unit of compilation is a **rule application**, not a statement:

1. **Trace.** An application is recorded whole for the *shapes* of its receiver and captures (their rule lists): every decision, native call and frame the body can observe.
2. **IR.** Names resolve to slots where the body proves where they are held (its frame, its captures, its `:=` locals). Applications of static rules are inlined. Dispatch becomes one shape check.
3. **Runtime representation.** Frames and lazy values are made only where code can observe them: `external .`, a capture passed on unforced, a name looked up from elsewhere.
4. **Deopt.** A failed shape check runs that application in the interpreter and records another variant.

## Constraints

- No language vocabulary in TS: guards and passes talk about rules, places, frames and natives only.
- The level (o.ray) maps operation patterns to natives. To the compiler, a level entry is just a `native` instruction behind a guard.
- Painting: units compiled while serving (painting) aren't used; the interpreter paints.

## To do (decided 2026-10-03: not yet)

- **Saved boot graph.** After a load, keep the read and compiled graph, keyed by source hashes. The next boot loads it and re-reads only sources whose text changed. This would bring entrypoint loading to ~ms, and the saved graph is the artifact a port would load. The user decided to push graph reduction within one load first.

## Decided 2026-10-03: graph reduction is the evaluator core

Measured on the entrypoint after the interpreter-level work (291 ms):

- About 15k statement readings and 8k applications allocate ~124k value nodes and ~165k text spans or cursors.
- Every guarded reuse of readings cost about what it saved (four attempts, reverted):
  - its checks pay full price for the primitive operations (dereference chains, receiver rule lists);
  - the entrypoint defines the language as it reads, so readings keep changing.

So the evaluator is rewritten as a graph reducer. The reader (rule selection, `match`) stays.

1. **Graph.** Reading a statement yields graph nodes that the source owns:
   - `name` (a slot when the binding is static, else a lookup);
   - `apply` (rule plus capture subgraphs);
   - `native` (function plus argument nodes);
   - `literal`, `jump`, `label`, `sequence`.

   Spans are made once, when the graph is built, never per evaluation.
2. **Captures are shared subgraphs**, reduced at most once per instantiation; this replaces per-capture lazy nodes and their re-reading.
3. **Dispatch nodes.** Where the reading depended on a value's class, the node keeps a per-class cache (the subset of that class's rules that can begin there). On a miss it asks the reader for that one node and patches the graph.
4. **Frames stay first-class** (`external .` returns one), but names whose binding the graph proves are read as slots, and a frame is made only where the body can observe it.
5. **Validation** against the interpreter on the harness and the paint dumps, at every phase.

Phases:

1. Graph builder and reducer for rule bodies and captures. The interpreter stays the fallback per node.
2. Slots and frame elision.
3. Inline caches on dispatch nodes.
4. o.ray natives attached to graph nodes.
5. JS code generation from the graph.
