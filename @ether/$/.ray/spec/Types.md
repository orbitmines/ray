# Ray — Types and Node spec (from the comments in `v0/.entrypoint.ray` and `Number.ray`)

Status legend: **Decided** · **Open** · **See L§n**.
IDs `T…`. Answers go under **Decided** at the end.

---

## T1. None

- **T1.1 None and `==`** — *ep:987*: "If Node is equipped with a Ray it is !None … `== None` should be
  false, but `==.instance_of None` is true." *ep:984*: `this == None` then `push` is the first entry.
- **T1.2 None as a property receiver** — *ep:986*: calling a property on None returns `this`, so
  `this.(property if X)` works. *ep:1029*: `&caller.` so that `this -- .field if predicate` that
  doesn't match maps to `this`.
- **T1.3 None in results** — *ep:988*: if an `if` block's result is None, it is not added to an array.
- **T1.4 None implements location and `=`** — *ep:989*.
- **T1.5 Casting None** — *ep:1434*: disallow casting None to an Item; it becomes `Item{}` with all
  fields `: None`.
- **T1.6 Default assignment** — *ep:995–997, 1734*: `?` is unknown (L§10.1); every field is
  instantiated with `?()`; "is default assignment `?` if not an Option, which is None?"

From the drafts review (2026-10-06).

- **T1.7 Every value but None is true** — *`.ray3/Node.ray:239–246`*: `if static != boolean: as (=== boolean) true`, with
  None as `false` and as `0`. L§10.2 has only None. **Decided (draft)**: as a boolean, a non-boolean value that is not
  None is `true`; None is `false` (and `0`).
- **T1.8 Negations on None** — *`.ray2/Node.ray:199, 201`*: "If None `!";"⊣` should return true"; "When vertex is set to
  None, should set recursively the boundaries etc. as well." **Q** — conflicts with Decided T1.2: there a member of None
  is None, so `None !~= …` is None; the draft wants it true. Recommend: negated matches and predicates (`!~=`, `!=`) on
  None answer true (None matches nothing), as the one exception to T1.2. Setting a vertex to None also clears its
  boundaries.

## T2. Components: `+`, `&+`, `#`, `##`, `###`

- **T2.1 `+` vs `&+`** — *ep:926–928*: "+/&+ are both components but normal + overrides."
  L§1.5 decided `+` between types is component addition. Open: what is `&+` then (add without
  overriding)?
- **T2.2 Recursive components** — *ep:927–928*: `(A | B) &+ (C | (D &+ E))`: top-level components
  only (default), or recursive with `#` for boundaries?
- **T2.3 `#`** — *ep:916–925*: `#` is the superposition's components; "If # is a Ray, we have a
  selected"; pushing to `#` the first time creates a new variable; "Is `#` just `.expand`?";
  `as (== String)` with `#` overrides the default map. L§10.3 lists `#`, `##`, `###` as engine work.
- **T2.4 `###` class components** — *ep:968*: class components can be `-`'ed, so a value can lose a type.
- **T2.5 Components into a property** — *Ray.ray:720–723*: a component that doesn't replace a property
  but lays over what is inside it: `property => property.components.last`.
- **T2.6 `in`** — *ep:933*: a method that takes only from a given component.
- **T2.7 All in Type vs all in Database** — *ep:923–924*: `choose Type` means any of the type; "all
  in Database" needs another spelling. The draft: "Always whole type, use something else for All in
  Database."

From the drafts review (2026-10-06).

- **T2.8 A map is `* - Node`** — *`.ray3/Node.ray:55`*: "Object with -Node as a primitive, which is then basically
  map." **Q** — Recommend recording it as the meaning of `-` on class components (T2.4): `Object = * - Node`, a value
  with Node's methods taken off, is a plain map. (See T8.7.)

## T3. Classes, static, constructors (*ep:85–134, 938–958, 1034–1039, 1216*)

- **T3.1 Parent fields shared** — *ep:87–94* (spec mark): a parent's field whose default is a thing
  is shared by all subclass instances. L§2.2 decided per-instance by default, `static` for shared.
  What's left is making the constructor run the parent's declarations in the instance.
- **T3.2 Constructors take a superposition** — *ep:939–941*: constructors accept a single superposable
  object, not an Array ("arrays are actual structures").
- **T3.3 Calling super** — *ep:942, 1100*: call `super` by default if not called at the start or end
  of the block, and if parameterless. Define `super()` for any `=`.
- **T3.4 Abstract** — *ep:943*: ensure the caller implements all undefined methods, unless it is
  abstract; a class is abstract if any method is undefined.
- **T3.5 Changing a type** — *ep:944–946*: how type extension works; changing a type parameter; an
  update to `static` propagates to everything depending on it (e.g. `Program < Task`).
- **T3.6 Every construction stored** — *ep:948–950*: every constructed element is added to a database,
  only compiled when used, configurable; maybe only on `.save`. Relates to `Class$` (L§9.1).
- **T3.7 Where a variable is referenced** — *ep:951*. See L§3.4 `references`.
- **T3.8 Less restrictive binding** — *ep:954*: "Even though `this` is already a type, we allow the
  binding of a less restrictive type, so it can be reassigned."
- **T3.9 Static pulled out** — *ep:876, 1216*: static parts of the constructor are filtered out with
  the same rewriting as compiler optimizations.
- **T3.10 The constructor gets every argument** — *ep:1034*: "The constructor is always called with all
  possible arguments."
- **T3.11 `var?: type`** — *ep:1038–1039*: allowed, since some types need parentheses otherwise;
  "static should be linked to type, so `?:` isn't necessary".
- **T3.12 `< override`** — *ep:1035*: forces a local context that removes the global context.
- **T3.13 Monkey-patching** — *ep:891–893, 1415*: patching a constructor; only on a class, not an
  instance; on static it adds to the constructor; a monkey-patch returns the class. L§10.3.
- **T3.14 `static { Rational, Irrational } = Real`** — *ep:1021*: destructuring into statics.
- **T3.15 Single vs namespace** — *ep:1441*: "Is there even a difference between single and namespace?"
- **T3.16 Private** — *ep:1426*: `private`. And *ep:885*: `internal` = the same file, same class.

From the drafts review (2026-10-06).

- **T3.17 The class's members and the instance's** — *`.ray2/Node.ray:14`*: "If all methods on an instance are on the
  static class, what happens to () and other things which are already defined on Class? … (Single default method defined
  on class, which wraps the actual object fully)". **Q** — Recommend the draft: the class's own members (`()`, `name`,
  `#`) are reached on the class value; instance members that collide with them are reached through one default member
  that wraps the instance (`Class~default` / `Class.instance`).
- **T3.18 `super` with several bases** — *`.ray2/Node.ray:113–116`*: `internal this.super &= constructor<local: this>`,
  `internal this.super[constructor.name] = constructor<local: this> if constructor.name`. With `Test := Super + Super2`
  (L§10.1). **Decided (draft)**: `super` is the superposition of all bases' constructors; `super[Name]` / `super.Name`
  picks one by name.
- **T3.19 A field stored as another type** — *`.ray2/Program.ray:450–456`*: `< ( : Binary^128 = field: String, field2:
  Binary^8 )`; "`:` should be called on new variable not on this". **Q** — Recommend: `field: String @ Binary^128`, a
  storage narrowing, which is a Compiler/Store level (L§9.1) rather than a type. Or keep the draft's `: Repr = name: Type`.
- **T3.20 Node's own members resolve on `this`** — *`.ray2/Node.ray:20–22`, `.ray2/Program.ray:104–105`*: "Everything
  defined on Node, isn't put on local, unless explicitely accessed"; Node's members and global extensions don't get the
  global value in closures; `#` and `*` are called on this (global), not local. **Q** — Recommend adopting: Node's own
  members (`#`, `##`, `*`, `**`, `%`, `@`) always resolve on `this` (or `global` at the top), never on a local or closure
  frame; closures capture only names defined outside Node. (Also P1.3.)
- **T3.21 `:{p}` narrows in place** — *`.ray2/Grammar.ray:84`*: "`:{}` without an arg maps to type = type{filter}".
  **Q** — Recommend: `x :{p}` narrows x's declared type in place (`x: (typeof x){p}`). Adopt it or drop it explicitly.
- **T3.22 Fields defined by each other** — *`.ray2/_todo/…/instance/UI/Geometry.ray:225–226`*: `radius =>
  surface.radial_distance` ("a circular definition, which is allowed, and expected to break for a valid object, either by
  setting boundary, or by setting radius, or by setting diameter"); `diameter => radius * 2 // implements diameter =`.
  **Decided (draft)**: fields may be defined in terms of each other. Such a cycle is allowed, and a valid instance breaks
  it by setting any one of them. A derived member `d => f(x)` is writable when `f` is reversible: `d = v` sets
  `x = f⁻¹(v)` (L§4.5).
- **T3.23 `protected`** — *`.ray2/_todo/…/instance/Access.ray:12`, `…/instance/entrypoint/Ether.ray:9–20`*: "TODO
  protected", `protected INSTANCE`. v0 `Accessor.Permission` has a `protected` member that no spec defines. **Q** —
  Recommend: readable and writable by the class and its subclasses' code (language-level, like `internal`, T3.16); or
  drop it and remove it from `Accessor.Permission`.
- **T3.24 `internal` in local contexts** — *`.ray2/_todo/…/instance/Access.ray:66–69`*: "You want this to work for local
  contexts too, so cant rely just on class." Extends T3.16. **Q** — Recommend: `internal x` is visible only inside the
  context that declares it: a class, a function or a block.
- **T3.25 A context variable declared but not given** — *`.ray3/Node.ray:84`*: "with <CONTEXT> = <VAL>, can be expected
  when setting some variable like Node.CONST: String and not setting it. error thrown? or explicitly say with required."
  **Q** — against Decided T1.6 (an unset field is `?`, every possibility), the review recommends an error at use unless
  the variable is declared `?`. Recommend deciding whether context variables follow T1.6 or must be supplied by `with`.
- **T3.26 `assign` and `clear`** — *`.ray3/Node.ray:152, 234`*: `= | assign`; `clear => this = static()`.
  **Decided (draft)**, library: `assign` is an alias of `=`, and `x.clear` sets x to a fresh `static()`.
- **T3.27 `global = local` at the top of a file** — *`.ray3/Node.ray:60`*. **Q** — Recommend asking. One reading: the
  file's local scope is published as the global one.
- **T3.28 Values read per reader** — *`.ray2/Character.ray:53–55`*: `Invisible => return Online if
  &who.CURRENT_INSTANCE == ME.CURRENT_INSTANCE; Offline`; "how to say load the expression, not the value". **Q** —
  Recommend (general): a field may hold an expression evaluated per reader (`&@.last`, who reads), not when it is set,
  written as a parameterless function stored in the field (`x => …`, P5.3). `invisible` is then `online` to oneself and
  `offline` to others (W2.6).

## T4. Structural type checking (*ep:230–260, 969–980, 1030–1032, Number:808–855*)

- **T4.1 The algorithm** — the draft: class constraints must all apply; `|` finds a matching one, `&`
  forces both; all Rays of the type must share the structure (the same structural match the
  grammar uses); `===` for infinite structures; "A.zip(B).every(a instanceof b) && A ==.isomorphic B".
  v0 does "gives every name the type requires". Open: add the Ray-structure half.
- **T4.2 Removed methods** — *ep:1031–1032*: a value with methods removed (like `if`) is still of the
  type; `= None` on a component is a negative component. A separate check for "all methods
  still present"?
- **T4.3 `instance_of` on a superposition** — *ep:1030*: is the default `instance_of` against a `|`
  "any"?
- **T4.4 `~=` is subgraph** — *ep:981*. L§10.4 lists `~=` with `⊢`/`⊣` anchors.
- **T4.5 Requirements from use** — *ep:1053*: "If a variable is any, anything called on it becomes a
  requirement."
- **T4.6 Accepting a subtype** — *ep:1055*: "accepts type X but only uses subtype Y: allow Y, or force
  the whole X?" L§3.2 put relaxing in the IDE.
- **T4.7 Additional type information** — *ep:953*: `A.disjoint(B)`.
- **T4.8 Destructuring by type** — *ep:896–905*: `Type = Var` assigns the parts of Type matching var;
  `{ field: T, field2 { nested }, [first, ..middle, last] = field5 }: ParentType = Object`. L§10.1.
- **T4.9 Counted and typed use** — *ep:1051*: `1 Object` still lets the compiler use many for abstract
  interpretation; type checking expects one.

From the drafts review (2026-10-06).

- **T4.11 `∀` asserts, `{…}` filters** — *`.ray2/Grammar.ray:17`*: "`∀ x ∈ R ∋ (x + y)^2 < 0` // Forces that all things
  in R indeed follow this, which is different from just enumerating the possibilities after the filter." **Q** —
  Recommend: `∀ x ∈ R: p` is an assertion over all of R (a `dynamically assert` that fails, or starts a quest, when some
  x doesn't hold); `R{p}` is a narrowing that keeps those that do; `∃ x ∈ R: p` is a quest for a witness.
- **T4.12 `expr : T` constrains its free variables** — *`.ray2/Grammar.ray:21–23`*: "`x^2 < 0 : R` // Type constraints
  like this which is just `x: R{^2 < 0}`"; "`x^2 < 0 && y^3 < a : R`"; "All the variables which are already castable to
  R?" **Q** — Recommend as sugar: a boolean `expr : T` narrows every free variable of `expr` that is castable to T.
- **T4.13 A method answering a copy, as a narrowing** — *`.ray2/Program.ray:3`*: "Valid type: `Ray{compact}`; anything
  which returns an altered version of this should work?" **Q** — Recommend: in a narrowing, a method answering `static`
  holds when the copy equals the value: `Ray{compact}` ≡ `Ray{compact == this}`, and `String{lower_case}` is already
  lowercase.
- **T4.14 Sortedness is a type** — *`.ray2/Ray.ray:131`*: `sort (dimension): static{~every .previous[DIMENSION] <=
  .[DIMENSION] <= .next[DIMENSION]}`; *`.ray2/Reference.ray:14`*: `String{#.sorted_by(date)}`. **Decided (draft)**:
  `sort` answers `static{sorted}`, where `sorted(dim)` is the narrowing `every .previous[dim] <= .[dim] <= .next[dim]`.
  A field typed `T{sorted_by(f)}` stays sorted on insert. (Follows from T4.13; see R3.10.)
- **T4.15 `x: T` and `x ∈ T` as conditions** — *`.ray2/Node.ray:29–30, 187`*: "Constraint accept methods which introduce
  constraints, like types"; "`:`/element_of etc. castable to type boolean"; `{" "}(: | ∊ | ∈) (type) => this
  ==.instance_of type //TODO Only if used in if-block or ?`. **Decided (draft)**: in a boolean position (`if`, `?`,
  `{…}`), `x: T` and `x ∈ T` are `x ==.instance_of T`; in a statement position `x: T` declares. These are constraint
  methods: they narrow x in the taken branch (L§3.2.1).
- **T4.16 Negating a predicate** — *`.ray2/Feature/Proof.ray:41–44`*: `Node{(): boolean}` / `! | ¬ {.} = () =>
  !this()` / `as (=== boolean) => this()`. **Decided (draft)**: a parameterless boolean program is a predicate; `!p` /
  `¬p` is `() => !p()`, and a predicate converts to boolean by running it.
- **T4.17 `T>`, the greater type** — *`.ray2/Node.ray:135`*: "`>` // Greater type than this, components could be together
  this type." **Q** — Recommend: `T>` (postfix) is T's supertype, any value whose components together could make a T
  (T4.7). Otherwise drop it.
- **T4.18 A `T` is a one-element `T[]`** — *`.ray2/_todo/…/instance/utils/boolean.ray:1–2`*: "Anything that is
  implementing Array<T>, like Positive, should also apply to just a T." N1.10 covers the boolean case only. **Q** —
  Recommend: where `T[]` is accepted, a single `T` is the one-element list, and what `T[]` implements applies to a `T`
  (so `"0"`/`"1"` read as boolean through Binary).
- **T4.19 Definite assignment across labels** — *`.ray2/_todo/ray.ray.txt/ray.ray:85–89`*: "Type-checker should know that
  it must be set in Ordered to get here." **Q** — Recommend: the checker narrows a `T?` to `T` at a label when every edge
  into that label sets it (definite assignment over the Program's edges, P1.1).
- **T4.20 Finding types through references** — *private journal, IDE:831 (paraphrased)*: types that match should be
  findable by following references, e.g. every Program with a cycle, to assert there are none or to forbid recursion.
  **Q** — Recommend: `T$ @ x ->` already searches a type under a location (W1.5); `never (Program{has_cycle}$ @
  project ->)` asserts there are none.

## T5. Generics and parameterized types

- **T5.1 `Optional<T>`, `Required<T>`, `Query<T>`** — *ep:1548–1551*. L§10.2 (engine). Open: `Query<T>`
  sets every property to the base class without T's defaults — is that what a query is?
- **T5.2 Generic methods** — *ep:1305*: `map <T>{predicate: (x: T + iterator: Ray): boolean}(map: (x): T) => static{T: T}`.
- **T5.3 Setting T to the caller's constructor** — *Ray:616*.

## T6. Equality, identity, canonical form

- **T6.1 Literal equality** — *ep:411–416* (spec mark): a written literal has no equality of its own.
  The directive: only Ray defines `==`. What's left: literals compared structurally once a literal
  is a thing in itself (a String).
- **T6.2 `.canonical`** — *ep:992*: resolves equivalent forms of the same instance.
- **T6.3 `unique{}`** — *ep:994*: accepts an expression it maps to before checking uniqueness.
- **T6.4 Normalizers** — *ep:1490–1496*: `static Normalizer = (x: static) => static`,
  `normalizer: Normalizer?`, applied on `=`. L§10.2.
- **T6.5 `equivalence (from) -> (to)`** — *ep:1498–1502*. L§10.2 (engine).
- **T6.6 Transparent pairs** — *Ray:714–715*: a key/value where everything is delegated to the value,
  so `==` compares values.

From the drafts review (2026-10-06).

- **T6.8 `x++` is a copy with a forked history** — *`.ray2/Node.ray:155`*: `++ | copy // TODO Fork the variable
  history`; v0 uses `this++` (String.ray:70, Node.ray:89, 222); L§10.3 lists `++ | copy`. **Q** — conflicts with Decided
  L§1.3 ("`++` dropped"), while the draft and v0 use `x++` as copy. Recommend: `x++` (alias `copy`) is a copy whose
  history is a fork of x's (`x%` branches), and L§1.3 is corrected to say it dropped `++` as concatenation only.
  **Answered (user, 2026-10-06):** dropped (L§1.3.1); a copy is `.copy`.
- **T6.9 `unique` as a field constraint** — *`.ray2/Node.ray:206–209`, `.ray2/World.ray:20`, `.ray2/Ray.ray:89–90`*:
  "unique{} accepts an expression"; `unique{.ignore_case if name ==.instance_of String} name{issuer == this}`; `unique =>
  this&{== this}.count == 1 //TODO Is different from unique/compact of iterable, rename`. **Q** — conflicts with Decided
  T6.3 (`unique{expr}` dropped), while World needs case-insensitive unique names. Recommend: keep T6.3; `unique` as a
  field modifier means no other value of that field in its scope is `==`, the comparison taken from `<in: …>` (R3.14),
  e.g. `unique<in: .fold_case> name`. `.unique` stays dedupe, and the predicate is `.is_unique`.
- **T6.10 `!=`, `===`, `!==` come from `==`** — *`.ray3/Node.ray:81–82, 145–150`*: `(this @@ Node ==)*.map{.on ==}(method
  => args => !method<local: .>(args))`; `¬{.} => not.instance_of this`. **Decided (draft)**: `!=`, `===`, `!==` and
  `not` are generated from `==`'s methods, so every option of `==` (`.instance_of`, `<in: …>`, `<up_to>`) exists on them
  and they never fall out of step with it.
- **T6.11 `==`'s options** — *`.ray3/Node.ray:133–137`*: `<up_to?>`, `in?: -> as (*)`, `exclude_location: boolean =
  true`, `trivially: boolean = false`; `===` is `==<exclude_location: false>`. U9 has "`===` includes location"; `up_to`
  and `trivially` are defined nowhere. **Q** — Recommend: `trivially` means decidable without running anything (used by
  `Iterable.count`, *`.ray3/Ray.ray:81`*); `up_to` compares only up to a boundary (a prefix). `exclude_location` needs no
  flag: it is the difference between `==` and `===` (U9).
- **T6.12 Re-normalising held values** — *`.ray2/_todo/ray.ray.txt/ray.ray:68–73`*: `normalizer: Normalizer?`,
  `dynamically on(normalizer) = this = this`. **Q** — Recommend: a held value is re-normalised when its normalizer
  changes (it depends on it `dynamically`, P5.1). (T6.2/T6.4.)
- **T6.13 Equivalences to many, and from a type** — *`.ray2/_todo/ray.ray.txt/ray.ray:76–79`*: "Support many to*s";
  "What if from is type (how to distinguish?) then we'd want ==.instance_of". **Q** — Recommend: `equivalence a -> (b |
  c)` is one equivalence to a superposition. From a type it applies to its instances (`==.instance_of`); to relate the
  type itself, write `static`.
- **T6.14 `as T` through an isomorphic target** — *`.ray2/_todo/ray.ray.txt/ray.ray:3`*: ""as String" should also accept
  "as Digit[]"". **Q** — Recommend: `as T` succeeds through any conversion to a type isomorphic to T, by L§3.5's
  breadth-first walk.

## T7. Values of a location (*ep:906–915, 1149*)

- **T7.1 Per-location values** — *ep:911–915*: "Each `=` is a new branch. In Ray every mutation is a `=`
  somewhere in the structure. If assigned, it only assigns for the current location, so the variable's
  value branches per location; access others by changing location, `var @ func`." L§10.3 lists `@`
  per-location values (engine).
- **T7.2 `@ Class`** — *ep:910*: the same variable name in another class up the context chain.
- **T7.3 `@` with a block, `@ &caller`, `@ *`, `<-` all parents, `->` all children** — *ep:906–909*.
- **T7.4 `*` on a default** — *ep:919*: `*` says whether a default is loaded and whether the current
  value is that default (don't store it if so). Related to L§2.3.
- **T7.5 `&caller == this`, `&caller == @me`** — *ep:1149*.

## T8. Maps and superposed calls (*ep:962–965, 1424, 1435–1438*)

- **T8.1 `.map` on a superposition** — *ep:962*: `.map` is defined on Node, so a superposed variable
  maps all. *ep:1424*: `.map` on a single value affecting all is the same as calling on the static def.
- **T8.2 `.map` on `String + Ray`** — *ep:964–965*: which component's `.map` wins?
- **T8.3 `.keys`, `.values`, `.keys.enumerate`** — *ep:1435–1436*: enumerate the possible values of a
  superposition.
- **T8.4 `.join` on any values; `.empty = .length == 0`** — *ep:1437–1438*. (The directive: length is not count.
  Open: is `.empty` `count == 0`?)
- **T8.5 `.for` on an object** — *ep:1429*: overridden when the object is an Array; use `.properties.for`.
- **T8.6 Structured maps** — *ep:880*: `.map`/`~filter`/`join` act on the actual events, expanded
  automatically.

From the drafts review (2026-10-06).

- **T8.7 Map keys and Node's members** — *`.ray2/Node.ray:16`*: "SOlution for Map/{} object which checks .on X and doesnt
  override the usage of Node so allow any field?"; v0 guards ad hoc with `.declaring(name) ? external get this name : …`.
  **Q** — Recommend: a map literal's keys may shadow Node members for `.key`; Node's member stays reachable with
  `.on(Node).key` (or `x##`). One rule for all maps instead of per-class `.declaring` guards. (T2.8, T6.6, R6.1.)
- **T8.8 A field read on a list reads its elements** — *`.ray2/Program.ray:417`*: `(Base, unit: Unit = Unit.None)[]`,
  "Should implement `x[0].unit & x.unit` as `|`, because it binds the variable to it." **Q** — Recommend: a field the list
  itself lacks is read on each element and answered as their superposition (`xs.unit` is `xs#.unit` joined with `|`):
  T8.1 extended from superpositions to lists.

## T9. Where an alternative came from

From the drafts review (2026-10-06).

- **T9.1 Superposed values keep their origin** — *private journal, IDE:678–679 (paraphrased)*: each part of a superposed
  value carries which caller produced it, so a result can be refined once a condition is known. v0 already has
  `.origin` / `.sources` on branched values (`v0/Node.ray:89`); L§8.2's origin is that of code, not of values. **Q** —
  Recommend as Decided text: every alternative in a superposition keeps where it came from (`.origin`, `.sources`).
  Narrowing an input (`with c = true`, `if assume c`) narrows the result to the alternatives that came from it.

---

## Decided

Answers from 2026-09-30 (see also `Almanac.md`, which answers T2.1, T3.3, T3.9, T7).

- **T1.1** `None` is absence: `x == None` only when x holds nothing. `T?` is `T | None`, and a
  value that *may* be None (superposed with it) is `==.instance_of None`, not `== None`.
- **T1.2** A member of None is None; it propagates, so optional chains need no `?.`.
- **T1.3** A None produced inside a list (`[a, (b if c), d]`) is dropped; write it explicitly to
  keep a hole.
- **T1.6** An unset field is `?`, unknown, which is the full type: every possibility. Reading it
  gives that superposition. **This replaces L§4.3:** `x: Number` then `y := x + one` makes `y`
  every Number plus one, not an error.
- **T2.1** (Almanac §2.1) `A + B` combines with B overriding; `A &+ B` / `A |+ B` superpose the
  components.
- **T2.2** Components are added at the top level only; `#` reaches inner boundaries explicitly.
- **T2.3** `#` is not `.expand`: `#` is a variable's possible values, `.expand` unfolds structure.
- **T2.7** All stored instances of a type are `Type$`; `Type` is the whole type.
- **T3.2** A constructor is not mapped over a superposed argument by itself. If what it returns
  uses the variable, the mapping follows automatically; otherwise `Point(1 | 2)` stays one point.
  Several points are made with a narrowing: `Point{x: 1 | 2}()`.
- **T3.4** A class with undefined methods is abstract (inferred; no keyword). Constructing it is
  an error unless the missing methods are given.
- **T3.6** Every instance is in its `Class$` by default, lazily: storage materialises only when
  `Class$` is used. This is the local store; another store is a location, e.g. `Class$ @ @remote`.
  `Class$ @remote` is the same thing (corrected by R7.1).
- **T3.13** Monkey-patching is component addition on the class: `X += { … }` (overriding),
  `X &+= { … }` (superposing). Only on a class, and it returns the class.
- **T3.15** `single` is dropped: a class is already a namespace.
- **T3.16** `@public`, `@private` and so on are player-level (see `Universal.md` U8). `internal` is
  the language-level one (`Node{==.instance_of Example} variable`).
- **T4.1** Structural `instance_of` checks the names a type requires *and* the structure of its
  Rays (the grammar's matcher; `===` for infinite ones), so `Array ==.instance_of Hypergraph`
  follows from edge structure.
- **T5.1** `Optional<T>`, `Required<T>` and `Query<T>` are dropped for now, to be added back when needed.
- **T5.2** Methods take generic parameters like types do: `map <T>{…}(…)`, inferred when omitted.
- **T6.2/T6.4** One concept: a class's normalizer runs on assignment, `.canonical` is its result on
  demand, and `with X.normalizer = …` switches it.
- **T7.4** Whether a field still follows its default is read through its history: `x.field%` is empty
  while it follows the default. There is no separate operator.
- **T8.2** Which `.map` wins depends on the relation: `+` overrides, so the last added wins; `&+`/`|+`
  superpose both.
- **T8.4** `.empty` is `.count == 0`.
- **T4.6** A relaxed type is inferred from what a function actually uses (all of the value if it is
  returned), and offered as a suggestion; the declared type stays.
- **T3.8** A declared type is the variable's type; the value narrows it only until reassigned
  (`x: Number = 5` is a Number).
- **T3.12** `< override` is dropped.
- **T4.9** `x: 1 Object` holds exactly one, and abstract interpretation is forced to one as well: there is
  no difference between the two here.
- **T6.6** A `key: value` entry is transparent: everything, `==` included, delegates to the value, and
  `.key` still reads the key.
- **T7.1** One location concept: a call frame, a thread, a host and a store are all locations. `=` writes
  at the current one, so a variable branches per location; `@` names the others (`var @ func`, Almanac A3).
- **T7.2** `x @ Class` is the variable x in another class up the context chain (a class is a location).
- **Covered elsewhere:** T3.3, T3.9 (Almanac A7), T8.1 (Almanac A1), T4.4 (Universal U9 `~=`), T6.5 (N1.9 isomorphisms).
- **T1.4** None implements `location` and `=`: a None slot can be assigned, and it has a location.
- **T1.5** Casting None to a class is disallowed; write `Item{}` with its fields `?`/None explicitly.
- **T2.4** Class components can be removed with `-` (`x - Printable`), so a value can lose a type; this is
  also how negative components (T4.2) work.
- **T2.5** A component merged *into* a property is `&+` on the property (`x.style &+= {italic}`); `+=`
  replaces.
- **T2.6** No `in`: a cast (`(x as String).next`) or `x##` reads one component.
- **T3.5** Changing a class later is live: dependents recompute (`dynamically`, P5.1), and a change that
  breaks existing instances becomes a migration quest.
- **T3.10** Every field is a constructor parameter; unset ones are `?` (T1.6).
- **T3.11** `field?: Type` stays as shorthand for `field: Type?`.
- **T3.14** Destructuring into statics is kept: `static { Rational, Irrational } = Real`, as with
  `{ false, true } = boolean`.
- **T4.2** A value missing a required method is not an instance (structural, T4.1); `T - method` is the
  type that accepts it.
- **T4.3** `x ==.instance_of (A | B)` holds if x is an instance of any of them; `A & B` needs both.
- **T4.5** On a variable of unknown type, everything called on it becomes a requirement of its inferred
  structural type.
- **T4.7** Type relations are methods on types: `A.disjoint(B)`, `A.subtype_of(B)`, …
- **T4.8** Both destructuring forms are kept (`Type = Var`, and the block form with `...` spread), and both
  allow defaults to be set.
- **T5.3** A generic defaults to the receiver's class: `static` in a return type (`reverse: static`).
- **T6.1** Written literals compare with Ray's structural `==` once a literal is a value (a String).
- **T6.3** `unique{expr}` is dropped.
- **T7.3** `@` directions are on the current location's hierarchy: `@ <-` goes up the chain (callers,
  parents), `@ ->` goes down (threads given to, children), and `@ loc { … }` runs a block at that location.
- **T8.3** Only `#` enumerates a superposition's values; `.keys`/`.values` are for maps.
- **T8.5/T8.6** `.properties.for` iterates an object's properties; the "events expanded automatically"
  note is dropped.
- **T7.5** No separate `==`: the conversion `&caller as Character` (the character at the top of the chain)
  makes `&caller == @me` hold through the equivalence graph (U9).
- **Covered elsewhere:** T3.1 (L§2.2: per instance by default, `static` for shared), T3.7 (L§3.4 `references`).
- **T4.10 (2026-10-02) Types are patterns, language-side.** `x: T` makes `T` readable at once (the
  declaration confirms the value adheres to it). A type written with `|` reads as any of its
  alternatives, one written with `,` reads its items in sequence, a written literal reads exactly
  itself, and `T[]` (a method on Node; the draft's `Array<T>`) reads one or more `T`. For types only,
  repetition compresses: `"A", "B", "B"` is `"A", "B"[]` (L§1.2). The engine knows nothing of `:`, `|`,
  `,` or `[]`; it only reads text with the rules a type carries. (`ep` `:` and the helpers
  `make_type_readable`, `reads_as`, `reads_in_sequence`, `repeated_reads`.)
- **T6.7 (2026-10-02)** Enum members are compared by identity (where they are written); see Almanac A7.
- **T3.15b (2026-09-30)** A class's structural definition sits in its header, beside what it is built on:
  `UTF-8 := class: TF, sequence: ( prefix: 1[]{length == 0..4}, … )[] { as (== CodePoint[]) => … }`.
  The pattern is what the type matches; the body holds its methods.
