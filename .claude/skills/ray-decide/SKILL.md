---
name: ray-decide
description: How to ask the user a design question about Ray and record the answer. Use when an item is Proposed, Open or Q, the kernel seems to need a change, or a draft contradicts a Decided item (Plan.md §2.3).
---

# Asking and recording

- First check whether the answer follows from what is already Decided; if so, write it as **Follows** with the IDs
  it follows from, and do not ask.
- Ask with AskUserQuestion: at most four questions, each with 2 to 4 options, your recommendation first with its
  reason.
- Write the answer into the spec file it belongs to, in that file's style, as **Decided** with the date. Never only in
  a memory or a transcript.
- If the answer changes how sessions work, update `AGENTS.md` or Plan.md §1 as well.
