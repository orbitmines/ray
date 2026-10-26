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
- **A type's rules read beneath its hole too**: while a typed hole is read (`{arguments: Arguments}`), its type's rules
  match code run beneath it as well: a rule `{p: Name} {`=>`} {b} => …` in Arguments matched `{name} => value` in `:=`'s
  body (rules applied 6000 deep), `{v} => (v) as_argument` reads itself without end, and a second type of arguments
  beside Arguments (one for classes) broke every function call. So Arguments has one rule, `{name}: {value}`; a call given
  none by name is read by the call's untyped rule (a closure's, where `xs.map(x => x * 2)` is a closure: the kernel's
  `word =>` after `(` reads as one only through one hole), or a class's `Positions_given` (each read whole, a value).
- **An argument read as code is read again where it is used** (Arguments' `{value} => value`, tried): a field given a
  text or a closure (`Carrying(`a`).carried`, `Kf((x) => x * 3).fn`) is read again as the instance's member, where
  `(external &).text` and `.` are another's (lost CI2, CI6, MP1; a kernel thread crashed in `text_admits`).
- **A closure written bare given a class is a rule** (`Kf(x => x * 3).fn`): read whole by `Positions_given`
  (`{value: Node}`), through two holes, the kernel's `word =>` is no closure there. `Kf((x) => x * 3)` reads.
- **A closure given by name is read as a closure of the name** (`idg(f: (x) => x * 3)`, `Kf(fn: (x) => …)`): `=>` binds
  looser than `name:`, `(f: (x)) => x * 3`.
- **A named argument given a function is not a local of the caller** (`nw (wrapped) => nm(named_one: wrapped)`, `nw(3)`;
  a `:=` local the same; a constant or a global holds): before named arguments were taken too. A class given one so holds
  it (NA15). Repro ~/.cache/ray-scratch/selfhost/na16.ray (A, B, D, E).
- **`this` in a rule a statement runs is not the Node its rules are in** (Expression: `Statements(Node(in: this))` in a
  rule of Node's `rules := { … }`): a key's value is called through its reading (`with_reading`), whose `this` is the node
  that call was read in, not what holds the key; called as a member (`node.rules.f(…)`) it is. Expression names the node
  `node := this` in Node's body instead. Repro (70 s, direct): ~/.cache/ray-scratch/selfhost/mx72.ray (`@@G[notnode]`
  through the reading).
- **A lowercase name of a header's statements is not seen in a class written there** (`seen := 46`, then `Inner :=
  class (in?: Inner) => { rules := { got := (x) => seen } }`: nothing reads `seen`): the frames the class was written in
  are looked in for types only (`valued_member`, a capital first), as an outer class block's are. A capitalized name is
  seen (EX10).
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

- **A name written in a frame is not placed** (`x := …` at the top of a file or in a block): a write places what it writes
  only in what has a location (Location.ray's `{holder}.{name} = {value}`), and a frame has none. It should be where the
  code is written (the file, `@/…/Program.ray`). The rule's body cannot name the frame (`.`) from the block it defines on
  the value; a hole spliced in braces (`{holder}`) can be.
- **A value placed after what was written in it** (`x.f = v`, then `x @ place`): v stays nowhere, since a write in what
  has no location places nothing (Location.ray; placing each write costs a rule and a block, and most holders are
  nowhere). A write could place lazily always, once that costs less.

- **A grant for one use (`{once}`, W2)** has nothing to count its uses since Access was removed (2026-10-23): who may is
  only who, at a location. AC6/AC7 were taken out of World.ray until uses are counted where they happen.

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
- **A single constructor taking nothing is not what the type is called with** (`J := Number[] + { static () => [7, 7] }`:
  `J()` is not `[7, 7]`): `made_by`, taking nothing, is applied when named, so `(this).made_by` is its value and
  `this.made_by()` calls that. With another one beside it, `static (x = 0, …)`, it reads (Geometry's Vector).
- **A name given a type of more than two, `x: A | B | C`, or of other than names (`orientation: -1 | +1 = +1`), reads as
  `(x: A) | B | C`**: only `x: A | B` with A and B names is the whole union (the entrypoint's rule); a structure's
  alternatives of named fields, `(LHS: … | RHS: … | String)`, must stay what they are. And a statement typed so,
  `a: Number | String = 3`, is not 3 (`b: (Number | String) = 3` neither).
- **`this` in a function written in a class's own block is not what is made** (`rows := (0 ..< 1).map(r => this.width)`
  in a class's block: nothing; `.width` neither). In a method it is the method's `this` now (the frame the function was read
  from, out through the functions it is written in); a class's block, inlined in its constructor, names what is made only
  as `.` and `this` directly. Grid names its width before its rows for that.
- **Arguments are composed by `,`, then separated by the types they are given to** (the user, 2026-10-23): `.put(at, cell)`,
  `at` a Vector, reaches `put` as `0, 0, cell`; given more than it has places, a place typed so takes as many as make one of
  its type, made it (`&+=`, its members on it). Only when more are given than places, and only for the first places in
  order: a place taking a list among defaults, or two lists, is not done. `[at], cell` keeps it whole as written.
- **Geometry gives an Axis a Number where it declares a Length** (`Space.grid`: `extent: axis_entry.value`, the grid's
  size in cells, against `extent: Length?`): said as an error, and the extent is then the type (all Lengths), so `holds`
  compares against every Length and runs out of memory when asked twice. (A Length is a distance with a unit: the grid's
  extent wants a Quantity, the user, 2026-10-23.)
- **The CLI's first frame does not fit in 2 GB**: the bootstrap and the 34 files it includes (ray/, $/ devices, os, Device,
  World, Geometry, ANSI, UI) leave little: "almost all the memory there is is in use" at points that differ from run to run
  (one thread or many). `RAY_MEMORY` above 2³¹ hangs (above).
- **A method written against what follows it takes one word of it** (`0..p.width` is `(0..p).width`; `0 .. p.width` and
  `0..(p.width)` read): the member is read on what the method answered. `..<` so is read whole by a rule in Ray.ray (`0..<p.width`,
  `(0..<.height)` in UI's Grid); `..` is not (a rule `{low}..{high}` would take `..<` too): UI's `(from.x..to.x)` (underlines).
- **A level of rules applied to a value, `Compiler.reduced(move, UI.TUI.written)`, applies none of its typed rules**
  (`{move: ANSI.Move} => …`): `reducing` reads the value's code (a name) in the level, and a typed hole asks of the text
  (cached per type and text), not of the value it names, so a Move or a Style is answered as it is, not written. A text
  answers itself, a list goes through `{sequences: Iterable}`. The first frame stops here: its parts are not written.
  (`reducing` answered the level itself before: `reading` is `&+=`.)
- **A raw fragment's control sequence, `@ansi \e[2;3H`, opened a bracket** (everything after it misread, ANSI's Style
  no Style): a bracket after `\e` belongs to the escape now. Character.ray's line fragment rule does not take a
  fragment that begins with `\` (its first is a word, `<`, `(`, a backtick, `"` or `-`).
- **`x -- y` binds looser than `:=`** (as declared, after `=` and `,`): `q := [4, 5] -- (v => …)` is `(q := [4, 5]) -- …`.
  A function in brackets after it is given what is before it (`x -- (made => (@also made Vector) -- made)`); a function
  read another way is not.
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
- **A statement's memory running out is a crash, not a report** (`RAY_STATEMENT_MB=200`, a 20 by 1 TUI grid written: "Worker
  queue failed: memory access out of bounds", no diagnostic naming the statement; at 400 the frame is written). After the
  frame, the run ends in "out of memory (2147483648 bytes, all of it in use)": something after the last statement holds 2 GB.
- **A word method written both with and without parameters, called infix, reads the one without** (`mn (b) => b` and
  `mn => 7`: `qb mn 5`, `qb.mn 5` answer 7's reading, not 5): the decided rule (§21.3, brackets read the one with
  parameters, none the other) takes `mn 5` as `mn` then `5`. Number's `min`/`max` (Ordered's, and Ray's `min =>`) are not
  hit: `2 min 5`, `pv.x min pv.y` answer 2.
- **A level reduces no value by its type** (`Compiler.reduced(Kd(1), { {kd: Kd} => "kind" … })` is not "kind", a number
  or a text neither): `level reducing value` reads the code `value` in the level, and a typed hole asks about that code,
  not its value. UI's `drawn`, `filled`, `shaded`, `shown`, `Lowered` and Geometry's `Solving`/`Projecting`/
  `Approximating` are written so (the user, 2026-10-23: the old Language model; class headers and `as X` instead).
- **A rule led by a hole typed by a class reads nothing where the class's own rules don't read the text** (`{n: Number}
  ~!!~ {m} => …`: `4 ~!!~ 5` is unread; untyped, `{n} ~!!~ {m}`, it reads): a typed hole is checked by the type's own
  rules (Design), and Number's digits are read by a global rule (`{digits: Decimal.String} ^number`), so `4` is no Number
  to a check. String's quotes were global too; String now has them as its own (`"Ray" ^h1` reads by UI.Scene's
  `{styled: String}{ }{`^`}{style}`). A name is a value of a type only when it names the type itself (`named_as`, `v ===
  type`), and only a global one: `box ^h1` with `box` a Shape is no `{styled: Geometry.Shape}`, nor is a value typed by
  a narrowing (`{placed: *{…}}`, `{site: *{…}}`, `{v: *{. == 3}}` on `3`). UI.Scene is made of these.
- **A hole named as a name the body's callees use shadows it there** (`{text: String} => Ph(flow: 5)`: Ph's construction reads
  String's own `text` holes as the reader's; `{styled}` shadowed `.styled`, `{inline}` the flow `inline`): a rule's hole names
  reach every body it calls. Scene's holes renamed `marked`, `inlined`.
- **A list given as an argument beside another is composed into it** (`f(list, x)` is `f(list..., x)`; `[list], x` keeps it
  whole): Compiler.reduced is called by name. A named argument is code read in the callee (`this` there is the callee's): its
  value read into a local first (`program_answered`).
- **In a rule's body, `x.m` after `=>` without brackets binds to the rule** (`{text: String} => text.count` is `(… => text).count`;
  `=> (text.count)` is as meant).
- **A member added to a list's links changes the list** (`.all`, `Colour#`, `==`): the operators' edges are not kept on links;
  a superposition is of `|`'s edge (only `|` makes one), a list `,` made (`spread`) of `,`'s.
- **`(1 | 2 | 3).every(x => x < 4)` is false** (main too); `.all` (a section reduced) is not `== (1 | 2 | 3)`.
- **Program's `{this}()` reads `x()` in a Program method's body as itself** (its `this` untyped): what a program answers is a
  function outside Program (`program_answered`).
- **Tests inside a static class's body run only when something makes it** (Ray.ray RR53 in `Graph.Simple`).
- **CO37 under Program's `+`**: `(Program(code: { 2 + 3 }){O: shouted})()` is 5 at top level, not in Compiler.ray's test block.
- **A member named as one of the rule's holes reads the hole** (`{styled: String} … => x.styled(style)`: `.styled` is the hole,
  not x's method): a name after `.` is x's, never a hole of the rule it is written in. UI.Scene's hole renamed `marked`.
- **A field holding a closure, named bare, is the closure applied** (`(p).reading === None` for `reading: ((s) => …)`, and
  `Program(…, reading: (p).reading)` copies nothing); the closure called, `(p).reading(L)`, is as written.
- **`x.m := v` defines `m` on what x is made of** when x has no `m` of its own and a part of it does (ray-61: `on.made_of :=`
  in `&+=` wrote on the part; fixed there with `external member`).
- **UI.Scene under a Program does not make a scene yet** (`(Program(code: { "Ray" }){O: UI.Scene})()` is the text "Ray", not
  a Box). A level reaches every body its program calls (`level_in` re-reads them all), so Scene's rules apply to UI's and
  Geometry's own code (Box construction) and Scene as a whole runs out of memory on `"Ray"`. Marking rules made while the
  level is in scope (re-reading only those) works on one thread but not with `--threads 26 --target wasm` (CO35–37): the
  level needs to be told which closure is its program. A type check reads without the level. Scene's rules of one hole,
  `{text: String} => Geometry.Box(content: text)`, `{shape: Geometry.Shape} => shape`, `{value: *} => …`, are readers
  (a head of holes only, §: read only where the type's own rules read), so they reduce only through `Compiler.reduced(v,
  UI.Scene)`, which reduces no value by its type (below). Program's call does not reduce its answer by its level either
  (Compiler.ray: "what it gives read by them"). `"Ray" ^h1` goes round: the style's text `h1` is read as code under the
  level, every typed and narrowing hole of Scene checked on it (`1` checked a million times: a check that runs a
  condition is not kept). Site files (`orbitmines.com`'s classes, written in Scene's syntax) are declared before the
  program runs, so the level would not reach them: a level reaching a program's project is still to be designed.
- **`assert Program(code: { … }){O: L}() == x` without brackets around the program is false** where `(Program(code: { …
  }){O: L})() == x` holds (CO35 is written so).
- **The kernel's translation of itself mistranslates statements written on an `if`'s own line** (`if (c) { let p = …;
  while (…) p = …;` on one line: SH6 differs at the first of them); written a statement a line, the same.
- **A class written as a header alone, no block, makes nothing of it** (`Pa := class (x: Number = 1)`: `Pa(x: 2) is Pa` and
  `Pa().x == 1` are false; `class (x: Number = 1) { }` and `=> { }` hold both).
- **`Compiler.folding + x` is not a composition** (`(Compiler.folding) + x` is): ` + x` is read as a method of the member's
  value (found by ray-61).
- **Header defaults given anything (done 2026-10-25, ray-61)**: a call given anything reads its header as a left side; there
  a default, `b = 0`, `s: T = T()`, now declares its place and gives it the default when first asked for, unless it holds a
  value already, and what the call gives replaces it (kernel `apply_`, `assigns`: §6.1 "a value read inside a left side is a
  value", §10.1 "the default, run first and overwritten by an argument given"; the language's own reading of a left side
  gives the same). `Dq(c: 5).s` is a Vq, `Df(a: 5).b` is 6, a default making its own class reads (NA26–NA29). Before, a
  default was read as part of the left side (`Vq()` a call pattern), and reading the header again as code got the take's
  cached places. Still open: given nothing, the header is read as code, in order, so a default reading a field after it
  (`class (a = b + 1, b = 2)`, Shape's `boundary` reading `space`) reads nothing there.
- **A header's default reads the fields before it now** (`class (a = 1, b = a)`): `same_block` takes a header after a word
  or `{` as well as after `:`. Anything wider (every bracket) silently lost a test (Ray.ray's IT11: neither passed nor
  failed).
- **A text joined of three or more is not the text** (`assert "a" + "b" + "c" == "abc"` fails, `"ab" + "c"` holds; numbers
  hold): and, written to a terminal, ANSI.Colored's `as String` (six joined, `";2;" + … + ANSI.digits(this.blue)`) says
  "nothing in what it is read on reads `+ ";" + …`" when Style's `as String` calls it inside a `map` (directly it writes
  `38;2;255;0;0`); a class written in the entry file with `as String => "r" + ANSI.digits(this.red)` writes nothing.
- (fixed 2026-10-24) `class: Parent (fields) { … }` without `=>`: a rule's definition whose body is itself a class (`=> class:
  … => { … }`) is read as that class, never defined: written in brackets. A static conversion naming its class
  (`static (x: T) as (=== Space)`) is that class's `from` now (the class's name is not given it while its block is read).
- **`right-to-left` with names written together defines none of them** (Ray.ray's `right-to-left Σ | ∑ | sum => …`:
  `[1, 2, 3].sum` is not 6, though `sumA | sumB => …` and `right-to-left sumC => …` each work): `right-to-left`'s body
  `{operator} => {body}` is read as a definition whose head is the hole, so the alias rule never sees `a | b`. Inlining it
  (`{{operator}} => {body}`) goes round 6000 deep everywhere; a rule `right-to-left {first} | {others} => …` hangs (a `|` in
  the body after `=>` is taken as the names').

## Language support in the library

- **`String.plural`/`singular` only know English's trailing "s"** (String.ray): a word's plural and singular should come
  from Unicode's (CLDR) plural rules for the language it is written in, not from its last letter. Kept until then.
- **A member a value does not have is read by its `[name]`** (OS.ray: `os.architecture` is `os["architecture"]`, OS.Ether
  ETH10): what has a `[property]` answers any member it lacks by it, so no delegating member is declared
  (`architecture => this["architecture"]`). The miss is said by the engine now ("nothing in what it is read on reads `x`").
- **`!` before any method answering a boolean is its negation** (`a !~= b`, `a !== b`, `a !&& b`, `!exists`): one rule,
  `{a} ![x] {b} => !(a [x] b)`, and the spelled-out duplicates go (`!~=` in the entrypoint and Node.ray, `!==`, Number's
  `!&&`/`!||`, Node.ray's `!exists | ∄`). Waits for operator holes, which the kernel has off (`rule_`: `0 && operator_holes`).
- **A slice by an open range reads nothing** (Ray.ray SL1-SL8: `xs[1..]`, `xs[..<-1]`, `xs[-2..]`, `xs[2..] = 0`): `1..`
  is the unbounded `1 -> 1` and `..<-1` the backward `-1 <- -2`, so `[range: Range]` walks past the end. A range in `[ ]`
  should be counted from the end below zero and stop at it, read and written by the one `[range: Range]`.
- **`~=` is a search loop written by hand** (Node.ray `read_within`): finding a pattern in a text should be the text read
  as `(skipped: *, found: pattern, *)` (`⊢ p` as `(found: p, *)`, `p ⊣` as `(*, found: p)`), the shortest first. Reading a
  text `as` such a structure does not find what is inside it yet (tried: PM1, PM3, S127, W15 and String's `contains`,
  `ends_with`, `words` fail, and one test runs out of memory).
- **`"Ray" @ loc` is not a text placed there (UI230)**: `@ (location) => this ~~ (.location |= location)` had three faults.
  (1) `copy` answered nothing (since .ray3): now Node's `copy` (a fresh node given the value's, its `of` kept), NOD91/92.
  (2) `|=` had no rule, so `.location |= v` was read as a superposition and the Location's members joined the text (its `of`
  both String and Location): now `{name} |= {value} => {name} := either_of({name})(value)` (with `=` it reads itself again
  forever: `=` keeps the code, and `|`'s holes are code). (3) Code in `x ~~ ( … )` is read in x: the parameter `location` was
  the text's own `location` field (renamed `placed_at`). Still open: on a text, `.location = v` sets nothing (`:=` does), a name
  from where `~~ ( … )` is written (`loc`) is not found in a text (in an instance it is), and `.m` in a rule's hole
  (`.location |= 5` through the `|=` rule) is not the `~~` block's. `"W" @ 5` without brackets does not call the method. `@` now sets `.location :=` itself (`|=`'s `.m` is not the block's): `"Ray" @ (6)` is placed,
  a String; given a Location (`"Ray" @ (l)`, l `@https://orbitmines.com`), (that was a probe named `p`, UI's `p {amount} {spaced}`
  padding keyword reading it). What remains: a URL is not read as a Location, `"https://orbitmines.com" as Location` is None
  (Location.ray's header structure, read by `read_as`/`read_into`), so `@https://…` is no Location and Scene's `placed`
  (`.location is Location`) does not take it. Why: a text is no `Char[]` (`"a"[0] is Char`, but
  `"a" is Char` and `"abc" is Char[]` are false; `Char.Word[]`, a superposition of ranges, reads), and Location's header is
  `Char{…}[]`s. Tried: Char a range of every character (`"\0".."\u{10FFFF}"`: enumerated, 6000 deep); Char `is_range` with
  `one_same` true (`"a" is Char` holds, `Char[]` still reads nothing, `{!= ":"}` not checked, every character a range).
  Also: a field holding None is not a place (`t.marked = 5`: "a left side answers a value, not a place"), and at a file's top
  level `u := x ~~ (.m = v)` sets nothing (as a statement it does).
- **`Program(…): T` is no Program answering T** (Choice.ray `choose {type} => Program(name: "choose"): type`; UI239, UI270, CN8):
  `{x}: {type} => external unset x type` takes any left side as a place, so `(Program(name: "choose"): String).name` is unset
  and it is no Choice; Program's `returns` (Program.ray, "`Program(…): T`") is never given. Tried: a rule
  `{typed_program: Program}: {program_returns}` (setting `returns`): it never fires, in a statement, a function's body or
  brackets (the typed hole does not take `Program(…)` written; an untyped one would replace every `x: T`). Nor `{p: *{. is Program}}: {r}`
  or `{c}({args}): {r}`, as a block's statement either: `X(…): T` is a declared call place before any rule reads it (the
  kernel's left side, as with header defaults), and `:` outside brackets binds looser than `=>` (`choose {type} => P: type`
  types the rule), in brackets `name: v` is a named part.
- **A choice inside a list takes the rest of the list** (found by ray-61 bisecting Shape's header): `[1, true ? 1 : 2, 3]` is
  two parts, `[true ? 1 : 2, 3]` and `[1, (true ? 1 : 2), 3]` are right. `,` reads its parts with no `,` in them, so the
  rest after the first `,` is read by `c ? a : b`, its `b` taking `2, 3`. Shape's `boundary: Shape = … ? … : box(size), flow: …`
  takes every field after it (given `content:`, only fields 1–8 hold, so Box has no size). Tried: a rule
  `{condition} ? {yes} : {no}, {rest} => ((condition) ? yes : no), rest` (worse: `[1, false ? 1 : 2, 3][1]` no longer 2).
