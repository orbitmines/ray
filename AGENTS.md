# Ray: start here

Agents do the work in this repository; the user decides direction, the kernel, and every Proposed, Open or Q item.

Read first, in order:

1. `@ether/spec/Philosophy.md`: how the language is meant to be.
2. `@ether/spec/Plan.md` §0 to §2: what to read next, the rules that are never broken, how to work.

## Running a test file

Tests are claims in `tests/*.ray`: `unless (<condition>) { INFO@mark \`<ID> <what should hold>\` }`.

- Build once: `cd @ether/v0.ts && node scripts/bundle.mjs` (it embeds the library; afterwards
  `git checkout -- src/bundled.ts` and remove the `LICENSE` and `README.md` it copies in).
- Run one file from `@ether`: `node v0.ts/bin/ray.js -v ray/tests/app/boolean.ray`.
- Read the diagnostics on each claim's lines: none means it held; only its own message means it fired; anything
  else (`Unread`, `Unresolved`, ``No `x` on y``) means it never really ran, which is not a pass.
- A claim is done when a run shows it holding, not when a probe looks green.

## The harness (`.claude/`)

- `skills/`: how to probe (`ray-probe`), write a claim (`ray-claim`), and ask a decision (`ray-decide`).
- `agents/prober.md`: a small agent that answers one question about the engine by running a probe.
- `settings.json`: no Claude attribution on commits or PRs, and destructive git and `rm` commands are denied.
- Everything here is meant to be changed. Personal settings go in `.claude/settings.local.json`, which stays
  out of git.
