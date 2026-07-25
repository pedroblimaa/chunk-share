---
name: select-review-scope
description: Give a developer a fast, high-confidence review path after AI completes an implementation. Use when the user wants to review only the few highest-leverage code decisions instead of reading the full diff.
---

# Select Review Scope

Treat the user's time and attention as limited. Inspect and validate the full implementation yourself
when needed; do not delegate normal code review back to the user.

Select only the residual code where human judgment materially improves confidence. Prioritize intent,
important tradeoffs, and behavior that would be costly to get wrong. Risk alone is not enough when the
agent can verify the code itself.

Aim for a five-to-ten-minute review, usually one to three narrow blocks. If more candidates exist,
rank them and omit the lower-value ones unless the user asks for another batch.

For each selected block:

- Re-read the current file immediately before responding and give the exact file and changed-line range.
- Start at the first relevant statement and end at the last. Exclude nearby imports, blank lines,
  unchanged setup, and function declarations unless they are part of the decision being reviewed.
- List non-contiguous relevant blocks as separate ranges, even when they are in the same function.
- Show the location in two parts. First write the basename and complete range as inline code, such as
  `file.ts:20-35`. Immediately follow it with a short separate link such as `[Open](/full/path/file.ts:20)`.
  Keep directory paths out of visible text and never omit the ending line from a multi-line range.
- State why the user's judgment is useful.
- Ask one concrete question to verify.

Do not restate the code or provide a broad walkthrough. Say clearly when no manual review is needed.
