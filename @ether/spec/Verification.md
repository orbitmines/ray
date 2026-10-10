# Ray: verification (proposal, 2026-10-10)

Agents now write most of the code here, so the limit on progress is no longer how much can be written but how much
can be checked. The engine has been started over about twenty times since 2024, eight of them in the first week of
October 2026, and about 13% of all lines ever added on main survive. A rewrite is not the problem; a compact kernel is
a good direction. The problem is that nothing decides when a rewrite is done, so each one replaces the last by
declaration and working behaviour is lost on the way.

This file proposes four things: a score for every change (V1), no claim passing without being read (V2), a contest
that decides when a new kernel ships (V3), and checks nobody can fake (V4). Measurements quoted were taken on
`65b21392` and `d7f46bb9` with Node 26.

Status legend as in the other spec files. Everything here is **Proposed** until the user marks it. IDs `V…`. Each item
says what already exists (by ID), the gap, and the proposal; **Q** items carry a recommendation and name the claim or
check that would decide them. Reader.md and Ray.md share the `R` prefix, so their IDs are written "Reader R2.6" and
"Ray R2.6".

---

## V1. The scoreboard

- **V1.1 A score per change.** Exists: the `k4/all.sh` bar (Compiler.md:3), the regression set (Overnight.md:361),
  "whole suite: about once a day" (Plan.md:210). Gap: none of it runs in CI; `release.yml` builds, smoke-tests the
  installers and publishes, and runs no `.ray` tests. Proposal: every `tests/*.ray` file is run and each claim is
  recorded by its ID as passed, failed or errored, in one score file kept in the repository. The score is the count of
  passed claims. CI runs it when a file that can change a score changes. Measured: two full runs agree on every claim.
- **V1.2 The ratchet.** A change that turns a passed claim into failed or errored is refused unless the user accepts
  it and its commit names the claim and why. **Q**: Recommend: only the user can accept an exception; decided by
  check `ratchet` (a claim made to fail is refused). Measured: against the score of `65b21392`, `d7f46bb9` passes 15
  more claims and 12 fewer (HT14, CO25, CO35, RV6, IDY9, LGO1, GX5, NRW2, AC7, AC9, AC10, QU2); the ratchet would have
  listed those 12 before the commit landed.
- **V1.3 A file that cannot start is reported apart from its claims.** The shared header statement
  `mark ^keyword := global` does not read on the shipped kernel (`Unread`, `Unresolved mark`) in most test files.
  Counting every claim of such a file as errored would score nearly everything zero, so the header error is recorded
  per file and claims are judged on their own lines.

## V2. No silent passes

- **V2.1 A claim that reports anything but itself is not a pass.** Exists as a rule: G1.8 ("text no rule reads is an
  error") and Reader R2.6. Gap: a report on a claim's lines did not fail the claim. Proposal: a claim covers its lines
  from `unless`/`if` to its `INFO@mark`; any diagnostic there other than its own message makes it errored.
  **Follows (proposed):** from G1.8.
- **V2.2 A claim that cannot be evaluated is not a pass.** Known as incidents: "an `unless (x == y)` claim never
  fires" (Overnight.md:22), "the BO23/BO24/BOR claims were vacuous" (Overnight.md:351), "the run looks falsely green"
  (Plan.md:204 to 205), B14. Measured on the shipped kernel: a member read that finds nothing gives nothing without a
  report, and `unless` on nothing does not fire, so 81 claims passed with nothing read (EDS3 because `Ed25519.verify`
  does not exist at run time; TZ4 because `TimeZone.source` does not). Proposal: the kernel that ships reports a member
  read that finds nothing, as it reports unread text. **Q**: Recommend: yes, in the kernel that ships next; decided by
  claim UI35 with its member renamed to one that does not exist.
- **V2.3 Canaries per file.** Each test file is run with one claim that must fire and one that must hold, appended to
  a temporary copy; if either is wrong, the file stopped reading somewhere and its claims count as errored. Measured:
  in 6 grammar tests (`ray/tests/cycle3.ray`, `cycle4.ray`, `direction.ray`, `self.ray`, `string.ray`, `tail.ray`) the
  claim that must fire does not.

## V3. A new kernel ships when it wins

- **V3.1 One kernel ships; the others compete.** Exists: Reader R0.1 (the host knows no syntax), Reader §6 item 3
  (delete the old kernel once the reader matches), L§7.4.1 (externals are the compatibility surface); `language3.ts`
  with `.entrypoint.ray2` is the compact kernel the language is moving to. Gap: kernels replaced each other by
  declaration, and nothing measured whether the new one does what the old one did. Proposal: the shipped kernel is the
  one the CLI and the language server run; any other kernel is a challenger, scored on the same suite. A challenger
  ships when it passes more claims than the shipped kernel, never before.
- **V3.2 The challenger's to-do list.** Proposal: each contest writes the claims the shipped kernel passes and the
  challenger does not, by file, and those the challenger already passes and the shipped kernel does not. "Almost
  works" becomes a list. The contest runs when a kernel, its runner or the library changes.
- **V3.3 One closed list of trusted natives.** Exists: P8.2 (numbers counted, not walked), Reader.md:49. Gap:
  `SHA256.ray` takes cube roots with `root`, a linear scan (`Number.ray:61`) of at least 2^97 steps per constant.
  Proposal: what the library needs natively (big integers, exact roots, rotations) is declared in one list of trusted
  externals per kernel, each entry with its own claims. **Q**: Recommend: allowed under Reader R0.7 because the list is
  closed and every entry is tested; decided by claims that compute SHA-256's K[0] and K[63] with `root`.

## V4. Oracles

- **V4.1 Official test values.** Exists: FIPS 180 (SHT1 to SHT5), RFC 8032 (`$/ed25519/tests`), RFC 7748
  (`$/x25519/tests`). Proposal: every `$/` project that implements a standard with published test vectors carries
  them, taken from the fetched text and checked against a reference implementation before they are written; outputs of
  reference encoders are labelled as such. Found while doing it: WS3 expected a WebSocket accept key that appears
  nowhere in RFC 6455.
- **V4.2 Real files, pinned.** Each format reads a small pinned corpus of real files (each listed with its size,
  SHA-256, licence and source or the command that made it) and writes them back: the bytes must match, or for formats
  with many valid encodings, decoding the written file must give the same values. A script verifies the manifests and
  refuses changed bytes.
- **V4.3 Reference outputs.** The same inputs go through Ray and reference implementations (node:crypto, node:zlib and
  others as needed); the reference outputs are written as generated claims, and a check fails when a reference changes
  or a generated file was edited.
- **V4.4 A format class is its own oracle generator.** A two-way class (`Deflate.ray` `Data`) is the parser and the
  writer at once, so V4.2 comes free for every format written that way: round-trip claims read with the class and
  write back with the same declaration, asking `is <class>` first so an undeclared class cannot pass them (V2.2).

---

## Decided

None yet.
