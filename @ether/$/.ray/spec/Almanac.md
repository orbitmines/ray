# Ray — What the Ether's Almanac says (`../orbitmines.com/orbitmines.com/src/routes/Almanac.tsx`)

The Almanac is the user's published description of the language. Treat what it states as
**decided**, unless an item below marks a conflict (**Open**) with v0, `Language.md` or the other
spec files. IDs `A…`. Answers go under **Decided** at the end.

---

## A1. Superposition and components (Almanac §2.1)

- `"A" | "B"`, `boolean == false | true`; every variable has `#`: `boolean#.count // 2`.
- `"A" & "B"` holds both at once. `(1 & 2) + 1 // 2 & 3`; `func(1 & 2) // 2 & 3`.
- `A + B`: combine, B overrides A (non-commutative): `("A" + true).next == false`.
- `A &+ B`, `A |+ B`: components superposed: `(true &+ "A").next == false & "B"`. (Answers T2.1.)
- `["A","B","C"].map(entry: + Ray => entry.index) // [0, 1, 2]`; without `+ Ray`,
  `entry.index` is the Unicode index. (L§1.5.)

## A2. Rays (Almanac §2.2)

- One structure, the Ray: vertex, initial and terminal boundaries; a boundary with no further
  boundaries is a dangling edge (a boundary of the structure).
- Array ⊂ Tree ⊂ Graph ⊂ Hypergraph by the kind of edges on the boundaries (structural, no class
  hierarchy): `Array ==.instance_of Hypergraph`; `x: Graph = [1, 2, 3]`.
- `,` is an operator that composes structures and accepts closures on the previous element:
  `1, +2, +3, +4 // 1, 3, 6, 10`. `,` is interchangeable with `&` and `|` (semantic decorators on
  the edge): `1 | +2 | +3 | +4 // 1 | 3 | 6 | 10`.
- `-1 <- x: "A" -> +1`, `-1 <- 0 -> +1` (the number line): a recursive chain from a base, each step
  from the previous one. (Corrected 2026-10-06 from the drafts review: this entry had the line the
  other way round, `+1 <- x: "A" -> -1`; the current Almanac, *Almanac.tsx:853–861*, writes
  `-1 <- x: "A" -> +1` and `-1 <- 0 -> +1`.)
- `("A" + numberline).next // "B"`; `"ABC".next // "A"`.
- `##` extracts components: `x## // == [string, equipped_structure]`; or by types:
  `string: String = x`.
- `.map` has the equipped Ray on each entry (`entry: + Ray`); `x: Number = [1, 2, 3]`,
  `x.map(entry => entry.index) // [1, 2, 3]`.
- A map with a filter (a lens): `[1, 2, 3].map{.index == 2}(*10) // [1, 2, 30]`.
- Mapping retains structure: `x: Graph = [false, false | true, true]`, `x.map(!) // true, true | false, false`.
- From the drafts review (2026-10-06), Almanac lines the entries above left out:
  - A recursively defined ray is indexed like any iterable: `(0 -> +2)[4] // 8` (*Almanac.tsx:864–867*).
  - Alternatives written with `|` while building a structure become separate branches:
    `x: Graph = [1, "2a" | "2b", 3]` (*Almanac.tsx:893–896*).

## A3. Locations and call by value (Almanac §3)

- **Always call by value.** `var = …` inside a function doesn't change the caller's variable.
- `var @ <- = X`: update it in the whole call stack that led here and in its own context.
  `update(var @ <-: Example)`: the same, on the parameter.
- `var @ -> = X`: in any thread the variable was given to.
- `var @ &caller = X`: only the caller's context.
- `var @ * = X`: every location (remote, database, mirror).
- Answers T7.1/T7.3 and G4.5's `@ <-` / `@ ->` / `@ *`.

## A4. Numbers and loops (Almanac §2.3)

- `(0 -> +1) ~{< 10} for i => …`; `(->) ~{index < 10} for => …` (`.index` available); `10.times => …`.
- Integer parts are bounded by default; `Binary.Unbounded` for an unbounded one. `100%` for decimals.

## A5. Types (Almanac §2.4, §2.5)

- `"A"[]`; `"A", "B", "B" ==.instance_of "A", "B"[]`; nesting with `["B"][]` vs `["B"[]]`.
- Spread: `first, middle: String[], last := "A", "B", "C", "D"`; `first, ...middle, last := …`;
  `middle: ...String`. `...` is alternative syntax for `[]`, allowed anywhere `[]` is.
- `x: Binary³² = Binary⁸[]⁴`; superscripts are `^`: `Binary^32 = Binary^8[]^4`. On a base type like
  Binary, `^` means length; once the base type is altered it means exponentiation:
  `Binary{== 1..4}² // == 2 | 4 | 8 | 16`.
- `x: 1 Number` = `Number{#.count == 1}`.
- `50% ("A" | "B" | "C" | "D")`, `1/2 Binary³²`, `0.5 "A" | "B"` (= `1 ("A" | "B")`).
- Variadics: a function has one argument, described structurally by its parameters in sequence:
  `varargs (a: String, b: Number[], c: String[])`, `varargs("a", 1, 2, 3, part, "c3")`. Ambiguities
  are handled as in types.

From the drafts review (2026-10-06).

- **A5b: a share of what doesn't divide.** *`.ray2/_todo/ray.ray.txt/Ether/instance/UI.ray:12–13`*:
  `Probability{!= 1} …` "How to say %, what to do in case of non-divisible". **Q.** Recommend (as
  Decided text): `p X` over n possibilities chooses `round(p * n)` of them; when `p * n` isn't whole it
  is the superposition of the floor and the ceiling, weighted by the remainder (`50%` of 3 is `1 | 2`,
  half each). (Also U8.)

## A6. Equality (Almanac §2.6)

- `"ABC" == "A", "B", "C"`; `x: String = "A", "B", "C"`.

## A7. Classes and enums (Almanac §2.7)

- Classes and namespaces are library, not primitives; the body is the default constructor.
- Whatever doesn't depend on the instance (`static Var := 5`, `InnerClass := class {}`) is taken out
  of the constructor; `Var += 1` stays in it. (Answers T3.9.)
- `class (x: String) => single_line`, `class (x: String) { … }`; fields are named constructor args:
  `Example("X", y: "Y")`.
- Separate constructors by overriding the static constructor: `static (a: String) { super(property: a) }`;
  without `super` in it, the default one runs first. (Answers T3.3.)
- `ExampleEnum := enum A | B | C(: String)`, equivalently `ExampleEnum: A | B | C = class { A := class {} … }`.
- `x.match` with `A => 1`, `var: B => var * 2`, `C("A") => 3`, `C<var: "B"> => 4`, `C(var) => var * 5`, `C => 6`.

## A8. Syntax and punctuation (Almanac §4.1)

- Parentheses anywhere have a valid meaning: `var (condition ? == : <=) 5`;
  `Unicode.GeneralCategory.(Punctuation | Symbol)`. Parentheses are always a closure with the accessed
  variable loaded into its context.
- After a superposition, a space goes to its type or method: `A | B : String`, `A | B .method`,
  `A | B {length == 2}`.
- A space may replace `.` for any property: `"A" lowercase`; so
  `(0 -> +2) ~{< 10} for i =>`.
- `--` wraps the whole line before it: `1, 2 -- .map(+1) // 2, 3`; after newlines, with `if`:
  `-- .embed_ipv4 if ==.instance_of "::ffff:0.0.0.0/96"`.
- `~~` does the same but returns the original: `secure Binary⁴⁷.random ~~ .[6].push_after(1)`.

## A9. Choice (Almanac §4.7)

- `[1, 2, 3].map{choose 1}(*10) // [10, 2, 3] | [1, 20, 3] | [1, 2, 30]`; `Number{choose 5}`;
  `choose 1 Number`; `choose 50% (…)`; `func(choose, choose)`.
- `choose` uses `===`, but each location a variable is in is a separate variable, so
  `[1, var, var].map{choose 1}(*10) // [10, 2, 2] | [1, 20, 20]`.
- `unordered => choose Iterable{.every(this.contains(.)) && .count == count}`.
- `@me.choose String` forces the player to choose. (Answers W2.11.)

## A10. Self-modifying types (Almanac §6.1)

- Ray uses an adaptive grammar (self-modifying types); `` `{string: String}` => string ``.

---

## Conflicts to decide (Open)

- **A-C1 `~` as a filter.** The Almanac writes `(0 -> +1) ~{< 10} for i`. L§10.4 decided `~` is for
  entry points only, with filtering by `.filter` or a `{…}` narrowing.
- **A-C2 Spread spelling.** The Almanac: `...middle`. The drafts: `..middle` (`[first, ..middle, last]`).
- **A-C3 `.index` of a Number's entries.** The Almanac: `x.map(entry => entry.index) // [1, 2, 3]`
  (the number line index). L§1.4 decided `.index` counts from the origin (0-based).
- **A-C4 `,` interchangeable with `&`/`|`.** 2026-09-27 decided "`,` composes one value (no split)". Is
  `1 | +2 | +3` (closure steps with `|`) compatible?
- **A-C5 `--`.** Not in `Language.md`. It wraps the whole line before it (and conflicts with the spec
  plan's mention of `--` "beside `;` and `~~`").

From the drafts review (2026-10-06).

- **A-C6 Super/subscript on a type: length or count.** A5: on a base type `^` "means length"
  (`Binary³²`). `.ray2/Ray.ray:201–203` allows `Binary₃₂ = Binary₈[]₄` and "uses count instead of
  length", since `Graph²²²` reads better as the size of the graph than as each path's length; the
  standing directive is length ≠ count. **Q.** Recommend following the draft: a type's
  super/subscript constrains `.count` (the size), which equals the length for chains; `Graph²²²` is a
  graph of 222 vertices.
  **Answered (user, 2026-10-06):** length, as A5 says; counted types are `#.count`.
- **A-C7 `never` against `Never`.** The Almanac writes `forever (): never => loop { }`
  (*Almanac.tsx:1299*); L§4.1 decides `=> Never` as the type and `never` as the keyword. **Q.**
  Recommend accepting both: `never` in a type position reads as `Never`, as `boolean` names a type.
  **Answered (user, 2026-10-06):** `never`, as the Almanac writes it; L§4.1's `Never` is renamed.
- **A-C8 Version range spelling.** The Almanac writes `title %1..5: String` (*Almanac.tsx:1641*);
  L§7.2 decides the suffix `field %1..5`; the 2026-10-05 answer (Language.md, `%`) reads `%` followed
  by a number as modulo and spells ranges `%[1..5]`. **Q.** Recommend keeping the 2026-10-05 answer
  (`field %[1..5]`), rewriting L§7.2, and updating the Almanac line.
  **Answered (user, 2026-10-06):** `%[1..5]` (L§7.2.1).

---

## Decided

Answers from 2026-09-30.

- **A-C1** `{p}` is type-directed. If `p` makes sense for the structure itself, `x{p}` narrows the
  whole: `xs{.count < 5}`. Otherwise it applies to the entries, written explicitly
  `xs[{p}]` (a filter inside `[]` is on the entries), so `(0 -> +1){< 10}` filters the entries.
  `this{p}` forces the whole. The Almanac's `~{< 10}` is rewritten to `{< 10}`; `~` stays entry
  points only.
- **A-C2** The spread is `...` (`first, ...middle, last`); `..` stays ranges.
- **A-C3** Without `+ Ray`, `.index` is the entry's own structure (a number's place on its line, a
  character's codepoint); with `+ Ray` it is the position in the list, counted from the origin.
  L§1.4 applies to the `+ Ray` case.
- **A7 enums (2026-10-02)** An enum member has no `name` field: it is named by where it is written (its
  location), and two members are equal only when they are the same one (`==` is `external where` of
  each, `ep` enum member `==`). Both `X := enum a | b` (brace-less) and `enum a | b { … }` register their
  members (`ep` `enum` rules). The `C(: String)` member with fields is unchanged.
- **A-C5** `--` and `~~` as the Almanac says: `--` continues on the result of everything before it
  on the line (also after a newline, optionally with `if`); `~~` does the same but returns the
  original.
- **A-C3 (updated 2026-10-04, from the current Almanac):** `.index` is the position by default (`["A", "B", "C"].map(entry => entry.index)` is `[0, 1, 2]`); `entry: - Ray` excludes the Ray, and `.index` is then the entry's own (a character's code point, a number's value). This reverses the 2026-09-30 answer's `+ Ray`.
