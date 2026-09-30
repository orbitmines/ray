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
  (`Class$ @remote` would mean something else.)
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
