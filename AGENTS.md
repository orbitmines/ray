# Ray: start here

Agents do the work in this repository; the user decides direction, the kernel, and every Proposed, Open or Q item.

Read first, in order:

1. `@ether/spec/Philosophy.md`: how the language is meant to be.
2. `@ether/spec/Plan.md` §0 to §2: what to read next, the rules that are never broken, how to work.
3. `@ether/spec/Verification.md`: how work is scored.

## The score

- `node @ether/v0.ts/scripts/score.mjs [files]` scores each claim in `tests/*.ray` as passed, failed or errored.
  File paths are relative to `@ether`; with none it runs the whole suite (about 10 minutes).
- `--check` compares with `@ether/v0.ts/score.json` and fails when a claim that passed no longer passes.
  `--write` records a new baseline: use it when claims were added, or a regression was accepted on purpose.
- A claim is done when the score records it passing, not when a probe looks green.

## The harness (`.claude/`)

- `settings.json` and `hooks/gate.mjs`: the score is shown when a session starts; an edit to the kernel
  (`@ether/v0.ts/src/`, `@ether/ray/.entrypoint.ray*`) asks first; a commit runs the ratchet on the test files it
  touches. CI runs the whole suite.
- `skills/`: how to probe (`ray-probe`), write a claim (`ray-claim`), and ask a decision (`ray-decide`).
- `agents/`: `prober` and `scorer`, small agents the skills use.
- Everything here is meant to be changed. Personal settings go in `.claude/settings.local.json`, which stays out of
  git.
