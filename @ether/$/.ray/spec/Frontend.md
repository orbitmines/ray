# Ray — Frontend language spec (from `orbitmines.com.ray`)

Status legend: **Decided** · **Open** (not answered yet; nothing is built for it).
Each item gives its question ID, what the draft writes, and what the question is.

Sources: `../orbitmines.com/orbitmines.com.ray/` (`index.ray`, `organizations.ray`, `Article.ray`,
`Almanac.ray`, `profiles/`, `archive/`), cited as *index:line*; the UI drafts carried in
`v0/Feature.ray` (Geometry, UI, Keyboard; cited as *Feature:line*); `v0/World.ray:452–467`.

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
- **F-D8: where the library lives.** `v0/UI.ray` in this repository, or in `orbitmines.com`.
- **F-D9: how a renderer writes out.** Which existing externals (stdout, files); any new
  external needs the user's say.
- **F-D10: the TUI target.** A static print, or a full-screen interactive program (alternate
  screen, keyboard navigation per the Keyboard draft, *Feature:505–520*)?

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
- **F-C5:** `DownloadButton`, `LoginButton()`: what they do, their state, and how they behave
  in the TUI.
- **F-C6:** an Article's content (`class Article (name: String) < name`, `Book`, `Profile`,
  `Almanac: Book`): what the body is written in (Ray, Markdown, both).
- **F-C7:** `organizations.ray`: the two forms of `@orbitmines` (constructor call vs `: Organization = { }`),
  `@github.@orbitmines` resolving to `@https://github.com/orbitmines` as a superposition of
  aliases, and `@"discord.orbitmines.com"`.
- **F-C8:** the `@` handles (`@fadi`, `@orbitmines`): where they are declared and resolved
  (L§10.7 `@name` lookup, falling back to `@ether`).

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
- **F-D8.** A separate UI project underneath `v0`, isolated: `v0/UI/` with its own `.project.ray`.
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
- **F-D8b.** Two projects: `v0/Geometry/` (shapes, space, constraints and the solver) and
  `v0/UI/` (render levels, input, platforms), which depends on Geometry.
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

## Decided 2026-10-06 (renderers are languages from outside)
- The web renderer is the HTML language itself, the project `$/html` (2026-10-06: `$/` folders are named after languages, and "web" is not one). Rendering for the web is writing Ray UI values as HTML: `$.html.level` renders a scene into a document with its stylesheet and script (`HTML.Markup`, `HTML.Style`, `HTML.Script`, packaged as `HTML.Package`), and the DOM protocol is `HTML.DOM`. The stylesheet and script are values of `$/css` and `$/js`, with `$/json` for structured data.
- The terminal renderer, `Language.TUI`, is the project `$/tui`. It writes through `$/ansi` (the escape sequences in both directions, the keys and mouse reports it reads included, the xterm 256-colour and Windows Terminal levels, `Terminal`), and draws images through `$/sixel` and `$/kitty`.
- `Language.Direct`, Ray's own raster drawing, stays in the core UI. The formats it reads are outside: fonts through `$.opentype`, images through `$.png` (with `$/zlib` and `$/deflate` under it).
- The core UI names none of them. A frontend picks its renderer by `$.html` / `$.tui`, or by depending on the project.
- `v0/UI` bundles them: its `.project.ray` lists `$/tui`, `$/html`, `$/css`, `$/js`, `$/ansi`, `$/sixel`, `$/kitty`, `$/opentype` and `$/png`, which stay at `v0/$/<name>`. Depending on `@ether/UI` loads every renderer; `$/html` and `$/tui` depend back on `@ether/UI`, and that cycle loads once.
- A share (`50%`, the Number 0.5) in a length field is that share of the parent's available size on that axis, bounds included (`{width <= 50%}`); Solving resolves it and the web writes it as a CSS percentage. A share radius is that share of the shape's own size (`radius: [50%]` is a circle).

