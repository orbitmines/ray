# The engine in 1000 lines (proposal, 2026-11-13)

The user (2026-11-13): "fix all of it, and try not to use caches, structural fixes only. Design a full 1000-line
implementation which is properly a replacement of this setup, such that it's a nice abstraction following the project's
philosophy."

## Where it is now

`ray/bootstrap/Runtime.ray` (758 lines) and `ray/bootstrap/Compiler.ray` (4068) together: 4826 lines, 905 statics.

- **Compiler.ray's own level** (264 lines, the `Compiler := class` at its top): optimizations as rules, the design. Kept.
- **Runtime levels** (about 2900 lines: Texts, Output, Splices, Readings, Keys, Caches, Pairs, Layout, Indexes, Members,
  Calls, Matching, Built, Turns, Entry, ChoiceStack, FieldIndex, Basics, Origins, Heap, Memory, Isolation, Collector,
  Hooks, Afterwards, Images, Locals). These answer `level …` requests and High's calls in raw words (`word_of(3908)`),
  with caches that patch over shapes that cost too much (`pair_end`, `occurs`, `memo_read`, `led_index`, the parse
  table), and a pass that rewrites compiled text (`Locals`).
- **The compiler** (Lowered 297, High 663): Runtime.ray's classes laid out as words, and Ray written as the low
  dialect that `$/Wasm.project.ray`'s bootstrap part (`Compiled`, `Low`) turns into WebAssembly.
- 248 of the statics are named from outside: by High's output, by `level` requests in Expression.ray, the entrypoint
  and the library, and by the host (`.entrypoint.mjs`).

What breaks: once calls run (spec/TODO.md, "Checked again 2026-11-13"), what a statement makes is held by writes into
older nodes (rules, `painted`, `applied`), nothing reclaims it, and young memory fills by the entrypoint's first
classes.

## Principles, applied

- **Languages, not wrappers.** A kind of value is its header (`Node := (1, in, fields, keys, index)`); the back end lays
  it out. No raw word addresses outside the back end. Global state is one class, the Run (what Images copies field by
  field today), not 60 numbered words.
- **Optimizations are levels, removable, and none is needed for meaning.** The engine runs correctly with no level;
  each level is a separate block that can be deleted. So no cache is load-bearing. Where today a cache is needed
  for the engine to finish at all, the shape is wrong, and the fix is structural (below).
- **One mechanism per idea.** Reading, typing and calling are one thing: a pattern read on a place (Design §4.2, §7.1).
  Statement ends, holes, pairs and layout are one walk over the text's structure, not four scanners with four caches.

## The structural fixes

| Today (lines, cache) | Structural replacement |
|---|---|
| `pair_end` table, `bracket_ending`, `quote_open`, `opens_quote`, `backslashes` (Pairs, Layout: ~220) | A text is read once into its **shape**: lines (indent, start, end) and pairs (open → close), one forward pass with a stack, when a part is given. Statement ends, hole extents and block closes are walks over the shape. The shape is the text's value, not a cache. |
| `occurs` byte/pair index, `literals_in`, `keys_reading`'s filter (Indexes, Keys, Caches: ~250) | A rule is tried where its first literal can be: rules are kept **by their lead** as they are added (a node's rules are a map lead → rules in order, the structure itself), so no scan and no filter. A statement nothing reads waits on the leads it holds, so a rule added with one of those leads wakes it (§21.1's retry, without reading every literal of every rule against every statement). |
| `memo_read` (hole extents re-read at each byte), `text_led_read` | A hole ends at shape boundaries (pair, line, word), so it takes a token at a time, not a byte at a time. The O(n²) goes, and with it the memo. |
| Register machine + choice stack + undo notes (Runtime 321–670, ChoiceStack, Built: ~450) | **Reading with continuations:** `read(pattern, at, then)` calls `then(end)` for each way the pattern reads, nearest first, and the first that answers wins. Backtracking is returning; bindings are arguments, so there is nothing to undo. About 150 lines. |
| Regions, isolation flags, pins, the undo log, test images, `lasting_copy` (Heap, Memory, Isolation, Collector, Images: ~700) | **A statement's memory is let go when it ends, but what older memory points into.** The one write barrier there is (every field written goes through `written`) notes each older word given a value of a statement still running. When the statement ends, what those words (and the run's state) reach is copied out, they are moved with it, and the rest of the statement's memory is let go. Tests are statements. Calls run inside it as they like. (The reader's own writes, rules, paints and says, returned as the statement's answer instead, keep the noted words few.) |
| `Locals` (185 lines rewriting compiled text) | High writes a function's parameters as the machine's locals when it writes the function (it knows them then). |
| Afterwards, Hooks, Origins, Output, Texts, Splices (~700) | Mostly host plumbing in raw words. What stays is in the Run class (written out by the back end) and in the language: `goto afterwards` is a label (§21.2); origins are where a text is (its span is its origin); splicing is a rule. |
| `level` requests (90 names) answered by engine functions | Design §21.2: externals are `.`, `&`, `goto`, `label`, plus the host's IO. The requests become the entrypoint's own definitions, read by the full language once calls run. The engine keeps only what a back end must give: the value kinds, member, call, read. |

## Decided (the user, 2026-11-13)

- **Statements answer what they define** (step 4): Expression.ray's rule maker, `painted` and `reported` return what
  a statement adds; the turn appends it. (Correction, same day: a program's own writes into older nodes, a class body
  defining into its file's scope, still happen once calls run, so the barrier notes those words and the statement's end
  copies out what they reach. The answers only keep that set small.)
- **The 1000 lines count Runtime.ray, Compiler.ray, Expression.ray and `$/Wasm.project.ray`'s bootstrap part
  together** (today 758 + 4068 + 456 + about 460 = about 5740).

That makes the back end part of the work. Today Ray is written twice: High writes the low dialect as text, and `Low`
reads that text again to write WebAssembly (Compiled's grammar, `Low`'s statement parser, `Locals` rewriting the text
between them). One writer instead: **Ray to WebAssembly directly**, a function's parameters and `:=` names its locals,
Runtime.ray's kinds laid out from their headers by the same writer (Lowered folds in).

## The shape (budget)

```
Runtime.ray      ≈ 430   values (kinds as headers) 70, names/members/calls/classes 90, the text's shape 50,
                         reading with continuations 120, the turn (statements, retry by lead, includes, answers
                         copied out) 60, the Run and the host 40
Expression.ray   ≈ 250   the reader in the language: the rule maker answering what it defines, holes, styles
Compiler.ray     ≈ 170   the levels as rules (today's 264, asserts moved to tests), the copy out of a statement
Wasm bootstrap   ≈ 150   Ray → WebAssembly: sections, a function's locals, expressions to instructions
                 ------
                 ≈ 1000
```

## How it lands (each step a revision; both suites at baseline after each)

1. **Shape of the text.** Lines and pairs read once per part. Replaces Pairs, Layout and `pair_end`'s cache. Statement
   ends and hole extents read the shape.
2. **Rules by lead.** A node's rules kept by lead as defined. Replaces Keys, Caches, Indexes and the `led` scans.
3. **Reading with continuations.** Replaces the register machine, ChoiceStack, Built and the memo.
4. **Statements answer what they define.** Expression.ray's rule maker, `painted` and `reported` return their
   additions, so the turn appends them. Then regions: a statement's memory is let go but its answer. This replaces
   Heap, Memory, Isolation, Collector and Images, and is what lets calls run.
5. **One writer.** High, Lowered, Locals, Compiled's grammar and `Low` become one Ray → WebAssembly writer in the
   bootstrap part, parameters and names as locals. Texts and Output go with them.
6. **Requests into the language.** With calls running: level.ray's requests as the entrypoint's definitions, then
   numerals (spec/TODO.md's order), then Compiler.ray's levels run by the full language.

**Step 3 done (2026-11-14, 5dc5e0ff):** `read(pattern, at, then)` in Runtime.ray (758 → 652 lines), the choice stack,
undo notes and registers gone; both suites at baseline. As fast for the same work (the same steps, the same time, at every
prefix measured). The suites take longer only because the statements that never finish (six, past their budget in both)
now run to their 200M steps: they were cut earlier by young memory filling (`near_end`), which the reader now lets go
of sooner. A reading goes as deep as what it reads on to, so compiles run in a thread given the reading stack
(`.entrypoint.mjs` `compiled`). Memo and led caches still there (steps 1–2).

Step 4's copy-out was tried first (2026-11-14) and shelved: every copy checks out, but which rule answers changes with
where things are in memory (spec/TODO.md, "Tried 2026-11-14"). Step 3 goes first: with no choice stack and nothing to
undo, most of what reading compares by address goes too.

**Step 4's copy-out landed (2026-11-14, b06f7054):** each outermost statement's end copies out what older words and the
run hold of it and lets the rest go, both suites at baseline. What was left comparing by address was the pairs log, and
tests writing into what was copied out were never let go (spec/TODO.md, "Landed"). Next in step 4: the older machinery
the copy makes redundant (frames, `isostack`, regions, `lasting_copy`'s own pass) goes, and statements answer what they
define.

**Step 4's frames compacted (2026-11-15):** a call's frame of a megabyte or more, ending with something older holding
what it made, moves what is still held down to where it began and lets the rest go, paced so each byte moved is paid for
by one made (`Collector.paced`). What lasts given values not by a write is noted as a write is (`Notes`). Both suites at
baseline, in about the time they took without (spec/TODO.md, "A call's frame compacted").

Steps 1–3 can each be measured alone: the suites' time and the self-compile's memory say whether the shape pays for
the cache it replaces. Step 4 needs Expression.ray changed with it. Step 6 is the language's own work, and the
engine's line count reaches 1000 only once it is done: until then a request in the language is a request in the
engine.

## One file: the new Expression.ray (the user, 2026-11-15)

"Continue autonomously with the whole plan … try not to change Expression.ray or only small edits, no new externals,
keeping the core. The next steps should merge all the functionality in a proper setup which is 1000 lines and is
Expression, Runtime and Compiler in one: the new Expression.ray."

So the three files become one, Expression.ray, of about 1000 lines, its reader (today's, up to `ex :=`) kept as it is
but for small edits. What is the back end's stays in `$/Wasm.project.ray` (AGENTS.md: what differs per platform goes in
the package it is about): writing WebAssembly is the Wasm package's, not Expression.ray's.

```
Expression.ray   ≈ 1000
  the reader        ≈ 380   today's, kept (its tests after `ex :=`, as now)
  values and calls  ≈ 250   Runtime.ray's kinds as headers, members, calls, reading with continuations
  the turn          ≈ 120   statements read and run, retried by lead, includes; what a statement defines kept
  memory            ≈ 150   one barrier; a statement's end copied out; a call's frame compacted, paced
  the levels        ≈ 100   Compiler.ray's own level (optimizations as rules), what is left of `level …`
$/Wasm.project.ray's bootstrap part: Ray written as WebAssembly directly (High, Lowered, Locals, Compiled, Low as one)
```

Where each of today's parts goes:

| Today | Lines | Goes |
|---|---|---|
| Expression.ray's reader | 384 | kept |
| Runtime.ray | 652 | values and calls, the turn |
| Texts, Output, Splices, Origins, Afterwards, Hooks | ~730 | the turn and the host's few words; what is the language's (origins as spans, `goto afterwards`) into the entrypoint |
| Readings, Keys, Caches, Pairs, Layout, Indexes, Members, Calls, Matching, Built, Turns, Entry, Basics, FieldIndex, Actives | ~1350 | values and calls; caches go with the structural fixes above (the text's shape, rules by lead) |
| Heap, Memory, Notes, Isolation, Collector, Starts, Images | ~990 | memory |
| Compiler (its level) | 300 | the levels |
| Lowered, High, Locals | ~1150 | the Wasm package's bootstrap part, one writer with Compiled and Low |

Order: the one writer first (it changes nothing the suites see, and the fixpoint checks it), then memory, then the
structural fixes with what they replace, then Runtime.ray and the levels folded into Expression.ray, which the host then
reads alone (with the Wasm part).

**Folded first (2026-11-15).** The fold moved ahead of the rest: every test already read Expression.ray and Compiler.ray
(included by the entrypoint; Runtime.ray was beside it, not included), so one file changes little: the runtime is now read
too, and measured the same (suites 249/200/11 and 135/133/8 in 223 s and 185 s, the self-compile 51 s). Expression.ray is now the reader, its tests,
`Compiler`'s own level, the runtime (`Runtime := class`, which the host lowers from, to the end) and the levels. Runtime.ray
and Compiler.ray are gone; what is pruned from here on is pruned in the one file.

**What writes WebAssembly out, moved to the Wasm package (2026-11-15).** Output (bytes, LEBs, data and the aside part)
and Locals (High's functions given their parameters as locals) are the back end's: they went to `$/Wasm.project.ray`'s
`Writing` part, which the host lowers after Expression.ray's runtime. The module is the same, byte for byte; the suites
got faster, since a test no longer reads them as the language's (`--test` 223 → 183 s, `--test-all` 185 → 140 s, with
one error fewer, 7). Expression.ray: 4250 lines.

**The image from the globals; tests leave out what is lowered (2026-11-15).** `image_out`/`image_in` are written by
Lowered from Low's globals (every one, a word each), so Images no longer copies each by name. What Expression.ray has
lowered (from `Runtime := class` to its end) is the back end's, as Runtime.ray was: the host leaves it out of what a test
reads (as it leaves out a comment, each line kept where it is). The same results, `--test` 183 → 67 s, `--test-all`
140 → 30 s (5 errors), the self-compile 51 s. Baselines from here: 249/200/11 in 67 s, 135/133/5 in 30 s.

**Where it stands (2026-11-15, evening).** Expression.ray is 3939 lines: the reader 384, its tests 73, `Compiler`'s own
level and the language's extensions ~300, then what is lowered ~3200 (Runtime 646; memory ~860: Collector 330, Memory
139, Images 117, Isolation 108, Notes 72, Heap 71, Starts 17; the reading's caches and indexes ~560: Indexes 184, Pairs
120, Readings 78, Caches 78, Keys 40, Layout 66; the turn and the host's words ~500: Turns 145, Splices 134, Hooks 125,
Afterwards 112; values and calls ~260). Moved to the Wasm package as the back end's (`Writing`, ~420 lines): Output,
Locals, what only the compiler asks of a text (`Asked`) and reads a program as (`Statements`, with the parse table). What
nothing but the back end's compiler reaches is now none (scratchpad `backend.py`). A statement's end compacts its frame
as a call's does (the copy out gone). What is left to reach 1000 is the restatement the plan above describes: the reading
as one rule per pattern kind through a continuation, the caches replaced by the text's shape, memory as one way of
keeping (a test's end that way measured 15% slower: TODO.md).

**Where it stands (2026-11-16).** 3836 lines. Baselines now: `--test` 249/200/11 in ~56 s, `--test-all` 135/133/5 in
~17.5 s, the self-compile 48 s and 539 MB (r144 219113 bytes). What made them faster, with the same results: a node
keeps the style it is shown as (`level shown` no longer scans what is painted), and the collector walks what is kept,
not what was made (whole chunks skipped where nothing marked starts, the copy out from one live value to the next, a
value's cells cleared at once). Calls (step 1 of the language order) read with the lazy reader (`led`, ~40 lines, not
landed: TODO.md) pass more (`--test-all` 135 → 294) but take ~3× as long, as the language then runs its own library
(every list Array's `new` and `append`): landing them waits on calls costing less. Where that time goes, measured on
the entrypoint: memory a quarter (a test's end tracing what it painted 13%, a frame's end 11%), paints made each time a
rule applies 15% (a styled hole's, a parameter's: the same places again in a loop), member lookup by a node's fields 8%.

## The rewrite (the user, 2026-11-20, evening)

"You need to get to 1000 preferably hundreds, cut massively. reading and running should be intertwined such that it's
one Expression.ray setup, like the old 75-line setup we had (b32e4da6's target), we want to return to that as much as
possible. The runtime needs to be the simplest thing ever, because reading can be so simple." And: "the level primitives
should all be gone." Decided: **rewrite, then grow** (the suites drop, then come back), and **the old engine builds the
new** (r144's Lowering lowers the new runtime; the fixpoint returns once the compiler is rules too).

What is given then: the four externals (`.`, `&`, `goto`, `label`) and what `High` writes a program as: values (nothing,
true, false, numbers, texts, lists, nodes and their fields, closures), patterns (literal, sequence, either, repeated,
characters, a hole), a pattern reading a text, a call. Nothing else; no `level …`.

Measured (dd96655e): the compiler's parts call ~160 runtime names, and from those 2039 of the runtime's 2553 lines are
reached, because `reads` and `in_turn` carry where a statement ends, which bytes pair, a line's indent, splicing, reading
again and the memo. Those are the language's, not the runtime's: they move into the setup as rules.

1. **Statements read by rules.** Where a statement ends (a line, unless indented on or inside a pair), which bytes pair,
   holes spliced: written in the setup, as the target's `Statements` is (`dynamically (leading_whitespace,
   {statement: concurrently context.reading(.)}: context.rules.keys)[]`). Turns, Pairs, Layout, Built, Splices, Readings,
   Keys, Members' and Calls' helpers go.
2. **The language part without `level`.** Each of its 28 written as rules, or let go: tests paint by a node the host is
   told of, not by `level paints`.
3. **The runtime from nothing**: values, nodes, lists, texts, the patterns and one backtracking reader, calls; memory
   only taken (a frame given back when it wrote nothing older, if that is needed). Budget: under 500 lines.
4. **The compiler as rules**, so the new engine writes itself: the fixpoint again.

The suites are counted after each step and grown back from wherever step 3 leaves them.

## Cut first (the user, 2026-11-20)

"Quickest path towards cutting down the engine so you don't fix things which you'll prune after." So no more fixes to
what a later step replaces (the pairs a line scan would teach, the pacing of compaction, the reader's handling of `==`):
each step below removes code, and what it unblocks is fixed in the shape that remains.

1. **Memory as regions** (what calls wait on, and ~860 → ~150 lines). Done: call frames no longer compacted (cfa89ea8,
   suites the same). Next: a statement inside another's reading that took a megabyte or more is let go as an outermost
   one is (its kept part lasts: word 3984 and the open frames and statements begun past it, the notes begun again), and
   compacting reads the lists the run holds by their own word only, as their items' writes are noted already. Then what
   that leaves unused: the notes' once-table, the notes' pruning when full, the second copy path (`lasting_copy` beside
   the slide), the object starts' summary.
2. **Calls land** (E.C1, the body of a styled rule spliced again) on that memory, with the language's own library run.
3. **The text's shape read once** (lines, pairs, each byte's pair end): Pairs, Indexes, Layout's line work and the
   caches of `keys_reading` go to what it answers; `<{generics}>` reads as written.
4. **Requests into the language**, a section at a time (Texts, Splices, Readings, Keys, Members, Calls, Built, Origins):
   each written in the entrypoint as rules, its lowered half removed.
5. **The levels** (Compiler's own, ~300) as rules the full language runs.

**Where it stands (2026-11-20, evening).** 3804 lines (3891 this morning), suites the same and as fast: call frames no
longer compacted (cfa89ea8), compaction reads the run's lists by their own word (8f5bb86b), the notes kept as written,
one marking for both copies (f3573076), one way a frame closes (92c47269). Regions (step 1's next) are correct but
18–40% slower and not landed (TODO.md); calls with them still stop in Number.ray and the entrypoint, not by memory: the
language running its own library (`Number.Named.for`, a class's helpers by `.rest`) past a statement's budget.

## Risks

- **Speed.** The caches exist because each removal measured slower (keys 20×, `occurs` 3×, the memo 3.5 min). Each
  structural replacement must measure at least as fast before its cache goes. If one doesn't, it stays a removable
  level until it does.
- **Two-step builds.** Every change to what the engine's own code does is built twice (old definitions kept, then
  removed, `START=`). Steps 3 and 5 change the engine wholesale. They land as a revision built by the old engine, then
  rebuilt by itself.
- **Expression.ray's writes.** Step 4 changes how the reader defines rules (as answers, not writes). This is the
  largest semantic change and needs the suites to stay at baseline throughout.

## The runtime rewritten (plan, 2026-11-23)

Where it stands: Expression.ray 2587 lines (reader and its tests ~440, the runtime ~2150, ~1950 of code). Memory is
already simple (a frame given back when nothing escaped it, a test's at its end, f08f2d70); the optimization levels
are Compiler.ray's; the editor's image and stepping are gone. Measured: every runtime function left runs in the
self-compile or the suites but for ~74 lines, so what is left is cut by replacing it, not by pruning.

What a new runtime must answer, and nothing else (594 statics now, 133 asked from outside):
- emitted by the compiler (High, Lowered; 79): alloc anything append applied_of arg argn arrays assign astype bound
  call call_member call_member0..2 chars classh closure conj define dynamic either ending equal extended field
  first_where get getter greater greater_equal greedy headpattern holes_of index input invoke invoke0..2
  isolated_close isolated_open keyed last last_where less less_equal list maybe member2 minus names negated node plus
  quotient readsv readtext remainder repeated same seeded select selmethod sequence setmember shifted_left
  shifted_right staged tag text times truthy typed under unequal with with_code written;
- asked as `level …` (26): closing curried_value cw_enclosed cw_inner cw_span_of cw_trimmed file_named
  function_given holds_outside holds_text input_part kept_later kind_of mapped member moved_keys names paints paired
  reads reports run_kept separator_of set_parser span tested_here;
- the host's (main, name_text, out_base, out_length, …) and what `$/Wasm.project.ray`'s Writing part calls (96).

Order (each a revision with both suites the same, per test): the matcher's choice points as one record (either,
anything, repeat, hole: the four save/retry prologues); Built/Readings/Splices/Texts/Indexes as one text module;
Turns' reading again folded into in_order; Afterwards/Images' test running as one; then the matcher itself (Pattern
kinds 1–28 → the reading rules the decision keeps: hole modes, pairs, statement ends) rewritten whole. Floor: the 133
above plus the matcher's core; ~550 lines is the estimate for the runtime, so ~1000 for Expression.ray; 500 needs the
Writing part's 96 calls and the compiler's 79 emitted names cut too (the compiler asking less of the runtime).
