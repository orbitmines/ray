# Ether — Library Project backlog (2028)

The Library Project reads and lifts foreign software into Ray: extracting features, comparing
languages, and a decentralised index of applications. P8.13 decided this is the Library Project's,
not this spec's; this file is its backlog, the way W7 holds the IDE's, so that nothing is lost.
Nothing in it is implemented. Every item is **Q** (needs your decision) unless marked otherwise.
IDs `LIB…`.

Principle: Ray itself is the IR. What is read from foreign software is Ray values and equivalences
(L§3.5), never an intermediate record vocabulary; alternatives are superpositions, not enums or flags.

Sources, all paraphrased: *LIB:line* = private-journal `2028? Project - Library.md`;
*IDE:line* = private-journal `Project - IDE - The Ether (2027->).md`; year notes by path:line;
`library/Index.ray`, `library/index.ts` and `projects/library/README.md` under `@ether/`.

---

## 1. From the drafts review (2026-10-06): the journal

- **LIB1 Getting into a first language, and from there into the others.** *LIB:9–27*: from one
  language, extract its frontends and backends and the other languages represented in it; walk
  forward and backward through all its versions. Starting points, each with a tradeoff: operating
  system executables (few, already a universal language in practice, hard to interpret), LLVM, C.
  Lifting chains to try: binary → LLVM → a language; binary → LLVM → C++; binary → LLVM → C++ →
  JavaScript (V8); binary → JavaScript (V8). L§8.4's binary inspection (`$/elf`, …) is only the first
  step. **Q.** Recommend: each step of a chain is a level (`$.elf` → `$.llvm` → …) and a chain is
  their composition; which starting point first is your call.
- **LIB2 What to extract from software.** *LIB:34–57, 69–82*; *IDE:16–44* (covered by P8.13 by
  deferral only):
  - features, each a "language" distinct on its own; what is shown and how it is used, mapped onto
    functionality;
  - account services, into the `@`-space;
  - APIs, with grammars as types and compilers between grammars as programs;
  - what the software accesses: permissions, assets, the ISA, the optimizations of a simpler
    specification;
  - diffs across versions, including whether an extracted API stays backward compatible;
  - a choice between two-way compilation and lifting to new primitives;
  - injecting a new feature into the recompiled code or into the binary itself (integrity checks
    handled); interop is asymmetric (C++ to Ruby is easy, Ruby to C++ hard);
  - an operating system that runs every other operating system's executables;
  - a reverse equivalence graph: abstract definitions added instead of specific code; the original
    source of generated code found and linked back; the original high-level language guessed;
  - custom compile rules per pair of languages; debugging at several levels of description;
    configuring values at every endpoint, network call, database and file.
  **Q.** Recommend: a feature is a type over the program's behaviour (a narrowing), an extracted
  API is a set of equivalences into Ray, and a version diff is the history (L§9.2), so none of this
  needs its own record format.
- **LIB3 Comparing languages.** *LIB:84–171*, *IDE:20–22, 806–820*, year notes 2023. Every metric is a
  judgement from a reference frame: what something is "currently", not what it "is". Fix a universal
  language as the frame, lift into another, and subtract the complexity the change of frame adds.
  Usefulness is cultural and depends on preferences. Measures: grammar verbosity; runtime complexity
  and at which layer; sequential vs parallel complexity in time and space; access to a program's
  spatial structure; abstraction ceiling; flexibility; competence with infinities and time; how hard
  one language is to learn from another; competence with and without its libraries; duplication
  across libraries; the cost of induction (building a model) vs deduction (using it), *IDE:815–818*.
  Also: compare LLMs as implementations of English; search for new useful languages by these
  criteria; learn to represent assembly minimally (*LIB:104*). **Q.** Recommend: Ray is the
  reference frame; each measure is a benchmark value (Gamification §2) over the lifted programs.
- **LIB4 A decentralised index of applications.** *IDE:851, 611*: an index of all applications and
  their functionality, user data kept apart from public data (the Archive project); a standing prompt
  "extract this feature from this binary". **Q.** Recommend: the index is a `T$` query over
  locations (W1.5), and a standing prompt is a quest (Gamification §1).
- **LIB5 Interpretations to target first.** *`year/2023/daily/2023-09-01.md:28–43`*: WebAssembly
  directly (web developers), ZX-calculus (quantum physics), category theory / HoTT (academics); show a
  program at several levels of description (binary, text, abstract WASM, a language implemented in
  WASM). `$/wasm` is planned at L§8.4. An interface's grammar being what its user knows or supplies
  (*:34*) is covered by A10. **Q.** Recommend: WASM first, since `$/wasm` is already planned.
- **LIB6 Notifications when an equivalence breaks.** *`year/2023/daily/2023-09-11.md:2–3`*: when a
  dependency changes, find the equivalences it breaks and ask a human to approve the newly proposed
  ones; mark which features of a language (across versions) are known to match, with a way into what
  is not yet defined. L§9.2 has notifications, L§10.8 the `suggest` kind. **Q.** Recommend: a proposed
  equivalence is a `suggest` until approved, and approving it is a quest.
- **LIB7 Analysis without hand-written grammars.** *`projects/library/README.md:22`*: compare
  languages without the manual labour of specifying their grammars. **Decided (draft)** as the
  project's goal (P7.3 keeps "when is a mapping a language?" as its research question). The rest of
  the README and `Project Index.md` is a research link index.

## 2. From the drafts review (2026-10-06): the language index (`library/Index.ray`, `library/index.ts`)

The misc review recommends these as an Open block under Program.md P7; they are the Library
Project's by P8.13, and are kept here as well.

- **LIB8 Authors from repositories.** *Index.ray:1*: generate characters for authors and
  organizations (`@"github.com".@USERNAME`) from the changes in that directory of the repository.
  **Q.** Recommend: keep as backlog; authors are read from the repository's history (L§9.2).
- **LIB9 Object formats.** *Index.ray:2* (`.s` / `.o` for machine-specific targets);
  *`Project Index.md:23–47`* lists object formats × architectures. L§8.4 plans `$/elf`, `$/pe`,
  `$/macho`, `$/wasm`. **Q.** Recommend adding COFF, XCOFF, GOFF, SPIR-V and DXContainer to that list.
- **LIB10 Implementations × targets.** *Index.ray:4–30*: a language is the source, since it defines
  `as Program`; the implementation language is what `as Program` uses; targets are the `as (: Language)`
  defined; `(Implementation <-)? . (-> Target)?` with location information per implementation;
  `namespace Agda … &= | Agda | Metamath <- . -> | C++ | JavaScript`; implementations needing
  several languages (`| TypeScript & C =>`). **Q.** Recommend: these are the edges of the equivalence
  graph (L§3.5), superposed, not a separate table.
- **LIB11 Versions, children, partial libraries.** *Index.ray:38–47*: versions as repo tags vs
  separate repos vs archived files; child languages; a library as a (partial) implementation of a
  language (set.mm for SetTheory & Logic), and how to flag partialness; the expression is part of
  version control; `< SetTheory` starts a branch of SetTheory at that version; nested names reachable
  flat when unambiguous; distinguishing which path the equivalences took (`as C++ as Program`).
  **Q.** Recommend: keep as backlog; versions are history (L§9.2), partialness is a narrowing of the
  language implemented.
- **LIB12 Locations that depend on the implementing language.** *Index.ray:778–780*:
  `location &= this<Agda> ? (…agda-unimath…) : (…UniMath…)`, a different history for Agda vs Rocq;
  *:669* a mirror with all archived versions; *:793* a library in a target language set as
  `Metamath["set.mm"]`. **Q.** Recommend: keep as backlog.
- **LIB13 Encodings as languages.** *Index.ray:782–790*: `FileEncodings => static{Expression
  ==.instance_of File}`, `UTF-8: Language (i: File): String`; any `as` conversion is a language when
  its result depends on the input. Matches P7.1/P7.3. **Q.** Recommend adding the `as`-is-a-language
  criterion to P7.3.
- **LIB14 Index entry shape.** `namespace X | "Display Name" < Language(".ext" | "BUILD") ;
  location &= "url" & "url"`, with `< Tool` / `< Library` / `< Language` as kinds, several parents
  (`< Library, SetTheory`), and `location &=` superposing mirrors. L§9.1 resolves `$.name` by
  extension but does not take this index. **Q.** Recommend: later, `$.name` falls back to this index,
  fetching as a Quest.
- **LIB15 Places to get a toolchain from.** *library/index.ts*: toolchains as a recursive
  frontend/backend graph; every place (official, GitHub, apt via snapshot.debian.org, pacman via the
  Arch archive, dnf via Koji, brew, git with tags as versions) has one shape, list / resolve(version)
  / install; layout `.ether/external/@/<host>/<path>` → `.ether/external/@/<tool>/<version>`;
  `.backend(node)` selects any node and the walk finds the path; dpkg version ordering; list every
  place whether or not it installs on this host. Conflicts with L§8.4 (no process calls) and the
  package managers removed on 2026-10-06. **Q.** Recommend: keep it as the reference design, restated
  in Ray terms: a place is a Language whose level reads a version listing, and installing is reading
  a location (`@https://…`) into the store (L§9.1 caches).

From the drafts verification (2026-10-06). `library/` is now `@ether/library/`.

- **LIB16 Licences of what is indexed.** *`library/README.md:27`*: "[[Legal]]: Just exclude the ones without
  open licenses *or contact all of them to lift the licenses*." **Decided (draft)**: the Library indexes
  languages and libraries under open licences; the others are left out until their authors agree. **Q.**
  Recommend: an entry's licence is a field, so the exclusion is a narrowing (`Language{licence is Open}`).
- **LIB17 Writing up, people, collaborators.** *`library/README.md:23–26`*: compile scripts so a writing or
  study of the index compiles to PDF/LaTeX; a People Index of who to contact; finding collaborators who are
  compiling something similar. **Open (project backlog).**
- **LIB18 The index is generated and checked.** *Index.ray:49*: "All these need to be checked,
  autogenerated." **Decided (draft)**: entries are generated (from repositories and registries, LIB8, LIB15)
  and checked, not kept by hand; the hand-written list is the seed.
- **LIB19 Stub files.** *Index.ray:542*: "What about ".pyi"" under Python. **Q.** Recommend: a typing-only
  companion extension (`.pyi`, `.d.ts`, `.mli`) is a second extension of its language, read as declarations
  only (a narrowing of the language).
- **LIB20 A language is a class, an instance and a program.** *index.ts:280*: "the C++ language: one class is
  language + instance + program". **Decided (draft)**, as P7.1: a Language value is also the Program that reads
  it and an instance one can run; no separate records.
- **LIB21 Releases, and where a tool is configured.** *index.ts:209–210, 238*: git tags are filtered to real
  releases (a `releases` pattern, so vendor and init tags like `vendors/ARM/…` or `llvmorg-23-init` are not
  versions); "the edge configures the generic place for this tool (meaningful, not identity)". **Decided
  (draft)**: a place's versions are the tags matching the tool's release pattern, and per-tool configuration
  sits on the edge from the tool to the place (LIB15), not on the place, which stays generic.
