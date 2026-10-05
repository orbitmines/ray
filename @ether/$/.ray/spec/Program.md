# Ray — Program, control and compiler spec (from `v0/.entrypoint.ray` and `Compiler.ray`)

Status legend: **Decided** · **Open** · **See L§n**.
IDs `P…`. Answers go under **Decided** at the end.

---

## P1. The program as a value (*ep:644–700, 1129–1170*)

- **P1.1 Program = Ray with conditional edges** — standing instruction: `Program` is a Ray, and the
  conditional gotos are its conditional edges. *Compiler:204*: `class Program = Ray<Vertex>`.
- **P1.2 Span** — *ep:1130–1135*: a span is a Ray (a subgraph of the text); `line_number` is
  `span.reverse{"\n"}.count`, column `to(.reverse{"\n"}.first).length`; `span.line:column`, with the
  inverse recovering the span.
- **P1.3 Program state** — *ep:1150–1160*: a looped control flow keeps each iteration's values in the
  state's history; branches are history branches; "is the context just the program state?";
  `in` is the previous state, but should be the whole function context; `.local` is `components.last`.
- **P1.4 `**` of a value** — *ep:1105–1106, 1166*: `return_type**` is the function that generated the
  value; a variable where `**` is the program is bound to that function's result.
- **P1.5 Function analysis** — *ep:1059–1077, 1167*: `.variables`, `.usages`, domain, image, codomain,
  injective, surjective, bijective, homomorphism, isomorphism, endomorphism, automorphism, monomorphism.
- **P1.6 Multi-program mode** — *ep:1140*: run a program with its variables set to their superpositions.
- **P1.7 Program to text with contexts** — *Compiler:179–198*: converting a program back to text needs to
  decorate contexts (`&caller = OBJECT_ID`), with object references to a particular version (or the
  latest, with `dynamically`).
- **P1.8 Result** — *Compiler:201*: `Result = Waiting | Intermediate(function, result) | Final(result)`.
- **P1.9 Updating a running program** — *Compiler:207*: when a program is updated mid-run, update every
  running quest of that function. *ep:1107–1108*: switching the global context to another language
  version; patch existing objects if possible.

## P2. `&caller` and control (*ep:1120–1128, 1148, 1168–1185*)

- **P2.1 `&caller`** — L§10.3: the calling context as a value, with return/finally/redo/break/continue
  on it. *ep:1168–1172*: it is empty at the top level, where it is the character; "the latest known
  character associated with this chain of calls"; what if the character is branched?
- **P2.2 Overriding `&caller`** — *ep:1120–1121*: values set by manually setting `&caller` are ignored,
  and control returns only to the original function (history sets `&caller` to keep history).
- **P2.3 `return`** — *ep:1124–1125, 1148*: return as a pointer to the end of the function
  (`() => goto &done`); returns as push-backs vs continuations.
- **P2.4 `recur`** — *ep:1180*: recur without arguments is tail recursion. L§10.3.
- **P2.5 `do`-while** — *ep:1267*.
- **P2.6 `loop`** — *ep:1444–1445*: `loop` is `while true`; `branch loop print "hi"`.
- **P2.7 Labels as running** — *ep:1485*: a label is true while pending/executing; the same for a
  program instantiation, false when done.

## P3. Hooks: code between statements (*ep:1080–1083, 1110–1112, 1126, Compiler:75*)

- **P3.1 Before/after each statement** — L§10.3 `<{expression}>`. *ep:1110*: also between recursive
  calls, x levels deep (benchmarking). *ep:1111*: an expression run on each successive call in its
  context, only within that `()`. *ep:1126*: before_each/after_each recursively, with a filter.
  *Compiler:75*: `global**.[INSERT IN BETWEEN EACH STATEMENT DYNAMICALLY]` (a debug timer).

## P4. Concurrency (*ep:1089–1093, 1104, 1116–1119, 1137–1138, 1189–1192, 1453–1483*)

- **P4.1 The primitives** — *ep:1191*: `branch` (a separate thread), `sync` (run concurrently, return
  when all are done), `race` (first one wins, the rest cancelled), `rush` (like race, but the rest may
  finish), `defer` (run after the current context exits), `await`. L§10.3.
- **P4.2 `pending` and `shared`** — *ep:1453–1483*: `pending count = graph.count > 1T` inside a branch:
  others wait until `count` is initialized; `pending` merges contexts within a function scope;
  "pending is always shared"; `shared` sets visibility across programs; reading `count.acc` reads
  the intermediate accumulator of a `.reduce`.
- **P4.3 Intermediate results** — *ep:1451–1452*: `.count` is a reduce, so its intermediate result
  is readable; an optimization uses intermediate results for `>` checks (`graph.count > 1T` stops early).
- **P4.4 Threads** — *ep:1089–1090*: `local**#` iterates threads; how to get the current one.
- **P4.5 Termination** — *ep:1104, 1184*: a race where one branch always terminates terminates;
  "each non-expandable step terminates, and takes finite time" (Time.ray: termination is temporal).
- **P4.6 Out of order** — *ep:1119, 1092–1093*: out-of-order execution; the top-level expression is
  out of order.
- **P4.7 Shaders** — *ep:1137–1138*: parallel iterators; an unrollable loop in the Many iterator.

## P5. `dynamically`, speculation, asserts (*ep:561–565, 1517–1535*)

- **P5.1 `dynamically x`** — *ep:562* (spec mark): re-read when what it depends on changes. Needed by
  UUID's `dynamically assert`, the frontend (F-D6), Keyboard.
- **P5.2 `dynamically` can't affect itself** — *ep:1215*.
- **P5.3 Parameterless functions are dynamic** — *ep:1524*.
- **P5.4 `speculative.if`** — *ep:1520–1523*: if the value isn't known yet, run the if-branch;
  `speculative.if<assume: true>`; turn possibly infinite tasks into a branch until known.
- **P5.5 Infinite loops dismissed** — *ep:1525*: a detected loop is dismissed as a possible value, and
  rechecked on change.
- **P5.6 Asserts collected** — *ep:1527*: `dynamically assert` checks all conditions and reports them
  together, not throwing at the first. *ep:1516*: asserts are part of the type.

## P6. Errors (*ep:751–756, 1372–1376, 1504–1515*)

- **P6.1 Spelling** — L§10.3: `$` after a call. *ep:1372–1376*: return a value if error; with a default;
  "maybe error but pass" (doesn't catch FATAL); reintroduce into scope.
- **P6.2 `try`/`catch`** — *ep:1504–1515*: a draft `try` class built on a goto.
- **P6.3 Wrapping** — *ep:751–756*: wrapping errors with more information; disallowed variables in
  errors are traced and not sent over pipelines that may not see them; auto-return on failure;
  `&:=` to stack errors together; OOM; access the function context of the error.

## P7. Languages as mappings (*ep:1193–1212*)

- **P7.1 What a language is** — "A language is just a mapping from Expression => as (*)"; a library is a
  language too (mathematics); a language's history is the versions exposed in its repository view.
- **P7.2 Extensions** — *ep:1200*: different Expression behaviour per file extension (`.uc`, `.uci`, `.upkg`).
  Relates to F-C1b (`$.png`).
- **P7.3 When is it a language** — *ep:1203*: "sufficiently interesting mapping between output".
- **P7.4 Translating subexpressions** — *ep:1096–1097*: only translate subexpressions to certain languages;
  superpose implementations and race them.
- **P7.5 Newline meaning** — *ep:1206*: how a language defines its assumptions (newline = `=>` etc.).

## P8. The compiler (*Compiler.ray*)

- **P8.1 Rewrites** — decided: optimizations are rewrite rules in `Compiler.ray`, as levels.
- **P8.2 The classic passes** — *Compiler:56*: TAC, SSA, constant folding, CSE, LICM, GVN, strength
  reduction, scalar replacement. Open: which first.
- **P8.3 Specific notes** — store both arrays vs iterate; B-tree indexes for string lookups;
  ignore_case on both sides; `Ray.index` → a for loop with `i+1`; unordered `#` collapses on the first
  true; `bound < infinite` ⇒ `.infinite` false; reference counting to decide store-vs-reference;
  cycles in `location.parent` map to None; big `instance_of` iterables stored separately; KMP/Boyer-Moore;
  gotos → `if`; dead stores; `.push_back(A)` ⇒ `.last = A`; `+=` without the copy.
- **P8.4 Multiple implementations** — *Compiler:80–82*: enumerations of possible requirements (for boolean:
  NAND, NOR, NOT & OR, NOT & AND); what are the tradeoffs?
- **P8.5 Optimization problems** — *Compiler:93–121*: `optimize x`, `maximize/minimize`, `prefer minimize y`
  under a condition, `allow capability`, constraints with `dynamically assert`; utility theory and
  social choice for preferences; "start slow, optimize over time".
- **P8.6 Frontends kept** — *Compiler:91, 139*: optimize going back and forth between abstract objects and a
  rendered screen per client preference; keep frontends around at the cost of re-rendering.
- **P8.7 Paying for optimization** — *Compiler:263–269*: a saving (projected minus actual use) is split
  between optimizer and beneficiary; needs a baseline that resists gaming. Relates to Gamification.
- **P8.8 Building from a directory** — *Compiler:243–247*: a name used twice resolves to the nearest in
  directory order, with a tool to choose; forward refs resolved as found; reload what a file touches.
- **P8.9 Two-language files** — *Compiler:249–251*: `.js.ray` (the `.js` interpreted over Ray primitives);
  the editor shows half of each icon.
- **P8.10 Refactors** — *Compiler:253*: the language answers whether two programs are equivalent.
- **P8.11 Hot reload and memoising** — *Compiler:319–322*: hot reload with migrations at every level;
  memoise every computed value against a hash of its inputs.
- **P8.12 Standard library or not** — *Compiler:328*: ask whether something came from the standard library.
- **P8.13 Reading foreign software** — *Compiler:343–385*: the language index; items, capabilities and
  purposes read out of executables; themes as interfaces; LSP. (The Ether's, mostly; confirm scope.)
- **P8.14 Media as optimization** — *Compiler:289–292*: video etc. as optimizations of 2D/3D scenes over time.
- **P8.15 HTML inputs as constraints** — *Compiler:145–159*: `<input>` attributes as narrowings
  (`maxlength` = `{.length <= 5}`, `readonly` = `none.write`, `required` = `choose String`, `step`, `min`/`max`,
  `list` = an enum). Relates to Frontend.md.
- **P8.16 Program versions in history** — *ep:1095*: store a copy of the cached program in history and
  run from the cache.
- **P8.17 Resource accounting** — *ep:1175*: calculate the resources used (storage, memory, time, size of the
  Ray). L§10.8.

---

## Decided

Answers from 2026-09-30.

- **P2.8 (2026-10-02)** `if … { } else { }` answers what its taken block answers (the last value it
  references), not a branch object. `elsif` continues the chain; `else` ends it and answers the chosen
  value. `unless` is a branch of its own, so `unless … { } else { }` chains like `if`. (`ep` `if`,
  `elsif`, `else`, `unless` classes.)

- **P4.1** The concurrency set stays as the draft has it: `branch`, `sync`, `race`, `rush`, `defer`,
  `await`, each a class over Program like `if`/`while`.
- **P4.2** Branches can be named (`A\ branch …`, a label). Sharing a variable between branches uses
  locations instead of a `shared` keyword: `x @ A` is x in branch A, and `x @ ->` is x in every branch
  it was given to (Almanac §3). `pending` stays: reading a pending value waits until it is set.
- **P6.1** The `$` forms:
  ```
  f() $                 // pass the error up (explicit)
  f() $ DEFAULT         // on error the call is DEFAULT
  f() $ None            // on error None
  f() $ return X        // on error return X from this function
  f() $ { … }           // handler block, `.` is the error
  f() $ ERROR[k] `…{.}` // wrap and rethrow as kind k
  f() $?                // result is T?, None on error (not fatal)
  f() $? DEFAULT        // = f() $? ?? DEFAULT
  f() $!                // escalate: any error is fatal
  f() $?!               // catch even fatal; the error is in scope as `.`
  f()
    $specific.err  …    // per kind, one per line
    $a.err | $b.err …   // several kinds, with `|`
  ```
- **P6.3** Errors carry their context under the visibility rules: variables that may not be seen are
  traced and not sent over pipelines that can't see them. `&:=` stacks errors together instead of
  replacing.
- **P5.1** `dynamically x` recomputes on every change by default, because a change that breaks the type
  must not be allowed. Optimizations (Compiler levels) make this cheap so that not every small
  computation pays for it.
- **P5.6** `dynamically assert` collects every failing condition and reports them together.
- **P1.3** A program's context *is* its state, with history: `&` is the current state, `.local` its
  last component, and iterations and branches are its history (`%`).
- **P2.1** At the top level, `&caller` is the character running the program (L§8.2's `@actor`).
- **P1.8** `x**` is the whole body as a Program, *selected* at the running step:
  ```
  x := compute()
  x**                  // the Program of compute, selected \at\ the running step
  x**.&                // its context there: the locals so far
  x**.&.acc            // an intermediate value
  x**.is_terminal      // finished?
  x**.expand           // the steps, as a Ray
  x**.next             // step it once (in a speculative copy)
  ```
  "Waiting / Intermediate / Final" are derived from where the selection is.
- **P1.9** Hot reload: running instances of an updated function continue in the new version via
  migrations (L§7.2). Where state can't migrate, they keep the old version and a quest is raised.
- **P3.1** Code between statements is a rewrite on the program, applied as a Compiler level, with no
  new syntax: `with O = Compiler.default + Debug.timed`,
  `Debug.timed := { {s: Statement} => s; timer.tick }`. The draft's `<{…}>` is dropped.
- **P7.1** A language `$.x` is exactly a mapping from text in that format to Ray values (and back,
  through its inverse): a Program level whose rules read `.x`.
- **P2.6/P2.7** `loop` is `while true`. A label answers true while its program instance runs
  (`A\ branch …`, then `while A => …`).
- **P8.2** All four, in this order: (1) numbers counted rather than walked, (2) constant folding and
  dead code, (3) goto → if/while, (4) CSE, LICM and SSA.
- **P8.5** Optimization problems are built now, as a library: `optimize`, `minimize`, `maximize`,
  `prefer`, `allow`, as classes over a search (quests), with constraints as `dynamically assert`.
- **P8.8** Two definitions with the same name in one project are an error. Across projects, the
  nearest in the project hierarchy and then directory order wins.
  **Answer 2026-10-05:** a dependency on `@ether/…` (`@ether/UI`) expects the `@ether` userspace to be filled by
  the language, since its .ray files are bundled; otherwise it defaults to network access to `@ether`.
- **P8.9** `FILE.ext.ray` is one mechanism: the file is read with `$.ext` over Ray. `.cfg.ray` is the
  cfg sublanguage, and `.js.ray` is JS over Ray.
- **P2.3** `return x` sets the result and jumps to the function's end label (`&caller.return` = goto the
  end); it is lexical.
- **P2.4** `recur(args)` is a tail call; a bare `recur` uses the same arguments.
- **P4.5** `Terminating := Program{∀ path ∈ .paths: path.length < ∞}` (quantifier style). Finite step
  time is part of it (Time.ray's note).
- **P4.6** Ignored: no out-of-order execution rule.
- **P5.4** `speculative.if` is `if assume c` (U-C3); `speculative.if` is dropped.
- **P5.5** A loop detected while evaluating a value stops the local spend and becomes a quest.
- **P6.2** Only `$`: `$ { … }` is the catch block, and there is no `try`/`catch`.
- **P1.2** A span is a Ray (a subgraph of the text), with `line`/`column` derived and reversible back to
  the span. Diagnostics' locations are built this way, language-side; the engine only hands over where.
- **P1.5** All the function-analysis properties now: `.variables`, `.usages`, domain, image, codomain,
  injective, surjective, bijective, and homo-, iso-, endo-, auto- and monomorphism.
- **P1.6** "Multi-program mode" is calling with unknown arguments, `f(?)`: the run is the abstract
  interpretation.
- **P8.13** Reading foreign software is the Ether Library Project's (2028), not this spec's.
- **P2.2** Values set by overriding `&caller` are ignored; control returns to the original function.
- **P4.3** An early stop on a running reduce (`graph.count > 1T`) is `x**.&.acc` (P1.8) plus a Compiler
  rewrite for comparisons.
- **P4.7** Shaders as parallel iterators are kept as a note for a later GPU Language level (N1.8).
- **P8.3** All of the draft's specific optimization notes are kept as the Compiler.ray backlog.
- **P7.4** Implementations in different languages can be superposed (`|`, U1) and raced (`race`, P4.1).
- **P8.7** Paying for optimization moves to `Gamification.md`.
- **P8.11** Memoising computed values against their inputs is a Compiler level (`Compiler.memoised`), keyed
  structurally until hashes exist.
- **P8.12** Whether something came from the standard library is read through its location, with no new
  keyword.
- **P1.1** `Program` is a Ray whose vertices are statements (each itself a Program), with sequence and
  conditional jumps as its edges.
- **P1.4** A value's `**` is the part of the program that produced it (provenance).
- **P1.7** A program written back to text includes its contexts, and prints references as locations with a
  version (`@x %3`), or the latest with `dynamically`.
- **P2.5** `do { … } while cond` is a body-first do-while; it replaces the alias `do ^keyword := while`
  at `ep:606`.
- **P4.4** `&#` is the current context's concurrent branches; the selected one is this branch.
- **P5.2** A dynamic value can't trigger its own recompute; a self-trigger is a cycle diagnostic.
- **P5.3** Parameterless functions are automatically dynamic (`area => width * height` is always current);
  a stored variable isn't.
- **P7.2** Each file extension is its own language (`$.uc`, `$.uci`, `$.upkg`).
- **P7.3** "When is a mapping a language?" is left open, as a research question for the Library Project.
- **P7.5** A language states its own assumptions (such as "a newline is a new statement") as rules in its
  level: Ray's in `.entrypoint.ray`, another language's in its `$.x`.
- **P8.4** Several implementations of one method are `|` alternatives (U1), and a Compiler level picks
  between the requirement sets by tradeoff.
- **P8.6** Caching rendered frontends against re-render cost, per client preference, is a UI level.
- **P8.10** A refactor keeps meaning when the two programs are equal under intensional `==` on `**` (U9).
- **P8.14** Media formats as optimizations of 2D/3D scenes over time are kept as a note for the later
  rendering work.
- **P8.15** In the UI project's HTML level, a field's type narrowing becomes the `<input>`'s attributes
  (`maxlength` = `{.length <= 5}`, `required`, `readonly` = `none.write`, `step`, `min`/`max`), and back.
- **P8.16** Programs are stored in history with their cached compiled form and run from the cache while
  unchanged, as a Compiler level (with P8.11).
- **P8.17** Resource accounting is a whole section of its own, done **last**: resource and memory
  management, which the language doesn't have yet but will. (Also listed in `Plan.md`.)
- **Covered elsewhere:** P8.1 (standing instruction: optimizations are rewrite rules as levels).

### Answers 2026-10-05 (errors)
- `ERROR@Kind` / `FATAL@Kind` with a message: what follows `@` is the error's kind, from the enum `Diagnostic.Kind` (so it can be autocorrected); the diagnostic points at the ERROR line itself and carries the call trace. A non-fatal error is attached to the value the enclosing function answers; a fatal one is that value. At the top level the statement's value takes it. `ERROR[k]` is gone; `$Kind` on the next line handles one kind.
- The `$` forms are methods painted `^error`; `x $ return 9` needs no form of its own (the fallback is read lazily in the caller's scope).
