# TODO: bootstrap / kernel

What the library (`@ether/ray`, the optional projects) needs from `ray/bootstrap/` or the kernel, found while making each
library file load and pass on its own. Each item: what fails, a minimal repro, where it shows.

## Conversions

- **A second `as (=== T)` on Node loops.** Node.ray has `as (=== boolean)`; a library file adding another to Node
  (`Node &+= { as (=== Number) => 7 }`) sends `conversions => ((this).conversions, …)` (entrypoint, the `as (=== {type})`
  rule) into reading itself: every value's unread member loops 6000 deep, and `1 + 2 == 3` fails. Language.ray's two Node
  conversions (`as (language: Language)`, `as (=== String)`) cost ~130 bootstrap tests whenever the library is loaded.
- **A class's own `as (=== T)` never reaches its instances** (`K &+= { as (=== String) => "k" }`, `K() as String`).

## Classes and members

- **`static X := v` is not read on the class**: `B := class { static R := 5 }`, `B.R == 5` fails, with or without a header;
  `static g => 7` and `static f (x) => …` read. Every nested class and constant declared so is unread from outside:
  `Access.Reading`, `Report.Claim`, `Diagnostic.Severity`, `Location.Query`, `Version.Pin`, `Unit.Rate`, `OS.Environment`.
- **`x |= v` is defined nowhere** (`|` is not a `compounds` operator): `.access |= grant` (Access.ray), `.name |= name`
  (Character.ray `named`), `Program.refused |= p`.
- **An instance kept as a class's member loses its field values**: after `C.A := C(p: "a")`, `C.A.p == "a"` is false
  (also `C &+= { static D := C(p: "d") }`). The OS projects (`OS.Linux := OS(platform: "linux")`) and `Unit.None` need it.
- **`5 is Node{false}` loops** (6000 deep): a narrowing whose condition is `false`, asked of a value (Control.ray NV1).
- **An assert in a class body cannot call the class's methods** on an instance made there (`Ex := class { same (o) => …;
  assert { e := Ex(); assert e.same(e) } }`: `nothing reads same(e)`). Many library tests are written in class bodies.
- **A field's default that reads a field given at construction sees it unset**: `severity: .Severity = .fatal ? … : …`
  (Diagnostics.ray), `Diagnostic(message: "stop", fatal: true).severity` is not fatal (DG2).
- **A method with parameters and a return type is not read**: `tip (n: Number): static => …`, `Key().tip(2)` is unread;
  `press: static => …` (no parameters) and `tap (n) => …` (no return type) read. Character.ray `named`, Program.ray
  `attempt`, Keyboard's `press (modifiers …): static`, Project.ray `load`, History's `commit`/`reset`/`extended`.
- **A method whose parameters all have defaults is not applied when named bare**: `tap (n: Number = 1) => …`,
  `Key().tap.pressed` fails (`Key().tap(2)` reads): Keyboard's `key.press.pressed`, `Device().choose`.
- **A member added to a class with `Base &+= { static f … }` is not read on a subclass** (`class: Language` classes):
  `Language &+= { static generated … }` in @ether/encryption, `ChaCha20Poly1305.generated()` unread.
- **A hole typed by a named pattern or class does not read**: `{segment: Written}` (Location.ray), `{version: Version}`;
  an inline pattern matches (`{name: (Char.Word | "-")[]}`), but see below.
- **A matched hole typed by an inline pattern is still read as code**: with `@yd:{p: Char.Word[]} => p`, `(@yd:x)` reports
  `nothing reads x`.
- **`&.caller` is nothing at the top of a file** (`@c => &.caller`, `assert @c` fails), so `@me` (`&.caller as Character`,
  ray/.project.ray) is nothing outside a World and every test asking `@me.…` fails (`nothing reads me`).
- **Reading a text as a class by its header** (`"v0.1.4-E2027.0A.4" as Version`, `Language.part_written` of a header
  class) fails; writing one by its header works (`Version(index: 1) as String == "v0.0.1-.1"`).

- **No written form of a label or a jump**: Program.ray's programs write `past\` (a label, one space less indented) and
  `goto past` / `goto past if c` (PG13–PG33, XB1–XB4); the bootstrap has only `external label {x}` / `external goto {x}`,
  whose hole is a value, so a label's name cannot be taken as written until a hole reads text (above).
- **`external io` is gone from the kernel**: the effect tests now use `external read` (Program.ray AC60, EFF2–EFF5); what
  an `@c` / `@js` fragment calls should be an effect too (`os`) once a fragment runs.

## Node.ray

- **The error handlers read members bare** (`diagnostics`, `diagnostics.last`, `diagnostics.some(.fatal)`, line 68–84):
  since a bare name never reads a member, they need `.diagnostics`. They also call `diagnosed` and `caught_by`, which
  Diagnostics.ray now defines; once Diagnostics passes, the handlers can move there (user: and from there into the
  bootstrap, only if it does not fail).
- **`Class~label()`** (Node.ray `~{label}` → `Entry`): `Panel~opened().shown` (Control.ray CMP3/CMP4) is unread.

## Tests

- **Expected errors.** A test passes only when nothing erred, so a test of an error path cannot pass: the rules that
  prevent each other (Control.ray PV1–PV3) and a function raising a non-fatal error (Diagnostics.ray ER14–ER21) fail with
  the error they expect. Something must say that an error is expected.

## Projects

- **A project's dependency lines are read by nothing** (`@ether/random`, `@x25519` at the top of a `.project.ray`): a file
  given directly reports them unread, and nothing loads the projects they name.

- **Every project at once does not fit**: the 84 files of optional/, `$/` and os/ (with ray/) given to one run fill the
  2 GB wasm memory (`out of memory (2147483648 bytes)`, then `RangeError: Invalid file ID` in `FileStore.getRecord`), so
  for now each project is tested with only what it depends on. (Each file read took a 16 MB chunk more, every pending hole
  type tried again in each settle: now once per text, what a failed try made let go of. A small file is ~0 MB again.)

- **Tagged literals read by nothing** (`@html <p>{who}</p>`, `@json {…}`, `@css …`, `@c …`, `@js …`, `` @ray`1 + 2` ``):
  Language.ray (deleted) read them through `Language.named(ext).level`. They come back when a dependency is flagged as a
  language, which gives the syntax. Until then they are unread. The tests that use them stay as written, and TL1
  (`` @ray`1 + 2` == 3 ``) waits for this.

## Tests to take in

- **Control.ray's tests of the language's own forms** (operator sections OP1–OP5, `if` with cases IC3, `?`/`?=` QM1–QM2,
  `is` with `#` IS4–IS6): they test what the bootstrap defines, and belong there.

## Reading programs by structure

- **Program.ray reads statements by their text** (`is_jump => .code ~= ⊢"goto "`, `is_label`, `jump`, `head`, `assigns`,
  `writes`, `declares`, `precedence`): a parser written beside the language. What a statement is should be what the reader
  read it as (Expression.ray's statements: a jump, a label, a declaration and its head), asked of the statement.
- **`@me/device/os` in the bootstrap** (Node.ray IO3, Ether.entrypoint.ray's `threads` default): the OS is one of the
  devices `@me/device` superposes, selected by its type, `(@me/device as OS)`.

## Painting

- **A hole's style breaks reading** (`{name ^variable} := …`, `.{member ^property}`, `{word ^variable}` in Name): the kernel
  crashes now and then (memory access out of bounds in refer ← follow ← valued, ~1 run in 3 at 26 threads) and some enum
  tests are lost. The style is a member on the hole's node, which is `this` when the hole's code is read: probably why.
  Until it holds, member names, declared and bare names, and method heads (`allows (called) =>`) are not painted.
- **A body no test runs is never painted** (a method's, e.g. Access.ray's `covers`): it is read only when it runs.

## Running a program (found getting `(@me/device as Terminal) = x` to run from the CLI)

- **A free infix rule from a file after the entrypoint takes `:=`'s statement**: with `{a} %% {b} => …` in a file,
  `x := 1 %% 2` reads `(x := 1) %% 2`. Operators written as methods (`Node &+= { @ (location) => … }`, like `==`) do not;
  Node.ray's `@` is one now (`x := @name` read `(x :=) @ name` before).
- **An unset optional field reads as its type**, so `x ?? y` never falls back (`registry: Character?`); written `= None`.
  `a | b: T = v` (two names and a default) does not keep the default either (World.ray's `presence` is one name now).
- **A selection between backslashes does not read**: `\x\` (U-C2, `instance`'s primary) is read as an escape (`\s…`)
  and a label (`name\`), and `\(` as an escaped bracket whose `)` still closes (it ended `Character &+= {` early). A
  backslash inside backticks in a comment escapes the closing backtick and opens a quote to the next one: comments are
  scanned for brackets and quotes too.
- **`"{hole}"` in a rule's body reads the hole's code**; its written text is `` `{hole}` ``. `String.split` answers
  nothing usable (its own tests fail): `Character.walked` walks a path with `until` instead.
- **A ternary continued on lines led by `:`** in a static method's body goes round forever; written on one line it reads.
- **A rule whose head another rule reads cannot be redefined**: `@local ^string => …` in World.ray after
  ray/.project.ray's is read as an expression head (`@local` answering a Location); `@local` answers `Location.local`,
  which World sets.

## On the way to the site's first frame (skipped for now; only what Index needs is given to the run)

- **Unicode.project.ray reads its tables from unicode.org while it is read** (`Unicode.Scripts.rows…for script => …` and
  `GeneralCategory`'s rows at top level, `Unicode.UCD` an `@https://…` location): ~528 MB, and nothing holds `@https` without
  @ether/network. Its three-name aliases (`camel_case | camelcase | camelCase => …`) cost ~500 MB each once those statements
  ran (two-name ones nothing): the alias rule's `{name: Name}` checked on characters made through `Char &+= Unicode.Scalar`.
  Left out of the first frame's files.
- **A word after a number is read as that word through the number** (`5 px`, `5 zorks`: the value 5, then the name read
  on it, found in what 5 sees, globally): the space-led method of Number (`{ }{value}`, Unit.ray's `{ }{counted}`) is
  never reached, and the 5 is lost. `5 7` does reach it.
- **A decimal does not compare** (`16.5 > 16` fails in the bootstrap alone).
- **A hole typed by a block or a narrowing of String reads nothing after a value** (`{written: { px: … }}`,
  `{written: String{Spelling[.] !== None}}`); a list of glyphs (`Char.Letter[]`) does match but its text is read as code.
- **`Unit.None := Unit(global.None)` goes round 6000 deep** through `conversions` (Unit's own `as (=== Quantity)`, `as
  (=== String?)` with Node's): Unit.ray's tests fail but its 85 statements read.
- **Constructing a Location costs ~512 MB** (`Location(path: ".")`; `Location()` nothing). Each construction declares the
  header's fields as a rule whose head is the header (`({written_parameters}) := arguments_given`), where braces are holes:
  the narrowings `Char{!= ":" && …}` are read as hole code and evaluated, and `x != ":"` reaches Location's `==`, which
  writes the Location as text through Language.ray's header writer. With `== (other) => true` it costs nothing; naming
  the narrowed types outside the header, or a Location `as (=== String)` of its own, did not help. World's `static ether`
  and every `Instance` pay it. `@local` makes one only when asked (`Location.local ?? Location(path: ".")`).
  Taking the header's defaults instead when everything is given by name (`taking`: `all_named(arguments_given)` beside
  `declared`, then `given_names`) makes `Location(path: ".")` cost nothing and keep its path, but Number.ray +225 MB and
  the other bootstrap files more (their named constructions read the header as code for its defaults): not kept.
- **A typed parameter rejects an interpolated text** (`static walked (at, path: String)` given `"{path}"`/`` `{path}` ``:
  "a value is not of the type it is given to"); untyped it reads.
- **Time.project.ray runs out of the 2 GB** when read after Unicode (the whole 85-file closure of the site does not fit).
- **`x as String` answers a String of characters, not the kernel's text**: `external output (5 as String)` writes nothing,
  and `(5 as String) == "5"` is false in a ternary though `assert 5 as String == "5"` holds (assert's comparison is
  structural). (A count's `as String` is its digits now, by the kernel's map, and a text joined with what is no text joins
  it as written: `"\e[" + 5 + "H"` writes.)
- **With Language.ray read, `5 as String` costs ~512 MB** at read time (and `Location() as String`, so Location's `==`):
  Language.ray gives every Node `as (=== String) => … Language.ray.write(this)`, and the Ray writer writes a Number as
  `writing.value as String`. Without Language.ray it costs nothing.
- **Language.ray's header writer reads `.of.header.head`, which no class has** (the entrypoint keeps a header as
  `header_quoted`): no structured value is written through its header; a Location (a Ray) falls to the list writer.
- **A narrowing's constraint in a class does not see the class's other members by bare name** (`G := class { S := class {
  static d => 2 }; Y := Number[]{.length == S.d} }`: `[1, 2] is G.Y` is false, `Z := Number[]{.length == 2}` there holds):
  the constraint is read on the value it checks (`it.({constraint})`), in frames of GLOBAL, so where it was written (G's
  block) is not reached. Geometry's `Vector := Elementwise{…}{.length == Space.current.dimension} + { … }` so holds for no
  value (`[0, 0] is Geometry.Vector` false), and `Grid.put (at: Geometry.Vector, …)` rejects every point: the first frame's
  cells are never put. (A name read as a place nothing defined where it was named, `S` in S's own block read before S
  is, now reads what the classes it is written in name: `Space.plane`, `Space.current.dimension` hold.)
- **A parameter named bare in a method does not read the field** (`S := class (axes: Number[]) => { dimension =>
  axes.length }`: `S([1, 2]).dimension` is nothing; `.axes.length` reads it).
- **A rule written outside the entrypoint does not read a block it was given in the node it makes** (`{on} +++ {`{`}{code}
  {`}`} => ((on).interior) &+= { {code} }` in a file: `Node +++ { two => 2 }` is Node itself, and `two` is defined at the
  top; the same rule in the entrypoint holds). So `A + { … }` is the entrypoint's, beside `&+`.
- **Some bootstrap code made from text is read three times now, not once** (since statics written `name: T = Class.x`
  and `Class.member` are read when first asked for): `0b0110 ~&& 0b1010 == 0b0010` and two like it, each unread, said
  three times; nothing else differs.
- **A class made in a method's body does not take its header** (`static C := lazily class (y: Number = 0) => { }`:
  `U.C() is U.C` is false, "a left side answers a value, not a place: `()`"). So `static X := v` is lazy (the kernel's
  `external static`) only when v is not a class, nor led by a capital unless it is a call (`Binary₈`, `TF{} {…}` are
  types, named by what they are given to), nor `.`-led (`.DepthFirst`). Typed, `static x: T = v`, only when v is what a
  class makes, `Space.plane`, `Space(…)` (`Letter: Char = "a".."z"` is a type; Language's `ray: .Lossless = (…)` read
  lazily is read by the first `as String`, ~320 MB, inside World's declaration).
- **`.` in an argument is what the code is read in, not a section** (`(0..<24).map(8 + 10 * . -- Geometry.Color(., ., .))`
  in ANSI's `Palette`; `[0, 1].map(8 + .)` answers 1): read where ANSI is declared it was `10 * ANSI`, 6000 deep, and ANSI
  was left half-declared (`ANSI.Cell() is ANSI.Cell` false). Lazy statics keep it unread until asked.
- **The kernel's translation to WebAssembly mishandles a default parameter after another** (`function line(at, end, lo =
  0, head = at)`, and `head = 0` as well): every caller that leaves them out reads garbage. `line_of` takes them explicitly.
- **`RAY_MEMORY` above 2³¹ hangs the kernel** (`RAY_MEMORY=3221225472`: a run of the kernel's own translation, two functions,
  never ends, main's kernel as well; 2³¹, the default, ends in two minutes): an address past 2³¹ is negative as a 32-bit
  integer. So the self-hosting check runs at the default, and the translation of `apply_` is at the edge of it.
