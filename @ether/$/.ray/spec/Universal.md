# Ray — What "Towards a Universal Language" (2025) says

Source: `../orbitmines.com/orbitmines.com/src/routes/archive/2025.TowardsAUniversalLanguage.tsx`
(orbitmines.com/archive/towards-a-universal-language). The user: "it contains more information, but
also some deprecated ideas". So every item is **Open** (keep or deprecated?) until answered.
IDs `U…`. Answers go under **Decided** at the end.

---

## U1. Every variable is Many

- `s (x: boolean) => x ? "Y" : "N"`; `s(false & true) // "Y" & "N"`; `s(boolean) // "Y" | "N"`.
- Superposed methods: `true (|| | &&) false // (true || false) | (true && false)`.
- Aliases and multimethods: `a | a1 (: boolean) => "X"`, `a | a2 (: Number) => "Y"`; `a` is `a1 & a2`.
- Several implementations of one method: `!{.} | this !&& this | this !|| this | this x|| true | this x!|| false`;
  the compiler picks one (P8.4).
- `"A", ("B" | "C") // "AB" | "AC"`.
- `x#`, `x#.count == 2`.

## U2. Every variable is a Ray

- A vertex, boundaries, edges; each place holds many Rays; a ray expands and collapses to show or hide
  structure (grouping), also "the same thing on another level of description".

## U3. Every variable is a Type

- `Binary{length == 2}`; `class Example < Binary` + `dynamically assert length == 2`.
- The IPv6 class as a pattern: `(left: Segment[]).join(":")?, zero_compression: "::" (? if !defined_segments.empty), …`.

## U4. Every variable is a lazy program

- `Program.Terminating` = `Program{expanded.length#.every != ∞}`.
- Labels: `label1\ A (label2\ + B)`; `label2` is a program pointer.
- `&next`: the current function's next step, via `&`.
- `goto (program: Program) &caller.push(program)`.
- `variable**`: the program still to run to fill it, with intermediate results.

## U5. Every variable holds a history

- `variable%` is a Commit. `class Branch < Program; static Version | Commit = State`.
- `var = A, B, C = "ABC"; B = "2" // var == "A2C"; C = "3" // var == "A23"`.
- `B% == "B", \"2"\`: a ray with `"2"` *selected* (`\…\` marks the selection).
- `var% == B%, \C%\`: a repository orders nested histories.
- A spatial change (adding a character to a string) is history on an edge, not a vertex.
- Keystroke history is a branch off the current branch.

## U6. Access permissions (player-level)

- `internal variable` = `Node{==.instance_of Example} variable`.
- `@public`, `@local` (this character, this machine), `@localhost` (characters on the same machine),
  `@private` (this character anywhere, incl. the central server), `@private.managed` (only your own
  servers), `confidential` (defaults by privacy policy: `@local`).
- `.read`, `.write`, `.execute`: `@public.read @public.execute API_METHOD`;
  `@public.read NUMBER = 0` with `@public.execute += (== 1)` (only +1 exposed); write = execute `=`.

## U7. Every variable has a location

- Location is a modifier on another structure (a function, a remote host, yaw/pitch, a subgraph, a path of landmarks).
  Each file is both a directory and a file with values.
- Packages: `< @ether/.ts`, `< @"https://orbitmines.com"/package`, `< @ether/package <&UUID>` (a version).
- `@"orbitmines.com"` is reserved for that domain, default port 37839.
- `@ether.@USERNAME = @me` registers a name; `@me.status = Hosted`, `Online & Hosted`, `Online & Broadcast`;
  Offline by default.
- Sharding: `"A1", "A2" @ @me.managed, "A3" @ @ether, "A4" @ @"192.168.1.254"`.

## U8. Probability

- Uniform by default: `("A" | "B")#.random` is 50% each.
- `x: String? = 0.2("A") | 0.5("B")`, or the block form `0.2 => "A"` / `0.5 => "B"`; what isn't covered is None
  (only if optional).
- Nested `0.5(0.5("A") | 0.5("B")) | "C"`; `&` is not weighted: `0.5("A") & 0.5(…)` are two separate probabilities.
- Calls keep weights: `n 0.3("A") | 0.7("B") // 0.3(1) | 0.7(2)`.
- `Binary{-> .next == 0.5(?.random)}`; `?.random` makes a random instance of the current type (fails on
  infinitely generating types).
- `variable -> .parent`, `(variable -> .parent).last`.

## U9. Equality and equivalence

- `A == B` traverses an equivalence graph until one side rewrites into the other; the default graph uses `as`:
  `Node{== 1} as (== String) => "A"` gives `1 == "A"`.
- Structural by default: `Point(x: 0, y: 0) == Point(x: 0, y: 0)`.
- `A ==<in: -> convert(.)> B` (a given graph), `A ==<in: None> B` (none), `A ==<Number> B` (up to a type).
- `===` includes location: `2 === 2 // false`, `var === var // true`; `@me == @me @ @remote` but not `===`.
- `==.instance_of`, `==.isomorphic` (structure, ignoring values), `"12" ~= "0123"`, `"ABC" ~= ⊢"AB"`, `"BC"⊣`.
- Functions: `==.extensional` (resolves fast only for small types, otherwise a quest), `==.historical` (compare
  the calls made so far), intensional by default (control flow, `(2 + 2)** == (2 + 2)**`) at the target's
  level. Labels out of order: `A check\ ==.historical B`.

## U10. Quests and assumptions

- A quest is a function; its return value is the reward.
- `if assume graph.last` runs with the assumption and spawns a quest to resolve it; `else assume B()`.
- NPC modes: run until all quests are resolved, keep running and wait for more, or stop with unfinished ones;
  errors become quests.

## U11. Templating other languages

- `program = ⸨⸩.ts` then `const x: number = ⸨x⸩ * 2`; `program().x // 4`. Bindings so Ray's features reach
  into the other language; run its control flow as Ray.

## U12. Geometry

- `Point = Ray`, `Loop = Array.Unbounded.loop`,
  `class Circle { outline: Loop{map(to centre -- #.min.length).reduce(==)}, centre: Point, radius: outline to centre -- #.min.length }`.

---

## Conflicts to decide

- **U-C1 `0.5 X`.** The article: `0.2("A")` is a probability weight. The Almanac: `50% (…)`, `0.5 "A" | "B"` is
  choosing a fraction of the possibilities (`0.5 "A" | "B"` = `1 ("A" | "B")`).
- **U-C2 `\…\`.** The article uses `\"2"\` for a selection; labels are `name\`.
- **U-C3 `if assume`.** L§6.3 made `assume` an alias of `with`. The article's `if assume graph.last` is a
  speculative assumption (P5.4 `speculative.if`).

---

## Decided

Answers from 2026-09-30.

- **Kept:** U1–U10 and U12 stand as spec. "Mostly syntax things" may be deprecated, and those get
  checked against `Language.md`, `Almanac.md` and the decisions above whenever they conflict.
- **Dropped:** U11, the `⸨⸩` templating.
- **U-C1** A weight and a fraction are the same thing; the only difference is whether it is
  realised. `0.2("A") | 0.5("B")` is the distribution; `50% X` / `0.5 X` is the same, realised as
  a choice of that share.
- **U-C2** `\x\` (a backslash on both sides) selects; `name\` (trailing only) labels.
- **U-C3** `assume` is one concept: it overrides what something answers in a context (L§6.3's
  `with`). `if assume c` overrides `c` as true, and a quest verifies it (rolling back if wrong).
- **U11 replacement** The Unicode tables are read with class patterns, as UUID/IP are: a line
  format is a class, e.g. `Block < (first: CodePoint, "..", last: CodePoint, "; ", name: String)`,
  and `@"https://…/Blocks.txt" as Block[]`.
- **U8** The `?` in `?.random` is the same `?` as unknown (L§10.1, T1.6); `.random` realises one
  value of it.
- **U4** `&` prefixes members of the current context: `&caller`, `&next`, and `&entrypoint`
  (entrypoint is a function on Program). This corrects F-A1.
