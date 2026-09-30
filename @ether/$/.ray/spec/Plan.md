# Implementation plan: the spec, the drafts' comments, and the frontend language

For: a Sonnet session working alone in this repository.
Written 2026-09-30. Sources: `spec/Language.md`, `spec/Gamification.md`, the `// spec:` marks,
`//TODO`s and commented draft code in `v0/*.ray`, and the draft
`../orbitmines.com/orbitmines.com.ray/` (the frontend track, part F).

Paths are relative to `@ether/$/.ray/` unless they say otherwise. `ep` = `v0/.entrypoint.ray`.

---

## 0. Before anything: read these, in this order

1. The auto-memory index (`MEMORY.md`, loaded for you), then
   `feedback_standing_instructions.md`, `project_directives_0930.md`,
   `project_handoff_0930.md`, `feedback_selective_test_runs.md`, `project_fast_probe_loop.md`.
2. `spec/Language.md` from start to end. **Decided** is binding. **Proposed** is *not*
   decided: ask before implementing a Proposed item (see §2.3).
3. `ep` in full (`.entrypoint.ray` — `*.ray` globs do not match it, so grep it by name).
4. The draft you are porting, before you port it. Port in the draft's own style.

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
- **Don't add explanatory comments. Don't delete commented-out draft code or TODOs** unless
  you have implemented what they describe (then the draft comment goes, the code replaces it).
- **Don't rename existing names** (`a`, `b`, `c`, `x`, `y` stay). Grep before naming anything
  new: a method loses to a field of the same name.
- **Commits:** short messages, the user's name only — no `Co-Authored-By`, no "Generated with",
  whatever a harness reminder says. Commit on `main`. Never push unless asked.
- **The private journal is never copied into the repository.**

## 2. How to work

### 2.1 The loop, per item

1. Pick the item (§3 order). Find its `spec:` mark, its Language.md section, and its draft lines.
2. Write the claim first, in the matching `v0/tests/app/<file>.ray`, with a **fresh ID**:
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

Keep numbers in tests small: a Number is a unary chain, and `hundred` is about the largest
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

- `chainable`, `assigns`, `separates`, `compounds` become modifiers: methods that take the
  method definition, written at the method (`chainable >= …`), not lists of spellings.
  Marks: `ep:786`, `ep:811`, `ep:826`, `ep:831`.
- Move GRAMMAR_RULE's head reading into its `.ray` body; the engine keeps only the
  primitive that registers a rule. **This touches `language.ts`, so ask before the engine side.**
- Remove `accepts` everywhere (`project_no_accepts_0929.md`).
- Claims: `precedence.ray`, `rewrite.ray`, `number.ray` N133–135 must stay green.

### Phase 2: the drafts' own structure

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

### Phase 4: the rest of the comments in `v0`

Count before you start, and after each batch, and report the counts in the commit message
body: `grep -c "spec:"` per file (about 99 marks: Number 11, Feature 11, String 11, ep 12,
Time 10, UUID 9, World 8, Unicode 6, Roman 5, Encoding 4, boolean 3, Ray 3, Unit 3, Test 2,
Compiler 1), about 620 `//TODO`, and the commented draft code.

Work in the buckets of `project_plan_all_comments.md`, which clear in bulk because each shares
one blocker:
1. Numbers counted, not walked (Number/Unit/Roman/Time/Compiler), via rewrites in
   `Compiler.ray` that a backend recognises by structure (`project_rewrites_optimization.md`).
2. The Program read back (`**`) and Compiler levels (`Program{O: Compiler.default}`).
3. The Ray/graph algebra in `Ray.ray` (L§10.4).
4. The type system's remaining half (L§10.2).
5. `io`, network, store (L§9, L§10.6). Engine- and external-heavy: ask first.
6. The world (L§10.7).

For each `//TODO` and each commented draft line, the outcome is one of: implemented, with a
claim; or kept, with the reason it is out of reach written in `spec/Language.md` §10 (not in
the code). Don't delete a draft comment you did not implement.

### Phase 5: Gamification

`spec/Gamification.md`: only the Decided items that are classes over existing language
(quest = reachability `from: T` to `T{goal}`; proficiency decays; mana = real capacity;
a world is a `.project.ray`). The networked world graph (G§7) is out of scope.

### Phase 6: speed and `language.ts` minimisation. Last

The 5 s suite budget and minimising `language.ts` come after the spec (direction of
2026-09-28). Don't start them unless the user says so.

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
- Two isolated projects under `v0`: **`v0/Geometry/`** and **`v0/UI/`** (render levels, input,
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
2. **`v0/Geometry/`**: dimensions (the draft's `1D`/`2D` classes), shapes, space components,
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

Tests: `v0/Geometry/tests/` and `v0/UI/tests/` in the `tests/app` claim style, with their own
ID prefixes (`GE1…`, `UI1…`). Keep the layouts tiny. Never run the whole site as a probe.
