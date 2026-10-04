# Known bugs (collected 2026-10-04, for later)

Everything written after 2026-10-04 ~21:00 is unverified. Whether the library still boots is the first thing to check.

## Engine (src/language)
- **B1 Multi-parameter binding and outer names.** In a list of several parameters, a name that already exists outside is read as its value, so it is never declared. `alpha := 7; fa (alpha, shown) => alpha; fa(5, 1)` gives 7. A single parameter is fine. A global `counted` breaks Number.Real.written (N131/N132), and a global `step` breaks digit reading.
- **B2 Class fields shadow parameters.** A method's parameter named like a field of its class reads the field (Time.as was renamed around it).
- **B3 Method order of an extended value.** `rules_made` is depth-first over `with`, so a value made by `chain` and then extended with String finds Chain's ancestors (Ray) before String. Overloads are worked around by preferring typed ones (d5c83fb). The fix is a linearisation where every class comes before its ancestors, but two attempts (extend first, reverse-postorder) broke enum member counts.
- **B4 (fixed in 61eb170)** An empty block in a branch. `if c { } else { … }` / `unless c { }` files `Unresolved result @.entrypoint.ray` (`result := inline (external ** block)` of nothing).
- **B5 (fixed for narrowings in 61eb170: `satisfies` defines the block as a method on the candidate)** `{p}` blocks and `.`. In `x{.letter}`, `satisfies` runs the block in its writing frame, so `.` is the caller's `this`, not the candidate (string.ray S40, A-C1).
- **B6 (fixed in 61eb170: a re-run define on its own scope takes the new closure)** Closure methods defined per target. `~~` defines `closure_entered` on its target, and `define` dedupes by head and site, so a second `~~` on the same value with another block reuses the first closure.
- **B7 (fixed in a9885cd: `as_character` adds Char to the hierarchy; `classes` caches only on the value itself)** Characters are not `instance_of(Char)`. `U+0061.instance_of(Char)` is false; String and Number are fine.
- **B8 Precedence takes `.` as an operator.** `{a} [x] {b} [y] {c}` can match Number's `.{fraction}` as `[x]`.
- **B9 A function returning a local returns a reference into its finished frame.**
- **B10 Glued unit literals never apply.** `1m` as `{unit: Unit}`: a class rule that starts with a capture only applies to its own class.
- **B11 (changed in 052e774: that branch now checks `subtype_of` and errors, it no longer mutates)** `as (other: Unit)` with a class argument goes through `:`'s `hierarchy &= type` branch, so `Hour as boolean` makes boolean a Unit.
- **B13 An escaped quote ends a string literal.** `"a\"b"`: the raw `"{literal text}"` capture stops at the first `"`, so `String.unescaped` never sees `\"`.
- **B14 A guard naming a class that is not defined yet passes.** `as (=== String)` written in the entrypoint beside `as (=== boolean)`: while booting `String` is unresolved, the guard reads as satisfied, and every `cond as boolean` ran the String version (removed in 9d69519).
- **B15 A post-binding type check recurses.** Re-running a method's typed parameters after binding, or checking `instance_of` in `:` for an instance, loops: `instance_of` calls methods with typed parameters, which check again (`This keeps applying itself` at the method rule). Both reverted; the parameter type check is still open.
- **B16 A multi-line `unless … { } else { }` reads the else block where the method's parameters are not visible** (`Unresolved type` in `instance_of`).
- **B17 A bare name is `this.name` before a capture or local of the same name.** Adding Node `fields` broke Unicode's `fields :=` locals and the enum rules' `{fields}` capture (renamed to `columns`, `given_fields`).
- **B18 A catch-all operator filter hijacks arithmetic.** precedence.ray's `minus` class requires nothing, so `[takes: minus]` admits every operator; since 1dd1bdd (a filtered operator rule that reads further wins) the test's own rule takes `1 + 2 + 3` (PR12, PR23, PR25, PR26, PR32). Needs G3.11 answered.
- **B19 A Program instance's `()` runs the class constructor**, not Program's `({arguments})` (compiler.ray CO25).
- **B20 main at 1fecf3d runs out of 8 GB on honesty.ray with the whole library**; b395897 (before that merge) is clean.
- **B12 Regex recursion** exhausts 8 GB on a two-character pattern (X2.2).

- **B21 An anonymous function `(x) => x + 1` is not a value.** `{pattern} => {body}` reads `(x)` as a rule head instead; it collides with `({expr}) => expr` and a class's `({args})`. The user: it should just work.

- **B22 Longer filtered rules beat a value's own operator in general** (agent B's 1dd1bdd). Per the user this is what `chainable` is for: only rules over `chainable` operators should read past a value's own method. Narrow it, language-side through the modifier rather than in the engine.
- **B23 `&@` is not readable yet.** Access.ray's `Run` has `chain`/`first`/`last`; the `&@` spelling (the run's call chain, `&@.last` the actor, `&@.first` the origin) needs the `&` context prefix (U4) to reach it.

## Memory and time
- **M1 string.ray** runs out of the 8 GB heap around line 104 when run whole; every chunk passes on its own (except S40). The heap grows across the file.
- **M2 world.ray** lines 122–201 run out of memory even in 40-line chunks.
- **M3 roman.ray** runs out of memory with the full library; the RO66/67 loop alone takes ~300 s.
- **M4 feature.ray** `IO.read("…".bits)` costs ~2.7 s per character; program.ray ran in 282 s after d8dbd96 (constructing a Program no longer runs it).

- **M5 The whole library runs out of memory on honesty.ray** since the write-only round: clean at b395897 (agent B's branch), 8 GB OOM at 1fecf3d. The cause is in d5c83fb..1fecf3d (Text/World/Feature/Game/network/Geometry/UI). Suspects: top-level statements run at load (`World.ether = World(…)`, `Network.Hosts.equate(…)`, `Render.style(…)`, `Choice.chosen = …`, `UUID.v1.latest = 0`), class-body values built at load (`Unicode.EastAsianWidth := Unicode.Table(…)`), and field defaults naming their own class (`Onboarding.Purpose.everything` inside Onboarding). Bisect with whole-library honesty.ray runs at each merge.

## Tools and harness
- **T1 The harness misses enum member counts.** Breaking every enum's `components.count` left hall.sh "same". Add `Status.components.count == 9`.
- **T2 Reduced-library probes read characters wrongly.** With only Compiler/Ray/Number/String/Unicode, `U+0061 == U+000A` and every `"…"` is empty. Use the whole library.
- **T4 Two runs with the same tag share an output file**; run.sh deletes it at start, so parallel runs of one test report TIMEOUT.
- **T3 The EXPRS printer** runs out of memory on a bare boolean result; wrap it in `if (…) { \`yes\` } else { \`no\` }`.
