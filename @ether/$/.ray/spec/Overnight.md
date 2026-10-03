# Overnight work list (2026-10-03)

Language-side only: `.ray` library files in `v0/` and test files in `v0/tests/app/`. Built from the
**Decided** lines of `spec/*.md`, checked against the library and the tests at `645d66e`.
Everything here was grepped; a few items were also probed on kernel3 (see §0).

---

## 0. Read this before starting

### 0.1 What can be verified tonight (measured on kernel3 at HEAD, 2026-10-03)

| Boot set (`inspect.sh … "libs"`) | Result |
|---|---|
| `boolean.ray Compiler.ray` | Boots in about 3 s. `TESTS=boolean.ray` runs. |
| `boolean.ray Compiler.ray Ray.ray` | `Ray.ray` stops with "This statement nests deeper than the runtime can follow" (`@Ray.ray:393`, the `Traverser` enum). Nothing evaluates. |
| `boolean.ray Compiler.ray Number.ray` | The entrypoint stops reading (`Unexpected .instance = None` at `ep:62–65`). Nothing evaluates. |
| The whole library | A JS stack overflow. Every expression is `undefined`. |

On that bed, `if (false) { … }` takes the block, because `false` is an enum entry and so it is
present (`project_state_1002`). In `TESTS=boolean.ray`, 22 `if (…)` claims fire for that reason
alone. The other side of it: **an `unless (x == y)` claim never fires when `==` answers `false`.**
INFO counts don't prove anything on this engine.

So:
- Check by evaluating the expressions, not by counting INFOs. Copy the library into the scratchpad,
  edit the copy, and run `LIB=<copy root> OPTF=…/v0.ts/core.o.ray inspect.sh TAG …/src/kernel3
  "boolean.ray Compiler.ray" exprs.txt`. Then read the `E expr => #id "text"` lines. Items whose
  files don't boot (most of B–E) **can't be checked tonight.** Write the code and the claims, mark
  the commit or report "unverified: <file> does not boot on kernel3", and check them again once
  kernel4 is switched in or kernel3 boots `Number.ray`/`Ray.ray`.
- A prototype of A1 on the bed gave `(false.next == true) => "true"` but
  `(true.next == false) => "false"`, while `true.next.next` was the same node as `false.next`.
  Either `boolean.false` inside the enum body isn't the global `false`, or enum `==` (`external
  where`) differs between them. A1 has to find out which.

### 0.2 Files nobody touches tonight

- `v0/.entrypoint.ray`: kernel4's bootstrap lines are being moved into it when kernel4 is switched in.
- `v0.ts/**`, including `core.o.ray`, `v0.ts.o.ray` and `src/kernel*`: the engine and its
  optimization levels.
- `Compiler.ray` levels: the speed work owns them (P8.2, P8.11, P8.16, N1.18, N1.20).

### 0.3 Rules for every item (from memory; break one and the work gets rejected)

- No gotos in `.ray`: use `if`/`elsif`/`else`/`unless`/`while` (`feedback_no_gotos`).
- No new surface syntax beyond what the item names. If an item needs any, stop and add it to §3
  (`feedback_discuss_syntax_first`).
- Write in the drafts' style. No `.of` factories, no `exists`, no `extend` in new code, no
  `as_string`-style conversions where the spec says the value already *is* the thing.
- Don't add comments to `.ray` code.
- Grep before naming anything new. These names are known to collide: `written`, `text`, `holds`,
  `loop`, `value`, `scope`, `next`. Check `.entrypoint.ray` by name, since `*.ray` misses it.
- Known traps:
  - A statement that begins with `.` continues the line above it.
  - Two spaces don't separate statements inside `{ }`.
  - `link value previous` reads as a member access.
- Test claims: `unless (cond) { INFO@mark \`ID text\` }`. Every claim gets a new, unique ID; use the
  prefix given with the item.
- At most about 4 interpreter processes at once. Check `free -g` first.
- Commits go on `main`, are reviewed by the orchestrating session, carry the user's name only, and
  have short messages.

---

## 1. Ready to build

Grouped so that three agents never edit the same file at the same time. Inside a group, do the
items in the order listed. Sizes: S < 30 lines, M < 100 lines, L > 100 lines (code + claims).

### Group A: `boolean.ray`, `Number.ray`, `tests/app/{boolean,number,grammar}.ray`, the IP rename (agent 1)

Most of this boots on the bed in §0.1 (except Number), so this group is the one that can be checked.

- **A1. boolean's orbit** (N5.3; Decided: `true.next == false`, `false.next == true`). Not built:
  boolean has no `next`/`previous`, and the probe answers `None`.
  - Add `next` and `previous` in the `boolean` enum body.
  - Resolve the identity question in §0.1 first.
  - Claims `BOR1`–`BOR6` in `tests/app/boolean.ray`: next both ways, `next.next` is itself,
    `previous == next`.
  - Size S. Checkable on the bed.
- **A2. Syntax tests** (G5.4; Decided: "a `tests/app/grammar.ray` whose claims override a rule in a
  scope and check the reading"). The file doesn't exist.
  - Write `tests/app/grammar.ray`. For example: define `{a} + {b} => …` inside a class body or a block
    and check that the reading changes there and nowhere else; check that a rule defined in one
    scope isn't seen in a sibling scope; check that the longest declared word wins (G3.9).
  - Use only what `boolean.ray` gives.
  - Claim IDs `GR1…`. Size M. Checkable on the bed with `TESTS=grammar.ray`.
- **A3. `Test.ray` → `IP.ray`** (X6.1, Decided). Not done.
  - `git mv v0/Test.ray v0/IP.ray`. Nothing in the library, the tests, `v0.ts/` or the kernels names
    the file. The test is already `tests/app/ip.ray`.
  - Also update the X6.1 line in `spec/Text.md`, which still says the file is in `Test.ray`.
  - Size S.
- **A4. Leading zeros** (N1.15; Decided: `007 == 7`). Number reading probably already gives this,
  but no test says so.
  - Add the claims `N…` (next free IDs in `tests/app/number.ray`): `007 == 7`, `00 == 0`,
    `0x00ff == 0xff`.
  - Change code only if they fail.
  - Size S. Can't be checked tonight (Number doesn't boot).
- **A5. Postfix `!` is factorial on a Number** (N1.14; Decided: "`!` postfix by type: on a Number it
  is factorial"). `Number.factorial` exists; the postfix spelling doesn't.
  - Add `! => .factorial` on Number (boolean already declares `! => .not` the same way), plus claims
    `3! == 6`, `0! == 1`, and that `3 != 4` still reads as `!=`.
  - **Probe gate:** if `!` beside a number can't be read without an engine change, or it breaks `!=`
    or boolean's prefix `!{x}`, stop and move it to §2.
  - Size S. Depends on nothing.

### Group B: `Ray.ray` (+ one line of `String.ray` after C1), `tests/app/ray.ray` (agent 2)

None of this can be checked tonight (`Ray.ray` doesn't boot; §0.1).

- **B1. `flatten` goes all the way down; `flatten(n)` stops after n levels** (R3.13, Decided).
  Today's `flatten` (`Ray.ray:150`) splices one level.
  - Make `flatten` recursive.
  - Add `flatten (levels: Number)`.
  - Keep `IT22`: a chain of numbers must not be spliced into their digits, because a number is
    unbounded.
  - Claims `RF1…`: a nested `[[1, [2, [3]]]]` fully flattened; `flatten(1)` on the same.
  - Size S–M.
- **B2. `.every` covers the whole structure in both directions** (R2.2; Decided: "`.every` covers
  the whole structure reachable from the entry, in both directions; `(ray -> .next).every` for one
  direction").
  - On `Ray`, `every` walks `.previous` from `.entry` as well as `.next`.
  - `Iterable.every` on chains stays as it is, because a chain's entry is its head.
  - Claims `RE1…`, built from a ray entered in its middle.
  - Size S.
- **B3. `⊢` and `⊣` as plain aliases** (R1.1; Decided: "`initial | ⊢ : Boundary`").
  - `⊢ => .initial`, `⊣ => .terminal` on `Ray`.
  - Only these two. The others (`∙ ⊙ ∃ ∀`) are in §3, and hugged composition (`∙⊣⊙initial`) is in §2.
  - Claims `RA1…`. Size S.
- **B4. `.min` and `.max` without an argument** (R3.10; Decided: "min/max/sort default to the
  entries' `<`").
  - `min` and `max` with no parameter on `Iterable`, over the entries by `<`.
  - Leave `Ordered.min (other)` and `max (other)` alone.
  - The dimension forms `.sort(dimension)`/`.max(.y)` are in §3 (they clash with `max (other)`).
  - Claims `RM1…`. Size S.
- **B5. Repeating a structure with `* n`; `String.repeat` goes** (R3.9; Decided: "`"ab" * 3`,
  `[1, 2] * 3`; `String.repeat` becomes this").
  - `compounds * (times: Number)` on `Iterable`. A String answers a String.
  - Delete `repeat` from `String.ray`, **after C1 is committed**, since it's the same file.
  - Rewrite claim `W16` as `("x" * 3) == "xxx"`.
  - Check that Number's own `*` still wins for numbers (N6, CO15, N121/N122).
  - Claims `RR…`. Size M.

### Group C: `String.ray`, `tests/app/string.ray` (agent 2, before B5)

- **C1. `.join` and `.join(separator)`** (X1.5; Decided: "`String[] as String` joins without a
  separator; `.join(sep)` adds one").
  - Add `join` and `join (separator)` on chains/iterables of strings, answering a String.
  - Keep `String.joined` as it is (IP, `snake_case` and `pascal_case` call it), or rewrite those
    callers onto `join` within the same file.
  - The `as String` spelling is in §3.
  - Claims `SJ1…`: `("a", "b", "c").join == "abc"`, `.join("-") == "a-b-c"`, one element, none.
  - Size S.
- **C2. Multiline strings lose their common indentation** (X1.1; Decided: "loses the indentation of
  its least-indented content line; a blank line right after the opening quote or right before the
  closing one is dropped"). Not built.
  - Do it in the `"{literal text}"` rule's body (`String.ray:222`) on the text it reads.
  - **Probe gate:** if a `"…"` literal can't span lines on this engine, move it to §2 and don't touch
    the rule.
  - Claims `SM1…`. Size M.

### Group D: `Unit.ray`, `Time.ray`, `tests/app/{unit,time}.ray` (agent 3)

None of this can be checked tonight (Number doesn't boot).

- **D1. Binary prefixes and named byte multiples** (N2.6; Decided: "`KB = 1000 B`, `KiB = 1024 B`,
  … now").
  - A `BinaryPrefix` enum (`kibi` `Ki` … `yobi` `Yi`, plus `robi`/`quebi`), with
    `factor => 1024.pow(.power)`, written like `Prefix`.
  - `prefixed` accepts either kind.
  - The byte multiples get names through `called`: `kilobyte`/`kilobytes`/`KB` …
    `kibibyte`/`kibibytes`/`KiB` …. `Kibibyte` stops being `Byte multiple (1024)`.
  - The negative SI prefixes and the `1k`/`1M`/`1B` counts are in §3.
  - Claims `UB1…`: `(1 of Kibibyte) == (1024 of Byte)`, `(1 of Kilobyte) == (1000 of Byte)`,
    `Kibibyte != Kilobyte`.
  - Size M.
- **D2. Juxtaposed quantities, largest first** (N2.2 + G2.6; Decided: "`1d 10h 10m 30s` … another
  order is an error"; "Quantity's own rule in `Unit.ray`").
  - A rule on `Quantity`, `{ }{rest: Quantity}`, that adds when `rest`'s unit is finer, and is an
    `ERROR@…` otherwise.
  - **Probe gate:** if the trailing typed capture can't read `10h` on this engine, move it to §2.
  - Claims `UQ1…`. Size M.
- **D3. `1 of m` goes from the surface** (N2.1; Decided: "`1m`, `1.5m`, `1 m`, `1.5 m`. Not `1.m`;
  `1 of m` goes").
  - Rewrite the tests (`unit.ray`, `time.ray`) and `Time.ray` (`… of Second`, `of Nanosecond`) to
    `1 B` / `(… ) s` forms.
  - The `{ }{unit: Unit}` rule may keep calling a renamed internal method. Grep for a free name.
  - **Probe gate:** do it only once `(1 B) == (8 b)` evaluates on some engine; otherwise leave it for
    the morning.
  - Size M.
- **D4. `Time.round(unit)`** (N4.11; Decided: "`.round(seconds)` … kept").
  - Rounds `since_epoch` to the nearest whole multiple of the unit and keeps calendar and epoch.
  - Claims `TR1…`. Size S.

### Group E: `World.ray`, `Roman.ray`, `Feature.ray`, `tests/app/{world,roman,feature}.ray` (agent 3, after D, or a 4th agent)

- **E1. `Reference` gets the site's fields** (W4.4; Decided: "References port the site's
  `references.ts` fields into a class `Reference`; authors are Characters").
  - The source is `orbitmines.com/orbitmines.com/src/lib/post/Post.tsx:878` `ReferenceProps`:
    `title`, `subtitle?`, `date?`, `draft?`, `organizations`, `authors`, `published`, `year?`,
    `link?`, `pointer?`, `external?`, and `notes` (each with a `date` and a text).
  - `authors` replaces `author`. Update `world.ray` lines 33, 92 and 170.
  - Claims `WR1…`. Size S–M.
- **E2. The missing status members** (W2.6; Decided: "one superposable enum:
  `@me.status = Online & Hosted & Idle`").
  - Add `idle | do_not_disturb | busy` to `Status` (`World.ray:179`).
  - The `&` superposition itself is in §3.
  - Claims `ST2…`. Size S.
- **E3. Roman's normalizer and `.canonical`** (N3.1 + T6.2/T6.4; Decided: "Additive Roman numerals
  are a normalizer, not a class: reading accepts both, writing uses the Standard form unless …
  `Additive`"; "a class's normalizer runs on assignment, `.canonical` is its result on demand").
  - A static `normalizer` on `Roman`: Standard by default, and Additive as the other choice.
  - `.canonical` answers `Roman.from(.as_number)` written by the normalizer.
  - Switching uses plain assignment in the test. `with` is in §2.
  - Claims `RO61…`: `Roman(text: "IIII").canonical.text == "IV"`, the round trip for 1..20, and
    that reading `IIII` gives 4 (no test checks that today).
  - Size M.
- **E4. A key cycles, and stands for whether it is pressed** (W6.10; Decided: "`toggled`, `cycle`,
  `as boolean` when pressed").
  - `Key.press` counts presses.
  - `cycle (iterable)` answers the entry at `presses % count` (it answers `.first` today).
  - A key used as a condition holds while it is pressed: `holds => .pressed`. Grep `holds`, since
    Node and boolean both define it.
  - `pulsed (max: 20/s, delay: 1s)` needs rates (N2.3) and a clock, so it isn't built.
  - Claims `KB6…`. Size S.

### Who does what, in parallel

| Agent | Groups | Files | Can it be checked tonight? |
|---|---|---|---|
| 1 | A1 → A2 → A3 → A4 → A5 | `boolean.ray`, `Number.ray`, `Test.ray`→`IP.ray`, `tests/app/{boolean,grammar,number}.ray` | A1–A3 yes; A4–A5 no |
| 2 | C1 → B1 → B2 → B3 → B4 → B5 → C2 | `String.ray`, `Ray.ray`, `tests/app/{string,ray}.ray` | no |
| 3 | D1 → D4 → D2 → D3, then E1 → E2 → E3 → E4 | `Unit.ray`, `Time.ray`, `World.ray`, `Roman.ray`, `Feature.ray` and their tests | no |

Group E can go to a 4th agent; no file is shared with D.

The only file shared across agents: A3 renames `Test.ray`, which C1 might edit if it moves
`String.joined` callers. C1 should therefore leave `Test.ray`/`IP.ray` alone.

---

## 2. Needs the engine (looks ready, isn't)

- **Checking anything outside `boolean.ray`**: kernel3 at HEAD doesn't boot `Ray.ray`/`Number.ray`,
  and `if (false)` takes its block (§0.1).
- **W1.1 renames** (`Character` → `Char` for text, `Persona` → `Character`). Decided, and
  mechanical in the library, but the old names also appear in:
  - `.entrypoint.ray` (`capture_of`: `Character.space`);
  - `v0.ts/core.o.ray` (`{a: Character} == …`, `.width`, `.codepoint` …);
  - `v0.ts/src/kernel4/entrypoint.ray`.

  Do it together with the engine owner, after kernel4 is switched in.
- **R2.4 `reduce` / `reduce_right`**: an operator in call position (`reduce(+)`) doesn't parse, and
  `.` binding to the current element is engine work (`project_reduce_semantics`).
- **L§6.3 `with` / `assume`**: restoring the value when the context is left needs a frame-exit hook.
  This blocks N4.4 (`with Time.YEAR`), the `with` half of N3.1, W6.2 `seed`, R2.1 (traverser
  default), and L§4.2 (`with Ball = Ball~profile`).
- **P2.4 `recur`**: needs the running function as a value. The `recur\` native was removed in
  `02064e1`.
- **P2.5 do-while and P2.6 `loop`**: both are edits to the entrypoint (`do ^keyword := while`, `ep:209`).
  `loop` is also a local name inside `while`'s own rule (`ep:186`). CF12 already passes for `do`.
- **G1.1** (tabs and odd spaces are an error in code): reading level, or entrypoint.
- **R4.1 ranges `a..b`, `a..<b`, `a..`**: the `.` member rule and Number's `.{fraction}` rule
  (`Number.ray:2`) compete for `..`, and `a..` is defined as `a ->`, which doesn't exist. Probe it
  after kernel4.
- **`->` / `<-` stepping** (L§5.2, Almanac A4): applying `.next` or `+1` as a step to each value is
  a section (an operator with no left operand).
- **R1.1 hugged composition** (`∙⊣⊙initial`); **R2.8 / T2.3 `#`, `##`**; **R6.1 `obj[String]`**;
  **R3.14 `<in: …>`**; **A-C1 `xs[{p}]`**: `[{property}]` is member access in the entrypoint today.
- **N1.12 superscripts** and hence **N1.7 `u8 = Binary⁸`** (today `u 8` with a space).
- **X5.1–X5.3 UUID** and **X6.3/X6.5 IP** in the drafts' structure: these need types-as-patterns
  (T4.10, step 1 of Plan.md's "Direction from 2026-10-02").
- **G7.2/G7.3**: `==` rules as reversible equivalences need a new rule-definition form, and
  idempotence (`{a} & {a}`) needs non-linear patterns.
- **W6.3** `Number{> 5}()` chooses; **P1.8** `x**` selection; **P4.1** concurrency classes;
  **P5.1/P5.6** `dynamically`; **P6.1** the `$` error forms; **T1.2** None propagation everywhere.

---

## 3. Unclear: save for the user

1. **R3.10 dimension forms.** `.max(.y)`/`.sort(dimension)` collide with `Ordered.max (other)`/`min
   (other)`, which take a value (`2.max(5)`, N13). How is `x.max(.y)` told apart from `x.max(y)`?
2. **R3.1 / R3.2 / R3.11 `remove`, `push_after`, `push_before`, `move_after`.**
   - Is the receiver the entry (Almanac A8: `….[6].push_after(1)`) or the chain?
   - Does `remove` take a value or a position?
   - A link doesn't know its chain, so it can't fix `head`/`tail` when it removes itself. Should
     links point back to their chain?
3. **R3.7 `.complement`**: what is "the whole context graph" of a v0 value, when there's no selection
   mechanism yet?
4. **R5.1 loop operations**: signatures and results of `unrolled`, `unrolled_mod`, `instances`,
   `disallow_loops`.
5. **R1.1 `∙ ⊙ ∃ ∀`**: which members do these alias? Is `∀` `every` and `∃` `some`? What are `∙` and
   `⊙`?
6. **N2.5 negative SI prefixes** (deci … quecto): Unit ratios are natural Numbers (`Unit.over`
   multiplies them). Should a sub-unit ratio be a `Number.Real`, or a divisor field?
7. **N2.6 counts `1k`/`1M`/`1B`**: `1B` is also one byte (`B` is Byte's symbol). Does it superpose
   per N2.4, or is the count spelled differently?
8. **N4.5 epochs**: how is "`"2025-01-01"` with `epoch: "2000-01-01"`" written in v0 (a `Time`
   constructor reading ISO text, or `ISO_8601.date`), and what answers `25.years` (a Quantity in
   `Year`)?
9. **N4.4**: what are `Time.YEAR`/`Time.MONTH` by default (`?`), and is a month a Unit, so that
   `+1 month` works?
10. **W2.4 sessions** (spawn/login/logout/swap, deletion with a cancel window): the drafts are TODO
    lines only (`.ray2/_todo/ray.ray.txt/Ether/instance/entrypoint/entrypoint.ray:22–43`,
    `…/instance/Entity.ray:31`).
    - Which class holds the registry?
    - How long is the cancel window?
    - Does deletion need `Time.now` and `dynamically`?
11. **W2.6 `Online & Hosted & Idle`**: `&` is only defined on boolean. Should Node's `&` (Almanac A1:
    holds both at once) be written language-side now, and where (the entrypoint is off-limits
    tonight)?
12. **X6.4/X6.5 interim IP work**: RFC 5952 mixed notation (`::ffff:1.2.3.4`) and CIDR text
    (`"10.0.0.0/8"`) could be done now as methods. Is that acceptable before the draft's
    pattern-type structure (X6.3), or should it wait?
13. **X1.5 / X1.6 the `as String` spelling**: the library uses `.as_string` everywhere, while the spec
    writes `x as String`. Should `as` become one method taking a type (Unit and Quantity already
    have `as (other: Unit)`), and should all the `as_string` calls be renamed?
14. **P1.5 function analysis** (`.variables`, `.usages`, domain, image, the -morphisms): what is a
    Program's domain or image in v0, when parameters are untyped?
15. **P8.5 optimization problems** (`optimize`/`minimize`/`maximize`/`prefer`/`allow`): what is the
    interface of the search, given that quests aren't runnable yet?
16. **N1.14 spacing**: is `3!` only with no space? `x ! y`/`x !y` are boolean's prefix `!`.
17. **W1.1 timing**: rename tonight in the library only (breaking `core.o.ray`'s
    `{a: Character}` natives), or wait until kernel4 is switched in? (Listed in §2 as waiting.)
18. Still open in the spec, unchanged: G3.11 (a rule for one specific operator now that `accepts` is
    gone), N5.5 (removing the remaining `exists`), A-C4/U-C\* (answered), and X5.4 (the hex-letter
    round trip, an engine bug).

---

## 4. Status in the morning (2026-10-03)

### Built by the agents (on `main`, reviewed)

| Commit | Items | Checked |
|---|---|---|
| 5801ee1 | C1 `join`, `join(separator)` | no (String does not boot on kernel3) |
| c1409ed | D1 binary prefixes, 20 named byte multiples | no (Number) |
| 6d2feea | A2 `tests/app/grammar.ray`, A4 leading-zero claims, A5 postfix `!` on Number, A3 spec line | A2 on kernel3: GR2 and GR5 fail there; A4/A5 no |
| b891348 | B1 `flatten`/`flatten(n)`, B2 `every` both ways, B3 `⊢ ⊣`, B4 `min`/`max`, B5 `* n` (`String.repeat` gone), C2 multiline dedent | no (Ray/String on kernel3) |
| 719d651 | D4 `Time.round`, E1 `Reference` fields, E2 `Status` members, E3 Roman normalizer + `canonical`, E4 `Key` presses/cycle/holds | no (Number) |

A1 was already done (08f9226). D2 and D3 were skipped: their probe gates need Unit to evaluate.
Review fixes: SJ4 used `("a",)` (now `.words`), `Time.round` rounded the wrong way (fixed), comments removed from tests.

### Questions the agents raised

1. **A2 / G5.4**: should a rule written inside a body override an outer one through plain `=>`, or only through `&=>`? (GR2 assumes `=>`.)
2. **`==` without brackets on booleans and enums**: `chainable == (other)` defines a rule that spells its brackets, so `true == false` is not read on either kernel. kernel3 misread it silently as `=` (so the BO23/BO24/BOR claims were vacuous); kernel4 reports `Unexpected == false`. Should `chainable {pattern}` read `(other)` as a parameter, like `name (params) =>` does?
3. **C2**: every `"…"` literal now runs `.dedented` (splits into lines): a cost on every string literal. Keep it in the rule, or dedent only text that spans lines? Should whitespace-only interior lines be kept as written?
4. **B3**: is a symbol (`⊢`) accepted as a method head and as a member after `.`? Unchecked.
5. **D4**: rounding to a unit finer than the stored one keeps the amount. Convert instead?
6. **E1**: `credit (author)` is the name for adding an author. OK?
7. **E3**: `Roman.normalizer` is a mutable class-level field; nothing else in the library does that. OK until `with` exists?

### kernel4 (switched: e8921c6)

- Equal or better than kernel3 everywhere both can run: probes 43/45 (the two differences are kernel3
  bugs), the regression set 41/41, `tests/app/boolean.ray` the same INFO set, and on `enum.ray`,
  `grammar.ray` and `types.ray` kernel4 passes claims kernel3 fails (EM8/9/14/17/18/22, GR2/GR5, TY1–TY6)
  without failing any it passes. kernel4 boots `Ray.ray` (kernel3 cannot). Painting: same palette,
  320 vs 317 painted lines on entrypoint+boolean.
- interpreter.ts ~1060 lines, natives.ts ~165. kernel3 reads its own `kernel3/entrypoint.ray`.

### Questions from the engine side

8. **`if (false)` / `while flag { flag = false }`**: a condition tests presence, and `false` is an enum
   entry, so it is present. `control.ray` never ends on either kernel (CC8's loop). Should conditions ask
   something of the value (`holds`), or should `false` be absent?
9. **Number.ray**: `zero := Number()` (line 217) runs before `Decimal` (line 395) and `required_heads`
   (line 593) exist, so `.{fraction: Decimal.String}` cannot check its type and every text passes
   (structural typing with no requirements admits anything). kernel4 now refuses a typed capture it
   cannot decide yet, but String's requirements are still empty at that point. Reorder Number.ray, or is
   this the types-as-patterns step (Plan.md)? Booting it also needs the native level (unary arithmetic
   alone takes over 10 minutes).
10. **`x|| (b) =>` / `x!|| (b) =>`** (boolean.ray): a name made of a letter and an operator. kernel4 reads
    the name as `x`, so these two define rules that spell `(b)` literally (`true x|| true` is wrong).
    Reading `x||` as one name would also make `3!` one name. Rename them, or should a definition's head
    be read up to its brackets?
11. **How does `=` declare right-to-left?** A run of one operator now groups left (G3.3: `a, b, c` is
    `(a, b), c`, which is what Listed's `,` and `|` were written for; 3+-argument calls and 3+-element lists
    were silently wrong before). L§5.1/G3.3 say an operator that groups right is *declared* right-to-left,
    but nothing in the entrypoint can say that yet, so `^a = ^b = ^U2` would group left. The theme now
    writes one alias per line. Which spelling marks `={x}` (and later `^` on Number) as right-to-left:
    a `right-to-left` modifier before the head like direction.ray's `external right-to-left test-right`, or
    something else?
