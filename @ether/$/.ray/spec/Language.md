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

### 1.2 `[]` and `()` for arrays — *IDE:287*
> [] and () are interchangeable for array creation?

- v0: `(a, b)` and `[a, b]` both evaluate their inside; `,` composes one `Listed` value (a chain). So `(1, 2)` and `[1, 2]` already give the same list.
- Proposal: keep them equal for lists; the difference is only for a single element: `(x)` is `x` (grouping), `[x]` is a list of one.
- **Open:** confirm `[x]` = list of one, `(x)` = `x`.

### 1.3 `++` — *IDE:291*
- Dropped (no longer applies).

### 1.4 Entry and index — *IDE:280*
> entry is origin no self. .index is from origin.

- v0: `Chain.entry => .head`; `Ray.entry` is `this` for a non-chain, `None` for an empty chain; there is no general `.index`.
- Proposal: `entry` is where a ray is entered from (its origin), never the value itself; `.index` of an element counts from that origin (0-based), so `["A","B","C"].map(entry => entry.index)` is `0, 1, 2`.

### 1.5 Components only when named — *IDE:299–302*
> `["A","B","C"].map(entry: String + Ray => entry.index)` — only provide the `+ Ray` when mentioned explicitly; forcing it to be String ignores the Ray component.

- v0: parameters are typed with `(x: T)`; `+` on types does not exist.
- Proposal: `T + U` in a type position means "a T that also carries the U component". A parameter typed `String` gets the element as a plain String; typed `String + Ray` it also gets its position (`.index`, `.next`, …).
- **Open:** is `: + Ray` (no base type) "whatever it is, plus Ray"?

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

- **Open:** proposal: an unset field reads the class default *live* (a later change of the default is seen) until the field is assigned; storage keeps only assigned fields.

---

## 3. Types

### 3.1 Intersections — *IDE:344–345*
> `var: class` · `var: class & String`

- v0: `A | B` (superposition, used for `T?`); no `&` on types.
- Proposal: `A & B` = must be both (instance of each); `var: class` = var holds a class.

### 3.2 Narrowing by conditions — *IDE:644–649*
> If blocks like `if array.length > 2 … end` change the type of array within that block. `{==.instance_of IP}` automatically casts to IP. Functions should relax their arguments to what they actually use. `def Ray<T = Ray>`. Multiple edits that together make it type-compliant as a single transaction.

- v0: `Type{predicate}` narrowings exist (`Small := Number{. < five}`), `instance_of`, `verify`, `admits`.
- Proposal, in order:
  1. Inside `if x.instance_of(T) { … }`, `x` is treated as `T`.
  2. `Ray<T = Ray>`: `T` defaults to `Ray`.
  3. A statement group `transaction { … }` is checked only at its end.

  Relaxing parameter types to their used parts belongs to the IDE (a suggestion), not the language.

### 3.3 Refined types with the same code — *IDE:707*
> Equivalent code if type is refined like Number vs i64.

- Proposal: an implementation written for `Number` also serves `i64` (a narrowing of Number); a narrowing may override it for speed. This is what the Compiler levels (`Program{O: …}`) are for.

### 3.4 Use counts — *IDE:401–408*
> Linear (exactly once), affine (at most once), borrow, quantitative (0, 1, many). Dynamically assert the number of references to a variable.

- Proposed wording (from your answer): these are **references**. Where a thing is referenced, and how often it is actually used, are statistics the runtime keeps: `x.references`, the places that refer to x, and the count of them.
  - Linear/affine/borrow are then narrowings over them: `x: T{references.count == 1}`, `{references.count <= 1}`.
  - They are checked dynamically first.
- **Open:** confirm `references` as the name, and that a narrowing over it is how linear/affine are written.

### 3.5 Castable methods — *IDE:638, 676*
> If a method doesn't exist on the variable but it is castable to something which does define that method (boolean `&`/`|`), converting and calling should be possible; if a library later implements it, notify the user.

- v0: `as (X)` conversions exist on some classes (Unit, Quantity).
- **Decided:** method lookup falls back to the whole equivalence graph of `as` conversions from the receiver (breadth-first; the nearest conversion that defines the method is used).
- **Open:** two conversions at the same distance both offering the method: error, or the first declared?

### 3.6 Grammar that reads differently per type — *IDE:158–159*
> Type ? + Error. Grammar would be interpreted differently for different types, so throw an error.

- v0: typed captures ask each type's reader; a text two types read differently picks by rule length, then declaration order.
- Proposal: when two applicable readers accept the same text with different results and nothing ranks them, report an ambiguity error at that text.

---

## 4. Functions and control

### 4.1 Non-returning functions — *IDE:213*
- **Decided:**
  - A function typed `=> Never` never returns.
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
- Proposal: `f**.label(args)` runs `f` from `label\`; a body can begin with `goto end` to skip a branch only reachable by label.

### 4.3 Calling what isn't there yet — *IDE:217*
> Call something which isn't filled yet lazily, and assume it can only be put there after it's filled.

- v0: arguments and blocks are lazy (programs); `forward` declares a rule to be implemented later.
- Proposal: reading a declared-but-unset name suspends that computation until it is set (not an error), within one run.

### 4.4 Concurrent access — *IDE:8, 715–716*
> Should you superpose concurrent accesses of a variable? Could be a range of values if writing is overlapped, to model a language's behaviour.

- **Decided:** superpose. Two overlapping writes leave the variable holding both (`a | b`); reading it with a policy (e.g. the last, any, all) resolves it.

### 4.5 Running backwards and inverses — *IDE:10–11*
- **Decided:** a function's inverse is `f⁻¹`, also written `f^-1`; `f⁻¹ (y) => …` declares it, and one is derived when every step of `f` is reversible.

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
- **Open:** the spelling for an operator that groups to the right (`^right` on its declaration was proposed).

### 5.2 `->` and `,` — *IDE:86*
> `->` exchangeable with `,` in most scenarios?

- **Decided:** `a -> b` works like the composition `a, b` when `b` is already filled, but it is really a recursive step.
  - `ray -> .next` is a Ray that steps through `.next` from `ray`, recursively, until `.next` is None.
  - Direction matters, because it says which end is initial and which terminal: `.parent <- a` steps through `.parent` from `a`, and its result ends at the root.

### 5.3 `PATTERN*` — *IDE:276*
> PATTERN* maps to PATTERN, * so that we can have "PATH/"*?

- Proposal: a trailing `*` after a pattern element means "followed by anything": `` `PATH/`* `` = the literal then any rest.

### 5.4 Leading dot on the next line — *IDE:440–455*
> `a =` / `obj` / `.func` / `.func2`: a here is obj, not the result of func2, since it accepts the block. `a = obj.` then `.func` `.func2` would call func2 explicitly. Or force the `.` usage to be the typical call on the next line.

- v0: a line beginning with `.` is read as a member of the line above, so `a = obj` / `.func` calls `func` on `obj`'s line.
- **Decided:** keep today's rule: a line starting with `.` continues the line above.

### 5.5 Nested comments — *IDE:167*
> multiline comments nest `/* /*`

- v0: only `//` line comments; `/* */` appears only in notes.
- Proposal: `/* … */` block comments that nest.

### 5.6 Warnings — *IDE:353–355*
> Warning on a multiline `()` with a `,`: either you want it there or add a newline between the two. Warning when the first statement contains leading whitespace.

- Proposal: both as diagnostics (warnings).

### 5.7 Mixed right-to-left — *IDE:424*
- v0: Partly. Directed scanning exists (direction.ray). Spec: a line may switch direction; the engine reads each run in its direction.

### 5.8 Highlighting by value — *IDE:95, 615*
> Syntax highlight red green blue as red green blue; highlight the thing calling it too. `"".[LANG]` to syntax highlight.

- v0: Done for colours (the `H` theme; `^ {color}` rules paint).
- Proposal: `` `…`.js `` marks a literal as written in that language, highlighted as it.

---

## 6. Paths and names (`@`)

### 6.1 Reserved path forms — *IDE:62, 272*
> `@/` and `@./` are reserved for path names. `@https://` should work, only not accepting spaces; use `@" "` for that.

- v0: Done in `.project.ray` dependency lines: `@./x`, `@../x`, `@/abs`, `@username/package`.
- Proposal: the same forms as expressions: `@https://…` is a location; `@"a b"` for one with spaces.

### 6.2 Config files — *IDE:694–699*
> `.cfg.ray`; & variables … Cfg /file/path, Cfg @me/file … They still get executed. All fields are instantiated with ?() — already the default; if ? then None.

- **Open:** what a `.cfg.ray` changes compared to a `.ray` (only assignments to existing names?), and what `&` variables mean here.

---

(Sections still to come: 7. Versions and the `ether` CLI · 8. Execution and permissions · 9. Data and version control · then what the `.ray2`/`.ray3` drafts add that v0 doesn't have yet.)
