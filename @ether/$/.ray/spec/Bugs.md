# Known bugs (collected 2026-10-04, for later)

Everything written after 2026-10-04 ~21:00 is unverified. Whether the library still boots is the first thing to check.

## Engine (src/language)
- **B1 Multi-parameter binding and outer names.** In a list of several parameters, a name that already exists outside is read as its value, so it is never declared. `alpha := 7; fa (alpha, shown) => alpha; fa(5, 1)` gives 7. A single parameter is fine. A global `counted` breaks Number.Real.written (N131/N132), and a global `step` breaks digit reading.
- **B2 Class fields shadow parameters.** A method's parameter named like a field of its class reads the field (Time.as was renamed around it).
- **B3 Method order of an extended value.** `rules_made` is depth-first over `with`, so a value made by `chain` and then extended with String finds Chain's ancestors (Ray) before String. Overloads are worked around by preferring typed ones (d5c83fb). The fix is a linearisation where every class comes before its ancestors, but two attempts (extend first, reverse-postorder) broke enum member counts.
- **B4 An empty block in a branch.** `if c { } else { … }` / `unless c { }` files `Unresolved result @.entrypoint.ray` (`result := inline (external ** block)` of nothing).
- **B5 `{p}` blocks and `.`.** In `x{.letter}`, `satisfies` runs the block in its writing frame, so `.` is the caller's `this`, not the candidate (string.ray S40, A-C1).
- **B6 Closure methods defined per target.** `~~` defines `closure_entered` on its target, and `define` dedupes by head and site, so a second `~~` on the same value with another block reuses the first closure.
- **B7 Characters are not `instance_of(Char)`.** `U+0061.instance_of(Char)` is false; String and Number are fine.
- **B8 Precedence takes `.` as an operator.** `{a} [x] {b} [y] {c}` can match Number's `.{fraction}` as `[x]`.
- **B9 A function returning a local returns a reference into its finished frame.**
- **B10 Glued unit literals never apply.** `1m` as `{unit: Unit}`: a class rule that starts with a capture only applies to its own class.
- **B11 `as (other: Unit)` with a class argument** goes through `:`'s `hierarchy &= type` branch, so `Hour as boolean` makes boolean a Unit.
- **B12 Regex recursion** exhausts 8 GB on a two-character pattern (X2.2).

## Memory and time
- **M1 string.ray** runs out of the 8 GB heap around line 104 when run whole; every chunk passes on its own (except S40). The heap grows across the file.
- **M2 world.ray** lines 122–201 run out of memory even in 40-line chunks.
- **M3 roman.ray** runs out of memory with the full library; the RO66/67 loop alone takes ~300 s.
- **M4 feature.ray** `IO.read("…".bits)` costs ~2.7 s per character; program.ray times out.

## Tools and harness
- **T1 The harness misses enum member counts.** Breaking every enum's `components.count` left hall.sh "same". Add `Status.components.count == 9`.
- **T2 Reduced-library probes read characters wrongly.** With only Compiler/Ray/Number/String/Unicode, `U+0061 == U+000A` and every `"…"` is empty. Use the whole library.
- **T3 The EXPRS printer** runs out of memory on a bare boolean result; wrap it in `if (…) { \`yes\` } else { \`no\` }`.
