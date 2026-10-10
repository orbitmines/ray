# Ray and the Ether: Design

This document collects every design decision about the Ray programming language and the Ether projects built on it,
ordered for reading. It replaces the per-topic spec files (Language, Grammar, Types, Program, Ray, Numbers, Text, World,
Universal, Almanac, Frontend, Gamification, Library, Compiler, Reader, Plan, Overnight, Bugs). Those files, with their
question IDs, source citations and the history of each answer, are in git history: `git log -- @ether/spec/Language.md`.

Two documents stay separate: [Philosophy.md](Philosophy.md) (why the language looks the way it does) and
[Example.md](Example.md) (a worked example of the Ether Library pipeline). The published description of the language is
the Ether's Almanac (<https://orbitmines.com/almanac>). Where the Almanac still shows an older spelling,
[Appendix B](#appendix-b-where-the-almanac-still-shows-an-older-form) lists it.

**How to read this.** Everything in the main text is decided. When a decision replaced an earlier one, only the current
one is written here. Replaced spellings and dropped ideas are listed in [Appendix C](#appendix-c-dropped-and-replaced),
so they are not proposed again. "Planned" marks a direction that is recorded but not designed in detail. Questions that
are still open are in [Appendix A](#appendix-a-open-questions).

## Contents

1. [Purpose and principles](#1-purpose-and-principles)
2. [Rays](#2-rays)
3. [Many: superposition, components, probability, choice](#3-many-superposition-components-probability-choice)
4. [Reading text](#4-reading-text)
5. [Values and literals](#5-values-and-literals)
6. [Names, assignment and context](#6-names-assignment-and-context)
7. [Types](#7-types)
8. [Equality and equivalence](#8-equality-and-equivalence)
9. [Classes and enums](#9-classes-and-enums)
10. [Functions and programs](#10-functions-and-programs)
11. [Collections](#11-collections)
12. [Numbers, units and time](#12-numbers-units-and-time)
13. [Text, encodings and identifiers](#13-text-encodings-and-identifiers)
14. [Locations](#14-locations)
15. [Projects, languages and versions](#15-projects-languages-and-versions)
16. [Version control](#16-version-control)
17. [Execution, trust and access](#17-execution-trust-and-access)
18. [Identity and security](#18-identity-and-security)
19. [The world: characters, instances, quests](#19-the-world-characters-instances-quests)
20. [Compiler levels and optimization](#20-compiler-levels-and-optimization)
21. [The runtime](#21-the-runtime)
22. [The frontend: geometry and UI](#22-the-frontend-geometry-and-ui)
23. [Gamification](#23-gamification)
24. [Backlogs: the IDE and the Library Project](#24-backlogs-the-ide-and-the-library-project)
- [Appendix A: Open questions](#appendix-a-open-questions)
- [Appendix B: Where the Almanac still shows an older form](#appendix-b-where-the-almanac-still-shows-an-older-form)
- [Appendix C: Dropped and replaced](#appendix-c-dropped-and-replaced)

---

## 1. Purpose and principles

### 1.1 What Ray is for

- Ray models the semantics of every other language, from assembly to high-level languages. It can serve as an assembly
  language, a systems language or an interpreted language. Assembly is valid Ray syntax, and program equivalences lift
  low-level code to higher levels.
- Instead of writing a backend for every compiler, Ray decompiles the backends that compilers already target. Languages
  are made to interoperate first; applications come after.
- The interoperability goals: (I) use another language's library without a shared library; (II) choose one language's
  memory model across a language boundary (a memory model is a Program level chosen per boundary); (III) share access to a
  structure without a channel; (IV) mix languages within a file and across files.
- Frontend, compiler and backend are relative terms. Any level can serve as the universal one.
- Roadmap: the Ray language now; the Ether (the IDE) in 2027; the Ether Library Project in 2028; the physics and game
  engine in 2029; then gamification.

### 1.2 Principles behind every decision

1. **Ray is the only structure.** Objects (Nodes), numbers, types, arrays, graphs, functions, programs, histories and
   locations are all Rays. Nothing is put on top of it: no intermediate representations, no record vocabularies, no
   registries, no per-kind matchers. Ray is its own IR.
2. **Methods are the syntax.** Defining a method makes its written form valid. `,` is a method that links vertices, `|` a
   method that decorates an edge with alternatives, `[]` a method that answers `Array<this>`. A type is a value built by
   such methods.
3. **Features live in the language.** The reader barely changes when the language gains a feature. A construct is written
   as a library rule first. When something cannot be written as a rule, the reader is changed generically, so that a whole
   class of rules becomes expressible.
4. **Compose, never special-case.** When two constructs don't combine, fix why they don't. Don't add a variant rule per
   keyword.
5. **Three buckets** (see Philosophy.md): languages, optimizations, look. Speed, storage layout and caching are
   optimizations (Compiler levels), never semantics. Only an optimization ever mutates a value in place.
6. **Infer what can be inferred.** IO, purity, effects, abstractness and relaxed parameter types are inferred. A modifier
   is written only for what can't be inferred.
7. **Words over mathematical symbols.** `is`, `forall`, `exists`. `∀`, `∃`, `∄` exist only as editor equivalences of
   those words.
8. **Failures are errors.** A failure raises `ERROR@Type`. An error may become a quest later, but library code never
   answers a quest-like value where it should raise.
9. **A minimal core.** Functionality is isolated in projects with local dependencies. The core keeps only what it needs
   to work.

---

## 2. Rays

### 2.1 The structure

- A Ray starts as a vertex with an initial and a terminal boundary. A boundary that defines further boundaries makes an
  edge; one that defines none is a dangling edge, a boundary of the structure. Repeating vertex and edge gives a line of
  points: an array.
- Every place can hold many things. A vertex with many boundaries makes a graph. A boundary connected to many boundaries,
  or to many vertices, makes a hypergraph ("hyper" might as well mean "many"). A boundary holds a superposition, so
  hypergraphs fall out of the core.
- The kinds are structural, with no class hierarchy:

  ```ray
  Array ==.instance_of Hypergraph   // true
  x: Graph = [1, 2, 3]
  ```

- `Ray := Iterable + Ordered` (component addition).
- `⊢` and `⊣` are aliases of `initial` and `terminal` (`initial | ⊢ : Boundary`), as are `∙` and `⊙`. Written together
  they compose members: `∙⊣⊙initial`.
- `.value` is a vertex's content without its equipped structure.
- A structure's constraints are enforced while it is built, as `dynamically assert`: they are its type.
  `unidirectional` is a predicate (`all.every(!.previous)`); asserted on a structure, the compiler may also take it as a
  hint to keep no `.previous` links.
- Alternatives written with `|` while building a structure become separate branches: `x: Graph = [1, "2a" | "2b", 3]`.
- Mapping keeps the structure: `x: Graph = [false, false | true, true]`, then `x.map(!)` is
  `true, true | false, false` on the same graph.
- On a Ray, `<`, `<=`, `>`, `>=` compare positions by walking from the entry: `a <= b` when `a` is reached no later than
  `b`. A Ray is ordered by its own walk.

### 2.2 Composition and the recursive step

- `,` composes structures into one value; it never splits. Every function therefore takes a single, structured argument.
  `,` is the loosest operator.
- `,` accepts closures on the previous element, and is interchangeable with `|` and `&`, which only decorate the edge:

  ```ray
  1, +2, +3, +4      // 1, 3, 6, 10
  1 | +2 | +3 | +4   // 1 | 3 | 6 | 10
  ```

- `a -> b` reads like `a, b` when `b` is already a value, but it is a recursive step. `ray -> .next` steps through
  `.next` from `ray` until `.next` is None. Direction says which end is initial: `.parent <- a` steps through `.parent`
  from `a` and ends at the root. `<-` walks `.previous` as `->` walks `.next`, so a leftward step is the inverse.

  ```ray
  -1 <- 0 -> +1      // the number line
  -1 <- x: "A" -> +1
  (0 -> +2)[4]       // 8: a recursively defined ray is indexed like any iterable
  node -> .parent    // the chain of parents
  ```

- A type may give `->` its own meaning (a breakpoint-sized width defines `->` as interpolation, §22.2).
- `->` is the next one; `->>` is everything onward to the far boundary within the current hierarchy level; `<<-` the
  other way; `x.hierarchy ->>` ignores levels. Directions compose: `top.left.last` is the top-left extreme.

### 2.3 Infinity and loops

- ∞ is the terminal reference of an unbounded ray, the boundary a walk never reaches: `(0 ->).count == ∞`. −∞ is the
  initial reference of `<- 0`. A loop is not ∞.
- `[]∞` is an alias of `.unbounded`: `3[]∞` is an unbounded number of 3s (`1/3` is `0.333…`, `3[]∞`).
- Loops (orbits): `.orbit` (`[1, 2, 3].orbit[5] == 3`), `unrolled`, `unrolled_mod` (a loop remains between the first and
  last instance), `instances`, `disallow_loops`. Iterating a loop answers the finite unrolled ray with its terminal
  boundary joined to its initial one. OR is parallel structure, AND is sequential structure.
- An orbit's wrap edge may act on the enclosing segment: stepping past December moves the year on by one (§12.3).

### 2.4 Hierarchy, and objects as rays

- `.hierarchy` is one relation for containment and rendering: `A <.hierarchy B` renders A inside B. Ownership is done
  with locations, not the hierarchy.
- A child's location is its parent's location extended by one edge labelled with the property it is reached by
  (`x.a.b@` is `x@ -a-> -b->`). It is dynamic: moving the parent moves the child.
- An object is a superposed Ray. `obj[String]` is all of its rays that end in Strings; `obj["name"]` selects by key.
  `x[1]` is the index and `x.1` the member written `1`; `x[1] = v` never creates a member `1`.
- `x as Graph` views an object's members (its fields by default; others with `<members: …>`) as a Graph whose edges are
  labelled by member name. The hierarchy is that view restricted to `.children`.
- A named index is a step along that dimension: `pos[y: 5]`.

---

## 3. Many: superposition, components, probability, choice

### 3.1 Every variable is many

- A variable can hold any number of values, or rather an arbitrary graph of values. There is no boundary between the
  runtime and a type system here: the alternatives exist and can be used at runtime.

  ```ray
  "A" | "B"
  boolean == false | true
  boolean#.count            // 2
  ```

- `#` is a variable's possible values. Only `#` enumerates a superposition (`.keys` and `.values` are for maps).
- `&` holds both at once and supports non-boolean results; on booleans it collapses to `&&`.
- Operations map over a superposition, and so do calls:

  ```ray
  (1 & 2) + 1               // 2 & 3
  func(1 | 2)               // 2 | 3
  s (x: boolean) => x ? "Y" : "N"
  s(false & true)           // "Y" & "N"
  s(boolean)                // "Y" | "N"
  "A", ("B" | "C")          // "AB" | "AC"
  true (|| | &&) false      // (true || false) | (true && false)
  ```

- Predicates map without collapsing an abstract interpretation: `(a | b).is_boundary` is
  `a.is_boundary | b.is_boundary`. Setting `.value` on a superposed boundary sets it on each alternative.
- Every alternative keeps where it came from (`.origin`, `.sources`). Narrowing an input (`with c = true`,
  `if assume c`) narrows the result to the alternatives that came from it.
- A constructor is not mapped over a superposed argument by itself: `Point(1 | 2)` stays one point unless what it
  returns uses the variable. Several points are made with a narrowing: `Point{x: 1 | 2}()`.
- Concurrent writes that overlap superpose: the variable holds both (`a | b`), and reading it with a policy (the last,
  any, all) resolves it.
- When two readers accept the same text with different results and nothing ranks them, the text reads as their
  superposition, resolved by what uses it: `d: Date = 2-7` takes the Date reading, `r: Range = 2-7` the Range one.
- A bare `?` is *unknown*: every possibility, superposed. It is also the "sorry" of a proof. `f(?)` calls f with an
  unknown argument, which is abstract interpretation.

### 3.2 Components

- `A + B` combines two values; B overrides A, so `+` doesn't commute. `A &+ B` and `A |+ B` superpose the components
  instead:

  ```ray
  ("A" + true).next         // false
  (true &+ "A").next        // false & "B"
  (true |+ "A").next        // false | "B"
  ```

- Components are added at the top level only; `#` reaches inner boundaries explicitly.
- Between types, `+` is component addition: `String + Ray` is a String with the Ray component, one whole
  (`Positioned := String + Ray`). A class made of several bases is `Test := Super + Super2 { … }`; its hierarchy stays
  single (`class: Parent`). Its `super` is the superposition of the bases' constructors, and `super.Name` picks one.
- Class components are removed with `-`, so a value can lose a type: `x - Printable`, `T - method`. `Object := * - Node`
  is a value with none of Node's members: a plain map.
- `##` extracts components (`x## // ["A", true]`), or by type (`string: String = x`). A cast reads one component:
  `(x as String).next`.
- When components define the same member (`.map` on `String + Ray`, `.next` with several Ray extensions), `+` means the
  last added wins and `&+`/`|+` superpose them.
- Merging into a property is `&+` on the property (`x.style &+= {italic}`); `+=` replaces it.
- Monkey-patching is component addition on a class: `X += { … }` overrides, `X &+= { … }` superposes. Only on a class,
  and it answers the class: `Number += { squared => this * this }`, then `5.squared // 25`.
- In a map literal, the own key wins over Node's member of that name: `{ count: 3 }.count` is 3, and Node's is still
  `m.on(Node).count`. A `key: value` entry is transparent: everything, `==` included, delegates to the value, and `.key`
  still reads the key.

### 3.3 Probability and shares

- A weight and a share are the same thing; the only difference is whether it is realised.
  `0.2("A") | 0.5("B")` is a distribution; `50% X` and `0.5 X` are that share, realised as a choice.

  ```ray
  x = "A" | "B"
  x#.random                       // "A" or "B", 50% each (uniform by default)
  x: String? = 0.2("A") | 0.5("B")   // what isn't covered is None (only if optional)
  x: String? =
    0.2 => "A"
    0.5 => "B"
  0.5(0.5("A") | 0.5("B")) | "C"     // nested weights
  0.5("A") & 0.5(0.3("B") | 0.7("C"))  // & is not weighted: two separate probabilities
  n 0.3("A") | 0.7("B")              // calls keep weights: 0.3(1) | 0.7(2)
  ```

- A share is a count of possibilities: `50% ("A" | "B" | "C" | "D")`, `1/2 Binary₃₂`, `0.5 "A" | "B"` (the same as
  `1 ("A" | "B")`). A share that isn't whole on a finite structure is a type error.
- Counted types: `x: 1 Number` is `Number{#.count == 1}`; abstract interpretation is held to one as well. `4 Wall`,
  `1..3 Bookshelf`, `a Table`, `an Item`.
- A distribution's probabilities live on the superposition's edges. `?.random` makes a random instance of the current
  type (it fails on infinitely generating types). Randomness has one selector, `x.random`. `secure` names a
  cryptographic source; `with Random.seed = 42` fixes the seed.
- A value that may be corrected carries an uncertainty: a distribution around the reading, narrowed by corrections
  (`Time.now`). "An approximate value is fine" is an uncertainty type: `likes: ≈Number`.
- An A/B rollout is a weighted superposition of two pinned versions: `0.1(x%[new]) | 0.9(x%[old])`. Each request realises
  one; the weights are a setting of the location that serves it.

### 3.4 Choice

- Choice says a value may be picked arbitrarily: we don't care which. Unlike a random variable it works on infinitely
  generating structures, and it may have a preference.
- `choose T` is an abstract Program run by its chooser. It always resolves through `@me.choose`; only who `@me` is
  differs. The computer picks (weighted at random); a player gets a chooser.
- There is one form, `choose T`. `choose 1 Number` and `choose 50% boolean` need nothing of their own, since `1 Number`
  and `50% boolean` are already types. Constraints go on the type: `choose UUID.v1{unique}`. Filters belong to the methods
  that take them:

  ```ray
  [1, 2, 3].map{choose 1}(*10)    // [10, 2, 3] | [1, 20, 3] | [1, 2, 30]
  func (a: String, b: Number[], c: String) => a
  func(choose, choose)            // the second may be a Number[] or a String
  ```

- `choose n` picks n distinct ones by identity (`===`, location included). Each place a variable sits in is a separate
  variable, so `choose 2 (x, x, "5")` may give x twice.
- `()` on a constrained type chooses: `Number{> 5}()`. A `dynamically choose` may change later.
- `x := choose? Number ?? placeholder` offers a choice whose unanswered value is the placeholder; `x.choosing` holds while
  the choice is open.
- Instantiating a type by collapsing its open possibilities is `choose T` (procedural generation: `choose Room`). The
  algorithm is a setting of whoever chooses: `with Choice.algorithm = WaveFunctionCollapse { choose Room }`.
- `unordered => choose Iterable{.every(this.contains(.)) && .count == count}`: order doesn't matter, which some
  optimizations need.
- `@me.choose String` forces the player to choose. The doc comment above a `choose` is the text shown to the player, and
  a player's answer enters as a weighted alternative, not as a certainty.
- Rendering a superposition goes through `@me.choose` too (§22).

---

## 4. Reading text

### 4.1 One rule reads everything

- Ray's grammar is a self-modifying type (an adaptive grammar): something found in the text may change how the rest is
  read. Reading is one rule, a type capture mapped to what it means:

  ```ray
  {pattern} => {functionality} => Expression |= pattern => functionality
  Expression := String            // text no rule reads stays one, with its diagnostic
  {expression: dynamically Expression} => expression
  ```

  `=>` is an equivalence: reading walks Expression's equivalences until it reaches a value. There is no separate
  Statement type. When Expression gains an equivalence, only the spans that reached no value (or stayed Many) are walked
  again; an assignment re-walks every walk through that name.
- How the reader itself is built (the host knows no syntax, the bootstrap, the externals) is §21.

### 4.2 Rules are methods; patterns are types

- `pattern => body` defines a method on the scope (the class node) where it is written; applying the rule calls it.
  A rule written again with the same head overrides with `=>` and superposes with `&=>`. A subclass's rule overrides the
  one it inherits.
- A head is read as an expression. In `add (a: Number, b: Number = 10) => a + b`, `add`, `a` and `b` are nodes; `:` sets a
  node's type, `= 10` gives it a default, and `,` composes. Arguments are later definitions on the same nodes: positional
  ones bind like destructuring (`(x, y) := a, b`), named ones (`b: 5`) are `:` on that node. `upper | up => …` is a
  superposition defined under each name. A call's frame is made of the method node, so defaults show through.
- Captures in a head:
  - `{x}` reads an expression where it is written.
  - `{x: T}` is typed: it matches a span that T's own rules read whole. This is purely structural: nothing is defined on
    types for it, and the value is the span read in T.
  - `{{x}}` is code (a block) handed on unread.
  - `[x]` is an operator: `a [x] b`, the same spelling as a variable used as an operator.
  - `{x?}` is optional.
- A literal word in a head matches only that written word, never a variable's value; a local named `for` shadows the name
  only where it is used as a value. Grammar rules read characters, including inside a word.
- Negation and look-around are narrowings on a capture (`{x: T{!= `=`}}`), with `⊢`/`⊣` anchors for boundaries;
  look-behind reads `<-`. A negated part doesn't end a match early; it only forbids continuing with that text.
- A pattern that doesn't match all it was given fails, unless something else in it matches the rest.
- Each alternative of a rule may carry its own signature (`|` there is just the superposing method).
- Rules with two operators are ordinary (`c ? a : b`, `a * b * c`).
- `dynamically match` is the default for every pattern: a variable a pattern binds is in scope for the whole expression,
  and changing it re-matches the pattern (not the rule that produced it).
- New syntax can't be defined without `()` or `=>`.
- A grammar change applies to its own phase. A dependency's grammar is imported only as a language-changing phase. Rules
  that circularly prevent each other are an error.
- Text no rule reads is an error, and the error is its diagnostic. Reading goes on, so a file can hold several, and the
  unread text stays an unresolved Expression that later rules may still read.
- Evaluation runs until nothing changes, with a diagnostic when a cycle is detected.
- Syntax tests are claims that override a rule in a scope and check the reading; they run in a Program level of their
  own so the change can't leak.

### 4.3 Which reading wins

- Longest match first.
- Between equally long readings, one led by a literal (a statement led by a word) reads the whole over one led by a
  capture (an operator between operands).
- Between different rules, the one declared first reads the whole: **declaration order is precedence**, and what is
  declared first binds loosest. The nearer of two rules with the same head wins. A definition read whole beats other
  readings.
- Readings still equal are a superposition (Many). There is a diagnostic only where one value is required.
- Precedence is pairwise. An operator is placed relative to others by declaration order, by its position after a method
  label (`Node~method`), or with the modifier `precedence(before X)` / `precedence(after X)`.
- A longer rule over operators wins over a value's own operator method only where the operators are `chainable`.
- The longest declared word wins: `boolean`, not `bo ole an`. A hyphenated declared name (`towards-a-universal-language
  := …`) is read whole by longest match, not as `-`.
- A hugging `.member` binds tighter than any operator: `x+y.func` is `x+(y.func)`. `:` binds only the nearest operand on
  its left.
- `return ME if c` is `(return ME) if c`: a postfix `if` on the statement.
- If `f` has a method `-`, `f -x` is `f - x`; write `f(-x)` for the other reading. There is no direction-switch marker.

### 4.4 Operators and direction

- Every operator takes one argument per side. Prefix, postfix and bracket operators are binary with a None side.
  Juxtaposition and `,` are ordinary operators with a precedence.
- Associativity *is* direction: a right-associative operator is declared right-to-left (the way direction.ray writes RTL
  rules). `^` as power is declared right-to-left (`2^3^2` is `2^9`); `=` is an ordinary left-to-right method.
- Within one expression, operators left of a shared operand read right-to-left and those right of it left-to-right. Any
  other mix is an error asking for parentheses. A method that is found but declared for the other direction gets that
  diagnostic ("`X` is declared right-to-left"), not "unresolved".
- An operator usable on either side reads by the side its operand is on. `bidirectional` is the `&` of both directions,
  invoked on their shared boundary. A right-to-left operator with nothing on its right does not apply.
- Right-to-left text still goes downward after a newline. A line may switch direction; each run is read in its own.
- `chainable` is a modifier on the method (`chainable < (other) =>`). It registers the rewrite
  `(a op b)** op c => a op b & b op c`, so `1 < 2 < 3` is true; it also works inside type arguments
  (`Array<3 < length < 5>`).
- `compounds` gives `op=` for an operator (`compounds + (addend) => …`): `x op= y` is `x = x op y`. It refuses an
  operator whose `op=` is already a method of its own (`==`, `<=`, `!=`, `:=`, `&=`). `%=` is modulo-assign.

### 4.5 Layout

- Tabs, and any Unicode space separator other than U+0020, are an error in code (allowed inside strings and comments).
  Padding spaces inside brackets are not separators: `{ .func }` is `{.func}`.
- A newline ends a statement. `;` separates statements on one line (`a := 1; b := 2`). Inside `{ }`, only a newline
  separates statements; two spaces don't. `;` doesn't reset what a continuation applies to: `a ; + b` applies `+ b` to
  the result before `;`.
- Continuation lines apply to the previous result:

  ```ray
  value := 5
    + 3
    + 2               // 10
  total := first +    // a line ending with an operator continues
    second
  obj
    .first            // a line starting with `.` continues the line above
    .second
  ```

  A line starting with `.` always continues the line above. That is silent, so a statement meant to stand alone must not
  begin with `.`. A continuation written in another context applies in *its* context.
- Lines indented under a call are its arguments in order; an operator-led line continues the previous argument; the last
  one is the block when the callee takes a `(): *`. A closure argument extends to the next `,` or `->` at its level. A
  trailing block goes to a `(): *` capture; a `*` capture never takes a block a following `(): *` capture could take.
- A block given to a property is an effect on the type's constructor; a block given to any other value is called and its
  value used.
- A space may replace `.` for any property: `"A" lowercase`. After a superposition, a space goes to its type or method:
  `A | B : String`, `A | B .method`, `A | B {length == 2}`. So these are the same:

  ```ray
  (0 -> +2){< 10} for i => print(i)
  (0 -> +2) {< 10} for i => print(i)
  ```

- Parentheses may go almost anywhere and always mean something. Inside them is a closure with the accessed value loaded
  into its context, so the value's `.next` wins over the scope's:

  ```ray
  var (condition ? == : <=) 5
  Symbol: Char = Unicode.GeneralCategory.(Punctuation | Symbol)
  a (+ | *) b
  ```

  A bare `(x)` is a group; `this(x)` calls.
- `--` continues on the result of everything before it on the line, also after a newline and optionally with `if`. `~~`
  does the same but answers the original:

  ```ray
  1, 2 -- .map(+1)                    // 2, 3
  [1, 2, 3] ~~ .push_back(4)          // [1, 2, 3]
  mac_address: Binary₄₈ = secure Binary₄₇.random ~~ .[6].push_after(1)
  as (=== String) => this
    -- .embed_ipv4 if is "::ffff:0.0.0.0/96"
    .compress_zeros
  ```

- Postfix guards `x if c` and `x unless c`; a guard not taken answers None. Since `,` is the loosest operator,
  `a, b if c` is `a, (b if c)`; in a multi-line list each line's `if` applies to that line's element.
- `(M if c) x` applies a prefix `M` (any modifier word) to `x` when `c` holds, else is `x`.
- A call is juxtaposition: a space is a call when the thing before takes an argument. A value that takes none is not a
  call, and when nothing else reads the text it is an error on that span. Named arguments bind by name wherever they stand;
  positional ones fill the remaining parameters in order (`Ball(radius: 5m, "red", border: 1m, "solid")`).

### 4.6 Comments

- `//` line comments and nested `/* … */` block comments. Comments follow Markdown; a ```` ```ray ```` fence in a comment
  is Ray that doesn't run, shown darkened and italic. A block comment's text has its common indentation removed.
- A side comment belongs to the line it is on. Otherwise the comment directly above a statement attaches to it: it is an
  `assert`'s message, a definition's documentation, a `choose`'s text for the player. Comments never affect indentation.
- `TODO` (in code, as an abstract body, or in a comment) is painted `^todo` and listed as an info diagnostic. `name =>
  TODO` is how an abstract member is written.

### 4.7 Styles and highlighting

- `^` marks a style: `"Important" ^italic` is canonical, and `"Important".italic` also works. `^` is a method. Styling in
  general (italic text on a page) runs on the same infrastructure as syntax highlighting.
- On numbers, `^` is power, declared `right-to-left compounds ^`; it overrides the style marker. A defined name wins: if
  a local is called `keyword`, `x ^keyword` is power.
- A decorator written after a name or pattern colours the definition and its references: `X ^style := …`,
  `keyword ^keyword := external global`. A `^style` marker is painted in the style it names; control-flow words are
  painted `class` (they are classes); a rule's captures are `parameter` in its pattern and body; `=>`, `:=` and `=` are
  punctuation. The theme is in the entrypoint (`theme \`name\` { ^style = ^ #hex }`).
- A literal read by a typed capture or declaration (`x: IPv6 = "::1"`) is painted by that type's rules, not as a plain
  string. `` `const x = 2`.js `` marks a literal as written in that language and highlights it as such.
- An editor style is a set of forced equivalences switched on or off: `inline Style.mathematics` (`.every` shown as `∀`),
  and turning it off rewrites back to words. A preferred spelling is a `suggest` equivalence per style, configurable per
  person.
- Humans type `^8` and `v 2`; the editor forces them into superscript and subscript by default (a `force` equivalence,
  switchable per rewrite). The file may hold either spelling. Backspace removes a whole displayed glyph; Ctrl-Z brings the
  typed form back. Glyph mappings never apply inside string literals.

### 4.8 Modifiers

- A modifier is a method that takes the definition it modifies and answers a located value:
  `Modifier = (this: *): { location: a (this, *) }`. Modifiers are language-side: `chainable <`, `compounds +`,
  `right-to-left`, `precedence(after X)`, `dynamically`, `static`, `internal`, `global`, access prefixes like `@public`.
- A modifier takes one definition or a block, and on a block it applies to each definition in it: `@private { … }`,
  `static { … }`.
- `global` says a definition prefers the global one: `global [] (items) => …`, so `[1, 2, 3]` calls the global `[]`
  rather than a local `[property]`.
- Only what can't be inferred is written: `external`, `right-to-left`. `pure` and `deterministic` may be written, as
  assertions that are checked.

---

## 5. Values and literals

### 5.1 Text

- `"A"` is a Char and `"Ada"` a String. A String *is* its characters (`String := class: Array` of Char); it defines none
  of `==`, `entry`, `count`, `length`, `first` and so on, and inherits them. There is no `.characters` field.
- Backticks `` `…` `` are the raw written literal, taken exactly as written (what externals and patterns take).
- Interpolation: `"Hello {name}!"`. `\` is the escape character: `\"`, `\{`, `\0 \t \n \r \x{…} \u{1F525}`. A character
  can also be written `U+1F525`.
- A multiline string loses the indentation of its least-indented content line. A blank line right after the opening
  quote or right before the closing one is dropped.
- `"ABC" == "A", "B", "C"`, and `x: String = "A", "B", "C"`. `String[] as String` joins without a separator; `.join(sep)`
  adds one.
- Calling a string evaluates it as a name.
- Fields can be set on a slice and live on that subgraph (`s[0..2].field = v`), which is how styles and marks sit on
  substrings. IME composition is a String with a `^composing` mark.

### 5.2 Lists and ranges

- `(1, 2)` and `[1, 2]` are the same list. For one element, `[x]` is a new list holding `x` (a list included) and `(x)`
  is just `x`.
- Written lists flatten: `a, b, c` is one list, and a list value written first in a comma list is flattened into a *new*
  list (never mutated): `lst, 5` is the elements of `lst` followed by 5. To keep a list as one element, bracket it:
  `[lst], 5`.
- Spread: `first, ...middle, last := "A", "B", "C", "D"` (`middle` is `"B", "C"`); `middle: ...String`. `...` is
  another spelling of `[]` wherever `[]` is allowed.
- Ranges are Rays, inclusive at both ends: `1..5`, `a..` (= `a ->`), `..b` (= `<- b`), `0..10..20` (through 10), `a..<b`
  (end excluded), `3..1` walks down. In a graph, `a..b` is all paths from a to b. As a type, `5..10` is
  `5..10.reduce(|)`.
- Slices include their end: `xs[..2]` is the first three, `xs[..<2]` the first two.
- `ray[500..999] = xs` puts `xs` itself at each position (the range is a superposition of places), unless a conversion
  shows `xs` can't be the element type while spreading it would fit; then its elements are spread.
- `x[k] = v` writes the entry; `f[k] = v` is visible as `f.k`.

### 5.3 None, booleans and `?`

- None is absence: `x == None` only when x holds nothing. `T?` is `T | None`, and a value that *may* be None is
  `==.instance_of None`, not `== None`.
- A member of None is None, so chains need no `?.`; postfix `?` stays optional chaining. The one exception: negated
  predicates (`!=`, `!~=`) on None answer true, since None matches nothing. Setting a vertex to None also clears its
  boundaries.
- A None produced inside a list (`[a, (b if c), d]`) is dropped; write it explicitly to keep a hole.
- None implements `location` and `=`: a None slot can be assigned and has a location. Casting None to a class is
  disallowed; write `Item{}` with its fields given explicitly.
- As a boolean, any value that is not None is true, and None is false (and 0). There is no `exists`: a value used as a
  condition is a boolean by itself, and a missing member reads as None. `if user.admin { … }`.
- A function whose return type is None answers nothing: its last value is not its result and is not added to lists.
- `?` has three uses: `T?` (optional), `c ? a : b` (the ternary), and a bare `?` (unknown, §3.1). `??` is
  null-coalescing: `maybe ?? 0`.

---

## 6. Names, assignment and context

### 6.1 Declaring and assigning

- `x := v` declares `x` here. It reads its value first, then declares, so `x := x ?? d` sees an outer `x`.
- `x: T` declares `x` typed `T` *and* sets its value to `T`, so an unset field reads as the full type: every possibility
  (`?`). `x: Number` then `y := x + 1` makes `y` every Number plus one.
- `x: T = v` declares, then assigns. `field?: Type` is shorthand for `field: Type?`. A declared type is the variable's
  type; the value narrows it only until reassigned (`x: Number = 5` is a Number).
- `x = v` assigns the nearest visible `x`. If there is none, inside a block it binds where the block was written,
  otherwise here.
- `=`, `:` and `:=` evaluate to the variable, never to the assigned value. `x = v` answers the location written
  (`holder`, `name`, and `previous`, the value it replaced).
- A variable with a structural type reads what is assigned by that structure: `x: Range = 2-7`.
- In a class body, fields are declared with `:=`.
- An unset field reads the class default *live*: a later change of the default is seen until the field is assigned.
  Storage keeps only assigned fields, and `x.field%` is empty while the field still follows its default.
- A context variable that is declared but not given must be supplied by `with`; using it otherwise is an error, unless
  the declaration is only a narrowing and the field already holds a value of that type.
- `:=` in a loop body declares a variable of that iteration.
- `assign` is an alias of `=`. `x.clear` sets x to a fresh `static()`. `x.copy` is a copy whose history forks from x's.

### 6.2 Aliases and derived members

- `a => b`, where `b` is another field, is a two-way alias: the name superposition `a | b: T` (as `initial | ⊢`).
- A derived member is writable when its derivation is reversible: with `diameter => radius * 2`, `diameter = v` sets
  `radius = v / 2` (through the inverse, §10.2).
- Fields may be defined in terms of each other in a cycle (`radius`, `diameter`, `boundary`). A valid instance breaks
  the cycle by setting any one of them.
- A parameterless function is dynamic: `area => width * height` is always current, while a stored variable isn't. A
  field holding `=> …` is evaluated on each read, so it may depend on who reads it (`invisible` is `Online` to oneself
  and `Offline` to everyone else).

### 6.3 What an assignment replaces

- A program's own graph is its history. An assignment keeps the value it replaces as the new value's `.previous`, so
  `x.previous**` are the values `x` held before, nearest first. This is Ray structure, not a `History`.
- There is no time on that edge. When a value changed is version control's (a commit's stamp, `x.history`), so anything
  measured against time imports `@ether/version-control` (transitions, pointer velocity, idleness).

### 6.4 Call by value, and writing elsewhere

- Arguments are passed by value: `var = …` inside a function doesn't change the caller's variable. A variable captured
  from an outer context, though, is changed there by default.
- Every `=` writes at the current location, so a variable branches per location. `@` names another one:

  ```ray
  var @ <- = Example("B")         // the whole call stack that led here, and its own context
  update (var @ <-: Example) => { var = Example("B") }   // the same, on the parameter
  var @ -> = Example("B")         // every thread the variable was given to
  var @ &caller = Example("B")    // only the caller's context
  var @ * = Example("B")          // every location (remote, database, mirror)
  x @ Example                     // x in that class, up the context chain
  @ loc { x = 5 }                 // run a block at a location
  ```

- One location concept covers a call frame, a thread, a host and a store. `@ <-` goes up the current location's chain
  (callers, parents); `@ ->` goes down (threads given to, children).
- Variables used inside `.map` are copied into the map's structure (by value); `@ <-` writes back out.

### 6.5 The running context: `&`, `with`, `assume`

- `&` is the running program at this place. There is one per scope (outermost, call, block), made lazily; its rules are
  seen by everything run in it, above lexical scope. Its members:
  - `&caller` (`&.caller`): the calling context. At the top level it is the character running the program. It is a
    Location, so `&caller.parent` is the calling method's class, and walking `&caller -> .parent` reaches the character.
    `&caller as Character` makes `&caller == @me` hold. Values set by overriding `&caller` are ignored, and control
    returns to the original function.
  - `&next` (the next step), `&entrypoint` (whether this program is the one being run), `&#` (the current context's
    concurrent branches), `&%` (the current scope's history), `&@` (the running program's chain of who runs it, §17),
    and `this`.
- `with <any code> { body }` overrides what things answer for everything run in that context, following calls (dynamic
  scope). Without a block it holds for the rest of the enclosing context. It writes into `&.caller` and is gone when that
  scope ends; nothing is restored by hand. `with something = X` is effectively `something @ -> = X`.

  ```ray
  with Time.timezone = UTC + 2h
  with { Time.YEAR = 2024 }
  with Ball = Ball~profile { … }
  with O = Compiler.default + Compiler.memoised
  with (@me = alice) program          // running as someone
  with (Location.current = loc) program   // running somewhere
  ```

- `assume` is the same as `with`; each environment prefers the word that fits. `assume c` with no value is
  `assume c = true`. A file that opens with `dynamically { assume … if … }` is an override over the rest of the file,
  re-read when its condition changes.
- `if assume c { … } else assume { … }` overrides `c` as true speculatively: a quest verifies it, and the branch rolls
  back if it was wrong.

---

## 7. Types

### 7.1 Types are patterns

- Every variable is a type. `x: T` makes `T` readable at once (the declaration confirms the value adheres to it). A type
  written with `|` reads as any of its alternatives, one written with `,` reads its items in sequence, a written literal
  reads exactly itself, and `T[]` (a method on Node, `Array<this>`) reads one or more `T`. The reader knows nothing of
  `:`, `|`, `,` or `[]`.
- For types only, repetition compresses, and nesting is flattened one step:

  ```ray
  "A", "B", "B"     ==.instance_of "A", "B"[]
  "A", ["B"], ["B"] ==.instance_of "A", ["B"][]
  "A", ["B", "B"]   ==.instance_of "A", ["B"[]]
  ```

- A class's structure sits in its header, beside what it is built on; the body holds its methods:

  ```ray
  UTF-8 := class: TF, sequence: (
    prefix: 1[]{length == 0..4},
    U0: Binary{length == 8 - prefix.length}{⊢0},
    (₂10, U1: Binary₆) if prefix ⊢₂11
    (₂10, U2: Binary₆) if prefix ⊢₂111
    (₂10, U3: Binary₆) if prefix ⊢₂1111
  )[] {
    as (=== CodePoint[]) => sequence.map(.U0, .U1, .U2, .U3)
  }
  ```

- A function has one argument, described structurally by its parameters in sequence, so variadics are patterns:

  ```ray
  varargs (a: String, b: Number[], c: String[]) => b.count
  part: String[] = "c1", "c2"
  varargs("a", 1, 2, 3, part, "c3")   // 3
  ```

- `is` is `==.instance_of`: `"A", "A", "A" is "A"[]`. Membership is `x is xs#`. In a boolean position (`if`, `?`, a
  narrowing) `x: T` and `x is T` test; as a statement `x: T` declares. Either narrows x in the branch taken, and the
  checker narrows a `T?` to `T` at a label when every edge into it sets the value.

### 7.2 Narrowing

- `T{p}` narrows a type with a boolean: `Small := Number{< 10}`. The body of a narrowing is a boolean (`xs{true}` keeps
  everything), and a predicate is a parameterless boolean program (`!p` is `() => !p()`).
- `{p}` is type-directed. If `p` makes sense for the structure itself, `x{p}` narrows the whole (`xs{.count < 5}`).
  Otherwise it applies to the entries; that is written explicitly `xs[{p}]`, and `this{p}` forces the whole.
  `(0 -> +1){< 10}` filters the entries. `loc[{name: "x"}]` selects the child whose `name` is x.
- A type that requires a method is a narrowing: `Addable := Node{+ (: Number)}`, `{(): boolean}`.
- `A | B` is either, `A & B` both, `var: class` holds a class. `x ==.instance_of (A | B)` holds for any of them.
- Use counts are references: `x.references` are the places that refer to x. Linear, affine and borrowed values are
  narrowings over them (`T{references.count == 1}`, `{references.count <= 1}`), checked dynamically.
- Quantifiers are words and are booleans, written in an `if` or used as a narrowing:
  `forall x is d: p`, `exists x is d: p`, `exists x: T p`, `!exists x: T p`.
  `Terminating := Program{forall path is .paths: path.length < ∞}`.
- `sort` answers `static{sorted}`, where `sorted(dim)` is `every .previous[dim] <= .[dim] <= .next[dim]`. A field typed
  `T{sorted_by(f)}` stays sorted on insert.
- `internal x` is visible only inside the context that declares it: a class, a function or a block
  (`Node{==.instance_of Example} secret := 5`).

### 7.3 Structural type checking

- `instance_of` is structural: it checks the names a type requires *and* the structure of its Rays (the grammar's
  matcher; `===` for infinite structures). A value missing a required method is not an instance; `T - method` is the type
  that accepts it.
- Structure over hierarchy: a Number is an Array because it is iterable (an unbounded one).
- On a variable of unknown type, everything called on it becomes a requirement of its inferred type. A relaxed parameter
  type is inferred from what a function actually uses (all of the value if it is returned) and offered as a suggestion;
  the declared type stays.
- Relations between types are methods: `A.disjoint(B)`, `A.subtype_of(B)`.
- A class with undefined methods is abstract (inferred, no keyword); constructing it is an error unless the missing
  methods are given.
- A parameterless function is equivalent to the type it returns, and a variable to a parameterless function returning
  it.
- An implementation written for `Number` also serves a narrowing such as `i64`; a narrowing may override it for speed
  (through Compiler levels).
- `transaction { … }`: all of it happens or none of it. Types and asserts are checked only at its end; if anything in it
  errs, every variable it assigned is restored.

### 7.4 Generics, counts and scripts

- Generics are partial arguments that remember what they were given: `Ray<T = Ray>`, `f<a: 'A'>`, then called with
  `(b: …)`. Methods take them too (`map <T>{…}(…)`), inferred when omitted. A generic defaults to the receiver's class:
  `static` in a return type (`reverse: static`).
- On a type, a subscript behind is a length and a superscript is exponentiation (the n-fold product). A count is
  `#.count`, written as a counted type:

  ```ray
  x: Binary₃₂ = Binary₈[]₄
  Binary{== 1..4}²         // 2 | 4 | 8 | 16
  x: 3 Graph               // Graph{#.count == 3}
  ```

- Destructuring, with defaults allowed: `Type = Var`, and the block form
  `{ field: T, field2 { nested }, [first, ...middle, last] = field5 }: ParentType = Object`. Into statics:
  `static { Rational, Irrational } = Real`, as `{ false, true } = boolean`.

### 7.5 Conversions and the equivalence graph

- A conversion is written `as (=== String) => …`. `x as String` is the canonical call (`.as(String)` also works, for
  chaining). There is one `as (type)` method, dispatched by the type.
- All conversions are implicit but only convert when forced. Variables keep their type; only the equivalence collapses
  them: `20 °C == 68 °F` holds through it.
- Method lookup falls back to the equivalence graph of `as` conversions from the receiver, breadth-first: the nearest
  conversion that defines the method is used, and two at the same distance are both used, superposed.
- `as T` succeeds through any conversion to a type isomorphic to T. When `A as B` and `B as A` both exist and round-trip,
  that is an isomorphism, and the graph uses it automatically (`Binary{length == 1}` and boolean; String and Binary).
- `equivalence a -> (b | c)` is one equivalence to a superposition. From a type it applies to its instances; to relate
  the type itself, write `static`.
- Every class gets `as String` automatically: a class declared by a pattern (UUID, IP) prints by running its reader
  backwards, others print their fields. A value prints in the language of the file it is written in (`$.ext`).
- A value renders through the first rendering found along its equivalence graph (`@fadi as Author`, §22).

---

## 8. Equality and equivalence

- Only `Ray` defines `==`: it walks both values from `.entry` and compares what each position holds. It is structural by
  default (`Point(x: 0, y: 0) == Point(x: 0, y: 0)`), and written literals compare the same way. String and the rest
  inherit it.
- `A == B` traverses an equivalence graph until one side rewrites into the other. The default graph uses `as`:
  `Node{== 1} as (=== String) => "A"` gives `1 == "A"`.
- `===` includes location: `2 === 2` is false, `x === x` true, and `@me == @me @ @remote` holds while `===` doesn't.
- `==` takes options, and every option exists on `!=`, `===`, `!==` and `not`, which are generated from `==`'s methods:
  - `==<in: …>` a given equivalence graph, `==<in: None>` none, `==<Number>` up to a type;
  - `==.instance_of`, `==.isomorphic` (structure, ignoring values);
  - functions: intensional by default (control flow at the target's level: `(2 + 2)** == (2 + 2)**`),
    `==.extensional` (resolves fast only for small types, otherwise a quest), `==.historical` (the calls made so far),
    `==.normal` (after a minimising Compiler level), `==<except: …>` (partial equivalence);
  - `trivially` (decidable without running anything), `up_to` (compared up to a boundary).
- Any operation that compares (`contains`, `unique`, `sort`, …) takes the equivalence graph as `<in: …>` too.
- `~=` matches a subgraph: `"12" ~= "0123"`, `"ABC" ~= ⊢"AB"`, `"ABC" ~= "BC"⊣`. It answers the matches, a superposition
  of selections that stay in their context, and doesn't change the value; `.remove` on a match removes it. A match that is
  itself a superposition is one match; `.expand` unfolds it.
- `unique<in: …>` is a field modifier: no other value of that field in its scope is equal under that equivalence
  (`unique<in: .fold_case> name`). `.unique` dedupes a list, and `.is_unique` is the predicate.
- A class's normalizer runs on assignment, `.canonical` is its result on demand, and `with X.normalizer = …` switches it.
  A held value is re-normalised when its normalizer changes. `Temperature := class { normalizer = .rounded }`.
- Leading zeros are equivalent (`007 == 7`); a fixed-width type keeps them when printing.
- Enum members are compared by identity: where they are written.
- A refactor keeps meaning when the two programs are equal under intensional `==` on `**`.

---

## 9. Classes and enums

### 9.1 Classes

- Classes and namespaces are library, not primitives; so are `if`, `while` and the coroutines. A class binds a context
  and defines variables on it.
- Writing a class:

  ```ray
  Example := class (x: String) => single_line
  Example := class (x: String) {
    y: String
    z?: Number
  }
  Example("X", y: "Y")
  Square := class: Shape {
    side: Number
    area => side * side
  }
  Article := class: Reference { … }
  ```

  Classes are never written `class Article …`. `X = Y { … }` extends the class Y with those values.
- The whole body is the default constructor, and it runs like any function. Every field is a constructor parameter,
  passed by name; named arguments are code inlined into the constructor. A constructor takes one structured argument,
  never a bare array.
- Separate constructors override the static constructor. Without `super` in it, the default constructor runs first:

  ```ray
  Example := class {
    static () => this
    static (a: String) => {
      super(property: a)
    }
  }
  ```

- A class's body is read for the whole type: `Class.f` runs superposed for all possible values, so type-level
  definitions and nested classes need no `static`. Statements in the body that are not definitions run per instance.
  Whatever doesn't depend on the instance is taken out of the constructor (by the same rewriting as compiler
  optimizations), so `static Var := 5` and `InnerClass := class {}` are not in it while `Var += 1` is.
  `static x := v` is a value of the type, computed when first asked for and kept.
- Fields are per instance by default.
- What a value declares itself wins: `Color.red` is the static on the class value; an instance's field is reached on an
  instance.
- A class is already a namespace (there is no separate `single`).
- Changing a class later is live: dependents recompute, and a change that breaks existing instances becomes a migration
  quest.

### 9.2 Entry points

- `~` names an entry point and is used for nothing else. Labels in a class body (`profile\`, `"Profile Name"\`, even
  `{variable_label: Number}\`) are alternative entries: alternative constructors, or alternative renderings.

  ```ray
  Ball := class {
    radius: Number
    profile\
      center radius
    "Profile Name"\
      center radius
  }
  Ball~default()             // the ordinary one; only ~default reads text
  Ball~profile(radius: 5)
  Ball~"Profile Name"()
  Ball~2()                   // the second
  Ball = Ball~profile        // change the default
  with Ball = Ball~profile { … }   // only in a context
  Node~+                     // a method as a place (e.g. to place an operator after it)
  ```

- A class body runs like any function: labels are never skipped. Entering a plain class at a label constructs the whole
  body, then runs from the label. A `Component` class adds that the labels inside it are not executed, only entered.
- `@who~label{ … }` runs the block after that label, on that character.

### 9.3 Enums and cases

- `ExampleEnum := enum A | B | C(: String)` is the same as
  `ExampleEnum: A | B | C = class { A := class {}; B := class {}; C := class (: String) {} }`. Members may carry fields:
  `enum circle (radius: Number) | point`.
- An enum member has no `name` field. It is named by where it is written, and two members are equal only when they are
  the same one.
- There is no `match`. An `if` on a value takes case lines, with the same structure as a normal `if`. A case with no
  operator is compared with `==`; `is Type` asks the type:

  ```ray
  if x {
    A => 1
    is B => x * 2
    C("A") => 3
    is C(var) => var * 5
    < 10 => 7
  } else {
    8
  }
  ```

---

## 10. Functions and programs

### 10.1 Functions

- `=>` is required before a function's body.

  ```ray
  double (x) => x * 2
  double(4)                 // 8
  double 4                  // 8
  area (width: Number, height: Number) => (
    size := width * height
    size
  )
  (x) => x * 2              // an anonymous function is a value
  [1, 2, 3].map(* 2)        // an operator section
  ```

- The return type follows the parameters: `(x): R => …`. `f: Terminating (x) => …` types the method itself.
- Aliases and overloads are superpositions of names:

  ```ray
  double | twice (x) => x * 2
  a | a1 (: boolean) => "X"
  a | a2 (: Number) => "Y"
  a(boolean)                // "X"
  ```

  Several implementations of one method are `|` alternatives, and a Compiler level picks between them by tradeoff
  (boolean's `!` by NAND, NOR, …).
- `=>` overrides an inherited method; `&=>` superposes with it:

  ```ray
  Dog := class: Animal { sound => "Woof" }
  Loud := class: Dog { sound &=> "WOOF" }
  Loud().sound              // "Woof" & "WOOF"
  ```

- Partial arguments: `add(1)` waits for the rest, `add(b: 2)(1)`, `f<a: 10>`. A caller may set any variable of the
  function (unless access prevents it).
- The call is the `()` method. Looking up a member by the text `"()"` (`x["()"]`) is a field lookup, never the call.
  `this` is a member of the context, not a first parameter; there is no uniform call syntax.
- Composition: `f ∘ g` (alias `compose`) is `(args) => f(g(args))`, declared right-to-left. `f => g`, where `f` is
  already a function, appends a step: `A => +1 => +3` is `(+3) ∘ (+1) ∘ A`. `Function` is an alias of Program
  (structurally, `Node{(args) => *}`).
- `return x` sets the result and jumps to the function's end label; it is lexical. `recur(args)` is a tail call, a bare
  `recur` repeats the same arguments, and `recur` used as a value (not as the last call) is the function's result,
  recursively: an unbounded program, evaluated as far as it is read.
- `never`: a function typed `=> never` never returns. `never <something>` asserts that something never happens.
  `never return` says the end is never reached; a branch that takes it makes the function's value `never` too.

  ```ray
  stop () => {
    cleanup()
    never return
  }
  never x < 0
  ```

### 10.2 Analysis, inverses and effects

- A function's inverse is `f⁻¹`, also written `f^-1` or `f!` (postfix `!` on a function; on a Number it is factorial).
  `double⁻¹ (y) => y / 2` declares one, and `! + -` declares `-` as the reverse of `+`. An inverse is derived when every
  step of `f` is reversible; with some irreversible steps a function is partially reversible.
- Function analysis: `.variables`, `.usages`, domain, image, codomain, injective, surjective, bijective, and homo-, iso-,
  endo-, auto- and monomorphism.
- Effects are inferred, never declared: a method that reaches an IO external is IO, one that only declares or assigns is
  an initializer. `.effects` are the external names a program reaches; `Pure`, `Deterministic` and `Effecting` test them
  (`io`, `os`, `random`, `time`; `@ether/network` adds `network`). A parameter can restrict them with a narrowing
  (`g: Program{effects ⊆ @local}`), and passing `confidential` data needs the callee's effects to stay within its
  visibility. `pure` / `deterministic` written on a method are checked assertions.
- `Total`, `Decidable`, `Terminating` and `Halting` are aliases. Termination is temporal: each step that can't be
  expanded takes finite time.

### 10.3 Programs

- Every variable is a lazy program. A `Program` is a Ray whose vertices are statements (each itself a Program) and whose
  edges are sequence and conditional jumps (`goto L if c`). A label is `name\`. Blocks `{ … }` are programs, and code
  arguments are lazy programs, read where and when they are used.
- A program is cursors in a graph, and branches are places. A `goto` into another branch is a cursor going there; by
  default it behaves like a call: it enters that place and runs there with the expected variables defined. Running is the
  one rule `. = .next`, applied at each cursor; replacing the stepping rule is a Compiler level.
- `x**` is the part of the program that produced x (its provenance), *selected* at the running step:

  ```ray
  x := compute()
  x**                  // the Program of compute, selected at the running step
  x**.&                // its context there: the locals so far
  x**.&.acc            // an intermediate value
  x**.is_terminal      // finished?
  x**.expand           // the steps, as a Ray
  x**.next             // step it once (in a speculative copy)
  ```

  Waiting, intermediate and final are read off where the selection is. When the running step is a call, the selection
  is a chain, one per expanded level (`x**##`). `x%` is x's own sequence, and `x**.slice("x")` the part of `x**` that x
  depends on. Every function is a generator through `**`; `yield x` marks a value as a result so far.
- A program's context *is* its state, with history: `&` is the current state, `.local` its last component, and
  iterations and branches are its history.
- Labels: `label1\ A (label2\ + B)` makes `label2` a program pointer. A label answers true while its program instance
  runs (`A\ branch …`, then `while A { … }`).
- `p, q` is a structure of Programs; `Program[] as Program` runs them in order with separate contexts.
- `program as Expression` writes a program with its running state, so pausing or saving a game is writing it out.
  A program written back to text includes its contexts and prints references as locations with a version (`@x %3`), or
  the latest with `dynamically`.
- A run records its nondeterministic inputs (random, time, IO answers) in its history, so a branch replays exactly.
- A span is a Ray (a subgraph of the text); `line:column` is derived from it and leads back to it. Diagnostics locate
  themselves this way.
- Every Program is also a Language (§15.2), and every Program is a quest (§19.6).

### 10.4 Control flow

- `if`, `elsif`, `else`, `unless`, `while`, `do … while` and `loop` are classes over Program, with `{ }` blocks:

  ```ray
  if count > 3 { "many" } elsif count > 0 { "some" } else { "none" }
  unless enabled { "off" }
  while n < 3 { n = n + 1 }
  do { n = n - 1 } while n > 0
  loop { tick() }            // while true
  ```

- `if … { } else { }` answers what its taken block answers, not a branch object. `unless … { } else { }` chains like `if`.
- `while` runs its body with partial arguments filled (`body<break: …, continue: …>()`). Labels are reachable only where
  they are in scope: a closure written in the loop body can `break`; a method merely called from the body cannot.
- Iterating: `[1, 2, 3] for x => print(x)`, `(0 -> +1){< 10} for i => …`, `(->){.index < 10} for => …` (a callback with
  no parameters iterates without the variable, with `.index`), `10.times => …`. An element matched with `[]` always has
  `is_first`, `is_last` and `.index`.
- Triggers are one form, `{action} when {condition}`, which is `dynamically if`. `x changes` and `x becomes v` are
  expressions on the value, and `{action} after {delay}` is a `when` on the time.

### 10.5 `dynamically`

- `dynamically x` recomputes x whenever something it depends on changes. This is the default because a change that
  breaks the type must not be allowed; Compiler levels make it cheap.
- It is language-side and push-based. Every write (`=`, `:=`, `x.m =`, `x[k] =`, `@x =`, `@ ->`) announces what it
  wrote, and a dynamic value runs again when something it depends on is announced. What it depends on is read from code:
  what its code mentions, and what the code of the methods, rules and closures it calls mentions. It overrides `=` only
  for those.
- A dynamic value can't trigger its own recompute; a self-trigger is a cycle diagnostic. `dynamically x &= e` keeps one
  contribution: when e recomputes, the previous one is removed. `dynamically` on a statement makes its right-hand side
  dynamic too.
- `dynamically assert` checks every condition and reports all failures together; asserts are part of the type.
- A loop detected while evaluating a value stops the local spend and becomes a quest.

### 10.6 Hot reload

- Any running program reloads the same way, with no mechanism of its own: its code is what is held at a location
  (`@./index.ray as Program`), read `dynamically`.
- Development is a Compiler level: `Compiler.development := default + { {code: Location as Program} => dynamically code }`;
  `ray --dev` runs `with O = Compiler.development { … }`. A static build reads its code once.
- A developer enables it with one line: `(dynamically if @me/development?) orbitmines.com() if &entrypoint`.
  `@me/<name>` names your instances; `@me/development?` holds when the running instance is the one named so.
- When the location changes (`@ether/filesystem` turns the OS's file events into writes), the code is read again as a
  new version, and definitions are matched to the old ones by name and location. A running call continues at the same
  statement when that survived, otherwise its enclosing call starts again (configurable). Instances migrate by field name
  by default (same name keeps its value, a new field takes its default, a removed one is dropped); a written migration
  `%4 -> %5 (old) => new` overrides that. State that can't migrate keeps the old version and raises a quest. What was
  derived `dynamically` recomputes, and the renderers write only what changed.

### 10.7 Concurrency

- `branch`, `sync` (run concurrently, return when all are done), `race` (first wins, the rest are cancelled), `rush` (like
  race, but the rest may finish), `defer` (run after the current context exits) and `await` are classes over Program.

  ```ray
  x = 0
  branch { x = 1 }
  branch { x = 2 }
  x                    // 1 | 2
  A\ branch {
    pending count := graph.count
  }
  while A { print(count @ A) }
  ```

- Branches are named with labels. A variable is shared through locations, not a keyword: `x @ A` is x in branch A, and
  `x @ ->` is x in every branch it was given to. Reading a `pending` value waits until it is set.
- An early stop on a running reduce (`graph.count > 1T`) is `x**.&.acc` plus a Compiler rewrite for comparisons.
- A race in which one branch always terminates terminates. There is no out-of-order execution rule.
- A call to a remote location whose result is never read is sent and not awaited; one whose result is read waits on it
  as `pending`. A value a loop produces is readable while the loop runs (`x**.&`); reading past what is filled waits.
- `sleep d` is `await Time.now >= start + d`.
- Implementations in different languages can be superposed and raced.

### 10.8 Errors

- An error is raised with `ERROR@Type \`message\`` or `FATAL@Type \`message\``; what follows `@` is any value or class. With
  only a message, its type is the function that raised it. The diagnostic points at the raising line and carries the call
  trace. A non-fatal error is attached to the value the enclosing function answers; a fatal one *is* that value. At the
  top level the statement's value takes it.
- `$` after a call handles errors (the forms are methods, painted `^error`):

  ```ray
  f() $                 // pass the error up
  f() $ DEFAULT         // on error the call is DEFAULT
  f() $ None
  f() $ return X        // on error return X from this function
  f() $ { print(.) }    // handler block; `.` is the error
  f() $ ERROR[kind] `Failed: {.}`   // wrap and rethrow
  f() $?                // T?: None on error (not fatal)
  f() $? DEFAULT        // = f() $? ?? DEFAULT
  f() $!                // escalate: any error is fatal
  f() $?!               // catch even a fatal one
  f()
    $specific.error return X      // per kind, one per line
    $a.error | $b.error return Y
  errors &:= f() $      // stack errors instead of replacing
  ```

- `$Type` on the line after the call catches that type. On a superposition, `$` handles each branch: with `&` the whole
  errs if any part errs, with `|` only if every part does. `x ~~ $ { … }` runs the handler for its effect and answers x.
- There is no `try`/`catch`; `$ { … }` is the catch block.
- An error carries its context under the visibility rules: variables that may not be seen are traced and not sent where
  they can't be read.
- An error that fails a program becomes a quest down the line. Library code raises the error; it never answers a
  `Program(name: …)` in its place. Tests check `.erred`.
- `$` is told apart by position: after a call it handles errors; `$.ext` / `$name` is a language (§15.2); `Class$` is the
  store of a class's instances (§16.6).

### 10.9 Proofs and assumptions

- `theorem name (params) => proposition` declares a quest proving the proposition for every argument; once proven,
  `if assume name { … }` uses it without a quest:

  ```ray
  theorem commutative (a: Number, b: Number) => a + b == b + a
  exists x: Binary x * x == 25
  ```

- An equational proof searches the equivalence graph from both sides' histories until they meet. A proof's free
  variables are its assumptions. `x.assumptions` lists what is assumed about x; setting it to None clears them, derived
  ones included. A proven proposition narrows the types of what it mentions (`theorem x % 2 == 0` makes x
  `Number{% 2 == 0}`). A failed proof starts a quest, except inside `by_contradiction`. A property of an infinite structure
  is proven coinductively.
- Two contradicting assumptions on one value superpose (`x % 2` is `0 | 1`). `assume` is an expression and may stand
  inside a proposition, scoped to it; a name alone on a line under a `theorem` is assumed. `?` is the "sorry" of a proof.
- Propositions, proofs and theorems are quests now; Lean comes through the Ether Library.

---

## 11. Collections

- `.map` is defined on Node, so a superposed variable maps all its values. Each entry carries the equipped Ray: `.index`
  is its position, counted from the origin. `entry: - Ray` leaves the Ray out, and `.index` is then the entry's own (a
  character's code point, a number's value):

  ```ray
  ["A", "B", "C"].map(entry => entry.index)          // [0, 1, 2]
  ["A", "B", "C"].map(entry: - Ray => entry.index)   // their code points: 0x41, 0x42, 0x43
  [1, 2, 3].map{.index == 2}(*10)                    // [1, 2, 30]: a map with a filter (a lens)
  ```

- `.index(start)` is the path length from `start` to this, minus one.
- `.every` covers the whole structure reachable from the entry, in both directions; `(ray -> .next).every` goes one way.
  `.some`, `.contains`, `.first`, `.last`, `.count`, `.reverse`, `.unique`.
- `reduce` runs one block in the current context: a single parameter is the accumulator (defaulting to the start), and
  `.` is the current element. `reduce_right` reduces the reversed ray; `return` cancels early; map and reduce combine.
  `[1, 2, 3].reduce(+) // 6`.
- `.flatten` flattens fully; `.flatten(n)` flattens n levels.
- `push_back` adds a last entry; the terminal boundary after it is not pushed over ("last" is relative to the structure
  being traversed). `push_back()` adds one entry holding `?`. `push_front`, `pop_back`, `push_before`, `push_after`.
- `.remove` keeps the structure (neighbours are reconnected); severing and DPO are other methods. `x.move_after(y)` is a
  structure-keeping remove plus `push_after`.
- `split` keeps its delimiters as the edges: `"a,b,c".split(",")` still answers `["a", "b", "c"]`. It drops delimiters
  by default (`keep_delimiter = false`) and keeps the equipped structure.
- `a.zip(b)` stops at the shorter; `zip_longest` runs to the longer with None; `[a, b, c].zip` zips the lists in a list.
- `min`, `max` and `sort` default to the entries' `<`; `.sort(dimension)` and `.max(.y)` pick another. Ties at the
  extreme are their superposition; `#.first` / `#.last` picks among them by position, and inside `#{…}`, `min()` and
  `leftmost` aggregate over the superposition.
- `* n` repeats a structure: `"ab" * 3`, `[1, 2] * 3`.
- `group_by(f)` answers a map `{(f(x)): [x…]}`.
- `.expand` unfolds one level by default, recursively on request. `.length` is the longest path; `.count` is how many.
  `.empty` is `.count == 0`. A range written as an element is one element: `[1, 2, (3..5)]` counts 3.
- `a.path_to(b)` gives all paths (a superposition) and `.min` the shortest; no path raises `ERROR@Path`; an unbounded
  search becomes a quest. A path may cross versions of the graph.
- `.complement` is the whole context graph except the selection.
- `.properties.for` iterates an object's properties.
- The default traverser is a context override (`with Traverser.default = …`), or per call
  (`for<traverse: BreadthFirst>`). `n * T` is n steps of T, `,` sequences traversers, and a traverser may be a
  superposition (a weighted mix) or a function of the entry.
- Graph rewriting (DPO, SPO), products (cartesian, tensor) and unions (plain, disjoint) are built on the rule machinery.

---

## 12. Numbers, units and time

### 12.1 Numbers

- A number is a Ray: an array of selected digits in some base. Numbers stay Rays; native speed comes only from
  optimization levels (`.o.ray`), never from the reader knowing numbers.
- Bases and names: `Decimal` (the naturals), `Decimal.Signed`, `Decimal.Real`, `Decimal.Real.Signed`; likewise
  `Binary`, `Ternary`, `Hexadecimal`. `Number.Nat`. A number is written in its own base:
  `base2: Binary = 10 // 2`. Without a base it is read by the context's type, and as Decimal without one. `0x1F`, `0b101`.
- Sub- and superscripts. A subscript is the `v` operator: in front of a number it is the base (`₂1111`, read
  right-to-left), behind it a length (`Binary₈`, `₂101₈`). A superscript is always exponentiation. `^` as power is
  right-to-left: `2^3^2 == 2^9`.
- Reals are lazy: a fraction is a possibly unbounded ray of digits computed on demand, so repeating fractions and
  irrationals are real (`1/3 // 0.333…`, `√2` is a generator). A Real has no default step; `for` over reals needs one:
  `(0.0 -> +0.1)`.
- No overflow. `u8 + u8` is a wider number, and assigning it back to a `u8` fails the type unless `.mod` or `.saturate`
  is written; wrapping belongs to a target language's level.

  ```ray
  x: u8 = 200
  x + 100              // 300
  x = x + 100          // error: 300 is not a u8
  x = (x + 100).mod    // 44
  ```

- `u{n}` and `i{n}` are rules: `u8 = Binary₈`, `i8 = Binary₈.Signed`.
- The target is a Language, a Compiler level carrying values:

  ```ray
  Language.x86_64 := Language(word_size: 64) + Compiler.level { … }
  USize := Binary{length == &language.word_size}
  program: Program{O: Compiler.default + Language.x86_64}
  ```

  Without one, `word_size` is `?`, so `USize` is `u8 | u16 | u32 | u64`, and code is checked against every one. A
  refined number (64 bits, say) runs through a Language level that rewrites Number operations to native ones when the
  type proves the width.
- Postfix `!` on a Number is factorial (`5! // 120`, `3 !` with a space too).
- `0.not` holds and any other number's `.not` doesn't; bitwise NOT waits on a known width. Bitwise operations work on bit
  strings and numbers alike (`"0110" ~|| "1010"`, `0110 ~|| 1010`), through the String/Binary isomorphism.
- Complex numbers are components: `Complex := Real + Imaginary`, with `i` a unit (`2 + 3i`).
- `∑ ∏`, `√ ∛ ∜`, `∫` and `lim`: `∑ [1, 2, 3] // 6`.
- Native `<` and `>` on numbers are rewrites, in `Compiler.ray` or, when platform-specific, in the interpreter's
  `.o.ray`. Never a new external.
- Integer parts are bounded by default; `Binary.Unbounded` is an unbounded one.
- Counts `1k`, `1M`, `1B`.

### 12.2 Units

- Unit literals: `1m`, `1.5m`, `1 m`, `1.5 m` (not `1.m`, and no `of`). Units are reachable as members: `25.years`,
  `(30).days`. Library code builds computed ones with `Quantity(amount:, unit:)`. When a word after a number is a Unit,
  the quantity reading wins over a counted type.
- Juxtaposed quantities add, from largest to smallest (`1d 10h 10m 30s`); another order is an error, and every part must
  convert to the first part's dimension (so `1d 5m` reads 5 as minutes). This is Quantity's own rule, nothing general in
  the grammar. `10000000s as days hours minutes seconds`.
- Rates: `GB/s`, `1 / m`, `2/10m` (no `per`).
- An ambiguous unit superposes and is resolved by use: `8m` is `8 meter | 8 minute`, and `d: Quantity.Temporal = 8m` is 8
  minutes. Printing uses an unambiguous name.
- All SI prefixes (q…Q), the binary prefixes (`1 KB // 1000 B`, `1 KiB // 1024 B`).
- Conversions (offset, multiple, magnitude) are reversed automatically when reversible.
- `n B as Binary` is `Binary₈ₙ` (`b` is one bit); a fractional byte count must be whole bits.
- Quantities don't compare with plain numbers: `1m > ∞` is a type error.
- An area of ranges is `*` on ranges: `choose Room{4..5m * 5..7m}`.
- `Unit.ray` stays in the core library; Geometry depends on it.

### 12.3 Time

- `Time.now` is read when first forced and then fixed for that variable. Its reads are nondeterministic (never cached
  or folded); `dynamically now` stays current. `now` is a distribution around the reading (an uncertainty); a clock
  correction narrows it, and times read since then jump with it.
- `12:00` has an unknown date: a time of day on every day. Printing omits the unknown parts.
- ISO 8601, including week dates (`2026-W41-2`), and time zone names as RFC 9557's `[Zone/Name]` suffix, checked against
  the standards.
- Calendars: Gregorian, Julian and UTC first; others later. The 1582 equivalence: Julian Thursday 4 October was followed
  by Gregorian Friday 15 October, so Julian 5 October is Gregorian 15 October. Segments start at one (January is month
  1). A calendar segment is an orbit whose wrap edge carries an effect (past December, `Time.YEAR` moves on).
  `Calendar#` is every calendar; a Time with no calendar is just a temporal Quantity. `t.round(seconds)`.
- `Time.YEAR` and `Time.MONTH` are plain context values: `with Time.YEAR = 2024 { February.days // 29 }`.
- Epochs: `Time("2025-01-01", epoch: "2000-01-01") == 25 years`, and calendar conversions keep the epoch structure.
- `UTC.offset` is a temporal quantity within `-12:00..14:00` (default `00:00`); `UTC + 2h` sums the offset within those
  bounds. `UTC` has `leap_seconds: boolean = false`, and `GMT := UTC{leap_seconds == false}`. A minute may be 61 seconds.
  The zone database and leap seconds are `@ether/timezone`'s.
- Astronomy is later work. `Planet`, `Earth` and `Mars` are in `@ether/geometry/Planet.ray`; a sol is 88775.244 s and a
  Mars year 668.5991 sols.

### 12.4 Roman numerals

- Standard (1..3999) and the Unicode Number Forms. Additive numerals (`IIII`) are a normalizer, not a class: reading
  accepts both, writing uses the Standard form unless `with Roman.normalizer = Additive`. `"XIV" as Number // 14`,
  `14 as Roman // "XIV"`.

### 12.5 boolean

- boolean is defined in Ray from NAND (written with gotos at the bootstrap), everything else derived. It has an orbit:
  `true.next == false`, `false.next == true`.
- Operator classes are structural: a binary operator is a method with one parameter (`Node{(other) => *}`). Nothing is
  declared.
- A boolean is a filter: a narrowing's body is a boolean. `Binary{length == 1}` and boolean are isomorphic.

---

## 13. Text, encodings and identifiers

### 13.1 Characters and Unicode

- Text characters are `Char`; players and NPCs are `Character`.
- A Char *is* its Unicode scalar. `CodePoint := Hexadecimal{length == 1..6}`; `Scalar := class: CodePoint` with
  `dynamically assert this < 0x110000 && !(0xD800 <= this <= 0xDFFF)`. `UTF8`, `UTF16`, `UTF32` sit under the
  transformation format `TF`. `U+{codepoint: Unicode.CodePoint} => codepoint as Unicode.Scalar`, so `U+1F525` is 🔥.
- Unicode is versioned from the start (`text: Unicode %15 = "…"`); the UI hides glyphs newer than the selected version.
  A pinned version is fetched once and never refetched; `latest` refetches on an explicit update.
- Everything tied to Unicode comes from the selected version's data automatically: digit values of every script
  (`decimal_digit_value`, `numeric_value`), super- and subscripts (the scalars whose decomposition is tagged `<super>` /
  `<sub>`), case folding (`ß` → `SS`), scripts as Char narrowings (`Char.Latin`, `Char.Arabic`), widths.
- The tables are read with class patterns, as UUID and IP are: a line format is a class, e.g.
  `Block < (first: CodePoint, "..", last: CodePoint, "; ", name: String)`, read as `@"https://…/Blocks.txt" as Block[]`.
  Rows named `<…, First>` and `<…, Last>` form one range entry. EastAsianWidth is the first table read (the TUI needs it).
- Names compare and reserve by the UTS #39 skeleton of their case fold; a name that mixes scripts and is confusable is
  refused.
- Requests to outside sources are kept locally under `@ether`, with the `@https://…` tree set up inside it; they are synced
  to the central Ether server only when configured.
- Case operations: `lowercase`, `uppercase`, `title_case`, `snake_case`, `camel_case` (for all scripts, with the tables).
  `plural`/`singular` keep the English suffix rule for now; a per-language table later.
- Endianness is a direction on the bytes: little-endian reads them right-to-left, and a single byte is the same either
  way (`Unicode.LittleEndian` is a narrowing whose bytes are `<-` the big-endian ones).

### 13.2 Encodings

- No hashes, ciphers or compressors in the core: they come through the Ether Library setup, which reads other
  implementations as languages. The core keeps only what it needs to work: UTF-8 and the Unicode tables (a String is
  characters), ISO 8601 (a Time is written as one), base-N digits (a Number is written in them), and Ray's own storage
  formats (`.%`, `.columns`, `.kv`).
- The algorithms the security and version-control projects need are their own `$/…` projects (`$/sha256`, `$/ed25519`,
  `$/x25519`, `$/hmac`, `$/hkdf`, …), with pieces shared between languages as separate projects.
- Encrypted values: an `Encrypted<T>` is readable only at a location holding the key, and is never decrypted where it is
  stored, only when read off to such a location; without the key, `opened` raises `ERROR@Key`. Homomorphic values are not
  decoded. Each instance and each character has a public key.
- Storage encodings (dictionary, RLE, delta, bit-packing, FSST, ALP, …) are chosen by the store from statistics, as
  optimizations. Deferred.
- Regular expressions are a language (`/a+/i`; the flags make it the longest match, so it doesn't clash with `/`), and
  come through the Library setup too.

### 13.3 UUID

- A UUID is a structure, `Hexadecimal₃₂` written 8-4-4-4-12, so `id: UUID = 6ba7b810-9dad-11d1-80b4-00c04fd430c8` reads
  it. It exposes `.version`. `UUID.v4()` is random with the version digit.
- v1: a 60-bit timestamp since 1582-10-15 in 100 ns steps; the node is the instance's MAC address, or a random one with
  the multicast bit set. `uuid.time as Time` is the inverse of generation; a stamp past 60 bits (the year 5236) is an
  error. An OS level may supply v1 generation.
- Uniqueness is a constraint on the type, guaranteed by the runtime however it likes: `choose UUID.v1{unique}`.
- UUIDs of commits and characters are v1, with the commit's `now` as the time and a node derived from the committing
  character's key. v3 and v5 are unimplemented for now.
- A secondary implementation (one not used for reading text) may be an entry point `~name` (only `~default` reads text),
  a `|` alternative, or an optimization.

### 13.4 IP

- An address is a location on a line: `IP < Location &+ (-1 <- . -> +1)`, so `ip + 1` is the next address and
  `ip1..ip2` is a range with no IP-specific code.
- IPv6 follows the draft's structure (`left`, `::`, `right`, an embedded v4, stored as read; `segments` is derived) and
  prints by RFC 5952.
- `ip / n` is the superposition of every address in the block (its low bits `0 | 1`), printed as CIDR because of that;
  there is no prefix field. `"10.0.0.0/8"` reads as `ip / prefix_length`. Well-known prefixes are IP values tested with
  `is`.

---

## 14. Locations

### 14.1 Writing a location

- Location syntax is always the core's, usable anywhere in code: `@./x`, `@../x`, `@/abs/path`, `@C:/…` (a one-letter
  scheme is a drive, never a URL), `@https://…` (no spaces), `@"a location with spaces"`, `@name/…`.
  `@"orbitmines.com"` is reserved for that domain, on port 37839. `@{instance}` is an instance's canonical location, and
  `(@ | #){: UUID}` addresses anything by UUID.
- `Location := Ray`: it sits in a hierarchy (`.parent`, `.children`) and is hosted by an instance.
- `*` hugging a name is part of the name (`file*.ray` is one name). The wildcard is `*` written with spaces: `PATH/ *`,
  `PATH/ * /file.ray`. A path is a function, and locations match with `~=` like any structure (`/ ~= ^/.@`: files
  beginning with `/.@`).
- Text joined into a path that isn't proven free of `..` or `/` is a warning (configurable).

### 14.2 A location is what is held there

- Mentioning `@x` resolves to what is held there, but it stays a location until something uses it otherwise. Used as a
  location (`/`, `name`, `segments`, `children`, `==`) it is one; used as anything else it is read:

  ```ray
  @/etc/hosts as String       // the file's text
  logo := @./logo.png         // an Image, because $.png reads it
  @x = value                  // writes it
  @x = None                   // removes it
  @new = @x                   // copies it
  @x(…)                       // executes it, with any code as arguments
  if @x { … }                 // whether anything is held there
  ```

  There are no `read`, `write`, `listing`, `exists`, `remove`, `content` or `launch` members. A directory's `children` are
  what is under it.
- `.@` is the location method of any value (`x.@` is `x.location`); `(@./x).@` is the location itself. A location value
  held in a variable is mentioned with `location.held`.
- What holds a location is what its space is reserved to. A project holds a space by adding to `FileOptimizations`
  (`@ether/filesystem` reserves `@/ => FileSystem.Host()`, and `@./`, `@../` and drives; `@ether/network` the locations
  with a scheme and `@localhost`). A holder answers `holder[location]`, `holder[location] = value` and
  `holder(location, args)`. A location nothing loaded holds is an error when read (`ERROR@FileSystem`). Code that only
  names locations doesn't depend on what holds them; what runs (an app, a device's entrypoint) loads the holders.
- A node's location is the superposition of every place it is (`Node.location`). `value @ place` adds one and answers the
  value; `(value @ place) = v` writes v there. Where a value was written (what diagnostics point at) is one of its places.
  No class keeps a location field of its own. A mirror is the value at another instance: `instance.mirror(x, depth)`
  places x (and its children, to that depth) there.
- `IO /path` is the instance directory, sandboxed: `..` can't leave the top (symlinks can), and the host's file system is
  reached only through `confidential IO.os /path` when permitted. A path naming a field is looked up as `{field}.ray`, then
  a directory `{field}`, then a file.

### 14.3 No streams, no processes

- The language makes no process calls; running anything is running a Program (§19.6).
- All communication goes through one standard location, `@me/instance`: `@me/instance = x` sends,
  `dynamically event: @me/instance` follows what comes in. What holds an instance decides the protocol (the host's
  terminal, a page's storage in a browser, another instance over the network). A socket or a port is the same: a location
  whose holder is its protocol.
- What used to be a process is a typed read or write of a location: the browser's storage is `@me/device/storage/<key>`
  (kept in `localStorage`), its time zones are `@me/device/os/zones` (answered from `Intl`), and a remote file system over
  HTTP is `$.http` (GET reads, PUT writes, DELETE removes, WebDAV's PROPFIND lists).

### 14.4 Devices

- Devices are locations under `@me/device/<…>`: the clipboard (copy writes it, paste reads it), keyboard, pointer
  (`@me/device/pointer["pen", 0]`), controllers, pads, orientation, motion, geolocation, the preferences (reduced motion,
  dark, contrast), notifications, fullscreen, printing, the page's location (`@me/device/location`), camera, microphone,
  storage and the OS. Reads and writes there are backed by the platform.
- A device's capabilities are its paths, granted like any node (`@me.execute { @me/device/camera }`); when nobody has
  been granted, `&@.ask` answers a quest. Remote control is a grant of `write` on `@me/device/mouse` to another character.
- The environment is `@me/device/os/env/<NAME>`, read live; its value at startup is the pin `…/env/<NAME>%[start]`.
- `@me` is seen from the computer: without a character on the chain it is the machine. In a session run as a player,
  `@me` is the player, and `@me/device` is answered by the computer, flattened into the player. A remote device is
  `@some-remote/device/<…>`.
- `@me/<name>` names your instances (`@me/development`, `@me/phone`).

### 14.5 Operating systems

- `OS := enum Linux | Windows | Macos | Browser | Ether`, in `@ether/ray/OS.ray`, each member with its `platform`. A member
  as a boolean is whether the device runs it, so per-OS code is a branch in the project it is about:
  `if OS.Windows { … } elsif OS.Browser { … } else { … }`. `OS.host` is the member the host reports, else `OS.Ether`;
  `with @me/device/os = OS.Windows { … }` runs code as another OS.
- Every external keeps an `OS.Ether` branch: pure Ray where it can be, else an error until it is written. `@ether/os` is
  the Ether OS project: the language as the operating system, writing in Ray what the host's externals answer elsewhere.
- OS-specific functionality (TLS, sockets) is an OS-specific external in its project, with an Ether OS implementation.
- The core keeps primitives only: `Time.now`, `Random.bit` and `IO`.
- **Planned:** other systems are reached by inspecting their binaries (`$/elf`, `$/pe`, `$/macho`, `$/wasm`; code in
  `$/x86-64`, `$/aarch64`, wasm bytecode). Inspecting is reading (symbols, imports, strings, version), and a binary's
  imports are a project's dependencies. Using a binary lifts its code into a Ray Program whose syscalls and imports are
  effects on Ray locations, checked by access. Native execution is an optimization level, not a process.

---

## 15. Projects, languages and versions

### 15.1 Projects

- A project is a folder with a `.project.ray`. A folder inside it with its own `.project.ray` is a subproject: the
  parent never sees it without an explicit import, and the subproject sees its parent.
- Dependencies are `@…` locations only. `@X` resolves to the project in `@ether/$/X` for now, and later to the repository
  named X. `@name` in code is the dependency a loaded project declares as `@name`, and `@name/path` a location inside it;
  where none declares it, `@name` keeps its other meanings (`@me`, a character, a relative location).
- Dependencies resolve lazily: a dependency is read the first time it is referenced (through `$.name`, `@name`, a name
  the project doesn't define, or a file in its language). Mutual dependencies are tolerated: a project is marked as loading
  before its dependencies load.
- Only `@ether/ray` is implicit; every other project, OS and Ether included, is declared in `.project.ray`.
- Two definitions with the same name in one project are an error. Across projects, the nearest in the project hierarchy
  wins, then directory order. A later dependency may override earlier ones, but only within my package environment.
- A dependency on `@ether/…` expects the `@ether` userspace to be filled by the language, since its files are bundled;
  otherwise it defaults to network access to `@ether`.
- Data a dependency names but doesn't hold (like `@tzif/zoneinfo`) is a location like any other, reached through mirrors
  and shards and kept by a cache (an optimization level). Until that exists, reading such a location errs. Published
  packages carry a cache of every `@https://…` dependency, with the source's visibility, used when the source is gone.
  Mirrors and caches may hold single files of fetched repositories.
- **Layout.** `@ether/` is the Ether project: the standard `@` names (`Ether.ray`), `World.ray`, `Messaging.ray` and the
  instance entrypoints (`entrypoint.server.ray`, `entrypoint.npc.ray`, `entrypoint.player.ray`). `@ether/ray/` is the core
  (`!language`): Node, Ray, Number, String, Unicode, Encoding, Program, Control, Compiler, Language, Project, Location,
  Character, Format, Reporting, Time, Unit, UUID, IP, MAC, Roman, Access, Feature, OS, with its claims in `ray/tests/`.
  Subprojects of `@ether`: `security`, `network`, `filesystem`, `timezone`, `fonts`, `device`, `geometry`, `ui`,
  `version-control`, `os`, `game`, `library`, `avatar`, and the outside languages under `$/`. Folders of projects are
  lowercase. `.ether/` is what Ether keeps locally for a project (fetched externals, caches, `.%` working state), laid out
  as `.ether/external/@/@clang/$/@windows/@x86-64/%/0.16.0`.

### 15.2 Languages

- Every Program is a Language, defining abstractions when `!language` is selected. Which language a program reads with is
  `global`: `global = …` sets it, and it is version-controlled (`global = @remote%[version]` takes someone else's setup or
  another version as the defaults).
- A language `$.x` is a mapping from text in that format to Ray values and back: a Program level whose rules read `.x`.
  A language states its own assumptions ("a newline is a new statement") as rules in its level. Each file extension is
  its own language (`$.uc`, `$.uci`). When a mapping counts as a language is a research question for the Library Project.
- `$.name` answers the language called `name`, loading it once when it isn't loaded: `$.ray` is Ray itself; any other name
  is the project `@ether/$/<name>` (the language's name in lower case), answering the language in it whose extensions
  include `.name`.
- A language is declared one way: its class is `class: Language`, with its header when the format has one
  (`JSON := class: Language (Blank, root: Value, Blank)`), so `$.json === JSON`. Reading is `Name.read`, writing
  `Name.write` or `x as Name`. A language that writes several files answers a tree of Locations with content.
  `Language.Lossless` is the narrowing of languages that read back what they write; `.ray` is one.
- A format reads straight into Ray values with one grammar, its headers, which also write it. There is no record
  vocabulary between a format and Ray: a `@js` fragment is a Ray program, and writing JS is one Compiler level over
  Ray's program shapes. Kinds of a value (an HTTP status class, a DNS record type) are narrowings.
- A `$/<name>` project holds only the outside language: its syntax, levels, API values and tests. What is specific to Ray
  stays in Ray's library (the renderers are in `@ether/ui`). Nothing in the core depends on an outside language; the core
  reaches them only through `$.name`, lazily.
- A language keeps its identity across renames: old names are equivalences (`$.coq` ≡ `$.rocq`), as are its several
  extensions; dialects are its children. Content read by every loaded language answers the superposition of the readings
  that accept it, each with its version.
- `FILE.ext.ray` is one mechanism: the file is read with `$.ext` over Ray (`script.js.ray` is JS over Ray primitives).
- Sublanguages permit only certain code. A sublanguage is a Program level without the IO externals and unbounded loops.
  Configuration is `.cfg.ray`, the sublanguage whose code provably halts and has no side effects
  (`Program{Pure & Terminating}`), instead of `.yml`/`.json`. A `!language` project configures which files are read in
  which sublanguage.
- The package-manager languages (npm, Cargo, pip, apt, SemVer, TOML) are removed for now and will be re-added later.
  Main keeps Git only (with SHA-1, zlib, DEFLATE and SHA-256); Mercurial, Fossil, Pijul, Subversion, their own formats,
  the SQL stores, the permission backends, Sixel and Kitty, and the shell language are on the branch `version-control`.

### 15.3 Versions

- A version is a single number, `%N`; `%0` may break freely. Revisions of a version are `'0`…`'N`: `%3'2` is the second
  revision of version 3, and `%3` alone is its latest revision.
- `%` followed by a number is modulo; version ranges are written `%[1..5]`, the narrowing `Version{1 <= number <= 5}`.
  On a declaration it limits the field to those versions; at a use it selects them.
- A migration is a function, declared beside what it migrates: `%4 -> %5 (old) => Example(title: old.name)`. Migrations
  chain (`%1` reaches `%5`), and an inverse is the backward migration: `%5 -> %4 = (%4 -> %5)⁻¹`.
- A package records the `@ray %N` it was written against and carries that version's `@ether/*.ray` when the host
  interpreter lacks it. `< @ray %N` at the top of a file declares it. The set of externals is the compatibility surface:
  a language version that adds no external runs on an older interpreter.
- When a later library version defines a name the user already defined, the user's code keeps the user's definition
  through its pin on the version it was written against.

### 15.4 Installing

- Ether installs by download, by `curl -fsSL https://ether.orbitmines.com/install.sh | bash`, from a release installer,
  or by `git clone git@github.com:orbitmines/ray.git` then `./install.sh --compile`. The editor plugins are named
  `Ether.ray` in the VS Code and JetBrains marketplaces. `ray` is `ether @ray`.

---

## 16. Version control

### 16.1 History

- Every variable holds a history: `x%`. There is one API, `History`, a Ray of commits, which every tool talks to.
  `Ray.history` is `Node.history`.
- A commit holds a Program: any Ray, run on the value before it (`.`). A plain value is the program that answers it.
  A thing keeps its identity across renames because it is the same node; its history's id is the label of the commit
  that made it. A history's value is its ancestry folded in stamp order.
- Commits are stamped by a hybrid logical clock. Stamps give one global order.
- A commit's `.expand` is the run that produced it: history stays coarse, and expanding gives the fine-grained run.
- `x%` with a selection: `B% == "B", \"2"\` is a ray with `"2"` selected (`\x\` selects, `name\` labels).
  `var% == B%, \C%\`: a repository orders nested histories. A change to a string (adding a character) is history on an
  edge, not a vertex. Keystroke history is a branch off the current branch.
- A value's `@%` records each hop it took (disk → instance → memory → instance → me); each hop's instance chooses the
  visibility of its own entry.
- Every class is a repository; String's lowest level is the character.

### 16.2 Commits and the `.%` format

- The stored form is the program; the working directory holds the resulting value, as in git.
- A commit is one line: `UUID\ with (@me = @who; now = X) <change>`, ordinary Ray. `with` sets the context the change runs
  in: `@me` is who made it and `now` its time. The settings are read as `.cfg` (they must provably halt). The change is
  any Ray applied to `.`, the value before: `+ "B"`, `.x = 1`, `.["b"] = .["a"]; .["a"] = None`, a loop, a class.
- The parent is the line above. A line with another parent starts from it (`UUID\ with (…) . = A; <change>`); a merge
  starts from both (`. = A & B`). A label read as a value is the value there.
- A label names the state after its own statement: checking out X runs through X's statement and stops at the next
  label. Committing appends one line and reads nothing back.
- A label may sit on any subexpression, guarded by `if` (`0..100.for (UUID\ if i == 50) this += 1`); unlabelled
  per-iteration states are not stored (they are the line's `.expand`).
- Assigning to a label patches: `label\ = value` replaces the subexpression tagged `label\` in later runs. This is how the
  STD is patched without rewriting text.
- A line that starts with an operator or `.` continues on the previous line's result (`.` is always that result);
  every other receiver is written by name. So `A + B + C` evaluated as `A + (B + C)` is `B`, `.+ C`, `A + .`.
- A UUID label matches only the UUID pattern, so a word label never reads as one. The writer escapes newlines in strings,
  so a line starting `UUID\` is always a commit.
- There is no index file: names are in the program (`.greet = …`). Any labelled Ray program is a history
  (`program as History`), and `x.history` is the in-memory view of the same file.
- A cache is Ray too: `label\ value`, the value at that label (`<id>.ray.txt`), read by the Ray reader.

### 16.3 Backends and storage levels

- A backend is a Language. Its level reads into a `History`, and writing goes out of one: `$.git`, and on the
  `version-control` branch `$.mercurial`, `$.fossil`, `$.pijul`, `$.subversion`; and Ray itself (`$.ray`, the `.%` form).
  Git is one compile target: cloning is `$.git.read(@https://…)`, pushing is `history as $.git`, and converting is
  reading as one language and writing as another.
- Each backend is lossless (Ray, Pijul) or a snapshot backend (Git, Mercurial, Fossil, Subversion). Writing to a snapshot
  backend writes the commit's tree (each definition a `.ray` file), the parents, `who` and `when`, and keeps the commit's
  `.%` line beside it (git notes under `refs/notes/ray`), so reading our own repository back is exact. A foreign
  repository is read by writing each commit's change against its first parent as Ray (`History.change`); a rename comes
  from the backend's own record, else from line similarity of at least 50%, and a tie raises `ERROR@Rename`.
- Routing uses the store syntax (§16.6): `History{location is @me}$ = $.ray | $.git` stores in both.
- The backend, the storage granularity and the caches are Compiler levels (`Compiler.stored`): a choice of format, never a
  fixed layout. No layout is canonical; per object or per project, splitting (past 1 MiB, one file per object) and caches
  (every 64th commit and at the head) are optimizations. `delta` writes a commit as `. edited(from, to, "text")` when
  that is shorter. Each backend's own packing is its `stored` level.

### 16.4 Distribution, pins and fixes

- `x%[label]` pins a version. The STD's and the players' histories are separate commit Rays; `History.global(histories)`
  joins them by stamp. A history pins the STD with an ordinary assignment, `global = global%[UUID-VERSION-OF-STD]`; the
  orders (STD and player, STD only, player only) are queries over stamps.
- A function is one thing whose versions each add or mention part of its structure. A pin is a narrowing of the function
  that collapses to the one required. An STD bug fix is one more version that the narrowing for the fixed version also
  takes: a line stamped after the fix gets it, a line stamped before replays as recorded. Which version a narrowing
  collapses to is chosen by the compiler; this is the general mechanism of narrowing a superposition of partial
  definitions. An operator is a definition like any other: `+%[label]` pins it.
- Whether to accept a history's claims (its `version =` settings) is a setting of the run: `with History.trusted = false`.
- Concurrent lines whose results are equal under the chosen `==<in: …>` in every order merge without a quest. Concurrent
  commits that leave one field with different values (three-way, against the common ancestor) raise `ERROR@Merge`.
  Assigning a value that has a history keeps both linked; type conflicts between versions are merge conflicts, resolved
  by patches and migrations.
- A history may hold branches with no common commit (several initial boundaries). Forking is `x.copy` with a forked
  history. A tag is a label on a commit; a branch is named by the nearest labelled commit back from its head;
  `history.blank` starts an empty branch. A branch point is a commit with several children, a merge one with several
  parents.
- Operators on histories: `h + other` rebases (other's commits appended, re-stamped), `h | other` merges, `h &+ other`
  interleaves by stamp. `history.squash`, `history.cherry_pick(commits)`, `history.from_here`.
- The stamp order is canonical; a local view may keep its own order (its branch), and they disagree only where results
  differ.
- A transaction is `history.fork`, then merge (or drop). Undoing one commit is `revert`, which applies its inverse to the
  current state (`ERROR@Revert` without one). `change.revert`.
- A local override is your own branch: setting a managed value differently for yourself is a commit on your branch,
  always rebased onto the latest; `@local`, kept only if saved. A REPL session is a branch of `@me`'s history
  (`@me.session`); "make permanent" merges it (`@me.keep(session)`); committing one variable is `x @ @me = x`.
- Staged or draft is visibility: `@local changes` are not yet published. `x.public` says whether a node's access reaches
  `@public`, and `x.publish` makes it public (§17).
- A silent generic type used in a function is remembered, and a diagnostic fires when a variable of that name later
  appears.

### 16.5 History queries

- `history{from p to q}` is the list of stretches of a history, in order. A stretch opens at a commit where `p` holds
  while none is open, and closes at, and includes, the first later commit where `q` holds. `p` and `q` are read against
  each commit (its fields, then its value's). A stretch whose `q` hasn't happened runs to the head and is included.
  `history{from p}` is `history{from p to !p}`.
- A commit's `.next` is the following commit on the same line, None at the head; `.previous` the other way.

### 16.6 Stores

- `Class$` is the store of a class's instances: `Point$`. Every instance is in its `Class$` by default, lazily
  (materialised only when `Class$` is used). `Type` is the whole type; `Type$` is what is stored.
- Where `Class$` stores is itself defined, and may differ by context. `ClassA{filter}$ = DB` routes the instances that
  pass the filter to that store (`Point{x > 0}$ = @me.managed`). Another store is a location: `Point$ @ @remote`.
- A `persistent` value is kept in its class's `$`: `persistent score := 0`.
- `T$ @ x ->` searches a type under a location: `x.worlds` is `World$ @ x ->`. An index is an optimization level over
  `T$` queries; without one a query stays correct but slow.
- A field stored as another type is not written in the language: the compiler chooses storage.

### 16.7 Encryption

- Every history that is not public is stored encrypted for its readers by default: one storage level (`encrypted`, added
  by `@ether/security`). Version control itself knows no keys.
- A line keeps in plaintext what storing, ordering and checking need: its label, parents, stamp, signature and which
  content key it uses (`with (…; key = K₃)`). Its change is ciphertext.
- A history has a symmetric content key, wrapped for each reader's instance key (HPKE, RFC 9180: X25519, HKDF,
  ChaCha20-Poly1305). Readers are whoever its access lets read. Adding a reader is a commit wrapping, for them, the keys
  their grant covers; removing one rotates to a new key for the rest (they keep what they already saw).
- What a new reader decrypts is what their grant's expression covers: `@bob.read history` is every key (like a clone),
  `@bob.read history{from Time.now}` the current and later keys, `@bob.read history{from label}` the keys from that commit
  on. A rotation wraps the new key for every reader whose grant reaches the head.
- The signature covers the hash of the line with its ciphertext, so a server verifies the chain and authorship without
  reading; the plaintext change carries its own hash, so ciphertexts can't be swapped between lines.
- `who` has a visibility like any field, inherited from the history by default (then it is in plaintext). Narrowing it
  seals it: `who` and the signature move inside the ciphertext, the server sees a per-history pseudonymous key, and only
  readers check authorship.
- A wrap carries no recipient key or identifier in plaintext, and a line's wraps are stored in random order. Each wrap
  has a short tag only its reader can recompute, so a reader finds theirs without opening every wrap.
- Merging happens on readers' machines (a server keeps both heads). Caches are encrypted with the same key or kept local.
  Deltas and compression come before encryption, and backends (git) carry ciphertext.
- `history.at(commit)` and `history.fork` are copies of the history, so access, sender, keys and caches come along.
  `history.erased` starts from a blank copy without caches.

---

## 17. Execution, trust and access

### 17.1 Who runs code

- Every run has an actor (who runs it) and an origin (whose code it is), and the origin is the whole chain
  (company ← me ← library). `&@` is the running Program's chain: `&@.who` is who runs it now, `&@.hops.first` who
  started it; `&@.may(method, target)` holds when every hop is allowed, and `&@.ask` answers a quest for the grant
  otherwise. A prompt says "@company wants to run this, originating from @me".
- Running as a character is `@name { … }` (or `@<uuid> { … }`), which is `with (@me = name) { … }`. It works only when
  the character is here (logged in or hosted locally); otherwise it is an error. Running somewhere is
  `with (Location.current = loc) program`, written `f@loc()`. There are no `run_as`/`run_at` methods.
- Code handed over by a character runs as that character, with its delegation intersected with the local grants. Run
  logs are kept (30 days by default, configurable) for replay.
- An access check on a context checks the running Program and its origin chain, never the frame's data.
- Whether code does IO, or is an initializer, follows from what it does and calls. `speculate` (run IO anyway during
  abstract interpretation) and `refuse` (never run the IO) are settings of whoever runs the code, per method or location:
  `with (Program.speculated |= x)`, `with (Program.refused |= x)`. The editor runs files abstractly; tests run them fully.

### 17.2 Permissions

- There is one permission: access to a method. `.read`, `.write` and `.execute` are sugar: write is access to `=`, execute
  to `()`, read to the structure or any other method; `.on(method)` names another.

  ```ray
  @public.read @public.execute API_METHOD
  @public.read NUMBER := 0
  @public.execute NUMBER.+= (== 1)       // only +1 is exposed
  @private { notes := "…" }              // a block applies one permission to everything in it
  @company may network @https://api.company.com
  ```

- A node's `access` superposition is the only store of who may do what. A grant `{who}.read x` places an access on what
  `x` names: on the value or field, or on the expression itself when it derives something. A grant names an expression,
  and paths are expressions: `@ether.read x.count` and `@ether.read x @/count` are the same. Prefer code; use paths only
  where paths make sense.
- A grant is a node, so its own location says where it holds: placed at an instance it holds only there, placed nowhere
  it holds everywhere. A mirror can so have permissions of its own.
- A grant may carry a narrowing: `{once}` (consumed by its first use), `{while app.running}`, or a condition on the other
  party's code, re-read `dynamically`. A permission's `who` is any narrowing (`Character{presence near x}`), and reaching
  items by presence is a grant narrowed by distance.
- Checking a permission runs no one's code: a grant's expression and filter must change nothing outside themselves and
  terminate, or the grant is refused when made.
- `execute` runs a function where it is, on its owner's instance, for the caller; `read` lets the reader copy the function
  and run it on its own instance. Running injected code in someone else's program needs an execute grant on it; without
  one it applies only to your own copy.
- Access to a value's program is `@public.read` on `**`: visibility is recursive.

### 17.3 Visibility

- An item inherits its parent's visibility; at the top it falls back to the default privacy policy, which is private
  (`local` until someone sets their policy).
- The levels are `who` values. The core has only `none` (no one: `none.read` is a secret, `const x` is `none.write` on x
  and children that set nothing of their own) and `confidential` (the default privacy policy). Ether names `@local` (this
  character, this machine), `@localhost` (characters on the same machine), `@private` (this character anywhere, the
  central server included), `@private.managed` (only your own servers) and `@public`. `confidential` is never wider than
  `@private.managed`, whatever the policy.
- Whatever the policy, these stay confidential: the policy itself (write), an instance's `private` flag, reading private
  keys, and overwriting existing keys. `@private & encrypted` is data the central server holds but can't read.
- A visibility is itself a value with a visibility: A can be `@private` while its visibility is `@public`, so others can
  find that A exists but not read it.
- Each entry of a list or superposition has its own visibility; a reader sees only the entries it may read, and their
  count only if the count is visible.
- Data derived from `@local` data stays `@local`; the mark is tracked through composition. A shadow's or a mirror's
  customisations inherit its visibility.
- A character used as a condition is whether it is the current reader: `if @public { … } elsif @me { … }`.
- Streaming runs the renderer as an actor whose grants exclude `@me`'s private fields; what it can't read is drawn as
  absent.
- `internal` is the language-level visibility (§7.2); `@public` and the rest are player-level.

---

## 18. Identity and security

All of this is the project `@ether/security`, imported by nothing by default (`@ether/network` depends on it). Without
it, comparing characters is an error (`ERROR@Security`), `@me = x` sets x as given, and commits carry no signature.

- **Verified versus claimed.** Character equality is the whole of security in the language, so it never rests on data
  anyone can claim. A character is *verified* only when the runtime made it, from a completed handshake or from holding a
  local instance key. Anything built from data (`Character(name: …)`, a name, a told public key, a commit's `who`) is
  *claimed*, and a claimed character is never `==` a verified one. `&caller` and `@me` only ever hold verified
  principals, and access checks see only `&caller`. Names, UUIDs included, are for addressing, never evidence. Grants
  match principals with `a.same(b)` (roots compared) and `a.answers_for(who)`, never `===`.
- **Keys.** Each instance hosting a character has its own key pair, whose private half never leaves it, certified by the
  character's root authority for a time and scopes. The root is a policy, not one key: the character's first commit
  declares an identity with its current root keys, the digest of the next ones, and a threshold per kind of key event
  (`revoke: 1 of keys`, `add: 2 of keys`, `rotate: 2 of keys | next`,
  `recover: 2 of (printed_key | @ether) after 7 days, vetoable by any of keys`). Key events are signed commits in the
  character's history; revoking is cheap, gaining power expensive. Root keys may be on devices, passkeys, or split k-of-n
  across the character's instances.
- **Handshake.** Noise XX: ephemeral X25519 keys per session, each side signing the transcript with its instance key and
  presenting the root-signed certificate. The verifier checks the signature, the chain, the key log at that point, and
  scope and expiry. An introduction sends the key log, and the character is made from that log.
- **History is attribution, not authority.** Every commit is signed by its `who`'s instance key. Replaying lines runs them
  as recorded, checked against the key log at the commit's stamp; it never gives the replayer the author's permissions.
  Becoming another character needs that character's grant.
- **Delegation.** Handed-over code and hosted guests run only with that someone's signed, scoped, expiring delegation,
  bound to its holder (never a bearer token), with the intersection of the delegated and local permissions.
- **Recovery.** A lost device is revoked by the remaining root authority. A lost root is recovered without any guardian
  choosing the new key: the recovering machine makes its own new root keys, writes the rotation event, and sends only its
  hash to each guardian over a recovery handshake; a guardian verifies the person by its own means and signs the hash.
  Once the threshold is met, the event takes effect after the waiting period unless an old key vetoes it. Guardians hold
  no key material; `@ether` is the default guardian.
- **Signing.** One instance key signs all of that instance's commits (Ed25519 is deterministic). Instance certificates are
  short-lived (30 days by default) and renewed automatically. A signature covers the commit's hash, including its parents'
  and the key event it relies on, so backdating is a fork. Per-world instance keys are optional, for unlinkability.
- **Storage.** Private keys are `none.read` fields, never in a history or cache. Stores skip fields by access, not by
  name. Logging out zeroises every key a secret field holds and sets the field to None; the next login makes fresh keys.
- **Algorithms.** Every key names its algorithm, a language (`$/ed25519`, `$/x25519`, `$/noise`, `$/chacha20poly1305`),
  and the root policy says which ones its keys use. Only Ed25519, X25519 and Noise XX are implemented; no others are being
  added now.
- Networking changes no one else's state without a grant: a redirect is a world name, and a stream moves a character's
  presence only with that character's grant.
- A proxy is end-to-end by default; one the character grants `read` (`@x.read proxy @x`) terminates the session.

---

## 19. The world: characters, instances, quests

### 19.1 Characters and worlds

- A World is a Location with rules; any location can be made a world. A world's dynamics are a component (`+ Dynamics`).
  `x.worlds` and `x.characters` iterate everything of that kind within x.
- Each instance runs its Ether files in its selected world, `World.current` (default `World.ether`): a bare `@name` reads
  that world's name and `@name = …` writes it. The core defines only `@me`; `@ether` is a name in `Ether.ray`.
- A name not defined in a world falls back to the world's parent, then `@ether`, unless the world maps it to None. A
  name's issuer is the nearest world up the hierarchy that reserved it. A reserved name is a field of the world,
  `world.@name = holder`, unique ignoring case; allocating one within your access is that assignment
  (`@google.@ada = @someone`). A redirect is a getter: `@localhost => @\`127.0.0.1\``. Overwriting a held name needs write
  access and raises `ERROR@Name` otherwise. Every world has a `spawn_location`.
- The standard names (`Ether.ray`): `@ether` (`ether.orbitmines.com:37839`), `@me | @private`, `@everyone`, `@here` (the
  online ones), `@local` (`@me` at the current instance), `@anonymous` (`?`), `@public` (`@ether.@everyone | Instance`),
  `@npc | @npcs`, `@players`, `@localhost` (`127.0.0.1 | ::1`, which only `confidential` may rewrite), `@localnetwork` (the
  RFC 1918 and RFC 4193 blocks). Reservable names are non-empty, shorter than 2^8, and contain no newline or tab.
- A character's names include its avatars: a platform handle is a location with an `@` segment
  (`@github.com/@alice`; `@github.com/package` is a package), and `@github.@x == @https://github.com/x` is an equivalence.
  A character's name is its own name superposed with its avatars', so any of them finds it. Email, phone and full name are
  patterns over what is written, filtered from the names (`email => name{is Email}`).
- The hosts table maps Locations to Locations, characters included (`@ether -> @me` for an offline mirror); it is the
  world's name table.
- A character's files are stored under its UUID, sharded by leading characters; `@name` and `@uuid` both map there.

### 19.2 Instances

- An instance is a character too; its kind is its entrypoint: `entrypoint.server.ray`, `entrypoint.npc.ray`,
  `entrypoint.player.ray`. A machine may run any number of server instances alongside a player instance, each its own
  character, sharing the host's socket; the host forwards what is addressed to a child. `<- instance` is its chain of
  hosts. A server's names gain the superposition of every `@allow_*` name (`@admin`).
- `character.instances` is every instance running it (a superposition), and `primary` is where its focus is.
  `@me/instance` is that superposition with the primary selected, and the standard location of all communication; each
  terminal or page of the same player is its own instance.
- A spawned instance's `/instance` shadows its spawner's (reads fall through, own writes stay), its `/` is the host's
  `/@<uuid>`, it gets a new key pair, and it has no host-OS access unless granted. What it knows of its host and network
  is given by the spawner.
- First run: with no player, the instance creates one (a default name, a certificate issued by the instance, a random
  spawn location), stores it, and opens onboarding; otherwise it opens the world.
- An instance connects to `@ether` unless set offline (then it advertises nothing). Its address is readable only by itself
  and `@ether`, unless the character is Broadcasting.
- Login, logout, swap, local co-op and deletion with a cancel window are built from the entrypoint drafts. The deletion
  window is measured against stamps; destroying a history keeps its commits' stamps and UUIDs with values set to None, so
  references fail visibly. Auto-update is off on servers by default.
- Update (`IO / = ETHER@ETHER/instance`) is an ordinary assignment to a location: it transfers only the commits after the
  local head, keeps local edits merged, and offering it is a quest.
- An instance directory belongs to one character: `/ray` the standard library, `/$/…` the languages, `/Ether.ray` read
  after the standard library and before the entrypoint, `/#` world data, `/@<uuid>` character data, `/%` history belonging
  to no character or world, `/entrypoint(.*)?.ray` per kind of character, `avatar/` the avatar images. Any other directory
  is a package, private by default.

### 19.3 Statuses

- A status is a narrowing of a character, never an enum member: `Online := Character{device.network.connected}`,
  `Broadcasting := Character{quests{serves @public}.nonempty}`. Some are read off what runs (`Online`, `Offline`,
  `Broadcasting`, `Hosting`, `Proxying`, `Idle`, `Busy`); others are only said (`Invisible`, `DoNotDisturb`, and the NPC
  modes `Resolving | Waiting | Stopping`).
- Reading `@me.status` answers the narrowings `@me` satisfies now. Writing it is a constraint on what may run:
  `@me.status = Online & !Broadcasting`, or scoped with `with`. Parts flagged to run only under a status
  (`serve(@public) if @me is Online`) don't run when it contradicts them, so "do not disturb" suppresses rather than
  labels. When the character isn't that status already, writing it starts a quest whose goal is that status.
- A character's status is the highest over all its instances. `invisible` is a per-reader view: Online to oneself,
  Offline to others. `NPC` and `Player := Character{!(. is NPC)}` are narrowings, not classes.

### 19.4 Mirrors, shards and consistency

- A mirror is the same variable at another location (`x @ @me.managed`); sync depth is a setting of that location. A
  mirror's permissions are its own (grants placed at the mirroring instance), else the value's.
- A sharded character is stored across locations: `"A1", "A2" @ @me.managed, "A3" @ @ether, "A4" @ @"192.168.1.254"`.
- `x @ instance` is x somewhere in that instance; reading a remote x keeps a local mirror; a local x never goes remote;
  `T @ *` across unknown instances is a quest. `world.locations` is an unbounded Ray, explored as a quest.
- Eventual consistency is the default read; `x @ {replicas.every(.synced)}` asks for strong consistency and raises
  `ERROR@Consistency` until they are synced. A program may be split over several machines' quests, joined with `sync`.

### 19.5 Items, references, messages

- Items: issued by a world (by default the nearest world of where they are); `item.move(to)` is a transaction, so the
  move is in its trail. An unnamed item is shown from its class and location; identity is location and history.
- Every Node has `.ref`, a reference derived from its history: the date is the first commit's `when`, the authors are all
  commits' `who`, it is a draft while less visible than the branch before, and the link is its location. Published means
  the instances hosting it. The `Reference` class carries the site's fields (title, subtitle, date, organizations,
  authors as characters, link, notes, …). Claiming a dummy reference's authorship is a quest from its issuer.
- A certificate is a commit in an item's history made by its issuer (`item.history{who: issuer}`), valid over a range of
  time, verified by the issuer's public key; no central database.
- Chat is a program: a `Channel` is a History whose messages are commits, each carrying any Program, sent with
  `channel |= program` (committed as `@me`). `Channel := History + Program`; a kind of chat is a narrowing,
  `Chat := Channel{Pure & Terminating}`, and a message that would break it is refused. A received program runs with the
  sender's delegation intersected with the reader's grants.
- Streaming: watching is following a player's streaming location.

### 19.6 Programs are quests

- There are no jobs and no `Quest` class: every Program has a `who` that runs it (a selection: `@me`, `@me.device`,
  `@alice`), its own cursor (`at`, `started`, `results`, `done`, `running`, `progress`, `.stop`), an optional `goal`
  (`reached`, `attempt`), and `abstract`: its steps that call something defined nowhere, which `who` performs. A human
  quest is structured the same way, and the human runs it. A quest is always a program, never a list of steps.
- A quest is reachability: from a value of `T` to `T{goal}`, with a verifier. Its return value is the reward.
- A character's running programs are a selection on it: `@me.quests` (`@me/quests`, `@me/device/quests`).
  `@me/quests |= program` starts one; `.stop()` ends one. The daemon is Ether's scheduler.
- NPC modes: run until all quests are resolved, keep running and wait for more, or stop with unfinished ones.
- Completing a quest issues a certificate from its world to the solver; done is `x**.is_terminal`, and one that can go
  on is `done & continuable`.
- Forcing a lazy value someone else may compute, and warming caches, are quests picked up by whoever has capacity.
- Real work stays a Program: `choose`, a written status's quest, recovery, a reference's claim.

### 19.7 Networking

- All of networking is the separate project `@ether/network` (isolated, excludable): protocols with default ports (ether
  37839), the URL grammar (with RFC 3986 userinfo, its password confidential), `Port := Decimal{< 2^16}`, sockets, hosts
  as equivalences (`"ether".ignore_case => "ether.orbitmines.com"`), DNS history checked against stored public keys,
  remote nodes, `< @https://…` imports, proxies (all traffic or a block, per user), the version handshake, the MAC
  address (from an external, or random with the multicast bit), timed challenge messages, and remote execution as a
  character. `proxy @ether { fetch(@https://example.com) }`.
- An instance is a Location that is a URL, domain name, IP or socket address; localhost locally.

---

## 20. Compiler levels and optimization

### 20.1 Levels

- Optimizations are rewrite rules, kept in `Compiler.ray` and removable. A reduction is a rule, and a level is which rules
  are in scope: a level is a scope. `Program{O: …}` is a program under a level, and `O` is the selected optimizations:

  ```ray
  Compiler.default += {
    {a} * 2 => a + a
    {a} + 0 => a
  }
  fast: Program{O: Compiler.default} = f**
  slow: Program{O: Compiler.none} = f**        // the empty level: no rewrites
  with O = Compiler.default + Compiler.memoised
  ```

- Every translation is a Compiler level: renderers, storage formats, backends, a target architecture
  (`Language.x86_64`), the development level (§10.6), a decompiler (`Compiler.decompiler`). There are no build or walker
  functions beside them.
- The compiler's recorded graph is a `Program` value: statements as vertices, sequence and conditional gotos as edges.
  There is no separate instruction vocabulary. Guards are conditional gotos; passes are rewrites; a back end is a Language
  level that writes the Program (`$.js`). An applied rewrite is a commit in the program's history labelled with its rule,
  so a failed guard and a revoked equivalence are one mechanism: run on from the last commit that didn't rely on it.
- Code between statements (timers, hooks) is a rewrite applied as a level, with no syntax of its own:
  `with O = Compiler.default + Debug.timed`, where `Debug.timed := { {s: Statement} => s; timer.tick }`.
- Programs are stored in history with their compiled form and run from it while unchanged. Memoising computed values
  against their inputs is a level (`Compiler.memoised`).
- Each interpreter may add its own optimizations in a `.o.ray` file (`v0.ts.o.ray` adding to `Compiler.default`): native
  numbers and strings, host code through `@js { … }`. They are optional and never change meaning.
- Whether something came from the standard library is read through its location.

### 20.2 Equivalences

- Three kinds, each switchable per method: `force` (applied automatically), `suggest` (preferred, offered), and
  compile-time (optimization, approximation, plain). Undoing an applied equivalence forbids it there.
- `==` rules are reversible equivalences, usable both ways (double negation and idempotence are standard). Reversing a
  rewrite's arrow gives an automatic isomorphism, which recovers abstractions when decompiling.
- `approx` carries its error as a narrowing on the result type (an uncertainty).
- Lint styles are named sets of suggestions (§4.7).
- A rewrite is applied by scope; there is no keyword for applying rules. Applying one by hand everywhere
  (`if.inline` + enter) is IDE work.

### 20.3 Passes and problems

- The classic passes, in this order: (1) numbers counted rather than walked; (2) constant folding and dead code;
  (3) goto → `if`/`while`; (4) CSE, LICM and SSA. Dead-code elimination is a rule over statements narrowed by
  `unreachable`, rewriting them to nothing. Loop unrolling: a loop with a known count becomes its unrolled ray.
- The backlog of specific optimizations, kept in Compiler.ray: store both arrays vs iterate; indexes for string lookups;
  `ignore_case` on both sides; `Ray.index` as a counting loop; an unordered `#` collapses on the first true;
  `bound < infinite` makes `.infinite` false; reference counting to decide store vs reference; large `instance_of`
  iterables stored separately; KMP/Boyer–Moore; dead stores (dead only if no one reads `a%`); `.push_back(A)` as
  `.last = A`; `+=` without the copy; a value held by several containers stored once; `xs.all = X` stored as one fact;
  predicates on ∞ answered symbolically; detected cycles merged into a loop; overwritten random digits not generated;
  periodic cases (leap years) counted arithmetically; multiplying a Binary by 2ⁿ is a shift.
- Optimization problems are a library: `optimize`, `minimize`, `maximize`, `prefer`, `allow`, as classes over a search,
  with constraints as `dynamically assert`:

  ```ray
  optimize time_elapsed
  minimize space_used
  prefer minimize y if x > 100
  allow network
  dynamically assert x + y <= 10
  ```

- Media formats are optimizations of 2D/3D scenes over time (later, with rendering). Caching rendered frontends against
  re-render cost, per client preference, is a UI level.

---

## 21. The runtime

### 21.1 The host knows no syntax

- The host (the TypeScript interpreter in `@ether/v0.ts`, used the same way by the CLI, the daemon and the LSP) knows no
  syntax. Its one assumption is about meaning: the entrypoint's first statement defines how rules are defined, and uses
  that definition in its own body. From it the host learns the brackets, the definer, the separator, where a statement
  ends and the indentation; other forms are taught by templates in the entrypoint (`{name: type} => {name}: {type}`).
  Renaming any of it in the entrypoint renames it.
- The host never hardcodes words, spellings, flags or literal checks, and it is ignorant of types. Conflicts are resolved
  in `.ray`, or the host is generalised.
- The language definition is `@ether/ray/.entrypoint.ray`; every other file is read in a scope of its own inside the
  entrypoint's, so what it defines reaches neither the reader's code nor other files.
- Bootstrapping: the entrypoint is read again and again. A rule takes effect from the moment it is defined, within the
  same pass; the next pass picks up what was written later. When a pass defines nothing new, bootstrapping is done
  (other errors may remain), and only then is any other file read.
- Recursion is broken by construction: the first statement is read by inference, never by a rule; a definition's head is
  read with the rules before it; applying a rule inside its own body is a call, never an expansion.
- Reading is by demand: any reach of a definition reads it ("arbitrary blocks of code can run arbitrary other bits of
  code").
- Native code is rebuilt at every start; it is not kept on disk.

### 21.2 Externals

- The only externals are `&` (a rule's application as a Ray vertex: its captures, `this`, `caller`, and what it is made
  of), `goto`, and labels `name\`. Writing a member is defining on the vertex (`&+=`). Loops, `break`, `continue`,
  `return` and `recur` are written in the language with labels.
- Identity needs no external: dispatch (a rule on None answers for it), `is` or `==` do.
- Interpreter-specific optimizations (host numbers and strings, `@js { … }`) are optional, live in that interpreter's
  `.o.ray`, and can be removed. The host's access to IO, time, the OS and randomness stays until the new runtime is done;
  a character's code point comes from a `bits` external that hands over its bits.
- No integers: text is a chain of character nodes, positions are places, counting is walking, and numbers are
  `Number.ray`'s, mapped to native integers only by a removable level.
- Every external also gets an Ether OS implementation (§14.5). New externals are declared only with the user's approval.

### 21.3 Frames, names and members

- A name is a place. A captured argument is lazy code, read where and when it is used.
- A frame sees the frame it was written in first. A rule made inside a frame keeps that frame, as a closure does.
- Names resolve on what declares them: Node's own members (`#`, `##`, `*`, `**`, `%`, `@`) always resolve on `this` (or
  globally at the top), never on a local or closure frame.
- A value's own member comes before its class's rules; a later `&+=` overrides an earlier member of the same name.
- Statics and field defaults are read when first asked for, then held until what they read changes.
- Diagnostics are values, each with the place it is about. A statement may have several, without cascades: a failed
  lookup yields an unknown whose further failures are silent. Highlighting is what a reading's rules say.

### 21.4 Speed

- Speed never comes from changing meaning. It comes from properties of the walk (memo per version, an index of first
  characters, history-driven re-walks, compiled walks as a Compiler level) and from removable optimization levels.
- A rewrite of the runtime is at least as fast as what it replaces.
- Resource accounting (storage, memory, time, the size of a Ray) and memory management come last, after everything else.

---

## 22. The frontend: geometry and UI

### 22.1 The model

- One description of a page; a TUI rendering and an HTML rendering both follow from it and are equivalent. The whole of
  orbitmines.com is built this way, as the example. 2D, 3D and PDF rendering come later.
- The page's Program *is* the description. At a render level it reduces to shapes; `UI.HTML` and `UI.TUI` are Compiler
  levels below that: `page.rendered(UI.HTML.level)`, `page: Program{O: Render.TUI}`. A renderer's aspects are rule sets
  reduced on the Shape, and a value's rendering is a rule on the value's type
  (`{color: Geometry.Color} => "rgba(" …`); there are no records between the Shape and the format.
- Equivalent means equal as much as possible. Where a target can't show something, the difference is handled by a
  general solution, never a special case (`UI.Lowered`: a choice is a box with its face, an embedded video a link with a
  placeholder, an image a pointwise paint). An image in the TUI is coloured ASCII art from one general sampler (a luminance
  ramp plus colour per cell).
- A value with no rendering of its own renders its fields as a table or tree. A value renders through the first rendering
  along its equivalence graph (`pt 5 @fadi as Author` renders `@fadi` through `Author`). A superposition renders through
  `@me.choose`; to show all values, write them as a list (`xs#.map(…)`). `a & b` renders both at once, layered in one
  place; `a | b` is chosen; `a, b` flows. A form is a block of declared, unset fields, each rendered as its choice.
- Switching the view of a value (Many, Array, Graph, Tree) is a choice of rendering level over the same Ray, not a change
  of the value.
- Alternative renderings are entry points (§9.2): `Profile~card(@fadi)`, `with Profile = Profile~card { … }`.
- Events are variables that change (`width`, `Keyboard.f2.toggled`, `Mouse.position`), and `dynamically` re-evaluates
  what depends on them. The default code has no callbacks. Triggers are `{action} when {condition}` (§10.4).

### 22.2 Geometry

- The core is geometry: shapes, space, constraints and a solver, in `@ether/geometry`. `@ether/ui` (render levels,
  input, platforms) depends on it.
- Everything is narrowing: `{width <= 1240px}`, `(width: 90%)` and `{width: 90% & <= 400px}` are ways of writing the same
  constraint. The constraints leave one solution, and the layout takes it. Ray solves them with a language-side solver;
  the HTML level may delegate a constraint to CSS where CSS expresses it exactly, as an optimization.
- Spacing is one component, `Geometry.Spacing`: edges plus `from: border | itself`. From the border is what CSS calls
  padding; from the shape itself is a margin in the flow, or an inset for a positioned shape. Adding spacing leaves the
  shape what it was (a Ball with padding is still a Ball), and spacings on the same side add up. The shorthands are the
  preferred notation: `pt 5` is `Spacing(…, from: border)`, `mt 5` is `Spacing(…, from: itself)`; `px`, `py`, … likewise.
  `pt 5 @fadi as Author` is canonical.
- Units are Unit.ray quantities (`px`, `pt`, `em`, `%`, `m`); the platform level decides what a unit is in its target
  (a CSS pixel, a fraction of a terminal cell).
- `n * X` gives X that share of the parent's width (`100%`, `1` and `1.0` are the same; `4/12 * center Card`). A share in
  a length field is that share of the parent's available size on that axis (`{width <= 50%}`); a share radius is a share of
  the shape's own size (`radius: [50%]` is a circle).
- Responsive widths: `(xl 4/12 -> xs 12/12)` interpolates by the container's width (a breakpoint-sized value defines its
  own `->`); the explicit breakpoint list stays allowed.
- The separator is the flow: newline-separated children stack vertically, `,`-separated children flow inline.
  `.map(,)` and `.map(\n)` rejoin children with the other separator.
- The alignment words are narrowings on position, lower case and `^keyword`: `center` (equal space on both sides,
  `(<-D).length == (D->).length`), `left`, `right`, `between` (distributes the remaining space). Each accepts any block
  and works per dimension. `Right .map(&+ px 5) <- { … }` sends the block through the map, and the result is the block
  given to `Right`.
- Directions per axis: `left <<- previous <- horizontal | x -> next ->> right`,
  `bottom <<- down <- vertical | y -> up ->> top`, `behind <<- backward <- depth | z -> forward ->> in_front`. `<-`/`->`
  are the neighbours, `<<-`/`->>` the far ends. A direction word on an object starts from its boundary on that side. Each
  axis states its orientation: Geometry is y-up, and the screen levels flip y.
- Shapes: a Ball is the points within `radius` of a `centre` under the space's metric; `n-Ball` fixes the dimension;
  `n-Sphere` is the surface of the (n+1)-Ball; `Circle := 2-Ball`; `Open`/`Closed` exclude or include the surface;
  `interior` is the ball without its border. Fields not on the Ball delegate to its points. `radius`, `diameter` and
  `boundary` define each other circularly.
- Spaces: `n D Grid` is `Space.grid`, each axis of which may loop (one looped axis gives a cylinder, two a torus);
  `Plane` is an unbounded 2D space; continuous space is the limit of a grid's divisibility; solids are shapes over those
  spaces; `Straight` is a property of a Curve; effective dimension is per point (fractals). A graph space's edges may
  carry a length (default 1), which its metric sums; `x discretized (1 / m)` samples a shape on a grid, and what lands in
  one cell superposes, resolved by the renderer's policy.
- A per-point value is a function on the shape's points (`Pointwise`); a constant `fill` is its parameterless case;
  gradients and patterns are others. A hole is a subtracted component (`shape - Ball(…)`); `LocallyConnected` is a
  narrowing on a Space; `a &+ b smoothed r` joins with a blend radius.
- `Geometry.Shape` holds shape, space, layout and paint fields only; cursor, touch, scrollbar, styles, palette and the
  like are UI's (`Geometry.Shape &+=` in `ui/UI.ray`). Positions are classes (`Flow`, `Sticky`, `Fixed`, `Absolute`,
  `Anchored(anchor, side)`), filters and gradients one class per function, and `Box` is `Shape{boundary == box(size)}`.
- A spatial relation (`against`, `next to`) is a Geometry narrowing; counted types (`4 Wall{a Door, 50% Window}`) work
  now.

### 22.3 Content and styles

- A style is a named narrowing, a field of the Theme (`UI.Theme.italic := Geometry.Shape{font.style == italic}`), and it
  sits on the characters it marks. Highlighting names (`keyword`) colour through the palette the same way. The theme and
  its dark variant are the language's (the entrypoint).
- A link is a shape whose content is a Location: `"Ray" @ loc`. Any location renders as a link by default; there is no
  `Link` component (`@orbitmines.avatars` is already the list of locations to render).
- A location's extension names its format (`$.png`), and the format declares the class it reads to (`Image`).
- Articles, the Almanac and profiles are pure Ray: every paragraph, heading and reference is a Ray value. Long texts are
  multiline strings; page text interpolates `{…}` like strings.
- A website can be built from any class: fields are canonical (`profiles: Profile$ @ /profiles/`), and `@` only gives
  the field's Location, which overrides the default URL. An item's id is its name; `/profiles/<name>` selects from
  `profiles` by identity, and when several match a chooser renders. `/` is the site's own rendering (Index), and `{*}` is
  every path no field claims.
- Running the site depends on the level in scope: `orbitmines.com() if &entrypoint`.
- In an HTML level, a field's narrowing becomes the `<input>`'s attributes and back: `maxlength` from `{.length <= 5}`,
  `required`, `readonly` from `none.write`, `step`, `min`/`max`, `multiple` for a field holding more than one value,
  `pattern` for a narrowing by a pattern, and a datalist for an enum with an open member (`C(choose?)`).

### 22.4 Targets, input and platforms

- The TUI is interactive from the start. Navigation moves the selection through the hierarchy only; paths exist but
  aren't shown. Keys are bound once, in UI: arrows and w/a/s/d move (pulsed), ctrl skips groups, shift expands the
  selection, Tab/shift+Tab, Enter activates, PageUp/PageDown, the wheel scrolls, f2 toggles, `q` ends the program. A
  terminal reports no key release, so a key it reads is pressed and released.
- The Keyboard API: `pulsed (max: 20/s, delay: 1s)`, `toggled`, `cycle`, and a key as a boolean while pressed; keys are
  `dynamically` variables. Renderers only write `@me/device/keyboard`, `@me/device/pointer` and the like. Pointers are a
  location of contacts; controllers are `@me/device/controllers/<id>` (a reconnecting device takes back the id its
  history shows, unless another claimed it; a new controller is a guest until given a character); many keyboards are a
  superposition, `@me/device/keyboard#0` one of them.
- An interface is a location with an extent into a world, so a window or a document is both an Interface and a World.
  A run is the Program on an interface: `program.run(on: @me/instance)` (or `@me/device/document`); ending the program
  ends the run.
- HTML: static HTML+CSS+JS for production (plain JS for now; React as a level that composes, `.JS + .React`), and the
  TypeScript interpreter bundled for the browser in development. Both must work. The browser reaches the DOM over the same
  byte channel through a protocol written in Ray, with a small fixed host shim. A browser extension is another HTML
  platform level; the page's URL is `@me/device/location`; direct JS access is `$.js` code sent through the DOM protocol.
- `UI.HTML` (`@ether/ui/HTML.ray`) renders a scene into an HTML document with its stylesheet and script and writes
  `$.html`, `$.css`, `$.js` and `$.json`. `UI.TUI` (`@ether/ui/TUI.ray`) draws a scene into cells and writes `$.ansi`.
  `Language.Direct`, Ray's own raster drawing, stays in the core UI, reading fonts through `$.opentype` and images through
  `$.png`. `@ether/ui` bundles the languages its renderers write.
- Platforms are levels composed per target, and platform code doesn't appear in the default code. Supported:
  Linux/macOS terminals (xterm-256color, truecolor), Windows Terminal, the major browsers (Chromium and Firefox first),
  and the TUI running in a browser. Capabilities degrade.
- IO is one byte stream; raw mode, terminal size, key decoding, ANSI and file writing are Ray on top of it, as platform
  levels. Output goes to `@me/instance`.
- Components such as download and login buttons come from the orbitmines.com library, not from UI. orbitmines.com
  hardcodes its players and organizations for now; a database comes later. Port order: index, profiles, archive, Almanac.
- Long-term rendering notes: shaders as parallel iterators (a GPU level); a `$.glsl` level writing a shape as its signed
  distance function (exact as `force`, a bound as `approx`).

---

## 23. Gamification

Mostly proposals; the decided points are marked.

- The game is a frontend over the same values the IDE edits. Every game object is a Ray value and every game view has a
  text variant; nothing exists only in the game. The loop: find a quest, equip items (what is being checked), explore a
  space of programs, verify (inverses, equivalences), and get a reward that is itself a computational object.
- **Decided:** a quest is reachability: from `T` to `T{goal}`, with a verifier. Creation constructs a value of a type,
  identification finds which type a value is, optimization finds an equivalent program that is better on a measured
  resource. Difficulty is relative to a character, from the skills of those who solved similar quests. Refinement is a
  quest whose solution is a program of quests.
- Optimization as play: the search space of equivalent programs is a world. A location is a program, neighbours are single
  rewrite steps, reversible so any position can be walked back. An item found at a location is a rewrite or a
  sub-program, carrying its origin chain. Benchmarks are values (a file, or a type of files); a tradeoff is two benchmarks
  moving in opposite directions. Engines that approximate the same dynamics are `|` alternatives, raced or chosen by
  tradeoff.
- Player model: the character is permanent; an avatar is one of its names; skills are on the character (a skill is a class
  of quests), and per-world progress is its history narrowed to that world. **Decided:** proficiency decays: unused, it is
  partially lost against the historic baseline. Progress is awarded only for verified solutions whose effect is measured
  downstream (the anti-gaming rule). Roles: Designer (creation), Archivist (identification), Interoperator (equivalence),
  Optimizer (search), beside Builder, Engineer and Explorer.
- **Decided:** mana is only real capacity: the CPU, GPU, disk and network of the machines you connect, a quantity with a
  rate unit. Never an invented currency. A spell is an IO operation shown with its cost and progress; concentration holds
  the resource. Presence (in memory, on disk, remote) is visible; materializing is fetching into local storage.
- **Decided:** a world is a `.project.ray` project; its rules are its dependencies plus `with` overrides. A room is the
  inside of a value: its fields as items placed in space. Names are optional (identity is location and history).
  Visibility applies per location.
- **Decided:** onboarding, in the note's order: language; "what are you here for" (everything, or tools only); network
  mode (go online, pessimistically online, invisible if possible, prefer offline, go offline), each a permission preset;
  realistic or voxel; arrival. Every choice writes a setting and can be changed later. "Tools only" turns off NPC dialogue,
  cutscenes and lore.
- **Decided:** the networked world graph (regions held by nodes, synchronising the past, detail falling with distance,
  hazy and veiled presence) is out of scope until after the IDE. Level of detail, for text too, is a rendering level
  chosen by distance or zoom.
- The guided navigation language is Ray itself: a player's action narrows a superposition, and the machine brute-forces
  whatever is left small enough. Events are recorded, not named: a recorded chain becomes a function.
- Paying for optimization: the saving (projected minus actual use) is split between whoever optimized and whoever
  benefits; this needs a baseline that resists gaming.

## 24. Backlogs: the IDE and the Library Project

- **The Ether IDE (2027)** keeps its notes as a backlog, not implemented now: code ↔ English at a chosen level of
  description; ambiguities resolved in the editor and remembered; tests collapsed inline, a timing button and a version
  selector per function; cursor rules; search inside results as an undoable program; unbound controls offered and one key
  showing every orbit; drawing graphs; an explorer that works while nobody does; a controller as a programming interface
  (typing as a probability over keys, sticks for `.expand`/`.collapse`, a trigger switching the rendering level); LaTeX-
  like symbol input as a `force` equivalence in a style; stepping through a run one `. = .next` at a time and browsing what
  a text was read as, both renderings of the Program value; a REPL whose session is a history branch. Ray as the shell is
  planned: the REPL over quests and locations, with `$.sh` reading existing scripts.
- **The Ether Library Project (2028)** reads and lifts foreign software into Ray: extracting features, APIs, accounts and
  version diffs (none of it needing a record format: a feature is a narrowing over behaviour, an API a set of
  equivalences, a diff is history); comparing languages with Ray as the reference frame; a decentralised index of
  applications; generating and checking the language index rather than keeping it by hand; indexing only openly licensed
  languages and libraries. Its goal is to compare languages without hand-written grammars. Reading foreign software,
  regex, hashes, ciphers and compressors come through it.

---

## Appendix A: Open questions

Each question gives the recommendation recorded when it was raised, where there was one. None of these is decided.

**Reading and syntax**
- Warnings for a multi-line `( )` holding a `,`, and for a first statement with leading whitespace. (Recommended: both,
  as warnings.) A warning when `=` creates a name no scope declared.
- Unread text: should it still be split path-like on `/`, `.` and whitespace so the names inside it resolve, with what is
  read superposed onto the string? (Recommended: yes.)
- A value that takes no argument written before another (`a b`): read some other way, or the error on that span.
- Lint styles as named sets of `suggest` equivalences (`dead_code`, `redundancy`, `simplify`, using an existing method),
  with `-set` removing one.
- Check that a negated pattern part doesn't end a match early (the old note was written against a test that succeeded on
  `"hello"`).
- Diagnostic codes as `E<version>.<n>` of the language version that introduced them.
- `x == (a | b)`: compare with each alternative and answer the superposition of results, membership staying `is`.
  (Recommended.)
- `IPv6 => String` as another spelling of a conversion. (Recommended: only if the equivalence spelling takes it; `as`
  stays the one conversion.)
- Whether a one-character `"A"` is a Char (as the Almanac writes) or a one-character String (as the 2026-09-30 work made
  every `"…"`).

**Types and values**
- A member with both a computed definition and an assigned value: answer the assigned one, and assigning `?` returns it to
  the computation. (Recommended.)
- A definition that must not see the global context: no special form; override what its body sees with `with`.
  (Recommended; open until a case needs it.)
- Members visible only through a location (`*{location == @private}`): yes, by narrowing, where `location` is the
  filtered value's. (Recommended.)
- `Ray<T = Ray>` defaults, and whether `x: T` with no value should warn.

**Programs and runtime**
- Committing a statement as its value instead of its text (the `.%` cache line already is that). (Recommended: a choice
  of the writer.)
- A speculative branch whose dynamic condition changes: cancel the one that no longer holds, roll back its effects, free
  its resources, commit or start the one that holds. (Recommended.)
- `dynamically assert (this -> .epoch) is finite`: a named predicate `finite`, no keyword. (Recommended.)
- `unreachable` as a predicate on a Program's statement (no path reaches it). (Recommended.)
- A language as a pipeline of stages (the `.ray2.json` list): no stage list in the language; a designer view renders a
  Language's rules grouped by what they do. (Recommended.)
- An `as` whose result depends on its input counts as a language (a criterion for "when is a mapping a language").
- Models as dependencies (`@hf/<org>/<model>`), configured in `.cfg.ray`, with no default.
- Quests that force lazy values and warm caches, picked up by whoever has capacity.
- The `size` attribute of `<input>`: leave it out (an exact length is `minlength` + `maxlength`). (Recommended.)
- `[n]` on a ray takes n steps with the context's traverser; `+ (at)` / `- (at)` fix the direction, `±` is both.
  (Recommended.)
- `ray{##.count == n}` for vertices by degree, with no method named `v`. (Recommended.)
- `$` on an Iterable from the draft: drop it. (Recommended.)
- Several hierarchy directions on one node (inventory and rendering), the context choosing which `.hierarchy` names.
- What an orbit's `∃var * var == 25` answers: the superposition `var * var == 25` collapsed to whether some alternative
  holds, and `assume ∃…` narrowing var. (Recommended.)
- A proof as a Program whose explored paths are kept as an index for later quests.

**Numbers and time**
- `ℕ`, `ℤ`, `ℚ`, `ℝ` as aliases once non-ASCII names read.
- Floating point as a Ray narrowed to representable points, rounding being the superposition of neighbours collapsed by
  the rounding mode, read by a `$.ieee754` project.
- Relativistic time: a Time carrying the frame it is proper time of. Clock sources: `now` read at the precision asked;
  on Ether OS, `$.ntp`.
- A segment name before a number (`day 5`, `sol 3`) as the time at the start of that segment.
- Tests for superposed weekdays and times through arithmetic. The Darian calendar for Mars.
- The negative SI prefixes need a ratio that isn't a natural number; `1B` (a billion) against `1 B` (a byte).

**Text and identifiers**
- Custom (non-Unicode) symbols: flagged for future support.
- Fonts that render every super- and subscript in the IDE plugins.
- The channel an instance communicates over as a value (the session carrying its keys). Where encryption applies: per
  location a value is stored at or sent to.
- The order of UUID v1's time fields: the layout in byte order, the 60-bit time a derived binding. (Recommended.)
- A version written as an unambiguous prefix of its UUID. A namespace name answering the latest variant of an object.
- The hex-letter round trip of UUIDs (a known bug).

**World and access**
- No `@player` name: in a player session the player is `@me`. (Recommended.)
- Several public keys per character, each scoped to who may see it.
- A player profile (preferences, interests, unlocked skills) and the last instance per device under
  `@me/device/<…>/last_instance`. Server discovery.
- The hosting model (cloud accounts, provider order, free tiers, spending limits): the networking project's open list.
- `@alice "hi"` sending a message, allowed by what the recipient grants. A world loading a character's names by location,
  unknown properties lazily. Recognising a deleting logout by function equivalence.
- `@me.status` "offline by default": the instance connects by default, while the character isn't `Online` until set.
  (Recommended.)
- Where the default privacy policy lives: a `confidential.write` field of the character. (Recommended.)
- An instance runs `entrypoint.ray` when it has one, else its kind's entrypoint. (Recommended.)
- Shell completion from the CLI grammar. The `ether` CLI as a program in its own sublanguage (`entrypoint.cli.ray`).
- Distributed edits, splitting a history, and the cost of large arbitrary graphs. The central platform as only an index
  (like DNS), with users keeping their data.

**Frontend**
- The default font set: Noto (all scripts, CJK, Color Emoji, and monochrome Noto Emoji for the TUI).
- Host builds (desktop shell, wasm, WebGPU): back ends when the frontend needs them.
- Style classes as sets of components and field values added with `+`, the later one winning.
- Bounding boxes in spaces of fractional dimension; volume as a measure over a space; orientation (yaw, pitch) as part of
  a location.
- Which of the equivalent prefix, block, argument and narrowing forms is the canonical one in each case.

**Gamification and backlogs**
- Everything in §23 not marked decided, and the note's own questions: calibrating a player's knowledge, what makes a
  problem translatable into a game, resource gathering, maze navigation, what 3D gains and loses.
- The Library Project's backlog (§24): starting language, lifting chains, object formats, implementations × targets, the
  index entry shape, places to get a toolchain from, stub files.

---

## Appendix B: Where the Almanac still shows an older form

The Almanac is the published description; these lines predate a decision recorded above.

| Almanac | Decided |
|---|---|
| `Binary³²`, `Binary⁸[]⁴`, `Binary^32`: a superscript on a base type as length | A subscript behind is a length (`Binary₃₂ = Binary₈[]₄`); a superscript is always exponentiation (§7.4, §12.1). `10₂` is written `₂10`. |
| `x.match` with case lines | No `match`: `if x { cases } else { … }` (§9.3). |
| `choose{unique} UUID`, `choose{unique} UUID.v1` | `choose UUID.v1{unique}` (§3.4). |
| `title %1..5: String` | `title %[1..5]: String` (§15.3). |
| `forever () => Never` | The type is `never` (§10.1). |
| `∀ path ∈ .paths`, `∃x: Binary …` | `forall path is .paths`, `exists x: Binary …` (§7.2). |
| `x: u8 = 11110000` with `u8 = Binary⁸` | `u8 = Binary₈` (§12.1). |
| `@me.status = Online & Hosted & Idle` as enum members | Statuses are narrowings; writing one is a constraint (§19.3). |

---

## Appendix C: Dropped and replaced

So they aren't proposed again.

- **Syntax:** `++` (a copy is `.copy`); `match` (use `if x { … }`); `~` as a filter (`{p}`; `~` is entry points only);
  `..middle` for a spread (`...`); `try`/`catch` (`$`); the `<{…}>` statement hooks (a Compiler level); the `⸨⸩`
  templates for other languages (class patterns); `{{expr}}` as a lazy literal; `x.prop?` as "this holds" (postfix `?`
  stays optional chaining); `^`/`v` as case aliases; `:{p}` narrowing in place and `expr : T` constraining free variables
  (`:` already narrows); `T>` (a greater type); holes in member names (`a.foo{x}bar`); `=>` optional after `()` and after
  `< Parent`; `< override`; `bidirectional X` as a method modifier; a direction-switch marker; a keyword for applying
  rewrites; an "evaluate now" flag; a comment modifier; `%=` as shadowing (it is modulo-assign); `relative_context | &&`;
  `1.m`, `1 of m` and `per`; `∈`, `∉`, `∋`, `∌` (use `is`); a uniform call syntax with `this` as the first parameter;
  `-> Return` and `l()` in method types; `single`; the `{id}\` labels on rendered elements.
- **Types and values:** `accepts` and `alike`; `.of` factories; `exists` (truthiness); `explicit` conversions;
  `Optional<T>`, `Required<T>`, `Query<T>` (for now); `unique{expr}` (replaced by `unique<in: …>`); `protected`;
  `temporary`; `.sign`; ranking ordered conversion routes over superposing ones; reading a declared but unset name as an
  error (it reads as the full type); a type's script meaning its count; storage types written in the language; `Never`
  as a type name; `Persona` (now `Character`, with text characters `Char`); `.Positive` number names; custom symbols.
- **Classes and records** that turned out to be a second structure: `Quest`, `Task`, `Job`, `Run`, `Abstract`,
  `Backend`, `Avatar`, `Certificate`, `Reservation`, `Transaction`, `Capability`, `Grant`, `Permissions`, `Accessor`,
  `Visibility`, `Effects`, `Source`, `Endianness`, `Link`, `Pattern`; the `Operation`/`Definition` commits with
  `define | change | rename | remove` kinds; the `.%/index.ray` name map; `Language.Entry` and `Language.Fidelity`;
  `SQL.Dialect`; `Versioned<T>`; per-class location fields; read/write/listing members on locations; status as one
  superposable enum.
- **Mechanisms:** process calls, `Process`, `Jobs`, `OS.run`; a project per OS under `@ether/os/` with a universal OS
  interface (now an enum and per-project branches); streams (all communication is `@me/instance`); the package managers
  (for now); `run_as`/`run_at`/`run_after`; the whole-run precedence reduce (precedence stays pairwise); first-defined-wins
  within a phase (`=>` overrides, `&=>` superposes); a separate associativity modifier; restoring `with` settings by hand;
  `speculative.if` (it is `if assume`); `%%` (it is `&%`); `%.fork` (it is `x.copy`); the TS `Range`/`MultiRange` port
  (ranges are rays); a central bug-fix database for the STD (fixes are versions under a narrowing).
