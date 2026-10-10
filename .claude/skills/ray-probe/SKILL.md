---
name: ray-probe
description: How to find out what the Ray engine actually does with a few lines, cheapest run first. Use before writing library code or claims, or when a claim behaves unexpectedly.
---

# Probing Ray

Ray's syntax is defined by its own rules and models have no training data for it. Never guess how a line reads: run
it. The `prober` agent does this in the scratchpad.

1. **A probe file of a few lines**, outside the repository. Each fact is a claim:
   `unless (<condition>) { INFO@mark \`PR1 <what should hold>\` }`. End it with a claim that must fire,
   `unless (1 == 2) { INFO@mark \`PR8 must fire\` }`; if it does not, reading stopped before the end.
2. **Run it**: from `@ether`, `node v0.ts/bin/ray.js -v <probe>` (build once with `node v0.ts/scripts/bundle.mjs`, which
   embeds the library; afterwards `git checkout -- v0.ts/src/bundled.ts`).
3. **Read the diagnostics** on each claim's line: none means it held; only its own message means it fired; anything
   else (`Unread`, `Unresolved`, ``No `x` on y``) means it did not really run.
4. **One test file**: from `@ether/v0.ts`, `node scripts/score.mjs <file>`.
