# Ray — Text, Unicode, encodings, identifiers spec (from `String.ray`, `Unicode.ray`, `Encoding.ray`, `UUID.ray`, `IP.ray`)

Status legend: **Decided** · **Open** · **See L§n**.
IDs `X…`. Answers go under **Decided** at the end.

---

## X1. String (*String.ray*)

- **X1.1 Multiline strings** — *String:389*: "String newline, respect spaces after the first one, which we trim completely."
  Open: the indentation rule for a multiline string (needed for F-C6 articles).
- **X1.2 Styling on strings** — *String:392*: "String aware of styling?" F-C2 decided `"…" ^italic`.
- **X1.3 Case operations** — lower/upper/title/swap/fold, snake/camel/pascal: Latin only today. With the Unicode tables:
  full case folding (`ß → SS`).
- **X1.4 Plural/singular** — English by suffix only. Open: keep, or a proper language-aware table?
- **X1.5 `String[] as String`** — `reduce(,)`; the `,` behaviour for graphs must be overridden (*String:397*).
- **X1.6 `as String` automatic** — *String:398, Test:216*: every class gets `as String` from its structure.
- **X1.7 `as String` depends on context** — *String:391*: in a `.ts` file it is different from another language.
- **X1.8 Custom symbols** — *String:412–416*: symbols not in Unicode as a String type of their own; copied out, they say
  they are custom. `((` is one.
- **X1.9 `.[LANG]`** — L§5.8.

From the drafts review (2026-10-06).

- **X1.10 `^`/`v` as case aliases** — **Q.** *.ray2/Language/String/String.ray:14–15*: `lower_case | lowercase | v`,
  `upper_case | uppercase | ^`. They clash with `^` as power/style (L§5.1, N1.12) and with `^`/`v` for super/subscript.
  Recommend: drop the `^`/`v` aliases for case.
  **Follows (2026-10-06):** the `^`/`v` aliases for case are dropped (v0's `String.ray` has only `upper_case | uppercase`, `lower_case | lowercase`), from L§5.1 (`^` is style and power) and N1.12 / Almanac A5 (super/subscripts; N1.21 answer: subscript is `v`).
- **X1.11 Editor glyph mappings inside strings** — **Q.** *.ray2/Language/String/String.ray:46*: how do escapes (`\n`, `\t`,
  `\x{}`) conflict with the editor's Unicode mappings for characters. Recommend: editor glyph mappings (`->` → `→`, G7.4)
  apply only outside string literals and escapes; inside a string the text is what was typed.
  **Follows (2026-10-06):** editor glyph mappings (`->` → `→`) apply only outside string literals and escapes; inside a string the text is what was typed, from L§1.1 (a literal is what was written) and G6.3/G7.4 (glyph styles are equivalences over code).
- **X1.12 Custom symbols as a String type** — **Q** (conflict with Decided X1.8, "custom symbols are dropped"). *IDE:665*
  (paraphrased): extend UTF-8 with custom symbols as a new String type; copied text marks which symbols are custom.
  Recommend (journal review): a `String` whose characters are `Char | Custom`, written out as plain UTF-8 with a fallback
  sequence per custom symbol and an inverse reading it back. Either keep X1.8 or reopen it.
  **Answered (user, 2026-10-06):** flagged for future support; X1.8 stands for now.
- **X1.13 Fields on substrings** — see P1.16 (**Decided (draft)**): a field set on a slice lives on that subgraph, which is
  how styles and marks (X3.4 DoNotEmit) sit on substrings.

## X2. Regex (*String:331–341, 402–410*)

- **X2.1 Regex as a language** — `/pattern/flags`; ASCII vs Unicode mode, `\p`; word border. L§10.5.
- **X2.2 The memory blow-up** — a recursive matcher over a two-character pattern exhausted 8 GB (project_regex_recursion).
  An engine bug to find first.

## X3. Unicode (*Unicode.ray*)

- **X3.1 The tables** — read from unicode.org through `io`, cached. With `⸨…⸩` templates (*Unicode:175, 191–203*): "I want
  a slightly different syntax for the template matching." Open: which syntax.
- **X3.2 Versions** — all Unicode versions via `%`; the UI hides glyphs newer than the selected version.
- **X3.3 Backups** — *Unicode:176*: all outside requests are backed up on the central ether server, used when the original
  is gone.
- **X3.4 Properties** — BidiBrackets, BidiMirroring, CaseFolding, DerivedAge, EastAsianWidth (needed by the TUI!),
  DoNotEmit (as flags on substrings), CompositionExclusions, collation (UCA).
- **X3.5 `Char.Latin`, `Char.Arabic`** — scripts as narrowings.
- **X3.6 Endianness** — LE/BE: "the same in isolation, opposites in conjunction".
- **X3.7 When to refetch** — *Unicode:189*: what decides evaluation, and whether to get a new version of a table.

From the drafts review (2026-10-06).

- **X3.8 `First`/`Last` ranges** — **Decided (draft).** *.ray2/Language/String/Unicode.ray:44–46* ("Todo First, Last in
  name"): UnicodeData rows named `<…, First>` and `<…, Last>` form one range entry covering every code point between them.
  (v0's `Unicode.Data` reads one row per code point.)
- **X3.9 Super- and subscripts from decomposition** — **Decided (draft).** *.ray2/Language/String/Unicode.ray:48–52*:
  `Unicode.Superscript` / `Unicode.Subscript` are the scalars whose decomposition is tagged `<super>` / `<sub>`, each mapping
  to its base character. Number's super/subscript readers use these sets, not lists (v0 *Number.ray:98–99*).
- **X3.10 Digits of every script** — **Q.** *.ray2/Language/String/Unicode.ray:54*: "Adhere to digit/numeric values, and
  implement them." Recommend: a Decimal digit is any scalar with a `decimal_digit_value` (`٣`, `৩`), and `numeric_value`
  gives `½`, `Ⅻ`; these readings are `suggest` equivalences, not defaults in code. (Also N1.)
  **Answered (user, 2026-10-06):** supported automatically as Unicode says: digit values of every script, and all string functionality tied to Unicode (super/subscripts to decimals, …), come from the Unicode data of the selected version. Universal support for every Unicode version is not in the library yet (to do).

From the drafts verification (2026-10-06).

- **X3.11 Editor fonts and super/subscripts** — *`.ray2/Language/String/Unicode.ray:52`*: "IntelliJ font doesnt support
  super/subscript, add support". **Open (tooling backlog)**: the IDE plugins (`ide/`) should render every super/subscript Ray
  uses (`Binary⁸`, `Binary₈ₙ`), falling back to a font that has them; which fonts ship is F-D16.

## X4. Encodings (*Encoding.ray*)

- **X4.1 Scope** — hashes (SHA, MD5, BLAKE3), ciphers, compressors, Base64: each "its own project". Which first? UUID v3/v5
  need MD5/SHA-1.
- **X4.2 Encrypted values** — read back only at a location holding the key; without it a quest is spawned. **(2026-10-06)** `opened` raises
  `ERROR@Key` there (so does `History.content_key`); the quest comes from the error. Encrypted value
  vs encrypted channel; don't evaluate in place, only read off to another location; homomorphic values not decoded.
- **X4.3 Keys** — a public key per Instance and per character.
- **X4.4 Storage encodings** — Fastlanes, ALP, FSST, dict, bitpacked, RLE, delta, PCodec, ZSTD, FFOR, chosen from
  statistics (L§9.1).

From the drafts review (2026-10-06).

- **X4.5 Never decrypted in place** — **Decided (draft).** *.ray2/Language/Encoding.ray:6*: an `Encrypted<T>` is never
  decrypted where it is stored, only when read off to a location holding the key. (Listed in X4.2, missing from its
  Decided text.)

From the drafts verification (2026-10-06).

- **X4.6 Naming the channel** — *`.ray2/Language/Encoding.ray:1`*: "How to reference the channel the Instance communicates
  over?" **Q** — Recommend: the channel is a value: the session between two instances (the handshake, W2.1) is reachable from
  the location it connects to, carrying its encryption and keys, so "encrypted channel" (X4.2) is a property of that value, not
  of the data sent over it.
- **X4.7 Where encryption applies** — *`.ray2/Language/Encoding.ray:4`*: "Which targets like (disk/mirror)". **Q** —
  Recommend: per location a value is stored at or sent to (at rest on a disk, on each mirror, on the wire); each target's policy
  is a narrowing on that location (`@private & encrypted`, W5), so a mirror may hold only ciphertext (X4.5).

## X5. UUID (*UUID.ray*)

- **X5.1 Draft structure** — directive: follow the draft. `class UUID < Hexadecimal³² ~~ [~ 7 | +4 | +4 | +4].push_after("-")`;
  versions via `dynamically < v1 if version == 1`.
- **X5.2 v1** — a 60-bit timestamp since 1582-10-15 in 100 ns steps; node = `@me.instance#.mac_address`, or a random MAC with
  the multicast bit set. "Make sure each call yields a unique value"; "Say I want a unique value, I don't care how".
- **X5.3 A secondary implementation** — *UUID:170*: how to mark one that isn't used for reading from a string.
- **X5.4 Hex-letter round trip** — L§10.2 open bug.

From the drafts review (2026-10-06).

- **X5.5 v1 read back, and its limit** — **Q.** *…/Ether/instance/utils/UUID.ray:1, 26–27*: what if the time exceeds 60
  bits; the compiler should reverse the time from the other three fields; an OS that allows custom v1 generation overrides
  it. Recommend: `uuid.time as Time` is the inverse of generation (L§4.5); a stamp past 60 bits (year 5236) is an error; an
  OS level may supply v1 generation (W6.9).
  **Follows (2026-10-06):** `uuid.time as Time` is the inverse of generation, derived because every step is reversible; a stamp past 60 bits (year 5236) fails `time: Binary₆₀` and is an error; an OS level may supply v1 generation, from L§4.5 (an inverse is derived when every step is reversible), X5.2's structure and W6.9.
- **X5.6 Identity-derived UUIDs** — **Q.** *…/Ether/instance/Entity.ray:91*, *…/Expression.ray:49*: a player's UUID node
  is generated from its public key and the time is when it joined; a history's UUIDs use a key-derived node and the last
  edit time. *.%/ORIGINAL-UUID-OF-OBJECT.ray:4*: a project uses the player's/organisation's public key for generating its
  UUIDs. Two recommendations: (a) a v1 UUID whose node is derived from the key (`_todo` review); (b) a name-based v5 in the
  namespace of the owner's key, reproducible per owner (misc review). Otherwise keep v4 (v0 `Character.id`). Note X4.1
  leaves v3/v5 unimplemented.
  **Answered (user, 2026-10-06):** v1 with a key-derived node (L§9.2.13).
- **X5.7 `UUID.version`; `choose{unique}`** — *Almanac.tsx:2345, 2348*. **Decided (Almanac):** a UUID exposes `.version`.
  **Q** (conflict): the Almanac writes `choose{unique} UUID.v1`, as X5.2 first did; the 2026-10-05 supersession writes
  `choose UUID.v1{unique}`. Recommend: keep 2026-10-05 and update the Almanac line.
  **Answered (user, 2026-10-06):** keep 2026-10-05, `choose UUID.v1{unique}`; the Almanac line is to be updated.

From the drafts verification (2026-10-06).

- **X5.8 The v1 time fields' order** — *`…/utils/UUID.ray:18`*: "This is not the right order, should be defined differently.",
  on the alternative `(time_high, time_mid, time_low) = time: Binary⁶⁰` ("The timestamp is a 60-bit value", RFC 4122 §4.1.4).
  **Q** — Recommend: as v0 has it (`UUID.ray:29`): the layout is the fields in byte order (`time_low`, `time_mid`,
  `time_high_and_version`), and the 60-bit time is a derived binding in numeric order (high, mid, low), not a second layout of
  the same bits. Keep the RFC citation.

## X6. IP (*IP.ray*)

- **X6.1 File name** — IP lives in `IP.ray` (the draft's name was `Test.ray`).
- **X6.2 `IP < Location &+ (-1 <- . -> +1)`** — an address is a location on a line.
- **X6.3 v6 constructor** — the draft reads both sides of `::` and an embedded v4; v0 stores eight segments. Directive: follow
  the draft.
- **X6.4 `as String` rules** — RFC 5952: lowercase, longest zero run, mixed notation for `::ffff:0:0/96` and `64:ff9b::/96`.
  "what is super for?" (*Test:261*).
- **X6.5 CIDR strings** — `"10.0.0.0/8"` read as `ip / prefix_length`.

From the drafts review (2026-10-06).

- **X6.6 CIDR is a superposition** — **Q** (conflict). The draft (*7250308 Test.ray:24–31, 41–48*): `/ prefix_length` sets
  `binary_form[prefix_length..] = 0 | 1` and answers it, and `as String` prints `…/n` because it detects trailing superposed
  bits. v0 (*IP.ray:10, 21–26*) stores a `prefix: Number?` field, zeroes the bits and has a separate `hosts`. Decided X6.5
  only fixes the reading. Recommend the draft (superposition over a flag): `ip / n` is the superposition of every address in
  the block, printed as CIDR because its low bits are `0 | 1`; no `prefix` field.
  **Answered (user, 2026-10-06):** the draft. `ip / n` is the superposition of every address in the block (low bits `0 | 1`), written as CIDR because of that; v0's `prefix` field goes.
- **X6.7 Well-known prefixes are IP values** — **Decided (draft).** *removed …/Ether/instance/Network.ray:229 (7250308^)*:
  the test against `::ffff:0:0/96`, `64:ff9b::/96` is `==.instance_of` that IP value (a superposition if X6.6 is adopted), not a text
  comparison (v0 writes `. is "::ffff:0.0.0.0/96"`). Keep the RFC 5952 / RFC 6052 comments.
  (2026-10-06: v0 `IP.ray:60` compares the well-known prefixes as text for now; that line stays as the author wrote it.)
- **X6.8 Choosing among matches; what `~=` leaves** — **Q.** *7250308 Test.ray:89* (`#{length == min() & leftmost}`, "How to
  iterate over @ like min. and leftmost"); *removed Network.ray:213–214 (7250308^)* ("default functionality of `~=` is
  removed from surrounding context unless X?"; a match that is itself a superposition). Recommend: inside `#{…}`, `min()` /
  `leftmost` aggregate over the superposition; `xs.max(by)` is the superposition of the tied ones and `.first`/`.last` picks
  by position; `x ~= p` answers selections that stay in their context and does not change x (`.remove` on a match removes
  it); a superposed match is one match, `.expand` unfolds it. (Also R3.10, R3, U9.)
  **Follows (2026-10-06):** as R3.22 and R3.23 (recorded there): inside `#{…}`, `min()` / `leftmost` aggregate over the superposition; `xs.max(by)` is the superposition of the tied ones and `#.first`/`#.last` picks by position; `x ~= p` answers selections that stay in their context and does not change x (`.remove` on a match removes it); a superposed match is one match, `.expand` unfolds it, from U1, R3.4, T2.3, L§1.2 and R3.1.
- **X6.9 IP ranges** — **Q.** *7250308 Test.ray:38* (`//TODO Range`). Recommend: `ip1..ip2` is the range over X6.2's line
  (R4), with no IP-specific code.
  **Follows (2026-10-06):** `ip1..ip2` is the range over X6.2's line, with no IP-specific code, from X6.2 (an address is a location on a line) and R4.1 (ranges are rays).

---

## Decided

Answers from 2026-09-30.

- **X1.1** A multiline string loses the indentation of its least-indented content line. A blank line
  right after the opening quote or right before the closing one is dropped.
- **X1.4** `plural`/`singular` keep the English suffix rule for now; a per-language table later.
- **X1.6** Every class gets `as String` automatically: a class declared by a pattern (UUID, IP) prints
  by running its reader backwards; others print their fields (F-D4).
- **X1.8** Custom (non-Unicode) symbols are dropped.
- **X3.1** The tables are read with class patterns, not `⸨⸩` (`Universal.md` U11).
- **X3.2** Unicode is versioned from the start (`Unicode %15`); the UI hides glyphs newer than the
  selected version.
- **X3.3** Outside requests are kept locally under `@ether`, with the `@https://…` tree set up
  recursively inside it (not a mirror setup). Only when configured is it synced to the central
  Ether server.
- **X4.1** No encodings for now. They will be implemented through the Ether Library setup, which
  reads other implementations as languages. UUID v3/v5 stay unimplemented for now.
- **X6.1** `Test.ray` is renamed to `IP.ray`.
- **X5.2** Uniqueness is a constraint on choose: `choose{unique} UUID.v1`. How it is guaranteed is up to
  the runtime.
  **Superseded 2026-10-05:** `choose` takes one value and has no filter; the constraint is on the type: `choose UUID.v1{unique}`.
  Filters belong to methods that take them (`[1, 2, 3].map{choose 1}(*10)`); `choose 3 boolean` is `choose (3 boolean)`.
- **X5.3** A secondary implementation can be an entry point `~name` (only `~default` reads text), a `|`
  alternative on the method (as the boolean operators were drafted, U1), or an optimization. Several
  ways are fine; pick what fits the case.
- **X6.3** IPv6 follows the draft's structure (`left`, `::`, `right`, an embedded v4, stored as read);
  `segments` is derived.
- **X3.4** EastAsianWidth is the first Unicode table read, with the TUI.
- **X2** Regex comes through the Ether Library setup, like the encodings (X4.1). The recursion memory
  bug still needs finding as an engine issue.
- **X4.2/X4.3** The semantics of encrypted values now (`Encrypted<T>`, readable only at a location holding
  the key; public keys per instance and character); the algorithms later.
- **X1.5** `String[] as String` joins without a separator (`"ABC" == "A", "B", "C"`); `.join(sep)` adds one.
- **X1.7** `as String` prints in the language of the file it is written in (`$.ext`, P7.1).
- **Covered elsewhere:** X1.2 (F-C2), X1.9 (L§5.8), X2.1/X2.2 (X2), X5.1 (the directive to follow the draft), X5.4 (the open bug in L§10.2).
- **X1.3** Case operations for all scripts (full folding, `ß` → `SS`) come with the Unicode tables
  (CaseFolding read as a class pattern).
- **X3.5** Scripts are Char narrowings from the tables: `Char.Latin`, `Char.Arabic`.
- **X3.6** Endianness is a direction on the bytes: little-endian reads them right-to-left, and a single
  byte is the same either way.
  (2026-10-06: no `Endianness` enum; `Unicode.LittleEndian` is a narrowing of a transformation format whose bytes are `<-` the big-endian ones.)
- **X3.7** A pinned Unicode version is fetched once and never refetched (cached under `@ether`, X3.3);
  `latest` refetches on an explicit update.
- **X4.4** Storage encodings are deferred with X4.1; choosing them from statistics stays the store's rule.
- **X6.2** `IP < Location &+ (-1 <- . -> +1)` as the draft has it: `ip + 1` is the next address.
- **X6.4** IPv6 `as String` follows RFC 5952 as the draft writes it; the trailing `.super` is dropped.
- **X6.5** CIDR strings read as `ip / prefix_length`: the IP pattern with an optional `/n`.
