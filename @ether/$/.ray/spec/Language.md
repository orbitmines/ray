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
- **Decided:** equal for lists. For a single element, `y := [x]` is a list holding `x`, and `y := (x)` is `x` (grouping only).

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

### 3.6 Grammar that reads differently per type — *IDE:158–159*
> Type ? + Error. Grammar would be interpreted differently for different types, so throw an error.

- v0: typed captures ask each type's reader; a text two types read differently picks by rule length, then declaration order.
- **Decided:** when two applicable readers accept the same text with different results and nothing ranks them, the text reads as their superposition. It is resolved by what uses it: `d: Date = 2-7` takes the Date reading.

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
- **Decided direction:** entry points use `~`, as in the drafts (`.ray2/_todo/…/UI/Geometry.ray:110–131`, `.ray2/Program.ray:164`):
  - Labels in a class body (`profile\`, `"Profile Name"\`, even `{variable_label: Number}\`) are alternative entries: alternative constructors, or renderings.
  - `Ball~default()` is the ordinary one. `Ball~profile()` and `Ball~"Profile Name"()` enter at that label; `Ball~5()` picks the fifth.
  - `Ball = Ball~profile` sets which one is the default; `with Ball = Ball~profile` does so only in a context.
  - `Node~method` names a method as a place, e.g. to insert something after it for precedence ordering.
- **Open:** does `with X = …` (a change seen only in that context) belong to this section, or to the scoping rules?

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
- **Decided:** the same forms are expressions anywhere in code: `@https://…` is a location value; `@"a b"` for one with spaces.

### 6.2 Config files — *IDE:694–699*
> `.cfg.ray`; & variables … Cfg /file/path, Cfg @me/file … They still get executed. All fields are instantiated with ?() — already the default; if ? then None.

- **Decided:** the language defines *sublanguages*, in which only certain kinds of code are permitted. Configuration lives in a sublanguage of Ray instead of `.yml`/`.json`. A `.cfg.ray` file is written in the sublanguage whose code provably halts and provably has no side effects (no HTTP requests, no IO).
- **Decided:** a sublanguage is a Program level: a scope of rules without the IO externals and without unbounded loops.
  - A `!language` project configures which files are read in which sublanguage.
  - Such files are always named `FILE_NAME.[extension].ray`, e.g. `package.cfg.ray`.
- **Open:** what `&` variables mean in the note (*IDE:696*).

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
- Proposal: a migration is a function `%4 -> %5 (old) => new` declared beside the thing it migrates.

### 7.3 Errors carry their version — *IDE:432*
> error[X] where X is the version the error type got introduced, plus a number.

- Proposal: a diagnostic's code is `E<version>.<n>` of the language version that introduced it (the engine already prints codes like `0.E2027.0A.1`).

### 7.4 Shipping the spec one depends on — *IDE:91*
> Ship with the implementation of the language spec we depended on; if the interpreter doesn't support that version yet we can still run on older versions (forward compatibility).

- Proposal: a package records `@ray %N` it was written against, and carries that version's `v0/*.ray` when the host interpreter lacks it.

### 7.5 The `ether` command — *IDE:99–141*
> `ether @c++ %` lists versions; `ether @c++ @` lists locations (@clang/@linux/@apt | @clang/@windows); `ether @c++.ray @clang/@windows/@x86-64 %0.16.0`; `ether @c++ @local`; `ether clone|install|use [--global] @c++`; expects an `entrypoint.cli.ray`; `ether @ray […]`, `ray` maps to `ether @ray`. Layout `.ether/external/@/@clang/$/@windows/@x86-64/%/0.16.0`, the top-level `@clang` being the checked-out version, changed versions under `$/@<USER>%branch`. `.ray` reserved for the mapping `@ray/@c++`.

- v0: the `ether` CLI exists (Ether/library Index, per-language scripts), with a different layout.
- Proposal: the CLI is a program in the cfg-like CLI sublanguage (`entrypoint.cli.ray`). Its grammar is the note's: `@name` names, `/`-joined locations, `%version`. `.ether/external/@/…` stores what it fetches.
- **Decided:** adopt the note's layout `.ether/external/@/@clang/$/@windows/@x86-64/%/0.16.0` now, replacing the current one.

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

- Proposal:
  - Every run has an `@actor` (who runs it) and an `@origin` (whose code it is).
  - A permission is a `.cfg.ray` rule over `(origin, capability, target)`: `@company may network @https://api.x.com`.
  - Data carries a mark saying its derivatives may not leave (`local`); the engine tracks it through composition, the way `listed_by_separator` is carried.
- **Decided:** the origin is the whole chain (company ← me ← library). Permissions see every hop, and a prompt says "@company wants to run this, originating from @me".

### 8.3 Visibility — *IDE:31, 70, 195, 226, 245*
> visibility and contract (license); visibility of visibility (can find it in the index but not access it); how to say the parent shouldn't be visible but I should be readable, or the other way — which is the default; @public for streaming.

- Proposal:
  - Visibility is a field of each item, `@public | @me | @<group>`, default inherited from the parent.
  - Readable and findable are separate: `findable: @public, readable: @me`.
- **Decided:** an item inherits its parent's visibility. At the top it falls back to the default privacy policy, which is private.

## 9. Data and version control

### 9.1 Storage apart from shape — *IDE:553–573*
> Class$ uses that — in memory/disk dynamically. Arbitrary graphs, not just rows/columns. How it's stored diverges from how it's shown (as a filesystem). Fields versioned like classes: renaming doesn't create a new object; the version history has an id. Uniqueness and eventual uniqueness (conflicts allowed but forced to resolve). Partitioning, optimizations chosen automatically (Fastlanes, ALP, FSST, dict, bitpacked, RLE, delta …, all part of the language index). Frontends (a filesystem, git) disconnected from backends; version control composes existing VCSs as frontends, bidirectionally.

- Proposal:
  - `Class$` is the persistent store of a class's instances. A field's identity is its version-history id, not its name.
  - An encoding (dict, RLE, …) is an optimization rule on the storage program, a Compiler level like any other.
  - A frontend is a view program (filesystem, git) with an inverse (§4.5) so writes flow back.
- **Decided:** `Class$` is the spelling.
  - `$` on its own is *languages*: `$.ray` answers the Program that is the Ray programming language, and `$.cpp` / `$.c++` is C++.
  - This matches the repository layout (`@ether/$/.ray`).

### 9.2 Version control — *IDE:412–420, 633–641, 732*
> Hybrid logical clocks / CRDTs; your fork always accessible, can always push; apply a change to all stable versions (respecting their own changes); flag a change as the one that works; group changes; test my changes against the latest instead of merging the latest into mine; label functions inline in `.ray.txt` for non-Ether editors; notify when a monkey-patched function starts being used by a library, or when a renamed parameter breaks a partial call.

- Proposal:
  - Each change is an operation with an HLC timestamp. Branches are views, and "latest" is a query.
  - "Apply to every version" re-runs the operation on each version where its precondition (the code it touched) still matches.
  - Notifications are diagnostics raised when a definition you override gains new callers.
- **Decided:** the first milestone is operations over definitions (functions/fields), HLC-stamped, where a rename keeps identity.

## 10. From the drafts (`.ray2`, `.ray3`) — what v0 doesn't have yet

Paths are relative to `@ether/`; `ep` = `v0/.entrypoint.ray`. Each line gives what it is, where the draft writes it, and what it needs. Items already specified above are not repeated. **Q** marks the ones that need your decision before implementing.

### 10.1 Syntax and operators
- `??` null-coalescing: `.ray3/Node.ray:213`. Library.
- **Decided:** `?` has three uses:
  - `T?` = `T | None` (postfix on a type, as in v0).
  - `c ? a : b` (the ternary, `.ray3/Node.ray:214`).
  - A bare `?` value is *unknown*, superposed by default (`.ray2/Node.ray:211`); also the "sorry" of proofs.
- Postfix guards `x if cond`, `x unless cond`: `.ray3/Node.ray:129`. Needs `&caller` (10.3).
- Compound assignment from any operator, `{op}=` (`+=`, `|=`), and `&=>` / `|=>` (superposing definitions): `.ray3/Node.ray:177–182`. Library.
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

### 10.2 Types
- `===`, `!==`, `==<up_to>`, `trivially`: `.ray3/Node.ray:132–150`. Library.
- Negated types `¬T`, `∉ ∋ ∌`; `∈` as `:`: `.ray3/Node.ray:81, 192–219`. Library/syntax.
- Quantified types `∀ ∃ ∄`, `x: R{^2 < 0}`: `.ray3/Node.ray:220`, `.ray2/Grammar.ray:13–23`. Engine.
- Counted types `1 Object`, `a | an T`; array/repetition types `T[]`, `T+`, `T^n`, `Binary₈[]₄`: `.ray3/Node.ray:76–79, 179, 224`. Library.
- `Option<T>`; None as false/0 (`as boolean`): `.ray3/Node.ray:239–246`. Library.
- `Optional<T>`, `Required<T>`, `Query<T>`, and generic parameters on methods (`map <T>{…}`): `.ray2/_todo/ray.ray.txt/ray.ray:126`, `.ray2/Ray.ray:148`. Engine.
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
- `persistent`: `.ray2/Feature/IO.ray:25` is a bare `persistent //TODO` after the IO namespace; `.ray2/_todo/…/UI/Geometry.ray:158` has `dynamically persistent`. **Q:** a modifier that stores a value across runs, i.e. in `Class$` (§9.1)?
- OS namespaces and per-OS files: `.ray2/_todo/…/os/*.ray.txt`. Library.
- Network: protocol registry, URL grammar, ports, sockets, hosts files, CIDR, `Node.Remote`, proxying, handshakes, `< @https://…` imports: `.ray2/_todo/…/Network.ray`, `.ray2/Feature/Network/*.ray`. Library, plus engine for remote nodes.
- Keyboard `pulsed`, `toggled`, `cycle`; UI interfaces, layout (Between/Center/Padding), bounding boxes, styling: `.ray2/Feature/UI/Keyboard.ray`, `.ray2/_todo/…/UI/*.ray`. Library plus the host.
- Proof: equational proofs, `assume` with scoped assumptions, `Proof<…>` types, `∃x: Binary x * x == 25`, `?` as sorry: `.ray2/Feature/Proof.ray:10–110`. Engine.
- Transaction: postfix `!` reverse (`+!`, `map(f!)`), `bidirectional` blocks, partial reversibility: `.ray2/Feature/Transaction.ray:12–72`. **Decided:** `f!` is the same as `f⁻¹` (§4.5).
- Random: `secure`, `seed`; Choice: `Number{choose}`, `choose 10 Number`, `choose 50%`, `choose{unique}`, `()` on a constrained type chooses; procedural generation `choose Room{4..5m x 5..7m}`: `.ray2/Feature/Random.ray`, `Choice.ray`, `_todo/…/ProceduralGeneration.ray`. Library.
- Path references within a file `/path/earlier/in/file`: `.ray2/Feature/Choice.ray:27`. Engine.

### 10.7 World
- `#name` / `@name` lookup grammar per class, plural collections, fallback to `@ether`: `.ray2/World.ray:14–36`. Engine.
- Characters (status, avatars, addressing, sharding), inventory with loop detection, remote execution as a character: `.ray2/Character.ray`. Library + `dynamically`.
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
