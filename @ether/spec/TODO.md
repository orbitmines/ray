# TODO: the language and its library

What the library (`@ether/ray`, the optional projects) needs from `ray/bootstrap/`, found while making each library file
load and pass on its own (most under the old kernel, `v0.ts`, gone since 2026-10-30: what they say of the language still
holds; what was the kernel's own is dropped). Each item: what fails, a minimal repro, where it shows.

## Conversions

- **A second `as (=== T)` on Node loops.** Node.ray has `as (=== boolean)`; a library file adding another to Node
  (`Node &+= { as (=== Number) => 7 }`) sends `conversions => ((this).conversions, …)` (entrypoint, the `as (=== {type})`
  rule) into reading itself: every value's unread member loops 6000 deep, and `1 + 2 == 3` fails. Language.ray's two Node
  conversions (`as (language: Language)`, `as (=== String)`) cost ~130 bootstrap tests whenever the library is loaded.
- **A class's own `as (=== T)` never reaches its instances** (`K &+= { as (=== String) => "k" }`, `K() as String`).

## Classes and members

- **A header is read again for each instance** (§21.3, H agreed 2026-10-26): every Box re-reads Shape's 34-field header
  inside the instance (~20 s a Box). A 30-field probe: 4.1 s an instance today, 0.55 s with each default read on the
  instance from the class's field list. The names in order are there once per class (`fields_now`'s `written_name`).
  Open: a default's code. Passing header text between rules loses it (a typed hole takes no spliced hole; `({n}: {t} =
  {d})` no longer reads a text handed on). The kernel's lazy default (37cf2362) holds the code but reads it only in the
  frame it was taken in. Not done: a new external for its text, a kernel change to read it on the instance (the user,
  2026-10-26: no to both). Tried without gain: `taking` written out in the constructor (-10%), the header as the
  instance's first statement (its reading still not kept). Probes in ~/.cache/ray-scratch/once (run.sh NAME).
- **`static X := v` is not read on the class**: `B := class { static R := 5 }`, `B.R == 5` fails, with or without a header;
  `static g => 7` and `static f (x) => …` read. Every nested class and constant declared so is unread from outside:
  `Access.Reading`, `Report.Claim`, `Diagnostic.Severity`, `Location.Query`, `Version.Pin`, `Unit.Rate`, `OS.Environment`.
- **`x |= v` is defined nowhere** (`|` is not a `compounds` operator): `.access |= grant` (Access.ray), `.name |= name`
  (Character.ray `named`), `Program.refused |= p`.
- **An instance kept as a class's member loses its field values**: after `C.A := C(p: "a")`, `C.A.p == "a"` is false
  (also `C &+= { static D := C(p: "d") }`). The OS projects (`OS.Linux := OS(platform: "linux")`) and `Unit.None` need it.
- **`5 is Node{false}` loops** (6000 deep): a narrowing whose condition is `false`, asked of a value (Control.ray NV1).
- **An assert in a class body cannot call the class's methods** on an instance made there (`Ex := class { same (o) => …;
  assert { e := Ex(); assert e.same(e) } }`: `nothing reads same(e)`). Many library tests are written in class bodies.
- **A field's default that reads a field given at construction sees it unset**: `severity: .Severity = .fatal ? … : …`
  (Diagnostics.ray), `Diagnostic(message: "stop", fatal: true).severity` is not fatal (DG2).
- **A method with parameters and a return type is not read**: `tip (n: Number): static => …`, `Key().tip(2)` is unread;
  `press: static => …` (no parameters) and `tap (n) => …` (no return type) read. Character.ray `named`, Program.ray
  `attempt`, Keyboard's `press (modifiers …): static`, Project.ray `load`, History's `commit`/`reset`/`extended`.
- **A method whose parameters all have defaults is not applied when named bare**: `tap (n: Number = 1) => …`,
  `Key().tap.pressed` fails (`Key().tap(2)` reads): Keyboard's `key.press.pressed`, `Device().choose`.
- **A member added to a class with `Base &+= { static f … }` is not read on a subclass** (`class: Language` classes):
  `Language &+= { static generated … }` in @ether/encryption, `ChaCha20Poly1305.generated()` unread.
- **A hole typed by a named pattern or class does not read**: `{segment: Written}` (Location.ray), `{version: Version}`;
  an inline pattern matches (`{name: (Char.Word | "-")[]}`), but see below.
- **A matched hole typed by an inline pattern is still read as code**: with `@yd:{p: Char.Word[]} => p`, `(@yd:x)` reports
  `nothing reads x`.
- **A type's rules read beneath its hole too**: while a typed hole is read (`{arguments: Arguments}`), its type's rules
  match code run beneath it as well: a rule `{p: Name} {`=>`} {b} => …` in Arguments matched `{name} => value` in `:=`'s
  body (rules applied 6000 deep), `{v} => (v) as_argument` reads itself without end, and a second type of arguments
  beside Arguments (one for classes) broke every function call. So Arguments has one rule, `{name}: {value}`; a call given
  none by name is read by the call's untyped rule (a closure's, where `xs.map(x => x * 2)` is a closure: the kernel's
  `word =>` after `(` reads as one only through one hole), or a class's `Positions_given` (each read whole, a value).
- **An argument read as code is read again where it is used** (Arguments' `{value} => value`, tried): a field given a
  text or a closure (`Carrying(`a`).carried`, `Kf((x) => x * 3).fn`) is read again as the instance's member, where
  `(external &).text` and `.` are another's (lost CI2, CI6, MP1; a kernel thread crashed in `text_admits`).
- **A closure written bare given a class is a rule** (`Kf(x => x * 3).fn`): read whole by `Positions_given`
  (`{value: Node}`), through two holes, the kernel's `word =>` is no closure there. `Kf((x) => x * 3)` reads.
- **A closure given by name is read as a closure of the name** (`idg(f: (x) => x * 3)`, `Kf(fn: (x) => …)`): `=>` binds
  looser than `name:`, `(f: (x)) => x * 3`.
- **A named argument given a function is not a local of the caller** (`nw (wrapped) => nm(named_one: wrapped)`, `nw(3)`;
  a `:=` local the same; a constant or a global holds): before named arguments were taken too. A class given one so holds
  it (NA15). Repro ~/.cache/ray-scratch/selfhost/na16.ray (A, B, D, E).
- **Expression's key as a pattern of statements does not read** (`rules[(lhs: Statements(node) = rule.LHS)(Program(caller:
  caller))] := …`): with it, a language read as Expression has no members at all; `rules[[rule.LHS]]`, its left side as
  written, reads (so a left side's holes are not read as holes yet). Repro: ~/.cache/ray-scratch/selfhost/ev0.ray (the
  library's form) vs ev1.ray, through probe3 with ROOT set to the tree's bootstrap (~3 min each).
- **A method called inside a keyed rule a statement runs runs that rule again** (`ctx.reading(rr)` in the rule's body):
  the key's value is called in its reading's node, whose rule `{this}({entry_argument})` reads the body's `x(y)` as a
  call of the key. Calling it from a function outside the reading (tried in 1a46668b, reverted) stopped Expression's
  statements from reading. Repro: selfhost/mx48.ray (direct).
- **`this` in a rule a statement runs is not the Node its rules are in** (Expression: `Statements(Node(in: this))` in a
  rule of Node's `rules := { … }`): a key's value is called through its reading (`with_reading`), whose `this` is the node
  that call was read in, not what holds the key; called as a member (`node.rules.f(…)`) it is. Expression names the node
  `node := this` in Node's body instead. Repro (70 s, direct): ~/.cache/ray-scratch/selfhost/mx72.ray (`@@G[notnode]`
  through the reading).
- **A lowercase name of a header's statements is not seen in a class written there** (`seen := 46`, then `Inner :=
  class (in?: Inner) => { rules := { got := (x) => seen } }`: nothing reads `seen`): the frames the class was written in
  are looked in for types only (`valued_member`, a capital first), as an outer class block's are. A capitalized name is
  seen (EX10).
- **`&.caller` is nothing at the top of a file** (`@c => &.caller`, `assert @c` fails), so `@me` (`&.caller as Character`,
  ray/.project.ray) is nothing outside a World and every test asking `@me.…` fails (`nothing reads me`).
- **Reading a text as a class by its header** (`"v0.1.4-E2027.0A.4" as Version`, `Language.part_written` of a header
  class) fails; writing one by its header works (`Version(index: 1) as String == "v0.0.1-.1"`).

- **No written form of a label or a jump**: Program.ray's programs write `past\` (a label, one space less indented) and
  `goto past` / `goto past if c` (PG13–PG33, XB1–XB4); the bootstrap has only `external label {x}` / `external goto {x}`,
  whose hole is a value, so a label's name cannot be taken as written until a hole reads text (above).
- **`external io` is gone from the kernel**: the effect tests now use `external read` (Program.ray AC60, EFF2–EFF5); what
  an `@c` / `@js` fragment calls should be an effect too (`os`) once a fragment runs.

## The language run by the compiled Expression (2026-10-30)

The revisions run Expression.ray compiled: the language is read by its class (`(text) as Expression`) and its statements
run (f6c56a70, revision 18). The host gives a reading fuel (revision 29, ETHER_FUEL): a stopped one keeps what it painted. Harness: ~/.cache/ray-scratch/run (mkrunner.mjs: a module reading input part 0 as an Expression, EXPR= a
variant; mkinput.py: the entrypoint with $/Wasm/level.ray after its first statement; paint.mjs: what was painted and
what nothing read, UNREAD=n). Done on the way: statements run (they never did), jumps and labels, `afterwards`,
rule bodies read once with the rule set aside, splices (the old splicehead), a braced body its inside, a name read in
its own reading its place, unread text recorded with reading going on.

- **A body is read all at once, before it runs** (ray-45 on it, 2026-10-30): a name its first line defines is not seen
  by its next (`zq => { flg := …; flg }`), so a loop in a block never ends (statements 140-149); and when a statement
  of it fails it backtracks through every earlier one (`Array &+= { … }`, statement 523, ~2.3x per member), where the
  whole entrypoint now stops (revision 44). Wanted: a body read in turn, as the top level is.
- **`:=` defined again at line 2484 runs `given` for every name** (`… given (value)`): ~3600 steps more per `:=`
  (1.8x), the same answer for a plain name (ray-91, 2026-10-30); only a bracketed left side (`(a, b) := list`) needs it.
  Measured 2026-10-31 (revision 97, --test input): without `given` 63.0M → 58.5M steps (7%); split into a plain rule
  and a second `({names}) := {value}` with `given`, 78.1M (the `(`-led rule is tried at every statement led by `(`).
- **A hole's text is read again at every application** (an assert's computed style, `^((ensure {condition}) ? …)`;
  `{a} | {b}`'s block on every `|`): most of the matcher's work. ray-45: read hole texts in the rule's shared body node.
- **A test's pass is only honest on a whole reading**: numbers are defined at line 3373 and asserts run after
  everything is read, so a prefix passes `1 == 2` (two names nothing defines yet).
- **Something gives `named_by` what is no text** (r115 from r36, found by the text words reading it as one, fixed in
  revision 40 by making them refuse): a hole's value read as a name, probably a slip.
- **Whole-line comments before the comment rule** (entrypoint lines 2-9, before `// {comment} ^comment => { }` at 74)
  are read by nothing: the harness leaves them out, as the host does for the compiler's sources.

- **A rule's head styles are caught in `sink` until the rule exists** (2026-11-02): `{x ^style}` is painted while
  `head :=` is read, before `rule_own` is made, so `sink` stays (one list on the rule would need it anyway).

- **A trailing comment holding an operator's word is read as code until line 3528** (`zc := true  // a while b` reads
  as `{body} while {condition}`): the trailing-comment rule (line 74, led by a hole) loses to every hole-led operator
  defined after it, until it is defined again at line 3528. Asserts run after that, so only top-level statements read in
  between are affected; prefix readings (cut before 3528) misread every test whose comment holds such a word.

- **Loop tests that never end** (`x = v` in a loop body does not assign, so CC8, CC11, RC2, CC14 loop for ever): since
  revision 74 a test past its budget (60M steps, 128 MB, or the heap near its end) is let go and fails, and `--test`
  reads to the end (237 passed / 171 failed). Memory per test (Design §21.4, revisions 59-74): tests let go of what they
  made, unread no longer pins a test, names made in a test last; tests under 2 MB keep theirs (letting go bumps every
  cache). The whole file without loops: 429 MB.
- **The `Array &+= { … }` blocks read exponentially in their members** (statement 523 and line 3140): the definition key
  (`rule:`) reads the block's code as `(hole | String)[]`, asking the hole at each character and inside each nested `{`;
  a memo of those asks halves K=10..12 but K=14 still takes 129 s.
- **A definition's `=>` painted, written on the first rule** (the user: "`=>` should be colored … on that first rule
  definition, not separate"): ``{lhs} {`=>` ^punctuation} {rhs} => {…}`` as the first statement breaks the reading (`^`
  is not defined yet when the header reads it), and its body never runs (the maker is Expression's own). Wanted:
  Expression honouring a style on the first rule's head, read once `^` is (ray-45, after reading bodies in turn).
- **Code that never runs is painted by running it abstractly** (the user: "Everything should run as abstraction
  interpretation is the design"; Design §17.1, the editor runs files abstractly, tests fully): every body run with
  unknowns, both sides of a branch whose condition is unknown; 87% of what is unpainted at 460 statements is code that
  never ran (coverage 20.9%).

- **The chain classes → calls → `x = v`** (2026-10-31, revision 65). Each half-works alone and the next exposes the
  one before, so none landed:
  - *Calls*: a value's methods led by a hole (`{this}(…)` of a closure) never match the split's rest (`(false)`): Design
    §5 "its own methods led by a hole first". Scratch: a `Led` class splits a head into its first hole and the rest
    (`rule_own.led_rest`), the split copies `on.rules[[e.led_rest ?? e.key]]`; a styled call rule (`… ^punctuation =>`)
    needs its body spliced twice (its `{{parameters}}` came in through `{rhs}`). Then `(() => true)()` answers true.
  - *Closure scope*: the body's code (`{{body}}`) is read in the call's node, which chains to the closure rule's scope
    (global), not where the closure was written (Design: "`.` is its own node, which sees where the closure was
    written"). `recurring_flip (n) => n ? recurring_flip(false) : true` (RC1) does not see `recurring_flip`, so
    `recur ^keyword` reads the start of the word and jumps to `recurring` for ever (out of memory at statement ~185).
    Needs a decision: how a rule body's node sees both the rule's holes and where code handed to it was written.
  - *Parameters*: `taking` declares them with `({written_parameters}) := …` inside `if … else` blocks, so in the block.
  - *`x = v`* (user: Design's `{ value ; (name) := value }`, scratch w16): assigns, but the loops in `taking`/`takes`/
    `each takes` then run over lists, and lists are a class (`Array`), which needs calls.
  Repro: ~/.cache/ray-scratch/r45 (w70/w71 calls, w72/w76 all together), mkskip45.py N with the loop tests skipped.
  - *Memory once calls run* (2026-10-31, ray-4d, ray-98's x7-x21): a call's memory is freed on return unless its answer
    or a write into something older keeps it (revision 91: only a write of something made in the call keeps it; each
    statement its own region). With calls running, each class definition kept ~12 MB and the includes ran out of memory:
    the rule-maker's writes onto `applied` (made before the call), `p.done`, `context.statements`, the `naming`
    push/pop, and every paint (`painted.append` holds `applied`'s input and holes). Tried in scratch, not landed
    (/tmp/claude-1000/s/nt/rt_ntp2.ray): a write undone by the call's end no longer keeps it, and paints are copied out of
    a freed call (kept_out/made_again). Correct, but 2.9 → 3.9 s on the entrypoint, and x21 still keeps calls through
    live references. ray-98 is moving run state off nodes older than the call.
  - *Evacuation* (2026-10-31, ray-4d, ray-98 agreed): a call whose answer, or one live write, is new keeps its whole
    region. Revisions 111-114 removed the false keeps (lasting tables in the kept arena, `in_turn`), moved the heap/arena
    split to 1.5e9 and made the entrypoint's memory 440 -> 299 MB at the same speed; with calls (ray-98's x37k) memory is
    no longer the first wall. Not landed yet, both in /tmp/claude-1000/s/ev: (1) the pin re-check (rt_l3g.ray: each
    pinned call records which slots point into it, 256 at most; at its end, freed if none still does, else its live slots
    go to its caller). With calls it lets en_inode finish; on main ~3% slower (recording a slot per write), so it lands
    with calls. (2) The evacuator on those slots (rt_ev5A.ray): correct (painting identical), but most attempts give up
    on text positions and the attempts make it ~6x slower. Needs: positions resolved without a fixup list per attempt.
    (1) landed as revision 115, past 512 MB only (32 slots per call, compacted).
  - *Per-statement budget* (2026-10-31, revision 116): an innermost statement past 200M steps, or begun with the heap
    within 128 MB of the arena, answers nothing until it ends and is SAID "ran past its budget"; main cuts none. With
    calls (x37k) `--test` finishes in ~11 s but nothing is tested: rule bodies read at call time (`level include
    {location}`, `({class_name} := (class …) => { {class_body} })) ^class`, `class: Node { {class_body} }`, `value`)
    each keep 54-70 MB (include Node.ray 339 MB), ~20 of them reach 1.3 GB and every later statement is cut.
    Measured (free at statement 3608, the include of Node.ray): 116 891 MB; evacuator ported onto 116
    (/tmp/claude-1000/s/ev/rt_ev7bz.ray, slots from 0 MB) 586 MB but 6x slower and still past 1.3 GB by 3615;
    success-reclaim in `matched` (rt_mr2) 834 MB, +5% steps. Of 6 GB allocated, 3 GB are matcher patterns (kind 9
    sequence steps 1.17 GB, kind 21->10 repeat turns 1.25 GB; revision 118 makes a step one 12-byte cell and a
    repeat's turn its choice record). No reading cache (user 2026-11-01: structural fixes, no caches).
    Measured 2026-11-01 (ray-4d): of the 1304 MB the calls run ends with, a conservative trace from every root
    reaches 101 MB, so it is the region allocator, not the data. In scratch (/tmp/claude-1000/s/gc, gc.ray +
    mkgc.py): a sliding compaction of a kept region at its close, above 320 MB only (main never enters it):
    live objects marked conservatively from the region's slots, its value, bounds, actives, the choice stack, the
    test log and copies table since it opened, and the 3988 pair stack, through an allocation-start bitmap and a
    no-scan bit on byte buffers; every word in [S, F] then moved to S + the live bytes below it (pointers, interior
    pointers and text positions alike). Stress build (from 16 MB) paints the same as main. Found: 17 slot tables
    overflowing (> 200) marked 4283 frames kept outright, so slots move to one stack (a frame's a segment of it);
    compacting every close is 612 s on calls (0 statements cut), pacing by heap growth is next.
    Landed 2026-11-02 (ray-09, revision 126, 3e29462b): above 512 MB a closing frame's region is compacted when it more
    than doubled since its last (the parent's size recorded after), roots the low words 4044/4048/4068 too, one start
    bit an allocation (cleared where `free` goes back). Main: --test, paints, p1, the fixpoint the same, speed level.
    Calls (wtc) to the entrypoint's line 3603: 2.4 GB freed in 29 compactions, 159 s (142 s without), 1246203 paints and
    162 reports against 1237967 and 169 (a test's 128 MB and 20M-step stops see the freed memory). Whole file: reading
    goes past Ray.ray 67-661 (cut on memory without it) to Ray.ray 675 (`assert (…).( … & … )`), where in-turn reading
    nests 845 deep and the choice stack overflows (trap in `chosen`; stopping the statement there did not unwind it).
    A frame per in_turn (compacted between statements) was correct once its survivors' pins marked the parent kept, but
    freed no more and took 2x the time: not kept. `kept_out` wrote past its 8 MB buffer (bounded now).
    2026-11-02 later (ray-09, revisions 127-128): frames past 4000 deep are counted, not kept (10298 deep overran the
    frame stack); a value kept twice the same is one copy (505527 kept appends, 19366 distinct). In the calls bundle
    (~/.cache/ray-scratch/wtc), Array's `{written} =>` (entry 3103) runs again: a rule that is only a hole is the
    reading node's own fallback (`caught` in `reading`, skipped by `longest`, `via_longest` and the split), and
    `.holed === true` (a missing member on a list key answers a superposition once calls run). Whole file: 207M steps,
    19 s, then `String := class: Array { … }` (3333) grows the heap 233 -> 1290 MB: 2447 `(place) := value` (`x = v`
    in Array's loops), ~72K steps each, every statement of a body read again each time it runs.
    User 2026-11-02: read bodies once (where the rule is written, holes as names, each application runs them). Started in
    ~/.cache/ray-scratch/ro/Expression.ray: holes stay rules of each application's node, found at call time from the
    running application (paints the same); kept state per rule written, not per head (a head written again shares its key),
    flags `=== true`. Open: a kept statement runs with the program that read it, so `(external &)` in a kept body
    answers the first application (`` `{text ^string}` => (external &).text `` kept: later backticks lose
    `string.punctuation`). A statement has to take the program running it, where Statements are read and run.
    2026-11-09 (ray-09, revision 129): an application was the match's own frame (`me := applied`), so every run of one
    matched statement wrote `caller`/`in`/`bound` into the same frame (and a test's memory wrote into main memory's).
    The runtime now runs each call of a matched rule in a copy of its frame (`applied_again`): main the same, the calls
    file 262726 paints and 53 cuts against 240278 and 66. Read-once on that (scratch ro/Expression_k2.ray, wtc): kept
    after the first run when the body's own node holds no rule but its holes (the node read in, not `me.in` after
    `external .`, which is the block's), a node's `statements` its first read (a hole's text read there wrote over them),
    a kept run's hole found as the running application's own (nearest program up `caller` kept by the rule, its node's
    rule asked). Main paints the same with every such body kept, but ~1% fewer steps; in the calls file barely fewer
    (47.8M vs 49.6M to 3000) and the whole file reads less (237033 paints, 82 cuts): not landed. What costs is not the
    body: it is a hole's text read where it is written each application (`value` in `:=` ~66K steps x 3057, `grouped`
    3.1K x 35489). The calls file stops on memory inside `String := class: Array { … }` (3333) still.
- **Included files** (2026-10-31, revision 72: host parts, runtime `file_named`, Expression's `include`). A line at column
  0 inside a block read since revision 71 (Number.ray's int32 tests). Still open:
  - *A trailing comment taken as a hole*: Node.ray's `` !{ }{forward}{ }{backward} `` reads `!(true)  // T2 …` with the
    comment as `backward`, so `assert !(true)  // …` passes (r91/in/pnot2.ray). Every test line ends with a comment.
    Why (2026-10-31, ray-4d): `assert {condition}` and `{statement} // {comment}` both read the whole line, and §4.3's
    order (a definition, then a rule led by text, then the latest) takes the one led by text. Inside the hole, `!{ }…`
    (led by text) wins the same way. Guards are misread the same way: `return 5 if n === 0` returns `5 if n === 0`
    (/tmp/claude-1000/s/cm/g.ray: `f(0) === 5` fails). Design §21.4 (Restoring the originals, 2026-10-17: "A guard binds looser by declaration
    order") kept the old kernel's rule for it: a rule led by a hole, then a word that leads statements of its own (`if`,
    `//`), declared after the rule led by text that reads the same line, is read around it. Expression's `longer`/
    `whole` don't have it. Needs the user: does that rule still hold next to 2026-10-29's order?

- **An undeclared name passes an assert**: `assert zzundef` passes (a name nothing declares reads as its Place, which
  holds), so an assert on a misspelled or never-defined name is vacuous. It should be the unknown a failed lookup is
  (Design §21.3: "a failed lookup yields an unknown"), which doesn't hold.
- **`=` doesn't reassign yet** (`dt := true`, `dt = false`, then `assert dt` passes): `=` as `(name) := value` waits on
  calls. With it, `a ; b` must read its sides where they are written (`first`/`rest` as values, like the guards; it
  splices them into a node of its own now, so `x := 1 ; y := 2` declares into that node). Scratch:
  ~/.cache/ray-scratch/r45/cl/semi.diff. CF20 (entrypoint:182) is also written before `;` and `+=` are defined.
- **Operators don't group as in mathematics yet** (Design §4.4, decided 2026-10-31). Two causes. (1) Each operator is on
  a level of its own by declaration order, so `a / 4 * 4` is `a / (4 * 4)` (Compiled.ray declares `*` before `/`, `+`
  before `-`; runtime.ray parenthesizes; High.ray re-folds the chains, Low.ray doesn't). `*`, `/`, `%` need one level,
  and `+`, `-` another, but nothing declares two operators on one level (`{a} | {b} => …` heads are names only). (2) The
  runtime matcher's untyped hole grows shortest-first, so `{a} - {b}` on `x - y - z` binds `a` = `x` and groups right
  (trace ~/.cache/ray-scratch/r45/cl/trh1.txt; Number.ray PC5 wants left). Taking the longest left hole instead changes
  every rule led by a hole (`:=`, `? :`), so those that group right have to be declared right-to-left first.
- **A head's hole that reads as nothing makes its rule dead** (found 2026-11-01 through multi-line `--`). The runtime makes
  a head element that is nothing a pattern of kind 0, which never matches, so these rules never apply (none applied in a
  `--test` run). What reads as nothing: (1) a name that is a member, `{rest}` (`rest => []`, entrypoint:872), `{first}`,
  `{this}`: no `this` while a head is read; that kills `{value} -- {rest}`, `{value} ~~ {rest}`, `{first} ; {rest}`,
  `{this}{rest}`, `compounds`/`chainable`'s `{operator} {rest}` and `{field: Name}: {rest}`. (`x -- y` on one line reads
  through other rules; across lines nothing reads it, `cc := 5⏎  -- 3` unread.) (2) A name that starts with a declared
  word: `{whole_by_of}` reads `whole` then `_by_of`, likewise `{first_list}`, `{first_given}`, `{declared_value}`,
  `{typed_called}` (open: are names read only as whole words?). (3) A typed hole whose type is None until calls
  (`{name: Name}`, `{digits: Decimal.String}`, `{fields: Header}`). Making (1) the hole of that name brings 80-odd rules to
  life at once and overflows the stack on main (`{this}(…)` among them, which the calls Expression reads its own way).
  Needs the user: in a head, is a name that is defined still the hole it names? Probes ~/.cache/ray-scratch/r45/cl/f25-f34.ray,
  traces trh98c-h.txt.
  Decided (the user, 2026-11-01): a hole's name shadows what it is outside, for the rule's scope. Tried
  (~/.cache/ray-scratch/r45/st/x_shadow.ray: a hole not read as a place read again with named definitions set aside):
  with `{this}` too, 64k statements run past their budget (`{this}{rest}`, entry:1133, matches after any value: the
  `{this}`-led heads are calls', so it lands with calls). Without `{this}` (named only to try): --test 252/197/11, the
  multi-line `--` (886/887) read, `Level.low.ranked`, HS9, SP5 pass; but 13% slower (hole-led heads `{value} -- {rest}`,
  `{first} ; {rest}` tried at every statement), the tests in `assert { }` blocks painted on their condition (column 10),
  and 3015's block and entry:26/89 lose.

- **Found 2026-11-12, getting bootstrap/ to pass non-vacuously** (probe ladder in ~/.cache/ray-probe/ladder.ray):
  - *Chained `?.` in compiled code*: Compiled.ray's grammar reads `a.b?.c` as one member named `b?.c` (always None).
    Three such chains made Expression's `for_value` dead (8bb95e6a rewrote them). The grammar needs the fix; until then
    Expression.ray and runtime.ray must not chain `?.`.
  - *Numerals read as Places*: nothing defines `1` before Number.ray's `{digits: Decimal.String} ^number` reads (and that
    hole's type is None until calls), so number tests pass vacuously (see "An undeclared name passes an assert").
  - *level.ray's requests are unanswered by the compiled engine*: `global`'s `external` answers `.`, `&`, `goto`, `label`,
    `style`, `include`, `rule`, `shown` only; `level member_named` (23 uses), `member_given` (13), `unset`, `names`,
    `admits` … answer None. The direction (user 2026-11-12): the entrypoint's own definitions, not engine answers.
  - *Components* (c432bb9f): `external . v` makes what it is read in made of v; bare, a node made of the receiver;
    `x &+ { … }` reads the block in x (entry rule `{on} &+ {`{`}{code}{`}`}`).
  - *Calls, not landed* (scratch ~/.cache/ray-probe/Expression.lazy): `{this}`-led methods kept per node in a rules node
    of their own (`led`, keyed by the rest, from `rule_lhs as (led: …(`this`), led_after: String+)`), the split's node
    finding them through the value's parts (`led_from`), lone-hole rules (`{written}`) out of component lookups (Array's
    `{written} =>` otherwise reads itself). Copying them into the split's node (the old scratch's `on.rules[[e.led_rest]]`)
    filled the 2 GB within 20M steps; found lazily it costs the same as kept apart, so the cost is calls running:
    `(() => { … })()` now runs each class's body (~800 applications a class, 43 classes and 231 constructions by
    Ray.ray:975). Measured (mem.mjs, heap_used and the furthest paint): without calls Ray.ray:975 at 5M steps, 235 MB;
    with, 20M steps, ~1 GB (~50 MB per 1M steps); `--test` does not finish in 600 s. The memory wall of "Memory once
    calls run" above, reached again.
- **Checked again 2026-11-13 (revision 140), toward Compiler.ray as rules the full language runs:** all still so.
  - Without calls, `f(x)` reads `f` then `(x)`, so it answers its argument: `h (x) => 7`, `h(1)` is `1`. Every test
    whose callee returns what it was given passes for that reason only.
  - `{x: T}` in a head never matches (`p{d: ("w" | "v")} => true`, `pw` unread) because `level unset_typed` answers
    None. So no digit is a Number. `(1 + 1) === 2`, `1 == 1` and `[1, 2].count == 2` pass or fail by the vacuous rule
    only. Wasm.project.ray's asserts and Ray.ray's list tests cannot pass before this.
  - `level kinds` maps nothing, false, true and text, but neither number nor list, so the engine's own numbers (a
    count, say) and lists have no members.
  - Expression.lazy on revision 140 (the `led` rules): the probe's reading does not finish in 600 s (the calls
    wall above).
  - Order these block on: calls cheap enough to run every class body (memory reclaimed while a statement runs), then
    level.ray's requests as the entrypoint's own definitions (they need calls), then numerals.
  - Again on revision 142 (a parse read in young memory, only its result copied to what lasts; no compaction; lasting
    memory 1763 → 1350 MB): Expression.lazy's `--test` now ends, in 70 s, but every statement runs past its 200M-step
    budget, from the entrypoint's line 8 (`level style style x`) on. Not the steps: young memory fills to ~1.1 GB (the
    young parts of statements kept, nothing compacts them since 430490e1) and `near_end` cuts every statement after.
    Calls need what a statement made reclaimed when it ends, from a remembered set of the older words that point into it.
  - Again on revision 143 with statements copied out (2026-11-14, a552d4be): Expression.lazy's `--test` reads past line 8
    now, and the statements up to line 521 finish; from the `Array &+= { … }` blocks (lines 522–525, 649) on, every
    statement is cut again (205 past their budget in 39 s, so cut by young memory, `near_end`, not by steps), and no
    test runs. What one statement's calls make is let go only at its end. Next: a call's frame compacted when it ends
    (what older words hold of it moved down to where the frame began), tried in a worktree, not yet at baseline.
  - Again with frames compacted (2026-11-15, 48c16485): Expression.lazy's `--test` is no longer cut by young memory:
    175 statements run their full 200M steps (94 s) and none of the tests run. The first are rule definitions, the
    entrypoint's line 8 (`{x} ^{style} => level style style x`), 25 and 28 (`.{member ^property} => {member}`), 43
    (`{on} &+= …`). ~~Reading a rule's head with the `led` rules is what is past the budget, not memory.~~ Measured:
    the whole run spends 59M steps, so they are cut by young memory (`near_end`) after all. The first stop is in the
    entrypoint's line 385, a comment ending ``…`if x > 3 { … }`.)``: there the reading is 30924 frames deep with 1.1 GB
    held, and the statements read inside it (each stop lowered at its own statement) are cut one after another. Plain
    Expression.ray recurses there too (one of the statements past their budget at baseline) but recovers after it;
    Expression.lazy does not. Smallest text: the entrypoint's first 25 lines (the rule creator, `({grouped})`,
    `. => (external &).this`) and a line `.)`. `x.)`, `)`, `x.` and `. => 1` then `.)` read at once: `.` read where
    nothing follows reads its own body, `(external &).this`, whose `.` is the rule again.
    Why: a body's statements are read as they run (`Statement`'s `concurrently context.reading(.)`), and running
    restores what is set aside (`runs`: "while it runs, the rule is no longer set aside"), so the `.` of `.this` is read
    with the `.` rule no longer aside. Expression.ray line 66 ("the rule set aside while it is read: a rule never
    reads itself") and line 210 disagree for a statement read while it runs. To decide: what is set aside belongs to
    where code is read (the body's node, and what is read in it), not to the run, e.g. kept on `me.in` and looked up along
    `in`; running still sees the rule, so recursion through a call stays.
    Tried (2026-11-15): `runs` not restoring what is set aside. Expression.lazy then reads the whole text with no
    statement cut (163M steps, 66 s), but plain Expression.ray reads almost nothing (0 passed, 124 "Nothing reads
    this"): the rule maker's own body, `{lhs} => {rhs}`, is read as it runs and needs the maker. Kept as it was. And
    on the whole text plain Expression.ray does not recurse at line 385 (its stops are by steps, 40 frames deep); only a
    text ending there does, and Expression.lazy does on the whole text (2909 frames deep).
  - **A call's frame compacted when it ends (2026-11-15):** a frame closing with something older holding what it made
    has what the notes, the run's state and its value reach moved down to where it began, the rest let go
    (`Isolation.compacted_or`, `Collector.frame_compacted`). Unlimited, 14983 compactions over the suite with no stale
    read. What it took, each found with a checker comparing every live word after a compaction: a frame is compacted
    only at or above an open test's base (3944), as a test is undone by address; what lasts given a value of an open
    statement, frame or test not by a write (copied bounds, `lasting_copy`, a kind made while what lasts is taken) is
    noted as a write is (`Notes.older_copied`, `older_held`, `lasting_made`), keeping its test; and a word object slid
    onto where a text once began has the bytes bit cleared there, or it is moved as bytes, its words unfixed.
    Speed: compacting every frame of a megabyte made the suites 4× slower (395 s for `--test-all`), each survivor moved
    again by every frame around it. Now a frame is compacted only when it made as much since the last compaction as it
    holds of what that kept (`Collector.paced`, word 3980); where objects begin is read a block of 2048 bytes at a time
    (`Starts`, a bit per block raised with any start, never lowered) and a byte's bits counted at once. Both suites at
    baseline, `--test` faster than without (239 s against 265 s), `--test-all` a little slower (188 s against 173 s).
    The notes are their own class (`Notes`): one more function with a loop in `Memory` puts its reading past the
    statement's budget (calls within budget, below). And `word_put(3980, f)` as `frame_freed`'s first line is read as
    "Nothing reads this" in the tested text, though `frame_fixed`'s first `word_put` is not.
  - **Tried 2026-11-14, shelved (branch `shelved/statement-copy-out`):** the barrier (`touched_by` and `word_held`
    note an older word given a value of the statement still read: words 3880 log, 3876 count, 3964 overflow, 3912 the
    innermost statement's start, 3956 the outermost's) and, at the outermost statement's end, what those words and the
    run's state reach copied to what lasts, the rest let go (`Collector.statement_copied`). Every copy checks out (each
    object as before, no live word holding an old address), and reading runs faster than without it (led keys moved with
    their lists, not all made again). Even so, the tests come out differently: `--test` 66/8/153 (baseline 249/200/11). With
    the prefix to line 3700: base fails `true.next == false` (line 233), with copies it passes, but the enum tests
    (239–250) never run and one runs past its budget in `{on} &+= {code}` (line 43). So which rule answers depends on
    where things are in memory, not only a pointer left stale. Found and fixed on the way (kept on main): the set-aside
    statements held in a local across their reading; writes into what lasts not counted as effects, so a backtrack freed
    what they pointed to; cache keys past the arena. Found and kept on the branch: the parse cache keyed by a grammar
    made fresh for each call, which another can take the place of once memory is let go; a statement read again needs a
    frame of its own. Open: what compares or hashes by address in matching (rule order, `active_noted`, the led slots by
    address, `reading_of`). Step 3 (reading with continuations, no choice stack or undo notes) takes most of these
    away, and is the order to try next.
  - **Landed 2026-11-14 (b06f7054), after step 3.** Two causes, neither in matching: the pairs log (`Pairs`, word 3988)
    keeps where each pair was learned as a raw place, compared by `unpaired`, and was not moved with the copy (now a root);
    and a test writing into what was copied out (past `arena_base`) counted as "kept outside", so no test was let go
    afterwards, young memory filled and the later tests stopped (`log_over`) without painting. Such a write is now logged
    and undone with the test, as a write into older young memory is (`Memory.lasting_tested`). Both suites at baseline
    with every statement copied out.
  - **But mostly not copied out (found 2026-11-14):** the notes' overflow (3964) and the outermost statement's start
    (3956) were the second words of two index slots (`Indexes.based_index` writes w and w + 4: 3960 for the program,
    3952 for what is taken). Once the program's index was built, 3964 held its start, so `statement_copied` returned at
    once, and 3956 was overwritten by a taken text's start. Moved to 3992 and 3984: both suites at baseline again
    (249/200/11, 135/133/8), now with the copy really made.
  - **What holds what, odd or not:** the barrier noted a write only when its value was `pointer(v)` (even). A text's
    ends are bytes, often odd, so a text older than a statement or frame given the ends of bytes made in it was never
    noted, and its bytes could go with the frame. The barrier, a frame's value and `lasting_copy` now take any value
    past the low words (`held`); the collector's own tracing already did. Both suites at baseline.

- **The caches measured again (2026-11-15, with frames compacted, revision 141, baseline 269 s / 188 s):** each
  removed alone keeps both suites at baseline. The parse table (`kept_parse`, by place at `arena_base`): 257 s / 188 s,
  no slower in the suites, but the self-compile 68 s against 52 s (three revisions), so it is back (9e433321 undone). `keys_reading`'s filter (every key tried):
  319 s / 217 s. The reading memo (`memo_read`, every hole read again): 313 s / 226 s. Each goes with what replaces it
  (rules kept by lead; a hole a token at a time), not before.
  `occurs` as a plain scan (its byte and pair indexes, 165 lines, gone): both suites at baseline and no slower
  (269 s / 185 s), but the self-compile 156 s against 67 s (it reads whole texts for each literal), so kept until rules
  by lead need no literal check. Found on the way: `eager_caches`' one `kept()` at the first frame opened is load-bearing;
  without it revision 142 writes 143 out of stack (`Maximum call stack size exceeded`).
  Rules by lead landed (38df3446: led keys indexed on their node; 9a0f4794: `keys_reading` by that index, given the
  rules): `--test` 226 s against 271 s, the self-compile 50 s. `occurs` unindexed again after it: the self-compile
  still 124 s, from `Readings.reads_text`'s check that a rule's literals are all in the text before reading it whole
  (each a scan of the whole statement). It goes with the hole read a token at a time, which makes that check moot.

## Runtime.ray and Compiler.ray in place of $/Wasm/ (user, 2026-11-12)

- **Done (2026-11-13), revision 140 on.** `$/Wasm/` is gone. runtime.ray's functions are Compiler.ray levels (`Hooks`,
  `Afterwards`, `Images`, `Locals`) or the machine's own instructions (`byte`, `word_of`, `byte_put`, `word_put`, written
  by Low as loads and stores); High is in Compiler.ray; Compiled, Low, the compile's header and the Wasm level are the
  bootstrap part of `$/Wasm.project.ray` (after its `// (bootstrap: name)` lines), until its levels write the revisions.
  Input part 2, where the old runtime was, is empty until a revision reads what is written for the back end there. What
  a compile reads lasts (past `arena_base`, now 1200 MB, so about 640 MB of it): Compiler.ray's size is what bounds it, a
  reading once what lasts is near its end read again each time (eleven times slower, revision 138's 84 s).

`ray/bootstrap/Runtime.ray` (at most 1000 lines) states what a program runs on, declaratively and apart from any back
end: kinds of value, names and members, calls and frames, patterns (each "what it reads from a place, every way, in
order", read through a continuation), statement layout, pairs, the budget, the host, afterwards. Memory layout belongs to
the back end (`$/Wasm.project.ray`'s level). Fields indexed, rules by lead text, regions, compaction and the choice stack
are removable levels of Compiler.ray. Externals: Design §21.2's only, plus the host's.
- Handover: Runtime.ray and Compiler.ray written in the subset today's High compiles; revision 130 built by the old
  pipeline; 130 builds 131 from Runtime.ray + Compiler.ray + Wasm.project.ray alone, which must reproduce the suites; then
  `$/Wasm/` goes.
- Open: the lowering (Compiler.ray: Runtime's classes to the back end's words, Ray to its instructions, what High and
  Low do now); level.ray's requests that Expression uses (`keys_reading`, `kind_of`, `spliced_entry`, `paired`,
  `holds_text`, `cw_*` …) written in the language; the cw_* helpers the compiler uses moved into Compiler.ray code.
- Draft 1 (this commit) does not yet cover: reading code in a node (`with`, `x.( … )`), splices, a rule's head read
  as a pattern (`headpattern`), conversions (`astype`, `readtext`), the editor's image, the test memory budget.
- **How it goes now (revisions 130–132).** Compiler.ray's `Lowered` writes Runtime.ray's statics as the low dialect
  after `$/Wasm/runtime.ray` (each kind a constructor `<Kind>_made`, each field read and written where the kind's header
  puts it, every word written through the back end's `written(holder, place, value)`, `Lowered.managed`). A function of a
  name both define is Runtime.ray's (`Lowered.overridden`), and the old one is then deleted from runtime.ray. Moved so
  far: values, numbers, nodes (found, define, assign), lists, closures, texts, patterns, where a statement ends, pairs.
  Since then (revisions 133–135): the matcher (a step at a time over registers `rp rpos rk rmode …`, the choice stack
  and bounds held aside), bound values, topattern, members and calls (`Symbol.x` for a name's number), lists of lists,
  constructing, headers, applying again. Runtime.ray is at 795 lines, runtime.ray at 5773; suites unchanged
  (249/200/11, 135/133/5), about 20% slower (a call per step: an inlining level would win it back).
  Not yet: with/with_locals, statements in turn (`in_turn`, `read_again`), splices, keys and led rules, conversions,
  the cw_* helpers, memory, entry/IO, tests and paints. These do not fit in the 205 lines left: the caches and memory
  go to Compiler.ray levels (lowered from a section given as input part 3 with Runtime.ray), cw_* into Compiler.ray.
- **Compiler.ray's own levels** (`Texts`, `Output`: the cw_* helpers) are written before `Lowered :=` and given with
  Runtime.ray as input part 3 (`.entrypoint.mjs` `lowered_input`); runtime.ray is at 5300 lines. Low reads no `if` as
  an operand (`q + (c ? 2 : 1)` became `unreachable`): write `c ? q + 2 : q + 1`.
- **More levels** (after `Output`, each `X := { … }` before `Lowered :=`): `Splices`, `Readings` (equal, readtext,
  mapped_*), `Keys` (a key's pattern and lead, literals in a text, moved_keys, keys_version), `Caches` (keys_reading,
  keys_read, led_keys; removable: without them `--test` is about 30% slower), `Pairs` (paired, unpaired, closing,
  open_before, block_closed), `Layout` (statement spans, continuation, gaps, columns, first/last where), `Indexes`
  (occurs and its byte-pair index, pair_end, holds_outside, the column index: removable caches), `Members`, `Calls`
  (invoke/call_member 0–2, select, place, readsv, intern, args), `Matching` (reads, bind, index, read_with, the rules led
  by text and their memos), `Built` (rebuilt, enclosed_holes, unread_until, cells, texteq), `Turns` (in_turn,
  read_again), `Entry` (input parts, file_named, the entry's reader, parsed_statements). They reach the back end only
  through named hooks in runtime.ray (`word_of`, `word_put`, `in_program`, `program_from`, `program_length`,
  `classes_version`, `classes_changed`, `class_put`, `caches_reach`, `keys_moved`, `keys_touched`, `logging`,
  `statements_aside`, `aside_or_none`, `turn_depth(_set)`, `fuel_floor(_set)`, `turn_begun`, `statement_over`,
  `taken_*`), and a few addresses named as constants in the level (`leads_at` …). runtime.ray is at 2686 lines: memory
  (regions, compaction, pins, isolation, the log), images, tests, `with_locals`, symbol scanning, `kind_of`, `own`'s
  field index, the choice stack.
- **Speed**: `.entrypoint.mjs` turns on V8's wasm inlining (`--experimental-wasm-inlining`): the runtime is many small
  functions, and it halves a test run. A test run reads every bootstrap file (Compiler.ray included), so each level
  added costs reading time: about 15 ms a line, but it jumps unevenly (two halves of a section cost far less in two
  sections than in one, and which statics share a section changes it by 20 s): likely the direct-mapped caches
  (`memo`, `reading_of`, keys) colliding by text position. `--test` 52→67 s, `--test-all` 28→43 s over these levels.
- **Reading a call statement fails before some lines** (revision 136, `--test` on a file of them): `f(g(r), g(r + 4))`
  followed by `h()` on the next line is unread (`f(g(r), 4)` reads); `A.into(t, cap, oe, l, o)` followed by
  `text(o, o + n)` is unread (followed by `o` it reads) when `into` takes five parameters, two typed.
  A whole section can be unread too (its `{` reported), by which statics share it: `bytes_at`, `word_byte`,
  `put_span`, `saved` together in `Basics` were, each alone was not, and moved into `Texts` they read.
  Why (2026-11-12): the pairs a rule's text teaches (the bytes either side of a capture) include `+` and `:`, from
  String.ray's `U+{codepoint: Hexadecimal.String}: Char` (the `+` is of the word `U+`, the `:` the return type's). From
  then on `+` opens and `:` closes, and a bracket's end (`bracket_ending`) counts every kind as one: `(a < 0)` stays
  open past its `)` (the `<`), `g(w + 1)` past its `)` (the `+`), each closed by whatever closing comes next (a `:` a
  line later, the `>` of an `=>`). A hole jumping to that end reads across statements: inside a block, a forward call
  with a `+` in its arguments (`f(x + 1, …)` before `f`) had the next definition's body read as statements of the block,
  its loop run with nothing bound (`Collector`'s `gc_first`, the reading out of memory). What reads today partly
  reads by accident: `:` closing balances the `<` before it (Caches' `(a < 0) && …`), and some tests depend on it.
  Tried: not pairing a byte written onto a word (`U+`), so `+`/`:` are no pair: the Collector reads, 6 unread errors
  go, but CF20, GR1/3/6/7, the OP block and Caches stop reading (they relied on `:`); a bracket closed only by its own
  partner (from the pairs log): `<` then closes at an `=>`'s `>`; nested (an other closing leaves it open): `(… => …)`
  never closes. Open: how a byte that is both an operator and a bracket (`<`, `>`, `+`) is told from one, for a
  bracket's end as for a block (§ blocks count brackets shaped as one). User's choice: the shape rule (a bracket a rule
  taught, written as an operator — ` < `, `=>`, `<= `, `->` — is none; a byte glued to a word teaches no pair). Built
  and parked (it compiles, its fixpoint holds): with it, a closure called with nothing, `(() => { … })()` (the class
  rule's body), no longer reads (it read because its `(` closed at the `=>`'s `>`), so every class fails; and the rules
  that relied on `:` closing. To be done with the restatement of matching in Runtime.ray, the language's files fixed
  with it. Until then `Collector := class`, `Afterwards := class`, `Images := class` and `Locals := class` are read by the tests as unread (an error
  each; in Afterwards from after `seeded` on: a block after it, however small, is unread, one before it is not).
- **Lowered pitfalls, later**: a constant (`static x := v`) is put in place only when `v` is one token: `(1021000000
  * 2)` stays a bare name, which Low takes for a global or function it does not have (write a no-argument static,
  `static x => 1021000000 * 2`, called `X.x()`); a number past 2^30 is not a literal Low writes (`1021000000 * 2`, as the
  old runtime did); a call to a function nothing defines is not an error (Runtime.ray's `builtin` called `noted`, gone
  since revision 0's paints, and so called the module's first function).
- **Lowered pitfalls, still**: a local (`x := v`) after a statement `s if c` is written wrong (all of `lasting_alloc`
  broke every test): what it is the value of goes in as an argument instead; a section's name like a function of Low's
  (`stored`) is to be checked too.
- **Lowered pitfalls, more**: `x = v if c` reads as `x = (v if c)` (write `x = c ? v : x`); in the debug printer the
  symbol numbers differ (High.program seeds them first); a kind with many fields must be `aside` or Low has no type.
- **A lowering feature takes a revision before Runtime.ray can use it**: revision N's runtime is lowered by revision
  N−1's built-in `Lowered`, so a new shape (`x[i] = v`, `return v if c`) is committed with Runtime.ray not using it, the
  revision built, and only then used.
- **Lowered pitfalls found**: parameters and locals are written `the_x`, apart from any function (Low reads names
  regardless of case, and `node`, `field`, `index` are functions); a helper of a name the old runtime has replaces it
  (`roomy`), so check; bodies are indented (a line starting with `(` at column 0 after a block's `}` is read as a new
  statement of the module); a quoted bracket in a nested expression (`"(load "`) overflows the reader's stack.
- **Size**: 6872 lines of runtime.ray are left: about 4600 of matching, calls, members and keys, 1200 of memory, 470 of
  cw_* helpers, 300 of entry and IO, 260 of tests and paints. To fit in 1000 lines the core is to be restated (each
  pattern kind's reading a rule of its own, through a continuation), not transliterated; the caches (pair ends, led
  keys, rules by lead text) and memory go to Compiler.ray levels.
- **Memory, one way of keeping (2026-11-15)**: a statement's end now compacts its frame as a call's end does (9ca298a1:
  the same results and times; the copy out to what lasts, `statement_copied`, gone). A test's end the same way
  (compact what it painted and said down to where it began, `kept_alone`, instead of `lasting_copy` to what lasts) gives
  the same results but `--test` 67 → 77.5 s, twice: what a test keeps then stays young, inside the frames around it, so
  it is moved again by each of their compactions and written past the barrier. Not landed; `lasting_copy` stays for it
  and for the compiler's parse table (Writing's `parse_moved`). With no reclaiming at all (`noreclaim = 1`) the suites
  run out of memory (18 passed, 207 errors): reclaiming is not removable, only unifiable.
- **Why `eager_caches`' allocation was load-bearing (found 2026-11-15)**: memory taken below `Heap.marked_from`
  (16 MB) had no starts noted, and the program's text ends near 9 MB; `pcache`'s 8 MB, taken at the first frame, was
  padding that put everything else past the mark. Without it revision 142 ran the heap into the arena building 143
  (`overflowed`). Every allocation's start is noted now, the mark gone, and with it `pcache`, `eager_caches` and the
  led table (same suites, the self-compile 51 → 50 s).
- **The memo, measured again (2026-11-15)**: off (`nomemo = 1`), `--test` 65 → 116 s, `--test-all` 28 → 62 s. It stays
  until holes read differently.
- **Calls, the lazy reader (landed 2026-11-16)**: a method led by what it is read on, `{this}(…)`, kept in a node of
  its own rules (`led`) and read only on a value made of it (`led_from`), about 40 reader lines. Number.ray's `{ }{value}`
  looped it (read on the class itself: `Number{true}`); written `{this}{value}` it reads on an instance only, as its one
  use, `1 Vertex.Boundary`, does. With it a body beginning `external .` lost its node: the statements after it were read
  in the node they began in (`Statements(me.in)`), not the one `.` made, so what they defined (a call's parameters,
  `taking`'s) was not seen by them. `.` now makes that node a component of the one they are read in (`composed`).
  Together: `--test` 249 → 289 passed, `--test-all` 135 → 307 (far more of each file read), no budget stops, the
  self-compile the same (48 s, 546 MB). Landed slower (`--test` 56 → 168 s, `--test-all` 17.5 → 101 s), as the user
  decided (2026-11-16): the cost is the language running its own library (tests run once everything is read, so every
  list is made by Array's `new` and `append`), and a structure's speed is the compiler's to give, by type (Array is a
  Ray: what is of that type is optimized for it), once everything works. Two tests that passed before fail with it,
  each by what is still broken, not by calls: IX9 (`level member` answers a value even for a name not held: it passed
  only because the call never ran) and IS1 (`.every((item) => …)`, see below).
- **A call's parameters, given positionally, are not seen by its body** (2026-11-16, both readers). Three causes, each
  found with scratchpad `probe.mjs` (`AT=2619`, `p32.ray`, `p43.ray`, `p52.ray`):
  1. *Fixed:* `(x) := v` is `({name} => value)`, a pair the hole took: the rule maker looked for where the head's own
     inside was written (`between({name})`, nothing), so defined x in the `:=` rule's body. Now a pair a hole took is
     defined where the hole's text was written.
  2. *Fixed:* `({p}) := v` in a rule (`taking`'s `({written_parameters}) := …`): splicing does not follow a hole named
     inside a pair, so the name stayed `{p}` and nothing was defined. Now what is in such a pair is the text p took, and
     it is defined where p's was written (the call's own node). `(zb) taking true` now gives zb.
  3. *Open:* a styled call rule (`{this}({arguments}) ^punctuation => { … ({{parameters}}) … }`, the closure's) reaches
     the rule maker through `{lhs} ^{style} {=>} {rhs}`, so its body is `{rhs}`'s text, spliced once: its `{{parameters}}`
     and `{{body}}` are never spliced (TODO 2026-10-31 already: "needs its body spliced twice"). Tried (scratchpad
     `E.R2.ray`, `E.S.ray`): such a body spliced again while it still holds `{{`, and a code hole given a block, `{{body}}`
     taking `{ … }`, given what is inside its braces (a closure's block body is code, as a rule's is). Every closure probe
     then passes (`(a, b) => …`, `() => { r := …; r }`, `(x) => { x }`, recursion through `.on`), but the tested text does
     worse at every file (`.project.ray` alone 263 → 237 passed; from Node.ray on it runs out of memory; with Ray.ray
     nothing passes): what calls now really run (classes with a header run their block per construction, `Ordered`'s
     `>`/`<`) costs more and fails more. Next: what Ray.ray's `Ordered := class (T = static) => { … }` does per call.
- **A block's name leading a text in brackets** (2026-11-18): `(tt && true)` read `tt`, then `&& true` on its value,
  by nothing (the split answered None). Now the whole is read again with the split and the rules led by that value set
  aside (`unsplit`): --test 289 → 395, --test-all 307 → 604. Still open: `(tt === tt) === true` in a block (one
  bracketed `===` inside another), and IB22 (Number.ray) and IT46 (Ray.ray), which passed before it.
- **Two arguments given by name, in a block** (2026-11-18, `p107.ray` at the NA tests): `PN(left: true, right:
  false).left` fails, as does `PN(left: tv, …)`, `PN(left: (true), …)` and the other order; `PN(true, false).left`, one
  given by name (`Indexed(index: 5)`, NA12) and the same call in a method (`paired_of(a, b)`, NA10) pass. `taking`
  gives the list positionally first (`({written_parameters}) := arguments_given`), then `given_names` declares each by
  name; `level function_given` there is answered by nothing.
- **A comment after one space is read with a block's name** (2026-11-16, scratchpad `p124.ray`–`p134.ray`): in a block
  with `v := true` (or `h (n) => true`), `mine v // c` and `assert h(false) // c` fail, where `mine v  // c` (two spaces,
  as every test is written) and `mine (v) // c` pass. The hole takes `v // c`; read in the block, the block's own `v`
  reads its start and `// c` is then read on its value, by nothing: `nearer` lets a farther rule read the whole only
  when it is a name equal to the text (`fuller`), and the block's `in` finds `v` again through its parts before the
  comment rule in `global`. Letting a farther rule that reads more win (longest first, §4.3; `E.H.ray`) passes these
  but fails 35 tests written with two spaces (CC10, CF12, CF18, …): the comment rule's `{statement}` is then read
  where the rule is, not where the text was written (`=> statement` does not help).
- **RC1 and RV2 are not run with calls running** (2026-11-16, `E.R2.ray`/`E.S.ray`): their asserts are not reached. It
  looked like `recur ^keyword` reading the start of `recurring_…` names, but those probes had comments after one space
  (above); written with two, a block's `recurring_…` methods are called (`p107b.ray`). Open.
- **A definition with no head in a block goes round** (2026-11-18; a rule with no head is a parse error, user): at the
  top level `x := true \n=> 2` leaves `=> 2` unread, as it should; in a block (`q := { \n true \n => 2 \n }`) a line
  `=> 2` or `:= 2` runs past its budget, everywhere around it too (`== 2` is left unread). Likely the statement around the
  block read again by the rule that makes rules, its head `q := { true` ending inside the brace it opens: a head is read
  as `String[]` (`Code`), which, unlike a hole, does not keep a pair whole. CLI.ray's `=> …` now has a head (`() =>`).
- **Starts found stale where a value is made (2026-11-16)**: every place that lets memory go clears where values started
  in it (`freed_to`, `all_freed`, `memory_back`, and `freed_back` with it), yet a value made after a `freed_back` finds
  starts noted in its own cells (769 times in one self-compile). Clearing only where memory is let go (and not where a
  value is made) is 5% faster but the self-compile takes 7 MB more (545 against 539 MB, steady): something leaves starts
  above `free` that no letting go clears (not `frame_freed`: clearing there too changes nothing). Until it is found a
  value's cells are cleared where it is made (within one byte at once).

## Node.ray

- **The error handlers read members bare** (`diagnostics`, `diagnostics.last`, `diagnostics.some(.fatal)`, line 68–84):
  since a bare name never reads a member, they need `.diagnostics`. They also call `diagnosed` and `caught_by`, which
  Diagnostics.ray now defines; once Diagnostics passes, the handlers can move there (user: and from there into the
  bootstrap, only if it does not fail).
- **`Class~label()`** (Node.ray `~{label}` → `Entry`): `Panel~opened().shown` (Control.ray CMP3/CMP4) is unread.
- **`suggest { … }`** (Node.ray:397 `mathematics := suggest { forall == ∀ … }`) is not defined, so the block is unread
  (`--test-all` ERROR). It is meant for the IDE: it suggests using, or rewriting into, a particular kind of structure (a
  `suggest` equivalence, Design §20.2/§4.7), not something applied when the code runs.

## Tests

- **Expected errors.** A test passes only when nothing erred, so a test of an error path cannot pass: the rules that
  prevent each other (Control.ray PV1–PV3) and a function raising a non-fatal error (Diagnostics.ray ER14–ER21) fail with
  the error they expect. Something must say that an error is expected.
- **Tests in a class's block are never read** (2026-10-31): a class body is read per instance, so Project.ray's asserts
  (all inside `Project := class: Location { … }`) are neither run nor painted `untested`: `--test @ether/ray/Project.ray`
  says 0 passed, 0 failed. They should at least be reported.
- `--test FILE` per library file, rev 73 (with include; passed/failed): Access 7/0, Character 4/2, Choice 6/10, Control
  15/15, Diagnostics 6/17, Location 14/4, OS 3/1, Program 21/13, Project 0/0 (30 s), Unit 27/5; bootstrap Ray 20/39,
  Number 35/25, String 32/24, Node 25/12. ~7-8 s a file (2-3 s before include). Whole file (9 loop tests blanked):
  361/289, of which ~36 passes are comment captures (`{ }` in a head takes a trailing comment, r91/cdiff.mjs).

## Projects

- **A project's dependency lines are read by nothing** (`@ether/random`, `@x25519` at the top of a `.project.ray`): a file
  given directly reports them unread, and nothing loads the projects they name.

- **Tagged literals read by nothing** (`@html <p>{who}</p>`, `@json {…}`, `@css …`, `@c …`, `@js …`, `` @ray`1 + 2` ``):
  Language.ray (deleted) read them through `Language.named(ext).level`. They come back when a dependency is flagged as a
  language, which gives the syntax. Until then they are unread. The tests that use them stay as written, and TL1
  (`` @ray`1 + 2` == 3 ``) waits for this.

- **A name written in a frame is not placed** (`x := …` at the top of a file or in a block): a write places what it writes
  only in what has a location (Location.ray's `{holder}.{name} = {value}`), and a frame has none. It should be where the
  code is written (the file, `@/…/Program.ray`). The rule's body cannot name the frame (`.`) from the block it defines on
  the value; a hole spliced in braces (`{holder}`) can be.
- **A value placed after what was written in it** (`x.f = v`, then `x @ place`): v stays nowhere, since a write in what
  has no location places nothing (Location.ray; placing each write costs a rule and a block, and most holders are
  nowhere). A write could place lazily always, once that costs less.

- **A grant for one use (`{once}`, W2)** has nothing to count its uses since Access was removed (2026-10-23): who may is
  only who, at a location. AC6/AC7 were taken out of World.ray until uses are counted where they happen.

## Tests to take in

- **Control.ray's tests of the language's own forms** (operator sections OP1–OP5, `if` with cases IC3, `?`/`?=` QM1–QM2,
  `is` with `#` IS4–IS6): they test what the bootstrap defines, and belong there.

## Reading programs by structure

- **Program.ray reads statements by their text** (`is_jump => .code ~= ⊢"goto "`, `is_label`, `jump`, `head`, `assigns`,
  `writes`, `declares`, `precedence`): a parser written beside the language. What a statement is should be what the reader
  read it as (Expression.ray's statements: a jump, a label, a declaration and its head), asked of the statement.
- **`@me/device/os` in the bootstrap** (Node.ray IO3, Ether.entrypoint.ray's `threads` default): the OS is one of the
  devices `@me/device` superposes, selected by its type, `(@me/device as OS)`.

## The compiled compiler's speed

- **A call looks up what it calls through the scopes each time** (`get(scope, X)`): revisions 24-25 give one or two
  values, or none, without a new list (`invoke0-2`, `call_member0-2`, `call1` in the runtime's loops), and revision 22
  keeps a parameter as a local where nothing writes it. Still wanted: a block's static known when written
  (`X := { static f … }`, X never given again) called as its function, `X` not looked up.
- **Reading a statement asks every rule key through a closure** (Expression's `longest`/`defining`): since revisions
  70-75 only the keys `keys_reading` leaves (a literal lead matching the text's first byte, every literal in the text)
  are asked (whole file 142M → 65M steps). Still ~45% of an editor run (time-sampled, ~/.cache/ray-scratch/w9 tsamp3),
  and `longer`/`read_by` read the text with the chosen key again (~20%).
- **The editor reads the entrypoint and its includes again for every file** (~4.8 of ~6 s an edit, revision 74: Ray.ray
  1.4 s, String 1.3, Number 0.9, Expression 0.6, Compiler 0.5): an image (revisions 76-78: `image_out`/`image_in`, Expression's
  `level entry_read (read_text)`, the export `entry_given(text)`); the host reads each file after it by default since
  9994f8a8 (OS 0.2 s, Choice 0.47, Control 1.6, was 6-7 s; the image ~3 s once, ~356 MB). Paints equal the full run's but
  one extra `string.punctuation` in Control.ray (40:2).
- **A numeral of 2^30 or more compiles to an invalid module** (2026-11-02, ray-09): `cw_numeral_value` answers a level
  int (`2n + 1`, 31 bits), so `1588444896` wraps negative and `Low.sleb` writes a negative value as one byte ("expected 1
  elements on the stack"). The runtime writes such numbers as products (`1021000000 * 2`). Wanted: `sleb` signed both
  ways, and a numeral's value wider than a level int.

## Painting

- **A body no test runs is never painted** (a method's, e.g. Access.ray's `covers`): it is read only when it runs.
  Measured 2026-10-31 in the editor (own tests only): OS 91%, Character 86, Choice 80, Diagnostics 73, Access 67,
  Location 67, Program 59, Unit 50, Project 38% of characters painted; the rest is nearly all bodies, a definition's `=>`
  and its head's holes. Even applied bodies (`choose {type} ^keyword => Program(name: "choose"): type`) leave nothing in
  the definition. Abstract runs of rules never applied: read each one's own head as a statement (prototype
  ~/.cache/ray-scratch/r91/e_ab.ray), little gain until applied bodies paint.
- **Names painted in a style not theirs**: `Number`, `Array`, `Program`, `Narrowing`, `into`, `narrowed_whole` are
  painted `string.punctuation` at every use, via the rule-level style (`painted{.rest.first === rule_own}#`) — an entry of
  the `` `{text ^string}` ^string.punctuation `` definitions matches their rule. Not `keys.last` (tried), not rule_own
  None, not per-test memory. The entry's value is those rules' own keys: likely `` (level rule `"{text ^string}"`)
  ^string.punctuation `` (entrypoint, before that head is defined; also the `(level rule …) ^punctuation` lines), as
  `level rule` asks `external rule`, which Expression does not answer.

## Running a program (found getting `(@me/device as Terminal) = x` to run from the CLI)

- **A free infix rule from a file after the entrypoint takes `:=`'s statement**: with `{a} %% {b} => …` in a file,
  `x := 1 %% 2` reads `(x := 1) %% 2`. Operators written as methods (`Node &+= { @ (location) => … }`, like `==`) do not;
  Node.ray's `@` is one now (`x := @name` read `(x :=) @ name` before).
- **An unset optional field reads as its type**, so `x ?? y` never falls back (`registry: Character?`); written `= None`.
  `a | b: T = v` (two names and a default) does not keep the default either (World.ray's `presence` is one name now).
- **The pair table takes one-hole heads' texts as brackets** (2026-10-31, ray-4d): after the entrypoint, the runtime's
  byte classes are `" ( ) . < > ? [ ] ` { }` with `.` and `<` openers and `?` and `>` closers (from heads like
  `.({member})`, `{c} ? {a} : {b}`, `<…>`), so a scan for the end of `(`, `{` or `[` counts every `.` as an opening
  bracket: `pair_end` and `open_before` can answer a wrong end or none. Holes skip pairs with it; revision 97's
  continuation guard could not use it for that reason (it uses the block-shaped brackets instead).
- **A selection between backslashes does not read**: `\x\` (U-C2, `instance`'s primary) is read as an escape (`\s…`)
  and a label (`name\`), and `\(` as an escaped bracket whose `)` still closes (it ended `Character &+= {` early). A
  backslash inside backticks in a comment escapes the closing backtick and opens a quote to the next one: comments are
  scanned for brackets and quotes too.
- **`"{hole}"` in a rule's body reads the hole's code**; its written text is `` `{hole}` ``. `String.split` answers
  nothing usable (its own tests fail): `Character.walked` walks a path with `until` instead.
- **A ternary continued on lines led by `:`** in a static method's body goes round forever; written on one line it reads.
- **A rule whose head another rule reads cannot be redefined**: `@local ^string => …` in World.ray after
  ray/.project.ray's is read as an expression head (`@local` answering a Location); `@local` answers `Location.local`,
  which World sets.

## On the way to the site's first frame (skipped for now; only what Index needs is given to the run)

- **Unicode.project.ray reads its tables from unicode.org while it is read** (`Unicode.Scripts.rows…for script => …` and
  `GeneralCategory`'s rows at top level, `Unicode.UCD` an `@https://…` location): ~528 MB, and nothing holds `@https` without
  @ether/network. Its three-name aliases (`camel_case | camelcase | camelCase => …`) cost ~500 MB each once those statements
  ran (two-name ones nothing): the alias rule's `{name: Name}` checked on characters made through `Char &+= Unicode.Scalar`.
  Left out of the first frame's files.
- **A word after a number is read as that word through the number** (`5 px`, `5 zorks`: the value 5, then the name read
  on it, found in what 5 sees, globally): the space-led method of Number (`{ }{value}`, Unit.ray's `{ }{counted}`) is
  never reached, and the 5 is lost. `5 7` does reach it.
- **A decimal does not compare** (`16.5 > 16` fails in the bootstrap alone).
- **A hole typed by a block or a narrowing of String reads nothing after a value** (`{written: { px: … }}`,
  `{written: String{Spelling[.] !== None}}`); a list of glyphs (`Char.Letter[]`) does match but its text is read as code.
- **`Unit.None := Unit(global.None)` goes round 6000 deep** through `conversions` (Unit's own `as (=== Quantity)`, `as
  (=== String?)` with Node's): Unit.ray's tests fail but its 85 statements read.
- **Constructing a Location costs ~512 MB** (`Location(path: ".")`; `Location()` nothing). Each construction declares the
  header's fields as a rule whose head is the header (`({written_parameters}) := arguments_given`), where braces are holes:
  the narrowings `Char{!= ":" && …}` are read as hole code and evaluated, and `x != ":"` reaches Location's `==`, which
  writes the Location as text through Language.ray's header writer. With `== (other) => true` it costs nothing; naming
  the narrowed types outside the header, or a Location `as (=== String)` of its own, did not help. World's `static ether`
  and every `Instance` pay it. `@local` makes one only when asked (`Location.local ?? Location(path: ".")`).
  Taking the header's defaults instead when everything is given by name (`taking`: `all_named(arguments_given)` beside
  `declared`, then `given_names`) makes `Location(path: ".")` cost nothing and keep its path, but Number.ray +225 MB and
  the other bootstrap files more (their named constructions read the header as code for its defaults): not kept.
- **A typed parameter rejects an interpolated text** (`static walked (at, path: String)` given `"{path}"`/`` `{path}` ``:
  "a value is not of the type it is given to"); untyped it reads.
- **Time.project.ray runs out of the 2 GB** when read after Unicode (the whole 85-file closure of the site does not fit).
- **`x as String` answers a String of characters, not the kernel's text**: `external output (5 as String)` writes nothing,
  and `(5 as String) == "5"` is false in a ternary though `assert 5 as String == "5"` holds (assert's comparison is
  structural). (A count's `as String` is its digits now, by the kernel's map, and a text joined with what is no text joins
  it as written: `"\e[" + 5 + "H"` writes.)
- **With Language.ray read, `5 as String` costs ~512 MB** at read time (and `Location() as String`, so Location's `==`):
  Language.ray gives every Node `as (=== String) => … Language.ray.write(this)`, and the Ray writer writes a Number as
  `writing.value as String`. Without Language.ray it costs nothing.
- **Language.ray's header writer reads `.of.header.head`, which no class has** (the entrypoint keeps a header as
  `header_quoted`): no structured value is written through its header; a Location (a Ray) falls to the list writer.
- **A single constructor taking nothing is not what the type is called with** (`J := Number[] + { static () => [7, 7] }`:
  `J()` is not `[7, 7]`): `made_by`, taking nothing, is applied when named, so `(this).made_by` is its value and
  `this.made_by()` calls that. With another one beside it, `static (x = 0, …)`, it reads (Geometry's Vector).
- **A name given a type of more than two, `x: A | B | C`, or of other than names (`orientation: -1 | +1 = +1`), reads as
  `(x: A) | B | C`**: only `x: A | B` with A and B names is the whole union (the entrypoint's rule); a structure's
  alternatives of named fields, `(LHS: … | RHS: … | String)`, must stay what they are. And a statement typed so,
  `a: Number | String = 3`, is not 3 (`b: (Number | String) = 3` neither).
- **`this` in a function written in a class's own block is not what is made** (`rows := (0 ..< 1).map(r => this.width)`
  in a class's block: nothing; `.width` neither). In a method it is the method's `this` now (the frame the function was read
  from, out through the functions it is written in); a class's block, inlined in its constructor, names what is made only
  as `.` and `this` directly. Grid names its width before its rows for that.
- **Arguments are composed by `,`, then separated by the types they are given to** (the user, 2026-10-23): `.put(at, cell)`,
  `at` a Vector, reaches `put` as `0, 0, cell`; given more than it has places, a place typed so takes as many as make one of
  its type, made it (`&+=`, its members on it). Only when more are given than places, and only for the first places in
  order: a place taking a list among defaults, or two lists, is not done. `[at], cell` keeps it whole as written.
- **Geometry gives an Axis a Number where it declares a Length** (`Space.grid`: `extent: axis_entry.value`, the grid's
  size in cells, against `extent: Length?`): said as an error, and the extent is then the type (all Lengths), so `holds`
  compares against every Length and runs out of memory when asked twice. (A Length is a distance with a unit: the grid's
  extent wants a Quantity, the user, 2026-10-23.)
- **A method written against what follows it takes one word of it** (`0..p.width` is `(0..p).width`; `0 .. p.width` and
  `0..(p.width)` read): the member is read on what the method answered. `..<` so is read whole by a rule in Ray.ray (`0..<p.width`,
  `(0..<.height)` in UI's Grid); `..` is not (a rule `{low}..{high}` would take `..<` too): UI's `(from.x..to.x)` (underlines).
- **A level of rules applied to a value, `Compiler.reduced(move, UI.TUI.written)`, applies none of its typed rules**
  (`{move: ANSI.Move} => …`): `reducing` reads the value's code (a name) in the level, and a typed hole asks of the text
  (cached per type and text), not of the value it names, so a Move or a Style is answered as it is, not written. A text
  answers itself, a list goes through `{sequences: Iterable}`. The first frame stops here: its parts are not written.
  (`reducing` answered the level itself before: `reading` is `&+=`.)
- **A raw fragment's control sequence, `@ansi \e[2;3H`, opened a bracket** (everything after it misread, ANSI's Style
  no Style): a bracket after `\e` belongs to the escape now. Character.ray's line fragment rule does not take a
  fragment that begins with `\` (its first is a word, `<`, `(`, a backtick, `"` or `-`).
- **`x -- y` binds looser than `:=`** (as declared, after `=` and `,`): `q := [4, 5] -- (v => …)` is `(q := [4, 5]) -- …`.
  A function in brackets after it is given what is before it (`x -- (made => (@also made Vector) -- made)`); a function
  read another way is not.
- **A parameter named bare in a method does not read the field** (`S := class (axes: Number[]) => { dimension =>
  axes.length }`: `S([1, 2]).dimension` is nothing; `.axes.length` reads it).
- **A rule written outside the entrypoint does not read a block it was given in the node it makes** (`{on} +++ {`{`}{code}
  {`}`} => ((on).interior) &+= { {code} }` in a file: `Node +++ { two => 2 }` is Node itself, and `two` is defined at the
  top; the same rule in the entrypoint holds). So `A + { … }` is the entrypoint's, beside `&+`.
- **Some bootstrap code made from text is read three times now, not once** (since statics written `name: T = Class.x`
  and `Class.member` are read when first asked for): `0b0110 ~&& 0b1010 == 0b0010` and two like it, each unread, said
  three times; nothing else differs.
- **A class made in a method's body does not take its header** (`static C := lazily class (y: Number = 0) => { }`:
  `U.C() is U.C` is false, "a left side answers a value, not a place: `()`"). So `static X := v` is lazy (the kernel's
  `external static`) only when v is not a class, nor led by a capital unless it is a call (`Binary₈`, `TF{} {…}` are
  types, named by what they are given to), nor `.`-led (`.DepthFirst`). Typed, `static x: T = v`, only when v is what a
  class makes, `Space.plane`, `Space(…)` (`Letter: Char = "a".."z"` is a type; Language's `ray: .Lossless = (…)` read
  lazily is read by the first `as String`, ~320 MB, inside World's declaration).
- **`.` in an argument is what the code is read in, not a section** (`(0..<24).map(8 + 10 * . -- Geometry.Color(., ., .))`
  in ANSI's `Palette`; `[0, 1].map(8 + .)` answers 1): read where ANSI is declared it was `10 * ANSI`, 6000 deep, and ANSI
  was left half-declared (`ANSI.Cell() is ANSI.Cell` false). Lazy statics keep it unread until asked.
- **A word method written both with and without parameters, called infix, reads the one without** (`mn (b) => b` and
  `mn => 7`: `qb mn 5`, `qb.mn 5` answer 7's reading, not 5): the decided rule (§21.3, brackets read the one with
  parameters, none the other) takes `mn 5` as `mn` then `5`. Number's `min`/`max` (Ordered's, and Ray's `min =>`) are not
  hit: `2 min 5`, `pv.x min pv.y` answer 2.
- **A level reduces no value by its type** (`Compiler.reduced(Kd(1), { {kd: Kd} => "kind" … })` is not "kind", a number
  or a text neither): `level reducing value` reads the code `value` in the level, and a typed hole asks about that code,
  not its value. UI's `drawn`, `filled`, `shaded`, `shown`, `Lowered` and Geometry's `Solving`/`Projecting`/
  `Approximating` are written so (the user, 2026-10-23: the old Language model; class headers and `as X` instead).
- **A rule led by a hole typed by a class reads nothing where the class's own rules don't read the text** (`{n: Number}
  ~!!~ {m} => …`: `4 ~!!~ 5` is unread; untyped, `{n} ~!!~ {m}`, it reads): a typed hole is checked by the type's own
  rules (Design), and Number's digits are read by a global rule (`{digits: Decimal.String} ^number`), so `4` is no Number
  to a check. String's quotes were global too; String now has them as its own (`"Ray" ^h1` reads by UI.Scene's
  `{styled: String}{ }{`^`}{style}`). A name is a value of a type only when it names the type itself (`named_as`, `v ===
  type`), and only a global one: `box ^h1` with `box` a Shape is no `{styled: Geometry.Shape}`, nor is a value typed by
  a narrowing (`{placed: *{…}}`, `{site: *{…}}`, `{v: *{. == 3}}` on `3`). UI.Scene is made of these.
- **A hole named as a name the body's callees use shadows it there** (`{text: String} => Ph(flow: 5)`: Ph's construction reads
  String's own `text` holes as the reader's; `{styled}` shadowed `.styled`, `{inline}` the flow `inline`): a rule's hole names
  reach every body it calls. Scene's holes renamed `marked`, `inlined`.
- **A list given as an argument beside another is composed into it** (`f(list, x)` is `f(list..., x)`; `[list], x` keeps it
  whole): Compiler.reduced is called by name. A named argument is code read in the callee (`this` there is the callee's): its
  value read into a local first (`program_answered`).
- **In a rule's body, `x.m` after `=>` without brackets binds to the rule** (`{text: String} => text.count` is `(… => text).count`;
  `=> (text.count)` is as meant).
- **A member added to a list's links changes the list** (`.all`, `Colour#`, `==`): the operators' edges are not kept on links;
  a superposition is of `|`'s edge (only `|` makes one), a list `,` made (`spread`) of `,`'s.
- **`(1 | 2 | 3).every(x => x < 4)` is false** (main too); `.all` (a section reduced) is not `== (1 | 2 | 3)`.
- **Program's `{this}()` reads `x()` in a Program method's body as itself** (its `this` untyped): what a program answers is a
  function outside Program (`program_answered`).
- **Tests inside a static class's body run only when something makes it** (Ray.ray RR53 in `Graph.Simple`).
- **CO37 under Program's `+`**: `(Program(code: { 2 + 3 }){O: shouted})()` is 5 at top level, not in Compiler.ray's test block.
- **A member named as one of the rule's holes reads the hole** (`{styled: String} … => x.styled(style)`: `.styled` is the hole,
  not x's method): a name after `.` is x's, never a hole of the rule it is written in. UI.Scene's hole renamed `marked`.
- **A field holding a closure, named bare, is the closure applied** (`(p).reading === None` for `reading: ((s) => …)`, and
  `Program(…, reading: (p).reading)` copies nothing); the closure called, `(p).reading(L)`, is as written.
- **`x.m := v` defines `m` on what x is made of** when x has no `m` of its own and a part of it does (ray-61: `on.made_of :=`
  in `&+=` wrote on the part; fixed there with `external member`).
- **UI.Scene under a Program does not make a scene yet** (`(Program(code: { "Ray" }){O: UI.Scene})()` is the text "Ray", not
  a Box). A level reaches every body its program calls (`level_in` re-reads them all), so Scene's rules apply to UI's and
  Geometry's own code (Box construction) and Scene as a whole runs out of memory on `"Ray"`. Marking rules made while the
  level is in scope (re-reading only those) works on one thread but not with `--threads 26 --target wasm` (CO35–37): the
  level needs to be told which closure is its program. A type check reads without the level. Scene's rules of one hole,
  `{text: String} => Geometry.Box(content: text)`, `{shape: Geometry.Shape} => shape`, `{value: *} => …`, are readers
  (a head of holes only, §: read only where the type's own rules read), so they reduce only through `Compiler.reduced(v,
  UI.Scene)`, which reduces no value by its type (below). Program's call does not reduce its answer by its level either
  (Compiler.ray: "what it gives read by them"). `"Ray" ^h1` goes round: the style's text `h1` is read as code under the
  level, every typed and narrowing hole of Scene checked on it (`1` checked a million times: a check that runs a
  condition is not kept). Site files (`orbitmines.com`'s classes, written in Scene's syntax) are declared before the
  program runs, so the level would not reach them: a level reaching a program's project is still to be designed.
- **`assert Program(code: { … }){O: L}() == x` without brackets around the program is false** where `(Program(code: { …
  }){O: L})() == x` holds (CO35 is written so).
- **A class written as a header alone, no block, makes nothing of it** (`Pa := class (x: Number = 1)`: `Pa(x: 2) is Pa` and
  `Pa().x == 1` are false; `class (x: Number = 1) { }` and `=> { }` hold both).
- **`Compiler.folding + x` is not a composition** (`(Compiler.folding) + x` is): ` + x` is read as a method of the member's
  value (found by ray-61).
- **A header's default reads the fields before it now** (`class (a = 1, b = a)`): `same_block` takes a header after a word
  or `{` as well as after `:`. Anything wider (every bracket) silently lost a test (Ray.ray's IT11: neither passed nor
  failed).
- **A text joined of three or more is not the text** (`assert "a" + "b" + "c" == "abc"` fails, `"ab" + "c"` holds; numbers
  hold): and, written to a terminal, ANSI.Colored's `as String` (six joined, `";2;" + … + ANSI.digits(this.blue)`) says
  "nothing in what it is read on reads `+ ";" + …`" when Style's `as String` calls it inside a `map` (directly it writes
  `38;2;255;0;0`); a class written in the entry file with `as String => "r" + ANSI.digits(this.red)` writes nothing.
- **`right-to-left` with names written together defines none of them** (Ray.ray's `right-to-left Σ | ∑ | sum => …`:
  `[1, 2, 3].sum` is not 6, though `sumA | sumB => …` and `right-to-left sumC => …` each work): `right-to-left`'s body
  `{operator} => {body}` is read as a definition whose head is the hole, so the alias rule never sees `a | b`. Inlining it
  (`{{operator}} => {body}`) goes round 6000 deep everywhere; a rule `right-to-left {first} | {others} => …` hangs (a `|` in
  the body after `=>` is taken as the names').

## Language support in the library

- **`String.plural`/`singular` only know English's trailing "s"** (String.ray): a word's plural and singular should come
  from Unicode's (CLDR) plural rules for the language it is written in, not from its last letter. Kept until then.
- **A member a value does not have is read by its `[name]`** (OS.ray: `os.architecture` is `os["architecture"]`, OS.Ether
  ETH10): what has a `[property]` answers any member it lacks by it, so no delegating member is declared
  (`architecture => this["architecture"]`). The miss is said by the engine now ("nothing in what it is read on reads `x`").
- **`!` before any method answering a boolean is its negation** (`a !~= b`, `a !== b`, `a !&& b`, `!exists`): one rule,
  `{a} ![x] {b} => !(a [x] b)`, and the spelled-out duplicates go (`!~=` in the entrypoint and Node.ray, `!==`, Number's
  `!&&`/`!||`, Node.ray's `!exists | ∄`). Waits for operator holes, which the kernel has off (`rule_`: `0 && operator_holes`).
- **A slice by an open range reads nothing** (Ray.ray SL1-SL8: `xs[1..]`, `xs[..<-1]`, `xs[-2..]`, `xs[2..] = 0`): `1..`
  is the unbounded `1 -> 1` and `..<-1` the backward `-1 <- -2`, so `[range: Range]` walks past the end. A range in `[ ]`
  should be counted from the end below zero and stop at it, read and written by the one `[range: Range]`.
- **`~=` is a search loop written by hand** (Node.ray `read_within`): finding a pattern in a text should be the text read
  as `(skipped: *, found: pattern, *)` (`⊢ p` as `(found: p, *)`, `p ⊣` as `(*, found: p)`), the shortest first. Reading a
  text `as` such a structure does not find what is inside it yet (tried: PM1, PM3, S127, W15 and String's `contains`,
  `ends_with`, `words` fail, and one test runs out of memory).
- **`"Ray" @ loc` is not a text placed there (UI230)**: `@ (location) => this ~~ (.location |= location)` had three faults.
  (1) `copy` answered nothing (since .ray3): now Node's `copy` (a fresh node given the value's, its `of` kept), NOD91/92.
  (2) `|=` had no rule, so `.location |= v` was read as a superposition and the Location's members joined the text (its `of`
  both String and Location): now `{name} |= {value} => {name} := either_of({name})(value)` (with `=` it reads itself again
  forever: `=` keeps the code, and `|`'s holes are code). (3) Code in `x ~~ ( … )` is read in x: the parameter `location` was
  the text's own `location` field (renamed `placed_at`). Still open: on a text, `.location = v` sets nothing (`:=` does), a name
  from where `~~ ( … )` is written (`loc`) is not found in a text (in an instance it is), and `.m` in a rule's hole
  (`.location |= 5` through the `|=` rule) is not the `~~` block's. `"W" @ 5` without brackets does not call the method. `@` now sets `.location :=` itself (`|=`'s `.m` is not the block's): `"Ray" @ (6)` is placed,
  a String; given a Location (`"Ray" @ (l)`, l `@https://orbitmines.com`), (that was a probe named `p`, UI's `p {amount} {spaced}`
  padding keyword reading it). What remains: a URL is not read as a Location, `"https://orbitmines.com" as Location` is None
  (Location.ray's header structure, read by `read_as`/`read_into`), so `@https://…` is no Location and Scene's `placed`
  (`.location is Location`) does not take it. Why: a text is no `Char[]` (`"a"[0] is Char`, but
  `"a" is Char` and `"abc" is Char[]` are false; `Char.Word[]`, a superposition of ranges, reads), and Location's header is
  `Char{…}[]`s. Tried: Char a range of every character (`"\0".."\u{10FFFF}"`: enumerated, 6000 deep); Char `is_range` with
  `one_same` true (`"a" is Char` holds, `Char[]` still reads nothing, `{!= ":"}` not checked, every character a range).
  Also: a field holding None is not a place (`t.marked = 5`: "a left side answers a value, not a place"), and at a file's top
  level `u := x ~~ (.m = v)` sets nothing (as a statement it does).
- **`Program(…): T` is no Program answering T** (Choice.ray `choose {type} => Program(name: "choose"): type`; UI239, UI270, CN8):
  `{x}: {type} => external unset x type` takes any left side as a place, so `(Program(name: "choose"): String).name` is unset
  and it is no Choice; Program's `returns` (Program.ray, "`Program(…): T`") is never given. Tried: a rule
  `{typed_program: Program}: {program_returns}` (setting `returns`): it never fires, in a statement, a function's body or
  brackets (the typed hole does not take `Program(…)` written; an untyped one would replace every `x: T`). Nor `{p: *{. is Program}}: {r}`
  or `{c}({args}): {r}`, as a block's statement either: `X(…): T` is a declared call place before any rule reads it (the
  kernel's left side, as with header defaults), and `:` outside brackets binds looser than `=>` (`choose {type} => P: type`
  types the rule), in brackets `name: v` is a named part.
- **A choice inside a list takes the rest of the list** (found by ray-61 bisecting Shape's header): `[1, true ? 1 : 2, 3]` is
  two parts, `[true ? 1 : 2, 3]` and `[1, (true ? 1 : 2), 3]` are right. `,` reads its parts with no `,` in them, so the
  rest after the first `,` is read by `c ? a : b`, its `b` taking `2, 3`. Shape's `boundary: Shape = … ? … : box(size), flow: …`
  takes every field after it (given `content:`, only fields 1–8 hold, so Box has no size). Tried: a rule
  `{condition} ? {yes} : {no}, {rest} => ((condition) ? yes : no), rest` (worse: `[1, false ? 1 : 2, 3][1]` no longer 2).
