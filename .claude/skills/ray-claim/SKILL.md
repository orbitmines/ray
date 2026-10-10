---
name: ray-claim
description: How to write and score a Ray test claim. Use when adding or changing a claim in a tests/*.ray file, or deciding whether something is done.
---

# Claims

```ray
unless (<condition>) { INFO@mark `<ID> <what should hold>` }
```

- Claims come before code: write them, see them fail, then make them hold.
- The ID is the file's prefix plus an unused number; check with `grep -rn 'INFO@mark \`<ID> ' @ether` first.
- One fact per claim; the message says what should hold.
- Prefer a condition that reads a value the engine must compute, so the claim cannot pass by reading nothing.
- Score it: from `@ether/v0.ts`, `node scripts/score.mjs --check <file>`; when it is final, `--write <file>` so the
  baseline knows it. The `scorer` agent does this.
- Done means the score records it passing.
