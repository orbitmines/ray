# Ray — Ray, graph and collection spec (from the comments in `v0/Ray.ray` and the entrypoint)

Status legend: **Decided** · **Open** · **See L§n**.
IDs `R…`. Answers go under **Decided** at the end.

---

## R1. The structure (*Ray:1–72, 444–480*)

- **R1.1 Unicode aliases** — `⊢ ⊣ ∙ ⊙ ∃ ∀` "wait on a way to spell them". Open: are they plain rule names
  (`⊢ | initial`), usable once the grammar reads non-ASCII names?
- **R1.2 `Ray < Iterable & Ordered`** — v0 is a single chain of bases "until a class can name more than
  one". L§10.1 decided `Test := Super + Super2` with a single hierarchy. Open: is `Ray < Iterable & Ordered`
  written as `Ray := Iterable + Ordered`?
- **R1.3 Structures' constraints** — *Ray:477–480*: `(1 unless HyperContinuations) Vertex.Boundary` is carried
  as flags and checked by `is_valid`, not enforced while building. Enforce while building?
- **R1.4 Many boundaries** — *ep:890, Ray:712*: many initial and many terminal (ternary and beyond); then
  components for hyperedges.
- **R1.5 `is_boundary` on a superposition** — *Ray:610*: it should check each entry, not change the
  behaviour of a superposed abstract interpretation.
- **R1.6 The first extension equipped** — *Ray:611*: "First Ray extension defined is what gets equipped?"
- **R1.7 `.value`** — *Ray:638*: everything on x except the Rays at `#`; methods on Ray vs x.
- **R1.8 Continuous** — *Ray:698*: equip Continuous, accepting Reals in `[property]` without affecting `.next`.

From the drafts review (2026-10-06).

- **R1.9 `relative_context | &&`** — *`.ray2/Ray.ray:86–87`*: `context | & =>`, `relative_context | && => //TODO Perhaps
  just context, relative context = just the ray.` `&&` here clashes with boolean `&&`. **Q** — Recommend dropping
  `relative_context | &&`: the relative context is the ray itself, as the draft suggests, and `&&` stays boolean.
  **Follows (2026-10-06):** `relative_context | &&` is dropped: the relative context is the ray itself, and `&&` stays the boolean collapse of `&`, from G3.6 and U4 (`&` prefixes the current context).
- **R1.10 `.value` on a many boundary** — *`.ray2/Ray.ray:44`*: "Setting .value on Many boundary in the case of Edge."
  **Q** — Recommend: setting `.value` on a superposed boundary sets it on each (U1), as R1.5 does for predicates.
  **Follows (2026-10-06):** setting `.value` on a superposed boundary sets it on each alternative, from R1.4 and R1.5 (operations on a superposition map over it) and U1.
- **R1.11 `unidirectional`** — *`.ray3/Ray.ray:54–57`*: `unidirectional => return // Tell the compiler links should be
  one-way`, with a `Reverse\` label; v0 (Ray.ray:29) has only the predicate `all.every(!.previous)`. **Q** — Recommend:
  written on a structure, `unidirectional` is an assertion and a compile hint (no `.previous` links are kept), like
  `dynamically assert` (R1.3).
  **Follows (2026-10-06):** `unidirectional` is the boolean predicate v0 has (`all.every(!.previous)`); written on a structure it is a narrowing / `dynamically assert unidirectional`, which the compiler may also take as the hint to keep no `.previous` links, from R1.3 (structure constraints are `dynamically assert`), T4.11 (answered: booleans are narrowings) and choices being optimisations the compiler makes.
- **R1.12 `|` inside a list makes branches** — *`Almanac.tsx:893–896`*: `x: Graph = [1, "2a" | "2b", 3]`. **Decided
  (draft, Almanac)**: alternatives written with `|` while building a structure become separate branches of the graph.

## R2. Iteration and traversal (*Ray:72–130, 559–565, 633–673*)

- **R2.1 Traversers** — the draft's `with Traverser.(default = 4 * DepthFirst, BreadthFirst)` and mixes. L§10.4.
  Open: `with` (L§6.3) is the spelling, so is `Traverser.default` a context variable?
- **R2.2 `.every` goes both ways** — *Ray:637*: `.every` on a ray iterates both directions; an explicit
  filter excludes (`(ray -> .next).for`).
- **R2.3 Parameters** — *Ray:633–634*: no args (iterate without the variable); callback parameters as Array &
  Object at once.
- **R2.4 Reduce** — *Ray:671–673*: reduce in both directions; cancel a reduce; map and reduce together.
  (Semantics decided 09-30 in `project_reduce_semantics`.)
- **R2.5 Filters** — *Ray:647, 665–667*: filter per iterated node; `~{}{}` chained (maps to `&&`); a
  structure-altering map. L§10.4 decided `~` is only for entry points; filtering is `.filter` or `{…}`.
- **R2.6 `.map` copies** — *Ray:669–670*: variables accessed in a map are mapped lazily; being part of `.map`
  copies them into the map's structure.
- **R2.7 Generators** — *Ray:613–614*: support generators, or convert automatically when something is
  returned (an intermediate result). L§10.3 `yield`.
- **R2.8 Next with `#`** — *Ray:660*: `.next` always returns an iterable with `#`, since `#` is depth-aware.

From the drafts review (2026-10-06).

- **R2.9 `.index(start)`** — *`.ray2/Ray.ray:107`*: `index (start = first) => start to this -- .length - 1`. **Decided
  (draft)**: `.index(start)` is the path length from `start` to this, minus one; without an argument it counts from the
  entry (L§1.4).
- **R2.10 Mixing traversers** — *`.ray3/Ray.ray:90–101`*: `4 * DepthFirst, BreadthFirst`, `100 * BreadthFirst, 2 *
  (BreadthFirst if 50% else DepthFirst), (entry) => …`, and "How to combine traversers like Left only but breadth-first
  depth-first X levels then breadth". R2.1 decides only the spelling. **Q** — Recommend: `n * T` is n steps of T, `,`
  sequences them, a traverser may be a superposition (probabilistic) or a function of the entry, and a direction filter
  composes with any of them.
  **Follows (2026-10-06):** `n * T` is n steps of T, `,` sequences traversers, a traverser may be a superposition (weighted for a probabilistic mix) or a function of the entry, and a direction filter composes with any of them; nothing traverser-specific, from R2.1 (the traverser is a context override), R3.9 (`* n` repeats), `,` composition and U-C1 weights.
- **R2.11 Indexing a recursively defined ray** — *`Almanac.tsx:864–867`*: `(0 -> +2)[4]` is `8`. **Decided (draft,
  Almanac)**: a ray defined by a recursive step is indexed like any iterable; `[n]` applies the step n times.

## R3. Operations

- **R3.1 `.remove`** — *Ray:648, 651*: preserve structure, sever connectivity, or DPO; remove a selection
  from its context.
- **R3.2 `.push`** — *Ray:643*: one that does and one that doesn't override a terminal defined there.
  *Ray:675–680*: `push_before`, `push_after`.
- **R3.3 `.expand`** — *Ray:615, 639–640, 644; ep:1103*: on a boundary or edge; on a looped type (unrolls?);
  only the boundaries, or everything; recursively; on an unknown function the length may be infinite.
- **R3.4 `.paths`, `.length`** — *Ray:641, 687–688*: possible paths; `path to` on an array: all paths from all
  points; `.min` by path length. Decided: length is the longest path, count is how many.
- **R3.5 Graph rewriting** — *Ray:612*: DPO, SPO, cartesian product, tensor product, union, disjoint union. L§10.4.
- **R3.6 Split** — *Ray:653–655*: `.next`/`.previous` as different delimiters; `keep_delimiter = false`; split is a
  map that respects the equipped structure.
- **R3.7 Complement** — *Ray:650*: the context graph except the current value, "complement, where the whole graph
  is the universal set".
- **R3.8 Composition** — *Ray:690–697*: sequential composition; if T is `(previous: T): T`, compose (`1, +2, +3`);
  if T extends `[]` and not Ray, don't compose; `Binary₃₂ = Binary₈[]₄`; `x: String[] = "String", Object, …`;
  on `=` of a ray, keep structure from both sides (`&=`).
- **R3.9 Repeat** — *Ray:661*: repeat a structure x times.
- **R3.10 Min/max/sort along a dimension** — *Ray:662; Compiler:127–137*: along which dimension, and the
  default; min/max generalised past numbers with an Infinity past `.last`.
- **R3.11 Move** — *Ray:683*: move operations; `after/before/back/front`.
- **R3.12 A path is a function; `Path ~=`** — *Ray:699–700*: `/ ~= ^/.@` means files beginning with `/.@`.
- **R3.13 Flatten levels** — *Ray:682*: `.flatten = .reduce(push_back)`, and how many levels (ruby's `flatten(1)`).
- **R3.14 Equivalence graph choice** — *Ray:681*: which equivalence graph an operation uses.
- **R3.15 Time vs space** — *Ray:685–686*: each step might be in a different version of the graph; start a quest
  to find a path.

From the drafts review (2026-10-06).

- **R3.16 `split` answers its delimiters** — *`.ray2/Ray.ray:100–103`*: "Returns superposition instead of an Array[]";
  "split {predicate: /* Should split, returns Ray @ the delimiter, with prev/next the two sides. */}". **Q** — Recommend:
  `split` answers a Ray (not an Array) whose vertices are the delimiters, each with `.previous`/`.next` the two sides;
  `.pieces` lists the pieces. (R3.6.)
  **Answered (user, 2026-10-06):** delimiters are the edges: they stay in the structure, and `"a,b,c".split(",")` still answers `[a, b, c]` (its vertices are the pieces).
- **R3.17 `group_by` and `dimensionality`** — *`.ray2/Ray.ray:105, 190`*: "`//group_by`", "`dimensionality` //How to do
  this with different rays which can be equipped for different directions". **Q** — Recommend: `group_by(f)` answers
  `{(f(x)): [x…]}`; `dimensionality` is the number of directions equipped on the selection (1 for an Array, n for a grid).
  **Answered (user, 2026-10-06):** `group_by(f)` answers a map `{(f(x)): [x…]}`.
- **R3.18 A type's script: count or length** — *`.ray2/Ray.ray:201–203`*: "Allow `Binary₃₂ = Binary₈[]₄`. Uses count
  instead of length, since `Ray/Graph²²²` makes more sense as the size of the graph rather than each path length."
  **Q** — conflicts with Decided Almanac A5 (`^` on a base type means length) and the directive that length is not
  count. Recommend following the draft: a type's super/subscript constrains `.count` (the size), which equals length on a
  chain; `Graph²²²` is a graph of 222 vertices.
  **Answered (user, 2026-10-06):** length (A5). A count is the counted type, `T{#.count == n}` (`n T`).
- **R3.19 Measured expanded, or as written** — *`.ray2/Program.ray:1, 129`*: "`.length` etc. use `.expanded` by default,
  how to get the `.length` specific to without expanding"; ".expand on an unknown function makes the length possibly
  infinite, optionally assume it terminates". **Q** — Recommend: `.length`/`.count` measure the fully expanded
  structure, `.collapsed.length` measures it as written, and on an unknown program the answer is `?` (possibly ∞) unless
  `assume Terminating`. (R3.3, R3.4.)
  **Answered (user, 2026-10-06):** it follows from what the elements are: a range as a value is a Ray (R4.1), so `[1, 2, (3..5)]` has three elements, the third a nested Ray, and counts 3; a superposed element counts as one.
- **R3.20 `zip` and `zip_longest`** — *`.ray2/_todo/ray.ray.txt/ray.ray:5`*: ".zip/.zip_longest (ziplongest returns with
  _length to the max) for parameterless, and parameters [this, b].zip"; used in *`.ray2/_todo/…/instance/utils/Number.ray:84`*.
  **Decided (draft)**: `a.zip(b)` stops at the shorter; `a.zip_longest(b)` runs to the longer with None for the missing
  side; `[a, b, c].zip` (no argument) zips the lists in the list.
- **R3.21 `push_back()` with no value** — *`.ray2/_todo/ray.ray.txt/ray.ray:6`*: "push_back(void) should only create the
  array one longer." **Q** — Recommend: `push_back()` adds one entry holding `?` (unknown, T1.6). (R3.2.)
  **Follows (2026-10-06):** `push_back()` adds one entry holding `?` (the parameter defaults to `?`), from T1.6 and T3.10 (an unset value is `?`).
- **R3.22 Ties at the extreme** — *`.ray2/_todo/…/instance/Network.ray:113` (before 7250308), `v0/Test.ray:89` (7250308)*:
  `#{length == min() & leftmost} # TODO How to iterate over @ like min. and leftmost` (RFC 5952: the longest run of
  zeros, the leftmost of equals). **Q** — Recommend: `xs.max(by)` is the superposition of the tied ones, and `.first` /
  `.last` picks among them by position; inside `#{…}`, `min()` and `leftmost` aggregate over the superposition. (R3.10.)
  **Follows (2026-10-06):** `xs.max(by)` / `xs.min(by)` is the superposition of the tied ones; `#.first` / `#.last` picks among them by position; inside `#{…}`, `min()` and `leftmost` aggregate over the superposition, from U1 (superposition over flags), R3.4 (`.min` over a superposition of paths) and T2.3 (`#` is the possible values).
- **R3.23 What `~=` leaves behind** — *`.ray2/_todo/…/instance/Network.ray:114–115` (before 7250308; `:213–214` in the
  removed block)*: "default functionality of ~= is removed from surrounding context unless X?"; "What if the result of ~=
  is another iterable #. … how to know that a group doesnt belong to the iterable. Probably .expand." **Q** — Recommend:
  `x ~= p` answers the matches, a superposition of selections that stay in their context, and does not change x;
  `.remove` on a match removes it from x (R3.1). A match that is itself a superposition is one match; `.expand` unfolds
  it.
  **Follows (2026-10-06):** `x ~= p` answers the matches, a superposition of selections that stay in their context, and does not change x; `.remove` on a match removes it from x. A match that is itself a superposition is one match; `.expand` unfolds it, from L§1.2 (only an optimisation mutates; the semantics never do) and R3.1 (`.remove` is a separate method).

## R4. Ranges (*ep:1558–1638; Ray:657–659*)

- **R4.1 Forms** — `a..b`, `..b`, `a..`, `0..10..20` (to 20 through 10), `..10` = `10->`? MultiRange. L§10.4.
- **R4.2 Range as a type** — *Ray:659*: `5..10` used as a type is `5..10.reduce(|)` by default?
- **R4.3 Bounds are Rays** — *ep:1563–1566*: depending on the default space, a range is the refined Array or a graph
  (loops exist); infinity is the terminal reference; how to tell initial from terminal infinity.
- **R4.4 Over any surface** — *ep:1559*: generalise ranges/intervals over arbitrary surfaces.
- **R4.5 The TS draft** — *ep:1574–1638*: `Range`/`MultiRange` with inclusive bounds, `or`, `and`, `invert`,
  `contains`. Port as the reference behaviour?

## R5. Loops and orbits (*ep:1641–1658; Ray:543*)

- **R5.1 Loop** — `disallow_loops`, `unrolled`, `unrolled_mod` (a loop remains between first and last),
  `instances`. "OR is parallel structure, AND is sequential structure."
- **R5.2 Infinity as a loop** — *Number:629*: infinity is a looped integer; −∞ a reversed loop; `.reverse` must
  be preserved to tell them apart.

From the drafts review (2026-10-06).

- **R5.3 A loop iterated finitely** — *private journal, `PENDING (2027?+) ; Physics (& Hardware).md:558–565`
  (paraphrased)*: an iterable is always finite but carries a "modular" property, so iterating a loop gives finite rays
  together with where they wrap around. **Q** — Recommend: iterating an orbit answers the finite unrolled ray plus a
  terminal boundary joined to its initial one (R5.1 `unrolled_mod`). Ask whether the note is still current.
  **Follows (2026-10-06):** iterating a loop answers the finite unrolled ray plus a terminal boundary joined to its initial one (`unrolled_mod`); a loop is not ∞, from R5.1 and R5.2.

## R6. Objects as rays (*Ray:704–728*)

- **R6.1 `Object[String]`** — an object is a superposed Ray, so `Object[String]` is all its rays that end in
  strings. Is `.field.next` a ray when the return has structure of its own?
- **R6.2 Wave-function collapse** — instantiate a type by collapsing its open possibilities.
- **R6.3 `[y: 5]`** — move in one named dimension.

From the drafts review (2026-10-06).

- **R6.4 `x.1` and `x[1]`** — *`.ray2/Ray.ray:48`*: "`.[index]` shouldnt overwrite the '1' without a .1 (needs a special
  rule)". **Q** — Recommend: `x[1]` is the index and `x.1` the member written `1`; `x[1] = v` never creates a member `1`.
  **Follows (2026-10-06):** `x[1]` is the index and `x.1` the member written `1`; `x[1] = v` never creates a member `1`, from G1.2 (a word is what it spells) and R6.1 (`[…]` selects or indexes, `.name` is a member); `[]` is an ordinary Node method (T4.18 answer).
- **R6.5 An object's members as a graph** — *`.ray2/Node.ray:1`*: "Functionality for turning the Node structure into a
  Graph (only certain types of methods) and navigating that. Like Saying the hierarchical tree as a Graph." **Q** —
  Recommend: `x as Graph` views an object's members (its fields by default, not methods; others with `<members: …>`) as
  a Graph whose edges are labelled by member name; the hierarchy is that view restricted to `.children`.
  **Follows (2026-10-06):** `x as Graph` is an ordinary conversion viewing an object's members (its fields by default; others with `<members: …>`) as a Graph whose edges are labelled by member name; the hierarchy is that view restricted to `.children`, from R6.1 (an object is a superposed Ray), Almanac A2 (Array ⊂ Graph structurally) and R7.2 (hierarchy).

## R7. Hierarchy and Location (*World:17–25, 444–470; ep:279–284*)

- **R7.1 Location = Ray** — a location sits in a hierarchy (parent, children) and is hosted by an instance.
  The draft's `@` on every Node. v0: `location` isn't a name on Node, because persona/item hold a field of
  that name.
- **R7.2 `.hierarchy` vs `.inventory`** — *World:463–470*: "A <.hierarchy B means A is rendered inside B";
  `.hierarchy` for inventory and rendering, "what if it has both"; `.hierarchy` of a hierarchy maps to
  itself; "`.hierarchy` instead of `.inventory`".
- **R7.3 `[{field: *}]`** — a child reached by the field it is decorated with.
- **R7.4 Hierarchy is a second collapse** — *ep:1139*: a hierarchy is like collapse/expand in reverse.

From the drafts review (2026-10-06).

- **R7.5 A child's location extends its parent's** — *`.ray2/Transaction.ray:4–8`*: `sub.location &= dynamically
  location.copy().push_back<edge: .value = property>(sub).last`; *`.ray2/Character.ray:14–24`*:
  `inventory.push<edge: .value = property>(current)`. **Decided (draft)**: a child's location is its parent's location
  extended by one edge labelled with the property it is reached by (`x.a.b@` = `x@ -a-> -b->`). It is dynamic, so moving
  the parent moves it.
- **R7.6 `->>` and the hierarchy** — *`.ray2/_todo/…/instance/UI/Geometry.ray:36, 268–269`*: in the current group
  (hierarchy-wise) or the entire "under", ignoring hierarchy; "`->>` means everthing to the right"; "Allow
  top.left.last go to the topmost/leftmost". **Q** — Recommend: `->` is the next one; `->>` is everything onward to the
  far boundary within the current hierarchy level; `x.hierarchy ->>` ignores levels. Directions compose:
  `top.left.last` is the top-left extreme.
  **Follows (2026-10-06):** `->` is the next one; `->>` is everything onward to the far boundary within the current hierarchy level; `x.hierarchy ->>` ignores levels; directions compose (`top.left.last` is the top-left extreme), from F-G3 (Decided draft: `<-`/`->` are neighbours, `<<-`/`->>` the far ends) and R7.2.

---

## Decided

Answers from 2026-09-30.

- **R1.1** `⊢ ⊣ ∙ ⊙ ∃ ∀` are plain aliases: `initial | ⊢ : Boundary`. Hugged together they compose
  members (`∙⊣⊙initial`).
- **R1.2** `Ray := Iterable + Ordered` (component addition).
- **R2.1** The default traverser is a context override: `with Traverser.default = …`; per call
  `for<traverse: BreadthFirst>`.
- **R2.2** `.every` covers the whole structure reachable from the entry, in both directions;
  `(ray -> .next).every` for one direction.
- **R3.1** `.remove` preserves structure by default (neighbours reconnected). Severing and DPO are
  other methods.
- **R3.3** `.expand` unfolds one level by default; recursively on request.
- **R4.1** `a..b` is inclusive on both ends, as a Ray: `a..` = `a ->`, `..b` = `<- b`, `0..10..20` goes
  through 10, `5..10` as a type is `5..10.reduce(|)`, and exclusive is `a..<b`.
- **R4.5** The TS `Range`/`MultiRange` draft is not ported; ranges are rays.
- **R5.2 / N1.2** ∞ is the terminal reference of an unbounded ray (the boundary a walk never
  reaches): `(0 ->).count == ∞`; −∞ is the initial one of `<- 0`. A loop is not ∞.
- **R7.2** One relation, `.hierarchy`: containment and rendering (`A <.hierarchy B` renders A inside
  B). Ownership is done with location.
- **R3.10** min/max/sort default to the entries' `<`; `.sort(dimension)` / `.max(.y)` pick another.
- **R6.2** Instantiating by collapsing a type's open possibilities is `choose T`.
- **R1.3** Structure constraints are enforced while building, as `dynamically assert`: they are the type.
- **R2.3** A callback with no parameters iterates without the variable (`for => …`, with `.index`), and a
  callback's parameters are one structured argument (Almanac A5).
- **R2.6** Variables used inside `.map` are copied into the map's structure (call by value); `@ <-` writes
  back out.
- **R2.7** Every function is a generator through `**` (P1.8): `yield x` marks a value as a result so far.
  There is no separate generator type.
- **R3.2** `push_back` adds a last entry. There is always a boundary after it, and that terminal boundary
  is not pushed over: "last" is relative to the structure being traversed, not the one it is defined in.
- **R3.6** `split` drops delimiters by default (`keep_delimiter = false`) and is a map that keeps the
  equipped structure.
- **R3.8** Composing with `,`: an element of type `(previous: T): T` composes (`1, +2, +3`); a list that
  isn't a Ray isn't flattened; `x: String[] = "a", Object, "b"` reads by type. A list written first in a
  comma list is flattened into a new list (`lst, 5`); `[lst], 5` keeps it as one element (L§1.2, 2026-10-02).
- **R3.13** `.flatten` flattens fully by default; `.flatten(n)` flattens n levels.
- **R4.3/R4.4** Ranges over graphs now as well: in a graph, `a..b` is all paths from a to b. Surfaces
  come with Geometry.
- **R6.1** `obj[String]` is all of the object's rays ending in Strings (fields by value type);
  `obj["name"]` selects by key.
- **R6.3** A named index is a step along that dimension: `pos[y: 5]`.
- **R1.4** Many initial/terminal boundaries are in the Ray core now: a boundary holds a superposition, so
  hypergraphs fall out.
- **R3.4** `a.path_to(b)` gives all paths (a superposition), `.min` the shortest; an unbounded search is a
  quest.
- **R3.7** `.complement` is the whole context graph except the selection.
- **R3.5** Graph rewriting (DPO, SPO), products (cartesian, tensor) and unions (plain, disjoint) are built
  now, on the rule machinery.
- **R7.3** `loc[{name: "x"}]` selects the child whose `name` is x: a filter inside `[]` (A-C1).
- **R1.5** Predicates on a superposition map over it: `(a | b).is_boundary` is
  `a.is_boundary | b.is_boundary`, without collapsing the abstract interpretation.
- **R1.6** With several Ray extensions equipped, `.next` follows the same rule as T8.2: `+` means the last
  one wins, `&+` superposes.
- **R1.7** `.value` is the vertex's content without its equipped structure (everything except the Rays at `#`).
- **R1.8** Continuous (Real-indexed) structures come with Geometry.
- **R2.4** `reduce` and `reduce_right` (reduce on the reversed ray), cancelling early with `return`, and
  map + reduce together.
- **R2.8** `.next` always returns an iterable with `#`: on a branching ray it is the superposition of the
  next vertices.
- **R3.9** A structure is repeated with `* n` (`"ab" * 3`, `[1, 2] * 3`); `String.repeat` becomes this.
- **R3.11** Move operations stay: `x.move_after(y)` is a preserving remove (R3.1) plus `push_after`.
- **R3.12** A path is a function, and locations match with `~=` like any structure
  (`/ ~= ^/.@`: files beginning with `/.@`).
- **R3.14** Any operation that compares (`contains`, `unique`, `sort`, …) takes the equivalence graph as
  `<in: …>`, as `==` does (U9).
- **R3.15** A path may cross versions of the graph (a path over history `%` is a path like any other), and
  finding one can be a quest.
- **R4.2** `5..10` as a type is `5..10.reduce(|)`.
- **R5.1** Loop operations stay: `unrolled`, `unrolled_mod` (a loop remains between the first and last
  instance), `instances`, `disallow_loops`. OR is parallel structure, AND is sequential.
- **R7.1/R7.4** On Node, the location is `@`: `x@` is x's location, and `x @ loc` places or reads x at loc.
  `x @remote` is x at that remote character, the same as `x @ @remote` (T3.6 corrected).
- **Covered elsewhere:** R2.5 (Almanac A-C1: `{p}` / `xs[{p}]`; `~` only for entry points).
