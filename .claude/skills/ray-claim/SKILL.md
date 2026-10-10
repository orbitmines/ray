---
name: ray-claim
description: How to write and check a Ray test claim. Use when adding or changing a claim in a tests/*.ray file, or deciding whether something is done.
---

# Claims

```ray
unless (<condition>) { INFO@mark `<ID> <what should hold>` }
```

- Claims come before code: write them, see them fail, then make them hold.
- The ID is the file's prefix plus an unused number; check with `grep -rn 'INFO@mark \`<ID> ' @ether` first.
- One fact per claim; the message says what should hold.
- Prefer a condition that reads a value the engine must compute, so the claim cannot pass by reading nothing.
- Check it by running the file (`AGENTS.md`, Running a test file) and reading the diagnostics on the claim's lines.
  Also check that the claims around it still hold.
- Done means a run shows it holding: no diagnostic at all on its lines.
