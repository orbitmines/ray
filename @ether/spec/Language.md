# Ray — Language spec (from the Project IDE note and the drafts)

Status legend: **Done** (in v0, with claims) · **Partly** · **Proposed** (not in v0) · **Open** (needs your decision).
Each item: what the note/draft says → where v0 stands → proposal → questions.

Sources: `private-journal/public/archive/projects/Project - IDE - The Ether (2027->).md` (cited as *IDE:line*), the drafts in `@ether/.ray2`, `@ether/.ray3`.

---

## 1. Values, literals, collections

### 1.1 Characters and strings — *IDE:285*
> "A" is a char, unless explicitly a string.

- v0: text literals are backticks `` `…` `` only; `String.of(`…`)` builds a String of Characters. There is no `"…"` literal.
- **Decided:** `"A"` (one character between double quotes) is a `Character`; `"AB"` is a `String`, because a String is an array of characters. `` `…` `` stays the raw written literal (what externals and patterns take).
- **Done:** String.ray's `"{literal text}"` rule (string.ray DQ1–4). Interpolation (10.1) is not in it yet.

### 1.2 `[]` and `()` for arrays — *IDE:287*
> [] and () are interchangeable for array creation?

- v0: `(a, b)` and `[a, b]` both evaluate their inside; `,` composes one `Listed` value (a chain). So `(1, 2)` and `[1, 2]` already give the same list.
- **Decided:** equal for lists. For a single element, `y := [x]` is a list holding `x`, and `y := (x)` is `x` (grouping only).
- **Decided (2026-10-02, replaces the earlier `[l]` is `l` and the `[[x]]` special form):** `[x]` always makes a new list holding `x` as its one element, a list included; there is no `[[x]]` form. Written lists flatten: `a, b, c` is one list, and a list value written first in a comma list is flattened into a *new* list, never mutated, so `lst, 5` is the elements of `lst` followed by `5`. To keep a list as one element, bracket it: `[lst], 5` is `(lst, 5)`. Mutating a reference is only ever done by an optimization, never by the language's semantics. **Done** (`ep` `[{expr}]`, `,`).
- **Decided (2026-10-02):** for types only, repetition compresses: `"A", "B", "B"` as a type is `"A", "B"[]` (Almanac A6; T4.10).

### 1.3 `++` — *IDE:291*
- Dropped (no longer applies).
- **From the drafts review (2026-10-06):**
  - **1.3.1 `x++` as copy — Q (conflict).** The IDE note's `++` is dropped above, but v0 uses `this++` as a copy (`String.ray:70`, `Node.ray:89, 222`) and the draft has `++ | copy` forking a variable's history (*`.ray2/Node.ray:155`*; L§10.3 lists it). Recommend: the drop concerns `++` as concatenation; `x++` (alias `copy`) is a copy whose history is a fork of `x%`.
    **Answered (user, 2026-10-06):** `++` stays dropped. v0's `x++` becomes `x.copy`.

### 1.4 Entry and index — *IDE:280*
> entry is origin no self. .index is from origin.

- v0: `Chain.entry => .head`; `Ray.entry` is `this` for a non-chain, `None` for an empty chain; there is no general `.index`.
- Proposal: `entry` is where a ray is entered from (its origin), never the value itself; `.index` of an element counts from that origin (0-based), so `["A","B","C"].map(entry => entry.index)` is `0, 1, 2`.

### 1.5 Components only when named — *IDE:299–302*
> `["A","B","C"].map(entry: String + Ray => entry.index)` — only provide the `+ Ray` when mentioned explicitly; forcing it to be String ignores the Ray component.

- v0: parameters are typed with `(x: T)`; `+` on types does not exist.
- Proposal: `T + U` in a type position means "a T that also carries the U component". A parameter typed `String` gets the element as a plain String; typed `String + Ray` it also gets its position (`.index`, `.next`, …).
- **Decided:** `+` between types is *component addition*, not numeric addition and not class hierarchy. `String + Ray` is a String with the Ray component superposed onto it, making one whole; `+ Ray` alone adds the Ray component to whatever it is. `&+`/`&-` (adding/removing components) belong to the same thing.

### 1.6 Ranges on the left — *IDE:683*
> `ray[500..999] = 500-length array` instead of setting all those values to the array. How to differentiate.

- **Decided:** `ray[500..999]` is a superposition of places to put things, so `ray[500..999] = xs` puts `xs` itself at each position. The exception is when a type conversion shows `xs` can't be the element type but spreading it would fit; then its elements are spread over the range.

---

## 2. Declaration and assignment

### 2.1 Declaring — *IDE:153, 171–173*
> `:=` by initializing, or `: String =` · var : / var = · how to distinguish new vs out-of-scope assignment

- v0 (Done):
  - `x := v` declares `x` here.
  - `x: T` declares `x` typed `T` (holding the type until given a value).
  - `x: T = v` declares then assigns.
  - `x = v` assigns the nearest `x` that is visible. If there is none, inside a block it binds where the block was written, otherwise here.
  - A variable declared with a structural type reads what is assigned by that structure: `x: Range = 2-7`, `x: Range = (2, `-`, 7)`.
- Proposal: keep. A warning (not an error) when `=` creates a name no scope declared.

### 2.2 Shared and per-instance statics — *IDE:388*
> shared vs non-shared static fields.

- v0: a field declared in a parent class is shared by all instances of a subclass when its default is a thing (`kept: (chain None)`); declared in the class itself it is per instance (see the comment on `class:` in `.entrypoint.ray`).
- **Decided:** fields are per instance by default. Proposal: a shared one is written `static x := …`.

### 2.3 Defaults that follow — *IDE:597*
> is default set, and should it be set as a part of data storage, or only once the default changes; should it follow the default adaptively.

- **Decided:** an unset field reads the class default *live*: a later change of the default is seen, until the field is assigned. Storage keeps only assigned fields.

### 2.4 Aliases and first assignment (*from the drafts review, 2026-10-06*)
- **2.4.1 A member that names another variable — Q.** `def primary => location` should not implement `primary`, since `location` is a variable too (*`.ray2/_todo/ray.ray.txt/ray.ray:8`*). Recommend: `a => b` where `b` is a field is a read-only derived member; a two-way alias is the name superposition `a | b: T` (as v0 does for `initial | ⊢`).
  **Follows (2026-10-06):** `a => b` naming another field is a two-way alias, the name superposition `a | b: T` (as `initial | ⊢`); and since an identity derivation is reversible, `a => b` is writable through it, not read-only. From R1.1 (aliases are name superpositions) and T3.22 (a derived member is writable when its derivation is reversible).
- **2.4.2 First initialisation merges — Q.** The draft's default first initialisation: overwrite if None, else `&=`, else `=` if the class provides one (*`.ray2/_todo/ray.ray.txt/Ether/instance/Expression.ray:17`*). Recommend: not as a default (§2.1 and T1.6 decide declaration); only as a named policy of a location or store, where assigning into a slot that holds a value superposes (`&=`) unless the slot's class defines `=` (what W3.4's merge quests need).
  **Follows (2026-10-06):** not a default. Declaration and assignment are §2.1 and T1.6, and an assignment is checked against the history it writes over, a conflict becoming a quest (W3.4). "Overwrite if None, else `&=`" may be a store's or a location's own policy, nothing more. From §2.1, T1.6, W3.4.

### 2.5 What an assignment replaces (*user, 2026-10-06*)
- **Decided:** a program's own graph is its history. An assignment keeps the value it replaces as the new value's `.previous`, so `x.previous**` are the values `x` held before, nearest first; this is Ray structure, not a `History`. There is no time on that edge: when a value changed comes from version control (a commit's stamp, `x.history`), so anything measured against time imports `@ether/version` (user, 2026-10-06).
  - The core keeps no history: `with`/`assume` restore what their settings wrote through `.previous`; transitions, key presses, idleness, a quest's attempts, an item's trail and a reference's notes read `.previous**`; what needs time (transitions, pointer velocity, double presses, idleness, recent solves) reads `x.history` with `@ether/version` imported.
  - Commits, repositories, logs of runs, stores and storage levels are `@ether/version` (§9.1).

---

## 3. Types

### 3.1 Intersections — *IDE:344–345*
> `var: class` · `var: class & String`

- v0: `A | B` (superposition, used for `T?`); no `&` on types.
- **Decided:** `A & B` = must be both (an instance of each); `var: class` = var holds a class.

### 3.2 Narrowing by conditions — *IDE:644–649*
> If blocks like `if array.length > 2 … end` change the type of array within that block. `{==.instance_of IP}` automatically casts to IP. Functions should relax their arguments to what they actually use. `def Ray<T = Ray>`. Multiple edits that together make it type-compliant as a single transaction.

- v0: `Type{predicate}` narrowings exist (`Small := Number{. < five}`), `instance_of`, `verify`, `admits`.
- Proposal, in order:
  1. Inside `if x.instance_of(T) { … }`, `x` is treated as `T`.
  2. `Ray<T = Ray>`: `T` defaults to `Ray`.
  3. A statement group `transaction { … }` is checked only at its end.
- **Decided 2026-10-05:** `transaction { … }` is added: all of it happens or none of it (Almanac §4.2); if anything in it errs, every variable it assigned is restored.

  Relaxing parameter types to their used parts belongs to the IDE (a suggestion), not the language.

### 3.3 Refined types with the same code — *IDE:707*
> Equivalent code if type is refined like Number vs i64.

- Proposal: an implementation written for `Number` also serves `i64` (a narrowing of Number); a narrowing may override it for speed. This is what the Compiler levels (`Program{O: …}`) are for.

### 3.4 Use counts — *IDE:401–408*
> Linear (exactly once), affine (at most once), borrow, quantitative (0, 1, many). Dynamically assert the number of references to a variable.

- Proposed wording (from your answer): these are **references**. Where a thing is referenced, and how often it is actually used, are statistics the runtime keeps: `x.references`, the places that refer to x, and the count of them.
  - Linear/affine/borrow are then narrowings over them: `x: T{references.count == 1}`, `{references.count <= 1}`.
  - They are checked dynamically first.
- **Decided:** yes, `references` it is, and linear/affine/borrow are narrowings over it.

### 3.5 Castable methods — *IDE:638, 676*
> If a method doesn't exist on the variable but it is castable to something which does define that method (boolean `&`/`|`), converting and calling should be possible; if a library later implements it, notify the user.

- v0: `as (X)` conversions exist on some classes (Unit, Quantity).
- **Decided:** method lookup falls back to the whole equivalence graph of `as` conversions from the receiver (breadth-first; the nearest conversion that defines the method is used).
- **Decided:** two conversions at the same distance that both define the method are both used, and the result is their superposition.
- **From the drafts review (2026-10-06):**
  - **3.5.1 Ordered routes first — Q.** Among conversion routes of equal length, which wins: `Expression[]` reaches `Program` ordered, and the draft prefers `Expression -> Program[] -> Program` (linear) over a superposing route (*`.ray2/Program.ray:408`*). Recommend: prefer the route that keeps order over one that superposes. (The decision above superposes ties; this ranks before it.)
    **Answered (user, 2026-10-06):** keep the superposition of ties; no ranking.
  - **3.5.2 Explicit-only conversions — Q.** The note wants some equivalence edges used only when written (*IDE:164*). Recommend: `explicit as (=== X) => …` is used only by a written `as X`, never by the lookup fallback or by `==` (U9).
    **Answered (user, 2026-10-06):** no `explicit`: all conversions are implicit but convert only when forced. `20 °C == 68 °F` holds through the equivalence; variables keep their type (unless an optimisation level converts them because the converted form is used). Only the equivalence collapses them.

### 3.6 Grammar that reads differently per type — *IDE:158–159*
> Type ? + Error. Grammar would be interpreted differently for different types, so throw an error.

- v0: typed captures ask each type's reader; a text two types read differently picks by rule length, then declaration order.
- **Decided:** when two applicable readers accept the same text with different results and nothing ranks them, the text reads as their superposition. It is resolved by what uses it: `d: Date = 2-7` takes the Date reading.

---

## 4. Functions and control

### 4.1 Non-returning functions — *IDE:213*
- **Decided:**
  - A function typed `=> never` never returns (renamed from `Never`, 2026-10-06).
  - `never` is a keyword. `never <something>` asserts (or proves) that something never happens.
  - `never return` says the function's end is never reached: the return, i.e. reaching the end label. When a branch containing `never return` is taken, the function's return value is `never` as well.
  - Example:
    ```
    func () => {
      do_stuff()
      never return
      do_more_stuff_infinitely()
    }
    ```

### 4.2 Several entry points — *IDE:720*
> defining multiple entrypoints of a function with labels. Use `func**.LABEL()`. Also a starting branch which isn't executed by default, only accessible with a label.

- v0: labels (`name\`) and `goto` exist inside bodies; `f**` is the program of `f`.
- **Decided direction:** entry points use `~`, as in the drafts (`.ray2/_todo/…/UI/Geometry.ray:110–131`, `.ray2/Program.ray:164`):
  - Labels in a class body (`profile\`, `"Profile Name"\`, even `{variable_label: Number}\`) are alternative entries: alternative constructors, or renderings.
  - `Ball~default()` is the ordinary one. `Ball~profile()` and `Ball~"Profile Name"()` enter at that label; `Ball~5()` picks the fifth.
  - `Ball = Ball~profile` sets which one is the default; `with Ball = Ball~profile` does so only in a context.
  - `Node~method` names a method as a place, e.g. to insert something after it for precedence ordering.
- `with X = …` is the general context override of §6.3; `with Ball = Ball~profile` is one use of it.
- **From the drafts review (2026-10-06):**
  - **4.2.1 Shared constructor code; renderings — Q.** What runs for every entry, and how a constructor's `return` (a rendering) is reached (*`.ray2/_todo/ray.ray.txt/Ether/instance/UI/Geometry.ray:113, 146`*). Recommend: statements before the first label run for every entry point; a rendering is the entry point's answer (`Ball~profile()` answers its rendering), and the object is still `this`.
    **Answered (user, 2026-10-06):** as F-D13: a class body runs like any function, labels never skipped; a `Component` class adds that its labels are not executed, only entered.
    **Answered (user, 2026-10-06):** later: entering a plain class at a label constructs the whole body, then runs from the label.

### 4.3 Calling what isn't there yet — *IDE:217*
> Call something which isn't filled yet lazily, and assume it can only be put there after it's filled.

- v0: arguments and blocks are lazy (programs); `forward` declares a rule to be implemented later.
- **Decided:** reading a declared name that no one has set yet is an error. With `x: Number` declared and `y := x + one` run before `x` is set, `y` fails. Laziness comes from arguments and blocks being programs, not from unset names.

### 4.4 Concurrent access — *IDE:8, 715–716*
> Should you superpose concurrent accesses of a variable? Could be a range of values if writing is overlapped, to model a language's behaviour.

- **Decided:** superpose. Two overlapping writes leave the variable holding both (`a | b`); reading it with a policy (e.g. the last, any, all) resolves it.

### 4.5 Running backwards and inverses — *IDE:10–11*
- **Decided:**
  - A function's inverse is `f⁻¹`, also written `f^-1` or `f!` (the drafts' postfix `!`: `+! 5 = -5`, `map(f!)`).
  - `f⁻¹ (y) => …` declares it, and `! + -` declares `-` as the reverse of `+`.
  - An inverse is derived when every step of `f` is reversible. A function with some irreversible steps is partially reversible.
- **From the drafts review (2026-10-06):**
  - **4.5.1 A leftward step is the inverse — Q.** `-1 <- x -> +1` as the inverse notation for going the other way (*`.ray2/Feature/Transaction.ray:71–72`*). Recommend: `f <- x` steps through `f⁻¹`, so `+1 <- x` ≡ `x -> -1` (with §5.2's `<-`).
    **Answered (user, 2026-10-06):** it is the inverse, defined as a structural step to the left: `<-` walks `.previous` as `->` walks `.next`.

### 4.6 Composition and calls (*from the drafts review, 2026-10-06*)
- **4.6.1 `∘` and `Function` — Decided (draft).** A function is a Node on which `(*) => *` is defined: `Function := Node{(args) => *}` (structural). `f ∘ g` (alias `compose`) is `(args) => f(g(args))`, declared right-to-left (G3.3), so `f ∘ g ∘ h` is `f ∘ (g ∘ h)`. *`.ray2/_todo/ray.ray.txt/ray.ray:119–124`* (L§10.3 listed it.)
- **4.6.2 Chaining `=>` — Q.** `A => +1 => +3` as successive steps (*`…/ray.ray:117`*). Recommend: `f => g` where `f` is already a function appends a step, `(+3) ∘ (+1) ∘ A`; a body that is not a function stays a plain body (G2.2).
  **Answered (user, 2026-10-06):** `f => g` with f already a function appends a step: `A => +1 => +3` is `(+3) ∘ (+1) ∘ A`.
- **4.6.3 The call is not the text `"()"` — Q.** Calling `()` must not go through a string-named member (*`…/ray.ray:11`*); v0's Access uses the method name `` `()` `` for execute permission. Recommend: the call is the `()` method; looking up a member by the text `"()"` (`x["()"]`) is a field lookup, never the call.
  **Follows (2026-10-06):** the call is the `()` method; `x["()"]` selects a member by its key and is never the call. Execute permission is access to that method. From W5.1/§10 grants (execute is access to `()`) and R6.1 (`obj["name"]` selects by key).

---

## 5. Syntax and layout

### 5.1 `^` — *IDE:60*
> ^ is right-associative?

- v0: `^` is the style/highlight marker only.
- **Decided:** `^` is also exponentiation, right-associative: `2^3^2 = 2^9`. It must work alongside the style marker.
- Proposal for telling them apart without an engine special case:
  - The style marker is `^word` where `word` names a style: a group of the `H` theme or a style the language declares (the engine's `styler` check already asks exactly this).
  - Any other `^` between two operands is the power operator, declared on Number like `+`.
  - Right-associativity: the grouping rule groups equal operators to the left. `^` would declare itself right-grouping, e.g. a `^right` style on its declaration, read by the same grouping rule.
- **Decided:** a defined name wins. If a local variable is called `keyword` and `x` is a number, `x ^keyword` is exponentiation. Only when no such name is defined does the style marker apply. The style `^` is written in the entrypoint before Number's `^` (which overrides it with `=>`), so Number's override is tried first and falls back when its operand doesn't resolve.
- **Decided:** an operator that groups to the right says so by its written direction: it is declared right-to-left, the way direction.ray writes RTL rules.

### 5.2 `->` and `,` — *IDE:86*
> `->` exchangeable with `,` in most scenarios?

- **Decided:** `a -> b` works like the composition `a, b` when `b` is already filled, but it is really a recursive step.
  - `ray -> .next` is a Ray that steps through `.next` from `ray`, recursively, until `.next` is None.
  - Direction matters, because it says which end is initial and which terminal: `.parent <- a` steps through `.parent` from `a`, and its result ends at the root.

### 5.3 `PATTERN*` — *IDE:276*
> PATTERN* maps to PATTERN, * so that we can have "PATH/"*?

- **Decided:** `*` hugging a name is part of the name (Unix allows `*` in file names), so it is not a wildcard by default. A wildcard is the `*` operator written with spaces: `PATH/ *`, `PATH/ * /CONTINUE_SUB_PATH`, `@users_starting_with_a *`.

### 5.4 Leading dot on the next line — *IDE:440–455*
> `a =` / `obj` / `.func` / `.func2`: a here is obj, not the result of func2, since it accepts the block. `a = obj.` then `.func` `.func2` would call func2 explicitly. Or force the `.` usage to be the typical call on the next line.

- v0: a line beginning with `.` is read as a member of the line above, so `a = obj` / `.func` calls `func` on `obj`'s line.
- **Decided:** keep today's rule: a line starting with `.` continues the line above.

### 5.5 Nested comments — *IDE:167*
> multiline comments nest `/* /*`

- v0: only `//` line comments; `/* */` appears only in notes.
- **Decided:**
  - `/* … */` block comments that nest.
  - Comments follow Markdown rules. Code inside a ```` ```ray ```` fence within a comment is Ray that doesn't run: the editor highlights it as code, but darkened and italic.
- **From the drafts review (2026-10-06):**
  - **5.5.1 Indentation — Decided (draft).** A block comment's text is its lines with the common indentation removed (each line's indent equal to the previous one's is stripped). *`.ray3/Node.ray:65–67`*

### 5.6 Warnings — *IDE:353–355*
> Warning on a multiline `()` with a `,`: either you want it there or add a newline between the two. Warning when the first statement contains leading whitespace.

- Proposal: both as diagnostics (warnings).
- **From the drafts review (2026-10-06):**
  - **5.6.1 Text joined into a path — Q.** Text put into a path that supports `..` may escape it (*`.ray2/_todo/ray.ray.txt/ray.ray:25`*). Recommend: a configurable diagnostic, a warning by default, when a String not proven free of `..`/`/` is joined into a Location (W6.1 sandboxes only the top).
    **Follows (2026-10-06):** a String not proven free of `..`/`/` joined into a Location is a warning diagnostic, configurable like every preference; the sandbox only stops leaving the top. From W6.1, §5.6 (such cases are warnings), G7.6 (configurable preferences).

### 5.7 Mixed right-to-left — *IDE:424*
- v0: Partly. Directed scanning exists (direction.ray). Spec: a line may switch direction; the engine reads each run in its direction.

### 5.8 Highlighting by value — *IDE:95, 615*
> Syntax highlight red green blue as red green blue; highlight the thing calling it too. `"".[LANG]` to syntax highlight.

- v0: Done for colours (the `H` theme; `^ {color}` rules paint).
- Proposal: `` `…`.js `` marks a literal as written in that language, highlighted as it.
- **From the drafts review (2026-10-06):**
  - **5.8.1 Literals painted by their type — Decided (draft).** A literal read by a typed capture or declaration (`x: IPv6 = "::1"`) is painted by that type's own rules (segments, `::`), not as a plain string. *`.ray2/Grammar.ray:5`*
  - **5.8.2 `TODO` — Decided (draft).** `TODO` (in code, as an abstract body, or in a comment) is painted as its own `^todo` group and listed as an info diagnostic. *`.ray2/Program.ray:16`, `.ray2/Grammar.ray:178`*

---

## 6. Paths and names (`@`)

### 6.1 Reserved path forms — *IDE:62, 272*
> `@/` and `@./` are reserved for path names. `@https://` should work, only not accepting spaces; use `@" "` for that.

- v0: Done in `.project.ray` dependency lines: `@./x`, `@../x`, `@/abs`, `@username/package`.
- **Decided:** the same forms are expressions anywhere in code: `@https://…` is a location value; `@"a b"` for one with spaces.

### 6.2 Config files — *IDE:694–699*
> `.cfg.ray`; & variables … Cfg /file/path, Cfg @me/file … They still get executed. All fields are instantiated with ?() — already the default; if ? then None.

- **Decided:** the language defines *sublanguages*, in which only certain kinds of code are permitted. Configuration lives in a sublanguage of Ray instead of `.yml`/`.json`. A `.cfg.ray` file is written in the sublanguage whose code provably halts and provably has no side effects (no HTTP requests, no IO).
- **Decided:** a sublanguage is a Program level: a scope of rules without the IO externals and without unbounded loops.
  - A `!language` project configures which files are read in which sublanguage.
  - Such files are always named `FILE_NAME.[extension].ray`, e.g. `package.cfg.ray`.
- **Decided:** the note's `&` variables (*IDE:696*) are context overrides, the `with` of §6.3: a configuration that changes a type's or a global's value only for that context.

### 6.3 Context overrides — `with` / `assume`
- **Decided:**
  - `with Time.timezone = SOME_TIMEZONE` changes what functions answer for every call made in the running context, until the context is left. The scope is dynamic: the override follows calls, not only lexical nesting.
  - `assume Time.timezone = …` is an alias of `with`.
  - Since `with` takes a program, the block form works too: `with { Time.timezone = X }`.
  - It is defined language-side, not in the engine.
  - Other uses: `with Ball = Ball~profile` (§4.2), and `ClassA{filter}$ = DB` routing (§9.1).
- **From the drafts review (2026-10-06):**
  - **6.3.1 Writes inside an override — Q.** What happens to a value changed inside a `with`, and to later changes outside (*`.ray2/_todo/ray.ray.txt/Ether/instance/UI/Geometry.ray:125–126`*). Recommend: a `with` override is a location (T7.1); writes inside it go to the override's branch, and a later write to the original outside is seen inside unless the override changed that field (the shadow rule, §10.6.1).
    **Follows (2026-10-06):** a `with` override is a location: `=` inside it writes at the override, and reads fall through to the original, so a later write outside is seen inside unless the override wrote that field. From T7.1 (one location concept; `=` writes at the current location) and §10.6.1 (shadowing: reads fall through, own writes stay).
  - **6.3.2 `assume` without a value — Decided (journal).** `assume c` with no `= v` is `assume c = true`. **Q:** a file opening with `dynamically { assume … if … }`; recommend no new form: it is a context override for the whole file, re-read when its condition changes. *IDE:836–845*
    **Follows (2026-10-06):** (the Q) no new form: `dynamically { assume … if … }` opening a file is a `with`/`assume` over the rest of the file, re-read when its condition changes. From §6.3 (`with`/`assume` take a program, dynamic scope) and P5.1 (`dynamically` recomputes).

---

## 7. Versions and the `ether` CLI

### 7.1 Version numbers — *IDE:376, 131*
> A single point of arbitrariness: the major version, increased when there is a breaking change in the publicly facing API; major 0 may break at will. Versions themselves might be versioned (a patch without a version number change).

- **Decided:**
  - A version is a single number `%N`. `%0` may break freely.
  - Revisions of a version are named `'0` … `'N`: `%3'2` is the second revision of version 3, and `%3` alone is always its latest revision.

### 7.2 Versioned fields and ranges — *IDE:201–209, 359*
> `<&VER..&VER> field`, `%1..5 field`, `field %1..5`; a keybinding to see all versions intermingled; support forward and backward compatibility if desired. Generate under/above a function which versions it applies to; migrations from many versions to a new one.

- **Decided:** the suffix form, `field %1..5`, both on declarations (limits them to those versions) and at uses (selects them).
- **Decided:** a migration is a function `%4 -> %5 (old) => new`, for now declared beside the thing it migrates (declaring it elsewhere may come later). Migrations chain, so %1 reaches %5, and an inverse (§4.5) is the backward migration.
- **From the drafts review (2026-10-06):**
  - **7.2.1 `%1..5` or `%[1..5]` — Q (conflict).** This section decided the suffix `field %1..5`; the 2026-10-05 answers (§10, "`%`") read `%` before a number as modulo and write version ranges `%[1..5]`; the Almanac writes `title %1..5: String` (*ALM:1641*). Recommend keeping the 2026-10-05 answer: rewrite this section to `field %[1..5]` and update the Almanac line.
    **Answered (user, 2026-10-06):** `%[1..5]`; `%` alone stays modulo. This section's `field %1..5` and the Almanac's `title %1..5` are to be written `%[1..5]`.
    **(2026-10-06):** `%[1..5]` reads as the narrowing `Version{1 <= number <= 5}`: inclusion is `is`, the versions are `#`. `Versioned<T>` is gone; a versioned field is the field's history narrowed by version.

### 7.3 Errors carry their version — *IDE:432*
> error[X] where X is the version the error type got introduced, plus a number.

- Proposal: a diagnostic's code is `E<version>.<n>` of the language version that introduced it (the engine already prints codes like `0.E2027.0A.1`).

### 7.4 Shipping the spec one depends on — *IDE:91*
> Ship with the implementation of the language spec we depended on; if the interpreter doesn't support that version yet we can still run on older versions (forward compatibility).

- **Decided:** a package records the `@ray %N` it was written against, and carries that version's `@ether/*.ray` when the host interpreter lacks it.
- **From the drafts review (2026-10-06):**
  - **7.4.1 Externals are the compatibility surface — Decided (draft).** The set of externals is what an interpreter must support: a language version that adds no external runs on an older interpreter by shipping its `@ether/*.ray`. *`.ray2/Grammar.ray:7`*
  - **7.4.2 Declaring the version in a file — Decided (Almanac).** `< @ray %N` at the top of a file declares the Ray version it is written against. *ALM:1709*

### 7.5 The `ether` command — *IDE:99–141*
> `ether @c++ %` lists versions; `ether @c++ @` lists locations (@clang/@linux/@apt | @clang/@windows); `ether @c++.ray @clang/@windows/@x86-64 %0.16.0`; `ether @c++ @local`; `ether clone|install|use [--global] @c++`; expects an `entrypoint.cli.ray`; `ether @ray […]`, `ray` maps to `ether @ray`. Layout `.ether/external/@/@clang/$/@windows/@x86-64/%/0.16.0`, the top-level `@clang` being the checked-out version, changed versions under `$/@<USER>%branch`. `.ray` reserved for the mapping `@ray/@c++`.

- v0: the `ether` CLI exists (Ether/library Index, per-language scripts), with a different layout.
- Proposal: the CLI is a program in the cfg-like CLI sublanguage (`entrypoint.cli.ray`). Its grammar is the note's: `@name` names, `/`-joined locations, `%version`. `.ether/external/@/…` stores what it fetches.
- **Decided:** adopt the note's layout `.ether/external/@/@clang/$/@windows/@x86-64/%/0.16.0` now, replacing the current one.
- **Decided (2026-10-06):** the package-manager languages (npm, Cargo, pip, apt, with SemVer ranges and TOML) are removed for now and will be re-added later; only what version control needs stays. A `Project`'s dependencies are `@…` locations only.
- **From the drafts review (2026-10-06):**
  - **7.5.1 Shell completion — Q.** Marking a variable as a command-line tool should make the shell complete it (*IDE:222*). Recommend: the CLI grammar (`entrypoint.cli.ray`) is a type, so completion reads a prefix against it; writing `$.bash`/`$.zsh` completion scripts is a level, once the shell language is back from the `version-control` branch.
  - **7.5.2 `.ether/` vs `.project.ray` — Q.** The note gives every project a `.ether` directory for its configuration (*IDE:463*). Recommend: `.project.ray` holds what the project declares; `.ether/` holds what Ether keeps locally for it (fetched externals, caches, `.%` working state).
    **Follows (2026-10-06):** `.project.ray` declares the project; `.ether/` is what Ether keeps locally for it in the `.ether/external/@/…` layout (fetched externals, caches, `.%` working state), all of which are levels. From §6.2 (configuration is `.cfg.ray`), §7.5 (the layout) and §9.2.8 (caches and working state are levels).

### 7.6 Distribution (*from the drafts review, 2026-10-06*)
- **7.6.1 Installing — Decided (Almanac).** Ether installs by download, by `curl -fsSL https://ether.orbitmines.com/install.sh | bash`, by a release installer, or by `git clone …` then `./install.sh --compile`. Editor plugins are named `Ether.ray` in the VS Code and JetBrains marketplaces. *ALM:549–565*

## 8. Execution, trust and permissions

### 8.1 Levels of execution — *IDE:306–323*
> Abstract interpretation needs something like `speculatable`/`interpretable?`; it must not accidentally run `rm -rf`. Levels: FULL RUNTIME (classes flagged `initializer` run fully; optionally partial runs stored and shown) and ABSTRACT INTERPRETATION (other methods run with the abstract class on the variable; only initializer methods like `=`/`:` are called). Anything IO-flagged returns the abstract class unless flagged `speculate`; ignored when flagged `refuse` (only the IO itself, not what's done downstream). Cache results; nondeterministic/IO results are not constant.

- Proposal, as modifiers on methods and externals:
  - `initializer` runs during abstract interpretation.
  - `io` answers the abstract class of its result.
  - `speculate` runs IO anyway.
  - `refuse` never runs the IO.

  The editor runs files abstractly; tests run them fully. After an edit, a `speculate` flag is dropped until you set it again.
- **Decided:** nothing is declared.
  - Whether a method does IO, or is an initializer, follows from what it does and calls: a method that reaches an IO external is IO, one that only assigns/declares is an initializer.
  - `speculate` and `refuse` are not properties of a definition but choices of whoever runs the code: settings of the run (the editor's, a test's, a `.cfg.ray`), per method or per location.

### 8.2 Who runs code — *IDE:311–313, 544–548, 623*
> Different levels of trust: run code as its author (@player set), deny HTTP unless trusted, only certain domains, with/without data. No full write access to the drive, only specific folders; overridable only by changing configuration. "May not send any of this data or its derivatives over the network". Applications run as their creator; "@company wants to execute on your device, originating from @me".

- **Decided:**
  - Every run has an `@actor` (who runs it) and an `@origin` (whose code it is).
  - A permission is a `.cfg.ray` rule over `(origin, capability, target)`: `@company may network @https://api.x.com`.
  - Data carries a mark saying its derivatives may not leave (`local`); the engine tracks it through composition, the way `listed_by_separator` is carried.
- **Decided:** the origin is the whole chain (company ← me ← library). Permissions see every hop, and a prompt says "@company wants to run this, originating from @me".
- **(2026-10-06)** There is no `Run`: the chain is the running Program's (`&@`, the caller frame's program). A Program has a
  `caller` (the program that started it) and `hops` (`[caller.hops, who]`, the origin first); `may(method, target)` holds when
  every hop is allowed by the target, and `ask` answers a quest for the grant when not. `speculate`/`refuse` are the run
  settings `with (Program.speculated |= x)` / `with (Program.refused |= x)`; `Refused` and `Abstracted` are narrowings of Program.
  A permission is an `Access` on the node it names (below, §8.3); a capability is a path granted the same way
  (`@me.execute { @me/device/camera }`, asked with `&@.ask`).
- **Decided (2026-10-06):** running as a character is `@name { … }`, or `@<uuid> { … }` with the character's UUID.
  - The block runs with `&caller` set to that character, so `@me` inside it is that character.
  - It works only when the character is here: logged in or hosted on the local instance. Otherwise it is an error.
  - `@me { … }` runs as whoever `@me` already is.
  - A `.%` line uses `with (@me = @who)` instead, which replaces the draft's `&caller = <uuid>;` (§9.2.6, 2026-10-06).
  - **(2026-10-06)** `@name { … }` is `with (@me = name) { … }`, the same as a `.%` line, and running somewhere is
    `with (Location.current = loc) program`; there are no `run_as`/`run_at`/`run_after` methods.
  - **(2026-10-06)** With `@ether/security` imported (§9.1 subprojects), `&caller` holds only verified principals:
    `@me = x` sets `x.acting`, which is `x` verified by a key held here or a handshake, and an access check also needs
    the actor `Live` and within its delegation (World W2.1). Without it, `@me = x` sets `x` as given.
- **From the drafts review (2026-10-06):**
  - **8.2.1 Checking a context checks its program — Decided (draft).** An access check on a context checks the running Program and its `&who` / origin chain, never the frame's data. *`.ray2/Program.ray:247–248`*
  - **8.2.2 Releasing a derivative — Q.** A permission for whether data and its derivatives may cross the network, or only some derivatives (a count) (*`.ray2/_todo/ray.ray.txt/Ether/instance/Access.ray:1–2`*). Recommend: a grant may name a derivative (`@ether.read (x.count)`) that may leave although x may not; library code runs as `@ether`, which has access on the local instance only.
    **Answered (user, 2026-10-06):** a grant names an expression: paths are just expressions (equivalent to the `.` pattern), so `@ether.read x.count` works and `@ether.read x @/count` is the same thing. Prefer code; use paths only where paths make sense.
  - **8.2.3 One-time and conditional grants — Q.** The note wants a permission for one occasion, or while a condition holds (while an app runs), or conditional on another party's code (*IDE:74, 550*). Recommend: a grant carries a narrowing, `@company may network @x {once}` / `{while app.running}`; the condition is re-read `dynamically` (P5.1), and a one-time grant is consumed by its first use, recorded in the grant's history.
    **Follows (2026-10-06):** a grant carries a narrowing, `{once}`, `{while app.running}` or a condition on the other party's code; the condition is re-read `dynamically`, and a one-time grant is consumed by its first use, which stands in the grant's history. From §8.2 (a permission is a rule over (origin, capability, target)), queries as narrowings (the W2.15 answer), P5.1 and history replacing stored state.
  - See also World W2.17 (handed-over code runs as its character; run-log retention) and W2.18 (running *at* a location vs `@name { … }`).

### 8.3 Visibility — *IDE:31, 70, 195, 226, 245*
> visibility and contract (license); visibility of visibility (can find it in the index but not access it); how to say the parent shouldn't be visible but I should be readable, or the other way — which is the default; @public for streaming.

- Proposal:
  - Visibility is a field of each item, `@public | @me | @<group>`, default inherited from the parent.
  - Visibility is itself a value, so it has a visibility. The visibility's visibility is what makes an item *findable*: A can be `@private` while its visibility is `@public`, so others find that A exists but cannot read it.
- **Decided:** an item inherits its parent's visibility. At the top it falls back to the default privacy policy, which is private.
- **(2026-10-06, one mechanism)** A node's `access` superposition is the only store of who may do what. A grant `{who}.read x`
  is an `Access(who, method, filter)` placed on what `x` names: on the value or field the expression answers, or on the
  expression itself when it derives something (`@ether.read x.count`). `x.visibility` is its own access, else its parent's,
  else `Access(Node.policy)`; `x.allows(who, method)` checks it and the grants on expressions naming `x`. The levels are `who`
  values: the core has only `none` (no one; `none.read` is a secret, `const` is `none.write`) and `confidential = => Node.policy`;
  `local`, `localhost`, `private` and `public` are Ether's names for `@local`…, and Ether clamps
  `confidential = => Node.policy & @private.managed` (W5.5). There is no `Grant`, `Permissions`, `Accessor` or `Visibility`.
- **(2026-10-06)** That visibility is the node's `access`, the only one: `x.public` is whether it reaches `@public`, and
  `x.publish` makes it public. Commits, references and items have no `visibility`/`draft`/`staged` of their own (World W3.3).
- **From the drafts review (2026-10-06):**
  - **8.3.1 Conditions on the viewer — Q.** Branching on who views (*IDE:630–631*). Recommend: `if @public { … } elsif @me { … }` tests the current viewer's chain (`&@`) against a visibility; a visibility used as a condition answers whether the current reader satisfies it.
    **Answered (user, 2026-10-06):** yes: a character used as a condition is equivalenced to a boolean, whether it is `@me` (the current reader).
  - **8.3.2 Streamer mode — Decided (journal).** Streaming runs the renderer as an actor whose grants exclude `@me`'s private fields; what it may not read is drawn as absent. *IDE:847*
  - The clamp on `confidential`, the policy's fixed exceptions and per-entry visibility are World W5.5–W5.7.

### 8.4 Processes and quests
- **Decided (2026-10-06):** the language makes no process calls. Running anything is running a Program.
  - There is no `Process`, no `Jobs` runner and no `OS.run`.
  - **Programs are quests (user, 2026-10-06).** There are no jobs and no separate `Quest` class (the name was dropped): every Program has a `who` that runs it (a selection: `@me`, `@me.device`, `@alice`), its own cursor (`at`, `started`, `results`; `done`, `running`, `progress`, `.stop`), an optional `goal` (`reached`, `attempt`), and `abstract`: its steps that call something defined nowhere, which `who` performs. A human quest is structured the same way, and the human runs it. `Abstract := Program{abstract.nonempty}` is what used to be answered as a `Quest(name:, goal:)`: a program of one abstract step, written `Program(name: "rename", goal: …)`.
  - A character's running programs are a selection on it: `@me.quests` (`Program#{who: this}{running}`), paths being `.`, so `@me/quests` and `@me/device/quests`. `@me/quests |= program` writes that condition, which starts it. The daemon is Ether's scheduler for the computer's programs.
  - What used to be a process is a typed read or write of a location:
    - the browser's file system is `@me/device/storage/<key>`, which the page keeps in `localStorage`;
    - a remote file system over HTTP is `$.http` requests: GET reads, PUT writes, DELETE removes and WebDAV's PROPFIND lists (RFC 4918);
    - the browser's time zones are `@me/device/os/zones`, which the page answers from `Intl.DateTimeFormat`.
- **Planned (not decided):** other systems are reached by inspecting their binaries.
  - The containers are `$/elf`, `$/pe`, `$/macho` and `$/wasm`. The code is `$/x86-64`, `$/aarch64` and wasm bytecode.
  - Inspecting is reading: symbols, imports, strings and the version. A binary's imports are a Project's dependencies.
  - Using a binary lifts its code into a Ray Program. Its syscalls and imports become effects on Ray locations, checked by Access.
  - Native execution is an optimisation level, not a process.
- **From the drafts review (2026-10-06):**
  - **8.4.1 Ray as the shell — Q.** The note wants a shell replacing the terminal's, running as Ray (*IDE:849*). Recommend recording it as planned: the REPL over `@me/jobs` and locations is the shell, and `$.sh` is the language that reads existing scripts into it.

## 9. Data and version control

### 9.1 Storage apart from shape — *IDE:553–573*
> Class$ uses that — in memory/disk dynamically. Arbitrary graphs, not just rows/columns. How it's stored diverges from how it's shown (as a filesystem). Fields versioned like classes: renaming doesn't create a new object; the version history has an id. Uniqueness and eventual uniqueness (conflicts allowed but forced to resolve). Partitioning, optimizations chosen automatically (Fastlanes, ALP, FSST, dict, bitpacked, RLE, delta …, all part of the language index). Frontends (a filesystem, git) disconnected from backends; version control composes existing VCSs as frontends, bidirectionally.

- Proposal:
  - `Class$` is the persistent store of a class's instances. A field's identity is its version-history id, not its name.
  - An encoding (dict, RLE, …) is an optimization rule on the storage program, a Compiler level like any other.
  - A frontend is a view program (filesystem, git) with an inverse (§4.5) so writes flow back.
- **Decided:** `Class$` is the spelling.
  - `$` on its own is *languages*: `$.ray` answers the Program that is the Ray programming language, and `$.cpp` / `$.c++` is C++.
  - This matches the repository layout (the outside languages are in `@ether/$/`).
- **Decided:** where `Class$` stores is itself defined, and may differ by context.
  - For example, the store may sit under the current user, with many instances kept like a database.
  - Several databases: `ClassA{filter}$ = DB` sends the instances that pass the filter (for example those located inside `@user`) to that store. Stores are routed this way.
  - A `persistent` value is kept in its class's `$`.
- **Decided (2026-10-06):** `$.name` answers the language called `name`, loading it when it is not loaded.
  - `$.ray` is Ray itself (`Language.ray`).
  - Any other name is the project `@ether/$/<name>`: the folder is the language's name in lowercase (`$/git`, `$/json`, `$/html`).
  - The first `$.name` reads that project, once. Its dependencies are read when they are first referenced (below). It answers the language in it whose extensions include `.name`.
  - Without such a project, `$.name` answers a loaded language with that extension, or a `Quest`.
- **Decided (2026-10-06):** every language from outside Ray lives in its own project under `@ether/$/`, and nothing in the core depends on one.
  - Each project has its own `.project.ray`, which lists the other `$/…` projects it needs as `@zlib` (Decided 2026-10-06: `@X`, not `@ether/$/X`; `@X` resolves to the project in `@ether/$/X` for now, and will later map to the repository named X).
  - Its claims are in its own `tests/` project.
  - Every language stays at `@ether/$/<name>`. A part of the library bundles the languages that belong to it by listing them in its `.project.ray`: `@ether/ui` lists `$/html`, `$/css`, `$/js`, `$/json`, `$/ansi`, `$/sixel`, `$/kitty`, `$/opentype` and `$/png`; `@ether/network` lists `$/http`, `$/dns`, `$/websocket` and `$/hpack`. A language in the part is read when it is first referenced, not when the part is.
  - A language may depend on other languages and on the project that bundles it. Loading tolerates a mutual dependency: a project is marked as loading before its dependencies load, so a cycle stops where it comes back, and every project in it ends up loaded once.
  - A project that uses a language either declares it in its `.project.ray` or reaches it through `$.name`.
  - The core reaches them only through `$.name`, lazily. Examples: in an optimisation level that picks a format (`StoreOptimizations` answers `$.sqlite`), in the enforcement of a permission (`as $.posix`), or in a store route (`$.git`).
  - A `$/<name>` project holds only the outside language: its syntax, levels, API values and tests. What is specific to Ray stays in the Ray library. The renderers are Ray's, so they are in `@ether/ui`: `UI.HTML` writes `$.html`, `$.css`, `$.js` and `$.json`, and `UI.TUI` writes `$.ansi`, `$.sixel` and `$.kitty`. `Language.Direct`, Ray's own raster drawing, stays in the core UI, and its fonts are `$/opentype`.
  - **(2026-10-06)** A language is declared one way: its class is `class: Language`, with its header when the format has one (`JSON := class: Language (Blank, root: Value, Blank)`), so `$.name === Name` for every project; there is no `static language = Language(…)`. Reading is `Name.read`, writing `Name.write` or `x as Name`.
  - **(2026-10-06)** A format reads straight into Ray values with one grammar, its headers, which also write it; `@name` fragments read with the same headers, a hole being a Ray value at a typed position. There is no record vocabulary between a format and Ray: a `@js` fragment is a Ray program, and writing JS is one Compiler level over Ray's program shapes. Kinds of a value (an HTTP status class, a DNS record type, a Noise token, a PNG filter) are narrowings with their own members.
  - **(2026-10-06)** Pieces several languages share are their own projects: `$/hmac` and `$/hkdf` over any `Encoding.Digest` (each digest gives `block` and `size` in bytes), and `$/crc32`. A curve's field belongs to the language that defines it (`X25519`; `Ed25519` declares `@x25519`).
  - The core keeps only what it needs to work:
    - UTF-8 and the Unicode tables, because a String is characters;
    - ISO 8601, because a Time is written and read as one;
    - the base-N digits, because a Number is written in them;
    - Ray's own storage formats (`.%`, `.columns`, `.kv`), because they are Ray.

- **Decided (2026-10-06):** dependencies resolve lazily.
  - Reading a project does not read its dependencies. A dependency is read the first time it is referenced: through `$.name`, through `@name` in code, through a name the project does not define itself, or through a file in its language (`Project.load`, `Project.Dependency.project`, `Language.named`).
  - `@name` in code is the project of the dependency declared as `@name` in a loaded project's `.project.ray`, and `@name/path` is a location inside it. Where no loaded project declares `@name`, `@name` keeps its other meanings (`@me`, a character, a relative location).
  - Data a dependency's project names but does not hold, like `@tzif/zoneinfo` (the full IANA database compiled to TZif), is a location like any other. Ether reaches its content through mirrors (World W2.9) and shards (World W2.7, Universal U7), and keeps it through a cache, which is an optimisation level (§9.1, §9.2). This is later work: until then reading such a location answers a `Quest` (`FileSystem.Mirrored`).
  - The OS is its own project, `@ether/os`, which declares `@tzif`. The core does not read it at startup: a device with no host platform takes its OS through the level `OS.devices`, which references `@ether/os` and answers `OS.Ether`.
- **From the drafts review (2026-10-06):**
  - **9.1.1 A language keeps its identity across renames — Decided (draft).** Old names are equivalences (`$.coq` ≡ `$.rocq`), as are its several extensions; dialects are its children in the class hierarchy. *`.ray2/Program.ray:343–347`*
  - **9.1.2 Recognising a language from content — Q.** Detect a file's language and version from the file itself (*IDE:191*). Recommend: `Language.detect(bytes)` answers the superposition of every loaded language whose reading accepts the content, ranked by how much each reads (§3.6), each carrying its version (`%N`).
    **Follows (2026-10-06):** no detector of its own: content read by every loaded language answers the superposition of the readings that accept it, each a Language with its version, resolved by use (`Language.detected(content)` names that superposition). From §3.6 (texts several readers accept read as their superposition) and P7.1 (a language is a reading).
  - **9.1.3 Published packages carry URL caches — Decided (journal)** that publishing requires a cache of every `@https://…` dependency, so the runtime can fall back to it when the source is gone. **Q:** the default visibility of that cache; recommend `@public` when the source was `@public`. *IDE:459*
    **Follows (2026-10-06):** (the Q) the cache inherits its source's visibility: public for a `@public` source, private otherwise. From §8.3 (an item inherits its visibility) and W5.7.
  - **9.1.4 Per-file granularity — Decided (draft).** The later-work mirrors and caches above include single files of fetched repositories, not only whole ones. *`_todo/_download_dependencies.sh:3`*

- **Decided (user, 2026-10-06): subprojects.** A folder with its own `.project.ray` inside a project is a subproject.
  The parent never sees it without an explicit import (`Project.sources` skips it); a subproject sees its parent
  automatically (`shadowing => (parent, dependencies.project)#`). `@ether/security` and `@ether/network` are such
  subprojects of the Ether project `@ether` (`@ether/security/`, `@ether/network/`), imported by nothing by default.

- **Decided (user, 2026-10-06): layout.** `@ether/` is the Ether project (no `.ray/` or `v0/` level: the library, `v0.ts/`, `spec/` and `ide/` sit directly in it); its `.project.ray` imports `@ether/network` and `@ether/version`, and it holds `Ether.ray` (the standard `@` names), `World.ray`, `Device.ray`, `Messaging.ray` and the instance entrypoints (`entrypoint.server.ray`, `entrypoint.npc.ray`, `entrypoint.player.ray`).
  - `@ether/ray/` is the core, the project `@ether/ray` (`!language`): Node, Ray, Number, String, Unicode, Encoding, Program, Control, Compiler, Language, Project, Location, Character, Format, Reporting, Time, Unit, UUID, IP, Roman, Access, Feature, the outside languages in `@ether/$/`, and its claims in `@ether/ray/tests/`. Every project assumes it without an import.
  - Subprojects of `@ether`, each with its own `.project.ray`: `security/`, `network/`, `os/`, `ui/`, `geometry/`, `version/` (History, Repository, runs' logs, stores and storage levels; imports `@ether/security`), `game/` and `library/`. Folders of projects are lowercase.

### 9.2 Version control — *IDE:412–420, 633–641, 732*
> Hybrid logical clocks / CRDTs; your fork always accessible, can always push; apply a change to all stable versions (respecting their own changes); flag a change as the one that works; group changes; test my changes against the latest instead of merging the latest into mine; label functions inline in `.ray.txt` for non-Ether editors; notify when a monkey-patched function starts being used by a library, or when a renamed parameter breaks a partial call.

- Proposal:
  - Each change is an operation with an HLC timestamp. Branches are views, and "latest" is a query.
  - "Apply to every version" re-runs the operation on each version where its precondition (the code it touched) still matches.
  - Notifications are diagnostics raised when a definition you override gains new callers.
- **Decided:** the first milestone is operations over definitions (functions/fields), HLC-stamped, where a rename keeps identity.
- **Decided (2026-10-06):** there is one API, `History`: a Ray of commits. Every tool talks to it.
  - Commits are stamped by a hybrid logical clock (`Stamp`).
  - A commit holds a `Program`: any Ray, run on the value before it (`.`). A plain value is the program that answers it.
  - A thing keeps its identity across renames because it is the same node; its history's id is the label of the commit that made it (the `.%` draft's `ORIGINAL-UUID-OF-OBJECT`).
  - A history's value is its ancestry folded in stamp order.
  - **Superseded (2026-10-06):** the `Operation(kind, definition, …)` commits, the `Definition` record and the `define | change | rename | remove` kinds were a sub-language between the store and Ray. The user: version control exists to carry the full `.ray` language, so a commit is a program and nothing narrower ("avoid creating IRs").
- **Decided (2026-10-06):** a backend is a Language. Its `level` reads into a `History`, and its `written` writes one out.
  - The backends are `$.git`, `$.mercurial`, `$.fossil`, `$.pijul`, `$.subversion`, and Ray itself (`$.ray`, the `.%` form).
  - Git is just one compile target:
    - cloning is `$.git.read(@https://…)`;
    - pushing is `history as $.git` (or `Git.push(history, remote)`);
    - converting is reading as one language and writing as another (`$.mercurial.write($.git.read(@./repo))`).
  - Routing uses §9.1's syntax: `History{location ∈ @me}$ = $.ray | $.git`. A superposition stores in each of them.
  - **For now (2026-10-06):** the Mercurial, Fossil, Pijul and Subversion backends, with the languages only they use (SHA3, MD5, BLAKE3, Bincode, Zstd, Base32) the unused SHA-512 and Blowfish, the SARIF, TAP and JUnit report formats (LSP stays), the permission backends (POSIX, ACL, Android, browser permissions; a grant is recorded, not enforced on the platform) with XML, the SQL stores (SQL, SQLite, Postgres) the terminal image protocols (Sixel, Kitty; images are drawn as text) and the shell language (`$/sh`), are on the branch `version-control` for later; main has Git only (with SHA-1, zlib, DEFLATE, and SHA-256 for git's SHA-256 object format).
- **Decided (2026-10-06):** there is no `Backend` class. A backend is a plain `Language`; what was generic moved to where it belongs.
  - `Language` has `fidelity` (`Language.Fidelity`), `stored` (the language's own storage level), `Language.Entry` (a tree of files, for a language that writes more than one), `written_to`, `converted` and `tree_at`.
  - `Language.write` answers text, or an `Entry` when the language writes files.
  - **(2026-10-06):** `Language.Entry` and `Language.Fidelity` are gone. A language that writes files answers a tree of Locations with content (`Location.placed`, `files`, `at`); a directory is `Directory := Location{content === None}`, an executable `Executable := Location{access is Access(method: `()`)}`, a link a getter redirect (`a = => b`), a module a Project dependency. Fidelity is the narrowing `Language.Lossless` (reads back what it writes); `.ray` is declared `Lossless`.
  - `History` has what is about histories: `History.change(before, after)` (the change between two trees, written as Ray: moves `.["b"] = .["a"]`, removals `= None`, assignments), the rename `similarity` and its `similar` threshold, `History.read_file` and `History.valued` (a tree as a value). A backend reads its commits straight into `History.Commit`s; there is no `Revision` record in between.
  - `Encoding.common` and `Encoding.runs` are the shared byte diff the deltas use.
  - The other families get the same treatment:
    - `SQL.Dialect` is gone: `$.sqlite` and `$.postgres` are plain languages over `$.sql`.
    - `FileSystem` stays a subclass of `Language`, because it adds operations a language does not have: listing and removing. (`Package` did too, for resolving, fetching and installing; it was removed with the package managers on 2026-10-06. `Jobs` did, for job control, until processes were removed on 2026-10-06, §8.4.)
    - `Encoding.Digest` and `Encoding.Packing` stay subclasses, because they change what reading and writing mean: a digest is one-way, and a packing keeps what it packed.
- **Decided (2026-10-06):** `Ray.history` is `Node.history`. There is no separate `Ray.history`.
  - A node's `history` is its `History`. The `.%` form is the Ray language reading and writing a History (`Language.ray.write(history)`, `Language.ray.read(@x.%)`).
  - There is no `.%` grammar of its own: `History.Commit`'s class header is its line, so a commit reads and writes itself, and a history is a `Program` (`history as Program`, `program as History`).
- **Decided (2026-10-06):** each backend declares its fidelity, `lossless | snapshot`.
  - Ray (`.%`) and Pijul are lossless; Git, Mercurial, Fossil and Subversion are snapshot backends.
  - Writing to a snapshot backend:
    - A commit's operations become one tree. Each definition is a `.ray` file written by the Ray writer, and the tree is a Hierarchy.
    - Parents become the commit's `previous`, the author is `who`, and the date is `when`.
    - The commit's `.%` line (its program) is kept beside the commit, so reading our own repository back is exact. Each backend has its own place for it:
      - Git: notes under `refs/notes/ray`;
      - Mercurial: the changeset extra `ray`;
      - Fossil: a `T +ray` control artifact;
      - Subversion: the revision property `ray:line`.
  - Reading a foreign repository writes each commit's change against its first parent as a Ray program (`History.change`).
    - A rename comes from the backend's own record where it has one: Mercurial's copy metadata, Fossil's `F` old name, Subversion's copyfrom.
    - Otherwise it comes from line similarity of at least 50%.
    - A tie is `Quest("rename")`.
- **Decided (2026-10-06):** the `.%` format.
  - The stored form is the program. The working directory holds the resulting value, as in git.
  - A line is `UUID\ with (@me = @who; now = X) <change>` (9.2.6, user 2026-10-06). The change is any Ray, applied to `.`, the value before.
    - The parent is the line above.
    - A line with another parent starts from it: `UUID\ with (…) . = A; <change>`; a merge starts from both, `UUID\ with (…) . = A & B`. A label read as a value is the value there.
  - A body is whatever was run: `+ "B"`, `.x = 1`, `.["b"] = .["a"]; .["a"] = None`, a loop, a class. There are no body forms of its own (the draft: `(&caller = …; 0..100.for this += 1)`).
  - Checking out is running the file up to a label. Committing appends one line and reads nothing back.
  - A label inside a body points at an intermediate result.
  - There is no `.%/index.ray`: names are in the program itself (`.greet = …`). The draft wanted an index only while UUIDs could not be assigned through an interface.
  - The writer escapes newlines in strings, so a line that starts `UUID\` is always a commit.
  - Any labelled Ray program is a history (`program as History`), and `x.history` is the in-memory view of the same file.
- **Decided (2026-10-06):** the backend, the storage granularity and the caches are Compiler levels. They are a choice of format, not fixed layout. `Compiler.stored` composes them and every backend read and write uses it.
  - `formats` reads a superposed store from its lossless member, and answers a checkout from a snapshot backend's tree.
  - `per_object`: no layout is canonical (9.2.8); without it a history is written as one file, `.%/<id>.ray`.
    - Past 1 MiB it is split into one file per object.
    - The project's lines then become pins, `.["name"] = @./<id>/<name>.ray%[C]`, and each field's history is its own file.
  - `cached` writes `<id>.ray.txt`, every 64th commit and at the head: itself a history whose commits are the values (`label\ value`). A checkout starts from the nearest cached ancestor.
  - `delta` writes a commit's program as `. edited(from, to, "text")` when that is shorter; it is an equivalent program.
  - Each backend's own level is its `stored`, which its reads and writes add: `$.git.stored` (packs with offset deltas), `$.mercurial.stored` and `$.fossil.stored` (deltas), `$.pijul.stored` (the zstd change file). `Compiler.stored` names none of them.
- **Decided (2026-10-06):** distribution.
  - Stamps give one global order.
  - The STD's and the players' histories are separate commit Rays. `History.global(histories)` joins them under one commit, ordered by stamp.
  - `x%[label]` pins a version.
  - A STD bug fix is a version that the narrowing for the version it fixes also takes (9.2.9); `history.fix(who, old, change)` writes it.
    - A pin resolved for a line stamped after the fix gets the fix.
    - A line stamped before the fix replays as recorded, and its caches stay.
  - Concurrent commits that leave one field with different values (three-way against their common ancestor, `History.clashes`) are `Quest("merge")`.
- **From the drafts review (2026-10-06).** ORIG = `@ether/.%/ORIGINAL-UUID-OF-OBJECT.ray`, NEXT = `@ether/.%/NEXT-UUID-OF-OBJECT.ray.txt`; VC*n* are the review's ids.
  - **9.2.1 Done by 20a1d02.** VC4 (no `Operation` record, no `define | change | rename | remove` kinds: the body is the change), VC5 (no `.%/index.ray`: the draft's index was a bootstrap measure, ORIG:2) and VC6 (a cache is Ray, `label\ value`, read by the Ray reader; no `Cache` record) are resolved by the decisions above. VC1 (a line is a label followed by any Ray) is too, except the time, 9.2.6.
  - **9.2.2 What "up to a label" means — Decided (draft).** A label names the state *after its own statement*: checking out X runs through X's statement and stops at the next label (ORIG:21). (VC7)
  - **9.2.3 Labels inside a body; expansion not stored — Decided (draft).** A label may sit on any subexpression, guarded by `if` (`0..100.for (UUID\ if i == 50) this += 1`). Unlabelled per-iteration states are not stored: they are the line's `.expand` (ORIG:14–15, 40–42). (VC8)
  - **9.2.4 Assigning to a label patches — Decided (draft).** `label\ = value` replaces the subexpression tagged `label\` in later runs: tag `0..(tag\ 100)`, then `tag\ = 99`. This is how the STD is patched without rewriting text (ORIG:37). (VC9)
  - **9.2.5 Out-of-order lines — Decided (draft).** `A + B + C` evaluated as `A + (B + C)` is written as the lines `B`, `.+ C`, `A + .`: a line starting with an operator or `.` continues on the previous line's result, and a line that needs another receiver names it (ORIG:49–56). **Q:** the draft's own ambiguity ("A" not defined on `B + C`); recommend `.` always be the previous result and every other value be written by name. (VC11)
    **Follows (2026-10-06):** (the Q) `.` is always the previous line's result, and every other receiver is written by name. From §9.2's `.%` format (a change is applied to `.`, the value before).
  - **9.2.6 Who and when — Decided (user, 2026-10-06).** Not header positions: a line is `LABEL\ with (@me = @who; now = X) <change>`, ordinary Ray. `with` sets the context the change runs in: `@me` is who made it (replacing the draft's `&caller = …` and the `@who { … }` form above) and `now` is its time (the draft's `&Time.NOW = …`, ORIG:11). (VC13, VC1)
  - **9.2.6b The settings are `.cfg.ray` — Decided (user, 2026-10-06).** A line's `with (…)` settings are read as `.cfg` (`Language.cfg`, which admits only `Program{Pure & Terminating}`), so reading a history forces the halting check on them to succeed. A fix names the versions it also is with `version = OLD` there (9.2.9).
  - **9.2.7 `&caller` — Decided (user, 2026-10-06).** Superseded by `with (@me = @who)` (9.2.6). The draft's other meaning, the function version that caused the change (ORIG:42, 58, 67–69), is not a line field; it is what the change's code itself calls. (VC2)
  - **9.2.8 Files — Decided (user, 2026-10-06).** Neither one file per object nor one per repository is decided: the compiler chooses. The spec only describes declaratively what happens (a history is a Ray of programs over a value); per object, per project, splitting and caches are optimisation levels (W3.13). (VC3)
  - **9.2.9 STD bug fixes — Decided (user, 2026-10-06).** A function is one thing; its versions each add or mention part of how it is structured. A pin is a narrowing of the function over that constraint, which collapses to the function that is required, so a fix is one more version that the narrowing for the fixed version also takes. Which version a narrowing collapses to is chosen by the compiler, and this is a general mechanism (narrowing a superposition of partial definitions), not one for version control. Still open from the draft: refusing a history written against a pre-fix version. (VC10)
    **Follows (2026-10-06):** (the remainder) refusing a history written against a pre-fix version needs nothing of its own: a line stamped before the fix replays as recorded, and whether to accept it is a setting of the run, as in §9.2.12. From §9.2 distribution and §8.1 (trust is a run setting).
  - **9.2.10 Pinning the STD — Q.** Above, `History.global(histories)` joins the STD's and the players' histories. The draft pins the STD inside a history with an ordinary assignment, `global = global%[UUID-VERSION-OF-STD]`, keeps STD and player histories in separate subdirectories, and wants three global orders: STD + player, STD only, player only (ORIG:13, 26–29). Recommend the draft's statement; the three orders are queries over stamps, not stored. (VC12)
    **Follows (2026-10-06):** the draft's statement, `global = global%[UUID-VERSION-OF-STD]`; the three orders (STD + player, STD only, player only) are queries over stamps, not stored. From `x%[label]` pins (§9.2 distribution) and the history queries (World, Decided 2026-10-06).
  - **9.2.11 Program labels vs UUID labels — Q.** A program's own labels must not be read as UUIDs, and `\.` in strings must be escaped (ORIG:16–17); above, the writer escapes newlines. Recommend: UUID labels match only the UUID pattern, so word labels never collide. (VC14)
    **Follows (2026-10-06):** a UUID label matches only the UUID pattern, so a word label never reads as one (`Version.Pin`'s `label: UUID | Char.Word[]`). From T4.10 (types are patterns) and §10.2 (UUID is a structure).
  - **9.2.12 Reading without trusting a history's claims — Q.** Loading a history while ignoring what it claims (such as implementing another version) (ORIG:6). Recommend a run setting, like `speculate`/`refuse` (§8.1): `with History.trusted = false`. (VC15)
    **Follows (2026-10-06):** a setting of the run, `with History.trusted = false`, under which a line's claims (its `version =` settings) are read and ignored. From §8.1 (`speculate`/`refuse` are settings of the run, not of definitions) and §6.3 `with`.
  - **9.2.13 How commit UUIDs are made — Q.** v0 uses random `UUID.v4` with explicit who and when. The drafts derive them: a v1 UUID whose time is `when` and whose node is the committing character's id (*`.ray2/History.ray:39–48`*); a player's or instance's node derived from its public key (*`.ray2/_todo/ray.ray.txt/Ether/instance/Entity.ray:91`, `…/Expression.ray:49`*); UUIDs made from the player's or organisation's public key (ORIG:4). Recommend keeping random ids with explicit stamps (9.2.6), or, if reproducible ids are wanted, a name-based v5 in the namespace of the owner's public key. (VC16; with Text X5)
    **Answered (user, 2026-10-06):** v1, as the drafts: the time is the commit's `now`, and the node is derived from the committing character's key (`choose UUID.v1{unique}`).
  - **9.2.14 Versions of an operator — Q.** "Specific versions of an operator" (ORIG:10) and UUIDs on sub-expressions (ORIG:24). Recommend: an operator is a definition like any other, so `+%[label]` pins it; sub-expression ids are 9.2.3's labels. (VC17)
    **Follows (2026-10-06):** an operator is a definition like any other, so `+%[label]` pins it; ids on sub-expressions are §9.2.3's labels. From operators being definitions, `x%[label]` pins and §9.2.3 (labels on any sub-expression).
  - **9.2.15 Disconnected branches; `%.fork` — Q.** Different implementations are branches of one history, possibly with no common ancestor; the grammar variants (EBNF, ABNF, …) as branches of BNF's history; `%.fork` with `location &= …` (*`library/Index.ray:10, 22–28, 117`*). Recommend: a history may hold disconnected branches, and a fork is `x%.fork`, an ordinary method. (VC19)
    **Answered (user, 2026-10-06):** yes: a history may hold branches with no common commit (several initial boundaries, R1.4); forking is `x.copy` with a forked history; no `%.fork`.
  - **9.2.16 Commuting changes merge without a quest — Decided (draft):** concurrent changes whose result is the same in either order merge in any order, without a quest (*`.ray2/History.ray:29`*). **Q:** "the same" under which equivalence; the library notes take causal invariance as the merge criterion, with sameness a chosen check (*`projects/library/phases/Project Index.md:259–265`*). Recommend: concurrent lines merge when their results are equal under the chosen `==<in: …>` (U9, R3.14) in every order; a conflict is when they are not. (VC20)
    **Follows (2026-10-06):** (the Q) concurrent lines merge without a quest when their results are equal under the chosen `==<in: …>` in every order; otherwise they conflict. From U9 and R3.14 (every comparison takes `<in: …>`).
  - **9.2.17 Open.** Distributed edits, how to split a history, and the cost of large arbitrary graphs (ORIG:12, 19, 23; W3.5, W3.7). (VC18)
  - **9.2.18 A user's earlier definition keeps working — Decided (journal):** when a later library or language version defines a name the user had already added, the user's definition keeps applying in the user's code, the newer one applies elsewhere, and the user is notified (*IDE:82*; the reverse case is *IDE:636* above). **Q:** the mechanism; recommend the user's pin on the language version (`x%[label]`), so nothing new is needed.
    **Follows (2026-10-06):** (the Q) no new mechanism: the user's code holds a pin on the version it was written against (`x%[label]`), and a pin is a narrowing that collapses to the required version. From `x%[label]` pins and §9.2.9.
  - **9.2.19 The central platform is only an index — Q.** Users keep ownership of their data, and the central platform only indexes it, as DNS does (*IDE:253–255*). Recommend: the `@ether` server indexes where histories are, not their content; a history lives at its owner's locations (`@me.managed`, U7), and `@ether` maps names to them (W1.4).
  - **9.2.20 Trying a change on part of the traffic — Q.** A/B rollouts through a load balancer (*IDE:540, 626*). Recommend: a rollout is a weighted superposition of two pins, `0.1(x%[new]) | 0.9(x%[old])` (U8); each request realises one, and the weights are a setting of the location that serves it.
    **Follows (2026-10-06):** a rollout is a weighted superposition of two pins, `0.1(x%[new]) | 0.9(x%[old])`; each request realises one, and the weights are a setting of the location that serves it. From U-C1/U8 (weights and fractions are one thing) and pins.
  - From the drafts verification (2026-10-06).
  - **9.2.21 A namespace name is the latest variant — Q.** "Compile STD changes from files into a list of UUID-variants of the objects. Anything on the namespace like Ether/Network pointing to the latest version as a string." (ORIG:28). Recommend: a name in a namespace (`@ether/network`) answers the latest variant of the object, by query (latest is a query, above), and a history that pins a version reads that variant (`x%[label]`); the variants are the object's `.%` history.
  - **9.2.22 Short ids for versions — Q.** `global = global%[UUID-VERSION-OF-STD] //TODO Use like a Node ID fff37839 or something.` (ORIG:29). Recommend: a version may be written as an unambiguous prefix of its UUID, as git abbreviates hashes; the full UUID is what is stored.
  - Commit-level items from the same review are World W3.19–W3.24 (location history, `.expand`, local order, branches and tags, rebase, REPL sessions).
- **What the `.%` draft writes** (ORIG, NEXT; for reference, 2026-10-06):
  - `.%/<ORIGINAL-UUID>.ray` is the history of one object, named by its original UUID (the label of its first line). One file answers every version labelled in it (ORIG:9).
  - `.%/<VERSION-UUID>.ray.txt` is a cache whose whole content is `label\ value`, the value at that label written as Ray (NEXT:1–2).
  - The `/%/UUID` directory is the canonical shape; storing it more efficiently (database techniques) is an optimisation (ORIG:22).
  - A line is a Ray statement with a label (`\` is the seeking delimiter, ORIG:16): `ORIGINAL-UUID\ (&caller = …; "A")` sets the initial value, then `UUID\ (&caller = …; + "B")` continues on the value so far; `UUID\ &caller = …; 0..100.for this += 1` is the unparenthesised form, `this` the current value; a `<&caller = …>` angle form also appears (ORIG:42–47, 64).
  - Commits append; nothing is re-read to write (ORIG:8). Checkout runs the file to the next label (ORIG:21).
  - Draft TODOs not covered above: a text form for when UUIDs cannot be assigned through an interface (ORIG:1), in-between caches (ORIG:18).

- **Decided (user, 2026-10-06): end-to-end encryption.** Every history that is not public is stored encrypted for its
  readers, by default; it is one storage level (`encrypted`, added to `Compiler.stored` by `security/`) with the key
  wrapping, both in `security/`; version control knows no keys (World W2.1).
  - A line keeps in plaintext what storing, ordering and checking need: its label, parents, stamp, signature and
    which content key it uses (`with (…; key = K₃)`); its change is ciphertext.
  - A history has a symmetric content key, wrapped for each reader's instance key (HPKE, RFC 9180: X25519, HKDF,
    ChaCha20-Poly1305); readers are whoever its access lets `read`. Adding a reader is a commit wrapping for them the
    keys their grant covers (below); removing one rotates to a new key wrapped for the rest (they keep what they already saw).
  - The signature covers the hash of the line with its ciphertext, so a server verifies chain and authorship without
    reading; the plaintext change carries its own hash inside, so ciphertexts cannot be swapped between lines.
  - `who` has a visibility like any field, inherited from the history by default (then it is in plaintext). Narrowing
    it seals it: `who` and the signature move inside the ciphertext, the server sees a per-history pseudonymous key,
    and only readers check authorship.
  - Merging happens on readers' machines (a server keeps both heads); caches are encrypted with the same key or kept
    local; deltas and compression come before encryption; backends (git) carry ciphertext.
  - **Follows (2026-10-06): logout by access.** What logging out drops is every secret, a `none.read` field, rather
    than every field holding an `Encoding.Key`: each key it holds (lists and tuples of keys included) is zeroised and
    the field set to None, so the next login makes fresh keys; World still knows nothing of Security (World W2.1 Storage).
  - **Decided (user, 2026-10-06): logout.** Logging out zeroises every key on the character, without World knowing
    Security: `character.fields{.value is Encoding.Key}.for(.value.zeroised)` (the instance key, Security's `inbox`,
    and any key field added later; pseudonyms are derived from the instance key, so they go with it).
  - **Decided (user, 2026-10-06): copies.** `history.at(commit)` and `history.fork` are copies of the history
    (`copy ~~ (.head = …)`, `copy ~~ (.base = head)`), so access, `sender`, keys and caches come along; so are `blank`,
    `squash` and what a history is written as elsewhere. `erased` starts from a blank copy without caches.
  - **Decided (user, 2026-10-06): what a new reader decrypts is what their grant covers.** A read grant names an
    expression (§8.2.2), and a history has stretch queries (World W3.17), so sharing (`history.shared(reader)`) wraps
    for the reader exactly the content keys of the commits their grant's expression covers: `@bob.read history` is
    every key (the default, like a clone); `@bob.read history{from Time.now}` the current key and later ones;
    `@bob.read history{from label}` the keys from that commit on; any narrowing works. A time as a stretch bound holds
    from the commit current at that time; a label or a commit, from that commit on. A rotation wraps the new key for
    every reader whose grant reaches the head (so covers what follows); a grant whose stretch has closed keeps what it
    covered and gets no new key.
  - **Decided (user, 2026-10-06): anonymous recipients.** A wrap carries no recipient key or identifier in
    plaintext, and a line's wraps are stored in random order. Each wrap has a short tag only its reader recomputes:
    the HPKE shared secret's labelled expansion over the line's label (RFC 9180 §4, RFC 5869), so a reader finds
    theirs by the tag instead of opening every wrap. The writer's own wrap is like any other, so a sealed sender
    stays sealed even when the writer is not a reader.

## 10. From the drafts (`.ray2`, `.ray3`) — what v0 doesn't have yet

Paths are relative to `@ether/`; `ep` = `ray/.entrypoint.ray`. Each line gives what it is, where the draft writes it, and what it needs. Items already specified above are not repeated. **Q** marks the ones that need your decision before implementing.

### 10.1 Syntax and operators
- `??` null-coalescing: `.ray3/Node.ray:213`. **Done** (Node's `??`, before its postfix `?`; boolean.ray BN1–3).
- **Decided:** `?` has three uses:
  - `T?` = `T | None` (postfix on a type, as in v0).
  - `c ? a : b` (the ternary, `.ray3/Node.ray:214`). **Done** (boolean.ray BT3–5). It needed the engine to stop counting the space written inside a literal (` ? `) as spanned, so the longer rule wins over Node's postfix `?`.
  - A bare `?` value is *unknown*, superposed by default (`.ray2/Node.ray:211`); also the "sorry" of proofs.
- Postfix guards `x if cond`, `x unless cond`: `.ray3/Node.ray:129`. Needs `&caller` (10.3).
- Compound assignment from any operator, `{op}=` (`+=`, `|=`): **Done** as `{a} [x: compounds]{`=`} {b}` (number.ray N133–135). `compounds` refuses an operator whose `op=` is already a method of its own (`==`, `:=`, `!=`, `<=`, `>=`, `&=`); without that filter the rule read `a == b` as `a = (a = b)`. `&=>` / `|=>` (superposing definitions): `.ray3/Node.ray:177–182`. Library.
- Edge-labelled composition `,<edge>`: `.ray3/Node.ray:91`, `.ray2/Character.ray:19`. Engine (the `,` list would carry edge data).
- `.( expr )`, applying in context (`var.(condition ? == : <=)`): `.ray3/Node.ray:236`. Library.
- A variable as an operator, `x {op} y` / `⸨op⸩`: `.ray2/Grammar.ray:418–458`. Syntax.
- Modifiers before a definition, `'()` lambdas (`@public static unordered test '() {}`): `.ray2/Grammar.ray:374–404`. Syntax.
- Several bases, `Test := Super + Super2 { }`, and `Test: Super = class {}` vs `= {}` (an instance): `.ray2/Grammar.ray:356–368`, `.ray2/Node.ray:113`. Engine. **Decided:** the same component addition as §1.5: `Test` is made of both `Super` and `Super2`; its hierarchy stays single (`class: Parent`).
- Multi-line operator continuation (`5` / `+3` on the next lines): `.ray2/Grammar.ray:533–583`. Engine; today only a leading `.` continues a line (§5.4).
- Positional and named arguments mixed: `.ray2/Program.ray:448`. Library, now that `,` composes.
- Destructuring `[first, ..middle, last] = x`, and `match`: `.ray2/Node.ray:47–57`, `:141–144`. Engine.
- String interpolation `"…{expr}…"`: `.ray3/Node.ray:63`. Syntax, together with §1.1's `"…"`.
- Raw grammar blocks `/$ … $/`, grammar phases, and detecting rules that circularly prevent each other: `.ray3/Node.ray:1–38`, `.ray2/Grammar.ray:9`. Engine.
- `chainable` declared on the method (`chainable >= …`) instead of a list: `.ray2/Grammar.ray:38–67`. Engine; spec mark at ep:744.
- Escapes `\0 \t \n \r \x{} \u{} …` and `U+XXXX` literals: `.ray2/Language/String/String.ray:49–65`, `Unicode.ray:101`. Syntax.
- Super/subscripts as `^`/`v` (`Binary⁸`, `1111₂`): `.ray2/_todo/…/utils/Number.ray:93–107`. Engine (Unicode decomposition).
- `√ ∛ ∫ lim ∞ ±`: `.ray2/_todo/…/utils/Number.ray:152`, `.ray3/Ray.ray:85`. Library.
- **From the drafts review (2026-10-06):** **10.1.1 Postfix `?` for whether a property holds — Q.** `x.prop?` as the boolean "this holds", instead of `is_x?` methods (*IDE:829*). It would be a fourth use of `?` beside `T?`, the ternary and unknown, and v0 uses postfix `?` for optional chains (`diagnostics?.nonempty`). Recommend asking how it relates to those; one reading is `x.p != None && x.p as boolean`.
  **Answered (user, 2026-10-06):** no; `if user.admin` already works (T1.7) and postfix `?` stays optional chaining.

### 10.2 Types
- `===`, `!==`, `==<up_to>`, `trivially`: `.ray3/Node.ray:132–150`. Library.
- Negated types `¬T`, `∉ ∋ ∌`; `∈` as `:`: `.ray3/Node.ray:81, 192–219`. Library/syntax. (2026-10-06: `∋` and `∌` are
  dropped; membership is `x is set`, or `{field: value}` in a narrowing.)
- Quantified types `∀ ∃ ∄`, `x: R{^2 < 0}`: `.ray3/Node.ray:220`, `.ray2/Grammar.ray:13–23`. Engine.
- Counted types `1 Object`, `a | an T`; array/repetition types `T[]`, `T+`, `T^n`, `Binary₈[]₄`: `.ray3/Node.ray:76–79, 179, 224`. Library.
- `Option<T>`; None as false/0 (`as boolean`): `.ray3/Node.ray:239–246`. Library.
- `Optional<T>`, `Required<T>`, `Query<T>`, and generic parameters on methods (`map <T>{…}`): `.ray2/_todo/ray.ray.txt/ray.ray:126`, `.ray2/Ray.ray:148`. Engine.
- UUID is a structure (five `Hexadecimal.Digits` groups joined by `-`), so `x: UUID = 6ba7b810-9dad-11d1-80b4-00c04fd430c8` reads it (uuid.ray UU24–26). **Open:** hexadecimal letters written back out by `as_string` don't compare equal to the literal (a pre-existing bug; the tests only round-trip digits).
- Structural `instance_of` / `isomorphic`: `.ray2/Node.ray:159–180`. Library.
- `equivalent` / `equivalence (from) -> (to)`, derived isomorphisms: `.ray3/Node.ray:228`, `.ray2/Feature/Transaction.ray:11`. Engine; connects to §3.5.
- `delegate in Number => object`: `.ray2/Node.ray:218`. Library.
- Normalizers on assignment (`normalizer = .unordered.unique`), `unique`, `.canonical`: `.ray2/Ray.ray:53`, `.ray2/Node.ray:204`. Library.
- `?` as *unknown*: decided, see 10.1.
- `pure` / `deterministic` / `nondeterministic` modifiers: `.ray3/Node.ray:116`. **Decided:** inferred like §8.1, from what a method calls (random, io and time are the sources). Written on a method, the modifier is an assertion that is checked.
- `consistent` back-reference fields (`character: consistent Character`): `.ray2/Character.ray:83`. Library.
- A parameterless function ≡ its return type; a variable ≡ a thunk: `.ray2/Program.ray:512`. Engine.
- `Total | Decidable | Terminating | Halting` filters on Programs: `.ray2/Program.ray:308`. Engine; the sublanguages of §6.2 need them.
- Repeating fractions and irrationals; leading-zero equivalence: `.ray3/primitive/Number.ray:43–52`. Library.
- Complex numbers, trigonometry, `USize` by architecture: `.ray2/_todo/…/utils/Number.ray:7–15`. Library.

### 10.3 Control and functions
- `&caller` (the calling context as a value), with `return` / `finally` / `redo` / `break` / `continue` defined on it: `.ray2/Program.ray:12, 80, 166–225`, `.ray3/Program.ray:9–20`. Engine; the center of this section.
- `recur` (tail recursion): `.ray2/Program.ray:79`. Library.
- Hooks before/after each statement `<{expression}>`: `.ray2/Program.ray:90, 151`. Engine.
- Errors `$`, `$!`, `$?`, `$??`, `$specific.err`; `try` / `catch` / `throw`: `.ray2/Grammar.ray:316–348`, `.ray2/_todo/ray.ray.txt/ray.ray:82`. **Decided:** `$` for errors stays, told apart by position. `$` after a call is error handling; `$` as a name or path segment is languages (§9.1) or branches.
- Coroutines `branch`, `race`, `rush`, `sync`, `defer`, `await`; `pending` and `shared` variables: `.ray2/Program.ray:160, 319`, `.ray2/_todo/ray.ray.txt/ray.ray:31–61`. Engine; connects to §4.3/§4.4.
- `yield` / generators: `.ray2/Ray.ray:9`. Engine.
- `dynamically` (re-evaluate when what it depends on changes), `dynamically assert` as type constraints, `speculative.if`: `.ray2/_todo/ray.ray.txt/ray.ray:94–105`. Engine; spec marks in UUID.ray.
- `if 50%` probabilistic branches: `.ray3/primitive/Number.ray:41`. Library.
- `∘` composition, `Function = Node{(Args) => Return}`: `.ray2/_todo/ray.ray.txt/ray.ray:119`. Library.
- Program state `∙`, `in` / `out` / `args` / `result`, `step(override)`, `parent | caller`, `who`: `.ray2/Program.ray:229–295`. Engine.
- `%` history on every Node (`%.previous`, `%.when`, `<-%`), `++ | copy` forking a variable's history: `.ray2/History.ray:37`, `.ray2/Node.ray:155`. Engine; connects to §9.2.
- `#` superposed iteration, `##` components, `###` class components, `@@ (class)`, per-location values `@`: `.ray2/Node.ray:59–93`, `.ray3/Node.ray:217`. Engine.
- Monkey-patching `Node +=`, `+def`: `.ray2/Node.ray:36`, `.ray2/Feature/Random.ray:2`. Syntax (v0 writes `X.components.hierarchy &= class{…}`).
- Switching the language version at runtime: `.ray2/Program.ray:144`. Engine; connects to §7.4.
- **From the drafts review (2026-10-06):** **10.3.1 Injecting events into others' code — Q.** A user injecting events into code someone else wrote (*IDE:380*). Recommend: injection is a Compiler level the user applies (as P3.1 does for timers) and needs an `execute` grant on the target (§8.2); without one it runs only on the user's own copy.
  **Follows (2026-10-06):** injection is P3.1's mechanism (a Compiler level putting code between statements) applied to someone else's code; running it there is access to `()`, so it needs an execute grant on the target, and without one it applies only to the user's own copy. From P3.1 and W5.1/§10 grants (execute is access to `()`). (= P3.2)

### 10.4 Rays and graphs
- `->` / `<-` / `<-->` as Ray constructors (with §5.2's recursive step), boundary operators `⊢ ⊣ ∙ ⊙`: `.ray3/Ray.ray:1–42`. Syntax/library.
- Real `connected`, `consistent`, `acyclic`, …, loop detection (paths of length ∞): `.ray3/Ray.ray:50–135`. Library.
- Traversers and mixes (`4 * DepthFirst, BreadthFirst`): `.ray3/Ray.ray:90`. Library.
- `+ (at)`, `- (at)`, `±` relative indexing: `.ray3/Ray.ray:83`. Library.
- map / `~` filter / reduce / fold / sort / max / min / zip / join / enumerate / push before-after / pop / remove / contains / partition / flatten / unique / intersection / chunk / split: `.ray2/Ray.ray:82–203`. Library. **Decided:** `~` is for entry points only (§4.2); filtering is `.filter` or a `{…}` narrowing.
- Ranges `a..b`, `..b`, `a..`, `0..10..20`, MultiRange: `.ray2/Ray.ray:22, 113`, `.ray2/_todo/ray.ray.txt/ray.ray:140`. Library; a TS draft is commented in ep:1504.
- `unordered`, `Set`, `Loop = orbit`: `.ray2/Ray.ray:53–158`. Library.
- `Hierarchy` (`parent | previous <- hierarchy -> children | next`), directions `<<- <- -> ->>`: `.ray2/Ray.ray:211`, `.ray2/_todo/…/UI/Geometry.ray:269–292`. Library.
- `~=` subgraph matching with `⊢`/`⊣` anchors; selection `\Boundary\`: `.ray2/Node.ray:24–27, 127, 183`. Engine.
- `context | &`, `relative_context | &&`, `expanded`: `.ray2/Ray.ray:84`. Engine.
- Graph rewriting (DPO/SPO), continuous Real-indexed rays: `.ray2/Ray.ray:5, 216`. Library / unclear.

### 10.5 Strings, encodings, formats
- JSON / XML / YAML / Base64 / HTML (input attributes → constraints): `.ray2/Language/…` (mostly empty files). Library, as structural classes (§ structural header) read by the engine.
- Regex as a language (`/pattern/flags`, classes, `\p`): `.ray2/Language/String/Regex.ray`. Library.
- Hashes (SHA/MD5/BLAKE3), encryption, homomorphic values: `.ray2/Language/Encoding.ray:10–27`. Library.
- The Unicode tables read from `@"https://…"` with `⸨…⸩` templates; collation, bidi, case folding, widths: `.ray2/Language/String/Unicode.ray:5–69`. Library, plus the `⸨⸩` syntax.
- All alphabets for `Char.Letter`, `Char.Symbol`: `.ray2/Language/String/String.ray:39`. Library.
- Calling a string evaluates it as a name; `String[] as String`: `.ray2/Language/String/String.ray:12, 32`. Engine.

### 10.6 Features
- `IO /path` syntax, lazy file programs, `.ray.txt` fallback, mirrors, `%=` shadowing: `.ray2/Feature/IO.ray:8–21`, `.ray2/_todo/…/entrypoint/entrypoint.ray:4–36`. Engine; connects to §6.1.
- `persistent`: `.ray2/Feature/IO.ray:25`, `.ray2/_todo/…/UI/Geometry.ray:158` (`dynamically persistent`). **Decided:** a persistent value is stored in its class's `$` (§9.1), whatever that is defined to be.
- OS namespaces and per-OS files: `.ray2/_todo/…/os/*.ray.txt`. Library.
- Network: protocol registry, URL grammar, ports, sockets, hosts files, CIDR, `Node.Remote`, proxying, handshakes, `< @https://…` imports: `.ray2/_todo/…/Network.ray`, `.ray2/Feature/Network/*.ray`. Library, plus engine for remote nodes.
- Keyboard `pulsed`, `toggled`, `cycle`; UI interfaces, layout (Between/Center/Padding), bounding boxes, styling: `.ray2/Feature/UI/Keyboard.ray`, `.ray2/_todo/…/UI/*.ray`. Library plus the host.
- Proof: equational proofs, `assume` with scoped assumptions, `Proof<…>` types, `∃x: Binary x * x == 25`, `?` as sorry: `.ray2/Feature/Proof.ray:10–110`. Engine.
- Transaction: postfix `!` reverse (`+!`, `map(f!)`), `bidirectional` blocks, partial reversibility: `.ray2/Feature/Transaction.ray:12–72`. **Decided:** `f!` is the same as `f⁻¹` (§4.5).
- Random: `secure`, `seed`; Choice: `Number{choose}`, `choose 10 Number`, `choose 50%`, `choose{unique}`, `()` on a constrained type chooses; procedural generation `choose Room{4..5m x 5..7m}`: `.ray2/Feature/Random.ray`, `Choice.ray`, `_todo/…/ProceduralGeneration.ray`. Library.
- Path references within a file `/path/earlier/in/file`: `.ray2/Feature/Choice.ray:27`. Engine.
- **From the drafts review (2026-10-06):**
  - **10.6.1 Shadowing — Decided (draft).** `x %= y` (also `x.shadow = y`) makes x a shadow of y: reads fall through to y, writes stay in x. A write by anyone other than x's owner copies-on-write into a new entry for the owner. A commit to y is applied to the shadow too, unless the shadow changed that part (then a merge quest). `x %= None` stops shadowing for that path (`IO /instance/entrypoint/entrypoint.* %= None`). *`.ray2/_todo/ray.ray.txt/ray.ray:20`, `…/Ether/instance/entrypoint/entrypoint.ray:4–7, 34–36`* (v0 `Location.shadowing` is only a read fallback.) **Q:** whether a shadow's version and its customisations are reported upstream (`@ether`) by default; recommend only when the shadow's visibility allows (§8.3). **Q:** the spelling `%=` is also §10.1's compound `{op}=` with `%` as modulo; recommend keeping `.shadow =` as the spelling wherever `%=` could read as modulo-assign.
    **Answered (user, 2026-10-06):** `%=` is modulo-assign, the same as every `op=` (`x = x % 3`); no shadowing operator is needed.
    **Follows (2026-10-06):** (the first Q) a shadow's version and customisations inherit the shadow's visibility, private by default, so they are reported upstream only when that visibility lets `@ether` read them. From §8.3 (visibility is inherited; the default policy is private).
  - **10.6.2 `temporary` — Q.** The note is a single word (*IDE:149*). Recommend, if it is a modifier: the opposite of `persistent`, a value never kept in `Class$` nor in history.
    **Answered (user, 2026-10-06):** dropped.

### 10.7 World
- `#name` / `@name` lookup grammar per class, plural collections, fallback to `@ether`: `.ray2/World.ray:14–36`. Engine.
- Characters (status, avatars, addressing, sharding), inventory with loop detection, remote execution as a character: `.ray2/Character.ray`. Library + `dynamically`. (2026-10-06: avatars are names, World W1.11; remote execution is `with (@me = …)`, §8.2.)
- Quests as runnable Programs: `.ray2/Quest.ray:5`. Library.
- History as branches of Programs (merge, conflicts as quests, cherry-pick, squash, git conversion); references derived from history: `.ray2/History.ray`, `.ray2/Reference.ray`. Library + `%`; connects to §9.2.
- Access: READ/WRITE/EXECUTE, `default_privacy_policy`, `confidential` / `internal`: `.ray2/_todo/…/Access.ray`. Engine; connects to §8.3.
- Entities, spawning, instances (login/logout/swap/update): `.ray2/_todo/…/Entity.ray`, `…/entrypoint/*.ray`. Engine.
- Other calendars, sidereal time, TT/TAI: `.ray2/_todo/…/utils/Astronomy.ray`. Library.

### 10.8 Compiler
- Equivalence kinds `force` / `suggest` / `approx` / `optimize`; `==` rules as provably reversible: `.ray2/Grammar.ray:25–144`. Engine.
- Matching over a variable's uses, `where` side conditions: `.ray2/Node.ray:5`, `.ray2/Grammar.ray:147`. Engine.
- Dead code, goto→if, the classic passes (SSA, folding, CSE, LICM), `optimize` / `minimize` / `prefer` / `allow capability`: `.ray2/Compiler/Optimizations.ray`. Library on Compiler levels.
- Timers inserted between statements; `Program >>` stepping; extensional `==` on Programs; racing superposed implementations; resource accounting: `.ray2/Compiler/Optimizations.ray:34`, `.ray2/Program.ray:116–510`. Engine.

### Answer 2026-10-04 evening (L§8.3, U6)
- The top-level default privacy policy is `local`. `confidential` means "the default privacy policy", so it is `local` until someone sets their policy, e.g. to `@private` (which includes the @ether server), and then `confidential` follows it.
- **Grants (2026-10-04 evening):** the U6 modifier prefix. `@company.execute deploy`, `@company.read @company.execute report`, `@me.managed.write settings`, and the same on member paths (`@company.read instance.field`, `@me.status`). `.read`/`.write`/`.execute` are W5.1's one permission: write is access to `=`, execute to `()`, read to the structure or any other method; `.on(method)` names any other method.

### Answers 2026-10-05 (agent B's questions)
- **`as String`.** The canonical form is `x as String`; `.as(String)` works too and is what the library uses where it chains.
- **`%`.** On numbers, `%` is modulo. Otherwise it is the version: `x%`, `%3'2`, `<-%`. Only when what follows is a number does it read as modulo, so `field %1..5` is modulo; version ranges are written `%[1..5]` (or `%.1`).
- **`$`.** `$` alone is error handling; `$some.name` / `$.ext` is a language or format.
- **Regex literal.** `/…/flags` (e.g. `/a+/i`): the flags at the end make it the longest match, so it does not clash with `/`.
- **`with` / `assume`.** Both work and do the same thing; each environment prefers one for what it means.
- **`@actor` / `@origin`.** Not settled: the user leans to the last of the call chain (`&@.last`); a proposal is pending.
- **Anonymous functions.** `(x) => …` as a value should just work; that it doesn't is a bug (Bugs.md).

### Answers 2026-10-05, second round
- **G3.11.** There is no `accepts` and no `alike`. A rule for one operator writes it in the pattern (`{a} - {b} => …`); kinds of operators are what modifiers such as `chainable` say about methods.
- **`&@`.** The call chain of a run (whose origin chain L§8 keeps): `&@.last` is who runs it now, `&@.first` who started it.
  **(2026-10-06)** `&@` is the running Program: `&@.who` is who runs it now, `&@.hops.first` who started it, `&@.may`/`&@.ask` check a grant.
- **Which reading wins.** A longer rule over operators wins over a value's own operator method only where the operators are `chainable`: that is what `chainable` is for. It is not a general rule.

### Answers 2026-10-05
- A conversion method's head is written `as (=== String) => …`; `as String =>` and `as (:== String)` are not used.
- Slices include their end, like ranges: `xs[..2]` is the first three; `xs[..<2]` excludes the end (the first two), as the drafts write it.
