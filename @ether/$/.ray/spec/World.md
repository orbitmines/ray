# Ray — World, features and editor spec (from the comments in `World.ray` and `Feature.ray`)

Status legend: **Decided** · **Open** · **See L§n / G§n**.
IDs `W…`. Answers go under **Decided** at the end.

---

## W1. Names and worlds (*World:1–90, 344–380*)

- **W1.1 Persona vs Character** — v0 renamed the draft's `Character` (the player) to `Persona`, because `Character` is a
  text character. Open: keep `Persona`?
- **W1.2 Location < World** — *World:345–346*: as composition, not "Location has world"; or every location is a World.
- **W1.3 Name fallback** — a name not defined in a world falls back to it (then `@ether`).
- **W1.4 Allocating names** — *World:353*: allocate a name within your access to another character (`x@gmail.com` allocated by
  Google, issuer `@me`, for the world `@ether`).
- **W1.5 Many worlds in a structure** — `< World` at many places; `.worlds`/`.characters` iterate that structure.
- **W1.6 Dynamics** — on the world, or a separate composition.

## W2. Entities, instances, personas (*World:208–260, 381–442; Feature:264–340*)

- **W2.1 Entity identity** — `==` on Entity/Instance checks the public key. Compromised keys: redistribute by a version log of
  who had access; private servers mustn't be compromised because players imitate access.
- **W2.2 Instance** — `Instance < Location, URL | DomainName | IP | Socket.Address`; localhost locally, an IP elsewhere.
- **W2.3 MAC address** — `confidential.read none.write mac_address: Binary⁴⁸`, from an external or random with the multicast bit.
- **W2.4 Spawn/login/logout/swap** — the entrypoint drafts: `spawn(player)`, `login` adds to a registry; logout with
  `delete_all` schedules deletion with a cancel window; discard private keys at once.
- **W2.5 Local co-op** — one entity hosting others; the second player sets things on `.host`.
- **W2.6 Status** — Online/Offline, Idle/DoNotDisturb/Busy, extended status; invisible = offline read.
- **W2.7 Sharded character** — remote storage beyond what the central server allows.
- **W2.8 Remote execution** — run code as a character; "run as an unauthorized character by creating a new one".
- **W2.9 Mirrors** — selected on another instance (primary); a mirror of X for my Y; when a mirror syncs, how deep.
- **W2.10 Timed challenges** — messages to be decoded as challenges.
- **W2.11 `@me.choose`** — different from `choose`.

## W3. History and version control (*World:145–180, 294–324*)

- **W3.1 History = chain of commits** — each by a persona with a version id. L§9.2 decided HLC-stamped operations over
  definitions with rename-preserving identity.
- **W3.2 Git both ways** — a history conversion to git.
- **W3.3 Staged = local visibility** — uncommitted and staged changes are visibility set to local/private.
- **W3.4 Assignment carries history** — the `.=(value)` edge carries where the value came from; default `=` checks histories
  and raises merge conflicts as quests; keep the variable's own history vs the value's.
- **W3.5 Type conflicts are merge conflicts** — in distributed databases.
- **W3.6 Granularity** — a lower bound for the repository (not individual bits of characters); "character level is the lowest
  for String, otherwise every class is a repository".
- **W3.7 Approximate values** — a Bloom-filter-like distributed approximation ("I don't mind an approximate value").
- **W3.8 Squash, cherry-pick, new repository from here**.
- **W3.9 Generic-type versioning** — *World:297*: store that a silent generic type was used; alert when a variable of that name
  appears.

## W4. Quests, items, references (*World:88–144, 186–206, 325–343*)

- **W4.1 Quests** — goal, steps, completion; difficulty and effectiveness ratings; "there could still be a continuation, how to
  know we're done". Gamification.md decided quests are reachability.
- **W4.2 Consistency requirements** — *World:333*: "I've communicated with these replica servers before this calculation"
  (strong consistency); offline players.
- **W4.3 Items** — issued by a world, need quests to find; how it is made, discovered, constructed; perspective on an object;
  minimaps.
- **W4.4 References** — title, author, date, draft, link, notes; claim authorship of a dummy reference; published = who hosts it;
  a pointer (page); `as Renderable`; a remote ref over the network.
- **W4.5 Procedural generation** — `class Room { 4 Wall{a Door, 50% Window}, 1..3 Bookshelf{against a Wall} … }`,
  `choose Room{4..5m x 5..7m}`: counted types, `a`/`an`, relational constraints (`against`, `next to`).

## W5. Access (*World:182–188, 474–497; Accessor*)

- **W5.1 Levels** — READ/WRITE/EXECUTE; `confidential`, `internal`, `public.read`, `none.write`; `default_privacy_policy`. L§8.3.
- **W5.2 A block of permissions** — put everything in a block under one permission.
- **W5.3 Access to `**`** — "Default `public.read` doesn't allow access to `**`, but what would?"
- **W5.4 Derived data** — L§8.2 (`local` mark).

## W6. Features (*Feature.ray*)

- **W6.1 IO** — `File = Byte[]`; paths relative to the instance directory; `..` can't leave the top (only symlinks); lazy file
  programs (only compiled if read); `{field}.ray.txt`, then a directory, then a file; `IO /path as String`; mirrors; `%=`
  shadowing = components with `&+`/`+`. L§10.6. And F-D9 decided one byte-stream external.
- **W6.2 Random** — `secure`, `seed`; where the probability is stored.
- **W6.3 Choice** — `()` on a constrained type chooses; `Number{choose}`; `choose 50%`; `1/2 Number`; `choose{unique}`;
  `dynamically` choose; `choose` uses `===` and maps once.
- **W6.4 Proof** — equational reasoning; assumptions outside vs inside a function; externally used variables are assumptions;
  a failed proof starts a quest (or not); sub-proofs; a Lean library; proof by contradiction; theorem/lemma/example graph.
- **W6.5 Transaction** — revert a specific commit when the graph changed since; record the version; roll back `&=`.
- **W6.6 Network** — protocols with default ports (ether 37839); URL grammar; `Port = Decimal{< 2^16}`; sockets; a hosts table as
  equivalences (`"ether".ignore_case => "ether.orbitmines.com"`); DNS history checked against stored public keys;
  `Node.Remote`; `< @https://…` imports; proxies (all traffic or a block; per user); the version handshake.
- **W6.7 Streaming** — a player's streaming location; watching = following that location.
- **W6.8 Update** — `IO / = ETHER@ETHER/instance`; merge conflicts; reload in memory with diffs (a renamed field keeps working).
- **W6.9 OS** — `OS.name` from an external; per-OS files that `return if OS.name != "Linux"`.
- **W6.10 Keyboard** — `pulsed (max: 20/s, delay: 1s)`, `toggled`, `cycle`, `as boolean` if pressed. Now also F-D10b.
- **W6.11 Chat** — a chain of messages from personas; "only what changed since last seen".

## W7. The editor (the journal part of Feature.ray, *Feature:760–863*)

These are the Ether IDE's. Open: which of them belong in a spec now (vs later, with the IDE)?

- **W7.1** Code ↔ English at a chosen level of description; operate on a selection by naming the operation.
- **W7.2** Ambiguity resolved in the editor and remembered; warn when re-writing an existing isomorphism.
- **W7.3** Tests collapse inline; a timing button per function; a version selector per function; versions intermingled.
- **W7.4** Cursor movement rules (column memory, end-of-line stickiness, ctrl+up/down scrolls); goto labels outdented one space;
  `((` asks for `((` + tab.
- **W7.5** Eye tracking picks the active pane.
- **W7.6** Search inside results as an undoable program.
- **W7.7** Encrypted text edited as plain text; custom symbols.
- **W7.8** Icons generating other formats; any object as a table; conditions on a source file (sorted classes).
- **W7.9** Unbound controls offered; structures bound to controls; one key shows every orbit; a slider over levels of description.
- **W7.10** Drawing graphs (lines invisible until hover); mouse locks to the nearest structure; a non-100%-wide interface isn't a
  box but whatever shape fits.
- **W7.11** An explorer that wanders, reminds, and works while nobody does; replay.
- **W7.12** Conditional inclusion by access (paid videos).
- **W7.13** Proofs and tests as one mechanism; tactics expand and fold.
- **W7.14** Apps installed into the browser; beginner setups; colour as a frequency filter; generated 2D/3D modelling; modular
  interfaces.

---

## Decided

Answers from 2026-09-30.

- **W1.1** Text characters are `Char`, and players/NPCs are `Character`. `Persona` is renamed back to
  `Character`, and the text class `Character` becomes `Char`.
- **W1.2** A World is a Location (composition): a location with rules, and any location can be made a world.
- **W3.2** Git import/export, as a frontend with an inverse, is part of L§9.2's first milestone.
- **W7** The editor notes are the IDE's backlog (2027); they are not implemented in v0.
- **W2.1** `==` on characters and instances compares public keys, now. Key compromise and rotation later.
- **W2.4** Spawning, login/logout/swap and deletion with a cancel window are implemented now, from the
  entrypoint drafts.
- **W6.4** An error that fails the program is, in general, a quest; a failing proof is one such case.
- **W6.6** All of the networking now (protocols, URL grammar, hosts as equivalences, DNS history checked
  against public keys, proxies, the version handshake), in a **separate project**, so it is isolated and
  can be excluded.
- **W6.1** IO is sandboxed: `IO /path` is inside the instance directory, `..` can't leave the top
  (symlinks can), and the host filesystem is reached only via `confidential IO.os /path` when permitted.
- **W6.1b** A path naming a field is looked up as `{field}.ray`, then a directory `{field}`, then a file.
- **W3.3** Staged/uncommitted changes are visibility set to local/private; publishing raises visibility.
- **W3.6** Every class is a repository; String's lowest level is the character.
- **W4.5** Counted types (`4 Wall`, `1..3 Bookshelf`, `a Table`) now; spatial relations (`against`,
  `next to`) as Geometry narrowings once `v0/Geometry/` exists.
- **W5.3** Access to a value's program is `@public.read` on `**`: visibility is recursive.
- **W6.10** The Keyboard API is the draft's (`pulsed (max: 20/s, delay: 1s)`, `toggled`, `cycle`,
  `as boolean` when pressed), with keys as `dynamically` variables. It is also the TUI's input.
- **W2.6** Status is one superposable enum: `@me.status = Online & Hosted & Idle`.
- **W1.4** Allocating names now: `@google.@x = @someone`, where the issuer is whoever owns the namespace.
- **W2.9** A mirror is the same variable at another location (`x @ @me.managed`); sync depth is a setting
  of that location.
- **W3.4** Assigning a value that has a history keeps both, linked: the `=` edge carries the value's
  history, and conflicts become merge quests.
- **W3.7** "An approximate value is fine" is an uncertainty type (`likes: ≈Number`, as N4.10); the store
  picks an approximate encoding.
- **W4.1** Quest difficulty and effectiveness ratings come with Gamification; quests are reachability now.
- **W4.2** A consistency requirement is a narrowing on the read's location: `x @ {replicas.every(.synced)}`;
  offline replicas make it a quest.
- **W4.4** References port the site's `references.ts` fields into a class `Reference`; authors are
  Characters (`@fadi`).
- **W6.3** `()` on a constrained type chooses (`Number{> 5}()`), and `dynamically choose` may change later.
- **W6.5** A transaction is a history branch: commit merges it and abort drops it. Reverting a change
  applies its inverse to the current state (L§4.5).
- **W6.4b** Propositions, proofs and theorems as quests now; Lean comes through the Ether Library.
- **W6.7** Streaming is kept (watching = following a player's streaming location), with networking.
- **W6.8** Update (`IO / = ETHER@ETHER/instance`) is an ordinary assignment to a location with merge
  quests, built now in the networking project.
- **Covered elsewhere:** W7.1–W7.14 (W7: the IDE backlog), W2.11 (Almanac A9).
- **W1.3** A name not defined in a world falls back to the world's parent, then `@ether`, unless the world
  explicitly maps it to None (which many platforms will).
- **W1.5** `x.worlds`, `x.characters` iterate everything of that kind within x (`World$ @ x ->`). Databases
  only optimize this; they add nothing else.
- **W1.6** A world's dynamics are a component: `+ Dynamics`.
- **W2.2/W2.3** Instance (a Location that is URL | DomainName | IP | Socket.Address, localhost locally) and
  the MAC address (from an external, or random with the multicast bit) go into the networking project now.
- **W2.5** Local co-op (several players on one machine) now, with the W2.4 sessions.
- **W2.7** A sharded character is stored across locations (`@me @ @me.managed | @ether`, U7).
- **W2.8** Remote execution as a character, and running code as a fresh unauthorised character, come with
  the networking project.
- **W2.10** Timed challenge messages (proving presence) are kept, with networking.
- **W3.1** One history mechanism: `x%` for any value, HLC-stamped (L§9.2); definitions are its first
  milestone.
- **W3.5** Type conflicts between versions are merge conflicts, resolved by patches and migrations.
- **W3.8** Squash, cherry-pick and "new repository from here" are all kept.
- **W3.9** A silent generic type used in a function is remembered, and a diagnostic fires when a variable of
  that name later appears.
- **W4.3** The Item class now; how items are made and discovered, perspectives and minimaps, with Gamification.
- **W5.1/W5.2** There is one permission: access to a method. `.read`/`.write`/`.execute` are sugar: write
  is permission on `=`, execute on `()`, read on the structure or any other method. A block applies one
  permission to everything in it (`@private { … }`).
- **W5.4** Visibility is inherited by derivatives: data derived from `@local` data stays `@local` (L§8.2).
- **W6.2** A distribution's probabilities live on the superposition's edges (U8); `seed` is a `with` setting
  and `secure` names a cryptographic source.
- **W6.9** An OS is a platform Language level (`Language.linux`, …), composed with the target; per-OS code
  lives there, not in the default code.
- **W6.11** Chat later.

Answers from 2026-10-05.

- **W8** Devices are locations under `@me/device/<…>`: the clipboard (`@me/device/clipboard`; copy writes it,
  paste reads it), pads, orientation, motion, geolocation, the preferences (reduced motion, dark, contrast,
  focused), capabilities, notifications, fullscreen, printing and opening a location elsewhere are typed reads
  and writes there, backed by the platform. `@me` is from the computer's perspective: without a character on
  the chain it is the machine. In a session that runs as the user, `@me` is the player, and `@me/device` is
  answered by the computer's `@me`, its answer flattened into the player's. A remote device is
  `@some-remote/device/<…>`. IME composition is not a device field but a String with a `^composing` mark.
- **W9** `choose` always resolves through `@me.choose`; only who `@me` is differs. A player gets a chooser (a
  `Choice` over the possibilities); the computer itself picks (weighted at random). It has one form, `choose T`:
  `choose 1 Number` and `choose 50% boolean` need none of their own, since `1 Number` and `50% boolean` are
  already types (through `#.count`), chosen like any type.
  Rendering a superposition goes the same way. The computer's `choose` is defined once, on its device; an
  instance flattens its device into itself.

Answers from 2026-10-06.

- **W3.10** There is one history API, `History`. Git and every other backend read into it and write out of it (L§9.2).
  W3.2's "frontend with an inverse" is a backend Language, with a `level` (read) and a `written` (write).
- **W3.11** The backends are Git, Mercurial, Fossil, Pijul and Subversion, plus Ray itself (`$.ray`, the `.%` form).
  Each says whether it is `lossless` or `snapshot`. A snapshot backend keeps the operations beside its commits, so
  our own repositories read back exactly. Foreign ones are read by diffing trees, and a rename that cannot be decided
  is a quest.
- **W3.11b (2026-10-06)** For now, the Mercurial, Fossil, Pijul and Subversion backends, with the languages only they use (SHA3, MD5, BLAKE3, Bincode, Zstd, Base32) the unused SHA-512 and Blowfish, the SARIF, TAP and JUnit report formats (LSP stays), the permission backends (POSIX, ACL, Android, browser permissions; a grant is recorded, not enforced on the platform) with XML, the SQL stores (SQL, SQLite, Postgres) and the terminal image protocols (Sixel, Kitty; images are drawn as text), are on the branch `version-control` for later; main has Git only (with SHA-1, zlib, DEFLATE, and SHA-256 for git's SHA-256 object format).
- **W3.12** A `.%` history is a program, and its working directory holds the value. A commit is one appended line:
  `UUID\ [parents] <stamp> @<who> { … }`. `.%/index.ray` maps names to UUIDs, and caches are optimisation levels.
- **W3.13** Which backend is used, whether a history is stored per object or per project, and the caches are all
  Compiler levels (`Compiler.stored`).
- **W3.14** The STD's and the players' histories are separate. They are joined into one global order by stamp, and
  `global%[version]` pins a version. A STD fix substitutes for the version it fixes in everything written after the
  fix; what was written before it replays as recorded.
- **W2.8b** `@character { … }` runs a block as that character when the character is here (L§8.2). It is how a
  `.%` line says who made the commit.
- **W3.15** There is no `Backend` class: each backend is a plain `Language`, in its own project `$/git`, `$/mercurial`,
  `$/fossil`, `$/pijul` or `$/subversion`, and is reached as `$.git` and so on (L§9.1, L§9.2).
- **W3.16** `Ray.history` is `Node.history`. A node's history is a `History`; its stored `.%` form is the Ray
  language reading and writing it.

Decided 2026-10-06 (history queries).

- **W3.17** `history{from p to q}` is the list of stretches of a history, in order. A stretch opens at a commit
  where `p` holds while no stretch is open, and closes at, and includes, the first later commit where `q` holds.
  `p` and `q` are read against each commit (its fields, then its value's). A stretch whose `q` has not happened
  yet runs to the head and is the last one: it is unfinished, and it is included. `history{from p}` is
  `history{from p to !p}`: a stretch lasts while `p` holds and includes the commit where it stops holding.
- **W3.18** A commit's `.next` is the following commit on the same line (the one whose first parent it is),
  `None` at the head. `.previous` is the other direction.

Decided 2026-10-06 (processes).

- **W6.12** The language makes no process calls; running anything is running a Program (L§8.4). A job is a Program
  at a location, the daemon is Ether's scheduler, and job control is `@me/jobs/<id>`: its program and state
  (`queued | running | stopping | done | lost`), `.output` as a history, `.stop()`. `@me/jobs` lists them, and
  `@me/jobs |= program` starts one.
- **W6.13** Like the other device locations (W8), the browser's storage is `@me/device/storage/<key>` (the page keeps it in
  `localStorage`) and the browser's time zones are `@me/device/os/zones` (the page answers from `Intl.DateTimeFormat`).
  A file system over HTTP is `$.http`: GET, PUT, DELETE, and WebDAV's PROPFIND to list.
- **W6.14 (planned, not decided)** Other systems are reached by inspecting their binaries (`$/elf`, `$/pe`, `$/macho`,
  `$/wasm`; `$/x86-64`, `$/aarch64`, wasm bytecode). Inspecting is reading; using a binary lifts it into a Ray Program
  whose syscalls and imports are effects on Ray locations checked by Access; native execution is an optimisation level
  (L§8.4).
