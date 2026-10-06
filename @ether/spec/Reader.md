# Ray — the reader, defined by the language (design, 2026-10-06)

The reader (what reads text into values and runs it) moves out of `v0.ts/src/kernel/.kernel.ray` into
`@ether/ray/.entrypoint.ray`, written in the semantics the language itself defines. `.kernel.ray` is a list of behaviours to
match, not code to port. Base commit before this work: `b3246d0`.

Status legend as in the other spec files. Everything here is **Proposed** until the user marks it.

---

## R0. Bootstrap

- **R0.1 The host knows no syntax** (2026-10-06, user: "I dont want the host to know any syntax thats the damn point of the
  bootstrap"). Its one assumption is about meaning: the entrypoint's first statement defines how rules are defined, and uses
  that definition in its own body. From `{pattern} => {body} => external rule pattern body` it infers, by comparing the two
  halves: the capture names (words of the body that the head wraps in the same pair of characters), the capture brackets
  (that pair), the definer (the literal between the head's captures that also follows the head), the access word and the
  primitive (the body's words that are not capture names, in order), and the statement end (what follows the body's last
  capture name). Nothing of this is written in the host; renaming any of it in the entrypoint renames it.
- **R0.2 What the host reads with.** Until the entrypoint hands reading over (R0.6), the host reads with the rules defined so
  far, matching only what it inferred: literals, captures between the learned brackets (stopping where the next literal
  matches, never across the learned statement end), and the learned statement end. Everything else — spaces, typed
  captures, line ends inside a statement, `|`, `[]`, narrowing, `Balanced`, `Continued` — is defined in the entrypoint.
- **R0.3 Passes until every grammar rule is read.** The entrypoint is read again and again; a rule takes effect the moment it
  is defined, and the next pass picks up what was written later. When a pass defines no rule the previous one did not and no
  definition failed, bootstrapping is done; other errors may remain (G1.8). Only then is any other file read.
- **R0.4 No interpreter.** A rule's body is read once, by the rules in reach, into a goto program over the externals (R0.7),
  which is written out as JS and run. Which rule reads a statement inside a body is decided when the body is compiled (again
  only when rules in reach change), never each time it runs. Native code is rebuilt at every start.
- **R0.5 Recursion is broken by construction.** The first statement is read by inference, never by a rule. A definition's
  head is read with the rules in reach before it. Applying a rule inside its own body is a call, never an expansion. A
  capture's type is evaluated once, when its rule is defined. The reader the entrypoint defines is compiled by the reader
  before it (the host's, or an earlier one): every rule and every piece of code is read into a program by the reader in force
  where it was written, and code of one reader sees only the rules defined while it was in force, so a later redefinition
  (a new `:=`, a new `=>`) never reaches into the reader that reads it.
- **R0.6 Handing over.** The entrypoint defines the full reader (R1–R5) in Ray and hands reading to it (`external reader`);
  from then on, later passes and every other file are read by it, as native code.
- **R0.7 Externals** — none of them syntax: make a node; read a member; write a member; whether two nodes are the same;
  `rule` (add a rule); `reader` (hand reading over); `goto`/`label` (the edges of the goto program a body compiles to); the
  host's natives (io, os, time, random, network, where). No integers: text is a chain of character nodes, one node per
  character, so comparing characters is identity; positions are places; counting is walking; numbers are `Number.ray`'s,
  mapped to native integers only by a removable Compiler-level optimisation.
- **R0.8 One file.** The host is a single file, set up as `language.ts` is (the CLI, the daemon and the LSP use it the same
  way); only the reading mechanics are the seed's.

## R1. Text and places

- **R1.1 Text is a String**, a Ray of `Char` (directive 2026-09-30: String IS characters). A source is a String with a
  location (`Location`, W). There is no separate "source + integer offset" model.
- **R1.2 A position is a place in that Ray** (P1.2: a span is a Ray, a subgraph of the text; `line:column` is derived and
  invertible). A span is a pair of places; reading moves a cursor along `.next`.
- **R1.3 Characters read as characters** (2026-10-06: grammar rules read characters inside a word). Words, operators and
  spaces are not tokens the reader is built on; they are patterns (R2) like any other. A literal word in a head matches
  only that word because the pattern says the character after it is not a word character (`⊣`/`⊢` anchors, G4.3), not
  because the reader tokenises.

## R2. Rules, patterns, types

- **R2.1 A rule is a method.** `pattern => body` defines a method on the scope it is written in (rules register on the
  class node, not GLOBAL). Applying a rule is calling that method with its captures. `=>` overrides, `&=>` superposes
  (G5.5, answered 2026-09-27).
- **R2.2 A pattern is a type** (T4.10). A head reads as a type: a literal reads exactly itself; `{x}` reads anything,
  `{x: T}` reads text as `T`; `,` is a sequence, `|` alternatives, `T[]` one or more, `T{p}` a narrowing, `[x]` an
  operator reference (G3.7), `{x?}` optional. Matching a statement against a rule is reading that String as the head's
  type. The mechanism that reads `{digits: Decimal.String}` on `"123"` is the same one that reads a statement.
- **R2.3 A type's reading rules are its own** (A's readers, 2026-10-06): a type carries the rules that read text as it
  (one per literal, `{one: T}{more: T[]}`, `{first: A}{rest: B,…}`), separate from its methods, so a method named like a
  word never reads text.
- **R2.4 A capture's type is a value of the rule**, evaluated once when the rule is defined (re-evaluated only when a name
  it could not find is declared, P5.1), never while another statement is read.
- **R2.5 Which reading wins.** Rules in reach are those of the scopes the code sees (R4.2). Among readings of a span:
  longest match first; between equally long readings, one led by a literal (a statement led by a word) reads the whole over
  one led by a capture (an operator between operands); then, between different rules, the one declared first reads the whole (declaration
  order is precedence, G3.1, and what is declared first binds loosest: a definition containing ` := ` is still a definition);
  a rule written with the same head as an earlier one overrides it (`=>`). Readings still equal are a superposition (U1), not a tie broken by a flag; `.first`/`#` pick.
- **R2.6 Text no rule reads** is an error, and the error is its diagnostic; reading goes on and the text stays an
  unresolved Expression that later rules may still read (G1.8).

## R3. Programs, lowering, native code

- **R3.1 A Program is a Ray with conditional edges** (P1.1). A statement read is a vertex; `goto L if c` is a conditional
  edge; a label `L\` is a place (`goto` into another branch is a call at that place, 2026-10-06). `if`/`while`/`unless`
  are classes whose bodies are such edges (control flow = classes).
- **R3.2 The floor** everything lowers to is the externals of R0.7: nodes, members, identity, `goto`/`label`, calls, the
  host's natives. Characters are nodes (R1); there are no integers.
- **R3.3 Lowering is a Compiler level** (P8): rewrite rules `{pattern} => replacement` over Programs, reducing every
  construct (classes, frames, superposition, typed captures, `dynamically`) to goto programs over R3.2. The level is a
  scope (`Program{O: Compiler.default}`); optimisations are separate rules in it, removable (2026-09-23).
- **R3.4 Emission** writes a goto program as JS, in the host's one file (R0.8): every body goes through the goto program
  first, then to JS; nothing is run any other way.

## R4. Values, frames, scopes

- **R4.1 A name is a place**; `x := v` declares, `=`/`:` evaluate to the variable (2026-09-22). A captured argument is lazy
  code (`**` gives the code); it is read where and when it is used.
- **R4.2 A frame is a scope that sees the frame it was written in** (`sees` before `inlined`, 2026-09-22). **A rule made
  inside a frame keeps that frame, as a closure does** — so a static, a field default or a cache can keep a value
  language-side (2026-10-06 statics finding).
- **R4.3 Members**: a value's own member before its class's rules (own key wins, 14eec7f); a later `&+=` overrides an
  earlier member of the same name; `f[k] = v` writes `f.k`.
- **R4.4 Classes, statics, defaults**: a class is a scope; statics and field defaults are read when first asked for and
  then held until what they read changes (L§2.3, T3.5, P5.1); `dynamically` re-runs on change (language-side, 677ac75).

## R5. What the reader also says

- **R5.1 Diagnostics** are values (`INFO@`, `ERROR@Type`, errors not Programs), each with the place it is about.
- **R5.2 Highlighting**: `^style` marks on rules (only highlighting, 2026-09-26); painting is what a reading's rules say.

## R6. Migration (on main, from `b3246d0`)

1. The host (R0) and the lowest layer (R3.1, R3.2): goto, labels, primitive calls as rules; proven end to end on a
   small loop (rule → Program → goto program → native → run).
2. Text and places (R1), then rules and patterns as types (R2), then statements and blocks (R3.1), frames and values
   (R4), classes (R4.4), diagnostics (R5), each in the entrypoint, each read by the layers before it.
3. Built beside the current reader until the core reads with the same diagnostics as today; then `.kernel.ray`, `k.ts`
   and the kernel compiler are deleted and `ray`/the LSP use the new reader.
4. Then the library, the renderers and version control (the goal of 2026-10-06).

## Decided

- **(2026-10-06, user)** A rule takes effect from the moment it is defined, within the same pass (R0.4.3); the next pass
  picks up what was written later in the file.
- **(2026-10-06, user)** Native code is rebuilt at every start, not kept on disk (R0.4).
- **(2026-10-06, user)** Where a statement ends is learned from the first statement (R0.1), not known by the host; what
  spans more is said by types defined in the entrypoint.
- **(2026-10-06, user)** No integers among the externals (R0.7).
