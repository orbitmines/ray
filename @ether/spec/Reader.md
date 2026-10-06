# Ray — the reader, defined by the language (design, 2026-10-06)

The reader (what reads text into values and runs it) moves out of `v0.ts/src/kernel/.kernel.ray` into
`@ether/ray/.entrypoint.ray`, written in the semantics the language itself defines. `.kernel.ray` is a list of behaviours to
match, not code to port. Base commit before this work: `b3246d0`.

Status legend as in the other spec files. Everything here is **Proposed** until the user marks it.

---

## R0. Bootstrap

- **R0.1 The axiom is the first statement (option c).** The host knows no spelling of the language. It reads the
  entrypoint's first statement by its structure only: captures `{…}`, the literal between them, and a body.
  `{pattern} => {body} => external rule pattern body` teaches it that `=>` defines a rule and that the first word of the
  body (`external`) reaches the host's primitives. Renaming `=>` or `external` in the entrypoint renames them everywhere.
  The capture brackets `{ }` are the only thing the host recognises (the "true bootstrap" left in 2026-10-01).
- **R0.2 Passes until every grammar rule is read.** The entrypoint is read again and again; each pass has every rule the
  pass before it defined, so a rule written late in the file reads statements written early. When a pass defines no rule
  the previous one did not, and no definition failed, bootstrapping is done. Other errors may remain (G1.8). Only then is
  any other file read (G1.3: until nothing changes; a cycle is a diagnostic).
- **R0.3 No interpreter.** A rule body is read once, by rules, into a Program; that Program is lowered (R3) to a goto
  program over the primitives; the goto program is emitted as native code (JS today, so V8's JIT; WASM possible). Reading
  the library, and running anything, is native code only.
- **R0.4 Recursion is broken by construction, not by guards.**
  1. The first statement is read structurally, never by a rule: the grammar rule never reads itself.
  2. A rule body is compiled the first time the rule applies, as a function. Applying a rule inside its own body is a
     call of that function (native recursion), never an inline expansion; there is no "expand until it stops".
  3. A pass reads a definition's head with the rules in reach *before* that definition (its own rule is not in reach
     for its own head). What it defines takes effect for the statements after it.
  4. A capture's type is evaluated once per piece when the rule is defined (R2.4), never while reading another statement.
  So nothing can loop while reading, other than a program that loops when run, which is that program's behaviour.
- **R0.5 The seed.** The only hand-written part, used when starting from nothing:
  - the structural reading of R0.1;
  - the primitives (R3.2), each a named native reached through the word R0.1 learned;
  - the emitter from a goto program to native code.
  Native code is rebuilt at every start (Decided, 2026-10-06): the host is a JS program that compiles `.ray` live, so
  each start reads the entrypoint and emits its code again; nothing is kept between runs.

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
  longest match first; then declaration order as precedence (G3.1, an `Ordered` number); `=>` overriding an earlier rule
  of the same head. Readings still equal are a superposition (U1), not a tie broken by a flag; `.first`/`#` pick.
- **R2.6 Text no rule reads** is an error, and the error is its diagnostic; reading goes on and the text stays an
  unresolved Expression that later rules may still read (G1.8).

## R3. Programs, lowering, native code

- **R3.1 A Program is a Ray with conditional edges** (P1.1). A statement read is a vertex; `goto L if c` is a conditional
  edge; a label `L\` is a place (`goto` into another branch is a call at that place, 2026-10-06). `if`/`while`/`unless`
  are classes whose bodies are such edges (control flow = classes).
- **R3.2 Primitives**, the floor everything lowers to (named natives, reached as R0.1 says):
  - memory: make a node, read and write a member of it;
  - characters: a String's next character and its code;
  - integers: arithmetic and comparison;
  - control: label and conditional jump, call and return;
  - the host's natives (io, os, time, random, network, where) as today.
- **R3.3 Lowering is a Compiler level** (P8): rewrite rules `{pattern} => replacement` over Programs, reducing every
  construct (classes, frames, superposition, typed captures, `dynamically`) to goto programs over R3.2. The level is a
  scope (`Program{O: Compiler.default}`); optimisations are separate rules in it, removable (2026-09-23).
- **R3.4 Emission** writes a goto program as native code: the existing goto→JS backend (`js.ts`) with its input changed
  from `.kernel.ray`'s own language to these Programs.

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

1. The seed (R0.5) and the lowest layer (R3.1, R3.2): goto, labels, primitive calls as rules; proven end to end on a
   small loop (rule → Program → goto program → native → run).
2. Text and places (R1), then rules and patterns as types (R2), then statements and blocks (R3.1), frames and values
   (R4), classes (R4.4), diagnostics (R5), each in the entrypoint, each read by the layers before it.
3. Built beside the current reader until the core reads with the same diagnostics as today; then `.kernel.ray`, `k.ts`
   and the kernel compiler are deleted and `ray`/the LSP use the new reader.
4. Then the library, the renderers and version control (the goal of 2026-10-06).

## Decided

- **(2026-10-06, user)** A rule takes effect from the moment it is defined, within the same pass (R0.4.3); the next pass
  picks up what was written later in the file.
- **(2026-10-06, user)** Native code is rebuilt at every start, not kept on disk (R0.5).
