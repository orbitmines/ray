# Implementation plan: the spec, the drafts' comments, and the frontend language

For: a Sonnet session working alone in this repository.
Written 2026-09-30. Sources: `spec/Language.md`, `spec/Gamification.md`, the `// spec:` marks,
`//TODO`s and commented draft code in `*.ray`, and the draft
`../orbitmines.com/orbitmines.com.ray/` (the frontend track, part F).

Paths are relative to `@ether/` unless they say otherwise. `ep` = `ray/.entrypoint.ray`.

---

## 0. Before anything: read these, in this order

1. The auto-memory index (`MEMORY.md`, loaded for you), then
   `feedback_standing_instructions.md`, `project_directives_0930.md`,
   `project_handoff_0930.md`, `feedback_selective_test_runs.md`, `project_fast_probe_loop.md`.
2. `spec/Language.md` from start to end. **Decided** is binding. **Proposed** is *not*
   decided: ask before implementing a Proposed item (see §2.3).
3. The spec files written from every comment in the library, and from the Almanac and the
   2025 article, each ending in a **Decided** section with the user's answers (2026-09-30).
   They are binding the same way `Language.md` is, and where they conflict with it the later
   answer wins (each file says so where it happens: e.g. T1.6 replaces L§4.3):
   `Grammar.md` (G), `Types.md` (T), `Program.md` (P), `Ray.md` (R), `Numbers.md` (N),
   `Text.md` (X), `World.md` (W), `Almanac.md` (A), `Universal.md` (U), `Frontend.md` (F).
   Items listed above a Decided section but not answered are **Open**: ask before building them.
4. `ep` in full (`.entrypoint.ray` — `*.ray` globs do not match it, so grep it by name).
5. The draft you are porting, before you port it. Port in the draft's own style.

## Principle from 2026-10-06: avoid creating IRs

Ray itself is the IR. Never put a sub-language or a vocabulary of record classes between a format and Ray (an
operation-kind enum, a `Revision`/`Line`/`Index` record, restricted body forms). A format reads straight into Ray values
(`History`, `Program`, Nodes) and writes them back, through class headers and Compiler levels. The user, on
`Version.ray`: version control exists to carry the full `.ray` language (L§9.2).

## Direction from 2026-10-02 (read first; it comes before the 2026-09-30 status below)

Decided on 2026-10-02 (recorded in L§1.2, T4.10, Almanac A7, P2.8, N5.6; open: N5.5, G3.11):

1. **Rule heads read in the language.** Node's GRAMMAR_RULE head type
   `` (String ^function | `{`, expr ^parameter, `}` | `[`, operator ^operator, `]`)[] `` (`ep:134`)
   reads rule heads with the type machinery of T4.10. Then the engine's head parsing (`read_head`,
   `pieces`, `tokens`, `grammar()`) is deleted; the engine keeps only the seed `=>` and
   `external rule`.
2. **Then compile.** A statement read once becomes a closure. Targets: the test suite in ~2 s,
   boot in milliseconds.
3. **Then the kernel goes to ~1000 lines**, with what it still does moved into `.ray`.

## Status at the end of 2026-09-30 (read before §3)

A session on 2026-09-30 did most of Phase 1 and part of Phase 2. **Nothing of it is committed.**
The tree as it was before that session is on branch `wip-0929` (commit `d0ec60e`, not on
`main`). Memory: `project_directives_0930.md`, `project_state_0930.md`.

### Done in the working tree (verified only on small probes)

- **Strings (Phase 2, directives of 2026-09-30).**
  - `Character := class: Unicode.Scalar`: a character *is* its codepoint.
  - `String := class: Array`: a string *is* its characters, and every method works on `this`.
  - String defines none of `==`, `entry`, `count`, `length`, `first`, `every`, `some`, `at` or
    `reverse`; it inherits them.
  - `"…"` is always a String (one character too), through `Node.as_string`: literal → UTF-8 →
    code points → `as_character` → chain `.as_string`.
  - Characters are written with the draft's `U+XXXX`; a string's character is `"a".head.value`.
  - `String.of`, `Character.of`, `.characters`, `.octets` bit helpers and the `ascii_*` names are
    gone from library and tests (rewritten mechanically; review `tests/app/string.ray`).
- **Unicode.ray in the draft's structure.**
  - `CodePoint`, `Scalar` (the draft's assertion as a question), `TF`, and `UTF8`/`UTF16`/`UTF32`
    below `TF`.
  - `code_points (source)` is the UTF-8 walk. It is a plain function, not a method, so the digit
    reader never goes through `.` member access.
  - `U+{codepoint: Hexadecimal}` reads a character.
- **Number.ray.**
  - `digit_of (point)`, and `digits_spelled`, a byte reader that stops at the first non-digit.
  - The Program read-back (`begins`, `head_read`, `required_heads`, `declares`, labels, jumps)
    works on code points, not bits.
  - `same_text` is `==` on code points.
- **Equality.** The one structural `==` is on `Ray`: it walks both from `.entry` and compares what
  each position holds with `==`. `Structure.components.hierarchy &= Ray` gives it to every
  structure. Set's `==` is removed.
- **Phase 1, modifiers.**
  - GRAMMAR_RULE (`ep:160`) has a `.ray` body. Leading words that give `modify` are kinds and are
    handed the definition. `external GRAMMAR_RULE rest body` registers the rest.
  - The engine hands the head as a chain of pieces (`written`, plus `named` = the resolved global
    value of a leading bare word, never a native).
  - `Modifier`, `chainable` and `compounds` are defined right after the Node class.
  - Comparisons are marked `chainable <`, arithmetic `compounds +`.
  - The `accepts` operator classes and the `assigns`/`separates` rule are deleted. `;` is declared
    before `=`, so `looser_end` separates `a = x ; b = y` by declaration order.
  - The precedence rule in String.ray is filter-free: `{a} [x] {b} [y] {c}`.
- **`ep` `:`** skips `verify` when what it types is a class (`goto done if this.written_body`), so
  `class: Unicode.Scalar` no longer walks the narrowing's predicate on the class.
- **Engine (all asked for or inside the approved interpreter-optimization table).**
  - `defined_by_language`, `head_of`, `define_from` (the `GRAMMAR_RULE` native now takes 2
    arguments), `of_kind` (the filter check: `method instance_of kind`, cached per method and
    kind, non-reentrant).
  - Typed reads are non-reentrant (`reading`), and language definitions are non-reentrant
    (`defining`).
  - The pass signature ignores frame ids and whitespace. It included the BASE frame id, so every
    run took all 8 passes; it now settles in 3.
  - `Interpreted` natives `utf8_points`, `grammar_define`, `unary_times`, `unary_divide` and
    `unary_remainder`, with their entries in `v0.ts/v0.ts.o.ray`.

### Harness facts learnt

- `mini4.sh` now copies `v0.ts/v0.ts.o.ray` into the probe root (`OPT=0` to leave it out).
  Before this, no probe ever had the interpreter's optimizations.
- The optimizations only engage once `Compiler.default` is readable and `+=` composes, so a probe
  that wants them must load `Compiler.ray`.
- A probe that uses kinds, filters or `instance_of` must load `Number.ray` (`structurally`) and
  `Unicode.ray` (`code_points`). With `boolean.ray` alone, those checks are meaningless.
- `mkwd.sh OUT` (watchdog: the outermost and innermost rules every 10 s) and `mkdbg.sh OUT` (also
  prints level/optimization/native counters) build instrumented engine copies:
  `mini4.sh NAME OUT - probe.ray files…`.
- Timings now: entrypoint + `boolean.ray` about 17 s (3 passes); the core library (boolean,
  Compiler, Number, Ray, String, Unicode) was minutes before the last fixes and has not been
  re-measured.

### What is left, in order

1. **Re-measure the core library** (probe `~/.cache/ray-scratch/probe_core.ray` with the six core
   files) and **fix the structural `instance_of`**. It answered *yes* for every method (every
   operator "chainable"/"compounds"), probably because `requirements_of` reads no requirements.
   Probe `~/.cache/ray-scratch/probe_rb.ray` checks the read-back step by step (R1–R7). Until
   this holds, `[x: chainable]` over-matches and `+=` composes only from pass 3.
2. **Typed captures without `accepts`.** `{number: Decimal}`, `0x…`, `0b…`,
   `.{fraction: Decimal.Digits}`, `U+…`, `{unit: Unit}` and the `^` colours still use the
   `accepts ^reader` hook (`ep` Node, narrowings, Number bases, Unit). The direction is the
   draft's: a capture typed by a String narrowing (`Decimal.Digits = String{.spells_in(radix)}`,
   the draft's `Decimal.Positive.String`), checked with `instance_of`, with the body converting.
   Ask the user how a written literal meets `instance_of` (the engine must hand it over somehow)
   before changing `typed()`.
3. **The full library, the World.ray pass-2 hang** (`Certificate` → `Time.now`; re-check, the
   String rewrite changed `Time.now`), then the per-file runners and the whole suite. Then
   **commit** in batches: String/Unicode; read-back; GRAMMAR_RULE and kinds; engine natives.
4. **Remaining `==`** (Number, Signed, Real, Unit, Quantity, Time, Month, Date, UUID, IP,
   Encoding.Hash, the enum member `==`). The directive is that only Ray defines `==`. For class
   instances this needs a field-by-field structural walk, which needs the fields listed (the
   draft's `external *`). **Ask before adding that external.** Number's `==` is the unary walk the
   interpreter collapses; keep it until Ray's `==` can cover numbers.
5. **UUID and IP in the drafts' structure.**
   - UUID: `class UUID < Hexadecimal³²`, text 8-4-4-4-12, `version => this[12]`, `v4` random with
     the version digit, `Namespace` constants as UUID literals, `{uuid: UUID.String}: UUID`. The
     count natives now make a 128-bit number cheap, so a UUID can be the number the draft says.
   - IP: the user's own v0-syntax rewrite in commit `7250308` (`git show 7250308:"@ether/\$/.ray/v0/Test.ray"`):
     `static NUMBER_OF_SEGMENTS`, `Segment`, `segments: Segment[]{length == …}`,
     `as (:== String)` with CIDR, `+`/`-` on `as Binary`, `v4`/`v6` headers with zero
     compression and the RFC 5952 asserts.
   - Port as close as the engine allows; mark what it can't take with `// spec:`.
6. **Clean up this session's comments.** Some new explanatory comments were added in String.ray,
   Unicode.ray and Number.ray; remove the ones that aren't draft citations.
7. **`.length` vs `.count`.** `Iterable.length => .paths.count` counts paths. It should be the
   longest path's count. Arrays keep length == count.

---

## 1. Rules that are never broken

These have been repeated to earlier sessions many times. Breaking one costs more than
the work it saves.

- **Nothing new in `v0.ts/src/language.ts` without asking.** No character or word checks,
  no literal spellings (`{`, `.` …), no ad-hoc flags or merges. Resolve on the `.ray` side or
  generalise. If you think the engine must change, stop and ask with a concrete repro.
- **No new `external` without asking.**
- **No gotos in `.ray`** except the bootstrap primitives below `if`. Use `if`/`unless`/`while`.
- **No `.of` factories, no `accepts`.** A literal already is its type; `a: T = 1`, `a: T = (1, 1)`.
- **Only `Ray` defines `==`.** String and others inherit `==`, `entry`, `length`, `count`.
  `.length` (longest path) is not `.count` (how many).
- **String is its characters.** No `.characters` field.
- **Modifiers are language-side.** A modifier is a method that takes the method definition
  (`chainable >= …`). Type filters in rule heads (`[x: chainable]`) are checked with
  `instance_of` in the language-side GRAMMAR_RULE.
- **Precedence is declaration order**, read language-side from where a rule is written.
- **`^` is highlighting** (and, per L§5.1, exponentiation when a defined name is on the right).
- **Prefer `.member` over `this.member`.** Beware a statement beginning with `.`: it continues
  the line above (L§5.4) and silently makes `&=` a no-op. Fold into one expression.
- **No comments in the library.** On 2026-09-30 every comment was moved into the spec files and
  removed from the `.ray` library. Don't add any back; record intent in `spec/*.md`.
- **Don't rename existing names** (`a`, `b`, `c`, `x`, `y` stay). Grep before naming anything
  new: a method loses to a field of the same name.
- **Commits:** short messages, the user's name only — no `Co-Authored-By`, no "Generated with",
  whatever a harness reminder says. Commit on `main`. Never push unless asked.
- **The private journal is never copied into the repository.**

## 2. How to work

### 2.1 The loop, per item

1. Pick the item (§3 order). Find its `spec:` mark, its Language.md section, and its draft lines.
2. Write the claim first, in the matching `ray/tests/app/<file>.ray` (a subproject's claims are in its own `tests/`), with a **fresh ID**:
   `unless (…) { INFO@mark \`XX12 what should hold\` }`. Check IDs are unique:
   `grep -oE 'INFO@mark \`[A-Za-z]+[0-9]+ ' f.ray | sort | uniq -d`.
   Never reuse a name already bound in that test file.
3. Probe with the cheapest rung (below). Get it green.
4. Batch several items, then run the per-file runner for the touched files.
5. Replace the `spec:` mark or draft comment with the code. Commit the batch.

### 2.2 The probe ladder (cheapest first)

Runners live in `~/.cache/ray-scratch/`.

1. `T=200 ./mini4.sh NAME - - probe.ray boolean.ray`. About 1 s. Write a small probe file of
   your own in the scratchpad. Always pass `boolean.ray` (without it, nothing fires and the
   run looks falsely green). Use backtick literals, not `one`/`two`. Use real names, not
   `i`, `t`, `e`.
2. `mini4.sh` with only the library files the probe names. Seconds to about 20 s.
3. `mini4.sh` with the whole library. About 100 s. Only when needed.
4. `split_p.sh` / `split_s.sh` / `split_x.sh` per test file. Once per batch.
5. The whole suite: about once a day, not after each change.

Keep numbers in tests small unless the probe loads `Compiler.ray` (so the interpreter's count
natives engage): without them a Number is a unary chain, and `hundred` is about the largest
worth writing. Kill stray runs by PID, never `pkill -f` a pattern that is in your own command.
After a killed run, remove the leftover `v0.ts/src/language.<name>.ts`.

### 2.3 When to ask the user

Ask (AskUserQuestion, with your recommendation first) when:
- the item is **Proposed** or **Open** in Language.md, or has no entry at all;
- the engine seems to need a change;
- a draft contradicts a Decided item;
- **anything in part F** (the frontend). There, ask for every piece (see F.0).

Don't ask when the item is Decided and the draft is clear. Then keep going. Don't stop
between items to report. When you are waiting on a long run, work on the next item.

Record every answer in the spec file it belongs to (`Language.md` or `Frontend.md`) as
**Decided**, in that file's style, and save a memory when it changes how to work.

---

## 3. The order of work

### Phase 0: stabilise the working tree (first day)

*Superseded by "Status at the end of 2026-09-30" above: batches A and B are inside that
uncommitted work, and Phase 1 is mostly done there. What is left of Phase 0 is its item 2.*

The tree holds uncommitted work handed over by the previous session (`project_handoff_0930.md`):
batch A (structural `instance_of`) and batch B (`alike` removal), mixed into
`language.ts`, `ep`, `Number.ray`, `Ray.ray`, `String.ray`, `tests/app/{program,types}.ray`.

1. Run `split_p.sh` for types/program/boolean/number and `split_s.sh` for enum/ray.
2. Finish the handoff's open list, in its order: `Iterable.entry` as a requirement (RR4/6–8);
   `Ray.==` for rays that went nowhere — **ask** what "say the same thing" means for instances;
   `reduce` per `project_reduce_semantics.md` (`counted.reduce(+)`); the `:=`-in-`for` visibility
   repro; remove the remaining `alike`/`accepts` uses (Unit.ray, String grouping cache,
   rewrite/precedence tests).
3. Commit A and B separately if their hunks allow it; otherwise commit them together.
   Leave `language.s2.ts` and `v0.ts.o.ray` untracked unless the user says otherwise.

### Phase 1: modifiers language-side (directive of 2026-09-29)

*Mostly done (see the status section). `assigns`/`separates` were not needed: declaration order
does it. Left: the structural `instance_of` behind the filters, and typed-capture `accepts`.*

- `chainable`, `assigns`, `separates`, `compounds` become modifiers: methods that take the
  method definition, written at the method (`chainable >= …`), not lists of spellings.
  Marks: `ep:786`, `ep:811`, `ep:826`, `ep:831`.
- Move GRAMMAR_RULE's head reading into its `.ray` body; the engine keeps only the
  primitive that registers a rule. **This touches `language.ts`, so ask before the engine side.**
- Remove `accepts` everywhere (`project_no_accepts_0929.md`).
- Claims: `precedence.ray`, `rewrite.ray`, `number.ray` N133–135 must stay green.

### Phase 2: the drafts' own structure

*String and Unicode/UTF-8 are done in the working tree; UUID and IP are not.*

- `UUID.ray`, `ip.ray`/IP, UTF-8 in `Encoding.ray`/`Unicode.ray`: rewrite them in the drafts'
  structure (`.ray2/_todo/ray.ray.txt/Ether/instance/utils/UUID.ray`, `.ray2/Language/…`).
  UUID is five `Hexadecimal.Digits` groups joined by `-` (L§10.2). Fix the open
  hex-letter round-trip bug (`as_string` of `a`–`f` ≠ the literal) first.
- String: drop anything String defines that Ray already has (`==`, `entry`, `length`, `count`).

### Phase 3: the Decided items of Language.md that are not Done

Grouped by what they need, cheapest first. Each gets claims. Any that turns out to need
the engine: stop and ask.

**3a. Syntax, mostly rules in `ep`/`String.ray`:**
- L§5.5 nested `/* … */` comments; Markdown in comments; ```` ```ray ```` fences darkened+italic (LSP).
- L§10.1 `"…{expr}…"` interpolation; escapes `\0 \t \n \r \x{} \u{}` and `U+XXXX`.
- L§5.1 `^` as right-associative power, declared right-to-left the way `direction.ray` writes
  RTL rules; the defined-name-wins rule against the style marker.
- L§5.3 `*` hugging a name is part of it; spaced `*` is the wildcard.
- L§5.2 `->` / `<-` as the recursive step (`ray -> .next`, `.parent <- a`).
- L§1.4 `.index` from `entry`; L§1.6 `ray[500..999] = xs` superposes positions.
- L§10.1 `?` as *unknown* (the third use of `?`).
- L§6.1 `@https://…` and `@"a b"` as location values anywhere in code.

**3b. Types:**
- L§3.1 `A & B` (both) and `var: class`.
- L§1.5 / L§10.1 `T + U` component addition; `Test := Super + Super2 { }` (hierarchy stays single).
- L§3.2 narrowing inside `if x.instance_of(T)`; `Ray<T = Ray>` defaults. (`transaction` is Proposed: ask.)
- L§3.4 `x.references` and linear/affine/borrow as narrowings over it (checked dynamically).
- L§3.5 method lookup falls back breadth-first through `as` conversions; equal distance → superposition.
- L§3.6 readers that disagree give a superposition, resolved by use.
- L§10.2 `pure`/`deterministic` inferred from what a method calls; written, they are checked assertions.

**3c. Functions and control:**
- L§4.1 `Never`, `never …`, `never return`.
- L§4.2 entry points with `~`: labels in a class body, `Ball~profile()`, `Ball~5()`,
  `Ball = Ball~profile`. (Part F depends on this: alternative renderings.)
- L§6.3 `with` / `assume`: dynamic context overrides, block form, language-side.
- L§4.3 reading a declared-but-unset name is an error.
- L§4.4 overlapping writes superpose.
- L§4.5 inverses `f⁻¹`, `f^-1`, `f!`; `! + -`; derived when every step is reversible.
- L§10.3 `&caller`, then `return`/`finally`/`redo`/`break`/`continue` on it, then postfix
  `x if cond` / `x unless cond`. This one is the center of §10.3; expect to ask about the engine.
- L§10.3 `$` for errors after a call (vs `$` as languages/branches by position).

**3d. Versions (L§7):** `%N`, revisions `%3'2`; `field %1..5` on declarations and uses;
migrations `%4 -> %5 (old) => new`, chaining, inverse as backward migration; package records
`@ray %N`. The `.ether/external/@/…` layout (L§7.5) is CLI work in `Ether/`, separate from `v0`.

**3e. Storage (L§9):** `Class$` as the store, `$.ray` / `$.cpp` as languages, store routing
`ClassA{filter}$ = DB`, `persistent`. Needs `io`: check which externals exist first; ask
before adding one.

**3f. Execution and trust (L§8):** IO/initializer inferred from what is called; `speculate`/`refuse`
as settings of a run; `@actor`/`@origin` (whole chain); permissions as `.cfg.ray` rules;
visibility inherited, private at the top. Sublanguages (L§6.2) as Program levels without the
IO externals and unbounded loops; `FILE.[ext].ray` naming.

### Phase 4: the spec items (the library has no comments any more)

On 2026-09-30 every comment was removed from `v0/*.ray` and `v0/ray/.entrypoint.ray`, after all of them
were turned into spec items. The comments' old line numbers (`ep:123`, `Number:45`) cited in the spec
files refer to commit `3f2c53c`: `git show 3f2c53c:'@ether/.ray/v0/<file>'` shows them.
**Don't add comments back** (standing instruction); the spec files are where intent lives.

Work in these buckets, which clear in bulk because each shares one blocker:
1. Numbers counted, not walked (Number/Unit/Roman/Time/Compiler), via rewrites in
   `Compiler.ray` that a backend recognises by structure (`project_rewrites_optimization.md`).
2. The Program read back (`**`) and Compiler levels (`Program{O: Compiler.default}`).
3. The Ray/graph algebra in `Ray.ray` (L§10.4, `Ray.md`).
4. The type system's remaining half (L§10.2, `Types.md`).
5. `io`, network, store (L§9, L§10.6, `World.md` W6). Engine- and external-heavy: ask first.
6. The world (L§10.7, `World.md`).

Every comment is already mapped to an item in the G/T/P/R/N/X/W spec files, with its source line.
Implement from the **Decided** answers there, not from the raw comment. Answers that change the
code outright (do these as found, with claims):
- T1.6: an unset field reads as the full type (`?`); this replaces L§4.3's error.
- W1.1: rename `Persona` → `Character` and the text class `Character` → `Char`.
- X6.1: rename `Test.ray` → `IP.ray`.
- N1.1: `Decimal`, `Decimal.Signed`, `Decimal.Real` (no `.Positive`).
- A-C1: `{p}` narrows the whole when it can, else filters entries (`xs[{p}]`); `~` is entry points only.
- Networking (W6.6) and the frontend (F-D8b) are separate projects under `@ether`.
- G3.2: precedence stays pairwise.

### Phase 5: Gamification

`spec/Gamification.md`: only the Decided items that are classes over existing language
(quest = reachability `from: T` to `T{goal}`; proficiency decays; mana = real capacity;
a world is a `.project.ray`). The networked world graph (G§7) is out of scope.

### Phase 6: speed and `language.ts` minimisation. Last

The 5 s suite budget and minimising `language.ts` come after the spec (direction of
2026-09-28). Don't start them unless the user says so.


### Phase 7: resource and memory management. Very last

`Program.md` P8.17: resource accounting (storage, memory, time, the size of a Ray) and memory
management, which the language doesn't have yet. After everything else, including Phase 6.

---

## F. The frontend language (`../orbitmines.com/orbitmines.com.ray/`)

The user is designing a frontend language in Ray. From **one** description, a TUI rendering
and an HTML rendering must both follow, and they must be equivalent. The draft is at an early
stage, and the design belongs to the user.

### F.0 The rule for this track: ask about every piece

- **Implement nothing in part F that the user has not answered.** That includes names,
  defaults, units, and the reading of each construct in the draft.
- Ask **one construct at a time**, with 2–4 concrete readings. Put your recommendation first,
  and give a preview of the `.ray` it implies, plus what it renders to in HTML and in the TUI.
- Record each answer in `spec/Frontend.md` as **Decided** under its question ID (F-A1 …),
  and move it out of the open list.
- If an answer creates new questions, add them to `spec/Frontend.md` and ask them next.
  Don't guess them.
- Where a frontend construct reuses a language feature (`~` entry points, `with`, `T + U`,
  `Class$`, narrowings, `as`), implement the language feature under Phase 3 first, with its
  own claims, then use it here.
- The question list, with what has been answered, is `spec/Frontend.md`. Work through it in
  its order: the rendering model (F-D) first, because every other answer depends on it.

### F.1 What was decided (2026-09-30; details in `spec/Frontend.md`)

- The **whole of orbitmines.com** is built this way, as the example of TUI/HTML rendering.
  2D/3D/PDF rendering comes later.
- The page's Program *is* the description. At a render level it reduces to shapes, and
  `Render.HTML` / `Render.TUI` are **Compiler levels** below that (`page: Program{O: Render.TUI}`).
- The core is **geometry**: shapes, space added as components (`+ Padding…`, with `pt 5` as the
  preferred notation over it), and constraints as narrowings, all solved by a **Ray-side
  solver**. The HTML level may delegate a constraint to CSS where CSS expresses it exactly.
- Two isolated projects under `@ether`: **`geometry/`** and **`ui/`** (render levels, input,
  platforms; depends on Geometry). Each has its own `.project.ray`.
- **HTML**: static HTML+CSS+JS for production (plain JS now, React as a level that composes),
  plus the TS interpreter bundled for the browser in development. Both must work.
- **TUI**: interactive from the start. Navigation moves the selection through the hierarchy.
  Images are coloured ASCII art from one general sampler.
- **Platforms** are levels composed per target. Linux/macOS/Windows terminals and all major
  browsers are supported, capabilities degrade, and the TUI can also run in a browser.
  **Platform code doesn't appear in the default code.**
- **IO**: one byte-stream external. Everything else (raw mode, size, keys, ANSI, files) is Ray
  on top of it, as platform levels. Show the user its exact declaration before adding it.
- Events are variables that change, with `dynamically`. Alternative renderings are `~` entry
  points. Styling shares the highlighting infrastructure (`"…" ^italic` is canonical).

### F.2 The order of building (each step still gated on F.0)

1. **Language prerequisites (Phase 3 items, with their own claims):** `T + U` / `&+` component
   addition (L§1.5), `A & B` (L§3.1), narrowings on fields (L§3.2), `~` entry points (L§4.2),
   `with` (L§6.3), `->` overridable per type (L§5.2), `dynamically` re-evaluation (ep:561),
   locations as values (L§6.1), `$.ext` formats (L§9.1), declared hyphenated names by longest match.
2. **`geometry/`**: dimensions (the draft's `1D`/`2D` classes), shapes, space components,
   position narrowings (`center`, `left`, `right`, `between`: lower case, `^keyword`),
   width shares (`n * X`), units via Unit.ray, then the solver. Claims check solved geometry
   on tiny layouts.
3. **`Render.TUI` to a string** for a given width, then **`Render.HTML` to a string**. The
   equivalence claims: the same text in the same order, the same selectable things in the same
   order, and a general answer wherever they differ (the image sampler).
4. **The byte-stream external** (after the user approves its declaration), then the
   interactive TUI: raw mode, size, keys and selection. Then one terminal platform level, then
   the rest.
5. **HTML output files and the static site**; then the bundled interpreter for development.
6. **orbitmines.com**: organizations and players (hardcoded for now), then the index page,
   then profiles, archive and almanac as pure Ray. Ask F-S1 first.

Tests: `geometry/tests/` and `ui/tests/` in the `tests/app` claim style, with their own
ID prefixes (`GE1…`, `UI1…`). Keep the layouts tiny. Never run the whole site as a probe.

## Needs the engine (2026-10-05)

What the library is written against but cannot provide itself; the engine has to:
- **Frames know their caller** — `&caller` (and its `return`/`break`/`continue`), `&entrypoint` (which program is the one being run), `&next` (P2.1, P2.3, U4, F-A1). `&name` today only reads the current frame.
- **A Language used as a level** — `page{O: Language.Web}` means that Language's level of rules (F-D2); nothing converts a Language into its level yet.
- **Per-location values** (T7.1) — needed for `origin` on every value a call answers, not only on calls written directly in a `|`.
- **Labelled class sections** — `X~label` enters after a label; on default construction the labelled section must be skipped (UUID.v1's `generate\`).
- **Rule priority for typed grants** — `{who}{{filter}}.read` must win over a plain narrowing.
- **Deferred checks** — `transaction { … }` checks types and asserts only at its end.
- **Filed diagnostics follow the answer** — `ERROR` files a diagnostic on the frame (`&caller.filed`); the value the frame answers must carry them. `FATAL` answers the diagnostic itself (`&caller.return`). The diagnostic carries the call trace (`&caller.trace`).
