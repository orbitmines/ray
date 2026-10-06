# Ray — Program, control and compiler spec (from `@ether/ray/.entrypoint.ray` and `Compiler.ray`)

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

From the drafts review (2026-10-06).

- **P1.10 Partial application** — **Q.** *.ray2/Program.ray:122–123, 297–299, 406*: `<{filled_parameters}>` on any
  expression, even parameterless; a copy on a history branch; `base` is the unfilled original; each filled argument is
  inserted after that variable's first initialization. Recommend: `f<x: 1>` is f with x filled, a copy of f on a history
  branch (`++`); `f.base` is the unfilled original; each filled argument binds where its parameter is first initialised.
  **Answered (user, 2026-10-06):** already decided (2026-10-06, reader session): `<…>` is partial arguments; generics are partial arguments that remember what they were given (`f<a: 'A'>`, then called with `(b:)`).
- **P1.11 The receiver is a parameter** — **Q.** *.ray2/Program.ray:292* ("from parameters one of which is the instance"),
  *.ray2/Feature/Proof.ray:5* (a method on `this` is bound to `(this, …)`). Recommend: `this` is the first, unnamed
  parameter (`x.f(a)` ≡ `f(x, a)`), and `&callee` names it.
  **Answered (user, 2026-10-06):** no: `this` stays a context member only (U4's `&`); there is no uniform call syntax.
- **P1.12 Void return** — **Decided (draft).** *.ray2/Program.ray:446*: a function whose return type is None answers
  nothing; its last value is not its result and is not added to lists (T1.3).
- **P1.13 Sequencing programs** — **Q.** *.ray2/Program.ray:216*: `, (b: Program): Program` must be overridden, since the
  two programs' states clash. Recommend: `p, q` on Programs is sequencing; the two keep separate contexts, and q's free names
  read from p's final context.
  **Answered (user, 2026-10-06):** `p, q` is just a composed value: an array (or any structure) of Programs; a `Program[]` is equivalenced to a Program by `as Program`, which runs them with separate contexts.
- **P1.14 The sequence about one variable** — **Q.** *.ray2/Program.ray:212*: how to make the sequence of operations be
  only about one variable and what it depends on. Recommend: `x%` is x's own sequence, and `x**` restricted to what x depends
  on is its slice (`x**.slice`).
  **Follows (2026-10-06):** `x%` is x's own sequence and `x**` its provenance; the part of `x**` that x depends on is its slice, `x**.slice("x")`, the only new name. From `%` history on every Node and P1.4 (`**` is provenance).
- **P1.15 Saving a running program** — **Decided (draft).** *.ray2/Program.ray:313–315*: `program as Expression` writes
  the program with its running state (`x**` selected at its step, P1.8), so pausing or saving a game is writing it. With no
  state changed it writes the original expression.
- **P1.16 Fields on a slice** — **Decided (draft).** *.ray2/Program.ray:198–200*: a field may be set on a slice
  (`s[0..2].field = v`); it lives on that subgraph (P1.2), so `s[0..2].field` and `s[3..5].field` differ. Styles and marks
  on substrings (X3.4 DoNotEmit) are such fields.
- **P1.17 Selection through nested expansions** — **Q.** *.ray2/_todo/ray.ray.txt/Ether/instance/Expression.ray:45*: a
  program pointer that `.expand`s into calls needs both "handling this expand" and "here inside it". Recommend: when the
  running step is a call, `x**`'s selection is a chain, one selection per expanded level (`x**##`), outermost first.
  **Follows (2026-10-06):** when the running step is a call, `x**`'s selection is a chain with one selection per expanded level, outermost first (`x**##`); no other record holds it. From P1.8 (`x**` is selected at the running step) and Ray being the IR.
- **P1.18 A continuation keeps its own context** — **Decided (draft).** *…/Ether/instance/Expression.ray:24–30*: a
  continuation written in another context (`+ C`) applies to the previous result in *its* context, not the enclosing local
  one (as G2.13). The draft's `&caller = OBJECT_ID` spelling is `@<uuid> { … }` (L§8.2).
- **P1.19 Recorded inputs, deterministic replay** — **Q.** *…/Ether/instance/Expression.ray:43*: keep other relevant vars
  (a random seed) in history so each thread is deterministic, with an option to run again without them. Recommend: a run
  records its nondeterministic inputs (seed, time, IO answers) in its history, so a branch replays exactly;
  `rerun(without: …)` replays with them unset.
  **Follows (2026-10-06):** a run records the answers of its nondeterministic inputs (random, time, IO: what `Nondeterministic` infers) in its history, so a branch replays exactly; rerunning without them is the same program with those answers unset (`Running.inputs`). From history replacing stored values and L§10.2 (nondeterminism is inferred from random/io/time).
- **P1.20 A step is `. = .next`** — **Q.** *journal Ray Calculi & Physics.md:20–25* (paraphrased): running is one
  instruction, move to `.next`, repeated; parallel running applies it at many places at once; the instruction itself could
  be another. Recommend: record it as the definition of stepping; `x**.next` (P1.8) is one application, and a Compiler level
  may replace the stepping rule.
  **Follows (2026-10-06):** stepping is the one rule `. = .next`, applied at each cursor (a program is cursors in a graph, P2.10's answer); `x**.next` is one application, and replacing the stepping rule is a Compiler level. From P1.1 and P1.8.
- **P1.21 `Function`** — **Decided (draft).** *.ray3/Program.ray:28*: `class Program | Function`; `Function` is an alias of
  Program. (The `_todo` review's structural `Function := Node{(args) => *}`, *.ray2/_todo/ray.ray.txt/ray.ray:119–124*,
  agrees where every such Node is a Program.)
- **P1.22 Node's members resolve on `this`** — **Q.** *.ray2/Node.ray:20–22*, *.ray2/Program.ray:104–105*: what is defined
  on Node isn't put on local unless explicitly accessed; closures get only things defined outside Node; `#`, `*` go on
  `this`/global. Recommend: Node's own members (`#`, `##`, `*`, `**`, `%`, `@`) always resolve on `this` (or `global` at the
  top), never on a local or closure frame; closures capture only names defined outside Node. (Also Types T3.)
- **P1.23 A commit expands to its run** — **Q.** *.ray2/History.ray:6*: evaluation history is a `.expand` on one commit.
  Recommend: a commit's `.expand` is the evaluation that produced it (its program's steps, P1.8); history is coarse,
  expanding a commit gives the fine-grained run. (Also World W3.)
  **Follows (2026-10-06):** a commit's `.expand` is the run that produced it, its value's steps (`value**.expand`); history stays coarse. From L§9.2.3 (expansions are not stored; they are `.expand`) and P1.8.
- **P1.24 Effects** — **Q.** *.ray2/Program.ray:26*: a notion of what a function changes, and limiting it with a keyword
  like `confidential`. Recommend: every Program has an inferred `.effects` (the locations it may write); a parameter may
  restrict it (`g: Program{effects ⊆ @local}`); passing `confidential` data requires the callee's effects to stay within
  the data's visibility.
  **Follows (2026-10-06):** every Program has an inferred `.effects` (`Effects.of`); a parameter restricts it with a narrowing on Programs (`g: Program{effects ⊆ @local}`), and passing `confidential` data requires the callee's effects to stay within the data's visibility. From L§8.1 (effects are inferred, nothing declared), narrowings on Programs (P4.9 `Terminating`) and L§8.2 (the `local` mark is tracked).

From the drafts verification (2026-10-06).

- **P1.25 Evaluate before committing the text** — *`…/instance/Expression.ray:36–38`*: references in a stored expression are to
  a version of the object ("dynamically is ref to most recent version, encoded how? UUID.last?"), "OR require eval before
  committing to expression string with object_id". P1.7 records the first option. **Q** — Recommend: P1.7 (decorated contexts,
  versioned references `x%[label]`, L§9.2) stays the default; the draft's alternative is a choice of the writer, committing a
  statement as its value instead of its text, which is what a `.%` cache line already is (`label\ value`).
- **P1.26 Variables set in a loop body** — *`…/utils/Number.ray:142`*: "A variable like this shouldn't be loaded into local,
  loop-specific var Howto?" **Q** — Recommend: `:=` in a loop body declares a variable of that iteration (T1.6), gone after it;
  `=` to a name from outside writes the enclosing binding (L§2.5). Nothing loop-specific.

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

From the drafts review (2026-10-06).

- **P2.9 Full recursion** — **Decided (Almanac).** *Almanac.tsx:1290–1293* (`limited (x) => x + 1/recur`): `recur` used
  as a value (not as the last call) is the function's result, recursively. It is an unbounded program, evaluated as far as
  it is read (N1.4).
- **P2.10 Labels across branches** — **Q.** *.ray2/Program.ray:126*: refer to labelled branches, so labels cross branches.
  Recommend: a label is visible from every branch of the same program (`A\` from branch B is `A @ B`); `goto` across
  branches is an error unless the target is in the current branch.
  **Answered (user, 2026-10-06):** a program is cursors in a graph, and branches are places. A `goto` into another branch is a cursor going there; by default it behaves like a function call: it enters that place and runs there with the expected variables defined (whether as a parallel cursor or by moving is for the semantics to decide).
- **P2.11 `if` as a match** — **Q.** *IDE:855* (paraphrased): write `if` with `==` followed by `,`-separated cases and
  `0 => …` instead of `match`. Recommend: `if ==` followed by cases is sugar for `x.match` (A7) on the comparison's subject;
  ask whether `match` alone is enough.
  **Answered (user, 2026-10-06):** no `match`: `if` only. `if x` followed by case lines matches each case with `==` by default (no operator written), and a case may be `is Type`. (This replaces `.match`, A7.)
  **Answered (user, 2026-10-06, later):** the cases sit in the block, with the same structure as a normal `if`: `if x { 0 => …; 1 => … } else { … }`.

From the drafts verification (2026-10-06).

- **P2.12 `&caller` is a Location** — *`…/instance/Expression.ray:34–35`*: "caller is the method in a class, since caller is a
  location, it has .parent on it defined on it which is the class"; "caller -> .parent == Some player except for the last one
  which doesn't have a .parent". **Decided (draft)**, in today's terms: `&caller` is a Location (U7), so `&caller.parent` is the
  calling method's class, and walking `&caller -> .parent` reaches the character who runs it (P2.1, T7.5); the last has no
  `.parent`.

## P3. Hooks: code between statements (*ep:1080–1083, 1110–1112, 1126, Compiler:75*)

- **P3.1 Before/after each statement** — L§10.3 `<{expression}>`. *ep:1110*: also between recursive
  calls, x levels deep (benchmarking). *ep:1111*: an expression run on each successive call in its
  context, only within that `()`. *ep:1126*: before_each/after_each recursively, with a filter.
  *Compiler:75*: `global**.[INSERT IN BETWEEN EACH STATEMENT DYNAMICALLY]` (a debug timer).

From the drafts review (2026-10-06).

- **P3.2 Injecting events into others' code** — **Q.** *IDE:380* (paraphrased): an event system in which a user injects
  events into code someone else wrote. Recommend: injection is a Compiler level the user applies (as P3.1), needing an
  `execute` grant on the target (L§8.2); without one it runs only on the user's own copy.
  **Follows (2026-10-06):** as L§10.3.1: a Compiler level the user applies (P3.1), needing an execute grant on the target; without one it runs only on the user's own copy. From P3.1 and W5.1/L§10 grants (execute is access to `()`).

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

From the drafts review (2026-10-06).

- **P4.8 A running Program is a Quest** — **Q.** *.ray2/Program.ray:110, 304–305*: coroutines like `race` start a quest
  that says `function.stop`; schedule on an entity (spawn one if necessary, or use an NPC's quests); `< Quest`, implement
  `.stop`. Recommend: a running Program is a Quest (`.stop`, `.done`); `race` stops the losers through it;
  `program.schedule(@npc)` runs it as that entity's quest (a job at its location, W6.12).
  **Answered (user, 2026-10-06):** programs are quests (as in the notes): jobs are replaced by quests, a quest has a `who` that runs it, and a quest is always a program, never a list of steps. A human quest is structured the same way and run by the human; its abstract steps are calls defined nowhere, which `who` performs. `Quest` is a Program (World.ray); `Task` and `Job` are gone (L§8.4).
  **Answered (user, 2026-10-06):** later: the name `Quest` is dropped. Everything a quest had is on Program (`who` as a selection, its cursor, `goal`, `abstract`); `Abstract := Program{abstract.nonempty}`; a character's running programs are `@me.quests` = `@me/quests` (L§8.4).
- **P4.9 `Total`, `Decidable`, `Halting`** — **Decided (draft).** *.ray2/Program.ray:308, 317*: `static Total | Decidable |
  Terminating | Halting`; they are aliases of `Terminating` (P4.5).
- **P4.10 Awaiting a remote result only when used** — **Q.** *…/Ether/instance/Entity.ray:30*: if the return value is
  used, it waits (as a quest) on a response. Recommend: a call to a remote location whose result is unused is sent and not
  awaited; one whose result is used waits on it as a quest (`pending`, P4.2).
  **Follows (2026-10-06):** a call to a remote location whose result is never read is sent and not awaited; one whose result is read waits on it as `pending`. From L§4.3 (arguments are lazy programs) and P4.2 (`pending` waits until set).
- **P4.11 `sleep`** — **Q.** *…/Ether/instance/utils/Time.ray:8* ("sleep delay"). Recommend: `sleep d` is
  `await Time.now >= start + d` (waiting on a dynamic value, no new external).
  **Follows (2026-10-06):** `sleep d` is `await` on the dynamic value `Time.now >= start + d`, with no new external. From P4.1 (`await`), P5.3 (dynamic values) and L§8.4.
- **P4.12 A loop fills a lazy value** — **Q.** *IDE:853* (paraphrased): a `while` loop should work as filling a lazy,
  partial value. Recommend: a value produced by a loop is readable while the loop runs, through `x**.&` (P1.8); reading
  past what is filled waits, as for `pending` (P4.2).
  **Follows (2026-10-06):** a value a loop produces is readable while the loop runs, through `x**.&`; reading past what is filled waits, as for `pending`. From P1.8 (`x**.&`) and P4.2 (`pending`).
- **P4.13 Shader output** — **Q.** *…/Ether/instance/UI/Geometry.ray:1*: translations to GLSL inferred from the types'
  structure (distance functions); exact vs approximate equivalences. Recommend: later, a `$.glsl` level writes a shape as
  its signed distance function derived from its structure; an exact SDF is a `force` equivalence, a bound is `approx`
  (G7.1). Joins P4.7.

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

From the drafts review (2026-10-06).

- **P5.7 `dynamically x &= e` keeps one contribution** — **Q.** *.ray2/Feature/Transaction.ray:3–8*: could automatically
  roll back previous changes of `&=`; `dynamically sub.location &= …` is `dynamically sub.location &= dynamically …`.
  Recommend: when e recomputes, the previous contribution is removed and the new one added; `dynamically` on a statement
  also makes its right-hand side dynamic.
  **Follows (2026-10-06):** when e recomputes, the previous contribution is removed and the new one added; `dynamically` on a statement also makes its right-hand side dynamic. From P5.1: a dynamic statement always equals a fresh evaluation, so the previous contribution cannot stay.

From the drafts verification (2026-10-06).

- **P5.8 A speculative branch whose condition changes** — *`.ray2/Feature/Transaction.ray:3`*: "Or if dynamically the
  speculative if branch change, if resources are dedicated to that if branch." P5.7 answers only the `&=` rollback.
  **Q** — Recommend: a speculative branch (`if assume c`, P5.4) runs on resources granted to it; when a dynamic `c` changes, the
  branch that no longer holds is cancelled, its effects rolled back (P5.7) and its resources freed, and the branch that now holds
  is committed if it already ran speculatively, or started.
- **P5.9 Asserting a finite chain** — *`…/utils/Time.ray:81`*: `dynamically assert (this -> .epoch).length != Infinite //TODO
  Could put this in a keyword finite-self-ref or something`. v0 keeps the assert (`!= ∞`). **Q** — Recommend: no keyword;
  `dynamically assert` stays, with a predicate the library names once (`finite`), so the line reads
  `dynamically assert (this -> .epoch) is finite`.

## P6. Errors (*ep:751–756, 1372–1376, 1504–1515*)

- **P6.1 Spelling** — L§10.3: `$` after a call. *ep:1372–1376*: return a value if error; with a default;
  "maybe error but pass" (doesn't catch FATAL); reintroduce into scope.
- **P6.2 `try`/`catch`** — *ep:1504–1515*: a draft `try` class built on a goto.
- **P6.3 Wrapping** — *ep:751–756*: wrapping errors with more information; disallowed variables in
  errors are traced and not sent over pipelines that may not see them; auto-return on failure;
  `&:=` to stack errors together; OOM; access the function context of the error.

From the drafts review (2026-10-06).

- **P6.4 `$` on a superposition; `~~ $`** — **Q.** *.ray2/Grammar.ray:338, 353–354*: `if acc1 & acc2 $`,
  `if acc1 | acc2 $`, `test := func() ~~ $ { ERROR … }`. Recommend: `$` on a superposition handles each branch's error and
  superposes the results; with `&` the whole errs if any part errs, with `|` only if every part errs. `x ~~ $ { … }` runs
  the handler for its effect and answers x unchanged (A-C5 `~~`).
  **Follows (2026-10-06):** `$` on a superposition handles each branch's error and superposes the results; with `&` the whole errs if any part errs, with `|` only if every part errs; `x ~~ $ { … }` runs the handler for its effect and answers x. From R1.5 (operations map over a superposition), G3.6/L§3.1 (`&` needs both, `|` either) and A-C5 (`~~` answers the original).

## P7. Languages as mappings (*ep:1193–1212*)

- **P7.1 What a language is** — "A language is just a mapping from Expression => as (*)"; a library is a
  language too (mathematics); a language's history is the versions exposed in its repository view.
- **P7.2 Extensions** — *ep:1200*: different Expression behaviour per file extension (`.uc`, `.uci`, `.upkg`).
  Relates to F-C1b (`$.png`).
- **P7.3 When is it a language** — *ep:1203*: "sufficiently interesting mapping between output".
- **P7.4 Translating subexpressions** — *ep:1096–1097*: only translate subexpressions to certain languages;
  superpose implementations and race them.
- **P7.5 Newline meaning** — *ep:1206*: how a language defines its assumptions (newline = `=>` etc.).

From the drafts review (2026-10-06).

- **P7.6 A language across renames** — **Decided (draft).** *.ray2/Program.ray:343–347*: `class Lang | Language`,
  `children: Language` in the class hierarchy, `equivalent name` "like Rocq/Coq the name changed". A language keeps its
  identity across renames: old names are equivalences (`$.coq` ≡ `$.rocq`), as are its several extensions; dialects are its
  children. (Also L§9.1.)
- **P7.7 `Program < Language`** — **Q.** *.ray2/Program.ray:367*. P7.1 says a language is a Program level, not the converse.
  Recommend: every Program is also a Language, reading its arguments' text through its parameter types (T4.10), so a
  function is a small language.
  **Answered (user, 2026-10-06):** yes: every Program is a Language, defining abstractions when `!language` is selected; which language a program reads with is `global`, pinned by version (T3.27).
- **P7.8 An `as` that depends on its input is a language** — **Q.** *library/Index.ray:782–790*:
  `FileEncodings => static{Expression ==.instance_of File}`, `UTF-8: Language (i: File): String`, any `as` is a language
  when it depends on the input. Recommend adding this as P7.3's criterion (P7.3 stays open as research otherwise).
- **P7.9 Library Project (P8.13), Open** — **Q** for the whole block. Recommend: keep it here as an Open block (or move it to
  a `Library.md` backlog, as W7 holds the IDE's); nothing in it is implemented now. Sources: *library/Index.ray*,
  *library/index.ts*, *projects/library/*, and the journal's *2028? Project - Library.md* (paraphrased).
  - Authors and organisations generated from repository history, per directory (`@"github.com".@USERNAME`)
    (*library/Index.ray:1*).
  - Machine targets `.s`/`.o`; object formats × architectures (*library/Index.ray:2*, *Project Index.md:23–47*): add COFF,
    XCOFF, GOFF, SPIR-V and DXContainer beside L§8.4's planned `$/elf`, `$/pe`, `$/macho`, `$/wasm`.
  - Implementations × targets, many-to-many (*library/Index.ray:4–30*): the language is the source; the implementation
    language is what is used in `as Program`; targets are the `as (: Language)` defined;
    `(Implementation <-)? . (-> Target)?` with location per implementation; implementations needing several languages
    (`| TypeScript & C`).
  - Versions, child languages, partial implementations (`set.mm` for SetTheory & Logic), `< SetTheory` starting a branch,
    flat names when unambiguous, distinguishing which equivalence path was taken (*library/Index.ray:38–47*).
  - Locations depending on the implementing language (`location &= this<Agda> ? … : …`), archived-version mirrors,
    `Metamath["set.mm"]` (*library/Index.ray:669, 778–793*).
  - Index entry shape `namespace X | "Display Name" < Language(".ext") ; location &= "url" & "url"`, `< Tool` / `< Library`;
    should `$.name` fall back to this index as a fetch Quest? Recommend yes, later (*library/Index.ray*).
  - Toolchains as a frontend/backend graph; every "place" (official, github, apt snapshots, pacman archive, Koji, brew, git
    tags) has one shape `list()` / `resolve(version)` / `install`; dpkg version ordering (*library/index.ts*). Conflicts with
    L§8.4 (no process calls). Recommend restating it in Ray terms: a place is a Language whose level reads a version listing,
    and installing is reading a location into the store (L§9.1 caches).
  - Goal: compare languages without manual human labour of specifying their grammars (*projects/library/README.md:22*).
  - Getting into a first language and from there into the others: OS executables, LLVM or C as starting point; lifting
    chains binary → LLVM → language / C++ / JS (*journal Library.md:9–27*).
  - What to extract from software: features as languages, APIs (grammars as types), accounts into the `@`-space, accesses,
    diffs across versions, injecting features, finding generated code's source, guessing the original language
    (*journal Library.md:34–57, 69–82; IDE:16–44*).
  - Comparing languages: every metric is a judgement from a reference frame; fix a universal language as that frame; the
    measures (verbosity, runtime and parallel complexity, abstraction ceiling, learnability, competence with infinities and
    time, induction vs deduction cost) (*journal Library.md:84–171; IDE:20–22, 806–820*).
  - A decentralised index of applications and their functionality, keeping user data apart (*IDE:611, 851*).
  - First interpretations: WebAssembly, ZX-calculus, category theory / HoTT; a program shown at several levels of
    description (*journal 2023-09-01.md:28–43*).
  - When a dependency changes, find the equivalences it breaks and ask a human to approve proposed ones
    (*journal 2023-09-11.md:2–3*).
  **Follows (2026-10-06):** the block lives in `Library.md`, the Library Project's backlog; nothing in it is implemented now. From P8.13 (reading foreign software is the Library Project's).
- **P7.10 Models as dependencies** — **Q.** *_todo/_download_dependencies.sh:72–78*: allow any Hugging Face model configured
  somewhere; what is the default? Recommend: a model is a dependency (`@hf/<org>/<model>`) like `@tzif`, configured in
  `.cfg.ray`, with no default until asked. (Also L§9.1.)

From the drafts verification (2026-10-06).

- **P7.11 A language as a pipeline of stages** — *`.ray2/.ray2.json` (the whole file)*: a language is a list of named,
  toggleable stages, each with settings and `isDefault`: reading (load a core file, then the directory recursively, with
  excludes), structure, tokenization (compound splitting), delimiters (nesting), comments (`//`), binding (`|` aliasing,
  forward references), scoping, evaluation (fixpoint rounds), associativity (left, with per-construct overrides), patterns
  (`{name: type}`), dispatch (juxtaposition, a prototype fallback chain), diagnostics (collected, with locations), execution
  (REPL, stepping, a tree browser). Each setting is decided elsewhere (G1.2, G1.3, G3.1, G3.3, R1.1, P8.8, G2.23, W7.17).
  **Q** — Recommend: no stage list in the language; a language is its rules (P7.1). A language-designer view showing such a
  pipeline is a rendering of a Language value, grouped by what its rules do. Keep the file's list as the checklist of what a
  language description covers.

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

From the drafts review (2026-10-06).

- **P8.18 More backlog notes (P8.3)** — **Decided (draft)**, kept with P8.3's list:
  - a value held by several containers is stored once and referenced, deduplicated by a merge level
    (*.ray2/Compiler/Optimizations.ray:5*);
  - `xs.all = X` is stored lazily as one fact on the structure (*Optimizations.ray:7*);
  - predicates on ∞ (`(0 ->).count > n`) are answered symbolically (*Optimizations.ray:24*);
  - detected cycles are merged into a loop (R5) (*Optimizations.ray:26*);
  - a dead store (`a = b; a = c`) is dead only if no one reads `a%` (*Optimizations.ray:32*);
  - random digits that are overwritten (`~~ .version = 4`) are not generated (*…/Ether/instance/utils/UUID.ray:52*);
  - periodic cases are counted arithmetically, not iterated (leap years) (*…/utils/Astronomy.ray:109*);
  - multiplying/dividing a Binary by 2ⁿ is a shift (*…/utils/Number.ray:11–12*).
- **P8.19 An open enum is a datalist** — **Decided (draft).** *.ray2/Language/Program/HTML.ray:14*: an enum with an open
  member (`C(choose?)`) is an `<input list>` (datalist), suggesting the members but accepting free text (P8.15).
- **P8.20 `Compiler.none`** — **Decided (Almanac).** *Almanac.tsx:1930–1931* (`slow: Program{O: Compiler.none} = f**`):
  `Compiler.none` is the empty level, the program run with no rewrites.
- **P8.21 Reversible rewrites** — **Q.** *journal 2023-01-17.md:12, 16* (paraphrased): record when each reduction was made;
  if the equivalence it used is later found false in a context, undo it; prefer determinism to speed when uncertain.
  Recommend: a rewrite applied by a Compiler level is a commit in the program's history (P8.16), labelled with the rule it
  used; revoking an equivalence in a context re-runs from the last commit that did not use it.
  **Follows (2026-10-06):** a rewrite applied by a Compiler level is a commit in the program's history, labelled with the rule it used; revoking an equivalence in a context forbids it there and runs on from the last commit that did not use it (`Program.revoked`). Since the IR is a Program (C1), a failed guard is the same mechanism. From P8.16 (programs live in history), G7.1 (undoing an applied equivalence forbids it there) and history replacing stored state. (= C3)
- **P8.22 Mixes keep their components** — **Q.** *journal 2022-12-10.md:26*, *Gamification.md:485* (paraphrased): keep
  audio sources unmixed so a layer can be removed later; separating is un-superposing. Recommend: a mixed signal is
  `a &+ b`; the store keeps the components when it can, and a flattened mix is a lossy optimization level (P8.14).
  **Follows (2026-10-06):** a mixed signal is `a &+ b`; the store keeps the components when it can, and a flattened mix is a lossy optimisation level. From T2.1 (`&+` superposes components), P8.14 (media are optimisations) and choices being compiler optimisations.
- **P8.23 Quests force lazy values and warm caches** — **Q.** *…/Ether/instance/Expression.ray:31–32*. Recommend: forcing a
  lazy value someone else may compute, and warming a cache of often-read history values, are quests picked up by whoever
  has capacity (with P8.11).
- **P8.24 Tests that change externals** — **Q.** *IDE:428* (paraphrased): tests of syntax that alter existing externals.
  Recommend: such a claim runs in a Program level of its own so the change cannot leak into the suite (as L§6.2's
  sublanguages).
  **Follows (2026-10-06):** such a claim runs in a Program level of its own, so the change cannot leak into the suite. From G5.4 (syntax tests override a rule in a scope) and L§6.2 (a sublanguage is a Program level).

From the drafts verification (2026-10-06).

- **P8.25 Dead code as a narrowing** — *`.ray2/Grammar.ray:86–106`*: `dead_code { if false; dead:{unreachable} } => …`,
  `optimize.dead_code : Program{unreachable} => void`, "How to say if no jumps go there", and TODOs on capturing patterns,
  negations and forward/backward looking. **Decided (draft)**: dead-code elimination is a rule over statements narrowed by
  `unreachable` that rewrites them to nothing, kept in Compiler.ray with the other reductions (P8.2). **Q** for `unreachable`:
  recommend a predicate on a statement of a Program: no path of its flow reaches it (no fall-through from the statement before,
  no jump to its label), read from the statements as bits (`is_jump`, `target_of`, Number.ray).
- **P8.26 Loop unrolling** — *`.ray2/Compiler/Optimizations.ray:16`*: the classic list ends "“dead code elimination”, and
  “loop unrolling”". P8.2 lists the others. **Decided (draft)**: loop unrolling is one of the classic passes, a rewrite in
  Compiler.ray: a loop with a known count becomes its unrolled ray (R5.1 `unrolled`); P4.7's unrollable loop in a shader is the
  same rewrite.
- **P8.27 More `<input>` attributes from narrowings** — *`.ray2/Language/Program/HTML.ray:7, 10, 11`*: `{.length == 5} // size
  (though is only visual??)`, `not 1 String // multiple`, `{==.instance_of []} // pattern`. **Decided (draft)**, extending
  P8.15: a field that holds more than one value (`not 1 String`) renders as `multiple`, and a narrowing by a pattern renders as
  `pattern` (the regex it compiles to, X2). **Q** for `size`: recommend leaving it out: an exact length is `minlength` and
  `maxlength` together, and the visual width is the renderer's.

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
  **Answer 2026-10-05:** a dependency on `@ether/…` (`@ether/ui`) expects the `@ether` userspace to be filled by
  the language, since its .ray files are bundled; otherwise it defaults to network access to `@ether`.
- **P8.9** `FILE.ext.ray` is one mechanism: the file is read with `$.ext` over Ray. `.cfg.ray` is the
  cfg sublanguage, and `.js.ray` is JS over Ray.
- **P2.3** `return x` sets the result and jumps to the function's end label (`&caller.return` = goto the
  end); it is lexical.
- **P2.4** `recur(args)` is a tail call; a bare `recur` uses the same arguments.
- **P4.5** `Terminating := Program{∀ path ∈ .paths: path.length < ∞}` (quantifier style). (2026-10-06: written `Program{forall path is .paths: path.length < ∞}`, G6.3.) Finite step
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
- `ERROR@Type` / `FATAL@Type` with a message: what follows `@` is the error's type (any value or class, no enum), caught by `$Type` on the line after the call. `ERROR` / `FATAL` with only a message is fine too; its type is then the function that raised it (its trace), caught by `$function`. The diagnostic points at the ERROR line itself and carries the call trace. A non-fatal error is attached to the value the enclosing function answers; a fatal one is that value. At the top level the statement's value takes it.
- The `$` forms are methods painted `^error`; `x $ return 9` needs no form of its own (the fallback is read lazily in the caller's scope).
