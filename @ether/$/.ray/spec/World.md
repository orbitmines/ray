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

From the drafts review (2026-10-06).

- **W1.7 A local override is your own branch** — **Decided (draft)**. Setting a managed value differently for yourself (a
  private alias name for a world) is a commit on your own branch, always rebased onto the latest. It is `@local` and persists only
  if saved. *`.ray2/Character.ray:8–10`*
- **W1.8 Issuer and spawn location** — **Decided (draft)**. A name's issuer is the nearest world up the hierarchy that reserved
  it, and `world.worlds` are the worlds whose names it issued. Every world has a `spawn_location: Location{to .}`, where new
  characters appear (W2.4). *`.ray2/World.ray:1–5`*
- **W1.9 Redirects and dynamic names** — **Q**. In-world redirects (A ⇒ B, as `/etc/hosts`), overwriting a reservation, and a
  name bound to a getter. Recommend: `world.@a = world.@b` makes `@a` an equivalence of `@b`; `reserve` may bind a name to a
  `dynamically` getter, resolved per lookup; overwriting a reservation needs the issuer's write access. *`.ray2/World.ray:29–36`*
  **Follows (2026-10-06):** `world.@a = world.@b` makes `@a` an equivalence of `@b`; a reservation may hold a parameterless getter, resolved on every lookup (`reservation.redirect(other)`); overwriting a held reservation needs write access from its issuer, and is a quest otherwise, from U9 (equivalences), P5.3 (parameterless functions are dynamic) and W5.1 (writing is access to `=`).
  **(2026-10-06)** There is no `Reservation`: a reserved name is a field of the world, `world.@name = holder` (case-insensitively
  unique), found by the `{PREFIX}{name}` lookup before the world's children and its fallback. A redirect assigns a getter,
  `world.@a = => world.@b`. Overwriting a held name needs write access (`&@.may`), and answers
  `Program(name: "overwrite a name", goal: …)` otherwise.
- **W1.10 The standard `@` names** — **Decided (draft)**; none is defined in v0 (`@localnetwork` is used in
  `Network/Network.ray:82`, `reservable_names` in `World.ray:165–175`). *`Ether.ray:3–27`*
  - `@ether` is `` @`ether.orbitmines.com:37839` ``; `@me | @private` is `global` (on a computer the root is `@me`; in a player
    session `@me` is the player).
  - `@everyone` and `@here` are the characters (`@here`: the online ones); `@local` is `@me` at the current instance;
    `@anonymous` is `?`.
  - `@public` is `@ether.@everyone | Instance`; `@npc | @npcs` is `@public{: NPC}`; `@players` is `@public{: Player}`.
  - `@localhost` is `` @`127.0.0.1` | @::1 ``; `@localnetwork` is the RFC 1918 §3 and RFC 4193 §8 blocks (`10.0.0.0/8`,
    `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), keeping those citations.
  - `@{instance: Instance}` is `instance.canonical` (and reserves CIDR notation); `(@ | #){: UUID}` addresses anything by UUID.
  - `reservable_names: String.NonEmpty{length < 2^8}{every != "\n" | "\t"}`.
- **W1.11 Platforms already holding an `@ether` name** — **Q**. Recommend: a platform's `@ether.@name` is one more avatar of it
  (*ALM:1605–1611*, ALM = `orbitmines.com/…/routes/Almanac.tsx`), and `@github.@x == @https://github.com/x` is an
  equivalence (U9). *IDE:185* (IDE = the private journal's `Project - IDE - The Ether (2027->).md`, as in Language.md)
  **Follows (2026-10-06):** a platform's `@ether.@name` is one more avatar of it, and `@github.@x == @https://github.com/x` is an equivalence (`platform.@x` is `platform / x`), from W2.14 (a name is superposed with its avatars' names) and U9.
  **(2026-10-06)** There is no `Avatar` class and no `platform.@handle` rule: an avatar is one of a character's names, a location
  on the platform with an `@` segment, `@github.com/@alice` (the `@` is required: `@github.com/package` is a package of
  github). `character.avatars` is `name{is Location}` of that form.

From the drafts verification (2026-10-06).

- **W1.12 `@player`** — *`Ether.ray:5` (as of `aeaca7c^`)*: "from the computers perspective it has a root setup where it is
  @me, and @player is the player, and @me in a player session is themselves, and @me.device". W1.10 has `@players`; v0
  `Ether.ray` has no `@player`. **Q** — Recommend: no `@player`. In a player session the player is `@me`; the root of a machine
  is its server character (W2.26); the set is `@players`; the device is `@me/device/<…>` (W8).

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

From the drafts review (2026-10-06). Paths are relative to `@ether/`; `…/instance/` is `.ray2/_todo/ray.ray.txt/Ether/instance/`.

- **W2.12 Contact handles** — **Q**. Recommend: phone and email are Locations (`@tel:…`, `@mailto:…`), so
  `Character.email: Location{scheme == "mailto"}`. *`…/instance/UI/Player.ray:1–2`*
  **Follows (2026-10-06):** phone and email are Locations, `Character.email: Location{scheme == "mailto"}?` and `phone: Location{scheme == "tel"}?`; the authority (`//host`) after a scheme is optional (RFC 3986 §3), from L§6.1 (`@https://…` and the like are location values anywhere).
- **W2.13 A character on many instances** — **Q**. Recommend: `character.instances` is every instance running it (a
  superposition), and the selected one is where its focus is (`primary`); v0 has one `presence`.
  *`…/instance/Entity.ray:15–27`*
  **Follows (2026-10-06):** `character.instances` is the superposition of every instance running it (present, logged in or hosted), and the selected one, `primary`, is where its focus is (`presence`), from W2.14 (status is the max over all instances) and superposition over a single field (U1).
- **W2.14 Status and name over instances and avatars** — **Decided (draft)**. A character's status is the highest over all its
  instances (`instance.status#.max`), and its name is its own name superposed with its avatars' names, so any of them finds it.
  *`.ray2/Character.ray:63, 72`* **(2026-10-06)** The avatars are themselves in the name's superposition (W1.11); an avatar's
  skills are the character's (`character.skills`, `unlock`).
- **W2.15 Status: one enum, or grouped components** — **Q (conflict)**. W2.6 decided one superposable enum
  (`Online & Hosted & Idle`), and v0 has a flat `Status := enum online | offline | hosted | broadcast | proxy | …`
  (`World.ray:289`). The drafts group it: `class Status < Status.Network` with `Hosted`, `Broadcast`, `Proxy`
  (*`.ray2/Character.ray:42–51`*), and the server entrypoint composes components with a grant inside,
  `@me.status = Online & Broadcast & @allow_proxy Proxy` (*`entrypoint.server.ray:1–9`*). Recommend: Status as components in
  groups (network, hosting, presence); assigning one replaces only its group's member (`status = offline` keeps `hosted`),
  `status -= broadcast` removes one (T2.4), and a component may carry a grant.
  **Answered (user, 2026-10-06):** neither. A status is a narrowing of a character (`Online := Character{device.network.connected}`,
  `Broadcasting := Character{quests{serves @public}.nonempty}`), never an enum member. Any part of a program can be flagged to run only
  under one (`serve(@public) if @me is Online`). Reading `@me.status` is inferred: the narrowings `@me` satisfies now. Writing it is a
  **constraint** on what may run (`@me.status = Online & !Broadcasting`, or scoped `with (@me: …) { … }`): flagged parts that contradict
  it do not run, so "do not disturb" suppresses rather than labels. A grant (`@allow_proxy Proxy`) is access on the narrowing;
  `invisible` is a per-reader view (W2.16). Statuses not inferable from what runs (idle, busy) are narrowings over device input
  history or a declared focus job. v0's `Status := enum` is to be replaced.
- **W2.16 Values relative to the reader (`invisible`)** — **Q**. Recommend, generally: a field may store an expression evaluated
  per reader (`&@.last`), not when set; `invisible` is `online` to oneself and `offline` to others. Possible spelling: the field
  holds `=> …` (P5.3). *`.ray2/Character.ray:53–55`*
  **Follows (2026-10-06):** a field may hold `=> …`, evaluated on each read rather than when set, so it may depend on the reader (`&@.last`); `invisible` is `Online` to oneself and `Offline` to others (as v0's `Online` reads it), from P5.3 (parameterless functions are dynamic), `&@` (L§10 answers, 2026-10-05) and the W2.15 answer (`invisible` is a per-reader view). Same as T3.28.
- **W2.17 Running handed-over code, and run logs** — **Q**. Recommend: a program handed over by a character runs as that
  character by default; run logs are kept 30 days by default (configurable), and within that window a run can be replayed as
  that character (L§8.2). *`.ray2/Character.ray:28–30`*
  **Answered (user, 2026-10-06):** it runs as the character that handed it over; run logs are kept (30 days, configurable) for replay.
- **W2.18 Running *at* a location vs *as* someone** — **Q (conflict)**. The draft runs a call or block elsewhere with
  `func@local()`, `@local~{}` and `@local~label{}` (after a label) (*`Ether.ray:14–15`*); L§4.2 decided `~` is for entry points,
  and L§8.2's `@name { … }` runs *as* a character. Recommend: running at a location is `f@loc()` / `loc~{…}` (an entry point of
  the location), kept distinct from `@name { … }`; `loc~label{…}` ties into `.%` labels.
  **Answered (user, 2026-10-06):** running at a location is `f@loc()`; there is no `loc~{…}` form. `~` works like a label: `@who~label{ … }` runs the block after that block/label on that character.
  **(2026-10-06)** There are no `run_as`/`run_at`/`run_after` methods: running as someone or somewhere is `with`, as in a `.%`
  line: `with (@me = who) program`, `with (Location.current = loc) program`. `@who { … }`, `@who~label{ … }`, `f@loc()`,
  `program.run` and a run's replay are written that way.
- **W2.19 Several public keys** — **Q**. A character has more than one key (one for handshake-free communication, one for logging
  in elsewhere, visible to that service). Recommend: `.public_key` is a narrowing of `.name`, and a character holds a superposition
  of keys, each scoped to who may see it (W2.1, X4.3). *`Ether.ray:35–36`*
- **W2.20 Child instances share the host's socket** — **Decided (draft)**. The host forwards what is addressed to a child. An
  instance answers only peers inside its `location` (its advertised set) and is offline to everyone else; `<- instance` is its
  chain of hosts. *`…/instance/entrypoint/Ether.ray:7–14`, `…/instance/Entity.ray:45`*
- **W2.21 A spawned instance inherits configuration** — **Decided (draft)**. Its `/instance` shadows its spawner's (L§10.6.1),
  so it starts with the spawner's settings until it writes its own; its `/` is the host's `/@<uuid>`; it gets a new keypair; the
  spawner configures who may access what it spawned; the registry keeps who logged in. **Q:** host-OS access for children:
  the draft defaults to yes; recommend no (W6.1 sandbox), with other OSes via VMs later (W6.14).
  *`…/instance/entrypoint/entrypoint.ray:1–44`, `…/entrypoint/Ether.ray:16–21`, `…/os/OS.ray.txt:2`*
  **Follows (2026-10-06):** no: a spawned instance has no host-OS access unless it is granted; other OSes later through VMs (W6.14), from W6.1 (the sandbox) and L§8.3 (the default is private).
- **W2.22 First run** — **Decided (draft)**. With no player, the instance creates one (default name, a certificate issued by the
  instance, at a random `spawn_location` of the local world, W1.8), stores it (`persistent`), and opens onboarding
  (`UI.Welcome`); otherwise it opens the world. *`…/instance/entrypoint/entrypoint.player.ray:1–17`*
- **W2.23 Deleting an account** — **Q**. Recommend: the deletion window is measured against stamps (L§9.2), not the device clock;
  destroying a history keeps its commits' stamps and UUIDs with values set to `None`, so references fail visibly.
  *`…/instance/Entity.ray:31–34`*
  **Follows (2026-10-06):** the deletion window is measured against stamps (the clock's `now`, L§9.2), not the device clock; destroying a history keeps its commits' stamps and UUIDs with their values set to `None` (`history.erased`), so references fail visibly, from L§9.2 (stamps) and T1.4 (None slots keep their location).
- **W2.24 Profile, rejoining and server discovery** — **Q**. The journal wants stored preferences, interests and unlocked
  knowledge, community-run server discovery, rejoining the local server per device, and a "last visited" menu. Recommend:
  fields of `Character` (with Gamification §3), and the last instance per device under `@me/device/<…>/last_instance` (W8).
  *IDE:772–776*
- **W2.25 Hosting** — the journal's hosting model (a cloud account per user, credentials tied to the user, provider order,
  free tiers, spending limits, install over ssh, OAuth, small hosts). **Decided:** auto-update is off on servers by default.
  **Q** for the rest: recommend it as the networking project's open list; the language part is that a provider is a location
  (`@aws/…`) and an account a character there (W1.4). *IDE:230–252, 519*
- **W2.26 An instance's kind is its entrypoint** — **Decided (draft)**. `entrypoint.server.ray`, `entrypoint.npc.ray`
  (`< NPC`), `entrypoint.player.ray`, and `Ether.ray` (`< Character`). The server's sets `shadowing = None`,
  `reserve @ether => @me` (2026-10-06: `@ether = => @me`, W1.9), and `@admin` as the superposition of every `@allow_*` name. *`entrypoint.server.ray:1–9`, `Ether.ray:1`*
- **W2.27 Mirrors of unknown extent** — **Q**. Recommend: `world.locations` is an unbounded (possibly non-halting) Ray, explored
  as a quest; a mirror's permissions are its own and default to the original's (W2.9). *`.ray2/Character.ray:11–12`*
  **Follows (2026-10-06):** as recommended: `world.locations` is an unbounded (possibly non-halting) Ray, explored as a quest, and a mirror's permissions are its own, defaulting to the original's, from R3.4 (an unbounded search is a quest) and L§8.3 (permissions are inherited).

From the drafts verification (2026-10-06).

- **W2.28 Speaking to a character** — *`.ray2/Character.ray:74`*: `{" "}{string: String} //TODO Access permission filter` on
  `class Character`: a character followed by a string, `@alice "hi"`. **Q** — Recommend: a rule on Character that sends the
  string to it as a message (v0 `Messaging.ray`), allowed only when the sender holds what the recipient grants for messages
  (W5.1: `execute` on its message method).
- **W2.29 Loading a character into a world** — *`.ray2/Character.ray:69`*: "If blocks for which world to load it in, based on
  location, then .avatar with {location == ?}.avatar or default {?} to load all properties with unknowns". The avatar half is
  superseded (W1.11: avatars are names). **Q** — Recommend: which of a character's names and properties a world loads is a
  narrowing by location (`character{location == world}`), and `{?}` loads the properties whose value is unknown there lazily,
  as quests (T1.6 `?`, R3.4).
- **W2.30 The spawner fills in a child's network** — *`…/instance/Network.ray:1`*: "external fills things like Network.Host
  when spawning a child instance." **Decided (draft)**: what a child instance knows of its host and network (its host, the
  shared socket, W2.20) is given by the instance that spawns it, through the external that starts it, not discovered by the child.
- **W2.31 Recognising a logout that deletes** — *`…/instance/Entity.ray:30`*: "== OR >=, or rather ~= (any part says
  delete_all) FUNC EQUIV ON DELETE_ALL." **Q** — Recommend: a logout schedules deletion (W2.4, W2.23) when any part of its
  program calls `delete_all` (`~=`), judged by function equivalence (U9), not by its text.
- **W2.32 Several servers beside a player** — *`…/instance/entrypoint/entrypoint.ray:9`*: "Also allow many simultaneous servers
  running besides the player." **Decided (draft)**: a machine may run any number of server instances alongside a player
  instance; each is its own character with its own entrypoint (W2.26), sharing the host's socket (W2.20).
- **W2.33 An instance's address is private by default** — *`…/instance/entrypoint/Ether.ray:11–14`*: "Whether to broadcast
  your IP to peers, by default your IP is only exposed to the central Ether server", `BROADCAST_INSTANCE: boolean = false`,
  `dynamically location &= (BROADCAST_INSTANCE ? public.read : private.read) INSTANCE if !OFFLINE`; requests from outside
  `location` are ignored. **Decided (draft)**, in today's terms: an instance's address is readable only by itself and `@ether`,
  unless the character is `Broadcasting` (a narrowing, W2.15), when it is `@public`.
- **W2.34 Connecting to the central server** — *`…/instance/entrypoint/Ether.ray:16–18`*: "Whether to connect to the central
  Ether server or not", `OFFLINE: boolean = false`, `dynamically location &= public.read ETHER if !OFFLINE`. **Decided
  (draft)**: an instance connects to `@ether` unless set offline; offline, it advertises nothing (W2.33). **Q** (conflict): U7
  says "Offline by default" of `@me.status`. Recommend: two different things: the instance connects by default, and the
  character's presence (`Online`, a narrowing) is off until set; U7 then reads "a character is not `Online` by default".
- **W2.35 A server's names include the admin names** — *`entrypoint.server.ray:7` (as of `5229043^`)*: `@me.name = @admin
  //TODO This should work`. **Decided (v0)**: `v0/entrypoint.server.ray` writes `World.ether.@admin = =>
  World.ether.@"allow_{String}"` and `@me.name |= @admin`: the server's names gain the superposition of every `@allow_*` name
  (`|=`, so its own name stays).

## W3. History and version control (*World:145–180, 294–324*)

- **W3.1 History = chain of commits** — each by a persona with a version id. L§9.2 decided HLC-stamped operations over
  definitions with rename-preserving identity.
- **W3.2 Git both ways** — a history conversion to git.
- **W3.3 Staged = local visibility** — uncommitted and staged changes are visibility set to local/private.
  **(2026-10-06)** One mechanism for every node: its `access` (L§8.3). `x.public` is whether its visibility reaches `@public`,
  `x.publish` makes it public; staged or draft is `!x.public`. Commits, references and items have no `visibility`, `staged`,
  `draft` or `publish` of their own.
- **W3.4 Assignment carries history** — the `.=(value)` edge carries where the value came from; default `=` checks histories
  and raises merge conflicts as quests; keep the variable's own history vs the value's.
- **W3.5 Type conflicts are merge conflicts** — in distributed databases.
- **W3.6 Granularity** — a lower bound for the repository (not individual bits of characters); "character level is the lowest
  for String, otherwise every class is a repository".
- **W3.7 Approximate values** — a Bloom-filter-like distributed approximation ("I don't mind an approximate value").
- **W3.8 Squash, cherry-pick, new repository from here**.
- **W3.9 Generic-type versioning** — *World:297*: store that a silent generic type was used; alert when a variable of that name
  appears.

From the drafts review (2026-10-06). The version-control items from the same review (merging commuting commits, how commit
UUIDs are made, the `.%` draft) are under L§9.2.

- **W3.19 A value's location history** — **Decided (draft)**. A value's `@%` records each hop it took (disk → instance → memory →
  instance → me), and each hop's instance chooses the visibility of its own entry (U6). *`.ray2/History.ray:2`*
- **W3.20 A commit expands into its evaluation** — **Q**. Recommend: a commit's `.expand` is the run that produced it (its
  program's steps, P1.8); history is coarse, and expanding gives the fine-grained run. Matches the `.%` draft, where expansions are
  not stored (L§9.2.3). *`.ray2/History.ray:6`*
  **Follows (2026-10-06):** as recommended: a commit's `.expand` is the run that produced it (`change**`), from L§9.2.3 (expansions are not stored; they are `.expand`) and P1.8. Same as P1.23.
- **W3.21 Local order vs the global order** — **Q**. Repositories may hold different states and orders yet keep receiving the same
  updates. Recommend: the stamp order (W3.14) is canonical; a local view may keep its own order (its branch), updates apply to
  both, and disagreement shows only where results differ (L§9.2.16). *`.ray2/History.ray:20`*
  **Follows (2026-10-06):** as recommended: the stamp order is canonical, a local view keeps its own order (its branch), and they disagree only where results differ, from L§9.2 distribution (stamps give one global order) and L§9.2.16.
- **W3.22 Branches and tags** — **Q**. Recommend: a tag is a label on a commit (`v1\ `); a branch is named by the nearest labelled
  (non-UUID) commit back from its head; `history.blank` starts an empty branch before the first commit; a branch point is a commit
  with several children and a merge one with several parents. *`.ray2/History.ray:55–65`*
  **Follows (2026-10-06):** as recommended: a tag is a label on a commit, a branch is named by the nearest labelled (non-UUID) commit back from its head (`history.label`), a branch point is a commit with several children and a merge one with several parents; no branch or tag records. Only `history.blank` (an empty branch before the first commit) is new. From labels in `.%` (L§9.2) and "avoid IRs".
- **W3.23 Rebase** — **Q**. Recommend: `h + other` appends other's commits after h's head (re-stamped); `h | other` merges;
  `h &+ other` interleaves by stamp. *`.ray2/History.ray:67–69`*
  **Answered (user, 2026-10-06):** operators: `h + other` rebases (appends other's commits re-stamped), `h | other` merges (one commit with both heads as parents), `h &+ other` interleaves by stamp.
- **W3.24 A REPL session commits to the character** — **Q**. The journal wants a REPL session's changes committed to one variable,
  and a setting that makes them permanent on your character. Recommend: a REPL session is a history branch (W6.5); "make
  permanent" merges it into `@me`'s history; committing to one variable is `x @ @me = x`. *IDE:488, 585*
  **Follows (2026-10-06):** as recommended: a REPL session is a branch of `@me`'s history (`@me.session`), "make permanent" merges it into `@me`'s history (`@me.keep(session)`), and committing to one variable is `x @ @me = x`, from W1.7 (a local override is your own branch) and Almanac A3 (`x @ @me = x`).

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

From the drafts review (2026-10-06).

- **W4.6 Quests issue certificates; when a quest is done** — **Q**. Recommend: completing a quest issues a `Certificate` from the
  quest's world to the solver (`quest.certificate`); a quest is done when its program reaches a terminal with no pending
  continuation, and one that can continue is `done & continuable`; a certificate's secret defaults to `@private` and pairs with a
  public part (X4.3). *`.ray2/Quest.ray:3, 8`, `.ray2/Item.ray:21–25`*
  **Follows (2026-10-06):** ported from the drafts (`.ray2/Quest.ray`, `.ray2/Item.ray`): completing a quest issues a `Certificate` from the quest's world to the solver (`quest.certificate`); done is P1.8's `x**.is_terminal`, and one that can continue is `done & continuable`; a certificate's secret defaults to `@private` (L§8.3) and pairs with a public part (X4.3).
  **(2026-10-06)** There is no `Certificate` class: a certificate is a commit in the item's history made by its issuer
  (`item.history.commit(issuer, …)`, read as `item.history{who: issuer}`); when it was issued is the commit's `when`, and
  its secret is that commit's access.
- **W4.7 Certificate validity** — **Decided (draft)**. A certificate has `valid: Time..Time?` (a range), and `issuer` defaults to
  the caller. **Q:** the distributed vs central case; recommend verifying by the issuer's public key (W2.1), so no central
  database is needed. *`…/instance/Item.ray:7–11`*
  **Follows (2026-10-06):** verify a certificate by its issuer's public key, so no central database is needed, from W2.1 (identity is the public key).
  **(2026-10-06)** Verifying it is verifying the commit's `who` (W4.6).
- **W4.8 Item issuer and moving** — **Q**. Recommend: an Item's issuer defaults to the world it was created in, and
  `item.move(location)` is a Transaction (W6.5) that changes its location atomically and appends to `item.trail`.
  *`.ray2/Item.ray:5, 8, 11–12`*
  **Follows (2026-10-06):** an Item's issuer defaults to the nearest world of where it is (`location.world`), and `item.move(to)` is a `transaction` that changes its location, so the move is in its trail (the location's history), from W1.8 (the issuer is the nearest world), L§3.2 `transaction` and history.
- **W4.9 Default names** — **Q**. Recommend: an unnamed item gets a generated, replaceable name from its class and location
  (`Item 3 @ room`). *`…/instance/Item.ray:2`*
  **Follows (2026-10-06):** no generated name is stored: identity is location and history, so an unnamed item is shown by a rendering from its class and location (`Item @ room`), and a name given later replaces nothing, from A7/L§9.2 (identity is location and history, not a name).
- **W4.10 References derived from history** — **Decided (draft)**. Every Node has `.ref`, a Reference derived from its history:
  the date is the first commit's `when`, the authors are all commits' `who`, it is a draft while its branch is less visible than
  the branch before, and the link is its location (remote once sent). Published = the instances hosting it. Notes are sorted by
  date and may be References. **Q:** claiming a dummy reference's authorship; recommend a quest granted by the reference's issuer.
  *`.ray2/Reference.ray:6–26`*
  **Follows (2026-10-06):** claiming a dummy reference's authorship is a quest from the reference's issuer (`reference.claim(who)`), from U10 (quests) and W1.8 (issuers).
- **W4.11 Eventual consistency and distributed runs** — **Q**. Recommend: eventual is the default read, and
  `x @ {replicas.every(.synced)}` (W4.2) asks for strong; a Program may be split over several machines' quests (`@a/quests |= …`),
  joined with `sync` (P4.1). *`…/instance/Network.ray:3–4`*
  **Follows (2026-10-06):** as recommended: eventual is the default read, `x @ {replicas.every(.synced)}` asks for strong, and a Program split over several machines' quests is joined with `sync`, from L§4.4 (concurrent writes superpose, a read policy resolves them), W4.2, L§8.4 quests and P4.1 `sync`.

## W5. Access (*World:182–188, 474–497; Accessor*)

- **W5.1 Levels** — READ/WRITE/EXECUTE; `confidential`, `internal`, `public.read`, `none.write`; `default_privacy_policy`. L§8.3.
- **W5.2 A block of permissions** — put everything in a block under one permission.
- **W5.3 Access to `**`** — "Default `public.read` doesn't allow access to `**`, but what would?"
- **W5.4 Derived data** — L§8.2 (`local` mark).

From the drafts review (2026-10-06).

- **W5.5 `confidential` never wider than private** — **Q (conflict)**. The 2026-10-04 answer (L§10, "Answer 2026-10-04 evening")
  says `confidential` *is* the default privacy policy and follows it. The draft clamps it: if the policy is more permissive than
  private, `confidential` is `@private.managed` (*`…/instance/Access.ray:51–58`*). Recommend the clamp, so setting one's policy
  to `@public` never publishes confidential data.
  **Answered (user, 2026-10-06):** clamp: whatever the policy, `confidential` is never wider than `@private.managed`.
- **W5.6 What the policy never opens** — **Decided (draft)**. Whatever the policy, these stay `confidential`: the policy itself
  (write), an instance's `private` flag, reading private keys, and overwriting existing keys (new keys may be written).
  `@private & encrypted` is data the central server holds but cannot read, nor recover if the key is lost (X4.2). **Q:** policies
  by situation ("close to a player in a world"); recommend a permission's `who` be any narrowing
  (`Character{presence near x}`). *`…/instance/Access.ray:26–41`*
  **Follows (2026-10-06):** a permission's `who` is any narrowing (`Character{presence near x}`), so a policy by situation is a grant to that narrowing, from the W2.15 answer (statuses are narrowings of a character).
- **W5.7 Visibility per entry** — **Decided (draft)**. Each entry of a list or superposition has its own visibility; a reader sees
  only the entries it may read, and their count only if the count is visible. *`…/instance/Access.ray:10`*
- **W5.8 `none` and `const`** — **Decided (draft)**: `none` is the permission no one has, so `none.write x` can't be assigned
  after construction. **Q:** `const`; recommend `const x` = `none.write` on x and, recursively, on children that set no
  permission of their own. *`…/instance/Access.ray:8, 61–64`*
  **Follows (2026-10-06):** `const x` is `none.write` on x, and children that set no permission of their own inherit it, from W5.8 (`none.write`) and L§8.3 (children inherit permissions).
- **W5.9 Guests and hosts** — **Decided (draft)**. Guests can read who hosts them (the instance's parents) and the host can read its
  guests (its children): `@guests.read { @host => … }`, `@host.read { @guests => … }`. *`Ether.ray:11–12, 33`*
- **W5.10 Indexes can be turned off** — **Q**. The journal asks what is indexed (code search, general search, later 3D), and lets a
  repository turn indexing off, losing what relies on it. Recommend: an index is an optimisation level over `T$` queries (P8.3);
  without it a query stays correct but slow, or answers a `Quest`. *IDE:242–245*
  **Follows (2026-10-06):** as recommended: an index is an optimisation level over `T$` queries (P8.3); turned off, a query stays correct but slow, or answers a `Quest`, from choices being optimisations.
- **W5.11 Reaching items by presence; stacks of credentials** — **Q**. A stack is any graph of a type (keys, credentials); a graph
  is either walked by a program's cursor or needs a player nearby ("items in this room I can reach now"). Recommend: reachability
  is a grant narrowed by distance, `@x.read item {player.location near item.location}`, and a cursor walking the graph is an actor
  like any other. *IDE:780–785*
  **Follows (2026-10-06):** as recommended: reaching by presence is a grant narrowed by distance (`@x.read item {player.location near item.location}`), and a cursor walking a graph is an actor like any other, from W5.6 (narrowing grants) and L§8.2 (a cursor is an actor).

From the drafts verification (2026-10-06).

- **W5.12 Execute runs at the owner; read lets you run a copy** — *`…/instance/Access.ray:19–20`*: "Whether Node{} is allowed to
  execute on local instance. If it has read access, it can read the function and execute it locally for them." **Decided
  (draft)**: `execute` (access to `()`, W5.1) runs the function where it is, on the owner's instance, for the caller; `read`
  (access to the structure) lets the reader copy the function and run it on its own instance, so read implies running it
  oneself, against what one may read.
- **W5.13 Where the default privacy policy lives** — *`…/instance/Access.ray:24–40`*: "This should be on instance, merge
  instance/player/entity?", over `+def Entity` with `confidential.write default_privacy_policy`, and `Node.access` falling back
  to `location.parent?.access[ACCESS] ?? .default_privacy_policy[ACCESS]`. **Q** — Recommend: the merge is done (an instance is
  a character, W2.26, and there is no Entity class); `default_privacy_policy` is a `confidential.write` field of the character,
  and a node's access falls back up its location to the owning character's policy (L§8.3).

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

From the drafts review (2026-10-06).

- **W6.15 A character's files by UUID** — **Decided (draft)**. A character's files are stored under its UUID, sharded by leading
  characters (`@U/U/I/D…`); `@name` and `@uuid` both map there, so a rename moves nothing. *`.ray2/Feature/IO.ray:21`*
- **W6.16 Proofs** — **Decided (draft)**. *`.ray2/Feature/Proof.ray:3–5, 17–37, 46–58, 106`*
  - An equational proof searches the equivalence graph (U9) from both sides' histories until they meet.
  - A proof's free (externally used) variables are its assumptions: inside a scope its own, outside everything assumed around it.
  - `x.assumptions` lists what is assumed about x; setting it to `None` clears them, derived ones like `f(x)` included.
  - A proven proposition narrows the types of what it mentions (`theorem x % 2 == 0` makes x `Number{% 2 == 0}`).
  - A failed proof starts a quest (W6.4), except inside `by_contradiction`.
  - A property of an infinite structure is proven coinductively (by a loop).
  - **Q:** is `%%` (the history within the current scope) wanted, or is it `&%`?
    **Follows (2026-10-06):** `%%` is not needed: `&%` is the history of the current scope, from P1.3 (the context is the state, with history `%`).
- **W6.17 What a proof is for** — **Q**. The journal frames a proof as how one decides what is worth pursuing: it keeps the route
  and the conclusion, and says something about the space it probed. Recommend: a proof is a Program whose history (the paths it
  explored, P1.3) is kept and reused as an index for later quests. *IDE:479–483*
- **W6.18 `theorem`** — **Decided (Almanac)**. `theorem name (params) => proposition` declares a quest proving the proposition for
  every argument; once proven, `if assume name { … }` uses it without a quest (`theorem commutative (a: Number, b: Number) =>
  a + b == b + a`, `∃x: Binary x * x == 25`). *ALM:2149–2159*
- **W6.19 URL user info** — **Decided (draft)**. A URL may carry `user (":" password)? "@"` before the host (RFC 3986 userinfo);
  the password is `confidential`. *`…/instance/Network.ray:26`*
- **W6.20 `localhost` and the hosts table** — **Decided (draft)**: `localhost` is `127.0.0.1 | ::1`, and only `confidential` may
  rewrite it. **Q:** recommend the hosts table maps Locations to Locations, characters included (`@ether -> @me` for an offline
  mirror), and is the world's name table (W1.3, W1.9). *`…/instance/Network.ray:38–45`*
  **Follows (2026-10-06):** as recommended: the hosts table maps Locations to Locations, characters included (`@ether -> @me` for an offline mirror), and is the world's name table, from W6.6 (hosts as equivalences) and W1.3.
- **W6.21 Remote values** — **Q**. Recommend: `x @ instance` means x somewhere in that instance (a location narrowing); reading a
  remote x keeps a local mirror (W2.9); asking for a local x never goes remote; a search by structure across unknown instances
  (`T @ *`) is a quest. *`…/instance/Network.ray:63–72`*
  **Follows (2026-10-06):** as recommended: `x @ instance` is a location narrowing, reading a remote x keeps a local mirror, a local x never goes remote, and `T @ *` is a quest, from T7.1/R7.1 (`x @ loc`), W2.9 (mirrors) and R3.4 (an unbounded search is a quest).
- **W6.22 Update transfers only what is new** — **Decided (draft)**. `IO / = ETHER@ETHER/instance` transfers only the commits after
  the local head (L§9.2); local edits are kept and merged; offering an update is a quest. *`…/instance/Update.ray:1, 4, 11`*

From the drafts verification (2026-10-06).

- **W6.23 Assumptions that disagree; `assume` inside a proposition** — *`.ray2/Feature/Proof.ray:17–18, 69–76, 97–101`*:
  `assume x % 2 == 0` then `assume x % 2 == 1 (superpose; 0 | 1)`; `theorem (assume A = 3) + (assume B = 5) == 8`; a bare `C`
  indented under a theorem "means `assume C`"; `var = 5 | 10 | 15`, `∃var * var == 25` against `assume ∃var * var == 25` and
  `var * var == 25` ("if 5 & 10, it's false & true, but only true succeeds"). W6.16 and U-C3 cover `x.assumptions` and
  `if assume c`. **Decided (draft)**: two contradicting assumptions on one value superpose (`x % 2` is `0 | 1`); `assume` is an
  expression and may stand inside a proposition, scoped to it; a name alone on a line under a `theorem` is assumed. **Q** for
  `∃`: recommend `var * var == 25` answers the superposition of booleans (`true | false | false`), `∃var * var == 25` collapses
  it to whether some alternative holds (`true`), and `assume ∃…` narrows `var` to the alternatives that hold (`5`).
- **W6.24 Proxies that can or cannot read** — *`.ray2/Feature/Network/Network.ray:7, 10`*: "Handshake such that the proxy does
  vs doesn't see traffic", `@USERNAME.read proxy @USERNAME`; "How to reroute all network traffic we're proxying". v0
  `Network.Proxy` (`through`, `admits`) has no such notion. **Q** — Recommend: a proxy is end-to-end by default (the handshake,
  W2.1, is with the destination, so the proxy forwards ciphertext); one the character grants `read` (`@x.read proxy @x`, as the
  draft writes) terminates the session and the handshake is with it. Rerouting what a proxy admits is that proxy's routing over
  the same `through`.

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

From the drafts review (2026-10-06). Both are IDE backlog, like the rest of W7.

- **W7.15 The controller as a programming interface** — **Decided (backlog)**. From the journal's controller-keyboard note: typing
  as a probability over the next key from stick direction and layout; both sticks out is `.expand`, both in `.collapse`; two sticks
  are two cursors; moving into an object selects a field (a nested call); buttons for property call, method call, new closure,
  undo/redo, backspace, new filter block and leaving the context; a trigger switches the view between Many, Array, Graph and Tree;
  a half circle makes a loop; voice corrections per project or user dictionary; controllers with fewer buttons (VR) work too. The
  language point: switching the view is a choice of rendering level over the same Ray, not a change of the value.
  *`private-journal/…/Project - Controller = Keyboard (2026).md:1–79`*
- **W7.16 More editor notes** — **Decided (backlog)**. Super/subscripts are converted and an undo restores the plain notation
  (*IDE:664*); `((` maps to `⸨` (*IDE:742*); actions on a thing become a function, then its animation (*IDE:744*); movement goes
  around a body, not through it (*IDE:736*); chyp-like overlays, structures reduced to a "zero point" ignoring their embedding, and
  one key applying a small program to the whole interface (*IDE:789–797*); preferred rewrites applied optionally (*IDE:827*);
  dragging from a contact point on the background starts a ray there (*`private-journal/year/2023/…/2023-05-17.md:10`*).

From the drafts verification (2026-10-06).

- **W7.17 Stepping through a run; browsing the read tree** — **Decided (draft, backlog)**. *`.ray2/.ray2.json:249–256`*:
  `"execution": { "repl": true, "stepThrough": true, "astBrowser": true }`. Besides the REPL (W3.24), the editor steps through a
  run one `. = .next` at a time (P1.20) and browses what a text was read as (each node's rule and span, which the LSP's painting
  already knows). Both are renderings of the Program value (F-D), not separate tools.

## W8. Devices (*from the drafts review, 2026-10-06*)

W8 itself is decided below (devices are locations under `@me/device/<…>`).

- **W8.1 Devices controlled by someone else** — **Q**. Recommend: remote control is a grant of `write` on `@me/device/mouse` (or
  `keyboard`) to another character (L§8.2); the prompt shows its origin chain. *IDE:181*
  **Follows (2026-10-06):** as recommended: remote control is a grant of `write` on `@me/device/mouse` (or `keyboard`) to another character, and the prompt shows its origin chain, from W8 (devices are locations) and the U6 grants (L§8.2).
- **W8.2 Environment variables, now or at startup** — **Q**. Recommend: the environment is `@me/device/os/env/<NAME>`, read live;
  its value at startup is the pin `@me/device/os/env/<NAME>%[start]`, where `start` is the label the run's entry sets (L§9.2).
  *IDE:384*
  **Follows (2026-10-06):** as recommended: the environment is `@me/device/os/env/<NAME>`, read live, and its value at startup is the pin `@me/device/os/env/<NAME>%[start]`, from W8 and `x%[label]` pins (L§9.2).

## W9. Choice (*from the drafts review, 2026-10-06*)

W9 itself is decided below (`choose` resolves through `@me.choose`).

- **W9.1 With or without replacement** — **Q**. Recommend: `choose n T` is without replacement; with replacement is
  `n * (choose 1 T)` or `choose (T, T, …)` by structure; no new keyword. *`.ray2/Feature/Choice.ray:18`*
  **Answered (user, 2026-10-06):** `choose n` chooses n distinct ones by identity (`===`, location included): `choose 2 ("A" | "B" | "C")` gives two of the three, but `choose 2 (x, x, "5")` may give x twice, since the two x are at different locations.
- **W9.2 Choosing by an algorithm** — **Q**. Instantiating a type with, e.g., Wave Function Collapse. Recommend: the chooser is a
  `with` setting, `with Choice.algorithm = WaveFunctionCollapse { choose Room }`; the computer's default stays a weighted random
  pick. *IDE:687; ALM:2040*
  **Follows (2026-10-06):** as recommended: the chooser is a `with` setting (`with Choice.algorithm = WaveFunctionCollapse { choose Room }`), and the default stays a weighted random pick, from L§6.3 `with` and choices being optimisations.
- **W9.3 A choice put to players carries its reason** — **Q**. The journal attaches an explanation to `@players.choose`, keeps the
  results for later, and treats a human's answer as an untrusted external one with an acceptance weight. Recommend: the doc comment
  above a `choose` is the quest text shown to the player, and a player's answer enters as a weighted alternative (U8), not as a
  certainty. *IDE:666; `private-journal/year/2022/daily/2022-03-08.md:21`*
  **Follows (2026-10-06):** as recommended: the doc comment above a `choose` is the quest text shown to the player (`choice.reason`), and a player's answer enters as a weighted alternative, not a certainty, from G1.4 (the comment above attaches to the statement) and U-C1/U8 (an answer enters as a weight).

## W10. The Ether instance directory (*`@ether/README.md`*)

From the drafts verification (2026-10-06). The README describes the root of an Ether instance. **Decided (draft)** as a whole;
each item says where it lives in v0 today (`@ether/$/.ray/v0`, whose core is the project `@ether/ray` at `v0/ray`).

- **W10.1 One character's** — *README:2*: an instance directory belongs to a single character, a player or an NPC (a server
  too, W2.26). Everything in it is that character's unless it says otherwise.
- **W10.2 `/.ray`, the standard library** — *README:4*: loaded automatically into the Ray runtime as the standard library. Today
  `@ether/.ray` (in this repository `@ether/$/.ray`, the Ray language's directory, `$.ray`, L§9.1), with the core `ray/`
  (`v0/ray`, the project `@ether/ray`) and its bootstrap `v0/ray/.entrypoint.ray`.
- **W10.3 `/.[LANGUAGE]`, languages** — *README:5*: the language, library and runtime packages the Ether supports. Today
  `$/<name>`, each a project named in lowercase (`v0/ray/$/json`, `v0/ray/$/git`), answered by `$.name` (L§9.1, Decided
  2026-10-06).
- **W10.4 `/Ether.ray`, after the standard library** — *README:6*: running an instance loads the standard library, then
  `Ether.ray`, then the entrypoint. Today `v0/Ether.ray` (the standard `@` names, W1.10), read after the core `v0/ray`.
- **W10.5 `/#`, World data** — *README:7*. Not in v0 yet; world definitions are `v0/World.ray`.
- **W10.6 `/@`, Character data** — *README:8*: one directory per character, `/@<uuid>`; a spawned instance's `/` is its host's
  `/@<uuid>` (W2.21). Not in v0 yet.
- **W10.7 `/%`, history of no character or world** — *README:9*: version history kept that belongs to neither. Today the drafts'
  `@ether/.%/<ORIGINAL-UUID>.ray` (L§9.2, "What the `.%` draft writes"); in the core a value's past is `.previous`, and stores
  are the `@ether/version` project (`v0/version`).
- **W10.8 `/projects`, unassigned projects** — *README:12*: internal projects not yet given a package directory. Today every
  project has its own directory with a `.project.ray` (`v0/geometry`, `v0/security`, `v0/library`, …), and `@ether/projects`
  is gone.
- **W10.9 `/entrypoint(.*)?.ray`, entrypoints per character kind** — *README:15*: one entrypoint per kind of character, and the
  default `/entrypoint.ray` is this character's. Today `v0/entrypoint.server.ray`, `v0/entrypoint.npc.ray` and
  `v0/entrypoint.player.ray` (W2.26), with no default `entrypoint.ray` yet. **Q** — Recommend: an instance runs
  `entrypoint.ray` when it has one, else the entrypoint of its kind.
- **W10.10 Any other directory is a package** — *README:18*: put there by the character or its host, and optionally
  downloadable by other characters as a package (its visibility per L§8.3, private by default).
- **W10.11 `avatar/`** — `@ether/avatar/` holds the character's avatar information (`2d.svg`, `2d.png`, `2d-square.*`) at that
  name: an avatar is a name (W1.11), and the directory holds what is shown for it.

---

## Decided

Answers from 2026-09-30.

- **W1.1** Text characters are `Char`, and players/NPCs are `Character`. `Persona` is renamed back to
  `Character`, and the text class `Character` becomes `Char`.
- **W1.2** A World is a Location (composition): a location with rules, and any location can be made a world.
- **W3.2** Git import/export, as a frontend with an inverse, is part of L§9.2's first milestone.
- **W7** The editor notes are the IDE's backlog (2027); they are not implemented in v0.
- **W2.1** `==` on characters and instances compares public keys, now. Key compromise and rotation later.
- **W2.1 Identity, keys and recovery — Decided (user, 2026-10-06).** Character equality is the whole of security in the
  language, so it never rests on data anyone can claim.
  - **Verified vs claimed.** A character value is *verified* only when the runtime made it, from a completed handshake or
    from holding a local instance key; anything built from data (`Character(name: …)`, a name, a told public key, a
    commit's `who`) is *claimed*. `verified == verified` compares root identities (constant-time); a claimed character
    is never `==` a verified one. `&caller`/`@me` only ever hold verified principals, and no user code can make one.
    Access checks see only `&caller`. Names, UUIDs included, are for addressing and visibility, never evidence.
  - **Keys.** Each instance hosting a character has its own key pair, whose private half never leaves it, certified by
    the character's root authority ("this instance key speaks for me, until T, for these scopes"). The root is a
    **policy**, not one key: the character's first commit declares an `Identity` with its current root keys, the digest
    of the next ones (pre-rotation), and a threshold per kind of key event, e.g. `revoke: 1 of keys`, `add: 2 of keys`,
    `rotate: 2 of keys | next`, `recover: 2 of (printed_key | @ether) after 7 days, vetoable by any of keys`. Key events
    are signed commits in the character's history (the key log); revoking is cheap (it can only lock out), gaining power
    is expensive. Changing the policy is a `rotate`-level event. Root keys may be held on devices, hardware/passkeys, or
    split k-of-n across the character's instances (threshold signing, resharing to replace lost devices).
  - **Handshake.** Noise XX: ephemeral X25519 keys per session (forward secrecy), each side signs the transcript with
    its instance key and presents the root-signed certificate; the verifier checks signature, chain, the key log at that
    point (unrevoked) and scope/expiry. The result is a verified principal for the session.
  - **History is attribution, not authority.** Every commit is signed by its `who`'s instance key. Replaying
    `with (@me = @who)` lines runs them as recorded, checked against who's key log at the commit's stamp; it never gives
    the replayer who's live permissions. Becoming another character (`@me = x`) needs x's grant.
  - **Delegation.** Handed-over code and guests hosted for someone run only with that someone's signed, scoped,
    expiring delegation, and with the intersection of the delegated and the local permissions.
  - **Recovery handshake.** A lost device is revoked by the remaining root authority. A lost root is recovered without
    any guardian choosing the new key: the recovering machine makes its own new root keys and writes the rotation event,
    then opens a recovery handshake with each guardian and sends only the event's hash; a guardian verifies the person by
    its own means and signs that hash, bound to the session. Once the `recover` threshold of signatures over the same hash
    is met, the event is appended and takes effect after the waiting period unless an old key vetoes it. Guardians never
    hold key material; `@ether` is the default guardian, and any server (one's `@private.managed` ones), friend or printed
    key can be configured instead.
  - **Signing commits.** One instance key signs all of that instance's commits (Ed25519 is deterministic, RFC 8032, so
    many signatures do not weaken it; a key per commit would add nothing, since it would itself be certified by a
    long-lived key). Instance certificates are short-lived (default 30 days) and renewed automatically under `add`, so a
    stolen key expires on its own. A signature covers the commit's hash, which includes its parents' hashes and the
    key-log event it relies on: backdating is a fork, rejected (or a merge quest) by anyone holding the history.
    Per-world instance keys, each certified by the root, are optional, for unlinkability.
  - **Storage.** Private keys are `none`-readable (W5.6), zeroised on logout, never in a history or cache level.
  - **Its own project (user, 2026-10-06).** All of this is the project `@ether/security`; `@ether/network` is its own
    project and depends on it. Neither is imported by default, and comparing characters errs in the language unless one
    of them is (`ERROR@Security`); importing it replaces that with the verified comparison above.
  - **Algorithms are chosen by the root (user, 2026-10-06).** Every key names its algorithm, a language (`$/ed25519`,
    `$/x25519`, `$/noise`, …), and the root policy says which ones its keys use; signing, verifying and the handshake
    use whatever the keys name, so nothing is fixed to one algorithm and changing one is a key event. Only Ed25519,
    X25519 and Noise XX are implemented for now; other algorithms are not being added.
  - **Where it lives (2026-10-06).** All of this is the subproject `@ether/security` (`v0/security/`, L§9.1), which
    `@ether/network` (`v0/network/`) imports; the core imports neither. Without it, comparing characters is an error
    (`ERROR@Security`), `@me = x` sets `x` as given, and commits are signed (`History.Commit.signature`, `relies`, `hash`)
    but never verified. The algorithms are the languages `$/ed25519` (over `$/sha512`), `$/x25519`, `$/chacha20poly1305`
    and `$/noise`, whose defaults are named once, in `Identity.algorithms`.
- **W2.4** Spawning, login/logout/swap and deletion with a cancel window are implemented now, from the
  entrypoint drafts.
- **W6.4** An error that fails the program is, in general, a quest; a failing proof is one such case.
- **W6.6** All of the networking now (protocols, URL grammar, hosts as equivalences, DNS history checked
  against public keys, proxies, the version handshake), in a **separate project**, so it is isolated and
  can be excluded.
- **W6.1** IO is sandboxed: `IO /path` is inside the instance directory, `..` can't leave the top
  (symlinks can), and the host filesystem is reached only via `confidential IO.os /path` when permitted.
- **W6.1b** A path naming a field is looked up as `{field}.ray`, then a directory `{field}`, then a file.
- **W3.3** Staged/uncommitted changes are visibility set to local/private; publishing raises visibility. (2026-10-06: the
  node's `access`, read as `.public`, W3.3 above.)
- **W3.6** Every class is a repository; String's lowest level is the character.
- **W4.5** Counted types (`4 Wall`, `1..3 Bookshelf`, `a Table`) now; spatial relations (`against`,
  `next to`) as Geometry narrowings once `v0/geometry/` exists.
- **W5.3** Access to a value's program is `@public.read` on `**`: visibility is recursive.
- **W6.10** The Keyboard API is the draft's (`pulsed (max: 20/s, delay: 1s)`, `toggled`, `cycle`,
  `as boolean` when pressed), with keys as `dynamically` variables. It is also the TUI's input.
- **W2.6** Status is one superposable enum: `@me.status = Online & Hosted & Idle`.
- **W1.4** Allocating names now: `@google.@x = @someone`, where the issuer is whoever owns the namespace. (2026-10-06: that
  assignment is the whole mechanism; there is no `allocate`, W1.9.)
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
- **W3.11b (2026-10-06)** For now, the Mercurial, Fossil, Pijul and Subversion backends, with the languages only they use (SHA3, MD5, BLAKE3, Bincode, Zstd, Base32) the unused SHA-512 and Blowfish, the SARIF, TAP and JUnit report formats (LSP stays), the permission backends (POSIX, ACL, Android, browser permissions; a grant is recorded, not enforced on the platform) with XML, the SQL stores (SQL, SQLite, Postgres) the terminal image protocols (Sixel, Kitty; images are drawn as text) and the shell language (`$/sh`), are on the branch `version-control` for later; main has Git only (with SHA-1, zlib, DEFLATE, and SHA-256 for git's SHA-256 object format).
- **W3.12** A `.%` history is a program, and its working directory holds the value. A commit is one appended line:
  `UUID\ with (@me = @who; now = X) <change>`, any Ray (L§9.2.6). Caches are optimisation levels. (The `.%/index.ray`
  name map was dropped 2026-10-06: names are in the program.)
- **W3.13** Which backend is used, whether a history is stored per object or per project, and the caches are all
  Compiler levels (`Compiler.stored`).
- **W3.14** The STD's and the players' histories are separate. They are joined into one global order by stamp, and
  `global%[version]` pins a version. A STD fix substitutes for the version it fixes in everything written after the
  fix; what was written before it replays as recorded.
- **W2.8b** `@character { … }` runs a block as that character when the character is here (L§8.2). A `.%` line
  says who made the commit with `with (@me = @who)` instead (L§9.2.6, 2026-10-06). (2026-10-06: `@character { … }` is
  itself `with (@me = character) { … }`, W2.18.)
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

- **W6.12** The language makes no process calls; running anything is running a Program (L§8.4). Every program is a
  quest with a `who` (2026-10-06, replacing jobs; no `Quest` class): `@me/quests` (= `@me.quests`) is the selection of the
  character's running programs, `@me/quests |= program` starts one, `.stop()` ends one. The daemon is Ether's scheduler.
- **W6.13** Like the other device locations (W8), the browser's storage is `@me/device/storage/<key>` (the page keeps it in
  `localStorage`) and the browser's time zones are `@me/device/os/zones` (the page answers from `Intl.DateTimeFormat`).
  A file system over HTTP is `$.http`: GET, PUT, DELETE, and WebDAV's PROPFIND to list.
- **W6.14 (planned, not decided)** Other systems are reached by inspecting their binaries (`$/elf`, `$/pe`, `$/macho`,
  `$/wasm`; `$/x86-64`, `$/aarch64`, wasm bytecode). Inspecting is reading; using a binary lifts it into a Ray Program
  whose syscalls and imports are effects on Ray locations checked by Access; native execution is an optimisation level
  (L§8.4).
