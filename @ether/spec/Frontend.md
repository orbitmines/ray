# Ray — Frontend language spec (from `orbitmines.com.ray`)

Status legend: **Decided** · **Open** (not answered yet; nothing is built for it) · from the drafts
review (2026-10-06): **Decided (draft)** (the draft is explicit) · **Q** (needs your decision, with a
recommendation).
Each item gives its question ID, what the draft writes, and what the question is.

Sources: `../orbitmines.com/orbitmines.com.ray/` (`index.ray`, `organizations.ray`, `Article.ray`,
`Almanac.ray`, `profiles/`, `archive/`), cited as *index:line*; the UI drafts carried in
`@ether/ray/Feature.ray` (Geometry, UI, Keyboard; cited as *Feature:line*); `@ether/World.ray:452–467`.

The goal: one description of a page, from which a TUI rendering and an HTML rendering both
follow and are equivalent.

---

## D. The rendering model (asked first: everything else depends on it)

- **F-D1: what the description is.** Candidates: a Ray hierarchy of boxes, where
  `A <.hierarchy B` means A is rendered inside B (*World:463*); or the Program itself,
  rendered by walking its statements.
- **F-D2: what a renderer is.** Candidates: a Compiler level (`Program{O: Render.HTML}`); a
  frontend with an inverse (L§9.1); an `as HTML` / `as TUI` conversion (L§3.5).
- **F-D3: what "equivalent" means.** Candidates: the same tree; the same text in reading order;
  the same interactions (focusable things, links, their order); round-tripping (HTML → description).
- **F-D4: how any value renders by default.** *Feature:432*: a superposition maps (displays all)
  by default, otherwise it is chosen. *World:801*: any object may render as a table.
- **F-D5: alternative renderings.** Are these the `~` entry points of L§4.2 (`Ball~profile`,
  `with Ball = Ball~profile`)? *Feature:487–505*.
- **F-D6: dynamics.** *Feature:525*: events are changes of a variable (`dynamically width`).
  How do resizes, keys and clicks reach the description in each target?
- **F-D7: HTML output.** Static HTML+CSS, or HTML plus a runtime? Does it replace the Next.js
  site in `orbitmines.com/orbitmines.com/`?
- **F-D8: where the library lives.** `@ether/ui.ray` in this repository, or in `orbitmines.com`.
- **F-D9: how a renderer writes out.** Which existing externals (stdout, files); any new
  external needs the user's say.
- **F-D10: the TUI target.** A static print, or a full-screen interactive program (alternate
  screen, keyboard navigation per the Keyboard draft, *Feature:505–520*)?

From the drafts review (2026-10-06). Sources: `.ray2/_todo/ray.ray.txt/Ether/instance/UI/Geometry.ray`
and `…/UI.ray`, cited as *Geometry:line* and *UI:line*.

- **F-D11: plugin and browser targets.** *Geometry:99–103*: "What if a plugin, not a website?",
  `namespace Browser external? url: URL`, direct access to the JavaScript context
  (`external? javascript`). Partly F-D7, F-D9b. **Q.** Recommend: a browser extension is another
  HTML platform level; the page's URL is `@me/device/location`; direct JS access is `$.js` code run
  through the DOM protocol, not an external.
  **Follows (2026-10-06):** a browser extension is another HTML platform level (`UI.HTML.Extension`, beside `Chromium`/`Firefox`/`Safari`); the page's URL is `@me/device/location`; direct JS access is `$.js` code sent through the DOM protocol, not an external. From F-D2 (a renderer is a level), W8 (devices under `@me/device`) and L§8.4/L§9.1 (no externals, so JS is `$.js`).
- **F-D12: knowing a value is being chosen.** *Geometry:105–107, 144, 190*: `if choosing` (this
  variable is being chosen), `if choosing radius`, a placeholder that is the default but is reset on
  clicking choose, `Ball(radius: choose? ?? 5m)` ("Choose + default"). Partly W9, v0
  `Choice.placeholder`. **Q.** Recommend (as Decided text): `x.choosing` is true while x is an open
  Choice; `choose? ?? d` offers a choice whose unanswered value is `d`, shown as the placeholder.
  **Answered (user, 2026-10-06):** yes: the default of a `choose` is its placeholder, `x := choose? Number ?? placeholder`; `x.choosing` while the choice is open.
- **F-D13: constructor code and renderings.** *Geometry:113, 146*: constructor code you always want
  to run; "use return in the constructor … the rendering func". Partly L§4.2, F-D5. **Q.** Recommend
  (as Decided text): statements before the first label run for every entry point (the shared part of
  the constructor); a rendering is the entry point's answer (`Ball~profile()` answers its rendering),
  and the object is still `this`.
  **Answered (user, 2026-10-06):** a class body runs like any function: labels are never skipped. A `Component` class adds that the labels inside are not executed, only entered.
  **Answered (user, 2026-10-06):** later: entering a plain class at a label constructs the whole body, then runs from the label.
- **F-D14: rendering `&`.** *Geometry:150*: how several rendered values are read,
  `"text in between" & "other text in between"`. Extends F-D4. **Q.** Recommend (as Decided text):
  `a & b` (both at once) renders both, layered in one place; `a | b` is chosen (F-D4); `a, b` flows
  (F-B10).
  **Answered (user, 2026-10-06):** `a & b` renders both at once, layered in one place (`|` is chosen, `,` flows).
- **F-D15: a UI library by equivalence.** *UI:1, 4–6*: selecting an Entity filter goes into a
  library and renders its own way "if there's an equivalence for it to Entity code";
  `form global.entity.name: String`. **Decided (draft).** A value renders through the first
  rendering found along its equivalence graph (L§3.5): a narrowing over Entities renders as the
  library's filter widget. A form is a block of declared, unset fields (`name: String`), each
  rendered as its Choice. (Extends F-D4; P8.15 narrowings → inputs.)

From the drafts verification (2026-10-06).

- **F-D16 Fonts that ship** — *`_todo/_download_dependencies.sh:31–64`*: Noto for every script, Noto CJK (Japanese, Korean,
  Simplified Chinese, Traditional Chinese, Hong Kong) and Noto Color Emoji; "Where's the emoji monochrome?" (Noto Emoji has no
  repository, only fonts.google.com). **Q** — Recommend: the default font set is Noto (all scripts, CJK, Color Emoji, and the
  monochrome Noto Emoji for the TUI and plain text), fetched as dependencies (as P7.10) and read by `$.opentype`.
- **F-D17 Host builds and development setup** — *`_todo/_download_dependencies.sh:3–9, 80–146`, `_todo/boot_macOS.sh`*: a
  desktop app (WebKitGTK/Tauri, AppImage, a Windows cross-build with mingw and NSIS), wasm through emsdk, a WebGPU runtime
  (Dawn), tinygrad with clang, and macOS development in a QEMU/OpenCore VM; "Rewrite in Ray, with the cache system in place for
  all the things like the github repos" (*:3*). **Open (tooling backlog)**: none of it is in the spec, and none is dropped.
  Recommend: distribution is the install pipeline (`install.sh`, release builds); a desktop shell, wasm and WebGPU are back ends
  (Compiler levels, F-D) when the frontend needs them; fetching is L§9.1's cache; the macOS VM is a developer note, outside the
  spec.

## A. The site and routing (*index:1–30*)

- **F-A1:** `orbitmines.com() if &entrypoint`: what `&entrypoint` is, and what calling the site
  does (serve HTML? open the TUI?).
- **F-A2:** the two forms of `orbitmines.com := { … }`, fields (`profiles: Profile$`,
  `{*}: Index`) vs routes (`Profile @ /profiles/ x: Profile$ { }`). Is one sugar for the other,
  and which is canonical?
- **F-A3:** `Profile$` maps to `/profiles/<id>` through `Location.url`. What is an item's id
  (the `name` of `class Article (name: String) < name`?), and what renders when several match
  (a superposition)?
- **F-A4:** `{*}: Index` / `Index @ /`: is `/` exact or a prefix, and what does `{*}` catch?
- **F-A5:** the `x` in `@ /profiles/ x: Profile$`: bound in the route's body?
- **F-A6:** names with `-` and `.` (`towards-a-universal-language`, `orbitmines.com`, `fadi-shawki`)
  against the `-` operator and member access.
- **F-A7:** what a route is in the TUI: a path argument, a navigation stack, or both?

## B. Layout (*index:33–75*)

- **F-B1:** `center { … }`: each line is a child, stacked vertically?
- **F-B2:** `f <- { block }` (`center .map(100% * center * .) <- { … }`,
  `Right .map(& px 5) <- { … }`): the block flows into `f` (= `{ block }.f`)? And
  `center {}.map(100% * center * .)`, "equivalent to this" (*index:76*).
- **F-B3:** `100% * center X`, `1 * center`, `1.0 * center`: `*` as a width fraction of the parent?
  Are `100%`, `1` and `1.0` the same?
- **F-B4:** responsive widths `(xl 4/12 lg 6/12 md 8/12 sm 10/12 xs 12/12)` and the smooth form
  `(xl 4/12 -> xs 12/12)`. Where are the breakpoints defined, and what are they in a terminal
  (columns)?
- **F-B5:** units `px`, `pt`, `%`, `1240px`, and `5m` from the Geometry draft: Unit.ray units?
  What is a `px` in the TUI (a cell, a fraction of one)?
- **F-B6:** constraints as narrowings: `{width <= 1240px}`, `Image{width <= 400px}(src, width: 90%)`,
  `{width: 90% & <= 400px}`. A constraint vs an argument; `&` joining constraints.
- **F-B7:** `.map(& px 5)`: `&` adds padding to each child (component addition, `&+`)?
- **F-B8:** the shorthands `px`, `pt`, `mt` against the long forms `margin.top: 5%`, `padding.right`:
  is the shorthand vocabulary part of the language, or a library alias?
- **F-B9:** `Right(DownloadButton, LoginButton())`, and `Center`/`Between` from the Geometry draft
  (`Between (A, B, C) * 1/12, 7/12 * (D, E), …`, *Feature:538*): the alignment containers.
- **F-B10:** `,` against a newline: "div becomes a span" with `.map(,)`, and "span becomes a div
  with `.map(\n)`" (*index:79–84*). Is `,` inline flow and a newline block flow, everywhere?
- **F-B11:** `X{width <= 500px}` written twice in a `{ }`: what `X` is (a placeholder, a
  column?).
- **F-B12:** the prefix form `mt 5 @fadi as Author` / `mt 5 { @fadi as Author }` against the
  argument form `Author(@fadi, margin.top: 5%)` and the narrowing form `{margin.top: 5%}`.

From the drafts verification (2026-10-06).

- **F-B13 Style classes** — *`…/instance/UI/Geometry.ray:74–77, 180`*: `class StyleClass < Ball; &+= Padding.Right(5m);
  padding.right = 5m; radius = 1m`, used as `Ball(radius: 5m) + Padding(5m) + StyleClass + OtherStyleClass`. **Q** —
  Recommend: a reusable style is a set of components and field values added to a shape with `+` (T2), not a subclass of the
  shape; when two styles set the same field the later one wins (L§2.5). Padding as a component is F-B7/F-B8b.

## C. Content (*index:40–60*, `organizations.ray`, `Article.ray`)

- **F-C1:** images: `@./lib/…/logo.png` is an `Image` because of `.png`. How is the class
  chosen from an extension? What does the TUI show: alt text, half-block pixels, or terminal
  graphics (kitty/sixel) when available?
- **F-C2:** text styles: `"…".italic`. How does this relate to `^` highlighting and the `H`
  theme? In the TUI, ANSI italic.
- **F-C3:** `@orbitmines.avatars.map => Link .location{: URL} => .platform.profile_picture`.
  Avatars without a URL are dropped automatically because `Link` needs one (*Feature:436*).
  What is `Link`, and what is it in a terminal (OSC 8 hyperlinks)?
- **F-C4:** `@fadi as Author`, `Author: Player = { }`: `as` renders a value through a class?
  **Follows (2026-10-06):** yes: `as` converts, and a value renders through the first rendering along its equivalence graph, so `@fadi as Author` renders `@fadi` through `Author`'s rendering. From F-D15 (Decided draft) and L§3.5 (lookup walks the equivalence graph).
- **F-C5:** `DownloadButton`, `LoginButton()`: what they do, their state, and how they behave
  in the TUI.
- **F-C6:** an Article's content (`class Article (name: String) < name`, `Book`, `Profile`,
  `Almanac: Book`): what the body is written in (Ray, Markdown, both).
- **F-C7:** `organizations.ray`: the two forms of `@orbitmines` (constructor call vs `: Organization = { }`),
  `@github.@orbitmines` resolving to `@https://github.com/orbitmines` as a superposition of
  aliases, and `@"discord.orbitmines.com"`.
- **F-C8:** the `@` handles (`@fadi`, `@orbitmines`): where they are declared and resolved
  (L§10.7 `@name` lookup, falling back to `@ether`).

From the drafts review (2026-10-06).

- **F-C9: code between rendered text.** *Geometry:179–200*: code in front of a rendering
  (`{dynamic_id}\ Ball(…)`), `{Ball(radius: 1m) Ball(radius: 0.5m)}text in between`,
  `{Ball / radius: 1m ; center}`. Partly F-C6, L§10.1 interpolation. **Q.** Recommend: inside page
  text, `{…}` is code whose value is rendered in place (string interpolation, L§10.1); a label
  before it (`{id}\`) names that element.
  **Answered (user, 2026-10-06):** page text interpolates `{…}` like strings; no `{id}\` labels on rendered elements (not needed).

## G. Geometry: shapes and spaces (`@ether/geometry`, F-D8b)

From the drafts review (2026-10-06). Source: *Geometry:line* as above. v0 has `Ball` as a 2D
box-sized ellipse, `Space.grid(extent, loop)`, `Curve`, `Polygon`, `Fractal`, `Side`, `Shape.fill`.

- **F-G1: n-dimensional Ball and Sphere.** *Geometry:208–236*: `radial_distance`,
  `static Open => static{- surface}`, `static Closed => Ball`, `delegate in Point => this as Point`,
  `boundary: Boundary{∙.radial_distance == radius}`, `interior => this{not border}`,
  `{n}-Ball => Ball{dimensionality == n}`, `{n}-Sphere => {n + 1}-Ball.surface`,
  `Circle = 2-Ball`. **Decided (draft).** A Ball is the points within `radius` of a `centre` under
  the space's metric; `n-Ball` fixes the dimension; `n-Sphere` is the surface of the (n+1)-Ball;
  `Circle := 2-Ball`. `Open`/`Closed` exclude/include the surface; `interior` is the ball without
  its border. Fields not on the Ball delegate to its points (`Ball.color` → `point.color`).
  `radius`, `diameter` and `boundary` define each other circularly; setting any one of them breaks
  the circle (*Geometry:225–226*).
- **F-G2: named spaces and solids.** *Geometry:24–30, 238–265*: `Path | Curve | Line =
  Array.Unbounded`, `curvature`, `static Straight`, `Loop = Array.Unbounded.loop(boundaries: false)`,
  Plane (a square with no boundaries), an `x`D Grid, Euclidean space as a grid with infinite
  divisibility, effective vs actual dimension per point, Cylinder/Torus/Sphere/Cube/Cone, discrete
  circles. **Q.** Recommend Decided: `n D Grid` is `Space.grid`; a looped axis gives a cylinder, two a
  torus; `Plane` is an unbounded 2D space; continuous space is the limit of a grid's divisibility.
  Solids are Shapes over those spaces. `curvature` and `Straight` are properties of a Curve.
  Effective dimension is per point (fractals).
  **Follows (2026-10-06):** `n D Grid` is `Space.grid`, each of whose axes may loop (one looped axis gives a cylinder, two a torus); `Plane` is an unbounded 2D space; continuous space is the limit of a grid's divisibility; solids are Shapes over those spaces; `Straight` is a property of a Curve; effective dimension is per point. From U12 (Geometry), v0's `Space.grid(extent, loop)`, R5.1 (loops) and R1.8/R4.3 (continuous structures come with Geometry).
- **F-G3: direction words.** *Geometry:276–292*: per axis `left <<- previous <- horizontal | x ->
  next ->> right`, `bottom <<- down <- vertical | y -> up ->> top`,
  `behind <<- backward <- depth | z -> forward ->> in_front`; `Center<D>` as
  `(<-D).length == (D->).length` (F-B9). **Decided (draft).** `<-`/`->` are the neighbours
  (`previous`/`next`, `down`/`up`, `backward`/`forward`), `<<-`/`->>` the far ends
  (`left`/`right`, `bottom`/`top`, `behind`/`in_front`); the axes are named `x | horizontal`,
  `y | vertical`, `z | depth`.
  - **Q, F-G3b: which way y points.** The draft's y points up (`up ->> top`); v0's `Side.top` is
    toward −1 (screen coordinates). Recommend: the space's axis states its orientation, and screen
    levels flip y.
    **Answered (user, 2026-10-06):** each Axis states its orientation; Geometry is y-up, and the screen levels (TUI, HTML) flip y.
- **F-G4: edge lengths and discretizing.** *Geometry:5–6, 38–41*: edges decorated with length
  (`elementary_length`), `discretized 1 / m`, conflicting information at discretized points, a
  discretized 2D shape renderable in pixels. v0's graph metric is hop count. **Q.** Recommend
  Decided: a graph space's edges may carry a length (default 1), which its metric sums.
  `x discretized (1 / m)` samples a continuous shape on a grid of that resolution; points that sample
  to the same cell superpose, resolved by the renderer's policy (e.g. coverage).
  **Follows (2026-10-06):** a graph space's edges may carry a length (default 1), which its metric sums along the shortest path; `x discretized (1 / m)` samples a shape on a grid of that resolution, and what lands in one cell superposes, resolved by the renderer's policy. From F-D3 (general solutions), R3.4 (the metric over paths) and L§4.4 (overlaps superpose, a policy resolves them).
- **F-G5: fields over space.** *Geometry:20, 202*: "a point has a color", colour as information of
  each point, which is an approximation. **Q.** Recommend: a per-point value is a function on the
  shape's points (`color: (p: Point) => Color`); `fill` is its constant case, Gradient/Pattern are
  others.
  **Follows (2026-10-06):** a per-point value is a function on the shape's points (`Pointwise := (point: Vector): Color`), and a constant `fill` is its parameterless case; Gradient and Pattern are others. From P5.3/G2.5 (a value per point is a function; a constant is its parameterless case).
- **F-G6: holes, smooth unions, connectedness.** *Geometry:34, 204–206*: holes as negative
  components, `LocallyConnected` (no jumps between neighbourhoods), a smooth join of
  `Ball - Square` at its boundary. Partly T2.4, v0 winding-number `contains`. **Q.** Recommend
  Decided: a hole is a subtracted component (`shape - Ball(…)`); `LocallyConnected` is a narrowing
  on a Space; a smooth join is a component with a blend radius (`a &+ b smoothed r`).
  **Follows (2026-10-06):** a hole is a subtracted component (`shape - Ball(…)`); `LocallyConnected` is a narrowing on a Space; `a &+ b smoothed r` is a join with a blend radius (library). From T2.4/T4.2 (a hole is a subtracted component) and narrowings on Spaces.
- **F-G7: shader output.** *Geometry:1*: translations to GLSL inferred from the types' structure
  (signed distance functions); exact vs approximate equivalences. P4.7 keeps shaders as a note.
  **Q.** Recommend, later: a `$.glsl` level writes a shape as its signed distance function derived
  from its structure; an exact SDF is a `force` equivalence, a bound is `approx` (G7.1).

From the drafts verification (2026-10-06).

- **F-G8 Bounding boxes** — *`…/instance/UI/Geometry.ray:69–72`*: `class BoundingBox // What is bounding box in fractional
  dimensional` with `width: x.length if ==.instance_of 1D`, `height … 2D`, `depth … 3D`. **Q** — Recommend: a bounding box has
  one extent per dimension of its space (members present by dimension, as Types:13's conditional members); in a space of
  fractional or per-point dimension (F-G2) it has the extents along the axes the space has there, and the box of a fractal is
  the box of its points.
- **F-G9 Volume** — *`…/instance/UI/Geometry.ray:246`*: "Things like volume, for the arbitrary space discrete vs infinite (needs
  to be evenly spaced out too when not having discrete effects)". **Q** — Recommend: volume is a measure over the space: in a
  discrete space the count of its points times the elementary size, in a continuous one the integral; a discretised continuous
  space is sampled evenly so the two agree (F-G4).
- **F-G10 Orientation as part of a location** — *`…/instance/UI/Geometry.ray:238`*: "Needs like an example of 2D/3D world with
  yaw/pitch on location, stored as arcs in a continuous space then discretized by some things like elementary lengths". U7 names
  yaw/pitch as a location modifier. **Open (low)**: write the worked example: a location in a 3D world carries yaw and pitch as
  arcs of a continuous circle, discretised as F-G4's spaces are.
- **F-G11 Directions start at the boundary** — *`…/instance/UI/Geometry.ray:283`*: "`.under` etc. needs to go to the boundary of
  this abstract object". **Decided (draft)**: a direction word on an object (F-G3) starts from the object's boundary on that
  side, not from its centre or a point.

## I. Interfaces and controllers

From the drafts review (2026-10-06).

- **F-I1: interfaces and controllers.** *Geometry:43–61, 85–89*: `class Interface < world: World`,
  an interface has an extent into a world, `Window | Browser | Document | ?? < Interface & World`;
  controllers by id (`#{id: Number.Nat}`), a reconnecting device reclaims its id from history unless
  a new device claimed it; a new controller is a guest not yet associated with a character;
  `Keyboard.#0.f2`, many keyboards. Partly W8 (devices under `@me/device`), v0 `Device.pads`, one
  `keyboard`. **Q.** Recommend Decided: an interface is a location with an extent into a world (a
  window/document is both an Interface and a World). Controllers are
  `@me/device/controllers/<id>`; a reconnecting device gets back the id its history shows, unless
  another claimed it. A new controller is a guest until assigned a character. There may be many
  keyboards: `@me/device/keyboard` is their superposition, `…/keyboard#0` one of them.
  **Follows (2026-10-06):** an interface is a location with an extent into a world, so a window or document is both an Interface and a World; controllers are `@me/device/controllers/<id>`; a reconnecting device takes back the id its history shows unless another claimed it; a new controller is a guest until assigned a character; many keyboards are a superposition, `@me/device/keyboard`, with `…/keyboard#0` one of them. From W1.2 (a World is a Location), W8 (`@me/device/<…>`), history (reclaiming an id) and superposition.
- **F-I2: switching the view of a value.** *private-journal `Project - Controller = Keyboard (2026).md:1–79`*
  (paraphrased; the rest is W7 backlog): a trigger switches the view between Many, Array, Graph and Tree. **Decided (draft).**
  That switch is a choice of rendering level over the same Ray, not a change of the value. The rest
  of the controller design is W7's.

---

## Decided

Answers from 2026-09-30. Each is removed from the open list above only in effect: the open
entry stays as the record of the question, and this section overrides it.

- **Scope.** The whole of orbitmines.com is implemented this way, as the example of TUI/HTML
  rendering. 2D/3D/PDF rendering comes later, not now.
- **F-D1.** Both, as two levels, and they are the same thing: the page's Program is the
  description; at a render level it reduces to the box hierarchy. HTML and TUI are further
  levels below that.
- **F-D2.** A renderer is a Compiler level: `page: Program{O: Render.HTML}`,
  `page: Program{O: Render.TUI}`.
- **F-D3.** Equal as much as possible. Where a target can't show something, the difference is
  handled by a general solution, not a special case. For example, an image in the TUI is
  sampled and printed as text, with the same styling.
- **F-D10.** The TUI is interactive from the start.
- **F-D7.** Both: a Ray runtime in the browser (development) and static HTML+CSS+JS
  (production). Whether the JS is plain JS or React is a choice between compiler levels that
  compose, e.g. `.JS + .React`. Plain JS is fine for now. Both must work.
- **F-D8.** A separate UI project underneath `@ether`, isolated: `@ether/ui/` with its own `.project.ray`.
- **Platforms.** Linux/macOS terminals, Windows terminals, all major browsers, and capabilities
  that degrade. The TUI can also run in the browser, as an optional setting. Native control of
  each terminal is wanted. Platform differences are compiler levels, or several composed into
  one that accounts for every quirk. **Platform code doesn't appear in the default code**,
  most of the time.
- **F-C1.** An image in the TUI is ASCII art, coloured: a luminance character ramp combined
  with colour per cell, as one general sampler (image → characters + styles).
- **F-D9.** One byte-stream external: bytes in, bytes out. Raw mode, terminal size, key
  decoding, ANSI and file writing are written in Ray on top of it, as platform levels.
  (v0 has no IO external yet. Show the user the exact declaration before adding it.)
- **F-D5.** Alternative renderings are the `~` entry points of L§4.2: labels in the class body
  (`card\`, `page\`), `Profile~card(@fadi)`, `with Profile = Profile~card { … }`.
- **F-D6.** Events are variables that change (`width`, `Keyboard.f2.toggled`,
  `Mouse.position`); `dynamically` re-evaluates what depends on them. The default code has no
  callbacks.
- **F-D4.** A value with no rendering of its own renders its fields as a table/tree. A
  superposition always renders through `@me.choose` (W9) (Decided 2026-10-06; it no longer shows all
  its values by default). To show all values, write them as a list, e.g. `xs#.map(…)`.
- **F-A2.** Fields are canonical: a website can be built out of any class.
  `profiles: Profile$ @ /profiles/`, where `@` only specifies its Location. That Location is
  the path, and it overrides the default URL conversion.
- **F-A1.** What running the site does depends on the level in scope. It is written
  `orbitmines.com() if &entrypoint`, where `&entrypoint` is a function on Program (corrected on
  2026-09-30, `Universal.md` U4; an earlier answer said `.entrypoint`).
- **F-A7.** In the TUI, navigation is the keyboard moving the selection through the hierarchy
  only. Paths exist but aren't shown.
- **F-A6.** A declaration `towards-a-universal-language := …` declares the whole spelling as the
  name, and longest match makes it that name instead of the `-` operator. This should already
  work; if it doesn't, it is a bug in longest match, not a new mechanism.
- **F-B10.** The separator is the flow. Newline-separated children stack vertically;
  `,`-separated children flow inline. `.map(,)` / `.map(\n)` re-join the children with the other
  separator, which switches the flow.
- **F-B2.** `Right .map(& px 5) <- { … }` means `Right { { … }.map(& px 5) }`: the block goes
  through the map, and the result is the block given to `Right`. `Right` (like `center`) accepts
  an arbitrary block.
- **F-B3.** `n * X` gives X that share of the parent's width; `100%`, `1` and `1.0` are the same
  share, and `4/12 * X` is four twelfths. In the TUI the share is of the columns.
- **F-B4.** `(xl 4/12 -> xs 12/12)` interpolates by the container's width. `->` is by default the
  recursive step (L§5.2), and here it is used to say "interpolate by width". The explicit
  breakpoint list stays allowed.
  - **Open, F-B4b:** what selects the interpolation reading of `->` here: the operands' types
    (breakpoint-sized values), or the context (a width position)?
    **Decided:** the operands' type. A breakpoint-qualified size defines its own `->`, which
    overrides the default recursive step.
- **F-B6.** Everything is narrowing. `{width <= 1240px}`, `(width: 90%)` and
  `{width: 90% & <= 400px}` are different ways of writing the same thing: types that constrain.
  The constraints leave one solution, so the layout must take that form. This is what HTML/CSS
  already means, only not implemented that way.
- **F-B5.** Units are Unit.ray quantities (`px`, `pt`, `em`, `%`, `m`). The platform level
  decides what a unit is in its target (a CSS px in HTML; a fraction of a cell in a terminal).
- **F-B8.** The core is **geometry**; the frontend library is a geometry library (2D, and 3D
  later). There is no margin/padding distinction at the core. Spacing says from which shape
  the additional space is required: from the border, or from the shape itself.
- **F-B6b.** Ray solves the constraints: a language-side solver, which the TUI needs anyway.
  A level may delegate: the HTML level may translate a constraint into CSS where CSS expresses it
  exactly (max-width, flex), as an optimization rule, and use solved positions otherwise.
- **F-B8b.** Spacing is a component added to a shape (`+ Padding…`), and adding it leaves the
  shape what it was: a Ball with padding is still a Ball. The preferred notation is the
  `pt 5` form.
- **F-B8c.** The Bootstrap-like shorthands (`px 5`, `pt 5`, `mt 5`) stay, as a library over the
  core. They are the preferred notation (F-B8b).
- **F-D8b.** Two projects: `@ether/geometry/` (shapes, space, constraints and the solver) and
  `@ether/ui/` (render levels, input, platforms), which depends on Geometry.
- **F-B9.** The alignment words are narrowings on position. `center` means equal space on both
  sides (the draft's `(<-D).length == (D->).length`), and `between` distributes the remaining
  space. Each accepts any block and works per dimension. They are **lower case and
  `^keyword`**: `center`, `right`, `left`, `between`.
- **F-B12.** The prefix, block, argument and narrowing forms are all equivalent code, because
  Ray already reads them as equivalent. The canonical form is the shortest one; confirm with
  the user which one that is before writing the site.
- **F-B11.** `X` was only an example. Nothing to build.
- **F-C2.** Styling in general runs on the same infrastructure as highlighting. When something
  is marked `^italic`, the editor picks it up and shows it italic too. Make it as general as
  possible.
- **F-B12b.** Canonical: `pt 5 @fadi as Author`.
- **F-C2b.** `"…" ^italic` is canonical, and `"…".italic` is supported too. It is a general rule
  on String, since a String is text.
- **F-C3.** No `Link` component: a location (`@https://…` and the like) renders as a link by
  default. `@orbitmines.avatars.map => .location{: URL} => .platform.profile_picture` is enough.
  (2026-10-06: avatars are names, locations like `@github.com/@orbitmines` — the `@` segment marks a character on the platform, `@github.com/package` is a package — so `@orbitmines.avatars` is already the list of locations to render.)
- **F-C5.** `DownloadButton` and `LoginButton` were examples. Components like them come from the
  orbitmines.com library in that repository, not from UI.
- **F-C6.** Articles, the Almanac and profiles are pure Ray: every paragraph, heading and
  reference is a Ray value. Long texts are multiline strings, where the text really has line
  breaks.
- **F-C7.** The second form: `@orbitmines: Organization = { avatars: | @github.@orbitmines | … }`.
  An avatar's URL comes from the platform's alias (`@github.@orbitmines` →
  `@https://github.com/orbitmines`).
- **F-C8.** `@name` looks up the project, then its dependencies, then falls back to `@ether`
  (L§10.7). `@github` is a platform declared with its URL alias rule. For now the orbitmines.com
  repository hardcodes its players and organizations; a database comes later.
- **F-C1b.** A location's extension names its language/format (`$.png`, like `$.ray`, L§9.1),
  and the format declares the class it reads to (`Image`). `.ray` and other files are read by
  the same mechanism.
- **F-A3.** The id is the name (`class Article (name: String) < name`). When several match, a
  chooser renders. Later there will be a preferred one (for example the first or the most
  active), so leave room for that; which one is decided later.
- **F-A4.** `/` is the site itself: the site class's own rendering (Index). `{*}` is every path
  no field claims, and it renders Index too.
- **F-B7.** In `.map(& px 5)`, `&` would mean mapping over `&`, a superposition. What's meant
  here is component addition, so write `+` or `&+`: `.map(&+ px 5)`.
- **F-D7b.** The development runtime is the TS interpreter bundled for the browser, as the LSP
  bundle is.

## Answered later (2026-09-30)

- **F-A5** The route binding `x` is not needed: `/profiles/<name>` selects from `profiles` by its identity (F-A3).
- **F-D9b** The browser runtime reaches the DOM over the same byte-stream external, through a protocol
  written in Ray; the browser side is a small fixed host shim.
- **F-D10b** TUI keys follow the Keyboard draft: ↑/w ↓/s ←/a →/d move (pulsed), ctrl skips groups, shift
  expands the selection, enter activates, f2 toggles.
- **F-P1** First platform levels: xterm-256color/truecolor (Linux, macOS), Windows Terminal, Chromium +
  Firefox, and the TUI in the browser.
- **F-S1** Port order: index → profiles → archive → Almanac. Components (download/login buttons, header,
  paper layout) move into the orbitmines.com library as each page needs them.

## Answers 2026-10-04 night (site port questions)
- Classes are written `Article := class: Reference { … }`, never `class Article …`. A class's content (its block's lines) is read as its children: that is the point.
- A bare URL after `@` reads until whitespace, so a comma after it needs a space (` , `). Acceptable.
- `\` is the escape character in strings (`\"`, `\{`).
- `with X = Y { … }` works. `X = Y { … }` extends the class Y with those values.
- `a, b if c` is `a, (b if c)`: no brackets needed.
- `.@{handle}` works (an avatar on a platform).
- `.index` is available by default (the position); `- Ray` excludes the Ray, so `.index` is the entry's own index (see the Almanac).
- `Reference~simple(…)` is right for alternative renderings.
- Authors are written `@name`. `@ether` is the Ether organization (they are the same thing). Names are reserved and mapped ignoring case.

## Decided 2026-10-06 (renderers are Ray's, the languages they write are from outside)
- `$/<name>` holds only the outside language itself: its syntax, its reading and writing levels, its API values and its own tests. Anything specific to Ray goes in the Ray library. The renderers are Ray's own, so they are in the UI library. The web renderer is `UI.HTML` (`@ether/ui/HTML.ray`), named after its target ("web" is not a language). It renders a scene into an HTML document with its stylesheet and script (`UI.HTML.Markup`, `UI.HTML.Style`, `UI.HTML.Script`, packaged by `UI.HTML.level` as `UI.HTML.Package`); the DOM protocol is `UI.HTML.DOM`. It writes the languages `$.html`, `$.css`, `$.js` and `$.json`.
- The terminal renderer is `UI.TUI` (`@ether/ui/TUI.ray`): a scene drawn into cells (`UI.TUI.Cells`, `UI.TUI.level`), its input, its `Target` and the `Terminal` device. It writes `$.ansi` (the escape sequences in both directions, the keys and mouse reports it reads included, the xterm 256-colour and Windows Terminal levels), and draws images through `$.sixel` and `$.kitty`.
- `Language.Direct`, Ray's own raster drawing, stays in the core UI. The formats it reads are outside: fonts through `$.opentype`, images through `$.png` (with `$/zlib` and `$/deflate` under it).
- A frontend picks its renderer by its level: `page.rendered(UI.HTML.level)`, `page.rendered(UI.TUI.level)`.
- `@ether/ui` bundles the languages its renderers write: its `.project.ray` lists `@html`, `@css`, `@js`, `@json`, `@ansi`, `@sixel`, `@kitty`, `@opentype` and `@png`, which stay at `@ether/$/<name>`. Renderer claims are in `@ether/tests/app` (`ui_html.ray`, `ui_tui.ray`); pure-language claims are in each language's own `tests/`.
- A share (`50%`, the Number 0.5) in a length field is that share of the parent's available size on that axis, bounds included (`{width <= 50%}`); Solving resolves it and the web writes it as a CSS percentage. A share radius is that share of the shape's own size (`radius: [50%]` is a circle).

