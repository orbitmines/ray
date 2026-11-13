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
| Regions, isolation flags, pins, the undo log, test images, `lasting_copy` (Heap, Memory, Isolation, Collector, Images: ~700) | **A statement is a transaction over values it returns:** what a statement defines (rules, members), paints and says is its answer, appended by the turn that read it, never written by the statement into older nodes. So when a statement ends, its memory is let go except its answer, which is copied out (one copy, the one routine kept). Tests are statements. No barrier, no log, no pins. Calls run inside it as they like. |
| `Locals` (185 lines rewriting compiled text) | High writes a function's parameters as the machine's locals when it writes the function (it knows them then). |
| Afterwards, Hooks, Origins, Output, Texts, Splices (~700) | Mostly host plumbing in raw words. What stays is in the Run class (written out by the back end) and in the language: `goto afterwards` is a label (§21.2); origins are where a text is (its span is its origin); splicing is a rule. |
| `level` requests (90 names) answered by engine functions | Design §21.2: externals are `.`, `&`, `goto`, `label`, plus the host's IO. The requests become the entrypoint's own definitions, read by the full language once calls run. The engine keeps only what a back end must give: the value kinds, member, call, read. |

## Decided (the user, 2026-11-13)

- **Statements answer what they define** (step 4): Expression.ray's rule maker, `painted` and `reported` return what
  a statement adds; the turn appends it. No barrier, log, pins or collector.
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

Steps 1–3 can each be measured alone: the suites' time and the self-compile's memory say whether the shape pays for
the cache it replaces. Step 4 needs Expression.ray changed with it. Step 6 is the language's own work, and the
engine's line count reaches 1000 only once it is done: until then a request in the language is a request in the
engine.

## Risks

- **Speed.** The caches exist because each removal measured slower (keys 20×, `occurs` 3×, the memo 3.5 min). Each
  structural replacement must measure at least as fast before its cache goes. If one doesn't, it stays a removable
  level until it does.
- **Two-step builds.** Every change to what the engine's own code does is built twice (old definitions kept, then
  removed, `START=`). Steps 3 and 5 change the engine wholesale. They land as a revision built by the old engine, then
  rebuilt by itself.
- **Expression.ray's writes.** Step 4 changes how the reader defines rules (as answers, not writes). This is the
  largest semantic change and needs the suites to stay at baseline throughout.
