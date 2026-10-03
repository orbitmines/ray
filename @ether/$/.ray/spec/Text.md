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

## X4. Encodings (*Encoding.ray*)

- **X4.1 Scope** — hashes (SHA, MD5, BLAKE3), ciphers, compressors, Base64: each "its own project". Which first? UUID v3/v5
  need MD5/SHA-1.
- **X4.2 Encrypted values** — read back only at a location holding the key; without it a quest is spawned. Encrypted value
  vs encrypted channel; don't evaluate in place, only read off to another location; homomorphic values not decoded.
- **X4.3 Keys** — a public key per Instance and per character.
- **X4.4 Storage encodings** — Fastlanes, ALP, FSST, dict, bitpacked, RLE, delta, PCodec, ZSTD, FFOR, chosen from
  statistics (L§9.1).

## X5. UUID (*UUID.ray*)

- **X5.1 Draft structure** — directive: follow the draft. `class UUID < Hexadecimal³² ~~ [~ 7 | +4 | +4 | +4].push_after("-")`;
  versions via `dynamically < v1 if version == 1`.
- **X5.2 v1** — a 60-bit timestamp since 1582-10-15 in 100 ns steps; node = `@me.instance#.mac_address`, or a random MAC with
  the multicast bit set. "Make sure each call yields a unique value"; "Say I want a unique value, I don't care how".
- **X5.3 A secondary implementation** — *UUID:170*: how to mark one that isn't used for reading from a string.
- **X5.4 Hex-letter round trip** — L§10.2 open bug.

## X6. IP (*IP.ray*)

- **X6.1 File name** — IP lives in `IP.ray` (the draft's name was `Test.ray`).
- **X6.2 `IP < Location &+ (-1 <- . -> +1)`** — an address is a location on a line.
- **X6.3 v6 constructor** — the draft reads both sides of `::` and an embedded v4; v0 stores eight segments. Directive: follow
  the draft.
- **X6.4 `as String` rules** — RFC 5952: lowercase, longest zero run, mixed notation for `::ffff:0:0/96` and `64:ff9b::/96`.
  "what is super for?" (*Test:261*).
- **X6.5 CIDR strings** — `"10.0.0.0/8"` read as `ip / prefix_length`.

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
- **X3.7** A pinned Unicode version is fetched once and never refetched (cached under `@ether`, X3.3);
  `latest` refetches on an explicit update.
- **X4.4** Storage encodings are deferred with X4.1; choosing them from statistics stays the store's rule.
- **X6.2** `IP < Location &+ (-1 <- . -> +1)` as the draft has it: `ip + 1` is the next address.
- **X6.4** IPv6 `as String` follows RFC 5952 as the draft writes it; the trailing `.super` is dropped.
- **X6.5** CIDR strings read as `ip / prefix_length`: the IP pattern with an optional `/n`.
