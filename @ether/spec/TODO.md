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
- **A rule `@word` then a literal then a hole does not match** when the literal is `/` or a space: `@yo/{p: Char.Word[]} =>
  p`, `(@yo/x)` and `@ye {p} => p`, `(@ye x)` are unread (`nothing reads @yo/x`); `@yd:{p}` and `qq/{p}` match. Every
  location literal (`@a/b`, `@/etc/hosts`, `@./a`, `@https://…`, Location.ray 141–150) and `@me/{path}` (`@me/quests`,
  `@me/device`, `@me/policy`) are unread for it.
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
  for now each project is tested with only what it depends on.

## Tests to take in

- **Control.ray's tests of the language's own forms** (operator sections OP1–OP5, `if` with cases IC3, `?`/`?=` QM1–QM2,
  `is` with `#` IS4–IS6): they test what the bootstrap defines, and belong there.

## Reading programs by structure

- **Program.ray reads statements by their text** (`is_jump => .code ~= ⊢"goto "`, `is_label`, `jump`, `head`, `assigns`,
  `writes`, `declares`, `precedence`): a parser written beside the language. What a statement is should be what the reader
  read it as (Expression.ray's statements: a jump, a label, a declaration and its head), asked of the statement.
- **`@me/device/os` in the bootstrap** (Node.ray IO3, Ether.entrypoint.ray's `threads` default): the OS is one of the
  devices `@me/device` superposes, selected by its type, `(@me/device as OS)`.
