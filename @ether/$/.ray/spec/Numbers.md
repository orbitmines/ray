# Ray — Numbers, units, time spec (from the comments in `Number.ray`, `Unit.ray`, `Roman.ray`, `Time.ray`, `boolean.ray`)

Status legend: **Decided** · **Open** · **See L§n**.
IDs `N…`. Answers go under **Decided** at the end.

---

## N1. Number (*Number.ray*)

- **N1.1 Naming** — *Number:21–22*: "Perhaps switch `.Positive` and `Base`; what do you call one with a sign?
  Rename to `.Signed`." v0 has `Base`, `Signed`, `Real`. Open: is `Base.Positive` gone for good?
- **N1.2 ∞ and `Nat∞`** — *Number:1, 50, 599, 629*: `count` of an unbounded walk is ∞; `N∞`; ∞ as a looped
  integer (R5.2). Open: is ∞ a value of Number or the terminal reference (R4.3)?
- **N1.3 Units as transfinite** — *Number:24*: `1m > Infinity`, but not `Infinity m`.
- **N1.4 Reals** — *Number:386–392*: `Real < integer, ".", fraction: Base{unbounded}`; rational when the fraction
  is finite or repeating. Repeating fractions and irrationals await infinite chains (L§10.2).
- **N1.5 Negation of a number** — *Number:102–104*: `0.not` holds; bitwise negation waits on a known width.
- **N1.6 Overflow** — *Number:12, 622–624*: overflow for fixed widths: mod, or error? Casts lose information.
- **N1.7 `u8`/`i8`** — *Number:540–543*: `u{n}` = `Binary.Positive{.length == n}`; `i{n}`.
- **N1.8 `USize` by architecture** — *Number:14–15*: how to get the architecture conditionally (L§10.2).
- **N1.9 Automatic isomorphisms** — *Number:27, 611–612*: `Real.Positive → Real`, `Base → Base.Signed`;
  `String ↔ Binary.Positive`.
- **N1.10 Binary as boolean** — *Number:29*: `Binary{length == 1} == boolean`.
- **N1.11 Bit-string operations** — *Number:26*: `"01101010" ~|| "10101000"` and `0101010 ~|| 1010010` both work.
- **N1.12 Sub/superscripts** — *Number:581–593; ep:1743*: `1111₂⁸` (base and length), `1⁽¹⁸⁸⁻⁰⁰⁾` to `^`, `(111₂)₂`,
  `v (base)`; subscript is also used for length. The journal: written `v[…]` and `^[…]`, the editor shows them.
  L§10.1 (engine, Unicode decomposition).
- **N1.13 `∑ ∏ √ ∛ ∫ lim`** — *Number:524–535, 594–598*: `∑ [1, 2, 3]`; `₂∫⁸()`; `lim(x -> ∞)`; "what is a limit,
  more generally?". L§10.1.
- **N1.14 Factorial** — *Number:19*: `!` postfix. Conflicts with `f!` = inverse (L§4.5). Open.
- **N1.15 Leading zeros** — *Number:637*: equivalent to the number.
- **N1.16 Complex numbers** — *Number:7*: as `&+`?
- **N1.17 A step function for Real** — *Number:17*: `for` over a Real needs a step.
- **N1.18 Generic Number / NumberLine** — *Number:628, 630*: a generic Number interface; `>`/`<` from a "NumberLine"
  interface; an external may define `>` directly instead of walking.
- **N1.19 Context of the base** — *Number:616*: "Should not always go to Decimal; infer from context whether it is binary."
- **N1.20 Refinement** — *Number:639–642*: a number refined to 64 bits is other code, equivalent where the
  refinement holds (L§3.3).

## N2. Units (*Unit.ray*)

- **N2.1 Literal syntax** — `1m`, `1.0m`, `1 m`, `1.m`, `1.0 m`, `1.0.m`, `1 of Byte`. Which of these?
- **N2.2 Compound quantities** — `1d 10h 10m 30s` (largest to smallest, required?); `10000000s as days hours minutes seconds`;
  `~~ normalizer = days hours minutes seconds`.
- **N2.3 Rates** — `1 / m`, `1 per m`, `2/10m`, `GB/s`.
- **N2.4 Ambiguous names** — `8m` is meter or minute: "at least one unambiguous name must be defined"; stringify with an
  unambiguous one.
- **N2.5 SI prefixes** — the full table q…Q, built on demand; negative powers wait on reals.
- **N2.6 Binary prefixes** — `KB = 1000 B`, `KiB = 1024 B`, `MB`, `MiB`; `1k/1M/1B` counts (*ep:1450*).
- **N2.7 Reversible conversions** — automatic reverses of offset/multiple/magnitude if reversible.
- **N2.8 Move to geometry** — *Unit:211*: "Move to a geometry file?" (Frontend F-B5 uses Unit.ray units.)

## N3. Roman (*Roman.ray*)

- **N3.1 Forms** — Standard (1..3999), Additive (IIII), Vinculum (overlines), Apostrophus, the Unicode Number Forms, fractions
  in twelfths. v0 has Standard + Number Forms. Open: order, and is Additive a separate class or a normalizer?

## N4. Time (*Time.ray*)

- **N4.1 The clock** — `time` as nanosecond digits; `now`. How does lazy evaluation treat `Time.now` (*Time:216*)?
- **N4.2 Calendars** — a chain of segments; Gregorian < Julian; the 1582 equivalence; UTC with an offset; GMT; other
  calendars (Islamic, Hebrew, Coptic, Solar Hijri, Bengali).
- **N4.3 `12:00`** — *Time:22, 209–217*: `12:00` read by ISO 8601; day/month/year unknown, and stringified back as `12:00`.
  (`:` stays the annotation.)
- **N4.4 Context for month length** — *Time:225*: `&Time.YEAR`, `&Time.MONTH` as context values so `+1 month` works; this is
  `with` (L§6.3)?
- **N4.5 Epochs** — *Time:198, 215, 222, 224*: keep epoch structure across calendar conversion; `"2025-01-01", epoch: "2000-01-01"`
  gives `25.years`; summing across epochs.
- **N4.6 tzdata** — needs `io` + unzip; mirrored directory until then.
- **N4.7 Leap seconds** — a minute may be 61 seconds; `Time.MINUTE` context marks a possible leap second.
- **N4.8 Monotonic clocks** — *Time:239*: a time correction jumps; two `now`s in a row should jump with it.
- **N4.9 Astronomy** — sidereal time, TT, TAI, TCB, TCG; days from spin, years from orbit; Mars (sol, 668.5991 sols).
- **N4.10 Corrections** — *Time:229*: how to mark a value as possibly up for correction.
- **N4.11 `.round(seconds)`**, calendar none (just a temporal Quantity), `Calendar#` = all calendars.
- **N4.12 Termination is temporal** — *Time:371–375*: each step must take finite time; a function drawn as an animation of itself.

## N5. boolean (*boolean.ray*)

- **N5.1 Operator classes** — Unary, Binary read off a method's parameter count; extracting boolean's operators into a
  default metaprogramming class.
- **N5.2 Casts to filters** — a boolean cast to a filter.
- **N5.3 `boolean.orbit`** — boolean has an orbit equipped (true → false → true).
- **N5.4 Ternary as a rule** — `def * {b} * {c}` matching `a * b * c`, "almost `def *(b, c)` but assumes structure on the edges".
- **N5.5 Removing `exists`** — **Open** (2026-10-02): the remaining `exists` uses in `ep` and the library
  (`unless (exists …)`, `while (exists …)`, …) are to go, per N5.6.

---

## Decided

Answers from 2026-09-30.

- **N5.6 (2026-10-02)** `exists` should not be needed: a value used as a condition evaluates as a boolean
  by itself (truthiness), and a missing member reads as nothing (None, T1.2), which is false.

- **N1.1** Names: `Decimal` (the naturals in that base), `Decimal.Signed`, `Decimal.Real`,
  `Decimal.Real.Signed`. No `.Positive`.
- **N1.2** ∞ is the terminal reference of an unbounded ray (`Ray.md` R5.2).
- **N1.6** No overflow: `u8 + u8` is a wider number, and assigning it back to a `u8` fails the type
  unless `.mod`/`.saturate` is written. Wrapping belongs to a target language's level.
- **N1.14** `!` postfix by type: on a Number it is factorial; on a function, the inverse (L§4.5).
- **N1.8** The target is a **Language** (not "Target"), which is a Compiler level carrying values:
  ```
  Language.x86_64 := Language(word_size: 64) + Compiler.level { … }
  USize := Binary{length == &language.word_size}
  program: Program{O: Compiler.default + Language.x86_64}
  ```
  Without one, `word_size` is `?`, so `USize` is `u8 | u16 | u32 | u64` and code is checked against
  every one. This joins the language setup of P7.
- **N1.12** Humans write `^8` / `v 2`; the editor *forces* them into superscript/subscript by default
  (a `force` equivalence, G7.1). The force can be turned off per rewrite rule. The file may hold
  either spelling.
- **N2.1** Unit literals: `1m`, `1.5m`, `1 m`, `1.5 m`. Not `1.m`; `1 of m` goes.
- **N2.4** An ambiguous unit superposes and is resolved by use: `8m` is `8 meter | 8 minute`;
  printing uses an unambiguous name.
- **N2.2** Juxtaposed quantities must go from largest to smallest (`1d 10h 10m 30s`); another order is an
  error.
- **N3.1** Additive Roman numerals (IIII) are a normalizer, not a class: reading accepts both, writing
  uses the Standard form unless `with Roman.normalizer = Additive`.
- **N4.4** `Time.YEAR` and `Time.MONTH` are plain context values, changed with `with Time.YEAR = X`
  (no `&`).
- **N4.3** `12:00` has an unknown (`?`) date: a time of day on every day. Printing omits the unknown parts.
- **N4.1** `Time.now` is read when first forced and then fixed for that variable. Its reads are
  nondeterministic (never cached or folded); `dynamically now` stays current.
- **N4.2** Gregorian, Julian and UTC first; the other calendars later.
- **N5.1** Operator classes are structural: a Binary operator is a method type with one parameter
  (`Node{(other) => *}`). Nothing is declared.
- **N5.3** boolean has its orbit: `true.next == false`, `false.next == true`.
- **N1.4** Reals now, lazily: a fraction is a possibly unbounded ray of digits computed on demand
  (`√2` is a generator), so repeating fractions and irrationals are real.
- **N1.13** All of them: `∑ ∏`, `√ ∛ ∜`, `∫ lim`.
- **N1.16** Complex numbers are components: `Complex := Real + Imaginary`, with `i` a unit (`a + b i`).
- **N1.11** Bitwise operations work on bit strings and binary numbers alike (`"0110" ~|| "1010"`,
  `0110 ~|| 1010`), via the String ↔ Binary isomorphism.
- **N1.9** When `A as B` and `B as A` both exist and round-trip, that is an isomorphism, and the equivalence
  graph (U9) uses it automatically.
- **N1.17** A Real has no default step: `for` over reals needs one, `(0.0 -> +0.1)`.
- **N1.18** Native `<`/`>` on numbers is a rewrite, either in `Compiler.ray` or, when it is
  platform/interpreter-specific, in `v0.ts.o.ray`. No new external.
- **N1.19** A number without a base is read by the context's type (`x: Binary = 101` is binary); with no
  context it is Decimal.
- **N4.5** Epochs now: `"2025-01-01"` with `epoch: "2000-01-01"` is `25.years`, and calendar conversions
  keep the epoch structure.
- **N4.6/N4.7** tzdata and leap seconds now, read through IO (the byte stream); a minute may be 61 s.
- **N4.9** Astronomy later; Mars's sol and year stay as they are.
- **N4.10** A value that may be corrected carries an uncertainty: `now` is a distribution (U8) around the
  reading, and a correction narrows it.
- **N1.3** Quantities don't compare with plain numbers: `1m > ∞` is a type error, not true.
- **N1.5** `0.not` holds, any other number's `.not` doesn't; bitwise NOT waits on a known width (N1.7).
- **N1.7** `u{n}` and `i{n}` are rules: `u8 = Binary⁸`, `i8 = Binary⁸.Signed`.
- **N1.10** `Binary{length == 1}` and boolean are isomorphic (via `as` both ways, N1.9).
- **N1.15** Leading zeros are equivalent (`007 == 7`); a fixed-width type keeps them when printing.
- **N2.3** Rates are written `GB/s`, `1 / m` and `2/10m`; `per` is not used.
- **N2.5/N2.6** All SI prefixes (q…Q), the binary prefixes (KiB, MiB, …) and the `1k`/`1M`/`1B` counts, now.
- **N1.20** A refined number (64 bits, say) runs through a Language level that rewrites Number operations to
  native ones when the type proves the width.
- **N2.7** Unit conversions (offset, multiple, magnitude) are reversed automatically when reversible.
- **N2.8** `Unit.ray` stays in the core library; Geometry depends on it.
- **N4.8** When the clock is corrected, times read since jump with it; together with N4.10, the correction
  narrows the uncertainty.
- **N4.11** `.round(seconds)`, a Time with no calendar (just a temporal Quantity), and `Calendar#` for all
  calendars are all kept.
- **N4.12** Drawing a function as an animation of itself (its `**` history) is UI work, later.
- **N5.2** A boolean is a filter: a narrowing's body is a boolean (`xs{true}` keeps everything).
- **N5.4** Rules with two operators (`def * {b} * {c}` matching `a * b * c`) are the general mechanism, as
  `?:` already is.


Also: infinity symbol after array is an alias of .unbounded so 3[]∞ means unbounded number of 3's.
### Answers 2026-10-04 evening
- **N2.1** `of` is gone (`1 of m` was never kept). Quantities are written `1m`, `1 m`, or as rates `1 / m`; library code builds computed ones with `Quantity(amount:, unit:)`.
- **N2.1b** Units are reachable as members: `25.years`, `(30).days` (`.{unit: Unit}` on numbers).
- **N1.12** `^` as power overrides the style marker on numbers (`right-to-left compounds ^`). Styling may get another spelling later.
