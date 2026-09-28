# Ether — Gamification spec (from the Project Gamification note)

Status legend: **Proposed** (nothing built) · **Decided** · **Q** (needs your decision).
Each item: what the note says → proposal, expressed with the language spec (`Language.md`, cited as *L§n*) → questions.

Source: `private-journal/public/archive/projects/2030+? Project - Gamification.md` (cited as *G:line*). The note is marked "unprocessed" past line 20; this document keeps its questions and turns the concrete parts into proposals.

---

## 0. The central question — *G:1–17, 418–428*
> What is the game loop outside normal file management of an IDE? How do you compress something with so many degrees of freedom into something with far fewer, yet keep the same functionality?

- Proposal: the game is a *frontend* (L§9.1) over the same values the IDE edits. Every game object is a Ray value; every game view has a text variant ("should be the case for everything", *G:175*). Nothing exists only in the game.
- The loop: **find** a quest → **equip** items (what is being checked, *G:223*) → **explore** a space of programs → **verify** (L§4.5 inverses, equivalences) → **reward** that is itself a computational object (*G:388*).

## 1. Problems as quests — *G:7–15, 155–169, 393–400*
> Problem categories (intertwined): creation, identification (reverse engineering), search/optimization. Example problems: cryptography, theorem proving ("can you reach or prove not to reach a state" — every problem is like this), equivalent-but-faster programs, program writing.

- Proposal:
  - A **quest** is a reachability problem: a start value, a goal predicate (a type narrowing, `Goal{p}`, L§3), and a verifier.
  - *Creation* = construct a value of a type. *Identification* = find which type/pattern a value is. *Optimization* = find an equivalent program (same inverse-checked behaviour) that is better on a measured resource.
  - A quest's **difficulty** is relative to a character: estimated from the skills (§3) of those who solved similar quests.
  - **Refinement** = a quest whose solution is a set of sub-quests (a program of quests); **progress** = the sub-quests solved, plus the current best and the current path (*G:232*).
- **Decided:** a quest is reachability: `from: T` to `T{goal}`, with a verifier.

## 2. Optimization as play — *G:199–247*
> Systematically steering optimization. There's always an equivalence relationship. Reversibility at every step is key. Benchmark on a specific file vs a category; tradeoffs. Ditch a line of inquiry, go back — actually a 3D location? Locations map to kinds of algorithms; items mined there carry their history.

- Proposal:
  - The search space of equivalent programs is a *world*: a location is a program (or a class of them), neighbours are single rewrite steps (Compiler levels, `Program{O: …}`, whose reductions are rules).
  - Reversible steps are required so any position can be walked back (`f⁻¹`, L§4.5).
  - An **item** found at a location is a rewrite or a sub-program; it carries its origin chain (L§8.2 origin = whole chain), so "retrace where you got it" is reading its origin.
  - **Benchmarks** are values too: a file, or a category (a type) of files. A tradeoff is two benchmarks moving in opposite directions.
  - Imported algorithms (existing compressors) are starting locations; two imports of the same thing are equivalents (L§3.5 castable graph).

## 3. Player model: character, avatar, skills — *G:361–388*
> (permanent) Character; Avatar per World; level; class (Creator{Builder, Engineer}, Explorer); skill proficiency (skill = class of quests). Proficiency linked to recent usage, can be partially lost. What awards progress, and how to keep it from being gamed.

- Proposal, as classes:
  - `Character` — permanent, one per `@player`.
  - `Avatar` — per world or group of worlds; a set of unlocked skills and paths traversed; can be copied and merged (components, L§1.5 `+`).
  - `Skill` — a class of quests (a type over quests). Proficiency = recent verified solutions in that class, decaying over time against a historic baseline (*G:377*).
  - Progress is awarded only for **verified** solutions whose effect is measured downstream (the solution is used, the benchmark moved) — this is the anti-gaming rule (*G:382–383*).
- **Decided:** proficiency decays. Unused, it is partially lost against the historic baseline.

## 4. Mana = capacity — *G:256–292*
> Mana is processing power; things with more than one mana bar are several items each with one (network, disk). Copying is a spell that uses capacity (X GB/s write) and requires concentration; can be interrupted. Remote items are shown translucent; materialize/localize.

- Proposal:
  - **Mana** is a measured capacity of a resource (a `Quantity` with a rate unit, e.g. `GB/s`) — the unit registry already reads `1.5 GB/s`.
  - A **spell** is an IO operation (L§8.1: IO is what reaches an IO external) shown with its cost and progress; *concentration* = it holds the resource; an interrupt level decides what cancels it.
  - Presence is visible: in memory, on disk, remote — the same distinction as storage vs shape (L§9.1). *Materialize* = fetch into local storage.
- **Decided:** mana is only real capacity: the CPU/GPU/disk/network of the machines you connect. It is never an invented currency.

## 5. Worlds, rooms, items — *G:173–197, 322–339, 352–356*
> Every item being an inside room which describes it. UI layout just a place you can visit. Worlds connect arbitrarily. Universe determines global rules for each world; a world can change those rules. Desktop as a 3D room. Mix of text and visual where each makes sense.

- Proposal:
  - A **room** is the inside of a value: its fields as items placed in space. Entering an item = opening its class body.
  - A **world** is a scope with rules: the universe's rules are the base language, a world overrides them with `with` (L§6.3) — world rules are context overrides.
  - Names are optional (*G:173*): an item is identified by location/identity (L§9.1: identity is version-history id, not name).
  - The 3D coordinates of an item are modifiers in its text form (*G:175*).
  - "Certain regions dropping items is public" = visibility per location (L§8.3).
- **Decided:** a world is a `.project.ray` project. Its rules are its dependencies plus `with` overrides.

## 6. Onboarding — *G:46–80, 302–312*
> Quick onboarding with [[R]]: language choice; "what're you here for" (Everything / Tools only); network mode (Go online / Pessimistically online / Invisible if possible / Prefer offline / Go offline); realistic vs voxel; arrival at Luna, Galaxy bases, check-in desk.

- Proposal:
  - Every onboarding choice writes a setting, and is changeable later ("saying something selects but doesn't lock it in", *G:48*).
  - The five network modes are **permission presets** (L§8.2): each is a `.cfg.ray` rule set over `network` for `@public` targets — from allow, to allow-with-prompt-per-public-area, to visible only to `@ether`, to prompt-every-time, to deny.
  - "Tools only" disables NPC dialogue, cutscenes and lore; one toggle brings them back.
- **Decided** by the note itself: the onboarding order and choices above.

## 7. Networked world graph — *G:84–148*
> No random access: move through the graph to discover or copy it; synchronize the past, not the present. Nodes each hold a region (1–5 m²), render a 360° sweep for neighbours, lower detail with distance; collisions only on the same servers under X ms; hazy/veiled presence (delayed location packets).

- Proposal (engine/infrastructure, later):
  - Each node holds a region and its HLC-stamped history (L§9.2); neighbours receive summaries whose detail falls with distance.
  - Presence delay (*hazy*) and invisibility (*veiled* = infinite delay) are visibility settings of the location stream (L§8.3).
- **Decided:** out of scope until after the IDE.

## 8. Guided navigation language — *G:150–151, 171–196*
> Reformalize engineering, reverse-engineering, optimization and search into an intuitive language that guides exploration; whenever something can be brute-forced, it will be.

- Proposal: this is Ray itself with the superposition semantics already decided — `?` as unknown (L§10.1), superposed reader clashes resolved by use (L§3.6), range assignment superposing (L§1.6). A player's action narrows a superposition; the machine brute-forces whatever is left small enough.
- Events are recorded, not named (*G:192*): press a key, do the thing, then say when it happens — a recorded chain becomes a function, the latest event the default trigger.

## 9. Open questions carried from the note
- How do you initially calibrate a player's existing knowledge? (*G:4*)
- What makes a problem translatable into a game, and how hard is it? (*G:15*)
- How does resource gathering relate to the active quest? (*G:419–422*: a smithy that makes keys — a key pair is one item with two inside.)
- What does maze navigation mean for finding new problems? (*G:423*)
- What is gained in 3D, and what is lost (arbitrary name links)? (*G:180–183*)
